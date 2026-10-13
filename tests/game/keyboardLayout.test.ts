// @vitest-environment jsdom
// Keyboard layout + key bindings (src/game/engine/keyBindings.ts, keyLabels.ts,
// input.ts): keys are PHYSICAL and rebindable; what they are CALLED follows
// the detected layout (the Keyboard API, else the keys the player types, else
// the browser language), or the layout the player picked with detection off.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIONS, DEFAULT_BINDINGS, actionForCode, bindKey, bindingsChanged, boundCode, codesFor, isBindable,
  primaryCode, resetBindings, __resetBindingsForTests
} from '@/game/engine/keyBindings'
import {
  activeLayout, actionKeyLabel, classify, guessFromLanguage, keyboard, keyLabel, LAYOUTS, loadKeyboardLayout,
  observeKey, setAutoLayout, setManualLayout, __resetKeyboardForTests, type Layout
} from '@/game/engine/keyLabels'
import { attachInput, createInput, type Input } from '@/game/engine/input'
import { computed } from 'vue'

const press = (code: string, key: string) =>
  observeKey({ code, key, ctrlKey: false, altKey: false, metaKey: false })

beforeEach(() => {
  __resetBindingsForTests()
  __resetKeyboardForTests()
})

describe('key bindings', () => {
  it('defaults: WASD, arrows as alternates, every action bound', () => {
    expect(primaryCode('forward')).toBe('KeyW')
    expect(codesFor('forward')).toEqual(['KeyW', 'ArrowUp'])
    for (const a of ACTIONS) expect(codesFor(a).length, a).toBeGreaterThan(0)
    expect(actionForCode('KeyE')).toBe('interact')
    expect(actionForCode('Escape')).toBeNull()
    expect(bindingsChanged()).toBe(false)
  })

  it('rebinding onto another action\'s key swaps them: nothing is left unbound', () => {
    expect(bindKey('forward', 'KeyE')).toBe(true)
    expect(primaryCode('forward')).toBe('KeyE')
    expect(primaryCode('interact')).toBe('KeyW')
    expect(actionForCode('KeyE')).toBe('forward')
    expect(actionForCode('KeyW')).toBe('interact')
    for (const a of ACTIONS) expect(codesFor(a).length, a).toBeGreaterThan(0)
  })

  it('a rebinding that takes an alternate removes it from its old action', () => {
    bindKey('beam', 'ArrowUp')
    expect(codesFor('forward')).toEqual(['KeyW'])
    expect(actionForCode('ArrowUp')).toBe('beam')
  })

  it('reserved keys are refused', () => {
    for (const c of ['Escape', 'F1', 'F2', 'MetaLeft', '']) {
      expect(isBindable(c), c).toBe(false)
      expect(bindKey('slide', c)).toBe(false)
    }
    expect(primaryCode('slide')).toBe('Space')
  })

  it('the HUD asks for a DEFAULT key and gets the key as bound now', () => {
    bindKey('interact', 'KeyG')
    expect(boundCode('KeyE')).toBe('KeyG')
    expect(boundCode('KeyW')).toBe('KeyW')
    expect(boundCode('MouseRight')).toBe('MouseRight')
    expect(actionKeyLabel('KeyE')).toBe('G')
  })

  it('reset puts every default back', () => {
    bindKey('forward', 'KeyI')
    bindKey('slide', 'KeyC')
    expect(bindingsChanged()).toBe(true)
    resetBindings()
    for (const a of ACTIONS) expect(primaryCode(a)).toBe(DEFAULT_BINDINGS[a][0])
    expect(bindingsChanged()).toBe(false)
  })
})

