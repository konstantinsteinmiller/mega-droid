// @vitest-environment jsdom
// After a Core Master (playtest 2026-10-20, the Drill Master): Flux stood on
// the lit pedestal of the weapon lesson room and was never beamed out, the
// whole view washed pale cyan. The pedestal waited for `hud.combat`, and a
// machine woken on the way (or one on another floor of the stage) standing
// outside the lesson room's shut door kept it true for good; the lit column
// meanwhile drew at full strength over the camera standing inside it.
//
// The real mission, built headlessly (no GPU, no canvas) for every Master's
// story stage and its replay: boss down (missiles and shots of its own still
// in flight, a chaser left outside the door), the lesson drones shot with
// the copied weapon, then onto the pedestal — the exit starts and the
// mission finishes, once, a success.

import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ finishes: [] as boolean[] }))

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/engine/renderer', async (orig) => {
  const f: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 1 : k === 'then' ? undefined : f), apply: () => f, set: () => true
  })
  return { ...(await orig<object>()), getRenderer: () => f, hasRenderer: () => false }
})
vi.mock('@/game/flow', async (orig) => ({
  ...(await orig<typeof import('@/game/flow')>()),
  finishMission: async (success: boolean) => { h.finishes.push(success) }
}))
vi.mock('@/game/state/profile', async (orig) => ({
  ...(await orig<typeof import('@/game/state/profile')>()),
  writeSnapshot: () => {}
}))

import { Mission, setupFromQuest } from '@/game/sim/mission'
import { storyQuest, bossQuest } from '@/game/data/quests'
import { SECTORS } from '@/game/data/regions'
import { createInput, consumeEdges, type Input } from '@/game/engine/input'
import { flow } from '@/game/flow'
import { hud } from '@/game/state/hud'
import { CELL } from '@/game/world/levelGen'
import { roomAt } from '@/game/sim/lessons'
import type { Enemy, Shot } from '@/game/sim/world'
import type { CombatSystem } from '@/game/sim/combat'
import type { PadMesh } from '@/game/models/props'

// No 2D canvas in jsdom: every texture paints into a context that takes anything.
const ctx: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === 'width' || k === 'height' ? 1 : k === 'data' ? new Uint8ClampedArray(4 * 256 * 256) : k === Symbol.toPrimitive ? () => 0 : ctx),
  set: () => true,
  apply: () => ctx
})
;(globalThis as unknown as { Path2D: unknown }).Path2D = class { constructor() { return ctx as object } }
;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx

const STEP = 1 / 60

/** What the test reaches into (private on the mission). */
interface Open {
  boss: Enemy | null
  enemies: Enemy[]
  player: Mission['player']
  combat: Mission['combat']
  system: CombatSystem
  map: Mission['map']
  exitPad: PadMesh | null
  exitWeapon: string | null
  exitLit: boolean
  exit: Mission['exit']
  climb: unknown
  lessons: { drones: Enemy[]; weaponFired(): void }
  objects: Mission['objects']
  update(dt: number, first: boolean): void
  enter(): void
  dispose(): void
}

const build = async (sector: (typeof SECTORS)[number], story: boolean): Promise<{ m: Open; input: Input; step: (s: number) => void }> => {
  const q = story ? storyQuest(sector, 30, 0) : bossQuest(sector, 30, 0)
  const input = createInput()
  const m = (await Mission.create(setupFromQuest(q, null), input)) as unknown as Open
  // A god-HP Flux: the boss is beaten by the test, not by its luck.
  m.combat.hp = m.combat.maxHp = 1e7
  m.enter()
  const step = (s: number): void => {
    for (let n = Math.round(s / STEP); n > 0; n--) {
      m.update(STEP, true)
      consumeEdges(input)
    }
  }
  for (let n = 0; n < 60 * 30 && hud.phase !== 'play'; n++) step(STEP)
  return { m, input, step }
}

const put = (m: Open, x: number, z: number, y?: number): void => {
  const p = m.player
  p.x = p.px = x
  p.z = p.pz = z
  if (y !== undefined) p.y = p.py = y
}

const hostile = (m: Open): Shot[] => m.system.shots.filter(s => s.active && s.owner === 'enemy')

/** Into the arena, the fight woken, then the Master shot down — with its
 *  missiles, an orb and a shot of its own still in the air as it falls. */
const beatBoss = (m: Open, step: (s: number) => void): Enemy => {
  const boss = m.boss!
  put(m, boss.x + 6, boss.z, m.climb ? boss.y + (boss.floor ?? 0) : undefined)
  step(6)
  for (let k = 0; k < 60 && boss.state !== 'dead'; k++) {
    if (boss.hp <= boss.maxHp / 8 + 1) {
      const p = m.player
      m.system.fireMissile(boss, boss.x, 2, boss.z, 1, 0, 6, 1.5, 10, '#ff3030')
      m.system.fireMissile(boss, boss.x, 2, boss.z, 0, 1, 6, 1.5, 10, '#ff3030')
      m.system.fireOrb(boss, boss.x, 2, boss.z, 3, 10)
      m.system.spawnEnemyShot(boss, boss.x, 2, boss.z, p.x - boss.x, 0, p.z - boss.z, 4, 10)
      expect(hostile(m).length).toBeGreaterThanOrEqual(4)
      // Down mid-charge: its bubble up as it falls (a burn, a splash…).
      boss.bossShield = 1.5
    } else boss.bossShield = 0
    if (boss.bossShield) {
      boss.hp = 0
      m.system.killEnemy(boss)
    } else {
      m.system.damageEnemy(boss, Math.ceil(boss.maxHp / 8), {
        crit: false, charge: 2, fromX: m.player.x, fromZ: m.player.z, x: boss.x, y: boss.y + 1, z: boss.z, color: '#fff'
      })
    }
    step(0.5)
  }
  expect(boss.state).toBe('dead')
  // Nothing of its own outlives it: no bubble, no shot, no missile.
  expect(boss.bossShield ?? 0).toBe(0)
  if (boss.shieldMesh) expect(boss.shieldMesh.visible).toBe(false)
  expect(m.system.shots.filter(s => s.active && s.source === boss).length).toBe(0)
  step(4)
  expect(m.objects.objective.done).toBe(true)
  return boss
}

