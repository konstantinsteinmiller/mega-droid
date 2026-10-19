// @vitest-environment jsdom
// ─── The portal-only leaderboard (a build whose own list is baked) ─────────
//
// Playgama bakes our board, so its rows would be invented players and our list
// stays hidden. The portal's own board is live there, so the owner's call
// (2026-10-19): the hub offers the leaderboard while the portal's board reads
// back, and the modal shows ONLY the portal's tab. Vitest's env blanks
// `VITE_LEADERBOARD_URL`, which is exactly that build. Every build with a live
// endpoint keeps both tabs (`LeaderboardModal`'s Phase 8 comment).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import type { PortalBoardAdapter, PortalBoardEntry } from '@/use/usePortalLeaderboard'

enableAutoUnmount(afterEach)
// FModal measures its header; jsdom has no ResizeObserver.
vi.stubGlobal('ResizeObserver', class { observe () {} unobserve () {} disconnect () {} })
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const adapter = (entries: () => Promise<PortalBoardEntry[] | null>): PortalBoardAdapter => ({
  label: 'Playgama',
  mode: () => 'in_game',
  submit: async () => true,
  entries
})

const load = async () => {
  vi.resetModules()
  const portal = await import('@/use/usePortalLeaderboard')
  const board = await import('@/use/useLeaderboard')
  const Modal = (await import('@/components/organisms/LeaderboardModal.vue')).default
  const open = () => mount(Modal, {
    props: { modelValue: true, score: 0 },
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })] }
  })
  return { ...portal, ...board, open }
}

const tabs = () => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
const text = () => document.body.textContent ?? ''

describe('the hub offers the board only while the portal has one', () => {
  it('is off on a baked build with no portal board', async () => {
    const m = await load()
    expect(m.leaderboardListEnabled).toBe(false)
    expect(m.boardModalEnabled.value).toBe(false)
  })

  it('turns on once the portal board registers, and off again when its read fails', async () => {
    const m = await load()
    m.setPortalBoard(adapter(async () => null))
    expect(m.boardModalEnabled.value).toBe(true)
    await m.ensurePortalBoard()
    expect(m.boardModalEnabled.value).toBe(false)
  })
})

describe('the modal on a portal-only build', () => {
  it('shows only the portal tab, with the portal rows and no footer from our board', async () => {
    const m = await load()
    m.setPortalBoard(adapter(async () => [
      { rank: 1, name: 'Ada', score: 1200, isYou: false },
      { rank: 2, name: 'Bo', score: 300, isYou: true }
    ]))
    m.open()
    await flushPromises()
    expect(tabs()).toEqual(['Playgama'])
    expect(document.querySelectorAll('.board-row.is-portal')).toHaveLength(2)
    expect(text()).toContain('Ada')
    expect(document.querySelector('.board__footer')).toBeNull()
    expect(text()).not.toContain(en.leaderboard.tabGlobal)
  })

  it("says it couldn't reach the board when the read fails — never our baked list", async () => {
    const m = await load()
    m.setPortalBoard(adapter(async () => { throw new Error('offline') }))
    m.open()
    await flushPromises()
    expect(text()).toContain(en.leaderboard.failed)
    expect(document.querySelector('.board-row:not(.is-portal)')).toBeNull()
  })
})
