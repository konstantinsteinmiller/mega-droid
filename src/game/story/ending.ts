import {
  Color, DirectionalLight, Fog, Group, HemisphereLight, PerspectiveCamera, Scene, Vector3
} from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { buildPip, animatePip } from '../models/npc'
import { buildGauss, poseGauss, newGaussPose, setGaussGlow, type GaussRig } from '../models/gauss'
import { buildStasisCapsule, type StasisCapsule } from '../models/stasis'
import { BAY, FLUX_CAP_AT, GAUSS_CAP_AT, bayDir, bayPoint } from '../world/hubLayout'
import { buildDiorama, type Diorama } from '../models/diorama'
import { buildAtlas, animateAtlas } from '../models/atlas'
import type { Rig } from '../models/kit'
import { buildLabSet, buildLabFrontSet } from '../sim/hub'
import { tickLabScreens } from '../models/labConsole'
import { Particles } from '../fx/particles'
import { tickHud } from '../state/hud'
import { sfx } from '../audio/sfx'
import { playVoice, prefetchVoice, stopVoice } from '../audio/voice'
import { Scene as StoryScene, prefetchScene } from './vexScene'
import { stingBeats } from './vexScenes'
import { setMusicTrack } from '@/use/useSound'
import { sceneQuality } from '../engine/quality'
import {
  CARD_FROM, CREDITS_FROM, FREE_FROM, FREE_TO, LAB_FROM, OPEN_FROM, OPEN_TO, STEP_FROM, STEP_TO, SUNRISE_FROM, THAW_FROM, THAW_TO,
  CAPTIONS, captionAt, nextBeat, ramp, shotAt, type Speaker
} from './endingScript'
import { endingUi } from './endingUi'

export { endingUi }

/**
 * ─── The ending, "First Free Morning" (#102) ─────────────────────────────────
 *
 * Plays `endingScript.ts` on the game loop: the valley freed (a white ring
 * from the Spire, the relays back in their own colours), Gauss waking in the
 * lab with Pip and Atlas, the valley at sunrise; then the credits and the end
 * card over it (`EndingLayer.vue`, which reads `endingUi`). Skip goes straight
 * to the card; a tap jumps to the next line. No ads and no gameplay bracket
 * run here (the screen is not a mission).
 */

export interface EndingOptions {
  /** The player chose on the card: a New Game+ run, or back to the lab. */
  onEnd: (choice: 'ngplus' | 'lab') => void
}

const VALLEY_AT = new Vector3(300, 0, 0)
const GAUSS_CAP = new Vector3(GAUSS_CAP_AT.x, 0, GAUSS_CAP_AT.z)
/** A point in the lab's stasis bay (`hubLayout.ts`: x toward Flux's capsule,
 *  z toward the teleporter, 0 between the capsules), as the intro stages it. */
const bayAt = (x: number, y: number, z: number, out: Vector3): Vector3 => {
  const [wx, wz] = bayPoint(x, z)
  return out.set(wx, y, wz)
}
const STEP = 1 / 60

export class EndingMode implements GameMode {
  scene = new Scene()
  camera = new PerspectiveCamera(50, 1, 0.05, 420)
  t = 0
  private ended = false
  private readonly fx: Particles
  private hemi = new HemisphereLight(new Color('#ffffff'), new Color('#202040'), 1)
  private key = new DirectionalLight(new Color('#ffffff'), 1)
  private fog = new Fog(new Color('#000000'), 30, 200)
  private sky = new Color('#000000')
  private readonly valleySet = new Group()
  private readonly valley: Diorama
  private readonly labSet = new Group()
  private readonly cap: StasisCapsule
  private readonly gauss: GaussRig
  private readonly gaussRoot = new Group()
  private readonly gp = newGaussPose()
  private readonly pip: Rig
  private readonly pipRoot = new Group()
  private readonly atlas: Rig
  private lastCaption = ''
  private readonly pos = new Vector3()
  private readonly look = new Vector3()

