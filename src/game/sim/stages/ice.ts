import { CELL, Cell, cellCenter, type Terrain } from '../../world/levelGen'
import type { ParticleSpec } from '../../fx/particles'
import type { ClimbBody, ClimbHost } from '../climb'
import { AtlasCue, type MoveMod, type StageFeature } from '../stageFeatures'

/**
 * ─── Ice (Glacier Run) ───────────────────────────────────────────────────────
 *
 * On an ice cell (`Terrain.ice`) the walk's blend toward the stick is a small
 * share of the ground's (ICE_FRICTION): let go and Flux keeps sliding, turn
 * and he drifts through a wide arc; the walking speed is the same (the blend
 * only slows how fast the velocity gets there). Nothing else changes: a slide
 * still sets its speed at once, ladders and lifts are not ice, and in the air
 * the air control applies instead. Past an ice edge a spike pit waits, so
 * Atlas has a word the first time Flux nears ice, ice over spikes, and ice
 * stairs.
 *
 * A faint spray of frost comes off his feet while he skates.
 */

/** The ground's walk blend on ice, as a share of a plain floor's. From the
 *  walking speed, a let-go stick glides about 2.5 m before it stops. */
export const ICE_FRICTION = 0.12
/** Skating this fast (m/s) throws up frost, a puff every SKATE_STEP m. */
const SKATE_V = 2.5
const SKATE_STEP = 0.9

export class IceFeature implements StageFeature {
  private readonly host: ClimbHost
  private readonly ice: Uint8Array
  private readonly W: number
  private readonly cues: AtlasCue[] = []
  private skate = 0
  private puff: ParticleSpec = { x: 0, y: 0, z: 0, vx: 0, vy: 0.6, vz: 0, color: '#e8f8ff', size: 0.35, sizeEnd: 0.8, life: 0.4, drag: 2 }

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    this.ice = t.ice!
    this.W = host.map.w
    // Atlas's cues: the first ice, the first ice over spikes (in the order of
    // the rooms, then of the cells).
    const map = host.map
    const W = this.W
    let first = -1
    let spiky = -1
    const bestRoom = [Infinity, Infinity]
    for (let k = 0; k < this.ice.length; k++) {
      if (!this.ice[k] || map.cell[k] === Cell.Void || t.pit[k]) continue
      const r = map.room[k]!
      const i = k % W
      const j = (k - i) / W
      if (r < bestRoom[0]!) { bestRoom[0] = r; first = k }
      if (r < bestRoom[1]!) {
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= W || nj >= map.h) continue
          const nk = nj * W + ni
          const nr = map.room[nk]!
          if (t.pit[nk] && nr >= 0 && t.pitKind?.[nr] === 'spikes') { bestRoom[1] = r; spiky = k; break }
        }
      }
    }
    const cue = (line: 'hint.cryo.ice' | 'hint.cryo.spikes', k: number) => {
      if (k < 0) return
      const i = k % W
      const j = (k - i) / W
      this.cues.push(new AtlasCue(host, line, cellCenter(i), cellCenter(j), t.floor[k]! + t.rise[k]!, 6.5, 2))
    }
    cue('hint.cryo.ice', first)
    cue('hint.cryo.spikes', spiky)
  }

  /** Standing on an ice cell's own floor (not a lift, not a ladder). */
  onIce(p: ClimbBody): boolean {
    if (!p.ground || p.plat >= 0 || p.ladder >= 0) return false
    const i = Math.floor(p.x / CELL)
    const j = Math.floor(p.z / CELL)
    if (i < 0 || j < 0 || i >= this.W || j >= this.host.map.h) return false
    return this.ice[j * this.W + i] === 1
  }

  move(p: ClimbBody, out: MoveMod): void {
    if (this.onIce(p)) out.friction *= ICE_FRICTION
  }

  update(dt: number, _time: number, p: ClimbBody, playing: boolean): void {
    for (const c of this.cues) c.update(p, playing)
    const v = Math.hypot(p.vx, p.vz)
    if (!playing || v < SKATE_V || !this.onIce(p)) { this.skate = 0; return }
    this.skate += v * dt
    if (this.skate < SKATE_STEP) return
    this.skate = 0
    const s = this.puff
    s.x = p.x - p.vx * 0.04
    s.y = p.y + 0.1
    s.z = p.z - p.vz * 0.04
    s.vx = -p.vx * 0.15
    s.vz = -p.vz * 0.15
    this.host.fx.emit(s)
  }

  save(): unknown {
    return this.cues.map(c => (c.said ? 1 : 0))
  }

  restore(s: unknown): void {
    if (!Array.isArray(s)) return
    this.cues.forEach((c, i) => { c.said = s[i] === 1 })
  }
}
