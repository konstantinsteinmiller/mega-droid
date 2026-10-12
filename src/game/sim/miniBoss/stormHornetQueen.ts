import { AdditiveBlending, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import { buildStormHornetQueen, poseStormHornetQueen, newQueenPose, QUEEN_COLORS, QUEEN_SCALE, type QueenPose } from '../../models/miniBoss/stormHornetQueen'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, teleRing, inCone, near, ease, floorLayer } from './kit'
import { createEnemy, wake } from '../enemies'
import { pushHud } from '../../state/hud'

/**
 * ─── The Storm Hornet Queen (Gale) ───────────────────────────────────────────
 *
 * The Hornet Rotor grown into a queen: a flyer that never lands except on
 * its own sting, nothing like the Gale Master's wind-throwing android. It
 * hovers at mid range, circling Flux. Three moves, each with a big wind-up,
 * the glow flaring and the ring over it, the area drawn before anything
 * lands:
 *
 *  - DRONES (no damage of its own). Its abdomen pumps, the crown aglow
 *    (SUMMON_TELE), rings on the floor under where they will appear; then
 *    2 (3 from half health) small Hornet Rotors join the fight — weak ones,
 *    and never more than DRONES_MAX at once.
 *  - GUST (red: get out of the cone). It rears back, wings spread wide
 *    (GUST_TELE), while a cone fills in on the floor in front of it and wind
 *    streaks blow along it; its aim follows Flux until the last GUST_LOCK.
 *    Then a gale blows down the cone for GUST_T: it shoves him back hard
 *    (a nudge of damage once).
 *  - DIVE STING (red). A ring locks onto the floor where Flux stands; the
 *    queen climbs, nose up, the stinger swung under it glowing (DIVE_TELE);
 *    then it dives into the ring. Its stinger sticks in the floor for
 *    STUCK_T: its weak spot — the glowing stinger end — is low and open.
 *
 * Its entrance: it swoops down from high above and spreads its wings with
 * a screech of rotors (`INTRO_T`; hits TINK off it meanwhile).
 */

export const INTRO_T = 2.6
const INTRO_FALL = 1.2
const INTRO_H = 9
/** Its hover over the floor (m: its body's middle). */
export const HOVER = 2.9
/** The drones: wind-up (s), how many at once at most. */
export const SUMMON_TELE = 0.9
export const DRONES_MAX = 3
const DRONE_HP = 0.35
const DRONE_DMG = 0.6
/** Her death takes them down: they drop this long (s), then burst — no
 *  XP, no bolts (the kill is the end of the challenge, not a farm). */
export const DRONE_FALL = 0.45
/** The gust: wind-up (s; the aim locks for its last GUST_LOCK), length (s),
 *  the cone (m, rad), the shove (m/s). */
export const GUST_TELE = 1.0
const GUST_LOCK = 0.35
export const GUST_T = 1.1
export const GUST_RANGE = 8
export const GUST_HALF = 0.55
export const GUST_PUSH = 9
/** The dive: wind-up (s), speed (m/s), the strike (m), stuck in the floor (s). */
export const DIVE_TELE = 1.1
const DIVE_SPEED = 17
export const DIVE_R = 1.5
export const STUCK_T = 1.1
const DIVE_TOP = 4.6
const STUCK_Y = 1.1

type Attack = 'summon' | 'gust' | 'dive'

export interface QueenMem {
  pose: QueenPose
  attack: Attack | ''
  /** The dive's ring and where it set off from; the drones' spots. */
  tx: number
  tz: number
  sx: number
  sy: number
  sz: number
  spots: Array<[number, number]>
  /** Its drones (alive or not): it only calls more under the cap. */
  drones: Enemy[]
  /** It hit (the gust's nudge, the dive's strike) this attack. */
  struck: boolean
  /** The dive has landed: its stinger is in the floor. */
  stuck: boolean
  sinceSummon: number
  side: number
  phase2: boolean
  /** She is down: her drones are falling with her. */
  downed: boolean
  cone: Mesh | null
  layer: Group | null
}

