// @vitest-environment jsdom
// #146: "some keys are still hard-coded on desktop". Every key the game shows
// comes from the binding (`engine/keyBindings.ts`) and this keyboard's label
// (`engine/keyLabels.ts`): a keycap is written with the action's DEFAULT code
// and drawn as bound, in the player's letters. These scans keep literal keys
// out of the copy and the templates, so a "W" can never be typed in again.

import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import InputGlyph from '@/components/hud/InputGlyph.vue'
import { bindKey, __resetBindingsForTests } from '@/game/engine/keyBindings'
import { observeKey, __resetKeyboardForTests } from '@/game/engine/keyLabels'
import { LANGUAGES } from '@/utils/enums'

const ROOT = resolve(__dirname, '../..')
const flatten = (obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v as Record<string, unknown>, path, out)
    else out[path] = String(v)
  }
  return out
}

/** The copy that talks about controls. */
const CONTROLS = /^(tips|lesson|walk|pause|ui|hud|options|objective|coach|hubLesson|combat|interact|train|help)\./
/** Arrows, key names and lone capital letters (A, I and O are words in some
 *  languages) — outside the `{placeholders}` that carry the real keys. */
const ARROWS = /[←→↑↓]/
const KEY_NAME = /\b(WASD|ZQSD|Shift|Ctrl|Alt|Tab|Enter|Esc|Space)\b/
const LONE_LETTER = /(^|[^\p{L}\p{N}])[B-HJ-NP-Z](?=$|[^\p{L}\p{N}])/u
/** Where a literal key is right on every keyboard. */
const ALLOWED: Record<string, string> = {
  // Escape is never rebindable (pause, the browser's own pointer-lock exit):
  // "Esc" is printed on it everywhere.
  'pause.keys.more': 'Esc',
  'options.keyboard.press': 'Esc',
  // The space bar's own name, used only while the slide is still on Space.
  'tips.spaceKey': '*',
  'pause.keys.space': '*',
  // A verb ("Enter" the boss room), not a key.
  'interact.bossDoor': '*'
}
/** Words that only look like keys: Czech "U" (at), Uzbek "U" (it), Danish /
 *  Norwegian "Alt" (everything). */
const WORDS: Record<string, string[]> = {
  cs: ['pause.touch.use'], uz: ['pause.abandonAsk'], da: ['hubLesson.deploy'], nb: ['hubLesson.deploy']
}

describe('no locale writes a key out', () => {
  for (const code of LANGUAGES) {
    it(`${code}: keys only through {placeholders}`, async () => {
      const mod = await import(`../../src/i18n/locales/${code}.ts`)
      const bad: string[] = []
      for (const [k, v] of Object.entries(flatten(mod.default))) {
        if (!CONTROLS.test(k) || ALLOWED[k] === '*' || WORDS[code]?.includes(k)) continue
        let s = v.replace(/\{[a-zA-Z0-9]+\}/g, '')
        if (ALLOWED[k]) s = s.split(ALLOWED[k]).join('')
        if (ARROWS.test(s) || KEY_NAME.test(s) || LONE_LETTER.test(s)) bad.push(`${k}: ${v}`)
      }
      expect(bad).toEqual([])
    })
  }
})

const files = (dir: string, ext: RegExp, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) files(p, ext, out)
    else if (ext.test(n)) out.push(p)
  }
  return out
}
const SRC = files(join(ROOT, 'src'), /\.(ts|vue)$/).filter(f => !/[\\/]i18n[\\/]locales[\\/]/.test(f))
const template = (src: string): string => src.match(/<template[^>]*>([\s\S]*)<\/template>/)?.[1] ?? ''

describe('no template or glyph names a key by hand', () => {
  it('every keycap glyph names its key by code (so it is drawn as bound, on this keyboard)', () => {
    const bad: string[] = []
    for (const f of SRC) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split(/\r?\n/)
      lines.forEach((l, i) => {
        // A glyph object: { kind: 'key', … } must carry its code.
        if (/\{[^}]*kind: 'key'[^}]*\}/.test(l) && !/code:/.test(l)) bad.push(`${f}:${i + 1}`)
        // A glyph in a template: InputGlyph(kind="key" …) with its code.
        if (/InputGlyph\([^)]*kind="key"/.test(l) && !/:?code=/.test(l)) bad.push(`${f}:${i + 1}`)
        // A letter handed in as a label.
        if (/(InputGlyph|KeyCap)[^)]*\blabel="/.test(l)) bad.push(`${f}:${i + 1}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('no template prints a lone key letter or a key name as text', () => {
    const bad: string[] = []
    for (const f of SRC.filter(f => f.endsWith('.vue'))) {
      template(readFileSync(f, 'utf8')).split(/\r?\n/).forEach((l, i) => {
        if (/^\s*\/\/-/.test(l)) return
        // pug text after a tag (`span W`, `kbd(…) Space`) or a piped line (`| E`)
        const text = l.match(/^\s*\|\s(.*)$/)?.[1] ?? l.match(/^\s*[\w.#-]+(?:\([^)]*\))?\s+([^=(].*)$/)?.[1] ?? ''
        const s = text.replace(/\{\{[\s\S]*?\}\}/g, '')
        if (LONE_LETTER.test(s) || KEY_NAME.test(s)) bad.push(`${f}:${i + 1}: ${l.trim()}`)
      })
    }
    expect(bad).toEqual([])
  })
})

describe('the gap door\'s move keys (#146)', () => {
  beforeEach(() => {
    __resetBindingsForTests()
    __resetKeyboardForTests()
  })
  const cluster = () => mount(InputGlyph, { props: { kind: 'wasd', litKey: 'KeyW' } })
  const caps = (w: ReturnType<typeof cluster>) => w.findAll('text.label').map(t => t.text())
  const lit = (w: ReturnType<typeof cluster>) => {
    const i = w.findAll('rect.cap').findIndex(r => (r.attributes('class') ?? '').split(' ').includes('lit'))
    return caps(w)[i]
  }

  it('lights the forward key, in this keyboard\'s letter, live as the layout is learned', async () => {
    const w = cluster()
    expect(caps(w)).toEqual(['W', 'A', 'S', 'D'])
    expect(lit(w)).toBe('W')
    observeKey({ code: 'KeyW', key: 'z', ctrlKey: false, altKey: false, metaKey: false })
    await w.vm.$nextTick()
    expect(caps(w)).toEqual(['Z', 'Q', 'S', 'D'])
    expect(lit(w)).toBe('Z')
  })

  it('follows a rebinding: forward on the up arrow lights ↑', async () => {
    const w = cluster()
    bindKey('forward', 'ArrowUp')
    await w.vm.$nextTick()
    expect(lit(w)).toBe('↑')
  })
})
