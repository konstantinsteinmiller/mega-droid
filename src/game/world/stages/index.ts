import type { MapData } from '../levelGen'
import type { SectorId } from '../themes'
import { generateClimb } from '../climbGen'
import { generateMeltdown } from './blaze'
import { generateGlacier } from './cryo'
import { generateRailRush } from './volt'
import { generateSkyDocks } from './gale'
import { generatePolarityWorks } from './magnet'
import { generateDeepMine } from './drill'
import { generateTidewaterLocks } from './tide'
import { generateBlackoutBoulevard } from './neon'
import { generateRotorRun } from './rotor'
import { generateVexFortress } from './fortress'
import { isStageSector, type StageSector } from './meta'

export { STAGE_LENGTH, isStageSector, type StageSector } from './meta'

/**
 * ─── The platform stages ─────────────────────────────────────────────────────
 *
 * The sectors' story missions are hand-authored platforming stages built
 * like the Tower Run (`world/climbGen.ts`, with `stages/builder.ts`), each
 * themed on its Core Master, the boss in the arena at the end (floor y = 0):
 *
 *   blaze  Meltdown Descent   down a burning refinery stack
 *   cryo   Glacier Run        ice, spike pits, frost throwers
 *   volt   Rail Rush          a maglev cart ride under waves of flyers
 *   gale   Sky Docks          floating platforms and a wind tunnel
 *   magnet Polarity Works     magnet rails, polarity panels, crane shuttles
 *   drill  Deep Mine          boulders, falling rock, a mine elevator, moles
 *   tide   Tidewater Locks    wading, a rising tide, a lock's valve, buoys
 *   neon   Blackout Boulevard bridges of light, switches, a wall-kick shaft
 *   rotor  Rotor Run          a quadcopter flight, drone hops, crosswinds
 *   fortress Vex Fortress     three acts, two mini-bosses, every trick again
 *
 * Each story level is about a tenth longer than the one before it.
 */



const GENERATORS: Record<StageSector, (seed: number) => MapData> = {
  blaze: generateMeltdown,
  cryo: generateGlacier,
  volt: generateRailRush,
  gale: generateSkyDocks,
  magnet: generatePolarityWorks,
  drill: generateDeepMine,
  tide: generateTidewaterLocks,
  neon: generateBlackoutBoulevard,
  rotor: generateRotorRun,
  fortress: generateVexFortress
}


/** The stage map of `sector` for `seed` (deterministic: a resume rebuilds
 *  it). A sector without a stage gets the Tower Run. */
export const generateStage = (sector: SectorId, seed: number): MapData =>
  isStageSector(sector) ? GENERATORS[sector](seed) : generateClimb(seed, sector !== 'scrapyard')
