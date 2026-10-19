// The logo on a cover (#185): the compact two-line wordmark (no head) in the calmest of the top-right, bottom-left and bottom-right
// corners (never the top-left: portal banners), a margin off both edges, sized per aspect so it reads at a 250 px thumbnail without
// reaching the characters, with a soft navy shadow and, where the corner is
// busy, a dark vignette behind it for legibility.
// Used by tools/art-promotion.mjs, scripts/render-thumbnail.mjs and
// tools/promotion/cover-logo.mjs.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
export const LOGO_MASTER = join(ROOT, 'public', 'images', 'logo', 'mega-droid-logo.svg')
/** The one-line wordmark (no longer the cover default). */
export const WORDMARK = join(ROOT, 'public', 'images', 'logo', 'mega-droid-wordmark.svg')
/**
 * Covers take the COMPACT two-line "MEGA / DROID" without the head (Flux is
 * on the cover already), on every format. The full lockup with the head
 * (LOGO_MASTER) stays for other uses.
 */
export const COMPACT = join(ROOT, 'public', 'images', 'logo', 'mega-droid-compact.svg')

/** The lockup's width as a share of the image width, per aspect shape. */
// The compact logo, ~60 % larger than the one-line wordmark it replaced
// (its letters 1.6x as tall as the wordmark's at 0.32 of a 16:9 width).
export const LOGO_WIDTH = { landscape: 0.17, portrait: 0.42, tall: 0.36, square: 0.3, classic: 0.21, share: 0.18 }
/** The shape of a w × h image. */
export const shapeOf = (w, h) => {
  const r = w / h
  return r > 1.7 ? 'landscape' : r > 1.25 ? 'classic' : r > 0.9 ? 'square' : r > 0.6 ? 'tall' : 'portrait'
}

/** The lockup `width` px wide, and a soft navy shadow for it. */
const lockup = async (width, file) => {
  // Rasterise at twice the size (from the viewBox width), then scale down.
  const svg = readFileSync(file)
  const vbW = Number(/viewBox="0 0 ([\d.]+)/.exec(svg.toString())[1])
  const logo = await sharp(svg, { density: Math.ceil((72 * width * 2) / vbW) }).resize(width).png().toBuffer()
  const { height } = await sharp(logo).metadata()
  const blur = Math.max(2, Math.round(width * 0.02))
  const pad = blur * 3
  // Two pipelines: sharp runs extractChannel late.
  const a0 = await sharp(logo).extractChannel(3).png().toBuffer()
  const alpha = await sharp(a0)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .blur(blur).linear(0.75, 0).toColourspace('b-w').png().toBuffer()
  const shadow = await sharp({ create: { width: width + 2 * pad, height: height + 2 * pad, channels: 3, background: '#0b0e24' } })
    .joinChannel(alpha).png().toBuffer()
  return { logo, shadow, height, pad, drop: Math.round(width * 0.014) }
}

/** How busy a region is: the standard deviation of its luminance, 0..1. */
const busyness = async (png, box) => {
  const { channels } = await sharp(png).extract(box).greyscale().stats()
  return channels[0].stdev / 255
}

/** Detail in a region (luminance spread plus edge energy): faces, the clash and busy art score high. */
const detail = async (png, box) => {
  const g = sharp(png).extract(box).greyscale()
  const lum = (await g.clone().stats()).channels[0].stdev / 255
  const edges = (await g.clone().convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], offset: 128 }).stats()).channels[0].stdev / 255
  return lum + 2 * edges
}

/**
 * The logo's corner on a w × h cover: the calmest of top-right, bottom-left
 * and bottom-right. NEVER the top-left: CrazyGames lays its banner over the
 * top-left, up to the horizontal middle (and the cover rules keep it empty),
 * so no candidate box reaches into x < w/2 within the top half.
 */
export const CORNERS = ['top-right', 'bottom-left', 'bottom-right']
export const pickSpot = async (png, w, h, bw, bh, corners = CORNERS) => {
  const margin = Math.round(Math.min(w, h) * 0.045)
  const at = {
    'top-right': { left: w - margin - bw, top: margin },
    'bottom-left': { left: margin, top: h - margin - bh },
    'bottom-right': { left: w - margin - bw, top: h - margin - bh }
  }
  let best = null
  for (const corner of corners.filter((c) => CORNERS.includes(c))) {
    const { left, top } = at[corner]
    // A box that would reach into the top-left quadrant is not a candidate.
    if (left < w / 2 && top < h / 2) continue
    const box = { left: Math.max(0, left), top: Math.max(0, top), width: Math.min(bw, w), height: Math.min(bh, h) }
    const score = await detail(png, box)
    if (!best || score < best.score) best = { corner, ...box, score }
  }
  return best
}

/**
 * `png` (w × h) with the logo in the calmest allowed corner (pickSpot): the
 * compact logo by default (`file` for another); `share` overrides
 * the width share. A dark vignette sits behind it, stronger where the corner
 * is busy. `corners` narrows the allowed corners for one cover (the top-left
 * is never allowed). Returns a PNG buffer.
 */
export const withCoverLogo = async (png, w, h, share = LOGO_WIDTH[shapeOf(w, h)], corners = CORNERS, file = COMPACT) => {
  const width = Math.max(48, Math.round(w * share))
  const L = await lockup(width, file)
  const spot = await pickSpot(png, w, h, width, L.height, corners)
  const { left, top } = spot
  const layers = []
  const busy = await busyness(png, { left, top, width, height: L.height })
  const strength = Math.min(0.62, Math.max(0.22, busy * 2.4))
  const vw = Math.round(width * 1.9)
  const vh = Math.round(L.height * 1.9)
  const vig = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}"><defs><radialGradient id="v"><stop offset="0" stop-color="#070914" stop-opacity="${strength}"/><stop offset=".55" stop-color="#070914" stop-opacity="${(strength * 0.6).toFixed(3)}"/><stop offset="1" stop-color="#070914" stop-opacity="0"/></radialGradient></defs><rect width="${vw}" height="${vh}" fill="url(#v)"/></svg>`)
  const vx = left + Math.round(width / 2 - vw / 2)
  const vy = top + Math.round(L.height / 2 - vh / 2)
  // Crop the pool to the image (composite rejects inputs hanging off the edge).
  const x0 = Math.max(0, vx); const y0 = Math.max(0, vy)
  const x1 = Math.min(w, vx + vw); const y1 = Math.min(h, vy + vh)
  layers.push({ input: await sharp(vig).extract({ left: x0 - vx, top: y0 - vy, width: x1 - x0, height: y1 - y0 }).png().toBuffer(), left: x0, top: y0 })
  layers.push({ input: L.shadow, left: left - L.pad, top: top - L.pad + L.drop })
  layers.push({ input: L.logo, left, top })
  console.log(`  logo: ${spot.corner}`)
  return sharp(png).composite(layers).png().toBuffer()
}
