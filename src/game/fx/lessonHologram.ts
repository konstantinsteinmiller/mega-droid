import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  RingGeometry, SphereGeometry, Vector3, type Object3D
} from 'three'
import { buildHero, buildViewmodel, animateHeroIdle, animateHeroWalk, animateHeroHop, type HeroColors } from '../models/hero'
import { buildEnemyRig, poseHeli, poseTrooper, poseHopper } from '../models/enemies'
import { pose, type Rig } from '../models/kit'
import { newMotion } from '../models/motion'
import { buildChargedShot, type ChargedShotFx } from './chargedShot'
import { buildBarrier, type BarrierFx } from '../models/barrier'
import type { TrainId } from '../sim/training'
import { dashPose } from '../models/dash'
import type { WeaponId } from '../data/weapons'

/** What a hologram shows: a lesson's move, or the crate and the chest rooms'
 *  (shoot the crate with a charge, shoot the chest open). */
export type HoloId = TrainId | 'crate' | 'chest'

/**
 * ─── Lesson holograms: show, don't tell ──────────────────────────────────────
 *
 * Playtests: players skipped the lesson cards' text, and the first-person
 * demo (the game taking the controls once) was over before they understood
 * it. So each lesson room has a see-through cyan Flux that does the move on a
 * loop, in third person, with the machine it is done to as a hologram too
 * where the move needs one: the charged shot popping a rotor drone, the
 * shield raised as a Trooper's shot lands and flies back to blow the
 * Trooper apart, the slide out from under a
 * Stomper's leap, the walk off a ledge that leaps a gap by itself, the Repair
 * Gel, a copied weapon. The input it uses is pinned above it and lit in
 * step with the loop (`holoGlyphAt`, the HUD's `HoloGlyph`).
 *
 * The timeline is pure (`holoGlyphAt`, `HOLO_LOOP`): tests pin that every
 * loop presses its input once, at the moment the move happens. The rendering
 * class only reads it.
 */

/** What the hologram presses: the HUD shows that input's glyph above it. */
export type HoloAct = '' | 'fire' | 'block' | 'slide' | 'tank' | 'move' | 'weapon'
export interface HoloGlyph { act: HoloAct; down: boolean }

/** Each lesson's loop (s). */
export const HOLO_LOOP: Readonly<Record<HoloId, number>> = { charge: 4.2, block: 4.2, slide: 4.2, gap: 4.6, gel: 3.6, weapon: 3.6, crate: 4.6, chest: 3.8 }

/** The moment each loop's input is down: [from, to) in loop seconds. */
export const HOLO_PRESS: Readonly<Record<HoloId, readonly [number, number]>> = {
  charge: [0.6, 1.9], block: [1.5, 2.4], slide: [0.95, 1.2], gap: [0, 2.8], gel: [1, 1.2], weapon: [0.3, 0.8], crate: [0.6, 1.9], chest: [0.55, 0.7]
}
const ACT: Readonly<Record<HoloId, HoloAct>> = { charge: 'fire', block: 'block', slide: 'slide', gap: 'move', gel: 'tank', weapon: 'weapon', crate: 'fire', chest: 'fire' }

/** The last part of a loop fades out and back in, so the reset never snaps. */
export const HOLO_RESET = 0.45

/** The glyph at loop time `u` (0 ≤ u < HOLO_LOOP[id]). */
export const holoGlyphAt = (id: HoloId, u: number): HoloGlyph => {
  const [a, b] = HOLO_PRESS[id]
  return { act: ACT[id], down: u >= a && u < b }
}

/** The loop's own fade (0..1): out over the last HOLO_RESET, in over the first. */
export const holoLoopAlpha = (id: HoloId, u: number): number => {
  const L = HOLO_LOOP[id]
  if (u > L - HOLO_RESET) return Math.max(0, (L - u) / HOLO_RESET)
  if (u < HOLO_RESET * 0.5) return u / (HOLO_RESET * 0.5)
  return 1
}

/** The hologram's light: cyan, see-through, additive; per hologram, so it fades on its own. */
const holoMaterial = (color = '#5fe8ff'): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })

/** A rig drawn in the hologram's light (every mesh one material, no outline). */
const holoRig = (rig: Rig, mat: MeshBasicMaterial): Rig => {
  rig.root.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) m.material = mat
  })
  if (rig.outline) rig.outline.visible = false
  return rig
}

const smooth = (k: number): number => {
  const c = Math.min(1, Math.max(0, k))
  return c * c * (3 - 2 * c)
}
const span = (u: number, a: number, b: number): number => Math.min(1, Math.max(0, (u - a) / (b - a)))

