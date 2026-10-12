import { Color, Euler, Quaternion } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcone, pose, nudge, type Rig } from '../kit'

/**
 * ─── The Burrow Wyrm (the Deep Drill Mines' challenge mini-boss) ─────────────
 *
 * A mining machine that thinks it is a worm: a drill-bit head the size of a
 * barrel — a steel cone with a yellow screw thread round it, two ember eyes
 * in an armoured collar, a pair of mandibles either side of a glowing maw —
 * and behind it eight armoured ring segments, each a little smaller than
 * the one before, joined by seams that glow like a furnace, a fin on every
 * back, a spike at the tail. Nothing like the Drill Master's android frame.
 *
 * One skinned rig (`models/kit.ts`), but its segments are NOT a chain: every
 * segment hangs off the root on its own bone and the AI places each one on
 * the path the head has travelled (`WyrmPose.segs`, in the rig's frame), so
 * the body follows the head exactly — into the floor where it dived, up out
 * of the hole where it burst out, along every curve it slithered.
 *
 * Its tells: the spit rears it up tall with the head pulled back, the drill
 * stopped and the mandibles flung wide on the glowing maw; the dive rears it
 * and then plunges the head into the floor; the eruption throws it straight
 * up out of the ground, head to the sky.
 */

export const WYRM_COLORS = {
  plate: '#4a4f5c',
  dark: '#2c2f38',
  rust: '#8a5a3a',
  hazard: '#ffc21a',
  steel: '#c9ccd4',
  seam: '#ffa83a',
  maw: '#ff7a2a',
  eye: '#ff5a2a'
}

/** Its body segments, head to tail. */
export const WYRM_SEGS = 8
/** Each segment's radius (m), head end to tail. */
export const wyrmSegR = (i: number): number => 0.5 - (0.24 * i) / (WYRM_SEGS - 1)
/** Path distance from the head to the first segment, and between segments (m). */
export const WYRM_NECK = 0.78
export const WYRM_GAP = 0.6

/** A bone's place and heading in the rig's frame (radians: `ry` about up,
 *  `rx` its pitch, nose up negative). */
export interface WyrmBone { x: number; y: number; z: number; rx: number; ry: number }

