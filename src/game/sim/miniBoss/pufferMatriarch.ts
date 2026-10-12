import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { Rig } from '../../models/kit'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildPufferMatriarch, posePufferMatriarch, newPufferPose, buildMatriarchMine, MATRIARCH_COLORS, MATRIARCH_ESCORTS,
  MATRIARCH_R, MATRIARCH_SCALE, type PufferPose
} from '../../models/miniBoss/pufferMatriarch'
import { posePuffer } from '../../models/enemies'
import { TAU, faceTo, moveBody, distToPlayer, keepInRoom, roomBox, teleRing, inCone, near, ease } from './kit'
import { PLAYER_R } from '../constants'
import { pushHud } from '../../state/hud'

/**
 * ─── The Puffer Matriarch (Tidewater Locks) ──────────────────────────────────
 *
 * The Puffer Mines' queen, crowned, as big as a small car, three little
 * puffers swimming round her. The Tide Master throws waves and whirlpools
 * across its arena; she is the hazard herself — she bounces round the room,
 * sows mines and hoses the floor.
 *
 *  - BOUNCE (red: get off her path). She gulps air and inflates to half again
 *    her size, every spine out, three rising whines (BOUNCE_TELE), while her
 *    whole route — to Flux and off the walls, BOUNCE_LEGS legs — is drawn on
 *    the floor in red; then she bounces along it at BOUNCE_SPEED, hurting
 *    whoever she lands on, and sags, deflated, at its end (her opening).
 *  - MINES (no hit of their own). She rears back and coughs (MINE_TELE) and
 *    her escorts line up at her lips over red marks; they come out as
 *    mines that drift after Flux — never more than MINE_CAP at a time. A
 *    mine close to him (or old enough) stops, swells over a red ring
 *    (MINE_ARM), and bursts. A new little puffer hatches ESCORT_REGROW
 *    after its mine went off.
 *  - WATER JET (orange: block it). She sucks her cheeks in and puckers to a
 *    point (JET_TELE) while the arc she will hose is drawn on the floor, a
 *    bright line on the edge it starts from; then the jet sweeps that arc
 *    once (JET_T).
 *
 * Under half health her route has a leg more and her mines drift faster.
 * Her entrance: she surfaces through the floor in a fountain of spray,
 * puffs up to full size and lets the air out with a whistle.
 */

export const INTRO_T = 2.6
/** Her hover (her middle over the floor, m). */
const HOVER = 1.55
/** The bounce: wind-up (s), speed (m/s), legs off the walls, hop height and length (m). */
export const BOUNCE_TELE = 1.2
export const BOUNCE_SPEED = 8
const BOUNCE_LEGS = 3
const HOP_H = 0.9
const HOP_LEN = 3.2
const BOUNCE_MAX = 30
/** Her swollen radius (m) — on the floor at the bottom of a hop. */
const SWOLLEN_R = MATRIARCH_R * 1.5 * MATRIARCH_SCALE
/** The mines: wind-up (s), at most this many at once, drift (m/s), the reach
 *  that stops one (m), its fuse (s), its swell and its burst (s, m). */
export const MINE_TELE = 0.8
export const MINE_CAP = 3
const MINE_SPEED = 1.4
const MINE_TRIGGER = 1.9
const MINE_FUSE = 6
export const MINE_ARM = 0.9
export const MINE_R = 1.7
/** A mine's body for Flux's shots (m, to its middle), and its pop's puff (m). */
export const MINE_HIT_R = 0.5
const MINE_POP_R = 1.0
/** Its floating height over the floor (m). */
const MINE_Y = 1.1
const MINE_GAP = 1.1
const ESCORT_REGROW = 5
/** The jet: wind-up (s; its start edge locks then), the sweep (s), the arc
 *  (rad), reach (m) and the jet's half-width (rad). */
export const JET_TELE = 1.0
export const JET_T = 1.3
export const JET_ARC = 1.9
export const JET_RANGE = 8
const JET_HALF = 0.1

type Attack = 'bounce' | 'mines' | 'jet'

interface Mine { x: number; z: number; yaw: number; t: number; armed: number; slot: number; rig: Rig }

