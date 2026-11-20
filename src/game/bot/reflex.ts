import { profile } from '../state/profile'
import type { Ctx } from './ctx'

/**
 * ─── The bot's reflexes ──────────────────────────────────────────────────────
 *
 * What a player does without thinking, every frame, before the route gets its
 * turn: block a telegraphed hit, slide out of a red ring, drink a repair tank
 * when low. The route is told (`ctx.reflexBusy`) when a reflex holds the
 * hands, so its shooting waits for the block to end.
 */
const slid = new WeakMap<object, number>()

export const reflex = (c: Ctx): void => {
  const m = c.m
  const cb = m.combat
  const i = m.input
  c.reflexBusy = false
  if (cb.dead || cb.hp <= 0) return

  // (The tutorial's gel lesson teaches the tank at exactly this moment: its
  // route drinks it, on the lesson's cue.)
  if (!m.setup.tutorial && cb.hp < cb.maxHp * 0.45 && profile.inv.tanks > 0 && !cb.blocking) c.press('tank')

  for (const e of c.foes({ awake: true, sameFloor: true })) {
    if (e.state !== 'tele' && e.state !== 'act') continue
    const d = c.dist(e.x, e.z)
    if (d > 11) continue
    if (e.teleRed && e.state === 'tele') {
      if (c.ownRedDodge) continue
      // A red ring cannot be blocked: leave it, once per wind-up.
      if (slid.get(e) !== e.step + e.id * 1000 + Math.floor(m.time)) {
        if (c.lateSlide) continue
        if (cb.slideCd <= 0 && cb.power >= 18 && d < 8) {
          slid.set(e, e.step + e.id * 1000 + Math.floor(m.time))
          // Away from it, sideways.
          const ax = c.p.x - e.x
          const az = c.p.z - e.z
          c.slide(-az * 0.7 + ax * 0.3, ax * 0.7 + az * 0.3)
          c.reflexBusy = true
        }
      }
      continue
    }
    if (!e.teleRed && d < 7.5 && !cb.guardBroken) {
      c.face(e.x, e.z)
      i.blockHeld = true
      i.blockPressed ||= !cb.blocking
      c.reflexBusy = true
      return
    }
  }
}
