// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { LANGUAGES } from '@/utils/enums'
import ControlsPanel from '@/components/hud/ControlsPanel.vue'
import { ICON_PATHS } from '@/components/icons/iconPaths'

// The legend asks the game which hand is on the controls; the game itself
// (renderer, missions) has no business here.
const device = vi.hoisted(() => ({ value: 'touch' as 'touch' | 'mouse' }))
vi.mock('@/game/boot', () => ({ input: { get device() { return device.value } } }))

/**
 * ─── The pause menu's controls legend ───────────────────────────────────────
 *
 * The phone tester called the legend genuinely useful, but its icon → icon
 * pairs were hard to decode. Every row now reads "do this → to do that": the
 * input glyph in one fixed box, an arrow, the action's icon and its verb,
 * written out (the pause menu is a reference screen). Rows come grouped:
 * movement, combat, items and the rest.
 */

type Family = 'touch' | 'mouse'
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n')
const at = (messages: unknown, path: string): unknown => path.split('.').reduce<any>((o, k) => o?.[k], messages)
/** A verb as shown: its {turn} is the default turn keys (`keyAria.ts`). */
const shown = (v: unknown): unknown => (typeof v === 'string' ? v.replace('{turn}', '← →') : v)
const i18nFor = (code: string, messages: Record<string, unknown>) => createI18n({
  legacy: false, locale: code, messages: { [code]: messages }, missingWarn: false, fallbackWarn: false
})
const legend = (family: Family, code = 'en', messages: Record<string, unknown> = en) => {
  device.value = family
  return mount(ControlsPanel, { global: { plugins: [i18nFor(code, messages)] } })
}
const D = (name: keyof typeof ICON_PATHS) => ICON_PATHS[name].join('')

const ORDER: Record<Family, Record<string, string[]>> = {
  touch: {
    movement: ['move', 'slide', 'leap'],
    combat: ['fire', 'charge', 'block', 'parry'],
    items: ['tank', 'use']
  },
  mouse: {
    movement: ['move', 'look', 'turn', 'slide', 'leap'],
    combat: ['fire', 'charge', 'block', 'parry', 'weapon', 'target'],
    items: ['tank', 'use', 'beam', 'mute']
  }
}

afterEach(() => { device.value = 'touch' })

describe('every row reads "do this → to do that"', () => {
  it.each(['touch', 'mouse'] as const)('%s: input glyph, arrow, action icon, and a visible verb from i18n', (family) => {
    const w = legend(family)
    const rows = w.findAll('.row')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const key = row.attributes('data-row')
      // In that order, left to right.
      const parts = row.element.children
      expect([...parts].map(e => e.classList[0]), key).toEqual(['input', 'to', 'action'])
      expect(row.find('.input svg.glyph').exists(), key).toBe(true)
      expect(row.find('.action .icon svg.game-icon').exists(), key).toBe(true)
      // The verb is written out, and it is the English string of its key.
      const label = row.get('.action .label')
      const path = label.attributes('data-label')!
      const want = shown(at(en, path))
      expect(typeof want, `${key}: ${path}`).toBe('string')
      expect(label.text(), key).toBe(want)
      expect(label.text().length, key).toBeGreaterThan(0)
      // The sentence stays the screen reader's; the glyphs are decoration.
      expect(row.attributes('role')).toBe('img')
      expect(row.attributes('aria-label'), key).toBeTruthy()
      expect(row.find('.to').attributes('aria-hidden')).toBe('true')
      expect(row.find('.action').attributes('aria-hidden')).toBe('true')
    }
  })

  it('gives every input glyph the same box, whatever it draws', () => {
    const css = read('src/components/hud/ControlsPanel.vue')
    const input = css.match(/\n\.input\n((?:  .*\n)+)/)?.[1] ?? ''
    expect(input).toMatch(/width: var\(--box-w\)/)
    expect(input).toMatch(/height: calc\(var\(--box-w\) \* 0\.7\)/)
    // No kind widens its box (the ∞ used to span two cells).
    expect(css).not.toMatch(/\.input\.infinity|\.infinity\n\s+width|grid-column/)
  })
})

