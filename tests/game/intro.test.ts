// @vitest-environment jsdom
// The intro cutscene, "Wake-Up Call" (story-arc.md § 1, story.md § Intro).
//
// The script is pure data and pure functions of time, so it is checked without
// a GPU: the shots tile the cutscene at a pace a first-timer can follow (each
// at least three times its old, too-fast length), every event fires exactly
// once when the game loop steps through it, the beats hold long enough to
// read, and the overlays land where the story says.
// The director (`flow.ts`) is checked with fake modes: first-timers only, the
// tutorial builds behind it, watching and skipping both record it, a skip
// before the build is done holds the mission beam overlay, and a cloud save
// with progress arriving mid-intro ends it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'
import {
  SHOTS, INTRO_END, SKIP_AFTER, ATLAS_HOLD, EVENTS, eventsBetween, overlayAt, streetTime, streetAt, streetRate, shotIndexAt,
  STREET_FROM, STREET_RELEASE, STREET_AT, STREET_DONE, LAB_FROM, LEVER_AT, LOGO_AT, WAKE_FROM, VEX_ON, CUTIN_FROM, CUTIN_TO, DISC_FROM, DISC_TO,
  HP_FILL_TO, LV_POP, FLASH_FULL, STREET_END, SHOW_HIT, SHOW_PARRY, SHOW_VOLLEY, SHOW_SLAM, SHOW_RING_OVER, SHOW_SLIDE_FROM,
  SHOW_SLIDE_TO, SHOW_FINISH_HIT, SHOW_GEL_BURST, SHOW_GEL, SHOW_BIG_DROP, SHOW_BIG_LAND, SHOW_FLEE_FROM, SHOW_FLEE_TO,
  SHOW_OVER_CHARGE, SHOW_OVER_L1, SHOW_OVER_L2, SHOW_OVER_L3, SHOW_OVER_FIRE, SHOW_OVER_HIT, OVER_SHOT, OVER_STATS,
  overCharge, overLevel, bigOn
} from '@/game/story/introScript'
import { Color } from 'three'
import { chargeInfo } from '@/game/sim/stats'
import { chargeGlowAt, newChargeGlow } from '@/game/fx/chargeGlow'
import { ringState } from '@/components/hud/chargeRing'

const h = vi.hoisted(() => ({ modes: [] as unknown[] }))

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: (m: unknown) => { h.modes.push(m) }, setWanted: () => {} } }))
vi.mock('@/use/useLeaderboard', () => ({ reportRun: async () => {} }))
vi.mock('@/use/usePortalLeaderboard', () => ({ joinPortalBoard: async () => {}, reportPortalBest: async () => {} }))

