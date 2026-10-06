// @vitest-environment jsdom
// Atlas, Flux's AI companion (`sim/atlas.ts`, `audio/voice.ts`).
//
// What it says and when: one line on the way in; one line at a time, the
// urgent ones first; warnings that fire once and re-arm only when their cause
// has cleared; tips spaced out, said once in a save, or not at all when the
// thing is plain to see (#122) — never a nag. Where its model is:
// in view while it talks. And the voice layer: German for German players,
// English for everyone else, and a missing or broken file is never an error
// — the line just stays a speech bubble.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AtlasDirector, ATLAS_LINES, ATLAS_GAP, CHATTER_GAP, VOICE_WAIT, atlasKey, isChatter, lineSeconds, onceEver,
  type AtlasLine, type AtlasMemory, type AtlasMissionInfo, type AtlasTick
} from '@/game/sim/atlas'
import { voiceLangFor, voiceUrl, playVoice, preloadVoices, __resetVoices } from '@/game/audio/voice'
import { voiceFiles } from '@/game/assets/overrides'
import en from '@/i18n/locales/en'

const info = (o: Partial<AtlasMissionInfo> = {}): AtlasMissionInfo =>
  ({ tutorial: false, kind: 'story', template: 'boss', sector: 'blaze', freed: 1, ...o })
const tick = (o: Partial<AtlasTick> = {}): AtlasTick =>
  ({ playing: true, combat: false, hp01: 1, tanks: 1, we01: -1, level: 3, objectiveDone: false, trapNear: -1, plateNear: false, ...o })

/** A save's memory of the once-ever lines (the profile's tips, in the game). */
const memory = (): AtlasMemory & { said: Set<string> } => {
  const said = new Set<string>()
  return { said, seen: (id) => said.has(id), mark: (id) => { said.add(id) } }
}
const director = (i: AtlasMissionInfo = info(), ever: AtlasMemory = memory()): AtlasDirector =>
  new AtlasDirector(i, () => null, () => 'none', () => false, ever)

/** Run the director for `sec` seconds; collect every line that came up. */
const run = (a: AtlasDirector, sec: number, k: AtlasTick = tick(), said: string[] = []): string[] => {
  for (let t = 0; t < sec; t += 1 / 60) {
    const before = a.line
    a.update(1 / 60, k)
    if (a.line && a.line !== before) said.push(a.line.id)
  }
  return said
}

const lookup = (key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], en)

describe('Atlas: every line has its text', () => {
  it('each mission line is an English string under atlas.*', () => {
    for (const l of ATLAS_LINES) expect(typeof lookup(atlasKey(l)), atlasKey(l)).toBe('string')
  })
  it('lines are short (a small bubble)', () => {
    for (const l of ATLAS_LINES) expect((lookup(atlasKey(l)) as string).length, l).toBeLessThanOrEqual(38)
  })
})

