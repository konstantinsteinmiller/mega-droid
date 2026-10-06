import { CELL, Cell, cellCenter, type MapData, type Terrain } from './levelGen'
import { mulberry32 } from './rng'
import { DECOR, SECTOR_DECOR, type DecorKind } from '../models/decorProps'
import type { SectorId } from './themes'

/**
 * ─── Where each level's set dressing stands (#114) ───────────────────────────
 *
 * A pure plan, from the finished map and its level alone, so the level mesh
 * (which draws the props into each room's decor, `climbMesh.ts`) and the
 * mission (which gives the floor props a body, and runs the cranes) read the
 * same one without passing anything between them — and a mirrored map plans
 * its own mirror. Seeded from the map's seed: the same level every visit.
 *
 * Some rooms, not all (ROOM_CHANCE), and never where it could be in the way:
 *
 *   • a FLOOR prop stands only in a true corner of an open room (two walls at
 *     right angles and the cells beside and across it free: never the turn
 *     of a one-cell walkway), on a plain flat cell that nothing else uses —
 *     no hazard, lift, lane, rail, ladder, chest, checkpoint, reward, post,
 *     puzzle, door or doorway, lesson spot, the start, the pad rooms;
 *   • a WALL prop hangs on a bare wall (no pipe, light strip, puzzle button
 *     or panel, switch or valve), on a plain floor cell's face, where the wall
 *     is tall enough for it;
 *   • a CRANE (the Scrapyard's, the Polarity Works' casting shuttle) runs on
 *     rails along the tops of a near-rectangular room's walls, far over every
 *     path; the tutorial's crate and golem rooms always have one, for their
 *     drops (`sim/roomCrane.ts`).
 *
 * The boss arenas keep their floor clear (a fight needs it), except the
 * Blaze Master's, whose forge stands in its far corner (the first debrief
 * says he is forging armour there).
 */

export interface DecorSpot {
  kind: DecorKind
  room: number
  /** The prop's origin: a wall prop's on the wall's face at floor height, a
   *  floor prop's on the floor. */
  x: number
  y: number
  z: number
  /** Turns the prop's +z (its front, into the room) to the world. */
  yaw: number
  /** A floor prop's body on the floor (m); 0 on the wall. */
  r: number
  /** A wall prop's face (`${cell}:${di},${dj}`: the cell and the way to the
   *  wall): the level mesh draws no pipe or light strip on it. */
  face?: string
  /** The wall faces a floor prop backs onto (same key): kept bare too, so a
   *  wall pipe never runs through a tall prop's top. */
  backs?: string[]
}

export interface CraneSpot {
  room: number
  /** The rails' run (world, along x or along z) and the bridge's span. */
  x0: number
  z0: number
  x1: number
  z1: number
  /** Rails along x (the bridge spans z), else along z. */
  alongX: boolean
  /** The rails' height (on the walls' tops) and the floor under them (m). */
  y: number
  floor: number
  /** What hangs on its hook while it idles. */
  carry: 'crate' | 'claw' | 'none'
}

export interface DecorPlan {
  props: DecorSpot[]
  cranes: CraneSpot[]
}

/** A room gets set dressing at this chance (some rooms, not all). */
export const ROOM_CHANCE = 0.75
/** A styled room's own wall prop, this many times (`MapData.roomStyle`). */
export const LANDMARKS_PER_ROOM = 2
/** A floor prop keeps this much from each wall it stands against (m). */
const CORNER_GAP = 0.18
/** A wall prop needs this much wall over its floor (m). */
const WALL_NEED = 4.3
/** Cranes per level at most (besides the tutorial's two). */
const MAX_CRANES = 2
/** The tutorial's walkthrough rooms that drop from a crane: the crate lesson
 *  (its first crate) and the golem room (its golem). */
export const TUTORIAL_CRANE_ROOMS: readonly number[] = [1, 8]
/** The tutorial's fighting rooms after its lessons (not the golem's): their
 *  lesson spots are only where its machines stand, never in a corner. */
export const TUTORIAL_FREE_ROOMS: readonly number[] = [6, 7, 9]

const DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const SIDE: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }

/** Every cell a level's own things use (hazards, rides, pickups, posts…). */
export const reservedCells = (map: MapData, spotsFree: readonly number[] = []): Set<number> => {
  const W = map.w
  const t = map.terrain!
  const out = new Set<number>()
  const cellAt = (x: number, z: number): void => {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    if (i >= 0 && j >= 0 && i < W && j < map.h) out.add(j * W + i)
  }
  const ij = (i: number, j: number): void => {
    if (i >= 0 && j >= 0 && i < W && j < map.h) out.add(j * W + i)
  }
  const box = (i0: number, j0: number, i1: number, j1: number, pad = 0): void => {
    for (let j = Math.min(j0, j1) - pad; j <= Math.max(j0, j1) + pad; j++) for (let i = Math.min(i0, i1) - pad; i <= Math.max(i0, i1) + pad; i++) ij(i, j)
  }
  const seg = (ax: number, az: number, bx: number, bz: number): void => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 3)) + 1
    for (let s = 0; s <= n; s++) cellAt(ax + (bx - ax) * s / n, az + (bz - az) * s / n)
  }
  for (const l of t.ladders) { ij(l.i, l.j); ij(l.i + l.di, l.j + l.dj) }
  for (const l of t.lifts) seg(l.ax, l.az, l.bx, l.bz)
  for (const c of t.crushers) box(c.i, c.j, c.i, c.j, 1)
  for (const l of t.lanes) seg(l.x - l.dx * CELL, l.z - l.dz * CELL, l.x + l.dx * (l.len + CELL), l.z + l.dz * (l.len + CELL))
  for (const c of t.checkpoints) { cellAt(c.x, c.z); for (const k of c.cells) out.add(k) }
  for (const r of t.rewards) cellAt(r.x, r.z)
  for (const f of t.foes) { const i = Math.floor(f.x / CELL); const j = Math.floor(f.z / CELL); box(i, j, i, j, 1) }
  for (const c of t.chests ?? []) cellAt(c.x, c.z)
  for (const s of t.secrets ?? []) {
    for (const k of s.cells) out.add(k)
    for (const b of s.buttons) cellAt(b.x, b.z)
    cellAt(s.panel.x, s.panel.z)
    ij(s.door.i, s.door.j)
  }
  for (const c of t.crumbles ?? []) box(c.i, c.j, c.i + (c.w ?? 1) - 1, c.j + (c.d ?? 1) - 1)
  for (const z of t.wind ?? []) box(z.i0, z.j0, z.i1, z.j1)
  for (const m of t.magnets ?? []) { box(m.i0, m.j0, m.i1, m.j1); if (m.panel) ij(m.panel.i, m.panel.j) }
  for (const w of t.water ?? []) box(w.i0, w.j0, w.i1, w.j1, 1)
  for (const n of t.neon ?? []) box(n.i, n.j, n.i + n.w - 1, n.j + n.d - 1, 1)
  for (const s of t.neonSwitches ?? []) ij(s.i, s.j)
  for (const r of t.rails ?? []) {
    for (let n = 1; n < r.points.length; n++) seg(r.points[n - 1]!.x, r.points[n - 1]!.z, r.points[n]!.x, r.points[n]!.z)
    box(r.boardAt.i, r.boardAt.j, r.boardAt.i, r.boardAt.j, 1)
    box(r.exitAt.i, r.exitAt.j, r.exitAt.i, r.exitAt.j, 1)
  }
  for (const w of t.waves ?? []) if (w.trigger !== 'rail') ij(w.trigger.i, w.trigger.j)
  for (const v of t.vents ?? []) for (let s = 0; s <= 3; s++) ij(v.i + Math.round(v.dx) * s, v.j + Math.round(v.dz) * s)
  for (const p of t.icePillars ?? []) box(p.i, p.j, p.i, p.j, 1)
  for (const c of t.icicles ?? []) box(c.i, c.j, c.i, c.j, 1)
  for (const l of t.links ?? []) { ij(l.from[0], l.from[1]); ij(l.to[0], l.to[1]) }
  if (t.ice) for (let k = 0; k < t.ice.length; k++) if (t.ice[k]) out.add(k)
  // Doors and the cells either side of them.
  for (const d of map.doors) box(d.i, d.j, d.i, d.j, 1)
  // The start, and a tutorial room's lesson spots.
  cellAt(map.start.x, map.start.z)
  for (const r of map.rooms) if (!spotsFree.includes(r.id)) for (const [i, j] of r.spots) ij(i, j)
  for (let k = 0; k < map.navBlock.length; k++) if (map.navBlock[k]) out.add(k)
  return out
}

