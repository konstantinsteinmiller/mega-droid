import { buildBossRig, poseBoss, type BossId } from '../models/bosses'
import { Group } from 'three'
import type { Enemy, Shot, World } from './world'
import { ENEMIES, scaleDmg, scaleHp, type Element } from '../data/enemies'
import {
  buildEnemyRig, poseHardhat, poseTrooper, poseHeli, posePolar, poseMole, posePuffer, poseStalker, poseHornet, poseWarden, poseGatekeeper, poseHopper, poseRoller, poseBrute, poseTurret, poseGolem,
  BASE_COLORS, type EnemyKind, type EnemyColors
} from '../models/enemies'
import { makeTeleRing, setTeleRing, makeBlobShadow } from '../fx/markers'
import { hasLineOfSight, findPath, moveCircle, resolveCircle, smoothPath } from '../world/nav'
import { CELL } from '../world/levelGen'
import { PLAYER_R, EYE_H, FREEZE_SLOW, FREEZE_SLOW_BOSS } from './constants'
import { CHARGE_L2 } from './stats'
import { pushHud } from '../state/hud'
import type { Theme } from '../world/themes'
import {
  newMotion, rand, swingA, cycleLen, hopSquash, GAIT, BOSS_GAIT, FIDGET_LEN, BOSS_FIDGET_LEN, TAU, HOP_H, ROLLER_R,
  type GaitSpec
} from '../models/motion'

/**
 * ─── Enemy AI ────────────────────────────────────────────────────────────────
 *
 * One small state machine shared by every archetype:
 *
 *   idle ──sees you──▶ alert (0.45 s "!") ──▶ engage ──cooldown──▶ tele ──▶ act ──▶ recover ──▶ engage
 *                                                ▲                                                  │
 *                                                └──────────── stun (parry / full charge) ◀─────────┘
 *
 * `engage` is where the archetypes differ (keep range, hide, orbit, hop…);
 * `tele` always shows the ring, so every attack is readable a beat ahead.
 */

export const PARRY_WINDOW = 0.28

let nextId = 1

const ELEMENT_TINT: Record<Exclude<Element, 'none' | 'wind'>, Partial<EnemyColors>> = {
  fire: { main: '#ff6a3d', deep: '#b8321c', accent: '#ffd23a', eye: '#fff27a' },
  ice: { main: '#7fd6ff', deep: '#2f78ad', accent: '#ffffff', eye: '#bff6ff' },
  volt: { main: '#ffe13d', deep: '#7a4fd6', accent: '#b98cff', eye: '#d3fbff' }
}

export const colorsFor = (kind: EnemyKind, element: Element, elite: boolean): EnemyColors => {
  const base = { ...BASE_COLORS[kind] }
  // A golem's colours are its sector's crate (golemColors): an element tint
  // would repaint the disguise
  if (element !== 'none' && element !== 'wind' && kind !== 'golem') Object.assign(base, ELEMENT_TINT[element])
  if (elite) base.accent = '#ffd84a'
  return base
}

/**
 * A crate golem in its sector's crate: the wood, trim and glowing nubs of
 * `buildCrate(theme)` exactly, stone limbs, iron bands (an elite's gold — on
 * the limbs only, so an elite sleeps looking like any other crate).
 */
export const golemColors = (theme: Pick<Theme, 'crate' | 'crateTrim' | 'accent'>, elite = false): EnemyColors => ({
  ...BASE_COLORS.golem,
  main: theme.crate,
  deep: theme.crateTrim,
  eye: theme.accent,
  accent: elite ? '#ffd84a' : BASE_COLORS.golem.accent
})

/**
 * PENDING USER DECISION (c): the guard an UNAWARE trooper stands with. 1 (as
 * today) = its shield is already up, so a first shot at a sleeping trooper
 * TINKs off. 0 = relaxed at rest: the shield hangs at its side AND first
 * shots land (the view draws `e.guard`, `combat.ts` tests it); engage raises
 * it at 4/s as ever. This one number is the whole switch.
 */
export const UNAWARE_TROOPER_GUARD = 1

/** A Master's echo is drawn at this share of its Master's size. */
export const ECHO_SCALE = 0.82
/** The Warden's shutters stay open this long after it fires (s). */
export const WARDEN_OPEN = 1.7
/** The Gatekeeper: its chest hatch stays open after a barrage (s), and its
 *  stomp's reach (m). */
export const GATE_OPEN = 2.4
export const GATE_STOMP_R = 3.2

/** The Hornet Rotor's dive speed (m/s). */
export const HORNET_DIVE = 13

/** The Glow Stalker lunges from this close (m). */
export const STALKER_LUNGE_R = 6.5

/** The Puffer Mine: it swells this close (m), and its burst's reach (m). */
export const PUFFER_SWELL_R = 4.2
export const PUFFER_RING = 4

/** The Mole Driller: how long it takes to dig in (s), how close (m) it must
 *  tunnel before it strikes, the strike's reach (m), and how long it stays
 *  out after (s, open to fire). */
export const MOLE_DIG = 0.4
export const MOLE_STRIKE = 6
export const MOLE_REACH = 1.6
export const MOLE_OUT = 1.8

/** The Polar Pup's shell: shut this long (shots TINK), then open (s). */
export const POLAR_SHUT = 2.6
export const POLAR_OPEN = 1.8

export const createEnemy = (
  kind: EnemyKind, level: number, x: number, z: number, room: number,
  opts: { elite?: boolean; element?: Element; theme?: Pick<Theme, 'crate' | 'crateTrim' | 'accent'>; echo?: BossId; colors?: EnemyColors } = {}
): Enemy => {
  const golem = kind === 'golem'
  // A golem's own copy: its hit volume shrinks to a crate's while it sleeps
  const def = golem ? { ...ENEMIES.golem, aimY: GOLEM_SLEEP_AIM, hitR: GOLEM_SLEEP_HIT } : ENEMIES[kind]
  const elite = !!opts.elite
  const element = golem ? 'none' : opts.element ?? 'none'
  // A Master's echo wears its Master's rig, a little smaller.
  const echo = kind === 'echo' ? opts.echo ?? 'blazeMaster' : undefined
  const rig = echo ? buildBossRig(echo) : buildEnemyRig(kind, opts.colors ?? (golem && opts.theme ? golemColors(opts.theme, elite) : colorsFor(kind, element, elite)))
  const root = new Group()
  root.add(rig.root)
  const scale = elite ? 1.18 : 1
  // An elite golem sleeps crate-sized and grows as it unfolds (syncEnemyVisual)
  rig.root.scale.setScalar(golem ? 1 : echo ? ECHO_SCALE : scale)
  const hp = Math.round(scaleHp(def.hp, level) * (elite ? 2.5 : 1))
  const id = nextId++
  const e: Enemy = {
    id, kind, def, level, elite, boss: false, element,
    nameKey: `enemy.${kind}`,
    x, z, y: def.fly, px: x, pz: z, py: def.fly, yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0,
    hp, maxHp: hp, dmg: Math.round(scaleDmg(def.dmg, level) * (elite ? 1.3 : 1)),
    room, awake: false, state: 'idle', st: 0, cd: 0.6 + Math.random() * 1.2, attack: '', step: 0,
    teleDur: def.tele, teleRed: def.unblockable, guard: kind === 'hardhat' ? 1 : kind === 'trooper' ? UNAWARE_TROOPER_GUARD : 0, aim: 0,
    stunT: 0, stunN: 0, stunAge: 99, stunImmune: 0, flash: 0, path: null, pathT: 0, walk: 0, anim: Math.random() * 10, mo: newMotion(id, kind), a: 0, b: 0,
    tx: 0, tz: 0, sx: 0, sz: 0, hitPlayer: false,
    rig, root, shadow: makeBlobShadow(def.radius * 1.1 * scale), ring: makeTeleRing(), deathT: 0,
    guardBreakT: 0, hurtAt: -10, bossId: null, phase2: false, burnT: 0, burnDps: 0, frozenT: 0, lastWeapon: ''
  }
  // A Mole Driller waits half dug in until it wakes and digs under.
  if (kind === 'mole') e.a = 0.75
  // The Fortress's armour starts shut.
  if (kind === 'warden' || kind === 'gatekeeper') e.guard = 1
  if (echo) {
    e.echoOf = echo
    e.nameKey = `boss.${echo}`
  }
  if (golem) {
    // Asleep as a crate; `hold` keeps gunfire from waking it (mission.makeNoise)
    // and puts it last on the objective trail, like a lesson's sleeping drone
    e.dormant = true
    e.hold = true
    const c = golemColors(opts.theme ?? { crate: BASE_COLORS.golem.main, crateTrim: BASE_COLORS.golem.deep, accent: BASE_COLORS.golem.eye })
    e.golem = { wood: c.main, trim: c.deep, navIdx: -1, unfold: 0, dodgeCd: 0, throws: 0, side: id % 2 ? 1 : -1, hopSide: 1, aimT: 0 }
  }
  return e
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const angDiff = (a: number, b: number): number => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

const faceTo = (e: Enemy, x: number, z: number, rate: number, dt: number): void => {
  const want = Math.atan2(x - e.x, z - e.z)
  const d = angDiff(want, e.yaw)
  e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d))
}

const distToPlayer = (w: World, e: Enemy): number => Math.hypot(w.player.x - e.x, w.player.z - e.z)

const seesPlayer = (w: World, e: Enemy): boolean =>
  hasLineOfSight(w.nav, e.x, e.z, w.player.x, w.player.z)

/** Flux stands in this machine's own room. */
const inMyRoom = (w: World, e: Enemy): boolean => {
  const m = w.map
  const i = Math.floor(w.player.x / CELL)
  const j = Math.floor(w.player.z / CELL)
  if (e.room < 0 || i < 0 || j < 0 || i >= m.w || j >= m.h) return false
  return m.room[j * m.w + i] === e.room
}
/** Beyond this nothing fires, its room or not (m). */
export const ROOM_REACH = 32
/**
 * Close enough to shoot: within the machine's own range, or anywhere in its
 * room (a playtest note: machines in a big room watched Flux shoot them from
 * just past their range and never answered). The caller has the sight line.
 */
export const inReach = (w: World, e: Enemy, d: number, range: number): boolean =>
  d < range || (d < ROOM_REACH && inMyRoom(w, e))

const _out: [number, number] = [0, 0]

/** Move with collision; returns the fraction of the intended move achieved. */
const step = (w: World, e: Enemy, dx: number, dz: number): number => {
  const want = Math.hypot(dx, dz)
  if (want < 1e-5) return 1
  if (e.rooted) return 0
  moveCircle(w.nav, e.x, e.z, dx, dz, e.def.radius, _out)
  const got = Math.hypot(_out[0] - e.x, _out[1] - e.z)
  e.x = _out[0]
  e.z = _out[1]
  return got / want
}

/** Steer toward (tx, tz) at `speed`: straight when visible, A* otherwise. */
const seek = (w: World, e: Enemy, tx: number, tz: number, speed: number, dt: number): void => {
  let gx = tx
  let gz = tz
  if (!hasLineOfSight(w.nav, e.x, e.z, tx, tz)) {
    e.pathT -= dt
    if (!e.path || e.pathT <= 0) {
      const raw = findPath(w.nav, e.x, e.z, tx, tz, 700)
      e.path = raw ? smoothPath(w.nav, e.x, e.z, raw, e.def.radius) : null
      e.pathT = 0.7
    }
    if (e.path && e.path.length) {
      const [wx, wz] = e.path[0]!
      if (Math.hypot(wx - e.x, wz - e.z) < 0.5) e.path.shift()
      if (e.path.length) [gx, gz] = e.path[0]!
    }
  } else {
    e.path = null
  }
  const dx = gx - e.x
  const dz = gz - e.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return
  const sp = Math.min(speed, d / dt)
  step(w, e, (dx / d) * sp * dt, (dz / d) * sp * dt)
}

