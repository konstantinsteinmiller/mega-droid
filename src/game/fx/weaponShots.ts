import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type BufferGeometry } from 'three'
import { rcyl, rcone, torus, sph, ell, rbox, lathe, xform, paint, merge } from '../models/kit'
import { toonVC, glowVC, outlineMat } from '../models/toon'

/**
 * ─── What a copied weapon's shot IS ──────────────────────────────────────────
 *
 * The Core Masters' shots used to be glowing balls in a weapon's colour, told
 * apart only by a particle trail. Each one now flies as a small themed machine
 * part — a drill bit that screws through the air, a horseshoe magnet with red
 * and blue poles, an ice crystal, a scrap shard, a rotor drone, a spinning
 * blade, a bubble, a pair of crossed leaves — the same part for the player's
 * copy and for the Master's own attack.
 *
 * `sim/combat.ts` hangs one prop on a pooled shot (`CombatSystem.setShotStyle`)
 * and poses it every frame (`poseShotProp`); the flame wave and the lightning
 * arc are not here: fire is a wall of real flames, lightning is an instant bolt.
 *
 * Every prop is built once per style (geometry and materials shared) and
 * cloned per pooled shot as a few meshes: a toon body with its ink outline, a
 * glowing part, and for a bubble a see-through shell.
 */

export const SHOT_STYLES = ['scrapBurst', 'iceLance', 'magnetPull', 'drillBomb', 'bubbleLance', 'neonBlade', 'droneSwarm', 'galeGuard'] as const
export type ShotStyle = (typeof SHOT_STYLES)[number]

export const isShotStyle = (id: string): id is ShotStyle => (SHOT_STYLES as readonly string[]).includes(id)

interface Spec {
  toon: BufferGeometry[]
  glow: BufferGeometry[]
  /** A see-through shell (additive), in this colour. */
  ghost?: { geo: BufferGeometry[]; color: string; opacity: number }
  /** The geometry's long axis: 'y' is turned onto the flight (+Z), 'z' already is. */
  along: 'y' | 'z'
  /** Faces its flight; false: it tumbles where it is. */
  oriented: boolean
  /** Turn rates (rad/s) about the flight axis (or the world's, if not oriented). */
  spin: { x?: number; y?: number; z?: number }
  /** A drone's rotor: its own fast turn about its own up. */
  rotor?: { geo: BufferGeometry; at: [number, number, number]; rate: number }
  /** A bubble's wobble (0: none). */
  pulse?: number
  /** Metres long at size 1 (the player's shot; a Master's is larger). */
  size: number
}

const STEEL = '#c9d3e6'
const WHITE = '#ffffff'

/** Parts of the screw-tipped drill bomb: a banded bore head with a helical
 *  ridge, a dark body with a glowing ring and four fins, a hot exhaust. */
const drillParts = (): Spec => {
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  // Bore head (the cone, tip +Y, base at y 0.06 radius 0.17).
  toon.push(xform(paint(rcone(0.17, 0.02, 0.5, 0.01, 12), '#d7dce8'), [0, 0.31, 0]))
  // The helical ridge: beads climbing the cone, two full turns.
  const beads = 16
  for (let k = 0; k < beads; k++) {
    const t = k / (beads - 1)
    const y = 0.1 + t * 0.4
    const r = 0.17 - (y - 0.06) * 0.3 + 0.014
    const a = t * Math.PI * 4
    glow.push(xform(paint(sph(0.03, 6, 4), '#ffb12a'), [Math.cos(a) * r, y, Math.sin(a) * r]))
  }
  // Body: dark casing, a hot band round it.
  toon.push(xform(paint(rcyl(0.19, 0.3, 0.04, 12), '#6b5a4a'), [0, -0.1, 0]))
  glow.push(xform(paint(torus(0.195, 0.022, 5, 14), '#ffb12a'), [0, -0.1, 0], [Math.PI / 2, 0, 0]))
  // Four tail fins.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    toon.push(xform(paint(rbox(0.14, 0.2, 0.025, 0.3, 6, 4), '#ff7a2a'), [Math.cos(a) * 0.22, -0.26, Math.sin(a) * 0.22], [0, -a, 0]))
  }
  // Exhaust glow.
  glow.push(xform(paint(sph(0.1, 8, 6), '#ffe08a'), [0, -0.32, 0]))
  return { toon, glow, along: 'y', oriented: true, spin: { z: 22 }, size: 0.8 }
}

