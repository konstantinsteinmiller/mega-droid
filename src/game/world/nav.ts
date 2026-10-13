import { CELL, Cell, Ramp, type MapData } from './levelGen'

/**
 * ─── Navigation on the cell grid ─────────────────────────────────────────────
 *
 * One grid answers three questions, all without a physics engine:
 *   • collision — circle vs solid cells (plus pillar circles and closed doors),
 *   • line of sight — a DDA walk through cells,
 *   • paths — A* over walkable cells for tap-to-move and enemy chase.
 *
 * `solid` is the dynamic layer: a closed door marks its cell solid, an opened
 * door clears it. Everything else is static per map.
 */

/** A thin axis-aligned blocker (a closed door panel). */
export interface Slab {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  active: boolean
}

export interface Nav {
  map: MapData
  /** 1 = cannot be entered (void). */
  solid: Uint8Array
  /** Door cells for path-finding: 0 open, 1 closed (enemies stop, the player's
   *  walk-to passes — doors open on approach), 2 locked (nobody passes). */
  pathBlock: Uint8Array
  /** Closed doors: collide with bodies and block line of sight. */
  slabs: Slab[]
  /** Chests / crates: collide with bodies (not with sight). */
  props: Array<{ x: number; z: number; r: number; active: boolean }>
  w: number
  h: number
  /** Moving platforms where they are this tick (terrain maps only). */
  plats?: Plat[]
  /** One-way hops between cells a walk cannot make — up a ladder, across on
   *  a lift — for the objective trail's search only (terrain maps only). */
  links?: Map<number, number[]>
  /** Radius of the post standing on each grid vertex ((w + 1) × (h + 1),
   *  0 = none): the wall-corner pilasters and door-frame posts the level
   *  mesh draws there. They stand proud of the wall line, so sight (and a
   *  shot) grazing a corner or a doorway stops on them (flat maps only). */
  posts?: Float32Array
}

/** Pilaster radius on every wall corner (`levelMesh.ts`). */
const PILASTER_R = 0.3
/** Door-frame post radius on each side of a doorway (`levelMesh.ts`). */
const DOOR_POST_R = 0.4

/** A moving platform's footprint and top this tick, and how far it moved
 *  (what it carries a rider by). A solid column below its top. */
export interface Plat {
  x0: number
  z0: number
  x1: number
  z1: number
  top: number
  dx: number
  dz: number
}

export const createNav = (map: MapData): Nav => {
  const solid = new Uint8Array(map.w * map.h)
  for (let k = 0; k < solid.length; k++) solid[k] = map.cell[k] === Cell.Void ? 1 : 0
  const nav: Nav = { map, solid, pathBlock: new Uint8Array(map.w * map.h), slabs: [], props: [], w: map.w, h: map.h }
  if (map.terrain) {
    nav.plats = []
    nav.links = terrainLinks(map)
  } else nav.posts = vertexPosts(map)
  return nav
}

/** `Nav.posts`: a pilaster wherever walkable and void cells meet at a
 *  vertex (any wall edge ends there), a door post beside every doorway. */
const vertexPosts = (map: MapData): Float32Array => {
  const W1 = map.w + 1
  const posts = new Float32Array(W1 * (map.h + 1))
  const walk = (i: number, j: number): boolean =>
    i >= 0 && j >= 0 && i < map.w && j < map.h && map.cell[j * map.w + i] !== Cell.Void
  for (let j = 0; j <= map.h; j++) {
    for (let i = 0; i <= map.w; i++) {
      const n = +walk(i - 1, j - 1) + +walk(i, j - 1) + +walk(i - 1, j) + +walk(i, j)
      if (n > 0 && n < 4) posts[j * W1 + i] = PILASTER_R
    }
  }
  for (const d of map.doors ?? []) {
    // The frame stands on the grid line past the door cell (`doorFramePos`),
    // its two posts on the vertices at either end of it
    const vi = d.axis === 'x' ? d.i + (d.dir > 0 ? 1 : 0) : d.i
    const vj = d.axis === 'z' ? d.j + (d.dir > 0 ? 1 : 0) : d.j
    for (let s = 0; s < 2; s++) {
      const i = vi + (d.axis === 'z' ? s : 0)
      const j = vj + (d.axis === 'x' ? s : 0)
      if (i <= map.w && j <= map.h) posts[j * W1 + i] = Math.max(posts[j * W1 + i]!, DOOR_POST_R)
    }
  }
  return posts
}

