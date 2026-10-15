/**
 * SUCCESS, 10 s — "the comeback": the Blaze Master's fire wave already
 * rolling at Flux (0 s), an exchange of charge shots and blades while he
 * strafes its attacks (0.5–5), a full charge held (5–6.3), the kill shot:
 * ripple explosions, the shatter, its weapon copied onto his arm (≈6.5–9),
 * and he walks on into the arena (the last second moves).
 */
import { stageFight, T, logState, play } from './_preview.mjs'

export default {
  id: 'preview-success',
  label: 'Master down',

  async setup(ctx) {
    await stageFight(ctx, 'blaze', { hp: 0.3, weapons: ['iceLance', 'neonBlade'], attacks: ['fireWave', 'flameRing', 'leapSlam'] })
  },

  async record(ctx) {
    await play(ctx, 3500)
    await logState(ctx, '3.5s')
    // The Master worn down to its last sliver while the fight plays on.
    await T(ctx, () => window.__trailer.bossHp(0.08))
    await play(ctx, 1500)
    await T(ctx, () => { window.__trailer.clearAdds(); window.__trailer.approach(['boss'], 5.5); window.__trailer.auto({ fire: 'charge', chargeS: 99, strafe: 0, weapon: 0 }) })
    await play(ctx, 1300)
    // The kill shot.
    await T(ctx, () => { window.__trailer.bossHp(0.001); window.__trailer.auto({ chargeS: 0 }) })
    await play(ctx, 500)
    await T(ctx, () => window.__trailer.auto({ fire: 'none' }))
    await logState(ctx, 'kill')
    ctx.beat?.('poster')
    await play(ctx, 2200)
    await T(ctx, () => { window.__trailer.m().input.moveY = 0.7 })
    await logState(ctx, 'end')
  }
}
