import { BufferGeometry, Float32BufferAttribute, Mesh, MeshToonMaterial, SphereGeometry, Vector3 } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcyl, rcone, rbox, dome, paintBy, xform, stripUv, pose, nudge, scaleBone, type Rig, type V3 } from './kit'
import { toonRamp } from './toon'
import { frac, type EnemyMotion } from './motion'
import type { BossAct } from './bosses'

/**
 * ─── Dr. Vex Mk-I ────────────────────────────────────────────────────────────
 *
 * The villain's own body (story.md, comic.md [MK-I]): a hovering capsule war
 * machine in black-and-crimson armour with glowing red seams, a skull
 * faceplate grinning out of its front, a thick red band round its middle, big
 * white-clawed arms, thrusters underneath — and on top a glass dome with Vex
 * himself inside, the red hologram skull with the monocle, gloating at you.
 *
 * His attacks are on him: a flame nozzle in the left claw (flameBurst,
 * fireWave), an ice emitter in the right (iceVolley), the orb cannon under the
 * chin (orbStorm), twin mortar tubes on the back (lobBarrage) and two tesla
 * antennae (voltRing). Each muzzle holds a charge that swells through the
 * telegraph and shrinks after the release, while the claws spread and the
 * barrels kick back.
 *
 * The hull is ONE ellipsoid (`HULL`) cut into zones, the armour plates are
 * pieces of the same ellipsoid grown outward by `PLATE` — never a second
 * surface millimetres over the first. The gaps between plates show the glowing
 * zone under them: the red seams. The glass is the one part outside the
 * merged rig: a see-through shell on the dome bone (one extra draw call, shared
 * by every Mk-I, never disposed).
 */

const C = {
  armor: '#2b2e3a',
  gun: '#3d4252',
  gunLt: '#5a6176',
  crimson: '#b3223b',
  crimsonDk: '#7a1628',
  bone: '#f2f5fb',
  boneSh: '#cfd6e4',
  dark: '#15161c',
  socket: '#22101a',
  red: '#ff2d3f',
  steel: '#a9b2c6',
  yellow: '#f2c230',
  black: '#24262e',
  copper: '#d9893a',
  flame: '#ffb23a',
  ice: '#bff6ff',
  volt: '#fff07a',
  orb: '#ff5a8a',
  holo: '#ff2f45',
  holoDk: '#5a0c18',
  gold: '#ffd36a'
}

/** The hull ellipsoid's radii (x, y, z). */
const HULL: V3 = [1.0, 0.68, 0.88]
/** How far the armour plates stand off the hull. */
const PLATE = 0.05

/** A piece of the hull ellipsoid, `grow` out from it: polar band th0..th1
 *  (0 = top), azimuth ph0 + phLen (three's convention: π/2 = the front, +z).
 *  Normals are the ellipsoid's own, so the pieces shade as one body. */
const shell = (th0: number, th1: number, ph0: number, phLen: number, grow: number, ws: number, hs: number): BufferGeometry => {
  const g = stripUv(new SphereGeometry(1, ws, hs, ph0, phLen, th0, th1 - th0))
  const a = HULL[0] + grow
  const b = HULL[1] + grow
  const c = HULL[2] + grow
  const pos = g.attributes.position!
  const nrm = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    pos.setXYZ(i, x * a, y * b, z * c)
    const nx = x / a
    const ny = y / b
    const nz = z / c
    const l = Math.hypot(nx, ny, nz) || 1
    nrm[i * 3] = nx / l
    nrm[i * 3 + 1] = ny / l
    nrm[i * 3 + 2] = nz / l
  }
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  return g
}

/** A point on the hull grown by `grow` (same angles as `shell`). */
const on = (th: number, ph: number, grow: number): V3 => [
  -(HULL[0] + grow) * Math.cos(ph) * Math.sin(th),
  (HULL[1] + grow) * Math.cos(th),
  (HULL[2] + grow) * Math.sin(ph) * Math.sin(th)
]

/** The carapace: four plates round the back and sides, `GAP_F` of azimuth
 *  left open either side of the face, `GAP` between plates. */
const GAP_F = 0.5
const GAP = 0.07
const LEN_U = (2 * Math.PI - 2 * GAP_F - 3 * GAP) / 4
/** Plate 0 (his left flank, toward the front) tears loose in phase 2: it
 *  hangs off its top edge, on its own bone at that hinge. */
const TORN_PH = Math.PI / 2 + GAP_F + LEN_U / 2
const HINGE = on(0.21 * Math.PI, TORN_PH, PLATE)
/** The hinge axis: horizontal, along the plate's top edge. */
const HINGE_AXIS = new Vector3(Math.sin(TORN_PH), 0, Math.cos(TORN_PH)).normalize()
/** A body-space point in the torn plate's bone space. */
const atHinge = (p: V3): V3 => [p[0] - HINGE[0], p[1] - HINGE[1], p[2] - HINGE[2]]
/** Where its wound is: the opening the plate leaves, on the hull. */
const WOUND = on(0.33 * Math.PI, TORN_PH, 0.04)

/** A surface turned inside out (winding and normals flipped): the back of a
 *  one-sided plate, so a plate swung open is not see-through from inside. */
const inside = (g: BufferGeometry): BufferGeometry => {
  const idx = g.index!
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, t)
  }
  const n = g.attributes.normal!
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  return g
}

/** Yellow-and-black hazard stripes round a torus (painted in its own XY plane). */
const hazard = (R: number, r: number, n: number): BufferGeometry =>
  paintBy(torus(R, r, 6, n * 6), (x, y) => (Math.floor((Math.atan2(y, x) / (Math.PI * 2) + 1) * n * 2) % 2 ? C.black : C.yellow))

