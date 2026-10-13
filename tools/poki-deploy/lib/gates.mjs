// Release gates, run on the BUILT artifact, before anything is uploaded.
//
// These are the Poki-specific rejections that are cheap to catch here and
// expensive to catch after a moderation round: a CSP meta tag (Poki applies its
// allowlist server-side, so shipping one blocks the entire ad waterfall and
// earns nothing while reporting no error), a missing SDK tag, another portal's
// SDK riding along in the bundle, an external host the game will be told it may
// not call, and an entry point that is not `index.html` at the zip root.
//
// The split between FAIL and WARN is deliberate. Structural facts — the ones
// with exactly one correct answer — fail the run. Budgets warn: the Inspector
// measures the real initial download after Poki's own image optimisation pass,
// and a local byte count is an estimate, so it informs rather than blocks
// (`--strict` promotes them if you want CI to hold the line).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { inspectZip, listZip } from './zip.mjs'

/** Hosts a Poki build is allowed to reference. Everything else needs a per-URL
 *  approval in P4D → Settings → CSP plus a player-accessible privacy policy. */
const ALLOWED_HOSTS = [
  'game-cdn.poki.com',
  'poki.com',
  'poki.dev',
  'poki-gdn.com',
  'gdn.poki.com',
  'poki-cdn.com',
  'poki.io',
  'www.w3.org',            // SVG namespace, not a request
]

/** Hosts that appear in framework WARNING STRINGS rather than in requests —
 *  Vue's "see https://vuejs.org/..." advice, a library's issue tracker, a
 *  store listing. They are text, not traffic, and reporting them as policy
 *  violations trains you to ignore this check, which is how the one real host
 *  gets through. Listed separately so they are still visible. */
const NOISE_HOSTS = [
  'vuejs.org', 'github.com', 'mozilla.org', 'chromewebstore.google.com',
  'intlify.dev', 'npmjs.com', 'nodejs.org', 'rollupjs.org', 'vitejs.dev',
  'developer.mozilla.org', 'caniuse.com', 'schema.org',
  // A paper citation inside a three.js GLSL chunk (a comment in a shader
  // string), not a request.
  'jcgt.org',
]

/** Fragments that mean another portal's integration survived into this bundle.
 *  Each one is a URL/path the other portal's SDK or plugin actually loads or
 *  calls — not a mere mention of the portal's name, which inert identifiers
 *  (capability flag names, comments) legitimately carry. */
const FOREIGN_SDK_MARKERS = [
  'sdk.crazygames.com', 'CrazyGames.SDK',
  'html5.api.gamedistribution.com', 'gdsdk',
  'api.gamemonetize.com', 'sdk.gamemonetize.com',
  'playgama.com/bridge', 'bridge.playgama.com/v1', 'playgama.com/platform-sdk',
  'gamepix.com/sdk', 'games.gamepix.com',
  'yandex.ru/games/sdk', 'sdk.games.s3.yandex.net', 'yandex.ru/ads', 'an.yandex.ru',
  'youtube.com/game_api',
  'api.glitch.fun',
  'cdn.y8.com', 'api.wavedash', 'convex.cloud',
]

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest'])

/**
 * @param {object} o
 * @param {Array<{ text: string, why: string }>} [o.forbid]  project-specific strings
 *   that must never ship in a release (e.g. dev tooling — Poki asks for a clean
 *   build, "no debug code, no dev artifacts"). Any hit FAILS the run.
 */
