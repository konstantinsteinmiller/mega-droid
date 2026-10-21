// @vitest-environment jsdom
// The Mole Driller's lunge (playtest: "the Neon moles are 0 threat"). Out of
// the ground, with Flux in reach, it coils for a short beat (red ring, eye
// flare), its aim locks as the coil ends, then it dashes a fixed run, very
// fast, in a straight line; a wall stops it. It bites lightly, once a lunge;
// a perfect block parries it (stunned, bounced back, no damage); it does not
// lunge again for a while, and two moles never launch on the same frame.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async (importOriginal) => {
  const { Mesh, Group } = await import('three')
  return { ...(await importOriginal<object>()), makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import {
  createEnemy, updateEnemy, syncEnemyVisual, MOLE_LUNGE_R, MOLE_LUNGE_TELE, MOLE_LUNGE_DIST, MOLE_LUNGE_SPEED,
  MOLE_LUNGE_DMG, MOLE_LUNGE_CD, MOLE_LUNGE_SETTLE
} from '@/game/sim/enemies'
import { Mission, type MissionSetup } from '@/game/sim/mission'
import { baseStats } from '@/game/sim/stats'
import { createInput, consumeEdges, type Input } from '@/game/engine/input'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'
import { newMotion } from '@/game/models/motion'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const W = 40
const MID = 20 * CELL

type Hit = { dmg: number; parryable?: boolean; blockable: boolean }

const openMap = (): MapData =>
  ({ w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] }) as unknown as MapData

const world = (enemies: Enemy[], hits: Hit[], map = openMap()): World => {
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: MID, z: MID, y: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 0 } as World['combat'],
    enemies,
    fx: { sparks: noop, emit: noop, orbBurst: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (_e: Enemy, dmg: number, o: Hit) => { hits.push({ ...o, dmg }); return 'hit' },
    shake: noop, sfx: noop
  } as unknown as World
}

/** A mole just surfaced `d` m straight ahead (−z) of Flux, its lunge ready. */
const surfaced = (d: number, x = MID): Enemy => {
  const e = createEnemy('mole', 1, x, MID - d, 0)
  e.mo = newMotion(777, 'mole')
  e.awake = true
  e.buried = false
  e.a = 1
  e.b = 0
  e.cd = 999
  e.attack = 'erupt'
  e.state = 'act'
  e.st = 0
  return e
}

const tick = (w: World, e: Enemy): void => {
  w.time += DT
  updateEnemy(w, e, DT)
  syncEnemyVisual(e, 1, w.time)
}

/** Ticks until `e` is in `state` with `attack` (or `secs` pass); the time taken. */
const until = (w: World, e: Enemy, ok: () => boolean, secs = 3): number => {
  let k = 0
  for (; k < secs / DT && !ok(); k++) tick(w, e)
  return k * DT
}

beforeEach(() => {
  let s = 0x5eed
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return (s >>> 0) / 4294967296
  })
  return () => dice.mockRestore()
})

