import { Color } from 'three'
import { RigBuilder, sph, ell, torus, rcyl, rcone, rbox, lathe, pose, nudge, scaleBone, type Rig } from '../kit'

/**
 * ─── The Saw Gyro (the Rotor Run's challenge mini-boss) ──────────────────────
 *
 * A battle top: a hazard-yellow hull that spins on a steel point, a skirt of
 * saw teeth round its waist with a red-hot rim, and on its crown the gyro
 * core — a cyan sphere in a spinning gimbal, closed under three armour
 * petals. A visor ring that does not spin carries its one long eye, so it
 * always looks at Flux while the rest of it whirls.
 *
 * Its tells (`GyroPose`), all big:
 *  - SPIN-UP (the ricochet): it leans back on its point, the skirt blurring
 *    faster and faster (`spinUp`), sparks pouring off the teeth;
 *  - LAUNCH (the saw blades): it squats, the skirt flaring wide (`flare`);
 *  - DIZZY (after a big ricochet): it wobbles round on its point like a top
 *    running down (`dizzy`) and the petals fall open — the core is bare.
 * The glow (rim, core, eye) follows `heat`.
 *
 * `buildSawBlade` is one of the blades it throws (`sim/miniBoss/sawGyro.ts`
 * rolls them along their lanes).
 *
 * Proportions in metres at scale 1: ~1.85 m tall, the skirt 2.4 m across.
 */

export const GYRO_COLORS = {
  hull: '#e8a62a',
  dark: '#2c2d34',
  steel: '#b9c1cc',
  band: '#1c1d23',
  hot: '#ff5a2a',
  core: '#5ff0ff',
  eye: '#fff07a'
}

export interface GyroPose {
  /** The hull's and the skirt's turn (radians; the AI spins them). */
  spinA: number
  sawA: number
  /** The ricochet's wind-up: leaning back, the skirt blurring. */
  spinUp: number
  /** The blades' wind-up: squat, skirt flared. */
  flare: number
  /** Dizzy after a big ricochet: wobbling round, the petals open. */
  dizzy: number
  /** Mid-ricochet: tipped into its run. */
  rush: number
  heat: number
  dying: number
  time: number
}

export const newGyroPose = (): GyroPose => ({ spinA: 0, sawA: 0, spinUp: 0, flare: 0, dizzy: 0, rush: 0, heat: 1, dying: 0, time: 0 })

export const GYRO_SCALE = 1.1

/** Height of its core over the floor at scale 1 (the weak spot). */
export const GYRO_CORE_Y = 1.52

export const buildSawGyro = (c = GYRO_COLORS): Rig => {
  const rig = sawGyroParts(c).build({ outline: 0.022, height: 1.85 * GYRO_SCALE })
  rig.root.scale.setScalar(GYRO_SCALE)
  return rig
}

