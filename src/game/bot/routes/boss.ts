import { hud } from '../../state/hud'
import { profile } from '../../state/profile'
import type { Ctx, Task } from '../ctx'

/**
 * A Core Master's fight, generic: keep it in sight at mid range, quick shots
 * and charged shots at it, the reflexes (block, slide) do the dodging. A level
 * route that knows its Master better (a weak spot, a phase) writes its own.
 */
export function* fightBoss(c: Ctx): Task {
  const m = c.m
  const end = m.time + 600
  while (m.boss && m.boss.state !== 'dead') {
    if (m.time > end) return
    const b = m.boss
    if (b.offstage || c.reflexBusy) { yield; continue }
    const d = c.dist(b.x, b.z)
    c.aimAt(b)
    if (d > 11) c.steer(b.x, b.z)
    else if (d < 5) c.steer(2 * c.p.x - b.x, 2 * c.p.z - b.z)
    else c.steer(c.p.x - Math.sin(m.time * 0.9), c.p.z - Math.cos(m.time * 0.9), 0.6)
    yield* c.chargeShot(b, 2)
  }
}

/**
 * After the Master: the lab's drone fetches Flux, but first the weapon lesson
  * (the exit run in sim/mission.ts): into the lesson room, shoot its drones with the
 * weapon just copied, then stand on the lit pedestal until the beam takes him.
 */
export function* afterBoss(c: Ctx): Task {
  const m = c.m
  const end = m.time + 240
  while (hud.phase !== 'beamOut' && m.time < end) {
    const pad = m.exitPad?.root.position
    if (!pad) { yield* c.wait(0.5); continue }
    if (!m.exitLit) {
      const drones = m.lessons.drones.filter(d => d.state !== 'dead')
      if (c.dist(pad.x, pad.z) > 6) { yield* c.goto(pad.x, pad.z, { tol: 4, patience: 10 }); continue }
      const slot = m.exitWeapon ? profile.hero.slots.indexOf(m.exitWeapon as never) + 1 : 0
      const d = drones[0]
      if (d && slot > 0) {
        c.aimAt(d)
        m.input.weaponQueued = slot as 1 | 2
      }
      yield* c.wait(0.4)
    } else {
      yield* c.goto(pad.x, pad.z, { tol: 0.5, patience: 10 })
      yield* c.wait(0.5)
    }
  }
}
