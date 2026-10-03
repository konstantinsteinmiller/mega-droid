import { CELL, Ramp, cellCenter, type MapData, type Lift } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'
import { railCourse } from './volt'

/**
 * ─── Rotor Run (the rotor sector's story stage) ──────────────────────────────
 *
 * The Rotor Master's sky airfield. Its centre is a ride: a cargo
 * quadcopter (the Rail Rush's ride on this theme, `sim/stages/rail.ts`)
 * flies Flux round an open span while Hornet Rotors come at him in waves.
 * Around it, the verbs of the sky: leaps in a crosswind, shuttle drones
 * over wide gaps, bobbing drones up, a wind tunnel, drops.
 *
 *   1 Helipad         the pad; a Hornet Rotor (the stage's machine)
 *   2 Crosswind       roofs over one-cell gaps, a crosswind on the clock
 *   3 Drone hops      two shuttle drones over three-cell gaps
 *   4 Hornet nest     a fight among crates
 *   5 Drone lift      bobbing drones up two storeys
 *   6 Flight deck     the lobby before the ride
 *   7 The flight      the quadcopter round the span, hornets in waves
 *   8 Wind tunnel     gusts back up a tunnel, pillars to shelter behind
 *   9 Hangar          a fight
 *  10 Weapon gantry   islands; a side leap to the borrowed weapon
 *  11 Hangar drop     down two storeys
 *  12 Parts store     a secret alcove behind its north wall
 *  13 Approach        down to the boss shutter
 *  14 Arena           the Rotor Master, floor at y = 0, its own gusts
 *
 * Every leap gap is one cell between equal floors, each with its `link`.
 * Deterministic from the seed: the hand, the shuttles', drones' and gusts'
 * timing and the flight's pace vary — never the route.
 */

const GRID_W = 50
const GRID_H = 47
const PAD_Y = 6
const STOREY = 3

