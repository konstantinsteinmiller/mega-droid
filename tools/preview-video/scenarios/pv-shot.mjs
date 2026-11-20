/**
 * One CrazyGames-preview shot. Which one comes from `PV_SHOT` (set by
 * make-previews.mjs); the shots live in `_pv.mjs`. `setup` stages it in real
 * time, off camera; `record` plays it on the recorder's virtual clock.
 */
import { SHOTS } from './_pv.mjs'
import { play } from './_drive.mjs'

const shotFor = () => {
  const id = process.env.PV_SHOT
  const shot = SHOTS[id]
  if (!shot) throw new Error(`PV_SHOT=${id ?? '(unset)'} — pick one of: ${Object.keys(SHOTS).join(', ')}`)
  return { id, ...shot }
}

export default {
  id: 'pv-shot',
  label: 'one preview shot',

  async setup(ctx) {
    const shot = shotFor()
    ctx.log.step(`shot ${shot.id}`)
    await shot.stage(ctx)
  },

  async record(ctx) {
    await shotFor().play?.(ctx)
    // Whatever is left of the shot plays on; the recorder stops at --duration.
    await play(ctx, ctx.durationMs + 1000)
  }
}
