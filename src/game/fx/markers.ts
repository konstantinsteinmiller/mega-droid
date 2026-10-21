import {
  Sprite, SpriteMaterial, Mesh, RingGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide, Color, Group,
  CircleGeometry, NormalBlending
} from 'three'
import { ringTexture, glowTexture } from '../world/textures'

/**
 * Telegraph rings (billboards over an attacking enemy), floor markers (where
 * a leap / shell will land), shock rings (a landing's shockwave) and the
 * enemies' blob shadows. All pooled.
 */

export const TELE_ORANGE = new Color('#ffa21f')
export const TELE_RED = new Color('#ff2d3f')
export const TELE_WHITE = new Color('#ffffff')

/** A shrinking ring above an enemy. Scale 1 = closed. */
export const makeTeleRing = (): Sprite => {
  const m = new SpriteMaterial({
    map: ringTexture(), color: TELE_ORANGE.clone(), transparent: true, blending: AdditiveBlending,
    depthTest: false, depthWrite: false, toneMapped: false
  })
  const s = new Sprite(m)
  s.renderOrder = 20
  s.visible = false
  return s
}

/** Update a telegraph ring: `k` = 0 at start … 1 at impact. */
export const setTeleRing = (s: Sprite, k: number, red: boolean, parryWindow01: number, size: number): void => {
  const m = s.material as SpriteMaterial
  const closing = Math.min(1, Math.max(0, k))
  const r = size * (1 + (1 - closing) * 1.8)
  s.scale.set(r, r, 1)
  const inParry = !red && closing >= 1 - parryWindow01
  m.color.copy(inParry ? TELE_WHITE : red ? TELE_RED : TELE_ORANGE)
  m.opacity = 0.35 + 0.65 * closing
  s.visible = true
}

/** A cancelled marker's fade-out (s): gone promptly, but not in a snap. */
export const MARKER_FADE = 0.18

export class FloorMarkers {
  readonly root = new Group()
  /** `owner`: the machine whose wind-up it marks, while the strike is still
   *  its to cancel (null once launched, or for a hazard nobody owns).
   *  `fade` > 0: cancelled, fading out over that many seconds. */
  private pool: Array<{ mesh: Mesh; fill: Mesh; t: number; dur: number; r: number; active: boolean; owner: object | null; fade: number }> = []
  /** The climb: the floor height under a marker (a ledge, a walkway). Null
   *  on a flat map, where every marker lies at y = 0. */
  floorY: ((x: number, z: number) => number) | null = null