describe('layout detection', () => {
  it('telltale keys classify the layout', () => {
    expect(classify('KeyW', 'z')).toBe('azerty')
    expect(classify('KeyQ', 'a')).toBe('azerty')
    expect(classify('KeyY', 'z')).toBe('qwertz')
    expect(classify('KeyZ', 'y')).toBe('qwertz')
    // W is W on QWERTY, QWERTZ and Colemak: it settles none of them.
    expect(classify('KeyW', 'w')).toBeNull()
    expect(classify('KeyE', 'e')).toBeNull()
    expect(classify('KeyW', ',')).toBe('dvorak')
    expect(classify('KeyS', 'r')).toBe('colemak')
    expect(classify('KeyQ', 'f')).toBe('turkishF')
  })

  it('the browser language is a first guess, with its exceptions', () => {
    expect(guessFromLanguage(['fr-FR'])).toBe('azerty')
    expect(guessFromLanguage(['fr-BE'])).toBe('azerty')
    expect(guessFromLanguage(['fr-CA'])).toBe('qwerty')
    expect(guessFromLanguage(['fr-CH'])).toBe('qwertz')
    expect(guessFromLanguage(['de-DE'])).toBe('qwertz')
    expect(guessFromLanguage(['de'])).toBe('qwertz')
    expect(guessFromLanguage(['en-US'])).toBe('qwerty')
    expect(guessFromLanguage([])).toBe('qwerty')
  })

  it('an AZERTY key press relabels the keys: KeyW reads Z, KeyA reads Q', () => {
    expect(keyLabel('KeyW')).toBe('W')
    press('KeyW', 'z')
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyW')).toBe('Z')
    expect(keyLabel('KeyA')).toBe('Q')
    expect(keyLabel('KeyQ')).toBe('A')
  })

  it('typing outranks the language guess', () => {
    keyboard.detected = 'azerty'
    keyboard.source = 'language'
    press('KeyW', 'w')
    expect(keyboard.detected).toBe('qwerty')
  })

  it('typing also overrides the layout map: the OS layout can switch after it was read', () => {
    keyboard.detected = 'qwerty'
    keyboard.source = 'map'
    press('KeyW', 'z')
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyA')).toBe('Q') // no mixed "Z A S D"
  })

  it('digits stay digits (AZERTY prints & é " unshifted)', () => {
    press('KeyW', 'z')
    expect(keyLabel('Digit1')).toBe('1')
    expect(keyLabel('Numpad2')).toBe('2')
  })

  it('auto-detect off: the picked layout names the keys, whatever was typed', () => {
    press('KeyW', 'z')
    setAutoLayout(false)
    setManualLayout('qwertz')
    expect(activeLayout.value).toBe('qwertz')
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('KeyY')).toBe('Z')
    setManualLayout('qwerty')
    expect(keyLabel('KeyY')).toBe('Y')
  })
})

/** Every action's main key as each layout prints it (the HUD's keycaps). */
const PRINTED: Record<Layout, Partial<Record<(typeof ACTIONS)[number], string>>> = {
  qwerty: { forward: 'W', back: 'S', left: 'A', right: 'D', interact: 'E', beam: 'B', tank: 'H', map: 'M' },
  qwertz: { forward: 'W', back: 'S', left: 'A', right: 'D', interact: 'E', beam: 'B', tank: 'H', map: 'M' },
  azerty: { forward: 'Z', back: 'S', left: 'Q', right: 'D', interact: 'E', beam: 'B', tank: 'H', map: ',' },
  dvorak: { forward: ',', back: 'O', left: 'A', right: 'E', interact: '.', beam: 'X', tank: 'D', map: 'M' },
  colemak: { forward: 'W', back: 'R', left: 'A', right: 'S', interact: 'F', beam: 'B', tank: 'H', map: 'M' },
  turkishF: { forward: 'G', back: 'İ', left: 'U', right: 'E', interact: 'Ğ', beam: 'Ç', tank: 'T', map: 'S' }
}
/** Keys no layout renames: named keys and digits. */
const SAME = { slide: '␣', block: '⇧', turnLeft: '←', turnRight: '→', target: '⇥', weapon1: '1', weapon2: '2', weapon3: '3' }

