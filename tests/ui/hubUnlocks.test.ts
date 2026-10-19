// @vitest-environment jsdom
// ─── The lab's stations open one at a time ───────────────────────────────────
//
// Every lab menu was open from the first visit, which was a lot to take in
// after one mission. Now the Workshop opens after two finished missions,
// Circuits after three and the leaderboard after four (`hubUnlocks.ts`). In
// the walkable lab (#173) each of them is a station in the Deployment Hall,
// with a label floating over it: until it opens, the station stands dark and
// its label stays where it is, dimmed, with a lock. A tap on it answers with
// the "no" sound and a hint that says how many missions are left (hover on
// desktop; on touch it goes after 3 s or on the next tap; one at a time), and
// it is spoken as locked. The visit where it opens gives it a "new" chip and
// a short fanfare; the chip stays until the station is first used, and that
// is saved. The leaderboard keeps its pill in the status bar too.
//
// The locale half: the hint and the spoken name exist in every language, with
// real plural forms (three in ru/uk/pl, six in ar) through `i18n/plural.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'
import de from '@/i18n/locales/de'
import { LANGUAGES } from '@/utils/enums'
import { PLURAL_RULES } from '@/i18n/plural'
import { profile } from '@/game/state/profile'
import { starterItems } from '@/game/data/items'
import { getState } from '@/use/useGameState'
import { TUTORIAL_KEY } from '@/keys'
import { flow } from '@/game/flow'
import { sfx } from '@/game/audio/sfx'
import { hubTab } from '@/components/hub/hubLesson'
import { FLOOR_TIP, ALL_OPEN, openedTip, unlockedTip } from '@/components/hub/hubUnlocks'
import { hubUi, hubDialog } from '@/game/state/hubUi'
import { placesFor } from '@/game/sim/hubPlaces'
import GameIcon from '@/components/icons/GameIcon.vue'
import HubScreen from '@/components/hub/HubScreen.vue'

// The hub's game-side imports, reduced to what it reads. The three panels
// render a marker, the board a marker while it is open, and the upgrade tour
// is its own spec (tests/game/hubLesson.test.ts). A live leaderboard build,
// so the pill and the Hall of Fame are there. The hub mode is a stand-in that
// records where a tap walks Flux.
const hub = vi.hoisted(() => ({ goTo: null as unknown as ReturnType<typeof import('vitest')['vi']['fn']> }))
vi.mock('@/game/boot', async () => {
  const { vi: v } = await import('vitest')
  hub.goTo = v.fn()
  return { input: { device: 'touch' }, currentHub: () => ({ goTo: hub.goTo, interact: () => {} }) }
})
vi.mock('@/game/flow', async () => {
  const { reactive } = await import('vue')
  return {
    flow: reactive({ modal: '' as string, loading: false, screen: 'hub' }),
    padQuest: () => null, rerollJob: () => {}, briefingToReplay: () => null, storyFor: () => null
  }
})
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/use/useQaAdTrigger', () => ({ registerQaAdTap: () => false }))
vi.mock('@/use/useLeaderboard', async () => {
  const { ref } = await import('vue')
  return { leaderboardListEnabled: true, boardModalEnabled: ref(true) }
})
vi.mock('@/use/useAdGate', async () => {
  const { ref } = await import('vue')
  return { canOfferReward: ref(false), adInFlight: ref(false), claimReward: vi.fn() }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: () => {} }))
vi.mock('@/components/organisms/LeaderboardModal.vue', async () => {
  const { h: hh } = await import('vue')
  return {
    default: {
      name: 'LeaderboardModal',
      props: ['modelValue', 'score'],
      render(this: { modelValue: boolean }) { return this.modelValue ? hh('div', { class: 'board-open' }) : null }
    }
  }
})
const stubs = vi.hoisted(() => ({
  /** A panel that says which station is open. */
  panel: async (id: string) => {
    const { h } = await import('vue')
    return { default: { name: id, render: () => h('div', { class: `panel-${id}` }) } }
  }
}))
vi.mock('@/components/hub/HeroTab.vue', () => stubs.panel('hero'))
vi.mock('@/components/hub/CircuitsTab.vue', () => stubs.panel('circuits'))
vi.mock('@/components/hub/WorkshopTab.vue', () => stubs.panel('workshop'))
vi.mock('@/components/hub/HubLesson.vue', () => ({ default: { name: 'HubLesson', render: () => null } }))
vi.mock('@/components/story/HubSceneLayer.vue', () => ({ default: { name: 'HubSceneLayer', render: () => null } }))

