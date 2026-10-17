// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import InputGlyph from '@/components/hud/InputGlyph.vue'
import ControlHints from '@/components/hud/ControlHints.vue'
import ControlsPanel from '@/components/hud/ControlsPanel.vue'
import {
  FINGERTIP, FINGER_HOLD, HAND, INFINITY, INF_HAND_SCALE, INF_POINTS, INF_SAMPLES, MOUSE_BUTTONS, MOUSE_HOLD, onMouseButton
} from '@/components/hud/glyphGeometry'
import { hud } from '@/game/state/hud'

// The legend asks the game which hand is on the controls; the game itself
// (renderer, missions) has no business in a glyph test.
const device = vi.hoisted(() => ({ value: 'touch' as 'touch' | 'mouse' }))
vi.mock('@/game/boot', () => ({ input: { get device() { return device.value } } }))

/**
 * ─── The coach's glyphs must read in one frozen frame ───────────────────────
 *
 * The blind playtest saw the game one still frame at a time, and there two
 * glyphs said nothing. The phone tester never learned to move: the ghost
 * joystick was "a dashed-circle icon", and Slide's arrow looked like "walk".
 * Neither tester ever held fire: the hold glyph's meaning lived in its fill
 * animation, so every still showed a finger (or a mouse) and read as "tap".
 *
 * Now touch "move" is a finger tracing an ∞, and a hold is a timer ring that
 * STANDS three quarters full. jsdom has no layout and runs no animation, which
 * suits the point: what is asserted here is what a frame shows with every
 * animation stopped.
 */

const nums = (list: string): number[] => list.split(';').map(Number)
const points = (d: string): Array<[number, number]> =>
  d.replace(/^M/, '').replace(/Z$/, '').split('L').map(p => p.split(' ').map(Number) as [number, number])

