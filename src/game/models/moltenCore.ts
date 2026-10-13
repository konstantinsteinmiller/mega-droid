import {
  AdditiveBlending, BackSide, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, type BufferGeometry, type Side
} from 'three'
import { lavaMaterial } from './lava'
import { toonVC } from './toon'
import { merge, paint, rbox, torus, xform } from './kit'

/**
 * ─── The molten Core (the Core Descent's last stage, `sim/coreDescent.ts`) ──
 *
 * It was a white sphere in one flat orange shell: from the ring's walkway,
 * or with Vex coming down over it, it filled the view as one flat disc with
 * nothing to measure it by (playtest #155). Now it reads as a molten core of
 * a size: a lava surface that flows (the lava pits' own material), glow
 * shells that fall off outward, three energy rings at known radii turning at
 * different heights (each with a gap, so its turning shows), and a dark
 * steel containment hoop with clamps between it and the walkway — a solid
 * edge in the glow.
 */

/** The molten surface's radius (m). */
export const CORE_R = 1.75
/** The glow shells: radius (m) and opacity, falling off outward. */
export const CORE_GLOW: ReadonlyArray<readonly [number, number]> = [[2.15, 0.34], [2.8, 0.16], [3.6, 0.07]]
/** The energy rings: radius (m), height over the core's middle (m), opacity. */
export const CORE_RINGS: ReadonlyArray<readonly [number, number, number]> = [[2.6, 2.0, 0.75], [3.25, 1.3, 0.5], [3.9, 0.45, 0.32]]
/** The containment hoop's radius and height over the core's middle (m). */
export const HOOP_R = 4.05
export const HOOP_Y = 0.95

export interface MoltenCore {
  root: Group
  /** Its breathing and its turning rings, per frame (`time`, `dt` in s). */
  update(time: number, dt: number): void
}

const additive = (color: string, opacity: number, side: Side = DoubleSide): MeshBasicMaterial => new MeshBasicMaterial({
  color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side, toneMapped: false
})

/** The hoop and its clamps (merged into one toon mesh: `hoopGeometry`). */
export const hoopParts = (): BufferGeometry[] => {
  const parts = [xform(paint(torus(HOOP_R, 0.11, 8, 64), '#2b2e3a'), [0, HOOP_Y, 0], [Math.PI / 2, 0, 0])]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    parts.push(xform(paint(rbox(0.34, 0.36, 0.3, 0.3, 10, 8), i % 2 ? '#3d4252' : '#f2c230'),
      [Math.cos(a) * HOOP_R, HOOP_Y, Math.sin(a) * HOOP_R], [0, -a, 0]))
  }
  return parts
}
export const hoopGeometry = (): BufferGeometry => merge(hoopParts())

export const buildMoltenCore = (): MoltenCore => {
  const root = new Group()
  root.name = 'moltenCore'
  // The molten surface: the lava's flowing blotches, three times round.
  const surf = new SphereGeometry(CORE_R, 32, 20)
  const uv = surf.attributes.uv!
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3, uv.getY(k) * 1.5)
  root.add(new Mesh(surf, lavaMaterial()))
  // Glow falling off outward: each shell fainter than the one inside it.
  // Back faces only, so a shell never lays its front over the surface twice.
  const glows = CORE_GLOW.map(([r, op]) => {
    const m = new Mesh(new SphereGeometry(r, 28, 16), additive('#ff7a2a', op, BackSide))
    m.userData.base = op
    root.add(m)
    return m
  })
  const rings = CORE_RINGS.map(([r, y, op], i) => {
    // A gap in each, so its turning shows.
    const m = new Mesh(new RingGeometry(r - 0.12 - 0.04 * i, r, 64, 1, 0, Math.PI * 2 * 0.82), additive(i ? '#ff9a3a' : '#ffd36a', op))
    m.rotation.x = -Math.PI / 2
    m.position.y = y
    m.userData.y = y
    root.add(m)
    return m
  })
  const hoop = new Mesh(hoopGeometry(), toonVC())
  hoop.name = 'hoop'
  root.add(hoop)
  return {
    root,
    update: (time, dt) => {
      const k = 0.5 + 0.5 * Math.sin(time * 2.4)
      glows.forEach((g, i) => {
        ;(g.material as MeshBasicMaterial).opacity = (g.userData.base as number) * (0.75 + 0.5 * k)
        g.scale.setScalar(1 + 0.06 * k * (i + 1))
      })
      rings.forEach((r, i) => {
        r.rotation.z += dt * (i % 2 ? -0.45 : 0.6)
        r.position.y = (r.userData.y as number) + 0.15 * Math.sin(time * 1.3 + i * 1.9)
      })
    }
  }
}
