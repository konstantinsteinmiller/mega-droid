#!/usr/bin/env node
// A browser report of the ElevenLabs sound effects: each one playable, what it
// is used for, and a frame of the trailer shot where it is heard (found in the
// shots' audio logs). Output: preview-videos/sfx-report/index.html
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { ROOT } from '../voice/lib.mjs'
import { SFX_PROMPTS } from './prompts.mjs'

const USE = {
  shoot: 'A quick tap of the fire button: a plasma pellet leaves the cannon.',
  charge1: 'Holding fire: the cannon starts to charge.', charge2: 'The charge climbs to the second level.', charge3: 'Full charge: the cannon is ready to unleash.',
  chargeShot: 'Releasing a charged shot.', chargeShotBig: 'Releasing a fully charged, super shot.',
  hit: 'A shot lands on an enemy.', hitHeavy: 'A strong or charged hit on an enemy.', crit: 'A critical hit.', tink: 'A shot bounces off armor.',
  explode: 'A machine breaks apart.', hurt: 'Flux takes damage.', death: 'Flux is defeated.',
  slide: 'Flux slides under a threat.', dash: 'Flux dashes.', jump: 'A jump.',
  block: 'A block against an attack.', parry: 'A perfect block.', guardBreak: 'An enemy guard or shield breaks.', enemyShot: 'An enemy fires.',
  bolt: 'Picking up a bolt.', heal: 'Repair gel heals Flux.', energy: 'A weapon energy pickup, and the Lodestone mini-boss field.',
  levelUp: 'Flux levels up.', loot: 'A rare drop.', chestOpen: 'A chest opens.', weapon: 'Flux copies a boss weapon.',
  beamIn: 'Flux beams in to start a mission.', beamOut: 'Flux beams out.', door: 'A shutter or boss door opens.',
  bossIntro: 'A boss fight begins.', bossWarn: 'Warning before a boss.', stomp: 'A heavy stomp or slam (the Lodestone slam ring).', thunder: 'A lightning strike (Volt sector).',
  denied: 'A refused action.', uiClick: 'A menu click.', uiOpen: 'A menu opens.'
}
/** The owner's verdicts of round 1 (stars out of 5), shown as the starting rating. */
const ROUND1 = { heal: 4, weapon: 4, beamIn: 4, door: 4, bossIntro: 4, bossWarn: 5, stomp: 5, thunder: 5, denied: 5, uiClick: 5, uiOpen: 5, chestOpen: 5, loot: 4, parry: 5, block: 4, hitHeavy: 4, charge2: 4, charge3: 4, hit: 4, death: 5, guardBreak: 5, tink: 5, enemyShot: 4, energy: 4, beamOut: 4 }
const OUT = join(ROOT, 'preview-videos/sfx-report')
mkdirSync(join(OUT, 'img'), { recursive: true })
mkdirSync(join(OUT, 'snd'), { recursive: true })
// Where each sound is heard first (a shot of the draft cut, with its time).
const SHOTS = join(ROOT, 'preview-videos/trailer-v2-draft/shots')
const found = {}
for (const shot of readdirSync(SHOTS)) {
  const f = join(SHOTS, shot, 'audio-log.json')
  if (!existsSync(f)) continue
  for (const e of JSON.parse(readFileSync(f, 'utf8')).events) {
    if (e.k !== 's' || e.t < 0.3) continue
    ;(found[e.n] ??= []).push({ shot, t: e.t })
  }
}
const cards = []
for (const [name, p] of Object.entries(SFX_PROMPTS)) {
  const mp3 = join(ROOT, 'public/audio/sfx', `${name}.mp3`)
  if (!existsSync(mp3)) continue
  copyFileSync(mp3, join(OUT, 'snd', `${name}.mp3`))
  const hit = found[name]?.[0]
  let img = ''
  if (hit) {
    const png = join(OUT, 'img', `${name}.jpg`)
    const mp4 = join(SHOTS, hit.shot, readdirSync(join(SHOTS, hit.shot)).find(x => x.endsWith('.mp4')))
    spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(hit.t), '-i', mp4, '-frames:v', '1', '-q:v', '3', png])
    if (existsSync(png)) img = `img/${name}.jpg`
  }
  cards.push({ stars: ROUND1[name] ?? 0, name, use: USE[name] ?? '', prompt: p.text, img, shot: hit?.shot ?? '' })
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mega Droid sound effects</title>
<style>:root{--bg:#0e1424;--card:#18213a;--fg:#e8eefc;--mut:#8fa0c8;--acc:#4fe3ff}
@media(prefers-color-scheme:light){:root{--bg:#f2f5fb;--card:#fff;--fg:#14203a;--mut:#56648a;--acc:#0a7fa3}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif;padding:24px 16px}
h1{margin:0 0 4px}p.sub{color:var(--mut);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:var(--card);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.card img,.noimg{width:100%;aspect-ratio:16/9;object-fit:cover;background:#0006;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:13px}
.stars{display:flex;gap:2px}.stars button{background:none;border:0;font-size:24px;line-height:1;cursor:pointer;color:var(--mut);padding:2px}.stars button.on{color:#ffc933}textarea{width:100%;box-sizing:border-box;min-height:54px;background:#0003;color:var(--fg);border:1px solid #8884;border-radius:8px;padding:6px;font:inherit}.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:10px;align-items:center;z-index:2}.bar button{background:var(--acc);color:#001;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
.b{padding:12px;display:flex;flex-direction:column;gap:6px}.n{font-weight:700;color:var(--acc)}.m{color:var(--mut);font-size:13px}audio{width:100%}</style>
<h1>Mega Droid sound effects</h1><p class="sub">${cards.length} ElevenLabs sounds. The picture is the trailer moment where the sound is first heard (draft frame); sounds without a picture did not occur in the trailer.</p>
<div class="bar"><button id="exp">Download ratings (sfx-ratings.json)</button><span class="m" id="cnt"></span></div><div class="grid">${cards.map(c => `<div class="card">${c.img ? `<img loading="lazy" src="${c.img}" alt="${c.name} in the ${c.shot} shot">` : '<div class="noimg">not in the trailer</div>'}<div class="b"><span class="n">${c.name}</span><span>${esc(c.use)}</span>${c.shot ? `<span class="m">Trailer shot: ${c.shot}</span>` : ''}<audio controls preload="none" src="snd/${c.name}.mp3"></audio><div class="stars" data-n="${c.name}" data-s="${c.stars}">${[1,2,3,4,5].map(i => `<button data-v="${i}" aria-label="${i} stars">★</button>`).join('')}</div><textarea data-n="${c.name}" placeholder="Feedback (what is wrong, what you want instead)"></textarea><span class="m">Prompt: ${esc(c.prompt)}</span></div></div>`).join('')}</div><script>
const K='sfx-ratings-v3';let st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')}catch{}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(st))}catch{}
document.getElementById('cnt').textContent=Object.values(st).filter(x=>x.stars||x.note).length+' rated'}
document.querySelectorAll('.stars').forEach(el=>{const n=el.dataset.n;const set=v=>{el.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.v<=v))};
const cur=()=>st[n]?.stars??+el.dataset.s;set(cur());
el.querySelectorAll('button').forEach(b=>b.onclick=()=>{const v=+b.dataset.v;st[n]={...st[n],stars:cur()===v?0:v};set(st[n].stars);save()})});
document.querySelectorAll('textarea').forEach(t=>{const n=t.dataset.n;t.value=st[n]?.note??'';t.oninput=()=>{st[n]={...st[n],note:t.value};save()}});
document.getElementById('exp').onclick=()=>{const out={};document.querySelectorAll('.stars').forEach(el=>{const n=el.dataset.n;out[n]={stars:st[n]?.stars??+el.dataset.s,note:st[n]?.note??''}});
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='sfx-ratings.json';a.click()};save();
</script>`
writeFileSync(join(OUT, 'index.html'), html)
console.log(cards.length, 'cards,', cards.filter(c => c.img).length, 'with a picture')
