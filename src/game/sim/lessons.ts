import {
  Mesh, MeshBasicMaterial, RingGeometry, AdditiveBlending, DoubleSide, Color, type Scene, type Object3D
} from 'three'
import type { Enemy, Shot } from './world'
import type { MapData, Room } from '../world/levelGen'
import { CELL, cellCenter } from '../world/levelGen'
import { isSolidAt, hasLineOfSight, groundAt, type Nav } from '../world/nav'
import { profile, markTip } from '../state/profile'
import { buildTrainingTarget, TRAINING_DRONE, type TrainingTargetMesh } from '../models/props'
import { PAL } from '../models/palette'
import type { Crate } from './objectives'
import { createEnemy } from './enemies'
import { WEAPONS, type WeaponId } from '../data/weapons'
import type { Particles } from '../fx/particles'
import type { ShockRings } from '../fx/markers'
import type { PickupKind } from './world'
import { pushHud } from '../state/hud'
import { EYE_H } from './constants'

/**
 * ─── Mission lessons: one mechanic at a time, taught by a SCENE ──────────────
 *
 * The coach (`coach.ts`) teaches INPUTS. Some mechanics need a situation
 * built for them instead, so a new player meets each one once, in a setting
 * where it is the obvious thing to do — and no word is ever shown:
 *
 * 1. CHARGE. In the tutorial's start room a training drone hovers in front
 *    of the pad (a second one beside it, which the game itself pops with a
 *    charged shot right after the landing: `chargeShow.ts`). Quick shots
 *    skip off them; a charged shot pops it. The glyph — a looping demo: a finger (or the left
 *    mouse button) held down, the crosshair's rings filling, the shot growing,
 *    let go and it flies in (`ChargeDemo.vue`) — comes onto the drone once
 *    the player can move and look — the coach's first two glyphs — or at
 *    once when a quick shot skips off, and stays until it pops. Letting go
 *    too early shakes it, like a quick shot does, after a replay of the try.
 * 2. CRATES. Supply crates only break to charged shots. In the second room
 *    the player enters, once its machines are down, one crate glows and
 *    carries the same glyph. A quick shot bounces off it.
 * 3. THE SPECIAL WEAPON. In the first mission with a copied weapon slotted,
 *    as soon as a room is clear three drones beam in, asleep, in a row at
 *    exactly the spread of the weapon. The glyph is the weapon's key (1) and
 *    three guide lines fan out to them; one press takes all three.
 * 4. THE REPAIR GEL. Hurt, a gel carried, nothing fighting: the gel button
 *    pulses and wears its key (H) or a tapping finger, and a small glyph
 *    pours the gel into a heart that fills green. Using one pops the check.
 *    In the tutorial the walkthrough brings it on after the gel corridor's
 *    trap; elsewhere a player who never learned it gets it at the first calm
 *    moment under half health.
 *
 * Only one lesson is live at a time. Each is finished for good (a flag in
 * the save), and one that is ignored — the drones shot down with the buster
 * three times — retires instead of nagging. In the tutorial the walkthrough
 * (`walkthrough.ts`, the `guided` director) schedules the drone and the
 * crate itself, one room each, whatever the flags say: a replayed tutorial
 * is taught again. There nothing retires: each lesson holds a door shut
 * until it is done.
 */

export type LessonId = 'charge' | 'crate' | 'weapon' | 'gel'

/** What the HUD draws for the live lesson (positions come from `anchors`). */
export interface LessonView {
  id: LessonId
  /** Wrong tries so far (a quick shot off the bubble / the crate). The HUD
   *  shakes the glyph on each: "not like that — hold it". */
  nudge: number
  /** Just learned: a check pops on the subject, then the view goes. */
  done: boolean
  /** The weapon lesson: the slot's key and the weapon colour. */
  slot: 1 | 2
  color: string
}

export interface LessonHost {
  time: number
  map: MapData
  nav: Nav
  scene: Scene
  /** `y`: the feet on a terrain map (the climb, a stage); 0 or absent on a
   *  flat one. */
  player: { x: number; z: number; yaw: number; y?: number }
  enemies: Enemy[]
  fx: Particles
  shocks: ShockRings
  combat: { we: number; maxWe: number }
  setup: { tutorial?: boolean; enemyLevel: number }
  propParent(x: number, z: number): Object3D
  sfx(name: string, x?: number, z?: number): void
  shake(a: number): void
  crates(): Crate[]
  addCrate(x: number, z: number, yaw: number): Crate | null
  /** A room's crane delivers the crate (true), or nothing does. */
  craneDrop?(c: Crate): boolean
  /** A room's crane reaches over (x, z). */
  craneCovers?(x: number, z: number): boolean
  addEnemy(e: Enemy): void
  spawnPickup(kind: PickupKind, value: number, x: number, y: number, z: number): void
  weaponCost(id: WeaponId): number
  /** One hit of a copied weapon, at the player's current stats. */
  weaponDamage(id: WeaponId): number
}

const key = (id: LessonId) => `lesson:${id}`
export const lessonDone = (id: LessonId): boolean => profile.tips[key(id)] === true