describe('the intro script', () => {
  it('six shots tile the cutscene in story order, each at least 3x its old 17 s-cut length', () => {
    // #271: Gauss revives Flux, Pip and Atlas greet him, he is sent out — and
    // only then the action on the street (it used to open as a flash-forward).
    expect(SHOTS.map(s => s.id)).toEqual(['valley', 'lab', 'safeMode', 'wakeUp', 'beam', 'coldOpen'])
    expect(SHOTS[0]!.start).toBe(0)
    for (let i = 1; i < SHOTS.length; i++) expect(SHOTS[i]!.start).toBe(SHOTS[i - 1]!.end)
    expect(SHOTS[SHOTS.length - 1]!.end).toBe(INTRO_END)
    // The old cut, per shot: valley 3 · lab 3 · safe 1.5 · wake 4 · beam 2 · street 3.5 s.
    const OLD = [3, 3, 1.5, 4, 2, 3.5]
    SHOTS.forEach((s, i) => expect(s.end - s.start).toBeGreaterThanOrEqual(3 * OLD[i]!))
    expect(INTRO_END).toBeGreaterThanOrEqual(51)
    expect(SKIP_AFTER).toBe(0.5)
    expect(shotIndexAt(LAB_FROM - 0.01)).toBe(0)
    expect(shotIndexAt(LAB_FROM)).toBe(1)
    expect(shotIndexAt(INTRO_END - 0.1)).toBe(5)
    expect(LEVER_AT).toBeLessThan(STREET_AT)
  })

  it('the beats hold long enough to read', () => {
    // Atlas's captions never overlap, each held ATLAS_HOLD (its voice is ≤ 2.2 s).
    expect(ATLAS_HOLD).toBeGreaterThanOrEqual(3)
    const atlas = EVENTS.filter(e => e.kind === 'atlas').map(e => e.at)
    for (let i = 1; i < atlas.length; i++) expect(atlas[i]! - atlas[i - 1]!).toBeGreaterThanOrEqual(ATLAS_HOLD)
    // Vex's bubble stays up for his whole line.
    const vexOn = EVENTS.find(e => e.kind === 'vex' && e.key)!.at
    const vexOff = EVENTS.find(e => e.kind === 'vex' && !e.key)!.at
    expect(vexOn).toBeGreaterThan(VEX_ON)
    expect(vexOff - vexOn).toBeGreaterThanOrEqual(4)
    // The two inserts are held, not flashed: the disc's close-up and Blaze's cut-in.
    expect(DISC_TO - DISC_FROM).toBeGreaterThanOrEqual(1.2)
    expect(CUTIN_TO - CUTIN_FROM).toBeGreaterThanOrEqual(1.2)
    // The logo holds on the white before the handover.
    expect(INTRO_END - FLASH_FULL).toBeGreaterThanOrEqual(1.5)
  })

  it('stepping at 60 Hz fires every event exactly once, in order', () => {
    const fired: number[] = []
    let t = 0
    while (t < INTRO_END) {
      const t1 = Math.min(INTRO_END, t + 1 / 60)
      for (const e of eventsBetween(t, t1)) fired.push(e.at)
      t = t1
    }
    expect(fired.length).toBe(EVENTS.length)
    expect([...fired].sort((a, b) => a - b)).toEqual(fired)
  })

  it('every shot has its screen-reader line at its start', () => {
    for (const s of SHOTS) {
      expect(EVENTS.some(e => e.kind === 'line' && e.shot === s.id && Math.abs(e.at - s.start) < 1e-9)).toBe(true)
    }
  })

  it('Atlas greets Flux on waking; "Log start." opens the street; the Scrapyard theme takes over at the end', () => {
    const atlas = EVENTS.filter(e => e.kind === 'atlas')
    expect(atlas[0]).toMatchObject({ key: 'goodMorning' })
    const log = atlas.find(e => e.kind === 'atlas' && e.key === 'logStart')!
    expect(log.at).toBeGreaterThanOrEqual(STREET_AT)
    expect(log.at).toBeLessThan(STREET_AT + 1)
    const music = EVENTS.find(e => e.kind === 'music')
    expect(music).toMatchObject({ track: 'scrapyard' })
    expect(music!.at).toBeGreaterThan(STREET_DONE)
  })

  it('the street runs in, slows for the slide, plays the showcase and holds its last frame: no freeze, no rewind', () => {
    expect(streetTime(STREET_AT)).toBe(STREET_FROM)
    expect(streetTime(STREET_DONE - 1e-6)).toBeCloseTo(STREET_END, 4)
    expect(streetTime(STREET_DONE + 0.1)).toBe(STREET_END)
    expect(streetTime(INTRO_END)).toBe(STREET_END)
    // The showcase runs 1:1 after the release, and every beat sits inside it.
    expect(streetRate(streetAt(STREET_RELEASE + 1))).toBeCloseTo(1, 6)
    for (const b of [SHOW_HIT, SHOW_PARRY, ...SHOW_VOLLEY, SHOW_SLAM, SHOW_RING_OVER, SHOW_FINISH_HIT, SHOW_OVER_HIT, SHOW_GEL_BURST]) {
      expect(b).toBeGreaterThan(STREET_RELEASE)
      expect(b).toBeLessThan(STREET_END - 1)
    }
    // The slide spans the moment the ring passes over Flux.
    expect(SHOW_SLIDE_FROM).toBeLessThan(SHOW_RING_OVER)
    expect(SHOW_SLIDE_TO).toBeGreaterThan(SHOW_RING_OVER)
    // The events stay in time order.
    for (let i = 1; i < EVENTS.length; i++) expect(EVENTS[i]!.at).toBeGreaterThanOrEqual(EVENTS[i - 1]!.at)
    // The action clock only ever runs forward.
    let prev = -Infinity
    for (let t = STREET_AT; t < INTRO_END; t += 0.05) {
      expect(streetTime(t)).toBeGreaterThanOrEqual(prev)
      prev = streetTime(t)
    }
    // The run at full speed; the slide (action 1.1–1.5) in slow motion.
    expect(streetRate(STREET_AT + 1)).toBe(1)
    expect(streetRate(streetAt(1.3))).toBeLessThan(0.5)
    expect(streetAt(1.5) - streetAt(1.1)).toBeGreaterThanOrEqual(1)
    expect(streetRate(STREET_DONE)).toBe(0)
    // `streetAt` places the street's sounds on the action.
    for (const st of [-2, 0.3, 1.15, 1.55, 2.35, 2.65]) expect(streetTime(streetAt(st))).toBeCloseTo(st, 6)
  })

  it('the Overload preview (#137): a big Guardroid, the charge past full to the Overload, the violet shot, KRANCK!, it blows apart', () => {
    // Right after the Trooper falls apart, and before the Repair Gel.
    expect(SHOW_BIG_DROP).toBeGreaterThan(SHOW_FINISH_HIT)
    expect(SHOW_BIG_LAND).toBeGreaterThan(SHOW_BIG_DROP)
    expect(SHOW_GEL).toBeGreaterThan(SHOW_OVER_HIT + 1)
    // Short: from the drop to the blast in a few seconds.
    expect(SHOW_OVER_HIT - SHOW_BIG_DROP).toBeLessThanOrEqual(3.5)
    // The Guardroid is in the street from the drop to the shot, never after it.
    expect(bigOn(SHOW_BIG_DROP - 0.01)).toBe(false)
    expect(bigOn(SHOW_BIG_LAND)).toBe(true)
    expect(bigOn(SHOW_OVER_HIT - 0.01)).toBe(true)
    expect(bigOn(SHOW_OVER_HIT)).toBe(false)
    expect(bigOn(SHOW_GEL)).toBe(false)
    // The charge climbs level by level on the game's own clock (`chargeInfo`),
    // never back, and is at the Overload before the release.
    expect(SHOW_OVER_CHARGE).toBeLessThan(SHOW_OVER_L1)
    expect(SHOW_OVER_L1).toBeLessThan(SHOW_OVER_L2)
    expect(SHOW_OVER_L2).toBeLessThan(SHOW_OVER_L3)
    expect(SHOW_OVER_L3).toBeLessThan(SHOW_OVER_FIRE - 0.3)
    expect(overLevel(SHOW_OVER_CHARGE - 0.01)).toBe(0)
    expect(overLevel(SHOW_OVER_L1 + 0.01)).toBe(1)
    expect(overLevel(SHOW_OVER_L2 + 0.01)).toBe(2)
    expect(overLevel(SHOW_OVER_L3 + 0.01)).toBe(3)
    expect(overLevel(SHOW_OVER_FIRE - 1e-3)).toBe(3)
    let lv = 0
    for (let st = SHOW_OVER_CHARGE; st < SHOW_OVER_FIRE; st += 0.01) {
      expect(overLevel(st)).toBeGreaterThanOrEqual(lv)
      lv = overLevel(st)
    }
    // Released at the shot: no charge held from then on.
    expect(overCharge(SHOW_OVER_FIRE)).toBe(-1)
    // He dashes away from it while the charge builds.
    expect(SHOW_FLEE_FROM).toBeGreaterThan(SHOW_OVER_CHARGE)
    expect(SHOW_FLEE_TO).toBeLessThan(SHOW_OVER_L3)
    // The shot is the Overload's: a level-3 release fires a `charge3` (as `Mission.fireCharged`).
    expect(OVER_SHOT).toBe('charge3')
    // The game's colours, through the game's own painters: the buster green,
    // the full charge's cyan bleeding to violet, then the Overload's violet
    // halo; the crosshair ring l1, both rings full, the inner refilling
    // violet (with the Overload fitted, from the full charge on), then over.
    const at = (st: number) => chargeInfo(overCharge(st), OVER_STATS)
    const glow = (st: number) => chargeGlowAt(at(st), 0, new Color('#ffffff'), newChargeGlow())
    expect(glow(SHOW_OVER_L1 + 0.05).core.getHexString()).toBe('c8ff7a')
    const full = glow(SHOW_OVER_L2 + 0.01).core
    expect(full.r).toBeCloseTo(new Color('#7ff4ff').r, 2)
    expect(full.g).toBeCloseTo(new Color('#7ff4ff').g, 2)
    const mid = glow((SHOW_OVER_L2 + SHOW_OVER_L3) / 2)
    expect(mid.core.r).toBeGreaterThan(new Color('#7ff4ff').r)
    expect(mid.over).toBe(false)
    const over = glow(SHOW_OVER_L3 + 0.1)
    expect(over.over).toBe(true)
    expect(['b46cff', 'd38bff']).toContain(over.halo.getHexString())
    expect(ringState(at(SHOW_OVER_L1 + 0.05), 0)).toBe('l1')
    expect(at(SHOW_OVER_L2 + 0.01).toL2).toBe(1)
    expect(ringState(at(SHOW_OVER_L2 + 0.01), 0)).toBe('build')
    expect(ringState(at(SHOW_OVER_L2 + 0.3), 0)).toBe('build')
    expect(at(SHOW_OVER_L2 + 0.3).toL3).toBeGreaterThan(at(SHOW_OVER_L2 + 0.01).toL3)
    expect(ringState(at(SHOW_OVER_L3 + 0.1), 0)).toBe('over')
    // The sounds and the call-out in that order: the levels ring, the
    // Overload, the release, then KRANCK! as the shot lands, and the blast.
    const sfxAt = (name: string) => EVENTS.find(e => e.at >= streetAt(SHOW_BIG_DROP) && e.kind === 'sfx' && e.name === name)!.at
    expect(sfxAt('charge1')).toBeLessThan(sfxAt('charge2'))
    expect(sfxAt('charge2')).toBeLessThan(sfxAt('charge3'))
    expect(sfxAt('charge3')).toBeLessThan(sfxAt('chargeShotBig'))
    expect(sfxAt('chargeShotBig')).toBeCloseTo(streetAt(SHOW_OVER_FIRE), 6)
    const kranck = EVENTS.filter(e => e.kind === 'kranck')
    expect(kranck).toHaveLength(1)
    expect(kranck[0]!.at).toBeCloseTo(streetAt(SHOW_OVER_HIT), 6)
    expect(sfxAt('explode')).toBeGreaterThanOrEqual(kranck[0]!.at)
  })

  it('overlays: in from black, the eyelids, the HUD boot, the white flash and the logo', () => {
    expect(overlayAt(0).black).toBe(1)
    expect(overlayAt(1).black).toBe(0)
    // No tape rewind any more.
    for (let t = 0; t < INTRO_END; t += 0.5) expect(overlayAt(t).rewind).toBe(0)
    expect(overlayAt(WAKE_FROM - 0.01).black).toBeGreaterThan(0.95)
    expect(overlayAt(WAKE_FROM + 0.5).eyelid).toBe(1)
    expect(overlayAt(WAKE_FROM + 3.5).eyelid).toBe(0)
    expect(overlayAt(WAKE_FROM + 1).hp).toBe(0)
    expect(overlayAt(HP_FILL_TO + 0.1).hp).toBe(1)
    expect(overlayAt(LV_POP + 0.5).lv).toBe(1)
    // The flash and the logo at the end of the beam, then the street fades
    // up out of the white.
    expect(overlayAt(STREET_AT - 0.3).flash).toBe(1)
    expect(overlayAt(LOGO_AT + 0.4).logo).toBe(1)
    expect(overlayAt(STREET_AT + 1).flash).toBe(0)
    expect(overlayAt(STREET_AT + 1).logo).toBe(0)
    expect(overlayAt(LAB_FROM + 5).flash).toBe(0)
  })
})

