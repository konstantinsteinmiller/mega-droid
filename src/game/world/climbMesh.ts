import { BufferGeometry, Group, Mesh, Color, type Object3D } from 'three'
import { CELL, WALL_H, Cell, Ramp, pitKindOf, type MapData, type Door, type Terrain } from './levelGen'
import type { Theme } from './themes'
import { levelAtlas } from './textures'
import { toonVCMap, toonVC, glowVC, outlineMat } from '../models/toon'
import { rcyl, rcone, cap, rbox, xform, paint, paintBy, merge, sph, torus } from '../models/kit'
import { mulberry32 } from './rng'
import { noSlice, type Slice } from '../engine/slicer'
import {
  QuadBatch, cellOwners, doorFramePos, buildSky, outerWall, outerEnd, FLOOR_UV, WALL_UV, PLAIN_UV, type LevelMeshes, type UV8
} from './levelMesh'
import { BALL_R } from './climbGen'
import { lavaCell, lavaMaterial } from '../models/lava'
import { secretDoorFace } from './stages/builder'
import { planDecor, wallThingFaces } from './decor'
import { decorParts } from '../models/decorProps'

/**
 * ─── The climb's static geometry ─────────────────────────────────────────────
 *
 * `buildLevel` for a terrain map, returning the same `LevelMeshes` — one group
 * per room, its corridors with it, at most four draw calls each — so portal
 * culling, the precompile and the warm-up treat the tower like any sector.
 *
 * Readability first, because every hazard here is a height:
 *  - a ledge wears a hazard-striped lip and a rounded trim cap, so an edge
 *    reads as an edge from above and from below;
 *  - stairs are drawn as steps (walked as a slope: `nav.groundAt`), their
 *    risers in the trim colour so each step is its own line;
 *  - a pit shows its depth: its walls darken all the way down to a black
 *    floor with dim red warning lights at the bottom;
 *  - ladders glow along their rails and stand a hand-hold above the ledge
 *    they reach, so one is seen from the top as well as from the foot;
 *  - a stage's pits may hold spikes (rows of cones) or lava (a glowing
 *    plane) instead of the dark drop, or open onto a sea of clouds (the Sky
 *    Docks, `Terrain.clouds`), and its ice cells are glassy blue with a
 *    glint; a frozen sector's wall tops and ledges carry snow;
 *  - a secret alcove is walled off from its room, its false wall a
 *    striped slab of its own (`LevelMeshes.secretWalls`) the run time hides.
 * The moving parts (lifts, crushers' pistons, scrap balls, lamps) are built
 * and driven by `sim/climb.ts`.
 */

/** Steps drawn per ramp cell (a 1.5 m rise: 0.3 m risers). */
const STEPS = 5
/** Over open sky (`Terrain.clouds`) an island is a slab this thick (m). */
const ISLAND_SLAB = 1.6
/** Tall walls are built in bands of about a labyrinth wall, so the wall
 *  texture repeats instead of stretching (and each band reads as a storey). */
const BAND = WALL_H

type V3 = [number, number, number]

// The faces kept clear of the dressing live with the dressing plan; the
// puzzle audit reads them from here.
export { secretWallFaces } from './decor'

