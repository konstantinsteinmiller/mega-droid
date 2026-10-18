import type { SectorId } from './themes'

/**
 * ─── The walkable lab: where everything stands (#173) ─────────────────────────
 *
 * The hub used to be a 2D menu over a still lab. Now Flux walks it: Gauss's
 * round lab (the teleporter he lands on, the holographic briefing table), a
 * short airlock, and the Deployment Hall — a long corridor with a niche every
 * few metres on both walls, where every station of the old menus stands as a
 * thing in the world and every mission is a beam pedestal:
 *
 *   z  0      the lab: teleporter pad (home), briefing table behind it
 *   z  8      the lab's door → the airlock
 *   row 0     weapon rack (Flux's gear) | forge (the Workshop)
 *   row 1     chip lab (Circuits)       | records terminal (leaderboard)
 *   row 2     job pad 1                 | job pad 2
 *   row 3     job pad 3                 | trophy case (the Masters' cores)
 *   rows 4-8  the story pedestals, in story order, left then right
 *   end       the Fortress gate, Vex's spire through the window above it
 *
 * Seen from the airlock, every pedestal of the game is in view at once (the
 * Crash Bandicoot warp-room idea): the ones behind Flux lit as secured, the
 * next one burning in its Master's colour, the rest dark behind red fences.
 *
 * Everything here is pure data and plain functions (no three.js values), so
 * the tests can walk the hall without a GPU: the walls Flux and the camera
 * collide with, the obstacles, every station's trigger zone and the route an
 * auto-walk takes to it.
 */

// ─── Dimensions (m) ──────────────────────────────────────────────────────────

/** The lab: its wall ring's radius, and how far in Flux may walk. */
export const LAB_R = 8.2
export const LAB_WALK_R = 7.45
/** The lab's door: the gap in the wall ring at +z, its half-width and height. */
export const DOOR_HALF = 1.7
export const DOOR_H = 3.9
/** The airlock between the lab's door and the hall: half-width, and where it ends. */
export const AIRLOCK_HALF = 1.9
export const AIRLOCK_END = 12.4
/** The hall: half-width, the first niche row, the row pitch, and its end wall. */
export const HALL_HALF = 6
export const HALL_H = 8.4
export const ROW0_Z = 16.4
export const ROW_PITCH = 5.3
export const ROWS = 9
/** A niche: how deep it goes into the wall, and its half-width along the hall. */
export const NICHE_DEPTH = 3.1
export const NICHE_HALF = 2
/** The Fortress gate's niche at the hall's end: half-width and depth. */
export const GATE_HALF = 3.6
export const GATE_DEPTH = 5.2
/** Flux's body (third person: slimmer than the first-person 0.62). */
export const HERO_R = 0.42

export const rowZ = (row: number): number => ROW0_Z + row * ROW_PITCH
/** The hall's end wall, where the gate's niche opens. */
export const HALL_END = rowZ(ROWS - 1) + NICHE_HALF + 3.2
/** Where the gate's pad stands, inside its niche. */
export const GATE_PAD_Z = HALL_END + GATE_DEPTH * 0.5

// ─── Places ──────────────────────────────────────────────────────────────────

/** The story pedestals in story order (the Fortress has the gate). */
export const STORY_ORDER: readonly SectorId[] = ['scrapyard', 'blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor']

export type StationId = 'hero' | 'workshop' | 'circuits' | 'records' | 'table'
export type PoiId = StationId | `job${0 | 1 | 2}` | `story:${SectorId}`
export type PoiKind = 'station' | 'job' | 'story' | 'gate'

export interface Poi {
  id: PoiId
  kind: PoiKind
  /** The thing itself (a pad's centre, a station's front). */
  x: number
  z: number
  /** The way it faces (toward the walkway), radians, three.js yaw (0 = +z). */
  yaw: number
  /** Standing within this of (`tx`, `tz`) is being at it. */
  tx: number
  tz: number
  reach: number
  /** Where an auto-walk stops for it (on the pad / in front of the station). */
  ax: number
  az: number
  /** -1 the left wall (−x), +1 the right one, 0 the lab or the hall's axis. */
  side: -1 | 0 | 1
  /** Its niche row (-1: none). */
  row: number
  sector?: SectorId
}

