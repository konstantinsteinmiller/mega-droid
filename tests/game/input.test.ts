// @vitest-environment jsdom
// Desktop input (src/game/engine/input.ts): the keys a playtest asked for
// (Space dodges, B beams out, the left mouse button charges), the captured
// mouse (movement looks, buttons read from MOUSE events so a second button
// held with the first still registers), and the drag fallback where the
// capture is refused. jsdom has no pointer lock, so the captured state is
// entered by hand where a test needs it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachInput, consumeEdges, createInput, type Input } from '@/game/engine/input'

let surface: HTMLDivElement
let input: Input
let detach: () => void
let fireMode = false

const key = (type: 'keydown' | 'keyup', code: string) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
const mouse = (type: string, init: MouseEventInit & { movementX?: number; movementY?: number } = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  // jsdom's MouseEvent ignores movementX/Y in the init dict.
  Object.defineProperty(e, 'movementX', { value: init.movementX ?? 0 })
  Object.defineProperty(e, 'movementY', { value: init.movementY ?? 0 })
  const target = type === 'mousedown' ? surface : type === 'mousemove' ? document : window
  target.dispatchEvent(e)
}

beforeEach(() => {
  surface = document.createElement('div')
  document.body.appendChild(surface)
  input = createInput()
  fireMode = false
  detach = attachInput(surface, input, { fireMode: () => fireMode, canLock: () => true })
})
afterEach(() => {
  detach()
  surface.remove()
})

describe('keys', () => {
  it('Space dodges (a slide), it no longer fires', () => {
    key('keydown', 'Space')
    expect(input.slideQueued).toBe(true)
    expect(input.firePressed).toBe(false)
    expect(input.fireHeld).toBe(false)
    key('keyup', 'Space')
    expect(input.fireReleased).toBe(false)
  })

  it('B beams out, E interacts, 1 fires the first weapon', () => {
    key('keydown', 'KeyB')
    key('keydown', 'KeyE')
    key('keydown', 'Digit1')
    expect(input.beamQueued).toBe(true)
    expect(input.interactQueued).toBe(true)
    expect(input.weaponQueued).toBe(1)
    consumeEdges(input)
    expect(input.beamQueued).toBe(false)
    expect(input.interactQueued).toBe(false)
  })

  it('Ctrl does nothing (Ctrl+W with W held would close the tab)', () => {
    key('keydown', 'ControlLeft')
    expect(input.slideQueued).toBe(false)
  })

  it('WASD moves and arrows turn', () => {
    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    expect(input.moveY).toBeGreaterThan(0)
    expect(input.moveX).toBeGreaterThan(0)
    key('keydown', 'ArrowLeft')
    expect(input.turn).toBe(-1)
  })
})

describe('captured mouse', () => {
  beforeEach(() => { input.locked = true })

  it('moving the mouse looks, and a glitch spike is dropped', () => {
    mouse('mousemove', { movementX: 12, movementY: -4 })
    mouse('mousemove', { movementX: 5, movementY: 0 })
    expect(input.lookDX).toBe(17)
    expect(input.lookDY).toBe(-4)
    mouse('mousemove', { movementX: 900, movementY: 0 })
    expect(input.lookDX).toBe(17)
  })

  it('the left button shoots and charges while held, whatever is in sight', () => {
    fireMode = false
    mouse('mousedown', { button: 0 })
    expect(input.firePressed).toBe(true)
    expect(input.fireHeld).toBe(true)
    // Moving while charging is aiming, not a drag: the charge survives.
    mouse('mousemove', { movementX: 40, movementY: 0 })
    expect(input.fireCancelled).toBe(false)
    mouse('mouseup', { button: 0 })
    expect(input.fireHeld).toBe(false)
    expect(input.fireReleased).toBe(true)
  })

  it('the right button blocks, even with the left one held', () => {
    mouse('mousedown', { button: 0 })
    mouse('mousedown', { button: 2 })
    expect(input.blockHeld).toBe(true)
    expect(input.fireHeld).toBe(true)
    mouse('mouseup', { button: 2 })
    expect(input.blockHeld).toBe(false)
  })

  it('a right press is the game\'s: its browser default is cancelled', () => {
    const e = new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true })
    surface.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(input.blockHeld).toBe(true)
  })
})

describe('refused capture: drag to look', () => {
  it('jsdom has no pointer lock, so the mouse falls back', () => {
    expect(input.lockRefused).toBe(true)
  })

  it('a press that travels becomes a look and drops the charge unfired', () => {
    fireMode = true
    mouse('mousedown', { button: 0, clientX: 100, clientY: 100 })
    expect(input.firePressed).toBe(true)
    mouse('mousemove', { clientX: 130, clientY: 100 })
    expect(input.fireCancelled).toBe(true)
    expect(input.fireHeld).toBe(false)
    expect(input.lookDX).toBe(30)
  })

  it('out of a fight a short click still fires (a sleeping golem is no target)', () => {
    fireMode = false
    mouse('mousedown', { button: 0, clientX: 50, clientY: 60 })
    expect(input.firePressed).toBe(true)
    mouse('mouseup', { button: 0, clientX: 50, clientY: 60 })
    expect(input.fireReleased).toBe(true)
    // Reported as a tap too, which only ever opens a chest or door in reach
    // (`Mission.handleTaps`): there is no tap-to-walk.
    expect(input.taps).toHaveLength(1)
  })

  it('out of a fight a drag still only looks', () => {
    fireMode = false
    mouse('mousedown', { button: 0, clientX: 100, clientY: 100 })
    mouse('mousemove', { clientX: 140, clientY: 100 })
    expect(input.fireHeld).toBe(false)
    expect(input.fireCancelled).toBe(true)
    expect(input.lookDX).toBe(40)
  })
})

describe('a touch\'s own mouse events', () => {
  // Chrome sends a compatibility mousedown / mouseup after a tap, flagged
  // `sourceCapabilities.firesTouchEvents`. After a long press they come past
  // the old time window: read as a real mouse, the device turned 'mouse' and
  // the touch HUD swapped for the desktop one mid-game.
  it('never turn the device to mouse, fire, or capture', () => {
    input.device = 'touch'
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
    Object.defineProperty(e, 'sourceCapabilities', { value: { firesTouchEvents: true } })
    surface.dispatchEvent(e)
    expect(input.device).toBe('touch')
    expect(input.firePressed).toBe(false)
    expect(input.taps.length).toBe(0)
  })

  it('a real mouse still counts', () => {
    input.device = 'touch'
    mouse('mousedown', { button: 0 })
    expect(input.device).toBe('mouse')
  })
})
