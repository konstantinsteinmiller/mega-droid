// The held door's prompt (src/game/sim/doorPrompt.ts): "Finish the lesson",
// an arrow toward the lesson and the door's input glyph, at a tutorial door
// held shut until its room's lesson is done. Pinned here: when it comes on
// (a bump, a shot, waiting at the door), how long it stays, how often it may
// pulse, when it never shows, the arrow's turn, and the glyph per need and
// hand. The key it shows is in every shipped locale.

import { describe, expect, it } from 'vitest'
import {
  DoorPrompt, promptArrow, doorInput, PROMPT_HOLD, PROMPT_FADE, PROMPT_GAP, IDLE_AFTER, CALL_DELAY, type DoorTick, type ArrowPose
} from '@/game/sim/doorPrompt'
import en from '@/i18n/locales/en'
import { LANGUAGES } from '@/utils/enums'

const DT = 1 / 30
const DOOR = 7

/** A prompt and its clock; `step` runs it for `secs` with the given tick. */
const rig = () => {
  const p = new DoorPrompt()
  const o: DoorTick = { time: 0, playing: true, combat: false, press: -1, shot: -1, near: -1, close: -1 }
  let idles = 0
  const calls: number[] = []
  const step = (secs: number, over: Partial<DoorTick> = {}) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      Object.assign(o, { playing: true, combat: false, press: -1, shot: -1, near: -1, close: -1 }, over)
      o.time += DT
      p.update(o)
      if (p.idled) idles++
      if (p.call) calls.push(o.time)
    }
  }
  return { p, o, step, idles: () => idles, calls }
}

describe('the door prompt: when it comes on', () => {
  it('walking into a held door brings it up, pulsing, about that door', () => {
    const { p, step } = rig()
    step(1)
    expect(p.alpha).toBe(0)
    step(DT, { press: DOOR })
    expect(p.alpha).toBe(1)
    expect(p.door).toBe(DOOR)
    expect(p.pulse).toBe(1)
  })

  it('holds PROMPT_HOLD after the last bump, then fades out', () => {
    const { p, step } = rig()
    step(DT, { press: DOOR })
    step(PROMPT_HOLD - 0.1)
    expect(p.alpha).toBe(1)
    step(0.2)
    expect(p.alpha).toBeGreaterThan(0)
    expect(p.alpha).toBeLessThan(1)
    step(PROMPT_FADE)
    expect(p.alpha).toBe(0)
    expect(p.door).toBe(-1)
  })

  it('pushing on keeps it up without pulsing again; the next bump after it faded brings it back', () => {
    const { p, step } = rig()
    step(10, { press: DOOR })
    expect(p.alpha).toBe(1)
    expect(p.pulse).toBe(1)
    step(PROMPT_HOLD + PROMPT_FADE + 0.1)
    expect(p.alpha).toBe(0)
    step(DT, { press: DOOR })
    expect(p.alpha).toBe(1)
    expect(p.pulse).toBe(2)
  })

  it('a shot at the door brings it up too', () => {
    const { p, step } = rig()
    step(DT, { shot: DOOR })
    expect(p.alpha).toBe(1)
    expect(p.pulse).toBe(1)
  })

  it('never pulses more than once every PROMPT_GAP, however hard the door is bumped', () => {
    const { p, step } = rig()
    // A bump every 0.2 s for 6 s (press, let go, press…).
    for (let k = 0; k < 30; k++) {
      step(DT, { press: DOOR })
      step(0.2 - DT)
    }
    expect(p.pulse).toBeLessThanOrEqual(Math.floor(6 / PROMPT_GAP) + 1)
    expect(p.pulse).toBeGreaterThanOrEqual(3)
  })

  it('never comes back on within PROMPT_GAP of the last time it did', () => {
    const { p, step } = rig()
    step(DT, { press: DOOR })
    step(0.3, { combat: true })
    expect(p.alpha).toBe(0)
    // The fight is over at once: a bump right away is too soon…
    step(DT, { press: DOOR })
    expect(p.alpha).toBe(0)
    step(PROMPT_GAP)
    // …one after the gap is not.
    step(DT, { press: DOOR })
    expect(p.alpha).toBe(1)
  })

  it('waiting near the door for IDLE_AFTER brings it up (and the teacher), again after another wait', () => {
    const { p, step, idles } = rig()
    step(IDLE_AFTER - 0.2, { near: DOOR })
    expect(p.alpha).toBe(0)
    expect(idles()).toBe(0)
    step(0.3, { near: DOOR })
    expect(p.alpha).toBe(1)
    expect(p.pulse).toBe(1)
    expect(idles()).toBe(1)
    step(IDLE_AFTER, { near: DOOR })
    expect(idles()).toBe(2)
  })

  it('the wait calls the teacher CALL_DELAY after the prompt came up — never in a fight', () => {
    const a = rig()
    a.step(IDLE_AFTER + 0.1, { near: DOOR })
    expect(a.idles()).toBe(1)
    const at = a.o.time
    a.step(CALL_DELAY - 0.2, { near: DOOR })
    expect(a.calls).toEqual([])
    a.step(0.3, { near: DOOR })
    expect(a.calls).toHaveLength(1)
    expect(a.calls[0]! - at).toBeGreaterThanOrEqual(CALL_DELAY - 0.15)
    // The prompt is still up when it comes.
    expect(a.p.alpha).toBe(1)
    // A fight in between: no call (the fight is the lesson already).
    const b = rig()
    b.step(IDLE_AFTER + 0.1, { near: DOOR })
    b.step(0.5, { near: DOOR, combat: true })
    b.step(CALL_DELAY, { near: DOOR })
    expect(b.calls).toEqual([])
  })

  it('the wait starts over when he steps away, during a fight, or out of play', () => {
    const { p, step, idles } = rig()
    step(5, { near: DOOR })
    step(DT)
    step(5, { near: DOOR })
    expect(idles()).toBe(0)
    step(1, { near: DOOR, combat: true })
    step(5, { near: DOOR })
    expect(idles()).toBe(0)
    step(1, { near: DOOR, playing: false })
    step(IDLE_AFTER - 0.5, { near: DOOR })
    expect(idles()).toBe(0)
    expect(p.alpha).toBe(0)
    step(0.6, { near: DOOR })
    expect(idles()).toBe(1)
  })

  it('never in a fight: it goes at once, and a bump meanwhile does nothing', () => {
    const { p, step } = rig()
    step(DT, { press: DOOR })
    expect(p.alpha).toBe(1)
    step(DT, { press: DOOR, combat: true })
    expect(p.alpha).toBe(0)
    step(3, { press: DOOR, shot: DOOR, near: DOOR, combat: true })
    expect(p.alpha).toBe(0)
    expect(p.pulse).toBe(1)
  })

  it('never during the exit cutscene or under a modal (not playing)', () => {
    const { p, step } = rig()
    step(DT, { press: DOOR })
    step(DT, { playing: false })
    expect(p.alpha).toBe(0)
    step(IDLE_AFTER + 1, { press: DOOR, near: DOOR, playing: false })
    expect(p.alpha).toBe(0)
    expect(p.idled).toBe(false)
  })
})

