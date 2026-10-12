// @vitest-environment jsdom
// ─── Poki: the free choice comes first, and is never the smaller one ─────────
//
// Poki's monetization rules (integrate-poki REQUIREMENTS §3): "The free/standard
// continue must be in the primary position and equal or larger than the
// rewarded option." The result screen used to lead with the rewarded "Double
// bolts" — wider than Continue in every language — and the defeat screen put
// "Reboot (ad)" before "Retreat". Both are fixed for the Poki build through
// `platformPolicy.freeOptionFirst`; every other portal keeps its layout.
//
// Pinned per policy: the DOM order of the footer buttons (DOM, not a CSS
// `order`, so keyboard and screen-reader order match what is seen), the
// invisible, aria-hidden copy of the rewarded label that sizes the free button,
// and the small size the equal pair takes in a tight landscape (Poki's 640×360)
// so it stays on one row instead of pushing the stats into a scroll.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

enableAutoUnmount(afterEach)

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })

// FModal teleports and plays sounds; FButton pulls the icon set. Neither is
// what is under test: render the slots, and each button as its label + icon.
const stubs = {
  FModal: { template: '<div class="fmodal"><slot /><slot name="footer" /></div>' },
  FButton: {
    props: ['label', 'type', 'icon', 'isDisabled', 'size', 'emphasis'],
    template: `<button class="fb" :data-icon="icon" :data-size="size || 'md'"><slot>{{ label }}</slot></button>`
  },
  GameIcon: true,
  RankBadge: true
}

const mockCommon = async (freeOptionFirst: boolean) => {
  vi.resetModules()
  const { ref, reactive } = await import('vue')
  vi.doMock('@/platforms/capabilities', () => ({ platformPolicy: { freeOptionFirst, devTools: true } }))
  vi.doMock('@/use/useAdGate', () => ({ claimReward: vi.fn(), canOfferReward: ref(true), adInFlight: ref(false) }))
  return { ref, reactive }
}

const mountResults = async (freeOptionFirst: boolean, success = true, viewport = { short: false, width: 1280 }) => {
  const { ref, reactive } = await mockCommon(freeOptionFirst)
  vi.doMock('@/use/useUser', () => ({ isShortViewport: ref(viewport.short), windowWidth: ref(viewport.width) }))
  vi.doMock('@/game/flow', () => ({
    goHub: vi.fn(),
    flow: reactive({
      modal: 'results',
      results: {
        quest: { template: 'tutorial', sector: 'scrapyard' },
        success, xp: 120, bolts: 80, kills: 3, chests: 0, items: [],
        levelBefore: 1, levelAfter: 1, seconds: 16, weapon: null, unlocked: null
      }
    })
  }))
  vi.doMock('@/game/state/profile', () => ({ profile: { bolts: 0 }, saveProfile: vi.fn(), lifetimeXp: () => 0 }))
  vi.doMock('@/game/models/palette', () => ({ RARITY_COLOR: {} }))
  // The found-gear rows are not what this spec is about.
  vi.doMock('@/components/molecules/LootCompare.vue', () => ({ default: { name: 'LootCompare', render: () => null } }))
  vi.doMock('@/game/data/weapons', () => ({ WEAPONS: {} }))
  vi.doMock('@/use/useLeaderboard', () => ({ leaderboardEnabled: false }))
  vi.doMock('@/components/molecules/RankBadge.vue', () => ({ default: { template: '<i />' } }))
  const { default: ResultsModal } = await import('@/components/modals/ResultsModal.vue')
  return mount(ResultsModal, { global: { plugins: [i18n()], stubs } })
}

const mountDefeat = async (freeOptionFirst: boolean, tanks = 0) => {
  const { reactive } = await mockCommon(freeOptionFirst)
  vi.doMock('@/game/flow', () => ({ flow: reactive({ modal: 'defeat', quest: { id: 'q' } }) }))
  vi.doMock('@/game/state/hud', () => ({ hud: reactive({ tanks }) }))
  vi.doMock('@/game/boot', () => ({ currentMission: () => ({ xp: 5, bolts: 3, revive: vi.fn(), retreat: vi.fn() }) }))
  vi.doMock('@/game/state/profile', () => ({ profile: { inv: { tanks } }, saveProfile: vi.fn() }))
  vi.doMock('@/use/useSound', () => ({ resumeMusicAfterAd: vi.fn() }))
  const { default: DefeatModal } = await import('@/components/modals/DefeatModal.vue')
  return mount(DefeatModal, { global: { plugins: [i18n()], stubs } })
}

