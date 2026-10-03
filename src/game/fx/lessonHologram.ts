import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  RingGeometry, SphereGeometry, Vector3, type Object3D
} from 'three'
import { buildHero, animateHeroIdle, animateHeroWalk, animateHeroHop } from '../models/hero'
import { buildEnemyRig, poseHeli, poseTrooper, poseHopper } from '../models/enemies'
import { pose, type Rig } from '../models/kit'
import { newMotion } from '../models/motion'
import { buildChargedShot, type ChargedShotFx } from './chargedShot'
import { buildBarrier, type BarrierFx } from '../models/barrier'
import type { TrainId } from '../sim/training'

/**
 * ─── Lesson holograms: show, don't tell ──────────────────────────────────────
 *
 * Playtests: players skipped the lesson cards' text, and the first-person
 * demo (the game taking the controls once) was over before they understood
 * it. So each lesson room has a see-through cyan Flux that does the move on a
 * loop, in third person, with the machine it is done to as a hologram too
 * where the move needs one: the charged shot popping a rotor drone, the
 * shield raised as a Trooper's shot lands, the slide out from under a
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
export const HOLO_LOOP: Readonly<Record<TrainId, number>> = { charge: 4.2, block: 4, slide: 4.2, gap: 4.6, gel: 3.6, weapon: 3.6 }

/** The moment each loop's input is down: [from, to) in loop seconds. */
export const HOLO_PRESS: Readonly<Record<TrainId, readonly [number, number]>> = {
  charge: [0.6, 1.9], block: [1.5, 2.4], slide: [0.95, 1.2], gap: [0, 2.8], gel: [1, 1.2], weapon: [0.5, 0.7]
}
const ACT: Readonly<Record<TrainId, HoloAct>> = { charge: 'fire', block: 'block', slide: 'slide', gap: 'move', gel: 'tank', weapon: 'weapon' }

/** The last part of a loop fades out and back in, so the reset never snaps. */
export const HOLO_RESET = 0.45

/** The glyph at loop time `u` (0 ≤ u < HOLO_LOOP[id]). */
export const holoGlyphAt = (id: TrainId, u: number): HoloGlyph => {
  const [a, b] = HOLO_PRESS[id]
  return { act: ACT[id], down: u >= a && u < b }
}

/** The loop's own fade (0..1): out over the last HOLO_RESET, in over the first. */
export const holoLoopAlpha = (id: TrainId, u: number): number => {
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

/** Yaw that turns a rig (which faces +Z) toward +X. */
const FACE_PX = Math.PI / 2
const FACE_NX = -Math.PI / 2

export class LessonHologram {
  readonly root = new Group()
  readonly id: TrainId
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

  constructor(id: TrainId, opts: { weaponColor?: string } = {}) {
    this.id = id
    this.mat = holoMaterial()
    this.fx = holoMaterial(id === 'weapon' ? opts.weaponColor ?? '#ffd84a' : id === 'slide' ? '#ff4a4a' : id === 'gel' ? '#8dff7a' : '#9ff4ff')
    this.flux = holoRig(buildHero(), this.mat)
    this.root.add(this.flux.root)
    const kind = id === 'charge' || id === 'weapon' ? 'heli' : id === 'block' ? 'trooper' : id === 'slide' ? 'hopper' : null
    this.foe = kind ? holoRig(buildEnemyRig(kind), this.mat) : null
    if (this.foe) this.root.add(this.foe.root)
    this.shot = id === 'charge' ? buildChargedShot('charge2') : null
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
    trooper.root.rotation.y = FACE_NX
    const aim = smooth(span(u, 0.4, 1.0)) * (1 - smooth(span(u, 1.8, 2.2)))
    // Knocked back by the perfect block for a moment.
    trooper.root.position.x += u >= 1.8 && u < 2.6 ? Math.sin(span(u, 1.8, 2.6) * Math.PI) * 0.5 : 0
    poseTrooper(trooper, 0, aim, t, 0)
    this.orb.visible = u >= 1.2 && u < 1.8
    const k = span(u, 1.2, 1.8)
    this.orb.position.set(2.1 - k * 3.5, 1.15, 0)
  }

  private poseSlide(u: number, t: number): void {
    // Flux slides sideways (+Z) out from under the leap: 1.0–1.35.
    const k = smooth(span(u, 1.0, 1.35))
    this.stand(-1.2, -k * 2.8)
    animateHeroIdle(this.flux, t)
    if (u >= 0.95 && u < 1.6) {
      const s = Math.sin(span(u, 0.95, 1.6) * Math.PI)
      this.flux.root.position.y = -0.3 * s
      this.flux.root.rotation.x = -0.35 * s
      pose(this.flux, 'hipL', -1.2 * s, 0, 0)
      pose(this.flux, 'kneeL', 1.1 * s, 0, 0)
      pose(this.flux, 'hipR', 0.5 * s, 0, 0)
      pose(this.flux, 'chest', 0.3 * s, 0, 0)
    }
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

  private poseWeapon(u: number, t: number): void {
    this.stand(-2)
    animateHeroIdle(this.flux, t)
    this.aim(smooth(span(u, 0.1, 0.45)))
    const drone = this.foe!
    const popped = u >= 1.1 && u < 2.6
    drone.root.visible = !popped
    drone.root.position.set(2.4, 1.3 + Math.sin(t * 2.2) * 0.12, 0)
    drone.root.rotation.y = FACE_NX
    drone.root.scale.setScalar(u >= 2.6 ? smooth(span(u, 2.6, 3)) : 1)
    poseHeli(drone, t, 0, 1)
    this.orb.visible = u >= 0.6 && u < 1.1
    const k = span(u, 0.6, 1.1)
    const m = this.muzzle()
    this.orb.position.set(m.x + k * (2.4 - m.x), m.y + k * (1.3 - m.y), m.z * (1 - k))
    this.ring.visible = popped && u < 1.6
    this.ring.position.set(2.4, 1.3, 0)
    this.ring.rotation.set(0, 0, 0)
    this.ring.scale.setScalar(0.3 + 1.5 * span(u, 1.1, 1.6))
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
