import { RigBuilder, sph, ell, cap, torus, rcyl, rcone, rbox, dome, paintBy, type Rig, pose, nudge } from './kit'
import { PAL } from './palette'
import { BOSS_GAIT, BOSS_FIDGET_LEN, TAU, bump, frac, fidgetEnv, fidgetPIn, gaitAmp, type EnemyMotion } from './motion'
import { legL, legR, gaitDir, gaitLegs, stanceDrop } from './gait'
import { buildVex, poseVex, type VexCue } from './vexMk1'

/**
 * ─── Core Masters ────────────────────────────────────────────────────────────
 *
 * The bosses. Four are "masters" — humanoids on Flux's own chibi skeleton,
 * scaled up, each with a signature helmet crest and weapon arms (the sector's
 * element made visible). The Scrapper (tutorial) is a hulking junk crane and
 * Dr. Vex's machine is a hovering skull-faced capsule — the finale's classic
 * silhouette (models/vexMk1.ts).
 */

export type BossId = 'scrapper' | 'blazeMaster' | 'frostMaster' | 'voltMaster' | 'galeMaster' | 'magnetMaster' | 'drillMaster' | 'tideMaster' | 'neonMaster' | 'rotorMaster' | 'vexMk1'

interface MasterSpec {
  main: string
  deep: string
  accent: string
  glow: string
  skin: string
  crest: (b: RigBuilder) => void
  arms: (b: RigBuilder) => void
}

/** Shared humanoid skeleton for the four masters (Flux's proportions ×1.35). */
const masterRig = (s: MasterSpec): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.62, 0])
    .bone('spine', 'hips', [0, 0.1, 0])
    .bone('chest', 'spine', [0, 0.16, 0])
    .bone('head', 'chest', [0, 0.22, 0])
    .bone('shoulderL', 'chest', [-0.28, 0.08, 0])
    .bone('elbowL', 'shoulderL', [0, -0.2, 0])
    .bone('shoulderR', 'chest', [0.28, 0.08, 0])
    .bone('elbowR', 'shoulderR', [0, -0.2, 0])
    .bone('hipL', 'hips', [-0.11, -0.05, 0])
    .bone('kneeL', 'hipL', [0, -0.22, 0])
    .bone('hipR', 'hips', [0.11, -0.05, 0])
    .bone('kneeR', 'hipR', [0, -0.22, 0])
  b.part('hips', ell(0.19, 0.11, 0.15), s.deep)
  b.part('spine', ell(0.17, 0.12, 0.14), s.main, { p: [0, 0.03, 0] })
  b.part('chest', ell(0.25, 0.19, 0.18, 18, 12), s.main, { p: [0, 0.04, 0] })
  b.part('chest', ell(0.12, 0.09, 0.05), s.accent, { p: [0, 0.03, 0.17] })
  b.part('chest', sph(0.05, 10, 8), s.glow, { p: [0, 0.03, 0.2], glow: true, outline: false })
  b.part('chest', torus(0.09, 0.03, 8, 18), s.deep, { p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] })
  // Head: face + helmet (the crest goes on top)
  const hy = 0.16
  b.part('head', ell(0.18, 0.17, 0.165, 18, 14), s.skin, { p: [0, hy - 0.01, 0.02] })
  b.part('head', dome(0.215, Math.PI * 0.42, 22, 10), s.main, { p: [0, hy, -0.005] })
  b.part('head', torus(0.205, 0.025, 6, 24), s.deep, { p: [0, hy + 0.045, 0], r: [Math.PI / 2 - 0.08, 0, 0] })
  b.part('head', ell(0.16, 0.06, 0.12), s.deep, { p: [0, hy - 0.13, -0.05] })
  b.mirror((sd) => {
    b.part('head', rcyl(0.07, 0.05, 0.02, 14), s.accent, { p: [sd * 0.205, hy - 0.02, -0.01], r: [0, 0, Math.PI / 2] })
    // Stern eyes (masters frown — narrower whites, glowing irises)
    b.part('head', ell(0.05, 0.045, 0.03), PAL.eyeWhite, { p: [sd * 0.065, hy - 0.025, 0.17], r: [0, sd * 0.22, sd * 0.25] })
    b.part('head', ell(0.026, 0.03, 0.02), s.glow, { p: [sd * 0.06, hy - 0.03, 0.19], r: [0, sd * 0.22, 0], glow: true, outline: false })
    b.part('head', ell(0.06, 0.012, 0.02), s.deep, { p: [sd * 0.065, hy + 0.03, 0.175], r: [0, sd * 0.2, -sd * 0.35], outline: false })
  })
  s.crest(b)
  b.mirror((sd, t) => {
    b.part(`shoulder${t}`, sph(0.1, 14, 10), s.deep)
    b.part(`shoulder${t}`, cap(0.065, 0.08), s.main, { p: [0, -0.09, 0] })
    b.part(`hip${t}`, cap(0.075, 0.1), s.main, { p: [0, -0.1, 0] })
    b.part(`knee${t}`, rcone(0.12, 0.1, 0.14, 0.035, 16), s.deep, { p: [0, -0.1, 0] })
    b.part(`knee${t}`, ell(0.125, 0.1, 0.18, 16, 10), s.deep, { p: [0, -0.235, 0.045] })
    b.part(`knee${t}`, torus(0.1, 0.024, 6, 16), s.accent, { p: [0, -0.03, 0], r: [Math.PI / 2, 0, 0] })
  })
  s.arms(b)
  return b.build({ outline: 0.016, height: 1.6 })
}

