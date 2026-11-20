import type { Ctx, Task } from '../ctx'
import { BotStuck } from '../ctx'
import { CELL } from '../../world/levelGen'
import { afterBoss } from './boss'
import { hud } from '../../state/hud'
import { profile } from '../../state/profile'
import { fightFrost } from './cryo-boss'
import { dangerCells } from './cryo-hazard'
import { cellOf, cx, cz, plan, type Step } from './cryo-nav'
import { fightFoe, hopLadder, hopLeap, hopLift, nextFoe, walkRun } from './cryo-hops'

/**
 * ─── Glacier Run: the Frost Master's stage ───────────────────────────────────
 *
 * Goal driven: plan (A* over walks and the stage's hops: ladders, the shuttle,
 * dash leaps) from the cell Flux stands in to the cell before the boss
 * shutter, do the first leg, re-plan. Works from any checkpoint.
 */
export function* cryoRoute(c: Ctx): Task {
  const m = c.m
  const map = m.map
  const W = map.w
  const bossDoor = map.doors.find(d => d.boss)
  if (!bossDoor) throw new BotStuck('no boss door')
  const door = m.doors.find(d => d.id === bossDoor.id)!
  // The cell on the near side of the shutter (the parent room's end of the corridor).
  const dx = bossDoor.axis === 'x' ? bossDoor.dir : 0
  const dz = bossDoor.axis === 'z' ? bossDoor.dir : 0
  const before = (bossDoor.j - dz) * W + (bossDoor.i - dx)
  let said = ''
  let waited = 0
  let lastStat = -99
  let waited0 = false
  c.lateSlide = true
  c.log('foes: ' + m.enemies.map(e => `${e.kind}@${Math.floor(e.x / CELL)},${Math.floor(e.z / CELL)}${e.awake ? '!' : ''}${e.dormant ? 'd' : ''}${e.offstage ? 'o' : ''} hp${Math.round(e.hp)}`).join(' '))
  for (;;) {
    if (m.boss && m.boss.state === 'dead') break
    if (m.boss && m.bossStarted) { yield* fightFrost(c); break }
    const p = c.p
    if (p.ladder >= 0) { yield* finishLadder(c, false, before); continue }
    if (!p.ground) { yield; continue }
    const here = cellOf(c)
    if (m.time - lastStat > 10) { lastStat = m.time; c.log(`status: cell ${here % W},${Math.floor(here / W)} y${p.y.toFixed(1)} hp ${Math.round(m.combat.hp)} door open ${door.open.toFixed(1)} awake ${c.foes({ awake: true }).length} lesson ${JSON.stringify((hud.lesson as { id?: string } | null)?.id)}`) }
    const doorOpen = door.open > 0.9 || door.opening
    const goal = doorOpen ? (bossDoor.j + dz * 3) * W + (bossDoor.i + dx * 3) : before
    if (here === goal) {
      if (!doorOpen) {
        // Whatever followed him here is dealt with first: nothing follows him into the arena.
        const lurker = c.foes({ awake: true }).find(e => e.kind !== 'turret' && !e.boss && c.dist(e.x, e.z) < 40 && Math.abs((e.floor ?? 0) + e.y - c.p.y) < 3)
        if (lurker && m.time - waited < 25) { if (!waited0) waited = m.time; waited0 = true; c.aimAt(lurker); yield* c.wait(0.3); continue }
        if (c.dist(door.x, door.z) > 2.6) { c.face(door.x, door.z, 1.2); c.steer(door.x, door.z, 0.6); yield; continue }
        // Never walk into the Master hurt: a tank first.
        if (m.combat.hp < m.combat.maxHp * 0.7 && profile.inv.tanks > 0) { c.press('tank'); yield* c.wait(1) }
        c.face(door.x, door.z, 1.2)
        c.press('interact')
        yield* c.wait(1)
        continue
      }
      yield* c.wait(0.3)
      continue
    }
    if (m.map.terrain!.pit[here]) { yield* leavePlatform(c); continue }
    const route = plan(c, here, goal, dangerCells(c))
    if (!route || !route.length) { c.log(`no plan from ${here} to ${goal}`); yield* c.wait(1); throw new BotStuck('no plan') }
    const first = route[0]!
    const now = `${first.kind} ${first.from}->${first.to} (of ${route.length})`
    if (now !== said) { said = now; c.log(`step ${now} at ${p.x.toFixed(1)},${p.z.toFixed(1)},y${p.y.toFixed(1)}`) }
    yield* doStep(c, route)
  }
  c.log(`boss down; exit run (weapon ${m.exitWeapon}, lit ${m.exitLit})`)
  yield* afterBoss(c)
  c.log(`exit run over: phase ${hud.phase}`)
}

/** On a ladder with nothing planned (a fight or a stumble interrupted the climb): on to the end that is nearer the goal. */
function* finishLadder(c: Ctx, _open: boolean, goal: number): Task {
  const p = c.p
  const L = c.m.map.terrain!.ladders[c.m.climb!.t.ladders.length ? p.ladder : 0]
  if (!L) { yield; return }
  const W = c.m.map.w
  const foot = L.j * W + L.i
  const top = (L.j + L.dj) * W + L.i + L.di
  const a = plan(c, foot, goal)
  const b = plan(c, top, goal)
  const up = (b?.length ?? 999) <= (a?.length ?? 999)
  const k = up ? top : foot
  c.face(cx(c, k), cz(c, k))
  c.steer(cx(c, k), cz(c, k))
  yield
}

/** Riding the shuttle (a pit cell under him) with no hop in hand: stand still till a stop is in, then step onto the floor beside it. */
function* leavePlatform(c: Ctx): Task {
  const m = c.m
  const t = m.map.terrain!
  const W = m.map.w
  const p = c.p
  const hi = Math.floor(p.x / 3)
  const hj = Math.floor(p.z / 3)
  let best = -1
  let bd = 1e9
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const i = hi + di
      const j = hj + dj
      if (i < 0 || j < 0 || i >= W || j >= m.map.h) continue
      const k = j * W + i
      if (t.pit[k] || Math.abs(t.floor[k]! - p.y) > 0.6 || m.map.navBlock[k]) continue
      const d = Math.hypot(cx(c, k) - p.x, cz(c, k) - p.z)
      if (d < bd) { bd = d; best = k }
    }
  }
  if (best >= 0 && bd < 4.6) { c.face(cx(c, best), cz(c, best)); c.steer(cx(c, best), cz(c, best)) } else c.stop()
  yield
}

function* doStep(c: Ctx, route: Step[]): Task {
  const first = route[0]!
  const foe = nextFoe(c)
  if (foe) { yield* fightFoe(c, foe); return }
  if (first.kind === 'walk') {
    // Walk the whole run of plain steps to its last cell.
    const cells = [first.to]
    for (let n = 1; n < Math.min(route.length, 4) && route[n]!.kind === 'walk'; n++) cells.push(route[n]!.to)
    yield* walkRun(c, cells)
    return
  }
  if (first.kind === 'ladder') yield* hopLadder(c, first)
  else if (first.kind === 'lift') yield* hopLift(c, first)
  else yield* hopLeap(c, first)
}

void CELL
export const route = cryoRoute
