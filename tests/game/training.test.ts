import { describe, expect, it, vi } from 'vitest'
import { Group as StubGroup } from 'three'

// The charged shot paints a canvas texture: Node has no canvas.
vi.mock('@/game/fx/chargedShot', () => ({ buildChargedShot: () => ({ root: new StubGroup(), fly: () => {}, hide: () => {} }) }))
import { Training, INTRO_FOR, HELP_AFTER, CHARGE_STEP, steppedToward, type TrainHost } from '@/game/sim/training'
import { Box3, Vector3, type Mesh, type MeshBasicMaterial, type Object3D } from 'three'
import { HOLO_LOOP, HOLO_PRESS, holoGlyphAt, holoLoopAlpha, holoRetired, LessonHologram, type HoloId } from '@/game/fx/lessonHologram'
import { buildChest, buildCrate } from '@/game/models/props'
import { THEMES } from '@/game/world/themes'

// Every lesson room runs intro → try (a hologram does the move on a loop the
// whole time; no card, no demo), a hint every HELP_AFTER while stuck, and a
// tick once done.
const host = () => {
  const log: string[] = []
  const h: TrainHost = { say: (l) => { log.push(`say:${l}`) } }
  return { h, log }
}

describe('training rooms', () => {
  it('runs intro, then the try: nothing freezes, nothing plays itself', () => {
    const { h, log } = host()
    const tr = new Training(h)
    tr.enter('charge', 0)
    expect(tr.phase).toBe('intro')
    expect(log).toEqual(['say:train.charge'])
    tr.update(INTRO_FOR + 0.01, true)
    expect(tr.phase).toBe('try')
    expect(log).toEqual(['say:train.charge'])
  })

  it('hints every HELP_AFTER while the player is stuck, stops once done', () => {
    const { h, log } = host()
    const tr = new Training(h)
    tr.enter('gel', 0)
    tr.update(2, true)
    expect(tr.phase).toBe('try')
    tr.update(2 + HELP_AFTER + 0.1, true)
    tr.update(2 + 2 * HELP_AFTER + 0.2, true)
    expect(log.filter(l => l === 'say:help.gel')).toHaveLength(2)
    tr.complete('gel')
    tr.update(2 + 5 * HELP_AFTER, true)
    expect(log.filter(l => l === 'say:help.gel')).toHaveLength(2)
    expect(tr.phase).toBe('done')
  })

  // Playtest: a slide in an earlier room had ticked the lesson off before its
  // room was reached.
  it('a slide counts only in its own lesson (or once learned)', () => {
    const { h } = host()
    const tr = new Training(h)
    tr.enter('block', 0)
    expect(tr.counts('slide')).toBe(false)
    tr.leave()
    expect(tr.counts('slide')).toBe(false)
    // In its room, from the first moment (the hologram shows it from the door).
    tr.enter('slide', 10)
    expect(tr.counts('slide')).toBe(true)
    tr.update(10 + INTRO_FOR + 0.01, true)
    expect(tr.counts('slide')).toBe(true)
    tr.complete('slide')
    tr.leave()
    expect(tr.counts('slide')).toBe(true)
  })

  it('a lesson already done only shows its tick', () => {
    const { h, log } = host()
    const tr = new Training(h)
    tr.complete('block')
    tr.enter('block', 0)
    expect(tr.phase).toBe('done')
    expect(log).toEqual([])
  })
})