describe('Atlas: what it says, and when', () => {
  it('briefs on the way in with ONE line; the story so far follows after a long quiet, once in a save', () => {
    const ever = memory()
    const a = director(info({ sector: 'cryo', freed: 2 }), ever)
    a.event('landed')
    a.event('play')
    // The landing has no line of its own: the briefing is the one line.
    expect(run(a, 10)).toEqual(['story.cryo'])
    expect(run(a, 20)).toEqual(['arc.2'])
    // The same count again (a retry, a replay): the briefing alone.
    const b = director(info({ sector: 'cryo', freed: 2 }), ever)
    b.event('play')
    expect(run(b, 40)).toEqual(['story.cryo'])
  })

  it('a job, a climb and the tutorial get their own briefing; a job says "Touchdown!" by turns', () => {
    for (const [i, line] of [
      [info({ kind: 'job' }), 'brief.job'], [info({ kind: 'job', variant: 3 }), 'landed'],
      [info({ kind: 'job', template: 'climb' }), 'brief.climb'], [info({ tutorial: true }), 'brief.tutorial']
    ] as const) {
      const a = new AtlasDirector(i)
      a.event('landed')
      a.event('play')
      expect(run(a, 20)).toEqual([line])
    }
  })

  it('urgent lines go first', () => {
    const a = new AtlasDirector(info())
    a.say('idle.1')
    a.say('bossAhead')
    a.update(1 / 60, tick())
    a.say('lowHp')
    // Lines without a voice hold twice as long as they used to (readability).
    const said = run(a, 45)
    expect(said).toEqual(['lowHp', 'idle.1'])
  })

  it('health in two steps with a gel: "use a gel" under half, "Critical!" under a quarter, re-armed by healing', () => {
    const a = new AtlasDirector(info())
    const said = run(a, 6, tick({ hp01: 0.4, tanks: 2 }))
    expect(said).toEqual(['lowHpGel'])
    run(a, 10, tick({ hp01: 0.4, tanks: 2 }), said)
    expect(said).toEqual(['lowHpGel'])
    run(a, 8, tick({ hp01: 0.2, tanks: 2 }), said)
    expect(said).toEqual(['lowHpGel', 'warn.critical'])
    // Healed, then hurt again in the same mission: one word is enough.
    run(a, 1, tick({ hp01: 0.9 }), said)
    run(a, 40, tick({ hp01: 0.4, tanks: 2 }), said)
    expect(said).toEqual(['lowHpGel', 'warn.critical', 'warn.gel'])
  })

  it('one hit through both steps says only the critical line; with no gel: "No gel left", then the plain warning', () => {
    const a = new AtlasDirector(info())
    expect(run(a, 8, tick({ hp01: 0.2, tanks: 2 }))).toEqual(['warn.critical'])
    const b = new AtlasDirector(info())
    const said = run(b, 8, tick({ hp01: 0.2, tanks: 0 }))
    expect(said).toEqual(['warn.noGel'])
    run(b, 1, tick({ hp01: 0.9, tanks: 0 }), said)
    run(b, 40, tick({ hp01: 0.2, tanks: 0 }), said)
    expect(said).toEqual(['warn.noGel', 'lowHp'])
  })

  it('says a teaching line in full the first time ever, and never again', () => {
    const seen = new Set<string>()
    const first = (flag: string): boolean => (seen.has(flag) ? false : (seen.add(flag), true))
    const a = new AtlasDirector(info(), () => null, () => 'none', first)
    const said = run(a, 6, tick({ hp01: 0.4, tanks: 1 }))
    run(a, 8, tick({ hp01: 0.2, tanks: 1 }), said)
    run(a, 6, tick({ trapNear: 2, trapKind: 'flame' }), said)
    expect(said).toEqual(['warn.gelFirst', 'warn.criticalFirst', 'warn.flame'])
    // The next mission, the same save: the short variants.
    const b = new AtlasDirector(info(), () => null, () => 'none', first)
    const again = run(b, 6, tick({ hp01: 0.4, tanks: 1 }))
    run(b, 8, tick({ hp01: 0.2, tanks: 1 }), again)
    run(b, 6, tick({ trapNear: 2, trapKind: 'flame' }), again)
    expect(again).toEqual(['lowHpGel', 'warn.critical', 'trap'])
  })

  it('the first story landing in a sector gets the sector\'s own line in place of the briefing', () => {
    const a = new AtlasDirector(info({ sector: 'blaze', freed: 1, firstVisit: true }))
    a.event('play')
    expect(run(a, 30)).toEqual(['sector.blaze', 'arc.1'])
    // The Volt Tower has its hack scene instead, the Scrapyard no line of its own.
    const v = new AtlasDirector(info({ sector: 'volt', freed: 3, firstVisit: true }))
    v.event('play')
    expect(run(v, 6)[0]).toBe('story.volt')
  })

  it('warns of each trap once, never in the tutorial (it has its own lessons)', () => {
    const a = new AtlasDirector(info())
    const said = run(a, 4, tick({ trapNear: 3 }))
    run(a, 30, tick({ trapNear: 3 }), said)
    expect(said.filter(l => l === 'trap')).toHaveLength(1)
    const tut = new AtlasDirector(info({ tutorial: true }))
    expect(run(tut, 5, tick({ trapNear: 1 }))).not.toContain('trap')
  })

  it('low weapon energy, the objective; a level-up line only every second level, two ways by turns', () => {
    const a = new AtlasDirector(info())
    const said = run(a, 8, tick({ we01: 0.1 }))
    run(a, 8, tick({ we01: 0.1, objectiveDone: true }), said)
    // The energy warning carries its advice the first time.
    expect(said).toEqual(['warn.weLow', 'hint.done'])
    run(a, 25, tick({ we01: 0.1, objectiveDone: true, level: 4 }), said)
    run(a, 25, tick({ we01: 0.1, objectiveDone: true, level: 5 }), said)
    run(a, 25, tick({ we01: 0.1, objectiveDone: true, level: 6 }), said)
    run(a, 25, tick({ we01: 0.1, objectiveDone: true, level: 7 }), said)
    expect(said).toEqual(['warn.weLow', 'hint.done', 'levelUp', 'hint.levelUp'])
    // Refilled and low again: the short reminder, and only after a good while.
    run(a, 1, tick({ we01: 0.9, objectiveDone: true, level: 7 }), said)
    run(a, 20, tick({ we01: 0.1, objectiveDone: true, level: 7 }), said)
    expect(said.at(-1)).toBe('lowWe')
    run(a, 1, tick({ we01: 0.9, objectiveDone: true, level: 7 }), said)
    run(a, 60, tick({ we01: 0.1, objectiveDone: true, level: 7 }), said)
    expect(said.filter(l => l === 'lowWe')).toHaveLength(1)
  })

  it('a quiet stretch earns one line of small talk, no more', () => {
    const a = new AtlasDirector(info())
    const said = run(a, 600)
    expect(said.filter(l => l.startsWith('idle'))).toHaveLength(1)
    // …never in a fight.
    const b = new AtlasDirector(info())
    expect(run(b, 400, tick({ combat: true }))).toEqual([])
  })

  it('flies into view while it talks, and back out after', () => {
    const a = new AtlasDirector(info())
    a.say('bossAhead')
    run(a, 1, tick({ combat: true }))
    expect(a.peek).toBeGreaterThan(0.9)
    run(a, 8, tick({ combat: true }))
    expect(a.line).toBeNull()
    expect(a.peek).toBeLessThan(0.05)
  })

  it('a recorded voice sets how long the line stays; without one, its length does', () => {
    const voiced = new AtlasDirector(info(), () => 4.2)
    voiced.say('bossAhead')
    voiced.update(1 / 60, tick())
    expect(voiced.line!.hold).toBeCloseTo(4.55, 2)
    const plain = new AtlasDirector(info(), () => null)
    plain.say('bossAhead')
    plain.update(1 / 60, tick())
    expect(plain.line!.hold).toBeGreaterThanOrEqual(lineSeconds(0))
    expect(plain.line!.hold).toBeLessThanOrEqual(lineSeconds(999))
  })
})