/** Hold the preferred distance band; strafe a little inside it. */
const keepRange = (w: World, e: Enemy, dt: number, strafe = 0.6): void => {
  const d = distToPlayer(w, e)
  const [lo, hi] = e.def.range
  const sp = e.def.speed
  if (d > hi || !seesPlayer(w, e)) {
    seek(w, e, w.player.x, w.player.z, sp, dt)
  } else if (d < lo) {
    const dx = (e.x - w.player.x) / (d || 1)
    const dz = (e.z - w.player.z) / (d || 1)
    step(w, e, dx * sp * 0.8 * dt, dz * sp * 0.8 * dt)
  } else if (strafe > 0) {
    const s = Math.sin(w.time * 0.9 + e.id * 1.7)
    const dx = (e.z - w.player.z) / (d || 1)
    const dz = -(e.x - w.player.x) / (d || 1)
    step(w, e, dx * s * sp * strafe * dt, dz * s * sp * strafe * dt)
  }
}

/** Keep enemies from stacking on each other (and off the player). */
const separate = (w: World, e: Enemy): void => {
  for (const o of w.enemies) {
    if (o === e || o.state === 'dead' || o.offstage) continue
    const dx = e.x - o.x
    const dz = e.z - o.z
    const rr = e.def.radius + o.def.radius
    const d2 = dx * dx + dz * dz
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2)
      const push = (rr - d) * 0.5
      e.x += (dx / d) * push
      e.z += (dz / d) * push
    }
  }
  if (e.def.fly === 0) {
    const dx = e.x - w.player.x
    const dz = e.z - w.player.z
    const rr = e.def.radius + PLAYER_R
    const d2 = dx * dx + dz * dz
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2)
      e.x += (dx / d) * (rr - d)
      e.z += (dz / d) * (rr - d)
    }
  }
  const [rx, rz] = resolveCircle(w.nav, e.x, e.z, e.def.radius)
  e.x = rx
  e.z = rz
}

const enterState = (e: Enemy, s: Enemy['state']): void => {
  e.state = s
  e.st = 0
}

/** The Guardroid's rush: from this far (m)… */
export const BRUTE_RUSH_MIN = 5
/** …to this far (m), for at most this long (s). */
export const BRUTE_RUSH_MAX = 12
export const BRUTE_RUSH_TIME = 0.95
/** Rushing into a wall staggers it this long (s). */
export const BRUTE_WALL_STUN = 1.3
/** An elite Guardroid's arm-cannon volley reaches this far (m). */
export const BRUTE_VOLLEY_MAX = 16

const startTele = (e: Enemy, attack: string, dur: number, red: boolean): void => {
  e.attack = attack
  e.teleDur = dur
  e.teleRed = red
  enterState(e, 'tele')
}

/** Wake an enemy (and, a beat later, its room-mates). A machine asleep in
 *  disguise sleeps through all of it: only a hit wakes it (`wakeGolem`). */
export const wake = (w: World, e: Enemy, chain = true): void => {
  if (e.awake || e.state === 'dead' || e.offstage || e.dormant) return
  e.awake = true
  e.hold = false
  enterState(e, 'alert')
  e.cd = Math.max(e.cd, 0.8 + Math.random() * 0.6)
  if (chain) {
    for (const o of w.enemies) {
      if (o !== e && !o.awake && o.room === e.room && o.state !== 'dead' && !o.offstage && !o.dormant) {
        o.awake = true
        enterState(o, 'alert')
        o.st = -0.15 - Math.random() * 0.35
        o.cd = Math.max(o.cd, 1.2 + Math.random() * 1.2)
      }
    }
  }
  w.sfx('alert', e.x, e.z)
}

// ─── Crate golem ──────────────────────────────────────────────────────────────
//
// Asleep it is a supply crate against a wall: solid like one, silent, never
// noticed or locked on to, and no hit hurts it — the first one (a pellet, a
// charge, a copied weapon, a blast) only wakes it, with a TINK. It unfolds
// (GOLEM_UNFOLD, still untouchable), then keeps 6–12 m from Flux, backing off
// faster than it closes, and throws rocks it pulls out of itself: two quick
// throws (orange: block, parry them back), then a boulder lobbed at where he
// stands (red, a floor marker: step out). A charged shot it can see coming,
// fired from beyond GOLEM_DODGE_MIN, it hops out of the way of — sideways off
// the shot's line, its preferred side alternating so the hop can be read, with
// a cooldown (the moment to fire the second charge), never while it winds up
// a throw (committed), and never when walls leave it no room. Pellets it
// ignores. So the answer is to get close — or corner it, or bait the hop.

/** The unfold, crate to golem (s); it takes no damage until it is done. */
export const GOLEM_UNFOLD = 0.8
/** Flux nearer than this (m): a charged shot arrives before it can react. */
export const GOLEM_DODGE_MIN = 5
/** Seconds between hops, [min, max]: long enough to punish, short enough to matter. */
export const GOLEM_DODGE_CD: readonly [number, number] = [1.2, 1.6]
/** The hop: duration (s), sideways reach (m), height (m). */
export const GOLEM_DODGE_T = 0.34
export const GOLEM_DODGE_DIST = 2.6
const GOLEM_HOP_H = 0.45
/** It notices a shot whose closest pass is this near in time (s). */
const GOLEM_SEE_T = 0.8
/** Asleep, its hit volume is the crate's (awake: ENEMIES.golem). */
export const GOLEM_SLEEP_AIM = 0.6
export const GOLEM_SLEEP_HIT = 0.72
/** Its crate's solid on the nav while asleep (objectives.ts gives crates 0.62). */
const GOLEM_PROP_R = 0.62
/** Rocks fall at this (m/s²) — combat.ts flies them on it too. */
export const ROCK_G = 10
/** The thrown rock's ground speed (m/s): a readable arc, not a bullet. */
const GOLEM_THROW_SPEED = 13
/** The ram (#281): Flux nearer than this (m), and not on top of it, it
 *  charges him instead of throwing — a red line along its lane for
 *  GOLEM_RAM_TELE, then a dash of GOLEM_RAM_SPEED for GOLEM_RAM_TIME. A block
 *  takes the blow at a quarter, a slide's dodge lets it pass, a perfect block
 *  stuns it (it is melee). */
export const GOLEM_RAM_R = 5
export const GOLEM_RAM_TELE = 0.5
export const GOLEM_RAM_SPEED = 9
export const GOLEM_RAM_TIME = 0.6
/** The boulder lob: wind-up (s, red ring) and flight (s). */
const GOLEM_LOB_TELE = 1.0
const GOLEM_LOB_DUR = 1.15
/** Where the rock leaves the fist (golem-local, rig units): the fist at the
 *  top of the wind-up (models/enemies.ts GOLEM_WOUND), high beside the lid. */
const GOLEM_RELEASE = { x: 0.85, y: 1.8, z: -0.2 } as const

export interface GolemState {
  /** Its crate's wood and trim (its debris and death burst). */
  wood: string
  trim: string
  /** Its crate-sized solid in `nav.props` while asleep; −1 until placed. */
  navIdx: number
  /** 0 asleep … 1 unfolded, on its own clock from the wake (a stun mid-unfold
   *  does not stall it). Below 1 no hit hurts it. */
  unfold: number
  /** Seconds until it can hop again. */
  dodgeCd: number
  /** Throws since its last lob: two throws, then the boulder. */
  throws: number
  /** The side its next hop prefers (they alternate). */
  side: 1 | -1
  /** The side of the hop under way (the lean). */
  hopSide: 1 | -1
  /** Seconds a full charge has been held on it from out of reach (the brace). */
  aimT: number
}

/** No damage lands: still asleep, or still unfolding. */
export const golemShielded = (e: Enemy): boolean => !!e.golem && (!!e.dormant || e.golem.unfold < 1)

/** The first hit on a sleeping golem: it wakes (no damage — see combat.ts). */
export const wakeGolem = (w: World, e: Enemy): void => {
  const g = e.golem
  if (!g || !e.dormant || e.state === 'dead') return
  e.dormant = false
  // Its crate's solid goes: it is a body now (separate() takes over)
  const prop = g.navIdx >= 0 ? w.nav.props[g.navIdx] : undefined
  if (prop) prop.active = false
  wake(w, e)
  // Its first throw waits for the unfold and a beat to look at you
  e.cd = Math.max(e.cd, GOLEM_UNFOLD + 0.5 + Math.random() * 0.4)
  // A puff of dust off the floor all round, and the grind of opening up
  const fy = e.floor ?? 0
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    w.fx.emit({
      x: e.x + Math.cos(a) * 0.55, y: fy + 0.1, z: e.z + Math.sin(a) * 0.55,
      vx: Math.cos(a) * 2.4, vy: 0.5 + Math.random() * 0.6, vz: Math.sin(a) * 2.4,
      color: '#a8987f', size: 0.5, sizeEnd: 1.25, life: 0.6, drag: 3
    })
  }
  w.sfx('door', e.x, e.z)
}

/** Asleep: a crate stands still. Whatever tried to move it (a revive's
 *  shove-back, a freeze) is undone, and it is solid like the crate it is. */
const golemSleep = (w: World, e: Enemy): void => {
  const g = e.golem!
  e.state = 'idle'
  e.st = 0
  e.stunT = 0
  e.frozenT = 0
  e.burnT = 0
  e.y = 0
  e.ring.visible = false
  if (g.navIdx < 0) {
    g.navIdx = w.nav.props.length
    w.nav.props.push({ x: e.x, z: e.z, r: GOLEM_PROP_R, active: true })
  }
}

const isChargeShot = (s: Shot): boolean => s.kind === 'charge1' || s.kind === 'charge2' || s.kind === 'charge3'

/**
 * A charged shot on a collision course, soon enough to matter: its closest
 * pass (in plan) comes within GOLEM_SEE_T and within its body plus the shot's
 * size — or it homes on this golem, which is a collision course by definition.
 */
export const shotThreatens = (e: Enemy, s: Shot): boolean => {
  const rx = e.x - s.x
  const rz = e.z - s.z
  const vv = s.vx * s.vx + s.vz * s.vz
  if (vv < 1e-6) return false
  const tca = (rx * s.vx + rz * s.vz) / vv
  if (tca < 0 || tca > GOLEM_SEE_T) return false
  if (s.homing === e) return true
  const cx = rx - s.vx * tca
  const cz = rz - s.vz * tca
  const rr = e.def.hitR * (e.elite ? 1.18 : 1) + s.radius + 0.35
  return cx * cx + cz * cz < rr * rr
}

const _probe: [number, number] = [0, 0]
/** How much of a hop along (dx, dz) the walls and props allow (0..1). */
const hopRoom = (w: World, e: Enemy, dx: number, dz: number): number => {
  moveCircle(w.nav, e.x, e.z, dx * GOLEM_DODGE_DIST, dz * GOLEM_DODGE_DIST, e.def.radius, _probe)
  return Math.hypot(_probe[0] - e.x, _probe[1] - e.z) / GOLEM_DODGE_DIST
}

