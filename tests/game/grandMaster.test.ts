// @vitest-environment jsdom
// The Grand Master Bot (#101): Vex's button, the ten Masters assembling on
// the roof, then four parts in Mega Man 2's Wily Machine order — the arms, the
// feet, the head, the core — one weak spot at a time; its state rides in the
// climb's save.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Box3, Group, Matrix4, MeshBasicMaterial, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three'
import { GrandMaster, GM_PHASES, GM_HP_MUL, WEAK_SPOT_MUL, WEAKNESS_MUL, WING_BEAT_AMP, gmPartPieces, type GmHost } from '@/game/sim/grandMaster'
import { generateVexFortress } from '@/game/world/stages/fortress'
import { hud } from '@/game/state/hud'
import { banner } from '@/game/state/banner'
import type { Enemy, Shot } from '@/game/sim/world'
import { coplanarOverlaps } from './coplanar'

const rig = () => {
  const map = generateVexFortress(3)
  const roof = map.rooms[map.terrain!.bossStages![0]!]!
  let press = false
  const host = {
    player: { x: 0, y: 0, z: 0, px: 0, pz: 0, py: 0, vx: 0, vz: 0, vy: 0, yaw: 0, safeY: 0, pitch: 0, ground: true },
    combat: { maxHp: 100 },
    vex: { maxHp: 1000, dmg: 20 } as unknown as Enemy,
    dmg: 20,
    markers: { spawn: vi.fn() },
    shocks: { spawn: vi.fn() },
    fx: { sparks: vi.fn(), orbBurst: vi.fn(), flash: vi.fn(), emit: vi.fn(), riseRing: vi.fn() },
    propParent: () => new Group(),
    sfx: vi.fn(),
    say: vi.fn(),
    shake: vi.fn(),
    hitPlayer: vi.fn(() => 'hit'),
    hurtMachines: vi.fn(),
    fireEnemyShot: vi.fn(),
    spawnWave: vi.fn(),
    pull: vi.fn(),
    skyFlash: vi.fn(),
    keepRetryPoint: vi.fn(),
    pressed: () => press,
    onDefeated: vi.fn()
  }
  const gm = new GrandMaster(host as unknown as GmHost, roof)
  const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) gm.update(1 / 30, 0, host.player as never, true) }
  return { gm, host, step, roof, setPress: (v: boolean) => { press = v } }
}

/** A player shot right on part `id`'s weak spot (or `off` m beside it). */
const shotAt = (gm: GrandMaster, id: string, dmg: number, o: Partial<Shot> = {}, off = 0): Shot => {
  const p = gm.parts.find(q => q.id === id)!
  const at = gm.root.position
  return { owner: 'player', x: at.x + p.wx + off, y: p.wy + at.y, z: at.z + p.wz, radius: 0.1, dmg, crit: false, kind: 'charge2', weapon: '', ...o } as unknown as Shot
}

beforeEach(() => { hud.bossName = ''; hud.bossMarks = [] })

