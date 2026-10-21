// Locked rooms never softlock (src/game/sim/lockSafety.ts). Playtest
// 2026-10-20, Blaze: the weapon lesson behind the boss waited on a drone
// hovering behind the shut door, and the beam-out pedestal stayed dark.
import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { roomCenter } from '@/game/world/levelGen'
import { EXIT_STALL, exitStalled, strayGuards } from '@/game/sim/lockSafety'
import type { Enemy } from '@/game/sim/world'

describe('the beam-out room never locks', () => {
  it('a weapon lesson with nothing to shoot lights the pedestal after EXIT_STALL', () => {
    expect(exitStalled(-1, 100)).toBe(false)
    expect(exitStalled(10, 10 + EXIT_STALL - 0.1)).toBe(false)
    expect(exitStalled(10, 10 + EXIT_STALL)).toBe(true)
  })
})

describe('a held room never waits on a machine outside it', () => {
  const map = generateStage('blaze', 1)
  const [a, b] = map.rooms
  const [ax, az] = roomCenter(a!)
  const [bx, bz] = roomCenter(b!)
  const mk = (x: number, z: number, over: Partial<Enemy> = {}) =>
    ({ room: a!.id, x, z, state: 'engage', boss: false, ...over }) as Enemy

  it('names the room\'s machines that stand outside it while Flux is in it', () => {
    const inside = mk(ax, az)
    const out = mk(bx, bz)
    const dead = mk(bx, bz, { state: 'dead' })
    const crate = mk(bx, bz, { dormant: true })
    const held = [{ room: a!.id }]
    expect(strayGuards(map, [inside, out, dead, crate], held, a!.id)).toEqual([out])
  })

  it('nothing while Flux is elsewhere, or the room is not held', () => {
    const out = mk(bx, bz)
    expect(strayGuards(map, [out], [{ room: a!.id }], b!.id)).toEqual([])
    expect(strayGuards(map, [out], [], a!.id)).toEqual([])
  })
})
