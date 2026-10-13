import {
  AdditiveBlending, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry,
  Vector3, type Camera
} from 'three'

/**
 * ─── A Searchlight Drone's beam (`sim/enemies.ts`, kind 'spotter') ──────────
 *
 * A cone of light from its lamp down to a pool of light on the floor, and
 * the pool's rim. Warm white while it searches, red while it holds a lock and
 * while the strike it called is on its way. Additive and depth-write off, a
 * few centimetres over the floor: light on the roof, never a second surface
 * fighting it (the floor markers' rule).
 *
 * It hangs under the machine's own root (drawn and culled with it); the sim
 * keeps the pool in world space and `aimSearchBeam` works it into the root's
 * frame each frame.
 *
 * The cone fades out as the eye comes near it and is gone with the eye in
 * it (`coneFade`): drawn from inside, its far wall washed the whole view
 * red-brown and the near plane cut its near wall in a hard line across the
 * screen (playtest #154). The pool and its rim stay; the HUD's edge glow
 * says "you are in the light" (`hudLive.spotLit`).
 */

export const BEAM_SEARCH = new Color('#fff1b0')
export const BEAM_LOCK = new Color('#ff2d3f')

export interface SearchBeam {
  root: Group
  /** Lamp → floor; its apex at the lamp, opening down −Y (scaled to length). */
  cone: Mesh
  /** The pool of light, and its rim. */
  pool: Mesh
  rim: Mesh
}

let coneGeo: CylinderGeometry | null = null
let poolGeo: CircleGeometry | null = null
let rimGeo: RingGeometry | null = null

const glowMat = (opacity: number): MeshBasicMaterial => new MeshBasicMaterial({
  color: BEAM_SEARCH.clone(), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false,
  side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
})

export const makeSearchBeam = (): SearchBeam => {
  if (!coneGeo) {
    // Radius 1 at the floor end, a lamp's width at the top; unit length.
    coneGeo = new CylinderGeometry(0.1, 1, 1, 24, 1, true)
    coneGeo.translate(0, -0.5, 0)
    poolGeo = new CircleGeometry(1, 40)
    poolGeo.rotateX(-Math.PI / 2)
    rimGeo = new RingGeometry(0.88, 1, 48)
    rimGeo.rotateX(-Math.PI / 2)
  }
  const root = new Group()
  root.name = 'searchBeam'
  const cone = new Mesh(coneGeo, glowMat(0.12))
  const pool = new Mesh(poolGeo!, glowMat(0.22))
  const rim = new Mesh(rimGeo!, glowMat(0.7))
  cone.renderOrder = pool.renderOrder = rim.renderOrder = 2
  cone.onBeforeRender = (_r, _s, camera) => fadeCone(cone, camera)
  root.add(cone, pool, rim)
  return { root, cone, pool, rim }
}

/** The cone is fully drawn with the eye this far (m) outside it, and gone
 *  with the eye CONE_FADE_IN outside it or nearer (inside: gone). */
export const CONE_FADE_IN = 0.3
export const CONE_FADE_OUT = 1.8

/**
 * How much of the cone to draw (0..1) with the eye at (cx, cy, cz) in the
 * cone mesh's own frame: apex at the origin, the unit cone opening down −Y,
 * scaled by (r, len, r). Measured as the eye's distance (m) outside the cone.
 */
export const coneFade = (cx: number, cy: number, cz: number, r: number, len: number): number => {
  const t = -cy
  const tc = Math.max(0, Math.min(1, t))
  const radial = Math.hypot(cx, cz) * r - (0.1 + 0.9 * tc) * r
  const axial = t < 0 ? -t * len : t > 1 ? (t - 1) * len : -Infinity
  const d = Math.max(radial, axial)
  const k = Math.max(0, Math.min(1, (d - CONE_FADE_IN) / (CONE_FADE_OUT - CONE_FADE_IN)))
  return k * k * (3 - 2 * k)
}

const _eye = new Vector3()
const _size = new Vector3()

/** Set the cone's opacity from its base (`aimSearchBeam`) and the eye: run
 *  just before it is drawn, with the camera that draws it. */
export const fadeCone = (cone: Mesh, camera: Camera): void => {
  _eye.setFromMatrixPosition(camera.matrixWorld)
  cone.worldToLocal(_eye)
  // Its size in the world (its parents may scale it too).
  _size.setFromMatrixScale(cone.matrixWorld)
  const base = (cone.userData.opacity as number | undefined) ?? 0
  ;(cone.material as MeshBasicMaterial).opacity = base * coneFade(_eye.x, _eye.y, _eye.z, _size.x, _size.y)
}

const _down = new Vector3(0, -1, 0)
const _dir = new Vector3()

/**
 * Lay the beam from the lamp (lx, ly, lz) to the pool's middle (sx, sy, sz),
 * both in the beam's parent frame; `r` the pool's radius (m). `lock` 0..1
 * turns it red; `on` 0..1 is its brightness (0: the lamp is out); `glare`
 * 0..1 brightens it in the dark.
 */
export const aimSearchBeam = (
  b: SearchBeam, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number,
  r: number, lock: number, on: number, glare: number
): void => {
  b.root.visible = on > 0.01
  if (!b.root.visible) return
  _dir.set(sx - lx, sy - ly, sz - lz)
  const len = Math.max(0.05, _dir.length())
  _dir.divideScalar(len)
  b.cone.position.set(lx, ly, lz)
  b.cone.quaternion.setFromUnitVectors(_down, _dir)
  b.cone.scale.set(r, len, r)
  // The rim a little over the pool, the pool a few cm over the floor.
  b.pool.position.set(sx, sy + 0.05, sz)
  b.rim.position.set(sx, sy + 0.07, sz)
  b.pool.scale.setScalar(r)
  b.rim.scale.setScalar(r)
  const k = Math.max(0, Math.min(1, lock))
  const gl = 1 + 0.8 * Math.max(0, Math.min(1, glare))
  for (const [m, base] of [[b.cone, 0.1], [b.pool, 0.2], [b.rim, 0.6]] as const) {
    const mat = m.material as MeshBasicMaterial
    mat.color.copy(BEAM_SEARCH).lerp(BEAM_LOCK, k)
    mat.opacity = Math.min(1, base * on * gl * (1 + 0.6 * k))
  }
  // The cone's own, faded by the eye's nearness as it is drawn (`fadeCone`).
  b.cone.userData.opacity = (b.cone.material as MeshBasicMaterial).opacity
}
