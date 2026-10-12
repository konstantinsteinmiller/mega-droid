import { Color } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcone, rbox, rock, pose, nudge, scaleBone, type Rig } from '../kit'
import { bruteParts } from '../enemies'

/**
 * ─── The Icebreaker Brute (the Cryo Vault's challenge mini-boss) ─────────────
 *
 * The Guardroid (`models/enemies.ts` `bruteParts`) rebuilt for the vault's
 * cold: the same hunched frame, half again as big, in frosted steel, ice
 * plates grown over its shoulders and forearms, fists crusted in glowing ice,
 * a crown of icicles on its head and a frost core burning on its back (its
 * weak spot). Two things it carries only when it uses them: an ice boulder
 * torn from the floor, held over its head (`lift`), and a slab of an ice
 * shield in front of its chest (`shield`) — their bones sit at scale 0 the
 * rest of the time.
 *
 * The pose takes what the AI is doing (`BrutePose`). Every tell is BIG: the
 * slam lifts both fists high over the head and leans it back, the throw
 * raises the boulder in both arms, the shield plants its feet and hunches it
 * behind the slab; the frost glow brightens with `heat` through each.
 */

export const ICEBREAKER_COLORS = {
  main: '#a9c8e2',
  deep: '#2c3a58',
  accent: '#6fdcff',
  eye: '#a6f6ff',
  metal: '#46516b',
  ice: '#dcf4ff',
  frost: '#8ff0ff'
}

/** It is drawn this much over the Guardroid's build size (the hit volume
 *  and weak spot in `sim/miniBoss/icebreakerBrute.ts` are at this size). */
export const ICEBREAKER_SCALE = 1.4

/** What the AI tells the pose (0..1 unless said). */
export interface BrutePose {
  /** Locomotion: how much it is walking, and its stride phase (radians). */
  walk: number
  phase: number
  /** The slam's wind-up: both fists high over the head, leaning back. */
  raise: number
  /** The slam itself: fists into the floor, hunched. */
  slam: number
  /** The boulder held overhead (its bone grows from 0). */
  lift: number
  /** The throw: arms flung forward. */
  hurl: number
  /** The shield up in front (its bone grows from 0). */
  shield: number
  /** Frost glow: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
}

export const newBrutePose = (): BrutePose => ({ walk: 0, phase: 0, raise: 0, slam: 0, lift: 0, hurl: 0, shield: 0, heat: 1, dying: 0, time: 0 })

export const buildIcebreakerBrute = (c = ICEBREAKER_COLORS): Rig => {
  const rig = icebreakerBruteParts(c).build({ outline: 0.022, height: 2.45 * ICEBREAKER_SCALE })
  rig.root.scale.setScalar(ICEBREAKER_SCALE)
  return rig
}

/** The Icebreaker's rig, not yet built (the z-fighting test reads its parts). */
export const icebreakerBruteParts = (c = ICEBREAKER_COLORS): RigBuilder => {
  const b = bruteParts(c)
  b.bone('boulder', 'chest', [0, 1.38, 0.12])
    .bone('shield', 'chest', [0, -0.05, 0.78])

  // ── The icicle crown: a band round the head, seven icicles standing up ──
  b.part('head', torus(0.165, 0.035, 6, 18), c.deep, { p: [0, 0.19, 0], r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2
    const h = k % 2 ? 0.2 : 0.3
    b.part('head', rcone(0.045, 0.006, h, 0.01, 8), c.frost, {
      p: [Math.sin(a) * 0.15, 0.23 + h * 0.45, Math.cos(a) * 0.15], r: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], glow: true, outline: false
    })
  }

  // ── Ice plates over the shoulders, frost spikes out of them ──
  b.mirror((s, t) => {
    b.part(`shoulder${t}`, rock(0.3, 11 + (s > 0 ? 1 : 0)), c.ice, { p: [s * 0.07, 0.14, 0], s: [1.05, 0.62, 1.15] })
    for (let k = 0; k < 2; k++) {
      b.part(`shoulder${t}`, rcone(0.07, 0.008, 0.34 - k * 0.08, 0.012, 8), c.frost, {
        p: [s * (0.16 + k * 0.08), 0.32, -0.1 + k * 0.18], r: [-0.25 + k * 0.4, 0, -s * (0.5 + k * 0.25)], glow: true, outline: false
      })
    }
    // Forearm plates: an ice gauntlet round the elbow's cap.
    b.part(`elbow${t}`, rock(0.2, 21 + (s > 0 ? 1 : 0)), c.ice, { p: [s * 0.02, -0.16, 0.02], s: [1, 1.15, 1] })
    // The fist crusted in ice, glowing crystals for knuckles.
    b.part(`elbow${t}`, rock(0.29, 31 + (s > 0 ? 1 : 0)), c.ice, { p: [0, -0.42, 0.04] })
    for (let k = 0; k < 3; k++) {
      b.part(`elbow${t}`, rcone(0.065, 0.01, 0.26, 0.012, 8), c.frost, {
        p: [(k - 1) * 0.13, -0.62, 0.2], r: [2.3, 0, (k - 1) * 0.35], glow: true, outline: false
      })
    }
    // Knee plates.
    b.part(`knee${t}`, rock(0.17, 41 + (s > 0 ? 1 : 0)), c.ice, { p: [0, -0.06, 0.12], s: [1, 1.1, 0.7] })
  })

  // ── The frost core on its back (its weak spot), caged, icicle spines above ──
  b.part('chest', sph(0.17, 14, 10), c.frost, { p: [0, 0.14, -0.4], glow: true, outline: false })
  b.part('chest', torus(0.19, 0.04, 6, 18), c.metal, { p: [0, 0.14, -0.42] })
  for (let k = 0; k < 3; k++) {
    b.part('chest', rcone(0.06, 0.008, 0.3 - k * 0.04, 0.012, 8), c.frost, {
      p: [(k - 1) * 0.18, 0.44 - Math.abs(k - 1) * 0.06, -0.22], r: [-0.7, 0, (k - 1) * -0.3], glow: true, outline: false
    })
  }

  // ── The boulder (held overhead to throw) ──
  b.part('boulder', rock(0.5, 7), c.ice)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    b.part('boulder', rcone(0.08, 0.01, 0.28, 0.012, 8), c.frost, {
      p: [Math.sin(a) * 0.36, 0.12 - (k % 2) * 0.24, Math.cos(a) * 0.36], r: [Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3], glow: true, outline: false
    })
  }

