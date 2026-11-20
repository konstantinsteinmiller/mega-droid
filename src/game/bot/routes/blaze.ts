import { CELL } from '../../world/levelGen'
import { findPath, floorAt, groundAt, isSolidAt, smoothPath, walkStep } from '../../world/nav'
import type { Enemy } from '../../sim/world'
import type { Ctx, Task } from '../ctx'
import { BotStuck } from '../ctx'
import { afterBoss } from './boss'
import { unsafeAt } from './blaze-hazards'

/**
 * ─── Meltdown Descent: the Blaze sector's story stage ───────────────────────
 *
 * One goal-driven loop, read afresh every frame from where Flux IS: the goal is
 * the boss room; the way is the nav's own path with hops (`findPath(links)`),
 * and each hop is done the way a player does it (a lift: step on and wait; a
 * gap: run at it and dash-leap). Machines in sight are shot on the way, and
 * every step looks a second ahead at the vents, barrels and hammers (their
 * lamps and rings, as a player reads them) and waits for the gap.
 */

const cellOf = (x: number): number => Math.floor(x / CELL)
const SPEED = 4.7
const HORIZON = 1.3

export function* blazeRoute(c: Ctx): Task {
  const m = c.m
  const st = newState()
  c.lateSlide = true
  c.ownRedDodge = true
  for (;;) {
    if (m.boss && m.boss.state === 'dead') { yield* afterBoss(c); return }
    if (m.boss && m.bossStarted) { yield* bossTick(c, st); continue }
    yield* tick(c, st)
  }
}

interface State {
  path: Array<[number, number]> | null
  pathAt: number
  charge0: number
  lastShot: number
  /** Foes shot at for too long (give-up clock per enemy id). */
  spent: Map<number, number>
  ignore: Map<number, number>
  lastLog: number
  hp: number
  dodged: Map<number, number>
  ringAt: number
  healthKey: string
  healthSince: number
}
const newState = (): State => ({ path: null, pathAt: -9, charge0: -1, lastShot: -9, spent: new Map(), ignore: new Map(), lastLog: -9, hp: 0, dodged: new Map(), ringAt: -9, healthKey: '', healthSince: 0 })

/** The room the boss waits in: the walk's goal. */
const bossGoal = (c: Ctx): { x: number; z: number } => {
  const room = c.m.map.rooms.find(r => r.role === 'boss')
  if (!room) throw new BotStuck('no boss room')
  return { x: (room.x0 + room.w / 2) * CELL, z: (room.z0 + room.h / 2) * CELL }
}

/** Whether cell k → n is a plain walk. */
const walks = (c: Ctx, k: number, n: number): boolean => {
  const W = c.m.map.w
  const ai = k % W
  const aj = (k - ai) / W
  const bi = n % W
  const bj = (n - bi) / W
  if (Math.abs(ai - bi) > 1 || Math.abs(aj - bj) > 1) return false
  return walkStep(c.m.map, ai, aj, bi, bj)
}

interface Way { wx: number; wz: number; hop: { fx: number; fz: number; tx: number; tz: number } | null }

/** The next waypoint on the way to the boss, and the hop at its end if any. */
const wayTo = (c: Ctx, st: State, to?: { x: number; z: number }): Way => {
  const m = c.m
  const p = c.p
  const goal = to ?? bossGoal(c)
  const raw = findPath(m.nav, p.x, p.z, goal.x, goal.z, 4000, 2, !to)
  if (!raw || !raw.length) throw new BotStuck(`no way to the boss from (${p.x.toFixed(1)}, ${p.z.toFixed(1)}, y ${p.y.toFixed(1)})`)
  const W = m.map.w
  let prev = cellOf(p.z) * W + cellOf(p.x)
  let hopAt = -1
  for (let n = 0; n < raw.length; n++) {
    const k = cellOf(raw[n]![1]) * W + cellOf(raw[n]![0])
    if (k === prev) continue
    if (!walks(c, prev, k)) { hopAt = n; break }
    prev = k
  }
  void st
  const walk = hopAt < 0 ? raw : raw.slice(0, hopAt)
  if (hopAt >= 0) {
    const origin = hopAt > 0 ? raw[hopAt - 1]! : ([p.x, p.z] as [number, number])
    const fx = (cellOf(origin[0]) + 0.5) * CELL
    const fz = (cellOf(origin[1]) + 0.5) * CELL
    const dest = raw[hopAt]!
    const hop = { fx, fz, tx: (cellOf(dest[0]) + 0.5) * CELL, tz: (cellOf(dest[1]) + 0.5) * CELL }
    if (c.dist(fx, fz) < 0.6) return { wx: fx, wz: fz, hop }
    if (!walk.length) return { wx: fx, wz: fz, hop }
  }
  const sm = smoothPath(m.nav, p.x, p.z, walk)
  let i = 0
  while (i < sm.length - 1 && Math.hypot(sm[i]![0] - p.x, sm[i]![1] - p.z) < 0.7) i++
  const wp = sm[i] ?? walk[walk.length - 1]!
  return { wx: wp[0], wz: wp[1], hop: null }
}