/** How long the check stays on the subject after the lesson is learned. */
const DONE_HOLD = 1.1
/** A room must have been quiet this long before a lesson moves in. */
const CLEAR_SETTLE = 1.2
/** The weapon lesson gives up after being ignored this many times. */
const WEAPON_TRIES = 3
/** A taught lesson's drones come back this long after a try with the buster (s). */
const WEAPON_AGAIN = 1.5
/** The drone's glyph waits for the coach's move and look glyphs at most
 *  this long (s of play) before it comes in anyway. */
const REVEAL_AFTER = 10
/** On a terrain map a drone hovers only over a floor this close to the
 *  player's (m): a ledge above or a pit below is out of the lesson's reach. */
const DRONE_FLOOR = 0.6
/** The tutorial's crate lands this far (m) into the room from the edge of
 *  the exit's mouth (`crateAtExit`). */
const CRATE_BEFORE_EXIT = 2.5
/** Half-angle between Scrap Burst's outer shots (weapons.ts: spread 0.42). */
const SPREAD = 0.21
/** Outside the tutorial the gel lesson comes in under this much health (the
 *  coach's own tank glyph threshold). */
const GEL_AT = 0.5

interface TargetState {
  mesh: TrainingTargetMesh
  x: number
  z: number
  y: number
  alive: boolean
  hitT: number
}

/** The room a cell belongs to (−1 for doorways). */
export const roomAt = (map: MapData, x: number, z: number): number => {
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return -1
  return map.room[j * map.w + i] ?? -1
}

/** A room is clear when none of its own machines stands (sleeping or not)
 *  and nothing anywhere is fighting the player. */
export const roomClear = (enemies: Enemy[], roomId: number, combat: boolean): boolean =>
  // A sleeping crate golem is a crate until it is shot: a room with one in
  // it is quiet, or the crate lesson would wait on a machine nobody can see.
  !combat && !enemies.some(e => e.room === roomId && e.state !== 'dead' && !e.boss && !e.dormant)

/**
 * Where three drones can hover ahead of (px, pz, yaw): as a FAN, each exactly
 * one spread-angle apart as seen from the player, so one Scrap Burst aimed at
 * the middle one meets all three; or as a LINE for the piercing weapons.
 * Tries the view direction first, then turns toward the open side. Pure:
 * returns null when nothing fits. On a terrain map every drone must hover
 * over a floor within DRONE_FLOOR of the player's feet `py`: never over a
 * pit, never under a ledge (the line of sight is a grid walk, blind to it).
 */
export const droneRow = (
  nav: Nav, map: MapData, px: number, pz: number, yaw: number, layout: 'fan' | 'line' = 'fan', py = 0
): Array<[number, number]> | null => {
  const turns = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, Math.PI]
  for (const dy of turns) {
    const a = yaw + dy
    for (const d of [8, 7, 6, 5]) {
      const row: Array<[number, number]> = []
      for (const k of [-1, 0, 1]) {
        // A fan meets a spread weapon; a line (one behind the other) meets a
        // piercing one.
        const b = layout === 'fan' ? a - k * SPREAD : a
        const dd = layout === 'fan' ? d : d - 2 + k * 2
        const x = px - Math.sin(b) * dd
        const z = pz - Math.cos(b) * dd
        if (isSolidAt(nav, x, z) || roomAt(map, x, z) < 0) break
        // −∞ over a pit fails this too.
        if (map.terrain && !(Math.abs(groundAt(map, x, z) - py) <= DRONE_FLOOR)) break
        if (!hasLineOfSight(nav, px, pz, x, z)) break
        // Room to hover: nothing solid within a drone's radius.
        let free = true
        for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]] as const) {
          if (isSolidAt(nav, x + ox, z + oz)) { free = false; break }
        }
        if (!free) break
        row.push([x, z])
      }
      if (row.length === 3) return row
    }
  }
  return null
}

/** What the mission passes each step. */
export interface LessonTick {
  playing: boolean
  combat: boolean
  /** The coach's move and look glyphs are learned (the drone's cue). */
  controls: boolean
  /** Health 0..1 and Repair Gels carried (the gel lesson). */
  hp01?: number
  tanks?: number
}

/** Weapons whose shot runs level, low over the floor: their lesson drones
 *  hover at LOW_DRONE_Y (m) instead of a drone's usual height. */
export const LOW_SHOT: ReadonlySet<WeaponId> = new Set<WeaponId>(['flameWave', 'bubbleLance', 'galeGuard'])
export const LOW_DRONE_Y = 1

