// The text a TTS model reads (tools/voice/normalize.mjs): numbers as words in
// the line's language, shouted capitals as words to stress, one ellipsis.
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs tool module, no types
import { normalize, numberWords } from '../../tools/voice/normalize.mjs'

describe('voice text normalisation', () => {
  it('spells numbers in the line\'s language', () => {
    expect(numberWords(13, 'en')).toBe('thirteen')
    expect(numberWords(31, 'en')).toBe('thirty-one')
    expect(numberWords(21, 'de')).toBe('einundzwanzig')
    expect(numberWords(31, 'de')).toBe('einunddreißig')
    expect(numberWords(100, 'de')).toBe('einhundert')
    expect(normalize('Sky Docks runs level 13 and up.', 'en').text).toBe('Sky Docks runs level thirteen and up.')
    expect(normalize('Himmelsdocks beginnt ab Stufe 13.', 'de').text).toBe('Himmelsdocks beginnt ab Stufe dreizehn.')
    expect(normalize('Health under 30 %', 'en').text).toBe('Health under thirty percent')
  })

  it('turns shouted capitals into words to stress, keeping names and word tails right', () => {
    expect(normalize('The oldest! The hottest! BLAZE MASTER!', 'en'))
      .toEqual({ text: 'The oldest! The hottest! Blaze Master!', emphasis: ['blaze', 'master'] })
    expect(normalize('Repelled? Me? Im-POSSIBLE!', 'en').text).toBe('Repelled? Me? Im-possible!')
    expect(normalize('Abgestoßen? Ich? Un-MÖGLICH!', 'de').text).toBe('Abgestoßen? Ich? Un-möglich!')
    expect(normalize('Who turned the lights ON?!', 'en').text).toBe('Who turned the lights On?!')
  })

  it('spells Spanish and Chinese numbers and per-cents as said, never in English', () => {
    expect(numberWords(21, 'es')).toBe('veintiuno')
    expect(numberWords(31, 'es')).toBe('treinta y uno')
    expect(numberWords(100, 'es')).toBe('cien')
    expect(numberWords(115, 'es')).toBe('ciento quince')
    expect(numberWords(11, 'zh')).toBe('十一')
    expect(numberWords(25, 'zh')).toBe('二十五')
    expect(numberWords(105, 'zh')).toBe('一百零五')
    expect(numberWords(115, 'zh')).toBe('一百一十五')
    expect(normalize('¡25 %! nivel 3', 'es').text).toBe('¡veinticinco por ciento! nivel tres')
    // Chinese says the per-cent first.
    expect(normalize('25%的伤害，3级', 'zh').text).toBe('百分之二十五的伤害，三级')
  })

  it('spells French numbers the French way (et un, soixante-dix, quatre-vingts)', () => {
    expect(numberWords(21, 'fr')).toBe('vingt et un')
    expect(numberWords(71, 'fr')).toBe('soixante et onze')
    expect(numberWords(77, 'fr')).toBe('soixante-dix-sept')
    expect(numberWords(80, 'fr')).toBe('quatre-vingts')
    expect(numberWords(81, 'fr')).toBe('quatre-vingt-un')
    expect(numberWords(99, 'fr')).toBe('quatre-vingt-dix-neuf')
    expect(numberWords(200, 'fr')).toBe('deux cents')
    expect(numberWords(205, 'fr')).toBe('deux cent cinq')
    expect(normalize('25 % de dégâts, niveau 3', 'fr').text).toBe('vingt-cinq pour cent de dégâts, niveau trois')
  })

  it('writes every ellipsis the same way', () => {
    expect(normalize('The cure… is ME!', 'en').text).toBe('The cure... is Me!')
  })
})