export interface PufferMem {
  pose: PufferPose
  attack: Attack | ''
  /** The bounce's route (x, z pairs) and how far along it she is (m). */
  route: number[]
  run: number
  routeLen: number
  /** Her escorts: swimming round her, or out as a mine / hatching again. */
  escorts: Array<{ st: 'swim' | 'mine' | 'gone'; t: number }>
  mines: Mine[]
  /** Mine bodies not in use. */
  spare: Rig[]
  /** Escorts about to be let go (their slots), set by the wind-up. */
  queued: number[]
  /** The jet: its start (world yaw) and the way it sweeps (±1). */
  a0: number
  dir: number
  /** The jet's arc on the floor (a child of her root, built on first use). */
  arc: Group | null
  /** The arc drawn on the floor right now (the tests read it). */
  arcOn: boolean
  phase2: boolean
  side: number
  surfaced: boolean
  /** Attacks since each move was last used. */
  since: Record<Attack, number>
}

const fy = (e: Enemy): number => e.floor ?? 0

const ARC_COLOR = new Color('#ff8a2a')

const makeArc = (e: Enemy): Group => {
  const g = new Group()
  const mk = (r0: number, len: number, op: number): Mesh => {
    const geo = new RingGeometry(r0, JET_RANGE, 32, 1, -Math.PI / 2, len)
    geo.rotateX(-Math.PI / 2)
    const m = new Mesh(geo, new MeshBasicMaterial({
      color: ARC_COLOR.clone(), transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    }))
    m.renderOrder = 1
    return m
  }
  // The arc it will hose, and the bright edge the jet starts on.
  g.add(mk(1.4, JET_ARC, 0), mk(1.4, 0.07, 0))
  g.visible = false
  e.root.add(g)
  return g
}

const showArc = (m: PufferMem, fill: number, edge: number): void => {
  const g = m.arc
  if (!g) return
  g.visible = fill > 0 || edge > 0
  m.arcOn = g.visible
  ;((g.children[0] as Mesh).material as MeshBasicMaterial).opacity = fill
  ;((g.children[1] as Mesh).material as MeshBasicMaterial).opacity = edge
}

/** Escorts she can let go now (free ones, under the cap of live mines). */
const releasable = (m: PufferMem): number =>
  Math.min(m.escorts.filter(s => s.st === 'swim').length, MINE_CAP - m.mines.length)

/** The bounce's route: at Flux, then off the walls (a light ray in the room's box). */
const plan = (w: World, e: Enemy, m: PufferMem, room: Room): void => {
  const [x0, z0, x1, z1] = roomBox(room, SWOLLEN_R * 0.75)
  let x = Math.min(x1, Math.max(x0, e.x))
  let z = Math.min(z1, Math.max(z0, e.z))
  let dx = w.player.x - x
  let dz = w.player.z - z
  const l = Math.hypot(dx, dz) || 1
  dx /= l
  dz /= l
  m.route = [x, z]
  let total = 0
  const legs = BOUNCE_LEGS + (m.phase2 ? 1 : 0)
  for (let k = 0; k < legs && total < BOUNCE_MAX; k++) {
    const tx = dx > 1e-6 ? (x1 - x) / dx : dx < -1e-6 ? (x0 - x) / dx : Infinity
    const tz = dz > 1e-6 ? (z1 - z) / dz : dz < -1e-6 ? (z0 - z) / dz : Infinity
    const t = Math.max(0.5, Math.min(tx, tz, BOUNCE_MAX - total))
    x += dx * t
    z += dz * t
    total += t
    m.route.push(x, z)
    if (tx < tz) dx = -dx
    else dz = -dz
  }
  m.routeLen = total
  m.run = 0
  // The route on the floor: a red mark every 1.5 m, each gone as she passes it.
  for (let s = 1.2; s < total; s += 1.5) {
    const [px, pz] = at(m, s)
    w.markers.spawn(px, pz, 1.0, BOUNCE_TELE + s / BOUNCE_SPEED + 0.1)
  }
}

