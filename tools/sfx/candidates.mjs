#!/usr/bin/env node
// Round 3: four candidate takes per rejected sound (public/audio/sfx stays as is
// until the owner picks one in the report): tools/sfx/candidates/<name>/v1..v4.mp3
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiKey } from '../voice/engines/elevenlabs.mjs'
import { ROOT } from '../voice/lib.mjs'

export const CANDIDATES = {
  overcharge: { dur: 3, loop: true, prompts: [
    'Overcharged plasma cannon idling, a deep steady energy hum with a slow throbbing bass pulse and a thin bright shimmer, powerful and contained, seamless loop',
    'A weapon held at full charge, a clean resonant glowing tone with a gentle fast flutter, humming with restrained power, seamless loop',
    'Unstable overloading energy core, a rumbling low hum with crackling electric arcs flickering on top, tense, seamless loop',
    'Plasma buildup at maximum, a warm powerful hum with rising and falling harmonics like a breathing swell, smooth, seamless loop',
    'Heavy sci-fi weapon about to burst, a vibrating low rumble with a high ringing whine and a subtle heartbeat pulse, seamless loop',
    'Overcharged hero buster, a bright energetic buzzing hum with a steady rhythmic warble, powerful but clean, seamless loop',
    'Energy contained in a cannon, a deep swirling electrical drone with soft static sparkles, steady, no beeps, seamless loop',
    'Glowing plasma at critical charge, a smooth sustained choir-like synth tone with a low throb and a shimmering edge, seamless loop',
    'A deep thrumming engine-like hum of stored lightning, with faint metallic resonance and tiny electric pops, seamless loop',
    'Sustained overload tone, a tight fast pulsing electric vibration with a warm bass body, intense but not harsh, seamless loop'] },
  chargeShot: { dur: 1.4, prompts: [
    'Mega Man style charged buster shot, a deep powerful wham of plasma with a falling laser sweep and a bass boom, heroic retro action game cannon, big and punchy',
    'Powerful plasma cannon discharge, a huge bass punch followed by a bright descending energy sweep and an echoing crackle, sci-fi hero weapon',
    'Heavy charged laser blast, a thick low boom with a rising then falling plasma whoosh, impactful, video game hero weapon, clean and polished',
    'Superhero energy cannon fire, a loud plasma burst with a thunderous low end and a sizzling electric tail, cinematic'] },
  chargeShotBig: { dur: 2.2, prompts: [
    'Mega Man style fully charged mega buster blast, an enormous plasma explosion of sound with a deep sub boom, a long laser sweep and a rolling echo, ultimate hero cannon',
    'Colossal plasma cannon discharge, earth-shaking bass hit, a screaming descending energy beam and a huge reverberating tail, epic sci-fi',
    'Super charged energy blast, a massive wham with a layered bright plasma roar, a heavy boom and a crackling shimmer fading out, video game finisher shot',
    'The most powerful hero weapon shot, a gigantic thunderous plasma blast with a punchy attack, long bass decay and electric sparkle'] },
  charge1: { dur: 1.0, prompts: [
    'A clean deep energy charge, a smooth low humming tone rising in pitch, warm and powerful, polished sound design, no noise, no crackle',
    'Plasma cannon charging, a full-bodied rising hum with a soft bass swell and a gentle shimmer on top, clean, high quality',
    'Energy power-up building, a deep resonant whir rising smoothly with a subtle pulsing beat, clean cinematic sound design',
    'Sci-fi weapon charge, a low warm pulsing hum that climbs steadily, rich and deep, no static, no gears'] },
  dash: { dur: 0.5, prompts: [
    'A sleek android dashing, a quick thruster whoosh with a tight metallic servo whir, short, clean and powerful',
    'Robot sprint burst, a sharp air-slicing whoosh with a short rocket-boot puff and a small metal clink',
    'Android hero dash, a crisp whoosh with a rising servo whine and a soft jet burst, snappy action game sound',
    'Fast futuristic dash, a clean wind rush with a mechanical actuator snap at the start, short'] },
  slide: { dur: 0.8, prompts: [
    'A smooth soft android glide, a low hydraulic servo whir with a gentle air whoosh, no scraping, no grit, clean and rounded',
    'Robot sliding on a polished floor, a quiet low rubbery glide with a soft motorized hum and a smooth airy swoosh, no scratch',
    'Android slide move, a deep smooth whoosh with a light mechanical servo purr and a soft thud at the end, clean, no friction noise',
    'Sleek robot drop-and-glide, a smooth falling servo whine into a soft low whoosh, polished sci-fi, gentle, no metal scraping'] },
  bolt: { dur: 0.6, prompts: [
    'A steel bolt pickup, a bright metallic ting-ting of a small bolt tapped and collected, short shiny chime of metal',
    'Collecting a steel hex bolt, two quick clean metallic clinks with a tiny sparkle, video game pickup',
    'A metal bolt and nut sound, a heavy steel clink followed by a light high ting, pickup reward, not a coin',
    'Small steel screw rolling and clinking on metal, then a bright satisfying ting, short pickup'] },
  // #198: the shipped bolt ting reads scratchy to some players. Ten soft, toon-like takes.
  boltToon: { dur: 0.5, prompts: [
    'A cute cartoon pickup, a single soft round bubbly bloop with a gentle rising pitch, friendly, warm and smooth, no harsh highs, short',
    'A friendly toy xylophone note, one short rounded wooden mallet tone with a tiny sparkle, cheerful and cozy, video game collectible',
    'Soft marimba pop, two quick warm notes rising a third, playful and gentle, children cartoon game pickup, smooth with no hiss',
    'A little bouncy boing-ting, a soft springy blip followed by a tiny glass chime, cute and rounded, cartoon style',
    'Gentle music box pluck, a single sweet bell-like note with a short soft tail, friendly, no sharpness, collectible sound',
    'Synthesised here (ElevenLabs credits ran out): a round sine bloop that glides up, soft attack, no highs',
    'Synthesised here: a marimba-style two-note pluck a third apart, warm and short',
    'Synthesised here: a single music-box pluck, soft bell tone with a gentle tail',
    'Synthesised here: a springy boing up into a tiny soft chime',
    'Synthesised here: a glassy low-to-high blip-bleep, rounded, very short'] },
  levelUp: { dur: 3.0, prompts: [
    'Level up fanfare, a triumphant heroic rising brass and chime fanfare with a sparkling finish, about three seconds, video game',
    'Epic short victory jingle with a rising orchestral swell, shimmering bells and a bold final chord, three seconds',
    'Arcade level up, an upbeat rising arpeggio of bells and synth brass ending in a bright triumphant chord with sparkles',
    'Hero power-up celebration, a swelling fanfare with trumpets, glittering chimes and a punchy final hit, three seconds'] }
}
if (process.argv[1]?.endsWith('candidates.mjs')) {
  const key = apiKey()
  const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
  for (const [name, c] of Object.entries(CANDIDATES)) {
    if (only.length && !only.includes(name)) continue
    mkdirSync(join(ROOT, 'tools/sfx/candidates', name), { recursive: true })
    for (let i = 0; i < c.prompts.length; i++) {
      const f = join(ROOT, 'tools/sfx/candidates', name, `v${i + 1}.mp3`)
      if (existsSync(f)) continue
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
        method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text: c.prompts[i], duration_seconds: c.dur, prompt_influence: 0.6, ...(c.loop ? { loop: true } : {}) })
      })
      if (!res.ok) { console.error(name, i + 1, res.status, (await res.text()).replace(/sk_\w+/g, '').slice(0, 120)); continue }
      writeFileSync(f, Buffer.from(await res.arrayBuffer()))
      console.log('ok', name, i + 1)
    }
  }
}
