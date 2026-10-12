import { shallowReactive } from 'vue'
import { newOverlay, type IntroOverlay, type ShotId } from './introScript'
import { newHold, pressHold, releaseHold } from './holdSkip'

/**
 * ─── The cutscene's HUD mirror ───────────────────────────────────────────────
 *
 * The same firewall as `state/hud.ts`: the cutscene (`story/intro.ts`) never
 * touches Vue. Discrete things the layer shows through Vue (the skip button,
 * the screen-reader line, which bubble or caption is up) go in `cine`, written
 * only when they change. Everything that moves every frame (the overlays, the
 * projected anchors of the bubble and the hologram's tags, the hold-to-skip
 * ring) goes in `cineLive`, which `CutsceneLayer.vue` paints with direct DOM
 * writes from its HUD ticker.
 */

export const cine = shallowReactive({
  /** A cutscene is on screen. */
  on: false,
  /** The start gate is up ("Click to Start"): the browser has not let sound
   *  start yet, and the cutscene waits for the first press rather than play
   *  its opening in silence. */
  gate: false,
  /** The skip button is up (and a skip counts). */
  skip: false,
  /** The screen-reader line: the shot whose `story.intro.<id>` is read. */
  line: '' as ShotId | '',
  /** Atlas's caption (`story.atlas.<key>`), and a count so a repeat re-pops. */
  atlas: '' as '' | 'logStart' | 'goodMorning' | 'scrapyardFirst',
  atlasSeq: 0,
  /** Dr. Vex's speech bubble (`story.vex.<key>`). */
  vex: '' as '' | 'diagnosis'
})

export interface CineLive extends IntroOverlay {
  /** The cutscene clock (s). */
  t: number
  /** When the current Atlas caption came up (s). */
  atlasAt: number
  /** Vex's bubble anchor, in viewport fractions (0..1, top-left origin). */
  bubbleX: number
  bubbleY: number
  /** The hologram's tag anchors (viewport fractions). */
  fortX: number
  fortY: number
  scrapX: number
  scrapY: number
  /** The hold-to-skip ring's fill, 0..1 (`holdSkip.ts`). */
  hold: number
  /** The Overload preview (#137): the charge held (s on the game's charge
   *  clock, `introScript.overCharge`; < 0: none), and where its ring sits
   *  (viewport fractions: on the weak spot he aims at). */
  charge: number
  ringX: number
  ringY: number
  /** When "KRANCK!" went up (s), and where (viewport fractions). */
  kranckAt: number
  kranckX: number
  kranckY: number
}

export const cineLive: CineLive = {
  ...newOverlay(), t: 0, atlasAt: -10, bubbleX: 0.5, bubbleY: 0.2, fortX: 0, fortY: 0, scrapX: 0, scrapY: 0, hold: 0,
  charge: -1, ringX: 0.5, ringY: 0.5, kranckAt: -10, kranckX: 0.5, kranckY: 0.4
}

/** Space held to skip: the key handlers press and release it, the live
 *  cutscene steps it on its clock. */
export const skipHold = newHold()

/** The start gate's press (the overlay's button, any key): the live cutscene sets what it does. */
let gateHandler: (() => void) | null = null
export const setGateHandler = (fn: (() => void) | null): void => { gateHandler = fn }
export const openGate = (): void => { gateHandler?.() }

/** Back to rest (a cutscene ended, or a new one starts). */
export const resetCine = (): void => {
  cine.on = false
  cine.gate = false
  cine.skip = false
  cine.line = ''
  cine.atlas = ''
  cine.vex = ''
  releaseHold(skipHold)
  Object.assign(cineLive, newOverlay(), { t: 0, atlasAt: -10, hold: 0, charge: -1, kranckAt: -10 })
}

// ─── Skip ────────────────────────────────────────────────────────────────────

let skipHandler: (() => void) | null = null

/** The live cutscene registers how it is skipped (null when it ends). */
export const setSkipHandler = (fn: (() => void) | null): void => {
  skipHandler = fn
}

/** The skip button, `Esc`: skip the cutscene on screen, if any (and if a skip
 *  counts yet — the cutscene decides). */
export const skipCutscene = (): void => {
  skipHandler?.()
}

/** `Space` down or up over a cutscene: held for `HOLD_TO_SKIP_S`, it skips. */
export const holdToSkip = (down: boolean): void => {
  if (down) pressHold(skipHold)
  else releaseHold(skipHold)
}
