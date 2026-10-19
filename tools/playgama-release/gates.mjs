// Release gates for the Playgama archive — run on the BUILT artifact, before
// anything is uploaded to developer.playgama.com.
//
// That one archive is also the YouTube Playables submission (Playgama forwards
// it), so it answers to three rulebooks at once: Playgama's own QA, YouTube's
// certification, and this project's release rule — a PURE bundle, carrying the
// Playgama plugin path and nothing else. What that rules out, and why each is a
// FAIL rather than a WARN:
//
//   • another portal named anywhere in the game's own code — an SDK host, a
//     plugin chunk, a platform flag, a build script: "only the Playgama plugins
//     in the release bundle". YouTube reads another portal's ad machinery as
//     off-platform monetization (YT-MON) even when it never fires;
//   • dev tooling (dev cheat shortcuts, the "cmarc" toggle; the cheat panel ships) — the policy
//     aliases it out, and a grep of the artifact is the only proof it worked;
//   • an obfuscated bundle — every string check here is unfalsifiable on one,
//     and Playgama / YouTube review by hand from stack traces;
//   • a missing YouTube SDK tag (Bridge's `youtube` adapter waits for
//     `window.ytgame` with no timeout: the game never starts), a CSP meta tag,
//     a Bridge v1 CDN tag ("please update Bridge to v2"), a
//     `forciblySetPlatformId` in the bridge config;
//   • an archive that is not a real PKZIP with `index.html` at its root.
//
// ── The one exemption ──
//
// `assets/playgama-bridge-*.js` is Playgama's own Bridge SDK, bundled from the
// `@playgama/bridge` npm package — the build Playgama prescribes for
// self-contained / Playables archives. It carries EVERY portal adapter Bridge
// supports as dead code, so it names other portals by design. It is exempt from
// the purity scan, and only because `vite.config.ts` pins that package — and
// nothing else — into that chunk: the gate checks the chunk carries the SDK's
// fingerprints and none of the game's, so game code cannot hide inside it.
//
// Shares the Poki pipeline's zip reader (`tools/poki-deploy/lib/zip.mjs`).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

import { inspectZip, listZip } from '../poki-deploy/lib/zip.mjs'

const MiB = 1024 * 1024
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest'])

/**
 * Every OTHER portal, as the strings that betray it. Names and hosts, matched
 * case-insensitively, so they are shaped to avoid ordinary words — "glitch"
 * alone is a VFX term in a robot shooter, "itch" is inside "switch" — while
 * still catching a platform flag (`isPoki`), a chunk name (`useCrazyGames`),
 * an env var (`VITE_APP_CRAZY_WEB`) or an SDK host.
 */
export const FOREIGN_PORTALS = [
  { portal: 'CrazyGames', re: /crazy[\s_-]?games|crazy[\s_-]?web|1001juegos/i },
  { portal: 'Poki', re: /poki/i },
  { portal: 'GamePix', re: /gamepix/i },
  { portal: 'GameMonetize', re: /game[\s_-]?monetize/i },
  { portal: 'GameDistribution', re: /game[\s_-]?distribution|gdsdk/i },
  { portal: 'Yandex', re: /yandex|yastatic|\bysdk\b/i },
  { portal: 'Wavedash', re: /wavedash|convex\.cloud/i },
  { portal: 'Glitch', re: /glitch\.fun|\bisGlitch|glitch[\s_-]?license|GlitchStrategy/i },
  { portal: 'itch.io', re: /itch\.io|itch\.zone|\bisItch\b|VITE_APP_ITCH/i },
  { portal: 'Y8', re: /\by8\.com|\bisY8\b/i },
  { portal: 'LevelPlay (native ads)', re: /levelplay|ironsource/i },
]

/** Third-party analytics / telemetry — banned by Playgama ("no embedded
 *  analytics systems like GA4") and by Playables ("including built-in
 *  analytics"). Host- and API-shaped, like the youtube-fit audit's. */
