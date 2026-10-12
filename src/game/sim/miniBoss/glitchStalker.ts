import type { Group } from 'three'
import type { Enemy, World } from '../world'
import type { Rig } from '../../models/kit'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import {
  buildGlitchStalker, poseGlitchStalker, newStalkerPose, holoStalker, STALKER_COLORS, type StalkerPose
} from '../../models/miniBoss/glitchStalker'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, roomBox, teleRing, near, ease, TAU } from './kit'
import { fxLayer, alignFx, FloorStrip } from './worldFx'
import { PLAYER_R } from '../constants'
import { pushHud } from '../../state/hud'

/**
 * ─── The Glitch Stalker (Blackout Boulevard) ─────────────────────────────────
 *
 * A Glow Stalker grown tall and gone wrong: it fights by NOT BEING WHERE
 * IT SEEMS — where the Neon Master throws blades and dashes, this one
 * blinks, splits and fills the floor with laser lines. Three moves:
 *
 *  - BLINK STRIKE (red: get out of the ring). It folds its blades and
 *    crouches, glitching (BLINK_TELE), while a red ring marks the floor next
 *    to Flux — the spot it will come back at; then it thins to a sliver
 *    and is gone (BLINK_GONE; shots fly through where it stood) and
 *    reappears on the ring with its blades swept through it.
 *  - DECOYS (orange). Blades flung wide, cape flaring (DECOY_TELE): two
 *    holograms slide out of it; then all three flicker and SHUFFLE. The
 *    holograms are see-through and flicker, have no outline and no shadow;
 *    the real one keeps its solid outline and its shadow. Each hologram
 *    raises its blade (DECOY_AIM, glowing at the tip) before it fires a weak
 *    shot, and pops on one hit; they fade after DECOY_LIFE.
 *  - LASER GRID (red). Both blades overhead, visor blazing (GRID_TELE):
 *    lines across the room light up dim on the floor; then they fire one
 *    after another, sweeping away from it across the room — stand between
 *    two. From half health the lines cross both ways: stand in a square.
 *
 * Its entrance: it flickers into being out of static (INTRO_T).
 */

export const INTRO_T = 2.4
/** The blink: wind-up (s), time gone (s), the ring's reach (m). */
export const BLINK_TELE = 0.95
export const BLINK_GONE = 0.45
export const SLASH_R = 2.1
/** The decoys: wind-up (s), how many, how long they stand (s), a decoy's
 *  wind-up before each shot (s), the time between its shots (s), its body. */
export const DECOY_TELE = 0.9
export const DECOYS = 2
export const DECOY_LIFE = 8
export const DECOY_AIM = 0.7
const DECOY_EVERY = 2.3
const DECOY_R = 0.65
const DECOY_SHOT_SPEED = 11
/** The grid: wind-up (s), the lines' spacing (m), half width (m), the time
 *  between lines firing (s) and how long each burns (s). */
export const GRID_TELE = 1.1
export const GRID_GAP = 3
export const GRID_HALF = 0.32
const GRID_STEP = 0.22
const GRID_ON = 0.3
const GRID_LINES = 14

type Attack = 'blink' | 'decoys' | 'grid'

export interface Decoy {
  x: number
  z: number
  yaw: number
  /** Its age (s), the clock to its next shot (s), its side round Flux. */
  t: number
  fire: number
  side: number
  alive: boolean
  /** Popped: the time it has been breaking up (s). */
  popT: number
  rig: Rig
  pose: StalkerPose
}

export interface GridLine {
  /** Along x (the line's z is fixed) or along z. */
  alongX: boolean
  at: number
  /** When it fires, after the act begins (s). */
  fireAt: number
  strip: FloorStrip
}

export interface StalkerMem {
  pose: StalkerPose
  attack: Attack | ''
  /** Where the blink comes back (the ring), and whether it is gone now. */
  bx: number
  bz: number
  gone: boolean
  decoys: Decoy[]
  grid: GridLine[]
  phase2: boolean
  side: number
  /** The world fx layer (`worldFx.ts`): lines and holograms, built at its entrance. */
  layer: Group | null
  strips: FloorStrip[]
  /** Attacks since the decoys last came out. */
  sinceDecoys: number
}

