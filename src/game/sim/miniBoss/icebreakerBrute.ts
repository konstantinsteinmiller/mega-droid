import { Group, type Object3D } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import { buildIcebreakerBrute, poseIcebreakerBrute, newBrutePose, ICEBREAKER_COLORS, ICEBREAKER_SCALE, type BrutePose } from '../../models/miniBoss/icebreakerBrute'
import { rcone, rock, paint, staticProp } from '../../models/kit'
import { toonVC, glowVC } from '../../models/toon'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, teleRing, near, ease, angDiff, floorLayer } from './kit'
import { pushHud } from '../../state/hud'

/**
 * ─── The Icebreaker Brute (Cryo) ─────────────────────────────────────────────
 *
 * The Guardroid grown huge and iced over: a slow, heavy wall of a machine,
 * nothing like the Frost Master's quick android. It lumbers at Flux and
 * fights with the floor and its armour. Three moves, each with a big
 * wind-up, the frost glow flaring and the ring over it, the area drawn on
 * the floor before anything lands:
 *
 *  - ICE SPIKES (red: dodge sideways). Both fists high over its head, leaning
 *    back (SLAM_TELE), while a lane of red rings runs along the floor from it
 *    toward Flux; then it slams the floor and a line of ice spikes bursts up
 *    along the lane, front to back at SPIKE_SPEED. From half health: three
 *    lanes in a fan.
 *  - ICE BOULDER (red). It tears a boulder out of the floor and lifts it over
 *    its head (BOULDER_TELE); halfway through, the landing ring goes down
 *    where Flux stands; then it hurls it in a high arc (BOULDER_FLY) into the
 *    ring.
 *  - ICE SHIELD (no damage: a stance). It plants its feet and raises a slab
 *    of ice in front of its chest (SHIELD_TELE), then holds it for SHIELD_T,
 *    pushing slowly at Flux and turning after him slowly enough to be
 *    out-walked: every shot from the front TINKs off (`guarded`). Its frost
 *    core — the weak spot — is on its back: walk round it. A full charge
 *    breaks the shield like any guard (and stuns it).
 *
 * Its entrance: it drops from the ceiling in a burst of frost, then beats
 * its fists overhead (`INTRO_T`; hits TINK off it meanwhile).
 */

export const INTRO_T = 2.6
const INTRO_DROP = 0.55
const INTRO_H = 7
/** The slam: wind-up (s), the lane (m), its spikes' run (m/s), their life (s). */
export const SLAM_TELE = 1.1
export const SPIKE_RANGE = 11
export const SPIKE_HALF = 0.85
export const SPIKE_SPEED = 12
const SPIKE_STEP = 0.9
const SPIKE_LIFE = 1.1
/** The fan of lanes from half health (rad apart). */
const FAN = 0.38
/** The boulder: wind-up (s; the ring goes down at BOULDER_MARK of it),
 *  flight (s), the blast (m) and its arc's top over the floor (m). */
export const BOULDER_TELE = 1.05
const BOULDER_MARK = 0.45
export const BOULDER_FLY = 1.05
export const BOULDER_R = 1.6
const BOULDER_ARC = 6
/** The shield: raising it (s), holding it (s), the arc it covers either side
 *  of its facing (rad), its turn (rad/s) and push (m/s) while it holds. */
export const SHIELD_TELE = 0.7
export const SHIELD_T = 5
export const SHIELD_ARC = 1.3
const SHIELD_TURN = 1.0
const SHIELD_WALK = 0.9

type Attack = 'slam' | 'boulder' | 'shield'

interface Spike { x: number; z: number; t: number; obj: Object3D }
interface Lane { ax: number; az: number; len: number; hit: boolean; next: number }

export interface BruteMem {
  pose: BrutePose
  attack: Attack | ''
  lanes: Lane[]
  /** The spikes' front, run along every lane (m). */
  front: number
  spikes: Spike[]
  pool: Object3D[]
  /** The boulder: its target, its flight time so far (−1: none in the air). */
  bx: number
  bz: number
  bt: number
  marked: boolean
  rock: Object3D | null
  /** The shield is up: shots from the front TINK. */
  shieldUp: boolean
  sinceShield: number
  phase2: boolean
  landed: boolean
  layer: Group | null
}

