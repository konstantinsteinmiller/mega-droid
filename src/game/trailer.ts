import { currentMission } from './boot'
import { hud } from './state/hud'
import { profile } from './state/profile'
import type { WeaponId } from './data/weapons'
import { setSfxTap } from './audio/sfx'
import { setChargeHumTap } from './audio/synth'
import { cellCenter, CELL } from './world/levelGen'
import { floorAt, hasLineOfSight } from './world/nav'
import type { Enemy, World } from './sim/world'
import { wakeGolem } from './sim/enemies'
import { app } from './engine/app'

/**
 * ─── The trailer seam (DEV only) ────────────────────────────────────────────
 *
 * `window.__trailer`, for tools/cinematic-trailer: the recorder stages each
 * shot through it (god mode, a teleport, the boss room) and then lets the
 * AUTOPILOT play Flux through the same `Input` the keyboard and the touch
 * sticks write — charge, release, strafe, slide, special weapons — so every
 * shot, every enemy and every boss on camera behaves exactly as in a run.
 * The soft lock-on does the aiming, as it does for a touch player.
 *
 * It also taps every sound the game asks for (`setSfxTap`, `setChargeHumTap`)
 * and stamps it with the page clock, which the recorder owns while it films:
 * the audio stage replays that log through the game's own synth offline.
 */

export interface AutoPilot {
  /** 'charge': full charges; 'rapid': pellets; 'mix': two pellets, then a charge. */
  fire: 'charge' | 'rapid' | 'mix' | 'none'
  /** Seconds a charge is held before release. */
  chargeS: number
  /** Strafe amplitude (0..1) and period (s). */
  strafe: number
  strafePeriod: number
  /** Walk toward the target while farther than this (m); 0 = stand. */
  closeTo: number
  /** A slide every this many seconds (0 = never). */
  slideEvery: number
  /** Fire special weapon slot 1/2 (or 3 = the borrowed one) every N seconds. */
  weapon: 0 | 1 | 2 | 3
  weaponEvery: number
}

const OFF: AutoPilot = {
  fire: 'none', chargeS: 1.2, strafe: 0, strafePeriod: 2.4, closeTo: 0, slideEvery: 0, weapon: 0, weaponEvery: 0
}

