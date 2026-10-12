import {
  AdditiveBlending, BoxGeometry, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry,
  type BufferGeometry, type Object3D
} from 'three'
import type { Enemy, World } from '../world'
import type { Room } from '../../world/levelGen'
import type { MiniBossBehaviour, MiniBossSpec } from './types'
import { buildArcSpider, poseArcSpider, newSpiderPose, SPIDER_COLORS, type SpiderPose } from '../../models/miniBoss/arcSpider'
import { rcyl, sph, paint, merge, staticProp } from '../../models/kit'
import { toonVC, glowVC } from '../../models/toon'
import { faceTo, moveBody, distToPlayer, keepInRoom, inRoom, roomBox, teleRing, near, ease, floorLayer, segDist } from './kit'
import { PLAYER_R } from '../constants'
import { pushHud } from '../../state/hud'

/**
 * ─── The Arc Spider (Volt) ───────────────────────────────────────────────────
 *
 * A spider drone that keeps to the walls and fights with the floor between
 * them — nothing like the Volt Master's bolt-throwing android. It scuttles
 * round the room's edge, sideways, always facing Flux. Three moves, each
 * with a big wind-up, the coil flaring and the ring over it, the area drawn
 * on the floor before anything hurts:
 *
 *  - PYLONS (red). It rears up on its hind legs, the coil curled under it
 *    (PYLON_TELE), while rings mark where its pylons will land: either side
 *    of Flux, across his path (from half health a third beyond him). The
 *    pylons drop in, the lines between them flicker on the floor for
 *    ARC_WARN — then the lightning is live along them for ARC_LIVE.
 *  - WEB SPIT (orange: block it). It sinks low, fangs wide, the coil pumping
 *    (WEB_TELE), rings on the floor where the blobs will land (on Flux and
 *    beside him); then it spits them in an arc. Each leaves a web for
 *    WEB_LIFE that slows Flux to WEB_SLOW while he stands in it.
 *  - SKITTER DASH (red). Its legs drum the floor (DASH_TELE) while a lane of
 *    rings runs from it along the room's edge past Flux; then it dashes the
 *    lane at DASH_SPEED. Anyone by the wall is in its way.
 *
 * Its entrance: it lowers itself from the ceiling on a glowing thread, then
 * rears up crackling (`INTRO_T`; hits TINK off it meanwhile).
 */

export const INTRO_T = 2.6
const INTRO_DROP = 1.3
const INTRO_H = 6
/** The pylons: wind-up (s), the lines' warning and live time (s), their
 *  reach (m), the tick of their hurt (s), how far either side of Flux they land (m). */
export const PYLON_TELE = 1.0
export const ARC_WARN = 0.9
export const ARC_LIVE = 1.3
export const ARC_R = 0.45
const ARC_TICK = 0.35
const PYLON_SPREAD = 3.4
const ARC_Y = 0.55
/** The web: wind-up (s), the blobs' flight (s), the splash (m), the web (m, s, × walk). */
export const WEB_TELE = 0.8
export const WEB_FLY = 0.75
const WEB_HIT_R = 1.1
export const WEB_R = 1.6
export const WEB_LIFE = 5
export const WEB_SLOW = 0.45
const WEBS_MAX = 6
/** The dash: wind-up (s), speed (m/s), the lane along the edge (m). */
export const DASH_TELE = 0.75
export const DASH_SPEED = 13
const DASH_MIN = 6
const DASH_PAST = 3.5

type Attack = 'pylons' | 'web' | 'dash'

interface Web { x: number; z: number; t: number; obj: Object3D }
interface Blob { x: number; z: number; sx: number; sz: number; t: number }