/** The buster's muzzle in the right forearm's space (`models/hero.ts`). */
const MUZZLE = new Vector3(0, -0.34, 0)
const _m = new Vector3()
const _look = new Vector3()

/** Yaw that turns a rig (which faces +Z) toward +X. */
const FACE_PX = Math.PI / 2
const FACE_NX = -Math.PI / 2

export class LessonHologram {
  readonly root = new Group()
  readonly id: HoloId
  private readonly mat: MeshBasicMaterial
  private readonly fx: MeshBasicMaterial
  private readonly flux: Rig
  private readonly foe: Rig | null
  private readonly motion = newMotion(7)
  private readonly shot: ChargedShotFx | null
  private readonly barrier: BarrierFx | null
  private readonly orb: Mesh
  private readonly ring: Mesh
  private readonly ledges: Mesh[] = []
  /** Seconds into the loop. */
  private clock = 0
  /** How far in view (0..1): the room's own fade. */
  private shown = 0

  /** The crate room's crate, and the chest room's chest (its lid on a hinge). */
  private readonly crate: Mesh | null = null
  private readonly chips: Mesh[] = []
  private readonly chest: Group | null = null
  private readonly lid: Group | null = null

  /** The weapon lesson's three drones, its shots, its hit halos (two rings
   *  crossed at 90°, so the burst reads in 3D), Thunder Arc's bolts and Gale
   *  Guard's leaves. */
  private readonly weapon: WeaponId | null = null
  private readonly drones: Rig[] = []
  private readonly shots: Mesh[] = []
  private readonly halos: Mesh[] = []
  private readonly bolts: Mesh[] = []
  private readonly leaves: Mesh[] = []