/** A niche's centre line: x of its mouth's middle and of its floor's middle. */
const nicheX = (side: -1 | 1, inset: number): number => side * (HALL_HALF + inset)

/** A pad in a niche: Flux steps onto it to be at it. */
const padPoi = (id: PoiId, kind: PoiKind, side: -1 | 1, row: number, sector?: SectorId): Poi => {
  const x = nicheX(side, NICHE_DEPTH * 0.5)
  const z = rowZ(row)
  return { id, kind, x, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, tx: x, tz: z, reach: 1.25, ax: x, az: z, side, row, sector }
}

/** A station at a niche's back: Flux stands in its mouth to use it. */
const stationPoi = (id: StationId, side: -1 | 1, row: number): Poi => {
  const z = rowZ(row)
  const x = nicheX(side, NICHE_DEPTH - 0.9)
  const tx = nicheX(side, 0.3)
  return { id, kind: 'station', x, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, tx, tz: z, reach: 2.3, ax: nicheX(side, 0.15), az: z, side, row }
}

/** The briefing table in the lab, behind the teleporter (−z). */
export const TABLE_Z = -4.9
export const TABLE_R = 1.45
/** Where Flux stands to be briefed: in front of the table, facing it. */
export const BRIEF_SPOT = { x: 0, z: TABLE_Z + TABLE_R + 1.2, yaw: Math.PI }

/** The trophy case (the Masters' cores): a thing to look at, not a station. */
export const TROPHY_SPOT = { side: 1 as const, row: 3, z: rowZ(3) }

const buildPois = (): Poi[] => {
  const out: Poi[] = [
    stationPoi('hero', -1, 0),
    stationPoi('workshop', 1, 0),
    stationPoi('circuits', -1, 1),
    stationPoi('records', 1, 1),
    padPoi('job0', 'job', -1, 2),
    padPoi('job1', 'job', 1, 2),
    padPoi('job2', 'job', -1, 3),
    {
      id: 'table', kind: 'station', x: 0, z: TABLE_Z, yaw: 0, tx: 0, tz: BRIEF_SPOT.z - 0.2, reach: 1.9,
      ax: BRIEF_SPOT.x, az: BRIEF_SPOT.z, side: 0, row: -1
    }
  ]
  STORY_ORDER.forEach((s, k) => {
    out.push(padPoi(`story:${s}`, 'story', k % 2 === 0 ? -1 : 1, 4 + Math.floor(k / 2), s))
  })
  out.push({
    id: 'story:fortress', kind: 'gate', x: 0, z: GATE_PAD_Z, yaw: Math.PI, tx: 0, tz: GATE_PAD_Z, reach: 1.7,
    ax: 0, az: GATE_PAD_Z, side: 0, row: ROWS, sector: 'fortress'
  })
  return out
}

export const POIS: readonly Poi[] = buildPois()
export const POI_BY_ID = Object.fromEntries(POIS.map(p => [p.id, p])) as Record<PoiId, Poi>
export const storyPoi = (s: SectorId): Poi => POI_BY_ID[`story:${s}`]

// ─── Walls and obstacles (plan view) ─────────────────────────────────────────

export interface Seg { ax: number; az: number; bx: number; bz: number }
export interface Post { x: number; z: number; r: number }

const LAB_WALL_STEPS = 40

/** The lab's wall ring as segments, with the door's gap at +z. */
const labWall = (): Seg[] => {
  const out: Seg[] = []
  const gap = Math.asin(DOOR_HALF / LAB_WALK_R)
  // From the door's right jamb all the way round to its left one.
  const a0 = Math.PI / 2 + gap
  const a1 = Math.PI / 2 - gap + Math.PI * 2
  let px = Math.cos(a0) * LAB_WALK_R
  let pz = Math.sin(a0) * LAB_WALK_R
  for (let k = 1; k <= LAB_WALL_STEPS; k++) {
    const a = a0 + (a1 - a0) * (k / LAB_WALL_STEPS)
    const x = Math.cos(a) * LAB_WALK_R
    const z = Math.sin(a) * LAB_WALK_R
    out.push({ ax: px, az: pz, bx: x, bz: z })
    px = x
    pz = z
  }
  return out
}

