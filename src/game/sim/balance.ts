/**
 * The balance simulation: a whole campaign played on paper by a profile of
 * player, mission by mission, with the game's own tables — the enemies, the
 * Core Masters, the item curve, the upgrade costs, the quest rewards, the
 * adaptive boss health. No scene, no randomness: every roll is its expected
 * value, so a run is a number to tune against and a test can pin it.
 *
 * The reference player (the one the game is tuned for) takes the ×3 bolts ad
 * every third mission, never farms supply drops and spends only part of
 * what it has. The every-round ad player takes the ×3 every time and spends
 * it all: it may be at most ~15% stronger where it counts (a Core Master's
 * time to kill); adaptive boss health absorbs the rest.
 *
 * `scripts/balance-sim.mjs` prints the tables; `tests/game/balance.test.ts`
 * holds the targets.
 */
import { ngHpMul, ngTempo } from './ngPlus'
import { ENEMIES, scaleHp, scaleDmg, scaleXp } from '../data/enemies'
import { BOSSES } from '../data/bosses'
import type { BossId } from '../models/bosses'
import { RARITY_MUL, MAX_UPG, upgradeCost, mainStat, type Item, type Rarity } from '../data/items'
import { xpToNext, MAX_LEVEL } from '../data/progression'
import { GM_HP_MUL } from './grandMasterTune'
import { rewardFor } from '../data/quests'
import { SECTORS, enemyLevelFor, type Sector } from '../data/regions'
import { bossHpMul, powerIndex, powerRatio, refPower, PROGRESS_HP, STAGE_GATE_HP } from './adaptive'

export interface PlayerProfile {
  name: string
  /** Takes the ×3 bolts every this many missions (0: never). */
  adEvery: number
  /** Supply drops claimed per hub visit (each `supplyDrop` bolts). */
  supplyRuns: number
  /** The share of the bank spent at each hub visit. */
  spend: number
  /** Jobs played in a sector before its story mission. */
  jobsPerSector: number
}

export const REFERENCE: PlayerProfile = { name: 'reference', adEvery: 3, supplyRuns: 0, spend: 0.6, jobsPerSector: 2 }
export const AD_EVERY_ROUND: PlayerProfile = { name: 'ad every round', adEvery: 1, supplyRuns: 0, spend: 1, jobsPerSector: 2 }
export const NO_ADS: PlayerProfile = { name: 'no ads', adEvery: 0, supplyRuns: 0, spend: 0.6, jobsPerSector: 2 }

// ─── The play model (how a mission goes, on average) ────────────────────────

/** Machines met in a mission (a stage's posts, a job's rooms). */
const FOES_PER_MISSION = 18
/** Chests opened per mission. */
const CHESTS_PER_MISSION = 2
/** Effective shots on target per second, in units of the power index: a
 *  level-2 charge (×4) every ~1.45 s at ~80% accuracy, pellets in between. */
const HITS_PER_S = 2.2
/** A Core Master's landed hits per second on a player who is fighting it. */
const BOSS_HITS_PER_S = 0.32
/** A machine's landed hits per second while it is alive and close. */
const FOE_HITS_PER_S = 0.25
/** The share of a mission's items that is a buster (5 slots; chests too). */
const BUSTER_SHARE = 0.2
/** Chest item chance (standard chests). */
const CHEST_ITEM = 0.45
/** A level's attribute point goes to health this often. */
const HP_SHARE = 1 / 3
/** Skill chips: the share spent on the charge-damage line (`megaCharge`, 5
 *  ranks) first, then elsewhere. */
const MEGA_CHARGE_MAX = 5

export interface MissionRow {
  n: number
  /** New Game+ cycle (0: the first run). */
  cycle: number
  sector: string
  kind: 'tutorial' | 'job' | 'story'
  level: number
  playerLevel: number
  /** The buster: its item level, rarity, upgrades and main stat. */
  arm: string
  power: number
  ratio: number
  /** A regular machine's average time to kill (s). */
  foeTtk: number
  /** Story missions: the Core Master's time to kill (s) and how long the
   *  player lasts against it without a gel (s). */
  bossTtk: number
  bossTtd: number
  /** The Fortress's mini-bosses' times to kill (s): the Gatekeeper, one of
   *  the Twin Masters (0 elsewhere). */
  gateTtk: number
  twinTtk: number
  /** The Grand Master Bot's time to kill (s), after Vex (#101; 0 elsewhere):
   *  its parts share GM_HP_MUL of Vex's health. */
  gmTtk: number
  income: number
  bank: number
}

