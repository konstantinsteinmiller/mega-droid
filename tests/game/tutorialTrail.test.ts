// @vitest-environment jsdom
// The objective trail's gating in the mission (`Mission.updateTrail`, the
// trail itself in src/game/fx/objectiveTrail.ts): in the tutorial walkthrough
// it leads to the walkthrough's own goal (`Walkthrough.goal`, pinned in
// walkthrough.test.ts) once the coach's move glyph is learned (never over
// that first glyph; a returning player has it from the first frame). It
// still hides in a fight and under a modal, and a scene lesson keeps it only
// while the player is out of that lesson's room; the locator triangle never
// shows during the walkthrough; every other mission is as before. Driven on
// a bare Mission with the trail's input recorded.

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission, type MissionSetup } from '@/game/sim/mission'
import { hud } from '@/game/state/hud'
import { createInput, type Input } from '@/game/engine/input'
import { SECTORS } from '@/game/data/regions'
import { baseStats } from '@/game/sim/stats'
import { profile } from '@/game/state/profile'
import { flushPersist } from '@/use/useGameState'
import { LOCATOR_FIRST, type Locator } from '@/game/sim/locator'
import type { TrailInput } from '@/game/fx/objectiveTrail'
import type { LessonView } from '@/game/sim/lessons'
import type { WalkGoal } from '@/game/sim/walkthrough'
import { generateClimb } from '@/game/world/climbGen'
import { createNav, type Nav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'

const STEP = 1 / 60

type Seen = { enabled: boolean; target: { x: number; z: number } | null }

/** A mission with only what the trail and the locator read. Flux stands at
 *  (10, 10); the mission's objective is 80 m off, the walkthrough's goal 50 m.
 *  `moved`: the coach's move glyph already learned (on the mouse hand). */
const rig = (opts: { tutorial?: boolean; moved?: boolean } = {}) => {
  profile.tips = opts.moved === false ? {} : { 'hint:move:mouse': 3 }
  const sector = SECTORS[0]!
  const setup: MissionSetup = {
    sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters, stats: baseStats(),
    tutorial: opts.tutorial
  }
  const m = new (Mission as unknown as new (s: MissionSetup, i: Input) => Mission)(setup, createInput())
  m.player = {
    x: 10, z: 10, px: 10, pz: 10, vx: 0, vz: 0, yaw: 0, pitch: 0, path: null, bob: 0, bobAmp: 0,
    y: 0, py: 0, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: 0, mantle: 0, mx: 0, mz: 0
  }
  const seen: Seen[] = []
  m.trail = {
    update: (_dt: number, ti: TrailInput) => {
      seen.push({ enabled: ti.enabled, target: ti.target && { x: ti.target.x, z: ti.target.z } })
    }
  } as unknown as Mission['trail']
  const objective = { x: 90, z: 10 }
  m.objects = { target: () => objective, objective: { done: false } } as unknown as Mission['objects']
  const s = {
    inRoom: false,
    active: true,
    goal: { x: 60, z: 10, kind: 'drone' } as WalkGoal | null
  }
  m.lessons = { inRoom: () => s.inRoom } as unknown as Mission['lessons']
  if (opts.tutorial) {
    m.walk = { get active() { return s.active }, goal: () => s.goal } as unknown as Mission['walk']
  }
  const internals = m as unknown as { updateTrail(dt: number, playing: boolean): void; locator: Locator; fightT: number }
  /** Step the trail for `secs` of play (or of a paused / modal game). */
  const step = (secs = STEP, playing = true) => {
    for (let t = 0; t < secs - 1e-9; t += STEP) internals.updateTrail(STEP, playing)
  }
  const last = (): Seen => seen[seen.length - 1]!
  /** A fight on or off (what `updateTargeting` decides from the machines). */
  const fight = (on: boolean) => { internals.fightT = on ? 1 : 0 }
  return { m, s, seen, step, last, fight, objective, locator: internals.locator }
}

const lesson = (id: LessonView['id'], done = false): LessonView => ({ id, nudge: 0, done, slot: 1, color: '#ffffff' })

afterEach(() => {
  hud.combat = false
  hud.lesson = null
  // The coach saves a learned glyph at once: drain it before the next case.
  flushPersist()
})

describe('the trail in the tutorial walkthrough', () => {
  it('waits for the coach\'s first glyph: a first-timer moves before it comes, a returning player has it at once', () => {
    const r = rig({ tutorial: true, moved: false })
    r.step(3)
    expect(r.seen.every(x => !x.enabled && x.target === null)).toBe(true)
    // Three strides (the move glyph's pips): learned, and the trail is on.
    for (let k = 0; k < 3; k++) r.m.coach.use('move')
    expect(r.m.coach.learned('move')).toBe(true)
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 60, z: 10 } })
    // Learned in an earlier session: from the very first frame of play.
    const again = rig({ tutorial: true })
    again.step()
    expect(again.seen[0]).toEqual({ enabled: true, target: { x: 60, z: 10 } })
  })

  it('runs toward the walkthrough goal — not the mission objective', () => {
    const r = rig({ tutorial: true })
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 60, z: 10 } })
    // It follows the goal as the walkthrough moves it on.
    r.s.goal = { x: 20, z: 40, kind: 'door' }
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 20, z: 40 } })
  })

  it('hides in a fight and while the game is not playing (a modal, the beam-in)', () => {
    const r = rig({ tutorial: true })
    r.fight(true)
    r.step()
    expect(r.last()).toEqual({ enabled: false, target: null })
    r.fight(false)
    r.step(STEP, false)
    expect(r.last()).toEqual({ enabled: false, target: null })
    r.step()
    expect(r.last().enabled).toBe(true)
  })

  it('hides while there is nowhere to walk', () => {
    const r = rig({ tutorial: true })
    r.s.goal = null
    r.step()
    expect(r.last()).toEqual({ enabled: false, target: null })
  })

  it('a live scene lesson: toward its subject, the crate in its own room too, never over its check', () => {
    const r = rig({ tutorial: true })
    // The crate lesson, the player in its room: the trail leads to the crate
    // as well (#119: a playtester never saw it and pushed at the shut door).
    hud.lesson = lesson('crate')
    r.s.goal = { x: 30, z: 10, kind: 'crate' }
    r.s.inRoom = true
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 30, z: 10 } })
    // The training drone in its room: its glyph has it (it hovers in plain view).
    hud.lesson = lesson('charge')
    r.s.goal = { x: 12, z: 16, kind: 'drone' }
    r.step()
    expect(r.last().enabled).toBe(false)
    hud.lesson = lesson('crate')
    r.s.goal = { x: 30, z: 10, kind: 'crate' }
    // Wandered off: the bubble does not show out there — the trail leads back.
    r.s.inRoom = false
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 30, z: 10 } })
    // The training drone likewise.
    hud.lesson = lesson('charge')
    r.s.goal = { x: 12, z: 16, kind: 'drone' }
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: { x: 12, z: 16 } })
    // A goal that is not the lesson's subject waits for the lesson.
    r.s.goal = { x: 20, z: 40, kind: 'door' }
    r.step()
    expect(r.last().enabled).toBe(false)
    // The gel lesson (a HUD button, never a place), and a check on show.
    hud.lesson = lesson('gel')
    r.step()
    expect(r.last().enabled).toBe(false)
    hud.lesson = lesson('crate', true)
    r.s.goal = { x: 30, z: 10, kind: 'crate' }
    r.step()
    expect(r.last().enabled).toBe(false)
    hud.lesson = null
    r.step()
    expect(r.last().enabled).toBe(true)
  })

  it('the locator triangle still never shows during the walkthrough — and does once it is over', () => {
    const r = rig({ tutorial: true })
    r.step(LOCATOR_FIRST + 4)
    expect(r.seen.every(x => x.enabled)).toBe(true)
    expect(r.locator.phase).toBe('wait')
    expect(r.m.locatorPoint.alpha).toBe(0)
    // Past the last gate: the mission's objective, and the locator's own rule.
    r.s.active = false
    r.step(0.5)
    expect(r.last()).toEqual({ enabled: true, target: r.objective })
    expect(r.locator.phase).toBe('show')
  })
})

