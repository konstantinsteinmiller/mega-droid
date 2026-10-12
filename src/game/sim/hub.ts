import {
  Scene, PerspectiveCamera, Color, HemisphereLight, DirectionalLight, Fog, Group, Mesh, MeshBasicMaterial,
  AdditiveBlending, CylinderGeometry, DoubleSide, Quaternion, Vector3, type BufferGeometry
} from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { buildHero, animateHeroIdle, animateHeroVictory } from '../models/hero'
import { buildPip, animatePip } from '../models/npc'
import { buildTeleporter } from '../models/props'
import { rcyl, rbox, torus, sph, ell, cap, xform, paint, paintBy, merge, lathe } from '../models/kit'
import { toonVC, glowVC, outlineMat } from '../models/toon'
import { THEMES } from '../world/themes'
import type { Rig } from '../models/kit'
import { heroColors, profile } from '../state/profile'
import { buildGauss, poseGauss, newGaussPose, setGaussGlow, type GaussRig } from '../models/gauss'
import { Particles } from '../fx/particles'
import { makeBlobShadow } from '../fx/markers'
import { tickHud } from '../state/hud'

/** The ceiling lamp: its glowing ring (radius, height) round a housing. */
export const LAMP_R = 3.6
export const LAMP_Y = 7.2
/** The gantry the lamp hangs from: its beams' middle height, and its
 *  posts' distance out (behind the back wall's ends and its middle). */
export const GANTRY_Y = 8.6
const GANTRY_OUT = 8.6
const SPOKES = 6

/** A straight member from `a` to `b` (each end set into what it joins). */
export interface LampMount { a: [number, number, number]; b: [number, number, number]; r: number }

/** Every member that holds the lamp up, from the ring to the floor: six
 *  spokes ring → housing, a hanger rod housing → gantry, the gantry's two
 *  beams and its three posts down to the floor. The ring used to float at
 *  7.2 m with nothing above it (placement audit 2026-10-12). */
export const labLampMounts = (): LampMount[] => {
  const out: LampMount[] = []
  for (let k = 0; k < SPOKES; k++) {
    const a = (k / SPOKES) * Math.PI * 2 + Math.PI / SPOKES
    out.push({ a: [Math.cos(a) * 1.15, LAMP_Y + 0.38, Math.sin(a) * 1.15], b: [Math.cos(a) * LAMP_R, LAMP_Y, Math.sin(a) * LAMP_R], r: 0.045 })
  }
  // The hanger: from inside the housing's dome up into the cross beam.
  out.push({ a: [0, LAMP_Y + 0.6, 0], b: [0, GANTRY_Y, 0], r: 0.09 })
  // The posts: behind the back wall's two ends and its middle, up into the beams.
  for (const [x, z] of [[-GANTRY_OUT, 0], [GANTRY_OUT, 0], [0, -GANTRY_OUT]] as const) out.push({ a: [x, -0.1, z], b: [x, GANTRY_Y, z], r: 0.28 })
  return out
}

/** The lamp's parts, one geometry each (`tests/game/labLamp.test.ts` checks
 *  them for coplanar faces): the ring, its housing, the members, the beams. */