const cones = (b: RigBuilder, bone: string, pts: Array<[number, number, number, number, number, number]>, color: string, glow = false) => {
  // [x, y, z, height, radius, tiltZ]
  for (const [x, y, z, h, r, tz] of pts) b.part(bone, rcone(r, 0.01, h, 0.01, 10), color, { p: [x, y, z], r: [0, 0, tz], glow, outline: !glow })
}

export const buildBlazeMaster = (): Rig => masterRig({
  main: '#f0582a', deep: '#8a2a16', accent: '#ffb23a', glow: '#fff27a', skin: '#ffd2a8',
  crest: (b) => {
    // Flame crest: three stacked glowing cones on the helmet
    cones(b, 'head', [[0, 0.44, -0.02, 0.26, 0.09, 0], [-0.09, 0.38, 0.0, 0.18, 0.06, 0.4], [0.09, 0.38, 0.0, 0.18, 0.06, -0.4]], '#ffb23a', true)
    cones(b, 'head', [[0, 0.4, -0.02, 0.16, 0.11, 0]], '#e0442a')
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      // Flame nozzles: flared forearm cannons with glowing throats
      b.part(`elbow${t}`, rcone(0.08, 0.12, 0.26, 0.03, 16), '#3b4458', { p: [0, -0.14, 0], r: [Math.PI, 0, 0] })
      b.part(`elbow${t}`, torus(0.11, 0.025, 6, 16), '#ffb23a', { p: [0, -0.27, 0], r: [Math.PI / 2, 0, 0] })
      b.part(`elbow${t}`, sph(0.075, 10, 8), '#fff27a', { p: [0, -0.26, 0], glow: true, outline: false })
      void sd
    })
  }
})

export const buildFrostMaster = (): Rig => masterRig({
  main: '#7fd6ff', deep: '#2f78ad', accent: '#ffffff', glow: '#bff6ff', skin: '#e8f4ff',
  crest: (b) => {
    // Ice crystal crown
    const pts: Array<[number, number, number, number, number, number]> = []
    for (let k = -2; k <= 2; k++) pts.push([k * 0.075, 0.38 - Math.abs(k) * 0.02, -0.02, 0.22 - Math.abs(k) * 0.05, 0.045, -k * 0.25])
    cones(b, 'head', pts, '#e8fbff')
    b.mirror((sd) => cones(b, 'chest', [[sd * 0.3, 0.3, 0, 0.22, 0.06, -sd * 0.6]], '#bff6ff', true))
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#2f78ad', { p: [0, -0.09, 0] })
      // Crystal blades on the forearms
      cones(b, `elbow${t}`, [[sd * 0.04, -0.24, 0.05, 0.3, 0.05, Math.PI + sd * 0.2]], '#e8fbff')
      b.part(`elbow${t}`, sph(0.08, 12, 8), '#e8fbff', { p: [0, -0.22, 0] })
    })
  }
})

export const buildVoltMaster = (): Rig => masterRig({
  main: '#ffd23a', deep: '#5c2ca0', accent: '#b98cff', glow: '#d3fbff', skin: '#ffd2a8',
  crest: (b) => {
    // Zig-zag antenna: three tilted cones stacked into a bolt
    cones(b, 'head', [[0.02, 0.4, 0, 0.14, 0.05, 0.6], [-0.02, 0.5, 0, 0.14, 0.05, -0.6], [0.02, 0.6, 0, 0.14, 0.05, 0.5]], '#fff27a', true)
    b.mirror((sd) => b.part('chest', torus(0.1, 0.035, 8, 18), '#b98cff', { p: [sd * 0.3, 0.12, 0], r: [0, 0, Math.PI / 2] }))
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      // Coil gauntlets: stacked rings with a glowing ball
      for (let k = 0; k < 3; k++) b.part(`elbow${t}`, torus(0.075, 0.025, 6, 16), k % 2 ? '#b98cff' : '#5c2ca0', { p: [0, -0.05 - k * 0.07, 0], r: [Math.PI / 2, 0, 0] })
      b.part(`elbow${t}`, sph(0.085, 12, 8), '#d3fbff', { p: [0, -0.27, 0], glow: true, outline: false })
      void sd
    })
  }
})