describe('the ∞ the move finger traces', () => {
  const times = nums(INFINITY.keyTimes)
  const shares = nums(INFINITY.keyPoints)
  const offsets = nums(INFINITY.dashOffsets)
  const [dash, gap] = INFINITY.dashArray.split(' ').map(Number) as [number, number]
  const loop = dash + gap

  it('is one closed loop, keyed from start to finish', () => {
    expect(points(INFINITY.d)).toHaveLength(INF_SAMPLES)
    expect(INFINITY.d.endsWith('Z')).toBe(true)
    for (const list of [times, shares, offsets]) expect(list).toHaveLength(INF_SAMPLES + 1)
    expect([times[0], times.at(-1)]).toEqual([0, 1])
    expect([shares[0], shares.at(-1)]).toEqual([0, 1])
    for (let i = 1; i <= INF_SAMPLES; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!)
      expect(shares[i]!).toBeGreaterThan(shares[i - 1]!)
    }
  })

  it('keeps the streak\'s head under the fingertip the whole way round', () => {
    // The dash covers [s − streak, s] when its offset is streak − s, and the
    // finger is at s = share × loop at the same key time.
    for (let i = 0; i <= INF_SAMPLES; i++) {
      expect(Math.abs(offsets[i]! - (INFINITY.dashRest - shares[i]! * loop))).toBeLessThan(0.05)
    }
    // A streak, not the whole loop lit.
    expect(dash / loop).toBeGreaterThan(0.15)
    expect(dash / loop).toBeLessThan(0.35)
  })

  it('moves the finger along the ∞ itself, measured from where it rests', () => {
    const loopPts = points(INFINITY.d)
    const motion = points(INFINITY.motion)
    const [rx, ry] = INF_POINTS[0]!
    expect(motion[0]).toEqual([0, 0])
    motion.forEach(([x, y], i) => {
      expect(x + rx).toBeCloseTo(loopPts[i]![0], 1)
      expect(y + ry).toBeCloseTo(loopPts[i]![1], 1)
    })
    // The hand's own transform holds the fingertip at rest; the motion adds the rest.
    expect(INFINITY.hand).toBe(`translate(${rx} ${ry}) scale(${INF_HAND_SCALE}) translate(${-FINGERTIP.x} ${-FINGERTIP.y})`)
  })

  it('rests at the bottom of the right loop, where the hand hangs below the ∞', () => {
    const [rx, ry] = INF_POINTS[0]!
    const xs = INF_POINTS.map(p => p[0])
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(rx).toBeGreaterThan(mid)
    for (const [, y] of INF_POINTS) expect(ry).toBeGreaterThanOrEqual(y)
  })

  it('eases through the crossing and swings round the loop ends', () => {
    // Key times are even, so a segment's length is the finger's speed there.
    const xs = INF_POINTS.map(p => p[0])
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    const mid = (lo + hi) / 2
    const speed = INF_POINTS.map((p, i) => {
      const q = INF_POINTS[(i + 1) % INF_SAMPLES]!
      return { x: (p[0] + q[0]) / 2, v: Math.hypot(q[0] - p[0], q[1] - p[1]) }
    })
    const mean = (vs: number[]) => vs.reduce((a, b) => a + b, 0) / vs.length
    const crossing = mean(speed.filter(s => Math.abs(s.x - mid) < (hi - lo) * 0.08).map(s => s.v))
    const ends = mean(speed.filter(s => Math.abs(s.x - mid) > (hi - lo) * 0.44).map(s => s.v))
    expect(crossing).toBeLessThan(ends * 0.8)
  })

  it('never lets the hand leave the glyph\'s box', () => {
    // The hand's outline (stroke 9) round its rounded rects, thumb rotated.
    const out = 4.5
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const r of HAND) {
      const rad = r.rx + out
      let cs: Array<[number, number]> = [[r.x + r.rx, r.y + r.rx], [r.x + r.width - r.rx, r.y + r.height - r.rx]]
      cs = [cs[0]!, cs[1]!, [cs[0]![0], cs[1]![1]], [cs[1]![0], cs[0]![1]]]
      const m = r.transform?.match(/rotate\((-?[\d.]+) ([\d.]+) ([\d.]+)\)/)
      if (m) {
        const a = (Number(m[1]) * Math.PI) / 180
        const [ox, oy] = [Number(m[2]), Number(m[3])]
        cs = cs.map(([x, y]) => [ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a), oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)])
      }
      for (const [x, y] of cs) {
        x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad)
        y0 = Math.min(y0, y - rad); y1 = Math.max(y1, y + rad)
      }
    }
    const [, , w, h] = INFINITY.viewBox.split(' ').map(Number) as [number, number, number, number]
    const s = INF_HAND_SCALE
    // Between two samples the fingertip is on the chord, so the samples bound it.
    for (const [x, y] of INF_POINTS) {
      expect(x + (x0 - FINGERTIP.x) * s).toBeGreaterThanOrEqual(0)
      expect(x + (x1 - FINGERTIP.x) * s).toBeLessThanOrEqual(w)
      expect(y + (y0 - FINGERTIP.y) * s).toBeGreaterThanOrEqual(0)
      expect(y + (y1 - FINGERTIP.y) * s).toBeLessThanOrEqual(h)
    }
  })
})

