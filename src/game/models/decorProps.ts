import type { BufferGeometry } from 'three'
import { cap, dome, lathe, paint, paintBy, rbox, rcone, rcyl, rock, sph, torus, xform, type V3 } from './kit'
import type { SectorId } from '../world/themes'

/**
 * ─── Set dressing: each level's own props (#114) ─────────────────────────────
 *
 * "Awesomeness lies in the details": what the story says is there, standing
 * in the rooms — the Blaze Refinery's forge, the Cryo Plant's coolant tanks,
 * the Deep Mine's shoring and cage lamps, Vex's face on the screens. Pure
 * geometry in the props' toon style (bevelled, vertex-coloured, outlined by
 * the room's decor mesh), merged into each room's decor: no draw call of
 * their own (`climbMesh.ts`). The plan of where they stand is `world/decor.ts`.
 *
 * Two mounts, each in its own local frame:
 *
 *   • 'wall'  — the wall's face is the plane z = 0, the room is +z, y is the
 *     floor. Nothing reaches z < WALL_GAP: no face of a prop lies on the
 *     wall's (no two opaque surfaces in one plane, ever). Hung over head
 *     height or flat against the wall, they never touch a body.
 *   • 'floor' — stands on y = 0 and sinks SINK into it (its feet cross the
 *     floor plane instead of lying on it), centred on the origin, its front
 *     to +z; `r` is its body's radius on the floor (the nav's prop circle).
 */

export type DecorMount = 'wall' | 'floor'

export interface DecorParts {
  toon: BufferGeometry[]
  glow: BufferGeometry[]
}

export interface DecorDef {
  mount: DecorMount
  /** A floor prop's body on the floor (m); 0 for a wall prop. */
  r: number
  build: () => DecorParts
}

/** No face of a wall prop comes nearer the wall than this (m). */
export const WALL_GAP = 0.03
/** A floor prop's feet go this far into the floor (m). */
export const SINK = 0.03