export interface SpiderMem {
  pose: SpiderPose
  attack: Attack | ''
  /** The pylons' spots this attack, and the lines (pairs of indices). */
  pylons: Array<[number, number]>
  lines: Array<[number, number]>
  ticks: number
  blobs: Blob[]
  webs: Web[]
  /** The dash's path (x, z, …) and how far along it it has run (m). */
  path: number[]
  ran: number
  pathLen: number
  /** Where it heads along the edge (±1), flipped now and then. */
  side: number
  sinceDash: number
  phase2: boolean
  landed: boolean
  layer: Group | null
  pylonObjs: Object3D[]
  arcObjs: Mesh[]
  webPool: Object3D[]
}

const fy = (e: Enemy): number => e.floor ?? 0

// ── The room's edge as a loop: a point by its distance round it, and back ──

const edgeBox = (e: Enemy, room: Room) => roomBox(room, e.def.radius + 0.3)

/** The point `t` m round the room's edge (from its x0, z0 corner, clockwise in x then z). */
const edgeAt = (b: [number, number, number, number], t: number): [number, number] => {
  const [x0, z0, x1, z1] = b
  const w = x1 - x0
  const h = z1 - z0
  const per = 2 * (w + h)
  let s = ((t % per) + per) % per
  if (s < w) return [x0 + s, z0]
  s -= w
  if (s < h) return [x1, z0 + s]
  s -= h
  if (s < w) return [x1 - s, z1]
  s -= w
  return [x0, z1 - s]
}

/** How far round the edge the point nearest (x, z) lies. */
const edgeOf = (b: [number, number, number, number], x: number, z: number): number => {
  const [x0, z0, x1, z1] = b
  const w = x1 - x0
  const h = z1 - z0
  const cx = Math.min(x1, Math.max(x0, x))
  const cz = Math.min(z1, Math.max(z0, z))
  // The nearest side.
  const d = [cz - z0, x1 - cx, z1 - cz, cx - x0]
  const k = d.indexOf(Math.min(...d))
  if (k === 0) return cx - x0
  if (k === 1) return w + (cz - z0)
  if (k === 2) return w + h + (x1 - cx)
  return 2 * w + h + (z1 - cz)
}

const perimeter = (b: [number, number, number, number]): number => 2 * (b[2] - b[0] + b[3] - b[1])

/** The shorter way round from a to b (signed m). */
const edgeDelta = (per: number, a: number, b: number): number => {
  let d = (b - a) % per
  if (d > per / 2) d -= per
  if (d < -per / 2) d += per
  return d
}

// ── Its things on the floor ──

const makePylon = (): Object3D => {
  const c = SPIDER_COLORS
  const base = paint(rcyl(0.32, 0.18, 0.06, 12), c.shell)
  base.translate(0, 0.09, 0)
  const post = paint(rcyl(0.11, 0.85, 0.03, 10), c.copper)
  post.translate(0, 0.6, 0)
  const top = paint(sph(0.17, 12, 8), c.coil)
  top.translate(0, 1.12, 0)
  const g = staticProp([base, post], [top], toonVC(), glowVC(), 0.02)
  g.visible = false
  return g
}

/** One for every bolt segment: there is only ever one spider. */
const ARC_MAT = new MeshBasicMaterial({ color: '#d4f8ff', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false })

const makeArc = (): Mesh => {
  const m = new Mesh(new BoxGeometry(1, 1, 1), ARC_MAT)
  m.visible = false
  m.renderOrder = 2
  return m
}

let webGeo: BufferGeometry | null = null
/** A web on the floor: a faint disc, three rings and eight spokes, all one
 *  see-through mesh (nothing in it writes depth). */
const makeWeb = (): Object3D => {
  if (!webGeo) {
    const parts: BufferGeometry[] = [new CircleGeometry(WEB_R, 28)]
    for (const r of [0.45, 0.95, 1.5]) parts.push(new RingGeometry(r * WEB_R / 1.5 - 0.04, r * WEB_R / 1.5 + 0.04, 28))
    for (let k = 0; k < 8; k++) {
      const p = new PlaneGeometry(0.07, WEB_R * 2)
      p.rotateZ((k / 8) * Math.PI)
      parts.push(p)
    }
    for (const p of parts) {
      p.deleteAttribute('uv')
      p.deleteAttribute('normal')
    }
    webGeo = merge(parts)
    webGeo.rotateX(-Math.PI / 2)
  }
  const m = new Mesh(webGeo, new MeshBasicMaterial({
    color: '#bff4ff', transparent: true, opacity: 0.26, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  }))
  m.renderOrder = 1
  return m
}

