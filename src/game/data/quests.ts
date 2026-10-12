import type { SectorId } from '../world/themes'
import type { EnemyKind } from '../models/enemies'
import { SECTOR_BY_ID, enemyLevelFor, runLevelFor, type Sector } from './regions'
import { mulberry32, randInt, pick, weighted } from '../world/rng'
import { STAGE_LENGTH, isStageSector } from '../world/stages/meta'
import type { Rarity } from './items'

/**
 * ─── Missions ────────────────────────────────────────────────────────────────
 *
 * Story missions (one per sector: fight through to the Core Master) and the
 * repeatable Blades-style JOBS the terminal offers three at a time. Every
 * mission carries its own map seed, so taking a job builds a fresh sector map.
 *
 * The story missions of Blaze, Cryo, Volt and Gale are platform STAGES
 * (`world/stages/`, template 'stage'); the Scrapyard's is the tutorial and
 * the Fortress's the classic room labyrinth ('boss').
 */

export type QuestTemplate = 'tutorial' | 'boss' | 'kill' | 'collect' | 'rescue' | 'elite' | 'supply' | 'purge' | 'climb' | 'stage'

export interface Quest {
  id: string
  kind: 'story' | 'job'
  template: QuestTemplate
  sector: SectorId
  seed: number
  level: number
  /** kill: which machine; elite: its archetype. */
  target: EnemyKind | null
  count: number
  rooms: number
  reward: { xp: number; bolts: number; rarityBias: number; guaranteed?: Rarity }
}

export const JOB_TEMPLATES: Array<[QuestTemplate, number]> = [
  ['kill', 3], ['collect', 2.5], ['purge', 1.5], ['elite', 1.6], ['supply', 1.6], ['rescue', 1.8]
]
/** The climb's weight on the board, once some sector's Core Master is down
 *  (it is a rematch at the top of that sector's tower). */
export const CLIMB_WEIGHT = 1.4

export const rewardFor = (template: QuestTemplate, level: number, story: boolean): Quest['reward'] => {
  const base = 40 + level * 18
  const mul: Record<QuestTemplate, number> = {
    tutorial: 1.2, boss: 2.6, kill: 1, collect: 1.05, rescue: 1.15, elite: 1.35, supply: 1.1, purge: 1.3, climb: 2.6, stage: 2.6
  }
  // A climb and a stage end in a Core Master fight: they pay like one.
  const bossLike = template === 'boss' || template === 'climb' || template === 'stage'
  return {
    xp: Math.round(base * mul[template] * (story ? 1.3 : 1)),
    bolts: Math.round((30 + level * 12) * mul[template]),
    rarityBias: bossLike ? 1.5 : template === 'elite' || template === 'purge' ? 0.8 : 0.3,
    guaranteed: bossLike ? 'prototype' : undefined
  }
}

/** The first mission, "Wake-Up Call". Its seed is chosen for its layout: a
 *  one-door start room facing that door, then four rooms on the way to the
 *  Scrapper — one per walkthrough lesson (`sim/walkthrough.ts`) — with two
 *  short side rooms. `tests/game/walkthrough.test.ts` pins that shape. */
export const tutorialQuest = (): Quest => ({
  id: 'story_tutorial',
  kind: 'story',
  template: 'tutorial',
  sector: 'scrapyard',
  seed: 20261916,
  level: 1,
  target: null,
  count: 1,
  rooms: 7,
  reward: { xp: 120, bolts: 80, rarityBias: 0.5, guaranteed: 'tuned' }
})

/** A sector's story mission: its platform stage where it has one, else
 *  the labyrinth to its Core Master (`bossQuest`). */
export const storyQuest = (sector: Sector, playerLevel: number, attempt: number, ng = 0): Quest =>
  isStageSector(sector.id) ? stageQuest(sector, playerLevel, attempt, ng) : bossQuest(sector, playerLevel, attempt, ng)

/** The room labyrinth to a Core Master: the Fortress's story mission (and
 *  the Scrapyard's replay), and the lab's showdown in any sector. */
export const bossQuest = (sector: Sector, playerLevel: number, attempt: number, ng = 0): Quest => {
  const level = enemyLevelFor(sector, playerLevel, 1, ng)
  return {
    id: `story_${sector.id}`,
    kind: 'story',
    template: 'boss',
    sector: sector.id,
    seed: (sector.id.length * 7919 + attempt * 104729 + 12345) >>> 0,
    level,
    target: null,
    count: 1,
    rooms: sector.rooms[1],
    reward: rewardFor('boss', level, true)
  }
}

