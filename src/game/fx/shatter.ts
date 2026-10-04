import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Quaternion, Vector3,
  type Material, type Object3D, type SkinnedMesh
} from 'three'
import { toonVC } from '../models/toon'

/**
 * ─── Machines fall apart (#105) ──────────────────────────────────────────────
 *
 * A machine that goes down breaks into the parts of its own model — every
 * limb a piece (its rig is rigidly skinned: one bone, one part), in its own
 * colours — and a few loose blocks of its plating. They tumble, bounce, lie
 * on the floor like spare parts for LIE_FOR, then sink into it over SINK_FOR
 * and are gone. A boss falls apart the same way at the end of its death.
 *
 * `burst(rig root)` reads the live pose: each bone's part is cut out of the
 * merged skinned geometry and placed where the skeleton holds it right now.
 * At most MAX_PIECES lie about; past that the oldest start sinking at once.
 */

/** Seconds a piece lies still before it sinks, and the sink itself. */
export const LIE_FOR = 10
export const SINK_FOR = 2
/** Pieces in the world at most (a crowded fight sinks its oldest early). */
export const MAX_PIECES = 160
const G = 16
const BOUNCE = 0.3

export interface ShatterHost {
  /** The floor's height under (x, z) (m), below a body at `y`. */
  floorAt(x: number, z: number, y: number): number
  /** A wall at (x, z)? (pieces bounce off). Optional. */
  solidAt?(x: number, z: number): boolean
}

interface Piece {
  mesh: Mesh
  vx: number
  vy: number
  vz: number
  /** Spin axis (unit) and rate (rad/s). */
  ax: Vector3
  spin: number
  /** Its half height (how far it sinks, and where it rests on the floor). */
  half: number
  t: number
  rest: boolean
  /** Sinking since `sinkFrom` (the y it lay at). */
  sinking: boolean
  sinkFrom: number
}

const _m = new Matrix4()
const _m2 = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _c = new Vector3()
const _dq = new Quaternion()

/**
 * The merged rig geometry cut into one geometry per bone (each triangle to the
 * bone of its first corner), each centred on its own middle. Pure: a test can
 * run it on any skinned geometry.
 */
