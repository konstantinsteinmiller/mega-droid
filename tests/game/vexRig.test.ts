// Dr. Vex's Mk-I (models/vexMk1.ts): the hover pod's model and pose. No two
// of its parts fight for the same pixels, the bones the game reads are still
// there, it keeps the size the hitbox (radius 1.3) and the arenas were tuned
// for, the dome sits where the weak spot is, and the pose — the hover, the
// lean into travel, the telegraph's charge — stays the old hover at rest.
// Given the fight's cue (the boss itself), only the coming pattern's weapon
// winds up, and phase 2 shows the damage.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { Box3, Quaternion, Vector3, type Mesh } from 'three'
import { RigBuilder, pose, nudge, scaleBone, type Rig } from '@/game/models/kit'
import { buildVex, poseVex, type VexCue } from '@/game/models/vexMk1'
import { createBoss, syncBossVisual } from '@/game/sim/bosses'
import { poseBoss, type BossAct } from '@/game/models/bosses'
import { BOSS_WEAK } from '@/game/data/weakspots'
import { BOSSES } from '@/game/data/bosses'
import { newMotion } from '@/game/models/motion'
import { coplanarOverlaps } from './coplanar'

const ACTS: BossAct[] = ['idle', 'walk', 'tele', 'attack', 'stun', 'air']
/** The glass may be at most this much wider than the weak spot's sphere. */
const WEAK_COVER = 1.1

const reset = (r: Rig): Rig => {
  for (const n of Object.keys(r.bones)) {
    pose(r, n)
    nudge(r, n)
    scaleBone(r, n, 1)
  }
  return r
}

const snap = (rig: Rig): number[] => {
  const out: number[] = []
  for (const b of Object.values(rig.bones)) out.push(...b.quaternion.toArray(), ...b.position.toArray(), ...b.scale.toArray())
  return out
}

describe('Dr. Vex Mk-I: the model', () => {
  it('has no coplanar overlapping faces between its parts (no z-fighting)', () => {
    let parts: RigBuilder['partGeometries'] = []
    const build = RigBuilder.prototype.build
    RigBuilder.prototype.build = function (this: RigBuilder, opts) {
      const rig = build.call(this, opts)
      parts = this.partGeometries
      return rig
    }
    try {
      buildVex()
    } finally {
      RigBuilder.prototype.build = build
    }
    expect(parts.length).toBeGreaterThan(100)
    expect(coplanarOverlaps(parts)).toBe(0)
  })

  it('keeps the bones the game and the old pose used', () => {
    const r = buildVex()
    for (const n of ['body', 'dome', 'clawL', 'clawR']) expect(r.bones[n], n).toBeDefined()
    expect(r.height).toBe(2.2)
  })

  it('stays the size the hitbox and the arena were tuned for', () => {
    const r = buildVex()
    r.mesh.geometry.computeBoundingBox()
    const box = r.mesh.geometry.boundingBox!
    const hitR = BOSSES.vexMk1.hitR
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(hitR)
    expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(hitR)
    expect(box.max.x).toBeGreaterThan(1)
    expect(box.max.y).toBeGreaterThan(1)
    expect(box.max.y).toBeLessThan(1.3)
    expect(box.min.y).toBeGreaterThan(-1.3)
  })

  it('puts the glass dome round the weak spot', () => {
    const r = buildVex()
    r.root.updateMatrixWorld(true)
    const glass = r.bones.dome!.children.find(o => o.name === 'vexGlass') as Mesh
    expect(glass).toBeDefined()
    const box = new Box3().setFromObject(glass)
    const w = BOSS_WEAK.vexMk1
    const c = box.getCenter(new Vector3())
    expect(Math.abs(c.y - w.up)).toBeLessThan(w.r)
    expect(Math.abs(c.x)).toBeLessThan(0.01)
    expect(box.max.x - box.min.x).toBeLessThan(w.r * 2 * WEAK_COVER)
  })

  it('shares one glass geometry and material between every Mk-I', () => {
    const a = buildVex().bones.dome!.children.find(o => o.name === 'vexGlass') as Mesh
    const b = buildVex().bones.dome!.children.find(o => o.name === 'vexGlass') as Mesh
    expect(a.geometry).toBe(b.geometry)
    expect(a.material).toBe(b.material)
  })
})