/** A machine of the level, and the floor cells just outside the lesson room
 *  (in reach of the pedestal, on the far side of its door) to hold it on. */
const chaserOutside = (m: Open): { e: Enemy; spots: Array<[number, number]> } | null => {
  const ex = m.map.exit!
  const at = m.exitPad!.root.position
  const e = m.enemies.find(x => x.state !== 'dead' && !x.boss && !m.lessons.drones.includes(x))
  if (!e) return null
  const spots: Array<[number, number]> = []
  for (let j = 0; j < m.map.h; j++) {
    for (let i = 0; i < m.map.w; i++) {
      const x = (i + 0.5) * CELL
      const z = (j + 0.5) * CELL
      const d = Math.hypot(x - at.x, z - at.z)
      if (roomAt(m.map, x, z) !== ex.room && m.map.cell[j * m.map.w + i] && d > 4 && d < 18) spots.push([x, z])
    }
  }
  return spots.length ? { e, spots } : null
}

afterEach(() => {
  h.finishes.length = 0
  flow.modal = ''
  hud.phase = 'boot'
})

const MASTERS = SECTORS.filter(s => s.id !== 'fortress')

describe('the lit pedestal after a Master always beams Flux out', () => {
  for (const sector of MASTERS) {
    it(`${sector.id}: story stage — boss down mid-charge, a chaser outside the door, drones shot → pedestal → exit`, async () => {
      const { m, step } = await build(sector, true)
      try {
        beatBoss(m, step)
        if (!m.exitPad) return // a stage without the lesson room (the Scrapper's)
        expect(m.exitWeapon).toBeTruthy()
        const at = m.exitPad.root.position
        // Into the lesson room, onto the pedestal; the drones beam in.
        put(m, at.x + 0.3, at.z + 0.3, at.y)
        step(1.5)
        const out = chaserOutside(m)
        expect(out).not.toBeNull()
        const chaser = out!.e
        // Shot down with the copied weapon: the lesson is learned, the
        // pedestal lit (Flux a step off it, toward the room's middle).
        const room = m.map.rooms[m.map.exit!.room]!
        const cx = (room.x0 + room.w / 2) * CELL - at.x
        const cz = (room.z0 + room.h / 2) * CELL - at.z
        const l = Math.hypot(cx, cz) || 1
        put(m, at.x + (cx / l) * 2.2, at.z + (cz / l) * 2.2)
        for (let k = 0; k < 16 && !m.exitLit; k++) {
          m.lessons.weaponFired()
          for (const d of m.lessons.drones.filter(x => x.state !== 'dead')) {
            m.system.damageEnemy(d, 1e6, { crit: false, charge: 0, fromX: at.x, fromZ: at.z, x: d.x, y: d.y, z: d.z, color: '#fff', weapon: m.exitWeapon! })
          }
          step(0.5)
        }
        step(1)
        expect(m.exitLit).toBe(true)
        // Lit, seen from beside it: the column shines.
        expect(m.exitPad.ringMat.opacity).toBeGreaterThan(0.5)
        // Held there, awake, every step: the first spot the level lets it stand on.
        let spot = out!.spots[0]!
        const hold = (): void => {
          chaser.awake = true
          chaser.dormant = false
          chaser.offstage = false
          chaser.leash = undefined
          chaser.x = chaser.px = chaser.sx = chaser.tx = spot[0]
          chaser.z = chaser.pz = chaser.sz = chaser.tz = spot[1]
        }
        const keepAwake = (t: number): void => {
          for (let n = Math.round(t / STEP); n > 0; n--) { hold(); step(STEP) }
        }
        for (const s of out!.spots) {
          spot = s
          keepAwake(STEP)
          if (Math.hypot(chaser.x - s[0], chaser.z - s[1]) < 1) break
        }
        keepAwake(0.2)
        // The machine outside the shut door, awake and in reach, is no fight:
        // B is not refused either.
        expect(Math.hypot(chaser.x - m.player.x, chaser.z - m.player.z)).toBeLessThan(22)
        expect(hud.combat).toBe(false)
        // A pause over the pedestal: nothing happens, and the lit column is
        // no wall of light over the view of Flux standing in it.
        flow.modal = 'pause' as typeof flow.modal
        put(m, at.x, at.z)
        step(2)
        expect(chaser.state).not.toBe('dead')
        expect(hud.phase).toBe('play')
        expect(m.exitPad.ringMat.opacity).toBeLessThan(0.05)
        flow.modal = ''
        put(m, at.x, at.z)
        keepAwake(0.5)
        expect(hud.phase).toBe('beamOut')
        expect(m.exit.active).toBe(true)
        expect(hostile(m).length).toBe(0)
        step(m.exit.plan!.tEnd + 2)
        expect(h.finishes).toEqual([true])
      } finally {
        m.dispose()
      }
    }, 60000)

    it(`${sector.id}: replay (no lesson room) — boss down, B beams out with its missiles gone`, async () => {
      const { m, input, step } = await build(sector, false)
      try {
        beatBoss(m, step)
        input.beamQueued = true
        step(STEP)
        expect(hud.phase).toBe('beamOut')
        step(m.exit.plan!.tEnd + 2)
        expect(h.finishes).toEqual([true])
      } finally {
        m.dispose()
      }
    }, 60000)
  }
})