const pick = (e: Enemy, m: SpiderMem, d: number): Attack => {
  // A dash at least every fourth attack: it keeps moving round the room.
  if (m.sinceDash >= 3) return 'dash'
  const r = Math.random()
  let a: Attack = d > 8 ? (r < 0.5 ? 'pylons' : r < 0.8 ? 'web' : 'dash') : r < 0.35 ? 'pylons' : r < 0.7 ? 'web' : 'dash'
  if (a === m.attack && e.step >= 1) a = a === 'pylons' ? 'web' : a === 'web' ? 'dash' : 'pylons'
  return a
}

const begin = (w: World, e: Enemy, m: SpiderMem, a: Attack, room: Room): void => {
  e.step = a === m.attack ? e.step + 1 : 0
  m.sinceDash = a === 'dash' ? 0 : m.sinceDash + 1
  m.attack = a
  e.attack = a
  e.state = 'tele'
  e.st = 0
  e.hitPlayer = false
  m.ticks = 0
  e.teleRed = a !== 'web'
  const tempo = m.phase2 ? 0.88 : 1
  const px = w.player.x
  const pz = w.player.z
  const dx = px - e.x
  const dz = pz - e.z
  const d = Math.hypot(dx, dz) || 1
  const ux = dx / d
  const uz = dz / d
  if (a === 'pylons') {
    e.teleDur = PYLON_TELE * tempo
    // Either side of him, across his path; from half health a third beyond him.
    m.pylons = [
      inRoom(room, px - uz * PYLON_SPREAD, pz + ux * PYLON_SPREAD, 0.9),
      inRoom(room, px + uz * PYLON_SPREAD, pz - ux * PYLON_SPREAD, 0.9)
    ]
    m.lines = [[0, 1]]
    if (m.phase2) {
      m.pylons.push(inRoom(room, px + ux * 3.6, pz + uz * 3.6, 0.9))
      m.lines.push([1, 2], [2, 0])
    }
    for (const [x, z] of m.pylons) w.markers.spawn(x, z, 0.7, e.teleDur + 0.1)
    w.sfx('alert', e.x, e.z)
  } else if (a === 'web') {
    e.teleDur = WEB_TELE * tempo
    // On him, and beside him across his path.
    const n = m.phase2 ? 3 : 2
    m.blobs.length = 0
    for (let k = 0; k < n; k++) {
      const off = k === 0 ? 0 : (k === 1 ? 1 : -1) * 2.6
      const [x, z] = inRoom(room, px - uz * off, pz + ux * off, 0.8)
      m.blobs.push({ x, z, sx: e.x, sz: e.z, t: -1 })
      w.markers.spawn(x, z, WEB_HIT_R, e.teleDur + WEB_FLY)
    }
    w.sfx('trapHiss', e.x, e.z)
  } else {
    e.teleDur = DASH_TELE * tempo
    // From where it stands to the edge, then round the edge past him.
    const b = edgeBox(e, room)
    const per = perimeter(b)
    const t0 = edgeOf(b, e.x, e.z)
    const toHim = edgeDelta(per, t0, edgeOf(b, px, pz))
    const dir = toHim >= 0 ? 1 : -1
    const len = Math.min(per * 0.6, Math.max(DASH_MIN, Math.abs(toHim) + DASH_PAST))
    m.path = [e.x, e.z]
    for (let s = 0; s <= len; s += 0.5) m.path.push(...edgeAt(b, t0 + dir * s))
    m.ran = 0
    m.pathLen = 0
    for (let k = 2; k < m.path.length; k += 2) m.pathLen += Math.hypot(m.path[k]! - m.path[k - 2]!, m.path[k + 1]! - m.path[k - 1]!)
    // Its lane: rings along the path.
    let acc = 0
    for (let k = 2; k < m.path.length; k += 2) {
      acc += Math.hypot(m.path[k]! - m.path[k - 2]!, m.path[k + 1]! - m.path[k - 1]!)
      if (acc >= 1.4) {
        acc = 0
        w.markers.spawn(m.path[k]!, m.path[k + 1]!, 0.9, e.teleDur + 0.2 + (k / m.path.length) * (len / DASH_SPEED))
      }
    }
    w.sfx('trapClick', e.x, e.z)
  }
}

