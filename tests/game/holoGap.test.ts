import { describe, expect, it } from 'vitest'
import { HOLO_GAP, HOLO_LOOP, HOLO_RESET, holoGapAt, holoGapFlight, type HoloGapPose } from '@/game/fx/lessonHologram'
import { LEAP_VY } from '@/game/sim/climb'

// The gap lesson's hologram walks to the edge and leaps it as the player's
// edge-leap does: no snap, no slide, no sudden change of ground speed.
describe('gap lesson hologram', () => {
  const pose = (): HoloGapPose => ({ x: 0, y: 0, vx: 0, walk: 0, stride: 0, air: 0, tuck: 0 })
  const dt = 1 / 240
  const end = HOLO_LOOP.gap - HOLO_RESET

  it("leaps with the player's own hop", () => {
    expect(HOLO_GAP.vy).toBe(LEAP_VY)
  })

  it('moves without a jump in position or ground speed', () => {
    const a = pose()
    const b = pose()
    let prevV = 0
    for (let u = 0; u + dt < end; u += dt) {
      holoGapAt(u, a)
      holoGapAt(u + dt, b)
      const v = (b.x - a.x) / dt
      // The sampled speed agrees with the reported one (no hidden slide)…
      expect(Math.abs(v - a.vx)).toBeLessThan(0.15)
      // …never steps (accel below ~3 g, a smooth ease)…
      expect(Math.abs(v - prevV) / dt).toBeLessThan(30)
      // …and the height never jumps either.
      expect(Math.abs(b.y - a.y)).toBeLessThan(HOLO_GAP.vy * dt * 1.05)
      expect(b.air - a.air).toBeLessThan(0.2)
      prevV = v
    }
  })

  it('takes off at the lip at walking speed and lands on the far ledge', () => {
    const p = pose()
    let tookOff = -1
    for (let u = 0; u < end; u += dt) {
      holoGapAt(u, p)
      if (p.y > 0 && tookOff < 0) {
        tookOff = u
        expect(p.x).toBeGreaterThan(HOLO_GAP.lip - 0.05)
        expect(p.vx).toBeCloseTo(HOLO_GAP.speed, 5)
      }
    }
    holoGapAt(tookOff + holoGapFlight() + 0.01, p)
    expect(p.y).toBe(0)
    expect(p.x).toBeGreaterThan(0.75)
    holoGapAt(end, p)
    expect(p.vx).toBe(0)
    expect(p.x).toBeLessThan(3.3)
  })

  it('advances its stride with the distance, so the feet never skate', () => {
    const a = pose()
    const b = pose()
    holoGapAt(1, a)
    holoGapAt(1.05, b)
    expect(b.stride).toBeGreaterThan(a.stride)
  })
})
