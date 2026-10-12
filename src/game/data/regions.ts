import { MAX_LEVEL } from './progression'
import type { SectorId } from '../world/themes'
import type { EncounterTable } from '../sim/spawn'

/**
 * ─── Sectors of Cyber City ────────────────────────────────────────────────
 *
 * Each sector is one bright stage theme with its own machine mix, an enemy
 * level band and a Core Master at the end of its story mission. Beating the
 * master unlocks the next sector on the map (and copies its weapon).
 */

export interface Sector {
  id: SectorId
  /** Enemy level band; missions scale inside it with the player's level. */
  levels: [number, number]
  encounters: EncounterTable
  boss: string
  /** Sector that must be cleared (boss beaten) before this one opens. */
  after: SectorId | null
  /** Position on the hub's sector map, 0..1 in both axes. */
  mapPos: [number, number]
  rooms: [number, number]
}

/*
 * `golems`: the chance a combat or objective room hides a crate golem asleep
 * among its crates (sim/spawn.ts placeGolems) — low, and a little higher in
 * the later sectors; `theme` is whose crates it wears. Golems are placed
 * apart from `kinds` (their own RNG, never a job's kill or elite target).
 * The tutorial's cast is scripted and has none.
 */
export const SECTORS: Sector[] = [
  {
    id: 'scrapyard', levels: [1, 4], boss: 'scrapper', after: null, mapPos: [0.22, 0.72], rooms: [7, 9],
    encounters: { kinds: [['hardhat', 3], ['trooper', 2], ['heli', 1.5], ['roller', 1], ['turret', 0.6], ['hopper', 0.5], ['brute', 0.3]], element: 'none', density: 0.85, eliteChance: 0.04, golems: 0.14, theme: 'scrapyard' }
  },
  {
    id: 'blaze', levels: [3, 8], boss: 'blazeMaster', after: 'scrapyard', mapPos: [0.46, 0.8], rooms: [8, 10],
    encounters: { kinds: [['hardhat', 2], ['trooper', 2], ['roller', 2], ['hopper', 1.5], ['turret', 1], ['brute', 0.8], ['heli', 1]], element: 'fire', density: 0.95, eliteChance: 0.07, golems: 0.17, theme: 'blaze' }
  },
  {
    id: 'cryo', levels: [6, 11], boss: 'frostMaster', after: 'blaze', mapPos: [0.7, 0.66], rooms: [8, 10],
    encounters: { kinds: [['trooper', 2.5], ['heli', 2], ['hardhat', 1.5], ['turret', 1.2], ['brute', 1], ['hopper', 1], ['roller', 1]], element: 'ice', density: 1.0, eliteChance: 0.08, golems: 0.19, theme: 'cryo' }
  },
  {
    id: 'volt', levels: [9, 15], boss: 'voltMaster', after: 'cryo', mapPos: [0.78, 0.36], rooms: [9, 11],
    encounters: { kinds: [['heli', 2.5], ['turret', 1.5], ['trooper', 2], ['roller', 1.5], ['brute', 1.2], ['hopper', 1.2], ['hardhat', 1]], element: 'volt', density: 1.05, eliteChance: 0.09, golems: 0.2, theme: 'volt' }
  },
  {
    id: 'gale', levels: [13, 19], boss: 'galeMaster', after: 'volt', mapPos: [0.5, 0.2], rooms: [9, 11],
    encounters: { kinds: [['heli', 3], ['hopper', 2], ['trooper', 2], ['roller', 1.5], ['brute', 1.2], ['turret', 1], ['hardhat', 1]], element: 'wind', density: 1.1, eliteChance: 0.1, golems: 0.21, theme: 'gale' }
  },
  {
    id: 'magnet', levels: [16, 22], boss: 'magnetMaster', after: 'gale', mapPos: [0.88, 0.16], rooms: [9, 11],
    encounters: { kinds: [['polar', 2.5], ['trooper', 2], ['roller', 1.5], ['heli', 1.5], ['brute', 1.2], ['turret', 1.2], ['hardhat', 1]], element: 'none', density: 1.1, eliteChance: 0.1, golems: 0.22, theme: 'magnet' }
  },
  {
    id: 'drill', levels: [19, 25], boss: 'drillMaster', after: 'magnet', mapPos: [0.08, 0.5], rooms: [9, 11],
    encounters: { kinds: [['mole', 2.5], ['hardhat', 2], ['brute', 1.5], ['roller', 1.5], ['trooper', 1.2], ['turret', 1.2], ['polar', 0.8]], element: 'none', density: 1.12, eliteChance: 0.11, golems: 0.24, theme: 'drill' }
  },
  {
    id: 'tide', levels: [22, 28], boss: 'tideMaster', after: 'drill', mapPos: [0.86, 0.8], rooms: [10, 12],
    encounters: { kinds: [['puffer', 2.5], ['heli', 2], ['trooper', 1.5], ['roller', 1.2], ['brute', 1.2], ['turret', 1.2], ['polar', 0.8], ['mole', 0.6]], element: 'none', density: 1.14, eliteChance: 0.11, golems: 0.25, theme: 'tide' }
  },
  {
    id: 'neon', levels: [25, 31], boss: 'neonMaster', after: 'tide', mapPos: [0.64, 0.38], rooms: [10, 12],
    encounters: { kinds: [['stalker', 2.5], ['spotter', 1.6], ['heli', 1.5], ['trooper', 1.5], ['puffer', 1], ['brute', 1.2], ['turret', 1.2], ['polar', 1], ['mole', 0.6]], element: 'none', density: 1.16, eliteChance: 0.12, golems: 0.25, theme: 'neon' }
  },
  {
    id: 'rotor', levels: [28, 34], boss: 'rotorMaster', after: 'neon', mapPos: [0.36, 0.64], rooms: [10, 12],
    encounters: { kinds: [['hornet', 2.5], ['heli', 2], ['trooper', 1.2], ['polar', 1], ['stalker', 1], ['puffer', 0.8], ['brute', 1], ['turret', 1.2]], element: 'none', density: 1.18, eliteChance: 0.12, golems: 0.26, theme: 'rotor' }
  },
  {
    id: 'fortress', levels: [31, 40], boss: 'vexMk1', after: 'rotor', mapPos: [0.24, 0.32], rooms: [10, 12],
    encounters: { kinds: [['brute', 2], ['trooper', 2], ['heli', 2], ['hopper', 2], ['roller', 2], ['turret', 1.5], ['hardhat', 1.5]], element: 'none', density: 1.15, eliteChance: 0.12, golems: 0.24, theme: 'fortress' }
  }
]

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map(s => [s.id, s])) as Record<SectorId, Sector>

/** Blades-style soft scaling: enemies track the player inside the band. In
 *  New Game+ (`ng` > 0, `sim/ngPlus.ts`) the band's top lifts to the level
 *  cap, so the machines keep tracking a Flux already past the band. */
export const enemyLevelFor = (sector: Sector, playerLevel: number, delta = 0, ng = 0): number =>
  Math.max(sector.levels[0], Math.min(ng > 0 ? MAX_LEVEL : sector.levels[1], playerLevel + delta))

/** A board run's level (a Tower Run, a supply run): the band's floor, but no
 *  top — the machines follow Flux all the way (`sim/adaptive.ts` `runScaling`
 *  follows his kit on top). */
export const runLevelFor = (sector: Sector, playerLevel: number, delta = 0): number =>
  Math.max(sector.levels[0], Math.min(MAX_LEVEL, playerLevel + delta))
