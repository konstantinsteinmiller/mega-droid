import { CELL, Cell, cellCenter, type ChestLoot, type ClimbSpot, type Door, type MapData, type Room, type Terrain } from './levelGen'
import { mulberry32 } from './rng'
import { walkStep } from './nav'
import type { Builder } from './stages/builder'
import type { StageSector } from './stages/meta'
import type { EnemyKind } from '../models/enemies'

/**
 * ─── Wall climbs: a reusable, seeded climb for every story stage ─────────────
 *
 * The Blackout Boulevard's wall-kick shaft (`Ladder.kick`, `sim/climb.ts`:
 * slide at its foot facing the wall, and again on it, each kick KICK_UP
 * higher, slipping back down between kicks) as a feature any stage
 * generator places with one call, last, just before `finish`:
 *
 *   - A TOWER raised inside a plain room against its wall (no layout moves:
 *     a few of the room's floor cells go up), one to three shafts up its
 *     faces, a prize on its top ledge. The tier rises with the sector:
 *       0  the Blaze practice wall — one kick, 1.5 m, bolts on top
 *       1  one pitch of two kicks (3 m)
 *       2  two pitches, 3 m then 3 m round the corner of a step
 *       3  two pitches, 3 m then 4.5 m — three kicks in rhythm against the slip
 *   - The prizes take turns down the campaign (`CLIMB_PLAN`): a borrowed
 *     weapon's capsule, a Repair Gel, a ledge chest with an authored piece
 *     of gear (once per save, `ChestSpot.loot`; after that a plain chest).
 *   - A SHORTCUT, in a few stages only (authored on the grid, checked cell
 *     by cell): a one-cell tower whose top runs out through the room's wall
 *     into a battle room (`Terrain.guards`: its way out stays shut until
 *     every machine in it is down), dropped into from a balcony (no way
 *     back up), whose far door lets out further down the route — skipping
 *     a fifth to two fifths of the stage's way (`SHORTCUT_SKIP`), never a
 *     guard hall, a boss stage, a ride under fire or the first room of a
 *     mechanic Atlas teaches (`CUED`). The objective trail keeps to the
 *     main route: the shortcut's shaft is no hop for it (`Ladder.branch`).
 *
 * Where: plain floor clear of every mechanic, post, prize, chest, ladder,
 * checkpoint spot and doorway (`busyCells`), never in a room that pushes,
 * floods or carries Flux, the room still walkable door to door around the
 * tower, the shaft's foot open floor. Room picks follow the plan; the seed picks the wall, the spot
 * along it and the hand, on a stream of its own — no other draw of the
 * stage moves. The level mesh draws each shaft's holds (`climbMesh.ts`); the
 * set dressing keeps off the tower and its faces (`decor.ts`).
 */

/** One climb of a stage's plan: its tier, its prize, and where along the
 *  route (0 the pad .. 1 the boss) its room should be. */
export interface ClimbPlanEntry {
  tier: number
  reward: Exclude<ClimbSpot['reward'], 'shortcut'>
  at: number
}

export interface StageClimbPlan {
  climbs: ClimbPlanEntry[]
  /** The Blaze lesson's practice wall, before the first climb. */
  practice?: boolean
  /** The stage's shortcut (`placeShortcut`). */
  shortcut?: ShortcutSpec
  /** A ledge chest's authored prize. */
  chest?: Omit<ChestLoot, 'key'>
}

/**
 * The campaign's climbs, in story order. The prizes go round weapon → gel →
 * chest; the chests rise from tuned to prototype (never legendary: the story
 * chests' rule, #115).
 */
export const CLIMB_PLAN: Readonly<Record<StageSector, StageClimbPlan>> = {
  blaze: { practice: true, climbs: [{ tier: 1, reward: 'weapon', at: 0.35 }] },
  cryo: { climbs: [{ tier: 1, reward: 'tank', at: 0.5 }] },
  volt: { climbs: [{ tier: 1, reward: 'chest', at: 0.3 }], chest: { rarity: 'tuned', slot: 'helmet' } },
  gale: { climbs: [{ tier: 2, reward: 'weapon', at: 0.5 }] },
  magnet: { climbs: [{ tier: 2, reward: 'tank', at: 0.5 }] },
  drill: { climbs: [{ tier: 2, reward: 'chest', at: 0.5 }], chest: { rarity: 'prototype', slot: 'boots' } },
  tide: { climbs: [{ tier: 3, reward: 'weapon', at: 0.5 }] },
  // Off the Neon Gallery's south wall, past the Switch Gauntlet and the Fire
  // Escape, down onto the Gutter Leaps' last roof. After the Billboard Drop
  // (the Searchlight Drone met alone), the Roof Garden (the wall-kick) and
  // the Blink Run (the pulse bridges): never a way round those.
  neon: {
    climbs: [{ tier: 3, reward: 'tank', at: 0.6 }],
    shortcut: { A: 7, B: 10, spot: { side: 's', o: 8, hand: 1 }, c1: 2, sx0: 7, sz0: 32, sw: 17, sh: 4, out: { i: 23, j: 35, di: 0, dj: 1, n: 3 } }
  },
  // Off the north wall of the room after the flight, past two rooms, into
  // the one before the challenge door's.
  rotor: {
    climbs: [{ tier: 3, reward: 'chest', at: 0.5 }], chest: { rarity: 'prototype', slot: 'chest' },
    shortcut: { A: 8, B: 11, spot: { side: 'n', o: 13, hand: 1 }, c1: 2, sx0: 12, sz0: 34, sw: 10, sh: 4, out: { i: 21, j: 35, di: 1, dj: 0, n: 10 } }
  },
  fortress: { climbs: [{ tier: 3, reward: 'weapon', at: 0.5 }] }
}

