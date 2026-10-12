import { generateWakeUpCall } from '../world/stages/tutorial'
import type { SectorId } from '../world/themes'
import { generateMap, type MapData } from '../world/levelGen'
import { generateClimb } from '../world/climbGen'
import { generateStage, STAGE_LENGTH, type StageSector } from '../world/stages'
import { MAX_LEVEL } from './progression'
import { SECTORS, SECTOR_BY_ID } from './regions'
import { tutorialQuest, storyQuest, bossQuest, climbJob, rollJob, type Quest, type QuestTemplate } from './quests'
import { hasChallengeRoom } from './challenge'

/**
 * ─── Level catalog (DEV: the level lab, `/levels`) ───────────────────────────
 *
 * Every kind of level the game can generate, each built by the game's OWN
 * quest builder (`tutorialQuest`, `storyQuest`, `rollJob`, `climbJob`), so a
 * level launched from the lab (`views/LevelLab.vue`) is the real level and not
 * a look-alike.
 *
 * A level type IS a quest template. The template alone decides the map
 * (`setupFromQuest`: the climb is `generateClimb`'s tower, a stage the
 * sector's platform stage (`world/stages/`), every other one the room
 * labyrinth of `generateMap`, with a boss room for `boss` and `tutorial`),
 * the objective and the cast. The climb's sections are parts of
 * every tower (all seven, always in order), not separate levels. So the
 * catalog is keyed by `QuestTemplate`: a new template does not type-check
 * until it has an entry here, and from then on the lab lists it without
 * anyone touching the page. A new map generator is a new `MapKind`, which
 * does not type-check until `MAPS` can build it.
 *
 * Nothing here is imported by the game itself: the lab's route and the boot
 * hook in `flow.ts` both sit behind `import.meta.env.DEV`.
 */

/** Which generator builds the map. */
export type MapKind = 'rooms' | 'climb' | 'stage' | 'tutorial'

/** What the lab's seed feeds: a job-board roll (`rollJob` / `climbJob`), the
 *  story attempt number (`storyQuest`; 0 = a first try), or nothing at all
 *  (a hand-picked map). */
export type SeedKind = 'board' | 'attempt' | 'fixed'

export interface LevelType {
  template: QuestTemplate
  /** The in-game title. */
  name: string
  /** One line on what the level asks of the player. */
  blurb: string
  map: MapKind
  /** It ends in a Core Master fight (its map has the boss room). */
  boss: boolean
  /** The sectors it can be built in, in story order. */
  sectors: readonly SectorId[]
  seed: SeedKind
  /** A new level design: flagged in the lab. */
  isNew: boolean
  /** The level's quest, from the game's own builder. `playerLevel` is the
   *  level the enemies scale to (inside the sector's band). */
  build: (sector: SectorId, seed: number, playerLevel: number) => Quest
}

const ALL_SECTORS: readonly SectorId[] = SECTORS.map(s => s.id)
/** The sectors whose story mission is a platform stage, in story order. */
const STAGE_SECTORS: readonly SectorId[] = ALL_SECTORS.filter(s => s in STAGE_LENGTH) as StageSector[]

/** How far past the seed `rollAs` looks. The rarest job is one board roll in
 *  eight, so 512 misses in a row (~1e-30) never happens. */
const ROLL_TRIES = 512

/**
 * A job of one template in one sector, as the job board draws it: the first
 * board seed at or after `seed` whose `rollJob` comes out as that template.
 * Target, count, rooms, enemy level and map seed are all the board's own
 * draw, so a lab job is exactly a job the board can offer.
 */
export const rollAs = (template: QuestTemplate, sector: SectorId, seed: number, playerLevel: number): Quest => {
  let s = seed >>> 0
  for (let n = 0; n < ROLL_TRIES; n++, s = (s + 1) >>> 0) {
    const q = rollJob(s, [sector], playerLevel)
    if (q.template === template) return q
  }
  throw new Error(`[levelCatalog] no ${template} job in ${sector} within ${ROLL_TRIES} seeds of ${seed}`)
}

const job = (template: QuestTemplate, name: string, blurb: string): LevelType => ({
  template, name, blurb, map: 'rooms', boss: false, sectors: ALL_SECTORS, seed: 'board', isNew: false,
  build: (sector, seed, playerLevel) => rollAs(template, sector, seed, playerLevel)
})