describe('Mole Driller lunge', () => {
  it('commits only with Flux in reach, after a beat out of the ground', () => {
    const near = surfaced(MOLE_LUNGE_R - 0.6)
    const w = world([near], [])
    const t = until(w, near, () => near.state === 'tele')
    expect(near.attack).toBe('lunge')
    expect(t).toBeGreaterThanOrEqual(MOLE_LUNGE_SETTLE - DT)
    const far = surfaced(MOLE_LUNGE_R + 0.6)
    const w2 = world([far], [])
    for (let k = 0; k < 1.5 / DT && far.state === 'act'; k++) {
      tick(w2, far)
      w2.player.x = far.x
      w2.player.z = far.z + MOLE_LUNGE_R + 0.6
    }
    expect(far.attack).not.toBe('lunge')
  })

  it('a short wind-up, then a very fast straight run of a fixed length', () => {
    expect(MOLE_LUNGE_TELE).toBeGreaterThanOrEqual(0.3)
    expect(MOLE_LUNGE_TELE).toBeLessThanOrEqual(0.4)
    const e = surfaced(3)
    const w = world([e], [])
    until(w, e, () => e.state === 'tele')
    const tele = until(w, e, () => e.state !== 'tele')
    expect(tele).toBeCloseTo(MOLE_LUNGE_TELE, 1)
    // Flux has stepped aside: it runs its fixed length past where he was.
    w.player.x = MID + 3
    const x0 = e.x
    const z0 = e.z
    const run = until(w, e, () => e.state !== 'act')
    expect(e.state).toBe('recover')
    expect(Math.hypot(e.x - x0, e.z - z0)).toBeCloseTo(MOLE_LUNGE_DIST, 0)
    expect(run).toBeLessThanOrEqual(MOLE_LUNGE_DIST / MOLE_LUNGE_SPEED + 2 * DT)
  })

  it('locks its aim as the coil ends: a sidestep after it is dodged', () => {
    const hits: Hit[] = []
    const e = surfaced(3)
    const w = world([e], hits)
    until(w, e, () => e.state === 'act')
    const tx = e.tx
    const tz = e.tz
    w.player.x = MID + 2.2
    until(w, e, () => e.state !== 'act')
    expect(e.tx).toBe(tx)
    expect(e.tz).toBe(tz)
    expect(Math.abs(e.x - MID)).toBeLessThan(0.05)
    expect(hits.length).toBe(0)
  })

  it('bites lightly, once a lunge, and not again for a while', () => {
    const hits: Hit[] = []
    const e = surfaced(3)
    const w = world([e], hits)
    until(w, e, () => e.state === 'recover')
    expect(hits.length).toBe(1)
    expect(hits[0]!.dmg).toBe(Math.round(e.dmg * MOLE_LUNGE_DMG))
    expect(hits[0]!.dmg).toBeLessThanOrEqual(12)
    expect(hits[0]!.parryable).toBe(true)
    expect(hits[0]!.blockable).toBe(false)
    expect(e.b).toBeGreaterThanOrEqual(MOLE_LUNGE_CD[0] - 1)
    // Back out of the ground at once, beside him: no lunge before its cooldown.
    const left = e.b
    e.state = 'act'
    e.st = 0
    e.attack = 'erupt'
    let t = 0
    for (; t < 6 && !(e.state === 'tele' && e.attack === 'lunge'); t += DT) {
      tick(w, e)
      if (e.state === 'engage') { e.buried = false; e.state = 'act'; e.st = MOLE_LUNGE_SETTLE }
      w.player.x = e.x
      w.player.z = e.z + 3
    }
    expect(t).toBeGreaterThanOrEqual(left - 2 * DT)
  })

  it('two moles never launch on the same frame', () => {
    const a = surfaced(3, MID - 0.8)
    const b = surfaced(3, MID + 0.8)
    const w = world([a, b], [])
    const starts: number[][] = [[], []]
    for (let k = 0; k < 1 / DT; k++) {
      w.time += DT
      for (const [i, e] of [a, b].entries()) {
        const was = e.state
        updateEnemy(w, e, DT)
        if (was === 'act' && e.state === 'tele') starts[i]!.push(w.time)
      }
    }
    expect(starts[0]!.length).toBe(1)
    expect(starts[1]!.length).toBe(1)
    expect(Math.abs(starts[0]![0]! - starts[1]![0]!)).toBeGreaterThan(0.1)
  })

  it('stops at a wall, never through it', () => {
    const map = openMap()
    // A wall row between it and a Flux standing behind it.
    const wz = Math.floor((MID - 1.6) / CELL)
    for (let x = 0; x < W; x++) map.cell[wz * W + x] = 0
    const e = surfaced(3.5)
    e.z = (wz + 1) * CELL + 0.6
    e.x = MID
    const w = world([e], [], map)
    w.player.z = (wz - 1) * CELL + 1
    // Flux beyond the wall but in reach: force the coil with him in sight.
    e.state = 'tele'
    e.attack = 'lunge'
    e.teleDur = MOLE_LUNGE_TELE
    e.st = 0
    until(w, e, () => e.state !== 'tele')
    until(w, e, () => e.state !== 'act')
    expect(e.z).toBeGreaterThan((wz + 1) * CELL + e.def.radius - 0.05)
    expect(e.state).toBe('stun')
  })

  it('the model coils, stretches and squashes without moving its root', () => {
    const e = surfaced(3)
    const w = world([e], [])
    until(w, e, () => e.state === 'tele')
    until(w, e, () => e.st > MOLE_LUNGE_TELE * 0.8)
    const body = e.rig.bones.body!
    expect(body.scale.y).toBeLessThan(0.9)
    until(w, e, () => e.state === 'act')
    tick(w, e)
    expect(body.scale.z).toBeGreaterThan(1.2)
    until(w, e, () => e.state === 'recover')
    tick(w, e)
    expect(body.scale.y).toBeLessThan(1)
    until(w, e, () => e.state !== 'recover')
    tick(w, e)
    expect(body.scale.y).toBeCloseTo(1, 2)
  })
})

