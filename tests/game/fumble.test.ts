// @vitest-environment jsdom
// ─── A hard hit can shake Flux's charge loose ────────────────────────────────
//
// Charging the buster when a machine lands a hard hit (a Core Master's, or
// 12 % of the bar) fumbles the charge one time in four (`sim/fumble.ts`): it
// goes off wild at the level it had reached — in a cone round the view,
// never at the crosshair or the lock — the arm flails for 0.5 s (no firing,
// no charging), and one fumble in ten also stuns him for 0.2 s (no moving,
// no looking). Still holding fire after the panic, the charge restarts from
// zero. Never from a blocked hit, a trap or a pit; never in the tutorial or
// the exit cutscene; at most one per 1.5 s. Driven through the mission's own
// hit and player step at the app's fixed 60 Hz.

import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ sounds: [] as string[], voices: [] as string[] }))

vi.mock('@/game/audio/sfx', () => ({ sfx: (id: string) => { h.sounds.push(id) } }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
// Which lines get voiced, on which channel (no audio in a test).
vi.mock('@/game/audio/voice', async (orig) => ({
  ...(await orig<typeof import('@/game/audio/voice')>()),
  playVoice: (id: string, channel = 'line') => { h.voices.push(`${channel}:${id}`); return null }
}))

import { Mission, type MissionSetup } from '@/game/sim/mission'
import {
  Fumble, isHardHit, strayDir, FUMBLE_CHANCE, FUMBLE_HARD, FUMBLE_PANIC, FUMBLE_STUN, FUMBLE_COOLDOWN,
  FUMBLE_YAW_MIN, FUMBLE_YAW_MAX, FUMBLE_PITCH_MIN, FUMBLE_PITCH_MAX, FUMBLE_LINES
} from '@/game/sim/fumble'
import { baseStats, CHARGE_L1, CHARGE_L2 } from '@/game/sim/stats'
import { createInput, consumeEdges, type Input } from '@/game/engine/input'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { mulberry32, type Rng } from '@/game/world/rng'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'
import en from '@/i18n/locales/en'
import type { Enemy } from '@/game/sim/world'

const STEP = 1 / 60
const W = 24
const D = Math.PI / 180
const steps = (s: number) => Math.round(s / STEP)

/** An RNG that plays `values` in turn, then repeats the last one. */
const seq = (...values: number[]): Rng => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]!
}

type Spawn = [kind: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, dmg: number, crit: boolean, target: unknown]

/** A mission with only what a hit and the player step read: an open floor,
 *  Flux in the middle of it facing -z, a charge under way. */
const rig = (o: { tutorial?: boolean } = {}) => {
  const sector = SECTORS[0]!
  const setup: MissionSetup = {
    sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters,
    stats: baseStats(), tutorial: o.tutorial
  }
  const input = createInput()
  const m = new (Mission as unknown as new (s: MissionSetup, i: Input) => Mission)(setup, input)
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const mid = (W / 2) * CELL
  m.map = map
  m.nav = createNav(map)
  m.player = {
    x: mid, z: mid, px: mid, pz: mid, vx: 0, vz: 0, yaw: 0, pitch: 0, path: null, bob: 0, bobAmp: 0,
    y: 0, py: 0, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: 0, mantle: 0, mx: 0, mz: 0
  }
  m.fx = { emit: () => {}, sparks: () => {}, flash: () => {}, riseRing: () => {} } as unknown as Mission['fx']
  m.vm = { barrier: { impact: () => {} } } as unknown as Mission['vm']
  const shots: Spawn[] = []
  m.system = {
    shots: [],
    spawnPlayerShot: (...a: Spawn) => { shots.push(a) }
  } as unknown as Mission['system']
  hud.phase = 'play'
  const c = m.combat
  /** Fire held, the charge at `t` seconds. */
  const charging = (t = CHARGE_L2 + 0.05) => {
    input.fireHeld = true
    c.charging = true
    c.charge = t
  }
  /** A machine 6 m ahead of Flux (or to his right: a knock-back along x
   *  only, so it never moves him along his view). */
  const machine = (boss = false, right = false) =>
    ({ boss, x: right ? mid + 6 : mid, z: right ? mid : mid - 6, state: 'engage', awake: true }) as unknown as Enemy
  /** A hit from a machine ahead (or `e`), `dmg` before armour. */
  const hit = (dmg: number, e: Enemy | null = machine(), blockable = false) =>
    m.hitPlayer(e, dmg, { blockable, fromX: e ? e.x : mid, fromZ: e ? e.z : mid - 6, kind: 'shot' })
  const step = () => {
    ;(m as unknown as { updatePlayer(dt: number, first: boolean): void }).updatePlayer(STEP, true)
    consumeEdges(input)
  }
  return { m, c, input, shots, charging, machine, hit, step, mid }
}

