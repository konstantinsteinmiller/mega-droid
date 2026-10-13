// The HUD's one layout at its loud moments (#151, #152): the top-centre
// column (compass, boss bar, loot card, toasts, held-door label) stacks
// instead of overlapping, Atlas's bubble keeps off every zone (vitals and
// cards included) or waits, the toasts queue two at a time, an emptied boss
// bar goes with its boss, and crowded compass pins drop the farther number.
// The scenes are the playtest's own (pt/A, pt/C): the boss intro, the boss
// kill and the challenge reward with a level-up, at 1280x720 and on a phone
// held sideways (844x390).

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUBBLE_FLOOR, ZONE_GAP, bossBarShown, callOutY, coachHushed, intersects, placeBubble, stackColumn, type Rect
} from '@/components/hud/hudLayout'
import { compassLabelsShown } from '@/components/hud/compassLabels'
import { TOAST_MS, TOAST_SHOWN, pushToast, toasts, toastsWaiting } from '@/game/state/screenFx'

describe('the top-centre column', () => {
  it('pushes each piece under the one above it, and leaves a lower one be', () => {
    const pushes = stackColumn([
      { top: 10, height: 30, on: true },
      { top: 30, height: 40, on: true },
      { top: 200, height: 20, on: true }
    ], 8)
    expect(pushes).toEqual([0, 18, 0])
  })

  it('a piece that is off takes no room and is never pushed', () => {
    expect(stackColumn([
      { top: 10, height: 30, on: true },
      { top: 20, height: 100, on: false },
      { top: 30, height: 20, on: true }
    ], 8)).toEqual([0, 0, 18])
  })
})

describe('Atlas\'s bubble', () => {
  const view = { w: 1280, h: 720 }
  const size = { w: 300, h: 60 }

  it('stays beside Atlas when that is clear', () => {
    expect(placeBubble({ x: 300, y: 300 }, size, [{ x: 0, y: 0, w: 100, h: 100 }], view)).toEqual({ x: 300, y: 300 })
  })

  it('moves to the nearest free spot off a card', () => {
    const card: Rect = { x: 450, y: 90, w: 380, h: 210 }
    const at = placeBubble({ x: 350, y: 180 }, size, [card], view)!
    expect(at).not.toBeNull()
    expect(intersects({ ...at, ...size }, card)).toBe(false)
  })

  it('waits while nowhere above the thumbs is free', () => {
    const wall: Rect = { x: 0, y: 0, w: 1280, h: 720 * BUBBLE_FLOOR }
    expect(placeBubble({ x: 300, y: 200 }, size, [wall], view)).toBeNull()
  })
})

describe("Atlas's bubble and the big banner", () => {
  it('waits while the band and the toasts leave it no room', () => {
    const view = { w: 1280, h: 720 }
    const band: Rect = { x: 0, y: 200, w: 1280, h: 300 }
    const top: Rect = { x: 0, y: 0, w: 1280, h: 190 }
    expect(placeBubble({ x: 349, y: 207 }, { w: 300, h: 62 }, [top, band], view)).toBeNull()
  })
})

// pt2 (ne_bdead0): at the Neon Master's death "+1690 EP" rose onto the
// level-up toast; the call-outs now keep off the toasts, the loot card and
// the door label, moving down under them.
describe('a call-out ("+1690 XP") and the column', () => {
  const toasts: Rect = { x: 426, y: 101, w: 426, h: 97 } // two toasts, desktop
  const loot: Rect = { x: 450, y: 206, w: 380, h: 182 }

  it('on the toasts: down under them, clear of them', () => {
    const w = 136
    const h = 26
    const y = callOutY(806, 186, w, h, [toasts])
    expect(intersects({ x: 806 - w / 2, y: y - h / 2, w, h }, toasts)).toBe(false)
    expect(y - h / 2).toBeGreaterThanOrEqual(toasts.y + toasts.h + ZONE_GAP - 0.01)
  })

  it('pushed off the toasts onto the loot card: under that too', () => {
    const y = callOutY(640, 150, 120, 26, [toasts, loot])
    expect(intersects({ x: 580, y: y - 13, w: 120, h: 26 }, toasts)).toBe(false)
    expect(intersects({ x: 580, y: y - 13, w: 120, h: 26 }, loot)).toBe(false)
  })

  it('beside them, or with none up: where it is', () => {
    expect(callOutY(1000, 150, 120, 26, [toasts])).toBe(150)
    expect(callOutY(640, 150, 120, 26, [undefined, undefined])).toBe(150)
  })
})