/** Wall faces a level's own wall things use: puzzle buttons and panels,
 *  switches, valves, magnet panels, ladders and kick shafts. */
const reservedFaces = (map: MapData): Set<string> => {
  const W = map.w
  const t = map.terrain!
  const out = new Set<string>()
  const face = (i: number, j: number, di: number, dj: number): void => { out.add(`${j * W + i}:${di},${dj}`) }
  const side = (i: number, j: number, s: string): void => { const d = SIDE[s]!; face(i, j, d[0], d[1]) }
  const near = (x: number, z: number, nx: number, nz: number): void => {
    // A thing on a wall, its normal (nx, nz) into the room: the wall is the
    // cell's face the other way.
    const i = Math.floor((x + nx * 0.5) / CELL)
    const j = Math.floor((z + nz * 0.5) / CELL)
    face(i, j, -Math.sign(nx), -Math.sign(nz))
  }
  for (const s of t.secrets ?? []) {
    for (const b of s.buttons) near(b.x, b.z, b.nx, b.nz)
    near(s.panel.x, s.panel.z, s.panel.nx, s.panel.nz)
  }
  for (const s of t.neonSwitches ?? []) side(s.i, s.j, s.side)
  for (const w of t.water ?? []) if (w.valve) side(w.valve.i, w.valve.j, w.valve.side)
  for (const m of t.magnets ?? []) if (m.panel) side(m.panel.i, m.panel.j, m.panel.side)
  for (const l of t.ladders) face(l.i, l.j, l.di, l.dj)
  return out
}

