import { CELL, Ramp, cellCenter, type MapData, type Lift } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'
import { railCourse } from './volt'

/**
 * ─── Deep Mine (the drill sector's story stage) ─────────────────────────────
 *
 * The Drill Master's mine, top to bottom: from the headframe at 18 m down
 * terraces, a mine elevator and a rockfall tunnel to the arena at 0. Its
 * gimmicks:
 *
 *  - boulders: a plain one is a wall; a cracked one (glowing amber seams)
 *    gives way to a full charge (level 2+) or a Drill Bomb — caches, the
 *    borrowed weapon's cave (the ice pillars of the Glacier, in stone:
 *    `sim/stages/icePillars.ts` on the drill theme);
 *  - stalactites that drop on a rhythm behind a growing shadow ring (the
 *    Glacier's icicles in stone);
 *  - Mole Drillers that tunnel under the floor and burst up under Flux.
 *
 *   1 Headframe       the pad, a Mole Driller waiting half dug in
 *   2 Rock gallery    a cache behind cracked boulders (a full charge)
 *   3 Terraces        drops a storey at a time under falling stalactites
 *   4 Mine elevator   a lift down two storeys over the shaft
 *   5 Rockfall tunnel stalactites in a row, boulders to duck behind
 *   6 Chasm           islands over one-cell gaps; a crumbling slab — or the
 *                     MINE CART (#111): up a trestle over the chasm, down
 *                     the steep drop, north through the corridor and across
 *   7 Mole warren     a fight among boulders: three Mole Drillers (the
 *                     cart's run ends at the warren's west door)
 *   8 Weapon cave     the borrowed weapon sealed behind cracked rock
 *   9 Stair descent   down a flight under stalactites
 *  10 Lamp gallery    a secret alcove behind its south wall
 *  11 Approach        down to the boss shutter
 *  12 Arena           the Drill Master, floor at y = 0, rocks falling (on
 *                     Flux only: the Master is at home)
 *
 * Every leap gap is one cell between equal floors, each with its `link`.
 * Deterministic from the seed: the hand, the lift's pace and the rockfall's
 * rhythm vary — never the route.
 */

const GRID_W = 34
const GRID_H = 38
/** The headframe's floor and one storey (m). */
const TOP_Y = 18
const STOREY = 3

