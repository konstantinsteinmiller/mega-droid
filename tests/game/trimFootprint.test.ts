// Trims at the foot of round posts never stick out past them: a square
// plate or stripe under a round pillar shows its corners (playtest
// 2026-10-18: yellow corners under the Blaze Master's cover pillar, and the
// door stripes under the round door posts in every sector).
import { describe, expect, it } from 'vitest'
import { Vector3, type BufferGeometry } from 'three'
import { rcyl, xform } from '@/game/models/kit'
import { WALL_H, CELL } from '@/game/world/levelGen'
import {
  baseboardGeo, wallPilasterGeo, DOOR_POST_R, DOOR_POST_BEVEL, DOOR_STRIPE_HW, DOOR_STRIPE_Y
} from '@/game/world/levelMesh'
import { coplanarOverlaps } from './coplanar'

const verts = (g: BufferGeometry): Vector3[] => {
  const p = g.getAttribute('position')
  const out: Vector3[] = []
  for (let i = 0; i < p.count; i++) out.push(new Vector3(p.getX(i), p.getY(i), p.getZ(i)))
  return out
}

/** A lathed post's radius at height y, inscribed (the flat between facets),
 *  read off its own vertices: interpolated between the rings around y. */
const postRadiusAt = (g: BufferGeometry, y: number, segs: number): number => {
  const rings = new Map<number, number>()
  for (const v of verts(g)) {
    const k = Math.round(v.y * 1e4) / 1e4
    rings.set(k, Math.max(rings.get(k) ?? 0, Math.hypot(v.x, v.z)))
  }
  const ys = [...rings.keys()].sort((a, b) => a - b)
  for (let i = 0; i < ys.length - 1; i++) {
    const a = ys[i]!
    const b = ys[i + 1]!
    if (y < a || y > b) continue
    const t = (y - a) / (b - a || 1)
    return (rings.get(a)! * (1 - t) + rings.get(b)! * t) * Math.cos(Math.PI / segs)
  }
  return 0
}

describe('trims at the foot of round posts', () => {
  it('the door stripe\'s corners stay under the round door posts', () => {
    // Posts on the stripe's two ends, foot at y = 0.
    const post = xform(rcyl(DOOR_POST_R, WALL_H, DOOR_POST_BEVEL, 16), [0, WALL_H / 2, 0])
    expect(DOOR_STRIPE_HW).toBeLessThan(postRadiusAt(post, DOOR_STRIPE_Y, 16))
  })

  it('the door stripe floats clear of the floor by centimetres, not millimetres', () => {
    expect(DOOR_STRIPE_Y).toBeGreaterThanOrEqual(0.015)
  })

  it('a baseboard\'s rounded ends tuck inside the corner pilasters', () => {
    // A wall along x from corner (0, 0) to (CELL, 0), facing +z, as levelMesh
    // lays it: baseboard 0.06 off the wall, centred 0.14 up, turned along x.
    const pil = xform(wallPilasterGeo(), [0, (WALL_H + 0.25) / 2, 0])
    const bb = xform(baseboardGeo(), [CELL / 2, 0.14, 0.06], [0, 0, Math.PI / 2])
    let out = 0
    for (const v of verts(bb)) {
      // Only the stretch past the wall's own face run can show: the part in
      // the pilaster's reach (x < 0.3) must be inside it.
      if (v.x >= 0.3 || v.z <= 0) continue
      if (Math.hypot(v.x, v.z) > postRadiusAt(pil, v.y, 14) + 1e-3) out++
    }
    expect(out).toBe(0)
    expect(coplanarOverlaps([pil, bb])).toBe(0)
  })
})
