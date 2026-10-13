// @vitest-environment jsdom
// A level-lab test run (DEV: `/levels` → Play loads `#/?level=…`): the game
// boots straight into that level, and the run never touches the save.
//
// A level select that wrote to the save would be a cheat menu on the
// developer's own profile: beat the Blaze Core Master from the lab and the
// real story would count it beaten, unlock Cryo and copy its weapon. And a
// test mission that checkpointed would overwrite the real resume point, then
// come back on the next reload as a real mission. So a test run plays on a
// sandbox — no profile or snapshot write, no leaderboard post — and leaving it
// re-reads the profile from the untouched save and returns to the lab. The
// control case (an ordinary boot, same boss) proves the save WOULD change.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

const h = vi.hoisted(() => ({ runs: 0, best: 0, pushes: [] as unknown[] }))

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/use/useLeaderboard', () => ({ reportRun: async () => { h.runs++ } }))
vi.mock('@/use/usePortalLeaderboard', () => ({
  joinPortalBoard: async () => {},
  reportPortalBest: async () => { h.best++ }
}))
vi.mock('@/router', () => ({
  default: {
    // The game route as the test run's address leaves it.
    currentRoute: { value: { query: { level: 'boss', sector: 'blaze', seed: '0', plevel: '6' } } },
    push: async (to: unknown) => { h.pushes.push(to) }
  }
}))

const tally = { xp: 300, bolts: 50, kills: 12, chests: 1, items: [], seconds: 240 }
const BLAZE_BOSS = '#/?level=boss&sector=blaze&seed=0&plevel=6'

/** A save well into the game: the Scrapper down, Blaze open, a Scrapyard job
 *  half done (its resume point in the save). */
const load = async () => {
  const gs = await holdGameState()
  const keys = await import('@/keys')
  const prof = await import('@/game/state/profile')
  const flowMod = await import('@/game/flow')
  const quests = await import('@/game/data/quests')
  const { SECTOR_BY_ID } = await import('@/game/data/regions')
  const resumeQuest = quests.rollJob(99, ['scrapyard'], 4)
  gs.setStates({
    [keys.LEVEL_KEY]: 6,
    [keys.STORY_KEY]: 1,
    [keys.WORLD_KEY]: { unlocked: ['scrapyard', 'blaze'], bosses: ['scrapper'], tutorialDone: true, selected: 'blaze' },
    [keys.MISSION_KEY]: {
      quest: resumeQuest, killed: [1], opened: [], doors: [0], collected: [], progress: 0,
      x: 10, z: 12, yaw: 0, hp: 50, we: 10, bolts: 5, xp: 20, kills: 1, t: 60, done: false
    }
  })
  prof.loadProfile()
  const built: Array<{ quest: unknown; snapshot: unknown }> = []
  const fakeMode = {} as never
  flowMod.registerModeFactories(async (quest, snapshot) => { built.push({ quest, snapshot }); return fakeMode }, () => fakeMode)
  const saved = () => ({
    world: gs.getState<{ bosses: string[]; unlocked: string[] }>(keys.WORLD_KEY),
    story: gs.getState<number>(keys.STORY_KEY),
    level: gs.getState<number>(keys.LEVEL_KEY),
    hero: JSON.stringify(gs.getState(keys.HERO_KEY) ?? null),
    mission: JSON.stringify(gs.getState(keys.MISSION_KEY))
  })
  return { gs, keys, prof, flowMod, quests, SECTOR_BY_ID, built, saved, resumeQuest }
}