/** A shortcut skips this share of the route (route-distance metric, `routeField`). */
export const SHORTCUT_SKIP: readonly [number, number] = [0.2, 0.4]
/** A pitch's height per tier (m): two kicks of KICK_UP (1.6) clear 3 m. */
export const PITCH = 1.5
/** The balcony's drop into the battle room (m): over a step, no way back up. */
export const BALCONY_DROP = 1.5
/** A shortcut's signpost stands this far off its landing cell's middle,
 *  toward the wall beside it (m): out of the way in, clear of the wall. */
export const SIGN_OFF = 1.05
/** A shortcut's tower is never taller than this (m). */
const MAX_TOWER = 9

const SALT = 0xc11b5
/** The mechanics Atlas teaches where they first turn up (a `hint.*` cue,
 *  `sim/stages/*.ts`): a shortcut never skips that room. */
export const CUED: Readonly<Record<StageSector, readonly string[]>> = {
  blaze: ['lane', 'crusher', 'vent.', 'link.leap'],
  cryo: ['vent.', 'ice', 'icePillar', 'icicle'],
  volt: ['vent.'],
  gale: ['wind', 'link.leap'],
  magnet: ['magnet'],
  drill: [],
  tide: ['water'],
  neon: ['blink', 'pulse', 'switch', 'kick'],
  rotor: [],
  fortress: []
}
/** The stage's own walkers a battle room may field (never a Master's
 *  echo, a mini-boss or a gatekeeper). */
const WALKERS: readonly EnemyKind[] = ['hardhat', 'trooper', 'hopper', 'roller', 'brute', 'mole', 'stalker', 'polar', 'warden']

/** A tower in its own frame: u along the wall, v into the room (v = 0
 *  touches the wall). Heights over the room floor (m). */
interface Template {
  cells: Array<[number, number, number]>
  /** Each shaft: the foot cell and the step from it onto the face. */
  pitches: Array<{ foot: [number, number]; dir: [number, number] }>
  top: [number, number]
}

const TEMPLATES: Readonly<Record<number, Template>> = {
  0: { cells: [[0, 0, PITCH], [1, 0, PITCH]], pitches: [{ foot: [0, 1], dir: [0, -1] }], top: [1, 0] },
  1: { cells: [[0, 0, 2 * PITCH], [1, 0, 2 * PITCH]], pitches: [{ foot: [0, 1], dir: [0, -1] }], top: [1, 0] },
  2: {
    cells: [[0, 0, 2 * PITCH], [0, 1, 2 * PITCH], [1, 0, 4 * PITCH], [2, 0, 4 * PITCH]],
    pitches: [{ foot: [0, 2], dir: [0, -1] }, { foot: [0, 0], dir: [1, 0] }],
    top: [2, 0]
  },
  3: {
    cells: [[0, 0, 2 * PITCH], [0, 1, 2 * PITCH], [1, 0, 5 * PITCH], [2, 0, 5 * PITCH]],
    pitches: [{ foot: [0, 2], dir: [0, -1] }, { foot: [0, 0], dir: [1, 0] }],
    top: [2, 0]
  }
}

/** The shortcut's tower: one cell against the wall, the shaft up its
 *  front, the way out through the wall behind its top. */
const shortcutTemplate = (h: number): Template => ({
  cells: [[0, 0, h]], pitches: [{ foot: [0, 1], dir: [0, -1] }], top: [0, 0]
})

type Side = 'n' | 's' | 'e' | 'w'
const SIDES: readonly Side[] = ['n', 's', 'e', 'w']

/** A tower's spot: the room, the wall side, the start along it and the hand. */
interface Spot { room: Room; side: Side; o: number; hand: 1 | -1 }

/** Local (u, v) of `s` to a cell. */
const toCell = (s: Spot, u: number, v: number): [number, number] => {
  const r = s.room
  switch (s.side) {
    case 'n': return [s.o + u * s.hand, r.z0 + v]
    case 's': return [s.o + u * s.hand, r.z0 + r.h - 1 - v]
    case 'w': return [r.x0 + v, s.o + u * s.hand]
    default: return [r.x0 + r.w - 1 - v, s.o + u * s.hand]
  }
}
/** A local step (du, dv) of `s` as a grid step. */
const toDir = (s: Spot, du: number, dv: number): [number, number] => {
  switch (s.side) {
    case 'n': return [du * s.hand, dv]
    case 's': return [du * s.hand, -dv]
    case 'w': return [dv, du * s.hand]
    default: return [-dv, du * s.hand]
  }
}

/** The map view `walkStep` reads, over a builder's grid. */
const viewOf = (b: Builder): MapData => ({
  w: b.W, h: b.H, cell: b.cell, room: b.room, terrain: { floor: b.floor, ramp: b.ramp, rise: b.rise, pit: b.pit }
}) as unknown as MapData

