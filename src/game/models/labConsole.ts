import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type BufferGeometry } from 'three'
import { rbox, rcyl, sph, cap, xform, paint } from './kit'

/**
 * ─── The lab's two workstations (`sim/hub.ts` buildLabSet) ───────────────────
 *
 * Either side of the teleporter, a desk Gauss works at: a cabinet, a desk top
 * with a keyboard of real keys, and a monitor on a neck, tilted back a touch.
 * One screen types code line by line, the other runs a dashboard (a radar's
 * sweep, bars, a trace, a gauge), both drawn into canvases and redrawn a few
 * times a second (`tickLabScreens`), the way real displays update.
 *
 * Built in a desk's own frame (it faces +z, its foot on the floor at the
 * origin) so a test can check its faces; `buildLabConsole` places one.
 */

/** The desk top: its tilt toward the operator, its middle. */
const DECK_TILT = 0.18
const DECK_AT: [number, number, number] = [0, 0.86, 0.22]
/** The monitor: its middle, its tilt back, the bezel's size. */
const MON_AT: [number, number, number] = [0, 1.62, -0.3]
const MON_TILT = -0.12
const BEZEL_W = 1.38
const BEZEL_H = 0.76
const BEZEL_D = 0.09
/** The screen: its size, and how far it stands proud of the bezel's face
 *  (centimetres, so the two never fight at the lab's distances). */
export const SCREEN_W = 1.24
export const SCREEN_H = 0.62
export const SCREEN_PROUD = 0.016

const BODY = '#3b4458'
const DARK = '#1d2438'
const KEY = '#c9d3e6'

/** Something on the desk top: placed in the deck's frame (its top at y 0.04). */
const onDeck = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry =>
  xform(xform(g, [x, y, z]), DECK_AT, [DECK_TILT, 0, 0])

/** Something on the monitor: placed in the bezel's frame (its face at z +BEZEL_D/2). */
const onMonitor = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry =>
  xform(xform(g, [x, y, z]), MON_AT, [MON_TILT, 0, 0])

/** One desk's parts in its own frame: toon (lit) and glow (self-lit). */
export const labConsoleParts = (accent: string): { toon: BufferGeometry[]; glow: BufferGeometry[] } => {
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  // The cabinet, its vents and its status lights.
  toon.push(xform(paint(rbox(1.5, 0.82, 0.62, 0.15), BODY), [0, 0.41, -0.12]))
  for (let k = 0; k < 3; k++) toon.push(xform(paint(rbox(0.9, 0.05, 0.04, 0.4), DARK), [-0.12, 0.22 + k * 0.1, 0.2]))
  for (let k = 0; k < 3; k++) glow.push(xform(paint(sph(0.025, 8, 6), k === 1 ? '#ffd84a' : accent), [0.48 + k * 0.08, 0.6, 0.195]))
  // The desk top, tilted toward the operator, overhanging the cabinet.
  toon.push(xform(paint(rbox(1.56, 0.08, 0.52, 0.2), '#2f3850'), DECK_AT, [DECK_TILT, 0, 0]))
  // The keyboard: a plate, four rows of keys, a long bar, a lit key or two.
  toon.push(onDeck(paint(rbox(1.0, 0.035, 0.34, 0.3), DARK), -0.12, 0.05, 0.02))
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      const x = -0.12 + (col - 5.5) * 0.078 + (row % 2) * 0.02
      const z = -0.1 + row * 0.068
      const lit = (row === 1 && col === 11) || (row === 2 && (col === 1 || col === 2))
      const g = paint(rbox(0.066, 0.03, 0.056, 0.3), lit ? accent : KEY)
      ;(lit ? glow : toon).push(onDeck(g, x, 0.078, z))
    }
  }
  toon.push(onDeck(paint(rbox(0.46, 0.03, 0.056, 0.3), KEY), -0.12, 0.078, 0.172))
  // A trackball beside it, in its cup.
  toon.push(onDeck(paint(rcyl(0.08, 0.04, 0.015, 14), DARK), 0.56, 0.055, 0.04))
  glow.push(onDeck(paint(sph(0.055, 12, 8), accent), 0.56, 0.085, 0.04))
  // The monitor's neck, from the cabinet up into the bezel's back.
  toon.push(xform(paint(rcyl(0.06, 0.72, 0.02, 10), '#5d6a82'), [0, 1.13, -0.36]))
  toon.push(xform(paint(rbox(0.36, 0.05, 0.26, 0.3), '#5d6a82'), [0, 0.835, -0.36]))
  // The bezel, the hump of its works behind it, a beacon on top.
  toon.push(onMonitor(paint(rbox(BEZEL_W, BEZEL_H, BEZEL_D, 0.3), DARK), 0, 0, 0))
  toon.push(onMonitor(paint(rbox(1.0, 0.5, 0.18, 0.4), BODY), 0, 0, -0.1))
  toon.push(onMonitor(paint(rcyl(0.035, 0.14, 0.01, 8), '#5d6a82'), 0.55, BEZEL_H / 2 + 0.06, -0.01))
  glow.push(onMonitor(paint(sph(0.045, 10, 8), accent), 0.55, BEZEL_H / 2 + 0.15, -0.01))
  // Its power cable, up from the floor into the cabinet's back.
  toon.push(xform(paint(cap(0.025, 0.5, 6, 2), '#1a1f2c'), [0.32, 0.27, -0.45]))
  return { toon, glow }
}