// ─── Terrain: floor heights (the climb) ──────────────────────────────────────
//
// On a terrain map every cell has a floor height (a ramp's rises across it,
// a pit has none), and a body's feet decide what is a wall: a cell whose
// floor stands more than STEP_UP above them blocks like one, a lower one is
// a drop. Ladders and lifts are the only ways up besides ramps. A flat map
// never reaches any of this: `floorAt` answers 0 and the movers below are
// only called where `map.terrain` exists.

/** Highest ledge a body walks onto without a ladder (m): a stair tread, a
 *  lift's lip. */
export const STEP_UP = 0.5

/** Static floor height at (x, z): the cell's floor or its ramp's slope, −∞
 *  over a pit and outside the walkable grid, 0 on a flat map. */
export const groundAt = (map: MapData, x: number, z: number): number => {
  const t = map.terrain
  if (!t) return 0
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return -Infinity
  const k = j * map.w + i
  if (t.pit[k] || map.cell[k] === Cell.Void) return -Infinity
  const r = t.ramp[k]
  if (!r) return t.floor[k]!
  let u: number
  if (r === Ramp.PX) u = x / CELL - i
  else if (r === Ramp.NX) u = i + 1 - x / CELL
  else if (r === Ramp.PZ) u = z / CELL - j
  else u = j + 1 - z / CELL
  return t.floor[k]! + t.rise[k]! * Math.max(0, Math.min(1, u))
}

/** The walkable surface under (x, z) for a body whose feet are at `feet`:
 *  the ground or a platform top it can stand on (one no higher than a step
 *  above the feet). Leave `feet` out for "the highest surface there". */
export const floorAt = (nav: Nav, x: number, z: number, feet = Infinity): number => {
  if (!nav.map.terrain) return 0
  let y = groundAt(nav.map, x, z)
  const ps = nav.plats
  if (ps) {
    for (let n = 0; n < ps.length; n++) {
      const p = ps[n]!
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue
      if (p.top > y && p.top <= feet + STEP_UP) y = p.top
    }
  }
  return y
}

/** Which platform (index into `nav.plats`) holds up a body at (x, z) with
 *  its feet at `feet`, or −1. */
export const platUnder = (nav: Nav, x: number, z: number, feet: number): number => {
  const ps = nav.plats
  if (!ps) return -1
  let best = -1
  let top = groundAt(nav.map, x, z)
  for (let n = 0; n < ps.length; n++) {
    const p = ps[n]!
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue
    if (p.top >= top && p.top <= feet + STEP_UP) { top = p.top; best = n }
  }
  return best
}

/** Height of cell (i, j) at the point of it nearest (x, z): what a body
 *  touching that cell would have to step onto. +∞ for void, −∞ for a pit. */
const cellTopNear = (map: MapData, i: number, j: number, x: number, z: number): number => {
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return Infinity
  if (map.cell[j * map.w + i] === Cell.Void) return Infinity
  const cx = Math.max(i * CELL + 1e-4, Math.min(x, (i + 1) * CELL - 1e-4))
  const cz = Math.max(j * CELL + 1e-4, Math.min(z, (j + 1) * CELL - 1e-4))
  return groundAt(map, cx, cz)
}

/** A cell's floor height at the middle of its edge toward (di, dj). */
export const edgeHeight = (map: MapData, i: number, j: number, di: number, dj: number): number =>
  groundAt(map, (i + 0.5 + di * 0.4999) * CELL, (j + 0.5 + dj * 0.4999) * CELL)