/** The horseshoe magnet: a steel arch, red and blue poles tipped white,
 *  opening onto its flight so it reaches for its mark. */
const magnetParts = (): Spec => {
  const R = 0.22
  const toon: BufferGeometry[] = [
    // The arch (an upper half ring turned to open towards +Y).
    xform(paint(torus(R, 0.07, 8, 16, Math.PI), STEEL), [0, 0, 0], [0, 0, Math.PI])
  ]
  const glow: BufferGeometry[] = []
  for (const [s, c] of [[-1, '#ff4a5e'], [1, '#5a8cff']] as const) {
    toon.push(xform(paint(rcyl(0.085, 0.16, 0.01, 10), c), [s * R, 0.08, 0]))
    toon.push(xform(paint(rcyl(0.09, 0.05, 0.01, 10), '#f4f7ff'), [s * R, 0.185, 0]))
  }
  // The field between the poles.
  glow.push(xform(paint(sph(0.04, 8, 6), WHITE), [0, 0.14, 0]))
  return { toon, glow, along: 'y', oriented: true, spin: { z: 5 }, size: 0.75 }
}

/** The ice lance: a faceted crystal with a bright core and three shards at its tail. */
const iceParts = (): Spec => {
  const toon: BufferGeometry[] = [
    xform(paint(lathe([[0, -0.45], [0.09, -0.3], [0.11, -0.05], [0.07, 0.3], [0, 0.55]], 6), '#bff6ff'))
  ]
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    toon.push(xform(paint(rcone(0.045, 0.002, 0.24, 0.01, 5), '#8ff2ff'), [Math.cos(a) * 0.13, -0.42, Math.sin(a) * 0.13], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]))
  }
  const glow: BufferGeometry[] = [
    xform(paint(lathe([[0, -0.3], [0.04, -0.05], [0.03, 0.3], [0, 0.45]], 6), WHITE))
  ]
  return { toon, glow, along: 'y', oriented: true, spin: { z: 7 }, size: 0.85 }
}

/** The scrap shard: a bent steel plate with a rivet and a hot edge. It tumbles. */
const scrapParts = (): Spec => {
  const toon: BufferGeometry[] = [
    xform(paint(rbox(0.2, 0.34, 0.07, 0.15, 6, 4), STEEL), [0, 0, 0], [0.2, 0, 0.35]),
    xform(paint(rbox(0.12, 0.14, 0.05, 0.15, 6, 4), '#6f7a90'), [0.1, 0.17, 0.02], [0, 0.3, -0.4]),
    xform(paint(rcyl(0.04, 0.09, 0.01, 8), '#ffb04a'), [0.02, -0.04, 0.05], [0.2, 0, 0.35 + Math.PI / 2])
  ]
  const glow: BufferGeometry[] = [xform(paint(sph(0.035, 6, 4), '#ffb04a'), [-0.09, -0.15, 0])]
  return { toon, glow, along: 'z', oriented: false, spin: { x: 11, z: 7 }, size: 0.7 }
}