// ─── The director ────────────────────────────────────────────────────────────

interface FakeIntro {
  opts: { replay: boolean; onStart: () => void; onEnd: (skipped: boolean) => void }
  aborted: boolean
  skip(): void
  abort(): void
}

const load = async (world?: Record<string, unknown>) => {
  const gs = await holdGameState()
  const keys = await import('@/keys')
  if (world) gs.setStates({ [keys.WORLD_KEY]: world })
  const prof = await import('@/game/state/profile')
  prof.loadProfile()
  const flowMod = await import('@/game/flow')
  flowMod.__resetIntro()
  const intros: FakeIntro[] = []
  const builds: Array<{ quest: { template: string }; resolve: (m: unknown) => void; mode: { disposed: boolean; dispose(): void } }> = []
  const hubMode = { hub: true }
  flowMod.registerModeFactories(
    (quest) => new Promise((resolve) => {
      const mode = { disposed: false, dispose() { this.disposed = true } }
      builds.push({ quest: quest as { template: string }, resolve: () => resolve(mode as never), mode })
    }),
    () => hubMode as never,
    (opts) => {
      const i: FakeIntro = {
        opts, aborted: false,
        skip() { opts.onEnd(true) },
        abort() { this.aborted = true }
      }
      intros.push(i)
      return i as never
    }
  )
  return { gs, keys, prof, flowMod, intros, builds, hubMode }
}