export const generateRotorRun = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x9070e)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => PAD_Y + n * STOREY
  const island = (i0: number, j0: number, i1: number, j1: number, y: number) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b.pit[b.k(i, j)] = 0
    b.level(i0, j0, i1, j1, y)
  }
  const leaps = (i: number, j: number, di: number, dj: number, span: number[], back = false) => {
    for (const s of span) {
      const fi = di ? i : s
      const fj = di ? s : j
      b.link([fi, fj], [fi + di * 2, fj + dj * 2], 'leap')
      if (back) b.link([fi + di * 2, fj + dj * 2], [fi, fj], 'leap')
    }
  }
  const cells = (i0: number, j0: number, i1: number, j1: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j])
    return out
  }
  const lift = (o: Omit<Lift, 'hw' | 'hd'>): void => { b.lifts.push({ hw: 1.46, hd: 1.46, ...o }) }
  const room = () => b.rooms.length - 1

  // ── 1 Helipad ─────────────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', L(0))
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.foe('flyer', 5, 2, YAW_NX, [1, 1, 6, 5], [L(0), L(0) + 2], 'hornet')
  b.foe('ground', 4, 4, YAW_NX, [3, 3, 6, 5])
  b.corridor(7, 2, 1, 0, 2, L(0))

  // ── 2 Crosswind ───────────────────────────────────────────────────────────
  // Three roofs, a one-cell gap between each two; a crosswind on the clock
  // pushes toward the south wall (never off a roof: the gaps run across it).
  b.addRoom(9, 1, 12, 4, 'combat', 'islands', L(0))
  b.pits(9, 1, 20, 4)
  island(9, 1, 11, 4, L(0))
  island(13, 1, 15, 4, L(0))
  island(17, 1, 20, 4, L(0))
  leaps(11, 0, 1, 0, [1, 2, 3])
  leaps(15, 0, 1, 0, [1, 2, 3])
  b.wind.push({ i0: 9, j0: 1, i1: 20, j1: 4, dx: 0, dz: 1, strength: 2.4 + rng() * 0.4, on: 2.2, off: 2.6 + rng() * 0.6, phase: rng() * 5, room: room() })
  b.rewards.push({ x: cellCenter(14), z: cellCenter(4), y: L(0), room: 1, kind: 'bolts' })
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 3))
  b.checkpoint(14, 2, YAW_PX, cells(13, 1, 15, 3))
  b.foe('flyer', 16, 2, YAW_NX, [9, 1, 20, 4], [L(0), L(1)], 'hornet')
  b.corridor(21, 2, 1, 0, 2, L(0))

  // ── 3 Drone hops ──────────────────────────────────────────────────────────
  b.addRoom(23, 1, 11, 4, 'combat', 'shuttle', L(0))
  b.pits(23, 1, 33, 4)
  island(23, 1, 24, 4, L(0))
  island(28, 1, 28, 4, L(0))
  island(32, 1, 33, 4, L(0))
  const ferry = 2.4 + rng() * 0.6
  const dwell = 1.3
  const off = rng() * (ferry + dwell) * 2
  lift({ kind: 'h', ax: cellCenter(25), ay: L(0), az: cellCenter(2), bx: cellCenter(27), by: L(0), bz: cellCenter(2), travel: ferry, wait: dwell, phase: off, room: 2 })
  lift({ kind: 'h', ax: cellCenter(29), ay: L(0), az: cellCenter(3), bx: cellCenter(31), by: L(0), bz: cellCenter(3), travel: ferry, wait: dwell, phase: off + ferry + dwell * 0.5, room: 2 })
  b.checkpoint(23, 2, YAW_PX, cells(23, 1, 24, 4))
  b.checkpoint(28, 2, YAW_PX, cells(28, 1, 28, 4))
  b.foe('flyer', 28, 1, YAW_NX, [23, 1, 33, 4], [L(0), L(1)], 'hornet')
  b.foe('turret', 33, 4, YAW_NX, [33, 4, 33, 4])
  b.corridor(33, 5, 0, 1, 2, L(0))

  // ── 4 Hornet nest ─────────────────────────────────────────────────────────
  b.addRoom(29, 7, 5, 8, 'combat', 'hall', L(0))
  b.level(30, 9, 30, 9, L(0) + 2.5)
  b.level(32, 11, 32, 11, L(0) + 2.5)
  b.chest(33, 14, YAW_PX)
  b.checkpoint(31, 7, YAW_PZ, cells(30, 7, 32, 8))
  b.foe('flyer', 31, 10, YAW_NZ, [29, 7, 33, 14], [L(0), L(1)], 'hornet')
  b.foe('flyer', 29, 13, YAW_NZ, [29, 7, 33, 14], [L(0), L(1)], 'hornet')
  b.foe('ground', 32, 13, YAW_NX, [29, 12, 33, 14])
  b.foe('turret', 29, 7, YAW_PZ, [29, 7, 29, 7])
  b.corridor(28, 12, -1, 0, 2, L(0))

  // ── 5 Drone lift ──────────────────────────────────────────────────────────
  b.addRoom(17, 9, 10, 4, 'combat', 'lift', L(0))
  b.pits(17, 9, 26, 12)
  island(24, 9, 26, 12, L(0))
  island(20, 9, 22, 12, L(1))
  island(17, 9, 18, 12, L(2))
  const bob = 2 + rng() * 0.4
  lift({ kind: 'v', loop: true, ax: cellCenter(23), ay: L(0), az: cellCenter(10), bx: cellCenter(23), by: L(1), bz: cellCenter(10), travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 4 })
  lift({ kind: 'v', loop: true, ax: cellCenter(19), ay: L(1), az: cellCenter(11), bx: cellCenter(19), by: L(2), bz: cellCenter(11), travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 4 })
  b.checkpoint(25, 11, YAW_NX, cells(24, 9, 26, 12))
  b.checkpoint(21, 10, YAW_NX, cells(20, 9, 22, 12))
  b.foe('flyer', 21, 12, YAW_NX, [17, 9, 26, 12], [L(0), L(2)], 'hornet')
  b.corridor(16, 10, -1, 0, 2, L(2))

  // ── 6 Flight deck ─────────────────────────────────────────────────────────
  b.addRoom(11, 9, 5, 4, 'combat', 'cart', L(2))
  b.checkpoint(14, 10, YAW_NX, cells(12, 9, 15, 11))
  b.foe('flyer', 12, 10, YAW_PZ, [11, 9, 15, 12], [L(2), L(2) + 2], 'hornet')
  b.corridor(13, 13, 0, 1, 1, L(2))

  // ── 7 The flight ──────────────────────────────────────────────────────────
  // One open span: the quadcopter waits on the boarding island at its
  // north edge, flies a loop (a climb east, a dip west, a climb, a drop)
  // and lands on the exit island in the south-west corner. Turrets on
  // pylons; hornets come in waves while it flies.
  b.addRoom(3, 14, 22, 18, 'combat', 'rail', L(2))
  b.pits(3, 14, 24, 31)
  island(12, 14, 14, 15, L(2))
  island(5, 30, 7, 31, L(1))
  island(9, 17, 9, 17, L(3))
  island(18, 24, 18, 24, 10)
  island(16, 31, 16, 31, 14)
  b.foe('turret', 9, 17, YAW_PZ, [9, 17, 9, 17])
  b.foe('turret', 18, 24, YAW_PZ, [18, 24, 18, 24])
  b.foe('turret', 16, 31, YAW_NZ, [16, 31, 16, 31])
  const points = railCourse([
    [13, 15, L(2)], [13, 18, L(2)], [22, 18, 18], [22, 22, 18], [8, 22, 10], [8, 26, 10],
    [21, 26, 16], [21, 29, 16], [10, 29, L(1)], [6, 29, L(1)], [6, 30, L(1)]
  ])
  b.rails.push({ points, speed: 7.4 + rng() * 0.6, room: 6, boardAt: { i: 13, j: 15 }, exitAt: { i: 6, j: 30 } })
  b.link([13, 15], [6, 30], 'rail')
  b.waves.push({ room: 6, trigger: 'rail', kind: 'hornet', count: 2, every: 6, total: 4 })
  // The boarding island: where a fall (or a resume) mid-flight puts Flux.
  b.checkpoint(13, 14, YAW_PZ, cells(12, 14, 14, 15))
  b.checkpoint(6, 31, YAW_PZ, cells(5, 30, 7, 31))
  b.corridor(6, 32, 0, 1, 2, L(1))

  // ── 8 Wind tunnel ─────────────────────────────────────────────────────────
  b.addRoom(4, 34, 5, 10, 'combat', 'wind', L(1))
  for (const [i, j] of [[5, 37], [7, 39], [5, 41]] as const) b.level(i, j, i, j, L(1) + 4)
  b.wind.push({ i0: 4, j0: 35, i1: 8, j1: 42, dx: 0, dz: -1, strength: 3.4 + rng() * 0.5, on: 2.5 + rng() * 0.6, off: 2.4 + rng() * 0.4, phase: rng() * 6, room: room() })
  b.rewards.push({ x: cellCenter(5), z: cellCenter(38), y: L(1), room: 7, kind: 'we' })
  b.checkpoint(6, 34, YAW_PZ, cells(4, 34, 8, 34))
  b.foe('turret', 8, 43, YAW_NZ, [8, 43, 8, 43])
  b.foe('ground', 4, 43, YAW_NZ, [4, 42, 6, 43])
  b.corridor(9, 43, 1, 0, 2, L(1))

  // ── 9 Hangar ──────────────────────────────────────────────────────────────
  b.addRoom(11, 40, 9, 6, 'combat', 'hall', L(1))
  b.level(14, 42, 14, 42, L(1) + 2.5)
  b.level(17, 44, 17, 44, L(1) + 2.5)
  b.checkpoint(12, 43, YAW_PX, cells(11, 42, 12, 44))
  b.foe('flyer', 15, 41, YAW_NX, [11, 40, 19, 45], [L(1), L(2)], 'hornet')
  b.foe('flyer', 18, 43, YAW_NX, [11, 40, 19, 45], [L(1), L(2)], 'hornet')
  b.foe('ground', 16, 45, YAW_NX, [15, 44, 19, 45])
  b.foe('turret', 19, 40, YAW_NX, [19, 40, 19, 40])
  b.corridor(20, 42, 1, 0, 2, L(1))

  // ── 10 Weapon gantry ──────────────────────────────────────────────────────
  b.addRoom(22, 40, 8, 6, 'combat', 'islands', L(1))
  b.pits(22, 40, 29, 45)
  island(22, 40, 23, 45, L(1))
  island(25, 42, 26, 45, L(1))
  island(28, 42, 29, 45, L(1))
  island(25, 40, 26, 40, L(1))
  leaps(23, 0, 1, 0, [42, 43, 44])
  leaps(26, 0, 1, 0, [42, 43, 44])
  leaps(0, 42, 0, -1, [25, 26], true)
  b.rewards.push({ x: cellCenter(26), z: cellCenter(40), y: L(1), room: 9, kind: 'weapon' })
  b.checkpoint(22, 43, YAW_PX, cells(22, 42, 23, 44))
  b.checkpoint(28, 44, YAW_PX, cells(28, 43, 29, 45))
  b.foe('flyer', 27, 41, YAW_PZ, [22, 40, 29, 45], [L(1), L(2)], 'hornet')
  b.corridor(30, 43, 1, 0, 2, L(1))

  // ── 11 Hangar drop ────────────────────────────────────────────────────────
  b.addRoom(32, 40, 8, 6, 'combat', 'descent', L(1))
  b.level(35, 40, 37, 45, L(0))
  b.level(38, 40, 39, 45, L(0) - STOREY)
  b.checkpoint(33, 43, YAW_PX, cells(32, 42, 34, 44))
  b.checkpoint(38, 42, YAW_NZ, cells(38, 41, 39, 43))
  b.foe('ground', 36, 44, YAW_PX, [35, 40, 37, 45])
  b.foe('flyer', 38, 45, YAW_NZ, [32, 40, 39, 45], [L(0) - STOREY, L(1)], 'hornet')
  b.corridor(38, 39, 0, -1, 2, L(0) - STOREY)

  // ── 12 Parts store ────────────────────────────────────────────────────────
  // Behind the north wall, a secret alcove (shoot the buttons).
  const LOW = L(0) - STOREY
  b.addRoom(32, 30, 8, 8, 'combat', 'hall', LOW)
  b.chest(32, 37, YAW_NX)
  b.checkpoint(38, 36, YAW_NZ, cells(37, 35, 39, 37))
  b.foe('ground', 35, 33, YAW_PZ, [32, 30, 39, 37])
  b.foe('flyer', 34, 35, YAW_NZ, [32, 30, 39, 37], [LOW, LOW + 3], 'hornet')
  b.secret(11, 'color', [32, 29, 33, 29], { i: 33, j: 29, axis: 'z' },
    [[32, 31, 'w', 1], [35, 30, 'n', 0], [37, 30, 'n', 1], [39, 33, 'e', 2]], [], 'tank', 1)
  b.corridor(40, 34, 1, 0, 2, LOW)

  // ── 13 Approach ───────────────────────────────────────────────────────────
  b.addRoom(42, 30, 6, 8, 'combat', 'hall', 0)
  b.level(42, 30, 43, 37, LOW)
  for (let j = 30; j <= 37; j++) b.stair(44, j, Ramp.NX, 0, LOW)
  b.checkpoint(42, 34, YAW_PX, cells(42, 33, 43, 35))
  b.checkpoint(46, 31, YAW_NZ, cells(45, 30, 47, 31))
  b.foe('ground', 46, 35, YAW_NZ, [45, 30, 47, 37])
  b.foe('flyer', 45, 33, YAW_NZ, [42, 30, 47, 37], [0, LOW + 2], 'hornet')
  b.corridor(46, 29, 0, -1, 2, 0, true)

  // ── 14 Arena ──────────────────────────────────────────────────────────────
  b.addRoom(42, 21, 7, 7, 'boss', 'arena', 0)
  // The Master's fans: now and then a gust across the arena (Flux only).
  b.wind.push({ i0: 42, j0: 21, i1: 48, j1: 27, dx: -1, dz: 0, strength: 2.6, on: 2, off: 8, phase: 3, room: room() })

  // The beam-in room: south of the pad, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  // Open sky under the airfield: a fall is the rescue's.
  map.terrain!.clouds = true
  return rng() < 0.5 ? mirrorX(map) : map
}
