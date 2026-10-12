import { Color } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcyl, rcone, rbox, paintBy, pose, nudge, scaleBone, type Rig } from '../kit'

/**
 * ─── The Cinder Hound (the Blaze Refinery's challenge mini-boss) ─────────────
 *
 * A furnace on four legs: a soot-black iron hound the size of a pony, its
 * molten core glowing through a grille on its back and through the vents
 * down its flanks, a firebox of a head with ember eyes and a jaw that drops
 * open on a glowing throat, two exhaust stacks on its shoulders and a tail
 * of chain links with an ember at the tip. Nothing of the Blaze Master's
 * humanoid frame: it runs, crouches, lunges and howls.
 *
 * One skinned rig like every machine (`models/kit.ts`). The pose takes what
 * the AI is doing (`HoundPose`): its gait, the crouch before a lunge, the
 * lunge itself, the breath's wind-up and blast, the howl. Every tell is
 * BIG — a crouch drops the body a third of its height, the breath throws the
 * head back and opens the jaw — and the glow material brightens with it
 * (`heat`), so a ten-year-old reads "it is about to do something" from
 * across the room.
 *
 * Proportions in metres at scale 1: shoulder ~1.25 m, nose to tail ~2.6 m.
 */

export const HOUND_COLORS = {
  iron: '#5a4842',
  soot: '#2c2426',
  plate: '#9a5a32',
  brass: '#c27a2c',
  molten: '#ff7a1a',
  core: '#ffd24a',
  eye: '#fff06a'
}

/** What the AI tells the pose (all 0..1 unless said). */
export interface HoundPose {
  /** Locomotion: how much it is running, and its gait phase (radians). */
  run: number
  phase: number
  /** The lunge's tell: the body drops, hind legs coil. */
  crouch: number
  /** Mid-lunge: stretched out flat. */
  lunge: number
  /** The flame breath's wind-up (head back, jaw opening, chest swelling). */
  inhale: number
  /** The breath itself (head forward and low, jaw wide). */
  breath: number
  /** The howl (head up, jaw open). */
  howl: number
  /** Glow strength: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  /** Death throes: the body sags and shudders. */
  dying: number
  time: number
}

export const newHoundPose = (): HoundPose => ({ run: 0, phase: 0, crouch: 0, lunge: 0, inhale: 0, breath: 0, howl: 0, heat: 1, dying: 0, time: 0 })

/** Body (hips) height at rest (m). */
const HIP = 1.02

/** It is drawn this much over its build size (the hit volume and weak spot
 *  in `sim/miniBoss/cinderHound.ts` are measured at this size). */
export const HOUND_SCALE = 1.15

export const buildCinderHound = (c = HOUND_COLORS): Rig => {
  const rig = cinderHoundParts(c).build({ outline: 0.022, height: 1.6 * HOUND_SCALE })
  rig.root.scale.setScalar(HOUND_SCALE)
  return rig
}

/** The hound's rig, its parts laid on its bones, not yet built (the
 *  z-fighting test reads its parts). */