  /** `owner`: the machine winding up the strike it marks. If it dies or is
   *  stunned before the strike leaves (`cancelIf`), the marker fades out;
   *  `release` hands it over to the shell in flight, which still lands. */
  spawn(x: number, z: number, r: number, dur: number, owner: object | null = null, color: Color = TELE_RED): void {
    let m = this.pool.find(p => !p.active)
    if (!m) {
      const mat = new MeshBasicMaterial({ color: TELE_RED.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
      const mesh = new Mesh(new RingGeometry(0.86, 1, 40), mat)
      mesh.rotation.x = -Math.PI / 2
      const fillMat = new MeshBasicMaterial({ color: TELE_RED.clone(), transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
      const fill = new Mesh(new CircleGeometry(1, 40), fillMat)
      fill.rotation.x = -Math.PI / 2
      this.root.add(mesh, fill)
      m = { mesh, fill, t: 0, dur, r, active: true, owner, fade: 0 }
      this.pool.push(m)
    }
    m.active = true
    m.owner = owner
    m.fade = 0
    // A Master's charged blast (#188) wears its element; every other, red.
    ;(m.mesh.material as MeshBasicMaterial).color.copy(color)
    ;(m.fill.material as MeshBasicMaterial).color.copy(color)
    ;(m.fill.material as MeshBasicMaterial).opacity = 0.18
    m.t = 0
    m.dur = dur
    m.r = r
    const fy = this.floorY ? Math.max(-60, this.floorY(x, z)) : 0
    m.mesh.position.set(x, fy + 0.03, z)
    m.fill.position.set(x, fy + 0.025, z)
    m.mesh.scale.setScalar(r)
    m.fill.scale.setScalar(0.01)
    m.mesh.visible = m.fill.visible = true
  }

  /** The strike at (x, z) has left its owner (a shell launched): its marker
   *  is no longer the owner's to cancel. The owned marker nearest the spot. */
  release(owner: object, x: number, z: number): void {
    let best: (typeof this.pool)[number] | null = null
    let bd = 1
    for (const m of this.pool) {
      if (!m.active || m.owner !== owner) continue
      const d = Math.hypot(m.mesh.position.x - x, m.mesh.position.z - z)
      if (d < bd) { bd = d; best = m }
    }
    if (best) best.owner = null
  }

  /** Cancel the owned markers whose owner `gone` says will never strike
   *  (dead, stunned, removed): each fades out over MARKER_FADE. */
  cancelIf(gone: (owner: object) => boolean): void {
    for (const m of this.pool) {
      if (!m.active || !m.owner || m.fade > 0 || !gone(m.owner)) continue
      m.owner = null
      m.fade = MARKER_FADE
    }
  }

  /** Markers still showing (fading ones included): for tests. */
  get live(): number {
    return this.pool.filter(m => m.active).length
  }

  update(dt: number, time: number): void {
    for (const m of this.pool) {
      if (!m.active) continue
      if (m.fade > 0) {
        m.fade -= dt
        const a = Math.max(0, m.fade / MARKER_FADE)
        ;(m.mesh.material as MeshBasicMaterial).opacity = 0.55 * a
        ;(m.fill.material as MeshBasicMaterial).opacity = 0.18 * a
        if (m.fade <= 0) {
          m.active = false
          m.mesh.visible = m.fill.visible = false
        }
        continue
      }
      m.t += dt
      const k = m.t / m.dur
      if (k >= 1) {
        m.active = false
        m.mesh.visible = m.fill.visible = false
        continue
      }
      m.fill.scale.setScalar(Math.max(0.01, m.r * k))
      ;(m.mesh.material as MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 20) * 0.3
    }
  }

  clear(): void {
    for (const m of this.pool) {
      m.active = false
      m.owner = null
      m.fade = 0
      m.mesh.visible = m.fill.visible = false
    }
  }
}

export class ShockRings {
  readonly root = new Group()
  private pool: Array<{ mesh: Mesh; t: number; dur: number; r: number; active: boolean; linear: boolean }> = []

  spawn(x: number, y: number, z: number, r: number, color: string, dur = 0.45): void {
    let m = this.pool.find(p => !p.active)
    if (!m) {
      const mat = new MeshBasicMaterial({ color: new Color(color), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
      const mesh = new Mesh(new RingGeometry(0.8, 1, 48), mat)
      mesh.rotation.x = -Math.PI / 2
      this.root.add(mesh)
      m = { mesh, t: 0, dur, r, active: true, linear: false }
      this.pool.push(m)
    }
    ;(m.mesh.material as MeshBasicMaterial).color.set(color)
    m.active = true
    m.linear = false
    m.t = 0
    m.dur = dur
    m.r = r
    m.mesh.position.set(x, y, z)
    m.mesh.visible = true
  }

  /** A ring that expands at a CONSTANT speed — drawn exactly where the boss
   *  hazard it represents is, so dodging reads truthfully. */
  spawnLinear(x: number, z: number, speed: number, maxR: number, color: string): void {
    this.spawn(x, 0.06, z, maxR, color, maxR / speed)
    const m = this.pool.find(p => p.active && p.t === 0 && p.r === maxR)
    if (m) m.linear = true
  }

  update(dt: number): void {
    for (const m of this.pool) {
      if (!m.active) continue
      m.t += dt
      const k = m.t / m.dur
      if (k >= 1) {
        m.active = false
        m.mesh.visible = false
        continue
      }
      const e = m.linear ? k : 1 - Math.pow(1 - k, 2)
      m.mesh.scale.setScalar(0.2 + m.r * e)
      ;(m.mesh.material as MeshBasicMaterial).opacity = m.linear ? 0.9 - k * 0.5 : 1 - k
    }
  }
}

let shadowMat: MeshBasicMaterial | null = null
let shadowGeo: CircleGeometry | null = null
/** Soft blob shadow under a character (no shadow maps anywhere). */
export const makeBlobShadow = (r: number): Mesh => {
  if (!shadowMat) {
    shadowMat = new MeshBasicMaterial({
      map: glowTexture(), color: new Color('#000000'), transparent: true, opacity: 0.32,
      depthWrite: false, blending: NormalBlending, toneMapped: false
    })
    shadowGeo = new CircleGeometry(1, 20)
  }
  const m = new Mesh(shadowGeo!, shadowMat)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  m.scale.setScalar(r)
  m.renderOrder = 1
  return m
}
