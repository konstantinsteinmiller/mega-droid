// @vitest-environment jsdom
// Shooting the scenery (#169): the set dressing breaks to any hit for a bolt
// (its pipes excepted), shots fly on over the walls into the sky, and the
// flying taxis and parcel drones there go down to one hit, sinking out of it.
import { describe, expect, it, vi } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { BANK_MAX, SkyTargets, type PlaceFn } from '@/game/world/skyTargets'
import { buildCityscape } from '@/game/world/cityscape'
import { buildClimbLevel, dropRun } from '@/game/world/climbMesh'
import { generateMap, WALL_H } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import { planDecor } from '@/game/world/decor'
import { createNav } from '@/game/world/nav'
import { THEMES, type SectorId } from '@/game/world/themes'
import { breakDecor, decorDrop, decorHit, decorTargets, DECOR_CAPSULE_CHANCE, DECOR_CHIP_CHANCE, DECOR_GEL_CHANCE, DECOR_ITEM_CHIP_CHANCE, DECOR_SKILL_CHIP_CHANCE, UNBREAKABLE, type DecorTarget } from '@/game/sim/decorBreak'
import { mulberry32 } from '@/game/world/rng'

it('the Cryo coolant pipe breaks like every other prop', () => {
  expect(UNBREAKABLE.has('coolantPipe')).toBe(false)
})
import { roofOf, SKY_RUN } from '@/game/sim/combat'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture() }
})

