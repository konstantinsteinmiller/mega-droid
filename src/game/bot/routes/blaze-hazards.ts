import { CELL, type Terrain } from '../../world/levelGen'
import { groundAt } from '../../world/nav'
import { VENT_WARN, inJet } from '../../sim/stages/vents'
import type { BotMission } from '../view'

/**
 * The Meltdown Descent's timed hazards as pure functions of the mission clock:
 * fire vents, rolling ember barrels, forge hammers. `unsafeAt(m, x, y, z, t)`
 * answers "would a body with its feet at (x, y, z) be hit at absolute time t",
 * so the bot can look a second ahead and wait for the gap, as a player reads
 * the lamps and rings. The numbers are the ones in `sim/climb.ts` and
 * `sim/stages/vents.ts`, widened a little for the bot's own timing error.
 */

/** Crusher cycle, as in `sim/climb.ts`. */
const CR_WARN = 0.75
const CR_SLAM = 0.12
const CR_HOLD = 0.45
const CR_RISE = 0.9
const CR_SIZE = 2.5
/** Barrels. */
const BALL_R = 0.55
const BALL_HATCH = 2.5
const BALL_V0 = 3
const BALL_ACC = 6
const BALL_VMAX = 9
const PLAYER_R = 0.62
const GRAVITY = 26

/** Safety margins (s / m). */
const VENT_PRE = 0.2
const VENT_POST = 0.12
const CR_PRE = 0.15
const CR_POST = 0.2
const BALL_PAD = 0.45

const mod = (a: number, b: number): number => ((a % b) + b) % b

const lanePos = (tau: number, len: number): number | null => {
  // Metres rolled `tau` seconds after landing on the stairs (null: gone).
  const t1 = (BALL_VMAX - BALL_V0) / BALL_ACC
  const s = tau <= t1 ? BALL_V0 * tau + 0.5 * BALL_ACC * tau * tau : BALL_V0 * t1 + 0.5 * BALL_ACC * t1 * t1 + BALL_VMAX * (tau - t1)
  return s >= len + 0.5 ? null : s
}

interface ShellLike { active: boolean; owner: string; kind: string; tx: number; tz: number; t: number; dur: number }

/** Enemy shells in the air: where each lands and when (the marker on the floor). */
const shellHit = (m: BotMission, x: number, z: number, t: number): boolean => {
  const shots = (m as unknown as { system?: { shots?: ShellLike[] } }).system?.shots
  if (!shots) return false
  const now = m.time
  for (const s of shots) {
    if (!s.active || s.owner !== 'enemy' || s.kind !== 'shell') continue
    const land = now + (s.dur - s.t)
    if (t < land - 0.12 || t > land + 0.15) continue
    if ((x - s.tx) ** 2 + (z - s.tz) ** 2 < (1.9 + PLAYER_R + 0.5) ** 2) return true
  }
  return false
}

/** Leaps onto a marked spot (a Guardroid's stomp, a Master's stomp / leap slam),
 *  a Master's charged blast ring, and the floor waves in flight. */
interface WaveLike { active: boolean; x: number; z: number; dx: number; dz: number; speed: number; hw: number; travel: number; range: number; hit: boolean }

export interface HazardOpts { rings?: boolean; slow?: boolean }
interface RingLike { active: boolean; x: number; z: number; r: number; speed: number; maxR: number; hit: boolean }