export const sawGyroParts = (c = GYRO_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    // The pivot is its point on the floor: it tips and wobbles round it.
    .bone('body', 'root', [0, 0.02, 0])
    .bone('spin', 'body', [0, 0, 0])
    .bone('skirt', 'body', [0, 0.66, 0])
    .bone('core', 'body', [0, GYRO_CORE_Y, 0])
    .bone('gimbal', 'core', [0, 0, 0])
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    b.bone(`petal${k}`, 'body', [Math.sin(a) * 0.14, 1.36, Math.cos(a) * 0.14], [0, a, 0])
  }

  // ── The hull: a top's profile, point to crown, spinning ──
  b.part('spin', lathe([[0, 0], [0.07, 0.04], [0.28, 0.3], [0.58, 0.56], [0.76, 0.76], [0.8, 0.92], [0.72, 1.12], [0.52, 1.28], [0.3, 1.36], [0.16, 1.4], [0, 1.41]], 24), c.hull)
  // The steel point it spins on.
  b.part('spin', rcone(0.02, 0.12, 0.22, 0.01, 12), c.steel, { p: [0, 0.1, 0] })
  // Hazard bands round the hull, and its bolts (they show it spinning).
  b.part('spin', torus(0.66, 0.045, 8, 28), c.band, { p: [0, 0.58, 0], r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    b.part('spin', rbox(0.16, 0.2, 0.08, 0.4), k % 2 ? c.band : c.dark, { p: [Math.sin(a) * 0.8, 0.86, Math.cos(a) * 0.8], r: [0, a, 0] })
  }
  b.part('spin', torus(0.42, 0.04, 8, 24), c.dark, { p: [0, 1.31, 0], r: [Math.PI / 2, 0, 0] })

  // ── The visor ring: it does not spin; the long eye looks at Flux ──
  b.part('body', torus(0.79, 0.06, 8, 32), c.dark, { p: [0, 1.04, 0], r: [Math.PI / 2, 0, 0] })
  b.part('body', rbox(0.62, 0.12, 0.12, 0.5), c.dark, { p: [0, 1.04, 0.8] })
  b.part('body', rbox(0.5, 0.07, 0.06, 0.5), c.eye, { p: [0, 1.04, 0.87], glow: true, outline: false })

  // ── The saw skirt: a steel disc, teeth round its rim, a red-hot edge ──
  b.part('skirt', rcyl(1.08, 0.08, 0.03, 40, 2), c.steel)
  b.part('skirt', torus(1.0, 0.03, 6, 48), c.hot, { p: [0, 0.055, 0], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2
    // A tooth: a short cone pointing out and raked forward (the way it spins):
    // its axis turned from up to +x, then round to its place on the rim.
    b.part('skirt', rcone(0.08, 0.008, 0.22, 0.006, 6), c.steel, {
      p: [Math.sin(a) * 1.13, 0, Math.cos(a) * 1.13], r: [0, a - Math.PI / 2 + 0.5, -Math.PI / 2], outline: false
    })
  }

  // ── The crown: the gyro core in its gimbal, under three petals ──
  b.part('core', sph(0.24, 16, 12), c.core, { glow: true, outline: false })
  b.part('gimbal', torus(0.25, 0.02, 6, 28), c.steel)
  b.part('gimbal', torus(0.24, 0.018, 6, 28), c.steel, { r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 3; k++) {
    // A shell tile wrapped round the core: from over its top down past its
    // side to the hull, its inner face clear of the core (no part inside
    // another's face); shut, the three hide it but for a glint at the top.
    b.part(`petal${k}`, ell(0.32, 0.05, 0.34, 14, 8), c.hull, { p: [0, 0.24, 0.18], r: [0.9, 0, 0] })
    b.part(`petal${k}`, ell(0.05, 0.03, 0.24, 8, 6), c.band, { p: [0, 0.268, 0.215], r: [0.9, 0, 0] })
  }
  return b
}

/** One of its saw blades: a toothed disc on edge, a hot rim, rolling on `spin`. */
export const sawBladeParts = (c = GYRO_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0]).bone('spin', 'root', [0, 0.42, 0])
  b.part('spin', rcyl(0.36, 0.07, 0.025, 28, 2), c.steel, { r: [0, 0, Math.PI / 2] })
  b.part('spin', torus(0.3, 0.025, 6, 32), c.hot, { r: [0, Math.PI / 2, 0], glow: true, outline: false })
  b.part('spin', sph(0.08, 10, 8), c.dark)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    b.part('spin', rcone(0.06, 0.006, 0.16, 0.005, 6), c.steel, { p: [0, Math.cos(a) * 0.4, Math.sin(a) * 0.4], r: [a + 0.4, 0, 0], outline: false })
  }
  return b
}

export const buildSawBlade = (c = GYRO_COLORS): Rig => sawBladeParts(c).build({ outline: 0.018, height: 0.84 })

const _heat = new Color()

export const poseSawGyro = (rig: Rig, p: GyroPose): void => {
  const T = p.time
  // The wobble: a top running down circles its tilt round its point.
  const prec = T * (4 + 4 * p.dizzy)
  // (Dizzy, its core swings ~0.25 m off its axis: still inside the weak spot.)
  const tilt = 0.03 + 0.14 * p.dizzy + 0.12 * p.dying
  pose(rig, 'body', -0.28 * p.spinUp + 0.22 * p.rush + Math.sin(prec) * tilt, 0, Math.cos(prec) * tilt)
  // The squat: the crown drops and the skirt flares.
  nudge(rig, 'body', 0, -0.12 * p.flare - 0.1 * p.dying, 0)
  pose(rig, 'spin', 0, p.spinA, 0)
  pose(rig, 'skirt', 0, p.sawA, 0)
  scaleBone(rig, 'skirt', 1 + 0.16 * p.flare + 0.05 * p.spinUp, 1, 1 + 0.16 * p.flare + 0.05 * p.spinUp)
  pose(rig, 'gimbal', T * (2 + 6 * p.heat), T * 1.3, 0)
  // The petals: shut, fluttering in the spin-up, wide open when dizzy.
  for (let k = 0; k < 3; k++) {
    const open = 1.25 * p.dizzy + 0.08 * p.spinUp * Math.sin(T * 40 + k) + 0.6 * p.dying
    pose(rig, `petal${k}`, open, 0, 0)
  }
  scaleBone(rig, 'core', 1 + 0.18 * p.dizzy * (0.5 + 0.5 * Math.sin(T * 8)))
  const flick = 1 + 0.15 * Math.sin(T * 29) * Math.min(1, p.heat - 1)
  const k = Math.max(0.25, p.heat * flick * (1 - 0.7 * p.dying))
  _heat.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_heat)
}

export const poseSawBlade = (rig: Rig, roll: number): void => {
  pose(rig, 'spin', roll, 0, 0)
}
