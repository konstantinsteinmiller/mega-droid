import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace,
  SphereGeometry, type Material
} from 'three'
import { rbox, rcyl, torus, sph, cap, xform, paint, merge, rcone } from './kit'
import { toonVC, glowVC, outlineMat } from './toon'

/**
 * ─── The neon street (the intro's cold open) ─────────────────────────────────
 *
 * A rain-slick street at night in the Volt Tower district, far ahead of where
 * the game begins (`story-arc.md` § 1, shot 0 and § 3): stacked towers on both
 * sides, cable bundles across, neon signage that is glyphs and icons (never
 * words), and holo-billboards that flicker between ads and Dr. Vex's red skull.
 * The wet asphalt is faked: dark, with the neon laid on it as soft additive
 * streaks and puddles.
 *
 * The street runs along −z from the camera's end (z ≈ 0). `animate(t)` drives
 * the billboards' flicker and the rain on the action clock, so when the cold
 * open's tape rewinds, the rain rewinds too.
 */

const NEON = ['#ff3fd0', '#3ff4ff', '#ffb03a', '#9d6bff', '#3fff9a']
export const STREET_HALF = 4.8
const LEN = 46
/** The ground round the street, out to the far skyline ring (m): its radius
 *  and its height, clear under the asphalt's underside (-0.2). */
export const STREET_GROUND_R = 150
export const STREET_GROUND_Y = -0.6
/** How far the window-grid facade stands off its tower's street face, and
 *  where the neon window strips stand in front of it (m, out from the wall):
 *  each clear of the next by centimetres that hold at the far skyline's
 *  depth, so no two opaque faces share a plane. */
export const FACADE_GAP = 0.06
const STRIP_OUT = 0.16

const lcg = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

// ─── Billboard faces, drawn once ─────────────────────────────────────────────

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

const texOf = (c: HTMLCanvasElement): CanvasTexture => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * Dr. Vex's avatar, as his screens show it: a grinning cartoon skull in a
 * monocle, open hands raised either side like a showman taking a bow, a
 * lightning bolt behind — all in hologram red on a scan-lined dark screen.
 */
