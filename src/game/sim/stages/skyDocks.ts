import { CELL, cellCenter, type Terrain } from '../../world/levelGen'
import type { ClimbHost } from '../climb'
import type { AtlasLine } from '../atlas'
import { cueFeature, type StageFeature } from '../stageFeatures'

/**
 * ─── Atlas on the Sky Docks ──────────────────────────────────────────────────
 *
 * Atlas's helper lines for the gale stage (`world/stages/gale.ts`), each said
 * once, the first time Flux comes near the thing it is about. The spots are
 * read off the terrain, so a mirrored layout needs nothing of its own:
 *
 *   hint.gale.leap     the first dash-leap gap
 *   hint.gale.wind     the wind tunnel's mouth
 */
export const skyDocksCues = (host: ClimbHost, t: Terrain): StageFeature => {
  const map = host.map
  const floorOf = (i: number, j: number) => t.floor[j * map.w + i]!
  const cues: Array<{ line: AtlasLine; x: number; y: number; z: number; r?: number }> = []
  const leap = t.links?.find(l => l.kind === 'leap')
  if (leap) {
    const [fi, fj] = leap.from
    cues.push({ line: 'hint.gale.leap', x: cellCenter(fi), z: cellCenter(fj), y: floorOf(fi, fj), r: 4.5 })
  }
  const zone = t.wind?.[0]
  if (zone) {
    // The downwind end: where Flux walks in, facing the gusts.
    const cx = (zone.i0 + zone.i1 + 1) / 2 * CELL
    const cz = (zone.j0 + zone.j1 + 1) / 2 * CELL
    const x = cx + zone.dx * (zone.i1 - zone.i0 + 1) / 2 * CELL
    const z = cz + zone.dz * (zone.j1 - zone.j0 + 1) / 2 * CELL
    cues.push({ line: 'hint.gale.wind', x, z, y: floorOf(zone.i0, zone.j0), r: 4.5 })
  }
  return cueFeature(host, cues)
}
