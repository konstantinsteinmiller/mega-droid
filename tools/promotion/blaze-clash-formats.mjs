#!/usr/bin/env node
/**
 * blaze-clash in every store format (#120). The 16:9 master is recomposed,
 * never cropped through a fighter: for 1:1, 9:16, 2:3 and 4:3 it is laid in
 * the middle of a canvas of that aspect over a blurred stretch of itself and
 * Gemini paints the border out (outpainting, --profile battlecross); 16:10
 * and 3:2 are trims of the 4:3, 2:3 a trim of the 9:16 (its own outpaint kept
 * ghosts of the stretched fill: art-sheets/promotion/blaze-clash/formats/rejected/). Every master goes through Real-ESRGAN 4x, the
 * sizes are cut with Lanczos, the logo comes from logoOverlay.mjs (never
 * top-left), and the file list is the one the old neon set used.
 *
 *   node tools/promotion/blaze-clash-formats.mjs plates   the outpaint plates
 *   node tools/promotion/blaze-clash-formats.mjs paint    paint the missing masters
 *   node tools/promotion/blaze-clash-formats.mjs cut      upscale, cut, logo → src/assets/promotion/
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { LOGO_WIDTH, withCoverLogo } from './logoOverlay.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
const MASTER = join(ROOT, 'art-sheets', 'promotion', 'painted', 'blaze-clash', 'cover-16x9.jpg')
const DIR = join(ROOT, 'art-sheets', 'promotion', 'blaze-clash', 'formats')
const OUT = join(ROOT, 'src', 'assets', 'promotion')
const ESRGAN = process.env.REALESRGAN ?? join(homedir(), 'tools', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
mkdirSync(DIR, { recursive: true })

/** Canvas per family (width × height of the plate) and how big the 16:9 art sits in it. */
const FAMILIES = {
  '4x3': { size: [1376, 1032], k: 0.94 }
}
/**
 * Square and tall: the duo must fill the frame (readable at 140 px). Only the
 * BAND around the two fighters (x 75–1350, y 25–712 on the 1376×768 master)
 * goes in, at the canvas width, at \`top\` (a share of the height); Gemini
 * paints only the scene around it, and the original band (Real-ESRGAN 4x) is
 * laid back over the painting with feathered top and bottom edges, so the
 * fighters are never shrunk or redrawn.
 */
const BAND = { left: 75, top: 25, width: 1275, height: 687 }
const BANDED = {
  '1x1': { size: [1275, 1275], top: 0.5, scene: 'Above them: the dark furnace-room walls with rising flames, smoke and a few flying rubble chunks. Below them: the glowing furnace floor with fire, molten light and debris.' },
  '9x16': { size: [1275, 2267], top: 0.51, scene: 'ONE coherent tall furnace scene, like looking up a burning furnace shaft: ABOVE them, dark brick furnace walls with big columns of black smoke and tall flames rising to the top, embers and a few big flying rubble blocks; BELOW them, a wide fire pit with roaring flames, a stone ledge and a glowing iron GRATE at the bottom, more rubble flying up. No repeated bands, no horizontal stripes: it reads as one continuous space.' }
}
/** Every file, as the old neon set had it: [w, h, family, formats bare, formats logo]. */
const SIZES = [
  [1920, 1080, '16x9', ['jpg', 'webp'], ['jpg', 'webp']],
  [800, 450, '16x9', ['jpg', 'webp'], ['jpg', 'webp']],
  [400, 225, '16x9', ['jpg', 'webp'], ['jpg', 'webp']],
  [1360, 850, '4x3', ['jpg', 'webp'], ['jpg', 'webp']],
  [512, 340, '4x3', ['jpg', 'webp'], ['jpg', 'webp']],
  [512, 384, '4x3', ['jpg'], ['jpg']],
  [800, 800, '1x1b', ['jpg', 'webp'], ['jpg', 'webp']],
  [628, 628, '1x1b', ['jpg', 'webp'], ['jpg', 'webp']],
  [512, 512, '1x1b', ['jpg', 'webp'], ['jpg', 'webp']],
  [1080, 1920, '9x16b', ['jpg', 'webp'], ['jpg', 'webp']],
  [800, 1200, '9x16b', ['jpg', 'webp'], ['jpg', 'webp']]
]
const prompt = (f) => `Edit this image: the sharp painting in the middle is the finished artwork; the SOFT BLURRED areas around it (${f === '4x3' ? 'the strips at the top, bottom and sides' : 'above and below it'}) are empty space to paint. Extend the painting into them seamlessly, so the result is ONE sharp, finished, full-bleed image in exactly this ${f.replace('x', ':')} shape, with no visible border, frame or seam. There must be NO straight horizontal line, edge or change of light where the old picture ended: the fire, the walls and the floor flow continuously through those places, as one painting.

In the extended area continue the scene: the furnace hall — above, the dark furnace-room walls and ceiling with rising flames, embers and a few flying debris chunks; below, the glowing floor of the furnace with fire, molten light and debris. Keep it simpler and a bit darker than the middle, so the fight stays the focus. No new characters, no extra limbs, no copies of the robots.

Keep EVERYTHING already sharp exactly as it is: Flux (clean white, dark ink outlines), his cannon and the cyan ball, the Blaze Master and his fist behind the ball, the impact. Same glossy painterly style. Everything crisp: no blur, no smears. No text, no logo, no frame.`