/** The shot's heading off the view (yaw 0, pitch 0: forward is -z), degrees:
 *  `side` + = right, `up` + = up. */
const heading = (s: Spawn) => ({
  side: Math.atan2(s[4], -s[6]) / D,
  up: Math.asin(s[5] / Math.hypot(s[4], s[5], s[6])) / D
})

afterEach(() => {
  h.sounds.length = 0
  hud.phase = 'boot'
  hud.sayKey = ''
})

describe('the rules, in one place', () => {
  it('about 25 %, 12 % of the bar, a 0.5 s panic, a 0.2 s stun, 1.5 s apart', () => {
    expect(FUMBLE_CHANCE).toBeCloseTo(0.25, 10)
    expect(FUMBLE_HARD).toBeCloseTo(0.12, 10)
    expect(FUMBLE_PANIC).toBeCloseTo(0.5, 10)
    expect(FUMBLE_STUN).toBeCloseTo(0.2, 10)
    expect(FUMBLE_COOLDOWN).toBeGreaterThan(FUMBLE_PANIC)
  })

  it('a hard hit: a Core Master\'s, or 12 % of the bar and more', () => {
    expect(isHardHit(12, 100, false)).toBe(true)
    expect(isHardHit(11, 100, false)).toBe(false)
    expect(isHardHit(3, 100, true)).toBe(true)
    expect(isHardHit(30, 250, false)).toBe(true)
    expect(isHardHit(29, 250, false)).toBe(false)
  })

  it('the dice: exact with a stubbed RNG', () => {
    const f = new Fumble()
    f.rng = () => FUMBLE_CHANCE - 1e-6
    expect(f.roll(true, true)).toBe(true)
    f.rng = () => FUMBLE_CHANCE
    expect(f.roll(true, true)).toBe(false)
  })

  it('one fumble in ten stuns (a seeded run)', () => {
    const f = new Fumble()
    f.rng = mulberry32(11)
    let stuns = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      f.reset()
      f.start()
      if (f.stunned) stuns++
    }
    expect(stuns / N).toBeGreaterThan(0.08)
    expect(stuns / N).toBeLessThan(0.12)
  })

  it('every line key is one of flux.fumble.1..N', () => {
    const f = new Fumble()
    for (const r of [0, 0.3, 0.5, 0.999999]) {
      f.rng = seq(0.5, r)
      const key = f.start()
      const n = Number(key.split('.').pop())
      expect(key.startsWith('flux.fumble.')).toBe(true)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(FUMBLE_LINES)
      expect((en.flux.fumble as Record<string, string>)[String(n)]).toBeTruthy()
    }
  })

  it('the stray direction stays in the cone, even at its edges', () => {
    const out: [number, number, number] = [0, 0, 0]
    for (const r of [[0, 0, 0], [0, 1 - 1e-9, 1 - 1e-9], [0.99, 0, 1 - 1e-9], [0.99, 1 - 1e-9, 0], [0.4, 0.5, 0.5]]) {
      strayDir(0, 0, seq(...r), out)
      const side = Math.abs(Math.atan2(out[0], -out[2]))
      const up = Math.asin(out[1])
      expect(Math.hypot(...out)).toBeCloseTo(1, 9)
      expect(side).toBeGreaterThanOrEqual(FUMBLE_YAW_MIN - 1e-9)
      expect(side).toBeLessThanOrEqual(FUMBLE_YAW_MAX + 1e-9)
      expect(up).toBeGreaterThanOrEqual(FUMBLE_PITCH_MIN - 1e-9)
      expect(up).toBeLessThanOrEqual(FUMBLE_PITCH_MAX + 1e-9)
    }
  })
})

