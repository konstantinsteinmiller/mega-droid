// @vitest-environment jsdom
// Doors and draw calls. A budget phone (Mali-G52, 2026-10-07) ran a mission
// at 10–15 fps, and the doors were half of every frame's draw calls: they
// stand at the scene root, so the doors of rooms hidden behind the walls were
// drawn anyway (8 doors × 7 calls in the tutorial's first room), and a plain
// door's two halves were six calls of their own.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Mesh, PerspectiveCamera } from 'three'
import { buildDoor } from '@/game/models/props'
import { THEMES } from '@/game/world/themes'
import { CELL } from '@/game/world/levelGen'
import { Mission } from '@/game/sim/mission'
import { hud } from '@/game/state/hud'

const meshes = (g: Group): Mesh[] => {
  const out: Mesh[] = []
  g.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh) })
  return out
}

describe('a plain door', () => {
  it('is four draw calls: both halves in one body, outline and glow, and its lamp', () => {
    const d = buildDoor(THEMES.scrapyard, false)
    expect(meshes(d.root).length).toBe(4)
    expect(d.panels.length).toBe(1)
  })

  it('parts its halves with a morph target: each slides away from the middle', () => {
    const d = buildDoor(THEMES.scrapyard, false)
    const slid = meshes(d.panels[0]!)
    expect(slid.length).toBe(3)
    for (const m of slid) {
      const pos = m.geometry.attributes.position!
      const delta = m.geometry.morphAttributes.position![0]!
      for (let i = 0; i < pos.count; i++) {
        expect(Math.sign(delta.getX(i))).toBe(Math.sign(pos.getX(i)))
        expect(Math.abs(delta.getX(i))).toBeCloseTo(0.35)
      }
    }
    d.part(0.6)
    for (const m of slid) expect(m.morphTargetInfluences![0]).toBeCloseTo(0.6)
  })

  it('the boss door keeps its shutter (and parts nothing)', () => {
    const d = buildDoor(THEMES.scrapyard, true)
    expect(d.panels.length).toBe(1)
    expect(() => d.part(1)).not.toThrow()
  })
})

describe('portal culling takes the doors along', () => {
  it('a door is drawn only while one of its two rooms is', () => {
    // Three rooms in a row along x, 4 cells each: 0 | 1 | 2, doors 0–1 and 1–2.
    const W = 12
    const owner = new Int16Array(W * 1)
    for (let i = 0; i < W; i++) owner[i] = Math.floor(i / 4)
    const rooms = [new Group(), new Group(), new Group()]
    const door = (from: number, to: number, x: number) => ({
      mesh: buildDoor(THEMES.scrapyard, false), from, to, x, z: CELL / 2, y: 0, open: 0, opening: false
    })
    const doors = [door(0, 1, 4 * CELL), door(1, 2, 8 * CELL)]
    const camera = new PerspectiveCamera(70, 16 / 9, 0.1, 1000)
    camera.position.set(1.5 * CELL, 1.6, CELL / 2)
    camera.lookAt(20 * CELL, 1.6, CELL / 2)
    const fake = {
      player: { x: 1.5 * CELL, z: CELL / 2 },
      theme: { fogFar: 200 },
      level: { rooms, owner, bounds: rooms.map((_, i) => ({ x: (i * 4 + 2) * CELL, z: 0, r: 2 * CELL })) },
      roomVis: new Uint8Array(3),
      sight: [[], [], []],
      cullAdded: [] as number[],
      camera,
      map: { w: W },
      climb: null,
      debugCam: null,
      doors,
      enemies: []
    }
    hud.phase = 'play'
    const cull = (Mission.prototype as unknown as { updateRoomCulling(this: unknown): void }).updateRoomCulling
    cull.call(fake)
    // Standing in room 0, both doors shut: room 0 only, and only its door.
    expect(rooms.map(r => r.visible)).toEqual([true, false, false])
    expect(doors.map(d => d.mesh.root.visible)).toEqual([true, false])
    // The first door opens: room 1 shows through it, and so does its far door.
    doors[0]!.open = 1
    cull.call(fake)
    expect(rooms.map(r => r.visible)).toEqual([true, true, false])
    expect(doors.map(d => d.mesh.root.visible)).toEqual([true, true])
  })
})