export class LessonDirector {
  private host: LessonHost
  /** The tutorial walkthrough schedules the drone and the crate itself. */
  private guided: boolean
  private target: TargetState | null = null
  /** The demo's drone beside it (`sim/demo.ts` pops this one; only the
   *  player's own pop teaches). */
  private demoTarget: TargetState | null = null
  private targetRoom = -1
  /** The drone's glyph is on (see REVEAL_AFTER). */
  private revealed = false
  private shotAtDrone = false
  private playT = 0
  private crate: Crate | null = null
  private crateRoom = -1
  private crateBroke = false
  private drones: Enemy[] = []
  private weaponRoom = -1
  private weaponUsed = false
  private weaponTries = 0
  /** A stage's beam-in lesson names its weapon (`teachWeapon`): the
   *  automatic room-by-room one stands down, and a try shot down with the
   *  buster brings the drones back instead of giving up. */
  private taught: { id: WeaponId; room: number; again: number } | null = null
  /** The weapon a lesson finished this mission with (the mission's cue). */
  weaponLearned: WeaponId | null = null
  private weaponRooms = new Set<number>()
  /** The gel lesson ran and ended this mission (learned, or — outside the
   *  tutorial — nothing left to repair); the walkthrough's gel door waits on
   *  it. */
  private gelEnd = false
  /** Since when the player has been calm, hurt and carrying a gel. */
  private gelCalm = -1
  /** Rooms in the order the player first walked into them. */
  readonly visited: number[] = []
  private clearSince = new Map<number, number>()
  private live: LessonId | null = null
  private nudge = 0
  private doneAt = -1
  private doneId: LessonId | null = null
  private donePos: [number, number, number] = [0, 0, 0]
  private ring: Mesh
  private ringMat: MeshBasicMaterial

  constructor(host: LessonHost, opts: { guided?: boolean } = {}) {
    this.host = host
    this.guided = !!opts.guided
    // The glow under a lesson's crate. Same material parameters as the
    // mission's walk marker, so it shares that (precompiled) program.
    this.ringMat = new MeshBasicMaterial({
      color: new Color(PAL.glowCyan), transparent: true, opacity: 0, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide, toneMapped: false
    })
    this.ring = new Mesh(new RingGeometry(0.95, 1.2, 40), this.ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.04
    this.ring.visible = false
    host.scene.add(this.ring)
  }

  /** The charge lesson's drone, placed at build time (so its materials are
   *  precompiled with the sector): in the start room, ahead of the pad. The
   *  tutorial's walkthrough calls it while its first room is still to learn,
   *  whatever the profile's flag says. */
  placeTarget(): void {
    const h = this.host
    if (!h.setup.tutorial || this.target) return
    const { x: sx, z: sz, yaw } = h.map.start
    const startRoom = roomAt(h.map, sx, sz)
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    // Straight ahead of the pad where possible, nudged sideways into the open
    // if a wall (and its pilasters, 0.3 m proud) would clip the bubble.
    const free = (x: number, z: number): boolean => {
      if (isSolidAt(h.nav, x, z) || roomAt(h.map, x, z) !== startRoom) return false
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        if (isSolidAt(h.nav, x + Math.cos(a) * 1.35, z + Math.sin(a) * 1.35)) return false
      }
      return hasLineOfSight(h.nav, sx, sz, x, z)
    }
    for (let d = 7; d >= 3.5; d -= 0.5) {
      let x = NaN
      let z = NaN
      for (const side of [0, 0.75, -0.75, 1.5, -1.5]) {
        const cx = sx + fx * d - fz * side
        const cz = sz + fz * d + fx * side
        if (free(cx, cz)) { x = cx; z = cz; break }
      }
      if (Number.isNaN(x)) continue
      const mesh = buildTrainingTarget()
      const y = EYE_H + 0.1
      mesh.root.position.set(x, y, z)
      h.propParent(x, z).add(mesh.root)
      this.target = { mesh, x, z, y, alive: true, hitT: 0 }
      this.targetRoom = startRoom
      // The demo's drone: a little to one side, the same distance out.
      for (const side of [2.4, -2.4, 3.2, -3.2]) {
        const bx = x - fz * side
        const bz = z + fx * side
        if (!free(bx, bz)) continue
        const bm = buildTrainingTarget()
        bm.root.position.set(bx, y, bz)
        h.propParent(bx, bz).add(bm.root)
        this.demoTarget = { mesh: bm, x: bx, z: bz, y, alive: true, hitT: 0 }
        break
      }
      return
    }
  }

  // ─── Events from the mission ───────────────────────────────────────────────

  /** A player shot vs. the training drone's bubble. */
  shotHits(s: Shot): 'hit' | 'deflect' | null {
    const d = this.demoTarget
    if (d?.alive) {
      const rd = 0.78 + s.radius
      if ((s.x - d.x) ** 2 + (s.y - d.y) ** 2 + (s.z - d.z) ** 2 <= rd * rd) {
        const h = this.host
        if (s.kind === 'pellet') {
          d.hitT = 1
          h.fx.sparks(s.x, s.y, s.z, PAL.glowCyan, 8, 5, 0.16)
          h.sfx('tink', d.x, d.z)
          return 'deflect'
        }
        d.alive = false
        d.mesh.root.visible = false
        h.fx.sparks(d.x, d.y, d.z, PAL.glowCyan, 22, 8, 0.22)
        h.fx.orbBurst(d.x, d.y, d.z, PAL.glowYellow, 0.9)
        h.fx.flash(d.x, d.y, d.z, '#ffffff', 1.6, 0.16)
        h.shake(0.15)
        h.sfx('explode', d.x, d.z)
        return 'hit'
      }
    }
    const t = this.target
    if (!t || !t.alive) return null
    const r = 0.78 + s.radius
    if ((s.x - t.x) ** 2 + (s.y - t.y) ** 2 + (s.z - t.z) ** 2 > r * r) return null
    const h = this.host
    if (s.kind === 'pellet') {
      // TINK: the bubble holds. The glyph comes in (if it was still waiting
      // for the coach's) and shakes — hold the button instead.
      t.hitT = 1
      this.shotAtDrone = true
      h.fx.sparks(s.x, s.y, s.z, PAL.glowCyan, 8, 5, 0.16)
      pushHud({ t: 'text', x: s.x, y: s.y + 0.3, z: s.z, key: 'combat.tink', color: '#dfe7ff' })
      h.sfx('tink', t.x, t.z)
      this.revealCharge()
      this.nudge++
      return 'deflect'
    }
    this.popTarget(t)
    return 'hit'
  }

