/**
 * The weak-spot call-out, "KRANCK!": a cartoon sound word that wobbles as it
 * grows, holds, then pops away. `FloatingText.vue` shows it on every weak-spot
 * hit, the intro's layer on its Overload shot (#137); its look is `kranck.sass`.
 */

/** Its whole life (s): up, wobble, gone. */
export const KRANCK_LIFE = 0.62

/** Its CSS rotate and scale `age` seconds in (scale 0 once its life is over). */
export const kranckTransform = (age: number): string => {
  const k = Math.min(1, Math.max(0, age / KRANCK_LIFE))
  // Grows a bit while it wobbles, holds, then shrinks away almost at once.
  const grow = k < 0.7 ? 0.55 + 0.75 * (1 - (1 - k / 0.7) ** 3) : 1.3 * (1 - ((k - 0.7) / 0.3) ** 0.6)
  const wob = Math.sin(age * 38) * 14 * (1 - k)
  return `rotate(${wob.toFixed(1)}deg) scale(${Math.max(0, grow).toFixed(3)})`
}