// #122: "Atlas speaks too much". Warnings stay prompt; everything else is
// chatter: spaced out, one waiting at a time, once in a save, or never.
describe('Atlas: tips keep their distance', () => {
  /** When each line came up (s). */
  const timeline = (a: AtlasDirector, sec: number, k: AtlasTick = tick()): Array<[string, number]> => {
    const out: Array<[string, number]> = []
    let t = 0
    for (; t < sec; t += 1 / 60) {
      const before = a.line
      a.update(1 / 60, k)
      if (a.line && a.line !== before) out.push([a.line.id, t])
    }
    return out
  }

  it('what is chatter: scans, the relay count, level-ups, tips, small talk; never a warning or a lesson', () => {
    for (const l of ['scan.heli', 'scan.elite', 'arc.3', 'levelUp', 'hint.levelUp', 'hint.locator', 'hint.upgrade', 'idle.2'] as AtlasLine[]) expect(isChatter(l), l).toBe(true)
    for (const l of [
      'trap', 'plate', 'warn.flame', 'warn.critical', 'lowHpGel', 'bossAhead', 'weak.iceLance', 'noWeak', 'warn.weLow', 'warn.borrowedLast.iceLance',
      'hint.blaze.barrels', 'hint.gm.arms', 'train.charge', 'help.block', 'hint.done', 'guardDown', 'exit', 'story.blaze', 'brief.job', 'scan.golem'
    ] as AtlasLine[]) expect(isChatter(l), l).toBe(false)
  })

  it('a tip never follows another line at once: it waits for a long quiet; a warning does not', () => {
    const a = director()
    a.say('bossAhead')
    a.say('hint.upgrade')
    const tl = timeline(a, 40, tick({ trapNear: 2 }))
    // The boss line, then the trap warning a short gap after it; the tip only after the long quiet.
    expect(tl.map(x => x[0])).toEqual(['bossAhead', 'trap', 'hint.upgrade'])
    expect(tl[1]![1] - tl[0]![1]).toBeLessThan(lineSeconds(999) + ATLAS_GAP + 0.2)
    expect(tl[2]![1] - tl[1]![1]).toBeGreaterThanOrEqual(CHATTER_GAP + lineSeconds(0) - 0.1)
  })

  it('only one tip waits at a time: the later one is turned down, and may come another day', () => {
    const ever = memory()
    const a = director(info(), ever)
    expect(a.say('scan.heli')).toBe(true)
    expect(a.say('scan.roller')).toBe(false)
    run(a, 2)
    expect(a.line?.id).toBe('scan.heli')
    // Said: remembered for the save. Turned down: not.
    expect([...ever.said]).toEqual(['scan.heli'])
    const next = director(info(), ever)
    expect(next.say('scan.heli')).toBe(false)
    expect(next.say('scan.roller')).toBe(true)
  })

  it('a scan that would come late is dropped unsaid, and is not counted as said', () => {
    const ever = memory()
    const a = director(info(), ever)
    a.say('bossAhead')
    a.update(1 / 60, tick())
    expect(a.say('scan.brute')).toBe(true)
    expect(run(a, 40)).toEqual([])
    expect(ever.said.size).toBe(0)
  })

  it('the crate golem is not what it seems: its scan comes at once', () => {
    const a = director()
    a.say('bossAhead')
    a.say('scan.golem')
    const tl = timeline(a, 20)
    expect(tl.map(x => x[0])).toEqual(['bossAhead', 'scan.golem'])
    expect(tl[1]![1] - tl[0]![1]).toBeLessThan(lineSeconds(999) + ATLAS_GAP + 0.2)
  })

  it('a stage hint is said once in a save; a danger as it happens, every mission', () => {
    const ever = memory()
    const a = director(info(), ever)
    expect(onceEver('hint.blaze.barrels')).toBe(true)
    expect(a.say('hint.blaze.barrels')).toBe(true)
    expect(run(a, 10)).toEqual(['hint.blaze.barrels'])
    const b = director(info(), ever)
    expect(b.say('hint.blaze.barrels')).toBe(false)
    // Rising water and a boss's weak points are told every time.
    for (const l of ['hint.tide.deep', 'hint.gm.arms', 'hint.vex.roof', 'trap', 'weak.iceLance'] as AtlasLine[]) {
      expect(onceEver(l), l).toBe(false)
      expect(b.say(l), l).toBe(true)
    }
  })

  it('health warnings wait while a lesson teaches the gel (the tutorial), and are not owed after', () => {
    const a = director(info({ tutorial: true }))
    expect(run(a, 10, tick({ hp01: 0.25, tanks: 1, hpMuted: true }))).toEqual([])
    expect(run(a, 10, tick({ hp01: 1, tanks: 0 }))).toEqual([])
    expect(run(a, 6, tick({ hp01: 0.4, tanks: 1 }))).toEqual(['lowHpGel'])
  })
})

