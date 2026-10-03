import { mulberry32, randInt, shuffle, type Rng } from './rng'
import type { EnemyKind } from '../models/enemies'

/**
 * ─── Procedural sector maps ──────────────────────────────────────────────────
 *
 * A map is a grid of 3 m cells. Rooms are GROWN off the start room: each new
 * room hangs off an existing one by a straight corridor with a sliding door at
 * the new room's threshold. That gives the Blades shape for free — a readable
 * main path of rooms with short side branches ending in treasure — and makes
 * the map a tree, so "the farthest room" is a well-defined objective / boss
 * room and a door always faces into the room it guards.
 *
 * Everything is reproducible from `seed`, which is what lets a mission
 * snapshot store only what the player changed.
 */

export const CELL = 3
export const WALL_H = 4.2

export const enum Cell { Void = 0, Room = 1, Corridor = 2 }

export type RoomRole = 'start' | 'combat' | 'treasure' | 'objective' | 'boss'

/** The four grid neighbours, in a fixed order (+X, −X, +Z, −Z). */
export const DIRS4: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export interface Room {
  id: number
  x0: number
  z0: number
  w: number
  h: number
  depth: number
  parent: number
  children: number[]
  role: RoomRole
  /** Door index leading INTO this room (none for the start room). */
  door: number
  /** Interior cells shuffled, minus cells next to doors (spawns, pickups). */
  spots: Array<[number, number]>
  /** Edge cells against a wall, minus doorways (crates, chests, terminals). */
  wallSpots: Array<[number, number, number]> // i, j, facing yaw
}

export interface Door {
  id: number
  i: number
  j: number
  /** Corridor axis: 'x' = corridor runs along X, so the panel spans Z. */
  axis: 'x' | 'z'
  /** Sign of travel from parent into child along the axis. */
  dir: 1 | -1
  from: number
  to: number
  boss: boolean
}

export interface Pillar {
  x: number
  z: number
  r: number
  /** A boss arena's cover pillar that has crumbled (`sim/bossArena.ts`). */
  gone?: boolean
}

export interface MapData {
  seed: number
  w: number
  h: number
  cell: Uint8Array
  /** Room id per cell (corridor cells hold -1). */
  room: Int16Array
  /** 1 where a static obstacle (pillar) blocks path-finding. */
  navBlock: Uint8Array
  rooms: Room[]
  doors: Door[]
  pillars: Pillar[]
  start: { x: number; z: number; yaw: number }
  /** Floor heights, ladders, lifts, pits and timed obstacles (the climb,
   *  `climbGen.ts`). Absent on every labyrinth map: those stay flat at y = 0
   *  and nothing below reads this unless it is there. */
  terrain?: Terrain
  /** A built tutorial's lessons per path room, start first (`WalkStep`s;
   *  `sim/walkthrough.ts` reads them instead of spreading its default). */
  walkSteps?: string[][]
  /** A built tutorial's cast per walkthrough room (by its place on the path),
   *  where the lesson's own teacher is not enough (`spawnTutorial`). */
  walkCast?: string[][]
  /** A stage's beam-in room (off its first room, `Builder.beamRoom`): where
   *  Flux lands, and the door into the level it holds until the newest
   *  weapon has had its lesson. */
  beam?: { room: number; door: number }
}

// ─── Terrain (the climb) ─────────────────────────────────────────────────────

/** Which way a ramp cell climbs: its floor rises across the cell toward
 *  +X, −X, +Z or −Z (0 = a flat cell). The stairs are drawn as steps, walked
 *  as a slope. */
export const enum Ramp { None = 0, PX = 1, NX = 2, PZ = 3, NZ = 4 }