export const buildGaleMaster = (): Rig => masterRig({
  main: '#3fc0b0', deep: '#1f6a62', accent: '#ffffff', glow: '#bffff2', skin: '#ffd2a8',
  crest: (b) => {
    // Fan fins either side of the helmet + a small propeller hub on top
    b.mirror((sd) => {
      b.part('head', ell(0.05, 0.16, 0.12), '#ffffff', { p: [sd * 0.22, 0.22, -0.02], r: [0, 0, -sd * 0.5] })
    })
    b.part('head', sph(0.05, 10, 8), '#ffffff', { p: [0, 0.39, 0] })
    // Wing cape on the back
    b.mirror((sd) => b.part('chest', ell(0.22, 0.28, 0.03), '#bffff2', { p: [sd * 0.18, 0.02, -0.2], r: [0.2, sd * 0.4, sd * 0.3] }))
  },
  arms: (b) => {
    b.mirror((_sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#1f6a62', { p: [0, -0.09, 0] })
      b.part(`elbow${t}`, rcyl(0.1, 0.06, 0.02, 16), '#ffffff', { p: [0, -0.22, 0] })
      b.part(`elbow${t}`, torus(0.11, 0.02, 6, 16), '#3fc0b0', { p: [0, -0.22, 0], r: [Math.PI / 2, 0, 0] })
    })
  }
})

export const buildMagnetMaster = (): Rig => masterRig({
  main: '#3f7bff', deep: '#22306e', accent: '#c9d3e6', glow: '#d6e4ff', skin: '#ffd2a8',
  crest: (b) => {
    // A horseshoe crown: a cobalt U over the helmet, its pole tips lit.
    b.part('head', torus(0.17, 0.045, 8, 18, Math.PI), '#3f7bff', { p: [0, 0.34, 0], r: [0, 0, Math.PI] })
    b.mirror((sd) => {
      b.part('head', rcyl(0.047, 0.1, 0.015, 10), '#3f7bff', { p: [sd * 0.17, 0.39, 0] })
      b.part('head', rcyl(0.05, 0.06, 0.015, 10), '#3f7bff', { p: [sd * 0.17, 0.46, 0], glow: true, outline: false })
    })
    // Pole plates on the chest: north red, south blue.
    b.mirror((sd) => b.part('chest', rcyl(0.055, 0.025, 0.01, 16), sd < 0 ? '#ff4a5e' : '#3f7bff', { p: [sd * 0.12, 0.12, 0.19], r: [Math.PI / 2, 0, 0], glow: true, outline: false }))
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#22306e', { p: [0, -0.09, 0] })
      // Horseshoe gauntlets: a U for a hand, its tips the pole colour.
      b.part(`elbow${t}`, torus(0.09, 0.035, 8, 16, Math.PI), '#3f7bff', { p: [0, -0.22, 0], r: [0, Math.PI / 2, Math.PI] })
      for (const s of [-1, 1]) b.part(`elbow${t}`, rcyl(0.037, 0.06, 0.01, 8), sd < 0 ? '#ff4a5e' : '#3f7bff', { p: [0, -0.32, s * 0.09], glow: true, outline: false })
    })
  }
})

export const buildDrillMaster = (): Rig => masterRig({
  main: '#c8862a', deep: '#4a3d32', accent: '#a7afc4', glow: '#ffe08a', skin: '#ffd2a8',
  crest: (b) => {
    // A drill for a crest: a steel cone on the helmet, banded, and a lamp.
    b.part('head', rcone(0.13, 0.02, 0.36, 0.02, 12), '#a7afc4', { p: [0, 0.48, -0.02] })
    for (let k = 0; k < 2; k++) b.part('head', torus(0.11 - k * 0.04, 0.02, 6, 14), '#4a3d32', { p: [0, 0.38 + k * 0.1, -0.02], r: [Math.PI / 2, 0, 0] })
    b.part('head', sph(0.05, 10, 8), '#ffe08a', { p: [0, 0.26, 0.2], glow: true, outline: false })
    // Hazard stripes on the shoulders.
    b.mirror((sd) => b.part('chest', rbox(0.14, 0.06, 0.2, 0.2), '#4a3d32', { p: [sd * 0.3, 0.26, 0], r: [0, 0, sd * 0.3] }))
  },
  arms: (b) => {
    b.mirror((_sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#4a3d32', { p: [0, -0.09, 0] })
      // Drill hands: a banded steel cone pointing down the forearm.
      b.part(`elbow${t}`, rcone(0.11, 0.015, 0.34, 0.02, 12), '#a7afc4', { p: [0, -0.34, 0], r: [Math.PI, 0, 0] })
      b.part(`elbow${t}`, torus(0.1, 0.022, 6, 14), '#c8862a', { p: [0, -0.22, 0], r: [Math.PI / 2, 0, 0] })
    })
  }
})