const P = (toon: BufferGeometry[], glow: BufferGeometry[] = []): DecorParts => ({ toon, glow })
const at = (g: BufferGeometry, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry => xform(g, p, r, s)
const HALF = Math.PI / 2

// Shared colours (the props' own palette, near the level themes).
const STEEL = '#8c96a8'
const STEEL_DK = '#4a5262'
const IRON = '#3a3f4a'
const RUST = '#8a4a2a'
const BOLT = '#c9d1dc'
const HAZ_Y = '#f2c230'
const HAZ_K = '#2a2d36'
const VEX_RED = '#ff2d3f'

/** A bracket off the wall: a plate with two bolts and an arm out to `out`. */
const bracket = (y: number, out: number, x = 0): BufferGeometry[] => [
  at(paint(rbox(0.32, 0.42, 0.08, 0.2, 8, 4), STEEL_DK), [x, y, WALL_GAP + 0.05]),
  at(paint(sph(0.035, 6, 4), BOLT), [x, y + 0.12, WALL_GAP + 0.1]),
  at(paint(sph(0.035, 6, 4), BOLT), [x, y - 0.12, WALL_GAP + 0.1]),
  at(paint(rbox(0.1, 0.1, out, 0.3, 6, 4), STEEL), [x, y, WALL_GAP + 0.06 + out / 2])
]

/** Dr. Vex's skull glyph in the props' language: a cranium, two eye holes
 *  (glow), a jaw — no words on any screen. Faces +z, centred on (0, 0, 0). */
const skull = (s: number, glowHex: string): DecorParts => P(
  [
    at(paint(rbox(0.5 * s, 0.42 * s, 0.1 * s, 0.6, 12, 8), '#ffd9de'), [0, 0.06 * s, 0]),
    at(paint(rbox(0.3 * s, 0.14 * s, 0.1 * s, 0.4, 10, 6), '#ffd9de'), [0, -0.22 * s, 0]),
    ...[-0.09, -0.03, 0.03, 0.09].map(x => at(paint(rbox(0.04 * s, 0.06 * s, 0.04 * s, 0.5, 6, 4), '#2a0a10'), [x * s, -0.22 * s, 0.05 * s]))
  ],
  [
    at(paint(sph(0.08 * s, 10, 8), glowHex), [-0.12 * s, 0.08 * s, 0.05 * s], [0, 0, 0], [1, 1, 0.5]),
    at(paint(sph(0.08 * s, 10, 8), glowHex), [0.12 * s, 0.08 * s, 0.05 * s], [0, 0, 0], [1, 1, 0.5])
  ]
)

/** A screen on the wall at height `y`: a bevelled frame, a dark glass, Vex's
 *  skull lit on it, a scan line and two struts. */
const vexScreen = (y: number, w: number, h: number, frameHex: string): DecorParts => {
  const sk = skull(Math.min(w, h) * 0.95, VEX_RED)
  const z = WALL_GAP + 0.14
  return P(
    [
      at(paint(rbox(w + 0.24, h + 0.24, 0.16, 0.18, 12, 8), frameHex), [0, y, z]),
      at(paint(rbox(w, h, 0.06, 0.12, 12, 8), '#140a1a'), [0, y, z + 0.07]),
      ...sk.toon.map(g => at(g, [0, y, z + 0.13])),
      ...bracket(y + h / 2 + 0.25, 0.12, -w * 0.35),
      ...bracket(y + h / 2 + 0.25, 0.12, w * 0.35)
    ],
    [
      ...sk.glow.map(g => at(g, [0, y, z + 0.13])),
      at(paint(rbox(w * 0.9, 0.025, 0.02, 0.5, 8, 2), '#ff6a78'), [0, y - h * 0.32, z + 0.115])
    ]
  )
}

// ─── Scrapyard ────────────────────────────────────────────────────────────────

/** Crushed cars, stacked three high, each a squashed bevelled slab in a
 *  faded colour with a window band and two wheel stubs. */
const carStack = (): DecorParts => {
  const cols = ['#7a4a3a', '#3e5a7a', '#6a6a52', '#5a3e6a']
  const out: BufferGeometry[] = []
  for (let n = 0; n < 3; n++) {
    const y = -SINK + 0.17 + n * 0.32
    const yaw = (n % 2 ? 0.12 : -0.08) + n * 0.05
    const c = cols[n]!
    out.push(at(paint(rbox(1.5, 0.34, 0.8, 0.22, 12, 6), c), [0.04 * n, y, -0.02 * n], [0, yaw, 0.02 * (n - 1)]))
    out.push(at(paint(rbox(1.1, 0.1, 0.84, 0.3, 10, 4), '#9fb4c8'), [0.04 * n - 0.05, y + 0.09, -0.02 * n], [0, yaw, 0]))
    for (const s of [-1, 1]) out.push(at(paint(rcyl(0.12, 0.92, 0.03, 10, 2), HAZ_K), [0.04 * n + s * 0.5, y - 0.12, -0.02 * n], [HALF, yaw, 0]))
  }
  return P(out)
}

/** A junk heap: scrap rocks in rust and steel, two tyres, a bent pipe. */
const scrapHeap = (): DecorParts => P([
  at(paint(rock(0.75, 3, 9, 7), '#5d5a52'), [0, 0.34 - SINK, 0], [0, 0.4, 0], [1.1, 0.55, 1]),
  at(paint(rock(0.45, 7, 9, 7), RUST), [0.45, 0.42, 0.15], [0, 1, 0], [1, 0.7, 1]),
  at(paint(torus(0.26, 0.09, 8, 16), HAZ_K), [-0.45, 0.32, 0.35], [1.1, 0.3, 0]),
  at(paint(torus(0.26, 0.09, 8, 16), HAZ_K), [-0.25, 0.55, 0.05], [0.3, 0.9, 0.4]),
  at(paint(cap(0.07, 0.9, 8, 2), STEEL), [0.15, 0.7, -0.15], [0.3, 0, 1.0])
])

// ─── Blaze Refinery ───────────────────────────────────────────────────────────

/** The Blaze Master's forge: a stone-and-iron furnace with an arched glowing
 *  mouth, coals, a hood and a flue up the wall, a bellows at its side. */
const forge = (): DecorParts => {
  const toon: BufferGeometry[] = [
    // Body: a bevelled block on a plinth, iron bands round it.
    at(paint(rbox(1.7, 0.3, 1.5, 0.18, 12, 6), '#4a3f3a'), [0, 0.15 - SINK, 0]),
    at(paint(rbox(1.5, 1.2, 1.3, 0.2, 14, 10), '#6a5048'), [0, 0.85, -0.05]),
    ...[0.45, 1.25].map(y => at(paint(rbox(1.56, 0.08, 1.36, 0.3, 12, 4), IRON), [0, y, -0.05])),
    // The mouth's frame: an arch of iron proud of the face.
    at(paint(torus(0.38, 0.07, 8, 18, Math.PI), IRON), [0, 0.95, 0.62]),
    at(paint(rbox(0.1, 0.42, 0.14, 0.4, 6, 4), IRON), [-0.38, 0.74, 0.62]),
    at(paint(rbox(0.1, 0.42, 0.14, 0.4, 6, 4), IRON), [0.38, 0.74, 0.62]),
    // Hood and flue.
    at(paint(rcone(0.85, 0.32, 0.5, 0.06, 16), STEEL_DK), [0, 1.7, -0.1]),
    at(paint(rcyl(0.3, 2.6, 0.05, 14, 2), STEEL_DK), [0, 3.2, -0.2]),
    ...[2.4, 3.4, 4.3].map(y => at(paint(torus(0.31, 0.04, 6, 16), IRON), [0, y, -0.2], [HALF, 0, 0])),
    // Bellows on the right: leather wedge, handle.
    at(paint(rbox(0.5, 0.18, 0.7, 0.4, 10, 6), '#7a4a2a'), [0.95, 0.55, 0.2], [0, 0, 0.25]),
    at(paint(cap(0.03, 0.5, 6, 2), '#c8a060'), [1.0, 0.75, 0.55], [HALF, 0, 0]),
    // Tongs leaning on the side.
    at(paint(cap(0.025, 1.0, 6, 2), IRON), [-0.82, 0.6, 0.3], [0, 0, 0.18]),
    at(paint(cap(0.025, 1.0, 6, 2), IRON), [-0.86, 0.6, 0.36], [0, 0, 0.22])
  ]
  const glow: BufferGeometry[] = [
    // The fire in the mouth: a hot core inside a warm ring.
    at(paint(rbox(0.66, 0.42, 0.1, 0.5, 10, 6), '#ffb04a'), [0, 0.76, 0.6]),
    at(paint(dome(0.3, HALF, 12, 4), '#fff1a0'), [0, 0.56, 0.58], [0, 0, 0], [1, 0.6, 0.6]),
    ...[-0.2, 0, 0.2].map(x => at(paint(sph(0.07, 6, 4), '#ff6a2a'), [x, 0.6, 0.66]))
  ]
  return P(toon, glow)
}

/** An anvil on a stump, a stack of fresh armour plates beside it. */
const anvil = (): DecorParts => P(
  [
    at(paint(rcyl(0.32, 0.5, 0.05, 14, 2), '#6a4a2e'), [0, 0.25 - SINK, 0]),
    ...[0.12, 0.38].map(y => at(paint(torus(0.33, 0.025, 6, 16), IRON), [0, y, 0], [HALF, 0, 0])),
    at(paint(rbox(0.3, 0.16, 0.24, 0.25, 8, 4), IRON), [0, 0.58, 0]),
    at(paint(rbox(0.6, 0.12, 0.28, 0.2, 10, 4), STEEL_DK), [0.04, 0.7, 0]),
    at(paint(rcone(0.12, 0.02, 0.32, 0.01, 10), STEEL_DK), [0.48, 0.71, 0], [0, 0, -HALF]),
    ...[0, 1, 2].map(n => at(paint(rbox(0.5, 0.05, 0.42, 0.3, 8, 2), n === 2 ? '#d9a23a' : STEEL), [-0.62, 0.04 + n * 0.06 - SINK, 0.05 + n * 0.02], [0, n * 0.12, 0]))
  ]
)

/** A wall vent grille: an iron frame, slats, a forge's glow behind them. */
const ventGrille = (): DecorParts => {
  const y = 1.0
  const z = WALL_GAP + 0.08
  return P(
    [
      at(paint(rbox(1.1, 0.8, 0.14, 0.2, 12, 8), IRON), [0, y, z]),
      ...[-0.24, -0.08, 0.08, 0.24].map(dy => at(paint(rbox(0.9, 0.05, 0.06, 0.4, 8, 2), STEEL_DK), [0, y + dy, z + 0.1], [0.4, 0, 0])),
      ...[-0.45, 0.45].flatMap(x => [-0.3, 0.3].map(dy => at(paint(sph(0.03, 6, 4), BOLT), [x, y + dy, z + 0.08])))
    ],
    [at(paint(rbox(0.94, 0.62, 0.02, 0.3, 8, 4), '#ff7a2a'), [0, y, z + 0.075])]
  )
}

// ─── Cryo Plant ──────────────────────────────────────────────────────────────

/** A coolant tank: a frosted cylinder with bands, a dome, a gauge and pipes. */
const coolantTank = (): DecorParts => P(
  [
    at(paint(rcyl(0.56, 0.2, 0.05, 18, 2), STEEL_DK), [0, 0.1 - SINK, 0]),
    at(paint(rcyl(0.5, 2.0, 0.12, 20, 3), '#cfe6f5'), [0, 1.15, 0]),
    at(paint(dome(0.5, HALF, 18, 6), '#e6f4ff'), [0, 2.1, 0]),
    ...[0.6, 1.2, 1.8].map(y => at(paint(torus(0.51, 0.035, 6, 20), '#5f88aa'), [0, y, 0], [HALF, 0, 0])),
    at(paint(rcyl(0.12, 0.06, 0.02, 12, 2), STEEL), [0.2, 1.45, 0.47], [HALF, 0, 0]),
    at(paint(rcyl(0.08, 0.6, 0.02, 10, 2), '#5f88aa'), [-0.25, 2.35, 0.1], [0, 0, 0.5]),
    at(paint(rcyl(0.06, 0.5, 0.02, 10, 2), '#5f88aa'), [0.38, 0.5, 0.38], [HALF, 0, 0])
  ],
  [
    at(paint(rcyl(0.08, 0.02, 0.01, 12, 1), '#7ff4ff'), [0.2, 1.45, 0.51], [HALF, 0, 0]),
    at(paint(rbox(0.06, 0.3, 0.03, 0.5, 6, 4), '#9feaff'), [-0.2, 1.0, 0.49])
  ]
)

/** A coolant main along the wall: a thick insulated pipe with flanges, a
 *  valve wheel and a frost-blue gauge. */
const coolantPipe = (): DecorParts => {
  const y = 1.9
  const z = WALL_GAP + 0.3
  return P(
    [
      at(paint(cap(0.22, 2.3, 14, 3), '#d8ecf8'), [0, y, z], [0, 0, HALF]),
      ...[-0.9, 0, 0.9].map(x => at(paint(rcyl(0.27, 0.1, 0.03, 14, 2), '#5f88aa'), [x, y, z], [0, 0, HALF])),
      ...[-0.7, 0.7].flatMap(x => bracket(y, 0.22, x)),
      at(paint(rcyl(0.05, 0.3, 0.01, 8, 2), STEEL), [0.45, y + 0.35, z]),
      at(paint(torus(0.16, 0.025, 6, 16), '#c43a2a'), [0.45, y + 0.5, z], [HALF, 0, 0]),
      at(paint(rcyl(0.11, 0.06, 0.02, 12, 2), STEEL), [-0.45, y + 0.3, z + 0.02], [HALF, 0, 0])
    ],
    [at(paint(rcyl(0.08, 0.02, 0.01, 10, 1), '#7ff4ff'), [-0.45, y + 0.3, z + 0.06], [HALF, 0, 0])]
  )
}

// ─── Volt Tower ──────────────────────────────────────────────────────────────

/** A Tesla coil: an insulated base, a copper winding, stacked rings and the
 *  glowing toroid on top. */
const teslaCoil = (): DecorParts => P(
  [
    at(paint(rcyl(0.5, 0.3, 0.08, 16, 2), IRON), [0, 0.15 - SINK, 0]),
    ...[0, 1, 2].map(n => at(paint(rcyl(0.36 - n * 0.06, 0.16, 0.05, 14, 2), '#e8e2d0'), [0, 0.38 + n * 0.16, 0])),
    at(paint(rcyl(0.16, 1.2, 0.03, 14, 2), '#c8803a'), [0, 1.3, 0]),
    ...[0.9, 1.15, 1.4, 1.65].map(y => at(paint(torus(0.17, 0.02, 6, 16), '#e0a060'), [0, y, 0], [HALF, 0, 0]))
  ],
  [
    at(paint(torus(0.36, 0.11, 10, 24), '#fff07a'), [0, 2.0, 0], [HALF, 0, 0]),
    at(paint(sph(0.12, 10, 8), '#ffffff'), [0, 2.0, 0])
  ]
)

/** A high-voltage breaker cabinet with a lightning glyph and cable runs. */
const breaker = (): DecorParts => {
  const y = 1.25
  const z = WALL_GAP + 0.2
  return P(
    [
      at(paint(rbox(0.9, 1.2, 0.36, 0.15, 12, 8), '#5a6070'), [0, y, z]),
      at(paint(rbox(0.8, 1.08, 0.04, 0.2, 10, 6), '#6c7486'), [0, y, z + 0.18]),
      at(paint(rcyl(0.04, 0.12, 0.01, 8, 2), BOLT), [0.32, y, z + 0.22], [HALF, 0, 0]),
      ...[-0.25, 0, 0.25].map(x => at(paint(rcyl(0.05, 1.6, 0.01, 8, 2), HAZ_K), [x, y + 1.4, z - 0.08])),
      // Warning stripes along its foot, side by side.
      ...[0, 1, 2, 3].map(n => at(paint(rbox(0.19, 0.06, 0.03, 0.4, 6, 2), n % 2 ? HAZ_K : HAZ_Y), [(n - 1.5) * 0.2, y - 0.56, z + 0.2]))
    ],
    [
      // The lightning glyph: three skewed bars.
      at(paint(rbox(0.1, 0.32, 0.03, 0.4, 6, 4), '#fff07a'), [0.03, y + 0.18, z + 0.215], [0, 0, -0.5]),
      at(paint(rbox(0.22, 0.08, 0.03, 0.4, 6, 4), '#fff07a'), [0, y + 0.02, z + 0.215]),
      at(paint(rbox(0.1, 0.32, 0.03, 0.4, 6, 4), '#fff07a'), [-0.03, y - 0.14, z + 0.215], [0, 0, -0.5])
    ]
  )
}

// ─── Sky Docks ───────────────────────────────────────────────────────────────

/** A mooring bollard with its rope coiled round it. */
const bollard = (): DecorParts => P([
  at(paint(rcyl(0.36, 0.14, 0.04, 16, 2), IRON), [0, 0.07 - SINK, 0]),
  at(paint(lathe([[0, 0], [0.24, 0], [0.22, 0.4], [0.18, 0.55], [0.3, 0.68], [0.3, 0.76], [0, 0.78]], 16), '#3f6b5f'), [0, 0.1 - SINK, 0]),
  ...[0.2, 0.28, 0.36].map((y, n) => at(paint(torus(0.25 + n * 0.005, 0.045, 6, 18), '#c8a060'), [0, y, 0], [HALF, 0, n * 0.4])),
  at(paint(torus(0.4, 0.045, 6, 20), '#c8a060'), [0.45, 0.04, 0.25], [HALF, 0, 0])
])

/** Freight for the airships: three strapped crates, stacked off-true. */
const cargoStack = (): DecorParts => {
  const out: BufferGeometry[] = []
  const box = (x: number, y: number, z: number, s: number, yaw: number, c: string): void => {
    out.push(at(paint(rbox(s, s, s, 0.18, 10, 8), c), [x, y, z], [0, yaw, 0]))
    for (const d of [-0.25, 0.25]) out.push(at(paint(rbox(s + 0.04, s + 0.04, 0.08, 0.3, 8, 4), '#d24a3a'), [x + Math.sin(yaw) * d * s, y, z + Math.cos(yaw) * d * s], [0, yaw, 0]))
  }
  box(-0.3, 0.42 - SINK, 0, 0.85, 0.1, '#9a7a4a')
  box(0.45, 0.32 - SINK, 0.15, 0.65, -0.2, '#7a8a5a')
  box(-0.2, 1.2 - SINK, 0.05, 0.6, 0.35, '#8a6a3a')
  return P(out)
}

/** A wall fan: a round housing, three blades, a grille ring. */
const wallFan = (): DecorParts => {
  const y = 2.6
  const z = WALL_GAP + 0.15
  return P(
    [
      at(paint(rcyl(0.6, 0.26, 0.06, 20, 2), STEEL_DK), [0, y, z], [HALF, 0, 0]),
      at(paint(rcyl(0.15, 0.2, 0.04, 12, 2), STEEL), [0, y, z + 0.18], [HALF, 0, 0]),
      ...[0, 1, 2].map(n => at(paint(rbox(0.2, 0.46, 0.03, 0.4, 6, 4), '#d8e6e0'), [Math.sin(n * 2.094) * 0.26, y + Math.cos(n * 2.094) * 0.26, z + 0.16], [0.25, 0, -n * 2.094])),
      at(paint(torus(0.56, 0.025, 6, 24), IRON), [0, y, z + 0.25]),
      at(paint(torus(0.36, 0.02, 6, 20), IRON), [0, y, z + 0.25])
    ],
    [at(paint(sph(0.05, 6, 4), '#7dffc4'), [0.55, y + 0.5, z + 0.05])]
  )
}

// ─── Polarity Works ──────────────────────────────────────────────────────────

/** A casting crucible on its stand, molten metal in its mouth. */
const crucible = (): DecorParts => P(
  [
    ...[-0.4, 0.4].map(x => at(paint(rbox(0.12, 1.1, 0.12, 0.3, 6, 6), IRON), [x, 0.55 - SINK, 0])),
    at(paint(rbox(0.95, 0.1, 0.12, 0.3, 8, 4), IRON), [0, 1.05, 0]),
    at(paint(lathe([[0, 0], [0.22, 0], [0.34, 0.18], [0.38, 0.5], [0.4, 0.56], [0, 0.5]], 18), '#5a4a48'), [0, 0.55, 0]),
    at(paint(rcone(0.08, 0.02, 0.18, 0.01, 8), '#5a4a48'), [0.38, 1.05, 0], [0, 0, -1.1])
  ],
  [at(paint(rcyl(0.34, 0.04, 0.01, 18, 1), '#ffb04a'), [0, 1.04, 0])]
)

/** A horseshoe electromagnet on a wall bracket: red and blue poles. */
const horseshoe = (): DecorParts => {
  const y = 2.4
  const z = WALL_GAP + 0.35
  return P(
    [
      ...bracket(y + 0.45, 0.3),
      at(paint(torus(0.32, 0.11, 10, 20, Math.PI), '#9aa4b4'), [0, y, z], [0, 0, Math.PI]),
      at(paint(rcyl(0.12, 0.32, 0.03, 12, 2), '#d23a3a'), [-0.32, y - 0.16, z]),
      at(paint(rcyl(0.12, 0.32, 0.03, 12, 2), '#3f7bff'), [0.32, y - 0.16, z])
    ],
    [
      at(paint(rcyl(0.1, 0.03, 0.01, 12, 1), '#ff8a8a'), [-0.32, y - 0.33, z]),
      at(paint(rcyl(0.1, 0.03, 0.01, 12, 1), '#9ab8ff'), [0.32, y - 0.33, z])
    ]
  )
}

// ─── Deep Mine ───────────────────────────────────────────────────────────────

/** Timber shoring against the wall: two posts and a cap beam with braces. */
const shoring = (): DecorParts => {
  const z = WALL_GAP + 0.14
  const wood = '#7a5432'
  return P([
    ...[-1.1, 1.1].map(x => at(paint(rbox(0.22, 3.0, 0.22, 0.2, 6, 10), wood), [x, 1.5 - SINK, z])),
    at(paint(rbox(2.6, 0.24, 0.24, 0.2, 12, 4), wood), [0, 3.05, z + 0.02]),
    ...[-1, 1].map(s => at(paint(rbox(0.12, 0.7, 0.14, 0.3, 4, 6), '#6a4628'), [s * 0.85, 2.75, z + 0.04], [0, 0, s * 0.8])),
    ...[-1.1, 1.1].map(x => at(paint(rbox(0.26, 0.06, 0.26, 0.3, 6, 2), IRON), [x, 2.4, z]))
  ])
}

/** A cage lamp: bracket, wire cage, a warm bulb. */
const cageLamp = (): DecorParts => {
  const y = 2.7
  const z = WALL_GAP + 0.3
  return P(
    [
      ...bracket(y + 0.3, 0.24),
      at(paint(rcyl(0.11, 0.08, 0.02, 10, 2), IRON), [0, y + 0.12, z]),
      ...[0, 1, 2, 3].map(n => at(paint(cap(0.012, 0.22, 4, 2), IRON), [Math.sin(n * HALF) * 0.1, y - 0.04, z + Math.cos(n * HALF) * 0.1])),
      at(paint(torus(0.1, 0.012, 4, 12), IRON), [0, y - 0.04, z], [HALF, 0, 0])
    ],
    [at(paint(sph(0.08, 10, 8), '#ffd27a'), [0, y - 0.02, z])]
  )
}

/** A mine cart with ore on a short stub of track. */
const oreCart = (): DecorParts => P([
  ...[-0.35, 0.35].map(x => at(paint(rbox(0.07, 0.06, 1.8, 0.3, 4, 2), STEEL), [x, 0.02 - SINK + 0.03, 0])),
  ...[-0.6, -0.2, 0.2, 0.6].map(z => at(paint(rbox(1.0, 0.08, 0.16, 0.3, 6, 2), '#6a4628'), [0, 0.0, z])),
  at(paint(lathe([[0.3, 0], [0.42, 0.45], [0, 0.45]], 4), '#8a6a3a'), [0, 0.28, 0], [0, Math.PI / 4, 0], [1.25, 1, 1.6]),
  ...[-0.42, 0.42].flatMap(z => [-0.35, 0.35].map(x => at(paint(rcyl(0.13, 0.08, 0.03, 12, 2), IRON), [x, 0.18, z], [0, 0, HALF]))),
  ...[0, 1, 2, 3, 4].map(n => at(paint(rock(0.16, n + 4, 6, 5), n % 2 ? '#c8862a' : '#7a6a52'), [(n - 2) * 0.14, 0.78, (n % 3 - 1) * 0.18]))
])

/** A stack of blasting crates, red, with warning bands. */
const tntCrates = (): DecorParts => P([
  at(paint(rbox(0.7, 0.5, 0.5, 0.18, 10, 6), '#a83a2a'), [0, 0.25 - SINK, 0]),
  at(paint(rbox(0.6, 0.45, 0.45, 0.18, 10, 6), '#b8442e'), [0.06, 0.72, -0.02], [0, 0.2, 0]),
  ...[0.12, 0.38].map(y => at(paint(rbox(0.74, 0.06, 0.54, 0.3, 8, 2), HAZ_Y), [0, y - SINK, 0]))
])

// ─── Tidewater Locks ─────────────────────────────────────────────────────────

/** A lock buoy: red and white bands, a lamp on top, a chain to the floor. */
const buoy = (): DecorParts => P(
  [
    at(paintBy(lathe([[0, 0], [0.36, 0.05], [0.42, 0.4], [0.3, 0.9], [0.12, 1.1], [0, 1.12]], 18), (_x, y) => (Math.floor(y / 0.28) % 2 ? '#f2f2f2' : '#d23a3a')), [0, -SINK, 0]),
    at(paint(rcyl(0.05, 0.3, 0.01, 8, 2), IRON), [0, 1.25, 0]),
    ...[0, 1, 2].map(n => at(paint(torus(0.05, 0.015, 4, 8), IRON), [0.3 + n * 0.08, 0.1 - n * 0.03, 0.2], [0, n * HALF, 0]))
  ],
  [at(paint(sph(0.09, 10, 8), '#ffde7a'), [0, 1.45, 0])]
)

/** A lock valve on the wall: a flanged pipe stub and a big spoked wheel. */
const valveWheel = (): DecorParts => {
  const y = 1.5
  const z = WALL_GAP + 0.2
  return P([
    at(paint(rcyl(0.18, 0.38, 0.03, 14, 2), '#3f6b8a'), [0, y, z], [HALF, 0, 0]),
    at(paint(rcyl(0.26, 0.06, 0.02, 14, 2), STEEL), [0, y, z - 0.12], [HALF, 0, 0]),
    at(paint(torus(0.34, 0.04, 8, 24), '#c43a2a'), [0, y, z + 0.26]),
    // The spokes cross at the hub: each a little proud of the last, so no
    // two of their flat facets meet in one plane there.
    ...[0, 1, 2, 3].map(n => at(paint(cap(0.022, 0.6, 6, 2), '#c43a2a'), [0, y, z + 0.24 + n * 0.012], [0, 0, n * Math.PI / 4]))
  ])
}

/** A tide gauge: a striped board on the wall, a float marker. */
const tideGauge = (): DecorParts => {
  const z = WALL_GAP + 0.06
  return P(
    [
      at(paintBy(rbox(0.3, 2.4, 0.08, 0.15, 6, 16), (_x, y) => (Math.floor((y + 1.2) / 0.3) % 2 ? '#f2f2f2' : '#1f8fd6')), [0, 1.4, z]),
      ...[0.3, 2.5].map(y => at(paint(rbox(0.36, 0.08, 0.12, 0.3, 6, 2), STEEL_DK), [0, y, z + 0.02]))
    ],
    [at(paint(rbox(0.42, 0.08, 0.06, 0.4, 6, 2), '#ffb04a'), [0, 1.05, z + 0.08])]
  )
}

// ─── Blackout Boulevard ──────────────────────────────────────────────────────

/** A rooftop air-conditioning unit: a louvred box and a fan on top. */
const acUnit = (): DecorParts => P([
  at(paint(rbox(1.2, 0.8, 0.9, 0.15, 12, 8), '#8a90a0'), [0, 0.4 - SINK, 0]),
  ...[0.15, 0.3, 0.45, 0.6].map(y => at(paint(rbox(1.1, 0.04, 0.05, 0.4, 8, 2), STEEL_DK), [0, y, 0.46])),
  at(paint(rcyl(0.3, 0.1, 0.03, 16, 2), STEEL_DK), [0.2, 0.83, 0]),
  ...[0, 1, 2].map(n => at(paint(rbox(0.08, 0.02, 0.26, 0.4, 4, 2), BOLT), [0.2, 0.9, 0], [0, n * 2.094, 0])),
  at(paint(cap(0.06, 0.6, 8, 2), STEEL), [-0.66, 0.5, 0.2], [0, 0, 0.2])
])

/** A satellite dish on a tripod, pointed up and away. */
const dish = (): DecorParts => P([
  ...[0, 1, 2].map(n => at(paint(cap(0.03, 1.0, 6, 2), STEEL_DK), [Math.sin(n * 2.094) * 0.22, 0.45 - SINK, Math.cos(n * 2.094) * 0.22], [Math.cos(n * 2.094) * 0.22, 0, -Math.sin(n * 2.094) * 0.22])),
  at(paint(rcyl(0.08, 0.2, 0.02, 10, 2), IRON), [0, 1.0, 0]),
  at(paint(lathe([[0, 0], [0.3, 0.04], [0.55, 0.18], [0.6, 0.24], [0.56, 0.24], [0.28, 0.1], [0, 0.06]], 20), '#e8ecf2'), [0, 1.05, 0], [0.7, 0, 0]),
  at(paint(cap(0.02, 0.5, 4, 2), IRON), [0, 1.3, 0.2], [0.7, 0, 0])
])

/** A neon sign on the wall: a backing plate and a lit heart-and-bolt tube. */
const neonSign = (): DecorParts => {
  const y = 3.2
  const z = WALL_GAP + 0.1
  return P(
    [
      at(paint(rbox(1.3, 0.9, 0.08, 0.15, 12, 8), '#1a1028'), [0, y, z]),
      ...bracket(y + 0.6, 0.06, -0.4), ...bracket(y + 0.6, 0.06, 0.4)
    ],
    [
      at(paint(torus(0.18, 0.035, 6, 16, Math.PI * 1.1), '#ff3fd2'), [-0.17, y + 0.08, z + 0.07], [0, 0, -0.15]),
      // The heart's halves meet in its middle: each tube a little proud of
      // the other there (no shared plane).
      at(paint(torus(0.18, 0.035, 6, 16, Math.PI * 1.1), '#ff3fd2'), [0.17, y + 0.08, z + 0.082], [0, Math.PI, -0.15]),
      at(paint(cap(0.035, 0.42, 6, 2), '#ff3fd2'), [-0.15, y - 0.13, z + 0.094], [0, 0, 0.75]),
      at(paint(cap(0.035, 0.42, 6, 2), '#ff3fd2'), [0.15, y - 0.13, z + 0.106], [0, 0, -0.75]),
      at(paint(cap(0.03, 0.5, 6, 2), '#7ff4ff'), [0.48, y, z + 0.07], [0, 0, 0.4])
    ]
  )
}

// ─── Rotor Run ───────────────────────────────────────────────────────────────

/** A drone cradle on the wall: a shelf, a docked cargo drone, a charge light. */
const droneCradle = (): DecorParts => {
  const y = 2.3
  const z = WALL_GAP + 0.5
  return P(
    [
      at(paint(rbox(1.0, 0.1, 0.7, 0.2, 10, 4), STEEL_DK), [0, y, z]),
      ...[-0.4, 0.4].flatMap(x => bracket(y - 0.25, 0.5, x)),
      at(paint(rbox(0.4, 0.18, 0.4, 0.4, 10, 6), '#b8ff5a'), [0, y + 0.16, z]),
      ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].flatMap(([a, b]) => [
        at(paint(cap(0.02, 0.24, 4, 2), IRON), [a! * 0.2, y + 0.2, z + b! * 0.2], [HALF, Math.atan2(a!, b!), 0]),
        at(paint(rcyl(0.14, 0.02, 0.005, 12, 1), '#d8e6e0'), [a! * 0.3, y + 0.26, z + b! * 0.3])
      ]),
      at(paint(rbox(0.36, 0.26, 0.36, 0.2, 8, 6), '#9a7a4a'), [0, y - 0.0 + 0.1 - 0.25, z], [0, 0.3, 0])
    ],
    [at(paint(sph(0.05, 6, 4), '#b8ff5a'), [0.44, y + 0.08, z + 0.3])]
  )
}

