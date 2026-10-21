// @vitest-environment jsdom
// #189: the Glitch Stalker's blink slash and the Storm Hornet Queen's dive are
// perfectly blockable like every dash: their contact is `parryable` and comes
// from the machine itself (so the shield's facing check is against it), a
// parry stuns it and the strike lands once; unparried, it lands in full.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { generateMap, cellCenter } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import { BLINK_GONE } from '@/game/sim/miniBoss/glitchStalker'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60

type Hit = { parryable?: boolean; fromX: number; fromZ: number }

const arena = (sector: 'neon' | 'gale', answer: 'hit' | 'parry') => {
  const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(MINI_BOSSES[sector], 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const hits: Hit[] = []
  const stub = () => {}
  const w = {
    map, nav: createNav(map), time: 0, player: { x: e.x + 1, z: e.z, yaw: 0, pitch: 0 }, combat: {}, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: stub, release: stub }, shocks: { spawn: stub, spawnLinear: stub },
    hitPlayer: (src: Enemy, _dmg: number, o: Hit) => {
      hits.push(o)
      // As the mission does on a parry (its facing check passed).
      if (answer === 'parry' && o.parryable) {
        src.state = 'stun'
        src.st = 0
        src.stunT = 1.6
        return 'parry'
      }
      return 'hit'
    },
    slowPlayer: stub, pull: stub, addEnemy: (d: Enemy) => { w.enemies.push(d) },
    shake: stub, sfx: stub, fireEnemyShot: stub, lobShell: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
  } as unknown as World & { enemies: Enemy[] }
  startMiniBoss(e)
  const m = e.challenge!.mem as Record<string, unknown>
  e.state = 'act'
  e.hitPlayer = false
  if (sector === 'neon') {
    // Blinked out, about to strike back on its ring next to Flux.
    m.attack = 'blink'
    e.attack = 'blink'
    m.gone = true
    m.bx = e.x
    m.bz = e.z
    e.st = BLINK_GONE
  } else {
    // At the bottom of the dive, onto Flux's spot.
    m.attack = 'dive'
    e.attack = 'dive'
    m.stuck = false
    m.struck = false
    m.sx = m.tx = w.player.x
    m.sz = m.tz = w.player.z
    m.sy = 1.1
    e.st = 0
  }
  const run = (n: number) => { for (let k = 0; k < n; k++) { w.time += DT; updateMiniBoss(w, e, DT) } }
  return { e, w, hits, run, m }
}

const CASES: [string, 'neon' | 'gale'][] = [['Glitch Stalker blink slash', 'neon'], ['Storm Hornet Queen dive', 'gale']]

describe('blink slash and dive are perfectly blockable (#189)', () => {
  for (const [name, sector] of CASES) {
    it(`${name}: parryable from the machine, a parry stuns it, one hit only`, () => {
      const { e, hits, run } = arena(sector, 'parry')
      run(1)
      expect(hits.length).toBe(1)
      expect(hits[0]!.parryable).toBe(true)
      expect(hits[0]!.fromX).toBeCloseTo(e.x, 0)
      expect(hits[0]!.fromZ).toBeCloseTo(e.z, 0)
      expect(e.state).toBe('stun')
      run(40)
      expect(hits.length).toBe(1)
    })

    it(`${name}: unparried it lands once and is not stunned`, () => {
      const { e, hits, run } = arena(sector, 'hit')
      run(1)
      expect(hits.length).toBe(1)
      expect(e.state).not.toBe('stun')
      run(20)
      expect(hits.length).toBe(1)
    })
  }

  it('a parried dive knocks the queen up off the sting: not stuck in the floor', () => {
    const { e, m, run } = arena('gale', 'parry')
    run(1)
    expect(m.stuck).toBe(false)
    expect(e.y).toBeGreaterThan(1.1)
  })
})
