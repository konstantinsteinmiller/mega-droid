import { Color } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcone, rbox, rock, pose, nudge, scaleBone, type Rig } from '../kit'

/**
 * ─── The Lodestone Golem (the Magnet Works' challenge mini-boss) ─────────────
 *
 * The crate golem grown up and magnetised: the same rounded supply-crate
 * body on stubby stone legs, but half again as big, a polar plate bolted to
 * each flank (north red on its left, south blue on its right, each with a
 * glowing strip), a lump of dark lodestone ore wedged in its top, a slit of
 * a visor, and in place of rock fists two great HORSESHOE MAGNETS, silver-
 * tipped. A cloud of scrap — gears, nuts, a bolt, a plate, a pipe, a rock —
 * orbits it, held by its field; it throws them. Its core glows in a socket
 * on its back.
 *
 * One skinned rig (`models/kit.ts`). The scrap pieces hang off the root on
 * bones of their own that the AI places every frame (`LodePose.scrap`, in
 * the rig's own frame at build size): orbiting, gathered over its hand, in
 * flight. Every tell is BIG: the pull throws both magnets forward at Flux
 * and leans it back; the slam heaves both overhead; the fling winds the
 * right arm back over its shoulder with the scrap bunched above the hand.
 *
 * Proportions in metres at build size: top of the crate ~1.7 m, the ore
 * ~1.95 m; drawn LODE_SCALE over that.
 */

export const LODE_COLORS = {
  crate: '#9a8a7a',
  trim: '#3a3036',
  stone: '#8e877b',
  iron: '#646b7a',
  ore: '#4a4652',
  north: '#e8343f',
  south: '#3f7bff',
  silver: '#d8dde8',
  rust: '#9a5a32',
  steel: '#aab0bc',
  visor: '#161a22',
  eye: '#ffcf5a',
  core: '#bfe0ff',
  glowN: '#ff6a78',
  glowS: '#6aa8ff'
}

/** The scrap pieces orbiting it. */
export const LODE_SCRAP = 6

/** One scrap piece: where its bone is (rig frame, build size) and its size. */
export interface ScrapPose { x: number; y: number; z: number; s: number; spin: number }