describe('the arrow toward the lesson', () => {
  const pose = (): ArrowPose => ({ rot: 0, edge: 0 })
  /** A lesson 5 m off at world angle `a` (0 = -z, the way yaw 0 faces;
   *  + = to its right), Flux at the origin facing `yaw`. */
  const arrow = (a: number, yaw: number) => promptArrow(5 * Math.sin(a), -5 * Math.cos(a), 0, 0, yaw, pose())

  it('ahead, right, behind, left: 0°, 90°, 180°, 270°', () => {
    const ahead = arrow(0, 0)
    expect(ahead.edge).toBe(0)
    expect(ahead.rot).toBeCloseTo(0, 6)
    const right = arrow(Math.PI / 2, 0)
    expect(right.edge).toBe(0)
    expect(right.rot).toBeCloseTo(Math.PI / 2, 6)
    const left = arrow(Math.PI * 1.5, 0)
    expect(left.edge).toBe(0)
    expect(left.rot).toBeCloseTo(-Math.PI / 2, 6)
    // Behind: on the screen's edge, pointing out of it and down.
    const behind = arrow(Math.PI, 0)
    expect(Math.abs(behind.edge)).toBe(1)
    expect(Math.abs(behind.rot)).toBeCloseTo(Math.PI * 0.75, 6)
  })

  it('turns live with the view: a fixed lesson, Flux turning 90° at a time', () => {
    // yaw grows to the left: turning left by 90° puts a lesson ahead on the right.
    expect(arrow(0, Math.PI / 2).rot).toBeCloseTo(Math.PI / 2, 6)
    expect(arrow(0, Math.PI / 2).edge).toBe(0)
    expect(Math.abs(arrow(0, Math.PI).edge)).toBe(1)
    expect(arrow(0, Math.PI * 1.5).rot).toBeCloseTo(-Math.PI / 2, 6)
    expect(arrow(0, Math.PI * 1.5).edge).toBe(0)
  })

  it('wraps: any number of turns is the same view, and behind splits by side', () => {
    for (const a of [0, 0.4, -1.2, 2.2, -2.6]) {
      const base = arrow(a, 0.3)
      for (const k of [-3, -1, 1, 4]) {
        const w = arrow(a, 0.3 + k * Math.PI * 2)
        expect(w.edge).toBe(base.edge)
        expect(w.rot).toBeCloseTo(base.rot, 6)
      }
    }
    // Just right of dead behind rides the right edge, just left the left one,
    // whichever side of ±π the raw angles fall.
    expect(arrow(Math.PI - 0.1, 0).edge).toBe(1)
    expect(arrow(-Math.PI + 0.1, 0).edge).toBe(-1)
    expect(arrow(Math.PI - 0.1, Math.PI * 6).edge).toBe(1)
    expect(arrow(-Math.PI + 0.1, -Math.PI * 6).edge).toBe(-1)
    // The edge arrow points out of its own side.
    expect(arrow(Math.PI - 0.1, 0).rot).toBeGreaterThan(Math.PI / 2)
    expect(arrow(-Math.PI + 0.1, 0).rot).toBeLessThan(-Math.PI / 2)
  })
})

