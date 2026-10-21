// @vitest-environment jsdom
// "The Drill challenge mini-boss never hit me with its projectile, blocked
// or not": the Burrow Wyrm's spit was tipped down to 1 m over the floor at
// Flux's distance from its BODY, not from its mouth 1.1 m ahead, so every
// rock was still at his shoulders when it passed him — over the sphere the
// shot test hits him in. The Glitch Stalker's decoys fired level at 1.5 m
// and skimmed his head the same way. Played here on the real AI and the
// real shot flight: Flux standing in the fan is hit (in full when he does
// not block, and the shot is spent on his shield when he does), and the
// eruption still lands unblockable. And every Core Master's homing salvo
// (#188) went out 0.9 rad wide even at close range, inside the missiles'
// turning circle: they looped past a Flux who stood still until they burnt
// out (the Drill Master's never hit at its usual 4-5 m).

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import { generateMap, cellCenter, type MapData } from '@/game/world/levelGen'
import { createBoss, startBossIntro, updateBoss } from '@/game/sim/bosses'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import { SPIT_N } from '@/game/sim/miniBoss/burrowWyrm'
import { CombatSystem, MISSILE_LIFE, type CombatHost } from '@/game/sim/combat'
import { BOSSES } from '@/game/data/bosses'
import type { BossId } from '@/game/models/bosses'
import type { Enemy, World } from '@/game/sim/world'
import { mulberry32 } from '@/game/world/rng'

const DT = 1 / 60
const noop = (): void => {}

interface Hit { dmg: number; blockable: boolean; kind: string }

/** A challenge room's mini-boss with the real shot flight; Flux stands
 *  `dist` m off it and answers every hit with `answer`. */
const arena = (sector: 'drill' | 'neon', dist: number, answer: 'hit' | 'block', seed: number) => {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))
  const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(MINI_BOSSES[sector], 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const hits: Hit[] = []
  const shots: number[] = []
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: e.x + dist, z: e.z, yaw: 0, pitch: 0, y: 0 },
    combat: { iframes: 0, charging: false, charge: 0, hp: 100, maxHp: 100 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop, release: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, lessonShield: () => false,
    shake: noop, sfx: noop, pull: noop, slowPlayer: noop, addEnemy: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (_s: Enemy | null, dmg: number, o: { blockable: boolean; kind: string }) => {
      hits.push({ dmg, blockable: o.blockable, kind: o.kind })
      return o.blockable ? answer : 'hit'
    }
  } as unknown as World & CombatHost
  const c = new CombatSystem(w)
  w.fireEnemyShot = (src, x, y, z, dx, dy, dz, sp, dmg) => { shots.push(dmg); c.spawnEnemyShot(src, x, y, z, dx, dy, dz, sp, dmg) }
  startMiniBoss(e)
  const run = (s: number): void => {
    for (let i = 0; i < s / DT; i++) {
      w.time += DT
      updateMiniBoss(w, e, DT)
      c.update(DT)
    }
  }
  return { e, w, hits, shots, run }
}