  /** A quick shot bounced off a crate (objectives). */
  crateDeflected(c: Crate): void {
    if (this.live === 'crate' && c === this.crate) this.nudge++
  }

  /**
   * A hold let go before the first charge level, the lesson's subject in the
   * sights: the glyph shakes — "longer". (The press's own quick shot already
   * skipped off; this is the second half of the same try.)
   */
  earlyRelease(px: number, pz: number, yaw: number): void {
    if (!this.inSights(px, pz, yaw)) return
    if (this.target?.alive) this.revealCharge()
    if (this.live === 'charge' || this.live === 'crate') this.nudge++
  }

  private revealCharge(): void {
    if (!this.target?.alive) return
    // Never over another lesson that has the stage: the gel lesson's door waits
    // for a gel used WHILE it is live, and a training drone still up (a lesson
    // passed by its door some other way) took the stage from it for good.
    if (this.live && this.live !== 'charge') return
    this.revealed = true
    this.live = 'charge'
  }

  /** A special weapon fired (mission.fireWeapon, 'ok'). */
  weaponFired(): void {
    if (this.live === 'weapon') this.weaponUsed = true
  }

  /**
   * Light the Repair Gel lesson: the gel button pulses with its key or a
   * tapping finger, beside a gel pouring into a heart. The walkthrough calls
   * it once its trap has gone off (a gel is carried by then: the mission
   * grants one if none). False while another lesson has the stage.
   */
  startGel(): boolean {
    if (this.live) return this.live === 'gel'
    this.live = 'gel'
    this.nudge = 0
    return true
  }

  /** A Repair Gel was used (mission.useTank succeeded): learned. */
  gelUsed(): void {
    if (this.live !== 'gel') return
    const p = this.host.player
    this.gelEnd = true
    this.finish('gel', [p.x, EYE_H, p.z])
  }

  private popTarget(t: TargetState): void {
    const h = this.host
    t.alive = false
    t.mesh.root.visible = false
    h.fx.sparks(t.x, t.y, t.z, PAL.glowCyan, 22, 8, 0.22)
    h.fx.orbBurst(t.x, t.y, t.z, PAL.glowYellow, 0.9)
    h.fx.flash(t.x, t.y, t.z, '#ffffff', 1.6, 0.16)
    h.shocks.spawn(t.x, 0.05, t.z, 2.2, PAL.glowCyan, 0.4)
    h.shake(0.2)
    h.sfx('explode', t.x, t.z)
    for (let k = 0; k < 3; k++) h.spawnPickup('bolt', 3, t.x, t.y, t.z)
    this.finish('charge', [t.x, t.y, t.z])
  }

  private finish(id: LessonId, at: [number, number, number]): void {
    markTip(key(id))
    this.live = null
    this.nudge = 0
    this.doneId = id
    this.doneAt = this.host.time
    this.donePos = at
    this.ring.visible = false
    pushHud({ t: 'flash', color: '#8dff7a', strength: 0.18 })
  }

  // ─── Step ──────────────────────────────────────────────────────────────────

