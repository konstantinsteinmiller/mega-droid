// The placement audit (playtest 2026-10-12: a neon switch hung in the air
// over a rooftop gap, "so unimmersive"): every object a level places — its
// interactables, its machines' fittings and its set dressing — must stand
// the way a real thing would. Pure geometry over the BUILT meshes (the same
// builders the mission calls, at the positions it gives them), against the
// level's own walls and floors (the rules `climbMesh.ts` draws them by).
//
// For each object its SUPPORT is derived, in this order:
//   • floor   — its base within a few cm of the floor under it;
//   • carried — its base on the top of another object under it;
//   • wall    — its back within a few cm of a wall face that is really drawn
//               there (over open sky a gap's outer edge has none), the wall
//               covering its height and its width;
//   • hung    — its top against the underside of something above it.
// No support: FLOATING — unless its kind is one that hovers on purpose (a
// pickup over its pad, a hologram), and then only over a floor, not a pit.
//
// And besides: a standing object's footprint over a pit or a drop, any part
// of it inside a wall's mass or a ledge (embedded), two objects' bodies in one
// another (overlap), a body in the space in front of a thing the player must
// see or shoot (obscured), a solid body in a doorway or cutting a cell's way
// through (blocking).

import { Mesh, Object3D, Vector3, type BufferAttribute, type Material } from 'three'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { secretDoorFace } from '@/game/world/stages/builder'
import { PLAYER_R } from '@/game/sim/constants'
import { groundAt } from '@/game/world/nav'

/** One placed object: its built meshes in world space, and what it is. */
export interface Placed {
  /** Unique within the level, for messages (`kind #n`). */
  id: string
  /** What it is (the counts and the whitelist go by it). */
  kind: string
  root: Object3D
  /** A body on the floor: walking is blocked by it. */
  solid: boolean
  /** The player must see, shoot or reach it. */
  interact: boolean
  /** A floor interactable's approach side (unit, world): kept clear. */
  front?: [number, number]
}

/** An object as the audit measures it. */
interface Shape {
  p: Placed
  pts: Vector3[]
  min: Vector3
  max: Vector3
  /** Plan-view convex hull (counter-clockwise). */
  hull: Array<[number, number]>
}

export interface Offence {
  id: string
  kind: string
  rule: 'floating' | 'over a pit' | 'embedded' | 'overlap' | 'obscured' | 'blocks a door' | 'blocks the way' | 'on a false wall'
  detail: string
}

/** Kinds meant to hover (a pickup over its pad, a hologram): their reason,
 *  and how high over a floor they may be (they still need one under them). */
export interface Hover { reason: string; over: number }

/** A base this far into the floor still stands on it (feet cross the floor plane). */
const TOL_FLOOR = 0.1
/** A wall thing may sink its back this far into its wall (a pipe out of it). */
const MOUNT_SINK = 0.16
const TOL_ON = 0.06
const TOL_WALL = 0.15
const TOL_HANG = 0.1
/** Deeper than this into a wall's mass or a ledge is embedded (m). */
const TOL_EMBED = 0.06
/** Two bodies further into each other than this overlap (m). */
const TOL_OVERLAP = 0.04
/** In front of a wall thing: from its face out to arm's length (m). */
const CLEAR_OUT = 1.0

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

// ─── The level's walls and floors ────────────────────────────────────────────

/** The level as `climbMesh.ts` / `levelMesh.ts` draw it. */
export class Site {
  readonly map: MapData
  private readonly hidden: Int16Array
  private readonly falseWalls: Set<string>

  constructor(map: MapData) {
    this.map = map
    this.hidden = new Int16Array(map.cell.length).fill(-1)
    this.falseWalls = new Set()
    for (const [n, s] of (map.terrain?.secrets ?? []).entries()) {
      for (const k of s.cells) this.hidden[k] = n
      const f = secretDoorFace(map, s)
      this.falseWalls.add(`${f.i},${f.j},${f.di},${f.dj}`)
      this.falseWalls.add(`${f.i + f.di},${f.j + f.dj},${-f.di},${-f.dj}`)
    }
  }

  K(i: number, j: number): number { return j * this.map.w + i }
  walkable(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.map.w && j < this.map.h && this.map.cell[this.K(i, j)] !== Cell.Void
  }
  pit(k: number): boolean { return !!this.map.terrain?.pit[k] }

