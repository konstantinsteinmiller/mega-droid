// @vitest-environment jsdom
// The lab's workstations (`models/labConsole.ts`) and the forge's lever
// hammer (`models/hubHall.ts`), from a playtest of the walkable lab:
// - the old consoles were a block with a slab on top, the screen rolled
//   sideways (a pitch applied after the yaw) and floating off its block;
//   now a desk with a keyboard of real keys and a monitor on a neck, its
//   screen level, proud of its bezel by centimetres, its faces never coplanar;
// - the forge hammer swung on a pendulum from the ceiling and struck the anvil
//   from the side; now a lever on an axle whose head falls onto the plate
//   from above.

import { describe, expect, it } from 'vitest'
import { Group, Mesh, Object3D, Vector3 } from 'three'
import { buildLabConsole, labConsoleParts, SCREEN_PROUD } from '@/game/models/labConsole'
import { forgeAnvil, forgeHammer, forgePivot, HAMMER_ARM } from '@/game/models/hubHall'
import { POI_BY_ID } from '@/game/world/hubLayout'
import { coplanarPairs } from './coplanar'

const box = (gs: Array<{ computeBoundingBox(): void; boundingBox: { min: Vector3; max: Vector3 } | null }>) => {
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const g of gs) {
    g.computeBoundingBox()
    min.min(g.boundingBox!.min)
    max.max(g.boundingBox!.max)
  }
  return { min, max }
}

describe('the lab\'s workstations', () => {
  it('no two faces of a desk in one plane', () => {
    const { toon, glow } = labConsoleParts('#3cff9a')
    expect(coplanarPairs([...toon, ...glow], 0.01)).toEqual([])
  })

  it('a keyboard of keys on the desk, a monitor over it on its neck', () => {
    const { toon, glow } = labConsoleParts('#3cc8ff')
    // Dozens of keys (small parts), not a slab.
    const small = [...toon, ...glow].filter((g) => {
      const b = box([g])
      return b.max.x - b.min.x < 0.1 && b.max.z - b.min.z < 0.1 && b.max.y - b.min.y < 0.06
    })
    expect(small.length).toBeGreaterThanOrEqual(40)
    // Everything stands on the floor or on something: nothing below it, the
    // whole desk within its footprint in the lab (`LAB_POSTS`' 0.95 m).
    const all = box([...toon, ...glow])
    expect(all.min.y).toBeGreaterThanOrEqual(-0.06)
    for (const g of [...toon, ...glow]) {
      g.computeBoundingBox()
      const b = g.boundingBox!
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) expect(Math.hypot(x, z)).toBeLessThan(0.95)
    }
  })

  it('its screen sits level in the bezel, proud of its face, facing the operator', () => {
    for (const s of [-1, 1] as const) {
      const toon: never[] = []
      const glow: never[] = []
      const root: Group = buildLabConsole(s, toon, glow)
      root.updateMatrixWorld(true)
      let screen: Mesh | null = null
      root.traverse((o: Object3D) => { if ((o as Mesh).isMesh) screen = o as Mesh })
      expect(screen).toBeTruthy()
      const m = screen!.matrixWorld
      // Its own x axis stays horizontal (no roll), its normal tilts back a touch.
      const right = new Vector3(1, 0, 0).transformDirection(m)
      expect(Math.abs(right.y)).toBeLessThan(1e-6)
      const n = new Vector3(0, 0, 1).transformDirection(m)
      expect(n.y).toBeGreaterThan(0)
      expect(n.y).toBeLessThan(0.25)
      // Toward the teleporter in the lab's middle.
      const at = new Vector3().setFromMatrixPosition(m)
      expect(n.x * -at.x + n.z * -at.z).toBeGreaterThan(0)
    }
    expect(SCREEN_PROUD).toBeGreaterThanOrEqual(0.01)
  })
})

describe('the forge\'s lever hammer', () => {
  /** The head's striking face (its bottom middle) at lift `a` (rad). */
  const head = (side: -1 | 1, z: number, a: number): Vector3 => {
    const o = new Object3D()
    o.position.set(...forgePivot(side, z))
    o.rotation.set(0, side > 0 ? Math.PI : 0, a)
    o.updateMatrixWorld(true)
    return new Vector3(HAMMER_ARM, -0.29, 0).applyMatrix4(o.matrixWorld)
  }

  it('rests on the anvil\'s plate, just clear of it, over its middle', () => {
    for (const side of [-1, 1] as const) {
      const z = POI_BY_ID.workshop.z
      const [ax, ay, az] = forgeAnvil(side, z)
      const h = head(side, z, 0)
      expect(Math.hypot(h.x - ax, h.z - az)).toBeLessThan(0.05)
      // 1–5 cm over the plate's top (its glow slab tops out at 1.045 m).
      expect(h.y - (ay - 0.005)).toBeGreaterThan(0.01)
      expect(h.y - (ay - 0.005)).toBeLessThan(0.05)
    }
  })

  it('comes down onto it from above, not swinging in from the side', () => {
    const z = POI_BY_ID.workshop.z
    const side = POI_BY_ID.workshop.side as -1 | 1
    // The last stretch of the fall: far more down than across.
    const a = head(side, z, 0.12)
    const b = head(side, z, 0)
    expect(a.y - b.y).toBeGreaterThan(4 * Math.hypot(a.x - b.x, a.z - b.z))
    // Raised, it clears the plate by a good half metre.
    expect(head(side, z, 0.5).y - b.y).toBeGreaterThan(0.5)
  })

  it('its parts never coplanar', () => {
    const p = forgeHammer()
    expect(coplanarPairs([...p.toon, ...p.glow], 0.01)).toEqual([])
  })
})
