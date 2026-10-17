#!/usr/bin/env node
// #176: every cover candidate as a 1920x1080 .webp (store-art/covers/1920x1080/)
// and a lighter 1280-wide copy for the vote page (cover-vote/covers/).
//   node tools/promotion/cover-vote.mjs
// A candidate whose master is not painted yet is skipped with a note.
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
const P = join(ROOT, 'art-sheets', 'promotion', 'painted')
// The first neon painting (the one #120 scored) was archived when it was repainted.
const firstNeon = () => {
  const dir = join(P, 'neon', 'replaced')
  const f = existsSync(dir) && readdirSync(dir).filter((n) => n.startsWith('cover-16x9.')).sort()[0]
  return f ? join(dir, f) : null
}

/** id → source; the ids are the vote page's and the Worker's (`COVERS` in cover-vote/index.html). */
const SOURCES = {
  frost: join(P, 'frost', 'cover-16x9.jpg'),
  render: join(ROOT, 'store-art', 'playgama', 'covers', 'landscape-1920x1080.png'),
  blaze: join(P, 'blaze', 'cover-16x9.jpg'),
  scrapper: join(P, 'cover-16x9.jpg'),
  'neon-first': firstNeon(),
  'render-logo': join(ROOT, 'store-art', 'playgama', 'covers-logo', 'landscape-1920x1080.png'),
  vex: join(P, 'vex', 'cover-16x9.jpg'),
  neon: join(P, 'neon', 'cover-16x9.jpg'),
  volt: join(P, 'volt', 'cover-16x9.jpg'),
  magnet: join(P, 'magnet', 'cover-16x9.jpg'),
  drill: join(P, 'drill', 'cover-16x9.jpg'),
  rotor: join(P, 'rotor', 'cover-16x9.jpg')
}

const FULL = join(ROOT, 'store-art', 'covers', '1920x1080')
const WEB = join(ROOT, 'cover-vote', 'covers')
mkdirSync(FULL, { recursive: true })
mkdirSync(WEB, { recursive: true })
for (const [id, src] of Object.entries(SOURCES)) {
  if (!src || !existsSync(src)) { console.log(`  skip ${id}: not painted yet`); continue }
  const img = sharp(src).resize(1920, 1080, { fit: 'cover' })
  await img.clone().webp({ quality: 90 }).toFile(join(FULL, `${id}.webp`))
  await img.clone().resize(1280, 720).webp({ quality: 82 }).toFile(join(WEB, `${id}.webp`))
  console.log(`  ${id}`)
}
