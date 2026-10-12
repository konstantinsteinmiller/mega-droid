import { AdditiveBlending, CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildBurrowWyrm, poseBurrowWyrm, newWyrmPose, wyrmSegR, WYRM_COLORS, WYRM_SEGS, WYRM_NECK, WYRM_GAP, type WyrmPose
} from '../../models/miniBoss/burrowWyrm'
import { TAU, angDiff, faceTo, moveBody, distToPlayer, keepInRoom, inRoom, teleRing, near, ease } from './kit'
import { pushHud } from '../../state/hud'

/**
 * ─── The Burrow Wyrm (Deep Drill Mines) ──────────────────────────────────────
 *
 * A segmented mining worm with a drill for a head. Where the Drill Master
 * is an android that lobs bombs and quakes the mine, the wyrm IS the
 * tunnel: it slithers round Flux, dives, and comes up under him.
 *
 *  - DIVE (no hit of its own). It rears up, then plunges its drill into the
 *    floor (DIVE_TELE) and its body pours in after it. Underground it is
 *    out of reach (`Enemy.buried`) and travels at Flux for TRAVEL_T: a
 *    track of dust and cracking floor races across the room.
 *  - ERUPTION (red: get out of the ring). The track stops; a red ring opens
 *    on the floor where it is, the ground fountains dust, the tele ring
 *    closes over the spot (ERUPT_TELE). Then it bursts straight up out of
 *    the floor, head to the sky, hitting everything in ERUPT_R — and stands
 *    there dazed a moment, the opening to punish.
 *  - SPIT (orange: block it). It rears up tall, the head pulled back, the
 *    drill bit pushed out on its shaft and the mandibles flung wide on its
 *    glowing maw (SPIT_TELE), while the lanes of the fan it will spit are
 *    drawn on the floor in front of it, its aim on Flux until the last beat;
 *    then a fan of SPIT_N rocks (two fans under half health).
 *
 * Its body follows the head along the path the head has taken (`pose`):
 * every curve, every dive into the floor, every climb out of a hole.
 * Its entrance: a track of dust circles the room, then it bursts out of the
 * middle of it.
 */

export const INTRO_T = 2.8
/** The dive: wind-up (s; the rear, then the plunge), how deep it goes (m). */
export const DIVE_TELE = 0.9
const DIVE_DEPTH = 3.2
/** Underground: how long it travels at Flux (s) and how fast (m/s). */
export const TRAVEL_T = 1.3
const TRAVEL_SPEED = 7
/** The eruption: wind-up over the spot (s), its reach (m), how long it
 *  stands up out of the hole (s). */
export const ERUPT_TELE = 0.95
export const ERUPT_R = 2.3
const ERUPT_T = 0.8
/** The spit: wind-up (s; the aim locks for its last SPIT_LOCK), the rocks,
 *  the fan's half-angle (rad), their speed (m/s), the lanes' length (m). */
export const SPIT_TELE = 0.9
const SPIT_LOCK = 0.3
export const SPIT_N = 5
export const SPIT_HALF = 0.55
const SPIT_SPEED = 12
const SPIT_LANE = 11
/** How high a reared head stands over its own segment (m per `rear`). */
const REAR_H = 1.0
/** How far down its body the rear lifts it (m of path). */
const REAR_LEN = 3.4
/** The head's radius over the floor (m). */
const HEAD_R = 0.5
/** Its segments' armour reaches this far past their bodies for Flux's shots (m). */
const SEG_ARMOUR = 0.12

type Attack = 'dive' | 'erupt' | 'spit'

export interface WyrmMem {
  pose: WyrmPose
  attack: Attack | ''
  /** 0 on the surface, negative under the floor (m). */
  depth: number
  /** How far the head stands up (0 flat on the floor … ~2.4 a full eruption). */
  rear: number
  /** The head's pitch (rad, nose up negative). */
  pitch: number
  /** The path the head has travelled, newest first: x, depth, z triples. */
  path: number[]
  /** The eruption's spot. */
  ex: number
  ez: number
  /** The trail's crack pulses (s to the next). */
  crack: number
  /** Fans spat so far in this spit. */
  volleys: number
  phase2: boolean
  side: number
  /** The spit's lanes on the floor (a child of its root, built on first use). */
  fan: Group | null
  /** The fan drawn on the floor right now (the tests read it). */
  fanOn: boolean
  burst: boolean
}

const fy = (e: Enemy): number => e.floor ?? 0
const PATH_MAX = 64 * 3

