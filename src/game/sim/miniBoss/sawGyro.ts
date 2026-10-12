import type { Group } from 'three'
import type { Enemy, World } from '../world'
import type { Rig } from '../../models/kit'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildSawGyro, poseSawGyro, newGyroPose, buildSawBlade, poseSawBlade, GYRO_COLORS, GYRO_SCALE, GYRO_CORE_Y, type GyroPose
} from '../../models/miniBoss/sawGyro'
import { faceTo, moveBody, distToPlayer, keepInRoom, roomBox, teleRing, near, ease, TAU } from './kit'
import { fxLayer, alignFx, FloorStrip } from './worldFx'
import { pushHud } from '../../state/hud'

/**
 * ─── The Saw Gyro (Rotor Run) ────────────────────────────────────────────────
 *
 * A battle top. Where the Rotor Master fights from the air with drones and
 * downdrafts, this one owns the floor: it spins, bounces and throws saws.
 *
 *  - RICOCHET (red: get off its path). It leans back on its point and spins
 *    up (RICO_TELE) — a rising whine, sparks pouring off its teeth, its
 *    shots TINKing off the blur — while its path is drawn on the floor: the
 *    run to the first wall and the bounce off it. Then it shoots off along
 *    it at RICO_SPEED and caroms round the room, each new leg drawn as it
 *    bounces. A full charge shot breaks the spin (a guard break).
 *  - DIZZY: after a big ricochet (RICO_BOUNCES walls) it runs down and
 *    wobbles round on its point, the petals on its crown fall open and its
 *    gyro core is bare (DIZZY_T) — the punish window (a stun: hits there
 *    count extra, the core is its weak spot).
 *  - SAW BLADES (red). It squats and its skirt flares (BLADE_TELE) while
 *    two lanes — three from half health — are drawn on the floor from it;
 *    then it flings a saw blade down each, rolling to the wall.
 *
 * Its entrance: it drops from above spinning, lands with a shock ring and
 * spins up (INTRO_T).
 */

export const INTRO_T = 2.3
const INTRO_DROP = 0.55
/** The ricochet: wind-up (s), speed (m/s), the walls it caroms off before it
 *  runs down (more from half health), the dizzy spell after (s). */
export const RICO_TELE = 1.15
export const RICO_SPEED = 12.5
export const RICO_BOUNCES = 3
export const DIZZY_T = 2.4
const RICO_MAX_T = 4.5
/** The blades: wind-up (s), speed (m/s), lane spread (rad), reach (m). */
export const BLADE_TELE = 0.95
export const BLADE_SPEED = 9
const BLADE_SPREAD = 0.42
const BLADE_R = 0.5
const BLADE_GAP = 0.14
const LANE_W = 0.9

type Attack = 'ricochet' | 'blades'

export interface SawBlade {
  x: number
  z: number
  ax: number
  az: number
  len: number
  /** Distance rolled (m), the delay before it goes (s). */
  run: number
  wait: number
  live: boolean
  hit: boolean
  rig: Rig
  lane: FloorStrip
}

export interface GyroMem {
  pose: GyroPose
  attack: Attack | ''
  /** The ricochet's heading (unit) and the walls it has struck. */
  vx: number
  vz: number
  bounces: number
  blades: SawBlade[]
  /** The path drawn for the ricochet: this leg, the one after the bounce. */
  path: FloorStrip[]
  phase2: boolean
  side: number
  spin: number
  layer: Group | null
  burst: boolean
}

const fy = (e: Enemy): number => e.floor ?? 0

const ensureFx = (e: Enemy, m: GyroMem): void => {
  if (m.layer) return
  m.layer = fxLayer(e)
  for (let k = 0; k < 3; k++) {
    const rig = buildSawBlade()
    rig.root.visible = false
    m.layer.add(rig.root)
    m.blades.push({ x: 0, z: 0, ax: 0, az: 1, len: 0, run: 0, wait: 0, live: false, hit: false, rig, lane: new FloorStrip(m.layer, '#ff2d3f') })
  }
  m.path.push(new FloorStrip(m.layer, '#ff2d3f'), new FloorStrip(m.layer, '#ff2d3f', 0.055))
}