const fy = (e: Enemy): number => e.floor ?? 0

/** Its holograms and laser lines, built once (at its entrance, out of sight of the fight). */
const ensureFx = (e: Enemy, m: StalkerMem): void => {
  if (m.layer) return
  m.layer = fxLayer(e)
  for (let k = 0; k < DECOYS; k++) {
    const rig = buildGlitchStalker()
    holoStalker(rig)
    rig.root.visible = false
    m.layer.add(rig.root)
    m.decoys.push({ x: 0, z: 0, yaw: 0, t: 0, fire: 0, side: k === 0 ? -1 : 1, alive: false, popT: 9, rig, pose: newStalkerPose(1.7 + k * 2.9) })
  }
  for (let k = 0; k < GRID_LINES; k++) m.strips.push(new FloorStrip(m.layer, '#ff2d6a'))
}

const liveDecoys = (m: StalkerMem): number => m.decoys.filter(d => d.alive).length

const pick = (e: Enemy, m: StalkerMem, d: number): Attack => {
  if (liveDecoys(m) === 0 && m.sinceDecoys >= 2) return 'decoys'
  if (d > 8) return Math.random() < 0.7 ? 'blink' : 'grid'
  let a: Attack = Math.random() < 0.55 ? 'blink' : 'grid'
  if (a === m.attack && e.step >= 1) a = a === 'blink' ? 'grid' : 'blink'
  return a
}

/** The grid's lines: across the room, spaced GRID_GAP from a random start,
 *  firing in order away from it (both ways from half health). */
const layGrid = (e: Enemy, m: StalkerMem, room: Room): void => {
  const [x0, z0, x1, z1] = roomBox(room, 0)
  m.grid.length = 0
  const axes: boolean[] = m.phase2 ? [true, false] : [Math.random() < 0.5]
  let n = 0
  for (const alongX of axes) {
    // Lines along x stand at fixed z, swept from its side across.
    const lo = alongX ? z0 : x0
    const hi = alongX ? z1 : x1
    const mine = alongX ? e.z : e.x
    const off = 0.8 + Math.random() * (GRID_GAP - 1.6)
    const ats: number[] = []
    for (let a = lo + off; a < hi - 0.3; a += GRID_GAP) ats.push(a)
    ats.sort((p, q) => Math.abs(p - mine) - Math.abs(q - mine))
    ats.forEach((at, k) => {
      const strip = m.strips[n++]
      if (!strip) return
      if (alongX) strip.place(x0, at, x1, at, GRID_HALF * 2)
      else strip.place(at, z0, at, z1, GRID_HALF * 2)
      m.grid.push({ alongX, at, fireAt: k * GRID_STEP, strip })
    })
  }
}

const begin = (w: World, e: Enemy, m: StalkerMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  const tempo = m.phase2 ? 0.85 : 1
  e.teleRed = a !== 'decoys'
  if (a === 'blink') {
    e.teleDur = BLINK_TELE * tempo
    // The ring: beside Flux, on the far side from it (it comes at him from
    // where he is not looking), inside the room.
    const away = Math.atan2(w.player.x - e.x, w.player.z - e.z) + (Math.random() - 0.5) * 1.6
    const [x, z] = inRoom(room, w.player.x + Math.sin(away) * 1.3, w.player.z + Math.cos(away) * 1.3, 1.2)
    m.bx = x
    m.bz = z
    w.markers.spawn(x, z, SLASH_R, e.teleDur + BLINK_GONE + 0.05)
    w.sfx('vexGlitch', e.x, e.z)
  } else if (a === 'decoys') {
    e.teleDur = DECOY_TELE * tempo
    m.sinceDecoys = 0
    w.sfx('vexGlitch', e.x, e.z)
  } else {
    e.teleDur = GRID_TELE * tempo
    layGrid(e, m, room)
    w.sfx('alert', e.x, e.z)
  }
}