function* tick(c: Ctx, st: State): Task {
  const m = c.m
  const p = c.p
  if (m.combat.hp < st.hp - 0.5) {
    const near = c.foes().filter(e => c.dist(e.x, e.z) < 14).map(e => `${e.kind}:${e.state}${e.teleRed ? 'R' : ''}@${c.dist(e.x, e.z).toFixed(1)}`).join(' ')
    c.log(`HIT ${st.hp.toFixed(0)} -> ${m.combat.hp.toFixed(0)} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) blk=${m.combat.blocking} slcd=${m.combat.slideCd.toFixed(1)} pw=${m.combat.power.toFixed(0)} near: ${near}`)
  }
  st.hp = m.combat.hp
  if (m.time - st.lastLog > 4) { st.lastLog = m.time; c.log(`at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) hp ${m.combat.hp.toFixed(0)} foes: ${c.foes({ awake: true }).filter(e => c.dist(e.x, e.z) < 16).slice(0, 4).map(e => `${e.kind} ${Math.round(e.hp)}/${Math.round(e.maxHp)} g${e.guard.toFixed(1)}`).join(', ')}`) }
  if (dodgeRed(c, st)) { st.charge0 = -1; yield; return }
  const way = wayTo(c, st)
  const threats = meleeThreats(c)
  if (c.reflexBusy) {
    // Blocking: back away from what is on him, or out of a jet; never stand in a pile.
    st.charge0 = -1
    if (threats.length) kite(c, threats, way.wx, way.wz)
    else if (hazardNow(c)) move(c, st, way.wx, way.wz)
    yield
    return
  }
  if (!threats.length && !pickFoe(c, st)) {
    const hs = healthSpot(c)
    if (hs) {
      if (st.healthKey !== `${Math.round(hs.x)},${Math.round(hs.z)}`) { st.healthKey = `${Math.round(hs.x)},${Math.round(hs.z)}`; st.healthSince = m.time }
      if (m.time - st.healthSince > 15 || c.dist(hs.x, hs.z) < 0.8) { healthBan.set(st.healthKey, m.time + 60); st.healthKey = '' } else {
      const w2 = wayTo(c, st, hs)
      if (!w2.hop) {
        if (Math.hypot(w2.wx - p.x, w2.wz - p.z) > 0.3) p.yaw = Math.atan2(-(w2.wx - p.x), -(w2.wz - p.z))
        move(c, st, w2.wx, w2.wz)
        yield
        return
      }
      }
    }
  }
  if (way.hop && !threats.length) {
    yield* hop(c, way.hop.fx, way.hop.fz, way.hop.tx, way.hop.tz)
    return
  }
  // Shoot what is in sight; stand and fight what is near.
  const foe = pickFoe(c, st)
  let tx = way.wx
  let tz = way.wz
  if (foe) {
    shoot(c, st, foe)
    if (threats.length) { kite(c, threats, way.wx, way.wz); yield; return }
    if (c.dist(foe.x, foe.z) < 11 && !hazardNow(c)) { yield; return }
  } else {
    st.charge0 = -1
    if (threats.length) { kite(c, threats, way.wx, way.wz); yield; return }
    if (Math.hypot(way.wx - p.x, way.wz - p.z) > 0.3) p.yaw = Math.atan2(-(way.wx - p.x), -(way.wz - p.z))
  }
  if (way.hop) { yield* hop(c, way.hop.fx, way.hop.fz, way.hop.tx, way.hop.tz); return }
  move(c, st, tx, tz)
  yield
}

