import { Color } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcyl, rbox, pose, nudge, scaleBone, type Rig } from '../kit'

/**
 * ─── The Sentinel Prototype (the Fortress's challenge mini-boss) ─────────────
 *
 * Vex's security sentinel before it went into production: a gunmetal block
 * of a machine on two tank treads, Vex-violet seams on its plating, a heavy
 * turret head with one red beam-emitter eye in a ringed housing, a
 * four-tube mortar pod on its back — and, circling it at chest height, three
 * shield drones: small round drones each behind a hexagonal shield plate,
 * on a faint ring of light.
 *
 * Its tells (`SentinelPose`), all big:
 *  - MORTAR: the hull rocks back, the pod pitches up and its tube mouths
 *    glow (`mortar`), then it bucks with each volley;
 *  - BEAM: the turret leans in and the eye swells and burns white (`charge`),
 *    then holds steady while it sweeps (`beam`);
 *  - a broken drone shrinks away (`drones[k]` 0) and grows back.
 *
 * Proportions in metres at scale 1: ~2.3 m tall, the drones' ring 3.5 m across.
 */

export const SENTINEL_COLORS = {
  hull: '#4a4f63',
  deep: '#24262f',
  plate: '#7a8094',
  tread: '#1c1d22',
  vex: '#a46bff',
  eye: '#ff3048',
  shield: '#59d8ff'
}

export interface SentinelPose {
  /** The turret's turn from the hull (radians). */
  turret: number
  /** The drones' ring's turn from the hull (radians). */
  ring: number
  /** Each drone there (1) or broken (0). */
  drones: [number, number, number]
  /** The treads' roll (radians). */
  roll: number
  mortar: number
  /** A volley's kick (decays). */
  kick: number
  charge: number
  beam: number
  heat: number
  dying: number
  time: number
}

export const newSentinelPose = (): SentinelPose => ({
  turret: 0, ring: 0, drones: [1, 1, 1], roll: 0, mortar: 0, kick: 0, charge: 0, beam: 0, heat: 1, dying: 0, time: 0
})

export const SENTINEL_SCALE = 1.1
/** The drones' ring: its radius and height at scale 1. */
export const RING_R = 1.75
export const RING_Y = 1.35
/** The eye's height and reach forward at scale 1 (the weak spot, the beam). */
export const EYE_Y = 1.62
export const EYE_FWD = 0.5

export const buildSentinelPrototype = (c = SENTINEL_COLORS): Rig => {
  const rig = sentinelParts(c).build({ outline: 0.024, height: 2.3 * SENTINEL_SCALE })
  rig.root.scale.setScalar(SENTINEL_SCALE)
  return rig
}