export const drawVexFace = (g: CanvasRenderingContext2D, w: number, h: number): void => {
  const INK = '#3a0008'
  const BONE = '#ff6070'
  const SHADE = '#d8313f'
  const HI = '#ff9aa4'
  const CUFF = '#ffe2e6'
  // The screen: a dark-red glow, brightest behind him.
  const bg = g.createRadialGradient(w / 2, h * 0.45, h * 0.1, w / 2, h * 0.5, w * 0.7)
  bg.addColorStop(0, '#6a0c1a')
  bg.addColorStop(1, '#1c0208')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  const u = h / 100 // one unit: a hundredth of the screen's height
  const line = (width: number) => { g.lineWidth = width * u; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK }

  // The lightning bolt, top left.
  g.beginPath()
  g.moveTo(w * 0.2, h * 0.02)
  g.lineTo(w * 0.29, h * 0.02)
  g.lineTo(w * 0.24, h * 0.16)
  g.lineTo(w * 0.31, h * 0.16)
  g.lineTo(w * 0.17, h * 0.4)
  g.lineTo(w * 0.21, h * 0.22)
  g.lineTo(w * 0.15, h * 0.22)
  g.closePath()
  g.fillStyle = '#9a1022'
  g.fill()
  line(1.4)
  g.stroke()

  const cx = w / 2
  const cy = h * 0.46

  // A raised open hand in a cuff: palm, four fingers fanned up, a thumb in.
  const hand = (x: number, y: number, side: -1 | 1): void => {
    g.save()
    g.translate(x, y)
    g.rotate(side * 0.55)
    // The cuff
    g.beginPath()
    g.roundRect(-9 * u, 8 * u, 18 * u, 8 * u, 3 * u)
    g.fillStyle = CUFF
    g.fill()
    line(1.6)
    g.stroke()
    // Fingers
    for (let k = 0; k < 4; k++) {
      const a = (-0.5 + k * 0.3) * side
      g.save()
      g.rotate(a)
      g.beginPath()
      g.roundRect(-3 * u, -19 * u, 6 * u, 16 * u, 3 * u)
      g.fillStyle = BONE
      g.fill()
      line(1.6)
      g.stroke()
      g.restore()
    }
    // Thumb, across toward him
    g.save()
    g.rotate(side * -1.1)
    g.beginPath()
    g.roundRect(-3 * u, -13 * u, 6 * u, 11 * u, 3 * u)
    g.fillStyle = BONE
    g.fill()
    line(1.6)
    g.stroke()
    g.restore()
    // Palm
    g.beginPath()
    g.ellipse(0, 1 * u, 7.5 * u, 7.5 * u, 0, 0, Math.PI * 2)
    g.fillStyle = BONE
    g.fill()
    line(1.6)
    g.stroke()
    g.beginPath()
    g.arc(0, 2 * u, 4 * u, 0.2, Math.PI - 0.2)
    g.strokeStyle = SHADE
    g.lineWidth = 1.2 * u
    g.stroke()
    g.restore()
  }
  hand(cx - 46 * u, cy + 20 * u, -1)
  hand(cx + 46 * u, cy + 20 * u, 1)

  // The skull: a round cranium over cheekbones and a squared jaw.
  const skull = new Path2D()
  skull.ellipse(cx, cy - 6 * u, 25 * u, 24 * u, 0, Math.PI * 0.86, Math.PI * 2.14)
  skull.lineTo(cx + 22 * u, cy + 14 * u)
  skull.quadraticCurveTo(cx + 20 * u, cy + 20 * u, cx + 15 * u, cy + 21 * u)
  skull.lineTo(cx + 14 * u, cy + 30 * u)
  skull.quadraticCurveTo(cx, cy + 35 * u, cx - 14 * u, cy + 30 * u)
  skull.lineTo(cx - 15 * u, cy + 21 * u)
  skull.quadraticCurveTo(cx - 20 * u, cy + 20 * u, cx - 22 * u, cy + 14 * u)
  skull.closePath()
  g.fillStyle = BONE
  g.fill(skull)
  // Shading down the right side and under the cheeks; a shine top left.
  g.save()
  g.clip(skull)
  g.fillStyle = SHADE
  g.beginPath()
  g.ellipse(cx + 20 * u, cy + 4 * u, 12 * u, 30 * u, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = HI
  g.beginPath()
  g.ellipse(cx - 11 * u, cy - 20 * u, 8 * u, 5 * u, -0.5, 0, Math.PI * 2)
  g.fill()
  g.restore()
  line(2)
  g.stroke(skull)

  // Brows and sockets.
  for (const sd of [-1, 1]) {
    g.beginPath()
    g.ellipse(cx + sd * 10 * u, cy + 2 * u, 7.5 * u, 7 * u, 0, 0, Math.PI * 2)
    g.fillStyle = INK
    g.fill()
    g.beginPath()
    g.arc(cx + sd * 10 * u, cy + 4 * u, 10 * u, Math.PI * 1.15, Math.PI * 1.85)
    g.strokeStyle = SHADE
    g.lineWidth = 1.4 * u
    g.stroke()
  }
  // The monocle, on his left eye (the viewer's right), and its chain.
  g.beginPath()
  g.arc(cx + 10 * u, cy + 2 * u, 8.6 * u, 0, Math.PI * 2)
  g.fillStyle = 'rgba(255, 220, 228, 0.18)'
  g.fill()
  g.lineWidth = 2.2 * u
  g.strokeStyle = CUFF
  g.stroke()
  g.lineWidth = 0.9 * u
  g.strokeStyle = INK
  g.stroke()
  g.beginPath()
  g.moveTo(cx + 18 * u, cy + 5 * u)
  g.quadraticCurveTo(cx + 26 * u, cy + 20 * u, cx + 21 * u, cy + 30 * u)
  g.setLineDash([1.6 * u, 1.2 * u])
  g.lineWidth = 1.2 * u
  g.strokeStyle = CUFF
  g.stroke()
  g.setLineDash([])
  g.beginPath()
  g.ellipse(cx + 13 * u, cy - 1 * u, 2 * u, 3 * u, -0.5, 0, Math.PI * 2)
  g.fillStyle = 'rgba(255, 255, 255, 0.55)'
  g.fill()

  // Nose: an upside-down heart.
  g.beginPath()
  g.moveTo(cx, cy + 9 * u)
  g.quadraticCurveTo(cx - 5 * u, cy + 15 * u, cx - 2 * u, cy + 16 * u)
  g.lineTo(cx, cy + 14.5 * u)
  g.lineTo(cx + 2 * u, cy + 16 * u)
  g.quadraticCurveTo(cx + 5 * u, cy + 15 * u, cx, cy + 9 * u)
  g.fillStyle = INK
  g.fill()

  // The grin: a wide mouth, two rows of teeth.
  const mouth = new Path2D()
  mouth.moveTo(cx - 15 * u, cy + 19 * u)
  mouth.quadraticCurveTo(cx, cy + 23 * u, cx + 15 * u, cy + 19 * u)
  mouth.quadraticCurveTo(cx + 13 * u, cy + 29 * u, cx, cy + 30 * u)
  mouth.quadraticCurveTo(cx - 13 * u, cy + 29 * u, cx - 15 * u, cy + 19 * u)
  g.fillStyle = INK
  g.fill(mouth)
  g.save()
  g.clip(mouth)
  g.fillStyle = CUFF
  for (let k = -3; k <= 3; k++) {
    const x = cx + k * 4.1 * u
    const curve = (k * k) * 0.18 * u
    g.beginPath()
    g.roundRect(x - 1.75 * u, cy + 19.5 * u - curve * 0.3 + 0.9 * u, 3.5 * u, 4.2 * u, 0.8 * u)
    g.fill()
    g.beginPath()
    g.roundRect(x - 1.75 * u, cy + 24.6 * u - curve, 3.5 * u, 4 * u, 0.8 * u)
    g.fill()
  }
  g.restore()
  line(1.4)
  g.stroke(mouth)
  // Cheekbone creases.
  for (const sd of [-1, 1]) {
    g.beginPath()
    g.arc(cx + sd * 17 * u, cy + 16 * u, 4 * u, sd > 0 ? Math.PI * 0.9 : Math.PI * 0.1, sd > 0 ? Math.PI * 1.4 : -Math.PI * 0.4, sd < 0)
    g.strokeStyle = SHADE
    g.lineWidth = 1.2 * u
    g.stroke()
  }

  // The screen: scan-lines and a dark edge.
  g.fillStyle = 'rgba(0, 0, 0, 0.28)'
  for (let y = 0; y < h; y += Math.max(3, Math.round(1.6 * u))) g.fillRect(0, y, w, Math.max(1, 0.6 * u))
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62)
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vig.addColorStop(1, 'rgba(10, 0, 3, 0.6)')
  g.fillStyle = vig
  g.fillRect(0, 0, w, h)
}

