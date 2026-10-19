// Mega Droid logo lockup generator (design tool, not shipped).
//
//   node store-art/brand/logo-final.mjs   -> rewrites logo-lockup.svg next to itself
//
// Deterministic: the output is byte-identical to the splash logo inlined in
// index.html and src/components/atoms/FLogoProgress.vue (pinned by
// tests/ui/splashLogo.test.ts). After changing the design here, paste the new
// SVG into BOTH of those files. The app icon is not made here: its source is
// public/icons/icon.svg (rasterised by scripts/render-icons.mjs).
//
// The lockup is flat colour with no ids (the splash SVG exists twice in the
// document during the loader handover) and no text (paths only).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const INK = '#141a33'
const PEARL = '#eef0f3'
const STEEL = '#c3cad4'
const GRAPHITE = '#252932'
const SUIT = '#3a3f4b'
const VISOR = '#161a22'
const VISOR_HI = '#3a4250'
const AMBER = '#ffa733'
const AMBER_DIM = '#b8651a'
const HOT = '#fff0cc'

const f = (n) => {
  const r = Math.round(n * 10) / 10
  return (Object.is(r, -0) ? 0 : r).toString()
}

// ── polygon helpers ─────────────────────────────────────────────────────────
const area = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}
const orient = (pts, hole) => {
  const a = area(pts)
  return (hole ? a > 0 : a < 0) ? [...pts].reverse() : pts
}
const polyD = (pts) => {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`
  return d + 'Z'
}
const glyphD = (g) => g.map((c, i) => polyD(orient(c, i > 0))).join('')
const mapPts = (g, fn) => g.map((c) => c.map(([x, y]) => fn(x, y)))
// ── letters ─────────────────────────────────────────────────────────────────
// Upright, origin top-left, y down, cap height H. [outer, ...holes].
// spec: H, tv (vertical stem), th (horizontal bar), td (diagonal), c (small
// chamfer: top-left + bottom-right of every letter), C (shape chamfer).
const L = {}
L.M = ({ H, tv, td, c, W, valley = 0.44, topIn = 0.45 }) => {
  const m = W / 2
  const yv = H * valley
  const topX = tv + tv * topIn
  const dx = m - topX, dy = yv
  const len = Math.hypot(dx, dy)
  const nx = dy / len, ny = -dx / len
  const px = topX - nx * td, py = 0 - ny * td
  const y1 = py + (tv - px) * (dy / dx)
  const yb = py + (m - px) * (dy / dx)
  return [[
    [0, H], [0, c], [c, 0], [topX, 0], [m, yv], [W - topX, 0], [W, 0], [W, H - c], [W - c, H],
    [W - tv, H], [W - tv, y1], [m, yb], [tv, y1], [tv, H]
  ]]
}
L.E = ({ H, tv, th, c, W, mid = 0.12 }) => {
  const mw = W * mid
  return [[
    [0, H], [0, c], [c, 0], [W, 0], [W, th], [tv, th], [tv, (H - th) / 2], [W - mw, (H - th) / 2],
    [W - mw, (H + th) / 2], [tv, (H + th) / 2], [tv, H - th], [W, H - th], [W, H - c], [W - c, H]
  ]]
}
L.G = ({ H, tv, th, c, W }) => [[
  [0, H], [0, c], [c, 0], [W, 0], [W, th], [tv, th], [tv, H - th], [W - tv, H - th],
  [W - tv, H / 2 + th / 2], [W * 0.52, H / 2 + th / 2], [W * 0.52, H / 2 - th / 2], [W, H / 2 - th / 2],
  [W, H - c], [W - c, H]
]]
L.A = ({ H, tv, th, c, C, W, bar = 0.7 }) => {
  const yb = H * bar + th / 2, ya = yb - th
  // inner chamfer: the outer 45deg cut x+y=C moved inward by the stroke
  const k = C + ((tv + th) / 2) * Math.SQRT2
  return [
    [[0, H], [0, C], [C, 0], [W - C, 0], [W, C], [W, H - c], [W - c, H], [W - tv, H], [W - tv, yb], [tv, yb], [tv, H]],
    [[tv, k - tv], [k - th, th], [W - (k - th), th], [W - tv, k - tv], [W - tv, ya], [tv, ya]]
  ]
}
L.D = ({ H, tv, th, c, C, W }) => {
  const k = C + ((tv + th) / 2) * Math.SQRT2 * 0.8
  return [
    [[0, H], [0, c], [c, 0], [W - C, 0], [W, C], [W, H - C], [W - C, H]],
    [[tv, th], [W - k + (th - 0), th], [W - tv, k - tv], [W - tv, H - (k - tv)], [W - k + th, H - th], [tv, H - th]]
  ]
}
L.V = ({ H, tv, W, foot = 0.14 }) => {
  const m = W / 2, ft = W * foot
  const dx = m - ft, dy = H
  const cos = dy / Math.hypot(dx, dy)
  const tx = (tv * 1.04) / cos
  const yi = (m - tx) * (dy / dx)
  return [[[0, 0], [tx, 0], [m, yi], [W - tx, 0], [W, 0], [m + ft, H], [m - ft, H]]]
}
L.N = ({ H, tv, c, W, dxTop = 0.62, k = 0.32 }) => {
  const dxt = tv * dxTop, kk = H * k
  return [[
    [0, H], [0, c], [c, 0], [tv + dxt, 0], [W - tv, H - kk], [W - tv, 0], [W, 0], [W, H - c], [W - c, H],
    [W - tv - dxt, H], [tv, kk], [tv, H]
  ]]
}
L.T = ({ tv, th, c, W, H }) => [[
  [0, th], [0, c], [c, 0], [W, 0], [W, th], [W / 2 + tv / 2, th], [W / 2 + tv / 2, H], [W / 2 - tv / 2, H], [W / 2 - tv / 2, th]
]]
L.U = ({ H, tv, th, C, W }) => {
  const k = Math.max(0, C - tv * 0.5)
  return [[
    [0, 0], [tv, 0], [tv, H - th - k], [tv + k, H - th], [W - tv - k, H - th], [W - tv, H - th - k],
    [W - tv, 0], [W, 0], [W, H - C], [W - C, H], [C, H], [0, H - C]
  ]]
}
// O: D's corner cut and D's counter, on all four corners
L.O = ({ H, tv, th, C, W }) => {
  const k = C + ((tv + th) / 2) * Math.SQRT2 * 0.8
  return [
    [[0, H - C], [0, C], [C, 0], [W - C, 0], [W, C], [W, H - C], [W - C, H], [C, H]],
    [[tv, k - tv], [k - th, th], [W - k + th, th], [W - tv, k - tv], [W - tv, H - (k - tv)], [W - k + th, H - th], [k - th, H - th], [tv, H - (k - tv)]]
  ]
}
// I: the bare stem (W = tv), with the small chamfer every letter has
L.I = ({ H, c, W }) => [[[0, H], [0, c], [c, 0], [W, 0], [W, H - c], [W - c, H]]]
L.R = ({ H, tv, th, c, C, W, m = 0.58, lw = 1.15 }) => {
  const yb = H * m + th / 2
  const k = Math.max(0, C - tv * 0.5)
  const leg = tv * lw
  // the counter's two chamfers must not cross on a short bowl
  const kh = Math.min(k, Math.max(0, (yb - 2 * th) / 2 - 0.4))
  const xa = W * 0.36
  return [
    [[0, H], [0, c], [c, 0], [W - C, 0], [W, C], [W, yb - C], [W - C, yb], [xa + leg, yb], [W, H], [W - leg * 1.1, H], [xa, yb], [tv, yb], [tv, H]],
    [[tv, th], [W - tv - kh, th], [W - tv, th + kh], [W - tv, yb - th - kh], [W - tv - kh, yb - th], [tv, yb - th]]
  ]
}

// ── compact serialisation (tenths, relative commands) ───────────────────────
const T = (v) => Math.round(v * 10)
const num = (t) => {
  // t in tenths -> shortest decimal string
  let s = (t / 10).toString()
  if (s.startsWith('0.')) s = s.slice(1)
  else if (s.startsWith('-0.')) s = '-' + s.slice(2)
  return s
}
const joinN = (arr) => arr.reduce((acc, s, i) => (i === 0 ? s : acc + (s.startsWith('-') ? '' : ' ') + s), '')
/** Polygon -> relative path (h/v where axis aligned). */
const relPoly = (pts) => {
  const P = pts.map(([x, y]) => [T(x), T(y)])
  let d = 'M' + joinN([num(P[0][0]), num(P[0][1])])
  for (let i = 1; i < P.length; i++) {
    const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1]
    if (dy === 0 && dx === 0) continue
    if (dy === 0) d += 'h' + num(dx)
    else if (dx === 0) d += 'v' + num(dy)
    else d += 'l' + joinN([num(dx), num(dy)])
  }
  return d + 'z'
}
const relGlyph = (g) => g.map((c, i) => relPoly(orient(c, i > 0))).join('')
/** Commands [['M',x,y],['C',x1,y1,x2,y2,x,y],['L',x,y],['Z']] -> relative d. */
const relCmds = (cmds) => {
  let d = ''
  let cx = 0, cy = 0, sx = 0, sy = 0
  for (const c of cmds) {
    const [k, ...a] = c
    const t = a.map(T)
    if (k === 'M') { d += (d ? 'M' : 'M') + joinN([num(t[0]), num(t[1])]); cx = sx = t[0]; cy = sy = t[1] }
    else if (k === 'L') {
      const dx = t[0] - cx, dy = t[1] - cy
      d += dy === 0 ? 'h' + num(dx) : dx === 0 ? 'v' + num(dy) : 'l' + joinN([num(dx), num(dy)])
      cx = t[0]; cy = t[1]
    } else if (k === 'C') {
      d += 'c' + joinN([t[0] - cx, t[1] - cy, t[2] - cx, t[3] - cy, t[4] - cx, t[5] - cy].map(num))
      cx = t[4]; cy = t[5]
    } else if (k === 'Z') { d += 'z'; cx = sx; cy = sy }
  }
  return d
}

// ── italic ─────────────────────────────────────────────────────────────────
const TAN = Math.tan((12 * Math.PI) / 180)
const skewM = (x0, y0, H) => `matrix(1 0 -${TAN.toFixed(3).replace(/^0/, '')} 1 ${num(T(x0 + TAN * H))} ${num(T(y0))})`
/** Upright word at origin (0,0), letters laid left to right; `kern` adds to the tracking per pair ('ID': 1). */
const wordUp = (text, spec, tracking, widths, kern = {}) => {
  let x = 0
  const parts = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const W = widths[ch]
    const g = L[ch]({ ...spec, W })
    parts.push(relGlyph(g.map((c) => c.map(([px, py]) => [x + px, py]))))
    x += W + tracking + (kern[ch + (text[i + 1] ?? '')] ?? 0)
  }
  const up = x - tracking
  return { d: parts.join(''), upright: up, width: up + spec.H * TAN }
}

// ── the head: integer local units, centre ~ (0,0) ───────────────────────────
// Proportions from the model's front render: a flat dome (~1/3 of the head)
// with a chevron brow, a thick visor band that is the widest part and wraps
// to pointed temples, a deep jaw guard narrowing into a chin, two plasma
// eye-lights, and ONE swept sensor blade on the viewer's left.
const HEAD = {
  crown: [['M', -60, -4], ['C', -60, -30, -36, -46, 0, -46], ['C', 36, -46, 60, -30, 60, -4], ['L', 0, 4], ['Z']],
  face: [['M', -58, 8], ['L', 58, 8], ['C', 58, 30, 44, 50, 24, 60], ['C', 12, 66, -12, 66, -24, 60], ['C', -44, 50, -58, 30, -58, 8], ['Z']],
  visor: [['M', -68, -14], ['L', 0, 0], ['L', 68, -14], ['C', 69, -2, 67, 10, 61, 18], ['C', 42, 29, 21, 33, 0, 33], ['C', -21, 33, -42, 29, -61, 18], ['C', -67, 10, -69, -2, -68, -14], ['Z']],
  blade: [['M', -56, -20], ['C', -68, -30, -78, -44, -86, -62], ['C', -78, -44, -70, -24, -64, 4], ['Z']],
  tip: [-86, -62],
  faceShade: [['M', 58, 10], ['C', 58, 30, 44, 50, 24, 60], ['C', 12, 66, -4, 66, -12, 64], ['C', 16, 58, 40, 42, 45, 14], ['Z']],
  crownShade: [['M', 60, -6], ['C', 60, -30, 36, -46, 4, -46], ['C', 32, -40, 48, -26, 47, -3], ['Z']],
  gloss: [['M', -42, -26], ['C', -34, -36, -22, -40, -10, -41]],
  visorHi: [['M', -62, -9], ['L', 0, 4], ['L', 62, -9], ['L', 62, -4], ['L', 0, 9], ['L', -62, -4], ['Z']]
}
const r1 = (v) => num(T(v))

/** The head as a group: translate + uniform scale, local units inside. */
const headG = (tx, ty, s, o = {}) => {
  const ink = o.ink ?? 10
  const line = o.line ?? 3.4
  const detail = o.detail ?? true
  const d = (k) => relCmds(HEAD[k])
  const eyeY = 15
  const eye = (cx) => {
    let e = `<ellipse cx="${cx}" cy="${eyeY}" rx="11.5" ry="13" fill="${AMBER_DIM}"/>`
    e += `<ellipse cx="${cx}" cy="${eyeY}" rx="8.6" ry="10.2" fill="${AMBER}"/>`
    if (detail) e += `<ellipse cx="${cx - 3}" cy="${r1(eyeY - 4.4)}" rx="2.7" ry="3.5" fill="${HOT}"/>`
    return e
  }
  const [bx, by] = HEAD.tip
  let g = `<g transform="matrix(${r1s(s)} 0 0 ${r1s(s)} ${r1(tx)} ${r1(ty)})">`
  g += `<path d="${d('blade')}${d('crown')}${d('face')}${d('visor')}" fill="${INK}" stroke="${INK}" stroke-width="${ink}"/>`
  g += `<circle cx="${bx}" cy="${by}" r="${r1(6.5 + ink / 2)}" fill="${INK}"/>`
  g += `<path d="${d('blade')}" fill="${STEEL}"/>`
  g += `<path d="${d('face')}" fill="${PEARL}"/>`
  if (detail) g += `<path d="${d('faceShade')}" fill="${STEEL}"/>`
  g += `<path d="${d('crown')}" fill="${PEARL}"/>`
  if (detail) {
    g += `<path d="${d('crownShade')}" fill="${STEEL}"/>`
    g += `<path d="${d('gloss')}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`
  }
  g += `<path d="${d('visor')}" fill="${VISOR}" stroke="${INK}" stroke-width="${line}"/>`
  if (detail) g += `<path d="${d('visorHi')}" fill="${VISOR_HI}"/>`
  g += eye(-25) + eye(25)
  g += `<circle cx="${bx}" cy="${by}" r="6.5" fill="${AMBER}"/>`
  if (detail) g += `<circle cx="${r1(bx - 1.8)}" cy="${r1(by - 1.8)}" r="2.2" fill="${HOT}"/>`
  g += '</g>'
  return g
}
function r1s (v) { return (Math.round(v * 1000) / 1000).toString().replace(/^0\./, '.') }