interface Arm { ilvl: number; rarity: Rarity; upg: number }

const armItem = (a: Arm): Item => ({ id: 'sim', base: 'arm_standard', slot: 'buster', ilvl: a.ilvl, rarity: a.rarity, upg: a.upg, affixes: [] })
const armMain = (a: Arm): number => mainStat(armItem(a))
const armName = (a: Arm): string => `i${a.ilvl} ${a.rarity[0]}+${a.upg}`

/** The kinds' weights of a sector, normalised: the average machine there. */
const average = (sector: Sector, level: number): { hp: number; dmg: number; bolts: number; xp: number } => {
  const kinds = sector.encounters.kinds
  const total = kinds.reduce((s, [, w]) => s + w, 0)
  const elite = sector.encounters.eliteChance
  let hp = 0, dmg = 0, bolts = 0, xp = 0
  for (const [k, w] of kinds) {
    const d = ENEMIES[k]
    const share = w / total
    hp += share * scaleHp(d.hp, level) * (1 + elite * 1.5) / d.armor
    dmg += share * scaleDmg(d.dmg, level) * (1 + elite * 0.3)
    bolts += share * ((d.bolts[0] + d.bolts[1]) / 2) * (1 + (level - 1) * 0.12) * (1 + elite * 2)
    xp += share * scaleXp(d.xp, level)
  }
  return { hp, dmg, bolts, xp }
}

/** Play the campaign as `p`: the tutorial, then per sector its jobs and its
 *  story mission (the Core Master). */
