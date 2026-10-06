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
  /** The voiced languages, the source first (`tools/voice/lib.mjs` PATHS.langs). */
  langs: readonly string[]
  /** Each voiced language's locale. */
  locales: Readonly<Record<string, unknown>>
  /** `<lang>/<file>` → the engine that made the shipped file. */
  shipped: Readonly<Record<string, { engine: string }>>
  /** The file names (without extension) present per language. */
  files: Readonly<Record<string, ReadonlySet<string>>>
  fileName: (key: string) => string
}

const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
const cell = (s: unknown): string => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const NAMES: Record<string, string> = { atlas: 'Atlas', vex: 'Vex', flux: 'Flux', gauss: 'Gauss', pip: 'Pip' }
const LANG_NAMES: Record<string, string> = { en: 'English', de: 'German', es: 'Spanish', zh: 'Chinese' }

export const renderVoiceTodo = ({ lines, langs, locales, shipped, files, fileName }: VoiceTodoInput): string => {
  const live = lines.filter(l => l.status === 'live')
  const src = langs[0]!
  const fill = (s: string, params: VoiceLine['params'], loc: unknown) =>
    s.replace(/\{(\w+)\}/g, (m, n: string) => {
      const v = at(loc, params?.[n] ?? params?.[n.toLowerCase()] ?? '')
      return typeof v === 'string' ? (n === n.toUpperCase() ? v.toUpperCase() : v) : m
    })
  const text = (l: VoiceLine, lang: string) => {
    if (l.neutral && lang !== src) return '(English for all)'
    // A draft (a line not in the locales yet) is written in English and German.
    const raw = at(locales[lang], l.key) ?? (lang === 'en' ? l.draft?.[0] : lang === 'de' ? l.draft?.[1] : undefined)
    return typeof raw === 'string' ? fill(raw, l.params, locales[lang]) : null
  }
  const state = (l: VoiceLine, lang: string): string | null => {
    if (l.neutral && lang !== src) return 'en file'
    const f = fileName(l.key)
    if (!files[lang]?.has(f)) return null
    return shipped[`${lang}/${f}`]?.engine ?? 'by hand'
  }
  const needs = (l: VoiceLine): string[] => langs.filter(g => !state(l, g))
  const missing = live.filter(l => needs(l).length)
  const row = (l: VoiceLine) =>
    `| \`${fileName(l.key)}\` | ${NAMES[l.speaker] ?? l.speaker} | ${cell(fill(l.when[0], l.params, locales[src]))} | ${langs.map(g => cell(text(l, g))).join(' | ')} | ${langs.map(g => state(l, g) ?? '**missing**').join(' | ')} |`
  const head = `| File | Who | Plays when | ${langs.map(g => LANG_NAMES[g] ?? g).join(' | ')} | ${langs.map(g => g.toUpperCase()).join(' | ')} |\n| --- | --- | --- | ${langs.map(() => '---').join(' | ')} | ${langs.map(() => '---').join(' | ')} |`
  const count = (lang: string) => live.filter(l => state(l, lang)).length
  const speakers = [...new Set(live.map(l => l.speaker))]
  const bySpeaker = speakers.map(s => {
    const mine = live.filter(l => l.speaker === s)
    return `| ${NAMES[s] ?? s} | ${mine.length} | ${langs.map(g => mine.filter(l => state(l, g)).length).join(' | ')} |`
  })
  const others = langs.slice(1).map(g => LANG_NAMES[g] ?? g)
  const othersList = others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}` : others.join('')
  return `# Voice-over to-do

Generated from the voice catalogue (src/game/audio/voiceCatalog.ts), the
locales and vo-src/shipped.json by \`pnpm voice:script\`; every \`pnpm
voice:gen\` run rewrites it, and a test fails when it is stale. Do not edit by
hand. Every text line in a speaker's section of the locales is a voice line by
itself, so a new line shows up here as missing until it is voiced.

- **Files:** \`public/audio/voice/<${langs.join('|')}>/<file>.ogg\`. ${othersList}
  players hear their own language's file (Traditional Chinese players the
  Mandarin one), everyone else the English one; a line without a file in the
  player's language falls back to the English recording. A line with no file
  just shows its bubble.
- **Make the missing ones:** \`pnpm voice:collect\`, then
  \`node tools/voice/generate.mjs --engine <engine> --takes 1\` (it voices
  only lines without a take), then \`--retry 2\` for the ones that fail QA.

| Who | Lines | ${langs.map(g => `${g.toUpperCase()} voiced`).join(' | ')} |
| --- | --- | ${langs.map(() => '---').join(' | ')} |
${bySpeaker.join('\n')}
| **All** | **${live.length}** | ${langs.map(g => `**${count(g)}**`).join(' | ')} |

## Missing (${missing.length})

${missing.length ? `${head}\n${missing.map(row).join('\n')}` : 'Nothing: every line has its recordings.'}

## Every line (${live.length})

${head}
${live.map(row).join('\n')}
`
}