export const runGates = ({ dist, zip, allowHosts = [], sdkTag = 'game-cdn.poki.com/scripts/v2/poki-sdk.js', forbid = [] }) => {
  const results = []
  const add = (level, name, detail) => results.push({ level, name, detail })
  const ok = (name, detail) => add('pass', name, detail)
  const bad = (name, detail) => add('fail', name, detail)
  const meh = (name, detail) => add('warn', name, detail)

  if (!existsSync(dist)) {
    bad('built output exists', `${dist} is missing — run the build first`)
    return { results, failed: 1, warned: 0 }
  }

  const files = walk(dist).filter(f => !f.endsWith('.zip'))
  const total = files.reduce((n, f) => n + statSync(f).size, 0)
  const indexPath = join(dist, 'index.html')

  // ── 1. index.html at the root of the artifact ─────────────────────────────
  if (!existsSync(indexPath)) bad('index.html at the root', `not found in ${dist}`)
  else ok('index.html at the root')

  const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''

  // ── 2. NO CSP meta tag ────────────────────────────────────────────────────
  // The single most expensive thing to get wrong here: Poki's per-game
  // allowlist is applied server-side, and a meta tag of your own blocks the ad
  // stack the core SDK injects. No error surfaces; revenue is simply zero.
  if (/<meta[^>]+http-equiv=["']?Content-Security-Policy/i.test(html)) {
    bad('no CSP meta tag', 'index.html ships one — Poki applies its allowlist server-side and yours blocks the ad waterfall')
  } else ok('no CSP meta tag')

  // ── 3. the SDK tag is actually in the shipped HTML ────────────────────────
  if (sdkTag && !html.includes(sdkTag)) {
    bad('Poki SDK script tag', `index.html does not reference ${sdkTag}`)
  } else ok('Poki SDK script tag')

  // ── 4. no other portal's SDK rode along ───────────────────────────────────
  const foreign = []
  for (const f of files) {
    if (!TEXT.has(extname(f))) continue
    const body = readFileSync(f, 'utf8')
    for (const marker of FOREIGN_SDK_MARKERS) {
      if (body.includes(marker)) foreign.push(`${relative(dist, f)} → ${marker}`)
    }
  }
  if (foreign.length) bad('bundle purity (no foreign portal SDK)', foreign.slice(0, 6).join('; '))
  else ok('bundle purity (no foreign portal SDK)')

  // ── 4b. no dev tooling (project-declared markers) ─────────────────────────
  if (forbid.length) {
    const hits = []
    for (const f of files) {
      if (!TEXT.has(extname(f))) continue
      const body = readFileSync(f, 'utf8')
      for (const { text, why } of forbid) {
        if (body.includes(text)) hits.push(`${relative(dist, f)} → "${text}" (${why})`)
      }
    }
    if (hits.length) bad('clean build (no dev tooling)', hits.slice(0, 6).join('; '))
    else ok('clean build (no dev tooling)', `${forbid.length} marker(s) absent`)
  }

  // ── 4c. the debug UI bake ─────────────────────────────────────────────────
  // `VITE_APP_RENDER_UI_BAKE=true` draws the HTML HUD into the canvas so Poki's
  // canvas-only playtest recorder shows it. Wanted in a playtest upload, never
  // in the final release: a warning, so neither is blocked and neither is silent.
  const bake = files.filter(f => TEXT.has(extname(f)) && readFileSync(f, 'utf8').includes('data-uib-anc'))
  if (bake.length) meh('debug UI bake ships', `${relative(dist, bake[0])} — fine for a playtest; set VITE_APP_RENDER_UI_BAKE=false in .env.poki.local for the final release`)
  else ok('no debug UI bake')

  // ── 5. external hosts ─────────────────────────────────────────────────────
  // Poki forbids runtime requests to anything it has not approved. A URL in the
  // bundle is not proof of a request, so this reports rather than fails — but
  // every hit is a host you must be able to explain.
  const allow = [...ALLOWED_HOSTS, ...allowHosts]
  const hosts = new Map()
  for (const f of files) {
    if (!TEXT.has(extname(f))) continue
    const body = readFileSync(f, 'utf8')
    for (const m of body.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const host = m[1].toLowerCase()
      if (allow.some(a => host === a || host.endsWith(`.${a}`))) continue
      hosts.set(host, (hosts.get(host) ?? 0) + 1)
    }
  }
  const isNoise = h => NOISE_HOSTS.some(n => h === n || h.endsWith(`.${n}`))
  const real = [...hosts.entries()].filter(([h]) => !isNoise(h))
  const noise = [...hosts.entries()].filter(([h]) => isNoise(h))
  if (real.length) {
    meh('no unapproved external hosts', real.map(([h, n]) => `${h} (${n})`).slice(0, 8).join(', '))
  } else ok('no unapproved external hosts', noise.length ? `${noise.length} documentation URLs in warning strings, ignored` : undefined)

  // ── 6. the zip: exists, fresh, index.html at its root ─────────────────────
  if (!zip || !existsSync(zip)) {
    bad('upload archive exists', `${zip ?? '(none)'} is missing`)
  } else {
    const zstat = statSync(zip)
    ok('upload archive exists', `${(zstat.size / 1024 / 1024).toFixed(2)} MB`)
    // A zip older than the newest build output is a STALE artifact — the classic
    // way to spend a moderation round re-uploading last week's build.
    const newest = Math.max(...files.map(f => statSync(f).mtimeMs))
    if (zstat.mtimeMs + 1000 < newest) {
      bad('archive is newer than the build output', 'the zip predates files in dist/ — it is stale, rebuild')
    } else ok('archive is newer than the build output')

    const z = inspectZip(zip)
    if (!z.ok) {
      // The one that cost an upload round: GNU tar's `-a` does not know zip, so
      // `tar -a -cf x.zip *` under Git Bash writes a TAR named `.zip`. P4D
      // answers "We couldn't read your zip file", which reads like a build
      // problem and is really a $PATH problem. Pack it in Node instead.
      bad('the archive is a real zip', z.why)
    } else {
      const entries = listZip(zip)
      if (!entries.some(e => e === 'index.html')) {
        bad('index.html at the archive root', `archive root holds: ${entries.slice(0, 5).join(', ')}`)
      } else ok('index.html at the archive root', `${entries.length} entries`)
      const backups = entries.filter(e => /-original\.(png|jpe?g|webp)$/i.test(e))
      if (backups.length) meh('no compression backups in the archive', `${backups.length} *-original.* files are shipping`)
      const nested = entries.filter(e => e.endsWith('.zip'))
      if (nested.length) meh('no nested archives', `${nested.join(', ')} is inside the upload`)
    }
  }

  // ── 7. budgets ────────────────────────────────────────────────────────────
  // Poki: ≤ 5 MB initial download, ≤ 8 MB total, < 10 s load. "Initial" is what
  // the browser must have before the first frame — index.html plus everything
  // it references directly — which is an estimate here and measured for real in
  // the Inspector's own readout.
  const referenced = [...html.matchAll(/(?:src|href)=["']\.?\/?([^"']+\.(?:js|css|mjs))["']/gi)].map(m => m[1])
  const initial = referenced.reduce((n, rel) => {
    const p = join(dist, rel)
    return n + (existsSync(p) ? statSync(p).size : 0)
  }, Buffer.byteLength(html))
  const mb = n => `${(n / 1024 / 1024).toFixed(2)} MB`
  ;(initial <= 5 * 1024 * 1024 ? ok : meh)('initial download ≤ 5 MB', `${mb(initial)} (estimate; the Inspector measures the real figure)`)
  ;(total <= 8 * 1024 * 1024 ? ok : meh)('total size ≤ 8 MB', `${mb(total)} across ${files.length} files`)

  return {
    results,
    failed: results.filter(r => r.level === 'fail').length,
    warned: results.filter(r => r.level === 'warn').length,
    stats: { total, initial, fileCount: files.length },
  }
}