/** Flat-top hexagon, filleted corners, relative path. */
const hexD = (cx, cy, R, rr) => {
  const v = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
  }
  const cmds = []
  for (let i = 0; i < 6; i++) {
    const p0 = v[(i + 5) % 6], p1 = v[i], p2 = v[(i + 1) % 6]
    const a = [p1[0] + (p0[0] - p1[0]) * (rr / R), p1[1] + (p0[1] - p1[1]) * (rr / R)]
    const b = [p1[0] + (p2[0] - p1[0]) * (rr / R), p1[1] + (p2[1] - p1[1]) * (rr / R)]
    cmds.push([i === 0 ? 'M' : 'L', a[0], a[1]])
    // quadratic fillet written as a cubic (relCmds speaks C only)
    cmds.push(['C', a[0] + (2 / 3) * (p1[0] - a[0]), a[1] + (2 / 3) * (p1[1] - a[1]), b[0] + (2 / 3) * (p1[0] - b[0]), b[1] + (2 / 3) * (p1[1] - b[1]), b[0], b[1]])
  }
  cmds.push(['Z'])
  return relCmds(cmds)
}
const badgeG = (cx, cy, R, ink = 8) => {
  let g = `<path d="${hexD(cx, cy, R, R * 0.14)}" fill="${SUIT}" stroke="${INK}" stroke-width="${ink}"/>`
  g += `<path d="${hexD(cx, cy, R * 0.9, R * 0.9 * 0.14)}" fill="${GRAPHITE}"/>`
  g += `<path d="${hexD(cx, cy, R * 0.8, R * 0.8 * 0.14)}" fill="none" stroke="${AMBER}" stroke-width="${r1(Math.max(1.6, R * 0.03))}"/>`
  return g
}