interface PickupLike { active: boolean; kind: string; x: number; y: number; z: number }
interface RewardLike { def: { kind: string; x: number; y: number; z: number }; taken: boolean }

/** A repair capsule worth a detour: a drop lying about, or a ledge's capsule
 *  not yet taken, on the same floor and a short walk away. */
const healthBan = new Map<string, number>()
const healthSpot = (c: Ctx): { x: number; z: number } | null => {
  const m = c.m
  const p = c.p
  if (m.combat.hp > m.combat.maxHp * 0.8) return null
  let best: { x: number; z: number } | null = null
  let bestD = 26
  const consider = (x: number, y: number, z: number): void => {
    if ((healthBan.get(`${Math.round(x)},${Math.round(z)}`) ?? 0) > m.time) return
    if (Math.abs(y - p.y) > 1.2) return
    const d = c.dist(x, z)
    if (d >= bestD) return
    const path = findPath(m.nav, p.x, p.z, x, z, 900, 1, false)
    if (!path) return
    let len = 0
    let ax = p.x
    let az = p.z
    for (const [qx, qz] of path) { len += Math.hypot(qx - ax, qz - az); ax = qx; az = qz }
    if (len >= bestD) return
    bestD = len
    best = { x, z }
  }
  for (const pk of (m as unknown as { system: { pickups: PickupLike[] } }).system.pickups) {
    if (pk.active && (pk.kind === 'hp' || pk.kind === 'hpBig')) consider(pk.x, pk.y, pk.z)
  }
  const rewards = (m.climb as unknown as { rewards?: RewardLike[] } | null)?.rewards
  for (const r of rewards ?? []) if (!r.taken && r.def.kind === 'hp') consider(r.def.x, r.def.y, r.def.z)
  return best
}

/** Ground machines close enough to be on him. */
const meleeThreats = (c: Ctx): Enemy[] =>
  c.foes({ awake: true, sameFloor: true }).filter(e => !e.boss && e.def.fly <= 0 && e.kind !== 'turret' && c.dist(e.x, e.z) < 6.5)

/** Move away from the threats: the heading that keeps the farthest from the
 *  nearest of them a moment on, over firm, cold floor. */
const kite = (c: Ctx, threats: Enemy[], wx: number, wz: number): void => {
  const m = c.m
  const p = c.p
  let best: [number, number] | null = null
  let bestScore = -Infinity
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2
    const dx = Math.cos(th)
    const dz = Math.sin(th)
    let ok = true
    for (let t = 0.2; t <= 1.0 + 1e-6; t += 0.2) {
      const qx = p.x + dx * SPEED * t
      const qz = p.z + dz * SPEED * t
      const g = groundAt(m.map, qx, qz)
      if (g === -Infinity || Math.abs(g - p.y) > 0.9 || isSolidAt(m.nav, qx, qz) || unsafeAt(m as never, qx, p.y, qz, m.time + t)) { ok = false; break }
    }
    if (!ok) continue
    const ex = p.x + dx * SPEED
    const ez = p.z + dz * SPEED
    let md = Infinity
    for (const e of threats) md = Math.min(md, Math.hypot(e.x - ex, e.z - ez))
    // Room to keep going afterwards: not into a corner or a dead end.
    let open = 0
    for (let b = 0; b < 16; b++) {
      const bx = ex + Math.cos((b * Math.PI) / 8) * 3.5
      const bz = ez + Math.sin((b * Math.PI) / 8) * 3.5
      const g = groundAt(m.map, bx, bz)
      if (g !== -Infinity && Math.abs(g - p.y) < 0.9 && !isSolidAt(m.nav, bx, bz)) open++
    }
    const score = Math.min(md, 9) + 0.35 * open - 0.15 * Math.hypot(wx - ex, wz - ez)
    if (score > bestScore) { bestScore = score; best = [dx, dz] }
  }
  if (best) c.steer(p.x + best[0], p.z + best[1])
}

/** Dash directions that land on firm, cold floor (a slide over a pit would
 *  leap it; into a jet or a shell's ring is no better than staying). */
