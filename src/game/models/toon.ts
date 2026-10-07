import {
  Color, DataTexture, RedFormat, NearestFilter, MeshToonMaterial, MeshBasicMaterial,
  ShaderMaterial, BackSide, UniformsLib, UniformsUtils, type Material, type Texture
} from 'three'

/**
 * ─── The cel-shaded look ─────────────────────────────────────────────────────
 *
 * Every lit surface in the game is a `MeshToonMaterial` over ONE shared
 * four-step gradient ramp, and every character carries an inverted-hull
 * outline. Together they give the clean "3D sprite" read of the modern
 * blue-bomber games: flat bands of colour, a crisp dark rim, no noisy PBR.
 *
 * Colours are authored as sRGB hex and converted by three's colour management;
 * vertex colours are written in LINEAR space (`Color.setHex` does that), which
 * is why `lin()` exists.
 */

let ramp: DataTexture | null = null
/** The shared 4-band light ramp. Nearest-filtered so the bands stay hard. */
export const toonRamp = (): DataTexture => {
  if (ramp) return ramp
  const data = new Uint8Array([128, 190, 236, 255])
  ramp = new DataTexture(data, data.length, 1, RedFormat)
  ramp.minFilter = NearestFilter
  ramp.magFilter = NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  return ramp
}

/** Outline colour: deep navy rather than black — black outlines read as
 *  "comic", navy reads as "shaded edge" and survives the bright palettes. */
export const OUTLINE_COLOR = new Color('#141a33')

const toonCache = new Map<string, MeshToonMaterial>()

/** Shared (cached) toon material for a flat colour. Use for props/level. */
export const toon = (hex: string, opts: { emissive?: string; emissiveIntensity?: number } = {}): MeshToonMaterial => {
  const key = `${hex}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}`
  const hit = toonCache.get(key)
  if (hit) return hit
  const m = new MeshToonMaterial({ color: new Color(hex), gradientMap: toonRamp() })
  if (opts.emissive) {
    m.emissive = new Color(opts.emissive)
    m.emissiveIntensity = opts.emissiveIntensity ?? 1
  }
  toonCache.set(key, m)
  return m
}

let vcToon: MeshToonMaterial | null = null
/** Shared vertex-coloured toon material (static level geometry). */
export const toonVC = (): MeshToonMaterial => {
  if (vcToon) return vcToon
  vcToon = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
  return vcToon
}

const vcMapCache = new Map<Texture, MeshToonMaterial>()
/** Vertex-coloured toon material with a detail texture (floors, walls). */
export const toonVCMap = (map: Texture): MeshToonMaterial => {
  const hit = vcMapCache.get(map)
  if (hit) return hit
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map })
  vcMapCache.set(map, m)
  return m
}

/** A PER-CHARACTER toon material (vertex coloured). Not cached: each rig gets
 *  its own instance so its hit-flash (`emissive`) does not flash every other
 *  enemy of the same kind. Same defines → same GL program, so the cost is a
 *  uniform upload, not a shader compile. */
export const rigToon = (): MeshToonMaterial =>
  new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: new Color(0, 0, 0) })

/** Unlit vertex-coloured material for glowing parts (eyes, visors, cores). */
export const rigGlow = (): MeshBasicMaterial =>
  new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

let glowShared: MeshBasicMaterial | null = null
export const glowVC = (): MeshBasicMaterial => {
  if (glowShared) return glowShared
  glowShared = rigGlow()
  return glowShared
}

const basicCache = new Map<string, MeshBasicMaterial>()
export const glow = (hex: string): MeshBasicMaterial => {
  const hit = basicCache.get(hex)
  if (hit) return hit
  const m = new MeshBasicMaterial({ color: new Color(hex), toneMapped: false })
  basicCache.set(hex, m)
  return m
}

// ─── Inverted-hull outline ───────────────────────────────────────────────────
//
// A back-face-only copy of the mesh pushed out along its normals. Written as a
// ShaderMaterial with three's own skinning / morph / instancing / fog chunks so the
// same material outlines a skinned character, an instanced crate and a static
// prop alike — and so a rig's outline is ONE extra draw call bound to the same
// skeleton, never one per body part.

const OUTLINE_VERT = /* glsl */`
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
uniform float uThickness;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uThickness;
  #include <project_vertex>
  #include <fog_vertex>
}
`
const OUTLINE_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

const outlineCache = new Map<string, ShaderMaterial>()
/** Outline material of a given object-space thickness. Cached per thickness. */
export const outlineMat = (thickness = 0.03, color: Color = OUTLINE_COLOR): ShaderMaterial => {
  const key = `${thickness.toFixed(4)}|${color.getHexString()}`
  const hit = outlineCache.get(key)
  if (hit) return hit
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uThickness: { value: thickness },
        uColor: { value: color.clone() },
        uOpacity: { value: 1 }
      }
    ]),
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: BackSide,
    fog: true
  })
  outlineCache.set(key, m)
  return m
}

/** Scratch colour for vertex-colour writes (linear space). */
const tmp = new Color()
export const lin = (hex: string): Color => tmp.set(hex)

export const disposeMaterial = (m: Material | Material[]): void => {
  if (Array.isArray(m)) m.forEach(x => x.dispose())
  else m.dispose()
}
