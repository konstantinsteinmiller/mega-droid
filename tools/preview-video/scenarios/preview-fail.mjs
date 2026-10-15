/**
 * FAIL, 10 s — "the one you want to run back": the Volt Master already in
 * phase 2 and nearly done (0 s), Flux pressing it hard — this looks won
 * (0.5–4.5) — then he stands in its chain bolt instead of sliding out
 * (≈5–7): his own plasma burst, the arena dims, and the Reboot puts him
 * straight back in the fight (8.5–10).
 */
import { stageFight, PILOT, T, logState, play, playUntil } from './_preview.mjs'

export default {
  id: 'preview-fail',
  label: 'Flux down, one hit short',

  async setup(ctx) {
    await stageFight(ctx, 'volt', { hp: 0.25, weapons: ['iceLance', 'droneSwarm'], attacks: ['chainBolt', 'orbStorm', 'voltRing'] })
  },

  async record(ctx) {
    await play(ctx, 2500)
    await T(ctx, () => window.__trailer.bossHp(0.07))
    await play(ctx, 2000)
    await logState(ctx, '4.5s')
    // THE MISTAKE: he stops strafing and the guard drops; the next hit lands.
    await T(ctx, () => {
      const t = window.__trailer
      const c = t.m().combat
      c.iframes = 0
      c.hp = Math.min(c.hp, 1)
      t.approach(['boss'], 3.5)
      t.auto({ fire: 'charge', chargeS: 99, strafe: 0, weapon: 0 })
    })
    const hit = await playUntil(ctx, () => window.__trailer.m().combat.dead, 2200)
    if (!hit) {
      ctx.log.warn('fail: no hit landed in time, downing Flux')
      await T(ctx, () => window.__trailer.m().onPlayerDown())
    }
    await T(ctx, () => window.__trailer.auto(null))
    await logState(ctx, 'down')
    await play(ctx, 1500)
    // Retry: back on his feet where he fell, straight into it.
    await T(ctx, (p) => {
      const t = window.__trailer
      // The defeat modal (hidden in the clean feed) holds the game paused;
      // Reboot is its button.
      window.__game.flow.modal = ''
      t.m().revive()
      t.prepare()
      // Back on his feet and moving, but no kill in the last second: the
      // clip ends on the retry, not on a win.
      t.auto({ ...p, fire: 'none', weapon: 0 })
    }, PILOT)
    await play(ctx, 1000)
    await logState(ctx, 'retry')
  }
}