const slideOk = (c: Ctx, dx: number, dz: number): boolean => {
  const m = c.m
  const p = c.p
  for (let t = 1; t <= 4; t++) {
    const x = p.x + dx * t
    const z = p.z + dz * t
    const g = groundAt(m.map, x, z)
    if (g === -Infinity || Math.abs(g - p.y) > 0.6 || isSolidAt(m.nav, x, z) || unsafeAt(m as never, x, p.y, z, m.time + 0.3, { rings: false })) return false
  }
  return true
}

/** The attacks that are dodged by dashing: a rush or a lunge locks its line at
 *  the end of its wind-up, a slam falls round the machine, a roll comes at him. */
const DASHED = new Set(['rush', 'lunge', 'slam', 'ram', 'roll', 'charge'])

/** A red-ring strike on Flux: dash out of it at the last moment (the reflex
 *  leaves red rings to this: `ownRedDodge`). Returns whether it dashed. */
const dodgeRed = (c: Ctx, st: State): boolean => {
  const m = c.m
  const p = c.p
  if (m.combat.slideCd > 0 || m.combat.power < 18) return false
  for (const e of c.foes({ awake: true, sameFloor: true })) {
    if (!e.teleRed) continue
    const d = c.dist(e.x, e.z)
    const endOfWindup = e.state === 'tele' && e.st >= e.teleDur - 0.24 && d < 9 && DASHED.has(e.attack)
    const striking = e.state === 'act' && d < (e.attack === 'rush' ? 5 : 3.4)
    if (!endOfWindup && !striking) continue
    if (m.time - (st.dodged.get(e.id) ?? -9) < 0.5) continue
    const ax = p.x - e.x
    const az = p.z - e.z
    const l = Math.hypot(ax, az) || 1
    const dirs: Array<[number, number]> = [[-az / l, ax / l], [az / l, -ax / l], [ax / l, az / l]]
    for (const [dx, dz] of dirs) {
      if (!slideOk(c, dx, dz)) continue
      st.dodged.set(e.id, m.time)
      c.slide(dx, dz)
      return true
    }
  }
  return false
}

const hazardNow = (c: Ctx): boolean => {
  const p = c.p
  for (let t = 0; t <= 1.0; t += 0.1) if (unsafeAt(c.m as never, p.x, p.y, p.z, c.m.time + t)) return true
  return false
}

/** One frame of walking toward (wx, wz): the way itself when it is clear for
 *  the next second, else the best of the other headings, else standing. */
const move = (c: Ctx, _st: State, wx: number, wz: number, strict = false, horizon = HORIZON): void => {
  const m = c.m
  const p = c.p
  const dx = wx - p.x
  const dz = wz - p.z
  const l = Math.hypot(dx, dz)
  if (l < 0.05) return
  const ux = dx / l
  const uz = dz / l
  const cands: Array<[number, number]> = [[ux, uz], [0, 0]]
  for (let a = 1; a <= 7; a++) {
    const th = (a * Math.PI) / 8
    for (const s of [1, -1]) {
      const ca = Math.cos(th)
      const sa = Math.sin(th) * s
      cands.push([ux * ca - uz * sa, ux * sa + uz * ca])
    }
  }
  cands.push([-ux, -uz])
  let best: [number, number] = [ux, uz]
  let bestScore = -Infinity
  for (let n = 0; n < cands.length; n++) {
    const [cx, cz] = cands[n]!
    let first = Infinity
    let valid = true
    for (let t = 0; t <= horizon + 1e-6; t += 0.1) {
      const qx = p.x + cx * SPEED * t
      const qz = p.z + cz * SPEED * t
      if ((n > 0 || strict) && t > 0 && t <= 1.0) {
        const g = groundAt(m.map, qx, qz)
        if (g === -Infinity || Math.abs(g - p.y) > 0.9 || isSolidAt(m.nav, qx, qz)) { valid = false; break }
      }
      if (unsafeAt(m as never, qx, p.y, qz, m.time + t)) { first = t; break }
    }
    if (!valid) continue
    const ex = p.x + cx * SPEED * Math.min(horizon, HORIZON)
    const ez = p.z + cz * SPEED * Math.min(horizon, HORIZON)
    const progress = l - Math.hypot(wx - ex, wz - ez)
    let score: number
    if (first === Infinity) score = 1000 + (n === 0 ? 100 : 0) + progress
    else score = first * 10 + progress * 0.01
    if (n === 1 && first === Infinity) score = 1000 + (progress > 0 ? 0 : 0) - 50
    if (score > bestScore) { bestScore = score; best = [cx, cz] }
  }
  if (best[0] === 0 && best[1] === 0) return
  c.steer(p.x + best[0], p.z + best[1])
}

