import type { ChargeInfo } from '@/game/sim/stats'

/**
 * The charge ring round the crosshair, painted with direct style writes (the
 * HUD ticker's way): the inner ring fills to charge level 1, the outer to the
 * full charge; at full charge it flickers, inside the PERFECT window it turns
 * gold, and with the Overload the inner ring refills in violet, then both
 * glow violet. `Crosshair.vue` paints it in play, the intro's layer in its
 * Overload preview (#137); its look is `chargeRing.sass`.
 */

export const RING_C1 = 2 * Math.PI * 40
export const RING_C2 = 2 * Math.PI * 46

export type RingState = 'idle' | 'l1' | 'full' | 'full2' | 'build' | 'over' | 'perfect'

/** The ring's state for a charge at `info`; `t` any steady clock (s), for the full charge's flicker. */
export const ringState = (info: ChargeInfo, t: number): RingState => {
  const full = info.level >= 2
  const flick = full && Math.floor(t * 24) % 2 === 0
  return info.perfect ? 'perfect'
    : info.level === 3 ? 'over'
      : info.toL3 > 0 ? 'build'
        : full ? (flick ? 'full' : 'full2') : info.level === 1 ? 'l1' : 'idle'
}

/** Set the rings' dash lengths once (on mount). */
export const initChargeRing = (l1: SVGCircleElement, l2: SVGCircleElement): void => {
  l1.style.strokeDasharray = `${RING_C1}`
  l2.style.strokeDasharray = `${RING_C2}`
}

/** Fill the rings and set the state; `showing` false empties them. */
export const paintChargeRing = (xh: HTMLElement, l1: SVGCircleElement, l2: SVGCircleElement, info: ChargeInfo, showing: boolean, t: number): void => {
  l1.style.strokeDashoffset = `${RING_C1 * (1 - (showing ? info.toL1 : 0))}`
  l2.style.strokeDashoffset = `${RING_C2 * (1 - (showing ? info.toL2 : 0))}`
  // Past full charge with the Overload: the inner ring refills in violet.
  if (info.toL3 > 0) l1.style.strokeDashoffset = `${RING_C1 * (1 - info.toL3)}`
  xh.dataset.state = ringState(info, t)
}
