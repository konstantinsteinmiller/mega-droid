// @vitest-environment node
//
// ─── The Poki deploy tool: never the wrong game, never a fake zip ───────────
//
// This repo was forked from Survivalist, and `tools/poki-deploy/poki.config.mjs`
// came along still pointing at SURVIVALIST'S P4D game. Every P4D step is
// addressed by `gameId` alone, so an upload would not have failed — it would
// have put Mega Droid into Survivalist's Versions list. Pinned here:
//
//   1. the config is Mega Droid's (name, zip, version name, save hook) and
//      carries no gameId until the real one is known;
//   2. `deploy.mjs` refuses every P4D-bound mode without a valid, non-foreign
//      gameId — BEFORE it bumps the version, builds, or opens a browser — while
//      `--gates-only` stays fully offline and needs none;
//   3. `pnpm build:poki` packs with the pipeline's own PKZIP writer, because the
//      old `tar -a -cf x.zip` tail writes a TAR named .zip under Git Bash.
//
// The spawned runs below cannot reach P4D even if the guard regresses: their
// `dist` has no index.html, so the pack/gates steps stop the run long before
// the browser step (which has its own second guard as well).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..')
const TOOL = join(ROOT, 'tools', 'poki-deploy')
const SURVIVALIST_ID = '1d51788e-5771-4d70-8290-59366fb9773f'
const FRESH_ID = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0'

const load = async <T = any>(file: string): Promise<T> => await import(pathToFileURL(join(TOOL, file)).href)

// Scratch space INSIDE the repo (gitignored node_modules/.tmp) because the tool
// resolves `dist` / `zip` relative to the project root.
const SCRATCH_REL = join('node_modules', '.tmp', `poki-deploy-test-${process.pid}`)
const SCRATCH = join(ROOT, SCRATCH_REL)

beforeAll(() => { mkdirSync(SCRATCH, { recursive: true }) })
afterAll(() => { rmSync(SCRATCH, { recursive: true, force: true }) })

describe('gameId guard (lib/target.mjs)', () => {
  it('refuses a missing gameId', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of [null, undefined, '', '   ']) {
      const r = checkGameId(v)
      expect(r.ok, String(v)).toBe(false)
      expect(r.why).toMatch(/no P4D gameId/)
      expect(r.next).toMatch(/--game-id/)
    }
  })

  it('refuses anything that is not a P4D uuid', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of ['TODO', 'mega-droid', '1d51788e-5771-4d70-8290', 42, {}]) {
      expect(checkGameId(v).ok, String(v)).toBe(false)
    }
  })

  it("refuses Survivalist's game id, however it is written", async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of [SURVIVALIST_ID, SURVIVALIST_ID.toUpperCase(), `  ${SURVIVALIST_ID} `]) {
      const r = checkGameId(v)
      expect(r.ok).toBe(false)
      expect(r.why).toMatch(/Survivalist/)
    }
  })

  it('accepts a well-formed id of this game', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    expect(checkGameId(FRESH_ID.toUpperCase())).toEqual({ ok: true, gameId: FRESH_ID })
  })
})

describe('poki.config.mjs is Mega Droid\'s', () => {
  it('names, packs and versions the right game, under its registered gameId', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const { checkGameId } = await load('lib/target.mjs')
    expect(cfg.gameName).toBe('Mega Droid')
    expect(cfg.team).toBe('hyperg8')
    expect(cfg.zip).toBe('dist/mega-droid-poki.zip')
    expect(cfg.dist).toBe('dist')
    expect(cfg.build).toBe('pnpm build:poki')
    expect(cfg.versionName('0.1.1')).toBe('Mega Droid 0.1.1')
    expect(cfg.gameId).toBe('9b504ac8-a798-4111-b0e5-a7c569fcec46')
    expect(checkGameId(cfg.gameId).ok).toBe(true)
    expect(cfg.declares).toEqual({ usernames: false, chat: false })
    expect(cfg.allowHosts).toEqual([])
  })

  it('carries no Survivalist value anywhere', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const values: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') values.push(v)
      else if (typeof v === 'function') values.push(String(v), String(v('9.9.9')))
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(cfg)
    for (const v of values) expect(v).not.toMatch(/survivalist/i)

    // The old id may exist in exactly one place: the refusal list.
    const hits: string[] = []
    const scan = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) scan(p)
        else if (readFileSync(p, 'utf8').includes(SURVIVALIST_ID)) hits.push(relative(TOOL, p).replace(/\\/g, '/'))
      }
    }
    scan(TOOL)
    expect(hits).toEqual(['lib/target.mjs'])
  })

  it('reads durable progress out of the one state blob, and nothing without a save', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const store = new Map<string, string>()
    const localStorage = { getItem: (k: string) => store.get(k) ?? null }
    // eslint-disable-next-line no-new-func
    const run = () => new Function('localStorage', `return ${cfg.hooks.readProgress}`)(localStorage)

    expect(run()).toBeNull()

    store.set('mega_droid_state', JSON.stringify({
      ma_level: 3,
      ma_bolts: 120,
      ma_story: 1,
      ma_quests_done: 2,
      ma_hero: { xp: 950, weapons: ['buster', 'spread'] },
      ma_world: { unlocked: ['scrapyard', 'foundry'], bosses: ['scrapper'], tutorialDone: true },
      // Volatile on a reload — must not be part of the snapshot.
      ma_mission: { quest: { id: 'q1' }, player: { x: 1, z: 2 } },
      ma_quests: { jobSeed: 12345 }
    }))
    expect(run()).toEqual({
      level: 3, xp: 950, bolts: 120, story: 1, questsDone: 2,
      tutorialDone: true, sectors: 2, bosses: 1, weapons: 2
    })

    store.set('mega_droid_state', '{not json')
    expect(run()).toBeNull()
  })

  it('falls back to a pre-rename save the game has not migrated yet, and prefers the new key', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const store = new Map<string, string>()
    const localStorage = { getItem: (k: string) => store.get(k) ?? null }
    // eslint-disable-next-line no-new-func
    const run = () => new Function('localStorage', `return ${cfg.hooks.readProgress}`)(localStorage)

    store.set('mega_adventure_state', JSON.stringify({ ma_level: 4, ma_bolts: 10 }))
    expect(run()).toMatchObject({ level: 4, bolts: 10 })

    store.set('mega_droid_state', JSON.stringify({ ma_level: 6, ma_bolts: 30 }))
    expect(run()).toMatchObject({ level: 6, bolts: 30 })
  })
})