/** One side of the hall (`side` −1 left, +1 right), niches cut in. */
const hallSide = (side: -1 | 1): Seg[] => {
  const out: Seg[] = []
  const w = side * HALL_HALF
  const deep = side * (HALL_HALF + NICHE_DEPTH)
  let z = AIRLOCK_END
  for (let r = 0; r < ROWS; r++) {
    const z0 = rowZ(r) - NICHE_HALF
    const z1 = rowZ(r) + NICHE_HALF
    out.push({ ax: w, az: z, bx: w, bz: z0 })
    out.push({ ax: w, az: z0, bx: deep, bz: z0 })
    out.push({ ax: deep, az: z0, bx: deep, bz: z1 })
    out.push({ ax: deep, az: z1, bx: w, bz: z1 })
    z = z1
  }
  out.push({ ax: w, az: z, bx: w, bz: HALL_END })
  return out
}

const buildWalls = (): Seg[] => {
  const out = labWall()
  // The lab's door jambs out to the airlock's walls, the airlock, and the
  // hall's front wall either side of it.
  for (const s of [-1, 1] as const) {
    const jz = Math.sqrt(LAB_WALK_R * LAB_WALK_R - DOOR_HALF * DOOR_HALF)
    out.push({ ax: s * DOOR_HALF, az: jz, bx: s * AIRLOCK_HALF, bz: LAB_R + 0.2 })
    out.push({ ax: s * AIRLOCK_HALF, az: LAB_R + 0.2, bx: s * AIRLOCK_HALF, bz: AIRLOCK_END })
    out.push({ ax: s * AIRLOCK_HALF, az: AIRLOCK_END, bx: s * HALL_HALF, bz: AIRLOCK_END })
    out.push(...hallSide(s))
    // The end wall either side of the gate, and the gate's niche.
    out.push({ ax: s * HALL_HALF, az: HALL_END, bx: s * GATE_HALF, bz: HALL_END })
    out.push({ ax: s * GATE_HALF, az: HALL_END, bx: s * GATE_HALF, bz: HALL_END + GATE_DEPTH })
  }
  out.push({ ax: -GATE_HALF, az: HALL_END + GATE_DEPTH, bx: GATE_HALF, bz: HALL_END + GATE_DEPTH })
  return out
}

export const WALLS: readonly Seg[] = buildWalls()

/** The lab's consoles and fluid capsules (`buildLabSet`), and the table. */
export const LAB_POSTS: readonly Post[] = [
  { x: -3.6, z: -2.4, r: 0.95 },
  { x: 3.6, z: -2.4, r: 0.95 },
  { x: -5.4, z: -0.6, r: 0.62 },
  { x: 5.4, z: -0.6, r: 0.62 },
  { x: 0, z: TABLE_Z, r: TABLE_R }
]

/** Each station's body in its niche (Flux walks up to it, not into it). */
export const stationPost = (p: Poi): Post => ({ x: p.side * (HALL_HALF + NICHE_DEPTH - 0.85), z: p.z, r: 1.45 })

/** The gate's two pylons, at the mouth of its niche (`buildGate`). */
export const GATE_PYLON_X = GATE_HALF - 0.55
export const GATE_POSTS: readonly Post[] = [-1, 1].map(s => ({ x: s * GATE_PYLON_X, z: HALL_END + 0.35, r: 0.62 }))

export const POSTS: readonly Post[] = [
  ...LAB_POSTS,
  ...GATE_POSTS,
  ...POIS.filter(p => p.kind === 'station' && p.id !== 'table').map(stationPost),
  { x: TROPHY_SPOT.side * (HALL_HALF + NICHE_DEPTH - 0.85), z: TROPHY_SPOT.z, r: 1.45 }
]

/** The gate's leaves once it stands open: along its niche's sides. */
export const GATE_LEAF_Z = HALL_END + 0.95
export const openGateWalls = (): Seg[] => [-1, 1].map(s => ({
  ax: s * (GATE_PYLON_X - 0.45), az: GATE_LEAF_Z, bx: s * (GATE_PYLON_X - 0.45), bz: GATE_LEAF_Z + GATE_PYLON_X - 0.5
}))

