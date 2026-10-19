// @vitest-environment jsdom
// The tutorial's one-button secret pays a Tuned buster. The tutorial's item
// level is pinned at 1, so the buster must roll at the player's level as of
// pickup instead: a returning hero replaying the tutorial gets a useful arm.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { profile } from '@/game/state/profile'
import type { Item } from '@/game/data/items'

type Prize = (this: unknown, prize: 'gear', x: number, y: number, z: number, once?: string) => void
const secretPrize = (Mission.prototype as unknown as { secretPrize: Prize }).secretPrize

const fake = () => ({
  map: { seed: 1234 },
  setup: { enemyLevel: 1, tutorial: true },
  itemsFound: [] as Item[],
  dirty: false,
  lootTaken: () => false
})

describe("the 'gear' secret prize", () => {
  beforeEach(() => {
    profile.inv.items.length = 0
    profile.inv.fresh.length = 0
  })

  it.each([1, 7, 23])("rolls a Tuned buster at the player's level %i, not the mission's item level", (lvl) => {
    profile.level = lvl
    const m = fake()
    secretPrize.call(m, 'gear', 0, 0, 0)
    const it = m.itemsFound[0]!
    expect(it).toMatchObject({ slot: 'buster', rarity: 'tuned', ilvl: lvl })
    expect(profile.inv.items.map((i) => i.id)).toContain(it.id)
    expect(profile.inv.fresh).toContain(it.id)
  })
})
