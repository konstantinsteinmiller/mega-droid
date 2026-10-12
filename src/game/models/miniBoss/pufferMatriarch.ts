import { Color } from 'three'
import { RigBuilder, sph, ell, torus, rcone, pose, nudge, scaleBone, type Rig } from '../kit'
import { buildPuffer, type EnemyColors } from '../enemies'

/**
 * ─── The Puffer Matriarch (the Tidewater Locks' challenge mini-boss) ─────────
 *
 * The Puffer Mine's queen: the same buoy-yellow pufferfish, but the size of
 * a small car, ringed with red spines, a CROWN of tall golden spines set
 * with glowing sea-glass gems on her head, a belly that glows teal, big
 * worried eyes, puckered coral lips, fluttering fins and a fan of a tail.
 * Three little puffers swim round her (her escorts): she lets them go as
 * drifting mines and new ones hatch.
 *
 * One skinned rig (`models/kit.ts`). The escorts hang off the root on bones
 * of their own that the AI places (`PufferPose.escorts`, in the rig's
 * frame); a mine she has let go is a separate small puffer rig
 * (`buildMatriarchMine`) the AI moves through the room.
 *
 * Her tells are BIG: she inflates to half again her size with every spine
 * standing out before she bounces; she sucks in her cheeks and puckers to a
 * point before the water jet; she rears back and coughs before the mines.
 */

export const MATRIARCH_COLORS = {
  main: '#ffc94a',
  deep: '#a8661a',
  spike: '#ff5a3a',
  gold: '#ffe27a',
  gem: '#5fd2ff',
  belly: '#7ff4ff',
  bellyBand: '#f3e3b0',
  lips: '#ff7a6a',
  eyeWhite: '#f4f6fb',
  eye: '#1e2a44'
}

/** The little puffers that swim round her. */
export const MATRIARCH_ESCORTS = 3

/** Her body's radius at build size (m). */
export const MATRIARCH_R = 0.95

export interface EscortPose { x: number; y: number; z: number; s: number; yaw: number }

/** What the AI tells the pose (0..1 unless said). */
export interface PufferPose {
  /** Inflated: the body swells, the spines stand out (the bounce's tell). */
  swell: number
  /** Cheeks in, lips puckered to a point (the jet's tell). */
  pucker: number
  /** The jet itself (lips wide, body pushed back). */
  jet: number
  /** Reared back, mouth open (the mines' tell). */
  cough: number
  /** Her roll as she bounces (radians, accumulated). */
  roll: number
  /** Glow: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
  escorts: EscortPose[]
}

export const newPufferPose = (): PufferPose => ({
  swell: 0, pucker: 0, jet: 0, cough: 0, roll: 0, heat: 1, dying: 0, time: 0,
  escorts: Array.from({ length: MATRIARCH_ESCORTS }, () => ({ x: 0, y: 0, z: 0, s: 1, yaw: 0 }))
})

/** She is drawn this much over her build size. */
export const MATRIARCH_SCALE = 1.25

export const buildPufferMatriarch = (c = MATRIARCH_COLORS): Rig => {
  const rig = pufferMatriarchParts(c).build({ outline: 0.02, height: 1.35 * MATRIARCH_SCALE })
  rig.root.scale.setScalar(MATRIARCH_SCALE)
  return rig
}

/** A mine she has let go: a little puffer in her colours. */
export const matriarchMineColors = (c = MATRIARCH_COLORS): EnemyColors =>
  ({ main: c.main, deep: c.deep, accent: c.spike, eye: c.eye, metal: c.gold })
export const buildMatriarchMine = (): Rig => buildPuffer(matriarchMineColors())

/** Her spines: rings of them round the body, clear of the crown and the face. */
const SPINES: Array<[number, number]> = []
for (const [pitch, n] of [[-0.75, 9], [-0.25, 13], [0.25, 13], [0.7, 10]] as const) {
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI * 2 + pitch * 0.7
    // Not over her face (the eyes and the lips).
    if (Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw))) < 0.75 && pitch > -0.5) continue
    SPINES.push([yaw, pitch])
  }
}

