import { currentMission } from './boot'
import { profile, saveProfile, grantSkillChip, computeStats, markCheated } from './state/profile'
import { SECTORS, SECTOR_BY_ID } from './data/regions'
import { storyQuest, type Quest } from './data/quests'
import { rollItem } from './data/items'
import { levelMap } from './data/levelCatalog'
import { cellCenter, type Door, type MapData } from './world/levelGen'
import { createNav, isSolidAt, floorAt, type Nav } from './world/nav'
import { flow, startMission, goHub } from './flow'
import { hud } from './state/hud'
import type { SectorId } from './world/themes'
import { pushCelebration, type CelebrationKind } from './state/celebrate'

/**
 * The cheat panel's actions (#Cheat1, `CheatModal.vue`): debug shortcuts for
 * QA, behind `localStorage.cheat` (`useCheats`). Every action marks the save
 * as cheated (`markCheated`), and a cheated save never posts a leaderboard
 * score (`flow.finishMission`). Lives beside `cheats.ts` and is only reached
 * from it and from the modal, so a build without dev tools drops it too.
 */

export const CHEAT_BOLTS = 10000
export const CHEAT_CHIPS = 10

const commit = (): void => {
  markCheated()
  saveProfile()
}

/** Every sector open on the map, so every story mission can be deployed. */
export const unlockAllStory = (): void => {
  profile.world.unlocked = SECTORS.map(s => s.id)
  commit()
  // The lab's pedestals are built with the hub: rebuild it to show them.
  if (flow.screen === 'hub') goHub({ kind: 'home' })
}

export const grantBolts = (): void => {
  profile.bolts += CHEAT_BOLTS
  commit()
}

export const grantChips = (): void => {
  for (let k = 0; k < CHEAT_CHIPS; k++) grantSkillChip()
  commit()
}

/** One epic (prototype, the purple tier) blaster at Flux's level, into the
 *  stash with its NEW badge. */
export const grantEpicBlaster = (): void => {
  const it = rollItem((Date.now() >>> 0) ^ 0xc0ffee, profile.level, { rarity: 'prototype', slot: 'buster' })
  profile.inv.items.push(it)
  profile.inv.fresh.push(it.id)
  commit()
}

/** The Repair Gel pack full (never lowers a gift's one-over-the-cap). */
export const fillGels = (): void => {
  profile.inv.tanks = Math.max(profile.inv.tanks, computeStats().tanksMax)
  commit()
}

/** Replay a HUD celebration act (the Hard Hat's level-up, Atlas's objective
 *  checkmark) through the normal queue, sting included, without touching the
 *  level or the objective. The mission HUD draws them. Not a cheat on the
 *  save: it changes nothing. */
export const playCelebration = (kind: CelebrationKind): void => {
  pushCelebration(kind)
}

// ─── Door jumps ──────────────────────────────────────────────────────────────

/** A sector's story mission as the next deploy would build it (locked or not). */
export const storyQuestFor = (sector: SectorId): Quest =>
  storyQuest(SECTOR_BY_ID[sector], profile.level, profile.quests.storyAttempts[`story_${sector}`] ?? 0, profile.world.ngPlus)

export interface DoorSpot { x: number; y: number; z: number; yaw: number }

/**
 * Where to stand to face a door: back along its corridor from the doorway,
 * on the side Flux comes from (`dir` points into the boss or challenge room),
 * on a walkable cell and on that cell's floor, looking at the door.
 */
export const doorApproach = (nav: Nav, d: Door): DoorSpot => {
  const dx = cellCenter(d.i)
  const dz = cellCenter(d.j)
  const bx = d.axis === 'x' ? -d.dir : 0
  const bz = d.axis === 'z' ? -d.dir : 0
  let back = 4.5
  while (back > 1.5 && isSolidAt(nav, dx + bx * back, dz + bz * back)) back -= 0.5
  const x = dx + bx * back
  const z = dz + bz * back
  return { x, z, y: floorAt(nav, x, z), yaw: Math.atan2(bx, bz) }
}

export type DoorKind = 'boss' | 'challenge'

export const doorsOf = (map: MapData, kind: DoorKind): Door[] =>
  map.doors.filter(d => (kind === 'boss' ? d.boss : !!d.challenge))

/** What a sector's story map offers to jump to: its boss door(s) and
 *  challenge door(s), counted. */
export const storyDoors = (sector: SectorId): { boss: number; challenge: number } => {
  const map = levelMap(storyQuestFor(sector))
  return { boss: doorsOf(map, 'boss').length, challenge: doorsOf(map, 'challenge').length }
}

const sameMission = (q: Quest): boolean => {
  const f = flow.quest
  return !!currentMission() && flow.screen === 'mission' && !!f && f.id === q.id && f.template === q.template && f.seed === q.seed
}

