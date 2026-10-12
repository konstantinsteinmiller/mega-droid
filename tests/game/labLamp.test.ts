// @vitest-environment jsdom
// The lab's ceiling lamp (`sim/hub.ts` buildLabSet): its glowing ring used to
// float at 7.2 m with nothing over it (placement audit 2026-10-12). Now it
// hangs: spokes from the ring into its housing, a rod from the housing up
// into a gantry, the gantry on posts standing on the lab floor behind the
// back wall — every member joined end to end, and no two flat faces of its
// parts in one plane.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { labLampMounts, labLampParts, LAMP_R, LAMP_Y, GANTRY_Y } from '@/game/sim/hub'
import { coplanarOverlaps } from './coplanar'

const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps

describe('the lab ceiling lamp hangs from something', () => {
  it('ring → spokes → housing → hanger → gantry → posts → floor', () => {
    const m = labLampMounts()
    const ringEnds = m.filter(s => near(Math.hypot(s.b[0], s.b[2]), LAMP_R) && near(s.b[1], LAMP_Y))
    // Spokes all round the ring (no side of it left hanging), into the housing.
    expect(ringEnds.length).toBeGreaterThanOrEqual(4)
    const angles = ringEnds.map(s => Math.atan2(s.b[2], s.b[0])).sort((a, b) => a - b)
    for (let k = 0; k < angles.length; k++) {
      const gap = (k + 1 < angles.length ? angles[k + 1]! : angles[0]! + Math.PI * 2) - angles[k]!
      expect(gap).toBeLessThanOrEqual(Math.PI / 2 + 1e-6)
    }
    for (const s of ringEnds) {
      // Its inner end inside the housing (an ellipsoid 1.4 × 0.4 at LAMP_Y + 0.4).
      const [x, y, z] = s.a
      expect((x * x + z * z) / (1.4 * 1.4) + ((y - LAMP_Y - 0.4) / 0.4) ** 2).toBeLessThan(1)
    }
    // The hanger: from inside the housing up to the gantry.
    const hanger = m.find(s => near(s.a[0], 0) && near(s.a[2], 0) && near(s.b[0], 0) && near(s.b[2], 0))!
    expect(hanger).toBeTruthy()
    expect(hanger.a[1]).toBeLessThan(LAMP_Y + 0.8)
    expect(hanger.b[1]).toBeCloseTo(GANTRY_Y, 5)
    // The posts: from the floor (y ≤ 0) up to the gantry, out past the back wall.
    const posts = m.filter(s => s.a[1] <= 0 && near(s.b[1], GANTRY_Y) && Math.hypot(s.a[0], s.a[2]) > 8)
    expect(posts.length).toBeGreaterThanOrEqual(2)
    for (const p of posts) expect(p.a[0]).toBe(p.b[0])
  })

  it('no coplanar faces between its parts', () => {
    const { toon, glow } = labLampParts()
    expect(coplanarOverlaps([...toon, ...glow])).toBe(0)
  })
})
