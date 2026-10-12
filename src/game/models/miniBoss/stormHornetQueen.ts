import { Color } from 'three'
import { RigBuilder, ell, torus, rcone, sph, paintBy, pose, nudge, scaleBone, type Rig } from '../kit'
import { hornetParts } from '../enemies'

/**
 * ─── The Storm Hornet Queen (the Gale Spire's challenge mini-boss) ───────────
 *
 * The Hornet Rotor (`models/enemies.ts` `hornetParts`) grown into a queen:
 * well over twice its size, a white-silver crown on a dark band with
 * storm-blue gems (silver reads against the yellow; gold did not), a long striped
 * abdomen ending in a glowing stinger (its weak spot), and a pair of striped
 * insect wings beating over the twin rotors. Nothing of the Gale Master's
 * android: it hovers, calls its drones, fans gusts and dives.
 *
 * The pose (`QueenPose`) takes the AI's tells, every one BIG: the abdomen
 * pumping with the crown aglow (a summons), rearing back with the wings
 * spread wide and beating slow (the gust), pitched nose-up with the stinger
 * cocked forward under it (the dive). The glow (gems, stinger, eyes)
 * brightens through each (`heat`).
 */

export const QUEEN_COLORS = {
  main: '#ffcf2e',
  deep: '#21222e',
  accent: '#5ad8ff',
  eye: '#ff3a2a',
  metal: '#c8ccd6',
  crown: '#eef3fa',
  band: '#2a2c3c',
  gem: '#7fe4ff',
  wing: '#cfeeff',
  sting: '#ff5a3a'
}

/** Drawn this much over the Hornet Rotor's size (hit volume and weak spot
 *  in `sim/miniBoss/stormHornetQueen.ts` are at this size). */
export const QUEEN_SCALE = 2.1

export interface QueenPose {
  /** How fast it is flying (0..1): the body tilts into it. */
  fly: number
  /** The summons: abdomen pumping, crown glowing. */
  summon: number
  /** The gust's wind-up (reared back, wings spread) and the gust itself. */
  fan: number
  gust: number
  /** The dive's wind-up (nose up, stinger cocked under) and the dive. */
  aim: number
  dive: number
  /** Its stinger stuck in the floor after a dive. */
  stuck: number
  heat: number
  dying: number
  time: number
}

export const newQueenPose = (): QueenPose => ({ fly: 0, summon: 0, fan: 0, gust: 0, aim: 0, dive: 0, stuck: 0, heat: 1, dying: 0, time: 0 })

export const buildStormHornetQueen = (c = QUEEN_COLORS): Rig => {
  const rig = stormHornetQueenParts(c).build({ outline: 0.012, height: 0.75 * QUEEN_SCALE })
  rig.root.scale.setScalar(QUEEN_SCALE)
  return rig
}