/** From (x, z) along (ax, az) to the edge of `box`: the distance and which
 *  wall (true: an x wall, so the bounce flips ax). */
export const toWall = (box: readonly [number, number, number, number], x: number, z: number, ax: number, az: number): { t: number; xWall: boolean } => {
  const [x0, z0, x1, z1] = box
  const tx = ax > 1e-6 ? (x1 - x) / ax : ax < -1e-6 ? (x0 - x) / ax : Infinity
  const tz = az > 1e-6 ? (z1 - z) / az : az < -1e-6 ? (z0 - z) / az : Infinity
  return tx < tz ? { t: Math.max(0, tx), xWall: true } : { t: Math.max(0, tz), xWall: false }
}

const rideBox = (e: Enemy, room: Room) => roomBox(room, e.def.radius + 0.15)

/** Draw the ricochet's path from where it stands: this leg to the wall, and
 *  the leg after the bounce. */
const drawPath = (e: Enemy, m: GyroMem, room: Room): void => {
  const box = rideBox(e, room)
  const a = toWall(box, e.x, e.z, m.vx, m.vz)
  const hx = e.x + m.vx * a.t
  const hz = e.z + m.vz * a.t
  m.path[0]!.place(e.x, e.z, hx, hz, e.def.radius * 2)
  const bx = a.xWall ? -m.vx : m.vx
  const bz = a.xWall ? m.vz : -m.vz
  const b = toWall(box, hx, hz, bx, bz)
  m.path[1]!.place(hx, hz, hx + bx * Math.min(b.t, 7), hz + bz * Math.min(b.t, 7), e.def.radius * 1.6)
}

const hidePath = (m: GyroMem): void => {
  for (const s of m.path) s.hide()
}

const pick = (e: Enemy, m: GyroMem, d: number): Attack => {
  const wantRico = d > 7 ? 0.7 : d < 4 ? 0.35 : 0.5
  let a: Attack = Math.random() < wantRico ? 'ricochet' : 'blades'
  if (a === m.attack && e.step >= 1) a = a === 'ricochet' ? 'blades' : 'ricochet'
  return a
}

const begin = (w: World, e: Enemy, m: GyroMem, a: Attack, room: Room): void => {
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
  if (a === 'ricochet') {
    e.teleDur = RICO_TELE * tempo
    m.vx = dx / d
    m.vz = dz / d
    m.bounces = 0
    drawPath(e, m, room)
    w.sfx('charge2', e.x, e.z)
  } else {
    e.teleDur = BLADE_TELE * tempo
    const n = m.phase2 ? 3 : 2
    const to = Math.atan2(dx, dz)
    const box = roomBox(room, 0.4)
    m.blades.forEach((b, k) => {
      b.live = false
      b.rig.root.visible = false
      if (k >= n) { b.len = 0; b.lane.hide(); return }
      // Two lanes either side of him; three: one straight at him as well.
      const off = n === 2 ? (k === 0 ? -0.5 : 0.5) : k - 1
      const a = to + off * BLADE_SPREAD
      b.ax = Math.sin(a)
      b.az = Math.cos(a)
      b.x = e.x + b.ax * (e.def.radius + 0.2)
      b.z = e.z + b.az * (e.def.radius + 0.2)
      b.len = toWall(box, b.x, b.z, b.ax, b.az).t
      b.run = 0
      b.wait = k * BLADE_GAP
      b.hit = false
      b.lane.place(b.x, b.z, b.x + b.ax * b.len, b.z + b.az * b.len, LANE_W)
    })
    w.sfx('trapClick', e.x, e.z)
  }
}