describe('every layout names every action\'s key', () => {
  for (const l of LAYOUTS) {
    it(`${l}: picked in Options`, () => {
      setAutoLayout(false)
      setManualLayout(l)
      for (const a of ACTIONS) {
        const want = PRINTED[l][a] ?? SAME[a as keyof typeof SAME]
        expect(actionKeyLabel(DEFAULT_BINDINGS[a][0]!), `${l} ${a}`).toBe(want)
      }
    })
  }

  it('one telling key settles Dvorak, Colemak and Turkish F: the rest is named before it is pressed', () => {
    press('KeyW', ',')
    expect(keyboard.detected).toBe('dvorak')
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(keyLabel)).toEqual([',', 'A', 'O', 'E'])
    __resetKeyboardForTests()
    press('KeyS', 'r')
    expect(keyboard.detected).toBe('colemak')
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].map(keyLabel)).toEqual(['W', 'A', 'R', 'S', 'F'])
    __resetKeyboardForTests()
    press('KeyQ', 'f')
    expect(keyboard.detected).toBe('turkishF')
    expect(['KeyW', 'KeyS', 'KeyE', 'KeyB'].map(keyLabel)).toEqual(['G', 'İ', 'Ğ', 'Ç'])
  })

  it('a key two layouts share does not flip between them (Colemak\'s W is QWERTY\'s W)', () => {
    press('KeyS', 'r')
    press('KeyW', 'w')
    press('KeyA', 'a')
    expect(keyboard.detected).toBe('colemak')
    expect(keyLabel('KeyD')).toBe('S')
  })

  it('a switch picks the layout that fits the most of what was typed', () => {
    // German QWERTZ: E, W, then the Z key (KeyY) — QWERTY believed until then.
    press('KeyE', 'e')
    press('KeyW', 'w')
    expect(keyboard.detected).toBe(null)
    press('KeyY', 'z')
    expect(keyboard.detected).toBe('qwertz')
    expect(keyLabel('KeyZ')).toBe('Y')
  })

  it('a Russian or Greek letter is never learned: the keycap\'s Latin letter stays', () => {
    press('KeyW', 'ц')
    press('KeyA', 'α')
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('KeyA')).toBe('A')
  })

  it('a Latin layout\'s own key is learned (Spanish Ñ), the layout kept', () => {
    press('Semicolon', 'ñ')
    expect(keyLabel('Semicolon')).toBe('Ñ')
    expect(keyboard.detected).toBe(null)
  })

  it('Shift, Ctrl and AltGr presses teach nothing (they type another character)', () => {
    observeKey({ code: 'KeyW', key: 'Z', ctrlKey: false, altKey: false, metaKey: false, shiftKey: true })
    observeKey({ code: 'KeyQ', key: '@', ctrlKey: true, altKey: true, metaKey: false })
    expect(keyboard.detected).toBe(null)
    expect(keyLabel('KeyW')).toBe('W')
  })
})

