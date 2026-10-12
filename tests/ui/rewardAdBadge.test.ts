import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// One rewarded-ad mark everywhere (playtest 2026-10-11): every component that
// plays a rewarded video (`claimReward`) signs its button with the clapper on
// the dark chip, `RewardAdBadge` — directly or through the result screen's
// `TripleOffer` — and never the plain camera glyph that some used to carry.
const ROOT = join(__dirname, '../../src')

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : []
  })

describe('the rewarded-ad mark', () => {
  const files = vueFiles(ROOT)
  const rewarded = files.filter(f => /\bclaimReward\b/.test(readFileSync(f, 'utf8')))

  it('is found at all', () => {
    expect(rewarded.length).toBeGreaterThanOrEqual(4)
  })

  it('every rewarded button carries RewardAdBadge, never the camera glyph', () => {
    for (const f of [...rewarded, join(ROOT, 'components/molecules/TripleOffer.vue')]) {
      const s = readFileSync(f, 'utf8')
      expect(/RewardAdBadge|TripleOffer/.test(s), f).toBe(true)
      expect(/(name|icon)="video"/.test(s), f).toBe(false)
    }
  })
})
