// @vitest-environment jsdom
// #119: a playtester never saw the crate the crane set down in the crate
// lesson and pushed at the shut door for two minutes. While that lesson runs
// the yellow locator triangle is pinned on the crate (no boss skull), and it
// lets go once the lesson is over.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { Locator } from '@/game/sim/locator'

const fake = () => ({
  player: { x: 0, z: 0 },
  locatorPoint: { x: 0, y: 0, z: 0, alpha: 0, pin: false },
  locatorIn: { playing: true, quiet: false, hasGoal: false, dist: 0, boss: false, finished: false },
  locator: new Locator(),
  pinAlpha: 0,
  bossRoom: null,
  bossDoor: () => null,
  fighting: false,
  walkthroughActive: () => true,
  objects: { objective: { done: false } },
  bossStarted: false,
  boss: null,
  map: { terrain: null },
  setup: { tutorial: true },
  atlas: null
})

type Step = (this: unknown, dt: number, playing: boolean, goal: undefined, pin: { x: number; z: number } | null) => void
const step = (Mission.prototype as unknown as { updateLocator: Step }).updateLocator

describe('the crate lesson pins the locator on its crate', () => {
  it('shows over the crate, plain, while the lesson runs, and fades after', () => {
    const m = fake()
    for (let i = 0; i < 30; i++) step.call(m, 1 / 60, true, undefined, { x: 6, z: 4 })
    const L = m.locatorPoint
    expect(L.alpha).toBe(1)
    expect([L.x, L.z]).toEqual([6, 4])
    expect(L.y).toBeGreaterThan(2)
    expect(L.pin).toBe(true)
    for (let i = 0; i < 30; i++) step.call(m, 1 / 60, true, undefined, null)
    expect(m.locatorPoint.alpha).toBe(0)
  })
})