/** A thruster flame along -y from the bone (wide at the nozzle): white-hot
 *  root, orange body, red tip. */
const flame = (r: number, len: number): BufferGeometry => {
  const g = rcone(0.005, r, len, 0.004, 12)
  paintBy(g, (_x, y) => (y > len * 0.25 ? '#fff4c0' : y > -len * 0.15 ? C.flame : '#ff5a2a'))
  return xform(g, [0, -len / 2, 0])
}

let glassGeo: BufferGeometry | null = null
let glassMat: MeshToonMaterial | null = null
/** The cockpit glass: a pale-blue see-through bubble (shared, never disposed). */
const cockpitGlass = (): Mesh => {
  if (!glassGeo) {
    glassGeo = stripUv(new SphereGeometry(0.45, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2))
    glassGeo.scale(1, 1.1, 1)
    glassGeo.translate(0, 0.08, 0)
    glassGeo.computeVertexNormals()
  }
  glassMat ??= new MeshToonMaterial({ color: '#9fe6ff', gradientMap: toonRamp(), transparent: true, opacity: 0.22, depthWrite: false })
  const m = new Mesh(glassGeo, glassMat)
  m.name = 'vexGlass'
  m.renderOrder = 2
  return m
}

/** Where the phase-2 crack runs: the faceplate's forehead. */
const CRACK_AT: V3 = [0.12, 0.46, 0.84]
/** Smoke puffs over the phase-2 wound. */
const PUFFS = 3

/** The finger bones of a claw (three, 120° apart round the wrist, one in front). */
const FINGERS = 3

