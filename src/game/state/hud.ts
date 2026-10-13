import { shallowReactive } from 'vue'
import type { Item } from '../data/items'
import type { HintView } from '../sim/coach'
import type { LessonView } from '../sim/lessons'
import type { BorrowedView } from '../sim/borrowed'

/**
 * ─── The reactivity firewall ─────────────────────────────────────────────────
 *
 * The sim never touches Vue. It writes a SHALLOW reactive mirror (`hud`) at a
 * throttled rate (≤ 15 Hz) for the parts of the HUD that are fine to update
 * through Vue (labels, objective text, button states), and it pushes transient
 * per-frame work (damage numbers, crosshair ring, joystick) to a ticker the
 * HUD component registers — those are direct DOM writes, never reactive.
 */

export type Phase = 'boot' | 'beamIn' | 'play' | 'beamOut' | 'dead' | 'done' | 'hub'

export interface CompassMarker {
  /** Bearing relative to the view, radians, 0 = straight ahead, + = right. */
  bearing: number
  kind: 'objective' | 'exit' | 'enemy' | 'chest' | 'boss'
  dist: number
}

export const hud = shallowReactive({
  phase: 'boot' as Phase,
  hp: 100,
  maxHp: 100,
  we: 28,
  maxWe: 28,
  power: 100,
  maxPower: 100,
  level: 1,
  xp01: 0,
  bolts: 0,
  /** Combat engaged (lock-on active). */
  combat: false,
  /** Name/level of the locked target, empty when none. */
  targetName: '',
  targetLevel: 0,
  targetHp01: 0,
  targetElite: false,
  /** The locked target is out of sight (held by the lock's grace): the
   *  frame dims. The bracket reads `Mission.targetHidden` per frame. */
  targetHidden: false,
  /** Boss bar. */
  bossName: '',
  bossHp01: 0,
  /** The bar's look: '' a Core Master's (violet, the skull), 'challenge' a
   *  challenge room's mini-boss (amber, the trophy; `sim/challenge.ts`). */
  bossStyle: '' as '' | 'challenge',
  /** Marks across the boss bar (0..1 of it): where a multi-part boss's
   *  phases end (the Grand Master's arms, feet, head). Empty for one body. */
  bossMarks: [] as number[],
  /** The mission's Core Master for the top row's locator chip (shown on a map with a boss) ('' = a map
   *  without a boss), and whether it has fallen. The chip reveals the face
   *  once the fight begins (`bossName` set). */
  missionBoss: '',
  bossDown: false,
  /** The objective locator (`sim/locator.ts`): on screen now, and how far
   *  its cooldown has run, 0..1 (-1 = retired, nothing to show). */
  locatorOn: false,
  locatorCd01: -1,
  /** Contextual interact prompt (i18n key + params), empty when none. */
  interactKey: '',
  /** Objective tracker line (i18n key + params). */
  objectiveKey: '',
  objectiveParams: {} as Record<string, string | number>,
  objectiveDone: false,
  compass: [] as CompassMarker[],
  /** Weapon slots: id or '' + WE cost + ready flag. */
  weapons: [
    { id: '', cost: 0, ready: false, color: '#ffffff' },
    { id: '', cost: 0, ready: false, color: '#ffffff' }
  ],
  /** The borrowed weapon on the third button (`sim/borrowed.ts`): charges
   *  left as pips, no Weapon Energy. Replaced whole on a change. */
  borrowed: { id: '', shots: 0, max: 0, color: '#ffffff', ready: false, teach: false, spent: 0 } as BorrowedView,
  tanks: 0,
  /** Repair Gel capacity (Gel Capacity skill): the gel button's pips. */
  tanksMax: 2,
  /** Counts the Repair Gels used: each one plays the button's drain and the
   *  health bar's green refill, from `gelFrom01` (health before it). */
  gelUse: 0,
  gelFrom01: 0,
  slideReady: true,
  /** The slide is off cooldown but short of power (its button says which). */
  slidePowerLow: false,
  blockHeld: false,
  /** The control coach's glyphs on screen (see `sim/coach.ts`). */
  hints: [] as HintView[],
  /** The scene lesson on screen, if any (see `sim/lessons.ts`). */
  lesson: null as LessonView | null,
  /** The hand in use: keycaps show on prompts only for mouse + keys. */
  device: 'mouse' as 'touch' | 'mouse',
  /** How a desktop player looks: a captured mouse, or dragging where the
   *  capture is refused. */
  lookMode: 'lock' as 'lock' | 'drag',
  /** A desktop mission whose mouse is not captured yet: the click glyph. */
  pointerFree: false,
  /** The exit cutscene may be skipped now (any press): its skip glyph. */
  cineSkip: false,
  /** The beam-in's third-person shot is on (`sim/beamIn.ts`): the HUD waits
   *  until the camera dives into Flux's head. */
  introCine: false,
  /** A freeze-frame shot is running (`sim/freezeCam.ts`): its kind, how it
   *  is framed ('fp' keeps the HUD), whether it skips, presses toward a skip. */
  freezeKind: '' as '' | 'kill' | 'trap' | 'rescue' | 'lesson' | 'sink',
  freezeFrame: '' as '' | 'shoulder' | 'front' | 'above' | 'fp',
  freezeSkippable: false,
  freezeSkips: 0,
  /** The lesson room Flux is in (`sim/training.ts`): its id and beat. */
  trainId: '' as '' | 'charge' | 'block' | 'slide' | 'gel' | 'gap' | 'weapon',
  trainPhase: 'off' as 'off' | 'intro' | 'try' | 'done',
  /** The lesson hologram in view (`fx/lessonHologram.ts`): the input it
   *  presses on its loop and whether it is down right now (where it pins:
   *  `hudLive.holo*`). */
  holoAct: '' as '' | 'fire' | 'block' | 'slide' | 'tank' | 'move' | 'weapon',
  holoDown: false,
  /** The slide lesson holds the Stomper's leap until a slide: three yellow
   *  arrows point at the slide input. */
  slideCue: false,
  /** The block lesson holds the Trooper's first shot at the parry moment
   *  until a block: the block input bounces under yellow arrows (touch), a
   *  mouse with its right button pressing (desktop). */
  blockCue: false,
  /** The tutorial's charge show (`sim/chargeShow.ts`): the game turns onto
   *  a drone ('aim'), holds fire to a full charge ('hold') and lets go
   *  ('release'); the HUD shows that input held meanwhile. */
  chargeShow: '' as '' | 'aim' | 'hold' | 'release',
  /** Atlas's current line is a lesson intro: the gold bubble. */
  atlasGold: false,
  /** The tutorial checklist (mission 1): each lesson, done or not. */
  checklist: [] as Array<{ id: string; done: boolean; current: boolean }>,
  /** Kill-cams shown this mission (the counter chip during one). */
  killCams: 0,
  /** Flux's speech bubble (`FluxBubble.vue`): the i18n key of his line,
   *  and a count that grows with each one, so the same line pops again. */
  sayKey: '',
  saySeq: 0,
  /** Atlas's speech bubble (`sim/atlas.ts`, `AtlasBubble.vue`): the i18n key
   *  of its line ('' = none), and a count that grows with each line. */
  atlasKey: '',
  atlasSeq: 0,
  /** Sector / mission title card. */
  titleKey: '',
  titleSub: '',
  titleShownAt: 0,
  /** The card's look: '' a Core Master's, 'challenge' the CHALLENGE label
   *  over a mini-boss's name in gold. */
  titleStyle: '' as '' | 'challenge'
})

