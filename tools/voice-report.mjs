#!/usr/bin/env node
// ─── pnpm voice:report ───────────────────────────────────────────────────────
//
// Every voice-over line (src/game/audio/voiceCatalog.ts), per language: what
// is done (the file ships in public/audio/voice/<lang>/), what is recorded
// but not processed yet (raw takes in vo-src/raw/<lang>/), and what is still
// to record. Prints it grouped by speaker, and writes the recording scripts
//
//   src/assets/voice-lines-list_en.pdf
//   src/assets/voice-lines-list_de.pdf
//
// A script is what a voice actor works from: the recording rules, then one
// section per character with the lines still to record, each with its text,
// when it plays, how to read it, its longest length and the exact file name
// to save each take under. The lines already done follow as a short list.
//
//   pnpm voice:report            both languages
//   pnpm voice:report --lang de  one
//   pnpm voice:report --quiet    PDFs only, no list in the console
//
// Runs on Node's own TypeScript stripping, like voice:script.

import { createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import PDFDocument from 'pdfkit'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = await import(pathToFileURL(join(ROOT, 'src/game/audio/voiceCatalog.ts')).href)
const { SPEAKERS, SCENES, voicePath, rawPath, fileName } = catalog
const LOCALES = {
  en: (await import(pathToFileURL(join(ROOT, 'src/i18n/locales/en.ts')).href)).default,
  de: (await import(pathToFileURL(join(ROOT, 'src/i18n/locales/de.ts')).href)).default
}
// Every line: the catalogue's detail plus each speaker's text lines.
const VOICE_LINES = catalog.deriveVoiceLines(LOCALES.en)
const LANGS = ['en', 'de']
const SPEAKER_ORDER = ['atlas', 'vex', 'flux', 'gauss', 'pip']
const AUDIO_EXT = ['.ogg', '.mp3', '.m4a']

const args = process.argv.slice(2)
const langArg = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
const quiet = args.includes('--quiet')
const langs = langArg ? [langArg] : LANGS
if (langs.some(l => !LANGS.includes(l))) {
  console.error(`--lang must be one of: ${LANGS.join(', ')}`)
  process.exit(1)
}

// ── The words the report itself uses ──

const UI = {
  en: {
    title: 'Mega Droid: voice lines',
    lang: 'English',
    generated: 'Generated',
    source: 'Source: src/game/audio/voiceCatalog.ts. Re-run `pnpm voice:report` after a line changes or a file arrives.',
    summary: 'Summary',
    speaker: 'Speaker', lines: 'Lines', done: 'Done', recorded: 'Recorded', todo: 'To record', total: 'Total',
    contents: 'Contents',
    guide: 'How to record',
    guideItems: [
      'Record one character at a time: each has its own section, with the voice described at the top.',
      'Read the line exactly as written. Words in CAPITALS are stressed; "…" is a pause; "—" means the line is cut off mid-word.',
      'Stay inside the "max" length. Short and punchy beats slow and complete.',
      'Record dry and close: no reverb, no effects, no music. The robot processing is added afterwards.',
      'Record 3 takes of every line, and number them 1, 2, 3 in the file name (the best one first, if you can tell).',
      'Format: OGG (Vorbis), mono, 48 kHz, highest quality setting (q 8 or more). No leading silence; half a second of room tone after each take is fine.',
      'Save every take under the exact file name shown on its card, in the folder shown. The name is how the game finds it.',
      'Tick the box on a card once its takes are saved.'
    ],
    statusLegend: 'LIVE: in the game now, record first. PLANNED: written for the story, not in the game yet; its text may still change.',
    forAll: 'Recorded once in English and used in every language.',
    noText: 'No text in this language yet',
    sectionTodoLive: 'To record: in the game now',
    sectionTodoPlan: 'To record: planned',
    sectionRecorded: 'Recorded, waiting for processing',
    sectionDone: 'Done',
    sectionMissing: 'Waiting for a translation',
    nothing: 'Nothing here.',
    when: 'When', how: 'How', max: 'max', save: 'Save the takes as', ships: 'ships as',
    voice: 'Voice', avoid: 'Avoid',
    live: 'LIVE', planned: 'PLANNED',
    page: 'Page', of: 'of', quote: ['\u201c', '\u201d'],
    neutralNote: n => `${n} lines (Flux's barks, Vex's laughs) are recorded once in English for every language; see the English script.`
  },
  de: {
    title: 'Mega Droid: Sprachaufnahmen',
    lang: 'Deutsch',
    generated: 'Erstellt',
    source: 'Quelle: src/game/audio/voiceCatalog.ts. `pnpm voice:report` neu starten, wenn sich eine Zeile ändert oder eine Datei ankommt.',
    summary: 'Übersicht',
    speaker: 'Sprecher', lines: 'Zeilen', done: 'Fertig', recorded: 'Aufgenommen', todo: 'Aufzunehmen', total: 'Gesamt',
    contents: 'Inhalt',
    guide: 'So wird aufgenommen',
    guideItems: [
      'Nimm eine Figur nach der anderen auf: jede hat ihren eigenen Abschnitt, oben mit der Beschreibung der Stimme.',
      'Lies die Zeile genau so, wie sie dasteht. Wörter in GROSSBUCHSTABEN werden betont; "…" ist eine Pause; "—" heißt, die Zeile bricht mitten im Wort ab.',
      'Bleib unter der "max"-Länge. Kurz und knackig schlägt langsam und vollständig.',
      'Trocken und nah aufnehmen: kein Hall, keine Effekte, keine Musik. Die Roboter-Bearbeitung kommt danach.',
      'Nimm jede Zeile 3-mal auf und nummeriere die Takes 1, 2, 3 im Dateinamen (den besten zuerst, wenn möglich).',
      'Format: OGG (Vorbis), mono, 48 kHz, höchste Qualitätsstufe (q 8 oder mehr). Keine Stille am Anfang; eine halbe Sekunde Raumklang nach jedem Take ist in Ordnung.',
      'Speichere jeden Take unter genau dem Dateinamen auf seiner Karte, im angegebenen Ordner. Über den Namen findet das Spiel die Datei.',
      'Hake das Kästchen einer Karte ab, sobald ihre Takes gespeichert sind.'
    ],
    statusLegend: 'LIVE: schon im Spiel, zuerst aufnehmen. GEPLANT: für die Geschichte geschrieben, noch nicht im Spiel; der Text kann sich noch ändern (deutsche Texte dieser Zeilen sind Entwürfe).',
    forAll: 'Einmal auf Englisch aufgenommen und in allen Sprachen verwendet.',
    noText: 'Noch kein Text in dieser Sprache',
    sectionTodoLive: 'Aufzunehmen: schon im Spiel',
    sectionTodoPlan: 'Aufzunehmen: geplant',
    sectionRecorded: 'Aufgenommen, wartet auf Bearbeitung',
    sectionDone: 'Fertig',
    sectionMissing: 'Wartet auf eine Übersetzung',
    nothing: 'Nichts.',
    when: 'Wann', how: 'Wie', max: 'max.', save: 'Takes speichern als', ships: 'im Spiel als',
    voice: 'Stimme', avoid: 'Vermeiden',
    live: 'LIVE', planned: 'GEPLANT',
    page: 'Seite', of: 'von', quote: ['\u201e', '\u201c'],
    neutralNote: n => `${n} Zeilen (Fluxs Ausrufe, Vex' Lacher) werden einmal auf Englisch aufgenommen und in allen Sprachen verwendet; siehe das englische Skript.`
  }
}
const LI = { en: 0, de: 1 }

// ── Lines, text and status ──

const at = (o, key) => key.split('.').reduce((x, k) => x?.[k], o)

/** `{name}` → the param's text in `lang`; `{NAME}` → the same in capitals. */
const fill = (s, params, lang) => s.replace(/\{(\w+)\}/g, (m, name) => {
  const ref = params?.[name] ?? params?.[name.toLowerCase()]
  const v = ref ? at(LOCALES[lang], ref) : null
  if (typeof v !== 'string') return m
  return name === name.toUpperCase() ? v.toUpperCase() : v
})

/** The line's text in `lang`, or null when that language has none yet: the
 *  locale's when the key is there (every live line, and the ending's
 *  captions), else the draft. */
const textOf = (line, lang) => {
  const raw = at(LOCALES[lang], line.key) ?? line.draft?.[LI[lang]]
  return typeof raw === 'string' && raw.trim() ? fill(raw, line.params, lang) : null
}

const shipped = (line, lang) => {
  const base = join(ROOT, voicePath(line, lang)).replace(/\.ogg$/, '')
  return AUDIO_EXT.some(ext => existsSync(base + ext))
}
const rawFiles = new Map()
const rawIn = (dir) => {
  if (!rawFiles.has(dir)) rawFiles.set(dir, existsSync(dir) ? readdirSync(dir) : [])
  return rawFiles.get(dir)
}
const recorded = (line, lang) => {
  const dir = join(ROOT, dirname(rawPath(line, lang)))
  const base = fileName(line.key)
  return rawIn(dir).some(f => f.startsWith(`${base}_`) || f.startsWith(`${base}.`))
}

/** done | recorded | todo | missing (no text in this language). */
const statusOf = (line, lang) => {
  if (shipped(line, lang)) return 'done'
  if (recorded(line, lang)) return 'recorded'
  return textOf(line, lang) ? 'todo' : 'missing'
}

const linesFor = (lang) => VOICE_LINES
  .filter(l => lang === 'en' || !l.neutral)
  .map(l => ({ line: l, status: statusOf(l, lang), text: textOf(l, lang) }))

const sceneIndex = new Map(SCENES.map((s, i) => [s.id, i]))
const bySpeaker = (rows) => SPEAKER_ORDER
  .map(sp => ({ sp, rows: rows.filter(r => r.line.speaker === sp) }))
  .filter(g => g.rows.length)

const count = (rows) => ({
  lines: rows.length,
  done: rows.filter(r => r.status === 'done').length,
  recorded: rows.filter(r => r.status === 'recorded').length,
  todo: rows.filter(r => r.status === 'todo' || r.status === 'missing').length
})

// ── Console ──

const printList = (lang, rows) => {
  const u = UI[lang]
  const c = count(rows)
  console.log(`\n══ ${u.title} (${lang}) — ${u.lines}: ${c.lines} · ${u.done}: ${c.done} · ${u.recorded}: ${c.recorded} · ${u.todo}: ${c.todo}`)
  for (const { sp, rows: rs } of bySpeaker(rows)) {
    const k = count(rs)
    console.log(`\n  ${SPEAKERS[sp].name}  (${u.done}: ${k.done}/${k.lines})`)
    const groups = [
      ['✘', u.sectionTodoLive, rs.filter(r => r.status === 'todo' && r.line.status === 'live')],
      ['✘', u.sectionTodoPlan, rs.filter(r => r.status === 'todo' && r.line.status === 'planned')],
      ['?', u.sectionMissing, rs.filter(r => r.status === 'missing')],
      ['◐', u.sectionRecorded, rs.filter(r => r.status === 'recorded')],
      ['✔', u.sectionDone, rs.filter(r => r.status === 'done')]
    ]
    for (const [mark, title, g] of groups) {
      if (!g.length) continue
      console.log(`    ${mark} ${title} (${g.length})`)
      for (const r of g) console.log(`        ${(fileName(r.line.key) + '.ogg').padEnd(38)} ${r.text ?? '—'}`)
    }
  }
}

// ── PDF ──

// The standard PDF fonts speak Windows-1252: map the few characters outside
// it, so nothing prints as a stray glyph.
const CP1252 = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'])
const SUBST = { '−': '-', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '♯': '#', '✔': 'x', '½': '1/2' }
const safe = (s) => [...String(s)].map(ch => (ch.charCodeAt(0) < 256 || CP1252.has(ch) ? ch : SUBST[ch] ?? '?')).join('')

const A4 = { w: 595.28, h: 841.89 }
const M = { l: 56, r: 56, t: 60, b: 64 }
const W = A4.w - M.l - M.r
const C = {
  ink: '#16181d', soft: '#4a5160', faint: '#8a91a0', rule: '#d9dde4', card: '#f5f7fa',
  accent: '#1f4fd1', live: '#157a3c', planned: '#b26a00', done: '#6b7280'
}
const F = { reg: 'Helvetica', bold: 'Helvetica-Bold', it: 'Helvetica-Oblique', mono: 'Courier', monoBold: 'Courier-Bold' }

const writePdf = (lang, rows) => new Promise((resolve, reject) => {
  const u = UI[lang]
  const li = LI[lang]
  const out = join(ROOT, `src/assets/voice-lines-list_${lang}.pdf`)
  mkdirSync(dirname(out), { recursive: true })
  const doc = new PDFDocument({
    size: 'A4', margins: { top: M.t, bottom: M.b, left: M.l, right: M.r }, bufferPages: true,
    info: { Title: `${u.title} (${u.lang})`, Author: 'Mega Droid', Subject: 'Voice-over recording script' },
    lang: lang === 'de' ? 'de-DE' : 'en-GB', displayTitle: true
  })
  const stream = createWriteStream(out)
  doc.pipe(stream)
  stream.on('finish', () => resolve(out))
  stream.on('error', reject)

  const bottom = () => A4.h - M.b
  const room = (h) => { if (doc.y + h > bottom()) doc.addPage() }
  const T = (s, o = {}) => doc.text(safe(s), o)
  const h1 = (s, dest) => {
    doc.font(F.bold).fontSize(22).fillColor(C.ink)
    T(s, { destination: dest })
    doc.moveDown(0.3)
  }
  const h2 = (s, color = C.ink) => {
    room(60)
    doc.moveDown(0.6)
    doc.font(F.bold).fontSize(13).fillColor(color)
    T(s)
    const y = doc.y + 2
    doc.moveTo(M.l, y).lineTo(M.l + W, y).lineWidth(0.8).strokeColor(color).stroke()
    doc.y = y + 8
  }
  // `keep`: room for what follows too (a heading never ends a page alone).
  const h3 = (s, keep = 40) => {
    room(keep)
    doc.moveDown(0.3)
    doc.font(F.bold).fontSize(10).fillColor(C.soft)
    T(s.toUpperCase(), { characterSpacing: 0.6 })
    doc.moveDown(0.3)
  }
  const para = (s, o = {}) => {
    doc.font(o.font ?? F.reg).fontSize(o.size ?? 10).fillColor(o.color ?? C.ink)
    T(s, { width: o.width ?? W, lineGap: 2, ...o.opts })
  }

  // ── Cover ──
  const all = count(rows)
  doc.font(F.bold).fontSize(28).fillColor(C.ink)
  T(u.title)
  doc.font(F.reg).fontSize(14).fillColor(C.accent)
  T(u.lang)
  doc.moveDown(0.4)
  para(`${u.generated}: ${new Date().toISOString().slice(0, 10)}`, { color: C.soft, size: 9 })
  para(u.source, { color: C.soft, size: 9 })
  doc.moveDown(1)

  h2(u.summary)
  const cols = [
    { label: u.speaker, w: 150, align: 'left' },
    { label: u.lines, w: 65, align: 'right' },
    { label: u.done, w: 65, align: 'right' },
    { label: u.recorded, w: 100, align: 'right' },
    { label: u.todo, w: W - 380, align: 'right' }
  ]
  const tableRow = (cells, o = {}) => {
    const y = doc.y
    let x = M.l
    doc.font(o.bold ? F.bold : F.reg).fontSize(10)
    cells.forEach((cell, i) => {
      doc.fillColor(o.colors?.[i] ?? (o.head ? C.soft : C.ink))
      doc.text(safe(cell), x + (i ? 0 : 4), y, {
        width: cols[i].w - 8, align: cols[i].align, lineBreak: false, ellipsis: true, ...(o.links?.[i] ? { goTo: o.links[i] } : {})
      })
      x += cols[i].w
    })
    doc.y = y + 18
    doc.moveTo(M.l, doc.y - 4).lineTo(M.l + W, doc.y - 4).lineWidth(0.5).strokeColor(C.rule).stroke()
    doc.x = M.l
  }
  tableRow(cols.map(c => c.label), { head: true, bold: true })
  for (const { sp, rows: rs } of bySpeaker(rows)) {
    const k = count(rs)
    tableRow([SPEAKERS[sp].name, k.lines, k.done, k.recorded, k.todo], {
      links: [`sp-${sp}`], colors: [C.accent, C.ink, C.done, C.planned, k.todo ? C.ink : C.done]
    })
  }
  tableRow([u.total, all.lines, all.done, all.recorded, all.todo], { bold: true })
  if (lang !== 'en') {
    doc.moveDown(0.4)
    para(u.neutralNote(VOICE_LINES.filter(l => l.neutral).length), { size: 9, color: C.soft })
  }
  doc.moveDown(0.6)
  para(u.statusLegend, { size: 9, color: C.soft })

  h2(u.contents)
  const toc = [[u.guide, 'guide'], ...bySpeaker(rows).map(({ sp }) => [`${SPEAKERS[sp].name}: ${SPEAKERS[sp].role[li]}`, `sp-${sp}`])]
  for (const [label, dest] of toc) {
    doc.font(F.reg).fontSize(11).fillColor(C.accent)
    T(label, { goTo: dest, underline: false })
    doc.moveDown(0.25)
  }

  // ── How to record ──
  doc.addPage()
  doc.outline.addItem(u.guide)
  h1(u.guide, 'guide')
  u.guideItems.forEach((s, i) => {
    room(30)
    const y = doc.y
    doc.font(F.bold).fontSize(10).fillColor(C.accent).text(`${i + 1}.`, M.l, y, { width: 18 })
    doc.font(F.reg).fontSize(10).fillColor(C.ink).text(safe(s), M.l + 20, y, { width: W - 20, lineGap: 2 })
    doc.moveDown(0.5)
    doc.x = M.l
  })
  doc.moveDown(0.5)
  h3(u.save)
  const ex = rows.find(r => r.status !== 'done')?.line ?? VOICE_LINES[0]
  para(`${rawPath(ex, lang, 1)}\n${rawPath(ex, lang, 2)}\n${rawPath(ex, lang, 3)}`, { font: F.mono, size: 9 })
  doc.moveDown(0.3)
  para(`${u.ships}: ${voicePath(ex, lang)}`, { font: F.mono, size: 9, color: C.soft })

  // ── One section per speaker ──
  const card = (r) => {
    const l = r.line
    const text = r.text ? `${u.quote[0]}${r.text}${u.quote[1]}` : `(${u.noText})`
    const when = `${u.when}: ${fill(l.when[li], l.params, lang)}`
    const how = `${u.how}: ${l.direction[li]}`
    const files = [1, 2, 3].map(t => rawPath(l, lang, t).split('/').pop()).join('\n')
    const folder = dirname(rawPath(l, lang))
    const inner = W - 36
    doc.font(F.bold).fontSize(15)
    const hText = doc.heightOfString(safe(text), { width: inner, lineGap: 1 })
    doc.font(F.reg).fontSize(9)
    const hWhen = doc.heightOfString(safe(when), { width: inner })
    doc.font(F.it).fontSize(9)
    const hHow = doc.heightOfString(safe(how), { width: inner })
    doc.font(F.mono).fontSize(8)
    const hFiles = doc.heightOfString(safe(`${folder}/\n${files}`), { width: inner })
    const h = 14 + 16 + hText + 6 + hWhen + 2 + hHow + 8 + hFiles + 12
    room(h + 8)
    const x0 = M.l
    const y0 = doc.y
    doc.roundedRect(x0, y0, W, h, 6).fillColor(C.card).fill()
    doc.roundedRect(x0, y0, 3, h, 1.5).fillColor(l.status === 'live' ? C.live : C.planned).fill()
    // The tick box, the key, the badge and the length.
    doc.rect(x0 + 14, y0 + 13, 10, 10).lineWidth(0.9).strokeColor(C.soft).stroke()
    doc.font(F.monoBold).fontSize(10).fillColor(C.ink).text(safe(`${fileName(l.key)}.ogg`), x0 + 32, y0 + 13, { width: inner - 120, lineBreak: false })
    const badge = l.status === 'live' ? u.live : u.planned
    doc.font(F.bold).fontSize(7.5)
    const bw = doc.widthOfString(badge) + 10
    const bx = x0 + W - 14 - bw
    doc.roundedRect(bx, y0 + 12, bw, 12, 3).fillColor(l.status === 'live' ? C.live : C.planned).fill()
    doc.fillColor('#ffffff').text(badge, bx, y0 + 15, { width: bw, align: 'center', lineBreak: false })
    doc.font(F.reg).fontSize(9).fillColor(C.soft)
      .text(safe(`${u.max} ${l.max.toFixed(1)} s`), bx - 70, y0 + 14, { width: 64, align: 'right', lineBreak: false })
    let y = y0 + 30
    doc.font(F.bold).fontSize(15).fillColor(r.text ? C.ink : C.faint).text(safe(text), x0 + 32, y, { width: inner, lineGap: 1 })
    y += hText + 6
    doc.font(F.reg).fontSize(9).fillColor(C.soft).text(safe(when), x0 + 32, y, { width: inner })
    y += hWhen + 2
    doc.font(F.it).fontSize(9).fillColor(C.soft).text(safe(how), x0 + 32, y, { width: inner })
    y += hHow + 8
    doc.font(F.mono).fontSize(8).fillColor(C.accent).text(safe(`${folder}/\n${files}`), x0 + 32, y, { width: inner })
    doc.x = M.l
    doc.y = y0 + h + 8
  }
  const compact = (rs, color) => {
    for (const r of rs) {
      room(16)
      const y = doc.y
      doc.font(F.mono).fontSize(8.5).fillColor(color).text(safe(`${fileName(r.line.key)}.ogg`), M.l, y, { width: 200, lineBreak: false })
      doc.font(F.reg).fontSize(9).fillColor(C.soft).text(safe(r.text ?? '—'), M.l + 206, y, { width: W - 206 })
      doc.y = Math.max(doc.y, y + 13)
      doc.x = M.l
    }
  }
  const byScene = (rs) => SCENES
    .map(s => ({ s, rs: rs.filter(r => r.line.scene === s.id) }))
    .filter(g => g.rs.length)

  for (const { sp, rows: rs } of bySpeaker(rows)) {
    const info = SPEAKERS[sp]
    const k = count(rs)
    doc.addPage()
    const top = doc.outline.addItem(info.name)
    h1(info.name, `sp-${sp}`)
    para(info.role[li], { color: C.accent, size: 12 })
    doc.moveDown(0.5)
    para(`${u.voice}: ${info.voice[li]}`, { size: 10 })
    if (info.avoid) {
      doc.moveDown(0.3)
      para(`${u.avoid}: ${info.avoid[li]}`, { size: 10, color: C.soft })
    }
    if (rs.some(r => r.line.neutral)) {
      doc.moveDown(0.3)
      para(u.forAll, { size: 9, font: F.it, color: C.soft })
    }
    doc.moveDown(0.4)
    para(`${u.lines}: ${k.lines} · ${u.done}: ${k.done} · ${u.recorded}: ${k.recorded} · ${u.todo}: ${k.todo}`, { size: 9, color: C.soft })

    const sections = [
      [u.sectionTodoLive, rs.filter(r => r.status === 'todo' && r.line.status === 'live'), 'cards', C.live],
      [u.sectionTodoPlan, rs.filter(r => r.status === 'todo' && r.line.status === 'planned'), 'cards', C.planned],
      [u.sectionMissing, rs.filter(r => r.status === 'missing'), 'list', C.faint],
      [u.sectionRecorded, rs.filter(r => r.status === 'recorded'), 'list', C.planned],
      [u.sectionDone, rs.filter(r => r.status === 'done'), 'list', C.done]
    ]
    for (const [title, g, kind, color] of sections) {
      if (!g.length && kind === 'list') continue
      h2(`${title} (${g.length})`, color)
      const item = top.addItem(`${title} (${g.length})`)
      if (!g.length) { para(u.nothing, { color: C.faint, size: 9 }); continue }
      for (const { s, rs: sg } of byScene(g)) {
        h3(s.title[li], kind === 'cards' ? 150 : 60)
        if (kind === 'cards') item.addItem(s.title[li])
        if (kind === 'cards') sg.forEach(card)
        else compact(sg, color)
      }
    }
  }

  // Footers, once every page exists.
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc.page.margins.bottom = 0
    doc.font(F.reg).fontSize(8).fillColor(C.faint)
    doc.text(safe(`${u.title} · ${u.lang}`), M.l, A4.h - 40, { width: W / 2, lineBreak: false })
    doc.text(`${u.page} ${i + 1} ${u.of} ${range.count}`, M.l + W / 2, A4.h - 40, { width: W / 2, align: 'right', lineBreak: false })
  }
  doc.end()
})

for (const lang of langs) {
  const rows = linesFor(lang)
  if (!quiet) printList(lang, rows)
  const out = await writePdf(lang, rows)
  const c = count(rows)
  console.log(`\n${out.replace(ROOT + '/', '')}: ${c.lines} lines, ${c.done} done, ${c.recorded} recorded, ${c.todo} to record`)
}
