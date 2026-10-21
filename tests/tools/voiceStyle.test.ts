// The written delivery an engine is given for a line (tools/voice/style.mjs).
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs tool module, no types
import { styleFor } from '../../tools/voice/style.mjs'
// @ts-expect-error plain .mjs tool module, no types
import { MODEL_ID, VOICES, VOICE_IDS, speakApi, tagFor } from '../../tools/voice/engines/elevenlabs.mjs'
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

describe('ElevenLabs by API key', () => {
  it('has an API voice id for every speaker the web desk voices', () => {
    for (const name of Object.values(VOICES)) expect(VOICE_IDS[name as keyof typeof VOICE_IDS], name).toMatch(/^\w{20}$/)
  })

  it("posts the line to the voice with the web desk's model and the voice's own settings", async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const fake = async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }
    const mp3 = await speakApi('sk_test', 'bIHbv24MWmeRgasZH58o', '[calm] Hi.', fake as typeof fetch)
    expect([...mp3]).toEqual([1, 2, 3])
    expect(seen!.url).toContain('/v1/text-to-speech/bIHbv24MWmeRgasZH58o')
    const body = JSON.parse(String(seen!.init.body))
    expect(body).toEqual({ text: '[calm] Hi.', model_id: MODEL_ID })
    expect((seen!.init.headers as Record<string, string>)['xi-api-key']).toBe('sk_test')
  })

  it('never puts the key in an error', async () => {
    const fake = async () => new Response('bad key sk_abcDEF123', { status: 401 })
    await expect(speakApi('sk_abcDEF123', 'x', 'Hi.', fake as unknown as typeof fetch)).rejects.toThrow(/^ElevenLabs API 401: bad key <key>$/)
  })
})

