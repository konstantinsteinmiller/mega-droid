import { CELL, Ramp, cellCenter, type MapData } from './levelGen'
import { mulberry32, shuffle } from './rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './stages/builder'

/**
 * ─── The climb ("Tower Run") ─────────────────────────────────────────────────
 *
 * A MegaMan stage instead of a labyrinth: a hand-authored run of "screens",
 * each teaching one verb, climbing a tower and dropping back down into the
 * Core Master's arena. No jump anywhere — the verbs are stairs, ladders,
 * lifts, drops, and dodging.
 *
 *   1 Ground hall      the pad, a staircase up to a gallery (a turret on it)
 *   2 Ladder shaft     a ladder up the wall; a side ladder to a reward ledge
 *   3 Rolling stairs   a wide staircase, scrap balls roll down its lanes
 *   4 Lift hall        a shuttle over a pit, then a lift up (Rotor Drones)
 *   5 Crusher bridge   a walkway over a pit under piston crushers; a side
 *                      ladder to a reward ledge (a borrowed-weapon capsule)
 *   6 Drop descent     ledge to ledge, 3 m at a time, down to the floor
 *   7 Arena            the boss shutter, the arena at y = 0
 *
 * It is still a `MapData` — rooms, corridors, doors, the boss shutter — with
 * a `terrain` on top, so doors, portal culling, the objective and the boss
 * flow all work unchanged. The arena floor is at y = 0, so the boss needs no
 * heights at all. Deterministic from the seed (a resumed climb regenerates the
 * same tower); the seed varies the details, never the route: a mirrored
 * layout, which side the stairs sit on, how many crushers and their timing,
 * the scrap-ball rhythm, the shuttle's pace, what waits on the reward ledges.
 * Two chests stand on ledges off the route (`Terrain.chests`); they draw no
 * numbers from the seed, so the tower is the one it always was. Nor does its
 * secret (`Terrain.secrets`, `sim/secrets.ts`): a lamp puzzle on the ground
 * hall's front wall behind the pad, and an alcove with a Repair Gel.
 * Nor does its challenge room (`Builder.challengeRoom`, `sim/challenge.ts`):
 * off the foot of the drop descent, behind the challenge door, a mini-boss
 * the run never has to fight — room 7, after the arena, off the route.
 *
 * The toolkit it is built with (`Builder`, `finish`, `mirrorX`) lives in
 * `world/stages/builder.ts`, shared with the platform stages.
 */

/** One storey of the tower (m). A ladder climbs one, a lift one, the stairs
 *  one (two ramp cells of half a storey), a drop falls one. */
export const STOREY = 3
/** Scrap ball radius (m). */
export const BALL_R = 0.55
const GRID_W = 32
const GRID_H = 19
/** The drop descent's room (section 6): the challenge room hangs off it. */
const DESCENT = 5

/**
 * Build the tower for `seed`. Every storey is STOREY metres: floor levels
 * L0..L5 = 0, 3, … 15.
 */
