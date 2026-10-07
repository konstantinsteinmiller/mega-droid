// @vitest-environment jsdom
// #128: the block lesson's Trooper stood near the room's entrance, so players
// turned to it first and the hologram teaching the perfect block was off
// screen. It stands at the far end now, in front of the way out: the walk to
// it passes the hologram.

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
const { planWalkthrough, doorwayOf } = await import('@/game/sim/walkthrough')
const { spawnTutorial } = await import('@/game/sim/spawn')

describe('the block room', () => {
  it('its Trooper guards the way out, far from the way in, and keeps its spot', async () => {
    const map = generateWakeUpCall(1)
    const plan = planWalkthrough(map)
    const gate = plan.gates.find(g => g.steps.includes('block'))!
    expect(gate).toBeTruthy()
    const cast = await spawnTutorial(map, createNav(map), plan, 1)
    const t = cast.find(e => e.kind === 'trooper' && e.room === gate.room)!
    expect(t.rooted).toBe(true)
    const [ix, iz] = doorwayOf(map, gate.room)
    const out = map.doors[gate.door]!
    const toExit = Math.hypot(t.x - cellCenter(out.i), t.z - cellCenter(out.j))
    const toEntry = Math.hypot(t.x - ix, t.z - iz)
    expect(toExit).toBeLessThan(toEntry)
  })
})