/** The point `s` m along the route, and its heading. */
const _at: [number, number, number] = [0, 0, 0]
const at = (m: PufferMem, s: number): [number, number, number] => {
  const r = m.route
  let left = s
  for (let k = 0; k + 3 < r.length; k += 2) {
    const ax = r[k]!
    const az = r[k + 1]!
    const bx = r[k + 2]!
    const bz = r[k + 3]!
    const l = Math.hypot(bx - ax, bz - az)
    if (left <= l || k + 4 >= r.length) {
      const f = l > 1e-6 ? Math.min(1, left / l) : 1
      _at[0] = ax + (bx - ax) * f
      _at[1] = az + (bz - az) * f
      _at[2] = Math.atan2(bx - ax, bz - az)
      return _at
    }
    left -= l
  }
  _at[0] = r[0] ?? 0
  _at[1] = r[1] ?? 0
  return _at
}

const pick = (e: Enemy, m: PufferMem, d: number): Attack => {
  const r = Math.random()
  let a: Attack = d < 5
    ? (r < 0.4 ? 'jet' : r < 0.8 ? 'bounce' : 'mines')
    : (r < 0.45 ? 'bounce' : r < 0.8 ? 'mines' : 'jet')
  if (a === m.attack && e.step >= 1) a = a === 'bounce' ? 'jet' : 'bounce'
  // A move left out three times running comes next.
  const owed = (['jet', 'bounce', 'mines'] as const).find(x => m.since[x] >= 3 && (x !== 'mines' || releasable(m) > 0))
  if (owed) a = owed
  if (a === 'mines' && releasable(m) === 0) a = d < 5 ? 'jet' : 'bounce'
  for (const x of ['jet', 'bounce', 'mines'] as const) m.since[x] = x === a ? 0 : m.since[x] + 1
  return a
}

const begin = (w: World, e: Enemy, m: PufferMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  if (a === 'bounce') {
    e.teleDur = BOUNCE_TELE
    e.teleRed = true
    plan(w, e, m, room)
    w.sfx('charge1', e.x, e.z)
  } else if (a === 'mines') {
    e.teleDur = MINE_TELE
    e.teleRed = true
    m.queued = []
    const n = releasable(m)
    for (let k = 0; k < MATRIARCH_ESCORTS && m.queued.length < n; k++) if (m.escorts[k]!.st === 'swim') m.queued.push(k)
    // Where each will come out: in front of her lips.
    m.queued.forEach((_, i) => {
      const [x, z] = minePoint(e, i, m.queued.length)
      w.markers.spawn(x, z, 0.8, MINE_TELE + 0.3)
    })
    w.sfx('trapClick', e.x, e.z)
  } else {
    e.teleDur = JET_TELE
    e.teleRed = false
    m.arc ??= makeArc(e)
    m.dir = Math.random() < 0.5 ? 1 : -1
    m.a0 = Math.atan2(w.player.x - e.x, w.player.z - e.z) - (m.dir * JET_ARC) / 2
    w.sfx('trapHiss', e.x, e.z)
  }
}

/** Where the `i`th of `n` mines comes out (world). */
const minePoint = (e: Enemy, i: number, n: number): [number, number] => {
  const side = (i - (n - 1) / 2) * 1.0
  const f = 2.0
  return [e.x + Math.sin(e.yaw) * f + Math.cos(e.yaw) * side, e.z + Math.cos(e.yaw) * f - Math.sin(e.yaw) * side]
}

