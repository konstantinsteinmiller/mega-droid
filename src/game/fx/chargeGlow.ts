import { Color } from 'three'
import type { ChargeInfo } from '../sim/stats'

/**
 * ─── The buster's charge glow ────────────────────────────────────────────────
 *
 * How the arm cannon's muzzle looks while a charge is held, in one place, so a
 * cutscene's charge is the game's own (#137: the intro previews the Overload
 * with the colours a player will see): green through the first level, the
 * full charge's flickering cyan, the cyan bleeding to violet on the way to
 * the Overload, and the Overload itself, a gold-white core in a breathing
 * violet halo. `Mission` paints its viewmodel with it, the intro its street.
 */

/** The Overload's violet (the prototype tier's), mixed into the core as it builds. */
export const OVERLOAD_VIOLET = new Color('#b46cff')

export interface ChargeGlow {
  core: Color
  halo: Color
  haloOpacity: number
  /** The core's and the halo's scale (1 = the idle muzzle's). */
  coreScale: number
  haloScale: number
  /** Overloaded: the halo turns, the arm trembles and spits violet sparks
   *  (the owner's to draw). */
  over: boolean
}

export const newChargeGlow = (): ChargeGlow => ({
  core: new Color(), halo: new Color(), haloOpacity: 0, coreScale: 1, haloScale: 1, over: false
})

/**
 * The glow for a charge at `info`; `time` is any steady clock (s), for the
 * full charge's flicker and the Overload's pulse, and `base` the core's idle
 * colour (shown before the first level is near). Written into `out`.
 */
export const chargeGlowAt = (info: ChargeInfo, time: number, base: Color, out: ChargeGlow): ChargeGlow => {
  if (info.level === 3) {
    // Overloaded: a gold-white core in a violet halo that breathes (2.5 Hz,
    // under the 3-flashes-a-second line).
    const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 5)
    out.core.set('#fff6d6')
    out.halo.set(pulse > 0.5 ? '#b46cff' : '#d38bff')
    out.haloOpacity = 0.6 + 0.3 * pulse
    out.coreScale = 2.5 + pulse * 0.3
    out.haloScale = 2.0 + pulse * 0.4
    out.over = true
    return out
  }
  const lv = info.level
  const flick = lv >= 2 ? (Math.floor(time * 30) % 2 === 0 ? 1 : 0.55) : 1
  if (info.perfect) out.core.set('#ffd84a')
  // Building toward the Overload: the full-charge cyan bleeds to violet.
  else if (lv >= 2 && info.toL3 > 0) out.core.set('#7ff4ff').lerp(OVERLOAD_VIOLET, info.toL3 * 0.7)
  else if (lv >= 2) out.core.set('#7ff4ff')
  else if (lv === 1) out.core.set('#c8ff7a')
  else out.core.copy(base)
  out.halo.copy(out.core)
  out.haloOpacity = (0.25 + 0.45 * (lv >= 1 ? 1 : info.toL1)) * flick
  out.coreScale = 1 + info.toL1 * 0.6 + info.toL2 * 0.9
  out.haloScale = 0.6 + info.toL1 * 0.6 + info.toL2 * 0.8 + (info.perfect ? 0.3 : 0)
  out.over = false
  return out
}
