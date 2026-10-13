import { computed, reactive, watch } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { KB_LAYOUT_KEY } from '@/keys'
import { boundCode } from './keyBindings'

/**
 * ─── What the key is called on THIS keyboard ─────────────────────────────────
 *
 * The game binds PHYSICAL keys (`KeyboardEvent.code`, see `keyBindings.ts`):
 * the key under the left ring finger is `KeyW` on every layout. Its printed
 * letter is not — an AZERTY player walks with Z Q S D, a QWERTZ player's
 * `KeyY` reads Z. Every keycap the HUD draws asks this module for the letter.
 *
 * Auto-detection, strongest evidence first:
 *   1. the Keyboard API's layout map (Chromium; refused in some embeds by the
 *      `keyboard-map` permissions policy, absent in Firefox and Safari by
 *      their choice — it is a fingerprinting surface);
 *   2. what the player TYPES: every character key pressed teaches its own
 *      label (`observeKey`), and a key that rules the believed layout out
 *      (KeyW → "z" on AZERTY, KeyS → "r" on Colemak, KeyW → "," on Dvorak)
 *      switches to the known layout that fits what was typed. Remembered, so
 *      the next session starts right;
 *   3. before any of that, the browser language: French (not Canadian, not
 *      Swiss) guesses AZERTY; German, Swiss, Czech, Slovak, Hungarian and
 *      the ex-Yugoslav languages guess QWERTZ. A guess only — the first
 *      telling key overrides it.
 * Switched off (Options → Controls), the player's chosen layout decides.
 *
 * The known layouts are full tables (`ROWS`), so a layout settled by one key
 * names every other key right before it is pressed. Layouts with their own
 * letters on the Latin keycaps (Russian, Greek, Arabic…) print the US letters
 * too: their non-Latin characters are never learned, the Latin ones stay.
 * Other Latin layouts (Spanish, Nordic, Swiss French…) are QWERTY or QWERTZ
 * for every letter; their own punctuation keys are learned when typed.
 *
 * Digits always read as digits (AZERTY prints & é " on them unshifted, and a
 * "&" on a weapon button helps nobody). Named keys get symbols.
 */

export type Layout = 'qwerty' | 'qwertz' | 'azerty' | 'dvorak' | 'colemak' | 'turkishF'
export const LAYOUTS: Layout[] = ['qwerty', 'qwertz', 'azerty', 'dvorak', 'colemak', 'turkishF']
/** The layouts' own names (proper nouns: never translated). */
export const LAYOUT_NAMES: Record<Layout, string> = {
  qwerty: 'QWERTY', qwertz: 'QWERTZ', azerty: 'AZERTY', dvorak: 'Dvorak', colemak: 'Colemak', turkishF: 'Türkçe F'
}

/** The character keys, row by row, then the odd ones out — the order of the
 *  strings in `ROWS`. */
const CODES = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash',
  'Minus', 'Equal', 'Backquote', 'Backslash'
] as const

/** What each layout types on `CODES`, unshifted (12 + 11 + 10 + 4). */
const ROWS: Record<Layout, string> = {
  qwerty: "qwertyuiop[]" + "asdfghjkl;'" + 'zxcvbnm,./' + '-=`\\',
  qwertz: 'qwertzuiopü+' + 'asdfghjklöä' + 'yxcvbnm,.-' + 'ß´^#',
  azerty: 'azertyuiop^$' + 'qsdfghjklmù' + 'wxcvbn,;:!' + ')=²*',
  dvorak: "',.pyfgcrl/=" + 'aoeuidhtns-' + ';qjkxbmwvz' + '[]`\\',
  colemak: 'qwfpgjluy;[]' + "arstdhneio'" + 'zxcvbkm,./' + '-=`\\',
  turkishF: 'fgğıodrnhpqw' + 'uieaütkmlyş' + 'jövcçzsb.,' + '/-+x'
}

/** Each layout's character per code. */
const CHARS = Object.fromEntries(LAYOUTS.map(l => [l, Object.fromEntries(CODES.map((c, i) => [c, [...ROWS[l]][i]!]))])) as
  Record<Layout, Record<string, string>>