/** What the AI tells the pose (0..1 unless said). */
export interface LodePose {
  /** Its walk, and the gait phase (radians). */
  walk: number
  phase: number
  /** The pull's wind-up and its drag: both magnets thrust at Flux, leaning back. */
  pull: number
  /** The pull holding (a tremble in the arms). */
  drag: number
  /** The slam's wind-up: both arms heaved overhead. */
  heave: number
  /** The slam itself: the magnets driven into the floor. */
  slam: number
  /** The fling's wind-up: the right arm back over its shoulder. */
  wind: number
  /** The throw: the right arm whipped forward. */
  throw: number
  /** Crouched and dark (its entrance, before the field switches on). */
  sleep: number
  /** Glow: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
  scrap: ScrapPose[]
}

export const newLodePose = (): LodePose => ({
  walk: 0, phase: 0, pull: 0, drag: 0, heave: 0, slam: 0, wind: 0, throw: 0, sleep: 0, heat: 1, dying: 0, time: 0,
  scrap: Array.from({ length: LODE_SCRAP }, () => ({ x: 0, y: 1.7, z: 0, s: 1, spin: 0 }))
})

/** It is drawn this much over its build size (its hit volume and weak spot
 *  in `sim/miniBoss/lodestoneGolem.ts` are measured at this size). */
export const LODE_SCALE = 1.4
/** The crate's centre over the floor (build size). */
const BODY_Y = 1.15
/** Where the scrap bunches over its raised right hand to be thrown (build size). */
export const LODE_HAND_UP: readonly [number, number, number] = [0.85, 2.95, -0.55]

export const buildLodestoneGolem = (c = LODE_COLORS): Rig => {
  const rig = lodestoneGolemParts(c).build({ outline: 0.022, height: 2.15 * LODE_SCALE })
  rig.root.scale.setScalar(LODE_SCALE)
  return rig
}

/** The golem's rig, its parts laid on its bones, not yet built (the
 *  z-fighting test reads its parts). */
export const lodestoneGolemParts = (c = LODE_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, BODY_Y, 0])
    .bone('visor', 'body', [0, 0.14, 0.5])
  b.mirror((s, t) => {
    b.bone(`shoulder${t}`, 'body', [s * 0.76, 0.24, 0])
      .bone(`elbow${t}`, `shoulder${t}`, [0, -0.42, 0])
      .bone(`hand${t}`, `elbow${t}`, [0, -0.4, 0])
      .bone(`hip${t}`, 'body', [s * 0.3, -0.45, 0.02])
      .bone(`knee${t}`, `hip${t}`, [0, -0.32, 0])
  })
  // The scrap round it at rest (the pose places every piece).
  for (let k = 0; k < LODE_SCRAP; k++) {
    const a = (k / LODE_SCRAP) * Math.PI * 2
    b.bone(`scrap${k}`, 'root', [Math.sin(a) * 1.35, 1.8, Math.cos(a) * 1.35])
  }

  // ── The crate: the golem's rounded box, grown, corner bumpers, an iron strap ──
  b.part('body', rbox(1.25, 1.05, 1.0, 0.3), c.crate)
  for (const x of [-1, 1]) for (const z of [-1, 1]) b.part('body', sph(0.19, 10, 8), c.trim, { p: [x * 0.52, 0.42, z * 0.38] })
  b.part('body', rbox(1.31, 0.12, 1.06, 0.4), c.iron, { p: [0, -0.26, 0] })
  // The polar plates on its flanks (north red left, south blue right), each
  // with a glowing strip down its face: they flare with every tell.
  b.mirror((s) => {
    b.part('body', rbox(0.12, 0.8, 0.78, 0.4), s < 0 ? c.north : c.south, { p: [s * 0.65, 0.04, 0] })
    b.part('body', rbox(0.05, 0.56, 0.1, 0.4), s < 0 ? c.glowN : c.glowS, { p: [s * 0.715, 0.04, 0], glow: true, outline: false })
    // Bolts at the plate's corners.
    for (const y of [-1, 1]) for (const z of [-1, 1]) b.part('body', sph(0.045, 6, 4), c.steel, { p: [s * 0.715, 0.04 + y * 0.3, z * 0.3], outline: false })
  })
  // The visor: a dark band, a glowing slit.
  b.part('visor', ell(0.44, 0.12, 0.07), c.visor, { p: [0, 0, 0.02], outline: false })
  b.part('visor', ell(0.34, 0.04, 0.05), c.eye, { p: [0, 0.005, 0.06], glow: true, outline: false })
  // The lodestone ore wedged in its top, a glowing seam through it.
  b.part('body', rock(0.36, 5), c.ore, { p: [0, 0.6, -0.04] })
  b.part('body', ell(0.06, 0.16, 0.3), c.core, { p: [0, 0.74, -0.04], r: [0, 0.4, 0.3], glow: true, outline: false })
  // Its core on its back (the weak spot), in a ringed socket.
  b.part('body', torus(0.21, 0.055, 8, 20), c.iron, { p: [0, 0.06, -0.53] })
  b.part('body', sph(0.17, 12, 8), c.core, { p: [0, 0.06, -0.5], glow: true, outline: false })

  // ── The arms: stone and iron, a horseshoe magnet for a hand ──
  b.mirror((_s, t) => {
    b.part(`shoulder${t}`, sph(0.21, 12, 8), c.iron)
    b.part(`shoulder${t}`, cap(0.14, 0.2, 10, 3), c.stone, { p: [0, -0.22, 0] })
    b.part(`elbow${t}`, torus(0.14, 0.04, 6, 14), c.iron, { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0] })
    b.part(`elbow${t}`, cap(0.155, 0.18, 10, 3), c.stone, { p: [0, -0.2, 0] })
    // The horseshoe: its arc up at the wrist, its silver poles pointing down
    // (forward once the arm swings up at Flux).
    b.part(`hand${t}`, torus(0.27, 0.1, 8, 18, Math.PI), t === 'L' ? c.north : c.south, { p: [0, -0.34, 0] })
    b.mirror((s2) => {
      b.part(`hand${t}`, cap(0.1, 0.1, 10, 3), c.silver, { p: [s2 * 0.27, -0.44, 0] })
      b.part(`hand${t}`, sph(0.06, 8, 6), t === 'L' ? c.glowN : c.glowS, { p: [s2 * 0.27, -0.58, 0], glow: true, outline: false })
    })
  })

  // ── The legs: stubby stone pillars, plank-shod feet ──
  b.mirror((_s, t) => {
    b.part(`hip${t}`, sph(0.17, 12, 8), c.iron)
    b.part(`hip${t}`, cap(0.15, 0.12, 10, 3), c.stone, { p: [0, -0.16, 0] })
    b.part(`knee${t}`, torus(0.15, 0.035, 6, 14), c.iron, { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0] })
    b.part(`knee${t}`, cap(0.14, 0.08, 10, 3), c.stone, { p: [0, -0.14, 0] })
    b.part(`knee${t}`, rbox(0.36, 0.16, 0.5, 0.4), c.trim, { p: [0, -0.3, 0.06] })
  })

  // ── The scrap cloud (each piece on its own bone) ──
  const scrap: Array<(k: number) => void> = [
    (k) => b.part(`scrap${k}`, rock(0.17, 9), c.stone),
    (k) => {
      b.part(`scrap${k}`, torus(0.15, 0.055, 6, 12), c.rust)
      b.part(`scrap${k}`, rcone(0.07, 0.07, 0.08, 0.02, 8), c.steel, { r: [Math.PI / 2, 0, 0] })
    },
    (k) => b.part(`scrap${k}`, torus(0.1, 0.06, 6, 6), c.steel),
    (k) => {
      b.part(`scrap${k}`, cap(0.05, 0.24, 8, 2), c.steel, { r: [0, 0, Math.PI / 2] })
      b.part(`scrap${k}`, rcone(0.09, 0.09, 0.07, 0.02, 6), c.iron, { p: [0.16, 0, 0], r: [0, 0, Math.PI / 2] })
    },
    (k) => b.part(`scrap${k}`, rbox(0.34, 0.07, 0.24, 0.35), c.rust, { r: [0.3, 0.4, 0] }),
    (k) => b.part(`scrap${k}`, cap(0.08, 0.22, 8, 2), c.iron, { r: [0.5, 0, Math.PI / 2] })
  ]
  for (let k = 0; k < LODE_SCRAP; k++) scrap[k % scrap.length]!(k)
  return b
}

