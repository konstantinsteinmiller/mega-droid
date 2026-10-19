#!/usr/bin/env node
/**
 * blaze-clash's collage guide: Gemini would not turn the Blaze Master by an
 * edit, so he is painted alone and laid into the kept clash.
 *
 *   1. node tools/promotion/paint-one.mjs art-sheets/promotion/blaze-clash/collage/boss-prompt.txt \
 *        art-sheets/promotion/blaze-clash/collage/boss.jpg art-sheets/promotion/blaze-clash/collage/ref-blaze.jpg
 *      (the Blaze Master alone, punching left, on flat magenta)
 *   2. node tools/promotion/blaze-clash-collage.mjs <base.jpg>
 *      keys the magenta out and composites him over the base (the kranck
 *      master) → art-sheets/promotion/blaze-clash/cover-16x9.png, the plate
 *   3. node tools/art-promotion.mjs --scenario blaze-clash --no-cut --force
 *      the scenario's edit cleans the collage up and paints the impact in one
 *      pass. The head-on master (LEFT 575, no BALL re-lay) is
 *      painted/blaze-clash/replaced/cover-16x9.painterly-headon.jpg
 *   5. REFRAMED (the Blaze Master was cut by the right edge):
 *      --reframe painted/blaze-clash/replaced/cover-16x9.depth.jpg blaze-clash/cover-16x9.png 0.86 54
 *      and the scenario's edit is collage/reframe-prompt.txt's outpaint.
 *   6. two clean-up passes on the reframed master (whole images, no patching):
 *      ART_PROFILE=battlecross paint-one.mjs collage/cleanup-prompt.txt → collage/cleanup-pass.jpg,
 *      then collage/cleanup2-prompt.txt on that → collage/cleanup-pass2.jpg (the kept master).
 *   4. that pass left one old boot under the fist again: patched from the
 *      head-on master, which is clean there —
 *      --patch collage/depth-edit.jpg painted/blaze-clash/replaced/cover-16x9.painterly-headon.jpg <out> 915 610 90 105
 *
 * The earlier boss-turned master (LEFT 525) was cleaned by
 * collage/harmonise-prompt.txt instead, and the pass that kept the cyan ball
 * left one boot of the old Blaze Master under his fist, so that spot (a
 * feathered ellipse at 915,600, 105×125 on the 1376×768 master) was patched
 * from a pass that had removed it (collage/harmonised-ball.jpg ← harmonised-clean.jpg):
 *      `node tools/promotion/blaze-clash-collage.mjs --patch <ball.jpg> <clean.jpg> <out.jpg>`
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
const DIR = join(ROOT, 'art-sheets', 'promotion', 'blaze-clash')
// --reframe: the whole scene scaled down and laid at the left, over a blurred
// stretch of itself, so the cut-off Blaze Master has room on the right; the
// edit then paints the soft border out (collage/reframe-prompt.txt).
if (process.argv[2] === '--reframe') {
  const [, src, out, k = 0.86, top = 54] = process.argv.slice(2)
  const W = 1376
  const H = 768
  const small = await sharp(src).resize(Math.round(W * k), Math.round(H * k)).png().toBuffer()
  await sharp(src).resize(W, H).blur(24).composite([{ input: small, left: 0, top: Number(top) }]).png().toFile(out)
  console.log(`✓ ${out}`)
  process.exit(0)
}
if (process.argv[2] === '--patch') {
  // Optional ellipse: cx cy rx ry on the 1376×768 master.
  const [, ball, clean, out, cx = 915, cy = 600, rx = 105, ry = 125] = process.argv.slice(2)
  const W = 1376
  const H = 768
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="f"><feGaussianBlur stdDeviation="${Number(rx) < 100 ? 8 : 10}"/></filter></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" filter="url(#f)"/></svg>`
  const mask = await sharp(Buffer.from(svg)).resize(W, H).extractChannel(0).toBuffer()
  const patch = await sharp(clean).resize(W, H).joinChannel(mask).png().toBuffer()
  await sharp(ball).composite([{ input: patch }]).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(out)
  console.log(`✓ ${out}`)
  process.exit(0)
}
const base = process.argv[2]
if (!base) throw new Error('usage: blaze-clash-collage.mjs <base.jpg> | --patch <ball.jpg> <clean.jpg> <out.jpg>')

// Where he goes on the 1376-wide master: his fist overlapping the right of
// Flux's ball, which is laid back on top (BALL) so the fist sits behind it.
const SCALE = 0.86
const LEFT = 530
const TOP = 30
// Flux's plasma ball on the base (centre, radius): re-laid over the boss.
const BALL = { x: 718, y: 385, r: 80 }

const { data, info } = await sharp(join(DIR, 'collage', 'boss.jpg')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
  // Magenta key with a soft edge: how far the pixel is from #ff00ff.
  const m = Math.min(r, b) - g
  data[i + 3] = m > 120 ? 0 : m > 60 ? Math.round(255 * (120 - m) / 60) : 255
}
const boss = await sharp(data, { raw: info }).resize(Math.round(info.width * SCALE)).png().toBuffer()
const { width: W, height: H } = await sharp(base).metadata()
const meta = await sharp(boss).metadata()
// Crop what would fall off the right edge.
const fit = await sharp(boss).extract({ left: 0, top: 0, width: Math.min(meta.width, W - LEFT), height: Math.min(meta.height, H - TOP) }).png().toBuffer()
const ballMask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="f"><feGaussianBlur stdDeviation="1.5"/></filter></defs><circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}" fill="#fff" filter="url(#f)"/></svg>`)).resize(W, H).extractChannel(0).toBuffer()
const ball = await sharp(base).resize(W, H).joinChannel(ballMask).png().toBuffer()
await sharp(base).composite([{ input: fit, left: LEFT, top: TOP }, { input: ball }]).png().toFile(join(DIR, 'cover-16x9.png'))
console.log(`✓ ${join(DIR, 'cover-16x9.png')}`)