/** An ad: bold glyphs and icons in neon on dark — no words, in any language. */
const drawAd = (g: CanvasRenderingContext2D, w: number, h: number, k: number): void => {
  const a = NEON[k % NEON.length]!
  const b = NEON[(k + 2) % NEON.length]!
  g.fillStyle = '#0a0a1c'
  g.fillRect(0, 0, w, h)
  g.lineWidth = 6
  g.strokeStyle = a
  g.strokeRect(6, 6, w - 12, h - 12)
  g.fillStyle = a
  g.strokeStyle = b
  const cx = w * 0.35
  const cy = h / 2
  const r = h * 0.28
  switch (k % 4) {
    case 0: // A bolt
      g.beginPath()
      g.moveTo(cx + r * 0.2, cy - r)
      g.lineTo(cx - r * 0.5, cy + r * 0.1)
      g.lineTo(cx, cy + r * 0.1)
      g.lineTo(cx - r * 0.2, cy + r)
      g.lineTo(cx + r * 0.5, cy - r * 0.1)
      g.lineTo(cx, cy - r * 0.1)
      g.closePath()
      g.fill()
      break
    case 1: // A battery
      g.lineWidth = 8
      g.strokeRect(cx - r, cy - r * 0.5, r * 1.8, r)
      g.fillRect(cx - r * 0.85, cy - r * 0.35, r * 1.2, r * 0.7)
      g.fillRect(cx + r * 0.8, cy - r * 0.2, r * 0.25, r * 0.4)
      break
    case 2: // A gear
      g.lineWidth = 10
      g.beginPath()
      g.arc(cx, cy, r * 0.65, 0, Math.PI * 2)
      g.stroke()
      for (let j = 0; j < 8; j++) {
        const an = (j / 8) * Math.PI * 2
        g.fillRect(cx + Math.cos(an) * r * 0.85 - 7, cy + Math.sin(an) * r * 0.85 - 7, 14, 14)
      }
      break
    default: // A heart-shaped chip
      g.beginPath()
      g.arc(cx - r * 0.35, cy - r * 0.2, r * 0.4, Math.PI, 0)
      g.arc(cx + r * 0.35, cy - r * 0.2, r * 0.4, Math.PI, 0)
      g.lineTo(cx, cy + r * 0.8)
      g.closePath()
      g.fill()
  }
  // Glyph rows: bars and dots, like signage in no script at all.
  g.fillStyle = b
  for (let row = 0; row < 3; row++) {
    for (let j = 0; j < 5; j++) {
      const x = w * 0.6 + j * w * 0.07
      const y = h * 0.3 + row * h * 0.2
      if ((j + row + k) % 3 === 0) {
        g.beginPath()
        g.arc(x + 6, y + 6, 6, 0, Math.PI * 2)
        g.fill()
      } else g.fillRect(x, y, w * 0.05, 12)
    }
  }
}

