#!/usr/bin/env node
/**
 * One Gemini paint outside a scenario: a prompt file, reference images, an
 * output path. Same window, profile, throttle and allowance ledger as
 * art-promotion.mjs. Used for collage parts (blaze-clash's turned Blaze
 * Master: tools/promotion/blaze-clash-collage.mjs).
 *
 *   [ART_PROFILE=<name>] node tools/promotion/paint-one.mjs <prompt.txt> <out.jpg> <ref.jpg> [ref.jpg …]
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sharp = createRequire(join(ROOT, 'package.json'))('sharp')
const [promptFile, out, ...refs] = process.argv.slice(2)
if (!promptFile || !out || !refs.length) throw new Error('usage: paint-one.mjs <prompt.txt> <out.jpg> <ref.jpg> [ref.jpg …]')

const { loadConfig } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'config.mjs')).href)
const { Gemini } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'gemini.mjs')).href)
const { ledger } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'usage.mjs')).href)
let g = loadConfig(ROOT).gemini
// ART_PROFILE=<name>: another Gemini profile (~/.art-desk/profiles/<name>), as art-promotion's --profile.
if (process.env.ART_PROFILE) {
  const { homedir } = await import('node:os')
  const profileDir = join(homedir(), '.art-desk', 'profiles', process.env.ART_PROFILE)
  g = { ...g, profileDir, usageFile: join(profileDir, 'art-desk-usage.json') }
}
const { countGeneration } = ledger(g.usageFile)
const painter = new Gemini({ root: ROOT, profileDir: g.profileDir, url: g.url, chrome: g.chrome, chromeArgs: g.chromeArgs, log: (l) => console.log(`    ${l}`) })
try {
  const { bytes } = await painter.paint({
    refFile: null, styleFiles: refs.map((r) => resolve(r)), prompt: readFileSync(promptFile, 'utf8'), timeoutMs: g.timeoutSeconds * 1000,
    onPhase: (p, quiet) => { if (!quiet) console.log(`    ${p}`) }
  })
  await sharp(bytes).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(resolve(out))
  countGeneration()
  console.log(`✓ ${out}`)
} finally {
  await painter.closeWindow().catch(() => {})
}
