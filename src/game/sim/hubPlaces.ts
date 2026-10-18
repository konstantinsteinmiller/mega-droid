import { SECTOR_BY_ID } from '../data/regions'
import type { Quest } from '../data/quests'
import type { SectorId } from '../world/themes'
import { POIS, STORY_ORDER, type Poi, type PoiId } from '../world/hubLayout'

/**
 * ─── What every place in the hall shows right now (#173) ─────────────────────
 *
 * Pure: a profile's progress in, one state per place out. The hall lights
 * itself from this, the markers label themselves from it, and a test can
 * read the whole hall for any save.
 *
 *   story pedestal  locked  (its sector not open: a red fence across it)
 *                   next    (the story's next mission: its beam burns)
 *                   cleared (its Master beaten: lit, a rematch on it)
 *                   open    (open and not beaten, but not the next: an old
 *                            save's side door; it deploys like `next`)
 *   job pad         locked  (the board opens after the Flame Master, #120)
 *                   open    (a job is posted on it)  ·  empty (none)
 *   station         locked  (`hubUnlocks.ts`: N more missions)  ·  open
 */

export type PlaceState = 'locked' | 'next' | 'open' | 'cleared' | 'empty'

export interface PlaceInputs {
  unlocked: readonly SectorId[]
  bosses: readonly string[]
  /** The board's three jobs, in pad order. */
  jobs: readonly Quest[]
  jobsOpen: boolean
  /** Which station menus are open now (`hubUnlocks.ts`). */
  menus: { hero: boolean; workshop: boolean; circuits: boolean; leaderboard: boolean }
  /** The build has a live leaderboard (else the records terminal is decor). */
  liveBoard: boolean
}

/** The story's next sector: the first open one whose Master still stands. */
export const nextSector = (i: Pick<PlaceInputs, 'unlocked' | 'bosses'>): SectorId | null => {
  for (const s of [...STORY_ORDER, 'fortress' as const]) {
    if (i.unlocked.includes(s) && !i.bosses.includes(SECTOR_BY_ID[s].boss)) return s
  }
  return null
}

export const placeState = (p: Poi, i: PlaceInputs): PlaceState => {
  if (p.kind === 'story' || p.kind === 'gate') {
    const s = p.sector!
    if (!i.unlocked.includes(s)) return 'locked'
    if (i.bosses.includes(SECTOR_BY_ID[s].boss)) return 'cleared'
    return nextSector(i) === s ? 'next' : 'open'
  }
  if (p.kind === 'job') {
    if (!i.jobsOpen) return 'locked'
    return i.jobs[jobIndex(p.id)] ? 'open' : 'empty'
  }
  switch (p.id) {
    case 'hero': return i.menus.hero ? 'open' : 'locked'
    case 'workshop': return i.menus.workshop ? 'open' : 'locked'
    case 'circuits': return i.menus.circuits ? 'open' : 'locked'
    case 'records': return i.menus.leaderboard ? 'open' : 'locked'
    default: return 'open'
  }
}

/** A job pad's slot on the board (`job0` → 0). */
export const jobIndex = (id: PoiId): number => Number(String(id).slice(3))

/** The places this build has: the records terminal only with a live board. */
export const placesFor = (liveBoard: boolean): Poi[] => POIS.filter(p => p.id !== 'records' || liveBoard)

/** A locked place is walled off (its fence is solid). */
export const fenced = (s: PlaceState): boolean => s === 'locked'

/** A pad Flux can beam out from in this state. */
export const deployable = (s: PlaceState): boolean => s === 'next' || s === 'open' || s === 'cleared'
