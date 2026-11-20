import { hud } from '../state/hud'
import type { BotDriver } from './hook'
import { asBot, type BotMission } from './view'
import { BotStuck, Ctx, type Task } from './ctx'
import { reflex } from './reflex'
import { routeFor, type Route } from './routes'

/**
 * ─── The autopilot: one mission, played by the route ────────────────────────
 *
 * Installed in `botHook` when the bot is on. Each frame (the first sub-step
 * of it) it lets go of every hold, runs the reflexes, and gives the route one
 * turn. The route is a generator picked by the mission's level; it is built
 * from the mission's CURRENT state, never from a start of the level, so the
 * bot can be switched on anywhere — and after a death it simply starts again
 * from where the checkpoint put it.
 */
export class Autopilot implements BotDriver {
  private mission: unknown = null
  private ctx: Ctx | null = null
  private task: Task | null = null
  /** The mission is over for the route: it finished, or gave up. */
  finished = false
  /** The last thing that went wrong, for the director and the harness. */
  failure: string | null = null
  echo: ((s: string) => void) | null = null
  /** A route chosen by hand (the harness), instead of the level's own. */
  override: Route | null = null

  get lines(): string[] { return this.ctx?.lines ?? [] }

  drive(mission: unknown, _dt: number, first: boolean): void {
    if (!first) return
    if (mission !== this.mission) this.attach(mission)
    const c = this.ctx!
    const m = c.m
    const i = m.input
    // Holds are the bot's to assert each turn; edges are consumed by the step.
    i.moveX = i.moveY = 0
    i.fireHeld = false
    i.blockHeld = false
    // A beam-in, a title card, a scene: the player waits (or skips).
    if (hud.phase !== 'play') {
      if (hud.cineSkip || hud.phase === 'beamIn') i.anyPressed = true
      return
    }
    // A freeze-frame waits for a press: any press skips a kill-cam, and a
    // lesson's held moment wants its own move (the block, the slide).
    if (m.freeze.active) {
      i.anyPressed = true
      if (m.blockCue || m.swoopCue) i.blockPressed = true
      if (m.slideCue) i.slideQueued = true
      return
    }
    if (this.finished) return
    reflex(c)
    if (!this.task) this.task = (this.override ?? routeFor(m))(c)
    try {
      const r = this.task.next()
      if (r.done) {
        this.finished = true
        c.log('route finished')
      }
    } catch (e) {
      this.failure = e instanceof Error ? e.message : String(e)
      c.log(`${e instanceof BotStuck ? 'stuck' : 'error'}: ${this.failure}`)
      // Try again from wherever it is: the route reads the state afresh.
      this.task = null
    }
  }

  private attach(mission: unknown): void {
    this.mission = mission
    const m: BotMission = asBot(mission)
    this.ctx = new Ctx(m, () => (mission as { stats: unknown }).stats)
    this.ctx.echo = this.echo
    this.task = null
    this.finished = false
    this.failure = null
  }
}
