import type { Group, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { CELL, type SecretSpec, type Terrain } from '../world/levelGen'
import { BUTTON_Y, secretDoorFace } from '../world/stages/builder'
import {
  buildButton, buildPanel, buildKeyFrame, buildPrize, buildLightShaft, iconGeometry, setLamp, blinkRepairKit,
  BUTTON_R, DIM, LAMP, type LampMesh
} from '../models/secretProps'
import type { ClimbBody, ClimbHost } from './climb'
import type { StageFeature, StageRun } from './stageFeatures'
import type { Shot } from './world'

/**
 * ─── Secrets: shoot the buttons, open the wall ───────────────────────────────
 *
 * A secret (`SecretSpec`, placed with `Builder.secret`) is a few round lamp
 * BUTTONS on the walls, a HINT PANEL beside a striped false wall, and a
 * sealed alcove behind it with a prize. Any player shot toggles the button
 * it strikes (once: the shot ends on it). Three puzzles, each readable from
 * the panel alone by a ten-year-old:
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
 * The panel's lamps go left to right as Flux sees the buttons facing the
 * panel (sorted along the panel's own right-hand axis), so a mirrored map
 * reads the same. Every colour carries its own icon (● ▲ ■ ◆,
 * `models/secretProps.ts`): the puzzles never rest on colour alone.
 *
 * No penalty for a wrong state. Each hit clicks and flashes its lamp. Solved:
 * a chime, every button blinks green, the false wall sinks into the floor
 * over SINK_T (then `ClimbRun.openSecret` lets bodies and paths in), a
 * sparkle, and a shaft of light stands over the prize until it is taken —
 * 'tank' a Repair Gel even over the cap, 'hp' a big heal, 'weapon' /
 * 'power' a borrowed Core Master weapon (`ClimbHost.secretPrize`).
 *
 * No glyphs or lessons: the first time Flux comes within HINT_R of a
 * secret's buttons on their floor, Atlas says one cryptic line for its kind
 * (`secret.lights|color|cycle`), and `secret.solved` when one opens.
 *
 * The puzzle rules are the pure `press` / `solved`; the save is each
 * secret's button states and flags. Nothing allocates per step.
 */

/** The wall's sink (s), the solved blink (s), a hit's flash (s). */
export const SINK_T = 1
const SOLVED_BLINK = 1.4
const FLASH_T = 0.18
/** Atlas's hint: this near a button (m), within this of its floor (m). */
export const HINT_R = 7
const HINT_DY = 1.5
/** A shot's grace on a button's radius (m): a kid's aim is forgiven. */
const HIT_GRACE = 0.12
/** Taking the prize: plan-view reach and height (m). */
const PRIZE_R = 1.1
const PRIZE_DY = 1
const PRIZE_HOVER = 0.85

// ─── The puzzle (pure) ───────────────────────────────────────────────────────

/** The states the buttons start in: all off, a cycle button on its own
 *  colour. */
export const initialState = (spec: SecretSpec): number[] =>
  spec.buttons.map(b => (spec.kind === 'cycle' ? ((b.color % 4) + 4) % 4 : 0))

/** What button `i` must show: on (1) / off (0), or a colour for 'cycle'.
 *  A colour puzzle's is its key's, whatever the list says. */
export const targetOf = (spec: SecretSpec, i: number): number =>
  spec.kind === 'color' && spec.key !== undefined ? (spec.buttons[i]!.color === spec.key ? 1 : 0) : (spec.target[i] ?? 0)

/** A shot on button `i`: toggles it, or steps its colour. Returns its new
 *  state (and writes it into `state`). */
export const press = (spec: SecretSpec, state: number[], i: number): number => {
  const v = spec.kind === 'cycle' ? ((state[i] ?? 0) + 1) % 4 : (state[i] ? 0 : 1)
  state[i] = v
  return v
}

/** A colour puzzle's panel: the colours its room's buttons have, in palette
 *  order. Never a colour the player cannot find. */
export const panelColors = (spec: SecretSpec): number[] =>
  [...new Set(spec.buttons.map(b => ((b.color % 4) + 4) % 4))].sort((a, b) => a - b)

/** Every button shows what the panel asks for. */
export const solved = (spec: SecretSpec, state: readonly number[]): boolean => {
  for (let i = 0; i < spec.buttons.length; i++) if ((state[i] ?? 0) !== targetOf(spec, i)) return false
  return true
}

/** The save: per secret, the button states and flags (1 solved, 2 prize
 *  taken, 4 Atlas's hint said). */
export type SecretsSave = Array<{ on: number[]; f: number }>

// ─── Run time ────────────────────────────────────────────────────────────────

interface SecretRt {
  spec: SecretSpec
  /** Its index in `Terrain.secrets` (the false wall's, `openSecret`'s). */
  n: number
  state: number[]
  buttons: LampMesh[]
  /** Per button: the flash left (s). */
  flash: Float32Array
  /** Per button: its floor (for Atlas's hint). */
  floorY: Float32Array
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
}

const ease = (k: number) => k * k * (3 - 2 * k)

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

  constructor(host: ClimbHost, t: Terrain, run: StageRun) {
    this.host = host
    this.run = run
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
      // The panel: one lamp per button (a colour puzzle: one per colour in the room).
      const P = spec.panel
      const panel = buildPanel(th, spec.kind === 'color' ? panelColors(spec).length : spec.buttons.length)
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

      const prize = buildPrize(spec.prize)
      prize.position.set(spec.prizeAt.x, y + PRIZE_HOVER, spec.prizeAt.z)
      prize.visible = false
      host.propParent(spec.prizeAt.x, spec.prizeAt.z).add(prize)
      const shaft = buildLightShaft()
      shaft.root.position.set(spec.prizeAt.x, y, spec.prizeAt.z)
      shaft.root.visible = false
      host.propParent(spec.prizeAt.x, spec.prizeAt.z).add(shaft.root)

      const rt: SecretRt = {
        spec, n, state: initialState(spec), buttons, flash: new Float32Array(spec.buttons.length),
        floorY: Float32Array.from(spec.buttons, b => b.y - BUTTON_Y),
        panel: panel.lamps, wall, wallH, prize, shaft: shaft.root, shaftMat: shaft.mat, fx, fz,
        solved: false, taken: false, hinted: false, blink: 0, sink: -1
      }
      for (let i = 0; i < buttons.length; i++) this.paintButton(rt, i)
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
    } else if (kind === 'color') {
      const c = rt.spec.buttons[i]!.color
      setLamp(m.lampMat, LAMP.colors[c]!, v ? 1 : DIM, w)
      m.icon.geometry = iconGeometry(c)
      m.iconMat.color.copy(v ? LAMP.dark : LAMP.colors[c]!)
    } else {
      setLamp(m.lampMat, LAMP.colors[v]!, 1, w)
      m.icon.geometry = iconGeometry(v)
    }
  }

  // ─── Shots ─────────────────────────────────────────────────────────────────

  /** A player shot's step: the first button of an unsolved secret its path
   *  passes (from in front of the button's wall) is pressed, and the shot
   *  ends there. */
  shot(s: Shot): boolean {
    const r = BUTTON_R + s.radius + HIT_GRACE
    for (const rt of this.list) {
      if (rt.solved) continue
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

  /** Button `i` of `rt` struck: toggle, click, flash — and maybe solved. */
  hit(rt: SecretRt, i: number): void {
    if (rt.solved) return
    const b = rt.spec.buttons[i]!
    press(rt.spec, rt.state, i)
    rt.flash[i] = FLASH_T
    this.paintButton(rt, i)
    const h = this.host
    h.sfx('uiClick', b.x, b.z)
    h.fx.sparks(b.x + b.nx * 0.15, b.y, b.z + b.nz * 0.15, '#ffffff', 6, 3, 0.12)
    if (solved(rt.spec, rt.state)) this.solve(rt)
  }

  private solve(rt: SecretRt): void {
    rt.solved = true
    rt.blink = SOLVED_BLINK
    rt.sink = 0
    const h = this.host
    for (let i = 0; i < rt.buttons.length; i++) this.paintButton(rt, i)
    h.sfx('relayChime', rt.fx, rt.fz)
    h.sfx('door', rt.fx, rt.fz)
    h.fx.sparks(rt.fx, rt.spec.prizeAt.y + 1.4, rt.fz, '#fff2a8', 24, 5, 0.18)
    h.say('secret.solved')
  }

  // ─── Per step ──────────────────────────────────────────────────────────────

  update(dt: number, time: number, p: ClimbBody, playing: boolean): void {
    for (const rt of this.list) {
      if (!rt.hinted && !rt.solved && playing) this.hint(rt, p)
      for (let i = 0; i < rt.flash.length; i++) {
        if (rt.flash[i]! <= 0) continue
        rt.flash[i] = Math.max(0, rt.flash[i]! - dt)
        this.paintButton(rt, i)
      }
      if (!rt.solved) continue
      if (rt.blink > 0) {
        rt.blink = Math.max(0, rt.blink - dt)
        for (let i = 0; i < rt.buttons.length; i++) this.paintButton(rt, i)
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

  /** Atlas's one line for this kind of puzzle, near a button on its floor. */
  private hint(rt: SecretRt, p: ClimbBody): void {
    const bs = rt.spec.buttons
    for (let i = 0; i < bs.length; i++) {
      if (Math.abs(p.y - rt.floorY[i]!) > HINT_DY) continue
      const dx = p.x - bs[i]!.x
      const dz = p.z - bs[i]!.z
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

  /** A resumed stage: the buttons as they were; a solved secret open (its
   *  wall gone, quietly), its prize still waiting unless taken. */
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
      }
      rt.flash.fill(0)
      for (let i = 0; i < rt.buttons.length; i++) this.paintButton(rt, i)
    })
  }

  /** Solved (for tests and the HUD). */
  isSolved(n: number): boolean {
    return !!this.list[n]?.solved
  }
}
