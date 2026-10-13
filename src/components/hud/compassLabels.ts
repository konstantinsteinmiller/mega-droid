/**
 * Which compass pins show their distance (#152). Two pins close together on
 * the strip drew their numbers over each other — 60 m and 121 m read
 * "60121". A number is shown only where it has room: the way to go (the
 * first pin) always, then the nearer pins first; a number that would touch
 * one already shown is left off, so the farther of two crowded pins goes
 * without.
 */

/** The strip's distance font (`--font-pixel` at 8 px): one digit's advance, px. */
export const DIGIT_PX = 8
/** Clear space kept between two numbers, px. */
export const LABEL_GAP = 4

export interface CompassLabel {
  /** Where the pin sits, % of the strip's width. */
  pos: number
  dist: number
}

/** Shown or not, per pin, in the pins' order. */
export const compassLabelsShown = (pins: readonly CompassLabel[], stripPx: number, digitPx = DIGIT_PX): boolean[] => {
  const shown = pins.map(() => false)
  if (stripPx <= 0) return shown
  const half = (p: CompassLabel): number => (String(Math.round(p.dist)).length * digitPx) / 2
  const order = pins.map((_, i) => i).sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : pins[a]!.dist - pins[b]!.dist))
  const taken: [number, number][] = []
  for (const i of order) {
    const p = pins[i]!
    const c = (p.pos / 100) * stripPx
    const l = c - half(p)
    const r = c + half(p)
    if (taken.some(([a, b]) => l < b + LABEL_GAP && a < r + LABEL_GAP)) continue
    taken.push([l, r])
    shown[i] = true
  }
  return shown
}
