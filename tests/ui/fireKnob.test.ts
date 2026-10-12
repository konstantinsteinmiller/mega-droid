// @vitest-environment jsdom
// The touch fire button is a knob (mobile playtests 2026-10-08): pressed it
// shoots and charges, a drag looks and keeps the charge, the knob follows the
// thumb inside its housing, and the view follows the thumb at ONE fixed rate
// — inside the housing or past its rim, never a second speed (a playtest
// called the old turn-past-the-rim uncontrollable).

import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { hud, tickHud } from '@/game/state/hud'
import ActionButtons from '@/components/hud/ActionButtons.vue'

const input = vi.hoisted(() => ({
  device: 'touch', touched: false, anyPressed: false, fireHeld: false, firePressed: false, fireReleased: false,
  lookDX: 0, lookDY: 0, slideQueued: false
}))
vi.mock('@/game/boot', () => ({ input, currentMission: () => null }))

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })
const ptr = (type: string, x: number, y: number) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerId', { value: 7 })
  return e
}

describe('the fire knob', () => {
  it('shoots on press and looks at one fixed rate, inside the housing or past its rim', async () => {
    hud.phase = 'play'
    hud.device = 'touch'
    const w = mount(ActionButtons, { global: { plugins: [i18n()] }, attachTo: document.body })
    await nextTick()
    const btn = w.find('.act.fire').element as HTMLElement
    btn.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    btn.setPointerCapture = () => {}
    const knob = w.find('.fire-knob').element as HTMLElement

    btn.dispatchEvent(ptr('pointerdown', 50, 50))
    expect(input.firePressed).toBe(true)
    expect(input.fireHeld).toBe(true)

    // Inside the housing: the view follows the thumb, the knob moves, no turn.
    btn.dispatchEvent(ptr('pointermove', 70, 50))
    expect(input.lookDX).toBe(20)
    tickHud(0.5)
    expect(input.lookDX).toBe(20)
    expect(knob.style.transform).toMatch(/translate\(20/)

    // Past the rim: the knob stops at its travel; the view still moves
    // exactly with the thumb, on both axes, and never on its own.
    btn.dispatchEvent(ptr('pointermove', 160, 80))
    expect(input.lookDX).toBe(110)
    expect(input.lookDY).toBe(30)
    tickHud(0.5)
    expect(input.lookDX).toBe(110)
    expect(input.lookDY).toBe(30)
    expect(knob.style.transform).toMatch(/translate\(/)
    expect(input.fireHeld).toBe(true) // the charge is kept

    btn.dispatchEvent(ptr('pointerup', 160, 50))
    expect(input.fireReleased).toBe(true)
    expect(knob.style.transform).toBe('')
    const after = input.lookDX
    tickHud(0.5)
    expect(input.lookDX).toBe(after)
    w.unmount()
  })
})