/** Hop out of a charged shot's line, if one is coming and there is room. */
const golemTryDodge = (w: World, e: Enemy, d: number): boolean => {
  const g = e.golem!
  const shots = w.shots
  if (!shots || g.dodgeCd > 0 || g.unfold < 1 || d <= GOLEM_DODGE_MIN) return false
  let threat: Shot | null = null
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]!
    if (s.active && s.owner === 'player' && isChargeShot(s) && shotThreatens(e, s)) { threat = s; break }
  }
  if (!threat) return false
  const l = Math.hypot(threat.vx, threat.vz) || 1
  // Off the line, square to it: the preferred side first, the other if walled in
  const nx = -threat.vz / l
  const nz = threat.vx / l
  let side = g.side
  let room = hopRoom(w, e, nx * side, nz * side)
  if (room < 0.6) {
    const other = hopRoom(w, e, -nx * side, -nz * side)
    if (other > room) {
      side = side === 1 ? -1 : 1
      room = other
    }
  }
  // Cornered: no room to hop, so the shot lands
  if (room < 0.5) return false
  e.sx = e.x
  e.sz = e.z
  e.tx = e.x + nx * side * GOLEM_DODGE_DIST * room
  e.tz = e.z + nz * side * GOLEM_DODGE_DIST * room
  g.hopSide = side
  g.side = side === 1 ? -1 : 1
  g.dodgeCd = GOLEM_DODGE_CD[0] + Math.random() * (GOLEM_DODGE_CD[1] - GOLEM_DODGE_CD[0])
  // It slips the lock: every charge homing on it flies on where it was going
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]!
    if (s.active && s.homing === e) s.homing = null
  }
  e.attack = 'dodge'
  enterState(e, 'act')
  e.ring.visible = false
  const fy = e.floor ?? 0
  for (let k = 0; k < 8; k++) {
    w.fx.emit({
      x: e.x + (Math.random() - 0.5) * 0.9, y: fy + 0.12, z: e.z + (Math.random() - 0.5) * 0.9,
      vx: -nx * side * (1 + Math.random() * 2), vy: 0.6 + Math.random(), vz: -nz * side * (1 + Math.random() * 2),
      color: '#a8987f', size: 0.45, sizeEnd: 1.1, life: 0.45, drag: 3
    })
  }
  pushHud({ t: 'text', x: e.x, y: fy + e.y + 2.1, z: e.z, key: 'combat.dodge', color: '#e8dcc4' })
  w.sfx('dash', e.x, e.z)
  w.sfx('jump', e.x, e.z)
  return true
}

/** One tick of the hop: most of the distance early (so it really clears the
 *  line), an arc in the air, dust where it lands. */
const golemHop = (w: World, e: Enemy, dt: number): void => {
  const k = Math.min(1, e.st / GOLEM_DODGE_T)
  const ease = 1 - (1 - k) * (1 - k)
  step(w, e, e.sx + (e.tx - e.sx) * ease - e.x, e.sz + (e.tz - e.sz) * ease - e.z)
  e.y = Math.sin(k * Math.PI) * GOLEM_HOP_H
  faceTo(e, w.player.x, w.player.z, 6, dt)
  if (k >= 1) {
    e.y = 0
    const fy = e.floor ?? 0
    w.shocks.spawn(e.x, fy + 0.05, e.z, 1.4, '#c9b89a', 0.3)
    w.fx.sparks(e.x, fy + 0.15, e.z, '#b3a386', 8, 3, 0.2)
    w.sfx('punch', e.x, e.z)
    enterState(e, 'recover')
  }
}

/** The thrown rock: from the fist high over the lid, on an arc that meets
 *  Flux's chest where he stands now (combat.ts flies it under ROCK_G). */
/** The ram's dash: along its locked lane until it meets Flux (a melee
 *  blow: blockable, parryable), a wall, or its time. */
const golemRam = (w: World, e: Enemy, dt: number): void => {
  const frac = step(w, e, e.tx * GOLEM_RAM_SPEED * dt, e.tz * GOLEM_RAM_SPEED * dt)
  if (Math.random() < 0.5) w.fx.sparks(e.x - e.tx * 0.6, 0.15, e.z - e.tz * 0.6, '#c9b79a', 2, 2, 0.14)
  if (!e.hitPlayer && Math.hypot(w.player.x - e.x, w.player.z - e.z) < e.def.radius + PLAYER_R + 0.25) {
    e.hitPlayer = true
    w.hitPlayer(e, Math.round(e.dmg * 1.2), { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })
    enterState(e, 'recover')
  } else if ((frac < 0.4 && e.st > 0.08) || e.st > GOLEM_RAM_TIME) enterState(e, 'recover')
}

const golemThrow = (w: World, e: Enemy): void => {
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  const sc = e.rig.root.scale.x
  const R = GOLEM_RELEASE
  const ox = e.x + (sy * R.z + cy * R.x) * sc
  const oz = e.z + (cy * R.z - sy * R.x) * sc
  // World heights: the climb's floors under it and under Flux (0 on a flat map)
  const oy = (e.floor ?? 0) + e.y + R.y * sc
  const tx = w.player.x
  const tz = w.player.z
  const T = Math.max(0.22, Math.hypot(tx - ox, tz - oz) / GOLEM_THROW_SPEED)
  const vx = (tx - ox) / T
  const vz = (tz - oz) / T
  const vy = ((w.player.y ?? 0) + EYE_H - 0.45 - oy) / T + 0.5 * ROCK_G * T
  w.fireEnemyShot(e, ox, oy, oz, vx, vy, vz, Math.hypot(vx, vy, vz), e.dmg, true, true)
  w.sfx('lob', e.x, e.z)
}

/** Hold 6–12 m: close in when far or out of sight, back off (faster than it
 *  closes, sliding along a wall it backs into), idle-strafe in the band. */
const golemRange = (w: World, e: Enemy, dt: number, d: number): void => {
  const [lo, hi] = e.def.range
  const sp = e.def.speed
  const px = w.player.x
  const pz = w.player.z
  if (d > hi || !seesPlayer(w, e)) {
    seek(w, e, px, pz, sp, dt)
  } else if (d < lo) {
    const bx = (e.x - px) / (d || 1)
    const bz = (e.z - pz) / (d || 1)
    const k = sp * (d < lo - 2 ? 1.3 : 1.1) * dt
    if (step(w, e, bx * k, bz * k) < 0.4) {
      // Backed into a wall: slide along it, away from where Flux looks
      const g = e.golem!
      step(w, e, -bz * k * g.side, bx * k * g.side)
    }
  } else {
    const s = Math.sin(w.time * 0.8 + e.id * 1.7)
    step(w, e, ((e.z - pz) / d) * s * sp * 0.45 * dt, (-(e.x - px) / d) * s * sp * 0.45 * dt)
  }
}

/** Is Flux holding a full charge on it from out of reach? */
const fullChargeOn = (w: World, e: Enemy, d: number): boolean => {
  const c = w.combat
  if (!c?.charging || d <= GOLEM_DODGE_MIN) return false
  if (c.charge < CHARGE_L2 * (w.stats?.chargeTimeMul ?? 1)) return false
  const p = w.player
  return Math.abs(angDiff(Math.atan2(-(e.x - p.x), -(e.z - p.z)), p.yaw)) < 0.22
}

/** Every awake tick: the unfold and its beats, the hop cooldown, the brace
 *  tell, its hit volume growing to its full size, and back to the floor after
 *  a hop cut short (a stun in the air). */
const golemTick = (w: World, e: Enemy, dt: number, d: number): void => {
  const g = e.golem!
  const was = g.unfold
  g.unfold = Math.min(1, g.unfold + dt / GOLEM_UNFOLD)
  const fy = e.floor ?? 0
  if (was < 0.42 && g.unfold >= 0.42) {
    // The legs slam down: the box jumps up on them
    w.shocks.spawn(e.x, fy + 0.05, e.z, 1.6, '#c9b89a', 0.35)
    w.fx.sparks(e.x, fy + 0.15, e.z, '#b3a386', 10, 3.5, 0.22)
    w.sfx('stomp', e.x, e.z)
    if (d < 9) w.shake(0.12)
  } else if (was < 0.9 && g.unfold >= 0.9) {
    // The fists clack together in front of it: ready
    const sy = Math.sin(e.yaw)
    const cy = Math.cos(e.yaw)
    w.fx.sparks(e.x + sy * 0.6, fy + 1.2, e.z + cy * 0.6, '#fff1c8', 10, 4, 0.16)
    w.sfx('punch', e.x, e.z)
  }
  const k = g.unfold
  e.def.aimY = GOLEM_SLEEP_AIM + (ENEMIES.golem.aimY - GOLEM_SLEEP_AIM) * k
  e.def.hitR = GOLEM_SLEEP_HIT + (ENEMIES.golem.hitR - GOLEM_SLEEP_HIT) * k
  g.dodgeCd = Math.max(0, g.dodgeCd - dt)
  g.aimT = fullChargeOn(w, e, d) ? g.aimT + dt : 0
  if (!(e.state === 'act' && e.attack === 'dodge') && e.y > 0) e.y = Math.max(0, e.y - dt * 7)
}

// ─── Main update ─────────────────────────────────────────────────────────────

/**
 * The step a chilled machine lives: slower in everything it does (walk,
 * turn, telegraph, recover), except a leap already in the air, whose arc
 * keeps its speed and length.
 */
export const frozenDt = (e: Enemy, dt: number): number => {
  if (e.frozenT <= 0 || e.state === 'dead') return dt
  if (e.kind !== 'heli' && e.kind !== 'polar' && e.kind !== 'puffer' && e.kind !== 'hornet' && e.y > (e.floor ?? 0) + 0.2) return dt
  return dt * (1 - (e.boss ? FREEZE_SLOW_BOSS : FREEZE_SLOW))
}

/**
 * ─── Stun diminishing returns ───────────────────────────────────────────────
 *
 * A machine shot with charged shots from a distance used to spend the whole
 * fight stunned: every full charge interrupted it again before it could act
 * (playtest: a Guardroid on a ledge, stunlocked forever — "feels like a
 * cheat"). Now each stun the PLAYER's weapons cause within STUN_CHAIN of the
 * last one lasts half as long, and the one after STUN_CHAIN_MAX stuns in a
 * row does not land: the machine shrugs it off (a shield flash) and is
 * immune for STUN_IMMUNE. Parries and a machine's own blunders (a Gear Roller
 * into a wall) are not part of it — those are earned or free.
 */
export const STUN_CHAIN = 6
export const STUN_CHAIN_MAX = 3
export const STUN_IMMUNE = 3

/** Stun `e` for `dur` seconds, diminished by its chain. Returns the stun
 *  given (0: immune, or the chain just ran out — `resisted` then). */
export const tryStun = (e: Enemy, dur: number): { dur: number; resisted: boolean } => {
  if (e.stunImmune > 0) return { dur: 0, resisted: false }
  e.stunN = e.stunAge < STUN_CHAIN ? e.stunN + 1 : 1
  e.stunAge = 0
  if (e.stunN > STUN_CHAIN_MAX) {
    e.stunN = 0
    e.stunImmune = STUN_IMMUNE
    return { dur: 0, resisted: true }
  }
  const d = dur * Math.pow(0.5, e.stunN - 1)
  const cur = e.state === 'stun' ? e.stunT : 0
  e.state = 'stun'
  e.st = 0
  e.stunT = Math.max(cur, d)
  e.ring.visible = false
  return { dur: d, resisted: false }
}

