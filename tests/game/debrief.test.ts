// @vitest-environment jsdom
// The debrief (#119): after a story mission's results, the city from above
// and Pip's briefing on what comes next, then the Lab. It plays once per
// Master and run (New Game+ tells it again), after the result screen (and its
// ad), never in place of the ending;
// its lines are the voice catalog's, and the Vex scene that Master had in the
// Lab plays inside it and counts as seen.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SECTORS } from '@/game/data/regions'
import { WEAPONS } from '@/game/data/weapons'
import { VOICE_LINES } from '@/game/audio/voiceCatalog'
import { debriefBeats, debriefFor, debriefSeen, type DebriefStage } from '@/game/story/debriefScript'
import { hubSceneFor } from '@/game/story/vexScenes'
import en from '@/i18n/locales/en'

const h = vi.hoisted(() => ({ hubs: 0, plans: [] as Array<{ boss: string; hello: boolean }>, end: null as null | (() => void) }))

vi.mock('@/use/useAds', () => ({ showMidgameAd: async (): Promise<void> => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
const MASTERS = SECTORS.filter(s => s.id !== 'fortress').map(s => s.boss)

describe('the debrief script', () => {
  it('every Master with a sector after it has one; Vex (the ending) and strangers have none', () => {
    for (const boss of MASTERS) {
      const p = debriefFor(boss)!
      expect(p, boss).toBeTruthy()
      expect(SECTORS.find(s => s.id === p.to)!.after, boss).toBe(p.from)
      expect(p.weapon, boss).toBe(Object.values(WEAPONS).find(w => w.from === boss)?.id ?? null)
    }
    expect(debriefFor('vexMk1')).toBeNull()
    expect(debriefFor('nobody')).toBeNull()
  })

  it('tells it in order: the win, the copied weapon, Vex, then the next sector, its Master and the tip', () => {
    for (const boss of MASTERS) {
      const p = debriefFor(boss)!
      const stages: DebriefStage[] = []
      const beats = debriefBeats(p, (s) => () => { stages.push(s) }, false)
      // The picture follows the lines: run the stage calls in beat order.
      for (const b of beats) if ('call' in b) b.call()
      const vex = hubSceneFor(boss)
      expect(stages.filter(s => s !== ''), boss).toEqual(['city', ...(p.weapon ? ['weapon'] : []), ...(vex ? ['vex'] : []), 'next'])
      const pip = beats.flatMap(b => ('pip' in b ? [b.pip] : []))
      const k = `pip.debrief.${p.from}`
      expect(pip, boss).toEqual([`${k}.won`, ...(p.weapon ? [`${k}.weapon`] : []), `${k}.next`, `${k}.boss`, `${k}.tip`, 'pip.debrief.go'])
      // Short: the main storytelling, never a lecture.
      expect(pip.length).toBeLessThanOrEqual(6)
    }
  })

  it('greets Flux in the first one only', () => {
    const p = debriefFor('scrapper')!
    const first = (hello: boolean) => debriefBeats(p, () => () => {}, hello).flatMap(b => ('pip' in b ? [b.pip] : []))[0]
    expect(first(true)).toBe('pip.debrief.hello')
    expect(first(false)).toBe('pip.debrief.scrapyard.won')
  })

  it('every Pip line is a live voice line with its text, and fills the names it speaks', () => {
    const live = new Map(VOICE_LINES.filter(l => l.status === 'live' && l.speaker === 'pip').map(l => [l.key, l]))
    const used = new Set<string>(['pip.debrief.hello'])
    for (const boss of MASTERS) {
      for (const b of debriefBeats(debriefFor(boss)!, () => () => {}, false)) {
        if (!('pip' in b)) continue
        used.add(b.pip)
        const line = live.get(b.pip)
        expect(line, b.pip).toBeTruthy()
        const text = at(en, b.pip) as string
        expect(typeof text, b.pip).toBe('string')
        // What the bubble fills is what the catalogue has the voice say.
        expect(b.params ?? {}, b.pip).toEqual(line!.params ?? {})
        for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(typeof at(en, b.params![name!]!), `${b.pip} {${name}}`).toBe('string')
      }
    }
    // Nothing recorded that no debrief plays.
    expect([...live.keys()].sort()).toEqual([...used].sort())
  })
})

describe('the debrief in the flow', () => {
  const tally = { xp: 10, bolts: 5, kills: 1, chests: 0, items: [], seconds: 30 }
  const load = async (film: boolean) => {
    const flowMod = await import('@/game/flow')
    const { tutorialQuest } = await import('@/game/data/quests')
    const { profile } = await import('@/game/state/profile')
    const fakeMode = {} as never
    flowMod.registerModeFactories(async () => fakeMode, () => { h.hubs++; return fakeMode }, undefined, undefined,
      film
        ? async (opts) => {
          h.plans.push({ boss: opts.plan.boss, hello: opts.hello })
          h.end = opts.onEnd
          return fakeMode
        }
        : undefined)
    flowMod.flow.quest = tutorialQuest()
    flowMod.flow.screen = 'mission'
    flowMod.flow.modal = ''
    flowMod.flow.results = null
    return { ...flowMod, profile }
  }
  beforeEach(() => {
    h.hubs = 0
    h.plans = []
    h.end = null
  })

  it('plays after the results of a Master\'s first fall, then the Lab; never twice', async () => {
    const m = await load(true)
    m.profile.world.bosses = []
    m.profile.world.seen = m.profile.world.seen.filter(s => !s.startsWith('debrief:') && s !== 'vex:scrapper')
    await m.finishMission(true, tally)
    // The result screen first: no film under it.
    expect(m.flow.modal).toBe('results')
    expect(h.plans).toEqual([])
    await m.leaveResults()
    await vi.waitFor(() => expect(h.plans).toEqual([{ boss: 'scrapper', hello: true }]))
    expect(m.flow.screen).toBe('debrief')
    expect(h.hubs).toBe(0)
    // Seen from its start (a quit mid-film never replays it), with the Lab scene it absorbed.
    expect(m.profile.world.seen).toContain(debriefSeen('scrapper'))
    expect(m.profile.world.seen).toContain(hubSceneFor('scrapper')!.seen)
    h.end!()
    expect(m.flow.screen).toBe('hub')
    expect(h.hubs).toBe(1)

    // The same Master again in this run: straight to the Lab.
    m.profile.world.bosses = []
    m.flow.quest = (await import('@/game/data/quests')).tutorialQuest()
    m.flow.screen = 'mission'
    await m.finishMission(true, tally)
    await m.leaveResults()
    expect(h.plans.length).toBe(1)
    expect(m.flow.screen).toBe('hub')
    expect(h.hubs).toBe(2)
  })

  it('plays again in New Game+, welcome and all; the Lab scene it absorbed stays seen', async () => {
    const m = await load(true)
    const { startNewGamePlus } = await import('@/game/state/profile')
    m.profile.world.seen = [...new Set([...m.profile.world.seen, debriefSeen('scrapper'), debriefSeen('blazeMaster'), hubSceneFor('scrapper')!.seen])]
    startNewGamePlus()
    expect(m.profile.world.seen.some(s => s.startsWith('debrief:'))).toBe(false)
    expect(m.profile.world.seen).toContain(hubSceneFor('scrapper')!.seen)
    await m.finishMission(true, tally)
    await m.leaveResults()
    await vi.waitFor(() => expect(h.plans).toEqual([{ boss: 'scrapper', hello: true }]))
    expect(m.flow.screen).toBe('debrief')
  })

  it('a lost mission has none', async () => {
    const m = await load(true)
    m.profile.world.bosses = []
    m.profile.world.seen = m.profile.world.seen.filter(s => !s.startsWith('debrief:'))
    await m.finishMission(false, tally)
    await m.leaveResults()
    expect(h.plans).toEqual([])
    expect(m.flow.screen).toBe('hub')
  })
})
