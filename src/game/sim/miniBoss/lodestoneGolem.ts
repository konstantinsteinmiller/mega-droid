import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildLodestoneGolem, poseLodestoneGolem, newLodePose, LODE_COLORS, LODE_SCALE, LODE_SCRAP, LODE_HAND_UP, type LodePose
} from '../../models/miniBoss/lodestoneGolem'
import { TAU, faceTo, moveBody, distToPlayer, keepInRoom, inRoom, teleRing, near, ease } from './kit'
import { pushHud } from '../../state/hud'

/**
 * ─── The Lodestone Golem (Magnet Works) ──────────────────────────────────────
 *
 * A crate golem grown huge and magnetised: polar plates on its flanks,
 * horseshoe magnets for hands, a cloud of scrap orbiting it. It never
 * throws punches or homing horseshoes like the Magnet Master; it works the
 * FIELD — it hauls Flux in, knocks him away, and hurls its own scrap.
 *
 *  - PULL then SLAM (red: get out or slide). Both magnets swing up at Flux
 *    and red and blue field rings race inward across the floor round it
 *    (PULL_TELE); then the field drags him toward it for PULL_T at PULL_S —
 *    under his walk, so running away holds him and a slide breaks free. It
 *    heaves both magnets overhead at once (SLAM_TELE) while a red disc shows
 *    the reach of what comes next, and slams them down: a shockwave ring
 *    runs out across the floor to SLAM_R (slide through it, or be outside).
 *  - FLING (red: leave the marked spots). Its right arm winds back over its
 *    shoulder and the scrap bunches above the hand (FLING_TELE) while a red
 *    ring marks Flux's spot (and one either side); then the pieces fly, one
 *    after another, and crash down in the rings. A thrown piece is gone for
 *    SCRAP_REGROW s before the field gathers a new one.
 *
 * Under half health it pulls harder and flings five. Its entrance: crouched
 * dark in the middle of the room, it switches on — plates flare, the scrap
 * spirals in out of the corners to orbit it — and it stamps.
 */

export const INTRO_T = 2.4
/** The pull: wind-up (s), length (s), speed (m/s, under Flux's 4.7 walk),
 *  the field's reach drawn on the floor (m). */
export const PULL_TELE = 1.1
export const PULL_T = 1.6
export const PULL_S = 2.9
const PULL_FIELD = 9
/** The slam: wind-up (s), the shockwave's speed (m/s) and reach (m). */
export const SLAM_TELE = 0.8
export const SLAM_SPEED = 8
export const SLAM_R = 6
/** The fling: wind-up (s), the gap between pieces (s), their flight (s), the
 *  marked ring (m), how long a thrown piece is gone (s). */
export const FLING_TELE = 0.95
const FLING_GAP = 0.18
export const FLING_FLIGHT = 0.75
export const SCRAP_R = 1.25
const SCRAP_REGROW = 4.5
const SCRAP_ARC = 3.2

type Attack = 'pull' | 'slam' | 'fling'

interface Chunk {
  /** orbit → gather (over its hand) → fly → gone (regrowing) → orbit. */
  st: 'orbit' | 'gather' | 'fly' | 'gone'
  t: number
  /** Flight: from (world), to (world, the floor), its order in the volley. */
  fx: number
  fy: number
  fz: number
  tx: number
  tz: number
  n: number
}

export interface LodeMem {
  pose: LodePose
  attack: Attack | ''
  chunks: Chunk[]
  /** The fling's marked spots. */
  spots: Array<{ x: number; z: number }>
  /** Pieces launched so far in this fling. */
  thrown: number
  phase2: boolean
  /** The floor field of the pull (a child of its root, built on first use). */
  field: Group | null
  /** The field drawn on the floor right now (the tests read it). */
  fieldOn: boolean
  stamped: boolean
  side: number
}

const fy = (e: Enemy): number => e.floor ?? 0

const FIELD_RINGS = 4

const makeField = (e: Enemy): Group => {
  const g = new Group()
  for (let k = 0; k < FIELD_RINGS; k++) {
    const m = new Mesh(new RingGeometry(0.93, 1, 56), new MeshBasicMaterial({
      color: new Color(k % 2 ? LODE_COLORS.glowS : LODE_COLORS.glowN), transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    }))
    m.rotation.x = -Math.PI / 2
    m.renderOrder = 1
    g.add(m)
  }
  g.position.y = 0.05
  g.visible = false
  e.root.add(g)
  return g
}