/** The rotor drone: a dark pod with a lime eye, a tail fin, a whirling rotor. */
const droneParts = (): Spec => {
  const toon: BufferGeometry[] = [
    xform(paint(ell(0.11, 0.08, 0.17, 10, 8), '#3a3f4f')),
    xform(paint(rcyl(0.02, 0.06, 0.005, 6), STEEL), [0, 0.1, 0]),
    xform(paint(rbox(0.025, 0.11, 0.11, 0.3, 4, 4), '#b8ff5a'), [0, 0.04, -0.2], [0.35, 0, 0])
  ]
  const glow: BufferGeometry[] = [xform(paint(sph(0.045, 8, 6), '#b8ff5a'), [0, 0, 0.15])]
  const rotor = merge([
    paint(rbox(0.46, 0.012, 0.05, 0.4, 8, 3), '#e6ffb0'),
    xform(paint(rbox(0.46, 0.012, 0.05, 0.4, 8, 3), '#e6ffb0'), [0, 0.003, 0], [0, Math.PI / 2, 0])
  ])
  return { toon, glow, rotor: { geo: rotor, at: [0, 0.14, 0], rate: 40 }, along: 'z', oriented: true, spin: {}, size: 0.7 }
}

/** The neon blade: a crescent of light, a cyan edge inside a magenta one, a
 *  white heart. It spins flat, like the boomerang it is. */
const bladeParts = (): Spec => {
  const arc = Math.PI * 1.25
  const glow: BufferGeometry[] = [
    xform(paint(torus(0.32, 0.05, 6, 18, arc), '#ff3fd2'), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.5]),
    xform(paint(torus(0.25, 0.026, 6, 18, arc), '#3ff4ff'), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.5]),
    xform(paint(sph(0.055, 8, 6), WHITE))
  ]
  const toon: BufferGeometry[] = [xform(paint(rcyl(0.08, 0.05, 0.01, 8), '#2a1840'), [0, -0.05, 0])]
  return { toon, glow, along: 'z', oriented: false, spin: { y: 26 }, size: 0.8 }
}

/** The bubble: a see-through sphere, a small one riding it, a bright glint. */
const bubbleParts = (): Spec => {
  const geo = [
    paint(sph(0.3, 16, 12), WHITE),
    xform(paint(sph(0.11, 10, 8), WHITE), [0.27, 0.2, 0.05])
  ]
  const glow: BufferGeometry[] = [
    xform(paint(sph(0.055, 8, 6), WHITE), [-0.11, 0.13, 0.15]),
    xform(paint(sph(0.025, 6, 4), WHITE), [0.25, 0.22, 0.1])
  ]
  return { toon: [], glow, ghost: { geo, color: '#5fd2ff', opacity: 0.42 }, along: 'z', oriented: false, spin: { y: 2.5 }, pulse: 14, size: 0.9 }
}

/** The gale leaf: two crossed leaves that roll along their flight. */
const leafParts = (): Spec => {
  const toon: BufferGeometry[] = [
    xform(paint(ell(0.1, 0.022, 0.3, 10, 6), '#7fffc8')),
    xform(paint(ell(0.022, 0.1, 0.3, 10, 6), '#bffff2'))
  ]
  const glow: BufferGeometry[] = [xform(paint(sph(0.045, 8, 6), '#e8fff6'))]
  return { toon, glow, along: 'z', oriented: true, spin: { z: 18 }, size: 0.7 }
}

const BUILD: Record<ShotStyle, () => Spec> = {
  drillBomb: drillParts,
  magnetPull: magnetParts,
  iceLance: iceParts,
  scrapBurst: scrapParts,
  droneSwarm: droneParts,
  neonBlade: bladeParts,
  bubbleLance: bubbleParts,
  galeGuard: leafParts
}

const specs = new Map<ShotStyle, Spec>()
const specOf = (id: ShotStyle): Spec => {
  let s = specs.get(id)
  if (!s) { s = BUILD[id](); specs.set(id, s) }
  return s
}

/** Each prop's separate parts, for the z-fighting guard (`tests/game/weaponShots.test.ts`). */
export const shotPropParts = (id: ShotStyle): { toon: BufferGeometry[]; glow: BufferGeometry[]; ghost: BufferGeometry[] } => {
  const s = specOf(id)
  return { toon: s.toon, glow: s.glow, ghost: s.ghost?.geo ?? [] }
}

// ─── One prop on one pooled shot ─────────────────────────────────────────────