let faces: { vex: CanvasTexture; ads: CanvasTexture[] } | null = null
const billboardFaces = (): { vex: CanvasTexture; ads: CanvasTexture[] } => {
  if (faces) return faces
  const [vc, vg] = canvas(512, 320)
  if (vg) drawVexFace(vg, 512, 320)
  const ads = [0, 1, 2, 3].map((k) => {
    const [c, g] = canvas(256, 160)
    if (g) drawAd(g, 256, 160, k)
    return texOf(c)
  })
  faces = { vex: texOf(vc), ads }
  return faces
}

// ─── The city beyond the street ──────────────────────────────────────────────
//
// What makes the street a place in a city rather than a corridor in a void:
// a night sky with the downtown's magenta glow on the horizon, two layers of
// distant skyline at different depths (they slide past each other as the
// camera moves), the Volt Tower's spire at the end of the street, and lit
// windows on every facade. The haze colour is the street's fog colour too, so
// the far end of the street melts into the skyline instead of stopping.

/** The horizon haze: the fog, the sky's low band, the far skyline's air. */
export const STREET_HAZE = '#2c1242'

/** The sky, as an equirectangular strip: the horizon is its middle row. */
const drawSky = (g: CanvasRenderingContext2D, w: number, h: number): void => {
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#020108')
  sky.addColorStop(0.28, '#0a0620')
  sky.addColorStop(0.42, '#1d0c3a')
  sky.addColorStop(0.49, '#5a1b62')
  sky.addColorStop(0.5, '#8a2a78')
  sky.addColorStop(0.53, STREET_HAZE)
  sky.addColorStop(1, '#0c0616')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  const r = lcg(4242)
  // Low cloud bands lit from below by the city.
  for (let k = 0; k < 26; k++) {
    const y = h * (0.3 + r() * 0.17)
    const x = r() * w
    const cw = w * (0.08 + r() * 0.2)
    const grad = g.createLinearGradient(0, y - 8, 0, y + 10)
    grad.addColorStop(0, 'rgba(120, 40, 140, 0)')
    grad.addColorStop(1, `rgba(${180 + r() * 60 | 0}, ${50 + r() * 40 | 0}, ${140 + r() * 60 | 0}, ${0.12 + r() * 0.12})`)
    g.fillStyle = grad
    g.beginPath()
    g.ellipse(x, y, cw / 2, 5 + r() * 8, 0, 0, Math.PI * 2)
    g.fill()
  }
  // A few stars above the glow.
  for (let k = 0; k < 140; k++) {
    g.fillStyle = `rgba(220, 220, 255, ${0.2 + r() * 0.5})`
    g.fillRect(r() * w, r() * h * 0.3, 1.2, 1.2)
  }
}

/** A skyline strip: tower silhouettes standing on the bottom edge, their
 *  windows lit, beacons on the roofs, a haze fading them into the sky. */
