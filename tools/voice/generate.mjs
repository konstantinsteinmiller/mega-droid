// `pnpm voice:gen` — turns a job file from `voice:collect` into finished voice
// files: design each speaker's voice once (or reuse it), speak every line N
// times, run every take through the robot chain and the levelling
// (post.mjs), read every take back with Whisper and judge it (qa.mjs), then
// ship the best passing take per line. Lines with no passing take go on the
// fixer list; nothing failing is shipped.
//
//   pnpm voice:gen --engine gemini                   live lines → public/audio/voice/<lang>/
//   pnpm voice:gen --engine gemini --jobs samples    samples → vo-src/compare/<engine>/ (not shipped)
//   --takes 2         takes per line (default 2; samples 1)
//   --only <regex>    only keys matching
//   --lang en|de      one language
//   --no-qa           skip the Whisper read-back (length/level checks still run)
//   --force           redo takes that exist
//   --sign-in         a browser-driven engine (elevenlabs, aistudio): open its sign-in window
//   --retry [n]       only the lines with no passing take: n more takes each
//                     (default 2) with new seeds; extra takes on disk always count
//
// Engines: tools/voice/engines/<name>.mjs. Work files: vo-src/gen/<engine>/
// (raw takes, masters, results.json); designed voices: vo-src/refs/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, VO_SRC, args } from './lib.mjs'
import { processTake, encode } from './post.mjs'
import { judge, pickBest } from './qa.mjs'
import { styleFor } from './style.mjs'
import { transcribe } from './whisper.mjs'

const a = args()
const engineName = a.engine ?? 'gemini'
const mode = a.jobs ?? 'live'
const takes = +(a.takes ?? (mode === 'samples' ? 1 : 2))
const ship = mode !== 'samples'

const jobsFile = join(VO_SRC, 'jobs', `${mode}.json`)
if (!existsSync(jobsFile)) throw new Error(`No ${relative(ROOT, jobsFile)}: run pnpm voice:collect${mode === 'live' ? '' : ` --${mode}`} first`)
const { cards, jobs: all } = JSON.parse(readFileSync(jobsFile, 'utf8'))
const only = a.only ? new RegExp(a.only) : null
const work0 = join(VO_SRC, 'gen', engineName)
const resultsFile = join(work0, `${mode}-results.json`)
const before = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')).results : []
const retry = a.retry ? (a.retry === true ? 2 : +a.retry) : 0
const failing = new Set(before.filter(r => r.best == null).map(r => r.job.id))
const jobs = all.filter(j => (!only || only.test(j.key)) && (!a.lang || j.lang === a.lang) && (!retry || failing.has(j.id)))