/** A ladder bolted to the cliff face between two floors. */
export interface Ladder {
  /** The foot cell: the lower floor, in front of the wall. */
  i: number
  j: number
  /** From the foot cell toward the wall (and the top cell): one axis, ±1. */
  di: number
  dj: number
  /** Floor heights at the foot and at the top (m). */
  y0: number
  y1: number
  /** Off the main line: it leads to a reward ledge. */
  side: boolean
  /** A wall-kick shaft (the Blackout Boulevard's secret), not a ladder:
   *  slide at its foot facing the wall to kick up, and again, and again. */
  kick?: boolean
}

/** A moving platform. `v` waits at its lower stop and rides up once stood
 *  on; `h` shuttles across a pit on a loop. Both stops are the platform's
 *  top centre. Under it the lift is a solid column (a piston, a hull), so
 *  nothing walks beneath it. A `v` lift with `loop` bobs between its stops
 *  on the mission clock like a shuttle, ridden or not (the Sky Docks'
 *  bobbing platforms). */
export interface Lift {
  kind: 'v' | 'h'
  /** Half extents of the platform (m). */
  hw: number
  hd: number
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  /** Seconds per leg and dwell at each stop. */
  travel: number
  wait: number
  /** Loop offset (s) of an `h` (or looping) lift. */
  phase: number
  room: number
  /** A `v` lift that loops on the clock instead of waiting to be ridden. */
  loop?: boolean
}

/** A piston crusher over a walkway cell: it warns, slams, holds, rises. */
export interface Crusher {
  i: number
  j: number
  /** The floor it slams onto (m). */
  y: number
  /** Seconds between slams, and the loop offset. */
  period: number
  phase: number
  room: number
}

/** A lane down a staircase that scrap balls roll along. */
export interface RollerLane {
  /** Where a ball lands out of its hatch (top of the slope) and the downhill
   *  direction (a unit axis). */
  x: number
  z: number
  dx: number
  dz: number
  /** How far it rolls before it drops into the gutter at the foot (m). */
  len: number
  period: number
  phase: number
  room: number
}

/** A restart spot: a pit fall (and a resume) puts Flux back here. Reached by
 *  standing on any of its cells. */
export interface Checkpoint {
  x: number
  z: number
  y: number
  yaw: number
  room: number
  cells: number[]
}

/** A reward ledge off the main line: bolts, a big capsule, or (`weapon`) a
 *  borrowed-weapon capsule, which `sim/borrowed.ts` owns — the climb's own
 *  runtime draws and pays only the other kinds. */
export interface RewardSpot {
  x: number
  z: number
  y: number
  room: number
  kind: 'hp' | 'we' | 'bolts' | 'weapon'
}

/** A machine's post in the climb: what kind of slot it is, where it stands,
 *  the rectangle it may not leave (its own platform) and, for a flyer, the
 *  band of heights it follows the player through. */
export interface FoePost {
  role: 'ground' | 'turret' | 'flyer'
  /** The machine this post holds, when the level names it (a stage's own
   *  enemy); else the role's default (`sim/climbSpawn.ts`). */
  kind?: EnemyKind
  /** An `echo` post's Master (the Fortress's Twin Masters). */
  echo?: string
  x: number
  z: number
  y: number
  yaw: number
  room: number
  leash: [number, number, number, number]
  fly?: [number, number]
}

/** What a section of a terrain map is (a label: the lab draws it, the arena's
 *  wall height keys on it). The climb's seven, then the platform stages'. */
export type SectionKind = 'hall' | 'ladder' | 'rolling' | 'lift' | 'crusher' | 'descent' | 'arena'
  | 'drop' | 'vents' | 'hammer' | 'lava' | 'ice' | 'spikes' | 'frost' | 'icicles' | 'rail' | 'cart' | 'islands' | 'shuttle' | 'wind' | 'dock'
  | 'magnet' | 'conveyor' | 'water'

// ─── Terrain extensions (the platform stages, `world/stages/`) ──────────────
// All optional on `Terrain`: the climb sets only `chests`, and nothing reads
// one that is absent. `mirrorX` (`world/stages/builder.ts`) mirrors each.

