// Run scaling: a Tower Run's and a supply run's machines follow Flux's level
// past the sector band and his kit — the arm's rarity, item level and
// upgrades, the armour, the chips — against the typical kit of his level
// (`sim/adaptive.ts` `runScaling`): an ordinarily progressed Flux meets the
// machines as designed, one ahead of the curve tougher ones. Story missions
// are untouched.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  runScaling, typicalPower, typicalEffectiveHp, effectiveHp, powerIndex, PROGRESS_HP, RUN_CAP, TYPICAL_ARM_LAG
} from '@/game/sim/adaptive'
import { simulate, REFERENCE } from '@/game/sim/balance'
import { profile, computeStats } from '@/game/state/profile'
import { ENEMIES, scaleHp, scaleDmg } from '@/game/data/enemies'
import { SECTORS, SECTOR_BY_ID, enemyLevelFor, runLevelFor } from '@/game/data/regions'
import { climbJob, rollJob, storyQuest, isBoardRun, rewardFor } from '@/game/data/quests'
import { MAX_LEVEL } from '@/game/data/progression'
import type { Item, Rarity } from '@/game/data/items'

interface Kit {
  rarity: Rarity
  /** Item level behind Flux's level (0: of his level). */
  lag: number
  upg: number
  armorRarity?: Rarity
  /** The armour's item-level lag (default: the arm's). */
  armorLag?: number
  armorUpg?: number
  /** Skill chips: Mega Charge, Frame. */
  mega?: number
  frame?: number
  /** Level-up points on health (default: one in three). */
  hp?: number
  /** A chip with a crit affix. */
  crit?: number
}

const item = (id: string, base: string, slot: Item['slot'], rarity: Rarity, ilvl: number, upg: number, affixes: Item['affixes'] = []): Item =>
  ({ id, base, slot, rarity, ilvl, upg, affixes })

/** Equip `k` on a level-`level` Flux and read his real stats. */
const wear = (level: number, k: Kit) => {
  const ilvl = Math.max(1, level - k.lag)
  const ai = Math.max(1, level - (k.armorLag ?? k.lag))
  const ar = k.armorRarity ?? k.rarity
  const au = k.armorUpg ?? 0
  const items = [
    item('b', 'arm_standard', 'buster', k.rarity, ilvl, k.upg),
    item('h', 'helm_scout', 'helmet', ar, ai, au),
    item('c', 'body_light', 'chest', ar, ai, au),
    item('f', 'boots_basic', 'boots', ar, ai, au),
    ...(k.crit ? [item('x', 'chip_logic', 'chip', 'standard', ilvl, 0, [{ id: 'crit', v: k.crit }])] : [])
  ]
  profile.level = level
  profile.inv.items = items
  profile.inv.equipped = { buster: 'b', helmet: 'h', chest: 'c', boots: 'f', chip1: k.crit ? 'x' : null, chip2: null }
  profile.hero.attrs = { hp: k.hp ?? Math.floor((level - 1) / 3), we: 0, power: 0 }
  profile.hero.skills = { ...(k.mega ? { megaCharge: k.mega } : {}), ...(k.frame ? { frame: k.frame } : {}) }
  return computeStats()
}

/** A fresh kit: the standard arm and armour of his level, nothing else. */
const FRESH: Kit = { rarity: 'standard', lag: 0, upg: 0 }
/** The typical kit (the balance model's player): a tuned arm found
 *  TYPICAL_ARM_LAG levels back, upgraded to level − 2, Mega Charge, the
 *  starter armour of the level before. */
const typical = (level: number): Kit => ({
  rarity: 'tuned', lag: TYPICAL_ARM_LAG, upg: Math.min(10, Math.max(0, level - 2)),
  armorRarity: 'standard', armorLag: 1, mega: Math.min(5, level - 1)
})
/** Ahead of the curve: a prototype arm of nearly his level, tuned and
 *  upgraded armour, a Frame chip from 20 and a crit chip from 10. */
const ahead = (level: number): Kit => ({
  rarity: 'prototype', lag: 2, upg: Math.min(10, Math.max(0, level - 2)), armorRarity: 'tuned', armorLag: 1,
  armorUpg: Math.floor(level / 5), mega: Math.min(5, level - 1), frame: level >= 20 ? 1 : 0, crit: level >= 10 ? 0.04 : 0
})
/** Everything maxed: legendary of his level, +10, every chip. */
const maxed: Kit = { rarity: 'legendary', lag: 0, upg: 10, armorUpg: 10, mega: 5, frame: 3, crit: 0.1 }

beforeEach(() => {
  profile.bolts = 0
  profile.hero.weapons = []
})