/** The field rings: racing inward from the field's edge, brighter as `k` grows. */
const drawField = (m: LodeMem, k: number, time: number, speed: number): void => {
  const g = m.field
  if (!g) return
  g.visible = true
  m.fieldOn = true
  for (let i = 0; i < FIELD_RINGS; i++) {
    const ring = g.children[i] as Mesh
    const f = 1 - ((time * speed + i / FIELD_RINGS) % 1)
    ring.scale.setScalar(1.2 + f * (PULL_FIELD - 1.2))
    ;(ring.material as MeshBasicMaterial).opacity = (0.15 + 0.55 * k) * Math.min(1, (1 - f) * 4) * Math.min(1, f * 6)
  }
}

const hideField = (m: LodeMem): void => {
  if (m.field) m.field.visible = false
  m.fieldOn = false
}

const ready = (m: LodeMem): number => m.chunks.filter(c => c.st === 'orbit').length

const pick = (e: Enemy, m: LodeMem, d: number): Attack => {
  const want = m.phase2 ? 5 : 3
  // Close: it hauls him in; far, it throws (if it has the scrap for it).
  let a: Attack = Math.random() < (d > 7 ? 0.3 : d < 4 ? 0.7 : 0.5) ? 'pull' : 'fling'
  if (a === 'fling' && ready(m) < Math.min(3, want)) a = 'pull'
  // Never the same attack three times running.
  else if (a === m.attack && e.step >= 1) a = a === 'pull' ? 'fling' : 'pull'
  if (a === 'fling' && ready(m) === 0) a = 'pull'
  return a
}

const begin = (w: World, e: Enemy, m: LodeMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  e.teleRed = true
  if (a === 'pull') {
    e.teleDur = PULL_TELE
    m.field ??= makeField(e)
    w.sfx('alert', e.x, e.z)
  } else if (a === 'slam') {
    e.teleDur = SLAM_TELE
    // The reach of the shockwave, on the floor for the heave and the wave.
    w.markers.spawn(e.x, e.z, SLAM_R, SLAM_TELE + SLAM_R / SLAM_SPEED)
    w.sfx('charge2', e.x, e.z)
  } else {
    e.teleDur = FLING_TELE
    m.thrown = 0
    // Flux's spot and one either side of it (under half health, two more
    // beyond those), marked now: the marks do not follow him.
    const n = Math.min(ready(m), m.phase2 ? 5 : 3)
    const dx = w.player.x - e.x
    const dz = w.player.z - e.z
    const l = Math.hypot(dx, dz) || 1
    const sx = -dz / l
    const sz = dx / l
    m.spots = []
    const offs = [0, -2.3, 2.3, -4.4, 4.4]
    for (let k = 0; k < n; k++) {
      const [x, z] = inRoom(room, w.player.x + sx * offs[k]!, w.player.z + sz * offs[k]!, 0.8)
      m.spots.push({ x, z })
      w.markers.spawn(x, z, SCRAP_R, FLING_TELE + k * FLING_GAP + FLING_FLIGHT)
    }
    // The pieces it will throw leave their orbit for its hand.
    let left = n
    for (const c of m.chunks) if (left > 0 && c.st === 'orbit') { c.st = 'gather'; c.t = 0; left-- }
    w.sfx('charge1', e.x, e.z)
  }
}

/** The scrap's own clock: flights landing, thrown pieces growing back. */
const tickScrap = (w: World, e: Enemy, m: LodeMem, dt: number): void => {
  const y0 = fy(e)
  for (const c of m.chunks) {
    c.t += dt
    if (c.st === 'gone' && c.t >= SCRAP_REGROW) { c.st = 'orbit'; c.t = 0 }
    if (c.st !== 'fly' || c.t < FLING_FLIGHT) continue
    c.st = 'gone'
    c.t = 0
    w.shocks.spawn(c.tx, y0 + 0.06, c.tz, SCRAP_R, LODE_COLORS.glowN, 0.35)
    w.fx.sparks(c.tx, y0 + 0.3, c.tz, '#ffe07a', 12, 6, 0.2)
    w.sfx('bonk', c.tx, c.tz)
    if (e.state !== 'dead' && near(w, c.tx, c.tz, SCRAP_R)) {
      w.hitPlayer(e, Math.round(e.dmg * 0.8), { blockable: false, fromX: c.tx, fromZ: c.tz, kind: 'aoe' })
    }
  }
}