/** Note the head's place on its path (every few centimetres it moves). */
const record = (e: Enemy, m: WyrmMem): void => {
  const p = m.path
  if (p.length >= 3 && Math.hypot(e.x - p[0]!, m.depth - p[1]!, e.z - p[2]!) < 0.12) return
  p.unshift(e.x, m.depth, e.z)
  if (p.length > PATH_MAX) p.length = PATH_MAX
}

/** A point `s` metres back along its path (into `o`: x, depth, z). */
const along = (m: WyrmMem, hx: number, hd: number, hz: number, s: number, o: number[]): void => {
  const p = m.path
  let px = hx
  let pd = hd
  let pz = hz
  let left = s
  for (let k = 0; k + 2 < p.length; k += 3) {
    const qx = p[k]!
    const qd = p[k + 1]!
    const qz = p[k + 2]!
    const l = Math.hypot(qx - px, qd - pd, qz - pz)
    if (l >= left && l > 1e-6) {
      const f = left / l
      o[0] = px + (qx - px) * f
      o[1] = pd + (qd - pd) * f
      o[2] = pz + (qz - pz) * f
      return
    }
    left -= l
    px = qx
    pd = qd
    pz = qz
  }
  // Past the end of what it remembers: straight on underground.
  o[0] = px
  o[1] = Math.min(pd, -DIVE_DEPTH) - left
  o[2] = pz
}

const LANE_W = 0.07