/** The bolt along each line: this many jagged segments. */
const ARC_SEGS = 7
const _jx = new Float32Array(ARC_SEGS + 1)
const _jy = new Float32Array(ARC_SEGS + 1)

/** The pylons and their lines, in place; `live` 0 (hidden) … 1 (warning: a
 *  thin straight flickering thread) … 2 (live: a thick jagged bolt, new
 *  every frame). */
const drawArcs = (e: Enemy, m: SpiderMem, live: number, time: number): void => {
  m.layer = floorLayer(e, m.layer)
  const y0 = fy(e)
  while (m.pylonObjs.length < 3) {
    const p = makePylon()
    m.layer.add(p)
    m.pylonObjs.push(p)
  }
  while (m.arcObjs.length < 3 * ARC_SEGS) {
    const a = makeArc()
    m.layer.add(a)
    m.arcObjs.push(a)
  }
  m.pylonObjs.forEach((p, k) => {
    const at = m.pylons[k]
    p.visible = live > 0 && !!at
    if (at) p.position.set(at[0], y0, at[1])
  })
  const bolt = live > 1.5
  for (let k = 0; k < 3; k++) {
    const l = m.lines[k]
    const segs = m.arcObjs.slice(k * ARC_SEGS, (k + 1) * ARC_SEGS)
    for (const sg of segs) sg.visible = live > 0 && !!l
    if (!l || live <= 0) continue
    const [ax, az] = m.pylons[l[0]]!
    const [bx, bz] = m.pylons[l[1]]!
    const len = Math.hypot(bx - ax, bz - az) || 1
    const nx = -(bz - az) / len
    const nz = (bx - ax) / len
    for (let j = 0; j <= ARC_SEGS; j++) {
      const inner = j > 0 && j < ARC_SEGS
      _jx[j] = bolt && inner ? (Math.random() - 0.5) * 0.45 : 0
      _jy[j] = bolt && inner ? (Math.random() - 0.5) * 0.35 : 0
    }
    const thick = bolt ? 0.07 + Math.random() * 0.05 : 0.035
    const op = bolt ? 0.95 : 0.25 + 0.3 * Math.max(0, Math.sin(time * 30))
    segs.forEach((sg, j) => {
      const f0 = j / ARC_SEGS
      const f1 = (j + 1) / ARC_SEGS
      const x0 = ax + (bx - ax) * f0 + nx * _jx[j]!
      const z0 = az + (bz - az) * f0 + nz * _jx[j]!
      const x1 = ax + (bx - ax) * f1 + nx * _jx[j + 1]!
      const z1 = az + (bz - az) * f1 + nz * _jx[j + 1]!
      const yA = y0 + ARC_Y + _jy[j]!
      const yB = y0 + ARC_Y + _jy[j + 1]!
      const h = Math.hypot(x1 - x0, z1 - z0)
      sg.position.set((x0 + x1) / 2, (yA + yB) / 2, (z0 + z1) / 2)
      // Box along x: turned to the segment, tipped to its rise.
      sg.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), Math.atan2(yB - yA, h), 'YZX')
      sg.scale.set(Math.hypot(h, yB - yA) + thick, thick, thick)
      ;(sg.material as MeshBasicMaterial).opacity = op
    })
  }
}