/** Where a desk stands in the lab, and which way it turns (toward the pad). */
export const labConsoleAt = (s: -1 | 1): { x: number; z: number; yaw: number } => ({ x: s * 3.6, z: -2.4, yaw: -s * 0.5 })

// ─── The screens ─────────────────────────────────────────────────────────────

const TEX_W = 512
const TEX_H = 256
/** Redraws a second: a real display's refresh, not the frame rate. */
const REDRAW_HZ = 8

type Tok = [string, string]
const KW = '#ff7ac8'
const ID = '#bfe8ff'
const FN = '#7ff4ff'
const STR = '#ffd84a'
const NUM = '#7dff9a'
const DIM = '#5f7bb0'
const PUN = '#9fb8e6'

/** The code the left screen types (pseudo-code: identifiers, not prose). */
const CODE: Tok[][] = [
  [['fn ', KW], ['scan', FN], ['(sector, ', PUN], ['depth', ID], [') {', PUN]],
  [['  let ', KW], ['grid', ID], [' = ', PUN], ['map', ID], ['.', PUN], ['load', FN], ['(sector)', PUN]],
  [['  for ', KW], ['bot ', ID], ['in ', KW], ['grid', ID], ['.', PUN], ['drones', ID], [' {', PUN]],
  [['    if ', KW], ['bot', ID], ['.', PUN], ['core', ID], [' > ', PUN], ['0.8', NUM], [' { ', PUN], ['tag', FN], ['(bot)', PUN], [' }', PUN]],
  [['  }', PUN]],
  [['  return ', KW], ['grid', ID], ['.', PUN], ['threat', FN], ['()', PUN]],
  [['}', PUN]],
  [['', PUN]],
  [['beam', ID], ['.', PUN], ['calibrate', FN], ['(', PUN], ['pad', ID], [': ', PUN], ['7', NUM], [', ', PUN], ['hz', ID], [': ', PUN], ['440', NUM], [')', PUN]],
  [['flux', ID], ['.', PUN], ['core', ID], [' = ', PUN], ['0.98', NUM]],
  [['log', FN], ['(', PUN], ['"uplink ok"', STR], [')', PUN]],
  [['', PUN]],
  [['while ', KW], ['vex', ID], ['.', PUN], ['awake', ID], [' {', PUN]],
  [['  shield', ID], ['.', PUN], ['pulse', FN], ['(', PUN], ['0x3cff', NUM], [')', PUN]],
  [['  atlas', ID], ['.', PUN], ['sync', FN], ['(', PUN], ['"valley"', STR], [')', PUN]],
  [['}', PUN]],
  [['', PUN]]
]
const lineLen = (l: Tok[]): number => l.reduce((a, t) => a + t[0].length, 0)
const CODE_CHARS = CODE.map(lineLen)
const CODE_TOTAL = CODE_CHARS.reduce((a, b) => a + b, 0) + CODE.length
/** Characters typed a second, and the pause before it starts over. */
const TYPE_RATE = 16
const TYPE_PAUSE = 30

interface Screen { tex: CanvasTexture; g: CanvasRenderingContext2D | null; draw: (g: CanvasRenderingContext2D, t: number) => void }
let screens: { code: Screen; dash: Screen } | null = null
let lastDraw = -1

const makeScreen = (draw: Screen['draw']): Screen => {
  const c = document.createElement('canvas')
  c.width = TEX_W
  c.height = TEX_H
  const g = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  const s = { tex, g, draw }
  if (g) draw(g, 0)
  return s
}

