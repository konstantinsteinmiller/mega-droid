import {
  AdditiveBlending, BufferAttribute, Color, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry, Sprite,
  SpriteMaterial, TorusGeometry, Vector3
} from 'three'
import { glowTexture } from '../world/textures'

/**
 * ─── What a shot looks like ──────────────────────────────────────────────────
 *
 * One place for the look of every shot in flight, so a cutscene's charged
 * shot is the game's own (the intro drew a plain glowing ball before; the
 * real one has a core, a glow, a comet tail and rings it sheds).
 *
 * `sim/combat.ts` pools these parts per shot; `buildChargedShot` wraps one
 * set for a scene that flies a single shot along its own path.
 */

/** Core and glow colours, the core's radius (m) and the glow sprite's size, per kind of shot. */
export const SHOT_LOOK: Record<string, { core: string; glow: string; r: number; g: number }> = {
  pellet: { core: '#fff6b0', glow: '#ffe066', r: 0.085, g: 0.55 },
  charge1: { core: '#eaffb0', glow: '#9dff5a', r: 0.15, g: 1.0 },
  charge2: { core: '#e6fbff', glow: '#3ce0ff', r: 0.24, g: 1.9 },
  // The Overload: a gold-white core in the epic violet (the prototype tier's).
  charge3: { core: '#fff6d6', glow: '#b46cff', r: 0.42, g: 3.2 },
  enemy: { core: '#fff0e0', glow: '#ff5a3a', r: 0.12, g: 0.8 },
  shell: { core: '#3b4458', glow: '#ff7a3a', r: 0.22, g: 1.0 },
  reflect: { core: '#ffffff', glow: '#7ff4ff', r: 0.16, g: 1.2 },
  special: { core: '#ffffff', glow: '#ffffff', r: 0.2, g: 1.2 },
  // A golem's rock: a stone mesh (fx/rubble.ts) in a faint dust halo that
  // flashes white in the parry window like every blockable shot
  rock: { core: '#6a645a', glow: '#6e5a40', r: 0.19, g: 0.9 }
}

export type ChargeKind = 'charge1' | 'charge2' | 'charge3'

/** A charged shot is more than a bigger ball: a comet tail streams behind it
 *  and it sheds energy rings that widen and fade in its wake, more of both
 *  the fuller the charge, and a full one crackles. `tail` is the tail's
 *  length and `rings` their count, in core radii; `crackle` the chance per
 *  tick of a spark jumping off it. */
export const CHARGE_AURA: Record<ChargeKind, { tail: number; rings: number; crackle: number }> = {
  charge1: { tail: 4, rings: 1, crackle: 0 },
  charge2: { tail: 6, rings: 2, crackle: 0.45 },
  charge3: { tail: 10, rings: 3, crackle: 1 }
}
const MAX_RINGS = 3
/** Rings shed per second (each one's cycle). */
const RING_RATE = 3.4

/** The comet tail: a cone from the core (z = 0) back to a point at z = −1,
 *  fading to nothing along its length (additive: black draws nothing). */
const tailGeo = (() => {
  const g = new ConeGeometry(1, 1, 14, 4, true)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, -0.5)
  const p = g.attributes.position!
  const c = new Float32Array(p.count * 3)
  for (let k = 0; k < p.count; k++) c.fill(Math.pow(Math.max(0, 1 + p.getZ(k)), 1.6), k * 3, k * 3 + 3)
  g.setAttribute('color', new BufferAttribute(c, 3))
  return g
})()
/** An energy ring, square to the flight (+Z). */
const ringGeo = new TorusGeometry(1, 0.08, 6, 28)
const _dir = new Vector3()
const Z_AXIS = new Vector3(0, 0, 1)

const auraMat = (vertexColors: boolean): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color: new Color('#ffffff'), vertexColors, transparent: true, blending: AdditiveBlending,
    depthWrite: false, toneMapped: false, side: DoubleSide
  })

type AuraMesh = Mesh<ConeGeometry, MeshBasicMaterial>