/** What the AI tells the pose. */
export interface WyrmPose {
  head: WyrmBone
  segs: WyrmBone[]
  /** The drill's turn (radians, accumulated). */
  spin: number
  /** The mandibles: 0 shut … 1 flung wide (the spit's tell). */
  jaw: number
  /** Glow: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
}

const bone0 = (): WyrmBone => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0 })

export const newWyrmPose = (): WyrmPose => ({
  head: bone0(), segs: Array.from({ length: WYRM_SEGS }, bone0), spin: 0, jaw: 0, heat: 1, dying: 0, time: 0
})

export const buildBurrowWyrm = (c = WYRM_COLORS): Rig => burrowWyrmParts(c).build({ outline: 0.022, height: 2.4 })

/** The wyrm's rig, its parts laid on its bones, not yet built (the
 *  z-fighting test reads its parts). The pose places every bone. */
export const burrowWyrmParts = (c = WYRM_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('head', 'root', [0, 0.5, 0])
    .bone('drill', 'head', [0, 0, 0.42])
    .bone('jawL', 'head', [-0.4, -0.1, 0.34])
    .bone('jawR', 'head', [0.4, -0.1, 0.34])
  // At rest the body lies straight out behind the head (the pose moves every
  // bone; spread out, the parts never stack in the z-fighting test).
  for (let i = 0; i < WYRM_SEGS; i++) b.bone(`seg${i}`, 'root', [0, wyrmSegR(i), -(WYRM_NECK + i * WYRM_GAP)])

  // ── The head: an armoured collar, ember eyes, the maw behind the drill ──
  b.part('head', ell(0.56, 0.5, 0.52, 18, 12), c.plate)
  b.part('head', ell(0.5, 0.2, 0.46), c.dark, { p: [0, -0.3, -0.02] })
  b.part('head', torus(0.5, 0.075, 8, 24), c.hazard, { p: [0, 0, 0.3] })
  b.part('head', ell(0.36, 0.34, 0.16), c.maw, { p: [0, 0, 0.4], glow: true, outline: false })
  b.mirror((s) => {
    b.part('head', ell(0.1, 0.08, 0.06), c.eye, { p: [s * 0.3, 0.3, 0.38], r: [0, s * 0.4, 0], glow: true, outline: false })
    // Brow plates over the eyes.
    b.part('head', ell(0.2, 0.06, 0.16), c.rust, { p: [s * 0.27, 0.4, 0.3], r: [0.3, 0, s * 0.25] })
  })
  // A crest of plates down its back.
  for (let k = 0; k < 3; k++) b.part('head', rcone(0.09, 0.015, 0.3, 0.02, 8), c.rust, { p: [0, 0.5 - k * 0.04, 0.1 - k * 0.22], r: [-0.5, 0, 0] })
  // ── The drill bit: a steel cone along +z, its yellow screw thread ──
  b.part('drill', rcone(0.42, 0.03, 1.0, 0.03, 18), c.steel, { p: [0, 0, 0.5], r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 14; k++) {
    const t = k / 14
    const r = 0.42 * (1 - t) + 0.03 * t
    const a = t * Math.PI * 5
    b.part('drill', sph(0.055 + 0.05 * (1 - t), 8, 6), c.hazard, { p: [Math.cos(a) * r, Math.sin(a) * r, 0.04 + t * 0.92], outline: false })
  }
  // ── The mandibles: curved hooks either side of the maw ──
  b.mirror((s, t) => {
    b.part(`jaw${t}`, cap(0.07, 0.38, 8, 2), c.dark, { p: [0, 0, 0.2], r: [Math.PI / 2, s * 0.3, 0] })
    b.part(`jaw${t}`, rcone(0.07, 0.01, 0.26, 0.01, 8), c.steel, { p: [-s * 0.08, 0, 0.5], r: [Math.PI / 2, 0, s * 0.9] })
  })

  // ── The segments: armoured rings, a glowing seam ahead of each, a fin ──
  for (let i = 0; i < WYRM_SEGS; i++) {
    const r = wyrmSegR(i)
    const bn = `seg${i}`
    b.part(bn, ell(r, r * 0.94, 0.36, 16, 10), i % 2 ? c.plate : c.dark)
    b.part(bn, torus(r * 0.96, 0.07, 8, 22), i % 2 ? c.rust : c.hazard, { p: [0, 0, 0.15] })
    // The seam between it and the segment ahead: a ring of furnace glow in the gap.
    b.part(bn, torus(r * 0.78, 0.05, 6, 20), c.seam, { p: [0, 0, 0.33], glow: true, outline: false })
    b.part(bn, rcone(0.1 * (r / 0.5) + 0.03, 0.012, 0.36 * (r / 0.5) + 0.06, 0.015, 8), c.rust, { p: [0, r * 0.95, -0.02], r: [-0.45, 0, 0] })
    // Little cleated feet along its belly.
    b.mirror((s) => b.part(bn, cap(0.05, 0.1, 6, 2), c.dark, { p: [s * r * 0.75, -r * 0.62, 0], r: [0, 0, s * 0.6] }))
  }
  // The tail spike.
  const tr = wyrmSegR(WYRM_SEGS - 1)
  b.part(`seg${WYRM_SEGS - 1}`, rcone(tr * 0.75, 0.02, 0.6, 0.02, 12), c.steel, { p: [0, 0, -0.5], r: [-Math.PI / 2, 0, 0] })
  return b
}

const _e = new Euler(0, 0, 0, 'YXZ')
const _q = new Quaternion()
const place = (rig: Rig, name: string, o: WyrmBone): void => {
  const bn = rig.bones[name]
  if (!bn) return
  bn.position.set(o.x, o.y, o.z)
  _e.set(o.rx, o.ry, 0, 'YXZ')
  bn.quaternion.copy(_q.setFromEuler(_e))
}

const _glow = new Color()

/** Pose the wyrm for this frame (its bones where the AI put them). */
export const poseBurrowWyrm = (rig: Rig, p: WyrmPose): void => {
  const T = p.time
  place(rig, 'head', p.head)
  for (let i = 0; i < WYRM_SEGS; i++) place(rig, `seg${i}`, p.segs[i]!)
  pose(rig, 'drill', 0, 0, p.spin)
  // The spit's tell pushes the bit out on its shaft, baring the glowing maw.
  nudge(rig, 'drill', 0, 0, 0.32 * p.jaw)
  const open = 0.12 + 0.05 * Math.sin(T * 3) + 0.95 * p.jaw + 0.4 * p.dying
  pose(rig, 'jawL', 0, -open, 0)
  pose(rig, 'jawR', 0, open, 0)
  // The glow: the seams pulse down its length; brighter with every tell.
  const flick = 1 + 0.15 * Math.sin(T * 29) * Math.min(1, Math.max(0, p.heat - 1))
  const k = Math.max(0.2, p.heat * flick * (1 - 0.75 * p.dying))
  _glow.setRGB(k, k * 0.95, k * 0.9)
  rig.glowMaterial.color.copy(_glow)
}
