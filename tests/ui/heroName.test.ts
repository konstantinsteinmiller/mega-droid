// @vitest-environment jsdom
// ─── The hero is Flux, and the lab says so ───────────────────────────────────
//
// The hero was called Cobalt, and a player who opened the "Cobalt" tab in the
// lab wondered what a metal was for: a name alone reads as a plain word, and
// "flux" is one too. So the hub tells the player it is a character: in the
// walkable lab (#173) his gear is at the Armory, whose label wears his face
// glyph and carries his name under the station's, and its panel opens on a
// name plate (his face, FLUX, "Your combat android").
//
// The locale half runs over every shipped language: the rename has to reach
// all of them (ja transliterates the name, the others keep it in Latin), and
// the two new strings have to be real translations. The component half mounts
// the hub with the real English and Japanese bundles.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import ja from '@/i18n/locales/ja'
import { LANGUAGES } from '@/utils/enums'
import { profile } from '@/game/state/profile'
import { flow } from '@/game/flow'
import GameIcon from '@/components/icons/GameIcon.vue'
import HubScreen from '@/components/hub/HubScreen.vue'
import HeroTab from '@/components/hub/HeroTab.vue'
import { hubTab } from '@/components/hub/hubLesson'
import { hubUi } from '@/game/state/hubUi'
import { placesFor } from '@/game/sim/hubPlaces'

// The hub's game-side imports, reduced to what it reads. The other panels
// and the upgrade tour are stubbed: this is about the Armory's label and the
// hero panel, not their contents.
vi.mock('@/game/boot', () => ({ input: { device: 'touch' }, currentHub: () => null }))
vi.mock('@/game/flow', () => ({
  flow: { modal: '', loading: false, screen: 'hub' }, padQuest: () => null, rerollJob: () => {}, briefingToReplay: () => null, storyFor: () => null
}))
vi.mock('@/use/useAdGate', async () => {
  const { ref } = await import('vue')
  return { canOfferReward: ref(false), adInFlight: ref(false), claimReward: () => {} }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: () => {} }))
vi.mock('@/components/story/HubSceneLayer.vue', () => ({ default: { name: 'HubSceneLayer', render: () => null } }))
vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useQaAdTrigger', () => ({ registerQaAdTap: () => false }))
vi.mock('@/use/useLeaderboard', () => ({ leaderboardListEnabled: false }))
vi.mock('@/components/organisms/LeaderboardModal.vue', () => ({ default: { name: 'LeaderboardModal', render: () => null } }))
vi.mock('@/components/hub/CircuitsTab.vue', () => ({ default: { name: 'CircuitsTab', render: () => null } }))
vi.mock('@/components/hub/WorkshopTab.vue', () => ({ default: { name: 'WorkshopTab', render: () => null } }))
vi.mock('@/components/hub/HubLesson.vue', () => ({ default: { name: 'HubLesson', render: () => null } }))

type Messages = Record<string, unknown>
const load = async (code: string): Promise<Messages> =>
  (await import(`../../src/i18n/locales/${code}.ts`)).default as Messages
const at = (m: Messages, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m)
const str = (m: Messages, path: string): string => {
  const v = at(m, path)
  expect(typeof v, `${path} is not a string`).toBe('string')
  return v as string
}
const allStrings = (o: unknown, path = ''): Array<[string, string]> =>
  typeof o === 'string'
    ? [[path, o]]
    : o && typeof o === 'object'
      ? Object.entries(o).flatMap(([k, v]) => allStrings(v, path ? `${path}.${k}` : k))
      : []

/** How each language writes the name: Japanese transliterated the old name
 *  (コバルト), so it transliterates this one; every other locale kept it Latin. */
const NAME: Record<string, string> = { ja: 'フラックス' }
const nameIn = (code: string): string => NAME[code] ?? 'Flux'

describe('every locale calls the hero Flux', () => {
  it.each(LANGUAGES)('%s: nothing still says Cobalt', async (code) => {
    const stale = allStrings(await load(code)).filter(([, v]) => /cobalt|コバルト|кобальт/i.test(v))
    expect(stale).toEqual([])
  })

  it.each(LANGUAGES)('%s: the hub tab is labelled with his name', async (code) => {
    expect(str(await load(code), 'hub.tab.hero')).toBe(nameIn(code))
  })

  it.each(LANGUAGES)('%s: the defeat screen names him', async (code) => {
    expect(str(await load(code), 'defeat.body')).toContain(nameIn(code))
  })
})