/**
 * `moveCircle` for a body with feet: a cell whose floor (at the point the
 * body touches it) stands more than STEP_UP above the feet is a wall, and so
 * is a platform column taller than that. Pits and lower floors are open —
 * walking off them is a drop, and the caller's gravity takes it from there.
 */
export const moveBody = (nav: Nav, x: number, z: number, feet: number, dx: number, dz: number, r: number, out: [number, number]): [number, number] => {
  const len = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(len / (r * 0.8)))
  let px = x
  let pz = z
  const sx = dx / steps
  const sz = dz / steps
  for (let s = 0; s < steps; s++) {
    px += sx
    resolveBody(nav, px, pz, r, feet)
    px = _res[0]
    pz = _res[1]
    pz += sz
    resolveBody(nav, px, pz, r, feet)
    px = _res[0]
    pz = _res[1]
  }
  out[0] = px
  out[1] = pz
  return out
}

/** Push a body out of every cell and platform column too high for its feet
 *  (and of the props and slabs `resolveCircle` handles). Writes `_res`.
 *  The walls have the last word, as in `resolveCircle` (#160): a crate or a
 *  pillar against a wall pushed Flux into it. */
const resolveBody = (nav: Nav, x: number, z: number, r: number, feet: number): void => {
  resolveBodyWalls(nav, x, z, r, feet)
  for (let k = 0; k < SETTLE_PASSES; k++) {
    resolveExtras(nav, _res[0], _res[1], r)
    resolveBodyWalls(nav, _res[0], _res[1], r, feet)
  }
}

/** The wall part of `resolveBody`: cells and columns too high for the feet. Writes `_res`. */
const resolveBodyWalls = (nav: Nav, x: number, z: number, r: number, feet: number): void => {
  let px = x
  let pz = z
  const map = nav.map
  const lim = feet + STEP_UP
  const i0 = Math.floor((px - r) / CELL)
  const i1 = Math.floor((px + r) / CELL)
  const j0 = Math.floor((pz - r) / CELL)
  const j1 = Math.floor((pz + r) / CELL)
  // On a ramp the step into a neighbour is measured from the ramp's own
  // height at their shared edge, not from the feet a body's radius back
  // down the slope: a steep ramp (a storey in one cell) meets its landing
  // flush, and a body that cannot reach the edge must still walk onto it.
  const oi = Math.floor(px / CELL)
  const oj = Math.floor(pz / CELL)
  const onRamp = !!map.terrain && oi >= 0 && oj >= 0 && oi < map.w && oj < map.h && !!map.terrain.ramp[oj * map.w + oi]
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      let top = lim
      if (onRamp && (i !== oi || j !== oj)) {
        const ex = Math.max(oi * CELL + 1e-4, Math.min(Math.max(i * CELL, Math.min(px, (i + 1) * CELL)), (oi + 1) * CELL - 1e-4))
        const ez = Math.max(oj * CELL + 1e-4, Math.min(Math.max(j * CELL, Math.min(pz, (j + 1) * CELL)), (oj + 1) * CELL - 1e-4))
        top = Math.max(lim, groundAt(map, ex, ez) + STEP_UP)
      }
      if (!isSolidCell(nav, i, j) && !(cellTopNear(map, i, j, px, pz) > top)) continue
      const minX = i * CELL
      const minZ = j * CELL
      ;[px, pz] = pushOutOfBox(px, pz, r, minX, minZ, minX + CELL, minZ + CELL)
    }
  }
  const ps = nav.plats
  if (ps) {
    for (let n = 0; n < ps.length; n++) {
      const p = ps[n]!
      if (p.top <= lim) continue
      ;[px, pz] = pushOutOfBox(px, pz, r, p.x0, p.z0, p.x1, p.z1)
    }
  }
  _res[0] = px
  _res[1] = pz
}

