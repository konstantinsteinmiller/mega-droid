// @vitest-environment jsdom
// #172: a dash's contact (a boss charge, a mini-boss lunge) cannot be blocked
// — a held shield only softens it — but a PERFECT block parries it and the
// dasher is stunned, like a parried melee hit. #171: the block room's Rotor
// Drone freezes just before its ram, like the Trooper's shot, until a block.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission, type MissionSetup } from '@/game/sim/mission'
import { baseStats } from '@/game/sim/stats'
import { createInput, consumeEdges, type Input } from '@/game/engine/input'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'
import type { Enemy } from '@/game/sim/world'

const STEP = 1 / 60
const W = 24

const rig = () => {
  const sector = SECTORS[0]!
  const setup: MissionSetup = {
    sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters, stats: baseStats()
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
  m.fx = { emit: () => {}, sparks: () => {} } as unknown as Mission['fx']
  ;(m as unknown as { vm: unknown }).vm = { barrier: { impact: () => {} } }
  ;(m as unknown as { firePellet: () => void }).firePellet = () => {}
  ;(m as unknown as { activePellets: () => number }).activePellets = () => 0
  hud.phase = 'play'
  const step = () => {
    ;(m as unknown as { updatePlayer(dt: number, first: boolean): void }).updatePlayer(STEP, true)
    consumeEdges(input)
    m.time += STEP
    m.player.x = m.player.z = mid
  }
  // A boss charging in from straight ahead (yaw 0 faces −z).
  const boss = { x: mid, z: mid - 1.5, y: 0, boss: true, kind: 'boss', state: 'act', st: 0, stunT: 0, ring: { visible: true }, flash: 0 } as unknown as Enemy
  const charge = (parryable = true) =>
    m.hitPlayer(boss, 20, { blockable: false, parryable, fromX: boss.x, fromZ: boss.z, kind: 'melee' })
  return { m, input, step, boss, charge, mid }
}

describe('perfect block vs a dash (#172)', () => {
  it('a block pressed as the charge lands parries it and stuns the boss', () => {
    const { m, input, step, boss, charge } = rig()
    input.blockHeld = true
    input.blockPressed = true
    step()
    const hp = m.combat.hp
    expect(charge()).toBe('parry')
    expect(boss.state).toBe('stun')
    expect(boss.stunT).toBeGreaterThan(0)
    expect(m.combat.hp).toBe(hp)
  })

  it('a shield held long before only softens it, as before', () => {
    const { m, input, step, boss, charge } = rig()
    input.blockHeld = true
    input.blockPressed = true
    for (let k = 0; k < 60; k++) step()
    const hp = m.combat.hp
    expect(charge()).toBe('block')
    expect(boss.state).toBe('act')
    expect(m.combat.hp).toBeLessThan(hp)
  })

  it('an unblockable hit without `parryable` is never parried', () => {
    const { input, step, boss, charge } = rig()
    input.blockHeld = true
    input.blockPressed = true
    step()
    expect(charge(false)).toBe('block')
    expect(boss.state).toBe('act')
  })
})

describe('block lesson: the Rotor Drone freeze (#171)', () => {
  const lesson = (m: Mission) => {
    ;(m as unknown as { walk: unknown }).walk = { active: true, current: { steps: ['block'], room: 0 }, noteBlock: () => {} }
    ;(m as unknown as { writeHud: () => void }).writeHud = () => {}
  }
  const heli = (mid: number) =>
    ({ x: mid, z: mid - 3, y: 1.4, kind: 'heli', room: 0, state: 'act', st: 0, stunT: 0, ring: { visible: true }, flash: 0 }) as unknown as Enemy

  it('holds the swoop until a block, then the ram is parried', () => {
    const { m, input, step, mid } = rig()
    lesson(m)
    const e = heli(mid)
    m.player.yaw = 2
    expect(m.cueSwoop(e, 0.5)).toBe(false)
    expect(m.cueSwoop(e, 0.15)).toBe(true)
    expect(hud.blockCue).toBe(true)
    expect(m.freeze.active).toBe(true)
    // The view turned onto the drone (it is straight ahead: yaw 0).
    expect(Math.abs(m.player.yaw)).toBeLessThan(1e-6)
    ;(m as unknown as { releaseSwoopCue(): void }).releaseSwoopCue()
    expect(hud.blockCue).toBe(false)
    expect(m.freeze.active).toBe(false)
    step()
    expect(m.combat.blocking).toBe(true)
    expect(m.hitPlayer(e, 10, { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })).toBe('parry')
    expect(e.state).toBe('stun')
    // Once a mission.
    expect(m.cueSwoop(heli(mid), 0.1)).toBe(false)
  })

  it('only in the block lesson room', () => {
    const { m, mid } = rig()
    expect(m.cueSwoop(heli(mid), 0.1)).toBe(false)
    lesson(m)
    const e = heli(mid)
    ;(e as unknown as { room: number }).room = 3
    expect(m.cueSwoop(e, 0.1)).toBe(false)
  })
})