/** Dr. Vex's machine: the Mk-I hover pod (see the block comment above). */
export const buildVex = (): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('dome', 'body', [0, 0.62, 0])
    .bone('pilot', 'dome', [0, 0.3, 0.03])
    .bone('handL', 'dome', [-0.27, 0.2, 0.06])
    .bone('handR', 'dome', [0.27, 0.2, 0.06])
    .bone('beacon', 'dome', [0, 0.6, 0])
    .bone('clawL', 'body', [-0.86, -0.05, 0.12])
    .bone('clawR', 'body', [0.86, -0.05, 0.12])
    .bone('muzzleL', 'clawL', [0, -0.76, 0.04])
    .bone('muzzleR', 'clawR', [0, -0.78, 0.04])
  b.mirror((_sd, t) => {
    for (let i = 0; i < FINGERS; i++) b.bone(`pin${t}${i}`, `claw${t}`, [0, -0.5, 0.04], [0, (i / FINGERS) * Math.PI * 2, 0])
  })
  b.bone('cannon', 'body', [0, -0.5, 0.52])
    .bone('orb', 'cannon', [0, 0, 0.36])
    .bone('mortar', 'body', [0, 0.44, -0.6], [-0.55, 0, 0])
    .bone('antL', 'body', [-0.42, 0.55, -0.35], [-0.2, 0, 0.3])
    .bone('antR', 'body', [0.42, 0.55, -0.35], [-0.2, 0, -0.3])
    .bone('core', 'body', [0, -0.7, 0])
    .bone('lobL', 'mortar', [-0.13, 0.4, 0])
    .bone('lobR', 'mortar', [0.13, 0.4, 0])
    .bone('tipL', 'antL', [0, 0.5, 0])
    .bone('tipR', 'antR', [0, 0.5, 0])
    // Phase 2: the torn plate, the wound's sparks and smoke, a cracked face,
    // two alarm sirens, Vex fuming
    .bone('plate', 'body', HINGE)
    .bone('spark', 'body', WOUND)
    .bone('crack', 'body', CRACK_AT)
    .bone('sirenL', 'body', [-0.55, 0.53, 0.25])
    .bone('sirenR', 'body', [0.55, 0.53, 0.25])
    .bone('lampL', 'sirenL', [0, 0.045, 0])
    .bone('lampR', 'sirenR', [0, 0.045, 0])
    .bone('fume', 'pilot', [0.13, 0.12, 0.06])
  for (let i = 0; i < PUFFS; i++) b.bone(`puff${i}`, 'body', WOUND)
  const UNDER: Array<[number, number]> = [[-0.3, 0.25], [0.3, 0.25], [-0.3, -0.25], [0.3, -0.25]]
  UNDER.forEach(([x, z], i) => b.bone(`jet${i}`, 'body', [x, -0.76, z]))
  b.mirror((sd, t) => b.bone(`jetB${t}`, 'body', [sd * 0.36, -0.12, -0.91], [Math.PI / 2, 0, 0]))

  // ── Hull: dark cap under the dome, the glowing seam zone, the belt, the belly
  const P = Math.PI
  b.part('body', shell(0, 0.2 * P, 0, 2 * P, 0, 32, 4), C.armor)
  b.part('body', shell(0.2 * P, 0.46 * P, 0, 2 * P, 0, 40, 6), C.red, { glow: true, outline: false })
  b.part('body', shell(0.46 * P, 0.54 * P, 0, 2 * P, 0, 40, 2), C.armor)
  b.part('body', shell(0.54 * P, P, 0, 2 * P, 0, 32, 10), C.gun)
  // Crimson carapace over the seam zone (GAP_F, LEN_U); a red seam glows in
  // every gap. Plate 0 hangs on its own hinge bone (phase 2 tears it loose)
  // and carries its back face, its bolts and its vents with it.
  for (let i = 0; i < 4; i++) {
    const ph0 = P / 2 + GAP_F + i * (LEN_U + GAP)
    const bone = i === 0 ? 'plate' : 'body'
    const o = i === 0 ? atHinge([0, 0, 0]) : [0, 0, 0] as V3
    b.painted(bone, paintBy(shell(0.21 * P, 0.44 * P, ph0, LEN_U, PLATE, 10, 6), (_x, y) => (y > 0.45 ? C.crimson : C.crimsonDk)), { p: o })
    if (i === 0) b.part(bone, inside(shell(0.21 * P, 0.44 * P, ph0, LEN_U, PLATE - 0.02, 10, 6)), C.dark, { p: o, outline: false })
    // Two bolts at each plate's lower corners
    for (const ph of [ph0 + 0.12, ph0 + LEN_U - 0.12]) {
      const q = on(0.41 * P, ph, PLATE + 0.012)
      b.part(bone, sph(0.026, 8, 6), C.steel, { p: i === 0 ? atHinge(q) : q })
    }
  }
  // A vent grille on each flank plate (the first one rides the torn plate)
  for (const ph of [P, 2 * P]) {
    for (let i = 0; i < 3; i++) {
      const q = on((0.29 + i * 0.045) * P, ph, PLATE + 0.004)
      const onTorn = ph === P
      b.part(onTorn ? 'plate' : 'body', cap(0.024, 0.22, 8, 2), C.dark, { p: onTorn ? atHinge(q) : q, r: [P / 2, 0, 0] })
    }
  }
  // Gunmetal skirt plates under the belt, an under-light on each
  const gapB = 0.5
  const lenL = (2 * P - 2 * gapB - 5 * GAP) / 6
  for (let i = 0; i < 6; i++) {
    const ph0 = P / 2 + gapB + i * (lenL + GAP)
    b.part('body', shell(0.565 * P, 0.75 * P, ph0, lenL, PLATE, 8, 6), C.gunLt)
    b.part('body', sph(0.042, 10, 6), C.red, { p: on(0.68 * P, ph0 + lenL / 2, PLATE + 0.01), glow: true, outline: false })
  }
  // Hazard ring round the belly, above the thrusters
  const thH = 0.8 * P
  b.painted('body', xform(hazard(Math.sin(thH), 0.035, 10), [0, 0, 0], [P / 2, 0, 0]), { p: [0, HULL[1] * Math.cos(thH), 0], s: [1, 1, HULL[2]] })

  // ── The red band round the middle (open at the face), on two crimson rails
  const bandGap = 0.39 * P // the face's right edge (angle from +x toward +z)
  const a0 = P - bandGap // the band starts at the face's left edge…
  const arcLen = P + 2 * bandGap // …and runs round the back to its right edge
  b.part('body', xform(torus(1.0, 0.075, 8, 64, arcLen), [0, 0, 0], [P / 2, 0, a0]), C.red, { s: [1, 1, HULL[2]], glow: true, outline: false })
  for (const y of [-0.095, 0.095]) {
    const rr = Math.sqrt(1 - (y / HULL[1]) ** 2)
    b.part('body', xform(torus(rr, 0.03, 6, 64, arcLen + 0.1), [0, 0, 0], [P / 2, 0, a0 - 0.05]), C.crimson, { p: [0, y, 0], s: [1, 1, HULL[2]] })
  }
  // Clamps where the band meets the face
  b.mirror((sd) => {
    const a = P / 2 - sd * (P / 2 - bandGap)
    const p: V3 = [Math.cos(a), 0, HULL[2] * Math.sin(a)]
    b.part('body', sph(0.085, 14, 10), C.crimson, { p })
    b.part('body', sph(0.03, 8, 6), C.steel, { p: [p[0] * 1.085, 0, p[2] * 1.085] })
  })

  // ── Skull faceplate: cranium, angry brows, glowing eyes, a toothy grin
  b.painted('body', paintBy(ell(0.5, 0.3, 0.22, 28, 16), (_x, y) => (y < -0.12 ? C.boneSh : C.bone)), { p: [0, 0.24, 0.7] })
  b.part('body', ell(0.3, 0.12, 0.12, 20, 10), C.socket, { p: [0, -0.17, 0.78] })
  b.part('body', ell(0.26, 0.09, 0.14, 18, 8), C.boneSh, { p: [0, -0.32, 0.74] })
  b.mirror((sd) => {
    b.part('body', ell(0.12, 0.1, 0.07, 16, 10), C.socket, { p: [sd * 0.17, 0.24, 0.88] })
    b.part('body', sph(0.058, 12, 8), C.red, { p: [sd * 0.17, 0.235, 0.935], s: [1, 1, 0.6], glow: true, outline: false })
    b.part('body', sph(0.017, 8, 6), '#ffffff', { p: [sd * 0.17 - 0.024, 0.262, 0.968], glow: true, outline: false })
    b.part('body', rbox(0.25, 0.07, 0.08, 0.5, 12, 8), C.crimson, { p: [sd * 0.17, 0.385, 0.885], r: [-0.35, 0, sd * 0.32] })
    // Faceplate bolts
    b.part('body', sph(0.03, 8, 6), C.steel, { p: [sd * 0.42, 0.36, 0.79] })
    b.part('body', sph(0.03, 8, 6), C.steel, { p: [sd * 0.44, 0.12, 0.785] })
  })
  b.part('body', ell(0.04, 0.055, 0.03, 10, 6), C.socket, { p: [0, 0.09, 0.9] })
  // Teeth: an upper row on a grin curve, a smaller lower row
  for (let i = -3; i < 3; i++) {
    const x = (i + 0.5) * 0.085
    const y = -0.135 + x * x * 0.6
    const z = 0.78 + 0.12 * Math.sqrt(Math.max(0, 1 - (x / 0.3) ** 2 - ((y + 0.17) / 0.12) ** 2)) + 0.004
    b.part('body', rbox(0.07, 0.1, 0.06, 0.45, 10, 8), C.bone, { p: [x, y, z], r: [0, x * 1.6, 0] })
  }
  for (let i = -2; i < 2; i++) {
    const x = (i + 0.5) * 0.08
    const y = -0.225 + x * x * 0.5
    const z = 0.78 + 0.12 * Math.sqrt(Math.max(0, 1 - (x / 0.3) ** 2 - ((y + 0.17) / 0.12) ** 2)) + 0.004
    b.part('body', rbox(0.055, 0.055, 0.05, 0.45, 10, 8), C.boneSh, { p: [x, y, z], r: [0, x * 1.6, 0] })
  }

  // ── Back: tail fins, twin rear thrusters
  b.mirror((sd) => {
    b.part('body', rbox(0.06, 0.5, 0.42, 0.4, 12, 10), C.crimson, { p: [sd * 0.5, 0.5, -0.6], r: [-0.45, sd * 0.3, -sd * 0.45] })
    b.part('body', rcone(0.1, 0.14, 0.2, 0.03, 16), C.black, { p: [sd * 0.36, -0.12, -0.8], r: [-P / 2, 0, 0] })
    b.part('body', torus(0.12, 0.022, 6, 16), C.gunLt, { p: [sd * 0.36, -0.12, -0.84] })
    b.part('body', ell(0.1, 0.1, 0.03, 12, 6), C.flame, { p: [sd * 0.36, -0.12, -0.9], glow: true, outline: false })
  })
  b.mirror((_sd, t) => b.part(`jetB${t}`, flame(0.085, 0.38), '#ffffff', { glow: true, outline: false }))

  // ── Belly: four hover thrusters round the glowing core
  UNDER.forEach(([x, z], i) => {
    b.part('body', rcone(0.13, 0.09, 0.16, 0.03, 16), C.black, { p: [x, -0.66, z] })
    b.part('body', ell(0.1, 0.025, 0.1, 12, 4), C.flame, { p: [x, -0.74, z], glow: true, outline: false })
    b.part(`jet${i}`, flame(0.08, 0.34), '#ffffff', { glow: true, outline: false })
  })
  b.part('body', torus(0.17, 0.05, 8, 24), C.gunLt, { p: [0, -0.69, 0], r: [P / 2, 0, 0] })
  b.part('core', sph(0.14, 16, 10), C.red, { p: [0, -0.02, 0], glow: true, outline: false })

  // ── Orb cannon under the chin
  b.part('cannon', sph(0.16, 16, 12), C.armor)
  b.part('cannon', torus(0.155, 0.03, 6, 20), C.crimson, { r: [0, 0, 0] })
  b.part('cannon', rcyl(0.075, 0.26, 0.02, 14), C.gunLt, { p: [0, 0, 0.19], r: [P / 2, 0, 0] })
  b.part('cannon', xform(hazard(0.077, 0.018, 4), [0, 0, 0.13]), '#ffffff')
  b.part('cannon', torus(0.08, 0.026, 8, 16), C.orb, { p: [0, 0, 0.32], glow: true, outline: false })
  b.part('orb', sph(0.09, 12, 8), C.orb, { glow: true, outline: false })

  // ── Mortar rack on the back (lobBarrage)
  b.part('mortar', rbox(0.5, 0.16, 0.3, 0.35, 12, 8), C.gun)
  b.mirror((sd) => {
    b.part('mortar', rcyl(0.085, 0.34, 0.03, 14), C.armor, { p: [sd * 0.13, 0.2, 0] })
    b.part('mortar', ell(0.06, 0.02, 0.06, 10, 4), C.flame, { p: [sd * 0.13, 0.371, 0], glow: true, outline: false })
    b.part(sd < 0 ? 'lobL' : 'lobR', sph(0.08, 12, 8), C.flame, { glow: true, outline: false })
    b.part('mortar', xform(hazard(0.087, 0.018, 4), [0, 0, 0], [P / 2, 0, 0]), '#ffffff', { p: [sd * 0.13, 0.26, 0] })
  })

  // ── Tesla antennae (voltRing)
  b.mirror((_sd, t) => {
    const a = `ant${t}`
    b.part(a, rcyl(0.07, 0.1, 0.025, 12), C.armor, { p: [0, 0.02, 0] })
    b.part(a, cap(0.022, 0.38, 6, 2), C.gunLt, { p: [0, 0.26, 0] })
    for (let i = 0; i < 3; i++) b.part(a, torus(0.05 - i * 0.006, 0.016, 6, 14), C.copper, { p: [0, 0.14 + i * 0.08, 0], r: [P / 2, 0, 0] })
    b.part(`tip${t}`, sph(0.05, 12, 8), C.volt, { glow: true, outline: false })
  })

  // ── Claw arms: armoured shoulder, a weapon in each wrist, three white claws
  b.mirror((sd, t) => {
    const c = `claw${t}`
    b.part(c, sph(0.19, 16, 12), C.armor)
    const padP: V3 = [sd * 0.04, 0.04, 0]
    const padR: V3 = [0, 0, -sd * 0.45]
    const th = 0.56 * P
    b.part(c, dome(0.26, th, 20, 8), C.crimson, { p: padP, r: padR })
    b.painted(c, xform(hazard(0.26 * Math.sin(th), 0.03, 7), [0, 0.26 * Math.cos(th), 0], [P / 2, 0, 0]), { p: padP, r: padR })
    b.part(c, rcone(0.05, 0.01, 0.16, 0.01, 10), C.dark, { p: [sd * 0.1, 0.27, 0], r: [0, 0, -sd * 0.5] })
    b.part(c, cap(0.085, 0.22), C.gun, { p: [0, -0.27, 0.03] })
    b.part(c, rcyl(0.14, 0.16, 0.04, 18), C.gunLt, { p: [0, -0.48, 0.04] })
    b.painted(c, xform(hazard(0.142, 0.022, 6), [0, 0, 0], [P / 2, 0, 0]), { p: [0, -0.48, 0.04] })
    if (sd < 0) {
      // Left: the flame nozzle and its fuel can
      b.part(c, rcone(0.11, 0.08, 0.16, 0.03, 16), C.black, { p: [0, -0.62, 0.04] })
      b.part(c, ell(0.085, 0.02, 0.085, 12, 4), C.flame, { p: [0, -0.7, 0.04], glow: true, outline: false })
      b.part(c, cap(0.055, 0.12), '#d0303f', { p: [-0.16, -0.32, -0.06] })
      b.part(c, torus(0.057, 0.014, 6, 12), C.yellow, { p: [-0.16, -0.32, -0.06], r: [P / 2, 0, 0] })
      b.part('muzzleL', sph(0.1, 12, 8), C.flame, { glow: true, outline: false })
    } else {
      // Right: the ice emitter, crystal prongs round a frozen core
      b.part(c, rcyl(0.1, 0.12, 0.03, 14), C.black, { p: [0, -0.6, 0.04] })
      b.part(c, ell(0.06, 0.1, 0.06, 10, 8), '#e8fbff', { p: [0, -0.7, 0.04], glow: true, outline: false })
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * P * 2
        b.part(c, rcone(0.035, 0.004, 0.2, 0.01, 8), C.ice, { p: [Math.cos(a) * 0.07, -0.73, 0.04 + Math.sin(a) * 0.07], r: [Math.sin(a) * 0.35 + P, 0, -Math.cos(a) * 0.35], glow: true, outline: false })
      }
      b.part(c, cap(0.055, 0.12), '#7fd6ff', { p: [0.16, -0.32, -0.06] })
      b.part(c, torus(0.057, 0.014, 6, 12), C.yellow, { p: [0.16, -0.32, -0.06], r: [P / 2, 0, 0] })
      b.part('muzzleR', sph(0.1, 12, 8), C.ice, { glow: true, outline: false })
    }
    for (let i = 0; i < FINGERS; i++) {
      const f = `pin${t}${i}`
      b.part(f, sph(0.05, 10, 8), C.armor, { p: [0, 0, 0.16] })
      b.part(f, rcone(0.055, 0.035, 0.16, 0.015, 10), C.bone, { p: [0, -0.09, 0.165], r: [-0.12, 0, 0] })
      b.part(f, rcone(0.036, 0.006, 0.18, 0.01, 10), C.bone, { p: [0, -0.24, 0.15], r: [0.3, 0, 0] })
    }
  })

  // ── Cockpit: collar, frame, beacon; Vex's hologram inside the glass
  b.part('dome', rcyl(0.5, 0.16, 0.05, 32), C.armor)
  b.part('dome', torus(0.5, 0.026, 6, 40), C.red, { r: [P / 2, 0, 0], glow: true, outline: false })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * P * 2
    b.part('dome', sph(0.024, 8, 6), C.steel, { p: [Math.cos(a) * 0.475, 0.08, Math.sin(a) * 0.475] })
  }
  for (const yaw of [P / 4, -P / 4]) b.part('dome', torus(0.465, 0.02, 6, 24, P), C.gun, { p: [0, 0.08, 0], r: [0, yaw, 0], s: [1, 1.1, 1] })
  b.part('dome', sph(0.05, 10, 8), C.gun, { p: [0, 0.575, 0] })
  b.part('beacon', sph(0.032, 10, 8), C.red, { p: [0, 0.02, 0], glow: true, outline: false })
  // The hologram's emitter
  b.part('dome', rcyl(0.2, 0.06, 0.02, 20), C.gun, { p: [0, 0.08, 0] })
  b.part('dome', torus(0.15, 0.018, 6, 24), C.red, { p: [0, 0.11, 0], r: [P / 2, 0, 0], glow: true, outline: false })
  // Vex: a grinning red skull of light, a monocle on his right eye, scan lines
  b.part('pilot', ell(0.18, 0.16, 0.16, 20, 14), C.holo, { glow: true, outline: false })
  b.part('pilot', ell(0.11, 0.06, 0.1, 14, 8), C.holo, { p: [0, -0.14, 0.04], glow: true, outline: false })
  b.mirror((sd) => {
    b.part('pilot', ell(0.048, 0.042, 0.02, 12, 8), C.holoDk, { p: [sd * 0.065, 0.02, 0.15], r: [0, sd * 0.4, 0], outline: false })
    b.part('pilot', sph(0.014, 8, 6), '#fff2a8', { p: [sd * 0.065, 0.022, 0.168], glow: true, outline: false })
  })
  // Brows: a sly raised one over the monocle, a scowl over the other
  b.part('pilot', rbox(0.07, 0.016, 0.02, 0.5, 8, 4), C.holoDk, { p: [-0.065, 0.08, 0.142], r: [-0.3, -0.3, -0.35], outline: false })
  b.part('pilot', rbox(0.07, 0.016, 0.02, 0.5, 8, 4), C.holoDk, { p: [0.065, 0.065, 0.148], r: [-0.3, 0.3, 0.3], outline: false })
  b.part('pilot', torus(0.052, 0.011, 6, 20), C.gold, { p: [-0.065, 0.02, 0.165], r: [0, -0.4, 0], glow: true, outline: false })
  b.part('pilot', torus(0.05, 0.004, 4, 16, P * 0.8), C.gold, { p: [-0.11, -0.06, 0.12], r: [0, -P / 2 + 0.4, P / 2], glow: true, outline: false })
  b.part('pilot', ell(0.022, 0.03, 0.015, 8, 6), C.holoDk, { p: [0, -0.04, 0.155], outline: false })
  b.part('pilot', torus(0.075, 0.012, 6, 16, P), C.holoDk, { p: [0, -0.06, 0.125], r: [-0.45, 0, P], outline: false })
  for (const y of [0.1, -0.08]) {
    const rr = 0.18 * Math.sqrt(1 - (y / 0.16) ** 2)
    b.part('pilot', torus(rr, 0.005, 4, 32), C.holoDk, { p: [0, y, 0], r: [P / 2, 0, 0], s: [1, 1, 0.16 / 0.18 * 1.02], outline: false })
  }
  // Floating claw-hands
  b.mirror((sd, t) => {
    const h = `hand${t}`
    b.part(h, sph(0.04, 10, 8), C.holo, { glow: true, outline: false })
    for (let i = -1; i <= 1; i++) b.part(h, rcone(0.018, 0.004, 0.08, 0.005, 6), C.holo, { p: [i * 0.03, 0.06, 0.01], r: [0, 0, -i * 0.35 - sd * 0.1], glow: true, outline: false })
  })

  // ── Phase 2 damage (hidden until then: their bones scaled to nothing)
  // Sparks: white-hot streaks bursting out of the wound
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * P * 2
    b.part('spark', rcone(0.012, 0.002, 0.16, 0.002, 5), '#fff6c8', { p: [Math.cos(a) * 0.09, 0.02, Math.sin(a) * 0.09], r: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], glow: true, outline: false })
  }
  b.part('spark', sph(0.035, 8, 6), '#ffe08a', { glow: true, outline: false })
  // Smoke puffs, rising from it
  for (let i = 0; i < PUFFS; i++) b.part(`puff${i}`, sph(0.11, 10, 8), i % 2 ? '#7d818c' : '#9a9ea8', { outline: false })
  // A crack down the faceplate's forehead: dark jagged strokes along a zigzag
  const CRACK: Array<[number, number]> = [[0.2, 0.53], [0.11, 0.49], [0.15, 0.45], [0.04, 0.42], [0.07, 0.38]]
  const skullZ = (x: number, y: number): number => 0.7 + 0.22 * Math.sqrt(Math.max(0, 1 - (x / 0.5) ** 2 - ((y - 0.24) / 0.3) ** 2))
  for (let i = 0; i + 1 < CRACK.length; i++) {
    const [x0, y0] = CRACK[i]!
    const [x1, y1] = CRACK[i + 1]!
    const x = (x0 + x1) / 2
    const y = (y0 + y1) / 2
    const z = skullZ(x, y)
    // Tilted back with the brow's slope, so the stroke lies along the plate
    const tilt = Math.atan2(skullZ(x, y + 0.02) - z, 0.02)
    b.part('crack', rbox(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.026, 0.04, 0.4, 8, 4), C.socket,
      { p: [x - CRACK_AT[0], y - CRACK_AT[1], z - CRACK_AT[2]], r: [tilt, x * 0.9, Math.atan2(y1 - y0, x1 - x0)], outline: false })
  }
  // Alarm sirens either side of the cockpit
  b.mirror((_sd, t) => {
    b.part(`siren${t}`, rcyl(0.085, 0.1, 0.025, 14), C.armor)
    b.part(`siren${t}`, torus(0.085, 0.018, 6, 16), C.yellow, { p: [0, 0.03, 0], r: [P / 2, 0, 0] })
    b.part(`lamp${t}`, dome(0.075, P / 2, 12, 6), C.red, { s: [1, 1.3, 1], glow: true, outline: false })
  })
  // Vex fuming: an anger mark by his temple
  for (const [x, y, a] of [[0.02, 0.02, 0.6], [-0.02, -0.02, 0.6], [-0.02, 0.02, -0.6], [0.02, -0.02, -0.6]] as const) {
    b.part('fume', rbox(0.045, 0.014, 0.014, 0.5, 6, 4), C.volt, { p: [x, y, 0], r: [0, 0, a], glow: true, outline: false })
  }

  const rig = b.build({ outline: 0.03, height: 2.2 })
  rig.bones.dome!.add(cockpitGlass())
  return rig
}

