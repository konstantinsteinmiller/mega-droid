import {
  AdditiveBlending, BoxGeometry, CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, type BufferGeometry
} from 'three'
import { rbox, rcyl, sph, torus, tube, ell, xform, paint, merge } from './kit'
import { toonVC, glowVC, outlineMat } from './toon'
import { buildCapsule } from './props'
import type { Theme } from '../world/themes'
import type { SecretSpec } from '../world/levelGen'

/**
 * ─── A secret's props (`sim/secrets.ts` drives them) ─────────────────────────
 *
 * Wall buttons, the hint panel, the colour frame on a false wall, the prize
 * and the light shaft over it. Each face is built looking down +Z (the
 * wall's normal into the room) with its origin on the face's centre; the sim
 * turns it to its wall. The lamps own their materials (the sim sets their
 * colours on a hit, never per frame at rest); the rest is shared toon.
 *
 * Colour is never the only cue: every colour has its own icon, drawn on its
 * lamp — red ●, green ▲, blue ■, yellow ◆ — so a colour-blind player reads
 * the panel by shape. The 'lights' puzzle is bright against dark.
 */

/** Red, green, blue, yellow: saturated and far apart in hue and brightness. */
export const SECRET_COLORS = ['#ff3b3b', '#2fe05a', '#3a8bff', '#ffd21a'] as const
/** A 'lights' lamp: on and off. */
export const LIGHT_ON = '#fff1b8'
export const LIGHT_OFF = '#3b4254'
/** The beam of a mirror puzzle, its lamp and its target: a hot cyan-white,
 *  apart from every button colour. */
export const BEAM = '#8ff7ff'

/** The solved glow. */
export const SOLVED = '#8dff7a'
/** A lamp at rest (not lit) is its colour at this brightness. */
export const DIM = 0.2
const ICON_DARK = '#141a33'

/** A button's lamp radius (m): its face, and the shot's target. */
export const BUTTON_R = 0.26

// Icon shapes, flat in XY facing +Z, shared by every lamp (the sim swaps a
// lamp's icon geometry when a cycle button changes colour).
let icons: BufferGeometry[] | null = null
export const iconGeometry = (color: number): BufferGeometry => {
  if (!icons) {
    icons = [
      new CircleGeometry(0.5, 20),
      new CircleGeometry(0.62, 3, Math.PI / 2),
      new CircleGeometry(0.6, 4, Math.PI / 4),
      new CircleGeometry(0.62, 4, Math.PI / 2)
    ]
  }
  return icons[((color % 4) + 4) % 4]!
}

const assemble = (toonParts: BufferGeometry[], glowParts: BufferGeometry[], outline = 0.02): Group => {
  const root = new Group()
  if (toonParts.length) {
    const g = merge(toonParts)
    root.add(new Mesh(g, toonVC()))
    const o = new Mesh(g, outlineMat(outline))
    o.renderOrder = -1
    root.add(o)
  }
  if (glowParts.length) root.add(new Mesh(merge(glowParts), glowVC()))
  return root
}

/** A disc lying in XY (its axis along Z). */
const disc = (r: number, h: number, z: number, hex: string): BufferGeometry =>
  xform(paint(rcyl(r, h, h * 0.45, 20), hex), [0, 0, z], [Math.PI / 2, 0, 0])

export interface LampMesh {
  root: Group
  lampMat: MeshBasicMaterial
  icon: Mesh
  iconMat: MeshBasicMaterial
}

/** A round lamp with an icon on its face (radius r), origin at its back. */
const lamp = (r: number, z: number): LampMesh => {
  const root = new Group()
  const lampMat = new MeshBasicMaterial({ color: new Color(LIGHT_OFF), toneMapped: false })
  const bulb = new Mesh(xform(ell(r, r, r * 0.42, 18, 8), [0, 0, z]), lampMat)
  root.add(bulb)
  const iconMat = new MeshBasicMaterial({ color: new Color(ICON_DARK), toneMapped: false })
  const icon = new Mesh(iconGeometry(0), iconMat)
  icon.scale.setScalar(r * 0.95)
  icon.position.z = z + r * 0.42 + 0.004
  root.add(icon)
  return { root, lampMat, icon, iconMat }
}

/**
 * A wall button: a steel back plate in the theme's trim with a rim, and a
 * big round lamp. The origin is the lamp's face centre on its wall (the
 * spec's button position); +Z points into the room.
 */
export const buildButton = (theme: Theme): LampMesh => {
  const back = assemble([
    disc(BUTTON_R + 0.12, 0.1, -0.04, theme.pilaster),
    xform(paint(torus(BUTTON_R + 0.05, 0.04, 6, 24), theme.trim), [0, 0, 0.02])
  ], [])
  const l = lamp(BUTTON_R, 0.01)
  l.root.add(back)
  return l
}

