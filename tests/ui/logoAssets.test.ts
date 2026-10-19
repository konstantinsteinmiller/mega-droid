// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

// ─── The logo set (#185) ───────────────────────────────────────────────────
//
// store-art/brand/logo.mjs writes every variant into public/images/logo/ as a
// vector master, a transparent PNG master at least 2000 px wide and WebPs for
// the game. The game, the trailer's end card and the cover compositing all
// read from there; these pin that nothing points at a file that is not there
// and that the old hex-badge rasters are not used any more.

const root = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')
const VARIANTS = ['mega-droid-logo', 'mega-droid-wordmark', 'mega-droid-compact']

describe('public/images/logo', () => {
  it.each(VARIANTS)('%s has a vector master and a transparent PNG master >= 2000 px wide', async (name) => {
    const svg = read(`public/images/logo/${name}.svg`)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+">/)
    expect(svg).not.toMatch(/<text\b|https?:\/\/(?!www\.w3\.org)/)
    // The lockup carries the rendered head, inlined: nothing to fetch.
    for (const m of svg.matchAll(/<image\b[^>]*href="([^"]{0,16})/g)) expect(m[1]).toMatch(/^data:image\//)
    const master = readdirSync(resolve(root, 'public/images/logo')).find((f) => f.startsWith(`${name}-`) && f.endsWith('.png'))
    expect(master, name).toBeTruthy()
    const png = readFileSync(resolve(root, 'public/images/logo', master!))
    const meta = await sharp(png).metadata()
    expect(meta.width).toBeGreaterThanOrEqual(2000)
    expect(meta.hasAlpha).toBe(true)
    // Transparent corners: a logo, not a logo on a card.
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(data[info.channels - 1]).toBe(0)
  })

  it('the emblem is the head rendered from the game model: a transparent 2048 master and its WebPs', async () => {
    const meta = await sharp(readFileSync(resolve(root, 'public/images/logo/mega-droid-emblem-2048.png'))).metadata()
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([2048, 2048, true])
    for (const f of ['mega-droid-emblem-512.webp', 'mega-droid-emblem-256.webp', 'mega-droid-emblem-face.png']) {
      expect(existsSync(resolve(root, 'public/images/logo', f)), f).toBe(true)
    }
    expect(existsSync(resolve(root, 'store-art/brand/render-emblem.mjs'))).toBe(true)
  })

  it('every logo file the game, the trailer and the store tools name exists', () => {
    const refs = [
      ...read('src/components/story/DebriefLayer.vue').matchAll(/\/images\/logo\/([\w.-]+)/g),
      ...read('tools/cinematic-trailer/make.mjs').matchAll(/public\/images\/logo\/([\w.-]+)/g),
      ...read('index.html').matchAll(/\/images\/logo\/([\w.-]+)/g),
      ...read('src/components/atoms/FLogoProgress.vue').matchAll(/\/images\/logo\/([\w.-]+)/g),
      ...read('src/components/story/logoLockup.ts').matchAll(/\/images\/logo\/([\w.-]+)/g)
    ].map((m) => m[1]!)
    expect(refs.length).toBeGreaterThanOrEqual(2)
    for (const f of refs) expect(existsSync(resolve(root, 'public/images/logo', f)), f).toBe(true)
  })

  it('the cover compositing lays the v2 master on', () => {
    expect(read('tools/promotion/logoOverlay.mjs')).toContain("join(ROOT, 'public', 'images', 'logo', 'mega-droid-logo.svg')")
    for (const tool of ['tools/art-promotion.mjs', 'scripts/render-thumbnail.mjs', 'tools/promotion/cover-logo.mjs']) {
      expect(read(tool), tool).toContain('withCoverLogo')
    }
  })

  it('the cover logo never goes in the top-left (portal banners cover it up to the middle)', async () => {
    const { pickSpot, CORNERS } = await import('../../tools/promotion/logoOverlay.mjs')
    expect(CORNERS).not.toContain('top-left')
    expect(read('tools/art-promotion.mjs')).toMatch(/The TOP-LEFT \(the left half of the top half\) holds only background/)
    // A cover calm only in its top-left corner still gets the logo elsewhere.
    for (const [w, h, bw, bh] of [[1920, 1080, 614, 110], [1080, 1920, 497, 400], [800, 800, 288, 230], [400, 225, 128, 23]]) {
      const noise = Buffer.alloc(w * h * 3)
      for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24
      const png = await sharp(noise, { raw: { width: w, height: h, channels: 3 } })
        .composite([{ input: { create: { width: Math.round(w / 2), height: Math.round(h / 2), channels: 3, background: '#203040' } }, left: 0, top: 0 }]).png().toBuffer()
      const spot = await pickSpot(png, w, h, bw, bh)
      expect(spot.corner).not.toBe('top-left')
      expect(spot.left >= w / 2 || spot.top >= h / 2, `${w}x${h}`).toBe(true)
    }
  })

  it('nothing ships the v1 hex-badge rasters any more', () => {
    for (const f of ['src/components/story/DebriefLayer.vue', 'tools/cinematic-trailer/make.mjs']) {
      expect(read(f), f).not.toMatch(/logo_\d+x\d+/)
    }
  })
})