describe('the trail in every other mission', () => {
  it('leads to the mission objective, never over a fight or a scene lesson — wherever the player stands', () => {
    // No wait for the coach's glyph here: that is the tutorial's.
    const r = rig({ moved: false })
    r.step()
    expect(r.last()).toEqual({ enabled: true, target: r.objective })
    r.fight(true)
    r.step()
    expect(r.last()).toEqual({ enabled: false, target: null })
    r.fight(false)
    hud.lesson = lesson('weapon')
    r.s.inRoom = false
    r.step()
    expect(r.last()).toEqual({ enabled: false, target: null })
    hud.lesson = null
    r.step(STEP, false)
    expect(r.last()).toEqual({ enabled: false, target: null })
  })

  it('feeds the locator its goal, as before', () => {
    const r = rig()
    r.step(LOCATOR_FIRST + 0.5)
    expect(r.locator.phase).toBe('show')
  })

  it('on a terrain map the locator floats over the floor of its goal, not at a fixed height', () => {
    const r = rig()
    const map = generateClimb(7)
    const internals = r.m as unknown as { map: MapData; nav: Nav; locatorPoint: { y: number } }
    internals.map = map
    internals.nav = createNav(map)
    // A goal on the crusher bridge's walkway, a storey and more up.
    const cp = map.terrain!.checkpoints.find(c => c.y > 10)!
    r.objective.x = cp.x
    r.objective.z = cp.z
    r.step(LOCATOR_FIRST + 0.5)
    expect(internals.locatorPoint.y).toBeCloseTo(cp.y + 1.6)
  })
})