const drawSkyline = (g: CanvasRenderingContext2D, w: number, h: number, seed: number, far: boolean): void => {
  g.clearRect(0, 0, w, h)
  const r = lcg(seed)
  const body = far ? '#281540' : '#150b26'
  const win = far ? ['#b06ad0', '#7a8ad8', '#e080b0'] : ['#ffd27a', '#7ff4ff', '#ff6ad5', '#fff0cc', '#9d8bff']
  let x = 0
  while (x < w) {
    const tw = (far ? 18 : 26) + r() * (far ? 40 : 70)
    const th = h * ((far ? 0.25 : 0.2) + r() * r() * (far ? 0.7 : 0.75))
    const top = h - th
    g.fillStyle = body
    g.fillRect(x, top, tw, th)
    // Setbacks and spires on some.
    if (r() < 0.4) g.fillRect(x + tw * 0.25, top - th * 0.12, tw * 0.5, th * 0.12)
    if (r() < 0.25) {
      g.fillRect(x + tw * 0.47, top - th * 0.3, Math.max(2, tw * 0.06), th * 0.3)
      g.fillStyle = '#ff3048'
      g.fillRect(x + tw * 0.47 - 1, top - th * 0.3 - 3, 4, 4)
    }
    // Window grid: most dark, some lit, in runs (whole floors on).
    const cell = far ? 5 : 7
    for (let yy = top + cell; yy < h - cell; yy += cell) {
      const floorOn = r() < (far ? 0.35 : 0.45)
      for (let xx = x + 3; xx < x + tw - 4; xx += cell) {
        if ((floorOn && r() < 0.7) || r() < 0.08) {
          g.fillStyle = win[Math.floor(r() * win.length)]!
          g.globalAlpha = 0.45 + r() * 0.5
          g.fillRect(xx, yy, cell * 0.55, cell * 0.5)
        }
      }
    }
    g.globalAlpha = 1
    // A neon sign stripe down a few.
    if (!far && r() < 0.3) {
      g.fillStyle = NEON[Math.floor(r() * NEON.length)]!
      g.fillRect(x + 2, top + th * 0.15, 3, th * 0.4)
    }
    x += tw + r() * (far ? 4 : 10)
  }
  // Haze: the lower air is thick with the city's glow.
  const haze = g.createLinearGradient(0, 0, 0, h)
  haze.addColorStop(0, 'rgba(44, 18, 66, 0)')
  haze.addColorStop(far ? 0.55 : 0.75, 'rgba(90, 30, 110, 0.15)')
  haze.addColorStop(1, far ? 'rgba(140, 40, 120, 0.75)' : 'rgba(70, 22, 90, 0.5)')
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = haze
  g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'source-over'
}

/** A facade: rows of windows, a few lit, in the building's own neon. */
const drawFacade = (g: CanvasRenderingContext2D, w: number, h: number): void => {
  g.fillStyle = '#12142c'
  g.fillRect(0, 0, w, h)
  const r = lcg(909)
  const cell = w / 8
  for (let row = 0; row < 8; row++) {
    const floorOn = r() < 0.4
    for (let col = 0; col < 8; col++) {
      const lit = (floorOn && r() < 0.75) || r() < 0.12
      g.fillStyle = lit ? ['#ffd27a', '#bff3ff', '#ff9ae0', '#fff0cc'][Math.floor(r() * 4)]! : '#1f2446'
      g.globalAlpha = lit ? 0.6 + r() * 0.4 : 1
      g.fillRect(col * cell + cell * 0.2, row * cell + cell * 0.25, cell * 0.6, cell * 0.45)
    }
  }
  g.globalAlpha = 1
  // Floor lines.
  g.fillStyle = '#0a0b1c'
  for (let row = 0; row < 8; row++) g.fillRect(0, row * cell, w, 2)
}

type CityTex = { sky: CanvasTexture; far: CanvasTexture; near: CanvasTexture; facade: CanvasTexture }
const cityCache = new Map<boolean, CityTex>()
/** The backdrop's textures; `low` draws them at half the size (a quarter of
 *  the memory and the draw time). */
const cityTextures = (low = false): CityTex => {
  const hit = cityCache.get(low)
  if (hit) return hit
  const S = low ? 0.5 : 1
  const [sc, sg] = canvas(1024 * S, 512 * S)
  if (sg) drawSky(sg, 1024 * S, 512 * S)
  const [fc, fg] = canvas(2048 * S, 256 * S)
  if (fg) drawSkyline(fg, 2048 * S, 256 * S, 11, true)
  const [nc, ng] = canvas(2048 * S, 256 * S)
  if (ng) drawSkyline(ng, 2048 * S, 256 * S, 23, false)
  const [wc, wg] = canvas(128, 128)
  if (wg) drawFacade(wg, 128, 128)
  const facade = texOf(wc)
  facade.wrapS = facade.wrapT = RepeatWrapping
  const far = texOf(fc)
  far.wrapS = RepeatWrapping
  far.repeat.x = 2
  const near = texOf(nc)
  near.wrapS = RepeatWrapping
  near.repeat.x = 3
  const out = { sky: texOf(sc), far, near, facade }
  cityCache.set(low, out)
  return out
}

