import type { Ctx, Task } from '../ctx'
import { BotStuck } from '../ctx'
import { CELL } from '../../world/levelGen'
import { walkableLine } from '../../world/nav'
import type { Enemy } from '../../sim/world'
import { chargeInfo } from '../../sim/stats'
import { cx, cz, type Step } from './cryo-nav'
import { safeFor, watchHp } from './cryo-hazard'
import { react } from './cryo-react'

let tick = 0
let dbgT = 0

/** The machine worth a shot right now (awake, in sight, near). */
export const target = (c: Ctx): Enemy | null => {
  for (const e of c.foes({ awake: true })) {
    if (e.boss) continue
    if (Math.abs((e.floor ?? 0) + e.y - c.p.y) > 3.5) continue
    const d = c.dist(e.x, e.z)
    if (d > 14) break
    if (c.sees(e)) return e
  }
  return null
}

/** Aim at a world point and, when `e` is given, shoot it (quick shots, every few frames). */
export const setAim = (c: Ctx, x: number, z: number, y: number, e: Enemy): void => {
  if (c.reflexBusy) return
  c.face(x, z, y)
  tick++
  const i = c.m.input
  if (tick % 5 === 0 && c.m.combat.fireCd <= 0) { i.firePressed = true; i.fireHeld = true }
  else if (tick % 5 === 1) i.fireReleased = true
  void e
}

/** One frame of a charged shot (a shield-guard only gives to a charge): hold to level 1, let go. */
const chargeAt = (c: Ctx): void => {
  const cb = c.m.combat
  const i = c.m.input
  if (!cb.charging) { if (cb.fireCd <= 0) { i.firePressed = true; i.fireHeld = true } return }
  if (chargeInfo(cb.charge, (c.m as unknown as { stats: never }).stats).level >= 1) i.fireReleased = true
  else i.fireHeld = true
}

/** One frame of shooting at `e`: a quick shot every few frames. */
export const pot = (c: Ctx, e: Enemy): void => {
  if (c.reflexBusy) return
  c.aimAt(e)
  tick++
  const i = c.m.input
  if (e.guard > 0) { chargeAt(c); return }
  if (tick % 5 === 0 && c.m.combat.fireCd <= 0) { i.firePressed = true; i.fireHeld = true }
  else if (tick % 5 === 1) i.fireReleased = true
}

/** Walk the planned cells (a run of plain steps), shooting whatever shows itself,
 *  waiting for a frost lane or an icicle ring to be quiet before entering it. */