// ─── Pose ────────────────────────────────────────────────────────────────────

/** What the fight tells the pose (the boss `Enemy` itself fits): the pattern
 *  coming or running, and whether he is in phase 2. View-only. */
export interface VexCue {
  attack: string
  phase2: boolean
}

/** Which weapon each of his patterns fires from. */
const WEAPON: Record<string, 'flame' | 'ice' | 'orb' | 'lob' | 'volt' | 'dive'> = {
  flameBurst: 'flame',
  fireWave: 'flame',
  iceVolley: 'ice',
  orbStorm: 'orb',
  lobBarrage: 'lob',
  voltRing: 'volt',
  dive: 'dive'
}

/** Per-weapon wind-up weights for this frame (module scratch: no allocation). */
const W = { flame: 0, ice: 0, orb: 0, lob: 0, volt: 0, dive: 0 }
/** Only the coming pattern's weapon winds up. With no cue (ModelLab, the
 *  portrait) or a pattern that is not his, every gun does — the generic tell;
 *  the phase-2 roar fires up everything, thrusters too. */
const weigh = (attack: string | null): void => {
  const w = attack === null ? undefined : WEAPON[attack]
  const all = w === undefined ? 1 : 0
  const roar = attack === 'roar' ? 1 : 0
  W.flame = w === 'flame' ? 1 : all
  W.ice = w === 'ice' ? 1 : all
  W.orb = w === 'orb' ? 1 : all
  W.lob = w === 'lob' ? 1 : all
  W.volt = w === 'volt' ? 1 : all
  W.dive = w === 'dive' ? 1 : roar
}