describe('the row sets', () => {
  const keys = (w: ReturnType<typeof legend>) => w.findAll('.row').map(r => r.attributes('data-row'))

  it('touch: no look row (the ∞ stands for it); gel and interact are taps', () => {
    const w = legend('touch')
    expect(keys(w)).not.toContain('look')
    expect(w.find('.sway').exists()).toBe(false)
    for (const k of ['tank', 'use', 'fire', 'slide', 'parry']) {
      const g = w.get(`[data-row="${k}"] .input`)
      expect(g.classes(), k).toContain('finger')
      expect(g.find('.ripple').exists(), k).toBe(true)
      expect(g.find('.hold-arc').exists(), k).toBe(false)
    }
    for (const k of ['charge', 'block']) expect(w.find(`[data-row="${k}"] .hold-arc`).exists(), k).toBe(true)
    expect(w.get('[data-row="tank"] .icon path').attributes('d')).toBe(D('flask'))
    expect(w.get('[data-row="use"] .icon path').attributes('d')).toBe(D('chest'))
    expect(w.get('[data-row="tank"]').attributes('aria-label')).toBe(en.lesson.gelTouch)
    expect(w.get('[data-row="use"]').attributes('aria-label')).toBe(en.pause.touch.use)
    // Keys belong to the desk.
    expect(w.find('.input.key').exists()).toBe(false)
    expect(w.find('.input.wasd').exists()).toBe(false)
  })

  it('mouse + keys: F2 mute, H gel, E interact and B beam out each have a keycap row', () => {
    const w = legend('mouse')
    const cases = [
      ['mute', 'F2', 'sound', en.hud.mute],
      ['tank', 'H', 'flask', en.combat.tank],
      ['use', 'E', 'chest', en.pause.label.interact],
      ['beam', 'B', 'up', en.hud.beamOut]
    ] as const
    for (const [k, letter, icon, verb] of cases) {
      const row = w.get(`[data-row="${k}"]`)
      expect(row.find('.input.key text.label').text(), k).toBe(letter)
      expect(row.get('.icon path').attributes('d'), k).toBe(D(icon))
      expect(row.get('.action .label').text(), k).toBe(verb)
      // Read aloud as the key and its verb.
      expect(row.attributes('aria-label'), k).toBe(`${letter}: ${verb}`)
    }
    // The desk has a camera row; no touch glyph anywhere.
    expect(keys(w)).toContain('look')
    expect(w.find('.input.finger').exists()).toBe(false)
    expect(w.find('.input.infinity').exists()).toBe(false)
  })

  it('block is held, a parry is one press on the beat: a closing ring on the parry row only', () => {
    for (const family of ['touch', 'mouse'] as const) {
      const w = legend(family)
      expect(w.findAll('.parry-ring'), family).toHaveLength(1)
      expect(w.find('[data-row="parry"] .parry-ring').exists(), family).toBe(true)
      expect(w.get('[data-row="parry"] .icon path').attributes('d')).toBe(D('shield'))
      expect(w.get('[data-row="parry"] .action .label').text()).toBe(en.pause.label.parry)
    }
    const keys = legend('mouse')
    expect(keys.get('[data-row="parry"] svg.glyph').attributes('data-lit')).toBe('right')
    expect(keys.get('[data-row="parry"] svg.glyph').classes()).toContain('m-click')
    expect(keys.get('[data-row="block"] svg.glyph').classes()).toContain('m-hold')
    // The click lands as the ring closes (the coach's parry timing).
    expect(read('src/components/hud/ControlsPanel.vue')).toMatch(
      /\.row\[data-row="parry"\] \.input\n\s+--m-click-dur: 1\.1s\n\s+--m-click-delay: -0\.495s/)
  })
})

describe('order and grouping', () => {
  it.each(['touch', 'mouse'] as const)('%s: movement, then combat, then items and the rest, in that order', (family) => {
    const w = legend(family)
    const groups = w.findAll('.group')
    expect(groups.map(g => g.attributes('data-group'))).toEqual(Object.keys(ORDER[family]))
    for (const g of groups) {
      expect(g.findAll('.row').map(r => r.attributes('data-row'))).toEqual(ORDER[family][g.attributes('data-group')!])
    }
    // The ∞ (touch) or WASD (keys) still opens the legend.
    expect(w.get('.row').attributes('data-row')).toBe('move')
  })

  it('splits the groups with a faint rule, not a heading', () => {
    const css = read('src/components/hud/ControlsPanel.vue')
    expect(css).toMatch(/\n\.group\n(?:  .*\n)*  & \+ \.group\n\s+padding-top: var\(--gap\)\n\s+border-top: 2px solid rgba\(159, 230, 255, 0\.16\)/)
    const w = legend('mouse')
    expect(w.findAll('.group h1, .group h2, .group h3, .group-title')).toHaveLength(0)
  })

  it('lays a group out in columns only as wide as a whole-word verb needs, in a wider pause frame', () => {
    // At ~200 px a column left the verb ~35 px and Russian broke letter by
    // letter; 236 px keeps one column upright on a phone, two on its side,
    // three in the desktop pause frame (widened for it, phones unchanged).
    const css = read('src/components/hud/ControlsPanel.vue')
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 236px\), 1fr\)\)/)
    expect(read('src/components/modals/PauseModal.vue')).toMatch(
      /<style lang="sass">[\s\S]*\.f-modal\.pause-modal \.f-modal__container\n\s+max-width: min\(60rem, 96vw\)/)
  })
})