export const ANALYTICS = /gtag\s*\(|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|dataLayer\.push|api\.mixpanel\.com|amplitude\.com|posthog\.|sentry\.io|hotjar\.com|clarity\.ms|connect\.facebook\.net|mc\.yandex\.ru/i

/** Our own leaderboard Worker. External calls are banned on Playables, so the
 *  Playgama build bakes the board and must not carry the endpoint at all. */
export const LEADERBOARD_WORKER = /workers\.dev|mega-adventure-leaderboard/i

/** YouTube is reached THROUGH the Bridge on this build — the game's own code
 *  must not talk to Playables' SDK directly. (index.html carries its tag, and
 *  the classic storage shim mentions it in a comment; both are outside
 *  `assets/`.) */
export const YOUTUBE_DIRECT = /\bytgame\b/

/** Hosts the game's own code may name. The YouTube SDK tag is required on this
 *  build; the SVG namespace is not a request. */
export const ALLOWED_HOSTS = ['www.youtube.com', 'www.w3.org']

/** Hosts that appear in documentation strings rather than in requests — Vue's
 *  "see https://vuejs.org/…" advice, a paper cited inside a three.js shader
 *  chunk. Text, not traffic; listed so the report still shows them. */
export const NOISE_HOSTS = ['vuejs.org', 'jcgt.org', 'github.com', 'mozilla.org', 'developer.mozilla.org', 'khronos.org', 'threejs.org']

/** What only the vendored Bridge npm build carries (the exemption's
 *  fingerprint), and what only the game's code carries (proof it is not in
 *  there). Both storage-key prefixes count: the game writes `mega_droid_*`,
 *  and its pre-rename migration (src/legacyKeys.ts) still ships the
 *  `mega_adventure_*` names it reads. */
const BRIDGE_FINGERPRINTS = ['jio_games', 'bridge-youtube-subscribe']
const GAME_FINGERPRINTS = ['[playgama]', '[playgama-save]', 'mega_droid', 'mega_adventure']

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const hostsIn = (text) => {
  const out = new Set()
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) out.add(m[1].toLowerCase())
  return out
}

