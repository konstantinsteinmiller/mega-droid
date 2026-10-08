import { describe, expect, it } from 'vitest'
import { ChargeShow, SHOW_AIM, SHOW_WAIT, SHOW_WATCH, showHoldFor } from '@/game/sim/chargeShow'
import { baseStats, chargeInfo } from '@/game/sim/stats'

// The tutorial's first charged shot is fired by the game itself, right after
// the landing: a beat, the view onto the drone, fire held to a full charge,
// let go in its sweet spot, the pop — then the hands come back.
describe('the charge show', () => {
  const run = (s: ChargeShow, secs: number, dt = 1 / 60) => {
    const seen: string[] = []
    let releases = 0
    let held = 0
    for (let t = 0; t < secs; t += dt) {
      const ph = s.step(dt)
      if (seen[seen.length - 1] !== ph) seen.push(ph)
      if (s.release) releases++
      if (ph === 'hold') held += dt
    }
    return { seen, releases, held }
  }

  it('waits, aims, holds, lets go once, watches, hands back', () => {
    const st = baseStats()
    const hold = showHoldFor(st.chargeTimeMul, st.perfectMul)
    const s = new ChargeShow(hold)
    expect(s.active).toBe(false)
    const r = run(s, SHOW_WAIT + SHOW_AIM + hold + SHOW_WATCH + 0.5)
    expect(r.seen).toEqual(['wait', 'aim', 'hold', 'watch', 'done'])
    expect(r.releases).toBe(1)
    expect(s.active).toBe(false)
  })

  it('lets go at a full charge, inside its perfect window', () => {
    const st = baseStats()
    const hold = showHoldFor(st.chargeTimeMul, st.perfectMul)
    const info = chargeInfo(hold, st)
    expect(info.level).toBe(2)
    expect(info.perfect).toBe(true)
    // Charge-speed upgrades shorten it with them.
    const fast = { ...st, chargeTimeMul: 0.7 }
    expect(chargeInfo(showHoldFor(0.7, st.perfectMul), fast).perfect).toBe(true)
  })

  it('stops at once when called off', () => {
    const s = new ChargeShow(1)
    run(s, SHOW_WAIT + 0.1)
    expect(s.active).toBe(true)
    s.stop()
    expect(s.active).toBe(false)
    expect(s.step(1 / 60)).toBe('done')
  })
})