describe('when a hit fumbles the charge', () => {
  it('a hard hit while charging, and the dice say so', () => {
    const { m, charging, hit, shots } = rig()
    m.fumble.rng = seq(0, 0.5, 0)
    charging()
    expect(hit(12)).toBe('hit')
    expect(m.fumble.panicking).toBe(true)
    expect(m.combat.charging).toBe(false)
    expect(m.combat.charge).toBe(0) // the crosshair's charge ring is empty
    expect(shots).toHaveLength(1)
    expect(h.sounds).toContain('fumble')
    expect(h.sounds).toContain('chargeShotBig')
    expect(hud.sayKey).toBe('flux.fumble.1')
    // His line is voiced too, on the bark channel (it never cuts Atlas off).
    expect(h.voices).toContain('bark:flux.fumble.1')
  })

  it('about one hard hit in four (a seeded run)', () => {
    const { m, c, charging, hit } = rig()
    m.fumble.rng = mulberry32(5)
    let n = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      m.fumble.reset()
      c.iframes = 0
      c.hp = c.maxHp
      charging()
      hit(20)
      if (m.fumble.panicking) n++
    }
    expect(n / N).toBeGreaterThan(0.22)
    expect(n / N).toBeLessThan(0.28)
  })

  it('only while charging', () => {
    const { m, c, input, hit } = rig()
    m.fumble.rng = () => 0
    input.fireHeld = true
    c.charging = false
    hit(40)
    expect(m.fumble.panicking).toBe(false)
  })

  it('only on a hard hit: a Core Master\'s counts whatever its size', () => {
    const { m, c, charging, hit, machine } = rig()
    m.fumble.rng = () => 0
    charging()
    hit(11)
    expect(m.fumble.panicking).toBe(false)
    c.iframes = 0
    hit(5, machine(true))
    expect(m.fumble.panicking).toBe(true)
  })

  it('never on a blocked hit', () => {
    const { m, c, charging, hit } = rig()
    m.fumble.rng = () => 0
    charging()
    c.blocking = true
    expect(hit(60, undefined, true)).toBe('block')
    expect(m.fumble.panicking).toBe(false)
  })

  it('never from a trap or a hazard (no machine behind it)', () => {
    const { m, charging, hit } = rig()
    m.fumble.rng = () => 0
    charging()
    expect(hit(60, null)).toBe('hit')
    expect(m.fumble.panicking).toBe(false)
  })

  it('never from a pit', () => {
    const { m, c, charging, shots, mid } = rig()
    m.fumble.rng = () => 0
    charging()
    m.climb = { respawn: () => ({ x: mid, z: mid, y: 0, yaw: 0 }), pitCost: 0.15, pitFloor: () => -Infinity } as unknown as Mission['climb']
    ;(m as unknown as { pitFall(out: [number, number]): void }).pitFall([0, 0])
    expect(c.hp).toBeLessThan(c.maxHp)
    expect(m.fumble.panicking).toBe(false)
    expect(shots).toHaveLength(0)
  })

  it('never in the tutorial (the Trooper lesson needs a charge that lands)', () => {
    const { m, charging, hit, machine } = rig({ tutorial: true })
    m.fumble.rng = () => 0
    charging()
    expect(hit(60, machine(true))).toBe('hit')
    expect(m.fumble.panicking).toBe(false)
  })

  it('never in the exit cutscene', () => {
    const { m, charging, hit } = rig()
    m.fumble.rng = () => 0
    charging()
    hud.phase = 'beamOut'
    hit(60)
    expect(m.fumble.panicking).toBe(false)
    hud.phase = 'play'
    Object.defineProperty(m.exit, 'active', { get: () => true })
    hit(60)
    expect(m.fumble.panicking).toBe(false)
  })

  it('at most one per 1.5 s', () => {
    const { m, c, charging, hit, step } = rig()
    m.fumble.rng = () => 0.2 // fumbles, never stuns
    charging()
    hit(20)
    expect(m.fumble.panicking).toBe(true)
    // Fire stays held: the charge is back after the panic.
    for (let i = 0; i < steps(FUMBLE_COOLDOWN) - 1; i++) step()
    expect(c.charging).toBe(true)
    c.iframes = 0
    hit(20)
    expect(m.fumble.panicking).toBe(false)
    step()
    c.iframes = 0
    hit(20)
    expect(m.fumble.panicking).toBe(true)
  })
})