export const cinderHoundParts = (c = HOUND_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, HIP, 0])
    .bone('neck', 'body', [0, 0.18, 0.62])
    .bone('head', 'neck', [0, 0.26, 0.3])
    .bone('jaw', 'head', [0, -0.14, 0.04])
    .bone('tail0', 'body', [0, 0.16, -0.74])
    .bone('tail1', 'tail0', [0, 0, -0.34])
    .bone('tail2', 'tail1', [0, 0, -0.32])
  // Legs: hip / shoulder → knee → paw, front pair at +z, hind pair at −z.
  for (const [end, z] of [['F', 0.5], ['H', -0.5]] as const) {
    b.mirror((s, t) => {
      b.bone(`thigh${end}${t}`, 'body', [s * 0.36, -0.08, z])
        .bone(`shin${end}${t}`, `thigh${end}${t}`, [0, -0.46, end === 'F' ? 0.04 : -0.08])
    })
  }

  // ── The body: an iron furnace on its side ──
  b.part('body', rbox(0.84, 0.66, 1.42, 0.38), c.iron)
  // Belly plate and chest barrel.
  b.part('body', ell(0.38, 0.22, 0.6), c.soot, { p: [0, -0.3, 0.02] })
  b.part('body', ell(0.46, 0.44, 0.4), c.plate, { p: [0, 0.04, 0.52] })
  // The furnace door on its chest: the fire showing through three bars, so
  // the hound glows from the front as well as from its back.
  b.part('body', ell(0.24, 0.2, 0.08), c.molten, { p: [0, 0.02, 0.9], glow: true, outline: false })
  for (let k = 0; k < 3; k++) b.part('body', cap(0.03, 0.4, 6, 2), c.soot, { p: [0, -0.1 + k * 0.12, 0.95], r: [0, 0, Math.PI / 2] })
  // The molten core, glowing up through a grille on its back.
  b.part('body', ell(0.3, 0.13, 0.46), c.core, { p: [0, 0.33, -0.08], glow: true, outline: false })
  for (let k = 0; k < 4; k++) b.part('body', cap(0.035, 0.56, 6, 2), c.soot, { p: [0, 0.4, -0.38 + k * 0.2], r: [0, 0, Math.PI / 2] })
  b.part('body', torus(0.34, 0.045, 8, 22), c.brass, { p: [0, 0.37, -0.08], r: [Math.PI / 2, 0, 0], s: [1, 1.45, 1] })
  // Flank vents: three glowing slots a side, a brass rim round each run.
  b.mirror((s) => {
    for (let k = 0; k < 3; k++) {
      b.part('body', rbox(0.06, 0.08, 0.22, 0.4), c.molten, { p: [s * 0.425, 0.08 - k * 0.12, -0.12 - k * 0.04], glow: true, outline: false })
    }
    b.part('body', rbox(0.05, 0.44, 0.4, 0.5), c.brass, { p: [s * 0.4, -0.04, -0.16] })
    // Exhaust stacks on the shoulders, embers at their mouths.
    b.part('body', rcyl(0.08, 0.36, 0.03, 10), c.soot, { p: [s * 0.24, 0.48, 0.34], r: [-0.35, 0, s * 0.18] })
    b.part('body', sph(0.06, 8, 6), c.molten, { p: [s * 0.27, 0.68, 0.27], glow: true, outline: false })
  })

  // ── The neck and the firebox head ──
  b.part('neck', cap(0.2, 0.3, 10, 3), c.iron, { p: [0, 0.12, 0.12], r: [0.9, 0, 0] })
  b.part('neck', torus(0.2, 0.04, 6, 18), c.brass, { p: [0, 0.16, 0.18], r: [0.9, 0, 0] })
  b.part('head', rbox(0.52, 0.38, 0.56, 0.4), c.iron, { p: [0, 0.02, 0.12] })
  // Brow plates over the ember eyes, ears swept back.
  b.part('head', rbox(0.56, 0.08, 0.2, 0.5), c.plate, { p: [0, 0.2, 0.28], r: [0.25, 0, 0] })
  b.mirror((s) => {
    b.part('head', ell(0.095, 0.075, 0.05), c.eye, { p: [s * 0.15, 0.1, 0.39], glow: true, outline: false })
    b.part('head', rcone(0.09, 0.015, 0.34, 0.02, 8), c.soot, { p: [s * 0.18, 0.26, -0.06], r: [-1.05, 0, s * 0.3] })
  })
  // The snout and the upper teeth; the throat glows between the jaws.
  b.part('head', rbox(0.38, 0.2, 0.3, 0.45), c.plate, { p: [0, -0.04, 0.44] })
  b.part('head', ell(0.15, 0.1, 0.2), c.molten, { p: [0, -0.12, 0.3], glow: true, outline: false })
  for (let k = 0; k < 4; k++) b.part('head', rcone(0.03, 0.004, 0.08, 0.005, 6), '#f4ead8', { p: [-0.12 + k * 0.08, -0.16, 0.54], r: [Math.PI, 0, 0], outline: false })
  b.part('jaw', rbox(0.34, 0.1, 0.4, 0.45), c.iron, { p: [0, -0.04, 0.3] })
  for (let k = 0; k < 3; k++) b.part('jaw', rcone(0.028, 0.004, 0.07, 0.005, 6), '#f4ead8', { p: [-0.08 + k * 0.08, 0.04, 0.46], outline: false })

  // ── The tail: chain links, an ember at the tip ──
  b.part('tail0', cap(0.07, 0.26, 6, 2), c.soot, { p: [0, 0, -0.15], r: [Math.PI / 2, 0, 0] })
  b.part('tail1', cap(0.06, 0.24, 6, 2), c.iron, { p: [0, 0, -0.14], r: [Math.PI / 2, 0, 0] })
  b.part('tail2', cap(0.05, 0.18, 6, 2), c.soot, { p: [0, 0, -0.1], r: [Math.PI / 2, 0, 0] })
  b.part('tail2', sph(0.1, 10, 8), c.molten, { p: [0, 0, -0.28], glow: true, outline: false })

  // ── The legs: thick thighs, plated shins, broad paws with claws ──
  for (const end of ['F', 'H'] as const) {
    b.mirror((s, t) => {
      b.part(`thigh${end}${t}`, cap(0.13, 0.32, 10, 3), c.iron, { p: [0, -0.2, 0] })
      b.part(`thigh${end}${t}`, ell(0.16, 0.16, 0.16), c.plate, { p: [s * 0.02, 0.02, 0] })
      b.part(`shin${end}${t}`, cap(0.09, 0.3, 8, 3), c.soot, { p: [0, -0.2, 0] })
      b.painted(`shin${end}${t}`, paintBy(ell(0.15, 0.08, 0.2), (_x, y) => (y > 0.02 ? c.plate : c.soot)), { p: [0, -0.46, 0.06] })
      for (let k = 0; k < 3; k++) b.part(`shin${end}${t}`, rcone(0.03, 0.004, 0.1, 0.005, 6), '#d8cfc0', { p: [-0.07 + k * 0.07, -0.49, 0.24], r: [Math.PI / 2, 0, 0], outline: false })
    })
  }
  return b
}