export const generateClimb = (seed: number, challenge = true): MapData => {
  const rng = mulberry32(seed ^ 0xc11b)
  const b = new Builder(GRID_W, GRID_H)
  const L = (n: number) => n * STOREY
  const half = STOREY / 2

  // ── 1 Ground hall ─────────────────────────────────────────────────────────
  // The pad on the floor, a staircase (two ramp cells) up to a gallery along
  // the back wall, the way on at the gallery's far end. The seed picks which
  // of two columns the stairs climb in.
  b.addRoom(2, 3, 6, 5, 'start', 'hall', L(0))
  b.level(2, 3, 7, 3, L(1))
  const stairI = rng() < 0.5 ? 6 : 5
  b.stair(stairI, 5, Ramp.NZ, L(0), half)
  b.stair(stairI, 4, Ramp.NZ, half, half)
  // Machines a few metres off the pad, never on it: one by the back wall
  // under the gallery, one across the hall.
  b.foe('turret', 3, 3, YAW_PZ, [3, 3, 3, 3])
  b.foe('ground', 2, 4, YAW_PZ, [2, 4, 4, 5])
  b.foe('ground', 7, 6, YAW_NX, [7, 5, 7, 7])
  // The secret: behind the pad, along the hall's front wall, a striped false
  // wall, the panel beside it and four lamps to copy it with; a Repair Gel
  // in the two-cell alcove behind. Off the route, and no numbers drawn.
  b.secret(0, 'lights', [2, 8, 2, 9], { i: 2, j: 8, axis: 'z' },
    [[4, 7, 's'], [5, 7, 's'], [6, 7, 's'], [7, 7, 's']], [1, 0, 1, 1], 'tank')
  b.corridor(8, 3, 1, 0, 2, L(1))

  // ── 2 Ladder shaft ────────────────────────────────────────────────────────
  // A landing, a ladder up the wall to the upper ledge and the way on; a
  // second ladder up the other wall to a reward alcove that leads nowhere.
  b.addRoom(10, 2, 3, 4, 'combat', 'ladder', L(1))
  b.level(10, 2, 12, 2, L(2))
  b.level(12, 3, 12, 3, L(2))
  b.level(10, 5, 10, 5, L(2))
  b.ladders.push({ i: 11, j: 3, di: 0, dj: -1, y0: L(1), y1: L(2), side: false })
  b.ladders.push({ i: 10, j: 4, di: 0, dj: 1, y0: L(1), y1: L(2), side: true })
  b.rewards.push({ x: cellCenter(10), z: cellCenter(5), y: L(2), room: 1, kind: 'hp' })
  // A chest in the upper ledge's dead end, backed onto the wall past the
  // ladder's top: seen on the way up, off the walk to the way on.
  b.chest(10, 2, YAW_NX)
  b.checkpoint(10, 3, YAW_PX, [[10, 3], [11, 3], [10, 4], [11, 4], [12, 4], [11, 5], [12, 5]])
  b.foe('flyer', 11, 4, YAW_NX, [10, 2, 12, 5], [L(1), L(2)])
  b.corridor(13, 2, 1, 0, 2, L(2))

  // ── 3 Rolling stairs ──────────────────────────────────────────────────────
  // Three lanes up a wide staircase; scrap balls drop out of hatches in the
  // gantry at the top and roll down into the gutter at the foot. Every lane
  // fires on the same period, staggered, so a free lane always exists.
  b.addRoom(15, 1, 4, 3, 'combat', 'rolling', L(2))
  for (let j = 1; j <= 3; j++) {
    b.stair(16, j, Ramp.PX, L(2), half)
    b.stair(17, j, Ramp.PX, L(2) + half, half)
  }
  b.level(18, 1, 18, 3, L(3))
  const lanePeriod = 2.7 + rng() * 0.6
  const laneOrder = shuffle(rng, [0, 1, 2])
  for (let n = 0; n < 3; n++) {
    b.lanes.push({
      x: 18 * CELL + 0.35, z: cellCenter(1 + n), dx: -1, dz: 0, len: 18 * CELL + 0.35 - 16 * CELL,
      period: lanePeriod, phase: laneOrder[n]! * lanePeriod / 3, room: 2
    })
  }
  b.checkpoint(15, 2, YAW_PX, [[15, 1], [15, 2], [15, 3]])
  b.corridor(19, 2, 1, 0, 2, L(3))

  // ── 4 Lift hall ───────────────────────────────────────────────────────────
  // The entry ledge, a three-cell pit the shuttle crosses, the far ledge, and
  // a lift up to the upper level around it. Rotor Drones patrol the heights.
  b.addRoom(21, 1, 7, 4, 'combat', 'lift', L(3))
  b.pits(22, 1, 24, 4)
  // Along the pit's far edge a path of crumbling slabs: run it without
  // waiting for the shuttle, and do not stop. No seed numbers drawn.
  for (let i = 22; i <= 24; i++) b.crumble(i, 4, L(3), 1, 1)
  b.level(26, 1, 27, 4, L(4))
  b.pits(26, 2, 26, 2)
  const shuttle = 2.3 + rng() * 0.8
  b.lifts.push({
    kind: 'h', hw: 1.46, hd: 1.46, ax: cellCenter(22), ay: L(3), az: cellCenter(2), bx: cellCenter(24), by: L(3), bz: cellCenter(2),
    travel: shuttle, wait: 1.3, phase: rng() * (shuttle + 1.3) * 2, room: 3
  })
  b.lifts.push({
    kind: 'v', hw: 1.46, hd: 1.46, ax: cellCenter(26), ay: L(3), az: cellCenter(2), bx: cellCenter(26), by: L(4), bz: cellCenter(2),
    travel: 1.9, wait: 1.6, phase: 0, room: 3
  })
  b.checkpoint(21, 2, YAW_PX, [[21, 1], [21, 2], [21, 3], [21, 4]])
  b.checkpoint(25, 2, YAW_PX, [[25, 1], [25, 2], [25, 3], [25, 4]])
  b.foe('flyer', 25, 3, YAW_NX, [21, 1, 27, 4], [L(3), L(4)])
  b.foe('flyer', 27, 1, YAW_NX, [21, 1, 27, 4], [L(3), L(4)])
  b.corridor(27, 5, 0, 1, 2, L(4))

  // ── 5 Crusher bridge ──────────────────────────────────────────────────────
  // A one-cell walkway over a pit, piston crushers over it; a safe cell
  // between them with a spur and a side ladder up to a reward ledge.
  b.addRoom(25, 7, 5, 7, 'combat', 'crusher', L(4))
  b.pits(25, 7, 29, 13)
  for (const [i, j] of [[26, 7], [27, 7], [28, 7], [25, 13], [26, 13], [27, 13], [28, 13], [26, 10], [25, 10]] as const) {
    b.pit[b.k(i, j)] = 0
  }
  for (let j = 8; j <= 12; j++) b.pit[b.k(27, j)] = 0
  b.level(25, 10, 25, 10, L(5))
  b.ladders.push({ i: 26, j: 10, di: -1, dj: 0, y0: L(4), y1: L(5), side: true })
  // The harder ledge holds the better prize: a borrowed Core Master weapon
  // (`sim/borrowed.ts` places and pays it; the climb's runtime skips it).
  b.rewards.push({ x: cellCenter(25), z: cellCenter(10), y: L(5), room: 4, kind: 'weapon' })
  // Never over the first walkway cell: from the entry ledge the walk ahead
  // must be in view, crushers and all.
  const slams = rng() < 0.5 ? [9, 11] : [9, 11, 12]
  const beat = 2.4 + rng() * 0.5
  slams.forEach((j, n) => b.crushers.push({ i: 27, j, y: L(4), period: beat, phase: (n * 0.55 + rng() * 0.2) * beat, room: 4 }))
  b.checkpoint(27, 7, YAW_PZ, [[26, 7], [27, 7], [28, 7]])
  b.corridor(24, 13, -1, 0, 2, L(4))

  // ── 6 Drop descent ────────────────────────────────────────────────────────
  // Terraces a storey apart, stepping down to the floor: each ledge is a
  // one-way drop. Turrets on the terraces, a machine waiting at the bottom.
  b.addRoom(17, 11, 6, 5, 'combat', 'descent', L(4))
  b.level(21, 11, 21, 15, L(3))
  b.level(20, 11, 20, 15, L(2))
  b.level(19, 11, 19, 15, L(1))
  b.level(17, 11, 18, 15, L(0))
  b.checkpoint(22, 13, YAW_NX, [[22, 11], [22, 12], [22, 13], [22, 14], [22, 15]])
  b.foe('turret', 20, 11, YAW_PZ, [20, 11, 20, 11])
  b.foe('turret', 19, 15, YAW_NZ, [19, 15, 19, 15])
  b.foe('ground', 17, 12, YAW_PX, [17, 11, 18, 15])
  // A chest at the end of the first terrace down, against the side wall: a
  // detour on the way down, never in a drop's landing line.
  b.chest(21, 15, YAW_PZ)
  // The last checkpoint: the floor in front of the boss shutter.
  b.checkpoint(17, 13, YAW_NX, [[17, 11], [17, 12], [17, 13], [17, 14], [17, 15], [18, 11], [18, 12], [18, 13], [18, 14], [18, 15]])
  b.corridor(16, 13, -1, 0, 2, L(0), true)

  // ── 7 Arena ───────────────────────────────────────────────────────────────
  b.addRoom(8, 10, 7, 7, 'boss', 'arena', L(0))

  // ── The challenge room ────────────────────────────────────────────────────
  // North off the descent's floor (its first column), in the gap under the
  // rolling stairs: a side room the route walks past, never through.
  // (Not in the Scrapyard's tower: `challenge` false, `data/challenge.ts`.)
  if (challenge) b.challengeRoom(DESCENT, { mouth: { i: 17, j: 11, di: 0, dj: -1 } })

  // Start: on the pad in the hall, facing the stairs.
  const sx = cellCenter(3)
  const sz = cellCenter(6)
  const start = { x: sx, z: sz, yaw: Math.atan2(-(cellCenter(stairI) - sx), -(cellCenter(5) - sz)) }
  const map = finish(b, start, seed)
  return rng() < 0.5 ? mirrorX(map) : map
}