const fy = (e: Enemy): number => e.floor ?? 0

/** An ice spike: a tall jagged cone, a glowing tip. */
const makeSpike = (): Object3D => {
  const body = paint(rcone(0.34, 0.05, 1.5, 0.04, 7), ICEBREAKER_COLORS.ice)
  body.translate(0, 0.75, 0)
  const tip = paint(rcone(0.12, 0.02, 0.5, 0.01, 7), ICEBREAKER_COLORS.frost)
  tip.translate(0, 1.42, 0)
  return staticProp([body], [tip], toonVC(), glowVC(), 0.02)
}

const makeRock = (): Object3D => staticProp([paint(rock(0.5 * ICEBREAKER_SCALE, 7), ICEBREAKER_COLORS.ice)], [], toonVC(), glowVC(), 0.02)

const pick = (e: Enemy, m: BruteMem, d: number): Attack => {
  if (m.sinceShield >= (m.phase2 ? 2 : 3)) return 'shield'
  let a: Attack = Math.random() < (d > 6.5 ? 0.35 : 0.65) ? 'slam' : 'boulder'
  if (a === m.attack && e.step >= 1) a = a === 'slam' ? 'boulder' : 'slam'
  return a
}

const begin = (w: World, e: Enemy, m: BruteMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  e.teleRed = a !== 'shield'
  const tempo = m.phase2 ? 0.9 : 1
  if (a === 'slam') {
    e.teleDur = SLAM_TELE * tempo
    // Aim now: the lanes are drawn and do not follow him.
    const yaw = Math.atan2(w.player.x - e.x, w.player.z - e.z)
    m.lanes.length = 0
    const fan = m.phase2 ? [-FAN, 0, FAN] : [0]
    for (const da of fan) {
      const ax = Math.sin(yaw + da)
      const az = Math.cos(yaw + da)
      // The lane runs to the wall at most.
      let len = 1.2
      while (len < SPIKE_RANGE) {
        const [x, z] = inRoom(room, e.x + ax * (len + SPIKE_STEP), e.z + az * (len + SPIKE_STEP), 0.4)
        if (Math.hypot(x - e.x - ax * (len + SPIKE_STEP), z - e.z - az * (len + SPIKE_STEP)) > 0.05) break
        len += SPIKE_STEP
      }
      m.lanes.push({ ax, az, len, hit: false, next: 1.2 })
      const life = e.teleDur + len / SPIKE_SPEED + 0.15
      for (let s = 1.4; s <= len; s += 1.3) w.markers.spawn(e.x + ax * s, e.z + az * s, SPIKE_HALF, life)
    }
    w.sfx('alert', e.x, e.z)
  } else if (a === 'boulder') {
    e.teleDur = BOULDER_TELE * tempo
    m.marked = false
    w.sfx('stomp', e.x, e.z)
    w.fx.sparks(e.x, fy(e) + 0.3, e.z, ICEBREAKER_COLORS.ice, 16, 5, 0.2)
  } else {
    e.teleDur = SHIELD_TELE
    m.sinceShield = 0
    w.sfx('trapHiss', e.x, e.z)
  }
}