describe('the stray shot', () => {
  for (const [label, r] of [['left edge', [0, 0.5, 0, 0, 0, 0]], ['right edge', [0, 0.5, 0, 0.99, 1 - 1e-9, 1 - 1e-9]]] as const) {
    it(`leaves in the cone, not at the lock nor the crosshair (${label})`, () => {
      const { m, c, charging, hit, machine, shots } = rig()
      m.fumble.rng = seq(...r)
      const ahead = machine()
      c.target = ahead // locked on, dead ahead, under the crosshair
      charging()
      hit(20, ahead)
      expect(shots).toHaveLength(1)
      const s = shots[0]!
      expect(s[9]).toBeNull() // no homing, no lock
      const { side, up } = heading(s)
      expect(Math.abs(side)).toBeGreaterThanOrEqual(FUMBLE_YAW_MIN / D - 1e-6)
      expect(Math.abs(side)).toBeLessThanOrEqual(FUMBLE_YAW_MAX / D + 1e-6)
      expect(up).toBeGreaterThanOrEqual(FUMBLE_PITCH_MIN / D - 1e-6)
      expect(up).toBeLessThanOrEqual(FUMBLE_PITCH_MAX / D + 1e-6)
    })
  }

  it('turns with the view', () => {
    const { m, charging, hit, shots } = rig()
    m.fumble.rng = seq(0, 0.5, 0, 0, 0, 0.2) // 12° to the left, level
    m.player.yaw = 90 * D // facing -x
    charging()
    hit(20)
    expect(shots).toHaveLength(1)
    const s = shots[0]!
    // Forward is (-1, 0, 0): the shot leans 12° off it.
    const off = Math.acos(-s[4] / Math.hypot(s[4], s[6])) / D
    expect(off).toBeCloseTo(12, 4)
  })

  it('goes off at the charge level held at the moment of the hit', () => {
    const cases: [number, string][] = [[0.1, 'pellet'], [CHARGE_L1 + 0.05, 'charge1'], [CHARGE_L2 + 0.05, 'charge2']]
    for (const [t, kind] of cases) {
      const { m, charging, hit, shots } = rig()
      m.fumble.rng = seq(0, 0.5)
      charging(t)
      hit(20)
      expect(shots.map(s => s[0]), `charge ${t}`).toEqual([kind])
    }
  })
})

describe('the panic, the stun and the recovery', () => {
  it('no firing and no charging for 0.5 s; still held, the charge restarts from 0', () => {
    const { m, c, input, charging, hit, step, shots } = rig()
    m.fumble.rng = seq(0, 0.5)
    charging()
    hit(20)
    expect(shots).toHaveLength(1)
    // A fresh press in the panic: nothing.
    input.firePressed = true
    for (let i = 0; i < steps(FUMBLE_PANIC) - 1; i++) {
      step()
      expect(c.charging, `step ${i + 1}`).toBe(false)
    }
    expect(shots).toHaveLength(1)
    step()
    expect(m.fumble.panicking).toBe(false)
    expect(c.charging).toBe(true)
    expect(c.charge).toBeLessThanOrEqual(STEP + 1e-9)
    expect(shots).toHaveLength(1) // no re-press, no pellet
  })

  it('released during the panic: nothing when it ends', () => {
    const { m, c, input, charging, hit, step, shots } = rig()
    m.fumble.rng = seq(0, 0.5)
    charging()
    hit(20)
    step()
    input.fireHeld = false
    input.fireReleased = true
    for (let i = 0; i < steps(FUMBLE_PANIC) + 5; i++) step()
    expect(m.fumble.panicking).toBe(false)
    expect(c.charging).toBe(false)
    expect(shots).toHaveLength(1)
  })

  it('a stun: no moving and no looking for 0.2 s', () => {
    const { m, input, charging, machine, hit, step } = rig()
    m.fumble.rng = seq(0, 0) // fumbles and stuns
    charging()
    hit(20, machine(false, true))
    expect(m.fumble.stunned).toBe(true)
    const z0 = m.player.z
    const yaw0 = m.player.yaw
    input.moveY = 1 // forward (-z)
    const look = (m as unknown as { applyLook(dt: number): void })
    for (let i = 0; i < steps(FUMBLE_STUN) - 1; i++) {
      step()
      input.lookDX = 80
      look.applyLook(STEP)
    }
    expect(m.player.z).toBeCloseTo(z0, 9)
    expect(m.player.yaw).toBe(yaw0)
    step()
    expect(m.fumble.stunned).toBe(false)
    for (let i = 0; i < 6; i++) step()
    expect(m.player.z).toBeLessThan(z0 - 0.01)
    input.lookDX = 80
    look.applyLook(STEP)
    expect(m.player.yaw).not.toBe(yaw0)
  })

  it('a fumble without a stun leaves moving and looking alone', () => {
    const { m, input, charging, machine, hit, step } = rig()
    m.fumble.rng = seq(0, 0.5)
    charging()
    hit(20, machine(false, true))
    expect(m.fumble.stunned).toBe(false)
    const z0 = m.player.z
    input.moveY = 1
    for (let i = 0; i < 6; i++) step()
    expect(m.player.z).toBeLessThan(z0 - 0.01)
  })
})

