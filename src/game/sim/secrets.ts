import type { Group, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { CELL, Cell, type SecretSpec, type Terrain } from '../world/levelGen'
import { BUTTON_Y, secretDoorFace } from '../world/stages/builder'
import {
  buildButton, buildPanel, buildKeyFrame, buildPrize, buildLightShaft, iconGeometry, setLamp, blinkRepairKit,
  buildSequencePanel, buildMapPanel, buildBeamLamp, buildBeamTarget, buildMirror, buildFloorPlate, buildBeamLeg, beamMaterial,
  BUTTON_R, DIM, LAMP, MIRROR_R, type LampMesh, type MirrorMesh
} from '../models/secretProps'
import type { ClimbBody, ClimbHost } from './climb'
import type { StageFeature, StageRun } from './stageFeatures'
import type { Shot } from './world'

/**
 * ─── Secrets: solve the room, open the wall ──────────────────────────────────
 *
 * A secret (`SecretSpec`, placed with `Builder.secret`) is a puzzle in a
 * room, a HINT PANEL beside a striped false wall, and a sealed alcove behind
 * it with a prize. Six puzzles, each readable from the room alone by a
 * ten-year-old. The first three are round lamp BUTTONS on the walls; any
 * player shot toggles the button it strikes (once: the shot ends on it):
 *
 *  - 'lights': each button is on or off; the panel's lamps show the pattern
 *    to copy, bright against dark.
 *  - 'color':  each button has a fixed colour and is on or off; the false
 *    wall wears a frame in the key colour and the panel has one lamp for
 *    each colour IN THE ROOM, only the key's lit: exactly the key's buttons
 *    on, every other off. (It used to show all four colours: a room with
 *    no yellow button showed a yellow lamp, and read as unsolvable, #123.)
 *  - 'cycle':  each hit steps a button red → green → blue → yellow → red;
 *    the panel shows the colour each button wants.
 *
 * The later stages (from the Magnet Master's on, #143) ask for other things
 * than matching lamps:
 *
 *  - 'sequence': Simon says. Each button wears its own colour and icon; the
 *    panel shows an ORDER of them, arrows between, a light running along it
 *    left to right. Shoot them in that order: each right one lights its step
 *    on the panel, a wrong one buzzes and the panel starts over.
 *  - 'mirror': a beam lamp on a wall shines across the room; mirrors on posts
 *    turn it, and a shot flips a mirror a quarter turn. Steer the beam into
 *    the target ring beside the false wall (the panel's place).
 *  - 'tiles': floor plates, dark. Each lights as Flux steps onto it; light
 *    them all in one walk — stepping on a lit one, or off the plates, puts
 *    them all out. The panel is a little map of the plates, lit as they are.
 *
 * Where a panel has a row, its lamps go left to right as Flux sees the
 * buttons facing the panel (sorted along the panel's own right-hand axis), so
 * a mirrored map reads the same. Every colour carries its own icon (● ▲ ■ ◆,
 * `models/secretProps.ts`): the puzzles never rest on colour alone.
 *
 * No penalty for a wrong state. Each hit clicks and flashes its lamp. Solved:
 * a chime, every button blinks green, the false wall sinks into the floor
 * over SINK_T (then `ClimbRun.openSecret` lets bodies and paths in), a
 * sparkle, and a shaft of light stands over the prize until it is taken —
 * 'tank' a Repair Gel even over the cap, 'hp' a big heal, 'weapon' /
 * 'power' a borrowed Core Master weapon (`ClimbHost.secretPrize`).
 *
 * No glyphs or lessons: the first time Flux, in the secret's room, comes
 * within HINT_R of its buttons (mirrors, plates) on their floor, Atlas says
 * one cryptic line for its kind (`secret.<kind>`), and `secret.solved` when
 * one opens.
 *
 * The puzzle rules are the pure `press` / `solved` (and `traceBeam`); the
 * save is each secret's states and flags. Nothing allocates per step.
 */

/** The wall's sink (s), the solved blink (s), a hit's flash (s). */
export const SINK_T = 1
const SOLVED_BLINK = 1.4
const FLASH_T = 0.18
/** A wrong shot's (a stray step's) blink on the panel (s). */
const MISS_T = 0.6
/** A sequence panel's running light: a step (s), and the dark beats after
 *  the last step before it runs again. */
const CHASE_STEP = 0.45
const CHASE_REST = 3
/** A mirror's quarter turn (s). */
const TURN_T = 0.18
/** Atlas's hint: this near a button (m), within this of its floor (m). */
export const HINT_R = 7
const HINT_DY = 1.5
/** A shot's grace on a button's radius (m): a kid's aim is forgiven. */
const HIT_GRACE = 0.12
/** A mirror (the target) is on the beam's line when this near it (m). */
const LINE_TOL = 0.3
/** A mirror post's body (m). */
const POST_R = 0.42
/** Standing on a plate: plan-view half reach (m), and height (m). */
const PLATE_REACH = CELL / 2
const PLATE_DY = 0.5
/** Taking the prize: plan-view reach and height (m). */
const PRIZE_R = 1.1
const PRIZE_DY = 1
const PRIZE_HOVER = 0.85

// ─── The puzzle (pure) ───────────────────────────────────────────────────────

/** How many states a secret keeps: one per button, per step of a sequence,
 *  per mirror, per plate. */
export const stateCount = (spec: SecretSpec): number =>
  spec.kind === 'sequence' ? spec.target.length
    : spec.kind === 'mirror' ? spec.mirrors?.length ?? 0
      : spec.kind === 'tiles' ? spec.tiles?.length ?? 0
        : spec.buttons.length

/** How many things a shot (a step) can press: the buttons, mirrors or plates. */
export const pressCount = (spec: SecretSpec): number =>
  spec.kind === 'mirror' ? spec.mirrors?.length ?? 0 : spec.kind === 'tiles' ? spec.tiles?.length ?? 0 : spec.buttons.length

/** The states the puzzle starts in: all off (a sequence: no step done), a
 *  cycle button on its own colour, a mirror as it was set. */
export const initialState = (spec: SecretSpec): number[] => {
  if (spec.kind === 'cycle') return spec.buttons.map(b => ((b.color % 4) + 4) % 4)
  if (spec.kind === 'mirror') return (spec.mirrors ?? []).map(m => (m.o ? 1 : 0))
  return new Array<number>(stateCount(spec)).fill(0)
}

/** What state `i` must show: on (1) / off (0), or a colour for 'cycle'.
 *  A colour puzzle's is its key's, whatever the list says; every step of a
 *  sequence and every plate on. (A mirror has none of its own: −1.) */
export const targetOf = (spec: SecretSpec, i: number): number =>
  spec.kind === 'color' && spec.key !== undefined ? (spec.buttons[i]!.color === spec.key ? 1 : 0)
    : spec.kind === 'sequence' || spec.kind === 'tiles' ? 1
      : spec.kind === 'mirror' ? -1
        : (spec.target[i] ?? 0)

/** A sequence's steps done (they are done from the first on). */
export const progressOf = (state: readonly number[]): number => {
  let p = 0
  while (p < state.length && state[p]) p++
  return p
}

/**
 * A shot on button (mirror) `i`, or a step onto plate `i`: toggles it, steps
 * its colour, flips a mirror. A sequence takes the button its next step
 * wants and starts over on any other (from its first step, if that is the
 * one); a plate already lit puts every plate out before it lights again.
 * Returns the new state (1: a sequence took it), written into `state`.
 */
export const press = (spec: SecretSpec, state: number[], i: number): number => {
  if (spec.kind === 'sequence') {
    const p = progressOf(state)
    if (p < state.length && spec.target[p] === i) return (state[p] = 1)
    state.fill(0)
    if (spec.target[0] === i) return (state[0] = 1)
    return 0
  }
  if (spec.kind === 'tiles') {
    if (state[i]) state.fill(0)
    return (state[i] = 1)
  }
  const v = spec.kind === 'cycle' ? ((state[i] ?? 0) + 1) % 4 : (state[i] ? 0 : 1)
  state[i] = v
  return v
}

/** Flux stepped off the plates: they all go out. */
export const stepOff = (state: number[]): void => {
  state.fill(0)
}

/** A colour puzzle's panel: the colours its room's buttons have, in palette
 *  order. Never a colour the player cannot find. */
export const panelColors = (spec: SecretSpec): number[] =>
  [...new Set(spec.buttons.map(b => ((b.color % 4) + 4) % 4))].sort((a, b) => a - b)

/**
 * A mirror puzzle's beam: from the lamp along its wall's normal, turned by
 * each mirror it meets (state 0 sends +x to +z, 1 to −z). Writes the corners
 * (x, z pairs: the lamp, each mirror met, the target if reached) into `out`,
 * and returns whether its last leg runs into the target (the panel, from in
 * front). A leg that meets no mirror runs on to a wall (the run time finds
 * it). At most one hop per mirror: a loop ends there.
 */
export const traceBeam = (spec: SecretSpec, state: readonly number[], out?: number[]): boolean => {
  const e = spec.emitter
  const ms = spec.mirrors ?? []
  if (out) out.length = 0
  if (!e) return false
  let x = e.x
  let z = e.z
  let dx = e.nx
  let dz = e.nz
  out?.push(x, z)
  beamHeading.dx = dx
  beamHeading.dz = dz
  const P = spec.panel
  for (let hop = 0; hop <= ms.length; hop++) {
    let best = -1
    let bd = Infinity
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!
      const along = (m.x - x) * dx + (m.z - z) * dz
      if (along > 0.1 && along < bd && Math.abs((m.x - x) * dz - (m.z - z) * dx) < LINE_TOL) { bd = along; best = i }
    }
    const pa = (P.x - x) * dx + (P.z - z) * dz
    if (pa > 0.1 && pa < bd && dx * P.nx + dz * P.nz < -0.9 && Math.abs((P.x - x) * dz - (P.z - z) * dx) < LINE_TOL) {
      out?.push(P.x, P.z)
      return true
    }
    if (best < 0) return false
    const m = ms[best]!
    out?.push(m.x, m.z)
    x = m.x
    z = m.z
    const ndx = state[best] ? -dz : dz
    const ndz = state[best] ? -dx : dx
    dx = ndx
    dz = ndz
    beamHeading.dx = dx
    beamHeading.dz = dz
  }
  return false
}