/** The spikes up and the boulder in flight: they outlive the attack. */
const tickHazards = (w: World, e: Enemy, m: BruteMem, dt: number): void => {
  const y0 = fy(e)
  for (let k = m.spikes.length - 1; k >= 0; k--) {
    const s = m.spikes[k]!
    s.t += dt
    if (s.t >= SPIKE_LIFE) {
      s.obj.visible = false
      m.pool.push(s.obj)
      m.spikes.splice(k, 1)
      continue
    }
    // Up in a snap, down at the end.
    const up = Math.min(1, s.t / 0.1) * Math.min(1, (SPIKE_LIFE - s.t) / 0.25)
    s.obj.scale.set(1, Math.max(0.01, up), 1)
  }
  if (m.bt < 0) return
  m.bt += dt
  const f = Math.min(1, m.bt / BOULDER_FLY)
  const r = m.rock
  if (r) r.visible = f < 1
  if (f < 1) {
    if (r) {
      const sx = r.userData.sx as number
      const sz = r.userData.sz as number
      r.position.set(sx + (m.bx - sx) * f, y0 + 3.6 * (1 - f) + 0.5 + BOULDER_ARC * 4 * f * (1 - f), sz + (m.bz - sz) * f)
      r.rotation.set(f * 5, f * 3, 0)
    }
    if (Math.random() < 0.5) w.fx.emit({ x: m.bx + (Math.random() - 0.5), y: y0 + 0.2, z: m.bz + (Math.random() - 0.5), vy: 1, color: ICEBREAKER_COLORS.frost, size: 0.25, sizeEnd: 0.05, life: 0.4 })
    return
  }
  m.bt = -1
  w.shocks.spawn(m.bx, y0 + 0.06, m.bz, BOULDER_R, ICEBREAKER_COLORS.frost, 0.45)
  w.fx.sparks(m.bx, y0 + 0.4, m.bz, ICEBREAKER_COLORS.ice, 26, 8, 0.25)
  w.fx.orbBurst(m.bx, y0 + 0.5, m.bz, ICEBREAKER_COLORS.frost, 1)
  w.shake(0.3)
  w.sfx('explode', m.bx, m.bz)
  if (e.state !== 'dead' && near(w, m.bx, m.bz, BOULDER_R)) {
    w.hitPlayer(e, e.dmg, { blockable: false, fromX: m.bx, fromZ: m.bz, kind: 'aoe' })
  }
}

/** A spike bursts up at (x, z). */
const spike = (w: World, e: Enemy, m: BruteMem, x: number, z: number): void => {
  m.layer = floorLayer(e, m.layer)
  const obj = m.pool.pop() ?? makeSpike()
  if (!obj.parent) m.layer.add(obj)
  obj.visible = true
  obj.position.set(x, fy(e), z)
  obj.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3)
  obj.scale.set(1, 0.01, 1)
  m.spikes.push({ x, z, t: 0, obj })
  if (Math.random() < 0.6) w.fx.sparks(x, fy(e) + 0.3, z, ICEBREAKER_COLORS.ice, 6, 4, 0.16)
}

const stride = (e: Enemy, m: BruteMem, dt: number): void => {
  const moved = Math.hypot(e.x - e.px, e.z - e.pz)
  const sp = dt > 0 ? moved / dt : 0
  m.pose.walk = ease(m.pose.walk, Math.min(1, sp / 1.8), 8, dt)
  m.pose.phase += moved * 2.2
}

const dropShield = (m: BruteMem): void => {
  m.shieldUp = false
}

