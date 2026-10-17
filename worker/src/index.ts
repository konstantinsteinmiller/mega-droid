/**
 * ─── Mega Droid leaderboard ───────────────────────────────────────────────────────
 *
 * A Cloudflare Worker over one D1 table. Two routes:
 *
 *   GET  /top    → the materialised top-100 PLUS the score histogram for the
 *                  whole population, edge-cached for `EDGE_TTL`
 *   POST /score  → upsert one player's best, and return their rank + the board
 *
 * The histogram is what lets the client rank a player EXACTLY without asking:
 * the published rows stop at 100, so on a board of thousands almost everyone is
 * below the cut, and rows alone could only place them by guesswork.
 *
 * THE SCORE IS LIFETIME XP: every point of experience Flux has ever earned,
 * still counting after the level-40 cap. It is the POINT TOTAL (thousands to
 * hundreds of thousands) and it only ever grows, so the client writes only on
 * a personal record. `flair` is the HERO LEVEL (1–40), the depth, shown beside
 * the score and never ordered by. Keep the two straight: swapping them ranks
 * every player against the wrong quantity.
 *
 * Design rules, in the order they matter:
 *
 *   1. The client may never be blocked by this. Every response is fast or the
 *      client's own 6 s timeout gives up and the game carries on with no rank.
 *   2. The free tier is a design constraint, not a footnote. The board is
 *      materialised into ONE row (`board_cache`) so a view costs one row read
 *      instead of a hundred, and the edge cache makes most views cost zero.
 *   3. Trust nothing. The id and name are re-sanitised here even though the
 *      client already did it, and an implausible score is refused outright.
 */

export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS?: string
  SCORE_SECRET?: string
}

interface BoardEntry { rank: number; name: string; score: number; flair: number }
interface Board { updatedAt: number; total: number; entries: BoardEntry[] }

/** Rows in the published table. */
const TOP_N = 100
/** Seconds the edge may serve a stale board. */
const EDGE_TTL = 60

/**
 * How long the materialised top-N may serve before a READ rebuilds it.
 *
 * The clock that replaced "rebuild on every write". Five minutes bounds the
 * rebuild cost at ~288 × `TOP_N` rows a day whatever the players do, where the
 * old rule scaled with how many records were being set — worst exactly when the
 * game was busiest.
 */
const BOARD_TTL_MS = 5 * 60_000

/**
 * How long a successful `/top` is kept as an emergency copy.
 *
 * A SECOND edge entry, written alongside the normal one but with a day's
 * lifetime, and read only when D1 refuses. Every route here is backed by the
 * same database, so when the free tier's read allowance runs out there is
 * nothing left to answer with — including the cache table. This is the one
 * store on the Worker that is not D1, so it is the only thing that can turn
 * "the leaderboard is down" into "the leaderboard is a few hours old".
 */
const STALE_TTL = 86_400
/** One id may not write more often than this. */
const WRITE_COOLDOWN_MS = 3_000

/**
 * The only real cheat cap, and it is deliberately generous.
 *
 * SET FROM THE GAME'S ARITHMETIC, and absurdly high. The richest mission at
 * level 40 pays about 15 000 XP (kills at ×9.6 for enemy level 40, elites ×3,
 * a Master's 600 base, the boss job's 2.6× reward), and no mission clears in
 * under ~90 s: about 14 M XP for a day of unbroken play. 100 M is several days.
 *
 * It is deliberately NOT "the highest legitimate score" — a false reject
 * silently loses somebody's genuine best, which is far worse than admitting an
 * outlier on a decorative board. Never derive it from a content cap either: the
 * cap moves in an update and the Worker does not.
 */
const MAX_SCORE = 100_000_000
/** The hero level caps at 40 in the client (`MAX_LEVEL`); the headroom here is
 *  for a raised cap, which the Worker must not reject. */
const MAX_FLAIR = 1_000

const plausible = (score: number, flair: number): boolean =>
  Number.isInteger(score) && Number.isInteger(flair) &&
  score >= 0 && score <= MAX_SCORE &&
  flair >= 0 && flair <= MAX_FLAIR

/** `[a-zA-Z0-9_-]`, 8–64 — the same shape the client mints. */
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id)