/** Her rig, its parts laid on its bones, not yet built (the z-fighting
 *  test reads its parts). */
export const pufferMatriarchParts = (c = MATRIARCH_COLORS): RigBuilder => {
  const R = MATRIARCH_R
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 0, 0])
    .bone('spines', 'body', [0, 0, 0])
    .bone('crown', 'body', [0, R * 0.86, -0.05])
    .bone('lips', 'body', [0, -0.18, R * 0.95])
    .bone('finL', 'body', [-R * 0.95, -0.05, -0.05])
    .bone('finR', 'body', [R * 0.95, -0.05, -0.05])
    .bone('tail', 'body', [0, 0.02, -R * 0.95])
  // The escorts round her at rest (the pose places each).
  for (let k = 0; k < MATRIARCH_ESCORTS; k++) {
    const a = (k / MATRIARCH_ESCORTS) * Math.PI * 2
    b.bone(`esc${k}`, 'root', [Math.sin(a) * 1.65, 0, Math.cos(a) * 1.65])
  }

  // ── The body: the buoy-yellow sphere, a darker underside, the glowing belly ──
  b.part('body', sph(R, 24, 18), c.main)
  b.part('body', ell(R * 0.86, R * 0.5, R * 0.86, 18, 10), c.deep, { p: [0, -R * 0.45, -0.04] })
  // The glowing belly: a pale band, the glow along its middle.
  b.part('body', ell(0.6, 0.34, 0.4, 16, 10), c.bellyBand, { p: [0, -0.52, 0.5], r: [0.45, 0, 0] })
  b.part('body', ell(0.4, 0.2, 0.3, 14, 8), c.belly, { p: [0, -0.56, 0.62], r: [0.45, 0, 0], glow: true, outline: false })
  // ── The face: big worried eyes, a highlight in each ──
  b.mirror((s) => {
    b.part('body', sph(0.21, 14, 10), c.eyeWhite, { p: [s * 0.36, 0.22, 0.8] })
    b.part('body', sph(0.12, 12, 8), c.eye, { p: [s * 0.37, 0.21, 0.97] })
    b.part('body', sph(0.035, 6, 4), '#ffffff', { p: [s * 0.33, 0.26, 1.07], glow: true, outline: false })
    // A brow, raised.
    b.part('body', ell(0.17, 0.045, 0.06), c.deep, { p: [s * 0.36, 0.45, 0.82], r: [0.3, 0, s * -0.25] })
  })
  // The lips (the jet comes out here).
  b.part('lips', torus(0.13, 0.065, 8, 16), c.lips, { p: [0, 0, 0.04] })
  b.part('lips', ell(0.1, 0.1, 0.05), '#3a1a22', { p: [0, 0, 0.02], outline: false })
  // ── The spines ──
  for (const [yaw, pitch] of SPINES) {
    const x = Math.sin(yaw) * Math.cos(pitch) * R
    const y = Math.sin(pitch) * R
    const z = Math.cos(yaw) * Math.cos(pitch) * R
    b.part('spines', rcone(0.075, 0.008, 0.3, 0.008, 6), c.spike, { p: [x, y, z], r: [Math.PI / 2 - pitch, yaw, 0] })
  }
  // ── The crown: a gold band, tall spines, a gem at the foot of each ──
  b.part('crown', torus(0.36, 0.06, 8, 22), c.gold, { r: [Math.PI / 2, 0, 0] })
  const CROWN = 7
  for (let k = 0; k < CROWN; k++) {
    const a = (k / CROWN) * Math.PI * 2
    const tall = k === 0 ? 0.62 : 0.44
    const x = Math.sin(a) * 0.34
    const z = Math.cos(a) * 0.34
    b.part('crown', rcone(0.075, 0.01, tall, 0.01, 8), c.gold, { p: [x * 1.12, tall / 2 + 0.02, z * 1.12], r: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3] })
    b.part('crown', sph(0.06, 8, 6), c.gem, { p: [x * 1.24, 0.05, z * 1.24], glow: true, outline: false })
  }
  // ── Fins and the tail fan ──
  b.mirror((s, t) => b.part(`fin${t}`, ell(0.05, 0.3, 0.38), c.deep, { p: [s * 0.06, 0, -0.08] }))
  b.mirror((s) => b.part('tail', ell(0.05, 0.36, 0.3), c.deep, { p: [s * 0.18, 0, -0.22], r: [0, s * 0.5, s * 0.5] }))

  // ── The escorts: little puffers (each on its own bone) ──
  for (let k = 0; k < MATRIARCH_ESCORTS; k++) {
    const bn = `esc${k}`
    b.part(bn, sph(0.22, 14, 10), c.main)
    b.part(bn, ell(0.18, 0.1, 0.18), c.deep, { p: [0, -0.11, 0] })
    b.mirror((s) => {
      b.part(bn, sph(0.055, 8, 6), c.eyeWhite, { p: [s * 0.08, 0.06, 0.19] })
      b.part(bn, sph(0.03, 6, 4), c.eye, { p: [s * 0.085, 0.06, 0.235], outline: false })
    })
    for (let i = 0; i < 8; i++) {
      const yaw = (i / 8) * Math.PI * 2 + 0.4
      if (Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw))) < 0.6) continue
      b.part(bn, rcone(0.025, 0.004, 0.09, 0.004, 5), c.spike, { p: [Math.sin(yaw) * 0.22, 0, Math.cos(yaw) * 0.22], r: [Math.PI / 2, yaw, 0], outline: false })
    }
  }
  return b
}

