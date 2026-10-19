// @vitest-environment node
//
// ─── The Playgama release gate: falsifiable, and a real zip ─────────────────
//
// `tools/playgama-release/gates.mjs` is what stands between `build:playgama`
// and an upload that is also the YouTube Playables submission. A gate that
// passes everything is worse than none, so each rule is proven here to FAIL on
// a build that breaks it — a minimal, otherwise clean fixture with exactly one
// fault planted — and to pass the clean one. The archive is packed by the
// Poki pipeline's own PKZIP writer (shared), never by a shell `tar`.

import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..')
const load = async <T = any>(rel: string): Promise<T> => await import(pathToFileURL(join(ROOT, rel)).href)

// Scratch INSIDE the repo (gitignored node_modules/.tmp), like pokiDeploy.test.
const SCRATCH = join(ROOT, 'node_modules', '.tmp', `playgama-release-test-${process.pid}`)
const DIST = join(SCRATCH, 'game')
const ZIP = join(SCRATCH, 'game.zip')

const MARKERS = [{ text: '[CHEAT]', why: 'dev cheats, src/use/devCheats.ts' }]

const CLEAN_HTML = `<!DOCTYPE html>
<html lang="">
<head>
  <meta charset="UTF-8">
  <!-- YouTube Playables SDK: must stay first -->
  <script src="https://www.youtube.com/game_api/v1"></script>
  <script src="./js/storage-shim.js"></script>
  <title>Mega Droid</title>
  <script type="module" crossorigin src="./assets/index-Abc123.js"></script>
</head>
<body><div id="app"></div></body>
</html>
`
// The vendored SDK: names other portals by design (dead adapters) — exempt.
const BRIDGE = 'var x={YOUTUBE:"youtube",JIO_GAMES:"jio_games",POKI:"poki"};"bridge-youtube-subscribe";'
  + 'class B{get version(){return"2.2.0"}};fetch("https://sdk.crazygames.com/x.js")'

const files = (): Record<string, string> => ({
  'index.html': CLEAN_HTML,
  'assets/index-Abc123.js': 'const a="[playgama] Bridge ready";document.createElementNS("http://www.w3.org/2000/svg","g");console.log("see https://vuejs.org/error")',
  'assets/playgama-bridge-Xyz789.js': BRIDGE,
  'assets/index-Def456.css': 'body{background:url(data:font/woff2;base64,AAAApOkIAAAA)}',
  'js/storage-shim.js': '(function(){/* ytgame is YouTube\'s SDK */})()',
  'playgama-bridge-config.json': JSON.stringify({ advertisement: { minimumDelayBetweenInterstitial: 120 } })
})

const writeDist = (over: Record<string, string | null> = {}): void => {
  rmSync(DIST, { recursive: true, force: true })
  const all = { ...files(), ...over }
  for (const [rel, body] of Object.entries(all)) {
    if (body === null) continue
    const p = join(DIST, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body)
  }
}

const pack = async (): Promise<void> => {
  const { packArtifact } = await load('tools/poki-deploy/lib/pack.mjs')
  const r = packArtifact({ root: SCRATCH, cfg: { dist: 'game', zip: 'game.zip' } })
  expect(r.ok, r.why).toBe(true)
}

const gates = async (over: Record<string, string | null> = {}, o: { packFirst?: boolean } = {}) => {
  writeDist(over)
  if (o.packFirst !== false) await pack()
  const { runPlaygamaGates } = await load('tools/playgama-release/gates.mjs')
  return runPlaygamaGates({ dist: DIST, zip: ZIP, forbid: MARKERS, bridgeVersion: '2.2.0' })
}

const failing = (g: { results: Array<{ level: string; name: string }> }): string[] =>
  g.results.filter((r) => r.level === 'fail').map((r) => r.name)

beforeAll(() => { mkdirSync(SCRATCH, { recursive: true }) })
afterAll(() => { rmSync(SCRATCH, { recursive: true, force: true }) })
beforeEach(() => { rmSync(ZIP, { force: true }) })