/** Parcel crates for the drones, strapped, on a pallet. */
const parcels = (): DecorParts => P([
  at(paint(rbox(1.1, 0.14, 0.9, 0.2, 10, 4), '#7a5a3a'), [0, 0.07 - SINK, 0]),
  at(paint(rbox(0.5, 0.42, 0.42, 0.2, 8, 6), '#c8a56a'), [-0.26, 0.35, -0.18], [0, 0.1, 0]),
  at(paint(rbox(0.45, 0.36, 0.4, 0.2, 8, 6), '#b8956a'), [0.28, 0.32, 0.12], [0, -0.2, 0]),
  at(paint(rbox(0.4, 0.3, 0.36, 0.2, 8, 6), '#d8b57a'), [-0.2, 0.74, -0.12], [0, 0.4, 0]),
  ...[-0.26, 0.28].map((x, n) => at(paint(rbox(0.06, 0.46, 0.46, 0.3, 4, 4), '#b8ff5a'), [x, 0.35 - n * 0.03, n ? 0.12 : -0.18], [0, n ? -0.2 : 0.1, 0]))
])

// ─── Vex Fortress ────────────────────────────────────────────────────────────

/** An empty assembly bay: a frame with clamps and no part in it (the
 *  sectors' supply lines are cut, #13's "Half-built. You did that."). */
