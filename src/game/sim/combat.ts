import { sceneQuality } from '../engine/quality'
import {
  Sprite, SpriteMaterial, AdditiveBlending, Color, Mesh, MeshBasicMaterial, SphereGeometry, Group, type Scene
} from 'three'
import type { Enemy, Shot, World, Pickup, PickupKind } from './world'
import type { PlayerStats } from './stats'
import { glowTexture } from '../world/textures'
import { SHOT_LOOK, CHARGE_AURA, buildAura, tintAura, poseAura, type ChargeKind } from '../fx/chargedShot'
import { hasLineOfSight, floorAt } from '../world/nav'
import { PARRY_WINDOW, wake, golemShielded, wakeGolem, ROCK_G, tryStun } from './enemies'
import { Rubble } from '../fx/rubble'
import { pushHud } from '../state/hud'
import { incomingShot } from '../state/damageFeed'
import { buildBolt, buildCapsule } from '../models/props'
import { BASE_COLORS } from '../models/enemies'
import { PLAYER_R, EYE_H } from './constants'
import { scaleXp } from '../data/enemies'
import { COUNTER, type BossDef } from '../data/bosses'
import { weakSpotAt, WEAK_SPOT_MUL } from '../data/weakspots'

/** Scratch for a weak spot's position. */
const _weak = { x: 0, y: 0, z: 0, r: 0 }

/**
 * ─── Shots, damage, pickups ──────────────────────────────────────────────────
 *
 * Every projectile in the mission (player pellets and charge shots, enemy
 * bullets, lobbed shells, reflected shots) lives in one pool, as does every
 * pickup. Damage in both directions is resolved here so the rules — guards,
 * crits, block, parry, i-frames — have exactly one home.
 */

export interface CombatHost extends World {
  /** A machine's shot ended on geometry (the boss arena counts these). */
  onShotBlocked?(s: Shot): void
  scene: Scene
  stats: PlayerStats
  hitStop: number
  onEnemyKilled(e: Enemy, xp: number): void
  onPickup(kind: PickupKind, value: number): void
  onPlayerHurt(amount: number): void
  onPlayerDown(): void
  /** Breakable props (crates / barrels): true if the shot struck one.
   *  `charge` is the shot's charge level (0 = a quick shot). */
  shotHitsProp?(x: number, y: number, z: number, r: number, dmg: number, charge: number): boolean
  /** A lesson's subject (the training drone): struck, turned away, or missed. */
  shotHitsLesson?(s: Shot): 'hit' | 'deflect' | null
  /** A player shot bounced off a guard (TINK). */
  onDeflect?(): void
  /** A stage's targets on the walls (a secret's buttons, `sim/secrets.ts`),
   *  tested along the shot's step before the wall stops it: true if one
   *  caught the shot (it ends there). */
  shotHitsStage?(s: Shot): boolean
}

/** Height of the player's feet: the climb's floors (`nav.floorAt`, and an
 *  enemy's `floor`) lift everything aimed at him; 0 on a flat map. */
const feetOf = (h: World): number => h.player.y ?? 0

const sphereGeo = new SphereGeometry(1, 12, 8)

/** How charged a player shot is: 0 for a quick pellet; a copied weapon's
 *  shots and reflected shots count as charged. */
/** The Drill Bomb's burst: its reach (m) and the share of its damage the
 *  machines round it take. */
const DRILL_BLAST = 2.5
const DRILL_SPLASH = 0.6
/** The Neon Blade's flight left (s) when it turns back. */
const BLADE_TURN = 0.4

const chargeLevel = (s: Shot): number =>
  s.weapon === 'drillBomb' ? 2 : s.kind === 'charge3' ? 3 : s.kind === 'charge2' || s.kind === 'reflect' ? 2 : s.kind === 'charge1' || s.weapon ? 1 : 0

/** A wall of fire / wind sliding along the floor (boss attack — slide past it). */
interface Wave {
  active: boolean
  x: number
  z: number
  dx: number
  dz: number
  speed: number
  hw: number
  travel: number
  range: number
  dmg: number
  hit: boolean
  color: string
  source: Enemy
}

/** An expanding shock ring on the floor (boss attack — slide through it). */
interface RingHazard {
  active: boolean
  x: number
  z: number
  r: number
  speed: number
  maxR: number
  dmg: number
  hit: boolean
  color: string
  source: Enemy
}

/** Low-quality devices get half the special weapons' trail particles. */
const LOW_FX = sceneQuality() === 'low'

export class CombatSystem {
  shots: Shot[] = []
  pickups: Pickup[] = []
  waves: Wave[] = []
  rings: RingHazard[] = []
  readonly root = new Group()
  /** Crate golems' stones in flight and their debris. */
  readonly rubble: Rubble
  private host: CombatHost

  constructor(host: CombatHost) {
    this.host = host
    host.scene.add(this.root)
    this.rubble = new Rubble(this.root)
    // A golem reads the shots in flight to see a charge coming (World.shots)
    host.shots = this.shots
  }

  // ─── Shot pool ─────────────────────────────────────────────────────────────