/** The decoys come out: two holograms beside it, then all three shuffle. */
const splitOff = (w: World, e: Enemy, m: StalkerMem, room: Room): void => {
  const to = Math.atan2(w.player.x - e.x, w.player.z - e.z)
  const spots: Array<[number, number]> = [[e.x, e.z]]
  for (const s of [-1, 1]) {
    spots.push(inRoom(room, e.x + Math.sin(to + s * Math.PI / 2) * 3.2, e.z + Math.cos(to + s * Math.PI / 2) * 3.2, 1))
  }
  // The shuffle: the real one takes any of the three spots.
  const real = Math.floor(Math.random() * 3)
  const y0 = fy(e)
  for (const [x, z] of spots) w.fx.sparks(x, y0 + 1.2, z, STALKER_COLORS.cyan, 14, 6, 0.2)
  const [rx, rz] = spots[real]!
  e.x = e.px = rx
  e.z = e.pz = rz
  let k = 0
  spots.forEach(([x, z], i) => {
    if (i === real) return
    const d = m.decoys[k++]
    if (!d) return
    d.x = x
    d.z = z
    d.yaw = to
    d.t = 0
    d.alive = true
    d.popT = 9
    // The two fire a beat apart, never together, never at once.
    d.fire = DECOY_AIM + 0.9 + k * 1.1
    d.rig.root.visible = true
  })
  w.sfx('beamIn', e.x, e.z)
}

const popDecoy = (w: World, e: Enemy, d: Decoy): void => {
  d.alive = false
  d.popT = 0
  w.fx.orbBurst(d.x, fy(e) + 1.2, d.z, STALKER_COLORS.cyan, 0.8)
  w.fx.sparks(d.x, fy(e) + 1.2, d.z, STALKER_COLORS.magenta, 16, 6, 0.2)
  w.sfx('vexGlitch', d.x, d.z)
}

/** The holograms: they circle Flux, raise a blade and fire, fade at the end. */
const tickDecoys = (w: World, e: Enemy, m: StalkerMem, room: Room, dt: number): void => {
  const y0 = fy(e)
  for (const d of m.decoys) {
    if (!d.alive) {
      d.popT += dt
      continue
    }
    d.t += dt
    if (d.t >= DECOY_LIFE) {
      popDecoy(w, e, d)
      continue
    }
    const dx = w.player.x - d.x
    const dz = w.player.z - d.z
    const dist = Math.hypot(dx, dz) || 1
    d.yaw = Math.atan2(dx, dz)
    // A slow circle round him, as the real one does.
    const sp = 1.6 * dt
    let mx = (-dz / dist) * d.side * sp
    let mz = (dx / dist) * d.side * sp
    if (dist < 4) { mx -= (dx / dist) * sp; mz -= (dz / dist) * sp }
    const [nx, nz] = inRoom(room, d.x + mx, d.z + mz, 1)
    d.x = nx
    d.z = nz
    d.fire -= dt
    d.pose.aim = ease(d.pose.aim, d.fire < DECOY_AIM ? 1 : 0, 10, dt)
    if (d.fire < DECOY_AIM && Math.random() < 0.6) {
      // The blade's tip gathers light: the shot is coming.
      const a = d.yaw + 0.35
      w.fx.emit({ x: d.x + Math.sin(a) * 0.5, y: y0 + 2.3, z: d.z + Math.cos(a) * 0.5, color: STALKER_COLORS.magenta, size: 0.3 + 0.5 * (1 - d.fire / DECOY_AIM), sizeEnd: 0.05, life: 0.12 })
    }
    if (d.fire <= 0) {
      d.fire = DECOY_EVERY
      const sx = d.x + Math.sin(d.yaw) * 0.6
      const sz = d.z + Math.cos(d.yaw) * 0.6
      const l = Math.hypot(w.player.x - sx, w.player.z - sz) || 1
      w.fireEnemyShot(e, sx, 1.5, sz, (w.player.x - sx) / l, 0, (w.player.z - sz) / l, DECOY_SHOT_SPEED, Math.round(e.dmg * 0.3))
      w.sfx('enemyShot', d.x, d.z)
    }
  }
}

