// Where a pit rescue sets Flux down (`Mission.pitFall`): on footing he stood
// on, well back from any drop, facing away from it.
//
// It used to take the newest footing a bare 1.6 m from where he fell. Run
// along a ledge and off its lip, and that was a spot 0.3 m from the same lip,
// with the yaw he had there (towards the pit): a held "forward" walked him
// straight back off a second later.

import { CELL, Cell } from '../world/levelGen'
import { floorAt, STEP_UP, type Nav } from '../world/nav'

/** Footing a rescue may use: never this close to the fall itself (m). */
export const RESCUE_CLEAR = 1.6
/** No drop this close to where a rescue sets Flux down, when the trail has
 *  such a spot (m). */
export const RESCUE_EDGE = 1.5
/** How far round the spot a drop still turns him away from it (m). */
const FACE_R = 3
/** How much the fall's own side counts in his facing, against the drops
 *  round him (each spoke that finds one counts 1 / its distance). */
const FALL_PULL = 3
const RINGS = [0.4, 0.8, 1.15, RESCUE_EDGE, 2.2, FACE_R]
const SPOKES = 16

export interface RescueSpot { x: number; y: number; z: number; yaw: number }

/** (x, z) is a drop for feet at `y`: a pit cell (a gap, spikes, lava, a
 *  crumbled slab's hole) with nothing there to stand on. A wall, a raised
 *  block or a ramp down is not. */
export const dropAt = (nav: Nav, x: number, z: number, y: number): boolean => {
  const m = nav.map
  const t = m.terrain
  if (!t) return false
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false
  const k = j * m.w + i
  if (m.cell[k] === Cell.Void || !t.pit[k]) return false
  return floorAt(nav, x, z, y) < y - STEP_UP
}

/** How far (x, z) stands from the nearest drop, up to FACE_R (m). */
export const dropClearance = (nav: Nav, x: number, z: number, y: number): number => {
  for (const r of RINGS) {
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2
      if (dropAt(nav, x + Math.sin(a) * r, z + Math.cos(a) * r, y)) return r
    }
  }
  return FACE_R
}

/** A yaw facing away from the fall at (fx, fz) and the drops round (x, z),
 *  the nearer the more they count: on a strip between two pits he turns from
 *  the one he fell into. (Flux's forward is (−sin yaw, −cos yaw).) */
export const awayYaw = (nav: Nav, x: number, z: number, y: number, fx: number, fz: number): number => {
  const f = Math.hypot(fx - x, fz - z) || 1
  let dx = ((fx - x) / f) * FALL_PULL
  let dz = ((fz - z) / f) * FALL_PULL
  for (const r of RINGS) {
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2
      if (!dropAt(nav, x + Math.sin(a) * r, z + Math.cos(a) * r, y)) continue
      dx += Math.sin(a) / r
      dz += Math.cos(a) / r
    }
  }
  return Math.atan2(dx, dz)
}

/**
 * The rescue's landing out of the footing trail (x, z, y, yaw; newest last)
 * for a fall at (fx, fz): the newest footing RESCUE_CLEAR from the fall with
 * no drop within RESCUE_EDGE, else the one standing furthest from any; null
 * with none clear of the fall (the caller takes the checkpoint). He faces
 * away from the drops, so a held "forward" walks him off the edge's way.
 */
export const rescueLanding = (
  nav: Nav, footing: ReadonlyArray<readonly [number, number, number, number]>, fx: number, fz: number
): RescueSpot | null => {
  let best: readonly [number, number, number, number] | null = null
  let bestClear = -1
  for (let k = footing.length - 1; k >= 0; k--) {
    const f = footing[k]!
    if (Math.hypot(f[0] - fx, f[1] - fz) < RESCUE_CLEAR) continue
    const c = dropClearance(nav, f[0], f[1], f[2])
    if (c > bestClear) {
      best = f
      bestClear = c
    }
    if (c > RESCUE_EDGE) break
  }
  if (!best) return null
  return { x: best[0], z: best[1], y: best[2], yaw: awayYaw(nav, best[0], best[1], best[2], fx, fz) }
}
