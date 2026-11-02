#!/usr/bin/env node
// The v2 trailer's spoken lines, by ElevenLabs (API key in .env.voice.local):
// the narrator (Adam, picked by ear from narrator-samples) and Flux (Liam, his
// library voice). Flux ships no spoken lines of his own (only hurt barks), so
// his trailer lines are made here. Skips a take that exists; `--force` redoes.
//   node tools/cinematic-trailer/voices-v2.mjs [--force]
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const { apiKey, speakApi } = await import(pathToFileURL(join(HERE, '../voice/engines/elevenlabs.mjs')).href)

const ADAM = 'pNInz6obpgDQGcFmaJgB'
const LIAM = 'TX3LPaxmHKxFdv7VOQHJ'
const NARR = '[playful, dramatic movie-trailer narrator, tongue-in-cheek] '
const FLUX = '[young, confident, determined] '

export const LINES_V2 = {
  n1: [ADAM, NARR + 'Cybercity was having a lovely day... until Doctor Vex showed up with a very bad idea.'],
  n2: [ADAM, NARR + 'Ten sectors. Ten giant robots. And one very small hero with a very big gun.'],
  n3: [ADAM, NARR + 'Upgrade. Grab a snack. Borrow their best moves.'],
  n4: [ADAM, NARR + 'Beat a boss, steal his weapon, and use it on his friends!'],
  n5: [ADAM, NARR + 'Vex wants to turn Cybercity into scrap. Flux says... not today.'],
  n6: [ADAM, NARR + 'Mega Droid. Play now. Cybercity is counting on you!'],
  f1: [LIAM, FLUX + "Cybercity, I'm on it!"],
  f2: [LIAM, FLUX + 'Bring it on, tin cans!'],
  f3: [LIAM, FLUX + "Vex, you're scrap!"]
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const key = apiKey()
  if (!key) throw new Error('no ELEVENLABS_API_KEY')
  for (const [id, [voice, text]] of Object.entries(LINES_V2)) {
    const f = join(HERE, 'vo-v2', `${id}.mp3`)
    if (existsSync(f) && !process.argv.includes('--force')) { console.log('have', id); continue }
    writeFileSync(f, await speakApi(key, voice, text))
    console.log('made', id)
  }
}