describe('the Burrow Wyrm\'s spit reaches Flux (Drill challenge)', () => {
  // (The room is 18 m across: 7 m east of its spot is still on its floor.)
  for (const dist of [3, 5, 7]) {
    it(`standing ${dist} m off, unblocked: its rocks hit him in full, as blockable shots`, () => {
      let volleys = 0
      let landed = 0
      for (const seed of [1, 2, 3, 4]) {
        const a = arena('drill', dist, 'hit', seed)
        a.run(14)
        const spit = a.hits.filter(h => h.kind === 'shot')
        volleys += a.shots.length / SPIT_N
        landed += spit.length
        for (const h of spit) {
          expect(h.blockable).toBe(true)
          expect(h.dmg).toBe(Math.round(a.e.dmg * 0.6))
        }
        vi.restoreAllMocks()
      }
      expect(volleys).toBeGreaterThan(2)
      // Every fan he stands in front of lands at least one rock on him.
      expect(landed).toBeGreaterThanOrEqual(volleys)
    })
  }

  it('blocked: the rocks still come to his shield (and are spent on it)', () => {
    let landed = 0
    let fired = 0
    for (const seed of [1, 2, 3, 4]) {
      const a = arena('drill', 5, 'block', seed)
      a.run(14)
      fired += a.shots.length
      landed += a.hits.filter(h => h.kind === 'shot').length
      vi.restoreAllMocks()
    }
    expect(fired).toBeGreaterThan(0)
    expect(landed).toBeGreaterThan(fired / SPIT_N)
    // Spent on the shield: no rock reaches him twice.
    expect(landed).toBeLessThanOrEqual(fired)
  })

  it('its eruption under him still lands, unblockable', () => {
    let erupts = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = arena('drill', 3, 'block', seed)
      a.run(20)
      const aoe = a.hits.filter(h => h.kind === 'aoe')
      for (const h of aoe) expect(h.blockable).toBe(false)
      erupts += aoe.length
      vi.restoreAllMocks()
    }
    expect(erupts).toBeGreaterThan(0)
  })
})

describe('the Glitch Stalker\'s decoys hit what they shoot at (Neon challenge)', () => {
  it('a decoy\'s shot reaches Flux standing still', () => {
    let fired = 0
    let landed = 0
    for (const seed of [1, 2, 3]) {
      const a = arena('neon', 4, 'hit', seed)
      a.run(25)
      fired += a.shots.length
      landed += a.hits.filter(h => h.kind === 'shot').length
      vi.restoreAllMocks()
    }
    expect(fired).toBeGreaterThan(0)
    expect(landed).toBeGreaterThan(fired / 2)
  })
})

// ─── The Drill Master itself: every attack lands on a Flux who stands ──────

describe('the Drill Master lands each of its attacks on a Flux standing still', () => {
  const field = (): MapData => {
    const W = 40
    return { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
  }

  it('burrow, drill bombs, charge, charged blast and homing salvo all hurt him', () => {
    const seen = new Set<string>()
    for (const seed of [1, 2, 3]) {
      vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))
      const e = createBoss('drillMaster', 20, 60, 60, 0)
      const map = field()
      const w = {
        scene: new Scene(), map, nav: createNav(map), time: 0,
        player: { x: 60, z: 64, yaw: Math.PI, pitch: 0, y: 0 },
        combat: { iframes: 0, charging: false, charge: 0, hp: 100, maxHp: 100 } as unknown as World['combat'],
        enemies: [e],
        fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
        markers: { spawn: noop, release: noop }, shocks: { spawn: noop, spawnLinear: noop },
        stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
        hitStop: 0, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, lessonShield: () => false,
        shake: noop, sfx: noop, pull: noop, slowPlayer: noop, addEnemy: noop, skyFlash: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
        hitPlayer: (src: Enemy | null, dmg: number, o: { kind: string; noChip?: boolean }) => {
          // What it is doing when the blow lands; a missile lands after its
          // salvo is over (by what it is).
          if (dmg > 0) seen.add(o.kind === 'shot' && o.noChip ? 'homingSalvo' : src === e ? e.attack : '?')
          return 'hit'
        }
      } as unknown as World & CombatHost
      const c = new CombatSystem(w)
      w.fireEnemyShot = (src, x, y, z, dx, dy, dz, sp, dmg) => { c.spawnEnemyShot(src, x, y, z, dx, dy, dz, sp, dmg) }
      w.lobShell = (src, tx, tz, dur, dmg) => {
        c.lobShell(src, tx, tz, dur, dmg)
      }
      w.fireMissile = (src, x, y, z, dx, dz, sp, turn, dmg, color) => { c.fireMissile(src, x, y, z, dx, dz, sp, turn, dmg, color) }
      startBossIntro(e)
      e.state = 'engage'
      e.st = 0
      for (let i = 0; i < 60 / DT; i++) {
        w.time += DT
        updateBoss(w, e, DT, null)
        c.update(DT)
        w.player.x = 60
        w.player.z = 64
      }
      vi.restoreAllMocks()
    }
    for (const a of ['burrow', 'drillBombs', 'charge', 'chargedBlast', 'homingSalvo']) expect([...seen], a).toContain(a)
  })
})

