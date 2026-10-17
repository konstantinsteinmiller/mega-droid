import { boundCode, shownAltCode } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'

type T = (key: string, params?: Record<string, unknown>) => string

/**
 * The keys a screen-reader sentence names, as the player's keyboard and
 * bindings have them: "Z Q S D" on AZERTY, "G" once Repair Gel is rebound.
 * The sentences (`tips.moveKeys`, `tips.dodgeKeys`, `pause.keys.*`) take
 * these as placeholders instead of hard-coded US letters.
 *
 * Named keys are spoken by name, not by the symbol a keycap draws (a reader
 * saying "open box" for ␣ helps nobody): the space bar in the language's own
 * word — `spaceKey` picks the form the sentence needs (`tips.spaceKey` is
 * inflected where the grammar asks for it) — and the rest by their English
 * names, which is what their keycaps print on every layout.
 */
const NAMES: Record<string, string> = {
  Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt'
}

export const spokenKey = (t: T, defaultCode: string, spaceKey = 'pause.keys.space'): string => {
  const c = boundCode(defaultCode)
  if (c === 'Space') return t(spaceKey)
  return NAMES[c] ?? keyLabel(c)
}

/** A key and its taught alternate, if it has one: "1 or Q" (#174). */
export const spokenKeys = (t: T, defaultCode: string, spaceKey = 'pause.keys.space'): string => {
  const a = spokenKey(t, defaultCode, spaceKey)
  const alt = shownAltCode(defaultCode)
  return alt ? t('pause.keys.either', { a, b: NAMES[alt] ?? keyLabel(alt) }) : a
}

/** Every placeholder the key sentences use. */
export const keyAriaParams = (t: T, spaceKey = 'pause.keys.space'): Record<string, string> => {
  const move = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(c => spokenKey(t, c, spaceKey))
  return {
    keys: move.every(k => [...k].length === 1) ? move.join('') : move.join(' '),
    slide: spokenKey(t, 'Space', spaceKey),
    tank: spokenKey(t, 'KeyH', spaceKey),
    use: spokenKey(t, 'KeyE', spaceKey),
    beam: spokenKey(t, 'KeyB', spaceKey),
    w1: spokenKeys(t, 'Digit1', spaceKey),
    w2: spokenKey(t, 'Digit2', spaceKey),
    target: spokenKey(t, 'Tab', spaceKey),
    // The controls list's turn row: "Turn (← →)" — or its rebound keys.
    turn: `${spokenKey(t, 'ArrowLeft', spaceKey)} ${spokenKey(t, 'ArrowRight', spaceKey)}`
  }
}