const fy = (e: Enemy): number => e.floor ?? 0

const makeCone = (m: QueenMem, e: Enemy): Mesh => {
  const g = new CircleGeometry(GUST_RANGE, 24, -Math.PI / 2 - GUST_HALF, GUST_HALF * 2)
  g.rotateX(-Math.PI / 2)
  const c = new Mesh(g, new MeshBasicMaterial({
    color: '#dff4ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  }))
  c.renderOrder = 1
  c.visible = false
  m.layer = floorLayer(e, m.layer)
  m.layer.add(c)
  return c
}

const alive = (m: QueenMem): number => m.drones.filter(d => d.state !== 'dead' && d.hp > 0).length

const pick = (e: Enemy, m: QueenMem, d: number): Attack => {
  if (m.sinceSummon >= (m.phase2 ? 2 : 3) && alive(m) < 2) return 'summon'
  let a: Attack = Math.random() < (d < 7 ? 0.6 : 0.3) ? 'gust' : 'dive'
  if (a === m.attack && e.step >= 1) a = a === 'gust' ? 'dive' : 'gust'
  return a
}

const begin = (w: World, e: Enemy, m: QueenMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  m.struck = false
  m.stuck = false
  e.teleRed = a !== 'summon'
  const tempo = m.phase2 ? 0.85 : 1
  if (a === 'summon') {
    e.teleDur = SUMMON_TELE
    m.sinceSummon = 0
    // Rings under where they will appear: round it, toward him.
    const n = Math.min(m.phase2 ? 3 : 2, DRONES_MAX - alive(m))
    const toward = Math.atan2(w.player.x - e.x, w.player.z - e.z)
    m.spots.length = 0
    for (let k = 0; k < n; k++) {
      const a2 = toward + (k - (n - 1) / 2) * 1.1
      const at = inRoom(room, e.x + Math.sin(a2) * 2.2, e.z + Math.cos(a2) * 2.2, 0.8)
      m.spots.push(at)
      w.markers.spawn(at[0], at[1], 0.6, e.teleDur + 0.1)
    }
    w.sfx('droneHumHi', e.x, e.z)
  } else if (a === 'gust') {
    e.teleDur = GUST_TELE * tempo
    m.cone ??= makeCone(m, e)
    w.sfx('trapHiss', e.x, e.z)
  } else {
    e.teleDur = DIVE_TELE * tempo
    // The ring on him, now: it does not follow him.
    const [x, z] = inRoom(room, w.player.x, w.player.z, 0.8)
    m.tx = x
    m.tz = z
    const flight = Math.hypot(x - e.x, z - e.z, DIVE_TOP - STUCK_Y) / DIVE_SPEED
    w.markers.spawn(x, z, DIVE_R, e.teleDur + flight + 0.1)
    w.sfx('alert', e.x, e.z)
  }
}

/** Its drones join the fight: weak little Hornet Rotors, awake at once. */
const callDrones = (w: World, e: Enemy, m: QueenMem): void => {
  const y0 = fy(e)
  for (const [x, z] of m.spots) {
    w.fx.riseRing(x, y0 + 0.1, z, QUEEN_COLORS.main, 0.7, 14)
    w.fx.sparks(x, y0 + 2, z, QUEEN_COLORS.main, 10, 4, 0.15)
    if (!w.addEnemy || alive(m) >= DRONES_MAX) continue
    const d = createEnemy('hornet', e.level, x, z, e.room, { colors: QUEEN_COLORS })
    if (e.floor !== undefined) d.floor = e.floor
    w.addEnemy(d)
    d.maxHp = Math.max(1, Math.round(d.maxHp * DRONE_HP))
    d.hp = d.maxHp
    d.dmg = Math.max(1, Math.round(d.dmg * DRONE_DMG))
    d.rig.root.scale.setScalar(0.8)
    d.yaw = Math.atan2(w.player.x - x, w.player.z - z)
    wake(w, d, false)
    m.drones.push(d)
  }
  // Only the living are kept.
  m.drones = m.drones.filter(d => d.state !== 'dead' && d.hp > 0)
  w.sfx('droneArrive', e.x, e.z)
}

/** Wind streaks along the cone (the gust's tell and the gust). */
const streaks = (w: World, e: Enemy, n: number, speed: number): void => {
  const y0 = fy(e)
  for (let k = 0; k < n; k++) {
    const a = e.yaw + (Math.random() - 0.5) * GUST_HALF * 1.8
    const r = Math.random() * 1.5
    w.fx.emit({
      x: e.x + Math.sin(a) * r, y: y0 + 0.3 + Math.random() * 1.6, z: e.z + Math.cos(a) * r,
      vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, color: '#e6f6ff', size: 0.18, sizeEnd: 0.05, life: GUST_RANGE / speed
    })
  }
}

/** Her drones fall with her: stunned (a stunned Hornet Rotor sags to the
 *  floor) in a shower of sparks, then each bursts where it fell. Quietly:
 *  not through the combat's kill, so nothing drops. */
const dropDrones = (w: World, e: Enemy, m: QueenMem): void => {
  const up = m.drones.filter(d => d.state !== 'dead' && d.hp > 0)
  if (!m.downed) {
    m.downed = true
    for (const d of up) {
      d.state = 'stun'
      d.st = 0
      d.stunT = DRONE_FALL + 0.5
      d.ring.visible = false
      w.fx.sparks(d.x, fy(d) + d.y, d.z, QUEEN_COLORS.main, 10, 4, 0.15)
    }
    return
  }
  for (const d of up) {
    if (Math.random() < 0.5) w.fx.emit({ x: d.x, y: fy(d) + d.y, z: d.z, vy: 1.5, color: QUEEN_COLORS.main, size: 0.2, sizeEnd: 0.05, life: 0.3 })
    if (e.deathT < DRONE_FALL) continue
    d.hp = 0
    d.state = 'dead'
    d.deathT = 0
    d.ring.visible = false
    w.fx.orbBurst(d.x, fy(d) + d.y, d.z, QUEEN_COLORS.main, 0.6)
    w.sfx('explode', d.x, d.z)
  }
}

export const STORM_HORNET_QUEEN_AI: MiniBossBehaviour<QueenMem> = {
  init: () => ({
    pose: newQueenPose(), attack: '', tx: 0, tz: 0, sx: 0, sy: 0, sz: 0, spots: [], drones: [], struck: false, stuck: false,
    sinceSummon: 2, side: 1, phase2: false, downed: false, cone: null, layer: null
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    // Down from high above…
    const k = Math.min(1, e.st / INTRO_FALL)
    const s = k * k * (3 - 2 * k)
    e.y = INTRO_H + (HOVER - INTRO_H) * s
    p.fly = ease(p.fly, k < 1 ? 1 : 0, 6, dt)
    faceTo(e, w.player.x, w.player.z, 4, dt)
    // …then the wings spread wide with a screech of rotors.
    const spread = e.st > INTRO_FALL + 0.1 && e.st < INTRO_T - 0.3 ? 1 : 0
    if (spread && p.fan < 0.05) {
      w.sfx('droneArrive', e.x, e.z)
      w.shocks.spawn(e.x, fy(e) + 0.06, e.z, 3.2, QUEEN_COLORS.main, 0.5)
    }
    p.fan = ease(p.fan, spread, 8, dt)
    p.heat = ease(p.heat, 1 + spread * 1.2, 6, dt)
    if (e.st >= INTRO_T) {
      e.y = HOVER
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      m.sinceSummon = 99
      pushHud({ t: 'flash', color: QUEEN_COLORS.main, strength: 0.25 })
    }
    let summon = 0
    let fan = 0
    let gust = 0
    let aim = 0
    let dive = 0
    let stuck = 0
    let fly = 0
    let heat = 1
    let hover = HOVER
    switch (e.state) {
      case 'engage': {
        // Circle him at mid range, bobbing.
        faceTo(e, w.player.x, w.player.z, 4, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side * 0.8
        let mz = nx * m.side * 0.8
        if (d > 8) { mx -= nx; mz -= nz } else if (d < 5) { mx += nx * 0.9; mz += nz * 0.9 }
        const ml = Math.hypot(mx, mz) || 1
        const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
        if (moveBody(w, e, (mx / ml) * sp * dt, (mz / ml) * sp * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.2) m.side = -m.side
        fly = 0.5
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.8)
        heat = 1 + 1.4 * k
        if (m.attack === 'summon') {
          summon = Math.min(1, k * 1.6)
          faceTo(e, w.player.x, w.player.z, 3, dt)
        } else if (m.attack === 'gust') {
          fan = Math.min(1, k * 1.6)
          if (e.teleDur - e.st > GUST_LOCK) faceTo(e, w.player.x, w.player.z, 2.4, dt)
          const c = m.cone!
          c.visible = true
          c.position.set(e.x, fy(e) + 0.05, e.z)
          c.rotation.y = e.yaw
          ;(c.material as MeshBasicMaterial).opacity = 0.1 + 0.28 * k + (k > 0.8 ? 0.1 * Math.sin(e.st * 40) : 0)
          if (Math.random() < 0.6) streaks(w, e, 1, 7)
        } else {
          aim = Math.min(1, k * 1.6)
          hover = HOVER + (DIVE_TOP - HOVER) * Math.min(1, k * 1.4)
          faceTo(e, m.tx, m.tz, 5, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'summon') callDrones(w, e, m)
          else if (m.attack === 'gust') w.sfx('gust', e.x, e.z)
          else {
            m.sx = e.x
            m.sy = e.y
            m.sz = e.z
            w.sfx('whizz', e.x, e.z)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'summon') {
          summon = Math.max(0, 1 - e.st * 2)
          if (e.st >= 0.5) { e.state = 'recover'; e.st = 0 }
        } else if (m.attack === 'gust') {
          gust = 1
          heat = 1.8
          const c = m.cone!
          c.position.set(e.x, fy(e) + 0.05, e.z)
          ;(c.material as MeshBasicMaterial).opacity = 0.35 + 0.1 * Math.sin(e.st * 30)
          streaks(w, e, 4, 14)
          if (inCone(w, e.x, e.z, e.yaw, GUST_RANGE, GUST_HALF)) {
            // Shoved back down the cone; a nudge of damage, once.
            w.pull?.(e.x, e.z, -GUST_PUSH, 0.12)
            if (!m.struck) {
              m.struck = true
              w.hitPlayer(e, Math.round(e.dmg * 0.3), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
            }
          }
          if (e.st >= GUST_T) {
            c.visible = false
            e.state = 'recover'
            e.st = 0
          }
        } else if (!m.stuck) {
          // Down the line into the ring.
          dive = 1
          heat = 2.2
          const dist = Math.hypot(m.tx - m.sx, m.tz - m.sz, STUCK_Y - m.sy)
          const f = Math.min(1, (e.st * DIVE_SPEED) / Math.max(0.1, dist))
          e.x = m.sx + (m.tx - m.sx) * f
          e.z = m.sz + (m.tz - m.sz) * f
          hover = m.sy + (STUCK_Y - m.sy) * f
          e.y = hover
          if (f >= 1) {
            m.stuck = true
            e.st = 0
            const y0 = fy(e)
            w.shocks.spawn(m.tx, y0 + 0.06, m.tz, DIVE_R, QUEEN_COLORS.sting, 0.4)
            w.fx.sparks(m.tx, y0 + 0.3, m.tz, QUEEN_COLORS.sting, 20, 7, 0.2)
            w.shake(0.3)
            w.sfx('stomp', m.tx, m.tz)
            if (near(w, m.tx, m.tz, DIVE_R)) {
              m.struck = true
              w.hitPlayer(e, Math.round(e.dmg * 1.25), { blockable: false, fromX: m.tx, fromZ: m.tz, kind: 'melee' })
            }
          }
        } else {
          // Stuck in the floor, tugging: its opening.
          stuck = 1
          hover = STUCK_Y
          heat = 1.4
          if (e.st >= STUCK_T) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        faceTo(e, w.player.x, w.player.z, 3, dt)
        stuck = m.attack === 'dive' ? Math.max(0, 1 - e.st * 3) : 0
        if (e.st > (m.phase2 ? 0.6 : 0.85)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
          m.sinceSummon++
        }
        break
      }
    }
    if (e.state !== 'tele' && !(e.state === 'act' && m.attack === 'gust') && m.cone) m.cone.visible = false
    // Up to its hover (or its dive's height) unless it is diving.
    if (!(e.state === 'act' && m.attack === 'dive')) e.y = ease(e.y, hover, 5, dt)
    keepInRoom(e, room)
    const moved = Math.hypot(e.x - e.px, e.z - e.pz)
    p.fly = ease(p.fly, Math.max(fly, Math.min(1, moved / Math.max(1e-4, dt) / 6)), 6, dt)
    p.summon = ease(p.summon, summon, 10, dt)
    p.fan = ease(p.fan, fan, 10, dt)
    p.gust = ease(p.gust, gust, 12, dt)
    p.aim = ease(p.aim, aim, 10, dt)
    p.dive = ease(p.dive, dive, 14, dt)
    p.stuck = ease(p.stuck, stuck, 14, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    if (m.cone) m.cone.visible = false
    dropDrones(w, e, m)
    p.dying = Math.min(1, e.deathT / 1.1)
    p.fan = ease(p.fan, 0, 8, dt)
    p.aim = ease(p.aim, 0, 8, dt)
    p.dive = ease(p.dive, 0, 8, dt)
    p.heat = ease(p.heat, 2.4, 6, dt)
    // It spins down out of the air, sparking.
    e.y = ease(e.y, 0.6, 3, dt)
    e.yaw += dt * 5 * p.dying
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2
      w.fx.orbBurst(e.x + Math.sin(a) * 0.8, fy(e) + e.y + Math.random() * 0.6, e.z + Math.cos(a) * 0.8, QUEEN_COLORS.main, 0.7)
      w.shake(0.08)
    }
  },

  pose(e, m, time) {
    m.pose.time = time
    poseStormHornetQueen(e.rig, m.pose)
  },

  clear(_w, e, m) {
    if (m.cone) m.cone.visible = false
    // Stunned out of a dive: it is no longer stuck, it lifts off.
    m.stuck = false
    if (e.state === 'stun') e.y = Math.max(e.y, STUCK_Y)
  }
}

export const STORM_HORNET_QUEEN: MiniBossSpec<QueenMem> = {
  id: 'stormHornetQueen',
  sector: 'gale',
  nameKey: 'miniboss.stormHornetQueen',
  def: {
    kind: 'miniboss', hp: 480, dmg: 17, speed: 4, radius: 1.1, hitR: 1.25, aimY: 0, fly: HOVER,
    aggro: 30, range: [5, 9], xp: 170, bolts: [28, 40], cooldown: 1.6, tele: DIVE_TELE, unblockable: true, armor: 1,
    // Its glowing stinger, under the end of its abdomen.
    weak: { part: 'tail', up: -0.3, fwd: -0.98 * QUEEN_SCALE, side: 0, r: 0.38 },
    color: QUEEN_COLORS.main
  },
  build: () => buildStormHornetQueen(),
  behaviour: STORM_HORNET_QUEEN_AI
}