describe('sky traffic that can be shot down', () => {
  // One vehicle on a straight line along x at 40 m up.
  const line: PlaceFn = (_i, t, p, q, s) => {
    p.set(t * 10, 40, 0)
    q.identity()
    s.setScalar(1.5)
    return true
  }
  const setup = () => {
    const sky = new SkyTargets()
    const place = sky.wrap(1, 3, -6, line)
    const p = new Vector3()
    const q = new Quaternion()
    const s = new Vector3()
    const step = (t: number) => {
      sky.tick()
      return place(0, t, p, q, s)
    }
    return { sky, step, p, q, s }
  }

  it('only what this pass placed can be hit, and only near its body', () => {
    const { sky, step } = setup()
    const out = new Vector3()
    expect(sky.hit(0, 40, 0, 0.2, 0, out)).toBe(false)
    step(1)
    expect(sky.hit(10, 40, 30, 0.2, 1, out)).toBe(false)
    expect(sky.hit(11, 41, 1, 0.2, 1, out)).toBe(true)
    expect(out.toArray()).toEqual([10, 40, 0])
    expect(sky.downed).toBe(1)
    // Once down, it takes no second hit.
    expect(sky.hit(10, 40, 0, 0.2, 1, out)).toBe(false)
  })

  it('a charged shot passing near a vehicle draws it in to meet the shot, and it goes down (#181)', () => {
    const { sky, step, p } = setup()
    step(0)
    // From below, aimed 3 m wide of where it will be.
    const ox = 10, oy = 10, oz = 0
    const vx = 0, vy = 30, vz = 3
    expect(sky.lure(ox, oy, oz, vx, vy, vz, 100, 0)).toBe(true)
    let hit = false
    let last = p.clone()
    const shot = new Vector3()
    for (let t = 0; t <= 3 && !hit; t += 1 / 60) {
      step(t)
      // Never a jump: no more than a lane step plus the detour's pace.
      expect(p.distanceTo(last)).toBeLessThan(0.5)
      last = p.clone()
      shot.set(ox + vx * t, oy + vy * t, oz + vz * t)
      hit = sky.hit(shot.x, shot.y, shot.z, 0.4, t, new Vector3())
    }
    expect(hit).toBe(true)
    expect(sky.downed).toBe(1)
    // It crashes on down out of the sky.
    expect(step(12)).toBe(false)
  })

  it('a lured vehicle noses round to where it flies and banks into the turn, then levels on its lane (#181)', () => {
    const { sky, step, p, q } = setup()
    step(0)
    expect(sky.lure(10, 10, 0, 0, 30, 3, 100, 0)).toBe(true)
    const up = new Vector3()
    const fwd = new Vector3()
    let prev = new Vector3()
    let rolled = 0
    step(0)
    prev = p.clone()
    for (let t = 1 / 60; t < 0.9; t += 1 / 60) {
      step(t)
      const vx = p.x - prev.x, vz = p.z - prev.z
      prev = p.clone()
      // The model's nose (+z under the identity lane pose turned by yaw)
      // against its own level velocity: the lane flies along +x, so its
      // nose is the lane heading turned by the detour.
      fwd.set(1, 0, 0).applyQuaternion(q)
      const want = Math.atan2(vz, vx)
      const have = Math.atan2(fwd.z, fwd.x)
      expect(Math.abs(Math.atan2(Math.sin(want - have), Math.cos(want - have)))).toBeLessThan(0.12)
      up.set(0, 1, 0).applyQuaternion(q)
      const tilt = Math.acos(Math.min(1, up.y))
      expect(tilt).toBeLessThanOrEqual(BANK_MAX + 1e-3)
      rolled = Math.max(rolled, tilt)
      // Early on it swings toward +z: it banks that way (its top leans +z).
      if (t < 0.3 && tilt > 0.02) expect(up.z).toBeGreaterThan(0)
    }
    expect(rolled).toBeGreaterThan(0.05)
    // Long after, back on its lane: level and on the lane's heading.
    step(8)
    expect(p.z).toBeCloseTo(0, 5)
    up.set(0, 1, 0).applyQuaternion(q)
    expect(up.y).toBeCloseTo(1, 5)
    expect(Math.abs(q.w)).toBeCloseTo(1, 5)
  })

  it('a lure whose detour would clip a building is refused (#181)', () => {
    // A tower 3 m off the lane at the meeting point, toward the shot's side.
    const sky = new SkyTargets((x, _y, z, r) => Math.hypot(x - 10, z - 3) > r + 1)
    const place = sky.wrap(1, 3, -6, line)
    sky.tick()
    place(0, 0, new Vector3(), new Quaternion(), new Vector3())
    expect(sky.lure(10, 10, 0, 0, 30, 3, 100, 0)).toBe(false)
    // Clear of it, the same shot lures.
    const free = new SkyTargets()
    const fp = free.wrap(1, 3, -6, line)
    free.tick()
    fp(0, 0, new Vector3(), new Quaternion(), new Vector3())
    expect(free.lure(10, 10, 0, 0, 30, 3, 100, 0)).toBe(true)
  })

  it('a shot far from every vehicle steers none of them', () => {
    const { sky, step, p } = setup()
    step(0)
    expect(sky.lure(0, 10, 60, 0, 30, 0, 100, 0)).toBe(false)
    step(1)
    expect(p.toArray()).toEqual([10, 40, 0])
    // Nor one behind the shot, nor past its reach.
    expect(sky.lure(0, 50, 0, 0, 30, 0, 100, 1)).toBe(false)
    expect(sky.lure(10, -200, 0, 0, 30, 0, 100, 1)).toBe(false)
  })

  it('one vehicle per shot: a lured vehicle takes no second lure', () => {
    const { sky, step } = setup()
    step(0)
    expect(sky.lure(10, 10, 0, 0, 30, 3, 100, 0)).toBe(true)
    expect(sky.lure(10, 10, 0, 0, 30, 3, 100, 0)).toBe(false)
  })

  it('a downed vehicle sinks from where it was hit, spinning, and vanishes low down', () => {
    const { sky, step, p, q, s } = setup()
    step(2)
    sky.hit(20, 40, 0, 0.2, 2, new Vector3())
    expect(step(3)).toBe(true)
    expect(p.x).toBe(20)
    expect(p.y).toBeLessThan(40)
    expect(p.y).toBeGreaterThan(30)
    expect(s.x).toBe(1.5)
    expect(Math.abs(q.w)).toBeLessThan(1)
    let seen = 0
    sky.sinking(3, () => seen++)
    expect(seen).toBe(1)
    // Down out of the sky within ten seconds, and stays down.
    expect(step(12)).toBe(false)
    seen = 0
    sky.sinking(12, () => seen++)
    expect(seen).toBe(0)
  })

  it('the city: a shot on a taxi or a drone downs it; one in the open sky does nothing', async () => {
    const c = await buildCityscape(generateMap({ seed: 3, rooms: 8, boss: true }), THEMES.volt, undefined, 'full')
    let done = false
    let t = 5
    for (; t < 60 && !done; t += 0.25) {
      done = c.stream(0)
      c.update(t)
    }
    const out = new Vector3()
    expect(c.shotHits(0, 400, 0, 0.2, out)).toBe(false)
    // Every vehicle's centre, of every kind: only taxis and drones go down.
    const m = new Matrix4()
    const at = new Vector3()
    let hits = 0
    for (const f of c.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)) {
      for (let i = 0; i < f.count; i++) {
        f.getMatrixAt(i, m)
        at.setFromMatrixPosition(m)
        if (m.elements[0] === 0) continue
        if (c.shotHits(at.x, at.y, at.z, 0.2, out)) hits++
      }
    }
    // 12 taxis and 16 drones on the full tier.
    expect(hits).toBe(28)
    let sinking = 0
    c.update(t + 1)
    c.sinking(() => sinking++)
    expect(sinking).toBe(28)
    c.dispose()
  })
})

