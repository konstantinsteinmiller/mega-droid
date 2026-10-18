// @vitest-environment jsdom
// The interstitial comes AFTER the result screen: the results open at once,
// and the ad plays when the player taps Continue — the screen closes first, so
// the ad never opens on top of it, and the hub only comes up once the ad is
// done. `finishMission` pays and saves, then reveals; `leaveResults` runs the
// break and goes home.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ adMs: 0, canShow: true, marks: 0, happy: 0, adCalls: 0, hubs: 0 }))

vi.mock('@/use/useAds', async () => {
  const { isAdShowing } = await import('@/use/useGamePause')
  return {
    // Stands in for a provider: the gate goes up synchronously (as the real
    // `showMidgameAd` flips it before its first await) and drops at the end.
    showMidgameAd: async (): Promise<void> => {
      h.adCalls++
      isAdShowing.value = true
      await new Promise((r) => setTimeout(r, h.adMs))
      isAdShowing.value = false
    }
  }
})
vi.mock('@/use/useAdGate', () => ({
  canShowInterstitial: () => h.canShow,
  markInterstitialShown: () => { h.marks++ }
}))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => { h.happy++ } }))
// The hub is a three.js scene; only whether (and when) it was entered matters.
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

const tally = { xp: 10, bolts: 5, kills: 1, chests: 0, items: [], seconds: 30 }

const load = async () => {
  const flowMod = await import('@/game/flow')
  const { tutorialQuest } = await import('@/game/data/quests')
  const { isAdShowing } = await import('@/use/useGamePause')
  const fakeMode = {} as never
  flowMod.registerModeFactories(async () => fakeMode, () => { h.hubs++; return fakeMode })
  flowMod.flow.quest = tutorialQuest()
  flowMod.flow.screen = 'mission'
  flowMod.flow.modal = ''
  flowMod.flow.results = null
  return { ...flowMod, isAdShowing }
}

