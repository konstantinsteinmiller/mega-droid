import type { PlayerStats } from './stats'
import type { SectorId } from '../world/themes'

/**
 * ─── Adaptive difficulty: bosses that keep up, a hand for players who don't ──
 *
 * A player who lucks into a purple buster and pours bolts into it can hit
 * six times harder than the game expects, and a Core Master then melts in
 * seconds. So a boss's health follows the player's POWER against a
 * reference: the same level with standard, un-upgraded gear and no chips
 * (the Blaze Master fight as designed). Above the reference, the boss absorbs
 * BOSS_ABSORB of the surplus (up to BOSS_CAP ×): upgrades still show — the
 * fight is shorter — but never trivial. Below it, nothing changes here; the
 * lab offers help instead (`behind`, Pip's upgrade lesson).
 *
 * The power index is the damage a shot does on average: buster damage, the
 * charge bonus and the crits' expected share. Pure; pinned by
 * `tests/game/adaptive.test.ts`.
 */

/** Machines' extra health per Core Master beaten (`sim/balance.ts`). */
export const PROGRESS_HP = 0.06

export const BOSS_ABSORB = 0.85
export const BOSS_CAP = 3
/** Power under this share of the reference: the player is falling behind. */
export const BEHIND_AT = 0.8
/** The standard arm's base damage (items.ts `arm_standard`). */
const STANDARD_MAIN = 10

export const powerIndex = (s: Pick<PlayerStats, 'busterDmg' | 'chargeDmgMul' | 'critChance' | 'critMul'>): number =>
  s.busterDmg * s.chargeDmgMul * (1 + s.critChance * (s.critMul - 1))

/** The reference power at `level`: the standard arm of that item level,
 *  unupgraded, no chips, no crits. */
export const refPower = (level: number): number => {
  const main = Math.round(STANDARD_MAIN * (1 + (Math.max(1, level) - 1) * 0.16))
  return Math.round(main * (1 + 0.03 * (Math.max(1, level) - 1)))
}

/** The player's power against the reference at `level` (1 = as designed). */
export const powerRatio = (s: Parameters<typeof powerIndex>[0], level: number): number =>
  powerIndex(s) / Math.max(1, refPower(level))

/** A boss's health multiplier for this player at this level. */
export const bossHpMul = (s: Parameters<typeof powerIndex>[0], level: number): number => {
  const r = Math.min(BOSS_CAP, Math.max(1, powerRatio(s, level)))
  return 1 + BOSS_ABSORB * (r - 1)
}

/** Falling behind the curve for the next mission's level. */
export const behind = (s: Parameters<typeof powerIndex>[0], level: number): boolean =>
  powerRatio(s, level) < BEHIND_AT

/**
 * ─── Run scaling: a Tower Run and a supply run keep up with Flux ─────────────
 *
 * The board's repeatable runs follow Flux's level past their sector's band
 * (`data/regions.ts` `runLevelFor`), and on top of that their machines follow
 * his KIT against the TYPICAL kit of his level — the one the balance model
 * (`sim/balance.ts`) plays with: a tuned arm found TYPICAL_ARM_LAG item
 * levels back and upgraded as the bolts allow, Mega Charge maxed early, one
 * level-up point in three on health, the starter armour of the level before,
 * unupgraded. An ordinarily progressed Flux meets the machines as designed;
 * only one ahead of that curve meets tougher ones:
 *
 * - health follows his OFFENSE (`powerIndex`: the arm's rarity, item level
 *   and upgrades, the charge and crit chips and affixes);
 * - damage follows his DEFENSE (effective health: max health over the share
 *   of a hit that gets through — health points, the Frame chip, armour and
 *   its rarity, item level and upgrades, health affixes).
 *
 * Each ratio is damped (^RUN_EXP), so every upgrade still kills faster and
 * survives longer (double the power: a machine falls ~13% sooner), and
 * clamped to [1, RUN_CAP]: a player at or under the typical kit meets
 * today's machines, never softer ones. A run's Core Master takes the larger
 * of this and `bossHpMul`, never both. Pure; pinned by
 * `tests/game/runScaling.test.ts`.
 */
export const RUN_EXP = 0.8
export const RUN_CAP = BOSS_CAP
/** The typical arm is found this many item levels behind Flux's level. */
export const TYPICAL_ARM_LAG = 8
/** The typical arm's upgrades: Flux's level − 2, up to the workshop's max. */
const TYPICAL_UPG_LAG = 2
/** items.ts `MAX_UPG`. */
const MAX_UPG = 10
/** A tuned arm's rarity multiplier (items.ts `RARITY_MUL`). */
const TUNED = 1.12
/** Mega Charge: +12% charge damage a rank, five ranks, one chip a level. */
const MEGA_RANKS = 5
/** The starter helmet, chest and boots' base armour (items.ts). */
const STARTER_ARMOR = [4, 6, 3]
/** One level-up point in three on health (`sim/balance.ts` HP_SHARE). */
const HP_SHARE = 1 / 3