export const splitByBone = (geo: BufferGeometry): Map<number, { geo: BufferGeometry; centre: Vector3 }> => {
  const pos = geo.attributes.position!
  const nrm = geo.attributes.normal
  const col = geo.attributes.color
  const skin = geo.attributes.skinIndex
  const index = geo.index
  const tris = index ? index.count / 3 : pos.count / 3
  const byBone = new Map<number, number[]>()
  for (let t = 0; t < tris; t++) {
    const a = index ? index.getX(t * 3) : t * 3
    const b = skin ? skin.getX(a) : 0
    let list = byBone.get(b)
    if (!list) byBone.set(b, (list = []))
    list.push(t)
  }
  const out = new Map<number, { geo: BufferGeometry; centre: Vector3 }>()
  for (const [bone, list] of byBone) {
    const n = list.length * 3
    const P = new Float32Array(n * 3)
    const N = new Float32Array(n * 3)
    const C = new Float32Array(n * 3)
    let k = 0
    for (const t of list) {
      for (let c = 0; c < 3; c++) {
        const v = index ? index.getX(t * 3 + c) : t * 3 + c
        P[k * 3] = pos.getX(v); P[k * 3 + 1] = pos.getY(v); P[k * 3 + 2] = pos.getZ(v)
        if (nrm) { N[k * 3] = nrm.getX(v); N[k * 3 + 1] = nrm.getY(v); N[k * 3 + 2] = nrm.getZ(v) }
        if (col) { C[k * 3] = col.getX(v); C[k * 3 + 1] = col.getY(v); C[k * 3 + 2] = col.getZ(v) } else C.fill(1, k * 3, k * 3 + 3)
        k++
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(P, 3))
    g.setAttribute('normal', new BufferAttribute(N, 3))
    g.setAttribute('color', new BufferAttribute(C, 3))
    g.computeBoundingBox()
    const centre = g.boundingBox!.getCenter(new Vector3())
    g.translate(-centre.x, -centre.y, -centre.z)
    g.computeBoundingBox()
    out.set(bone, { geo: g, centre })
  }
  return out
}

/** `n` colours off a geometry's vertex colours (spread through it). */
export const sampleColors = (geo: BufferGeometry, n: number): string[] => {
  const col = geo.attributes.color
  if (!col || !col.count) return []
  const out: string[] = []
  const c = new Color()
  for (let k = 0; k < n; k++) {
    const v = Math.floor(((k + 0.5) / n) * col.count)
    out.push(`#${c.setRGB(col.getX(v), col.getY(v), col.getZ(v)).getHexString()}`)
  }
  return out
}

export class Shatter {
  readonly root = new Group()
  readonly pieces: Piece[] = []
  private readonly mat: Material = toonVC()

  constructor(parent: Object3D, private readonly host: ShatterHost) {
    parent.add(this.root)
  }

  /**
   * Break the model under `model` (every skinned mesh in it) into its parts
   * where it stands now, plus `blocks` loose blocks in its `colors`; they fly
   * out from `from` (the hit's origin pushes them away a little).
   */
  burst(model: Object3D, colors: readonly string[] = [], blocks = 5, from?: { x: number; z: number }, power = 1): void {
    model.updateMatrixWorld(true)
    const meshes: SkinnedMesh[] = []
    model.traverse((o) => {
      const sm = o as SkinnedMesh
      if (sm.isSkinnedMesh && sm.visible && sm.renderOrder >= 0) meshes.push(sm)
    })
    _c.set(0, 0, 0)
    let count = 0
    const spawned: Piece[] = []
    for (const sm of meshes) {
      const parts = splitByBone(sm.geometry)
      const bones = sm.skeleton.bones
      const inv = sm.skeleton.boneInverses
      for (const [b, part] of parts) {
        const bone = bones[b]
        if (!bone) { part.geo.dispose(); continue }
        // Rigid skinning: world = mesh · bindInv · bone · boneInv · bind.
        _m.copy(sm.matrixWorld).multiply(sm.bindMatrixInverse).multiply(bone.matrixWorld).multiply(inv[b]!).multiply(sm.bindMatrix)
        _m2.makeTranslation(part.centre.x, part.centre.y, part.centre.z)
        _m.multiply(_m2)
        _m.decompose(_p, _q, _s)
        const mesh = new Mesh(part.geo, this.mat)
        mesh.position.copy(_p)
        mesh.quaternion.copy(_q)
        mesh.scale.copy(_s)
        mesh.castShadow = false
        const bb = part.geo.boundingBox!
        spawned.push(this.add(mesh, Math.max(0.05, (bb.max.y - bb.min.y) * 0.5 * _s.y)))
        _c.add(_p)
        count++
      }
    }
    if (!count) model.getWorldPosition(_c)
    else _c.multiplyScalar(1 / count)
    // No colours given: the plating's own, sampled off the model.
    if (!colors.length && meshes[0]) colors = sampleColors(meshes[0].geometry, 3)
    // Loose plating blocks in its own colours.
    for (let k = 0; k < blocks && colors.length; k++) {
      const s = 0.12 + Math.random() * 0.14
      const g = new BoxGeometry(s, s, s)
      const col = new Color(colors[k % colors.length]!)
      const cc = new Float32Array(g.attributes.position!.count * 3)
      for (let i = 0; i < cc.length; i += 3) { cc[i] = col.r; cc[i + 1] = col.g; cc[i + 2] = col.b }
      g.setAttribute('color', new BufferAttribute(cc, 3))
      g.computeBoundingBox()
      const mesh = new Mesh(g, this.mat)
      mesh.position.set(_c.x + (Math.random() - 0.5) * 0.5, _c.y + (Math.random() - 0.3) * 0.6, _c.z + (Math.random() - 0.5) * 0.5)
      spawned.push(this.add(mesh, s / 2))
    }
    // Out from the middle, away from the hit, up, spinning.
    for (const pc of spawned) {
      let dx = pc.mesh.position.x - _c.x
      let dz = pc.mesh.position.z - _c.z
      if (from) {
        const fl = Math.hypot(_c.x - from.x, _c.z - from.z) || 1
        dx += ((_c.x - from.x) / fl) * 0.4
        dz += ((_c.z - from.z) / fl) * 0.4
      }
      const l = Math.hypot(dx, dz) || 1
      const sp = (1.5 + Math.random() * 2.5) * power
      pc.vx = (dx / l) * sp + (Math.random() - 0.5)
      pc.vz = (dz / l) * sp + (Math.random() - 0.5)
      pc.vy = (2.5 + Math.random() * 3) * power
    }
    // Over the cap: the oldest start sinking now.
    const over = this.pieces.length - MAX_PIECES
    for (let k = 0; k < over; k++) {
      const pc = this.pieces[k]!
      if (pc.t < LIE_FOR) pc.t = LIE_FOR
    }
  }

  private add(mesh: Mesh, half: number): Piece {
    this.root.add(mesh)
    const ax = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    const pc: Piece = { mesh, vx: 0, vy: 0, vz: 0, ax, spin: 4 + Math.random() * 8, half, t: 0, rest: false, sinking: false, sinkFrom: 0 }
    this.pieces.push(pc)
    return pc
  }

  /** One step: tumble and bounce, lie, sink, go. */
  update(dt: number): void {
    const h = this.host
    for (let k = this.pieces.length - 1; k >= 0; k--) {
      const pc = this.pieces[k]!
      pc.t += dt
      const m = pc.mesh
      if (pc.t >= LIE_FOR) {
        if (!pc.sinking) { pc.sinking = true; pc.rest = true; pc.sinkFrom = m.position.y }
        const s = (pc.t - LIE_FOR) / SINK_FOR
        m.position.y = pc.sinkFrom - s * (pc.half * 2 + 0.1)
        if (s >= 1) {
          m.removeFromParent()
          m.geometry.dispose()
          this.pieces.splice(k, 1)
        }
        continue
      }
      if (pc.rest) continue
      pc.vy -= G * dt
      const nx = m.position.x + pc.vx * dt
      const nz = m.position.z + pc.vz * dt
      if (h.solidAt?.(nx, m.position.z)) pc.vx *= -BOUNCE
      else m.position.x = nx
      if (h.solidAt?.(m.position.x, nz)) pc.vz *= -BOUNCE
      else m.position.z = nz
      m.position.y += pc.vy * dt
      _dq.setFromAxisAngle(pc.ax, pc.spin * dt)
      m.quaternion.premultiply(_dq)
      const floor = h.floorAt(m.position.x, m.position.z, m.position.y + pc.half) + pc.half
      if (m.position.y <= floor) {
        m.position.y = floor
        if (Math.abs(pc.vy) < 1.2) {
          pc.vy = 0
          pc.vx *= 0.6
          pc.vz *= 0.6
          pc.spin *= 0.5
          if (Math.hypot(pc.vx, pc.vz) < 0.15) pc.rest = true
        } else {
          pc.vy = -pc.vy * BOUNCE
          pc.vx *= 0.75
          pc.vz *= 0.75
          pc.spin *= 0.7
        }
      }
      // Fell into a pit: gone after its rest, like the rest.
      if (m.position.y < -60) pc.rest = true
    }
  }

  clear(): void {
    for (const pc of this.pieces) { pc.mesh.removeFromParent(); pc.mesh.geometry.dispose() }
    this.pieces.length = 0
  }

  dispose(): void {
    this.clear()
    this.root.removeFromParent()
    this.mat.dispose()
  }
}
