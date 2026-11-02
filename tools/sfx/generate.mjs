// ElevenLabs sound-effects for the game's SFX names: public/audio/sfx/<name>.mp3
// (the drop-in folder, see src/game/assets/overrides.ts). Skips files that exist;
// `--force name,name` regenerates. Key: .env.voice.local (never printed).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiKey } from '../voice/engines/elevenlabs.mjs'
import { ROOT } from '../voice/lib.mjs'
import { SFX_PROMPTS } from './prompts.mjs'

const OUT = join(ROOT, 'public/audio/sfx')
mkdirSync(OUT, { recursive: true })
const force = (process.argv.find(a => a.startsWith('--force='))?.slice(8) ?? '').split(',').filter(Boolean)
const only = (process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean)
const key = apiKey()
if (!key) throw new Error('no ElevenLabs key')
for (const [name, p] of Object.entries(SFX_PROMPTS)) {
  if (only.length && !only.includes(name)) continue
  const f = join(OUT, `${name}.mp3`)
  if (existsSync(f) && !force.includes(name) && !force.includes('all')) continue
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: p.text, duration_seconds: p.dur, prompt_influence: 0.6 })
  })
  if (!res.ok) { console.error(name, res.status, (await res.text()).replace(/sk_\w+/g, '<key>').slice(0, 160)); if (res.status === 401 || res.status === 402 || res.status === 429) break; continue }
  writeFileSync(f, Buffer.from(await res.arrayBuffer()))
  console.log('ok', name)
}
