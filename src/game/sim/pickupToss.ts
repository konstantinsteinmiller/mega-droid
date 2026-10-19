import { CELL } from '../world/levelGen'
import { floorAt, hasLineOfSight, resolveCircle, walkableLine, STEP_UP, type Nav } from '../world/nav'
import type { Pickup, PickupKind } from './world'

/**
 * ─── Where a drop lands ──────────────────────────────────────────────────────
 *
 * A bolt, a capsule or a gel tossed out of a kill, a chest, a crate or a
 * broken decor piece picks its landing spot BEFORE it flies: a floor point
 * in the source's own room, clear of walls, props and pillars, on the
 * source's floor height (a step up or down at most), with a straight walk
 * and a clear line from the source to it. The arc is then solved to land
 * there, and the toss step stops any slide that would cross a wall, a pit
 * edge or a ledge. A drop never ends behind a wall or out of the room.
 *
 * The one exception is the hazard: a machine killed over a pit (a rotor
 * drone over the gap) sheds its plain bolts as it always did, into the pit.
 * Anything worth more than a bolt (a capsule, a gel, a core) is thrown to
 * the nearest floor on Flux's level instead, so it is never lost.
 */

/** Gravity of a tossed drop (m/s²). */
export const TOSS_G = 18
/** How far a landing spot keeps from a wall, a prop or a pillar (m). */
const CLEAR_R = 0.45
/** The pickup's resting height over the floor. */
export const restOf = (kind: PickupKind): number => (kind === 'bolt' ? 0.22 : 0.3)

export interface TossPlan {
  vx: number
  vy: number
  vz: number
  /** Landing spot (also where a drop that strayed is put back). */
  hx: number
  hz: number
  /** Floor height it lands on; NaN for a free toss (a bolt into a pit). */
  ref: number
}

/** Is (x, z) a spot a drop may rest on, for floor height `ref` and room `room`
 *  (−2 = any room)? */
export const landable = (nav: Nav, x: number, z: number, ref: number, room: number): boolean => {
  const map = nav.map
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return false
  if (nav.solid[j * map.w + i]) return false
  if (room !== -2 && map.room[j * map.w + i] !== room) return false
  const g = floorAt(nav, x, z)
  if (g === -Infinity || Math.abs(g - ref) > STEP_UP) return false
  // Clear of walls, posts, props, pillars and closed doors
  const [rx, rz] = resolveCircle(nav, x, z, CLEAR_R)
  return Math.abs(rx - x) < 1e-3 && Math.abs(rz - z) < 1e-3
}

/** Can a drop fly (and Flux walk) straight from a to b? */
const clearWay = (nav: Nav, ax: number, az: number, bx: number, bz: number): boolean =>
  hasLineOfSight(nav, ax, az, bx, bz) && (!nav.map.terrain || walkableLine(nav, ax, az, bx, bz))

/** The arc from (x, y, z) that comes down on (tx, tz) at height `ty`. */
const arcTo = (x: number, y: number, z: number, tx: number, tz: number, ty: number, vy: number, out: TossPlan): TossPlan => {
  const t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * TOSS_G * (y - ty)))) / TOSS_G
  out.vx = (tx - x) / Math.max(0.2, t)
  out.vz = (tz - z) / Math.max(0.2, t)
  out.vy = vy
  out.hx = tx
  out.hz = tz
  return out
}

/** Nearest landable cell centre to (x, z) for floor `ref`, any room (a
 *  breadth-first walk over the grid), or null. */
