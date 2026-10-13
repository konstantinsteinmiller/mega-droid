import { Group } from 'three'
import type { Enemy, World } from '../world'
import { CELL, type Room } from '../../world/levelGen'
import { moveCircle } from '../../world/nav'
import { setTeleRing } from '../../fx/markers'
import { PARRY_WINDOW, keepOffPlayer } from '../enemies'
import { PLAYER_R, EYE_H } from '../constants'

/**
 * ─── The mini-boss modules' toolkit ──────────────────────────────────────────
 *
 * Small pure helpers every behaviour (`miniBoss/*.ts`) shares: turning,
 * moving with collision, keeping to its room, the telegraph ring, the
 * reach tests. No state of their own.
 */

export const TAU = Math.PI * 2

export const angDiff = (a: number, b: number): number => {
  let d = a - b
  while (d > Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return d
}

/** Turn toward (x, z) at no more than `rate` rad/s. */
export const faceTo = (e: Enemy, x: number, z: number, rate: number, dt: number): void => {
  const want = Math.atan2(x - e.x, z - e.z)
  e.yaw += Math.max(-rate * dt, Math.min(rate * dt, angDiff(want, e.yaw)))
}

export const distToPlayer = (w: World, e: Enemy): number => Math.hypot(w.player.x - e.x, w.player.z - e.z)

const _o: [number, number] = [0, 0]
/** Move by (dx, dz) against the walls; the share of the move it made. */
export const moveBody = (w: World, e: Enemy, dx: number, dz: number): number => {
  const want = Math.hypot(dx, dz)
  if (want < 1e-6) return 1
  moveCircle(w.nav, e.x, e.z, dx, dz, e.def.radius, _o)
  const got = Math.hypot(_o[0] - e.x, _o[1] - e.z)
  e.x = _o[0]
  e.z = _o[1]
  return got / want
}

/** Its room's floor rectangle less `pad` m (x0, z0, x1, z1). */
export const roomBox = (room: Room, pad: number): [number, number, number, number] => [
  room.x0 * CELL + pad, room.z0 * CELL + pad, (room.x0 + room.w) * CELL - pad, (room.z0 + room.h) * CELL - pad
]

/** Never out of its room (its door is shut, but a lunge must not end in the
 *  corridor's mouth either). */
export const keepInRoom = (e: Enemy, room: Room): void => {
  const [x0, z0, x1, z1] = roomBox(room, e.def.radius + 0.15)
  e.x = Math.min(x1, Math.max(x0, e.x))
  e.z = Math.min(z1, Math.max(z0, e.z))
}

/** A point clamped into its room (`pad` m in from the walls). */
export const inRoom = (room: Room, x: number, z: number, pad: number): [number, number] => {
  const [x0, z0, x1, z1] = roomBox(room, pad)
  return [Math.min(x1, Math.max(x0, x)), Math.min(z1, Math.max(z0, z))]
}

/** The telegraph ring over it: `k` 0 → 1 across the wind-up; red = no
 *  block, orange = block (white at the end: the parry window). */
export const teleRing = (e: Enemy, k: number, red: boolean, size: number): void => {
  const pw = Math.min(0.5, PARRY_WINDOW / Math.max(0.1, e.teleDur))
  setTeleRing(e.ring, k, red, pw, size)
}

/** Flux is inside the cone from (x, z) along `yaw`: within `range` m and
 *  `half` rad of its axis (his body's radius counts). */
export const inCone = (w: World, x: number, z: number, yaw: number, range: number, half: number): boolean => {
  const dx = w.player.x - x
  const dz = w.player.z - z
  const d = Math.hypot(dx, dz)
  if (d > range + PLAYER_R) return false
  if (d < PLAYER_R + 0.3) return true
  return Math.abs(angDiff(Math.atan2(dx, dz), yaw)) < half + Math.atan2(PLAYER_R, d)
}

/** Flux stands within `r` m of (x, z) (his body's radius counts). */
export const near = (w: World, x: number, z: number, r: number): boolean =>
  Math.hypot(w.player.x - x, w.player.z - z) < r + PLAYER_R

/** Ease `v` toward `to` at `rate` per second (exponential). */
export const ease = (v: number, to: number, rate: number, dt: number): number => v + (to - v) * Math.min(1, rate * dt)

/** Keep Flux out of its body (a ground mini-boss is solid to him): to the
 *  rim even from dead centre, through the wall test (`keepOffPlayer`). */
export const shoulderPlayer = (w: World, e: Enemy): void => keepOffPlayer(w, e)

/**
 * A group in world space for what a mini-boss puts on the floor apart from
 * its body (ice spikes, pylons, webs): beside its root in the scene, made on
 * first use (`have` is the one it made before). With no scene round its root
 * (the tests) it is a loose group: nothing is drawn, the logic runs.
 */
export const floorLayer = (e: Enemy, have: Group | null): Group => {
  const g = have ?? new Group()
  if (!g.parent && e.root.parent) e.root.parent.add(g)
  return g
}

/** Distance from (px, pz) to the segment (ax, az)–(bx, bz) (m). */
export const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const vx = bx - ax
  const vz = bz - az
  const l2 = vx * vx + vz * vz
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t))
}

/** Slack round a prop's column for `eyeAt` (m): the near plane, the eye's
 *  bob and a frame of his walk between the tick and the draw. */
export const EYE_CLEAR = 0.35

/**
 * Flux's eye is in (or right at) the column of radius `r` at (x, z), from
 * `lo` to `hi` (world heights): a prop there (an ice spike bursting under
 * him, the boulder coming down on him, a pylon he walks into) would fill the
 * view as one flat hard-edged shape, so its module leaves it undrawn while
 * the eye is there (#148's near cut, for what is not on the body). The hit
 * itself does not care.
 */
export const eyeAt = (w: World, x: number, z: number, r: number, lo: number, hi: number): boolean => {
  const y = (w.player.y ?? 0) + EYE_H
  if (y < lo - EYE_CLEAR || y > hi + EYE_CLEAR) return false
  return Math.hypot(w.player.x - x, w.player.z - z) < r + EYE_CLEAR
}