/** A chest a level's author put on a ledge: the centre of its cell, the
 *  floor it stands on, and the wall it backs onto (`Room.wallSpots`' yaw:
 *  forward, (−sin, −cos), points at the wall). */
export interface ChestSpot {
  x: number
  y: number
  z: number
  yaw: number
  room: number
}

/** What lies at the bottom of a room's pits: a plain drop, a bed of spikes,
 *  or lava. Spikes and lava cost twice a plain fall (`sim/climb.ts`). */
export type PitKind = 'void' | 'spikes' | 'lava'

/**
 * What a room's pits hold. Unset, a pit with a floor to see holds SPIKES:
 * a fall used to end in a dark nothing and a jingle, and players never knew
 * why it hurt. Only a map open to the sky (`clouds`: off the level itself)
 * keeps a bottomless void — there Atlas catches Flux straight away.
 */
export const pitKindOf = (t: Pick<Terrain, 'pitKind' | 'clouds'>, room: number): PitKind =>
  (room >= 0 ? t.pitKind?.[room] : undefined) ?? (t.clouds ? 'void' : 'spikes')

/** A slab that holds once (`sim/stages/crumble.ts`): its corner cell, its top
 *  (m) and its size in cells. The cells under it are pit. */
export interface CrumbleSpec {
  i: number
  j: number
  y: number
  w?: number
  d?: number
}

/** A wind tunnel's gusts over a rectangle of cells (inclusive): a push of
 *  `strength` m/s along the unit (dx, dz), blowing `on` s then still `off`
 *  s, offset by `phase` on the mission clock. */
export interface WindZone {
  i0: number
  j0: number
  i1: number
  j1: number
  dx: number
  dz: number
  strength: number
  on: number
  off: number
  phase: number
  room: number
}

/** A magnet rail (the Polarity Works, `world/stages/magnet.ts`): a strip of
 *  floor whose field drags Flux along (dx, dz) at `strength` m/s — a push on
 *  top of his walk, like a gust; it never lifts or drops him. Its polarity
 *  panel, a plate on a wall of cell (i, j)'s `side`, flips the pull when
 *  shot; `every` > 0 flips it on the clock as well (offset by `phase`). */
export interface MagnetRail {
  i0: number
  j0: number
  i1: number
  j1: number
  dx: number
  dz: number
  strength: number
  panel?: { i: number; j: number; side: 'n' | 's' | 'e' | 'w' }
  every?: number
  phase?: number
  room: number
}

/** Water over a rectangle of cells (the Tidewater Locks,
 *  `world/stages/tide.ts`): its surface stands between `lo` and `hi` (world
 *  y). On the clock (`period` > 0) the tide rises, holds, falls and holds;
 *  with a `valve` (a wheel on a wall) it stands at `hi` until the valve is
 *  shot, then drains to `lo` for good; otherwise it holds at `lo`. In it
 *  Flux wades slower the deeper it is; over his chest it hurts. A current
 *  (dx, dz, `strength` m/s) pushes whoever wades in it. */
export interface WaterZone {
  i0: number
  j0: number
  i1: number
  j1: number
  lo: number
  hi: number
  period?: number
  phase?: number
  valve?: { i: number; j: number; side: 'n' | 's' | 'e' | 'w' }
  dx?: number
  dz?: number
  strength?: number
  room: number
}

/** A bridge of light (the Blackout Boulevard, `world/stages/neon.ts`): a
 *  w × d slab at top `y` over pit cells from (i, j), solid only while lit.
 *  With a `group` it is lit while its room's switch says so (shooting the
 *  switch swaps group 0 and group 1); without one it blinks on the clock:
 *  lit `on` s of every `period`, offset by `phase`, flickering before it
 *  goes dark. */
export interface NeonBridge {
  i: number
  j: number
  w: number
  d: number
  y: number
  group?: 0 | 1
  period?: number
  phase?: number
  on?: number
  /** Lit except while the stage's blackout is out (`Terrain.blackout`). */
  pulse?: boolean
  room: number
}