export const labLampParts = (): { toon: BufferGeometry[]; glow: BufferGeometry[] } => {
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = [xform(paint(torus(LAMP_R, 0.09, 6, 48), '#bff3ff'), [0, LAMP_Y, 0], [Math.PI / 2, 0, 0])]
  toon.push(xform(paint(ell(1.4, 0.4, 1.4, 20, 10), '#2f4580'), [0, LAMP_Y + 0.4, 0]))
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const q = new Quaternion()
  for (const m of labLampMounts()) {
    dir.set(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
    const len = dir.length()
    q.setFromUnitVectors(up, dir.normalize())
    const g = paint(rcyl(m.r, len, m.r * 0.3, 10), m.r > 0.2 ? '#5d6a82' : '#8a97ad')
    g.applyQuaternion(q)
    g.translate((m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2)
    toon.push(g)
  }
  // The gantry: a beam across the lab over the posts at the wall's ends, and
  // a slimmer one from the back post to it (its faces inside the first's).
  toon.push(xform(paint(rbox(GANTRY_OUT * 2 + 0.8, 0.44, 0.5, 0.12), '#3b4458'), [0, GANTRY_Y + 0.12, 0]))
  toon.push(xform(paint(rbox(0.38, 0.32, GANTRY_OUT + 0.4, 0.1), '#3b4458'), [0, GANTRY_Y + 0.12, -GANTRY_OUT / 2]))
  return { toon, glow }
}

/**
 * The lab set: the round platform, the dome's glowing panels, the consoles and
 * the ceiling lamp. The hub stands on it, and the intro's lab shots reuse it
 * (`story/intro.ts`).
 */
export const buildLabSet = (): Group => {
  const g = new Group()
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  // Floor: a big rounded disc with rings
  toon.push(xform(paint(rcyl(9, 0.4, 0.2, 48), '#26365f'), [0, -0.2, 0]))
  toon.push(xform(paint(torus(3.2, 0.06, 6, 48), '#3a5a9a'), [0, 0.01, 0], [Math.PI / 2, 0, 0]))
  toon.push(xform(paint(torus(5.6, 0.06, 6, 64), '#3a5a9a'), [0, 0.01, 0], [Math.PI / 2, 0, 0]))
  // Back wall: curved panels in a half ring behind the pad
  for (let k = 0; k < 11; k++) {
    const a = Math.PI + (k / 10) * Math.PI
    const x = Math.cos(a) * 8.2
    const z = Math.sin(a) * 8.2
    toon.push(paintBy(xform(rbox(2.6, 6, 0.5, 0.35), [x, 3, z], [0, -a - Math.PI / 2, 0]), (_x, y) => (y > 5.3 ? '#4fd8ff' : y < 0.7 ? '#1c2a50' : '#2f4580')))
    glow.push(xform(paint(cap(0.07, 3.2, 8, 2), k % 2 ? '#7ff4ff' : '#ffd84a'), [Math.cos(a) * 7.9, 3.2, Math.sin(a) * 7.9]))
    toon.push(xform(paint(rcyl(0.32, 6.4, 0.12, 12), '#5d6a82'), [Math.cos(a + 0.14) * 8.1, 3.2, Math.sin(a + 0.14) * 8.1]))
  }
  // Consoles either side
  for (const s of [-1, 1]) {
    toon.push(xform(paint(rbox(1.6, 1.1, 0.9, 0.35), '#3b4458'), [s * 3.6, 0.55, -2.4], [0, -s * 0.5, 0]))
    toon.push(xform(paint(rbox(1.4, 0.8, 0.12, 0.4), '#1d2438'), [s * 3.55, 1.45, -2.65], [-0.35, -s * 0.5, 0]))
    glow.push(xform(paint(rbox(1.2, 0.6, 0.05, 0.5), s > 0 ? '#3cff9a' : '#3cc8ff'), [s * 3.55, 1.47, -2.58], [-0.35, -s * 0.5, 0]))
    // Glass capsule tubes with glowing fluid
    toon.push(xform(paint(rcyl(0.55, 0.35, 0.12, 20), '#5d6a82'), [s * 5.4, 0.18, -0.6]))
    toon.push(xform(paint(rcyl(0.55, 0.35, 0.12, 20), '#5d6a82'), [s * 5.4, 3.3, -0.6]))
    glow.push(xform(paint(lathe([[0, 0], [0.42, 0.05], [0.42, 2.6], [0, 2.65]], 20), s > 0 ? '#7fffc8' : '#8ab8ff'), [s * 5.4, 0.35, -0.6]))
    toon.push(xform(paint(sph(0.35, 14, 10), '#9aa7bd'), [s * 5.4, 1.6, -0.6]))
  }
  // Ceiling lamp ring, hung from its gantry
  const lamp = labLampParts()
  toon.push(...lamp.toon)
  glow.push(...lamp.glow)
  const geo = merge(toon)
  g.add(new Mesh(geo, toonVC()))
  const ol = new Mesh(geo, outlineMat(0.03))
  ol.renderOrder = -1
  g.add(ol)
  g.add(new Mesh(merge(glow), glowVC()))
  // Soft light shaft over the pad
  const shaft = new Mesh(
    new CylinderGeometry(1.2, 1.6, 7, 24, 1, true),
    new MeshBasicMaterial({ color: new Color('#7ff4ff'), transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  )
  shaft.position.y = 3.6
  g.add(shaft)
  return g
}

/**
 * ─── The hub backdrop ────────────────────────────────────────────────────────
 *
 * Prof. Gauss's lab: a round platform under a dome of glowing panels, the
 * teleporter pad with Flux idling on it (in his current gear colours) and
 * Pip bobbing beside him. It is a stage for the hub menus, not a walkable
 * town — the camera frames Flux beside the UI and sways gently.
 */
export class HubMode implements GameMode {
  scene = new Scene()
  camera = new PerspectiveCamera(40, 1, 0.1, 200)
  private hero: Rig
  private heroRoot = new Group()
  private pip: Rig
  private pipRoot = new Group()
  /** Dr. Gauss, awake in her lab once the ending has played (#102). */
  private gauss: GaussRig | null = null
  private readonly gaussPose = newGaussPose()
  private fx = new Particles(300)
  private t = 0
  private victoryT = -1
  private ring: Mesh

  constructor() {
    const th = THEMES.scrapyard
    this.scene.background = new Color('#0e1c3f')
    this.scene.fog = new Fog(new Color('#0e1c3f'), 18, 46)
    this.scene.add(new HemisphereLight(new Color('#dbe8ff'), new Color('#1a2340'), 1.1))
    const key = new DirectionalLight(new Color('#ffffff'), 1.25)
    key.position.set(0.6, 1, 0.9)
    const rim = new DirectionalLight(new Color('#7fd6ff'), 0.7)
    rim.position.set(-1, 0.6, -0.8)
    this.scene.add(key, rim)
    this.scene.add(buildLabSet())

    const pad = buildTeleporter(th)
    this.scene.add(pad.root)
    this.ring = pad.ring
    ;(pad.ringMat as MeshBasicMaterial).opacity = 0.12

    this.hero = buildHero(heroColors())
    this.heroRoot.add(this.hero.root)
    this.heroRoot.position.set(0, 0.38, 0)
    this.heroRoot.rotation.y = 0.25
    this.scene.add(this.heroRoot, makeBlobShadow(0.55))

    this.pip = buildPip()
    this.pipRoot.add(this.pip.root)
    this.pipRoot.position.set(-1.25, 1.7, 0.4)
    this.scene.add(this.pipRoot)
    this.scene.add(this.fx.points)
    if (profile.world.seen.includes('ending')) {
      this.gauss = buildGauss()
      this.gauss.root.position.set(2.2, 0, -1.7)
      this.gauss.root.rotation.y = -0.5
      setGaussGlow(this.gauss, 1)
      const shadow = makeBlobShadow(0.5)
      shadow.position.x = 2.2
      shadow.position.z = -1.7
      this.scene.add(this.gauss.root, shadow)
    }
  }

  /** Rebuild Flux in his current gear colours (after equipping). */
  refreshHero(): void {
    this.heroRoot.remove(this.hero.root)
    this.hero.mesh.geometry.dispose()
    this.hero = buildHero(heroColors())
    this.heroRoot.add(this.hero.root)
    this.fx.riseRing(0, 0.4, 0, '#7ff4ff', 0.8, 18)
  }

  /** A little cheer (level up, new weapon). */
  celebrate(): void {
    this.victoryT = 0
    this.fx.riseRing(0, 0.4, 0, '#ffd84a', 0.9, 26)
  }

  update(dt: number): void {
    this.t += dt
    if (this.victoryT >= 0) {
      this.victoryT += dt
      if (this.victoryT > 2.4) this.victoryT = -1
    }
    this.fx.update(dt)
    if (Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2
      this.fx.emit({ x: Math.cos(a) * 0.8, y: 0.4, z: Math.sin(a) * 0.8, vy: 0.8 + Math.random(), color: '#7ff4ff', size: 0.12, sizeEnd: 0.02, life: 1.4 })
    }
  }

  render(_alpha: number, dt: number): void {
    if (this.victoryT >= 0) animateHeroVictory(this.hero, this.victoryT)
    else animateHeroIdle(this.hero, this.t)
    animatePip(this.pip, this.t)
    if (this.gauss) {
      // She glances at Flux now and then.
      this.gaussPose.look = Math.sin(this.t * 0.3) > 0.6 ? 0.5 : 0
      poseGauss(this.gauss, this.gaussPose, this.t)
    }
    this.ring.rotation.y += dt * 0.5
    // Frame Flux beside the menus: right third in landscape, upper half in portrait.
    const cam = this.camera
    const portrait = cam.aspect < 1
    // Pip hovers at Flux's shoulder; the narrow portrait frame would cut
    // him off at the top-left corner, so he swaps to the cannon side there.
    this.pipRoot.position.x = portrait ? 0.9 : -1.25
    this.pipRoot.position.y = (portrait ? 1.1 : 1.7) + Math.sin(this.t * 1.7) * 0.12
    const sway = Math.sin(this.t * 0.25) * 0.35
    if (portrait) {
      // The menu sheet covers the lower ~60 %: aim low so Flux stands in
      // the upper band of the screen.
      cam.position.set(sway * 0.6, 1.2, 7.2)
      cam.lookAt(0, -0.95, 0)
      cam.fov = 46
    } else {
      cam.position.set(-1.6 + sway, 1.5, 5.6)
      cam.lookAt(-1.7, 1.0, 0)
      cam.fov = 38
    }
    cam.updateProjectionMatrix()
    const r = getRenderer()
    r.clear()
    r.render(this.scene, cam)
    tickHud(dt)
  }

  resize(w: number, h: number): void {
    this.fx.setScale(h * getRenderer().getPixelRatio(), this.camera.fov)
  }

  dispose(): void {
    this.fx.dispose()
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