describe('the Grand Master', () => {
  it('sleeps until Vex falls; then the button, the rumble, the drop to the roof, the assembly, and it wakes', () => {
    const r = rig()
    r.step(5)
    expect(r.gm.state).toBe('dormant')
    r.gm.start(10, 10)
    r.step(4)
    expect(r.host.say).toHaveBeenCalledWith('hint.gm.button')
    r.step(5.5)
    // On the roof, facing it, the stick held.
    expect(Math.floor(r.host.player.z / 3)).toBe(r.roof.z0 + r.roof.h - 2)
    expect(r.gm.locksMove()).toBe(true)
    const seq = banner.seq
    r.step(6)
    expect(r.gm.state).toBe('fight')
    expect(banner.seq).toBe(seq + 1)
    expect(banner.kind).toBe('grandMaster')
    expect(hud.bossName).toBe('boss.grandMaster')
    expect(hud.bossMarks).toHaveLength(3)
    expect(r.host.keepRetryPoint).toHaveBeenCalledTimes(1)
    expect(r.host.say).toHaveBeenCalledWith('hint.gm.arms')
  })

  it('a press once the rumble has begun skips straight to the fight', () => {
    const r = rig()
    r.gm.start(10, 10)
    r.step(4)
    r.setPress(true)
    r.step(0.1)
    expect(r.gm.state).toBe('fight')
  })

  it('holds the giant\'s health against Vex\'s, shared by its parts', () => {
    const r = rig()
    const total = r.gm.parts.reduce((a, p) => a + p.max, 0)
    expect(total).toBeCloseTo(1000 * GM_HP_MUL, -1)
  })

  it('only the live part takes damage; the weak spot and the part\'s weakness hit harder', () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    const head = r.gm.part('head')
    expect(r.gm.shot(shotAt(r.gm, 'head', 50))).toBe(true)
    expect(head.hp).toBe(head.max)
    const arm = r.gm.part('armL')
    r.gm.shot(shotAt(r.gm, 'armL', 10, {}, 1.2))
    expect(arm.max - arm.hp).toBe(10)
    r.gm.shot(shotAt(r.gm, 'armL', 10))
    expect(arm.max - arm.hp).toBe(10 + 10 * WEAK_SPOT_MUL)
    const before = arm.hp
    r.gm.shot(shotAt(r.gm, 'armL', 10, { kind: 'special', weapon: arm.weakTo! } as never))
    expect(before - arm.hp).toBe(10 * WEAK_SPOT_MUL * WEAKNESS_MUL)
  })

  it('arms, then feet, then head, then the core; then it falls and the objective is done', () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    for (const set of GM_PHASES) {
      for (const id of set) {
        const p = r.gm.part(id)
        while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500))
      }
      r.step(0.2)
    }
    expect(r.host.say).toHaveBeenCalledWith('hint.gm.feet')
    expect(r.host.say).toHaveBeenCalledWith('hint.gm.head')
    expect(r.host.say).toHaveBeenCalledWith('hint.gm.body')
    expect(r.gm.state).toBe('dying')
    r.step(3)
    expect(r.gm.state).toBe('done')
    expect(r.host.onDefeated).toHaveBeenCalledTimes(1)
    expect(hud.bossName).toBe('')
  })

  it('attacks per part: the arms fire, the feet send waves along the floor', () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    r.step(5)
    expect(r.host.fireEnemyShot).toHaveBeenCalled()
    for (const id of GM_PHASES[0]!) { const p = r.gm.part(id); while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500)) }
    r.step(4)
    expect(r.host.spawnWave).toHaveBeenCalled()
  })

  it('a reload or retry comes back to the fight with every broken part still broken; a fallen giant stays fallen', () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    for (const id of GM_PHASES[0]!) { const p = r.gm.part(id); while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500)) }
    const saved = r.gm.save()
    const again = rig()
    again.gm.restore(saved)
    expect(again.gm.state).toBe('fight')
    expect(again.gm.part('armL').gone && again.gm.part('armR').gone).toBe(true)
    expect(again.host.keepRetryPoint).not.toHaveBeenCalled()
    const done = rig()
    done.gm.restore({ s: 'done', hp: [0, 0, 0, 0, 0, 0] })
    expect(done.gm.state).toBe('done')
    expect(done.gm.blocking).toBe(false)
  })
})

/** Every toon (opaque) mesh of the giant, baked into one frame. */
const toonGeos = (gm: GrandMaster): BufferGeometry[] => {
  gm.root.updateMatrixWorld(true)
  const out: BufferGeometry[] = []
  gm.root.traverse(o => {
    const m = o as Mesh
    if (!m.isMesh || m.renderOrder === -1 || m.material instanceof MeshBasicMaterial) return
    out.push(m.geometry.clone().applyMatrix4(m.matrixWorld))
  })
  return out
}

