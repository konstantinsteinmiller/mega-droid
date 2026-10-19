import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { POSTED_NAME_KEY, SUBMITTED_SCORE_KEY } from '@/keys'
import { resolveIdentity, type PlayerIdentity } from '@/use/usePlayerIdentity'
import { boardSnapshot, rankFromDist } from '@/use/leaderboardSnapshot'
import { LEGACY_KEYS, migrateLegacyKey } from '@/legacyKeys'
import { portalBoardVisible } from '@/use/usePortalLeaderboard'

/**
 * ─── The global board, client side ──────────────────────────────────────────
 *
 * DECIDE WHAT `score` MEANS BEFORE YOU WRITE A LINE OF THIS, and write it here.
 * It is the one number the whole board is ordered by, and it must be MONOTONIC
 * — a lifetime best that only ever goes up (deepest stage reached, highest
 * level, longest survival), never a per-run total that can go down. The write
 * rule below ("only on a personal record") is built on that and quietly breaks
 * without it.
 *
 * `flair` is the second column: a number that is not what the board is ordered
 * by but tells two tied players apart (the biggest squad they assembled, the
 * furthest wave, the most kills). Rename both to whatever they are in this
 * game — the DB column names are arbitrary, the semantics are not.
 *
 * ONE RULE ABOVE ALL: NOTHING IN HERE MAY EVER THROW, BLOCK OR DELAY A RUN.
 * Every network call is wrapped, every failure is swallowed, every entry point
 * returns a resolved promise. The board is a decoration on a game that works
 * perfectly without it — a dead endpoint, a captive-portal wifi login page
 * answering 200 with HTML, a portal iframe with no network at all, all have to
 * end in "no rank shown" and nothing else. That is why `reportRun` is called
 * with `void` and never awaited at the call site.
 *
 * THE SECOND RULE IS THE QUOTA. This ships on Cloudflare's free tier against a
 * D1 database, and a client that posts at the end of every run would cost one
 * write per ~40 s of play per player. So: read the board at most once per page
 * load, and write ONLY when the player beat their own posted record. See
 * `reportRun`, which is the only function the game itself calls.
 */

/** Trailing slashes stripped so `${ENDPOINT}/top` can never become `//top` —
 *  the worker matches on an exact pathname and would 404 the double slash. */
const ENDPOINT: string = (import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/+$/, '')
/** Optional shared secret. Empty on every build that has not been given one,
 *  and the worker only demands a signature when it has one of its own. */
const SECRET: string = import.meta.env.VITE_LEADERBOARD_SECRET ?? ''

/**
 * Is there a live endpoint to talk to?
 *
 * GATES EVERY NETWORK CALL IN THIS FILE, and it is deliberately no longer the
 * same question as "does the game have a leaderboard". The portals that refuse
 * the request build with the URL empty — Poki forbids every external runtime
 * request, Yandex rejects third-party storage URLs at moderation — and they now
 * ship a BAKED board rather than no board at all.
 *
 * So `ensureBoard`, `submitScore` and `reportRun` gate on this; everything the
 * player can see gates on `leaderboardEnabled`. Confusing the two would post a
 * run to `''`.
 */
const LIVE: boolean = ENDPOINT.length > 0

/**
 * Rank a player who has no score yet as LAST (`total + 1`) instead of showing
 * no rank. Per build — survivalist turns it on for Playgama. See `rankFor`.
 */
const UNPLAYED_LAST: boolean = import.meta.env.VITE_LEADERBOARD_UNPLAYED_LAST === 'true'

/**
 * Does this build have a board at all — live or baked?
 *
 * What the HUD button, the modal and the result screen's rank chip read. With
 * neither, the feature is absent rather than broken: every UI entry point
 * switches off together and `rankFor` returns 0, which hides the cell.
 */
export const leaderboardEnabled: boolean = LIVE || boardSnapshot !== null

