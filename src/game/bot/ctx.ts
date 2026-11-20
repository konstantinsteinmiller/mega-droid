import { findPath, smoothPath, hasLineOfSight } from '../world/nav'
import { chargeInfo } from '../sim/stats'
import { EYE_H, PITCH_MAX, PITCH_MIN } from '../sim/constants'
import type { Enemy } from '../sim/world'
import type { BotMission } from './view'

/**
 * ─── The bot's hands ─────────────────────────────────────────────────────────
 *
 * A route is a generator: `function* (c: Ctx) { yield* c.goto(x, z); … }`.
 * Every `yield` ends the bot's turn for this frame; the mission then steps.
 * Holds (stick, fire, block) are cleared at the start of each turn and must
 * be asserted again by whatever is running, so a helper that returns lets go
 * of everything it was holding. Edges (press / release) are set for one step.
 *
 * Everything is a player's action: the stick (`moveX` / `moveY`, relative to
 * where he faces), fire, block, slide (the dash), interact, and the look, which
 * is written to `player.yaw` / `player.pitch` as a mouse would. Nothing
 * teleports, nothing hits for him.
 */
export type Task = Generator<void, void, void>

/** Anything that can be aimed at: a machine, or a lesson's drone. */
export interface Aim { x: number; z: number; y?: number; state?: string; alive?: boolean }

export class BotStuck extends Error {}

const ang = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

export class Ctx {
  /** Lines the bot says about itself (a ring), and a live echo for a harness. */
  readonly lines: string[] = []
  echo: ((s: string) => void) | null = null
  /** Set by the reflex layer: it is blocking or sliding, the route holds off. */
  reflexBusy = false
  /** A route that dodges red-ring attacks itself (it knows when its Master's rush locks) asks the reflex not to slide at their wind-up. */
  lateSlide = false
  /** A route that dashes out of red rings itself (onto firm floor): the reflex leaves them to it. */
  ownRedDodge = false
  private lastKillLog = -9

  constructor(public m: BotMission, private readonly stats: () => unknown) {}

