import { describe, expect, it, vi } from 'vitest'

// The blob shadow and the telegraph ring draw canvas textures (no 2D canvas
// under jsdom); plain objects stand in.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { createBoss, startBossIntro, updateBoss } from '@/game/sim/bosses'
import { BOSSES } from '@/game/data/bosses'
import { wake } from '@/game/sim/enemies'
import type { World } from '@/game/sim/world'

// The boss is not in its arena until its entrance: seen through the open
// shutter it used to stand on the floor, then snap up and drop in again.
const fakeWorld = (enemies: World['enemies']): World => ({
  enemies,
  player: { x: 0, z: 0 },
  shocks: { spawn: () => {} },
  // (`emit`: the landing's dust ring, #183.)
  fx: { sparks: () => {}, orbBurst: () => {}, emit: () => {} },
  shake: () => {},
  sfx: () => {}
}) as unknown as World

describe('boss entrance', () => {
  it('a new boss is offstage and idle', () => {
    const b = createBoss('scrapper', 1, 12, 12, 4)
    expect(b.offstage).toBe(true)
    expect(b.awake).toBe(false)
    expect(b.state).toBe('idle')
  })

  it('gunfire and hits cannot wake a boss that has not entered', () => {
    const b = createBoss('blazeMaster', 3, 12, 12, 4)
    wake(fakeWorld([b]), b)
    expect(b.awake).toBe(false)
    expect(b.state).toBe('idle')
  })

  it.each(['frostMaster', 'vexMk1'] as const)('%s starts its entrance above the walls, first drawn frame included', (id) => {
    const b = createBoss(id, 6, 12, 12, 4)
    startBossIntro(b)
    expect(b.offstage).toBe(false)
    expect(b.awake).toBe(true)
    expect(b.state).toBe('alert')
    // 9 m above its own height (a flyer's hover), over the 4.2 m walls.
    expect(b.y).toBe(BOSSES[id].fly + 9)
    // The render blends from the previous pose: it must be the top as well.
    expect(b.py).toBe(b.y)
    expect(b.px).toBe(b.x)
    expect(b.pz).toBe(b.z)
  })

  it.each(['scrapper', 'voltMaster', 'vexMk1'] as const)('%s lands at its own height', (id) => {
    const b = createBoss(id, 5, 12, 12, 4)
    const w = fakeWorld([b])
    startBossIntro(b)
    let prev = b.y
    for (let i = 0; i < 60; i++) {
      updateBoss(w, b, 1 / 60, null)
      // Falls the whole way, never back up.
      expect(b.y).toBeLessThanOrEqual(prev + 1e-9)
      prev = b.y
    }
    expect(b.y).toBeCloseTo(BOSSES[id].fly, 5)
  })
})
