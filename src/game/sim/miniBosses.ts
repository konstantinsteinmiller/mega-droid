import { Group } from 'three'
import type { Enemy, World } from './world'
import type { Room } from '../world/levelGen'
import type { MiniBossSpec } from './miniBoss/types'
import { scaleDmg, scaleHp } from '../data/enemies'
import { newMotion } from '../models/motion'
import { makeTeleRing, makeBlobShadow } from '../fx/markers'
import { keepInRoom, shoulderPlayer } from './miniBoss/kit'

/**
 * ─── Challenge mini-bosses: the shared state machine ─────────────────────────
 *
 *   idle (offstage, waiting) ──Flux shut in──▶ alert (its entrance; hits TINK)
 *     ──▶ its module's fight: engage ▶ tele ▶ act ▶ recover ▶ engage …
 *          ▲                                                    │
 *          └──────────── stun (a full charge, a wall) ◀─────────┘
 *     ──hp 0──▶ dead (its death throes, then it breaks apart: MINI_SHATTER_AT)
 *
 * The module (`miniBoss/types.ts` `MiniBossBehaviour`) owns the fight and the
 * pose; this owns everything every mini-boss does the same way. It never
 * goes through `updateEnemy` or `updateBoss` (the mission routes
 * `Enemy.challenge` here).
 */

/** Its death throes last this long before it breaks apart (s). */
export const MINI_SHATTER_AT = 1.1

let nextMiniId = 200000

/** A mini-boss at `level`, waiting offstage on (x, z) in `room`. The mission
 *  scales its health and damage further (`Mission`, like a Core Master's). */
export const createMiniBoss = (spec: MiniBossSpec, level: number, x: number, z: number, room: Room): Enemy => {
  const def = spec.def
  const rig = spec.build()
  const root = new Group()
  root.add(rig.root)
  const hp = scaleHp(def.hp, level)
  const id = nextMiniId++
  return {
    id, kind: 'miniboss', def, level, elite: false, boss: false, mini: true, element: 'none',
    nameKey: spec.nameKey,
    x, z, y: 0, px: x, pz: z, py: 0, yaw: 0, vx: 0, vz: 0,
    hp, maxHp: hp, dmg: scaleDmg(def.dmg, level), room: room.id, awake: false, hold: true, state: 'idle', st: 0, cd: 1,
    attack: '', step: 0, teleDur: def.tele, teleRed: def.unblockable, guard: 0, aim: 0, stunT: 0, stunN: 0, stunAge: 99, stunImmune: 0, flash: 0,
    path: null, pathT: 0, walk: 0, anim: 0, mo: newMotion(id), a: 0, b: 0, tx: 0, tz: 0, sx: 0, sz: 0, hitPlayer: false,
    rig, root, shadow: makeBlobShadow(def.radius * 1.25), ring: makeTeleRing(), deathT: 0,
    guardBreakT: 0, hurtAt: -10, bossId: null, phase2: false, burnT: 0, burnDps: 0, frozenT: 0, lastWeapon: '',
    // Not in its room until its entrance: not drawn, hit, aimed at or bumped.
    offstage: true,
    challenge: { spec, room, mem: spec.behaviour.init({} as Enemy) }
  }
}

/** Flux is shut in: the entrance begins. */
export const startMiniBoss = (e: Enemy): void => {
  if (!e.challenge || e.state === 'dead') return
  e.offstage = false
  e.awake = true
  e.hold = false
  e.state = 'alert'
  e.st = 0
  e.challenge.mem = e.challenge.spec.behaviour.init(e)
}

/** One tick. */
export const updateMiniBoss = (w: World, e: Enemy, dt: number): void => {
  const c = e.challenge
  if (!c) return
  const ai = c.spec.behaviour
  e.px = e.x
  e.pz = e.z
  e.py = e.y
  e.mo.pyaw = e.yaw
  e.st += dt
  e.anim += dt
  e.flash = Math.max(0, e.flash - dt * 8)
  if (e.state === 'dead') {
    e.deathT += dt
    e.ring.visible = false
    if (e.deathT < MINI_SHATTER_AT + 0.5) ai.dying(w, e, c.mem, dt)
    return
  }
  if (e.offstage || e.state === 'idle') return
  if (e.state === 'alert') {
    if (ai.intro(w, e, c.mem, c.room, dt)) {
      e.state = 'engage'
      e.st = 0
      e.cd = 0.9
    }
    return
  }
  e.stunAge += dt
  e.stunImmune = Math.max(0, e.stunImmune - dt)
  if (e.state === 'stun') {
    e.ring.visible = false
    ai.clear?.(w, e, c.mem)
    e.stunT -= dt
    if (e.stunT <= 0) {
      e.state = 'engage'
      e.st = 0
      e.cd = Math.max(e.cd, 0.5)
    }
  } else ai.fight(w, e, c.mem, c.room, dt)
  if (e.state !== 'tele') e.ring.visible = false
  keepInRoom(e, c.room)
  if (e.def.fly === 0) shoulderPlayer(w, e)
}

/** Its death: whatever it drew in the world goes (the trail it left burns out). */
export const miniBossDied = (w: World, e: Enemy): void => {
  const c = e.challenge
  if (c) c.spec.behaviour.clear?.(w, e, c.mem)
}

/** Draw it for the frame: interpolated, turned, posed, its hit flash. */
export const syncMiniBoss = (e: Enemy, alpha: number, time: number): void => {
  const c = e.challenge
  if (!c) return
  const x = e.px + (e.x - e.px) * alpha
  const z = e.pz + (e.z - e.pz) * alpha
  const y = e.py + (e.y - e.py) * alpha
  e.root.position.set(x, y, z)
  e.root.rotation.y = e.yaw
  e.shadow.position.set(x, 0.02, z)
  e.shadow.scale.setScalar(e.def.radius * 1.25 * Math.max(0.3, 1 + Math.min(0, y) * 0.4))
  // Broken apart (`fx/shatter.ts`): its own model hides.
  const gone = !!e.shattered || (e.state === 'dead' && e.deathT >= MINI_SHATTER_AT + 0.2)
  // Its death throes play in full (the room culling hides the dead at once).
  if (e.state === 'dead') e.root.visible = !gone
  e.shadow.visible = e.root.visible
  e.rig.material.emissive.setScalar(e.flash * 0.85)
  c.spec.behaviour.pose(e, c.mem, time)
  if (e.state === 'stun') {
    const k = Math.min(1, e.st / 0.1) * Math.min(1, Math.max(0, e.stunT) / 0.1)
    e.root.rotation.z = Math.sin(time * 18) * 0.06 * k
  } else e.root.rotation.z = 0
  if (e.ring.visible) e.ring.position.set(x, y + e.rig.height + 0.5, z)
}