const settle = async () => {
  for (let k = 0; k < 5; k++) {
    await nextTick()
    await Promise.resolve()
  }
}

describe('the intro director', () => {
  beforeEach(() => {
    drainAndResetModules()
    h.modes.length = 0
  })
  afterEach(() => drainPersist())

  it('a first-timer boots into the intro; the tutorial builds behind it once it starts', async () => {
    const { flowMod, intros, builds } = await load()
    expect(flowMod.bootTarget()).toEqual({ kind: 'intro' })
    await flowMod.createBootMode()
    expect(flowMod.flow.screen).toBe('intro')
    expect(intros).toHaveLength(1)
    expect(builds).toHaveLength(0)
    intros[0]!.opts.onStart()
    expect(builds).toHaveLength(1)
    expect(builds[0]!.quest.template).toBe('tutorial')
  })

  it('watched to the end: recorded as seen, then the tutorial takes over', async () => {
    const { flowMod, intros, builds, prof, gs, keys } = await load()
    await flowMod.createBootMode()
    intros[0]!.opts.onStart()
    builds[0]!.resolve(null)
    await settle()
    intros[0]!.opts.onEnd(false)
    await settle()
    expect(prof.profile.world.seen).toContain('intro')
    expect(gs.getState<{ seen: string[] }>(keys.WORLD_KEY)?.seen).toContain('intro')
    expect(flowMod.flow.screen).toBe('mission')
    expect(h.modes.at(-1)).toBe(builds[0]!.mode)
    expect(flowMod.flow.loading).toBe(false)
  })

  it('skipped before the build is done: the beam overlay holds until it is', async () => {
    const { flowMod, intros, builds, prof } = await load()
    await flowMod.createBootMode()
    intros[0]!.opts.onStart()
    intros[0]!.skip()
    await settle()
    expect(prof.profile.world.seen).toContain('intro')
    expect(flowMod.flow.loading).toBe(true)
    expect(flowMod.flow.screen).toBe('intro')
    builds[0]!.resolve(null)
    await settle()
    expect(flowMod.flow.loading).toBe(false)
    expect(flowMod.flow.screen).toBe('mission')
  })

  it('never shows again once seen, nor past the tutorial, nor over a resume point', async () => {
    const seen = await load({ unlocked: ['scrapyard'], bosses: [], tutorialDone: false, selected: 'scrapyard', seen: ['intro'] })
    expect(seen.flowMod.bootTarget()).toMatchObject({ kind: 'mission', snapshot: null })
    drainAndResetModules()
    const done = await load({ unlocked: ['scrapyard', 'blaze'], bosses: ['scrapper'], tutorialDone: true, selected: 'blaze' })
    expect(done.flowMod.bootTarget()).toEqual({ kind: 'hub' })
    // An old save past the tutorial is migrated: the beat is behind it.
    expect(done.prof.profile.world.seen).toContain('intro')
  })

  it('a build without the intro (VITE_APP_INTRO=false) boots the tutorial', async () => {
    const { flowMod } = await load()
    expect(flowMod.bootTarget(false)).toMatchObject({ kind: 'mission', snapshot: null })
  })

  it('a cloud save with progress arriving mid-intro ends it and goes where the save says', async () => {
    const { flowMod, intros, builds, gs, keys, prof, hubMode } = await load()
    await flowMod.createBootMode()
    intros[0]!.opts.onStart()
    // The cloud read lands: this player finished the tutorial on another device.
    gs.setStates({ [keys.WORLD_KEY]: { unlocked: ['scrapyard', 'blaze'], bosses: ['scrapper'], tutorialDone: true, selected: 'blaze' } })
    prof.loadProfile()
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    saveDataVersion.value++
    await settle()
    expect(intros[0]!.aborted).toBe(true)
    expect(flowMod.flow.screen).toBe('hub')
    expect(h.modes.at(-1)).toBe(hubMode)
    // The tutorial built behind it is thrown away once it lands.
    builds[0]!.resolve(null)
    await settle()
    expect(builds[0]!.mode.disposed).toBe(true)
  })

  it('a replay from the hub ends back in the hub, and never builds a mission', async () => {
    const { flowMod, intros, builds, hubMode } = await load({ unlocked: ['scrapyard'], bosses: ['scrapper'], tutorialDone: true, selected: 'scrapyard' })
    await flowMod.createBootMode()
    expect(flowMod.flow.screen).toBe('hub')
    flowMod.replayIntro()
    expect(flowMod.flow.screen).toBe('intro')
    expect(intros[0]!.opts.replay).toBe(true)
    intros[0]!.opts.onStart()
    intros[0]!.opts.onEnd(false)
    await settle()
    expect(builds).toHaveLength(0)
    expect(flowMod.flow.screen).toBe('hub')
    expect(h.modes.at(-1)).toBe(hubMode)
  })
})

