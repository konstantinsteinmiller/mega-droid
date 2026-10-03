// The crate golem (sim/enemies.ts "Crate golem", models/enemies.ts buildGolem,
// sim/spawn.ts placeGolems, the no-damage path in sim/combat.ts): asleep it is
// the sector's supply crate — nothing of it pokes out of the crate, nothing
// notices it, nothing hurts it — the first hit only wakes it; it is
// untouchable through its unfold; it hops a charged shot it can see coming
// from out of reach and nothing else; it is placed deterministically where
// crates stand, never in the tutorial and never on top of a real crate.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The blob shadow, the telegraph ring and the shot glow draw canvas textures
// (no 2D canvas under jsdom); plain objects stand in.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene, Vector3, type Mesh } from 'three'
import {
  createEnemy, updateEnemy, syncEnemyVisual, wake, golemShielded, shotThreatens, golemColors,
  GOLEM_UNFOLD, GOLEM_DODGE_MIN, GOLEM_DODGE_CD, GOLEM_RAM_R, GOLEM_RAM_TELE, GOLEM_RAM_TIME
} from '@/game/sim/enemies'
import { CombatSystem, type CombatHost } from '@/game/sim/combat'
import { spawnEncounters, spawnTutorial, placeGolems } from '@/game/sim/spawn'
import { planWalkthrough } from '@/game/sim/walkthrough'
import { MissionObjects, objectiveTarget, type ObjectiveHost, type TargetSource } from '@/game/sim/objectives'
import { buildEnemyRig, poseGolem, BASE_COLORS } from '@/game/models/enemies'
import { buildCrate } from '@/game/models/props'
import { rbox, rboxSplit } from '@/game/models/kit'
import { createNav } from '@/game/world/nav'
import { generateMap, cellCenter, type MapData } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ENEMIES } from '@/game/data/enemies'
import { tutorialQuest, type Quest } from '@/game/data/quests'
import type { Enemy, Shot, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

/** Seeded [0, 1) stream: cooldowns and dust roll Math.random. */
const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}
beforeEach(() => {
  const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x601e))
  return () => dice.mockRestore()
})

// ─── Harness ────────────────────────────────────────────────────────────────

/** A 120 m field; `corridorX` walls it down to one 3 m cell wide along z. */
const field = (corridorX?: number): MapData => {
  const W = 40
  const cell = new Uint8Array(W * W).fill(1)
  if (corridorX !== undefined) {
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) if (i !== corridorX) cell[j * W + i] = 0
  }
  return { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
}

interface Rig { w: World & CombatHost; sys: CombatSystem; e: Enemy; shots: Shot[] }

/** A golem at (x, 30) facing +Z, a real CombatSystem around it, Flux `dist` m up +Z. */
const setup = (dist = 9, map = field(), x = 60): Rig => {
  const e = createEnemy('golem', 1, x, 30, 0, { theme: THEMES.scrapyard })
  e.yaw = 0
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x, z: 30 + dist, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: vi.fn(), onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop,
    fireEnemyShot: vi.fn(), lobShell: vi.fn(), spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: vi.fn()
  } as unknown as World & CombatHost
  const sys = new CombatSystem(w)
  return { w, sys, e, shots: sys.shots }
}

const tick = (w: World, e: Enemy, n = 1): void => {
  for (let i = 0; i < n; i++) {
    w.time += DT
    updateEnemy(w, e, DT)
    syncEnemyVisual(e, 1, w.time)
  }
}

const hit = (r: Rig, charge = 0): void => {
  const { e } = r
  r.sys.damageEnemy(e, 40, { crit: false, charge, fromX: r.w.player.x, fromZ: r.w.player.z, x: e.x, y: 0.6, z: e.z, color: '#ffffff' })
}

/** Awake, unfolded, standing in its band, its attacks held off. */
const awake = (r: Rig): void => {
  hit(r)
  tick(r.w, r.e, Math.ceil(GOLEM_UNFOLD / DT) + 4)
  r.e.state = 'engage'
  r.e.st = 0
  r.e.cd = 999
}

