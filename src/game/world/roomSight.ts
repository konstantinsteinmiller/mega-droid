import { CELL, Cell, WALL_H, type MapData } from './levelGen'

/**
 * ─── What a room can see over its walls ─────────────────────────────────────
 *
 * Portal culling (`Mission.updateRoomCulling`) shows the player's room and
 * the rooms seen through its open doors. That is the whole story in the
 * labyrinth (4.2 m walls on flat floors against a 1.6 m eye), but not on a
 * terrain map: a stage's walls stand 5 m over each room's OWN highest floor,
 * so the next room's walls rise metres over a lower room's; an island over
 * open sky (`Terrain.clouds`) has no wall on its outer edge at all; and a
 * door is a 4.2 m panel in a gap that runs up to the wall tops. Sky Docks'
 * wind tunnel (playtest 2026-10-11) stood 4 m over the shuttle chain beside
 * it and was simply not there until Flux went through its door.
 *
 * `roomSight` works out, once per map, which rooms each room can see whatever
 * its doors do: per room, the rooms on the route next to it (joined by a
 * door), plus every room a straight sight line reaches from a standing eye in
 * it — over the walls by their real tops, through the open sides, over the
 * door panels, never through a floor or a cliff. The labyrinth keeps its pure
 * portals: a map without terrain gets empty lists.
 */

/** The eye over the feet (m): `sim/constants.ts` EYE_H, and a little bob. */
const EYE = 1.45
/** Rooms this close (m, wall to wall) always see each other. */
const NEAR_GAP = CELL

export interface SightOpts {
  /** The eye over the feet (m). */
  eye?: number
  /** Nothing past this is drawn anyway (m): the fog's reach. */
  far?: number
}

