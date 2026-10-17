// @vitest-environment jsdom
// The intro's neon street (`models/street.ts`, #170): the skyline rings and
// the Volt Tower stood on nothing — past the street's end and between its
// towers the buildings floated over the sky's low band (most visible as the
// big Guardroid drops in and just before). A ground now reaches out to the
// far ring, under the asphalt and never in the plane of any other face.

import { describe, expect, it } from 'vitest'
import { BackSide, BufferGeometry, Mesh, Raycaster, Vector3 } from 'three'
import { buildStreet, FACADE_GAP, STREET_GROUND_R, STREET_GROUND_Y } from '@/game/models/street'
import { coplanarOverlaps, coplanarPairs } from './coplanar'

describe('the intro street', () => {
  const street = buildStreet()
  street.root.updateMatrixWorld(true)
  const ground = street.root.getObjectByName('streetGround') as Mesh

  it('has ground under the skyline: below the rings, past the street\'s end, behind its towers', () => {
    expect(ground).toBeTruthy()
    const ray = new Raycaster()
    const down = new Vector3(0, -1, 0)
    // Round the near ring (95 m) and just inside the far one (150 m), and
    // behind the towers along the street.
    const probes: Vector3[] = []
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      for (const r of [20, 60, 95, STREET_GROUND_R - 2]) probes.push(new Vector3(Math.cos(a) * r, 5, Math.sin(a) * r))
    }
    for (const z of [-10, -30, -45, -60]) for (const x of [-12, 12]) probes.push(new Vector3(x, 5, z))
    for (const p of probes) {
      ray.set(p, down)
      const hit = ray.intersectObject(ground)[0]
      expect(hit, `no ground under (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBeTruthy()
      expect(hit!.point.y).toBeCloseTo(STREET_GROUND_Y, 5)
    }
  })

  it('the ground lies clear under the asphalt and shares no plane with any other opaque face', () => {
    // The asphalt's underside is at -0.2: centimetres apart would still fight.
    expect(-0.2 - STREET_GROUND_Y).toBeGreaterThanOrEqual(0.3)
    const parts: BufferGeometry[] = []
    const seen = new Set<BufferGeometry>()
    street.root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || m === ground || seen.has(m.geometry)) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      if (mats.some(x => x.transparent)) return
      seen.add(m.geometry)
      parts.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
    })
    expect(parts.length).toBeGreaterThan(1)
    // What the ground adds: none (the street's own parts are not this test's).
    const g = ground.geometry.clone().applyMatrix4(ground.matrixWorld)
    expect(coplanarOverlaps([g, ...parts])).toBe(coplanarOverlaps(parts))
  })

  it('has no two opaque faces in one plane anywhere on the set — the merged pieces too', () => {
    // The window-grid facades stood a centimetre off their towers' faces and
    // the neon strips stood half through them: they tore at 15-40 m. Every
    // piece of the merged set, every separate opaque mesh, the ground; faces
    // closer than 3 cm count as one plane (what a depth buffer at the far
    // end of the street cannot tell apart).
    const s = buildStreet({ keepParts: true })
    s.root.updateMatrixWorld(true)
    const parts: BufferGeometry[] = [...s.parts!]
    expect(parts.length).toBeGreaterThan(100)
    s.root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      // Transparent / additive layers write no depth; the merged meshes'
      // pieces are in `parts` already; the sky is inside-out round them all.
      if (mats.some(x => x.transparent || x.vertexColors || x.side === BackSide)) return
      parts.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
    })
    const bad = coplanarPairs(parts, 0.03)
    expect(bad.map(b => b.at.toArray().map(v => v.toFixed(2)).join(', '))).toEqual([])
    expect(FACADE_GAP).toBeGreaterThanOrEqual(0.05)
  })
})