/** Children: the tail, its white-hot inner tail, then MAX_RINGS rings. */
export const buildAura = (): Group => {
  const g = new Group()
  const tail = new Mesh(tailGeo, auraMat(true))
  tail.material.opacity = 0.6
  const inner = new Mesh(tailGeo, auraMat(true))
  inner.material.opacity = 0.8
  g.add(tail, inner)
  for (let k = 0; k < MAX_RINGS; k++) g.add(new Mesh(ringGeo, auraMat(false)))
  for (const m of g.children) m.renderOrder = 6
  return g
}

/** An aura in a charge's colours: `glow` the tail and rings, `core` the inner tail; as many rings as the kind sheds. */
export const tintAura = (aura: Group, kind: ChargeKind, glow: string, core: string): void => {
  const [tail, inner, ...rings] = aura.children as AuraMesh[]
  tail!.material.color.set(glow)
  inner!.material.color.set(core)
  for (let k = 0; k < rings.length; k++) {
    rings[k]!.material.color.set(glow)
    rings[k]!.visible = k < CHARGE_AURA[kind].rings
  }
}

/**
 * A charged shot's tail and rings at (x, y, z), facing along its flight
 * (vx, vy, vz); `grow` is its start-small factor, `clock` any steady time
 * (s). Returns the core's radius for this instant (it throbs).
 */
export const poseAura = (
  aura: Group, kind: ChargeKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, grow: number, clock: number
): number => {
  const A = CHARGE_AURA[kind]
  const r = SHOT_LOOK[kind]!.r
  aura.position.set(x, y, z)
  // Turned in its own space (not `lookAt`, which reads the world): right under any parent.
  aura.quaternion.setFromUnitVectors(Z_AXIS, _dir.set(vx, vy, vz).normalize())
  aura.scale.setScalar(r * Math.max(0.35, grow))
  const [tail, inner, ...rings] = aura.children as AuraMesh[]
  const flick = 1 + 0.08 * Math.sin(clock * 57)
  tail!.scale.set(0.95, 0.95, A.tail * flick)
  inner!.scale.set(0.45, 0.45, A.tail * 0.7 * flick)
  // Each ring is born at the core, then drifts back, widens and fades
  for (let k = 0; k < A.rings; k++) {
    const ring = rings[k]!
    const t = clock * RING_RATE + k / A.rings
    const ph = t - Math.floor(t)
    ring.position.z = -ph * A.tail * 0.6
    ring.scale.setScalar(1.15 + ph * 1.5)
    ring.material.opacity = 0.85 * (1 - ph)
  }
  return r * (1 + 0.14 * Math.sin(clock * 42))
}

const coreGeo = new SphereGeometry(1, 12, 8)

/** One charged shot for a scene to fly itself: the game's glow, core, tail and rings. */
export interface ChargedShotFx {
  /** Add to the scene (it places itself in that parent's space). */
  root: Group
  /** Show it at `at`, flying along `dir`, `size` times the game's (a scene may want it bigger on screen). */
  fly(x: number, y: number, z: number, dx: number, dy: number, dz: number, clock: number, size?: number): void
  hide(): void
}

export const buildChargedShot = (kind: ChargeKind = 'charge2'): ChargedShotFx => {
  const L = SHOT_LOOK[kind]!
  const root = new Group()
  const sprite = new Sprite(new SpriteMaterial({ map: glowTexture(), color: new Color(L.glow), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  sprite.renderOrder = 6
  const core = new Mesh(coreGeo, new MeshBasicMaterial({ color: new Color(L.core), toneMapped: false }))
  const aura = buildAura()
  tintAura(aura, kind, L.glow, L.core)
  root.add(sprite, core, aura)
  sprite.scale.setScalar(L.g)
  root.visible = false
  return {
    root,
    fly: (x, y, z, dx, dy, dz, clock, size = 1) => {
      root.visible = true
      root.position.set(x, y, z)
      root.scale.setScalar(size)
      core.scale.setScalar(poseAura(aura, kind, 0, 0, 0, dx, dy, dz, 1, clock))
    },
    hide: () => { root.visible = false }
  }
}