/** The grid's lines: dim while it winds up, lit in their turn. */
const tickGrid = (w: World, e: Enemy, m: StalkerMem, k: number, act: number, dt: number): void => {
  for (const g of m.grid) {
    if (act < 0) {
      // The wind-up: dim, pulsing faster as it nears.
      g.strip.show(0.18 + 0.22 * k + 0.1 * Math.sin(e.st * (10 + 20 * k)), '#ff2d6a')
      continue
    }
    const on = act >= g.fireAt && act < g.fireAt + GRID_ON
    if (on) {
      g.strip.show(0.95, '#ffd6fb')
      if (act - dt < g.fireAt) {
        const [x, z] = g.alongX ? [w.player.x, g.at] : [g.at, w.player.z]
        w.fx.sparks(x, fy(e) + 0.2, z, STALKER_COLORS.magenta, 6, 4, 0.16)
      }
      if (!e.hitPlayer && Math.abs((g.alongX ? w.player.z : w.player.x) - g.at) < GRID_HALF + PLAYER_R) {
        e.hitPlayer = true
        const fx = g.alongX ? w.player.x : g.at
        const fz = g.alongX ? g.at : w.player.z
        w.hitPlayer(e, Math.round(e.dmg * 0.9), { blockable: false, fromX: fx, fromZ: fz, kind: 'aoe' })
      }
    } else g.strip.show(act < g.fireAt ? 0.3 : 0)
  }
}

const hideGrid = (m: StalkerMem): void => {
  for (const s of m.strips) s.hide()
  m.grid.length = 0
}