export const ICEBREAKER_AI: MiniBossBehaviour<BruteMem> = {
  init: () => ({
    pose: newBrutePose(), attack: '', lanes: [], front: 0, spikes: [], pool: [], bx: 0, bz: 0, bt: -1, marked: false, rock: null,
    shieldUp: false, sinceShield: 1, phase2: false, landed: false, layer: null
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    const y0 = fy(e)
    // Down from the ceiling…
    const k = Math.min(1, e.st / INTRO_DROP)
    e.y = INTRO_H * (1 - k * k)
    if (k >= 1 && !m.landed) {
      m.landed = true
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3.6, ICEBREAKER_COLORS.frost, 0.6)
      w.fx.sparks(e.x, y0 + 0.3, e.z, ICEBREAKER_COLORS.ice, 30, 8, 0.25)
      w.shake(0.45)
      w.sfx('stomp', e.x, e.z)
    }
    faceTo(e, w.player.x, w.player.z, 3, dt)
    // …a crouch from the landing, then both fists overhead, beaten twice.
    const land = m.landed ? Math.max(0, 1 - (e.st - INTRO_DROP) / 0.35) : 0
    const beat = e.st > INTRO_DROP + 0.45 && e.st < INTRO_T - 0.3 ? 1 : 0
    p.slam = ease(p.slam, land, 14, dt)
    p.raise = ease(p.raise, beat * (0.75 + 0.25 * Math.sin(e.st * 9)), 10, dt)
    p.heat = ease(p.heat, 1 + beat * 1.2, 6, dt)
    if (beat && Math.sin(e.st * 9) > 0.97 && Math.random() < dt * 12) w.sfx('punch', e.x, e.z)
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
      pushHud({ t: 'flash', color: ICEBREAKER_COLORS.frost, strength: 0.25 })
    }
    let raise = 0
    let slam = 0
    let lift = 0
    let hurl = 0
    let shield = 0
    let heat = 1
    switch (e.state) {
      case 'engage': {
        // A slow, heavy advance; it stops at arm's length.
        faceTo(e, w.player.x, w.player.z, 2.6, dt)
        if (d > 3.2) {
          const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
          moveBody(w, e, Math.sin(e.yaw) * sp * dt, Math.cos(e.yaw) * sp * dt)
        }
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 2)
        heat = 1 + 1.4 * k
        if (m.attack === 'slam') {
          raise = Math.min(1, k * 1.8)
          faceTo(e, e.x + m.lanes[Math.floor(m.lanes.length / 2)]!.ax, e.z + m.lanes[Math.floor(m.lanes.length / 2)]!.az, 6, dt)
        } else if (m.attack === 'boulder') {
          lift = Math.min(1, k * 1.7)
          faceTo(e, w.player.x, w.player.z, 2.5, dt)
          // Halfway up: the landing ring goes down where he stands.
          if (!m.marked && k >= BOULDER_MARK) {
            m.marked = true
            const [x, z] = inRoom(room, w.player.x, w.player.z, 0.8)
            m.bx = x
            m.bz = z
            w.markers.spawn(x, z, BOULDER_R, e.teleDur * (1 - BOULDER_MARK) + BOULDER_FLY)
          }
        } else {
          shield = Math.min(1, k * 1.5)
          faceTo(e, w.player.x, w.player.z, 3, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'slam') {
            m.front = 1.2
            w.shocks.spawn(e.x, fy(e) + 0.06, e.z, 2.6, ICEBREAKER_COLORS.frost, 0.4)
            w.shake(0.35)
            w.sfx('stomp', e.x, e.z)
          } else if (m.attack === 'boulder') {
            // Into the air, from over its head.
            m.layer = floorLayer(e, m.layer)
            if (!m.rock) {
              m.rock = makeRock()
              m.layer.add(m.rock)
            }
            m.rock.userData.sx = e.x
            m.rock.userData.sz = e.z
            m.bt = 0
            w.sfx('dash', e.x, e.z)
          } else {
            m.shieldUp = true
            w.sfx('freeze', e.x, e.z)
            w.fx.sparks(e.x + Math.sin(e.yaw) * 1.1, fy(e) + 1.8, e.z + Math.cos(e.yaw) * 1.1, ICEBREAKER_COLORS.ice, 20, 6, 0.22)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'slam') {
          slam = 1
          heat = 2
          m.front += SPIKE_SPEED * dt
          let left = false
          for (const l of m.lanes) {
            while (l.next <= Math.min(m.front, l.len)) {
              spike(w, e, m, e.x + l.ax * l.next, e.z + l.az * l.next)
              l.next += SPIKE_STEP
            }
            if (l.next <= l.len) left = true
            // The front passes him: hit, once a lane, if he stands in it.
            if (!l.hit && !e.hitPlayer) {
              const along = (w.player.x - e.x) * l.ax + (w.player.z - e.z) * l.az
              const across = Math.abs((w.player.x - e.x) * l.az - (w.player.z - e.z) * l.ax)
              if (along > 0.8 && along <= Math.min(m.front, l.len + 0.4) && along > m.front - 1.6 && across < SPIKE_HALF + 0.35) {
                l.hit = true
                e.hitPlayer = true
                w.hitPlayer(e, Math.round(e.dmg * 1.1), { blockable: false, fromX: e.x + l.ax * along, fromZ: e.z + l.az * along, kind: 'aoe' })
              }
            }
          }
          if (!left && e.st > 0.3) { e.state = 'recover'; e.st = 0 }
        } else if (m.attack === 'boulder') {
          lift = 1
          hurl = Math.min(1, e.st / 0.15)
          heat = 1.6
          if (e.st >= 0.5) { e.state = 'recover'; e.st = 0 }
        } else {
          shield = 1
          heat = 1.5
          // Pushes at him behind the slab, turning slowly: he can walk round it.
          faceTo(e, w.player.x, w.player.z, SHIELD_TURN, dt)
          if (d > 2.6) moveBody(w, e, Math.sin(e.yaw) * SHIELD_WALK * dt, Math.cos(e.yaw) * SHIELD_WALK * dt)
          if (e.st >= SHIELD_T || !m.shieldUp) {
            dropShield(m)
            w.fx.sparks(e.x + Math.sin(e.yaw) * 1.1, fy(e) + 1.6, e.z + Math.cos(e.yaw) * 1.1, ICEBREAKER_COLORS.ice, 24, 6, 0.22)
            w.sfx('guardCrack', e.x, e.z)
            e.state = 'recover'
            e.st = 0
          }
        }
        break
      }
      case 'recover': {
        // Heavy and slow to come round: its opening.
        faceTo(e, w.player.x, w.player.z, 1.6, dt)
        slam = m.attack === 'slam' ? Math.max(0, 1 - e.st * 2) : 0
        if (e.st > (m.attack === 'shield' ? 1.2 : m.phase2 ? 0.8 : 1)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
          if (m.attack !== 'shield') m.sinceShield++
        }
        break
      }
    }
    keepInRoom(e, room)
    stride(e, m, dt)
    p.raise = ease(p.raise, raise, 10, dt)
    p.slam = ease(p.slam, slam, 18, dt)
    p.lift = ease(p.lift, lift, 10, dt)
    p.hurl = ease(p.hurl, hurl, 16, dt)
    p.shield = ease(p.shield, m.shieldUp ? 1 : shield, 12, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    tickHazards(w, e, m, dt)
    dropShield(m)
    p.dying = Math.min(1, e.deathT / 1.1)
    p.raise = ease(p.raise, 0, 8, dt)
    p.slam = ease(p.slam, 0, 8, dt)
    p.lift = ease(p.lift, 0, 8, dt)
    p.shield = ease(p.shield, 0, 8, dt)
    p.heat = ease(p.heat, 2.4, 6, dt)
    // Its ice cracks off in bursts.
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2
      w.fx.orbBurst(e.x + Math.sin(a) * 0.8, fy(e) + 1 + Math.random() * 1.6, e.z + Math.cos(a) * 0.8, ICEBREAKER_COLORS.frost, 0.7)
      w.shake(0.1)
    }
  },

  pose(e, m, time) {
    m.pose.time = time
    poseIcebreakerBrute(e.rig, m.pose)
  },

  clear(_w, _e, m) {
    // A stun drops the shield (a full charge broke it).
    dropShield(m)
  },

  guarded(e, m, fromX, fromZ) {
    if (!m.shieldUp) return false
    return Math.abs(angDiff(Math.atan2(fromX - e.x, fromZ - e.z), e.yaw)) < SHIELD_ARC
  }
}

export const ICEBREAKER_BRUTE: MiniBossSpec<BruteMem> = {
  id: 'icebreakerBrute',
  sector: 'cryo',
  nameKey: 'miniboss.icebreakerBrute',
  def: {
    kind: 'miniboss', hp: 440, dmg: 16, speed: 1.9, radius: 1.25, hitR: 1.5, aimY: 1.9, fly: 0,
    aggro: 30, range: [2, 7], xp: 160, bolts: [26, 38], cooldown: 1.6, tele: SLAM_TELE, unblockable: true, armor: 1,
    // The frost core on its back.
    weak: { part: 'back', up: 2.13, fwd: -0.6, side: 0, r: 0.34 },
    color: ICEBREAKER_COLORS.frost
  },
  build: () => buildIcebreakerBrute(),
  behaviour: ICEBREAKER_AI
}