// pt2 (m_dead): "ENEMY DEFEATED!" crossed the weapon lesson's key glyphs
// under the crosshair for its whole run; the coach waits it out.
describe("the coach's glyphs", () => {
  it('wait while a name card or the big banner is up, and only then', () => {
    expect(coachHushed({ titleUp: false, bannerUp: false })).toBe(false)
    expect(coachHushed({ titleUp: true, bannerUp: false })).toBe(true)
    expect(coachHushed({ titleUp: false, bannerUp: true })).toBe(true)
  })

  it('the band they wait for is the one that crossed them', () => {
    // Measured (desktop, German): the band and the lesson's mouse glyph.
    const band: Rect = { x: 0, y: 252, w: 1280, h: 216 }
    const keys: Rect = { x: 598, y: 446, w: 84, h: 112 }
    expect(intersects(keys, band)).toBe(true)
  })
})

describe('the boss bar', () => {
  it('is up from the entrance (still empty) until its boss is dead', () => {
    expect(bossBarShown('boss.neon', 0, false)).toBe(true)
    expect(bossBarShown('boss.neon', 0.4, true)).toBe(true)
    expect(bossBarShown('boss.neon', 0, true)).toBe(false)
    expect(bossBarShown('', 0.4, true)).toBe(false)
  })
})

describe('the compass numbers', () => {
  it('two pins close together: the farther one goes without its number', () => {
    // 60 m and 121 m drew "60121".
    expect(compassLabelsShown([{ pos: 76, dist: 121 }, { pos: 78, dist: 60 }], 360)).toEqual([true, false])
    expect(compassLabelsShown([{ pos: 20, dist: 121 }, { pos: 76, dist: 60 }, { pos: 78, dist: 30 }], 360)).toEqual([true, false, true])
  })

  it('pins far enough apart both keep theirs', () => {
    expect(compassLabelsShown([{ pos: 30, dist: 121 }, { pos: 60, dist: 60 }], 360)).toEqual([true, true])
  })

  it('two pins clamped to the same edge: only the way to go keeps its number', () => {
    expect(compassLabelsShown([{ pos: 100, dist: 300 }, { pos: 100, dist: 40 }], 360)).toEqual([true, false])
  })
})

describe('the toasts', () => {
  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it(`show ${TOAST_SHOWN} at a time; the rest wait their turn, in order`, () => {
    vi.useFakeTimers()
    for (const k of ['a', 'b', 'c', 'd']) pushToast(`t.${k}`)
    expect(toasts.map(t => t.key)).toEqual(['t.a', 't.b'])
    expect(toastsWaiting()).toBe(2)
    vi.advanceTimersByTime(TOAST_MS)
    expect(toasts.map(t => t.key)).toEqual(['t.c', 't.d'])
    expect(toastsWaiting()).toBe(0)
    vi.advanceTimersByTime(TOAST_MS)
    expect(toasts.length).toBe(0)
  })

  it('the same words twice say nothing new', () => {
    vi.useFakeTimers()
    pushToast('t.same', { n: 1 })
    pushToast('t.same', { n: 1 })
    pushToast('t.same', { n: 2 })
    expect(toasts.map(t => t.params.n)).toEqual([1, 2])
  })
})

// ─── The playtest's three moments, laid out ─────────────────────────────────

interface Scene {
  /** Fixed zones (they never move). */
  fixed: Rect[]
  /** The top-centre column, top to bottom, where each one's CSS puts it. */
  column: Rect[]
  /** Atlas's bubble: where it wants to be, its size. */
  bubble: { want: { x: number, y: number }, w: number, h: number }
  view: { w: number, h: number }
}

/** Lay a scene out the way `HudLayout.vue` and `AtlasBubble.vue` do. */
const layOut = (s: Scene): Rect[] => {
  const pushes = stackColumn(s.column.map(r => ({ top: r.y, height: r.h, on: true })))
  const column = s.column.map((r, i) => ({ ...r, y: r.y + pushes[i]! }))
  const all = [...s.fixed, ...column]
  const at = placeBubble(s.bubble.want, s.bubble, all, s.view)
  return at ? [...all, { ...at, w: s.bubble.w, h: s.bubble.h }] : all
}

/** Pairs that overlap, leaving out pairs of fixed zones (their own CSS
 *  places them; the banner's band runs across the vitals by design). */
const overlaps = (rects: Rect[], fixed: number): string[] => {
  const hits: string[] = []
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b, j) => {
    if (i + 1 + j < fixed) return
    if (intersects(a, b)) hits.push(`${i}x${i + 1 + j}`)
  }))
  return hits
}

/** Measured in the game (headless Chrome, German, the Neon Master's arena;
 *  css px). The vitals are the bars' visible width. */
