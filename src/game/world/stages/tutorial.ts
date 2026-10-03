import { cellCenter, type MapData } from '../levelGen'
import { Builder, finish, YAW_PX, YAW_NX, YAW_PZ } from './builder'

/**
 * ─── "Wake-Up Call": the first mission as a built stage ─────────────────────
 *
 * The tutorial used to be a labyrinth from a hand-picked seed. Playtests
 * wanted things a labyrinth cannot give: a gap to leap in the first mission,
 * the rooms in a fixed teaching order with the slide right before the boss,
 * and a first door that is no door at all until the first lesson is done.
 * So it is a stage now (the scrapyard theme, flat but for one spiked gap),
 * and the walkthrough (`sim/walkthrough.ts`) reads its lessons per room from
 * `walkSteps`:
 *
 *   0 Start pad        the charge shot: two blue training drones (a demo one
 *                      and the player's); the lesson starts with Flux's first
 *                      step toward them. The room is walled in: the way on
 *                      (its corridor and door) is behind a wall like the
 *                      others until the charged shot pops the player's drone
 *   1 Salvage bay      a Hardhat, then the glowing crate (charge's second use)
 *   2 Shield hall      the Shield Trooper: block (and the perfect block)
 *   3 The gap          a spiked gap across the room: walk off the edge and
 *                      the edge-leap carries Flux over (arrows mark it)
 *   4 Store room       a chest: open it
 *   5 Stomper yard     the Stomper's red ring: slide out of it
 *   6 Drone room       two rotor drones: lock on and shoot (a playtest ask:
 *                      the level had shrunk to its lessons)
 *   7 Wheel hall       a running wheel and a Shield Trooper together
 *   8 Golem room       one crate golem, asleep as a crate
 *      (the long corridor out: the Repair Gel plate and its lesson, with a
 *      whole room between it and the boss door, so the lesson never fires
 *      while the player is already at the shutter)
 *   9 Antechamber      a breather before the gate
 *   Arena              the Scrapper, 7 × 7
 *
 * Three rows: east along the top, back west through the middle, east again
 * along the bottom. Every floor at y = 0 but the gap's pit. The seed changes
 * nothing (a replay is the same lesson); it only names the map.
 */

const W = 38
const H = 27

export const TUTORIAL_STEPS: string[][] = [
  ['charge'], ['crate'], ['block'], ['gap'], ['chest'], ['slide'], ['clear'], ['clear'], ['clear'], ['rest']
]
/** Who stands in each walkthrough room (by its place on the path), where the
 *  lesson's own teacher is not enough: the fighting rooms after the lessons. */
export const TUTORIAL_CAST: string[][] = [[], [], [], [], [], [], ['heli', 'heli'], ['roller', 'trooper'], ['golem'], []]

export const generateWakeUpCall = (seed: number): MapData => {
  const b = new Builder(W, H)
  const y = 0

  // ── 0 Start pad ───────────────────────────────────────────────────────────
  b.addRoom(1, 2, 6, 6, 'start', 'hall', y)
  b.checkpoint(2, 4, YAW_PX, [[2, 3], [2, 4], [2, 5], [3, 4]])
  b.corridor(7, 4, 1, 0, 2, y)

  // ── 1 Salvage bay ─────────────────────────────────────────────────────────
  b.addRoom(9, 1, 6, 7, 'combat', 'hall', y)
  b.checkpoint(10, 4, YAW_PX, [[9, 3], [9, 4], [9, 5], [10, 4]])
  b.corridor(15, 4, 1, 0, 2, y)

  // ── 2 Shield hall ─────────────────────────────────────────────────────────
  b.addRoom(17, 1, 7, 7, 'combat', 'hall', y)
  b.checkpoint(18, 4, YAW_PX, [[17, 3], [17, 4], [17, 5], [18, 4]])
  b.corridor(24, 4, 1, 0, 2, y)

  // ── 3 The gap ─────────────────────────────────────────────────────────────
  // A one-cell spiked gap across the whole room: the edge-leap's own lesson.
  b.addRoom(26, 2, 8, 5, 'combat', 'hall', y)
  b.pits(30, 2, 30, 6)
  b.pitKind(3, 'spikes')
  b.link([29, 4], [31, 4], 'leap')
  b.checkpoint(27, 4, YAW_PX, [[26, 3], [26, 4], [26, 5], [27, 4]])
  b.corridor(32, 7, 0, 1, 3, y)

  // ── 4 Store room ──────────────────────────────────────────────────────────
  b.addRoom(29, 10, 7, 6, 'treasure', 'hall', y)
  b.chest(34, 13, YAW_NX)
  b.checkpoint(32, 11, YAW_NX, [[31, 10], [32, 10], [33, 10], [32, 11]])
  b.corridor(28, 12, -1, 0, 2, y)

  // ── 5 Stomper yard ────────────────────────────────────────────────────────
  b.addRoom(19, 9, 8, 8, 'combat', 'hall', y)
  b.checkpoint(25, 12, YAW_NX, [[26, 11], [26, 12], [26, 13], [25, 12]])
  b.corridor(18, 12, -1, 0, 2, y)

  // ── 6 Drone room ──────────────────────────────────────────────────────────
  b.addRoom(11, 10, 6, 6, 'combat', 'hall', y)
  b.checkpoint(16, 12, YAW_NX, [[16, 11], [16, 12], [16, 13], [15, 12]])
  b.corridor(10, 12, -1, 0, 2, y)

  // ── 7 Wheel hall ──────────────────────────────────────────────────────────
  b.addRoom(2, 9, 7, 7, 'combat', 'hall', y)
  b.checkpoint(8, 12, YAW_NX, [[8, 11], [8, 12], [8, 13], [7, 12]])
  b.corridor(5, 16, 0, 1, 2, y)

  // ── 8 Golem room ──────────────────────────────────────────────────────────
  b.addRoom(2, 18, 7, 6, 'combat', 'hall', y)
  b.checkpoint(5, 18, YAW_PZ, [[4, 18], [5, 18], [6, 18], [5, 19]])
  // The gel corridor: six cells, the plate well before the door.
  b.corridor(9, 21, 1, 0, 6, y)

  // ── 9 Antechamber ─────────────────────────────────────────────────────────
  b.addRoom(15, 19, 5, 5, 'combat', 'hall', y)
  b.checkpoint(15, 21, YAW_PX, [[15, 20], [15, 21], [15, 22], [16, 21]])
  b.corridor(20, 21, 1, 0, 2, y, true)

  // ── Arena ─────────────────────────────────────────────────────────────────
  b.addRoom(22, 18, 7, 7, 'boss', 'arena', y)

  // Start: on the pad, facing the drones and the (hidden) way on.
  const start = { x: cellCenter(2), z: cellCenter(4), yaw: YAW_PX }
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  const map = finish(b, start, seed)
  map.walkSteps = TUTORIAL_STEPS
  map.walkCast = TUTORIAL_CAST
  // A built stage lists no spots; the scripted cast and the crate lesson
  // need them: every floor cell of a room, less its doorways.
  const doorCells = new Set<number>()
  for (const d of map.doors) {
    doorCells.add(d.j * W + d.i)
    doorCells.add((d.j + (d.axis === 'z' ? d.dir : 0)) * W + d.i + (d.axis === 'x' ? d.dir : 0))
  }
  for (const r of map.rooms) {
    r.spots = []
    for (let j = r.z0; j < r.z0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        const k = j * W + i
        if (map.terrain!.pit[k] || doorCells.has(k)) continue
        r.spots.push([i, j])
      }
    }
  }
  return map
}
