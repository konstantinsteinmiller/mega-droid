// Shared by the voice-over pipeline (`pnpm voice:*`, tools/voice/): the
// catalogue, the cards, the locales, a line's text, and the folders.
//
// Runs on Node's own TypeScript stripping (`--experimental-strip-types`): the
// catalogue, the cards and the locales are imported straight from src/.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = async (rel) => import(pathToFileURL(join(ROOT, rel)).href)

/**
 * ADAPT (the one block a new project edits): where the line catalogue, the
 * voice cards and the locales live, which languages get a voice (in the order
 * of the catalogue's `[a, b]` text pairs), and where the files go.
 */
const PATHS = {
  catalog: 'src/game/audio/voiceCatalog.ts',
  cards: 'src/game/audio/voiceCards.ts',
  locale: (lang) => `src/i18n/locales/${lang}.ts`,
  langs: ['en', 'de', 'es', 'zh'],
  work: 'vo-src',
  out: 'public/audio/voice'
}

const catalog = await load(PATHS.catalog)
export const { SPEAKERS, SCENES, fileName } = catalog
export const { CARDS, TONES, toneOf } = await load(PATHS.cards)
export const LANGS = PATHS.langs
export const LOCALES = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, (await load(PATHS.locale(l))).default])))
/** Every voice line: the catalogue's detail plus every text line of a
 *  speaker's section in the source locale (`deriveVoiceLines`). */
export const VOICE_LINES = catalog.deriveVoiceLines(LOCALES[LANGS[0]])
const LI = Object.fromEntries(LANGS.map((l, i) => [l, i]))

/** Pipeline work files: sources worth keeping (refs) and caches (gen). */
export const VO_SRC = join(ROOT, PATHS.work)
/** Where the game reads the finished files (`vite.config.ts` lists them). */
export const VOICE_OUT = join(ROOT, PATHS.out)

export const at = (o, key) => key.split('.').reduce((x, k) => x?.[k], o)

/** `{name}` → the param's text in `lang`; `{NAME}` → the same in capitals. */
export const fill = (s, params, lang) => s.replace(/\{(\w+)\}/g, (m, name) => {
  const ref = params?.[name] ?? params?.[name.toLowerCase()]
  const v = ref ? at(LOCALES[lang], ref) : null
  if (typeof v !== 'string') return m
  return name === name.toUpperCase() ? v.toUpperCase() : v
})

/**
 * The line's text in `lang`, or null when that language has none: the
 * locale's when the key is there (every live line, and the ending's
 * captions), else the draft. A neutral line (barks, laughs) is English only.
 */
export const textOf = (line, lang) => {
  if (line.neutral && lang !== 'en') return null
  const raw = at(LOCALES[lang], line.key) ?? line.draft?.[LI[lang]]
  return typeof raw === 'string' && raw.trim() ? fill(raw, line.params, lang) : null
}

/** `--name value` / `--flag` from argv. */
export const args = (argv = process.argv.slice(2)) => {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { o._.push(a); continue }
    const [k, v] = a.slice(2).split('=')
    if (v !== undefined) o[k] = v
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i]
    else o[k] = true
  }
  return o
}

/** `voice:collect --samples`: one calm, one urgent and one shouted line — two
 *  voices, three deliveries, a name in capitals — to compare engines on. */
export const SAMPLE_KEYS = ['story.atlas.goodMorning', 'atlas.lowHp', 'vex.present.blaze']
