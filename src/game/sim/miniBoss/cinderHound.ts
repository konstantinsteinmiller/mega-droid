import { AdditiveBlending, CircleGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import { buildCinderHound, poseCinderHound, newHoundPose, HOUND_COLORS, type HoundPose } from '../../models/miniBoss/cinderHound'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, teleRing, inCone, near, ease } from './kit'
import { PLAYER_R } from '../constants'
import { pushHud } from '../../state/hud'

/**
 * ─── The Cinder Hound (Blaze) — the reference mini-boss ──────────────────────
 *
 * A furnace hound that fights like an animal, not like the Blaze Master's
 * fire-slinging android: it circles, crouches and lunges, breathes fire and,
 * once hurt, howls the sky down. Three attacks, each telegraphed for a
 * beat with a big pose, the glow flaring and the ring over it, and its area
 * drawn on the floor before anything lands:
 *
 *  - LUNGE (red: dodge it). It crouches low, hind legs coiled, a lane of
 *    red markers on the floor ahead of it (LUNGE_TELE); then it dashes the
 *    lane at LUNGE_SPEED and leaves a burning trail where it ran (TRAIL_LIFE)
 *    that hurts to stand in. A wall stops it short (a thud, a short daze).
 *  - FLAME BREATH (orange: block it, parry at the white flash). It throws
 *    its head back and draws in (BREATH_TELE) while a cone fills in on the
 *    floor in front of it; its aim follows Flux for most of the wind-up,
 *    then locks; then the cone burns for BREATH_T.
 *  - HOWL (from half health; red). Head to the sky, jaw open (HOWL_TELE);
 *    then EMBERS red rings drop onto the floor — one on Flux, the rest
 *    round him — and the embers fall into them EMBER_FALL later.
 *
 * Its entrance: it bursts up through the floor in a fountain of sparks and
 * howls (`INTRO_T`; hits TINK off it meanwhile).
 */

const INTRO_RISE = 0.9
export const INTRO_T = 2.5
/** The lunge: wind-up (s), dash speed (m/s), longest dash (s), the trail. */
export const LUNGE_TELE = 1.05
export const LUNGE_SPEED = 14
const LUNGE_MAX_T = 0.85
export const TRAIL_LIFE = 3
const TRAIL_STEP = 0.4
const TRAIL_R = 0.7
const TRAIL_HIT_CD = 0.7
/** The breath: wind-up (s; the aim locks for its last BREATH_LOCK), length
 *  (s), the cone (m, rad) and the time between its burns (s). */
export const BREATH_TELE = 1.15
const BREATH_LOCK = 0.35
export const BREATH_T = 1.2
export const BREATH_RANGE = 6.5
export const BREATH_HALF = 0.5
const BREATH_TICK = 0.3
/** The howl: wind-up (s), the embers, their fall (s) and reach (m). */
export const HOWL_TELE = 0.7
const HOWL_T = 1.7
export const EMBERS = 5
export const EMBER_FALL = 1.35
export const EMBER_R = 1.3
const EMBER_H = 7

type Attack = 'lunge' | 'breath' | 'howl'

export interface HoundMem {
  pose: HoundPose
  attack: Attack | ''
  /** The attack's aim (unit) and the dash's length (m). */
  ax: number
  az: number
  len: number
  /** The breath's burns so far; the last trail point; the trail's own hit cooldown. */
  ticks: number
  lastX: number
  lastZ: number
  trailCd: number
  trail: Array<{ x: number; z: number; t: number }>
  embers: Array<{ x: number; z: number; t: number }>
  /** Attacks since the last howl (phase 2 howls every few). */
  sinceHowl: number
  /** Half health crossed: the howl joins the pool, the first one at once. */
  phase2: boolean
  /** The floor cone of the breath (a child of its root, built on first use). */
  cone: Mesh | null
  /** The intro's sparks are out. */
  burst: boolean
  /** Where it strafes (±1), flipped now and then. */
  side: number
}