describe('Dr. Vex Mk-I: the pose', () => {
  it('poseBoss hands Vex to his own pose', () => {
    const a = reset(buildVex())
    const b = reset(buildVex())
    for (const act of ACTS) {
      poseBoss(a, 'vexMk1', 3.1, act, 0.4)
      poseVex(b, 3.1, act, 0.4)
      expect(snap(a), act).toEqual(snap(b))
    }
  })

  it('is a pure function of its inputs (no drift between calls)', () => {
    const a = reset(buildVex())
    const b = reset(buildVex())
    for (const act of ACTS) {
      poseVex(a, 7.7, act, 0.5)
      poseVex(a, 2, 'stun', 0.2)
      poseVex(a, 7.7, act, 0.5)
      poseVex(b, 7.7, act, 0.5)
      expect(snap(a), act).toEqual(snap(b))
      expect(snap(a).every(Number.isFinite), act).toBe(true)
    }
  })

  it('with a motion record at rest, the same hover as without', () => {
    const a = reset(buildVex())
    const b = reset(buildVex())
    const m = newMotion(5)
    m.walk = 0
    m.turn = 0
    m.look = 0
    for (const act of ACTS) {
      poseVex(a, 4.2, act, 0.6)
      poseVex(b, 4.2, act, 0.6, m)
      expect(snap(b), act).toEqual(snap(a))
    }
  })

  it('tilts nose-down into forward travel and banks into a sideways one', () => {
    const r = reset(buildVex())
    const m = newMotion(5)
    const tilt = (): Vector3 => {
      // The hull's forward (+z) and right (+x) axes in its parent's space
      const q = r.bones.body!.quaternion
      return new Vector3(new Vector3(1, 0, 0).applyQuaternion(q).y, 0, new Vector3(0, 0, 1).applyQuaternion(q).y)
    }
    const t = 0 // the idle sway is 0 at t = 0
    m.walk = 1
    m.fwd = 1
    poseVex(r, t, 'walk', 0, m)
    expect(tilt().z).toBeLessThan(-0.1)
    m.fwd = 0
    m.side = 1
    poseVex(r, t, 'walk', 0, m)
    expect(tilt().x).toBeLessThan(-0.1)
  })

  it('charges every muzzle through the telegraph and spends it after the release', () => {
    const r = reset(buildVex())
    const at = (act: BossAct, k: number): number => {
      poseVex(r, 1, act, k)
      return r.bones.orb!.scale.x
    }
    const rest = at('idle', 0)
    expect(at('tele', 0.5)).toBeGreaterThan(rest)
    expect(at('tele', 1)).toBeGreaterThan(at('tele', 0.5))
    expect(at('attack', 0)).toBeGreaterThan(at('attack', 1))
    expect(at('attack', 1)).toBeCloseTo(rest, 5)
    for (const n of ['muzzleL', 'muzzleR']) expect(r.bones[n]!.scale.x).toBe(r.bones.orb!.scale.x)
  })

  it('raises the claws to aim through the telegraph (the old tell)', () => {
    const r = reset(buildVex())
    const down = new Vector3(0, -1, 0)
    const reach = (k: number): number => {
      poseVex(r, 0, 'tele', k)
      const q = new Quaternion().copy(r.bones.clawL!.quaternion)
      return down.clone().applyQuaternion(q).z
    }
    expect(reach(1)).toBeGreaterThan(reach(0) + 0.5)
  })
})

