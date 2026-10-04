// The story levels' authored chests (#115): the Blaze level's early chest
// holds a blue blaster, not a seed's legendary roll; the Frost level's puzzle
// alcove holds the legendary chassis beside the Repair Tank. Every seed and
// mirror keeps them.
import { describe, expect, it } from 'vitest'
import { generateMeltdown } from '@/game/world/stages/blaze'
import { generateGlacier } from '@/game/world/stages/cryo'
import { CELL } from '@/game/world/levelGen'

const SEEDS = [1, 7, 51940, 44021, 99991]

describe('story chests', () => {
  it('Blaze: one blue blaster, nothing legendary', () => {
    for (const seed of SEEDS) {
      const chests = generateMeltdown(seed).terrain!.chests!
      const authored = chests.filter(c => c.loot)
      expect(authored.map(c => c.loot)).toEqual([{ rarity: 'tuned', slot: 'buster', key: 'blaze.ember' }])
    }
  })

  it('Frost: the legendary chassis stands in the puzzle alcove, beside the tank', () => {
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
      const t = m.terrain!
      const secret = t.secrets![0]!
      const c = t.chests!.find(x => x.loot?.key === 'cryo.secret')!
      expect(c.loot).toEqual({ rarity: 'legendary', slot: 'chest', key: 'cryo.secret' })
      const k = Math.floor(c.z / CELL) * m.w + Math.floor(c.x / CELL)
      expect(secret.cells, `seed ${seed}`).toContain(k)
      expect(secret.prize).toBe('tank')
    }
  })
})