const waitForPlay = async (ms = 20000): Promise<boolean> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (currentMission() && flow.screen === 'mission' && hud.phase === 'play') return true
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

/** Put Flux in front of a door of the running mission. */
export const placeAtDoor = (kind: DoorKind, index = 0): boolean => {
  const m = currentMission()
  const d = m && doorsOf(m.map, kind)[index]
  if (!m || !d) return false
  placeAt(doorApproach(m.nav, d))
  return true
}

/** Stand Flux on a spot of the running mission, still, facing its way. */
const placeAt = (s: DoorSpot): void => {
  const p = currentMission()!.player
  p.x = p.px = s.x
  p.z = p.pz = s.z
  p.y = p.py = p.safeY = s.y
  p.vx = p.vz = p.vy = 0
  p.ladder = -1
  p.path = null
  p.yaw = s.yaw
}

/** Jump to a door of a sector's story map: deploy into that mission first
 *  unless Flux is already in it, then stand him in front of the door. */
export const jumpToDoor = async (sector: SectorId, kind: DoorKind, index = 0): Promise<boolean> => {
  markCheated()
  saveProfile()
  const q = storyQuestFor(sector)
  if (!sameMission(q)) {
    await startMission(q)
    if (!(await waitForPlay())) return false
  }
  return placeAtDoor(kind, index)
}

/** Test seam: a story map with its nav, built like the mission builds it. */
export const storyNav = (sector: SectorId): Nav => createNav(levelMap(storyQuestFor(sector)))

// ─── Climb jumps ─────────────────────────────────────────────────────────────

/** A wall climb to jump to (#Climb1, `ClimbSpot`): the Blaze practice wall,
 *  a climb (`n` counts them, `h` its height in m), a shortcut's start or its
 *  battle room's drop. */
export type ClimbWarpKind = 'practice' | 'climb' | 'shortcut' | 'battle'
export interface ClimbWarp { kind: ClimbWarpKind; n: number; h: number; spot: DoorSpot }

/** Where a shaft is climbed from: the middle of its foot cell, on that
 *  cell's floor, facing the wall. */
export const ladderFoot = (nav: Nav, l: { i: number; j: number; di: number; dj: number }): DoorSpot => {
  const x = cellCenter(l.i)
  const z = cellCenter(l.j)
  return { x, z, y: floorAt(nav, x, z), yaw: Math.atan2(-l.di, -l.dj) }
}

/** Every climb of a map, in its terrain's order, from the layout the mission
 *  builds (so the seed and the mirroring follow): each at its first shaft's
 *  foot; a shortcut also on its balcony, past the door in, facing the drop. */
export const climbWarps = (map: MapData, nav: Nav): ClimbWarp[] => {
  const t = map.terrain
  const out: ClimbWarp[] = []
  let n = 0
  for (const c of t?.climbs ?? []) {
    const l = t!.ladders[c.ladders[0]!]
    if (!l) continue
    const h = Math.round((c.top.y - l.y0) * 10) / 10
    const kind: ClimbWarpKind = c.shortcut ? 'shortcut' : c.tier === 0 ? 'practice' : 'climb'
    out.push({ kind, n: kind === 'climb' ? ++n : 0, h, spot: ladderFoot(nav, l) })
    const d = c.shortcut && map.doors[c.shortcut.doorIn]
    if (d) {
      const bx = d.axis === 'x' ? d.dir : 0
      const bz = d.axis === 'z' ? d.dir : 0
      const x = cellCenter(d.i + bx)
      const z = cellCenter(d.j + bz)
      out.push({ kind: 'battle', n: 0, h, spot: { x, z, y: floorAt(nav, x, z), yaw: Math.atan2(-bx, -bz) } })
    }
  }
  return out
}

/** What a sector's story map offers to climb (labels only, for the panel). */
export const storyClimbs = (sector: SectorId): Array<Omit<ClimbWarp, 'spot'>> => {
  const map = levelMap(storyQuestFor(sector))
  return climbWarps(map, createNav(map)).map(({ kind, n, h }) => ({ kind, n, h }))
}

/** Put Flux at a climb of the running mission. */
export const placeAtClimb = (index: number): boolean => {
  const m = currentMission()
  const w = m && climbWarps(m.map, m.nav)[index]
  if (!w) return false
  placeAt(w.spot)
  return true
}

/** Jump to a climb of a sector's story map, deploying into it first unless
 *  Flux is already in it. */
export const jumpToClimb = async (sector: SectorId, index: number): Promise<boolean> => {
  markCheated()
  saveProfile()
  const q = storyQuestFor(sector)
  if (!sameMission(q)) {
    await startMission(q)
    if (!(await waitForPlay())) return false
  }
  return placeAtClimb(index)
}