// ─── Every Master's missile closes on a Flux who stands (#188) ─────────────

describe('a homing missile never just circles a standing Flux', () => {
  const flight = () => {
    const W = 40
    const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
    const e = createBoss('drillMaster', 3, 60, 60, 0)
    const hits: number[] = []
    const w = {
      scene: new Scene(), map, nav: createNav(map), time: 0,
      player: { x: 60, z: 60, yaw: 0, pitch: 0, y: 0 },
      combat: { iframes: 0, charging: false, charge: 0, slideT: 0 } as unknown as World['combat'],
      enemies: [e],
      fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
      markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
      stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
      hitStop: 0, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, spawnWave: noop, spawnRing: noop,
      fireEnemyShot: noop, fireOrb: noop, lobShell: noop, pull: noop, slowPlayer: noop, addEnemy: noop, skyFlash: noop,
      // Only the missiles count here (they alone ask for no chip damage).
      hitPlayer: (_e: Enemy | null, d: number, o: { noChip?: boolean }) => { if (o.noChip) hits.push(d); return 'hit' },
      shake: noop, sfx: noop, lessonShield: () => false
    } as unknown as World & CombatHost
    return { c: new CombatSystem(w), w, e, hits }
  }

  for (const id of Object.keys(BOSSES) as BossId[]) {
    it(`${id}: its salvo at 4, 6 and 9 m hits him standing, every missile`, () => {
      const H = BOSSES[id].homing
      for (const dist of [4, 6, 9]) {
        const { c, w, hits } = flight()
        const e = createBoss(id, 3, 60, 60, 0)
        w.enemies[0] = e
        w.player.z = e.z + dist
        ;(w as unknown as { fireMissile: World['fireMissile'] }).fireMissile = (src, x, y, z, dx, dz, sp, turn, dmg, color) => c.fireMissile(src, x, y, z, dx, dz, sp, turn, dmg, color)
        startBossIntro(e)
        e.state = 'engage'
        e.st = 0
        e.cd = 0
        e.bossN = 2 // its next attack is the salvo
        for (let i = 0; i < (MISSILE_LIFE + 2) / DT; i++) {
          w.time += DT
          updateBoss(w, e, DT, null)
          c.update(DT)
          // He stands; the Master is held where it is (its own moves are not the point).
          w.player.x = 60
          w.player.z = 60 + dist
          e.x = 60
          e.z = 60
          if (e.attack !== 'homingSalvo' && e.state === 'engage' && i > 30) e.cd = 99
        }
        expect(hits, `${id} at ${dist} m`).toHaveLength(H.n)
      }
    })
  }

  it('a late sidestep still beats it: nose-on, it keeps its own turn', () => {
    const { c, w, e, hits } = flight()
    const H = BOSSES.drillMaster.homing
    w.player.z = e.z + 10
    c.fireMissile(e, e.x, 1.6, e.z, 0, 1, H.speed, H.turn, 10, '#fff')
    let stepped = false
    for (let i = 0; i < MISSILE_LIFE / DT; i++) {
      c.update(DT)
      const s = c.shots.find(q => q.active && q.missile)
      if (!s) break
      // 1.5 m off it, he steps 1.6 m aside.
      if (!stepped && w.player.z - s.z < 1.5) { stepped = true; w.player.x += 1.6 }
      if (s.z > w.player.z + 1) break // it has gone past him
    }
    expect(stepped).toBe(true)
    expect(hits).toHaveLength(0)
  })
})