export const buildTideMaster = (): Rig => masterRig({
  main: '#1f8fd6', deep: '#163a66', accent: '#ffd23a', glow: '#bff0ff', skin: '#ffd2a8',
  crest: (b) => {
    // A dorsal fin over the helmet, and a diver's visor ring.
    b.part('head', ell(0.04, 0.2, 0.17), '#1f3f6a', { p: [0, 0.4, -0.06], r: [-0.3, 0, 0] })
    b.part('head', torus(0.12, 0.025, 6, 18), '#ffd23a', { p: [0, 0.2, 0.2] })
    // Bubble tanks on the back.
    b.mirror((sd) => b.part('chest', rcyl(0.07, 0.3, 0.03, 12), '#bff0ff', { p: [sd * 0.11, 0.08, -0.24], glow: true, outline: false }))
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#1f3f6a', { p: [0, -0.09, 0] })
      // A lance on each forearm, a bubble at its tip.
      b.part(`elbow${t}`, rcone(0.06, 0.012, 0.42, 0.01, 10), '#ffd23a', { p: [sd * 0.02, -0.36, 0.03], r: [Math.PI, 0, 0] })
      b.part(`elbow${t}`, sph(0.06, 10, 8), '#bff0ff', { p: [sd * 0.02, -0.6, 0.03], glow: true, outline: false })
    })
  }
})

export const buildNeonMaster = (): Rig => masterRig({
  main: '#2a2a3a', deep: '#14141f', accent: '#ff3fd2', glow: '#a85cff', skin: '#ffd2a8',
  crest: (b) => {
    // A neon halo over the helmet and a visor stripe.
    b.part('head', torus(0.2, 0.025, 6, 24), '#ff3fd2', { p: [0, 0.42, -0.04], r: [Math.PI / 2 - 0.3, 0, 0], glow: true, outline: false })
    b.part('head', rbox(0.3, 0.05, 0.05, 0.3), '#a85cff', { p: [0, 0.2, 0.2], glow: true, outline: false })
    // Neon piping down the chest.
    b.mirror((sd) => b.part('chest', rbox(0.03, 0.34, 0.03, 0.3), sd < 0 ? '#ff3fd2' : '#a85cff', { p: [sd * 0.1, 0.05, 0.21], glow: true, outline: false }))
  },
  arms: (b) => {
    b.mirror((sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#14141f', { p: [0, -0.09, 0] })
      // A blade of light on each forearm.
      b.part(`elbow${t}`, rbox(0.04, 0.5, 0.14, 0.2), sd < 0 ? '#ff3fd2' : '#a85cff', { p: [sd * 0.08, -0.32, 0.05], glow: true, outline: false })
    })
  }
})

export const buildRotorMaster = (): Rig => masterRig({
  main: '#a6e64a', deep: '#3a3f4f', accent: '#ffffff', glow: '#eaffc0', skin: '#ffd2a8',
  crest: (b) => {
    // A rotor mast on the helmet, two blades across it; goggles.
    b.part('head', rcyl(0.03, 0.2, 0.01, 8), '#3a3f4f', { p: [0, 0.44, -0.02] })
    b.part('head', rbox(0.7, 0.03, 0.08, 0.3), '#ffffff', { p: [0, 0.55, -0.02] })
    b.part('head', rbox(0.08, 0.03, 0.7, 0.3), '#ffffff', { p: [0, 0.56, -0.02] })
    b.part('head', rbox(0.3, 0.07, 0.06, 0.3), '#b8ff5a', { p: [0, 0.22, 0.2], glow: true, outline: false })
    // Two ducted fans on the back.
    b.mirror((sd) => b.part('chest', torus(0.13, 0.04, 6, 16), '#3a3f4f', { p: [sd * 0.18, 0.12, -0.24], r: [Math.PI / 2, 0, 0] }))
  },
  arms: (b) => {
    b.mirror((_sd, t) => {
      b.part(`elbow${t}`, cap(0.085, 0.1), '#3a3f4f', { p: [0, -0.09, 0] })
      // A little rotor on each fist.
      b.part(`elbow${t}`, rcyl(0.06, 0.08, 0.02, 10), '#a6e64a', { p: [0, -0.22, 0] })
      b.part(`elbow${t}`, rbox(0.32, 0.02, 0.05, 0.3), '#ffffff', { p: [0, -0.27, 0] })
    })
  }
})

