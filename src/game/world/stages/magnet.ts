import { CELL, Ramp, cellCenter, type MapData, type Lift, type MagnetRail } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Polarity Works (the magnet sector's story stage) ───────────────────────
 *
 * The Magnet Master's steel foundry. Its gimmick is the magnet rail
 * (`sim/stages/magnet.ts`): a strip of floor whose field drags Flux along,
 * the chevrons scrolling the way it pulls, red or blue. Shooting a rail's
 * polarity panel flips it; some rails flip on the clock, flickering first.
 * Taught where a mistake costs nothing, then mixed with the leaps, the
 * shuttles and the crumbling slabs the earlier stages taught:
 *
 *   1 Foundry floor   the pad; a Polar Pup (the stage's machine) drifts in
 *   2 First rail      a long hall whose rail drags back at the door; a
 *                     panel on the wall by the entrance flips it to a ride
 *   3 Rail islands    islands over a one-cell gap each; a rail on one drags
 *                     toward the next gap (the leap is still his); a
 *                     crumbling slab bridges one gap
 *   4 Conveyor lanes  two rails side by side on the clock, out of step: one
 *                     carries him on while the other drags back; between
 *                     them, blocks to duck behind
 *   5 Pup gallery     a fight among cover blocks: Polar Pups, a turret
 *   6 Crane shuttles  two shuttles over three-cell gaps, a pier between
 *   7 Polarity trench a rail that drags back toward the door until its
 *                     panel is shot, then a one-cell trench to leap
 *   8 Weapon chain    islands, a clock rail; a side chain to the borrowed
 *                     Core Master weapon
 *   9 Slag terraces   steps down; a secret alcove behind a false wall
 *  10 Approach hall   down to the boss shutter, a last rail with a panel
 *  11 Arena           the Magnet Master, floor at y = 0, two rails flipping
 *                     on the clock (they drag only Flux)
 *
 * Every leap gap is one cell between equal floors, each with its `link`.
 * Deterministic from the seed: the hand (mirrored or not), the shuttles'
 * pace and the clock rails' rhythm vary — never the route.
 */

const GRID_W = 41
const GRID_H = 36
/** The foundry's floor, and one storey (m). */
const BASE_Y = 4
const STOREY = 3
/** A rail's drag (m/s): against it Flux still inches forward (walk 4.7). */
const DRAG = 3.0
/** Blocks between the conveyor lanes stand this high (m). */
const BLOCK_H = 2.5

export const generatePolarityWorks = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x3a6e7)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => BASE_Y + n * STOREY
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
  const rail = (o: Omit<MagnetRail, 'room'>): void => { b.magnets.push({ ...o, room: b.rooms.length - 1 }) }
  const clock = () => 3.6 + rng() * 1.2

  // ── 1 Foundry floor ───────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', L(0))
  b.foe('flyer', 5, 2, YAW_NX, [1, 1, 6, 5], [L(0), L(0) + 1], 'polar')
  b.foe('ground', 4, 4, YAW_NX, [3, 3, 6, 5])
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.corridor(7, 2, 1, 0, 2, L(0))

  // ── 2 First rail ──────────────────────────────────────────────────────────
  // Three calm cells at the door, then a rail the length of the hall that
  // drags back west. The panel on the north wall by the entrance flips it.
  b.addRoom(9, 1, 14, 4, 'combat', 'magnet', L(0))
  rail({ i0: 12, j0: 1, i1: 22, j1: 4, dx: -1, dz: 0, strength: DRAG, panel: { i: 11, j: 1, side: 'n' } })
  b.rewards.push({ x: cellCenter(17), z: cellCenter(4), y: L(0), room: 1, kind: 'bolts' })
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 4))
  b.foe('flyer', 16, 2, YAW_NX, [9, 1, 22, 4], [L(0), L(0) + 1], 'polar')
  b.foe('ground', 21, 3, YAW_NX, [19, 1, 22, 4])
  b.corridor(23, 2, 1, 0, 2, L(0))

  // ── 3 Rail islands ────────────────────────────────────────────────────────
  b.addRoom(25, 1, 11, 4, 'combat', 'islands', L(0))
  b.pits(25, 1, 35, 4)
  island(25, 1, 26, 4, L(0))
  island(28, 1, 29, 4, L(0))
  island(31, 1, 32, 4, L(0))
  island(34, 1, 35, 4, L(0))
  leaps(26, 0, 1, 0, [2, 3])
  leaps(29, 0, 1, 0, [2, 3])
  leaps(32, 0, 1, 0, [2, 3])
  // A rail on the third island drags toward the last gap: the edge-leap
  // still carries him over (the gap is one cell).
  rail({ i0: 31, j0: 1, i1: 32, j1: 4, dx: 1, dz: 0, strength: DRAG * 0.8 })
  // A crumbling slab bridges the middle gap's south half (or leap it).
  b.crumble(30, 3, L(0), 1, 2)
  b.checkpoint(25, 2, YAW_PX, cells(25, 1, 26, 4))
  b.checkpoint(31, 2, YAW_PX, cells(31, 1, 32, 4))
  b.foe('flyer', 28, 1, YAW_NX, [25, 1, 35, 4], [L(0), L(1)])
  b.foe('flyer', 34, 4, YAW_NX, [25, 1, 35, 4], [L(0), L(0) + 1], 'polar')
  b.chest(35, 1, YAW_PX)
  b.corridor(34, 5, 0, 1, 2, L(0))

  // ── 4 Conveyor lanes ──────────────────────────────────────────────────────
  // Two lanes down the hall, each a rail flipping on the clock, half a
  // period apart: one always carries him south. Blocks stand between them.
  b.addRoom(31, 7, 5, 6, 'combat', 'conveyor', L(0))
  const every = clock()
  const ph = rng() * every * 2
  rail({ i0: 31, j0: 8, i1: 32, j1: 12, dx: 0, dz: 1, strength: DRAG, every, phase: ph })
  rail({ i0: 34, j0: 8, i1: 35, j1: 12, dx: 0, dz: 1, strength: DRAG, every, phase: ph + every })
  for (const j of [9, 11]) b.level(33, j, 33, j, L(0) + BLOCK_H)
  b.checkpoint(33, 7, YAW_PZ, cells(31, 7, 35, 7))
  b.foe('flyer', 33, 10, YAW_NZ, [31, 7, 35, 12], [L(0), L(0) + 1], 'polar')
  b.corridor(33, 13, 0, 1, 2, L(0))

  // ── 5 Pup gallery ─────────────────────────────────────────────────────────
  // A fight: Polar Pups over a floor of cover blocks, a turret in the far
  // corner. Wait for the red, or break a shell with a full charge.
  b.addRoom(29, 15, 7, 4, 'combat', 'hall', L(0))
  for (const [i, j] of [[31, 16], [34, 16], [30, 17]] as const) b.level(i, j, i, j, L(0) + BLOCK_H)
  b.rewards.push({ x: cellCenter(35), z: cellCenter(18), y: L(0), room: 4, kind: 'we' })
  b.checkpoint(33, 15, YAW_PZ, cells(32, 15, 34, 15))
  b.foe('turret', 29, 18, YAW_PX, [29, 18, 29, 18])
  b.foe('flyer', 31, 17, YAW_NZ, [29, 15, 35, 18], [L(0), L(0) + 1], 'polar')
  b.foe('flyer', 35, 16, YAW_NX, [29, 15, 35, 18], [L(0), L(0) + 1], 'polar')
  b.foe('ground', 33, 18, YAW_NZ, [32, 17, 35, 18])
  b.corridor(33, 19, 0, 1, 2, L(0))

  // ── 6 Crane shuttles ──────────────────────────────────────────────────────
  b.addRoom(22, 21, 13, 4, 'combat', 'shuttle', L(0))
  b.pits(22, 21, 34, 24)
  island(31, 21, 34, 24, L(0))
  island(27, 21, 27, 24, L(0))
  island(22, 21, 23, 24, L(0))
  const ferry = 2.4 + rng() * 0.6
  const dwell = 1.3
  const off = rng() * (ferry + dwell) * 2
  lift({
    kind: 'h', ax: cellCenter(30), ay: L(0), az: cellCenter(22), bx: cellCenter(28), by: L(0), bz: cellCenter(22),
    travel: ferry, wait: dwell, phase: off, room: 5
  })
  lift({
    kind: 'h', ax: cellCenter(26), ay: L(0), az: cellCenter(23), bx: cellCenter(24), by: L(0), bz: cellCenter(23),
    travel: ferry, wait: dwell, phase: off + ferry + dwell * 0.5, room: 5
  })
  b.checkpoint(32, 22, YAW_NX, cells(31, 21, 34, 24))
  b.checkpoint(27, 22, YAW_NX, cells(27, 21, 27, 24))
  b.foe('flyer', 27, 24, YAW_NX, [22, 21, 34, 24], [L(0), L(0) + 1], 'polar')
  b.foe('turret', 22, 24, YAW_PX, [22, 24, 22, 24])
  b.corridor(21, 22, -1, 0, 2, L(0))

  // ── 7 Polarity trench ─────────────────────────────────────────────────────
  // The east half's rail drags back toward the door; its panel (north wall)
  // turns it into a run-up for the trench — a one-cell gap to leap.
  b.addRoom(9, 20, 11, 6, 'combat', 'magnet', L(0))
  rail({ i0: 15, j0: 20, i1: 19, j1: 25, dx: 1, dz: 0, strength: DRAG, panel: { i: 18, j: 20, side: 'n' } })
  b.pits(14, 20, 14, 25)
  leaps(15, 0, -1, 0, [21, 22, 23, 24])
  b.checkpoint(19, 22, YAW_NX, cells(17, 21, 19, 24))
  b.checkpoint(12, 22, YAW_NX, cells(9, 20, 13, 25))
  b.foe('ground', 10, 24, YAW_PX, [9, 20, 13, 25])
  b.foe('flyer', 16, 23, YAW_NX, [9, 20, 19, 25], [L(0), L(0) + 1], 'polar')
  b.chest(9, 20, YAW_NX)
  b.corridor(8, 22, -1, 0, 2, L(0))

  // ── 8 Weapon chain ────────────────────────────────────────────────────────
  // The landing (a clock rail dragging west toward the gaps, then back),
  // the way on south-west over one gap; the side chain north-west over
  // another to the borrowed weapon.
  b.addRoom(1, 19, 6, 8, 'combat', 'islands', L(0))
  b.pits(1, 19, 6, 26)
  island(5, 20, 6, 24, L(0))
  island(1, 23, 3, 26, L(0))
  island(1, 20, 3, 21, L(0))
  rail({ i0: 5, j0: 20, i1: 6, j1: 24, dx: -1, dz: 0, strength: DRAG * 0.8, every: clock(), phase: rng() * 8 })
  leaps(5, 0, -1, 0, [23, 24])
  leaps(5, 0, -1, 0, [20, 21], true)
  leaps(0, 21, 0, 1, [1, 2, 3])
  b.rewards.push({ x: cellCenter(1), z: cellCenter(20), y: L(0), room: 7, kind: 'weapon' })
  b.checkpoint(6, 22, YAW_NX, cells(5, 20, 6, 24))
  b.checkpoint(2, 24, YAW_PZ, cells(1, 23, 3, 26))
  b.foe('flyer', 2, 20, YAW_PZ, [1, 19, 6, 26], [L(0), L(0) + 1], 'polar')
  b.foe('flyer', 2, 25, YAW_NX, [1, 19, 6, 26], [L(0), L(1)])
  b.corridor(3, 27, 0, 1, 2, L(0))

  // ── 9 Slag terraces ───────────────────────────────────────────────────────
  // The foundry floor, a flight of steps down east to the slag deck, and
  // behind the deck's south wall a secret alcove (shoot the buttons).
  b.addRoom(1, 29, 10, 4, 'combat', 'descent', L(0))
  b.level(6, 29, 10, 32, L(0) - 2)
  for (let j = 29; j <= 32; j++) b.stair(5, j, Ramp.NX, L(0) - 2, 2)
  b.chest(9, 32, YAW_PZ)
  b.checkpoint(2, 29, YAW_PZ, cells(1, 29, 4, 29))
  b.checkpoint(8, 30, YAW_PX, cells(6, 29, 8, 31))
  b.foe('turret', 10, 29, YAW_NX, [10, 29, 10, 29])
  b.foe('ground', 8, 31, YAW_NX, [6, 29, 10, 32])
  b.secret(8, 'color', [1, 33, 2, 33], { i: 2, j: 33, axis: 'z' },
    [[1, 32, 'w', 1], [4, 32, 's', 0], [7, 32, 's', 1], [10, 31, 'e', 2]], [], 'tank', 1)
  b.corridor(11, 30, 1, 0, 2, L(0) - 2)

  // ── 10 Approach hall ───────────────────────────────────────────────────────
  // Steps down to the arena's floor, then a rail that drags back west until
  // its panel is shot; the boss shutter at the east end.
  b.addRoom(13, 27, 10, 7, 'combat', 'hall', 0)
  b.level(13, 27, 15, 33, L(0) - 2)
  for (let j = 27; j <= 33; j++) b.stair(16, j, Ramp.NX, 0, L(0) - 2)
  rail({ i0: 17, j0: 29, i1: 21, j1: 31, dx: -1, dz: 0, strength: DRAG, panel: { i: 19, j: 27, side: 'n' } })
  b.checkpoint(14, 30, YAW_PX, cells(13, 28, 15, 32))
  b.checkpoint(22, 30, YAW_PX, cells(22, 28, 22, 32))
  b.foe('flyer', 19, 28, YAW_NX, [13, 27, 22, 33], [0, STOREY], 'polar')
  b.foe('ground', 21, 32, YAW_NX, [17, 27, 22, 33])
  b.corridor(23, 30, 1, 0, 2, 0, true)

  // ── 11 Arena ──────────────────────────────────────────────────────────────
  b.addRoom(25, 27, 7, 7, 'boss', 'arena', 0)
  // Two rails across the arena, flipping on the clock half a beat apart:
  // they drag only Flux (the Master is its own pole).
  const ae = 3.5
  rail({ i0: 26, j0: 28, i1: 30, j1: 29, dx: 1, dz: 0, strength: DRAG * 0.75, every: ae, phase: 0 })
  rail({ i0: 26, j0: 31, i1: 30, j1: 32, dx: -1, dz: 0, strength: DRAG * 0.75, every: ae, phase: ae / 2 })

  // The beam-in room: south of the foundry floor, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
