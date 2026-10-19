// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── The loading mini-game (#Mini1, public/js/mini-game.js) ────────────────
//
// A classic script the static splash runs before the bundle. Loaded here as
// the page loads it (evaluated against window), then driven through
// window.mdMini: the machine order, the damage, and that stop() leaves no
// frame loop or listener behind.

const SRC = readFileSync(resolve(__dirname, '../../public/js/mini-game.js'), 'utf8')

type S = { k: number; lap: number; hp: number; die: number; drop: number; sh: unknown[]; pt: unknown[]; hold: number; t: number }
type Mini = {
  run: (c: HTMLCanvasElement) => () => void
  S: S | null
  M: () => S
  step: (s: S, dt: number, w: number) => void
  fire: (s: S, charged: boolean) => void
  next: (s: S) => void
  hpOf: (k: number, lap: number) => number
  CH: number
}
const load = (): Mini => {
  new Function(SRC)()
  return (window as unknown as { mdMini: Mini }).mdMini
}
/** Fly every shot home and let the machine finish dropping in / dying. */
const settle = (g: Mini, s: S): void => { for (let i = 0; i < 200; i++) g.step(s, 0.02, 400) }

describe('the loading mini-game', () => {
  let g: Mini
  beforeEach(() => { g = load() })

  it('rotor drone, hard hat, guardroid, crate golem, then round again, stronger', () => {
    const s = g.M()
    const seen: Array<[number, number, number]> = []
    for (let i = 0; i < 8; i++) { seen.push([s.k, s.lap, s.hp]); g.next(s) }
    expect(seen.map((x) => x[0])).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
    expect(seen.slice(1, 4).every((x, i) => x[2] > seen[i]![2])).toBe(true)
    for (let k = 0; k < 4; k++) expect(g.hpOf(k, 1)).toBeGreaterThan(g.hpOf(k, 0))
  })

  it('a charged shot does more damage than a normal one', () => {
    const a = g.M(); a.hp = 20; a.drop = 0
    const b = g.M(); b.hp = 20; b.drop = 0
    g.fire(a, false); g.fire(b, true)
    settle(g, a); settle(g, b)
    expect(20 - b.hp).toBeGreaterThan(20 - a.hp)
    expect(20 - a.hp).toBe(1)
  })

  it('a kill sprinkles bolts and brings in the next machine', () => {
    const s = g.M(); s.drop = 0; s.hp = 1
    g.fire(s, false)
    for (let i = 0; i < 200 && !s.die; i++) g.step(s, 0.02, 400)
    expect(s.die).toBeGreaterThan(0)
    expect(s.pt.length).toBeGreaterThan(5)
    settle(g, s)
    expect(s.k).toBe(1)
    expect(s.hp).toBe(g.hpOf(1, 0))
  })

  describe('run / stop', () => {
    let canvas: HTMLCanvasElement
    beforeEach(() => {
      canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
      const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true })
      canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
      Object.defineProperty(canvas, 'clientWidth', { value: 300 })
      Object.defineProperty(canvas, 'clientHeight', { value: 80 })
    })
    afterEach(() => { canvas.remove(); vi.restoreAllMocks() })

    it('a tap fires, a hold fires a charged shot', () => {
      g.run(canvas)
      const s = g.S!
      canvas.dispatchEvent(new Event('pointerdown', { cancelable: true, bubbles: true }))
      canvas.dispatchEvent(new Event('pointerup', { bubbles: true }))
      expect(s.sh).toMatchObject([{ c: 0 }])
      canvas.dispatchEvent(new Event('pointerdown', { cancelable: true, bubbles: true }))
      s.t += g.CH
      canvas.dispatchEvent(new Event('pointerup', { bubbles: true }))
      expect(s.sh[1]).toMatchObject({ c: 1 })
    })

    it('stop() cancels the frame loop and removes every listener it added', () => {
      const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7)
      const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
      const addC = vi.spyOn(canvas, 'addEventListener')
      const remC = vi.spyOn(canvas, 'removeEventListener')
      const addD = vi.spyOn(document, 'addEventListener')
      const remD = vi.spyOn(document, 'removeEventListener')
      const addW = vi.spyOn(window, 'addEventListener')
      const remW = vi.spyOn(window, 'removeEventListener')
      const stop = g.run(canvas)
      expect(raf).toHaveBeenCalled()
      stop()
      expect(cancel).toHaveBeenCalledWith(7)
      expect(remC.mock.calls).toEqual(addC.mock.calls)
      expect(remD.mock.calls).toEqual(addD.mock.calls)
      expect(remW.mock.calls).toEqual(addW.mock.calls)
      // Input after stop is ignored
      const n = g.S!.sh.length
      canvas.dispatchEvent(new Event('pointerdown', { cancelable: true, bubbles: true }))
      canvas.dispatchEvent(new Event('pointerup', { bubbles: true }))
      expect(g.S!.sh.length).toBe(n)
    })

    it('any click or key anywhere in the window plays; one held key is one charge', () => {
      g.run(canvas)
      const s = g.S!
      const btn = document.createElement('button')
      let clicked = 0
      btn.addEventListener('click', () => { clicked++ })
      document.body.appendChild(btn)
      const pd = new Event('pointerdown', { cancelable: true, bubbles: true })
      btn.dispatchEvent(pd)
      btn.dispatchEvent(new Event('pointerup', { bubbles: true }))
      btn.click()
      expect(pd.defaultPrevented).toBe(false)
      expect(clicked).toBe(1)
      expect(s.sh).toMatchObject([{ c: 0 }])
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
      s.t += g.CH
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))
      expect(s.sh).toHaveLength(2)
      expect(s.sh[1]).toMatchObject({ c: 1 })
      btn.remove()
    })

    it('after the loader goes, no window input reaches it', () => {
      const stop = g.run(canvas)
      stop()
      const n = g.S!.sh.length
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }))
      window.dispatchEvent(new Event('pointerdown'))
      window.dispatchEvent(new Event('pointerup'))
      expect(g.S!.sh.length).toBe(n)
    })

    it('two loaders handing over: only the newest one takes the input', () => {
      const other = canvas.cloneNode() as HTMLCanvasElement
      g.run(other)
      g.run(canvas)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' }))
      expect(g.S!.sh).toHaveLength(1)
    })

    it('stops itself once its canvas leaves the page', () => {
      let cb: FrameRequestCallback | null = null
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => { cb = f; return 1 })
      const rem = vi.spyOn(canvas, 'removeEventListener')
      g.run(canvas)
      canvas.remove()
      cb!(16)
      expect(rem).toHaveBeenCalled()
    })
  })
})
