import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial } from 'three'
import { RigBuilder, sph, ell, cap, torus, rbox, rcone, pose, nudge, scaleBone, type Rig } from '../kit'

/**
 * ─── The Glitch Stalker (the Blackout Boulevard's challenge mini-boss) ───────
 *
 * The Boulevard's Glow Stalker grown up and gone wrong: a head taller than
 * Flux, skating on one wheel, near-black plating drawn over with neon
 * wireframe stripes (magenta down the spine, cyan down the flanks and limbs),
 * a scanline visor that flickers like a bad screen, two long light blades
 * for forearms and a cape of glitch shards hanging from its shoulders — dark
 * splinters edged in neon, three rows of them that swing as it skates.
 *
 * Its tells (`StalkerPose`), all big:
 *  - BLINK: it folds its blades across its chest and crouches, then thins to
 *    a sliver of light and is gone (`blink`, then the AI hides it);
 *  - SPLIT (the decoys): blades flung wide, cape flaring, the body jittering
 *    side to side (`split`);
 *  - GRID: both blades raised over its head, the visor blazing (`grid`);
 *  - SLASH: the blades swept forward and down (`slash`).
 * The glow follows `heat`; `glitch` jitters the whole body and the visor.
 *
 * Its decoys are this rig again under hologram materials (`holoStalker`):
 * see-through, flickering, no outline and no shadow — the real one is the
 * one with a solid black outline and a shadow under it.
 *
 * Proportions in metres at scale 1: ~2.3 m tall.
 */

export const STALKER_COLORS = {
  main: '#2a2444',
  deep: '#15121f',
  metal: '#4a4a68',
  magenta: '#ff3fd2',
  cyan: '#3ff4ff',
  visor: '#9ffcff'
}

export interface StalkerPose {
  /** Skating: 0..1, and its wheel's turn (radians). */
  glide: number
  wheel: number
  /** The blink's wind-up: blades crossed, crouched; past 1 it thins away. */
  blink: number
  /** The split's wind-up (the decoys coming out of it). */
  split: number
  /** One blade raised to fire (a decoy's shot, its own). */
  aim: number
  /** The laser grid's wind-up: both blades overhead. */
  grid: number
  /** The blink's arrival: the blades swept through. */
  slash: number
  /** Glitch jitter 0..1. */
  glitch: number
  /** Glow strength: 1 at rest, ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
  /** A per-rig offset so two holograms never flicker in step. */
  seed: number
}

export const newStalkerPose = (seed = 0): StalkerPose => ({
  glide: 0, wheel: 0, blink: 0, split: 0, aim: 0, grid: 0, slash: 0, glitch: 0, heat: 1, dying: 0, time: 0, seed
})

/** Drawn this much over its build size (the weak spot and the hit volume in
 *  `sim/miniBoss/glitchStalker.ts` are measured at this size). */
export const STALKER_SCALE = 1

export const buildGlitchStalker = (c = STALKER_COLORS): Rig => {
  const rig = glitchStalkerParts(c).build({ outline: 0.02, height: 2.3 * STALKER_SCALE })
  rig.root.scale.setScalar(STALKER_SCALE)
  return rig
}

