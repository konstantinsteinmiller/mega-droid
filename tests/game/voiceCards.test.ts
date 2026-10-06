// The voice cards and line tones the voice-over pipeline reads
// (`src/game/audio/voiceCards.ts`): every catalogue line has exactly one
// tone, and every card can be handed to a voice-design model as it stands.
import { describe, expect, it } from 'vitest'
import { VOICE_DETAIL, SPEAKERS } from '@/game/audio/voiceCatalog'
import { VOICE_LINES } from '@/game/audio/voiceLines'
import { CARDS, TONES, TONES_LIST, toneOf } from '@/game/audio/voiceCards'

describe('the voice cards', () => {
  it('gives every detailed line one known tone, in catalogue order, and names no other line', () => {
    const keys = VOICE_DETAIL.map(l => l.key)
    expect(Object.keys(TONES)).toEqual(keys)
    for (const k of keys) expect(TONES_LIST, k).toContain(TONES[k])
  })

  it('gives every voice line a known tone, a derived line its section\'s', () => {
    for (const l of VOICE_LINES) expect(TONES_LIST, l.key).toContain(toneOf(l))
  })

  it('never has Atlas shout: its tense lines are urgent', () => {
    for (const l of VOICE_LINES) if (l.speaker === 'atlas') expect(toneOf(l), l.key).not.toBe('shout')
  })

  it('has a card per speaker, with a design prompt and a reference text in every voiced language', () => {
    expect(Object.keys(CARDS).sort()).toEqual(Object.keys(SPEAKERS).sort())
    for (const [id, c] of Object.entries(CARDS)) {
      for (const lang of ['en', 'de', 'es', 'zh'] as const) {
        expect(c.designPrompt[lang].length, `${id} ${lang}`).toBeGreaterThan(lang === 'zh' ? 40 : 60)
        // ~10–14 s read aloud: roughly 25–45 words, or 50–90 Chinese characters
        if (lang === 'zh') {
          const chars = [...c.referenceText.zh.matchAll(/\p{Script=Han}/gu)].length
          expect(chars, `${id} zh reference`).toBeGreaterThan(45)
          expect(chars, `${id} zh reference`).toBeLessThan(90)
        } else {
          const words = c.referenceText[lang].split(/\s+/).length
          expect(words, `${id} ${lang} reference`).toBeGreaterThan(20)
          expect(words, `${id} ${lang} reference`).toBeLessThan(50)
        }
      }
    }
  })

  it('asks the model for a human voice: the robot sound is the FX chain\'s job', () => {
    for (const [id, c] of Object.entries(CARDS)) {
      for (const p of Object.values(c.designPrompt)) {
        expect(p, id).not.toMatch(/robot|synthetic|metallic|android|roboter|synthetisch|metallisch|sintétic|metálic|androide|机器|合成|金属/i)
      }
    }
  })
})
