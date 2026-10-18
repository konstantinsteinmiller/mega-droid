import { reactive } from 'vue'
import type { PoiId } from '../world/hubLayout'
import type { PlaceState } from '../sim/hubPlaces'

/**
 * ─── The walkable lab's side of the UI (#173) ────────────────────────────────
 *
 * The hub mode writes; the hub's Vue layer reads. Two halves, like the
 * mission's HUD (`state/hud.ts`):
 *
 * - `hubUi`, reactive, written only when something changes: where Flux is
 *   (the place he stands at, the locked one he stands before), whether a
 *   film moment owns the screen, and every place's state for the markers.
 * - `hubMarks`, plain, rewritten every frame: each marker's spot on screen.
 *   The markers read it from the HUD ticker with direct style writes.
 */

export interface PlaceView {
  id: PoiId
  state: PlaceState
}

export const hubUi = reactive({
  /** The place Flux stands at ('' = none). */
  near: '' as PoiId | '',
  /** A locked place he stands in front of (its fence), for its hint. */
  nearLocked: '' as PoiId | '',
  /** A film moment (the landing, the turn from the briefing, a beam-out):
   *  the markers and prompts stand aside. */
  cine: false,
  /** An auto-walk is on its way to this place ('' = none). */
  walkingTo: '' as PoiId | '',
  /** Every place of this build, in the hall's order. */
  places: [] as PlaceView[],
  /** Pip has supplies to offer (a rewarded ad is ready): his "!" shows. */
  pipReady: false
})

/** What is open over the walk: Pip's supplies, the records' leaderboard. */
export const hubDialog = reactive({
  open: false,
  board: false
})

export interface HubMark {
  /** CSS px in the game view; off screen, clamped to its edge. */
  x: number
  y: number
  /** In front of the camera and inside the view. */
  onScreen: boolean
  /** Metres from Flux. */
  dist: number
  /** 0..1: how much it should show (distance and view fade). */
  alpha: number
}

/** Per place id (and 'pip'), rewritten every frame by the hub mode. */
export const hubMarks = new Map<string, HubMark>()

export const resetHubUi = (): void => {
  hubUi.near = ''
  hubUi.nearLocked = ''
  hubUi.cine = false
  hubUi.walkingTo = ''
  hubUi.pipReady = false
  hubDialog.open = false
  hubDialog.board = false
  hubMarks.clear()
}