const desktop = (): Pick<Scene, 'fixed' | 'view'> => ({
  view: { w: 1280, h: 720 },
  fixed: [
    { x: 16, y: 16, w: 50, h: 213 }, // vitals
    { x: 76, y: 16, w: 280, h: 82 }, // objective card
    { x: 929, y: 16, w: 335, h: 48 } // status pills
  ]
})
const phone = (): Pick<Scene, 'fixed' | 'view'> => ({
  view: { w: 844, h: 390 },
  fixed: [
    { x: 9, y: 9, w: 36, h: 189 },
    { x: 49, y: 9, w: 197, h: 66 },
    { x: 599, y: 9, w: 236, h: 36 }
  ]
})

describe('the loud moments: nothing overlaps', () => {
  const scenes: Record<string, Scene> = {
    // Banner card, Atlas's "Boss ahead", a door toast and the boss bar.
    'boss intro, desktop': {
      ...desktop(),
      column: [
        { x: 460, y: 12, w: 360, h: 22 }, // compass
        { x: 460, y: 48, w: 360, h: 46 }, // boss bar
        { x: 380, y: 101, w: 520, h: 37 } // toast
      ],
      bubble: { want: { x: 349, y: 160 }, w: 300, h: 62 }
    },
    // Four toasts (two shown), a level-up, the docked bubble.
    'boss kill, desktop': {
      ...desktop(),
      column: [
        { x: 460, y: 12, w: 360, h: 22 },
        { x: 380, y: 101, w: 520, h: 80 } // two toasts
      ],
      bubble: { want: { x: 16, y: 144 }, w: 300, h: 62 }
    },
    // The challenge's loot card, the level-up toast, Atlas's "Level-up!".
    'challenge reward, desktop': {
      ...desktop(),
      column: [
        { x: 460, y: 12, w: 360, h: 22 },
        { x: 450, y: 86, w: 380, h: 182 }, // loot card
        { x: 380, y: 101, w: 520, h: 37 } // toast
      ],
      bubble: { want: { x: 350, y: 180 }, w: 300, h: 62 }
    },
    // The kill's "ENEMY DEFEATED!" band cut Atlas's line in half (pt run,
    // desktop_boss_defeat): beside Atlas there is under the band.
    'boss kill under the banner, desktop': {
      ...desktop(),
      fixed: [...desktop().fixed, { x: 0, y: 252, w: 1280, h: 216 }], // banner band
      column: [
        { x: 460, y: 12, w: 360, h: 22 },
        { x: 380, y: 101, w: 520, h: 80 }
      ],
      bubble: { want: { x: 349, y: 207 }, w: 300, h: 62 }
    },
    'boss kill under the banner, phone': {
      ...phone(),
      fixed: [...phone().fixed, { x: 0, y: 130, w: 844, h: 130 }],
      column: [
        { x: 253, y: 53, w: 338, h: 16 },
        { x: 162, y: 55, w: 520, h: 37 }
      ],
      bubble: { want: { x: 150, y: 140 }, w: 207, h: 29 }
    },
    'boss intro, phone': {
      ...phone(),
      column: [
        { x: 253, y: 53, w: 338, h: 16 },
        { x: 253, y: 83, w: 338, h: 36 },
        { x: 162, y: 55, w: 520, h: 37 }
      ],
      bubble: { want: { x: 150, y: 110 }, w: 207, h: 29 }
    },
    'boss kill, phone': {
      ...phone(),
      column: [
        { x: 253, y: 53, w: 338, h: 16 },
        { x: 162, y: 55, w: 520, h: 80 }
      ],
      bubble: { want: { x: 9, y: 96 }, w: 207, h: 29 }
    },
    'challenge reward, phone': {
      ...phone(),
      column: [
        { x: 253, y: 53, w: 338, h: 16 },
        { x: 264, y: 52, w: 315, h: 133 },
        { x: 162, y: 55, w: 520, h: 37 }
      ],
      bubble: { want: { x: 150, y: 120 }, w: 207, h: 29 }
    }
  }

  for (const [name, scene] of Object.entries(scenes)) {
    it(name, () => {
      const laid = layOut(scene)
      expect(overlaps(laid, scene.fixed.length), name).toEqual([])
      // The bubble found a place (it only waits when nothing is free).
      expect(laid.length, name).toBe(scene.fixed.length + scene.column.length + 1)
      // And the column kept its gaps.
      const col = laid.slice(scene.fixed.length, scene.fixed.length + scene.column.length)
      for (let i = 1; i < col.length; i++) expect(col[i]!.y, name).toBeGreaterThanOrEqual(col[i - 1]!.y + col[i - 1]!.h + ZONE_GAP - 0.01)
    })
  }
})
