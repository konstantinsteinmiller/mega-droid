// @vitest-environment jsdom
// ─── One video-for-bolts offer at a time ─────────────────────────────────────
//
// Playtest 2026-10-12: the Workshop showed "Upgrade boost +6122" above
// "Supply drop +860", both for one video. The level-scaled drop falls far
// behind two upgrades of a late cannon, and two prices for the same thing
// read as nonsense. Only the better offer that can be claimed now shows; the
// drop (with its cooldown) when no top-up is offered.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile, supplyDropBolts } from '@/game/state/profile'
import { starterItems, upgradeCost } from '@/game/data/items'
import WorkshopTab from '@/components/hub/WorkshopTab.vue'

vi.mock('@/game/boot', () => ({ input: { device: 'touch' }, currentHub: () => null }))
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/use/useAdGate', () => ({
  claimReward: vi.fn(),
  canOfferReward: computed(() => true),
  adInFlight: computed(() => false)
}))

let w: VueWrapper | null = null
const open = async () => {
  w = mount(WorkshopTab, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await nextTick()
  return w
}
const offers = (wr: VueWrapper) => wr.findAll('[data-lesson="bolts-ad"]').map(r => r.get('.tn').text())

/** The best buster at `upg`, `bolts` in the pocket, the drop ready or not. */
const setup = (upg: number, bolts: number, dropReady: boolean) => {
  profile.inv.items = starterItems()
  const buster = profile.inv.items.find(i => i.slot === 'buster')!
  buster.upg = upg
  buster.ilvl = 30
  profile.inv.equipped.buster = buster.id
  profile.bolts = bolts
  profile.stats.lastDropAt = dropReady ? 0 : Date.now()
  return buster
}

beforeEach(() => { profile.hero.skills = {} })
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = '' })

describe('the Workshop bolts offers', () => {
  it('a late cannon short of bolts: only the upgrade top-up, never the smaller drop beside it', async () => {
    const b = setup(5, 0, true)
    expect(upgradeCost(b) * 2).toBeGreaterThan(supplyDropBolts())
    expect(offers(await open())).toEqual([en.workshop.upgradeAdName])
  })

  it('bolts enough for the next upgrade: only the drop', async () => {
    const b = setup(5, 0, true)
    profile.bolts = upgradeCost(b)
    expect(offers(await open())).toEqual([en.workshop.dropName])
  })

  it('never two rows at once, whatever the state', async () => {
    for (const upg of [0, 3, 9]) {
      for (const bolts of [0, 1e9]) {
        for (const ready of [true, false]) {
          setup(upg, bolts, ready)
          const wr = await open()
          expect(offers(wr).length, `upg ${upg} bolts ${bolts} ready ${ready}`).toBe(1)
          wr.unmount()
          w = null
        }
      }
    }
  })
})