export const sentinelParts = (c = SENTINEL_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('hull', 'root', [0, 0.95, 0])
    .bone('turret', 'hull', [0, 0.62, 0.02])
    .bone('eye', 'turret', [0, 0.05, EYE_FWD - 0.02])
    .bone('mortar', 'hull', [0, 0.5, -0.66])
    .bone('ring', 'root', [0, RING_Y, 0])
  b.mirror((s, t) => {
    b.bone(`tread${t}`, 'root', [s * 0.8, 0.36, 0])
      .bone(`cog${t}`, `tread${t}`, [s * 0.3, 0.02, 0])
  })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    b.bone(`drone${k}`, 'ring', [Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R], [0, a, 0])
  }

  // ── The treads ──
  b.mirror((_s, t) => {
    b.part(`tread${t}`, rbox(0.42, 0.62, 1.72, 0.45), c.tread)
    for (let k = 0; k < 3; k++) b.part(`tread${t}`, rcyl(0.17, 0.5, 0.05, 14, 2), c.deep, { p: [0, -0.06, -0.55 + k * 0.55], r: [0, 0, Math.PI / 2] })
    b.part(`tread${t}`, rbox(0.46, 0.08, 1.5, 0.5), c.plate, { p: [0, 0.33, 0] })
  })
  // The cogs at the treads' sides: they turn as it rolls.
  b.mirror((_s, t) => {
    b.part(`cog${t}`, rcyl(0.22, 0.05, 0.02, 8, 1), c.plate, { r: [0, 0, Math.PI / 2] })
    b.part(`cog${t}`, rbox(0.07, 0.4, 0.07, 0.4), c.deep)
  })

  // ── The hull: a heavy block, Vex seams, a chest plate with its emblem ──
  b.part('hull', rbox(1.5, 0.95, 1.3, 0.3), c.hull)
  b.part('hull', rbox(1.0, 0.5, 0.12, 0.35), c.plate, { p: [0, 0.04, 0.66] })
  b.part('hull', ell(0.16, 0.16, 0.05), c.vex, { p: [0, 0.06, 0.73], glow: true, outline: false })
  b.part('hull', rbox(1.2, 0.18, 1.1, 0.35), c.deep, { p: [0, -0.5, 0] })
  b.mirror((s) => {
    // Shoulder armour, a violet seam down each.
    b.part('hull', rbox(0.46, 0.42, 0.74, 0.35), c.plate, { p: [s * 0.84, 0.36, 0.02] })
    b.part('hull', cap(0.025, 0.56, 6, 2), c.vex, { p: [s * 1.075, 0.36, 0.02], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
    b.part('hull', cap(0.025, 0.7, 6, 2), c.vex, { p: [s * 0.62, -0.12, 0.665], glow: true, outline: false })
  })

  // ── The turret: a heavy head, the beam emitter its one eye ──
  b.part('turret', rbox(0.92, 0.52, 0.84, 0.45), c.hull)
  b.part('turret', rbox(0.98, 0.12, 0.5, 0.5), c.deep, { p: [0, 0.26, 0.14] })
  b.part('turret', cap(0.025, 0.4, 6, 2), c.plate, { p: [0.32, 0.5, -0.24] })
  b.part('turret', sph(0.05, 8, 6), c.eye, { p: [0.32, 0.73, -0.24], glow: true, outline: false })
  b.part('eye', torus(0.21, 0.06, 10, 24), c.deep)
  b.part('eye', sph(0.17, 16, 12), c.eye, { p: [0, 0, -0.04], glow: true, outline: false })

  // ── The mortar pod: four tubes, their mouths glowing ──
  b.part('mortar', rbox(0.82, 0.32, 0.52, 0.4), c.deep)
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.11, 0.11]) {
      b.part('mortar', rcyl(0.1, 0.46, 0.03, 12, 2), c.plate, { p: [x, 0.3, z] })
      b.part('mortar', torus(0.075, 0.022, 6, 14), c.eye, { p: [x, 0.54, z], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
    }
  }

  // ── The drones' ring and the drones ──
  b.part('ring', torus(RING_R, 0.018, 4, 64), c.shield, { glow: true, outline: false, r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 3; k++) {
    const d = `drone${k}`
    b.part(d, sph(0.22, 14, 10), c.deep)
    b.part(d, sph(0.09, 10, 8), c.shield, { p: [0, 0.19, 0.06], glow: true, outline: false })
    // The shield: a hexagonal plate outward of the drone, a glowing hex rim.
    b.part(d, rcyl(0.5, 0.06, 0.02, 6, 1), c.shield, { p: [0, 0, 0.36], r: [Math.PI / 2, Math.PI / 6, 0] })
    b.part(d, torus(0.48, 0.03, 6, 6), c.shield, { p: [0, 0, 0.42], r: [0, 0, Math.PI / 6], glow: true, outline: false })
    b.mirror((s) => b.part(d, rbox(0.06, 0.22, 0.26, 0.4), c.plate, { p: [s * 0.24, 0, -0.04] }))
  }
  return b
}

const _heat = new Color()

export const poseSentinel = (rig: Rig, p: SentinelPose): void => {
  const T = p.time
  // The hull: rocked back for the mortar, a kick per volley, sagging dead.
  nudge(rig, 'hull', 0, Math.sin(T * 1.8) * 0.015 - 0.06 * p.kick - 0.25 * p.dying, -0.05 * p.kick)
  pose(rig, 'hull', -0.12 * p.mortar - 0.08 * p.kick + 0.1 * p.charge + 0.25 * p.dying, 0, Math.sin(T * 30) * 0.03 * p.dying)
  // The turret: turned to its aim, leaning in for the beam.
  pose(rig, 'turret', 0.18 * p.charge + 0.1 * p.beam - 0.15 * p.mortar + 0.3 * p.dying, p.turret, 0)
  scaleBone(rig, 'eye', 1 + 0.45 * p.charge + 0.15 * p.beam * Math.sin(T * 50))
  // The pod lies stowed back; it swings up to fire.
  pose(rig, 'mortar', -0.9 * (1 - p.mortar), 0, 0)
  pose(rig, 'ring', 0, p.ring, 0)
  for (let k = 0; k < 3; k++) {
    const s = Math.max(0.001, p.drones[k]! * (1 - p.dying))
    scaleBone(rig, `drone${k}`, s)
    nudge(rig, `drone${k}`, 0, Math.sin(T * 2.4 + k * 2.1) * 0.07, 0)
  }
  pose(rig, 'cogL', p.roll, 0, 0)
  pose(rig, 'cogR', p.roll, 0, 0)
  const flick = 1 + 0.15 * Math.sin(T * 27) * Math.min(1, p.heat - 1)
  const k = Math.max(0.25, p.heat * flick * (1 - 0.7 * p.dying))
  _heat.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_heat)
}
