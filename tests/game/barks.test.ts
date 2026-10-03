// Flux's barks (audio/barks.ts): what a hit sounds like, and when a bark
// gives way (a line playing, the gaps), so the yelps season the fight
// rather than drown it.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const speaking = { now: false }
const played: string[] = []
vi.mock('@/game/audio/voice', () => ({
  isSpeaking: () => speaking.now,
  prefetchVoice: () => 'none',
  playVoice: (id: string, channel: string) => { played.push(`${channel}:${id}`); return 0.4 }
}))

const { bark, barkFor, __resetBarks, BARK_GAP, TYPE_GAP } = await import('@/game/audio/barks')
const { VOICE_LINES } = await import('@/game/audio/voiceLines')

beforeEach(() => {
  __resetBarks()
  played.length = 0
  speaking.now = false
})

describe("Flux's barks", () => {
  it('names a hit by its hazard, then the attacker\'s element, then how hard it was', () => {
    expect(barkFor({ hazard: 'flame' })).toBe('fire')
    expect(barkFor({ hazard: 'crush', element: 'ice' })).toBe('crusher')
    expect(barkFor({ element: 'wind' })).toBe('wind')
    expect(barkFor({ element: 'none', hard: true })).toBe('heavy')
    expect(barkFor({})).toBe('light')
  })

  it('plays on the bark channel a line the catalog has, never the same take twice in a row', () => {
    const keys = new Set(VOICE_LINES.map(l => l.key))
    const ids = [0, 10, 20].map(t => bark('fire', t, () => 0))
    expect(ids.every(id => id && keys.has(id))).toBe(true)
    expect(ids[0]).not.toBe(ids[1])
    expect(played[0]).toMatch(/^bark:flux\.hurt\.fire\.[123]$/)
  })

  it('gives way: to a line being spoken, to the last bark, and to the same type just played', () => {
    speaking.now = true
    expect(bark('light', 0)).toBeNull()
    speaking.now = false
    expect(bark('light', 0)).not.toBeNull()
    expect(bark('heavy', BARK_GAP / 2)).toBeNull()
    expect(bark('heavy', BARK_GAP + 0.01)).not.toBeNull()
    expect(bark('light', BARK_GAP * 2 + 0.1)).toBeNull() // light waits TYPE_GAP
    expect(bark('light', TYPE_GAP + 0.01)).not.toBeNull()
  })

  it('always says the moments that matter: going down, falling in a pit', () => {
    speaking.now = true
    expect(bark('down', 0)).not.toBeNull()
    expect(bark('pit', 0.1)).not.toBeNull()
  })
})
