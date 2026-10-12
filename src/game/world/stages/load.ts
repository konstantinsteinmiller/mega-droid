import type { MapData } from '../levelGen'
import type { SectorId } from '../themes'
import { generateClimb } from '../climbGen'

/**
 * A stage's map for a mission, its generator loaded on demand: each stage's
 * builder is its own chunk, fetched when its mission is built (behind the
 * loader or the deploy beam), never on the boot path; a sector without a
 * stage gets the Tower Run. The synchronous
 * `generateStage` (`./index.ts`) stays for tests and the level lab.
 */
export const loadStage = async (sector: SectorId, seed: number): Promise<MapData> => {
  switch (sector) {
    case 'blaze': return (await import('./blaze')).generateMeltdown(seed)
    case 'cryo': return (await import('./cryo')).generateGlacier(seed)
    case 'volt': return (await import('./volt')).generateRailRush(seed)
    case 'gale': return (await import('./gale')).generateSkyDocks(seed)
    case 'magnet': return (await import('./magnet')).generatePolarityWorks(seed)
    case 'drill': return (await import('./drill')).generateDeepMine(seed)
    case 'tide': return (await import('./tide')).generateTidewaterLocks(seed)
    case 'neon': return (await import('./neon')).generateBlackoutBoulevard(seed)
    case 'rotor': return (await import('./rotor')).generateRotorRun(seed)
    case 'fortress': return (await import('./fortress')).generateVexFortress(seed)
    // A sector without a stage gets the Tower Run (as `generateStage`).
    default: return generateClimb(seed, sector !== 'scrapyard')
  }
}