const _box: [number, number] = [0, 0]
/** A circle pushed out of an axis-aligned box (a solid cell, a column). */
const pushOutOfBox = (px: number, pz: number, r: number, minX: number, minZ: number, maxX: number, maxZ: number): [number, number] => {
  const cx = Math.max(minX, Math.min(px, maxX))
  const cz = Math.max(minZ, Math.min(pz, maxZ))
  const ddx = px - cx
  const ddz = pz - cz
  const d2 = ddx * ddx + ddz * ddz
  _box[0] = px
  _box[1] = pz
  if (d2 >= r * r) return _box
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    _box[0] = px + (ddx / d) * (r - d)
    _box[1] = pz + (ddz / d) * (r - d)
    return _box
  }
  const left = px - minX
  const right = maxX - px
  const top = pz - minZ
  const bottom = maxZ - pz
  const m = Math.min(left, right, top, bottom)
  if (m === left) _box[0] = minX - r
  else if (m === right) _box[0] = maxX + r
  else if (m === top) _box[1] = minZ - r
  else _box[1] = maxZ + r
  return _box
}

/**
 * Whether a walk can go from cell a to its neighbour b on a terrain map: no
 * pit, and b's floor at the shared edge no more than a step above a's (any
 * drop is fine: it is one way). A diagonal only across four level cells.
 */
export const walkStep = (map: MapData, ai: number, aj: number, bi: number, bj: number): boolean => {
  const t = map.terrain
  if (!t) return true
  const W = map.w
  const kb = bj * W + bi
  if (t.pit[kb]) return false
  const di = bi - ai
  const dj = bj - aj
  if (di && dj) {
    const ka = aj * W + ai
    const f = t.floor[ka]!
    for (const k of [ka, kb, aj * W + bi, bj * W + ai]) {
      if (t.pit[k] || t.ramp[k] || t.floor[k] !== f || map.cell[k] === Cell.Void) return false
    }
    return true
  }
  return edgeHeight(map, bi, bj, -di, -dj) - edgeHeight(map, ai, aj, di, dj) <= STEP_UP
}

/** The hops a walk cannot make, per cell: ladders both ways, each lift
 *  from the cells beside one stop to the cells beside the other, and the
 *  map's own links. */
const terrainLinks = (map: MapData): Map<number, number[]> => {
  const t = map.terrain!
  const W = map.w
  const links = new Map<number, number[]>()
  const add = (a: number, b: number) => {
    if (a === b) return
    const l = links.get(a)
    if (l) { if (!l.includes(b)) l.push(b) } else links.set(a, [b])
  }
  for (const L of t.ladders) {
    const foot = L.j * W + L.i
    const top = (L.j + L.dj) * W + L.i + L.di
    add(foot, top)
    add(top, foot)
  }
  // Level floor cells right beside a stop (where one steps on and off).
  const beside = (x: number, y: number, z: number): number[] => {
    const out: number[] = []
    const si = Math.floor(x / CELL)
    const sj = Math.floor(z / CELL)
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const i = si + di
      const j = sj + dj
      if (i < 0 || j < 0 || i >= W || j >= map.h) continue
      const k = j * W + i
      if (map.cell[k] === Cell.Void || t.pit[k]) continue
      if (Math.abs(edgeHeight(map, i, j, -di, -dj) - y) < 0.3) out.push(k)
    }
    return out
  }
  for (const lf of t.lifts) {
    const a = beside(lf.ax, lf.ay, lf.az)
    const b = beside(lf.bx, lf.by, lf.bz)
    for (const ka of a) for (const kb of b) { add(ka, kb); add(kb, ka) }
  }
  // The level's own one-way hops (a dash leap over a gap, a rail ride):
  // what no floor, ladder or lift tells the search (`Terrain.links`).
  for (const l of t.links ?? []) add(l.from[1] * W + l.from[0], l.to[1] * W + l.to[0])
  return links
}