/**
 * Strip the characters that let a name break a table or impersonate a rank:
 * C0/C1 controls, zero-width joiners and spaces, bidi overrides, and the BOM.
 * No profanity filter — that is a moderation policy, not a parser.
 */
const cleanName = (raw: unknown): string => {
  if (typeof raw !== 'string') return 'Anon'
  const out = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .trim()
    .slice(0, 16)
  return out.length > 0 ? out : 'Anon'
}

const corsHeaders = (env: Env, origin: string | null): Record<string, string> => {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // An empty allowlist means "any": every portal build has its own origin and a
  // sandboxed iframe sends `null`, so locking this down is opt-in per deploy.
  const ok = allowed.length === 0 || (origin !== null && allowed.includes(origin))
  return {
    'access-control-allow-origin': ok ? (origin ?? '*') : 'null',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400'
  }
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra }
  })

/**
 * Re-clothe a cached response with this request's CORS headers.
 *
 * The cached copy carries whatever origin was allowed when it was stored, and
 * every portal build serves the game from a different one — so the headers have
 * to be rewritten per request or the second portal to ask gets a body it is not
 * allowed to read.
 */
const withCors = (
  res: Response, cors: Record<string, string>, extra: Record<string, string> = {}
): Response => {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries({ ...cors, ...extra })) out.headers.set(k, v)
  return out
}

const hmac = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time compare, so a signature cannot be probed a byte at a time. */
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const readBoard = async (env: Env): Promise<Board> => {
  const row = await env.DB
    .prepare("SELECT json, updated_at FROM board_cache WHERE id = 'top'")
    .first<{ json: string; updated_at: number }>()
  if (row?.json && Date.now() - row.updated_at < BOARD_TTL_MS) {
    try { return JSON.parse(row.json) as Board } catch { /* fall through */ }
  }
  return rebuildBoard(env)
}

/**
 * Materialise the published rows.
 *
 * NOT called from the write path any more, and that is the whole of the quota
 * fix. It used to run on every score that changed anything, and with the
 * `COUNT(*)` that used to sit below it a single submission read the top hundred
 * rows AND scanned the entire table — about 2 500 rows per personal record, on
 * a free tier that allows 5 M a day. A busy afternoon exhausted it, `/top`
 * started throwing, and the game lost its leaderboard.
 *
 * Now it is a LAZY READ-SIDE rebuild on a `BOARD_TTL_MS` clock, so its cost is
 * bounded by the clock rather than by how well the players are doing. The board
 * is a motivator, not an audit: a few minutes of staleness is invisible to the
 * one person who could notice — the player who just posted — and they are shown
 * their own new best from their own save regardless.
 *
 * `total` no longer comes from `COUNT(*)`; the histogram already knows it and
 * costs one row (see `withDist`).
 */
const rebuildBoard = async (env: Env): Promise<Board> => {
  const { results } = await env.DB
    .prepare('SELECT name, score, flair FROM scores ORDER BY score DESC, updated_at ASC LIMIT ?')
    .bind(TOP_N)
    .all<{ name: string; score: number; flair: number }>()

  // Ties SHARE a rank — standard competition ranking (1, 2, 2, 4), which is
  // `COUNT(*) WHERE score > ?` + 1 evaluated positionally.
  //
  // A positional `i + 1` here would disagree with `rankFromDist`, which every
  // rank the client shows is derived from. The two are read side by side on one
  // screen: the modal lists the rows, and its footer says "You are #N". Split
  // ranks in the table mean the second of two tied players is listed as #6 while
  // being told they are #5 — the board disagreeing with itself about the one
  // number the player opened it for. Ordering still uses `updated_at` as the
  // tie-break, so who is listed first is stable; only the number is shared.
  let rank = 0
  let previousScore: number | null = null
  const entries = (results ?? []).map((r, i) => {
    if (previousScore === null || r.score < previousScore) rank = i + 1
    previousScore = r.score
    return { rank, name: r.name, score: r.score, flair: r.flair }
  })

  const board: Board = {
    updatedAt: Date.now(),
    total: 0,
    entries
  }
  await env.DB
    .prepare(
      "INSERT INTO board_cache (id, json, updated_at) VALUES ('top', ?, ?)\n" +
      'ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at'
    )
    .bind(JSON.stringify(board), board.updatedAt)
    .run()
  return board
}

