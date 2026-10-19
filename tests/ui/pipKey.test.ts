// @vitest-environment jsdom
// ─── F opens Pip's supplies ──────────────────────────────────────────────────
//
// In the hall's first person the mouse is captured, as in a mission, so
// Pip's "!" and his pill in the status bar are out of the cursor's reach.
// F opens his dialog (his rewarded offers) while he has something to hand
// out, and on a keyboard the pill says so: "[F] Open". On touch it keeps its
// gift and "!", a tap away. The key half (F queues Pip, E interacts) is
// tests/game/input.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import { starterItems } from '@/game/data/items'
import { hud } from '@/game/state/hud'
import { hubTab } from '@/components/hub/hubLesson'
import { hubUi, hubDialog } from '@/game/state/hubUi'
import { placesFor } from '@/game/sim/hubPlaces'
import HubScreen from '@/components/hub/HubScreen.vue'

const dev = vi.hoisted(() => ({ device: 'mouse' }))
vi.mock('@/game/boot', () => ({
  input: { get device() { return dev.device } },
  currentHub: () => ({ goTo: () => {}, interact: () => {} })
}))
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
  return { leaderboardListEnabled: false, boardModalEnabled: ref(false) }
})
// A rewarded video is ready: Pip has supplies.
vi.mock('@/use/useAdGate', async () => {
  const { ref } = await import('vue')
  return { canOfferReward: ref(true), adInFlight: ref(false), claimReward: vi.fn() }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: () => {} }))
const stub = vi.hoisted(() => async (id: string) => {
  const { h } = await import('vue')
  return { default: { name: id, render: () => h('div') } }
})
vi.mock('@/components/hub/HeroTab.vue', () => stub('hero'))
vi.mock('@/components/hub/CircuitsTab.vue', () => stub('circuits'))
vi.mock('@/components/hub/WorkshopTab.vue', () => stub('workshop'))
vi.mock('@/components/hub/HubLesson.vue', () => stub('lesson'))
vi.mock('@/components/hub/PipDialog.vue', () => stub('pipDialog'))
vi.mock('@/components/story/HubSceneLayer.vue', () => stub('scene'))

let w: VueWrapper | null = null
const mountHub = async () => {
  hubUi.places = placesFor(false).map(p => ({ id: p.id, state: 'open' as const }))
  w = mount(HubScreen, {
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
  })
  await nextTick()
  return w
}

beforeEach(() => {
  profile.questsDone = 3
  profile.world.tutorialDone = true
  profile.inv.items = starterItems()
  profile.inv.giftTank = false
  profile.stats.lastDropAt = 0
  hubDialog.open = false
  hubTab.value = 'missions'
})
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
})

describe('Pip\'s pill', () => {
  it('on a keyboard: "[F] Open", the F key on it', async () => {
    dev.device = 'mouse'
    hud.device = 'mouse'
    const wr = await mountHub()
    const pill = wr.get('.pill.pip')
    expect(pill.find('.keycap').text()).toBe('F')
    expect(pill.text()).toContain('Open')
  })

  it('on touch: the gift and its "!", no key', async () => {
    dev.device = 'touch'
    hud.device = 'touch'
    const wr = await mountHub()
    const pill = wr.get('.pill.pip')
    expect(pill.find('.keycap').exists()).toBe(false)
    expect(pill.find('.pip-bang').exists()).toBe(true)
  })
})