/** A straight walk from a to b a body could make on a terrain map: no pit
 *  under the way, nothing to climb but steps. */
const walkableLine = (nav: Nav, ax: number, az: number, bx: number, bz: number): boolean => {
  const map = nav.map
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.max(1, Math.ceil(len / 0.4))
  let prev = groundAt(map, ax, az)
  for (let s = 1; s <= n; s++) {
    const y = groundAt(map, ax + (bx - ax) * s / n, az + (bz - az) * s / n)
    if (y === -Infinity || y - prev > STEP_UP) return false
    prev = y
  }
  return true
}

export const setCellSolid = (nav: Nav, i: number, j: number, v: boolean): void => {
  if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return
  nav.solid[j * nav.w + i] = v ? 1 : 0
}

export const isSolidCell = (nav: Nav, i: number, j: number): boolean => {
  if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return true
  return nav.solid[j * nav.w + i] === 1
}

export const isSolidAt = (nav: Nav, x: number, z: number): boolean =>
  isSolidCell(nav, Math.floor(x / CELL), Math.floor(z / CELL))

/**
 * Move a circle by (dx, dz) and resolve against solid cells and pillars.
 * Axis-separated so the circle slides along walls instead of sticking.
 * Mutates and returns `out` ([x, z]).
 */
export const moveCircle = (nav: Nav, x: number, z: number, dx: number, dz: number, r: number, out: [number, number]): [number, number] => {
  // Sub-step long moves so a fast slide cannot tunnel through a wall corner.
  const len = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(len / (r * 0.8)))
  let px = x
  let pz = z
  const sx = dx / steps
  const sz = dz / steps
  for (let s = 0; s < steps; s++) {
    px += sx
    ;[px, pz] = resolveCircle(nav, px, pz, r)
    pz += sz
    ;[px, pz] = resolveCircle(nav, px, pz, r)
  }
  out[0] = px
  out[1] = pz
  return out
}

const _res: [number, number] = [0, 0]
/** Rounds of push off the round things, then off the walls: a body wedged
 *  between a post and a wall slides round the post instead of staying in it,
 *  and the walls still have the last word. */
const SETTLE_PASSES = 3
/**
 * Push a circle out of every overlapping solid cell and pillar. The walls have
 * the last word: a pillar's, a prop's or a slab's push knows no walls, and a
 * crate against a wall pushed a body that slipped behind it into the wall —
 * where the next frame's cell pass and the crate's push held it, a machine
 * stuck in a wall for 30 s (#160). Such a body ends against the wall,
 * overlapping the crate a little.
 */
export const resolveCircle = (nav: Nav, x: number, z: number, r: number): [number, number] => {
  resolveCells(nav, x, z, r)
  for (let k = 0; k < SETTLE_PASSES; k++) {
    resolveExtras(nav, _res[0], _res[1], r)
    resolveCells(nav, _res[0], _res[1], r)
  }
  return _res
}

/** The cell part of `resolveCircle`: out of every overlapping solid cell. Writes `_res`. */
const resolveCells = (nav: Nav, x: number, z: number, r: number): void => {
  let px = x
  let pz = z
  const i0 = Math.floor((px - r) / CELL)
  const i1 = Math.floor((px + r) / CELL)
  const j0 = Math.floor((pz - r) / CELL)
  const j1 = Math.floor((pz + r) / CELL)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (!isSolidCell(nav, i, j)) continue
      // Closest point of the cell AABB to the circle centre.
      const minX = i * CELL
      const minZ = j * CELL
      const cx = Math.max(minX, Math.min(px, minX + CELL))
      const cz = Math.max(minZ, Math.min(pz, minZ + CELL))
      const ddx = px - cx
      const ddz = pz - cz
      const d2 = ddx * ddx + ddz * ddz
      if (d2 >= r * r) continue
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        const push = r - d
        px += (ddx / d) * push
        pz += (ddz / d) * push
      } else {
        // Centre inside the cell: push out along the shallowest axis.
        const left = px - minX
        const right = minX + CELL - px
        const top = pz - minZ
        const bottom = minZ + CELL - pz
        const m = Math.min(left, right, top, bottom)
        if (m === left) px = minX - r
        else if (m === right) px = minX + CELL + r
        else if (m === top) pz = minZ - r
        else pz = minZ + CELL + r
      }
    }
  }
  _res[0] = px
  _res[1] = pz
}

