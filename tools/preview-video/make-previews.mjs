#!/usr/bin/env node
// ─── CrazyGames preview videos: boss fight + platforming, SUCCESS and FAIL ──
//
//   node tools/preview-video/make-previews.mjs                 record every shot, then cut
//   node tools/preview-video/make-previews.mjs --assemble      cut from the recorded shots
//   node tools/preview-video/make-previews.mjs --sizes portrait,tall --shots ice,scrap-win
//
// Two versions (A: forge hammers + rail cart + the Blaze Master; B: ice pillar
// hall + the Scrapper), each a SUCCESS and a FAIL, in three sizes
// (720x1280, 1280x720, 1080x1620). Every shot is a take of the real game
// (scenarios/_pv.mjs) on the recorder's virtual clock; the cut joins them
// with a 4-frame white flash. Output: preview-videos/crazygames/ (H.264 High,
// 4:2:0, CRF 14, no audio) plus a poster PNG each. Needs the recorder's dev
// server on :2091 (this script starts none): see CONTRACT.md.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FFMPEG = createRequire(join(ROOT, 'package.json'))('ffmpeg-static')
const argv = process.argv.slice(2)
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
const ASSEMBLE = argv.includes('--assemble')
const URL_ = val('--url') ?? 'http://localhost:2091'
const FPS = 30
const FLASH = 0.12
// The first frame of a take can still be the page the take replaced: drop two.
const SKIP = 0.07

const SIZES = {
  portrait: { w: 720, h: 1280, dpr: 2 },
  landscape: { w: 1280, h: 720, dpr: 1.6 },
  tall: { w: 1080, h: 1620, dpr: 2 }
}
// Recorded length of each shot (s); the cut uses `take` of it.
const SHOTS = {
  hammers: { rec: 2.6, take: 2.5 },
  cart: { rec: 2.0, take: 1.9 },
  ice: { rec: 3.2, take: 3.1 },
  'blaze-win': { rec: 6.5, take: 6.3 },
  'blaze-fail': { rec: 6.7, take: 6.6 },
  'scrap-win': { rec: 7.3, take: 7.2 },
  'scrap-fail': { rec: 7.3, take: 7.2 }
}
const VIDEOS = {
  'a-success': ['hammers', 'cart', 'blaze-win'],
  'a-fail': ['hammers', 'cart', 'blaze-fail'],
  'b-success': ['ice', 'scrap-win'],
  'b-fail': ['ice', 'scrap-fail']
}

const sizes = (val('--sizes')?.split(',') ?? Object.keys(SIZES))
const only = val('--shots')?.split(',') ?? null
const outRoot = join(ROOT, 'preview-videos', 'pv')
const finalDir = join(ROOT, 'preview-videos', 'crazygames')
const say = (...a) => console.log('[pv]', ...a)

const run = (cmd, args, env = {}) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: ROOT })
  p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}`))))
})

const clipOf = (size, shot) => {
  const s = SIZES[size]
  return join(outRoot, size, shot, `pv-shot-pv-${size}-${s.w}x${s.h}.mp4`)
}

if (!ASSEMBLE) {
  for (const size of sizes) {
    const s = SIZES[size]
    for (const [shot, d] of Object.entries(SHOTS)) {
      if (only && !only.includes(shot)) continue
      const dir = join(outRoot, size, shot)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      say(`── ${size} / ${shot} (${d.rec} s)`)
      await run(process.execPath, [
        join(ROOT, 'tools/preview-video/record.mjs'),
        '--formats', 'pv', '--scenarios', 'pv-shot', '--orientations', size,
        '--duration', String(d.rec), '--fps', String(FPS), '--quality', 'lossless', '--no-poster',
        '--url', URL_, '--no-serve', '--out', dir
      ], { PV_SHOT: shot })
      if (!existsSync(clipOf(size, shot))) throw new Error(`no clip for ${size}/${shot}`)
    }
  }
}

// ── The cut ──
mkdirSync(finalDir, { recursive: true })
for (const size of sizes) {
  const s = SIZES[size]
  for (const [name, shots] of Object.entries(VIDEOS)) {
    const inputs = shots.map((id) => clipOf(size, id))
    if (inputs.some((f) => !existsSync(f))) { say(`skip ${name} ${size}: shots missing`); continue }
    const out = join(finalDir, `${name}-${s.w}x${s.h}.mp4`)
    // Trim every shot to its `take`, then xfade through white between them.
    const f = []
    shots.forEach((id, k) => f.push(`[${k}:v]trim=start=${SKIP}:duration=${SHOTS[id].take},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[v${k}]`))
    let acc = 'v0'
    let len = SHOTS[shots[0]].take
    for (let k = 1; k < shots.length; k++) {
      const off = (len - FLASH).toFixed(3)
      f.push(`[${acc}][v${k}]xfade=transition=fadewhite:duration=${FLASH}:offset=${off}[x${k}]`)
      acc = `x${k}`
      len = len - FLASH + SHOTS[shots[k]].take
    }
    await run(FFMPEG, ['-y', '-loglevel', 'error', ...inputs.flatMap((i) => ['-i', i]),
      '-filter_complex', f.join(';'), '-map', `[${acc}]`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-movflags', '+faststart', '-an', out])
    await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', out, '-vf', `select=eq(n\\,${Math.round(len * FPS * 0.62)})`, '-frames:v', '1', out.replace(/\.mp4$/, '.png')])
    say(`✓ ${out} — ${len.toFixed(2)} s`)
  }
}
