// The ending, "First Free Morning" (#102): about a minute and a half of film,
// a line every few seconds, then the credits and the end card; a tap jumps to
// the next line, Skip to the card.

import { describe, expect, it } from 'vitest'
import { CAPTIONS, CAPTION_HOLD, CARD_FROM, CREDITS_FROM, captionAt, nextBeat, shotAt } from '@/game/story/endingScript'
import en from '@/i18n/locales/en'
import { VOICE_LINES } from '@/game/audio/voiceLines'

describe('the ending script', () => {
  it('runs the valley, the lab and the sunrise, then the credits and the card, near two minutes in all', () => {
    expect(shotAt(0)).toBe('valley')
    expect(shotAt(20)).toBe('lab')
    expect(shotAt(45)).toBe('sunrise')
    expect(CREDITS_FROM).toBeGreaterThan(50)
    expect(CARD_FROM).toBeGreaterThanOrEqual(90)
    expect(CARD_FROM).toBeLessThanOrEqual(130)
  })

  it('holds every line long enough to read, never two at once, all before the credits', () => {
    for (let n = 1; n < CAPTIONS.length; n++) expect(CAPTIONS[n]!.at - CAPTIONS[n - 1]!.at).toBeGreaterThanOrEqual(CAPTION_HOLD - 0.01)
    expect(CAPTIONS.at(-1)!.at + CAPTION_HOLD).toBeLessThanOrEqual(CREDITS_FROM)
    expect(captionAt(CAPTIONS[2]!.at + 1)?.key).toBe(CAPTIONS[2]!.key)
    expect(captionAt(CREDITS_FROM + 1)).toBeNull()
  })

  it('a tap jumps to the next line, and after the last one to the credits', () => {
    expect(nextBeat(0)).toBe(CAPTIONS[0]!.at)
    expect(nextBeat(CAPTIONS[1]!.at)).toBe(CAPTIONS[2]!.at)
    expect(nextBeat(CAPTIONS.at(-1)!.at + 0.1)).toBe(CREDITS_FROM)
  })

  it('every line, speaker and card string exists in English', () => {
    const e = (en as unknown as { ending: Record<string, unknown> }).ending
    for (const c of CAPTIONS) {
      expect(typeof e[c.key], c.key).toBe('string')
      if (c.speaker) expect(typeof (e.speaker as Record<string, string>)[c.speaker]).toBe('string')
    }
    for (const k of ['title', 'promise', 'ngplus', 'lab', 'confirm', 'confirmBody']) expect(typeof (e.card as Record<string, string>)[k], k).toBe('string')
  })

  it('every line is spoken: a narrator line by Pip, each a live voice line of its speaker (a playtest heard a silent outro)', () => {
    for (const c of CAPTIONS) {
      expect(c.speaker, c.key).not.toBe('')
      const v = VOICE_LINES.find(l => l.key === `ending.${c.key}`)
      expect(v?.status, c.key).toBe('live')
      expect(v?.speaker, c.key).toBe(c.speaker)
    }
    for (const k of ['fall', 'relays', 'thaw', 'morning']) expect(CAPTIONS.find(c => c.key === k)?.speaker).toBe('pip')
  })
})
