import type { SectorId } from '../../world/themes'
import type { ChallengeSector, MiniBossId, MiniBossSpec } from './types'
import { CINDER_HOUND } from './cinderHound'
import { ICEBREAKER_BRUTE } from './icebreakerBrute'
import { ARC_SPIDER } from './arcSpider'
import { STORM_HORNET_QUEEN } from './stormHornetQueen'
import { LODESTONE_GOLEM } from './lodestoneGolem'
import { BURROW_WYRM } from './burrowWyrm'
import { PUFFER_MATRIARCH } from './pufferMatriarch'
import { GLITCH_STALKER } from './glitchStalker'
import { SAW_GYRO } from './sawGyro'
import { SENTINEL_PROTOTYPE } from './sentinelPrototype'

/**
 * ─── The challenge mini-bosses, one per sector ───────────────────────────────
 *
 * Every story sector from the Blaze Refinery on has one (the Scrapyard has
 * none, nor any challenge room: `data/challenge.ts`). An entry is a `MiniBossSpec`: its name,
 * stats, model and behaviour (`miniBoss/types.ts`).
 *
 * ADDING ONE: a model file in `models/miniBoss/<id>.ts` (a rig and its pose),
 * a behaviour file in `sim/miniBoss/<id>.ts` (a `MiniBossBehaviour` and its
 * `MiniBossSpec`, the Cinder Hound's is the reference), then its line here;
 * its name is `miniboss.<id>` in every locale.
 */

export const MINI_BOSSES: Record<ChallengeSector, MiniBossSpec> = {
  blaze: CINDER_HOUND as MiniBossSpec,
  cryo: ICEBREAKER_BRUTE as MiniBossSpec,
  volt: ARC_SPIDER as MiniBossSpec,
  gale: STORM_HORNET_QUEEN as MiniBossSpec,
  magnet: LODESTONE_GOLEM as MiniBossSpec,
  drill: BURROW_WYRM as MiniBossSpec,
  tide: PUFFER_MATRIARCH as MiniBossSpec,
  neon: GLITCH_STALKER as MiniBossSpec,
  rotor: SAW_GYRO as MiniBossSpec,
  fortress: SENTINEL_PROTOTYPE as MiniBossSpec
}

/** Every mini-boss id, in story order. */
export const MINI_BOSS_IDS: readonly MiniBossId[] = Object.values(MINI_BOSSES).map(s => s.id)

/** A sector's challenge mini-boss (the Scrapyard has none). */
export const miniBossFor = (sector: SectorId): MiniBossSpec | null =>
  sector === 'scrapyard' ? null : MINI_BOSSES[sector]
