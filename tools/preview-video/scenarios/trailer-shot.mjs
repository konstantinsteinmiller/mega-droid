/**
 * One shot of the cinematic trailer. Which one comes from `TRAILER_SHOT`
 * (set by tools/cinematic-trailer/make.mjs); the shots themselves live in
 * `_shots.mjs`. `stage` runs in real time and is not recorded; `play` is the
 * shot on camera.
 */
import { SHOTS } from './_shots.mjs'
import { play, startAudioLog } from './_drive.mjs'

const shotFor = () => {
  const id = process.env.TRAILER_SHOT
  const shot = SHOTS[id]
  if (!shot) throw new Error(`TRAILER_SHOT=${id ?? '(unset)'} — pick one of: ${Object.keys(SHOTS).join(', ')}`)
  return { id, ...shot }
}

export default {
  id: 'trailer-shot',
  label: 'one trailer shot',

  async setup(ctx) {
    const shot = shotFor()
    ctx.log.step(`shot ${shot.id}`)
    await shot.stage(ctx)
  },

  async record(ctx) {
    const shot = shotFor()
    await startAudioLog(ctx)
    await shot.play?.(ctx)
    // Whatever is left of the shot plays on; the recorder stops at --duration.
    await play(ctx, ctx.durationMs + 1000)
  }
}