type Messages = Record<string, unknown>
const i18nFor = (locale: string, messages: Messages) =>
  createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, [locale]: messages }, pluralRules: PLURAL_RULES })

let w: VueWrapper | null = null
/** Mounted, with its first visit's writes (floor, "new" flags) on screen. */
const mountHub = async (locale = 'en', messages: Messages = en) => {
  hubUi.places = placesFor(true).map(p => ({ id: p.id, state: 'open' as const }))
  w = mount(HubScreen, { attachTo: document.body, global: { plugins: [i18nFor(locale, messages)] } })
  await nextTick()
  return w
}
/** A station's label in the hall. */
const station = (wr: VueWrapper, id: string) => wr.get(`[data-place="${id}"]`)
const pill = (wr: VueWrapper) => wr.get('.pill.ranks')
const tips = (wr: VueWrapper) => wr.findAll('.lock-tip')
const sfxCalls = (name: string) => vi.mocked(sfx).mock.calls.filter(c => c[0] === name).length
const saved = () => getState<Record<string, unknown>>(TUTORIAL_KEY) ?? {}

/** A tap: the press (the window hears it first), then the click (`detail`
 *  1: a pointer's click; test-utils cannot set it). */
const tap = async (el: ReturnType<VueWrapper['get']>) => {
  await el.trigger('pointerdown', { pointerType: 'touch' })
  el.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  await nextTick()
}

/** A player with `n` finished missions and nothing from the old lab. */
const player = (n: number, extraTips: Record<string, true | number> = {}) => {
  profile.questsDone = n
  profile.story = 0
  profile.world.bosses = []
  profile.world.tutorialDone = n > 0
  profile.inv.items = starterItems()
  profile.inv.fresh = []
  profile.hero.skills = {}
  profile.hero.pendingAttrs = 0
  profile.stats.lastDropAt = 0
  profile.tips = { ...extraTips }
}

beforeEach(() => {
  vi.mocked(sfx).mockClear()
  hub.goTo.mockClear()
  hubDialog.open = false
  hubDialog.board = false
  flow.modal = ''
  hubTab.value = 'missions'
})
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a locked station', () => {
  it('keeps its label, dimmed, with a lock, spoken as locked with what it waits for', async () => {
    player(1)
    const wr = await mountHub()
    expect(station(wr, 'hero').classes()).not.toContain('locked')
    expect(station(wr, 'hero').find('.m-lock').exists()).toBe(false)
    for (const id of ['workshop', 'circuits', 'records']) {
      const s = station(wr, id)
      expect(s.classes()).toContain('locked')
      expect(s.attributes('aria-disabled')).toBe('true')
      expect(s.get('.m-lock').findComponent(GameIcon).props('name')).toBe('lock')
      // Its own glyph and name are still there: it is dimmed, not hidden.
      expect(s.find('.m-name').text()).not.toBe('')
    }
    expect(station(wr, 'workshop').attributes('aria-label')).toBe('Forge, locked: complete 1 more mission')
    expect(station(wr, 'circuits').attributes('aria-label')).toBe('Chip Lab, locked: complete 2 more missions')
    expect(station(wr, 'records').attributes('aria-label')).toBe('Hall of Fame, locked: complete 3 more missions')
    expect(pill(wr).classes()).toContain('locked')
    expect(pill(wr).find('.lock').exists()).toBe(true)
    expect(pill(wr).attributes('aria-label')).toBe('Leaderboard, locked: complete 3 more missions')
    // The settings cog is never locked.
    expect(wr.get('.pill.cog').classes()).not.toContain('locked')
  })

  it('cannot be opened: a tap plays the "no" sound, and Flux only walks over to its lock', async () => {
    player(1)
    const wr = await mountHub()
    await tap(station(wr, 'workshop'))
    expect(hubTab.value).toBe('missions')
    expect(wr.find('.panel-workshop').exists()).toBe(false)
    expect(sfxCalls('denied')).toBe(1)
    expect(hub.goTo).toHaveBeenCalledWith('workshop', false)
    await tap(pill(wr))
    expect(wr.find('.board-open').exists()).toBe(false)
    expect(sfxCalls('denied')).toBe(2)
  })

  it('opens once the count is reached: a tap walks Flux there to use it, and its panel opens', async () => {
    player(4, { [FLOOR_TIP]: 0 })
    const wr = await mountHub()
    for (const id of ['workshop', 'circuits']) {
      expect(station(wr, id).classes()).not.toContain('locked')
      expect(station(wr, id).attributes('aria-label')).toBe(`Walk to ${id === 'workshop' ? 'Forge' : 'Chip Lab'}`)
    }
    await tap(station(wr, 'circuits'))
    expect(hub.goTo).toHaveBeenCalledWith('circuits', true)
    // At the chip lab (the hub mode opens it on arrival): the Circuits panel.
    hubTab.value = 'circuits'
    await nextTick()
    expect(wr.find('.panel-circuits').exists()).toBe(true)
    // Back to the hall: the panel's own button (the tour's last anchor).
    await wr.get('[data-lesson="tab-missions"]').trigger('click')
    expect(hubTab.value).toBe('missions')
    await tap(pill(wr))
    expect(wr.find('.board-open').exists()).toBe(true)
    expect(sfxCalls('denied')).toBe(0)
  })
})

