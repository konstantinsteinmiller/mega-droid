import {
  InstancedMesh, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial, Color, CustomBlending, OneFactor,
  OneMinusSrcAlphaFactor, DynamicDrawUsage, Matrix4, Vector3, type Scene
} from 'three'
import { CELL } from '../world/levelGen'
import { findPath, smoothPath, hasLineOfSight, floorAt, type Nav } from '../world/nav'
import { PLAYER_R } from '../sim/constants'

/**
 * ─── Objective trail ─────────────────────────────────────────────────────────
 *
 * Small yellow chevrons on the floor that lead to the mission's main
 * objective (`MissionObjects.target`) — in the tutorial walkthrough to its
 * next lesson (`Walkthrough.goal`) — along the walk the tap-to-move would
 * take: through the doors that open on approach, up to the boss shutter. A
 * blind playtester spent minutes lost in look-alike rooms with only the
 * compass to go on; this says "this way" without a word, and quietly.
 *
 *  - Look: flat chevrons 4 cm over the floor, bright warm yellow in the
 *    game's dark ink outline (they read on pale floors too), with a slow wave
 *    of light running along them toward the target. Once faint and quiet;
 *    playtesters (2026-10-07) walked right over them without seeing them.
 *  - Where: 1.1 m apart from 1.5 m ahead of the player to 8 m out, fading in
 *    at the near end and out at the far one. They are spaced back from the
 *    TARGET, not from the player, so they stay put on the floor while the
 *    player walks and the next ones light up ahead.
 *  - When: only while the mission allows it (not in combat, under a modal,
 *    over a scene lesson or outside the play phase), there is a target
 *    that is not already in plain sight a few metres away, and a path to it.
 *    0.4 s fades either way; a switch to another target fades out first.
 *  - Cost: ONE instanced draw of at most six quads and one small shader, no
 *    per-frame allocation. A* runs at most every 0.35 s, and only once the
 *    player or the target has moved (or every 2 s standing still).
 *
 * The mesh hangs at the scene root: rooms are portal-culled per group, and a
 * trail crosses rooms.
 */

/** Warm yellow, the game's gold. */
const TRAIL_COLOR = '#ffd84a'
/** The outline: the game's cel ink. */
const TRAIL_INK = '#0f1a30'
/** Chevron quad edge (m); the chevron drawn in it is ~0.5 m across. */
const ARROW_SIZE = 0.6
/** Height over the floor (m): above blob shadows (0.02) and floor rings (0.03). */
const ARROW_Y = 0.04
/** Along the path from the player (m): the first chevron, the last one. */
export const TRAIL_START = 1.5
export const TRAIL_END = 8
export const TRAIL_SPACING = 1.1
/** The chevron nearest the target stops this far short of it (m). */
export const TRAIL_GAP = 0.8
/** Most chevrons ever laid out (the 1.5–8 m window holds six). */
export const TRAIL_MAX = 6
/** Floats per laid-out chevron: x, z, yaw, fade, metres short of the target. */
export const TRAIL_STRIDE = 5
/** The target this close AND in plain sight: nothing left to point out (m). */
export const TRAIL_HIDE_NEAR = 4
/** …and it must get this much farther before the trail comes back. */
const HIDE_HYSTERESIS = 0.8
/** Fade-in length at the near end, fade-out length at the far end (m). */
const NEAR_FADE = 0.7
const FAR_FADE = 2
const FADE_TIME = 0.4
/** Path searches: never more often than this (s)… */
const REPATH_MIN = 0.35
/** …and only once the player or the target moved this far (m), or a path
 *  has stood this long (s; doors change the taut line), or a failed search
 *  is this old (s). */
const REPATH_MOVE = 1
const REPATH_IDLE = 2
const REPATH_RETRY = 1
/** A new path ending this far from the old one leads somewhere else: the
 *  old trail fades out before the new one fades in (m). */
const SWITCH_DIST = 3
const OPACITY_BASE = 0.6
const OPACITY_PEAK = 1
/** The light wave: one crest every WAVE_LENGTH metres, every WAVE_PERIOD s. */
const WAVE_PERIOD = 1.2
const WAVE_LENGTH = 5
/** A chevron's heading is taken over ± this much path (m), so it turns
 *  smoothly through a corner instead of snapping. */