describe("Dr. Vex Mk-I: the fight's cue", () => {
  /** Each pattern's charge bones (the gun that fires it). */
  const GUN: Record<string, string[]> = {
    flameBurst: ['muzzleL'],
    fireWave: ['muzzleL'],
    iceVolley: ['muzzleR'],
    orbStorm: ['orb'],
    lobBarrage: ['lobL', 'lobR'],
    voltRing: ['tipL', 'tipR']
  }
  const CHARGES = ['muzzleL', 'muzzleR', 'orb', 'lobL', 'lobR', 'tipL', 'tipR']
  const charges = (cue?: VexCue, act: BossAct = 'tele', k = 1): Record<string, number> => {
    const r = reset(buildVex())
    poseVex(r, 1, act, k, undefined, cue)
    return Object.fromEntries(CHARGES.map(n => [n, r.bones[n]!.scale.x]))
  }

  it("winds up only the coming pattern's weapon", () => {
    const rest = charges(undefined, 'idle', 0)
    for (const [attack, guns] of Object.entries(GUN)) {
      const c = charges({ attack, phase2: false })
      for (const n of CHARGES) {
        if (guns.includes(n)) expect(c[n], `${attack} ${n}`).toBeGreaterThan(rest[n]! + 0.5)
        else expect(c[n], `${attack} ${n}`).toBeCloseTo(rest[n]!, 6)
      }
    }
  })

  it('with no cue (ModelLab, the portrait) every gun charges, as before', () => {
    const rest = charges(undefined, 'idle', 0)
    const c = charges()
    for (const n of CHARGES) expect(c[n], n).toBeGreaterThan(rest[n]! + 0.5)
  })

  it('raises the flame claw for a flame pattern and the ice claw for the ice one', () => {
    const reach = (attack: string, side: 'L' | 'R'): number => {
      const r = reset(buildVex())
      poseVex(r, 0, 'tele', 1, undefined, { attack, phase2: false })
      return new Vector3(0, -1, 0).applyQuaternion(r.bones[`claw${side}`]!.quaternion).z
    }
    expect(reach('flameBurst', 'L')).toBeGreaterThan(reach('flameBurst', 'R') + 0.3)
    expect(reach('iceVolley', 'R')).toBeGreaterThan(reach('iceVolley', 'L') + 0.3)
  })

  it('flares the thrusters before a dive', () => {
    const jet = (attack: string): number => {
      const r = reset(buildVex())
      poseVex(r, 1, 'tele', 1, undefined, { attack, phase2: false })
      return r.bones.jet0!.scale.y + r.bones.jetBL!.scale.y
    }
    expect(jet('dive')).toBeGreaterThan(jet('orbStorm') * 1.8)
  })

  it('phase 2: the plate tears loose, the face cracks, the sirens and the anger show', () => {
    const DAMAGE = ['crack', 'sirenL', 'sirenR', 'fume']
    const r = reset(buildVex())
    poseVex(r, 2, 'idle', 0, undefined, { attack: '', phase2: false })
    for (const n of DAMAGE) expect(r.bones[n]!.scale.x, n).toBeLessThan(0.01)
    for (let i = 0; i < 3; i++) expect(r.bones[`puff${i}`]!.scale.x).toBeLessThan(0.01)
    expect(r.bones.spark!.scale.x).toBeLessThan(0.01)
    expect(r.bones.plate!.quaternion.w).toBeCloseTo(1, 6)
    const bottom = (): number => {
      r.root.updateMatrixWorld(true)
      // The plate's lower edge, 0.3 below its hinge: how far it stands out
      const p = new Vector3(0, -0.3, 0).applyMatrix4(r.bones.plate!.matrixWorld)
      return Math.hypot(p.x, p.z / 0.88)
    }
    const shut = bottom()
    poseVex(r, 2, 'idle', 0, undefined, { attack: '', phase2: true })
    for (const n of DAMAGE) expect(r.bones[n]!.scale.x, n).toBeGreaterThan(0.8)
    expect(bottom()).toBeGreaterThan(shut + 0.1)
    // Sparks burst on some frames, smoke is always rising somewhere
    let sparked = 0
    for (let i = 0; i < 40; i++) {
      poseVex(r, i / 9 + 0.01, 'idle', 0, undefined, { attack: '', phase2: true })
      if (r.bones.spark!.scale.x > 0.5) sparked++
      expect(Math.max(r.bones.puff0!.scale.x, r.bones.puff1!.scale.x, r.bones.puff2!.scale.x)).toBeGreaterThan(0.3)
    }
    expect(sparked).toBeGreaterThan(5)
    expect(sparked).toBeLessThan(35)
  })

  it('the boss sim hands Vex his cue: its pattern and its phase', () => {
    const e = createBoss('vexMk1', 1, 0, 0, 0)
    e.state = 'tele'
    e.st = e.teleDur
    e.attack = 'orbStorm'
    syncBossVisual(e, 1)
    expect(e.rig.bones.orb!.scale.x).toBeGreaterThan(0.8)
    expect(e.rig.bones.muzzleL!.scale.x).toBeCloseTo(0.22, 6)
    expect(e.rig.bones.crack!.scale.x).toBeLessThan(0.01)
    e.phase2 = true
    syncBossVisual(e, 1)
    expect(e.rig.bones.crack!.scale.x).toBe(1)
  })
})