describe('shots over the walls', () => {
  it('the roof is the highest wall top of the level, at least a plain wall', () => {
    expect(roofOf(createNav(generateMap({ seed: 2, rooms: 6, boss: false })))).toBe(WALL_H)
    const m = generateStage('volt', 7)
    const top = Math.max(...m.terrain!.wallTop.filter(Number.isFinite))
    expect(roofOf(createNav(m))).toBe(Math.max(WALL_H, top))
    expect(SKY_RUN).toBe(260)
  })
})

describe('breakable set dressing', () => {
  const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'drill', 'neon', 'rotor', 'fortress']

  it('every prop but the pipes is a target, boxed round its own spot', () => {
    let n = 0
    for (const s of STAGES) {
      const plan = planDecor(generateStage(s, 7), s)
      const ts = decorTargets(plan.props)
      expect(ts.length).toBe(plan.props.filter(p => !UNBREAKABLE.has(p.kind)).length)
      for (const d of ts) {
        const p = plan.props[d.n]!
        expect(UNBREAKABLE.has(p.kind)).toBe(false)
        expect(d.x0).toBeLessThan(d.x1)
        expect(d.y0).toBeLessThan(d.y1)
        // Its origin sits in its box (a wall prop's, a hair off the wall), and it is no giant.
        expect(p.x).toBeGreaterThanOrEqual(d.x0 - 0.1)
        expect(p.x).toBeLessThanOrEqual(d.x1 + 0.1)
        expect(p.z).toBeGreaterThanOrEqual(d.z0 - 0.1)
        expect(p.z).toBeLessThanOrEqual(d.z1 + 0.1)
        expect(Math.max(d.x1 - d.x0, d.z1 - d.z0)).toBeLessThan(6)
        n++
      }
    }
    expect(n).toBeGreaterThan(10)
  })

  it('a shot step through a box hits it, one beside it misses, a broken one is passed by', () => {
    const plan = planDecor(generateStage('blaze', 7), 'blaze')
    const ts = decorTargets(plan.props)
    const d = ts[0]!
    const cx = (d.x0 + d.x1) / 2
    const cy = (d.y0 + d.y1) / 2
    const cz = (d.z0 + d.z1) / 2
    // A step from 1 m off its side through its middle.
    expect(decorHit(ts, d.x0 - 1, cy, cz, cx, cy, cz, 0.1)).toBe(d)
    // A point inside (a blast).
    expect(decorHit(ts, cx, cy, cz, cx, cy, cz, 0.1)).toBe(d)
    // Over its top.
    expect(decorHit(ts, d.x0 - 1, d.y1 + 1, cz, cx, d.y1 + 1, cz, 0.1)).not.toBe(d)
    d.broken = true
    expect(decorHit(ts, cx, cy, cz, cx, cy, cz, 0.1)).not.toBe(d)
  })

  it('a broken prop leaves its room meshes: its vertices drop far under the level', async () => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 1, 1], 3))
    dropRun(g, [1, 2])
    const pos = g.getAttribute('position')
    expect(pos.getY(0)).toBe(2)
    expect(pos.getY(1)).toBe(-500)
    expect(pos.getY(2)).toBe(-500)
    expect(pos.getY(3)).toBe(1)

    const map = generateStage('blaze', 7)
    const level = await buildClimbLevel(map, THEMES.blaze)
    const below = () => {
      let c = 0
      level.root.traverse((o) => {
        const geo = (o as { geometry?: BufferGeometry }).geometry
        const p = geo?.getAttribute('position')
        if (p) for (let i = 0; i < p.count; i++) if (p.getY(i) === -500) c++
      })
      return c
    }
    expect(below()).toBe(0)
    level.breakDecor!(0)
    expect(below()).toBeGreaterThan(0)
  })
})