  constructor(id: HoloId, opts: { weaponColor?: string; weapon?: WeaponId } = {}) {
    this.id = id
    this.mat = holoMaterial()
    this.fx = holoMaterial(id === 'weapon' ? opts.weaponColor ?? '#ffd84a' : id === 'slide' ? '#ff4a4a' : id === 'gel' ? '#8dff7a' : '#9ff4ff')
    this.flux = holoRig(buildHero(), this.mat)
    this.root.add(this.flux.root)
    const kind = id === 'charge' ? 'heli' : id === 'block' ? 'trooper' : id === 'slide' ? 'hopper' : null
    this.foe = kind ? holoRig(buildEnemyRig(kind), this.mat) : null
    if (this.foe) this.root.add(this.foe.root)
    this.shot = id === 'charge' || id === 'crate' ? buildChargedShot('charge2') : null
    if (this.shot) this.root.add(this.shot.root)
    this.barrier = id === 'block' ? buildBarrier({ free: 0.62 }) : null
    if (this.barrier) this.root.add(this.barrier.root)
    // A shot (the Trooper's, a copied weapon's) or a flask, as one small orb.
    this.orb = new Mesh(new SphereGeometry(id === 'gel' ? 0.12 : 0.18, 12, 8), this.fx)
    this.orb.visible = false
    this.root.add(this.orb)
    // The Stomper's landing ring, the gel's heal ring.
    this.ring = new Mesh(new RingGeometry(0.8, 1, 40, 1), this.fx)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    this.root.add(this.ring)
    // The weapon lesson: three drones, as the real lesson places them.
    if (id === 'weapon') {
      this.weapon = opts.weapon ?? 'scrapBurst'
      for (let k = 0; k < 3; k++) {
        const d = holoRig(buildEnemyRig('heli'), this.mat)
        this.drones.push(d)
        this.root.add(d.root)
        const s = new Mesh(new SphereGeometry(0.16, 12, 8), this.fx)
        s.visible = false
        this.shots.push(s)
        this.root.add(s)
        for (let r = 0; r < 2; r++) {
          const h = new Mesh(new RingGeometry(0.55, 0.7, 32, 1), this.fx)
          h.visible = false
          this.halos.push(h)
          this.root.add(h)
        }
        const b = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 6, 1, true), this.fx)
        b.visible = false
        this.bolts.push(b)
        this.root.add(b)
      }
      if (this.weapon === 'galeGuard') {
        for (let k = 0; k < 4; k++) {
          const l = new Mesh(new BoxGeometry(0.35, 0.06, 0.18), this.fx)
          this.leaves.push(l)
          this.root.add(l)
        }
      }
    }
    // The block lesson's Trooper, after its own shot comes back: its plates
    // and its shield as pieces (a disc and boxes of a few sizes).
    if (id === 'block') {
      for (let k = 0; k < 9; k++) {
        const g = k === 0 ? new CylinderGeometry(0.45, 0.45, 0.08, 16) : new BoxGeometry(0.18 + (k % 3) * 0.1, 0.16 + (k % 2) * 0.14, 0.18 + (k % 4) * 0.05)
        const c = new Mesh(g, k === 0 ? this.mat : this.fx)
        c.visible = false
        this.chips.push(c)
        this.root.add(c)
      }
    }
    // The crate: a box a charged shot breaks into a few chips.
    if (id === 'crate') {
      this.crate = new Mesh(new BoxGeometry(1, 1, 1), this.mat)
      this.root.add(this.crate)
      for (let k = 0; k < 6; k++) {
        const c = new Mesh(new BoxGeometry(0.25, 0.25, 0.25), this.fx)
        c.visible = false
        this.chips.push(c)
        this.root.add(c)
      }
    }
    // The chest: a box and a lid hinged at its back edge.
    if (id === 'chest') {
      this.chest = new Group()
      const base = new Mesh(new BoxGeometry(1.0, 0.55, 0.7), this.mat)
      base.position.y = 0.275
      this.lid = new Group()
      this.lid.position.set(0.5, 0.55, 0)
      const top = new Mesh(new BoxGeometry(1.0, 0.18, 0.72), this.mat)
      top.position.set(-0.5, 0.09, 0)
      this.lid.add(top)
      this.chest.add(base, this.lid)
      this.root.add(this.chest)
    }
    // The gap: two ledges with a gap between, in the hologram's own light.
    if (id === 'gap') {
      for (const x of [-2.05, 2.05]) {
        const l = new Mesh(new BoxGeometry(2.7, 0.08, 1.6), this.mat)
        l.position.set(x, 0.04, 0)
        this.ledges.push(l)
        this.root.add(l)
      }
    }
  }

  /** Stand it at (x, y, z), its line of action along `yaw` (0: +X). */
  place(parent: Object3D, x: number, y: number, z: number, yaw: number): void {
    parent.add(this.root)
    this.root.position.set(x, y, z)
    this.root.rotation.y = yaw
  }

  /** The loop's time now (s). */
  get u(): number {
    return this.clock % HOLO_LOOP[this.id]
  }

  /** The glyph to pin above it now; nothing while it is out of view. */
  glyph(): HoloGlyph {
    return this.shown > 0.5 ? holoGlyphAt(this.id, this.u) : { act: '', down: false }
  }

  /** Where its glyph pins: above the hologram Flux's head (world space, into `out`). */
  headAt(out: { x: number; y: number; z: number }): void {
    const p = this.flux.root.position
    const c = Math.cos(this.root.rotation.y)
    const s = Math.sin(this.root.rotation.y)
    out.x = this.root.position.x + p.x * c + p.z * s
    out.y = this.root.position.y + p.y + 2.6
    out.z = this.root.position.z - p.x * s + p.z * c
  }

  /** One frame: `show` while Flux is in its room (it fades in and out). */
  update(dt: number, show: boolean): void {
    this.shown = Math.min(1, Math.max(0, this.shown + (show ? dt * 2.5 : -dt * 2.5)))
    this.root.visible = this.shown > 0.01
    if (!this.root.visible) return
    this.clock += dt
    const u = this.u
    const a = this.shown * holoLoopAlpha(this.id, u)
    this.mat.opacity = 0.5 * a
    this.fx.opacity = 0.75 * a
    const t = this.clock
    switch (this.id) {
      case 'charge': this.poseCharge(u, t); break
      case 'block': this.poseBlock(u, t, dt); break
      case 'slide': this.poseSlide(u, t); break
      case 'gap': this.poseGap(u, t); break
      case 'gel': this.poseGel(u, t); break
      case 'weapon': this.poseWeapon(u, t); break
      case 'crate': this.poseCrate(u, t); break
      case 'chest': this.poseChest(u, t); break
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    this.mat.dispose()
    this.fx.dispose()
  }

  // ─── The loops (local space: Flux on the left, facing +X) ────────────────

  private stand(x: number, z = 0, yaw = FACE_PX): void {
    const r = this.flux.root
    r.position.set(x, 0, z)
    r.rotation.set(0, yaw, 0)
  }

  /** The buster raised at whatever is ahead. */
  private aim(k: number): void {
    pose(this.flux, 'shoulderR', -1.5 * k, 0, 0)
    pose(this.flux, 'elbowR', -0.05 * k, 0, 0)
  }

  /** Where the buster's muzzle is now, in the hologram's own space (the
   *  charge ball sits on it, shots leave from it). */
  private muzzle(): Vector3 {
    this.root.updateMatrixWorld(true)
    const b = this.flux.bones.elbowR
    if (!b) return _m.set(-1.4, 1.2, 0)
    b.localToWorld(_m.copy(MUZZLE))
    return this.root.worldToLocal(_m)
  }

  private poseCharge(u: number, t: number): void {
    this.stand(-2)
    animateHeroIdle(this.flux, t)
    this.aim(smooth(span(u, 0.2, 0.6)))
    const drone = this.foe!
    const popped = u >= 2.35 && u < 3.4
    drone.root.visible = !popped
    drone.root.position.set(2.4, 1.3 + Math.sin(t * 2.2) * 0.12, 0)
    drone.root.rotation.y = FACE_NX
    drone.root.scale.setScalar(u >= 3.4 ? smooth(span(u, 3.4, 3.8)) : 1)
    poseHeli(drone, t, 0, 1)
    // Charge 0.6–1.9 on the muzzle, the shot 1.9–2.35 from it to the drone,
    // a burst where the drone was.
    const m = this.muzzle()
    const shot = this.shot!
    if (u >= 1.9 && u < 2.35) {
      const k = span(u, 1.9, 2.35)
      shot.fly(m.x + k * (2.4 - m.x), m.y + k * (1.3 - m.y), m.z * (1 - k), 1, 0, 0, t, 1)
    } else shot.hide()
    this.orb.visible = u >= 0.6 && u < 1.9
    this.orb.position.copy(m)
    // Grows on the muzzle as the charge builds, never much wider than the cannon.
    this.orb.scale.setScalar(0.3 + 0.5 * span(u, 0.6, 1.9))
    this.ring.visible = popped && u < 2.9
    this.ring.position.set(2.4, 1.3, 0)
    this.ring.rotation.set(0, 0, 0)
    this.ring.scale.setScalar(0.3 + 1.5 * span(u, 2.35, 2.9))
  }

  private poseBlock(u: number, t: number, dt: number): void {
    this.stand(-2)
    animateHeroIdle(this.flux, t)
    const up = u >= 1.5 && u < 2.4
    const g = up ? smooth(span(u, 1.5, 1.62)) : u >= 2.4 ? 1 - smooth(span(u, 2.4, 2.6)) : 0
    pose(this.flux, 'shoulderL', -1.35 * g, 0, 0)
    pose(this.flux, 'elbowL', -0.5 * g, 0, 0)
    const b = this.barrier!
    b.root.position.set(-1.45, 1.1, 0)
    b.root.rotation.y = FACE_NX
    b.update(dt, up, 1, t)
    if (u >= 1.8 && u - dt < 1.8) b.impact('parry')
    const trooper = this.foe!
    trooper.root.position.set(2.6, 0, 0)
    trooper.root.rotation.set(0, FACE_NX, 0)
    // The perfect block sends the shot back (1.8–2.2), bigger than it came:
    // it hits the Trooper, which bursts into pieces (#128: a block can kill),
    // and a new one beams in for the next loop (3.3–3.7).
    const dead = u >= 2.2 && u < 3.3
    trooper.root.visible = !dead
    trooper.root.scale.setScalar(u >= 3.3 ? smooth(span(u, 3.3, 3.7)) : 1)
    poseTrooper(trooper, 0, smooth(span(u, 0.4, 1.0)), t, 0)
    this.orb.visible = u >= 1.2 && u < 2.2
    const k = span(u, 1.2, 1.8)
    const back = span(u, 1.8, 2.2)
    this.orb.position.set(u < 1.8 ? 2.1 - k * 3.5 : -1.4 + back * 3.8, 1.15, 0)
    this.orb.scale.setScalar(u < 1.8 ? 1.5 : 2.1 + 0.4 * Math.sin(back * Math.PI))
    // The pieces: thrown away from Flux, tumbling, down onto the floor.
    const f = span(u, 2.2, 3.1)
    this.chips.forEach((c, n) => {
      c.visible = dead
      const a = (n / this.chips.length) * Math.PI * 2
      const y = 1.1 + (1.6 + (n % 3) * 0.5) * f - 3.6 * f * f
      c.position.set(2.6 + (0.6 + Math.cos(a) * 0.5) * 1.6 * f, Math.max(0.1, y), Math.sin(a) * 1.3 * f)
      c.rotation.set(f * 7 + n, f * 5 + n * 0.7, 0)
    })
    // The hit: a ring where it lands.
    this.ring.visible = u >= 2.2 && u < 2.7
    this.ring.position.set(2.5, 1.1, 0)
    this.ring.rotation.set(0, Math.PI / 2, 0)
    this.ring.scale.setScalar(0.3 + 1.6 * span(u, 2.2, 2.7))
  }

  private poseSlide(u: number, t: number): void {
    // Flux dashes sideways (−Z) out from under the leap: 1.0–1.35 — the
    // intro's Mega Man X dash, turned along the dash and back.
    const k = smooth(span(u, 1.0, 1.35))
    const turn = smooth(span(u, 0.85, 1.0)) * (1 - smooth(span(u, 1.5, 1.8)))
    this.stand(-1.2, -k * 2.8, FACE_PX - turn * (Math.PI / 2))
    animateHeroIdle(this.flux, t)
    const d = dashPose(this.flux, u, 1.0, 1.35)
    this.flux.root.position.y = -d.drop
    this.flux.root.rotation.x = d.lean
    this.flux.root.scale.set(1, 1 - d.stretch * 0.5, 1 + d.stretch)
    const st = this.foe!
    st.root.rotation.y = FACE_NX
    if (u < 0.8) {
      st.root.position.set(2.2, 0, 0)
      poseHopper(st, -smooth(span(u, 0.3, 0.8)), t)
    } else if (u < 1.6) {
      const l = span(u, 0.8, 1.6)
      st.root.position.set(2.2 - l * 3.4, Math.sin(l * Math.PI) * 2.8, 0)
      poseHopper(st, 1, t)
    } else {
      st.root.position.set(-1.2, 0, 0)
      poseHopper(st, -0.3 * (1 - span(u, 1.6, 2)), t)
    }
    // The red landing ring: the telegraph, then the shockwave.
    this.ring.visible = u >= 0.3 && u < 2.1
    this.ring.position.set(-1.2, 0.05, 0)
    this.ring.rotation.set(-Math.PI / 2, 0, 0)
    this.ring.scale.setScalar(u < 1.6 ? 1.3 + 0.1 * Math.sin(t * 12) : 1.3 + 2.4 * span(u, 1.6, 2.1))
  }

  private poseGap(u: number, t: number): void {
    // Walk to the edge (0–1.5), the leap carries him over (1.5–2.1), walk on.
    let x: number
    let y = 0
    if (u < 1.5) x = -3.2 + 2.5 * span(u, 0, 1.5)
    else if (u < 2.1) {
      const k = span(u, 1.5, 2.1)
      x = -0.7 + 1.6 * k
      y = Math.sin(k * Math.PI) * 1.1
    } else x = 0.9 + 1.5 * span(u, 2.1, 2.8)
    this.stand(x)
    this.flux.root.position.y = y
    if (u >= 1.5 && u < 2.1) animateHeroHop(this.flux, 0, Math.sin(span(u, 1.5, 2.1) * Math.PI), t)
    else if (u < 2.8) animateHeroWalk(this.flux, this.motion, t)
    else animateHeroIdle(this.flux, t)
  }

  private poseGel(u: number, t: number): void {
    this.stand(0)
    animateHeroIdle(this.flux, t)
    // Hurt (a red flicker), the flask up to the chest, a green ring heals him.
    this.mat.color.set(u >= 0.2 && u < 0.9 && Math.sin(t * 30) > 0 ? '#ff6a6a' : '#5fe8ff')
    const k = smooth(span(u, 0.9, 1.1)) * (1 - smooth(span(u, 1.8, 2.1)))
    pose(this.flux, 'shoulderL', -1.1 * k, 0, 0)
    pose(this.flux, 'elbowL', -1.2 * k, 0, 0)
    this.orb.visible = k > 0.05
    this.orb.position.set(0.35, 1.25, -0.2)
    this.ring.visible = u >= 1.15 && u < 1.8
    this.ring.position.set(0, 0.1, 0)
    this.ring.rotation.set(-Math.PI / 2, 0, 0)
    this.ring.scale.setScalar(0.4 + 1.6 * span(u, 1.15, 1.8))
  }

  /**
   * The weapon lesson (#109): the weapon as it really fires, at three drones
   * placed as the lesson places them — a fan, or a line down the lane for
   * the Flame Wave and the Ice Lance. Each drone pops where its shot meets it
   * (two crossed halos), and builds itself again for the next loop.
   */
  private poseWeapon(u: number, t: number): void {
    const w = this.weapon!
    this.stand(-2)
    animateHeroIdle(this.flux, t)
    const guard = w === 'galeGuard'
    this.aim(guard ? 0 : smooth(span(u, 0.1, 0.45)))
    const m = this.muzzle()
    const line = w === 'flameWave' || w === 'iceLance'
    const low = w === 'flameWave' || w === 'bubbleLance' || w === 'galeGuard'
    const dy = low ? 1.0 : 1.3
    // Where each drone hovers, and when its shot reaches it (−1: never).
    const at = (k: number): [number, number, number] => line ? [1.6 + k * 1.1, dy, 0] : [2.6, dy, (k - 1) * 1.3]
    const hitAt = [-1, -1, -1]
    for (const s of this.shots) s.visible = false
    for (const b of this.bolts) b.visible = false
    const fly = (s: Mesh, k: number, a: number, b: number, sx = 1, sy = 1, sz = 1, bend = 0): void => {
      if (u < a || u >= b) return
      const q = span(u, a, b)
      const [x, y, z] = at(k)
      s.visible = true
      s.scale.set(sx, sy, sz)
      s.position.set(m.x + q * (x - m.x), m.y + q * (y - m.y), m.z + q * (z - m.z) + Math.sin(q * Math.PI) * bend)
    }
    switch (w) {
      case 'scrapBurst':
        // Three scrap pellets fanned out, one at each drone, at once.
        for (let k = 0; k < 3; k++) { fly(this.shots[k]!, k, 0.6, 1.0); hitAt[k] = 1.0 }
        break
      case 'droneSwarm':
        // Three little drones swinging out and homing in, one each.
        for (let k = 0; k < 3; k++) { fly(this.shots[k]!, k, 0.6, 1.3, 0.8, 0.8, 0.8, (k - 1) * 1.2); hitAt[k] = 1.3 }
        break
      case 'flameWave':
      case 'bubbleLance': {
        // A low wall of fire (a slow bubble) rolling down the lane, through
        // everything in it.
        const s = this.shots[0]!
        const a = 0.6
        const b = w === 'flameWave' ? 1.6 : 1.9
        if (u >= a && u < b) {
          const q = span(u, a, b)
          s.visible = true
          if (w === 'flameWave') s.scale.set(1.2, 2.2, 4.5)
          else s.scale.setScalar(1.8 + Math.sin(t * 9) * 0.1)
          s.position.set(m.x + q * (5.2 - m.x), w === 'flameWave' ? 0.45 : 0.7, 0)
        }
        for (let k = 0; k < 3; k++) {
          const x = at(k)[0]
          if (Math.abs(at(k)[2]) < 0.3) hitAt[k] = a + ((x - m.x) / (5.2 - m.x)) * (b - a)
        }
        break
      }
      case 'iceLance': {
        // One fast lance, straight through the line.
        const s = this.shots[0]!
        if (u >= 0.6 && u < 0.95) {
          const q = span(u, 0.6, 0.95)
          s.visible = true
          s.scale.set(3, 0.5, 0.5)
          s.position.set(m.x + q * (5.2 - m.x), dy, 0)
        }
        for (let k = 0; k < 3; k++) hitAt[k] = 0.6 + ((at(k)[0] - m.x) / (5.2 - m.x)) * 0.35
        break
      }
      case 'thunderArc': {
        // A bolt from the cannon to the first drone, then jumping on.
        const from: Array<[number, number, number]> = [[m.x, m.y, m.z], at(0), at(1)]
        for (let k = 0; k < 3; k++) {
          const t0 = 0.6 + k * 0.15
          hitAt[k] = t0
          const b = this.bolts[k]!
          if (u >= t0 && u < t0 + 0.35) {
            const [ax, ay, az] = from[k]!
            const [bx, by, bz] = at(k)
            const len = Math.hypot(bx - ax, by - ay, bz - az)
            b.visible = true
            b.position.set((ax + bx) / 2, (ay + by) / 2 + Math.sin(t * 60) * 0.05, (az + bz) / 2)
            b.scale.set(1, len, 1)
            b.lookAt(this.root.localToWorld(_look.set(bx, by, bz)))
            b.rotateX(Math.PI / 2)
          }
        }
        break
      }
      case 'magnetPull':
      case 'drillBomb':
      case 'neonBlade': {
        // One shot at the middle drone: homing (the magnet pulls it in), a
        // slow lob (the drill), a short slash (the blade).
        const s = this.shots[0]!
        if (w === 'drillBomb') {
          if (u >= 0.6 && u < 1.3) {
            const q = span(u, 0.6, 1.3)
            const [x, y, z] = at(1)
            s.visible = true
            s.scale.setScalar(1.3)
            s.position.set(m.x + q * (x - m.x), m.y + q * (y - m.y) + Math.sin(q * Math.PI) * 1.2, z)
          }
          hitAt[1] = 1.3
        } else if (w === 'neonBlade') {
          fly(s, 1, 0.6, 0.9, 0.4, 1.6, 2.2)
          hitAt[1] = 0.9
        } else {
          fly(s, 1, 0.6, 1.1, 1, 1, 1, 0.6)
          hitAt[1] = 1.4
        }
        break
      }
      case 'galeGuard':
        // Leaves circle him; a drone that closes in is cut down by them.
        hitAt[1] = 1.6
        break
    }
    this.leaves.forEach((l, k) => {
      const on = u >= 0.5 && u < 3.0
      l.visible = on
      const a = t * 4 + (k / this.leaves.length) * Math.PI * 2
      l.position.set(-2 + Math.cos(a) * 1.1, 1.0 + Math.sin(t * 3 + k) * 0.1, Math.sin(a) * 1.1)
      l.rotation.set(0, -a, 0.3)
    })
    for (let k = 0; k < 3; k++) {
      const d = this.drones[k]!
      let [x, y, z] = at(k)
      // The magnet pulls its drone in before it pops; the gale's comes in.
      if (w === 'magnetPull' && k === 1 && u >= 1.1 && u < 1.4) x -= span(u, 1.1, 1.4) * 1.6
      if (w === 'galeGuard' && k === 1 && u >= 0.7 && u < 1.6) x -= smooth(span(u, 0.7, 1.6)) * 3.3
      const hit = hitAt[k]!
      const popped = hit >= 0 && u >= hit && u < 2.6
      d.root.visible = !popped
      d.root.position.set(x, y + Math.sin(t * 2.2 + k) * 0.1, z)
      d.root.rotation.y = FACE_NX
      d.root.scale.setScalar(hit >= 0 && u >= 2.6 ? smooth(span(u, 2.6, 3)) : 1)
      poseHeli(d, t + k, 0, 1)
      for (let r = 0; r < 2; r++) {
        const h = this.halos[k * 2 + r]!
        h.visible = popped && u < hit + 0.5
        if (!h.visible) continue
        h.position.set(x, y, z)
        // Two rings crossed at 90°: the burst reads in 3D, not as a flat disc.
        h.rotation.set(r ? Math.PI / 2 : 0, r ? 0 : Math.PI / 2, 0)
        h.scale.setScalar(0.4 + 1.6 * span(u, hit, hit + 0.5))
      }
    }
    this.orb.visible = false
    this.ring.visible = false
  }

  /** The crate room: the charge on the muzzle, the charged shot, the crate
   *  bursts into chips; it builds itself again for the next loop. */
  private poseCrate(u: number, t: number): void {
    this.stand(-2)
    animateHeroIdle(this.flux, t)
    this.aim(smooth(span(u, 0.2, 0.6)))
    const m = this.muzzle()
    const crate = this.crate!
    const broken = u >= 2.3 && u < 3.8
    crate.visible = !broken
    crate.position.set(2.4, 0.5, 0)
    crate.scale.setScalar(u >= 3.8 ? smooth(span(u, 3.8, 4.1)) : 1)
    const shot = this.shot!
    if (u >= 1.9 && u < 2.3) {
      const k = span(u, 1.9, 2.3)
      shot.fly(m.x + k * (2.4 - m.x), m.y + k * (0.6 - m.y), m.z * (1 - k), 1, 0, 0, t, 1)
    } else shot.hide()
    this.orb.visible = u >= 0.6 && u < 1.9
    this.orb.position.copy(m)
    this.orb.scale.setScalar(0.3 + 0.5 * span(u, 0.6, 1.9))
    const k = span(u, 2.3, 3.2)
    this.chips.forEach((c, n) => {
      c.visible = broken && u < 3.2
      const a = (n / this.chips.length) * Math.PI * 2
      c.position.set(2.4 + Math.cos(a) * 1.2 * k, 0.5 + 2.2 * k - 3.2 * k * k, Math.sin(a) * 1.2 * k)
      c.rotation.set(k * 6 + n, k * 4, 0)
    })
    this.ring.visible = u >= 2.3 && u < 2.8
    this.ring.position.set(2.4, 0.6, 0)
    this.ring.rotation.set(0, Math.PI / 2, 0)
    this.ring.scale.setScalar(0.3 + 1.4 * span(u, 2.3, 2.8))
  }

  /** The chest room: one shot at the chest and its lid flies open; it
   *  closes again for the next loop. */
  private poseChest(u: number, t: number): void {
    this.stand(-1.8)
    animateHeroIdle(this.flux, t)
    this.aim(smooth(span(u, 0.1, 0.45)) * (1 - smooth(span(u, 1.4, 1.8))))
    const m = this.muzzle()
    this.chest!.position.set(1.8, 0, 0)
    this.chest!.rotation.y = FACE_NX
    this.orb.visible = u >= 0.6 && u < 0.9
    const k = span(u, 0.6, 0.9)
    this.orb.scale.setScalar(0.6)
    this.orb.position.set(m.x + k * (1.8 - m.x), m.y + k * (0.45 - m.y), m.z * (1 - k))
    const open = smooth(span(u, 0.9, 1.25)) * (1 - smooth(span(u, 3.0, 3.4)))
    this.lid!.rotation.z = -1.9 * open
    this.ring.visible = u >= 0.9 && u < 1.5
    this.ring.position.set(1.8, 0.9, 0)
    this.ring.rotation.set(-Math.PI / 2, 0, 0)
    this.ring.scale.setScalar(0.3 + 0.8 * span(u, 0.9, 1.5))
  }
}

