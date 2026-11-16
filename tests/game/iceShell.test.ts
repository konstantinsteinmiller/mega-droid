// The Ice Lance's shell of ice (#203): a chilled machine wears a crystal with
// spikes, popping in with an overshoot, shivering as it thaws; every shell
// shares one geometry and one material per kind.

import { describe, expect, it } from 'vitest'
import { Mesh } from 'three'
import { buildIceShell, iceGrow, tickIceShell } from '@/game/fx/iceShell'

describe('the shell', () => {
  it('a body of ice with a ring of spikes, hidden until the chill lands', () => {
    const g = buildIceShell(1.6, 0.7)
    expect(g.children.length).toBeGreaterThanOrEqual(6)
    expect(g.visible).toBe(false)
    // Round the body: taller machines get taller ice.
    const tall = buildIceShell(3, 0.7).children[0] as Mesh
    const short = buildIceShell(1, 0.7).children[0] as Mesh
    expect(tall.scale.y).toBeGreaterThan(short.scale.y)
  })

  it('shells share geometry and materials (one draw per kind)', () => {
    const a = buildIceShell(1.6, 0.7).children as Mesh[]
    const b = buildIceShell(2.4, 1).children as Mesh[]
    expect(a[0]!.geometry).toBe(b[0]!.geometry)
    expect(a[0]!.material).toBe(b[0]!.material)
    expect(a[1]!.geometry).toBe(b[1]!.geometry)
    expect(a[1]!.material).toBe(b[1]!.material)
  })
})

describe('the pop-in', () => {
  it('grows from nothing to full size, overshooting on the way', () => {
    expect(iceGrow(0)).toBe(0)
    expect(iceGrow(1)).toBe(1)
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => iceGrow((i + 1) / 100)))
    expect(peak).toBeGreaterThan(1.05)
  })

  it('shows once it has begun to grow, and shivers only in the last moments', () => {
    const g = buildIceShell(1.6, 0.7)
    tickIceShell(g, 0, 3, 0)
    expect(g.visible).toBe(false)
    tickIceShell(g, 1, 3, 0.123)
    expect(g.visible).toBe(true)
    expect(g.scale.x).toBeCloseTo(1, 5)
    let moved = false
    for (let t = 0; t < 1; t += 0.013) {
      tickIceShell(g, 1, 0.2, t)
      if (Math.abs(g.scale.x - 1) > 0.005) moved = true
    }
    expect(moved).toBe(true)
  })
})