describe('the Keyboard API layout map', () => {
  const nav = navigator as Navigator & { keyboard?: unknown }
  const withMap = (layout: Record<string, string> | 'refused' | 'absent') => {
    const kb = layout === 'absent' ? undefined : {
      getLayoutMap: () => (layout === 'refused' ? Promise.reject(new Error('keyboard-map')) : Promise.resolve(new Map(Object.entries(layout))))
    }
    Object.defineProperty(nav, 'keyboard', { configurable: true, value: kb })
  }
  const lang = (l: string) => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: [l] })
  }
  afterEach(() => {
    Object.defineProperty(nav, 'keyboard', { configurable: true, value: undefined })
    lang('en-US')
  })

  it('a Dvorak map names every key exactly, and settles the layout', async () => {
    withMap({ KeyQ: "'", KeyW: ',', KeyE: '.', KeyR: 'p', KeyA: 'a', KeyS: 'o', KeyD: 'e', KeyH: 'd', KeyB: 'x', KeyM: 'm', Comma: 'w' })
    await loadKeyboardLayout()
    expect(keyboard.detected).toBe('dvorak')
    expect(keyboard.source).toBe('map')
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyH', 'Comma'].map(keyLabel)).toEqual([',', 'A', 'O', 'E', '.', 'D', 'W'])
  })

  it('a Russian map keeps the Latin letters its keycaps also print', async () => {
    withMap({ KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyY: 'н', KeyA: 'ф', Semicolon: 'ж' })
    await loadKeyboardLayout()
    expect(['KeyW', 'KeyA', 'KeyY'].map(keyLabel)).toEqual(['W', 'A', 'Y'])
  })

  it('refused (an embed\'s permissions policy): the language guesses, typing corrects', async () => {
    lang('en-US')
    withMap('refused')
    await loadKeyboardLayout()
    expect(keyboard.detected).toBe('qwerty')
    expect(keyboard.source).toBe('language')
    // A French player on an English browser: the first Z press.
    press('KeyW', 'z')
    expect(keyboard.detected).toBe('azerty')
    expect(actionKeyLabel('KeyA')).toBe('Q')
  })

  it('absent (Firefox, Safari): a German browser starts on QWERTZ', async () => {
    lang('de-DE')
    withMap('absent')
    await loadKeyboardLayout()
    expect(keyboard.detected).toBe('qwertz')
    expect(keyLabel('KeyY')).toBe('Z')
  })

  it('typed before the map came back: the typing stands', async () => {
    let resolve!: (m: Map<string, string>) => void
    Object.defineProperty(nav, 'keyboard', { configurable: true, value: { getLayoutMap: () => new Promise(r => { resolve = r }) } })
    const loading = loadKeyboardLayout()
    press('KeyW', 'z')
    resolve(new Map([['KeyW', 'w'], ['KeyY', 'y']]))
    await loading
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyW')).toBe('Z')
  })
})

describe('labels are live: what is drawn follows the detection as it lands', () => {
  it('a keycap computed before any detection re-reads when a key is typed, the map lands or a key is rebound', async () => {
    const forward = computed(() => actionKeyLabel('KeyW'))
    const slide = computed(() => actionKeyLabel('Space'))
    expect(forward.value).toBe('W')
    press('KeyW', 'z')
    expect(forward.value).toBe('Z')
    __resetKeyboardForTests()
    expect(forward.value).toBe('W')
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true, value: { getLayoutMap: () => Promise.resolve(new Map([['KeyW', ','], ['KeyS', 'o']])) }
    })
    await loadKeyboardLayout()
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: undefined })
    expect(forward.value).toBe(',')
    bindKey('forward', 'ArrowUp')
    expect(forward.value).toBe('↑')
    bindKey('slide', 'KeyC')
    expect(slide.value).toBe('J')
    setAutoLayout(false)
    setManualLayout('qwerty')
    expect(slide.value).toBe('C')
  })
})

describe('input follows the bindings', () => {
  let surface: HTMLDivElement
  let input: Input
  let detach: () => void
  const key = (type: 'keydown' | 'keyup', code: string, k = '') =>
    window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true }))

  beforeEach(() => {
    surface = document.createElement('div')
    document.body.appendChild(surface)
    input = createInput()
    detach = attachInput(surface, input, { fireMode: () => false, canLock: () => true })
  })
  afterEach(() => {
    detach()
    surface.remove()
  })

  it('a rebound key drives the action, and the old key no longer does', () => {
    bindKey('interact', 'KeyG')
    key('keydown', 'KeyG', 'g')
    expect(input.interactQueued).toBe(true)
    input.interactQueued = false
    key('keyup', 'KeyG')
    key('keydown', 'KeyE', 'e')
    expect(input.interactQueued).toBe(false)
  })

  it('rebound movement moves', () => {
    bindKey('forward', 'KeyI')
    key('keydown', 'KeyI', 'i')
    expect(input.moveY).toBeGreaterThan(0)
    key('keyup', 'KeyI')
    expect(input.moveY).toBe(0)
  })

  it('Esc always pauses', () => {
    key('keydown', 'Escape', 'Escape')
    expect(input.pauseQueued).toBe(true)
  })

  it('a key press in the game teaches the layout', () => {
    key('keydown', 'KeyW', 'z')
    expect(keyLabel('KeyW')).toBe('Z')
  })
})