/** Per room, the other rooms it sees regardless of its doors (sorted). */
export const roomSight = (map: MapData, owner: Int16Array, opts: SightOpts = {}): number[][] => {
  const steps = roomSightSteps(map, owner, opts)
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

/** `roomSight` a room at a time: it yields after each, for a time-sliced
 *  build (`engine/slicer.ts`), and returns the lists. */
export function* roomSightSteps(map: MapData, owner: Int16Array, opts: SightOpts = {}): Generator<void, number[][]> {
  const n = map.rooms.length
  const out: number[][] = Array.from({ length: n }, () => [])
  const t = map.terrain
  if (!t) return out
  const eye = opts.eye ?? EYE
  const far = opts.far ?? Infinity
  const W = map.w
  const H = map.h
  const sees = Array.from({ length: n }, () => new Uint8Array(n))
  // The rooms either side of a door: the next room on the route (and the one
  // before) is always drawn on a terrain map.
  for (const d of map.doors) {
    if (d.from >= 0 && d.to >= 0 && d.from !== d.to) {
      sees[d.from]![d.to] = 1
      sees[d.to]![d.from] = 1
    }
  }

  const walk = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < W && j < H && map.cell[j * W + i] !== Cell.Void
  const top = (k: number): number => {
    const r = map.room[k]!
    return r >= 0 ? t.wallTop[r]! : t.floor[k]! + WALL_H + 0.8
  }
  const stand = (k: number): number => (t.pit[k] ? -Infinity : t.floor[k]!)
  // Over open sky a pit cell's outer edge has no wall (`climbMesh.ts`).
  const open = (k: number): boolean => !!t.clouds && !!t.pit[k]
  /** How high the edge between two cells stops a sight line (m). */
  const edge = (a: number, b: number): number => {
    const ia = a % W
    const ja = (a - ia) / W
    const ib = b % W
    const jb = (b - ib) / W
    const wa = walk(ia, ja)
    const wb = walk(ib, jb)
    if (wa !== wb) {
      const k = wa ? a : b
      return open(k) ? -Infinity : top(k)
    }
    if (!wa) return -Infinity
    return Math.max(stand(a), stand(b))
  }
  // Every edge's height once (a sight line only reads them): `ex` the edge
  // on the line x = c between cells c − 1 and c of row j, `ez` the edge on
  // z = r between rows r − 1 and r. Off the grid is void, which stops nothing.
  const ex = new Float32Array((W + 1) * H).fill(-Infinity)
  const ez = new Float32Array(W * (H + 1)).fill(-Infinity)
  for (let j = 0; j < H; j++) {
    for (let c = 0; c <= W; c++) {
      const a = c > 0 ? j * W + c - 1 : -1
      const b = c < W ? j * W + c : -1
      ex[j * (W + 1) + c] = a < 0 ? (walk(c, j) && !open(b) ? top(b) : -Infinity) : b < 0 ? (walk(c - 1, j) && !open(a) ? top(a) : -Infinity) : edge(a, b)
    }
  }
  for (let r = 0; r <= H; r++) {
    for (let i = 0; i < W; i++) {
      const a = r > 0 ? (r - 1) * W + i : -1
      const b = r < H ? r * W + i : -1
      ez[r * W + i] = a < 0 ? (walk(i, r) && !open(b) ? top(b) : -Infinity) : b < 0 ? (walk(i, r - 1) && !open(a) ? top(a) : -Infinity) : edge(a, b)
    }
  }
  // A door is a WALL_H panel in its gap: over it the gap runs on up.
  for (const d of map.doors) {
    const y = t.floor[d.j * W + d.i]! + WALL_H
    if (d.axis === 'x') {
      const c = d.i + (d.dir > 0 ? 1 : 0)
      ex[d.j * (W + 1) + c] = Math.max(ex[d.j * (W + 1) + c]!, y)
    } else {
      const r = d.j + (d.dir > 0 ? 1 : 0)
      ez[r * W + d.i] = Math.max(ez[r * W + d.i]!, y)
    }
  }
  const stopX = (c: number, j: number, h: number): boolean => c >= 0 && c <= W && j >= 0 && j < H && h < ex[j * (W + 1) + c]!
  const stopZ = (i: number, r: number, h: number): boolean => i >= 0 && i < W && r >= 0 && r <= H && h < ez[r * W + i]!
  /** A straight line from e to p, cell edge by cell edge (a grid walk). */
  const clear = (ex: number, ey: number, ez: number, px: number, py: number, pz: number): boolean => {
    let i = Math.floor(ex / CELL)
    let j = Math.floor(ez / CELL)
    const ti = Math.floor(px / CELL)
    const tj = Math.floor(pz / CELL)
    const dx = px - ex
    const dz = pz - ez
    const si = Math.sign(dx)
    const sj = Math.sign(dz)
    const stepX = dx !== 0 ? CELL / Math.abs(dx) : Infinity
    const stepZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity
    let nextX = dx > 0 ? ((i + 1) * CELL - ex) / dx : dx < 0 ? (i * CELL - ex) / dx : Infinity
    let nextZ = dz > 0 ? ((j + 1) * CELL - ez) / dz : dz < 0 ? (j * CELL - ez) / dz : Infinity
    for (let guard = 0; (i !== ti || j !== tj) && guard < 512; guard++) {
      if (nextX < nextZ) {
        if (nextX > 1) break
        if (stopX(si > 0 ? i + 1 : i, j, ey + (py - ey) * nextX)) return false
        i += si
        nextX += stepX
      } else {
        if (nextZ > 1) break
        if (stopZ(i, sj > 0 ? j + 1 : j, ey + (py - ey) * nextZ)) return false
        j += sj
        nextZ += stepZ
      }
    }
    return true
  }

  // Eyes: over every standing cell a room owns (its middle, and toward each
  // drop at its edge, where a player leans over the ledge), and over
  // whatever carries him across its pits (a lift's stops, a bridge of light).
  const eyes: number[][] = Array.from({ length: n }, () => [])
  // Marks: what of a room shows: its floors, and its walls' tops.
  const marks: number[][] = Array.from({ length: n }, () => [])
  /** Each room's extent in cells, for the fog cut. */
  const box = Array.from({ length: n }, () => [Infinity, Infinity, -Infinity, -Infinity])
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  const lean = CELL * 0.4
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      const o = owner[k]!
      if (o < 0 || o >= n || !walk(i, j)) continue
      const b = box[o]!
      b[0] = Math.min(b[0]!, i)
      b[1] = Math.min(b[1]!, j)
      b[2] = Math.max(b[2]!, i)
      b[3] = Math.max(b[3]!, j)
      const cx = (i + 0.5) * CELL
      const cz = (j + 0.5) * CELL
      if (!t.pit[k]) {
        const fy = t.floor[k]!
        // Inside a flat stretch of floor every other cell does (a cell is
        // 3 m): the edges, where the view changes, keep them all.
        const flat = SIDES.every(([di, dj]) => walk(i + di, j + dj) && stand((j + dj) * W + i + di) === fy)
        if (!flat || ((i + j) & 1) === 0) {
          eyes[o]!.push(cx, fy + eye, cz)
          marks[o]!.push(cx, fy + 0.5, cz)
        }
        for (const [di, dj] of SIDES) {
          if (walk(i + di, j + dj) && stand((j + dj) * W + i + di) < fy - 0.5) eyes[o]!.push(cx + di * lean, fy + eye, cz + dj * lean)
        }
      }
      // A wall's top, just outside it (inside, it is the room's own floor
      // and walls a sight line from above meets first): at its middle and
      // toward both ends, since its outside is drawn too (`outerWall`) and
      // a far corner of it shows past a nearer wall's end.
      for (const [di, dj] of SIDES) {
        if (walk(i + di, j + dj) || open(k)) continue
        for (const s of [-0.35, 0, 0.35]) {
          marks[o]!.push(cx + di * (CELL / 2 + 0.1) + dj * s * CELL, top(k) - 0.1, cz + dj * (CELL / 2 + 0.1) + di * s * CELL)
        }
      }
    }
  }
  const ownerAt = (x: number, z: number): number => {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    return i >= 0 && j >= 0 && i < W && j < H ? owner[j * W + i]! : -1
  }
  for (const lf of t.lifts) {
    for (const [x, y, z] of [[lf.ax, lf.ay, lf.az], [lf.bx, lf.by, lf.bz]] as const) {
      const o = ownerAt(x, z)
      if (o >= 0 && o < n) eyes[o]!.push(x, y + eye, z)
    }
  }
  for (const br of t.neon ?? []) {
    for (let j = br.j; j < br.j + br.d; j++) {
      for (let i = br.i; i < br.i + br.w; i++) {
        const x = (i + 0.5) * CELL
        const z = (j + 0.5) * CELL
        const o = ownerAt(x, z)
        if (o >= 0 && o < n) eyes[o]!.push(x, br.y + eye, z)
      }
    }
  }

  const gap = (a: number, b: number): number => {
    const A = box[a]!
    const B = box[b]!
    const gi = Math.max(0, A[0]! - B[2]!, B[0]! - A[2]!) - 1
    const gj = Math.max(0, A[1]! - B[3]!, B[1]! - A[3]!) - 1
    return Math.hypot(Math.max(0, gi), Math.max(0, gj)) * CELL
  }
  // Never a room missing beside Flux (#166, Gale): sampled sight lines can
  // slip past a wall's end or a door's gap, and a room that pops in when he
  // steps through reads as a bug. So the rooms a room touches (or nearly:
  // a corridor's width between), and every room two doors away, are always
  // drawn; the sight lines only add the ones further off.
  const door1 = sees.map(r => Uint8Array.from(r))
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (!door1[a]![b]) continue
      for (let c = 0; c < n; c++) if (door1[b]![c] && c !== a) sees[a]![c] = 1
    }
    for (let b = 0; b < n; b++) {
      if (b !== a && marks[b]!.length && marks[a]!.length && gap(a, b) <= NEAR_GAP) sees[a]![b] = 1
    }
  }
  for (let a = 0; a < n; a++) {
    const E = eyes[a]!
    for (let b = 0; b < n; b++) {
      if (b === a || sees[a]![b] || !E.length || !marks[b]!.length || gap(a, b) > far) continue
      if (anyClear(E, marks[b]!, far, clear)) sees[a]![b] = 1
    }
    yield
  }
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) if (b !== a && sees[a]![b]) out[a]!.push(b)
  }
  return out
}

/** Does any eye of E see any mark of M (both flat x, y, z lists) within `far`? */
const anyClear = (
  E: number[], M: number[], far: number, clear: (ex: number, ey: number, ez: number, px: number, py: number, pz: number) => boolean
): boolean => {
  const far2 = far * far
  for (let e = 0; e < E.length; e += 3) {
    const x = E[e]!
    const z = E[e + 2]!
    for (let m = 0; m < M.length; m += 3) {
      const dx = M[m]! - x
      const dz = M[m + 2]! - z
      if (dx * dx + dz * dz > far2) continue
      if (clear(x, E[e + 1]!, z, M[m]!, M[m + 1]!, M[m + 2]!)) return true
    }
  }
  return false
}
