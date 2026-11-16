// @vitest-environment jsdom
// A challenge's prize shows as a chest opening (#202): where the mini-boss
// fell, a chest of the item's rarity turns to Flux and throws its lid open
// under the rarity's beam, then stays as scenery — never solid, never openable
// again, never a prompt.

import { describe, expect, it, vi } from 'vitest'
import { Scene } from 'three'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { MissionObjects, type ObjectiveHost } from '@/game/sim/objectives'
import { createNav } from '@/game/world/nav'
import { generateMap } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import type { Quest } from '@/game/data/quests'

const setup = () => {
  const map = generateMap({ seed: 7, rooms: 9, boss: true })
  const nav = createNav(map)
  const scene = new Scene()
  const calls = { ring: 0, sparks: 0, opened: 0 }
  const host = {
    scene, map, nav, theme: THEMES.scrapyard, propParent: () => scene,
    fx: { sparks: () => { calls.sparks++ }, emit: () => {}, orbBurst: () => {}, flash: () => {}, riseRing: () => { calls.ring++ } },
    shocks: { spawn: () => {} }, shake: () => {}, sfx: () => {}, explode: () => {},
    onCrateDeflect: () => {}, onCrateBroken: () => {}, onChestOpened: () => { calls.opened++ }, onCoreTaken: () => {}, onObjectiveDone: () => {}
  }
  const quest = {
    id: 'job_7', kind: 'job', template: 'purge', sector: 'scrapyard', seed: 7, level: 4,
    target: null, count: 1, rooms: 9, reward: { xp: 0, bolts: 0, rarityBias: 0 }
  } as Quest
  const objects = new MissionObjects(host as unknown as ObjectiveHost, quest)
  const room = map.rooms[1]!
  return { objects, nav, calls, x: (room.x0 + room.w / 2) * 3, z: (room.z0 + room.h / 2) * 3 }
}

describe('the prize chest', () => {
  it('stands where the mini-boss fell, opens its lid, and is just scenery', () => {
    const { objects, nav, calls, x, z } = setup()
    const before = objects.chests.length
    const props = nav.props.length
    objects.prizeChest(x, 0, z, 'prototype', x + 4, z)
    const c = objects.chests[before]!
    expect(objects.chests).toHaveLength(before + 1)
    expect(c.x).toBe(x)
    expect(c.z).toBe(z)
    expect(c.rarity).toBe('prototype')
    expect(c.opened).toBe(true)
    // The ring and the sparks of a chest opening.
    expect(calls.ring).toBe(1)
    expect(calls.sparks).toBe(1)
    // The lid swings open over the next moments, under a beam.
    expect(c.mesh.lid.rotation.x).toBe(0)
    for (let i = 0; i < 12; i++) objects.update(1 / 30, i / 30)
    expect(c.mesh.lid.rotation.x).toBeLessThan(-1)
    // Not solid, not a prompt, not a second prize.
    expect(nav.props[props]!.active).toBe(false)
    expect(objects.nearestInteractable(x, z, 0)?.ref).not.toBe(c)
    expect(calls.opened).toBe(0)
  })

  it('faces the player', () => {
    const { objects, x, z } = setup()
    objects.prizeChest(x, 0, z, 'tuned', x + 5, z)
    const c = objects.chests[objects.chests.length - 1]!
    // A chest's front is the opposite of the way its yaw points.
    expect(-Math.sin(c.yaw)).toBeGreaterThan(0.99)
  })
})
