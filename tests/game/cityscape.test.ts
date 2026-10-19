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
import { buildCityscape, cloudPalette, cloudSea, CLOUD_DRIFT, CLOUD_SINK, trafficClearance } from '@/game/world/cityscape'
import { BoxGeometry } from 'three'
import { coplanarPairs } from './coplanar'

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
      // The cloud sea, its rolling surface too, stays down by the level:
      // nothing above the ground within 20 m of its reach.
      const { reach } = trafficClearance(map)
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) >= 0.5) expect(Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz), s).toBeGreaterThan(reach + 20)
      }
      c.dispose()
    }
  })

  it('over open sky the towers rise out of a cloud sea: no extra draw call, a modest vertex bill', async () => {
    const map = generateStage('gale', 1)
    const shape = async (clouds: boolean, q: 'full' | 'low') => {
      const m = { ...map, terrain: { ...map.terrain!, clouds } }
      const c = await buildCityscape(m, THEMES.gale, undefined, q)
      c.stream(Infinity)
      let meshes = 0
      let all = 0
      const body = (c.root.children[0] as Mesh).geometry.attributes.position!.count
      c.root.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        meshes++
        all += m.geometry.attributes.position!.count * ((m as unknown as { count?: number }).count ?? 1)
      })
      c.dispose()
      return { meshes, body, all }
    }
    for (const q of ['full', 'low'] as const) {
      const sky = await shape(true, q)
      const flat = await shape(false, q)
      expect(sky.meshes, q).toBe(flat.meshes)
      // The whole sea (rolling surface, billows, banks, horizon ridge,
      // islands) in the body mesh...
      const added = sky.body - flat.body
      expect(added, q).toBeGreaterThan(q === 'low' ? 2500 : 9000)
      expect(added, q).toBeLessThan(q === 'low' ? 7000 : 18000)
      // ...and none streamed in with the far band or the landmarks: no cloud
      // hugs a tower's foot any more.
      expect(sky.all - flat.all - added, q).toBe(0)
    }
  })

  it('its clouds never lie in the ground plane or in one another', () => {
    let s = 7
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
    const feet = Array.from({ length: 30 }, (_, i) => ({ x: Math.cos(i) * 110, z: Math.sin(i) * 110, r: 6 + (i % 5) }))
    const marks = [{ x: 180, z: 0, r: 36 }, { x: -170, z: 40, r: 34 }]
    const parts = cloudSea(r, new Color('#cfe6ff'), 0, 0, 50, [...feet, ...marks], false)
    // The cloud-sea ground: a slab from y = -0.6 to -0.5.
    const ground = new BoxGeometry(480, 0.1, 480).translate(0, -0.55, 0)
    expect(coplanarPairs([ground, ...parts], 0.05)).toEqual([])
    for (const g of parts) {
      const pos = g.attributes.position!
      let lo = Infinity
      for (let i = 0; i < pos.count; i++) lo = Math.min(lo, pos.getY(i))
      // Each puff either sinks well under the plane or floats clear of it.
      expect(lo < CLOUD_SINK + 0.5 || lo > 1).toBe(true)
    }
  })

  it('no cloud vertex, at either end of its drift, ever lies inside a tower or landmark footprint', () => {
    for (const low of [false, true]) {
      let s = 11
      const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
      // A dense skyline: towers in the gaps' way, landmarks on the horizon ridge.
      const keepOut = [
        ...Array.from({ length: 90 }, (_, i) => ({ x: Math.cos(i * 0.7) * (95 + (i % 5) * 25), z: Math.sin(i * 0.7) * (95 + (i % 5) * 25), r: 8 + (i % 6) * 3 })),
        { x: 200, z: 0, r: 40 }, { x: -190, z: 60, r: 34 }, { x: 30, z: -205, r: 36 }
      ]
      const parts = cloudSea(r, new Color('#cfe6ff'), 0, 0, 50, keepOut, low)
      let islands = 0
      let surface = 0
      let inside = 0
      for (const g of parts) {
        const pos = g.attributes.position!
        const aw = g.attributes.aW!
        // Every puff is a cloud to the shader (aW.y < 0): never a window wall.
        for (let i = 0; i < aw.count; i++) expect(aw.getY(i)).toBeLessThan(-0.5)
        // A drifting puff (aW.y < -1.5) sways up to CLOUD_DRIFT each way in x and z.
        const sway = aw.getY(0) < -1.5 ? CLOUD_DRIFT : 0
        let lo = Infinity
        for (let i = 0; i < pos.count; i++) {
          lo = Math.min(lo, pos.getY(i))
          for (const k of keepOut) {
            for (const dx of [-sway, sway]) {
              for (const dz of [-sway, sway]) {
                if (Math.hypot(pos.getX(i) + dx - k.x, pos.getZ(i) + dz - k.z) <= k.r) inside++
              }
            }
          }
        }
        if (lo > 1) islands++
        else surface++
      }
      expect(inside).toBe(0)
      expect(inside).toBe(0)
      // Still a sea: plenty on the surface, and islands floating over it.
      expect(islands).toBeGreaterThan(0)
      expect(surface).toBeGreaterThan(low ? 15 : 50)
    }
  })

  it('a rolling surface covers the sea to the horizon, hugging every footprint it does not enter', () => {
    for (const low of [false, true]) {
      let s = 5
      const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
      const keepOut = Array.from({ length: 36 }, (_, i) => ({ x: Math.cos(i * 2.4) * (95 + (i % 4) * 35), z: Math.sin(i * 2.4) * (95 + (i % 4) * 35), r: 6 + (i % 5) * 3 }))
      const parts = cloudSea(r, new Color('#cfe6ff'), 0, 0, 50, keepOut, low)
      const g = parts[parts.length - 1]!
      const pos = g.attributes.position!
      let far = 0
      let hi = -Infinity
      let bad = 0
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const z = pos.getZ(i)
        hi = Math.max(hi, y)
        // Static, nowhere inside a footprint, and never up into the level's reach.
        if (g.attributes.aW!.getY(i) !== -1) bad++
        for (const k of keepOut) if (Math.hypot(x - k.x, z - k.z) <= k.r) bad++
        const d = Math.hypot(x, z)
        if (d <= 50 + 20) bad++
        // A flat facet lies clear of the ground plane's top (y = -0.5), above
        // it or dipped under it: never a few cm off it.
        if (i % 3 === 0) {
          const ys = [y, pos.getY(i + 1), pos.getY(i + 2)]
          if (Math.max(...ys) - Math.min(...ys) < 0.05 && Math.abs(y + 0.5) <= 0.5) bad++
        }
        if (d > 230) far++
      }
      expect(bad).toBe(0)
      // It swells over the plane and reaches the horizon ridge all round.
      expect(hi).toBeGreaterThan(2)
      expect(far).toBeGreaterThan(low ? 60 : 150)
      // Every tower stands in a trough of it, ringed all round (within about
      // two grid cells), that runs under the ground plane at its rim, so the
      // cut's edge hides under the plane. (Rings counted on footprints
      // standing alone; where two overlap, the trough runs round both.)
      let high = 0
      let lone = 0
      for (const k of keepOut) {
        const alone = keepOut.every(o => o === k || Math.hypot(o.x - k.x, o.z - k.z) > o.r + k.r + 12)
        const sides = new Set<number>()
        for (let i = 0; i < pos.count; i++) {
          const dx = pos.getX(i) - k.x
          const dz = pos.getZ(i) - k.z
          const e = Math.hypot(dx, dz) - k.r
          if (e < 1.5 && pos.getY(i) >= -0.5) high++
          if (e < 6 + 0.15 * Math.hypot(k.x, k.z)) sides.add(Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 4) % 4)
        }
        if (alone) { lone++; expect(sides.size, `${k.x},${k.z}`).toBe(4) }
      }
      expect(high).toBe(0)
      expect(lone).toBeGreaterThan(3)
      // Faceted, facing up, and in stepped tones (crests, flanks, troughs).
      const tones = new Set<string>()
      for (let i = 0; i < pos.count; i += 3) {
        expect(g.attributes.normal!.getY(i)).toBeGreaterThan(0)
        const col = g.attributes.color!
        tones.add(`${col.getX(i).toFixed(3)},${col.getZ(i).toFixed(3)}`)
      }
      expect(tones.size).toBeGreaterThanOrEqual(4)
    }
  })

  it('each sky sector has its own cloud palette, matching its sky', () => {
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    const gale = cloudPalette('gale', new Color(THEMES.gale.fog))
    const neon = cloudPalette('neon', new Color(THEMES.neon.fog))
    const rotor = cloudPalette('rotor', new Color(THEMES.rotor.fog))
    for (const p of [gale, rotor]) expect(lum(p.top)).toBeGreaterThan(lum(p.under) + 0.2)
    // (A moodier night: muted crests, still well clear of the troughs.)
    expect(lum(neon.top)).toBeGreaterThan(lum(neon.under) + 0.15)
    // Gale: white tops, cool blue bellies.
    expect(gale.top.getHexString()).toBe('ffffff')
    expect(gale.under.b - gale.under.r).toBeGreaterThan(0.1)
    expect(gale.glow).toHaveLength(0)
    expect(gale.haze).toBe(0.3)
    // Neon: a moodier moonlit night — muted lavender-grey crests (blue over
    // green, well short of white), deep indigo troughs, a few bellies lit
    // magenta or cyan by the city, the flat sea past the level a night
    // indigo, not the pits' grey mist.
    expect(neon.top.b).toBeGreaterThan(neon.top.g)
    expect(neon.top.r).toBeGreaterThan(neon.top.g)
    expect(lum(neon.top)).toBeLessThan(0.45)
    expect(lum(neon.top)).toBeGreaterThan(lum(new Color(THEMES.neon.skyBottom)))
    expect(neon.under.b).toBeGreaterThan(neon.under.g * 3)
    expect(neon.under.r).toBeGreaterThan(neon.under.g)
    expect(lum(neon.under)).toBeLessThan(0.04)
    expect(neon.glow.some(c => c.r > c.b && c.r > c.g)).toBe(true)
    expect(neon.glow.some(c => c.b > c.r && c.g > c.r)).toBe(true)
    const neonMist = new Color(THEMES.neon.fog).lerp(new Color('#ffffff'), 0.35)
    expect(lum(neon.rim)).toBeLessThan(lum(neonMist) - 0.05)
    expect(neon.rim.b).toBeGreaterThan(neon.rim.g * 2)
    // Rotor: a warm dusk with contrast — sunlit crests (red over blue),
    // dusky rose-mauve troughs far darker than the warm haze, and less
    // of that haze on the clouds.
    const rotorFog = new Color(THEMES.rotor.fog)
    expect(rotor.top.r).toBeGreaterThan(rotor.top.b)
    expect(lum(rotor.top)).toBeGreaterThan(lum(rotorFog))
    expect(rotor.under.r).toBeGreaterThan(rotor.under.g)
    expect(rotor.under.b).toBeGreaterThan(rotor.under.g)
    expect(lum(rotor.under)).toBeLessThan(lum(rotorFog) * 0.25)
    expect(rotor.haze).toBeLessThan(gale.haze)
    expect(rotor.sink).toBeGreaterThan(gale.sink)
  })

  it('its clouds are white on top and a cool blue underneath', () => {
    let s = 3
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
    const [g] = cloudSea(r, new Color('#e8eef8'), 0, 0, 50, [], false)
    const col = g!.attributes.color!
    const nor = g!.attributes.normal!
    let top = 0
    let under = 0
    for (let i = 0; i < col.count; i++) {
      const blue = col.getZ(i) - col.getX(i)
      if (nor.getY(i) > 0.55) { expect(col.getX(i)).toBeCloseTo(1, 2); top++ }
      else if (nor.getY(i) < -0.1) { expect(blue).toBeGreaterThan(0.1); under++ }
    }
    expect(top).toBeGreaterThan(0)
    expect(under).toBeGreaterThan(0)
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

  it('no route ever clips a building or a landmark, a lured detour included', async () => {
    // A freighter flew through a skyline tower (playtest 2026-10-18): every
    // route is cleared of the skyline when it is built, and a lure (#181)
    // that would steer a vehicle into one is refused.
    const MARGIN = 1
    const maps = [
      mapFor(5), mapFor(11), generateMap({ seed: 9, rooms: 10, boss: false }), generateClimb(4),
      ...(['scrapyard', 'gale', 'neon', 'rotor', 'fortress'] as const).map(s => generateStage(s, 1))
    ]
    const themes = Object.values(THEMES)
    for (const [mi, map] of maps.entries()) {
      for (const q of ['full', 'low'] as const) {
        const c = await buildCityscape(map, themes[mi % themes.length]!, undefined, q)
        c.stream(Infinity)
        const cx = map.w * CELL / 2
        const cz = map.h * CELL / 2
        let seen = 0
        let lured = 0
        const check = (t: number) => c.probe(t, (x, y, z, r, below) => {
          seen++
          for (const o of c.obstacles) {
            if (y - below >= o.top + MARGIN) continue
            const d = Math.hypot(x - o.x, z - o.z)
            if (d < o.r + r + MARGIN) {
              throw new Error(`map ${mi} ${q} t=${t.toFixed(2)}: vehicle at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)} r ${r} in a building at ${o.x.toFixed(1)},${o.z.toFixed(1)} r ${o.r.toFixed(1)} top ${o.top}`)
            }
          }
        })
        for (let t = 0; t < 400; t += 0.2) {
          c.update(t)
          // Now and then a charged shot from the level up past the traffic,
          // at a random bearing: whatever it lures flies its detour checked.
          if (Math.round(t * 5) % 10 === 0) {
            const at: number[][] = []
            c.probe(t, (x, y, z, r) => { if (r < 5) at.push([x, y, z]) })
            const v = at[Math.round(t) % Math.max(1, at.length)]
            // From the level's side, aimed a few metres wide of it.
            if (v) {
              const [x, y, z] = v as [number, number, number]
              const dx = x - cx, dz = z - cz
              const d = Math.hypot(dx, dz)
              const sx = cx + dx / d * (d - 60), sz = cz + dz / d * (d - 60), sy = y - 40
              const tx = x + 4, ty = y, tz = z - 3
              const l = Math.hypot(tx - sx, ty - sy, tz - sz)
              if (c.lure(sx, sy, sz, (tx - sx) / l * 40, (ty - sy) / l * 40, (tz - sz) / l * 40, 150)) lured++
            }
          }
          check(t)
        }
        expect(seen).toBeGreaterThan(2000)
        if (q === 'full') expect(lured).toBeGreaterThan(0)
        c.dispose()
      }
    }
  }, 120_000)

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