describe('the two new strings, in every locale', () => {
  it.each(LANGUAGES)('%s: the tab\'s spoken name starts from the visible one and says what he is', async (code) => {
    const m = await load(code)
    const aria = str(m, 'hub.heroTabAria')
    // The visible label inside the accessible name (WCAG 2.5.3), plus more.
    expect(aria).toContain(str(m, 'hub.tab.hero'))
    expect(aria.length).toBeGreaterThan(str(m, 'hub.tab.hero').length + 3)
  })

  it.each(LANGUAGES)('%s: the name plate\'s descriptor is there and does not repeat the name', async (code) => {
    const role = str(await load(code), 'hero.role')
    expect(role.trim().length).toBeGreaterThan(3)
    expect(role).not.toContain(nameIn(code))
  })

  it.each(LANGUAGES.filter(c => c !== 'en'))('%s: both are translated, not English copies', async (code) => {
    const m = await load(code)
    expect(str(m, 'hub.heroTabAria')).not.toBe(en.hub.heroTabAria)
    expect(str(m, 'hero.role')).not.toBe(en.hero.role)
  })
})

// ─── On screen ───────────────────────────────────────────────────────────────

const i18nFor = (locale: string, messages: Messages) =>
  createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, [locale]: messages } })

const mountHub = (locale = 'en', messages: Messages = en) => {
  hubUi.places = placesFor(false).map(p => ({ id: p.id, state: 'open' as const }))
  return mount(HubScreen, { global: { plugins: [i18nFor(locale, messages)] } })
}

beforeEach(() => {
  profile.hero.pendingAttrs = 0
  profile.inv.fresh = []
  // Every menu open (`hubUnlocks.ts`): the tabs here are the unlocked ones.
  profile.questsDone = 4
  flow.modal = ''
  hubTab.value = 'missions'
})

describe('the Armory in the lab', () => {
  it('its label wears his face glyph and carries his name under the station\'s', () => {
    const w = mountHub()
    const m = w.get('[data-place="hero"]')
    expect(m.find('.m-name').text()).toBe('Armory')
    expect(m.find('.m-sub').text()).toBe('Flux')
    expect(m.findComponent(GameIcon).props('name')).toBe('android')
  })

  it('opens on his name plate: his face, his name, what he is', async () => {
    const w = mountHub()
    expect(w.find('.plate').exists()).toBe(false)
    // Flux at the weapon rack: its panel.
    hubTab.value = 'hero'
    await nextTick()
    expect(w.get('.panel-head .ph-sub').text()).toBe('Flux')
    const plate = w.find('.hero .plate')
    expect(plate.exists()).toBe(true)
    expect(plate.find('.p-name').text()).toBe('Flux')
    expect(plate.find('.p-role').text()).toBe('Your combat android')
    // One drawing for one character: the plate's face is the label's glyph.
    const glyph = w.get('[data-place="hero"]').findComponent(GameIcon).props('name')
    expect(plate.findComponent(GameIcon).props('name')).toBe(glyph)
  })

  it('says the same in Japanese, with the transliterated name', async () => {
    const w = mountHub('ja', ja)
    expect(w.get('[data-place="hero"] .m-sub').text()).toBe('フラックス')
    hubTab.value = 'hero'
    await nextTick()
    expect(w.find('.plate .p-name').text()).toBe('フラックス')
    expect(w.find('.plate .p-role').text()).toBe('あなたの戦闘アンドロイド')
  })
})

describe('the hero panel', () => {
  const mountPanel = () => mount(HeroTab, { global: { plugins: [i18nFor('en', en)] } })

  it('leads with the name plate', () => {
    const first = mountPanel().find('.scroll').element.firstElementChild
    expect(first?.classList.contains('plate')).toBe(true)
  })

  it('keeps the pending-upgrade button, right under the plate, and it still opens the pick', async () => {
    profile.hero.pendingAttrs = 2
    const w = mountPanel()
    const kids = [...w.find('.scroll').element.children]
    expect(kids[0]?.classList.contains('plate')).toBe(true)
    expect(kids[1]?.classList.contains('attr-cta')).toBe(true)
    expect(w.find('.attr-cta').text()).toBe('Choose 2 system upgrade(s)!')
    await w.find('.attr-cta').trigger('click')
    expect(flow.modal).toBe('levelUp')
  })

  it('shows no upgrade button when nothing is pending', () => {
    expect(mountPanel().find('.attr-cta').exists()).toBe(false)
  })
})