/** The rooms each kind of mechanic of the stage is in. */
const mechanicRooms = (b: Builder): Map<string, number[]> => {
  const out = new Map<string, number[]>()
  const add = (kind: string, room: number) => {
    if (room < 0) return
    const l = out.get(kind) ?? []
    if (!l.includes(room)) l.push(room)
    out.set(kind, l)
  }
  const at = (i: number, j: number) => b.room[b.k(i, j)]!
  for (const l of b.lifts) add('lift', l.room)
  for (const c of b.crushers) add('crusher', c.room)
  for (const l of b.lanes) add('lane', l.room)
  for (const w of b.wind) add('wind', w.room)
  for (const m of b.magnets) add('magnet', m.room)
  for (const w of b.water) add('water', w.room)
  for (const n of b.neon) add(n.pulse ? 'pulse' : n.group !== undefined ? 'switch' : 'blink', n.room)
  for (const s of b.neonSwitches) add('switch', s.room)
  for (const r of b.rails) add('rail', r.room)
  for (const w of b.waves) add('wave', w.room)
  for (const v of b.vents) add(`vent.${v.kind}`, v.room)
  for (const p of b.icePillars) add('icePillar', p.room)
  for (const c of b.icicles) add('icicle', c.room)
  for (const c of b.crumbles) add('crumble', at(c.i, c.j))
  for (const l of b.ladders) add(l.kick ? 'kick' : 'ladder', at(l.i, l.j))
  for (const l of b.links) add(`link.${l.kind}`, at(l.from[0], l.from[1]))
  for (const s of b.secrets) add('secret', s.room)
  if (b.iceMask) for (let k = 0; k < b.iceMask.length; k++) if (b.iceMask[k]) add('ice', b.room[k]!)
  return out
}

/** Cells nothing may be raised under: posts, prizes, chests, checkpoints,
 *  cover pillars, ladders, the cells inside each doorway, every mechanic. */
const busyCells = (b: Builder): Set<number> => {
  const out = new Set<number>()
  const ij = (i: number, j: number, ring = 0) => {
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (i + di >= 0 && j + dj >= 0 && i + di < b.W && j + dj < b.H) out.add(b.k(i + di, j + dj))
      }
    }
  }
  const xz = (x: number, z: number, ring = 0) => ij(Math.floor(x / CELL), Math.floor(z / CELL), ring)
  const rect = (i0: number, j0: number, i1: number, j1: number, ring = 1) => {
    for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) ij(i, j, ring)
  }
  // A checkpoint's own spot (its trigger cells may go up: standing on the
  // tower over one still counts as reaching it).
  for (const c of b.checkpoints) xz(c.x, c.z)
  for (const r of b.rewards) xz(r.x, r.z, 1)
  for (const c of b.chests) xz(c.x, c.z, 1)
  for (const f of b.foes) xz(f.x, f.z)
  for (const p of b.pillars) xz(p.x, p.z, 1)
  for (const l of b.ladders) { ij(l.i, l.j, 1); ij(l.i + l.di, l.j + l.dj, 1) }
  for (const d of b.doors) {
    for (const s of [-1, 1]) {
      const i = d.i + (d.axis === 'x' ? s : 0)
      const j = d.j + (d.axis === 'z' ? s : 0)
      if (i >= 0 && j >= 0 && i < b.W && j < b.H) out.add(b.k(i, j))
    }
  }
  if (b.exit) ij(b.exit.pad[0], b.exit.pad[1], 1)
  // The stage's mechanics, a cell of room round each: a lift's run, a
  // crusher, a lane, a rail, a bridge, a switch, a vent's blast, an ice
  // pillar, an icicle, a slab, a leap, a secret's alcove, buttons and panel.
  for (const l of b.lifts) rect(Math.floor((Math.min(l.ax, l.bx) - l.hw) / CELL), Math.floor((Math.min(l.az, l.bz) - l.hd) / CELL), Math.floor((Math.max(l.ax, l.bx) + l.hw) / CELL), Math.floor((Math.max(l.az, l.bz) + l.hd) / CELL))
  for (const c of b.crushers) ij(c.i, c.j, 1)
  for (const l of b.lanes) for (let s = 0; s <= l.len; s += CELL / 2) xz(l.x + l.dx * s, l.z + l.dz * s, 1)
  for (const m of b.magnets) { rect(m.i0, m.j0, m.i1, m.j1); if (m.panel) ij(m.panel.i, m.panel.j, 1) }
  for (const n of b.neon) rect(n.i, n.j, n.i + n.w - 1, n.j + n.d - 1)
  for (const s of b.neonSwitches) ij(s.i, s.j, 1)
  for (const r of b.rails) { for (const p of r.points) xz(p.x, p.z, 1); ij(r.boardAt.i, r.boardAt.j, 1); ij(r.exitAt.i, r.exitAt.j, 1) }
  for (const w of b.waves) if (w.trigger !== 'rail') ij(w.trigger.i, w.trigger.j, 1)
  for (const v of b.vents) for (let s = 0; s <= 3; s++) ij(v.i + Math.round(v.dx) * s, v.j + Math.round(v.dz) * s, 1)
  for (const p of b.icePillars) ij(p.i, p.j, 1)
  for (const c of b.icicles) ij(c.i, c.j, 1)
  for (const c of b.crumbles) rect(c.i, c.j, c.i + (c.w ?? 1) - 1, c.j + (c.d ?? 1) - 1)
  for (const l of b.links) { ij(l.from[0], l.from[1], 1); ij(l.to[0], l.to[1], 1) }
  for (const s of b.secrets) {
    for (const k of s.cells) ij(k % b.W, Math.floor(k / b.W), 1)
    for (const p of [...s.buttons, s.panel, ...(s.emitter ? [s.emitter] : []), ...(s.mirrors ?? []), ...(s.tiles ?? [])]) xz(p.x, p.z, 1)
  }
  if (b.iceMask) for (let k = 0; k < b.iceMask.length; k++) if (b.iceMask[k]) ij(k % b.W, Math.floor(k / b.W), 1)
  return out
}