export interface ShotProp {
  /** Position, scale and (if it flies straight) heading. */
  root: Group
  /** The turning part inside `root`. */
  spin: Group
  style: ShotStyle
  oriented: boolean
  rates: { x: number; y: number; z: number }
  pulse: number
  rotor: Mesh | null
  rotorRate: number
  /** Metres long at size 1. */
  size: number
}

const ghostMats = new Map<string, MeshBasicMaterial>()
const ghostMat = (color: string, opacity: number): MeshBasicMaterial => {
  const key = `${color}|${opacity}`
  let m = ghostMats.get(key)
  if (!m) {
    m = new MeshBasicMaterial({
      color: new Color(color), transparent: true, opacity, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide, toneMapped: false
    })
    ghostMats.set(key, m)
  }
  return m
}

interface Built { toon: BufferGeometry | null; glow: BufferGeometry | null; ghost: BufferGeometry | null; rotor: BufferGeometry | null }
const built = new Map<ShotStyle, Built>()
const builtOf = (id: ShotStyle): Built => {
  let b = built.get(id)
  if (!b) {
    const s = specOf(id)
    b = {
      toon: s.toon.length ? merge(s.toon) : null,
      glow: s.glow.length ? merge(s.glow) : null,
      ghost: s.ghost ? merge(s.ghost.geo) : null,
      rotor: s.rotor?.geo ?? null
    }
    built.set(id, b)
  }
  return b
}

export const buildShotProp = (id: ShotStyle): ShotProp => {
  const s = specOf(id)
  const b = builtOf(id)
  const root = new Group()
  const spin = new Group()
  const frame = new Group()
  if (s.along === 'y') frame.rotation.x = Math.PI / 2
  spin.add(frame)
  root.add(spin)
  if (b.toon) {
    const body = new Mesh(b.toon, toonVC())
    const line = new Mesh(b.toon, outlineMat(0.018))
    line.renderOrder = -1
    frame.add(body, line)
  }
  if (b.glow) {
    const g = new Mesh(b.glow, glowVC())
    g.renderOrder = 6
    frame.add(g)
  }
  if (b.ghost && s.ghost) {
    const g = new Mesh(b.ghost, ghostMat(s.ghost.color, s.ghost.opacity))
    g.renderOrder = 6
    frame.add(g)
  }
  let rotor: Mesh | null = null
  if (b.rotor && s.rotor) {
    rotor = new Mesh(b.rotor, toonVC())
    rotor.position.set(...s.rotor.at)
    frame.add(rotor)
  }
  root.visible = false
  return {
    root, spin, style: id, oriented: s.oriented,
    rates: { x: s.spin.x ?? 0, y: s.spin.y ?? 0, z: s.spin.z ?? 0 },
    pulse: s.pulse ?? 0, rotor, rotorRate: s.rotor?.rate ?? 0, size: s.size
  }
}

const Z_AXIS = new Vector3(0, 0, 1)
const _dir = new Vector3()

/**
 * Place a prop at (x, y, z) flying along (vx, vy, vz). `size`: a multiplier on
 * its own length; `clock`: any steadily growing time (s), which turns it.
 */
export const poseShotProp = (p: ShotProp, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, clock: number): void => {
  p.root.position.set(x, y, z)
  p.root.scale.setScalar(size * p.size)
  if (p.oriented && vx * vx + vy * vy + vz * vz > 1e-6) p.root.quaternion.setFromUnitVectors(Z_AXIS, _dir.set(vx, vy, vz).normalize())
  else if (!p.oriented) p.root.quaternion.identity()
  p.spin.rotation.set(p.rates.x * clock, p.rates.y * clock, p.rates.z * clock)
  if (p.pulse) {
    const w = Math.sin(clock * p.pulse) * 0.09
    p.spin.scale.set(1 + w, 1 - w, 1 + w)
  }
  if (p.rotor) p.rotor.rotation.y = clock * p.rotorRate
}
