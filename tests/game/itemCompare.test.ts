// A found item against what it would replace (src/game/data/itemCompare.ts):
// every stat that changes, signed, and the upgrade verdict the loot card and
// the results screen show.

import { describe, expect, it } from 'vitest'
import { compareItems, deltaChips, itemStats, rivalFor } from '@/game/data/itemCompare'
import type { Item } from '@/game/data/items'

const item = (over: Partial<Item>): Item => ({
  id: 'x', base: 'helm_scout', slot: 'helmet', rarity: 'standard', ilvl: 1, upg: 0, affixes: [], ...over
})

describe('item stats', () => {
  it('sums the main stat, the implicit and the rolled affixes', () => {
    const s = itemStats(item({ base: 'helm_guard', affixes: [{ id: 'hp', v: 5 }, { id: 'crit', v: 0.03 }] }))
    expect(s.get('armor')).toBeGreaterThan(0)
    expect(s.get('hp')).toBe(8 + 5) // implicit 8 + rolled 5
    expect(s.get('crit')).toBeCloseTo(0.03)
  })

  it('a buster gives damage, a chip no main stat', () => {
    expect(itemStats(item({ base: 'arm_standard', slot: 'buster' })).has('damage')).toBe(true)
    const chip = itemStats(item({ base: 'chip_logic', slot: 'chip', affixes: [{ id: 'bolts', v: 0.1 }] }))
    expect(chip.has('damage') || chip.has('armor')).toBe(false)
  })
})

describe('the comparison', () => {
  it('a higher-level piece is an upgrade, with the main stat going up first', () => {
    const old = item({ ilvl: 1 })
    const found = item({ ilvl: 8, rarity: 'tuned', affixes: [{ id: 'hp', v: 9 }] })
    const c = compareItems(found, old)
    expect(c.upgrade).toBe(true)
    expect(c.lines[0]!.key).toBe('armor')
    expect(c.lines[0]!.delta).toBeGreaterThan(0)
    expect(c.lines.find(l => l.key === 'hp')?.delta).toBe(9)
  })

  it('what the old piece had and the new one lacks shows as a loss', () => {
    const old = item({ ilvl: 5, affixes: [{ id: 'crit', v: 0.04 }] })
    const found = item({ ilvl: 5 })
    const c = compareItems(found, old)
    expect(c.lines).toEqual([{ key: 'crit', delta: -0.04 }])
    expect(c.upgrade).toBe(false)
  })

  it('a weaker piece is not an upgrade; an identical one changes nothing', () => {
    expect(compareItems(item({ ilvl: 1 }), item({ ilvl: 6 })).upgrade).toBe(false)
    const same = compareItems(item({}), item({ id: 'y' }))
    expect(same.lines).toEqual([])
    expect(same.upgrade).toBe(false)
  })

  it('an empty slot: always an upgrade, every stat a gain', () => {
    const c = compareItems(item({ affixes: [{ id: 'we', v: 3 }] }), null)
    expect(c.upgrade).toBe(true)
    expect(c.lines.every(l => l.delta > 0)).toBe(true)
  })
})

describe('the rival', () => {
  const helm = item({ id: 'h' })
  const weak = item({ id: 'c1', base: 'chip_logic', slot: 'chip', affixes: [{ id: 'bolts', v: 0.06 }] })
  const strong = item({ id: 'c2', base: 'chip_logic', slot: 'chip', rarity: 'legendary', affixes: [{ id: 'crit', v: 0.05 }, { id: 'we', v: 4 }] })
  const chip = item({ id: 'n', base: 'chip_logic', slot: 'chip' })

  it('armour meets the piece in its slot', () => {
    expect(rivalFor(item({}), s => (s === 'helmet' ? helm : null))).toBe(helm)
  })

  it('a chip meets the weaker socket, or nothing while one is free', () => {
    expect(rivalFor(chip, s => (s === 'chip1' ? weak : s === 'chip2' ? strong : null))).toBe(weak)
    expect(rivalFor(chip, s => (s === 'chip2' ? strong : null))).toBeNull()
  })
})

describe('the loot card chips (#158)', () => {
  it('gains lead; a lower main stat is not the headline', () => {
    const old = item({ ilvl: 9 })
    const found = item({ ilvl: 2, affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }] })
    const c = compareItems(found, old)
    expect(c.lines[0]!.key).toBe('armor')
    const { shown, hidden } = deltaChips(c, 3)
    expect(hidden).toBe(0)
    expect(shown.map(l => l.key)).toEqual(['hp', 'we', 'armor'])
    expect(shown[2]!.delta).toBeLessThan(0)
  })

  it('one line over the cap is shown, never a lone "+1 more"', () => {
    const found = item({ affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }, { id: 'crit', v: 0.02 }] })
    const c = compareItems(found, null)
    expect(c.lines).toHaveLength(4)
    expect(deltaChips(c, 3)).toEqual({ shown: c.lines, hidden: 0 })
    const more = compareItems(item({ affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }, { id: 'crit', v: 0.02 }, { id: 'bolts', v: 0.05 }] }), null)
    const chips = deltaChips(more, 3)
    expect(chips.shown).toHaveLength(3)
    expect(chips.hidden).toBe(2)
  })
})