describe('a broken prop\'s rare find', () => {
  const target = (): DecorTarget => ({ n: 0, kind: 'crate' as DecorTarget['kind'], x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1, navIdx: -1, broken: false })

  it('drops at its named rates over many seeded rolls, outcomes exclusive', () => {
    const rng = mulberry32(1234)
    const n = 200_000
    const got = { hp: 0, we: 0, gel: 0, skillChip: 0, chip: 0, none: 0 }
    for (let k = 0; k < n; k++) {
      const { broke, drop } = breakDecor(target(), rng, 0.5, 0.5)
      expect(broke).toBe(true)
      got[drop ?? 'none']++
    }
    expect(got.we).toBe(0) // a tie favours health
    expect(Math.abs(got.hp / n - DECOR_CAPSULE_CHANCE)).toBeLessThan(0.004)
    expect(Math.abs(got.gel / n - DECOR_GEL_CHANCE)).toBeLessThan(0.002)
    expect(Math.abs(got.skillChip / n - DECOR_SKILL_CHIP_CHANCE)).toBeLessThan(0.001)
    expect(Math.abs(got.chip / n - DECOR_ITEM_CHIP_CHANCE)).toBeLessThan(0.001)
    expect(Math.abs((got.skillChip + got.chip) / n - 0.01)).toBeLessThan(0.0015)
    expect(DECOR_CHIP_CHANCE).toBeCloseTo(0.01)
    expect(DECOR_SKILL_CHIP_CHANCE).toBeCloseTo(DECOR_ITEM_CHIP_CHANCE)
    expect(DECOR_CAPSULE_CHANCE).toBeGreaterThanOrEqual(0.08)
    expect(DECOR_CAPSULE_CHANCE).toBeLessThanOrEqual(0.1)
  })

  it('gives the capsule the player is shorter of', () => {
    expect(decorDrop(0, 0.9, 0.2)).toBe('we')
    expect(decorDrop(0, 0.2, 0.9)).toBe('hp')
    expect(decorDrop(0.999, 0.2, 0.9)).toBeNull()
  })

  it('rolls once: a broken prop neither breaks again nor rolls', () => {
    const d = target()
    const rng = vi.fn(() => 0)
    expect(breakDecor(d, rng, 1, 1)).toEqual({ broke: true, drop: 'hp' })
    expect(breakDecor(d, rng, 1, 1)).toEqual({ broke: false, drop: null })
    expect(rng).toHaveBeenCalledTimes(1)
    // And a shot no longer finds it.
    expect(decorHit([d], 0.5, 0.5, -2, 0.5, 0.5, 2, 0.1)).toBeNull()
  })
})

it('a found Skill Chip adds one free chip to socket', async () => {
  const { profile, chipsAvailable, grantSkillChip } = await import('@/game/state/profile')
  const before = chipsAvailable()
  const had = profile.hero.bonusChips ?? 0
  grantSkillChip()
  expect(chipsAvailable()).toBe(before + 1)
  profile.hero.bonusChips = had
})
