import type { WalkNeed } from './walkthrough'
import type { InputFamily } from './coach'
import { bearingOf } from '../state/damageFeed'

/**
 * ─── The held door's prompt: "Finish the lesson", and which way ──────────────
 *
 * A tutorial gate stays shut until its room's lesson is done (`walkthrough.ts`)
 * and a red lamp over the lintel does not say so: two blind testers stood at a
 * gate not knowing what it wanted. So when Flux walks into a held door (or
 * keeps pushing against it), shoots it, or waits within IDLE_RANGE of it for
 * IDLE_AFTER outside a fight, three things come up:
 *
 * - the label "Finish the lesson" (`walk.finishLesson`), red-accented, in the
 *   top third — the one line of text in the walk;
 * - a red arrow toward the lesson (`Walkthrough.goal`), turning live with the
 *   view: beside the label, or on the screen's edge while the lesson is
 *   behind (`promptArrow`);
 * - on the door itself, the glyph of the input its step needs (`doorInput`),
 *   pulsing on each bump, shot and wait.
 *
 * It holds PROMPT_HOLD after the last push, then fades; it comes on (and its
 * glyph pulses) at most once every PROMPT_GAP, and never over a fight, a
 * modal or the exit cutscene. The waiting trigger also calls the room's
 * teacher, CALL_DELAY later so the label and the arrow read first (the
 * mission wakes it: the fight that follows is the lesson). Pure: the
 * mission feeds a tick, the HUD (`DoorPrompt.vue`) reads the answer.
 * Allocation-free per step.
 */

/** The prompt holds this long after the last bump (s)… */
export const PROMPT_HOLD = 3
/** …then fades out over this (s). */
export const PROMPT_FADE = 0.4
/** It comes on — and its glyph pulses — at most once this often (s). */
export const PROMPT_GAP = 1.5
/** Waiting this near a held door (m)… (a door sits at the far end of its
 *  corridor: playtesters stood at the mouth, about 6 m off, and never saw it) */
export const IDLE_RANGE = 8
/** …this long (s), outside a fight, is being stuck at it. */
export const IDLE_AFTER = 8
/** Walking up this close (m) to a held door shows the prompt at once: most
 *  players never pushed or waited, they turned away thinking it a dead end. */
export const CLOSE_RANGE = 7
/** The teacher is called this long after the wait trigger (s): its fight
 *  hides the prompt, so the prompt gets its moment first. */
export const CALL_DELAY = 1.5

/** What the mission tells the prompt each step (a door is its id, -1: none). */
export interface DoorTick {
  time: number
  /** Live play: no modal, not the beam-in or the exit cutscene. */
  playing: boolean
  combat: boolean
  /** The held door Flux pushes against this step. */
  press: number
  /** The held door a shot of his is about to meet. */
  shot: number
  /** The held door he stands within IDLE_RANGE of. */
  near: number
  /** The held door he has walked up to within CLOSE_RANGE. */
  close: number
}

export class DoorPrompt {
  /** The door the prompt is about (-1 while it is off). */
  door = -1
  /** 0..1: the label's, the arrow's and the glyph's opacity. */
  alpha = 0
  /** Counts the glyph's pulses (a bump, a shot, the wait): the HUD replays
   *  its pulse on each change. */
  pulse = 0
  /** The wait trigger fired on this step. */
  idled = false
  /** Call the room's teacher on this step: CALL_DELAY after the wait
   *  trigger, still in play and out of a fight. */
  call = false
  private callAt = -1
  private on = false
  private onAt = -Infinity
  private lastAt = -Infinity
  private pulseAt = -Infinity
  /** The door pushed against on the last step: a push is a bump on its
   *  first step only; held on, it keeps the prompt up without a pulse. */
  private pressing = -1
  private waitDoor = -1
  private waitFrom = 0
  private closing = -1

  update(o: DoorTick): void {
    this.idled = false
    this.call = false
    if (!o.playing || o.combat) {
      this.hide()
      this.pressing = -1
      this.waitDoor = -1
      this.callAt = -1
      return
    }
    const t = o.time
    if (o.near < 0) this.waitDoor = -1
    else if (o.near !== this.waitDoor) {
      this.waitDoor = o.near
      this.waitFrom = t
    } else if (t - this.waitFrom >= IDLE_AFTER) {
      // Stuck: again after another IDLE_AFTER if he still waits.
      this.waitFrom = t
      this.idled = true
      this.callAt = t + CALL_DELAY
      this.trigger(o.near, t, true)
    }
    if (this.callAt >= 0 && t >= this.callAt) {
      this.call = true
      this.callAt = -1
    }
    // Walked up to it: on at once, held while he stays that close.
    if (o.close >= 0) this.trigger(o.close, t, o.close !== this.closing)
    this.closing = o.close
    if (o.shot >= 0) this.trigger(o.shot, t, true)
    if (o.press >= 0) this.trigger(o.press, t, o.press !== this.pressing)
    this.pressing = o.press
    if (!this.on) return
    const age = t - this.lastAt
    if (age >= PROMPT_HOLD + PROMPT_FADE) this.hide()
    else this.alpha = age <= PROMPT_HOLD ? 1 : 1 - (age - PROMPT_HOLD) / PROMPT_FADE
  }