describe('the Grand Master\'s wings (#145)', () => {
  const toFeet = () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    for (const id of GM_PHASES[0]!) { const p = r.gm.part(id); while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500)) }
    r.step(1)
    return r
  }
  const breakFeet = (r: ReturnType<typeof rig>) => {
    for (const id of GM_PHASES[1]!) { const p = r.gm.part(id); while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500)) }
  }
  /** A wing's reach out to its side of the core, in the giant's frame. */
  const reach = (r: ReturnType<typeof rig>, i: number): number => {
    r.gm.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(r.gm.hinges[i]!)
    return i ? box.max.x - r.gm.root.position.x : r.gm.root.position.x - box.min.x
  }

  it('stay folded away while it stands on its feet', () => {
    const r = toFeet()
    expect(r.gm.wings.visible).toBe(false)
    expect(r.gm.wingsOut).toBe(0)
  })

  it('unfold out of its back with a burst of jets as the feet go, then hold it in the air', () => {
    const r = toFeet()
    breakFeet(r)
    expect(r.gm.wings.visible).toBe(true)
    expect(r.host.sfx).toHaveBeenCalledWith('flameJet', expect.any(Number), expect.any(Number))
    r.step(0.2)
    expect(r.gm.wingsOut).toBeGreaterThan(0)
    expect(r.gm.wingsOut).toBeLessThan(1)
    const unfolding = [reach(r, 0), reach(r, 1)]
    r.step(1.5)
    expect(r.gm.wingsOut).toBe(1)
    for (const i of [0, 1]) {
      expect(reach(r, i)).toBeGreaterThan(unfolding[i]! + 1)
      expect(reach(r, i)).toBeGreaterThan(6)
    }
    // Hovering where the feet used to hold it, bobbing with the beat.
    const ys: number[] = []
    for (let n = 0; n < 20; n++) { r.step(0.1); ys.push(r.gm.root.position.y) }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1)
    for (const y of ys) expect(Math.abs(y + 1.6)).toBeLessThan(0.2)
  })

  it('ride the core: they follow the giant as it bobs, and stay behind its weak spots', () => {
    const r = toFeet()
    breakFeet(r)
    r.step(1.5)
    let up: Object3D | null = r.gm.wings
    while (up && up !== r.gm.part('body').root) up = up.parent
    expect(up).toBe(r.gm.part('body').root)
    const at = () => { r.gm.root.updateMatrixWorld(true); return new Vector3().setFromMatrixPosition(r.gm.hinges[0]!.matrixWorld) }
    const a = at(); const ya = r.gm.root.position.y
    r.step(0.4)
    const b = at(); const yb = r.gm.root.position.y
    expect(ya).not.toBeCloseTo(yb, 3)
    expect(b.y - a.y).toBeCloseTo(yb - ya, 1)
    // Everything of the wings lies behind the head's and the core's weak spots.
    r.gm.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(r.gm.hinges[0]!)
    box.union(new Box3().setFromObject(r.gm.hinges[1]!))
    for (const id of ['head', 'body'] as const) expect(box.max.z - r.gm.root.position.z).toBeLessThan(r.gm.part(id).wz - r.gm.part(id).r)
  })

  it('beat round the shoulder joints by the full swing in every legless phase, until it falls', () => {
    const r = toFeet()
    breakFeet(r)
    r.step(1.2)
    const swing = () => {
      const seen: number[] = []
      for (let t = 0; t < 2; t += 1 / 30) { r.step(1 / 30); seen.push(r.gm.wingAngle) }
      return Math.max(...seen) - Math.min(...seen)
    }
    expect(swing()).toBeGreaterThanOrEqual(2 * WING_BEAT_AMP * 0.95)
    const head = r.gm.part('head')
    while (!head.gone) r.gm.shot(shotAt(r.gm, 'head', 500))
    expect(swing()).toBeGreaterThanOrEqual(2 * WING_BEAT_AMP * 0.95)
    const body = r.gm.part('body')
    while (!body.gone) r.gm.shot(shotAt(r.gm, 'body', 500))
    expect(r.gm.state).toBe('dying')
    expect(swing()).toBeGreaterThanOrEqual(2 * WING_BEAT_AMP * 0.95)
  })

  it('never touch Gale\'s fan or Rotor\'s blades, low on the back, folded, unfolding or beating', () => {
    const r = toFeet()
    const meshes = (o: Object3D): Mesh[] => {
      const out: Mesh[] = []
      o.traverse(c => { const m = c as Mesh; if (m.isMesh && m.renderOrder !== -1) out.push(m) })
      return out
    }
    const wingParts = meshes(r.gm.wings)
    const hits: string[] = []
    let at = 0
    const check = () => {
      r.gm.root.updateMatrixWorld(true)
      // In the core's own frame (its sway turns trims and wings alike).
      const toCore = r.gm.part('body').root.matrixWorld.clone().invert()
      const box = (m: Mesh) => {
        const k = new Matrix4().multiplyMatrices(toCore, m.matrixWorld)
        const pos = m.geometry.getAttribute('position')
        const b = new Box3()
        for (let v = 0; v < pos.count; v++) b.expandByPoint(new Vector3().fromBufferAttribute(pos, v).applyMatrix4(k))
        return b
      }
      r.gm.backTrim.forEach((t, i) => {
        const tb = box(t)
        wingParts.forEach((m, n) => {
          const wb = box(m)
          if (tb.intersectsBox(wb)) hits.push(`trim ${i} x wing part ${n} at ${at.toFixed(2)} s: ${JSON.stringify(tb.intersect(wb))}`)
        })
      })
    }
    expect(r.gm.backTrim).toHaveLength(2)
    for (const t of r.gm.backTrim) expect(t.visible).toBe(true)
    check()
    breakFeet(r)
    // The unfold, then several beats, hovering and busy (its laser, the Prism Cannon).
    for (; at < 12; at += 1 / 30) { r.step(1 / 30); check() }
    expect(hits.slice(0, 5)).toEqual([])
  })

  it('come back spread on a reload into the flying phases', () => {
    const r = toFeet()
    breakFeet(r)
    const again = rig()
    again.gm.restore(r.gm.save())
    expect(again.gm.wings.visible).toBe(true)
    expect(again.gm.wingsOut).toBe(1)
    expect(again.gm.root.position.y).toBeCloseTo(-1.6, 0)
  })

  it('no two opaque faces of the giant, wings spread, lie in one plane', () => {
    const geos = toonGeos(rig().gm)
    // The six parts, the mount and both wings.
    expect(geos.length).toBeGreaterThanOrEqual(9)
    expect(coplanarOverlaps(geos)).toBe(0)
  })

  it('no two pieces of its armour (plates, bolts, vents, eye) lie in one plane, inside a part or across them', () => {
    const pieces = (['footL', 'footR', 'body', 'armL', 'armR', 'head'] as const).flatMap(id => {
      const p = gmPartPieces(id)
      return [...p.toon, ...p.glow, ...p.eye]
    })
    expect(pieces.length).toBeGreaterThan(100)
    expect(coplanarOverlaps(pieces)).toBe(0)
  })
})

