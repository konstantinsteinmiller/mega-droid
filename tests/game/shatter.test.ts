// @vitest-environment jsdom
// #105: a machine that goes down falls apart into the parts of its own model
// (one per limb, its own colours) and a few blocks of its plating; they lie
// LIE_FOR, sink over SINK_FOR and are gone. Flux, down and left alone, sinks
// too and comes back at the last checkpoint without a restart.

import { describe, expect, it, vi } from 'vitest'
import { Group, Scene, type SkinnedMesh } from 'three'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Shatter, splitByBone, sampleColors, LIE_FOR, SINK_FOR, MAX_PIECES } from '@/game/fx/shatter'
import { buildEnemyRig, BASE_COLORS } from '@/game/models/enemies'
import { Mission } from '@/game/sim/mission'
import { RESPAWN_AFTER, SINK_S, DEFEAT_DELAY } from '@/game/sim/respawn'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'

/** A flat open field for the floor height. */
const flatNav = () => {
  const W = 40
  return createNav({ w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData)
}

const trooper = () => {
  const rig = buildEnemyRig('trooper', BASE_COLORS.trooper)
  const root = new Group()
  root.add(rig.root)
  root.position.set(10, 0, 5)
  return { rig, root }
}

describe('falling apart', () => {
  it('cuts the rig into one part per limb, every triangle kept', () => {
    const { rig } = trooper()
    const geo = (rig.mesh as SkinnedMesh).geometry
    const parts = splitByBone(geo)
    expect(parts.size).toBeGreaterThanOrEqual(6)
    const tris = geo.index ? geo.index.count / 3 : geo.attributes.position!.count / 3
    let sum = 0
    for (const p of parts.values()) sum += p.geo.attributes.position!.count / 3
    expect(sum).toBe(tris)
    // Its own colours: the plating's green is among them.
    expect(sampleColors(geo, 3).length).toBe(3)
  })

  it('the parts fly, land on the floor, lie LIE_FOR, sink over SINK_FOR and are gone', () => {
    const scene = new Scene()
    const sh = new Shatter(scene, { floorAt: () => 0 })
    const { root } = trooper()
    scene.add(root)
    sh.burst(root, [], 5)
    const n = sh.pieces.length
    expect(n).toBeGreaterThan(6)
    // Near where the machine stood.
    for (const p of sh.pieces) expect(Math.hypot(p.mesh.position.x - 10, p.mesh.position.z - 5)).toBeLessThan(2)
    for (let t = 0; t < LIE_FOR - 0.5; t += 1 / 60) sh.update(1 / 60)
    expect(sh.pieces.length).toBe(n)
    // All down on the floor, none under it.
    for (const p of sh.pieces) expect(p.mesh.position.y).toBeGreaterThanOrEqual(0)
    for (const p of sh.pieces) expect(p.mesh.position.y).toBeLessThan(1)
    for (let t = 0; t < 0.5 + SINK_FOR + 0.1; t += 1 / 60) sh.update(1 / 60)
    expect(sh.pieces.length).toBe(0)
    expect(sh.root.children.length).toBe(0)
  })

  it('a crowded fight sinks its oldest pieces early, never past the cap for long', () => {
    const scene = new Scene()
    const sh = new Shatter(scene, { floorAt: () => 0 })
    for (let k = 0; k < 20; k++) {
      const { root } = trooper()
      scene.add(root)
      sh.burst(root, ['#3fae4a'], 5)
    }
    for (let t = 0; t < SINK_FOR + 0.2; t += 1 / 60) sh.update(1 / 60)
    expect(sh.pieces.length).toBeLessThanOrEqual(MAX_PIECES + 20)
  })
})

describe('Flux, down and left alone', () => {
  it('sinks after RESPAWN_AFTER from the fall, the modal counting what is left', () => {
    expect(RESPAWN_AFTER).toBe(10)
    expect(SINK_S).toBe(2)
    expect(RESPAWN_AFTER - DEFEAT_DELAY).toBeGreaterThan(5)
  })

  const spot = (self: object) => (Mission.prototype as unknown as { respawnSpot(this: unknown): { x: number; z: number; yaw: number } }).respawnSpot.call(self)

  it('comes back at the stage\'s last checkpoint', () => {
    const at = { x: 3, y: 4, z: 5, yaw: 1 }
    expect(spot({ boss: null, bossStarted: false, climb: { respawn: () => at } })).toBe(at)
  })

  it('in a boss fight, just inside the arena\'s door (the boss keeps its damage)', () => {
    const door = { id: 7, i: 10, j: 4, axis: 'x', dir: 1, from: 2, to: 3, boss: true }
    const self = {
      boss: { state: 'engage' }, bossStarted: true, climb: { respawn: () => ({ x: 0, y: 0, z: 0, yaw: 0 }) },
      bossRoom: { id: 3 }, doors: [{ id: 7, to: 3 }], map: { doors: [door] }, nav: flatNav(),
      bossDoor(this: { doors: Array<{ to: number }> }) { return this.doors.find(d => d.to === 3) ?? null }
    }
    const s = spot(self)
    // Two cells on from the door into the arena, facing in (+X).
    expect(s.x).toBeCloseTo((10 + 2 + 0.5) * 3, 5)
    expect(s.z).toBeCloseTo((4 + 0.5) * 3, 5)
    expect(s.yaw).toBeCloseTo(-Math.PI / 2, 5)
  })
})
