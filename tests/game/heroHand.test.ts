// @vitest-environment jsdom
// #113: the 3D Flux carried his buster on his LEFT arm, while the first-person
// view and the cover art have it on the right. Facing +Z, his right is −X.
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildHero } from '@/game/models/hero'

describe('Flux\'s buster arm', () => {
  it('hangs on his right arm (−X while he faces +Z), the shield arm on his left', () => {
    const rig = buildHero()
    rig.root.updateMatrixWorld(true)
    const cannon = rig.bones.elbowR!.getWorldPosition(new Vector3())
    const shield = rig.bones.elbowL!.getWorldPosition(new Vector3())
    expect(cannon.x).toBeLessThan(0)
    expect(shield.x).toBeGreaterThan(0)
  })

  it('a pose on the root still reaches the body (it is mirrored inside it)', () => {
    const rig = buildHero()
    rig.root.position.set(5, 0, 0)
    rig.root.updateMatrixWorld(true)
    expect(rig.bones.head!.getWorldPosition(new Vector3()).x).toBeCloseTo(5, 3)
  })
})