/** The mission with its private fields in reach: this seam stages shots from outside. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = Record<string, any>

const mission = (): M | null => currentMission() as unknown as M | null

interface SoundEvent { t: number; k: 's' | 'h'; n?: string; p?: number; g?: number; m?: number; v?: number | null; f?: boolean; o?: boolean }

export const installTrailerSeam = (): void => {
  if (!import.meta.env.DEV) return
  let pilot: AutoPilot = { ...OFF }
  let pilotT = 0
  let charging = false
  let chargeT = 0
  let pellets = 0
  let slideT = 0
  let weaponT = 0
  let last = 0

  // ── The sound log ──
  let logging = false
  let t0 = 0
  let events: SoundEvent[] = []
  let humLast: number | null = null
  const now = (): number => (performance.now() - t0) / 1000
  setSfxTap((name, pan, gain, muffle) => {
    if (logging) events.push({ t: now(), k: 's', n: name, p: pan, g: gain, m: muffle })
  })
  setChargeHumTap((k01, full, over) => {
    if (!logging) return
    // Only the changes: the mission calls it every frame.
    const q = k01 === null ? null : Math.round(k01 * 50) / 50
    if (q === humLast) return
    humLast = q
    events.push({ t: now(), k: 'h', v: q, f: full, o: over })
  })

  const input = (): M['input'] | null => mission()?.input ?? null

  const releaseAll = (): void => {
    const i = input()
    if (!i) return
    if (i.fireHeld) i.fireReleased = true
    i.fireHeld = false
    i.moveX = 0
    i.moveY = 0
    charging = false
  }

  // ── A camera move: eased from one pose to another (world m) ──
  type Pose = [number, number, number, number, number, number]
  let move: { a: Pose; b: Pose; t0: number; dur: number } | null = null

  /** One autopilot step, on the page's own frame clock (virtual while filming). */
  const step = (): void => {
    const tNow = performance.now() / 1000
    const dt = Math.min(0.1, Math.max(0, tNow - last))
    last = tNow
    requestAnimationFrame(step)
    const m = mission()
    if (m && move) {
      const k = Math.min(1, (tNow - move.t0) / move.dur)
      const e = k * k * (3 - 2 * k)
      m.debugCam = move.a.map((v, i) => v + (move!.b[i]! - v) * e) as Pose
    }
    if (!m || pilot.fire === 'none' && !pilot.strafe && !pilot.closeTo) return
    const i = m.input
    if (hud.phase !== 'play') { releaseAll(); return }
    pilotT += dt
    // A trailer never runs dry: special weapons fire on cue.
    m.combat.we = m.combat.maxWe
    const p = m.player
    const t = targetOf(m)
    // ── Move: strafe across the target, close in when far ──
    const d = t ? Math.hypot(t.x - p.x, t.z - p.z) : 0
    i.moveX = pilot.strafe * Math.sin((pilotT * Math.PI * 2) / pilot.strafePeriod)
    i.moveY = t && pilot.closeTo > 0 && d > pilot.closeTo ? 0.85 : 0
    // ── Fire ──
    if (pilot.fire !== 'none' && t) {
      const wantCharge = pilot.fire === 'charge' || (pilot.fire === 'mix' && pellets >= 2)
      if (charging) {
        chargeT += dt
        if (chargeT >= pilot.chargeS) {
          i.fireHeld = false
          i.fireReleased = true
          charging = false
          pellets = 0
        }
      } else if (wantCharge) {
        i.fireHeld = true
        i.firePressed = true
        charging = true
        chargeT = 0
      } else if (m.combat.fireCd <= 0) {
        // A pellet: press and release on one step.
        i.firePressed = true
        i.fireReleased = true
        pellets++
      }
    }
    // ── Slide and special weapons ──
    if (pilot.slideEvery > 0) {
      slideT += dt
      if (slideT >= pilot.slideEvery) { slideT = 0; i.slideQueued = true }
    }
    if (pilot.weapon && pilot.weaponEvery > 0 && t) {
      weaponT += dt
      if (weaponT >= pilot.weaponEvery) { weaponT = 0; i.weaponQueued = pilot.weapon }
    }
  }
  last = performance.now() / 1000
  requestAnimationFrame(step)

  const targetOf = (m: M): Enemy | null => {
    const t = m.combat.target as Enemy | null
    if (t && t.state !== 'dead') return t
    const p = m.player
    let best: Enemy | null = null
    let bd = Infinity
    for (const e of m.enemies as Enemy[]) {
      if (e.state === 'dead' || e.offstage) continue
      const d = Math.hypot(e.x - p.x, e.z - p.z)
      if (d < bd) { bd = d; best = e }
    }
    return best && bd < 24 ? best : null
  }

  const api = {
    /** Shot staging: god mode (no hit lands, so no take ends early). */
    prepare(): void {
      const m = mission()
      if (m) m.combat.iframes = 1e9
    },
    phase: (): string => hud.phase,
    /** Where things are, for the recorder's log lines. */
    state(): Record<string, unknown> {
      const m = mission()
      if (!m) return { phase: hud.phase, mission: false }
      const p = m.player
      const alive = (m.enemies as Enemy[]).filter(e => e.state !== 'dead')
      const b = m.boss as Enemy | null
      return {
        phase: hud.phase,
        p: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), +p.yaw.toFixed(2)],
        enemies: alive.length,
        near: alive.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < 18).map(e => e.kind),
        target: (m.combat.target as Enemy | null)?.kind ?? null,
        boss: b ? { id: b.bossId, hp: +(b.hp / b.maxHp).toFixed(2), state: b.state, attack: b.attack, p2: b.phase2, started: m.bossStarted } : null
      }
    },
    /** Special weapons in both slots (owned too), energy full. */
    arm(slots: [WeaponId, WeaponId]): void {
      for (const id of slots) if (!profile.hero.weapons.includes(id)) profile.hero.weapons.push(id)
      profile.hero.slots = [slots[0], slots[1]]
      const m = mission()
      if (m) m.combat.we = m.combat.maxWe
    },
    /** The boss's health as a share of its max (phase 2 starts below half). */
    bossHp(f: number): void {
      const b = mission()?.boss as Enemy | null
      if (b) b.hp = Math.max(1, Math.round(b.maxHp * f))
    },
    /** True while the boss winds up (`tele`) or throws (`act`) one of `attacks`. */
    bossDoing(attacks: string[], states: string[] = ['tele', 'act']): boolean {
      const b = mission()?.boss as Enemy | null
      return !!b && attacks.includes(b.attack) && states.includes(b.state)
    },
    /** Put Flux at (x, z) facing `yaw` (on the floor there). */
    tp(x: number, z: number, yaw?: number): void {
      const m = mission()
      if (!m) return
      const p = m.player
      p.x = p.px = x
      p.z = p.pz = z
      p.y = p.py = p.safeY = floorAt(m.nav, x, z)
      p.vx = p.vz = p.vy = 0
      p.ladder = -1
      p.path = null
      if (yaw !== undefined) p.yaw = yaw
    },
    /** Face a point (yaw only). */
    face(x: number, z: number): void {
      const m = mission()
      if (!m) return
      const p = m.player
      p.yaw = Math.atan2(-(x - p.x), -(z - p.z))
    },
    /** Into the boss room, `back` m inside its door, facing in: the entrance fires. */
    enterBoss(back = 3): boolean {
      const m = mission()
      const room = m?.bossRoom
      if (!m || !room) return false
      const d = (m.doors as Array<{ to: number; x: number; z: number; axis: 'x' | 'z'; cellI: number; cellJ: number }>).find(o => o.to === room.id)
      if (!d) return false
      const cx = (room.x0 + room.w / 2) * CELL
      const cz = (room.z0 + room.h / 2) * CELL
      const dx = cellCenter(d.cellI)
      const dz = cellCenter(d.cellJ)
      const l = Math.hypot(cx - dx, cz - dz) || 1
      const x = dx + (cx - dx) / l * back
      const z = dz + (cz - dz) / l * back
      api.tp(x, z, Math.atan2(-(cx - x), -(cz - z)))
      return true
    },
    /** The boss room's centre and size (world m), for camera placement. */
    bossRoom(): { cx: number; cz: number; w: number; h: number } | null {
      const room = mission()?.bossRoom
      return room ? { cx: (room.x0 + room.w / 2) * CELL, cz: (room.z0 + room.h / 2) * CELL, w: room.w * CELL, h: room.h * CELL } : null
    },
    /** Nearest living enemies of `kinds` (or any), nearest first. */
    find(kinds?: string[]): Array<{ kind: string; x: number; z: number; d: number; room: number }> {
      const m = mission()
      if (!m) return []
      const p = m.player
      return (m.enemies as Enemy[])
        .filter(e => e.state !== 'dead' && !e.boss && (!kinds || kinds.includes(e.kind)))
        .map(e => ({ kind: e.kind, x: e.x, z: e.z, d: Math.hypot(e.x - p.x, e.z - p.z), room: e.room }))
        .sort((a, b) => a.d - b.d)
    },
    /** Stand `dist` m from the nearest enemy of `kinds` (or the boss: `['boss']`),
     *  in its sight, facing it. `prefer` (radians) is the bearing tried first. */
    approach(kinds: string[] | Enemy | undefined, dist = 8, prefer = 0): boolean {
      const m = mission()
      if (!m) return false
      const b = m.boss as Enemy | null
      const e = kinds && !Array.isArray(kinds) ? kinds
        : kinds?.[0] === 'boss' ? (b && b.state !== 'dead' ? b : null) : api.find(kinds)[0]
      if (!e) return false
      // Bearings around it, nearest to `prefer` first: a floor, no wall between.
      for (let k = 0; k < 24; k++) {
        const a = prefer + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12)
        const x = e.x + Math.sin(a) * dist
        const z = e.z + Math.cos(a) * dist
        if (!standable(m, x, z) || !hasLineOfSight(m.nav, x, z, e.x, e.z)) continue
        api.tp(x, z)
        api.face(e.x, e.z)
        return true
      }
      return false
    },
    /** Staging only: every machine but the boss within `r` m is gone (its
     *  death plays off camera), and the lock is on the boss. */
    clearAdds(r = 40): void {
      const m = mission()
      if (!m) return
      const p = m.player
      for (const e of m.enemies as Enemy[]) {
        if (e.boss || e.state === 'dead' || Math.hypot(e.x - p.x, e.z - p.z) > r) continue
        m.system.killEnemy(e)
      }
      if (m.boss && m.boss.state !== 'dead') m.combat.target = m.boss
    },
    /** Every living machine within `r` m down to `f` of its health (a
     *  trailer shows kills, not a war of attrition). Not the boss. */
    soften(f = 0.3, r = 30): void {
      const m = mission()
      if (!m) return
      const p = m.player
      for (const e of m.enemies as Enemy[]) {
        if (e.boss || e.state === 'dead' || Math.hypot(e.x - p.x, e.z - p.z) > r) continue
        e.hp = Math.max(1, Math.round(e.maxHp * f))
      }
    },
    /** Wake every machine within `r` m (they hunt as when they spot Flux). */
    wake(r = 20): void {
      const m = mission()
      if (!m) return
      const p = m.player
      for (const e of m.enemies as Enemy[]) {
        if (e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) < r) e.awake = true
      }
    },
    /** The autopilot: a partial setting merges over the current one; null = off. */
    auto(o: Partial<AutoPilot> | null): void {
      if (!o) { pilot = { ...OFF }; releaseAll(); return }
      pilot = { ...pilot, ...o }
      pilotT = 0
    },
    /** A fixed camera (world): from (x, y, z) looking at (lx, ly, lz); null = Flux's eyes. */
    cam(c: Pose | null): void {
      const m = mission()
      move = null
      if (!m) return
      m.debugCam = c
      // A free camera is no one's eyes: no arm cannon, no Atlas at its shoulder.
      m.vmScene.visible = !c
    },
    /** An eased camera move from pose `a` to pose `b` over `dur` s (page clock). */
    camMove(a: Pose, b: Pose, dur: number): void {
      move = { a, b, t0: performance.now() / 1000, dur }
      const m = mission()
      if (!m) return
      m.debugCam = a
      m.vmScene.visible = false
    },
    /** The live mission itself, for staging that reads its own map data
     *  (a stage's checkpoints, a rail, a secret, the finale). */
    m: (): M | null => mission(),
    /** Freeze / release the whole game loop (staging a moment to start on frame 0). */
    hold(on: boolean): void { app.setSuspended(on) },
    /** Wake a sleeping crate golem (as a hit would). */
    wakeGolem(e: Enemy): void {
      const m = mission()
      if (m) wakeGolem(m as unknown as World, e)
    },
    /** A cell's centre (world m). */
    cell: (i: number): number => cellCenter(i),
    /** The sound log: on resets the clock to now (the first recorded frame). */
    audioLog(on: boolean): void {
      logging = on
      t0 = performance.now()
      events = []
      humLast = null
    },
    /** Everything logged since the last take, oldest first. */
    audioTake(): SoundEvent[] {
      const out = events
      events = []
      return out
    }
  }
  ;(window as unknown as Record<string, unknown>).__trailer = api
}

const standable = (m: M, x: number, z: number): boolean => {
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= m.map.w || j >= m.map.h) return false
  return (m.map.room[j * m.map.w + i] ?? -1) >= 0 && Math.abs(floorAt(m.nav, x, z) - m.player.y) < 1.5
}
