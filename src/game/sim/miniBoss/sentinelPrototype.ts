import { AdditiveBlending, Color, CylinderGeometry, Mesh, MeshBasicMaterial, type Group } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildSentinelPrototype, poseSentinel, newSentinelPose, SENTINEL_COLORS, SENTINEL_SCALE, RING_R, RING_Y, EYE_Y, EYE_FWD,
  type SentinelPose
} from '../../models/miniBoss/sentinelPrototype'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, roomBox, teleRing, ease, angDiff, TAU } from './kit'
import { fxLayer, alignFx, FloorArc, FloorStrip } from './worldFx'
import { toWall } from './sawGyro'
import { PLAYER_R } from '../constants'
import { pushHud } from '../../state/hud'
import { hasLineOfSight } from '../../world/nav'

/**
 * ─── The Sentinel Prototype (the Fortress) ───────────────────────────────────
 *
 * Vex's security sentinel: slow, heavy and walled in by its own shield
 * drones. Where Vex himself flies and throws every element, this one holds
 * its ground on treads and makes Flux work the angles.
 *
 *  - SHIELD DRONES (always). Three drones circle it on a ring, each behind
 *    a hex shield: a shot from a drone's side is caught by the drone
 *    (DRONE_ARC either side of it). Shoot a drone to break it — DRONE_HP
 *    quick shots, or any charged one — and it comes back DRONE_BACK later.
 *    All three down at once overloads it: a stun.
 *  - MORTAR BARRAGE (red). The hull rocks back and the pod swings up, its
 *    tubes glowing (MORTAR_TELE), while every landing ring of the barrage is
 *    already marked on the floor: volleys of three that creep across the
 *    room through where Flux stands. Then the shells go up, a volley at a
 *    time, and land in their rings.
 *  - BEAM SWEEP (red). The turret leans in and the eye swells white-hot
 *    (BEAM_TELE) while the arc it will sweep lies on the floor, a bright
 *    line at the edge it starts from; then the beam sweeps the arc. A wall
 *    or a post between them stops it (it never reaches through cover), and
 *    a slide passes under it.
 *
 * Its entrance: it drops in with a crash, then boots — the eye lights and
 * the drones fly out to their ring one by one (INTRO_T).
 */

export const INTRO_T = 2.6
const INTRO_DROP = 0.5
/** The drones: how far either side of each its shield reaches (rad), its
 *  hits, its time to come back (s), the ring's turn (rad/s). */
export const DRONE_ARC = 0.5
export const DRONE_HP = 3
export const DRONE_BACK = 9
export const RING_SPIN = 0.65
const OVERLOAD_STUN = 1.8
/** The mortar: wind-up (s), volleys, the gap between them (s), the shells'
 *  flight (s) and blast (m — the shell's own, `combat.ts`). */
export const MORTAR_TELE = 1.05
export const MORTAR_VOLLEYS = 3
export const MORTAR_GAP = 0.5
export const MORTAR_FLIGHT = 1.0
export const MORTAR_R = 1.9
/** The beam: wind-up (s), the sweep (s), its arc (rad), reach (m), half width (m). */
export const BEAM_TELE = 1.2
export const BEAM_SWEEP = 1.5
export const BEAM_ARC = 2.1
export const BEAM_RANGE = 11
const BEAM_HALF = 0.35

type Attack = 'mortar' | 'beam'

export interface SentinelMem {
  pose: SentinelPose
  attack: Attack | ''
  /** The drones' ring's turn (world yaw of drone 0), each drone's hits left
   *  (0: broken) and its time to come back (s). */
  ringA: number
  droneHp: [number, number, number]
  droneBack: [number, number, number]
  /** The turret's aim (world yaw). */
  aim: number
  /** The mortar's targets, by volley. */
  shells: Array<{ x: number; z: number; v: number; fired: boolean }>
  /** The beam's sweep (world yaws) and where it is now. */
  a0: number
  a1: number
  beamA: number
  beamLen: number
  phase2: boolean
  side: number
  layer: Group | null
  arc: FloorArc | null
  edge: FloorStrip | null
  beam: Mesh | null
  boot: number
}

const fy = (e: Enemy): number => e.floor ?? 0
const S = SENTINEL_SCALE