describe('the lock hint', () => {
  it('shows while the mouse is over a locked station\'s label, and goes when it leaves', async () => {
    player(1)
    const wr = await mountHub()
    await station(wr, 'circuits').trigger('pointerenter', { pointerType: 'mouse' })
    await nextTick()
    expect(tips(wr)).toHaveLength(1)
    expect(tips(wr)[0]!.text()).toBe('Complete 2 more missions to unlock')
    expect(tips(wr)[0]!.attributes('role')).toBe('tooltip')
    await station(wr, 'circuits').trigger('pointerleave', { pointerType: 'mouse' })
    expect(tips(wr)).toHaveLength(0)
    // Hovering an open one says nothing.
    await station(wr, 'hero').trigger('pointerenter', { pointerType: 'mouse' })
    expect(tips(wr)).toHaveLength(0)
  })

  it('shows on a tap and leaves by itself after 3 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    player(1)
    const wr = await mountHub()
    // A finger's pointerenter is not a hover.
    await station(wr, 'workshop').trigger('pointerenter', { pointerType: 'touch' })
    expect(tips(wr)).toHaveLength(0)
    await tap(station(wr, 'workshop'))
    expect(tips(wr)).toHaveLength(1)
    expect(tips(wr)[0]!.text()).toBe('Complete 1 more mission to unlock')
    // The finger lifting off is not "leaving".
    await station(wr, 'workshop').trigger('pointerleave', { pointerType: 'touch' })
    vi.advanceTimersByTime(2999)
    await nextTick()
    expect(tips(wr)).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(tips(wr)).toHaveLength(0)
  })

  it('leaves on the next tap anywhere', async () => {
    player(1)
    const wr = await mountHub()
    await tap(station(wr, 'workshop'))
    expect(tips(wr)).toHaveLength(1)
    await wr.get('.topbar').trigger('pointerdown', { pointerType: 'touch' })
    expect(tips(wr)).toHaveLength(0)
  })

  it('shows one at a time: a tap on another locked one moves it there', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    player(1)
    const wr = await mountHub()
    await tap(station(wr, 'workshop'))
    vi.advanceTimersByTime(2000)
    await tap(pill(wr))
    expect(tips(wr)).toHaveLength(1)
    expect(tips(wr)[0]!.text()).toBe('Complete 3 more missions to unlock')
    // Its own 3 s, not what was left of the first one's.
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(tips(wr)).toHaveLength(1)
    // A mouse over a third one while a tap's hint is up: still just one.
    await station(wr, 'circuits').trigger('pointerenter', { pointerType: 'mouse' })
    await nextTick()
    expect(tips(wr)).toHaveLength(1)
    expect(tips(wr)[0]!.text()).toBe('Complete 2 more missions to unlock')
  })

  it('answers the keyboard like a tap (it would never see a hover)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    player(1)
    const wr = await mountHub()
    // Enter/Space on a focused button: a click with `detail` 0.
    await station(wr, 'circuits').trigger('click')
    await nextTick()
    expect(tips(wr)).toHaveLength(1)
    expect(sfxCalls('denied')).toBe(1)
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(tips(wr)).toHaveLength(0)
  })

  it('is placed inside the screen, pointing at its label', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true })
    try {
      player(1)
      const wr = await mountHub()
      // The Forge's label near a portrait phone's bottom-right corner.
      const el = station(wr, 'workshop').element
      el.getBoundingClientRect = () => ({ left: 316, top: 700, width: 88, height: 60, right: 404, bottom: 760, x: 316, y: 700, toJSON: () => ({}) })
      await tap(station(wr, 'workshop'))
      await nextTick()
      const tip = tips(wr)[0]!
      expect(tip.classes()).toContain('placed')
      expect(tip.attributes('style')).toContain('left: 204px')
      expect(tip.attributes('style')).toContain('top: 652px')
      expect(tip.attributes('style')).toContain('--arrow: 156px')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    }
  })
})

