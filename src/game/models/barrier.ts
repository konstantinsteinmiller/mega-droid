import {
  BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial, AdditiveBlending, DoubleSide, Color, Group,
  Matrix4, Vector3, Quaternion, Euler, type Object3D
} from 'three'
import { PAL } from './palette'

/**
 * ─── The barrier: Flux's block shield, first person ──────────────────────────
 *
 * A shallow energy dome held up in front of the left half of the view while
 * the guard is held. One mesh, one ShaderMaterial, additive and translucent:
 * a honeycomb of hex cells with a bright rim, a slow energy wave scrolling
 * up through it and a few cells shimmering, so it reads as "force field" and
 * never as a wall — the centre stays mostly see-through.
 *
 * Everything that happens to it is a uniform:
 *  - raise   → snaps up with an overshoot while the cells grow out from the
 *              centre behind a bright leading edge;
 *  - lower   → collapses to a horizontal sliver and fades;
 *  - Power   → full is cyan, low goes orange, flickers and loses cells, so
 *              the player sees the guard is about to give;
 *  - block   → a ripple runs out from the centre + a brief brightening;
 *  - parry   → gold/white flash and a ring that bursts out past the rim;
 *  - break   → white-hot cracks, then the cells shatter away as it bursts.
 *
 * Placement: the barrier lives under the viewmodel root (which mission.ts
 * bobs, recoils and scales per orientation), but positions itself in CAMERA
 * space every frame — the viewmodel camera sits at the origin looking down
 * −Z — so it stays centre-left in the view whatever the arm is doing. The
 * arm's world scale tells portrait (0.62) from landscape (0.82).
 *
 * A scene that shows Flux from outside (the intro's showcase) builds it
 * FREE: `buildBarrier({ free: radius })` leaves the root where its owner
 * puts it (the dome bulges toward the root's −Z) and only sizes it, so the
 * cutscene's shield is this one, cells, ripple, parry ring and all.
 *
 * Precompile: the mesh is `visible` from birth (at zero intensity) so
 * `renderer.compile()` and the loading render see it; `update()` only hides
 * it once it has been drawn at least once and is fully down.
 */

export interface BarrierFx {
  /** Add to the viewmodel root; the barrier positions/orients itself inside it. */
  root: Object3D
  /** Every rendered frame. up = guard held; power01 = remaining Power 0..1; dt/t in seconds. */
  update(dt: number, up: boolean, power01: number, t: number): void
  /** Feedback for a blocked hit, a parry (perfect block) and the guard breaking. */
  impact(kind: 'block' | 'parry' | 'break'): void
}

// Shared by both stages: hex distance and the rounded-hexagon silhouette
// metric (1.0 on the rim; flat top and bottom, a touch wider than tall).
const SHAPE = /* glsl */`
float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
float shapeM(vec2 p) { return mix(length(p), hexDist(p.yx), 0.6); }
`

const VERT = /* glsl */`
uniform float uDepth;
varying vec2 vP;
${SHAPE}
void main() {
  vP = position.xy;
  float m = min(shapeM(position.xy), 1.0);
  vec3 p = position;
  // A shallow dome, convex away from the camera (toward the enemies).
  p.z = -uDepth * (1.0 - m * m);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FRAG = /* glsl */`
uniform float uTime;
uniform float uAlpha;
uniform float uGrow;
uniform float uPower;
uniform float uRipple;
uniform float uHit;
uniform float uParry;
uniform float uBreak;
uniform vec3 uCol;
uniform vec3 uLow;
uniform vec3 uGold;
uniform vec3 uHot;
varying vec2 vP;
${SHAPE}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Nearest hex centre: xy = offset from it, zw = integer cell id.
vec4 hexCell(vec2 uv) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(uv, s) - 0.5 * s;
  vec2 b = mod(uv - 0.5 * s, s) - 0.5 * s;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  // Centres sit on a (0.5, 0.866) lattice: round to integers, or the hash
  // turns float noise in (uv - g) into per-pixel speckle.
  return vec4(g, floor((uv - g) * vec2(2.0, 1.1547005) + 0.5));
}