/** The floor height under it (the climb's rooms stand at a height). */
const fy = (e: Enemy): number => e.floor ?? 0

const CONE_COLOR = new Color('#ff8a2a')

const makeCone = (e: Enemy): Mesh => {
  const g = new CircleGeometry(BREATH_RANGE, 24, -Math.PI / 2 - BREATH_HALF, BREATH_HALF * 2)
  g.rotateX(-Math.PI / 2)
  const m = new Mesh(g, new MeshBasicMaterial({
    color: CONE_COLOR.clone(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  }))
  m.position.y = 0.05
  m.renderOrder = 1
  m.visible = false
  e.root.add(m)
  return m
}

const pick = (e: Enemy, m: HoundMem, d: number): Attack => {
  if (m.phase2 && m.sinceHowl >= 3) return 'howl'
  // Far: it closes the gap with a lunge; near: it breathes fire.
  const wantLunge = d > 7 ? 0.75 : d < 4.5 ? 0.25 : 0.5
  let a: Attack = Math.random() < wantLunge ? 'lunge' : 'breath'
  // Never the same attack three times running.
  if (a === m.attack && e.step >= 1) a = a === 'lunge' ? 'breath' : 'lunge'
  return a
}

const begin = (w: World, e: Enemy, m: HoundMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  m.ticks = 0
  const red = a !== 'breath'
  e.teleRed = red
  const tempo = m.phase2 ? 0.85 : 1
  if (a === 'lunge') {
    e.teleDur = LUNGE_TELE * tempo
    // Aim now: the lane is drawn and does not follow him.
    const dx = w.player.x - e.x
    const dz = w.player.z - e.z
    const d = Math.hypot(dx, dz) || 1
    m.ax = dx / d
    m.az = dz / d
    m.len = Math.min(LUNGE_SPEED * LUNGE_MAX_T, Math.max(5, d + 3))
    // The lane: red markers along it, inside the room, for the wind-up and the dash.
    for (let s = 1.2; s <= m.len; s += 1.6) {
      const [x, z] = inRoom(room, e.x + m.ax * s, e.z + m.az * s, 0.6)
      w.markers.spawn(x, z, 0.95, e.teleDur + 0.25)
    }
    w.sfx('alert', e.x, e.z)
  } else if (a === 'breath') {
    e.teleDur = BREATH_TELE * tempo
    m.cone ??= makeCone(e)
    w.sfx('trapHiss', e.x, e.z)
  } else {
    e.teleDur = HOWL_TELE
    m.sinceHowl = 0
  }
}

/** Embers rain round Flux: one on him, the rest within a few metres. */
const rainEmbers = (w: World, m: HoundMem, room: Room): void => {
  for (let k = 0; k < EMBERS; k++) {
    const a = (k / EMBERS) * Math.PI * 2 + Math.random() * 0.8
    const r = k === 0 ? 0 : 2.2 + Math.random() * 2
    const [x, z] = inRoom(room, w.player.x + Math.sin(a) * r, w.player.z + Math.cos(a) * r, 0.8)
    m.embers.push({ x, z, t: 0 })
    w.markers.spawn(x, z, EMBER_R, EMBER_FALL)
  }
}

/** The fx and hurts that outlive an attack: the burning trail, falling embers. */
const tickHazards = (w: World, e: Enemy, m: HoundMem, dt: number): void => {
  const y0 = fy(e)
  m.trailCd = Math.max(0, m.trailCd - dt)
  for (let k = m.trail.length - 1; k >= 0; k--) {
    const p = m.trail[k]!
    p.t += dt
    if (p.t >= TRAIL_LIFE) { m.trail.splice(k, 1); continue }
    const life = 1 - p.t / TRAIL_LIFE
    if (Math.random() < 0.16 + 0.2 * life) {
      w.fx.emit({
        x: p.x + (Math.random() - 0.5) * 0.7, y: y0 + 0.1, z: p.z + (Math.random() - 0.5) * 0.7,
        vy: 1.6 + Math.random() * 1.6, color: Math.random() < 0.5 ? '#ff7a2a' : '#ffcf4a', size: 0.5 * (0.5 + life), sizeEnd: 0.05, life: 0.45
      })
    }
    if (m.trailCd <= 0 && e.state !== 'dead' && near(w, p.x, p.z, TRAIL_R)) {
      m.trailCd = TRAIL_HIT_CD
      w.hitPlayer(e, Math.round(e.dmg * 0.35), { blockable: false, fromX: p.x, fromZ: p.z, kind: 'aoe', hazard: 'fire' })
    }
  }
  for (let k = m.embers.length - 1; k >= 0; k--) {
    const b = m.embers[k]!
    b.t += dt
    const f = b.t / EMBER_FALL
    if (f < 1) {
      // The ember itself, falling into its ring.
      w.fx.emit({ x: b.x, y: y0 + 0.3 + EMBER_H * (1 - f) * (1 - f), z: b.z, color: '#ffb03a', size: 0.55, sizeEnd: 0.2, life: 0.08 })
      continue
    }
    m.embers.splice(k, 1)
    w.shocks.spawn(b.x, y0 + 0.06, b.z, EMBER_R, '#ff7a2a', 0.4)
    w.fx.sparks(b.x, y0 + 0.3, b.z, '#ffb03a', 14, 6, 0.2)
    w.sfx('explode', b.x, b.z)
    if (e.state !== 'dead' && near(w, b.x, b.z, EMBER_R)) {
      w.hitPlayer(e, Math.round(e.dmg * 0.8), { blockable: false, fromX: b.x, fromZ: b.z, kind: 'aoe', hazard: 'fire' })
    }
  }
}

/** Run on the spot or across the floor: the gait follows what it covered. */
const stride = (e: Enemy, m: HoundMem, dt: number): void => {
  const moved = Math.hypot(e.x - e.px, e.z - e.pz)
  const sp = dt > 0 ? moved / dt : 0
  m.pose.run = ease(m.pose.run, Math.min(1, sp / 5), 10, dt)
  m.pose.phase += moved * 2.4
}

export const CINDER_HOUND_AI: MiniBossBehaviour<HoundMem> = {
  init: () => ({
    pose: newHoundPose(), attack: '', ax: 0, az: 1, len: 0, ticks: 0, lastX: 0, lastZ: 0, trailCd: 0,
    trail: [], embers: [], sinceHowl: 0, phase2: false, cone: null, burst: false, side: 1
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    const y0 = fy(e)
    // Up through the floor in a fountain of sparks…
    const k = Math.min(1, e.st / INTRO_RISE)
    e.y = -1.9 * (1 - k) * (1 - k)
    if (!m.burst) {
      m.burst = true
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3.2, '#ff7a2a', 0.6)
      w.sfx('stomp', e.x, e.z)
    }
    if (k < 1 && Math.random() < 0.7) {
      w.fx.emit({ x: e.x + (Math.random() - 0.5) * 2, y: y0 + 0.1, z: e.z + (Math.random() - 0.5) * 2, vy: 5 + Math.random() * 4, color: '#ffb03a', size: 0.4, sizeEnd: 0.05, life: 0.7, gravity: 6 })
    }
    faceTo(e, w.player.x, w.player.z, 4, dt)
    // …then the howl, head to the sky.
    const howl = e.st > INTRO_RISE + 0.2 && e.st < INTRO_T - 0.25 ? 1 : 0
    if (howl && p.howl < 0.05) w.sfx('howl', e.x, e.z)
    p.howl = ease(p.howl, howl, 8, dt)
    p.heat = ease(p.heat, 1 + howl * 1.2, 6, dt)
    if (e.st >= INTRO_T) {
      e.y = 0
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    tickHazards(w, e, m, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      m.sinceHowl = 99
      pushHud({ t: 'flash', color: '#ff7a2a', strength: 0.25 })
    }
    let crouch = 0
    let lunge = 0
    let inhale = 0
    let breath = 0
    let howl = 0
    let heat = 1
    switch (e.state) {
      case 'engage': {
        // Circle him at mid range, closing in when he backs off.
        faceTo(e, w.player.x, w.player.z, 5, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side * 0.8
        let mz = nx * m.side * 0.8
        if (d > 8) { mx -= nx; mz -= nz } else if (d < 4) { mx += nx * 0.8; mz += nz * 0.8 }
        const ml = Math.hypot(mx, mz) || 1
        const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
        if (moveBody(w, e, (mx / ml) * sp * dt, (mz / ml) * sp * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.25) m.side = -m.side
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.6)
        heat = 1 + 1.4 * k
        if (m.attack === 'lunge') {
          crouch = Math.min(1, k * 2.2)
          // It turns along its lane, never after him: the lane is the truth.
          faceTo(e, e.x + m.ax, e.z + m.az, 8, dt)
        } else if (m.attack === 'breath') {
          inhale = Math.min(1, k * 1.6)
          // Aim follows him until the lock, then holds.
          if (e.teleDur - e.st > BREATH_LOCK) faceTo(e, w.player.x, w.player.z, 2.4, dt)
          const c = m.cone!
          c.visible = true
          ;(c.material as MeshBasicMaterial).opacity = 0.12 + 0.3 * k + (k > 0.8 ? 0.12 * Math.sin(e.st * 40) : 0)
        } else {
          howl = Math.min(1, k * 1.5)
          faceTo(e, w.player.x, w.player.z, 3, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          m.lastX = e.x
          m.lastZ = e.z
          if (m.attack === 'lunge') w.sfx('dash', e.x, e.z)
          else if (m.attack === 'breath') w.sfx('flameJet', e.x, e.z)
          else {
            w.sfx('howl', e.x, e.z)
            rainEmbers(w, m, room)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'lunge') {
          lunge = 1
          heat = 2
          const frac = moveBody(w, e, m.ax * LUNGE_SPEED * dt, m.az * LUNGE_SPEED * dt)
          keepInRoom(e, room)
          // The trail: a burning patch every TRAIL_STEP m of its path.
          while (Math.hypot(e.x - m.lastX, e.z - m.lastZ) >= TRAIL_STEP) {
            const l = Math.hypot(e.x - m.lastX, e.z - m.lastZ)
            m.lastX += ((e.x - m.lastX) / l) * TRAIL_STEP
            m.lastZ += ((e.z - m.lastZ) / l) * TRAIL_STEP
            m.trail.push({ x: m.lastX, z: m.lastZ, t: 0 })
          }
          if (!e.hitPlayer && distToPlayer(w, e) < e.def.radius + PLAYER_R + 0.25) {
            e.hitPlayer = true
            // A perfect block stops the lunge cold: the parry stuns it (#172).
            if (w.hitPlayer(e, Math.round(e.dmg * 1.3), { blockable: false, parryable: true, fromX: e.x, fromZ: e.z, kind: 'melee' }) === 'parry') break
          }
          const done = e.st * LUNGE_SPEED >= m.len
          // A wall stops it short: a thud and a short daze (its opening).
          if (frac < 0.35 && e.st > 0.08) {
            w.fx.sparks(e.x + m.ax, fy(e) + 0.8, e.z + m.az, '#ffe07a', 18, 7)
            w.shake(0.3)
            w.sfx('bonk', e.x, e.z)
            e.state = 'stun'
            e.st = 0
            e.stunT = 1.3
            pushHud({ t: 'text', x: e.x, y: fy(e) + 2.4, z: e.z, key: 'combat.dizzy', color: '#ffe07a' })
            break
          }
          if (done) { e.state = 'recover'; e.st = 0 }
        } else if (m.attack === 'breath') {
          breath = 1
          heat = 2.3
          const c = m.cone!
          ;(c.material as MeshBasicMaterial).opacity = 0.35 + 0.1 * Math.sin(e.st * 30)
          // The flames: a jet of particles along the cone.
          const y0 = fy(e)
          for (let n = 0; n < 3; n++) {
            const a = e.yaw + (Math.random() - 0.5) * BREATH_HALF * 1.6
            const sp = 9 + Math.random() * 5
            w.fx.emit({
              x: e.x + Math.sin(e.yaw) * 1.4, y: y0 + 1.05, z: e.z + Math.cos(e.yaw) * 1.4,
              vx: Math.sin(a) * sp, vy: -0.6 + Math.random() * 0.8, vz: Math.cos(a) * sp,
              color: Math.random() < 0.4 ? '#ffe07a' : '#ff6a1a', size: 0.45, sizeEnd: 1, life: BREATH_RANGE / sp, drag: 0.6
            })
          }
          const tick = Math.floor(e.st / BREATH_TICK)
          if (tick >= m.ticks) {
            m.ticks = tick + 1
            if (inCone(w, e.x, e.z, e.yaw, BREATH_RANGE, BREATH_HALF)) {
              w.hitPlayer(e, Math.round(e.dmg * 0.45), { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee', hazard: 'fire' })
            }
          }
          if (e.st >= BREATH_T) {
            c.visible = false
            e.state = 'recover'
            e.st = 0
          }
        } else {
          howl = e.st < HOWL_T - 0.3 ? 1 : 0
          heat = 1.8
          if (e.st >= HOWL_T) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        // A pant: its opening to punish.
        faceTo(e, w.player.x, w.player.z, 3, dt)
        if (e.st > (m.phase2 ? 0.6 : 0.85)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.7 : 1) * (0.8 + Math.random() * 0.4)
          m.sinceHowl++
        }
        break
      }
    }
    if (e.state !== 'tele' && !(e.state === 'act' && m.attack === 'breath') && m.cone) m.cone.visible = false
    keepInRoom(e, room)
    stride(e, m, dt)
    p.crouch = ease(p.crouch, crouch, 12, dt)
    p.lunge = ease(p.lunge, lunge, 14, dt)
    p.inhale = ease(p.inhale, inhale, 10, dt)
    p.breath = ease(p.breath, breath, 12, dt)
    p.howl = ease(p.howl, howl, 8, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    tickHazards(w, e, m, dt)
    if (m.cone) m.cone.visible = false
    p.dying = Math.min(1, e.deathT / 1.1)
    p.crouch = ease(p.crouch, 0, 8, dt)
    p.lunge = ease(p.lunge, 0, 8, dt)
    p.breath = ease(p.breath, 0, 8, dt)
    p.howl = ease(p.howl, 0, 8, dt)
    p.heat = ease(p.heat, 2.4, 6, dt)
    // Its furnace bursts: vents blowing out one after another.
    if (Math.random() < dt * 16) {
      const a = Math.random() * Math.PI * 2
      w.fx.orbBurst(e.x + Math.sin(a) * 0.6, fy(e) + 0.6 + Math.random() * 0.9, e.z + Math.cos(a) * 0.6, HOUND_COLORS.molten, 0.7)
      w.shake(0.1)
    }
  },

  pose(e, m, time) {
    m.pose.time = time
    poseCinderHound(e.rig, m.pose)
  },

  clear(_w, _e, m) {
    if (m.cone) m.cone.visible = false
  }
}

export const CINDER_HOUND: MiniBossSpec<HoundMem> = {
  id: 'cinderHound',
  sector: 'blaze',
  nameKey: 'miniboss.cinderHound',
  def: {
    kind: 'miniboss', hp: 420, dmg: 15, speed: 3.4, radius: 1.1, hitR: 1.3, aimY: 1.1, fly: 0,
    aggro: 30, range: [4, 8], xp: 150, bolts: [24, 36], cooldown: 1.5, tele: LUNGE_TELE, unblockable: true, armor: 1,
    // Its molten core, glowing through the grille on its back.
    weak: { part: 'core', up: 1.63, fwd: -0.11, side: 0, r: 0.38 },
    color: HOUND_COLORS.molten
  },
  build: () => buildCinderHound(),
  behaviour: CINDER_HOUND_AI
}