/**
 * May the top-100 LIST be shown? Only on a build with a live endpoint.
 *
 * The builds without one (Poki, Yandex, Playgama) bake a MODELLED population:
 * exact enough to place a player ("#1,204 of 2,531"), but its rows would be
 * invented people. The owner's call (2026-09-24): those builds show the rank
 * badge and no list at all, and the seed carries no rows to show.
 */
export const leaderboardListEnabled: boolean = LIVE

/**
 * May the hub open the leaderboard MODAL (the pill, the Hall of Fame terminal)?
 *
 * Wherever our list may be shown, and also where the portal runs a live board
 * of its own (Playgama's SaaS, `in_game`) that read back as a board: real
 * players there, so the owner's call (2026-10-19) opens the modal on those
 * builds with ONLY the portal's tab. Our baked list stays hidden — see
 * `leaderboardListEnabled`. A failed portal read takes it away again.
 */
export const boardModalEnabled: ComputedRef<boolean> = computed(() => LIVE || portalBoardVisible.value)

/**
 * 6 s, matching the worker's own budget note.
 *
 * Long enough for a cold D1 read over a bad mobile connection, short enough
 * that a hung socket cannot keep an `await` alive across the whole result
 * screen. Nothing waits on these promises, so the timeout exists to stop the
 * request leaking rather than to keep the UI responsive.
 */
const TIMEOUT_MS = 6000

interface BoardEntry {
  rank: number
  name: string
  score: number
  flair: number
}

interface Board {
  updatedAt: number
  total: number
  entries: BoardEntry[]
  /**
   * `[score, howManyPlayersHaveIt]`, score-DESC, over the WHOLE population.
   *
   * The published `entries` stop at a hundred rows; this does not. It is what
   * turns "#100+" — which on a board of thousands is nearly every player — into
   * a real number like "#1130 of 2345". Optional only because a board cached by
   * an older build predates it; the next successful read replaces it.
   */
  dist?: [number, number][]
}

// ─── State ──────────────────────────────────────────────────────────────────

const board: Ref<Board | null> = ref(null)
/** The rank the SERVER computed for our last submission. Authoritative for the
 *  score it was computed against, and for nothing else — see `rankFor`. */
const serverRank = ref(0)
/** The score that rank belongs to (the server's `best`, not what we sent). */
const submittedScore = ref(0)
const total = ref(0)
const pending = ref(false)
const failed = ref(false)

export const leaderboard: ComputedRef<Board | null> = computed(() => board.value)
export const playerRank: ComputedRef<number> = computed(() => serverRank.value)
export const playerTotal: ComputedRef<number> = computed(() => total.value)

/**
 * The population a `rankFor(score)` answer is "of". Equal to `playerTotal`
 * except for an unplayed player on a build that ranks them last
 * (`UNPLAYED_LAST`): they are placed at `total + 1`, so they are counted in —
 * otherwise the chip reads "#7,832 of 7,831". A plain function reading refs, so
 * a computed or template calling it tracks both the score and the board.
 */
export const rankTotalFor = (score: number): number =>
  UNPLAYED_LAST && score <= 0 && board.value !== null && total.value > 0 ? total.value + 1 : total.value
export const leaderboardPending: ComputedRef<boolean> = computed(() => pending.value)
export const leaderboardFailed: ComputedRef<boolean> = computed(() => failed.value)
/** Rows actually published — the length of the slice the server chose to send,
 *  not a number hardcoded anywhere. Read by the estimator below and by tests;
 *  no player-facing string is built from it. */
export const boardSize: ComputedRef<number> = computed(() => board.value?.entries.length ?? 0)
/**
 * Which rung of the offline ladder the board on screen came from.
 *
 * QA, tests and the debug HUD only — deliberately never surfaced to the player.
 * Telling them the board is a few days old is the "notice" this whole mechanism
 * exists to avoid; they are looking for their rank, and it is the same rank.
 */
export const boardProvenance = (): 'live' | 'cache' | 'snapshot' | null => boardSource

/**
 * Resolved once per page load and reused.
 *
 * `resolveIdentity` is idempotent, but it also writes the id back to the save
 * blob and flushes — doing that on every submission would fire a cloud push per
 * post for a value that cannot change during a session.
 */
