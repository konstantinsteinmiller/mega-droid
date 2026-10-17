// @vitest-environment jsdom
// #167: a copied weapon's shot flies as its own part (a drill bit, a horseshoe
// magnet, a crystal…), for Flux's copy and for the Master's own attack, not a
// round coloured orb. Fire and lightning keep their effects.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { SHOT_STYLES, buildShotProp, poseShotProp, shotPropParts, isShotStyle } from '@/game/fx/weaponShots'
import { WEAPON_IDS } from '@/game/data/weapons'
import { coplanarOverlaps } from './coplanar'

describe('themed weapon shots', () => {
  it('every copied weapon but fire and lightning has a body of its own', () => {
    const without = WEAPON_IDS.filter(id => !isShotStyle(id)).sort()
    expect(without).toEqual(['flameWave', 'thunderArc'])
    expect([...SHOT_STYLES].sort()).toEqual(WEAPON_IDS.filter(isShotStyle).sort())
  })

  for (const id of SHOT_STYLES) {
    it(`${id}: builds, and no two of its flat faces share a plane`, () => {
      const p = buildShotProp(id)
      expect(p.root.visible).toBe(false)
      expect(p.size).toBeGreaterThan(0)
      const { toon, glow, ghost } = shotPropParts(id)
      expect(toon.length + glow.length + ghost.length).toBeGreaterThan(0)
      expect(coplanarOverlaps([...toon, ...glow, ...ghost])).toBe(0)
    })
  }

  it('a straight flyer turns its nose onto its flight; a tumbling one stays put', () => {
    const drill = buildShotProp('drillBomb')
    poseShotProp(drill, 1, 2, 3, 4, 0, 0, 1, 0.5)
    const nose = new Vector3(0, 0, 1).applyQuaternion(drill.root.quaternion)
    expect(nose.x).toBeCloseTo(1, 5)
    expect(drill.root.position.toArray()).toEqual([1, 2, 3])
    const blade = buildShotProp('neonBlade')
    poseShotProp(blade, 0, 0, 0, 4, 0, 0, 1, 0.5)
    expect(blade.root.quaternion.w).toBeCloseTo(1, 5)
    expect(blade.spin.rotation.y).not.toBe(0)
  })

  it('a bigger shot is a bigger part', () => {
    const p = buildShotProp('magnetPull')
    poseShotProp(p, 0, 0, 0, 0, 0, 1, 1, 0)
    const a = p.root.scale.x
    poseShotProp(p, 0, 0, 0, 0, 0, 1, 2, 0)
    expect(p.root.scale.x).toBeCloseTo(a * 2, 6)
  })
})
