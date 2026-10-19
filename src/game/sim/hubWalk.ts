import { HERO_R, moveCircleIn, type Post, type Seg } from '../world/hubLayout'

/**
 * ─── Flux on foot in the lab (#173) ──────────────────────────────────────────
 *
 * The hub's walker: the stick (or WASD) moves Flux relative to the camera, he
 * turns to face where he goes, and a tap on a place's marker walks him there
 * along `routeTo`'s waypoints. Pure (no three.js values): the hub mode feeds
 * it the input and the camera's heading each step and reads the pose back.
 *
 * Headings are three.js yaws: 0 faces +z, and a heading `h` points along
 * (sin h, cos h).
 */

/** Walking pace (m/s): a jog, a little brisker than in a mission — nothing
 *  here shoots back, and the hall is long. */
export const HUB_WALK = 6.2
/** An auto-walk's pace (m/s). */
export const HUB_AUTO = 7
/** How fast he takes up speed (1/s) and turns to his heading (rad/s scale). */
const ACCEL = 12
const TURN = 11
/** A waypoint this close is reached (m). */
const ARRIVE = 0.32
/** An auto-walk making less headway than this per second has run into
 *  something: it gives up rather than push forever (m/s). */
const STUCK_SPEED = 0.35
const STUCK_FOR = 0.6
/** A post this slim (m) is stepped round when walked into head-on (the
 *  teleporter's rim posts), instead of stopping him dead. */
const SLIM_POST = 0.3

export interface HubWalker {
  x: number
  z: number
  /** Where he faces (rad). */
  yaw: number
  vx: number
  vz: number
  /** 0..1: how much of a stride he takes (the gait's `walk`). */
  stride: number
  /** The waypoints of a tap's walk, nearest first (empty: none). */
  route: Array<[number, number]>
  /** Turn to this heading when the route ends (NaN: keep the walk's). */
  endYaw: number
  /** The route was walked to its end this step. */
  arrived: boolean
  /** The route was given up (something in the way, or the stick took over). */
  cancelled: boolean
  /** How long the auto-walk has made too little headway (s). */
  stuckT: number
}

export const newWalker = (x: number, z: number, yaw: number): HubWalker => ({
  x, z, yaw, vx: 0, vz: 0, stride: 0, route: [], endYaw: NaN, arrived: false, cancelled: false, stuckT: 0
})

/** Start a tap's walk. */
export const walkRoute = (w: HubWalker, pts: Array<[number, number]>, endYaw = NaN): void => {
  w.route = pts.map(([x, z]) => [x, z])
  w.endYaw = endYaw
  w.stuckT = 0
}

export const angDiff = (a: number, b: number): number => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

const scratch: [number, number] = [0, 0]

export interface WalkInput {
  /** The stick: x right, y forward, |v| ≤ 1. */
  moveX: number
  moveY: number
  /** The camera's heading: "forward" on the stick. */
  camYaw: number
  /** Whether he may move at all (a panel open, a beam, a film: no). */
  free: boolean
  /** A doorway the walk is funnelled into (see `Funnel`). */
  funnel?: Funnel
}

/**
 * A doorway in a wall a walk heads for: walking toward it (+z) between `z0`
 * and `z1`, within `reach` of its middle `x`, he is steered in toward the
 * middle. A walk aimed a little beside the door then slides through it
 * instead of stopping dead against the wall beside it.
 */
export interface Funnel { x: number; z0: number; z1: number; reach: number }

/** How hard a funnel steers (share of the walk speed per metre off-centre). */
const FUNNEL_PULL = 0.55

/** Walked head-on into a slim post (barely moving for the push): round it,
 *  on the side his heading already leans to. */
const sidestep = (w: HubWalker, ox: number, oz: number, dt: number, walls: readonly Seg[], posts: readonly Post[]): void => {
  const want = Math.hypot(w.vx, w.vz) * dt
  if (want < 1e-4 || Math.hypot(w.x - ox, w.z - oz) > want * 0.35) return
  for (const p of posts) {
    if (p.r > SLIM_POST) continue
    const dx = w.x - p.x
    const dz = w.z - p.z
    const d = Math.hypot(dx, dz)
    if (d > p.r + HERO_R + 0.02) continue
    // Along the post's rim, on the side he already stands (one way when dead on).
    const cross = w.vx * dz - w.vz * dx
    const s = cross >= 0 ? -1 : 1
    const tx = (-dz / d) * s
    const tz = (dx / d) * s
    moveCircleIn(w.x, w.z, tx * want * 0.8, tz * want * 0.8, HERO_R, walls, posts, scratch)
    w.x = scratch[0]
    w.z = scratch[1]
    return
  }
}