/** Its rig's parts on their bones, not yet built (the z-fighting test reads them). */
export const glitchStalkerParts = (c = STALKER_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 0.82, 0])
    .bone('head', 'body', [0, 1.12, 0.2])
    .bone('visor', 'head', [0, 0.02, 0.25])
    .bone('wheel', 'root', [0, 0.4, 0])
    .bone('cape0', 'body', [0, 0.92, -0.3])
    .bone('cape1', 'cape0', [0, -0.42, -0.04])
    .bone('cape2', 'cape1', [0, -0.4, -0.04])
  b.mirror((s, t) => {
    b.bone(`arm${t}`, 'body', [s * 0.42, 0.82, 0.02])
      .bone(`fore${t}`, `arm${t}`, [0, -0.48, 0.04])
  })

  // ── The body: a lean dark torso, leaning in, on one wheel ──
  b.part('body', cap(0.3, 0.62, 14, 4), c.main, { p: [0, 0.48, 0], r: [0.28, 0, 0] })
  b.part('body', ell(0.3, 0.16, 0.34), c.deep, { p: [0, 0.02, 0] })
  b.part('body', cap(0.12, 0.42, 10, 3), c.metal, { p: [0, -0.25, 0] })
  b.part('body', ell(0.44, 0.2, 0.3), c.deep, { p: [0, 0.86, -0.02] })
  // Neon wireframe stripes: magenta down the spine and the chest, cyan
  // down the flanks — thin bars a hair proud of the hull.
  b.part('body', cap(0.03, 0.66, 6, 2), c.magenta, { p: [0, 0.48, 0.34], r: [0.28, 0, 0], glow: true, outline: false })
  b.part('body', cap(0.03, 0.66, 6, 2), c.magenta, { p: [0, 0.5, -0.33], r: [0.28, 0, 0], glow: true, outline: false })
  b.mirror((s) => {
    b.part('body', cap(0.025, 0.6, 6, 2), c.cyan, { p: [s * 0.32, 0.46, 0.02], r: [0.28, 0, s * 0.06], glow: true, outline: false })
    // Shoulder plates, a cyan rim round each.
    b.part('body', ell(0.2, 0.13, 0.22), c.main, { p: [s * 0.42, 0.9, 0.02] })
    b.part('body', torus(0.17, 0.022, 6, 18), c.cyan, { p: [s * 0.42, 0.94, 0.02], r: [Math.PI / 2, 0, 0], glow: true, outline: false })
  })
  b.part('body', torus(0.31, 0.03, 6, 22), c.magenta, { p: [0, 0.1, 0.01], r: [Math.PI / 2, 0, 0], glow: true, outline: false })

  // ── The head: a smooth helmet, the scanline visor across it ──
  b.part('head', ell(0.28, 0.24, 0.3), c.main)
  b.part('head', rcone(0.07, 0.01, 0.3, 0.01, 8), c.deep, { p: [0, 0.2, -0.16], r: [-1.2, 0, 0] })
  b.part('visor', rbox(0.48, 0.13, 0.12, 0.5), c.visor, { p: [0, 0, 0.02], glow: true, outline: false })
  // Scanlines: two dark bars across the visor's face, short of its ends.
  for (let k = 0; k < 2; k++) b.part('visor', cap(0.01, 0.26, 4, 2), c.deep, { p: [0, -0.024 + k * 0.048, 0.085], r: [0, 0, Math.PI / 2], outline: false })

  // ── The wheel ──
  b.part('wheel', torus(0.34, 0.1, 10, 24), c.metal, { r: [0, Math.PI / 2, 0] })
  b.part('wheel', torus(0.34, 0.03, 6, 24), c.cyan, { p: [0.11, 0, 0], r: [0, Math.PI / 2, 0], glow: true, outline: false })
  b.part('wheel', torus(0.34, 0.03, 6, 24), c.cyan, { p: [-0.11, 0, 0], r: [0, Math.PI / 2, 0], glow: true, outline: false })
  b.part('wheel', sph(0.1, 10, 8), c.deep)

  // ── The arms: upper arms, then light blades for forearms ──
  b.mirror((s, t) => {
    b.part(`arm${t}`, cap(0.08, 0.36, 8, 3), c.deep, { p: [0, -0.24, 0] })
    b.part(`arm${t}`, cap(0.018, 0.34, 4, 2), c.cyan, { p: [s * 0.075, -0.24, 0.03], glow: true, outline: false })
    b.part(`fore${t}`, sph(0.1, 10, 8), c.metal)
    b.part(`fore${t}`, rbox(0.06, 0.78, 0.16, 0.25), c.magenta, { p: [s * 0.02, -0.42, 0.08], r: [0.2, 0, 0], glow: true, outline: false })
    b.part(`fore${t}`, cap(0.06, 0.18, 8, 2), c.main, { p: [0, -0.06, 0.02] })
  })

  // ── The cape: three rows of glitch shards, each a dark splinter with a
  // neon edge, every one at its own tilt and depth (no two in a plane) ──
  const rows = ['cape0', 'cape1', 'cape2'] as const
  rows.forEach((bone, row) => {
    const n = 5 - row
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : k / (n - 1) - 0.5
      const x = u * (0.86 - row * 0.18)
      const z = -0.02 * row - 0.013 * k
      const tilt = 0.18 * Math.sin(k * 2.3 + row)
      const h = 0.38 - row * 0.05 + 0.06 * Math.cos(k * 1.7 + row)
      b.part(bone, rbox(0.15, h, 0.035 + 0.004 * k, 0.15), c.deep, { p: [x, -h / 2, z], r: [0.08 * row, 0.12 * u, tilt] })
      const edge = (k + row) % 2 === 0 ? c.magenta : c.cyan
      b.part(bone, cap(0.016, h * 0.8, 4, 2), edge, { p: [x + 0.08 * Math.cos(tilt), -h / 2 + 0.08 * Math.sin(tilt), z - 0.012], r: [0.08 * row, 0.12 * u, tilt], glow: true, outline: false })
    }
  })
  return b
}

/**
 * A decoy: the same rig in hologram light — see-through, additive, no
 * outline (`sim/miniBoss/glitchStalker.ts` gives it no shadow either).
 */