describe('the door\'s glyph: the input its step needs', () => {
  it('on desktop: hold left, hold right, Space, E, H, click', () => {
    expect(doorInput('charge', 'mouse')).toMatchObject({ kind: 'mouse', button: 'left', hold: true })
    expect(doorInput('crate', 'mouse')).toMatchObject({ kind: 'mouse', button: 'left', hold: true })
    expect(doorInput('block', 'mouse')).toMatchObject({ kind: 'mouse', button: 'right', hold: true, icon: 'shield' })
    expect(doorInput('slide', 'mouse')).toMatchObject({ kind: 'key', wide: true, icon: 'dodge' })
    expect(doorInput('chest', 'mouse')).toMatchObject({ kind: 'key', code: 'KeyE' })
    expect(doorInput('gel', 'mouse')).toMatchObject({ kind: 'key', code: 'KeyH', icon: 'flask' })
    expect(doorInput('clear', 'mouse')).toMatchObject({ kind: 'mouse', button: 'left', click: true })
  })

  it('every key is named by its DEFAULT code, so the glyph draws it as bound and as this keyboard prints it', () => {
    // A slide rebound off Space must stop drawing a space bar: the code says which action.
    expect(doorInput('slide', 'mouse')).toMatchObject({ code: 'Space' })
    for (const n of ['slide', 'chest', 'gel', 'weapon', 'gap'] as const) {
      const i = doorInput(n, 'mouse')
      expect(i.code ?? i.litKey, n).toBeTruthy()
    }
  })

  it('the gap: walk on at the edge — the move keys with forward lit, never a lone "W" (#146)', () => {
    expect(doorInput('gap', 'mouse')).toEqual({ kind: 'wasd', litKey: 'KeyW', icon: 'up' })
    expect(doorInput('gap', 'touch')).toEqual({ kind: 'finger', mode: 'hold', icon: 'up' })
  })

  it('on touch: a held finger for charge and block, a tap for the rest, the button named by its icon', () => {
    expect(doorInput('charge', 'touch')).toEqual({ kind: 'finger', mode: 'hold', icon: 'bolt' })
    expect(doorInput('crate', 'touch')).toEqual({ kind: 'finger', mode: 'hold', icon: 'bolt' })
    expect(doorInput('block', 'touch')).toEqual({ kind: 'finger', mode: 'hold', icon: 'shield' })
    expect(doorInput('slide', 'touch')).toEqual({ kind: 'finger', mode: 'tap', icon: 'dodge' })
    expect(doorInput('chest', 'touch')).toEqual({ kind: 'finger', mode: 'tap', icon: 'chest' })
    expect(doorInput('gel', 'touch')).toEqual({ kind: 'finger', mode: 'tap', icon: 'flask' })
    expect(doorInput('clear', 'touch')).toEqual({ kind: 'finger', mode: 'tap', icon: 'buster' })
  })
})

describe('the label', () => {
  it('"Finish the lesson" is in every shipped locale, translated', async () => {
    expect(en.walk.finishLesson).toBe('Finish the lesson')
    for (const code of LANGUAGES) {
      if (code === 'en') continue
      const mod = await import(`../../src/i18n/locales/${code}.ts`)
      const s = mod.default.walk?.finishLesson
      expect(typeof s, code).toBe('string')
      expect(s.trim().length, code).toBeGreaterThan(0)
      expect(s, code).not.toBe(en.walk.finishLesson)
    }
  })
})
