// @vitest-environment node
//
// ─── Platform policy: one resolver for the UI rule and for what ships ────────
//
// `src/platforms/policy.ts` is read twice: by the app (`platformPolicy` in
// capabilities.ts) and by `vite.config.ts`, which aliases dev tooling out of a
// build whose policy forbids it (`devToolAliases`). Poki's hard requirements ask
// for a clean build — "no debug code, no dev artifacts" — so its RELEASE build
// must carry neither the `localStorage.cheat` cheats nor the typed "cmarc"
// debug toggle. The hidden 30-tap interstitial is NOT dev tooling: it ships in
// every build, releases included, and no gate refuses it.
//
// Pinned here, all without evaluating the Vite config itself (importing it —
// every build plugin, esbuild — once timed out under full-suite load):
//   • the rules, and the alias map each policy produces;
//   • that `vite.config.ts` resolves the policy from the env flags and spreads
//     `devToolAliases(...)` ahead of the `@` catch-all (a source pin — the alias
//     must win resolution, or the real modules would still be bundled);
//   • the stubs' export parity (a missing export would break only the Poki build).
// End to end, the Poki release gate "clean build (no dev tooling)" greps the
// BUILT artifact for the tooling's own strings on every `deploy:poki`.
// The `cheat` flag's side is in pokiCleanBuild.test.ts (it needs jsdom).

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEV_TOOL_MARKERS, DEV_TOOL_STUBS, devToolAliases, resolvePlatformPolicy } from '@/platforms/policy'

const ROOT = resolve(__dirname, '..', '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')

describe('resolvePlatformPolicy', () => {
  it('Poki release: free option first, no dev tooling', () => {
    expect(resolvePlatformPolicy({ isPoki: true })).toEqual({ freeOptionFirst: true, devTools: false })
  })

  it('Poki QA twin (VITE_POKI_QA_TOOLS): keeps the tooling, keeps the layout rule', () => {
    expect(resolvePlatformPolicy({ isPoki: true, qaTools: true })).toEqual({ freeOptionFirst: true, devTools: true })
  })

  it('every other build: unchanged', () => {
    expect(resolvePlatformPolicy({ isPoki: false })).toEqual({ freeOptionFirst: false, devTools: true })
  })
})

describe('dev tooling is aliased out of the Poki release', () => {
  it('Poki release: both dev-cheat modules resolve to their stubs', () => {
    expect(devToolAliases(resolvePlatformPolicy({ isPoki: true }))).toEqual({
      '@/use/devCheats': 'src/use/devCheats.stub.ts',
      '@/game/cheats': 'src/game/cheats.stub.ts'
    })
  })

  it('the cheat panel and its "cmonc" toggle (#Cheat1) ship in the Poki and Playgama releases', async () => {
    for (const policy of [resolvePlatformPolicy({ isPoki: true }), resolvePlatformPolicy({ isPoki: false, isPlaygama: true })]) {
      expect(devToolAliases(policy)).not.toHaveProperty('@/use/useCheats')
    }
    expect(existsSync(resolve(ROOT, 'src/use/useCheats.stub.ts'))).toBe(false)
    expect(DEV_TOOL_MARKERS.map((m) => m.text)).not.toContain('cmonc')
    const poki = (await import(pathToFileURL(resolve(ROOT, 'tools/poki-deploy/poki.config.mjs')).href)).default
    expect(poki.forbidInBundle.map((f: { text: string }) => f.text)).not.toContain('cmonc')
    // The shipped module carries the toggle and none of the strings the gates refuse.
    const src = read('src/use/useCheats.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(src).toContain("'cmonc'")
    for (const { text } of DEV_TOOL_MARKERS) expect(src, text).not.toContain(text)
  })

  it('the hidden 30-tap interstitial ships in the Poki and Playgama releases', async () => {
    for (const policy of [resolvePlatformPolicy({ isPoki: true }), resolvePlatformPolicy({ isPoki: false, isPlaygama: true })]) {
      expect(devToolAliases(policy)).not.toHaveProperty('@/use/useQaAdTrigger')
    }
    expect(DEV_TOOL_MARKERS.map((m) => m.text)).not.toContain('[qa-ad]')
    const poki = (await import(pathToFileURL(resolve(ROOT, 'tools/poki-deploy/poki.config.mjs')).href)).default
    expect(poki.forbidInBundle.map((f: { text: string }) => f.text)).not.toContain('[qa-ad]')
    // No stub left behind for a stray alias to pick up.
    expect(existsSync(resolve(ROOT, 'src/use/useQaAdTrigger.stub.ts'))).toBe(false)
  })

  it('Poki QA twin and non-Poki builds keep the real modules', () => {
    expect(devToolAliases(resolvePlatformPolicy({ isPoki: true, qaTools: true }))).toEqual({})
    expect(devToolAliases(resolvePlatformPolicy({ isPoki: false }))).toEqual({})
  })

  it('vite.config.ts resolves the policy from the env and applies the aliases before the "@" catch-all', () => {
    const cfg = read('vite.config.ts')
    // The policy comes from THE flags of the build being configured.
    expect(cfg).toMatch(/const isPokiBuild = env\.VITE_APP_POKI === 'true'/)
    // (Playgama joined the clean releases, and the QA-twin flag was generalised
    // to VITE_QA_TOOLS with the Poki-era name kept — see playgamaCleanBuild.test.ts.)
    expect(cfg).toMatch(/resolvePlatformPolicy\(\{\s*isPoki: isPokiBuild,\s*isPlaygama: isPlaygamaBuild,\s*qaTools: env\.VITE_POKI_QA_TOOLS === 'true' \|\| env\.VITE_QA_TOOLS === 'true'\s*\}\)/)
    // …and its aliases are spread into resolve.alias, ahead of '@'.
    const spread = cfg.indexOf('devToolAliases(platformPolicy)')
    const catchAll = cfg.indexOf("'@': fileURLToPath(new URL('./src', import.meta.url))")
    expect(spread, 'devToolAliases(platformPolicy) is not used').toBeGreaterThan(-1)
    expect(catchAll).toBeGreaterThan(-1)
    expect(spread).toBeLessThan(catchAll)
  })

  it('each stub exists and exports exactly what the real module exports', () => {
    const exportsOf = (rel: string): string[] => {
      const src = read(rel)
      const names = [...src.matchAll(/^export\s+(?:const|function|let)\s+(\w+)/gm)].map((m) => m[1]!)
      if (/^export\s+default\b/m.test(src)) names.push('default')
      return names.sort()
    }
    for (const [id, stub] of Object.entries(DEV_TOOL_STUBS)) {
      expect(existsSync(resolve(ROOT, stub)), stub).toBe(true)
      const real = `src/${id.slice(2)}.ts`
      expect(exportsOf(stub), `${stub} vs ${real}`).toEqual(exportsOf(real))
    }
  })
})
