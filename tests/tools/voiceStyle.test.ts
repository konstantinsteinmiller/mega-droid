// The written delivery an engine is given for a line (tools/voice/style.mjs).
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs tool module, no types
import { styleFor } from '../../tools/voice/style.mjs'
// @ts-expect-error plain .mjs tool module, no types
import { tagFor } from '../../tools/voice/engines/elevenlabs.mjs'
// @ts-expect-error plain .mjs tool module, no types
import { normalize } from '../../tools/voice/normalize.mjs'

const job = { lang: 'en', direction: 'Worried, quick, not loud.', tone: 'urgent', situation: 'Health under 30 %', emphasis: [], max: 3 }

describe('the delivery a line is spoken with', () => {
  it('carries the direction, the tone, the situation and the length', () => {
    expect(styleFor(job)).toBe('Worried, quick, not loud. Tone: urgent. Situation: Health under 30 %. Brisk, 3 seconds at most.')
  })

  it('names the shouted words, and speaks German to a German line', () => {
    const de = styleFor({ ...job, lang: 'de', direction: 'Besorgt.', emphasis: ['blaze', 'master'] })
    expect(de).toContain('Betont: blaze, master.')
    expect(de).toContain('höchstens 3 Sekunden')
  })

  it('gives ElevenLabs the tone word alone: a clause in the tag was read out loud', () => {
    expect(tagFor('The score so far, with a hint of pride.', 'warm')).toBe('[warm] ')
    expect(tagFor('Worried, quick, not loud.', 'urgent')).toBe('[urgent] ')
    expect(tagFor('A full boxing-announcer build.', 'neutral')).toBe('')
    expect(tagFor('', 'neutral')).toBe('')
  })

  it('brings the first clause back on request (EL_TAG=clause), for a listening test', () => {
    process.env.EL_TAG = 'clause'
    try {
      expect(tagFor('Soft: the first words he ever hears. Warm on "Flux".', 'warm')).toBe('[warm, soft] ')
      expect(tagFor('A full boxing-announcer build.', 'neutral')).toBe('[a full boxing-announcer build] ')
    } finally {
      delete process.env.EL_TAG
    }
  })

  it('says Vex\'s first body as a word, in each language', () => {
    expect(normalize('Dr. Vex Mk-I can\'t hide.', 'en').text).toBe('Dr. Vex Mark One can\'t hide.')
    expect(normalize('Dr. Vex Mk-I ist da.', 'de').text).toBe('Dr. Vex Mark Eins ist da.')
  })
})