const hideArcs = (m: SpiderMem): void => {
  for (const p of m.pylonObjs) p.visible = false
  for (const a of m.arcObjs) a.visible = false
}

/** The blobs in the air and the webs on the floor: they outlive the attack. */
const tickHazards = (w: World, e: Enemy, m: SpiderMem, dt: number): void => {
  const y0 = fy(e)
  let slowed = false
  for (let k = m.webs.length - 1; k >= 0; k--) {
    const wb = m.webs[k]!
    wb.t += dt
    if (wb.t >= WEB_LIFE) {
      wb.obj.visible = false
      m.webPool.push(wb.obj)
      m.webs.splice(k, 1)
      continue
    }
    const s = Math.min(1, wb.t / 0.15) * Math.min(1, (WEB_LIFE - wb.t) / 0.5)
    wb.obj.scale.setScalar(Math.max(0.01, s))
    if (!slowed && e.state !== 'dead' && near(w, wb.x, wb.z, WEB_R - PLAYER_R)) slowed = true
  }
  if (slowed) {
    w.slowPlayer?.(WEB_SLOW, 0.15)
    if (Math.random() < dt * 8) w.fx.emit({ x: w.player.x, y: y0 + 0.2, z: w.player.z, vy: 0.6, color: '#bff4ff', size: 0.3, sizeEnd: 0.05, life: 0.5 })
  }
  for (let k = m.blobs.length - 1; k >= 0; k--) {
    const b = m.blobs[k]!
    if (b.t < 0) continue
    b.t += dt
    const f = b.t / WEB_FLY
    if (f < 1) {
      w.fx.emit({ x: b.sx + (b.x - b.sx) * f, y: y0 + 1.1 + 3.2 * f * (1 - f) * 4 * 0.5 - 0.9 * f, z: b.sz + (b.z - b.sz) * f, color: '#bff4ff', size: 0.5, sizeEnd: 0.25, life: 0.1 })
      continue
    }
    m.blobs.splice(k, 1)
    w.fx.sparks(b.x, y0 + 0.2, b.z, '#bff4ff', 12, 4, 0.18)
    w.sfx('lob', b.x, b.z)
    if (e.state !== 'dead' && near(w, b.x, b.z, WEB_HIT_R)) {
      w.hitPlayer(e, Math.round(e.dmg * 0.4), { blockable: true, fromX: b.x, fromZ: b.z, kind: 'aoe' })
    }
    // The web it leaves.
    m.layer = floorLayer(e, m.layer)
    if (m.webs.length >= WEBS_MAX) {
      const old = m.webs.shift()!
      old.obj.visible = false
      m.webPool.push(old.obj)
    }
    const obj = m.webPool.pop() ?? makeWeb()
    if (!obj.parent) m.layer.add(obj)
    obj.visible = true
    obj.position.set(b.x, y0 + 0.04 + m.webs.length * 0.004, b.z)
    obj.rotation.y = Math.random() * Math.PI
    m.webs.push({ x: b.x, z: b.z, t: 0, obj })
  }
}

const stride = (e: Enemy, m: SpiderMem, dt: number): void => {
  const moved = Math.hypot(e.x - e.px, e.z - e.pz)
  const sp = dt > 0 ? moved / dt : 0
  m.pose.run = ease(m.pose.run, Math.min(1, sp / 3.5), 12, dt)
  m.pose.phase += moved * 4.2
}