  /** The floor under (x, z): −∞ over a pit or in a wall. */
  ground(x: number, z: number): number {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    if (!this.walkable(i, j)) return -Infinity
    return this.map.terrain ? groundAt(this.map, x, z) : 0
  }

  private wallTopOf(k: number): number {
    const t = this.map.terrain
    if (!t) return 4.2
    const r = this.map.room[k]!
    return r >= 0 ? t.wallTop[r]! : t.floor[k]! + 4.2 + 0.8
  }

  private lowOf(k: number): number {
    const t = this.map.terrain
    if (!t) return 0
    const r = this.map.room[k]!
    if (t.pit[k]) return r >= 0 ? t.pitBottom[r]! : t.floor[k]! - 12
    return t.floor[k]!
  }

  /** The wall drawn on cell (i, j)'s edge toward (di, dj): its foot and its
   *  top, or null where none is (an opening, open sky). A cliff up to a
   *  higher neighbour is a wall too. */
  wall(i: number, j: number, di: number, dj: number): { lo: number; hi: number; falseWall: boolean } | null {
    if (!this.walkable(i, j)) return null
    const k = this.K(i, j)
    const ni = i + di
    const nj = j + dj
    const t = this.map.terrain
    const falseWall = this.falseWalls.has(`${i},${j},${di},${dj}`)
    const rim = this.walkable(ni, nj) && this.hidden[this.K(ni, nj)] !== this.hidden[k]
    if (!this.walkable(ni, nj) || rim) {
      // Over open sky a gap's outer edge has no wall (`climbMesh.ts`).
      if (t?.clouds && t.pit[k] && !rim) return null
      return { lo: this.lowOf(k), hi: this.wallTopOf(k), falseWall }
    }
    if (!t) return null
    const nk = this.K(ni, nj)
    if (t.pit[nk]) return null
    const mine = t.pit[k] ? this.lowOf(k) : t.floor[k]! + (t.ramp[k] ? t.rise[k]! : 0)
    const theirs = t.floor[nk]!
    return theirs > mine + 0.05 ? { lo: mine, hi: theirs, falseWall: false } : null
  }

  /** How deep (x, y, z) is inside a wall's mass or under a floor (m; 0: in
   *  the open). */
  depthIn(x: number, y: number, z: number): number {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    const t = this.map.terrain
    if (!this.walkable(i, j)) {
      // Inside a wall's mass: under the top of a wall drawn round this void
      // cell; as deep as the nearest face out of it.
      let solid = false
      let d = Infinity
      for (const [di, dj] of DIRS) {
        const ni = i + di
        const nj = j + dj
        if (!this.walkable(ni, nj)) continue
        const w = this.wall(ni, nj, -di, -dj)
        if (w && y <= w.hi && y >= w.lo) solid = true
        const out = di === 1 ? (i + 1) * CELL - x : di === -1 ? x - i * CELL : dj === 1 ? (j + 1) * CELL - z : z - j * CELL
        d = Math.min(d, out)
      }
      return solid ? Math.min(d, CELL / 2) : 0
    }
    if (!t) return y < -0.01 ? -y : 0
    const k = this.K(i, j)
    if (t.pit[k]) return 0
    const g = this.ground(x, z)
    return y < g ? g - y : 0
  }
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** Light, glow and shafts of light (additive, see-through) are no bodies. */
const isLight = (m: Material | Material[]): boolean => {
  const one = Array.isArray(m) ? m[0] : m
  if (!one) return true
  return one.transparent && (one.depthWrite === false || one.blending === 2)
}

const MAX_PTS = 900

const shapeOf = (p: Placed): Shape | null => {
  p.root.updateMatrixWorld(true)
  const pts: Vector3[] = []
  p.root.traverseVisible(o => {
    const mesh = o as Mesh
    if (!mesh.isMesh || isLight(mesh.material)) return
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
    if (!pos) return
    const step = Math.max(1, Math.floor(pos.count / MAX_PTS))
    for (let n = 0; n < pos.count; n += step) pts.push(new Vector3().fromBufferAttribute(pos, n).applyMatrix4(mesh.matrixWorld))
  })
  if (!pts.length) return null
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const v of pts) { min.min(v); max.max(v) }
  return { p, pts, min, max, hull: hull2(pts.map(v => [v.x, v.z])) }
}