const assemblyBay = (): DecorParts => P(
  [
    at(paint(rbox(1.5, 0.18, 1.2, 0.2, 12, 4), '#2a2030'), [0, 0.09 - SINK, 0]),
    ...[-0.65, 0.65].map(x => at(paint(rbox(0.14, 2.2, 0.14, 0.25, 6, 10), '#3a2a40'), [x, 1.1, -0.3])),
    at(paint(rbox(1.44, 0.16, 0.18, 0.25, 10, 4), '#3a2a40'), [0, 2.2, -0.3]),
    ...[-0.55, 0.55].map(x => at(paint(rbox(0.3, 0.12, 0.3, 0.3, 6, 4), STEEL_DK), [x, 1.2, -0.12])),
    at(paint(cap(0.03, 0.6, 6, 2), '#202430'), [0, 1.85, -0.3])
  ],
  [...[-0.66, 0.66].map(x => at(paint(rbox(0.04, 1.8, 0.04, 0.5, 4, 8), VEX_RED), [x, 1.1, -0.21]))]
)

/** The clinic: an IV stand with a bag of something red, a stethoscope hook. */
const ivStand = (): DecorParts => P(
  [
    ...[0, 1, 2, 3, 4].map(n => at(paint(cap(0.02, 0.3, 4, 2), STEEL), [Math.sin(n * 1.2566) * 0.16, 0.02, Math.cos(n * 1.2566) * 0.16], [HALF, n * 1.2566, 0])),
    at(paint(rcyl(0.025, 1.8, 0.01, 8, 2), STEEL), [0, 0.92 - SINK, 0]),
    at(paint(torus(0.1, 0.012, 4, 10), STEEL), [0, 1.82, 0], [HALF, 0, 0]),
    at(paint(rbox(0.18, 0.28, 0.06, 0.6, 8, 6), '#f0e8f0'), [0.08, 1.6, 0])
  ],
  [at(paint(rbox(0.13, 0.17, 0.04, 0.6, 6, 4), '#ff2d3f'), [0.08, 1.58, 0.02])]
)