/**
 * The big yellow arrow over a lesson's target (the crate the charged shot
 * breaks, the training drone, the Trooper, the Stomper): it bobs and turns
 * above the target until the lesson is done, so a player never wonders what
 * the room wants shot. One per target; the mission moves it every frame.
 */
export class TargetArrow {
  readonly root = new Group()
  private readonly mat = new MeshBasicMaterial({ color: new Color('#ffd84a'), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })
  private readonly glow = new MeshBasicMaterial({ color: new Color('#fff3a0'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  private clock = Math.random() * 3
  private shown = 0

  constructor() {
    // Point down: a cone head under a short shaft, with a soft halo.
    const head = new Mesh(new ConeGeometry(0.42, 0.62, 20), this.mat)
    head.rotation.x = Math.PI
    head.position.y = 0.31
    const shaft = new Mesh(new CylinderGeometry(0.16, 0.16, 0.6, 14), this.mat)
    shaft.position.y = 0.9
    const halo = new Mesh(new ConeGeometry(0.62, 0.9, 20), this.glow)
    halo.rotation.x = Math.PI
    halo.position.y = 0.36
    for (const m of [head, shaft, halo]) {
      m.renderOrder = 5
      this.root.add(m)
    }
    this.root.visible = false
  }

  /** One frame: over (x, y, z) — the target's top — while `show`. */
  update(dt: number, show: boolean, x: number, y: number, z: number): void {
    this.shown = Math.min(1, Math.max(0, this.shown + (show ? dt * 4 : -dt * 4)))
    this.root.visible = this.shown > 0.01
    if (!this.root.visible) return
    this.clock += dt
    this.root.position.set(x, y + 0.35 + Math.abs(Math.sin(this.clock * 3.2)) * 0.35, z)
    this.root.rotation.y = this.clock * 1.6
    this.root.scale.setScalar(0.4 + 0.6 * this.shown)
    this.mat.opacity = 0.95 * this.shown
    this.glow.opacity = (0.25 + 0.15 * Math.sin(this.clock * 6)) * this.shown
  }

  dispose(): void {
    this.root.removeFromParent()
    this.root.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose() })
    this.mat.dispose()
    this.glow.dispose()
  }
}

/** The weapon arm hangs this long after the boss falls (s). */
export const ARM_HOLO_FOR = 5

/**
 * The copied weapon, shown (#D26): the moment the boss falls, Flux's arm in
 * the new weapon's colours (the red flame arm for the Flame Wave) hangs in
 * front of him as a hologram, turning on a light ring, for ARM_HOLO_FOR; it
 * grows in and shrinks away. A beam-out clears it at once (`dispose`).
 */
export class ArmHologram {
  readonly root = new Group()
  private readonly arm: Group
  private readonly ringMat: MeshBasicMaterial
  private t = 0