const within = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`))

const snippet = (text, index) =>
  text.slice(Math.max(0, index - 40), index + 50).replace(/\s+/g, ' ')

/** Blank inlined base64 payloads (fonts, images in CSS or JS) before a name
 *  search: a four-letter brand spelled case-insensitively turns up in a few
 *  kilobytes of random base64 often enough to fail a clean build. */
const withoutDataUris = (text) => text.replace(/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:,')

const mb = (n) => `${(n / MiB).toFixed(2)} MiB`

/**
 * @param {object} o
 * @param {string} o.dist      the unpacked build (exactly the archive's contents)
 * @param {string} [o.zip]     the archive to upload
 * @param {Array<{ text: string, why: string }>} [o.forbid]  dev-tooling markers
 *   (`DEV_TOOL_MARKERS` from src/platforms/policy.ts) — any hit fails the run
 * @param {string} [o.bridgeVersion]  the installed `@playgama/bridge` version
 */
export const runPlaygamaGates = ({ dist, zip, forbid = [], bridgeVersion = null }) => {
  const results = []
  const add = (level, name, detail) => results.push({ level, name, detail })
  const ok = (name, detail) => add('pass', name, detail)
  const bad = (name, detail) => add('fail', name, detail)
  const meh = (name, detail) => add('warn', name, detail)
  const info = (name, detail) => add('info', name, detail)
  const done = (stats = {}) => ({
    results,
    failed: results.filter((r) => r.level === 'fail').length,
    warned: results.filter((r) => r.level === 'warn').length,
    stats,
  })

  if (!existsSync(dist)) {
    bad('built output exists', `${dist} is missing — run pnpm build:playgama`)
    return done()
  }

  const files = walk(dist).map((abs) => ({ abs, rel: relative(dist, abs).split(sep).join('/'), size: statSync(abs).size }))
  const text = files.filter((f) => TEXT.has(extname(f.rel)) && !f.rel.endsWith('.map'))
    .map((f) => ({ ...f, body: withoutDataUris(readFileSync(f.abs, 'utf8')) }))
  const bridgeChunks = files.filter((f) => /^assets\/playgama-bridge-[A-Za-z0-9_-]+\.js$/.test(f.rel))
  const isExempt = (rel) => bridgeChunks.some((b) => b.rel === rel)
  const own = text.filter((f) => !isExempt(f.rel))

  // ── 1. the archive root ───────────────────────────────────────────────────
  const index = text.find((f) => f.rel === 'index.html')
  if (!index) bad('index.html at the root', `not found in ${dist}`)
  else ok('index.html at the root')
  const html = index?.body ?? ''
  // Comments explain the tags; blank them so the explanation is never read as
  // the thing it explains.
  const htmlLive = html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length))

  // ── 2. index.html: the tags YouTube Playables and Playgama grade ──────────
  if (/<meta[^>]+http-equiv=["']?Content-Security-Policy/i.test(htmlLive)) {
    bad('no CSP meta tag', 'index.html ships one — Playables runs the game under YouTube\'s own CSP, in a document it shares with YouTube\'s runtime')
  } else ok('no CSP meta tag')

  const scripts = [...htmlLive.matchAll(/<script\b[^>]*>/gi)].map((m) => ({ tag: m[0], at: m.index }))
  const ytAt = scripts.findIndex((s) => /src=["']https:\/\/www\.youtube\.com\/game_api\/v1["']/.test(s.tag))
  const headEnd = htmlLive.search(/<\/head>/i)
  if (ytAt < 0) {
    bad('YouTube Playables SDK tag', 'index.html has no <script src="https://www.youtube.com/game_api/v1"> — Bridge\'s youtube adapter waits for window.ytgame forever without it')
  } else if (ytAt !== 0 || /\b(type=["']module["']|async|defer)\b/i.test(scripts[ytAt].tag) || (headEnd >= 0 && scripts[ytAt].at > headEnd)) {
    bad('YouTube Playables SDK tag', 'present, but not the first, parser-blocking script in <head> — the SDK must load before any game code (YT-INT)')
  } else ok('YouTube Playables SDK tag', 'first classic script in <head>')

  const shimAt = scripts.findIndex((s) => /src=["'][^"']*js\/storage-shim\.js["']/.test(s.tag))
  const entryAt = scripts.findIndex((s) => /type=["']module["']/.test(s.tag))
  if (shimAt < 0 || /type=["']module["']/.test(scripts[shimAt]?.tag ?? '')) {
    bad('Web Storage shim', 'index.html must load js/storage-shim.js as a CLASSIC script — on Playables window.localStorage is null')
  } else if (entryAt >= 0 && shimAt > entryAt) {
    bad('Web Storage shim', 'the shim loads after the entry module — module-scope storage reads run first and die on Playables')
  } else ok('Web Storage shim', 'classic script ahead of the entry module')

  if (/bridge\.playgama\.com\/v1/i.test(htmlLive) || own.some((f) => /bridge\.playgama\.com\/v1/i.test(f.body))) {
    bad('no Bridge v1', 'a v1 CDN reference ships — Playgama QA rejects v1 ("please update Bridge to v2"), and it fetches adapters at runtime')
  } else ok('no Bridge v1')

  const absRefs = [...htmlLive.matchAll(/\b(?:src|href)=["'](\/[^"']*)["']/gi)].map((m) => m[1])
  if (absRefs.length) bad('relative paths only', `index.html references ${absRefs.slice(0, 4).join(', ')} — absolute paths break under Playables' own URL (YT-STA)`)
  else ok('relative paths only')

  // ── 3. Bridge v2, vendored — and the exemption is really only the SDK ─────
  if (bridgeChunks.length !== 1) {
    bad('Bridge v2 bundled from npm', `${bridgeChunks.length} assets/playgama-bridge-*.js chunk(s) — expected exactly one (vite.config.ts pins @playgama/bridge into it)`)
  } else {
    const chunk = text.find((f) => f.rel === bridgeChunks[0].rel)?.body ?? ''
    const version = /get version\(\)\{return"([^"]+)"\}/.exec(chunk)?.[1] ?? null
    const missing = BRIDGE_FINGERPRINTS.filter((m) => !chunk.includes(m))
    const intruders = GAME_FINGERPRINTS.filter((m) => chunk.includes(m))
    if (missing.length) bad('Bridge v2 bundled from npm', `${bridgeChunks[0].rel} lacks the npm build's fingerprints (${missing.join(', ')})`)
    else if (!version || !/^2\./.test(version)) bad('Bridge v2 bundled from npm', `bundled Bridge reports version ${version ?? '(none)'} — v2 is required`)
    else if (bridgeVersion && version !== bridgeVersion) bad('Bridge v2 bundled from npm', `bundled ${version}, installed @playgama/bridge ${bridgeVersion} — stale build`)
    else ok('Bridge v2 bundled from npm', `${bridgeChunks[0].rel} · v${version}`)
    if (intruders.length) bad('the exempt SDK chunk holds only the SDK', `game code found inside ${bridgeChunks[0].rel} (${intruders.join(', ')}) — the purity exemption would hide it`)
    else ok('the exempt SDK chunk holds only the SDK')
    const reach = [...hostsIn(chunk)].filter((h) => !within(h, ['www.w3.org']))
    info('hosts named inside the vendored Bridge (dead adapters, informational)', reach.sort().join(', '))
  }

  // ── 4. playgama-bridge-config.json ────────────────────────────────────────
  const cfgFile = text.find((f) => f.rel === 'playgama-bridge-config.json')
  if (!cfgFile) {
    bad('playgama-bridge-config.json', 'missing next to index.html — Bridge fetches ./playgama-bridge-config.json on every boot')
  } else {
    let cfg = null
    try { cfg = JSON.parse(cfgFile.body) } catch (e) { bad('playgama-bridge-config.json', `not valid JSON (${e.message})`) }
    if (cfg) {
      const problems = []
      if ('forciblySetPlatformId' in cfg) problems.push('forciblySetPlatformId is set — it pins ONE postMessage protocol and hangs the QA Tool and localhost')
      const delay = cfg.advertisement?.minimumDelayBetweenInterstitial
      if (!(Number(delay) >= 60)) problems.push(`advertisement.minimumDelayBetweenInterstitial is ${delay ?? 'unset'} — expected >= 60 s`)
      if (cfg.saas) {
        if (!String(cfg.saas.publicToken ?? '').trim()) problems.push('saas block without a publicToken')
        const platforms = cfg.saas.leaderboards?.platforms
        if (!Array.isArray(platforms)) problems.push('saas.leaderboards.platforms missing — SaaS stays off even on playgama.com')
        else if (platforms.includes('youtube')) problems.push('saas.leaderboards lists youtube — Playables forbids the api.playgama.com call; its board is native')
        if (!Array.isArray(cfg.leaderboards) || !cfg.leaderboards.some((b) => b && b.isMain === true && String(b.id ?? '').trim())) {
          problems.push('no leaderboard marked isMain — Bridge drops the score on YouTube (sendScore goes to the main board only)')
        }
      }
      if (problems.length) bad('playgama-bridge-config.json', problems.join('; '))
      else ok('playgama-bridge-config.json', cfg.saas ? 'with the SaaS leaderboard' : 'no SaaS leaderboard (baked board only)')
    }
  }

  // ── 5. PURITY: nothing but the Playgama path in the game's own files ──────
  const foreign = []
  for (const f of files) {
    if (isExempt(f.rel)) continue
    for (const { portal, re } of FOREIGN_PORTALS) {
      if (re.test(f.rel)) foreign.push(`${f.rel} (file name) → ${portal}`)
    }
  }
  for (const f of own) {
    for (const { portal, re } of FOREIGN_PORTALS) {
      const m = re.exec(f.body)
      if (m) foreign.push(`${f.rel} → ${portal}: …${snippet(f.body, m.index)}…`)
    }
  }
  if (foreign.length) bad('bundle purity: no other portal named', `${foreign.length} hit(s): ${foreign.slice(0, 6).join(' | ')}`)
  else ok('bundle purity: no other portal named', `${own.length} own text files scanned, ${FOREIGN_PORTALS.length} portals`)

  const tracking = own.flatMap((f) => {
    const hits = []
    for (const [label, re] of [['analytics', ANALYTICS], ['leaderboard Worker', LEADERBOARD_WORKER]]) {
      const m = re.exec(f.body)
      if (m) hits.push(`${f.rel} → ${label}: …${snippet(f.body, m.index)}…`)
    }
    return hits
  })
  if (tracking.length) bad('no analytics, no external endpoint', tracking.slice(0, 6).join(' | '))
  else ok('no analytics, no external endpoint')

  const direct = own.filter((f) => f.rel.startsWith('assets/') && YOUTUBE_DIRECT.test(f.body)).map((f) => f.rel)
  if (direct.length) bad('YouTube only through the Bridge', `game code calls ytgame directly: ${direct.join(', ')}`)
  else ok('YouTube only through the Bridge')

  const hostHits = new Map()
  for (const f of own) {
    for (const h of hostsIn(f.body)) {
      if (within(h, ALLOWED_HOSTS) || within(h, NOISE_HOSTS)) continue
      hostHits.set(h, [...(hostHits.get(h) ?? []), f.rel])
    }
  }
  if (hostHits.size) bad('no external host in the game\'s own code', [...hostHits].map(([h, fs]) => `${h} (${fs.slice(0, 2).join(', ')})`).join('; '))
  else ok('no external host in the game\'s own code', `allowed: ${ALLOWED_HOSTS.join(', ')}`)

  // ── 6. clean build: no dev tooling ────────────────────────────────────────
  if (forbid.length) {
    const hits = []
    for (const f of own) {
      for (const { text: t, why } of forbid) if (f.body.includes(t)) hits.push(`${f.rel} → "${t}" (${why})`)
    }
    if (hits.length) bad('clean build: no dev tooling', `${hits.slice(0, 6).join('; ')} — a QA twin (VITE_QA_TOOLS) is not a release`)
    else ok('clean build: no dev tooling', `${forbid.length} marker(s) absent`)
  }

  // ── 7. readable, map-free, well-formed file set ───────────────────────────
  const entry = own.find((f) => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(f.rel))
  const obfuscated = own.filter((f) => f.rel.endsWith('.js') && (f.body.match(/\b_0x[0-9a-f]{4,}\b/g) ?? []).length > 20).map((f) => f.rel)
  if (!entry) bad('unobfuscated bundle', 'no assets/index-*.js entry chunk found')
  else if (obfuscated.length) bad('unobfuscated bundle', `${obfuscated.slice(0, 3).join(', ')} look obfuscated — set VITE_ENABLE_OBFUSCATION=false in .env.playgama`)
  else ok('unobfuscated bundle')

  const maps = files.filter((f) => f.rel.endsWith('.map')).map((f) => f.rel)
  const mapRefs = own.filter((f) => /[#@]\s*sourceMappingURL=/.test(f.body)).map((f) => f.rel)
  if (maps.length || mapRefs.length) bad('no source maps', [...maps, ...mapRefs].slice(0, 4).join(', '))
  else ok('no source maps')

  const badNames = files.filter((f) => f.rel.split('/').some((seg) => !/^[A-Za-z0-9._-]+$/.test(seg))).map((f) => f.rel)
  if (badNames.length) bad('file names: letters, digits, . _ - only', badNames.slice(0, 5).join(', '))
  else ok('file names: letters, digits, . _ - only')

  const total = files.reduce((n, f) => n + f.size, 0)
  if (files.length > 8000) bad('at most 8000 files', `${files.length} files`)
  else ok('at most 8000 files', `${files.length} files, ${mb(total)}`)
  const huge = files.filter((f) => f.size >= 30 * MiB)
  const heavy = files.filter((f) => f.size > 512 * 1024)
  if (huge.length) bad('every file < 30 MiB', huge.map((f) => `${f.rel} ${mb(f.size)}`).join(', '))
  else ok('every file < 30 MiB')
  if (heavy.length) meh('files SHOULD stay under 512 KiB (Playables)', heavy.map((f) => `${f.rel} ${(f.size / 1024).toFixed(0)} KiB`).join(', '))

  // ── 8. the archive itself ─────────────────────────────────────────────────
  if (zip !== undefined) {
    if (!zip || !existsSync(zip)) {
      bad('upload archive exists', `${zip ?? '(none)'} is missing`)
    } else {
      const zstat = statSync(zip)
      if (zstat.size > 200 * MiB) bad('archive <= 200 MB', mb(zstat.size))
      else ok('upload archive exists', mb(zstat.size))
      const newest = Math.max(...files.map((f) => statSync(f.abs).mtimeMs))
      if (zstat.mtimeMs + 1000 < newest) bad('archive is newer than the build output', 'the zip predates files in the build folder — stale, re-pack')
      else ok('archive is newer than the build output')
      const z = inspectZip(zip)
      if (!z.ok) {
        bad('the archive is a real PKZIP', z.why)
      } else {
        ok('the archive is a real PKZIP', z.dataDescriptors ? 'streams data descriptors' : 'no data descriptors')
        const entries = listZip(zip)
        if (!entries.includes('index.html')) bad('index.html at the archive root', `archive root holds: ${entries.slice(0, 5).join(', ')}`)
        else ok('index.html at the archive root', `${entries.length} entries`)
        const want = new Set(files.map((f) => f.rel))
        const got = new Set(entries)
        const missing = [...want].filter((n) => !got.has(n))
        const extra = [...got].filter((n) => !want.has(n))
        if (missing.length || extra.length) {
          bad('the archive holds exactly the build', `${missing.length ? `missing ${missing.slice(0, 3).join(', ')}` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `extra ${extra.slice(0, 3).join(', ')}` : ''}`)
        } else ok('the archive holds exactly the build')
      }
    }
  }

  return done({ total, files: files.length, own: own.length, bridgeChunk: bridgeChunks[0]?.rel ?? null })
}
