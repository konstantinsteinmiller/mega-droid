import {
  AdditiveBlending, CircleGeometry, Color, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry
} from 'three'
import type { Enemy } from '../world'

/**
 * ─── World-placed fx on a mini-boss ──────────────────────────────────────────
 *
 * A mini-boss's module draws things that are not on its body: lanes and
 * laser lines across the floor, a beam's arc, decoy holograms, saw blades
 * rolling away. The world gives a module no scene of its own, so these hang
 * on a LAYER under the mini-boss's root (`fxLayer`) whose matrix cancels the
 * root's move and turn every frame (`alignFx`, from the module's `pose`):
 * its children are placed in world x / z, heights from the root's floor.
 *
 * Every floor mark here is a transparent additive decal a few centimetres
 * over the floor (depth write off): nothing opaque, nothing to z-fight.
 */

export const fxLayer = (e: Enemy): Group => {
  const g = new Group()
  g.matrixAutoUpdate = false
  e.root.add(g)
  return g
}

const _t = new Matrix4()
/** Cancel the root's place and turn: the layer's children stand in world x / z. */
export const alignFx = (e: Enemy, g: Group): void => {
  const p = e.root.position
  _t.makeTranslation(-p.x, 0, -p.z)
  g.matrix.makeRotationY(-e.root.rotation.y).multiply(_t)
  g.matrixWorldNeedsUpdate = true
}

const decalMat = (color: string): MeshBasicMaterial => new MeshBasicMaterial({
  color: new Color(color), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
})

const _plane = (() => {
  let g: PlaneGeometry | null = null
  return (): PlaneGeometry => {
    if (!g) {
      g = new PlaneGeometry(1, 1)
      g.rotateX(-Math.PI / 2)
    }
    return g
  }
})()

/** A straight band on the floor (a lane, a laser line): `place` lays it
 *  from (x0, z0) to (x1, z1), `width` m wide. */
export class FloorStrip {
  readonly mesh: Mesh
  readonly mat: MeshBasicMaterial
  constructor(layer: Group, color: string, readonly lift = 0.05) {
    this.mat = decalMat(color)
    this.mesh = new Mesh(_plane(), this.mat)
    this.mesh.renderOrder = 1
    this.mesh.visible = false
    layer.add(this.mesh)
  }

  place(x0: number, z0: number, x1: number, z1: number, width: number): void {
    const len = Math.hypot(x1 - x0, z1 - z0) || 0.01
    this.mesh.position.set((x0 + x1) / 2, this.lift, (z0 + z1) / 2)
    this.mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0)
    this.mesh.scale.set(width, 1, len)
  }

  show(opacity: number, color?: string): void {
    this.mesh.visible = opacity > 0.001
    this.mat.opacity = opacity
    if (color) this.mat.color.set(color)
  }

  hide(): void {
    this.mesh.visible = false
  }
}

/** A flat sector on the floor round (x, z), from yaw `a0` to `a1` (the
 *  game's yaw: 0 = +z), out to `r` m: a sweep's arc. Rebuilt per sweep. */
export class FloorArc {
  readonly mesh: Mesh
  readonly mat: MeshBasicMaterial
  constructor(layer: Group, color: string, readonly lift = 0.06) {
    this.mat = decalMat(color)
    this.mesh = new Mesh(new CircleGeometry(1, 4), this.mat)
    this.mesh.renderOrder = 1
    this.mesh.visible = false
    layer.add(this.mesh)
  }

  place(x: number, z: number, a0: number, a1: number, r: number): void {
    this.mesh.geometry.dispose()
    // CircleGeometry's angle θ, laid flat, points along (cos θ, −sin θ):
    // the yaw a (sin a, cos a) is θ = −π/2 − a.
    const g = new CircleGeometry(r, Math.max(8, Math.round((a1 - a0) * 16)), -Math.PI / 2 - a1, a1 - a0)
    g.rotateX(-Math.PI / 2)
    this.mesh.geometry = g
    this.mesh.position.set(x, this.lift, z)
  }

  show(opacity: number): void {
    this.mesh.visible = opacity > 0.001
    this.mat.opacity = opacity
  }

  hide(): void {
    this.mesh.visible = false
  }
}