  update(dt: number, o: LessonTick): void {
    const h = this.host
    const p = h.player
    // Room bookkeeping: which rooms, in which order, and since when quiet.
    const here = roomAt(h.map, p.x, p.z)
    if (here >= 0 && !this.visited.includes(here)) this.visited.push(here)
    for (const id of this.visited) {
      if (roomClear(h.enemies, id, o.combat)) {
        if (!this.clearSince.has(id)) this.clearSince.set(id, h.time)
      } else this.clearSince.delete(id)
    }
    this.animate(dt)
    if (this.doneId && h.time - this.doneAt > DONE_HOLD) this.doneId = null
    if (!o.playing) return
    this.playT += dt

    // ── 1. Charge: while the drone hovers. Its glyph waits for the coach's
    // move and look (a phone player shown a finger on the drone first never
    // found the stick), for a quick shot off the bubble, or for REVEAL_AFTER. ──
    if (this.target?.alive) {
      if (o.controls || this.playT >= REVEAL_AFTER) this.revealCharge()
      return
    }
    // ── 4. The Repair Gel, while it is on: health back some other way (a
    // capsule, a level-up), or no gel left — nothing to teach right now.
    // Not in the tutorial: its gel door waits for a gel USED, so the lesson
    // stays until one is (the gel button takes one even at full health
    // while it runs, `Mission.useTank`). ──
    if (this.live === 'gel') {
      if (!this.guided && ((o.hp01 ?? 0) >= 1 || (o.tanks ?? 1) <= 0)) {
        this.live = null
        this.nudge = 0
        this.gelEnd = true
      }
      return
    }
    // …and outside the tutorial, for a player who never learned it: the
    // first calm moment under half health with a gel carried.
    if (!this.guided && this.live === null && !lessonDone('gel') && !o.combat
      && (o.hp01 ?? 1) < GEL_AT && (o.tanks ?? 0) > 0) {
      if (this.gelCalm < 0) this.gelCalm = h.time
      else if (h.time - this.gelCalm >= CLEAR_SETTLE) {
        this.gelCalm = -1
        this.startGel()
        return
      }
    } else this.gelCalm = -1
    // ── 2. Crates: the second room, once it is quiet (the walkthrough picks
    // the room itself in the tutorial) ──
    if (this.live === 'crate') {
      const c = this.crate
      if (!c || c.broken) {
        if (c) {
          this.crateBroke = true
          this.finish('crate', [c.x, 1.2, c.z])
        } else this.live = null
      }
      return
    }
    if (!this.guided && !lessonDone('crate') && this.visited.length >= 2 && this.live === null) {
      const room = this.visited[1]!
      if (this.settled(room) && !this.startCrate(room)) {
        // No floor to put one on: this room cannot teach it; the next one will.
        this.visited.splice(1, 1)
      }
      if (this.live) return
    }
    // ── 3. The special weapon: a quiet room, a row of sleeping drones ──
    if (this.live === 'weapon') {
      const standing = this.drones.filter(e => e.state !== 'dead')
      if (standing.length === 0) {
        const last = this.drones[1] ?? this.drones[0]
        if (this.weaponUsed) {
          this.finish('weapon', [last?.x ?? p.x, (last?.y ?? 1) + 0.6, last?.z ?? p.z])
          this.weaponLearned = this.taught?.id ?? this.weaponSlot()?.id ?? null
          this.taught = null
        } else if (this.taught) {
          // The taught lesson never gives up: the drones come back in a beat.
          this.live = null
          this.taught.again = h.time + WEAPON_AGAIN
        } else {
          // Shot down with the buster: not learned. Try again in a later room.
          this.weaponTries++
          this.live = null
          if (this.weaponTries >= WEAPON_TRIES) markTip(key('weapon'))
        }
        this.drones = []
      }
      return
    }
    const tw = this.taught
    if (tw && this.live === null && tw.again > 0 && h.time >= tw.again) {
      tw.again = 0
      const room = h.map.rooms[tw.room]
      const slot = this.slotOf(tw.id)
      if (room && slot) this.startWeapon(room, slot)
    }
    const slot = this.weaponSlot()
    if (slot && !this.taught && !lessonDone('weapon') && !h.setup.tutorial && this.live === null && here >= 0) {
      const room = h.map.rooms[here]
      if (room && room.role !== 'start' && room.role !== 'boss' && !this.weaponRooms.has(here) && this.settled(here)) {
        this.weaponRooms.add(here)
        this.startWeapon(room, slot)
      }
    }
  }

  /** Teach `id` here and now (a stage's beam-in room): its drones beam in
   *  ahead of Flux. False when it is not slotted or no row fits. */
  teachWeapon(roomId: number, id: WeaponId): boolean {
    const room = this.host.map.rooms[roomId]
    const slot = this.slotOf(id)
    if (!room || !slot) return false
    this.taught = { id, room: roomId, again: 0 }
    this.weaponRooms.add(roomId)
    this.startWeapon(room, slot)
    return this.live === 'weapon'
  }

  /** The slot a weapon sits in (1 or 2), if it is slotted. */
  private slotOf(id: WeaponId): { slot: 1 | 2; id: WeaponId } | null {
    const s = profile.hero.slots
    if (s[0] === id) return { slot: 1, id }
    if (s[1] === id) return { slot: 2, id }
    return null
  }

  /** The taught weapon lesson's drones are up (the room's subject). */
  get weaponDronesAt(): { readonly x: number; readonly y: number; readonly z: number } | null {
    const e = this.drones.find(d => d.state !== 'dead')
    return e ? { x: e.x, y: e.y + (e.floor ?? 0) + e.def.aimY, z: e.z } : null
  }

  private settled(room: number): boolean {
    const since = this.clearSince.get(room)
    return since !== undefined && this.host.time - since >= CLEAR_SETTLE
  }

  /** The slot key that fires a copied weapon (1 first). */
  private weaponSlot(): { slot: 1 | 2; id: WeaponId } | null {
    const s = profile.hero.slots
    if (s[0]) return { slot: 1, id: s[0] }
    if (s[1]) return { slot: 2, id: s[1] }
    return null
  }

