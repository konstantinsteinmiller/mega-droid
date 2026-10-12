import type { Rarity } from './items'
import type { QuestTemplate } from './quests'
import type { SectorId } from '../world/themes'
import { MAX_LEVEL } from './progression'

/**
 * ─── Challenge rooms: where they are, what they pay ──────────────────────────
 *
 * An optional room behind the challenge door holds a mini-boss
 * (`sim/challenge.ts`). Beating it pays, every time (no once-a-save flag):
 *
 *  - a Repair Gel, past the pack's cap (`Mission.giftGel`);
 *  - bolts: CHALLENGE_BOLTS × (1 + BOLTS_PER_MASTER × the Core Masters beaten
 *    beyond the first), times Flux's bolt bonus like a chest's — 200 with one
 *    Master down, 470 with all ten;
 *  - an item, never standard: tuned at least, prototype and legendary more
 *    likely with every Master beaten (`challengeRarityOdds`), its item level
 *    the run's plus one per three Masters (`challengeItemLevel`).
 *
 * "Masters beaten" counts the Core Masters (the Scrapper is the tutorial's,
 * not a Master); a New Game+ counts them all.
 */

/** The quest templates whose maps hang a challenge room off the route. The
 *  story stages place theirs by hand (`Builder.challengeRoom`). */
export const CHALLENGE_TEMPLATES: ReadonlySet<QuestTemplate> = new Set<QuestTemplate>(['climb', 'supply'])
/** A run of this template in this sector has a challenge room: from the
 *  Blaze Refinery on, never in the Scrapyard (before the first Master). */
export const hasChallengeRoom = (template: QuestTemplate | undefined, sector: SectorId): boolean =>
  !!template && CHALLENGE_TEMPLATES.has(template) && sector !== 'scrapyard'

export const CHALLENGE_BOLTS = 200
export const BOLTS_PER_MASTER = 0.15

/** The Core Masters beaten (`profile.world.bosses`; a New Game+: all ten). */
export const mastersBeaten = (bosses: readonly string[], ngPlus = 0): number =>
  ngPlus > 0 ? 10 : bosses.filter(b => b !== 'scrapper').length

/** The bolts a challenge pays (before Flux's bolt bonus). */
export const challengeBolts = (masters: number): number =>
  Math.round(CHALLENGE_BOLTS * (1 + BOLTS_PER_MASTER * Math.max(0, masters - 1)))

/** The item's odds by rarity (they sum to 1; never standard). */
export const challengeRarityOdds = (masters: number): Record<Exclude<Rarity, 'standard'>, number> => {
  const m = Math.max(0, Math.min(10, masters))
  const legendary = Math.min(0.3, 0.03 + 0.027 * m)
  const prototype = Math.min(0.55, 0.2 + 0.035 * m)
  return { tuned: 1 - legendary - prototype, prototype, legendary }
}

/** Roll the item's rarity (`rng` 0..1). */
export const rollChallengeRarity = (rng: () => number, masters: number): Rarity => {
  const o = challengeRarityOdds(masters)
  const r = rng()
  return r < o.legendary ? 'legendary' : r < o.legendary + o.prototype ? 'prototype' : 'tuned'
}

/** The item's level: the run's, plus one for every three Masters beaten. */
export const challengeItemLevel = (level: number, masters: number): number =>
  Math.min(MAX_LEVEL, Math.max(1, level) + Math.floor(Math.max(0, masters) / 3))