/** The heading of the beam's last leg after a `traceBeam` (a shared
 *  scratch: the run time runs that leg on to a wall). */
export const beamHeading = { dx: 0, dz: 0 }

/** Every step of the panel's wish done; a mirror puzzle's beam on target. */
export const solved = (spec: SecretSpec, state: readonly number[]): boolean => {
  if (spec.kind === 'mirror') return traceBeam(spec, state)
  const n = stateCount(spec)
  for (let i = 0; i < n; i++) if ((state[i] ?? 0) !== targetOf(spec, i)) return false
  return true
}

/** Where Atlas's hint listens: each button, mirror or plate, on its floor. */
export const hintSpots = (spec: SecretSpec): Array<{ x: number; z: number; floor: number }> =>
  // (A mirror's plate stands as high over its floor as the panel over its own.)
  spec.kind === 'mirror' ? (spec.mirrors ?? []).map(m => ({ x: m.x, z: m.z, floor: m.y - (spec.panel.y - spec.prizeAt.y) }))
    : spec.kind === 'tiles' ? (spec.tiles ?? []).map(p => ({ x: p.x, z: p.z, floor: p.y }))
      : spec.buttons.map(b => ({ x: b.x, z: b.z, floor: b.y - BUTTON_Y }))

/**
 * A tiles puzzle's panel map: each plate's column (left to right as Flux
 * faces the panel) and row (row 0 nearest the panel's wall, drawn on top —
 * the far end of the floor, looking at the wall), and the grid's size.
 */