export const buildClimbLevel = async (
  map: MapData, theme: Theme, slice: Slice = noSlice, onProgress: (f01: number) => void = () => {}
): Promise<LevelMeshes> => {
  const t = map.terrain!
  const rng = mulberry32(map.seed ^ 0x5eed)
  const W = map.w
  const templates = new Map<string, BufferGeometry>()
  const piece = (key: string, make: () => BufferGeometry): BufferGeometry => {
    let g = templates.get(key)
    if (!g) {
      g = make()
      templates.set(key, g)
    }
    return g.clone()
  }
  const owner = cellOwners(map)
  const nRooms = map.rooms.length
  const batches = Array.from({ length: nRooms }, () => new QuadBatch())
  const decor: BufferGeometry[][] = Array.from({ length: nRooms }, () => [])
  const glows: BufferGeometry[][] = Array.from({ length: nRooms }, () => [])
  const lava: BufferGeometry[][] = Array.from({ length: nRooms }, () => [])

  const cFloor = new Color(theme.floor)
  const cFloorAlt = new Color(theme.floorAlt)
  const cCorr = new Color(theme.corridor)
  const cWall = new Color(theme.wall)
  const cWallLow = new Color(theme.wallLow)
  // A room's own wall colours and accent (`MapData.roomStyle`, the tutorial's
  // #118 landmarks); a room without one keeps the theme's.
  const roomLook = (map.roomStyle ?? []).map(st => st && { high: new Color(st.wall), low: new Color(st.wallLow), accent: st.accent })
  const lookOf = (k: number) => (map.cell[k] === Cell.Room ? roomLook[map.room[k]!] : undefined)
  const cHaz = new Color(theme.hazard)
  const cHazDark = new Color(theme.crateTrim)
  const cRiser = new Color(theme.trim).lerp(cFloor, 0.35)
  // Open sky (`Terrain.clouds`): the depths fade into the fog's colour, a
  // sea of cloud, instead of into the dark.
  const cVoid = t.clouds ? new Color(theme.fog).lerp(new Color('#ffffff'), 0.35) : new Color(theme.wallLow).multiplyScalar(0.12)

  const walkable = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < map.h && map.cell[j * W + i] !== Cell.Void
  const K = (i: number, j: number) => j * W + i
  // Wall faces a thing to see or shoot hangs on (a secret's button or hint
  // panel, a switch, a valve, a polarity panel): no pipe or light strip is
  // drawn over them (a Sky Docks pipe hid a blue button, a Polarity Works
  // pipe ran across a polarity panel).
  const busy = wallThingFaces(t, W)
  // The level's set dressing (#114): its wall props' faces get no pipe or
  // light strip of their own; the props join each room's decor below.
  const dressing = planDecor(map, theme.id)
  const propFaces = new Set(dressing.props.flatMap(p => [...(p.face ? [p.face] : []), ...(p.backs ?? [])]))
  /** The room a cell's walls take their height from (a corridor: its own). */
  const roomOf = (k: number) => map.room[k]!
  const corridorTop = (k: number) => t.floor[k]! + WALL_H + 0.8
  const wallTopOf = (k: number) => (roomOf(k) >= 0 ? t.wallTop[roomOf(k)]! : corridorTop(k))
  const pitBottomOf = (k: number) => (roomOf(k) >= 0 ? t.pitBottom[roomOf(k)]! : t.floor[k]! - 12)
  /** The lowest standing floor of the room: pit walls darken below it. */
  const roomLow = new Array<number>(nRooms).fill(Infinity)
  for (let k = 0; k < map.cell.length; k++) {
    const r = map.room[k]!
    if (r >= 0 && !t.pit[k]) roomLow[r] = Math.min(roomLow[r]!, t.floor[k]!)
  }
  const lowOf = (k: number) => (roomOf(k) >= 0 ? roomLow[roomOf(k)]! : t.floor[k]!)
  // A wall's outside (`outerWall`) stands down to the lowest floor of the
  // map, a building's face, not a panel hung in the air; over open sky to
  // the island's slab under its foot.
  let ground = Infinity
  for (let k = 0; k < map.cell.length; k++) if (map.cell[k] !== Cell.Void && !t.pit[k]) ground = Math.min(ground, t.floor[k]!)
  /** A cell whose edges toward the void are walls (over open sky a gap's are not). */
  const walled = (i: number, j: number) => walkable(i, j) && !(t.clouds && t.pit[K(i, j)])

  /** Drawn floor height of cell k at local (u, v) ∈ [0,1]² — the ramp as a
   *  line (the stepped look is drawn separately); a pit at its bottom. */
  const heightAt = (k: number, u: number, v: number): number => {
    if (t.pit[k]) return pitBottomOf(k)
    const r = t.ramp[k]
    if (!r) return t.floor[k]!
    const s = r === Ramp.PX ? u : r === Ramp.NX ? 1 - u : r === Ramp.PZ ? v : 1 - v
    return t.floor[k]! + t.rise[k]! * s
  }
  /** A ramp's tread height for step n (0..STEPS-1): the line at the step's middle. */
  const tread = (k: number, n: number) => t.floor[k]! + t.rise[k]! * (n + 0.5) / STEPS

  /** Depth shading: full colour down to the room's lowest floor, then
   *  darkening to near black at the pit bottom. */
  const _c = new Color()
  const shade = (base: Color, y: number, k: number): Color => {
    const low = lowOf(k)
    if (y >= low - 0.01) return _c.copy(base)
    const bot = pitBottomOf(k)
    const f = Math.max(0, Math.min(1, (y - bot) / Math.max(0.1, low - bot)))
    return _c.copy(cVoid).lerp(base, f * f)
  }

  /**
   * A vertical face along the edge (x0, z0)–(x1, z1), facing `n`, from the
   * bottom height `y0` to the top profile `top(s)` (s = 0..1 along the edge,
   * sampled at `seg` equal pieces), built in bands of at most BAND.
   */
  const face = (
    b: QuadBatch, k: number, x0: number, z0: number, x1: number, z1: number, n: V3, y0: number, top: (s: number) => number,
    seg = 1, lowC: Color = cWallLow, highC: Color = cWall
  ) => {
    // Order the ends so the quad winds toward n: up × (P1 − P0) ∥ n.
    if ((z1 - z0) * n[0] - (x1 - x0) * n[2] < 0) {
      ;[x0, x1] = [x1, x0]
      ;[z0, z1] = [z1, z0]
      const f = top
      top = (s: number) => f(1 - s)
    }
    for (let q = 0; q < seg; q++) {
      const s0 = q / seg
      const s1 = (q + 1) / seg
      const ax = x0 + (x1 - x0) * s0
      const az = z0 + (z1 - z0) * s0
      const bx = x0 + (x1 - x0) * s1
      const bz = z0 + (z1 - z0) * s1
      const ta = top(s0 + 1e-6)
      const tb = top(s1 - 1e-6)
      const hi = Math.max(ta, tb)
      if (hi - y0 < 0.02) continue
      const bands = Math.max(1, Math.ceil((hi - y0) / BAND - 0.05))
      for (let m = 0; m < bands; m++) {
        const ya = y0 + (hi - y0) * m / bands
        const yb = m === bands - 1 ? -1 : y0 + (hi - y0) * (m + 1) / bands
        const topA = yb < 0 ? ta : Math.min(ta, yb)
        const topB = yb < 0 ? tb : Math.min(tb, yb)
        if (topA <= ya + 0.01 && topB <= ya + 0.01) continue
        const cl0 = shade(lowC, ya, k).clone()
        const clA = shade(highC, topA, k).clone()
        const clB = shade(highC, topB, k).clone()
        b.quad([ax, ya, az], [ax, Math.max(ya, topA), az], [bx, Math.max(ya, topB), bz], [bx, ya, bz], n, WALL_UV, cl0, clA, clB, cl0)
      }
    }
  }

  // Corner pilasters, deduplicated: the lowest foot and highest top seen.
  // Each corner also counts the wall runs meeting at it (`axes`: 1 along x,
  // 2 along z) and whether any of them is a room's: a straight joint inside a
  // corridor gets no pilaster (playtest 2026-10-06: one every 3 m on both
  // sides read as pillars blocking the way).
  const corners = new Map<string, { x: number; z: number; owner: number; lo: number; hi: number; axes: number; runs: number; room: boolean }>()
  const addCorner = (x: number, z: number, o: number, lo: number, hi: number, alongX: boolean, room: boolean) => {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`
    const c = corners.get(key)
    const axis = alongX ? 1 : 2
    if (!c) corners.set(key, { x, z, owner: o, lo, hi, axes: axis, runs: 1, room })
    else {
      c.lo = Math.min(c.lo, lo)
      c.hi = Math.max(c.hi, hi)
      c.axes |= axis
      c.runs++
      c.room ||= room
    }
  }

  const doorCells = new Set<number>()
  for (const d of map.doors) doorCells.add(K(d.i, d.j))

  // Secret alcoves: which secret each hidden cell is (−1: none), and each
  // false wall's face. A face between two cells of different secrets (or
  // a secret and the open room) is a wall, but for the false wall itself.
  const secrets = t.secrets ?? []
  const hidden = new Int16Array(map.cell.length).fill(-1)
  secrets.forEach((sp, n) => { for (const k of sp.cells) hidden[k] = n })
  const falseWalls = secrets.map(sp => secretDoorFace(map, sp))
  const isFalseWall = (i: number, j: number, di: number, dj: number): boolean => {
    for (const f of falseWalls) {
      if ((f.i === i && f.j === j && f.di === di && f.dj === dj) || (f.i === i + di && f.j === j + dj && f.di === -di && f.dj === -dj)) return true
    }
    return false
  }
  // Ice: a clear blue over the floor tone (the cryo floors are near white
  // already), with a glint streak on each cell so it reads as polished.
  const cIce = new Color('#7fcfff')
  // Snow on the wall tops and the ledge lips of a frozen sector.
  const snowy = theme.id === 'cryo'
  const pitKindAt = (k: number) => pitKindOf(t, roomOf(k))

  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < W; i++) {
      const k = K(i, j)
      const c = map.cell[k]
      if (c === Cell.Void) continue
      const o = owner[k]!
      if (o < 0) continue
      const b = batches[o]!
      const x0 = i * CELL
      const z0 = j * CELL
      const x1 = x0 + CELL
      const z1 = z0 + CELL
      const ramp = t.ramp[k]!

      // ── Floor ──
      if (t.pit[k]) {
        const y = pitBottomOf(k)
        b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], PLAIN_UV, cVoid, cVoid, cVoid, cVoid)
        const pk = pitKindAt(k)
        if (pk === 'lava') {
          // A moving surface a hand over the bottom: lava, not a drop.
          lava[o]!.push(lavaCell(x0, z0, CELL, y + 0.36))
        } else if (pk === 'spikes') {
          // A bed of spikes: three rows of three cones, tall, their tips
          // lit — from the edge, far above, the pit has to read as spikes
          // (a plain dark floor read as "a floor to drop onto").
          for (let a = 0; a < 3; a++) {
            for (let c2 = 0; c2 < 3; c2++) {
              decor[o]!.push(xform(piece('spike', () => paint(rcone(0.44, 0.05, 1.8, 0.01, 8), theme.pilaster)), [x0 + 0.5 + a, y + 0.9, z0 + 0.5 + c2]))
              glows[o]!.push(xform(piece('spikeTip', () => paint(rcone(0.17, 0.02, 0.6, 0.01, 8), theme.accent)), [x0 + 0.5 + a, y + 1.56, z0 + 0.5 + c2]))
            }
          }
        } else if (t.clouds) {
          // Cloud puffs over the misty bottom: soft, lumpy, bright.
          for (let n = 0; n < 2; n++) {
            const r = 1.1 + rng() * 0.8
            glows[o]!.push(xform(piece('puff', () => paint(sph(1, 9, 6), '#f4f9ff')),
              [x0 + 0.6 + rng() * 1.8, y + 0.2 + rng() * 0.5, z0 + 0.6 + rng() * 1.8], [0, 0, 0], [r, r * 0.45, r]))
          }
        } else if (((i * 7 + j * 3) & 1) === 0) {
          // Dim warning lights far down: the pit is a drop, not a floor.
          glows[o]!.push(xform(piece('pitLight', () => paint(sph(0.22, 8, 6), '#ff3a2a')), [x0 + 0.8 + rng() * 1.4, y + 0.25, z0 + 0.8 + rng() * 1.4]))
        }
      } else if (!ramp) {
        const y = t.floor[k]!
        const fc0 = c === Cell.Corridor ? cCorr : ((i + j) & 1 ? cFloor : cFloorAlt)
        const fc = t.ice?.[k] ? fc0.clone().lerp(cIce, 0.7) : fc0
        b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], FLOOR_UV, fc, fc, fc, fc)
        if (t.ice?.[k]) {
          const off = ((i + j) % 3 - 1) * 0.6
          glows[o]!.push(xform(piece('iceGlint', () => paint(rbox(0.12, 0.02, 1.7, 0.5, 4, 2), '#e9f9ff')), [x0 + CELL / 2 + off, y + 0.015, z0 + CELL / 2 - off * 0.5], [0, Math.PI / 4, 0]))
        }
      } else {
        // Steps: treads in the floor tones, risers in the trim colour.
        const alongX = ramp === Ramp.PX || ramp === Ramp.NX
        const up = ramp === Ramp.PX || ramp === Ramp.PZ ? 1 : -1
        for (let n = 0; n < STEPS; n++) {
          const y = tread(k, n)
          // Tread n spans s ∈ [n, n+1] / STEPS measured uphill.
          const sa = n / STEPS
          const sb = (n + 1) / STEPS
          const fc = t.ice?.[k] ? (n & 1 ? cFloor : cFloorAlt).clone().lerp(cIce, 0.7) : n & 1 ? cFloor : cFloorAlt
          const uv: UV8 = FLOOR_UV
          if (alongX) {
            const xa = up > 0 ? x0 + CELL * sa : x1 - CELL * sa
            const xb = up > 0 ? x0 + CELL * sb : x1 - CELL * sb
            const lx = Math.min(xa, xb)
            const hx = Math.max(xa, xb)
            b.quad([lx, y, z0], [lx, y, z1], [hx, y, z1], [hx, y, z0], [0, 1, 0], uv, fc, fc, fc, fc)
            const below = n === 0 ? t.floor[k]! : tread(k, n - 1)
            face(b, k, xa, z0, xa, z1, [-up, 0, 0], below, () => y, 1, cRiser, cRiser)
          } else {
            const za = up > 0 ? z0 + CELL * sa : z1 - CELL * sa
            const zb = up > 0 ? z0 + CELL * sb : z1 - CELL * sb
            const lz = Math.min(za, zb)
            const hz = Math.max(za, zb)
            b.quad([x0, y, lz], [x0, y, hz], [x1, y, hz], [x1, y, lz], [0, 1, 0], uv, fc, fc, fc, fc)
            const below = n === 0 ? t.floor[k]! : tread(k, n - 1)
            face(b, k, x0, za, x1, za, [0, 0, -up], below, () => y, 1, cRiser, cRiser)
          }
        }
        // The last half-riser up to the landing.
        const top = t.floor[k]! + t.rise[k]!
        const last = tread(k, STEPS - 1)
        if (alongX) {
          const xe = up > 0 ? x1 : x0
          face(b, k, xe, z0, xe, z1, [-up, 0, 0], last, () => top, 1, cRiser, cRiser)
        } else {
          const ze = up > 0 ? z1 : z0
          face(b, k, x0, ze, x1, ze, [0, 0, -up], last, () => top, 1, cRiser, cRiser)
        }
      }

      // An island's underside over open sky, seen from across a gap or from
      // a roof below (under every standing cell: a sight line that passes
      // under a wall's outer face goes on under the floor).
      if (t.clouds && !t.pit[k]) {
        const y = t.floor[k]! - ISLAND_SLAB
        const cu = shade(cWallLow, y, k).clone()
        b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], PLAIN_UV, cu, cu, cu, cu)
      }

      // ── Edges ──
      const edges: Array<{ di: number; dj: number; a: [number, number]; bb: [number, number]; n: V3 }> = [
        { di: -1, dj: 0, a: [x0, z1], bb: [x0, z0], n: [1, 0, 0] },
        { di: 1, dj: 0, a: [x1, z0], bb: [x1, z1], n: [-1, 0, 0] },
        { di: 0, dj: -1, a: [x0, z0], bb: [x1, z0], n: [0, 0, 1] },
        { di: 0, dj: 1, a: [x1, z1], bb: [x0, z1], n: [0, 0, -1] }
      ]
      // Where my faces start along an edge: my floor there — a ramp's top at
      // its uphill edge, its foot at the downhill edge and along its sides.
      const upI = ramp === Ramp.PX ? 1 : ramp === Ramp.NX ? -1 : 0
      const upJ = ramp === Ramp.PZ ? 1 : ramp === Ramp.NZ ? -1 : 0
      const edgeLow = (di: number, dj: number): number => {
        if (t.pit[k]) return pitBottomOf(k)
        if (!ramp) return t.floor[k]!
        return di === upI && dj === upJ ? t.floor[k]! + t.rise[k]! : t.floor[k]!
      }
      for (const e of edges) {
        const ni = i + e.di
        const nj = j + e.dj
        const [ax, az] = e.a
        const [bx, bz] = e.bb
        const mx = (ax + bx) / 2
        const mz = (az + bz) / 2
        const alongX = Math.abs(bx - ax) > 0.1
        const rotAlong: V3 = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
        const low = edgeLow(e.di, e.dj)
        // A secret's false wall is drawn on its own (below); the rest of
        // an alcove's rim is wall like the void.
        const rim = walkable(ni, nj) && hidden[K(ni, nj)] !== hidden[k]
        if (rim && isFalseWall(i, j, e.di, e.dj)) continue
        if (!walkable(ni, nj) || rim) {
          // Over open sky a gap runs out into the world: no wall on its outer
          // edge, so the islands' walls stand as panels with sky between.
          // (Nothing walks there: the void beyond is solid to bodies.)
          if (t.clouds && t.pit[k] && !rim) continue
          // A wall to the room's top, from the lowest floor at its foot.
          const topY = wallTopOf(k)
          const look = lookOf(k)
          face(b, k, ax, az, bx, bz, e.n, low, () => topY, 1, look?.low ?? cWallLow, look?.high ?? cWall)
          // Its outside: seen from a lower room over its own walls, from
          // across a gap, from a lift (playtest 2026-10-12).
          if (!rim) {
            outerWall(b, ax, az, bx, bz, [-e.n[0], 0, -e.n[2]], t.clouds ? low - ISLAND_SLAB : Math.min(low, ground), topY,
              outerEnd(walled, walkable, i, j, e.di, e.dj, ax, az), outerEnd(walled, walkable, i, j, e.di, e.dj, bx, bz),
              look?.low ?? cWallLow, look?.high ?? cWall, !!t.clouds)
          }
          addCorner(ax, az, o, low, topY, alongX, c !== Cell.Corridor)
          addCorner(bx, bz, o, low, topY, alongX, c !== Cell.Corridor)
          decor[o]!.push(xform(piece('capTop', () => paint(cap(0.2, CELL - 0.4, 10, 3), theme.trim)), [mx, topY, mz], rotAlong))
          if (snowy) decor[o]!.push(xform(piece('snowTop', () => paint(rbox(0.62, 0.26, CELL + 0.1, 0.45, 8, 4), '#f7fcff')), [mx, topY + 0.2, mz], alongX ? [0, Math.PI / 2, 0] : [0, 0, 0]))
          // A trim line at every band joint: storeys you can count.
          const bands = Math.max(1, Math.ceil((topY - low) / BAND - 0.05))
          for (let m = 1; m < bands; m++) {
            const yb = low + (topY - low) * m / bands
            decor[o]!.push(xform(piece('band', () => paint(cap(0.1, CELL - 0.3, 8, 2), theme.pilaster)), [mx + e.n[0] * 0.08, yb, mz + e.n[2] * 0.08], rotAlong))
          }
          if (!t.pit[k]) {
            const fy = t.floor[k]!
            if (!ramp) decor[o]!.push(xform(piece('baseboard', () => paint(cap(0.13, CELL - 0.3, 8, 2), theme.wallLow)), [mx + e.n[0] * 0.06, fy + 0.14, mz + e.n[2] * 0.06], rotAlong))
            if (busy.has(`${k}:${e.di},${e.dj}`) || propFaces.has(`${k}:${e.di},${e.dj}`)) {
              // A secret's wall: kept bare for its button / hint (or a prop's).
            } else if (c === Cell.Room && rng() < 0.45) {
              const accent = look?.accent ?? theme.accent
              glows[o]!.push(xform(piece(`strip${accent}`, () => paint(cap(0.07, 1.1, 8, 2), accent)), [mx + e.n[0] * 0.12, fy + (ramp ? 3.6 : 2.95), mz + e.n[2] * 0.12], rotAlong))
            } else if (rng() < 0.25) {
              const py = fy + 1.1 + rng() * 1.4 + (ramp ? 1.2 : 0)
              decor[o]!.push(xform(piece('pipe', () => paint(cap(0.16, CELL, 10, 2), theme.pipe)), [mx + e.n[0] * 0.2, py, mz + e.n[2] * 0.2], rotAlong))
            }
          }
          continue
        }
        // Another walkable cell: a cliff face on the lower side (drawn by
        // the lower cell), a striped lip on the upper side.
        const nk = K(ni, nj)
        const nPit = t.pit[nk]
        const nRamp = t.ramp[nk]!
        // The neighbour's top along the shared edge, as a function of s ∈ [0,1] from a to b.
        const nTop = (s: number): number => {
          if (nPit) return pitBottomOf(nk)
          if (!nRamp) return t.floor[nk]!
          // Point on the shared edge, in the neighbour's local (u, v).
          const px = ax + (bx - ax) * s
          const pz = az + (bz - az) * s
          const u = Math.max(0, Math.min(1, px / CELL - ni))
          const v = Math.max(0, Math.min(1, pz / CELL - nj))
          // A ramp's side follows its steps; its ends are level.
          const r = nRamp
          const across = (r === Ramp.PX || r === Ramp.NX) ? alongX : !alongX
          if (!across) return heightAt(nk, u, v)
          const sUp = r === Ramp.PX ? u : r === Ramp.NX ? 1 - u : r === Ramp.PZ ? v : 1 - v
          return tread(nk, Math.min(STEPS - 1, Math.floor(sUp * STEPS)))
        }
        const nMax = Math.max(nTop(0.001), nTop(0.5), nTop(0.999))
        // Over open sky an island's edge is a slab, not a cliff down to the
        // bottom: under it the gap shows sky (its underside is drawn below).
        const faceLow = t.clouds && t.pit[k] && !nPit ? Math.max(low, Math.min(nTop(0.001), nTop(0.999)) - ISLAND_SLAB) : low
        if (nMax - faceLow > 0.02) {
          // Stepped profile along a ramp's side needs one piece per step.
          const seg = nRamp && ((nRamp === Ramp.PX || nRamp === Ramp.NX) ? alongX : !alongX) ? STEPS : 1
          face(b, k, ax, az, bx, bz, e.n, faceLow, nTop, seg)
        }
        // My lip: I am a real ledge over this neighbour (not a stair riser).
        if (!t.pit[k] && !ramp) {
          const fy = t.floor[k]!
          const nLow = nPit ? -Infinity : Math.min(nTop(0.001), nTop(0.999))
          if (fy - nLow > 0.9 && !doorCells.has(k)) {
            // Hazard stripes on the floor along the edge, then a trim cap.
            const w = 0.3
            const segs = 6
            for (let q = 0; q < segs; q++) {
              const s0 = q / segs
              const s1 = (q + 1) / segs
              const pax = ax + (bx - ax) * s0
              const paz = az + (bz - az) * s0
              const pbx = ax + (bx - ax) * s1
              const pbz = az + (bz - az) * s1
              // Inward = toward my cell = −(di, dj).
              const ix = -e.di * w
              const iz = -e.dj * w
              const cl = q & 1 ? cHazDark : cHaz
              const y = fy + 0.012
              const p0: V3 = [pax, y, paz]
              const p1: V3 = [pbx, y, pbz]
              const p2: V3 = [pbx + ix, y, pbz + iz]
              const p3: V3 = [pax + ix, y, paz + iz]
              // Wind for an up normal: (p1 − p0) × (p3 − p0) must point +Y.
              const cy = (p1[2] - p0[2]) * (p3[0] - p0[0]) - (p1[0] - p0[0]) * (p3[2] - p0[2])
              if (cy > 0) b.quad(p0, p1, p2, p3, [0, 1, 0], PLAIN_UV, cl, cl, cl, cl)
              else b.quad(p0, p3, p2, p1, [0, 1, 0], PLAIN_UV, cl, cl, cl, cl)
            }
            decor[o]!.push(xform(piece('lip', () => paint(cap(0.11, CELL - 0.25, 8, 2), theme.trim)), [mx - e.di * 0.02, fy + 0.02, mz - e.dj * 0.02], rotAlong))
            // A drift of snow along the ledge, just inside the stripes.
            if (snowy && !t.ice?.[k]) decor[o]!.push(xform(piece('snowLip', () => paint(rbox(0.5, 0.16, CELL - 0.5, 0.45, 8, 4), '#f7fcff')), [mx - e.di * 0.55, fy + 0.05, mz - e.dj * 0.55], alongX ? [0, Math.PI / 2, 0] : [0, 0, 0]))
          }
        }
      }
      await slice()
    }
    onProgress((j + 1) / map.h * 0.6)
  }

  // Pilasters on every wall corner, foot to top — not on a corridor's
  // straight joints (two runs, one direction, no room wall among them).
  for (const { x, z, owner: o, lo, hi, axes, runs, room } of corners.values()) {
    if (!room && runs >= 2 && axes !== 3) continue
    const h = hi - lo + 0.25
    decor[o]!.push(xform(piece(`pil${Math.round(h * 4)}`, () => paint(rcyl(0.3, h, 0.12, 14), theme.pilaster)), [x, lo + h / 2, z]))
    decor[o]!.push(xform(piece('pilasterCap', () => paint(sph(0.34, 14, 8), theme.trim)), [x, hi + 0.25, z]))
  }
  await slice()

  // ── Set dressing: each prop into its room's decor and glow (#114) ──
  for (const p of dressing.props) {
    // A wall prop's origin is on the wall's line: its own cell is its face's.
    const o = owner[p.face ? Number(p.face.split(':')[0]) : K(Math.floor(p.x / CELL), Math.floor(p.z / CELL))]!
    if (o < 0) continue
    const parts = decorParts(p.kind)
    for (const g of parts.toon) decor[o]!.push(xform(g, [p.x, p.y, p.z], [0, p.yaw, 0]))
    for (const g of parts.glow) glows[o]!.push(xform(g, [p.x, p.y, p.z], [0, p.yaw, 0]))
  }
  await slice()

  // ── Cover pillars (`Builder.coverPillar`): a post on its cell's floor, a
  // trim band, a footing sunk a hair into the floor (never flush with it) ──
  for (const p of map.pillars) {
    const k = K(Math.floor(p.x / CELL), Math.floor(p.z / CELL))
    const o = owner[k]!
    if (o < 0) continue
    const y = t.floor[k]!
    decor[o]!.push(xform(paint(rcyl(p.r, 3.2, 0.18, 14), theme.pilaster), [p.x, y + 1.6, p.z]))
    decor[o]!.push(xform(paint(torus(p.r * 0.97, 0.1, 6, 14), theme.trim), [p.x, y + 2.7, p.z], [Math.PI / 2, 0, 0]))
    decor[o]!.push(xform(paint(rbox(p.r * 2.3, 0.3, p.r * 2.3, 0.1, 4, 2), theme.trim), [p.x, y + 0.12, p.z]))
    glows[o]!.push(xform(paint(sph(p.r * 0.45, 14, 8), theme.accent), [p.x, y + 3.25, p.z]))
  }

  // ── Ladders: two lit rails and rungs on the cliff face ──
  for (const L of t.ladders) {
    const k = K(L.i, L.j)
    const o = owner[k]!
    if (o < 0) continue
    if (L.kick) {
      // A wall-kick shaft: no rungs, a column of glowing kick pads up the
      // wall, a hand's width apart, and a neon strip either side.
      const kx = L.di ? (L.di > 0 ? (L.i + 1) * CELL : L.i * CELL) : (L.i + 0.5) * CELL
      const kz = L.dj ? (L.dj > 0 ? (L.j + 1) * CELL : L.j * CELL) : (L.j + 0.5) * CELL
      const nx = -L.di
      const nz = -L.dj
      const ax = L.dj ? 1 : 0
      const az = L.di ? 1 : 0
      for (let y = L.y0 + 0.9; y < L.y1; y += 1.6) {
        glows[o]!.push(xform(paint(rbox(ax ? 0.9 : 0.08, 0.14, az ? 0.9 : 0.08, 0.3), theme.accent), [kx + nx * 0.06, y, kz + nz * 0.06]))
      }
      for (const s of [-0.62, 0.62]) {
        glows[o]!.push(xform(paint(cap(0.035, L.y1 - L.y0, 6, 2), theme.hazard), [kx + nx * 0.07 + ax * s, (L.y0 + L.y1) / 2, kz + nz * 0.07 + az * s]))
      }
      continue
    }
    // The face line and the normal toward the foot.
    const ex = L.di ? (L.di > 0 ? (L.i + 1) * CELL : L.i * CELL) : (L.i + 0.5) * CELL
    const ez = L.dj ? (L.dj > 0 ? (L.j + 1) * CELL : L.j * CELL) : (L.j + 0.5) * CELL
    const nx = -L.di
    const nz = -L.dj
    const ax = L.dj ? 1 : 0
    const az = L.di ? 1 : 0
    const off = 0.14
    const h = L.y1 - L.y0 + 0.95
    for (const s of [-0.48, 0.48]) {
      const rx = ex + nx * off + ax * s
      const rz = ez + nz * off + az * s
      decor[o]!.push(xform(paint(rcyl(0.075, h, 0.03, 10), theme.pilaster), [rx, L.y0 + h / 2, rz]))
      decor[o]!.push(xform(piece('railTop', () => paint(sph(0.11, 10, 6), theme.trim)), [rx, L.y0 + h, rz]))
      glows[o]!.push(xform(paint(cap(0.035, h - 0.6, 6, 2), L.side ? '#8dff7a' : theme.accent), [rx + nx * 0.07, L.y0 + h / 2, rz + nz * 0.07]))
    }
    const rungs = Math.floor((L.y1 - L.y0 + 0.6) / 0.36)
    for (let n = 1; n <= rungs; n++) {
      const y = L.y0 + n * 0.36
      decor[o]!.push(xform(piece('rung', () => paint(cap(0.045, 0.86, 8, 2), theme.trim)), [ex + nx * off, y, ez + nz * off], ax ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]))
    }
    await slice()
  }

  // ── Crusher gantries: posts up from the pit, a beam over the walkway ──
  for (const cr of t.crushers) {
    const k = K(cr.i, cr.j)
    const o = owner[k]!
    if (o < 0) continue
    const cx = (cr.i + 0.5) * CELL
    const cz = (cr.j + 0.5) * CELL
    // Posts stand on the pit sides of the walkway: across the walk direction.
    const walkX = walkable(cr.i + 1, cr.j) && !t.pit[K(cr.i + 1, cr.j)]
    const sideX = walkX ? 0 : 1
    const sideZ = walkX ? 1 : 0
    const bot = pitBottomOf(k)
    const top = cr.y + 5.4
    for (const s of [-1, 1]) {
      const px = cx + sideX * s * (CELL / 2 + 0.2)
      const pz = cz + sideZ * s * (CELL / 2 + 0.2)
      decor[o]!.push(xform(paint(rcyl(0.26, top - bot, 0.1, 12), theme.pilaster), [px, (top + bot) / 2, pz]))
    }
    decor[o]!.push(paintBy(
      xform(rbox(sideX ? CELL + 1.1 : 0.7, 0.6, sideZ ? CELL + 1.1 : 0.7, 0.3), [cx, top, cz]),
      (x, y, z) => (Math.floor((sideX ? x : z) * 2.2 + y) & 1 ? theme.hazard : theme.crateTrim)
    ))
    await slice()
  }

  // ── Rolling stairs: the hatch gantry over the top, the gutter at the foot ──
  // One gantry per room and hatch height: the climb's lanes share a top;
  // lanes that start on different steps (the Meltdown's barrels cross a
  // stair run) get a gantry each at their own height.
  const laneRooms = new Map<string, typeof t.lanes>()
  for (const ln of t.lanes) {
    const key = `${ln.room}:${t.floor[K(Math.floor(ln.x / CELL), Math.floor(ln.z / CELL))]}`
    laneRooms.set(key, [...(laneRooms.get(key) ?? []), ln])
  }
  for (const lanes of laneRooms.values()) {
    const first = lanes[0]!
    const k = K(Math.floor(first.x / CELL), Math.floor(first.z / CELL))
    const o = owner[k]!
    if (o < 0) continue
    const topY = t.floor[k]!
    let lo = Infinity
    let hi = -Infinity
    for (const ln of lanes) { lo = Math.min(lo, first.dx ? ln.z : ln.x); hi = Math.max(hi, first.dx ? ln.z : ln.x) }
    lo -= CELL / 2
    hi += CELL / 2
    const gx = first.x + first.dx * 0.2
    const gz = first.z + first.dz * 0.2
    const beamY = topY + 3
    const across = first.dx !== 0
    for (const s of [lo, hi]) {
      const px = across ? gx : s
      const pz = across ? s : gz
      decor[o]!.push(xform(paint(rcyl(0.24, beamY - topY, 0.1, 12), theme.pilaster), [px, topY + (beamY - topY) / 2, pz]))
    }
    decor[o]!.push(paintBy(
      xform(rbox(across ? 0.9 : hi - lo, 0.8, across ? hi - lo : 0.9, 0.3), [across ? gx : (lo + hi) / 2, beamY, across ? (lo + hi) / 2 : gz]),
      (x, y, z) => (Math.floor((across ? z : x) * 2 + y) & 1 ? theme.hazard : theme.crateTrim)
    ))
    for (const ln of lanes) {
      // A hatch ring under the beam over each lane.
      decor[o]!.push(xform(piece('hatch', () => paint(torus(BALL_R + 0.12, 0.08, 6, 16), theme.crateTrim)), [ln.x, beamY - 0.42, ln.z], [Math.PI / 2, 0, 0]))
      // The gutter across the foot: a dark slot with striped lips.
      // Just past the foot of the stairs, on the landing.
      const fx = ln.x + ln.dx * (ln.len + 0.5)
      const fz = ln.z + ln.dz * (ln.len + 0.5)
      const fk = K(Math.floor(fx / CELL), Math.floor(fz / CELL))
      const fy = t.floor[fk]! + 0.013
      const b = batches[o]!
      const hw = CELL / 2
      const gw = 0.45
      const q = (x0: number, z0: number, x1: number, z1: number, cl: Color) =>
        b.quad([x0, fy, z0], [x0, fy, z1], [x1, fy, z1], [x1, fy, z0], [0, 1, 0], PLAIN_UV, cl, cl, cl, cl)
      if (across) {
        q(fx - gw, ln.z - hw, fx + gw, ln.z + hw, cVoid)
        q(fx - gw - 0.14, ln.z - hw, fx - gw, ln.z + hw, cHaz)
        q(fx + gw, ln.z - hw, fx + gw + 0.14, ln.z + hw, cHaz)
      } else {
        q(ln.x - hw, fz - gw, ln.x + hw, fz + gw, cVoid)
        q(ln.x - hw, fz - gw - 0.14, ln.x + hw, fz - gw, cHaz)
        q(ln.x - hw, fz + gw, ln.x + hw, fz + gw + 0.14, cHaz)
      }
    }
    await slice()
  }

  // ── Lift guides: rails up a lift's shaft, rails under a shuttle's run ──
  for (const lf of t.lifts) {
    const k = K(Math.floor(lf.ax / CELL), Math.floor(lf.az / CELL))
    const o = owner[k]!
    if (o < 0) continue
    const bot = pitBottomOf(k)
    if (lf.kind === 'v') {
      const top = Math.max(lf.ay, lf.by) + 1.2
      for (const [sx, sz] of [[-1, -1], [1, 1]] as const) {
        const px = lf.ax + sx * (lf.hw + 0.12)
        const pz = lf.az + sz * (lf.hd + 0.12)
        decor[o]!.push(xform(paint(rcyl(0.14, top - bot, 0.05, 10), theme.pipe), [px, (top + bot) / 2, pz]))
        glows[o]!.push(xform(paint(sph(0.16, 10, 6), theme.accent), [px, top + 0.1, pz]))
      }
    } else {
      const len = Math.hypot(lf.bx - lf.ax, lf.bz - lf.az) + lf.hw * 2
      const alongX = Math.abs(lf.bx - lf.ax) > 0.1
      const mx = (lf.ax + lf.bx) / 2
      const mz = (lf.az + lf.bz) / 2
      for (const s of [-0.8, 0.8]) {
        decor[o]!.push(xform(paint(cap(0.1, len, 8, 2), theme.pipe), [mx + (alongX ? 0 : s), lf.ay - 0.75, mz + (alongX ? s : 0)], alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]))
      }
    }
  }

  // ── Reward ledges: a pad that glows under the prize ──
  // (A borrowed-weapon capsule stands on an emitter plate of its own, in its
  // weapon's colour: `models/weaponCapsule.ts`.)
  for (const r of t.rewards) {
    if (r.kind === 'weapon') continue
    const k = K(Math.floor(r.x / CELL), Math.floor(r.z / CELL))
    const o = owner[k]!
    if (o < 0) continue
    decor[o]!.push(xform(piece('rewardPad', () => paint(rcyl(0.7, 0.14, 0.06, 20), theme.crateTrim)), [r.x, r.y + 0.07, r.z]))
    glows[o]!.push(xform(piece('rewardRing', () => paint(torus(0.62, 0.05, 6, 24), '#8dff7a')), [r.x, r.y + 0.15, r.z], [Math.PI / 2, 0, 0]))
  }
  await slice()

  // ── Secret false walls: a striped slab over the alcove's mouth, each its
  // own mesh so the run time can take it away ──
  const secretWalls: Object3D[] = []
  const secretOwner: number[] = []
  secrets.forEach((sp, n) => {
    const f = falseWalls[n]!
    const k = K(f.i + f.di, f.j + f.dj)
    const fy = t.floor[k]!
    const top = wallTopOf(k)
    const x = f.di ? (f.i + (f.di > 0 ? 1 : 0)) * CELL : (f.i + 0.5) * CELL
    const z = f.dj ? (f.j + (f.dj > 0 ? 1 : 0)) * CELL : (f.j + 0.5) * CELL
    const h = top - fy
    const geo = paintBy(
      xform(rbox(f.di ? 0.3 : CELL, h, f.di ? CELL : 0.3, 0.08, 8, 6), [x, fy + h / 2, z]),
      (px, py, pz) => (Math.floor(((f.di ? pz : px) + py) * 1.4) & 1 ? theme.wall : theme.wallLow)
    )
    const g = new Group()
    g.add(new Mesh(geo, toonVC()))
    const ol = new Mesh(geo, outlineMat(0.035))
    ol.renderOrder = -1
    g.add(ol)
    g.name = `secretWall${n}`
    secretWalls.push(g)
    secretOwner.push(owner[k]!)
  })

  // ── Door frames at their corridor's height ──
  // One group a door, drawn while the door is (`Mission.updateRoomCulling`):
  // over open sky nothing hides a frame, and one shared always-visible group
  // left lone arches standing where both rooms were culled (playtest
  // 2026-10-11).
  const frameParts = map.doors.map(d => {
    const decor: BufferGeometry[] = []
    const batch = new QuadBatch()
    doorFrame(d, t.floor[K(d.i, d.j)]!, theme, decor, batch, cHaz)
    return { decor, batch }
  })

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
    if (glows[r]!.length) g.add(new Mesh(merge(glows[r]!), glowVC()))
    if (lava[r]!.length) g.add(new Mesh(merge(lava[r]!), lavaMaterial()))
    secretWalls.forEach((w, n) => { if (secretOwner[n] === r) g.add(w) })
    rooms.push(g)
    root.add(g)
    onProgress(0.65 + ((r + 1) / nRooms) * 0.35)
    await slice()
  }
  const frameMat = toonVC()
  const frameOutline = outlineMat(0.035)
  const doorFrames = frameParts.map(({ decor: parts, batch }, n) => {
    const g = new Group()
    g.name = `doorFrame${n}`
    const dgeo = batch.build()
    if (dgeo) g.add(new Mesh(dgeo, floorMat))
    const dd = merge(parts)
    g.add(new Mesh(dd, frameMat))
    const dol = new Mesh(dd, frameOutline)
    dol.renderOrder = -1
    g.add(dol)
    root.add(g)
    return g
  })
  const out: LevelMeshes = { root, rooms, sky: buildSky(theme), bounds, owner, doorFrames }
  if (secretWalls.length) out.secretWalls = secretWalls
  return out
}

/** A door frame (rounded striped lintel, two posts, floor stripes) standing
 *  on the corridor floor at `y` — the labyrinth's frame, lifted. */
const doorFrame = (d: Door, y: number, theme: Theme, out: BufferGeometry[], batch: QuadBatch, cHaz: Color): void => {
  const [fx, fz] = doorFramePos(d)
  const along = d.axis === 'x' ? 'z' : 'x'
  out.push(paintBy(
    xform(rbox(along === 'x' ? CELL + 0.4 : 0.8, 0.7, along === 'z' ? CELL + 0.4 : 0.8, 0.3), [fx, y + WALL_H - 0.55, fz]),
    (x, yy, z) => (Math.floor(((along === 'x' ? x : z) + yy) * 2.2) & 1 ? theme.hazard : theme.crateTrim)
  ))
  for (const s of [-1, 1]) {
    const px = along === 'x' ? fx + s * (CELL / 2) : fx
    const pz = along === 'z' ? fz + s * (CELL / 2) : fz
    out.push(xform(paint(rcyl(0.4, WALL_H, 0.15, 16), d.boss ? theme.trim : theme.pilaster), [px, y + WALL_H / 2, pz]))
  }
  const hw = 0.5
  const yy = y + 0.012
  if (d.axis === 'x') {
    batch.quad([fx - hw, yy, fz - CELL / 2], [fx - hw, yy, fz + CELL / 2], [fx + hw, yy, fz + CELL / 2], [fx + hw, yy, fz - CELL / 2], [0, 1, 0], PLAIN_UV, cHaz, cHaz, cHaz, cHaz)
  } else {
    batch.quad([fx - CELL / 2, yy, fz - hw], [fx - CELL / 2, yy, fz + hw], [fx + CELL / 2, yy, fz + hw], [fx + CELL / 2, yy, fz - hw], [0, 1, 0], PLAIN_UV, cHaz, cHaz, cHaz, cHaz)
  }
}