describe('the unlock moment', () => {
  it('the first visit with the Forge open: a "new" chip and one fanfare', async () => {
    player(2, { [FLOOR_TIP]: 0 })
    const wr = await mountHub()
    const s = station(wr, 'workshop')
    expect(s.classes()).toContain('fresh')
    expect(s.get('.m-chip.new').text()).toBe('NEW')
    expect(station(wr, 'circuits').find('.m-chip.new').exists()).toBe(false)
    expect(sfxCalls('objective')).toBe(1)
    expect(saved()[unlockedTip('workshop')]).toBe(true)
  })

  it('the chip stays until the station is used, then is gone for good, across reloads', async () => {
    player(2, { [FLOOR_TIP]: 0 })
    await mountHub().then(x => x.unmount())
    // Back in the lab without having used it: still new, but no second fanfare.
    vi.mocked(sfx).mockClear()
    let wr = await mountHub()
    expect(station(wr, 'workshop').find('.m-chip.new').exists()).toBe(true)
    expect(sfxCalls('objective')).toBe(0)
    // Flux at the forge: its panel opens.
    hubTab.value = 'workshop'
    await nextTick()
    expect(wr.find('.panel-workshop').exists()).toBe(true)
    expect(station(wr, 'workshop').find('.m-chip.new').exists()).toBe(false)
    expect(station(wr, 'workshop').classes()).not.toContain('fresh')
    expect(saved()[openedTip('workshop')]).toBe(true)
    wr.unmount()
    // A reload reads the flag back from the save.
    profile.tips = { ...saved() } as typeof profile.tips
    hubTab.value = 'missions'
    wr = await mountHub()
    expect(station(wr, 'workshop').find('.m-chip.new').exists()).toBe(false)
  })

  it('the leaderboard gets its chip at four (the pill and the Hall of Fame), and loses it when the board opens', async () => {
    player(4, { [FLOOR_TIP]: 0, [unlockedTip('workshop')]: true, [openedTip('workshop')]: true, [unlockedTip('circuits')]: true, [openedTip('circuits')]: true })
    const wr = await mountHub()
    expect(pill(wr).classes()).toContain('fresh')
    expect(pill(wr).find('.new-chip').exists()).toBe(true)
    expect(station(wr, 'records').find('.m-chip.new').exists()).toBe(true)
    expect(sfxCalls('objective')).toBe(1)
    await tap(pill(wr))
    expect(pill(wr).find('.new-chip').exists()).toBe(false)
    expect(station(wr, 'records').find('.m-chip.new').exists()).toBe(false)
    expect(saved()[openedTip('leaderboard')]).toBe(true)
  })

  it('waits for the level-up pick to close, so the moment is seen', async () => {
    player(3, { [FLOOR_TIP]: 0, [unlockedTip('workshop')]: true, [openedTip('workshop')]: true })
    profile.hero.pendingAttrs = 1
    const wr = await mountHub()
    expect(flow.modal).toBe('levelUp')
    expect(sfxCalls('objective')).toBe(0)
    flow.modal = ''
    await nextTick()
    expect(sfxCalls('objective')).toBe(1)
    expect(station(wr, 'circuits').find('.m-chip.new').exists()).toBe(true)
  })
})

describe('returning players keep their stations', () => {
  it('a save from the old lab (one mission, tour taken) keeps every station, none of them "new"', async () => {
    player(1, { 'lesson:upgrade': true })
    const wr = await mountHub()
    for (const id of ['workshop', 'circuits']) {
      expect(station(wr, id).classes()).not.toContain('locked')
      expect(station(wr, id).find('.m-chip.new').exists()).toBe(false)
    }
    expect(pill(wr).classes()).not.toContain('locked')
    expect(pill(wr).find('.new-chip').exists()).toBe(false)
    expect(sfxCalls('objective')).toBe(0)
    // Decided once, and saved.
    expect(saved()[FLOOR_TIP]).toBe(ALL_OPEN)
  })

  it('a new player\'s first visit fixes the floor at 0, so their own upgrades later unlock nothing early', async () => {
    player(1)
    await mountHub().then(x => x.unmount())
    expect(profile.tips[FLOOR_TIP]).toBe(0)
    expect(saved()[FLOOR_TIP]).toBe(0)
    // Two missions later: the Forge (and the tour) were used.
    profile.questsDone = 2
    profile.tips['lesson:upgrade'] = true
    profile.inv.items[0]!.upg = 1
    const wr = await mountHub()
    expect(station(wr, 'workshop').classes()).not.toContain('locked')
    expect(station(wr, 'circuits').classes()).toContain('locked')
  })
})