// The result screen's offer is drawn by its own badge (`TripleOffer`), not by
// FButton's glyph: it reads as 'video' here all the same.
const order = (w: Awaited<ReturnType<typeof mountResults>>) =>
  // A rewarded button reads as 'video': the ×3 offer, or any button signed
  // with the rewarded badge (the Reboot) — its sizer copy aside.
  w.findAll('button.fb').map((b) => (
    b.classes().includes('offer') || b.find(':scope > .ad-label .reward-ad-badge').exists() ? 'video' : b.attributes('data-icon')
  ))

describe('result screen', () => {
  it('Poki: Continue first, sized by an invisible copy of the rewarded label', async () => {
    const w = await mountResults(true)
    expect(order(w)).toEqual(['forward', 'video'])
    const [cont, double] = w.findAll('button.fb')
    const sizer = cont!.find('.sizer')
    expect(sizer.exists()).toBe(true)
    expect(sizer.attributes('aria-hidden')).toBe('true')
    expect(sizer.text()).toBe(double!.text())
    // …and the whole offer, badge included, not just its words.
    expect(sizer.find('.triple-offer').exists()).toBe(true)
    // The visible label is still just "Continue".
    expect(cont!.find('.free-label > span:first-child').text()).toBe(en.continue)
  })

  it('Poki: a failed mission offers nothing, so Continue stands alone with no sizer', async () => {
    const w = await mountResults(true, false)
    expect(order(w)).toEqual(['forward'])
    expect(w.find('.sizer').exists()).toBe(false)
  })

  it('Poki: in a tight landscape (640×360) the pair takes the small size, so it stays on one row', async () => {
    const tight = await mountResults(true, true, { short: true, width: 640 })
    expect(tight.findAll('button.fb').map((b) => b.attributes('data-size'))).toEqual(['sm', 'sm'])
    const wide = await mountResults(true, true, { short: true, width: 844 })
    expect(wide.findAll('button.fb').map((b) => b.attributes('data-size'))).toEqual(['md', 'md'])
  })

  it('every other portal keeps its layout (offer first)', async () => {
    const w = await mountResults(false)
    expect(order(w)).toEqual(['video', 'forward'])
    expect(w.find('.sizer').exists()).toBe(false)
  })
})

describe('defeat screen', () => {
  it('Poki: Retreat comes before Reboot (ad), and is sized by its label', async () => {
    const w = await mountDefeat(true)
    expect(order(w)).toEqual(['back', 'video'])
    const [retreat, reboot] = w.findAll('button.fb')
    expect(retreat!.find('.sizer').text()).toBe(reboot!.text())
    expect(retreat!.find('.sizer').attributes('aria-hidden')).toBe('true')
  })

  it('Poki: a repair tank (free) still leads; the ad stays last', async () => {
    const w = await mountDefeat(true, 2)
    expect(order(w)).toEqual(['flask', 'back', 'video'])
  })

  it('every other portal keeps its layout (Reboot before Retreat)', async () => {
    const w = await mountDefeat(false)
    expect(order(w)).toEqual(['video', 'back'])
  })
})

describe('the result screen\'s rewarded offer', () => {
  it('offers ×3 bolts: the badge shows the tripled total and the ×3 sticker', async () => {
    const w = await mountResults(false)
    const offer = w.find('button.offer')
    expect(offer.find('.x3').text()).toBe('×3')
    expect(offer.find('.amount').text()).toContain('+240')
    expect(offer.find('.what').text()).toBe(en.results.triple)
  })

  it('never matches the green of a plain confirm', async () => {
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(__dirname, '../../src/components/modals/ResultsModal.vue'), 'utf8')
    const offer = src.slice(src.indexOf('FButton.offer('), src.indexOf('TripleOffer(:amount', src.indexOf('FButton.offer(')))
    expect(offer).not.toMatch(/type="success"/)
    expect(offer).toMatch(/color-from="#ff9a2e"/)
  })
})