export interface PanelMesh {
  root: Group
  lamps: LampMesh[]
}

/**
 * The hint panel: a dark plate framed in the theme's trim with a row of
 * `n` small lamps, the sim lights them with the target. `n` lamps fit in
 * 1.7 m (the builder leaves 0.9 m either side of the panel's centre).
 */
export const buildPanel = (theme: Theme, n: number): PanelMesh => {
  const step = Math.min(0.36, 1.45 / Math.max(1, n))
  const r = step * 0.38
  const w = step * n + 0.22
  const h = Math.max(0.42, r * 2 + 0.26)
  const plate = assemble([
    xform(paint(rbox(w + 0.1, h + 0.1, 0.08, 0.25), theme.trim), [0, 0, -0.04]),
    xform(paint(rbox(w, h, 0.06, 0.25), '#1c2130'), [0, 0, 0])
  ], [])
  const root = new Group()
  root.add(plate)
  const lamps: LampMesh[] = []
  for (let i = 0; i < n; i++) {
    const l = lamp(r, 0.02)
    l.root.position.x = (i - (n - 1) / 2) * step
    root.add(l.root)
    lamps.push(l)
  }
  return { root, lamps }
}

/**
 * A 'color' puzzle's frame round its false wall, in the key colour, with
 * the key's icon over it: the frame says which colour opens it. Origin on
 * the floor at the face's middle, +Z into the room; `w`, `h` the opening.
 */
export const buildKeyFrame = (key: number, w: number, h: number): Group => {
  const hex = SECRET_COLORS[key] ?? SECRET_COLORS[0]
  const t = 0.14
  const root = new Group()
  const mat = new MeshBasicMaterial({ color: new Color(hex), toneMapped: false })
  const g = merge([
    xform(rbox(t, h, t, 0.4), [-w / 2, h / 2, 0]),
    xform(rbox(t, h, t, 0.4), [w / 2, h / 2, 0]),
    xform(rbox(w + t, t, t, 0.4), [0, h, 0]),
    xform(rbox(w + t, t, t, 0.4), [0, 0.06, 0])
  ])
  root.add(new Mesh(g, mat))
  const badge = new Mesh(xform(ell(0.3, 0.3, 0.1, 18, 8), [0, h + 0.36, 0]), mat)
  root.add(badge)
  const icon = new Mesh(iconGeometry(key), new MeshBasicMaterial({ color: new Color(ICON_DARK), toneMapped: false }))
  icon.scale.setScalar(0.26)
  icon.position.set(0, h + 0.36, 0.11)
  root.add(icon)
  return root
}

/**
 * The Repair Kit: the Repair Gel as a thing found in the world, drawn after
 * Mega Man 2/3's energy tanks so it can never be taken for an energy pill (a
 * capsule) or a bolt (a hex nut): a square canister, white with a green band,
 * a big green cross on both faces, a dark cap and base. The cross is glow-lit
 * and blinks (`blinkRepairKit`), like the tank in the old games.
 */
export const buildRepairKit = (): Group => {
  const toon: BufferGeometry[] = [
    xform(paint(rbox(0.56, 0.62, 0.34, 0.12), '#f4f8ff'), [0, 0, 0]),
    xform(paint(rbox(0.6, 0.12, 0.38, 0.06), '#2fbf6a'), [0, -0.12, 0]),
    xform(paint(rbox(0.36, 0.1, 0.24, 0.05), '#2a3140'), [0, 0.36, 0]),
    xform(paint(rbox(0.6, 0.08, 0.38, 0.04), '#2a3140'), [0, -0.33, 0])
  ]
  const glow: BufferGeometry[] = []
  for (const z of [0.176, -0.176]) {
    glow.push(xform(paint(rbox(0.3, 0.09, 0.02, 0.02), '#5dff8e'), [0, 0.08, z]))
    glow.push(xform(paint(rbox(0.09, 0.3, 0.02, 0.02), '#5dff8e'), [0, 0.08, z]))
  }
  const root = assemble(toon, glow, 0.02)
  root.userData.blink = root.children[root.children.length - 1]
  return root
}

/** The Repair Kit's cross blinks (call per frame with the clock). */
export const blinkRepairKit = (g: Group, time: number): void => {
  const c = g.userData.blink as Mesh | undefined
  if (c) c.visible = Math.sin(time * 7) > -0.35
}

/** The prize, floating over its origin (the alcove floor): a Repair Gel
 *  flask, a big heal capsule, or a power orb (a borrowed weapon). */