const ensureFx = (e: Enemy, m: SentinelMem): void => {
  if (m.layer) return
  m.layer = fxLayer(e)
  m.arc = new FloorArc(m.layer, '#ff2d3f')
  m.edge = new FloorStrip(m.layer, '#ff9aa6', 0.065)
  // The beam: a glowing rod out of the eye, length 1 along +z (scaled).
  const g = new CylinderGeometry(0.16, 0.16, 1, 10, 1, true)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, 0.5)
  m.beam = new Mesh(g, new MeshBasicMaterial({ color: new Color('#ff5a6a'), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  m.beam.visible = false
  m.layer.add(m.beam)
}

/** A drone's world place (its middle). */
const droneAt = (e: Enemy, m: SentinelMem, k: number): [number, number] => {
  const a = m.ringA + (k / 3) * TAU
  return [e.x + Math.sin(a) * RING_R * S, e.z + Math.cos(a) * RING_R * S]
}

const pick = (e: Enemy, m: SentinelMem, d: number): Attack => {
  const wantMortar = d > 7 ? 0.65 : d < 4.5 ? 0.3 : 0.5
  let a: Attack = Math.random() < wantMortar ? 'mortar' : 'beam'
  if (a === m.attack && e.step >= 1) a = a === 'mortar' ? 'beam' : 'mortar'
  return a
}

const begin = (w: World, e: Enemy, m: SentinelMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  e.teleRed = true
  const tempo = m.phase2 ? 0.88 : 1
  const dx = w.player.x - e.x
  const dz = w.player.z - e.z
  const d = Math.hypot(dx, dz) || 1
  const to = Math.atan2(dx, dz)
  if (a === 'mortar') {
    e.teleDur = MORTAR_TELE * tempo
    // The barrage creeps along the line through him: three across each
    // volley, the middle volley on him. Every ring is down from the start.
    m.shells.length = 0
    const volleys = MORTAR_VOLLEYS + (m.phase2 ? 1 : 0)
    const ux = dx / d
    const uz = dz / d
    for (let v = 0; v < volleys; v++) {
      const along = d + (v - 1) * 3.2
      for (const off of [-2.6, 0, 2.6]) {
        const [x, z] = inRoom(room, e.x + ux * along - uz * off, e.z + uz * along + ux * off, 0.9)
        m.shells.push({ x, z, v, fired: false })
        w.markers.spawn(x, z, MORTAR_R, e.teleDur + v * MORTAR_GAP + MORTAR_FLIGHT)
      }
    }
    w.sfx('alert', e.x, e.z)
  } else {
    e.teleDur = BEAM_TELE * tempo
    // The arc: centred on him, swept from one side or the other.
    const dir = Math.random() < 0.5 ? 1 : -1
    m.a0 = to - dir * BEAM_ARC / 2
    m.a1 = to + dir * BEAM_ARC / 2
    m.beamA = m.a0
    const lo = Math.min(m.a0, m.a1)
    m.arc!.place(e.x, e.z, lo, lo + BEAM_ARC, BEAM_RANGE)
    const r = toCover(w, e.x, e.z, Math.sin(m.a0), Math.cos(m.a0), Math.min(BEAM_RANGE, toWall(roomBox(room, 0.2), e.x, e.z, Math.sin(m.a0), Math.cos(m.a0)).t))
    m.edge!.place(e.x, e.z, e.x + Math.sin(m.a0) * r, e.z + Math.cos(m.a0) * r, 0.35)
    w.sfx('charge2', e.x, e.z)
  }
}

/** How far a ray from (x, z) along the unit (dx, dz) runs, `r` at most,
 *  before it meets a cover pillar (`MapData.pillars`): the beam stops there,
 *  as its hit does (`inBeam`). */
export const toCover = (w: World, x: number, z: number, dx: number, dz: number, r: number): number => {
  let best = r
  for (const p of w.nav.map.pillars) {
    if (p.gone) continue
    const fx = p.x - x
    const fz = p.z - z
    const along = fx * dx + fz * dz
    if (along <= 0) continue
    const off2 = fx * fx + fz * fz - along * along
    if (off2 >= p.r * p.r) continue
    best = Math.min(best, Math.max(0, along - Math.sqrt(p.r * p.r - off2)))
  }
  return best
}

/** Flux is in the beam this tick: within its width somewhere between the
 *  angle it was at and the one it is at now, in reach, nothing between. */
const inBeam = (w: World, e: Enemy, from: number, to: number): boolean => {
  const dx = w.player.x - e.x
  const dz = w.player.z - e.z
  const d = Math.hypot(dx, dz)
  if (d > BEAM_RANGE + PLAYER_R) return false
  const a = Math.atan2(dx, dz)
  const half = Math.atan2(BEAM_HALF + PLAYER_R, Math.max(0.5, d))
  const mid = (from + to) / 2
  const span = Math.abs(angDiff(to, from)) / 2
  if (Math.abs(angDiff(a, mid)) > span + half) return false
  return hasLineOfSight(w.nav, e.x, e.z, w.player.x, w.player.z)
}

/** The drones: the ring turns; a broken one counts down to its return. */
const tickDrones = (w: World, e: Enemy, m: SentinelMem, dt: number): void => {
  m.ringA = (m.ringA + RING_SPIN * (m.phase2 ? 1.3 : 1) * dt) % TAU
  for (let k = 0; k < 3; k++) {
    if (m.droneHp[k]! > 0) continue
    m.droneBack[k] = m.droneBack[k]! - dt
    if (m.droneBack[k]! <= 0) {
      m.droneHp[k] = DRONE_HP
      const [x, z] = droneAt(e, m, k)
      w.fx.flash(x, fy(e) + RING_Y * S, z, SENTINEL_COLORS.shield, 1.4, 0.2)
      w.sfx('beamIn', x, z)
    }
  }
}

const hideTele = (m: SentinelMem): void => {
  m.arc?.hide()
  m.edge?.hide()
  if (m.beam) m.beam.visible = false
}

export const SENTINEL_AI: MiniBossBehaviour<SentinelMem> = {
  init: () => ({
    pose: newSentinelPose(), attack: '', ringA: 0, droneHp: [DRONE_HP, DRONE_HP, DRONE_HP], droneBack: [0, 0, 0], aim: 0,
    shells: [], a0: 0, a1: 0, beamA: 0, beamLen: BEAM_RANGE, phase2: false, side: 1, layer: null, arc: null, edge: null, beam: null, boot: 0
  }),

  intro(w, e, m, _room, dt) {
    ensureFx(e, m)
    const p = m.pose
    const y0 = fy(e)
    // A crash from above…
    const k = Math.min(1, e.st / INTRO_DROP)
    e.y = 6 * (1 - k) * (1 - k)
    if (k >= 1 && m.boot === 0) {
      m.boot = 1
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3.6, SENTINEL_COLORS.vex, 0.55)
      w.fx.sparks(e.x, y0 + 0.4, e.z, '#d8c8ff', 24, 8, 0.24)
      w.shake(0.45)
      w.sfx('stomp', e.x, e.z)
    }
    m.aim = e.yaw
    faceTo(e, w.player.x, w.player.z, 1.5, dt)
    // …then it boots: the eye lights, the drones fly out one by one.
    const boot = Math.max(0, e.st - INTRO_DROP - 0.3)
    p.heat = ease(p.heat, boot > 0 ? 1.8 : 0.3, 4, dt)
    for (let n = 0; n < 3; n++) {
      const t = boot - n * 0.45
      const was = p.drones[n]!
      p.drones[n] = Math.max(0, Math.min(1, t / 0.35))
      if (was === 0 && p.drones[n]! > 0) w.sfx('droneArrive', e.x, e.z)
    }
    m.ringA = (m.ringA + RING_SPIN * 2 * dt) % TAU
    if (e.st > INTRO_DROP + 0.3 && e.st - dt <= INTRO_DROP + 0.3) w.sfx('bootUp', e.x, e.z)
    if (e.st >= INTRO_T) {
      e.y = 0
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    const y0 = fy(e)
    tickDrones(w, e, m, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: SENTINEL_COLORS.vex, strength: 0.25 })
    }
    let mortar = 0
    let charge = 0
    let beam = 0
    let heat = 1
    const to = Math.atan2(w.player.x - e.x, w.player.z - e.z)
    let aimTo = to
    let aimRate = 2.5
    switch (e.state) {
      case 'engage': {
        // It rolls to hold him at range, turning its whole hull slowly.
        faceTo(e, w.player.x, w.player.z, 1.4, dt)
        const fx = Math.sin(e.yaw)
        const fz = Math.cos(e.yaw)
        const want = d > 9 ? 1 : d < 5.5 ? -1 : 0
        const sp = e.def.speed * want * dt
        if (sp !== 0) moveBody(w, e, fx * sp, fz * sp)
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, true, 1.9)
        heat = 1 + 1.3 * k
        faceTo(e, w.player.x, w.player.z, 0.8, dt)
        if (m.attack === 'mortar') {
          mortar = Math.min(1, k * 1.8)
          // The tubes' mouths smoke and glow.
          if (Math.random() < 0.4 * k) w.fx.emit({ x: e.x - Math.sin(e.yaw) * 0.7, y: y0 + 2.1, z: e.z - Math.cos(e.yaw) * 0.7, vy: 1.5, color: '#ff8a6a', size: 0.3, sizeEnd: 0.6, life: 0.5 })
        } else {
          charge = Math.min(1, k * 1.5)
          aimTo = m.a0
          aimRate = 4
          m.arc!.show(0.14 + 0.24 * k + (k > 0.75 ? 0.08 * Math.sin(e.st * 40) : 0))
          m.edge!.show(0.35 + 0.5 * k)
          // The eye draws light in.
          if (Math.random() < 0.7) {
            const ex = e.x + Math.sin(m.aim) * EYE_FWD * S
            const ez = e.z + Math.cos(m.aim) * EYE_FWD * S
            const a = Math.random() * TAU
            w.fx.emit({ x: ex + Math.sin(a) * 0.9, y: y0 + EYE_Y * S + Math.cos(a) * 0.6, z: ez + Math.cos(a) * 0.9, vx: -Math.sin(a) * 2.6, vy: -Math.cos(a) * 1.8, vz: -Math.cos(a) * 2.6, color: '#ffd0d6', size: 0.2, sizeEnd: 0.05, life: 0.3 })
          }
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'beam') {
            m.beamA = m.a0
            m.edge!.hide()
            w.sfx('flameJet', e.x, e.z)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'mortar') {
          mortar = 1
          heat = 1.8
          let volley = false
          for (const s of m.shells) {
            if (s.fired || e.st < s.v * MORTAR_GAP) continue
            s.fired = true
            volley = true
            w.lobShell(e, s.x, s.z, MORTAR_FLIGHT, Math.round(e.dmg * 0.75))
          }
          if (volley) {
            // Each volley bucks the hull.
            p.kick = 1
            w.sfx('lob', e.x, e.z)
          }
          const last = m.shells.reduce((t, s) => Math.max(t, s.v), 0)
          if (e.st >= last * MORTAR_GAP + MORTAR_FLIGHT + 0.1) { e.state = 'recover'; e.st = 0 }
        } else {
          beam = 1
          heat = 2.3
          const k = Math.min(1, e.st / BEAM_SWEEP)
          const was = m.beamA
          m.beamA = m.a0 + (m.a1 - m.a0) * (k * k * (3 - 2 * k))
          aimTo = m.beamA
          aimRate = 50
          m.arc!.show(0.22)
          if (!e.hitPlayer && inBeam(w, e, was, m.beamA)) {
            e.hitPlayer = true
            w.hitPlayer(e, Math.round(e.dmg * 1.1), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
          }
          // Where it strikes the wall or the floor at its end: sparks.
          const r = toCover(w, e.x, e.z, Math.sin(m.beamA), Math.cos(m.beamA), Math.min(BEAM_RANGE, toWall(roomBox(room, 0.2), e.x, e.z, Math.sin(m.beamA), Math.cos(m.beamA)).t))
          m.beamLen = r
          w.fx.sparks(e.x + Math.sin(m.beamA) * r, y0 + 0.9, e.z + Math.cos(m.beamA) * r, '#ffb0b8', 2, 5, 0.14)
          if (k >= 1) { hideTele(m); e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        // Venting heat: its opening.
        faceTo(e, w.player.x, w.player.z, 1, dt)
        if (Math.random() < 0.3) w.fx.emit({ x: e.x, y: y0 + 2.2, z: e.z, vy: 1.4, color: '#9aa0b0', size: 0.4, sizeEnd: 0.9, life: 0.6 })
        if (e.st > (m.phase2 ? 0.8 : 1.05)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (e.state !== 'tele' && e.state !== 'act') hideTele(m)
    m.aim += Math.max(-aimRate * dt, Math.min(aimRate * dt, angDiff(aimTo, m.aim)))
    keepInRoom(e, room)
    const moved = Math.hypot(e.x - e.px, e.z - e.pz)
    p.roll += moved / 0.22
    for (let k = 0; k < 3; k++) p.drones[k] = ease(p.drones[k]!, m.droneHp[k]! > 0 ? 1 : 0, 8, dt)
    p.mortar = ease(p.mortar, mortar, 8, dt)
    p.kick = ease(p.kick, 0, 6, dt)
    p.charge = ease(p.charge, charge, 10, dt)
    p.beam = ease(p.beam, beam, 14, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    hideTele(m)
    p.dying = Math.min(1, e.deathT / 1.1)
    p.heat = ease(p.heat, 2.4, 6, dt)
    if (Math.random() < dt * 16) {
      const a = Math.random() * TAU
      w.fx.orbBurst(e.x + Math.sin(a) * 0.9, fy(e) + 0.6 + Math.random() * 1.6, e.z + Math.cos(a) * 0.9, Math.random() < 0.5 ? SENTINEL_COLORS.vex : SENTINEL_COLORS.eye, 0.7)
      w.shake(0.12)
    }
  },

  pose(e, m, time) {
    const p = m.pose
    p.time = time
    p.turret = angDiff(m.aim, e.yaw)
    p.ring = angDiff(m.ringA, e.yaw)
    poseSentinel(e.rig, p)
    if (!m.layer) return
    alignFx(e, m.layer)
    const b = m.beam
    if (b) {
      b.visible = e.state === 'act' && m.attack === 'beam'
      if (b.visible) {
        const ex = e.x + Math.sin(m.beamA) * EYE_FWD * S
        const ez = e.z + Math.cos(m.beamA) * EYE_FWD * S
        b.position.set(ex, EYE_Y * S, ez)
        b.rotation.set(0.12, m.beamA, 0, 'YXZ')
        b.scale.set(1 + 0.2 * Math.sin(time * 60), 1 + 0.2 * Math.sin(time * 60), Math.max(0.5, m.beamLen - EYE_FWD * S))
      }
    }
  },

  clear(_w, _e, m) {
    hideTele(m)
  },

  // A shot crossing the drones' ring on a live drone's side: the drone takes it.
  shot(w, e, m, s) {
    const y0 = fy(e)
    const dx = s.x - e.x
    const dz = s.z - e.z
    const r = Math.hypot(dx, dz)
    const R = RING_R * S
    if (r > R + 0.55 || r < R - 0.6) return
    if (Math.abs(s.y - (y0 + RING_Y * S)) > 0.8) return
    const a = Math.atan2(dx, dz)
    for (let k = 0; k < 3; k++) {
      if (m.droneHp[k]! <= 0) continue
      if (Math.abs(angDiff(a, m.ringA + (k / 3) * TAU)) > DRONE_ARC) continue
      const charged = s.kind !== 'pellet'
      m.droneHp[k] = charged ? 0 : m.droneHp[k]! - 1
      w.fx.sparks(s.x, s.y, s.z, SENTINEL_COLORS.shield, 10, 5, 0.16)
      if (m.droneHp[k]! > 0) {
        pushHud({ t: 'text', x: s.x, y: s.y + 0.3, z: s.z, key: 'combat.tink', color: '#bff0ff' })
        w.sfx('tink', s.x, s.z)
        return 'catch'
      }
      // Broken: it drops out of the ring, back after a while.
      m.droneBack[k] = DRONE_BACK * (m.phase2 ? 0.8 : 1)
      const [x, z] = droneAt(e, m, k)
      w.fx.orbBurst(x, y0 + RING_Y * S, z, SENTINEL_COLORS.shield, 0.8)
      w.sfx('guardBreak', x, z)
      if (m.droneHp.every(h => h <= 0) && e.state !== 'stun' && e.state !== 'dead') {
        // All three down: it overloads.
        hideTele(m)
        e.state = 'stun'
        e.st = 0
        e.stunT = OVERLOAD_STUN
        e.ring.visible = false
        pushHud({ t: 'text', x: e.x, y: y0 + 2.8, z: e.z, key: 'combat.dizzy', color: '#ffe07a' })
      }
      return 'catch'
    }
  }
}

export const SENTINEL_PROTOTYPE: MiniBossSpec<SentinelMem> = {
  id: 'sentinelPrototype',
  sector: 'fortress',
  nameKey: 'miniboss.sentinelPrototype',
  def: {
    kind: 'miniboss', hp: 630, dmg: 19, speed: 1.8, radius: 1.3, hitR: 1.35, aimY: 1.25, fly: 0,
    aggro: 30, range: [5.5, 9], xp: 190, bolts: [28, 44], cooldown: 1.7, tele: BEAM_TELE, unblockable: true, armor: 1,
    // Its beam-emitter eye.
    weak: { part: 'head', up: EYE_Y * S, fwd: EYE_FWD * S, side: 0, r: 0.26 },
    color: SENTINEL_COLORS.vex
  },
  build: () => buildSentinelPrototype(),
  behaviour: SENTINEL_AI
}
