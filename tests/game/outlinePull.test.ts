import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sph, torus, halfThickness, pullFor, tagOutlinePull } from '@/game/models/kit'
import { buildHero } from '@/game/models/hero'
import { buildPip } from '@/game/models/npc'
import { buildEnemyRig } from '@/game/models/enemies'

// ─── #140: the toon outline where parts meet ─────────────────────────────────
//
// The inverted hull's rim is its far side, so anything reaching into a part's
// back half (a shin into its boot cuff, Pip's eye socket into the round body)
// covered the line. Each hull vertex now slides toward the eye by part of the
// part's LOCAL half-thickness — enough to win over what pokes in from behind,
// short of the part's own nearest face.

describe('the local half-thickness', () => {
  it('a ball reads near its radius everywhere, never more (the safe side)', () => {
    const half = halfThickness(sph(0.2, 14, 10))
    for (const h of half) {
      expect(h).toBeGreaterThan(0.1)
      expect(h).toBeLessThanOrEqual(0.2 + 1e-6)
    }
  })

  it('a tube ring reads its tube, not the ring across', () => {
    const half = halfThickness(torus(0.3, 0.03, 8, 24))
    for (const h of half) {
      expect(h).toBeGreaterThan(0.015)
      expect(h).toBeLessThan(0.045)
    }
  })
})

describe('the pull', () => {
  it('stays short of the part middle, and of a big round rim', () => {
    for (const half of [0.005, 0.02, 0.06, 0.2, 0.5]) {
      const p = pullFor(half, 0.014)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(half)
      expect(p).toBeLessThanOrEqual(1.4 * Math.sqrt(half * 0.014) + 1e-9)
    }
    expect(pullFor(0, 0.014)).toBe(0)
  })

  it('is the same for the same shape (the spawn cache) and lands on every vertex', () => {
    const a = tagOutlinePull(sph(0.1), 0.02).attributes.outlinePull!
    const b = tagOutlinePull(sph(0.1), 0.02).attributes.outlinePull!
    expect(Array.from(b.array)).toEqual(Array.from(a.array))
    expect(a.count).toBe(sph(0.1).attributes.position!.count)
  })

  it('Flux, Pip and the enemies carry it on their outline hull', () => {
    for (const rig of [buildHero(), buildPip(), buildEnemyRig('trooper'), buildEnemyRig('golem')]) {
      const pull = rig.outline!.geometry.attributes.outlinePull
      expect(pull).toBeDefined()
      expect(pull!.count).toBe(rig.outline!.geometry.attributes.position!.count)
      expect(Math.max(...Array.from(pull!.array))).toBeGreaterThan(0)
    }
  })

  it('the outline shader slides the hull along the view ray, rim only, and defaults to no pull', () => {
    const toon = readFileSync(resolve(__dirname, '../../src/game/models/toon.ts'), 'utf8')
    expect(toon).toMatch(/attribute float outlinePull;/)
    expect(toon).toMatch(/mvPosition\.xyz \+= toEye \* pull/)
    expect(toon).toMatch(/smoothstep\([^)]*facing\)/)
    expect(toon).toMatch(/\.outlinePull = \[0\]/)
  })
})
