// @vitest-environment jsdom
// A staged level build (the tutorial's first rooms now, the rest while the
// player plays) must make exactly the level a whole build makes: the same
// vertices in every room, the same set-dressing runs, whichever pass built a
// room. The rolls (light strips, pipes, cloud puffs, pit lights) come off one
// stream in map order, so this fails if a pass skips one it should have taken.

import { describe, expect, it, vi } from 'vitest'
import type { Mesh } from 'three'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { buildClimbLevel } from '@/game/world/climbMesh'
import type { LevelMeshes } from '@/game/world/levelMesh'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { generateStage, isStageSector } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { THEMES, type SectorId } from '@/game/world/themes'
import type { MapData } from '@/game/world/levelGen'

/** Per room: every mesh's vertex count and a checksum of its positions. */
const fingerprint = (level: LevelMeshes): string[] =>
  level.rooms.map((g) => {
    const parts: string[] = []
    g.traverse((o) => {
      const m = o as Mesh
      const pos = m.geometry?.getAttribute('position')
      if (!pos) return
      let sum = 0
      for (let i = 0; i < pos.array.length; i++) sum += pos.array[i]! * ((i % 7) + 1)
      parts.push(`${pos.count}:${sum.toFixed(3)}`)
    })
    return parts.join('|')
  })

const hotOf = (map: MapData, n: number): Set<number> => new Set(map.rooms.slice(0, n).map(r => r.id))

const check = async (name: string, map: MapData, theme: (typeof THEMES)[SectorId]): Promise<void> => {
  const whole = await buildClimbLevel(map, theme)
  const staged = await buildClimbLevel(map, theme, undefined, undefined, hotOf(map, 3))
  expect(staged.pending?.size, name).toBe(map.rooms.length - 3)
  const early = fingerprint(staged)
  // Not built yet: an empty group.
  for (const r of staged.pending!) expect(early[r], `${name} room ${r} empty before fill`).toBe('')
  await staged.fill!([...staged.pending!].reverse())
  expect(staged.pending!.size).toBe(0)
  expect(fingerprint(staged), name).toEqual(fingerprint(whole))
  expect(staged.bounds, name).toEqual(whole.bounds)
}

describe('a staged level build', () => {
  it('the tutorial is the same whole or in stages', async () => {
    await check('tutorial', generateWakeUpCall(1), THEMES.scrapyard)
  })

  it('every stage and a tower run too', async () => {
    const sectors = (Object.keys(THEMES) as SectorId[]).filter(isStageSector)
    for (const s of sectors) await check(s, generateStage(s, 3), THEMES[s])
    await check('climb', generateClimb(7, false), THEMES.blaze)
  }, 180000)
})
