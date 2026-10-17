import { CELL, Ramp, cellCenter, type MapData, type VentSpec } from '../levelGen'
import { mulberry32, shuffle } from '../rng'
import { STOREY } from '../climbGen'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Meltdown Descent (the blaze sector's story stage) ──────────────────────
 *
 * The Tower Run upside down: Flux beams onto the roof of a burning refinery
 * stack, 21 m up, and works his way DOWN to the Blaze Master's arena at
 * y = 0. Every section teaches one hot thing; the verbs are the climb's
 * (walk, stairs, drops, a lift) plus the dash leap.
 *
 *   1 Roof            the pad at +21 m, a turret on the chimney
 *   2 Catwalks        ledge to ledge down 3 m at a time over LAVA, and one
 *                     dash-leap gap (1 cell, equal floors) in the middle
 *   3 Vent walkway    fire vents burst on a rhythm (wall jets and floor
 *                     columns); every column of the walk keeps a cold cell
 *   4 Ember barrels   a stair run down, three flat steps between the ramps;
 *                     glowing barrels roll ACROSS each step from the side
 *                     (a hatch, a lamp, a gutter), so the descent is a
 *                     crossing: wait for the barrel, then step down
 *   5 Furnace floor   a plain fight (#177): an elite Guardroid with a Gear
 *                     Roller and a Rotor Drone, the barrels' payoff before
 *                     the hammers
 *   6 Forge hammers   a one-cell walkway over lava under two piston hammers,
 *                     a spur with a capsule between them; or the south walk
 *                     round them, past a crate golem (#168)
 *   7 The big drop    a shaft of staggered ledges, 9 → 6 → 3; from the
 *                     middle ledge a dash leap over the shaft reaches a side
 *                     ledge with the borrowed weapon (and leaps back)
 *   8 Slag lift       a lift down the last storey (the ledge is ringed by
 *                     slag, so the lift is the way), the last checkpoint,
 *                     a secret behind a colour puzzle, the boss shutter
 *   Arena             7 × 7 at y = 0
 *
 * Deterministic from the seed; the seed varies the details, never the route:
 * a mirrored layout, which vent columns jet from the walls and which from
 * the floor, the vents' beat, the side the barrels come from and their
 * rhythm, the hammers' timing, the secret's key colour, and what
 * waits on one of the reward ledges. Grid 48 × 29 cells.
 */

const GRID_W = 48
const GRID_H = 29
/** Fire vents: seconds per cycle (the jets roar `VENT_ON` of it), and the
 *  wall nozzle's mouth over its floor (chest height: the jet hits a body). */
const VENT_ON = 1.1
const VENT_MOUTH = 1.0

/** Build the stack for `seed`. Floor levels L0..L7 = 0, 3, … 21. */
export const generateMeltdown = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0xb1a2e)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => n * STOREY
  const half = STOREY / 2

  // ── 1 Roof ────────────────────────────────────────────────────────────────
  // The pad on the roof of the stack, a chimney in the corner with a turret
  // on it (out of reach: it shoots down at the pad), the way on east.
  b.addRoom(2, 2, 6, 5, 'start', 'hall', L(7))
  b.level(2, 2, 2, 2, L(8))
  b.foe('turret', 2, 2, YAW_PZ, [2, 2, 2, 2])
  b.foe('ground', 6, 3, YAW_NX, [5, 2, 7, 3])
  b.checkpoint(3, 5, YAW_PX, [[3, 5], [4, 5], [3, 6], [4, 6]])
  b.corridor(8, 4, 1, 0, 2, L(7))

  // ── 2 Catwalks over lava ──────────────────────────────────────────────────
  // Entry ledge (21) → a catwalk a storey down (18) → a one-cell gap over the
  // lava to a landing at the same height (only a slide carries over it) → a
  // storey down to the far ledge (15), with a side nook holding a chest.
  b.addRoom(10, 1, 8, 6, 'combat', 'lava', L(7))
  b.pitKind(1, 'lava')
  b.pits(10, 1, 17, 6)
  const floor = (i0: number, j0: number, i1: number, j1: number, y: number) => {
    b.level(i0, j0, i1, j1, y)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b.pit[b.k(i, j)] = 0
  }
  floor(10, 3, 10, 5, L(7))
  floor(11, 3, 12, 4, L(6))
  floor(14, 3, 14, 4, L(6))
  floor(15, 3, 17, 5, L(5))
  floor(16, 1, 17, 2, L(5))
  b.link([12, 3], [14, 3], 'leap')
  b.link([12, 4], [14, 4], 'leap')
  // Two crumbling slabs bridge the lava gap: walk on and keep going (they
  // shake, then drop), or leap it as before.
  b.crumble(13, 3, L(6), 1, 1)
  b.crumble(13, 4, L(6), 1, 1)
  b.checkpoint(10, 4, YAW_PX, [[10, 3], [10, 4], [10, 5]])
  b.checkpoint(14, 4, YAW_PX, [[14, 3], [14, 4]])
  // A blue blaster, not a roll: the seed's roll here was a legendary
  // chassis, a level's first room in (#115).
  b.chest(17, 1, YAW_NZ, { rarity: 'tuned', slot: 'buster', key: 'blaze.ember' })
  b.rewards.push({ x: cellCenter(16), z: cellCenter(1), y: L(5), room: 1, kind: 'bolts' })
  b.foe('flyer', 14, 3, YAW_NX, [11, 1, 16, 6], [L(5), L(7)])
  b.foe('turret', 17, 5, YAW_NX, [17, 5, 17, 5])
  b.corridor(18, 4, 1, 0, 2, L(5))

  // ── 3 Vent walkway ────────────────────────────────────────────────────────
  // Three cells wide. Five vent columns: a "pair" column has a nozzle in
  // each side wall jetting across its own row (the middle row stays cold), a
  // "floor" column one nozzle in the middle row (the side rows stay cold).
  // Pairs roar together, floors half a beat later: never both at once.
  b.addRoom(20, 3, 7, 3, 'combat', 'vents', L(5))
  const period = 2.9 + rng() * 0.6
  const phase = rng() * period
  const pairsOdd = rng() < 0.5
  for (let i = 21; i <= 25; i++) {
    const pair = ((i - 21) % 2 === 0) === pairsOdd
    const vent = (j: number, dz: number, y: number, ph: number): VentSpec =>
      ({ i, j, dx: 0, dz, y, period, phase: ph, on: VENT_ON, room: 2, kind: 'fire' })
    if (pair) {
      b.vents.push(vent(3, 1, L(5) + VENT_MOUTH, phase))
      b.vents.push(vent(5, -1, L(5) + VENT_MOUTH, phase))
    } else {
      b.vents.push(vent(4, 0, L(5), phase + period / 2))
    }
  }
  b.checkpoint(20, 4, YAW_PX, [[20, 3], [20, 4], [20, 5]])
  b.rewards.push({ x: cellCenter(26), z: cellCenter(5), y: L(5), room: 2, kind: rng() < 0.5 ? 'we' : 'hp' })
  b.foe('turret', 26, 3, YAW_NX, [26, 3, 26, 3])
  b.foe('ground', 23, 4, YAW_NX, [21, 3, 25, 5])
  b.foe('flyer', 24, 4, YAW_NX, [20, 3, 26, 5], [L(5), L(5) + 2])
  b.corridor(27, 4, 1, 0, 2, L(5))

  // ── 4 Ember barrels ───────────────────────────────────────────────────────
  // A stair run down along +X: landing, ramp, step, ramp, step, ramp, step,
  // ramp, landing — 15 m to 9 m, half a storey a ramp. A barrel lane runs
  // along each of the three flat steps, from a hatch at one side wall to a
  // gutter at the other; each lane on the same beat, staggered.
  b.addRoom(29, 2, 9, 4, 'combat', 'rolling', L(5))
  for (let n = 0; n < 4; n++) {
    const hi = L(5) - n * half
    for (let j = 2; j <= 5; j++) b.stair(30 + n * 2, j, Ramp.NX, hi - half, half)
    b.level(31 + n * 2, 2, 31 + n * 2, 5, hi - half)
  }
  const fromNorth = rng() < 0.5
  const beat = 2.5 + rng() * 0.6
  const laneOrder = shuffle(rng, [0, 1, 2])
  const z0 = 2 * CELL + 0.35
  const z1 = 6 * CELL - 0.35
  const laneLen = 4 * CELL - 0.7 - 1.2
  for (let n = 0; n < 3; n++) {
    b.lanes.push({
      x: cellCenter(31 + n * 2), z: fromNorth ? z0 : z1, dx: 0, dz: fromNorth ? 1 : -1, len: laneLen,
      period: beat, phase: laneOrder[n]! * beat / 3, room: 3
    })
  }
  b.checkpoint(29, 3, YAW_PX, [[29, 2], [29, 3], [29, 4], [29, 5]])
  b.foe('turret', 37, 2, YAW_NX, [37, 2, 37, 2])
  b.foe('flyer', 35, 3, YAW_NX, [29, 2, 37, 5], [L(3), L(5)])
  b.corridor(38, 4, 1, 0, 2, L(3))

  // ── 5 Furnace floor ───────────────────────────────────────────────────────
  // #177: playtesters drifted off around the barrels and the hammers, two
  // timing rooms in a row. A plain fight between them: an ELITE Guardroid
  // (2.5x armour, harder hits) holding the middle, a Gear Roller and a Rotor
  // Drone to keep Flux moving. The way on is back west, into the hammers.
  b.addRoom(40, 2, 7, 8, 'combat', 'hall', L(3))
  b.checkpoint(40, 4, YAW_PX, [[40, 3], [40, 4], [40, 5]])
  b.foe('ground', 44, 5, YAW_NX, [41, 2, 46, 9], undefined, 'brute', undefined, true)
  b.foe('ground', 43, 8, YAW_NX, [41, 6, 46, 9], undefined, 'roller')
  b.foe('flyer', 45, 3, YAW_NX, [40, 2, 46, 9], [L(3), L(3) + 2.5], 'heli')
  b.rewards.push({ x: cellCenter(46), z: cellCenter(9), y: L(3), room: 4, kind: 'hp' })
  b.corridor(39, 9, -1, 0, 2, L(3))

  // ── 6 Forge hammers ───────────────────────────────────────────────────────
  // The entry platform, a one-cell walkway west over lava under piston
  // hammers, a spur between two of them with a capsule, the far platform.
  // Never a hammer over the first walkway cell (the walk ahead in view).
  b.addRoom(28, 8, 10, 5, 'combat', 'hammer', L(3))
  b.pitKind(5, 'lava')
  b.pits(28, 8, 37, 12)
  floor(36, 8, 37, 10, L(3))
  floor(29, 10, 35, 10, L(3))
  floor(33, 11, 33, 11, L(3))
  floor(28, 9, 28, 12, L(3))
  // #168: the other way across, no hammers and no leaps: down the entry
  // platform's south end and along the room's south wall, a solid walk over
  // the lava with a crate golem asleep on it, which wakes as Flux comes near
  // (the lane's one cell wide: it has to be fought, not passed).
  floor(36, 11, 37, 12, L(3))
  floor(29, 12, 35, 12, L(3))
  // Two hammers (#177 took out the middle one), the spur's capsule between them.
  rng()
  const hammers = [34, 30]
  const swing = 2.4 + rng() * 0.5
  hammers.forEach((i, n) => b.crushers.push({ i, j: 10, y: L(3), period: swing, phase: (n * 0.5 + rng() * 0.2) * swing, room: 5 }))
  b.rewards.push({ x: cellCenter(33), z: cellCenter(11), y: L(3), room: 5, kind: 'hp' })
  b.checkpoint(37, 9, YAW_NX, [[36, 8], [37, 8], [36, 9], [37, 9], [36, 10], [37, 10]])
  b.foe('flyer', 28, 9, YAW_PX, [28, 8, 36, 12], [L(3), L(3) + 3])
  // #168: no mortar here any more (players died to its shells and the hammers
  // at once); the golem holds the south walk instead.
  b.foe('ground', 31, 12, YAW_PX, [29, 12, 35, 12], undefined, 'golem')
  b.corridor(27, 10, -1, 0, 2, L(3))

  // ── 7 The big drop ────────────────────────────────────────────────────────
  // A shaft: the entry ledge (9), a ledge a storey down (6), the bottom
  // ledge (3). Off the middle ledge, one cell of shaft away at the same
  // height, the side ledge with the borrowed weapon: a dash leap there and
  // back, and a long fall if it goes wrong.
  b.addRoom(19, 8, 7, 8, 'combat', 'drop', L(3))
  b.pits(19, 8, 25, 15)
  floor(24, 9, 25, 11, L(3))
  floor(22, 10, 23, 12, L(2))
  floor(21, 8, 22, 8, L(2))
  floor(19, 11, 21, 14, L(1))
  b.link([22, 10], [22, 8], 'leap')
  b.link([22, 8], [22, 10], 'leap')
  b.rewards.push({ x: cellCenter(21), z: cellCenter(8), y: L(2), room: 6, kind: 'weapon' })
  b.checkpoint(25, 10, YAW_NX, [[24, 9], [25, 9], [24, 10], [25, 10], [24, 11], [25, 11]])
  b.checkpoint(20, 12, YAW_NX, [[19, 11], [20, 11], [21, 11], [19, 12], [20, 12], [21, 12], [20, 13], [21, 13], [20, 14], [21, 14]])
  b.chest(19, 14, YAW_NX)
  b.foe('flyer', 23, 11, YAW_NX, [19, 8, 25, 15], [L(1), L(3)])
  b.foe('turret', 19, 11, YAW_PX, [19, 11, 19, 11])
  b.foe('ground', 20, 13, YAW_PX, [19, 11, 21, 14])
  b.corridor(18, 13, -1, 0, 2, L(1))

  // ── 8 Slag lift ───────────────────────────────────────────────────────────
  // The ledge (3) is ringed by slag; the lift waits up at it and rides down
  // to the floor (0) once stood on. The floor is the last checkpoint, before
  // the boss shutter; a colour puzzle on its walls hides an alcove.
  b.addRoom(10, 11, 7, 6, 'combat', 'lift', L(0))
  b.pitKind(7, 'lava')
  floor(15, 11, 16, 13, L(1))
  b.pits(14, 11, 14, 16)
  b.pits(15, 14, 16, 16)
  b.lifts.push({
    kind: 'v', hw: 1.46, hd: 1.46, ax: cellCenter(14), ay: L(1), az: cellCenter(12), bx: cellCenter(14), by: L(0), bz: cellCenter(12),
    travel: 1.9, wait: 1.6, phase: 0, room: 7
  })
  b.checkpoint(16, 13, YAW_NX, [[15, 11], [16, 11], [15, 12], [16, 12], [15, 13], [16, 13]])
  b.rewards.push({ x: cellCenter(10), z: cellCenter(11), y: L(0), room: 7, kind: 'hp' })
  b.foe('ground', 11, 12, YAW_PX, [10, 11, 13, 16])
  b.foe('ground', 12, 16, YAW_NZ, [10, 13, 13, 16])
  // The key colour's buttons ON, the rest OFF: buttons on the north and west
  // walls of the floor, the alcove south of it.
  const key = Math.floor(rng() * 3)
  b.secret(7, 'color', [11, 17, 12, 18], { i: 11, j: 17, axis: 'z' },
    [[10, 12, 'w', 0], [11, 11, 'n', 1], [12, 11, 'n', 2], [13, 11, 'n', 1], [10, 15, 'w', 2]], [], 'tank', key)
  b.checkpoint(11, 14, YAW_NX, [[10, 13], [11, 13], [12, 13], [13, 13], [10, 14], [11, 14], [12, 14], [13, 14], [10, 15], [11, 15], [12, 15], [13, 15]])
  b.corridor(9, 14, -1, 0, 2, L(0), true)

  // ── Arena ─────────────────────────────────────────────────────────────────
  b.addRoom(1, 11, 7, 7, 'boss', 'arena', L(0))
  // The Blaze Master's arena burns too (Flux only — the boss is its own
  // fire): a wall jet on each side and two floor columns, out of step.
  {
    const room = b.rooms.length - 1
    const fire = (i: number, j: number, dx: number, dz: number, y: number, ph: number): void => {
      b.vents.push({ i, j, dx, dz, y, period: 6, phase: ph, on: VENT_ON, room, kind: 'fire' })
    }
    fire(1, 13, 1, 0, L(0) + VENT_MOUTH, 0)
    fire(7, 15, -1, 0, L(0) + VENT_MOUTH, 3)
    fire(3, 16, 0, 0, L(0), 1.5)
    fire(5, 12, 0, 0, L(0), 4.5)
  }

  // The beam-in room: below the roof's pad room, out of the turret's sight;
  // two cells deep with a void row between it and the arena (no drop in).
  b.beamRoom(2, 8, 8, 2, 4, 7, 0, -1, 1)
  // Start: in the beam-in room, facing its door.
  const start = { x: cellCenter(3), z: cellCenter(8) + CELL / 2, yaw: YAW_PX }
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  // The challenge room (`sim/challenge.ts`): off the big drop's bottom
  // ledge, which now runs on to the shaft's south wall; the challenge door
  // in that wall faces Flux as he lands, the way on (west, to the lift)
  // never passes it. Level with the ledge, over the void like the stack.
  floor(19, 15, 21, 15, L(1))
  b.challengeRoom(6, { mouth: { i: 20, j: 15, di: 0, dj: 1 } })
  const map = finish(b, start, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