  /** Off at once (the door opened, the mission ended). */
  hide(): void {
    this.on = false
    this.alpha = 0
    this.door = -1
  }

  /** A bump, a shot or the wait at `door`; `fresh` = a new one (a push held
   *  on only keeps the prompt up). */
  private trigger(door: number, t: number, fresh: boolean): void {
    const show = !this.on
    if (show) {
      if (t - this.onAt < PROMPT_GAP) return
      this.on = true
      this.onAt = t
    }
    this.door = door
    this.lastAt = t
    this.alpha = 1
    if ((show || fresh) && t - this.pulseAt >= PROMPT_GAP) {
      this.pulse++
      this.pulseAt = t
    }
  }
}

// ─── The arrow ───────────────────────────────────────────────────────────────

export interface ArrowPose {
  /** Turn from pointing up (= straight ahead), clockwise, rad. */
  rot: number
  /** 0: beside the label; -1 / 1: on the left / right screen edge, the
   *  lesson being behind. */
  edge: -1 | 0 | 1
}

/** Past this bearing (rad, ~100°) the lesson is behind: a plain "right" or
 *  "left" still reads beside the label. */
const BEHIND = Math.PI / 2 + 0.17

/**
 * The arrow toward the lesson at (gx, gz) for Flux at (px, pz) facing `yaw`
 * (the damage markers' bearing: + = right, wrapped to (-π, π]). Ahead of him
 * it turns in place beside the label; behind him it rides the side it is on,
 * pointing out of the screen and tipped down the further behind it is — the
 * turn it asks for. Writes `out`.
 */
export const promptArrow = (gx: number, gz: number, px: number, pz: number, yaw: number, out: ArrowPose): ArrowPose => {
  const b = bearingOf(gx, gz, px, pz, yaw)
  if (Math.abs(b) <= BEHIND) {
    out.rot = b
    out.edge = 0
  } else {
    out.edge = b > 0 ? 1 : -1
    out.rot = out.edge * (Math.PI / 2 + (Math.abs(b) - Math.PI / 2) * 0.5)
  }
  return out
}

// ─── The door's glyph ────────────────────────────────────────────────────────

/** An `InputGlyph`'s props for a door's need, and the action's HUD icon. */
export interface DoorInput {
  kind: 'mouse' | 'key' | 'finger'
  button?: 'left' | 'right'
  hold?: boolean
  click?: boolean
  code?: string
  wide?: boolean
  mode?: 'tap' | 'hold'
  /** The action's `GameIcon` (on touch it names the button to use). */
  icon: 'bolt' | 'buster' | 'shield' | 'dodge' | 'chest' | 'flask'
}

/**
 * The input a held door's need asks for, per hand (the coach's glyph
 * language, `ControlHints.vue`): charge and crate — hold fire; block — hold
 * the right button / the shield; slide — Space / the slide button; chest —
 * E / a tap; gel — H / the gel button; a plain "clear it" room — fire.
 */
export const doorInput = (need: WalkNeed, family: InputFamily): DoorInput => {
  const touch = family === 'touch'
  switch (need) {
    case 'charge':
    case 'crate':
      return touch ? { kind: 'finger', mode: 'hold', icon: 'bolt' } : { kind: 'mouse', button: 'left', hold: true, icon: 'bolt' }
    case 'block':
      return touch ? { kind: 'finger', mode: 'hold', icon: 'shield' } : { kind: 'mouse', button: 'right', hold: true, icon: 'shield' }
    case 'slide':
      return touch ? { kind: 'finger', mode: 'tap', icon: 'dodge' } : { kind: 'key', wide: true, icon: 'dodge' }
    case 'chest':
      return touch ? { kind: 'finger', mode: 'tap', icon: 'chest' } : { kind: 'key', code: 'KeyE', icon: 'chest' }
    case 'gel':
      return touch ? { kind: 'finger', mode: 'tap', icon: 'flask' } : { kind: 'key', code: 'KeyH', icon: 'flask' }
    case 'clear':
    case 'rest':
      return touch ? { kind: 'finger', mode: 'tap', icon: 'buster' } : { kind: 'mouse', button: 'left', click: true, icon: 'buster' }
    case 'weapon':
      // The new weapon's key (its slot's number) / a tap on its button.
      return touch ? { kind: 'finger', mode: 'tap', icon: 'buster' } : { kind: 'key', code: 'Digit1', icon: 'buster' }
    case 'gap':
      // Walk on at the edge: the stick (the W key) — the edge does the leap.
      return touch ? { kind: 'finger', mode: 'hold', icon: 'dodge' } : { kind: 'key', code: 'KeyW', icon: 'dodge' }
  }
}