  log(s: string): void {
    const line = `[${this.m.time.toFixed(1)}s] ${s}`
    this.lines.push(line)
    if (this.lines.length > 200) this.lines.shift()
    this.echo?.(line)
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  get p(): BotMission['player'] { return this.m.player }

  dist(x: number, z: number): number { return Math.hypot(x - this.p.x, z - this.p.z) }

  /** Machines that can still fight (awake or not), nearest first. */
  foes(opts: { awake?: boolean; room?: number; sameFloor?: boolean } = {}): Enemy[] {
    const p = this.p
    return this.m.enemies
      .filter(e => e.state !== 'dead' && !e.offstage && !e.buried && !e.dormant &&
        (opts.awake === undefined || e.awake === opts.awake) &&
        (opts.room === undefined || e.room === opts.room) &&
        (!opts.sameFloor || Math.abs((e.floor ?? 0) + e.y - p.y) < 2.5))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
  }

  sees(e: { x: number; z: number }): boolean {
    return hasLineOfSight(this.m.nav, this.p.x, this.p.z, e.x, e.z)
  }

  // ── Looking ────────────────────────────────────────────────────────────────

  /** Face a point now (a mouse flick). */
  face(x: number, z: number, y?: number): void {
    const p = this.p
    const dx = x - p.x
    const dz = z - p.z
    if (Math.hypot(dx, dz) > 0.05) p.yaw = Math.atan2(-dx, -dz)
    if (y !== undefined) {
      const eye = p.y + EYE_H
      p.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(y - eye, Math.max(0.3, Math.hypot(dx, dz)))))
    }
    this.syncEye()
  }

  /** Point the camera where Flux looks, as  does every frame: the shot
   *  reads the camera, and a headless run has no render to write it. */
  syncEye(): void {
    const p = this.p
    const cam = this.m.camera
    cam.position.set(p.x, p.y + EYE_H, p.z)
    cam.rotation.order = 'YXZ'
    cam.rotation.set(p.pitch, p.yaw, 0)
    cam.updateMatrixWorld()
  }

  /** Turn toward a bearing at most `rate` rad/s (a human's look, for scenes
   *  where an instant flick would break something). */
  turnTo(yaw: number, dt: number, rate = 6): void {
    const d = ang(yaw - this.p.yaw)
    this.p.yaw += Math.max(-rate * dt, Math.min(rate * dt, d))
  }

  aimAt(e: Aim | Enemy): void {
    const r = (e as Enemy).def?.radius
    this.face(e.x, e.z, (e.y ?? 0) + ((e as Enemy).floor ?? 0) + (r !== undefined ? Math.max(0.6, r) : 0))
  }

  // ── The stick ──────────────────────────────────────────────────────────────

  /** Walk straight toward a point, relative to where Flux is looking. */
  steer(x: number, z: number, speed = 1): void {
    const p = this.p
    const dx = x - p.x
    const dz = z - p.z
    const l = Math.hypot(dx, dz)
    if (l < 1e-3) return
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    const rx = Math.cos(p.yaw)
    const rz = -Math.sin(p.yaw)
    const i = this.m.input
    i.moveY = ((dx * fx + dz * fz) / l) * speed
    i.moveX = ((dx * rx + dz * rz) / l) * speed
  }

  stop(): void {
    this.m.input.moveX = 0
    this.m.input.moveY = 0
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  *wait(sec: number): Task {
    const end = this.m.time + sec
    while (this.m.time < end) yield
  }

  /** Until `cond()`; throws `BotStuck` past `timeout` seconds. */
  *until(cond: () => boolean, timeout = 30, what = 'a condition'): Task {
    const end = this.m.time + timeout
    while (!cond()) {
      if (this.m.time > end) throw new BotStuck(`timed out waiting for ${what}`)
      yield
    }
  }

  /**
   * Walk to (x, z) along the nav's own path (no ladders or lifts: those are
   * the route's own steps). Faces the way it walks unless `look` is set (to
   * keep facing a machine, say). Stops within `tol` metres. Throws `BotStuck`
   * when it makes no progress for `patience` seconds.
   */
  *goto(x: number, z: number, opts: { tol?: number; look?: () => { x: number; z: number; y?: number } | null; speed?: number; patience?: number; timeout?: number } = {}): Task {
    const tol = opts.tol ?? 0.6
    const patience = opts.patience ?? 6
    const deadline = this.m.time + (opts.timeout ?? 90)
    let best = Infinity
    let bestAt = this.m.time
    let path: Array<[number, number]> | null = null
    let pathAt = -99
    while (this.dist(x, z) > tol) {
      const p = this.p
      if (this.m.time > deadline) throw new BotStuck(`goto (${x.toFixed(1)}, ${z.toFixed(1)}) timed out`)
      if (this.m.time - pathAt > 0.5 || !path || !path.length) {
        const raw = findPath(this.m.nav, p.x, p.z, x, z, 1800, 1, false)
        path = raw ? smoothPath(this.m.nav, p.x, p.z, raw) : null
        pathAt = this.m.time
      }
      let wx = x
      let wz = z
      if (path && path.length) {
        while (path.length > 1 && Math.hypot(path[0]![0] - p.x, path[0]![1] - p.z) < 0.7) path.shift()
        ;[wx, wz] = path[0]!
      }
      const look = opts.look?.()
      if (look) this.face(look.x, look.z, look.y)
      else if (Math.hypot(wx - p.x, wz - p.z) > 0.3) p.yaw = Math.atan2(-(wx - p.x), -(wz - p.z))
      this.steer(wx, wz, opts.speed ?? 1)
      const d = this.dist(x, z)
      if (d < best - 0.4) { best = d; bestAt = this.m.time }
      if (this.m.time - bestAt > patience) throw new BotStuck(`goto (${x.toFixed(1)}, ${z.toFixed(1)}): no progress for ${patience}s at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}, y ${p.y.toFixed(1)})`)
      yield
    }
    this.stop()
  }

  /** One quick shot (a press), aimed. */
  shootOnce(e: Enemy): void {
    this.aimAt(e)
    const i = this.m.input
    i.firePressed = true
    i.fireHeld = true
  }

  /** Hold the charge to `level` (1–3), then release at `e`. From level 2 up the
   *  release waits for the PERFECT window (a crit) unless `perfect: false`. */
  *chargeShot(e: Aim, level: 1 | 2 | 3 = 2, opts: { perfect?: boolean } = {}): Task {
    const i = this.m.input
    const c = this.m.combat
    this.aimAt(e)
    i.firePressed = true
    i.fireHeld = true
    yield
    const end = this.m.time + 4
    for (;;) {
      this.aimAt(e)
      i.fireHeld = true
      const info = chargeInfo(c.charge, this.stats() as never)
      if (info.level >= level && (!(opts.perfect ?? level >= 2) || info.perfect)) break
      if (this.m.time > end || e.state === 'dead' || e.alive === false || c.dead) break
      yield
    }
    i.fireHeld = false
    i.fireReleased = true
    yield
  }

  /** Shoot `e` until it is down (quick shots; a charge first when `charge`). */
  *kill(e: Enemy, opts: { charge?: 1 | 2 | 3; approach?: number; timeout?: number; strafe?: boolean } = {}): Task {
    const end = this.m.time + (opts.timeout ?? 40)
    const near = opts.approach ?? 9
    while (e.state !== 'dead') {
      if (this.m.time > end) throw new BotStuck(`could not kill ${e.kind}`)
      const d = this.dist(e.x, e.z)
      if (this.m.time - this.lastKillLog > 2) { this.lastKillLog = this.m.time; this.log(`kill ${e.kind} d=${d.toFixed(1)} sees=${this.sees(e)} reflex=${this.reflexBusy} state=${e.state} hp=${e.hp}/${e.maxHp} guard=${e.guard}`) }
      if (this.reflexBusy) { yield; continue }
      if (d > near || !this.sees(e)) {
        this.aimAt(e)
        this.steer(e.x, e.z)
        yield
        continue
      }
      if (opts.charge) yield* this.chargeShot(e, opts.charge)
      else {
        this.shootOnce(e)
        yield
        this.m.input.fireHeld = false
        this.m.input.fireReleased = true
        yield
        yield
        yield
      }
    }
  }

  /** Walk in and kill every awake machine in sight, until none is left. */
  *clearRoom(opts: { room?: number; timeout?: number } = {}): Task {
    const end = this.m.time + (opts.timeout ?? 120)
    for (;;) {
      const list = this.foes({ awake: true, room: opts.room, sameFloor: true }).filter(e => !e.boss)
      if (!list.length) return
      if (this.m.time > end) throw new BotStuck('clearRoom timed out')
      yield* this.kill(list[0]!, { timeout: 40 })
    }
  }

  slide(dirX?: number, dirZ?: number): void {
    const i = this.m.input
    if (dirX !== undefined && dirZ !== undefined) this.steer(this.p.x + dirX, this.p.z + dirZ)
    i.slideQueued = true
  }

  press(what: 'interact' | 'beam' | 'tank'): void {
    const i = this.m.input
    if (what === 'interact') i.interactQueued = true
    else if (what === 'beam') i.beamQueued = true
    else i.tankQueued = true
  }
}