describe('voice-overs: in the player language or English, and never an error', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    __resetVoices()
  })

  it('German, Spanish and Chinese players hear their language; every other language hears English', () => {
    expect(voiceLangFor('de')).toBe('de')
    expect(voiceLangFor('de-AT')).toBe('de')
    expect(voiceLangFor('es')).toBe('es')
    expect(voiceLangFor('es-MX')).toBe('es')
    expect(voiceLangFor('zh')).toBe('zh')
    // Traditional-script players hear the same Mandarin; their subtitles stay theirs.
    expect(voiceLangFor('zh-TW')).toBe('zh')
    for (const l of ['en', 'fr', 'ja', 'pt', 'ar', '', null]) expect(voiceLangFor(l)).toBe('en')
  })

  it('files are found by convention (<lang>/<line id>.ogg); English stands in for a missing German one', () => {
    const files = voiceFiles(['en/atlas.lowHp.ogg', 'en/atlas.trap.mp3', 'de/atlas.lowHp.ogg', 'de/atlas.trap.mp3', 'de/atlas.trap.ogg', 'en/atlas.exit.ogg'])
    expect(voiceUrl('atlas.lowHp', 'de', files)).toMatch(/audio\/voice\/de\/atlas\.lowHp\.ogg$/)
    expect(voiceUrl('atlas.trap', 'de', files)).toMatch(/de\/atlas\.trap\.ogg$/)
    expect(voiceUrl('atlas.exit', 'de', files)).toMatch(/en\/atlas\.exit\.ogg$/)
    expect(voiceUrl('atlas.bossAhead', 'de', files)).toBeNull()
    expect(voiceUrl('atlas.bossAhead', 'en', files)).toBeNull()
  })

  it('a line without a file is never requested, logs nothing and plays nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const errors = vi.spyOn(console, 'error')
    const warns = vi.spyOn(console, 'warn')
    preloadVoices(ATLAS_LINES.map(atlasKey))
    for (const l of ATLAS_LINES) expect(playVoice(atlasKey(l))).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(warns).not.toHaveBeenCalled()
  })
})

