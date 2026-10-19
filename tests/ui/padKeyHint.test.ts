// @vitest-environment jsdom
// On a pedestal in the walkable lab, the Deploy button carries its key on a
// keyboard ("[E] Deploy", as the stations' "[E] Open" do), so a desktop
// player sees E beams out; on touch it keeps its play sign.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import { hud } from '@/game/state/hud'
import { hubDialog, hubUi } from '@/game/state/hubUi'
import { hubTab } from '@/components/hub/hubLesson'
import HubPrompt from '@/components/hub/HubPrompt.vue'

const board = vi.hoisted(() => ({ job: null as unknown, device: 'mouse' }))
vi.mock('@/use/useAdGate', async () => {
  const { ref: r } = await import('vue')
  return { canOfferReward: r(false), adInFlight: r(false), claimReward: vi.fn() }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: vi.fn() }))
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/game/boot', () => ({ input: { get device() { return board.device } }, currentHub: () => null }))
vi.mock('@/game/flow', async () => {
  const { reactive } = await import('vue')
  return {
    flow: reactive({ modal: '', loading: false, screen: 'hub' }),
    padQuest: () => board.job,
    rerollJob: () => {},
    briefingToReplay: () => null,
    storyFor: () => null
  }
})

const mountPrompt = () => mount(HubPrompt, { global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })

beforeEach(async () => {
  profile.world.tutorialDone = true
  hubUi.cine = false
  hubUi.nearLocked = ''
  hubTab.value = 'missions'
  hubDialog.open = false
  const { rollJob } = await import('@/game/data/quests')
  board.job = rollJob(7, ['scrapyard', 'blaze'], 4)
  profile.quests.jobs = [board.job as never]
  hubUi.places = [{ id: 'job0', state: 'open' }]
  hubUi.near = 'job0'
})

describe('the Deploy button on a pedestal', () => {
  it('on a keyboard: the E key on it, no play sign', async () => {
    board.device = 'mouse'
    hud.device = 'mouse'
    const w = mountPrompt()
    await nextTick()
    const b = w.get('[data-hub="deploy"] .deploy')
    expect(b.find('.keycap').exists()).toBe(true)
    expect(b.find('.keycap').text()).toBe('E')
    expect(b.text()).toContain('Deploy')
  })

  it('on touch: the play sign, no key', async () => {
    board.device = 'touch'
    hud.device = 'touch'
    const w = mountPrompt()
    await nextTick()
    const b = w.get('[data-hub="deploy"] .deploy')
    expect(b.find('.keycap').exists()).toBe(false)
  })
})
