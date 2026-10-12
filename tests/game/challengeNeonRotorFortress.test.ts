// @vitest-environment jsdom
// The Neon, Rotor and Fortress challenge mini-bosses (the Glitch Stalker, the
// Saw Gyro, the Sentinel Prototype): nothing lands during the entrance,
// every blow only after a wind-up of over half a second with its area drawn
// on the floor first, every move turns up in a fight, each one's own rule
// (the decoys and the blink, the dizzy spell and the spinning guard, the
// shield drones), and their models' faces (no z-fighting).

import { describe, expect, it, vi } from 'vitest'

// The blob shadow and the telegraph ring draw canvas textures (no 2D canvas
// under jsdom); plain textures stand in.
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import { generateMap, cellCenter, CELL } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss, syncMiniBoss } from '@/game/sim/miniBosses'
import type { MiniBossSpec } from '@/game/sim/miniBoss/types'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import {
  GLITCH_STALKER, INTRO_T as STALKER_INTRO, BLINK_TELE, DECOY_TELE, GRID_TELE, DECOY_AIM, DECOYS, type StalkerMem
} from '@/game/sim/miniBoss/glitchStalker'
import {
  SAW_GYRO, INTRO_T as GYRO_INTRO, RICO_TELE, BLADE_TELE, DIZZY_T, type GyroMem
} from '@/game/sim/miniBoss/sawGyro'
import {
  SENTINEL_PROTOTYPE, INTRO_T as SENTINEL_INTRO, MORTAR_TELE, BEAM_TELE, DRONE_HP, DRONE_BACK, DRONE_ARC, type SentinelMem
} from '@/game/sim/miniBoss/sentinelPrototype'
import { glitchStalkerParts } from '@/game/models/miniBoss/glitchStalker'
import { sawGyroParts, sawBladeParts } from '@/game/models/miniBoss/sawGyro'
import { sentinelParts, RING_R, RING_Y, SENTINEL_SCALE } from '@/game/models/miniBoss/sentinelPrototype'
import { weakSpotOf } from '@/game/data/weakspots'
import type { Enemy, Shot, World } from '@/game/sim/world'
import { coplanarOverlaps } from './coplanar'

interface Hit { t: number; state: string; attack: string; blockable: boolean }

/** Its floor drawings beyond the shared markers: lines, lanes, a path, an arc. */
const floorDrawn = (e: Enemy): boolean => {
  const m = e.challenge!.mem as Partial<StalkerMem & GyroMem & SentinelMem>
  if (m.strips?.some(s => s.mesh.visible)) return true
  if (m.path?.some(s => s.mesh.visible)) return true
  if (m.blades?.some(b => b.lane.mesh.visible)) return true
  return !!m.arc?.mesh.visible
}

/**
 * Fight `spec` for `secs` in a supply run's challenge room, Flux circling
 * its middle `orbit` m out; `hurt` < 1 sets it to that share of its health
 * once the fight is on (its second phase). Logs every hit, wind-up, floor
 * telegraph (a marker, a line, a lane, an arc), shot and shell.
 */