describe('level-lab test run', () => {
  beforeEach(() => {
    drainAndResetModules()
    h.runs = 0
    h.best = 0
    h.pushes.length = 0
  })
  afterEach(() => {
    drainPersist()
    location.hash = ''
  })

  it('boots straight into the level the address names, ahead of the resume point', async () => {
    const m = await load()
    location.hash = BLAZE_BOSS
    await m.flowMod.createBootMode()
    expect(m.built).toEqual([{ quest: m.quests.bossQuest(m.SECTOR_BY_ID.blaze, 6, 0), snapshot: null }])
    expect(m.flowMod.flow.screen).toBe('mission')
    expect(m.flowMod.isTestRun()).toBe(true)
  })

  it('beating a boss from the lab changes nothing in the save, and Continue goes back to the lab', async () => {
    const m = await load()
    const before = m.saved()
    location.hash = BLAZE_BOSS
    await m.flowMod.createBootMode()

    // Mid-run checkpoints (a kill's XP, the mission snapshot) are not written.
    m.prof.grantXp(500)
    m.prof.saveProfile()
    m.prof.writeSnapshot({ ...JSON.parse(before.mission), quest: m.flowMod.flow.quest, t: 5 })
    expect(m.saved()).toEqual(before)

    await m.flowMod.finishMission(true, tally)
    // The result screen is the real one: the boss is down and Cryo opens…
    expect(m.flowMod.flow.modal).toBe('results')
    expect(m.flowMod.flow.results?.unlocked).toBe('cryo')
    // …but only in memory: the save still has Blaze standing, the resume
    // point untouched, and no leaderboard heard of the run.
    expect(m.saved()).toEqual(before)
    expect(m.saved().world.bosses).not.toContain('blazeMaster')
    expect(h.runs).toBe(0)
    expect(h.best).toBe(0)

    await m.flowMod.leaveResults()
    // Back to the lab, the same level still selected.
    expect(h.pushes).toEqual([{ name: 'levels', query: { level: 'boss', sector: 'blaze', seed: '0', plevel: '6' } }])
    expect(m.flowMod.isTestRun()).toBe(false)
    // The profile is the save's again, and saving works as before.
    expect(m.prof.profile.world.bosses).toEqual(['scrapper'])
    expect(m.prof.profile.world.unlocked).toEqual(['scrapyard', 'blaze'])
    expect(m.prof.profile.story).toBe(1)
    expect(m.prof.profile.level).toBe(6)
    m.prof.profile.bolts = 4321
    m.prof.saveProfile()
    expect(m.gs.getState(m.keys.BOLTS_KEY)).toBe(4321)
  })

  it('control: the same boss beaten in an ordinary run IS saved', async () => {
    const m = await load()
    await m.flowMod.createBootMode()
    expect(m.flowMod.isTestRun()).toBe(false)
    // The ordinary boot resumes the job; play the Blaze story mission instead.
    m.flowMod.flow.quest = m.quests.storyQuest(m.SECTOR_BY_ID.blaze, 6, 0)
    await m.flowMod.finishMission(true, tally)
    expect(m.saved().world.bosses).toContain('blazeMaster')
    expect(m.saved().world.unlocked).toContain('cryo')
    expect(m.saved().story).toBe(2)
    expect(h.runs).toBe(1)
    expect(h.best).toBe(1)
  })

  it('the lab\'s own address and a bare game address boot as ever', async () => {
    const m = await load()
    location.hash = '#/levels?level=climb&sector=blaze&seed=3&plevel=6'
    await m.flowMod.createBootMode()
    location.hash = '#/'
    await m.flowMod.createBootMode()
    expect(m.flowMod.isTestRun()).toBe(false)
    // Both resumed the job in the save.
    expect(m.built.map(b => b.quest)).toEqual([m.resumeQuest, m.resumeQuest])
    expect(m.built.every(b => b.snapshot !== null)).toBe(true)
  })

  it('a first-run profile boots the level the address names, not the intro or the tutorial', async () => {
    const m = await load()
    m.gs.setStates({
      [m.keys.WORLD_KEY]: { unlocked: ['scrapyard'], bosses: [], tutorialDone: false, seen: [] },
      [m.keys.MISSION_KEY]: null
    })
    m.prof.loadProfile()
    const intros: unknown[] = []
    const fakeMode = {} as never
    m.flowMod.registerModeFactories(
      async (quest, snapshot) => { m.built.push({ quest, snapshot }); return fakeMode },
      () => fakeMode,
      async () => { intros.push(1); return fakeMode }
    )
    // Control: the same fresh profile, no level in the address, sees the intro.
    expect(m.flowMod.bootTarget()).toEqual({ kind: 'intro' })
    location.hash = '#/?level=stage&sector=magnet&seed=0&plevel=19'
    await m.flowMod.createBootMode()
    expect(intros).toHaveLength(0)
    expect(m.built).toEqual([{ quest: m.quests.storyQuest(m.SECTOR_BY_ID.magnet, 19, 0), snapshot: null }])
    expect(m.flowMod.flow.screen).toBe('mission')
  })

  it('a scene primed on another address is stale once the address names a level', async () => {
    const m = await load()
    // Nothing booted yet: nothing to be stale.
    expect(await m.flowMod.bootIsStale(BLAZE_BOSS)).toBe(false)
    // Primed on the lab (the intro / a resume), then a level is typed in.
    location.hash = '#/levels?level=climb&sector=blaze&seed=3&plevel=6'
    await m.flowMod.createBootMode()
    expect(await m.flowMod.bootIsStale(BLAZE_BOSS)).toBe(true)
    expect(await m.flowMod.bootIsStale('#/levels?level=boss&sector=blaze&seed=0&plevel=6')).toBe(false)
    expect(await m.flowMod.bootIsStale('#/')).toBe(false)
    // Primed on that level: the same level (in any spelling) is not stale, another one is.
    location.hash = BLAZE_BOSS
    await m.flowMod.createBootMode()
    expect(await m.flowMod.bootIsStale('#/?plevel=6&seed=0&sector=blaze&level=boss')).toBe(false)
    expect(await m.flowMod.bootIsStale('#/?level=boss&sector=blaze&seed=0&plevel=7')).toBe(true)
  })

  it('a boot after a test run ends it: the profile comes back from the save', async () => {
    const m = await load()
    location.hash = '#/?level=climb&sector=scrapyard&seed=3&plevel=6'
    await m.flowMod.createBootMode()
    expect(m.flowMod.flow.quest?.template).toBe('climb')
    m.prof.profile.world.bosses.push('blazeMaster')
    location.hash = '#/'
    await m.flowMod.createBootMode()
    expect(m.flowMod.isTestRun()).toBe(false)
    expect(m.prof.profile.world.bosses).toEqual(['scrapper'])
  })
})