/** Who to shoot: awake machines in sight and near, the frail ones first (the
 *  elite Guardroid last: it is the slow one, and the others hurry Flux); turrets last. */
const pickFoe = (c: Ctx, st: State): Enemy | null => {
  const m = c.m
  let best: Enemy | null = null
  let bestKey = Infinity
  for (const e of c.foes({ awake: true })) {
    if (e.boss) continue
    if (Math.abs((e.floor ?? 0) + e.y - c.p.y) > 4) continue
    if ((st.ignore.get(e.id) ?? 0) > m.time) continue
    const d = c.dist(e.x, e.z)
    if (d > 13) continue
    if (!c.sees(e)) continue
    const key = (e.kind === 'turret' ? (d < 12 ? 20000 : Infinity) : e.kind === 'brute' ? 10000 : 0) + e.hp + d * 3
    if (key < bestKey) { bestKey = key; best = e }
  }
  return best
}

/** One frame of shooting at `e`: quick shots, or a held charge for a guard. */
const shoot = (c: Ctx, st: State, e: Enemy): void => {
  const m = c.m
  const i = m.input
  const spent = (st.spent.get(e.id) ?? 0) + 1 / 60
  st.spent.set(e.id, spent)
  if (spent > 40) { st.ignore.set(e.id, m.time + 15); st.spent.set(e.id, 0); st.charge0 = -1; return }
  if (c.reflexBusy) { st.charge0 = -1; return }
  c.aimAt(e)
  const guarded = (e.guard ?? 0) > 0
  if (guarded || e.kind === 'golem') {
    if (st.charge0 < 0) { st.charge0 = m.time; i.firePressed = true; i.fireHeld = true; return }
    i.fireHeld = true
    if (m.time - st.charge0 >= 1.3) { i.fireHeld = false; i.fireReleased = true; st.charge0 = -1 }
    return
  }
  st.charge0 = -1
  if (m.time - st.lastShot > 0.22) { st.lastShot = m.time; i.firePressed = true; i.fireHeld = true } else if (m.time - st.lastShot < 0.07) i.fireHeld = true
  else i.fireReleased = m.time - st.lastShot < 0.1
}