// ── the lockup ───────────────────────────────────────────────────────────────
const lockupSvg = () => {
  const VW = 300
  const cx = VW / 2
  const R = 86
  const hexCy = 6 + R * 0.866
  let body = badgeG(cx, hexCy, R)
  body += headG(cx + 3, hexCy - 1, 0.9)

  const megaSpec = { H: 58, tv: 14.5, td: 12.5, th: 12, c: 8, C: 17 }
  const mega = wordUp('MEGA', megaSpec, 6, { M: 72, E: 48, G: 58, A: 60 })
  const megaY = hexCy + R * 0.866 - 12
  const mx = (VW - mega.width) / 2
  body += `<path transform="${skewM(mx, megaY + 4.5, megaSpec.H)}" d="${mega.d}" fill="${INK}" stroke="${INK}" stroke-width="7"/>`
  body += `<path transform="${skewM(mx, megaY, megaSpec.H)}" d="${mega.d}" fill="${PEARL}" stroke="${INK}" stroke-width="7" paint-order="stroke"/>`

  // DROID: amber on a visor plate. The plate is exactly as wide as the badge
  // (at mid-height its path runs vertex to vertex of the hex) and its ends lean
  // at the italic angle, like the letters and the loader bar under it, so the
  // column reads badge / MEGA / plate as one shape. The word is tracked out to
  // fill the plate with the same padding at both ends.
  const droidSpec = { H: 28, tv: 7, th: 6, td: 6.2, c: 4, C: 7.8 }
  const droidW = { D: 26.4, R: 26.4, O: 27.4, I: 7 }
  const letters = 'DROID'
  const kern = { ID: 1 }
  const pad = 11
  const sumW = [...letters].reduce((a, ch) => a + droidW[ch], 0) + Object.values(kern).reduce((a, k) => a + k, 0)
  // at any one height the word spans its upright width: the lean moves both ends alike
  const tr = (2 * R - 2 * pad - sumW) / (letters.length - 1)
  const droid = wordUp(letters, droidSpec, tr, droidW, kern)
  const plateY = megaY + megaSpec.H + 10
  const plateH = droidSpec.H + 13
  const sk = plateH * TAN
  const plateL = cx - R - sk / 2, plateR = cx + R - sk / 2
  body += `<path d="${relPoly([[plateL + sk, plateY], [plateR + sk, plateY], [plateR, plateY + plateH], [plateL, plateY + plateH]])}" fill="${VISOR}" stroke="${INK}" stroke-width="6"/>`
  const hiX = plateL + sk - 3.4 * TAN + 3
  body += `<path d="M${r1(hiX)} ${r1(plateY + 3.4)}h${r1(plateR - plateL - 6)}" stroke="${VISOR_HI}" stroke-width="2.4"/>`
  // +1: the closing D's cut corners read lighter than the opening D's stem
  const dx = cx - R + pad + 1 - (droidSpec.H / 2) * TAN
  body += `<path transform="${skewM(dx, plateY + (plateH - droidSpec.H) / 2, droidSpec.H)}" d="${droid.d}" fill="${AMBER}"/>`
  const VH = Math.ceil(plateY + plateH + 4)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false"><g stroke-linejoin="round">${body}</g></svg>`
}

const lockup = lockupSvg()
writeFileSync(join(here, 'logo-lockup.svg'), lockup)
console.log('logo-lockup.svg', lockup.length, 'bytes')
