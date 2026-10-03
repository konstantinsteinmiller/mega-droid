import type { VoiceLine } from './voiceCatalog'

/**
 * ─── voice-todo.md, rendered ─────────────────────────────────────────────────
 *
 * The to-do list of the voice work: every line the game speaks, with its
 * file, when it plays, its text and whether each language has a recording
 * yet (and from which engine, `vo-src/shipped.json`). Missing lines come
 * first. A pure function, so the test that keeps the file current and the
 * script that writes it (`pnpm voice:script`, and every `voice:gen` run)
 * render the same text.
 */
export interface VoiceTodoInput {
  lines: readonly VoiceLine[]
  locales: { en: unknown; de: unknown }
  /** `<lang>/<file>` → the engine that made the shipped file. */
  shipped: Readonly<Record<string, { engine: string }>>
  /** The file names (without extension) present per language. */
  files: { en: ReadonlySet<string>; de: ReadonlySet<string> }
  fileName: (key: string) => string
}

const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
const cell = (s: unknown): string => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const NAMES: Record<string, string> = { atlas: 'Atlas', vex: 'Vex', flux: 'Flux', gauss: 'Gauss', pip: 'Pip' }

export const renderVoiceTodo = ({ lines, locales, shipped, files, fileName }: VoiceTodoInput): string => {
  const live = lines.filter(l => l.status === 'live')
  const fill = (s: string, params: VoiceLine['params'], loc: unknown) =>
    s.replace(/\{(\w+)\}/g, (m, n: string) => {
      const v = at(loc, params?.[n] ?? params?.[n.toLowerCase()] ?? '')
      return typeof v === 'string' ? (n === n.toUpperCase() ? v.toUpperCase() : v) : m
    })
  const text = (l: VoiceLine, lang: 'en' | 'de') => {
    if (l.neutral && lang === 'de') return '(English for all)'
    const raw = at(locales[lang], l.key) ?? l.draft?.[lang === 'en' ? 0 : 1]
    return typeof raw === 'string' ? fill(raw, l.params, locales[lang]) : null
  }
  const state = (l: VoiceLine, lang: 'en' | 'de'): string | null => {
    if (l.neutral && lang === 'de') return 'en file'
    const f = fileName(l.key)
    if (!files[lang].has(f)) return null
    return shipped[`${lang}/${f}`]?.engine ?? 'by hand'
  }
  const needs = (l: VoiceLine): Array<'en' | 'de'> => (['en', 'de'] as const).filter(g => !state(l, g))
  const missing = live.filter(l => needs(l).length)
  const row = (l: VoiceLine) =>
    `| \`${fileName(l.key)}\` | ${NAMES[l.speaker] ?? l.speaker} | ${cell(fill(l.when[0], l.params, locales.en))} | ${cell(text(l, 'en'))} | ${cell(text(l, 'de'))} | ${state(l, 'en') ?? '**missing**'} | ${state(l, 'de') ?? '**missing**'} |`
  const head = '| File | Who | Plays when | English | German | EN | DE |\n| --- | --- | --- | --- | --- | --- | --- |'
  const count = (lang: 'en' | 'de') => live.filter(l => state(l, lang)).length
  const speakers = [...new Set(live.map(l => l.speaker))]
  const bySpeaker = speakers.map(s => {
    const mine = live.filter(l => l.speaker === s)
    return `| ${NAMES[s] ?? s} | ${mine.length} | ${mine.filter(l => state(l, 'en')).length} | ${mine.filter(l => state(l, 'de')).length} |`
  })
  return `# Voice-over to-do

Generated from the voice catalogue (src/game/audio/voiceCatalog.ts), the
locales and vo-src/shipped.json by \`pnpm voice:script\`; every \`pnpm
voice:gen\` run rewrites it, and a test fails when it is stale. Do not edit by
hand. Every text line in a speaker's section of the locales is a voice line by
itself, so a new line shows up here as missing until it is voiced.

- **Files:** \`public/audio/voice/<en|de>/<file>.ogg\`. German players hear
  the German file, everyone else the English one; a German line without a file
  falls back to the English recording. A line with no file just shows its
  bubble.
- **Make the missing ones:** \`pnpm voice:collect\`, then
  \`node tools/voice/generate.mjs --engine <engine> --takes 1\` (it voices
  only lines without a take), then \`--retry 2\` for the ones that fail QA.

| Who | Lines | EN voiced | DE voiced |
| --- | --- | --- | --- |
${bySpeaker.join('\n')}
| **All** | **${live.length}** | **${count('en')}** | **${count('de')}** |

## Missing (${missing.length})

${missing.length ? `${head}\n${missing.map(row).join('\n')}` : 'Nothing: every line has its recordings.'}

## Every line (${live.length})

${head}
${live.map(row).join('\n')}
`
}