/** A stage that goes dark on a clock (`sim/lightPulse.ts`'s `PulseSpec`). */
export interface BlackoutSpec {
  period: number
  warn: number
  dark: number
  phase: number
}

/** A light switch on a wall of cell (i, j)'s `side`: shot, it swaps which
 *  group of its room's neon bridges is lit. */
export interface NeonSwitch {
  i: number
  j: number
  side: 'n' | 's' | 'e' | 'w'
  room: number
}

/** A maglev rail a cart rides along: its polyline (the cart's floor at each
 *  point), speed (m/s), and the cells it is boarded at and left at. */
export interface RailSpec {
  points: Array<{ x: number; y: number; z: number }>
  speed: number
  room: number
  boardAt: { i: number; j: number }
  exitAt: { i: number; j: number }
}

/** A wave of flyers that beams in on a trigger (standing on a cell, or the
 *  cart setting off): `count` at a time, every `every` s, `total` in all. */
export interface WaveSpec {
  room: number
  trigger: { i: number; j: number } | 'rail'
  kind: 'heli' | 'hornet'
  count: number
  every: number
  total: number
}

/** A wall vent that breathes fire (or frost) across the cell in front of it
 *  along (dx, dz), from its mouth at height `y`: `on` s of every `period`,
 *  offset by `phase`. A `shock` vent is a floor panel instead: cell (i, j)
 *  itself goes live (no direction; `y` is its floor) — each feature takes
 *  only its own kind. */
export interface VentSpec {
  i: number
  j: number
  dx: number
  dz: number
  y: number
  period: number
  phase: number
  on: number
  room: number
  kind: 'fire' | 'frost' | 'shock'
}

/** An ice pillar filling the middle of cell (i, j): a solid column
 *  (`sim/stages/icePillars.ts`), blocked for paths from the start
 *  (`finish` marks its cell in `navBlock`). A `cracked` one shatters when
 *  shot, opening its cell: an optional shortcut, never the route. */
export interface IcePillar {
  i: number
  j: number
  cracked: boolean
  room: number
}

/** An icicle over cell (i, j), whose floor is `y`: every `period` s (offset
 *  by `phase`) a shadow ring grows under it, then it drops and shatters,
 *  and grows back (`sim/stages/icicles.ts`). */
export interface IcicleSpec {
  i: number
  j: number
  y: number
  period: number
  phase: number
  room: number
}

/** A one-way hop between two cells that `findPath` cannot infer from the
 *  floors (a dash leap over a gap, a rail ride, a drop past a ledge): the
 *  objective trail follows it, the tap-to-move never does. */
export interface NavLink {
  from: [number, number]
  to: [number, number]
  kind: 'leap' | 'rail' | 'drop'
}

/**
 * An optional secret room: a few coloured wall buttons, shot to toggle, and
 * a hint panel beside a false wall; solved, the wall sinks and opens a small
 * alcove with a prize. The alcove's cells are the room's own cells, walled
 * off (`climbMesh.ts`) and blocked for bodies and paths (`sim/climb.ts`)
 * until it is solved (`ClimbRun.openSecret`). Built by `Builder.secret`.
 *
 *  - `lights`: each button ON/OFF; the panel shows the target lamps.
 *  - `color`: fixed colours, each toggles ON/OFF; exactly the buttons of
 *    the `key` colour ON (the wall's frame wears that colour).
 *  - `cycle`: each hit steps red → green → blue → yellow; the panel shows
 *    the target colour per button, left to right.
 */