const makeFan = (e: Enemy): Group => {
  const g = new Group()
  for (let k = 0; k < SPIT_N; k++) {
    const o = -SPIT_HALF + (2 * SPIT_HALF * k) / (SPIT_N - 1)
    const geo = new CircleGeometry(SPIT_LANE, 6, o - Math.PI / 2 - LANE_W / 2, LANE_W)
    geo.rotateX(-Math.PI / 2)
    const lane = new Mesh(geo, new MeshBasicMaterial({
      color: new Color('#ff8a2a'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    }))
    lane.renderOrder = 1
    g.add(lane)
  }
  g.position.y = 0.05
  g.visible = false
  e.root.add(g)
  return g
}

const fanOpacity = (m: WyrmMem, a: number): void => {
  if (!m.fan) return
  m.fan.visible = a > 0
  m.fanOn = a > 0
  for (const c of m.fan.children) ((c as Mesh).material as MeshBasicMaterial).opacity = a
}

const pick = (e: Enemy, m: WyrmMem, d: number): Attack => {
  let a: Attack = Math.random() < (d > 7 ? 0.7 : d < 4 ? 0.35 : 0.5) ? 'dive' : 'spit'
  if (a === m.attack && e.step >= 1) a = a === 'dive' ? 'spit' : 'dive'
  return a
}

const begin = (w: World, e: Enemy, m: WyrmMem, a: Attack): void => {
  // An eruption is the second half of a dive: it does not count as a new attack.
  if (a !== 'erupt') e.step = a === m.attack ? e.step + 1 : 0
  if (a !== 'erupt') m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  if (a === 'dive') {
    e.teleDur = DIVE_TELE
    e.teleRed = true
    w.sfx('charge1', e.x, e.z)
  } else if (a === 'erupt') {
    e.teleDur = ERUPT_TELE * (m.phase2 ? 0.9 : 1)
    e.teleRed = true
    m.ex = e.x
    m.ez = e.z
    w.markers.spawn(e.x, e.z, ERUPT_R, e.teleDur + 0.15)
    w.sfx('alert', e.x, e.z)
  } else {
    e.teleDur = SPIT_TELE
    e.teleRed = false
    m.volleys = 0
    m.fan ??= makeFan(e)
    w.sfx('charge2', e.x, e.z)
  }
}

/** Dust and cracking floor over it as it tunnels. */
const tunnel = (w: World, e: Enemy, m: WyrmMem, dt: number): void => {
  const y0 = fy(e)
  if (Math.random() < 0.85) {
    w.fx.emit({
      x: e.x + (Math.random() - 0.5) * 1.2, y: y0 + 0.1, z: e.z + (Math.random() - 0.5) * 1.2,
      vy: 1.6 + Math.random() * 1.8, color: Math.random() < 0.5 ? '#8a6a52' : '#c9b08a', size: 0.55, sizeEnd: 0.1, life: 0.6, gravity: 3
    })
  }
  m.crack -= dt
  if (m.crack <= 0) {
    m.crack = 0.16
    w.shocks.spawn(e.x, y0 + 0.05, e.z, 1.1, '#c9a46a', 0.5)
  }
}

/** Where the head's tip is in the world (for the spit's rocks). */
const mouth = (e: Enemy, m: WyrmMem): [number, number, number] => {
  const y = fy(e) + m.depth + HEAD_R + m.rear * REAR_H
  return [e.x + Math.sin(e.yaw) * 1.1, y, e.z + Math.cos(e.yaw) * 1.1]
}

const spit = (w: World, e: Enemy, m: WyrmMem): void => {
  const [x, y, z] = mouth(e, m)
  const d = Math.max(2, distToPlayer(w, e))
  const off = m.volleys % 2 ? SPIT_HALF / (SPIT_N - 1) : 0
  for (let k = 0; k < SPIT_N; k++) {
    const a = e.yaw - SPIT_HALF + (2 * SPIT_HALF * k) / (SPIT_N - 1) + off
    w.fireEnemyShot(e, x, y, z, Math.sin(a) * d, fy(e) + 1 - y, Math.cos(a) * d, SPIT_SPEED, Math.round(e.dmg * 0.6))
  }
  w.fx.sparks(x, y, z, '#c9b08a', 10, 5, 0.2)
  w.sfx('enemyShot', e.x, e.z)
  m.volleys++
}

/** A segment's middle in the world (its height over its floor). */
interface SegAt { x: number; y: number; z: number }
const _spine: SegAt[] = Array.from({ length: WYRM_SEGS }, () => ({ x: 0, y: 0, z: 0 }))

/**
 * Where each segment is, the head at (hx, hz): on the path behind the head,
 * lifted where the head rears, each held exactly its gap behind the one
 * ahead (a rear or a bend would otherwise stretch or squash the chain). The
 * pose draws them there; Flux's shots hit them there.
 */
const spine = (m: WyrmMem, hx: number, hz: number, out: SegAt[]): void => {
  const q = [0, 0, 0]
  const dying = m.pose.dying
  let prevX = hx
  let prevY = m.depth + HEAD_R + m.rear * REAR_H
  let prevZ = hz
  for (let i = 0; i < WYRM_SEGS; i++) {
    const s = WYRM_NECK + i * WYRM_GAP
    along(m, hx, m.depth, hz, s, q)
    const lift = m.rear * REAR_H * Math.max(0, 1 - s / REAR_LEN) ** 2
    let x = q[0]!
    let y = q[1]! + wyrmSegR(i) * 0.94 + lift - 0.3 * dying * Math.max(0, 1 - s / REAR_LEN)
    let z = q[2]!
    const dx = prevX - x
    const dy = prevY - y
    const dz = prevZ - z
    const l = Math.hypot(dx, dy, dz)
    if (l > 1e-4) {
      const gap = i === 0 ? WYRM_NECK : WYRM_GAP
      x = prevX - (dx / l) * gap
      y = prevY - (dy / l) * gap
      z = prevZ - (dz / l) * gap
    }
    const o = out[i]!
    o.x = x
    o.y = y
    o.z = z
    prevX = x
    prevY = y
    prevZ = z
  }
}

export const BURROW_WYRM_AI: MiniBossBehaviour<WyrmMem> = {
  init: (e) => {
    // It starts underground, its body laid out behind it in the rock.
    const path: number[] = []
    for (let k = 0; k < 60; k++) path.push(e.x ?? 0, -DIVE_DEPTH, (e.z ?? 0) - k * 0.15)
    return {
      pose: newWyrmPose(), attack: '', depth: -DIVE_DEPTH, rear: 0, pitch: 0, path, ex: e.x ?? 0, ez: e.z ?? 0, crack: 0, volleys: 0,
      phase2: false, side: 1, fan: null, fanOn: false, burst: false
    }
  },

  intro(w, e, m, room, dt) {
    // A track of dust loops out round its spot and back, and it bursts up there.
    if (e.st < 2.0) e.buried = true
    if (e.st < 1.4) {
      const a = e.st * 4.5
      const r = 2.8 * Math.sin((Math.PI * e.st) / 1.4)
      const [tx, tz] = inRoom(room, m.ex + Math.sin(a) * r, m.ez + Math.cos(a) * r, 1.2)
      if (Math.hypot(tx - e.x, tz - e.z) > 1e-4) e.yaw = Math.atan2(tx - e.x, tz - e.z)
      e.x = tx
      e.z = tz
      tunnel(w, e, m, dt)
    } else if (e.st < 2.0) {
      if (e.st - dt < 1.4) {
        w.markers.spawn(e.x, e.z, ERUPT_R, 0.7)
        w.sfx('alert', e.x, e.z)
      }
      tunnel(w, e, m, dt)
    } else {
      if (!m.burst) {
        m.burst = true
        e.buried = false
        w.shocks.spawn(e.x, fy(e) + 0.06, e.z, 3.2, WYRM_COLORS.hazard, 0.55)
        w.fx.sparks(e.x, fy(e) + 0.4, e.z, '#c9b08a', 26, 8, 0.3)
        w.shake(0.45)
        w.sfx('stomp', e.x, e.z)
      }
      m.depth = ease(m.depth, 0, 18, dt)
      m.rear = ease(m.rear, e.st < 2.45 ? 2.4 : 1, 7, dt)
      m.pitch = ease(m.pitch, e.st < 2.45 ? -1.3 : 0.1, 6, dt)
      faceTo(e, w.player.x, w.player.z, 3, dt)
      m.pose.heat = ease(m.pose.heat, 2, 6, dt)
    }
    record(e, m)
    m.pose.spin += dt * 14
    if (e.st >= INTRO_T) {
      e.buried = false
      m.depth = 0
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: WYRM_COLORS.seam, strength: 0.25 })
    }
    let rear = 1
    let pitch = 0.1
    let jaw = 0
    let heat = 1
    let spin = 12
    let depth = 0
    switch (e.state) {
      case 'engage': {
        // It slithers round him at mid range, weaving, its head leading.
        const ax = e.x - w.player.x
        const az = e.z - w.player.z
        const ba = Math.atan2(ax, az) + m.side * 0.7
        const want = d > 8 ? 4.5 : d < 4 ? 7 : 6
        const tx = w.player.x + Math.sin(ba) * want
        const tz = w.player.z + Math.cos(ba) * want
        const head = Math.atan2(tx - e.x, tz - e.z) + Math.sin(e.anim * 2.4) * 0.55
        e.yaw += Math.max(-3 * dt, Math.min(3 * dt, angDiff(head, e.yaw)))
        const sp = e.def.speed * (m.phase2 ? 1.2 : 1)
        if (moveBody(w, e, Math.sin(e.yaw) * sp * dt, Math.cos(e.yaw) * sp * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.2) m.side = -m.side
        rear = 0.9 + 0.1 * Math.sin(e.anim * 2.4)
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d))
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.6)
        heat = 1 + 1.4 * k
        if (e.attack === 'dive') {
          // Up and back… then down, drill first, into the floor.
          if (k < 0.45) {
            rear = 1 + 0.7 * (k / 0.45)
            pitch = -0.4
            spin = 30
          } else {
            const f = (k - 0.45) / 0.55
            rear = 1.7 * (1 - f)
            pitch = 1.3
            depth = -DIVE_DEPTH * f * f
            spin = 40
            moveBody(w, e, Math.sin(e.yaw) * 3.2 * dt, Math.cos(e.yaw) * 3.2 * dt)
            if (Math.random() < 0.6) w.fx.emit({ x: e.x + Math.sin(e.yaw) * 0.6, y: fy(e) + 0.1, z: e.z + Math.cos(e.yaw) * 0.6, vy: 3, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, color: '#8a6a52', size: 0.5, sizeEnd: 0.1, life: 0.6, gravity: 5 })
          }
          faceTo(e, w.player.x, w.player.z, 1.5, dt)
          if (e.st >= e.teleDur) {
            e.buried = true
            w.shocks.spawn(e.x, fy(e) + 0.05, e.z, 1.8, '#c9a46a', 0.4)
            w.sfx('stomp', e.x, e.z)
          }
        } else if (e.attack === 'erupt') {
          // Underground under the ring, the ground heaving over it.
          depth = -DIVE_DEPTH
          rear = 0
          pitch = -1.3
          spin = 50
          if (Math.random() < 0.9) {
            const a = Math.random() * TAU
            const r = Math.random() * ERUPT_R
            w.fx.emit({ x: m.ex + Math.sin(a) * r, y: fy(e) + 0.1, z: m.ez + Math.cos(a) * r, vy: 2 + 4 * k, color: Math.random() < 0.5 ? '#8a6a52' : '#c9b08a', size: 0.5, sizeEnd: 0.1, life: 0.5, gravity: 4 })
          }
          if (Math.random() < dt * 6) w.shake(0.08 + 0.12 * k)
        } else {
          // Reared up, head back, maw open, the fan on the floor.
          rear = 1 + 0.75 * Math.min(1, k * 2)
          pitch = -0.4 * Math.min(1, k * 2)
          jaw = Math.min(1, k * 1.8)
          spin = 12 * (1 - k)
          if (e.teleDur - e.st > SPIT_LOCK) faceTo(e, w.player.x, w.player.z, 2.6, dt)
          fanOpacity(m, 0.1 + 0.3 * k + (k > 0.8 ? 0.12 * Math.sin(e.st * 40) : 0))
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (e.attack === 'erupt') {
            e.buried = false
            w.shocks.spawn(m.ex, fy(e) + 0.06, m.ez, ERUPT_R + 0.5, WYRM_COLORS.hazard, 0.45)
            w.fx.sparks(m.ex, fy(e) + 0.5, m.ez, '#ffd35a', 28, 9, 0.3)
            w.shake(0.55)
            w.sfx('stomp', m.ex, m.ez)
            w.sfx('explode', m.ex, m.ez)
            if (near(w, m.ex, m.ez, ERUPT_R)) {
              w.hitPlayer(e, Math.round(e.dmg * 1.4), { blockable: false, fromX: m.ex, fromZ: m.ez, kind: 'aoe' })
            }
          } else if (e.attack === 'spit') spit(w, e, m)
        }
        break
      }
      case 'act': {
        if (e.attack === 'dive') {
          // Tunnelling at him, out of reach.
          depth = -DIVE_DEPTH
          rear = 0
          pitch = 0
          spin = 50
          heat = 1.4
          const T = TRAVEL_T * (m.phase2 ? 0.85 : 1)
          // Never still down there: close to him it circles under his feet,
          // and all of it is underground before it comes up.
          if (d > 2.6) faceTo(e, w.player.x, w.player.z, 4, dt)
          else {
            const nx = (e.x - w.player.x) / (d || 1)
            const nz = (e.z - w.player.z) / (d || 1)
            faceTo(e, e.x - nz * m.side - nx * 0.3, e.z + nx * m.side - nz * 0.3, 5, dt)
          }
          const sp = TRAVEL_SPEED * (m.phase2 ? 1.15 : 1)
          moveBody(w, e, Math.sin(e.yaw) * sp * dt, Math.cos(e.yaw) * sp * dt)
          keepInRoom(e, room)
          tunnel(w, e, m, dt)
          if (e.st >= T) begin(w, e, m, 'erupt')
        } else if (e.attack === 'erupt') {
          // Up out of the hole, head to the sky, then settling.
          e.x = m.ex
          e.z = m.ez
          const k = e.st / ERUPT_T
          rear = k < 0.55 ? 2.4 : 2.4 - 1.6 * (k - 0.55) / 0.45
          pitch = k < 0.55 ? -1.3 : -1.3 + 1.5 * (k - 0.55) / 0.45
          heat = 2.2
          spin = 40
          if (e.st >= ERUPT_T) { e.state = 'recover'; e.st = 0 }
        } else {
          rear = 1.75
          pitch = -0.1
          jaw = 0.6
          heat = 2
          spin = 0
          fanOpacity(m, Math.max(0, 0.35 - e.st))
          if (m.phase2 && m.volleys < 2 && e.st >= 0.35) spit(w, e, m)
          if (e.st >= (m.phase2 ? 0.85 : 0.5)) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        // Dazed after an eruption (its head drops), spent after a spit.
        const dazed = m.attack === 'dive'
        rear = dazed ? 0.35 : 0.8
        pitch = dazed ? 0.55 : 0.2
        heat = 0.7
        spin = 4
        faceTo(e, w.player.x, w.player.z, 1.2, dt)
        if (e.st > (dazed ? 1.1 : 0.7) * (m.phase2 ? 0.8 : 1)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (!(e.state === 'tele' && e.attack === 'spit') && !(e.state === 'act' && e.attack === 'spit')) fanOpacity(m, 0)
    keepInRoom(e, room)
    // Diving and surfacing are quick; the rest eases.
    m.depth = ease(m.depth, depth, depth < m.depth ? 30 : 16, dt)
    m.rear = ease(m.rear, rear, 9, dt)
    m.pitch = ease(m.pitch, pitch, 9, dt)
    p.jaw = ease(p.jaw, jaw, 12, dt)
    p.heat = ease(p.heat, heat, 8, dt)
    p.spin += spin * dt
    record(e, m)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    fanOpacity(m, 0)
    e.buried = false
    p.dying = Math.min(1, e.deathT / 1.1)
    // It thrashes and collapses along the floor, the seams blowing out.
    m.depth = ease(m.depth, 0, 10, dt)
    m.rear = ease(m.rear, 0, 4, dt)
    m.pitch = ease(m.pitch, 0.3 + Math.sin(e.deathT * 14) * 0.4, 10, dt)
    p.heat = ease(p.heat, 0.5 + Math.random() * 2, 12, dt)
    p.spin += dt * 20 * (1 - p.dying)
    if (Math.random() < dt * 16) {
      const s = Math.floor(Math.random() * WYRM_SEGS)
      const q = [0, 0, 0]
      along(m, e.x, m.depth, e.z, WYRM_NECK + s * WYRM_GAP, q)
      w.fx.orbBurst(q[0]!, fy(e) + Math.max(0.2, q[1]! + wyrmSegR(s)), q[2]!, WYRM_COLORS.seam, 0.6)
      w.shake(0.08)
    }
    record(e, m)
  },

  pose(e, m, time) {
    const p = m.pose
    p.time = time
    const rx = e.root.position.x
    const rz = e.root.position.z
    const cy = Math.cos(e.yaw)
    const sy = Math.sin(e.yaw)
    const h = p.head
    h.x = 0
    h.z = 0
    h.y = m.depth + HEAD_R + m.rear * REAR_H
    h.ry = 0
    h.rx = m.pitch
    // Its segments where the path puts them (world → its own frame), each
    // turned toward the one ahead of it.
    spine(m, rx, rz, _spine)
    let prevX = 0
    let prevY = h.y
    let prevZ = 0
    for (let i = 0; i < WYRM_SEGS; i++) {
      const q = _spine[i]!
      const sg = p.segs[i]!
      const dx0 = q.x - rx
      const dz0 = q.z - rz
      sg.x = dx0 * cy - dz0 * sy
      sg.z = dx0 * sy + dz0 * cy
      sg.y = q.y
      const dx = prevX - sg.x
      const dy = prevY - sg.y
      const dz = prevZ - sg.z
      sg.ry = Math.atan2(dx, dz)
      sg.rx = -Math.atan2(dy, Math.hypot(dx, dz))
      prevX = sg.x
      prevY = sg.y
      prevZ = sg.z
    }
    poseBurrowWyrm(e.rig, p)
  },

  clear(_w, e, m) {
    fanOpacity(m, 0)
    // A stun or its death never leaves it unreachable underground.
    if (e.state === 'dead') e.buried = false
  },

  // Its armoured segments catch Flux's shots (TINK, no harm): only the head
  // can be hurt. A shot nearer the head than the segment goes on to it.
  shot(w, e, m, s) {
    if (e.state === 'dead') return
    const y0 = fy(e)
    const hy = y0 + m.depth + HEAD_R + m.rear * REAR_H
    const toHead = Math.hypot(s.x - e.x, s.y - hy, s.z - e.z)
    spine(m, e.x, e.z, _spine)
    for (let i = 0; i < WYRM_SEGS; i++) {
      const q = _spine[i]!
      if (q.y + wyrmSegR(i) < 0) continue
      const d = Math.hypot(s.x - q.x, s.y - y0 - q.y, s.z - q.z)
      if (d > wyrmSegR(i) + SEG_ARMOUR + s.radius || toHead < d) continue
      w.fx.sparks(s.x, s.y, s.z, '#dfe7ff', 8, 4, 0.15)
      pushHud({ t: 'text', x: s.x, y: s.y + 0.3, z: s.z, key: 'combat.tink', color: '#dfe7ff' })
      w.sfx('tink', s.x, s.z)
      return 'catch'
    }
  }
}

export const BURROW_WYRM: MiniBossSpec<WyrmMem> = {
  id: 'burrowWyrm',
  sector: 'drill',
  nameKey: 'miniboss.burrowWyrm',
  def: {
    kind: 'miniboss', hp: 525, dmg: 17, speed: 3.6, radius: 1.0, hitR: 1.25, aimY: 1.3, fly: 0,
    aggro: 30, range: [4.5, 7], xp: 175, bolts: [28, 42], cooldown: 1.5, tele: SPIT_TELE, unblockable: false, armor: 1,
    // Its head: the glowing maw and the eyes over the drill (seen from anywhere).
    weak: { part: 'head', up: HEAD_R + REAR_H, fwd: 0.45, side: 0, r: 0.42 },
    color: WYRM_COLORS.seam
  },
  build: () => buildBurrowWyrm(),
  behaviour: BURROW_WYRM_AI
}