  /** Light the crate lesson in `roomId` (the walkthrough calls it for the
   *  tutorial's crate room). False when the room has no crate and no free
   *  floor in sight to beam one onto. */
  startCrate(roomId: number, exitDoor = -1): boolean {
    if (this.live) return this.live === 'crate' && this.crateRoom === roomId
    const h = this.host
    const p = h.player
    // An intact crate of that room, nearest first; else one is brought in.
    let best: Crate | null = null
    let bestD = Infinity
    for (const c of h.crates()) {
      if (c.broken || c.kind !== 'crate' || roomAt(h.map, c.x, c.z) !== roomId) continue
      const d = Math.hypot(c.x - p.x, c.z - p.z)
      if (d < bestD) { best = c; bestD = d }
    }
    // Its crate was broken already (a charged shot before the lesson lit):
    // that counts, the lesson finishes at once instead of beaming in another.
    if (!best) {
      const gone = h.crates().find(c => c.broken && c.kind === 'crate' && roomAt(h.map, c.x, c.z) === roomId)
      if (gone) {
        this.crate = gone
        this.crateRoom = roomId
        this.live = 'crate'
        return true
      }
    }
    if (!best) best = (exitDoor >= 0 ? this.crateAtExit(roomId, exitDoor) : null) ?? this.bringCrate(roomId)
    if (!best) return false
    this.crate = best
    this.crateRoom = roomId
    this.live = 'crate'
    this.nudge = 0
    this.ring.position.set(best.x, 0.04, best.z)
    this.ring.visible = true
    return true
  }

  /**
   * The tutorial's crate, where the room had none (playtest 2026-10-07):
   * the crane sets it down in front of the way out — after the room's fight
   * and the hologram crate, the player walks to that door and cannot miss
   * it. CRATE_BEFORE_EXIT into the room from the exit's mouth, on its axis,
   * under the crane's reach where it can be. Null with no such floor.
   */
  private crateAtExit(roomId: number, doorId: number): Crate | null {
    const h = this.host
    const room = h.map.rooms[roomId]
    const d = h.map.doors[doorId]
    if (!room || !d) return null
    const ox = cellCenter(d.i)
    const oz = cellCenter(d.j)
    // The mouth: the room's floor cell nearest the exit door.
    let mx = 0
    let mz = 0
    let near = Infinity
    for (const [i, j] of room.spots) {
      const l = Math.hypot(cellCenter(i) - ox, cellCenter(j) - oz)
      if (l < near) { near = l; mx = cellCenter(i); mz = cellCenter(j) }
    }
    if (!Number.isFinite(near)) return null
    // Into the room: from the door through the mouth.
    const il = Math.hypot(mx - ox, mz - oz) || 1
    const ux = (mx - ox) / il
    const uz = (mz - oz) / il
    const props = h.crates()
    const p = h.player
    let pick: [number, number] | null = null
    let pickScore = Infinity
    for (let along = 0.5; along <= 4.5; along += 0.5) {
      for (const off of [0, 0.75, -0.75, 1.5, -1.5]) {
        const x = mx + ux * (along - CELL / 2) - uz * off
        const z = mz + uz * (along - CELL / 2) + ux * off
        if (isSolidAt(h.nav, x, z) || roomAt(h.map, x, z) !== roomId) continue
        let open = true
        for (let k = 0; k < 8 && open; k++) {
          const a = (k / 8) * Math.PI * 2
          if (isSolidAt(h.nav, x + Math.cos(a) * 0.8, z + Math.sin(a) * 0.8)) open = false
        }
        if (!open || props.some(c => !c.broken && Math.hypot(c.x - x, c.z - z) < 1.6)) continue
        if (Math.hypot(x - p.x, z - p.z) < 1.5) continue
        const score = Math.abs(along - CRATE_BEFORE_EXIT) + Math.abs(off) + (h.craneCovers && !h.craneCovers(x, z) ? 5 : 0)
        if (score < pickScore) { pick = [x, z]; pickScore = score }
      }
    }
    if (!pick) return null
    const c = h.addCrate(pick[0], pick[1], Math.atan2(ox - pick[0], oz - pick[1]))
    if (c && !h.craneDrop?.(c)) {
      h.fx.riseRing(c.x, 0.1, c.z, PAL.glowCyan, 0.8, 18)
      h.sfx('beamIn', c.x, c.z)
    }
    return c
  }

  /** A crate for the lesson where the room had none: on a free interior
   *  cell the player can see, a few metres away. */
  private bringCrate(roomId: number): Crate | null {
    const h = this.host
    const room = h.map.rooms[roomId]
    if (!room) return null
    const p = h.player
    const props = h.crates()
    let pick: [number, number] | null = null
    let pickScore = Infinity
    for (const [i, j] of room.spots) {
      const x = cellCenter(i)
      const z = cellCenter(j)
      const d = Math.hypot(x - p.x, z - p.z)
      if (d < 3 || isSolidAt(h.nav, x, z) || !hasLineOfSight(h.nav, p.x, p.z, x, z)) continue
      if (props.some(c => !c.broken && Math.hypot(c.x - x, c.z - z) < 1.6)) continue
      const score = Math.abs(d - 5)
      if (score < pickScore) { pick = [x, z]; pickScore = score }
    }
    if (!pick) return null
    const c = h.addCrate(pick[0], pick[1], Math.atan2(p.x - pick[0], p.z - pick[1]))
    // The room's crane brings it down (#114); else it beams in.
    if (c && !h.craneDrop?.(c)) {
      h.fx.riseRing(c.x, 0.1, c.z, PAL.glowCyan, 0.8, 18)
      h.sfx('beamIn', c.x, c.z)
    }
    return c
  }