  constructor(private readonly opts: EndingOptions) {
    const low = sceneQuality() === 'low'
    this.fx = new Particles(low ? 200 : 400)
    const s = this.scene
    s.background = this.sky
    s.fog = this.fog
    this.key.position.set(0.6, 1, 0.9)
    s.add(this.hemi, this.key, this.fx.points)
    this.valley = buildDiorama({ low })
    this.valleySet.add(this.valley.root)
    this.valleySet.position.copy(VALLEY_AT)
    s.add(this.valleySet)
    this.labSet.add(buildLabSet(), buildLabFrontSet())
    this.cap = buildStasisCapsule()
    this.cap.root.position.copy(GAUSS_CAP)
    this.cap.root.rotation.y = BAY.yaw + Math.PI / 2
    // Flux's, beside it: open since the intro, its lever thrown.
    const fluxCap = buildStasisCapsule()
    fluxCap.root.position.set(FLUX_CAP_AT.x, 0, FLUX_CAP_AT.z)
    fluxCap.root.rotation.y = BAY.yaw - Math.PI / 2
    fluxCap.setOpen(1)
    fluxCap.setLever(1)
    fluxCap.setInner('#dfe9ff', 0.06)
    this.labSet.add(this.cap.root, fluxCap.root)
    this.gauss = buildGauss()
    this.gaussRoot.add(this.gauss.root)
    this.labSet.add(this.gaussRoot)
    this.pip = buildPip()
    this.pipRoot.add(this.pip.root)
    this.labSet.add(this.pipRoot)
    this.atlas = buildAtlas()
    this.labSet.add(this.atlas.root)
    // Both turned out of the bay, toward the camera.
    this.pipRoot.rotation.y = BAY.yaw
    this.atlas.root.rotation.y = BAY.yaw
    s.add(this.labSet)
  }

  enter(): void {
    Object.assign(endingUi, { on: true, t: 0, caption: '', speaker: '', credits: false, card: false, roll: 0, sting: false })
    prefetchScene(stingBeats())
    setMusicTrack('intro')
    // The spoken captions (Gauss, Atlas): fetched now, played as each shows.
    for (const c of CAPTIONS) if (c.speaker) prefetchVoice(`ending.${c.key}`)
    try { getRenderer().compile(this.scene, this.camera) } catch { /* compiles on first draw */ }
  }

  /** Skip: straight to the end card. */
  skip(): void {
    if (this.sting) return this.sting.skip()
    if (this.t < CARD_FROM) this.t = CARD_FROM
    stopVoice()
  }

  /** A tap on the film: the next line (or the credits after the last). */
  advance(): void {
    if (this.sting) return this.sting.skip()
    if (this.t < CREDITS_FROM) this.t = nextBeat(this.t)
  }

  /** Vex's sting (S14, `vex.sting.doctorIn`): New Game+ starts after it. */
  private sting: StoryScene | null = null

  /** The card's choice. New Game+ plays the sting first: Vex is back. */
  choose(choice: 'ngplus' | 'lab'): void {
    if (this.ended || this.sting) return
    if (choice === 'ngplus') {
      endingUi.sting = true
      this.sting = new StoryScene(stingBeats(), 'center', { onEnd: () => this.finish('ngplus') })
      return
    }
    this.finish(choice)
  }

  private finish(choice: 'ngplus' | 'lab'): void {
    if (this.ended) return
    this.ended = true
    endingUi.on = false
    endingUi.sting = false
    this.opts.onEnd(choice)
  }

  update(dt: number): void {
    if (this.ended) return
    if (this.sting) {
      this.sting.update(dt)
      return
    }
    const before = this.t
    this.t += dt
    const t = this.t
    const c = captionAt(t)
    const key = c ? c.key : ''
    if (key !== this.lastCaption) {
      this.lastCaption = key
      endingUi.caption = key
      endingUi.speaker = c?.speaker ?? ''
      if (key) endingUi.seq++
      // A spoken caption speaks (`ending.<key>` in the voice catalog); a new one cuts the last.
      stopVoice()
      if (c?.speaker) playVoice(`ending.${key}`)
    }
    endingUi.t = t
    endingUi.credits = t >= CREDITS_FROM && t < CARD_FROM
    endingUi.roll = ramp(CREDITS_FROM, CARD_FROM, t)
    endingUi.card = t >= CARD_FROM
    // Beats with a sound.
    const crossed = (at: number) => before < at && t >= at
    if (crossed(FREE_FROM)) sfx('objective')
    if (crossed(OPEN_FROM)) sfx('door')
    if (crossed(STEP_TO)) sfx('levelUp')
    this.fx.update(dt)
  }

  render(_alpha: number, dt: number): void {
    tickLabScreens(this.t)
    const t = this.t
    const shot = shotAt(Math.min(t, SUNRISE_FROM + 1e9))
    this.valleySet.visible = shot !== 'lab'
    this.labSet.visible = shot === 'lab'
    if (shot === 'lab') this.renderLab(t)
    else this.renderValley(t, shot === 'sunrise')
    const cam = this.camera
    cam.position.copy(this.pos)
    cam.lookAt(this.look)
    const aspect = Math.max(0.2, cam.aspect)
    // A tall screen keeps the width: a wider vertical lens, capped.
    cam.fov = Math.min(80, aspect < 1 ? 60 / Math.max(0.55, aspect) : 50)
    cam.updateProjectionMatrix()
    getRenderer().setRenderTarget(null)
    getRenderer().clear()
    getRenderer().render(this.scene, cam)
    tickHud(dt)
  }

