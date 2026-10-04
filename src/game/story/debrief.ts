import {
  AdditiveBlending, Color, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, Vector3, PlaneGeometry, DoubleSide
} from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { buildDiorama, type Diorama } from '../models/diorama'
import { vexFaceTexture } from '../models/street'
import { buildPip, animatePip } from '../models/npc'
import { buildBossRig, type BossId } from '../models/bosses'
import { MASTER_COLOR } from '../data/signature'
import type { Rig } from '../models/kit'
import { sceneQuality } from '../engine/quality'
import { tickHud } from '../state/hud'
import { profile } from '../state/profile'
import { SECTORS } from '../data/regions'
import type { SectorId } from '../world/themes'
import { setMusicTrack } from '@/use/useSound'
import { stopVoice } from '../audio/voice'
import { Scene as StoryScene, prefetchScene } from './vexScene'
import { debriefBeats, type DebriefPlan, type DebriefStage } from './debriefScript'
import { debriefUi } from './debriefUi'
import { hubSceneUi } from './hubSceneUi'
import { hubSceneFor } from './vexScenes'

/**
 * ─── The debrief film (#119) ─────────────────────────────────────────────────
 *
 * The valley from above, as in the intro, after a story mission: the sectors
 * Flux has freed glow in their own colours, the rest are Vex's red; the one
 * just freed flares, then the camera travels to the next one, where its
 * Master stands as a hologram over its sector, while Pip talks
 * (`debriefScript.ts` for the beats, `DebriefLayer.vue` for the cards).
 *
 * The picture follows the lines: each stage is a camera target the view
 * eases to, set by the scene's own beats. On its own lazy chunk, like the
 * ending.
 */
export interface DebriefOptions {
  plan: DebriefPlan
  /** Pip's welcome (the first debrief only). */
  hello: boolean
  onEnd: () => void
}

const EASE = 1.6
/** Pip in the corner of the view: his size, and how far in front of the lens he hovers. */
const PIP_SIZE = 0.62
const PIP_AT = 2.6
/** The next Master's hologram: how tall it stands over its sector (diorama m), and how high it floats. */
const HOLO_TALL = 4.6
const HOLO_LIFT = 2.6

export class DebriefMode implements GameMode {
  scene = new Scene()
  camera = new PerspectiveCamera(50, 1, 0.05, 420)
  private t = 0
  private ended = false
  private readonly hemi = new HemisphereLight(new Color('#cfe0ff'), new Color('#140c24'), 1)
  private readonly key = new DirectionalLight(new Color('#dbe8ff'), 1)
  private readonly valley: Diorama
  private readonly pip: Rig
  private readonly pipRoot = new Group()
  /** The next Master, projected over its sector (stage `next`). */
  private readonly holo = new Group()
  private readonly holoMat: MeshBasicMaterial
  private readonly holoBeam: Mesh
  private holoOn = 0
  /** Dr. Vex's face over the Spire while his part plays (#112: he spoke
   *  with no face on screen; the intro shows it the same way). */
  private readonly vexMat: MeshBasicMaterial
  private readonly vexHolo: Mesh
  private vexOn = 0
  private readonly story: StoryScene
  private readonly freed: Set<SectorId>
  /** Where the camera is, and where it is going (eased). */
  private readonly pos = new Vector3()
  private readonly look = new Vector3()
  private readonly toPos = new Vector3()
  private readonly toLook = new Vector3()
  private stage: DebriefStage = ''
  private stageAt = 0