let identityPromise: Promise<PlayerIdentity> | null = null
const identity = (): Promise<PlayerIdentity> => (identityPromise ??= resolveIdentity())

// ─── Transport ──────────────────────────────────────────────────────────────

/** `fetch` with a hard deadline. An `AbortController` rather than a racing
 *  `setTimeout`, so a timed-out request actually stops instead of leaving a
 *  socket and a pending promise behind on a phone that just lost signal. */
const withTimeout = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Lowercase hex HMAC-SHA256, byte-for-byte what the worker recomputes. */
const sign = async (message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** @returns whether `next` was a board and was adopted. The caller needs to
 *  know: a shape it rejected is a FAILURE, not a quiet no-op, and it must not
 *  be written to the cache or counted as a successful read. */
const adoptBoard = (next: unknown): boolean => {
  // The response is remote input: a portal's captive proxy can answer 200 with
  // an HTML login page, and `JSON.parse` succeeding proves nothing about shape.
  if (!next || typeof next !== 'object') return false
  const raw = next as Partial<Board>
  if (!Array.isArray(raw.entries)) return false
  board.value = {
    updatedAt: Number(raw.updatedAt) || 0,
    total: Number(raw.total) || raw.entries.length,
    entries: raw.entries
      .filter((e): e is BoardEntry => !!e && typeof e === 'object')
      .map((e, i) => ({
        rank: Number(e.rank) || i + 1,
        name: typeof e.name === 'string' ? e.name : '',
        score: Number(e.score) || 0,
        flair: Number(e.flair) || 0
      })),
    // Remote input like everything else: each bucket must be a pair of finite
    // numbers or the rank walk silently returns nonsense.
    dist: Array.isArray(raw.dist)
      ? raw.dist
        .filter((b): b is [number, number] =>
          Array.isArray(b) && b.length === 2 &&
          Number.isFinite(Number(b[0])) && Number.isFinite(Number(b[1])))
        .map(([sc, n]) => [Number(sc), Number(n)] as [number, number])
      : undefined
  }
  // A population smaller than the rows we are holding is not a population.
  //
  // The Worker enforces this too, but the board here can also come off a
  // localStorage cache banked by an OLDER Worker, or an older baked snapshot,
  // and neither can be re-issued. Left alone it renders as a list of names above
  // "You are #1 of 1 players" — seen live, and it reads as a broken game rather
  // than a stale count.
  if (board.value.total < board.value.entries.length) {
    board.value.total = board.value.entries.length
  }
  total.value = board.value.total
  return true
}

// ─── The offline ladder ─────────────────────────────────────────────────────
//
// THE BOARD MUST NEVER LOOK BROKEN. It is a decoration, and a decoration that
// says "Couldn't reach the leaderboard" has failed twice — once at the request
// and once at the player, who reads it as a bug in the game rather than a quiet
// afternoon on someone's free tier. (It is not hypothetical: the Worker's D1
// row-read allowance ran out mid-day and `/top` threw for every live build.)
//
// So there are three sources, strongest first, and the game shows the best one
// it has WITHOUT ever announcing which:
//
//   1. this session's live fetch  — current
//   2. the cache from a previous session — hours or days old
//   3. the snapshot baked at build time — weeks old, but it always exists
//
// Only the top rung needs a network. The other two are why a player who opens
// the board on a plane, behind Edge's tracking prevention, or on the day the
// quota ran out, sees a leaderboard rather than an apology.

type BoardSource = 'live' | 'cache' | 'snapshot' | null
let boardSource: BoardSource = null
/** Whether THIS session has a live board. Distinct from `board.value !== null`,
 *  which is now true from boot on most devices — without the split, restoring
 *  the cache would convince `ensureBoard` it had already read and no session
 *  would ever refresh. */
let fetched = false

/**
 * Deliberately NOT a `ma_`-prefixed key and not a field inside `ma_state`.
 *
 * Both of those round-trip to the platform's cloud save (see `isPayloadKey`),
 * and this is a ~6 kB cache of PUBLIC data that is identical for every player.
 * Syncing it would pay for the same hundred rows once per player, on every
 * save, against Poki's 1 MB ceiling — to protect a device that has its own copy
 * anyway. It is a per-device cache, so it lives per-device. Renamed with the
 * game (Mega Adventure → Mega Droid); a pre-rename cache is moved over before
 * the seed below reads it (`src/legacyKeys.ts`), so a returning player's first
 * board still comes up without a spinner.
 */
const BOARD_CACHE_KEY = 'mega_droid_board_cache'

migrateLegacyKey(LEGACY_KEYS.BOARD_CACHE, BOARD_CACHE_KEY)

const readBoardCache = (): Board | null => {
  try {
    const raw = localStorage.getItem(BOARD_CACHE_KEY)
    return raw ? JSON.parse(raw) as Board : null
  } catch {
    // Private mode, a corrupt entry, or no storage at all. No cache is a
    // supported state; it just means the ladder starts a rung lower.
    return null
  }
}

const writeBoardCache = (b: Board): void => {
  try {
    localStorage.setItem(BOARD_CACHE_KEY, JSON.stringify(b))
  } catch { /* quota or private mode — the live board is still on screen */ }
}

/**
 * Stand the best offline board up at module load, before anything renders.
 *
 * This is what removes the spinner and the error state from a returning
 * player's experience entirely: `pending` and `failed` are both still false and
 * the table is already populated, so the modal opens onto rows and the result
 * chip has a rank from the first result screen of the session. When the live fetch lands
 * a moment later it silently replaces all of it.
 */
const seedOfflineBoard = (): void => {
  if (!LIVE) {
    // Nothing to wait for. The snapshot IS the board here.
    if (boardSnapshot && adoptBoard(boardSnapshot)) boardSource = 'snapshot'
    return
  }
  // On a live build, only the CACHE may be seeded up front — never the
  // snapshot. Both rank the same way now, but against different populations
  // (the snapshot's is weeks old), and seeding it would show a rank out of the
  // stale total that then shifts when the live board lands. There is nothing to
  // buy by it either: a player's rank is hidden until they have a score at
  // all, by which time the fetch has long resolved. The snapshot is reached
  // only once a fetch has actually failed, where nothing can contradict it.
  const cached = readBoardCache()
  if (cached && adoptBoard(cached)) boardSource = 'cache'
}

/** Last rung, taken only when a read failed and nothing else is on screen. */
const fallBackToSnapshot = (): void => {
  if (board.value !== null || !boardSnapshot) return
  if (adoptBoard(boardSnapshot)) boardSource = 'snapshot'
}

seedOfflineBoard()

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Load the published top-100, once.
 *
 * Guarded on three things and all three matter: disabled builds never touch the
 * network, an already-loaded board is never re-fetched (the quota rule), and a
 * request in flight is never duplicated by a second caller — the modal and the
 * result screen both ask, and on a slow connection they ask at the same time.
 *
 * A previous FAILURE is deliberately not remembered as "loaded", so reopening
 * the modal retries. That is the one retry the player can ask for, and it costs
 * one edge-cached GET.
 */
export const ensureBoard = async (): Promise<void> => {
  // `fetched`, not `board.value !== null` — the offline ladder has usually
  // already put a board on screen, and testing the value would mean a device
  // with a cache never refreshed it again.
  if (!LIVE || fetched || pending.value) return
  pending.value = true
  try {
    // No headers at all, on purpose: any request header beyond the CORS-safelist
    // turns this into a preflighted request and doubles the round trips for a
    // read that carries no credentials.
    const res = await withTimeout(`${ENDPOINT}/top`)
    if (!res.ok) {
      failed.value = true
      fallBackToSnapshot()
      return
    }
    // A rejected SHAPE is a failure too — a captive portal answering 200 with a
    // login page used to leave `failed` false and the board untouched, which
    // read as "loaded, and empty".
    if (!adoptBoard(await res.json())) {
      failed.value = true
      fallBackToSnapshot()
      return
    }
    boardSource = 'live'
    fetched = true
    // Banked for the next session, whatever it meets. This is the only place a
    // cache is written from a read; `submitScore` writes the other one.
    if (board.value) writeBoardCache(board.value)
    failed.value = false
  } catch {
    failed.value = true
    fallBackToSnapshot()
  } finally {
    pending.value = false
  }
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Post one score and adopt whatever the server says about it.
 *
 * Returns whether the row is now on the server — the caller only records the
 * score as posted after a `true`, so a failed write is retried on the next run
 * instead of being silently forgotten.
 */
export const submitScore = async (score: number, flair: number): Promise<boolean> => {
  if (!LIVE) return false
  pending.value = true
  try {
    const { id, name } = await identity()
    const body: Record<string, unknown> = { id, name, score, flair }
    // Only when this build was given a secret. An unsigned request against a
    // worker with `SCORE_SECRET` set is a 401; a signed one against a worker
    // without it is simply ignored — so the two sides can be rolled out in
    // either order.
    if (SECRET.length > 0) body.sig = await sign(`${id}:${score}:${flair}`)

    const res = await withTimeout(`${ENDPOINT}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      failed.value = true
      return false
    }
    const data = await res.json() as { rank?: number; best?: number; total?: number; board?: unknown }
    serverRank.value = Number(data.rank) || 0
    // The server's `best`, not what we sent: a re-post that only relabelled the
    // row comes back with the row's existing score, and pinning the rank to the
    // score we posted would let `rankFor` claim a rank the server never gave.
    submittedScore.value = Number(data.best) || 0
    if (data.total !== undefined) total.value = Number(data.total) || 0
    // A `/score` reply carries the fresh board too, so a submitting player
    // refreshes the cache without a second request. `data.board` is optional —
    // a rejected shape here is normal and must not be treated as a failure.
    if (adoptBoard(data.board)) {
      boardSource = 'live'
      fetched = true
      if (board.value) writeBoardCache(board.value)
    }
    failed.value = false
    return true
  } catch {
    failed.value = true
    return false
  } finally {
    pending.value = false
  }
}

/**
 * A run posts at most this often, however many records it sets.
 *
 * `reportRun` fires on every cleared stage/level, and a good run beats its own
 * best on nearly all of them — a climb to level 42 was up to forty-two POSTs,
 * each a write and a rate-limit check on a free tier. Since every post carries
 * the CURRENT best rather than a delta, skipping one loses nothing: the next
 * carries the higher number, so the throttle coalesces rather than drops.
 *
 * The run's END bypasses it (`force`), so the score a player finished on is
 * always the score the board gets.
 */
const WRITE_MIN_GAP_MS = 180_000
/** When the last write was ATTEMPTED — success or not. A backend that is
 *  refusing must not be asked again on the next clear. */
let lastWriteAt = 0

/**
 * THE ENTRY POINT. Called once per finished run, with `void`, never awaited.
 *
 * Read once per page load, write only on a personal record — that sentence is
 * the entire quota design, and this function is where it is enforced:
 *
 *   • BEAT YOUR OWN POSTED BEST → exactly one POST, and the new best is only
 *     remembered after the server confirmed it. A write that failed has to be
 *     retried by the next run, not lost.
 *   • RENAMED SINCE THE LAST POST → one POST of the SAME score, purely to
 *     relabel the row. The worker special-cases this and touches only the name,
 *     so the player does not jump ahead of everyone they were tied with.
 *   • NEITHER → no write at all, and at most one read for the whole session
 *     (`ensureBoard` no-ops once the board is in hand).
 *
 * A player grinding the same score for an hour therefore costs one GET,
 * served from the edge cache.
 */
export const reportRun = async (
  bestScore: number, bestFlair: number, o: { force?: boolean } = {}
): Promise<void> => {
  // (The portal's own board — Phase 8 — is NOT reported from here. It posts on
  // its own bookkeeping, from `finishMission`: see `reportPortalBest`.)

  // A baked build has nothing to report TO. The rank it shows comes from the
  // snapshot, which no run can change, so this is the one entry point that stays
  // switched off where `leaderboardEnabled` is true.
  if (!LIVE) return
  try {
    // Both numbers come off the save blob, which a cloud restore can hand back
    // anything for, and the worker rejects a non-integer outright.
    const score = Math.max(0, Math.trunc(Number(bestScore) || 0))
    const flair = Math.max(0, Math.trunc(Number(bestFlair) || 0))
    const posted = Math.max(0, Math.trunc(Number(getState(SUBMITTED_SCORE_KEY, 0)) || 0))
    const { name } = await identity()

    // The first record of a session goes straight out; the rest wait their turn
    // unless this is the end of the run.
    const due = o.force === true || lastWriteAt === 0 ||
      Date.now() - lastWriteAt >= WRITE_MIN_GAP_MS

    if (score > posted && due) {
      lastWriteAt = Date.now()
      if (await submitScore(score, flair)) {
        setState(SUBMITTED_SCORE_KEY, score)
        setState(POSTED_NAME_KEY, name)
      }
    } else if (posted > 0 && due && getState<string>(POSTED_NAME_KEY, '') !== name) {
      lastWriteAt = Date.now()
      if (await submitScore(posted, flair)) setState(POSTED_NAME_KEY, name)
    }

    // HOWEVER the run was reported, end with a board to rank against.
    //
    // This used to `return` after a write, and that hid the rank in the one
    // case the player cares about most. A personal record takes the write path,
    // so a device with no cache yet — a fresh QA profile, a first session —
    // reached the result screen having only ever tried a POST. When that POST
    // failed nothing had ever loaded a board, `rankFor` returned 0, and the
    // badge hid itself. The offline ladder existed and was simply never
    // reached: only `ensureBoard` climbs it.
    //
    // It costs nothing on the happy path — a successful write brings the board
    // back with it and sets `fetched`, so this no-ops. On a failed write it is
    // one edge-cached GET, which can still succeed where the POST could not
    // (`/top` is served from the edge; `/score` must reach the database), and if
    // that fails too its own failure path drops to the baked snapshot.
    await ensureBoard()
  } catch {
    // Unreachable in practice — everything above already swallows — but this is
    // the function the game calls without awaiting, and an unhandled rejection
    // here would surface as a console error on a player's first finished run.
    //
    // `identity()` is the one call here that can throw before anything has
    // loaded a board, so the last rung is taken here too. A run must never end
    // with no rank because minting a player id went wrong.
    fallBackToSnapshot()
  }
}

// ─── Ranking ────────────────────────────────────────────────────────────────

/**
 * ─── The estimate, and why there is no "#100+" ──────────────────────────────
 *
 * A PLAYER IS NEVER SHOWN "#100+". It is not a placing, it is the game
 * admitting it did not look — and it lands hardest on the players who need the
 * number most, because the hundredth published row sits far above where a first
 * session ever reaches. A best-effort number that is roughly right beats an
 * exact non-answer every time: nobody can tell #1130 from #1180, and everybody
 * can tell both from "past the end".
 *
 * WHEN THIS RUNS: only when there is no histogram ANYWHERE — not on the board
 * in hand, and no baked snapshot to borrow one from. Every rung above answers
 * exactly, and the snapshot ships with every build, so in practice this is the
 * legacy path: a cache banked by a build that predates the histogram, on a
 * device that has not fetched since. It is the floor of the design, not a
 * routine code path, and it is written to be plausible rather than clever.
 *
 * ── The model ──
 *
 * Two anchors are actually known:
 *
 *   • the last published row  → score `cut`,   rank `published`
 *   • the bottom of the board → score `FLOOR`, rank ≈ `total × FLOOR_SHARE`
 *
 * and rank grows roughly geometrically as the score falls, so interpolate
 * between them in LOG space, with `x = (cut − score) / (cut − FLOOR)`:
 *
 *   rank(score) = published × (floorRank / published) ^ (x ^ CURVE)
 *
 * Both constants earn their place; neither is a knob to fiddle with.
 *
 * `FLOOR_SHARE` — the bottom anchor is NOT `total`. The lowest score is a
 * single enormous tied bucket (everyone who bounced in the first minute), and
 * every one of them shares one rank. On the reference board that bucket is 721
 * of 2 422 players, so the worst placing anyone actually holds is #1702 — 70 %
 * of the total, not 100 %. Anchoring at `total` tells 721 people they came
 * last, which is both wrong and the most demoralising thing this feature could
 * say.
 *
 * `CURVE` — a straight line in log space between two anchors overshoots a
 * convex curve everywhere in the middle, and this curve is strongly convex:
 * ranks crawl just below the cut and then run away near the floor. Bending it
 * with `x ^ 1.5` takes the mean error on the reference board from 43 % to 10 %
 * and the worst from 82 % to 23 %. The basin is wide — anything from 1.4 to 1.8
 * lands within a few points — so this is a shape, not a fitted magic number.
 *
 * ── What it is worth ──
 *
 * On the board it was calibrated against (2 422 players, 100 published rows,
 * cut at score 13) it is within 23 % everywhere and 10 % on average, and it errs
 * mildly PESSIMISTIC by design: when an exact rank does arrive it is usually
 * better than the guess, and "you are higher than we thought" is the safe
 * direction to be wrong in. On a distribution with a very different shape —
 * near-uniform scores, or a much heavier bottom — it can be off by 2×. That is
 * a plausible placing, not a measurement, and it is still worth far more than
 * "#100+". If a project wants better, it already has the answer: bake the
 * snapshot (it is free, and wired into every build) and this never runs.
 *
 * @returns a 1-based rank, or `0` when there are not enough anchors to guess
 *   from — a board with no rows, or one that is its own whole population.
 */
const SCORE_FLOOR = 1
const FLOOR_SHARE = 0.7
const CURVE = 1.5

const estimateRank = (entries: BoardEntry[], total: number, score: number): number => {
  const published = entries.length
  // No rows to anchor on, or the rows already ARE everybody — in the second
  // case the caller counted exactly and never reached this.
  if (published === 0 || total <= published) return 0

  const cut = entries[published - 1]?.score ?? 0
  // The published tail already reaches the floor, so the curve has no room to
  // run: everyone below the cut is bunched into the bottom of the board.
  if (cut <= SCORE_FLOOR) return total

  const floorRank = Math.max(published + 1, Math.round(total * FLOOR_SHARE))
  const x = Math.min(1, Math.max(0, (cut - score) / (cut - SCORE_FLOOR)))
  const guess = Math.round(published * Math.pow(floorRank / published, Math.pow(x, CURVE)))
  if (!Number.isFinite(guess)) return total
  // Never a place inside the published rows it is standing in for, and never a
  // player who is not on the board.
  return Math.min(total, Math.max(published + 1, guess))
}

/**
 * The estimate this session already showed, pinned.
 *
 * An estimate is a function of the BOARD as well as the score, and the board
 * moves underneath it — a `/score` reply carrying fresh rows, a refresh landing
 * mid-session. Recomputing would let one score answer #1130 on one screen and
 * #1190 on the next, which reads as the game guessing (it is) rather than as a
 * placing. So the first answer for a score is the answer for the session.
 *
 * The second clause is the one worth keeping: a player whose score improved may
 * never be shown a worse number than they were shown for a lower one. Within a
 * single board the curve guarantees that; across a board change it does not,
 * and "you cleared another stage, here is a worse rank" is the single most
 * broken thing this feature can say.
 *
 * In memory only, never localStorage: it is a guess made from a board that was
 * already stale, and the next session deserves a fresh one — most likely an
 * exact one, since any successful read retires this path entirely.
 */
let pinnedEstimate: { score: number; rank: number } | null = null

const pinEstimate = (score: number, rank: number): number => {
  const pin = pinnedEstimate
  if (pin) {
    if (score === pin.score) return pin.rank
    if (score > pin.score && rank > pin.rank) rank = pin.rank
  }
  pinnedEstimate = { score, rank }
  return rank
}

/**
 * What rank a score would hold, best-effort.
 *
 * The server's answer wins for the score it was computed against and for no
 * other — `score === submittedScore`, an EXACT match. A player who posted 12
 * and is now looking at 5 is not still rank 40; and with `>=` rather than `===`
 * a player who posted at 10 and climbed to 42 keeps being shown the rank they
 * held at 10, because every later score still satisfies it. That second half
 * stays hidden for as long as the client posts on every clear, and surfaces the
 * day a write throttle is added.
 *
 * Otherwise derive it from the cached table, counting STRICTLY greater scores
 * so ties share a rank exactly as the worker's `COUNT(*) WHERE score > ?` does.
 * Two players on 40 are both #7; nobody is #8 because they arrived later.
 *
 * @returns a 1-based rank — exact where anything can say exactly, estimated
 *   where nothing can — or `0` when there is genuinely nothing to say yet.
 *   NEVER a sentinel: `0` hides the badge, and every other value is a number a
 *   player can read.
 */
export const rankFor = (score: number): number => {
  if (!leaderboardEnabled) return 0
  // EXACT match, not `>=`. The server's answer belongs to the score it counted
  // and to no other, and the difference only becomes visible once the client
  // stops posting on every single clear: with `>=`, a player who posted at 10
  // and climbed to 42 keeps being shown the rank they held at 10, because every
  // later score still satisfies it. Anything else is derived below from the
  // histogram — the same arithmetic the Worker runs, so the two cannot disagree
  // about anything but the age of the population.
  if (serverRank.value > 0 && score === submittedScore.value) return serverRank.value

  // A player with no score yet has no standing to report. Without
  // this the derivation below hands a fresh install `above + 1` = **#1** on an
  // empty board — the game congratulating someone for a run they have not had,
  // on the first screen they ever see.
  //
  // Where the build opts in (`VITE_LEADERBOARD_UNPLAYED_LAST`), they are placed
  // instead: LAST, behind everyone the board knows — `total + 1`, counted into
  // the population by `rankTotalFor`. The bottom is a truthful place to start
  // and a number with somewhere to go; a blank cell is neither. Only with a
  // board in hand: last of nothing is still nothing.
  if (score <= 0) return UNPLAYED_LAST && board.value !== null && total.value > 0 ? total.value + 1 : 0

  // On a baked build the histogram IS the board, and it answers for the whole
  // population: no published cut to fall off, and a real number —
  // "#1847 of 2363" — from the player's very first result screen.
  //
  // That is why the snapshot carries a histogram and not just rows. The top-100
  // alone would have been useless: on a board of a few thousand the hundredth
  // row sits well past where a first session ever reaches, so every new
  // player would have fallen through to the estimator below — in exactly the
  // session Poki's fit test grades.
  //
  const table = board.value
  if (!table) return 0

  // THE histogram path, and the one every rung takes now — live, cached or
  // baked. It ranks against the whole population, so the answer is an exact
  // "#1130" rather than "past the end of what we published", and it is the same
  // arithmetic the Worker runs, so a player's rank does not change when the
  // board underneath it does.
  if (table.dist && table.dist.length > 0) return rankFromDist(table.dist, score)

  // A board cached by a build that predates the histogram. Rank against the
  // BAKED one instead of the hundred published rows: its population is a few
  // weeks stale, so the rank is off by the number of players who joined since —
  // about a percent — which is an order of magnitude better than the estimate
  // below. Lasts until this device's next successful read.
  if (boardSnapshot?.dist.length) return rankFromDist(boardSnapshot.dist, score)

  // Last resort: rows and a population count, no histogram anywhere.
  const above = table.entries.filter((e) => e.score > score).length
  // Inside the published slice, or the slice IS the whole population — either
  // way this is an ordinary exact rank, counted like any other.
  if (above < table.entries.length || table.entries.length >= table.total) return above + 1

  // Below every published row, and the table is a truncated slice of a bigger
  // population. THIS is where a rank used to be unknowable — so estimate it.
  const guess = estimateRank(table.entries, table.total, score)
  return guess > 0 ? pinEstimate(score, guess) : 0
}
