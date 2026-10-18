import { profile } from '@/game/state/profile'
import { hubUi } from '@/game/state/hubUi'
import type { PoiId } from '@/game/world/hubLayout'
import type { PlaceState } from '@/game/sim/hubPlaces'
import { isFresh, isUnlocked, unlockCount, type HubMenu } from './hubUnlocks'

/** The menu behind each station of the hall (its lock rules, `hubUnlocks.ts`). */
export const STATION_MENU: Partial<Record<PoiId, HubMenu>> = {
  hero: 'hero', workshop: 'workshop', circuits: 'circuits', records: 'leaderboard'
}

/** A place's state now. A station's follows the unlock rules live (a cloud
 *  save loaded on top can change them); the rest is as the hall lit it. */
export const placeStateNow = (id: PoiId): PlaceState => {
  const menu = STATION_MENU[id]
  if (menu) return isUnlocked(menu, unlockCount(profile)) ? 'open' : 'locked'
  return hubUi.places.find(p => p.id === id)?.state ?? 'open'
}

/** A station opened since the last visit and not used yet: its "new" chip. */
export const placeFreshNow = (id: PoiId): boolean => {
  const menu = STATION_MENU[id]
  return !!menu && isFresh(profile, menu)
}