  // ── The ice shield: a jagged slab, a frost rune glowing in its face ──
  b.part('shield', rock(0.82, 3), c.ice, { s: [1.05, 1.15, 0.24] })
  b.part('shield', rbox(0.22, 1.3, 0.12, 0.45), c.deep, { p: [0, 0, -0.16] })
  b.part('shield', ell(0.22, 0.3, 0.06), c.frost, { p: [0, 0.08, 0.2], glow: true, outline: false })
  b.part('shield', cap(0.04, 0.5, 6, 2), c.frost, { p: [0, 0.08, 0.22], r: [0, 0, Math.PI / 2], glow: true, outline: false })
  return b
}

const _glow = new Color()

/** Pose the Icebreaker for this frame (the AI hands over eased channels). */
export const poseIcebreakerBrute = (rig: Rig, p: BrutePose): void => {
  const T = p.time
  const w = Math.sin(p.phase) * p.walk
  const still = 1 - p.walk
  const br = Math.sin(T * 1.6) * still
  const raise = p.raise
  const slam = p.slam
  const lift = p.lift
  const hurl = p.hurl
  const sh = p.shield
  // Legs: a heavy stride; knees bent under a plant (slam, shield).
  const plant = Math.max(slam, sh * 0.6, raise * 0.3)
  pose(rig, 'hipL', w * 0.45 - 0.5 * plant, 0, -0.12 * plant)
  pose(rig, 'hipR', -w * 0.45 - 0.5 * plant, 0, 0.12 * plant)
  pose(rig, 'kneeL', Math.max(0, -w) * 0.55 + 0.8 * plant, 0, 0)
  pose(rig, 'kneeR', Math.max(0, w) * 0.55 + 0.8 * plant, 0, 0)
  nudge(rig, 'hips', 0, Math.abs(w) * 0.05 + 0.012 * br - 0.28 * plant + 0.06 * raise - 0.3 * p.dying, 0)
  // The chest: leans back to raise, hunches into the slam and behind the shield.
  pose(rig, 'chest', 0.12 * still - 0.3 * raise - 0.22 * lift + 0.5 * slam + 0.35 * hurl + 0.18 * sh + 0.3 * p.dying,
    0, Math.sin(T * 30) * 0.05 * p.dying)
  pose(rig, 'head', -0.12 * still + 0.2 * raise + 0.15 * lift - 0.15 * slam, 0, 0)
  // Arms: the hunched rest, overhead to raise and lift, into the floor to slam,
  // flung forward to hurl, braced forward behind the shield.
  const restX = -0.38 + 0.04 * br - w * 0.25
  const armX = restX * (1 - Math.max(raise, slam, lift, hurl, sh)) - 2.9 * raise - 1.05 * slam - 2.95 * lift * (1 - hurl) - 1.3 * hurl - 1.25 * sh
  const armZ = 0.2 * raise + 0.08 * lift + 0.15 * slam - 0.25 * sh
  const elbow = -0.7 * (1 - Math.max(raise, slam, lift, sh)) - 0.4 * raise - 0.3 * slam - 1.0 * lift * (1 - hurl) - 1.1 * sh
  pose(rig, 'shoulderL', armX, 0.18 * (1 - sh), -0.02 - armZ)
  pose(rig, 'shoulderR', armX + w * 0.5, -0.18 * (1 - sh), 0.02 + armZ)
  pose(rig, 'elbowL', elbow, 0, 0)
  pose(rig, 'elbowR', elbow, 0, 0)
  // The carried things grow in from nothing — from inside the chest, where a
  // collapsed part (its outline still a dot) cannot be seen.
  const held = lift * (1 - hurl)
  scaleBone(rig, 'boulder', Math.max(0.001, held))
  nudge(rig, 'boulder', 0, held < 0.02 ? -1.3 : 0, held < 0.02 ? -0.1 : 0)
  scaleBone(rig, 'shield', Math.max(0.001, sh))
  nudge(rig, 'shield', 0, 0, sh < 0.02 ? -0.75 : 0)
  // The frost glow: brightens with `heat`, a cold shimmer at a tell's peak.
  const flick = 1 + 0.1 * Math.sin(T * 21) * Math.min(1, p.heat - 1)
  const k = Math.max(0.25, p.heat * flick * (1 - 0.7 * p.dying))
  _glow.setRGB(k * (0.94 + 0.06 * Math.min(1, p.heat - 1)), k, k)
  rig.glowMaterial.color.copy(_glow)
}