/** The Scrapper: a hulking junk crane — magnet claw, hammer fist, visor head. */
export const buildScrapper = (): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 1.0, 0])
    .bone('chest', 'hips', [0, 0.4, 0])
    .bone('head', 'chest', [0, 0.55, 0.12])
    .bone('shoulderL', 'chest', [-0.72, 0.28, 0])
    .bone('elbowL', 'shoulderL', [0, -0.5, 0])
    .bone('shoulderR', 'chest', [0.72, 0.28, 0])
    .bone('elbowR', 'shoulderR', [0, -0.5, 0])
    .bone('hipL', 'hips', [-0.28, -0.1, 0])
    .bone('kneeL', 'hipL', [0, -0.42, 0])
    .bone('hipR', 'hips', [0.28, -0.1, 0])
    .bone('kneeR', 'hipR', [0, -0.42, 0])
  const rust = '#c9763a'
  const yellow = '#ffc21a'
  const steel = '#6f7a90'
  b.part('hips', ell(0.42, 0.22, 0.34), steel)
  const body = paintBy(ell(0.62, 0.52, 0.48, 22, 16), (x, y) => (Math.abs(y - 0.1) < 0.07 ? '#3b4458' : x > 0.25 ? rust : yellow))
  b.painted('chest', body, { p: [0, 0.12, 0] })
  b.part('chest', torus(0.5, 0.06, 8, 26), '#3b4458', { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0] })
  for (const [x, y] of [[-0.3, 0.4], [0.3, 0.35], [0.05, -0.25], [-0.4, -0.1]] as const) {
    b.part('chest', sph(0.06, 8, 6), '#3b4458', { p: [x, y, 0.42] })
  }
  b.part('chest', ell(0.18, 0.12, 0.06), '#ff7a2a', { p: [0, 0.12, 0.47], glow: true, outline: false })
  b.part('head', ell(0.24, 0.2, 0.22, 16, 12), yellow)
  b.part('head', ell(0.2, 0.07, 0.08), '#1d2438', { p: [0, 0.02, 0.18] })
  b.part('head', ell(0.14, 0.035, 0.03), '#ff4050', { p: [0, 0.02, 0.25], glow: true, outline: false })
  b.part('head', rcyl(0.04, 0.2, 0.02, 8), steel, { p: [0.12, 0.28, -0.05] })
  b.part('head', sph(0.05, 8, 6), '#ff4050', { p: [0.12, 0.4, -0.05], glow: true, outline: false })
  b.mirror((sd, t) => {
    b.part(`shoulder${t}`, sph(0.3, 16, 12), steel)
    b.part(`shoulder${t}`, cap(0.14, 0.24), rust, { p: [0, -0.26, 0] })
    b.part(`hip${t}`, cap(0.16, 0.22), steel, { p: [0, -0.2, 0] })
    b.part(`knee${t}`, cap(0.15, 0.18), rust, { p: [0, -0.16, 0] })
    b.part(`knee${t}`, ell(0.25, 0.16, 0.34), steel, { p: [0, -0.46, 0.06] })
    void sd
  })
  // Left: magnet claw (a horseshoe torus)
  b.part('elbowL', cap(0.14, 0.18), steel, { p: [0, -0.14, 0] })
  b.part('elbowL', torus(0.22, 0.09, 8, 18, Math.PI), '#d0303f', { p: [0, -0.45, 0], r: [0, 0, Math.PI] })
  b.mirror((sd) => b.part('elbowL', rcyl(0.095, 0.1, 0.03, 12), '#e8edf7', { p: [sd * 0.22, -0.46, 0] }))
  // Right: hammer fist
  b.part('elbowR', cap(0.15, 0.16), rust, { p: [0, -0.14, 0] })
  b.part('elbowR', rcyl(0.26, 0.42, 0.1, 18), '#3b4458', { p: [0, -0.46, 0], r: [0, 0, Math.PI / 2] })
  b.part('elbowR', torus(0.26, 0.04, 6, 18), yellow, { p: [0.16, -0.46, 0], r: [0, Math.PI / 2, 0] })
  b.part('elbowR', torus(0.26, 0.04, 6, 18), yellow, { p: [-0.16, -0.46, 0], r: [0, Math.PI / 2, 0] })
  return b.build({ outline: 0.026, height: 2.6 })
}

/** Dr. Vex's machine, the Mk-I hover pod: its own module (models/vexMk1.ts). */
export { buildVex }

export const buildBossRig = (id: BossId): Rig => {
  switch (id) {
    case 'scrapper': return buildScrapper()
    case 'blazeMaster': return buildBlazeMaster()
    case 'frostMaster': return buildFrostMaster()
    case 'voltMaster': return buildVoltMaster()
    case 'galeMaster': return buildGaleMaster()
    case 'magnetMaster': return buildMagnetMaster()
    case 'drillMaster': return buildDrillMaster()
    case 'tideMaster': return buildTideMaster()
    case 'neonMaster': return buildNeonMaster()
    case 'rotorMaster': return buildRotorMaster()
    case 'vexMk1': return buildVex()
  }
}

export type BossAct = 'idle' | 'walk' | 'tele' | 'attack' | 'stun' | 'air'

// ─── Motion layer (the humanoid bosses) ──────────────────────────────────────
//
// With `m` (the game, via syncBossVisual) a Master or the Scrapper stands in a
// ready stance instead of the old 18°-outward A-pose, breathes, shifts its
// weight, leads its turns with the head, walks on the same distance-driven
// planted-foot gait as the machines (models/gait.ts) with its arms swinging
// against its legs, and may throw a short taunt in the `recover` after an
// attack. That base layer is blended toward the act poses below by their
// weights, and each act's pose is the OLD formula, untouched: at full weight
// (the end of a telegraph, the first frame of a strike, airborne, dizzy) the
// boss holds exactly the pose it always did. The look (the rigs) is unchanged.

/** An arm's rest: shoulder [rx, ry, rz] + elbow rx for the L arm (R mirrors ry, rz). */
interface ArmRest { x: number; y: number; z: number; elbow: number }
/** The Masters' arms at rest: a ready stance, the weapon forearms held
 *  forward (≈6° out, ≈33° forward). Chosen with the legs WALKING — forward,
 *  sideways, diagonal — so a swinging thigh never meets a forearm cannon. */
