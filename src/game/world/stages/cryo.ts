import { CELL, Ramp, cellCenter, type MapData, type SecretSpec } from '../levelGen'
import { mulberry32, shuffle } from '../rng'
import { STOREY } from '../climbGen'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Glacier Run (the cryo sector's story stage) ────────────────────────────
 *
 * The Frost Master's plant, a stage about footing: ICE cells (`Terrain.ice`,
 * `sim/stages/ice.ts`) keep Flux sliding once he lets go of the stick and
 * turn him slowly, and the pits under the ice edges hold SPIKES. Frost
 * throwers sweep a lane, ice pillars stand on an ice floor, icicles drop
 * where a shadow grows first.
 *
 *   1 Frozen lobby      the pad, a walled ice patch to learn on (a secret)
 *   2 Ice bridge        an ice walkway over spikes, a stepping stone, a
 *                       one-cell gap to dash-leap; an ice spur to bolts
 *   3 Frost lane        three frost throwers across a lane, safe rows between
 *   4 Pillar hall       an ice floor round a wall of pillars; a cracked one
 *                       shot down is a shortcut
 *   5 Icicle hall       icicles over the walk, a chest by the door
 *   6 Slippery stairs   ice stairs down onto a landing among spikes, a
 *                       shuttle across
 *   7 Snowdrift cliff   a ladder up; a ledge across a spike gap holds the
 *                       borrowed weapon (a dash leap), a side ladder to a
 *                       capsule
 *   8 Descent           terraces down to the boss shutter at y = 0
 *   9 Arena             the Frost Master
 *
 * Fair ice: nothing on the route asks for a turn on ice over a pit. The ice
 * runs straight at its spikes (the bridge, the stairs), every ice patch ends
 * on plain floor before a gap is leapt, and the pillar hall and the lobby
 * have walls, not pits, round their ice. Floors: the plant's upper level at
 * 9 m, the landing and the cliff's foot at 6, the arena at 0.
 *
 * Deterministic from the seed, which varies the details, never the route: a
 * mirrored layout, the bolts spur, which pillar is cracked, the frost and
 * icicle rhythms, the shuttle's pace, what the side ledge holds, the secret.
 */

const GRID_W = 42
const GRID_H = 24

