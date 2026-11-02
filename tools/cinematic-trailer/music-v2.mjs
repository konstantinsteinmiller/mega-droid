#!/usr/bin/env node
// The v2 trailer's score by ElevenLabs Music (key in .env.voice.local):
// tools/cinematic-trailer/music-v2/trailer.mp3. Retries while the service is busy.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const { apiKey } = await import(pathToFileURL(join(HERE, '../voice/engines/elevenlabs.mjs')).href)
const OUT = join(HERE, 'music-v2/trailer.mp3')
const have = existsSync(OUT) && !process.argv.includes("--force")
mkdirSync(dirname(OUT), { recursive: true })
const prompt = 'Instrumental epic action video game trailer music, exactly 140 BPM, 4/4, steady tempo, heroic chiptune-meets-orchestral rock, driving drums, punchy bass, bright lead synth melody, in the spirit of classic Mega Man boss themes. Starts with an immediate energetic hook, builds through the middle with a fun playful feel, then a big dark menacing climax with heavy drums and choir hits at the end, ends cleanly with a final hit. No vocals.'
for (let n = 0; n < (have ? 0 : 12); n++) {
  const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, music_length_ms: 82000, force_instrumental: true })
  })
  if (r.ok) { writeFileSync(OUT, Buffer.from(await r.arrayBuffer())); console.log('made'); break }
  console.log(r.status, (await r.text()).replace(/sk_\w+/g, '').slice(0, 120))
  if (r.status !== 429 && r.status !== 503) break
  await new Promise(s => setTimeout(s, 20000))
}
// The service keeps its own tempo (it comes back at 120, measured), the cut
// sits on a 140 BPM grid: stretch the score to it, pitch kept.
const { execFileSync } = await import('node:child_process')
const SKIP = Number(process.env.MUSIC_SKIP ?? 1.73) // s: the first strong hit is bar 0
const ff = (await import('ffmpeg-static')).default
execFileSync(ff, ['-v', 'error', '-y', '-ss', String(SKIP), '-i', OUT, '-af', `atempo=${140 / Number(process.env.MUSIC_BPM ?? 164.5)}`, '-ar', '48000', join(HERE, 'music-v2/trailer140.wav')])
console.log('stretched')
