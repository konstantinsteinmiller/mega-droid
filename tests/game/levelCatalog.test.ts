// @vitest-environment jsdom
// The level lab's catalog (`data/levelCatalog.ts`, DEV route `/levels`): every
// level the game can generate, each built by the game's own quest builder.
//
// A level the lab builds by some other road than the game's is a look-alike,
// and a template the lab does not list is a level nobody can test without
// playing up to it. So: every entry builds a sound quest in every sector it
// lists, through the real builders (a job is exactly the board's own roll);
// the same seed is the same level; the catalog knows every template the game
// can hand out; its map rule is the mission's; and the `#/?level=…` address
// round-trips.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import {
  LEVEL_TYPES, levelTypes, levelEntries, buildLevel, levelMap, rollAs, levelQuery, parseLevelQuery, levelFromHash,
  type LevelPick
} from '@/game/data/levelCatalog'
import { JOB_TEMPLATES, rollJob, climbJob, storyQuest, bossQuest, tutorialQuest, isBoardRun, type Quest, type QuestTemplate } from '@/game/data/quests'
import { SECTORS, SECTOR_BY_ID } from '@/game/data/regions'
import { MAX_LEVEL } from '@/game/data/progression'
import { setupFromQuest } from '@/game/sim/mission'

const SEEDS = [0, 1, 7, 4242, 99999, 0xffffffff]
const LEVELS = [1, 12, MAX_LEVEL]

const every = (): Array<{ template: QuestTemplate; sector: (typeof SECTORS)[number]['id'] }> =>
  levelEntries().map(e => ({ template: e.type.template, sector: e.sector }))

/** What a quest must be for a mission to be built from it. */
const expectSound = (q: Quest, template: QuestTemplate, sector: string) => {
  const s = SECTOR_BY_ID[q.sector]
  expect(q.template).toBe(template)
  expect(q.sector).toBe(sector)
  expect(q.id).toMatch(/^(story|job)_/)
  expect(q.kind).toBe(template === 'tutorial' || template === 'boss' || template === 'stage' ? 'story' : 'job')
  expect(Number.isInteger(q.seed) && q.seed >= 0 && q.seed <= 0xffffffff).toBe(true)
  expect(q.level).toBeGreaterThanOrEqual(s.levels[0])
  // A board run (a Tower Run, a supply run) follows Flux past the band's top.
  expect(q.level).toBeLessThanOrEqual(isBoardRun(q) ? MAX_LEVEL : s.levels[1])
  expect(q.rooms).toBeGreaterThan(0)
  expect(q.count).toBeGreaterThanOrEqual(1)
  expect(q.reward.xp).toBeGreaterThan(0)
  expect(q.reward.bolts).toBeGreaterThan(0)
  if (template === 'kill' || template === 'elite') {
    expect(s.encounters.kinds.map(([k]) => k)).toContain(q.target)
  } else {
    expect(q.target).toBeNull()
  }
}

describe('level catalog: every entry is a real level', () => {
  it('builds a sound quest for every sector it lists, at any seed and player level', () => {
    for (const { template, sector } of every()) {
      for (const seed of SEEDS) {
        for (const playerLevel of LEVELS) expectSound(buildLevel({ template, sector, seed, playerLevel }), template, sector)
      }
    }
  })

  it('lists every sector for every type but the tutorial (one level) and the stages (their four sectors)', () => {
    const stages = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
    for (const t of levelTypes()) {
      expect(t.sectors).toEqual(t.template === 'tutorial' ? ['scrapyard'] : t.template === 'stage' ? stages : SECTORS.map(s => s.id))
    }
    expect(levelEntries()).toHaveLength(1 + stages.length + (levelTypes().length - 2) * SECTORS.length)
  })

  it('builds with the game\'s own builders', () => {
    const lv = 9
    for (const s of SECTORS) {
      expect(buildLevel({ template: 'boss', sector: s.id, seed: 2, playerLevel: lv })).toEqual(bossQuest(s, lv, 2))
      if (LEVEL_TYPES.stage.sectors.includes(s.id)) {
        expect(buildLevel({ template: 'stage', sector: s.id, seed: 2, playerLevel: lv })).toEqual(storyQuest(s, lv, 2))
      }
      expect(buildLevel({ template: 'climb', sector: s.id, seed: 77, playerLevel: lv })).toEqual(climbJob(77, [s.id], lv))
    }
    expect(buildLevel({ template: 'tutorial', sector: 'scrapyard', seed: 5, playerLevel: 30 })).toEqual(tutorialQuest())
  })

  it('a job is the job board\'s own roll of that template', () => {
    for (const [template] of JOB_TEMPLATES) {
      for (const s of SECTORS) {
        const q = rollAs(template, s.id, 1000, 7)
        const board = parseInt(q.id.slice(4), 36)
        expect(board).toBeGreaterThanOrEqual(1000)
        expect(rollJob(board, [s.id], 7)).toEqual(q)
        // …and the first such roll: none in between came out as the template.
        for (let b = 1000; b < board; b++) expect(rollJob(b, [s.id], 7).template).not.toBe(template)
      }
    }
  })

  it('climb entries are climbs, in every sector', () => {
    const climbs = levelEntries().filter(e => e.type.template === 'climb')
    expect(climbs.map(e => e.sector)).toEqual(SECTORS.map(s => s.id))
    for (const e of climbs) {
      const q = e.type.build(e.sector, 31, 10)
      expect(q.template).toBe('climb')
      expect(levelMap(q).terrain).toBeDefined()
    }
    expect(LEVEL_TYPES.climb.isNew).toBe(true)
    expect(LEVEL_TYPES.climb.map).toBe('climb')
  })
})

