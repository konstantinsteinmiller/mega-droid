// @vitest-environment jsdom
// Touch controls on a phone (src/game/engine/input.ts): a mouse is treated as
// a finger there and never turns the HUD into the desktop one, and the resting
// joystick grabs by its centre. jsdom has no PointerEvent, so pointer events
// are MouseEvents with the pointer fields laid on.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachInput, createInput, touchFirst, type Input } from '@/game/engine/input'

const PHONE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

let surface: HTMLDivElement
let input: Input
let detach: () => void

const pointer = (type: string, x: number, y: number, pointerType = 'touch', pointerId = 1) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  Object.defineProperty(e, 'pointerId', { value: pointerId })
  surface.dispatchEvent(e)
}

const mount = () => {
  surface = document.createElement('div')
  // 800 × 400 surface at the origin.
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(surface)
  input = createInput()
  detach = attachInput(surface, input, { fireMode: () => false, canLock: () => true })
}

afterEach(() => {
  detach()
  surface.remove()
  vi.restoreAllMocks()
})

describe('on a phone', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PHONE)
    mount()
  })

  it('is touch-first, and never asks to capture the mouse', () => {
    expect(touchFirst()).toBe(true)
    expect(input.device).toBe('touch')
    expect(input.lockRefused).toBe(true)
  })

  it('a mouse click and a key press leave the controls on touch', () => {
    surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    expect(input.device).toBe('touch')
    expect(input.moveY).toBeGreaterThan(0) // the keys still work
  })

  it('a mouse drag on the left works the stick like a finger', () => {
    pointer('pointerdown', 100, 300, 'mouse')
    pointer('pointermove', 150, 300, 'mouse')
    expect(input.joyActive).toBe(true)
    expect(input.moveX).toBeGreaterThan(0)
    pointer('pointerup', 150, 300, 'mouse')
    expect(input.joyActive).toBe(false)
  })
})

describe('the resting joystick', () => {
  beforeEach(() => {
    mount()
    input.joyHomeX = 104
    input.joyHomeY = 296
    input.joyHomeR = 76
  })

  it('a press on it grabs it by its centre, already pushing toward the finger', () => {
    pointer('pointerdown', 144, 296)
    expect(input.joyActive).toBe(true)
    expect(input.joyOriginX).toBe(104)
    expect(input.joyOriginY).toBe(296)
    expect(input.moveX).toBeGreaterThan(0.5)
  })

  it('a press elsewhere on the left still floats the stick under the thumb', () => {
    pointer('pointerdown', 250, 120)
    expect(input.joyActive).toBe(true)
    expect(input.joyOriginX).toBe(250)
    expect(input.moveX).toBe(0)
  })

  it('without a resting stick (radius 0) nothing is grabbed from afar', () => {
    input.joyHomeR = 0
    pointer('pointerdown', 144, 296)
    expect(input.joyOriginX).toBe(144)
  })
})

describe('on a desktop', () => {
  beforeEach(mount)

  it('is not touch-first: the mouse keeps the desktop controls', () => {
    expect(touchFirst()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    expect(input.device).toBe('mouse')
  })

  it('a mouse pointer event is not read as a finger', () => {
    pointer('pointerdown', 100, 300, 'mouse')
    expect(input.joyActive).toBe(false)
  })
})

// Playtest 2026-10-08: the right half is the second stick of an FPS. A press
// shoots and charges whenever play allows a shot — no target needed — and a
// drag looks while the charge stays held (it used to be dropped, so turning
// after a machine that left the auto-aim killed every charge).
describe('the right half on touch', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PHONE)
    surface = document.createElement('div')
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
    document.body.appendChild(surface)
    input = createInput()
    detach = attachInput(surface, input, { fireMode: () => true, canLock: () => true })
  })

  it('a press shoots and charges; a drag looks and keeps the charge; letting go fires it', () => {
    pointer('pointerdown', 600, 200)
    expect(input.firePressed).toBe(true)
    expect(input.fireHeld).toBe(true)
    pointer('pointermove', 640, 210)
    pointer('pointermove', 660, 190)
    expect(input.fireCancelled).toBe(false)
    expect(input.fireHeld).toBe(true)
    // One look rate: the view follows the finger exactly.
    expect(input.lookDX).toBe(60)
    expect(input.lookDY).toBe(-10)
    pointer('pointerup', 660, 190)
    expect(input.fireReleased).toBe(true)
    expect(input.taps).toHaveLength(0)
  })

  it('a short still tap still reports where it was (to open a chest in reach)', () => {
    pointer('pointerdown', 600, 200)
    pointer('pointerup', 602, 201)
    expect(input.fireReleased).toBe(true)
    expect(input.taps).toEqual([{ x: 602, y: 201 }])
  })
})