/**
 * The score histogram, densest-first — `[score, howManyPlayersHaveIt]`.
 *
 * This is the one query on the Worker whose cost scales with the player base:
 * `GROUP BY score` reads every row. So it is NEVER run per request and never on
 * the write path — it is materialised into `board_cache` beside the board and
 * only recomputed once its row is older than `DIST_TTL_MS`. A read costs one
 * row; a rebuild costs the table, a few times an hour at most.
 *
 * It rides along on `/top` because of what it buys the client: an EXACT rank
 * for any score. Without it the client has to ESTIMATE the placing of every
 * player below the hundredth row — which, on a board of a few thousand, is
 * almost all of them. Sending it is a few hundred bytes; not sending it turns
 * the whole board into an approximation.
 */
// An hour, not a few minutes. A rebuild reads the whole table, and the account
// is close enough to the free tier's ceiling to have hit it — 24 rebuilds a day
// over a few thousand rows is a rounding error against the allowance, where a
// 15-minute TTL would be four times that for a histogram whose ranks move by a
// handful of places in an hour.
const DIST_TTL_MS = 60 * 60_000

const rebuildDist = async (env: Env): Promise<[number, number][]> => {
  const { results } = await env.DB
    .prepare('SELECT score, COUNT(*) AS n FROM scores GROUP BY score ORDER BY score DESC')
    .all<{ score: number; n: number }>()
  const buckets: [number, number][] = (results ?? []).map((r) => [r.score, r.n])
  await env.DB
    .prepare(
      "INSERT INTO board_cache (id, json, updated_at) VALUES ('dist', ?, ?)\n" +
      'ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at'
    )
    .bind(JSON.stringify(buckets), Date.now())
    .run()
  return buckets
}

const readDist = async (env: Env): Promise<[number, number][]> => {
  const row = await env.DB
    .prepare("SELECT json, updated_at FROM board_cache WHERE id = 'dist'")
    .first<{ json: string; updated_at: number }>()
  if (row?.json && Date.now() - row.updated_at < DIST_TTL_MS) {
    try { return JSON.parse(row.json) as [number, number][] } catch { /* fall through */ }
  }
  return rebuildDist(env)
}

const sumDist = (dist: [number, number][]): number =>
  dist.reduce((sum, [, n]) => sum + n, 0)

/**
 * The board as the client receives it: rows to list, plus the histogram to rank
 * against.
 *
 * `total` is taken from the HISTOGRAM whenever there is one, not from the
 * board's own `COUNT(*)`. The two are separate reads of a moving table, and a
 * rank derived from the buckets has to be a rank out of the number those
 * buckets add up to — otherwise the game can print "#1204 of 1203".
 *
 * The mirror image of that trap is handled below: the histogram must also never
 * report FEWER players than the rows shipped alongside it.
 */
const withDist = async (env: Env, board: Board): Promise<Board & { dist: [number, number][] }> => {
  // ── A board smaller than the cut IS its own histogram ───────────────────
  //
  // The rows come from `ORDER BY score DESC LIMIT TOP_N`. If that query did not
  // fill, the rows ARE the whole table — so the histogram can be derived from
  // them exactly, for free, and it then tracks the board's clock instead of the
  // much slower histogram one.
  //
  // This is a correctness fix, not a micro-optimisation. The two caches run on
  // very different clocks (`BOARD_TTL_MS` vs `DIST_TTL_MS`), so a board whose
  // population changes materially inside an hour will PUBLISH ROWS IT DOES NOT
  // COUNT. Observed live on a new board at three rows and `total: 1`, which the
  // game rendered as three names above "You are #1 of 1 players" — a board
  // contradicting itself, in a game's launch window, which is exactly when
  // every board is small and every player is new. Past TOP_N players the
  // materialised histogram takes over and an hour of drift is invisible.
  //
  // It also saves the `dist` row read on precisely the boards that can least
  // afford a full-table `GROUP BY`.
  if (board.entries.length < TOP_N) {
    const counts = new Map<number, number>()
    for (const e of board.entries) counts.set(e.score, (counts.get(e.score) ?? 0) + 1)
    const dist = [...counts.entries()].sort((a, b) => b[0] - a[0]) as [number, number][]
    return { ...board, total: board.entries.length, dist }
  }

  const dist = await readDist(env)
  // Never publish a population smaller than the number of rows in the same
  // response — the same invariant as "#1204 of 1203", from the other side.
  const total = Math.max(sumDist(dist) || board.total, board.entries.length)
  return { ...board, total, dist }
}

