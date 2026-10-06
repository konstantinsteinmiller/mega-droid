#!/usr/bin/env node
// ─── pnpm cinematic-trailer ────────────────────────────────────────────────
//
// Mega Droid's cinematic trailer (roadmap #X1), generated, never filmed by
// hand: every shot is real gameplay recorded on the virtual clock
// (tools/preview-video, scenario `trailer-shot`), every sound effect is the
// game's own synth replaying what the game asked for while filming, the music
// is the game's boss theme rendered offline, and Atlas speaks his own shipped
// English lines. The cut sits on the music's bars (`cut.mjs`).
//
//   pnpm cinematic-trailer                    record every shot, then assemble
//   pnpm cinematic-trailer --shots a,b        re-record only these, reuse the rest
//   pnpm cinematic-trailer --assemble         reuse every recorded shot
//   pnpm cinematic-trailer --draft            15 fps, 960x540: fast review cut
//   pnpm cinematic-trailer --draft --shots a --sheet   record only, a contact sheet per shot
//
// Output: preview-videos/mega-droid-cinematic-trailer.mp4 (H.264 High 4:2:0,
// CRF 14, AAC 320k, −14 LUFS). Shot masters (lossless) and stems sit in
// preview-videos/trailer/ (or trailer-draft/). Both are gitignored.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { CUT, BAR_S, VOICE_DIR } from './cut.mjs'
import { renderShotSfx } from './sfx-render.mjs'
import { startServer, assertOwnServer, originFor } from '../preview-video/lib/server.mjs'
import { launchBrowser } from '../preview-video/lib/browser.mjs'
import config from '../preview-video/preview.config.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const FFMPEG = require('ffmpeg-static')
const SR = 48000

// ── Options ──
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
const DRAFT = has('--draft')
const ASSEMBLE = has('--assemble')
const SHEET = has('--sheet')
const ONLY = val('--shots')?.split(/[,+]/).filter(Boolean) ?? null
const FPS = DRAFT ? 15 : 30
const W = DRAFT ? 960 : 1920
const H = DRAFT ? 540 : 1080
const WORK = join(ROOT, 'preview-videos', DRAFT ? 'trailer-draft' : 'trailer')
const FINAL = DRAFT
  ? join(WORK, 'mega-droid-cinematic-trailer-draft.mp4')
  : join(ROOT, 'preview-videos', 'mega-droid-cinematic-trailer.mp4')

const say = (...a) => console.log('[trailer]', ...a)
const die = (m) => { console.error(`[trailer] ✗ ${m}`); process.exit(1) }
for (const s of CUT.shots) if (ONLY && !ONLY.every((id) => CUT.shots.some((c) => c.id === id))) die(`unknown shot in --shots ${ONLY}`)

// ── The timeline: every shot starts on a frame boundary of the bar grid ──
const frameAt = (sec) => Math.round(sec * FPS)
let at = 0
const timeline = CUT.shots.map((s) => {
  const start = at
  at += s.bars * BAR_S
  return { ...s, start, frames: frameAt(at) - frameAt(start), startFrame: frameAt(start) }
})
const cardStart = at
const cardFrames = frameAt(at + CUT.endCard.bars * BAR_S) - frameAt(at)
const totalFrames = frameAt(at) + cardFrames
const TOTAL_S = totalFrames / FPS
say(`${timeline.length} shots + end card = ${TOTAL_S.toFixed(2)} s, ${totalFrames} frames @ ${FPS} fps`)