/** Throw the next gathered piece at the next marked spot. */
const launch = (w: World, e: Enemy, m: LodeMem): void => {
  const spot = m.spots[m.thrown]
  const c = m.chunks.find(q => q.st === 'gather')
  m.thrown++
  if (!spot || !c) return
  const s = LODE_SCALE
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  const [hx, hy, hz] = LODE_HAND_UP
  c.st = 'fly'
  c.t = 0
  c.fx = e.x + (hx * cy + hz * sy) * s
  c.fy = fy(e) + hy * s
  c.fz = e.z + (-hx * sy + hz * cy) * s
  c.tx = spot.x
  c.tz = spot.z
  w.sfx('lob', e.x, e.z)
}

export const LODESTONE_GOLEM_AI: MiniBossBehaviour<LodeMem> = {
  init: () => ({
    pose: newLodePose(), attack: '', spots: [], thrown: 0, phase2: false, field: null, fieldOn: false, stamped: false, side: 1,
    chunks: Array.from({ length: LODE_SCRAP }, (_, n) => ({ st: 'orbit' as const, t: 0, fx: 0, fy: 0, fz: 0, tx: 0, tz: 0, n }))
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    faceTo(e, w.player.x, w.player.z, 2, dt)
    // Crouched dark; it switches on at 0.8 s (the scrap spirals in, `pose`), stamps at 1.9 s.
    const on = e.st > 0.8 ? 1 : 0
    if (on && p.sleep > 0.98) {
      w.sfx('energy', e.x, e.z)
      pushHud({ t: 'flash', color: LODE_COLORS.south, strength: 0.15 })
    }
    p.sleep = on ? ease(p.sleep, 0, 3, dt) : 1
    p.heat = ease(p.heat, on ? 2 : 0.3, 4, dt)
    if (e.st > 1.9 && !m.stamped) {
      m.stamped = true
      w.shocks.spawn(e.x, fy(e) + 0.06, e.z, 3.5, LODE_COLORS.glowS, 0.5)
      w.shake(0.35)
      w.sfx('stomp', e.x, e.z)
    }
    p.slam = ease(p.slam, e.st > 1.75 && e.st < 2.2 ? 1 : 0, 10, dt)
    if (e.st >= INTRO_T) {
      p.sleep = 0
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    tickScrap(w, e, m, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: LODE_COLORS.north, strength: 0.25 })
    }
    let pull = 0
    let drag = 0
    let heave = 0
    let slam = 0
    let wind = 0
    let thr = 0
    let heat = 1
    let walk = 0
    switch (e.state) {
      case 'engage': {
        // A slow, heavy advance to mid range, edging round him.
        faceTo(e, w.player.x, w.player.z, 2.2, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side * 0.5
        let mz = nx * m.side * 0.5
        if (d > 6.5) { mx -= nx; mz -= nz } else if (d < 3.5) { mx += nx * 0.7; mz += nz * 0.7 }
        const ml = Math.hypot(mx, mz) || 1
        const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
        const got = moveBody(w, e, (mx / ml) * sp * dt, (mz / ml) * sp * dt)
        if (got < 0.3) m.side = -m.side
        walk = 1
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, true, 1.8)
        heat = 1 + 1.4 * k
        if (m.attack === 'pull') {
          pull = Math.min(1, k * 2)
          faceTo(e, w.player.x, w.player.z, 3, dt)
          drawField(m, k, e.st, 0.9)
          // Sparks of both poles drawn in off the floor.
          if (Math.random() < 0.5) {
            const a = Math.random() * TAU
            const r = 3 + Math.random() * 5
            w.fx.emit({
              x: e.x + Math.sin(a) * r, y: fy(e) + 0.2, z: e.z + Math.cos(a) * r, vx: -Math.sin(a) * 4, vz: -Math.cos(a) * 4,
              color: Math.random() < 0.5 ? LODE_COLORS.glowN : LODE_COLORS.glowS, size: 0.3, sizeEnd: 0.05, life: 0.5
            })
          }
        } else if (m.attack === 'slam') {
          heave = Math.min(1, k * 1.8)
          // The pull's lean lets go as the arms go up.
          pull = Math.max(0, 1 - k * 3)
        } else {
          wind = Math.min(1, k * 1.8)
          faceTo(e, w.player.x, w.player.z, 2.4, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'pull') {
            w.pull?.(e.x, e.z, PULL_S * (m.phase2 ? 1.15 : 1), PULL_T)
            w.sfx('energy', e.x, e.z)
          } else if (m.attack === 'slam') {
            w.spawnRing(e, e.x, e.z, SLAM_SPEED, SLAM_R, Math.round(e.dmg * 1.1), LODE_COLORS.glowS)
            w.shocks.spawn(e.x, fy(e) + 0.06, e.z, 2.2, LODE_COLORS.glowN, 0.3)
            w.fx.sparks(e.x, fy(e) + 0.3, e.z, '#ffe07a', 22, 8, 0.25)
            w.shake(0.5)
            w.sfx('stomp', e.x, e.z)
          }
        }
        break
      }
      case 'act': {
        if (m.attack === 'pull') {
          pull = 1
          drag = 1
          heat = 2.2
          faceTo(e, w.player.x, w.player.z, 2, dt)
          drawField(m, 1, e.st, 1.6)
          // The field's sparks streaming from him to it.
          if (Math.random() < 0.6) {
            const k = Math.random()
            w.fx.emit({
              x: w.player.x + (e.x - w.player.x) * k, y: fy(e) + 0.4 + Math.random() * 1.4, z: w.player.z + (e.z - w.player.z) * k,
              vx: (e.x - w.player.x) * 0.7, vz: (e.z - w.player.z) * 0.7,
              color: Math.random() < 0.5 ? LODE_COLORS.glowN : LODE_COLORS.glowS, size: 0.25, sizeEnd: 0.04, life: 0.35
            })
          }
          // The drag ends in the slam's heave, no pause between.
          if (e.st >= PULL_T) {
            hideField(m)
            begin(w, e, m, 'slam', room)
          }
        } else if (m.attack === 'slam') {
          slam = 1
          heat = 2
          if (e.st >= SLAM_R / SLAM_SPEED + 0.1) { e.state = 'recover'; e.st = 0 }
        } else {
          // One piece after another, each to its ring; over when the last has landed.
          thr = 1
          heat = 1.8
          while (m.thrown < m.spots.length && e.st >= m.thrown * FLING_GAP) launch(w, e, m)
          if (e.st >= (m.spots.length - 1) * FLING_GAP + FLING_FLIGHT + 0.05) {
            for (const c of m.chunks) if (c.st === 'gather') c.st = 'orbit'
            e.state = 'recover'
            e.st = 0
          }
        }
        break
      }
      case 'recover': {
        // Spent: it straightens slowly, its back turning last (its opening).
        faceTo(e, w.player.x, w.player.z, 1.2, dt)
        heat = 0.7
        if (e.st > (m.phase2 ? 0.8 : 1.05)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (!(e.state === 'tele' && m.attack === 'pull') && !(e.state === 'act' && m.attack === 'pull')) hideField(m)
    keepInRoom(e, room)
    const moved = Math.hypot(e.x - e.px, e.z - e.pz)
    p.walk = ease(p.walk, walk * Math.min(1, moved / Math.max(1e-4, dt) / 1.5), 8, dt)
    p.phase += moved * 2.6
    p.pull = ease(p.pull, pull, 10, dt)
    p.drag = ease(p.drag, drag, 10, dt)
    p.heave = ease(p.heave, heave, 10, dt)
    p.slam = ease(p.slam, slam, 18, dt)
    p.wind = ease(p.wind, wind, 9, dt)
    p.throw = ease(p.throw, thr, 14, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    tickScrap(w, e, m, dt)
    hideField(m)
    p.dying = Math.min(1, e.deathT / 1.1)
    for (const k of ['pull', 'drag', 'heave', 'slam', 'wind', 'throw', 'walk'] as const) p[k] = ease(p[k], 0, 8, dt)
    p.heat = ease(p.heat, 0.4 + Math.random() * 2, 12, dt)
    // The field fails: the scrap drops (pose), the plates spit sparks.
    if (Math.random() < dt * 14) {
      const s = Math.random() < 0.5 ? -1 : 1
      const a = e.yaw + (s * Math.PI) / 2
      w.fx.sparks(e.x + Math.sin(a) * 0.95, fy(e) + 1.6 + Math.random() * 0.4, e.z + Math.cos(a) * 0.95, s < 0 ? LODE_COLORS.glowN : LODE_COLORS.glowS, 8, 5, 0.2)
      w.shake(0.08)
    }
  },

  pose(e, m, time) {
    const p = m.pose
    p.time = time
    // The scrap: orbiting (spiralling in from the corners at its entrance),
    // gathered over its hand, in flight (world → its own frame), regrowing,
    // dropping as it dies.
    const s = LODE_SCALE
    const rx = e.root.position.x
    const ry = e.root.position.y
    const rz = e.root.position.z
    const cy = Math.cos(e.yaw)
    const sy = Math.sin(e.yaw)
    const wake = e.state === 'alert' ? Math.min(1, Math.max(0, (e.st - 0.8) / 1.1)) : 1
    for (const c of m.chunks) {
      const sp = p.scrap[c.n]!
      const a = time * 0.9 + (c.n / LODE_SCRAP) * TAU
      const r = 1.35 + (1 - wake) * (1 - wake) * 4.5
      let x = Math.sin(a) * r
      let y = 1.8 + 0.18 * Math.sin(time * 1.7 + c.n * 1.3) - (1 - wake) * 1.2
      let z = Math.cos(a) * r
      let size = 1
      if (c.st === 'gather') {
        const k = Math.min(1, c.t / 0.35)
        const [hx, hy, hz] = LODE_HAND_UP
        const o = c.n * 2.1
        x += (hx + Math.sin(o) * 0.25 - x) * k
        y += (hy + Math.cos(o) * 0.18 - y) * k
        z += (hz + Math.cos(o) * 0.25 - z) * k
      } else if (c.st === 'fly') {
        const k = Math.min(1, c.t / FLING_FLIGHT)
        const wx = c.fx + (c.tx - c.fx) * k - rx
        const wy = c.fy + (fy(e) + 0.25 - c.fy) * k + SCRAP_ARC * 4 * k * (1 - k) - ry
        const wz = c.fz + (c.tz - c.fz) * k - rz
        x = (wx * cy - wz * sy) / s
        y = wy / s
        z = (wx * sy + wz * cy) / s
        size = 1.25
      } else if (c.st === 'gone') {
        size = Math.max(0, Math.min(1, (c.t - (SCRAP_REGROW - 0.6)) / 0.6))
      }
      if (e.state === 'dead') {
        y = Math.max(0.12, y - e.deathT * e.deathT * 5)
      }
      // A piece not grown back yet waits shrunk inside the crate.
      const f = Math.min(1, size * 3)
      sp.x = x * f
      sp.y = 1.15 + (y - 1.15) * f
      sp.z = z * f
      sp.s = size
      sp.spin = time * (1.3 + (c.n % 3) * 0.6) + c.n
    }
    poseLodestoneGolem(e.rig, p)
  },

  clear(_w, _e, m) {
    hideField(m)
    // A stun or its death mid-fling: the field drops. The pieces in its hand
    // fall back into orbit, the ones in the air fizzle out harmlessly.
    for (const c of m.chunks) {
      if (c.st === 'gather') c.st = 'orbit'
      else if (c.st === 'fly') { c.st = 'gone'; c.t = 0 }
    }
  }
}

export const LODESTONE_GOLEM: MiniBossSpec<LodeMem> = {
  id: 'lodestoneGolem',
  sector: 'magnet',
  nameKey: 'miniboss.lodestoneGolem',
  def: {
    kind: 'miniboss', hp: 504, dmg: 17, speed: 2.2, radius: 1.15, hitR: 1.35, aimY: 1.6, fly: 0,
    aggro: 30, range: [3.5, 6.5], xp: 165, bolts: [26, 40], cooldown: 1.6, tele: PULL_TELE, unblockable: true, armor: 1,
    // Its core, in the socket on its back.
    weak: { part: 'back', up: 1.21 * LODE_SCALE, fwd: -0.55 * LODE_SCALE, side: 0, r: 0.3 },
    color: LODE_COLORS.south
  },
  build: () => buildLodestoneGolem(),
  behaviour: LODESTONE_GOLEM_AI
}
