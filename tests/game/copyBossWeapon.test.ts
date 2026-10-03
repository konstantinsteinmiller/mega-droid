// @vitest-environment jsdom
// #D26: the moment a Master falls its weapon is Flux's and equipped in the
// first slot, for the lesson right behind the arena; the results screen still
// names it as new (`copyBossWeapon`, flow.ts). Weapons that fire level along
// the floor get lesson drones low enough to hit (`LOW_SHOT`).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { copyBossWeapon } from '@/game/flow'
import { profile } from '@/game/state/profile'
import { LOW_SHOT, LOW_DRONE_Y } from '@/game/sim/lessons'
import { ENEMIES } from '@/game/data/enemies'

describe('copying the boss weapon', () => {
  beforeEach(() => {
    profile.hero.weapons = ['scrapBurst']
    profile.hero.slots = ['scrapBurst', ''] as typeof profile.hero.slots
  })

  it('grants it and puts it in the first slot, the old one moving to the second', () => {
    expect(copyBossWeapon('flameWave')).toBe(true)
    expect(profile.hero.weapons).toContain('flameWave')
    expect(profile.hero.slots[0]).toBe('flameWave')
    expect(profile.hero.slots[1]).toBe('scrapBurst')
  })

  it('a weapon already owned is not new, but is equipped all the same', () => {
    profile.hero.weapons = ['scrapBurst', 'flameWave']
    profile.hero.slots = ['scrapBurst', 'flameWave'] as typeof profile.hero.slots
    expect(copyBossWeapon('flameWave')).toBe(false)
    expect(profile.hero.slots).toEqual(['flameWave', 'scrapBurst'])
  })
})

describe('lesson drones for a level shot', () => {
  it('hover low enough for the flame wave (its lane tops out near 1.3 m)', () => {
    expect(LOW_SHOT.has('flameWave')).toBe(true)
    expect(LOW_DRONE_Y).toBeLessThan(1.3)
    expect(ENEMIES.heli.fly).toBeGreaterThan(1.3)
  })
})
