// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

// ─── One icon source, every raster rendered from it ────────────────────────
//
// public/icons/icon.svg is the app icon (Flux's helmet in its charged
// ring, written by store-art/brand/logo.mjs). scripts/render-icons.mjs renders every PNG and favicon.ico from it,
// in Chrome, because the SVG switches to a bold small-size mark through a
// media query that only a browser evaluates. These pin the contracts that
// script and the page rely on, so a hand-edited PNG or a dropped favicon
// layer shows up here rather than on a portal's store page.

const root = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(root, rel))
const svg = read('public/icons/icon.svg').toString('utf8')
const manifest = JSON.parse(read('public/manifest.json').toString('utf8')) as {
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
}

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (buf: Buffer) => {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

describe('icon.svg', () => {
  it('is a 512 square with the tile, the badge and the small-size mark', () => {
    expect(svg).toMatch(/<svg [^>]*viewBox="0 0 512 512"/)
    expect(svg).toMatch(/<g class="bg">/)
    expect(svg).toMatch(/<g class="d"/)
    expect(svg).toMatch(/<g class="s"/)
  })

  it('swaps to the bold head at favicon size, by its own width', () => {
    expect(svg).toContain('.s{display:none}@media (max-width:40px){.d{display:none}.s{display:inline}}')
  })

  it('references nothing outside itself (the rendered head is inlined as a data URI)', () => {
    const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', '')
    expect(body).not.toMatch(/https?:|@import|font-family/)
    const images = [...body.matchAll(/<image\b[^>]*href="([^"]{0,16})/g)]
    expect(images.length).toBeGreaterThan(0)
    for (const m of images) expect(m[1]).toMatch(/^data:image\//)
  })
})

describe('the rendered icons', () => {
  it.each([
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
    ['public/icons/icon-maskable-512.png', 512]
  ])('%s is %i px square', (rel, size) => {
    expect(pngSize(read(rel))).toEqual({ w: size, h: size })
  })

  it('the tile icons keep transparent corners; maskable and apple-touch are full bleed', async () => {
    const corner = async (rel: string) => {
      const { data, info } = await sharp(read(rel)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      return data[info.channels - 1]! // alpha of pixel (0, 0)
    }
    expect(await corner('public/icons/icon-192.png')).toBe(0)
    expect(await corner('public/icons/icon-512.png')).toBe(0)
    expect(await corner('public/icons/icon-maskable-512.png')).toBe(255)
    expect(await corner('public/icons/apple-touch-icon.png')).toBe(255)
  })

  it('favicon.ico carries the 16, 32 and 48 px layers index.html announces, as PNG', () => {
    const ico = read('public/favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1) // icon, not cursor
    const count = ico.readUInt16LE(4)
    const sizes: number[] = []
    for (let i = 0; i < count; i++) {
      const e = 6 + 16 * i
      const size = ico.readUInt8(e) || 256
      const off = ico.readUInt32LE(e + 12)
      expect(pngSize(ico.subarray(off))).toEqual({ w: size, h: size })
      sizes.push(size)
    }
    expect(sizes).toEqual([16, 32, 48])
    const html = read('index.html').toString('utf8')
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">')
  })

  it('every manifest icon exists at the size it declares', () => {
    for (const icon of manifest.icons) {
      const rel = `public/${icon.src}`
      expect(existsSync(resolve(root, rel)), rel).toBe(true)
      if (icon.type !== 'image/png') continue
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(read(rel))).toEqual({ w, h })
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })
})