export const buildPrize = (prize: SecretSpec['prize']): Group => {
  if (prize === 'hp') {
    const g = buildCapsule('hp', true).root
    g.scale.setScalar(1.5)
    return g
  }
  if (prize === 'tank') return buildRepairKit()
  return assemble([
    xform(paint(torus(0.34, 0.045, 6, 22), '#c9d3e6'), [0, 0, 0], [Math.PI / 2, 0, 0]),
    xform(paint(torus(0.34, 0.045, 6, 22), '#c9d3e6'), [0, 0, 0], [0, Math.PI / 2, 0])
  ], [xform(paint(sph(0.2, 12, 8), '#ff5fd8'), [0, 0, 0])], 0.015)
}

/** A shaft of light over the prize once the wall is gone: the room's one
 *  unmissable cue, no glyph. Origin on the floor; the sim breathes it. */
export const buildLightShaft = (): { root: Mesh; mat: MeshBasicMaterial } => {
  const mat = new MeshBasicMaterial({
    color: new Color('#fff2a8'), transparent: true, opacity: 0.3, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const root = new Mesh(xform(tube(0.45, 0.75, 5, 18), [0, 2.5, 0]), mat)
  return { root, mat }
}

/** The palette as colours, made once: the sim recolours lamps on the fly. */
export const LAMP = {
  colors: SECRET_COLORS.map(h => new Color(h)),
  on: new Color(LIGHT_ON),
  off: new Color(LIGHT_OFF),
  solved: new Color(SOLVED),
  white: new Color('#ffffff'),
  dark: new Color(ICON_DARK),
  pale: new Color('#c8cdd8'),
  beam: new Color(BEAM)
}

/** A lamp at colour `c`, `k` of its brightness, blended `w` toward white
 *  (a hit's flash). Allocation-free. */
export const setLamp = (m: MeshBasicMaterial, c: Color, k = 1, w = 0): void => {
  m.color.copy(c).multiplyScalar(k)
  if (w > 0) m.color.lerp(LAMP.white, w)
}

// ─── The later puzzles: a sequence's panel, a beam and its mirrors, plates ───

/**
 * A 'sequence' puzzle's panel: the hint panel with a small arrow between each
 * two lamps — the lamps are an ORDER, read left to right, not a lamp per
 * button (the 'cycle' panel's row).
 */
export const buildSequencePanel = (theme: Theme, n: number): PanelMesh => {
  const p = buildPanel(theme, n)
  const step = Math.min(0.36, 1.45 / Math.max(1, n))
  const mat = new MeshBasicMaterial({ color: new Color(LIGHT_ON), toneMapped: false })
  const arrow = new CircleGeometry(step * 0.13, 3)
  for (let i = 0; i < n - 1; i++) {
    const a = new Mesh(arrow, mat)
    a.position.set((i + 0.5 - (n - 1) / 2) * step, 0, 0.04)
    p.root.add(a)
  }
  return p
}

/**
 * A 'tiles' puzzle's panel: a little map of the floor plates, one lamp per
 * plate where it lies (`slots`: column, row; row 0 on top), lit as the plates
 * are. Up to 4 × 3 fit the 1.7 m the builder leaves.
 */
export const buildMapPanel = (theme: Theme, slots: ReadonlyArray<readonly [number, number]>, cols: number, rows: number): PanelMesh => {
  const step = Math.min(0.36, 1.45 / Math.max(1, cols), 1.2 / Math.max(1, rows))
  const r = step * 0.38
  const w = step * cols + 0.22
  const h = step * rows + 0.22
  const plate = assemble([
    xform(paint(rbox(w + 0.1, h + 0.1, 0.08, 0.25), theme.trim), [0, 0, -0.04]),
    xform(paint(rbox(w, h, 0.06, 0.25), '#1c2130'), [0, 0, 0])
  ], [])
  const root = new Group()
  root.add(plate)
  const lamps = slots.map(([c, row]) => {
    const l = lamp(r, 0.02)
    l.root.position.set((c - (cols - 1) / 2) * step, ((rows - 1) / 2 - row) * step, 0)
    l.icon.visible = false
    root.add(l.root)
    return l
  })
  return { root, lamps }
}

/**
 * A mirror puzzle's beam lamp: a squat housing on the wall with a glowing
 * lens, the beam leaving its middle. Origin on the lens's face centre at the
 * wall (the spec's emitter), +Z into the room.
 */
export const buildBeamLamp = (theme: Theme): Group => {
  const root = assemble([
    disc(0.34, 0.1, -0.04, theme.pilaster),
    xform(paint(rcyl(0.22, 0.26, 0.05, 18), theme.trim), [0, 0, 0.08], [Math.PI / 2, 0, 0]),
    xform(paint(torus(0.2, 0.035, 6, 20), '#2a3140'), [0, 0, 0.21])
  ], [xform(paint(ell(0.15, 0.15, 0.05, 16, 6), BEAM), [0, 0, 0.22])])
  return root
}

/**
 * A mirror puzzle's target, the hint panel's place beside the false wall: a
 * dark ring round one big lamp, dark until the beam reaches it.
 */
export const buildBeamTarget = (theme: Theme): PanelMesh => {
  const plate = assemble([
    disc(0.46, 0.1, -0.04, theme.trim),
    disc(0.4, 0.06, 0, '#1c2130'),
    xform(paint(torus(0.34, 0.04, 6, 24), BEAM), [0, 0, 0.04])
  ], [])
  const root = new Group()
  root.add(plate)
  const l = lamp(0.24, 0.035)
  l.icon.visible = false
  root.add(l.root)
  return { root, lamps: [l] }
}

/** The mirror plate's size (m) and the shot's target round its middle. */
export const MIRROR_W = 1.1
export const MIRROR_H = 0.9
export const MIRROR_R = 0.5

export interface MirrorMesh {
  root: Group
  /** The plate on its post, turned by the sim (yaw ±45°). */
  pivot: Group
}

/**
 * A turning mirror on the floor: a round foot, a post up to the beam's
 * height and a square plate in a frame, its glass a pale glow on both faces
 * (it catches the light: it reads as a mirror, not a sign). Origin on the
 * floor; the plate's middle `y` over it.
 */
export const buildMirror = (theme: Theme, y: number): MirrorMesh => {
  const root = assemble([
    xform(paint(rcyl(0.42, 0.16, 0.05, 20), theme.pilaster), [0, 0.06, 0]),
    xform(paint(rcyl(0.07, y - MIRROR_H / 2, 0.02, 10), theme.trim), [0, 0.14 + (y - MIRROR_H / 2 - 0.14) / 2, 0])
  ], [])
  const pivot = assemble([
    // The frame: four bars round the face (none over it).
    xform(paint(rbox(MIRROR_W, 0.08, 0.1, 0.4), theme.trim), [0, MIRROR_H / 2 - 0.04, 0]),
    xform(paint(rbox(MIRROR_W, 0.08, 0.1, 0.4), theme.trim), [0, -MIRROR_H / 2 + 0.04, 0]),
    xform(paint(rbox(0.08, MIRROR_H - 0.16, 0.1, 0.4), theme.trim), [MIRROR_W / 2 - 0.04, 0, 0]),
    xform(paint(rbox(0.08, MIRROR_H - 0.16, 0.1, 0.4), theme.trim), [-MIRROR_W / 2 + 0.04, 0, 0])
  ], [xform(paint(rbox(MIRROR_W - 0.17, MIRROR_H - 0.17, 0.04, 0.15), '#d6fbff'), [0, 0, 0])], 0.015)
  pivot.position.y = y
  root.add(pivot)
  return { root, pivot }
}

/** A floor plate's half width (m): a hand's breadth of floor round it. */
export const PLATE_HALF = 1.05

/**
 * A 'tiles' puzzle's floor plate: a raised rim in the theme's trim round a
 * lamp face a few cm over the floor (never on it: no z-fight), lit by the
 * sim. Origin on the floor at the cell centre.
 */
export const buildFloorPlate = (theme: Theme): { root: Group; lampMat: MeshBasicMaterial } => {
  const e = PLATE_HALF
  const t = 0.14
  const root = assemble([
    xform(paint(rbox(2 * e + 2 * t, 0.12, t, 0.3), theme.trim), [0, 0.01, e + t / 2]),
    xform(paint(rbox(2 * e + 2 * t, 0.12, t, 0.3), theme.trim), [0, 0.01, -e - t / 2]),
    xform(paint(rbox(t, 0.12, 2 * e - 0.02, 0.3), theme.trim), [e + t / 2, 0.01, 0]),
    xform(paint(rbox(t, 0.12, 2 * e - 0.02, 0.3), theme.trim), [-e - t / 2, 0.01, 0])
  ], [])
  const lampMat = new MeshBasicMaterial({ color: new Color(LIGHT_OFF), toneMapped: false })
  // The face: a slab from under the floor to 4.5 cm over it, inside the rim.
  const face = new Mesh(xform(new BoxGeometry(2 * e - 0.04, 0.075, 2 * e - 0.04), [0, 0.0075, 0]), lampMat)
  root.add(face)
  return { root, lampMat }
}

/** A beam leg's glow (unit length along +Z, scaled by the sim). */
export const buildBeamLeg = (mat: MeshBasicMaterial, w: number): Mesh =>
  new Mesh(xform(new BoxGeometry(w, w, 1), [0, 0, 0.5]), mat)

/** The beam's materials: additive, no depth write (the legs cross at a
 *  mirror without fighting). */
export const beamMaterial = (opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color: new Color(BEAM), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false
  })
