import { CELL, Ramp, cellCenter, type MapData, type RailSpec } from '../levelGen'
import { mulberry32, shuffle } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Rail Rush (the volt sector's story stage) ──────────────────────────────
 *
 * The Volt Master's power yard: a stretch on foot up to a maglev station, a
 * long cart ride over the void under waves of Rotor Drones (Flux only
 * shoots), then a short way down on foot to the arena.
 *
 *   1 Substation yard   the pad, a staircase up to a gallery (a turret on it)
 *   2 Shock walkway     electrified floor panels pulse in a rolling wave
 *                       (`vents` kind 'shock'): wait on a dark row, step on
 *   3 Coil tower        a ladder up to a ledge, a ladder up to the top; a
 *                       side ladder to a reward ledge
 *   4 Boarding station  a lift up to the platform where the cart waits —
 *                       the checkpoint for the whole ride
 *   5 Rail span A       the ride: a climb, a long dip over the void, turrets
 *                       on pylon islands, flyers coming in ahead
 *   6 Rail span B       through a gate into a second span: a climb, a steep
 *                       drop, more flyers
 *   7 Exit station      the cart stops, Flux steps off; a secret alcove
 *   8 Drop descent      terraces down to the floor; a dash leap over a
 *                       one-cell gap to a ledge with a borrowed weapon
 *   9 Arena             the boss shutter, the arena at y = 0
 *
 * The rail (`Terrain.rails`) is a polyline in world metres — the cart's floor
 * at each point — with its corners rounded and its heights eased between the
 * waypoints, so the ride has no kinks (`sim/stages/rail.ts` rides it). The
 * rail rooms are pits but for the landings at their gates (where the cart
 * passes a door) and the pylon islands the turrets stand on: those give the
 * walls their height over the ride's highest point and the pits their depth
 * under its lowest. The objective trail crosses the ride by a `rail` link.
 *
 * Deterministic from the seed; the seed varies the details, never the route:
 * a mirrored layout, the stairs' column, the panels' rhythm and order, the
 * cart's pace, the waves' size, the secret's pattern, the ledges' prizes.
 */

/** One storey (m), as on the climb. */
const STOREY = 3
const GRID_W = 40
/** (Rows 35.. hold the challenge room under the exit station.) */
const GRID_H = 42
/** The rail's corners are rounded to this radius (m), and its course is
 *  sampled this finely (m). */
const RAIL_TURN = 3.4
const RAIL_STEP = 1.5
/** A shock panel's pulse: live this long (s) of each period. */
const SHOCK_ON = 1.05

const ease = (k: number) => k * k * (3 - 2 * k)

/**
 * The rail's course through waypoints (cell i, cell j, height): straight
 * runs sampled every RAIL_STEP, each corner a quadratic arc of RAIL_TURN,
 * and the height eased from waypoint to waypoint along the way (level at
 * every waypoint: the climbs and dips have no kinks either).
 */
export const railCourse = (wps: ReadonlyArray<readonly [number, number, number]>): RailSpec['points'] => {
  const P = wps.map(([i, j, y]) => ({ x: cellCenter(i), z: cellCenter(j), y }))
  const flat: Array<{ x: number; z: number; w: number }> = []
  // `w`: the waypoint this sample stands at (−1 between them).
  const push = (x: number, z: number, w = -1) => {
    const l = flat[flat.length - 1]
    if (l && Math.hypot(l.x - x, l.z - z) < 1e-6) { if (w >= 0) l.w = w; return }
    flat.push({ x, z, w })
  }
  push(P[0]!.x, P[0]!.z, 0)
  for (let n = 1; n < P.length; n++) {
    const a = P[n - 1]!
    const c = P[n]!
    const len = Math.hypot(c.x - a.x, c.z - a.z)
    const ux = (c.x - a.x) / len
    const uz = (c.z - a.z) / len
    const next = P[n + 1]
    let vx = 0
    let vz = 0
    let turn = false
    if (next) {
      const l2 = Math.hypot(next.x - c.x, next.z - c.z)
      vx = (next.x - c.x) / l2
      vz = (next.z - c.z) / l2
      turn = Math.abs(ux * vx + uz * vz) < 0.999
    }
    // The straight up to the arc (or to the waypoint).
    const into = turn ? len - RAIL_TURN : len
    const from = Math.hypot(flat[flat.length - 1]!.x - a.x, flat[flat.length - 1]!.z - a.z)
    const steps = Math.max(1, Math.round((into - from) / RAIL_STEP))
    for (let s = 1; s <= steps; s++) {
      const d = from + (into - from) * s / steps
      push(a.x + ux * d, a.z + uz * d, !turn && s === steps ? n : -1)
    }
    if (turn) {
      // A quadratic arc from RAIL_TURN before the corner to RAIL_TURN past
      // it, the corner its control point; the waypoint at its middle.
      const x0 = c.x - ux * RAIL_TURN
      const z0 = c.z - uz * RAIL_TURN
      const x2 = c.x + vx * RAIL_TURN
      const z2 = c.z + vz * RAIL_TURN
      const N = 6
      for (let s = 1; s <= N; s++) {
        const u = s / N
        const m0 = (1 - u) * (1 - u)
        const m1 = 2 * u * (1 - u)
        const m2 = u * u
        push(m0 * x0 + m1 * c.x + m2 * x2, m0 * z0 + m1 * c.z + m2 * z2, s === N / 2 ? n : -1)
      }
    }
  }
  // Heights: eased between the waypoints by the distance along the course.
  const cum: number[] = [0]
  for (let n = 1; n < flat.length; n++) cum.push(cum[n - 1]! + Math.hypot(flat[n]!.x - flat[n - 1]!.x, flat[n]!.z - flat[n - 1]!.z))
  const at: number[] = []
  flat.forEach((f, n) => { if (f.w >= 0) at[f.w] = cum[n]! })
  let w = 0
  return flat.map((f, n) => {
    const s = cum[n]!
    while (w < P.length - 2 && s > at[w + 1]!) w++
    const s0 = at[w]!
    const s1 = at[w + 1]!
    const k = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 1
    return { x: f.x, y: P[w]!.y + (P[w + 1]!.y - P[w]!.y) * ease(k), z: f.z }
  })
}

/**
 * Build the stage for `seed`. Floor levels are storeys (0, 3, … 12); the
 * rail rises to 16 m and dips to 6 m over the void.
 */
export const generateRailRush = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x7a11)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => n * STOREY
  const half = STOREY / 2

  // ── 1 Substation yard ─────────────────────────────────────────────────────
  // The pad on the floor, a staircase up to a gallery along the back wall,
  // the way on at its east end; a chest in the gallery's west dead end.
  b.addRoom(2, 3, 6, 5, 'start', 'hall', L(0))
  b.level(2, 3, 7, 3, L(1))
  const stairI = rng() < 0.5 ? 6 : 5
  b.stair(stairI, 5, Ramp.NZ, L(0), half)
  b.stair(stairI, 4, Ramp.NZ, half, half)
  b.foe('turret', 4, 3, YAW_PZ, [4, 3, 4, 3])
  b.foe('ground', 2, 4, YAW_PZ, [2, 4, 3, 5])
  b.foe('ground', 7, 7, YAW_NX, [7, 6, 7, 7])
  b.chest(2, 3, YAW_NX)
  b.corridor(8, 3, 1, 0, 2, L(1))

  // ── 2 Shock walkway ───────────────────────────────────────────────────────
  // Three rows of floor panels across a walkway, a dark row between each
  // two. Every row pulses on the same period, staggered a third apart, so
  // the next row goes dark while the one behind is safe to wait on.
  b.addRoom(10, 2, 7, 3, 'combat', 'vents', L(1))
  const period = 2.6 + rng() * 0.4
  const order = shuffle(rng, [0, 1, 2])
  for (let n = 0; n < 3; n++) {
    for (let j = 2; j <= 4; j++) {
      b.vents.push({
        i: 11 + n * 2, j, dx: 0, dz: 0, y: L(1), period, phase: order[n]! * period / 3, on: SHOCK_ON, room: 1, kind: 'shock'
      })
    }
  }
  b.checkpoint(10, 3, YAW_PX, [[10, 2], [10, 3], [10, 4]])
  b.foe('turret', 16, 2, YAW_NX, [16, 2, 16, 2])
  b.foe('flyer', 14, 3, YAW_NX, [10, 2, 16, 4], [L(1), L(2)])
  b.rewards.push({ x: cellCenter(16), z: cellCenter(4), y: L(1), room: 1, kind: rng() < 0.5 ? 'bolts' : 'we' })
  b.corridor(17, 3, 1, 0, 2, L(1))

  // ── 3 Coil tower ──────────────────────────────────────────────────────────
  // A ladder up to the middle ledge, a second up to the top gallery and the
  // way on; a side ladder up to a reward alcove that leads nowhere.
  //
  //   j\i  19 20 21 22
  //    1    9  9  9  9   top gallery → the station
  //    2    3  3  9  9
  //    3    3  3  6  6   (19,3) the entry
  //    4    3  3  6  6   ladder (20,4)→(21,4); side ladder (19,4)→(19,5)
  //    5    6  3  6  6   (19,5) the reward alcove
  b.addRoom(19, 1, 4, 5, 'combat', 'ladder', L(1))
  b.level(19, 1, 22, 1, L(3))
  b.level(21, 2, 22, 2, L(3))
  b.level(21, 3, 22, 5, L(2))
  b.level(19, 5, 19, 5, L(2))
  b.ladders.push({ i: 20, j: 4, di: 1, dj: 0, y0: L(1), y1: L(2), side: false })
  b.ladders.push({ i: 22, j: 3, di: 0, dj: -1, y0: L(2), y1: L(3), side: false })
  b.ladders.push({ i: 19, j: 4, di: 0, dj: 1, y0: L(1), y1: L(2), side: true })
  b.rewards.push({ x: cellCenter(19), z: cellCenter(5), y: L(2), room: 2, kind: 'hp' })
  b.checkpoint(19, 3, YAW_PX, [[19, 2], [19, 3], [20, 2], [20, 3]])
  b.foe('flyer', 20, 2, YAW_PX, [19, 1, 22, 5], [L(1), L(3)])
  b.foe('turret', 19, 1, YAW_PZ, [19, 1, 19, 1])
  b.corridor(23, 1, 1, 0, 2, L(3))

  // ── 4 Boarding station ────────────────────────────────────────────────────
  // The walkway, a lift up to the platform, the cart in its slot at the
  // platform's south edge. A nook off the walkway holds a chest.
  b.addRoom(25, 1, 5, 4, 'combat', 'lift', L(3))
  b.level(27, 3, 29, 4, L(4))
  b.level(28, 2, 29, 2, L(4))
  b.pits(27, 2, 27, 2)
  b.lifts.push({
    kind: 'v', hw: 1.46, hd: 1.46, ax: cellCenter(27), ay: L(3), az: cellCenter(2), bx: cellCenter(27), by: L(4), bz: cellCenter(2),
    travel: 1.9, wait: 1.6, phase: 0, room: 3
  })
  b.chest(25, 4, YAW_NX)
  b.checkpoint(25, 1, YAW_PX, [[25, 1], [26, 1]])
  // The boarding platform: where a fall (or a resume) mid-ride puts Flux.
  b.checkpoint(28, 3, YAW_PZ, [[28, 2], [29, 2], [27, 3], [28, 3], [29, 3], [27, 4], [28, 4], [29, 4]])
  b.foe('ground', 29, 1, YAW_NX, [28, 1, 29, 1])
  b.foe('flyer', 26, 3, YAW_PX, [25, 2, 29, 4], [L(3), L(4)])
  b.corridor(28, 5, 0, 1, 2, L(4))

  // ── 5 Rail span A ─────────────────────────────────────────────────────────
  // All void: a landing at each gate, turrets on pylon islands (the highest
  // gives the walls their height over the climb, the lowest the pits their
  // depth under the dip).
  b.addRoom(12, 7, 26, 9, 'combat', 'rail', L(4))
  b.pits(12, 7, 37, 15)
  const island = (i: number, j: number, y: number) => {
    b.pit[b.k(i, j)] = 0
    b.level(i, j, i, j, y)
  }
  island(28, 7, L(4))
  island(13, 15, L(3))
  island(32, 8, 16)
  island(18, 11, 11)
  island(22, 15, L(1))
  b.foe('turret', 32, 8, YAW_PZ, [32, 8, 32, 8])
  b.foe('turret', 18, 11, YAW_PZ, [18, 11, 18, 11])
  b.foe('turret', 22, 15, YAW_NZ, [22, 15, 22, 15])
  b.corridor(13, 16, 0, 1, 2, L(3))

  // ── 6 Rail span B ─────────────────────────────────────────────────────────
  b.addRoom(3, 18, 24, 8, 'combat', 'rail', L(3))
  b.pits(3, 18, 26, 25)
  island(13, 18, L(3))
  island(6, 25, L(2))
  island(20, 19, 14)
  island(10, 25, 2)
  b.foe('turret', 20, 19, YAW_PZ, [20, 19, 20, 19])
  b.foe('turret', 10, 25, YAW_NZ, [10, 25, 10, 25])
  b.corridor(6, 26, 0, 1, 2, L(2))

  // The ride: out of the station south, east up a climb, round and down the
  // long dip, up again and through the gate; in span B up a second climb,
  // round and down a steep drop, and into the exit station.
  const points = railCourse([
    [28, 4, L(4)], [28, 10, L(4)], [35, 10, 16], [35, 13, 16], [22, 13, 6], [13, 13, L(3)],
    [13, 20, L(3)], [24, 20, 14], [24, 23, 14], [16, 23, 8], [6, 23, L(2)], [6, 29, L(2)]
  ])
  b.rails.push({ points, speed: 7.2 + rng() * 0.6, room: 3, boardAt: { i: 28, j: 4 }, exitAt: { i: 6, j: 29 } })
  b.link([28, 4], [6, 29], 'rail')
  // Waves of flyers while the cart crosses each span: a first taste in A,
  // a heavier one in B.
  b.waves.push({ room: 4, trigger: 'rail', kind: 'heli', count: 2, every: 5.5, total: 3 })
  b.waves.push({ room: 5, trigger: 'rail', kind: 'heli', count: rng() < 0.5 ? 2 : 3, every: 5, total: 3 })

  // ── 7 Exit station ────────────────────────────────────────────────────────
  // The cart stops in its slot; the way on east. A secret alcove behind the
  // south wall: three lamps on the walls, the panel beside the false wall.
  b.addRoom(3, 28, 6, 4, 'combat', 'cart', L(2))
  b.checkpoint(6, 29, YAW_PX, [
    [3, 28], [4, 28], [5, 28], [6, 28], [7, 28], [8, 28], [3, 29], [4, 29], [5, 29], [6, 29], [7, 29], [8, 29]
  ])
  b.foe('ground', 8, 28, YAW_NX, [7, 28, 8, 29])
  b.foe('ground', 3, 30, YAW_PX, [3, 30, 4, 31])
  b.chest(8, 31, YAW_PZ)
  const lamps = [1, 0, 1]
  if (rng() < 0.5) lamps.reverse()
  if (rng() < 0.4) lamps[1] = 1
  const cycle = rng() < 0.5
  b.secret(
    6, cycle ? 'cycle' : 'lights', [4, 32, 5, 32], { i: 4, j: 32, axis: 'z' },
    [[3, 28, 'n'], [5, 28, 'n'], [8, 29, 'e']],
    cycle ? shuffle(rng, [0, 1, 2, 3]).slice(0, 3) : lamps, 'tank'
  )
  b.corridor(9, 30, 1, 0, 2, L(2))

  // ── 8 Drop descent ────────────────────────────────────────────────────────
  // Terraces a storey apart down to the floor. Along the back wall a one-cell
  // gap at the top terrace's height: a dash leap across it reaches a ledge
  // with a borrowed weapon (nothing else does), then a drop back down.
  b.addRoom(11, 27, 8, 6, 'combat', 'descent', L(2))
  b.level(14, 28, 15, 32, L(1))
  b.level(15, 27, 15, 27, L(1))
  b.level(16, 27, 18, 32, L(0))
  b.pits(13, 27, 13, 27)
  b.link([12, 27], [14, 27], 'leap')
  // The gap to the weapon ledge holds a crumbling slab: step on it and keep
  // moving, or leap it.
  b.crumble(13, 27, L(2), 1, 1)
  b.rewards.push({ x: cellCenter(14), z: cellCenter(27), y: L(2), room: 7, kind: 'weapon' })
  b.checkpoint(11, 30, YAW_PX, [[11, 28], [11, 29], [11, 30], [11, 31], [11, 32]])
  b.foe('turret', 15, 32, YAW_NZ, [15, 32, 15, 32])
  b.foe('ground', 17, 28, YAW_NX, [16, 27, 18, 32])
  // The last checkpoint: the floor in front of the boss shutter.
  b.checkpoint(17, 30, YAW_PX, [[16, 29], [16, 30], [16, 31], [17, 29], [17, 30], [17, 31], [18, 29], [18, 30], [18, 31]])
  b.corridor(19, 30, 1, 0, 2, L(0), true)

  // ── 9 Arena ───────────────────────────────────────────────────────────────
  b.addRoom(21, 27, 7, 7, 'boss', 'arena', L(0))
  // The Volt Master's arena: a conductive floor grid. Panels go live in
  // three staggered sets; the cells between them are the rubber mats,
  // always safe. The boss stands above it (its own current).
  {
    const room = b.rooms.length - 1
    const panels: Array<[number, number, number]> = [
      [22, 28, 0], [24, 28, 1], [26, 28, 2], [23, 30, 2], [25, 30, 0], [22, 32, 1], [24, 32, 2], [26, 32, 0]
    ]
    for (const [i, j, set] of panels) {
      b.vents.push({ i, j, dx: 0, dz: 0, y: L(0), period: 6, phase: set * 2, on: SHOCK_ON, room, kind: 'shock' })
    }
  }

  // The beam-in room: below the yard, the pad out of the machines' sight.
  b.beamRoom(3, 9, 4, 3, 4, 8, 0, -1, 1)
  void stairI
  // Start: in the beam-in room, facing its door.
  const start = { x: cellCenter(4) + CELL / 2, z: cellCenter(10), yaw: YAW_NZ }
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  // The challenge room (`sim/challenge.ts`): south off the exit station,
  // between the secret's false wall and the chest — the door Flux faces as
  // he steps off the cart; the way on is east.
  b.challengeRoom(6, { mouth: { i: 7, j: 31, di: 0, dj: 1 } })
  const map = finish(b, start, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