/** A character as its keycap prints it ("i" is "İ" on a Turkish keyboard). */
const upper = (ch: string, layout: Layout): string => {
  const u = layout === 'turkishF' ? ch.toLocaleUpperCase('tr') : ch.toUpperCase()
  // "ß" has no one-letter capital: its keycap prints it as it is.
  return [...u].length === 1 ? u : ch
}

/** The layouts whose key `code` types `ch`. */
export const layoutsTyping = (code: string, ch: string): Layout[] => {
  const c = ch.toLowerCase()
  return LAYOUTS.filter(l => CHARS[l][code] === c)
}

type Source = 'none' | 'language' | 'typed' | 'map'

interface Saved { auto: boolean; manual: Layout; detected: Layout | null }

export const keyboard = reactive({
  /** Detect the layout (true) or use `manual`. */
  auto: true,
  manual: 'qwerty' as Layout,
  /** What detection concluded, and from what. */
  detected: null as Layout | null,
  source: 'none' as Source
})

/** From the layout map and from typing: exact labels, any layout. */
const exact = reactive<Record<string, string>>({})

export const activeLayout = computed<Layout>(() => (keyboard.auto ? keyboard.detected ?? 'qwerty' : keyboard.manual))

const NAMED: Record<string, string> = {
  Escape: 'Esc', Tab: '⇥', Space: '␣', Enter: '⏎', Backspace: '⌫',
  ShiftLeft: '⇧', ShiftRight: '⇧', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: '⇪',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', IntlBackslash: '<'
}

const fallback = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return code.slice(6)
  if (code.startsWith('F') && /^F\d+$/.test(code)) return code
  return NAMED[code] ?? code
}

/** The printed label of a physical key, e.g. `KeyW` → "W" (or "Z" on AZERTY). */
export const keyLabel = (code: string): string => {
  if (code.startsWith('Digit') || code.startsWith('Numpad')) return fallback(code)
  if (keyboard.auto && exact[code]) return exact[code]!
  const l = activeLayout.value
  const ch = CHARS[l][code]
  return ch ? upper(ch, l) : fallback(code)
}

/** The label the HUD draws for a key it was written with (the DEFAULT key of
 *  an action): the action's key as bound now, in this keyboard's letters. */
export const actionKeyLabel = (defaultCode: string): string => keyLabel(boundCode(defaultCode))

// ─── Detection ──────────────────────────────────────────────────────────────

/** The one layout a code → character pair settles, if it settles one
 *  (KeyW → "w" is QWERTY, QWERTZ or Colemak: none). */
export const classify = (code: string, ch: string): Layout | null => {
  const l = layoutsTyping(code, ch)
  return l.length === 1 ? l[0]! : null
}

/** The browser language's usual layout — a first guess, nothing more. */
export const guessFromLanguage = (langs: readonly string[]): Layout => {
  const l = (langs[0] ?? '').toLowerCase()
  const [lang, region = ''] = l.split('-')
  if (lang === 'fr') return region === 'ca' ? 'qwerty' : region === 'ch' ? 'qwertz' : 'azerty'
  if (['de', 'cs', 'sk', 'hu', 'sl', 'hr', 'bs', 'sq', 'lb', 'rm'].includes(lang ?? '')) return 'qwertz'
  if (lang === 'it' && region === 'ch') return 'qwertz'
  return 'qwerty'
}

const RANK: Record<Source, number> = { none: 0, language: 1, typed: 2, map: 3 }
const conclude = (layout: Layout, source: Source): void => {
  if (RANK[source] < RANK[keyboard.source]) return
  keyboard.detected = layout
  keyboard.source = source
  if (source === 'typed' || source === 'map') persist()
}

/** A character a keycap can carry: one printable character, Latin if a letter
 *  (a Russian or Greek keyboard prints the US letters on the same keys). */
const printable = (k: string): boolean => [...k].length === 1 && !!k.trim() && (!/\p{L}/u.test(k) || /\p{Script=Latin}/u.test(k))

/** What was typed this session (code → character), the evidence a switch of
 *  layout weighs. */
const typed = new Map<string, string>()