const frame = (g: CanvasRenderingContext2D, tint: string, glow: string, top: string, bottom: string): void => {
  // A lit panel, not a dark one: it reads as a screen that is on from across the lab.
  const bg = g.createLinearGradient(0, 0, 0, TEX_H)
  bg.addColorStop(0, top)
  bg.addColorStop(1, bottom)
  g.fillStyle = bg
  g.fillRect(0, 0, TEX_W, TEX_H)
  // The title bar: three lights and a tab.
  g.fillStyle = '#16264f'
  g.fillRect(0, 0, TEX_W, 24)
  for (const [k, c] of ['#ff5a6a', '#ffd84a', '#3cff9a'].entries()) {
    g.fillStyle = c
    g.beginPath()
    g.arc(14 + k * 16, 12, 5, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = tint
  g.fillRect(70, 4, 96, 20)
  g.fillStyle = glow
  g.fillRect(70, 22, 96, 2)
}

/** Faint scan lines over the whole screen. */
const scanlines = (g: CanvasRenderingContext2D): void => {
  g.fillStyle = 'rgba(0, 0, 0, 0.16)'
  for (let y = 0; y < TEX_H; y += 4) g.fillRect(0, y, TEX_W, 1)
}

const drawCode = (g: CanvasRenderingContext2D, t: number): void => {
  frame(g, '#1f3a78', '#3cc8ff', '#16397a', '#0c2452')
  g.font = '600 13px Consolas, "Courier New", monospace'
  g.textBaseline = 'middle'
  g.fillStyle = '#cfe6ff'
  g.fillText('scan.fx', 82, 14)
  // How far the typing has got: whole lines, then the line being typed.
  let left = Math.floor(t * TYPE_RATE) % (CODE_TOTAL + TYPE_PAUSE)
  const shown: Array<{ toks: Tok[]; chars: number; n: number }> = []
  for (let i = 0; i < CODE.length && left > 0; i++) {
    const chars = Math.min(CODE_CHARS[i]!, left)
    shown.push({ toks: CODE[i]!, chars, n: i + 1 })
    left -= CODE_CHARS[i]! + 1
  }
  const ROWS = 12
  const LH = 18
  const view = shown.slice(-ROWS)
  view.forEach((l, r) => {
    const y = 36 + r * LH
    g.fillStyle = DIM
    g.fillText(String(l.n).padStart(2, ' '), 10, y)
    let x = 40
    let budget = l.chars
    for (const [s, c] of l.toks) {
      if (budget <= 0) break
      const part = s.slice(0, budget)
      budget -= s.length
      g.fillStyle = c
      g.fillText(part, x, y)
      x += g.measureText(part).width
    }
    // The cursor, blinking, after the last character typed.
    if (r === view.length - 1 && Math.floor(t * 2.5) % 2 === 0) {
      g.fillStyle = '#7ff4ff'
      g.fillRect(x + 1, y - 7, 8, 14)
    }
  })
  // A scroll bar and a status line.
  g.fillStyle = '#16264f'
  g.fillRect(TEX_W - 10, 30, 4, TEX_H - 40)
  g.fillStyle = '#3cc8ff'
  g.fillRect(TEX_W - 10, 30 + (TEX_H - 80) * Math.min(1, shown.length / CODE.length), 4, 40)
  scanlines(g)
}

const drawDash = (g: CanvasRenderingContext2D, t: number): void => {
  frame(g, '#1d5a3c', '#3cff9a', '#0f4a3a', '#082c26')
  // A clock in the title bar.
  g.font = '600 13px Consolas, "Courier New", monospace'
  g.textBaseline = 'middle'
  const s = Math.floor(t)
  g.fillStyle = '#9fffd0'
  g.fillText(`${String(12 + Math.floor(s / 3600) % 12).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, TEX_W - 74, 13)
  g.fillText('07', 104, 14)
  // The radar: rings, a cross, the sweep and its fading blips.
  const cx = 92
  const cy = 142
  const R = 84
  g.strokeStyle = 'rgba(60, 255, 154, 0.35)'
  g.lineWidth = 1.5
  for (const k of [1, 0.66, 0.33]) {
    g.beginPath()
    g.arc(cx, cy, R * k, 0, Math.PI * 2)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(cx - R, cy)
  g.lineTo(cx + R, cy)
  g.moveTo(cx, cy - R)
  g.lineTo(cx, cy + R)
  g.stroke()
  const sweep = (t * 1.6) % (Math.PI * 2)
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(60, 255, 154, ${(0.32 * (1 - k / 14)).toFixed(3)})`
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, R, sweep - (k + 1) * 0.06, sweep - k * 0.06)
    g.fill()
  }
  for (const [a, d] of [[0.7, 0.55], [2.3, 0.8], [3.9, 0.35], [5.1, 0.7]] as const) {
    const since = (sweep - a + Math.PI * 4) % (Math.PI * 2)
    const al = Math.max(0, 1 - since / 3)
    g.fillStyle = `rgba(255, 216, 74, ${al.toFixed(3)})`
    g.beginPath()
    g.arc(cx + Math.cos(a) * R * d, cy + Math.sin(a) * R * d, 5, 0, Math.PI * 2)
    g.fill()
  }
  // Bars, breathing.
  for (let k = 0; k < 8; k++) {
    const h = 20 + 70 * (0.5 + 0.5 * Math.sin(t * (1.3 + k * 0.37) + k * 1.7)) * (0.6 + 0.4 * Math.sin(t * 0.4 + k))
    g.fillStyle = k === 5 ? '#ffd84a' : '#3cff9a'
    g.fillRect(200 + k * 17, 222 - h, 11, h)
  }
  g.fillStyle = 'rgba(60, 255, 154, 0.4)'
  g.fillRect(196, 224, 140, 2)
  // A trace, scrolling.
  g.strokeStyle = '#7ff4ff'
  g.lineWidth = 2
  g.beginPath()
  for (let i = 0; i <= 60; i++) {
    const x = 352 + i * 2.5
    const u = i * 0.25 + t * 3
    const y = 78 + Math.sin(u) * 16 + Math.sin(u * 2.7) * 6
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  g.strokeStyle = 'rgba(127, 244, 255, 0.25)'
  g.strokeRect(348, 40, 156, 76)
  // A gauge and its number.
  const pct = 0.9 + 0.08 * Math.sin(t * 0.7)
  g.lineWidth = 9
  g.strokeStyle = '#16304a'
  g.beginPath()
  g.arc(426, 190, 40, Math.PI * 0.75, Math.PI * 2.25)
  g.stroke()
  g.strokeStyle = '#3cff9a'
  g.beginPath()
  g.arc(426, 190, 40, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * pct))
  g.stroke()
  g.fillStyle = '#e8fff4'
  g.font = '700 20px Consolas, "Courier New", monospace'
  g.textAlign = 'center'
  g.fillText(String(Math.round(pct * 100)), 426, 192)
  g.textAlign = 'left'
  // A row of status lights.
  for (let k = 0; k < 8; k++) {
    g.fillStyle = (Math.floor(t * 2) + k * 3) % 7 === 0 ? '#ffd84a' : '#2a7a52'
    g.fillRect(200 + k * 17, 236, 11, 8)
  }
  scanlines(g)
}

const screenSet = (): { code: Screen; dash: Screen } => {
  screens ??= { code: makeScreen(drawCode), dash: makeScreen(drawDash) }
  return screens
}

/** Redraw the lab's screens (a few times a second; cheap between). */
export const tickLabScreens = (t: number): void => {
  if (!screens || (lastDraw >= 0 && t - lastDraw < 1 / REDRAW_HZ && t >= lastDraw)) return
  lastDraw = t
  for (const s of [screens.code, screens.dash]) {
    if (!s.g) continue
    s.draw(s.g, t)
    s.tex.needsUpdate = true
  }
}

/** A desk where `labConsoleAt` puts it: its merged parts go to the caller's
 *  lists (world space); its screen comes back as a group to add. */
export const buildLabConsole = (s: -1 | 1, toon: BufferGeometry[], glow: BufferGeometry[]): Group => {
  const at = labConsoleAt(s)
  const accent = s > 0 ? '#3cff9a' : '#3cc8ff'
  const parts = labConsoleParts(accent)
  for (const g of parts.toon) toon.push(xform(g, [at.x, 0, at.z], [0, at.yaw, 0]))
  for (const g of parts.glow) glow.push(xform(g, [at.x, 0, at.z], [0, at.yaw, 0]))
  // The screen: in the monitor's frame, proud of the bezel's face.
  const root = new Group()
  root.position.set(at.x, 0, at.z)
  root.rotation.y = at.yaw
  const mon = new Group()
  mon.position.set(...MON_AT)
  mon.rotation.x = MON_TILT
  const tex = s > 0 ? screenSet().dash.tex : screenSet().code.tex
  const scr = new Mesh(new PlaneGeometry(SCREEN_W, SCREEN_H), new MeshBasicMaterial({ map: tex, toneMapped: false }))
  scr.position.z = BEZEL_D / 2 + SCREEN_PROUD
  mon.add(scr)
  root.add(mon)
  return root
}
