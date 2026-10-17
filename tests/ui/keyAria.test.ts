// Screen-reader key sentences (components/hud/keyAria.ts): the pause menu's
// controls list, the coach's hints and the lessons speak the player's keys —
// their keyboard's letters and their rebindings — never hard-coded US letters.

import { beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
import { keyAriaParams, spokenKey } from '@/components/hud/keyAria'
import { bindKey, __resetBindingsForTests } from '@/game/engine/keyBindings'
import { observeKey, __resetKeyboardForTests } from '@/game/engine/keyLabels'

const tFor = (locale: 'en' | 'de') => {
  const i18n = createI18n({ legacy: false, locale, messages: { en, de } as Record<string, never> })
  return i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string
}
const press = (code: string, key: string) => observeKey({ code, key, ctrlKey: false, altKey: false, metaKey: false })

beforeEach(() => {
  __resetBindingsForTests()
  __resetKeyboardForTests()
})

describe('spoken keys', () => {
  it('US defaults read as before', () => {
    const t = tFor('en')
    const p = keyAriaParams(t)
    expect(t('pause.keys.move', p)).toBe('WASD / arrows: move.')
    expect(t('pause.keys.slide', p)).toBe('Space: slide · H: Repair Gel · E: interact · B: beam out')
    // #174: Q fires the first special weapon too, and is spoken with the 1.
    expect(t('pause.keys.more', p)).toBe('1 or Q / 2: special weapons · Tab: switch target · Esc: pause')
    expect(t('tips.dodgeKeys', keyAriaParams(t, 'tips.spaceKey'))).toContain('press Space to slide')
  })

  it('an AZERTY keyboard hears Z Q S D', () => {
    const t = tFor('en')
    press('KeyW', 'z')
    press('KeyA', 'q')
    expect(t('tips.moveKeys', keyAriaParams(t))).toBe('ZQSD to move around.')
  })

  it('a rebound key is spoken by its new letter, the space bar by its name', () => {
    const t = tFor('en')
    bindKey('tank', 'KeyG')
    bindKey('slide', 'KeyC')
    const p = keyAriaParams(t)
    expect(t('pause.keys.slide', p)).toBe('C: slide · G: Repair Gel · E: interact · B: beam out')
    expect(t('lesson.gelKeys', { key: spokenKey(t, 'KeyH') })).toContain('Press G')
  })

  it('the Q alternate follows the layout and drops out once rebound away (#174)', () => {
    const t = tFor('de')
    press('KeyQ', 'a')
    expect(keyAriaParams(t).w1).toBe('1 oder A')
    bindKey('beam', 'KeyQ')
    expect(keyAriaParams(t).w1).toBe('1')
  })

  it('the space bar is named in the language, inflected where the sentence needs it', () => {
    const t = tFor('de')
    expect(t('pause.keys.slide', keyAriaParams(t))).toMatch(/^Leertaste:/)
    expect(t('tips.dodgeKeys', keyAriaParams(t, 'tips.spaceKey'))).toContain('drück die Leertaste')
  })
})