/**
 * Ties share a rank rather than being split — `COUNT(*) WHERE score > ?` + 1.
 *
 * Computed over the cached HISTOGRAM rather than by scanning the index, so it
 * costs the one row the histogram already occupies instead of walking every
 * score above the player. Same arithmetic, same answer, against a population
 * that may be up to `DIST_TTL_MS` old — which cannot mislead the only person
 * who reads it, because a rank is a motivator and an hour of new sign-ups moves
 * it by a place or two.
 */
const rankOf = (dist: [number, number][], score: number): number => {
  let above = 0
  for (const [bucketScore, n] of dist) {
    if (bucketScore <= score) break
    above += n
  }
  return above + 1
}

// ── #176 cover vote ─────────────────────────────────────────────────────────
// The vote page (cover-vote/ on GitHub Pages) sends every cover's rating in
// one POST once the voter has rated them all, and only then sees the totals.

/** The covers on the ballot; a rating for anything else is refused. */
const COVER_IDS = /^[a-z0-9-]{1,32}$/
const MAX_COVERS = 40

const coverTotals = async (env: Env) => {
  const { results } = await env.DB
    .prepare('SELECT cover, COUNT(*) AS n, AVG(half) AS avg FROM cover_votes GROUP BY cover')
    .all<{ cover: string; n: number; avg: number }>()
  const voters = await env.DB.prepare('SELECT COUNT(DISTINCT voter) AS v FROM cover_votes').first<{ v: number }>()
  return {
    voters: voters?.v ?? 0,
    covers: Object.fromEntries((results ?? []).map((r) => [r.cover, { n: r.n, stars: Math.round((r.avg / 2) * 100) / 100 }]))
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('origin')
    const cors = corsHeaders(env, origin)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    // ── GET /top ──
    if (request.method === 'GET' && url.pathname === '/top') {
      const cache = caches.default
      const cacheKey = new Request(new URL('/top', url.origin).toString(), { method: 'GET' })
      const staleKey = new Request(new URL('/top-stale', url.origin).toString(), { method: 'GET' })

      const hit = await cache.match(cacheKey)
      if (hit) return withCors(hit, cors)

      try {
        const board = await withDist(env, await readBoard(env))
        const fresh = json(board, 200, { 'cache-control': `public, max-age=${EDGE_TTL}` })
        await cache.put(cacheKey, fresh.clone())
        // The emergency copy, refreshed on every successful read. Same body, a
        // day's lifetime, and nothing reads it unless the database says no.
        await cache.put(
          staleKey,
          json(board, 200, { 'cache-control': `public, max-age=${STALE_TTL}` })
        )
        return withCors(fresh, cors)
      } catch {
        // D1 is refusing — out of quota, or simply down. Serve the last board
        // that worked rather than an error: a stale leaderboard is a
        // leaderboard, and a 500 costs the game its rank cell.
        const stale = await cache.match(staleKey)
        if (stale) return withCors(stale, cors, { 'x-board-stale': '1' })
        // Nothing cached either. Say so honestly with a status the client reads
        // as a failure, so it drops to its own baked snapshot instead of
        // adopting an empty board as if it were real.
        return json({ error: 'unavailable' }, 503, cors)
      }
    }

    // ── POST /score ──
    if (request.method === 'POST' && url.pathname === '/score') {
     try {
      let body: Record<string, unknown>
      try {
        body = (await request.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'bad json' }, 400, cors)
      }

      const id = body.id
      const score = Number(body.score)
      const flair = Number(body.flair)
      const name = cleanName(body.name)

      if (!validId(id)) return json({ error: 'bad id' }, 400, cors)
      if (!plausible(score, flair)) return json({ error: 'implausible' }, 422, cors)

      if (env.SCORE_SECRET) {
        const expected = await hmac(env.SCORE_SECRET, `${id}:${score}:${flair}`)
        if (typeof body.sig !== 'string' || !safeEqual(body.sig, expected)) {
          return json({ error: 'bad signature' }, 401, cors)
        }
      }

      const now = Date.now()
      const existing = await env.DB
        .prepare('SELECT name, score, updated_at FROM scores WHERE id = ?')
        .bind(id)
        .first<{ name: string; score: number; updated_at: number }>()

      if (existing && now - existing.updated_at < WRITE_COOLDOWN_MS) {
        return json({ error: 'too fast' }, 429, cors)
      }

      // Three outcomes, deliberately not one `ON CONFLICT`: a new player, a new
      // record, and "same score, different name" are different writes, and the
      // third must not touch the score or its timestamp (which would jump the
      // player ahead of everyone they were tied with).
      let best = existing?.score ?? 0
      let changed = false
      if (!existing) {
        await env.DB
          .prepare('INSERT INTO scores (id, name, score, flair, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, name, score, flair, now)
          .run()
        best = score
        changed = true
      } else if (score > existing.score) {
        await env.DB
          .prepare('UPDATE scores SET name = ?, score = ?, flair = ?, updated_at = ? WHERE id = ?')
          .bind(name, score, flair, now, id)
          .run()
        best = score
        changed = true
      } else if (existing.name !== name) {
        await env.DB.prepare('UPDATE scores SET name = ? WHERE id = ?').bind(name, id).run()
        changed = true
      }

      // NEITHER rebuilds the board NOR busts the edge cache any more.
      //
      // Both used to happen on every score that changed anything, and together
      // they were the whole quota problem: the rebuild scanned the table, and
      // the cache delete then guaranteed the next reader could not be served
      // from the edge and had to scan it again. The board now rebuilds on a
      // clock (`BOARD_TTL_MS`) and the edge entry expires on its own, so a
      // record costs one indexed lookup, one write and two cached rows.
      //
      // The player who just posted is the only one who could notice, and they
      // are shown their own new best from their own save either way.
      const board = await withDist(env, await readBoard(env))
      return json(
        { rank: rankOf(board.dist, best), best, total: board.total, board },
        200,
        cors
      )
     } catch {
      // The database refused. An unhandled throw here is error 1101 with an
      // HTML body, which the client can only read as "something broke"; a 503
      // is the same outcome stated in the vocabulary it already handles, so it
      // keeps the run's score locally and retries on the next one.
      return json({ error: 'unavailable' }, 503, cors)
     }
    }


    // ── GET /covers ── the totals (the page shows them only after a full ballot)
    if (request.method === 'GET' && url.pathname === '/covers') {
      try {
        return json(await coverTotals(env), 200, cors)
      } catch {
        return json({ error: 'unavailable' }, 503, cors)
      }
    }

    // ── POST /covers ── { voter, ratings: { <cover>: halfStars 1..10 } }
    if (request.method === 'POST' && url.pathname === '/covers') {
      try {
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ error: 'bad json' }, 400, cors)
        }
        if (!validId(body.voter)) return json({ error: 'bad voter' }, 400, cors)
        const ratings = body.ratings as Record<string, unknown> | null
        if (!ratings || typeof ratings !== 'object') return json({ error: 'bad ratings' }, 400, cors)
        const rows = Object.entries(ratings)
        if (!rows.length || rows.length > MAX_COVERS) return json({ error: 'bad ratings' }, 400, cors)
        for (const [cover, half] of rows) {
          if (!COVER_IDS.test(cover) || !Number.isInteger(half) || (half as number) < 1 || (half as number) > 10) {
            return json({ error: 'bad rating' }, 400, cors)
          }
        }
        const now = Date.now()
        const upsert = env.DB.prepare(
          'INSERT INTO cover_votes (voter, cover, half, updated_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(voter, cover) DO UPDATE SET half = excluded.half, updated_at = excluded.updated_at'
        )
        await env.DB.batch(rows.map(([cover, half]) => upsert.bind(body.voter, cover, half, now)))
        return json(await coverTotals(env), 200, cors)
      } catch {
        return json({ error: 'unavailable' }, 503, cors)
      }
    }

    return json({ error: 'not found' }, 404, cors)
  }
}
