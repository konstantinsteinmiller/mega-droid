import { Group, Mesh, type BufferGeometry } from 'three'
import { cap, merge, paint, paintBy, rbox, rcyl, sph, torus, xform } from './kit'
import { toonVC, glowVC, outlineMat } from './toon'

/**
 * ─── A room's gantry crane (#114) ────────────────────────────────────────────
 *
 * The Scrapyard's "old crane sorting scrap", over a room: two rails on the
 * tops of its long walls (end stops at each end), a box-girder bridge with
 * cross bracing and striped end trucks rolling on them, a trolley with its
 * cable drum, the cable, and a magnet hook block with an amber beacon. The
 * Polarity Works' casting shuttle is the same crane carrying a claw casting.
 *
 * Local frame: the rails run along x (±len/2) at z = ±span/2, their tops at
 * y = 0; `at(u, v)` puts the hook over (u, v) of that frame; `setDrop(d)`
 * hangs it d metres under the trolley. The hook's own point (what it holds
 * hangs from) is `hookTip` (its world position follows `at`/`setDrop`).
 */

export interface GantryCrane {
  root: Group
  /** The hook block's underside: whatever it carries hangs from here. */
  hookTip: Group
  at(u: number, v: number): void
  setDrop(d: number): void
  /** The hook's u, v now. */
  readonly u: number
  readonly v: number
}

/** The hook block's height under its trolley at rest (m). */
export const HOOK_DROP = 1.3

const YELLOW = '#e0a21a'
const DARK = '#2a2d36'
const STEEL = '#8c96a8'
const IRON = '#3a3f4a'

const toonMesh = (geos: BufferGeometry[]): Mesh => {
  const g = merge(geos)
  const m = new Mesh(g, toonVC())
  const o = new Mesh(g, outlineMat(0.03))
  o.renderOrder = -1
  m.add(o)
  return m
}

const stripes = (g: BufferGeometry, along: 'x' | 'z'): BufferGeometry =>
  paintBy(g, (x, _y, z) => (Math.floor(((along === 'x' ? x : z) + 10) / 0.22) % 2 ? DARK : YELLOW))

