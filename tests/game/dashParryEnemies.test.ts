// #189: every dash is perfectly blockable — the Gear Roller's charge and
// lunge and the Scrapper's rush send `parryable` with their contact, and a
// parried dash stays stunned (no wall bonk, no recover over the parry's stun)
// and cannot hit again through the same contact.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { createEnemy, updateEnemy } from '@/game/sim/enemies'
import { newMotion } from '@/game/models/motion'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60

type Hit = { parryable?: boolean; blockable: boolean }

/** A world whose `hitPlayer` answers `answer` and parries like the mission does. */
const world = (e: Enemy, hits: Hit[], answer: 'hit' | 'parry'): World => {
  const W = 40
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: 60, z: 33, yaw: 0, pitch: 0 },
    combat: { iframes: 0 } as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (src: Enemy, _dmg: number, o: Hit) => {
      hits.push(o)
      if (answer === 'parry' && o.parryable) {
        src.state = 'stun'
        src.st = 0
        src.stunT = 1.6
        return 'parry'
      }
      return answer
    },
    shake: noop, sfx: noop
  } as unknown as World
}

const dasher = (kind: string, attack: string): Enemy => {
  const e = createEnemy(kind, 1, 60, 30, 0)
  e.yaw = 0
  e.mo = newMotion(777, kind)
  e.awake = true
  e.cd = 999
  e.attack = attack
  e.tx = 0
  e.tz = 1
  e.hitPlayer = false
  e.state = 'act'
  e.st = 0
  return e
}

const DASHES: [string, string, string][] = [
  ['Gear Roller charge', 'roller', 'charge'],
  ['Gear Roller lunge', 'roller', 'lunge'],
  ['Scrapper rush', 'brute', 'rush'],
  ['Mole Driller lunge', 'mole', 'lunge']
]

beforeEach(() => {
  let s = 0x5eed
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return (s >>> 0) / 4294967296
  })
  return () => dice.mockRestore()
})

describe('every dash is perfectly blockable (#189)', () => {
  for (const [name, kind, attack] of DASHES) {
    it(`${name}: its contact is parryable, a parry leaves it stunned, one contact only`, () => {
      const hits: Hit[] = []
      const e = dasher(kind, attack)
      const w = world(e, hits, 'parry')
      for (let k = 0; k < 60 && !hits.length; k++) { w.time += DT; updateEnemy(w, e, DT) }
      expect(hits.length).toBe(1)
      expect(hits[0]!.parryable).toBe(true)
      expect(e.state).toBe('stun')
      for (let k = 0; k < 30; k++) { w.time += DT; updateEnemy(w, e, DT) }
      expect(hits.length).toBe(1)
    })

    it(`${name}: unparried it lands once and goes on as before`, () => {
      const hits: Hit[] = []
      const e = dasher(kind, attack)
      const w = world(e, hits, 'hit')
      for (let k = 0; k < 60 && !hits.length; k++) { w.time += DT; updateEnemy(w, e, DT) }
      expect(hits.length).toBe(1)
      expect(e.state).not.toBe('stun')
    })
  }
})