describe('the hold ring', () => {
  const ring = (paths: typeof FINGER_HOLD) => Object.fromEntries(paths.map(p => [p.cls, p]))

  it('finger: stands three quarters full, from twelve clockwise, with a tick at twelve', () => {
    const [cx, cy, r] = [70, 16, 28]
    const p = ring(FINGER_HOLD)
    // 270° clockwise: large arc + sweep flags, twelve o'clock to nine.
    expect(p['hold-arc']!.d).toBe(`M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - r} ${cy}`)
    expect(p['hold-edge']!.d).toBe(p['hold-arc']!.d)
    // The tick stands on the ring at twelve, outside it (a stopwatch's crown).
    expect(p['hold-tick']!.d).toBe(`M${cx} ${cy - r - 9}V${cy - r + 1}`)
    // Only the sweep is animated, so only it is measured in pathLength units.
    expect(FINGER_HOLD.filter(q => q.len).map(q => q.cls)).toEqual(['hold-ring'])
  })

  it.each([['left', 0, 70 + 54], ['right', 1, 70 - 54]] as const)(
    'mouse, %s button: fills from twelve TOWARD the lit side, and stands on that side when still',
    (side, sweep, endX) => {
      const [cx, cy, r] = [70, 58, 54]
      const p = ring(MOUSE_HOLD[side])
      // The old ring always hugged the right half, its only gap over the lit
      // LEFT button: the eye read "right". Now the 3/4 rest pose runs from
      // twelve through the lit side and leaves its gap over the other button.
      expect(p['hold-arc']!.d).toBe(`M${cx} ${cy - r}A${r} ${r} 0 1 ${sweep} ${endX} ${cy}`)
      expect(p['hold-edge']!.d).toBe(p['hold-arc']!.d)
      // The fill: a whole ring from twelve, first half toward the lit side.
      expect(p['m-fill']!.d).toBe(`M${cx} ${cy - r}A${r} ${r} 0 1 ${sweep} ${cx} ${cy + r}A${r} ${r} 0 1 ${sweep} ${cx} ${cy - r}`)
      expect(p['m-fill-edge']!.d).toBe(p['m-fill']!.d)
      expect(p['hold-tick']!.d).toBe(`M${cx} ${cy - r - 9}V${cy - r + 1}`)
      // Only the fill (and its edge) is animated, in pathLength units.
      expect(MOUSE_HOLD[side].filter(q => q.len).map(q => q.cls)).toEqual(['m-fill-edge', 'm-fill'])
    })

  it('is wider than the finger, which hides only its bottom', () => {
    // The old ring (r 20) sat inside the finger's outline: a still showed a
    // cyan sliver over the fingertip, nothing more.
    const finger = HAND[0]!
    expect(28 - 5.5).toBeGreaterThan(finger.width / 2 + 4.5)
  })
})