describe('Atlas: the voice loads on demand, just before its bubble', () => {
  it('a line starts loading its recording the moment it is asked for', () => {
    const prefetch = vi.fn(() => 'none' as const)
    const a = new AtlasDirector(info(), () => null, prefetch)
    a.event('exit')
    expect(prefetch).toHaveBeenCalledWith('atlas.exit')
  })

  it('a line still loading waits a moment for its voice, then plays with it', () => {
    let state: 'loading' | 'ready' = 'loading'
    const speak = vi.fn(() => (state === 'ready' ? 2 : null))
    const a = new AtlasDirector(info(), speak, () => state)
    a.event('exit')
    run(a, 0.3)
    expect(a.line).toBeNull()
    state = 'ready'
    run(a, 0.1)
    expect(a.line?.id).toBe('exit')
    expect(speak).toHaveBeenCalledWith('atlas.exit')
    expect(a.line?.hold).toBeCloseTo(2.35)
  })

  it('a voice that never arrives: the bubble goes up alone after VOICE_WAIT', () => {
    const a = new AtlasDirector(info(), () => null, () => 'loading')
    a.event('exit')
    run(a, VOICE_WAIT - 0.1)
    expect(a.line).toBeNull()
    run(a, 0.2)
    expect(a.line?.id).toBe('exit')
  })

  it('no file at all: no wait', () => {
    const a = new AtlasDirector(info(), () => null, () => 'none')
    a.event('exit')
    run(a, 1 / 60)
    expect(a.line?.id).toBe('exit')
  })
})
