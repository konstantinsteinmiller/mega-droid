import type { EnemyKind } from '../models/enemies'
import type { Element } from '../data/enemies'
import type { MapData, Room } from '../world/levelGen'
import { CELL, cellCenter, roomCenter } from '../world/levelGen'
import { mulberry32, weighted } from '../world/rng'
import { hasLineOfSight, isSolidAt, type Nav } from '../world/nav'
import { createEnemy } from './enemies'
import type { Enemy } from './world'
import type { Slice } from '../engine/slicer'
import { TEACHER, doorwayOf, roomHoloSpot, type WalkPlan } from './walkthrough'
import { HOLO_TROOPER_X } from '../fx/lessonHologram'
import { THEMES, type SectorId } from '../world/themes'

/**
 * Encounter placement: which machines stand in which room. Deterministic from
 * the map seed so a resumed mission rebuilds the same cast (the snapshot then
 * removes the ones already destroyed).
 */

export interface EncounterTable {
  kinds: Array<[EnemyKind, number]>
  element: Element
  /** Enemies per 9 floor cells, roughly. */
  density: number
  eliteChance: number
  /** Chance that a combat or objective room hides a crate golem (one at most). */
  golems?: number
  /** Whose supply crates the golems wear (they must match the room's real
   *  crates exactly, so without a theme no golem is placed). */
  theme?: SectorId
}

/** Wall spots left free at the END of a room's list: MissionObjects takes
 *  its chests and crates from there (a bonus chest, a supply chest, 3 crates). */
const OBJECT_WALL_SPOTS = 5

/** Async so the rig builds can be time-sliced (`opts.slice`): a dozen skinned
 *  machines is the second-heaviest part of a mission build. The RNG never
 *  sees the yields, so the order (which resume snapshots index) is stable. */
export const spawnEncounters = async (
  map: MapData, table: EncounterTable, level: number,
  opts: { slice?: Slice; onProgress?: (f01: number) => void } = {}
): Promise<Enemy[]> => {
  const rng = mulberry32(map.seed ^ 0xe11e)
  const out: Enemy[] = []
  /** Wall spots each room's turrets took from the front (golems go next). */
  const wallsUsed = new Map<number, number>()
  for (const room of map.rooms) {
    if (room.role === 'start' || room.role === 'boss') continue
    const area = room.w * room.h
    let n: number
    if (room.role === 'treasure') n = 1 + (rng() < 0.5 ? 1 : 0)
    else if (room.role === 'objective') n = Math.max(2, Math.round((area / 9) * table.density) + 1)
    else n = Math.max(1, Math.round((area / 9) * table.density))
    n = Math.min(n, 6, room.spots.length)
    const [cx, cz] = roomCenter(room)
    let placed = 0
    let spotIdx = 0
    let wallIdx = 0
    while (placed < n && spotIdx < room.spots.length) {
      let kind = weighted(rng, table.kinds)
      let x: number
      let z: number
      if (kind === 'turret') {
        const ws = room.wallSpots[wallIdx++]
        if (!ws) { kind = 'hardhat'; continue }
        x = cellCenter(ws[0])
        z = cellCenter(ws[1])
      } else {
        const sp = room.spots[spotIdx++]!
        x = cellCenter(sp[0]) + (rng() - 0.5) * 1.2
        z = cellCenter(sp[1]) + (rng() - 0.5) * 1.2
      }
      const elite = room.role !== 'treasure' && rng() < table.eliteChance
      const e = createEnemy(kind, level, x, z, room.id, { elite, element: table.element })
      e.yaw = Math.atan2(cx - x, cz - z) + (rng() - 0.5) * 0.8
      out.push(e)
      placed++
      await opts.slice?.()
    }
    wallsUsed.set(room.id, wallIdx)
    opts.onProgress?.((room.id + 1) / map.rooms.length)
  }
  for (const e of placeGolems(map, table, level, wallsUsed)) {
    out.push(e)
    await opts.slice?.()
  }
  return out
}

/**
 * Crate golems: now and then a combat or objective room has one asleep where
 * a crate would stand — on a free wall spot (after the turrets' from the
 * front, clear of the objects' at the end), pushed toward the wall the way
 * `MissionObjects` pushes its crates, facing into the room. Their own RNG
 * stream, placed after the rolled cast: adding them moved no other machine's
 * roll, and a resume rebuilds them in the same slots of the list. Never in
 * the tutorial (`spawnTutorial` has its own scripted cast).
 */