const bandPrompt = (f) => `Edit this image: the sharp painting band in the middle shows two robots fighting; the DARK, SOFT areas above and below it are empty space to paint. Paint the scene into them so the result is ONE sharp, finished, full-bleed ${f.replace('x', ':')} image with no visible seam, edge or band. ${BANDED[f].scene}

Do NOT change, move, shrink or redraw the two robots or anything inside the sharp band; do not add any other character, limb or robot copy. Same glossy painterly cartoon style, warm fire light. Everything crisp: no blur, no smears. No text, no logo, no frame.`

/** The cover with the 4x band laid back over the 4x painting (both already upscaled). */
const bandComposite = async (paint4, band4, f) => {
  const [W, H] = BANDED[f].size
  const k = 4
  const bw = BAND.width * k
  const bh = BAND.height * k
  const top = Math.round((H * BANDED[f].top - BAND.height / 2) * k)
  const bg = await sharp(paint4).resize(W * k, H * k, { fit: 'fill' }).png().toBuffer()
  const fade = 28 * k
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="${fade / bh}" stop-color="#fff"/><stop offset="${1 - fade / bh}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="${bw}" height="${bh}" fill="url(#g)"/></svg>`)).extractChannel(0).toBuffer()
  const band = await sharp(await sharp(band4).extract({ left: BAND.left * k, top: BAND.top * k, width: bw, height: bh }).removeAlpha().png().toBuffer()).joinChannel(mask).png().toBuffer()
  return sharp(bg).composite([{ input: band, left: 0, top }]).png().toBuffer()
}

const step = process.argv[2]
if (step === 'plates') {
  for (const [f, { size: [W, H], k }] of Object.entries(FAMILIES)) {
    const w = Math.round(1376 * k)
    const h = Math.round(768 * k)
    // The art's top and bottom edges feathered into the blur, so the painter
    // does not keep a hard band edge (a straight seam line) in the result.
    const fade = Math.round(h * 0.12)
    const m = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="${fade / h}" stop-color="#fff"/><stop offset="${1 - fade / h}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`)).extractChannel(0).toBuffer()
    const art = await sharp(await sharp(MASTER).resize(w, h).removeAlpha().png().toBuffer()).joinChannel(m).png().toBuffer()
    await sharp(MASTER).resize(W, H, { fit: 'fill' }).blur(30).modulate({ brightness: 0.8 })
      .composite([{ input: art, left: Math.round((W - w) / 2), top: Math.round((H - h) / 2) }])
      .jpeg({ quality: 92 }).toFile(join(DIR, `plate-${f}.jpg`))
    writeFileSync(join(DIR, `prompt-${f}.txt`), prompt(f))
    console.log(`plate ${f}`)
  }
  for (const [f, { size: [W, H], top }] of Object.entries(BANDED)) {
    const band = await sharp(MASTER).extract(BAND).png().toBuffer()
    const y = Math.round(H * top - BAND.height / 2)
    // A dark warm plain fill: nothing of the fighters, so no ghosts.
    await sharp({ create: { width: W, height: H, channels: 3, background: '#2a1208' } })
      .composite([{ input: band, left: 0, top: y }])
      .jpeg({ quality: 92 }).toFile(join(DIR, `plate-${f}b.jpg`))
    writeFileSync(join(DIR, `prompt-${f}b.txt`), bandPrompt(f))
    console.log(`plate ${f}b`)
  }
} else if (step === 'paint') {
  for (const f of [...Object.keys(FAMILIES), ...Object.keys(BANDED).map((b) => `${b}b`)]) {
    if (existsSync(join(DIR, `cover-${f}.jpg`))) continue
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'promotion', 'paint-one.mjs'), join(DIR, `prompt-${f}.txt`), join(DIR, `cover-${f}.jpg`), join(DIR, `plate-${f}.jpg`)], { stdio: 'inherit', env: { ...process.env, ART_PROFILE: process.env.ART_PROFILE ?? 'battlecross' } })
    if (r.status !== 0) throw new Error(`paint ${f} failed`)
  }
} else if (step === 'cut') {
  const big = {}
  for (const f of ['16x9', ...Object.keys(FAMILIES), ...Object.keys(BANDED).map((b) => `${b}b`)]) {
    const src = f === '16x9' ? MASTER : join(DIR, `cover-${f}.jpg`)
    const dest = join(DIR, `x4-${f}.png`)
    const r = spawnSync(process.execPath, [join(homedir(), '.claude', 'skills', 'worker-budget', 'budget.mjs'), 'run', '--want', '2', '--', ESRGAN, '-i', src, '-o', dest, '-n', 'realesrgan-x4plus-anime', '-s', '4', '-j', '1:2:1'], { stdio: 'ignore' })
    if (r.status !== 0 || !existsSync(dest)) throw new Error(`upscale ${f} failed`)
    big[f] = dest
  }
  for (const b of Object.keys(BANDED)) {
    const out = join(DIR, `final-${b}b.png`)
    writeFileSync(out, await bandComposite(big[`${b}b`], big['16x9'], b))
    big[`${b}b`] = out
  }
  mkdirSync(OUT, { recursive: true })
  for (const [w, h, f, bare, logo] of SIZES) {
    // Small sizes (a 4x master shrunk 6-8x) get a light unsharp mask, or 512x512 probes soft.
    let pipe = sharp(big[f]).resize(w, h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    if (w <= 640) pipe = pipe.sharpen({ sigma: 0.6, m1: 0.5, m2: 1.5 })
    const img = await pipe.png().toBuffer()
    // Square: the top-right holds the Blaze Master's crown, so the logo goes on the floor.
    const withLogo = await withCoverLogo(img, w, h, undefined, f === '1x1b' ? ['bottom-left', 'bottom-right'] : undefined)
    for (const [name, buf, fmts] of [[`${w}x${h}`, img, bare], [`${w}x${h}-logo`, withLogo, logo]]) {
      for (const fmt of fmts) {
        const p = join(OUT, `${name}.${fmt}`)
        const bytes = fmt === 'jpg' ? await sharp(buf).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer() : await sharp(buf).webp({ quality: 90, smartSubsample: true }).toBuffer()
        // A watcher on the folder can hold a file for a moment (Windows "Invalid argument"): retry.
        for (let t = 0; ; t++) {
          try { writeFileSync(p, bytes); break } catch (e) { if (t > 8) throw e; await new Promise((r) => setTimeout(r, 400)) }
        }
      }
    }
    console.log(`${w}x${h}`)
  }
  // The Playgama share image (1.91:1, link previews): the 4x 16:9 master trimmed
  // top and bottom (both fighters stay whole: they span y 25–712 of 768), the logo
  // on, a light sharpen. Replaces the in-game render cut (it probed soft).
  {
    const W = 1280
    const H = 670
    const m = await sharp(big['16x9']).metadata()
    const ch = Math.round(m.width * H / W)
    const share = await sharp(await sharp(big['16x9']).extract({ left: 0, top: Math.round((m.height - ch) * 0.35), width: m.width, height: ch }).png().toBuffer())
      .resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6, m1: 0.5, m2: 1.5 }).png().toBuffer()
    const withLogo = await withCoverLogo(share, W, H, LOGO_WIDTH.share)
    const wrap = join(ROOT, 'store-art', 'playgama', 'wrap')
    writeFileSync(join(wrap, 'share-1280x670.png'), await sharp(withLogo).png({ compressionLevel: 9 }).toBuffer())
    writeFileSync(join(wrap, 'share-1280x670.jpg'), await sharp(withLogo).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer())
    writeFileSync(join(ROOT, 'store-art', 'playgama', 'previews', 'share-448x234.png'), await sharp(withLogo).resize(448, 234, { kernel: 'lanczos3' }).png().toBuffer())
    console.log('playgama share-1280x670')
  }
  // The old set's extra copy of the 800x450 logo webp, under its portal name.
  copyFileSync(join(OUT, '800x450-logo.webp'), join(OUT, 'mega-droid-promotion_800x450-logo.webp'))
} else throw new Error('step: plates | paint | cut')