const _glow = new Color()

/** Pose her for this frame (every channel arrives eased). */
export const posePufferMatriarch = (rig: Rig, p: PufferPose): void => {
  const T = p.time
  const swell = p.swell
  // Inflated: the body grows half again, the spines further still; the jet's
  // pucker squeezes the cheeks in; a shiver at the top of the swell.
  const shiver = swell > 0.6 ? Math.sin(T * 38) * 0.03 * swell : 0
  const sq = 1 - 0.12 * p.pucker + 0.06 * p.jet
  scaleBone(rig, 'body', (1 + 0.5 * swell) * sq + shiver, (1 + 0.5 * swell) * (1 + 0.05 * p.pucker) - shiver, (1 + 0.5 * swell) * (1 + 0.08 * p.pucker))
  scaleBone(rig, 'spines', 1 + 0.3 * swell)
  nudge(rig, 'body', 0, 0.06 * Math.sin(T * 1.7) * (1 - p.dying), -0.18 * p.jet)
  pose(rig, 'body',
    p.roll - 0.35 * p.cough + 0.15 * p.pucker + 0.5 * p.dying,
    0,
    0.07 * Math.sin(T * 1.3) + Math.sin(T * 25) * 0.08 * p.dying)
  // The lips: puckered to a point, then blown wide.
  scaleBone(rig, 'lips', 1 - 0.35 * p.pucker + 0.6 * p.jet + 0.5 * p.cough, 1 - 0.35 * p.pucker + 0.6 * p.jet + 0.8 * p.cough, 1 + 1.2 * p.pucker)
  nudge(rig, 'lips', 0, 0, 0.12 * p.pucker)
  // The crown tips back with the cough and rides the swell.
  pose(rig, 'crown', -0.2 * p.cough + 0.05 * Math.sin(T * 2.1), 0, 0)
  const flap = Math.sin(T * (7 + 6 * p.swell)) * (0.5 + 0.3 * p.swell)
  pose(rig, 'finL', 0, 0.3 + flap, 0)
  pose(rig, 'finR', 0, -0.3 - flap, 0)
  pose(rig, 'tail', 0, Math.sin(T * 4.5) * 0.35, 0)
  for (let k = 0; k < p.escorts.length; k++) {
    const s = p.escorts[k]!
    rig.bones[`esc${k}`]?.position.set(s.x, s.y, s.z)
    pose(rig, `esc${k}`, 0, s.yaw, 0)
    scaleBone(rig, `esc${k}`, Math.max(0.001, s.s))
  }
  // The glow: the belly, the crown's gems.
  const k = Math.max(0.25, p.heat * (1 + 0.1 * Math.sin(T * 3)) * (1 - 0.7 * p.dying))
  _glow.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_glow)
}
