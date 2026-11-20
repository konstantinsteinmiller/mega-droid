import type { Ctx } from '../ctx'
import { CELL } from '../../world/levelGen'
import { walkableLine } from '../../world/nav'
import type { Enemy, Shot } from '../../sim/world'
import { hazardIn, safeFor } from './cryo-hazard'

/**
 * What a player does with his eyes and thumbs in the cryo stage's fights, every
 * frame, before aiming: leave a rush after its line is locked, block a shot in
 * the air, step out of a red ring on the floor (a slide when it is about to
 * land). `react` returns true when it took the hands.
 */
interface Marker { mesh: { position: { x: number; y: number; z: number } }; t: number; dur: number; r: number; active: boolean; fade: number }

const RUSH = new Set(['rush', 'charge'])
const dashed = new WeakMap<object, number>()
let lastPress = -9
let ringsOffUntil = -9
let epiAt = -9
let epiX = 0
let epiZ = 0
let epiN = 0

const open = (c: Ctx, x: number, z: number): boolean => {
  const m = c.m
  const p = c.p
  if (!walkableLine(m.nav, p.x, p.z, x, z)) return false
  const k = Math.floor(z / CELL) * m.map.w + Math.floor(x / CELL)
  return !m.map.terrain!.pit[k] && safeFor(c, x, z, p.y, 1)
}

const canSlide = (c: Ctx): boolean => c.m.combat.slideCd <= 0 && c.m.combat.power >= 18

/** A charge or rush that has just locked its line: a slide off it, sideways. */
const dodgeRush = (c: Ctx): boolean => {
  const p = c.p
  for (const e of c.foes({ awake: true, sameFloor: true })) {
    if (e.state !== 'act' || !RUSH.has(e.attack) || e.st > 0.3 || c.m.time - (dashed.get(e) ?? -9) < 1.2) continue
    const d = c.dist(e.x, e.z)
    if (d > 11 || d < 0.5) continue
    if (!canSlide(c)) continue
    const ax = (p.x - e.x) / d
    const az = (p.z - e.z) / d
    for (const s of [1, -1]) {
      const dx = -az * s
      const dz = ax * s
      if (!open(c, p.x + dx * 4, p.z + dz * 4)) continue
      dashed.set(e, c.m.time)
      c.slide(dx, dz)
      return true
    }
  }
  return false
}

/** A blockable shot in the air that will reach him soon: guard up, facing it. */
const guardShots = (c: Ctx): boolean => {
  const sys = (c.m as unknown as { system?: { shots: Shot[] } }).system
  if (!sys) return false
  const p = c.p
  const cb = c.m.combat
  if (cb.guardBroken) return false
  for (const s of sys.shots) {
    if (!s.active || s.owner !== 'enemy' || !s.blockable) continue
    if (Math.abs(s.y - (p.y + 1)) > 2.5) continue
    const dx = p.x - s.x
    const dz = p.z - s.z
    const d = Math.hypot(dx, dz)
    if (d > 9 || d < 0.01) continue
    const sp = Math.hypot(s.vx, s.vz)
    if (sp < 0.5) continue
    // Closing on him, and near his line.
    const along = (dx * s.vx + dz * s.vz) / sp
    if (along < 0) continue
    const lateral = Math.abs(dx * s.vz - dz * s.vx) / sp
    if (lateral > 1.6 || along / sp > 0.7) continue
    c.face(s.x, s.z)
    const i = c.m.input
    i.blockHeld = true
    // A fresh press inside the parry window of the hit (0.42 s) is a parry: no chip, the shield drops for the counter.
    if (along / sp < 0.3 && c.m.time - lastPress > 0.55) { i.blockPressed = true; lastPress = c.m.time } else i.blockPressed ||= !cb.blocking && lastPress < 0
    c.reflexBusy = true
    return true
  }
  return false
}