export interface SecretSpec {
  room: number
  kind: 'lights' | 'color' | 'cycle'
  /** Wall buttons: position of the button face centre and the wall's normal into the room (unit, axis aligned). */
  buttons: Array<{ x: number; y: number; z: number; nx: number; nz: number; color: number /* 0 red,1 green,2 blue,3 yellow; 'lights': ignored */ }>
  /** Target: per button ON (lights/color) or color index (cycle). 'color': target = buttons[i].color === key. */
  target: number[]
  /** 'color' only: the key color index. */
  key?: number
  /** The hint panel (on the wall next to the hidden door). */
  panel: { x: number; y: number; z: number; nx: number; nz: number }
  /** The false wall: the door cell of the alcove (the wall face between `door` and the room), and the alcove cells. */
  door: { i: number; j: number; axis: 'x' | 'z' }
  /** Alcove cell indices (hidden until solved). */
  cells: number[]
  /** 'tank' = +1 Repair Tank (heal pack) even over the cap, 'power' = a borrowed Core Master weapon charge set. */
  prize: 'tank' | 'hp' | 'weapon' | 'power'
  prizeAt: { x: number; y: number; z: number }
}

export interface Terrain {
  /** Floor height per cell (m); a ramp's height at its low edge. */
  floor: Float32Array
  ramp: Uint8Array
  /** Height a ramp cell gains across it (m). */
  rise: Float32Array
  /** 1 = no floor at all: a pit. */
  pit: Uint8Array
  /** Per room: the top of its walls and how deep its pits are drawn (m). */
  wallTop: number[]
  pitBottom: number[]
  /** Per room: which section of the climb it is. */
  sections: SectionKind[]
  ladders: Ladder[]
  lifts: Lift[]
  crushers: Crusher[]
  lanes: RollerLane[]
  checkpoints: Checkpoint[]
  rewards: RewardSpot[]
  foes: FoePost[]
  /** Chests on the ledges (`sim/objectives.ts` places them after its own). */
  chests?: ChestSpot[]
  /** Optional secret alcoves behind shoot-the-button puzzles. */
  secrets?: SecretSpec[]
  /** 1 = an ice cell: low friction, momentum carries (per cell). */
  ice?: Uint8Array
  /** Per room: what its pits hold (unset: the rule, `pitKindOf`). */
  pitKind?: Array<PitKind | undefined>
  /** Crumbling platforms over pits (`sim/stages/crumble.ts`). */
  crumbles?: CrumbleSpec[]
  wind?: WindZone[]
  /** Magnet rails (the Polarity Works). */
  magnets?: MagnetRail[]
  /** Water: tides, locks and currents (the Tidewater Locks). */
  water?: WaterZone[]
  /** Guard rooms (the Fortress's mini-boss halls): the way out of each
   *  stays shut until every machine in it is down. */
  guards?: number[]
  /** Bridges of light and their switches (the Blackout Boulevard). */
  neon?: NeonBridge[]
  neonSwitches?: NeonSwitch[]
  /** The stage's lights go out on this clock (the Blackout Boulevard). */
  blackout?: BlackoutSpec
  /** The final boss's stages, in order (room ids): the Fortress's Core
   *  Descent (#109) — the roof, the reactor hall, the Core ring. The first is
   *  the boss room; the boss and Flux are carried from one to the next. */
  bossStages?: number[]
  rails?: RailSpec[]
  waves?: WaveSpec[]
  vents?: VentSpec[]
  /** Ice pillars (solid; the cracked ones can be shot down). */
  icePillars?: IcePillar[]
  /** Icicles that drop from the ceiling on a rhythm. */
  icicles?: IcicleSpec[]
  /** Extra one-way edges for the objective trail's `findPath`. */
  links?: NavLink[]
  /** The pits are open sky over a sea of clouds (the Sky Docks): drawn as
   *  mist far below instead of a dark shaft. Looks only. */
  clouds?: boolean
}

export interface MapSpec {
  seed: number
  rooms: number
  boss: boolean
}

export const cellCenter = (i: number): number => (i + 0.5) * CELL
export const worldToCell = (x: number): number => Math.floor(x / CELL)