export const plateMap = (spec: SecretSpec): { slots: Array<[number, number]>; cols: number; rows: number } => {
  const P = spec.panel
  const ps = spec.tiles ?? []
  const u = ps.map(p => p.x * P.nz - p.z * P.nx)
  const v = ps.map(p => (p.x - P.x) * P.nx + (p.z - P.z) * P.nz)
  const u0 = Math.min(...u)
  const v0 = Math.min(...v)
  const slots = ps.map((_, i) => [Math.round((u[i]! - u0) / CELL), Math.round((v[i]! - v0) / CELL)] as [number, number])
  return { slots, cols: Math.max(1, ...slots.map(s => s[0] + 1)), rows: Math.max(1, ...slots.map(s => s[1] + 1)) }
}

/** The save: per secret, the states and flags (1 solved, 2 prize taken, 4
 *  Atlas's hint said). */
export type SecretsSave = Array<{ on: number[]; f: number }>

// ─── Run time ────────────────────────────────────────────────────────────────

interface SecretRt {
  spec: SecretSpec
  /** Its index in `Terrain.secrets` (the false wall's, `openSecret`'s). */
  n: number
  state: number[]
  buttons: LampMesh[]
  /** Per button (mirror, plate): the flash left (s). */
  flash: Float32Array
  /** Atlas's hint spots: x, z, floor in threes. */
  hintAt: Float32Array
  panel: LampMesh[]
  wall: Object3D | null
  wallH: number
  prize: Group
  shaft: Mesh
  shaftMat: MeshBasicMaterial
  /** The false wall's face centre (sparkle). */
  fx: number
  fz: number
  solved: boolean
  taken: boolean
  hinted: boolean
  /** Solved blink left (s); the sink's progress 0..1 (−1: not started). */
  blink: number
  sink: number
  /** A wrong shot's (a stray step's) blink left (s). */
  miss: number
  /** A sequence panel's running light (s). */
  chase: number
  /** A mirror puzzle's beam lamp; its mirrors, and each one's turn left (s). */
  lamp: Group | null
  mirrors: MirrorMesh[]
  turn: Float32Array
  /** The beam: its legs (a core and a glow each), its corners, its end. */
  legs: Mesh[]
  beam: number[]
  beamMats: MeshBasicMaterial[]
  /** A tiles puzzle's plates, and the plate Flux stands on (−1: none). */
  plates: Array<{ root: Group; lampMat: MeshBasicMaterial }>
  on: number
}

const ease = (k: number) => k * k * (3 - 2 * k)
/** A mirror's plate yaw for its state (its plane along (1, ±1)). */
const mirrorYaw = (o: number): number => (o ? Math.PI / 4 : -Math.PI / 4)

/** Segment (a → b) within `r` of point c. */
export const segNear = (
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, r: number
): boolean => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const l2 = dx * dx + dy * dy + dz * dz
  let t = l2 > 1e-9 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const ex = ax + dx * t - cx
  const ey = ay + dy * t - cy
  const ez = az + dz * t - cz
  return ex * ex + ey * ey + ez * ez < r * r
}

export class SecretsFeature implements StageFeature {
  readonly list: SecretRt[] = []
  private host: ClimbHost
  private run: StageRun
  private t: Terrain

