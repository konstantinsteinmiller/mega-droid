// The walkable lab's floor plan (#173, `world/hubLayout.ts`): every place in
// the Deployment Hall can be walked to from the lab's teleporter along the
// route a tap on its label takes, ends with Flux standing AT it, and a locked
// pedestal's red fence keeps him off it. Every spot he can turn up on (the
// teleporter, the briefing table, any pedestal back from its mission) stands
// clear of walls and props, and no two places claim the same floor.

import { describe, expect, it } from 'vitest'
import {
  BRIEF_SPOT, HERO_R, HOME_PAD, LAB_POSTS, POIS, POI_BY_ID, POSTS, WALLS, fenceOf, openGateWalls, poiAt, rayHit, rayHitPosts,
  resolveCircle, routeTo, spawnOnPad, zoneAt, type Poi, type Seg
} from '@/game/world/hubLayout'
import { newWalker, stepWalker, walkRoute } from '@/game/sim/hubWalk'

const OPEN: readonly Seg[] = [...WALLS, ...openGateWalls()]

/** Walk the tap's route from (x, z) to `to`; the result and where he ended. */
const walk = (x: number, z: number, to: Poi, walls: readonly Seg[] = OPEN) => {
  const w = newWalker(x, z, 0)
  walkRoute(w, routeTo(x, z, to), to.yaw + Math.PI)
  for (let i = 0; i < 60 * 40; i++) {
    stepWalker(w, { moveX: 0, moveY: 0, camYaw: 0, free: true }, 1 / 60, walls, POSTS)
    if (w.arrived) return { arrived: true, w }
    if (w.cancelled) return { arrived: false, w }
  }
  return { arrived: false, w }
}

describe('the hall on foot', () => {
  it.each(POIS.map(p => [p.id, p] as const))('%s: walked to from the teleporter, and stood at', (_id, p) => {
    const r = walk(HOME_PAD.x, HOME_PAD.z, p)
    expect(r.arrived).toBe(true)
    expect(poiAt(r.w.x, r.w.z)?.id).toBe(p.id)
  })

  it('every place from every pedestal Flux can come back to, and from the briefing table', () => {
    const froms = [BRIEF_SPOT, ...POIS.filter(p => p.kind !== 'station').map(spawnOnPad)]
    const tos = [POI_BY_ID.table, POI_BY_ID.workshop, POI_BY_ID['story:fortress'], POI_BY_ID['story:scrapyard'], POI_BY_ID.job2]
    for (const f of froms) {
      for (const t of tos) {
        const r = walk(f.x, f.z, t)
        expect(r.arrived, `${f.x.toFixed(1)},${f.z.toFixed(1)} → ${t.id}`).toBe(true)
      }
    }
  })

  it('a locked pedestal is fenced off: the walk stops at its fence, never on the pad', () => {
    for (const p of POIS.filter(q => q.kind === 'story' || q.kind === 'gate' || q.kind === 'job')) {
      const f = fenceOf(p)!
      expect(f).toBeTruthy()
      const r = walk(HOME_PAD.x, HOME_PAD.z, p, [...WALLS, f])
      expect(r.arrived, p.id).toBe(false)
      expect(poiAt(r.w.x, r.w.z)?.id).not.toBe(p.id)
    }
  })

  it('every spot he turns up on stands clear of walls and props', () => {
    const out: [number, number] = [0, 0]
    for (const s of [HOME_PAD, BRIEF_SPOT, ...POIS.filter(p => p.kind !== 'station').map(spawnOnPad)]) {
      resolveCircle(s.x, s.z, HERO_R, OPEN, POSTS, out)
      expect(Math.hypot(out[0] - s.x, out[1] - s.z), `${s.x},${s.z}`).toBeLessThan(1e-6)
    }
  })

  it('no two places claim the same floor', () => {
    for (let i = 0; i < POIS.length; i++) {
      for (let j = i + 1; j < POIS.length; j++) {
        const a = POIS[i]!
        const b = POIS[j]!
        expect(Math.hypot(a.tx - b.tx, a.tz - b.tz), `${a.id} / ${b.id}`).toBeGreaterThan(a.reach + b.reach)
      }
    }
  })

  it('the lab, the airlock, the hall, the niches and the gate are where they say', () => {
    expect(zoneAt(0, 0)).toBe('lab')
    expect(zoneAt(0, 10)).toBe('airlock')
    expect(zoneAt(0, 30)).toBe('hall')
    expect(zoneAt(POI_BY_ID['story:blaze'].x, POI_BY_ID['story:blaze'].z)).toBe('niche')
    expect(zoneAt(0, POI_BY_ID['story:fortress'].z)).toBe('gate')
  })
})

describe('the camera keeps in front of things', () => {
  it('a wall between Flux and the camera shortens the arm', () => {
    // From the hall's axis out through the left wall between two niches.
    const z = (POI_BY_ID.hero.z + POI_BY_ID.circuits.z) / 2
    expect(rayHit(0, z, -12, z, WALLS)).toBeLessThan(0.55)
    expect(rayHit(0, 30, 0, 26, WALLS)).toBe(1)
  })

  it('so does the briefing table in the lab', () => {
    expect(rayHitPosts(0, BRIEF_SPOT.z, 0, BRIEF_SPOT.z - 6, LAB_POSTS)).toBeLessThan(0.3)
    expect(rayHitPosts(0, 1, 0, 6, LAB_POSTS)).toBe(1)
  })
})