interface Rect { x0: number; z0: number; w: number; h: number }

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Generate a sector map. A boss mission needs its boss room, and the 7×7
 * room can fail to fit off every deep room on a crowded grid — so such a map
 * re-rolls from a derived seed. Deterministic: a resumed mission regenerates
 * the very same map from its quest seed.
 */
export const generateMap = (spec: MapSpec): MapData => {
  let seed = spec.seed
  for (let attempt = 0; attempt < 8; attempt++) {
    const m = generateOnce({ ...spec, seed })
    if (!spec.boss || m.rooms.some(r => r.role === 'boss')) return m
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  }
  return generateOnce(spec)
}

const generateOnce = (spec: MapSpec): MapData => {
  const rng = mulberry32(spec.seed)
  const W = 44
  const H = 44
  const cell = new Uint8Array(W * H)
  const room = new Int16Array(W * H).fill(-1)
  const rooms: Room[] = []
  const doors: Door[] = []

  const idx = (i: number, j: number) => j * W + i
  const inBounds = (i: number, j: number) => i >= 1 && j >= 1 && i < W - 1 && j < H - 1

  /** Rect is placeable if it and a 1-cell margin are empty and in bounds. */
  const rectFree = (r: Rect, pad = 1): boolean => {
    for (let j = r.z0 - pad; j < r.z0 + r.h + pad; j++) {
      for (let i = r.x0 - pad; i < r.x0 + r.w + pad; i++) {
        if (!inBounds(i, j)) return false
        if (cell[idx(i, j)] !== Cell.Void) return false
      }
    }
    return true
  }

  const carveRoom = (r: Rect, id: number) => {
    for (let j = r.z0; j < r.z0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        cell[idx(i, j)] = Cell.Room
        room[idx(i, j)] = id
      }
    }
  }

  const addRoom = (r: Rect, parent: number, depth: number, door: number): Room => {
    const rm: Room = {
      id: rooms.length, ...r, depth, parent, children: [], role: 'combat', door, spots: [], wallSpots: []
    }
    rooms.push(rm)
    carveRoom(r, rm.id)
    if (parent >= 0) rooms[parent]!.children.push(rm.id)
    return rm
  }

  // Start room, off-centre so the map has room to grow in every direction.
  const s0: Rect = { x0: Math.floor(W / 2) - 2, z0: Math.floor(H / 2) - 2, w: 4, h: 4 }
  addRoom(s0, -1, 0, -1)

  /**
   * Try to hang a new room of size (w,h) off `parent` in direction `d`.
   * Returns true and carves it on success.
   */
  const tryGrow = (parent: Room, d: [number, number], w: number, h: number, len: number, boss: boolean): boolean => {
    const [dx, dz] = d
    let k: number // exit coordinate on the parent's side
    let cx: number
    let cz: number // (cx, cz) = first corridor cell
    if (dx !== 0) {
      if (parent.h < 3) return false
      k = randInt(rng, parent.z0 + 1, parent.z0 + parent.h - 2)
      cx = dx > 0 ? parent.x0 + parent.w : parent.x0 - 1
      cz = k
    } else {
      if (parent.w < 3) return false
      k = randInt(rng, parent.x0 + 1, parent.x0 + parent.w - 2)
      cz = dz > 0 ? parent.z0 + parent.h : parent.z0 - 1
      cx = k
    }
    const corridor: Array<[number, number]> = []
    for (let n = 0; n < len; n++) corridor.push([cx + dx * n, cz + dz * n])
    const [ex, ez] = corridor[corridor.length - 1]!
    // New room rect: its near side touches the corridor's end.
    let r: Rect
    if (dx !== 0) {
      const off = randInt(rng, 1, h - 2)
      r = { x0: dx > 0 ? ex + 1 : ex - w, z0: ez - off, w, h }
    } else {
      const off = randInt(rng, 1, w - 2)
      r = { x0: ex - off, z0: dz > 0 ? ez + 1 : ez - h, w, h }
    }
    if (!rectFree(r, 1)) return false
    // Corridor cells must be empty and not brush against other rooms'
    // walls (the side neighbours must be void too), except where it leaves
    // the parent and enters the child.
    for (let n = 0; n < corridor.length; n++) {
      const [i, j] = corridor[n]!
      if (!inBounds(i, j) || cell[idx(i, j)] !== Cell.Void) return false
      const side: Array<[number, number]> = dx !== 0 ? [[i, j - 1], [i, j + 1]] : [[i - 1, j], [i + 1, j]]
      for (const [si, sj] of side) {
        if (!inBounds(si, sj)) return false
        if (cell[idx(si, sj)] !== Cell.Void) return false
      }
    }
    for (const [i, j] of corridor) cell[idx(i, j)] = Cell.Corridor
    const doorId = doors.length
    const child = addRoom(r, parent.id, parent.depth + 1, doorId)
    doors.push({
      id: doorId, i: ex, j: ez, axis: dx !== 0 ? 'x' : 'z', dir: (dx !== 0 ? dx : dz) as 1 | -1,
      from: parent.id, to: child.id, boss
    })
    return true
  }

  const target = Math.max(3, spec.rooms)
  let guard = 0
  while (rooms.length < target && guard++ < 600) {
    // Bias growth toward deep rooms so there is a main path, with ~35 %
    // branches off any room.
    let parent: Room
    if (rng() < 0.35) parent = rooms[Math.floor(rng() * rooms.length)]!
    else {
      const maxDepth = rooms.reduce((m, r) => Math.max(m, r.depth), 0)
      const deep = rooms.filter(r => r.depth >= maxDepth - 1)
      parent = deep[Math.floor(rng() * deep.length)]!
    }
    if (parent.children.length >= 3) continue
    const d = DIRS[Math.floor(rng() * 4)]!
    const big = rng() < 0.4
    const w = big ? randInt(rng, 5, 7) : randInt(rng, 3, 5)
    const h = big ? randInt(rng, 5, 7) : randInt(rng, 3, 5)
    tryGrow(parent, d, w, h, randInt(rng, 2, 4), false)
  }

  // The boss / final room hangs off the DEEPEST room so it is the end of the
  // main path. Retry with every deep room and direction before giving up.
  if (spec.boss) {
    const byDepth = [...rooms].sort((a, b) => b.depth - a.depth)
    let placed = false
    for (const p of byDepth) {
      for (const d of shuffle(rng, [...DIRS])) {
        if (tryGrow(p, d, 7, 7, 3, true)) { placed = true; break }
      }
      if (placed) break
    }
  }

  // ── Roles ────────────────────────────────────────────────────────────────
  rooms[0]!.role = 'start'
  const last = rooms[rooms.length - 1]!
  if (spec.boss && doors.length && doors[doors.length - 1]!.boss) last.role = 'boss'
  const nonBoss = rooms.filter(r => r.role !== 'boss' && r.role !== 'start')
  const deepest = nonBoss.reduce<Room | null>((m, r) => (!m || r.depth > m.depth ? r : m), null)
  for (const r of nonBoss) {
    if (r.children.length === 0 && r !== deepest) r.role = 'treasure'
  }
  if (deepest) deepest.role = 'objective'

  // ── Pillars in big rooms ─────────────────────────────────────────────────
  const navBlock = new Uint8Array(W * H)
  const pillars: Pillar[] = []
  for (const r of rooms) {
    if (r.role === 'start' || r.role === 'boss') continue
    if (r.w >= 5 && r.h >= 5 && rng() < 0.75) {
      const inset = r.w >= 7 || r.h >= 7 ? 2 : 1
      const pts: Array<[number, number]> = [
        [r.x0 + inset, r.z0 + inset], [r.x0 + r.w - 1 - inset, r.z0 + inset],
        [r.x0 + inset, r.z0 + r.h - 1 - inset], [r.x0 + r.w - 1 - inset, r.z0 + r.h - 1 - inset]
      ]
      for (const [i, j] of pts) {
        pillars.push({ x: cellCenter(i), z: cellCenter(j), r: 0.62 })
        navBlock[idx(i, j)] = 1
      }
    }
  }

  // ── Spots ────────────────────────────────────────────────────────────────
  const nearDoor = (i: number, j: number): boolean => {
    for (const d of doors) {
      if (Math.abs(d.i - i) + Math.abs(d.j - j) <= 1) return true
    }
    return false
  }
  // Cells directly inside a doorway (the room cell the corridor enters).
  const doorway = new Set<number>()
  for (const d of doors) {
    for (const [di, dj] of DIRS) {
      const i = d.i + di
      const j = d.j + dj
      if (cell[idx(i, j)] === Cell.Room) doorway.add(idx(i, j))
    }
  }
  for (const r of rooms) {
    const spots: Array<[number, number]> = []
    const wallSpots: Array<[number, number, number]> = []
    for (let j = r.z0; j < r.z0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        if (navBlock[idx(i, j)]) continue
        if (doorway.has(idx(i, j)) || nearDoor(i, j)) continue
        spots.push([i, j])
        // Facing yaw turns an object's local +Z to point into the room, away
        // from the wall it stands against (rotation.y = yaw).
        if (i === r.x0 && cell[idx(i - 1, j)] === Cell.Void) wallSpots.push([i, j, Math.PI / 2])
        else if (i === r.x0 + r.w - 1 && cell[idx(i + 1, j)] === Cell.Void) wallSpots.push([i, j, -Math.PI / 2])
        else if (j === r.z0 && cell[idx(i, j - 1)] === Cell.Void) wallSpots.push([i, j, 0])
        else if (j === r.z0 + r.h - 1 && cell[idx(i, j + 1)] === Cell.Void) wallSpots.push([i, j, Math.PI])
      }
    }
    r.spots = shuffle(rng, spots)
    r.wallSpots = shuffle(rng, wallSpots)
  }

  // Start: centre of the start room, facing its first door.
  const sr = rooms[0]!
  const sx = cellCenter(sr.x0) + (sr.w - 1) * CELL / 2
  const sz = cellCenter(sr.z0) + (sr.h - 1) * CELL / 2
  let yaw = 0
  const firstDoor = doors.find(d => d.from === 0)
  if (firstDoor) yaw = Math.atan2(-(cellCenter(firstDoor.i) - sx), -(cellCenter(firstDoor.j) - sz))

  return { seed: spec.seed, w: W, h: H, cell, room, navBlock, rooms, doors, pillars, start: { x: sx, z: sz, yaw } }
}

/** Room centre in world space. */
export const roomCenter = (r: Room): [number, number] => [
  cellCenter(r.x0) + (r.w - 1) * CELL / 2,
  cellCenter(r.z0) + (r.h - 1) * CELL / 2
]

export type { Rng }

/**
 * Where a door's corridor leaves its parent room: the middle of that mouth on
 * the room's wall line, and the side (`n`, along the door's axis) the room is
 * on. A door with no corridor has its mouth at its own frame.
 */
export const corridorMouth = (map: MapData, d: Door): { x: number; z: number; axis: 'x' | 'z'; n: 1 | -1 } => {
  const di = d.axis === 'x' ? -d.dir : 0
  const dj = d.axis === 'z' ? -d.dir : 0
  let i = d.i
  let j = d.j
  let guard = 0
  // Back along the corridor to its last cell before the room.
  while (map.cell[(j + dj) * map.w + i + di] === Cell.Corridor && guard++ < 20) {
    i += di
    j += dj
  }
  return {
    x: cellCenter(i) + di * CELL / 2,
    z: cellCenter(j) + dj * CELL / 2,
    axis: d.axis,
    n: (d.axis === 'x' ? di : dj) as 1 | -1
  }
}