/** The queen's rig, not yet built (the z-fighting test reads its parts). */
export const stormHornetQueenParts = (c = QUEEN_COLORS): RigBuilder => {
  const b = hornetParts(c)
  b.bone('tail', 'body', [0, -0.02, -0.34])
    .bone('wingL', 'body', [-0.12, 0.2, -0.04])
    .bone('wingR', 'body', [0.12, 0.2, -0.04])

  // ── The crown: a gold band with five points, a gem in each ──
  // On the brow, in front of the rotors' sweep.
  const CZ = 0.31
  const CY = 0.16
  b.part('body', torus(0.16, 0.03, 6, 18), c.crown, { p: [0, CY, CZ], r: [Math.PI / 2 - 0.75, 0, 0] })
  b.part('body', torus(0.17, 0.022, 6, 18), c.band, { p: [0, CY - 0.035, CZ - 0.02], r: [Math.PI / 2 - 0.75, 0, 0] })
  for (let k = 0; k < 5; k++) {
    const a = ((k - 2) / 5) * Math.PI * 1.1
    b.part('body', rcone(0.045, 0.006, 0.19 - Math.abs(k - 2) * 0.03, 0.006, 6), c.crown, {
      p: [Math.sin(a) * 0.16, CY + 0.1 - Math.abs(k - 2) * 0.015, CZ + Math.cos(a) * 0.06 - 0.04], r: [0.5, 0, -Math.sin(a) * 0.35]
    })
    b.part('body', sph(0.026, 8, 6), c.gem, { p: [Math.sin(a) * 0.166, CY + 0.02, CZ + Math.cos(a) * 0.085 + 0.01], glow: true, outline: false })
  }

  // ── The abdomen: long, striped, ending in a glowing stinger ──
  b.painted('tail', paintBy(ell(0.21, 0.19, 0.34, 16, 12), (_x, _y, z) => (Math.floor((z + 0.4) / 0.11) % 2 ? c.deep : c.main)), { p: [0, -0.04, -0.2], r: [0.18, 0, 0] })
  b.part('tail', rcone(0.07, 0.008, 0.26, 0.01, 10), c.sting, { p: [0, -0.13, -0.6], r: [-Math.PI / 2 - 0.25, 0, 0], glow: true, outline: false })

  // ── The wings: long and striped, on their own bones (they beat) ──
  b.mirror((s, t) => {
    b.painted(`wing${t}`, paintBy(ell(0.5, 0.012, 0.15, 14, 6), (x) => (Math.floor(Math.abs(x) / 0.12) % 2 ? c.deep : c.wing)), {
      p: [s * 0.46, 0.02, -0.12], r: [0, s * 0.35, 0]
    })
    b.part(`wing${t}`, sph(0.035, 8, 6), c.deep)
  })
  return b
}

const _glow = new Color()

/** Pose the queen for this frame (the AI hands over eased channels). */
export const poseStormHornetQueen = (rig: Rig, p: QueenPose): void => {
  const T = p.time
  // The body: a hover bob, reared back for the gust, nose up to aim, nose
  // down to dive, tilted into a fast flight.
  const bob = 0.05 * Math.sin(T * 3) * (1 - p.dive - p.stuck)
  nudge(rig, 'body', 0, bob, 0)
  pose(rig, 'body', 0.25 * p.fly - 0.55 * p.fan + 0.2 * p.gust - 0.5 * p.aim + 0.9 * p.dive + 0.7 * p.stuck + 0.8 * p.dying,
    0, 0.06 * Math.sin(T * 2.4) + Math.sin(T * 25) * 0.1 * p.dying)
  // The abdomen pumps to summon, curls under to aim the stinger forward.
  const pump = 1 + 0.12 * Math.sin(T * 12) * p.summon
  scaleBone(rig, 'tail', pump, pump, 1 + 0.08 * p.summon)
  pose(rig, 'tail', 0.9 * p.aim + 0.4 * p.dive - 0.3 * p.stuck + 0.12 * Math.sin(T * 2.2), 0, 0)
  // Rotors: faster at every tell.
  const r = T * (24 + 40 * Math.max(p.fan, p.aim, p.summon, p.gust))
  pose(rig, 'rotorL', 0, r, 0)
  pose(rig, 'rotorR', 0, -r, 0)
  // Wings: a blur of a beat; spread wide and slow for the gust, folded back to dive.
  const rate = 30 - 22 * p.fan
  const amp = 0.45 + 0.3 * p.fan + 0.2 * p.gust
  const beat = Math.sin(T * rate) * amp * (1 - p.dying * 0.8) * (1 - p.stuck)
  const spread = 0.5 * p.fan - 0.7 * p.dive
  pose(rig, 'wingL', 0, -spread, -beat - 0.2 * p.dying)
  pose(rig, 'wingR', 0, spread, beat + 0.2 * p.dying)
  // The glow: crown gems, stinger and eyes brighten with `heat`.
  const flick = 1 + 0.12 * Math.sin(T * 19) * Math.min(1, p.heat - 1)
  const k = Math.max(0.25, p.heat * flick * (1 - 0.7 * p.dying))
  _glow.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_glow)
}