/** The route rooms, pad to arena (the arena's parents up to the root). */
const chainRooms = (b: Builder): Room[] => {
  const arena = [...b.rooms].reverse().find(r => b.sections[r.id] === 'arena')
  const out: Room[] = []
  for (let r: Room | undefined = arena; r && !out.includes(r); r = r.parent >= 0 ? b.rooms[r.parent] : undefined) out.unshift(r)
  return out
}

/**
 * Walking distance (cells) from the start over the route: every walkable
 * cell but those of rooms in `off` (and so the corridors that lead only to
 * them), heights and pits ignored — the length of the way, not its verbs —
 * plus `hops` between cells no walk joins (a leap, a ride, a lift's stops).
 * −1: not on the route.
 */
export const routeField = (
  w: number, h: number, cell: Uint8Array, room: Int16Array, from: number[], off: ReadonlySet<number>, hops: ReadonlyArray<readonly [number, number]> = []
): Int32Array => {
  const d = new Int32Array(w * h).fill(-1)
  const q: number[] = []
  const jump = new Map<number, number[]>()
  for (const [a, c] of hops) { jump.set(a, [...(jump.get(a) ?? []), c]); jump.set(c, [...(jump.get(c) ?? []), a]) }
  for (const k of from) { d[k] = 0; q.push(k) }
  for (let n = 0; n < q.length; n++) {
    const k = q[n]!
    const i = k % w
    const j = (k - i) / w
    for (const nk of jump.get(k) ?? []) {
      if (d[nk]! >= 0 || off.has(room[nk]!)) continue
      d[nk] = d[k]! + Math.max(1, Math.abs((nk % w) - i) + Math.abs(Math.floor(nk / w) - j))
      q.push(nk)
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
      const nk = nj * w + ni
      if (d[nk]! >= 0 || cell[nk] === Cell.Void || off.has(room[nk]!)) continue
      d[nk] = d[k]! + 1
      q.push(nk)
    }
  }
  return d
}

/** The rooms off the route of a finished map: the challenge room, the
 *  weapon lesson room behind the boss, the shortcuts' battle rooms. */
export const offRouteRooms = (m: MapData): Set<number> => {
  const off = new Set<number>()
  if (m.challenge) off.add(m.challenge.room)
  if (m.exit) off.add(m.exit.room)
  for (const c of m.terrain?.climbs ?? []) if (c.shortcut) off.add(c.shortcut.room)
  return off
}

/** The hops of a terrain's lists (`routeField`): links, lifts' stops, the
 *  route's own ladders (never a climb's: those are off the way). */
export const routeHops = (w: number, t: Pick<Terrain, 'links' | 'lifts' | 'ladders'>): Array<[number, number]> => {
  const at = (x: number, z: number) => Math.floor(z / CELL) * w + Math.floor(x / CELL)
  const out: Array<[number, number]> = []
  for (const l of t.links ?? []) out.push([l.from[1] * w + l.from[0], l.to[1] * w + l.to[0]])
  for (const l of t.lifts) out.push([at(l.ax, l.az), at(l.bx, l.bz)])
  for (const l of t.ladders) if (!l.side) out.push([l.j * w + l.i, (l.j + l.dj) * w + l.i + l.di])
  return out
}

/** A finished map's route distances from its start (`routeField`). */
export const mapRouteField = (m: MapData): Int32Array =>
  routeField(m.w, m.h, m.cell, m.room, [Math.floor(m.start.z / CELL) * m.w + Math.floor(m.start.x / CELL)], offRouteRooms(m), routeHops(m.w, m.terrain!))

/** The cells of room `r` walkable from each of `seeds` (flood over
 *  `walkStep`, inside the room). */
const roomReach = (b: Builder, view: MapData, r: Room, seeds: number[]): Set<number> => {
  const seen = new Set<number>()
  const stack = seeds.slice()
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % b.W
    const j = (k - i) / b.W
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < r.x0 || nj < r.z0 || ni >= r.x0 + r.w || nj >= r.z0 + r.h) continue
      const nk = b.k(ni, nj)
      if (b.room[nk] !== r.id || seen.has(nk)) continue
      if (walkStep(view, i, j, ni, nj)) stack.push(nk)
    }
  }
  return seen
}

/** The room cells just inside each doorway of `r`. */
const doorCells = (b: Builder, r: Room): number[] => {
  const out: number[] = []
  for (const d of b.doors) {
    for (const s of [-1, 1]) {
      const i = d.i + (d.axis === 'x' ? s : 0)
      const j = d.j + (d.axis === 'z' ? s : 0)
      if (i >= 0 && j >= 0 && i < b.W && j < b.H && b.room[b.k(i, j)] === r.id) out.push(b.k(i, j))
    }
  }
  return out
}

/** A placed tower (before it is written into the stage's lists). */
interface Tower { spot: Spot; tpl: Template; y: number; cells: number[]; feet: number[] }