const attackHit = (m: BotMission, x: number, z: number, t: number, o: HazardOpts): boolean => {
  const now = m.time
  if (o.rings === true) {
    const rings = (m as unknown as { system?: { rings?: RingLike[] } }).system?.rings
    for (const r of rings ?? []) {
      if (!r.active || r.hit) continue
      const D = Math.hypot(x - r.x, z - r.z)
      const rt = r.r + r.speed * (t - now)
      if (rt <= r.maxR + 0.1 && Math.abs(D - rt) < 0.95) return true
    }
  }
  for (const e of m.enemies) {
    if (o.rings === true && e.boss && e.attack === 'leapSlam' && (e.state === 'tele' || e.state === 'act')) {
      const land = e.state === 'tele' ? now + Math.max(0, e.teleDur - e.st) + 0.7 : now + Math.max(0, 0.7 - e.st)
      const D = Math.hypot(x - e.tx, z - e.tz)
      const rt = 0.3 + 8 * (t - land)
      if (t >= land && rt <= 8.1 && Math.abs(D - rt) < 0.95) return true
    }
    if (o.slow === false) continue
    if (e.state !== 'tele' && e.state !== 'act') continue
    if (e.attack === 'stomp' || e.attack === 'leapSlam') {
      const flight = e.boss ? (e.attack === 'stomp' ? 0.75 : 0.7) : 0.8
      const land = e.state === 'tele' ? now + Math.max(0, e.teleDur - e.st) + flight : now + Math.max(0, flight - e.st)
      if (t < land - 0.15 || t > land + 0.2) continue
      const r = e.boss ? 2.8 : 2.6
      if ((x - e.tx) ** 2 + (z - e.tz) ** 2 < (r + PLAYER_R + 0.5) ** 2) return true
    } else if (e.boss && e.attack === 'chargedBlast') {
      const r = (e.def as unknown as { blast: { r: number } }).blast.r
      const burst = e.state === 'tele' ? now + Math.max(0, e.teleDur - e.st) + 3 : now + Math.max(0, 3 - e.st)
      if (t > burst + 0.15) continue
      if ((x - e.x) ** 2 + (z - e.z) ** 2 < (r + PLAYER_R + 0.7) ** 2) return true
    }
  }
  const waves = (m as unknown as { system?: { waves?: WaveLike[] } }).system?.waves
  if (waves && true) {
    for (const w of waves) {
      if (!w.active || w.hit) continue
      const tau = t - now
      const trav = w.speed * tau
      if (w.travel + trav > w.range) continue
      const wx = w.x + w.dx * trav
      const wz = w.z + w.dz * trav
      const along = (x - wx) * w.dx + (z - wz) * w.dz
      const lat = Math.abs((x - wx) * -w.dz + (z - wz) * w.dx)
      // The front is a point in time: the band it sweeps in a frame, widened.
      if (Math.abs(along) < 0.7 + w.speed * 0.08 && lat < w.hw + PLAYER_R * 0.5 + 0.45) return true
    }
  }
  return false
}

export const unsafeAt = (m: BotMission, x: number, y: number, z: number, t: number, o: HazardOpts = {}): boolean => {
  if ((o.slow !== false && shellHit(m, x, z, t)) || attackHit(m, x, z, t, o)) return true
  const tr = m.map.terrain as Terrain | undefined
  if (!tr) return false
  for (const v of tr.vents ?? []) {
    if (v.kind !== 'fire') continue
    if (Math.abs(v.y - y) > 4) continue
    const u = mod(t + v.phase, v.period)
    if (u < VENT_WARN - VENT_PRE || u > VENT_WARN + v.on + VENT_POST) continue
    // A little wider than the jet: a step either side of the edge.
    if (inJet(v, x, y, z) || inJet(v, x + 0.3, y, z) || inJet(v, x - 0.3, y, z) || inJet(v, x, y, z + 0.3) || inJet(v, x, y, z - 0.3)) return true
  }
  for (const cr of tr.crushers) {
    if (Math.abs(cr.y - y) > 1.4) continue
    const cx = (cr.i + 0.5) * CELL
    const cz = (cr.j + 0.5) * CELL
    if (Math.abs(x - cx) > CR_SIZE / 2 + PLAYER_R + 0.2 || Math.abs(z - cz) > CR_SIZE / 2 + PLAYER_R + 0.2) continue
    const period = Math.max(cr.period, CR_WARN + CR_SLAM + CR_HOLD + CR_RISE + 0.1)
    const u = mod(t + cr.phase, period)
    if (u >= CR_WARN - CR_PRE && u < CR_WARN + CR_SLAM + CR_HOLD + CR_POST) return true
  }
  for (const ln of tr.lanes) {
    const topY = groundAt(m.map, ln.x, ln.z)
    if (Math.abs(y - topY) > 1.6) continue
    const drop = Math.sqrt(2 * (BALL_HATCH - BALL_R) / GRAVITY)
    // Balls in flight: released at n·period + phase; longest life ~ 5 s.
    const nLast = Math.floor((t - ln.phase) / ln.period)
    for (let n = nLast; n >= nLast - 3; n--) {
      if (n < 1) continue
      const tau = t - (n * ln.period + ln.phase) - drop
      if (tau < -0.3) continue
      const s = tau < 0 ? 0 : lanePos(tau, ln.len)
      if (s === null) continue
      const bx = ln.x + ln.dx * s
      const bz = ln.z + ln.dz * s
      const reach = BALL_R + PLAYER_R * 0.75 + BALL_PAD
      if ((x - bx) ** 2 + (z - bz) ** 2 < reach * reach) return true
    }
  }
  return false
}
