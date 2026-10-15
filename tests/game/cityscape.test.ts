// The city round every mission (`world/cityscape.ts`): a far-future skyline
// and the traffic in its sky. What matters beyond the look is where it all
// is: the city stands clear of the level, and no vehicle ever flies over the
// level or close over its walls — the player's sky stays open above them. And
// it is the same city every time for the same map (a resumed mission).

import { describe, expect, it } from 'vitest'
import { Color, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three'
import { generateMap, CELL, WALL_H } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { THEMES } from '@/game/world/themes'
import { generateStage } from '@/game/world/stages'
import { buildCityscape, trafficClearance } from '@/game/world/cityscape'

const mapFor = (seed: number) => generateMap({ seed, rooms: 8, boss: true })

describe('the cityscape', () => {
  it('is the same city for the same map', async () => {
    const count = async (seed: number) => {
      const c = await buildCityscape(mapFor(seed), THEMES.volt, undefined, 'full')
      c.stream(Infinity)
      let n = 0
      c.root.traverse((o) => { if ((o as Mesh).geometry) n += (o as Mesh).geometry.attributes.position!.count })
      c.dispose()
      return n
    }
    expect(await count(11)).toBe(await count(11))
    expect(await count(11)).not.toBe(await count(12))
  })

  it('over open sky its ground under the level is the sea of clouds, not a dark floor', async () => {
    // Sky Docks playtest 2026-10-16: a dark ground showed through every gap
    // between the docks and the fog-pale walls read as glass over it.
    for (const s of ['gale', 'neon', 'rotor'] as const) {
      const map = generateStage(s, 1)
      expect(map.terrain?.clouds, s).toBe(true)
      const c = await buildCityscape(map, THEMES[s], undefined, 'full')
      const body = c.root.children[0] as Mesh
      const pos = body.geometry.attributes.position!
      const col = body.geometry.attributes.color!
      const cx = map.w * CELL / 2
      const cz = map.h * CELL / 2
      // The pits' own mist colour (`climbMesh.ts`): the fog, lifted toward white.
      const mist = new Color(THEMES[s].fog).lerp(new Color('#ffffff'), 0.35)
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0 || Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) > 60) continue
        n++
        const d = Math.abs(col.getX(i) - mist.r) + Math.abs(col.getY(i) - mist.g) + Math.abs(col.getZ(i) - mist.b)
        expect(d, s).toBeLessThan(0.15)
      }
      expect(n, s).toBeGreaterThan(0)
      c.dispose()
    }
  })

  it('stands clear of the level: nothing above the ground within 20 m of its reach', async () => {
    for (const seed of [1, 2, 3]) {
      const map = mapFor(seed)
      const c = await buildCityscape(map, THEMES.scrapyard, undefined, 'full')
      c.stream(Infinity)
      const cx = map.w * CELL / 2
      const cz = map.h * CELL / 2
      const { reach } = trafficClearance(map)
      const body = c.root.children[0] as Mesh
      const pos = body.geometry.attributes.position!
      let nearest = Infinity
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < 0.5) continue
        nearest = Math.min(nearest, Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz))
      }
      expect(nearest).toBeGreaterThan(reach + 20)
      c.dispose()
    }
  })

  it('traffic never flies over the level, and stays well above its walls', async () => {
    const maps = [mapFor(5), generateMap({ seed: 9, rooms: 10, boss: false }), generateClimb(4)]
    for (const map of maps) {
      const c = await buildCityscape(map, THEMES.gale, undefined, 'full')
      c.stream(Infinity)
      const cx = map.w * CELL / 2
      const cz = map.h * CELL / 2
      const { reach, nearest } = trafficClearance(map)
      const top = map.terrain ? Math.max(WALL_H, ...map.terrain.wallTop) : WALL_H
      expect(nearest - reach).toBeGreaterThanOrEqual(40)
      const fleets = c.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
      expect(fleets.length).toBeGreaterThan(8)
      const m = new Matrix4()
      const p = new Vector3()
      let seen = 0
      for (let t = 0; t < 240; t += 0.75) {
        c.update(t)
        for (const f of fleets) {
          for (let i = 0; i < f.count; i++) {
            f.getMatrixAt(i, m)
            if (m.elements[0] === 0 && m.elements[5] === 0) continue // parked (a rocket between launches)
            p.setFromMatrixPosition(m)
            seen++
            const d = Math.hypot(p.x - cx, p.z - cz)
            expect(d).toBeGreaterThan(reach + 30)
            // Anything near the level flies high over its walls (the rockets
            // stand on their pad, far out at the spaceport).
            if (d < reach + 90) expect(p.y).toBeGreaterThan(top + 15)
          }
        }
      }
      expect(seen).toBeGreaterThan(1000)
      c.dispose()
    }
  })

  it('a rocket lifts off from the spaceport now and then', async () => {
    const c = await buildCityscape(mapFor(7), THEMES.cryo, undefined, 'full')
    c.stream(Infinity)
    const fleets = c.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
    const m = new Matrix4()
    const heights = new Set<number>()
    for (let t = 0; t < 80; t += 1) {
      c.update(t)
      for (const f of fleets) {
        for (let i = 0; i < f.count; i++) {
          f.getMatrixAt(i, m)
          const y = m.elements[13]!
          if (m.elements[0] !== 0 && y > 150) heights.add(Math.round(y))
        }
      }
    }
    // Something climbs past the city's height during those 80 s.
    expect(heights.size).toBeGreaterThan(0)
    c.dispose()
  })

  it('streams: only the near city is built up front; traffic joins once streaming starts', async () => {
    const c = await buildCityscape(mapFor(3), THEMES.volt, undefined, 'full')
    const verts = () => {
      let n = 0
      c.root.traverse((o) => { if (o instanceof Mesh && !(o instanceof InstancedMesh)) n += o.geometry.attributes.position!.count })
      return n
    }
    const fleets = () => c.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
    const flying = () => fleets().reduce((a, f) => a + f.count, 0)
    const before = verts()
    c.update(5)
    expect(flying()).toBe(0)
    // One small job per call, never the lot.
    c.stream(0)
    expect(verts()).toBe(before)
    let done = false
    for (let t = 5; t < 60 && !done; t += 0.25) {
      done = c.stream(0)
      c.update(t)
    }
    expect(done).toBe(true)
    expect(verts()).toBeGreaterThan(before * 1.2)
    expect(flying()).toBeGreaterThan(20)
    c.dispose()
  })

  it('one draw call per vehicle kind, lights included; the low tier keeps four', async () => {
    const kinds = async (q: 'low' | 'full') => {
      const c = await buildCityscape(mapFor(4), THEMES.neon, undefined, q)
      c.stream(Infinity)
      const n = c.root.children.filter(o => o instanceof InstancedMesh).length
      c.dispose()
      return n
    }
    // Rockets, smoke, taxis, quadcopters, cruisers, their light bars, haulers,
    // the blimp and the freighter.
    expect(await kinds('full')).toBe(9)
    // Rockets, taxis, the blimp and the freighter (a budget phone ran at 10–15 fps).
    expect(await kinds('low')).toBe(4)
  })

  it('low tier: the traffic moves at 30 Hz, not every frame', async () => {
    const c = await buildCityscape(mapFor(2), THEMES.volt, undefined, 'low')
    c.stream(Infinity)
    c.update(20)
    const taxi = c.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh).find(f => f.count > 1)!
    const m = new Matrix4()
    taxi.getMatrixAt(0, m)
    const before = m.elements[12]
    c.update(20 + 1 / 120)
    taxi.getMatrixAt(0, m)
    expect(m.elements[12]).toBe(before)
    c.update(20 + 1 / 20)
    taxi.getMatrixAt(0, m)
    expect(m.elements[12]).not.toBe(before)
    c.dispose()
  })

  it('low quality: far fewer buildings, landmarks and vehicles', async () => {
    const size = async (q: 'low' | 'full') => {
      const c = await buildCityscape(mapFor(8), THEMES.blaze, undefined, q)
      c.stream(Infinity)
      c.update(120)
      let verts = 0
      let cars = 0
      c.root.traverse((o) => {
        if (o instanceof InstancedMesh) cars += o.count
        else if (o instanceof Mesh) verts += o.geometry.attributes.position!.count
      })
      c.dispose()
      return { verts, cars }
    }
    const full = await size('full')
    const low = await size('low')
    expect(low.verts).toBeLessThan(full.verts * 0.6)
    expect(low.cars).toBeLessThan(full.cars * 0.65)
  })
})