type RunStats = Parameters<typeof powerIndex>[0] & Pick<PlayerStats, 'maxHp' | 'damageTakenMul'>

/** An item level's scale on a main stat (items.ts). */
const lvlScale = (ilvl: number): number => 1 + (Math.max(1, ilvl) - 1) * 0.16

/** The typical kit's power index at `level` (no crits). */
export const typicalPower = (level: number): number => {
  const l = Math.max(1, level)
  const upg = Math.min(MAX_UPG, Math.max(0, l - TYPICAL_UPG_LAG))
  const main = Math.round(STANDARD_MAIN * lvlScale(l - TYPICAL_ARM_LAG) * TUNED * (1 + upg * 0.08))
  const busterDmg = Math.round(main * (1 + 0.03 * (l - 1)))
  return powerIndex({ busterDmg, chargeDmgMul: 1 + 0.12 * Math.min(MEGA_RANKS, l - 1), critChance: 0, critMul: 1.5 })
}

/** Max health over the share of a hit that gets through. */
export const effectiveHp = (s: Pick<PlayerStats, 'maxHp' | 'damageTakenMul'>): number =>
  s.maxHp / Math.max(0.05, s.damageTakenMul)

/** The typical kit's effective health at `level`: the starter armour of the
 *  level before, unupgraded, and a third of the level-up points on health. */
export const typicalEffectiveHp = (level: number): number => {
  const l = Math.max(1, level)
  const armor = STARTER_ARMOR.reduce((a, m) => a + Math.round(m * lvlScale(l - 1)), 0)
  const maxHp = 100 + Math.floor((l - 1) * HP_SHARE) * 10
  return effectiveHp({ maxHp, damageTakenMul: 100 / (100 + armor) })
}

const damp = (ratio: number): number => Math.min(RUN_CAP, Math.max(1, Math.pow(Math.max(0, ratio), RUN_EXP)))

/** A Tower Run's or a supply run's machines against this player at `level`:
 *  their health and damage multipliers (1 at or under the typical kit). */
export const runScaling = (s: RunStats, level: number): { hp: number; dmg: number } => ({
  hp: damp(powerIndex(s) / typicalPower(level)),
  dmg: damp(effectiveHp(s) / typicalEffectiveHp(level))
})

/**
 * ─── Stage toughness: the last stage is the last test ───────────────────────
 *
 * A story stage's own machines may take more health than the sector's
 * formula gives them (#144): the Vex Fortress is the final challenge, and a
 * player who got there replays it gladly, so its machines take three times
 * the health, its gates' mini-bosses (the Gatekeeper, the Twin Masters'
 * echoes) twice. Never a boss (Vex and his Core Descent) and never a
 * challenge room's mini-boss or its brood. The story
 * stage only: the board's jobs and Tower Runs in the sector keep the
 * formula (they follow Flux's kit already, `runScaling`). Applied with
 * `toughen` (`sim/mission.ts`); pinned by `tests/game/fortressCast.test.ts`.
 */
export const STAGE_FOE_HP: Partial<Record<SectorId, number>> = { fortress: 3 }

/** The gates' mini-bosses on the story stage (the Gatekeeper, the Twin
 *  Masters' echoes): tougher too, but less than the regulars, since each is a
 *  one-on-one fight with a checkpoint at the door. */
export const STAGE_GATE_HP: Partial<Record<SectorId, number>> = { fortress: 2 }
/** The Gatekeeper alone: its shield only opens in its barrage, so twice was a
 *  4.5-minute fight at the level's gear (#163); one and a half. */
export const STAGE_GATEKEEPER_HP: Partial<Record<SectorId, number>> = { fortress: 1.5 }

/** A machine's health multiplier on the story stage `stage` (1 elsewhere). */
export const stageFoeHpMul = (
  stage: SectorId | undefined,
  e: { boss: boolean; mini?: boolean; kind: string },
  inChallengeRoom = false
): number => {
  if (!stage || e.boss || e.mini || inChallengeRoom) return 1
  if (e.kind === 'gatekeeper') return STAGE_GATEKEEPER_HP[stage] ?? 1
  if (e.kind === 'echo') return STAGE_GATE_HP[stage] ?? 1
  return STAGE_FOE_HP[stage] ?? 1
}
