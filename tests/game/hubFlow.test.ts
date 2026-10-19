// @vitest-environment jsdom
// The walkable lab in the flow (#173): a pedestal's mission (the story's next
// one, a secured sector's rematch, a job pad's job), where Flux turns up when
// the lab comes back (on the pedestal he beamed out from, in front of the
// briefing table after a debrief, on the teleporter otherwise), and a rematch
// that never moves the story: no unlock, no debrief, no ending again.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ arrivals: [] as unknown[], beamAtBuild: [] as boolean[], builds: 0, endings: 0, debriefEnd: null as null | (() => void) }))

vi.mock('@/use/useAds', () => ({ showMidgameAd: async (): Promise<void> => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/engine/slicer', async (orig) => ({ ...(await orig<object>()), afterPaint: async () => {} }))

const tally = { xp: 10, bolts: 5, kills: 1, chests: 0, items: [], seconds: 30 }

const load = async () => {
  const flowMod = await import('@/game/flow')
  const quests = await import('@/game/data/quests')
  const { profile } = await import('@/game/state/profile')
  const { SECTOR_BY_ID } = await import('@/game/data/regions')
  const fakeMode = {} as never
  flowMod.registerModeFactories(
    async () => { h.builds++; return fakeMode },
    (arrival) => { h.arrivals.push(arrival); h.beamAtBuild.push(flowMod.flow.loading); return fakeMode },
    undefined,
    async () => { h.endings++; return { ...(fakeMode as object), skip() {}, advance() {}, choose() {} } as never },
    async (opts) => { h.debriefEnd = opts.onEnd; return { ...(fakeMode as object), skip() {}, advance() {} } as never }
  )
  flowMod.flow.modal = ''
  flowMod.flow.results = null
  return { ...flowMod, ...quests, profile, SECTOR_BY_ID }
}

/** A save with the first `n` Masters beaten (and their sectors open). */
const progress = async (n: number) => {
  const { profile } = await import('@/game/state/profile')
  const { SECTORS } = await import('@/game/data/regions')
  profile.world.bosses = SECTORS.slice(0, n).map(s => s.boss)
  profile.world.unlocked = SECTORS.slice(0, n + 1).map(s => s.id)
  profile.world.tutorialDone = true
  profile.world.seen = [...profile.world.seen, ...profile.world.bosses.map(b => `debrief:${b}`)]
}

beforeEach(() => {
  h.arrivals = []
  h.builds = 0
  h.endings = 0
  h.debriefEnd = null
})

describe('a pedestal\'s mission', () => {
  it('a secured sector\'s is its rematch; the Scrapyard\'s is the labyrinth to the Scrapper, not the tutorial', async () => {
    const m = await load()
    await progress(3)
    expect(m.replayFor('volt')).toBeNull()
    const scrap = m.replayFor('scrapyard')!
    expect(scrap.kind).toBe('story')
    expect(scrap.template).toBe('boss')
    expect(scrap.sector).toBe('scrapyard')
    const blaze = m.replayFor('blaze')!
    expect(blaze.template).toBe('stage')
    expect(blaze.sector).toBe('blaze')
  })

  it('padQuest: the story\'s next mission, a rematch, a job, nothing behind a fence', async () => {
    const m = await load()
    await progress(3)
    m.profile.quests.jobs = []
    expect(m.padQuest('story:volt')?.sector).toBe('volt')
    expect(m.padQuest('story:volt')?.id).toBe('story_volt')
    expect(m.padQuest('story:blaze')?.sector).toBe('blaze')
    expect(m.padQuest('story:gale')).toBeNull()
    expect(m.padQuest('job0')).toBeNull()
    m.ensureJobs()
    expect(m.padQuest('job1')).toBe(m.profile.quests.jobs[1])
  })
})

describe('where Flux turns up', () => {
  it('back on the pedestal he beamed out from, once', async () => {
    const m = await load()
    await progress(3)
    const q = m.padQuest('story:blaze')!
    await m.deployFromPad('story:blaze', q)
    expect(h.builds).toBe(1)
    expect(m.flow.screen).toBe('mission')
    await m.finishMission(false, tally)
    await m.leaveResults()
    expect(h.arrivals.at(-1)).toEqual({ kind: 'pad', id: 'story:blaze' })
    // The next return to the lab without a deploy: the teleporter.
    m.goHub()
    expect(h.arrivals.at(-1)).toEqual({ kind: 'home' })
  })

  it('in front of the briefing table after a debrief', async () => {
    const m = await load()
    await progress(1)
    const plan = m.briefingToReplay()!
    expect(plan.boss).toBe('scrapper')
    await m.startDebrief(plan)
    await vi.waitFor(() => expect(h.debriefEnd).toBeTruthy())
    h.debriefEnd!()
    // Behind the Lab-return beam (#Mini1): built a paint later.
    await vi.waitFor(() => expect(h.arrivals.at(-1)).toEqual({ kind: 'brief' }))
  })
})

describe('the way back to the Lab shows the beam (#Mini1)', () => {
  it('results → Lab: the beam is up while the Lab builds, held briefly, then gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
    try {
      const m = await load()
      await progress(3)
      await m.deployFromPad('story:blaze', m.padQuest('story:blaze')!)
      await m.finishMission(false, tally)
      let upWhileBuilding = false
      const before = h.arrivals.length
      await m.leaveResults()
      // The beam (labelled the Lab, no sector) was up while the Lab built.
      expect(h.beamAtBuild.at(-1)).toBe(true)
      expect(m.flow.loadingSector).toBe('')
      // Built: the Lab is live, the beam held only for its short minimum.
      upWhileBuilding = m.flow.loadingLab
      expect(h.arrivals.length).toBe(before + 1)
      expect(m.flow.screen).toBe('hub')
      expect(m.flow.loading).toBe(false)
      expect(upWhileBuilding).toBe(true)
      expect(m.LAB_LOADER_MIN_MS).toBeGreaterThanOrEqual(600)
      expect(m.LAB_LOADER_MIN_MS).toBeLessThanOrEqual(1000)
      vi.advanceTimersByTime(m.LAB_LOADER_MIN_MS)
      expect(m.flow.loadingLab).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('debrief → Lab: the same beam', async () => {
    const m = await load()
    await progress(1)
    await m.startDebrief(m.briefingToReplay()!)
    await vi.waitFor(() => expect(h.debriefEnd).toBeTruthy())
    h.debriefEnd!()
    expect(m.flow.loading).toBe(true)
    expect(m.flow.loadingLab).toBe(true)
    await vi.waitFor(() => expect(m.flow.loadingLab).toBe(false), { timeout: 3000 })
    expect(h.arrivals.at(-1)).toEqual({ kind: 'brief' })
  })
})

describe('a rematch never moves the story', () => {
  it('a won rematch with the Flame Master unlocks nothing and owes no debrief', async () => {
    const m = await load()
    await progress(3)
    const unlocked = [...m.profile.world.unlocked]
    const q = m.replayFor('blaze')!
    await m.deployFromPad('story:blaze', q)
    await m.finishMission(true, tally)
    expect(m.flow.results?.unlocked).toBeNull()
    expect(m.profile.world.unlocked).toEqual(unlocked)
    expect(m.dueDebrief()).toBeNull()
    await m.leaveResults()
    expect(h.arrivals.at(-1)).toEqual({ kind: 'pad', id: 'story:blaze' })
  })

  it('the Fortress: the ending after its first fall only', async () => {
    const m = await load()
    await progress(10)
    const first = m.storyFor('fortress')!
    await m.deployFromPad('story:fortress', first)
    await m.finishMission(true, tally)
    await m.leaveResults()
    await vi.waitFor(() => expect(h.endings).toBe(1))
    // Its rematch from the gate: a fight, then back to the gate.
    const again = m.replayFor('fortress')!
    expect(again).toBeTruthy()
    await m.deployFromPad('story:fortress', again)
    await m.finishMission(true, tally)
    await m.leaveResults()
    expect(h.endings).toBe(1)
    expect(h.arrivals.at(-1)).toEqual({ kind: 'pad', id: 'story:fortress' })
  })
})