  constructor(host: ClimbHost, t: Terrain, run: StageRun) {
    this.host = host
    this.run = run
    this.t = t
    const th = host.theme
    const walls = host.level.secretWalls
    ;(t.secrets ?? []).forEach((spec, n) => {
      const buttons = spec.buttons.map((b) => {
        const m = buildButton(th)
        m.root.position.set(b.x, b.y, b.z)
        m.root.rotation.y = Math.atan2(b.nx, b.nz)
        host.propParent(b.x, b.z).add(m.root)
        return m
      })
      // The panel: one lamp per button (a colour puzzle: one per colour in
      // the room; a sequence: one per step; plates: their map; a mirror
      // puzzle: the beam's target).
      const P = spec.panel
      const panel = spec.kind === 'sequence' ? buildSequencePanel(th, spec.target.length)
        : spec.kind === 'mirror' ? buildBeamTarget(th)
          : spec.kind === 'tiles' ? (() => { const m = plateMap(spec); return buildMapPanel(th, m.slots, m.cols, m.rows) })()
            : buildPanel(th, spec.kind === 'color' ? panelColors(spec).length : spec.buttons.length)
      panel.root.position.set(P.x, P.y, P.z)
      panel.root.rotation.y = Math.atan2(P.nx, P.nz)
      host.propParent(P.x, P.z).add(panel.root)
      this.paintPanel(spec, panel.lamps, P.nx, P.nz)

      // The false wall's face, its height, and a colour puzzle's frame on it.
      const face = secretDoorFace(host.map, spec)
      const fx = face.di ? (face.i + (face.di > 0 ? 1 : 0)) * CELL : (face.i + 0.5) * CELL
      const fz = face.dj ? (face.j + (face.dj > 0 ? 1 : 0)) * CELL : (face.j + 0.5) * CELL
      const y = spec.prizeAt.y
      const wall = walls?.[n] ?? null
      const wallH = (t.wallTop[spec.room] ?? y + 5) - y + 0.3
      if (spec.kind === 'color' && spec.key !== undefined) {
        const frame = buildKeyFrame(spec.key, CELL - 0.55, 2.7)
        frame.position.set(fx + face.di * 0.2, y, fz + face.dj * 0.2)
        frame.rotation.y = Math.atan2(face.di, face.dj)
        // On the wall itself, so it sinks with it.
        ;(wall ?? host.propParent(fx, fz)).add(frame)
      }

      // A mirror puzzle: the beam lamp, the mirrors (solid posts), the beam.
      const mirrors: MirrorMesh[] = []
      let lamp: Group | null = null
      const legs: Mesh[] = []
      const beamMats: MeshBasicMaterial[] = []
      if (spec.kind === 'mirror' && spec.emitter) {
        const e = spec.emitter
        lamp = buildBeamLamp(th)
        lamp.position.set(e.x, e.y, e.z)
        lamp.rotation.y = Math.atan2(e.nx, e.nz)
        host.propParent(e.x, e.z).add(lamp)
        for (const m of spec.mirrors ?? []) {
          const floor = t.floor[Math.floor(m.z / CELL) * host.map.w + Math.floor(m.x / CELL)] ?? m.y - 1.5
          const mm = buildMirror(th, m.y - floor)
          mm.root.position.set(m.x, floor, m.z)
          host.propParent(m.x, m.z).add(mm.root)
          host.nav.props.push({ x: m.x, z: m.z, r: POST_R, active: true })
          mirrors.push(mm)
        }
        const core = beamMaterial(0.95)
        const glow = beamMaterial(0.28)
        beamMats.push(core, glow)
        for (let i = 0; i <= mirrors.length; i++) {
          for (const [mat, w] of [[core, 0.07], [glow, 0.24]] as const) {
            const leg = buildBeamLeg(mat, w)
            leg.visible = false
            leg.renderOrder = 2
            host.propParent(e.x, e.z).add(leg)
            legs.push(leg)
          }
        }
      }
      // A tiles puzzle: the plates.
      const plates = (spec.kind === 'tiles' ? spec.tiles ?? [] : []).map((p) => {
        const plate = buildFloorPlate(th)
        plate.root.position.set(p.x, p.y, p.z)
        host.propParent(p.x, p.z).add(plate.root)
        return plate
      })

      const prize = buildPrize(spec.prize)
      prize.position.set(spec.prizeAt.x, y + PRIZE_HOVER, spec.prizeAt.z)
      prize.visible = false
      host.propParent(spec.prizeAt.x, spec.prizeAt.z).add(prize)
      const shaft = buildLightShaft()
      shaft.root.position.set(spec.prizeAt.x, y, spec.prizeAt.z)
      shaft.root.visible = false
      host.propParent(spec.prizeAt.x, spec.prizeAt.z).add(shaft.root)

      const spots = hintSpots(spec)
      const pieces = pressCount(spec)
      const rt: SecretRt = {
        spec, n, state: initialState(spec), buttons, flash: new Float32Array(pieces),
        hintAt: Float32Array.from(spots.flatMap(s => [s.x, s.z, s.floor])),
        panel: panel.lamps, wall, wallH, prize, shaft: shaft.root, shaftMat: shaft.mat, fx, fz,
        solved: false, taken: false, hinted: false, blink: 0, sink: -1, miss: 0, chase: 0,
        lamp, mirrors, turn: new Float32Array(mirrors.length), legs, beam: [], beamMats, plates, on: -1
      }
      for (let i = 0; i < mirrors.length; i++) mirrors[i]!.pivot.rotation.y = mirrorYaw(rt.state[i]!)
      this.paintAll(rt)
      this.list.push(rt)
    })
  }