/** Out of every red ring he stands in, by the nearest open spot that is clear of all of them. */
const leaveRings = (c: Ctx): boolean => {
  const pool = (c.m as unknown as { markers?: { pool: Marker[] } }).markers?.pool ?? []
  const p = c.p
  // (The frost lanes' and the icicles' rings are the hazards' own, timed: `leaveHazard`.)
  const live = pool.filter(k => k.active && k.fade <= 0 && k.t < k.dur && Math.abs(k.mesh.position.y - p.y) < 2 &&
    hazardIn(c, k.mesh.position.x, k.mesh.position.z, k.mesh.position.y) === Infinity)
  if (!live.length) return false
  const inside = (x: number, z: number, m = 0.7): Marker | null => {
    for (const k of live) if (Math.hypot(k.mesh.position.x - x, k.mesh.position.z - z) < k.r + m) return k
    return null
  }
  const here = inside(p.x, p.z, 0.3)
  if (!here) return false
  let best: { x: number; z: number } | null = null
  let bs = Infinity
  for (const reach of [2.2, 3.6, 5.2, 7.5]) {
    for (let n = 0; n < 16; n++) {
      const a = (n * Math.PI) / 8
      const x = p.x + Math.cos(a) * reach
      const z = p.z + Math.sin(a) * reach
      if (inside(x, z) || !open(c, x, z)) continue
      if (reach < bs) { bs = reach; best = { x, z } }
    }
    if (best) break
  }
  if (!best) return false
  const left = Math.min(...live.map(k => k.dur - k.t))
  // Pinned (a wall, a machine at his back): stepping is no use; let the rest of the fight go on for a while.
  if (c.m.time < ringsOffUntil) return false
  if (c.m.time - epiAt > 0.8) { epiAt = c.m.time; epiX = p.x; epiZ = p.z; epiN = 0 }
  else if (Math.hypot(p.x - epiX, p.z - epiZ) < 0.5 && ++epiN > 40) { ringsOffUntil = c.m.time + 3; epiN = 0; return false }
  c.steer(best.x, best.z)
  if (left < 0.55 && canSlide(c)) c.slide(best.x - p.x, best.z - p.z)
  return true
}

/** In a frost cone or an icicle's ring that is about to hit: out of it, to the nearest spot quiet for a while. */
const leaveHazard = (c: Ctx): boolean => {
  const p = c.p
  if (safeFor(c, p.x, p.z, p.y, 0.8)) return false
  let best: { x: number; z: number } | null = null
  for (const reach of [1.6, 2.6, 3.8, 5.2]) {
    let bs = -1
    for (let n = 0; n < 16; n++) {
      const a = (n * Math.PI) / 8
      const x = p.x + Math.cos(a) * reach
      const z = p.z + Math.sin(a) * reach
      if (!open(c, x, z) || !safeFor(c, x, z, p.y, 2.2)) continue
      const s = Math.hypot(x - p.x, z - p.z)
      if (s > bs) { bs = s; best = { x, z } }
    }
    if (best) break
  }
  if (!best) return false
  c.steer(best.x, best.z)
  return true
}

/** A blockable wind-up about to land: the press that makes it a parry. */
const parryMelee = (c: Ctx): boolean => {
  const cb = c.m.combat
  if (cb.guardBroken) return false
  for (const e of c.foes({ awake: true, sameFloor: true })) {
    if (e.state !== 'tele' || e.teleRed || c.dist(e.x, e.z) > 7.5) continue
    const left = e.teleDur - e.st
    if (left > 0.3) continue
    c.face(e.x, e.z)
    const i = c.m.input
    i.blockHeld = true
    if (c.m.time - lastPress > 0.55) { i.blockPressed = true; lastPress = c.m.time }
    c.reflexBusy = true
    return true
  }
  return false
}

export const react = (c: Ctx): boolean => {
  if (parryMelee(c)) return true
  if (dodgeRush(c)) return true
  if (leaveRings(c)) return true
  if (leaveHazard(c)) return true
  return guardShots(c)
}

export type { Enemy }
