// @vitest-environment jsdom
// ─── Cheat toggle and panel hotkey (#Cheat1) ────────────────────────────────
//
// Typing "cmonc" anywhere (not in a text field) flips `localStorage.cheat` and
// says so in a toast; the panel's shortcut (Shift+Ctrl+Alt+F1) only does
// anything while cheats are on, and then F1's browser help is prevented.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}
const type = (word: string, target: EventTarget = window) => { for (const c of word) key(c, {}, target) }
const f1 = () => key('F1', { code: 'F1', ctrlKey: true, shiftKey: true, altKey: true })

describe('cheat toggle (use/useCheats.ts)', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.removeItem('cheat')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('"cmonc" toggles localStorage.cheat on and off, with a toast each way', async () => {
    const m = await import('@/use/useCheats')
    expect(m.isCheat.value).toBe(false)
    type('cmonc')
    expect(localStorage.getItem('cheat')).toBe('true')
    expect(m.isCheat.value).toBe(true)
    expect(m.cheatUi.toast).toBe('cheat.on')
    type('cmonc')
    expect(localStorage.getItem('cheat')).toBeNull()
    expect(m.isCheat.value).toBe(false)
    expect(m.cheatUi.toast).toBe('cheat.off')
  })

  it('only in succession, and never while typing in a text field', async () => {
    const m = await import('@/use/useCheats')
    type('cmoxnc')
    expect(m.isCheat.value).toBe(false)
    const input = document.createElement('input')
    document.body.appendChild(input)
    type('cmonc', input)
    expect(m.isCheat.value).toBe(false)
    input.remove()
    type('xxcmonc')
    expect(m.isCheat.value).toBe(true)
  })

  it('Shift+Ctrl+Alt+F1 opens the panel only with cheats on, and prevents F1 then', async () => {
    const m = await import('@/use/useCheats')
    window.addEventListener('keydown', m.handleCheatKey)
    try {
      let e = f1()
      expect(m.cheatUi.open).toBe(false)
      expect(e.defaultPrevented).toBe(false)

      type('cmonc')
      e = f1()
      expect(m.cheatUi.open).toBe(true)
      expect(e.defaultPrevented).toBe(true)
      // Without every modifier it is not the shortcut.
      m.cheatUi.open = false
      key('F1', { code: 'F1', ctrlKey: true, altKey: true })
      expect(m.cheatUi.open).toBe(false)

      // Off again: the panel shuts and the shortcut is inert.
      f1()
      expect(m.cheatUi.open).toBe(true)
      type('cmonc')
      expect(m.cheatUi.open).toBe(false)
      e = f1()
      expect(m.cheatUi.open).toBe(false)
      expect(e.defaultPrevented).toBe(false)
    } finally {
      window.removeEventListener('keydown', m.handleCheatKey)
    }
  })
})
