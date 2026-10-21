// @vitest-environment jsdom
// One recording per sentence: a line with the same speaker, language and words
// as another plays that one's file (`voiceAliases.ts`, written by
// `pnpm voice:collect`), so no sentence is voiced (and paid for) twice.

import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { VOICE_ALIASES } from '@/game/audio/voiceAliases'
import { VOICE_LINES } from '@/game/audio/voiceLines'
import { fileName, voiceAliasesOf, type VoiceLine } from '@/game/audio/voiceCatalog'
import { voiceUrl } from '@/game/audio/voice'
import { voiceFiles } from '@/game/assets/overrides'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
import es from '@/i18n/locales/es'
import zh from '@/i18n/locales/zh'
import fr from '@/i18n/locales/fr'

const ROOT = resolve(__dirname, '../..')
const LANGS = ['en', 'de', 'es', 'zh', 'fr'] as const
const LOCALES: Record<string, unknown> = { en, de, es, zh, fr }
const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
const filesOf = (lang: string) => {
  const dir = resolve(ROOT, 'public/audio/voice', lang)
  return new Set(existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)) : [])
}
/** The line's shown text in a language, `{name}` filled from its params. */
const shown = (l: VoiceLine, lang: string): string | null => {
  if (l.neutral && lang !== 'en') return null
  const raw = at(LOCALES[lang], l.key) ?? (lang === 'en' ? l.draft?.[0] : lang === 'de' ? l.draft?.[1] : undefined)
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.replace(/\{(\w+)\}/g, (m, n: string) => {
    const v = at(LOCALES[lang], l.params?.[n] ?? l.params?.[n.toLowerCase()] ?? '')
    return typeof v === 'string' ? (n === n.toUpperCase() ? v.toUpperCase() : v) : m
  })
}
const live = VOICE_LINES.filter(l => l.status === 'live')

const line = (key: string, extra: Partial<VoiceLine> = {}): VoiceLine => ({
  key, speaker: 'pip', scene: 'debrief', status: 'live', when: ['', ''], direction: ['', ''], max: 3, ...extra
})

describe('voice aliases', () => {
  it('groups the same speaker, language and words (spaces trimmed), never across speakers or a distinct line', () => {
    const lines = [line('a.one'), line('a.two'), line('a.three'), line('a.four', { speaker: 'atlas' }), line('a.five', { distinct: true })]
    const text: Record<string, string> = { 'a.one': 'Ich hüte das Labor.', 'a.two': ' Ich hüte  das Labor. ', 'a.three': 'Ich hüte das Labor!', 'a.four': 'Ich hüte das Labor.', 'a.five': 'Ich hüte das Labor.' }
    expect(voiceAliasesOf(lines, ['de'], l => text[l.key]!)).toEqual({ de: { 'a.two': 'a.one' } })
    // The twin that already has a recording stays the file.
    expect(voiceAliasesOf(lines, ['de'], l => text[l.key]!, (_, f) => f === 'a_two')).toEqual({ de: { 'a.one': 'a.two' } })
  })

  it('every alias points at a live line of the same speaker and words that has its own file', () => {
    for (const lang of LANGS) {
      const files = filesOf(lang)
      for (const [alias, canon] of Object.entries(VOICE_ALIASES[lang] ?? {})) {
        const a = live.find(l => l.key === alias)
        const c = live.find(l => l.key === canon)
        expect(a && c, `${lang} ${alias} → ${canon}`).toBeTruthy()
        expect(a!.speaker).toBe(c!.speaker)
        expect(shown(a!, lang)?.trim()).toBe(shown(c!, lang)?.trim())
        expect(VOICE_ALIASES[lang]?.[canon], `${canon} is itself an alias`).toBeUndefined()
        expect(files.has(fileName(canon)) || !files.has(fileName(alias)), `${lang}/${fileName(canon)}.ogg missing`).toBe(true)
        // The alias's own old file is redundant: deleted, never shipped twice.
        expect(files.has(fileName(alias)), `${lang}/${fileName(alias)}.ogg is redundant`).toBe(false)
      }
    }
  })

  it('no two shipped files of one speaker and language say the same words (unless a line is distinct)', () => {
    for (const lang of LANGS) {
      const files = filesOf(lang)
      const seen = new Map<string, string>()
      for (const l of live) {
        if (l.distinct || !files.has(fileName(l.key))) continue
        const t = shown(l, lang)?.trim().replace(/\s+/g, ' ')
        if (!t) continue
        const id = `${l.speaker}\n${t}`
        expect(seen.get(id), `${lang}: ${l.key} says the same as ${seen.get(id)}`).toBeUndefined()
        seen.set(id, l.key)
      }
    }
  })

  it('an alias key plays its twin\'s file, in its language and in the English fallback', () => {
    const files = voiceFiles(['de/pip_debrief_go.ogg', 'en/pip_debrief_go.ogg'])
    const aliases = { de: { 'pip.debrief.again': 'pip.debrief.go' }, en: { 'pip.debrief.again': 'pip.debrief.go' } }
    expect(voiceUrl('pip.debrief.again', 'de', files, aliases)).toMatch(/audio\/voice\/de\/pip_debrief_go\.ogg$/)
    expect(voiceUrl('pip.debrief.again', 'es', files, aliases)).toMatch(/audio\/voice\/en\/pip_debrief_go\.ogg$/)
    expect(voiceUrl('pip.debrief.again', 'de', files, {})).toBeNull()
  })

  it('Pip\'s German "Ich hüte das Labor" is one file: the one the Neon debrief plays', () => {
    const keys = live.filter(l => l.speaker === 'pip' && /Ich hüte das Labor/.test(shown(l, 'de') ?? '')).map(l => l.key)
    expect(keys).toEqual(['pip.debrief.go'])
    // A twin added later plays this file, never its own.
    for (const k of keys) expect(VOICE_ALIASES.de?.[k] ?? k).toBe('pip.debrief.go')
    expect(filesOf('de').has('pip_debrief_go')).toBe(true)
    expect(voiceUrl('pip.debrief.go', 'de', voiceFiles(['de/pip_debrief_go.ogg']))).toMatch(/de\/pip_debrief_go\.ogg$/)
  })
})