export const buildGantryCrane = (len: number, span: number, carry: 'crate' | 'claw' | 'none' = 'none'): GantryCrane => {
  const root = new Group()
  // ── Rails: a girder each side, a running rail on top, end stops ──
  const rails: BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const z = s * span / 2
    rails.push(xform(paint(rbox(len, 0.32, 0.42, 0.12, 24, 6), IRON), [0, -0.2, z]))
    rails.push(xform(paint(rbox(len - 0.1, 0.08, 0.12, 0.3, 24, 2), STEEL), [0, 0.0, z]))
    for (const e of [-1, 1]) rails.push(xform(stripes(rbox(0.3, 0.42, 0.5, 0.2, 8, 6), 'x'), [e * (len / 2 - 0.15), 0.02, z]))
  }
  root.add(toonMesh(rails))

  // ── Bridge: the box girder across, bracing, walkway rail, end trucks ──
  const bridge = new Group()
  const bg: BufferGeometry[] = [
    xform(paint(rbox(0.56, 0.6, span - 0.5, 0.15, 8, 6), YELLOW), [0, 0.55, 0]),
    xform(paint(rbox(0.6, 0.06, span - 0.6, 0.3, 8, 2), DARK), [0, 0.87, 0])
  ]
  // Cross bracing down both sides of the girder: a zigzag of thin bars.
  const n = Math.max(2, Math.round((span - 1.2) / 0.9))
  for (let q = 0; q < n; q++) {
    const z0 = -span / 2 + 0.6 + q * (span - 1.2) / n
    const z1 = z0 + (span - 1.2) / n
    for (const s of [-1, 1]) bg.push(xform(paint(cap(0.03, Math.hypot(z1 - z0, 0.45) - 0.06, 4, 2), IRON), [s * 0.3, 0.55, (z0 + z1) / 2], [q % 2 ? 0.95 : -0.95, 0, 0]))
  }
  // Walkway handrail on its top.
  for (const s of [-1, 1]) bg.push(xform(paint(cap(0.025, span - 1.2, 4, 2), STEEL), [s * 0.26, 1.2, 0], [Math.PI / 2, 0, 0]))
  for (let q = 0; q <= 4; q++) bg.push(xform(paint(cap(0.022, 0.3, 4, 2), STEEL), [0.26, 1.04, -span / 2 + 0.6 + q * (span - 1.2) / 4]))
  // End trucks, striped, on wheels on the rails.
  for (const s of [-1, 1]) {
    const z = s * (span / 2)
    bg.push(xform(stripes(rbox(1.2, 0.42, 0.66, 0.18, 12, 6), 'x'), [0, 0.35, z]))
    for (const e of [-1, 1]) bg.push(xform(paint(rcyl(0.14, 0.12, 0.03, 12, 2), DARK), [e * 0.4, 0.12, z], [Math.PI / 2, 0, 0]))
  }
  bridge.add(toonMesh(bg))
  // An amber beacon on the girder (glow).
  bridge.add(new Mesh(merge([xform(paint(sph(0.09, 10, 8), '#ffb12a'), [0.12, 1.0, 0.4])]), glowVC()))
  root.add(bridge)

  // ── Trolley: a box on four wheels with its cable drum ──
  const trolley = new Group()
  trolley.add(toonMesh([
    xform(paint(rbox(1.0, 0.46, 0.9, 0.16, 10, 6), '#3a4458'), [0, 1.12, 0]),
    xform(paint(rcyl(0.22, 0.7, 0.04, 14, 2), STEEL), [0, 1.42, 0], [0, 0, Math.PI / 2]),
    ...[-1, 1].flatMap(a => [-1, 1].map(b => xform(paint(rcyl(0.1, 0.08, 0.02, 10, 2), DARK), [a * 0.36, 0.92, b * 0.38], [Math.PI / 2, 0, 0])))
  ]))
  bridge.add(trolley)

  // ── Cable and hook block (a magnet with a striped rim) ──
  const cable = new Mesh(merge([paint(rcyl(0.035, 1, 0.01, 6), '#202430')]), toonVC())
  trolley.add(cable)
  const hook = new Group()
  const hookGeos: BufferGeometry[] = [
    xform(paint(rbox(0.36, 0.3, 0.36, 0.3, 8, 6), IRON), [0, 0.15, 0]),
    xform(paint(rcyl(0.6, 0.3, 0.08, 20, 2), '#c43a2a'), [0, -0.12, 0]),
    xform(stripes(rcyl(0.62, 0.08, 0.02, 20, 2), 'x'), [0, -0.02, 0]),
    xform(paint(rcyl(0.48, 0.06, 0.02, 20, 2), '#d8dde6'), [0, -0.3, 0])
  ]
  if (carry === 'claw') {
    // The Polarity Works' casting: a claw of three curved prongs.
    for (let q = 0; q < 3; q++) {
      const a = q * Math.PI * 2 / 3
      hookGeos.push(xform(paint(torus(0.55, 0.09, 8, 14, Math.PI * 0.75), '#3f7bff'), [Math.sin(a) * 0.15, -0.9, Math.cos(a) * 0.15], [0, a + Math.PI / 2, Math.PI * 0.6]))
    }
    hookGeos.push(xform(paint(rcyl(0.3, 0.3, 0.06, 14, 2), '#2f5bcf'), [0, -0.45, 0]))
  }
  hook.add(toonMesh(hookGeos))
  const hookTip = new Group()
  hookTip.position.y = -0.34
  hook.add(hookTip)
  trolley.add(hook)

  let u = 0
  let v = 0
  const crane: GantryCrane = {
    root,
    hookTip,
    at(nu: number, nv: number) {
      u = Math.max(-len / 2 + 0.8, Math.min(len / 2 - 0.8, nu))
      v = Math.max(-span / 2 + 0.9, Math.min(span / 2 - 0.9, nv))
      bridge.position.x = u
      trolley.position.z = v
    },
    setDrop(d: number) {
      hook.position.y = 0.9 - d
      cable.scale.set(1, Math.max(0.05, d), 1)
      cable.position.y = 0.9 - d / 2
    },
    get u() { return u },
    get v() { return v }
  }
  crane.setDrop(HOOK_DROP)
  return crane
}