/** Every level type, in the order the lab lists them. */
export const LEVEL_TYPES: Record<QuestTemplate, LevelType> = {
  climb: {
    template: 'climb',
    name: 'Tower Run',
    blurb: 'The platformer: up the tower (stairs, ladders, scrap balls, lifts, crushers, drops), then down into a Core Master rematch. '
      + 'The board only offers it where that boss is down; the lab builds it in any sector.',
    map: 'climb',
    boss: true,
    sectors: ALL_SECTORS,
    seed: 'board',
    isNew: true,
    build: (sector, seed, playerLevel) => climbJob(seed, [sector], playerLevel)
  },
  stage: {
    template: 'stage',
    name: 'Platform Stage',
    blurb: 'A sector\'s story mission as a hand-built platformer (Meltdown Descent, Glacier Run, Rail Rush, Sky Docks), '
      + 'ending in its Core Master\'s arena. The seed is the attempt number (0 = a first try).',
    map: 'stage',
    boss: true,
    sectors: STAGE_SECTORS,
    seed: 'attempt',
    isNew: true,
    build: (sector, seed, playerLevel) => storyQuest(SECTOR_BY_ID[sector], playerLevel, seed)
  },
  tutorial: {
    template: 'tutorial',
    name: 'Wake-Up Call',
    blurb: 'The first mission: the guided walkthrough to the Scrapper — a built stage, a lesson per room. Seed and level change nothing.',
    map: 'tutorial',
    boss: true,
    sectors: ['scrapyard'],
    seed: 'fixed',
    isNew: false,
    build: () => tutorialQuest()
  },
  boss: {
    template: 'boss',
    name: 'Core Master Showdown',
    blurb: 'Through a labyrinth of rooms to the Core Master: the Fortress\'s story mission (the stage sectors\' before their stages). '
      + 'The seed is the attempt number (0 = a first try).',
    map: 'rooms',
    boss: true,
    sectors: ALL_SECTORS,
    seed: 'attempt',
    isNew: false,
    build: (sector, seed, playerLevel) => bossQuest(SECTOR_BY_ID[sector], playerLevel, seed)
  },
  kill: job('kill', 'Scrap Duty', 'Destroy a number of one kind of machine.'),
  collect: job('collect', 'Data Recovery', 'Recover the data cores scattered through the sector.'),
  rescue: job('rescue', 'Rescue Op', 'Find the stranded worker-bot and beam it out.'),
  elite: job('elite', 'Elite Hunt', 'Hunt down one elite machine.'),
  supply: job('supply', 'Supply Run', 'Crack open a number of supply chests.'),
  purge: job('purge', 'Sector Purge', 'Destroy every machine in the sector.')
}

/** The level types in list order. */
export const levelTypes = (): LevelType[] => Object.values(LEVEL_TYPES)

/** Every level the lab offers: each type in each sector it applies to. */
export const levelEntries = (): Array<{ type: LevelType; sector: SectorId }> =>
  levelTypes().flatMap(type => type.sectors.map(sector => ({ type, sector })))

/** One level: a type, a sector, a seed and the player level enemies scale to. */
export interface LevelPick {
  template: QuestTemplate
  sector: SectorId
  seed: number
  playerLevel: number
}

export const buildLevel = (p: LevelPick): Quest => LEVEL_TYPES[p.template].build(p.sector, p.seed, p.playerLevel)

/** The map a mission builds for the quest, by the same rule as
 *  `setupFromQuest` (`tests/game/levelCatalog.test.ts` holds them together). */
const MAPS: Record<MapKind, (q: Quest, type: LevelType) => MapData> = {
  rooms: (q, type) => generateMap({ seed: q.seed, rooms: q.rooms, boss: type.boss, challenge: hasChallengeRoom(q.template, q.sector) }),
  climb: (q) => generateClimb(q.seed, hasChallengeRoom(q.template, q.sector)),
  stage: (q) => generateStage(q.sector, q.seed),
  tutorial: (q) => generateWakeUpCall(q.seed)
}

export const levelMap = (q: Quest): MapData => {
  const type = LEVEL_TYPES[q.template]
  return MAPS[type.map](q, type)
}

// ─── The address ─────────────────────────────────────────────────────────────

/** The query that names a level: `?level=climb&sector=blaze&seed=12&plevel=8`.
 *  The game route boots straight into it (`#/?level=…`, `flow.createBootMode`)
 *  and the lab keeps its selection in it (`#/levels?level=…`). */
export const levelQuery = (p: LevelPick): Record<string, string> => ({
  level: p.template, sector: p.sector, seed: String(p.seed), plevel: String(p.playerLevel)
})

/** A level query back into a pick; null when it names no valid level. */
export const parseLevelQuery = (q: URLSearchParams): LevelPick | null => {
  const template = q.get('level') as QuestTemplate | null
  if (!template || !Object.keys(LEVEL_TYPES).includes(template)) return null
  const type = LEVEL_TYPES[template]
  const sector = (q.get('sector') ?? type.sectors[0]) as SectorId
  if (!type.sectors.includes(sector)) return null
  const seed = Number(q.get('seed') ?? 0)
  const playerLevel = Number(q.get('plevel') ?? 1)
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null
  if (!Number.isInteger(playerLevel) || playerLevel < 1 || playerLevel > MAX_LEVEL) return null
  return { template, sector, seed, playerLevel }
}

/** The level a hash address asks the GAME route for (`#/?level=…`), or null
 *  (another route, or no level in it). */
export const levelFromHash = (hash: string): Quest | null => {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  if (path !== '/' && path !== '') return null
  const pick = parseLevelQuery(new URLSearchParams(query))
  return pick ? buildLevel(pick) : null
}
