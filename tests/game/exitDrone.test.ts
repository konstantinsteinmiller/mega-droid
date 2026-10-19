// The exit drone (src/game/models/exitDrone.ts), asserted without a GPU: it
// builds as one skinned rig in the kit's style (toon + glow + outline), with
// a body bone that tilts and a bone per rotor that spins; its blur discs,
// landing lights and thruster flare ride those bones; its measurements match
// the constants the exit planner and the camera rely on (deck on top, the
// lowest point, the ducts' reach); and no vertex is broken. Flux's new walk
// and hop poses are exercised on his own rig too.

import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Quaternion, Vector3, type BufferGeometry, type SkinnedMesh } from 'three'
import {
  buildExitDrone, poseExitDrone, DRONE_DECK_Y, DRONE_BELOW, DRONE_ARM_R, DRONE_DUCT_R, DRONE_ROTORS, DRONE_DECK_R
} from '@/game/models/exitDrone'
import { buildHero, animateHeroWalk, animateHeroHop } from '@/game/models/hero'
import { newMotion, HERO_GAIT, TAU } from '@/game/models/motion'

/** Vertices a triangle uses that a renderer or the outline hull would choke
 *  on (a NaN, or a normal the hull cannot push along). The kit's `ell` keeps
 *  SphereGeometry's one unused copy of each pole, with no normal: no triangle
 *  draws it, so it is not counted. */
const brokenVertices = (g: BufferGeometry): number => {
  const p = g.attributes.position!
  const n = g.attributes.normal!
  const used = new Set<number>()
  for (let i = 0; i < g.index!.count; i++) used.add(g.index!.getX(i))
  let bad = 0
  for (const i of used) {
    const v = [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)]
    if (!v.every(Number.isFinite) || Math.hypot(v[3]!, v[4]!, v[5]!) < 0.5) bad++
  }
  return bad
}

describe('exit drone model', () => {
  const v = buildExitDrone()
  const rig = v.rig

  it('is one skinned rig: toon + glow in one mesh, plus the outline', () => {
    const mesh = rig.mesh as SkinnedMesh
    expect(mesh.isSkinnedMesh).toBe(true)
    expect(Array.isArray(mesh.material)).toBe(true)
    expect(mesh.geometry.groups.length).toBe(2)
    expect(rig.outline).not.toBeNull()
    expect(brokenVertices(mesh.geometry)).toBe(0)
  })

  it('has a body bone and four rotor bones at the arm tips', () => {
    expect(rig.bones.body).toBeDefined()
    for (let k = 0; k < 4; k++) {
      const b = rig.bones[`rotor${k}`]!
      expect(b).toBeDefined()
      expect(b.parent).toBe(rig.bones.body)
      expect(Math.hypot(b.position.x, b.position.z)).toBeCloseTo(DRONE_ARM_R, 5)
    }
    expect(DRONE_ROTORS.length).toBe(4)
  })

  it('carries a blur disc on every rotor, and the lights and the thruster flare on the body', () => {
    for (let k = 0; k < 4; k++) {
      const discs = rig.bones[`rotor${k}`]!.children.filter(o => (o as Mesh).isMesh)
      expect(discs.length).toBe(1)
      expect((discs[0] as Mesh).material).toBe(v.discMat)
    }
    const bodyMeshes = rig.bones.body!.children.filter(o => (o as Mesh).isMesh) as Mesh[]
    expect(bodyMeshes.map(m => m.material)).toEqual(expect.arrayContaining([v.lightsMat, v.thrustMat]))
  })

  it('measures what the planner assumes: deck on top, the underside, the reach', () => {
    const g = rig.mesh.geometry
    g.computeBoundingBox()
    const bb = g.boundingBox as Box3
    // Nothing but the rotor rings and blades stands over the deck.
    expect(bb.min.y).toBeGreaterThan(-DRONE_BELOW - 0.02)
    expect(bb.min.y).toBeLessThan(-DRONE_BELOW + 0.03)
    const reach = DRONE_ARM_R + DRONE_DUCT_R + 0.06
    expect(Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z)).toBeLessThan(reach)
    // The standing plate's top is the deck height, and Flux fits on it.
    expect(DRONE_DECK_Y).toBeGreaterThan(0)
    expect(DRONE_DECK_R).toBeGreaterThan(0.5)
  })

  it('poses: the body tilts, the rotors spin (alternate ones the other way)', () => {
    poseExitDrone(v, 1, 0, 0, 0, 0.5)
    const q0 = rig.bones.rotor0!.quaternion.clone()
    const q1 = rig.bones.rotor1!.quaternion.clone()
    poseExitDrone(v, 1.5, 1.2, 0.3, -0.2, 1)
    const body = rig.bones.body!.quaternion
    expect(body.angleTo(new Quaternion())).toBeGreaterThan(0.3)
    const turn0 = new Vector3(1, 0, 0).applyQuaternion(rig.bones.rotor0!.quaternion)
    const was0 = new Vector3(1, 0, 0).applyQuaternion(q0)
    const turn1 = new Vector3(1, 0, 0).applyQuaternion(rig.bones.rotor1!.quaternion)
    const was1 = new Vector3(1, 0, 0).applyQuaternion(q1)
    const sign = (a: Vector3, b: Vector3) => Math.sign(a.x * b.z - a.z * b.x)
    expect(sign(was0, turn0)).toBe(-sign(was1, turn1))
    expect(v.thrustMat.opacity).toBeGreaterThan(0.8)
  })
})

describe('Flux walks and hops (the exit)', () => {
  const hero = buildHero()

  it('the walk moves the legs apart through a stride and keeps everything finite', () => {
    const m = newMotion(3)
    m.walk = 0.6
    m.fwd = 1
    m.side = 0
    const hips: number[] = []
    for (let k = 0; k < 8; k++) {
      m.phase = (k / 8) * TAU
      animateHeroWalk(hero, m, k * 0.1)
      const l = hero.bones.hipL!.quaternion.x
      const r = hero.bones.hipR!.quaternion.x
      hips.push(l - r)
      for (const b of Object.values(hero.bones)) expect(b.quaternion.toArray().every(Number.isFinite)).toBe(true)
    }
    // The legs cross over through the cycle: their difference changes sign.
    expect(Math.max(...hips)).toBeGreaterThan(0.05)
    expect(Math.min(...hips)).toBeLessThan(-0.05)
    // The gait's leg length is the rig's hip-joint height, so the planted foot stays on the floor.
    expect(HERO_GAIT.L).toBeCloseTo(hero.rest.hips!.p.y + hero.rest.hipL!.p.y, 3)
  })

  it('the hop crouches (hips down, knees bent) and tucks in the air', () => {
    animateHeroHop(hero, 0, 0, 0)
    const hipsRest = hero.bones.hips!.position.y
    animateHeroHop(hero, 1, 0, 0)
    expect(hero.bones.hips!.position.y).toBeLessThan(hipsRest - 0.08)
    const knee = new Quaternion().copy(hero.bones.kneeL!.quaternion)
    expect(knee.angleTo(hero.rest.kneeL!.q)).toBeGreaterThan(1)
    animateHeroHop(hero, 0, 1, 0)
    expect(hero.bones.kneeR!.quaternion.angleTo(hero.rest.kneeR!.q)).toBeGreaterThan(0.8)
  })
})