export const updateEnemy = (w: World, e: Enemy, dt: number): void => {
  e.px = e.x
  e.pz = e.z
  e.py = e.y
  e.mo.pyaw = e.yaw
  e.st += dt
  e.anim += dt
  e.flash = Math.max(0, e.flash - dt * 8)
  e.guardBreakT = Math.max(0, e.guardBreakT - dt)
  e.stunAge += dt
  e.stunImmune = Math.max(0, e.stunImmune - dt)
  if (e.hazardCd) e.hazardCd = Math.max(0, e.hazardCd - dt)

  if (e.state === 'dead') {
    e.deathT += dt
    return
  }
  // Asleep as a crate: no perception, no motion, nothing to animate
  if (e.dormant) {
    golemSleep(w, e)
    return
  }

  const d = distToPlayer(w, e)
  const def = e.def
  if (e.golem) golemTick(w, e, dt, d)

  switch (e.state) {
    case 'idle': {
      // Idle bob / patrol-in-place; perception tick.
      // Within its aggro radius, or anywhere in its own room: it sees him, it comes.
      if (!e.hold && (d < def.aggro || (d < ROOM_REACH && inMyRoom(w, e))) && seesPlayer(w, e)) wake(w, e)
      break
    }
    case 'alert': {
      // A golem's alert is its unfold: it turns to look while it opens up
      faceTo(e, w.player.x, w.player.z, e.golem ? 3 : 7, dt)
      if (e.st > (e.golem ? GOLEM_UNFOLD : 0.45)) enterState(e, 'engage')
      break
    }
    case 'stun': {
      e.stunT -= dt
      if (e.kind === 'heli' || e.kind === 'polar' || e.kind === 'puffer' || e.kind === 'hornet') e.y = Math.max(0.45, e.y - dt * 6)
      if (e.stunT <= 0) {
        e.cd = Math.max(e.cd, 0.6)
        enterState(e, 'engage')
      }
      break
    }
    default:
      runArchetype(w, e, dt, d)
  }

  if (e.state !== 'tele') e.ring.visible = false
  separate(w, e)
  stepMotion(e, dt)
}

// ─── Motion channels (models/motion.ts), one tick ─────────────────────────────

/** Below this share of top speed, a body is standing (separation jitter). */
const WALK_DEAD = 0.05

/** The legs a body walks on: a machine's by kind, a boss's by id (bosses
 *  carry kind 'brute' but have their own proportions; Dr. Vex hovers). */
const gaitOf = (e: Enemy): GaitSpec | undefined =>
  e.boss ? (e.bossId ? BOSS_GAIT[e.bossId] : undefined) : GAIT[e.kind]

/**
 * Advance the animation channels one tick. Runs at the END of `updateEnemy`
 * (and of `updateBoss`), after the AI moved and `separate` nudged the body, so
 * `walk` and `stride` are what the body actually covered this tick — a strafe
 * walks, a standing machine never does. Knockback lands later (combat), so a
 * hit never plays as walking.
 */
export const stepMotion = (e: Enemy, dt: number): void => {
  const m = e.mo
  const def = e.def
  const dx = e.x - e.px
  const dz = e.z - e.pz
  const ds = Math.hypot(dx, dz)
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  const fd = dx * sy + dz * cy
  const sd = dx * cy - dz * sy
  const dyaw = angDiff(e.yaw, m.pyaw)
  const g = gaitOf(e)
  // Gait and wheel sizes are in rig units; the rig is drawn scaled (an elite
  // ×1.18, a Master ×1.35), so a metre on the floor is fewer rig units
  const scale = e.rig.root.scale.x
  // ── Locomotion, measured ──
  const spd = dt > 1e-6 ? ds / dt : 0
  // Turning on the spot shuffles the feet of a gaited kind (half weight)
  const turnSpd = g && dt > 1e-6 ? (0.5 * Math.abs(dyaw) * g.hipW * scale) / dt : 0
  const want = def.speed > 0 ? Math.max(0, Math.min(1, (Math.max(spd, turnSpd) / def.speed - WALK_DEAD) / (1 - WALK_DEAD))) : 0
  m.walk += (want - m.walk) * Math.min(1, dt * 8)
  if (want === 0 && m.walk < 1e-3) m.walk = 0
  e.walk = m.walk
  if (ds > 1e-5) {
    const k = Math.min(1, dt * 10)
    m.fwd += (fd / ds - m.fwd) * k
    m.side += (sd / ds - m.side) * k
  }
  m.turn += ((dt > 1e-6 ? dyaw / dt : 0) - m.turn) * Math.min(1, dt * 6)
  // Stride phase from DISTANCE (+ the turn shuffle), never from the clock.
  // Integrated from the smoothed ground speed: the same total distance over
  // any walk (planted feet), but a single-tick burst — the AI hopping over
  // its range-band edge — cannot jump the legs.
  // The feet cover the translation or, turning on the spot, the arc their
  // stance sweeps — the larger, never the sum (a boss circling the player)
  const inst = dt > 1e-6 ? Math.max(ds, g ? Math.abs(dyaw) * g.hipW * scale : 0) / dt : 0
  m.speed += (inst - m.speed) * Math.min(1, dt * 20)
  if (inst === 0 && m.speed < 1e-3) m.speed = 0
  // A dash / charge (far past the walk): the legs fold still, not strobe
  const dash = def.speed > 0 && spd > def.speed * 1.8 ? 1 : 0
  m.dash += (dash - m.dash) * Math.min(1, dt * 15)
  m.pstride = m.stride
  if (g) {
    // The same swing the pose draws (models/gait.ts gaitLegs): shortened for
    // side-steps and while the smoothed direction turns round. Capped per
    // tick (≈5 steps a second) so nothing can outrun the frame rate.
    const mag = Math.hypot(m.fwd, m.side)
    const a = swingA(g, m.walk, mag > 1e-6 ? m.side / mag : 0) * Math.min(1, mag)
    m.stride += Math.min(0.55 * dt * 60, (TAU * m.speed * dt) / (cycleLen(g, a) * scale))
  }
  if (e.boss) stepBossMotion(e, dt)
  else stepMachineMotion(e, dt, ds, fd, sd, scale)
}

/**
 * A humanoid boss's channels. It is never "unaware" on screen (offstage until
 * its entrance, then always in the fight), so its calm is the stand in
 * `recover` after an attack, and that is the only place a taunt may start:
 * never in the entrance (the name card's pose), a telegraph or an attack —
 * leaving `recover`/`engage` cuts a taunt, and walking fades it. No glances
 * (a boss keeps its eyes on the player; the head leads its turns instead).
 */
const stepBossMotion = (e: Enemy, dt: number): void => {
  const m = e.mo
  const lens = e.bossId ? BOSS_FIDGET_LEN[e.bossId] : []
  const standing = e.state === 'recover' || (e.state === 'engage' && m.walk < 0.1)
  const calm = standing ? 1 : 0
  m.calm += (calm - m.calm) * Math.min(1, dt * (calm < m.calm ? 6 : 8))
  m.startle = 0
  m.look -= m.look * Math.min(1, dt * 2.5)
  if (e.state === 'recover' && e.st === 0 && m.fid === 0) {
    // A taunt after roughly half the attacks, once the strike has returned
    m.fidCd = lens.length && rand(m) < 0.6 ? 0.08 : 99
  }
  if (m.fid === 0) {
    if (e.state === 'recover' && lens.length) {
      m.fidCd -= dt
      if (m.fidCd <= 0) {
        m.fid = 1 + Math.min(lens.length - 1, Math.floor(rand(m) * lens.length))
        m.fidT = 0
        m.fidCd = 99
      }
    }
  } else {
    m.fidT += dt * m.tempo
    if (m.fidT >= lens[m.fid - 1]! || m.calm < 0.01 || (e.state !== 'recover' && e.state !== 'engage')) {
      m.fid = 0
      m.fidT = 0
    }
  }
  // Eased act weights (airborne, dizzy); the telegraph and strike weights are
  // exact functions of the state's clock (syncBossVisual → poseBoss)
  const air = e.state === 'act' && e.y > e.def.fly + 0.5 ? 1 : 0
  m.air += (air - m.air) * Math.min(1, dt * 5)
  const daze = e.state === 'stun' ? 1 : 0
  m.daze += (daze - m.daze) * Math.min(1, dt * 10)
}

/** A machine's kind-specific channels, its idle layer and attack channels. */
const stepMachineMotion = (e: Enemy, dt: number, ds: number, fd: number, sd: number, scale: number): void => {
  const m = e.mo
  if (e.kind === 'roller') {
    // The wheel steers into the travel (the driver keeps facing the player)
    // and rolls by distance; backing off, it rolls backward.
    let psi = 0
    let dir = 1
    if (ds > 1e-4) {
      psi = Math.atan2(sd, fd)
      if (psi > Math.PI / 2) { psi -= Math.PI; dir = -1 } else if (psi < -Math.PI / 2) { psi += Math.PI; dir = -1 }
    }
    const head = ds > 1e-4 ? psi * Math.min(1, m.walk / 0.2) : 0
    m.heading += (head - m.heading) * Math.min(1, dt * 6)
    m.roll += (dir * ds) / (ROLLER_R * scale)
  } else if (e.kind === 'heli') {
    m.roll += dt * 14 * m.walk // the rotor spins up with airspeed
  } else if (e.kind === 'hopper') {
    // The engage hop arc (view-only), on the AI's own hop clock: it moves
    // only while b < 0.45, so the feet are off the floor for every metre.
    // Out of engage the clock reads "not hopping", so the next run of hops
    // restarts from the ground; a leap or stun mid-hop lands it eased.
    if (e.state !== 'engage') e.b = 1
    const want = e.state === 'engage' && e.b < 0.45 ? HOP_H * Math.sin((Math.PI * e.b) / 0.45) : 0
    m.hop = Math.abs(want - m.hop) < 0.05 ? want : m.hop + (want - m.hop) * Math.min(1, dt * 10)
    // Squash: the leap's take-off (act) and landing (recover) snap on
    // purpose; everything else follows its curve, eased where it jumps
    let sq = 0
    if (e.state === 'tele') sq = -Math.min(1, e.st / 0.3)
    else if (e.state === 'act') sq = 0.8
    else if (e.state === 'recover') sq = -0.6 * Math.max(0, 1 - e.st * 3)
    else if (e.state === 'engage' && e.b < 1) sq = hopSquash(e.b)
    m.squash = e.state === 'act' || e.state === 'recover' || Math.abs(sq - m.squash) < 0.08
      ? sq
      : m.squash + (sq - m.squash) * Math.min(1, dt * 12)
  }
  // ── Idle ──
  const calm = e.state === 'idle' ? 1 : 0
  m.calm += (calm - m.calm) * Math.min(1, dt * (calm < m.calm ? 5 : 0.7))
  m.startle = e.state === 'alert' ? Math.sin(Math.PI * Math.min(1, Math.max(0, e.st) / 0.3)) : 0
  m.lookT -= dt
  if (m.lookT <= 0) {
    m.lookTo = rand(m) * 2 - 1
    m.lookT = 1.8 + rand(m) * 3.2
  }
  m.look += ((m.calm > 0.5 ? m.lookTo : 0) - m.look) * Math.min(1, dt * 2.5)
  const lens = FIDGET_LEN[e.kind]
  if (m.fid === 0) {
    if (m.calm > 0.95 && m.walk < 0.05) {
      m.fidCd -= dt
      if (m.fidCd <= 0) {
        m.fid = 1 + Math.min(lens.length - 1, Math.floor(rand(m) * lens.length))
        m.fidT = 0
      }
    }
  } else {
    // The envelope ends every fidget at exactly zero; woken, calm fades it out
    m.fidT += dt * m.tempo
    if (m.fidT >= lens[m.fid - 1]! || m.calm < 0.01) {
      m.fid = 0
      m.fidT = 0
      m.fidCd = 2.5 + rand(m) * 4.5
    }
  }
  // ── Attack channels: strikes follow their target, returns are eased ──
  if (e.kind === 'heli') {
    const want = e.state === 'act' ? 0.45 : e.state === 'tele' ? -0.25 : 0.08 + 0.3 * m.fwd * m.walk
    m.tilt += (want - m.tilt) * Math.min(1, dt * 12)
  } else if (e.kind === 'roller') {
    const want = e.state === 'act' ? 1 : e.state === 'tele' ? -0.5 : 0.2 + 0.25 * m.fwd * m.walk
    m.tilt += (want - m.tilt) * Math.min(1, dt * 10)
  } else if (e.kind === 'golem') {
    stepGolemMotion(e, dt)
  } else if (e.kind === 'brute') {
    let wantL = 0
    let wantR = 0
    let wantS = 0
    const striking = e.state === 'tele' || e.state === 'act'
    if (striking && e.attack === 'combo') {
      // Wind-up exactly as before; the throw now starts FROM the wind-up
      // (it used to restart at 0: a one-frame jump) and reaches it in 0.08 s
      const k = e.state === 'tele' ? -Math.min(1, e.st / e.teleDur) : -1 + 2 * Math.min(1, e.st / 0.08)
      if (e.step === 0) wantR = k
      else wantL = k
    } else if (striking && e.attack === 'slam') {
      wantS = e.state === 'tele' ? -0.4 * Math.min(1, e.st / e.teleDur) : -0.4 + 1.4 * Math.min(1, e.st / 0.1)
    } else if (striking && e.attack === 'rush') {
      // Both fists drawn back for the wind-up, thrown forward for the charge.
      const k = e.state === 'tele' ? -0.8 * Math.min(1, e.st / e.teleDur) : 0.7
      wantL = k
      wantR = k
    } else if (striking && e.attack === 'volley') {
      // The cannon arm raised to aim, kicking back with each fan.
      wantR = e.state === 'tele' ? 0.55 * Math.min(1, e.st / 0.25) : 0.55 - 0.35 * Math.max(0, 1 - ((e.st % 0.35) / 0.12))
    }
    // Returns: ≈0.4 s for a fist, ≈0.45 s for the slam (≤ 0.25 rad per tick)
    const back = Math.min(1, dt * 6)
    m.armL = wantL !== 0 ? wantL : m.armL * (1 - back)
    m.armR = wantR !== 0 ? wantR : m.armR * (1 - back)
    m.slam = wantS !== 0 ? wantS : m.slam * (1 - Math.min(1, dt * 5))
  }
}

