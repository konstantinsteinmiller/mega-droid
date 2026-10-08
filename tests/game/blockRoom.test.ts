// @vitest-environment jsdom
// #128: the block lesson's Trooper stood near the room's entrance, so players
// turned to it first and the hologram teaching the perfect block was off
// screen. Playtest 2026-10-07: then it stood at the far end, away from the
// hologram too. It stands beside the hologram's own Trooper now, 2 m to its
// left as the player walks in: one view holds both.

import { describe, expect, it, vi } from 'vitest'

// The real rigs bake canvas textures jsdom cannot draw (as walkthrough.test.ts).
vi.mock('@/game/sim/enemies', () => ({
  createEnemy: (kind: string, level: number, x: number, z: number, room: number) => ({
    id: Math.random(), kind, level, x, z, y: 0, room, hp: 30, maxHp: 30, state: 'idle', awake: false, boss: false, yaw: 0
  })
}))

const { generateWakeUpCall } = await import('@/game/world/stages/tutorial')
const { createNav } = await import('@/game/world/nav')
const { cellCenter } = await import('@/game/world/levelGen')
const { planWalkthrough, doorwayOf, roomHoloSpot } = await import('@/game/sim/walkthrough')
const { spawnTutorial, TROOPER_BESIDE_HOLO } = await import('@/game/sim/spawn')
const { HOLO_TROOPER_X } = await import('@/game/fx/lessonHologram')

describe('the block room', () => {
  it('its Trooper stands 2 m left of the hologram Trooper, as seen from the way in, and keeps its spot', async () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const map = generateWakeUpCall(seed)
      const plan = planWalkthrough(map)
      const gate = plan.gates.find(g => g.steps.includes('block'))!
      expect(gate).toBeTruthy()
      const cast = await spawnTutorial(map, createNav(map), plan, 1)
      const t = cast.find(e => e.kind === 'trooper' && e.room === gate.room)!
      expect(t.rooted).toBe(true)
      const h = roomHoloSpot(map, plan, gate.room)!
      const ux = Math.cos(h.yaw)
      const uz = -Math.sin(h.yaw)
      const hx = h.x + ux * HOLO_TROOPER_X
      const hz = h.z + uz * HOLO_TROOPER_X
      expect(Math.hypot(t.x - hx, t.z - hz)).toBeCloseTo(TROOPER_BESIDE_HOLO, 5)
      // Left of the view from the doorway into the room.
      const [ix, iz] = doorwayOf(map, gate.room)
      const fx = hx - ix
      const fz = hz - iz
      const cross = fx * (t.z - hz) - fz * (t.x - hx)
      expect(cross).toBeLessThan(0)
    }
  })
})