describe('a clean Playgama archive passes', () => {
  it('passes every gate — and the base64 font does not trip the name search', async () => {
    const g = await gates()
    expect(failing(g)).toEqual([])
    expect(g.results.find((r: { name: string }) => r.name.startsWith('bundle purity'))?.level).toBe('pass')
  })
})

describe('each rule fails the build that breaks it', () => {
  const cases: Array<[string, Record<string, string | null>, string]> = [
    ['another portal named in a game chunk', { 'assets/index-Abc123.js': 'const f={isPoki:!1}' }, 'bundle purity: no other portal named'],
    ['another portal\'s plugin chunk in the file list', { 'assets/useCrazyGames.stub-Q1.js': 'export{}' }, 'bundle purity: no other portal named'],
    ['a host in a locale string', { 'assets/en-Q2.js': 'export default{a:"play on gamepix"}' }, 'bundle purity: no other portal named'],
    ['a CSP meta tag', { 'index.html': CLEAN_HTML.replace('<title>', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><title>') }, 'no CSP meta tag'],
    ['no YouTube SDK tag', { 'index.html': CLEAN_HTML.replace(/<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>/, '') }, 'YouTube Playables SDK tag'],
    ['the YouTube SDK tag after the game code', { 'index.html': CLEAN_HTML.replace(/<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>\n/, '').replace('</head>', '<script src="https://www.youtube.com/game_api/v1"></script></head>') }, 'YouTube Playables SDK tag'],
    ['no storage shim', { 'index.html': CLEAN_HTML.replace(/<script src="\.\/js\/storage-shim\.js"><\/script>/, '') }, 'Web Storage shim'],
    ['a Bridge v1 CDN tag', { 'index.html': CLEAN_HTML.replace('<title>', '<script src="https://bridge.playgama.com/v1/stable/playgama-bridge.js"></script><title>') }, 'no Bridge v1'],
    ['an absolute asset path', { 'index.html': CLEAN_HTML.replace('./assets/index-Abc123.js', '/assets/index-Abc123.js') }, 'relative paths only'],
    ['no vendored Bridge chunk', { 'assets/playgama-bridge-Xyz789.js': null }, 'Bridge v2 bundled from npm'],
    ['a Bridge v1 build bundled', { 'assets/playgama-bridge-Xyz789.js': BRIDGE.replace('"2.2.0"', '"1.32.0"') }, 'Bridge v2 bundled from npm'],
    ['game code hiding inside the exempt SDK chunk', { 'assets/playgama-bridge-Xyz789.js': `${BRIDGE};console.info("[playgama] ready")` }, 'the exempt SDK chunk holds only the SDK'],
    ['the save layer hiding inside the exempt SDK chunk', { 'assets/playgama-bridge-Xyz789.js': `${BRIDGE};localStorage.getItem("mega_droid_state")` }, 'the exempt SDK chunk holds only the SDK'],
    ['the pre-rename migration hiding inside the exempt SDK chunk', { 'assets/playgama-bridge-Xyz789.js': `${BRIDGE};const L={STATE:"mega_adventure_state"}` }, 'the exempt SDK chunk holds only the SDK'],
    ['forciblySetPlatformId in the bridge config', { 'playgama-bridge-config.json': JSON.stringify({ forciblySetPlatformId: 'playgama', advertisement: { minimumDelayBetweenInterstitial: 120 } }) }, 'playgama-bridge-config.json'],
    ['a SaaS board with no isMain (YouTube drops the score)', { 'playgama-bridge-config.json': JSON.stringify({ advertisement: { minimumDelayBetweenInterstitial: 120 }, saas: { publicToken: 't', leaderboards: { platforms: ['playgama'] } }, leaderboards: [{ id: 'b' }] }) }, 'playgama-bridge-config.json'],
    ['a SaaS board listing youtube (a banned call there)', { 'playgama-bridge-config.json': JSON.stringify({ advertisement: { minimumDelayBetweenInterstitial: 120 }, saas: { publicToken: 't', leaderboards: { platforms: ['playgama', 'youtube'] } }, leaderboards: [{ id: 'b', isMain: true }] }) }, 'playgama-bridge-config.json'],
    ['analytics in the game code', { 'assets/index-Abc123.js': 'gtag("event","x")' }, 'no analytics, no external endpoint'],
    ['our leaderboard Worker endpoint', { 'assets/index-Abc123.js': 'fetch("https://mega-adventure-leaderboard.example.workers.dev/top")' }, 'no analytics, no external endpoint'],
    ['an external host in the game code', { 'assets/index-Abc123.js': 'fetch("https://cdn.example.com/lib.js")' }, 'no external host in the game\'s own code'],
    ['the game calling YouTube directly', { 'assets/index-Abc123.js': 'window.ytgame.game.gameReady()' }, 'YouTube only through the Bridge'],
    ['dev tooling (a QA twin)', { 'assets/index-Abc123.js': 'console.warn("[CHEAT] enabled")' }, 'clean build: no dev tooling'],
    ['an obfuscated bundle', { 'assets/index-Abc123.js': Array.from({ length: 30 }, (_, i) => `var _0x${(0x1a2b + i).toString(16)}=1;`).join('') }, 'unobfuscated bundle'],
    ['a source map', { 'assets/index-Abc123.js.map': '{}' }, 'no source maps'],
    ['a file name Playables refuses', { 'assets/bild ä.png': 'x' }, 'file names: letters, digits, . _ - only']
  ]
  for (const [label, over, gate] of cases) {
    it(label, async () => {
      const g = await gates(over)
      expect(failing(g)).toContain(gate)
    })
  }
})

describe('the archive itself', () => {
  it('refuses a TAR named .zip (GNU tar\'s `-a` under Git Bash)', async () => {
    writeDist()
    // A minimal ustar header — what `tar -a -cf x.zip` writes when GNU tar wins.
    const tar = Buffer.alloc(1024)
    tar.write('index.html', 0)
    tar.write('ustar', 257)
    writeFileSync(ZIP, tar)
    const { runPlaygamaGates } = await load('tools/playgama-release/gates.mjs')
    const g = runPlaygamaGates({ dist: DIST, zip: ZIP, forbid: MARKERS })
    expect(failing(g)).toContain('the archive is a real PKZIP')
  })

  it('refuses an archive that is stale or no longer matches the build', async () => {
    await gates()
    writeFileSync(join(DIST, 'assets', 'late-Z9.js'), 'export{}')
    const future = new Date(Date.now() + 60_000)
    utimesSync(join(DIST, 'assets', 'late-Z9.js'), future, future)
    const { runPlaygamaGates } = await load('tools/playgama-release/gates.mjs')
    const g = runPlaygamaGates({ dist: DIST, zip: ZIP, forbid: MARKERS })
    expect(failing(g)).toEqual(expect.arrayContaining(['archive is newer than the build output', 'the archive holds exactly the build']))
  })

  it('refuses a missing archive', async () => {
    const g = await gates({}, { packFirst: false })
    expect(failing(g)).toContain('upload archive exists')
  })
})

describe('release.mjs — the tail of build:playgama', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'tools/playgama-release/release.mjs'), '--dist', DIST, '--zip', ZIP, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })

  it('packs a real PKZIP with index.html at its root, and passes a clean build', async () => {
    writeDist()
    const r = run()
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(r.stdout).toMatch(/PASS {2}packed .*real PKZIP, index\.html at the root/)
    const { inspectZip, listZip } = await load('tools/poki-deploy/lib/zip.mjs')
    expect(inspectZip(ZIP).ok).toBe(true)
    expect(listZip(ZIP)).toContain('index.html')
  })

  it('exits non-zero on a build that fails a gate', async () => {
    writeDist({ 'assets/index-Abc123.js': 'const f={isYandex:!1}' })
    const r = run()
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/FAIL {2}bundle purity/)
  })
})
