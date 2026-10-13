import type { BufferGeometry } from 'three'
import { cap, paint, torus, xform, type V3 } from '../models/kit'
import { CELL } from './levelGen'

/**
 * ─── A wall pipe: the level meshes' plain wall dressing ──────────────────────
 *
 * A run along one wall cell, high over the floor, that comes out of the wall
 * at one end and goes back into it at the other, with a clamp in its middle.
 * It was a thick capsule a cell and a bit long at head height, 0.2 m off the
 * wall: its rounded ends hung in mid-air past the wall's own end (a doorway,
 * an outer corner) or poked into the next wall, and walking along the wall
 * it filled the top of the view (playtest #156, Neon, Rotor, the supply run).
 *
 * Now it stays inside its own cell edge (clear of the corner pilasters),
 * hugs the wall, and runs over everyone's head: both ends in the wall.
 */

/** The pipe's radius, and its axis's distance off the wall (m). */
export const PIPE_R = 0.08
export const PIPE_OFF = 0.17
/** Kept this far in from each end of its cell edge (the pilasters there). */
export const PIPE_END = 0.55
/** Never lower than this over its floor (m): over the head of anything that
 *  walks (Flux's eye is at 1.36, a Trooper's helmet under 2.3). */
export const PIPE_MIN_Y = 2.75
/** Its height over the floor: PIPE_LOW … PIPE_LOW + PIPE_SPAN (m). */
const PIPE_LOW = 3.05
const PIPE_SPAN = 0.4
/** Kept this far (m) under the wall's top trim. */
const PIPE_TOP_GAP = 0.45

/**
 * Where a pipe runs on a wall whose floor is `fy` and whose top is `topY`,
 * `u` 0..1 a random pick (`lift`: a ramp's extra height). Null when the wall
 * is too low for one over head height.
 */
export const wallPipeY = (fy: number, topY: number, u: number, lift = 0): number | null => {
  const y = Math.min(fy + lift + PIPE_LOW + u * PIPE_SPAN, topY - PIPE_TOP_GAP)
  return y - fy - lift >= PIPE_MIN_Y ? y : null
}

/**
 * The pipe on the wall edge whose middle is (mx, mz), facing along `n` (into
 * the walkable cell), at height y; `alongX`: the edge runs along x. Its
 * parts, ready to merge into the room's decor.
 */
export const wallPipe = (
  mx: number, mz: number, n: readonly [number, number, number], y: number, alongX: boolean, color: string, clamp: string
): BufferGeometry[] => {
  const len = CELL - 2 * PIPE_END
  // The run: along the wall, PIPE_OFF out from it.
  const ox = n[0] * PIPE_OFF
  const oz = n[2] * PIPE_OFF
  const along: V3 = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
  // A stub: out of the wall, along the normal (a capsule's y turned onto it).
  const out: V3 = n[0] ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
  const parts: BufferGeometry[] = [xform(paint(cap(PIPE_R, len, 8, 2), color), [mx + ox, y, mz + oz], along)]
  for (const s of [-1, 1]) {
    const ex = alongX ? s * len / 2 : 0
    const ez = alongX ? 0 : s * len / 2
    // From just inside the wall to the run's axis: the elbow into the wall.
    parts.push(xform(paint(cap(PIPE_R, PIPE_OFF, 8, 2), color), [mx + ex + ox / 2, y, mz + ez + oz / 2], out))
  }
  // The clamp round its middle.
  parts.push(xform(paint(torus(PIPE_R + 0.025, 0.03, 6, 14), clamp), [mx + ox, y, mz + oz], alongX ? [0, Math.PI / 2, 0] : [0, 0, 0]))
  return parts
}