describe('InputGlyph in a frozen frame', () => {
  // #174: the first special weapon's key is drawn with its Q alternate.
  it('draws a key with a taught alternate as two caps and a slash', () => {
    const w = mount(InputGlyph, { props: { kind: 'key', code: 'Digit1' } })
    expect(w.findAll('rect.cap')).toHaveLength(2)
    expect(w.findAll('text.label').map(e => e.text())).toEqual(['1', 'Q'])
    expect(w.find('path.or').exists()).toBe(true)
    const one = mount(InputGlyph, { props: { kind: 'key', code: 'Digit2' } })
    expect(one.findAll('rect.cap')).toHaveLength(1)
    expect(one.find('path.or').exists()).toBe(false)
  })

  const classes = (w: ReturnType<typeof mount>) => w.findAll('[class]').flatMap(e => e.classes())

  it('draws touch "move" as a finger on an ∞, moving on one clock and resting for reduced motion', () => {
    const w = mount(InputGlyph, { props: { kind: 'infinity' } })
    expect(w.find('svg').attributes('viewBox')).toBe(INFINITY.viewBox)
    // SMIL only runs on SVG-namespaced elements with their camelCase attributes.
    expect(w.find('animateMotion').element.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(w.find('path.inf-guide').attributes('d')).toBe(INFINITY.d)
    // In motion: the finger and the streak share key times and duration.
    const live = w.find('g.inf-live')
    const motion = live.find('animateMotion')
    const dash = live.find('animate')
    expect(motion.attributes('path')).toBe(INFINITY.motion)
    expect(motion.attributes('keyPoints')).toBe(INFINITY.keyPoints)
    expect(motion.attributes('calcMode')).toBe('linear')
    expect(dash.attributes('attributeName')).toBe('stroke-dashoffset')
    for (const k of ['keyTimes', 'dur', 'calcMode', 'repeatCount'] as const) {
      expect(dash.attributes(k)).toBe(motion.attributes(k))
    }
    // At rest: the same finger, not animated.
    const rest = w.find('g.inf-rest')
    expect(rest.find('animateMotion').exists()).toBe(false)
    expect(rest.find('animate').exists()).toBe(false)
    expect(rest.find('g[transform]').attributes('transform')).toBe(INFINITY.hand)
    expect(rest.findAll('.hand-fill rect')).toHaveLength(HAND.length)
    // Not the dashed circle the playtest could not read.
    expect(w.find('.stick-rim').exists()).toBe(false)
  })

  it('shows a hold as a standing timer ring, and a tap never does', () => {
    const hold = classes(mount(InputGlyph, { props: { kind: 'finger', mode: 'hold' } }))
    const tap = classes(mount(InputGlyph, { props: { kind: 'finger', mode: 'tap' } }))
    for (const c of ['hold-track', 'hold-arc', 'hold-tick']) {
      expect(hold).toContain(c)
      expect(tap).not.toContain(c)
    }
    expect(hold).toContain('hold-press')
    expect(tap).toContain('ripple')
    expect(hold).not.toContain('ripple')
  })

  it('does the same for the mouse: hold to charge vs click to shoot', () => {
    const hold = classes(mount(InputGlyph, { props: { kind: 'mouse', button: 'left', hold: true } }))
    const click = classes(mount(InputGlyph, { props: { kind: 'mouse', button: 'left', click: true } }))
    for (const c of ['hold-arc', 'hold-tick']) {
      expect(hold).toContain(c)
      expect(click).not.toContain(c)
    }
    expect(click).toContain('m-ripple')
  })

  it('draws a finger that taps or holds, never one swaying left and right: dragging is the ∞\'s', () => {
    for (const mode of ['tap', 'hold'] as const) {
      const c = classes(mount(InputGlyph, { props: { kind: 'finger', mode } }))
      expect(c, mode).not.toContain('sway')
      expect(c, mode).not.toContain('arrow')
    }
    // The desktop camera keeps its swaying mouse, captured or dragged.
    for (const props of [{ button: 'none', move: true }, { button: 'left', drag: true }] as const) {
      const c = classes(mount(InputGlyph, { props: { kind: 'mouse', ...props } }))
      expect(c).toContain('sway')
      expect(c).toContain('arrow')
    }
  })

  it('still draws the old joystick for any caller that asks for it', () => {
    expect(mount(InputGlyph, { props: { kind: 'joystick' } }).find('.stick-knob').exists()).toBe(true)
  })

  it('switches the ∞ to its resting pose under reduced motion, and never animates the standing ring', () => {
    // No CSS engine in jsdom: the contract is read off the stylesheet itself.
    const src = readFileSync(resolve(__dirname, '../../src/components/hud/InputGlyph.vue'), 'utf8').replace(/\r\n/g, '\n')
    const reduced = src.slice(src.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.inf-live\s+display: none/)
    expect(reduced).toMatch(/\.inf-rest\s+display: inline/)
    const rule = (sel: string) => src.match(new RegExp(`\\n${sel.replace('.', '\\.')}\\n((?:  .*\\n)+)`))?.[1] ?? ''
    for (const sel of ['.hold-arc', '.hold-edge', '.hold-tick', '.hold-track']) {
      expect(rule(sel), sel).not.toMatch(/animation/)
    }
  })
})

/**
 * ─── The mouse must say WHICH button ────────────────────────────────────────
 *
 * The developer read the old left-button glyph as the right one, and its
 * click as a middle click: the lit half pulsed to a near white, the hold
 * ring's full three quarters hugged the right side with its gap over the lit
 * button, and the ripple was centred on the seam, over the wheel (70, 30).
 */
describe('the mouse says which button, and click or hold', () => {
  /** Every x a path visits (its M/L/A end points and H targets). */
  const pathXs = (d: string): number[] => {
    const out: number[] = []
    for (const m of d.matchAll(/([MLAHVZ])([^MLAHVZ]*)/g)) {
      const n = m[2]!.trim().split(/[ ,]+/).filter(Boolean).map(Number)
      if (m[1] === 'M' || m[1] === 'L') out.push(n[0]!)
      else if (m[1] === 'A') out.push(n[5]!)
      else if (m[1] === 'H') out.push(n[0]!)
    }
    return out
  }
  const glyph = (props: Record<string, unknown>) => mount(InputGlyph, { props: { kind: 'mouse', ...props } })
  const other = { left: 'right', right: 'left' } as const

  it.each(['left', 'right'] as const)('%s: the lit face is on the %s, the other one and the wheel stay neutral', (side) => {
    for (const mode of [{ click: true }, { hold: true }]) {
      const w = glyph({ button: side, ...mode })
      const hot = w.findAll('path.hot')
      expect(hot).toHaveLength(1)
      expect(hot[0]!.attributes('data-button')).toBe(side)
      expect(hot[0]!.attributes('d')).toBe(MOUSE_BUTTONS[side].d)
      // Every point of the lit face lies on its side of the seam (x 70).
      for (const x of pathXs(MOUSE_BUTTONS[side].d)) {
        if (side === 'left') expect(x).toBeLessThanOrEqual(70)
        else expect(x).toBeGreaterThanOrEqual(70)
      }
      expect(pathXs(MOUSE_BUTTONS[side].d).some(x => side === 'left' ? x < 50 : x > 90)).toBe(true)
      // The other face is plain body, and the wheel is never lit.
      expect(w.find(`path[data-button="${other[side]}"]`).classes()).toEqual(['btn'])
      expect(w.find('.wheel').classes()).not.toContain('hot')
      expect(w.find('svg').attributes('data-lit')).toBe(side)
    }
  })

  it.each(['left', 'right'] as const)('%s: the press ripple starts at that button\'s own centre, off the seam and the wheel', (side) => {
    for (const mode of [{ click: true }, { hold: true }]) {
      const c = glyph({ button: side, ...mode }).find('circle.m-ripple')
      const cx = Number(c.attributes('cx'))
      const cy = Number(c.attributes('cy'))
      expect(onMouseButton(side, cx, cy)).toBe(true)
      expect(onMouseButton(other[side], cx, cy)).toBe(false)
      // Clear of the wheel (x 67.5–72.5) by more than its own radius at rest.
      expect(Math.abs(cx - 70)).toBeGreaterThan(10)
      // …and it is the face's centre, well inside it.
      expect(onMouseButton(side, cx + (side === 'left' ? -10 : 10), cy)).toBe(true)
      expect(onMouseButton(side, cx, cy - 12)).toBe(true)
      expect(onMouseButton(side, cx, cy + 12)).toBe(true)
    }
    // The old origin sat on the seam (70, 30): a hair to either side of it
    // is already the other button.
    expect(onMouseButton('left', 71, 30)).toBe(false)
    expect(onMouseButton('right', 69, 30)).toBe(false)
  })

  it.each(['left', 'right'] as const)('%s click: marks fly off that button\'s outer corner, outside the mouse', (side) => {
    const w = glyph({ button: side, click: true })
    expect(w.find('path.m-marks').attributes('d')).toBe(MOUSE_BUTTONS[side].marks)
    const pts = [...MOUSE_BUTTONS[side].marks.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])] as const)
    expect(pts).toHaveLength(6)
    for (const [x, y] of pts) {
      if (side === 'left') expect(x).toBeLessThan(70)
      else expect(x).toBeGreaterThan(70)
      // Beyond the body's rounded top (r 29 round (70, 41), outline 2).
      expect(Math.hypot(x - 70, y - 41)).toBeGreaterThan(31)
      expect(y).toBeLessThan(41)
    }
  })

  it('a hold shows the ring, the glow and the stopwatch tick, and no click marks; a click no ring', () => {
    for (const side of ['left', 'right'] as const) {
      const hold = glyph({ button: side, hold: true })
      const click = glyph({ button: side, click: true })
      expect(hold.find('svg').classes()).toContain('m-hold')
      expect(click.find('svg').classes()).toContain('m-click')
      for (const sel of ['.m-fill', '.m-fill-edge', '.m-glow', '.hold-track', '.hold-tick']) {
        expect(hold.find(sel).exists(), sel).toBe(true)
        expect(click.find(sel).exists(), sel).toBe(false)
      }
      expect(hold.find('.m-marks').exists()).toBe(false)
      expect(click.find('.m-marks').exists()).toBe(true)
      // The fill runs toward the lit side.
      expect(hold.find('path.m-fill').attributes('d')).toBe(MOUSE_HOLD[side].find(p => p.cls === 'm-fill')!.d)
    }
  })

  it('moving the captured mouse lights no button: no fill, no ripple, no ring, just the sway', () => {
    const w = glyph({ button: 'none', move: true })
    expect(w.find('svg').attributes('data-lit')).toBe('none')
    expect(w.findAll('path.hot')).toHaveLength(0)
    expect(w.findAll('path.btn')).toHaveLength(2)
    for (const sel of ['.m-ripple', '.m-marks', '.m-fill', '.well']) expect(w.find(sel).exists(), sel).toBe(false)
    expect(w.find('.sway').exists()).toBe(true)
    // Even with a button prop left over, `move` wins.
    expect(glyph({ button: 'left', move: true }).findAll('path.hot')).toHaveLength(0)
  })

  it('the lit colour holds: no pulse toward white, a press only darkens it; the stylesheet agrees', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/hud/InputGlyph.vue'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).not.toMatch(/hot-pulse/)
    expect(src).not.toMatch(/#fff3a8/i)
    // The top-level .hot rule is not animated…
    const hot = src.match(/\n\.hot\n((?:  .*\n)+)/)?.[1] ?? ''
    expect(hot).toMatch(/fill: #ffd84a/)
    expect(hot).not.toMatch(/animation/)
    // …and the press keyframes only move between the lit yellow and its darker press.
    for (const name of ['m-click', 'm-hold']) {
      const kf = src.match(new RegExp(`@keyframes ${name}\\n((?:  .*\\n)+)`))?.[1] ?? ''
      expect(kf, name).toMatch(/translateY\(3px\)/)
      const fills = [...kf.matchAll(/fill: (#[0-9a-f]{6})/gi)].map(m => m[1]!.toLowerCase())
      expect(new Set(fills), name).toEqual(new Set(['#ffd84a', '#f0ae22']))
    }
    // Reduced motion: a hold keeps the button down inside the standing ring.
    const reduced = src.slice(src.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.m-hold\n\s+\.hot\n\s+transform: translateY\(3px\)/)
    expect(reduced).toMatch(/\.hold-edge, \.hold-arc\n\s+display: inline/)
    expect(reduced).toMatch(/\.m-click\n\s+\.m-ripple/)
  })

  it('reduced motion stills the mouse\'s press cycles too, at the weight they are set with', () => {
    // The cycles are set under `.m-click` / `.m-hold` (two classes); a flat
    // `.hot { animation: none }` loses to them, and the pause legend kept
    // clicking and holding with reduced motion on.
    const src = readFileSync(resolve(__dirname, '../../src/components/hud/InputGlyph.vue'), 'utf8').replace(/\r\n/g, '\n')
    const at = src.indexOf('@media (prefers-reduced-motion: reduce)')
    const before = src.slice(0, at)
    const reduced = src.slice(at)
    const stilled = reduced.match(/\n  \.m-click, \.m-hold\n    ([^\n]+)\n      animation: none/)?.[1]?.split(', ') ?? []
    for (const mode of ['m-click', 'm-hold']) {
      const block = '\n' + (before.match(new RegExp(`\\n\\.${mode}\\n((?:  .*\\n)+)`))?.[1] ?? '')
      const animated = [...block.matchAll(/\n  ([^\n]+)\n    animation: /g)].flatMap(m => m[1]!.split(', '))
      expect(animated.length, mode).toBeGreaterThan(0)
      for (const sel of animated) expect(stilled, `${mode} ${sel}`).toContain(sel)
    }
  })
})

describe('where the coach and the pause menu draw it', () => {
  const phase = hud.phase
  const i18n = () => createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

  afterEach(() => {
    hud.hints = []
    hud.phase = phase
    device.value = 'touch'
  })

  it('the coach teaches touch "move" with the ∞ finger, pips and all', () => {
    hud.phase = 'play'
    hud.pointerFree = false
    hud.hints = [{ id: 'move', family: 'touch', count: 1, goal: 3, flash: 0, done: false }]
    const w = mount(ControlHints, { global: { plugins: [i18n()] } })
    const hint = w.find('.hint.move.touch')
    expect(hint.exists()).toBe(true)
    expect(hint.find('path.inf-guide').exists()).toBe(true)
    expect(hint.find('.stick-rim').exists()).toBe(false)
    expect(hint.findAll('.pip')).toHaveLength(3)
    expect(hint.findAll('.pip.on')).toHaveLength(1)
    expect(hint.attributes('aria-label')).toBe(en.tips.moveTouch)
  })

  it('the pause legend opens on the same ∞ for touch, and on WASD for keys', () => {
    device.value = 'touch'
    const touch = mount(ControlsPanel, { global: { plugins: [i18n()] } })
    const first = touch.find('.row')
    expect(first.attributes('data-row')).toBe('move')
    expect(first.find('.input.infinity path.inf-guide').exists()).toBe(true)
    // Charge is a hold: its row shows the standing ring, fire's tap does not.
    expect(touch.find('[data-row="charge"] .hold-arc').exists()).toBe(true)
    expect(touch.find('[data-row="fire"] .hold-arc').exists()).toBe(false)

    device.value = 'mouse'
    const keys = mount(ControlsPanel, { global: { plugins: [i18n()] } })
    expect(keys.find('[data-row="move"] .input.wasd').exists()).toBe(true)
    expect(keys.find('[data-row="charge"] .hold-arc').exists()).toBe(true)
  })

  it('the touch legend has no look row — the ∞ stands for it; keys keep the swaying mouse', () => {
    device.value = 'touch'
    const touch = mount(ControlsPanel, { global: { plugins: [i18n()] } })
    expect(touch.find('[data-row="look"]').exists()).toBe(false)
    expect(touch.find('.sway').exists()).toBe(false)
    expect(touch.find('[data-row="move"] .input.infinity').exists()).toBe(true)

    device.value = 'mouse'
    const keys = mount(ControlsPanel, { global: { plugins: [i18n()] } })
    expect(keys.find('[data-row="look"] .input.mouse .sway').exists()).toBe(true)
  })

  it('the coach still teaches the desktop camera with the swaying mouse', () => {
    hud.phase = 'play'
    hud.pointerFree = false
    hud.hints = [{ id: 'look', family: 'mouse', count: 0, goal: 3, flash: 0, done: false }]
    const w = mount(ControlHints, { global: { plugins: [i18n()] } })
    const hint = w.find('.hint.look.mouse')
    expect(hint.exists()).toBe(true)
    expect(hint.find('.sway').exists()).toBe(true)
    expect(hint.attributes('aria-label')).toBe(en.tips.lookMouse)
    // Looking lights no button.
    expect(hint.find('svg').attributes('data-lit')).toBe('none')
  })

  it('the coach\'s mouse cards: fire clicks left, charge holds left, block HOLDS right, parry clicks right', () => {
    hud.phase = 'play'
    hud.pointerFree = false
    const card = (id: 'fire' | 'charge' | 'block' | 'parry') => {
      hud.hints = [{ id, family: 'mouse', count: 0, goal: 2, flash: 0, done: false }]
      return mount(ControlHints, { global: { plugins: [i18n()] } }).find(`.hint.${id}.mouse svg`)
    }
    const expectGlyph = (svg: ReturnType<typeof card>, side: 'left' | 'right', mode: 'm-click' | 'm-hold') => {
      expect(svg.attributes('data-lit')).toBe(side)
      expect(svg.classes()).toContain(mode)
      expect(svg.find('path.hot').attributes('data-button')).toBe(side)
    }
    expectGlyph(card('fire'), 'left', 'm-click')
    expectGlyph(card('charge'), 'left', 'm-hold')
    // Block is held (input.ts: blockHeld): the right button stays down while
    // the ring fills — the card read as "click right" without it.
    const block = card('block')
    expectGlyph(block, 'right', 'm-hold')
    expect(block.find('path.m-fill').exists()).toBe(true)
    // A parry is one timed press, on the beat of the card's closing ring.
    const parry = card('parry')
    expectGlyph(parry, 'right', 'm-click')
    expect(parry.find('path.m-fill').exists()).toBe(false)
    const src = readFileSync(resolve(__dirname, '../../src/components/hud/ControlHints.vue'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toMatch(/\.parry \.glyph-box\n\s+--m-click-dur: 1\.1s\n\s+--m-click-delay: -0\.495s/)
    // The capture glyph (before the mouse is captured) is a left click.
    hud.pointerFree = true
    hud.hints = []
    const capture = mount(ControlHints, { global: { plugins: [i18n()] } }).find('.capture svg')
    expectGlyph(capture, 'left', 'm-click')
    hud.pointerFree = false
  })

  it('the pause legend: block is a right-button hold, fire a left click, charge a left hold', () => {
    device.value = 'mouse'
    const keys = mount(ControlsPanel, { global: { plugins: [i18n()] } })
    const row = (k: string) => keys.find(`[data-row="${k}"] svg`)
    expect(row('block').attributes('data-lit')).toBe('right')
    expect(row('block').classes()).toContain('m-hold')
    expect(row('fire').attributes('data-lit')).toBe('left')
    expect(row('fire').classes()).toContain('m-click')
    expect(row('charge').attributes('data-lit')).toBe('left')
    expect(row('charge').classes()).toContain('m-hold')
    expect(row('look').attributes('data-lit')).toBe('none')
    // The parry: the same right button, clicked once on the beat.
    expect(row('parry').attributes('data-lit')).toBe('right')
    expect(row('parry').classes()).toContain('m-click')
    expect(row('parry').find('path.m-fill').exists()).toBe(false)
  })

  it('the pause legend writes each action\'s verb beside its icon, as the coach never does', () => {
    for (const fam of ['touch', 'mouse'] as const) {
      device.value = fam
      const w = mount(ControlsPanel, { global: { plugins: [i18n()] } })
      expect(w.get('[data-row="move"] .action .label').text(), fam).toBe(en.pause.label.move)
      expect(w.get('[data-row="charge"] .action .label').text(), fam).toBe(en.hero.stat.charge)
      expect(w.get('[data-row="block"] .action .label').text(), fam).toBe(en.combat.block)
      expect(w.get('[data-row="slide"] .action .label').text(), fam).toBe(en.combat.slide)
      w.unmount()
    }
    // The in-play coach stays wordless.
    hud.phase = 'play'
    hud.pointerFree = false
    hud.hints = [{ id: 'charge', family: 'mouse', count: 0, goal: 2, flash: 0, done: false }]
    const coach = mount(ControlHints, { global: { plugins: [i18n()] } })
    expect(coach.find('.hint.charge').text()).toBe('')
  })
})