describe('the intro score ("Wake-Up Call")', () => {
  it('is scored to the picture: one 16th is 0.1 s, and the big hits land on the cutscene beats', async () => {
    const { getSong, songSeconds } = await import('@/game/audio/songs')
    const { SPIRE_FLASH, CUTIN_FROM, DISC_TO, LEVER_AT, FLASH_FROM, FLASH_FULL } = await import('@/game/story/introScript')
    const s = getSong('intro')
    expect(60 / s.bpm / 4).toBeCloseTo(0.1, 6)
    expect(songSeconds(s)).toBeGreaterThanOrEqual(INTRO_END)
    const hitAt = (sec: number, slack = 0.15) => s.steps.some((evs, i) => Math.abs(i * 0.1 - sec) <= slack && evs.some(e => e.i === 'hit'))
    expect(hitAt(streetAt(STREET_RELEASE) - 0.1)).toBe(true) // the charge shot's release
    // The showcase: a hit on the parry, the slide and the finish.
    for (const b of [SHOW_PARRY, SHOW_SLIDE_FROM + 0.1, SHOW_FINISH_HIT]) expect(hitAt(streetAt(b), 0.25)).toBe(true)
    // The Overload (#137): the Guardroid lands on a hit, and so does the KRANCK.
    for (const b of [SHOW_BIG_LAND, SHOW_OVER_HIT]) expect(hitAt(streetAt(b), 0.25)).toBe(true)
    expect(hitAt(SPIRE_FLASH)).toBe(true)
    expect(hitAt(CUTIN_FROM)).toBe(true)
    expect(hitAt(LEVER_AT)).toBe(true)
    expect(hitAt((FLASH_FROM + FLASH_FULL) / 2 + 0.1)).toBe(true)
    // The Atlas disc clicks home on a bell.
    expect(s.steps[Math.round((DISC_TO - 0.5) * 10)]!.some(e => e.i === 'bell')).toBe(true)
    // The last pose of the street lands on a hit; no tape crackle anywhere.
    expect(hitAt(STREET_DONE)).toBe(true)
    expect(s.steps.some(evs => evs.some(e => e.i === 'crackle'))).toBe(false)
    // Scored through to the end, then a groove bar to loop on should anything hold.
    expect(s.steps.slice(Math.round(INTRO_END * 10) - 100, Math.round(INTRO_END * 10)).some(evs => evs.length > 0)).toBe(true)
    expect(s.loopBar * 16 * 0.1).toBeGreaterThanOrEqual(INTRO_END)
  })
})