/** A locked niche's mouth: the red fence across it (only while it is locked). */
export const fenceOf = (p: Poi): Seg | null => {
  if (p.kind === 'gate') return { ax: -GATE_HALF, az: HALL_END, bx: GATE_HALF, bz: HALL_END }
  if (p.side === 0 || (p.kind !== 'story' && p.kind !== 'job')) return null
  const x = p.side * (HALL_HALF + 0.05)
  return { ax: x, az: p.z - NICHE_HALF, bx: x, bz: p.z + NICHE_HALF }
}

// ─── Collision ───────────────────────────────────────────────────────────────

/**
 * Push a circle (x, z, r) out of every wall and post it overlaps, in place.
 * A few passes settle a corner (two walls at once). Returns the result in
 * `out`, which may be the same array as the input position.
 */
export const resolveCircle = (
  x: number, z: number, r: number, walls: readonly Seg[], posts: readonly Post[], out: [number, number]
): [number, number] => {
  let px = x
  let pz = z
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const s of walls) {
      const dx = s.bx - s.ax
      const dz = s.bz - s.az
      const l2 = dx * dx + dz * dz
      let t = l2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / l2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const cx = s.ax + dx * t
      const cz = s.az + dz * t
      const ox = px - cx
      const oz = pz - cz
      const d2 = ox * ox + oz * oz
      if (d2 >= r * r) continue
      const d = Math.sqrt(d2)
      if (d > 1e-6) {
        px = cx + (ox / d) * r
        pz = cz + (oz / d) * r
      } else {
        // Exactly on the line: out along its normal.
        const l = Math.sqrt(l2) || 1
        px = cx - (dz / l) * r
        pz = cz + (dx / l) * r
      }
      moved = true
    }
    for (const p of posts) {
      const ox = px - p.x
      const oz = pz - p.z
      const rr = p.r + r
      const d2 = ox * ox + oz * oz
      if (d2 >= rr * rr) continue
      const d = Math.sqrt(d2) || 1e-6
      px = p.x + (ox / d) * rr
      pz = p.z + (oz / d) * rr
      moved = true
    }
    if (!moved) break
  }
  out[0] = px
  out[1] = pz
  return out
}

/** The longest step taken in one go (m): a fast walk never tunnels a wall. */
const SUB_STEP = 0.18

/** Move a circle by (dx, dz), sliding along whatever it meets. */
export const moveCircleIn = (
  x: number, z: number, dx: number, dz: number, r: number, walls: readonly Seg[], posts: readonly Post[], out: [number, number]
): [number, number] => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUB_STEP))
  out[0] = x
  out[1] = z
  for (let k = 0; k < n; k++) resolveCircle(out[0] + dx / n, out[1] + dz / n, r, walls, posts, out)
  return out
}

/** Where a ray from (ax, az) toward (bx, bz) first meets a wall, as a 0..1
 *  share of the way (1: nothing in between). The camera keeps in front of it. */
export const rayHit = (ax: number, az: number, bx: number, bz: number, walls: readonly Seg[]): number => {
  let best = 1
  const rx = bx - ax
  const rz = bz - az
  for (const s of walls) {
    const sx = s.bx - s.ax
    const sz = s.bz - s.az
    const den = rx * sz - rz * sx
    if (Math.abs(den) < 1e-9) continue
    const t = ((s.ax - ax) * sz - (s.az - az) * sx) / den
    const u = ((s.ax - ax) * rz - (s.az - az) * rx) / den
    if (t >= 0 && t < best && u >= 0 && u <= 1) best = t
  }
  return best
}

/** Where a ray from (ax, az) toward (bx, bz) first enters one of `posts`,
 *  as a 0..1 share of the way (1: none in between). */