/** The backdrop: sky, two skyline rings and the Volt Tower's spire. */
const buildBackdrop = (low: boolean): Group => {
  const g = new Group()
  const tex = cityTextures(low)
  const sky = new Mesh(
    new SphereGeometry(190, 32, 16),
    new MeshBasicMaterial({ map: tex.sky, side: BackSide, fog: false, depthWrite: false, toneMapped: false })
  )
  sky.renderOrder = -10
  g.add(sky)
  // Skyline rings: open cylinders seen from inside, standing on the horizon.
  const ring = (r: number, h: number, map: CanvasTexture, y: number): Mesh => {
    const m = new Mesh(
      new CylinderGeometry(r, r, h, 48, 1, true),
      new MeshBasicMaterial({ map, side: BackSide, transparent: true, fog: false, depthWrite: false, toneMapped: false })
    )
    m.position.y = y + h / 2
    return m
  }
  const far = ring(150, 60, tex.far, -6)
  far.renderOrder = -9
  const near = ring(95, 42, tex.near, -4)
  near.renderOrder = -8
  g.add(far, near)
  // The ground the skyline stands on, out to the far ring (#170): past the
  // street's end and between its towers the rings' buildings floated over the
  // sky's low band. Under the asphalt (whose underside is at -0.2), never in
  // its plane; the rings' feet (-4, -6) sink into it (they draw after it, see
  // through, and the depth test hides what is below it).
  const ground = new Mesh(
    new CircleGeometry(STREET_GROUND_R, 64).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: new Color('#0e0a1e'), fog: false, toneMapped: false })
  )
  ground.position.y = STREET_GROUND_Y
  ground.name = 'streetGround'
  g.add(ground)
  // The Volt Tower, lit, at the end of the street: where this fight is.
  const spireMat = new MeshBasicMaterial({ color: new Color('#3a2a5a'), fog: false, toneMapped: false })
  const spire = new Mesh(rcone(5, 0.6, 70, 0.3, 12), spireMat)
  spire.position.set(-6, 30, -120)
  g.add(spire)
  const glowMat = new MeshBasicMaterial({ color: new Color('#fff3a0'), fog: false, toneMapped: false })
  for (let k = 0; k < 4; k++) {
    const coil = new Mesh(torus(3.2 - k * 0.55, 0.25, 6, 24), glowMat)
    coil.position.set(-6, 42 + k * 6, -120)
    coil.rotation.x = Math.PI / 2
    g.add(coil)
  }
  const tip = new Mesh(sph(1.1, 12, 8), glowMat)
  tip.position.set(-6, 66, -120)
  g.add(tip)
  const halo = new Mesh(new PlaneGeometry(40, 40), new MeshBasicMaterial({
    color: new Color('#ff6ad5'), transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
  }))
  halo.position.set(-6, 45, -125)
  g.add(halo)
  return g
}

/** Dr. Vex's face as a texture (the billboards' and the valley hologram's). */
export const vexFaceTexture = (): CanvasTexture => billboardFaces().vex

// ─── The set ─────────────────────────────────────────────────────────────────

interface Billboard {
  mat: MeshBasicMaterial
  glow: MeshBasicMaterial
  ad: CanvasTexture
  phase: number
  color: Color
}

export interface Street {
  root: Group
  /** Billboards' flicker and the rain, on the action clock (s). */
  animate(t: number): void
  /** The merged set's pieces, one geometry each, in street space — kept only
   *  when asked (`keepParts`): the z-fighting test reads them. */
  parts?: BufferGeometry[]
}

/** `low` (budget phones, `engine/quality.ts`): a third of the rain, fewer
 *  puddles, half-size backdrop textures. */
