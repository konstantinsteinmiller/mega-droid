import { describe, expect, it } from 'vitest'
import { bossTempoMul, nextBossTempo, tempoExempt } from '@/game/sim/bossTempo'

describe('boss tempo (#191)', () => {
  it('a fight under 15 s jumps to step 2', () => {
    expect(nextBossTempo(0, 12)).toBe(2)
    expect(bossTempoMul(2)).toEqual({ hp: 1.3, dmg: 1.15 })
  })
  it('a fight under 30 s raises to at least step 1, never lowers', () => {
    expect(nextBossTempo(0, 25)).toBe(1)
    expect(nextBossTempo(2, 25)).toBe(2)
    expect(bossTempoMul(1)).toEqual({ hp: 1.15, dmg: 1.07 })
  })
  it('within a minute the step holds; longer eases one step at a time', () => {
    expect(nextBossTempo(2, 55)).toBe(2)
    expect(nextBossTempo(2, 75)).toBe(1)
    expect(nextBossTempo(1, 90)).toBe(0)
    expect(nextBossTempo(0, 200)).toBe(0)
  })
  it('Vex and the Grand Master are outside it', () => {
    expect(tempoExempt('vexMk1')).toBe(true)
    expect(tempoExempt('grandMaster')).toBe(true)
    expect(tempoExempt('scrapper')).toBe(false)
  })
})