const run = (cmd, args, opts = {}) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: { ...process.env, ...(opts.env ?? {}) }, cwd: ROOT })
  let err = ''
  p.stderr?.on('data', (d) => { err += d })
  p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}\n${err.slice(-2000)}`))))
})
const ff = (args) => run(FFMPEG, ['-y', '-loglevel', 'error', ...args], { quiet: true })

/** Decode any audio file into interleaved stereo float32 at SR. */
const decode = (file) => {
  const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`decode ${file}: ${r.stderr}`)
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4)
}

/** Integrated loudness (LUFS) of interleaved stereo float32. */
const lufs = (buf) => {
  const tmp = join(WORK, 'lufs.f32')
  writeFileSync(tmp, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))
  const r = spawnSync(FFMPEG, ['-nostats', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', tmp, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' })
  rmSync(tmp)
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split('Summary:').pop() ?? '')
  return m ? Number(m[1]) : -70
}
const dbGain = (db) => Math.pow(10, db / 20)

// ── 1. Record ──
mkdirSync(WORK, { recursive: true })
const server = await startServer({
  repoRoot: ROOT, port: config.server.port, mode: 'dev', command: config.server.command,
  args: config.server.args, env: config.server.env, readyTimeoutMs: config.server.readyTimeoutMs,
  log: { info: (m) => say(m), ok: (m) => say(m), warn: (m) => say('!', m), step: (m) => say(m) }
})
const shutdown = async () => { try { await server.stop() } catch { /* gone */ } }
process.on('SIGINT', async () => { await shutdown(); process.exit(130) })

try {
  await assertOwnServer({ url: server.url, expectTitle: config.title, log: { ok: (m) => say(m), info: () => {}, warn: (m) => say('!', m) } })
  for (const s of timeline) {
    const dir = join(WORK, 'shots', s.id)
    const clip = join(dir, `trailer-shot-trailer-landscape-${W}x${H}.mp4`)
    const want = !ASSEMBLE && (!ONLY || ONLY.includes(s.id))
    if (!want && (existsSync(clip) || SHEET)) continue
    if (!want) throw new Error(`shot ${s.id} was never recorded — run without --assemble/--shots`)
    say(`── recording ${s.id} (${(s.frames / FPS).toFixed(2)} s)`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    await run(process.execPath, [
      join(ROOT, 'tools/preview-video/record.mjs'),
      '--formats', 'trailer', '--scenarios', 'trailer-shot',
      // One extra frame of handle: the cut takes exactly `frames`.
      '--duration', String((s.frames + 1) / FPS),
      '--fps', String(FPS), '--landscape', `${W}x${H}`, '--dpr', DRAFT ? '1' : '2',
      '--quality', DRAFT ? 'balanced' : 'lossless', '--no-poster',
      // Our server, by URL: the recorder never starts (or second-guesses) its own.
      '--url', server.url, '--no-serve',
      '--out', dir
    ], { env: { TRAILER_SHOT: s.id, TRAILER_AUDIO_LOG: join(dir, 'audio-log.json') } })
    if (!existsSync(clip)) throw new Error(`shot ${s.id}: the recorder wrote no clip`)
    if (SHEET) {
      const every = Math.max(1, Math.floor(s.frames / 12))
      await ff(['-i', clip, '-vf', `select='not(mod(n\,${every}))',scale=480:-1,tile=4x3`, '-frames:v', '1', join(dir, 'sheet.png')])
      say(`sheet → ${join(dir, 'sheet.png')}`)
    }
  }
  if (SHEET) { await shutdown(); process.exit(0) }

  // ── 2. Sound effects, per shot, through the game's synth ──
  const { browser, close } = await launchBrowser({ log: { info: () => {}, ok: () => {}, warn: (m) => say('!', m) } })
  try {
    for (const s of timeline) {
      const dir = join(WORK, 'shots', s.id)
      const r = await renderShotSfx(browser, server.url ?? originFor(config.server.port), join(dir, 'audio-log.json'), s.frames / FPS + 0.05, join(dir, 'sfx.wav'))
      say(`sfx ${s.id}: ${r.sounds} sounds`)
    }
    // A boom on every flash cut: the game's own heavy stomp, through the same synth.
    const hits = timeline.filter((s) => s.flash).map((s) => ({ t: s.startFrame / FPS, k: 's', n: 'stomp', p: 0, g: 1.3, m: 0 }))
    hits.push({ t: cardStart, k: 's', n: 'stomp', p: 0, g: 1.3, m: 0 })
    writeFileSync(join(WORK, 'cut-hits.json'), JSON.stringify({ fps: FPS, events: hits }))
    await renderShotSfx(browser, server.url, join(WORK, 'cut-hits.json'), TOTAL_S, join(WORK, 'cut-hits.wav'))
  } finally { await close() }
} finally {
  await shutdown()
}

// ── 3. Music: the boss theme ("Overload", 140 BPM), from bar 0 ──
const musicDir = join(WORK, 'music')
if (!existsSync(join(musicDir, 'boss.wav'))) {
  await run(process.execPath, [join(ROOT, 'tools/music-render.mjs'), '--out', musicDir, '--wav', '--seconds', String(Math.ceil(TOTAL_S + 4)), 'boss'])
}

// ── 4. The mix ──
const N = Math.ceil(TOTAL_S * SR)
const sfxBus = new Float32Array(N * 2)
const voBus = new Float32Array(N * 2)
const musicBus = new Float32Array(N * 2)
const EDGE = Math.round(0.008 * SR) // a click-free cut: 8 ms ramps at every shot edge
const place = (bus, src, at0, len, gain = 1) => {
  const o = Math.round(at0 * SR)
  const n = Math.min(len ?? src.length / 2, src.length / 2, N - o)
  for (let i = 0; i < n; i++) {
    const e = Math.min(1, i / EDGE, (n - 1 - i) / EDGE)
    bus[2 * (o + i)] += src[2 * i] * gain * e
    bus[2 * (o + i) + 1] += src[2 * i + 1] * gain * e
  }
}
for (const s of timeline) {
  place(sfxBus, decode(join(WORK, 'shots', s.id, 'sfx.wav')), s.startFrame / FPS, Math.round(s.frames / FPS * SR))
}
place(sfxBus, decode(join(WORK, 'cut-hits.wav')), 0, N)
// Atlas (and one laugh from Vex): each line levelled on its own, then placed.
const voSpans = []
for (const s of timeline) {
  for (const v of s.vo ?? []) {
    const line = decode(join(ROOT, VOICE_DIR, `${v.line}.ogg`))
    const t = s.startFrame / FPS + (v.beat ?? 0) * (BAR_S / 4)
    place(voBus, line, t, undefined, dbGain(CUT.levels.voice - lufs(line)) * (v.gain ?? 1))
    voSpans.push([t, t + line.length / 2 / SR])
  }
}
// The score: render starts its first step 50 ms in; bar 0 lands on frame 0.
const music = decode(join(musicDir, 'boss.wav')).subarray(Math.round(0.05 * SR) * 2)
place(musicBus, music, 0, N)
// Duck the score under every line (the game's own −7 dB, 50 ms down, 400 ms back),
// and fade it out over the end card's last bars.
const duck = dbGain(-CUT.levels.duckDb)
const fadeFrom = cardStart + (CUT.endCard.bars - CUT.endCard.fadeBars) * BAR_S
for (let i = 0; i < N; i++) {
  const t = i / SR
  let g = 1
  for (const [a, b] of voSpans) {
    if (t < a - 0.05 || t > b + 0.4) continue
    const k = t < a ? (a - t) / 0.05 : t > b ? (t - b) / 0.4 : 0
    g = Math.min(g, duck + (1 - duck) * k)
  }
  if (t > fadeFrom) g *= Math.max(0, 1 - (t - fadeFrom) / (TOTAL_S - fadeFrom))
  musicBus[2 * i] *= g
  musicBus[2 * i + 1] *= g
}
const gm = dbGain(CUT.levels.music - lufs(musicBus))
const gs = dbGain(CUT.levels.sfx - lufs(sfxBus))
const mix = new Float32Array(N * 2)
for (let i = 0; i < mix.length; i++) mix[i] = musicBus[i] * gm + sfxBus[i] * gs + voBus[i]
const gMaster = dbGain(CUT.levels.master - lufs(mix))
for (let i = 0; i < mix.length; i++) mix[i] *= gMaster
const mixFile = join(WORK, 'mix.f32')
writeFileSync(mixFile, Buffer.from(mix.buffer))
say(`mix: music ×${gm.toFixed(2)}, sfx ×${gs.toFixed(2)}, master ×${gMaster.toFixed(2)}, ${voSpans.length} voice lines`)

// ── 5. Picture: the shots on the bar grid, white flashes on the hits, the end card ──
const inputs = []
const chains = []
timeline.forEach((s, k) => {
  inputs.push('-i', join(WORK, 'shots', s.id, `trailer-shot-trailer-landscape-${W}x${H}.mp4`))
  const flash = s.flash ? `,fade=t=in:st=0:d=${s.flash}:color=white` : ''
  const out = s.whiteOut ? `,fade=t=out:st=${(s.frames / FPS - s.whiteOut).toFixed(3)}:d=${s.whiteOut}:color=white` : ''
  chains.push(`[${k}:v]trim=end_frame=${s.frames},setpts=PTS-STARTPTS,fps=${FPS},format=yuv444p${flash}${out}[v${k}]`)
})
// End card: the boot loader's night blue and grid, the logo fading in.
const cardS = (cardFrames / FPS).toFixed(4)
const logoPx = Math.round(512 * H / 1080)
inputs.push('-f', 'lavfi', '-i', `color=c=0x0b1426:s=${W}x${H}:r=${FPS}:d=${cardS}`)
inputs.push('-loop', '1', '-framerate', String(FPS), '-t', cardS, '-i', join(ROOT, 'public/images/logo/logo_512x512.png'))
const ci = timeline.length
chains.push(`[${ci}:v]drawgrid=w=${Math.round(96 * H / 1080)}:h=${Math.round(96 * H / 1080)}:t=${DRAFT ? 1 : 2}:c=0x22355c@0.55,format=yuv444p[bg]`)
chains.push(`[${ci + 1}:v]scale=${logoPx}:${logoPx},format=rgba,fade=t=in:st=0:d=0.5:alpha=1[logo]`)
chains.push(`[bg][logo]overlay=(W-w)/2:(H-h)/2:shortest=1,fade=t=in:st=0:d=0.12:color=white,fade=t=out:st=${(cardFrames / FPS - 0.6).toFixed(3)}:d=0.6,format=yuv444p[card]`)
const vlist = timeline.map((_, k) => `[v${k}]`).join('') + '[card]'
chains.push(`${vlist}concat=n=${timeline.length + 1}:v=1:a=0,format=yuv420p[v]`)
mkdirSync(dirname(FINAL), { recursive: true })
await ff([
  ...inputs,
  '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', mixFile,
  '-filter_complex', chains.join(';'),
  '-map', '[v]', '-map', `${ci + 2}:a`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', DRAFT ? '22' : '14', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-af', 'alimiter=limit=0.89:level=false',
  '-c:a', 'aac', '-b:a', '320k', '-ar', String(SR),
  '-frames:v', String(totalFrames), '-shortest', '-movflags', '+faststart',
  FINAL
])
rmSync(mixFile)
say(`✓ ${FINAL}`)