export const MASTER_REST: Readonly<ArmRest> = { x: -0.6, y: -0.25, z: -0.08, elbow: -0.5 }
/** The Scrapper's: magnet claw and hammer carried forward, clear of its
 *  thighs through the whole stride. */
export const SCRAPPER_REST: Readonly<ArmRest> = { x: -0.6, y: -0.25, z: -0.08, elbow: -0.8 }

const mix = (a: number, b: number, k: number): number => a + (b - a) * k

const animateHumanoidBoss = (rig: Rig, id: BossId, t: number, act: BossAct, k: number, m: EnemyMotion): void => {
  const g = BOSS_GAIT[id]!
  const R = id === 'scrapper' ? SCRAPPER_REST : MASTER_REST
  const T = t * m.tempo
  const wk = gaitAmp(m.walk)
  const still = 1 - wk
  gaitLegs(g, m, wk)
  const u = frac(m.phase / TAU)
  const f = gaitDir.f
  const s = gaitDir.s
  // ── Taunt (only ever scheduled in `recover`, faded by m.calm) ──
  const p = fidgetPIn(m, BOSS_FIDGET_LEN[id])
  const fe = m.fid ? fidgetEnv(p) * m.calm : 0
  let lX = 0
  let lY = 0
  let lE = 0
  let rX = 0
  let rY = 0
  let rE = 0
  let hX = 0
  let hY = 0
  let hZ = 0
  let cY = 0
  let cZ = 0
  let buzz = 0
  if (m.fid === 1) {
    // Shoulder roll: each arm circles forward in turn
    const q = Math.sin(TAU * p)
    lX = -0.15 * Math.max(0, q)
    rX = -0.15 * Math.max(0, -q)
    cZ = 0.07 * q
  } else if (m.fid === 2) {
    if (id === 'scrapper') {
      // Hammer tap: the hammer fist lifts and taps down, twice
      const tap = bump(p, 0.05, 0.45) + 0.8 * bump(p, 0.5, 0.9)
      rX = -0.7 * tap
      rE = -0.3 * tap
      hX = 0.12 * Math.sin(Math.PI * p)
    } else if (id === 'blazeMaster') {
      // Nozzle flick: both forearms flick up and back
      const fl = Math.sin(Math.PI * p)
      lE = -0.65 * fl
      rE = -0.65 * fl
      lX = -0.15 * fl
      rX = -0.15 * fl
      hZ = 0.08 * Math.sin(TAU * p)
    } else if (id === 'frostMaster') {
      // Blade check: the R blade comes up in front, the head tips to look
      const up = Math.sin(Math.PI * p)
      rX = -0.8 * up
      rY = -0.35 * up
      rE = -0.8 * up
      hX = 0.15 * up
      hY = -0.2 * up
    } else if (id === 'voltMaster') {
      // Crackle: a fast shoulder buzz and a head twitch
      const bz = Math.sin(8 * TAU * p)
      lX = 0.06 * bz
      rX = -0.06 * bz
      buzz = 0.01 * Math.sin(10 * TAU * p)
      hZ = 0.1 * Math.sin(3 * TAU * p)
    } else if (id === 'rotorMaster') {
      // Rotor check: both arms out level, fists spinning, a turn of the head
      const out = Math.sin(Math.PI * p)
      lY = 0.8 * out
      rY = -0.8 * out
      hY = 0.3 * Math.sin(TAU * p)
    } else if (id === 'neonMaster') {
      // Blade flourish: the R blade spins a figure-eight in front
      const sw = Math.sin(TAU * p)
      rX = -0.6 * Math.abs(sw)
      rY = -0.5 * sw
      rE = -0.6 * Math.abs(sw)
      cY = 0.1 * sw
    } else if (id === 'tideMaster') {
      // Breaststroke: both arms sweep out and round, the head bobs
      const sw = Math.sin(TAU * p)
      lY = 0.5 * Math.max(0, sw)
      rY = -0.5 * Math.max(0, sw)
      lX = -0.3 * Math.max(0, -sw)
      rX = -0.3 * Math.max(0, -sw)
      hX = 0.08 * Math.sin(2 * TAU * p)
    } else if (id === 'drillMaster') {
      // Drill rev: both forearms buzz, the head ducks to the noise
      const rev = Math.sin(Math.PI * p)
      lE = -0.4 * rev + 0.05 * Math.sin(12 * TAU * p) * rev
      rE = -0.4 * rev - 0.05 * Math.sin(12 * TAU * p) * rev
      hX = 0.12 * rev
    } else if (id === 'magnetMaster') {
      // Polarity clap: both gauntlets swing in, meet, and spring apart
      const inn = bump(p, 0.05, 0.5)
      const out = bump(p, 0.45, 0.95)
      lX = -0.5 * inn
      rX = -0.5 * inn
      lY = 0.5 * inn - 0.25 * out
      rY = -0.5 * inn + 0.25 * out
      hX = -0.1 * out
    } else {
      // Fan flourish: the R arm sweeps across the chest and back
      const sw = Math.sin(Math.PI * p)
      rX = -0.5 * sw
      rY = -0.55 * sw
      rE = -0.45 * sw
      cY = 0.12 * sw
    }
  }
  // ── Act weights: each blends toward its OLD pose ──
  const bob = Math.sin(t * 2.2) * 0.012
  const wT = act === 'tele' ? k : 0
  const wA = act === 'attack' || act === 'air' ? 1 - k : 0
  const wAir = m.air
  const wS = m.daze
  const wAct = Math.max(wT, wA, wAir, wS)
  const legW = Math.max(wT, wA, wS)
  // ── Base layer ──
  const br = Math.sin(T * 2.0)
  const sh = Math.sin(T * 0.5 + 0.9)
  const shiftX = 0.012 * sh * still - 0.02 * Math.sin(TAU * u) * wk
  const twist = ((legL.th - legR.th) * 0.5 * 0.12 / g.A) * wk * f
  const lead = Math.max(-0.3, Math.min(0.3, 0.1 * m.turn))
  // Arms swing against the legs: L with the R leg, R with the L leg
  const swingL = (legR.th / g.A) * 0.35 * wk * f
  const swingR = (legL.th / g.A) * 0.35 * wk * f
  const breathArm = 0.03 * br * still
  // Hips height
  let hipsY = -stanceDrop(g) + 0.008 * br * still + buzz * fe
  hipsY = mix(hipsY, -0.08 * k + bob, wT)
  hipsY = mix(hipsY, bob, wA)
  hipsY = mix(hipsY, bob, wAir)
  hipsY = mix(hipsY, -0.05, wS)
  nudge(rig, 'hips', 0, hipsY, 0)
  // Legs: the gait → still (telegraph, strike, dizzy) → tucked (airborne)
  let hLx = mix(-legL.th * f, 0, legW)
  let hLz = mix(legL.th * s - gaitDir.bias, 0, legW)
  let hRx = mix(-legR.th * f, 0, legW)
  let hRz = mix(legR.th * s + gaitDir.bias, 0, legW)
  let kL = mix(legL.knee, 0, legW)
  let kR = mix(legR.knee, 0, legW)
  hLx = mix(hLx, -0.6, wAir)
  hLz = mix(hLz, 0, wAir)
  hRx = mix(hRx, -0.6, wAir)
  hRz = mix(hRz, 0, wAir)
  kL = mix(kL, 0.9, wAir)
  kR = mix(kR, 0.9, wAir)
  pose(rig, 'hipL', hLx, 0, hLz)
  pose(rig, 'hipR', hRx, 0, hRz)
  pose(rig, 'kneeL', kL, 0, 0)
  pose(rig, 'kneeR', kR, 0, 0)
  // Spine (the Masters; the old poses never moved it) and chest
  pose(rig, 'spine', 0.02 * br * (1 - wAct), 0, 0)
  nudge(rig, 'chest', shiftX * (1 - wAct), 0, 0)
  let chx = 0.04 + 0.08 * wk * f + 0.015 * br
  let chy = -twist + cY * fe
  let chz = -1.2 * shiftX + cZ * fe
  chx = mix(chx, 0.2 * k, wT)
  chy = mix(chy, 0, wT)
  chz = mix(chz, 0, wT)
  chx = mix(chx, -0.12 * (1 - k), wA)
  chy = mix(chy, 0, wA)
  chz = mix(chz, 0, wA)
  chx = mix(chx, 0.35, wS)
  chy = mix(chy, Math.sin(t * 8) * 0.2, wS)
  chz = mix(chz, 0, wS)
  pose(rig, 'chest', chx, chy, chz)
  // Head: leads the turns
  let hx = -0.04 + hX * fe
  let hy = lead + hY * fe
  let hz = hZ * fe
  hx = mix(hx, -0.15 * k, wT)
  hy = mix(hy, 0, wT)
  hz = mix(hz, 0, wT)
  hx = mix(hx, 0, wA)
  hy = mix(hy, 0, wA)
  hz = mix(hz, 0, wA)
  hx = mix(hx, 0.3, wS)
  hy = mix(hy, Math.sin(t * 9) * 0.4, wS)
  hz = mix(hz, 0, wS)
  pose(rig, 'head', hx, hy, hz)
  // Arms
  let sLx = R.x - swingL + breathArm + lX * fe
  let sLy = R.y + lY * fe
  let sLz = R.z
  let sRx = R.x - swingR + breathArm + rX * fe
  let sRy = -R.y + rY * fe
  let sRz = -R.z
  let eL = R.elbow + lE * fe
  let eR = R.elbow + rE * fe
  sLx = mix(sLx, 0.8 * k, wT)
  sLy = mix(sLy, 0, wT)
  sLz = mix(sLz, -0.4 * k, wT)
  sRx = mix(sRx, 0.8 * k, wT)
  sRy = mix(sRy, 0, wT)
  sRz = mix(sRz, 0.4 * k, wT)
  eL = mix(eL, -0.8 * k, wT)
  eR = mix(eR, -0.8 * k, wT)
  const e1 = 1 - k
  sLx = mix(sLx, -1.5 * e1, wA)
  sLy = mix(sLy, 0, wA)
  sLz = mix(sLz, -0.1, wA)
  sRx = mix(sRx, -1.5 * e1, wA)
  sRy = mix(sRy, 0, wA)
  sRz = mix(sRz, 0.1, wA)
  eL = mix(eL, -0.1, wA)
  eR = mix(eR, -0.1, wA)
  sLx = mix(sLx, -2.6, wAir)
  sLy = mix(sLy, 0, wAir)
  sLz = mix(sLz, -0.3, wAir)
  sRx = mix(sRx, -2.6, wAir)
  sRy = mix(sRy, 0, wAir)
  sRz = mix(sRz, 0.3, wAir)
  sLx = mix(sLx, 0.3, wS)
  sLy = mix(sLy, 0, wS)
  sLz = mix(sLz, -0.6, wS)
  sRx = mix(sRx, 0.3, wS)
  sRy = mix(sRy, 0, wS)
  sRz = mix(sRz, 0.6, wS)
  pose(rig, 'shoulderL', sLx, sLy, sLz)
  pose(rig, 'shoulderR', sRx, sRy, sRz)
  pose(rig, 'elbowL', eL, 0, 0)
  pose(rig, 'elbowR', eR, 0, 0)
}