/** The part of the push-out after the cells: pillars, props, closed door
 *  slabs. Shared by `resolveCircle` and `resolveBody`; writes `_res`. */
const resolveExtras = (nav: Nav, x: number, z: number, r: number): void => {
  let px = x
  let pz = z
  for (const p of nav.map.pillars) {
    if (p.gone) continue
    const ddx = px - p.x
    const ddz = pz - p.z
    const rr = r + p.r
    const d2 = ddx * ddx + ddz * ddz
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2)
      px = p.x + (ddx / d) * rr
      pz = p.z + (ddz / d) * rr
    }
  }
  // Dynamic props (chests, crates): solid until opened / broken.
  for (const p of nav.props) {
    if (!p.active) continue
    const ddx = px - p.x
    const ddz = pz - p.z
    const rr = r + p.r
    const d2 = ddx * ddx + ddz * ddz
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2)
      px = p.x + (ddx / d) * rr
      pz = p.z + (ddz / d) * rr
    }
  }
  for (const sl of nav.slabs) {
    if (!sl.active) continue
    const cx = Math.max(sl.minX, Math.min(px, sl.maxX))
    const cz = Math.max(sl.minZ, Math.min(pz, sl.maxZ))
    const ddx = px - cx
    const ddz = pz - cz
    const d2 = ddx * ddx + ddz * ddz
    if (d2 >= r * r) continue
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2)
      px += (ddx / d) * (r - d)
      pz += (ddz / d) * (r - d)
    } else {
      // Inside the slab: push out along the thin axis toward the nearer face.
      const thinX = sl.maxX - sl.minX < sl.maxZ - sl.minZ
      if (thinX) px = px < (sl.minX + sl.maxX) / 2 ? sl.minX - r : sl.maxX + r
      else pz = pz < (sl.minZ + sl.maxZ) / 2 ? sl.minZ - r : sl.maxZ + r
    }
  }
  _res[0] = px
  _res[1] = pz
}

/** Segment vs AABB (slab) intersection — Liang–Barsky style clip. */
const segHitsSlab = (ax: number, az: number, bx: number, bz: number, sl: Slab): boolean => {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dz = bz - az
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const r = q / p
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r }
    else { if (r < t0) return false; if (r < t1) t1 = r }
    return true
  }
  return clip(-dx, ax - sl.minX) && clip(dx, sl.maxX - ax) && clip(-dz, az - sl.minZ) && clip(dz, sl.maxZ - az) && t0 <= t1
}

/** Does the segment from (ax, az) along (dx, dz) pass through a post on one
 *  of cell (i, j)'s four corners? A post near the segment always sits on a
 *  corner of a cell the segment crosses (a post is far smaller than a
 *  cell), so the grid walk only has to ask the cells it visits. */
const cornerPostHit = (nav: Nav, i: number, j: number, ax: number, az: number, dx: number, dz: number, len2: number): boolean => {
  const posts = nav.posts
  if (!posts) return false
  const W1 = nav.w + 1
  for (let c = 0; c < 4; c++) {
    const vi = i + (c & 1)
    const vj = j + (c >> 1)
    if (vi < 0 || vj < 0 || vi > nav.w || vj > nav.h) continue
    const r = posts[vj * W1 + vi]!
    if (!r) continue
    const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((vi * CELL - ax) * dx + (vj * CELL - az) * dz) / len2))
    const cx = ax + dx * t - vi * CELL
    const cz = az + dz * t - vj * CELL
    // As lenient as a pillar (below)
    if (cx * cx + cz * cz < r * r * 0.8) return true
  }
  return false
}

