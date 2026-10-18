import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'

/**
 * ─── A hologram's light (#173) ───────────────────────────────────────────────
 *
 * The walkable lab's holograms — the Masters over their pedestals, a job's
 * sign, the chip lab's chip, the records' trophy, an offline station's lock —
 * drawn as light rather than as a flat tinted model: bright at the rim where
 * the surface turns away (a fresnel edge, so the figure's silhouette reads
 * even in one colour), thin scan lines running up through it, and a brighter
 * band sweeping slowly upward. Additive, so black is clear and overlapping
 * parts glow brighter.
 *
 * Works on a skinned rig (a Master) and on a plain mesh alike. `tint` and
 * `alpha` are its colour and strength; every hologram shares one clock
 * (`setHoloTime`).
 */

const TIME = { value: 0 }

/** Advance every hologram's scan lines (s). */
export const setHoloTime = (t: number): void => { TIME.value = t }

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN;
varying vec3 vView;
varying float vY;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vView = -mvPosition.xyz;
  vY = (modelMatrix * vec4(transformed, 1.0)).y;
}
`

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec3 vN;
varying vec3 vView;
varying float vY;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vView)));
  float rim = 0.16 + 1.15 * pow(f, 1.7);
  float scan = 0.72 + 0.28 * step(0.5, fract(vY * 16.0 - uTime * 1.4));
  float band = 1.0 + 0.7 * smoothstep(0.93, 1.0, fract(vY * 0.7 - uTime * 0.55));
  gl_FragColor = vec4(uColor * rim * scan * band * uAlpha, 1.0);
  #include <colorspace_fragment>
}
`

export class HoloMaterial extends ShaderMaterial {
  /** Its colour (linear, as every three.js Color). */
  readonly tint: Color

  constructor(hex: string, alpha = 1) {
    super({
      uniforms: { uColor: { value: new Color(hex) }, uAlpha: { value: alpha }, uTime: TIME },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false
    })
    this.tint = this.uniforms.uColor!.value as Color
  }

  /** How strongly it shines, 0..1+. */
  get alpha(): number { return this.uniforms.uAlpha!.value as number }
  set alpha(v: number) { this.uniforms.uAlpha!.value = v }
}
