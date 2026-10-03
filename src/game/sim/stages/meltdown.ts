import type { Checkpoint, Terrain } from '../../world/levelGen'
import { CELL } from '../../world/levelGen'
import type { ClimbHost } from '../climb'
import type { AtlasLine } from '../atlas'
import { cueFeature, type StageFeature } from '../stageFeatures'

/**
 * ─── Meltdown Descent: Atlas's tips ──────────────────────────────────────────
 *
 * One line per new danger, said once, the first time Flux stands where it
 * starts (`world/stages/blaze.ts`): the lava under the first catwalks, the
 * leap gap, the vent walkway, the ember barrels, the forge hammers. Pinned to the terrain, not to numbers — each at its section's
 * entry checkpoint (the leap at its take-off cell) — so the mirror and any
 * change to the layout carry them along.
 */

/** A section's first checkpoint: where Flux enters it. */
const entry = (t: Terrain, room: number): Checkpoint | undefined => t.checkpoints.find(c => c.room === room)

export const meltdownCues = (host: Pick<ClimbHost, 'say' | 'map'>, t: Terrain): StageFeature => {
  const cues: Array<{ line: AtlasLine; x: number; y: number; z: number; r?: number }> = []
  const at = (line: AtlasLine, room: number | undefined, r?: number) => {
    const c = room === undefined || room < 0 ? undefined : entry(t, room)
    if (c) cues.push({ line, x: c.x, y: c.y, z: c.z, r })
  }
  at('hint.blaze.lava', t.pitKind?.indexOf('lava'))
  const leap = t.links?.find(l => l.kind === 'leap')
  if (leap) {
    const [i, j] = leap.from
    cues.push({ line: 'hint.blaze.leap', x: (i + 0.5) * CELL, y: t.floor[j * host.map.w + i]!, z: (j + 0.5) * CELL, r: 4.5 })
  }
  at('hint.blaze.vents', t.vents?.find(v => v.kind === 'fire')?.room)
  at('hint.blaze.barrels', t.lanes[0]?.room)
  at('hint.blaze.hammers', t.crushers[0]?.room)
  return cueFeature(host, cues)
}