describe('deploy.mjs refuses P4D without a valid gameId', () => {
  const pkgVersion = (): string => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

  const writeConfig = (name: string, gameId: string | null): string => {
    const file = join(SCRATCH, `${name}.config.mjs`)
    // `dist` does not exist at all: should the guard ever regress, pack/gates
    // end the run long before any browser step. `build` would exit 3 if run.
    writeFileSync(file, `export default {
      team: 'hyperg8',
      gameId: ${JSON.stringify(gameId)},
      gameName: 'Mega Droid',
      build: 'node -e "process.exit(3)"',
      dist: ${JSON.stringify(join(SCRATCH_REL, 'missing-dist').replace(/\\/g, '/'))},
      zip: ${JSON.stringify(join(SCRATCH_REL, 'never.zip').replace(/\\/g, '/'))},
      repack: true,
      allowHosts: [],
      versionName: v => 'Mega Droid ' + v
    }\n`)
    return file
  }

  const deploy = (args: string[]) => spawnSync(process.execPath, [join(TOOL, 'deploy.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1' }
  })

  it('stops a normal run with no gameId before the version bump, the build or the browser', () => {
    const before = pkgVersion()
    const r = deploy(['--config', writeConfig('no-id', null), '--no-bump', '--skip-build'])
    const out = `${r.stdout}\n${r.stderr}`
    expect(r.status).toBe(1)
    expect(out).toMatch(/no P4D gameId is configured/)
    expect(out).toMatch(/nothing was uploaded/)
    expect(out).not.toMatch(/Browser|Upload to P4D|Pack|Release gates/)
    expect(pkgVersion()).toBe(before)
  })

  it("refuses Survivalist's id from the config AND from --game-id", () => {
    for (const args of [
      ['--config', writeConfig('foreign-id', SURVIVALIST_ID), '--no-bump', '--skip-build'],
      ['--config', writeConfig('no-id-2', null), '--game-id', SURVIVALIST_ID, '--no-bump', '--skip-build'],
      ['--config', writeConfig('no-id-3', null), '--qa-only'],
      ['--config', writeConfig('no-id-4', null), '--dry-run', '--skip-build']
    ]) {
      const r = deploy(args)
      const out = `${r.stdout}\n${r.stderr}`
      expect(r.status, args.join(' ')).toBe(1)
      expect(out, args.join(' ')).toMatch(/refusing/)
      expect(out, args.join(' ')).not.toMatch(/Browser|Upload to P4D/)
    }
  })

  it('runs --gates-only fully offline with no gameId at all', () => {
    const distRel = join(SCRATCH_REL, 'gates-dist')
    mkdirSync(join(ROOT, distRel, 'assets'), { recursive: true })
    writeFileSync(join(ROOT, distRel, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"><title>Mega Droid</title></head><body>'
      + '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'
      + '<script type="module" src="./assets/index.js"></script></body></html>')
    writeFileSync(join(ROOT, distRel, 'assets', 'index.js'), 'console.log("hi")')
    const file = join(SCRATCH, 'gates.config.mjs')
    writeFileSync(file, `export default {
      team: 'hyperg8', gameId: null, gameName: 'Mega Droid', build: 'node -e "process.exit(3)"',
      dist: ${JSON.stringify(distRel.replace(/\\/g, '/'))},
      zip: ${JSON.stringify(join(distRel, 'mega-droid-poki.zip').replace(/\\/g, '/'))},
      repack: true, allowHosts: [], versionName: v => 'Mega Droid ' + v
    }\n`)

    const r = deploy(['--config', file, '--gates-only'])
    const out = `${r.stdout}\n${r.stderr}`
    expect(r.status, out).toBe(0)
    expect(out).toMatch(/offline gates only/)
    expect(out).toMatch(/PASS\s+the archive is a real zip|PASS\s+index\.html at the archive root/)
    expect(out).toMatch(/gates only — stopping here/)
    expect(out).not.toMatch(/Browser|Upload to P4D/)
  })
})

describe('packing (lib/pack.mjs, pack.mjs, build:poki)', () => {
  it('packs a real PKZIP with index.html at the root, leaving old zips and backups out', async () => {
    const { packArtifact } = await load('lib/pack.mjs')
    const { listZip } = await load('lib/zip.mjs')
    const distRel = join(SCRATCH_REL, 'pack-dist')
    const dist = join(ROOT, distRel)
    mkdirSync(join(dist, 'assets'), { recursive: true })
    mkdirSync(join(dist, 'icons'), { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<html></html>')
    writeFileSync(join(dist, 'assets', 'index.js'), 'export {}')
    writeFileSync(join(dist, 'icons', 'icon-original.png'), 'backup')
    writeFileSync(join(dist, 'old-build.zip'), 'PK')

    const zipRel = join(distRel, 'out.zip')
    const r = packArtifact({ root: ROOT, cfg: { dist: distRel, zip: zipRel } })
    expect(r.ok, r.why).toBe(true)
    const zipBytes = readFileSync(join(ROOT, zipRel))
    expect(zipBytes.readUInt32LE(0)).toBe(0x04034b50) // PKZIP local header, not a TAR
    expect(listZip(join(ROOT, zipRel)).sort()).toEqual(['assets/index.js', 'index.html'])
  })

  it('reports a TAR named .zip as unreadable (the GNU tar trap)', async () => {
    const { inspectZip } = await load('lib/zip.mjs')
    const fake = join(SCRATCH, 'gnu-tar.zip')
    const tarHeader = Buffer.alloc(1024)
    tarHeader.write('index.html', 0, 'latin1')
    tarHeader.write('ustar', 257, 'latin1')
    writeFileSync(fake, tarHeader)
    const z = inspectZip(fake)
    expect(z.ok).toBe(false)
    expect(z.why).toMatch(/GNU tar wrote a TAR/)
  })

  it('build:poki ends in the pipeline packer, not a shell tar', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const script: string = pkg.scripts['build:poki']
    expect(script).toMatch(/^vite build --mode poki --base=\.\/ && node tools\/poki-deploy\/pack\.mjs$/)
    expect(script).not.toMatch(/\btar\b/)
  })
})

describe('release gates (lib/gates.mjs)', () => {
  const makeDist = (name: string, extraJs: string): string => {
    const distRel = join(SCRATCH_REL, name)
    mkdirSync(join(ROOT, distRel, 'assets'), { recursive: true })
    writeFileSync(join(ROOT, distRel, 'index.html'),
      '<html><head></head><body><script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'
      + '<script type="module" src="./assets/index.js"></script></body></html>')
    writeFileSync(join(ROOT, distRel, 'assets', 'index.js'), extraJs)
    return join(ROOT, distRel)
  }
  const purity = async (dist: string) => {
    const { runGates } = await load('lib/gates.mjs')
    return runGates({ dist, zip: null }).results.find((x: { name: string }) => x.name.startsWith('bundle purity'))
  }

  it('fails a bundle that still carries another portal\'s SDK', async () => {
    for (const marker of [
      'https://www.youtube.com/game_api/v1',
      'https://playgama.com/platform-sdk/wrap.v1.js',
      'https://an.yandex.ru/system/context.js',
      'https://api.glitch.fun/api/titles/',
      'https://small-mouse-123.convex.cloud'
    ]) {
      const res = await purity(makeDist(`dirty-${marker.length}`, `const u = ${JSON.stringify(marker)}`))
      expect(res.level, marker).toBe('fail')
    }
  })

  it('passes one that only names other portals in inert identifiers', async () => {
    const res = await purity(makeDist('clean', 'const f = { isCrazyWeb: false, isPlaygama: false, allowedToShowOnYandex: false }'))
    expect(res.level).toBe('pass')
  })

  it('fails a release carrying any dev-tooling marker the config forbids (clean build)', async () => {
    const { runGates } = await load('lib/gates.mjs')
    const { default: cfg } = await load('poki.config.mjs')
    const texts = cfg.forbidInBundle.map((f: { text: string }) => f.text)
    expect(texts).toEqual(expect.arrayContaining(['[CHEAT]', 'ctrl+shift+alt+', 'cmarc']))
    // The hidden 30-tap interstitial and the cheat panel (#Cheat1) ship in the
    // release on purpose.
    expect(texts).not.toContain('[qa-ad]')
    expect(texts).not.toContain('cmonc')
    const gate = (dist: string) => runGates({ dist, zip: null, forbid: cfg.forbidInBundle })
      .results.find((x: { name: string }) => x.name.startsWith('clean build'))
    for (const text of texts) {
      expect(gate(makeDist(`devtools-${texts.indexOf(text)}`, `console.warn(${JSON.stringify(text + ' x')})`)).level, text).toBe('fail')
    }
    expect(gate(makeDist('devtools-clean', 'console.log("ok")')).level).toBe('pass')
  })
})
