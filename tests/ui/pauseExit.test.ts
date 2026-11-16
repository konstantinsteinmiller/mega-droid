// @vitest-environment jsdom
// The pause menu's way out (#204): the 3D lab gets a menu (Resume, Options,
// Exit — no mission to abandon), and Exit leaves fullscreen before it closes
// the window. A desktop thing: a phone or tablet is left by the system.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

const g = vi.hoisted(() => ({ touch: false }))
vi.mock('@/game/boot', async (orig) => ({ ...(await orig<object>()), currentMission: () => null }))
vi.mock('@/game/engine/input', async (orig) => ({ ...(await orig<object>()), touchFirst: () => g.touch }))

import en from '@/i18n/locales/en'
import PauseModal from '@/components/modals/PauseModal.vue'
import { flow } from '@/game/flow'
import { exitGame, leaveFullscreen } from '@/utils/exitGame'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

const modal = () => mount(PauseModal, {
  attachTo: document.body,
  global: { plugins: [createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })] }
})
const labels = (): string[] => [...document.body.querySelectorAll('.actions button')].map(b => b.textContent?.trim() ?? '')

enableAutoUnmount(afterEach)
afterEach(() => { flow.modal = ''; flow.screen = 'hub'; g.touch = false; vi.restoreAllMocks() })

describe('the pause menu', () => {
  it('in the lab: Resume, Options and Exit, with no mission to abandon', async () => {
    flow.screen = 'hub'
    flow.modal = 'pause'
    modal()
    await nextTick()
    const l = labels().join('|')
    expect(l).toContain('Resume')
    expect(l).toContain('Exit game')
    expect(l).not.toContain('Abandon')
  })

  it('in a mission: Abandon stays, Exit joins it', async () => {
    flow.screen = 'mission'
    flow.modal = 'pause'
    modal()
    await nextTick()
    const l = labels().join('|')
    expect(l).toContain('Abandon')
    expect(l).toContain('Exit game')
  })

  it('no Exit on a phone or tablet', async () => {
    g.touch = true
    flow.screen = 'hub'
    flow.modal = 'pause'
    modal()
    await nextTick()
    expect(labels().join('|')).not.toContain('Exit game')
  })
})

describe('exitGame', () => {
  it('leaves fullscreen first, then closes the window', async () => {
    const order: string[] = []
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
    document.exitFullscreen = vi.fn(async () => { order.push('exit-fullscreen') })
    vi.spyOn(window, 'close').mockImplementation(() => { order.push('close') })
    await exitGame()
    expect(order).toEqual(['exit-fullscreen', 'close'])
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
  })

  it('is harmless when there is no fullscreen, or the browser refuses', async () => {
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
    document.exitFullscreen = vi.fn(async () => { throw new Error('refused') })
    await expect(leaveFullscreen()).resolves.toBeUndefined()
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    await expect(leaveFullscreen()).resolves.toBeUndefined()
  })
})
