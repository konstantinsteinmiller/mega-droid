import type { EnemyKind } from '../models/enemies'
import type { BossId } from '../models/bosses'

/**
 * ─── Weak spots ──────────────────────────────────────────────────────────────
 *
 * Every machine and every Core Master has one weak spot: a small sphere on
 * its body. The androids' is the head; the other machines' is somewhere
 * their build leaves open — a rotor drone's tail, a stomper's back, a gear
 * roller's exhaust, a wall cannon's power core, a crate golem's back. A
 * shot that lands on it hits ×1.5 (`WEAK_SPOT_MUL`) with the amber "KRANCK!".
 *
 * It rewards AIM, never the aim assist: a shot only goes for a weak spot when
 * the crosshair itself is on it as it is fired (`weakSpotUnderRay`). A shot
 * the auto-aim or the lock-on steered — toward the body's middle — carries no
 * weak spot, so it can never land one, however close it passes.
 *
 * Offsets are in the machine's own frame, in metres at its normal size:
 * `up` from its feet (a flyer's hover height included), `fwd` along the way
 * it faces (negative = its back), `side` to its right. Elites are bigger
 * (×1.18), and the spot with them.
 */

export type WeakPart = 'head' | 'back' | 'tail' | 'core' | 'dome'

export interface WeakSpot {
  part: WeakPart
  up: number
  fwd: number
  side: number
  r: number
}

export const WEAK_SPOT_MUL = 1.5

const spot = (part: WeakPart, up: number, fwd: number, r: number, side = 0): WeakSpot => ({ part, up, fwd, side, r })

export const ENEMY_WEAK: Record<EnemyKind, WeakSpot> = {
  // Androids: the head.
  hardhat: spot('head', 0.66, 0.1, 0.2),
  trooper: spot('head', 1.52, 0.05, 0.21),
  brute: spot('head', 2.02, 0.1, 0.28),
  // Robots: where they are open.
  heli: spot('tail', -0.05, -0.55, 0.2),
  hopper: spot('back', 1.4, -0.62, 0.26),
  roller: spot('back', 0.95, -0.72, 0.26),
  turret: spot('core', 0.8, -0.5, 0.22),
  golem: spot('back', 1.15, -0.55, 0.26),
  // The bare core, under the shells' front seam.
  polar: spot('core', 0, 0.22, 0.17),
  // The engine on its back.
  mole: spot('back', 0.6, -0.42, 0.2),
  // Its mouth, under the eyes.
  puffer: spot('core', -0.06, 0.34, 0.15),
  // The head, its eyes.
  stalker: spot('head', 1.05, 0.2, 0.18),
  // Its lamp, slung under its nose: from the front, the side it shines at.
  spotter: spot('core', -0.12, 0.42, 0.19),
  // Its stinger end.
  hornet: spot('tail', -0.02, -0.5, 0.17),
  // Its core, bare when the shutters open.
  warden: spot('core', 0.95, 0.3, 0.25),
  // The reactor on its back.
  gatekeeper: spot('back', 1.4, -1.1, 0.35),
  // A Master's head.
  echo: spot('head', 1.7, 0.08, 0.3),
  // A challenge mini-boss carries its own (`WeakBody.def.weak`); this is the
  // fallback: its back.
  miniboss: spot('back', 1.4, -0.4, 0.3)
}

export const BOSS_WEAK: Record<BossId, WeakSpot> = {
  // The Masters are androids: the head. The Scrapper's engine sits on its
  // back; Vex's Mk-I is a skull under a glass dome.
  scrapper: spot('back', 1.85, -0.95, 0.42),
  blazeMaster: spot('head', 1.98, 0.08, 0.32),
  frostMaster: spot('head', 1.98, 0.08, 0.32),
  voltMaster: spot('head', 1.98, 0.08, 0.32),
  galeMaster: spot('head', 1.98, 0.08, 0.32),
  magnetMaster: spot('head', 1.98, 0.08, 0.32),
  drillMaster: spot('head', 1.98, 0.08, 0.32),
  tideMaster: spot('head', 1.98, 0.08, 0.32),
  neonMaster: spot('head', 1.98, 0.08, 0.32),
  rotorMaster: spot('head', 1.98, 0.08, 0.32),
  vexMk1: spot('dome', 0.85, 0, 0.45)
}

/** What a weak spot needs to know about the machine it is on. */
export interface WeakBody {
  x: number
  y: number
  z: number
  yaw: number
  floor?: number
  elite: boolean
  boss: boolean
  kind: EnemyKind
  /** `weak`: a challenge mini-boss's own spot (its registry entry's). */
  def: { aimY: number; id?: string; weak?: WeakSpot }
}

export const weakSpotOf = (e: WeakBody): WeakSpot =>
  e.boss && e.def.id && e.def.id in BOSS_WEAK ? BOSS_WEAK[e.def.id as BossId] : e.def.weak ?? ENEMY_WEAK[e.kind]

/** The weak spot's centre in the world, and its radius. */
export const weakSpotAt = (e: WeakBody, out: { x: number; y: number; z: number; r: number }): typeof out => {
  const w = weakSpotOf(e)
  const s = e.elite ? 1.18 : 1
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  out.x = e.x + (sy * w.fwd + cy * w.side) * s
  out.z = e.z + (cy * w.fwd - sy * w.side) * s
  out.y = e.y + (e.floor ?? 0) + w.up * s
  out.r = w.r * s
  return out
}

/**
 * Where a ray (origin o, unit direction d) first meets a sphere, as a
 * distance along the ray, or −1 if it misses (or the sphere is behind).
 */
export const raySphere = (
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, r: number
): number => {
  const lx = cx - ox
  const ly = cy - oy
  const lz = cz - oz
  const tc = lx * dx + ly * dy + lz * dz
  if (tc < 0) return -1
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc
  if (d2 > r * r) return -1
  return tc - Math.sqrt(r * r - d2)
}

/**
 * Is the spot on the side of the machine the eye can see? A head or a dome
 * on top shows from anywhere; a back, a tail or a core only from behind (or
 * well to the side) — from the front, the body is in the way.
 */
export const weakSpotFacing = (e: WeakBody, ex: number, ez: number): boolean => {
  const w = weakSpotOf(e)
  if (w.part === 'head' || w.part === 'dome') return true
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  // The spot's direction from the middle, and the eye's, in plan view.
  const vx = sy * w.fwd + cy * w.side
  const vz = cy * w.fwd - sy * w.side
  return vx * (ex - e.x) + vz * (ez - e.z) > 0
}

/**
 * The weak spot the crosshair is on, if any: the nearest one the view ray
 * meets, on a machine that can be hit and seen, on the side facing the eye.
 * `sees(e)`: a wall does not stand between the eye and the machine.
 */
export const weakSpotUnderRay = <E extends WeakBody>(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  enemies: readonly E[], canHit: (e: E) => boolean, sees: (e: E) => boolean,
  reach = 40
): { e: E; x: number; y: number; z: number; r: number; dist: number } | null => {
  let best: { e: E; x: number; y: number; z: number; r: number; dist: number } | null = null
  const p = { x: 0, y: 0, z: 0, r: 0 }
  for (const e of enemies) {
    if (!canHit(e)) continue
    weakSpotAt(e, p)
    const t = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y, p.z, p.r)
    if (t < 0 || t > reach || (best && t >= best.dist)) continue
    if (!weakSpotFacing(e, ox, oz) || !sees(e)) continue
    best = { e, x: p.x, y: p.y, z: p.z, r: p.r, dist: t }
  }
  return best
}