/** The blades roll down their lanes; a lane fades once its blade is gone. */
const tickBlades = (w: World, e: Enemy, m: GyroMem, dt: number): boolean => {
  let any = false
  const y0 = fy(e)
  for (const b of m.blades) {
    if (!b.live) continue
    if (b.wait > 0) { b.wait -= dt; any = true; continue }
    b.run += BLADE_SPEED * dt
    if (b.run >= b.len) {
      b.live = false
      b.rig.root.visible = false
      b.lane.hide()
      const ex = b.x + b.ax * b.len
      const ez = b.z + b.az * b.len
      w.fx.sparks(ex, y0 + 0.4, ez, '#ffe07a', 14, 6, 0.18)
      w.sfx('bonk', ex, ez)
      continue
    }
    any = true
    const x = b.x + b.ax * b.run
    const z = b.z + b.az * b.run
    if (Math.random() < 0.5) w.fx.emit({ x, y: y0 + 0.05, z, vy: 2, color: '#ffcf4a', size: 0.18, sizeEnd: 0.02, life: 0.25, gravity: 8 })
    if (!b.hit && near(w, x, z, BLADE_R)) {
      b.hit = true
      w.hitPlayer(e, Math.round(e.dmg * 0.7), { blockable: false, fromX: x, fromZ: z, kind: 'melee' })
    }
  }
  return any
}