/** Plan-view convex hull (monotone chain). */
const hull2 = (pts: Array<[number, number]>): Array<[number, number]> => {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (s.length < 3) return s
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Array<[number, number]> = []
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, p) <= 1e-9) lo.pop(); lo.push(p) }
  const up: Array<[number, number]> = []
  for (const p of s.reverse()) { while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, p) <= 1e-9) up.pop(); up.push(p) }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}

/** How far two convex polygons overlap (SAT: the least overlap over every
 *  edge normal; ≤ 0: apart). */
const satDepth = (a: Array<[number, number]>, b: Array<[number, number]>): number => {
  let least = Infinity
  for (const poly of [a, b]) {
    for (let n = 0; n < poly.length; n++) {
      const p = poly[n]!
      const q = poly[(n + 1) % poly.length]!
      let nx = q[1] - p[1]
      let nz = p[0] - q[0]
      const l = Math.hypot(nx, nz)
      if (l < 1e-9) continue
      nx /= l
      nz /= l
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
      for (const v of a) { const d = v[0] * nx + v[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d) }
      for (const v of b) { const d = v[0] * nx + v[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d) }
      least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0))
      if (least <= 0) return least
    }
  }
  return least
}

const inHull = (h: Array<[number, number]>, x: number, z: number, pad = 0): boolean => {
  if (h.length < 3) return false
  for (let n = 0; n < h.length; n++) {
    const p = h[n]!
    const q = h[(n + 1) % h.length]!
    const ex = q[0] - p[0]
    const ez = q[1] - p[1]
    const l = Math.hypot(ex, ez)
    if (l < 1e-9) continue
    if ((ex * (z - p[1]) - ez * (x - p[0])) / l < -pad) return false
  }
  return true
}

/** Distance from (x, z) to a convex polygon (0 inside). */
const hullDist = (h: Array<[number, number]>, x: number, z: number): number => {
  if (inHull(h, x, z)) return 0
  let best = Infinity
  for (let n = 0; n < h.length; n++) {
    const p = h[n]!
    const q = h[(n + 1) % h.length]!
    const ex = q[0] - p[0]
    const ez = q[1] - p[1]
    const l2 = ex * ex + ez * ez
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / l2)) : 0
    best = Math.min(best, Math.hypot(p[0] + ex * u - x, p[1] + ez * u - z))
  }
  return best
}

const boxHull = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]

// ─── The audit ───────────────────────────────────────────────────────────────

/** How much of a shape's side toward (di, dj) lies on drawn wall faces
 *  covering its height (0..1), and that wall's line; null when that side is
 *  not on a cell edge. A wall-mounted thing may sink its back a little into
 *  its wall (a pipe out of it): up to MOUNT_SINK. */
const sideOnWall = (site: Site, s: Shape, di: number, dj: number): { cover: number; edge: number; falseWall: boolean } | null => {
  const { min, max } = s
  const side = di === 1 ? max.x : di === -1 ? min.x : dj === 1 ? max.z : min.z
  // The cell edge at or just behind that side.
  const edge = Math.round(side / CELL) * CELL
  const gap = (edge - side) * (di || dj)
  if (gap < -MOUNT_SINK || gap > TOL_WALL) return null
  const lo = dj ? min.x : min.z
  const hi = dj ? max.x : max.z
  const n = Math.max(2, Math.ceil((hi - lo) / 0.5))
  let on = 0
  let falseWall = false
  for (let q = 0; q <= n; q++) {
    const a = lo + 0.03 + (hi - lo - 0.06) * q / n
    const fx = di ? edge - di * 0.3 : a
    const fz = dj ? edge - dj * 0.3 : a
    const w = site.wall(Math.floor(fx / CELL), Math.floor(fz / CELL), di, dj)
    if (w && min.y > w.lo - TOL_FLOOR && max.y < w.hi + 0.05) {
      on++
      if (w.falseWall) falseWall = true
    }
  }
  return { cover: on / (n + 1), edge, falseWall }
}

/** The wall a shape hangs on (all of its back on it), or the two walls a wide
 *  thing spans between (a roof over a room: half of each side or more). */