void main() {
  float m = shapeM(vP);
  // Beyond the rim only the parry ring ever draws.
  if (m > 1.03 && uParry <= 0.001) discard;

  // Cells shrink toward the rim, as if wrapped on the dome.
  vec2 q = vP * (1.0 + 0.3 * m * m);
  vec4 h = hexCell(q * 4.6 + vec2(0.0, 0.29));
  float e = 0.5 - hexDist(h.xy);            // 0 on a cell edge, .5 at its centre
  float cid = hash(h.zw);
  float aa = fwidth(e);
  float line = 1.0 - smoothstep(0.022 - aa, 0.022 + aa, e);

  float inside = 1.0 - smoothstep(0.985, 0.985 + 1.5 * fwidth(m), m);
  float fres = m * m * m;
  float wave = 0.5 + 0.5 * sin(vP.y * 4.5 - uTime * 3.0 + cid * 0.5);
  wave = wave * wave * wave;
  float shimmer = pow(0.5 + 0.5 * sin(uTime * 2.1 + cid * 37.0), 12.0);

  // Power: cells die off as it drains; the survivors keep the pattern readable.
  float alive = smoothstep(0.0, 0.06, uPower * 1.6 + 0.3 - cid);
  // Break: the cells shatter away in a random order.
  float brk = uBreak;
  alive *= 1.0 - step(cid, (1.0 - brk) * 1.2) * step(0.001, brk);
  // Raise: cells grow out from the centre behind a bright leading edge.
  float grown = 1.0 - smoothstep(uGrow - 0.12, uGrow, m);
  float front = exp(-pow((m - uGrow) * 14.0, 2.0)) * (1.0 - step(1.1, uGrow));

  // Kept thin in the middle: additive over a bright level adds up fast.
  float fill = (0.012 + 0.13 * fres + 0.1 * wave * fres) * alive;
  float lines = line * (0.1 + 0.45 * fres + 0.24 * wave) * mix(0.3, 1.0, alive);
  float cells = shimmer * 0.16 * alive * (1.0 - line);
  float rimLine = exp(-pow((m - 0.972) * 42.0, 2.0));
  float rimGlow = smoothstep(0.78, 0.975, m) * inside * 0.3;
  // A glossy crescent along the upper-left inner rim sells the dome.
  float gloss = smoothstep(0.62, 0.9, m) * inside * smoothstep(0.35, 0.95, dot(vP / max(m, 0.001), vec2(-0.55, 0.835)));
  float I = ((fill + lines + cells) * inside + rimLine * 1.15 + rimGlow + gloss * 0.35) * grown + front * 1.1;

  // Block: a ripple runs out from the centre + a brief brightening.
  float rip = exp(-pow((m - uRipple * 1.05) * 9.0, 2.0)) * (1.0 - uRipple) * step(0.001, uRipple);
  I += rip * inside * (0.5 + 1.5 * line);
  I += uHit * inside * (0.1 + 0.6 * line + 0.3 * fres);

  // Break: white-hot cracks radiating from the centre (wobbly spokes + one
  // ring), strongest at the start, while the cells shatter away.
  float crack = 0.0;
  if (brk > 0.001) {
    float ang = atan(vP.y, vP.x);
    float wob = ang + 0.16 * sin(m * 19.0 + ang * 3.0) + 0.05 * sin(m * 47.0);
    float f = fract(wob * 1.1140846 + 0.13);    // 7 spokes
    float spoke = min(f, 1.0 - f) * 0.8975979 * m;
    float ringC = abs(m - 0.56 - 0.035 * sin(ang * 5.0 + 1.3));
    float cs = 1.0 - smoothstep(0.0, 0.01 + 1.5 * fwidth(spoke), spoke);
    // The ring crack only runs part of the way round
    float cr = (1.0 - smoothstep(0.0, 0.01 + 1.5 * fwidth(ringC), ringC)) * smoothstep(0.1, 0.3, sin(ang * 2.0 + 0.6));
    crack = max(max(cs, cr), 1.0 - smoothstep(0.02, 0.07, m));
    I += crack * inside * brk * 2.6;
  }

  // Parry: a hex ring bursting out past the rim.
  float pr = exp(-pow((m - (1.0 + (1.0 - uParry) * 0.3)) * 30.0, 2.0)) * uParry;
  I += pr * 2.4 + uParry * inside * (0.18 + 0.7 * line + 0.4 * fres);

  float warm = 1.0 - smoothstep(0.16, 0.55, uPower);
  vec3 col = mix(uCol, uLow, warm);
  col = mix(col, uLow, brk * 0.6);
  // Less white in the rim as it warms, or low Power reads pink, not orange
  float sheen = (rimLine * 0.4 + gloss * 0.5) * (1.0 - 0.8 * warm);
  col = mix(col, uHot, clamp(sheen + front * 0.6 + uHit * 0.5 + rip * 0.4 + crack * brk, 0.0, 1.0));
  col = mix(col, uGold, clamp(uParry * 1.6, 0.0, 1.0));
  // Encode the COLOUR, then scale: intensity stays linear on screen (the
  // sRGB curve would otherwise lift a faint fill into a milky veil).
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= I * uAlpha;
}
`

/** A flat polar grid (unit disc + a margin ring for the parry burst). */
const discGeometry = (): BufferGeometry => {
  const radii = [0, 0.16, 0.32, 0.47, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.06, 1.16, 1.3, 1.45]
  const segs = 48
  const pos: number[] = []
  const idx: number[] = []
  for (const r of radii) {
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0)
    }
  }
  const w = segs + 1
  for (let k = 0; k < radii.length - 1; k++) {
    for (let s = 0; s < segs; s++) {
      const a = k * w + s
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/** Camera-space layout per orientation: centre (x, y, z) and radius. */
const LAYOUT = {
  landscape: { x: -0.14, y: -0.06, z: -0.8, r: 0.155 },
  portrait: { x: -0.035, y: -0.085, z: -0.8, r: 0.108 }
}
const RAISE_TIME = 0.22
const LOWER_TIME = 0.2
const BREAK_TIME = 0.6
const RIPPLE_TIME = 0.42
const PARRY_TIME = 0.5
/** A parry's thrust: out at the shot over THRUST_OUT (s), back over
 *  THRUST_BACK; how far out, as a share of the shield's distance from the
 *  eye (the viewmodel), or of its radius (a free shield, the holograms'). */
const THRUST_OUT = 0.07
const THRUST_BACK = 0.3
const THRUST_VIEW = 0.3
const THRUST_FREE = 0.5
/** The thrust's reach (0..1) `t` seconds into it. */
const thrustAt = (t: number): number => {
  if (t < THRUST_OUT) return t / THRUST_OUT
  const k = 1 - (t - THRUST_OUT) / THRUST_BACK
  return k > 0 ? k * k : 0
}

const _m = new Matrix4()
const _inv = new Matrix4()
const _p = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _tilt = new Quaternion().setFromEuler(new Euler(0.06, 0.16, -0.05))
const _origin = new Vector3()
const _up = new Vector3(0, 1, 0)

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Ease-out with an overshoot (~12 %) — the "snap up". */
const backOut = (x: number): number => {
  const c1 = 2.2
  const c3 = c1 + 1
  const k = x - 1
  return 1 + c3 * k * k * k + c1 * k * k
}

export const buildBarrier = (opts: { free?: number } = {}): BarrierFx => {
  const mat = new ShaderMaterial({
    uniforms: {
      uDepth: { value: 0.42 },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uGrow: { value: 1.2 },
      uPower: { value: 1 },
      uRipple: { value: 0 },
      uHit: { value: 0 },
      uParry: { value: 0 },
      uBreak: { value: 0 },
      uCol: { value: new Color(PAL.glowCyan) },
      uLow: { value: new Color(PAL.glowOrange) },
      uGold: { value: new Color(PAL.glowYellow) },
      uHot: { value: new Color(PAL.white) }
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false
  })
  // One draw even though it is double-sided.
  mat.forceSinglePass = true
  const u = mat.uniforms as Record<string, { value: number }>

  const mesh = new Mesh(discGeometry(), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  // Only allowed to hide once a real render has compiled + uploaded it.
  let drawn = false
  mesh.onAfterRender = () => { drawn = true }
  const root = new Group()
  root.name = 'barrier'
  root.add(mesh)

  let raised = false
  let raiseT = 0
  let vis = 0 // 0..1 how "up" it is (drives fade + collapse)
  let breakT = -1 // ≥ 0 while the break plays
  let ripple = 0 // 0 = idle, else 0..1 progress
  let hit = 0
  let parry = 0
  let kick = 0
  /** Seconds into a parry's thrust (the shield punched out at the shot);
   *  THRUST_OUT + THRUST_BACK or more: none. */
  let thrustT = 9
  let flick = 1
  let flickT = 0

  const place = (sx: number, sy: number, lift: number, t: number) => {
    if (opts.free) {
      // Its owner's place and facing; only its size (and the raise's little rise) are its own.
      const r = opts.free
      mesh.scale.set(r * Math.max(0.02, sx), r * Math.max(0.02, sy), r)
      mesh.position.set(0, lift * r, (kick * 0.06 - thrustAt(thrustT) * THRUST_FREE) * r)
      return
    }
    const parent = root.parent
    let portrait = false
    if (parent) {
      parent.updateWorldMatrix(true, false)
      portrait = parent.matrixWorld.getMaxScaleOnAxis() < 0.72
    }
    const L = portrait ? LAYOUT.portrait : LAYOUT.landscape
    _p.set(L.x + Math.sin(t * 1.3) * 0.003, L.y + Math.sin(t * 1.9) * 0.003 + lift * L.r, L.z)
    // +Z faces the camera (at the origin); then the "held at an angle" tilt.
    _m.lookAt(_origin, _p, _up)
    _q.setFromRotationMatrix(_m).multiply(_tilt)
    // A hit shoves it toward the player for a moment; a parry punches it out
    // at the shot and back (the shield is what sends the shot home).
    _p.multiplyScalar(1 - kick * 0.035 + thrustAt(thrustT) * THRUST_VIEW)
    // Never a zero scale: decompose() of a singular matrix yields NaNs
    _s.set(L.r * Math.max(0.02, sx), L.r * Math.max(0.02, sy), L.r)
    _m.compose(_p, _q, _s)
    if (parent) _m.premultiply(_inv.copy(parent.matrixWorld).invert())
    _m.decompose(root.position, root.quaternion, root.scale)
  }

  const update = (dt: number, up: boolean, power01: number, t: number): void => {
    const breaking = breakT >= 0
    // A parry's thrust plays out whole, even as the shield is let go.
    thrustT += dt
    if (thrustT < THRUST_OUT + THRUST_BACK) up = true
    if (up && !breaking) {
      if (!raised) {
        raised = true
        // A quick re-raise picks up where the collapse left off.
        raiseT = vis * RAISE_TIME * 0.6
      }
      raiseT += dt
      vis = Math.min(1, vis + dt / 0.07)
    } else {
      raised = false
      vis = Math.max(0, vis - dt / LOWER_TIME)
    }
    if (breaking) {
      breakT += dt
      if (breakT >= BREAK_TIME) {
        breakT = -1
        vis = 0
      }
    }
    if (ripple > 0) ripple = ripple + dt / RIPPLE_TIME >= 1 ? 0 : ripple + dt / RIPPLE_TIME
    hit = Math.max(0, hit - dt * 5)
    parry = Math.max(0, parry - dt / PARRY_TIME)
    kick *= Math.exp(-dt * 12)

    const active = vis > 0.001 || breakT >= 0
    if (!active) {
      u.uAlpha!.value = 0
      if (drawn) mesh.visible = false
      return
    }
    mesh.visible = true

    const p = clamp01(power01)
    // Low Power: an uneven flicker, faster and deeper the closer to empty.
    flickT -= dt
    if (flickT <= 0) {
      flickT = 0.03 + Math.random() * 0.06
      const depth = clamp01((0.32 - p) / 0.3)
      flick = 1 - depth * (0.2 + Math.random() * 0.5)
    }

    let sx = 1
    let sy = 1
    let lift = 0
    let alpha: number
    if (breakT >= 0) {
      // Crack flash, then it bursts wide and slumps as the cells fall away
      const k = breakT / BREAK_TIME
      const burst = 1 - (1 - k) * (1 - k)
      const slump = Math.max(0, (k - 0.2) / 0.8)
      sx = 1 + 0.18 * burst
      sy = 1 + 0.12 * burst - 0.45 * slump * slump
      lift = -0.3 * slump * slump
      alpha = k < 0.15 ? 1.2 : Math.pow(1 - (k - 0.15) / 0.85, 1.5)
      u.uBreak!.value = 1 - k
      u.uGrow!.value = 1.2
    } else {
      u.uBreak!.value = 0
      if (raised) {
        const k = clamp01(raiseT / RAISE_TIME)
        const s = backOut(k)
        sx = s
        sy = s
        lift = -(1 - clamp01(raiseT / 0.12)) * 0.35
        u.uGrow!.value = Math.min(1.2, (raiseT / 0.15) * 1.2)
        alpha = vis
      } else {
        // Collapse to a horizontal sliver while it fades.
        const c = 1 - vis
        sx = 1 + 0.08 * c
        sy = Math.max(0.05, 1 - 0.9 * c * c)
        lift = -0.12 * c
        alpha = vis * vis
      }
      alpha *= flick
    }
    place(sx, sy, lift, t)
    u.uAlpha!.value = alpha
    u.uTime!.value = t
    u.uPower!.value = p
    u.uRipple!.value = ripple
    u.uHit!.value = hit
    u.uParry!.value = parry
  }

  const impact = (kind: 'block' | 'parry' | 'break'): void => {
    if (kind === 'break') {
      breakT = 0
      raised = false
      hit = 1
      kick = 1.4
      ripple = 0
      parry = 0
      return
    }
    ripple = 0.001
    hit = 1
    // A parry thrusts out instead of giving way.
    kick = kind === 'parry' ? 0 : 1
    if (kind === 'parry') {
      parry = 1
      thrustT = 0
    }
  }

  return { root, update, impact }
}