  constructor(private readonly opts: DebriefOptions) {
    const low = sceneQuality() === 'low'
    const s = this.scene
    s.background = new Color('#161c44')
    s.fog = new Fog(new Color('#161c44'), 45, 190)
    this.key.position.set(0.6, 1, 0.9)
    s.add(this.hemi, this.key)
    this.valley = buildDiorama({ low })
    s.add(this.valley.root)
    // Pip hovers by the view, small: the one who is talking.
    this.pip = buildPip()
    this.pipRoot.add(this.pip.root)
    this.pipRoot.scale.setScalar(PIP_SIZE)
    s.add(this.pipRoot)
    const p = opts.plan
    // The next Master as a hologram: its own model in light, in its signature colour.
    const tint = new Color(MASTER_COLOR[p.toBoss as keyof typeof MASTER_COLOR] ?? '#ff2d3f').lerp(new Color('#ffffff'), 0.35)
    this.holoMat = new MeshBasicMaterial({ color: tint, vertexColors: true, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
    const boss = buildBossRig(p.toBoss as BossId)
    boss.root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) m.material = this.holoMat
    })
    if (boss.outline) boss.outline.visible = false
    boss.root.scale.setScalar(HOLO_TALL / Math.max(0.5, boss.height))
    this.holoBeam = new Mesh(
      new CylinderGeometry(HOLO_TALL * 0.34, 0.12, HOLO_LIFT + 0.4, 20, 1, true),
      new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false })
    )
    this.holoBeam.position.y = -(HOLO_LIFT + 0.4) / 2 + 0.2
    this.holo.add(boss.root, this.holoBeam)
    const to = this.valley.sectorPos(p.to)
    this.holo.position.set(to.x, to.y + HOLO_LIFT, to.z)
    this.holo.visible = false
    s.add(this.holo)
    this.vexMat = new MeshBasicMaterial({
      map: vexFaceTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    })
    this.vexHolo = new Mesh(new PlaneGeometry(6.4, 4), this.vexMat)
    const tip = this.valley.spireTip
    this.vexHolo.position.set(tip.x, tip.y + 3, tip.z)
    this.vexHolo.visible = false
    s.add(this.vexHolo)
    this.freed = new Set(SECTORS.filter(x => profile.world.bosses.includes(x.boss)).map(x => x.id))
    const beats = debriefBeats(p, (st) => () => this.setStage(st), opts.hello)
    prefetchScene(beats)
    this.story = new StoryScene(beats, 'low', { onEnd: () => this.end() })
    this.setStage('city')
    this.pos.copy(this.toPos)
    this.look.copy(this.toLook)
  }

  enter(): void {
    const p = this.opts.plan
    Object.assign(debriefUi, { on: true, stage: 'city', from: p.from, to: p.to, boss: p.boss, toBoss: p.toBoss, weapon: p.weapon ?? '' })
    setMusicTrack('intro')
    try { getRenderer().compile(this.scene, this.camera) } catch { /* compiles on first draw */ }
  }

  /** A tap: the next line. */
  advance(): void {
    this.story.next()
  }

  /** Skip: straight to the Lab. */
  skip(): void {
    this.story.skip()
  }

  private end(): void {
    if (this.ended) return
    this.ended = true
    stopVoice()
    Object.assign(debriefUi, { on: false, stage: '' })
    Object.assign(hubSceneUi, { id: '', stage: '' })
    this.opts.onEnd()
  }

  /** A stage is a camera target (and what `DebriefLayer.vue` shows). */
  private setStage(st: DebriefStage): void {
    this.stage = st
    this.stageAt = this.t
    debriefUi.stage = st
    // Vex's part is the Lab scene that Master had: its hologram, from its first stage.
    Object.assign(hubSceneUi, { id: st === 'vex' ? hubSceneFor(this.opts.plan.boss)?.id ?? '' : '', stage: '' })
    const v = this.valley
    const p = this.opts.plan
    const from = v.sectorPos(p.from)
    const to = v.sectorPos(p.to)
    const out = (q: { x: number; z: number }, d: number, h: number): void => {
      // Stand outside the bowl on the sector's own side, looking in over it.
      const l = Math.hypot(q.x, q.z) || 1
      this.toPos.set(q.x + (q.x / l) * d, h, q.z + (q.z / l) * d)
    }
    switch (st) {
      case 'weapon':
        out(from, 9, 7)
        this.toLook.set(from.x, 1.2, from.z)
        break
      case 'vex':
        this.toPos.set(v.spire.x * 0.2 + 4, 9, v.spire.z * 0.2 + 16)
        this.toLook.set(v.spireTip.x, v.spireTip.y - 1, v.spireTip.z)
        break
      case 'next':
        // Far enough to hold the Master's hologram whole over its sector.
        out(to, 11, 6.5)
        this.toLook.set(to.x, to.y + HOLO_LIFT + HOLO_TALL * 0.42, to.z)
        break
      default:
        // The whole valley, the freed sector toward the camera.
        out(from, 24, 17)
        this.toLook.set(0, 1, 0)
    }
  }

  update(dt: number): void {
    if (this.ended) return
    this.t += dt
    this.story.update(dt)
  }

  render(_alpha: number, dt: number): void {
    const t = this.t
    const p = this.opts.plan
    const v = this.valley
    v.animate(t)
    // The freed sector flares for its first seconds; the next target pulses red all along.
    v.setProgress(this.freed, t < 4.5 ? p.from : null, p.to, t)
    // Vex's face: up for his part, a glitchy transmission like the intro's.
    this.vexOn = Math.min(1, Math.max(0, this.vexOn + (this.stage === 'vex' ? dt * 2.5 : -dt * 3)))
    this.vexHolo.visible = this.vexOn > 0.01
    if (this.vexHolo.visible) {
      const glitch = Math.random() < 0.06
      this.vexMat.opacity = this.vexOn * (glitch ? 0.4 + Math.random() * 0.5 : 0.85 + Math.sin(t * 40) * 0.08)
      this.vexHolo.scale.set(1 + (glitch ? (Math.random() - 0.5) * 0.3 : 0), Math.max(0.01, this.vexOn), 1)
      this.vexHolo.lookAt(this.camera.position)
    }
    const k = Math.min(1, dt * EASE)
    this.pos.lerp(this.toPos, k)
    this.look.lerp(this.toLook, k)
    // A slow drift, so a held line is never a still.
    const d = (t - this.stageAt) * 0.25
    const cam = this.camera
    cam.position.set(this.pos.x + Math.sin(t * 0.21) * 0.6 + d * 0.2, this.pos.y + Math.sin(t * 0.17) * 0.25, this.pos.z + Math.cos(t * 0.19) * 0.6)
    cam.lookAt(this.look)
    // The next Master's hologram: it unfolds as the camera arrives, faces the lens, and flickers.
    this.holoOn = Math.max(0, Math.min(1, this.holoOn + (this.stage === 'next' ? dt : -dt) * 2.2))
    this.holo.visible = this.holoOn > 0.01
    if (this.holo.visible) {
      const h = this.holo
      h.scale.set(1, this.holoOn, 1)
      h.rotation.y = Math.atan2(cam.position.x - h.position.x, cam.position.z - h.position.z) + Math.sin(t * 0.7) * 0.3
      this.holoMat.opacity = this.holoOn * (0.82 + 0.1 * Math.sin(t * 23) * Math.sin(t * 7.3))
    }
    // Pip, bottom left of the view, bobbing as he talks: whole, clear of the
    // edges. On a tall screen the bubble spans the bottom, so he sits above it.
    animatePip(this.pip, t)
    cam.updateMatrixWorld()
    const aspect = Math.max(0.2, cam.aspect)
    const halfH = PIP_AT * Math.tan((cam.fov * Math.PI) / 360)
    const halfW = halfH * aspect
    this.pipRoot.position.set(-halfW + 0.5, -halfH + (aspect < 1 ? halfH * 0.62 : 0.3), -PIP_AT).applyMatrix4(cam.matrixWorld)
    this.pipRoot.quaternion.copy(cam.quaternion)
    this.pipRoot.rotateY(0.5)
    // A tall screen keeps the width: a wider vertical lens, capped.
    cam.fov = Math.min(80, aspect < 1 ? 60 / Math.max(0.55, aspect) : 50)
    cam.updateProjectionMatrix()
    getRenderer().setRenderTarget(null)
    getRenderer().clear()
    getRenderer().render(this.scene, cam)
    tickHud(dt)
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    // Replaced without ending (a teardown): no hand-over from here.
    this.ended = true
    this.story.skip()
    Object.assign(debriefUi, { on: false, stage: '' })
    Object.assign(hubSceneUi, { id: '', stage: '' })
  }
}