export const buildStreet = (opts: { low?: boolean; keepParts?: boolean } = {}): Street => {
  const low = !!opts.low
  const root = new Group()
  const toon: BufferGeometry[] = []
  const glowG: BufferGeometry[] = []
  const r = lcg(77)

  // The asphalt, kerbs and pavements.
  toon.push(xform(paint(rbox(STREET_HALF * 2 + 6, 0.2, LEN, 0.05), '#11142a'), [0, -0.1, -LEN / 2 + 6]))
  for (const s of [-1, 1]) {
    toon.push(xform(paint(rbox(1.6, 0.25, LEN, 0.2), '#262a44'), [s * (STREET_HALF + 0.3), 0.02, -LEN / 2 + 6]))
    // Lane studs, glowing faintly.
    for (let z = 4; z > -LEN + 6; z -= 3) glowG.push(xform(paint(rbox(0.08, 0.02, 0.9, 0.3), '#3a4a7a'), [s * 1.6, 0.01, z]))
  }

  // The towers: stacked blocks, window strips, signage glyphs.
  const billboards: Billboard[] = []
  const { ads } = billboardFaces()
  const facadeMat = new MeshBasicMaterial({ map: cityTextures(low).facade, color: new Color('#c8c8e0'), toneMapped: false })
  root.add(buildBackdrop(low))
  let bi = 0
  for (const s of [-1, 1]) {
    for (let z = 5; z > -LEN + 4; ) {
      const w = 3 + r() * 3
      const d = 2.5 + r() * 2.5
      const h = 9 + r() * 14
      const x = s * (STREET_HALF + 1.2 + d / 2)
      const zc = z - w / 2
      toon.push(xform(paint(rbox(d, h, w, 0.08), r() < 0.5 ? '#1c2040' : '#232848'), [x, h / 2, zc]))
      // Its street face: a window grid, a metre and a bit per window.
      {
        const fh = h - 1.2
        const pg = new PlaneGeometry(w * 0.94, fh)
        const uv = pg.attributes.uv!.array as Float32Array
        const ox = r()
        for (let i = 0; i < uv.length; i += 2) {
          uv[i] = uv[i]! * (w / 10) + ox
          uv[i + 1] = uv[i + 1]! * (fh / 10)
        }
        const face = new Mesh(pg, facadeMat)
        // Clear of the tower's own face by FACADE_GAP, never a centimetre:
        // at the cold open's 15-40 m the two would tear into each other.
        face.position.set(s * (STREET_HALF + 1.2 - FACADE_GAP), 1.2 + fh / 2, zc)
        face.rotation.y = -s * Math.PI / 2
        root.add(face)
      }
      // A setback storey on top.
      toon.push(xform(paint(rbox(d * 0.7, 3, w * 0.7, 0.1), '#262c52'), [x, h + 1.5, zc]))
      // Window strips facing the street, in one neon per tower: standing
      // wholly in front of the facade plane, not half through it.
      const col = NEON[Math.floor(r() * NEON.length)]!
      const face = s * (STREET_HALF + 1.2 - STRIP_OUT)
      for (let y = 2; y < h - 1; y += 1.6 + r() * 1.2) {
        if (r() < 0.35) continue
        glowG.push(xform(paint(rbox(0.05, 0.14, w * (0.4 + r() * 0.5), 0.3), r() < 0.8 ? '#28345e' : col), [face, y, zc + (r() - 0.5)]))
      }
      // Vertical neon signage glyph: a column of shapes.
      if (r() < 0.6) {
        const gy = 2.5 + r() * 3
        for (let k = 0; k < 3; k++) {
          const gcol = NEON[(bi + k) % NEON.length]!
          const shape = k % 3 === 0 ? torus(0.3, 0.06, 6, 16) : k % 3 === 1 ? rbox(0.08, 0.5, 0.5, 0.2) : sph(0.22, 10, 8)
          glowG.push(xform(paint(shape, gcol), [face - s * 0.15, gy + k * 0.8, zc - w * 0.3], [0, Math.PI / 2, 0]))
        }
      }
      // A holo-billboard on every other tower.
      if (bi % 2 === 0 && z < 0) {
        const bw = Math.min(w * 0.8, 4.2)
        const bh = bw * 0.62
        const ad = ads[bi % ads.length]!
        const mat = new MeshBasicMaterial({ map: ad, transparent: true, opacity: 0.92, side: DoubleSide, toneMapped: false, depthWrite: false })
        const board = new Mesh(new PlaneGeometry(bw, bh), mat)
        board.position.set(face - s * 0.6, 4.5 + r() * 3.5, zc)
        board.rotation.y = -s * Math.PI / 2 + s * 0.25
        root.add(board)
        // Its reflection on the wet street: a soft streak in its colour.
        const color = new Color(NEON[bi % NEON.length]!)
        const refl = new MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
        const streak = new Mesh(new PlaneGeometry(bw * 0.5, 7), refl)
        streak.rotation.x = -Math.PI / 2
        streak.position.set(s * (STREET_HALF - 1.4), 0.015, zc)
        root.add(streak)
        billboards.push({ mat, glow: refl, ad, phase: r() * 10, color })
        toon.push(xform(paint(rbox(0.3, 0.3, bw * 0.8, 0.3), '#3b4458'), [face - s * 0.3, board.position.y - bh / 2 - 0.1, zc]))
      }
      bi++
      z -= w + 0.4
    }
  }
  // Cable bundles strung across the street.
  for (let z = -3; z > -LEN + 6; z -= 7 + r() * 5) {
    const y = 7 + r() * 5
    toon.push(xform(paint(cap(0.05, STREET_HALF * 2 + 2, 6, 2), '#0c0e1c'), [0, y, z], [0, 0, Math.PI / 2 + (r() - 0.5) * 0.1]))
    toon.push(xform(paint(cap(0.04, STREET_HALF * 2 + 2, 6, 2), '#0c0e1c'), [0, y - 0.25, z - 0.4], [0, 0, Math.PI / 2 + (r() - 0.5) * 0.12]))
  }
  // Street lamps.
  for (let z = 2; z > -LEN + 6; z -= 9) {
    for (const s of [-1, 1]) {
      toon.push(xform(paint(rcyl(0.08, 5, 0.03, 8), '#3b4458'), [s * (STREET_HALF + 0.2), 2.5, z]))
      glowG.push(xform(paint(rcone(0.35, 0.1, 0.25, 0.03, 10), '#bff3ff'), [s * (STREET_HALF - 0.3), 5, z], [Math.PI, 0, 0]))
    }
  }
  // The flame jet's wall nozzle (left wall, behind where Flux slides).
  toon.push(xform(paint(rcyl(0.3, 0.6, 0.08, 12), '#5d6a82'), [-(STREET_HALF + 0.3), 0.9, -8.2], [0, 0, Math.PI / 2]))
  glowG.push(xform(paint(torus(0.22, 0.05, 6, 14), '#ff7a1f'), [-(STREET_HALF - 0.05), 0.9, -8.2], [0, Math.PI / 2, 0]))

  const geo = merge(toon)
  root.add(new Mesh(geo, toonVC()))
  const ol = new Mesh(geo, outlineMat(0.03))
  ol.renderOrder = -1
  root.add(ol)
  root.add(new Mesh(merge(glowG), glowVC()))

  // Neon puddles on the asphalt.
  for (let k = 0; k < (low ? 6 : 14); k++) {
    const color = new Color(NEON[k % NEON.length]!)
    const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.12 + r() * 0.1, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    const p = new Mesh(new PlaneGeometry(0.8 + r() * 1.8, 0.5 + r() * 1.2), m)
    p.rotation.x = -Math.PI / 2
    p.position.set((r() - 0.5) * STREET_HALF * 1.6, 0.012, 2 - r() * 30)
    root.add(p)
  }

  // Rain: streaks in a box over the near street, falling on the action clock.
  const N = low ? 240 : 700
  const rain0 = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    rain0[i * 3] = (r() - 0.5) * 16
    rain0[i * 3 + 1] = r() * 12
    rain0[i * 3 + 2] = 3 - r() * 24
  }
  const rainPos = new Float32Array(N * 6)
  const rainGeo = new BufferGeometry()
  rainGeo.setAttribute('position', new Float32BufferAttribute(rainPos, 3))
  const rain = new LineSegments(rainGeo, new LineBasicMaterial({
    color: new Color('#9fc8ff'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false
  }))
  rain.frustumCulled = false
  root.add(rain)

  const { vex } = billboardFaces()
  const red = new Color('#ff2d3f')
  return {
    root,
    parts: opts.keepParts ? [...toon, ...glowG] : undefined,
    animate: (t) => {
      for (const b of billboards) {
        // Mostly the ad; Vex's face cuts in, glitching, more and more often.
        const f = Math.sin(t * 2.3 + b.phase) + Math.sin(t * 7.1 + b.phase * 2) * 0.4
        const onVex = f > 0.55 || (f > 0.35 && Math.sin(t * 60) > 0)
        const map = onVex ? vex : b.ad
        // Both faces are textures, so a swap keeps the same GL program.
        b.mat.map = map
        b.mat.opacity = 0.8 + Math.sin(t * 31 + b.phase) * 0.12
        b.glow.color.copy(onVex ? red : b.color)
      }
      const fall = 17
      for (let i = 0; i < N; i++) {
        const x = rain0[i * 3]!
        let y = (rain0[i * 3 + 1]! - t * fall) % 12
        if (y < 0) y += 12
        const z = rain0[i * 3 + 2]!
        rainPos[i * 6] = x
        rainPos[i * 6 + 1] = y
        rainPos[i * 6 + 2] = z
        rainPos[i * 6 + 3] = x + 0.02
        rainPos[i * 6 + 4] = y + 0.45
        rainPos[i * 6 + 5] = z
      }
      rainGeo.attributes.position!.needsUpdate = true
    }
  }
}

export const disposeStreet = (s: Street): void => {
  s.root.traverse((o) => {
    const m = o as Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as Material | undefined
    // The shared toon / glow / outline materials stay; the set's own go.
    if (mat && (mat instanceof MeshBasicMaterial || mat instanceof LineBasicMaterial) && !mat.vertexColors) mat.dispose()
  })
}