  private light(sky: string, ground: string, hemi: number, key: string, keyI: number, fogNear: number, fogFar: number): void {
    this.sky.set(sky)
    this.fog.color.set(sky)
    this.fog.near = fogNear
    this.fog.far = fogFar
    this.hemi.color.set(key)
    this.hemi.groundColor.set(ground)
    this.hemi.intensity = hemi
    this.key.color.set(key)
    this.key.intensity = keyI
  }

  private renderValley(t: number, sunrise: boolean): void {
    this.valley.animate(t)
    if (!sunrise) {
      // Still red, then the white ring frees it.
      if (t < FREE_FROM) this.valley.setSignal(1, 0)
      else this.valley.setFreed(ramp(FREE_FROM, FREE_TO, t))
      const k = ramp(FREE_FROM, FREE_TO, t)
      this.light(k < 0.5 ? '#2a1024' : '#1d2350', '#140c24', 1, k < 0.5 ? '#ff9a9a' : '#cfe0ff', 1, 45, 190)
      // A slow push in toward the Spire.
      const a = 0.6 + t * 0.03
      const r = 34 - t * 0.6
      this.pos.set(Math.cos(a) * r, 16 - t * 0.25, Math.sin(a) * r).add(VALLEY_AT)
      this.look.set(this.valley.spire.x, 4, this.valley.spire.z).add(VALLEY_AT)
      return
    }
    // Dawn: the whole valley in its own colours, the sky warming up.
    this.valley.setFreed(1)
    const d = ramp(SUNRISE_FROM, SUNRISE_FROM + 10, t)
    const sky = new Color('#20264f').lerp(new Color('#ff9f6a'), d)
    this.light(`#${sky.getHexString()}`, '#2a2440', 1.1, '#ffe2b8', 1.1 + 0.2 * d, 60, 230)
    const a = 2.2 + (t - SUNRISE_FROM) * 0.035
    this.pos.set(Math.cos(a) * 30, 11, Math.sin(a) * 30).add(VALLEY_AT)
    this.look.set(0, 3, 0).add(VALLEY_AT)
  }

  private renderLab(t: number): void {
    this.light('#0e1c3f', '#1a2340', 1.0, '#dbe8ff', 1.0, 18, 46)
    // The capsule thaws, opens; Gauss steps out, awake and warm.
    this.cap.setFrost(1 - ramp(THAW_FROM, THAW_TO, t))
    this.cap.setOpen(ramp(OPEN_FROM, OPEN_TO, t))
    this.cap.setHeart(0.5 + 0.5 * Math.sin(t * 5))
    this.cap.setLever(1)
    const step = ramp(STEP_FROM, STEP_TO, t)
    const gp = this.gp
    gp.asleep = 1 - ramp(OPEN_TO - 1, STEP_FROM, t)
    gp.look = step > 0.5 ? 0.6 : 0
    poseGauss(this.gauss, gp, t)
    setGaussGlow(this.gauss, ramp(THAW_FROM, STEP_TO, t), 0.5 + 0.5 * Math.sin(t * 3))
    const [sx, sz] = bayDir(1.3 * step, 1.4 * step)
    this.gaussRoot.position.set(GAUSS_CAP.x + sx, 0, GAUSS_CAP.z + sz)
    this.gaussRoot.rotation.y = BAY.yaw + 0.4 * step
    // Pip bouncing with joy once she is out; Atlas at hand.
    const joy = ramp(STEP_TO, STEP_TO + 0.5, t)
    animatePip(this.pip, t)
    bayAt(0.4, 1.6 + joy * Math.abs(Math.sin(t * 5)) * 0.5, 1.7, this.pipRoot.position)
    animateAtlas(this.atlas, t, t > 33.5 && t < 36 ? 1 : 0)
    bayAt(1.3, 1.5, 1.5, this.atlas.root.position)
    // The camera: a slow drift past the capsule toward her.
    const k = ramp(LAB_FROM, SUNRISE_FROM, t)
    bayAt(2.6 - 1.2 * k, 1.7, 5.9 - 1.0 * k, this.pos)
    const [lx, lz] = bayDir(0.8 * step, 0.6)
    this.look.set(GAUSS_CAP.x + lx, 1.3, GAUSS_CAP.z + lz)
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    endingUi.on = false
    this.scene.clear()
  }
}

/** The step the film runs on (the app's fixed step). */
export const ENDING_STEP = STEP
