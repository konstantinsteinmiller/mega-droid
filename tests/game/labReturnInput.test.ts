// @vitest-environment jsdom
// Back to the Lab (`returnToLab`): the mission beam stays up a moment while
// the Lab builds and is held (`flow.loadingLab`). Under it the player cannot
// see Flux, so a movement key held from the results screen must not walk him
// off before the beam lifts; once it has, a key still held moves him as usual.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { HubMode } from '@/game/sim/hub'
import { createInput } from '@/game/engine/input'
import { flow } from '@/game/flow'

describe('the Lab under the return beam', () => {
  it('holds Flux still against a held key until the beam lifts, then lets the key walk him', () => {
    const inp = createInput()
    const hub = new HubMode(inp, { kind: 'home' })
    const w = (hub as unknown as { walker: { x: number; z: number } }).walker
    const run = (s: number) => { for (let t = 0; t < s; t += 1 / 60) hub.update(1 / 60, true) }
    flow.loadingLab = true
    expect(hub.inputBlocked).toBe(true)
    // Long enough for his arrival to be over: he would be walking by now.
    run(0.5)
    const x0 = w.x
    const z0 = w.z
    inp.moveY = 1
    run(2)
    expect(Math.hypot(w.x - x0, w.z - z0)).toBeLessThan(1e-6)
    // The beam lifts: the same key, still held, moves him.
    flow.loadingLab = false
    expect(hub.inputBlocked).toBe(false)
    run(1)
    expect(Math.hypot(w.x - x0, w.z - z0)).toBeGreaterThan(0.5)
    hub.dispose()
  })
})
