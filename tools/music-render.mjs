#!/usr/bin/env node
// ─── node tools/music-render.mjs [--out <dir>] [--seconds <n>] [song …] ─────
//
// Renders the composed songs (`src/game/audio/songs.ts`) offline, in a headless
// Chrome of its own (private profile, random debugging port), and reports per
// song: one pass's length, offline render speed (a rough CPU-cost gauge), integrated loudness (K-weighted, LUFS-style, gating
// omitted) and sample peak. That is how the songs' `gain` trims were set: every
// song in the rotation should land within ~1 LU of the others, so a handover
// never jumps in level.
//
// With --out it also writes <song>.mp3 (via ffmpeg-static) so the score can be
// listened to without playing the game.
//
// Usage:
//   node tools/music-render.mjs                     # all songs, stats only
//   node tools/music-render.mjs --out tmp/music drift boss
//   node tools/music-render.mjs --stems drift       # loudness per instrument
//   node tools/music-render.mjs --out tmp --wav --seconds 80 boss   # 44.1 kHz WAV (the trailer's bed)

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v }
const OUT = flag('--out')
const SECONDS = Number(flag('--seconds') ?? 0)
const WAV = argv.includes('--wav') ? (argv.splice(argv.indexOf('--wav'), 1), true) : false
const STEMS = argv.includes('--stems') ? (argv.splice(argv.indexOf('--stems'), 1), true) : false
const ALL = ['hub', 'scrapyard', 'blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress', 'drift', 'circuit', 'boss']
const ids = argv.length ? argv : ALL

// 1. Bundle songs.ts for the browser with Vite's own build (no extra deps).
const { build } = await import('vite')
const res = await build({
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': join(ROOT, 'src') } },
  build: {
    write: false,
    minify: false,
    lib: { entry: join(ROOT, 'src/game/audio/songs.ts'), formats: ['iife'], name: 'Songs' }
  }
})
const bundle = (Array.isArray(res) ? res[0] : res).output[0].code

// 2. A private headless Chrome.
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const port = 20000 + Math.floor(Math.random() * 20000)
const profile = mkdtempSync(join(tmpdir(), 'music-render-'))
const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let targets
for (let i = 0; i < 60 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() } catch { await sleep(200) }
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800))
  return r.result?.result?.value
}

await evaluate(bundle)
await evaluate(`
window.renderSong = async (id, seconds, wantWav, only) => {
  const full = Songs.getSong(id)
  const song = only ? { ...full, steps: full.steps.map(evs => evs.filter(e => e.i === only)) } : full
  const pass = Songs.songSeconds(song)
  const len = seconds || pass
  const SR = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (len + 1.5)), SR)
  const out = Songs.makeOut(ctx, ctx.destination, song)
  const spb = 60 / song.bpm / 4
  let t = 0.05, step = 0
  // Schedule the way the game's sequencer does — a little ahead of the clock,
  // chunk by chunk — so the graph only ever holds the voices that are live.
  // (Scheduling the whole song up front leaves tens of thousands of pending
  // nodes in the graph, and the render speed then measures that, not the music.)
  const CHUNK = 256 * 128 / SR
  const scheduleUntil = (until) => {
    while (t < Math.min(until, len)) {
      if (step >= song.steps.length) step = song.loopBar * 16
      Songs.playStep(out, song, step, t, spb)
      t += spb; step++
    }
  }
  scheduleUntil(CHUNK + 0.2)
  for (let at = CHUNK; at < len; at += CHUNK) {
    const until = at + CHUNK + 0.2
    ctx.suspend(at).then(() => { scheduleUntil(until); ctx.resume() })
  }
  const t0 = performance.now()
  const buf = await ctx.startRendering()
  const speed = (len + 1.5) / ((performance.now() - t0) / 1000)
  // K-weighting (BS.1770 shape: high shelf + high-pass), then mean square.
  const k = new OfflineAudioContext(2, buf.length, SR)
  const src = k.createBufferSource(); src.buffer = buf
  const shelf = k.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1500; shelf.gain.value = 4
  const hp = k.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5
  src.connect(shelf).connect(hp).connect(k.destination); src.start()
  const kb = await k.startRendering()
  let ms = 0, peak = 0
  const n = Math.min(kb.length, Math.floor(SR * len))
  for (let c = 0; c < 2; c++) {
    const d = kb.getChannelData(c), raw = buf.getChannelData(c)
    let s = 0
    for (let i = 0; i < n; i++) { s += d[i] * d[i]; const a = Math.abs(raw[i]); if (a > peak) peak = a }
    ms += s / n
  }
  const r = { id: only ? id + '/' + only : id, pass: +pass.toFixed(1), lufs: +(-0.691 + 10 * Math.log10(ms)).toFixed(1), peakDb: +(20 * Math.log10(peak)).toFixed(1), speed: Math.round(speed) }
  if (wantWav) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1)
    // A song that peaks over full scale (the boss theme, +0.4 dB) is pulled
    // down to -1 dBFS for the file instead of clipping in the 16-bit export.
    let top = 0
    for (let i = 0; i < buf.length; i++) top = Math.max(top, Math.abs(L[i]), Math.abs(R[i]))
    const k = top > 0.89 ? 0.89 / top : 1
    const pcm = new Int16Array(buf.length * 2)
    for (let i = 0; i < buf.length; i++) {
      pcm[2 * i] = Math.max(-1, Math.min(1, L[i] * k)) * 32767
      pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i] * k)) * 32767
    }
    const bytes = new Uint8Array(pcm.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    r.pcm = btoa(bin)
  }
  return r
}`)

if (OUT) mkdirSync(OUT, { recursive: true })
const ffmpeg = OUT ? require('ffmpeg-static') : null
console.log('song        pass(s)  loudness   peak    render speed')
if (STEMS) {
  for (const sid of ids) {
    const insts = await evaluate(`[...new Set(Songs.getSong(${JSON.stringify(sid)}).steps.flat().map(e => e.i))]`)
    for (const inst of insts) {
      const r = await evaluate(`renderSong(${JSON.stringify(sid)}, ${SECONDS}, false, ${JSON.stringify(inst)})`)
      console.log(`${r.id.padEnd(20)} ${String(r.lufs).padStart(6)} LU  ${String(r.peakDb).padStart(5)} dB  ${String(r.speed).padStart(5)}x realtime`)
    }
  }
  ws.close(); chrome.kill(); process.exit(0)
}
for (const sid of ids) {
  const r = await evaluate(`renderSong(${JSON.stringify(sid)}, ${SECONDS}, ${Boolean(OUT)})`)
  console.log(`${sid.padEnd(11)} ${String(r.pass).padStart(6)}  ${String(r.lufs).padStart(6)} LU  ${String(r.peakDb).padStart(5)} dB  ${String(r.speed).padStart(5)}x realtime`)
  if (OUT) {
    const raw = join(OUT, `${sid}.pcm`)
    writeFileSync(raw, Buffer.from(r.pcm, 'base64'))
    await new Promise((ok, fail) => {
      const enc = WAV ? [join(OUT, `${sid}.wav`)] : ['-b:a', '160k', join(OUT, `${sid}.mp3`)]
      const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', raw, ...enc], { stdio: 'inherit' })
      p.on('exit', c => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`))))
    })
    rmSync(raw)
  }
}
ws.close()
chrome.kill()
process.exit(0)
