import type { Enemy } from '../sim/world'
import type { Rig } from '../models/kit'
import { PLAYER_R } from '../sim/constants'

/**
 * ─── Near cut: no camera inside a body (#148) ────────────────────────────────
 *
 * A first-person eye inside a machine's mesh sees one flat colour (its
 * outline shell from the inside): playtests stood in a dead Puffer
 * Matriarch, teleported into a sleeping crate golem, and sat inside a
 * Master that had leapt onto Flux. When the eye is inside a body's column
 * its model is not drawn for the frame; it comes back once the eye is out.
 *
 * The column is the rig's bind-pose box round its own axis (scaled with
 * it). A live or sleeping body is held off Flux at its radius plus his
 * (`keepOffPlayer`), so its column stops short of that rim and a fight at
 * point blank never loses its foe; a corpse is not solid, so the whole of
 * its mesh counts.
 */

/** Slack over and under the box (m): the near plane and the eye's bob. */
const BAND = 0.1

/** Each rig's half-width, bottom and top (bind pose, its own units). */
const extent = new WeakMap<Rig, { r: number; lo: number; hi: number }>()
/** Rigs cut now, with their outline's own visibility to give back. */
const cut = new WeakMap<Rig, boolean>()

const extentOf = (rig: Rig): { r: number; lo: number; hi: number } => {
  let x = extent.get(rig)
  if (!x) {
    const g = rig.mesh.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    const b = g.boundingBox!
    x = { r: Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z, 0), lo: b.min.y, hi: b.max.y }
    extent.set(rig, x)
  }
  return x
}

/** Is the eye at (cx, cy, cz) inside the body as it is drawn this frame? */
export const eyeInBody = (e: Enemy, cx: number, cy: number, cz: number): boolean => {
  const ex = extentOf(e.rig)
  const s = e.rig.root.scale.x * e.root.scale.x
  const o = e.root.position
  const y = cy - o.y
  if (y < ex.lo * s - BAND || y > ex.hi * s + BAND) return false
  const mesh = ex.r * s
  const r = e.state === 'dead' ? Math.max(mesh, e.def.radius) : Math.min(mesh, e.def.radius + PLAYER_R * 0.5)
  return Math.hypot(cx - o.x, cz - o.z) < r
}

/** Hide (or bring back) the body's model for the eye at (cx, cy, cz). */
export const nearCut = (e: Enemy, cx: number, cy: number, cz: number): void => {
  const rig = e.rig
  const inside = eyeInBody(e, cx, cy, cz)
  const was = cut.get(rig)
  if (inside && was === undefined) {
    cut.set(rig, rig.outline?.visible ?? false)
    rig.mesh.visible = false
    if (rig.outline) rig.outline.visible = false
  } else if (!inside && was !== undefined) {
    cut.delete(rig)
    rig.mesh.visible = true
    if (rig.outline) rig.outline.visible = was
  }
}
