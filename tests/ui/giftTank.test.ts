// @vitest-environment jsdom
// ─── Gel for the road: Pip's offer, and the pedestal's ───────────────────────
//
// A rewarded video packs one Repair Gel for the next mission. In the walkable
// lab (#173) Pip hands it out in his supplies dialog, and the pedestal Flux
// is about to deploy from offers it under its mission card. Offered only
// after the tutorial, only while a rewarded ad is ready, and not while a gift
// is already packed (a badge says so instead). The claim half is
// tests/game/giftTank.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import { hubDialog, hubUi } from '@/game/state/hubUi'
import { hubTab } from '@/components/hub/hubLesson'
import PipDialog from '@/components/hub/PipDialog.vue'
import HubPrompt from '@/components/hub/HubPrompt.vue'

// FModal measures its ribbon with a ResizeObserver, which jsdom lacks.
vi.stubGlobal('ResizeObserver', class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
})

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
vi.mock('@/game/boot', () => ({ input: { device: 'touch' }, currentHub: () => null }))
vi.mock('@/game/flow', async () => {
  const { reactive } = await import('vue')
  const { tutorialQuest } = await import('@/game/data/quests')
  return {
    flow: reactive({ modal: '', loading: false, screen: 'hub' }),
    // The pedestal Flux stands on carries a mission.
    padQuest: () => ({ ...tutorialQuest(), id: 'story_blaze', sector: 'blaze', template: 'stage' }),
    rerollJob: () => {},
    briefingToReplay: () => null,
    storyFor: () => null
  }
})

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })
const mountPip = () => {
  hubDialog.open = true
  return mount(PipDialog, { attachTo: document.body, global: { plugins: [i18n()], stubs: { teleport: true } } })
}
const mountPad = () => {
  hubUi.near = 'story:blaze'
  hubUi.places = [{ id: 'story:blaze', state: 'next' }]
  return mount(HubPrompt, { global: { plugins: [i18n()] } })
}

beforeEach(() => {
  ad.ready.value = true
  ad.watched = true
  profile.world.tutorialDone = true
  profile.hero.skills = {}
  profile.inv.tanks = 1
  profile.inv.giftTank = false
  profile.quests.jobs = []
  hubUi.cine = false
  hubTab.value = 'missions'
  hubDialog.open = false
  hubDialog.board = false
  document.body.innerHTML = ''
})

describe('Pip\'s gel for the road', () => {
  it('offers +1 Repair Gel for a video after the tutorial', () => {
    const w = mountPip()
    const row = w.get('[data-pip="gel"]')
    expect(row.text()).toContain('Gel for the road')
    expect(row.get('button').attributes('aria-label')).toBe(en.hub.gift.aria)
  })

  it('packs the gift when the video was watched, then shows the badge instead', async () => {
    const w = mountPip()
    await w.get('[data-pip="gel"] button').trigger('click')
    await nextTick()
    expect(profile.inv.giftTank).toBe(true)
    expect(profile.inv.tanks).toBe(1)
    expect(w.find('[data-pip="gel"]').exists()).toBe(false)
    expect(w.get('[data-pip="gel-ready"]').text()).toContain('Gift packed!')
  })

  it('packs nothing when the video was not finished', async () => {
    ad.watched = false
    const w = mountPip()
    await w.get('[data-pip="gel"] button').trigger('click')
    await nextTick()
    expect(profile.inv.giftTank).toBe(false)
  })

  it('is not offered during the tutorial, or with no ad ready', () => {
    profile.world.tutorialDone = false
    expect(mountPip().find('[data-pip="gel"]').exists()).toBe(false)
    profile.world.tutorialDone = true
    ad.ready.value = false
    expect(mountPip().find('[data-pip="gel"]').exists()).toBe(false)
  })

  it('still shows a packed gift when no ad is ready', () => {
    ad.ready.value = false
    profile.inv.giftTank = true
    expect(mountPip().find('[data-pip="gel-ready"]').exists()).toBe(true)
  })

  it('is not offered while he already carries more than the cap', () => {
    profile.inv.tanks = 3
    expect(mountPip().find('[data-pip="gel"]').exists()).toBe(false)
  })

  it('sits beside the bolts offer: one video for bolts, one for the gel', () => {
    const w = mountPip()
    expect(w.find('[data-pip="bolts"]').exists()).toBe(true)
    expect(w.find('[data-pip="gel"]').exists()).toBe(true)
  })
})

describe('the pedestal\'s gel for the road', () => {
  it('is offered under the mission card, where the player is about to deploy', async () => {
    const w = mountPad()
    await nextTick()
    expect(w.find('[data-hub="deploy"]').exists()).toBe(true)
    const offer = w.get('[data-gift="offer"]')
    expect(offer.attributes('aria-label')).toBe(en.hub.gift.aria)
    await offer.trigger('click')
    await nextTick()
    expect(profile.inv.giftTank).toBe(true)
    expect(w.get('[data-gift="ready"]').text()).toContain('Gift packed!')
  })

  it('is not offered with no ad ready', async () => {
    ad.ready.value = false
    const w = mountPad()
    await nextTick()
    expect(w.find('[data-gift="offer"]').exists()).toBe(false)
  })
})