/** In the middle of a hop (`attack` stays 'dodge' after one, so the state says it). */
describe('the crate golem\'s throw', () => {
  it('is aimed in world heights, so a climb does not lift it a second time (it flew over Flux)', () => {
    const r = setup(9)
    awake(r)
    r.e.cd = 0
    for (let i = 0; i < 300 && !(r.w.fireEnemyShot as ReturnType<typeof vi.fn>).mock.calls.length; i++) tick(r.w, r.e)
    const calls = (r.w.fireEnemyShot as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0]![10]).toBe(true)
  })
})


const hopping = (e: Enemy): boolean => e.state === 'act' && e.attack === 'dodge'

/** A charged shot from Flux, flying straight at the golem. */
const chargedShot = (r: Rig, kind: Shot['kind'] = 'charge2', homing = true): Shot => {
  const { w, e } = r
  const s = r.sys.spawnPlayerShot(
    kind as 'pellet' | 'charge1' | 'charge2' | 'charge3', w.player.x, 1.1, w.player.z - 0.6, 0, 0, -1, 40, false, homing ? e : null
  )
  return s
}

// ─── Asleep ─────────────────────────────────────────────────────────────────

describe('crate golem: asleep it is a crate', () => {
  it('nothing of it shows outside the supply crate it copies (and it IS that crate where it shows)', () => {
    const theme = THEMES.cryo
    const rig = buildEnemyRig('golem', golemColors(theme))
    poseGolem(rig, 0, 0, 0, 0, 0)
    rig.root.updateMatrixWorld(true)
    // Point sets with a tolerant lookup (1 cm buckets, 27 neighbours, 1e-4 m)
    type Hash = Map<string, Vector3[]>
    const cellOf = (v: Vector3, dx = 0, dy = 0, dz = 0): string =>
      `${Math.floor(v.x * 100) + dx},${Math.floor(v.y * 100) + dy},${Math.floor(v.z * 100) + dz}`
    const add = (h: Hash, v: Vector3): void => {
      const k = cellOf(v)
      const list = h.get(k) ?? []
      list.push(v)
      h.set(k, list)
    }
    const has = (h: Hash, v: Vector3): boolean => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const q of h.get(cellOf(v, dx, dy, dz)) ?? []) if (q.distanceTo(v) < 1e-4) return true
      }
      return false
    }
    // The real crate's surface points (body and glow nubs; not the outline hull)
    const crate = buildCrate(theme).root
    const crateSet: Hash = new Map()
    const cratePts: Vector3[] = []
    crate.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || (m.material as { type?: string }).type === 'ShaderMaterial') return
      const p = m.geometry.attributes.position!
      for (let i = 0; i < p.count; i++) {
        const q = new Vector3().fromBufferAttribute(p, i)
        add(crateSet, q)
        cratePts.push(q)
      }
    })
    // A point is hidden inside the crate's box, a corner bumper, a trim disc or a nub
    const s = 1.15
    const h = s / 2
    const inside = (v: Vector3): boolean => {
      const x = Math.abs(v.x) / h
      const y = Math.abs(v.y - h) / h
      const z = Math.abs(v.z) / h
      const n = 2 / 0.28
      if (x ** n + y ** n + z ** n <= 0.985) return true
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        if (Math.hypot(v.x - a * s * 0.42, v.y - s * 0.9, v.z - b * s * 0.42) <= 0.18) return true
      }
      for (const f of [-1, 1]) {
        const dz = (v.z - f * h) / 0.06
        if ((v.x / (s * 0.36)) ** 2 + ((v.y - h) / (s * 0.36)) ** 2 + dz * dz <= 0.9) return true
        if (Math.hypot(v.x, v.y - h, v.z - f * s * 0.54) <= 0.08) return true
      }
      return false
    }
    const pos = rig.mesh.geometry.attributes.position!
    const golemSet: Hash = new Map()
    const outside: string[] = []
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3().fromBufferAttribute(pos, i)
      rig.mesh.applyBoneTransform(i, v)
      add(golemSet, v)
      if (!has(crateSet, v) && !inside(v)) outside.push(`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`)
    }
    expect(outside.slice(0, 5), `${outside.length} vertices of the sleeping golem show outside the crate`).toEqual([])
    // …and every surface point of the real crate is a point of the golem
    const missing = cratePts.filter(q => !has(golemSet, q))
    expect(missing.length, 'crate points the sleeping golem lacks').toBe(0)
  })

  it('its lid is the box cut along a ring: same vertices, same normals, no seam to see', () => {
    const whole = rbox(1.15, 1.15, 1.15, 0.28)
    const cut = rboxSplit(1.15, 1.15, 1.15, 0.28, 4)
    const wp = whole.attributes.position!
    const wn = whole.attributes.normal!
    const row = 17
    const check = (g: typeof whole, first: number): void => {
      const p = g.attributes.position!
      const n = g.attributes.normal!
      for (let i = 0; i < p.count; i++) {
        const j = first * row + i
        expect(Math.abs(p.getY(i) - wp.getY(j)) + Math.abs(p.getX(i) - wp.getX(j)) + Math.abs(p.getZ(i) - wp.getZ(j))).toBeLessThan(1e-9)
        expect(Math.abs(n.getX(i) - wn.getX(j)) + Math.abs(n.getY(i) - wn.getY(j)) + Math.abs(n.getZ(i) - wn.getZ(j))).toBeLessThan(1e-9)
      }
    }
    check(cut.top, 0)
    check(cut.bottom, 4)
    expect(cut.top.attributes.position!.count + cut.bottom.attributes.position!.count).toBe(wp.count + row)
  })

  it('unfolded it stands on its legs, lid open, a head taller than the crate', () => {
    const rig = buildEnemyRig('golem')
    poseGolem(rig, 1, 0, 0, 0, 0)
    rig.root.updateMatrixWorld(true)
    const pos = rig.mesh.geometry.attributes.position!
    const v = new Vector3()
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      rig.mesh.applyBoneTransform(i, v)
      lo = Math.min(lo, v.y)
      hi = Math.max(hi, v.y)
    }
    expect(Math.abs(lo)).toBeLessThan(0.03)
    expect(hi).toBeGreaterThan(1.65)
  })

  it('wears its sector\'s crate colours; an elite\'s gold is on its limbs only', () => {
    const c = golemColors(THEMES.blaze, true)
    expect([c.main, c.deep, c.eye]).toEqual([THEMES.blaze.crate, THEMES.blaze.crateTrim, THEMES.blaze.accent])
    expect(c.accent).toBe('#ffd84a')
    // An element tint would repaint the disguise
    const fire = createEnemy('golem', 3, 0, 0, 0, { element: 'fire', theme: THEMES.blaze })
    expect(fire.element).toBe('none')
    // An elite sleeps crate-sized
    const elite = createEnemy('golem', 3, 0, 0, 0, { elite: true, theme: THEMES.blaze })
    expect(elite.rig.root.scale.x).toBe(1)
    expect(BASE_COLORS.golem.main).toBe(THEMES.scrapyard.crate)
  })

  it('never notices Flux, never hears gunfire or a waking room-mate, and stands solid like a crate', () => {
    const r = setup(3)
    const { w, e } = r
    tick(w, e, 120)
    expect(e.dormant).toBe(true)
    expect(e.awake).toBe(false)
    // Solid on the nav while it sleeps, like the crate it pretends to be
    expect(w.nav.props.some(p => p.active && p.x === e.x && p.z === e.z)).toBe(true)
    wake(w, e)
    expect(e.dormant).toBe(true)
    const mate = createEnemy('trooper', 1, 63, 30, 0)
    w.enemies.push(mate)
    wake(w, mate)
    expect(mate.awake).toBe(true)
    expect(e.awake).toBe(false)
    // A revive's shove-back (state stun) does not move or wake it
    e.state = 'stun'
    e.stunT = 1.2
    tick(w, e, 10)
    expect([e.state, e.x, e.z, e.dormant]).toEqual(['idle', 60, 30, true])
  })

  it('takes no damage from anything: the first hit wakes it (TINK), then it is untouchable until unfolded', () => {
    for (const charge of [0, 1, 2]) {
      const r = setup()
      const { w, e } = r
      const hp = e.hp
      expect(golemShielded(e)).toBe(true)
      hit(r, charge)
      expect(e.hp).toBe(hp)
      expect(e.dormant).toBe(false)
      expect(e.awake).toBe(true)
      expect(e.state).toBe('alert')
      expect(w.sfx).toHaveBeenCalledWith('tink', e.x, e.z)
      // Its crate's solid is gone: it is a body now
      expect(w.nav.props.every(p => !p.active)).toBe(true)
      // Still unfolding: a second hit bounces too
      tick(w, e, Math.floor((GOLEM_UNFOLD * 0.5) / DT))
      hit(r, 2)
      expect(e.hp).toBe(hp)
      tick(w, e, Math.ceil((GOLEM_UNFOLD * 0.5) / DT) + 2)
      expect(golemShielded(e)).toBe(false)
      expect(e.state).toBe('engage')
      hit(r, charge)
      expect(e.hp).toBeLessThan(hp)
    }
  })

  it('its hit volume grows from a crate\'s to its own as it unfolds', () => {
    const r = setup()
    expect(r.e.def.aimY).toBeLessThan(ENEMIES.golem.aimY)
    expect(r.e.def).not.toBe(ENEMIES.golem)
    awake(r)
    expect(r.e.def.aimY).toBeCloseTo(ENEMIES.golem.aimY, 6)
    expect(r.e.def.hitR).toBeCloseTo(ENEMIES.golem.hitR, 6)
  })
})