/** Vex's skull emblem on the wall, red-veined. */
const skullEmblem = (): DecorParts => {
  const y = 3.0
  const z = WALL_GAP + 0.1
  const sk = skull(1.0, VEX_RED)
  return P(
    [at(paint(rbox(1.0, 1.0, 0.1, 0.35, 12, 10), '#2a1a24'), [0, y, z]), ...sk.toon.map(g => at(g, [0, y, z + 0.1]))],
    [
      ...sk.glow.map(g => at(g, [0, y, z + 0.1])),
      ...[-1, 1].map(s => at(paint(rbox(0.04, 1.6, 0.03, 0.5, 4, 8), VEX_RED), [s * 0.7, y - 0.3, WALL_GAP + 0.05], [0, 0, s * 0.15]))
    ]
  )
}

// ─── The catalogue ───────────────────────────────────────────────────────────

export type DecorKind =
  | 'carStack' | 'scrapHeap' | 'vexBillboard'
  | 'forge' | 'anvil' | 'ventGrille'
  | 'coolantTank' | 'coolantPipe'
  | 'teslaCoil' | 'breaker' | 'vexScreenVolt'
  | 'bollard' | 'cargoStack' | 'wallFan'
  | 'crucible' | 'horseshoe'
  | 'shoring' | 'cageLamp' | 'oreCart' | 'tntCrates'
  | 'buoy' | 'valveWheel' | 'tideGauge'
  | 'acUnit' | 'dish' | 'neonSign' | 'vexScreenNeon'
  | 'droneCradle' | 'parcels'
  | 'assemblyBay' | 'ivStand' | 'skullEmblem' | 'vexScreenFortress'