/**
 * Grid line of sight from (ax, az) to (bx, bz). Pillars block too (a
 * segment-vs-circle test), so an enemy behind a pillar cannot shoot through
 * it, and so do the posts on wall corners and doorways (`Nav.posts`).
 */
export const hasLineOfSight = (nav: Nav, ax: number, az: number, bx: number, bz: number): boolean => {
  let i = Math.floor(ax / CELL)
  let j = Math.floor(az / CELL)
  const ti = Math.floor(bx / CELL)
  const tj = Math.floor(bz / CELL)
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (cornerPostHit(nav, i, j, ax, az, dx, dz, len2)) return false
  const stepI = dx > 0 ? 1 : -1
  const stepJ = dz > 0 ? 1 : -1
  const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity
  const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity
  const nextX = stepI > 0 ? (i + 1) * CELL : i * CELL
  const nextZ = stepJ > 0 ? (j + 1) * CELL : j * CELL
  let tMaxX = dx !== 0 ? Math.abs((nextX - ax) / dx) : Infinity
  let tMaxZ = dz !== 0 ? Math.abs((nextZ - az) / dz) : Infinity
  let guard = 0
  while ((i !== ti || j !== tj) && guard++ < 256) {
    if (tMaxX < tMaxZ) {
      tMaxX += tDeltaX
      i += stepI
    } else {
      tMaxZ += tDeltaZ
      j += stepJ
    }
    if (isSolidCell(nav, i, j) || cornerPostHit(nav, i, j, ax, az, dx, dz, len2)) return false
  }
  for (const sl of nav.slabs) {
    if (sl.active && segHitsSlab(ax, az, bx, bz, sl)) return false
  }
  // Pillars
  if (len2 < 1e-6) return true
  for (const p of nav.map.pillars) {
    if (p.gone) continue
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2))
    const cx = ax + dx * t - p.x
    const cz = az + dz * t - p.z
    if (cx * cx + cz * cz < p.r * p.r * 0.8) return false
  }
  return true
}

// ─── A* ──────────────────────────────────────────────────────────────────────

/**
 * A* over walkable cells (8-connected, no corner cutting). Returns world-space
 * waypoints from the cell after `from` to `to`'s cell centre, or null when no
 * path exists. Grids are ≤ 44×44, so a binary-heap-free open list is plenty.
 *
 * On a terrain map a step is only a walk (`walkStep`: up stairs, down any
 * drop, never over a pit), so tap-to-move never routes up a cliff; `links`
 * adds the ladder and lift hops for a path that only has to be SHOWN (the
 * objective trail), never walked by the tap-to-move.
 */
