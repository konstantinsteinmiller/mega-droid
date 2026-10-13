// @vitest-environment jsdom
// #159: after a stage boss fell, B (beam out) was silently dead while
// "Learn your new weapon" was open. #150: after the Grand Master it was
// refused for good by machines left outside the sealed arena, and the
// objective card named Vex through the whole Grand Master fight. Every
// refusal now has its own words, in every locale.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { hud } from '@/game/state/hud'
import { beamRefusal, grandMasterUp, shutOut, type BeamState } from '@/game/sim/beamGate'
import en from '@/i18n/locales/en'

const LOCALES = import.meta.glob('@/i18n/locales/*.ts', { eager: true }) as Record<string, { default: Record<string, unknown> }>

const at = (o: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o)

const done: BeamState = { objectiveDone: true, finale: null, weaponOwed: '', combat: false }

describe('beam-out refusals (beamGate)', () => {
  it('beams out once the objective is done, nothing owed and the room quiet', () => {
    expect(beamRefusal(done)).toBeNull()
    expect(beamRefusal({ ...done, finale: 'done' })).toBeNull()
  })

  it('says why for every reason', () => {
    expect(beamRefusal({ ...done, objectiveDone: false })?.key).toBe('combat.beamNotYet')
    expect(beamRefusal({ ...done, combat: true })?.key).toBe('combat.beamFight')
    // The weapon lesson after a Master (#159): it names the weapon.
    expect(beamRefusal({ ...done, weaponOwed: 'flame' })).toEqual({ key: 'combat.beamLesson', params: { weapon: 'weapon.flame.name' } })
    // Vex down, the Grand Master still up.
    for (const s of ['dormant', 'intro', 'fight', 'dying'] as const) {
      expect(beamRefusal({ ...done, finale: s })).toEqual({ key: 'combat.beamGrandMaster', params: { boss: 'boss.grandMaster' } })
    }
  })

  it('every refusal has its words in every locale', () => {
    const keys = ['combat.beamNotYet', 'combat.beamFight', 'combat.beamLesson', 'combat.beamGrandMaster', 'objective.grandMaster']
    expect(Object.keys(LOCALES).length).toBeGreaterThan(1)
    for (const [file, mod] of Object.entries(LOCALES)) {
      for (const k of keys) {
        const v = at(mod.default, k)
        expect(typeof v, `${file} ${k}`).toBe('string')
        const want = at(en as unknown as Record<string, unknown>, k) as string
        for (const p of want.match(/\{\w+\}/g) ?? []) expect(v as string, `${file} ${k}`).toContain(p)
      }
    }
  })
})

describe('the mission asks the gate (B)', () => {
  const mission = (o: { done: boolean; finale?: string; weapon?: string; lit?: boolean }) => {
    const m = Object.create(Mission.prototype) as Record<string, unknown> & { beamRefused(): ReturnType<typeof beamRefusal> }
    m.objects = { objective: { done: o.done } }
    m.finale = o.finale ? { state: o.finale } : null
    m.exitWeapon = o.weapon ?? null
    m.exitLit = !!o.lit
    m.exitPad = o.weapon ? {} : null
    return m
  }
  it('the weapon lesson open after a Master: refused, and says so', () => {
    hud.combat = false
    expect(mission({ done: true, weapon: 'flame' }).beamRefused()?.key).toBe('combat.beamLesson')
    expect(mission({ done: true, weapon: 'flame', lit: true }).beamRefused()).toBeNull()
  })
  it('the Grand Master up, then down', () => {
    hud.combat = false
    expect(mission({ done: true, finale: 'fight' }).beamRefused()?.key).toBe('combat.beamGrandMaster')
    expect(mission({ done: true, finale: 'done' }).beamRefused()).toBeNull()
    hud.combat = true
    expect(mission({ done: true, finale: 'done' }).beamRefused()?.key).toBe('combat.beamFight')
    hud.combat = false
  })
})

describe('the Grand Master objective', () => {
  it('names the giant while it wakes, fights and falls; not before or after', () => {
    expect(grandMasterUp(null)).toBe(false)
    expect(grandMasterUp('dormant')).toBe(false)
    expect(grandMasterUp('intro')).toBe(true)
    expect(grandMasterUp('fight')).toBe(true)
    expect(grandMasterUp('dying')).toBe(true)
    expect(grandMasterUp('done')).toBe(false)
  })
})

describe('machines shut out of the sealed arena', () => {
  const arena = [17, 18, 19]
  it('a chaser outside the sealed shutter is no fight while Flux is inside', () => {
    expect(shutOut(true, arena, 17, 16)).toBe(true)
    expect(shutOut(true, arena, 17, -1)).toBe(true)
  })
  it('one inside the arena, an open shutter, or Flux outside: still a fight', () => {
    expect(shutOut(true, arena, 17, 18)).toBe(false)
    expect(shutOut(false, arena, 17, 16)).toBe(false)
    expect(shutOut(true, arena, 16, 16)).toBe(false)
  })
})