/**
 * One fixed step. The stick wins over a route (a push cancels the walk); a
 * route steers waypoint to waypoint; either way the body slides along the
 * walls and posts.
 */
export const stepWalker = (w: HubWalker, inp: WalkInput, dt: number, walls: readonly Seg[], posts: readonly Post[]): void => {
  w.arrived = false
  w.cancelled = false
  let tx = 0
  let tz = 0
  const stick = Math.min(1, Math.hypot(inp.moveX, inp.moveY))
  if (!inp.free) {
    if (w.route.length) { w.route = []; w.cancelled = true }
  } else if (stick > 0.12) {
    if (w.route.length) { w.route = []; w.cancelled = true }
    // Camera-relative: forward is where the camera looks, (sin h, cos h);
    // its screen-right is forward × up, (−cos h, sin h).
    const s = Math.sin(inp.camYaw)
    const c = Math.cos(inp.camYaw)
    tx = (s * inp.moveY - c * inp.moveX) * HUB_WALK
    tz = (c * inp.moveY + s * inp.moveX) * HUB_WALK
    const f = inp.funnel
    if (f && tz > HUB_WALK * 0.3 && w.z > f.z0 && w.z < f.z1 && Math.abs(w.x - f.x) < f.reach) {
      const k = Math.min(1, (w.z - f.z0) / (f.z1 - f.z0))
      tx += (f.x - w.x) * FUNNEL_PULL * HUB_WALK * k
    }
  } else if (w.route.length) {
    const [wx, wz] = w.route[0]!
    const dx = wx - w.x
    const dz = wz - w.z
    const d = Math.hypot(dx, dz)
    if (d < ARRIVE) {
      w.route.shift()
      if (!w.route.length) {
        w.arrived = true
        w.stuckT = 0
      }
    } else {
      // Ease into the last waypoint instead of overshooting it.
      const last = w.route.length === 1
      const sp = last ? Math.min(HUB_AUTO, d * 5 + 0.6) : HUB_AUTO
      tx = (dx / d) * sp
      tz = (dz / d) * sp
    }
  }
  const k = Math.min(1, dt * ACCEL)
  w.vx += (tx - w.vx) * k
  w.vz += (tz - w.vz) * k
  const ox = w.x
  const oz = w.z
  moveCircleIn(w.x, w.z, w.vx * dt, w.vz * dt, HERO_R, walls, posts, scratch)
  w.x = scratch[0]
  w.z = scratch[1]
  sidestep(w, ox, oz, dt, walls, posts)
  const moved = Math.hypot(w.x - ox, w.z - oz)
  // Blocked: the speed is what he actually covered (no moonwalking at a wall).
  const speed = dt > 0 ? moved / dt : 0
  if (w.route.length) {
    if (speed < STUCK_SPEED) w.stuckT += dt
    else w.stuckT = 0
    if (w.stuckT > STUCK_FOR) {
      w.route = []
      w.cancelled = true
      w.stuckT = 0
    }
  }
  // Facing: into the walk; standing, the route's end heading.
  if (speed > 0.25) {
    const want = Math.atan2(w.vx, w.vz)
    w.yaw += angDiff(want, w.yaw) * Math.min(1, dt * TURN)
  } else if (!w.route.length && !Number.isNaN(w.endYaw)) {
    w.yaw += angDiff(w.endYaw, w.yaw) * Math.min(1, dt * TURN * 0.6)
    if (Math.abs(angDiff(w.endYaw, w.yaw)) < 0.01) w.endYaw = NaN
  }
  w.stride += ((speed > 0.3 ? Math.min(1, speed / HUB_WALK) : 0) - w.stride) * Math.min(1, dt * 10)
}