const fight = (spec: MiniBossSpec, secs: number, o: { hurt?: number; orbit?: number; seed?: number; each?: (e: Enemy, w: World, t: number) => void } = {}) => {
  const map = generateMap({ seed: o.seed ?? 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(spec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const hits: Hit[] = []
  const floor: number[] = []
  const markers: Array<{ t: number; x: number; z: number; dur: number }> = []
  const shots: Array<{ t: number; state: string }> = []
  const shells: Array<{ t: number; x: number; z: number; state: string }> = []
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const stub = () => {}
  let t = 0
  const w = {
    map, nav: createNav(map), time: 0,
    player: { x: cx + 3, z: cz, yaw: 0, pitch: 0 },
    combat: {}, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: (x: number, z: number, _r: number, dur: number) => { floor.push(t); markers.push({ t, x, z, dur }) } },
    shocks: { spawn: stub, spawnLinear: stub },
    hitPlayer: (_s: Enemy | null, _d: number, h: { blockable: boolean }) => {
      hits.push({ t, state: e.state, attack: e.attack, blockable: h.blockable })
      return 'hit'
    },
    fireEnemyShot: () => shots.push({ t, state: e.state }),
    lobShell: (_e: Enemy, x: number, z: number) => shells.push({ t, x, z, state: e.state }),
    shake: stub, sfx: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
  } as unknown as World
  startMiniBoss(e)
  const teles: Array<{ attack: string; dur: number; t: number }> = []
  const acts: string[] = []
  let teleFor = 0
  let drawn = false
  const dt = 1 / 60
  const orbit = o.orbit ?? 3
  for (let k = 0; k < secs / dt; k++) {
    t = k * dt
    w.time = t
    w.player.x = cx + Math.cos(t * 0.6) * orbit
    w.player.z = cz + Math.sin(t * 0.6) * orbit
    const was = e.state
    updateMiniBoss(w, e, dt)
    syncMiniBoss(e, 1, t)
    o.each?.(e, w, t)
    if (e.state === 'engage' && (o.hurt ?? 1) < 1 && e.hp === e.maxHp) e.hp = Math.round(e.maxHp * o.hurt!)
    if (was === 'tele') teleFor += dt
    if (was !== 'act' && e.state === 'act') {
      teles.push({ attack: e.attack, dur: teleFor, t })
      acts.push(e.attack)
    }
    if (e.state !== 'tele') teleFor = 0
    const on = floorDrawn(e)
    if (on && !drawn) floor.push(t)
    drawn = on
  }
  return { e, w, room, hits, teles, acts, floor, markers, shots, shells }
}

/** The rules every mini-boss keeps (`miniBoss/types.ts`). */
const fair = (r: ReturnType<typeof fight>, intro: number) => {
  expect(r.acts.length).toBeGreaterThan(4)
  expect(r.hits.length).toBeGreaterThan(0)
  for (const h of r.hits) {
    expect(h.t).toBeGreaterThan(intro)
    expect(h.state, `${h.attack} at ${h.t.toFixed(2)}`).toBe('act')
    expect(r.floor.some(f => f <= h.t - 0.6 && f >= h.t - 6), `${h.attack} at ${h.t.toFixed(2)}`).toBe(true)
  }
  for (const x of r.teles) expect(x.dur, x.attack).toBeGreaterThanOrEqual(0.6)
}

const shotAt = (x: number, y: number, z: number, kind: Shot['kind'] = 'pellet'): Shot =>
  ({ x, y, z, px: x, py: y, pz: z, radius: 0.12, kind, owner: 'player' }) as unknown as Shot

describe('the registry', () => {
  it('holds the three built for Neon, Rotor and the Fortress, each its own weak spot', () => {
    expect(MINI_BOSSES.neon).toBe(GLITCH_STALKER)
    expect(MINI_BOSSES.rotor).toBe(SAW_GYRO)
    expect(MINI_BOSSES.fortress).toBe(SENTINEL_PROTOTYPE)
    const map = generateMap({ seed: 77, rooms: 9, boss: false, challenge: true })
    for (const spec of [GLITCH_STALKER, SAW_GYRO, SENTINEL_PROTOTYPE] as MiniBossSpec[]) {
      expect(spec.todo).toBeUndefined()
      const e = createMiniBoss(spec, 8, 30, 30, map.rooms[map.challenge!.room]!)
      expect(e.offstage).toBe(true)
      expect(weakSpotOf(e)).toBe(spec.def.weak)
    }
    for (const x of [BLINK_TELE, DECOY_TELE, GRID_TELE, DECOY_AIM, RICO_TELE, BLADE_TELE, MORTAR_TELE, BEAM_TELE]) {
      expect(x).toBeGreaterThanOrEqual(0.6)
    }
  })
})

describe('the Glitch Stalker', () => {
  it('lands nothing during its entrance, every blow after a wind-up with its area on the floor', () => {
    fair(fight(GLITCH_STALKER as MiniBossSpec, 50), STALKER_INTRO)
    fair(fight(GLITCH_STALKER as MiniBossSpec, 50, { hurt: 0.4, seed: 777 }), STALKER_INTRO)
  })

  it('blinks, splits into decoys and lays its laser grid; from half health the grid crosses', () => {
    const r = fight(GLITCH_STALKER as MiniBossSpec, 60)
    expect(r.acts).toContain('blink')
    expect(r.acts).toContain('decoys')
    expect(r.acts).toContain('grid')
    let crossed = false
    fight(GLITCH_STALKER as MiniBossSpec, 60, {
      hurt: 0.4,
      each: (e) => {
        const m = e.challenge!.mem as StalkerMem
        if (m.grid.some(g => g.alongX) && m.grid.some(g => !g.alongX)) crossed = true
      }
    })
    expect(crossed).toBe(true)
  })

  it('comes back on the ring it marked, and is not there to be shot while gone', () => {
    let checked = 0
    const r = fight(GLITCH_STALKER as MiniBossSpec, 60, {
      each: (e, w) => {
        const m = e.challenge!.mem as StalkerMem
        if (m.gone) {
          expect(GLITCH_STALKER.behaviour.shot!(w, e, m, shotAt(e.x, 1.2, e.z))).toBe('pass')
          expect(e.rig.root.visible).toBe(false)
          checked++
        }
      }
    })
    expect(checked).toBeGreaterThan(0)
    // Every blink's ring went down as its wind-up began, where it came back.
    const blinks = r.teles.filter(x => x.attack === 'blink')
    for (const b of blinks) {
      const ring = r.markers.find(mk => Math.abs(mk.t - (b.t - b.dur)) < 0.05)
      expect(ring, `blink at ${b.t.toFixed(2)}`).toBeDefined()
    }
  })

  it('its decoys: see-through, no outline, a shot only after a raised blade, popped by one hit', () => {
    let seen = false
    let popped = false
    let aimed = 0
    const r = fight(GLITCH_STALKER as MiniBossSpec, 60, {
      each: (e, w) => {
        const m = e.challenge!.mem as StalkerMem
        const live = m.decoys.filter(d => d.alive)
        if (live.length === DECOYS && !seen) {
          seen = true
          // The real one keeps its outline (and its shadow); a decoy has neither.
          expect(e.rig.outline?.visible ?? true).toBe(true)
          for (const d of live) expect(d.rig.outline?.visible ?? false).toBe(false)
        }
        if (live.length > 0 && !popped && seen) {
          const d = live[0]!
          expect(GLITCH_STALKER.behaviour.shot!(w, e, m, shotAt(d.x, 1.2, d.z))).toBe('catch')
          expect(d.alive).toBe(false)
          popped = true
        }
        for (const d of live) if (d.fire <= 0.02 && d.pose.aim > 0.9) aimed++
      }
    })
    expect(seen).toBe(true)
    expect(popped).toBe(true)
    // Decoy shots came, each from a blade raised over its wind-up.
    expect(r.shots.length).toBeGreaterThan(0)
    expect(aimed).toBeGreaterThan(0)
  })
})

describe('the Saw Gyro', () => {
  it('lands nothing during its entrance, every blow after a wind-up with its path on the floor', () => {
    fair(fight(SAW_GYRO as MiniBossSpec, 50), GYRO_INTRO)
    fair(fight(SAW_GYRO as MiniBossSpec, 50, { hurt: 0.4, seed: 777 }), GYRO_INTRO)
  })

  it('ricochets and throws blades: two lanes, three from half health', () => {
    const lanes = (hurt: number) => {
      let most = 0
      const r = fight(SAW_GYRO as MiniBossSpec, 60, {
        hurt,
        each: (e) => {
          const m = e.challenge!.mem as GyroMem
          if (e.state === 'tele' && e.attack === 'blades') most = Math.max(most, m.blades.filter(b => b.len > 0).length)
        }
      })
      expect(r.acts).toContain('ricochet')
      expect(r.acts).toContain('blades')
      return most
    }
    expect(lanes(1)).toBe(2)
    expect(lanes(0.4)).toBe(3)
  })

  it('turns shots while it spins up and runs; a big ricochet leaves it dizzy, its core bare', () => {
    let guarded = 0
    let dizzyFor = 0
    let opened = 0
    fight(SAW_GYRO as MiniBossSpec, 60, {
      each: (e) => {
        const m = e.challenge!.mem as GyroMem
        if (e.attack === 'ricochet' && (e.state === 'tele' || e.state === 'act')) {
          expect(SAW_GYRO.behaviour.guarded!(e, m, 0, 0)).toBe(true)
          guarded++
        }
        if (e.state === 'stun') {
          dizzyFor += 1 / 60
          opened = Math.max(opened, m.pose.dizzy)
        }
        if (e.state === 'engage') expect(SAW_GYRO.behaviour.guarded!(e, m, 0, 0)).toBe(false)
      }
    })
    expect(guarded).toBeGreaterThan(0)
    expect(dizzyFor).toBeGreaterThan(DIZZY_T * 0.9)
    // The petals fall open (the pose's dizzy channel).
    expect(opened).toBeGreaterThan(0.8)
  })
})

describe('the Sentinel Prototype', () => {
  it('lands nothing during its entrance; its beam only after a wind-up with its arc on the floor', () => {
    fair(fight(SENTINEL_PROTOTYPE as MiniBossSpec, 60, { orbit: 4 }), SENTINEL_INTRO)
    fair(fight(SENTINEL_PROTOTYPE as MiniBossSpec, 60, { orbit: 4, hurt: 0.4, seed: 777 }), SENTINEL_INTRO)
  })

  it('sweeps its beam and fires a creeping barrage, every shell into a ring marked a wind-up before', () => {
    const r = fight(SENTINEL_PROTOTYPE as MiniBossSpec, 60, { orbit: 4 })
    expect(r.acts).toContain('beam')
    expect(r.acts).toContain('mortar')
    expect(r.shells.length).toBeGreaterThanOrEqual(9)
    for (const s of r.shells) {
      expect(s.state).toBe('act')
      const ring = r.markers.find(mk => mk.x === s.x && mk.z === s.z && mk.t <= s.t - 0.6)
      expect(ring, `shell at ${s.t.toFixed(2)}`).toBeDefined()
    }
  })

  it('its drones catch shots from their side, break, come back; all three down overloads it', () => {
    const r = fight(SENTINEL_PROTOTYPE as MiniBossSpec, 4, { orbit: 4 })
    const { e, w } = r
    const m = e.challenge!.mem as SentinelMem
    const ai = SENTINEL_PROTOTYPE.behaviour
    const R = RING_R * SENTINEL_SCALE
    const y = RING_Y * SENTINEL_SCALE
    const at = (a: number, r0 = R) => shotAt(e.x + Math.sin(a) * r0, y, e.z + Math.cos(a) * r0)
    // A gap between two drones lets a shot by; a drone's side catches it.
    expect(ai.shot!(w, e, m, at(m.ringA + Math.PI / 3))).toBeUndefined()
    expect(ai.shot!(w, e, m, at(m.ringA + DRONE_ARC * 0.8))).toBe('catch')
    expect(m.droneHp[0]).toBe(DRONE_HP - 1)
    // Far from the ring (inside it, over it) is not the drones' business.
    expect(ai.shot!(w, e, m, at(m.ringA, R - 1.2))).toBeUndefined()
    expect(ai.shot!(w, e, m, shotAt(e.x + Math.sin(m.ringA) * R, y + 2, e.z + Math.cos(m.ringA) * R))).toBeUndefined()
    // A charged shot breaks one at once; then the ring has a hole there.
    expect(ai.shot!(w, e, m, { ...at(m.ringA), kind: 'charge1' } as Shot)).toBe('catch')
    expect(m.droneHp[0]).toBe(0)
    expect(ai.shot!(w, e, m, at(m.ringA))).toBeUndefined()
    // It comes back DRONE_BACK later.
    for (let k = 0; k < (DRONE_BACK + 0.2) * 60 && m.droneHp[0] === 0; k++) {
      if (e.state === 'stun') break
      updateMiniBoss(w, e, 1 / 60)
    }
    expect(m.droneHp[0]).toBe(DRONE_HP)
    // All three broken: an overload stun.
    for (let k = 0; k < 3; k++) {
      const a = m.ringA + (k / 3) * Math.PI * 2
      expect(ai.shot!(w, e, m, { ...at(a), kind: 'charge2' } as Shot)).toBe('catch')
    }
    expect(e.state).toBe('stun')
  })
})

describe('the new models: no two parts in one plane', () => {
  it('the Glitch Stalker', () => {
    const b = glitchStalkerParts()
    b.build()
    expect(coplanarOverlaps(b.partGeometries)).toBe(0)
  })

  it('the Saw Gyro and its blade', () => {
    for (const b of [sawGyroParts(), sawBladeParts()]) {
      b.build()
      expect(coplanarOverlaps(b.partGeometries)).toBe(0)
    }
  })

  it('the Sentinel Prototype', () => {
    const b = sentinelParts()
    b.build()
    expect(coplanarOverlaps(b.partGeometries)).toBe(0)
  })
})