describe('run scaling', () => {
  it('the typical kit of any level gives ×1: an ordinary Flux meets the machines as designed', () => {
    for (const L of [1, 5, 15, 30, MAX_LEVEL]) {
      const s = wear(L, typical(L))
      expect(powerIndex(s), `L${L}`).toBeCloseTo(typicalPower(L), 5)
      expect(effectiveHp(s), `L${L}`).toBeCloseTo(typicalEffectiveHp(L), 5)
      expect(runScaling(s, L), `L${L}`).toEqual({ hp: 1, dmg: 1 })
    }
  })

  it('an under-geared or fresh Flux is never made easier than today', () => {
    expect(runScaling(wear(30, { rarity: 'standard', lag: 25, upg: 0, hp: 0 }), 30)).toEqual({ hp: 1, dmg: 1 })
    for (const L of [15, 30, MAX_LEVEL]) expect(runScaling(wear(L, FRESH), L).hp, `L${L}`).toBe(1)
  })

  it('tracks the balance model\'s player (its buster finds, upgrades and chips)', () => {
    // The model's arm comes in lumps (a find, then upgrades); the typical
    // kit is its smooth line, within these bounds wherever runs are offered.
    for (const r of simulate(REFERENCE, 1).filter(r => r.playerLevel >= 9)) {
      const k = typicalPower(r.playerLevel) / r.power
      expect(k, `L${r.playerLevel} ${r.arm}`).toBeGreaterThan(0.65)
      expect(k, `L${r.playerLevel} ${r.arm}`).toBeLessThan(1.5)
    }
  })

  it('rarity, item level, upgrades and damage chips each raise the health multiplier', () => {
    const L = 25
    // Just ahead of the typical kit, so each step shows above the floor.
    const base: Kit = { ...typical(L), rarity: 'prototype', lag: 2, upg: 5, mega: 4 }
    const hp = (k: Kit) => runScaling(wear(L, k), L).hp
    const h0 = hp(base)
    expect(h0).toBeGreaterThan(1)
    expect(hp({ ...base, rarity: 'legendary' })).toBeGreaterThan(h0)
    expect(hp({ ...base, lag: 0 })).toBeGreaterThan(h0)
    expect(hp({ ...base, upg: 9 })).toBeGreaterThan(h0)
    expect(hp({ ...base, mega: 5 })).toBeGreaterThan(h0)
    expect(hp({ ...base, crit: 0.1 })).toBeGreaterThan(h0)
  })

  it('armour rarity, item level, upgrades and health chips each raise the damage multiplier', () => {
    const L = 25
    const base: Kit = { ...typical(L), armorRarity: 'tuned', armorLag: 2, armorUpg: 2 }
    const dmg = (k: Kit) => runScaling(wear(L, k), L).dmg
    const d0 = dmg(base)
    expect(d0).toBeGreaterThan(1)
    expect(dmg({ ...base, armorRarity: 'legendary' })).toBeGreaterThan(d0)
    expect(dmg({ ...base, armorLag: 0 })).toBeGreaterThan(d0)
    expect(dmg({ ...base, armorUpg: 8 })).toBeGreaterThan(d0)
    expect(dmg({ ...base, frame: 2 })).toBeGreaterThan(d0)
    expect(dmg({ ...base, hp: 15 })).toBeGreaterThan(d0)
  })

  it('damps the surplus: an upgrade still kills faster and survives longer, up to the cap', () => {
    const L = 30
    const a = wear(L, ahead(L))
    const b = wear(L, { ...ahead(L), rarity: 'legendary', upg: 10, armorRarity: 'legendary', armorUpg: 8 })
    const ma = runScaling(a, L)
    const mb = runScaling(b, L)
    expect(mb.hp).toBeGreaterThan(ma.hp)
    expect(mb.dmg).toBeGreaterThan(ma.dmg)
    // Time to kill ∝ hp mul / power; hits to die ∝ effective hp / dmg mul.
    expect(mb.hp / powerIndex(b)).toBeLessThan(ma.hp / powerIndex(a))
    expect(effectiveHp(b) / mb.dmg).toBeGreaterThan(effectiveHp(a) / ma.dmg)
    const huge = runScaling({ busterDmg: 1e5, chargeDmgMul: 1, critChance: 0, critMul: 1.5, maxHp: 1e5, damageTakenMul: 0.1 }, L)
    expect(huge).toEqual({ hp: RUN_CAP, dmg: RUN_CAP })
  })

  it('a high-level, well-geared Flux meets tougher machines than a typical one of the same level', () => {
    for (const L of [15, 30, MAX_LEVEL]) {
      const norm = runScaling(wear(L, typical(L)), L)
      const geared = runScaling(wear(L, maxed), L)
      expect(geared.hp, `L${L}`).toBeGreaterThan(norm.hp * 1.3)
      expect(geared.dmg, `L${L}`).toBeGreaterThan(norm.dmg * 1.3)
      expect(runScaling(wear(L, ahead(L)), L).hp, `L${L}`).toBeGreaterThan(norm.hp)
    }
  })

  it('keeps a machine as hard for a Flux ahead of the curve as for a typical one, levels 10 to the cap', () => {
    // A brute (a Tower Run's mid-weight) of Flux's level, every Core Master
    // but Vex beaten; the shot rate is the balance model's (2.2 power/s).
    const foe = ENEMIES.brute
    const beaten = SECTORS.length - 1
    const fight = (L: number, k: Kit) => {
      const s = wear(L, k)
      const m = runScaling(s, L)
      return {
        m,
        ttk: (scaleHp(foe.hp, L) * (1 + PROGRESS_HP * beaten) * m.hp / foe.armor) / (powerIndex(s) * 2.2),
        hits: effectiveHp(s) / (scaleDmg(foe.dmg, L) * m.dmg)
      }
    }
    const rows: string[] = []
    const hits: number[] = []
    for (let L = 10; L <= MAX_LEVEL; L += 5) {
      const t = fight(L, typical(L))
      for (const [name, k] of [['ahead', ahead(L)], ['maxed', maxed]] as const) {
        const a = fight(L, k)
        rows.push(`L${L} ${name} hp×${a.m.hp.toFixed(2)} dmg×${a.m.dmg.toFixed(2)} ttk ${a.ttk.toFixed(2)}s (typical ${t.ttk.toFixed(2)}s) hits ${a.hits.toFixed(1)} (typical ${t.hits.toFixed(1)})`)
        // Better gear still pays (faster, sturdier), but damped: at most
        // ~25% off the typical time to kill, at most ~35% more hits.
        expect(a.ttk / t.ttk, rows.at(-1)).toBeLessThanOrEqual(1.0001)
        expect(a.ttk / t.ttk, rows.at(-1)).toBeGreaterThan(0.75)
        expect(a.hits / t.hits, rows.at(-1)).toBeGreaterThanOrEqual(0.9999)
        expect(a.hits / t.hits, rows.at(-1)).toBeLessThan(1.35)
      }
      hits.push(t.hits)
    }
    // The typical Flux's hits to die hold within a quarter across levels.
    // Its time to kill drifts down with level — the typical arm outgrows a
    // machine's health curve (`scaleHp`), the same on a story mission — and
    // run scaling leaves those base curves alone by design.
    expect(Math.max(...hits) / Math.min(...hits), rows.join('\n')).toBeLessThan(1.25)
  })
})

