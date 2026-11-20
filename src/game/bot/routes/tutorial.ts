import type { Ctx, Task } from '../ctx'
import { BotStuck } from '../ctx'
import { afterBoss, fightBoss } from './boss'
import { hud } from '../../state/hud'

/**
 * ─── Wake-Up Call: the tutorial, then the Scrapper ───────────────────────────
 *
 * The game tells the way itself: `walk.goal()` says where to walk next and
 * what is there (its lessons, in order), so this route only has to do what
 * each kind of goal needs — the same as a player following the yellow
 * chevrons. It works from any state: it reads the goal afresh every turn.
 */
export function* tutorialRoute(c: Ctx): Task {
  const m = c.m
  let said = ''
  let lastNull = -9
  for (;;) {
    // The Master is down (wherever it fell): the weapon lesson, then the beam.
    if (m.boss && m.boss.state === 'dead') { yield* afterBoss(c); return }
    if (m.boss && m.bossStarted) { yield* fightBoss(c); continue }
    const walk = m.walk
    const g = walk?.goal() ?? null
    if (!g) {
      // Nothing to walk to: a lesson is moving in, or a scene has the moment.
      if (m.time - lastNull > 3) { lastNull = m.time; c.log(`no goal; gel=${(walk as unknown as { gel: string }).gel} hp=${Math.round(m.combat.hp)} lesson=${JSON.stringify((hud.lesson as { id?: string } | null)?.id)}`) }
      // The gel lesson: the trap left Flux low, and a gel is the way on.
      if (hud.lesson && (hud.lesson as { id?: string }).id === 'gel') c.press('tank')
      yield* c.wait(0.4)
      continue
    }
    const now = `${g.kind} ${g.x.toFixed(1)},${g.z.toFixed(1)}`
    if (now !== said) { said = now; c.log(`goal ${now}`) }
    switch (g.kind) {
      case 'drone': {
        const d = m.lessons.target?.alive ? m.lessons.target : null
        if (!d) { yield* c.wait(0.3); break }
        if (c.dist(d.x, d.z) > 9) yield* c.goto(d.x, d.z, { tol: 7 })
        // Quick shots skip off its bubble; a charged shot pops it.
        yield* c.chargeShot(d, 2)
        break
      }
      case 'machine': {
        const e = c.foes().find(x => Math.hypot(x.x - g.x, x.z - g.z) < 3) ?? c.foes()[0]
        if (!e) { yield* c.wait(0.2); break }
        yield* c.kill(e, { charge: e.kind === 'trooper' ? 2 : undefined, timeout: 60 })
        break
      }
      case 'crate': {
        // The glowing crate: only a charged shot breaks it.
        yield* c.goto(g.x, g.z, { tol: 6 })
        c.face(g.x, g.z, 0.8)
        const i = m.input
        i.firePressed = true
        i.fireHeld = true
        yield
        for (let n = 0; n < 90; n++) { c.face(g.x, g.z, 0.8); i.fireHeld = true; yield }
        i.fireHeld = false
        i.fireReleased = true
        yield
        { const cr = m.lessons.crateAt as unknown as { hp: number; y: number; broken: boolean; x: number; z: number } | null; c.log(`crate shot: broken=${m.lessons.crateBroken} hp=${cr?.hp} y=${cr?.y} me ${c.p.x.toFixed(1)},${c.p.z.toFixed(1)} yaw ${c.p.yaw.toFixed(2)} pitch ${c.p.pitch.toFixed(2)} los=${cr ? c.sees(cr) : "-"}`) }
        yield* c.wait(0.5)
        break
      }
      case 'chest': {
        yield* c.goto(g.x, g.z, { tol: 1.6 })
        c.face(g.x, g.z, 0.5)
        c.press('interact')
        yield* c.wait(0.6)
        break
      }
      case 'plate':
      case 'room':
      case 'door':
        yield* c.goto(g.x, g.z, { tol: 0.8 })
        yield* c.wait(0.2)
        break
      case 'objective': {
        // The boss shutter. Open (the last lesson opens it), walk in to the
        // Master; shut, stand at it and ask it open.
        const door = m.doors.find(d => Math.hypot(d.x - g.x, d.z - g.z) < 3)
        if (door && door.open > 0.9 && m.boss) {
          yield* c.goto(m.boss.x, m.boss.z, { tol: 6, patience: 12 })
          yield* c.wait(0.3)
          break
        }
        yield* c.goto(g.x, g.z, { tol: 2.2 })
        c.face(g.x, g.z, 1.2)
        c.press('interact')
        yield* c.wait(1)
        break
      }
      default:
        throw new BotStuck(`unknown goal ${g.kind}`)
    }
    yield
  }
}
