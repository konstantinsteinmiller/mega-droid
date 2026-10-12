import { CELL, Ramp, cellCenter, type MapData, type Lift, type MagnetRail, type WaterZone } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, POOL_FREEBOARD, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Vex Fortress (the last story stage) ─────────────────────────────────────
 *
 * Dr. Vex's stronghold, the longest stage: three acts, two mini-bosses,
 * a checkpoint before each of them and before Vex. It throws everything
 * the ten Masters taught back at Flux, and two new machines: the Warden
 * (armoured; its core is bare only after it fires) and, guarding the
 * gates, the Gatekeeper tank and the Twin Masters (echoes of Blaze and
 * Frost). A guard hall's way out stays shut until its guards are down
 * (`Terrain.guards`).
 *
 *   Act A — the Outer Wall
 *    1 Beach           the landing; a Warden on the sand
 *    2 Gate court      snipers on the wall ledges, two Wardens
 *    3 Moat            islands over one-cell gaps, a crumbling slab
 *    4 Wall climb      ladders up two storeys under fire
 *    5 Battlements     a magnet rail dragging back (its panel by the door)
 *    6 Gate hall       the Gatekeeper (mini-boss; a checkpoint at the door)
 *   Act B — the Works (every Master's trick, once more)
 *    7 Conveyor hall   two clock rails, out of step
 *    8 Light bridges   two bridges of light and their switch
 *    9 Flood vault     a flooded chamber; shoot its valve
 *   10 Rockfall        stalactites, boulders, a cache behind cracked rock
 *   11 Wind tunnel     gusts back up it, pillars to shelter behind
 *   12 Core shaft      shuttles over the shaft
 *   13 Puzzle vault    a secret alcove behind its south wall
 *   14 Twin hall       the Twin Masters (mini-boss; a checkpoint at the door)
 *   Act C — the Spire
 *   15 Spire lift      cages down two storeys
 *   16 Reactor run     fire vents and shock panels in turn
 *   17 Antechamber     a last checkpoint, steps down to the shutter
 *   18 Arena           Dr. Vex in three stages, the Core Descent (#109):
 *                      the Spire's roof under a lightning storm; at 65 %
 *                      the roof gives way and the fight falls into the
 *                      reactor hall, its hazards (fire, shock, gusts)
 *                      cycling round it; at 30 % the floor goes again and
 *                      it ends on a narrow ring round the Core. The hall and
 *                      the ring have no doors: the falls carry Flux there.
 *
 * The final test, and meant to be (#144): its regular machines come in
 * close to twice the numbers of the first draft (46, was 26) and take three
 * times the health (`stageFoeHpMul`, `sim/adaptive.ts`); the gates'
 * mini-bosses and Vex are left as they were.
 *
 * Deterministic from the seed: the hand and the clocks vary, never the
 * route.
 */

const GRID_W = 56
const GRID_H = 54
const BASE = 4
const STOREY = 3
const COVER_H = 2.5
const VENT_ON = 1.1
const VENT_MOUTH = 1.0
const SHOCK_ON = 1.05
const DRAG = 3.0

export const generateVexFortress = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x7e7f0)
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
  const room = () => b.rooms.length - 1
  const rail = (o: Omit<MagnetRail, 'room'>): void => { b.magnets.push({ ...o, room: room() }) }
  const water = (o: Omit<WaterZone, 'room'>): void => { b.water.push({ ...o, room: room() }) }
  const boulder = (i: number, j: number, cracked: boolean) => { b.icePillars.push({ i, j, cracked, room: room() }) }
  const rockfall = (i: number, j: number, period: number, phase: number) => {
    b.icicles.push({ i, j, y: b.floor[b.k(i, j)]!, period, phase, room: room() })
  }
  const TOP = BASE + 2 * STOREY

  // ══ Act A — the Outer Wall ════════════════════════════════════════════════

  // ── 1 Beach ───────────────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', BASE)
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.foe('ground', 5, 4, YAW_NX, [4, 3, 6, 5], undefined, 'warden')
  b.foe('ground', 4, 2, YAW_NX, [3, 1, 6, 3], undefined, 'stalker')
  b.corridor(7, 2, 1, 0, 2, BASE)

  // ── 2 Gate court ──────────────────────────────────────────────────────────
  // Ledges on the wall corners with snipers on them; two Wardens on the
  // court; vents of cover.
  b.addRoom(9, 1, 10, 7, 'combat', 'hall', BASE)
  b.level(9, 6, 10, 7, BASE + 6)
  b.level(17, 1, 18, 2, BASE + 6)
  b.level(13, 3, 13, 3, BASE + COVER_H)
  b.level(15, 5, 15, 5, BASE + COVER_H)
  b.checkpoint(10, 3, YAW_PX, cells(9, 2, 11, 4))
  b.foe('turret', 9, 7, YAW_PZ, [9, 7, 9, 7])
  b.foe('turret', 18, 1, YAW_NX, [18, 1, 18, 1])
  b.foe('ground', 14, 4, YAW_NX, [12, 3, 16, 5], undefined, 'warden')
  b.foe('ground', 16, 6, YAW_NX, [14, 5, 18, 7], undefined, 'warden')
  b.foe('flyer', 15, 2, YAW_NX, [11, 1, 18, 7], [BASE + 1, BASE + 4], 'hornet')
  b.corridor(19, 3, 1, 0, 2, BASE)

  // ── 3 Moat ────────────────────────────────────────────────────────────────
  b.addRoom(21, 1, 10, 6, 'combat', 'islands', BASE)
  b.pits(21, 1, 30, 6)
  island(21, 1, 23, 6, BASE)
  island(25, 1, 26, 6, BASE)
  island(28, 1, 30, 6, BASE)
  leaps(23, 0, 1, 0, [2, 3, 4, 5])
  leaps(26, 0, 1, 0, [2, 3, 4, 5])
  b.crumble(27, 2, BASE, 1, 1)
  b.checkpoint(22, 3, YAW_PX, cells(21, 2, 23, 5))
  b.foe('flyer', 25, 1, YAW_NX, [21, 1, 30, 6], [BASE, BASE + 3], 'hornet')
  b.foe('turret', 30, 1, YAW_NX, [30, 1, 30, 1])
  b.foe('flyer', 28, 5, YAW_NX, [24, 1, 30, 6], [BASE + 1, BASE + 3], 'polar')
  b.corridor(29, 7, 0, 1, 2, BASE)

  // ── 4 Wall climb ──────────────────────────────────────────────────────────
  b.addRoom(26, 9, 6, 7, 'combat', 'ladder', BASE)
  b.level(26, 11, 31, 12, BASE + STOREY)
  b.level(26, 13, 31, 15, TOP)
  b.ladders.push({ i: 29, j: 10, di: 0, dj: 1, y0: BASE, y1: BASE + STOREY, side: false })
  b.ladders.push({ i: 28, j: 12, di: 0, dj: 1, y0: BASE + STOREY, y1: TOP, side: false })
  b.checkpoint(29, 9, YAW_PZ, cells(27, 9, 31, 9))
  b.checkpoint(29, 14, YAW_PX, cells(28, 13, 30, 15))
  b.foe('turret', 31, 15, YAW_NZ, [31, 15, 31, 15])
  b.foe('flyer', 27, 11, YAW_PZ, [26, 9, 31, 15], [BASE, TOP], 'hornet')
  b.foe('ground', 31, 11, YAW_NZ, [30, 11, 31, 12], undefined, 'warden')
  b.foe('turret', 26, 15, YAW_NZ, [26, 15, 26, 15])
  b.corridor(32, 14, 1, 0, 2, TOP)

  // ── 5 Battlements ─────────────────────────────────────────────────────────
  b.addRoom(34, 9, 10, 7, 'combat', 'magnet', TOP)
  rail({ i0: 36, j0: 12, i1: 43, j1: 13, dx: -1, dz: 0, strength: DRAG, panel: { i: 35, j: 9, side: 'n' } })
  b.level(38, 10, 38, 10, TOP + COVER_H)
  b.level(41, 15, 41, 15, TOP + COVER_H)
  b.checkpoint(34, 14, YAW_PX, cells(34, 13, 35, 15))
  b.foe('ground', 40, 10, YAW_NX, [38, 9, 43, 11], undefined, 'warden')
  b.foe('ground', 42, 14, YAW_NX, [39, 14, 43, 15], undefined, 'stalker')
  b.foe('turret', 43, 9, YAW_NX, [43, 9, 43, 9])
  b.foe('flyer', 40, 12, YAW_NX, [36, 9, 43, 15], [TOP + 1, TOP + 3], 'hornet')
  b.corridor(44, 12, 1, 0, 2, TOP)

  // ── 6 Gate hall (mini-boss: the Gatekeeper) ───────────────────────────────
  b.addRoom(46, 8, 9, 9, 'combat', 'hall', TOP)
  b.level(48, 10, 48, 10, TOP + COVER_H)
  b.level(52, 14, 52, 14, TOP + COVER_H)
  b.checkpoint(47, 12, YAW_PX, cells(46, 11, 47, 13))
  b.foe('ground', 51, 12, YAW_NX, [48, 9, 54, 16], undefined, 'gatekeeper')
  b.guards.push(room())
  b.corridor(50, 17, 0, 1, 2, TOP)

  // ══ Act B — the Works ═════════════════════════════════════════════════════

  // ── 7 Conveyor hall ───────────────────────────────────────────────────────
  b.addRoom(44, 19, 11, 5, 'combat', 'conveyor', TOP)
  const every = 3.6 + rng() * 1.2
  const ph = rng() * every * 2
  rail({ i0: 44, j0: 20, i1: 53, j1: 21, dx: -1, dz: 0, strength: DRAG, every, phase: ph })
  rail({ i0: 44, j0: 22, i1: 53, j1: 23, dx: -1, dz: 0, strength: DRAG, every, phase: ph + every })
  b.checkpoint(50, 19, YAW_PZ, cells(48, 19, 52, 19))
  b.foe('flyer', 47, 21, YAW_PX, [44, 19, 54, 23], [TOP, TOP + 2], 'polar')
  b.foe('turret', 44, 19, YAW_PX, [44, 19, 44, 19])
  b.foe('flyer', 52, 22, YAW_NZ, [44, 19, 54, 23], [TOP + 1, TOP + 3], 'hornet')
  b.corridor(43, 21, -1, 0, 2, TOP)

  // ── 8 Light bridges ───────────────────────────────────────────────────────
  b.addRoom(30, 18, 12, 6, 'combat', 'islands', TOP)
  b.pits(30, 18, 41, 23)
  island(40, 18, 41, 23, TOP)
  island(34, 18, 35, 23, TOP)
  island(30, 18, 31, 23, TOP)
  b.bridge(36, 20, TOP, 4, 2, { group: 0 })
  b.bridge(32, 20, TOP, 2, 2, { group: 1 })
  b.neonSwitches.push({ i: 34, j: 18, side: 'n', room: room() })
  b.checkpoint(41, 21, YAW_NX, cells(40, 19, 41, 22))
  b.checkpoint(35, 21, YAW_NX, cells(34, 19, 35, 22))
  b.foe('ground', 34, 23, YAW_NX, [34, 18, 35, 23], undefined, 'stalker')
  b.foe('flyer', 38, 18, YAW_NX, [30, 18, 41, 23], [TOP, TOP + 2], 'hornet')
  b.foe('turret', 30, 18, YAW_PX, [30, 18, 30, 18])
  b.foe('flyer', 32, 22, YAW_PX, [30, 18, 37, 23], [TOP, TOP + 2], 'polar')
  b.corridor(29, 21, -1, 0, 2, TOP)

  // ── 9 Flood vault ─────────────────────────────────────────────────────────
  b.addRoom(18, 18, 10, 7, 'combat', 'water', TOP)
  for (let j = 18; j <= 24; j++) b.stair(25, j, Ramp.PX, TOP - STOREY, STOREY)
  b.level(20, 18, 24, 24, TOP - STOREY)
  for (let j = 18; j <= 24; j++) b.stair(19, j, Ramp.NX, TOP - STOREY, STOREY)
  water({ i0: 19, j0: 18, i1: 25, j1: 24, lo: TOP - STOREY - 0.2, hi: TOP - POOL_FREEBOARD, valve: { i: 26, j: 18, side: 'n' } })
  b.rewards.push({ x: cellCenter(22), z: cellCenter(24), y: TOP - STOREY, room: room(), kind: 'we' })
  b.checkpoint(27, 21, YAW_NX, cells(26, 19, 27, 23))
  b.foe('flyer', 22, 21, YAW_NX, [18, 18, 27, 24], [TOP - STOREY, TOP + 1], 'puffer')
  b.foe('ground', 18, 23, YAW_PX, [18, 18, 18, 24], undefined, 'warden')
  b.foe('flyer', 23, 19, YAW_PX, [18, 18, 27, 24], [TOP - STOREY + 1, TOP + 1], 'hornet')
  b.corridor(17, 21, -1, 0, 2, TOP)

  // ── 10 Rockfall ───────────────────────────────────────────────────────────
  b.addRoom(8, 18, 8, 6, 'combat', 'icicles', TOP)
  boulder(12, 19, false)
  boulder(10, 22, false)
  // The corner cache (15, 23): sealed by two cracked boulders.
  boulder(15, 22, true)
  boulder(14, 23, true)
  b.rewards.push({ x: cellCenter(15), z: cellCenter(23), y: TOP, room: room(), kind: 'hp' })
  const rb = 3.4 + rng() * 0.8
  rockfall(13, 20, rb, 0)
  rockfall(11, 21, rb, rb / 3)
  rockfall(9, 20, rb, (rb * 2) / 3)
  b.checkpoint(14, 19, YAW_NX, cells(14, 18, 15, 19))
  b.foe('ground', 9, 22, YAW_PZ, [8, 21, 11, 23], undefined, 'mole')
  b.foe('ground', 12, 23, YAW_PX, [11, 22, 13, 23], undefined, 'mole')
  b.foe('ground', 9, 18, YAW_PX, [8, 18, 11, 19], undefined, 'stalker')
  b.corridor(10, 24, 0, 1, 2, TOP)

  // ── 11 Wind tunnel ────────────────────────────────────────────────────────
  b.addRoom(8, 26, 5, 9, 'combat', 'wind', TOP)
  for (const [i, j] of [[9, 28], [11, 30], [9, 32]] as const) b.level(i, j, i, j, TOP + 4)
  b.wind.push({ i0: 8, j0: 27, i1: 12, j1: 34, dx: 0, dz: -1, strength: 3.5 + rng() * 0.5, on: 2.5 + rng() * 0.6, off: 2.4 + rng() * 0.4, phase: rng() * 6, room: room() })
  b.checkpoint(10, 26, YAW_PZ, cells(8, 26, 12, 26))
  b.foe('turret', 12, 34, YAW_NZ, [12, 34, 12, 34])
  b.foe('turret', 8, 34, YAW_NZ, [8, 34, 8, 34])
  b.foe('flyer', 10, 31, YAW_NZ, [8, 27, 12, 34], [TOP + 1, TOP + 3], 'hornet')
  b.corridor(13, 33, 1, 0, 2, TOP)

  // ── 12 Core shaft ─────────────────────────────────────────────────────────
  b.addRoom(15, 30, 12, 5, 'combat', 'shuttle', TOP)
  b.pits(15, 30, 26, 34)
  island(15, 30, 16, 34, TOP)
  island(21, 30, 21, 34, TOP)
  island(25, 30, 26, 34, TOP)
  const ferry = 2.4 + rng() * 0.6
  const dwell = 1.3
  const off = rng() * (ferry + dwell) * 2
  lift({ kind: 'h', ax: cellCenter(17), ay: TOP, az: cellCenter(31), bx: cellCenter(20), by: TOP, bz: cellCenter(31), travel: ferry, wait: dwell, phase: off, room: room() })
  lift({ kind: 'h', ax: cellCenter(22), ay: TOP, az: cellCenter(33), bx: cellCenter(24), by: TOP, bz: cellCenter(33), travel: ferry, wait: dwell, phase: off + ferry + dwell * 0.5, room: room() })
  b.checkpoint(16, 32, YAW_PX, cells(15, 31, 16, 33))
  b.checkpoint(21, 32, YAW_PX, cells(21, 31, 21, 33))
  b.foe('flyer', 21, 30, YAW_PX, [15, 30, 26, 34], [TOP, TOP + 2], 'hornet')
  b.foe('turret', 26, 30, YAW_NX, [26, 30, 26, 30])
  b.foe('flyer', 16, 34, YAW_PX, [15, 30, 26, 34], [TOP, TOP + 2], 'polar')
  b.corridor(27, 32, 1, 0, 2, TOP)

  // ── 13 Puzzle vault ───────────────────────────────────────────────────────
  b.addRoom(29, 29, 9, 7, 'combat', 'hall', TOP)
  b.chest(37, 29, YAW_PX)
  b.checkpoint(30, 31, YAW_PX, cells(29, 30, 30, 33))
  b.foe('ground', 34, 32, YAW_NX, [31, 29, 37, 35], undefined, 'warden')
  b.foe('flyer', 35, 30, YAW_NX, [29, 29, 37, 35], [TOP, TOP + 2], 'polar')
  b.foe('ground', 35, 33, YAW_NX, [32, 31, 36, 34], undefined, 'stalker')
  // Simon says, the long one (#143): five steps over four walls.
  b.secret(room(), 'sequence', [29, 36, 30, 36], { i: 30, j: 36, axis: 'z' },
    [[29, 34, 'w', 0], [33, 29, 'n', 1], [37, 34, 'e', 2], [35, 35, 's', 3]], [1, 3, 0, 2, 1], 'tank')
  b.corridor(38, 32, 1, 0, 2, TOP)

  // ── 14 Twin hall (mini-boss: the Twin Masters) ────────────────────────────
  b.addRoom(40, 28, 9, 9, 'combat', 'hall', TOP)
  b.level(43, 31, 43, 31, TOP + COVER_H)
  b.level(46, 34, 46, 34, TOP + COVER_H)
  b.checkpoint(41, 32, YAW_PX, cells(40, 31, 41, 33))
  b.foe('ground', 45, 30, YAW_NX, [42, 28, 48, 36], undefined, 'echo', 'blazeMaster')
  b.foe('ground', 45, 35, YAW_NX, [42, 28, 48, 36], undefined, 'echo', 'frostMaster')
  b.guards.push(room())
  b.corridor(44, 37, 0, 1, 2, TOP)

  // ══ Act C — the Spire ═════════════════════════════════════════════════════

  // ── 15 Spire lift ─────────────────────────────────────────────────────────
  b.addRoom(40, 39, 9, 5, 'combat', 'lift', TOP)
  b.pits(40, 41, 48, 41)
  b.level(40, 42, 48, 43, BASE)
  const ride = 2.6 + rng() * 0.6
  const wait = 1.4
  const lp = rng() * (ride + wait) * 2
  lift({ kind: 'v', loop: true, ax: cellCenter(43), ay: TOP, az: cellCenter(41), bx: cellCenter(43), by: BASE, bz: cellCenter(41), travel: ride, wait, phase: lp, room: room() })
  lift({ kind: 'v', loop: true, ax: cellCenter(45), ay: TOP, az: cellCenter(41), bx: cellCenter(45), by: BASE, bz: cellCenter(41), travel: ride, wait, phase: lp + ride + wait, room: room() })
  b.checkpoint(44, 39, YAW_PZ, cells(42, 39, 46, 40))
  b.checkpoint(44, 43, YAW_PZ, cells(42, 42, 46, 43))
  b.foe('flyer', 47, 40, YAW_NX, [40, 39, 48, 43], [BASE, TOP], 'hornet')
  b.foe('turret', 40, 43, YAW_PX, [40, 43, 40, 43])
  b.corridor(44, 44, 0, 1, 2, BASE)

  // ── 16 Reactor run ────────────────────────────────────────────────────────
  // Fire from the side walls and live panels on the floor, in turn: the
  // way through is a beat between them.
  b.addRoom(40, 46, 9, 6, 'combat', 'vents', BASE)
  const fp = 4.5
  // No west vent on row 49: that is the doorway out (the corridor west),
  // and a burner stood in it (playtest 2026-10-12).
  for (const [j, k] of [[47, 0], [49, 1], [51, 2]] as const) {
    if (j !== 49) b.vents.push({ i: 40, j, dx: 1, dz: 0, y: BASE + VENT_MOUTH, period: fp, phase: k * 1.5, on: VENT_ON, room: room(), kind: 'fire' })
    b.vents.push({ i: 48, j: j - 1, dx: -1, dz: 0, y: BASE + VENT_MOUTH, period: fp, phase: k * 1.5 + 0.75, on: VENT_ON, room: room(), kind: 'fire' })
  }
  for (const [i, j, set] of [[42, 47, 0], [44, 48, 1], [46, 47, 2], [42, 50, 2], [44, 50, 0], [46, 50, 1]] as const) {
    b.vents.push({ i, j, dx: 0, dz: 0, y: BASE, period: 6, phase: set * 2, on: SHOCK_ON, room: room(), kind: 'shock' })
  }
  b.checkpoint(44, 46, YAW_PZ, cells(43, 46, 45, 46))
  b.foe('ground', 41, 51, YAW_PX, [40, 50, 43, 51], undefined, 'warden')
  b.foe('ground', 47, 49, YAW_NX, [45, 49, 48, 49], undefined, 'stalker')
  b.corridor(39, 49, -1, 0, 2, BASE)

  // ── 17 Antechamber ────────────────────────────────────────────────────────
  b.addRoom(30, 46, 8, 6, 'combat', 'hall', 0)
  b.level(34, 46, 37, 51, BASE)
  for (let j = 46; j <= 51; j++) b.stair(33, j, Ramp.PX, 0, BASE)
  b.rewards.push({ x: cellCenter(36), z: cellCenter(46), y: BASE, room: room(), kind: 'hp' })
  b.checkpoint(35, 49, YAW_NX, cells(34, 48, 36, 50))
  b.foe('ground', 31, 47, YAW_PX, [30, 46, 32, 51], undefined, 'stalker')
  b.foe('ground', 31, 51, YAW_PX, [30, 49, 32, 51], undefined, 'warden')
  b.corridor(29, 49, -1, 0, 2, 0, true)

  // ── 18 Arena: the Core Descent (#109) ─────────────────────────────────────
  // Stage 1, the Spire's roof: Dr. Vex under a lightning storm (the strikes
  // and the sky are the mission's, `sim/coreDescent.ts`).
  b.addRoom(21, 46, 7, 7, 'boss', 'arena', 0)
  const roof = room()
  // Stage 2, the reactor hall: the reactor cycles the Masters' hazards on
  // one clock — fire from the walls, then live panels, then a gust (Flux
  // only). No doors: the roof's collapse drops the fight in here.
  b.addRoom(11, 46, 7, 7, 'combat', 'arena', 0)
  const ar = room()
  const cyc = 12
  for (const [j, d] of [[47, 1], [51, 1], [49, -1]] as const) {
    b.vents.push({ i: d > 0 ? 11 : 17, j, dx: d, dz: 0, y: VENT_MOUTH, period: cyc, phase: 0, on: 2, room: ar, kind: 'fire' })
  }
  for (const [i, j] of [[12, 47], [14, 49], [16, 51], [16, 47], [12, 51]] as const) {
    b.vents.push({ i, j, dx: 0, dz: 0, y: 0, period: cyc, phase: -4, on: 2, room: ar, kind: 'shock' })
  }
  b.wind.push({ i0: 11, j0: 46, i1: 17, j1: 52, dx: 1, dz: 0, strength: 2.6, on: 2.2, off: cyc - 2.2, phase: -8, room: ar })
  // Stage 3, the Core ring: a two-cell walkway round the Core's 3 × 3 pit
  // (molten: a fall costs health and Atlas pulls him out).
  b.addRoom(2, 46, 7, 7, 'combat', 'arena', 0)
  const ring = room()
  b.pits(4, 48, 6, 50)
  b.pitKind(ring, 'lava')
  b.bossStages = [roof, ar, ring]

  // The beam-in room: south of the beach, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The challenge room (`sim/challenge.ts`): south off the core shaft's far
  // pier, where the shuttles set Flux down — the door in the pier's end
  // wall; the way on is east. The Sentinel Prototype's beam sweep stops at
  // cover (`hasLineOfSight`): two pillars on a diagonal, a cell in from the
  // side walls, either side of where it waits.
  if (b.challengeRoom(11, { mouth: { i: 25, j: 34, di: 0, dj: 1 }, sizes: [[6, 7], [6, 6]] }) >= 0) {
    const cr = b.rooms[b.challenge!.room]!
    b.coverPillar(cr.x0 + 1, cr.z0 + 2)
    b.coverPillar(cr.x0 + cr.w - 2, cr.z0 + cr.h - 2)
  }
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