describe('level catalog: reproducible', () => {
  it('the same seed gives the same quest and the same map', () => {
    for (const { template, sector } of every()) {
      const p: LevelPick = { template, sector, seed: 31337, playerLevel: 11 }
      const a = buildLevel(p)
      expect(buildLevel({ ...p })).toEqual(a)
      expect(levelMap(buildLevel({ ...p }))).toEqual(levelMap(a))
    }
  })

  it('the seed changes the level wherever it is fed to a builder', () => {
    for (const t of levelTypes()) {
      const sector = t.sectors[0]!
      const seeds = new Set([1, 2, 3, 4, 5].map(seed => t.build(sector, seed * 1013, 8).seed))
      expect(seeds.size).toBe(t.seed === 'fixed' ? 1 : 5)
    }
  })
})

describe('level catalog: covers every template', () => {
  it('has an entry, under its own name, for every template the game hands out', () => {
    const keys = Object.keys(LEVEL_TYPES).sort()
    const handedOut = new Set<string>(['tutorial', 'boss', 'climb', 'stage', ...JOB_TEMPLATES.map(([t]) => t)])
    // Whatever the board rolls, climbs included.
    const sectors = SECTORS.map(s => s.id)
    for (let seed = 1; seed < 600; seed++) handedOut.add(rollJob(seed, sectors, 10, sectors).template)
    expect(keys).toEqual([...handedOut].sort())
    for (const [key, t] of Object.entries(LEVEL_TYPES)) expect(t.template).toBe(key)
  })

  it('agrees with the mission on the map each template gets', () => {
    for (const { template, sector } of every()) {
      const q = buildLevel({ template, sector, seed: 12, playerLevel: 6 })
      const t = LEVEL_TYPES[template]
      const setup = setupFromQuest(q, null)
      expect(setup.climb).toBe(t.map === 'climb' || t.map === 'stage' || t.map === 'tutorial')
      expect(setup.stage).toBe(t.map === 'stage' ? sector : undefined)
      expect(setup.tutorial).toBe(template === 'tutorial')
      if (t.map === 'rooms') expect(setup.boss).toBe(t.boss)
      const m = levelMap(q)
      expect(m.rooms.some(r => r.role === 'start')).toBe(true)
      expect(m.rooms.some(r => r.role === 'boss')).toBe(t.boss)
      expect(m.terrain !== undefined).toBe(t.map !== 'rooms')
    }
  })
})

describe('level catalog: the address', () => {
  it('round-trips a pick through its query', () => {
    for (const { template, sector } of every()) {
      const p: LevelPick = { template, sector, seed: 4040, playerLevel: 17 }
      expect(parseLevelQuery(new URLSearchParams(levelQuery(p)))).toEqual(p)
    }
  })

  it('refuses a query that names no valid level', () => {
    const q = (s: string) => parseLevelQuery(new URLSearchParams(s))
    expect(q('')).toBeNull()
    expect(q('level=nope&sector=blaze')).toBeNull()
    expect(q('level=toString')).toBeNull()
    expect(q('level=tutorial&sector=blaze')).toBeNull()
    expect(q('level=climb&sector=moon')).toBeNull()
    expect(q('level=climb&sector=blaze&seed=1.5')).toBeNull()
    expect(q('level=climb&sector=blaze&seed=-1')).toBeNull()
    expect(q(`level=climb&sector=blaze&plevel=${MAX_LEVEL + 1}`)).toBeNull()
    expect(q('level=climb&sector=blaze&plevel=0')).toBeNull()
  })

  it('boots a level from the game route only', () => {
    const q = levelFromHash('#/?level=climb&sector=blaze&seed=7&plevel=9')
    expect(q).toEqual(climbJob(7, ['blaze'], 9))
    expect(levelFromHash('#?level=boss&sector=cryo&seed=0&plevel=8')).toEqual(bossQuest(SECTOR_BY_ID.cryo, 8, 0))
    expect(levelFromHash('#/?level=stage&sector=cryo&seed=0&plevel=8')).toEqual(storyQuest(SECTOR_BY_ID.cryo, 8, 0))
    expect(levelFromHash('#/?level=stage&sector=scrapyard&seed=0&plevel=8')).toBeNull()
    expect(levelFromHash('#/levels?level=climb&sector=blaze&seed=7&plevel=9')).toBeNull()
    expect(levelFromHash('#/models?level=climb')).toBeNull()
    expect(levelFromHash('#/')).toBeNull()
    expect(levelFromHash('')).toBeNull()
  })
})