export const simulate = (p: PlayerProfile, cycles = 0): MissionRow[] => {
  const rows: MissionRow[] = []
  let level = 1
  let xp = 0
  let bank = 0
  let bosses = 0
  let arm: Arm = { ilvl: 1, rarity: 'standard', upg: 0 }
  let armFind = 0
  let n = 0

  const stats = () => {
    const mega = Math.min(MEGA_CHARGE_MAX, level - 1)
    const hpPoints = Math.floor((level - 1) * HP_SHARE)
    const armor = 13 * (1 + (Math.max(1, level - 1) - 1) * 0.16)
    return {
      busterDmg: Math.round(armMain(arm) * (1 + 0.03 * (level - 1))),
      chargeDmgMul: 1 + 0.12 * mega,
      critChance: 0,
      critMul: 1.5,
      maxHp: 100 + hpPoints * 10,
      damageTakenMul: 100 / (100 + armor)
    }
  }

  const gainXp = (g: number): void => {
    xp += g
    while (level < MAX_LEVEL && xp >= xpToNext(level)) { xp -= xpToNext(level); level++ }
  }

  /** The hub between missions: spend on the buster, newest find first. */
  const hub = (): void => {
    let budget = bank * p.spend
    while (arm.upg < MAX_UPG) {
      const c = upgradeCost(armItem(arm))
      if (c > budget) break
      budget -= c
      bank -= c
      arm = { ...arm, upg: arm.upg + 1 }
    }
  }

  const play = (sector: Sector, kind: MissionRow['kind'], cycle = 0): void => {
    n++
    const lvl = kind === 'tutorial' ? 1 : enemyLevelFor(sector, level, kind === 'story' ? 1 : 0, cycle)
    const foe = average(sector, lvl)
    const s = stats()
    const pw = powerIndex(s)
    const dps = pw * HITS_PER_S
    // New Game+ (`ngPlus.ts`): every Master counts as beaten, and a cycle's
    // extra health on top; its bosses hit as often again as they are quicker.
    const ngHp = ngHpMul(cycle)
    const toughen = (1 + PROGRESS_HP * (cycle > 0 ? SECTORS.length - 1 : bosses)) * ngHp
    const foeTtk = (foe.hp * toughen) / dps
    let bossTtk = 0
    let bossTtd = 0
    if (kind !== 'job') {
      const def = BOSSES[sector.boss as BossId]
      const hp = scaleHp(def.hp, lvl) * (kind === 'tutorial' ? 1 : bossHpMul(s, lvl)) * ngHp
      bossTtk = hp / dps
      bossTtd = s.maxHp / (scaleDmg(def.dmg, lvl) * s.damageTakenMul * BOSS_HITS_PER_S / ngTempo(cycle))
    }
    // The income: the quest, the machines, the chests, the boss's drop.
    const template = kind === 'tutorial' ? 'tutorial' : kind === 'story' ? 'stage' : 'kill'
    const reward = kind === 'tutorial' ? { xp: 120, bolts: 80 } : rewardFor(template, lvl, kind === 'story')
    const def = BOSSES[sector.boss as BossId]
    let income = reward.bolts + FOES_PER_MISSION * sector.encounters.density * foe.bolts + CHESTS_PER_MISSION * (12 + lvl * 6)
    if (kind !== 'job') income += ((def.bolts[0] + def.bolts[1]) / 2) * (1 + (lvl - 1) * 0.12)
    income = Math.round(income)
    const ad = p.adEvery > 0 && n % p.adEvery === 0
    const paid = ad ? income * 3 : income
    bank += paid + p.supplyRuns * Math.round(Math.max(40 + 20 * level, 0.5 * income) / 5) * 5
    gainXp(reward.xp + FOES_PER_MISSION * sector.encounters.density * foe.xp + (kind !== 'job' ? scaleXp(def.xp, lvl) : 0))
    // Finds: the quest's item, the chests'; a better buster is worn (its
    // upgrades start again).
    armFind += BUSTER_SHARE * (1 + CHESTS_PER_MISSION * CHEST_ITEM)
    if (armFind >= 1) {
      armFind -= 1
      const found: Arm = { ilvl: lvl, rarity: kind === 'job' ? 'tuned' : 'prototype', upg: 0 }
      if (armMain(found) > armMain(arm)) arm = found
    }
    if (kind !== 'job') bosses++
    const fortress = kind === 'story' && sector.id === 'fortress'
    const gateHp = ngHp * (STAGE_GATE_HP.fortress ?? 1)
    const gateTtk = fortress ? Math.round(scaleHp(ENEMIES.gatekeeper.hp, lvl) * gateHp / dps) : 0
    const twinTtk = fortress ? Math.round(scaleHp(ENEMIES.echo.hp, lvl) * gateHp / dps) : 0
    const gmTtk = fortress ? Math.round(bossTtk * GM_HP_MUL) : 0
    rows.push({
      n, cycle, sector: sector.id, kind, level: lvl, playerLevel: level, arm: armName(arm), gateTtk, twinTtk, gmTtk,
      power: Math.round(pw * 10) / 10, ratio: Math.round(powerRatio(s, lvl) * 100) / 100,
      foeTtk: Math.round(foeTtk * 10) / 10, bossTtk: Math.round(bossTtk), bossTtd: Math.round(bossTtd),
      income: paid, bank: Math.round(bank)
    })
    hub()
  }

  for (const sector of SECTORS) {
    if (sector.id === 'scrapyard') { play(sector, 'tutorial'); continue }
    for (let j = 0; j < p.jobsPerSector; j++) play(sector, 'job')
    play(sector, 'story')
  }
  // New Game+: the story again, gear kept, the tutorial done (the Scrapyard
  // is its labyrinth to the Scrapper).
  for (let c = 1; c <= cycles; c++) {
    for (const sector of SECTORS) {
      for (let j = 0; j < (sector.id === 'scrapyard' ? 0 : p.jobsPerSector); j++) play(sector, 'job', c)
      play(sector, 'story', c)
    }
  }
  return rows
}

/** How much stronger `b` is than `a` at each Core Master: the ratio of the
 *  times to kill (1.1 = kills it 10% faster). */
export const bossEdge = (a: MissionRow[], b: MissionRow[]): Array<{ sector: string; edge: number }> =>
  a.filter(r => r.kind === 'story').map(r => {
    const o = b.find(x => x.kind === 'story' && x.sector === r.sector)!
    return { sector: r.sector, edge: Math.round((r.bossTtk / o.bossTtk) * 100) / 100 }
  })

/** The same against regular machines. */
export const foeEdge = (a: MissionRow[], b: MissionRow[]): Array<{ sector: string; edge: number }> =>
  a.filter(r => r.kind === 'story').map(r => {
    const o = b.find(x => x.kind === 'story' && x.sector === r.sector)!
    return { sector: r.sector, edge: Math.round((r.foeTtk / o.foeTtk) * 100) / 100 }
  })

export { RARITY_MUL, refPower }
