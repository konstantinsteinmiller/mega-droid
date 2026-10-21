// voice-over-approvals.md: the listening verdict on every shipped voice file,
// per language — approved, not yet approved, or rejected with a note. It is
// the source of truth (committed, and fine to edit by hand: `voice:review`
// re-reads it on every request). A verdict holds for one recording: each row
// carries the file's content hash (tools/voice/hash.mjs), and a re-recorded
// file goes back to "not yet approved", the old verdict kept as history.
// `voice:gen --rejected` re-voices the rejected lines with their notes.
//
// Pure functions plus two file helpers; no dependencies.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanVoiceFiles } from './hash.mjs'

export const STATUSES = ['approved', 'not yet approved', 'rejected']
const LANG_NAMES = { en: 'English', de: 'German', ru: 'Russian', es: 'Spanish', zh: 'Chinese', fr: 'French' }

const statusOf = (s) => {
  const v = String(s ?? '').trim().toLowerCase()
  if (v.startsWith('approved') || v === 'ok' || v === 'yes') return 'approved'
  if (v.startsWith('rejected') || v === 'no') return 'rejected'
  return 'not yet approved'
}
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
const uncell = (s) => s.replace(/\\\|/g, '|').trim()
/** A table row's cells, `\|` kept inside a cell. */
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(uncell)

/** `lang/key` → { lang, key, status, hash, note, history }. */
export const parseApprovals = (md) => {
  const out = new Map()
  let lang = null
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const h = line.match(/^##\s+.*\(([\w-]+)\)\s*$/) ?? line.match(/^##\s+([\w-]+)\s*$/)
    if (h) { lang = h[1]; continue }
    if (!lang || !line.trim().startsWith('|')) continue
    const [key, status, hash, note = '', history = ''] = cells(line)
    const k = key?.replace(/`/g, '').trim()
    if (!k || k === 'Key' || /^-+$/.test(k)) continue
    out.set(`${lang}/${k}`, { lang, key: k, status: statusOf(status), hash: hash?.trim() ?? '', note, history })
  }
  return out
}

/** The file: one section per language, its rows sorted by key. */
export const renderApprovals = (entries, langs = [...new Set([...entries.values()].map(e => e.lang))]) => {
  const all = [...entries.values()]
  const sections = langs.map(lang => {
    const mine = all.filter(e => e.lang === lang).sort((a, b) => a.key.localeCompare(b.key))
    const n = (s) => mine.filter(e => e.status === s).length
    return [`## ${LANG_NAMES[lang] ?? lang} (${lang})`, '',
      `${mine.length} files: ${n('approved')} approved, ${n('not yet approved')} not yet approved, ${n('rejected')} rejected.`, '',
      '| Key | Status | Hash | Note | History |', '| --- | --- | --- | --- | --- |',
      ...mine.map(e => `| \`${e.key}\` | ${e.status} | ${e.hash} | ${cell(e.note)} | ${cell(e.history)} |`)].join('\n')
  })
  return `# Voice-over approvals

The listening verdict on every shipped voice file. Written by \`pnpm voice:review\`
(the review page) and fine to edit by hand: Status is one of ${STATUSES.map(s => `\`${s}\``).join(', ')};
Note says what is wrong with a rejected take (\`pnpm voice:gen --rejected\` reads it
as extra direction). Hash is the file's content hash: a re-recorded file goes back to
\`not yet approved\`, and the old verdict moves to History.

${sections.join('\n\n')}
`
}

/**
 * The entries for the files there are now (`current`: { lang, key, hash }): a
 * row whose hash still matches keeps its verdict; a re-recorded file is "not
 * yet approved" again, its old verdict prepended to the history; a new file
 * starts "not yet approved"; a file that is gone loses its row.
 */
export const reconcile = (entries, current) => {
  const out = new Map()
  for (const { lang, key, hash } of current) {
    const id = `${lang}/${key}`
    const e = entries.get(id)
    if (!e) { out.set(id, { lang, key, status: 'not yet approved', hash, note: '', history: '' }); continue }
    if (e.hash === hash) { out.set(id, { ...e }); continue }
    const was = e.status === 'not yet approved' ? '' : `${e.status} ${e.hash}${e.note ? `: ${e.note}` : ''}`
    out.set(id, { lang, key, status: 'not yet approved', hash, note: '', history: [was, e.history].filter(Boolean).join('; ') })
  }
  return out
}

/** Record a verdict, for the recording with this hash only (a stale page cannot overwrite a newer take's row). */
export const setVerdict = (entries, { lang, key, hash, status, note = '' }) => {
  const id = `${lang}/${key}`
  const e = entries.get(id)
  if (!e) throw new Error(`no file for ${id}`)
  if (e.hash !== hash) throw new Error(`${id} was re-recorded (${e.hash}), reload the page`)
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`)
  const next = { ...e, status, note: status === 'rejected' ? String(note ?? '').trim() : '' }
  entries.set(id, next)
  return next
}

/** The rejected recordings that are still the shipped ones: what `voice:gen --rejected` re-voices. */
export const rejectedLines = (entries, current) => {
  const now = new Map(current.map(c => [`${c.lang}/${c.key}`, c.hash]))
  return [...entries.values()].filter(e => e.status === 'rejected' && now.get(`${e.lang}/${e.key}`) === e.hash)
    .map(({ lang, key, note }) => ({ lang, key, note }))
}

/** The shipped files of these languages as { lang, key, hash }, `keyOf(file name)` → key or null. */
export const currentVoiceFiles = (voiceDir, langs, keyOf) => scanVoiceFiles(voiceDir).flatMap((entry) => {
  const m = entry.match(/^([\w-]+)\/([^?]+)\.ogg\?v=(\w+)$/)
  const key = m && langs.includes(m[1]) ? keyOf(m[2]) : null
  return key ? [{ lang: m[1], key, hash: m[3], file: `${m[2]}.ogg` }] : []
})

export const readApprovals = (path) => parseApprovals(existsSync(path) ? readFileSync(path, 'utf8') : '')
/** Written whole to a temp file, then renamed over: never a half-written file. */
export const writeApprovals = (path, entries, langs) => {
  const tmp = join(path, '..', `.${Date.now()}.${process.pid}.approvals.tmp`)
  writeFileSync(tmp, renderApprovals(entries, langs))
  renameSync(tmp, path)
}

/**
 * The jobs (`voice:collect`'s) of the rejected lines, the listener's note
 * added to the stage direction: what `voice:gen --rejected` speaks again.
 */
export const rejectedJobs = (jobs, rejected) => {
  const notes = new Map(rejected.map(r => [`${r.lang}/${r.key}`, r.note]))
  const add = (d, note) => note ? `${d ? `${d} ` : ''}Listener's note on the last take: ${note}` : d
  return jobs.filter(j => notes.has(`${j.lang}/${j.key}`)).map(j => {
    const note = notes.get(`${j.lang}/${j.key}`)
    return { ...j, direction: add(j.direction, note), directionEn: add(j.directionEn, note), rejectedNote: note }
  })
}