/**
 * Can `tpl` stand at `s`? Its cells and its shafts' feet on plain, flat,
 * unbusy floor of the room, its back row against a real wall (void behind
 * it), a cell of open floor (or wall) round it, and the room still
 * walkable door to door with it raised. Writes nothing on a no.
 */
const fit = (b: Builder, view: MapData, s: Spot, tpl: Template, busy: Set<number>, wallOut = false): Tower | null => {
  const r = s.room
  const inRoom = (i: number, j: number) => i >= r.x0 && j >= r.z0 && i < r.x0 + r.w && j < r.z0 + r.h && b.room[b.k(i, j)] === r.id
  const plain = (i: number, j: number) => inRoom(i, j) && !b.pit[b.k(i, j)] && !b.ramp[b.k(i, j)] && !busy.has(b.k(i, j))
  const [ai, aj] = toCell(s, 0, 0)
  if (!inRoom(ai, aj)) return null
  const y = b.floor[b.k(ai, aj)]!
  const flat = (i: number, j: number) => plain(i, j) && b.floor[b.k(i, j)] === y
  const cells: number[] = []
  const mine = new Set<string>()
  for (const [u, v] of tpl.cells) mine.add(`${u},${v}`)
  for (const [u, v] of tpl.cells) {
    const [i, j] = toCell(s, u, v)
    if (!flat(i, j)) return null
    cells.push(b.k(i, j))
    // The back row: a wall behind it (no doorway, no other room).
    if (v === 0) {
      const [wi, wj] = toDir(s, 0, -1)
      const oi = i + wi
      const oj = j + wj
      if (oi < 0 || oj < 0 || oi >= b.W || oj >= b.H || b.cell[b.k(oi, oj)] !== Cell.Void) return null
      if (wallOut) {
        // The shortcut's way out through that wall: void beyond, both sides.
        const [si, sj] = toDir(s, 1, 0)
        for (const e of [-1, 1]) {
          const qi = oi + si * e
          const qj = oj + sj * e
          if (qi >= 0 && qj >= 0 && qi < b.W && qj < b.H && b.cell[b.k(qi, qj)] === Cell.Corridor) return null
        }
      }
    }
  }
  const feet: number[] = []
  for (const p of tpl.pitches) {
    const [fu, fv] = p.foot
    if (mine.has(`${fu},${fv}`)) continue
    const [i, j] = toCell(s, fu, fv)
    if (!flat(i, j)) return null
    feet.push(b.k(i, j))
  }
  // A ring of open floor (or wall) round the tower and its feet.
  let u0 = Infinity, u1 = -Infinity, v1 = -Infinity
  for (const [u, v] of tpl.cells) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v1 = Math.max(v1, v) }
  for (const p of tpl.pitches) { u0 = Math.min(u0, p.foot[0]); u1 = Math.max(u1, p.foot[0]); v1 = Math.max(v1, p.foot[1]) }
  for (let v = 0; v <= v1 + 1; v++) {
    for (let u = u0 - 1; u <= u1 + 1; u++) {
      if (mine.has(`${u},${v}`)) continue
      const [i, j] = toCell(s, u, v)
      if (i < 0 || j < 0 || i >= b.W || j >= b.H) return null
      const k = b.k(i, j)
      if (b.cell[k] === Cell.Void) continue
      // Never under a higher floor: its ledge is the climb's alone (no walk
      // down onto it from a step of the room).
      if (b.room[k] !== r.id || (!wallOut && !b.pit[k] && b.floor[k]! + (b.ramp[k] ? b.rise[k]! : 0) > y + 0.5)) return null
    }
  }
  // Still walkable door to door, and to every cell it reached before.
  const doors = doorCells(b, r)
  if (!doors.length) return null
  const before = roomReach(b, view, r, doors)
  const keep = cells.map(k => b.floor[k]!)
  for (const k of cells) b.floor[k] = 1e4
  const after = roomReach(b, view, r, [doors[0]!])
  for (let n = 0; n < cells.length; n++) b.floor[cells[n]!] = keep[n]!
  for (const k of before) if (!cells.includes(k) && !after.has(k)) return null
  for (const k of doors) if (!after.has(k)) return null
  for (const k of feet) if (!after.has(k)) return null
  return { spot: s, tpl, y, cells, feet }
}

/** Every spot along every wall of `r`, both hands. */
const spotsOf = (r: Room): Spot[] => {
  const out: Spot[] = []
  for (const side of SIDES) {
    const along = side === 'n' || side === 's'
    const lo = along ? r.x0 : r.z0
    const n = along ? r.w : r.h
    for (let o = lo; o < lo + n; o++) for (const hand of [1, -1] as const) out.push({ room: r, side, o, hand })
  }
  return out
}

/** Raise the tower, bolt its shafts on, mark it busy; its ladders' ids. */
const build = (b: Builder, t: Tower, busy: Set<number>, branch = false): number[] => {
  const s = t.spot
  for (const [u, v, h] of t.tpl.cells) {
    const [i, j] = toCell(s, u, v)
    b.floor[b.k(i, j)] = t.y + h
  }
  const ids: number[] = []
  for (const p of t.tpl.pitches) {
    const [fi, fj] = toCell(s, p.foot[0], p.foot[1])
    const [di, dj] = toDir(s, p.dir[0], p.dir[1])
    const y0 = b.floor[b.k(fi, fj)]!
    const y1 = b.floor[b.k(fi + di, fj + dj)]!
    ids.push(b.ladders.length)
    b.ladders.push({ i: fi, j: fj, di, dj, y0, y1, side: true, kick: true, ...(branch ? { branch: true } : {}) })
  }
  for (const k of [...t.cells, ...t.feet]) {
    busy.add(k)
    // Its ring too: two towers never stand shoulder to shoulder.
    const i = k % b.W
    const j = (k - i) / b.W
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      if (i + di >= 0 && j + dj >= 0 && i + di < b.W && j + dj < b.H) busy.add(b.k(i + di, j + dj))
    }
  }
  return ids
}

