import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, type Mesh } from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { buildAtlas, animateAtlas } from '../models/atlas'
import type { Rig } from '../models/kit'
import { playVoice } from '../audio/voice'
import { tickHud } from '../state/hud'
import { reactive } from 'vue'

/**
 * ─── Before a debrief: Atlas, while the film loads (#111) ────────────────────
 *
 * The debrief builds its city after the results, and for that while the
 * screen showed the beam-out's last frame: half a city from above, no ground
 * under it. Now the moment the debrief starts this mode takes the screen: the
 * splash's night blue, and Atlas looping through it, cute and talking —
 * "Great job! Another one down." then "Let's go to the lab." (voiced, its
 * bubble in `DebriefLayer`). The film replaces it once it is built and both
 * lines have had their time (`LOADER_MIN`).
 */

/** The two lines and when each starts (s). */
export const LOADER_LINES: ReadonlyArray<readonly [number, string]> = [
  [0.3, 'atlas.debrief.greatJob'],
  [2.5, 'atlas.debrief.toLab']
]
/** The loader stays up at least this long, so both lines are heard (s). */
export const LOADER_MIN = 4.4

/** What the HUD layer shows over it: on, and the line in Atlas's bubble. */
export const loaderUi = reactive({ on: false, line: '' })

/** Atlas's path through the frame (pure): a lazy figure eight. */
export const loaderPath = (t: number): { x: number; y: number; z: number; yaw: number } => {
  const x = Math.sin(t * 1.1) * 2.6
  const y = 0.1 + Math.sin(t * 2.2) * 0.7
  const z = Math.cos(t * 1.1) * 1.2
  const dx = Math.cos(t * 1.1) * 1.1 * 2.6
  return { x, y, z, yaw: Math.atan2(dx, 1.4) * 0.6 }
}

export class DebriefLoaderMode implements GameMode {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 100)
  private readonly atlas: Rig
  private t = 0
  private said = 0

  constructor() {
    this.scene.background = new Color('#111d42')
    this.scene.add(new HemisphereLight(new Color('#cfe0ff'), new Color('#140c24'), 1.1))
    const key = new DirectionalLight(new Color('#ffffff'), 1.2)
    key.position.set(2, 4, 5)
    this.scene.add(key)
    this.atlas = buildAtlas()
    this.atlas.root.scale.setScalar(2.6)
    this.scene.add(this.atlas.root)
    this.camera.position.set(0, 0.2, 5.2)
    this.camera.lookAt(0, 0.1, 0)
  }

  enter(): void {
    loaderUi.on = true
    loaderUi.line = ''
  }

  update(dt: number): void {
    this.t += dt
    const next = LOADER_LINES[this.said]
    if (next && this.t >= next[0]) {
      loaderUi.line = next[1]
      playVoice(next[1])
      this.said++
    }
  }

  /** Both lines heard? (`flow.startDebrief` waits for it.) */
  get done(): boolean {
    return this.t >= LOADER_MIN
  }

  render(alpha: number, dt: number): void {
    const t = this.t + alpha / 60
    const p = loaderPath(t)
    const r = this.atlas.root
    r.position.set(p.x, p.y, p.z)
    r.rotation.set(0, p.yaw, Math.sin(t * 1.8) * 0.12)
    const talking = loaderUi.line && this.said > 0 && t - LOADER_LINES[this.said - 1]![0] < 2 ? 1 : 0
    animateAtlas(this.atlas, t, talking)
    const g = getRenderer()
    const prev = g.getRenderTarget()
    g.setRenderTarget(null)
    g.clear()
    g.render(this.scene, this.camera)
    g.setRenderTarget(prev)
    tickHud(dt)
  }

  dispose(): void {
    loaderUi.on = false
    loaderUi.line = ''
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