export const findPath = (nav: Nav, fx: number, fz: number, tx: number, tz: number, maxNodes = 1400, through = 0, links = false): Array<[number, number]> | null => {
  const terr = nav.map.terrain ? nav.map : null
  const hops = links ? nav.links : undefined
  const W = nav.w
  const si = Math.floor(fx / CELL)
  const sj = Math.floor(fz / CELL)
  const ti = Math.floor(tx / CELL)
  const tj = Math.floor(tz / CELL)
  if (isSolidCell(nav, ti, tj)) return null
  const start = sj * W + si
  const goal = tj * W + ti
  if (start === goal) return [[tx, tz]]
  const blocked = (i: number, j: number) => isSolidCell(nav, i, j) || nav.map.navBlock[j * W + i] === 1 || nav.pathBlock[j * W + i]! > through
  const g = new Map<number, number>()
  const came = new Map<number, number>()
  const open: number[] = [start]
  const f = new Map<number, number>()
  const h = (k: number) => {
    const i = k % W
    const j = (k - i) / W
    const ddx = Math.abs(i - ti)
    const ddz = Math.abs(j - tj)
    return Math.max(ddx, ddz) + 0.414 * Math.min(ddx, ddz)
  }
  g.set(start, 0)
  f.set(start, h(start))
  const closed = new Set<number>()
  let expanded = 0
  while (open.length && expanded++ < maxNodes) {
    let bi = 0
    let bf = Infinity
    for (let n = 0; n < open.length; n++) {
      const v = f.get(open[n]!) ?? Infinity
      if (v < bf) { bf = v; bi = n }
    }
    const cur = open[bi]!
    open.splice(bi, 1)
    if (cur === goal) {
      const cells: number[] = [cur]
      let c = cur
      while (came.has(c)) { c = came.get(c)!; cells.push(c) }
      cells.reverse()
      const out: Array<[number, number]> = []
      for (let n = 1; n < cells.length; n++) {
        const k = cells[n]!
        const i = k % W
        const j = (k - i) / W
        out.push([(i + 0.5) * CELL, (j + 0.5) * CELL])
      }
      // Final waypoint is the exact target, not the cell centre.
      out[out.length - 1] = [tx, tz]
      return out
    }
    closed.add(cur)
    const ci = cur % W
    const cj = (cur - ci) / W
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = ci + di
        const nj = cj + dj
        if (blocked(ni, nj) && !(ni === ti && nj === tj && !isSolidCell(nav, ni, nj) && nav.pathBlock[nj * W + ni]! <= through)) continue
        if (di && dj && (blocked(ci + di, cj) || blocked(ci, cj + dj))) continue
        if (terr && !walkStep(terr, ci, cj, ni, nj)) continue
        const nk = nj * W + ni
        if (closed.has(nk)) continue
        const cost = (g.get(cur) ?? 0) + (di && dj ? 1.414 : 1)
        if (cost < (g.get(nk) ?? Infinity)) {
          came.set(nk, cur)
          g.set(nk, cost)
          f.set(nk, cost + h(nk))
          if (!open.includes(nk)) open.push(nk)
        }
      }
    }
    const hop = hops?.get(cur)
    if (hop) {
      for (const nk of hop) {
        if (closed.has(nk)) continue
        const cost = (g.get(cur) ?? 0) + 2
        if (cost < (g.get(nk) ?? Infinity)) {
          came.set(nk, cur)
          g.set(nk, cost)
          f.set(nk, cost + h(nk))
          if (!open.includes(nk)) open.push(nk)
        }
      }
    }
  }
  return null
}

/** Pull a path taut: drop waypoints that are directly visible from an earlier
 *  point, so walking to a tapped spot follows smooth diagonals, not a staircase.
 *  On a terrain map a shortcut must also be walkable (no pit under it, no
 *  cliff to climb), so a pulled path never cuts past the stairs. */
export const smoothPath = (nav: Nav, fx: number, fz: number, path: Array<[number, number]>, radius = 0.45): Array<[number, number]> => {
  if (path.length <= 1) return path
  const out: Array<[number, number]> = []
  const terr = !!nav.map.terrain
  let ax = fx
  let az = fz
  let n = 0
  while (n < path.length) {
    let far = n
    for (let m = path.length - 1; m > n; m--) {
      const [bx, bz] = path[m]!
      if (clearCorridor(nav, ax, az, bx, bz, radius) && (!terr || walkableLine(nav, ax, az, bx, bz))) { far = m; break }
    }
    const [px, pz] = path[far]!
    out.push([px, pz])
    ax = px
    az = pz
    n = far + 1
  }
  return out
}

/** LOS for a fat body: tests the centre line and both shoulder lines. */
const clearCorridor = (nav: Nav, ax: number, az: number, bx: number, bz: number, r: number): boolean => {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz) || 1
  const nx = -dz / len * r
  const nz = dx / len * r
  return hasLineOfSight(nav, ax, az, bx, bz)
    && hasLineOfSight(nav, ax + nx, az + nz, bx + nx, bz + nz)
    && hasLineOfSight(nav, ax - nx, az - nz, bx - nx, bz - nz)
}