/** The mines' own clock: drifting after Flux, arming, bursting; escorts hatching. */
const tickMines = (w: World, e: Enemy, m: PufferMem, dt: number): void => {
  const y0 = fy(e)
  for (const s of m.escorts) {
    s.t += dt
    if (s.st === 'gone' && s.t >= ESCORT_REGROW) { s.st = 'swim'; s.t = 0 }
  }
  for (let k = m.mines.length - 1; k >= 0; k--) {
    const b = m.mines[k]!
    b.t += dt
    if (b.armed < 0) {
      const dx = w.player.x - b.x
      const dz = w.player.z - b.z
      const d = Math.hypot(dx, dz)
      if (d > 0.3) {
        const sp = MINE_SPEED * (m.phase2 ? 1.25 : 1) * Math.min(1, b.t / 0.6) * dt
        b.x += (dx / d) * sp
        b.z += (dz / d) * sp
        b.yaw = Math.atan2(dx, dz)
      }
      // Mines keep a little apart (they never merge into one).
      for (const o of m.mines) {
        if (o === b) continue
        const ox = b.x - o.x
        const oz = b.z - o.z
        const od = Math.hypot(ox, oz)
        if (od < MINE_GAP && od > 1e-4) {
          b.x += (ox / od) * (MINE_GAP - od) * 0.5
          b.z += (oz / od) * (MINE_GAP - od) * 0.5
        }
      }
      if (d < MINE_TRIGGER || b.t > MINE_FUSE || e.state === 'dead') {
        b.armed = 0
        w.markers.spawn(b.x, b.z, MINE_R, MINE_ARM)
        w.sfx('trapClick', b.x, b.z)
      }
      continue
    }
    b.armed += dt
    if (b.armed < MINE_ARM) continue
    retire(m, k)
    w.shocks.spawn(b.x, y0 + 0.06, b.z, MINE_R, MATRIARCH_COLORS.gem, 0.4)
    w.fx.sparks(b.x, y0 + 1, b.z, '#bff0ff', 16, 6, 0.25)
    w.sfx('explode', b.x, b.z)
    if (near(w, b.x, b.z, MINE_R)) {
      w.hitPlayer(e, Math.round(e.dmg * 0.75), { blockable: false, fromX: b.x, fromZ: b.z, kind: 'aoe' })
    }
  }
}

/** A mine done with (burst, popped, gone with her): its puffer hatches again later. */
const retire = (m: PufferMem, k: number): Mine => {
  const b = m.mines[k]!
  m.mines.splice(k, 1)
  b.rig.root.visible = false
  m.spare.push(b.rig)
  const slot = m.escorts[b.slot]!
  slot.st = 'gone'
  slot.t = 0
  return b
}

const release = (w: World, e: Enemy, m: PufferMem): void => {
  m.queued.forEach((slot, i) => {
    if (m.mines.length >= MINE_CAP) return
    const [x, z] = minePoint(e, i, m.queued.length)
    let rig = m.spare.pop()
    if (!rig) {
      rig = buildMatriarchMine()
      e.root.add(rig.root)
    }
    rig.root.visible = true
    m.escorts[slot]!.st = 'mine'
    m.mines.push({ x, z, yaw: e.yaw, t: 0, armed: -1, slot, rig })
  })
  m.queued = []
  w.sfx('lob', e.x, e.z)
}

