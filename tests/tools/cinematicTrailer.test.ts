// @vitest-environment node
//
// ─── The cinematic trailer's cut sheet (roadmap #X1) ────────────────────────
//
// `pnpm cinematic-trailer` cuts the shot library (tools/preview-video/
// scenarios/_shots.mjs) to the boss theme's bars (tools/cinematic-trailer/
// cut.mjs). A typo'd shot id or a voice file that was renamed would only show
// up 20 minutes into a render; the length promise (60–90 s, ask #X1) and the
// cut-on-a-downbeat rule would drift silently with every edit. All pinned here.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..')
const load = async <T = any>(rel: string): Promise<T> => await import(pathToFileURL(join(ROOT, rel)).href)

describe('cinematic trailer cut sheet', () => {
  it('cuts only shots the library has, each a whole number of bars', async () => {
    const { CUT } = await load('tools/cinematic-trailer/cut.mjs')
    const { SHOTS } = await load('tools/preview-video/scenarios/_shots.mjs')
    for (const s of CUT.shots) {
      expect(SHOTS[s.id], s.id).toBeDefined()
      expect(typeof SHOTS[s.id].stage, s.id).toBe('function')
      expect(Number.isInteger(s.bars) && s.bars > 0, s.id).toBe(true)
    }
    expect(new Set(CUT.shots.map((s: { id: string }) => s.id)).size).toBe(CUT.shots.length)
  })

  it('runs 60–90 s, end card included', async () => {
    const { CUT, BAR_S } = await load('tools/cinematic-trailer/cut.mjs')
    const bars = CUT.shots.reduce((n: number, s: { bars: number }) => n + s.bars, 0) + CUT.endCard.bars
    const seconds = bars * BAR_S
    expect(seconds).toBeGreaterThanOrEqual(60)
    expect(seconds).toBeLessThanOrEqual(90)
  })

  it('speaks only shipped English takes, inside their shots', async () => {
    const { CUT, VOICE_DIR, BAR_S } = await load('tools/cinematic-trailer/cut.mjs')
    for (const s of CUT.shots) {
      for (const v of s.vo ?? []) {
        expect(existsSync(join(ROOT, VOICE_DIR, `${v.line}.ogg`)), v.line).toBe(true)
        expect(v.beat * BAR_S / 4).toBeLessThan(s.bars * BAR_S)
      }
    }
    // Atlas carries the trailer: most of its lines are his.
    const lines = CUT.shots.flatMap((s: { vo?: { line: string }[] }) => s.vo ?? []).map((v: { line: string }) => v.line)
    expect(lines.filter((l: string) => /atlas/.test(l)).length).toBeGreaterThanOrEqual(5)
  })
})

describe('sound tap', () => {
  it('hears every sfx call with the clamped pan, played or not', async () => {
    const { sfx, setSfxTap, setSfxPlayer } = await import('@/game/audio/sfx')
    const heard: unknown[] = []
    setSfxPlayer(null)
    setSfxTap((n, p, g, m) => heard.push([n, p, g, m]))
    sfx('explode', 3, 0.8, -1)
    setSfxTap(null)
    sfx('shoot')
    expect(heard).toEqual([['explode', 1, 0.8, 0]])
  })
})
