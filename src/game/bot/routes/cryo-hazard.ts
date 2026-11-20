import type { Ctx } from '../ctx'
import { inFrostCone, FROST_WARN } from '../../sim/stages/frost'
import { ICICLE_WARN } from '../../sim/stages/icicles'

/**
 * What the cryo stage's timed hazards will do to a spot: frost throwers (a cone
 * across a lane, on a period) and icicles (a ring that drops on a period). The
 * bot reads the features' clocks the way a player reads the telegraphs: it
 * waits before a lane or a ring that is about to fire.
 */
interface Nozzle { def: { period: number; phase: number; on: number }; mx: number; mz: number; len: number; floor: number }
interface Icicle { def: { period: number; phase: number; y: number }; x: number; z: number; fall: number }
interface Features { features?: Array<{ nozzles?: Nozzle[]; icicles?: Icicle[] }> }

const lists = (c: Ctx): { nozzles: Nozzle[]; icicles: Icicle[] } => {
  const f = (c.m.climb as unknown as Features | null)?.features ?? []
  const nozzles: Nozzle[] = []
  const icicles: Icicle[] = []
  for (const x of f) {
    if (x.nozzles) nozzles.push(...x.nozzles)
    if (x.icicles) icicles.push(...x.icicles)
  }
  return { nozzles, icicles }
}

/** Seconds until the next hit window on (x, z) at floor height `y` starts
 *  (0 = it is hitting now), Infinity when nothing reaches it. */
export const hazardIn = (c: Ctx, x: number, z: number, y: number): number => {
  const { nozzles, icicles } = lists(c)
  const time = c.m.time
  let best = Infinity
  for (const n of nozzles) {
    if (Math.abs(y - n.floor) > 1.2) continue
    if (!inFrostCone(n as never, x, z)) continue
    const period = Math.max(n.def.period, FROST_WARN + n.def.on + 0.3)
    const u = (time + n.def.phase) % period
    const start = FROST_WARN
    const end = FROST_WARN + n.def.on
    let t: number
    if (u < start) t = start - u
    else if (u < end) t = 0
    else t = period - u + start
    best = Math.min(best, t)
  }
  for (const q of icicles) {
    if (Math.abs(y - q.def.y) > 1.2) continue
    if (Math.hypot(x - q.x, z - q.z) > 2.0) continue
    const period = Math.max(q.def.period, ICICLE_WARN + q.fall + 0.3 + 0.6)
    const u = (time + q.def.phase) % period
    const hit = ICICLE_WARN + q.fall
    // The damage is one instant, at the crash; the quiet is everything else.
    let t = hit - u
    if (t < 0) t += period
    // Just landed (a hair ago): over.
    best = Math.min(best, t)
  }
  return best
}

/** Is it safe to be at (x, z) for the next `dwell` seconds? */
export const safeFor = (c: Ctx, x: number, z: number, y: number, dwell: number): boolean => {
  const { nozzles, icicles } = lists(c)
  if (!nozzles.length && !icicles.length) return true
  const t = hazardIn(c, x, z, y)
  if (t === Infinity) return true
  // A frost blast covers a span (hit once per blast: being inside when it
  // starts or at any moment of it); an icicle is one instant.
  return t > dwell
}

let lastHp = -1
/** Log every drop of health with what was near: the playtester's notes. */
export const watchHp = (c: Ctx): void => {
  const hp = c.m.combat.hp
  if (lastHp > 0 && hp < lastHp - 0.5) {
    const near = c.foes({ awake: true }).slice(0, 3).map(e => `${e.kind}:${e.state}${e.teleRed ? "R" : ""}:${e.attack ?? ""} d${c.dist(e.x, e.z).toFixed(1)} hp${Math.round(e.hp)}/${Math.round(e.maxHp)}`).join(',')
    c.log(`hp ${lastHp.toFixed(0)}->${hp.toFixed(0)} at ${c.p.x.toFixed(1)},${c.p.z.toFixed(1)} blk=${c.m.combat.blocking} slcd=${c.m.combat.slideCd.toFixed(1)} pw=${Math.round(c.m.combat.power)} fcd=${c.m.combat.fireCd.toFixed(1)} near: ${near}`)
  }
  lastHp = hp
}

/** Cells the planner should keep out of: round the slow heavy melee machines
 *  that are awake (a brute hits for half his health; he is slower than Flux). */
export const dangerCells = (c: Ctx): Set<number> => {
  const out = new Set<number>()
  const W = c.m.map.w
  for (const e of c.foes({ awake: true })) {
    if (e.kind === 'turret') {
      const ti = Math.floor(e.x / 3)
      const tj = Math.floor(e.z / 3)
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) out.add((tj + dj) * W + ti + di)
      continue
    }
    if (e.kind !== 'brute' && e.kind !== 'warden' && e.kind !== 'stalker') continue
    const ci = Math.floor(e.x / 3)
    const cj = Math.floor(e.z / 3)
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) out.add((cj + dj) * W + ci + di)
  }
  return out
}
