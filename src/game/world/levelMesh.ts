import {
  BufferGeometry, Float32BufferAttribute, Group, Mesh, Color, BackSide, MeshBasicMaterial, SphereGeometry, type Object3D
} from 'three'
import { CELL, WALL_H, Cell, cellCenter, type MapData, type Door } from './levelGen'
import type { Theme } from './themes'
import { levelAtlas } from './textures'
import { toonVCMap, toonVC, glowVC, outlineMat } from '../models/toon'
import { rcyl, cap, rbox, xform, paint, paintBy, merge, sph, torus } from '../models/kit'
import { mulberry32 } from './rng'
import { wallPipe, wallPipeY } from './wallPipe'
import { noSlice, type Slice } from '../engine/slicer'

/**
 * ─── Static level geometry ───────────────────────────────────────────────────
 *
 * One Group per ROOM (with the corridors leading out of it), each holding at
 * most four draw calls: textured floor+walls, rounded decor (pilasters, caps,
 * pipes, frames), decor outline, and glow strips. Per-room grouping gives
 * three.js an accurate bounding sphere per group for frustum culling and lets
 * the mission hide every room the player cannot see (portal culling through
 * the doors, capped by fog range).
 *
 * The walls are open to the sky — every sector is an outdoor "stage" under a
 * bright gradient sky, which reads far better on a phone than a dark ceiling.
 */

export interface LevelMeshes {
  root: Group
  rooms: Group[]
  sky: Mesh
  /** Distance-cull info per room group: centre and radius. */
  bounds: Array<{ x: number; z: number; r: number }>
  /** Room group owning each cell (−1 = void), for portal culling. */
  owner: Int16Array
  /** A terrain map's secret false walls, by `Terrain.secrets` index (in
   *  their room's group): `ClimbRun.openSecret` hides one. */
  secretWalls?: Object3D[]
  /** A terrain map's door frames, by `MapData.doors` index: each is drawn
   *  while its door is. (The labyrinth's walls hide a frame whose rooms are
   *  both culled, so its frames share one always-visible group.) */
  doorFrames?: Object3D[]
}

export class QuadBatch {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []

  quad(
    a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number],
    n: [number, number, number], uvs: UV8,
    ca: Color, cb: Color, cc: Color, cd: Color
  ) {
    const base = this.pos.length / 3
    this.pos.push(...a, ...b, ...c, ...d)
    for (let k = 0; k < 4; k++) this.nor.push(...n)
    this.uv.push(...uvs)
    for (const cl of [ca, cb, cc, cd]) this.col.push(cl.r, cl.g, cl.b)
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  build(): BufferGeometry | null {
    if (!this.idx.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    return g
  }
}

/**
 * Which room group owns each walkable cell. A corridor belongs to the room it
 * LEAVES: its door stands at the far end, on the child room's wall, so a shut
 * door cleanly separates two groups and the mission can hide the room behind
 * it (portal culling) without taking the corridor in front of it along.
 */
export const cellOwners = (map: MapData): Int16Array => {
  const owner = new Int16Array(map.w * map.h).fill(-1)
  for (let k = 0; k < owner.length; k++) owner[k] = map.room[k]!
  for (const d of map.doors) {
    // Walk back from the door along the corridor to the parent room.
    const di = d.axis === 'x' ? -d.dir : 0
    const dj = d.axis === 'z' ? -d.dir : 0
    let i = d.i
    let j = d.j
    let guard = 0
    while (map.cell[j * map.w + i] === Cell.Corridor && guard++ < 20) {
      owner[j * map.w + i] = d.from
      i += di
      j += dj
    }
  }
  // A walkable cell no walk reached (a corridor whose door cell the next
  // room was built over: Rotor Run's) belongs to the earlier room beside it,
  // or nothing would draw its floor and its walls at all.
  for (let changed = true; changed;) {
    changed = false
    for (let k = 0; k < owner.length; k++) {
      if (owner[k]! >= 0 || map.cell[k] === Cell.Void) continue
      const i = k % map.w
      let best = -1
      for (const n of [i > 0 ? k - 1 : -1, i < map.w - 1 ? k + 1 : -1, k - map.w, k + map.w]) {
        const o = n >= 0 && n < owner.length ? owner[n]! : -1
        if (o >= 0 && (best < 0 || o < best)) best = o
      }
      if (best >= 0) {
        owner[k] = best
        changed = true
      }
    }
  }
  return owner
}

const doorKey = (i: number, j: number) => `${i},${j}`

export type UV8 = [number, number, number, number, number, number, number, number]
/** Atlas UVs: floor cell on the left half, wall cell on the right. */
export const FLOOR_UV: UV8 = [0, 0, 0, 1, 0.5, 1, 0.5, 0]
export const WALL_UV: UV8 = [0.5, 0, 0.5, 1, 1, 1, 1, 0]
/** A flat patch of the floor plate — for decals that should read as solid colour. */
export const PLAIN_UV: UV8 = [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25, 0.5]

/**
 * ─── A wall's outside ────────────────────────────────────────────────────────
 *
 * A wall's face points into its own cell and is culled from behind. On a
 * terrain map the next room's walls rise over a lower room's, and from there
 * a one-sided wall was not there at all: its posts and its top rail stood
 * over a hole into the room behind it (playtest 2026-10-12, Blackout
 * Boulevard). So every wall toward the void is a slab WALL_T thick: its outer
 * face stands that far out, facing the void, with a strip over its top.
 * Same batch, same draw call; from inside the room it is a back face, culled.
 */
export const WALL_T = 0.2

/**
 * How far a wall's outer face runs past (+) or stops short of (−) one end of
 * its edge: `walled(i, j)` is a cell whose edges toward the void are walls;
 * (i, j) the wall's cell, (di, dj) toward the void, (px, pz) the end. Around
 * an outside corner it runs on WALL_T to meet the next outer face; in an
 * inside one (the void's next cell is walled too) it stops WALL_T short of it.
 */
export const outerEnd = (
  walled: (i: number, j: number) => boolean, walk: (i: number, j: number) => boolean,
  i: number, j: number, di: number, dj: number, px: number, pz: number
): number => {
  const si = di ? 0 : Math.sign(px - (i + 0.5) * CELL)
  const sj = dj ? 0 : Math.sign(pz - (j + 0.5) * CELL)
  if (walled(i + di + si, j + dj + sj)) return -WALL_T
  return walk(i + si, j + sj) ? 0 : WALL_T
}

/**
 * The outer face of the wall on the line a–b (either order), facing `m` (into
 * the void), from y0 to y1, in bands of about WALL_H; `ea`/`eb` how far it
 * runs past a/b (`outerEnd`). Over its top a strip from the wall line out:
 * an along-x wall's runs past its ends like the face, an along-z wall's
 * stops at them, so two strips meeting in a corner never overlap. `under`:
 * a strip under its foot too (an island over open sky, seen from below).
 */
export const outerWall = (
  b: QuadBatch, ax: number, az: number, bx: number, bz: number, m: [number, number, number],
  y0: number, y1: number, ea: number, eb: number, lo: Color, hi: Color, under = false
): void => {
  if (y1 - y0 < 0.02) return
  const len = Math.hypot(bx - ax, bz - az)
  const ux = (bx - ax) / len
  const uz = (bz - az) / len
  const ox = m[0] * WALL_T
  const oz = m[2] * WALL_T
  let p0: [number, number] = [ax - ux * ea + ox, az - uz * ea + oz]
  let p1: [number, number] = [bx + ux * eb + ox, bz + uz * eb + oz]
  // Wound toward m: up × (p1 − p0) ∥ m.
  if ((p1[1] - p0[1]) * m[0] - (p1[0] - p0[0]) * m[2] < 0) [p0, p1] = [p1, p0]
  const bands = Math.max(1, Math.ceil((y1 - y0) / WALL_H - 0.05))
  for (let n = 0; n < bands; n++) {
    const ya = y0 + (y1 - y0) * n / bands
    const yb = y0 + (y1 - y0) * (n + 1) / bands
    b.quad([p0[0], ya, p0[1]], [p0[0], yb, p0[1]], [p1[0], yb, p1[1]], [p1[0], ya, p1[1]], m, WALL_UV, lo, hi, hi, lo)
  }
  const alongX = Math.abs(ux) > 0.5
  const sa = alongX ? ea : 0
  const sb = alongX ? eb : 0
  const strip = (y: number, ny: 1 | -1, c: Color) => {
    const q0: [number, number, number] = [ax - ux * sa, y, az - uz * sa]
    const q1: [number, number, number] = [bx + ux * sb, y, bz + uz * sb]
    const q2: [number, number, number] = [q1[0] + ox, y, q1[2] + oz]
    const q3: [number, number, number] = [q0[0] + ox, y, q0[2] + oz]
    // (q1 − q0) × (q3 − q0) points along ±Y by the winding.
    const cy = (q1[2] - q0[2]) * (q3[0] - q0[0]) - (q1[0] - q0[0]) * (q3[2] - q0[2])
    if (cy * ny > 0) b.quad(q0, q1, q2, q3, [0, ny, 0], PLAIN_UV, c, c, c, c)
    else b.quad(q0, q3, q2, q1, [0, ny, 0], PLAIN_UV, c, c, c, c)
  }
  strip(y1, 1, hi)
  if (under) strip(y0, -1, lo)
}

/**
 * Build a sector's static geometry. Async and time-sliced (`slice`, see
 * `engine/slicer.ts`): it is the heaviest part of a mission build, so it hands
 * the thread back between rows and rooms and the loading bar keeps moving.
 */
export const buildLevel = async (
  map: MapData, theme: Theme, slice: Slice = noSlice, onProgress: (f01: number) => void = () => {}
): Promise<LevelMeshes> => {
  const rng = mulberry32(map.seed ^ 0x5eed)
  // The same rounded pieces (wall caps, baseboards, pilasters…) repeat
  // hundreds of times. Generate each shape once, painted, and clone it per
  // placement: a copy of a few arrays instead of a fresh lathe every time.
  const templates = new Map<string, BufferGeometry>()
  const piece = (key: string, make: () => BufferGeometry): BufferGeometry => {
    let t = templates.get(key)
    if (!t) {
      t = make()
      templates.set(key, t)
    }
    return t.clone()
  }
  const owner = cellOwners(map)
  const nRooms = map.rooms.length
  const batches = Array.from({ length: nRooms }, () => new QuadBatch())
  const decor: BufferGeometry[][] = Array.from({ length: nRooms }, () => [])
  const glows: BufferGeometry[][] = Array.from({ length: nRooms }, () => [])

  const cFloor = new Color(theme.floor)
  const cFloorAlt = new Color(theme.floorAlt)
  const cCorr = new Color(theme.corridor)
  const cWall = new Color(theme.wall)
  const cWallLow = new Color(theme.wallLow)
  const cHaz = new Color(theme.hazard)

  const W = map.w
  const walk = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < map.h && map.cell[j * W + i] !== Cell.Void

  const doorCells = new Map<string, Door>()
  for (const d of map.doors) doorCells.set(doorKey(d.i, d.j), d)

  // Corner pilasters, deduplicated across the rooms that share them.
  const corners = new Map<string, { x: number; z: number; owner: number }>()
  const addCorner = (x: number, z: number, o: number) => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`
    if (!corners.has(k)) corners.set(k, { x, z, owner: o })
  }

  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      const c = map.cell[k]
      if (c === Cell.Void) continue
      const o = owner[k]!
      if (o < 0) continue
      const b = batches[o]!
      const x0 = i * CELL
      const z0 = j * CELL
      const x1 = x0 + CELL
      const z1 = z0 + CELL
      // Floor: checker the two floor tones in rooms, plain in corridors.
      const fc = c === Cell.Corridor ? cCorr : ((i + j) & 1 ? cFloor : cFloorAlt)
      b.quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [0, 1, 0], FLOOR_UV, fc, fc, fc, fc)

      // Walls on every edge that faces the void.
      const edges: Array<{ ni: number; nj: number; a: [number, number]; bb: [number, number]; n: [number, number, number] }> = [
        { ni: i - 1, nj: j, a: [x0, z1], bb: [x0, z0], n: [1, 0, 0] },
        { ni: i + 1, nj: j, a: [x1, z0], bb: [x1, z1], n: [-1, 0, 0] },
        { ni: i, nj: j - 1, a: [x0, z0], bb: [x1, z0], n: [0, 0, 1] },
        { ni: i, nj: j + 1, a: [x1, z1], bb: [x0, z1], n: [0, 0, -1] }
      ]
      for (const e of edges) {
        if (walk(e.ni, e.nj)) continue
        const [ax, az] = e.a
        const [bx, bz] = e.bb
        // Wound b→a so the face points along `e.n` (into the walkable cell).
        b.quad(
          [bx, 0, bz], [bx, WALL_H, bz], [ax, WALL_H, az], [ax, 0, az], e.n,
          WALL_UV, cWallLow, cWall, cWall, cWallLow
        )
        // Its outside, seen from over the walls (a cinematic, the beam-in).
        const vi = e.ni - i
        const vj = e.nj - j
        outerWall(b, ax, az, bx, bz, [-e.n[0], 0, -e.n[2]], 0, WALL_H,
          outerEnd(walk, walk, i, j, vi, vj, ax, az), outerEnd(walk, walk, i, j, vi, vj, bx, bz), cWallLow, cWall)
        addCorner(ax, az, o)
        addCorner(bx, bz, o)
        const mx = (ax + bx) / 2
        const mz = (az + bz) / 2
        const alongX = Math.abs(bx - ax) > 0.1
        const inset = 0.06
        const ox = e.n[0] * inset
        const oz = e.n[2] * inset
        // Rounded top cap + baseboard (the "no hard edges" rule for walls).
        decor[o]!.push(xform(piece('capTop', () => paint(cap(0.2, CELL - 0.4, 10, 3), theme.trim)), [mx, WALL_H, mz], alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]))
        decor[o]!.push(xform(piece('baseboard', () => paint(cap(0.13, CELL - 0.3, 8, 2), theme.wallLow)), [mx + ox, 0.14, mz + oz], alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]))
        // Light strips in rooms, pipes now and then.
        if (c === Cell.Room && rng() < 0.45) {
          glows[o]!.push(xform(piece('strip', () => paint(cap(0.07, 1.1, 8, 2), theme.accent)), [mx + e.n[0] * 0.12, 2.95, mz + e.n[2] * 0.12], alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]))
        } else if (rng() < 0.25) {
          // Over head height, both ends back in the wall (`wallPipe.ts`).
          const py = wallPipeY(0, WALL_H, rng())
          if (py !== null) decor[o]!.push(...wallPipe(mx, mz, e.n, py, alongX, theme.pipe, theme.pilaster))
        }
      }
      await slice()
    }
    onProgress((j + 1) / map.h * 0.7)
  }

  // Pilasters on every wall corner.
  for (const { x, z, owner: o } of corners.values()) {
    decor[o]!.push(xform(piece('pilaster', () => paint(rcyl(0.3, WALL_H + 0.25, 0.12, 14), theme.pilaster)), [x, (WALL_H + 0.25) / 2, z]))
    decor[o]!.push(xform(piece('pilasterCap', () => paint(sph(0.34, 14, 8), theme.trim)), [x, WALL_H + 0.25, z]))
    await slice()
  }

  // Door frames: a rounded lintel with hazard stripes across the doorway.
  // A frame is seen from BOTH rooms, so it belongs to neither: all frames
  // share one always-visible group, which portal culling never hides.
  const doorDecor: BufferGeometry[] = []
  const doorBatch = new QuadBatch()
  for (const d of map.doors) {
    const [fx, fz] = doorFramePos(d)
    const along = d.axis === 'x' ? 'z' : 'x'
    const lintel = paintBy(
      xform(rbox(along === 'x' ? CELL + 0.4 : 0.8, 0.7, along === 'z' ? CELL + 0.4 : 0.8, 0.3), [fx, WALL_H - 0.55, fz]),
      (x, y, z) => {
        const t = along === 'x' ? x : z
        return Math.floor((t + y) * 2.2) & 1 ? theme.hazard : theme.crateTrim
      }
    )
    doorDecor.push(lintel)
    for (const s of [-1, 1]) {
      const px = along === 'x' ? fx + s * (CELL / 2) : fx
      const pz = along === 'z' ? fz + s * (CELL / 2) : fz
      doorDecor.push(xform(paint(rcyl(0.4, WALL_H, 0.15, 16), d.boss ? theme.trim : theme.pilaster), [px, WALL_H / 2, pz]))
    }
    // Hazard stripes on the floor under the door.
    const hb = doorBatch
    const hw = 0.5
    if (d.axis === 'x') {
      hb.quad([fx - hw, 0.012, fz - CELL / 2], [fx - hw, 0.012, fz + CELL / 2], [fx + hw, 0.012, fz + CELL / 2], [fx + hw, 0.012, fz - CELL / 2], [0, 1, 0], PLAIN_UV, cHaz, cHaz, cHaz, cHaz)
    } else {
      hb.quad([fx - CELL / 2, 0.012, fz - hw], [fx - CELL / 2, 0.012, fz + hw], [fx + CELL / 2, 0.012, fz + hw], [fx + CELL / 2, 0.012, fz - hw], [0, 1, 0], PLAIN_UV, cHaz, cHaz, cHaz, cHaz)
    }
  }

  // Pillars (static obstacles in big rooms).
  for (const p of map.pillars) {
    const o = map.room[Math.floor(p.z / CELL) * W + Math.floor(p.x / CELL)]!
    if (o < 0) continue
    decor[o]!.push(xform(paint(rcyl(p.r, 2.6, 0.2, 16), theme.pilaster), [p.x, 1.3, p.z]))
    decor[o]!.push(xform(paint(torus(p.r * 0.95, 0.09, 6, 16), theme.trim), [p.x, 2.2, p.z], [Math.PI / 2, 0, 0]))
    glows[o]!.push(xform(paint(sph(p.r * 0.55, 14, 8), theme.accent), [p.x, 2.75, p.z]))
  }

  // ── Assemble ─────────────────────────────────────────────────────────────
  const root = new Group()
  const rooms: Group[] = []
  const bounds: LevelMeshes['bounds'] = []
  const floorMat = toonVCMap(levelAtlas())
  for (let r = 0; r < nRooms; r++) {
    const g = new Group()
    const geo = batches[r]!.build()
    if (geo) {
      geo.computeBoundingSphere()
      g.add(new Mesh(geo, floorMat))
      const bs = geo.boundingSphere!
      bounds.push({ x: bs.center.x, z: bs.center.z, r: bs.radius })
    } else {
      bounds.push({ x: 0, z: 0, r: 0 })
    }
    await slice()
    if (decor[r]!.length) {
      const dg = merge(decor[r]!)
      dg.computeBoundingSphere()
      g.add(new Mesh(dg, toonVC()))
      const ol = new Mesh(dg, outlineMat(0.035))
      ol.renderOrder = -1
      g.add(ol)
    }
    await slice()
    if (glows[r]!.length) {
      const gg = merge(glows[r]!)
      g.add(new Mesh(gg, glowVC()))
    }
    rooms.push(g)
    root.add(g)
    onProgress(0.75 + ((r + 1) / nRooms) * 0.25)
    await slice()
  }

  if (doorDecor.length) {
    const doorsGroup = new Group()
    const dgeo = doorBatch.build()
    if (dgeo) doorsGroup.add(new Mesh(dgeo, floorMat))
    const dd = merge(doorDecor)
    doorsGroup.add(new Mesh(dd, toonVC()))
    const dol = new Mesh(dd, outlineMat(0.035))
    dol.renderOrder = -1
    doorsGroup.add(dol)
    root.add(doorsGroup)
  }

  const sky = buildSky(theme)
  return { root, rooms, sky, bounds, owner }
}

/** World position of a door's frame: on the child room's wall line. */
export const doorFramePos = (d: Door): [number, number] => {
  const x = cellCenter(d.i) + (d.axis === 'x' ? d.dir * CELL / 2 : 0)
  const z = cellCenter(d.j) + (d.axis === 'z' ? d.dir * CELL / 2 : 0)
  return [x, z]
}

/**
 * One cell of wall as its own mesh, looking like the walls beside it (the
 * same textured face, cap and baseboard): a way on that is a wall until the
 * run time takes it away (the tutorial's first, `sim/mission.ts`). Local
 * origin: the foot of its middle. `axis` is the way through it, `n` the side
 * it is seen from, `h` the height of the walls it stands between (a tall one
 * is built in bands of about WALL_H, as a stage's walls are).
 */
export const buildWallPlug = (theme: Theme, axis: 'x' | 'z', n: 1 | -1, h = WALL_H): Group => {
  const half = CELL / 2
  const lo = new Color(theme.wallLow)
  const hi = new Color(theme.wall)
  const b = new QuadBatch()
  // Wound so the face points along `n`, as `buildLevel` winds its walls.
  const bands = Math.max(1, Math.ceil(h / WALL_H - 0.05))
  for (let m = 0; m < bands; m++) {
    const y0 = h * m / bands
    const y1 = h * (m + 1) / bands
    if (axis === 'x') {
      b.quad([0, y0, -half * n], [0, y1, -half * n], [0, y1, half * n], [0, y0, half * n], [n, 0, 0], WALL_UV, lo, hi, hi, lo)
    } else {
      b.quad([half * n, y0, 0], [half * n, y1, 0], [-half * n, y1, 0], [-half * n, y0, 0], [0, 0, n], WALL_UV, lo, hi, hi, lo)
    }
  }
  // Its back, toward the corridor it shuts (seen from over the walls).
  if (axis === 'x') outerWall(b, 0, -half, 0, half, [-n, 0, 0], 0, h, 0, 0, lo, hi)
  else outerWall(b, -half, 0, half, 0, [0, 0, -n], 0, h, 0, 0, lo, hi)
  const alongX = axis === 'z'
  const rot: [number, number, number] = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
  const out = (d: number, y: number): [number, number, number] => [axis === 'x' ? d * n : 0, y, axis === 'z' ? d * n : 0]
  const parts = [
    xform(paint(cap(0.2, CELL - 0.4, 10, 3), theme.trim), [0, h, 0], rot),
    xform(paint(cap(0.13, CELL - 0.3, 8, 2), theme.wallLow), out(0.06, 0.14), rot)
  ]
  // The rail between two bands, as on a stage's tall walls.
  for (let m = 1; m < bands; m++) parts.push(xform(paint(cap(0.1, CELL - 0.3, 8, 2), theme.pilaster), out(0.08, h * m / bands), rot))
  const decor = merge(parts)
  const g = new Group()
  g.add(new Mesh(b.build()!, toonVCMap(levelAtlas())))
  g.add(new Mesh(decor, toonVC()))
  const ol = new Mesh(decor, outlineMat(0.035))
  ol.renderOrder = -1
  g.add(ol)
  return g
}

/** The sky dome's radius (m). It follows the camera, so only the far plane
 *  (`SKY_FAR`) must clear it; both reach well past the tallest landmark top
 *  (the tether, 225 m up in the far ring) seen from any corner of the level. */
export const SKY_R = 900
/** The mission camera's far plane: just past the sky dome. */
export const SKY_FAR = SKY_R + 100

export const buildSky = (theme: Theme): Mesh => {
  const g = new SphereGeometry(SKY_R, 24, 16)
  const top = new Color(theme.skyTop)
  const bot = new Color(theme.skyBottom)
  const fog = new Color(theme.fog)
  const pos = g.attributes.position!
  const col = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / SKY_R
    if (y > 0) c.copy(bot).lerp(top, Math.pow(y, 0.6))
    else c.copy(bot).lerp(fog, Math.min(1, -y * 4))
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  const m = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false })
  const mesh = new Mesh(g, m)
  mesh.renderOrder = -10
  mesh.frustumCulled = false
  return mesh
}