/**
 * A shortcut, authored on the stage's grid (pre-mirror cells): route room
 * `A`'s tower spot (its wall side, the start along it, the hand), the
 * corridor's `c1` cells out through that wall to the battle room's balcony
 * edge, the room's rectangle, the way out (`out`: from the room's edge cell
 * (i, j), `n` cells along (di, dj) to the door into route room `B`).
 * `placeShortcut` checks every cell of it against the stage as built.
 */
export interface ShortcutSpec {
  A: number
  B: number
  spot: Omit<Spot, 'room'>
  c1: number
  sx0: number
  sz0: number
  sw: number
  sh: number
  out: { i: number; j: number; di: number; dj: number; n: number }
}

/** The facing yaw of a grid step (forward = (−sin, −cos)): a chest backed
 *  onto the wall that way. */
const yawOf = (di: number, dj: number): number => Math.atan2(-di, -dj)

/**
 * The stage's climbs (`CLIMB_PLAN[sector]`), and its shortcut where one is
 * planned and fits. Call last, after `beamRoom` / `exitRoom` /
 * `challengeRoom`, just before `finish`: no room number on the route moves.
 */
export const placeClimbs = (b: Builder, sector: StageSector, seed: number): void => {
  const plan = CLIMB_PLAN[sector]
  const rng = mulberry32((seed ^ SALT) >>> 0)
  const view = viewOf(b)
  const busy = busyCells(b)
  const mech = mechanicRooms(b)
  // Rooms that push or flood Flux, or carry him off: no tower in them.
  const busyRooms = new Set<number>(['wind', 'water', 'rail', 'wave'].flatMap(k => mech.get(k) ?? []))
  for (const g of b.guards) busyRooms.add(g)
  for (const s of b.bossStages) busyRooms.add(s)
  const chain = chainRooms(b)
  const eligible = (r: Room) => !busyRooms.has(r.id) && r.role !== 'start' && r.role !== 'boss' && b.sections[r.id] !== 'arena' &&
    r.id !== b.beam?.room && r.id !== b.exit?.room && r.id !== b.challenge?.room && r.id !== 0

  if (plan.shortcut) placeShortcut(b, sector, plan.shortcut, view, chain, mech, busy, eligible)

  const placeIn = (rooms: Room[], tier: number): Tower | null => {
    for (const r of rooms) {
      const fits = spotsOf(r).map(s => fit(b, view, s, TEMPLATES[tier]!, busy)).filter((t): t is Tower => !!t)
      if (fits.length) return fits[Math.floor(rng() * fits.length)]!
    }
    return null
  }
  const byAim = (at: number) => chain.filter(eligible)
    .map(r => ({ r, d: Math.abs(chain.indexOf(r) / (chain.length - 1) - at) }))
    .sort((a, b) => a.d - b.d || a.r.id - b.r.id).map(e => e.r)

  plan.climbs.forEach((c, n) => {
    const t = placeIn(byAim(c.at), c.tier)
    if (!t) return
    const ids = build(b, t, busy)
    const at = commit(b, sector, t, ids, c.tier, c.reward, plan.chest, n)
    // The practice wall, right before it: in its room, else the room before.
    if (plan.practice && n === 0) {
      const ci = chain.indexOf(t.spot.room)
      const rooms = [t.spot.room, ...(ci > 0 ? [chain[ci - 1]!] : [])].filter(eligible)
      const p = placeIn(rooms, 0)
      if (p) {
        const pid = build(b, p, busy)
        // First in the list: the lesson's wall comes before the climb it teaches.
        const spot = { ...spotOf(b, p, pid, 'bolts', 0) }
        b.rewards.push({ x: cellCenter(spot.top.i), z: cellCenter(spot.top.j), y: spot.top.y, room: p.spot.room.id, kind: 'bolts' })
        b.climbs.splice(b.climbs.indexOf(at), 0, spot)
      }
    }
  })
}

/** The climb record of a built tower. */
const spotOf = (b: Builder, t: Tower, ladders: number[], reward: ClimbSpot['reward'], tier: number): ClimbSpot => {
  const [ti, tj] = toCell(t.spot, t.tpl.top[0], t.tpl.top[1])
  return { room: t.spot.room.id, tier, cells: t.cells.slice(), ladders, reward, top: { i: ti, j: tj, y: b.floor[b.k(ti, tj)]! } }
}

/** Write a reward climb's prize onto its top ledge and record it. */
const commit = (b: Builder, sector: StageSector, t: Tower, ids: number[], tier: number, reward: ClimbPlanEntry['reward'], chest: StageClimbPlan['chest'], n: number): ClimbSpot => {
  const spot = spotOf(b, t, ids, reward, tier)
  const { i, j, y } = spot.top
  const room = t.spot.room.id
  if (reward === 'chest') {
    const [wi, wj] = toDir(t.spot, 0, -1)
    const loot = chest ?? { rarity: 'tuned' as const, slot: 'helmet' as const }
    b.chest(i, j, yawOf(wi, wj), { ...loot, key: `${sector}.climb${n ? n + 1 : ''}` })
    b.chests[b.chests.length - 1]!.ledge = true
  } else b.rewards.push({ x: cellCenter(i), z: cellCenter(j), y, room, kind: reward })
  b.climbs.push(spot)
  return spot
}

