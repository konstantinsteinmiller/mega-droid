// @vitest-environment jsdom
// #120: no jobs before the Flame Master. A playtester took two Scrapyard jobs
// instead of the Flame Master's stage, never saw its platforming and got
// bored of the labyrinths. Until then the board says when it opens.

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import MissionsTab from '@/components/hub/MissionsTab.vue'

const board = vi.hoisted(() => ({ open: false }))
vi.mock('@/use/useAdGate', async () => {
  const { ref: r } = await import('vue')
  return { canOfferReward: r(false), adInFlight: r(false), claimReward: vi.fn() }
})
vi.mock('@/use/useSound', () => ({ resumeMusicAfterAd: vi.fn() }))
vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/game/flow', () => ({ storyFor: () => null, startMission: vi.fn(), rerollJob: vi.fn(), jobsOpen: () => board.open }))
vi.mock('@/use/useDragScroll', () => ({ useDragScroll: () => {}, revealIn: () => {} }))

const mountTab = () => mount(MissionsTab, {
  global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
})

describe('the job board before the Flame Master', () => {
  it('shows no job, and says which Master opens it', () => {
    board.open = false
    profile.world.tutorialDone = true
    profile.quests.jobs = []
    const w = mountTab()
    expect(w.findAll('.quest').length + w.findAll('[data-quest]').length).toBe(0)
    expect(w.get('[data-jobs="locked"]').text()).toBe('Jobs open once you have beaten Blaze Master.')
    // The secured Scrapyard does not promise jobs that are not there.
    expect(w.text()).not.toContain(en.hub.sectorSecured)
  })

  it('opens with the board', () => {
    board.open = true
    const w = mountTab()
    expect(w.find('[data-jobs="locked"]').exists()).toBe(false)
  })
})
