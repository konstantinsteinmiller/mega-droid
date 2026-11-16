#!/usr/bin/env node
// #198: takes 6-10 of the toon bolt pickups, synthesised here (no API): soft
// sine and bell tones with round attacks and exponential tails — nothing that
// can hiss or scratch. tools/sfx/candidates/boltToon/v6..v10.mp3 (needs ffmpeg-static).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ROOT } from '../voice/lib.mjs'

const SR = 44100
const OUT = join(ROOT, 'tools/sfx/candidates/boltToon')
mkdirSync(OUT, { recursive: true })

/** A tone: sine partials [[ratio, gain]], pitch glide f0→f1 over `glide` s, soft attack, exponential decay. */
const tone = (buf, at, dur, f0, f1, glide, partials, gain, attack = 0.006, decay = 5) => {
  const n = Math.floor(dur * SR)
  const s0 = Math.floor(at * SR)
  let ph = 0
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / SR
    const f = glide > 0 ? f0 + (f1 - f0) * Math.min(1, t / glide) : f0
    ph += (2 * Math.PI * f) / SR
    const env = Math.min(1, t / attack) * Math.exp(-decay * t / dur)
    let v = 0
    for (const [r, g] of partials) v += Math.sin(ph * r) * g
    buf[s0 + i] += v * env * gain
  }
}
/** One-pole low-pass: takes the last edge off. */
const lowpass = (buf, hz) => {
  const a = 1 - Math.exp(-2 * Math.PI * hz / SR)
  let y = 0
  for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] = y }
}
const make = (dur, fn) => {
  const buf = new Float32Array(Math.floor(dur * SR))
  fn(buf)
  lowpass(buf, 6500)
  let peak = 0
  for (const v of buf) peak = Math.max(peak, Math.abs(v))
  for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / (peak || 1)) * 0.6
  // A last 15 ms fade so nothing clicks at the end.
  const f = Math.floor(0.015 * SR)
  for (let i = 0; i < f; i++) buf[buf.length - 1 - i] *= i / f
  return buf
}
const SINE = [[1, 1]]
const SOFT_BELL = [[1, 1], [2, 0.22], [3, 0.06]]
const MALLET = [[1, 1], [4, 0.18], [10, 0.04]]

const TAKES = {
  // 6: a round bloop that rises
  6: make(0.35, b => tone(b, 0, 0.3, 520, 800, 0.09, SINE, 1, 0.008, 6)),
  // 7: a marimba two-note, a third apart
  7: make(0.45, b => { tone(b, 0, 0.22, 523.25, 523.25, 0, MALLET, 1, 0.003, 6); tone(b, 0.075, 0.3, 659.25, 659.25, 0, MALLET, 1, 0.003, 6) }),
  // 8: a music-box pluck
  8: make(0.6, b => tone(b, 0, 0.55, 1046.5, 1046.5, 0, SOFT_BELL, 1, 0.003, 5.5)),
  // 9: a boing and a tiny chime
  9: make(0.5, b => { tone(b, 0, 0.14, 300, 620, 0.07, SINE, 0.9, 0.006, 5); tone(b, 0.085, 0.4, 1567.98, 1567.98, 0, SOFT_BELL, 0.55, 0.004, 6) }),
  // 10: a glassy blip-bleep, low to high
  10: make(0.3, b => { tone(b, 0, 0.1, 659.25, 659.25, 0, SINE, 1, 0.006, 4); tone(b, 0.07, 0.22, 987.77, 987.77, 0, [[1, 1], [2, 0.12]], 1, 0.006, 5.5) })
}

const ff = (await import('ffmpeg-static')).default
for (const [n, buf] of Object.entries(TAKES)) {
  const pcm = Buffer.alloc(buf.length * 2)
  buf.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
  const wav = join(OUT, `v${n}.wav`)
  writeFileSync(wav, Buffer.concat([head, pcm]))
  execFileSync(ff, ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `v${n}.mp3`)])
  rmSync(wav)
  console.log('ok synth', n)
}
