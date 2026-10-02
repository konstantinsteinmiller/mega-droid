// The store covers (`pnpm art:promotion`, #120): every size a portal asks
// for, as .jpg and .webp, once bare and once with the logo, at exactly the
// asked pixels. A cover of the wrong size is refused by a submission form.

import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

const DIR = resolve(__dirname, '../../src/assets/promotion')
const SIZES: Array<[number, number]> = [
  [800, 800], [1920, 1080], [1080, 1920], [800, 1200], [1360, 850], [800, 450], [400, 225], [512, 512], [628, 628], [512, 384], [512, 340]
]

describe('the store covers', () => {
  it('has every size, bare and with the logo, as jpg and webp, at the exact pixels', async () => {
    for (const [w, h] of SIZES) {
      for (const logo of ['', '-logo']) {
        for (const ext of ['jpg', 'webp']) {
          const file = resolve(DIR, `${w}x${h}${logo}.${ext}`)
          expect(existsSync(file), file).toBe(true)
          const meta = await sharp(file).metadata()
          expect([meta.width, meta.height], file).toEqual([w, h])
          expect(meta.format, file).toBe(ext === 'jpg' ? 'jpeg' : 'webp')
          // An upload, not a master: no cover over a megabyte.
          expect(statSync(file).size, file).toBeLessThan(1024 * 1024)
        }
      }
    }
  })

  it('the logo variant differs from the bare one (the lockup is laid on)', async () => {
    for (const [w, h] of SIZES) {
      const a = await sharp(resolve(DIR, `${w}x${h}.jpg`)).raw().toBuffer()
      const b = await sharp(resolve(DIR, `${w}x${h}-logo.jpg`)).raw().toBuffer()
      let diff = 0
      for (let i = 0; i < a.length; i += 97) if (Math.abs(a[i]! - b[i]!) > 24) diff++
      expect(diff, `${w}x${h}`).toBeGreaterThan(20)
    }
  })

  it('no logo sits in the top-left quarter (a portal lays its banner there)', async () => {
    for (const [w, h] of SIZES) {
      const box = { left: 0, top: 0, width: Math.floor(w / 2), height: Math.floor(h / 3) }
      const a = await sharp(resolve(DIR, `${w}x${h}.jpg`)).extract(box).raw().toBuffer()
      const b = await sharp(resolve(DIR, `${w}x${h}-logo.jpg`)).extract(box).raw().toBuffer()
      let diff = 0
      for (let i = 0; i < a.length; i += 31) if (Math.abs(a[i]! - b[i]!) > 40) diff++
      // The two files are separate lossy encodes: a little noise, never a logo's worth of change.
      expect(diff / (a.length / 31), `${w}x${h}`).toBeLessThan(0.01)
    }
  })
})