// The holograms (#266): every loop presses its input once, at the moment the
// move happens, and fades out and back in at the seam instead of snapping.
describe('lesson holograms', () => {
  const ids = Object.keys(HOLO_LOOP) as Array<keyof typeof HOLO_LOOP>

  it('presses its input in one stretch per loop, inside the loop', () => {
    for (const id of ids) {
      const [a, b] = HOLO_PRESS[id]
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(HOLO_LOOP[id])
      let edges = 0
      let was = false
      for (let u = 0; u < HOLO_LOOP[id]; u += 0.01) {
        const g = holoGlyphAt(id, u)
        if (g.down && !was) edges++
        was = g.down
      }
      expect(edges).toBe(1)
    }
  })

  it('fades out at the end of a loop and back in at the start', () => {
    for (const id of ids) {
      expect(holoLoopAlpha(id, 0)).toBe(0)
      expect(holoLoopAlpha(id, HOLO_LOOP[id] - 0.001)).toBeLessThan(0.01)
      expect(holoLoopAlpha(id, HOLO_LOOP[id] / 2)).toBe(1)
      // The press is always seen at full strength.
      const [a] = HOLO_PRESS[id]
      expect(holoLoopAlpha(id, Math.max(a, 0.3))).toBe(1)
    }
  })
})

// The charge lesson waits on the pad: it starts with the first step toward
// its drones (#121), so time never stops on a player still finding the stick.
describe("the charge lesson's start", () => {
  const pad = { x: 7.5, z: 13.5 }
  const drone = { x: 14.5, z: 13.5 }

  it('waits while Flux stands on the pad, or shuffles in place', () => {
    expect(steppedToward(drone, pad, pad)).toBe(false)
    expect(steppedToward(drone, pad, { x: pad.x + CHARGE_STEP * 0.5, z: pad.z })).toBe(false)
  })

  it('starts one step closer, from any side', () => {
    expect(steppedToward(drone, pad, { x: pad.x + CHARGE_STEP, z: pad.z })).toBe(true)
    expect(steppedToward(drone, pad, { x: pad.x + 2, z: pad.z + 1.5 })).toBe(true)
  })

  it('walking away, or straight sideways, is not a step toward the drones', () => {
    expect(steppedToward(drone, pad, { x: pad.x - 2, z: pad.z })).toBe(false)
    expect(steppedToward(drone, pad, { x: pad.x, z: pad.z + 3 })).toBe(false)
  })
})

// A hologram folds away once its move is done this mission; the perfect
// block's stays. The crate and the chest are the game's own models.
describe('lesson holograms retire', () => {
  const none = { crateBroken: false, chestOpen: false, learned: new Set<HoloId>() }
  it('stays until its move is done', () => {
    for (const id of Object.keys(HOLO_LOOP) as HoloId[]) expect(holoRetired(id, none)).toBe(false)
  })
  it('goes once done, except the perfect block', () => {
    const all = { crateBroken: true, chestOpen: true, learned: new Set(Object.keys(HOLO_LOOP) as HoloId[]) }
    for (const id of Object.keys(HOLO_LOOP) as HoloId[]) expect(holoRetired(id, all)).toBe(id !== 'block')
    expect(holoRetired('crate', { ...none, crateBroken: true })).toBe(true)
    expect(holoRetired('chest', { ...none, chestOpen: true })).toBe(true)
    expect(holoRetired('gel', { ...none, learned: new Set<HoloId>(['gel']) })).toBe(true)
    expect(holoRetired('gap', { ...none, learned: new Set<HoloId>(['gap']) })).toBe(true)
  })
  const size = (o: Object3D): number[] => {
    o.updateMatrixWorld(true)
    return new Box3().setFromObject(o).getSize(new Vector3()).toArray().map(v => Math.round(v * 100) / 100)
  }
  it('shows the crate and the chest the player meets', () => {
    const crate = new LessonHologram('crate', { theme: THEMES.scrapyard })
    const chest = new LessonHologram('chest', { theme: THEMES.scrapyard })
    const real = { crate: buildCrate(THEMES.scrapyard).root, chest: buildChest(THEMES.scrapyard).root }
    for (const [id, h] of [['crate', crate], ['chest', chest]] as const) {
      const prop = h.prop!
      const want = size(real[id])
      const meshes: Mesh[] = []
      prop.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh) })
      // Same parts minus the ink outline, so the same silhouette.
      expect(size(prop)).toEqual(want)
      expect(meshes.every(m => (m.material as MeshBasicMaterial).isMeshBasicMaterial)).toBe(true)
    }
  })
})
