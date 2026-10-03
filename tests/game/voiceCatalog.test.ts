// The voice catalog (`audio/voiceCatalog.ts`): the one list of every
// voice-over line, which the recording scripts (`pnpm voice:report`) and
// voice-todo.md are generated from. It must cover every line the game can
// speak, name files the loader can find, and agree with the game data its
// variants are built from (weaknesses, sector floors), so a script never
// asks for a line the game will not play.

import { describe, expect, it } from 'vitest'
import { SCENES, SPEAKERS, WEAK_TO, SECTOR_FLOOR, SPEECH, RETIRED, VOICE_DETAIL, speechRuleOf, voicePath, rawPath, fileName } from '@/game/audio/voiceCatalog'
import { VOICE_LINES } from '@/game/audio/voiceLines'
import { voiceFiles } from '@/game/assets/overrides'
import { ATLAS_LINES, atlasKey } from '@/game/sim/atlas'
import { BOSSES } from '@/game/data/bosses'
import { SECTORS } from '@/game/data/regions'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'

const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)

describe('the voice catalog', () => {
  it('lists each key once, and no key holds an underscore (file names map back to one key)', () => {
    const keys = VOICE_LINES.map(l => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k, k).not.toContain('_')
  })

  it('covers every line Atlas can say in a mission, and the intro\'s, as live lines', () => {
    const live = new Set(VOICE_LINES.filter(l => l.status === 'live').map(l => l.key))
    for (const k of [...ATLAS_LINES.map(atlasKey), 'story.atlas.logStart', 'story.atlas.goodMorning', 'story.atlas.scrapyardFirst']) {
      expect(live.has(k), k).toBe(true)
    }
  })

  it('holds every text line of a speaker\'s section: the text decides, nothing is listed by hand', () => {
    const leaves = (o: unknown, p: string): string[] => Object.entries(o as Record<string, unknown>)
      .flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]))
    const keys = new Set(VOICE_LINES.map(l => l.key))
    const spoken = leaves(en, '').filter(k => speechRuleOf(k) && !RETIRED.has(k))
    expect(spoken.filter(k => !keys.has(k))).toEqual([])
    // The lesson rooms, the stage hints and Flux's fumble lines went unvoiced
    // for months while the catalogue was a hand-kept list.
    for (const k of ['atlas.train.charge', 'atlas.help.block', 'atlas.hint.neon.kick', 'flux.fumble.1']) expect(keys.has(k), k).toBe(true)
  })

  it('gives each speaker\'s whole top-level section a rule, and each rule a known speaker and scene', () => {
    for (const ns of ['atlas', 'vex', 'pip', 'flux']) expect(speechRuleOf(`${ns}.x`)?.speaker, ns).toBe(ns)
    const scenes = new Set(SCENES.map(s => s.id))
    for (const r of SPEECH) {
      expect(SPEAKERS[r.speaker], r.at).toBeTruthy()
      expect(scenes.has(r.scene), r.at).toBe(true)
    }
    // Captions and UI are nobody's lines.
    for (const k of ['story.intro.lab', 'ending.card.title', 'train.card.charge', 'hud.level']) expect(speechRuleOf(k), k).toBeUndefined()
  })

  it('retires only keys that exist, and lists every detailed line once among the voice lines', () => {
    for (const k of RETIRED) expect(typeof at(en, k), k).toBe('string')
    const keys = VOICE_LINES.map(l => l.key)
    for (const l of VOICE_DETAIL) expect(keys.filter(k => k === l.key), l.key).toHaveLength(1)
  })

  it('live lines have their text in both locales; planned lines carry a draft in both (or are in both locales)', () => {
    for (const l of VOICE_LINES) {
      if (l.neutral) {
        // Barks and laughs: no bubble, so no locale text; the draft is the sound.
        expect(l.neutral && l.draft?.[0], l.key).toBeTruthy()
      } else if (l.status === 'live' || !l.draft) {
        expect(typeof at(en, l.key), `en ${l.key}`).toBe('string')
        expect(typeof at(de, l.key), `de ${l.key}`).toBe('string')
      } else {
        expect(l.draft?.[0], l.key).toBeTruthy()
        expect(l.draft?.[1], l.key).toBeTruthy()
      }
    }
  })

  it('no line carries a draft for a key the locales already hold (the two would drift)', () => {
    for (const l of VOICE_LINES) {
      if (l.draft) expect(at(en, l.key), l.key).toBeUndefined()
    }
  })

  it('every {placeholder} has a param that names a real i18n string', () => {
    for (const l of VOICE_LINES) {
      const texts = [...(l.draft ?? []), ...l.when]
      for (const t of texts) {
        for (const [, name] of t.matchAll(/\{(\w+)\}/g)) {
          const ref = l.params?.[name!] ?? l.params?.[name!.toLowerCase()]
          expect(ref, `${l.key}: {${name}}`).toBeTruthy()
          expect(typeof at(en, ref!), `${l.key}: en ${ref}`).toBe('string')
          expect(typeof at(de, ref!), `${l.key}: de ${ref}`).toBe('string')
        }
      }
    }
  })

  it('every line has a known speaker and scene, a direction in both languages and a sane max length', () => {
    const scenes = new Set(SCENES.map(s => s.id))
    for (const l of VOICE_LINES) {
      expect(SPEAKERS[l.speaker], l.key).toBeTruthy()
      expect(scenes.has(l.scene), l.key).toBe(true)
      expect(l.direction[0] && l.direction[1], l.key).toBeTruthy()
      expect(l.max, l.key).toBeGreaterThan(0.2)
      expect(l.max, l.key).toBeLessThanOrEqual(3.5)
    }
  })

  it('agrees with the game data: each Master\'s weakness, each sector\'s floor level', () => {
    for (const [boss, weapon] of WEAK_TO) expect(BOSSES[boss as keyof typeof BOSSES].weakTo, boss).toBe(weapon)
    const withWeakness = Object.values(BOSSES).filter(b => b.weakTo).map(b => b.id)
    expect(WEAK_TO.map(([b]) => b).sort()).toEqual(withWeakness.sort())
    for (const [sector, level] of SECTOR_FLOOR) expect(SECTORS.find(s => s.id === sector)?.levels[0], sector).toBe(level)
  })

  it('files go where the loader looks; lines for every language are recorded in English once', () => {
    const line = VOICE_LINES.find(l => l.key === 'atlas.landed')!
    expect(voicePath(line, 'de')).toBe('public/audio/voice/de/atlas_landed.ogg')
    expect(rawPath(line, 'de', 2)).toBe('vo-src/raw/de/atlas/atlas_landed_2.ogg')
    const bark = VOICE_LINES.find(l => l.key === 'flux.hurt.light.1')!
    expect(bark.neutral).toBe(true)
    expect(voicePath(bark, 'de')).toBe('public/audio/voice/en/flux_hurt_light_1.ogg')
    // The loader reads the underscore name back as the key (a dotted name still works).
    const files = voiceFiles([`en/${fileName('story.atlas.logStart')}.ogg`, 'en/atlas.exit.ogg'])
    expect(files.get('en')?.get('story.atlas.logStart')).toMatch(/story_atlas_logStart\.ogg$/)
    expect(files.get('en')?.get('atlas.exit')).toMatch(/atlas\.exit\.ogg$/)
  })
})
