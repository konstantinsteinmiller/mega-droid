import { reactive } from 'vue'
import { sfx } from '@/game/audio/sfx'

/**
 * ─── HUD celebrations ────────────────────────────────────────────────────────
 *
 * The two little rewards the HUD acts out (vector SVG, so they stay crisp at
 * any pixel ratio and cost nothing to draw):
 * - `levelUp`: a Hard Hat pops in at the top centre, lifts its helmet and
 *   pulls a green up-arrow out from under it, holds it up, hops off
 *   (`LevelUpPop.vue`);
 * - `objective`: Atlas flies to the objective card, spits a checkmark that
 *   arcs into the badge left of the objective text and bounces there, and
 *   flies off (`ObjectiveTracker.vue`).
 *
 * One plays at a time, the rest wait in order: a boss kill that levels Flux
 * up and finishes the objective in the same frame plays both, one after the
 * other. Each one's sting plays as it STARTS, so a queued one is not heard
 * before it is seen. Reduced motion: a short fade of the same picture.
 */

export type CelebrationKind = 'levelUp' | 'objective'

export interface Celebration {
  id: number
  kind: CelebrationKind
  /** Reduced motion: the simple fade instead of the act. */
  reduced: boolean
}

/** How long each act runs (ms); the CSS keyframes are timed to these. */
export const CELEBRATION_MS: Record<CelebrationKind, number> = { levelUp: 2000, objective: 2000 }
export const CELEBRATION_REDUCED_MS = 900
/** More than this waiting and the oldest wait no longer. */
const QUEUE_MAX = 3

const STING: Record<CelebrationKind, 'levelUp' | 'objective'> = { levelUp: 'levelUp', objective: 'objective' }

export const celebrations = reactive({
  current: null as Celebration | null,
  queue: [] as Celebration[]
})

let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const celebrationMs = (c: Celebration): number => (c.reduced ? CELEBRATION_REDUCED_MS : CELEBRATION_MS[c.kind])

const start = (c: Celebration): void => {
  celebrations.current = c
  sfx(STING[c.kind])
  timer = setTimeout(finishCelebration, celebrationMs(c))
}

/** Queue one act; it starts now if nothing is playing. */
export const pushCelebration = (kind: CelebrationKind): void => {
  const c: Celebration = { id: nextId++, kind, reduced: prefersReducedMotion() }
  if (!celebrations.current) {
    start(c)
    return
  }
  celebrations.queue.push(c)
  if (celebrations.queue.length > QUEUE_MAX) celebrations.queue.shift()
}

/** The playing act is over: the next one starts. */
export const finishCelebration = (): void => {
  if (timer) clearTimeout(timer)
  timer = null
  celebrations.current = null
  const next = celebrations.queue.shift()
  if (next) start(next)
}

/** Is an act of this kind playing or waiting (the objective badge stays
 *  empty until its checkmark has landed)? */
export const celebrationPending = (kind: CelebrationKind): boolean =>
  celebrations.current?.kind === kind || celebrations.queue.some(c => c.kind === kind)

/** The mission HUD is gone: nothing plays on, nothing waits. */
export const resetCelebrations = (): void => {
  if (timer) clearTimeout(timer)
  timer = null
  celebrations.current = null
  celebrations.queue.length = 0
}