// ─── Awake ──────────────────────────────────────────────────────────────────

describe('crate golem: the dodge', () => {
  it('sees a charged shot on a collision course, not one flying wide or away', () => {
    const r = setup()
    const s = chargedShot(r, 'charge2', false)
    expect(shotThreatens(r.e, s)).toBe(true)
    s.vx = 20
    s.vz = -20
    expect(shotThreatens(r.e, s)).toBe(false)
    s.vx = 0
    s.vz = 28
    expect(shotThreatens(r.e, s)).toBe(false)
    // Homing on it: a collision course by definition
    s.homing = r.e
    s.vx = 3
    s.vz = -27
    expect(shotThreatens(r.e, s)).toBe(true)
  })

  it('hops a charged shot fired from beyond reach: off its line, and the lock slips', () => {
    const r = setup(9)
    awake(r)
    const { w, e } = r
    const x0 = e.x
    const s = chargedShot(r)
    tick(w, e)
    expect([e.state, e.attack]).toEqual(['act', 'dodge'])
    expect(s.homing).toBeNull()
    tick(w, e, 30)
    // Square to a shot flying down −z: it moved along x, clear of the shot's catch radius
    expect(Math.abs(e.x - x0)).toBeGreaterThan(1.5)
    expect(e.state === 'recover' || e.state === 'engage').toBe(true)
    expect(e.y).toBe(0)
  })

  it('cannot react when Flux is close: a charged shot from inside reach lands', () => {
    const r = setup(GOLEM_DODGE_MIN - 0.6)
    awake(r)
    chargedShot(r)
    tick(r.w, r.e, 3)
    expect(hopping(r.e)).toBe(false)
  })

  it('never dodges pellets, and never while it winds up a throw (committed)', () => {
    const r = setup(9)
    awake(r)
    chargedShot(r, 'pellet')
    tick(r.w, r.e, 3)
    expect(hopping(r.e)).toBe(false)
    const q = setup(9)
    awake(q)
    q.e.state = 'tele'
    q.e.attack = 'throw'
    q.e.teleDur = ENEMIES.golem.tele
    q.e.st = 0.05
    chargedShot(q)
    tick(q.w, q.e, 3)
    expect(q.e.attack).toBe('throw')
  })

  it('has a cooldown: the second charge right after a hop lands', () => {
    const r = setup(9)
    awake(r)
    chargedShot(r)
    tick(r.w, r.e, 1)
    expect(hopping(r.e)).toBe(true)
    tick(r.w, r.e, Math.ceil(0.7 / DT))
    r.e.cd = 999
    r.sys.clear()
    chargedShot(r)
    tick(r.w, r.e, 2)
    expect(hopping(r.e)).toBe(false)
    // Once the cooldown has run out it hops again
    r.sys.clear()
    tick(r.w, r.e, Math.ceil(GOLEM_DODGE_CD[1] / DT))
    chargedShot(r)
    tick(r.w, r.e, 1)
    expect(hopping(r.e)).toBe(true)
  })

  it('alternates its hop side (readable), and cannot hop when walled in', () => {
    const r = setup(9)
    awake(r)
    const sides: number[] = []
    for (let k = 0; k < 3; k++) {
      const x0 = r.e.x
      r.sys.clear()
      chargedShot(r)
      tick(r.w, r.e, 1)
      expect(hopping(r.e)).toBe(true)
      tick(r.w, r.e, Math.ceil((GOLEM_DODGE_CD[1] + 0.1) / DT))
      sides.push(Math.sign(r.e.x - x0))
      r.e.state = 'engage'
      r.e.cd = 999
      // Back in front of the shot line
      r.e.x = 60
    }
    expect(sides[0]).not.toBe(sides[1])
    expect(sides[1]).not.toBe(sides[2])
    // A 3 m corridor along the shot, the golem in its middle: no room either side
    const c = setup(9, field(20), 61.5)
    awake(c)
    chargedShot(c)
    tick(c.w, c.e, 2)
    expect(hopping(c.e)).toBe(false)
  })

  it('braces when a full charge is held on it from out of reach', () => {
    const r = setup(9)
    awake(r)
    r.w.combat.charging = true
    r.w.combat.charge = 1.3
    tick(r.w, r.e, 45)
    expect(r.e.mo.brace).toBeGreaterThan(0.8)
    r.w.combat.charging = false
    tick(r.w, r.e, 60)
    expect(r.e.mo.brace).toBeLessThan(0.05)
  })
})