export const PUFFER_MATRIARCH_AI: MiniBossBehaviour<PufferMem> = {
  init: () => ({
    pose: newPufferPose(), attack: '', route: [], run: 0, routeLen: 0,
    escorts: Array.from({ length: MATRIARCH_ESCORTS }, () => ({ st: 'swim' as const, t: 0 })),
    mines: [], spare: [], queued: [], a0: 0, dir: 1, arc: null, arcOn: false, phase2: false, side: 1, surfaced: false,
    since: { bounce: 0, mines: 0, jet: 0 }
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    const y0 = fy(e)
    // Up through the floor in a fountain of spray…
    const k = Math.min(1, e.st / 1.1)
    e.y = -1.6 + (HOVER + 1.6) * (1 - (1 - k) * (1 - k))
    if (!m.surfaced) {
      m.surfaced = true
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3, MATRIARCH_COLORS.gem, 0.6)
      w.sfx('explode', e.x, e.z)
    }
    if (k < 1 && Math.random() < 0.8) {
      w.fx.emit({ x: e.x + (Math.random() - 0.5) * 2.4, y: y0 + 0.1, z: e.z + (Math.random() - 0.5) * 2.4, vy: 5 + Math.random() * 4, color: Math.random() < 0.5 ? '#bff0ff' : '#5fd2ff', size: 0.45, sizeEnd: 0.05, life: 0.7, gravity: 8 })
    }
    faceTo(e, w.player.x, w.player.z, 3, dt)
    // …then she puffs up to full size, and lets it out.
    const puff = e.st > 1.2 && e.st < 2.15 ? 1 : 0
    if (puff && p.swell < 0.05) w.sfx('charge2', e.x, e.z)
    if (!puff && p.swell > 0.9) w.sfx('gust', e.x, e.z)
    p.swell = ease(p.swell, puff, 6, dt)
    p.heat = ease(p.heat, 1 + puff, 6, dt)
    if (e.st >= INTRO_T) {
      e.y = HOVER
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    tickMines(w, e, m, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: MATRIARCH_COLORS.gem, strength: 0.25 })
    }
    let swell = 0
    let pucker = 0
    let jet = 0
    let cough = 0
    let heat = 1
    let y = HOVER + 0.12 * Math.sin(e.anim * 1.6)
    switch (e.state) {
      case 'engage': {
        // She drifts round him at mid range.
        faceTo(e, w.player.x, w.player.z, 2.5, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side * 0.7
        let mz = nx * m.side * 0.7
        if (d > 7.5) { mx -= nx; mz -= nz } else if (d < 4.5) { mx += nx; mz += nz }
        const ml = Math.hypot(mx, mz) || 1
        const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
        if (moveBody(w, e, (mx / ml) * sp * dt, (mz / ml) * sp * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.2) m.side = -m.side
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.8)
        heat = 1 + 1.4 * k
        if (m.attack === 'bounce') {
          // Gulping air: swelling, every spine out, a whine rising three times.
          swell = Math.min(1, k * 1.15)
          const was = Math.floor((e.st - dt) / (e.teleDur / 3))
          const now = Math.floor(e.st / (e.teleDur / 3))
          if (now > was && now < 3) w.sfx(now === 1 ? 'charge2' : 'charge3', e.x, e.z)
          faceTo(e, m.route[2] ?? w.player.x, m.route[3] ?? w.player.z, 3, dt)
          // Down to the floor for the first hop.
          y = HOVER + (SWOLLEN_R - HOVER) * k * k
        } else if (m.attack === 'mines') {
          cough = Math.min(1, k * 1.6)
          faceTo(e, w.player.x, w.player.z, 2, dt)
        } else {
          pucker = Math.min(1, k * 1.4)
          // Round to the edge the jet starts from.
          faceTo(e, e.x + Math.sin(m.a0), e.z + Math.cos(m.a0), 3, dt)
          showArc(m, 0.1 + 0.25 * k + (k > 0.8 ? 0.1 * Math.sin(e.st * 40) : 0), 0.4 + 0.5 * k)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'bounce') w.sfx('dash', e.x, e.z)
          else if (m.attack === 'mines') release(w, e, m)
          else w.sfx('flameJet', e.x, e.z)
        }
        break
      }
      case 'act': {
        if (m.attack === 'bounce') {
          swell = 1
          heat = 2
          const was = m.run
          m.run = Math.min(m.routeLen, m.run + BOUNCE_SPEED * dt)
          const [x, z, h] = at(m, m.run)
          e.x = x
          e.z = z
          e.yaw = h
          const hop = Math.abs(Math.sin((Math.PI * m.run) / HOP_LEN))
          y = SWOLLEN_R + HOP_H * hop
          p.roll += ((m.run - was) / SWOLLEN_R)
          // Every landing: a splash ring and a thud.
          if (Math.floor(m.run / HOP_LEN) > Math.floor(was / HOP_LEN)) {
            w.shocks.spawn(x, fy(e) + 0.06, z, SWOLLEN_R + 0.4, MATRIARCH_COLORS.gem, 0.35)
            w.shake(0.15)
            w.sfx('bonk', x, z)
          }
          if (!e.hitPlayer && d < SWOLLEN_R * 0.9 + PLAYER_R) {
            e.hitPlayer = true
            w.hitPlayer(e, Math.round(e.dmg * 1.3), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
          }
          if (m.run >= m.routeLen) { e.state = 'recover'; e.st = 0 }
        } else if (m.attack === 'mines') {
          cough = Math.max(0, 1 - e.st * 3)
          if (e.st >= 0.45) { e.state = 'recover'; e.st = 0 }
        } else {
          jet = 1
          heat = 2
          const k = Math.min(1, e.st / JET_T)
          const a = m.a0 + m.dir * JET_ARC * k
          e.yaw = a
          showArc(m, 0.3 * (1 - k), 0)
          // The water: a stream along the jet.
          const y0 = fy(e)
          for (let n = 0; n < 3; n++) {
            const sp = 12 + Math.random() * 4
            const aa = a + (Math.random() - 0.5) * JET_HALF * 1.5
            w.fx.emit({
              x: e.x + Math.sin(a) * 1.4, y: y0 + y - 0.35, z: e.z + Math.cos(a) * 1.4,
              vx: Math.sin(aa) * sp, vy: -0.8 - Math.random(), vz: Math.cos(aa) * sp,
              color: Math.random() < 0.4 ? '#ffffff' : '#7fe0ff', size: 0.4, sizeEnd: 0.9, life: JET_RANGE / sp, drag: 0.3
            })
          }
          if (!e.hitPlayer && inCone(w, e.x, e.z, a, JET_RANGE, JET_HALF)) {
            e.hitPlayer = true
            w.hitPlayer(e, Math.round(e.dmg * 1.0), { blockable: true, fromX: e.x, fromZ: e.z, kind: 'shot' })
          }
          if (e.st >= JET_T) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        // Deflated after a bounce (sagging low, her opening); a breath after the rest.
        const flat = m.attack === 'bounce'
        heat = 0.7
        y = flat ? 0.95 + 0.6 * Math.min(1, e.st / 1.3) : y
        faceTo(e, w.player.x, w.player.z, 1.5, dt)
        if (e.st > (flat ? 1.3 : 0.6) * (m.phase2 ? 0.8 : 1)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (!(m.attack === 'jet' && (e.state === 'tele' || e.state === 'act'))) showArc(m, 0, 0)
    keepInRoom(e, room)
    e.y = e.state === 'act' && m.attack === 'bounce' ? y : ease(e.y, y, 8, dt)
    if (!(e.state === 'act' && m.attack === 'bounce')) p.roll = ease(p.roll, Math.round(p.roll / TAU) * TAU, 4, dt)
    p.swell = ease(p.swell, swell, e.state === 'recover' ? 3 : 8, dt)
    p.pucker = ease(p.pucker, pucker, 10, dt)
    p.jet = ease(p.jet, jet, 12, dt)
    p.cough = ease(p.cough, cough, 10, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    tickMines(w, e, m, dt)
    showArc(m, 0, 0)
    p.dying = Math.min(1, e.deathT / 1.1)
    // She deflates with a sputter and sinks to the floor.
    e.y = ease(e.y, MATRIARCH_R * MATRIARCH_SCALE * 0.8, 3, dt)
    p.swell = ease(p.swell, 0.6 * Math.abs(Math.sin(e.deathT * 9)) * (1 - p.dying), 14, dt)
    p.heat = ease(p.heat, 0.5 + Math.random() * 2, 12, dt)
    if (Math.random() < dt * 14) {
      const a = Math.random() * TAU
      w.fx.emit({ x: e.x + Math.sin(a) * 1.2, y: fy(e) + e.y, z: e.z + Math.cos(a) * 1.2, vx: Math.sin(a) * 4, vy: 2, vz: Math.cos(a) * 4, color: '#bff0ff', size: 0.5, sizeEnd: 0.05, life: 0.5 })
      w.shake(0.06)
    }
  },

  pose(e, m, time) {
    const p = m.pose
    p.time = time
    // Escorts: round her, lined up at her lips for the cough, hatching again.
    const lined = e.state === 'tele' && m.attack === 'mines'
    let q = 0
    for (let k = 0; k < MATRIARCH_ESCORTS; k++) {
      const s = m.escorts[k]!
      const sp = p.escorts[k]!
      const a = time * 1.1 + (k / MATRIARCH_ESCORTS) * TAU
      const wake = e.state === 'alert' ? Math.min(1, Math.max(0, (e.st - 1.6) / 0.8)) : 1
      const r = 0.4 + 1.25 * wake + (e.state === 'dead' ? e.deathT * 4 : 0)
      let x = Math.sin(a) * r
      let y = 0.15 * Math.sin(time * 2.3 + k * 2)
      let z = Math.cos(a) * r
      let yaw = a + Math.PI / 2
      if (lined && m.queued.includes(k)) {
        const f = Math.min(1, e.st / 0.35)
        const n = m.queued.length
        x += ((q - (n - 1) / 2) * 0.6 - x) * f
        y += (-0.15 - y) * f
        z += (1.35 - z) * f
        yaw += (0 - yaw) * f
        q++
      }
      sp.s = (s.st === 'swim' ? 1 : s.st === 'gone' ? Math.max(0, Math.min(1, (s.t - (ESCORT_REGROW - 0.6)) / 0.6)) : 0) * wake
      // One out as a mine (or not hatched yet) waits shrunk inside her.
      const f = Math.min(1, sp.s * 3)
      sp.x = x * f
      sp.y = y * f
      sp.z = z * f
      sp.yaw = yaw
    }
    posePufferMatriarch(e.rig, p)
    // The mines out in the room (world → her frame; they never take her turn).
    const rx = e.root.position.x
    const ry = e.root.position.y
    const rz = e.root.position.z
    const cy = Math.cos(e.yaw)
    const sy = Math.sin(e.yaw)
    for (const b of m.mines) {
      const dx = b.x - rx
      const dz = b.z - rz
      const swell = b.armed < 0 ? 0 : Math.min(1, b.armed / MINE_ARM)
      b.rig.root.position.set(dx * cy - dz * sy, fy(e) + MINE_Y + 0.12 * Math.sin(time * 2 + b.slot) - ry, dx * sy + dz * cy)
      b.rig.root.rotation.y = b.yaw - e.yaw
      b.rig.root.scale.setScalar(1.15)
      posePuffer(b.rig, swell, time + b.slot)
    }
    // The jet's arc stays put on the floor as she turns.
    if (m.arc) {
      m.arc.position.y = fy(e) + 0.05 - ry
      m.arc.rotation.y = m.a0 - e.yaw
      m.arc.scale.x = m.dir
    }
  },

  clear(_w, e, m) {
    showArc(m, 0, 0)
    m.queued = []
    // Her death: the mines left in the room fizzle out.
    if (e.state === 'dead') {
      for (const b of m.mines) {
        b.rig.root.visible = false
        m.spare.push(b.rig)
      }
      m.mines.length = 0
    }
  },

  // Flux can pop a mine early, like any Puffer Mine: a shot that reaches one
  // bursts it in a harmless puff (no bolts, no XP), and its puffer hatches again.
  shot(w, e, m, s) {
    const y0 = fy(e)
    for (let k = 0; k < m.mines.length; k++) {
      const b = m.mines[k]!
      const r = MINE_HIT_R * (1 + 0.5 * Math.min(1, Math.max(0, b.armed) / MINE_ARM)) + s.radius
      if ((s.x - b.x) ** 2 + (s.y - y0 - MINE_Y) ** 2 + (s.z - b.z) ** 2 > r * r) continue
      retire(m, k)
      w.shocks.spawn(b.x, y0 + 0.06, b.z, MINE_POP_R, MATRIARCH_COLORS.gem, 0.3)
      w.fx.sparks(b.x, y0 + MINE_Y, b.z, '#bff0ff', 12, 5, 0.2)
      w.sfx('hit', b.x, b.z)
      return 'catch'
    }
  }
}

export const PUFFER_MATRIARCH: MiniBossSpec<PufferMem> = {
  id: 'pufferMatriarch',
  sector: 'tide',
  nameKey: 'miniboss.pufferMatriarch',
  def: {
    // `fly` 0: she is solid to Flux, and a magnet pull must not stun-lock a flyer
    // this size; her hover is her own (`HOVER`, `e.y`).
    kind: 'miniboss', hp: 546, dmg: 18, speed: 2.1, radius: 1.15, hitR: 1.4, aimY: 0, fly: 0,
    aggro: 30, range: [4.5, 7.5], xp: 185, bolts: [30, 44], cooldown: 1.5, tele: BOUNCE_TELE, unblockable: true, armor: 1,
    // Her glowing belly, under her lips (seen from in front).
    weak: { part: 'core', up: -0.55 * MATRIARCH_SCALE, fwd: 0.62 * MATRIARCH_SCALE, side: 0, r: 0.4 },
    color: MATRIARCH_COLORS.gem
  },
  build: () => buildPufferMatriarch(),
  behaviour: PUFFER_MATRIARCH_AI
}