export const generateGlacier = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0xc7e0)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => n * STOREY
  const half = STOREY / 2
  const TOP = L(3)
  const MID = L(2)

  // ── 1 Frozen lobby ────────────────────────────────────────────────────────
  // The pad, and a patch of ice across the walk to the door, walled all
  // round: the first slide ends on a wall, not a pit. A secret alcove behind
  // the north wall, its buttons on the west wall.
  b.addRoom(2, 2, 6, 5, 'start', 'hall', TOP)
  b.ice(4, 3, 6, 4)
  b.foe('turret', 7, 2, YAW_NX, [7, 2, 7, 2])
  b.foe('ground', 6, 6, YAW_NX, [5, 5, 7, 6])
  b.chest(2, 2, YAW_NX)
  b.checkpoint(3, 5, YAW_PX, [[2, 5], [3, 5], [2, 6], [3, 6]])
  lobbySecret(b, rng)
  b.corridor(8, 4, 1, 0, 2, TOP)

  // ── 2 Ice bridge ──────────────────────────────────────────────────────────
  // A spike pit across the room; a one-cell ice walkway over it, straight at
  // a stepping stone of plain floor, then a one-cell gap to the far ledge:
  // a slide off the stone leaps it. An ice spur off the walkway to bolts.
  b.addRoom(10, 2, 7, 5, 'combat', 'spikes', TOP)
  b.pits(11, 2, 15, 6)
  b.pitKind(1, 'spikes')
  for (let i = 11; i <= 14; i++) b.pit[b.k(i, 4)] = 0
  b.ice(11, 4, 13, 4)
  const spur = rng() < 0.5 ? 12 : 13
  b.pit[b.k(spur, 3)] = 0
  b.pit[b.k(spur, 2)] = 0
  b.ice(spur, 3, spur, 3)
  b.rewards.push({ x: cellCenter(spur), z: cellCenter(2), y: TOP, room: 1, kind: 'bolts' })
  b.link([14, 4], [16, 4], 'leap')
  // A crumbling slab in the gap past the stepping stone: a careful walker's
  // bridge, if it is crossed before it drops into the spikes.
  b.crumble(15, 4, TOP, 1, 1)
  b.checkpoint(10, 4, YAW_PX, [[10, 2], [10, 3], [10, 4], [10, 5], [10, 6]])
  b.foe('turret', 16, 6, YAW_NX, [16, 6, 16, 6])
  b.corridor(17, 4, 1, 0, 2, TOP)

  // ── 3 Frost lane ──────────────────────────────────────────────────────────
  // Frost throwers on the lane's side walls, each blasting across it on the
  // same period, staggered: between their rows the floor is always safe,
  // and each row is quiet for longer than it takes to cross.
  b.addRoom(19, 3, 9, 3, 'combat', 'frost', TOP)
  const frostPeriod = 3 + rng() * 0.4
  const frostOrder = shuffle(rng, [0, 1, 2])
  const nozzles: Array<[number, number, number]> = [[21, 3, 1], [23, 5, -1], [25, 3, 1]]
  nozzles.forEach(([i, j, dz], n) => b.vents.push({
    i, j, dx: 0, dz, y: TOP + 1, period: frostPeriod, phase: frostOrder[n]! * frostPeriod / 3, on: 1.1, room: 2, kind: 'frost'
  }))
  b.checkpoint(19, 4, YAW_PX, [[19, 3], [19, 4], [19, 5]])
  b.foe('ground', 26, 4, YAW_NX, [26, 3, 27, 5])
  b.corridor(27, 6, 0, 1, 2, TOP)

  // ── 4 Pillar hall ─────────────────────────────────────────────────────────
  // All ice but the entry row and the exit column. A wall of pillars splits
  // the hall; the way round is at its far end, past a lone pillar to steer
  // by. One pillar of the wall is cracked: shot down, it is the short way.
  b.addRoom(22, 8, 7, 6, 'combat', 'ice', TOP)
  b.ice(23, 9, 28, 13)
  const cracked = 9 + Math.floor(rng() * 3)
  for (let j = 8; j <= 12; j++) b.icePillars.push({ i: 25, j, cracked: j === cracked, room: 3 })
  b.icePillars.push({ i: 27, j: rng() < 0.5 ? 10 : 11, cracked: false, room: 3 })
  b.icePillars.push({ i: 23, j: 9, cracked: false, room: 3 })
  b.rewards.push({ x: cellCenter(22), z: cellCenter(8), y: TOP, room: 3, kind: 'we' })
  b.checkpoint(27, 8, YAW_PZ, [[26, 8], [27, 8], [28, 8]])
  b.foe('flyer', 24, 10, YAW_PX, [22, 8, 28, 13], [TOP, TOP + 3])
  b.foe('flyer', 27, 13, YAW_NZ, [22, 8, 28, 13], [TOP, TOP + 3])
  b.foe('ground', 23, 12, YAW_PX, [22, 11, 24, 13])
  b.corridor(21, 11, -1, 0, 2, TOP)

  // ── 5 Icicle hall ─────────────────────────────────────────────────────────
  // Icicles over the walk and to its sides, on one period, staggered: a ring
  // grows on the floor under one before it falls. A chest by the entry.
  b.addRoom(11, 10, 9, 3, 'combat', 'icicles', TOP)
  const drip = 2.9 + rng() * 0.5
  const drops: Array<[number, number]> = [[17, 11], [16, 10], [15, 11], [14, 12], [13, 11]]
  const dropOrder = shuffle(rng, [0, 1, 2, 3, 4])
  drops.forEach(([i, j], n) => b.icicles.push({ i, j, y: TOP, period: drip, phase: dropOrder[n]! * drip / 5, room: 4 }))
  b.chest(19, 10, YAW_NZ)
  b.checkpoint(19, 11, YAW_NX, [[19, 10], [19, 11], [19, 12]])
  b.foe('turret', 11, 10, YAW_PX, [11, 10, 11, 10])
  b.foe('ground', 14, 12, YAW_PX, [12, 10, 16, 12])
  b.corridor(11, 13, 0, 1, 2, TOP)

  // ── 6 Slippery stairs ─────────────────────────────────────────────────────
  // A shelf, three-wide ice stairs straight down a storey onto a plain
  // landing among spikes, and a shuttle over the spikes to the far ledge.
  b.addRoom(9, 15, 7, 6, 'combat', 'lift', MID)
  b.level(9, 15, 11, 15, TOP)
  for (let i = 9; i <= 11; i++) {
    b.stair(i, 16, Ramp.NZ, MID + half, half)
    b.stair(i, 17, Ramp.NZ, MID, half)
  }
  b.ice(9, 16, 11, 17)
  b.pits(12, 15, 14, 20)
  b.pits(15, 15, 15, 16)
  b.pitKind(5, 'spikes')
  const shuttle = 2.3 + rng() * 0.7
  b.lifts.push({
    kind: 'h', hw: 1.46, hd: 1.46, ax: cellCenter(12), ay: MID, az: cellCenter(19), bx: cellCenter(14), by: MID, bz: cellCenter(19),
    travel: shuttle, wait: 1.4, phase: rng() * (shuttle + 1.4) * 2, room: 5
  })
  b.checkpoint(10, 15, YAW_PZ, [[9, 15], [10, 15], [11, 15]])
  b.checkpoint(10, 19, YAW_PX, [[9, 18], [10, 18], [11, 18], [9, 19], [10, 19], [11, 19], [9, 20], [10, 20], [11, 20]])
  b.foe('flyer', 10, 20, YAW_PX, [9, 15, 15, 20], [MID, TOP])
  b.foe('flyer', 15, 18, YAW_NX, [9, 15, 15, 20], [MID, TOP])
  b.corridor(16, 19, 1, 0, 2, MID)

  // ── 7 Snowdrift cliff ─────────────────────────────────────────────────────
  // The cliff's foot, a ladder up to the upper ledge and the way on. Past a
  // one-cell spike gap off the upper ledge, the harder ledge with the
  // borrowed weapon (a dash leap there; back down is a drop to the foot).
  // A side ladder to a capsule nook over the foot.
  b.addRoom(18, 15, 6, 6, 'combat', 'ladder', MID)
  b.level(21, 17, 23, 20, TOP)
  b.pits(21, 16, 23, 16)
  b.level(21, 15, 23, 15, TOP)
  b.level(18, 15, 18, 15, TOP)
  b.pitKind(6, 'spikes')
  b.ladders.push({ i: 20, j: 19, di: 1, dj: 0, y0: MID, y1: TOP, side: false })
  b.ladders.push({ i: 18, j: 16, di: 0, dj: -1, y0: MID, y1: TOP, side: true })
  b.rewards.push({ x: cellCenter(18), z: cellCenter(15), y: TOP, room: 6, kind: rng() < 0.5 ? 'hp' : 'we' })
  b.rewards.push({ x: cellCenter(22), z: cellCenter(15), y: TOP, room: 6, kind: 'weapon' })
  b.link([22, 17], [22, 15], 'leap')
  b.checkpoint(18, 19, YAW_PX, [[18, 17], [18, 18], [18, 19], [18, 20]])
  b.foe('flyer', 19, 18, YAW_PX, [18, 15, 23, 20], [MID, TOP])
  b.foe('turret', 23, 20, YAW_NX, [23, 20, 23, 20])
  b.foe('ground', 19, 17, YAW_PX, [18, 16, 20, 18])
  b.corridor(24, 19, 1, 0, 2, TOP)

  // ── 8 Descent ─────────────────────────────────────────────────────────────
  // Terraces a storey apart down to the floor in front of the boss shutter.
  b.addRoom(26, 15, 6, 6, 'combat', 'descent', TOP)
  b.level(27, 15, 27, 20, L(2))
  b.level(28, 15, 28, 20, L(1))
  b.level(29, 15, 31, 20, L(0))
  b.checkpoint(26, 19, YAW_PX, [[26, 15], [26, 16], [26, 17], [26, 18], [26, 19], [26, 20]])
  b.foe('turret', 27, 15, YAW_PZ, [27, 15, 27, 15])
  b.foe('turret', 28, 20, YAW_NZ, [28, 20, 28, 20])
  b.foe('ground', 30, 17, YAW_NX, [29, 15, 31, 20])
  b.checkpoint(30, 17, YAW_PX, [
    [29, 15], [29, 16], [29, 17], [29, 18], [29, 19], [29, 20], [30, 15], [30, 16], [30, 17], [30, 18], [30, 19], [30, 20]
  ])
  b.corridor(32, 17, 1, 0, 2, L(0), true)

  // ── 9 Arena ───────────────────────────────────────────────────────────────
  b.addRoom(34, 14, 7, 7, 'boss', 'arena', L(0))
  // The Frost Master's arena: two sheets of slick ice and two frost
  // throwers on the walls (they chill Flux, never their master).
  {
    const room = b.rooms.length - 1
    b.ice(35, 15, 36, 16)
    b.ice(38, 18, 39, 19)
    b.vents.push({ i: 36, j: 14, dx: 0, dz: 1, y: L(0) + 1, period: 7, phase: 0, on: 1.1, room, kind: 'frost' })
    b.vents.push({ i: 38, j: 20, dx: 0, dz: -1, y: L(0) + 1, period: 7, phase: 3.5, on: 1.1, room, kind: 'frost' })
  }

  // The beam-in room: below the lobby, the pad out of the machines' sight.
  b.beamRoom(3, 8, 4, 3, 4, 7, 0, -1, 1)
  // Start: in the beam-in room, facing its door.
  const start = { x: cellCenter(4) + CELL / 2, z: cellCenter(9), yaw: YAW_NZ }
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  const map = finish(b, start, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}