/** A platform stage (`world/stages/`): its sections and the arena are the
 *  rooms; the seed is the attempt's, as a labyrinth's. */
const stageQuest = (sector: Sector, playerLevel: number, attempt: number, ng = 0): Quest => {
  const level = enemyLevelFor(sector, playerLevel, 1, ng)
  return {
    id: `story_${sector.id}`,
    kind: 'story',
    template: 'stage',
    sector: sector.id,
    seed: (sector.id.length * 7919 + attempt * 104729 + 12345) >>> 0,
    level,
    target: null,
    count: 1,
    rooms: isStageSector(sector.id) ? STAGE_LENGTH[sector.id] + 1 : sector.rooms[1],
    reward: rewardFor('stage', level, true)
  }
}

/**
 * A Tower Run: the climb (`world/climbGen.ts`) up a sector whose Core Master
 * is already down, ending in a rematch with it. `sectors` are the eligible
 * ones (see `climbSectors`).
 */
export const climbJob = (seed: number, sectors: SectorId[], playerLevel: number, ng = 0): Quest => {
  const rng = mulberry32(seed ^ 0x7c1b)
  const sid = pick(rng, sectors)
  const sector = SECTOR_BY_ID[sid]
  // No band top: a run follows Flux's level (and his kit, `runScaling`).
  const level = runLevelFor(sector, playerLevel, randInt(rng, 0, 1))
  return {
    id: `job_${seed.toString(36)}`,
    kind: 'job',
    template: 'climb',
    sector: sid,
    seed: (seed * 2654435761) >>> 0,
    level,
    target: null,
    count: 1,
    rooms: 7,
    reward: rewardFor('climb', level, false)
  }
}

/** A board run whose machines follow Flux past the band and his kit too
 *  (`sim/adaptive.ts` `runScaling`): a Tower Run, a supply run. */
export const isBoardRun = (q: Pick<Quest, 'kind' | 'template'> | null | undefined): boolean =>
  !!q && q.kind === 'job' && (q.template === 'climb' || q.template === 'supply')

/** Sectors a climb may be offered in: unlocked, and their boss beaten. */
export const climbSectors = (unlocked: readonly SectorId[], bosses: readonly string[]): SectorId[] =>
  unlocked.filter(id => bosses.includes(SECTOR_BY_ID[id].boss))

/**
 * A job for the board. `climbs` are the sectors a climb may roll in (none:
 * the classic six templates, drawn exactly as before, so a board rolled
 * without climbs is unchanged seed for seed).
 */
export const rollJob = (seed: number, sectors: SectorId[], playerLevel: number, climbs: readonly SectorId[] = [], ng = 0): Quest => {
  const rng = mulberry32(seed)
  const sid = pick(rng, sectors)
  const sector = SECTOR_BY_ID[sid]
  const climb: [QuestTemplate, number] = ['climb', CLIMB_WEIGHT]
  const template = weighted(rng, climbs.length ? [...JOB_TEMPLATES, climb] : JOB_TEMPLATES)
  if (template === 'climb') return climbJob(seed, [...climbs], playerLevel, ng)
  const delta = randInt(rng, -1, 1)
  // A supply run follows Flux past the band, like a Tower Run.
  const level = template === 'supply' ? runLevelFor(sector, playerLevel, delta) : enemyLevelFor(sector, playerLevel, delta, ng)
  const kinds = sector.encounters.kinds.filter(([k]) => k !== 'turret').map(([k, w]) => [k, w] as const)
  let target: EnemyKind | null = null
  let count = 1
  switch (template) {
    case 'kill':
      target = weighted(rng, kinds)
      count = randInt(rng, 5, 9)
      break
    case 'collect':
      count = randInt(rng, 3, 5)
      break
    case 'supply':
      count = randInt(rng, 3, 4)
      break
    case 'elite':
      target = weighted(rng, kinds.filter(([k]) => k !== 'hardhat'))
      break
    default:
      break
  }
  return {
    id: `job_${seed.toString(36)}`,
    kind: 'job',
    template,
    sector: sid,
    seed: (seed * 2654435761) >>> 0,
    level,
    target,
    count,
    rooms: randInt(rng, sector.rooms[0], sector.rooms[1]),
    reward: rewardFor(template, level, false)
  }
}