  private startWeapon(room: Room, w: { slot: 1 | 2; id: WeaponId }): void {
    const h = this.host
    const p = h.player
    const layout = w.id === 'flameWave' || w.id === 'iceLance' ? 'line' : 'fan'
    const py = h.map.terrain ? p.y ?? 0 : 0
    const row = droneRow(h.nav, h.map, p.x, p.z, p.yaw, layout, py)
    if (!row) return
    // One hit of the weapon takes a drone (through its armour); enough
    // energy for a few tries.
    const dmg = h.weaponDamage(w.id)
    this.drones = row.map(([x, z]) => {
      // The training blue: harmless, there only to take the shots.
      const e = createEnemy('heli', h.setup.enemyLevel, x, z, room.id, { colors: TRAINING_DRONE })
      e.hold = true
      e.hp = e.maxHp = Math.min(e.maxHp, Math.max(1, Math.floor(dmg * (e.def.armor ?? 1) * 0.9)))
      e.yaw = Math.atan2(p.x - x, p.z - z)
      // On a terrain map the drone hovers over its own floor (as the climb's
      // cast does, `sim/climbSpawn.ts`), in a band that keeps it there. For a
      // weapon that fires level along the floor it skims low: at its usual
      // height the Flame Wave rolled under every drone and the lesson could
      // never be finished.
      const f = h.map.terrain ? groundAt(h.map, x, z) : 0
      const low = LOW_SHOT.has(w.id) ? LOW_DRONE_Y - e.def.fly : 0
      if (h.map.terrain || low) {
        e.floor = f + low
        e.hover = [f + low, f + low]
      }
      h.addEnemy(e)
      h.fx.riseRing(x, f + 0.1, z, WEAPONS[w.id].color, 0.7, 16)
      return e
    })
    h.sfx('beamIn', row[1]![0], row[1]![1])
    h.combat.we = Math.min(h.combat.maxWe, Math.max(h.combat.we, h.weaponCost(w.id) * 3))
    this.weaponUsed = false
    this.weaponRoom = room.id
    this.live = 'weapon'
    this.nudge = 0
  }

  private animate(dt: number): void {
    const h = this.host
    for (const t of [this.target, this.demoTarget]) this.animateTarget(t, dt)
    if (this.ring.visible) {
      const k = (h.time * 0.9) % 1
      this.ring.scale.setScalar(0.85 + k * 0.4)
      this.ringMat.opacity = 0.7 * (1 - k)
    }
  }

  private animateTarget(t: TargetState | null, dt: number): void {
    const h = this.host
    if (t?.alive) {
      const m = t.mesh
      t.hitT = Math.max(0, t.hitT - dt * 4)
      m.root.position.y = t.y + Math.sin(h.time * 2.1) * 0.08
      m.body.rotation.y = Math.atan2(h.player.x - t.x, h.player.z - t.z)
      m.body.rotation.z = Math.sin(h.time * 1.3) * 0.08
      for (const r of m.rotors) r.rotation.y += dt * 14
      // A quick shot's knock: the drone jolts back a touch.
      m.body.scale.setScalar(1 - t.hitT * 0.06)
    }
  }

  // ─── What the HUD reads ────────────────────────────────────────────────────

  /** The live lesson (or the one that just ended, for its check). */
  view(): LessonView | null {
    const id = this.live ?? this.doneId
    if (!id) return null
    const w = this.weaponSlot()
    return {
      id,
      nudge: this.nudge,
      done: !this.live,
      slot: w?.slot ?? 1,
      color: w ? WEAPONS[w.id].color : '#ffffff'
    }
  }

  /** A lesson is on screen: the coach keeps to survival glyphs meanwhile. */
  get active(): boolean {
    return this.live !== null
  }

  /**
   * The lesson has the player's eyes: its subject is on screen. The coach
   * keeps to survival glyphs only then — a player who has not found the
   * camera yet still gets the look glyph while the subject is off screen.
   */
  focus(px: number, pz: number, yaw: number): boolean {
    // The gel's subject is a HUD button: it has the eyes wherever they look.
    if (this.live === 'gel') return true
    if (this.live === 'weapon') {
      return this.drones.some(e => {
        if (e.state === 'dead') return false
        let a = Math.atan2(-(e.x - px), -(e.z - pz)) - yaw
        while (a > Math.PI) a -= Math.PI * 2
        while (a < -Math.PI) a += Math.PI * 2
        return Math.abs(a) < 0.8
      })
    }
    return this.live !== null && this.inSights(px, pz, yaw)
  }

  /**
   * The lesson's subject is roughly in front of the player. Presses then mean
   * FIRE (a touch press, an uncaptured click): otherwise, with no machine in
   * sight, a press is a look or a walk-to tap — and the charge could not be
   * learned on the very thing that teaches it. The drone counts before its
   * glyph is up too: a tap on it is a shot, and the TINK brings the glyph.
   */
  inSights(px: number, pz: number, yaw: number): boolean {
    const t = this.target?.alive ? this.target : this.live === 'crate' ? this.crate : null
    if (!t) return false
    const d = Math.hypot(t.x - px, t.z - pz)
    if (d > 25) return false
    let a = Math.atan2(-(t.x - px), -(t.z - pz)) - yaw
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return Math.abs(a) < 0.6
  }