/**
 * The crate golem's channels. The throw's wind-up follows the telegraph
 * clock (the hand up over the lid and into the crate), the release is a
 * strike (0.1 s), the return eases — and the path's blend (`armL`) stays full
 * through tele and act, so the release whips on over the top instead of
 * swinging back through the rest pose. The lob heaves the boulder up the
 * front across the red wind-up and brings it down the front at the release.
 * The rock and the boulder show only while held; the hop leans into its side.
 */
const stepGolemMotion = (e: Enemy, dt: number): void => {
  const m = e.mo
  const g = e.golem!
  const back = Math.min(1, dt * 6)
  if (e.attack === 'throw' && e.state === 'tele') {
    m.armL = 1
    m.armR = -Math.min(1, e.st / (e.teleDur * 0.8))
  } else if (e.attack === 'throw' && e.state === 'act') {
    m.armL = 1
    m.armR = Math.max(0.01, Math.min(1, e.st / 0.1))
  } else {
    m.armL -= m.armL * back
    if (m.armL < 1e-3) {
      m.armL = 0
      m.armR = 0
    }
  }
  if (e.attack === 'lob' && e.state === 'tele') m.slam = Math.min(1, e.st / (e.teleDur * 0.85))
  else if (e.attack === 'lob' && e.state === 'act') m.slam = 1 - 0.65 * Math.min(1, e.st / 0.12)
  else m.slam -= m.slam * back
  m.grip = e.state === 'tele' && e.attack === 'throw' && m.armR < -0.5 ? Math.min(1, m.grip + dt * 10) : 0
  m.boulder = e.state === 'tele' && e.attack === 'lob' ? Math.min(1, m.boulder + dt * 4) : 0
  const hop = e.state === 'act' && e.attack === 'dodge' ? g.hopSide * Math.sin(Math.PI * Math.min(1, e.st / GOLEM_DODGE_T)) : 0
  m.tilt += (hop - m.tilt) * Math.min(1, dt * 20)
  m.brace += ((g.aimT > 0.15 ? 1 : 0) - m.brace) * Math.min(1, dt * 6)
}

/**
 * ─── The ranged fallback ─────────────────────────────────────────────────────
 *
 * A melee machine that cannot reach Flux — he stands on another ledge, it is
 * leashed to its platform, a gap is between them — used to pace at the edge
 * while he shot it at leisure. Now, after FAR_AFTER seconds engaged, in
 * sight and farther than FAR_MIN without getting closer, it lobs a scrap
 * shell at where he stands: telegraphed (its ring, then the red landing
 * marker), blockable, weaker than its melee, and a charged shot can still
 * interrupt the wind-up — within the stun chain's limits (`tryStun`).
 */
const FALLBACK_KINDS: ReadonlySet<string> = new Set(['hopper', 'roller', 'brute'])
const FAR_MIN = 6
const FAR_AFTER = 2
/** Closing in by this much (m) per FAR_CHECK (s) counts as progress. */
const FAR_PROGRESS = 0.6
const FAR_CHECK = 1.5
const FALLBACK_TELE = 0.9
const FALLBACK_FLIGHT = 1.15
const FALLBACK_DMG = 0.6

/** The fallback's own beats; true when it took this step. */
const fallbackTick = (w: World, e: Enemy, dt: number, d: number): boolean => {
  if (!FALLBACK_KINDS.has(e.kind) || e.boss || e.golem) return false
  const px = w.player.x
  const pz = w.player.z
  if (e.attack === 'lobFallback') {
    if (e.state === 'tele') {
      faceTo(e, px, pz, 8, dt)
      if (e.st >= e.teleDur) {
        w.lobShell(e, px, pz, FALLBACK_FLIGHT, Math.max(1, Math.round(e.dmg * FALLBACK_DMG)))
        w.sfx('lob', e.x, e.z)
        enterState(e, 'recover')
      }
      return true
    }
    if (e.state === 'recover') {
      if (e.st > 0.7) {
        e.attack = ''
        e.cd = e.def.cooldown * 1.5
        enterState(e, 'engage')
      }
      return true
    }
  }
  if (e.state !== 'engage') {
    e.farT = 0
    return false
  }
  // Getting closer? Checked every FAR_CHECK against where it stood.
  e.farCheck = (e.farCheck ?? 0) + dt
  if (e.farCheck >= FAR_CHECK) {
    const moved = Math.hypot((e.farX ?? e.x) - px, (e.farZ ?? e.z) - pz) - d
    if (moved > FAR_PROGRESS) e.farT = 0
    e.farCheck = 0
    e.farX = e.x
    e.farZ = e.z
  }
  const high = Math.abs((w.player.y ?? 0) - (e.floor ?? 0)) > 1.2
  if (d > FAR_MIN && seesPlayer(w, e)) e.farT = (e.farT ?? 0) + dt * (high ? 1.6 : 1)
  else e.farT = 0
  if ((e.farT ?? 0) >= FAR_AFTER && e.cd <= 0) {
    e.farT = 0
    startTele(e, 'lobFallback', FALLBACK_TELE, false)
    return true
  }
  return false
}