/** Generic boss animation driven by the AI's current action. With `m`, the
 *  motion layer (humanoid bosses; Dr. Vex keeps his own hover, tilted by his
 *  travel). `cue` (the boss itself will do): Dr. Vex winds up the coming
 *  pattern's own weapon and shows his phase-2 damage. */
export const poseBoss = (rig: Rig, id: BossId, t: number, act: BossAct, k: number, m?: EnemyMotion, cue?: VexCue): void => {
  if (m && id !== 'vexMk1') {
    animateHumanoidBoss(rig, id, t, act, k, m)
    return
  }
  if (id === 'vexMk1') {
    poseVex(rig, t, act, k, m, cue)
    return
  }
  const walk = act === 'walk' ? 1 : 0
  const w = Math.sin(t * 7) * walk
  pose(rig, 'hipL', w * 0.5, 0, 0)
  pose(rig, 'hipR', -w * 0.5, 0, 0)
  pose(rig, 'kneeL', Math.max(0, -w) * 0.6, 0, 0)
  pose(rig, 'kneeR', Math.max(0, w) * 0.6, 0, 0)
  const bob = Math.sin(t * 2.2) * 0.012
  if (act === 'tele') {
    // Wind-up: crouch and draw both arms back
    nudge(rig, 'hips', 0, -0.08 * k + bob, 0)
    pose(rig, 'shoulderL', 0.8 * k, 0, -0.4 * k)
    pose(rig, 'shoulderR', 0.8 * k, 0, 0.4 * k)
    pose(rig, 'elbowL', -0.8 * k, 0, 0)
    pose(rig, 'elbowR', -0.8 * k, 0, 0)
    pose(rig, 'chest', 0.2 * k, 0, 0)
    pose(rig, 'head', -0.15 * k, 0, 0)
  } else if (act === 'attack') {
    // Thrust: both weapon arms forward
    const e = 1 - k
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'shoulderL', -1.5 * e, 0, -0.1)
    pose(rig, 'shoulderR', -1.5 * e, 0, 0.1)
    pose(rig, 'elbowL', -0.1, 0, 0)
    pose(rig, 'elbowR', -0.1, 0, 0)
    pose(rig, 'chest', -0.12 * e, 0, 0)
    pose(rig, 'head', 0, 0, 0)
  } else if (act === 'air') {
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'shoulderL', -2.6, 0, -0.3)
    pose(rig, 'shoulderR', -2.6, 0, 0.3)
    pose(rig, 'kneeL', 0.9, 0, 0)
    pose(rig, 'kneeR', 0.9, 0, 0)
    pose(rig, 'hipL', -0.6, 0, 0)
    pose(rig, 'hipR', -0.6, 0, 0)
  } else if (act === 'stun') {
    nudge(rig, 'hips', 0, -0.05, 0)
    pose(rig, 'chest', 0.35, Math.sin(t * 8) * 0.2, 0)
    pose(rig, 'head', 0.3, Math.sin(t * 9) * 0.4, 0)
    pose(rig, 'shoulderL', 0.3, 0, -0.6)
    pose(rig, 'shoulderR', 0.3, 0, 0.6)
  } else {
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'chest', 0, Math.sin(t * 0.8) * 0.1, 0)
    pose(rig, 'head', 0, Math.sin(t * 0.8) * 0.15, 0)
    pose(rig, 'shoulderL', 0.1, 0, -0.35 + Math.sin(t * 2) * 0.05)
    pose(rig, 'shoulderR', 0.1, 0, 0.35 - Math.sin(t * 2) * 0.05)
    pose(rig, 'elbowL', -0.5, 0, 0)
    pose(rig, 'elbowR', -0.5, 0, 0)
  }
}
