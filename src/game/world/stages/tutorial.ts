import { cellCenter, type MapData } from '../levelGen'
import { Builder, finish, YAW_PX, YAW_NX } from './builder'

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
 *      (the corridor out: the Repair Gel plate and its lesson)
 *   6 Antechamber      a breather before the gate
 *   Arena              the Scrapper, 7 × 7
 *
 * Two rows: east along the top, back west along the bottom. Every floor at
 * y = 0 but the gap's pit. The seed changes nothing (a replay is the same
 * lesson); it only names the map.
 */

const W = 38
const H = 19

export const TUTORIAL_STEPS: string[][] = [['charge'], ['crate'], ['block'], ['gap'], ['chest'], ['slide'], ['rest']]

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
  // The gel corridor: three cells, so the plate has a cell before the door.
  b.corridor(18, 12, -1, 0, 3, y)

  // ── 6 Antechamber ─────────────────────────────────────────────────────────
  b.addRoom(11, 10, 5, 5, 'combat', 'hall', y)
  b.checkpoint(14, 12, YAW_NX, [[15, 11], [15, 12], [15, 13], [14, 12]])
  b.corridor(10, 12, -1, 0, 2, y, true)

  // ── Arena ─────────────────────────────────────────────────────────────────
  b.addRoom(2, 9, 7, 7, 'boss', 'arena', y)

  // Start: on the pad, facing the drones and the (hidden) way on.
  const start = { x: cellCenter(2), z: cellCenter(4), yaw: YAW_PX }
  const map = finish(b, start, seed)
  map.walkSteps = TUTORIAL_STEPS
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