/**
 * The lobby's secret: three buttons on the west wall, the false wall on the
 * north wall, a Repair Tank in the alcove behind it. The seed picks the
 * puzzle and its answer (never the all-off start, never the all-red one).
 */
const lobbySecret = (b: Builder, rng: () => number): void => {
  const kinds: Array<SecretSpec['kind']> = ['lights', 'color', 'cycle']
  const kind = kinds[Math.floor(rng() * 3)]!
  const buttons: Array<[number, number, 'w', number]> = [[2, 3, 'w', 0], [2, 4, 'w', 1], [2, 5, 'w', 2]]
  let target: number[] = []
  let key: number | undefined
  if (kind === 'lights') {
    const pick = 1 + Math.floor(rng() * 6)
    target = [pick & 1, (pick >> 1) & 1, (pick >> 2) & 1]
  } else if (kind === 'cycle') {
    target = [0, 0, 0].map(() => Math.floor(rng() * 4))
    if (!target.some(c => c > 0)) target[1] = 1 + Math.floor(rng() * 3)
  } else {
    // Two of one colour, one of another: the key is the pair's colour.
    key = Math.floor(rng() * 4)
    const other = (key + 1 + Math.floor(rng() * 3)) % 4
    const odd = Math.floor(rng() * 3)
    buttons.forEach((bt, n) => { bt[3] = n === odd ? other : key! })
  }
  b.secret(0, kind, [4, 1, 5, 1], { i: 5, j: 1, axis: 'z' }, buttons, target, 'tank', key)
}
