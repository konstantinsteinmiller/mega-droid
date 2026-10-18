import { Group, type Mesh } from 'three'
import { HoloMaterial } from '../fx/holoMaterial'
import { buildBossRig, type BossId } from './bosses'
import { buildDiorama, type Diorama } from './diorama'
import type { Rig } from './kit'

/**
 * ─── The hall's holograms (#173) ─────────────────────────────────────────────
 *
 * The Masters over their pedestals and the valley over the briefing table:
 * their models live with the missions and the films, so the hub fetches this
 * module once its hall is up (`lazy.ts`) and they flicker on — the hall
 * itself never waits for them.
 */

export interface MasterHolo {
  root: Group
  rig: Rig
  mat: HoloMaterial
  /** Its height once scaled (m). */
  height: number
}

/** A Master as a hologram: its own model, every part in light of `tint`. */
export const buildMasterHolo = (id: BossId, tint: string, height: number): MasterHolo => {
  const mat = new HoloMaterial(tint, 0.85)
  const rig = buildBossRig(id)
  rig.root.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) m.material = mat
  })
  if (rig.outline) rig.outline.visible = false
  const root = new Group()
  const k = height / Math.max(0.5, rig.height)
  rig.root.scale.setScalar(k)
  root.add(rig.root)
  return { root, rig, mat, height }
}

/** The valley as the briefing table's hologram (the intro's Pip hologram). */
export const buildValleyHolo = (low: boolean): Diorama => buildDiorama({ holo: true, low })
