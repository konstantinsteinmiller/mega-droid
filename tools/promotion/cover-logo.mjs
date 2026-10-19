#!/usr/bin/env node
// #185: the painted 16:9 covers with the logo in the calmest allowed corner
// (tools/promotion/logoOverlay.mjs), next to their masters, and the vote
// page's logo render (cover-vote.mjs's `render-logo`) from the Playgama
// covers-logo landscape. The masters are only read.
//   node tools/promotion/cover-logo.mjs
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withCoverLogo } from './logoOverlay.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
const FULL = join(ROOT, 'store-art', 'covers', '1920x1080')

for (const id of ['blaze-clash']) {
  const src = join(FULL, `${id}.jpg`)
  if (!existsSync(src)) { console.log(`  skip ${id}: no master`); continue }
  const base = await sharp(src).resize(1920, 1080, { fit: 'cover' }).png().toBuffer()
  await sharp(await withCoverLogo(base, 1920, 1080)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(join(FULL, `${id}-logo.jpg`))
  console.log(`  ${id}-logo.jpg`)
}
const render = sharp(join(ROOT, 'store-art', 'playgama', 'covers-logo', 'landscape-1920x1080.png')).resize(1920, 1080, { fit: 'cover' })
await render.clone().webp({ quality: 90 }).toFile(join(FULL, 'render-logo.webp'))
await render.clone().resize(1280, 720).webp({ quality: 82 }).toFile(join(ROOT, 'cover-vote', 'covers', 'render-logo.webp'))
console.log('  render-logo.webp')
