import { CELL, Ramp, cellCenter, type MapData, type Lift, type WaterZone } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, POOL_DEEP, POOL_FREEBOARD, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Tidewater Locks (the tide sector's story stage) ─────────────────────────
 *
 * The Tide Master's harbour: up with the tide from the quay to the lock
 * gates 14 m up, then down the spillway to the arena. Its gimmick is water
 * (`sim/stages/water.ts`): wading slows Flux the deeper it is, and over his
 * chest it hurts — the tide rises on the clock (climb the steps before it
 * does), a lock stands flooded until its valve is shot, a canal's current
 * pushes against him.
 *
 *   1 Quay           the pad; a Puffer Mine (the stage's machine) drifting
 *   2 Shallows       wading taught: a knee-deep pool, no harm
 *   3 Tide steps     sealed behind him, flooded by its inlets on the clock:
 *                    three steps up out of the tide
 *   4 Buoys          two bobbing buoys lift him a storey at a time
 *   5 The lock       a flooded chamber; shoot the valve to drain it
 *   6 Channel        islands over one-cell gaps of open water
 *   7 Canal          wading against a current
 *   8 Puffer pool    a fight round a pool, mines drifting over it
 *   9 Weapon jetty   islands; a side leap to the borrowed weapon
 *  10 Spillway       terraces down, the water running with him
 *  11 Pump room      a secret alcove behind its south wall
 *  12 Approach       steps down to the boss shutter
 *  13 Arena          the Tide Master, floor at y = 0; once the shutter is
 *                    down a shallow tide rises and falls (it slows only
 *                    Flux), and drains when he is beaten
 *
 * Every leap gap is one cell between equal floors, each with its `link`.
 * Deterministic from the seed: the hand, the tide's rhythm and the buoys'
 * pace vary — never the route.
 */

const GRID_W = 34
const GRID_H = 45
/** The quay's floor and one storey (m). */
const QUAY_Y = 4
const STOREY = 3
/** The spillway's channels: one step deep (m), walked out of. */
const CHANNEL_DEEP = 0.5

export const generateTidewaterLocks = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x71de5)
  const b = new Builder(GRID_W, GRID_H)
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
  const water = (o: Omit<WaterZone, 'room'>): void => { b.water.push({ ...o, room: b.rooms.length - 1 }) }

  // ── 1 Quay ────────────────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', QUAY_Y)
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.foe('flyer', 5, 2, YAW_NX, [1, 1, 6, 5], [QUAY_Y, QUAY_Y + 1], 'puffer')
  b.foe('ground', 4, 4, YAW_NX, [3, 3, 6, 5])
  b.corridor(7, 2, 1, 0, 2, QUAY_Y)

  // ── 2 Shallows ────────────────────────────────────────────────────────────
  // A pool let into the floor across the room: down off the quay's edge,
  // knee-deep through it, up the ledge at the far end to the dry exit.
  b.addRoom(9, 1, 12, 4, 'combat', 'water', QUAY_Y)
  const shallows = b.pool(11, 1, 19, 4, QUAY_Y, 'e')
  water({ i0: 11, j0: 1, i1: 19, j1: 4, lo: shallows, hi: shallows })
  b.rewards.push({ x: cellCenter(17), z: cellCenter(4), y: QUAY_Y - POOL_DEEP, room: 1, kind: 'bolts' })
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 4))
  b.foe('flyer', 16, 2, YAW_NX, [9, 1, 20, 4], [QUAY_Y, QUAY_Y + 1], 'puffer')
  b.foe('ground', 19, 4, YAW_NX, [17, 1, 20, 4])
  b.corridor(21, 2, 1, 0, 2, QUAY_Y)

  // ── 3 Tide steps ──────────────────────────────────────────────────────────
  // Three steps east, each two metres over the last; the tide floods the
  // lowest out of his depth and laps at the middle one, then falls. A
  // flood: the door behind him shuts before the inlets open; on the top
  // step it drains and the door opens again.
  b.addRoom(23, 1, 10, 6, 'combat', 'water', QUAY_Y)
  for (let j = 1; j <= 6; j++) b.stair(26, j, Ramp.PX, QUAY_Y, 2)
  b.level(27, 1, 28, 6, QUAY_Y + 2)
  for (let j = 1; j <= 6; j++) b.stair(29, j, Ramp.PX, QUAY_Y + 2, 2)
  b.level(30, 1, 32, 6, QUAY_Y + 4)
  const tide = 9 + rng() * 2
  water({ i0: 23, j0: 1, i1: 32, j1: 6, lo: QUAY_Y - 0.3, hi: QUAY_Y + 2.2, period: tide, phase: rng() * tide, flood: true })
  b.checkpoint(23, 2, YAW_PX, cells(23, 1, 24, 2))
  b.checkpoint(31, 3, YAW_PZ, cells(30, 3, 32, 6))
  b.foe('flyer', 25, 4, YAW_NX, [23, 1, 32, 6], [QUAY_Y, QUAY_Y + 4], 'puffer')
  b.foe('flyer', 28, 2, YAW_NX, [23, 1, 32, 6], [QUAY_Y + 2, QUAY_Y + 5], 'puffer')
  b.foe('turret', 32, 1, YAW_NX, [32, 1, 32, 1])
  b.corridor(31, 7, 0, 1, 2, QUAY_Y + 4)

  // ── 4 Buoys ───────────────────────────────────────────────────────────────
  // Three landings a storey apart, a bobbing buoy in the open water between
  // each two: step on at the bottom, off at the top.
  const B0 = QUAY_Y + 4
  b.addRoom(29, 9, 4, 8, 'combat', 'lift', B0)
  b.pits(29, 11, 32, 11)
  b.pits(29, 14, 32, 14)
  b.level(29, 12, 32, 13, B0 + STOREY)
  b.level(29, 15, 32, 16, B0 + 2 * STOREY)
  const bob = 2.2 + rng() * 0.4
  lift({
    kind: 'v', loop: true, ax: cellCenter(30), ay: B0, az: cellCenter(11), bx: cellCenter(30), by: B0 + STOREY, bz: cellCenter(11),
    travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 3
  })
  lift({
    kind: 'v', loop: true, ax: cellCenter(31), ay: B0 + STOREY, az: cellCenter(14), bx: cellCenter(31), by: B0 + 2 * STOREY, bz: cellCenter(14),
    travel: bob, wait: 1.4, phase: rng() * (bob + 1.4) * 2, room: 3
  })
  water({ i0: 29, j0: 11, i1: 32, j1: 11, lo: B0 - 1.5, hi: B0 - 1.5 })
  water({ i0: 29, j0: 14, i1: 32, j1: 14, lo: B0 + STOREY - 1.5, hi: B0 + STOREY - 1.5 })
  b.checkpoint(30, 9, YAW_PZ, cells(29, 9, 32, 10))
  b.checkpoint(30, 12, YAW_PZ, cells(29, 12, 32, 13))
  b.foe('flyer', 32, 13, YAW_NX, [29, 9, 32, 16], [B0, B0 + 2 * STOREY], 'puffer')
  const TOP = B0 + 2 * STOREY
  b.corridor(28, 15, -1, 0, 2, TOP)

  // ── 5 The lock ────────────────────────────────────────────────────────────
  // A chamber a storey down between two ledges, flooded to just under
  // them (over his head). The valve on the north wall by the entrance
  // drains it for good. Five rows: a sixth lay open on the jetty's pits.
  b.addRoom(17, 13, 10, 5, 'combat', 'water', TOP)
  for (let j = 13; j <= 17; j++) b.stair(24, j, Ramp.PX, TOP - STOREY, STOREY)
  b.level(19, 13, 23, 17, TOP - STOREY)
  for (let j = 13; j <= 17; j++) b.stair(18, j, Ramp.NX, TOP - STOREY, STOREY)
  water({ i0: 18, j0: 13, i1: 24, j1: 17, lo: TOP - STOREY - 0.2, hi: TOP - POOL_FREEBOARD, valve: { i: 25, j: 13, side: 'n' } })
  b.rewards.push({ x: cellCenter(21), z: cellCenter(17), y: TOP - STOREY, room: 4, kind: 'we' })
  b.checkpoint(26, 15, YAW_NX, cells(25, 14, 26, 17))
  b.checkpoint(17, 15, YAW_NX, cells(17, 13, 17, 17))
  b.foe('flyer', 21, 15, YAW_NX, [17, 13, 26, 17], [TOP - STOREY, TOP + 1], 'puffer')
  // The ground post (the stage's crate golem, `climbSpawn`) waits on the
  // wide entry ledge: on the one-cell exit ledge it stood in the only way
  // out at the top of the stair.
  b.foe('ground', 26, 17, YAW_NX, [25, 13, 26, 17])
  b.corridor(16, 15, -1, 0, 2, TOP)

  // ── 6 Channel ─────────────────────────────────────────────────────────────
  b.addRoom(1, 12, 14, 6, 'combat', 'islands', TOP)
  b.pits(1, 12, 14, 17)
  island(13, 12, 14, 17, TOP)
  island(10, 12, 11, 17, TOP)
  island(6, 12, 8, 17, TOP)
  island(1, 12, 4, 17, TOP)
  leaps(13, 0, -1, 0, [13, 14, 15, 16])
  leaps(10, 0, -1, 0, [13, 14, 15, 16])
  leaps(6, 0, -1, 0, [13, 14, 15, 16])
  water({ i0: 1, j0: 12, i1: 14, j1: 17, lo: TOP - 1.4, hi: TOP - 1.4 })
  b.checkpoint(13, 14, YAW_NX, cells(13, 13, 14, 16))
  b.checkpoint(3, 15, YAW_PZ, cells(1, 13, 4, 16))
  b.foe('flyer', 9, 14, YAW_NX, [1, 12, 14, 17], [TOP, TOP + 2], 'puffer')
  b.foe('flyer', 7, 16, YAW_NX, [1, 12, 14, 17], [TOP, TOP + 2])
  b.corridor(2, 18, 0, 1, 2, TOP)

  // ── 7 Canal ───────────────────────────────────────────────────────────────
  // A sunk canal across the room, waist-deep, and the current runs back
  // west against him: off the landing, through, up the ledge at the far end.
  b.addRoom(1, 20, 10, 4, 'combat', 'conveyor', TOP)
  const canal = b.pool(4, 20, 9, 23, TOP, 'e')
  water({ i0: 4, j0: 20, i1: 9, j1: 23, lo: canal, hi: canal, dx: -1, dz: 0, strength: 2.0 })
  b.checkpoint(2, 21, YAW_PX, cells(1, 20, 3, 21))
  b.foe('turret', 10, 20, YAW_NX, [10, 20, 10, 20])
  b.foe('flyer', 7, 22, YAW_NX, [1, 20, 10, 23], [TOP, TOP + 2], 'puffer')
  b.corridor(11, 22, 1, 0, 2, TOP)

  // ── 8 Puffer pool ─────────────────────────────────────────────────────────
  // The pool is let into the hall's floor, a ledge on its east side.
  b.addRoom(13, 20, 8, 6, 'combat', 'hall', TOP)
  const puffers = b.pool(15, 21, 18, 24, TOP, 'e')
  water({ i0: 15, j0: 21, i1: 18, j1: 24, lo: puffers, hi: puffers })
  b.chest(13, 25, YAW_PZ)
  b.checkpoint(14, 22, YAW_PX, cells(13, 21, 14, 23))
  b.foe('flyer', 16, 22, YAW_NX, [13, 20, 20, 25], [TOP, TOP + 1.5], 'puffer')
  b.foe('flyer', 18, 24, YAW_NX, [13, 20, 20, 25], [TOP, TOP + 1.5], 'puffer')
  b.foe('ground', 19, 21, YAW_NX, [19, 20, 20, 25])
  b.foe('turret', 20, 25, YAW_NX, [20, 25, 20, 25])
  b.corridor(21, 22, 1, 0, 2, TOP)

  // ── 9 Weapon jetty ────────────────────────────────────────────────────────
  b.addRoom(23, 19, 7, 6, 'combat', 'islands', TOP)
  b.pits(23, 19, 29, 24)
  island(23, 20, 25, 24, TOP)
  island(27, 22, 29, 24, TOP)
  island(27, 19, 29, 20, TOP)
  leaps(25, 0, 1, 0, [22, 23, 24])
  leaps(0, 22, 0, -1, [27, 28, 29], true)
  water({ i0: 23, j0: 19, i1: 29, j1: 24, lo: TOP - 1.4, hi: TOP - 1.4 })
  b.rewards.push({ x: cellCenter(29), z: cellCenter(19), y: TOP, room: 8, kind: 'weapon' })
  b.checkpoint(24, 22, YAW_PX, cells(23, 21, 25, 23))
  b.checkpoint(28, 23, YAW_PZ, cells(27, 23, 29, 24))
  b.foe('flyer', 28, 20, YAW_PZ, [23, 19, 29, 24], [TOP, TOP + 2], 'puffer')
  b.corridor(28, 25, 0, 1, 2, TOP)

  // ── 10 Spillway ───────────────────────────────────────────────────────────
  // Terraces a storey apart, south and down; the water runs with him in a
  // sunk channel along each one's back (a step deep: he walks out south).
  b.addRoom(24, 27, 8, 8, 'combat', 'descent', TOP)
  b.level(24, 29, 31, 30, TOP - STOREY)
  b.level(24, 31, 31, 32, TOP - 2 * STOREY)
  b.level(24, 33, 31, 34, TOP - 3 * STOREY)
  for (let n = 0; n < 4; n++) {
    const y = TOP - n * STOREY
    const run = b.pool(24, 27 + n * 2, 31, 27 + n * 2, y, null, CHANNEL_DEEP)
    water({ i0: 24, j0: 27 + n * 2, i1: 31, j1: 27 + n * 2, lo: run, hi: run, dx: 0, dz: 1, strength: 1.2 })
  }
  b.checkpoint(28, 28, YAW_PZ, cells(26, 28, 30, 28))
  b.checkpoint(28, 34, YAW_NX, cells(25, 33, 30, 34))
  b.foe('flyer', 27, 31, YAW_NZ, [24, 27, 31, 34], [TOP - 3 * STOREY, TOP], 'puffer')
  b.foe('ground', 30, 33, YAW_NX, [26, 33, 31, 34])
  b.corridor(23, 34, -1, 0, 2, TOP - 3 * STOREY)

  // ── 11 Pump room ──────────────────────────────────────────────────────────
  const LOW = TOP - 3 * STOREY
  b.addRoom(12, 30, 10, 5, 'combat', 'hall', LOW)
  b.chest(21, 30, YAW_PX)
  b.checkpoint(20, 33, YAW_NX, cells(19, 32, 20, 33))
  b.foe('ground', 16, 31, YAW_PX, [13, 30, 19, 34])
  b.foe('flyer', 14, 33, YAW_PX, [12, 30, 21, 34], [LOW, LOW + 2], 'puffer')
  // Floor plates (#143): light all eight in one walk, never one twice and
  // never off them. Along the north wall, off the way between the doors
  // (rows 32-34): only Flux who means to walks them.
  b.secret(10, 'tiles', [12, 35, 13, 35], { i: 13, j: 35, axis: 'z' }, [], [], 'tank', undefined,
    { tiles: cells(14, 30, 17, 31) })
  b.corridor(11, 32, -1, 0, 2, LOW)

  // ── 12 Approach ───────────────────────────────────────────────────────────
  b.addRoom(1, 27, 9, 8, 'combat', 'hall', 0)
  b.level(6, 27, 9, 34, LOW)
  for (let j = 27; j <= 34; j++) {
    b.stair(5, j, Ramp.PX, LOW / 2, LOW / 2)
    b.stair(4, j, Ramp.PX, 0, LOW / 2)
  }
  b.checkpoint(8, 31, YAW_NX, cells(7, 28, 9, 33))
  b.checkpoint(2, 33, YAW_PZ, cells(1, 32, 3, 34))
  b.foe('ground', 2, 29, YAW_PZ, [1, 27, 3, 34])
  b.foe('flyer', 7, 33, YAW_NX, [1, 27, 9, 34], [0, LOW], 'puffer')
  b.corridor(3, 35, 0, 1, 2, 0, true)

  // ── 13 Arena ──────────────────────────────────────────────────────────────
  const arena = b.addRoom(1, 37, 7, 7, 'boss', 'arena', 0)
  const at = 8 + rng() * 1.5
  const tide0 = { lo: -0.3, hi: 0.75, period: at, phase: rng() * at, flood: true }
  water({ i0: 1, j0: 37, i1: 7, j1: 43, ...tide0 })

  // The beam-in room: south of the quay, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The weapon lesson room behind the boss, where the grid has room for it.
  // The flood fills the lesson room's corridor too, up to its shut door
  // (the door stands at the corridor's far end).
  if (b.exitRoom()) {
    const ex = b.doors.find(d => d.from === arena.id && !d.boss)!
    const di = ex.axis === 'x' ? ex.dir : 0
    const dj = ex.axis === 'z' ? ex.dir : 0
    b.water.push({ i0: Math.min(ex.i, ex.i - di), j0: Math.min(ex.j, ex.j - dj), i1: Math.max(ex.i, ex.i - di), j1: Math.max(ex.j, ex.j - dj), ...tide0, room: arena.id })
  }
  // The challenge room (`sim/challenge.ts`): south off the spillway's foot,
  // a dry floor (the Matriarch hovers and hoses; she brings her own water)
  // behind the door at the end of the last terrace; the way on is west.
  b.challengeRoom(9, { mouth: { i: 28, j: 34, di: 0, dj: 1 } })
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