describe('the labels in every shipped language', () => {
  for (const code of LANGUAGES) {
    it(`${code}: every row's verb and sentence resolve, none falls back to a key`, async () => {
      const messages = (await import(`../../src/i18n/locales/${code}.ts`)).default
      for (const family of ['touch', 'mouse'] as const) {
        const w = legend(family, code, messages)
        for (const row of w.findAll('.row')) {
          const label = row.get('.action .label')
          const path = label.attributes('data-label')!
          const want = shown(at(messages, path))
          expect(typeof want, `${code} ${path}`).toBe('string')
          expect(label.text(), `${code} ${path}`).toBe(want)
          expect((want as string).trim().length, `${code} ${path}`).toBeGreaterThan(0)
          // A verb, not a sentence: it shares a 320 px row with two glyphs.
          expect([...(want as string)].length, `${code} ${path}`).toBeLessThanOrEqual(20)
          const aria = row.attributes('aria-label') ?? ''
          expect(aria, `${code} ${row.attributes('data-row')}`).not.toMatch(/^(pause|tips|lesson|combat|hud|hero)\.|\{(key|action)\}/)
          expect(aria.length).toBeGreaterThan(0)
        }
        w.unmount()
      }
    })
  }
})

describe('motion', () => {
  const css = read('src/components/hud/ControlsPanel.vue')
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))

  it('the glyphs move in the legend, as in play: taps press, holds hold, clicks click', () => {
    const touch = legend('touch')
    expect(touch.find('[data-row="fire"] .press').exists()).toBe(true)
    expect(touch.find('[data-row="charge"] .hold-press').exists()).toBe(true)
    expect(touch.find('[data-row="move"] animateMotion').exists()).toBe(true)
    const keys = legend('mouse')
    expect(keys.get('[data-row="fire"] svg.glyph').classes()).toContain('m-click')
    expect(keys.get('[data-row="charge"] svg.glyph').classes()).toContain('m-hold')
    // Nothing in the legend pauses them: the pause menu is where they play.
    expect(css).not.toMatch(/animation-play-state|pauseAnimations/)
  })

  it('only while the legend is open: it lives inside the pause modal, which mounts its content only when open', () => {
    const pause = read('src/components/modals/PauseModal.vue')
    expect(pause).toMatch(/FModal\.pause-modal\(:model-value="open"/)
    expect(pause).toMatch(/\n\s+ControlsPanel\n/)
    expect(read('src/components/molecules/FModal.vue')).toMatch(/div\.f-modal\(\n\s+v-if="modelValue"/)
  })

  it('reduced motion stills every animation the legend adds; the glyphs keep their still poses', () => {
    expect(reduced.length).toBeGreaterThan(0)
    // Every rule outside the reduced block that animates is switched off inside it.
    const before = css.slice(0, css.indexOf('@media (prefers-reduced-motion: reduce)'))
    const animated = [...before.matchAll(/\n(\.[^\n]+)\n((?:  .*\n)+)/g)]
      .filter(m => /\n?\s+animation: /.test(m[2]!))
      .map(m => m[1]!.trim())
    expect(animated).toEqual(['.parry-ring'])
    expect(reduced).toMatch(/\.parry-ring\n\s+animation: none/)
    // InputGlyph's own still poses (asserted in inputGlyph.test.ts) exist.
    expect(read('src/components/hud/InputGlyph.vue')).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})

describe('the keys it names follow the bindings and the keyboard (#146)', () => {
  afterEach(async () => {
    const { __resetBindingsForTests } = await import('@/game/engine/keyBindings')
    __resetBindingsForTests()
  })

  it('a rebound turn key and slide key show as bound: no "← →", no space bar left behind', async () => {
    const { bindKey } = await import('@/game/engine/keyBindings')
    let w = legend('mouse')
    expect(w.get('[data-row="turn"] .action .label').text()).toBe('Turn (← →)')
    expect(w.find('[data-row="slide"] rect.spacebar').exists()).toBe(true)
    w.unmount()
    bindKey('turnLeft', 'KeyQ')
    bindKey('slide', 'KeyC')
    w = legend('mouse')
    expect(w.get('[data-row="turn"] .action .label').text()).toBe('Turn (Q →)')
    expect(w.find('[data-row="slide"] rect.spacebar').exists()).toBe(false)
    expect(w.get('[data-row="slide"] text.label').text()).toBe('C')
    w.unmount()
  })
})