export type HudTicker = (dt: number) => void
const tickers = new Set<HudTicker>()
/** Register a per-frame HUD callback (direct DOM writes). Returns a remover. */
/**
 * Per-frame values the HUD paints with direct DOM writes from its ticker —
 * NOT reactive, so a number that changes every frame never re-renders a
 * component. Written by the mission's HUD sync.
 */
export const hudLive = {
  /** Seconds of slide cooldown left, and the full cooldown it started from. */
  slideCd: 0,
  slideCdMax: 1,
  /** Where Atlas's model is on screen (viewport fractions, top-left origin),
   *  for its bubble; `atlasIn` = it is in view. */
  atlasX: 0.14,
  atlasY: 0.3,
  atlasIn: false,
  /** Where the lesson hologram's glyph pins, over its head (px, top-left
   *  origin); `holoOn`: on screen. */
  holoX: 0,
  holoY: 0,
  holoOn: false,
  /** Flux in a Searchlight Drone's light: 0 dark, 0.5 lit, 1 locked on
   *  (`sim/enemies.ts` `spotWarning`); ScreenFx glows the screen's edge. */
  spotLit: 0
}

export const addHudTicker =(fn: HudTicker): (() => void) => {
  tickers.add(fn)
  return () => { tickers.delete(fn) }
}
export const tickHud = (dt: number): void => {
  for (const fn of tickers) fn(dt)
}

// ─── Transient events (drained by the HUD ticker) ───────────────────────────

export type HudEvent =
  | { t: 'damage'; x: number; y: number; z: number; amount: number; crit: boolean; weak: boolean; toPlayer: boolean }
  | { t: 'text'; x: number; y: number; z: number; key: string; color: string; params?: Record<string, string | number> }
  | { t: 'toast'; key: string; params?: Record<string, string | number>; color?: string; icon?: string }
  | { t: 'flash'; color: string; strength: number }
  | { t: 'hurt'; strength: number }
  /** A shot on a weak spot: the amber "KRANCK!" that wobbles up and pops.
   *  `key` swaps the word, same look (the training drone's "TOO WEAK!"). */
  | { t: 'kranck'; x: number; y: number; z: number; key?: string }
  /** An item found in the mission: its card (`LootCard.vue`). */
  | { t: 'loot'; item: Item }

export const hudEvents: HudEvent[] = []
export const pushHud = (e: HudEvent): void => {
  if (hudEvents.length < 64) hudEvents.push(e)
}