describe('crate golem: its attacks', () => {
  it('throws two rocks (orange, on an arc that meets Flux) then lobs a boulder (red) at his feet', () => {
    const r = setup(9)
    awake(r)
    const { w, e } = r
    const kinds: string[] = []
    for (let n = 0; n < 3; n++) {
      e.state = 'engage'
      e.cd = 0
      tick(w, e, 1)
      kinds.push(e.attack)
      expect(e.teleRed).toBe(e.attack === 'lob')
      tick(w, e, Math.ceil(1.2 / DT))
    }
    expect(kinds).toEqual(['throw', 'throw', 'lob'])
    const fire = w.fireEnemyShot as unknown as ReturnType<typeof vi.fn>
    expect(fire).toHaveBeenCalledTimes(2)
    const [, ox, oy, oz, vx, vy, vz, speed, , blockable] = fire.mock.calls[0]!
    expect(blockable).toBe(true)
    // Launched up-and-out, it falls onto Flux's chest where he stood
    expect(vy).toBeGreaterThan(0)
    expect(Math.hypot(vx, vy, vz)).toBeCloseTo(speed, 6)
    const T = Math.hypot(w.player.x - ox, w.player.z - oz) / Math.hypot(vx, vz)
    expect(oy + vy * T - 0.5 * 10 * T * T).toBeCloseTo(1.36 - 0.45, 1)
    expect(w.lobShell).toHaveBeenCalledTimes(1)
  })

  it('its rock is a real stone on an arc, and a parried one goes back to it as a stone', () => {
    const r = setup(9)
    awake(r)
    r.sys.spawnEnemyShot(r.e, 60, 1.8, 30.2, 0, 0.3, 1, 13, 12, true)
    const s = r.sys.shots.find(x => x.active && x.owner === 'enemy')!
    expect(s.kind).toBe('rock')
    expect(s.rock?.visible).toBe(true)
    const vy0 = s.vy
    r.sys.update(DT)
    expect(s.vy).toBeLessThan(vy0)
    // Ends against the wall of the world: the stone goes back to the pool
    const stone = s.rock!
    s.life = 0.001
    r.sys.update(DT)
    expect(s.active).toBe(false)
    expect(stone.visible).toBe(false)
  })
})