describe('the requirement, in every language', () => {
  type M = Record<string, any>
  const load = async (code: string): Promise<M> => (await import(`../../src/i18n/locales/${code}.ts`)).default as M

  it.each(LANGUAGES)('%s: the hint and the spoken name are there, with the count and the name', async (code) => {
    const m = await load(code)
    const hint = m.hub?.unlock?.hint
    const aria = m.hub?.unlock?.aria
    expect(typeof hint).toBe('string')
    expect(typeof aria).toBe('string')
    expect(hint).toContain('{n}')
    expect(aria).toContain('{n}')
    for (const form of (aria as string).split('|')) expect(form).toContain('{name}')
    if (code !== 'en') {
      expect(hint).not.toBe(en.hub.unlock.hint)
      expect(aria).not.toBe(en.hub.unlock.aria)
    }
  })

  const say = (code: string, messages: M, n: number) => {
    const g = createI18n({ legacy: false, locale: code, messages: { [code]: messages }, pluralRules: PLURAL_RULES }).global
    return g.t('hub.unlock.hint', n)
  }

  it('picks the right plural form, with the number', async () => {
    const cases: Array<[string, number, string]> = [
      ['en', 1, 'Complete 1 more mission to unlock'],
      ['en', 3, 'Complete 3 more missions to unlock'],
      ['ru', 1, 'Выполните ещё 1 миссию, чтобы открыть'],
      ['ru', 2, 'Выполните ещё 2 миссии, чтобы открыть'],
      ['ru', 5, 'Выполните ещё 5 миссий, чтобы открыть'],
      ['ru', 12, 'Выполните ещё 12 миссий, чтобы открыть'],
      ['ru', 21, 'Выполните ещё 21 миссию, чтобы открыть'],
      ['uk', 3, 'Виконайте ще 3 місії, щоб відкрити'],
      ['uk', 11, 'Виконайте ще 11 місій, щоб відкрити'],
      ['pl', 1, 'Ukończ jeszcze 1 misję, aby odblokować'],
      ['pl', 4, 'Ukończ jeszcze 4 misje, aby odblokować'],
      ['pl', 5, 'Ukończ jeszcze 5 misji, aby odblokować'],
      ['pl', 22, 'Ukończ jeszcze 22 misje, aby odblokować'],
      ['ar', 1, 'أكمل مهمة واحدة أخرى لفتحه'],
      ['ar', 2, 'أكمل مهمتين أخريين لفتحه'],
      ['ar', 3, 'أكمل 3 مهام أخرى لفتحه'],
      ['ar', 11, 'أكمل 11 مهمة أخرى لفتحه'],
      ['de', 1, 'Noch 1 Mission abschließen zum Freischalten'],
      ['de', 2, 'Noch 2 Missionen abschließen zum Freischalten'],
      ['ja', 3, 'あと3回ミッションをクリアすると解放']
    ]
    for (const [code, n, text] of cases) expect(say(code, await load(code), n), `${code} ${n}`).toBe(text)
  })

  it('leaves the older two-form strings as they were', async () => {
    const m = await load('ru')
    const g = createI18n({ legacy: false, locale: 'ru', messages: { ru: m }, pluralRules: PLURAL_RULES }).global
    const plain = createI18n({ legacy: false, locale: 'ru', messages: { ru: m } }).global
    for (const n of [1, 2, 5, 21]) expect(g.t('enemyPlural.hardhat', n)).toBe(plain.t('enemyPlural.hardhat', n))
  })

  it('reads right on screen in Russian and German', async () => {
    player(0)
    let wr = await mountHub('ru', ru as Messages)
    // The station's own name in Russian, in the locked sentence.
    expect(station(wr, 'workshop').attributes('aria-label')).toBe(`${(ru as M).hub.place.workshop}, закрыто: выполните ещё 2 миссии`)
    await tap(station(wr, 'circuits'))
    expect(tips(wr)[0]!.text()).toBe('Выполните ещё 3 миссии, чтобы открыть')
    wr.unmount()
    player(1)
    wr = await mountHub('de', de as Messages)
    await tap(pill(wr))
    expect(tips(wr)[0]!.text()).toBe('Noch 3 Missionen abschließen zum Freischalten')
  })
})
