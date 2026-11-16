import { ConeGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'

/**
 * ─── Frozen solid (#203) ─────────────────────────────────────────────────────
 *
 * A machine the Ice Lance hits is slowed (`frozenDt`); until now all it showed
 * for it was a faint blue tint. It now wears a shell of ice for as long as the
 * chill lasts: a pale translucent crystal round its body with a ring of white
 * spikes, popping in with a little overshoot and wobbling as it thaws. The
 * geometry and both materials are shared by every shell (one draw each).
 */

const BODY = new IcosahedronGeometry(1, 1)
const SPIKE = new ConeGeometry(0.15, 0.62, 5)
const SHELL = new MeshBasicMaterial({ color: '#8fe6ff', transparent: true, opacity: 0.34, depthWrite: false, side: DoubleSide })
const SPIKES = new MeshBasicMaterial({ color: '#e9fcff', transparent: true, opacity: 0.85, depthWrite: false })

/** Spikes round one shell, from near the feet to over the head. */
const SPIKE_AT: ReadonlyArray<readonly [number, number]> = [
  [0, 0.2], [60, 0.55], [120, 0.1], [180, 0.7], [240, 0.35], [300, 0.8], [30, 0.95], [210, 0.95]
]

const _up = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _d = new Vector3()

/** A shell for a body `height` tall with a hit radius `radius` (m), standing at its origin. */
export const buildIceShell = (height: number, radius: number): Group => {
  const g = new Group()
  g.name = 'iceShell'
  const rx = Math.max(0.45, radius * 1.25)
  const ry = Math.max(0.5, height * 0.55)
  const body = new Mesh(BODY, SHELL)
  body.position.y = ry * 0.95
  body.scale.set(rx, ry, rx)
  body.renderOrder = 5
  g.add(body)
  for (const [deg, up] of SPIKE_AT) {
    const a = (deg * Math.PI) / 180
    // A point on the body's surface at height fraction `up`, the spike leaning out along the normal.
    const y = (up * 2 - 1) * 0.85
    const r = Math.sqrt(1 - y * y)
    _d.set(Math.cos(a) * r, y, Math.sin(a) * r)
    const s = new Mesh(SPIKE, SPIKES)
    s.position.set(_d.x * rx, body.position.y + _d.y * ry, _d.z * rx)
    s.quaternion.copy(_q.setFromUnitVectors(_up, _d.clone().normalize()))
    s.scale.setScalar(0.8 + ((deg * 7) % 5) * 0.1)
    s.renderOrder = 6
    g.add(s)
  }
  g.visible = false
  return g
}

/** Pop-in scale for progress k (0..1): quick, with a small overshoot. */
export const iceGrow = (k: number): number => {
  if (k <= 0) return 0
  if (k >= 1) return 1
  const c = 1.9
  const x = k - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

/**
 * One frame of a shell: grown to `k`, wobbling harder as `left` (s of chill
 * remaining) runs out — a last-moment shiver before it cracks.
 */
export const tickIceShell = (g: Group, k: number, left: number, time: number): void => {
  const s = iceGrow(k)
  const shiver = left < 0.7 ? Math.sin(time * 70) * 0.04 * (1 - left / 0.7) : 0
  g.scale.setScalar(Math.max(0.001, s * (1 + shiver)))
  g.visible = s > 0.01
}