export function* walkRun(c: Ctx, cells: number[]): Task {
  const m = c.m
  const t = m.map.terrain!
  const W = m.map.w
  let n = 0
  let best = Infinity
  let bestAt = m.time
  let waitFrom = -1
  let reactOff = -1
  while (n < cells.length) {
    watchHp(c)
    if (m.time - dbgT > 10) { dbgT = m.time; c.log(`walk dbg: n=${n}/${cells.length} me ${c.p.x.toFixed(1)},${c.p.z.toFixed(1)} foe=${nextFoe(c)?.kind} react=${react(c)} loot=${!!hpLoot(c)} wait=${waitFrom}`) }
    const foe = nextFoe(c)
    if (foe) { yield* fightFoe(c, foe); bestAt = m.time; best = Infinity; continue }
    const tg = target(c)
    if (tg) pot(c, tg)
    if (m.time > reactOff && react(c)) {
      // Dodging for ages without getting on: the ring is not the problem; walk through it.
      if (m.time - bestAt > 8) { reactOff = m.time + 6; bestAt = m.time }
      yield
      continue
    }
    const loot = hpLoot(c)
    if (loot && hazardFreeLoot(c, loot)) { c.face(loot.x, loot.z); c.steer(loot.x, loot.z); bestAt = m.time; yield; continue }
    const k = cells[n]!
    const x = cx(c, k)
    const z = cz(c, k)
    const last = n === cells.length - 1
    const p = c.p
    const d = Math.hypot(x - p.x, z - p.z)
    if (d < (last ? 0.5 : 1.0)) { n++; best = Infinity; bestAt = m.time; continue }
    // A lane or ring about to fire where he is going: hold at the edge.
    const y = t.floor[k]!
    let wait = !safeFor(c, x, z, y, 1.0)
    const nk = cells[n + 1]
    if (!wait && nk !== undefined && d < 2.2 && !safeFor(c, cx(c, nk), cz(c, nk), t.floor[nk]!, 1.3)) wait = true
    const hereK = Math.floor(p.z / CELL) * W + Math.floor(p.x / CELL)
    if (!wait) waitFrom = -1
    else if (waitFrom < 0) waitFrom = m.time
    if (wait && m.time - waitFrom > 5) wait = false
    if (wait && safeFor(c, p.x, p.z, p.y, 0.4) && hereK !== k) {
      const e = target(c)
      if (e) pot(c, e)
      c.stop()
      bestAt = m.time
      yield
      continue
    }
    const e = target(c)
    if (e) pot(c, e)
    else c.face(x, z)
    c.steer(x, z)
    if (d < best - 0.3) { best = d; bestAt = m.time }
    if (m.time - bestAt > 5) throw new BotStuck(`walk: no progress toward cell ${k} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)
    yield
  }
  c.stop()
}

const stopOf = (c: Ctx, step: Step) => {
  const W = c.m.map.w
  const a = { i: step.from % W, j: Math.floor(step.from / W) }
  const b = { i: step.to % W, j: Math.floor(step.to / W) }
  return { a, b }
}
void stopOf

/** Up (or down) a ladder: stand at its foot (or top) and push toward the far cell. */
export function* hopLadder(c: Ctx, step: Step): Task {
  const x = cx(c, step.to)
  const z = cz(c, step.to)
  const y0 = c.p.y
  c.face(x, z)
  const end = c.m.time + 12
  // Walk up to the wall (or off the top edge), pushing the way.
  while (c.m.time < end) {
    const p = c.p
    if (p.ladder < 0 && p.ground && Math.abs(p.y - y0) > 1.5) break
    c.face(x, z)
    c.steer(x, z)
    yield
  }
  c.stop()
  yield* c.wait(0.3)
}

/** A dash leap / edge leap toward the far cell. */
export function* hopLeap(c: Ctx, step: Step): Task {
  const x = cx(c, step.to)
  const z = cz(c, step.to)
  const end = c.m.time + 8
  const y0 = c.p.y
  const fx = cx(c, step.from)
  const fz = cz(c, step.from)
  // Line up on the launch cell centre, a cell back, then run at the gap.
  const dxs = Math.sign(x - fx)
  const dzs = Math.sign(z - fz)
  yield* c.goto(fx - dxs * CELL * 0.35, fz - dzs * CELL * 0.35, { tol: 0.3, patience: 5 })
  while (c.m.time < end) {
    const p = c.p
    if (Math.hypot(p.x - x, p.z - z) < 0.9 && p.ground) break
    c.face(x, z)
    c.steer(x, z)
    if (c.dist(fx + dxs * CELL * 0.35, fz + dzs * CELL * 0.35) < 0.6 && p.ground) c.m.input.slideQueued = true
    yield
  }
  void y0
  c.stop()
}

interface PlatLike { x0: number; x1: number; z0: number; z1: number; top: number }

export function* hopLift(c: Ctx, step: Step): Task {
  const m = c.m
  const t = m.map.terrain!
  const W = m.map.w
  const near = (k: number, x: number, z: number): boolean =>
    Math.abs(Math.floor(x / CELL) - (k % W)) + Math.abs(Math.floor(z / CELL) - Math.floor(k / W)) === 1
  const lf = t.lifts.find(l => (near(step.from, l.ax, l.az) && near(step.to, l.bx, l.bz)) || (near(step.from, l.bx, l.bz) && near(step.to, l.ax, l.az)))
  if (!lf) throw new BotStuck('no lift for hop')
  const fromA = near(step.from, lf.ax, lf.az)
  const S = fromA ? { x: lf.ax, z: lf.az } : { x: lf.bx, z: lf.bz }
  const T = fromA ? { x: lf.bx, z: lf.bz } : { x: lf.ax, z: lf.az }
  const plats = (m.nav.plats ?? []) as PlatLike[]
  const pl = plats.find(q => Math.abs((q.x1 - q.x0) / 2 - lf.hw) < 0.05 && Math.abs((q.z1 - q.z0) / 2 - lf.hd) < 0.05 &&
    Math.abs((q.x0 + q.x1) / 2 - (lf.ax + lf.bx) / 2) <= Math.abs(lf.ax - lf.bx) / 2 + 0.1 &&
    Math.abs((q.z0 + q.z1) / 2 - (lf.az + lf.bz) / 2) <= Math.abs(lf.az - lf.bz) / 2 + 0.1)
  if (!pl) throw new BotStuck('no platform')
  const mid = (): { x: number; z: number } => ({ x: (pl.x0 + pl.x1) / 2, z: (pl.z0 + pl.z1) / 2 })
  const at = (q: { x: number; z: number }): number => Math.hypot(mid().x - q.x, mid().z - q.z)
  // Wait at the lip until the platform is in.
  const wend = m.time + 40
  while (at(S) > 0.12) {
    if (m.time > wend) throw new BotStuck('shuttle never came')
    c.face(S.x, S.z)
    yield
  }
  // Board, centre.
  const bend = m.time + 5
  while (m.time < bend) {
    c.face(S.x, S.z)
    c.steer(S.x, S.z)
    if (c.p.plat >= 0 && c.dist(S.x, S.z) < 0.5) break
    yield
  }
  // Ride: stand still until it is at the far stop, then step off.
  const rend = m.time + 20
  while (at(T) > 0.12) {
    if (m.time > rend) throw new BotStuck('ride timed out')
    c.stop()
    yield
  }
  const x = cx(c, step.to)
  const z = cz(c, step.to)
  const oend = m.time + 5
  while (m.time < oend && c.dist(x, z) > 0.8) {
    c.face(x, z)
    c.steer(x, z)
    yield
  }
  c.stop()
}

interface Marker { mesh: { position: { x: number; y: number; z: number } }; t: number; dur: number; r: number; active: boolean; fade: number }

/** Open floor in the heading that gets farthest from (ax, az), `reach` m on, or null. */
export const awayFrom = (c: Ctx, ax: number, az: number, reach: number, hazardDwell = 1.2): { x: number; z: number } | null => {
  const m = c.m
  const t = m.map.terrain!
  const p = c.p
  let bx = 0
  let bz = 0
  let bs = -Infinity
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const px = p.x + dx * reach
    const pz = p.z + dz * reach
    if (!walkableLine(m.nav, p.x, p.z, px, pz)) continue
    const ck = Math.floor(pz / CELL) * m.map.w + Math.floor(px / CELL)
    if (t.pit[ck] || !safeFor(c, px, pz, p.y, hazardDwell)) continue
    const s = Math.hypot(px - ax, pz - az)
    if (s > bs) { bs = s; bx = px; bz = pz }
  }
  return bs > -Infinity ? { x: bx, z: bz } : null
}

/** A red ring on the floor Flux stands in (a shell, a stomp): step out of it. True when it took the stick. */
export const dodgeMarkers = (c: Ctx, margin = 0.8): boolean => {
  const pool = (c.m as unknown as { markers?: { pool: Marker[] } }).markers?.pool ?? []
  const p = c.p
  for (const k of pool) {
    if (!k.active || k.fade > 0 || k.t >= k.dur) continue
    if (Math.abs(k.mesh.position.y - p.y) > 2) continue
    const d = Math.hypot(k.mesh.position.x - p.x, k.mesh.position.z - p.z)
    if (d > k.r + margin) continue
    const to = awayFrom(c, k.mesh.position.x, k.mesh.position.z, 3)
    if (to) { c.steer(to.x, to.z); return true }
  }
  return false
}

/** The machine to deal with before walking on: awake, in sight, near (turrets are shot in passing only). */
export const nextFoe = (c: Ctx): Enemy | null => {
  for (const e of c.foes({ awake: true, sameFloor: true })) {
    const d = c.dist(e.x, e.z)
    if (e.boss || (e.kind === 'turret' && d > 9)) continue
    if (d > 12) break
    if (c.sees(e)) return e
  }
  return null
}

/** Shoot `e` down while keeping off it: back away when it is close, strafe at range, step out of red rings. */
export function* fightFoe(c: Ctx, e: Enemy): Task {
  const m = c.m
  const end = m.time + 40
  let lastSaw = m.time
  c.log(`fight ${e.kind} hp${Math.round(e.hp)}`)
  while (e.state !== 'dead' && m.time < end) {
    watchHp(c)
    const p = c.p
    const d = c.dist(e.x, e.z)
    const sees = c.sees(e)
    if (sees) lastSaw = m.time
    if (d > 14 || m.time - lastSaw > 3 || m.combat.dead) break
    pot(c, e)
    if (react(c)) { yield; continue }
    if (c.reflexBusy) { yield; continue }
    if (d < 6.5) {
      const to = awayFrom(c, e.x, e.z, 3)
      if (to) c.steer(to.x, to.z)
    } else if (d > 10 && sees) c.steer(e.x, e.z)
    else {
      const sgn = Math.sin(m.time * 1.3) > 0 ? 1 : -1
      c.steer(p.x + (e.z - p.z) * 0.01 * sgn * 100 / Math.max(1, d), p.z - (e.x - p.x) * 0.01 * sgn * 100 / Math.max(1, d), 0.7)
    }
    yield
  }
  c.stop()
}

interface Loose { active: boolean; kind: string; x: number; y: number; z: number }

/** The nearest health pickup lying on Flux's floor, when he is hurt: a player walks over it. */
const gaveUp = new WeakSet<object>()
const lootSince = new WeakMap<object, number>()
export const hpLoot = (c: Ctx): Loose | null => {
  const cb = c.m.combat
  if (cb.hp > cb.maxHp * 0.9) return null
  const list = (c.m as unknown as { system?: { pickups: Loose[] } }).system?.pickups ?? []
  let best: Loose | null = null
  let bd = 14
  for (const q of list) {
    if (!q.active || gaveUp.has(q) || (q.kind !== 'hp' && q.kind !== 'hpBig')) continue
    if (Math.abs(q.y - c.p.y) > 1.6) continue
    const d = c.dist(q.x, q.z)
    if (d < bd) { bd = d; best = q }
  }
  if (best) {
    const t0 = lootSince.get(best) ?? c.m.time
    lootSince.set(best, t0)
    if (c.m.time - t0 > 7) { gaveUp.add(best); return null }
  }
  return best
}

/** Is the straight way to the pickup plain floor (no pit, no hazard ring)? */
const hazardFreeLoot = (c: Ctx, q: Loose): boolean => {
  const p = c.p
  return walkableLine(c.m.nav, p.x, p.z, q.x, q.z) && safeFor(c, q.x, q.z, q.y, 1.2)
}
