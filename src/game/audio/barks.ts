import { isSpeaking, playVoice, prefetchVoice } from './voice'
import { FUMBLE_LINES } from '../sim/fumble'

/**
 * ─── Flux's barks ────────────────────────────────────────────────────────────
 *
 * A short cartoon yelp when Flux is hit, picked by what hit him
 * (`flux.hurt.<type>.<1-3>` in the voice catalog: three takes per type, one at
 * random, never the same twice in a row). Barks are English for every
 * language (onomatopoeia) and have no bubble.
 *
 * They are seasoning, so they give way: none while Atlas or Vex is speaking,
 * none within BARK_GAP of the last one, and a type that just played waits
 * TYPE_GAP (a burning floor would otherwise yelp every tick). `down` and
 * `pit` are the moments that matter, so they skip the gaps (not a line).
 */

export type BarkType = 'light' | 'heavy' | 'fire' | 'ice' | 'volt' | 'wind' | 'trap' | 'crusher' | 'pit' | 'lowHp' | 'down' | 'parry' | 'gel'
export const BARK_TYPES: readonly BarkType[] = ['light', 'heavy', 'fire', 'ice', 'volt', 'wind', 'trap', 'crusher', 'pit', 'lowHp', 'down', 'parry', 'gel']
export const BARK_GAP = 0.9
export const TYPE_GAP = 2.5
const ALWAYS: ReadonlySet<BarkType> = new Set(['down', 'pit'])

let lastAt = -Infinity
const typeAt = new Map<BarkType, number>()
const lastTake = new Map<BarkType, number>()

/** What a hit is, as a bark: the hazard first, then the attacker's element, then how hard it was. */
export const barkFor = (o: { hazard?: string | null; element?: string | null; hard?: boolean }): BarkType => {
  switch (o.hazard) {
    case 'flame': return 'fire'
    case 'blade': return 'trap'
    case 'ice': return 'ice'
    case 'volt': return 'volt'
    case 'crush': case 'barrel': return 'crusher'
    case 'rock': case 'crate': return 'heavy'
  }
  switch (o.element) {
    case 'fire': return 'fire'
    case 'ice': return 'ice'
    case 'volt': return 'volt'
    case 'wind': return 'wind'
  }
  return o.hard ? 'heavy' : 'light'
}

const now = (): number => performance.now() / 1000

/** Yelp, if the moment allows; returns the line id played, or null. */
export const bark = (type: BarkType, t = now(), rand = Math.random): string | null => {
  const always = ALWAYS.has(type)
  if (isSpeaking() && !always) return null
  if (!always && (t - lastAt < BARK_GAP || t - (typeAt.get(type) ?? -Infinity) < TYPE_GAP)) return null
  const prev = lastTake.get(type) ?? 0
  let take = 1 + Math.floor(rand() * 3)
  if (take === prev) take = (take % 3) + 1
  const id = `flux.hurt.${type}.${take}`
  if (playVoice(id, 'bark') == null) return null
  lastAt = t
  typeAt.set(type, t)
  lastTake.set(type, take)
  return id
}

/** Warm every bark in the background (a few small files), so the first hit already yelps. */
export const preloadBarks = (): void => {
  for (const type of BARK_TYPES) for (let n = 1; n <= 3; n++) prefetchVoice(`flux.hurt.${type}.${n}`)
  // The lines he blurts when a hard hit shakes his charge loose (`sim/fumble.ts`).
  for (let n = 1; n <= FUMBLE_LINES; n++) prefetchVoice(`flux.fumble.${n}`)
}

/** Test seam. */
export const __resetBarks = (): void => {
  lastAt = -Infinity
  typeAt.clear()
  lastTake.clear()
}
