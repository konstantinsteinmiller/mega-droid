// @vitest-environment jsdom
// ─── Gel for the road: the Missions tab's offer ──────────────────────────────
//
// Where the player is about to deploy, a rewarded video packs one Repair Gel
// for the next mission. Offered only after the tutorial, only while a
// rewarded ad is ready, and not while a gift is already packed (a badge says
// so instead). The claim half is tests/game/giftTank.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import MissionsTab from '@/components/hub/MissionsTab.vue'

const ad = vi.hoisted(() => ({ ready: null as unknown as { value: boolean }, watched: true }))
vi.mock('@/use/useAdGate', async () => {
  const { ref: r } = await import('vue')
  ad.ready = r(true)
  return {
    canOfferReward: ad.ready,
    adInFlight: r(false),
    claimReward: vi.fn(async (grant: () => void) => { if (ad.watched) grant(); return ad.watched })
  }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: vi.fn() }))
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/game/flow', () => ({ storyFor: () => null, startMission: vi.fn(), rerollJob: vi.fn(), jobsOpen: () => true }))
vi.mock('@/use/useDragScroll', () => ({ useDragScroll: () => {}, revealIn: () => {} }))

const mountTab = () => mount(MissionsTab, {
  global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
})

beforeEach(() => {
  ad.ready.value = true
  ad.watched = true
  profile.world.tutorialDone = true
  profile.hero.skills = {}
  profile.inv.tanks = 1
  profile.inv.giftTank = false
  profile.quests.jobs = []
})

describe('the Missions tab gift offer', () => {
  it('offers +1 Repair Gel for a video after the tutorial', () => {
    const w = mountTab()
    const card = w.get('[data-gift="offer"]')
    expect(card.text()).toContain('Gel for the road')
    expect(card.get('button').attributes('aria-label')).toBe(en.hub.gift.aria)
  })

  it('packs the gift when the video was watched, then shows the badge instead', async () => {
    const w = mountTab()
    await w.get('[data-gift="offer"] button').trigger('click')
    await nextTick()
    expect(profile.inv.giftTank).toBe(true)
    expect(profile.inv.tanks).toBe(1)
    expect(w.find('[data-gift="offer"]').exists()).toBe(false)
    expect(w.get('[data-gift="ready"]').text()).toContain('Gift packed!')
  })

  it('packs nothing when the video was not finished', async () => {
    ad.watched = false
    const w = mountTab()
    await w.get('[data-gift="offer"] button').trigger('click')
    await nextTick()
    expect(profile.inv.giftTank).toBe(false)
  })

  it('is not offered during the tutorial, or with no ad ready', () => {
    profile.world.tutorialDone = false
    expect(mountTab().find('[data-gift]').exists()).toBe(false)
    profile.world.tutorialDone = true
    ad.ready.value = false
    expect(mountTab().find('[data-gift]').exists()).toBe(false)
  })

  it('still shows a packed gift when no ad is ready', () => {
    ad.ready.value = false
    profile.inv.giftTank = true
    expect(mountTab().find('[data-gift="ready"]').exists()).toBe(true)
  })

  it('is not offered while he already carries more than the cap', () => {
    profile.inv.tanks = 3
    expect(mountTab().find('[data-gift]').exists()).toBe(false)
  })
})