/** A hop the walk cannot make: a lift, or a gap to leap. */
function* hop(c: Ctx, fx: number, fz: number, tx: number, tz: number): Task {
  const m = c.m
  const t = m.map.terrain!
  const fy = floorAt(m.nav, fx, fz)
  const ty = floorAt(m.nav, tx, tz)
  // A lift: stand on its platform and ride.
  for (const lf of t.lifts) {
    const nearA = Math.hypot(lf.ax - fx, lf.az - fz) < CELL * 1.6 && Math.abs(lf.ay - fy) < 0.4
    const nearB = Math.hypot(lf.bx - fx, lf.bz - fz) < CELL * 1.6 && Math.abs(lf.by - fy) < 0.4
    if (!nearA && !nearB) continue
    const sx = nearA ? lf.ax : lf.bx
    const sz = nearA ? lf.az : lf.bz
    const ey = nearA ? lf.by : lf.ay
    c.log(`lift: from (${fx.toFixed(1)}, ${fz.toFixed(1)}) to y ${ey}`)
    const plat = () => m.nav.plats!.find(pl => Math.abs(pl.x1 - pl.x0 - 2 * lf.hw) < 0.01 && Math.abs(pl.z1 - pl.z0 - 2 * lf.hd) < 0.01 && pl.x1 >= Math.min(lf.ax, lf.bx) - 0.01 && pl.x0 <= Math.max(lf.ax, lf.bx) + lf.hw * 2 && pl.z1 >= Math.min(lf.az, lf.bz) - 0.01 && pl.z0 <= Math.max(lf.az, lf.bz) + lf.hd * 2)
    yield* c.until(() => Math.abs((plat()?.top ?? -99) - fy) < 0.15, 40, 'the lift to come')
    yield* c.goto(sx, sz, { tol: 0.5 })
    yield* c.until(() => Math.abs(c.p.y - ey) < 0.3 && c.p.ground, 30, 'the lift to carry')
    yield* c.goto(tx, tz, { tol: 0.6, patience: 4 })
    return
  }
  c.log(`leap: (${fx.toFixed(1)}, ${fz.toFixed(1)}, y ${fy}) -> (${tx.toFixed(1)}, ${tz.toFixed(1)}, y ${ty})`)
  // A gap: run at it and dash.
  const p = c.p
  const dx = tx - fx
  const dz = tz - fz
  const l = Math.hypot(dx, dz)
  p.yaw = Math.atan2(-dx, -dz)
  const start = m.time
  let slid = false
  while (Math.abs(c.p.y - ty) > 0.3 || c.dist(tx, tz) > 1.2) {
    if (m.time - start > 4) throw new BotStuck('leap failed')
    p.yaw = Math.atan2(-dx, -dz)
    c.steer(tx, tz)
    if (!slid && c.dist(fx, fz) < 0.3 + (CELL / 2) && m.combat.slideCd <= 0) { c.slide(dx / l, dz / l); slid = true }
    yield
  }
}
interface RingLike { active: boolean; x: number; z: number; r: number; speed: number; maxR: number; hit: boolean }
interface ShotLike { active: boolean; owner: string; kind: string; x: number; z: number; vx: number; vz: number; missile?: boolean; blockable: boolean }
const sys = (c: Ctx): { rings: RingLike[]; shots: ShotLike[] } => (c.m as unknown as { system: { rings: RingLike[]; shots: ShotLike[] } }).system

/** A Master's shock ring about to wash over Flux: dash along it (round, not
 *  out), so its first touch lands on the dash's frames of grace. */
const ringDash = (c: Ctx, st: State): boolean => {
  const m = c.m
  const p = c.p
  if (m.combat.slideCd > 0 || m.combat.power < 25) return false
  for (const r of sys(c).rings) {
    if (!r.active || r.hit || r.r >= r.maxR) continue
    const d = Math.hypot(p.x - r.x, p.z - r.z)
    const tau = (d - r.r - 0.6) / r.speed
    if (tau > 0.1 || tau < -0.05) continue
    if (m.time - st.ringAt < 0.3) continue
    const ax = (p.x - r.x) / (d || 1)
    const az = (p.z - r.z) / (d || 1)
    for (const [dx, dz] of [[-az, ax], [az, -ax]] as Array<[number, number]>) {
      if (!slideOk(c, dx, dz)) continue
      st.ringAt = m.time
      c.slide(dx, dz)
      return true
    }
  }
  return false
}

/** Something about to hit Flux where he stands (a wave, a jet, a landing): dash clear. */
const panicSlide = (c: Ctx): boolean => {
  const m = c.m
  const p = c.p
  if (m.combat.slideCd > 0 || m.combat.power < 25) return false
  const bb = m.boss
  if (bb && bb.attack === 'leapSlam' && (bb.state === 'tele' || bb.state === 'act')) return false
  if (sys(c).rings.some(r => r.active && !r.hit)) return false
  let soon = false
  for (let t = 0.05; t <= 0.3; t += 0.05) if (unsafeAt(m as never, p.x, p.y, p.z, m.time + t, { slow: false, rings: false })) { soon = true; break }
  if (!soon) return false
  let best: [number, number] | null = null
  for (let a = 0; a < 8 && !best; a++) {
    const th = (a * Math.PI) / 4
    if (slideOk(c, Math.cos(th), Math.sin(th))) best = [Math.cos(th), Math.sin(th)]
  }
  if (!best) return false
  c.slide(best[0], best[1])
  return true
}

/** Block what flies at him: a Master's orange attack winding up, a missile or
 *  a blockable shot within a few metres and coming on. */