  // ─── Looks ─────────────────────────────────────────────────────────────────

  /** The panel shows the target, left to right as the buttons stand seen
   *  from in front of it (along its right-hand axis: (nz, −nx)). */
  private paintPanel(spec: SecretSpec, lamps: LampMesh[], nx: number, nz: number): void {
    if (spec.kind === 'color') {
      const colors = panelColors(spec)
      lamps.forEach((l, slot) => {
        const c = colors[slot]!
        const lit = c === spec.key
        l.icon.geometry = iconGeometry(c)
        // Only the key reads at a glance: it is lit in its colour. The others
        // are lamps switched OFF (dark, their icon a faint trace of their
        // colour): "these stay off", not three more answers. A Sky Docks
        // playtester could not tell which colour the hint meant.
        if (lit) {
          setLamp(l.lampMat, LAMP.colors[c]!)
          l.iconMat.color.copy(LAMP.dark)
        } else {
          setLamp(l.lampMat, LAMP.off, 0.6)
          l.iconMat.color.copy(LAMP.colors[c]!).multiplyScalar(0.35)
        }
      })
      return
    }
    // The later kinds' panels change as they are played (`paintAll`).
    if (spec.kind === 'sequence') {
      lamps.forEach((l, s) => { l.icon.geometry = iconGeometry(spec.buttons[spec.target[s]!]!.color) })
      return
    }
    if (spec.kind === 'mirror' || spec.kind === 'tiles') return
    const order = spec.buttons.map((_, i) => i)
    order.sort((a, b) => {
      const A = spec.buttons[a]!
      const B = spec.buttons[b]!
      return (A.x * nz - A.z * nx) - (B.x * nz - B.z * nx) || a - b
    })
    lamps.forEach((l, slot) => {
      const want = targetOf(spec, order[slot]!)
      if (spec.kind === 'lights') {
        setLamp(l.lampMat, want ? LAMP.on : LAMP.off)
        l.icon.visible = false
      } else {
        setLamp(l.lampMat, LAMP.colors[want]!)
        l.icon.geometry = iconGeometry(want)
      }
    })
  }

  /** Everything of a secret that shows its state. */
  private paintAll(rt: SecretRt): void {
    for (let i = 0; i < rt.buttons.length; i++) this.paintButton(rt, i)
    const kind = rt.spec.kind
    if (kind === 'sequence') this.paintSequence(rt)
    else if (kind === 'tiles') this.paintPlates(rt)
    else if (kind === 'mirror') this.paintBeam(rt)
  }

  private paintButton(rt: SecretRt, i: number): void {
    const m = rt.buttons[i]!
    const w = rt.flash[i]! > 0 ? rt.flash[i]! / FLASH_T : 0
    const kind = rt.spec.kind
    if (rt.solved) {
      // Solved: green, blinking at first.
      const on = rt.blink <= 0 || Math.floor(rt.blink * 8) % 2 === 0
      setLamp(m.lampMat, LAMP.solved, on ? 1 : 0.35, w)
      m.icon.visible = false
      return
    }
    const v = rt.state[i]!
    if (kind === 'lights') {
      setLamp(m.lampMat, v ? LAMP.on : LAMP.off, 1, w)
      m.icon.visible = false
    } else if (kind === 'color' || kind === 'sequence') {
      // (A sequence's buttons are its colours at rest: the panel keeps the score.)
      const c = rt.spec.buttons[i]!.color
      const lit = kind === 'color' && v
      setLamp(m.lampMat, LAMP.colors[c]!, lit ? 1 : kind === 'sequence' ? DIM * 2 : DIM, w)
      m.icon.geometry = iconGeometry(c)
      m.iconMat.color.copy(lit ? LAMP.dark : LAMP.colors[c]!)
    } else {
      setLamp(m.lampMat, LAMP.colors[v]!, 1, w)
      m.icon.geometry = iconGeometry(v)
    }
  }

  /** A sequence's panel: the steps done lit, a light running along the rest
   *  (one step, then the next), all dark a moment after a wrong shot. */
  private paintSequence(rt: SecretRt): void {
    const spec = rt.spec
    const done = progressOf(rt.state)
    const n = spec.target.length
    const at = Math.floor(rt.chase / CHASE_STEP) % (n + CHASE_REST)
    for (let s = 0; s < rt.panel.length; s++) {
      const l = rt.panel[s]!
      const c = spec.buttons[spec.target[s]!]!.color
      if (rt.solved) {
        const on = rt.blink <= 0 || Math.floor(rt.blink * 8) % 2 === 0
        setLamp(l.lampMat, LAMP.solved, on ? 1 : 0.35)
        l.iconMat.color.copy(LAMP.dark)
      } else if (rt.miss > 0) {
        setLamp(l.lampMat, LAMP.off, 0.6)
        l.iconMat.color.copy(LAMP.colors[c]!).multiplyScalar(0.35)
      } else if (s < done || s === at) {
        setLamp(l.lampMat, LAMP.colors[c]!, s < done ? 1 : 0.8)
        l.iconMat.color.copy(LAMP.dark)
      } else {
        setLamp(l.lampMat, LAMP.colors[c]!, DIM)
        l.iconMat.color.copy(LAMP.colors[c]!)
      }
    }
  }