export const placeGolems = (
  map: MapData, table: EncounterTable, level: number, wallsUsed: ReadonlyMap<number, number> = new Map()
): Enemy[] => {
  const out: Enemy[] = []
  if (!table.golems || !table.theme) return out
  const theme = THEMES[table.theme]
  const rng = mulberry32(map.seed ^ 0x601e)
  for (const room of map.rooms) {
    if (room.role !== 'combat' && room.role !== 'objective') continue
    // Rolled for every room, so one room's odds never shift another's
    const roll = rng()
    const pick = rng()
    const along = rng()
    const out01 = rng()
    const turn = rng()
    const elite = rng() < table.eliteChance
    if (roll >= table.golems) continue
    const first = wallsUsed.get(room.id) ?? 0
    const free = room.wallSpots.length - OBJECT_WALL_SPOTS - first
    if (free <= 0) continue
    const ws = room.wallSpots[first + Math.floor(pick * Math.min(free, 2))]!
    // Toward the wall like a crate (0.7 m ± a little), slid along it
    const nx = -Math.sin(ws[2])
    const nz = -Math.cos(ws[2])
    const push = 0.7 + (out01 - 0.5) * 0.3
    const slide = (along - 0.5) * 0.8
    const x = cellCenter(ws[0]) + nx * push - nz * slide
    const z = cellCenter(ws[1]) + nz * push + nx * slide
    const e = createEnemy('golem', level, x, z, room.id, { elite, theme })
    e.yaw = ws[2] + (turn - 0.5) * 0.6
    out.push(e)
  }
  return out
}

/** A side room this big gets a second Hardhat. */
const SIDE_PAIR_SPOTS = 16
/** Where a teacher stands: about this far from the door the player comes in by. */
const TEACH_DIST = 8

/**
 * The tutorial's cast, scripted rather than rolled (see `walkthrough.ts`):
 * each walkthrough room gets exactly the machine its lesson needs, a side
 * room a Hardhat or two — none where a chest waits — and nothing that could
 * pass for the boss before the Scrapper: no Guardroid, no elite (a Guardroid
 * in the Scrapyard was taken for "the boss" in the blind playtest). Each
 * machine stands in plain view of the door the player enters by, facing it.
 * No RNG, so a resume rebuilds the very same cast.
 */
export const spawnTutorial = async (
  map: MapData, nav: Nav, plan: WalkPlan, level: number,
  opts: { chestRooms?: ReadonlySet<number>; slice?: Slice; onProgress?: (f01: number) => void } = {}
): Promise<Enemy[]> => {
  const out: Enemy[] = []
  for (const room of map.rooms) {
    if (room.role === 'start' || room.role === 'boss') continue
    const gate = plan.gates.find(g => g.room === room.id)
    const kinds: EnemyKind[] = []
    // A built tutorial casts some rooms itself (the fighting rooms after the lessons).
    const cast = gate ? map.walkCast?.[plan.gates.indexOf(gate)] : undefined
    if (cast?.length) {
      kinds.push(...(cast as EnemyKind[]))
    } else if (gate) {
      for (const s of gate.steps) {
        const k = TEACHER[s]
        if (k) kinds.push(k)
      }
    } else if (!opts.chestRooms?.has(room.id)) {
      kinds.push('hardhat')
      if (room.spots.length >= SIDE_PAIR_SPOTS) kinds.push('hardhat')
    }
    const [dx, dz] = doorwayOf(map, room.id)
    const taken: Array<[number, number]> = []
    for (const kind of kinds) {
      // The block lesson's Trooper stands beside the hologram's own, 2 m to
      // its left as seen from the way in (`besideHoloTrooper`): next to the
      // entrance (#128) players turned to it first and the hologram was off
      // screen; at the far exit it was away from the hologram too. The exit
      // spot stays as the fallback.
      const blockTeacher = kind === 'trooper' && !!gate?.steps.includes('block')
      const at = (blockTeacher ? besideHoloTrooper(nav, map, plan, room) ?? exitSpot(nav, map, room, gate!.door, dx, dz, taken) : null) ?? teachSpot(nav, room, dx, dz, taken)
      if (!at) break
      taken.push(at)
      const e = createEnemy(kind, level, at[0], at[1], room.id)
      e.yaw = Math.atan2(dx - at[0], dz - at[1])
      // Held in its own room: an unleashed Hardhat wandered back into an
      // earlier room, and a gate waiting for its room to go quiet sent the
      // player all the way back (a playtest note).
      e.leash = roomLeash(room)
      // The block lesson's Trooper keeps its spot: it walked out of the room.
      if (blockTeacher) e.rooted = true
      out.push(e)
      await opts.slice?.()
    }
    opts.onProgress?.((room.id + 1) / map.rooms.length)
  }
  return out
}

