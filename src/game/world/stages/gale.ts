import { CELL, Ramp, cellCenter, type MapData, type Lift } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Sky Docks (the gale sector's story stage) ──────────────────────────────
 *
 * Floating docks high over a sea of clouds, the Gale Master's airfield. Each
 * section is a walled "screen" whose islands stand over open sky (pit cells,
 * `Terrain.clouds`): a fall is a pit fall, back to the section's checkpoint.
 * No jump — the verbs are the dash leap (a slide off an edge carries over a
 * ONE-cell gap at the same height, never two), shuttles, bobbing platforms,
 * ladders and drops:
 *
 *   1 Dock pad        the pad, a view down, a turret on the far pier
 *   2 First leaps     three islands across one-cell gaps (dash leaps)
 *   3 Shuttle chain   two shuttles over three-cell gaps, a pier between
 *   4 Wind tunnel     a walled tunnel, gusts blowing back at Flux on the
 *                     clock (`sim/stages/wind.ts`); wind-break pillars give
 *                     shelter in their lee. Solid floor: a gust shoves him
 *                     back, never off anything.
 *   5 Bobbing docks   platforms bobbing on the clock (`Lift.loop`) lift him
 *                     a storey at a time, Rotor Drones about
 *   6 Turbine towers  a ladder up a turbine column; a side ladder to a
 *                     reward ledge with a chest
 *   7 Last leaps      more leaps; a harder side chain (a one-cell island
 *                     mid-way) to the far island with the borrowed weapon
 *   8 Cargo drops     terraces a storey apart, down to the lower docks; a
 *                     secret alcove behind a false wall
 *   9 Approach bridge a narrow bridge stepping down over the void to the
 *                     boss shutter
 *  10 Arena           the Gale Master, floor at y = 0
 *
 * Heights: the docks at 6 m, up to 15 m by the bobbing platforms and the
 * ladder, and back down by drops and the bridge's stairs to the arena at 0.
 * Every leap gap is exactly one cell between equal floors, and each has a
 * `link` so the objective trail crosses it. Deterministic from the seed: the
 * seed varies the hand (a mirrored layout), the shuttles' and the bobbing
 * platforms' pace, and the gusts' rhythm and strength — never the route.
 */

const GRID_W = 41
const GRID_H = 34
/** One storey (m): a ladder, a bobbing platform's ride, a drop. */
const STOREY = 3
/** The docks' base height: the first four sections stand at 6 m. */
const DOCK_Y = 6
/** A wind-break pillar stands this high over the tunnel floor (m). */
const PILLAR_H = 4

export const generateSkyDocks = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x6a1e)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => DOCK_Y + n * STOREY
  const half = STOREY / 2
  /** Floor back over a rectangle of a room that was all pits (an island). */
  const island = (i0: number, j0: number, i1: number, j1: number, y: number) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b.pit[b.k(i, j)] = 0
    b.level(i0, j0, i1, j1, y)
  }
  /** Leap links over one-cell gaps: from (i, j) two cells along (di, dj),
   *  for each j (or i) in the span. */
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

  // ── 1 Dock pad ────────────────────────────────────────────────────────────
  // The pad, the rail-less edge to the south (a first look down), a turret
  // on the far pier. The way on at the north-east corner.
  b.addRoom(1, 1, 6, 5, 'start', 'dock', L(0))
  b.pits(1, 5, 4, 5)
  b.foe('turret', 6, 4, YAW_NX, [6, 4, 6, 4])
  b.foe('ground', 4, 2, YAW_NX, [3, 1, 5, 3])
  b.checkpoint(2, 3, YAW_PX, [[1, 2], [2, 2], [1, 3], [2, 3]])
  b.corridor(7, 2, 1, 0, 2, L(0))

  // ── 2 First leaps ─────────────────────────────────────────────────────────
  // Four islands in a row, a one-cell gap between each two: the dash leap,
  // taught where a miss costs only this section. The middle islands leave
  // a row of sky on alternate sides, so they read as islands.
  b.addRoom(9, 1, 14, 4, 'combat', 'islands', L(0))
  b.pits(9, 1, 22, 4)
  island(9, 1, 10, 4, L(0))
  island(12, 1, 13, 3, L(0))
  island(15, 2, 16, 4, L(0))
  island(18, 1, 22, 4, L(0))
  leaps(10, 0, 1, 0, [1, 2, 3])
  leaps(13, 0, 1, 0, [2, 3])
  leaps(16, 0, 1, 0, [2, 3, 4])
  // The last gap of the first leaps holds a crumbling slab in its middle row
  // (the other two stay open sky): a bridge that only lasts a moment.
  b.crumble(17, 3, L(0), 1, 1)
  b.rewards.push({ x: cellCenter(13), z: cellCenter(1), y: L(0), room: 1, kind: 'bolts' })
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 4))
  b.foe('flyer', 16, 3, YAW_NX, [9, 1, 22, 4], [L(0), L(1)])
  b.foe('flyer', 20, 1, YAW_NX, [9, 1, 22, 4], [L(0), L(1)])
  // In the far island's corner, off the walk to the way on.
  b.chest(22, 1, YAW_PX)
  b.corridor(23, 2, 1, 0, 2, L(0))

  // ── 3 Shuttle chain ───────────────────────────────────────────────────────
  // Three cells of sky, a one-cell pier, three more: too wide to leap, so
  // two shuttles ferry across, the second out of step with the first.
  b.addRoom(25, 1, 11, 4, 'combat', 'shuttle', L(0))
  b.pits(25, 1, 35, 4)
  island(25, 1, 26, 4, L(0))
  island(30, 1, 30, 4, L(0))
  island(34, 1, 35, 4, L(0))
  const ferry = 2.4 + rng() * 0.6
  const dwell = 1.3
  const off = rng() * (ferry + dwell) * 2
  lift({
    kind: 'h', ax: cellCenter(27), ay: L(0), az: cellCenter(2), bx: cellCenter(29), by: L(0), bz: cellCenter(2),
    travel: ferry, wait: dwell, phase: off, room: 2
  })
  lift({
    kind: 'h', ax: cellCenter(31), ay: L(0), az: cellCenter(3), bx: cellCenter(33), by: L(0), bz: cellCenter(3),
    travel: ferry, wait: dwell, phase: off + ferry + dwell * 0.5, room: 2
  })
  b.checkpoint(25, 2, YAW_PX, cells(25, 1, 26, 4))
  b.checkpoint(30, 2, YAW_PX, cells(30, 1, 30, 4))
  b.foe('flyer', 30, 1, YAW_NX, [25, 1, 35, 4], [L(0), L(1)])
  b.foe('turret', 35, 4, YAW_NX, [35, 4, 35, 4])
  b.corridor(34, 5, 0, 1, 2, L(0))

  // ── 4 Wind tunnel ─────────────────────────────────────────────────────────
  // A long walled tunnel, solid floor wall to wall. The gusts blow back up
  // it toward the entrance (against the walk), on for a few seconds, then
  // calm; four wind-break pillars in a zigzag give shelter in their lee.
  b.addRoom(32, 7, 4, 11, 'combat', 'wind', L(0))
  for (const [i, j] of [[33, 10], [34, 12], [33, 14], [34, 16]] as const) b.level(i, j, i, j, L(0) + PILLAR_H)
  const on = 2.6 + rng() * 0.8
  b.wind.push({
    i0: 32, j0: 8, i1: 35, j1: 16, dx: 0, dz: -1, strength: 3.6 + rng() * 0.6,
    on, off: 2.4 + rng() * 0.4, phase: rng() * 6, room: 3
  })
  // A pickup in the lee of the third pillar: shelter pays.
  b.rewards.push({ x: cellCenter(33), z: cellCenter(13), y: L(0), room: 3, kind: 'bolts' })
  b.checkpoint(34, 7, YAW_PZ, cells(32, 7, 35, 7))
  b.foe('turret', 35, 17, YAW_NZ, [35, 17, 35, 17])
  b.foe('ground', 32, 17, YAW_NZ, [32, 15, 35, 17])
  b.corridor(33, 18, 0, 1, 2, L(0))

  // ── 5 Bobbing docks ───────────────────────────────────────────────────────
  // Each island a storey over the last; between them a platform bobs up and
  // down on the clock. Step on at the bottom, off at the top. Rotor Drones
  // patrol the heights.
  b.addRoom(22, 20, 13, 4, 'combat', 'lift', L(0))
  b.pits(22, 20, 34, 23)
  island(31, 20, 34, 23, L(0))
  island(27, 20, 29, 23, L(1))
  island(22, 20, 25, 23, L(2))
  const bob = 2 + rng() * 0.4
  lift({
    kind: 'v', loop: true, ax: cellCenter(30), ay: L(0), az: cellCenter(21), bx: cellCenter(30), by: L(1), bz: cellCenter(21),
    travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 4
  })
  lift({
    kind: 'v', loop: true, ax: cellCenter(26), ay: L(1), az: cellCenter(22), bx: cellCenter(26), by: L(2), bz: cellCenter(22),
    travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 4
  })
  b.checkpoint(33, 21, YAW_NX, cells(31, 20, 34, 23))
  b.checkpoint(28, 21, YAW_NX, cells(27, 20, 29, 23))
  b.foe('flyer', 28, 20, YAW_PX, [22, 20, 34, 23], [L(0), L(2)])
  b.foe('flyer', 24, 23, YAW_PX, [22, 20, 34, 23], [L(1), L(2)])
  b.corridor(21, 21, -1, 0, 2, L(2))

  // ── 6 Turbine towers ──────────────────────────────────────────────────────
  // The landing, a ladder up the turbine column to its deck and the way on;
  // a second ladder up a lone column to a reward ledge with a chest.
  b.addRoom(13, 19, 7, 6, 'combat', 'ladder', L(2))
  b.level(13, 19, 16, 21, L(3))
  b.pits(13, 22, 16, 22)
  b.pits(13, 23, 14, 24)
  b.level(15, 23, 16, 24, L(3))
  b.ladders.push({ i: 17, j: 20, di: -1, dj: 0, y0: L(2), y1: L(3), side: false })
  b.ladders.push({ i: 17, j: 24, di: -1, dj: 0, y0: L(2), y1: L(3), side: true })
  b.rewards.push({ x: cellCenter(15), z: cellCenter(24), y: L(3), room: 5, kind: 'hp' })
  b.chest(15, 23, YAW_NZ)
  b.checkpoint(18, 21, YAW_NX, cells(18, 19, 19, 24))
  b.foe('flyer', 18, 23, YAW_NX, [13, 19, 19, 24], [L(2), L(3)])
  b.foe('turret', 13, 19, YAW_PX, [13, 19, 13, 19])
  b.corridor(12, 20, -1, 0, 2, L(3))

  // ── 7 Last leaps ──────────────────────────────────────────────────────────
  // Two leaps on the way (west, then south); the side chain west over a
  // one-cell island to the far pier against the wall holds the borrowed
  // Core Master weapon: the harder ledge, the better prize.
  b.addRoom(1, 18, 10, 6, 'combat', 'islands', L(3))
  b.pits(1, 18, 10, 23)
  island(8, 19, 10, 21, L(3))
  island(5, 19, 6, 21, L(3))
  island(3, 19, 3, 20, L(3))
  island(1, 19, 1, 20, L(3))
  island(4, 23, 6, 23, L(3))
  leaps(8, 0, -1, 0, [19, 20, 21])
  b.crumble(7, 20, L(3), 1, 1)
  leaps(0, 21, 0, 1, [5, 6])
  leaps(5, 0, -1, 0, [19, 20], true)
  leaps(3, 0, -1, 0, [19, 20], true)
  b.rewards.push({ x: cellCenter(1), z: cellCenter(19), y: L(3), room: 6, kind: 'weapon' })
  b.checkpoint(9, 20, YAW_NX, cells(8, 19, 10, 21))
  b.checkpoint(5, 23, YAW_PZ, cells(4, 23, 6, 23))
  b.foe('flyer', 9, 21, YAW_NX, [1, 18, 10, 23], [L(3), L(3) + 2])
  b.foe('flyer', 6, 19, YAW_NX, [1, 18, 10, 23], [L(3), L(3) + 2])
  b.corridor(5, 24, 0, 1, 2, L(3))

  // ── 8 Cargo drops ─────────────────────────────────────────────────────────
  // Terraces a storey apart down to the lower docks: each edge a one-way
  // drop. A chest at a terrace's end; behind the bottom's back wall, a
  // secret alcove (shoot the green buttons).
  b.addRoom(1, 26, 8, 5, 'combat', 'descent', L(3))
  b.level(1, 27, 8, 27, L(2))
  b.level(1, 28, 8, 28, L(1))
  b.level(1, 29, 8, 30, L(0))
  b.pits(1, 27, 2, 28)
  b.rewards.push({ x: cellCenter(1), z: cellCenter(26), y: L(3), room: 7, kind: 'we' })
  b.chest(8, 27, YAW_PX)
  b.checkpoint(5, 26, YAW_PZ, cells(3, 26, 7, 26))
  b.checkpoint(4, 29, YAW_PX, cells(1, 29, 8, 30))
  b.foe('turret', 8, 28, YAW_NX, [8, 28, 8, 28])
  b.foe('turret', 7, 30, YAW_NZ, [7, 30, 7, 30])
  b.secret(7, 'color', [1, 31, 2, 31], { i: 2, j: 31, axis: 'z' },
    [[1, 29, 'w', 1], [4, 30, 's', 0], [6, 30, 's', 1], [8, 30, 'e', 2]], [], 'tank', 1)
  b.corridor(9, 29, 1, 0, 2, L(0))

  // ── 9 Approach bridge ─────────────────────────────────────────────────────
  // A two-cell bridge over the void, stepping down four half-storeys to the
  // landing in front of the boss shutter. Drones on the way down.
  b.addRoom(11, 26, 11, 7, 'combat', 'hall', 0)
  b.pits(11, 26, 21, 32)
  island(11, 29, 21, 30, 0)
  b.level(11, 29, 11, 30, L(0))
  for (let n = 0; n < 4; n++) {
    for (const j of [29, 30]) b.stair(12 + n, j, Ramp.NX, L(0) - half * (n + 1), half)
  }
  island(19, 27, 21, 32, 0)
  b.checkpoint(11, 29, YAW_PX, [[11, 29], [11, 30]])
  b.checkpoint(20, 29, YAW_PX, cells(19, 27, 21, 32))
  b.foe('flyer', 17, 29, YAW_NX, [11, 26, 21, 32], [0, L(0)])
  b.foe('flyer', 20, 31, YAW_NX, [11, 26, 21, 32], [0, STOREY])
  b.corridor(22, 29, 1, 0, 2, 0, true)

  // ── 10 Arena ──────────────────────────────────────────────────────────────
  b.addRoom(24, 26, 7, 7, 'boss', 'arena', 0)
  // The Gale Master's arena: now and then a gust sweeps across it — rarer
  // than the level's own, and it pushes only Flux.
  b.wind.push({ i0: 24, j0: 26, i1: 30, j1: 32, dx: 1, dz: 0, strength: 2.8, on: 2.2, off: 9, phase: 4, room: b.rooms.length - 1 })

  // The beam-in room: below the dock, on solid ground (its pits are the
  // dock's west half), the door into the dock's east half.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // Start: in the beam-in room, facing its door.
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  // The challenge room (`sim/challenge.ts`): north off the turbine column's
  // deck, a walled hangar at the deck's height reached along a walkway —
  // the door is in front of Flux as he comes up the ladder; the way on is
  // west.
  b.challengeRoom(5, { mouth: { i: 15, j: 19, di: 0, dj: -1 } })
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  map.terrain!.clouds = true
  return rng() < 0.5 ? mirrorX(map) : map
}