export const holoStalker = (rig: Rig): MeshBasicMaterial => {
  const holo = new MeshBasicMaterial({
    color: new Color('#5fe8ff'), transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const edge = new MeshBasicMaterial({
    color: new Color('#ff7ae6'), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false
  })
  rig.mesh.material = [holo, edge]
  if (rig.outline) rig.outline.visible = false
  return holo
}

const _heat = new Color()

/** A hash in −1..1 that jumps a few times a second (the glitch's jitter). */
const jit = (t: number, k: number): number => {
  const v = Math.sin(Math.floor(t * 14) * 12.9898 + k * 78.233) * 43758.5453
  return (v - Math.floor(v)) * 2 - 1
}

export const poseGlitchStalker = (rig: Rig, p: StalkerPose): void => {
  const T = p.time + p.seed
  const crouch = Math.min(1, p.blink) * 0.8 + p.grid * 0.1
  const thin = Math.max(0, Math.min(1, p.blink - 1))
  const g = p.glitch
  // The glitch: the whole body slips sideways a few times a second.
  nudge(rig, 'root', jit(T, 1) * 0.12 * g, 0, jit(T, 2) * 0.06 * g)
  // Thinning away to a sliver of light: flat across, tall.
  scaleBone(rig, 'root', Math.max(0.04, 1 - thin), 1 + 0.4 * thin, Math.max(0.04, 1 - thin))
  const bob = Math.sin(T * 2.2) * 0.04 * (1 - p.glide)
  nudge(rig, 'body', 0, bob - 0.32 * crouch - 0.2 * p.dying, 0)
  pose(rig, 'body', 0.12 + 0.22 * p.glide + 0.3 * crouch - 0.25 * p.grid + 0.35 * p.slash + 0.3 * p.dying,
    0.25 * Math.sin(T * 1.1) * (1 - p.glide) * (1 - p.split), 0.5 * p.split * jit(T, 3) * 0.3 + Math.sin(T * 25) * 0.08 * p.dying)
  pose(rig, 'head', -0.15 * p.glide + 0.25 * crouch - 0.35 * p.grid + 0.2 * p.dying, 0, 0)
  // The visor's scanlines roll: it squashes and jumps, worse in a glitch.
  scaleBone(rig, 'visor', 1, 1 + 0.25 * Math.sin(T * 31) * (0.3 + g) - 0.4 * p.dying, 1)
  pose(rig, 'wheel', p.wheel, 0, 0)
  // Arms: a skater's swing, crossed for the blink, flung wide for the split,
  // one raised to fire, both overhead for the grid, swept for the slash.
  for (const [t, s] of [['L', -1], ['R', 1]] as const) {
    const swing = Math.sin(T * 2 + (s > 0 ? 1 : 0)) * 0.2 * (1 - p.glide) + 0.6 * p.glide
    const aim = t === 'R' ? p.aim : 0
    const x = swing - 0.9 * Math.min(1, p.blink) - 0.6 * p.split - 1.6 * aim - 2.6 * p.grid - 1.4 * p.slash + 0.4 * p.dying
    const z = s * (-0.25 - 0.9 * p.split - 0.25 * p.grid + 0.5 * Math.min(1, p.blink) + 0.35 * p.slash)
    pose(rig, `arm${t}`, x, s * 0.4 * Math.min(1, p.blink), z)
    pose(rig, `fore${t}`, -0.5 - 0.6 * Math.min(1, p.blink) + 0.4 * p.split + 0.5 * p.grid + 0.6 * p.slash, 0, 0)
  }
  // The cape streams out behind at speed and flares up for the split.
  const sway = Math.sin(T * 2.6) * 0.12
  pose(rig, 'cape0', 0.15 + 0.6 * p.glide + 0.7 * p.split + 0.3 * p.grid + sway, 0, jit(T, 4) * 0.15 * g)
  pose(rig, 'cape1', 0.1 + 0.3 * p.glide + 0.3 * p.split + sway * 1.2, 0, jit(T, 5) * 0.2 * g)
  pose(rig, 'cape2', 0.1 + 0.25 * p.glide + 0.2 * p.split + sway * 1.4, 0, jit(T, 6) * 0.25 * g)
  // The glow: brighter with `heat`, stuttering in a glitch, dying out.
  const flick = 1 - 0.35 * g * (jit(T, 7) > 0.3 ? 1 : 0) + 0.12 * Math.sin(T * 23) * Math.min(1, p.heat - 1)
  const k = Math.max(0.2, p.heat * flick * (1 - 0.75 * p.dying))
  _heat.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_heat)
}