/** A room's floor, less a margin from its walls, as a machine's leash. */
export const roomLeash = (room: Room): [number, number, number, number] =>
  [room.x0 * CELL + 0.75, room.z0 * CELL + 0.75, (room.x0 + room.w) * CELL - 0.75, (room.z0 + room.h) * CELL - 0.75]

/** A floor cell about TEACH_DIST from the doorway, in sight of it, clear of
 *  the machines already placed. */
const teachSpot = (nav: Nav, room: Room, dx: number, dz: number, taken: Array<[number, number]>): [number, number] | null => {
  let best: [number, number] | null = null
  let bestScore = Infinity
  for (const [i, j] of room.spots) {
    const x = cellCenter(i)
    const z = cellCenter(j)
    if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3)) continue
    const score = Math.abs(Math.hypot(x - dx, z - dz) - TEACH_DIST) + (hasLineOfSight(nav, dx, dz, x, z) ? 0 : 6)
    if (score < bestScore) {
      best = [x, z]
      bestScore = score
    }
  }
  return best
}

/** How far into the room from its exit's mouth the block lesson's Trooper stands (m). */
export const EXIT_GUARD = 3.2

/**
 * A floor cell EXIT_GUARD metres into the room from the mouth of its way out
 * (door `doorId`), toward the room's middle, in sight of the entrance.
 */
export const exitSpot = (
  nav: Nav, map: MapData, room: Room, doorId: number, dx: number, dz: number, taken: Array<[number, number]>
): [number, number] | null => {
  const d = map.doors[doorId]
  if (!d) return null
  const ox = cellCenter(d.i)
  const oz = cellCenter(d.j)
  // The mouth: the room's floor cell nearest the exit door.
  let mx = 0
  let mz = 0
  let near = Infinity
  for (const [i, j] of room.spots) {
    const l = Math.hypot(cellCenter(i) - ox, cellCenter(j) - oz)
    if (l < near) { near = l; mx = cellCenter(i); mz = cellCenter(j) }
  }
  if (!Number.isFinite(near)) return null
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const il = Math.hypot(cx - mx, cz - mz) || 1
  const ux = (cx - mx) / il
  const uz = (cz - mz) / il
  let best: [number, number] | null = null
  let bestScore = Infinity
  for (const [i, j] of room.spots) {
    const x = cellCenter(i)
    const z = cellCenter(j)
    if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3)) continue
    const along = (x - mx) * ux + (z - mz) * uz
    const off = Math.abs((x - mx) * uz - (z - mz) * ux)
    const score = Math.abs(along - EXIT_GUARD) + off + (hasLineOfSight(nav, dx, dz, x, z) ? 0 : 6)
    if (score < bestScore) { best = [x, z]; bestScore = score }
  }
  return best
}

/** The real Trooper this far (m) to the left of the hologram's, as the
 *  player sees them walking in. */
export const TROOPER_BESIDE_HOLO = 2

/**
 * The block lesson's Trooper (playtest 2026-10-07): beside the hologram's
 * own, TROOPER_BESIDE_HOLO to its left as seen from the way in — the
 * player looks at the hologram and the machine it is about in one view.
 * Null when that point is not open floor of the room (then the old spot,
 * at the exit, `exitSpot`).
 */
export const besideHoloTrooper = (nav: Nav, map: MapData, plan: WalkPlan, room: Room): [number, number] | null => {
  const h = roomHoloSpot(map, plan, room.id)
  if (!h) return null
  // The hologram's line, into the room; its Trooper stands HOLO_TROOPER_X along it.
  const ux = Math.cos(h.yaw)
  const uz = -Math.sin(h.yaw)
  // Left of a view along (ux, uz) is (uz, -ux).
  const x = h.x + ux * HOLO_TROOPER_X + uz * TROOPER_BESIDE_HOLO
  const z = h.z + uz * HOLO_TROOPER_X - ux * TROOPER_BESIDE_HOLO
  if (isSolidAt(nav, x, z) || roomOf(map, x, z)?.id !== room.id) return null
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    if (isSolidAt(nav, x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9)) return null
  }
  return [x, z]
}

export const roomOf = (map: MapData, x: number, z: number): Room | null => {
  const i = Math.floor(x / 3)
  const j = Math.floor(z / 3)
  const id = map.room[j * map.w + i]
  return id !== undefined && id >= 0 ? map.rooms[id]! : null
}
