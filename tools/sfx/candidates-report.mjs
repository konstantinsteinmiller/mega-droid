#!/usr/bin/env node
// Picker report for the round-3 candidates: preview-videos/sfx-report/candidates.html
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../voice/lib.mjs'
import { CANDIDATES } from './candidates.mjs'

const OUT = join(ROOT, 'preview-videos/sfx-report')
mkdirSync(join(OUT, 'cand'), { recursive: true })
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const rows = Object.entries(CANDIDATES).filter(([n]) => !ONLY.length || ONLY.includes(n)).map(([name, c]) => {
  const vs = c.prompts.map((p, i) => {
    copyFileSync(join(ROOT, 'tools/sfx/candidates', name, `v${i + 1}.mp3`), join(OUT, 'cand', `${name}-v${i + 1}.mp3`))
    return { id: `v${i + 1}`, file: `cand/${name}-v${i + 1}.mp3`, prompt: p }
  })
  return { name, vs }
})
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mega Droid sound candidates</title>
<style>:root{--bg:#0e1424;--card:#18213a;--fg:#e8eefc;--mut:#8fa0c8;--acc:#4fe3ff}
@media(prefers-color-scheme:light){:root{--bg:#f2f5fb;--card:#fff;--fg:#14203a;--mut:#56648a;--acc:#0a7fa3}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif;padding:24px 16px}h1{margin:0 0 4px}.sub{color:var(--mut);margin:0 0 16px}
section{background:var(--card);border-radius:12px;padding:14px;margin-bottom:16px}h2{margin:0 0 10px;color:var(--acc);font-size:18px}
.vs{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.v{border:2px solid #8883;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px}
.v.pick{border-color:var(--acc)}audio{width:100%}.m{color:var(--mut);font-size:12px}.stars button{background:none;border:0;font-size:22px;cursor:pointer;color:var(--mut);padding:1px}.stars button.on{color:#ffc933}
.pk{background:none;border:1px solid var(--acc);color:var(--acc);border-radius:8px;padding:5px 8px;cursor:pointer}.v.pick .pk{background:var(--acc);color:#001}
textarea{width:100%;box-sizing:border-box;min-height:44px;background:#0003;color:var(--fg);border:1px solid #8884;border-radius:8px;padding:6px;font:inherit;margin-top:8px}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:2}.bar button{background:var(--acc);color:#001;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}</style>
<h1>Sound candidates</h1><p class="sub">Takes per sound. Rate each (under 4 stars is a rejection), press Pick on the one to ship, and add feedback if none is right.</p>
<div class="bar"><button id="exp">Download picks (sfx-picks.json)</button></div>
${rows.map(r => `<section data-n="${r.name}"><h2>${r.name}</h2><div class="vs">${r.vs.map(v => `<div class="v" data-v="${v.id}"><b>${v.id}</b><audio controls preload="none" src="${v.file}"></audio><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button data-s="${i}">★</button>`).join('')}</div><button class="pk">Pick this one</button><span class="m">${esc(v.prompt)}</span></div>`).join('')}</div><textarea placeholder="Feedback for ${r.name} (if none fits)"></textarea></section>`).join('')}
<script>
const K='sfx-picks-v3-${ONLY.join('-')}';let st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')}catch{}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(st))}catch{}}
document.querySelectorAll('section').forEach(sec=>{const n=sec.dataset.n;st[n]??={pick:'',note:'',stars:{}};const o=st[n];
const paint=()=>{sec.querySelectorAll('.v').forEach(v=>{v.classList.toggle('pick',o.pick===v.dataset.v);const s=o.stars[v.dataset.v]||0;v.querySelectorAll('.stars button').forEach(b=>b.classList.toggle('on',+b.dataset.s<=s))})};
sec.querySelectorAll('.v').forEach(v=>{const id=v.dataset.v;v.querySelectorAll('.stars button').forEach(b=>b.onclick=()=>{o.stars[id]=o.stars[id]===+b.dataset.s?0:+b.dataset.s;paint();save()});v.querySelector('.pk').onclick=()=>{o.pick=o.pick===id?'':id;paint();save()}});
const t=sec.querySelector('textarea');t.value=o.note;t.oninput=()=>{o.note=t.value;save()};paint()});
document.getElementById('exp').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(st,null,2)],{type:'application/json'}));a.download='sfx-picks.json';a.click()};
</script>`
writeFileSync(join(OUT, ONLY.length ? `candidates-${ONLY.join('-')}.html` : 'candidates.html'), html)
console.log(rows.length, 'sounds')