  /** World points the glyph attaches to, as x, y, z triples in `out`
   *  (room for three); returns how many. Per frame, so nothing allocates. */
  anchors(out: Float32Array): number {
    const put = (n: number, x: number, y: number, z: number): number => {
      out[n * 3] = x
      out[n * 3 + 1] = y
      out[n * 3 + 2] = z
      return n + 1
    }
    if (!this.live) {
      if (!this.doneId) return 0
      return put(0, this.donePos[0], this.donePos[1], this.donePos[2])
    }
    if (this.live === 'charge' && this.target) {
      return put(0, this.target.x, this.target.mesh.root.position.y, this.target.z)
    }
    if (this.live === 'crate' && this.crate) return put(0, this.crate.x, 1.25, this.crate.z)
    if (this.live === 'weapon') {
      let n = 0
      for (const e of this.drones) {
        if (e.state !== 'dead' && n < 3) n = put(n, e.x, e.y + e.def.aimY, e.z)
      }
      return n
    }
    return 0
  }

  /**
   * The player stands in the room of the live lesson's subject. The HUD's
   * off-screen bubble shows only then: an edge marker pointing out of the
   * room read as "go this way", and pulled two blind testers back to the pad.
   * Per frame, allocation-free.
   */
  inRoom(px: number, pz: number): boolean {
    const here = roomAt(this.host.map, px, pz)
    if (here < 0) return false
    if (this.live === 'charge') return here === this.targetRoom
    if (this.live === 'crate') return here === this.crateRoom
    if (this.live === 'weapon') return here === this.weaponRoom
    return false
  }

  /** A floor glow under a scripted scene's subject — the walkthrough's chest
   *  — or off. The crate lesson's own glow wins while it runs. */
  spotlight(x: number, z: number, on: boolean): void {
    if (this.live === 'crate') return
    this.ring.position.set(x, 0.04, z)
    this.ring.visible = on
  }

  /** The demo's drone, while it hovers (the charge demo aims at it). */
  get demoTargetAt(): { readonly x: number; readonly y: number; readonly z: number } | null {
    return this.demoTarget?.alive ? this.demoTarget : null
  }

  /** The player's drone, while it hovers (the card's spotlight). */
  get targetAt(): { readonly x: number; readonly y: number; readonly z: number } | null {
    return this.target?.alive ? this.target : null
  }

  /**
   * Auto-aim at the training drones: the hovering one nearest the crosshair
   * within `cone` (rad) of the view — the shot flies at it like at a machine
   * (they are not machines, so the lock-on never found them). Null: none.
   */
  aimTarget(px: number, pz: number, yaw: number, cone: number): { readonly x: number; readonly y: number; readonly z: number } | null {
    let best: TargetState | null = null
    let bestA = cone
    for (const t of [this.target, this.demoTarget]) {
      if (!t?.alive) continue
      if (Math.hypot(t.x - px, t.z - pz) > 25) continue
      let a = Math.atan2(-(t.x - px), -(t.z - pz)) - yaw
      while (a > Math.PI) a -= Math.PI * 2
      while (a < -Math.PI) a += Math.PI * 2
      if (Math.abs(a) < bestA) { bestA = Math.abs(a); best = t }
    }
    return best
  }

  /** A quick shot has bounced off the training drone's bubble (the charge
   *  lesson need not wait for a step toward it). */
  get droneShot(): boolean {
    return this.shotAtDrone
  }

  /** The training drone still hovers (the walkthrough's first gate). */
  get droneUp(): boolean {
    return !!this.target?.alive
  }

  /** Where the training drone hovers, while it does (the walkthrough's goal). */
  get droneAt(): { readonly x: number; readonly z: number } | null {
    return this.target?.alive ? this.target : null
  }

  /** The crate lesson's crate broke this mission (the walkthrough's second gate). */
  get crateBroken(): boolean {
    return this.crateBroke
  }

  /** The crate lesson's crate while that lesson runs (the walkthrough's goal). */
  get crateAt(): { readonly x: number; readonly z: number } | null {
    return this.live === 'crate' ? this.crate : null
  }

  /** The crate lesson's room (tests). */
  get lessonRoom(): number {
    return this.crateRoom
  }

  /** A special-weapon lesson is on (its Weapon Energy never runs dry, #125). */
  get weaponLive(): boolean {
    return this.live === 'weapon'
  }

  /** A shooting lesson is on: the charge drone, the crate, the chest. */
  get shootLive(): boolean {
    return this.live === 'charge' || this.live === 'crate'
  }

  /** The Repair Gel lesson is on screen (the coach drops its own tank glyph). */
  get gelLive(): boolean {
    return this.live === 'gel'
  }

  /** The gel lesson ran and ended this mission (the walkthrough's gel door). */
  get gelEnded(): boolean {
    return this.gelEnd
  }
}