/** A level's set dressing plan (deterministic for its map and level). */
export const planDecor = (map: MapData, sector: SectorId): DecorPlan => {
  const t: Terrain | undefined = map.terrain
  if (!t) return { props: [], cranes: [] }
  // The Scrapyard's only terrain map is the tutorial (its jobs are the
  // labyrinth, which has none): the level and the mission plan alike.
  const tutorial = sector === 'scrapyard'
  const set = SECTOR_DECOR[sector]
  const rng = mulberry32((map.seed ^ 0xdec0) >>> 0)
  const W = map.w
  const K = (i: number, j: number) => j * W + i
  const inMap = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < map.h
  const walk = (i: number, j: number) => inMap(i, j) && map.cell[K(i, j)] !== Cell.Void
  const reserved = reservedCells(map, tutorial ? TUTORIAL_FREE_ROOMS : [])
  const faces = reservedFaces(map)
  // A secret's alcove: nothing of the dressing in it, on its walls either.
  const hidden = new Set((t.secrets ?? []).flatMap(s => s.cells))
  const props: DecorSpot[] = []
  const cranes: CraneSpot[] = []
  const used = new Set<number>()
  const padRooms = new Set<number>([map.beam?.room ?? -1, map.exit?.room ?? -1])
  const stageRooms = new Set<number>(t.bossStages ?? [])
  /** A plain floor cell of room `r`: flat, no pit, nothing on it. */
  const plain = (i: number, j: number, r: number): boolean => {
    if (!inMap(i, j)) return false
    const k = K(i, j)
    return map.cell[k] === Cell.Room && map.room[k] === r && !t.pit[k] && !t.ramp[k] && !reserved.has(k) && !used.has(k)
  }
  const level = (k: number, nk: number) => !t.pit[nk] && !t.ramp[nk] && Math.abs(t.floor[nk]! - t.floor[k]!) < 0.3

  const cornerProp = (r: number, kind: DecorKind, far?: { x: number; z: number }): boolean => {
    const room = map.rooms[r]!
    const def = DECOR[kind]
    let best: DecorSpot | null = null
    let bestD = -1
    for (let j = room.z0; j < room.z0 + room.h; j++) {
      for (let i = room.x0; i < room.x0 + room.w; i++) {
        if (!plain(i, j, r)) continue
        const k = K(i, j)
        // Two walls at right angles: one along x, one along z.
        const wx = [1, -1].filter(d => !walk(i + d, j))
        const wz = [1, -1].filter(d => !walk(i, j + d))
        if (wx.length !== 1 || wz.length !== 1) continue
        const di = wx[0]!
        const dj = wz[0]!
        // Open beside it, across from it and on the diagonal: a room's corner,
        // not a walkway's turn.
        const a = K(i - di, j)
        const b = K(i, j - dj)
        const c = K(i - di, j - dj)
        if (!walk(i - di, j) || !walk(i, j - dj) || !walk(i - di, j - dj)) continue
        if (!level(k, a) || !level(k, b) || !level(k, c)) continue
        if (reserved.has(a) && reserved.has(b)) continue
        const off = Math.max(0, CELL / 2 - def.r - CORNER_GAP)
        const x = cellCenter(i) + di * off
        const z = cellCenter(j) + dj * off
        const d = far ? Math.hypot(x - far.x, z - far.z) : rng()
        if (d > bestD) {
          bestD = d
          best = { kind, room: r, x, y: t.floor[k]!, z, yaw: Math.atan2(-di, -dj), r: def.r, backs: [`${k}:${di},0`, `${k}:0,${dj}`] }
        }
      }
    }
    // No corner free: against a straight wall of a wide stretch (open both
    // ways along it and in front of it, two cells deep: never a walkway).
    if (!best && !far) {
      for (let j = room.z0; j < room.z0 + room.h; j++) {
        for (let i = room.x0; i < room.x0 + room.w; i++) {
          if (!plain(i, j, r)) continue
          const k = K(i, j)
          const walls = DIRS.filter(([di, dj]) => !walk(i + di, j + dj))
          if (walls.length !== 1) continue
          const [di, dj] = walls[0]!
          const ai = dj
          const aj = di
          const open = [[ai, aj], [-ai, -aj], [-di, -dj], [-2 * di, -2 * dj], [ai - di, aj - dj], [-ai - di, -aj - dj]]
          if (!open.every(([oi, oj]) => walk(i + oi!, j + oj!) && level(k, K(i + oi!, j + oj!)))) continue
          const off = Math.max(0, CELL / 2 - def.r - CORNER_GAP)
          const d = rng()
          if (d > bestD) {
            bestD = d
            best = { kind, room: r, x: cellCenter(i) + di * off, y: t.floor[k]!, z: cellCenter(j) + dj * off, yaw: Math.atan2(-di, -dj), r: def.r, backs: [`${k}:${di},${dj}`] }
          }
        }
      }
    }
    if (!best) return false
    used.add(K(Math.floor(best.x / CELL), Math.floor(best.z / CELL)))
    for (const f of best.backs ?? []) faces.add(f)
    props.push(best)
    return true
  }

  const wallProp = (r: number, kind: DecorKind): boolean => {
    const room = map.rooms[r]!
    const options: DecorSpot[] = []
    for (let j = room.z0; j < room.z0 + room.h; j++) {
      for (let i = room.x0; i < room.x0 + room.w; i++) {
        // Hung on the wall, over head height or flat to it: it needs a flat
        // floor under its wall (its height), not a free one.
        if (!inMap(i, j)) continue
        const k = K(i, j)
        if (map.cell[k] !== Cell.Room || map.room[k] !== r || t.pit[k] || t.ramp[k] || hidden.has(k)) continue
        if ((t.wallTop[r] ?? 0) - t.floor[k]! < WALL_NEED) continue
        for (const [di, dj] of DIRS) {
          if (walk(i + di, j + dj)) continue
          const face = `${k}:${di},${dj}`
          if (faces.has(face)) continue
          // Not beside another wall prop of the room.
          if (props.some(p => p.face && p.room === r && Math.hypot(p.x - (cellCenter(i) + di * CELL / 2), p.z - (cellCenter(j) + dj * CELL / 2)) < CELL * 1.5)) continue
          options.push({
            kind, room: r, x: cellCenter(i) + di * CELL / 2, y: t.floor[k]!, z: cellCenter(j) + dj * CELL / 2,
            yaw: Math.atan2(-di, -dj), r: 0, face
          })
        }
      }
    }
    if (!options.length) return false
    const pick = options[Math.floor(rng() * options.length)]!
    faces.add(pick.face!)
    props.push(pick)
    return true
  }

  // A crane over a near-rectangular open room.
  const craneFor = (r: number): CraneSpot | null => {
    const room = map.rooms[r]!
    if (room.w < 3 || room.h < 3) return null
    let open = 0
    let floor = -Infinity
    for (let j = room.z0; j < room.z0 + room.h; j++) {
      for (let i = room.x0; i < room.x0 + room.w; i++) {
        const k = K(i, j)
        if (map.cell[k] === Cell.Room && map.room[k] === r) { open++; if (!t.pit[k]) floor = Math.max(floor, t.floor[k]!) }
      }
    }
    if (open < room.w * room.h * 0.85 || !Number.isFinite(floor)) return null
    const alongX = room.w >= room.h
    return {
      room: r, alongX, x0: room.x0 * CELL, z0: room.z0 * CELL, x1: (room.x0 + room.w) * CELL, z1: (room.z0 + room.h) * CELL,
      y: (t.wallTop[r] ?? floor + 5) + 0.35, floor, carry: sector === 'magnet' ? 'claw' : 'crate'
    }
  }

  // The tutorial's two drop rooms first (always), then the levels' cranes.
  if (tutorial) {
    for (const r of TUTORIAL_CRANE_ROOMS) {
      const c = r < map.rooms.length ? craneFor(r) : null
      if (c) cranes.push({ ...c, carry: 'none' })
    }
  }

  map.rooms.forEach((room, r) => {
    const kind = t.sections[r]
    if (padRooms.has(r) || stageRooms.has(r) && kind !== 'arena') return
    if (kind === 'arena') {
      // The Blaze Master's forge, in the arena's corner farthest from its door.
      if (sector === 'blaze') {
        const d = map.doors.find(x => x.to === r)
        cornerProp(r, 'forge', d ? { x: cellCenter(d.i), z: cellCenter(d.j) } : undefined)
      }
      return
    }
    if (rng() >= ROOM_CHANCE) return
    const big = room.w * room.h >= 20
    // A crane first where the level has them (the rest of the room stays
    // simpler under it).
    if (cranes.some(c => c.room === r)) { wallProp(r, set.wall[0]!); return }
    if ((sector === 'scrapyard' || sector === 'magnet') && cranes.length < (tutorial ? TUTORIAL_CRANE_ROOMS.length + 1 : MAX_CRANES) && big && rng() < 0.5) {
      const c = craneFor(r)
      if (c) { cranes.push(c); wallProp(r, set.wall[0]!); return }
    }
    const nFloor = big ? 1 + (rng() < 0.5 ? 1 : 0) : rng() < 0.6 ? 1 : 0
    for (let n = 0; n < nFloor; n++) cornerProp(r, set.floor[Math.floor(rng() * set.floor.length)]!)
    const nWall = 1 + (big && rng() < 0.5 ? 1 : 0)
    for (let n = 0; n < nWall; n++) wallProp(r, set.wall[Math.floor(rng() * set.wall.length)]!)
  })
  // A room's own wall prop, twice, on bare walls (#118): the landmark a lost
  // player knows it again by. Every room with a style, whatever the dice said.
  map.roomStyle?.forEach((st, r) => {
    if (!st || r >= map.rooms.length || !(st.prop in DECOR) || DECOR[st.prop as DecorKind].mount !== 'wall') return
    for (let n = 0; n < LANDMARKS_PER_ROOM; n++) wallProp(r, st.prop as DecorKind)
  })
  return { props, cranes }
}