export const DECOR: Readonly<Record<DecorKind, DecorDef>> = {
  carStack: { mount: 'floor', r: 0.8, build: carStack },
  scrapHeap: { mount: 'floor', r: 0.7, build: scrapHeap },
  vexBillboard: { mount: 'wall', r: 0, build: () => vexScreen(3.1, 1.5, 0.95, HAZ_Y) },
  forge: { mount: 'floor', r: 0.95, build: forge },
  anvil: { mount: 'floor', r: 0.65, build: anvil },
  ventGrille: { mount: 'wall', r: 0, build: ventGrille },
  coolantTank: { mount: 'floor', r: 0.6, build: coolantTank },
  coolantPipe: { mount: 'wall', r: 0, build: coolantPipe },
  teslaCoil: { mount: 'floor', r: 0.55, build: teslaCoil },
  breaker: { mount: 'wall', r: 0, build: breaker },
  vexScreenVolt: { mount: 'wall', r: 0, build: () => vexScreen(3.0, 1.2, 0.8, '#5a6070') },
  bollard: { mount: 'floor', r: 0.45, build: bollard },
  cargoStack: { mount: 'floor', r: 0.75, build: cargoStack },
  wallFan: { mount: 'wall', r: 0, build: wallFan },
  crucible: { mount: 'floor', r: 0.6, build: crucible },
  horseshoe: { mount: 'wall', r: 0, build: horseshoe },
  shoring: { mount: 'wall', r: 0, build: shoring },
  cageLamp: { mount: 'wall', r: 0, build: cageLamp },
  oreCart: { mount: 'floor', r: 0.75, build: oreCart },
  tntCrates: { mount: 'floor', r: 0.5, build: tntCrates },
  buoy: { mount: 'floor', r: 0.45, build: buoy },
  valveWheel: { mount: 'wall', r: 0, build: valveWheel },
  tideGauge: { mount: 'wall', r: 0, build: tideGauge },
  acUnit: { mount: 'floor', r: 0.7, build: acUnit },
  dish: { mount: 'floor', r: 0.55, build: dish },
  neonSign: { mount: 'wall', r: 0, build: neonSign },
  vexScreenNeon: { mount: 'wall', r: 0, build: () => vexScreen(3.2, 1.6, 1.0, '#2a1a3a') },
  droneCradle: { mount: 'wall', r: 0, build: droneCradle },
  parcels: { mount: 'floor', r: 0.65, build: parcels },
  assemblyBay: { mount: 'floor', r: 0.85, build: assemblyBay },
  ivStand: { mount: 'floor', r: 0.3, build: ivStand },
  skullEmblem: { mount: 'wall', r: 0, build: skullEmblem },
  vexScreenFortress: { mount: 'wall', r: 0, build: () => vexScreen(3.0, 1.4, 0.9, '#3a2a40') }
}