describe('Mole Driller lunge vs the shield (real mission)', () => {
  const rig = () => {
    const sector = SECTORS[0]!
    const setup: MissionSetup = { sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters, stats: baseStats() }
    const input = createInput()
    const m = new (Mission as unknown as new (s: MissionSetup, i: Input) => Mission)(setup, input)
    const map = openMap()
    m.map = map
    m.nav = createNav(map)
    m.player = {
      x: MID, z: MID, px: MID, pz: MID, vx: 0, vz: 0, yaw: 0, pitch: 0, path: null, bob: 0, bobAmp: 0,
      y: 0, py: 0, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: 0, mantle: 0, mx: 0, mz: 0
    }
    m.fx = { emit: () => {}, sparks: () => {} } as unknown as Mission['fx']
    ;(m as unknown as { vm: unknown }).vm = { barrier: { impact: () => {} } }
    ;(m as unknown as { firePellet: () => void }).firePellet = () => {}
    ;(m as unknown as { activePellets: () => number }).activePellets = () => 0
    hud.phase = 'play'
    const e = surfaced(3)
    const w = m as unknown as World
    w.enemies = [e]
    ;(w as unknown as { markers: unknown }).markers = { spawn: () => {} }
    ;(w as unknown as { shocks: unknown }).shocks = { spawn: () => {} }
    const step = (): void => {
      ;(m as unknown as { updatePlayer(dt: number, first: boolean): void }).updatePlayer(DT, true)
      consumeEdges(input)
      m.time += DT
      m.player.x = m.player.z = MID
      updateEnemy(w, e, DT)
    }
    return { m, input, step, e }
  }

  it('a perfect block facing it: no damage, parried, stunned and bounced back', () => {
    const { m, input, step, e } = rig()
    for (let k = 0; k < 120 && !(e.state === 'act' && e.attack === 'lunge'); k++) step()
    // The lunge has launched: block now, a perfect one.
    input.blockHeld = true
    input.blockPressed = true
    const hp = m.combat.hp
    let minD = 99
    for (let k = 0; k < 30 && e.state === 'act'; k++) { step(); minD = Math.min(minD, Math.hypot(e.x - MID, e.z - MID)) }
    expect(e.state).toBe('stun')
    expect(m.combat.hp).toBe(hp)
    expect(Math.hypot(e.x - MID, e.z - MID)).toBeGreaterThan(minD + 0.5)
  })

  it('no block: a light bite; a shield held long before softens it', () => {
    const a = rig()
    for (let k = 0; k < 120 && a.e.state !== 'recover'; k++) a.step()
    const bite = a.m.combat.maxHp - a.m.combat.hp
    expect(bite).toBeGreaterThan(0)
    const b = rig()
    b.input.blockHeld = true
    b.input.blockPressed = true
    for (let k = 0; k < 120 && b.e.state !== 'recover'; k++) b.step()
    const soft = b.m.combat.maxHp - b.m.combat.hp
    expect(soft).toBeLessThan(bite)
    expect(b.e.state).toBe('recover')
  })
})
