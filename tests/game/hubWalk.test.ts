// Flux on foot in the walkable lab (#173, `sim/hubWalk.ts`): the stick walks
// him relative to the camera (forward is where it looks), he turns into his
// walk, a tap's route is walked waypoint by waypoint to its end heading, a
// push on the stick takes over from a route, and a route that runs into
// something gives up instead of pushing forever.

import { describe, expect, it } from 'vitest'
import { HUB_WALK, angDiff, newWalker, stepWalker, walkRoute } from '@/game/sim/hubWalk'
import { POSTS, WALLS, type Seg } from '@/game/world/hubLayout'

const step = (w: ReturnType<typeof newWalker>, moveX: number, moveY: number, camYaw: number, n = 60, walls: Seg[] = [], free = true) => {
  for (let i = 0; i < n; i++) stepWalker(w, { moveX, moveY, camYaw, free }, 1 / 60, walls, [])
}

describe('the stick, relative to the camera', () => {
  it('forward walks where the camera looks', () => {
    const w = newWalker(0, 0, 0)
    step(w, 0, 1, 0)
    expect(w.z).toBeGreaterThan(HUB_WALK * 0.7)
    expect(Math.abs(w.x)).toBeLessThan(0.01)
    const v = newWalker(0, 0, 0)
    step(v, 0, 1, Math.PI / 2)
    expect(v.x).toBeGreaterThan(HUB_WALK * 0.7)
  })

  it('right is the screen\'s right (looking down +z, that is −x)', () => {
    const w = newWalker(0, 0, 0)
    step(w, 1, 0, 0)
    expect(w.x).toBeLessThan(-HUB_WALK * 0.7)
  })

  it('he turns to face his walk, and strides while he walks', () => {
    const w = newWalker(0, 0, 0)
    step(w, 0, 1, Math.PI / 2)
    expect(Math.abs(angDiff(w.yaw, Math.PI / 2))).toBeLessThan(0.05)
    expect(w.stride).toBeGreaterThan(0.8)
    step(w, 0, 0, 0, 90)
    expect(w.stride).toBeLessThan(0.05)
  })

  it('nothing moves him while he is not free (a panel, a film)', () => {
    const w = newWalker(0, 0, 0)
    step(w, 0, 1, 0, 60, [], false)
    expect(Math.hypot(w.x, w.z)).toBeLessThan(1e-6)
  })
})

describe('a tap\'s walk', () => {
  it('goes waypoint by waypoint and ends facing the place', () => {
    const w = newWalker(0, 0, 0)
    walkRoute(w, [[0, 4], [3, 4]], Math.PI / 2)
    let arrived = false
    for (let i = 0; i < 600 && !arrived; i++) {
      stepWalker(w, { moveX: 0, moveY: 0, camYaw: 0, free: true }, 1 / 60, [], [])
      arrived = w.arrived
    }
    expect(arrived).toBe(true)
    expect(Math.hypot(w.x - 3, w.z - 4)).toBeLessThan(0.35)
    step(w, 0, 0, 0, 90)
    expect(Math.abs(angDiff(w.yaw, Math.PI / 2))).toBeLessThan(0.05)
  })

  it('a push on the stick takes over', () => {
    const w = newWalker(0, 0, 0)
    walkRoute(w, [[0, 8]])
    stepWalker(w, { moveX: 1, moveY: 0, camYaw: 0, free: true }, 1 / 60, [], [])
    expect(w.cancelled).toBe(true)
    expect(w.route).toHaveLength(0)
  })

  it('gives up against a wall rather than pushing at it forever', () => {
    const w = newWalker(0, 0, 0)
    walkRoute(w, [[0, 8]])
    const wall: Seg[] = [{ ax: -5, az: 2, bx: 5, bz: 2 }]
    let gaveUp = false
    for (let i = 0; i < 120 && !gaveUp; i++) {
      stepWalker(w, { moveX: 0, moveY: 0, camYaw: 0, free: true }, 1 / 60, wall, [])
      gaveUp = w.cancelled
    }
    expect(gaveUp).toBe(true)
    expect(w.z).toBeLessThan(2)
  })
})

describe('the door out of the lab', () => {
  it('a walk aimed a little beside it slides through instead of stopping at the wall', () => {
    // From the teleporter, the camera 22° off the door (as a landing's swing
    // left it once): straight on runs into the wall beside the door and stops.
    const funnel = { x: 0, z0: 3.5, z1: 7.4, reach: 3.6 }
    const w = newWalker(0, 0.5, 0)
    for (let i = 0; i < 60 * 3; i++) stepWalker(w, { moveX: 0, moveY: 1, camYaw: 0.38, free: true, funnel }, 1 / 60, WALLS, POSTS)
    expect(w.z).toBeGreaterThan(10)
    const v = newWalker(0, 0.5, 0)
    for (let i = 0; i < 60 * 3; i++) stepWalker(v, { moveX: 0, moveY: 1, camYaw: 0.38, free: true }, 1 / 60, WALLS, POSTS)
    expect(v.z).toBeLessThan(8)
  })
})