  /** A tiles puzzle: each plate (and its lamp on the panel's map) lit or
   *  dark; red a moment when they all went out; green solved. */
  private paintPlates(rt: SecretRt): void {
    for (let i = 0; i < rt.plates.length; i++) {
      const w = rt.flash[i]! > 0 ? rt.flash[i]! / FLASH_T : 0
      const c = rt.solved ? LAMP.solved : rt.miss > 0 ? LAMP.colors[0]! : rt.state[i] ? LAMP.on : LAMP.off
      const k = rt.miss > 0 && !rt.solved ? 0.5 : 1
      setLamp(rt.plates[i]!.lampMat, c, k, w)
      const l = rt.panel[i]
      if (l) setLamp(l.lampMat, c, k)
    }
  }

  /** A mirror puzzle: the beam along its corners to a wall (or the target),
   *  the target lit when it is reached. */
  private paintBeam(rt: SecretRt): void {
    const spec = rt.spec
    const e = spec.emitter
    if (!e) return
    const pts = rt.beam
    const hit = traceBeam(spec, rt.state, pts)
    if (!hit && pts.length >= 2) {
      // On from the last corner to whatever stops it.
      const n = pts.length
      const dx = beamHeading.dx
      const dz = beamHeading.dz
      const d = this.beamReach(rt, pts[n - 2]!, pts[n - 1]!, dx, dz, e.y)
      pts.push(pts[n - 2]! + dx * d, pts[n - 1]! + dz * d)
    }
    const legs = rt.legs
    // Leg c (a core and a glow) runs from corner c to corner c + 1.
    for (let i = 0; i < legs.length; i++) {
      const a = (i >> 1) * 2
      const leg = legs[i]!
      leg.visible = a + 3 < pts.length
      if (!leg.visible) continue
      const ax = pts[a]!
      const az = pts[a + 1]!
      const bx = pts[a + 2]!
      const bz = pts[a + 3]!
      leg.position.set(ax, e.y, az)
      leg.rotation.y = Math.atan2(bx - ax, bz - az)
      leg.scale.z = Math.max(0.01, Math.hypot(bx - ax, bz - az))
    }
    const l = rt.panel[0]
    if (l) setLamp(l.lampMat, hit ? (rt.solved ? LAMP.solved : LAMP.beam) : LAMP.beam, hit ? 1 : DIM)
  }

  /** How far a beam from (x, z) heading (dx, dz) runs before a wall, a
   *  floor over its height, the sealed alcove or the room's edge stops it
   *  (m). */
  private beamReach(rt: SecretRt, x: number, z: number, dx: number, dz: number, y: number): number {
    const map = this.host.map
    const t = this.t
    let i = Math.floor(x / CELL)
    let j = Math.floor(z / CELL)
    for (let n = 0; n < 40; n++) {
      const ni = i + dx
      const nj = j + dz
      const k = nj * map.w + ni
      const blocked = ni < 0 || nj < 0 || ni >= map.w || nj >= map.h || map.cell[k] === Cell.Void ||
        map.room[k] !== rt.spec.room || rt.spec.cells.includes(k) || (!t.pit[k] && t.floor[k]! > y - 0.3)
      if (blocked) {
        // The face between (i, j) and the next cell, a hair short of it.
        const fx = dx > 0 ? (i + 1) * CELL : dx < 0 ? i * CELL : x
        const fz = dz > 0 ? (j + 1) * CELL : dz < 0 ? j * CELL : z
        return Math.max(0, Math.abs(fx - x) + Math.abs(fz - z) - 0.08)
      }
      i = ni
      j = nj
    }
    return 40 * CELL
  }

  // ─── Shots ─────────────────────────────────────────────────────────────────

