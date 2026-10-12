// @vitest-environment jsdom
// #130: the Repair Gel lesson spends the gel it teaches; once it is learned
// a free Repair Gel goes back in the pack, before the boss. Once: not again
// on the next step, not for a lesson learned on an earlier run.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { Training } from '@/game/sim/training'
import { profile } from '@/game/state/profile'

const fake = (learnedBefore: boolean) => {
  const m = Object.create(Mission.prototype) as Record<string, unknown>
  const tr = new Training({ say: () => {} })
  if (learnedBefore) tr.done.add('gel')
  tr.enter('gel', 0)
  Object.assign(m, {
    training: tr, lessons: { gelEnded: true }, gapArrows: [], gelHoloOn: false,
    walk: null, player: { x: 0, z: 0 }, coach: { master: () => {} }, dirty: false, learnedHere: new Set()
  })
  return m as unknown as { stepTrainingBeats(playing: boolean): void; training: Training }
}

describe('the gel lesson gives a gel back', () => {
  it('once, when it is learned', () => {
    profile.inv.tanks = 0
    const m = fake(false)
    m.stepTrainingBeats(true)
    expect(profile.inv.tanks).toBe(1)
    expect(m.training.done.has('gel')).toBe(true)
    m.training.enter('gel', 1)
    m.stepTrainingBeats(true)
    expect(profile.inv.tanks).toBe(1)
  })

  it('not for a lesson learned on an earlier run', () => {
    profile.inv.tanks = 0
    const m = fake(true)
    m.stepTrainingBeats(true)
    expect(profile.inv.tanks).toBe(0)
  })
})