  constructor(colors: HeroColors, ringColor: string) {
    const vm = buildViewmodel(colors)
    vm.barrier.root.visible = false
    this.arm = vm.root
    // The viewmodel points along -Z; stood up and turned, life-size and more.
    this.arm.scale.setScalar(1.9)
    this.arm.rotation.set(0.35, 0, 0)
    this.root.add(this.arm)
    this.ringMat = new MeshBasicMaterial({ color: new Color(ringColor), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    const ring = new Mesh(new RingGeometry(0.75, 0.9, 40, 1), this.ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.55
    this.root.add(ring)
    this.root.scale.setScalar(0.01)
  }

  /** Hang it at (x, y, z), facing a viewer standing along `yaw`. */
  place(parent: Object3D, x: number, y: number, z: number, yaw: number): void {
    parent.add(this.root)
    this.root.position.set(x, y, z)
    this.root.rotation.y = yaw
  }

  /** One frame; false once its time is up (then `dispose`). */
  update(dt: number): boolean {
    this.t += dt
    const t = this.t
    const k = t < 0.4 ? smooth(t / 0.4) : t > ARM_HOLO_FOR - 0.5 ? smooth((ARM_HOLO_FOR - t) / 0.5) : 1
    this.root.scale.setScalar(Math.max(0.01, k))
    this.arm.rotation.y = t * 1.2
    this.arm.position.y = Math.sin(t * 2) * 0.06
    this.ringMat.opacity = (0.55 + 0.3 * Math.sin(t * 6)) * k
    return t < ARM_HOLO_FOR
  }

  dispose(): void {
    this.root.removeFromParent()
    this.ringMat.dispose()
  }
}