const _glow = new Color()

/** Pose the golem for this frame (every channel arrives eased). */
export const poseLodestoneGolem = (rig: Rig, p: LodePose): void => {
  const T = p.time
  const wk = p.walk
  const tremble = Math.sin(T * 41) * 0.035 * p.drag
  const sleep = p.sleep
  // Body: a slow breath, its heavy gait's sway, the lean back of the pull,
  // the slam's drive forward, the twist of the fling; crouched asleep.
  const step = Math.sin(p.phase)
  const bob = Math.sin(T * 2) * 0.015 * (1 - wk) + Math.abs(step) * 0.05 * wk
  nudge(rig, 'body', 0, bob - 0.38 * sleep - 0.12 * p.slam - 0.08 * p.heave - 0.3 * p.dying, 0.05 * p.slam)
  pose(rig, 'body',
    -0.16 * p.pull + 0.4 * p.slam - 0.12 * p.heave + 0.2 * sleep + 0.25 * p.dying + tremble,
    0.4 * p.wind - 0.35 * p.throw,
    0.05 * step * wk + Math.sin(T * 27) * 0.06 * p.dying)
  // Arms: hanging; both thrust forward for the pull, overhead for the heave,
  // driven down for the slam; the right wound back over the shoulder for
  // the fling (the left points the way), whipped forward for the throw.
  const swing = 0.3 * step * wk
  const fwd = -1.5 * p.pull
  const up = -2.85 * p.heave
  const down = -0.9 * p.slam
  const rx = fwd + up + down
  pose(rig, 'shoulderL', rx + swing - 1.25 * p.wind + 0.2 * sleep, 0, -0.18 + 0.12 * p.pull - 0.25 * p.heave + tremble)
  pose(rig, 'shoulderR', rx - swing - 3.5 * p.wind - 1.3 * p.throw + 0.2 * sleep, 0,
    0.18 - 0.12 * p.pull + 0.25 * p.heave + 0.45 * p.wind - tremble)
  pose(rig, 'elbowL', -0.25 - 0.2 * p.heave + 0.1 * p.slam, 0, 0)
  pose(rig, 'elbowR', -0.25 - 0.2 * p.heave - 1.1 * p.wind + 0.1 * p.slam, 0, 0)
  // The magnets turn their poles to Flux as the pull begins.
  pose(rig, 'handL', 0, 0.6 * p.pull, 0)
  pose(rig, 'handR', 0, -0.6 * p.pull, 0)
  // Legs: a heavy stomp of a gait; braced wide for the pull and the slam.
  const brace = Math.max(p.pull, p.slam, p.heave * 0.6)
  pose(rig, 'hipL', 0.45 * step * wk - 0.35 * brace - 0.5 * sleep, 0, -0.12 * brace)
  pose(rig, 'hipR', -0.45 * step * wk - 0.35 * brace - 0.5 * sleep, 0, 0.12 * brace)
  pose(rig, 'kneeL', Math.max(0, -step) * 0.6 * wk + 0.5 * brace + 0.9 * sleep, 0, 0)
  pose(rig, 'kneeR', Math.max(0, step) * 0.6 * wk + 0.5 * brace + 0.9 * sleep, 0, 0)
  // The scrap where the AI put it, tumbling.
  for (let k = 0; k < p.scrap.length; k++) {
    const s = p.scrap[k]!
    rig.bones[`scrap${k}`]?.position.set(s.x, s.y, s.z)
    pose(rig, `scrap${k}`, s.spin * 0.7, s.spin, s.spin * 0.4)
    scaleBone(rig, `scrap${k}`, Math.max(0.001, s.s))
  }
  // The glow: the field's strength (the visor, the strips, the poles, the core).
  const flick = 1 + 0.15 * Math.sin(T * 31) * Math.min(1, Math.max(0, p.heat - 1))
  const k = Math.max(0.12, p.heat * flick * (1 - 0.75 * p.dying) * (1 - 0.85 * sleep))
  _glow.setRGB(k, k, k)
  rig.glowMaterial.color.copy(_glow)
}
