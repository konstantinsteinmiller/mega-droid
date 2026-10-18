// @vitest-environment jsdom
// #120: no jobs before the Flame Master. A playtester took two jobs in the
// Scrapyard instead of the Flame Master's stage, never saw its platforming
// and got bored of the labyrinths. In the walkable lab (#173) the job pads
// stand behind a red fence until then, and in front of one Flux is told
// which Master opens them.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import { hubDialog, hubUi } from '@/game/state/hubUi'
import { hubTab } from '@/components/hub/hubLesson'
import HubPrompt from '@/components/hub/HubPrompt.vue'

const board = vi.hoisted(() => ({ job: null as unknown }))
vi.mock('@/use/useAdGate', async () => {
  const { ref: r } = await import('vue')
  return { canOfferReward: r(false), adInFlight: r(false), claimReward: vi.fn() }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: vi.fn() }))
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/game/boot', () => ({ input: { device: 'touch' }, currentHub: () => null }))
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

beforeEach(() => {
  profile.world.tutorialDone = true
  profile.quests.jobs = []
  hubUi.cine = false
  hubUi.near = ''
  hubUi.nearLocked = ''
  hubTab.value = 'missions'
  hubDialog.open = false
  board.job = null
})

describe('the job pads before the Flame Master', () => {
  it('in front of a fenced pad: which Master opens the board, and no job', async () => {
    hubUi.places = [{ id: 'job0', state: 'locked' }]
    hubUi.nearLocked = 'job0'
    const w = mountPrompt()
    await nextTick()
    expect(w.get('.locked').text()).toBe('Jobs open once you have beaten Blaze Master.')
    expect(w.find('[data-hub="deploy"]').exists()).toBe(false)
  })

  it('opens with the board: the job on its pad, ready to deploy', async () => {
    const { rollJob } = await import('@/game/data/quests')
    board.job = rollJob(7, ['scrapyard', 'blaze'], 4)
    hubUi.places = [{ id: 'job0', state: 'open' }]
    hubUi.near = 'job0'
    const w = mountPrompt()
    await nextTick()
    expect(w.find('.locked').exists()).toBe(false)
    expect(w.find('[data-hub="deploy"]').exists()).toBe(true)
  })
})
