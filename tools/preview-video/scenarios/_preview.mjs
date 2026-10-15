/**
 * The 10 s portal previews: one Core Master fight per clip, staged off camera
 * through the trailer seam (`enterMaster` in `_shots.mjs`), played on camera
 * by the autopilot against the Master's own AI. The clean feed has no health
 * bars, so the story is told by the fight itself: the Master's phase-2 moves
 * (it is hurt), the shatter (it is down), Flux's own burst (he is).
 */
import { enterMaster } from './_shots.mjs'
import { logState, play, playUntil, settle } from './_drive.mjs'

const T = (ctx, fn, arg) => ctx.evaluate(fn, arg)

export const PILOT = { fire: 'mix', chargeS: 0.8, strafe: 0.6, strafePeriod: 2.2, closeTo: 0, weapon: 1, weaponEvery: 2.4 }

/** Off camera: into the arena, the Master at `hp`, the fight going, the take opens on a wind-up. */
export const stageFight = async (ctx, sector, { hp, weapons, attacks, dist = 5.5 }) => {
  await enterMaster(ctx, sector, weapons)
  // Below half: its phase-2 roar plays off camera, not in the clip.
  await T(ctx, (f) => window.__trailer.bossHp(f), Math.min(hp, 0.45))
  await T(ctx, (p) => window.__trailer.auto(p), PILOT)
  await settle(ctx, 3000)
  await T(ctx, (f) => { window.__trailer.bossHp(f); window.__trailer.clearAdds() }, hp)
  try {
    await ctx.waitFor((a) => window.__trailer.bossDoing(a, ['tele']), attacks, { timeout: 30_000, polling: 16 })
  } catch { ctx.log.warn('preview: no wind-up caught, opening mid-fight') }
  await T(ctx, (d) => { window.__trailer.approach(['boss'], d); window.__trailer.clearAdds() }, dist)
  await logState(ctx, 'open')
}

export { T, logState, play, playUntil }