export const generateDeepMine = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x51d7e)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => TOP_Y - n * STOREY
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
  const boulder = (i: number, j: number, cracked: boolean) => { b.icePillars.push({ i, j, cracked, room: room() }) }
  const rockfall = (i: number, j: number, period: number, phase: number) => {
    b.icicles.push({ i, j, y: b.floor[b.k(i, j)]!, period, phase, room: room() })
  }
  const beat = () => 3.4 + rng() * 0.8

  // ── 1 Headframe ───────────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', L(0))
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.foe('ground', 4, 4, YAW_NX, [3, 3, 6, 5], undefined, 'mole')
  b.corridor(7, 2, 1, 0, 2, L(0))

  // ── 2 Rock gallery ────────────────────────────────────────────────────────
  // A plain boulder in the way, and in the far corner a cache sealed by two
  // cracked ones: the first lesson in a full charge.
  b.addRoom(9, 1, 12, 4, 'combat', 'hall', L(0))
  boulder(13, 2, false)
  boulder(20, 3, true)
  boulder(19, 4, true)
  b.rewards.push({ x: cellCenter(20), z: cellCenter(4), y: L(0), room: 1, kind: 'we' })
  b.chest(9, 4, YAW_NX)
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 3))
  b.foe('ground', 16, 3, YAW_NX, [14, 1, 18, 4], undefined, 'mole')
  b.foe('turret', 18, 1, YAW_NX, [18, 1, 18, 1])
  b.corridor(21, 2, 1, 0, 2, L(0))

  // ── 3 Terraces ────────────────────────────────────────────────────────────
  // Three terraces a storey apart, east and down; a stalactite over each.
  b.addRoom(23, 1, 10, 4, 'combat', 'descent', L(0))
  b.level(26, 1, 28, 4, L(1))
  b.level(29, 1, 32, 4, L(2))
  rockfall(24, 2, beat(), rng() * 4)
  rockfall(27, 3, beat(), rng() * 4)
  rockfall(30, 2, beat(), rng() * 4)
  b.checkpoint(23, 2, YAW_PX, cells(23, 1, 25, 1))
  b.checkpoint(31, 3, YAW_PZ, cells(31, 3, 32, 4))
  b.foe('flyer', 27, 1, YAW_NX, [23, 1, 32, 4], [L(2), L(0)])
  b.foe('ground', 32, 2, YAW_NX, [29, 1, 32, 4], undefined, 'mole')
  b.corridor(31, 5, 0, 1, 2, L(2))

  // ── 4 Mine elevator ───────────────────────────────────────────────────────
  // The top landing, the shaft (a row of pit), the bottom landing two
  // storeys down: two cages ride it, out of step.
  b.addRoom(29, 7, 4, 6, 'combat', 'lift', L(2))
  b.pits(29, 9, 32, 9)
  b.level(29, 10, 32, 12, L(4))
  const ride = 2.6 + rng() * 0.6
  const wait = 1.4
  const ph = rng() * (ride + wait) * 2
  lift({
    kind: 'v', loop: true, ax: cellCenter(30), ay: L(2), az: cellCenter(9), bx: cellCenter(30), by: L(4), bz: cellCenter(9),
    travel: ride, wait, phase: ph, room: 3
  })
  lift({
    kind: 'v', loop: true, ax: cellCenter(31), ay: L(2), az: cellCenter(9), bx: cellCenter(31), by: L(4), bz: cellCenter(9),
    travel: ride, wait, phase: ph + ride + wait, room: 3
  })
  b.checkpoint(30, 7, YAW_PZ, cells(29, 7, 32, 8))
  b.checkpoint(30, 11, YAW_PZ, cells(29, 10, 32, 12))
  b.foe('ground', 32, 12, YAW_NZ, [29, 10, 32, 12], undefined, 'mole')
  b.corridor(31, 13, 0, 1, 2, L(4))

  // ── 5 Rockfall tunnel ─────────────────────────────────────────────────────
  // Stalactites in a row down the tunnel, out of step; two boulders to wait
  // behind. The way on is west, halfway down.
  b.addRoom(29, 15, 4, 6, 'combat', 'icicles', L(4))
  boulder(29, 17, false)
  boulder(32, 19, false)
  const tb = beat()
  rockfall(30, 16, tb, 0)
  rockfall(31, 17, tb, tb * 0.33)
  rockfall(30, 18, tb, tb * 0.66)
  b.checkpoint(31, 15, YAW_PZ, cells(29, 15, 32, 15))
  b.foe('turret', 32, 20, YAW_NZ, [32, 20, 32, 20])
  b.corridor(28, 18, -1, 0, 2, L(4))

  // ── 6 Chasm ───────────────────────────────────────────────────────────────
  // Islands west over one-cell gaps; a crumbling slab bridges the middle
  // gap's north cell (or leap it); the way on is north off the last one.
  b.addRoom(13, 17, 14, 4, 'combat', 'islands', L(4))
  b.pits(13, 17, 26, 20)
  island(24, 17, 26, 20, L(4))
  island(21, 17, 22, 20, L(4))
  island(18, 17, 19, 20, L(4))
  island(13, 17, 16, 20, L(4))
  leaps(24, 0, -1, 0, [18, 19, 20])
  leaps(21, 0, -1, 0, [18, 19, 20])
  leaps(18, 0, -1, 0, [18, 19, 20])
  b.crumble(20, 17, L(4), 1, 1)
  rockfall(18, 19, beat(), rng() * 4)
  b.rewards.push({ x: cellCenter(21), z: cellCenter(20), y: L(4), room: 5, kind: 'bolts' })
  b.checkpoint(25, 18, YAW_NX, cells(24, 17, 26, 20))
  b.checkpoint(14, 19, YAW_NX, cells(13, 18, 16, 20))
  b.foe('flyer', 19, 17, YAW_NX, [13, 17, 26, 20], [L(4), L(3)])
  b.foe('ground', 15, 20, YAW_NX, [13, 17, 16, 20], undefined, 'mole')
  b.corridor(14, 16, 0, -1, 2, L(4))
  // The mine cart (#111): it waits where the corridor comes in, climbs onto a
  // trestle over the chasm, takes the steep drop, turns north through the
  // corridor and runs across the Mole Warren to its west door. The islands
  // stay a walk for whoever steps past it.
  const mine = railCourse([
    [26, 18, L(4)], [22, 18, L(4) + 2.4], [17, 18, L(4) + 2.4], [14, 18, L(4)], [14, 12, L(4)], [9, 12, L(4)]
  ])
  b.rails.push({ points: mine, speed: 5, room: 5, boardAt: { i: 26, j: 18 }, exitAt: { i: 9, j: 12 } })
  b.link([26, 18], [9, 12], 'rail')

  // ── 7 Mole warren ─────────────────────────────────────────────────────────
  b.addRoom(9, 9, 8, 6, 'combat', 'hall', L(4))
  boulder(11, 11, false)
  boulder(14, 11, false)
  b.chest(16, 9, YAW_PX)
  b.checkpoint(14, 13, YAW_NZ, cells(13, 13, 15, 14))
  b.foe('ground', 10, 10, YAW_PZ, [9, 9, 16, 14], undefined, 'mole')
  b.foe('ground', 13, 12, YAW_PZ, [9, 9, 16, 14], undefined, 'mole')
  b.foe('ground', 15, 10, YAW_PZ, [9, 9, 16, 14], undefined, 'mole')
  b.foe('turret', 9, 9, YAW_PZ, [9, 9, 9, 9])
  b.corridor(8, 12, -1, 0, 2, L(4))

  // ── 8 Weapon cave ─────────────────────────────────────────────────────────
  // The borrowed Core Master weapon in a side cave, sealed by cracked rock.
  b.addRoom(1, 11, 6, 7, 'combat', 'hall', L(4))
  boulder(3, 11, true)
  boulder(3, 12, true)
  boulder(1, 13, true)
  boulder(2, 13, true)
  b.rewards.push({ x: cellCenter(1), z: cellCenter(11), y: L(4), room: 7, kind: 'weapon' })
  b.checkpoint(5, 12, YAW_NX, cells(4, 13, 6, 14))
  b.foe('ground', 4, 15, YAW_NZ, [3, 14, 6, 17], undefined, 'mole')
  b.foe('flyer', 5, 16, YAW_NZ, [1, 11, 6, 17], [L(4), L(3)])
  b.corridor(3, 18, 0, 1, 2, L(4))

  // ── 9 Stair descent ───────────────────────────────────────────────────────
  b.addRoom(1, 20, 10, 5, 'combat', 'descent', L(4))
  for (let i = 1; i <= 10; i++) b.stair(i, 22, Ramp.NZ, L(5), STOREY)
  b.level(1, 23, 10, 24, L(5))
  rockfall(4, 23, beat(), rng() * 4)
  rockfall(7, 23, beat(), rng() * 4)
  b.checkpoint(3, 20, YAW_PZ, cells(1, 20, 5, 20))
  b.checkpoint(5, 24, YAW_PX, cells(1, 24, 6, 24))
  b.foe('ground', 8, 24, YAW_NX, [6, 23, 10, 24], undefined, 'mole')
  b.foe('turret', 10, 20, YAW_NX, [10, 20, 10, 20])
  b.corridor(11, 23, 1, 0, 2, L(5))

  // ── 10 Lamp gallery ───────────────────────────────────────────────────────
  // Behind the south wall, a secret alcove (shoot the buttons).
  b.addRoom(13, 22, 8, 5, 'combat', 'hall', L(5))
  b.chest(20, 22, YAW_PX)
  b.checkpoint(14, 24, YAW_PX, cells(13, 23, 14, 25))
  b.foe('ground', 17, 24, YAW_NX, [15, 22, 20, 26], undefined, 'mole')
  b.foe('flyer', 15, 23, YAW_NX, [13, 22, 20, 26], [L(5), L(4)])
  b.secret(9, 'color', [13, 27, 14, 27], { i: 14, j: 27, axis: 'z' },
    [[13, 26, 'w', 1], [16, 26, 's', 0], [18, 26, 's', 1], [20, 25, 'e', 2]], [], 'tank', 1)
  b.corridor(21, 24, 1, 0, 2, L(5))

  // ── 11 Approach ───────────────────────────────────────────────────────────
  b.addRoom(23, 22, 7, 6, 'combat', 'hall', 0)
  b.level(23, 22, 24, 27, L(5))
  for (let j = 22; j <= 27; j++) b.stair(25, j, Ramp.NX, 0, L(5))
  b.checkpoint(24, 24, YAW_PX, cells(23, 23, 24, 26))
  b.checkpoint(28, 26, YAW_PZ, cells(26, 26, 29, 26))
  b.foe('ground', 28, 23, YAW_NZ, [26, 22, 29, 27], undefined, 'mole')
  b.foe('flyer', 27, 25, YAW_NZ, [23, 22, 29, 27], [0, STOREY])
  b.corridor(27, 28, 0, 1, 2, 0, true)

  // ── 12 Arena ──────────────────────────────────────────────────────────────
  b.addRoom(24, 30, 7, 7, 'boss', 'arena', 0)
  const ab = 4.6
  rockfall(26, 32, ab, 0)
  rockfall(28, 34, ab, ab / 3)
  rockfall(29, 31, ab, (ab * 2) / 3)

  // The beam-in room: south of the headframe, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
