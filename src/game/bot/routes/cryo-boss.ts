import type { Ctx, Task } from '../ctx'
import type { Enemy } from '../../sim/world'
import { weakSpotAt } from '../../data/weakspots'
import { dodgeMarkers, awayFrom, setAim } from './cryo-hops'
import { watchHp } from './cryo-hazard'
import { react } from './cryo-react'

/**
 * The Frost Master with the buster alone (the Flame Wave that melts him is
 * Blaze's, not in Flux's slots in this run). Ice volleys, dash slashes and
 * homing missiles are orange: the reflex blocks them. The charged blast, the
 * freezing floor and the shell lobs are red rings on the floor: step out of
 * them. Quick shots at the head (the weak spot, x1.5) keep its guard busy.
 */
const spot = { x: 0, y: 0, z: 0, r: 0 }

export function* fightFrost(c: Ctx): Task {
  const m = c.m
  const end = m.time + 700
  let lastLog = -9
  c.log(`boss fight: ${m.boss?.state}`)
  while (m.boss && m.boss.state !== 'dead' && m.time < end) {
    watchHp(c)
    const b: Enemy = m.boss
    if (m.time - lastLog > 5) { lastLog = m.time; c.log(`boss ${b.state}/${b.attack} hp ${Math.round(b.hp)}/${Math.round(b.maxHp)} d${c.dist(b.x, b.z).toFixed(1)} me ${Math.round(m.combat.hp)}`) }
    if (m.combat.dead) return
    const p = c.p
    const d = c.dist(b.x, b.z)
    if (!b.offstage) {
      weakSpotAt(b as never, spot)
      setAim(c, spot.x, spot.z, spot.y, b)
    }
    if (react(c)) { yield; continue }
    if (c.reflexBusy) { yield; continue }
    if (d < 5.5) {
      const to = awayFrom(c, b.x, b.z, 3)
      if (to) c.steer(to.x, to.z)
    } else if (d > 10) c.steer(b.x, b.z)
    else {
      const sgn = Math.sin(m.time * 0.9) > 0 ? 1 : -1
      c.steer(p.x + (b.z - p.z) * sgn, p.z - (b.x - p.x) * sgn, 0.7)
    }
    yield
  }
  c.stop()
}
