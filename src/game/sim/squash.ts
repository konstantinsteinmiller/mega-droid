/**
 * A press or a rolling barrel flattens Flux like a cartoon (#116), every
 * time, with the camera on him: pressed flat in a blink, a beat flat, then
 * he springs back up past his size and settles (s; the press head rises
 * first, so he does not grow through it).
 */
export const SQUASH_HAZARDS: ReadonlySet<string> = new Set(['barrel', 'crush'])
export const SQUASH_DUR = 1.25
export const SQUASH_IN = 0.08
export const SQUASH_LIFT = 0.25
export const SQUASH_SPRING = 0.5
/** Flat: his height and width then (× his own). */
export const SQUASH_FLAT_Y = 0.22
export const SQUASH_FLAT_W = 1.5
/** The spring back up (0..1 over SQUASH_SPRING): overshoots ~20 %, settles. */
export const squashSpring = (k: number): number => 1 - Math.cos(k * Math.PI * 3) * Math.exp(-5 * k)
/** Flux's height factor `t` s into a squash shot of `dur` s. */
export const squashY = (t: number, dur = SQUASH_DUR): number => {
  if (t < SQUASH_IN) return 1 - (1 - SQUASH_FLAT_Y) * (t / SQUASH_IN)
  const from = dur - SQUASH_SPRING
  if (t < from) return SQUASH_FLAT_Y
  return SQUASH_FLAT_Y + (1 - SQUASH_FLAT_Y) * squashSpring(Math.min(1, (t - from) / SQUASH_SPRING))
}