describe('run levels and rewards', () => {
  it('a Tower Run and a supply run follow Flux past the band (its floor kept)', () => {
    const yard = SECTOR_BY_ID.scrapyard
    for (let seed = 1; seed < 40; seed++) {
      const c = climbJob(seed, ['scrapyard'], 30)
      expect(c.level).toBeGreaterThanOrEqual(30)
      expect(c.level).toBeLessThanOrEqual(31)
      // Rewards follow the level by the same formula as before.
      expect(c.reward).toEqual(rewardFor('climb', c.level, false))
    }
    expect(runLevelFor(yard, 1)).toBe(yard.levels[0])
    expect(runLevelFor(yard, MAX_LEVEL, 1)).toBe(MAX_LEVEL)
    let supplies = 0
    for (let seed = 1; seed < 400; seed++) {
      const j = rollJob(seed, ['scrapyard'], 30)
      if (j.template === 'supply') {
        supplies++
        expect(j.level).toBeGreaterThanOrEqual(29)
        expect(j.reward).toEqual(rewardFor('supply', j.level, false))
      } else {
        // Other jobs keep the band.
        expect(j.level).toBeLessThanOrEqual(yard.levels[1])
      }
    }
    expect(supplies).toBeGreaterThan(0)
  })

  it('story missions keep the band and are not board runs', () => {
    const yard = SECTOR_BY_ID.scrapyard
    const q = storyQuest(yard, 30, 0)
    expect(q.level).toBe(enemyLevelFor(yard, 30, 1))
    expect(isBoardRun(q)).toBe(false)
    expect(isBoardRun(climbJob(3, ['scrapyard'], 30))).toBe(true)
    expect(isBoardRun({ kind: 'job', template: 'kill' })).toBe(false)
    expect(isBoardRun(null)).toBe(false)
    expect(typicalEffectiveHp(1)).toBeCloseTo(100 * (100 + 13) / 100)
  })
})