/**
 * Learn from a real key press (the game's own keydown handler calls this):
 * its label, and the layout when the press rules out the one believed.
 */
export const observeKey = (e: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'metaKey'> & { shiftKey?: boolean }): void => {
  // Chords, AltGr and Shift type other characters than the keycap's own.
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !e.key || !printable(e.key)) return
  if (!(CODES as readonly string[]).includes(e.code)) return
  const ch = e.key.toLowerCase()
  typed.set(e.code, ch)
  const fits = layoutsTyping(e.code, ch)
  const believed = keyboard.detected ?? 'qwerty'
  if (fits.length && !fits.includes(believed)) {
    // The player is typing on another layout NOW (the OS layout switched
    // after the map was read, or the guess was wrong). Typing is the live
    // truth: the known layout that fits the most of what was typed, and
    // every old label dropped (no mixed "Z A S D").
    let best = fits[0]!
    let score = -1
    for (const l of fits) {
      let s = 0
      for (const [c, k] of typed) if (CHARS[l][c] === k) s++
      if (s > score) { best = l; score = s }
    }
    for (const k of Object.keys(exact)) delete exact[k]
    for (const [c, k] of typed) if (CHARS[best][c] !== k) typed.delete(c)
    keyboard.detected = best
    keyboard.source = 'typed'
    persist()
  } else if (fits.length === 1 && RANK[keyboard.source] < RANK.typed) conclude(fits[0]!, 'typed')
  exact[e.code] = upper(ch, keyboard.detected ?? 'qwerty')
}

let asked = false
/** Detect the layout once (safe to call repeatedly). */
export const loadKeyboardLayout = async (): Promise<void> => {
  if (asked) return
  asked = true
  if (typeof navigator !== 'undefined' && keyboard.source === 'none') {
    conclude(guessFromLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? '']), 'language')
  }
  const kb = (typeof navigator !== 'undefined' ? (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> }
  }).keyboard : undefined)
  if (!kb?.getLayoutMap) return
  try {
    const map = await kb.getLayoutMap()
    // Typed before the map came back: the typing is newer.
    if (typed.size) return
    let best: Layout = 'qwerty'
    let score = -1
    for (const l of LAYOUTS) {
      let s = 0
      for (const c of CODES) if (map.get(c)?.toLowerCase() === CHARS[l][c]) s++
      if (s > score) { best = l; score = s }
    }
    for (const code of CODES) {
      const k = map.get(code)
      // Only printable characters; a dead key, a word or a Cyrillic letter
      // keeps the table's label.
      if (k && printable(k)) exact[code] = upper(k.toLowerCase(), best)
    }
    conclude(best, 'map')
  } catch {
    // Permissions policy in an embed, or no layout: typing will tell.
  }
}

// ─── The player's settings ──────────────────────────────────────────────────

const persist = (): void => {
  const s: Saved = { auto: keyboard.auto, manual: keyboard.manual, detected: keyboard.source === 'typed' || keyboard.source === 'map' ? keyboard.detected : null }
  setState(KB_LAYOUT_KEY, s)
}

const read = (): void => {
  const s = getState<Partial<Saved> | null>(KB_LAYOUT_KEY, null)
  if (!s || typeof s !== 'object') return
  if (typeof s.auto === 'boolean') keyboard.auto = s.auto
  if (s.manual && LAYOUTS.includes(s.manual)) keyboard.manual = s.manual
  // A layout learned last time outranks a language guess this time.
  if (s.detected && LAYOUTS.includes(s.detected) && RANK[keyboard.source] < RANK.typed) {
    keyboard.detected = s.detected
    keyboard.source = 'typed'
  }
}

export const setAutoLayout = (on: boolean): void => {
  keyboard.auto = on
  persist()
}

export const setManualLayout = (l: Layout): void => {
  keyboard.manual = l
  persist()
}

read()
watch(saveDataVersion, read)

/** Test seam. */
export const __resetKeyboardForTests = (): void => {
  keyboard.auto = true
  keyboard.manual = 'qwerty'
  keyboard.detected = null
  keyboard.source = 'none'
  for (const k of Object.keys(exact)) delete exact[k]
  typed.clear()
  asked = false
}