/** 0 or 1: a hologram glitch frame (deterministic in `t`, ~8% of the time). */
const glitch = (t: number): number => (frac(Math.sin(Math.floor(t * 12) * 91.7) * 4375.5) > 0.92 ? 1 : 0)
/** Bones hidden until phase 2 sit at this scale (not 0: no singular matrices). */
const HIDE = 0.001

/** The Mk-I's hover. Without a motion record (ModelLab, the portrait) and
 *  with one at rest it is the same pose; travel tilts it into the move and
 *  banks it through turns, a glance turns Vex's head. With a cue only the
 *  coming pattern's weapon winds up, and phase 2 shows the damage: a plate
 *  torn loose and swinging, sparks and smoke from the wound, a cracked face,
 *  sirens, Vex fuming. All in place, no allocations. */
export const poseVex = (rig: Rig, t: number, act: BossAct, k: number, m?: EnemyMotion, cue?: VexCue): void => {
  const fwd = m ? m.fwd * m.walk : 0
  const side = m ? m.side * m.walk : 0
  const turn = m ? Math.max(-3, Math.min(3, m.turn)) : 0
  const look = m ? m.look : 0
  const tele = act === 'tele' ? k : 0
  // The kick right after the release, easing off over the strike's first beat
  const kick = act === 'attack' ? 1 - k : 0
  // The guns raised to aim: up through the telegraph, down after the strike
  const aim = act === 'tele' ? k : kick
  const dive = act === 'air' ? 1 : 0
  const daze = act === 'stun' ? 1 : 0
  const p2 = cue?.phase2 ? 1 : 0
  weigh(cue && (act === 'tele' || act === 'attack' || act === 'air') ? cue.attack : null)

  // Hull: the hover bob, a slow sway, reared back while charging (further
  // before a dive), jolted by the shot, nose down into a dive, wobbling when
  // dazed; listing and shuddering once it is damaged
  nudge(rig, 'body', 0, Math.sin(t * 1.4) * 0.12 - tele * 0.06, -kick * 0.08)
  pose(rig, 'body',
    Math.sin(t * 0.9) * 0.05 + fwd * 0.2 - tele * (0.12 + W.dive * 0.18) + kick * 0.08 + dive * 0.5 + daze * Math.sin(t * 7) * 0.12,
    daze * Math.sin(t * 3) * 0.2,
    Math.sin(t * 1.1) * 0.05 - side * 0.2 - turn * 0.05 + daze * Math.cos(t * 6) * 0.15 + p2 * (0.07 + Math.sin(t * 5.3) * 0.03))

  // Claws: the one whose gun is coming rises all the way, the other barely;
  // an idle drift and a trail behind the move
  const aimL = aim * (0.25 + 0.75 * W.flame)
  const aimR = aim * (0.25 + 0.75 * W.ice)
  pose(rig, 'clawL', -aimL * 0.9 + Math.sin(t * 1.7) * 0.06 - fwd * 0.2, 0, -0.3 - aimL * 0.4 + Math.sin(t * 1.3) * 0.04)
  pose(rig, 'clawR', -aimR * 0.9 + Math.sin(t * 1.7 + 1) * 0.06 - fwd * 0.2, 0, 0.3 + aimR * 0.4 - Math.sin(t * 1.3 + 1) * 0.04)
  const flex = 0.12 + daze * 0.3 + Math.sin(t * 2.3) * 0.03
  for (let i = 0; i < FINGERS; i++) {
    pose(rig, `pinL${i}`, -(flex + aimL * 0.5), 0, 0)
    pose(rig, `pinR${i}`, -(flex + aimR * 0.5), 0, 0)
  }
  // Each gun's charge: a pilot spark at rest, swelling through its telegraph
  // (fizzing), shrinking away after the release
  const surge = tele * (0.85 + Math.sin(t * 31) * 0.08) + kick * 0.5
  scaleBone(rig, 'muzzleL', 0.22 + W.flame * surge)
  scaleBone(rig, 'muzzleR', 0.22 + W.ice * surge)
  scaleBone(rig, 'orb', 0.22 + W.orb * surge)
  scaleBone(rig, 'lobL', 0.05 + W.lob * surge)
  scaleBone(rig, 'lobR', 0.05 + W.lob * surge)
  scaleBone(rig, 'tipL', 1 + W.volt * (surge + tele * Math.abs(Math.sin(t * 43)) * 0.4))
  scaleBone(rig, 'tipR', 1 + W.volt * (surge + tele * Math.abs(Math.sin(t * 37 + 1)) * 0.4))
  // Barrels kick back along their bores; the mortars stand up to lob
  nudge(rig, 'cannon', 0, 0, -kick * W.orb * 0.08)
  pose(rig, 'cannon', 0.25 + Math.sin(t * 0.7) * 0.08 - aim * W.orb * 0.25, look * 0.4 + Math.sin(t * 0.5) * 0.15 * (1 - aim * W.orb), 0)
  nudge(rig, 'mortar', 0, -kick * W.lob * 0.07, 0)
  pose(rig, 'mortar', aim * W.lob * 0.45, 0, 0)
  // Antennae: a sway, bent back by the move, crackling (hard before a volt ring)
  const zap = tele * (0.05 + W.volt * 0.1)
  pose(rig, 'antL', Math.sin(t * 2.1) * 0.08 - fwd * 0.3 + zap * Math.sin(t * 40), 0, Math.sin(t * 1.7) * 0.06 + side * 0.2 + daze * Math.sin(t * 13) * 0.3 + zap * Math.sin(t * 47))
  pose(rig, 'antR', Math.sin(t * 2.1 + 0.8) * 0.08 - fwd * 0.3 + zap * Math.sin(t * 40 + 1), 0, Math.sin(t * 1.7 + 0.8) * 0.06 + side * 0.2 + daze * Math.sin(t * 13 + 1) * 0.3 + zap * Math.sin(t * 47 + 1))

  // Thrusters: every flame flickers on its own beat, longer while it climbs,
  // dives or travels, flaring before a dive, sputtering when dazed
  const sputter = daze ? (Math.sin(t * 23) > 0 ? 1 : 0.35) : 1
  const flare = 1 + W.dive * (tele * 1.2 + kick * 0.6)
  for (let i = 0; i < 4; i++) {
    const f = (0.88 + Math.sin(t * 31 + i * 1.7) * 0.1 + Math.sin(t * 53 + i * 2.9) * 0.06) * sputter
    scaleBone(rig, `jet${i}`, 0.92 + f * 0.08, f * (1 + tele * 0.25 + dive * 0.5) * flare, 0.92 + f * 0.08)
  }
  const rear = Math.max(0.45, 0.6 + fwd * 0.8 + dive * 0.6) * flare
  scaleBone(rig, 'jetBL', 1, (0.9 + Math.sin(t * 29) * 0.1) * rear * sputter, 1)
  scaleBone(rig, 'jetBR', 1, (0.9 + Math.sin(t * 37 + 2) * 0.1) * rear * sputter, 1)
  scaleBone(rig, 'core', 1 + Math.sin(t * 3.2) * 0.06 + tele * 0.2)
  scaleBone(rig, 'beacon', frac(t * (p2 ? 4 : tele > 0 ? 3 : 0.8)) < 0.2 ? 1.2 : 0.5)

  // Phase 2: the torn plate hangs off its hinge and swings (jolted by each
  // shot), sparks burst from the wound, smoke puffs rise, the face is
  // cracked and the sirens flash in turn
  const plate = rig.bones.plate
  if (plate) plate.quaternion.setFromAxisAngle(HINGE_AXIS, -p2 * (0.6 + Math.sin(t * 2.3) * 0.1 + Math.sin(t * 7.1) * 0.04 + kick * 0.15))
  const burst = frac(Math.sin(Math.floor(t * 9) * 12.9898) * 43758.5)
  scaleBone(rig, 'spark', p2 && burst > 0.45 ? 0.6 + burst * 0.6 : HIDE)
  pose(rig, 'spark', 0, Math.floor(t * 9) * 2.4, 0)
  for (let i = 0; i < PUFFS; i++) {
    const f = frac(t * 0.6 + i / PUFFS)
    nudge(rig, `puff${i}`, f * 0.12, f * 0.5, -f * 0.08)
    scaleBone(rig, `puff${i}`, p2 ? Math.max(HIDE, Math.sin(f * Math.PI) * (0.5 + f * 0.9)) : HIDE)
  }
  scaleBone(rig, 'crack', p2 ? 1 : HIDE)
  scaleBone(rig, 'sirenL', p2 ? 1 : HIDE)
  scaleBone(rig, 'sirenR', p2 ? 1 : HIDE)
  const flash = frac(t * 2.5) < 0.5
  scaleBone(rig, 'lampL', flash ? 1.2 : 0.4)
  scaleBone(rig, 'lampR', flash ? 0.4 : 1.2)

  // The cockpit swells with each pulse of the telegraph (the old tell)
  scaleBone(rig, 'dome', 1 + tele * 0.04 * Math.sin(t * 20))
  // Vex: a smug tilt, a glance about between attacks, locked on and cackling
  // through the telegraph, spinning dizzy when dazed; the hologram glitches.
  // In phase 2 he glares, shakes with rage, fumes and glitches more.
  pose(rig, 'pilot',
    0.1 + Math.sin(t * 0.8) * 0.05 - kick * 0.15 + p2 * 0.12,
    look * 0.6 + Math.sin(t * 0.6) * 0.25 * (1 - aim) * (1 - 0.6 * p2) + daze * Math.sin(t * 9) * 0.7,
    Math.sin(t * 0.8 + 1) * 0.1 * (1 - aim) * (1 - p2))
  nudge(rig, 'pilot', p2 * Math.sin(t * 47) * 0.01, tele * Math.abs(Math.sin(t * 18)) * 0.025, 0)
  const g = Math.max(glitch(t), daze * glitch(t * 3 + 0.5), p2 * glitch(t * 2 + 0.3))
  scaleBone(rig, 'pilot', 1 + g * 0.14, 1 - g * 0.08, 1)
  scaleBone(rig, 'fume', p2 ? 1 + Math.sin(t * 10) * 0.15 : HIDE)
  // His hands float, rise and rub together while he schemes; shake as fists in phase 2
  const shake = p2 * Math.sin(t * 22) * 0.15
  nudge(rig, 'handL', tele * 0.07, Math.sin(t * 2) * 0.02 + tele * 0.06, 0)
  nudge(rig, 'handR', -tele * 0.07, Math.sin(t * 2 + 1) * 0.02 + tele * 0.06, 0)
  pose(rig, 'handL', 0, 0, -0.2 + tele * Math.sin(t * 16) * 0.3 + shake)
  pose(rig, 'handR', 0, 0, 0.2 - tele * Math.sin(t * 16) * 0.3 - shake)
}