const wantBlock = (c: Ctx): boolean => {
  const m = c.m
  const p = c.p
  const b = m.boss
  if (b && !b.teleRed && (b.state === 'tele' || b.state === 'act') && b.attack !== 'chargedBlast' && c.dist(b.x, b.z) < 16) return true
  for (const s of sys(c).shots) {
    if (!s.active || s.owner !== 'enemy' || s.kind === 'shell' || !s.blockable) continue
    const dx = p.x - s.x
    const dz = p.z - s.z
    const d = Math.hypot(dx, dz)
    if (d > 7) continue
    if (s.vx * dx + s.vz * dz > 0) return true
  }
  return false
}

/** One frame of the Blaze Master fight: stay clear of what it throws, dash its
 *  rings, block its orange moves and missiles, shoot it between. */
function* bossTick(c: Ctx, st: State): Task {
  const m = c.m
  const p = c.p
  const b = m.boss!
  if (b.state === 'dead') { yield; return }
  if (m.time - st.lastLog > 3) { st.lastLog = m.time; c.log(`boss ${b.state}:${b.attack} ${Math.round(b.hp)}/${Math.round(b.maxHp)} d=${c.dist(b.x, b.z).toFixed(1)} me (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) hp ${m.combat.hp.toFixed(0)} shield=${(b as unknown as { bossShield?: number }).bossShield ?? 0}`) }
  if (m.combat.hp < st.hp - 0.5) c.log(`HIT ${st.hp.toFixed(0)} -> ${m.combat.hp.toFixed(0)} boss ${b.state}:${b.attack} d=${c.dist(b.x, b.z).toFixed(1)} slcd=${m.combat.slideCd.toFixed(2)} pw=${m.combat.power.toFixed(0)} blk=${m.combat.blocking} iframes=${m.combat.iframes.toFixed(2)} rings=${sys(c).rings.filter(r => r.active).map(r => `r${r.r.toFixed(1)}/${r.speed}${r.hit ? 'H' : ''}@${Math.hypot(p.x - r.x, p.z - r.z).toFixed(1)}`).join(',')} waves=${(m as unknown as { system: { waves: Array<{ active: boolean }> } }).system.waves.filter(w => w.active).length}`)
  st.hp = m.combat.hp
  if (b.offstage) { yield; return }
  if (ringDash(c, st)) { c.log(`ring dash boss ${b.attack}`); yield; return }
  if (panicSlide(c)) { c.log(`panic dash boss ${b.state}:${b.attack}`); yield; return }
  const d = c.dist(b.x, b.z)
  // Where to be: a ring's width off the boss, strafing round it, never into a wall.
  const rx = (p.x - b.x) / (d || 1)
  const rz = (p.z - b.z) / (d || 1)
  let side = Math.floor(m.time / 3) % 2 ? 1 : -1
  const open = (x: number, z: number): boolean => {
    const g = groundAt(m.map, x, z)
    return g !== -Infinity && Math.abs(g - p.y) < 0.9 && !isSolidAt(m.nav, x, z)
  }
  const radial = d < 8 ? 1.5 : d > 11 ? -1.5 : 0
  const aim = (sd: number): [number, number] => [p.x - rz * sd * 3 + rx * radial * 2, p.z + rx * sd * 3 + rz * radial * 2]
  let [wx, wz] = aim(side)
  if (!open(p.x + (wx - p.x) * 1.2, p.z + (wz - p.z) * 1.2)) { side = -side; [wx, wz] = aim(side) }
  if (!open(p.x + (wx - p.x) * 1.2, p.z + (wz - p.z) * 1.2)) {
    // Boxed in: toward the middle of the room.
    const room = m.map.rooms.find(r => r.role === 'boss')
    if (room) { wx = (room.x0 + room.w / 2) * CELL; wz = (room.z0 + room.h / 2) * CELL }
  }
  const block = wantBlock(c)
  if (block) { c.face(b.x, b.z); m.input.blockHeld = true; m.input.blockPressed ||= !m.combat.blocking }
  else {
    c.aimAt(b)
    const shieldUp = ((b as unknown as { bossShield?: number }).bossShield ?? 0) > 0
    if (!shieldUp && m.time - st.lastShot > 0.22) { st.lastShot = m.time; m.input.firePressed = true; m.input.fireHeld = true }
    else if (m.time - st.lastShot < 0.07) m.input.fireHeld = true
    else m.input.fireReleased = m.time - st.lastShot < 0.1
  }
  move(c, st, wx, wz, true, 2.0)
  yield
}
export const route = blazeRoute
