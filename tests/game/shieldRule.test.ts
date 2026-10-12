// @vitest-environment jsdom
// The shield's one rule (#136, playtest 2026-10-08): a held block takes 80%
// off every machine's bullet and blow, 30% off a blast (a named exception:
// the red ring says "get out of the way"), and nothing off a level's own
// hazard. Every bullet that flies AT Flux is blockable and a perfect block
// sends it back; only a lobbed shell is not. The Polarity Works' violet
// drones fire two homing orbs that land together: the parry of the first
// lowered the shield for the counter and the second hit through it — now the
// same press parries the whole volley. The perfect block's window is wider
// (0.28 → 0.42 s), and ×1.3 on a touch screen.
//
// The sweep drives every machine and every boss on its REAL AI for a while at
// several ranges and checks each attack it makes against the rule.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/fx/markers', async (orig) => {
  const { Mesh, Group } = await import('three')
  return { ...(await orig<object>()), makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import { createEnemy, updateEnemy, parryWindow, PARRY_WINDOW, PARRY_TOUCH_MUL } from '@/game/sim/enemies'
import { createBoss, startBossIntro, updateBoss } from '@/game/sim/bosses'
import { CombatSystem, blockCut, shotBlockable, BLOCK_CUT, AOE_BLOCK_CUT, type CombatHost } from '@/game/sim/combat'
import { Mission, type MissionSetup } from '@/game/sim/mission'
import { baseStats } from '@/game/sim/stats'
import { createInput, consumeEdges, type Input } from '@/game/engine/input'
import { ENEMIES } from '@/game/data/enemies'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import type { BossId } from '@/game/models/bosses'
import type { EnemyKind } from '@/game/models/enemies'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

describe('the rule', () => {
  it('80% off a blockable hit, 30% off a machine\'s blast, nothing off a hazard', () => {
    expect(BLOCK_CUT).toBe(0.8)
    expect(AOE_BLOCK_CUT).toBe(0.3)
    expect(blockCut({ blockable: true }, true)).toBe(BLOCK_CUT)
    expect(blockCut({ blockable: false }, true)).toBe(AOE_BLOCK_CUT)
    expect(blockCut({ blockable: false }, false)).toBe(0)
  })

  it('every shot that flies at Flux is blockable; only a lobbed shell is not', () => {
    expect(shotBlockable('enemy')).toBe(true)
    expect(shotBlockable('rock')).toBe(true)
    expect(shotBlockable('shell')).toBe(false)
  })

  it('the perfect block\'s window: 0.42 s, ×1.3 on touch, the Parry skill on top', () => {
    expect(PARRY_WINDOW).toBeCloseTo(0.42, 6)
    expect(parryWindow('mouse')).toBeCloseTo(0.42, 6)
    expect(parryWindow('touch')).toBeCloseTo(0.42 * PARRY_TOUCH_MUL, 6)
    expect(PARRY_TOUCH_MUL).toBeCloseTo(1.3, 6)
    expect(parryWindow('mouse', 0.1)).toBeCloseTo(0.52, 6)
    expect(parryWindow('touch', 0.1)).toBeCloseTo(0.52 * 1.3, 6)
  })
})

// ─── Every machine's attacks, on its real AI ─────────────────────────────────

interface Attack { what: string; cut: number }

const field = (): MapData => {
  const W = 40
  return { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
}

/** A world that records every attack a machine makes, as the shield sees it. */
const recorder = (e: Enemy, dist: number) => {
  const map = field()
  const out: Attack[] = []
  const hit = (src: Enemy | null, _d: number, o: { blockable: boolean; kind: string }) => {
    expect(src, `${e.kind}: an attack with no machine behind it`).toBe(e)
    out.push({ what: `${o.kind}${o.blockable ? '' : ' (blast)'}`, cut: blockCut(o, !!src) })
    return 'hit'
  }
  // A machine's shot becomes a pooled shot; its kind decides (`shotBlockable`).
  const shot = () => { out.push({ what: 'shot', cut: blockCut({ blockable: shotBlockable('enemy') }, true) }) }
  const shell = () => { out.push({ what: 'shell', cut: blockCut({ blockable: shotBlockable('shell') }, true) }) }
  const blast = () => { out.push({ what: 'wave/ring', cut: blockCut({ blockable: false }, true) }) }
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 60, z: 30 + dist, yaw: Math.PI, pitch: 0, y: 0 },
    combat: { iframes: 0, charging: false, charge: 0, hp: 100, maxHp: 100 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { chargeTimeMul: 1 },
    hitStop: 0, shake: noop, sfx: noop, pull: noop, addEnemy: noop, skyFlash: noop,
    fireEnemyShot: shot, fireOrb: shot, lobShell: shell, spawnWave: blast, spawnRing: blast,
    hitPlayer: hit
  } as unknown as World
  return { w, out }
}

const RANGES = [2.2, 6, 12]

describe('every machine\'s every attack follows the rule', () => {
  const kinds = Object.keys(ENEMIES) as EnemyKind[]
  for (const kind of kinds) {
    it(kind, () => {
      const seen: Attack[] = []
      for (const dist of RANGES) {
        const e = createEnemy(kind, 3, 60, 30, 0, { theme: THEMES.scrapyard })
        e.awake = true
        e.state = 'engage'
        e.cd = 0
        const { w, out } = recorder(e, dist)
        for (let i = 0; i < 8 / DT && e.state !== 'dead'; i++) {
          w.time += DT
          updateEnemy(w, e, DT)
          ;(w.combat as { iframes: number }).iframes = 0
        }
        seen.push(...out)
      }
      for (const a of seen) expect([BLOCK_CUT, AOE_BLOCK_CUT], `${kind} ${a.what}`).toContain(a.cut)
    })
  }

  const BOSSES: BossId[] = ['scrapper', 'blazeMaster', 'frostMaster', 'voltMaster', 'galeMaster', 'magnetMaster', 'drillMaster', 'tideMaster', 'neonMaster', 'rotorMaster', 'vexMk1']
  for (const id of BOSSES) {
    it(`boss ${id}`, () => {
      const seen: Attack[] = []
      for (const dist of [3, 9]) {
        const e = createBoss(id, 3, 60, 30, 0)
        const { w, out } = recorder(e, dist)
        startBossIntro(e)
        for (let i = 0; i < 20 / DT && e.state !== 'dead'; i++) {
          w.time += DT
          updateBoss(w, e, DT, null)
          ;(w.combat as { iframes: number }).iframes = 0
        }
        seen.push(...out)
      }
      expect(seen.length, `${id}: attacked at all`).toBeGreaterThan(0)
      for (const a of seen) expect([BLOCK_CUT, AOE_BLOCK_CUT], `${id} ${a.what}`).toContain(a.cut)
    })
  }
})

// ─── The mission's shield ─────────────────────────────────────────────────────

const W = 24
const rig = (device: Input['device'] = 'mouse') => {
  const sector = SECTORS[0]!
  const setup: MissionSetup = {
    sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters, stats: baseStats()
  }
  const input = createInput()
  input.device = device
  const m = new (Mission as unknown as new (s: MissionSetup, i: Input) => Mission)(setup, input)
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const mid = (W / 2) * CELL
  m.map = map
  m.nav = createNav(map)
  m.player = {
    x: mid, z: mid, px: mid, pz: mid, vx: 0, vz: 0, yaw: 0, pitch: 0, path: null, bob: 0, bobAmp: 0,
    y: 0, py: 0, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: 0, mantle: 0, mx: 0, mz: 0
  }
  m.fx = { emit: noop, sparks: noop } as unknown as Mission['fx']
  ;(m as unknown as { vm: unknown }).vm = { barrier: { impact: noop } }
  ;(m as unknown as { firePellet: () => void }).firePellet = noop
  ;(m as unknown as { activePellets: () => number }).activePellets = () => 0
  hud.phase = 'play'
  const step = () => {
    ;(m as unknown as { updatePlayer(dt: number, first: boolean): void }).updatePlayer(DT, true)
    consumeEdges(input)
    m.time += DT
    m.player.x = m.player.z = mid
  }
  /** Block pressed, then held for `held` s. */
  const block = (held: number) => {
    input.blockHeld = true
    input.blockPressed = true
    step()
    for (let i = 0; i < Math.round(held / DT); i++) step()
  }
  // A machine straight ahead (yaw 0 faces −z).
  const drone = { x: mid, z: mid - 6, state: 'act', st: 0, stunT: 0, ring: { visible: true }, flash: 0 } as unknown as Enemy
  const hit = (o: { blockable: boolean; kind: 'shot' | 'melee' | 'aoe' }, e: Enemy | null = drone) =>
    m.hitPlayer(e, 50, { ...o, fromX: drone.x, fromZ: drone.z })
  return { m, input, step, block, hit, drone }
}

describe('the mission\'s shield', () => {
  it('a held block takes 80% off a shot or a blow, 30% off a machine\'s blast, nothing off a hazard', () => {
    for (const [o, e, taken] of [
      [{ blockable: true, kind: 'shot' }, true, 10],
      [{ blockable: true, kind: 'melee' }, true, 10],
      [{ blockable: false, kind: 'aoe' }, true, 35],
      [{ blockable: false, kind: 'melee' }, true, 35],
      [{ blockable: false, kind: 'aoe' }, false, 50]
    ] as const) {
      const r = rig()
      r.block(1) // long held: a plain block, not a parry
      const hp = r.m.combat.hp
      const res = r.hit(o, e ? r.drone : null)
      expect(res, `${o.kind} ${o.blockable}`).toBe(taken === 50 ? 'hit' : 'block')
      expect(hp - r.m.combat.hp, `${o.kind} ${o.blockable} ${e}`).toBe(taken)
    }
  })

  it('a blast is never parried, however fresh the press', () => {
    const r = rig()
    r.block(0)
    expect(r.hit({ blockable: false, kind: 'aoe' })).toBe('block')
  })

  it('a press within the window parries; the window is wider on touch', () => {
    const late = 0.48 // past the desktop's 0.42 s, inside touch's 0.546 s
    const desk = rig('mouse')
    desk.block(late)
    expect(desk.hit({ blockable: true, kind: 'shot' })).toBe('block')
    const touch = rig('touch')
    touch.block(late)
    expect(touch.hit({ blockable: true, kind: 'shot' })).toBe('parry')
    const fresh = rig('mouse')
    fresh.block(0.35) // inside the new window (the old 0.28 s missed it)
    expect(fresh.hit({ blockable: true, kind: 'shot' })).toBe('parry')
  })

  it('a parried volley: the second round of the same machine is parried too, not a hit through the lowered shield', () => {
    const r = rig()
    r.block(0.1)
    expect(r.hit({ blockable: true, kind: 'shot' })).toBe('parry')
    r.step() // the counter lowers the shield
    expect(r.m.combat.blocking).toBe(false)
    expect(r.hit({ blockable: true, kind: 'shot' })).toBe('parry')
    // Another machine's shot is not part of that volley.
    const other = { ...r.drone } as Enemy
    expect(r.hit({ blockable: true, kind: 'shot' }, other)).not.toBe('parry')
  })
})

// ─── The Polar Drone's orbs ──────────────────────────────────────────────────

describe('a Polar Drone\'s orb volley', () => {
  it('both orbs come home in the same step, and glint before they land by the whole window', () => {
    const W2 = 20
    const map = { w: W2, h: W2, cell: new Uint8Array(W2 * W2).fill(1), pillars: [], room: new Int16Array(W2 * W2), rooms: [], doors: [] } as unknown as MapData
    const e = createEnemy('polar', 1, 30, 32, 2, { theme: THEMES.scrapyard })
    e.y = 1.9
    let t = 0
    const hits: number[] = []
    let glint = -1
    const w = {
      scene: new Scene(), map, nav: createNav(map), time: 0,
      player: { x: 30, z: 40, yaw: 0, pitch: 0, y: 0 },
      combat: { iframes: 0, charging: false, charge: 0 } as unknown as World['combat'],
      enemies: [e],
      fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
      markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
      stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
      hitStop: 0, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, spawnWave: noop, spawnRing: noop,
      hitPlayer: () => { hits.push(t); return 'hit' },
      shake: noop, sfx: noop, lessonShield: () => false
    } as unknown as World & CombatHost
    const c = new CombatSystem(w)
    for (const s of [-1, 1]) c.fireOrb(e, e.x + Math.sin(s * 0.6) * 0.5, e.y, e.z + Math.cos(s * 0.6) * 0.5, 4.2, 10)
    for (let i = 0; i < 400 && hits.length < 2; i++) {
      t = i * DT
      c.update(DT)
      if (glint < 0 && c.shots.some(s => s.active && (s.sprite.material as { color: { getHexString(): string } }).color.getHexString() === 'ffffff')) glint = t
    }
    expect(c.shots.filter(s => s.source === e).every(s => s.blockable)).toBe(true)
    expect(hits).toHaveLength(2)
    expect(hits[1]! - hits[0]!).toBeLessThan(0.05) // together: one press must take both
    // The glint opens the window ahead of the touch, not of his middle.
    expect(hits[0]! - glint).toBeGreaterThan(PARRY_WINDOW - 0.05)
  })
})