const nearestFloor = (nav: Nav, x: number, z: number, ref: number): [number, number] | null => {
  const { w, h } = nav.map
  const si = Math.min(w - 1, Math.max(0, Math.floor(x / CELL)))
  const sj = Math.min(h - 1, Math.max(0, Math.floor(z / CELL)))
  const seen = new Uint8Array(w * h)
  const queue = [sj * w + si]
  seen[queue[0]!] = 1
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]!
    const i = k % w
    const j = (k - i) / w
    const cx = (i + 0.5) * CELL
    const cz = (j + 0.5) * CELL
    if (landable(nav, cx, cz, ref, -2)) return [cx, cz]
    for (const [di, dj] of DIRS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= w || nj >= h || seen[nj * w + ni]) continue
      seen[nj * w + ni] = 1
      queue.push(nj * w + ni)
    }
  }
  return null
}
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Plan the toss of a `kind` drop from (x, y, z): its launch velocity and
 * landing spot. `player` biases the throw toward Flux (the room's open side)
 * and gives the floor height for a source that has no floor under it.
 */
export const planToss = (
  nav: Nav, kind: PickupKind, x: number, y: number, z: number,
  player: { x: number; z: number; feet: number }, rand: () => number = Math.random,
  out: TossPlan = { vx: 0, vy: 0, vz: 0, hx: x, hz: z, ref: 0 }
): TossPlan => {
  const map = nav.map
  const vy = 3.5 + rand() * 2
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  const inGrid = i >= 0 && j >= 0 && i < map.w && j < map.h
  const under = inGrid && !nav.solid[j * map.w + i] ? floorAt(nav, x, z, y) : -Infinity
  if (under === -Infinity) {
    // Over a pit (or a wall): a plain bolt falls where it was shed, as ever
    if (kind === 'bolt' && inGrid && !nav.solid[j * map.w + i]) {
      const a = rand() * Math.PI * 2
      const sp = 1.5 + rand() * 2.5
      out.vx = Math.cos(a) * sp
      out.vz = Math.sin(a) * sp
      out.vy = vy
      out.hx = x
      out.hz = z
      out.ref = NaN
      return out
    }
    // …anything better goes to the nearest floor on Flux's level
    const at = nearestFloor(nav, x, z, player.feet) ?? [player.x, player.z]
    out.ref = floorAt(nav, at[0], at[1])
    if (out.ref === -Infinity) out.ref = player.feet
    return arcTo(x, y, z, at[0], at[1], out.ref + restOf(kind), vy, out)
  }
  out.ref = under
  const room = map.room[j * map.w + i]!
  const toPlayer = Math.atan2(player.z - z, player.x - x)
  for (let n = 0; n < 12; n++) {
    // The first throws lean toward Flux, the later ones go anywhere and
    // shorter: a source in a corner still finds its open floor
    const a = n < 6 ? toPlayer + (rand() + rand() - 1) * Math.PI * 0.6 : rand() * Math.PI * 2
    const r = (n < 6 ? 0.7 + rand() * 1.4 : 0.4 + rand() * 1.0) * (n < 9 ? 1 : 0.6)
    const tx = x + Math.cos(a) * r
    const tz = z + Math.sin(a) * r
    if (landable(nav, tx, tz, under, room) && clearWay(nav, x, z, tx, tz)) {
      return arcTo(x, y, z, tx, tz, under + restOf(kind), vy, out)
    }
  }
  // Nothing open around it: drop it at the source, nudged off the wall
  const [rx, rz] = resolveCircle(nav, x, z, CLEAR_R)
  const ok = floorAt(nav, rx, rz) !== -Infinity && Math.abs(floorAt(nav, rx, rz) - under) <= STEP_UP && clearWay(nav, x, z, rx, rz)
  const at = ok ? [rx, rz] : nearestFloor(nav, x, z, under) ?? [x, z]
  return arcTo(x, y, z, at[0]!, at[1]!, under + restOf(kind), vy, out)
}

/**
 * One step of a drop's toss: fly, bounce, settle. A planned drop never
 * slides across a wall, a pit edge, a ledge or out of the room it was thrown
 * into (its slide stops there), and one that ended off the floor anyway is
 * put back on its landing spot.
 * A free toss (a bolt shed over a pit) falls as it likes.
 */
export const tossStep = (nav: Nav, p: Pickup, dt: number): void => {
  p.vy -= TOSS_G * dt
  const free = Number.isNaN(p.ref)
  let nx = p.x + p.vx * dt
  let nz = p.z + p.vz * dt
  if (!free && (p.vx !== 0 || p.vz !== 0)) {
    const g = floorAt(nav, nx, nz)
    const open = g !== -Infinity && Math.abs(g - p.ref) <= STEP_UP &&
      !nav.solid[Math.floor(nz / CELL) * nav.map.w + Math.floor(nx / CELL)] &&
      nav.map.room[Math.floor(nz / CELL) * nav.map.w + Math.floor(nx / CELL)] ===
        nav.map.room[Math.floor(p.hz / CELL) * nav.map.w + Math.floor(p.hx / CELL)] &&
      hasLineOfSight(nav, p.x, p.z, nx, nz) && Math.abs(resolveCircle(nav, nx, nz, 0.15)[0] - nx) < 1e-6
    if (!open) {
      p.vx = 0
      p.vz = 0
      nx = p.x
      nz = p.z
    }
  }
  p.x = nx
  p.z = nz
  p.y += p.vy * dt
  let floor = Math.max(-60, floorAt(nav, p.x, p.z))
  if (!free && (floor === -60 || floorAt(nav, p.x, p.z) < p.ref - STEP_UP)) {
    // Strayed off the floor (a platform moved away, a door shoved it): back
    // to the landing spot
    p.x = p.hx
    p.z = p.hz
    p.vx = 0
    p.vz = 0
    floor = Math.max(-60, floorAt(nav, p.x, p.z))
  }
  const rest = restOf(p.kind) + floor
  if (p.y < rest) {
    p.y = rest
    p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.35 : 0
    p.vx *= 0.6
    p.vz *= 0.6
  }
}
