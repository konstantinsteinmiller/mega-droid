// Every dynamic `import('…')` in `src` sits in a file the obfuscator skips.
//
// Its stringArray pass rewrites string literals into decoder calls at random
// (`stringArrayThreshold`), and an `import()` whose path is a decoder call
// cannot be followed by the bundler: the chunk is never built, and the call
// fails in the shipped game. The obfuscated builds were missing nine of the
// ten platform stages and the Fortress's Core Descent that way (#121), while
// the dev server, which never obfuscates, played them all.
//
// The game's own lazy chunks load through `src/game/lazy.ts`.

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')

/** The obfuscator's `exclude` regexes, read from the Vite config. */
const excludes = (): RegExp[] => {
  const cfg = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
  const at = cfg.indexOf('exclude: [', cfg.indexOf('javascriptObfuscator({'))
  const block = cfg.slice(at, cfg.indexOf('\n        ],', at))
  const out: RegExp[] = []
  for (const line of block.split('\n')) {
    const m = /^\s*\/(.+)\/,?\s*$/.exec(line)
    if (m) out.push(new RegExp(m[1]!))
  }
  return out
}

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : /\.(ts|vue)$/.test(f) ? [p] : []
})

/** Dynamic imports that only run in a dev build (folded away in production). */
const DEV_ONLY: Record<string, string> = {
  // The level lab's test runs (`testBootTarget`, `leaveTestRun`).
  'src/game/flow.ts': 'level lab',
  // The cinematic trailer's seam, inside `import.meta.env.DEV`.
  'src/views/GameScene.vue': 'trailer seam'
}

describe('dynamic imports and the obfuscator', () => {
  it('the exclude list is read from the config', () => {
    expect(excludes().length).toBeGreaterThan(10)
  })

  it('no file the obfuscator transforms makes a dynamic import', () => {
    const ex = excludes()
    const offenders: string[] = []
    for (const f of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, f).replace(/\\/g, '/')
      if (DEV_ONLY[rel]) continue
      const code = readFileSync(f, 'utf8')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n')
      // Type positions are erased before the obfuscator sees the code:
      // `typeof import('…')` and `import('…').SomeType`.
      const runtime = [...code.matchAll(/(^|[^.\w$])import\(\s*['"`][^'"`]*['"`]\s*\)(\.[A-Z])?/gm)]
        .filter(m => !m[2] && !/typeof\s*$/.test(code.slice(0, m.index! + m[1]!.length)))
      if (!runtime.length) continue
      if (!ex.some(r => r.test(f) || r.test(rel))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