/**
 * A shortcut (`StageClimbPlan.shortcut`): from a tower in route room A, out
 * through its wall along a corridor to a battle room's balcony; the room's
 * far door into route room B further on. Placed only when every cell of it
 * is still free (void, with a cell of void kept round the room and both
 * corridors), the skip inside SHORTCUT_SKIP, and no room it skips one that
 * must be met (`keep`).
 */
const placeShortcut = (
  b: Builder, sector: StageSector, spec: ShortcutSpec, view: MapData, chain: Room[], mech: Map<string, number[]>, busy: Set<number>, eligible: (r: Room) => boolean
): boolean => {
  const boss = b.doors.find(d => d.boss)
  const A = b.rooms[spec.A]
  const B = b.rooms[spec.B]
  if (!boss || !A || !B || !eligible(A)) return false
  const ai = chain.indexOf(A)
  const bi = chain.indexOf(B)
  if (ai < 1 || bi < ai + 2 || bi >= chain.length - 1 || b.guards.includes(B.id)) return false
  // Never skipped: a guard hall, a boss stage, a wave's room (a ride under
  // fire), a Master's echo, the first room of each mechanic Atlas teaches.
  const keep = new Set<number>([...b.guards, ...b.bossStages])
  for (const w of b.waves) keep.add(w.room)
  for (const f of b.foes) if (f.echo) keep.add(f.room)
  for (const [kind, rooms] of mech) {
    if (!CUED[sector].some(c => kind.startsWith(c))) continue
    const first = chain.find(r => rooms.includes(r.id))
    if (first) keep.add(first.id)
  }
  if (chain.slice(ai + 1, bi).some(r => keep.has(r.id))) return false
  const voidAt = (i: number, j: number) => i >= 1 && j >= 1 && i < b.W - 1 && j < b.H - 1 && b.cell[b.k(i, j)] === Cell.Void
  /** The corridor of `n` cells from (i, j) along (di, dj), void round it. */
  const lane = (i: number, j: number, di: number, dj: number, n: number): boolean => {
    for (let s = 1; s <= n; s++) {
      const ci = i + di * s
      const cj = j + dj * s
      if (!voidAt(ci, cj) || !voidAt(ci + dj, cj + di) || !voidAt(ci - dj, cj - di)) return false
    }
    return true
  }
  const s: Spot = { ...spec.spot, room: A }
  const [ti, tj] = toCell(s, 0, 0)
  const [wi, wj] = toDir(s, 0, -1)
  const { c1, sx0, sz0, sw, sh, out } = spec
  if (!lane(ti, tj, wi, wj, c1)) return false
  // The corridor ends at the balcony edge, mid-wall.
  const ei = ti + wi * (c1 + 1)
  const ej = tj + wj * (c1 + 1)
  if (ei < sx0 || ej < sz0 || ei >= sx0 + sw || ej >= sz0 + sh) return false
  for (let j = sz0 - 1; j <= sz0 + sh; j++) for (let i = sx0 - 1; i <= sx0 + sw; i++) if (!voidAt(i, j)) return false
  if (!lane(out.i, out.j, out.di, out.dj, out.n)) return false
  const bk = b.k(out.i + out.di * (out.n + 1), out.j + out.dj * (out.n + 1))
  if (b.room[bk] !== B.id || b.pit[bk] || b.ramp[bk] || busy.has(bk)) return false
  // The skip, by the route's length.
  const start = b.beam ? b.rooms[b.beam.room]! : chain[0]!
  const field = routeField(b.W, b.H, b.cell, b.room, [b.k(start.x0, start.z0)], new Set([b.challenge?.room ?? -1, b.exit?.room ?? -1]), routeHops(b.W, b))
  const total = field[b.k(boss.i, boss.j)]!
  const skip = (field[bk]! - field[b.k(ti, tj)]!) / total
  if (!(total > 0) || skip < SHORTCUT_SKIP[0] || skip > SHORTCUT_SKIP[1]) return false
  // Tall enough that the balcony stands BALCONY_DROP over B's floor.
  const yA = b.floor[b.k(ti, tj)]!
  const yB = b.floor[bk]!
  const h = Math.max(2 * PITCH, Math.ceil((yB - yA + BALCONY_DROP) / PITCH - 1e-6) * PITCH)
  if (h > MAX_TOWER) return false
  const tower = fit(b, view, s, shortcutTemplate(h), busy, true)
  if (!tower) return false
  const ids = build(b, tower, busy, true)
  const yTop = b.floor[b.k(ti, tj)]!
  // The corridor out to the balcony, its door at the far end.
  for (let n = 1; n <= c1; n++) {
    const k = b.k(ti + wi * n, tj + wj * n)
    b.cell[k] = Cell.Corridor
    b.floor[k] = yTop
  }
  const S: Room = { id: b.rooms.length, x0: sx0, z0: sz0, w: sw, h: sh, depth: 0, parent: -1, children: [], role: 'combat', door: -1, spots: [], wallSpots: [] }
  b.rooms.push(S)
  b.sections.push('hall')
  const balcony = (i: number, j: number) => (wi > 0 && i === sx0) || (wi < 0 && i === sx0 + sw - 1) || (wj > 0 && j === sz0) || (wj < 0 && j === sz0 + sh - 1)
  for (let j = sz0; j < sz0 + sh; j++) {
    for (let i = sx0; i < sx0 + sw; i++) {
      const k = b.k(i, j)
      b.cell[k] = Cell.Room
      b.room[k] = S.id
      b.floor[k] = balcony(i, j) ? yTop : yB
    }
  }
  const di1 = ti + wi * c1
  const dj1 = tj + wj * c1
  const doorIn: Door = { id: b.doors.length, i: di1, j: dj1, axis: wi !== 0 ? 'x' : 'z', dir: (wi !== 0 ? wi : wj) as 1 | -1, from: A.id, to: S.id, boss: false }
  b.doors.push(doorIn)
  for (let n = 1; n <= out.n; n++) {
    const k = b.k(out.i + out.di * n, out.j + out.dj * n)
    b.cell[k] = Cell.Corridor
    b.floor[k] = yB
  }
  const doorOut: Door = {
    id: b.doors.length, i: out.i + out.di * out.n, j: out.j + out.dj * out.n, axis: out.di !== 0 ? 'x' : 'z',
    dir: (out.di !== 0 ? out.di : out.dj) as 1 | -1, from: S.id, to: B.id, boss: false, shortcut: true
  }
  b.doors.push(doorOut)
  // A hard fight on the low floor: the stage's own walkers (one of them
  // elite), a drone over them, a turret in the corner across from the way out.
  const walkers = [...new Set(b.foes.filter(f => f.role === 'ground' && f.kind && WALKERS.includes(f.kind) && !f.echo).map(f => f.kind!))]
  const lo = (i: number, j: number) => !balcony(i, j)
  const box: [number, number, number, number] = [
    sx0 + (wi > 0 ? 1 : 0), sz0 + (wj > 0 ? 1 : 0), sx0 + sw - 1 - (wi < 0 ? 1 : 0), sz0 + sh - 1 - (wj < 0 ? 1 : 0)
  ]
  const posts: Array<[number, number]> = []
  for (let j = box[1]; j <= box[3]; j++) for (let i = box[0]; i <= box[2]; i++) if (lo(i, j)) posts.push([i, j])
  // Spread: corners and middle of the low floor, never the cell by the way out.
  const exitCell = b.k(out.i, out.j)
  const far = posts.filter(([i, j]) => b.k(i, j) !== exitCell)
  const pick = (u: number, v: number): [number, number] => {
    const i = Math.round(box[0] + (box[2] - box[0]) * u)
    const j = Math.round(box[1] + (box[3] - box[1]) * v)
    return far.reduce((a, c) => (Math.hypot(c[0] - i, c[1] - j) < Math.hypot(a[0] - i, a[1] - j) ? c : a), far[0]!)
  }
  const yaw = yawOf(-wi, -wj)
  const used = new Set<number>()
  const post = (u: number, v: number): [number, number] => {
    let c = pick(u, v)
    if (used.has(b.k(c[0], c[1]))) c = far.find(q => !used.has(b.k(q[0], q[1])))!
    used.add(b.k(c[0], c[1]))
    return c
  }
  const ground = [[0.2, 0.75], [0.8, 0.75], [0.5, 1], [0.5, 0.45]] as const
  ground.forEach(([u, v], n) => {
    const [i, j] = post(u, v)
    b.foe('ground', i, j, yaw, box, undefined, walkers.length ? walkers[n % walkers.length] : undefined, undefined, n === 0)
  })
  const [fi, fj] = post(0.5, 0.7)
  b.foe('flyer', fi, fj, yaw, box, [yB, yB + 2])
  const [qi, qj] = post(0, 1)
  b.foe('turret', qi, qj, yaw, [qi, qj, qi, qj])
  b.guards.push(S.id)
  // Its tier by its kicks: 3 m is the tier-1 climb's.
  const spot = spotOf(b, tower, ids, 'shortcut', Math.min(3, Math.round(h / PITCH) - 1))
  spot.shortcut = {
    room: S.id, doorIn: doorIn.id, doorOut: doorOut.id, to: B.id,
    skips: chain.slice(chain.indexOf(A) + 1, chain.indexOf(B)).map(r => r.id)
  }
  // Let out past the challenge door (its room's, further back): a signpost
  // by the way out points back to it, against the wall beside the landing.
  const cd = b.challenge ? b.doors[b.challenge.door] : undefined
  if (cd && cd.from === B.id) {
    const li = bk % b.W
    const lj = (bk - li) / b.W
    const side = [1, -1].map(s => [out.dj * s, out.di * s] as const)
      .find(([pi, pj]) => b.room[b.k(li + pi, lj + pj)] !== B.id) ?? [out.dj, out.di]
    const tx = cellCenter(cd.i) - cellCenter(li)
    const tz = cellCenter(cd.j) - cellCenter(lj)
    const n = Math.hypot(tx, tz) || 1
    spot.shortcut.sign = { x: cellCenter(li) + side[0] * SIGN_OFF, z: cellCenter(lj) + side[1] * SIGN_OFF, dx: tx / n, dz: tz / n }
  }
  b.climbs.push(spot)
  return true
}