// ─── Placement ──────────────────────────────────────────────────────────────

const job = (seed: number): Quest => ({
  id: `job_${seed}`, kind: 'job', template: 'purge', sector: 'scrapyard', seed, level: 2,
  target: null, count: 1, rooms: 9, reward: { xp: 0, bolts: 0, rarityBias: 0 }
} as Quest)

const objectsFor = (map: MapData, q: Quest): MissionObjects => {
  const scene = new Scene()
  const host = {
    scene, map, nav: createNav(map), theme: THEMES.scrapyard, propParent: () => scene,
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop,
    onCrateDeflect: noop, onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
  }
  return new MissionObjects(host as unknown as ObjectiveHost, q)
}

describe('crate golem: placement', () => {
  const table = SECTOR_BY_ID.scrapyard.encounters

  it('stands where crates stand — against a wall, in a combat or objective room — never on a real crate', () => {
    let placed = 0
    for (let seed = 1; seed <= 25; seed++) {
      const map = generateMap({ seed: seed * 7919, rooms: 9, boss: true })
      const golems = placeGolems(map, { ...table, golems: 1 }, 2)
      const objs = objectsFor(map, job(seed * 7919))
      for (const g of golems) {
        placed++
        const room = map.rooms[g.room]!
        expect(room.role === 'combat' || room.role === 'objective').toBe(true)
        // 0.55–0.85 m in from its wall cell's centre toward the wall: some wall
        // spot of the room lies right behind it
        const near = room.wallSpots.some(([i, j, yaw]) => {
          const bx = cellCenter(i) - Math.sin(yaw) * 0.7
          const bz = cellCenter(j) - Math.cos(yaw) * 0.7
          return Math.hypot(g.x - bx, g.z - bz) < 0.6
        })
        expect(near).toBe(true)
        for (const c of objs.crates) expect(Math.hypot(c.x - g.x, c.z - g.z)).toBeGreaterThan(1.2)
        for (const c of objs.chests) expect(Math.hypot(c.x - g.x, c.z - g.z)).toBeGreaterThan(1.2)
        expect(g.dormant).toBe(true)
      }
    }
    expect(placed).toBeGreaterThan(25)
  })

  it('is deterministic from the seed, and adding golems moved no other machine', async () => {
    const map = generateMap({ seed: 424242, rooms: 9, boss: true })
    const rich = { ...table, golems: 1 }
    const a = await spawnEncounters(map, rich, 2)
    const b = await spawnEncounters(map, rich, 2)
    const plain = await spawnEncounters(map, { ...table, golems: 0 }, 2)
    const sig = (es: Enemy[]) => es.map(e => [e.kind, e.x.toFixed(3), e.z.toFixed(3), e.elite])
    expect(sig(a)).toEqual(sig(b))
    expect(a.some(e => e.kind === 'golem')).toBe(true)
    // The rolled cast comes first, unchanged; the golems follow it
    expect(sig(a).slice(0, plain.length)).toEqual(sig(plain))
    expect(a.slice(plain.length).every(e => e.kind === 'golem')).toBe(true)
  })

  it('is rare in the sector tables, and needs its sector\'s crate to wear', () => {
    let rooms = 0
    let golems = 0
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateMap({ seed: seed * 104729, rooms: 9, boss: true })
      rooms += map.rooms.filter(r => r.role === 'combat' || r.role === 'objective').length
      golems += placeGolems(map, table, 2).length
    }
    // About `golems` of the rooms (a few are too small to hide one): ≈ one a mission
    expect(golems / rooms).toBeGreaterThan(0.05)
    expect(golems / rooms).toBeLessThan(0.25)
    const map = generateMap({ seed: 99, rooms: 9, boss: true })
    expect(placeGolems(map, { ...table, golems: 1, theme: undefined }, 2)).toEqual([])
  })

  it('never stands in the tutorial ("Wake-Up Call" has a scripted cast)', async () => {
    const q = tutorialQuest()
    const map = generateMap({ seed: q.seed, rooms: q.rooms, boss: true })
    const cast = await spawnTutorial(map, createNav(map), planWalkthrough(map), q.level)
    expect(cast.length).toBeGreaterThan(0)
    expect(cast.some(e => e.kind === 'golem')).toBe(false)
  })

  it('is never one of the mission\'s crates (the crate lesson and crate breaking see props only)', () => {
    const map = generateMap({ seed: 31337, rooms: 9, boss: true })
    const objs = objectsFor(map, job(31337))
    const golems = placeGolems(map, { ...table, golems: 1 }, 2)
    expect(golems.length).toBeGreaterThan(0)
    expect(objs.crates.every(c => c.kind === 'crate' || c.kind === 'barrel')).toBe(true)
    expect(objs.crates.some(c => golems.some(g => g.x === c.x && g.z === c.z))).toBe(false)
  })
})