// Playtest 2026-10-06: the tutorial's machines took a first-timer from full
// health in seconds, some from behind a wall.
describe('the tutorial\'s machines hit softly, and nothing hits through a wall', () => {
  it('a tutorial machine deals a third of the damage it would anywhere else', () => {
    const lose = (tutorial: boolean) => {
      const r = rig({ tutorial })
      const before = r.c.hp
      r.hit(40)
      return before - r.c.hp
    }
    const plain = lose(false)
    const tut = lose(true)
    expect(plain).toBeGreaterThan(0)
    // 0.34 of the tutorial's own softened hit (0.6): about a fifth of a plain one.
    expect(tut / plain).toBeGreaterThan(0.12)
    expect(tut / plain).toBeLessThan(0.3)
  })

  it('a machine\'s blast never reaches Flux through a wall', () => {
    const r = rig()
    // A wall row between Flux and the machine 6 m ahead of him.
    const row = Math.floor(r.mid / CELL) - 1
    for (let i = 0; i < W; i++) (r.m.map.cell as Uint8Array)[row * W + i] = 0
    r.m.nav = createNav(r.m.map)
    const e = r.machine()
    const before = r.c.hp
    const res = r.m.hitPlayer(e, 40, { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
    expect(res).toBe('miss')
    expect(r.c.hp).toBe(before)
  })
})

// The owner, 2026-10-07: the first boss must still challenge the core
// audience; a fall there gets a free reboot instead of softer hits.
describe('the first boss keeps its bite, and forgives one fall', () => {
  it('the tutorial boss is not under the tutorial machines\' damage cut', () => {
    const lose = (tutorial: boolean) => {
      const r = rig({ tutorial })
      const before = r.c.hp
      r.hit(40, r.machine(true))
      return before - r.c.hp
    }
    // Only the tutorial's own long-standing softening (0.6) is left.
    expect(lose(true) / lose(false)).toBeGreaterThan(0.5)
  })

  it('down in the tutorial boss fight: one free reboot, then none', () => {
    const r = rig({ tutorial: true })
    const m = r.m as unknown as { boss: unknown; bossStarted: boolean; freeBossReboot: boolean; rebootFree(): void; revive(): void }
    m.boss = { state: 'engage', boss: true }
    m.bossStarted = true
    m.revive = () => { r.c.dead = false }
    r.c.dead = true
    expect(m.freeBossReboot).toBe(true)
    m.rebootFree()
    expect(r.c.dead).toBe(false)
    expect(m.freeBossReboot).toBe(false)
  })

  it('no free reboot outside the tutorial, or before its boss fight', () => {
    const plain = rig().m as unknown as { boss: unknown; bossStarted: boolean; freeBossReboot: boolean }
    plain.boss = { state: 'engage', boss: true }
    plain.bossStarted = true
    expect(plain.freeBossReboot).toBe(false)
    const early = rig({ tutorial: true }).m as unknown as { boss: unknown; freeBossReboot: boolean }
    early.boss = { state: 'idle', boss: true }
    expect(early.freeBossReboot).toBe(false)
  })
})

// Playtest 2026-10-07: a player who left after the boss, with only the
// copied weapon's lesson owed, got MISSION FAILED and replayed it all.
describe('leaving after the boss keeps the win', () => {
  it('the boss down and only its weapon lesson owed: the retreat is a win', () => {
    const m = rig({ tutorial: true }).m as unknown as {
      objects: { objective: { done: boolean } }; exitWeapon: string; exitLit: boolean; exitPad: unknown; bossWon: boolean
    }
    m.objects = { objective: { done: false } }
    expect(m.bossWon).toBe(false)
    m.objects.objective.done = true
    m.exitWeapon = 'scrapVolley'
    m.exitLit = false
    m.exitPad = {}
    expect(m.bossWon).toBe(true)
    // Learned (the pedestal lit), the objective is simply done: no retreat needed.
    m.exitLit = true
    expect(m.bossWon).toBe(false)
  })
})