describe('the Grand Master\'s attacks', () => {
  const fight = () => {
    const r = rig()
    r.gm.start(10, 10)
    r.setPress(true); r.step(4); r.setPress(false)
    return r
  }
  const breakSet = (r: ReturnType<typeof rig>, n: number) => {
    for (const id of GM_PHASES[n]!) { const p = r.gm.part(id); while (!p.gone) r.gm.shot(shotAt(r.gm, id, 500)) }
  }
  /** Steps until the beam is out (not the tell's sight line), at most `s`. */
  const untilBeam = (r: ReturnType<typeof rig>, s: number): boolean => {
    for (let t = 0; t < s; t += 1 / 30) {
      r.step(1 / 30)
      if (r.gm.beam.group.visible && r.gm.beam.splash.visible && r.gm.beam.shaft.scale.x > 0.2) return true
    }
    return false
  }
  /** The beam starts at its source and only runs away from the giant:
   *  nothing of it lies behind the source, toward the body. */
  const outward = (r: ReturnType<typeof rig>, part: 'head' | 'body') => {
    const b = r.gm.beam
    const o = b.origin
    const p = r.gm.part(part)
    // At the part's face (the eye / the lens), well in front of its middle.
    expect(Math.hypot(o.x - (r.gm.root.position.x + p.wx), o.z - (r.gm.root.position.z + p.wz))).toBeLessThan(0.8)
    expect(o.y - r.gm.root.position.y).toBeGreaterThan(p.wy - 0.8)
    expect(o.y - r.gm.root.position.y).toBeLessThan(p.wy + 0.8)
    const dir = new Vector3().subVectors(b.end, o).normalize()
    b.group.updateMatrixWorld(true)
    const pos = b.core.geometry.getAttribute('position')
    let back = Infinity
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(b.core.matrixWorld)
      back = Math.min(back, v.sub(o).dot(dir))
    }
    expect(back).toBeGreaterThan(-0.05)
    // It heads off the giant's front, away from its body.
    expect(dir.z).toBeGreaterThan(0.3)
  }

  it('the laser leaves from the eye and the Prism Cannon from the lens in the belly, outward', () => {
    const r = fight()
    breakSet(r, 0); r.step(0.5); breakSet(r, 1); r.step(0.5)
    expect(untilBeam(r, 6)).toBe(true)
    outward(r, 'head')
    expect(r.gm.beamKind).toBe('laser')
    // The Prism Cannon charges at 9 s in the head phase.
    let n = 0
    while (r.gm.beamKind !== 'prism' && n++ < 30 * 14) r.step(1 / 30)
    expect(untilBeam(r, 1)).toBe(true)
    expect(r.gm.beamKind).toBe('prism')
    outward(r, 'body')
  })

  it('a beam hits along the line it is drawn on: Flux in it is hit (from its source), Flux beside it is not', () => {
    const r = fight()
    breakSet(r, 0); r.step(0.5); breakSet(r, 1); r.step(0.5)
    const p = r.host.player
    // Flux stands right on the sweep's line as it passes the middle.
    expect(untilBeam(r, 6)).toBe(true)
    r.host.hitPlayer.mockClear()
    const b = r.gm.beam
    const at = () => { const d = new Vector3().subVectors(b.end, b.origin); d.y = 0; return d.normalize() }
    const d = at()
    p.x = b.origin.x + d.x * 8; p.z = b.origin.z + d.z * 8
    r.step(1 / 30)
    expect(r.host.hitPlayer).toHaveBeenCalledTimes(1)
    const o = (r.host.hitPlayer.mock.calls[0] as unknown[])[2] as { fromX: number; fromZ: number }
    expect(o.fromX).toBeCloseTo(b.origin.x, 0)
    expect(o.fromZ).toBeCloseTo(b.origin.z, 0)
    // The next sweep, with Flux well off to the side of it all the while.
    while (b.group.visible) r.step(1 / 30)
    r.host.hitPlayer.mockClear()
    expect(untilBeam(r, 6)).toBe(true)
    for (let n = 0; n < 30 && b.group.visible; n++) {
      const e = at()
      p.x = b.origin.x + e.x * 8 - e.z * 6; p.z = b.origin.z + e.z * 8 + e.x * 6
      r.step(1 / 30)
    }
    expect(r.host.hitPlayer).not.toHaveBeenCalled()
  })

  it('winds up before each attack: the arm draws back, the giant crouches and hops before a stomp lands', () => {
    const r = fight()
    // The arms: nothing fired yet while the arm draws back.
    const arm = () => Math.max(...['armL', 'armR'].map(id => r.gm.part(id as 'armL').pose.rotation.x))
    let drew = 0
    for (let t = 0; t < 2.5 && !r.host.fireEnemyShot.mock.calls.length; t += 1 / 30) { r.step(1 / 30); if (!r.host.fireEnemyShot.mock.calls.length) drew = Math.max(drew, arm()) }
    expect(r.host.fireEnemyShot).toHaveBeenCalled()
    expect(drew).toBeGreaterThan(0.15)
    // The stomps: up off the roof first, down on it as the wave goes out.
    breakSet(r, 0)
    r.host.spawnWave.mockClear()
    let top = 0
    for (let t = 0; t < 3.5 && !r.host.spawnWave.mock.calls.length; t += 1 / 30) { r.step(1 / 30); top = Math.max(top, r.gm.root.position.y) }
    expect(r.host.spawnWave).toHaveBeenCalled()
    expect(top).toBeGreaterThan(0.5)
    expect(r.gm.root.position.y).toBeLessThan(0.05)
    expect(r.host.shake).toHaveBeenCalled()
  })
})