const wallSupport = (site: Site, s: Shape): { nx: number; nz: number; edge: number; falseWall: boolean } | null => {
  for (const [di, dj] of DIRS) {
    const w = sideOnWall(site, s, di, dj)
    if (w && w.cover > 0.999) return { nx: -di, nz: -dj, edge: w.edge, falseWall: w.falseWall }
  }
  for (const [di, dj] of [[1, 0], [0, 1]] as const) {
    const a = sideOnWall(site, s, di, dj)
    const b = sideOnWall(site, s, -di, -dj)
    if (a && b && a.cover >= 0.5 && b.cover >= 0.5 && Math.max(s.max.x - s.min.x, s.max.z - s.min.z) > CELL) {
      return { nx: 0, nz: 0, edge: NaN, falseWall: false }
    }
  }
  return null
}

export interface AuditOpts {
  /** Kinds that hover on purpose (see `Hover`). */
  hover?: Record<string, Hover>
  /** Kind pairs that may touch, `a|b` (sorted): one rests in the other by design. */
  touching?: ReadonlySet<string>
  /** Kinds left out of the audit entirely, each with its reason: one mesh
   *  laid along a whole line or basin (no single support to derive). */
  exempt?: Record<string, string>
  /** Floor inlays (a live panel, a magnet rail's plate): floor to whatever
   *  stands on them, but never in one another. */
  inlays?: ReadonlySet<string>
  /** Extra undersides things may hang from (the lane gantry's beam). */
  ceilings?: Array<{ x0: number; z0: number; x1: number; z1: number; y: number }>
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Every placement offence of a level's objects. */
export const auditPlacement = (map: MapData, placed: Placed[], opts: AuditOpts = {}): Offence[] => {
  const site = new Site(map)
  const shapes = placed.filter(p => !opts.exempt?.[p.kind]).map(shapeOf).filter((s): s is Shape => !!s)
  const out: Offence[] = []
  const bad = (s: Shape, rule: Offence['rule'], detail: string) => out.push({ id: s.p.id, kind: s.p.kind, rule, detail })
  const hover = opts.hover ?? {}
  const touching = opts.touching ?? new Set()
  const wallOf = new Map<Shape, { nx: number; nz: number; edge: number }>()

  for (const s of shapes) {
    const { min, max } = s
    const at = `(${((min.x + max.x) / 2).toFixed(1)}, ${min.y.toFixed(2)}, ${((min.z + max.z) / 2).toFixed(1)})`
    // Its foot: the points within a few cm of its base.
    const feet = s.pts.filter(v => v.y < min.y + 0.08)
    const fx = feet.reduce((a, v) => a + v.x, 0) / feet.length
    const fz = feet.reduce((a, v) => a + v.z, 0) / feet.length
    const g = site.ground(fx, fz)
    let support: string | null = null
    if (Number.isFinite(g) && min.y > g - TOL_FLOOR && min.y < g + TOL_ON) support = 'floor'
    if (!support) {
      for (const o of shapes) {
        if (o === s || Math.abs(o.max.y - min.y) > TOL_ON) continue
        if (inHull(o.hull, fx, fz)) { support = 'carried'; break }
      }
    }
    const w = wallSupport(site, s)
    if (w) {
      if (!support) { support = 'wall'; wallOf.set(s, w) }
      if (w.falseWall && support === 'wall') bad(s, 'on a false wall', `${at}: hangs on a secret's false wall, which sinks`)
    }
    if (!support) {
      // Its top against (or into) the underside of something over it.
      const ceil = [
        ...shapes.filter(o => o !== s && o.min.y < max.y + TOL_HANG && o.min.y > min.y + 0.2 && inHull(o.hull, (min.x + max.x) / 2, (min.z + max.z) / 2)),
        ...(opts.ceilings ?? []).filter(c => Math.abs(c.y - max.y) < TOL_HANG && (min.x + max.x) / 2 > c.x0 && (min.x + max.x) / 2 < c.x1 && (min.z + max.z) / 2 > c.z0 && (min.z + max.z) / 2 < c.z1)
      ]
      if (ceil.length) support = 'hung'
    }
    if (!support) {
      const h = hover[s.p.kind]
      const under = site.ground((min.x + max.x) / 2, (min.z + max.z) / 2)
      if (h && Number.isFinite(under) && min.y - under < h.over && min.y > under - TOL_FLOOR) support = 'hover'
      else if (h) bad(s, 'over a pit', `${at}: hovers ${Number.isFinite(under) ? `${(min.y - under).toFixed(2)} m over its floor` : 'over no floor'}`)
      else bad(s, 'floating', `${at}: ${Number.isFinite(g) ? `${(min.y - g).toFixed(2)} m over the floor under it` : 'over no floor'}, no wall behind it, nothing above it`)
    }
    if (support === 'floor') {
      // Its foot over a pit or a drop.
      const off = feet.filter(v => { const y = site.ground(v.x, v.z); return !(y > min.y - 0.3) })
      if (off.length > feet.length * 0.2) bad(s, 'over a pit', `${at}: ${Math.round(off.length / feet.length * 100)} % of its foot over a pit or a drop`)
    }
    // Inside a wall's mass or a ledge (a wall thing's back sunk in its own
    // wall, a standing thing's foot in its own floor, are its mounting).
    let deep = 0
    const mount = wallOf.get(s)
    for (const v of s.pts) {
      let d = site.depthIn(v.x, v.y, v.z)
      if (mount && mount.nx + mount.nz !== 0) {
        const behind = ((mount.nx ? v.x : v.z) - mount.edge) * -(mount.nx || mount.nz)
        if (behind > 0 && behind <= MOUNT_SINK) d = 0
      }
      if (support === 'floor' && v.y > min.y - 0.001 && v.y < g + 0.001 && g - v.y <= TOL_FLOOR) d = 0
      deep = Math.max(deep, d)
    }
    if (deep > TOL_EMBED) bad(s, 'embedded', `${at}: ${deep.toFixed(2)} m into a wall or a ledge`)
  }

  // Bodies in one another.
  for (let a = 0; a < shapes.length; a++) {
    for (let b = a + 1; b < shapes.length; b++) {
      const A = shapes[a]!
      const B = shapes[b]!
      if (A.min.y > B.max.y - TOL_OVERLAP || B.min.y > A.max.y - TOL_OVERLAP) continue
      if (A.min.x > B.max.x || B.min.x > A.max.x || A.min.z > B.max.z || B.min.z > A.max.z) continue
      if (touching.has(pairKey(A.p.kind, B.p.kind))) continue
      const inlay = opts.inlays ?? new Set<string>()
      const standsOn = (x: Shape, on: Shape) => inlay.has(on.p.kind) && !inlay.has(x.p.kind) && x.min.y <= on.max.y + 0.02
      if (standsOn(A, B) || standsOn(B, A)) continue
      const d = satDepth(A.hull, B.hull)
      if (d > TOL_OVERLAP) bad(A, 'overlap', `${d.toFixed(2)} m into ${B.p.id}`)
    }
  }

  // The space in front of a thing to see or shoot.
  for (const s of shapes) {
    if (!s.p.interact) continue
    const w = wallOf.get(s)
    const n = w && w.nx + w.nz !== 0 ? [w.nx, w.nz] : s.p.front
    if (!n) continue
    const [nx, nz] = n as [number, number]
    const { min, max } = s
    // Its face (the side toward n) out to arm's length, its width + a margin.
    const face = nx === 1 ? max.x : nx === -1 ? min.x : nz === 1 ? max.z : min.z
    const pad = 0.3
    const box = nx
      ? boxHull(Math.min(face, face + nx * CLEAR_OUT), min.z - pad, Math.max(face, face + nx * CLEAR_OUT), max.z + pad)
      : boxHull(min.x - pad, Math.min(face, face + nz * CLEAR_OUT), max.x + pad, Math.max(face, face + nz * CLEAR_OUT))
    for (const o of shapes) {
      if (o === s || o.min.y > max.y + 0.25 || o.max.y < min.y - 0.25) continue
      if (touching.has(pairKey(s.p.kind, o.p.kind))) continue
      if (satDepth(box, o.hull) > TOL_OVERLAP) bad(s, 'obscured', `${o.p.id} in front of it`)
    }
  }

  // Doors and the way through.
  const solids = shapes.filter(s => s.p.solid)
  for (const d of map.doors) {
    const cells: Array<[number, number]> = [[d.i, d.j], [d.i + (d.axis === 'x' ? 1 : 0), d.j + (d.axis === 'z' ? 1 : 0)], [d.i - (d.axis === 'x' ? 1 : 0), d.j - (d.axis === 'z' ? 1 : 0)]]
    for (const [i, j] of cells) {
      const cell = boxHull(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL)
      for (const s of solids) if (satDepth(cell, s.hull) > TOL_OVERLAP) bad(s, 'blocks a door', `in door ${d.id}'s doorway (${i}, ${j})`)
    }
  }
  const byCell = new Map<number, Shape[]>()
  for (const s of solids) {
    for (let j = Math.floor((s.min.z - PLAYER_R) / CELL); j <= Math.floor((s.max.z + PLAYER_R) / CELL); j++) {
      for (let i = Math.floor((s.min.x - PLAYER_R) / CELL); i <= Math.floor((s.max.x + PLAYER_R) / CELL); i++) {
        if (!site.walkable(i, j)) continue
        const k = site.K(i, j)
        byCell.set(k, [...(byCell.get(k) ?? []), s])
      }
    }
  }
  for (const [k, list] of byCell) {
    const i = k % map.w
    const j = (k - i) / map.w
    const cut = cutsCell(site, i, j, list)
    if (cut) for (const s of list) bad(s, 'blocks the way', `cuts cell (${i}, ${j}): ${cut}`)
  }
  return out
}

/** Does a cell's set of bodies cut the way between two of its open sides
 *  (a body of Flux's width no longer gets from one to the other)? */
const cutsCell = (site: Site, i: number, j: number, list: Shape[]): string | null => {
  const t = site.map.terrain
  const k = site.K(i, j)
  if (t?.pit[k]) return null
  const N = 12
  const sub = CELL / N
  const free = (withThings: boolean): Uint8Array => {
    const f = new Uint8Array(N * N)
    for (let b = 0; b < N; b++) {
      for (let a = 0; a < N; a++) {
        const x = i * CELL + (a + 0.5) * sub
        const z = j * CELL + (b + 0.5) * sub
        // Flux's body off every wall of the cell.
        let ok = true
        for (const [di, dj] of DIRS) {
          const d = di === 1 ? (i + 1) * CELL - x : di === -1 ? x - i * CELL : dj === 1 ? (j + 1) * CELL - z : z - j * CELL
          if (d < PLAYER_R && !open(site, i, j, di, dj)) ok = false
        }
        if (ok && withThings) for (const s of list) if (hullDist(s.hull, x, z) < PLAYER_R * 0.8) { ok = false; break }
        f[b * N + a] = ok ? 1 : 0
      }
    }
    return f
  }
  const sides = DIRS.filter(([di, dj]) => open(site, i, j, di, dj))
  if (sides.length < 2) return null
  const edgeCells = (di: number, dj: number): number[] => {
    const out: number[] = []
    for (let s = 0; s < N; s++) {
      const a = di === 1 ? N - 1 : di === -1 ? 0 : s
      const b = dj === 1 ? N - 1 : dj === -1 ? 0 : s
      out.push(b * N + a)
    }
    return out
  }
  const reach = (f: Uint8Array, from: number[]): Uint8Array => {
    const seen = new Uint8Array(N * N)
    const q = from.filter(c => f[c])
    for (const c of q) seen[c] = 1
    while (q.length) {
      const c = q.pop()!
      const a = c % N
      const b = (c - a) / N
      for (const [da, db] of DIRS) {
        const na = a + da
        const nb = b + db
        if (na < 0 || nb < 0 || na >= N || nb >= N) continue
        const n = nb * N + na
        if (!f[n] || seen[n]) continue
        seen[n] = 1
        q.push(n)
      }
    }
    return seen
  }
  const bare = free(false)
  const full = free(true)
  for (let x = 0; x < sides.length; x++) {
    for (let y = x + 1; y < sides.length; y++) {
      const A = edgeCells(...sides[x]!)
      const B = edgeCells(...sides[y]!)
      const was = reach(bare, A)
      const now = reach(full, A)
      if (B.some(c => was[c]) && !B.some(c => now[c])) return `no way from side ${sides[x]!.join(',')} to side ${sides[y]!.join(',')}`
    }
  }
  return null
}

/** The cell's side toward (di, dj) is a way out at about its floor (not a wall,
 *  not a pit, not a climb). */
const open = (site: Site, i: number, j: number, di: number, dj: number): boolean => {
  if (!site.walkable(i + di, j + dj)) return false
  const t = site.map.terrain
  if (!t) return true
  const k = site.K(i, j)
  const nk = site.K(i + di, j + dj)
  if (t.pit[nk]) return false
  if (t.ramp[k] || t.ramp[nk]) return true
  return Math.abs(t.floor[nk]! - t.floor[k]!) < 0.6
}
