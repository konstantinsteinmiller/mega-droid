/**
 * ─── The ending, "First Free Morning" (#102): the script ─────────────────────
 *
 * After the Grand Master falls (and its results), the outro: about a minute
 * and a half of film, then the credits, then an end card on the sunrise with
 * "Start New Game+". Pure data and functions of time, like `introScript.ts`,
 * so a test can step it without a GPU. `EndingMode` (`story/ending.ts`) plays
 * it; `EndingLayer.vue` shows the captions, the credits and the card.
 *
 *   valley   0–16    Vex's red signal still on the valley; then a white ring
 *                    rolls out from the Spire and the relays come home, one by
 *                    one, in their own colours
 *   lab     16–40    the ice lets go of Gauss's capsule; she steps out; Pip
 *                    and Atlas
 *   sunrise 40–60    the valley at dawn, the camera drifting
 *   credits 60–96    the roll, over the sunrise
 *   card    96–      the end card (the film idles behind it)
 *
 * A caption holds CAPTION_HOLD s (long enough to read in any language, the
 * playbook's ~6–7 s a beat); a tap anywhere advances to the next one, and Skip
 * (always visible) goes straight to the card.
 */

export type EndingShot = 'valley' | 'lab' | 'sunrise'

export const LAB_FROM = 16
export const SUNRISE_FROM = 40
export const CREDITS_FROM = 60
export const CARD_FROM = 96
/** The white ring's roll across the valley (s). */
export const FREE_FROM = 4
export const FREE_TO = 12
/** The capsule: its frost melts, its glass slides down, Gauss steps out. */
export const THAW_FROM = 17
export const THAW_TO = 22
export const OPEN_FROM = 22
export const OPEN_TO = 25
export const STEP_FROM = 25
export const STEP_TO = 28

export const CAPTION_HOLD = 6.5

export type Speaker = '' | 'atlas' | 'gauss' | 'pip'

export interface Caption {
  at: number
  key: string
  speaker: Speaker
}

/** The lines, in order (keys under `ending.`). */
export const CAPTIONS: readonly Caption[] = [
  { at: 1.5, key: 'fall', speaker: 'pip' },
  { at: 9, key: 'relays', speaker: 'pip' },
  { at: 18, key: 'thaw', speaker: 'pip' },
  { at: 27, key: 'gauss', speaker: 'gauss' },
  { at: 33.5, key: 'atlas', speaker: 'atlas' },
  { at: 42, key: 'morning', speaker: 'pip' },
  { at: 50, key: 'spark', speaker: 'gauss' }
]

export const shotAt = (t: number): EndingShot => (t < LAB_FROM ? 'valley' : t < SUNRISE_FROM ? 'lab' : 'sunrise')

/** The caption showing at `t`, or null between lines. */
export const captionAt = (t: number): Caption | null => {
  for (let n = CAPTIONS.length - 1; n >= 0; n--) {
    const c = CAPTIONS[n]!
    if (t >= c.at) return t < c.at + CAPTION_HOLD ? c : null
  }
  return null
}

/** A tap: the time of the next caption (or the credits after the last). */
export const nextBeat = (t: number): number => {
  for (const c of CAPTIONS) if (c.at > t + 0.05) return c.at
  return Math.max(t, CREDITS_FROM)
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
export const ramp = (a: number, b: number, t: number): number => clamp01((t - a) / (b - a))