const runArchetype = (w: World, e: Enemy, dt: number, d: number): void => {
  if (fallbackTick(w, e, dt, d)) return
  const def = e.def
  const px = w.player.x
  const pz = w.player.z
  if (e.state === 'engage') e.cd -= dt
  const canAttack = e.state === 'engage' && e.cd <= 0 && seesPlayer(w, e)
  const cooldown = () => def.cooldown * (0.7 + Math.random() * 0.6)

  switch (e.kind) {
    // ── Hardhat: hide, peek, spread, hide ────────────────────────────────
    case 'hardhat': {
      if (e.state === 'engage') {
        e.guard = Math.min(1, e.guard + dt * 5)
        faceTo(e, px, pz, 3, dt)
        if (d > 7) seek(w, e, px, pz, def.speed, dt)
        if (canAttack && inReach(w, e, d, 13)) startTele(e, 'spread', def.tele + 0.2, false)
      } else if (e.state === 'tele') {
        e.guard = Math.max(0, 1 - e.st / 0.22)
        faceTo(e, px, pz, 8, dt)
        if (e.st >= e.teleDur) {
          const ang = Math.atan2(px - e.x, pz - e.z)
          for (const off of [-0.26, 0, 0.26]) {
            const a = ang + off
            w.fireEnemyShot(e, e.x + Math.sin(a) * 0.35, 0.42, e.z + Math.cos(a) * 0.35, Math.sin(a), 0.03, Math.cos(a), 10, e.dmg, true)
          }
          w.sfx('enemyShot', e.x, e.z)
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        e.guard = e.st < 0.75 ? 0 : Math.min(1, (e.st - 0.75) / 0.2)
        if (e.st > 0.95) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Shield trooper: guard, lower shield, 3-round burst ───────────────
    case 'trooper': {
      if (e.state === 'engage') {
        e.guard = Math.min(1, e.guard + dt * 4)
        e.aim = Math.max(0, e.aim - dt * 4)
        faceTo(e, px, pz, 5, dt)
        keepRange(w, e, dt, 0.7)
        if (canAttack && inReach(w, e, d, 16)) startTele(e, 'burst', def.tele, false)
      } else if (e.state === 'tele') {
        e.guard = Math.max(0, e.guard - dt * 5)
        e.aim = Math.min(1, e.aim + dt * 5)
        faceTo(e, px, pz, 8, dt)
        if (e.st >= e.teleDur) {
          e.step = 0
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        const due = e.step * 0.16
        if (e.step < 3 && e.st >= due) {
          const a = Math.atan2(px - e.x, pz - e.z) + (Math.random() - 0.5) * 0.06
          const ox = e.x + Math.sin(e.yaw) * 0.3 + Math.cos(e.yaw) * 0.32
          const oz = e.z + Math.cos(e.yaw) * 0.3 - Math.sin(e.yaw) * 0.32
          const dy = (1.1 - 1.08) / Math.max(1, d)
          w.fireEnemyShot(e, ox, 1.08, oz, Math.sin(a), dy, Math.cos(a), 12.5, e.dmg, true)
          w.sfx('enemyShot', e.x, e.z)
          e.step++
        }
        if (e.st > 0.55) enterState(e, 'recover')
      } else if (e.state === 'recover') {
        e.aim = Math.max(0, e.aim - dt * 3)
        e.guard = Math.min(1, e.guard + dt * 3)
        if (e.st > 0.45) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Rotor drone: orbit, rise, swoop (parryable melee) ────────────────
    case 'heli': {
      const baseY = def.fly + Math.sin(e.anim * 2.2) * 0.12
      if (e.state === 'engage') {
        e.y += (baseY - e.y) * Math.min(1, dt * 3)
        faceTo(e, px, pz, 5, dt)
        // Orbit at the preferred band
        e.a += dt * 0.6 * (e.id % 2 ? 1 : -1)
        const r = (def.range[0] + def.range[1]) / 2
        const ox = px + Math.cos(e.a) * r
        const oz = pz + Math.sin(e.a) * r
        seek(w, e, ox, oz, def.speed * 0.8, dt)
        if (canAttack && d < 11) startTele(e, 'swoop', def.tele, false)
      } else if (e.state === 'tele') {
        e.y += (def.fly + 0.7 - e.y) * Math.min(1, dt * 4)
        faceTo(e, px, pz, 8, dt)
        if (e.st >= e.teleDur) {
          e.tx = px
          e.tz = pz
          e.hitPlayer = false
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // Dive at the player's head height
        const dx = w.player.x - e.x
        const dz = w.player.z - e.z
        const dd = Math.hypot(dx, dz)
        const sp = 11
        if (dd > 0.05) step(w, e, (dx / dd) * sp * dt, (dz / dd) * sp * dt)
        e.y += (1.25 - e.y) * Math.min(1, dt * 7)
        if (!e.hitPlayer && dd < 1.0 + PLAYER_R) {
          e.hitPlayer = true
          const r = w.hitPlayer(e, e.dmg, { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })
          if (r === 'parry') {
            e.stunT = 2.2
            enterState(e, 'stun')
            break
          }
          enterState(e, 'recover')
        } else if (e.st > 0.9) {
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        // Pull back out and up
        const dx = e.x - px
        const dz = e.z - pz
        const dd = Math.hypot(dx, dz) || 1
        step(w, e, (dx / dd) * 5 * dt, (dz / dd) * 5 * dt)
        e.y += (baseY - e.y) * Math.min(1, dt * 3)
        if (e.st > 0.8) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Stomper: hop closer, crouch (red), leap, shockwave ───────────────
    case 'hopper': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 4, dt)
        // Small hops toward the player on a rhythm. `e.b` is the hop clock
        // (airborne while < 0.45) and 1 while not hopping; a new run of hops
        // starts its clock from the ground, so the view's hop arc never
        // begins in mid-air after a leap or a pause.
        if (d > 3.5 && e.b >= 1) e.a = 0
        e.a += dt
        if (d > 3.5) {
          const phase = (e.a % 0.95) / 0.95
          if (phase < 0.45) seek(w, e, px, pz, def.speed * 2.2, dt)
          e.b = phase
        } else e.b = 1
        if (canAttack && d < 8) {
          startTele(e, 'leap', def.tele, true)
          // Where it will land: the player's spot, clamped to 7 m
          const dx = px - e.x
          const dz = pz - e.z
          const dd = Math.hypot(dx, dz) || 1
          const reach = Math.min(dd, 7)
          e.tx = e.x + (dx / dd) * reach
          e.tz = e.z + (dz / dd) * reach
          w.markers.spawn(e.tx, e.tz, 2.6, def.tele + 0.7)
        }
      } else if (e.state === 'tele') {
        faceTo(e, e.tx, e.tz, 6, dt)
        if (e.st >= e.teleDur) {
          e.sx = e.x
          e.sz = e.z
          enterState(e, 'act')
          w.sfx('jump', e.x, e.z)
        }
      } else if (e.state === 'act') {
        const dur = 0.7
        const k = Math.min(1, e.st / dur)
        const nx = e.sx + (e.tx - e.sx) * k
        const nz = e.sz + (e.tz - e.sz) * k
        step(w, e, nx - e.x, nz - e.z)
        e.y = Math.sin(k * Math.PI) * 2.8
        if (k >= 1) {
          e.y = 0
          w.shocks.spawn(e.x, 0.05, e.z, 2.8, '#ff5a3a', 0.45)
          w.fx.sparks(e.x, 0.3, e.z, '#ffd9a0', 18, 7, 0.22)
          w.shake(0.45)
          w.sfx('stomp', e.x, e.z)
          if (Math.hypot(w.player.x - e.x, w.player.z - e.z) < 2.6 + PLAYER_R) {
            w.hitPlayer(e, Math.round(e.dmg * 1.3), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
          }
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > 1.0) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Gear roller: rev (red), charge in a line, dizzy on a wall ────────
    case 'roller': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 3.5, dt)
        keepRange(w, e, dt, 0.4)
        if (canAttack && d < 14 && d > 3) startTele(e, 'charge', def.tele, true)
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 6, dt)
        e.a += dt * 30 // wheel revs
        if (e.st >= e.teleDur) {
          const dx = px - e.x
          const dz = pz - e.z
          const dd = Math.hypot(dx, dz) || 1
          e.tx = dx / dd
          e.tz = dz / dd
          e.hitPlayer = false
          enterState(e, 'act')
          w.sfx('dash', e.x, e.z)
        }
      } else if (e.state === 'act') {
        const sp = 12
        const frac = step(w, e, e.tx * sp * dt, e.tz * sp * dt)
        e.a += dt * 40
        if (!e.hitPlayer && Math.hypot(w.player.x - e.x, w.player.z - e.z) < e.def.radius + PLAYER_R + 0.15) {
          e.hitPlayer = true
          w.hitPlayer(e, e.dmg, { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
        }
        if (frac < 0.4 && e.st > 0.1) {
          // Hit a wall: dizzy
          w.fx.sparks(e.x + e.tx * 0.7, 0.8, e.z + e.tz * 0.7, '#ffe07a', 14, 6)
          w.shake(0.15)
          w.sfx('bonk', e.x, e.z)
          e.stunT = 1.4
          enterState(e, 'stun')
        } else if (e.st > 1.5) {
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > 0.5) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Guardroid: two-punch combo (orange) or overhead slam (red) up close;
    // from further off a shoulder RUSH (red: slide or step aside — into a
    // wall it staggers), and an elite also fires its arm cannon (orange: two
    // fans of heavy shots). It used to only walk at a Flux who outpaces it:
    // nothing to fear from two steps away. ─────────────────────────────────
    case 'brute': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 3, dt)
        if (d > 2.3) seek(w, e, px, pz, def.speed, dt)
        if (canAttack) {
          if (d < 3.2) {
            if (Math.random() < 0.35) startTele(e, 'slam', 1.1, true)
            else {
              e.step = 0
              startTele(e, 'combo', def.tele, false)
            }
          } else if (d > BRUTE_RUSH_MIN && d < BRUTE_RUSH_MAX && Math.random() < (e.elite ? 0.55 : 0.6)) {
            startTele(e, 'rush', e.elite ? 0.6 : 0.8, true)
          } else if (e.elite && d < BRUTE_VOLLEY_MAX) {
            e.step = 0
            startTele(e, 'volley', 0.7, false)
          } else {
            e.cd = 0.5 // nothing this time: look again shortly
          }
        }
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, e.attack === 'slam' ? 2 : e.attack === 'rush' ? 6 : 4, dt)
        if (e.st >= e.teleDur) {
          if (e.attack === 'rush') {
            // The line is locked here: a step aside at the last moment is the dodge.
            const dx = px - e.x
            const dz = pz - e.z
            const dd = Math.hypot(dx, dz) || 1
            e.tx = dx / dd
            e.tz = dz / dd
            e.hitPlayer = false
            w.sfx('dash', e.x, e.z)
          }
          enterState(e, 'act')
        }
      } else if (e.state === 'act' && e.attack === 'rush') {
        const sp = e.elite ? 12 : 10
        const frac = step(w, e, e.tx * sp * dt, e.tz * sp * dt)
        if (Math.random() < 0.5) w.fx.sparks(e.x - e.tx * 0.6, 0.15, e.z - e.tz * 0.6, '#c9b79a', 2, 2, 0.14)
        if (!e.hitPlayer && Math.hypot(w.player.x - e.x, w.player.z - e.z) < def.radius + PLAYER_R + 0.2) {
          e.hitPlayer = true
          w.shake(0.35)
          w.hitPlayer(e, Math.round(e.dmg * 1.1), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
          enterState(e, 'recover')
        } else if (frac < 0.4 && e.st > 0.08) {
          // Into a wall: it staggers — the opening for dodging it well.
          w.fx.sparks(e.x + e.tx * 0.9, 1.0, e.z + e.tz * 0.9, '#ffe07a', 18, 7)
          w.shake(0.3)
          w.sfx('bonk', e.x, e.z)
          e.stunT = BRUTE_WALL_STUN
          enterState(e, 'stun')
        } else if (e.st > BRUTE_RUSH_TIME) {
          // An elite that ends its rush next to Flux goes straight into the slam.
          if (e.elite && d < 3.4) startTele(e, 'slam', 0.9, true)
          else enterState(e, 'recover')
        }
      } else if (e.state === 'act' && e.attack === 'volley') {
        const due = e.step * 0.35
        if (e.step < 2 && e.st >= due) {
          // The right arm is the cannon: a fan of three from its muzzle, aimed at the chest.
          const ox = e.x + Math.sin(e.yaw) * 0.9 + Math.cos(e.yaw) * 0.55
          const oz = e.z + Math.cos(e.yaw) * 0.9 - Math.sin(e.yaw) * 0.55
          const a0 = Math.atan2(px - ox, pz - oz)
          const dy = (1.0 - 1.35) / Math.max(1, d)
          for (const off of [-0.2, 0, 0.2]) {
            w.fireEnemyShot(e, ox, 1.35, oz, Math.sin(a0 + off), dy, Math.cos(a0 + off), 11, Math.round(e.dmg * 0.55), true)
          }
          w.sfx('enemyShot', e.x, e.z)
          e.step++
        }
        if (e.st > 0.8) enterState(e, 'recover')
      } else if (e.state === 'act') {
        if (e.attack === 'combo') {
          // The punch lands on entering 'act'
          if (e.st <= dt * 1.5) {
            const reach = 3.0 + PLAYER_R
            const ang = Math.abs(angDiff(Math.atan2(px - e.x, pz - e.z), e.yaw))
            w.sfx('punch', e.x, e.z)
            if (d < reach && ang < 1.1) {
              w.hitPlayer(e, e.dmg, { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })
            }
            if (e.state !== 'act') break // parried → stunned
          }
          if (e.st > 0.25) {
            if (e.step === 0) {
              e.step = 1
              startTele(e, 'combo', 0.45, false)
            } else {
              enterState(e, 'recover')
            }
          }
        } else {
          if (e.st <= dt * 1.5) {
            w.shocks.spawn(e.x + Math.sin(e.yaw) * 1.2, 0.05, e.z + Math.cos(e.yaw) * 1.2, 3.4, '#ff5a3a', 0.5)
            w.fx.sparks(e.x + Math.sin(e.yaw) * 1.2, 0.3, e.z + Math.cos(e.yaw) * 1.2, '#ffd9a0', 22, 8, 0.24)
            w.shake(0.55)
            w.sfx('stomp', e.x, e.z)
            const sx = e.x + Math.sin(e.yaw) * 1.2
            const sz = e.z + Math.cos(e.yaw) * 1.2
            if (Math.hypot(px - sx, pz - sz) < 3.2 + PLAYER_R) {
              w.hitPlayer(e, Math.round(e.dmg * 1.5), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
            }
          }
          if (e.st > 0.4) enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > (e.attack === 'slam' ? 1.2 : e.attack === 'rush' ? 0.8 : 0.9)) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Wall cannon: aim, lob a shell at your feet (red marker) ──────────
    case 'turret': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 2.5, dt)
        if (canAttack && inReach(w, e, d, 20)) {
          startTele(e, 'lob', def.tele, true)
          e.tx = px
          e.tz = pz
          w.markers.spawn(px, pz, 1.9, def.tele + 1.1)
        }
      } else if (e.state === 'tele') {
        faceTo(e, e.tx, e.tz, 4, dt)
        if (e.st >= e.teleDur) {
          w.lobShell(e, e.tx, e.tz, 1.1, e.dmg)
          w.sfx('lob', e.x, e.z)
          e.a = 1 // recoil
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > 0.35) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      e.a = Math.max(0, e.a - dt * 4)
      break
    }

    // ── Polar Pup: shell shut (blue, shots TINK) / open (red): it fires
    //    only while open, a pair of slow magnet orbs ──
    case 'polar': {
      // The shell's clock: POLAR_SHUT s shut, POLAR_OPEN s open, its own
      // phase per machine; a broken shell stays open.
      const cycle = POLAR_SHUT + POLAR_OPEN
      const u = (e.anim + e.id * 0.7) % cycle
      const open = e.guardBreakT > 0 || e.state === 'tele' || e.state === 'act' || u >= POLAR_SHUT
      e.guard += ((open ? 0 : 1) - e.guard) * Math.min(1, dt * 7)
      const baseY = def.fly + Math.sin(e.anim * 1.7) * 0.1
      if (e.state === 'engage') {
        e.y += (baseY - e.y) * Math.min(1, dt * 3)
        faceTo(e, px, pz, 4, dt)
        // A slow drift round the player at range.
        e.a += dt * 0.35 * (e.id % 2 ? 1 : -1)
        const r = (def.range[0] + def.range[1]) / 2
        seek(w, e, px + Math.cos(e.a) * r, pz + Math.sin(e.a) * r, def.speed * 0.7, dt)
        if (canAttack && open && inReach(w, e, d, 14)) startTele(e, 'pulse', def.tele, false)
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 6, dt)
        if (e.st >= e.teleDur) {
          const a = Math.atan2(px - e.x, pz - e.z)
          for (const s of [-1, 1]) {
            w.fireOrb(e, e.x + Math.sin(a + s * 0.6) * 0.5, e.y + (e.floor ?? 0), e.z + Math.cos(a + s * 0.6) * 0.5, 4.2, e.dmg)
          }
          w.sfx('enemyShot', e.x, e.z)
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > 0.5) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Warden: turns, charges its cannon (the core glows through the
    //    seams), fires three; then its shutters stay open a while ──
    case 'warden': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 2, dt)
        e.guard += (1 - e.guard) * Math.min(1, dt * 6)
        e.b = Math.max(0, e.b - dt * 3)
        if (canAttack && inReach(w, e, d, 18)) startTele(e, 'cannon', def.tele, false)
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 3, dt)
        e.b = Math.min(1, e.st / e.teleDur)
        if (e.st >= e.teleDur) {
          const ang = Math.atan2(px - e.x, pz - e.z)
          for (const off of [-0.18, 0, 0.18]) {
            const a = ang + off
            w.fireEnemyShot(e, e.x + Math.sin(a) * 0.7, 1.25, e.z + Math.cos(a) * 0.7, Math.sin(a), 0, Math.cos(a), 12, Math.round(e.dmg * 0.7), true)
          }
          w.sfx('enemyShot', e.x, e.z)
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // Spent: the shutters open, the core bare.
        e.guard += (0 - e.guard) * Math.min(1, dt * 10)
        e.b = Math.max(0, e.b - dt * 2)
        if (e.st > WARDEN_OPEN) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Gatekeeper (mini-boss): walks in, a shell barrage (then its chest
    //    hatch opens), a twin-cannon volley, a stomp when close ──
    case 'gatekeeper': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 1.4, dt)
        e.guard += (1 - e.guard) * Math.min(1, dt * 4)
        const [lo, hi] = def.range
        if (d > hi) seek(w, e, px, pz, def.speed, dt)
        else if (d < lo) seek(w, e, e.x + (e.x - px), e.z + (e.z - pz), def.speed * 0.6, dt)
        if (canAttack) {
          const move = d < 4.5 ? 'stomp' : e.step % 2 === 0 ? 'barrage' : 'cannon'
          startTele(e, move, move === 'stomp' ? 0.8 : def.tele, move !== 'cannon')
          if (move === 'stomp') w.markers.spawn(e.x, e.z, GATE_STOMP_R, 1.0)
        }
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 2, dt)
        if (e.st >= e.teleDur) {
          if (e.attack === 'barrage') {
            for (let k = 0; k < 4; k++) {
              const a = Math.random() * Math.PI * 2
              const r = k === 0 ? 0 : 1.6 + Math.random() * 2.4
              const tx = px + Math.cos(a) * r
              const tz = pz + Math.sin(a) * r
              w.markers.spawn(tx, tz, 1.8, 1.15)
              w.lobShell(e, tx, tz, 1.1, Math.round(e.dmg * 0.8))
            }
            w.sfx('lob', e.x, e.z)
          } else if (e.attack === 'cannon') {
            const ang = Math.atan2(px - e.x, pz - e.z)
            for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) {
              const a = ang + off
              w.fireEnemyShot(e, e.x + Math.sin(a) * 1.4, 1.9, e.z + Math.cos(a) * 1.4, Math.sin(a), 0, Math.cos(a), 13, Math.round(e.dmg * 0.6), true)
            }
            w.sfx('enemyShot', e.x, e.z)
          } else {
            w.shocks.spawn(e.x, (e.floor ?? 0) + 0.05, e.z, GATE_STOMP_R, '#ff3f5f', 0.4)
            w.shake(0.5)
            w.sfx('stomp', e.x, e.z)
            if (d < GATE_STOMP_R + PLAYER_R) w.hitPlayer(e, Math.round(e.dmg * 1.2), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
          }
          e.step++
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // After a barrage the chest hatch opens a while; else a short beat.
        const window = e.attack === 'barrage' ? GATE_OPEN : 0.5
        if (e.attack === 'barrage') e.guard += (0 - e.guard) * Math.min(1, dt * 6)
        if (e.st > window) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      e.b += dt * (e.state === 'engage' && d > def.range[1] ? 1.2 : 0)
      break
    }

    // ── A Master's echo (the Twin Masters): strafes at range and fires its
    //    Master's own volleys; two take turns, and the last one left speeds
    //    up ──
    case 'echo': {
      const twin = w.enemies.some(o => o !== e && o.kind === 'echo' && o.room === e.room && o.state !== 'dead')
      const busy = w.enemies.some(o => o !== e && o.kind === 'echo' && o.room === e.room && (o.state === 'tele' || o.state === 'act'))
      if (e.state === 'engage') {
        faceTo(e, px, pz, 5, dt)
        e.a += dt * 0.5 * (e.id % 2 ? 1 : -1)
        const r = (def.range[0] + def.range[1]) / 2
        seek(w, e, px + Math.cos(e.a) * r, pz + Math.sin(e.a) * r, def.speed, dt)
        if (canAttack && !busy) startTele(e, e.step % 2 === 0 ? 'volley' : 'lob', def.tele * (twin ? 1 : 0.75), e.step % 2 === 1)
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 7, dt)
        if (e.st >= e.teleDur) {
          const fire = e.echoOf === 'blazeMaster'
          if (e.attack === 'volley') {
            const ang = Math.atan2(px - e.x, pz - e.z)
            const n = fire ? 5 : 3
            for (let k = 0; k < n; k++) {
              const a = ang + (k / (n - 1) - 0.5) * (fire ? 0.9 : 0.25)
              w.fireEnemyShot(e, e.x + Math.sin(a) * 0.8, 1.5, e.z + Math.cos(a) * 0.8, Math.sin(a), 0, Math.cos(a), fire ? 11 : 16, Math.round(e.dmg * (fire ? 0.6 : 0.75)), true)
            }
            w.sfx('enemyShot', e.x, e.z)
          } else {
            const pts: Array<[number, number]> = [[px, pz], [px + 2.2, pz + 1.2], [px - 2, pz - 1.4]]
            for (const [x, z] of pts) {
              w.markers.spawn(x, z, 1.6, 1.0)
              w.lobShell(e, x, z, 0.95, Math.round(e.dmg * 0.85))
            }
            w.sfx('lob', e.x, e.z)
          }
          e.step++
          enterState(e, 'recover')
        }
      } else if (e.state === 'recover') {
        if (e.st > (twin ? 0.7 : 0.4)) {
          e.cd = def.cooldown * (twin ? 1 : 0.6) * (0.8 + Math.random() * 0.4)
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Hornet Rotor: hovers at range, spins up red, dives straight
    //    through where Flux stood (it does not turn); a parry crashes it ──
    case 'hornet': {
      const baseY = def.fly + Math.sin(e.anim * 2.6) * 0.15
      if (e.state === 'engage') {
        e.y += (baseY - e.y) * Math.min(1, dt * 3)
        faceTo(e, px, pz, 5, dt)
        e.a += dt * 0.8 * (e.id % 2 ? 1 : -1)
        const r = (def.range[0] + def.range[1]) / 2
        seek(w, e, px + Math.cos(e.a) * r, pz + Math.sin(e.a) * r, def.speed, dt)
        e.b = Math.max(0, e.b - dt * 3)
        if (canAttack && d < 14) {
          startTele(e, 'dive', def.tele, false)
          // The line is set now: where Flux stands at the spin-up.
          const dx = px - e.x
          const dz = pz - e.z
          const l = Math.hypot(dx, dz) || 1
          e.tx = dx / l
          e.tz = dz / l
          w.sfx('alert', e.x, e.z)
        }
      } else if (e.state === 'tele') {
        e.b = Math.min(1, e.st / e.teleDur)
        e.yaw = Math.atan2(e.tx, e.tz)
        if (e.st >= e.teleDur) {
          e.hitPlayer = false
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // Straight on at head height; it cannot turn.
        const frac = step(w, e, e.tx * HORNET_DIVE * dt, e.tz * HORNET_DIVE * dt)
        e.y += (1.25 - e.y) * Math.min(1, dt * 6)
        if (!e.hitPlayer && Math.hypot(px - e.x, pz - e.z) < 0.95 + PLAYER_R) {
          e.hitPlayer = true
          const r = w.hitPlayer(e, e.dmg, { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })
          if (r === 'parry') {
            e.stunT = 2.4
            enterState(e, 'stun')
            break
          }
        }
        if (e.st > 1.1 || frac < 0.3) enterState(e, 'recover')
      } else if (e.state === 'recover') {
        e.b = Math.max(0, e.b - dt * 2)
        e.y += (baseY - e.y) * Math.min(1, dt * 2)
        if (e.st > 0.9) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Glow Stalker: closes in, whines (its seams flare), lunges; a
    //    parry stops it cold ──
    case 'stalker': {
      if (e.state === 'engage') {
        faceTo(e, px, pz, 6, dt)
        if (d > 2.6) seek(w, e, px, pz, def.speed, dt)
        e.b = Math.max(0, e.b - dt * 3)
        if (canAttack && d < STALKER_LUNGE_R) {
          startTele(e, 'lunge', def.tele, false)
          w.sfx('alert', e.x, e.z)
        }
      } else if (e.state === 'tele') {
        faceTo(e, px, pz, 8, dt)
        e.b = Math.min(1, e.st / e.teleDur)
        if (e.st >= e.teleDur) {
          const dx = px - e.x
          const dz = pz - e.z
          const l = Math.hypot(dx, dz) || 1
          e.tx = dx / l
          e.tz = dz / l
          e.hitPlayer = false
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // The lunge: fast and straight; it can be parried.
        step(w, e, e.tx * 13 * dt, e.tz * 13 * dt)
        if (!e.hitPlayer && Math.hypot(px - e.x, pz - e.z) < 1.0 + PLAYER_R) {
          e.hitPlayer = true
          const r = w.hitPlayer(e, e.dmg, { blockable: true, fromX: e.x, fromZ: e.z, kind: 'melee' })
          if (r === 'parry') {
            e.stunT = 2.2
            enterState(e, 'stun')
            break
          }
        }
        if (e.st > 0.32) enterState(e, 'recover')
      } else if (e.state === 'recover') {
        e.b = Math.max(0, e.b - dt * 3)
        if (e.st > 0.7) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Puffer Mine: drifts at Flux, swells (red: get away or pop it),
    //    bursts in a ring of water and is gone ──
    case 'puffer': {
      const baseY = def.fly + Math.sin(e.anim * 1.9) * 0.12
      e.y += (baseY - e.y) * Math.min(1, dt * 3)
      if (e.state === 'engage') {
        faceTo(e, px, pz, 4, dt)
        seek(w, e, px, pz, def.speed, dt)
        e.b = Math.max(0, e.b - dt * 2)
        if (e.cd <= 0 && d < PUFFER_SWELL_R) startTele(e, 'swell', def.tele, true)
      } else if (e.state === 'tele') {
        // Swelling: slower, spikes out, a hiss.
        seek(w, e, px, pz, def.speed * 0.35, dt)
        e.b = Math.min(1, e.st / e.teleDur)
        if (e.st >= e.teleDur) {
          w.spawnRing(e, e.x, e.z, 7, PUFFER_RING, e.dmg, '#5fd2ff')
          w.fx.sparks(e.x, e.y + (e.floor ?? 0), e.z, '#bff0ff', 22, 7, 0.24)
          w.sfx('explode', e.x, e.z)
          w.shake(0.2)
          // It is spent: gone with its burst (no bolts: it popped itself).
          e.hp = 0
          e.state = 'dead'
          e.deathT = 0
          e.st = 0
        }
      }
      break
    }

    // ── Mole Driller: travels under the floor (a dust trail), bursts up
    //    under Flux on a red marker, stays out a while (open to fire),
    //    digs back in ──
    case 'mole': {
      if (e.state === 'engage') {
        if (!e.buried) {
          // Just woken, or back from a surfacing: dig in.
          e.a = Math.max(0, e.a - dt / MOLE_DIG)
          faceTo(e, px, pz, 4, dt)
          if (e.a <= 0) e.buried = true
          break
        }
        // Under the floor: chase, kicking up a trail of dust.
        seek(w, e, px, pz, def.speed, dt)
        if (Math.random() < dt * 30) {
          w.fx.emit({ x: e.x + (Math.random() - 0.5) * 0.6, y: (e.floor ?? 0) + 0.1, z: e.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 1.5, color: Math.random() < 0.5 ? '#8a6a52' : '#b8a088', size: 0.35, sizeEnd: 0.08, life: 0.5, gravity: 3 })
        }
        if (e.cd <= 0 && d < MOLE_STRIKE) {
          startTele(e, 'erupt', def.tele, true)
          e.tx = px
          e.tz = pz
          w.markers.spawn(px, pz, MOLE_REACH, def.tele + 0.25)
          w.sfx('alert', e.x, e.z)
        }
      } else if (e.state === 'tele') {
        // Tunnels in under the marked spot.
        seek(w, e, e.tx, e.tz, def.speed * 2, dt)
        if (Math.random() < dt * 40) w.fx.emit({ x: e.tx + (Math.random() - 0.5) * 1.6, y: (e.floor ?? 0) + 0.1, z: e.tz + (Math.random() - 0.5) * 1.6, vy: 1.5 + Math.random(), color: '#8a6a52', size: 0.3, sizeEnd: 0.05, life: 0.45, gravity: 4 })
        if (e.st >= e.teleDur) {
          e.x = e.px = e.tx
          e.z = e.pz = e.tz
          e.buried = false
          e.hitPlayer = false
          w.fx.sparks(e.x, (e.floor ?? 0) + 0.4, e.z, '#ffd23a', 14, 7, 0.22)
          w.shocks.spawn(e.x, (e.floor ?? 0) + 0.05, e.z, MOLE_REACH, '#ff7a3a', 0.3)
          w.sfx('stomp', e.x, e.z)
          w.shake(0.2)
          if (Math.hypot(px - e.x, pz - e.z) < MOLE_REACH + PLAYER_R) {
            w.hitPlayer(e, e.dmg, { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
          }
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        // Out of the ground, drill spinning: the window to hit it.
        e.a = Math.min(1, e.a + dt / 0.25)
        faceTo(e, px, pz, 5, dt)
        if (e.st > MOLE_OUT) {
          e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }

    // ── Crate golem: keep its distance, throw, throw, lob; hop a charge ──
    case 'golem': {
      const g = e.golem!
      if (e.state === 'engage') {
        faceTo(e, px, pz, 4, dt)
        golemRange(w, e, dt, d)
        if (golemTryDodge(w, e, d)) break
        if (canAttack && d < GOLEM_RAM_R && d > 1.4) {
          // Up close it charges: its lane is drawn on the floor in red first.
          const dd = d || 1
          e.tx = (px - e.x) / dd
          e.tz = (pz - e.z) / dd
          startTele(e, 'ram', GOLEM_RAM_TELE, true)
          const reach = GOLEM_RAM_SPEED * GOLEM_RAM_TIME
          for (let s = 1; s <= 5; s++) w.markers.spawn(e.x + e.tx * reach * s / 5, e.z + e.tz * reach * s / 5, 0.5, GOLEM_RAM_TELE + 0.1)
        } else if (canAttack && inReach(w, e, d, 16)) {
          if (g.throws >= 2) {
            // The boulder, at where Flux stands now (red: step out)
            g.throws = 0
            startTele(e, 'lob', GOLEM_LOB_TELE, true)
            e.tx = px
            e.tz = pz
            w.markers.spawn(px, pz, 1.9, GOLEM_LOB_TELE + GOLEM_LOB_DUR)
          } else {
            g.throws++
            startTele(e, 'throw', def.tele, false)
          }
        }
      } else if (e.state === 'tele') {
        // Committed: no hop while it winds up (the other opening)
        if (e.attack === 'lob') faceTo(e, e.tx, e.tz, 4, dt)
        else if (e.attack === 'ram') faceTo(e, e.x + e.tx, e.z + e.tz, 10, dt)
        else faceTo(e, px, pz, 8, dt)
        if (e.st >= e.teleDur) {
          if (e.attack === 'ram') {
            // The lane was locked when it was drawn: a step aside is the dodge.
            e.hitPlayer = false
            w.sfx('dash', e.x, e.z)
          } else if (e.attack === 'lob') {
            w.lobShell(e, e.tx, e.tz, GOLEM_LOB_DUR, Math.round(e.dmg * 1.35))
            w.sfx('lob', e.x, e.z)
          } else golemThrow(w, e)
          enterState(e, 'act')
        }
      } else if (e.state === 'act') {
        if (e.attack === 'dodge') golemHop(w, e, dt)
        else if (e.attack === 'ram') golemRam(w, e, dt)
        else if (e.st > (e.attack === 'lob' ? 0.35 : 0.25)) enterState(e, 'recover')
      } else if (e.state === 'recover') {
        faceTo(e, px, pz, 4, dt)
        if (golemTryDodge(w, e, d)) break
        if (e.st > (e.attack === 'dodge' ? 0.3 : e.attack === 'lob' || e.attack === 'ram' ? 0.7 : 0.5)) {
          // A hop leaves the attack clock alone: it may throw right after landing
          if (e.attack !== 'dodge') e.cd = cooldown()
          enterState(e, 'engage')
        }
      }
      break
    }
  }

  // Telegraph ring
  if (e.state === 'tele') {
    const k = e.st / e.teleDur
    const pw = Math.min(0.5, PARRY_WINDOW / e.teleDur)
    setTeleRing(e.ring, k, e.teleRed, pw, 0.9 + e.def.radius * 0.6)
  }
}

// ─── Visual sync (called per rendered frame) ─────────────────────────────────

export const syncEnemyVisual = (e: Enemy, alpha: number, time: number): void => {
  const x = e.px + (e.x - e.px) * alpha
  const z = e.pz + (e.z - e.pz) * alpha
  const y = e.py + (e.y - e.py) * alpha
  e.root.position.set(x, y, z)
  e.root.rotation.y = e.yaw
  e.shadow.position.set(x, 0.02, z)
  const sh = e.def.radius * 1.1 * (e.elite ? 1.18 : 1) * Math.max(0.45, 1 - y * 0.15)
  e.shadow.scale.setScalar(sh)
  const r = e.rig
  const t = e.anim
  // Hit flash (white emissive pulse) + stun wobble
  r.material.emissive.setScalar(e.flash * 0.85)
  const stunned = e.state === 'stun'
  if (e.state === 'dead') {
    // Pop: squash and vanish
    const k = Math.min(1, e.deathT / 0.14)
    e.root.scale.setScalar(Math.max(0.001, 1 + k * 0.25))
    e.root.visible = e.deathT < 0.14
    e.shadow.visible = e.root.visible
    e.ring.visible = false
    return
  }
  // The motion layer (models/motion.ts): the gait phase interpolated to this
  // frame like the position, and every pose gets `m` as its last argument.
  const m = e.mo
  m.phase = m.pstride + (m.stride - m.pstride) * alpha
  switch (e.kind) {
    case 'hardhat':
      poseHardhat(r, 1 - e.guard, t, m.walk, m)
      break
    case 'trooper': {
      const g = e.guardBreakT > 0 ? 0 : e.guard
      poseTrooper(r, g, e.aim, t, m.walk, m)
      break
    }
    case 'polar':
      posePolar(r, 1 - e.guard, t, m)
      break
    case 'puffer':
      posePuffer(r, e.b, t, m)
      break
    case 'hornet':
      poseHornet(r, e.b, e.state === 'act' ? 1 : 0, t, m)
      break
    case 'warden':
      poseWarden(r, 1 - e.guard, e.b, t, m)
      break
    case 'gatekeeper':
      poseGatekeeper(r, 1 - e.guard, e.state === 'tele' ? Math.min(1, e.st / e.teleDur) : 0, e.b, t, m)
      break
    case 'echo': {
      const act = e.state === 'tele' ? 'tele' : e.state === 'act' || e.state === 'recover' ? 'attack' : e.state === 'stun' ? 'stun' : m.walk > 0.2 ? 'walk' : 'idle'
      const k = e.state === 'tele' ? Math.min(1, e.st / e.teleDur) : e.state === 'recover' ? Math.min(1, e.st / 0.25) : 0
      poseBoss(r, e.echoOf ?? 'blazeMaster', t, act, k, m)
      break
    }
    case 'stalker':
      poseStalker(r, e.b, e.state === 'act' ? 1 : 0, t, m)
      break
    case 'mole':
      poseMole(r, e.buried ? 0 : e.state === 'idle' || e.state === 'alert' ? 0.75 : e.a, t * (e.state === 'act' ? 28 : 8), t, m)
      break
    case 'heli':
      // m.tilt: the state's tilt, eased (no pops at tele/act), plus airspeed
      poseHeli(r, t, m.tilt, t * (stunned ? 4 : 28) + m.roll, m)
      break
    case 'hopper':
      // Attack squashes as before, engage hops on the AI's own hop clock
      // (m.squash, eased into a telegraph that starts mid-hop)
      poseHopper(r, m.squash, t, m)
      break
    case 'roller':
      // Wheel = telegraph revs (e.a) + distance rolled (m.roll); eased lean
      poseRoller(r, e.a, t, m.tilt, m)
      break
    case 'brute':
      // Punches per arm and the slam come eased from m (armL / armR / slam)
      poseBrute(r, t, m.walk, 0, 0, m.slam, m)
      break
    case 'turret':
      poseTurret(r, 0.35, e.a, m)
      break
    case 'golem': {
      const k = e.golem!.unfold
      poseGolem(r, k, m.armR, m.slam, m.tilt, t, m)
      // Asleep it is crate-sized and casts no blob (a crate has none); both
      // grow in as it unfolds
      if (e.elite) r.root.scale.setScalar(1 + 0.18 * k)
      if (k < 0.02) e.shadow.visible = false
      else e.shadow.scale.setScalar(sh * Math.min(1, k * 1.5))
      break
    }
  }
  if (stunned) {
    // Eased in and out: the wobble never switches on or off in one frame
    const k = Math.min(1, e.st / 0.1) * Math.min(1, Math.max(0, e.stunT) / 0.1)
    e.root.rotation.z = Math.sin(time * 18) * 0.08 * k
  } else {
    e.root.rotation.z = 0
  }
  // Ring position above the enemy
  if (e.ring.visible) e.ring.position.set(x, y + e.rig.height * (e.elite ? 1.18 : 1) + 0.45, z)
}