export const GLITCH_STALKER_AI: MiniBossBehaviour<StalkerMem> = {
  init: () => ({
    pose: newStalkerPose(), attack: '', bx: 0, bz: 0, gone: false, decoys: [], grid: [], phase2: false, side: 1,
    layer: null, strips: [], sinceDecoys: 1
  }),

  intro(w, e, m, _room, dt) {
    ensureFx(e, m)
    const p = m.pose
    const y0 = fy(e)
    faceTo(e, w.player.x, w.player.z, 4, dt)
    // Out of static: it flickers in and out, more in than out, then holds.
    const k = Math.min(1, e.st / 1.5)
    p.glitch = ease(p.glitch, e.st < 1.8 ? 1 : 0, 6, dt)
    e.rig.root.visible = k >= 1 || Math.random() < 0.25 + 0.75 * k
    if (k < 1 && Math.random() < 0.8) {
      w.fx.emit({ x: e.x + (Math.random() - 0.5) * 1.4, y: y0 + Math.random() * 2.4, z: e.z + (Math.random() - 0.5) * 1.4, color: Math.random() < 0.5 ? STALKER_COLORS.cyan : STALKER_COLORS.magenta, size: 0.25, sizeEnd: 0.05, life: 0.3 })
    }
    if (e.st > 1.5 && e.st - dt <= 1.5) w.sfx('vexGlitch', e.x, e.z)
    // Then the blades snap out wide: a pose.
    p.split = ease(p.split, e.st > 1.6 && e.st < INTRO_T - 0.3 ? 1 : 0, 8, dt)
    p.heat = ease(p.heat, 1 + p.split, 6, dt)
    if (e.st >= INTRO_T) {
      e.rig.root.visible = true
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    tickDecoys(w, e, m, room, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: STALKER_COLORS.magenta, strength: 0.25 })
    }
    let blink = 0
    let split = 0
    let grid = 0
    let slash = 0
    let glitch = 0
    let heat = 1
    switch (e.state) {
      case 'engage': {
        // Skate round him at mid range.
        faceTo(e, w.player.x, w.player.z, 5, dt)
        const nx = (e.x - w.player.x) / (d || 1)
        const nz = (e.z - w.player.z) / (d || 1)
        let mx = -nz * m.side
        let mz = nx * m.side
        if (d > 8) { mx -= nx; mz -= nz } else if (d < 4.5) { mx += nx; mz += nz }
        const ml = Math.hypot(mx, mz) || 1
        const sp = e.def.speed * (m.phase2 ? 1.15 : 1)
        if (moveBody(w, e, (mx / ml) * sp * dt, (mz / ml) * sp * dt) < 0.3) m.side = -m.side
        if (Math.random() < dt * 0.3) m.side = -m.side
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.4)
        heat = 1 + 1.4 * k
        if (m.attack === 'blink') {
          blink = Math.min(1, k * 1.8)
          glitch = k
          faceTo(e, m.bx, m.bz, 6, dt)
        } else if (m.attack === 'decoys') {
          split = Math.min(1, k * 1.6)
          glitch = 0.4 + 0.6 * k
          faceTo(e, w.player.x, w.player.z, 3, dt)
          // The holograms peel off it, left and right.
          if (Math.random() < 0.8) {
            const a = e.yaw + (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2
            const r = 3.2 * k
            w.fx.emit({ x: e.x + Math.sin(a) * r, y: fy(e) + 0.4 + Math.random() * 1.8, z: e.z + Math.cos(a) * r, color: STALKER_COLORS.cyan, size: 0.35, sizeEnd: 0.05, life: 0.25 })
          }
        } else {
          grid = Math.min(1, k * 1.6)
          tickGrid(w, e, m, k, -1, dt)
          faceTo(e, w.player.x, w.player.z, 3, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'blink') {
            // Gone: its body is already on the ring (its shadow shows there),
            // the model hidden until it strikes.
            m.gone = true
            e.rig.root.visible = false
            w.fx.sparks(e.x, fy(e) + 1.2, e.z, STALKER_COLORS.cyan, 18, 7, 0.2)
            w.sfx('beamOut', e.x, e.z)
            e.x = e.px = m.bx
            e.z = e.pz = m.bz
          } else if (m.attack === 'decoys') splitOff(w, e, m, room)
          else w.sfx('thunder', e.x, e.z)
        }
        break
      }
      case 'act': {
        if (m.attack === 'blink') {
          if (m.gone) {
            blink = 2
            if (e.st >= BLINK_GONE) {
              // Back, on the ring, blades through it.
              m.gone = false
              e.x = m.bx
              e.z = m.bz
              e.px = e.x
              e.pz = e.z
              keepInRoom(e, room)
              faceTo(e, w.player.x, w.player.z, 100, 1)
              e.rig.root.visible = true
              w.fx.orbBurst(e.x, fy(e) + 1.1, e.z, STALKER_COLORS.magenta, 0.9)
              w.shocks.spawn(e.x, fy(e) + 0.06, e.z, SLASH_R, STALKER_COLORS.magenta, 0.3)
              w.sfx('bladeWhoosh', e.x, e.z)
              if (near(w, e.x, e.z, SLASH_R)) {
                e.hitPlayer = true
                w.hitPlayer(e, Math.round(e.dmg * 1.15), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
              }
              e.st = 0
            }
          } else {
            slash = 1
            heat = 2
            if (e.st > 0.35) { e.state = 'recover'; e.st = 0 }
          }
        } else if (m.attack === 'decoys') {
          split = 1 - Math.min(1, e.st / 0.35)
          glitch = 1 - e.st / 0.35
          if (e.st > 0.35) { e.state = 'recover'; e.st = 0 }
        } else {
          grid = 1
          heat = 2.2
          tickGrid(w, e, m, 1, e.st, dt)
          const last = m.grid.reduce((t, g) => Math.max(t, g.fireAt), 0)
          if (e.st >= last + GRID_ON) {
            hideGrid(m)
            e.state = 'recover'
            e.st = 0
          }
        }
        break
      }
      case 'recover': {
        // A glitchy stagger: its opening.
        glitch = 0.5
        faceTo(e, w.player.x, w.player.z, 3, dt)
        if (e.st > (m.phase2 ? 0.65 : 0.9)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
          m.sinceDecoys++
        }
        break
      }
    }
    keepInRoom(e, room)
    const moved = Math.hypot(e.x - e.px, e.z - e.pz)
    if (moved < 2) {
      p.glide = ease(p.glide, Math.min(1, dt > 0 ? moved / dt / 4 : 0), 8, dt)
      p.wheel += moved / 0.34
    }
    p.blink = ease(p.blink, blink, 12, dt)
    p.split = ease(p.split, split, 10, dt)
    p.grid = ease(p.grid, grid, 10, dt)
    p.slash = ease(p.slash, slash, 16, dt)
    p.glitch = ease(p.glitch, glitch, 10, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    if (m.gone) { m.gone = false; e.rig.root.visible = true }
    for (const d of m.decoys) if (d.alive) popDecoy(w, e, d)
    hideGrid(m)
    p.dying = Math.min(1, e.deathT / 1.1)
    p.glitch = 1
    p.heat = ease(p.heat, 2.4, 6, dt)
    // It comes apart in static.
    if (Math.random() < dt * 14) {
      const a = Math.random() * TAU
      w.fx.orbBurst(e.x + Math.sin(a) * 0.5, fy(e) + 0.6 + Math.random() * 1.4, e.z + Math.cos(a) * 0.5, Math.random() < 0.5 ? STALKER_COLORS.cyan : STALKER_COLORS.magenta, 0.6)
      w.shake(0.08)
    }
  },

  pose(e, m, time) {
    m.pose.time = time
    poseGlitchStalker(e.rig, m.pose)
    if (!m.layer) return
    alignFx(e, m.layer)
    for (const d of m.decoys) {
      // A popped hologram breaks up in a quick flicker, then goes.
      const fading = !d.alive && d.popT < 0.25
      d.rig.root.visible = d.alive || fading
      if (!d.rig.root.visible) continue
      d.rig.root.position.set(d.x, 0, d.z)
      d.rig.root.rotation.y = d.yaw
      d.pose.time = time
      d.pose.glitch = fading ? 1 : 0.35
      d.pose.glide = 0.4
      d.pose.heat = 1.3 + d.pose.aim
      poseGlitchStalker(d.rig, d.pose)
      const flick = Math.sin(time * 37 + d.pose.seed * 5) > 0.75 ? 0.45 : 1
      const fade = d.alive ? Math.min(1, d.t / 0.3, (DECOY_LIFE - d.t) / 0.5) : 1 - d.popT / 0.25
      const mats = d.rig.mesh.material as Array<{ opacity: number }>
      mats[0]!.opacity = 0.42 * flick * fade
      mats[1]!.opacity = 0.85 * flick * fade
    }
  },

  clear(_w, e, m) {
    hideGrid(m)
    if (m.gone) {
      m.gone = false
      e.rig.root.visible = true
    }
    if (e.state === 'dead') for (const d of m.decoys) { d.alive = false; d.rig.root.visible = false }
  },

  shot(w, e, m, s) {
    if (m.gone) return 'pass'
    const y0 = fy(e)
    for (const d of m.decoys) {
      if (!d.alive) continue
      if (s.y < y0 + 0.1 || s.y > y0 + 2.5) continue
      if (Math.hypot(s.x - d.x, s.z - d.z) > DECOY_R + s.radius) continue
      popDecoy(w, e, d)
      return 'catch'
    }
  }
}

export const GLITCH_STALKER: MiniBossSpec<StalkerMem> = {
  id: 'glitchStalker',
  sector: 'neon',
  nameKey: 'miniboss.glitchStalker',
  def: {
    kind: 'miniboss', hp: 560, dmg: 18, speed: 3.8, radius: 0.75, hitR: 0.95, aimY: 1.35, fly: 0,
    aggro: 30, range: [4.5, 8], xp: 170, bolts: [26, 40], cooldown: 1.5, tele: BLINK_TELE, unblockable: true, armor: 1,
    // Its scanline visor.
    weak: { part: 'head', up: 1.9, fwd: 0.58, side: 0, r: 0.3 },
    color: STALKER_COLORS.magenta
  },
  build: () => buildGlitchStalker(),
  behaviour: GLITCH_STALKER_AI
}