const _heat = new Color()

/**
 * Pose the hound for this frame. Every channel eases (the AI hands over
 * eased values), so nothing pops between states.
 */
export const poseCinderHound = (rig: Rig, p: HoundPose): void => {
  const T = p.time
  const run = p.run
  const crouch = p.crouch
  const lunge = p.lunge
  const coil = Math.max(crouch, p.inhale * 0.4)
  // A breath at rest, a bob at the run, the crouch's drop, the lunge's stretch.
  const bob = Math.sin(T * 2.4) * 0.025 * (1 - run) + Math.abs(Math.sin(p.phase)) * 0.08 * run
  const sag = p.dying * 0.4
  nudge(rig, 'body', 0, bob - 0.34 * coil - 0.1 * lunge - sag, 0)
  pose(rig, 'body', 0.12 * crouch - 0.08 * lunge - 0.14 * p.howl + 0.1 * p.breath + 0.2 * p.dying, 0,
    Math.sin(T * 30) * 0.05 * p.dying)
  // The chest swells on the inhale (the furnace drawing air).
  scaleBone(rig, 'neck', 1 + 0.08 * p.inhale)
  // Head: down and forward to lunge and breathe, back on the inhale, up to howl.
  const look = -0.2 * crouch + 0.3 * lunge - 0.55 * p.inhale + 0.35 * p.breath - 0.95 * p.howl
  pose(rig, 'neck', look * 0.5 + Math.sin(T * 1.6) * 0.04 * (1 - run), Math.sin(T * 0.8) * 0.12 * (1 - run - crouch), 0)
  pose(rig, 'head', look * 0.5, 0, 0)
  // The jaw: a pant at rest, wide for the breath and the howl.
  const open = Math.max(0.1 + 0.06 * Math.sin(T * 5), 0.35 * p.inhale, 0.75 * p.breath, 0.7 * p.howl)
  pose(rig, 'jaw', open, 0, 0)
  // Legs: a trot (diagonal pairs) on `phase`, coiled under for the crouch,
  // flung out fore and aft for the lunge.
  for (const end of ['F', 'H'] as const) {
    for (const t of ['L', 'R'] as const) {
      const diag = (end === 'F') === (t === 'L') ? 0 : Math.PI
      const sw = Math.sin(p.phase + diag) * 0.75 * run
      const lift = Math.max(0, Math.cos(p.phase + diag)) * 0.7 * run
      const tuck = end === 'H' ? 0.75 * coil : -0.35 * coil
      const reach = (end === 'F' ? -1.1 : 1.0) * lunge
      pose(rig, `thigh${end}${t}`, sw + tuck + reach, 0, 0)
      pose(rig, `shin${end}${t}`, (end === 'F' ? lift : -lift) + (end === 'H' ? -0.9 * coil : 0.5 * coil) + 0.3 * lunge, 0, 0)
    }
  }
  // The tail streams out behind at a run, whips up to howl, sways at rest.
  const tw = Math.sin(T * 3.1) * 0.25 * (1 - run)
  pose(rig, 'tail0', 0.4 - 0.5 * run - 0.6 * lunge + 0.5 * p.howl, tw, 0)
  pose(rig, 'tail1', -0.2 + Math.sin(T * 6 + 1) * 0.15 * run, tw * 0.8, 0)
  pose(rig, 'tail2', -0.2 + Math.sin(T * 6 + 2) * 0.2 * run, tw * 0.6, 0)
  // The glow: every glowing part brightens with `heat` (a white-hot flicker
  // at the top of a tell), dims as it dies.
  const flick = 1 + 0.12 * Math.sin(T * 23) * Math.min(1, p.heat - 1)
  const k = Math.max(0.25, p.heat * flick * (1 - 0.7 * p.dying))
  _heat.setRGB(k, k * (0.92 + 0.08 * Math.min(1, p.heat - 1)), k)
  rig.glowMaterial.color.copy(_heat)
}