export const ARC_SPIDER_AI: MiniBossBehaviour<SpiderMem> = {
  init: () => ({
    pose: newSpiderPose(), attack: '', pylons: [], lines: [], ticks: 0, blobs: [], webs: [], path: [], ran: 0, pathLen: 0, side: 1, sinceDash: 1,
    phase2: false, landed: false, layer: null, pylonObjs: [], arcObjs: [], webPool: []
  }),

  intro(w, e, m, _room, dt) {
    const p = m.pose
    const y0 = fy(e)
    // Down from the ceiling on its thread…
    const k = Math.min(1, e.st / INTRO_DROP)
    e.y = INTRO_H * (1 - k) * (1 - k * 0.3)
    if (k < 1 && Math.random() < 0.8) {
      w.fx.emit({ x: e.x, y: y0 + e.y + 1.2 + Math.random() * 4, z: e.z, color: SPIDER_COLORS.coil, size: 0.12, sizeEnd: 0.05, life: 0.2 })
    }
    if (k >= 1 && !m.landed) {
      m.landed = true
      w.shocks.spawn(e.x, y0 + 0.06, e.z, 3, SPIDER_COLORS.coil, 0.5)
      w.sfx('stomp', e.x, e.z)
    }
    faceTo(e, w.player.x, w.player.z, 4, dt)
    // …then it rears up, the coil crackling.
    const rear = e.st > INTRO_DROP + 0.2 && e.st < INTRO_T - 0.3 ? 1 : 0
    if (rear && p.rear < 0.05) w.sfx('thunder', e.x, e.z)
    if (rear && Math.random() < 0.5) w.fx.sparks(e.x, y0 + 1.2, e.z, SPIDER_COLORS.coil, 3, 5, 0.12)
    p.rear = ease(p.rear, rear, 8, dt)
    p.heat = ease(p.heat, 1 + rear * 1.3, 6, dt)
    if (e.st >= INTRO_T) {
      e.y = 0
      return true
    }
    return false
  },

  fight(w, e, m, room, dt) {
    const p = m.pose
    const d = distToPlayer(w, e)
    tickHazards(w, e, m, dt)
    if (!m.phase2 && e.hp < e.maxHp * 0.5) {
      m.phase2 = true
      pushHud({ t: 'flash', color: SPIDER_COLORS.coil, strength: 0.25 })
    }
    let rear = 0
    let crouch = 0
    let spit = 0
    let drum = 0
    let dash = 0
    let heat = 1
    switch (e.state) {
      case 'engage': {
        // Round the edge, sideways, facing him: a quarter of the room away.
        faceTo(e, w.player.x, w.player.z, 5, dt)
        const b = edgeBox(e, room)
        const per = perimeter(b)
        const t = edgeOf(b, e.x, e.z)
        const [ex, ez] = edgeAt(b, t)
        const sp = e.def.speed * (m.phase2 ? 1.2 : 1)
        const off = Math.hypot(ex - e.x, ez - e.z)
        if (off > 0.5) {
          moveBody(w, e, ((ex - e.x) / off) * sp * dt, ((ez - e.z) / off) * sp * dt)
        } else {
          const goal = edgeOf(b, w.player.x, w.player.z) + m.side * per * 0.25
          const dl = edgeDelta(per, t, goal)
          if (Math.abs(dl) > 0.4) {
            const [nx, nz] = edgeAt(b, t + Math.sign(dl) * 0.6)
            const l = Math.hypot(nx - e.x, nz - e.z) || 1
            if (moveBody(w, e, ((nx - e.x) / l) * sp * dt, ((nz - e.z) / l) * sp * dt) < 0.3) m.side = -m.side
          }
          if (Math.random() < dt * 0.2) m.side = -m.side
        }
        e.cd -= dt
        if (e.cd <= 0) begin(w, e, m, pick(e, m, d), room)
        break
      }
      case 'tele': {
        const k = Math.min(1, e.st / e.teleDur)
        teleRing(e, k, e.teleRed, 1.5)
        heat = 1 + 1.4 * k
        if (m.attack === 'pylons') {
          rear = Math.min(1, k * 1.8)
          faceTo(e, w.player.x, w.player.z, 3, dt)
        } else if (m.attack === 'web') {
          crouch = Math.min(1, k * 1.8)
          faceTo(e, m.blobs[0]!.x, m.blobs[0]!.z, 5, dt)
        } else {
          drum = Math.min(1, k * 2.5)
          faceTo(e, m.path[2]! + (m.path[4]! - m.path[2]!) * 3, m.path[3]! + (m.path[5]! - m.path[3]!) * 3, 6, dt)
        }
        if (e.st >= e.teleDur) {
          e.state = 'act'
          e.st = 0
          e.ring.visible = false
          if (m.attack === 'pylons') {
            const y0 = fy(e)
            for (const [x, z] of m.pylons) {
              w.shocks.spawn(x, y0 + 0.06, z, 1, SPIDER_COLORS.coil, 0.3)
              w.fx.sparks(x, y0 + 1, z, SPIDER_COLORS.coil, 10, 5, 0.15)
            }
            // The lines on the floor: rings along each, for the warning.
            for (const [i, j] of m.lines) {
              const [ax, az] = m.pylons[i]!
              const [bx, bz] = m.pylons[j]!
              const len = Math.hypot(bx - ax, bz - az)
              for (let s = 0.9; s < len - 0.5; s += 1) w.markers.spawn(ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len, 0.5, ARC_WARN)
            }
            w.sfx('beamIn', e.x, e.z)
          } else if (m.attack === 'web') {
            for (const b of m.blobs) {
              b.t = 0
              b.sx = e.x + Math.sin(e.yaw) * 0.9
              b.sz = e.z + Math.cos(e.yaw) * 0.9
            }
            w.sfx('lob', e.x, e.z)
          } else w.sfx('dash', e.x, e.z)
        }
        break
      }
      case 'act': {
        if (m.attack === 'pylons') {
          rear = Math.max(0, 1 - e.st * 3)
          heat = 2
          const live = e.st >= ARC_WARN
          drawArcs(e, m, live ? 2 : 1, w.time + e.st)
          if (live) {
            if (m.ticks === 0) w.sfx('thunder', e.x, e.z)
            const tick = Math.floor((e.st - ARC_WARN) / ARC_TICK)
            const y0 = fy(e)
            for (const [i, j] of m.lines) {
              const [ax, az] = m.pylons[i]!
              const [bx, bz] = m.pylons[j]!
              const f = Math.random()
              if (Math.random() < 0.6) w.fx.sparks(ax + (bx - ax) * f, y0 + ARC_Y, az + (bz - az) * f, SPIDER_COLORS.coil, 2, 3, 0.1)
            }
            if (tick >= m.ticks) {
              m.ticks = tick + 1
              const hit = m.lines.some(([i, j]) => segDist(w.player.x, w.player.z, m.pylons[i]![0], m.pylons[i]![1], m.pylons[j]![0], m.pylons[j]![1]) < ARC_R + PLAYER_R)
              if (hit) w.hitPlayer(e, Math.round(e.dmg * 0.5), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'aoe' })
            }
          }
          if (e.st >= ARC_WARN + ARC_LIVE) {
            hideArcs(m)
            e.state = 'recover'
            e.st = 0
          }
        } else if (m.attack === 'web') {
          spit = Math.max(0, 1 - e.st * 2.5)
          crouch = Math.max(0, 0.5 - e.st)
          heat = 1.8
          if (e.st >= 0.5) { e.state = 'recover'; e.st = 0 }
        } else {
          dash = 1
          heat = 2
          // Along its lane at full tilt.
          m.ran += DASH_SPEED * dt
          let acc = 0
          let tx = m.path[m.path.length - 2]!
          let tz = m.path[m.path.length - 1]!
          for (let k = 2; k < m.path.length; k += 2) {
            const seg = Math.hypot(m.path[k]! - m.path[k - 2]!, m.path[k + 1]! - m.path[k - 1]!)
            if (acc + seg >= m.ran) {
              const f = seg > 1e-6 ? (m.ran - acc) / seg : 1
              tx = m.path[k - 2]! + (m.path[k]! - m.path[k - 2]!) * f
              tz = m.path[k - 1]! + (m.path[k + 1]! - m.path[k - 1]!) * f
              break
            }
            acc += seg
          }
          const mx = tx - e.x
          const mz = tz - e.z
          const ml = Math.hypot(mx, mz)
          if (ml > 1e-4) faceTo(e, tx, tz, 14, dt)
          const frac = moveBody(w, e, mx, mz)
          if (Math.random() < 0.7) w.fx.sparks(e.x, fy(e) + 0.15, e.z, SPIDER_COLORS.coil, 2, 3, 0.1)
          if (!e.hitPlayer && distToPlayer(w, e) < e.def.radius + PLAYER_R + 0.2) {
            e.hitPlayer = true
            w.hitPlayer(e, Math.round(e.dmg * 1.1), { blockable: false, fromX: e.x, fromZ: e.z, kind: 'melee' })
          }
          if (m.ran >= m.pathLen || (frac < 0.3 && ml > 0.05 && e.st > 0.1)) { e.state = 'recover'; e.st = 0 }
        }
        break
      }
      case 'recover': {
        // A shiver of its legs, the coil dimmed: its opening.
        faceTo(e, w.player.x, w.player.z, 3, dt)
        heat = 0.7
        if (e.st > (m.phase2 ? 0.7 : 0.95)) {
          e.state = 'engage'
          e.st = 0
          e.cd = e.def.cooldown * (m.phase2 ? 0.75 : 1) * (0.8 + Math.random() * 0.4)
        }
        break
      }
    }
    if (!(e.state === 'act' && m.attack === 'pylons')) hideArcs(m)
    keepInRoom(e, room)
    stride(e, m, dt)
    p.rear = ease(p.rear, rear, 10, dt)
    p.crouch = ease(p.crouch, crouch, 12, dt)
    p.spit = ease(p.spit, spit, 14, dt)
    p.drum = ease(p.drum, drum, 12, dt)
    p.dash = ease(p.dash, dash, 14, dt)
    p.heat = ease(p.heat, heat, 8, dt)
  },

  dying(w, e, m, dt) {
    const p = m.pose
    tickHazards(w, e, m, dt)
    hideArcs(m)
    p.dying = Math.min(1, e.deathT / 1.1)
    p.rear = ease(p.rear, 0, 8, dt)
    p.crouch = ease(p.crouch, 0, 8, dt)
    p.drum = ease(p.drum, 0, 8, dt)
    p.dash = ease(p.dash, 0, 8, dt)
    p.heat = ease(p.heat, 2.4, 6, dt)
    // Its coil shorts out in bursts.
    if (Math.random() < dt * 16) {
      const a = Math.random() * Math.PI * 2
      w.fx.orbBurst(e.x + Math.sin(a) * 0.7, fy(e) + 0.7 + Math.random() * 0.6, e.z + Math.cos(a) * 0.7, SPIDER_COLORS.coil, 0.7)
      w.shake(0.08)
    }
  },

  pose(e, m, time) {
    m.pose.time = time
    poseArcSpider(e.rig, m.pose)
  },

  clear(_w, e, m) {
    hideArcs(m)
    // A blob still in the air when it is stunned falls short: none lands.
    m.blobs.length = 0
    if (e.state === 'dead') {
      for (const wb of m.webs) wb.obj.visible = false
      m.webs.length = 0
    }
  }
}

export const ARC_SPIDER: MiniBossSpec<SpiderMem> = {
  id: 'arcSpider',
  sector: 'volt',
  nameKey: 'miniboss.arcSpider',
  def: {
    kind: 'miniboss', hp: 460, dmg: 16, speed: 4.2, radius: 1.3, hitR: 1.35, aimY: 1.1, fly: 0,
    aggro: 30, range: [4, 10], xp: 165, bolts: [26, 38], cooldown: 1.5, tele: PYLON_TELE, unblockable: true, armor: 1,
    // The coil's glowing tail end.
    weak: { part: 'tail', up: 1.15, fwd: -1.45, side: 0, r: 0.4 },
    color: SPIDER_COLORS.coil
  },
  build: () => buildArcSpider(),
  behaviour: ARC_SPIDER_AI
}