const engine = (await import(pathToFileURL(join(ROOT, 'tools', 'voice', 'engines', `${engineName}.mjs`)).href)).default
// A browser-driven engine signs in once, in a plain window of its own profile.
if (a['sign-in']) {
  if (!engine.signIn) throw new Error(`${engineName} needs no sign-in`)
  engine.signIn()
  console.log('A plain Chrome window is open: sign in, close that window, then run again without --sign-in.')
  process.exit(0)
}
const work = join(VO_SRC, 'gen', engineName)
const stateFile = join(VO_SRC, 'refs', 'voices.json')
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
const saveState = () => { mkdirSync(join(VO_SRC, 'refs'), { recursive: true }); writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`) }

console.log(`${engine.label}: ${jobs.length} lines × ${takes} take(s), ${mode}`)

// 1. A voice per speaker and language (designed once, kept in vo-src/refs/).
const wanted = [...new Set(jobs.map(j => `${j.speaker}:${j.lang}`))].map(k => {
  const [speaker, lang] = k.split(':')
  mkdirSync(join(VO_SRC, 'refs', speaker), { recursive: true })
  return { speaker, lang, card: cards[speaker], refDir: join(VO_SRC, 'refs', speaker) }
})
let voices = {}
if (engine.voices) voices = await engine.voices(wanted) // a local engine designs them all in one model load
else for (const w of wanted) { voices[`${w.speaker}:${w.lang}`] = await engine.voice({ ...w, state }); saveState() }
for (const [k, v] of Object.entries(voices)) console.log(`  voice ${k}: ${v.id ?? relative(ROOT, v.ref)}`)

// 2. Speak: every take not on disk yet, one batch (a local engine loads its model once).
const takeOf = (j, t) => ({ raw: join(work, j.lang, `${j.file}.t${t}.wav`), master: join(work, j.lang, `${j.file}.t${t}.master.wav`) })
/** How many takes a line has: the default, any extra ones on disk from a retry, and this retry's. */
const takesFor = (j) => {
  let n = takes
  while (existsSync(takeOf(j, n + 1).raw)) n++
  return n + retry
}
/** A seed per line as well as per take: the three takes of one bark must not come out the same. */
const seedOf = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7)
const todo = []
for (const j of jobs) {
  mkdirSync(join(work, j.lang), { recursive: true })
  for (let t = 1, n = takesFor(j); t <= n; t++) {
    const { raw } = takeOf(j, t)
    if (a.force || !existsSync(raw)) {
      todo.push({ id: `${j.id}.t${t}`, job: j, take: t, raw, text: j.say ?? j.text, lang: j.lang, tone: j.tone, style: styleFor(j), direction: j.direction, directionEn: j.directionEn, seed: 1000 * t + 17 + seedOf(j.id), voice: voices[`${j.speaker}:${j.lang}`], card: cards[j.speaker] })
    }
  }
}
const t0 = Date.now()
const said = todo.length ? await engine.synth(todo) : []
const failed = todo.map((it, i) => (said[i]?.ok ? null : `${it.id}: ${said[i]?.error ?? 'failed'}`)).filter(Boolean)
console.log(`  spoke ${todo.length - failed.length}/${todo.length} takes in ${Math.round((Date.now() - t0) / 1000)} s`)
for (const f of failed) console.warn(`  ✘ ${f}`)

// 3. Post-produce every take on disk.
const results = []
for (const j of jobs) {
  const ts = []
  for (let t = 1; existsSync(takeOf(j, t).raw) || t <= takes; t++) {
    const { raw, master } = takeOf(j, t)
    if (!existsSync(raw)) continue
    try {
      const m = await processTake({ raw, master, ogg: null, speaker: j.speaker, key: j.key, max: j.max })
      ts.push({ take: t, master, text: j.text, lang: j.lang, ...(j.loose ? { loose: true } : {}), ...m })
    } catch (e) {
      console.warn(`  ✘ post ${j.id}.t${t}: ${e.message.split('\n')[0]}`)
    }
  }
  results.push({ job: j, takes: ts })
}

// 4. Read every take back (Whisper), judge it, ship the best one.
const flat = results.flatMap(r => r.takes.map(t => ({ r, t })))
if (a.qa !== false && a['no-qa'] !== true && flat.length) {
  const heard = await transcribe(flat.map(({ r, t }) => ({ id: `${r.job.id}.t${t.take}`, wav: t.master, lang: r.job.lang })))
  for (const { r, t } of flat) t.heard = heard[`${r.job.id}.t${t.take}`] ?? null
}
const fixer = []
for (const r of results) {
  for (const t of r.takes) t.qa = judge(t, r.job.max)
  const best = pickBest(r.takes)
  r.best = best?.take ?? null
  if (!best) { fixer.push(r); continue }
  const out = ship ? join(ROOT, r.job.out) : join(VO_SRC, 'compare', engineName, r.job.lang, `${r.job.file}.ogg`)
  const shipped = relative(ROOT, out).replaceAll('\\', '/')
  // The same take already shipped there: leave the file be. An Ogg stream gets a
  // random serial number on every encode, so a re-encode changes every byte of
  // an unchanged line and fills the commit with noise.
  const prev = before.find(p => p.job.id === r.job.id)
  if (!(prev?.best === best.take && prev.shipped === shipped && existsSync(out))) await encode(best.master, out)
  r.shipped = shipped
}

// The shipped files carry no mark of their own (the encode strips metadata, the
// game finds a line by its name): vo-src/shipped.json says which engine made each.
if (ship) {
  const file = join(VO_SRC, 'shipped.json')
  const book = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const day = new Date().toISOString().slice(0, 10)
  for (const r of results) if (r.best != null) book[`${r.job.lang}/${r.job.file}`] = { engine: engineName, at: day }
  const sorted = Object.fromEntries(Object.entries(book).sort(([x], [y]) => x.localeCompare(y)))
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
  // The to-do list follows every ship: what is voiced now, what is missing.
  const { writeVoiceTodo } = await import('./todo.mjs')
  writeVoiceTodo()
}

// A partial run (--only, --lang, --retry) updates its lines and keeps the rest.
const merged = all.map(j => results.find(r => r.job.id === j.id) ?? before.find(r => r.job.id === j.id)).filter(Boolean)
writeFileSync(resultsFile, `${JSON.stringify({ engine: engineName, label: engine.label, mode, takes, results: merged }, null, 2)}\n`)
const ok = results.filter(r => r.best).length
console.log(`${ok}/${results.length} lines ${ship ? 'shipped' : 'ready to compare'}; results in ${relative(ROOT, join(work, `${mode}-results.json`))}`)
if (fixer.length) {
  console.log(`Fixer list (${fixer.length}): no take passed`)
  for (const r of fixer) console.log(`  ${r.job.id}: ${r.takes.map(t => t.qa.reasons.join('; ') || 'no take').join(' | ') || 'no take spoken'}`)
}
