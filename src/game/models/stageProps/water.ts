import { BoxGeometry, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, type BufferGeometry } from 'three'
import { rbox, rcyl, sph, torus, xform, paint, merge, stripUv } from '../kit'
import { toonVC, outlineMat } from '../toon'

/**
 * The Tidewater Locks' props (`sim/stages/water.ts`):
 *
 *  - a water surface over a zone: one translucent quad, rippling (two
 *    crossing sine sets in the fragment shader), foam at its rim, raised
 *    and lowered with the tide (its `y`);
 *  - a lock's valve: a red wheel on a wall that spins and turns green when
 *    shot (the lock drains);
 *  - a pool's coping: a stone lip along every rim edge over a sunk basin;
 *  - a flood room's inlet (a pipe out of the wall, a dark mouth) and its
 *    floor drain (a grate).
 *
 * The surface's `uChurn` whips it white while an inlet pours in or a drain
 * pulls it out. Never two opaque faces in one plane: the coping stands 7 cm
 * proud of the rim and 6 cm out over the basin wall, its runs along X carry
 * the corners (the runs along Z start past them, a little lower and
 * narrower), the grate stands 4 cm proud of its floor, the pipe's mouth
 * 3 cm out of its cap.
 */

const WATER_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uHalf;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform float uFlow;
uniform vec2 uDir;
uniform float uChurn;
varying vec2 vP;
void main() {
  vec2 p = vP - uDir * uTime * uFlow;
  float r = sin(p.x * 1.7 + uTime * 1.3) * 0.5 + sin(p.y * 2.1 - uTime * 1.1) * 0.5;
  r += sin((p.x + p.y) * 3.3 + uTime * 2.0) * 0.25;
  // Churned: a faster, finer chop breaking white.
  r += uChurn * sin(p.x * 5.1 - uTime * 6.0) * sin(p.y * 4.7 + uTime * 5.3) * 0.6;
  float glint = smoothstep(0.75 - 0.3 * uChurn, 1.0, r * 0.5 + 0.5);
  vec2 e = uHalf - abs(vP);
  float rim = 1.0 - smoothstep(0.0, 0.35 + 0.6 * uChurn, min(e.x, e.y));
  vec3 c = mix(uDeep, uLight, 0.35 + 0.35 * (r * 0.5 + 0.5)) + glint * (0.35 + 0.4 * uChurn) + rim * 0.5;
  gl_FragColor = vec4(c, 0.62 + 0.25 * rim + 0.1 * uChurn);
}
`

export interface WaterMesh {
  mesh: Mesh
  mat: ShaderMaterial
}

/** The surface over (x0, z0)–(x1, z1); the caller sets `mesh.position.y`. */
export const buildWater = (x0: number, z0: number, x1: number, z1: number, flow = 0, dx = 0, dz = 0): WaterMesh => {
  const w = x1 - x0
  const d = z1 - z0
  const mat = new ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uHalf: { value: [w / 2, d / 2] },
      uDeep: { value: new Color('#1d6fb8') },
      uLight: { value: new Color('#5fd2ff') },
      uFlow: { value: flow },
      // World (dx, dz) in the quad's plane: x stays, z flips.
      uDir: { value: [dx, -dz] },
      uChurn: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide
  })
  const mesh = new Mesh(new PlaneGeometry(w, d), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
  mesh.renderOrder = 3
  return { mesh, mat }
}

export interface ValveMesh {
  root: Group
  wheel: Group
  /** The rim: red while the lock is shut, green once it drains. */
  rim: Mesh
}

let hubGeo: BufferGeometry | null = null

/** A valve wheel facing +Z (the caller turns it to face the room). */
export const buildValve = (): ValveMesh => {
  if (!hubGeo) {
    hubGeo = merge([
      xform(paint(rbox(0.5, 0.5, 0.16, 0.3), '#4a5468'), [0, 0, 0]),
      xform(paint(rcyl(0.07, 0.4, 0.02, 10), '#6a7488'), [0, 0, 0.2], [Math.PI / 2, 0, 0])
    ])
  }
  const root = new Group()
  root.add(new Mesh(hubGeo, toonVC()))
  const wheel = new Group()
  wheel.position.z = 0.42
  const spokes = merge([
    xform(paint(sph(0.09, 10, 8), '#d8dde8'), [0, 0, 0]),
    ...[0, 1, 2, 3].map(k => xform(paint(rbox(0.05, 0.62, 0.05, 0.3), '#d8dde8'), [0, 0, 0], [0, 0, (k * Math.PI) / 4]))
  ])
  wheel.add(new Mesh(spokes, toonVC()))
  const rim = new Mesh(torus(0.33, 0.06, 8, 26), new ShaderMaterial({
    vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uColor;void main(){gl_FragColor=vec4(uColor,1.0);}',
    uniforms: { uColor: { value: new Color('#ff4a3a') } },
    toneMapped: false
  }))
  wheel.add(rim)
  const o = new Mesh(spokes, outlineMat(0.02))
  o.renderOrder = -1
  wheel.add(o)
  root.add(wheel)
  return { root, wheel, rim }
}

export const setValveColor = (v: ValveMesh, hex: string): void => {
  ((v.rim.material as ShaderMaterial).uniforms.uColor!.value as Color).set(hex)
}

// ─── A pool's coping ─────────────────────────────────────────────────────────

/** One cell edge of a pool's rim: the line (x0, z0)–(x1, z1) on the rim floor
 *  at `y`, the basin on the side (nx, nz) (a unit axis). */
export interface RimEdge {
  x0: number
  z0: number
  x1: number
  z1: number
  y: number
  nx: number
  nz: number
}

/** The coping: how far it lies back on the rim, out over the basin, over and
 *  under the rim floor (m). */
const COPE_BACK = 0.34
const COPE_OUT = 0.06
export const COPE_UP = 0.07
const COPE_DOWN = 0.14
/** The runs along Z: this much lower, narrower and shallower, so where they
 *  meet a run along X no two faces share a plane. */
const COPE_Z_LESS = 0.025

/**
 * The coping's parts, one box per straight run (edges merged where they
 * continue one another). A run along X (a basin north or south of it)
 * reaches over the corner it shares with a run along Z; that run starts
 * past the corner's overhang. Parts are separate geometries (the z-fight
 * test reads them part by part); `buildPoolRim` merges them.
 */
export const poolRimParts = (edges: RimEdge[]): BufferGeometry[] => {
  type Run = { along: 'x' | 'z'; line: number; a: number; b: number; y: number; nx: number; nz: number }
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-6
  const flat = edges.map((e): Run => {
    const along = near(e.z0, e.z1) ? 'x' : 'z'
    return {
      along, line: along === 'x' ? e.z0 : e.x0,
      a: along === 'x' ? Math.min(e.x0, e.x1) : Math.min(e.z0, e.z1),
      b: along === 'x' ? Math.max(e.x0, e.x1) : Math.max(e.z0, e.z1),
      y: e.y, nx: e.nx, nz: e.nz
    }
  })
  flat.sort((p, q) => (p.along === q.along ? 0 : p.along < q.along ? -1 : 1) || p.line - q.line || p.nx - q.nx || p.nz - q.nz || p.y - q.y || p.a - q.a)
  // Collinear edges that continue one another make one run.
  const runs: Run[] = []
  for (const e of flat) {
    const last = runs[runs.length - 1]
    if (last && last.along === e.along && near(last.line, e.line) && last.nx === e.nx && last.nz === e.nz && near(last.y, e.y) && near(last.b, e.a)) last.b = e.b
    else runs.push({ ...e })
  }
  // A corner: a run across this one, at its height, ending on its line at `at`.
  const corner = (r: Run, at: number) => runs.some(o => o.along !== r.along && near(o.y, r.y) &&
    near(o.line, at) && (near(o.a, r.line) || near(o.b, r.line)))
  const parts: BufferGeometry[] = []
  for (const r of runs) {
    let a = r.a
    let b = r.b
    if (r.along === 'x') {
      if (corner(r, a)) a -= COPE_BACK
      if (corner(r, b)) b += COPE_BACK
    } else {
      if (corner(r, a)) a += COPE_OUT
      if (corner(r, b)) b -= COPE_OUT
    }
    if (b - a < 0.05) continue
    const less = r.along === 'z' ? COPE_Z_LESS : 0
    const top = r.y + COPE_UP - less
    const bot = r.y - COPE_DOWN + less
    // Across the run: `back` onto the rim, COPE_OUT out over the basin.
    const n = r.along === 'x' ? r.nz : r.nx
    const c0 = r.line - n * (COPE_BACK - less)
    const c1 = r.line + n * COPE_OUT
    const lo = Math.min(c0, c1)
    const hi = Math.max(c0, c1)
    const g = stripUv(new BoxGeometry(r.along === 'x' ? b - a : hi - lo, top - bot, r.along === 'x' ? hi - lo : b - a))
    const at: [number, number, number] = r.along === 'x' ? [(a + b) / 2, (top + bot) / 2, (lo + hi) / 2] : [(lo + hi) / 2, (top + bot) / 2, (a + b) / 2]
    parts.push(paint(xform(g, at), r.along === 'x' ? '#c9d2da' : '#bfc9d2'))
  }
  return parts
}

/** The coping along `edges`, one mesh (null: no edges). */
export const buildPoolRim = (edges: RimEdge[]): Mesh | null => {
  const parts = poolRimParts(edges)
  if (!parts.length) return null
  return new Mesh(merge(parts), toonVC())
}

// ─── A flood room's inlet and drain ──────────────────────────────────────────

/** An inlet's pipe: radius, how far it stands out of the wall (m). */
export const INLET_R = 0.34
export const INLET_OUT = 0.45

/** An inlet pipe out of a wall, facing +Z, its back sunk 0.12 into the wall
 *  (local origin: on the wall, at the pipe's axis). */
export const inletParts = (): BufferGeometry[] => [
  // The pipe: a capped cylinder along Z.
  paint(xform(rcyl(INLET_R, INLET_OUT + 0.12, 0.04, 18), [0, 0, (INLET_OUT - 0.12) / 2], [Math.PI / 2, 0, 0]), '#5d6b7c'),
  // A flange where it leaves the wall.
  paint(xform(torus(INLET_R + 0.05, 0.05, 8, 22), [0, 0, 0.06]), '#7d8a9b'),
  // The dark mouth: a disc standing 3 cm out of the cap.
  paint(xform(rcyl(INLET_R - 0.08, 0.06, 0.01, 18), [0, 0, INLET_OUT], [Math.PI / 2, 0, 0]), '#0e1620')
]

export const buildInlet = (): Mesh => new Mesh(merge(inletParts()), toonVC())

/** The drain grate: its side (m), how far it stands proud of the floor. */
export const DRAIN_SIDE = 1.4
export const DRAIN_UP = 0.04

/** A floor drain (local origin: on the floor at its middle): a dark sump
 *  plate sunk through the floor, four slats on it. */
export const drainParts = (): BufferGeometry[] => {
  const parts = [paint(xform(stripUv(new BoxGeometry(DRAIN_SIDE, 0.12, DRAIN_SIDE)), [0, DRAIN_UP - 0.06, 0]), '#1a2430')]
  for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * (DRAIN_SIDE / 4.4)
    parts.push(paint(xform(stripUv(new BoxGeometry(0.1, 0.05, DRAIN_SIDE - 0.1)), [x, DRAIN_UP + 0.025, 0]), '#8a96a6'))
  }
  return parts
}

export const buildDrain = (): Mesh => new Mesh(merge(drainParts()), toonVC())