export const SAW_GYRO_AI: MiniBossBehaviour<GyroMem> = {
  init: () => ({
    pose: newGyroPose(), attack: '', vx: 0, vz: 1, bounces: 0, blades: [], path: [], phase2: false, side: 1, spin: 4,
    layer: null, burst: false
  }),

  intro(w, e, m, _room, dt) {
    ensureFx(e, m)
    const p = m.pose
    const y0 = fy(e)
    // Down from above, spinning…
    const k = Math.min(1, e.st / INTRO_DROP)
    e.y = 7 * (1 - k) * (1 - k)
    m.spin = ease(m.spin, e.st < INTRO_DROP ? 10 : e.st < INTRO_T - 0.6 ? 26 : 12, 3, dt)
    if (k >= 1 && !m.burst) {
      m.burst = true
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3.4, GYRO_COLORS.hot, 0.5)
      w.fx.sparks(e.x, y0 + 0.4, e.z, '#ffe07a', 26, 9, 0.22)
      w.shake(0.35)
      w.sfx('stomp', e.x, e.z)
      w.sfx('charge3', e.x, e.z)
    }
    // …then it spins up where it landed, sparks off its skirt.
    const rev = e.st > INTRO_DROP + 0.2 && e.st < INTRO_T - 0.5 ? 1 : 0
    p.spinUp = ease(p.spinUp, rev * 0.6, 6, dt)
    p.heat = ease(p.heat, 1 + rev, 6, dt)
    if (rev && Math.random() < 0.6) {
      const a = Math.random() * TAU
      w.fx.emit({ x: e.x + Math.sin(a) * 1.25, y: y0 + 0.75, z: e.z + Math.cos(a) * 1.25, vx: Math.cos(a) * 5, vy: 1.5, vz: -Math.sin(a) * 5, color: '#ffd24a', size: 0.16, sizeEnd: 0.02, life: 0.3, gravity: 8 })
    }
    faceTo(e, w.player.x, w.player.z, 4, dt)
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
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: GYRO_COLORS.hot, strength: 0.25 })
    }
    let spinUp = 0
    let flare = 0
    let rush = 0
    let heat = 1
    let spin = 9
    switch (e.state) {
      case 'engage': {
        // It drifts round him at mid range, humming.
        faceTo(e, w.player.x, w.player.z, 4, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side * 0.9
        let mz = nx * m.side * 0.9
        if (d > 7.5) { mx -= nx; mz -= nz } else if (d < 4.5) { mx += nx; mz += nz }
        const ml = Math.hypot(mx, mz) || 1
        if (moveBody(w, e, (mx / ml) * e.def.speed * dt, (mz / ml) * e.def.speed * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.25) m.side = -m.side
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, true, 1.7)
        heat = 1 + 1.4 * k
        if (m.attack === 'ricochet') {
          spinUp = Math.min(1, k * 1.5)
          spin = 9 + 30 * k
          for (const s of m.path) s.show(0.2 + 0.35 * k + (k > 0.75 ? 0.15 * Math.sin(e.st * 40) : 0))
          faceTo(e, e.x + m.vx, e.z + m.vz, 6, dt)
          // Sparks pour off the teeth, more and more.
          for (let n = 0; n < 1 + Math.floor(3 * k); n++) {
            const a = Math.random() * TAU
            w.fx.emit({ x: e.x + Math.sin(a) * 1.3, y: y0 + 0.72, z: e.z + Math.cos(a) * 1.3, vx: Math.cos(a) * 6, vy: 1 + Math.random() * 2, vz: -Math.sin(a) * 6, color: Math.random() < 0.5 ? '#ffd24a' : '#ff7a2a', size: 0.18, sizeEnd: 0.02, life: 0.35, gravity: 8 })
          }
          if (e.st >= e.teleDur * 0.55 && e.st - dt < e.teleDur * 0.55) w.sfx('charge3', e.x, e.z)
        } else {
          flare = Math.min(1, k * 1.7)
          spin = 9 + 14 * k
          for (const b of m.blades) if (b.len > 0) b.lane.show(0.18 + 0.4 * k + (k > 0.75 ? 0.12 * Math.sin(e.st * 40) : 0))
          faceTo(e, w.player.x, w.player.z, 3, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'ricochet') w.sfx('dash', e.x, e.z)
          else {
            for (const b of m.blades) b.live = b.len > 0
            w.sfx('bladeWhoosh', e.x, e.z)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'ricochet') {
          rush = 1
          spin = 40
          heat = 2.2
          const box = rideBox(e, room)
          const frac = moveBody(w, e, m.vx * RICO_SPEED * dt, m.vz * RICO_SPEED * dt)
          const [x0, z0, x1, z1] = box
          const hitX = (e.x <= x0 + 0.02 && m.vx < 0) || (e.x >= x1 - 0.02 && m.vx > 0)
          const hitZ = (e.z <= z0 + 0.02 && m.vz < 0) || (e.z >= z1 - 0.02 && m.vz > 0)
          keepInRoom(e, room)
          if (Math.random() < 0.8) w.fx.emit({ x: e.x, y: y0 + 0.05, z: e.z, vy: 2.5, color: '#ffcf4a', size: 0.22, sizeEnd: 0.02, life: 0.3, gravity: 8 })
          if (!e.hitPlayer && near(w, e.x, e.z, e.def.radius + 0.1)) {
            e.hitPlayer = true
            w.hitPlayer(e, Math.round(e.dmg * 1.2), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
          }
          if (hitX || hitZ || (frac < 0.35 && e.st > 0.05)) {
            // A wall: off it, sparks, a thud.
            if (hitX) m.vx = -m.vx
            if (hitZ) m.vz = -m.vz
            if (!hitX && !hitZ) { m.vx = -m.vx; m.vz = -m.vz }
            m.bounces++
            w.fx.sparks(e.x, y0 + 0.7, e.z, '#ffe07a', 20, 8, 0.2)
            w.shake(0.25)
            w.sfx('bonk', e.x, e.z)
            if (m.bounces >= RICO_BOUNCES + (m.phase2 ? 1 : 0)) {
              // Run down against the last wall: dizzy, its core bare.
              hidePath(m)
              e.state = 'stun'
              e.st = 0
              e.stunT = DIZZY_T
              pushHud({ t: 'text', x: e.x, y: y0 + 2.4, z: e.z, key: 'combat.dizzy', color: '#ffe07a' })
              break
            }
            e.hitPlayer = false
            drawPath(e, m, room)
          }
          for (const s of m.path) s.show(0.4)
          if (e.st > RICO_MAX_T) { hidePath(m); e.state = 'recover'; e.st = 0 }
        } else {
          flare = 1 - Math.min(1, e.st / 0.4)
          if (!tickBlades(w, e, m, dt) && e.st > 0.3) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        faceTo(e, w.player.x, w.player.z, 3, dt)
        spin = 6
        if (e.st > (m.phase2 ? 0.6 : 0.85)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (e.state !== 'tele' && !(e.state === 'act' && m.attack === 'ricochet')) hidePath(m)
    keepInRoom(e, room)
    m.spin = ease(m.spin, spin, 4, dt)
    p.spinUp = ease(p.spinUp, spinUp, 10, dt)
    p.flare = ease(p.flare, flare, 12, dt)
    p.rush = ease(p.rush, rush, 10, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    hidePath(m)
    for (const b of m.blades) { b.live = false; b.rig.root.visible = false; b.lane.hide() }
    p.dying = Math.min(1, e.deathT / 1.1)
    p.dizzy = ease(p.dizzy, 1, 6, dt)
    p.heat = ease(p.heat, 2.4, 6, dt)
    m.spin = ease(m.spin, 0, 2, dt)
    if (Math.random() < dt * 16) {
      const a = Math.random() * TAU
      w.fx.orbBurst(e.x + Math.sin(a) * 0.8, fy(e) + 0.5 + Math.random() * 1.2, e.z + Math.cos(a) * 0.8, Math.random() < 0.5 ? GYRO_COLORS.hot : GYRO_COLORS.core, 0.6)
      w.shake(0.1)
    }
  },

  pose(e, m, time) {
    const p = m.pose
    const dt = Math.min(0.1, Math.max(0, time - p.time))
    p.time = time
    // The spin (and its dizzy run-down, a stun the framework runs).
    const dizzy = e.state === 'stun' ? 1 : 0
    p.dizzy = e.state === 'dead' ? p.dizzy : ease(p.dizzy, dizzy, dizzy ? 6 : 3, dt)
    const rate = e.state === 'stun' ? 3 : m.spin
    p.spinA = (p.spinA + rate * dt) % TAU
    p.sawA = (p.sawA + rate * 1.6 * dt) % TAU
    poseSawGyro(e.rig, p)
    if (!m.layer) return
    alignFx(e, m.layer)
    for (const b of m.blades) {
      if (!b.live || b.wait > 0) { b.rig.root.visible = false; continue }
      b.rig.root.visible = true
      b.rig.root.position.set(b.x + b.ax * b.run, 0, b.z + b.az * b.run)
      b.rig.root.rotation.y = Math.atan2(b.ax, b.az)
      poseSawBlade(b.rig, b.run / 0.42)
    }
  },

  clear(_w, e, m) {
    hidePath(m)
    // A stun or its death stops the blades where they are: they break up.
    for (const b of m.blades) {
      b.live = false
      b.rig.root.visible = false
      b.lane.hide()
    }
    if (e.state === 'dead') m.spin = 0
  },

  // Spinning up and mid-ricochet, its whirling skirt turns every shot (a
  // full charge breaks it like any guard: a stun).
  guarded(e, m) {
    return m.attack === 'ricochet' && (e.state === 'tele' || e.state === 'act')
  }
}

export const SAW_GYRO: MiniBossSpec<GyroMem> = {
  id: 'sawGyro',
  sector: 'rotor',
  nameKey: 'miniboss.sawGyro',
  def: {
    kind: 'miniboss', hp: 590, dmg: 18, speed: 3, radius: 1.2, hitR: 1.3, aimY: 1.0, fly: 0,
    aggro: 30, range: [4.5, 7.5], xp: 175, bolts: [26, 40], cooldown: 1.5, tele: RICO_TELE, unblockable: true, armor: 1,
    // The gyro core on its crown.
    weak: { part: 'core', up: GYRO_CORE_Y * GYRO_SCALE, fwd: 0, side: 0, r: 0.4 },
    color: GYRO_COLORS.hot
  },
  build: () => buildSawGyro(),
  behaviour: SAW_GYRO_AI
}