  /** A player shot's step: the first button of an unsolved secret its path
   *  passes (from in front of the button's wall), or a mirror's plate, is
   *  pressed, and the shot ends there. */
  shot(s: Shot): boolean {
    const r = BUTTON_R + s.radius + HIT_GRACE
    for (const rt of this.list) {
      if (rt.solved) continue
      const ms = rt.spec.mirrors
      if (rt.spec.kind === 'mirror' && ms) {
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i]!
          if (!segNear(s.px, s.py, s.pz, s.x, s.y, s.z, m.x, m.y, m.z, MIRROR_R + s.radius)) continue
          this.hit(rt, i)
          return true
        }
        continue
      }
      const bs = rt.spec.buttons
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]!
        // Only from the room's side of the wall.
        if ((s.px - b.x) * b.nx + (s.pz - b.z) * b.nz < -0.05) continue
        if (!segNear(s.px, s.py, s.pz, s.x, s.y, s.z, b.x, b.y, b.z, r)) continue
        this.hit(rt, i)
        return true
      }
    }
    return false
  }

  /** Button (mirror) `i` of `rt` struck — or plate `i` stepped on: toggle,
   *  click, flash — and maybe solved. */
  hit(rt: SecretRt, i: number): void {
    if (rt.solved) return
    const spec = rt.spec
    const h = this.host
    const before = progressOf(rt.state)
    const was = rt.state[i]
    press(spec, rt.state, i)
    rt.flash[i] = FLASH_T
    if (spec.kind === 'mirror') {
      const m = spec.mirrors![i]!
      rt.turn[i] = TURN_T
      h.sfx('trapClick', m.x, m.z)
      h.fx.sparks(m.x, m.y + 0.45, m.z, '#cfe8ff', 6, 3, 0.12)
    } else if (spec.kind === 'tiles') {
      const p = spec.tiles![i]!
      if (was) this.missed(rt, p.x, p.z)
      else h.sfx('uiClick', p.x, p.z)
    } else {
      const b = spec.buttons[i]!
      // A sequence's wrong button: a buzz, and the panel starts over.
      if (spec.kind === 'sequence' && progressOf(rt.state) !== before + 1) this.missed(rt, b.x, b.z)
      else h.sfx('uiClick', b.x, b.z)
      h.fx.sparks(b.x + b.nx * 0.15, b.y, b.z + b.nz * 0.15, '#ffffff', 6, 3, 0.12)
    }
    this.paintAll(rt)
    if (solved(spec, rt.state)) this.solve(rt)
  }

  private missed(rt: SecretRt, x: number, z: number): void {
    rt.miss = MISS_T
    rt.chase = 0
    this.host.sfx('denied', x, z)
  }

  private solve(rt: SecretRt): void {
    rt.solved = true
    rt.blink = SOLVED_BLINK
    rt.sink = 0
    rt.miss = 0
    const h = this.host
    this.paintAll(rt)
    h.sfx('relayChime', rt.fx, rt.fz)
    h.sfx('door', rt.fx, rt.fz)
    h.fx.sparks(rt.fx, rt.spec.prizeAt.y + 1.4, rt.fz, '#fff2a8', 24, 5, 0.18)
    h.say('secret.solved')
  }

  // ─── Per step ──────────────────────────────────────────────────────────────

  update(dt: number, time: number, p: ClimbBody, playing: boolean): void {
    for (const rt of this.list) {
      if (!rt.hinted && !rt.solved && playing) this.hint(rt, p)
      const kind = rt.spec.kind
      if (kind === 'tiles' && !rt.solved && playing) this.walk(rt, p)
      let paint = false
      for (let i = 0; i < rt.flash.length; i++) {
        if (rt.flash[i]! <= 0) continue
        rt.flash[i] = Math.max(0, rt.flash[i]! - dt)
        if (i < rt.buttons.length) this.paintButton(rt, i)
        paint = true
      }
      for (let i = 0; i < rt.turn.length; i++) {
        const left = rt.turn[i]!
        const pv = rt.mirrors[i]!.pivot
        const to = mirrorYaw(rt.state[i]!)
        if (left <= 0) { pv.rotation.y = to; continue }
        rt.turn[i] = Math.max(0, left - dt)
        pv.rotation.y = to + (mirrorYaw(1 - rt.state[i]!) - to) * ease(rt.turn[i]! / TURN_T)
      }
      if (rt.miss > 0) {
        rt.miss = Math.max(0, rt.miss - dt)
        paint = true
      }
      if (kind === 'sequence' && !rt.solved) {
        const was = Math.floor(rt.chase / CHASE_STEP)
        rt.chase += dt
        if (Math.floor(rt.chase / CHASE_STEP) !== was) paint = true
      }
      if (kind === 'mirror' && rt.beamMats.length) {
        rt.beamMats[1]!.opacity = 0.24 + Math.sin(time * 7 + rt.n) * 0.06
      }
      if (paint && kind !== 'mirror') {
        if (kind === 'sequence') this.paintSequence(rt)
        else if (kind === 'tiles') this.paintPlates(rt)
      }
      if (!rt.solved) continue
      if (rt.blink > 0) {
        rt.blink = Math.max(0, rt.blink - dt)
        this.paintAll(rt)
      }
      if (rt.sink >= 0 && rt.sink < 1) this.sinkWall(rt, dt)
      if (rt.taken || rt.sink < 1) continue
      // The prize turns and bobs in its shaft of light until it is taken.
      const y = rt.spec.prizeAt.y
      rt.prize.rotation.y += dt * 1.6
      blinkRepairKit(rt.prize, time)
      rt.prize.position.y = y + PRIZE_HOVER + Math.sin(time * 2.4 + rt.n) * 0.1
      rt.shaftMat.opacity = 0.24 + Math.sin(time * 2.2 + rt.n) * 0.08
      if (!playing || Math.abs(p.y - y) > PRIZE_DY) continue
      const dx = p.x - rt.spec.prizeAt.x
      const dz = p.z - rt.spec.prizeAt.z
      if (dx * dx + dz * dz < PRIZE_R * PRIZE_R) this.take(rt)
    }
  }

  /** A tiles puzzle: the plate under Flux's feet (in the air nothing
   *  changes). A new plate is pressed; stepping off them puts them out. */
  private walk(rt: SecretRt, p: ClimbBody): void {
    if (!p.ground) return
    const ps = rt.spec.tiles ?? []
    let on = -1
    for (let i = 0; i < ps.length; i++) {
      const t = ps[i]!
      if (Math.abs(p.x - t.x) < PLATE_REACH && Math.abs(p.z - t.z) < PLATE_REACH && Math.abs(p.y - t.y) < PLATE_DY) { on = i; break }
    }
    if (on === rt.on) return
    const from = rt.on
    rt.on = on
    if (on >= 0) { this.hit(rt, on); return }
    if (from < 0 || !rt.state.some(v => v)) return
    stepOff(rt.state)
    const t = ps[from]!
    this.missed(rt, t.x, t.z)
    this.paintPlates(rt)
  }

  /** Atlas's one line for this kind of puzzle, near a button on its floor. */
  private hint(rt: SecretRt, p: ClimbBody): void {
    // Only from inside the puzzle's room: 7 m reaches through a wall, and the
    // line used to come from the room before (playtest 2026-10-11, the Tide
    // stage's Spillway below the Pump room's east wall).
    const map = this.host.map
    const ci = Math.floor(p.x / CELL)
    const cj = Math.floor(p.z / CELL)
    if (ci < 0 || cj < 0 || ci >= map.w || cj >= map.h || map.room[cj * map.w + ci] !== rt.spec.room) return
    const at = rt.hintAt
    for (let i = 0; i < at.length; i += 3) {
      if (Math.abs(p.y - at[i + 2]!) > HINT_DY) continue
      const dx = p.x - at[i]!
      const dz = p.z - at[i + 1]!
      if (dx * dx + dz * dz > HINT_R * HINT_R) continue
      rt.hinted = true
      this.host.say(`secret.${rt.spec.kind}`)
      return
    }
  }

  /** The false wall sinks into the floor; at the bottom it is gone and the
   *  alcove opens to bodies and paths. */
  private sinkWall(rt: SecretRt, dt: number): void {
    rt.sink = Math.min(1, rt.sink + dt / SINK_T)
    if (rt.wall) rt.wall.position.y = -ease(rt.sink) * rt.wallH
    if (rt.sink < 1) return
    this.run.openSecret(rt.n)
    this.showPrize(rt)
    this.host.fx.riseRing(rt.spec.prizeAt.x, rt.spec.prizeAt.y + 0.1, rt.spec.prizeAt.z, '#fff2a8', 0.8, 18)
  }

  private showPrize(rt: SecretRt): void {
    rt.prize.visible = !rt.taken
    rt.shaft.visible = !rt.taken
  }

  private take(rt: SecretRt): void {
    rt.taken = true
    this.showPrize(rt)
    const a = rt.spec.prizeAt
    const h = this.host
    h.fx.riseRing(a.x, a.y + 0.2, a.z, '#8dff7a', 0.8, 18)
    h.fx.sparks(a.x, a.y + PRIZE_HOVER, a.z, '#fff2a8', 16, 4, 0.16)
    if (rt.spec.prize === 'hp' || !h.secretPrize) h.onPickup('hpBig', 0)
    else h.secretPrize(rt.spec.prize, a.x, a.y, a.z)
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  save(): SecretsSave {
    return this.list.map(rt => ({
      on: rt.state.slice(), f: (rt.solved ? 1 : 0) | (rt.taken ? 2 : 0) | (rt.hinted ? 4 : 0)
    }))
  }

  /** A resumed stage: the buttons (mirrors) as they were — a tiles puzzle's
   *  plates out, Flux is back off them; a solved secret open (its wall
   *  gone, quietly), its prize still waiting unless taken. */
  restore(s: unknown): void {
    if (!Array.isArray(s)) return
    this.list.forEach((rt, n) => {
      const e = s[n] as { on?: unknown; f?: unknown } | undefined
      if (!e || typeof e !== 'object') return
      if (Array.isArray(e.on)) {
        for (let i = 0; i < rt.state.length; i++) {
          const v = Math.round(Number(e.on[i]))
          if (Number.isFinite(v)) rt.state[i] = rt.spec.kind === 'cycle' ? ((v % 4) + 4) % 4 : v ? 1 : 0
        }
      }
      const f = typeof e.f === 'number' ? e.f : 0
      rt.hinted = (f & 4) !== 0
      rt.taken = (f & 2) !== 0
      if (f & 1) {
        rt.solved = true
        rt.blink = 0
        rt.sink = 1
        if (rt.wall) rt.wall.position.y = -rt.wallH
        this.run.openSecret(rt.n)
        this.showPrize(rt)
      } else if (rt.spec.kind === 'tiles') stepOff(rt.state)
      rt.flash.fill(0)
      rt.turn.fill(0)
      rt.miss = 0
      rt.on = -1
      for (let i = 0; i < rt.mirrors.length; i++) rt.mirrors[i]!.pivot.rotation.y = mirrorYaw(rt.state[i]!)
      this.paintAll(rt)
    })
  }

  /** Solved (for tests and the HUD). */
  isSolved(n: number): boolean {
    return !!this.list[n]?.solved
  }
}