/** Each level's set: what its story says stands there. The first of each
 *  mount is its signature piece (the one the plan places first). */
export const SECTOR_DECOR: Readonly<Record<SectorId, { floor: DecorKind[]; wall: DecorKind[] }>> = {
  scrapyard: { floor: ['carStack', 'scrapHeap'], wall: ['vexBillboard'] },
  blaze: { floor: ['forge', 'anvil'], wall: ['ventGrille'] },
  cryo: { floor: ['coolantTank'], wall: ['coolantPipe'] },
  volt: { floor: ['teslaCoil'], wall: ['breaker', 'vexScreenVolt'] },
  gale: { floor: ['bollard', 'cargoStack'], wall: ['wallFan'] },
  magnet: { floor: ['crucible'], wall: ['horseshoe'] },
  drill: { floor: ['oreCart', 'tntCrates'], wall: ['shoring', 'cageLamp'] },
  tide: { floor: ['buoy'], wall: ['valveWheel', 'tideGauge'] },
  neon: { floor: ['acUnit', 'dish'], wall: ['neonSign', 'vexScreenNeon'] },
  rotor: { floor: ['parcels'], wall: ['droneCradle'] },
  fortress: { floor: ['assemblyBay', 'ivStand'], wall: ['vexScreenFortress', 'skullEmblem'] }
}

const cache = new Map<DecorKind, DecorParts>()
/** A prop's parts (built once, cloned for each use: callers transform them). */
export const decorParts = (kind: DecorKind): DecorParts => {
  let p = cache.get(kind)
  if (!p) {
    p = DECOR[kind].build()
    cache.set(kind, p)
  }
  return { toon: p.toon.map(g => g.clone()), glow: p.glow.map(g => g.clone()) }
}
