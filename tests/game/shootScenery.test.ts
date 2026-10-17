// @vitest-environment jsdom
// Shooting the scenery (#169): the set dressing breaks to any hit for a bolt
// (its pipes excepted), shots fly on over the walls into the sky, and the
// flying taxis and parcel drones there go down to one hit, sinking out of it.
import { describe, expect, it, vi } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { SkyTargets, type PlaceFn } from '@/game/world/skyTargets'
import { buildCityscape } from '@/game/world/cityscape'
import { buildClimbLevel, dropRun } from '@/game/world/climbMesh'
import { generateMap, WALL_H } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import { planDecor } from '@/game/world/decor'
import { createNav } from '@/game/world/nav'
import { THEMES, type SectorId } from '@/game/world/themes'
import { decorHit, decorTargets, UNBREAKABLE } from '@/game/sim/decorBreak'

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
    expect(SKY_RUN).toBe(100)
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