const TANGENT = 0.35
/** The player is looked for on the first stretch of the path only (m): a
 *  path that doubles back behind a wall must not capture them. */
const PROJECT_SPAN = 6
const PATH_CAP = 64

const VERT = /* glsl */`
attribute float aAlpha;
varying vec2 vP;
varying float vAlpha;
void main() {
  vP = position.xz;
  vAlpha = aAlpha;
  #include <begin_vertex>
  #include <project_vertex>
}
`

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uLift;
varying vec2 vP;
varying float vAlpha;
// Signed distance to a chevron pointing +Z in the unit quad: two strokes
// meeting at a rounded tip (mirrored, so one segment draws both arms).
float chevron(vec2 p) {
  vec2 pa = vec2(abs(p.x), p.y) - vec2(0.0, 0.24);
  vec2 ba = vec2(0.33, -0.44);
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - 0.1;
}
void main() {
  float d = chevron(vP);
  // One pixel of edge at any distance or angle: no shimmer on a grazing floor.
  float aa = max(fwidth(d), 1e-4);
  float core = 1.0 - smoothstep(-aa, aa, d);
  // A dark ink band round it, as every outline in the game: the yellow
  // reads on the pale floors, the glow on the dark ones.
  float ink = (1.0 - smoothstep(0.06 - aa, 0.06 + aa, d)) - core;
  float a = (core + ink * 0.85) * vAlpha;
  if (a < 0.004) discard;
  // Encode both colours, then premultiply (the blend is ONE / ONE_MINUS_SRC_ALPHA);
  // uLift adds glow to the yellow.
  gl_FragColor = vec4(uInk, 1.0);
  #include <colorspace_fragment>
  vec3 inkC = gl_FragColor.rgb;
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  vec3 col = mix(inkC, gl_FragColor.rgb * (1.0 + uLift), core / max(core + ink, 1e-4));
  gl_FragColor = vec4(col * a, a);
}
`

// ─── Path + layout (pure, see tests/game/objectiveTrail.test.ts) ─────────────

/** A walk from where the player stood to the target, with arc lengths. */
export interface TrailPath {
  n: number
  x: Float32Array
  z: Float32Array
  /** Arc length at each point (m). */
  s: Float32Array
  /** Length of the whole walk (m), counting any points past the capacity. */
  len: number
  /** Where it ends: the target it was found for. */
  tx: number
  tz: number
}

export const createTrailPath = (cap = PATH_CAP): TrailPath => ({
  n: 0, x: new Float32Array(cap), z: new Float32Array(cap), s: new Float32Array(cap), len: 0, tx: 0, tz: 0
})

/** Fill `out` with the walk (x0, z0) → each waypoint. */
export const setTrailPath = (out: TrailPath, x0: number, z0: number, pts: ReadonlyArray<readonly [number, number]>): void => {
  const cap = out.x.length
  out.x[0] = x0
  out.z[0] = z0
  out.s[0] = 0
  let n = 1
  let len = 0
  let lx = x0
  let lz = z0
  for (const [x, z] of pts) {
    const d = Math.hypot(x - lx, z - lz)
    if (d < 1e-4) continue
    len += d
    lx = x
    lz = z
    if (n < cap) {
      out.x[n] = x
      out.z[n] = z
      out.s[n] = len
      n++
    }
  }
  out.n = n
  out.len = len
  out.tx = lx
  out.tz = lz
}

/**
 * The walk to (tx, tz) the tap-to-move would take: A* through doors that open
 * on approach (`through` 1), pulled taut. A target inside a LOCKED door's
 * cell (in front of the boss shutter, until the player opens it) may be
 * reached as well, so the trail ends at that door. On the climb the way
 * goes up ladders and rides lifts (`findPath`'s links): the trail only has
 * to show it. Leaves `out` untouched and returns false when there is no way.
 */
export const buildTrailPath = (nav: Nav, px: number, pz: number, tx: number, tz: number, out: TrailPath): boolean => {
  const i = Math.floor(tx / CELL)
  const j = Math.floor(tz / CELL)
  const locked = i >= 0 && j >= 0 && i < nav.w && j < nav.h && nav.pathBlock[j * nav.w + i]! > 1
  const raw = findPath(nav, px, pz, tx, tz, 1400, locked ? 2 : 1, !!nav.map.terrain)
  if (!raw) return false
  const pts = smoothPath(nav, px, pz, raw, PLAYER_R)
  if (!pts.length) return false
  setTrailPath(out, px, pz, pts)
  return out.n > 1
}

/** Arc length of the point on the path's first stretch nearest (px, pz). */
export const projectOnPath = (p: TrailPath, px: number, pz: number): number => {
  let best = 0
  let bestD = Infinity
  for (let i = 1; i < p.n; i++) {
    const s0 = p.s[i - 1]!
    if (s0 > PROJECT_SPAN) break
    const ax = p.x[i - 1]!
    const az = p.z[i - 1]!
    const dx = p.x[i]! - ax
    const dz = p.z[i]! - az
    const l2 = dx * dx + dz * dz
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0
    const ex = ax + dx * t - px
    const ez = az + dz * t - pz
    const d = ex * ex + ez * ez
    if (d < bestD) {
      bestD = d
      best = s0 + (p.s[i]! - s0) * t
    }
  }
  return best
}

/** Write the point at arc length `s` (clamped to the path) to out[o], out[o+1]. */
const pointAt = (p: TrailPath, s: number, out: Float32Array, o: number): void => {
  const last = p.n - 1
  let i = 1
  while (i < last && p.s[i]! < s) i++
  const s0 = p.s[i - 1]!
  const seg = p.s[i]! - s0
  const t = seg > 1e-6 ? Math.max(0, Math.min(1, (s - s0) / seg)) : 1
  out[o] = p.x[i - 1]! + (p.x[i]! - p.x[i - 1]!) * t
  out[o + 1] = p.z[i - 1]! + (p.z[i]! - p.z[i - 1]!) * t
}

const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

const _tan = new Float32Array(4)

/**
 * Lay the chevrons out along `p` for a player at (px, pz): TRAIL_STRIDE
 * floats each — x, z, yaw (as `rotation.y`: local +Z along the path), fade
 * (0..1, the near- and far-end fades) and how far short of the target it
 * lies (m, for the light wave). Returns how many (≤ `max`), nearest first.
 * Chevron k sits TRAIL_GAP + k·TRAIL_SPACING back from the target, which is
 * what keeps them still on the floor while the player walks.
 */
export const layoutTrail = (p: TrailPath, px: number, pz: number, out: Float32Array, max = TRAIL_MAX): number => {
  if (p.n < 2) return 0
  const at = projectOnPath(p, px, pz)
  const first = at + TRAIL_START
  const last = Math.min(at + TRAIL_END, p.s[p.n - 1]!)
  const top = p.len - TRAIL_GAP
  if (top < first) return 0
  const cap = Math.min(max, Math.floor(out.length / TRAIL_STRIDE))
  let count = 0
  for (let k = Math.floor((top - first) / TRAIL_SPACING); k >= 0 && count < cap; k--) {
    const s = top - k * TRAIL_SPACING
    if (s > last) break
    const o = count * TRAIL_STRIDE
    pointAt(p, s, out, o)
    pointAt(p, Math.max(0, s - TANGENT), _tan, 0)
    pointAt(p, s + TANGENT, _tan, 2)
    out[o + 2] = Math.atan2(_tan[2]! - _tan[0]!, _tan[3]! - _tan[1]!)
    const ahead = s - at
    out[o + 3] = smooth01((ahead - TRAIL_START) / NEAR_FADE) * smooth01((TRAIL_END - ahead) / FAR_FADE)
    out[o + 4] = p.len - s
    count++
  }
  return count
}

/** The target is a few metres off and in plain sight: nothing left to point
 *  out. `wasClose` widens the radius so the trail does not flicker at it. */
export const closeToTarget = (nav: Nav, px: number, pz: number, tx: number, tz: number, wasClose = false): boolean => {
  const r = TRAIL_HIDE_NEAR + (wasClose ? HIDE_HYSTERESIS : 0)
  const dx = tx - px
  const dz = tz - pz
  return dx * dx + dz * dz < r * r && hasLineOfSight(nav, px, pz, tx, tz)
}

// ─── The trail ────────────────────────────────────────────────────────────────

export interface TrailInput {
  /** The mission's say: false in combat, over a scene lesson, under a modal
   *  and outside the play phase. */
  enabled: boolean
  px: number
  pz: number
  /** `MissionObjects.target` (the tutorial walkthrough: `Walkthrough.goal`):
   *  null when there is nothing to lead to. */
  target: { x: number; z: number } | null
  /** Mission clock (s), for the light wave. */
  time: number
  /** The early missions: the trail pulses to be noticed (`PULSE_*`). */
  pulse?: boolean
  /** The view's heading (rad, the player's yaw): a pulse only counts while
   *  a chevron is in front of it. */
  yaw?: number
}

/** Playtesters walked past the chevrons. In the first missions they pulse:
 *  PULSE_FOR seconds of a strong glow and a swell every PULSE_EVERY, the
 *  clock running only while chevrons are on screen (a pulse nobody sees is
 *  not spent). */
export const PULSE_EVERY = 20
export const PULSE_FOR = 3
const PULSE_LIFT = 2.4
const PULSE_ALPHA = 2
const PULSE_SWELL = 0.35
/** A chevron within this of the view's heading (rad) is on screen. */
const PULSE_VIEW = 0.75

/** 0..1 pulse strength at pulse-clock `t` (s): a 3 Hz throb inside its window. */
export const pulseAt = (t: number): number => {
  const u = t % PULSE_EVERY
  if (u >= PULSE_FOR) return 0
  const env = Math.sin((u / PULSE_FOR) * Math.PI)
  return env * (0.6 + 0.4 * Math.sin(u * Math.PI * 6))
}

const _m = new Matrix4()
const _scale = new Vector3(ARROW_SIZE, 1, ARROW_SIZE)
const sq = (dx: number, dz: number): number => dx * dx + dz * dz

export class ObjectiveTrail {
  /** One instanced draw, one chevron per laid-out slot. */
  readonly mesh: InstancedMesh
  private readonly nav: Nav
  private readonly geo: PlaneGeometry
  private readonly mat: ShaderMaterial
  private readonly alpha: InstancedBufferAttribute
  /** The walk on show and the one the last search found (swapped, never reallocated). */
  private path = createTrailPath()
  private next = createTrailPath()
  private readonly slots = new Float32Array(TRAIL_MAX * TRAIL_STRIDE)
  /** 0..1: the show / hide fade. */
  private vis = 0
  private near = false
  private pathOk = false
  /** A path to another target waits for the old trail to fade out. */
  private switching = false
  private sinceSearch = Infinity
  private fromX = 0
  private fromZ = 0
  private toX = 0
  private toZ = 0
  /** The pulse's own clock (s): runs while pulsing chevrons are in view. */
  private pulseT = 0

  constructor(scene: Scene, nav: Nav) {
    this.nav = nav
    this.geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.alpha = new InstancedBufferAttribute(new Float32Array(TRAIL_MAX), 1).setUsage(DynamicDrawUsage)
    this.geo.setAttribute('aAlpha', this.alpha)
    this.mat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(TRAIL_COLOR) }, uInk: { value: new Color(TRAIL_INK) }, uLift: { value: 0.5 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      toneMapped: false
    })
    this.mesh = new InstancedMesh(this.geo, this.mat, TRAIL_MAX)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    // Empty but in the scene from birth: the precompile and the warm-up
    // render reach it, so the first trail costs no shader compile.
    this.mesh.count = 0
    // The instances move every frame; a cached bounding sphere would be stale.
    this.mesh.frustumCulled = false
    // After the blob shadows (1), before the particles (5).
    this.mesh.renderOrder = 2
    this.mesh.name = 'objectiveTrail'
    scene.add(this.mesh)
  }

  /** Every sim step (see `TrailInput`). */
  update(dt: number, o: TrailInput): void {
    this.sinceSearch += dt
    const t = o.target
    this.near = o.enabled && t !== null && closeToTarget(this.nav, o.px, o.pz, t.x, t.z, this.near)
    let want = o.enabled && t !== null && !this.near
    if (want && t) {
      const moved = sq(o.px - this.fromX, o.pz - this.fromZ) > REPATH_MOVE * REPATH_MOVE
      const jumped = sq(t.x - this.toX, t.z - this.toZ) > REPATH_MOVE * REPATH_MOVE
      const stale = this.sinceSearch >= (this.pathOk ? REPATH_IDLE : REPATH_RETRY)
      if (this.sinceSearch >= REPATH_MIN && (moved || jumped || stale)) this.search(o.px, o.pz, t.x, t.z)
      want = this.pathOk
    }
    if (this.switching) {
      if (this.vis <= 0) {
        this.swap()
        this.switching = false
      } else {
        want = false
      }
    }
    this.vis = want ? Math.min(1, this.vis + dt / FADE_TIME) : Math.max(0, this.vis - dt / FADE_TIME)
    const n = this.vis > 0 ? layoutTrail(this.path, o.px, o.pz, this.slots) : 0
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (!n) return
    const sl = this.slots
    const al = this.alpha.array as Float32Array
    const phase = (o.time / WAVE_PERIOD) * Math.PI * 2
    // The pulse: its clock runs only while a chevron is in front of the view.
    let pk = 0
    if (o.pulse && this.vis > 0.5) {
      let seen = false
      for (let i = 0; i < n && !seen; i++) {
        const b = i * TRAIL_STRIDE
        const a = Math.atan2(-(sl[b]! - o.px), -(sl[b + 1]! - o.pz)) - (o.yaw ?? 0)
        seen = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < PULSE_VIEW
      }
      if (seen) {
        this.pulseT += dt
        pk = pulseAt(this.pulseT)
      }
    }

    this.mat.uniforms.uLift!.value = 0.5 + PULSE_LIFT * pk
    _scale.set(ARROW_SIZE * (1 + PULSE_SWELL * pk), 1, ARROW_SIZE * (1 + PULSE_SWELL * pk))
    for (let i = 0; i < n; i++) {
      const b = i * TRAIL_STRIDE
      // Crests run toward the target: brightest where time + distance-to-go lines up.
      const w = 0.5 + 0.5 * Math.cos(phase + (sl[b + 4]! / WAVE_LENGTH) * Math.PI * 2)
      // On the floor it lies on (the climb's ledges; 0 on a flat map). A
      // chevron over a pit — a lift's run while the lift is away — is dark.
      const fy = floorAt(this.nav, sl[b]!, sl[b + 1]!)
      al[i] = fy === -Infinity ? 0 : Math.min(1, this.vis * sl[b + 3]! * (OPACITY_BASE + (OPACITY_PEAK - OPACITY_BASE) * w * w) * (1 + PULSE_ALPHA * pk))
      _m.makeRotationY(sl[b + 2]!).scale(_scale).setPosition(sl[b]!, (fy === -Infinity ? 0 : fy) + ARROW_Y, sl[b + 1]!)
      this.mesh.setMatrixAt(i, _m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true
  }

  /** Leave the scene and free the GPU side. */
  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
    this.geo.dispose()
    this.mat.dispose()
  }

  private search(px: number, pz: number, tx: number, tz: number): void {
    this.sinceSearch = 0
    this.fromX = px
    this.fromZ = pz
    this.toX = tx
    this.toZ = tz
    this.pathOk = buildTrailPath(this.nav, px, pz, tx, tz, this.next)
    if (!this.pathOk) return
    // The same destination swaps in place; another one waits for a fade-out.
    const elsewhere = sq(this.next.tx - this.path.tx, this.next.tz - this.path.tz) > SWITCH_DIST * SWITCH_DIST
    if (this.vis > 0 && this.path.n > 1 && elsewhere) {
      this.switching = true
    } else {
      this.swap()
      this.switching = false
    }
  }

  private swap(): void {
    const p = this.path
    this.path = this.next
    this.next = p
  }
}