export const rayHitPosts = (ax: number, az: number, bx: number, bz: number, posts: readonly Post[]): number => {
  let best = 1
  const rx = bx - ax
  const rz = bz - az
  const a = rx * rx + rz * rz
  if (a < 1e-9) return 1
  for (const p of posts) {
    const fx = ax - p.x
    const fz = az - p.z
    const b = 2 * (fx * rx + fz * rz)
    const c = fx * fx + fz * fz - p.r * p.r
    if (c <= 0) continue
    const disc = b * b - 4 * a * c
    if (disc < 0) continue
    const t = (-b - Math.sqrt(disc)) / (2 * a)
    if (t >= 0 && t < best) best = t
  }
  return best
}

// ─── Where Flux is ───────────────────────────────────────────────────────────

export type Zone = 'lab' | 'airlock' | 'hall' | 'niche' | 'gate'

export const zoneAt = (x: number, z: number): Zone => {
  if (Math.hypot(x, z) < LAB_R - 0.1) return 'lab'
  if (z < AIRLOCK_END) return 'airlock'
  if (z > HALL_END) return 'gate'
  return Math.abs(x) > HALL_HALF ? 'niche' : 'hall'
}

/** The place whose zone (x, z) stands in, nearest first; null when none. */
export const poiAt = (x: number, z: number, list: readonly Poi[] = POIS): Poi | null => {
  let best: Poi | null = null
  let bd = Infinity
  for (const p of list) {
    const d = Math.hypot(x - p.tx, z - p.tz)
    if (d <= p.reach && d < bd) {
      best = p
      bd = d
    }
  }
  return best
}

// ─── Auto-walk routes ────────────────────────────────────────────────────────

/**
 * The walk to a place (a tap on its marker): out of a niche to the hall's
 * axis, along the axis (through the airlock and the lab's door when the walk
 * crosses them), and into the place's own spot. Plain waypoints: every leg is
 * a straight line clear of the walls and the posts, so the walker simply
 * steers from one to the next.
 */
export const routeTo = (x: number, z: number, to: Poi): Array<[number, number]> => {
  const pts: Array<[number, number]> = []
  const from = zoneAt(x, z)
  const goal = to.id === 'table' ? 'lab' : zoneAt(to.ax, to.az)
  // Out of a niche (or the gate) first, onto the walkway.
  if (from === 'niche') pts.push([Math.sign(x) * (HALL_HALF - 1.2), z])
  if (from === 'gate') pts.push([0, HALL_END - 1.5])
  const inLab = from === 'lab'
  if (goal === 'lab') {
    if (!inLab) {
      pts.push([0, Math.max(AIRLOCK_END + 0.6, Math.min(z, AIRLOCK_END + 3))])
      pts.push([0, LAB_R + 1])
      pts.push([0, LAB_R - 2.2])
    }
    // Round the teleporter's consoles: the table stands behind them.
    if (to.id === 'table') {
      if (z > BRIEF_SPOT.z + 0.5 || !inLab) pts.push([0, 0.6])
      pts.push([to.ax, to.az])
    } else pts.push([to.ax, to.az])
    return pts
  }
  if (inLab) {
    // Round the table and the consoles to the door.
    if (z < -1.2) pts.push([x < 0 ? -2 : 2, 0.2])
    pts.push([0, LAB_R - 2.2])
    pts.push([0, LAB_R + 1])
    pts.push([0, AIRLOCK_END + 1])
  } else if (from === 'airlock') {
    pts.push([0, AIRLOCK_END + 1])
  }
  // Along the hall's axis to the place's row, then in.
  const laneZ = to.kind === 'gate' ? HALL_END - 1.5 : to.az
  pts.push([0, laneZ])
  if (to.side !== 0) pts.push([to.side * (HALL_HALF - 1.2), to.az])
  pts.push([to.ax, to.az])
  return pts
}

// ─── Spawns ──────────────────────────────────────────────────────────────────

export interface Spawn { x: number; z: number; yaw: number }

/** The teleporter in the middle of the lab, facing the door. */
export const HOME_PAD: Spawn = { x: 0, z: 0, yaw: 0 }

/** Back from a mission on the pad it left from, facing the walkway. */
export const spawnOnPad = (p: Poi): Spawn => ({ x: p.ax, z: p.az, yaw: p.side === 0 ? Math.PI : p.yaw })