describe('crate golem: objectives', () => {
  it('a purge counts it, and the trail leads to it only once no other machine is left', () => {
    const src: TargetSource = {
      objective: { template: 'purge', done: false }, quest: { target: null }, eliteId: -1, cores: [], chests: [], npc: null
    }
    const golem = createEnemy('golem', 1, 10, 10, 0, { theme: THEMES.scrapyard })
    const trooper = createEnemy('trooper', 1, 40, 40, 0)
    const map = {} as MapData
    // The golem is far nearer, but asleep: the trooper first
    expect(objectiveTarget(src, map, [golem, trooper], 11, 11)).toEqual({ x: 40, z: 40 })
    trooper.state = 'dead'
    expect(objectiveTarget(src, map, [golem, trooper], 11, 11)).toEqual({ x: 10, z: 10 })
  })
})

// #281: up close it no longer stands and waits for the next throw: it draws
// its lane in red and rams Flux down it — a melee blow a block softens, a
// slide dodges and a perfect block stuns.
describe('crate golem: the ram', () => {
  it('within GOLEM_RAM_R it marks its lane in red, then charges down it and lands a blockable melee blow', () => {
    const r = setup(3.5)
    awake(r)
    const spawn = vi.fn()
    ;(r.w as unknown as { markers: { spawn: typeof spawn } }).markers.spawn = spawn
    const hits: Array<{ blockable: boolean; kind: string }> = []
    ;(r.w as unknown as { hitPlayer: (e: Enemy, d: number, o: { blockable: boolean; kind: string }) => string }).hitPlayer = (_e, _d, o) => { hits.push(o); return 'hit' }
    r.e.cd = 0
    tick(r.w, r.e, 1)
    expect(r.e.attack).toBe('ram')
    expect(r.e.teleRed).toBe(true)
    // A dotted red lane along the floor, toward where Flux stood.
    expect(spawn.mock.calls.length).toBeGreaterThanOrEqual(4)
    const last = spawn.mock.calls.at(-1)!
    expect(last[1]).toBeGreaterThan(r.e.z + 2)
    tick(r.w, r.e, Math.ceil((GOLEM_RAM_TELE + GOLEM_RAM_TIME) / DT))
    expect(hits).toEqual([expect.objectContaining({ blockable: true, kind: 'melee' })])
  })

  it('a step out of the lane during the red line is the dodge', () => {
    const r = setup(3.5)
    awake(r)
    let hits = 0
    ;(r.w as unknown as { hitPlayer: () => string }).hitPlayer = () => { hits++; return 'hit' }
    r.e.cd = 0
    tick(r.w, r.e, 1)
    expect(r.e.attack).toBe('ram')
    r.w.player.x += 3
    tick(r.w, r.e, Math.ceil((GOLEM_RAM_TELE + GOLEM_RAM_TIME) / DT))
    expect(hits).toBe(0)
  })

  it('attacks sooner than it used to (a cooldown of 1.6 s, was 2.3)', () => {
    expect(ENEMIES.golem.cooldown).toBeLessThanOrEqual(1.6)
    expect(GOLEM_RAM_R).toBeLessThan(ENEMIES.golem.range[0])
  })
})