describe('result screen: opens at once, no ad in front of it', () => {
  beforeEach(() => {
    h.adMs = 0
    h.canShow = true
    h.marks = 0
    h.happy = 0
    h.adCalls = 0
    h.hubs = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('reveals the results without requesting an ad, even when one is due', async () => {
    const m = await load()
    await m.finishMission(true, tally)
    expect(h.adCalls).toBe(0)
    expect(h.marks).toBe(0) // the pacing slot is left for Continue
    expect(m.flow.modal).toBe('results')
    expect(m.flow.results?.success).toBe(true)
    expect(h.happy).toBe(1) // CrazyGames happytime on a win
  })

  it('a failed mission reveals straight away too, without happytime', async () => {
    const m = await load()
    await m.finishMission(false, tally)
    expect(h.adCalls).toBe(0)
    expect(m.flow.modal).toBe('results')
    expect(h.happy).toBe(0)
  })

  it('waits for an ad ANOTHER placement left on screen', async () => {
    const m = await load()
    m.isAdShowing.value = true // e.g. the QA trigger or the first-load ad
    const done = m.finishMission(true, tally)
    await new Promise((r) => setTimeout(r, 250))
    expect(m.flow.modal).toBe('')
    m.isAdShowing.value = false
    await done
    expect(m.flow.modal).toBe('results')
  })

  it('never strands the player behind a gate that does not drop', async () => {
    const m = await load()
    vi.useFakeTimers()
    m.isAdShowing.value = true
    const done = m.finishMission(true, tally)
    await vi.advanceTimersByTimeAsync(8200)
    await done
    expect(m.flow.modal).toBe('results')
    m.isAdShowing.value = false
  })
})

describe('Continue: the ad, then the hub', () => {
  beforeEach(() => {
    h.adMs = 0
    h.canShow = true
    h.marks = 0
    h.adCalls = 0
    h.hubs = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('closes the screen, plays the due interstitial, and only then goes home', async () => {
    const m = await load()
    await m.finishMission(true, tally)
    h.adMs = 150
    const left = m.leaveResults()
    // The screen is gone before the ad opens, and the hub waits for the ad.
    expect(m.flow.modal).toBe('')
    expect(m.isAdShowing.value).toBe(true)
    expect(h.hubs).toBe(0)
    expect(m.flow.screen).toBe('mission')
    await left
    expect(m.isAdShowing.value).toBe(false)
    expect(h.adCalls).toBe(1)
    expect(h.marks).toBe(1) // the shared pacing clock restarts
    expect(h.hubs).toBe(1)
    expect(m.flow.screen).toBe('hub')
  })

  it('offers the break after a failed mission as well', async () => {
    const m = await load()
    await m.finishMission(false, tally)
    await m.leaveResults()
    expect(h.adCalls).toBe(1)
    expect(m.flow.screen).toBe('hub')
  })

  it('goes straight home when the pacing says no ad is due', async () => {
    const m = await load()
    await m.finishMission(true, tally)
    h.canShow = false
    await m.leaveResults()
    expect(h.adCalls).toBe(0)
    expect(h.marks).toBe(0)
    expect(h.hubs).toBe(1)
    expect(m.flow.screen).toBe('hub')
  })

  it('a double tap on Continue asks for one ad and builds one hub', async () => {
    const m = await load()
    await m.finishMission(true, tally)
    h.adMs = 50
    await Promise.all([m.leaveResults(), m.leaveResults()])
    expect(h.adCalls).toBe(1)
    expect(h.hubs).toBe(1)
  })

  it('does not open the hub under an ad another placement left up', async () => {
    const m = await load()
    await m.finishMission(true, tally)
    h.canShow = false
    m.isAdShowing.value = true // e.g. the QA trigger fired on this screen
    const left = m.leaveResults()
    await new Promise((r) => setTimeout(r, 250))
    expect(h.hubs).toBe(0)
    m.isAdShowing.value = false
    await left
    expect(h.hubs).toBe(1)
  })

  it('is what the result screen\'s Continue calls', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/modals/ResultsModal.vue'), 'utf8')
    expect(src).toMatch(/const done = \(\) => \{\s*void leaveResults\(\)\s*\}/)
    expect(src).not.toMatch(/\bgoHub\(/)
  })
})

describe('the Fortress won: the ad, then the ending (#102), then its card', () => {
  beforeEach(() => {
    h.adMs = 0
    h.canShow = true
    h.adCalls = 0
    h.hubs = 0
  })

  const fortress = async () => {
    const m = await load()
    const { storyQuest } = await import('@/game/data/quests')
    const { SECTOR_BY_ID } = await import('@/game/data/regions')
    const { profile } = await import('@/game/state/profile')
    const order: string[] = []
    let onEnd: ((c: 'ngplus' | 'lab') => void) | null = null
    const fakeMode = {} as never
    m.registerModeFactories(async () => fakeMode, () => { h.hubs++; order.push('hub'); return fakeMode }, undefined, (opts) => {
      order.push(`ending after ${h.adCalls} ad`)
      onEnd = opts.onEnd
      return { skip() {}, advance() {}, choose() {} } as never
    })
    m.flow.quest = { ...storyQuest(SECTOR_BY_ID.fortress, 32, 0), kind: 'story' }
    // Vex's FIRST fall in this run: only that one owes the ending (#173: a
    // rematch from the Fortress gate is a fight, not the end again).
    profile.world.bosses = profile.world.bosses.filter(b => b !== SECTOR_BY_ID.fortress.boss)
    return { m, order, profile, end: (c: 'ngplus' | 'lab') => onEnd!(c) }
  }

  it('plays the interstitial, then the ending instead of the hub', async () => {
    const { m, order } = await fortress()
    await m.finishMission(true, tally)
    await m.leaveResults()
    expect(order).toEqual(['ending after 1 ad'])
    expect(m.flow.screen).toBe('ending')
  })

  it('the card\'s New Game+ starts the next cycle, marks the ending seen and opens the lab', async () => {
    const { m, order, profile, end } = await fortress()
    await m.finishMission(true, tally)
    await m.leaveResults()
    const ng = profile.world.ngPlus
    end('ngplus')
    expect(profile.world.ngPlus).toBe(ng + 1)
    expect(profile.world.seen).toContain('ending')
    expect(order.at(-1)).toBe('hub')
  })

  it('Back to the Lab keeps the cycle', async () => {
    const { m, profile, end } = await fortress()
    await m.finishMission(true, tally)
    await m.leaveResults()
    const ng = profile.world.ngPlus
    end('lab')
    expect(profile.world.ngPlus).toBe(ng)
    expect(m.flow.screen).toBe('hub')
  })
})