  private acquire(): Shot {
    let s = this.shots.find(x => !x.active)
    if (!s) {
      const glowMat = new SpriteMaterial({ map: glowTexture(), color: new Color('#ffffff'), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
      const sprite = new Sprite(glowMat)
      sprite.renderOrder = 6
      const core = new Mesh(sphereGeo, new MeshBasicMaterial({ color: new Color('#ffffff'), toneMapped: false }))
      this.root.add(sprite, core)
      s = {
        active: false, owner: 'player', kind: 'pellet', x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
        dmg: 0, crit: false, radius: 0.1, life: 0, pierce: 0, hitIds: [], homing: null, turn: 0, source: null,
        blockable: true, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, t: 0, dur: 0, color: '#ffffff', sprite, core,
        element: 'none', weapon: '', homePlayer: false, destructible: false, burn: 0, freeze: 0
      }
      this.shots.push(s)
    }
    s.active = true
    s.hitIds.length = 0
    s.homing = null
    s.weakOf = null
    s.weakBest = Infinity
    s.source = null
    s.pierce = 0
    s.crit = false
    s.t = 0
    s.element = 'none'
    s.weapon = ''
    s.back = false
    s.homePlayer = false
    s.destructible = false
    s.burn = 0
    s.freeze = 0
    s.rock = null
    s.sprite.visible = true
    s.core!.visible = true
    if (s.aura) s.aura.visible = false
    return s
  }

  private look(s: Shot, kind: keyof typeof SHOT_LOOK, glowColor?: string): void {
    const L = SHOT_LOOK[kind]!
    ;(s.sprite.material as SpriteMaterial).color.set(glowColor ?? L.glow)
    s.sprite.scale.setScalar(L.g)
    ;(s.core!.material as MeshBasicMaterial).color.set(L.core)
    s.core!.scale.setScalar(L.r)
    s.color = glowColor ?? L.glow
    s.radius = L.r
  }

  /**
   * A buster shot. `weakOf`: fired with the crosshair on that machine's weak
   * spot — the shot flies at the spot and may land it (×1.5). Every other
   * shot, the aim assist's included, can only hit bodies.
   */
  spawnPlayerShot(kind: 'pellet' | 'charge1' | 'charge2' | 'charge3', x: number, y: number, z: number, dx: number, dy: number, dz: number, dmg: number, crit: boolean, target: Enemy | null, weakOf: Enemy | null = null): Shot {
    const s = this.acquire()
    s.owner = 'player'
    s.kind = kind
    s.x = s.px = x
    s.y = s.py = y
    s.z = s.pz = z
    const speed = kind === 'pellet' ? 34 : kind === 'charge1' ? 30 : 28
    s.vx = dx * speed
    s.vy = dy * speed
    s.vz = dz * speed
    s.dmg = dmg
    s.crit = crit
    s.life = 1.4
    s.pierce = kind === 'pellet' ? 0 : kind === 'charge1' ? 1 : 3
    s.homing = weakOf ?? target
    s.weakOf = weakOf
    s.turn = kind === 'pellet' ? 4 : 2.5
    s.blockable = true
    this.look(s, kind, crit ? '#ffd84a' : undefined)
    if (kind !== 'pellet') {
      s.radius *= 1.8
      if (!s.aura) {
        s.aura = buildAura()
        this.root.add(s.aura)
      }
      tintAura(s.aura, kind, s.color, crit ? '#fff6d0' : SHOT_LOOK[kind]!.core)
      s.aura.visible = true
    }
    // Fired from a buster already through the wall (Flux pressed up to it,
    // the muzzle sits ahead of him): the shot ends on that wall, and nothing
    // beyond it is touched.
    if (!hasLineOfSight(this.host.nav, this.host.player.x, this.host.player.z, x, z)) {
      this.wallHit(s)
      this.kill(s)
    }
    return s
  }

  spawnEnemyShot(e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, blockable: boolean): Shot {
    const s = this.acquire()
    s.owner = 'enemy'
    s.kind = 'enemy'
    s.x = s.px = x
    s.y = s.py = y
    s.z = s.pz = z
    const l = Math.hypot(dx, dy, dz) || 1
    s.vx = (dx / l) * speed
    s.vy = (dy / l) * speed
    s.vz = (dz / l) * speed
    s.dmg = dmg
    s.life = 3
    s.source = e
    s.blockable = blockable
    if (e.kind === 'golem') {
      // A crate golem throws a real stone, on an arc (ROCK_G in update)
      s.kind = 'rock'
      this.look(s, 'rock')
      s.core!.visible = false
      s.rock = this.rubble.stone(false)
      return s
    }
    const glow = e.element === 'fire' ? '#ff7a2a' : e.element === 'ice' ? '#7fe8ff' : e.element === 'volt' ? '#fff04a' : '#ff5a3a'
    this.look(s, 'enemy', glow)
    return s
  }

  spawnWave(e: Enemy, x: number, z: number, dx: number, dz: number, speed: number, hw: number, range: number, dmg: number, color: string): void {
    const l = Math.hypot(dx, dz) || 1
    let w = this.waves.find(q => !q.active)
    if (!w) {
      w = { active: false, x: 0, z: 0, dx: 0, dz: 0, speed: 0, hw: 0, travel: 0, range: 0, dmg: 0, hit: false, color, source: e }
      this.waves.push(w)
    }
    Object.assign(w, { active: true, x, z, dx: dx / l, dz: dz / l, speed, hw, travel: 0, range, dmg, hit: false, color, source: e })
  }

  spawnRing(e: Enemy, x: number, z: number, speed: number, maxR: number, dmg: number, color: string): void {
    let r = this.rings.find(q => !q.active)
    if (!r) {
      r = { active: false, x: 0, z: 0, r: 0, speed: 0, maxR: 0, dmg: 0, hit: false, color, source: e }
      this.rings.push(r)
    }
    Object.assign(r, { active: true, x, z, r: 0.3, speed, maxR, dmg, hit: false, color, source: e })
    this.host.shocks.spawnLinear(x, z, speed, maxR, color)
  }

  /** A slow homing energy orb — can be blocked, parried or shot down. */
  fireOrb(e: Enemy, x: number, y: number, z: number, speed: number, dmg: number): void {
    const h = this.host
    const s = this.spawnEnemyShot(e, x, y, z, h.player.x - x, feetOf(h) + EYE_H - 0.45 - y, h.player.z - z, speed, dmg, true)
    s.homePlayer = true
    s.destructible = true
    s.life = 5
    s.turn = 1.8
    this.look(s, 'enemy', '#d3fbff')
    s.sprite.scale.setScalar(1.3)
    s.core!.scale.setScalar(0.2)
    s.radius = 0.25
  }

  private updateHazards(dt: number): void {
    const h = this.host
    const px = h.player.x
    const pz = h.player.z
    for (const w of this.waves) {
      if (!w.active) continue
      const step = w.speed * dt
      w.x += w.dx * step
      w.z += w.dz * step
      w.travel += step
      // Flames / gusts along the wave front
      for (let k = 0; k < 5; k++) {
        const o = (Math.random() * 2 - 1) * w.hw
        h.fx.emit({
          x: w.x - w.dz * o, y: 0.2 + Math.random() * 0.4, z: w.z + w.dx * o,
          vy: 2 + Math.random() * 2, color: w.color, size: 0.7, sizeEnd: 0.1, life: 0.35
        })
      }
      const along = (px - w.x) * w.dx + (pz - w.z) * w.dz
      const lat = Math.abs((px - w.x) * -w.dz + (pz - w.z) * w.dx)
      if (!w.hit && Math.abs(along) < 0.7 && lat < w.hw + PLAYER_R * 0.5) {
        w.hit = true
        h.hitPlayer(w.source, w.dmg, { blockable: false, fromX: w.x - w.dx, fromZ: w.z - w.dz, kind: 'aoe' })
      }
      if (w.travel > w.range || !hasLineOfSight(h.nav, w.x - w.dx * step, w.z - w.dz * step, w.x, w.z)) w.active = false
    }
    for (const r of this.rings) {
      if (!r.active) continue
      r.r += r.speed * dt
      const d = Math.hypot(px - r.x, pz - r.z)
      if (!r.hit && Math.abs(d - r.r) < 0.6) {
        r.hit = true
        h.hitPlayer(r.source, r.dmg, { blockable: false, fromX: r.x, fromZ: r.z, kind: 'aoe' })
      }
      if (r.r >= r.maxR) r.active = false
    }
  }

  lobShell(e: Enemy, tx: number, tz: number, dur: number, dmg: number): void {
    const s = this.acquire()
    s.owner = 'enemy'
    s.kind = 'shell'
    s.sx = e.x
    s.sy = (e.floor ?? 0) + 1.0
    s.sz = e.z
    s.x = s.px = s.sx
    s.y = s.py = s.sy
    s.z = s.pz = s.sz
    s.tx = tx
    s.tz = tz
    s.t = 0
    s.dur = dur
    s.dmg = dmg
    s.life = dur + 0.5
    s.source = e
    s.blockable = false
    this.look(s, 'shell')
    if (e.kind === 'golem') {
      // The golem's boulder, from over its head, in a faint dust halo
      s.sy = s.y = s.py = (e.floor ?? 0) + 2.05 * e.rig.root.scale.x
      s.core!.visible = false
      ;(s.sprite.material as SpriteMaterial).color.set('#6e5a40')
      s.sprite.scale.setScalar(1.5)
      s.rock = this.rubble.stone(true)
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt: number): void {
    const h = this.host
    for (const s of this.shots) {
      if (!s.active) {
        // Ended elsewhere (a Gale Guard leaf ate it): its stone crumbles too
        if (s.rock) this.kill(s)
        continue
      }
      s.px = s.x
      s.py = s.y
      s.pz = s.z
      s.life -= dt
      if (s.life <= 0) { this.kill(s); continue }

      if (s.kind === 'shell') {
        s.t += dt
        const k = Math.min(1, s.t / s.dur)
        s.x = s.sx + (s.tx - s.sx) * k
        s.z = s.sz + (s.tz - s.sz) * k
        // Lands on whatever floor is at the target (the climb: a ledge).
        const ty = Math.max(-60, floorAt(h.nav, s.tx, s.tz))
        s.y = s.sy * (1 - k) + ty * k + Math.sin(k * Math.PI) * 4.5
        // A golem's boulder sheds a little dust, not a fuse's sparks
        if (!s.rock) h.fx.emit({ x: s.x, y: s.y, z: s.z, color: '#ffb070', size: 0.35, sizeEnd: 0.05, life: 0.3, vy: 0.5 })
        else if (Math.random() < 0.4) h.fx.emit({ x: s.x, y: s.y, z: s.z, color: '#8a7a62', size: 0.45, sizeEnd: 0.1, life: 0.35, vy: 0.3 })
        if (k >= 1) {
          if (s.rock) {
            h.fx.sparks(s.x, ty + 0.3, s.z, '#b3a386', 16, 6, 0.24)
            h.fx.flash(s.x, ty + 0.4, s.z, '#e8d8b8', 1.8, 0.16)
          } else h.fx.orbBurst(s.x, ty + 0.4, s.z, '#ff7a3a', 0.7)
          h.shocks.spawn(s.x, ty + 0.05, s.z, 2.0, '#ff5a3a', 0.35)
          h.shake(0.3)
          h.sfx(s.rock ? 'stomp' : 'explode', s.x, s.z)
          if (Math.hypot(h.player.x - s.x, h.player.z - s.z) < 1.9 + PLAYER_R) {
            // The shield takes a shell too, raised toward the gun that lobbed
            // it (the landing point is often Flux's own feet, no direction).
            h.hitPlayer(s.source, s.dmg, { blockable: true, fromX: s.sx, fromZ: s.sz, kind: 'aoe' })
          }
          this.kill(s)
        }
        continue
      }

      // Enemy orbs curve toward the player
      if (s.homePlayer) {
        const ax = h.player.x - s.x
        const ay = feetOf(h) + EYE_H - 0.45 - s.y
        const az = h.player.z - s.z
        const al = Math.hypot(ax, ay, az) || 1
        const sp = Math.hypot(s.vx, s.vy, s.vz)
        const k = Math.min(1, s.turn * dt)
        s.vx += ((ax / al) * sp - s.vx) * k
        s.vy += ((ay / al) * sp - s.vy) * k
        s.vz += ((az / al) * sp - s.vz) * k
        if (Math.random() < 0.5) h.fx.emit({ x: s.x, y: s.y, z: s.z, color: '#d3fbff', size: 0.35, sizeEnd: 0.05, life: 0.25 })
      }
      // Homing (gentle — a tap should hit what it was aimed at, strafing or not)
      if (s.homing && s.homing.state !== 'dead') {
        const e = s.homing
        // A weak-spot shot keeps to the spot; any other, to the body's middle.
        const onWeak = s.weakOf === e
        if (onWeak) weakSpotAt(e, _weak)
        const ax = (onWeak ? _weak.x : e.x) - s.x
        const ay = (onWeak ? _weak.y : e.y + (e.floor ?? 0) + e.def.aimY) - s.y
        const az = (onWeak ? _weak.z : e.z) - s.z
        const al = Math.hypot(ax, ay, az) || 1
        const sp = Math.hypot(s.vx, s.vy, s.vz)
        const k = Math.min(1, s.turn * dt)
        s.vx += ((ax / al) * sp - s.vx) * k
        s.vy += ((ay / al) * sp - s.vy) * k
        s.vz += ((az / al) * sp - s.vz) * k
        const nl = Math.hypot(s.vx, s.vy, s.vz) || 1
        s.vx = (s.vx / nl) * sp
        s.vy = (s.vy / nl) * sp
        s.vz = (s.vz / nl) * sp
      }

      // The Neon Blade turns at half its flight and sweeps back through the
      // same machines (it may hit each again).
      if (s.weapon === 'neonBlade' && s.owner === 'player' && !s.back && s.life < BLADE_TURN) {
        s.back = true
        s.vx = -s.vx
        s.vy = -s.vy
        s.vz = -s.vz
        s.hitIds.length = 0
      }
      // A golem's rock falls along its arc (a parried one flies back straight)
      if (s.kind === 'rock') s.vy -= ROCK_G * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.z += s.vz * dt

      // The Flame Wave hugs the floor it rolls over (a step up or down, a
      // ramp); over a gap it holds its height.
      if (s.weapon === 'flameWave') {
        const f = floorAt(h.nav, s.x, s.z, s.y + 0.6)
        if (f > -Infinity && Math.abs(f + 0.45 - s.y) < 1.2) s.y = f + 0.45
      }
      // A copied weapon's own trail: what it IS reads in flight.
      if (s.kind === 'special') this.specialTrail(s)
      // Trails for charged shots
      if (s.kind === 'charge2' || s.kind === 'charge3' || s.kind === 'reflect') {
        h.fx.emit({ x: s.x, y: s.y, z: s.z, color: s.color, size: s.kind === 'charge3' ? 0.9 : 0.6, sizeEnd: 0.05, life: 0.22 })
      }
      // A full charge crackles: sparks jump off it, white and in its colour
      const A = CHARGE_AURA[s.kind as ChargeKind]
      if (A && Math.random() < A.crackle) {
        const a = Math.random() * Math.PI * 2
        const b = (Math.random() - 0.5) * Math.PI
        const r = s.radius * 1.1
        const ox = Math.cos(a) * Math.cos(b)
        const oy = Math.sin(b)
        const oz = Math.sin(a) * Math.cos(b)
        h.fx.emit({
          x: s.x + ox * r, y: s.y + oy * r, z: s.z + oz * r, vx: ox * 3, vy: oy * 3, vz: oz * 3,
          color: Math.random() < 0.5 ? '#ffffff' : s.color, size: 0.2, sizeEnd: 0.02, life: 0.14
        })
      }

      // A wall button sits on the wall's face: its test comes first, or the
      // wall would always stop the shot short of it.
      if (s.owner === 'player' && h.shotHitsStage?.(s)) {
        this.kill(s)
        continue
      }

      // World collision (walls, closed doors, pillars, wall-corner and door
      // posts, floor — on the climb a ledge's floor, so its cliff face stops
      // a shot too)
      if (s.y < floorAt(h.nav, s.x, s.z) + 0.02 || !hasLineOfSight(h.nav, s.px, s.pz, s.x, s.z)) {
        this.wallHit(s)
        if (s.owner === 'enemy') h.onShotBlocked?.(s)
        this.kill(s)
        continue
      }

      if (s.owner === 'player') {
        // Shooting down orbs
        let popped = false
        for (const o of this.shots) {
          if (!o.active || o.owner !== 'enemy' || !o.destructible) continue
          const rr = o.radius + s.radius + 0.25
          if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 + (o.z - s.z) ** 2 < rr * rr) {
            h.fx.sparks(o.x, o.y, o.z, '#d3fbff', 10, 5)
            this.kill(o)
            popped = true
            break
          }
        }
        if (popped && s.pierce <= 0) { this.kill(s); continue }
        const lesson = h.shotHitsLesson?.(s)
        if (lesson === 'deflect' || (lesson === 'hit' && s.pierce <= 0)) { this.kill(s); continue }
        if (lesson === 'hit') s.pierce--
        if (h.shotHitsProp?.(s.x, s.y, s.z, s.radius, s.dmg, chargeLevel(s))) {
          h.fx.sparks(s.x, s.y, s.z, s.color, 6, 4)
          if (s.pierce <= 0) { this.kill(s); continue }
          s.pierce--
        }
        for (const e of h.enemies) {
          if (e.state === 'dead' || e.offstage || e.buried || s.hitIds.includes(e.id)) continue
          // A shot aimed at this machine's weak spot: on the spot, it lands
          // there; still closing on it, the body does not catch it first;
          // once it has passed it by, it is an ordinary shot.
          if (s.weakOf === e) {
            weakSpotAt(e, _weak)
            const d = Math.hypot(_weak.x - s.x, _weak.y - s.y, _weak.z - s.z)
            if (d < _weak.r + s.radius + 0.12 && hasLineOfSight(h.nav, s.x, s.z, e.x, e.z)) {
              s.hitIds.push(e.id)
              s.weakOf = null
              this.hitEnemyWithShot(e, s, true)
              if (s.pierce <= 0) { this.kill(s); break }
              s.pierce--
              continue
            }
            if (d < (s.weakBest ?? Infinity) - 0.001) {
              s.weakBest = d
              continue
            }
            s.weakOf = null
          }
          const ex = e.x - s.x
          const ey = e.y + (e.floor ?? 0) + e.def.aimY * (e.elite ? 1.18 : 1) - s.y
          const ez = e.z - s.z
          const rr = e.def.hitR * (e.elite ? 1.18 : 1) + s.radius
          if (ex * ex + ey * ey + ez * ez > rr * rr) continue
          // Close enough, but the wall it stopped short of stands between:
          // a (fat, charged) shot must not reach a machine behind it
          if (!hasLineOfSight(h.nav, s.x, s.z, e.x, e.z)) continue
          s.hitIds.push(e.id)
          // A shot that only TINKs off a sleeping golem stops there, piercing or not
          const bounced = golemShielded(e)
          this.hitEnemyWithShot(e, s)
          if (bounced || s.pierce <= 0) { this.kill(s); break }
          s.pierce--
        }
      } else {
        const dx = h.player.x - s.x
        const dy = feetOf(h) + EYE_H - 0.45 - s.y
        const dz = h.player.z - s.z
        const rr = 0.5 + s.radius
        // Late-window flash: the shot glints white when a block now would parry.
        const toPlayer = Math.hypot(dx, dz)
        const sp = Math.hypot(s.vx, s.vz) || 1
        incomingShot(h.player, s.x, s.z, s.px, s.pz, s.vx, s.vz) // an off-screen shot whizzes from its side
        if (s.blockable && toPlayer / sp < PARRY_WINDOW + h.stats.parryBonus) {
          ;(s.sprite.material as SpriteMaterial).color.set('#ffffff')
        }
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          const r = h.hitPlayer(s.source, s.dmg, { blockable: s.blockable, fromX: s.px, fromZ: s.pz, kind: 'shot' })
          if (r === 'parry') this.reflect(s)
          else if (r !== 'miss') this.kill(s)
        }
      }
    }
    this.updateHazards(dt)
    this.updatePickups(dt)
    this.rubble.update(dt, h.nav)
  }

  /** Per-frame visual interpolation. */
  sync(alpha: number): void {
    const h = this.host
    for (const s of this.shots) {
      if (!s.active) continue
      const x = s.px + (s.x - s.px) * alpha
      const y = s.py + (s.y - s.py) * alpha
      const z = s.pz + (s.z - s.pz) * alpha
      s.sprite.position.set(x, y, z)
      s.core!.position.set(x, y, z)
      if (s.rock) {
        // Tumbling on the way (its remaining life is a free, steady clock)
        s.rock.position.set(x, y, z)
        s.rock.rotation.set(s.life * 9, s.life * 4, s.life * 6)
      }
      // Player shots start small and grow over their first ~2.5 m, so a
      // charge shot leaving the buster does not white out the screen.
      if (s.owner === 'player' && s.kind !== 'reflect') {
        const L = SHOT_LOOK[s.kind]!
        const d = Math.hypot(x - h.player.x, z - h.player.z)
        const k = Math.min(1, Math.max(0.15, (d - 0.4) / 2.5))
        s.sprite.scale.setScalar(L.g * k)
        const A = CHARGE_AURA[s.kind as ChargeKind]
        if (s.aura) s.aura.visible = !!A
        if (A) this.syncAura(s, x, y, z, k)
      }
    }
    for (const p of this.pickups) {
      if (!p.active) continue
      p.root.position.set(p.x, p.y, p.z)
    }
  }

  /** A charged shot's tail and rings, at its drawn position, facing along its
   *  flight; `grow` is its sprite's start-small factor. The core throbs. */
  private syncAura(s: Shot, x: number, y: number, z: number, grow: number): void {
    // Its remaining life is a free, steady clock (it only counts down)
    s.core!.scale.setScalar(poseAura(s.aura!, s.kind as ChargeKind, x, y, z, s.vx, s.vy, s.vz, grow, -s.life))
  }

  /** A shot ends on a wall (or the floor) where it last was: sparks, and a
   *  charged one bursts. */
  private wallHit(s: Shot): void {
    const h = this.host
    const y = Math.max(0.1, s.py)
    if (s.rock) {
      h.fx.sparks(s.px, y, s.pz, '#b3a386', 8, 4, 0.2)
      h.sfx('punch', s.px, s.pz)
    } else if (s.kind === 'charge2' || s.kind === 'charge3') {
      h.fx.orbBurst(s.px, y, s.pz, s.color, s.kind === 'charge3' ? 0.7 : 0.5)
    } else {
      h.fx.sparks(s.px, y, s.pz, s.color, s.kind === 'pellet' ? 5 : 12, 4)
      if (s.kind !== 'pellet') h.fx.flash(s.px, y, s.pz, s.color, 1.2, 0.14)
    }
  }

  private kill(s: Shot): void {
    if (s.active && s.weapon === 'drillBomb' && s.owner === 'player') this.blast(s)
    s.active = false
    s.sprite.visible = false
    if (s.core) s.core.visible = false
    if (s.aura) s.aura.visible = false
    if (s.rock) {
      // A stone breaks where it ends: on a wall, the floor, Flux, a golem
      this.rubble.crumble(s.x, s.y, s.z, s.kind === 'shell' ? 7 : 4)
      this.rubble.drop(s.rock)
      s.rock = null
    }
  }

  /** A Drill Bomb bursts: every machine within DRILL_BLAST takes part of
   *  its damage (the one it struck took the full hit already), and the
   *  blast cracks open cracked rock in reach. */
  private blast(s: Shot): void {
    const h = this.host
    h.fx.orbBurst(s.x, s.y, s.z, '#ffb12a', 1.2)
    h.fx.sparks(s.x, s.y, s.z, '#ffe08a', 18, 8, 0.26)
    h.fx.sparks(s.x, s.y, s.z, '#8a6a52', 12, 5, 0.3)
    h.shake(0.25)
    h.sfx('explode', s.x, s.z)
    for (const e of h.enemies) {
      if (e.state === 'dead' || e.offstage || e.buried || s.hitIds.includes(e.id)) continue
      const ey = e.y + (e.floor ?? 0) + e.def.aimY
      if ((e.x - s.x) ** 2 + (ey - s.y) ** 2 + (e.z - s.z) ** 2 > (DRILL_BLAST + e.def.hitR) ** 2) continue
      if (!hasLineOfSight(h.nav, s.x, s.z, e.x, e.z)) continue
      e.lastWeapon = 'drillBomb'
      this.damageEnemy(e, Math.round(s.dmg * DRILL_SPLASH), { crit: false, charge: 2, fromX: s.x, fromZ: s.z, x: e.x, y: ey, z: e.z, color: '#ffb12a', special: true, weapon: 'drillBomb' })
    }
    h.shotHitsProp?.(s.x, s.y, s.z, DRILL_BLAST, s.dmg, 2)
  }

  /** Parried enemy shot flies back at its owner, twice as hard. */
  private reflect(s: Shot): void {
    s.owner = 'player'
    s.kind = 'reflect'
    s.vx = -s.vx * 1.6
    s.vy = -s.vy
    s.vz = -s.vz * 1.6
    s.dmg = Math.round(this.host.stats.busterDmg * 2.5 + s.dmg)
    s.homing = s.source
    s.weakOf = null
    s.turn = 8
    s.life = 2
    s.hitIds.length = 0
    this.look(s, 'reflect')
    // A parried rock goes back as a rock, lit cyan
    if (s.rock) s.core!.visible = false
  }

  // ─── Damage to enemies ─────────────────────────────────────────────────────

  /**
   * The special weapons' flight: Flame Wave rolls along the floor in real
   * fire (rising flames, embers); Ice Lance leaves frost mist and glinting
   * shards; Scrap Burst sheds hot metal chips that fall; the thrown Gale
   * leaves swirl. A few pooled particles a step (half on low quality).
   */
  private specialTrail(s: Shot): void {
    const fx = this.host.fx
    const k = LOW_FX ? 0.5 : 1
    const r = Math.random
    switch (s.weapon) {
      case 'flameWave':
        for (let n = 0; n < 4; n++) {
          if (r() > k) continue
          fx.emit({ x: s.x + (r() - 0.5) * 1.4, y: s.y - 0.3 + r() * 0.3, z: s.z + (r() - 0.5) * 0.7, vx: s.vx * 0.15, vy: 1.8 + r() * 1.6, vz: s.vz * 0.15, color: r() < 0.35 ? '#fff27a' : r() < 0.6 ? '#ffa23a' : '#ff5a1f', size: 0.7 + r() * 0.4, sizeEnd: 0.05, life: 0.45 + r() * 0.2 })
        }
        if (r() < 0.3 * k) fx.emit({ x: s.x, y: s.y, z: s.z, vx: (r() - 0.5) * 3, vy: 2.5 + r() * 2, vz: (r() - 0.5) * 3, color: '#ffd35a', size: 0.12, sizeEnd: 0.02, life: 0.7, gravity: 6 })
        break
      case 'iceLance':
        if (r() < 0.8 * k) fx.emit({ x: s.x, y: s.y, z: s.z, vx: (r() - 0.5) * 0.6, vy: (r() - 0.5) * 0.6, vz: (r() - 0.5) * 0.6, color: '#dffbff', size: 0.5, sizeEnd: 0.9, life: 0.35 })
        if (r() < 0.5 * k) fx.emit({ x: s.x + (r() - 0.5) * 0.3, y: s.y + (r() - 0.5) * 0.3, z: s.z + (r() - 0.5) * 0.3, color: r() < 0.5 ? '#ffffff' : '#8ff2ff', size: 0.16, sizeEnd: 0.02, life: 0.5, gravity: 2 })
        break
      case 'scrapBurst':
        if (r() < 0.45 * k) fx.emit({ x: s.x, y: s.y, z: s.z, vx: (r() - 0.5) * 2.5, vy: 1 + r() * 1.5, vz: (r() - 0.5) * 2.5, color: r() < 0.5 ? '#c9d3e6' : '#ffb04a', size: 0.14, sizeEnd: 0.03, life: 0.45, gravity: 9 })
        break
      case 'magnetPull':
        // Field lines: red and blue sparks curling round the shot.
        if (r() < 0.7 * k) {
          const a = s.life * 24
          const red = r() < 0.5
          fx.emit({ x: s.x + Math.cos(a) * 0.3 * (red ? 1 : -1), y: s.y + Math.sin(a) * 0.3, z: s.z, color: red ? '#ff4a5e' : '#5a8cff', size: 0.22, sizeEnd: 0.02, life: 0.3 })
        }
        break
      case 'droneSwarm':
        // A rotor's whirl of lime sparks and a thin exhaust.
        if (r() < 0.6 * k) {
          const a = s.life * 50
          fx.emit({ x: s.x + Math.cos(a) * 0.25, y: s.y + 0.1, z: s.z + Math.sin(a) * 0.25, color: '#b8ff5a', size: 0.14, sizeEnd: 0.02, life: 0.2 })
        }
        break
      case 'neonBlade':
        // A spinning arc of light: sparks round it, magenta and cyan.
        if (r() < 0.8 * k) {
          const a = s.life * 40
          fx.emit({ x: s.x + Math.cos(a) * 0.45, y: s.y, z: s.z + Math.sin(a) * 0.45, color: r() < 0.5 ? '#ff3fd2' : '#3ff4ff', size: 0.24, sizeEnd: 0.02, life: 0.22 })
        }
        break
      case 'bubbleLance':
        // Little bubbles shed behind it, rising.
        if (r() < 0.7 * k) fx.emit({ x: s.x + (r() - 0.5) * 0.6, y: s.y + (r() - 0.5) * 0.4, z: s.z + (r() - 0.5) * 0.6, vy: 1.2 + r(), color: r() < 0.5 ? '#bff0ff' : '#5fd2ff', size: 0.16, sizeEnd: 0.05, life: 0.6 })
        break
      case 'drillBomb':
        // Grit and sparks off the spinning bit.
        if (r() < 0.6 * k) fx.emit({ x: s.x, y: s.y, z: s.z, vx: (r() - 0.5) * 3, vy: 1 + r() * 1.5, vz: (r() - 0.5) * 3, color: r() < 0.5 ? '#ffd35a' : '#8a6a52', size: 0.13, sizeEnd: 0.02, life: 0.4, gravity: 8 })
        break
      case 'galeGuard':
        if (r() < 0.6 * k) {
          const a = s.life * 20
          fx.emit({ x: s.x + Math.cos(a) * 0.35, y: s.y + Math.sin(a) * 0.35, z: s.z, color: '#bffff2', size: 0.28, sizeEnd: 0.02, life: 0.3 })
        }
        break
    }
  }

  /** A special weapon's impact, in its own look. */
  private specialImpact(s: Shot): void {
    const fx = this.host.fx
    switch (s.weapon) {
      case 'flameWave':
        fx.orbBurst(s.x, s.y + 0.3, s.z, '#ff7a2a', 0.9)
        fx.sparks(s.x, s.y + 0.4, s.z, '#ffd35a', 10, 6, 0.2)
        break
      case 'iceLance':
        fx.flash(s.x, s.y, s.z, '#dffbff', 1.6, 0.14)
        fx.sparks(s.x, s.y, s.z, '#bff6ff', 14, 7, 0.22)
        break
      case 'scrapBurst':
        fx.sparks(s.x, s.y, s.z, '#c9d3e6', 8, 6, 0.18)
        break
      case 'galeGuard':
        fx.sparks(s.x, s.y, s.z, '#7fffc8', 10, 5, 0.2)
        break
      case 'droneSwarm':
        fx.orbBurst(s.x, s.y, s.z, '#b8ff5a', 0.6)
        break
      case 'neonBlade':
        fx.sparks(s.x, s.y, s.z, '#ff3fd2', 10, 6, 0.18)
        break
      case 'bubbleLance':
        fx.flash(s.x, s.y, s.z, '#bff0ff', 1.4, 0.12)
        fx.sparks(s.x, s.y, s.z, '#5fd2ff', 12, 5, 0.2)
        break
      case 'magnetPull':
        fx.sparks(s.x, s.y, s.z, '#ff4a5e', 8, 5, 0.18)
        fx.sparks(s.x, s.y, s.z, '#5a8cff', 8, 5, 0.18)
        break
    }
  }

  /** A stun from the player's weapons, with diminishing returns: the chain's
   *  end shows as a cyan shield flash (the machine shrugged it off). */
  private stun(e: Enemy, dur: number): void {
    const r = tryStun(e, dur)
    if (r.resisted) {
      const h = this.host
      const cy = e.y + (e.floor ?? 0) + e.def.aimY
      h.fx.flash(e.x, cy, e.z, '#7ff4ff', 2.2, 0.22)
      h.fx.sparks(e.x, cy, e.z, '#bff6ff', 14, 6, 0.2)
      h.sfx('tink', e.x, e.z)
    }
  }

  private hitEnemyWithShot(e: Enemy, s: Shot, weakSpot = false): void {
    if (s.kind === 'special') {
      this.specialImpact(s)
      e.lastWeapon = s.weapon
      this.damageEnemy(e, s.dmg, { crit: s.crit, charge: 1, fromX: s.px, fromZ: s.pz, x: s.x, y: s.y, z: s.z, color: s.color, element: s.element, special: true, weapon: s.weapon })
      // A golem the hit only woke catches no burn and no freeze either
      if (e.state !== 'dead' && !golemShielded(e)) {
        if (s.burn > 0) { e.burnT = 3; e.burnDps = s.burn }
        // Ice is an element, not a stun: it slows (see `frozenDt`).
        if (s.freeze > 0) e.frozenT = Math.max(e.frozenT, s.freeze)
      }
      return
    }
    e.lastWeapon = ''
    const lvl = s.kind === 'charge3' ? 3 : s.kind === 'charge2' ? 2 : s.kind === 'charge1' ? 1 : s.kind === 'reflect' ? 2 : 0
    this.damageEnemy(e, s.dmg, { crit: s.crit, charge: lvl, fromX: s.px, fromZ: s.pz, x: s.x, y: s.y, z: s.z, color: s.color, element: s.element, weakSpot })
  }

  damageEnemy(e: Enemy, amount: number, o: { crit: boolean; charge: number; fromX: number; fromZ: number; x: number; y: number; z: number; color: string; element?: string; special?: boolean; weapon?: string; weakSpot?: boolean }): void {
    const h = this.host
    // A boss not yet in the arena takes nothing and shows nothing.
    if (e.state === 'dead' || e.offstage || e.buried) return
    // Bosses are untouchable during their entrance and their phase-2 roar.
    if (e.boss && (e.state === 'idle' || e.state === 'alert' || (e.state === 'act' && e.attack === 'roar'))) {
      h.fx.sparks(o.x, o.y, o.z, '#ffffff', 6, 4, 0.14)
      pushHud({ t: 'text', x: o.x, y: o.y + 0.3, z: o.z, key: 'combat.tink', color: '#dfe7ff' })
      h.sfx('tink', e.x, e.z)
      return
    }
    // A crate golem asleep or still unfolding takes nothing: the first hit of
    // anything only wakes it, with the deflect's TINK (never the coach's
    // "charge it" nudge — a charge is no key here)
    if (golemShielded(e)) {
      h.fx.sparks(o.x, o.y, o.z, '#ffffff', 8, 5, 0.15)
      h.fx.flash(o.x, o.y, o.z, '#fff6dc', 0.8, 0.1)
      pushHud({ t: 'text', x: o.x, y: o.y + 0.3, z: o.z, key: 'combat.tink', color: '#dfe7ff' })
      h.sfx('tink', e.x, e.z)
      wakeGolem(h, e)
      return
    }
    if (!e.awake) wake(h, e)
    // Weakness: the right copied weapon (bosses ×2.5 + stagger), or the
    // counter element against a sector machine (×1.75).
    let weakMul = 1
    if (o.weapon && e.boss && (e.def as BossDef).weakTo === o.weapon) weakMul = 2.5
    else if (o.element && o.element !== 'none' && e.element !== 'none' && COUNTER[e.element] === o.element) weakMul = 1.75
    if (weakMul > 1) {
      pushHud({ t: 'text', x: o.x, y: o.y + 0.6, z: o.z, key: 'combat.weak', color: '#ff9a2e' })
      if (e.boss && e.state !== 'stun') this.stun(e, 0.9)
    }
    amount *= weakMul
    // A shot on the weak spot: ×1.5, a crit to the eye and the ear, KRANCK!
    if (o.weakSpot) {
      amount *= WEAK_SPOT_MUL
      o = { ...o, crit: true }
      pushHud({ t: 'kranck', x: o.x, y: o.y + 0.35, z: o.z })
    }
    // ── Guards ──
    let guarded = false
    if (e.guardBreakT <= 0) {
      if (e.kind === 'hardhat' && e.guard > 0.55) guarded = true
      // A Polar Pup's shut shell, a Warden's shutters: from any side.
      if ((e.kind === 'polar' || e.kind === 'warden') && e.guard > 0.55) guarded = true
      // The Gatekeeper's armour: from the front only (its back is open).
      if (e.kind === 'gatekeeper' && e.guard > 0.55) {
        let d = Math.atan2(o.fromX - e.x, o.fromZ - e.z) - e.yaw
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        if (Math.abs(d) < 1.3) guarded = true
      }
      if (e.kind === 'trooper' && e.guard > 0.55) {
        const toShot = Math.atan2(o.fromX - e.x, o.fromZ - e.z)
        let d = toShot - e.yaw
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        if (Math.abs(d) < 1.25) guarded = true
      }
    }
    const breaks = o.charge >= 2 || (o.charge >= 1 && h.stats.piercing) || o.special
    if (guarded && !breaks) {
      // TINK — the defence holds; the shot skips off.
      h.fx.sparks(o.x, o.y, o.z, '#ffffff', 7, 5, 0.14)
      pushHud({ t: 'text', x: o.x, y: o.y + 0.3, z: o.z, key: 'combat.tink', color: '#dfe7ff' })
      h.sfx('tink', e.x, e.z)
      h.onDeflect?.()
      return
    }
    let dmg = amount * e.def.armor
    let crit = o.crit
    if (!crit && h.stats.critChance > 0 && Math.random() < h.stats.critChance) {
      crit = true
      dmg *= h.stats.critMul
    }
    if (guarded && breaks) {
      e.guardBreakT = 1.6
      e.guard = 0
      this.stun(e, 1.1)
      dmg *= 0.7
      pushHud({ t: 'text', x: o.x, y: o.y + 0.5, z: o.z, key: 'combat.guardBreak', color: '#ffd84a' })
      h.sfx('guardBreak', e.x, e.z)
    }
    if (e.state === 'stun') dmg *= 1.25
    dmg = Math.max(1, Math.round(dmg))
    e.hp -= dmg
    e.flash = 1
    // Magnet Pull yanks a flyer out of its hover: a short stun (it sags).
    if (o.weapon === 'magnetPull' && e.def.fly > 0 && !e.boss && e.hp > 0) this.stun(e, 0.8)
    e.hurtAt = h.time
    // Knockback + stagger
    const kb = o.charge >= 2 ? 0.35 : 0.08
    const kx = e.x - o.fromX
    const kz = e.z - o.fromZ
    const kl = Math.hypot(kx, kz) || 1
    if (e.def.speed > 0 && !e.rooted) {
      e.x += (kx / kl) * kb
      e.z += (kz / kl) * kb
    }
    if (o.charge >= 2 && !e.boss && e.hp > 0 && (e.state === 'tele' || e.state === 'engage' || e.state === 'act')) {
      // A full charge interrupts: telegraphs can be cancelled by timing it —
      // with diminishing returns (`tryStun`), never forever.
      this.stun(e, e.kind === 'brute' ? 0.4 : 0.6)
    }
    pushHud({ t: 'damage', x: o.x, y: o.y + 0.2, z: o.z, amount: dmg, crit, weak: weakMul > 1, toPlayer: false })
    h.fx.sparks(o.x, o.y, o.z, crit ? '#ffd84a' : o.color, o.charge >= 2 ? 16 : 7, o.charge >= 2 ? 7 : 5, o.charge >= 2 ? 0.24 : 0.16)
    h.fx.flash(o.x, o.y, o.z, crit ? '#ffd84a' : o.color, o.charge >= 2 ? 1.5 : 0.7, 0.1)
    h.sfx(crit ? 'crit' : o.charge >= 2 ? 'hitHeavy' : 'hit', e.x, e.z)
    if (o.charge >= 2) {
      h.shake(0.18)
      h.hitStop = Math.max(h.hitStop, crit ? 0.09 : 0.05)
    }
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e: Enemy): void {
    const h = this.host
    e.hp = 0
    e.state = 'dead'
    e.deathT = 0
    e.ring.visible = false
    const cy = e.y + (e.floor ?? 0) + e.def.aimY
    const col = e.boss ? (e.def as BossDef).color : e.elite ? '#ffd84a' : e.golem ? e.golem.wood : BASE_COLORS[e.kind].main
    h.fx.orbBurst(e.x, cy, e.z, col, e.boss ? 2 : e.elite ? 1.4 : e.def.radius > 0.8 ? 1.2 : 1)
    // A golem breaks up into its crate's planks and its stone
    if (e.golem) this.rubble.burst(e.x, cy, e.z, e.golem.wood, e.golem.trim)
    // Every other machine comes apart too: plates in its colour and dark
    // chips tumble down (the kill-cam's subject; cheap: pooled, few).
    else if (!e.boss) this.rubble.burst(e.x, cy, e.z, col, '#2a2d3e', e.def.radius > 0.8 ? 7 : 5, 5)
    h.shake(e.boss ? 0.8 : e.elite ? 0.4 : 0.2)
    h.sfx(e.boss ? 'death' : 'explode', e.x, e.z)
    if (e.boss) h.hitStop = Math.max(h.hitStop, 0.35)
    const xp = scaleXp(e.def.xp, e.level) * (e.elite ? 3 : 1)
    pushHud({ t: 'text', x: e.x, y: cy + 0.8, z: e.z, key: 'combat.xp', color: '#9dff5a', params: { n: xp } })
    // Drops
    const [b0, b1] = e.def.bolts
    let bolts = Math.round((b0 + Math.random() * (b1 - b0)) * h.stats.boltMul * (1 + (e.level - 1) * 0.12) * (e.elite ? 3 : 1))
    const chunks = Math.min(e.boss ? 10 : 6, Math.max(1, Math.ceil(bolts / 4)))
    for (let k = 0; k < chunks; k++) {
      const v = Math.max(1, Math.round(bolts / (chunks - k)))
      bolts -= v
      this.spawnPickup('bolt', v, e.x, cy, e.z)
    }
    const roll = Math.random()
    if (e.elite) this.spawnPickup(Math.random() < 0.6 ? 'hpBig' : 'weBig', 0, e.x, cy, e.z)
    else if (roll < 0.16) this.spawnPickup('hp', 0, e.x, cy, e.z)
    else if (roll < 0.26) this.spawnPickup('we', 0, e.x, cy, e.z)
    h.onEnemyKilled(e, xp)
  }

  // ─── Pickups ───────────────────────────────────────────────────────────────

  spawnPickup(kind: PickupKind, value: number, x: number, y: number, z: number): void {
    let p = this.pickups.find(q => !q.active && q.kind === kind)
    if (!p) {
      const mesh = kind === 'bolt' ? buildBolt()
        : kind === 'hp' || kind === 'hpBig' ? buildCapsule('hp', kind === 'hpBig')
          : kind === 'we' || kind === 'weBig' ? buildCapsule('we', kind === 'weBig')
            : buildBolt()
      p = { active: false, kind, value, x, y, z, vx: 0, vy: 0, vz: 0, t: 0, root: mesh.root, magnet: false }
      this.root.add(p.root)
      this.pickups.push(p)
    }
    const a = Math.random() * Math.PI * 2
    const sp = 1.5 + Math.random() * 2.5
    p.active = true
    p.value = value
    p.x = x
    p.y = y
    p.z = z
    p.vx = Math.cos(a) * sp
    p.vz = Math.sin(a) * sp
    p.vy = 3.5 + Math.random() * 2
    p.t = 0
    p.magnet = false
    p.root.visible = true
    p.root.scale.setScalar(1)
  }

  private updatePickups(dt: number): void {
    const h = this.host
    const px = h.player.x
    const pz = h.player.z
    const magnetR = 2.4 * h.stats.magnetMul
    for (const p of this.pickups) {
      if (!p.active) continue
      p.t += dt
      const dx = px - p.x
      const dz = pz - p.z
      const d = Math.hypot(dx, dz)
      if (p.t > 0.45 && d < magnetR) p.magnet = true
      if (p.magnet) {
        const sp = 9 + p.t * 4
        p.x += (dx / (d || 1)) * Math.min(d, sp * dt)
        p.z += (dz / (d || 1)) * Math.min(d, sp * dt)
        p.y += (feetOf(h) + EYE_H - 0.6 - p.y) * Math.min(1, dt * 8)
      } else {
        // Toss, bounce, settle
        p.vy -= 18 * dt
        p.x += p.vx * dt
        p.z += p.vz * dt
        p.y += p.vy * dt
        const rest = (p.kind === 'bolt' ? 0.22 : 0.3) + Math.max(-60, floorAt(h.nav, p.x, p.z))
        if (p.y < rest) {
          p.y = rest
          p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.35 : 0
          p.vx *= 0.6
          p.vz *= 0.6
        }
        if (!hasLineOfSight(h.nav, px, pz, p.x, p.z) && p.t < 0.6) {
          // Tossed into a wall: stop horizontally
          p.vx = 0
          p.vz = 0
        }
        const [cx, cz] = [p.x, p.z]
        if (isNaN(cx) || isNaN(cz)) p.active = false
      }
      p.root.rotation.y += dt * 3
      if (p.kind !== 'bolt') p.root.position.y = p.y + Math.sin(p.t * 4) * 0.05
      if (d < 0.75 && p.t > 0.3) {
        p.active = false
        p.root.visible = false
        h.onPickup(p.kind, p.value)
      }
      // Despawn very old loose pickups far from the player
      if (p.t > 90 && d > 20) {
        p.active = false
        p.root.visible = false
      }
    }
  }

  /** After a fight: every visible drop nearby flies to the player (casual QoL —
   *  nobody should have to hoover a room by hand). */
  vacuum(r: number): void {
    const h = this.host
    for (const p of this.pickups) {
      if (!p.active || p.magnet) continue
      if (Math.hypot(p.x - h.player.x, p.z - h.player.z) > r) continue
      if (!hasLineOfSight(h.nav, h.player.x, h.player.z, p.x, p.z)) continue
      p.magnet = true
      p.t = Math.max(p.t, 0.5)
    }
  }

  clear(): void {
    for (const s of this.shots) this.kill(s)
    for (const p of this.pickups) {
      p.active = false
      p.root.visible = false
    }
    this.rubble.clear()
  }
}
