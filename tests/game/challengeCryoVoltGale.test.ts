// @vitest-environment jsdom
// The Cryo, Volt and Gale challenge mini-bosses (the Icebreaker Brute, the
// Arc Spider, the Storm Hornet Queen): nothing lands during the entrance,
// every blow only after a wind-up of over half a second with its area drawn
// on the floor first, every move turns up in a fight, each one's own rule
// (the shield, the webs, the drones' cap), and their models' faces (no
// z-fighting).

import { describe, expect, it, vi } from 'vitest'

// The blob shadow and the telegraph ring draw canvas textures (no 2D canvas
// under jsdom); plain textures stand in.
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import type { Mesh } from 'three'
import { generateMap, cellCenter, CELL } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { roomBox, eyeAt, EYE_CLEAR } from '@/game/sim/miniBoss/kit'
import { EYE_H } from '@/game/sim/constants'
import type { MiniBossSpec } from '@/game/sim/miniBoss/types'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import {
  ICEBREAKER_BRUTE, INTRO_T as BRUTE_INTRO, SLAM_TELE, BOULDER_TELE, SHIELD_TELE, SHIELD_T, SPIKE_R, SPIKE_TOP, ROCK_R, type BruteMem
} from '@/game/sim/miniBoss/icebreakerBrute'
import { ARC_SPIDER, INTRO_T as SPIDER_INTRO, PYLON_TELE, WEB_TELE, DASH_TELE, ARC_WARN, WEB_SLOW, type SpiderMem } from '@/game/sim/miniBoss/arcSpider'
import {
  STORM_HORNET_QUEEN, INTRO_T as QUEEN_INTRO, SUMMON_TELE, GUST_TELE, DIVE_TELE, DRONES_MAX, DRONE_FALL, HOVER, type QueenMem
} from '@/game/sim/miniBoss/stormHornetQueen'
import { icebreakerBruteParts } from '@/game/models/miniBoss/icebreakerBrute'
import { arcSpiderParts } from '@/game/models/miniBoss/arcSpider'
import { stormHornetQueenParts } from '@/game/models/miniBoss/stormHornetQueen'
import { weakSpotOf } from '@/game/data/weakspots'
import type { Enemy, World } from '@/game/sim/world'
import { coplanarOverlaps } from './coplanar'

interface Hit { t: number; state: string; attack: string; blockable: boolean }

/**
 * Fight `spec` for `secs` in a supply run's challenge room, Flux circling
 * its middle `orbit` m out at `speed` rad/s; `hurt` < 1 sets it to that share
 * of its health once the fight is on (its second phase). Logs every hit,
 * wind-up, floor telegraph (a marker, a cone) and whatever it asked of the
 * world (a slow, a shove, a drone).
 */
const fight = (spec: MiniBossSpec, secs: number, o: { hurt?: number; orbit?: number; speed?: number; seed?: number; each?: (e: Enemy, w: World, t: number) => void } = {}) => {
  const map = generateMap({ seed: o.seed ?? 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(spec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const hits: Hit[] = []
  const floor: number[] = []
  const slows: number[] = []
  const pulls: Array<{ t: number; speed: number }> = []
  const drones: Enemy[] = []
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const stub = () => {}
  let t = 0
  const w = {
    map, nav: createNav(map), time: 0,
    player: { x: cx + 3, z: cz, yaw: 0, pitch: 0 },
    combat: {}, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: () => floor.push(t) },
    shocks: { spawn: stub, spawnLinear: stub },
    hitPlayer: (_s: Enemy | null, _d: number, h: { blockable: boolean }) => {
      hits.push({ t, state: e.state, attack: e.attack, blockable: h.blockable })
      return 'hit'
    },
    slowPlayer: (mul: number) => slows.push(mul),
    pull: (_x: number, _z: number, speed: number) => pulls.push({ t, speed }),
    addEnemy: (d: Enemy) => { drones.push(d); w.enemies.push(d) },
    shake: stub, sfx: stub, fireEnemyShot: stub, lobShell: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
  } as unknown as World & { enemies: Enemy[] }
  startMiniBoss(e)
  const teles: Array<{ attack: string; dur: number; t: number }> = []
  const acts: string[] = []
  let teleFor = 0
  let coneOn = false
  const dt = 1 / 60
  const orbit = o.orbit ?? 3
  const speed = o.speed ?? 0.6
  for (let k = 0; k < secs / dt; k++) {
    t = k * dt
    w.time = t
    w.player.x = cx + Math.cos(t * speed) * orbit
    w.player.z = cz + Math.sin(t * speed) * orbit
    const was = e.state
    updateMiniBoss(w, e, dt)
    o.each?.(e, w, t)
    if (e.state === 'engage' && (o.hurt ?? 1) < 1 && e.hp === e.maxHp) e.hp = Math.round(e.maxHp * o.hurt!)
    if (was === 'tele') teleFor += dt
    if (was !== 'act' && e.state === 'act') {
      teles.push({ attack: e.attack, dur: teleFor, t })
      acts.push(e.attack)
    }
    if (e.state !== 'tele') teleFor = 0
    // A cone drawn on the floor counts as a floor telegraph from its first frame.
    const cone = (e.challenge!.mem as { cone?: Mesh | null }).cone
    const on = !!cone?.visible
    if (on && !coneOn) floor.push(t)
    coneOn = on
  }
  return { e, w, room, hits, teles, acts, floor, slows, pulls, drones }
}

/** The rules every mini-boss keeps (`miniBoss/types.ts`). */
const fair = (r: ReturnType<typeof fight>, intro: number) => {
  expect(r.acts.length).toBeGreaterThan(4)
  expect(r.hits.length).toBeGreaterThan(0)
  for (const h of r.hits) {
    // Nothing during its entrance.
    expect(h.t).toBeGreaterThan(intro)
    // Never in a wind-up; never without its area on the floor 0.6 s before.
    expect(h.state, `${h.attack} at ${h.t.toFixed(2)}`).not.toBe('tele')
    expect(r.floor.some(f => f <= h.t - 0.6 && f >= h.t - 5), `${h.attack} at ${h.t.toFixed(2)}`).toBe(true)
  }
  for (const x of r.teles) expect(x.dur, x.attack).toBeGreaterThanOrEqual(0.6)
}

describe('the registry', () => {
  it('holds the three built for Cryo, Volt and Gale, each its own weak spot', () => {
    expect(MINI_BOSSES.cryo).toBe(ICEBREAKER_BRUTE)
    expect(MINI_BOSSES.volt).toBe(ARC_SPIDER)
    expect(MINI_BOSSES.gale).toBe(STORM_HORNET_QUEEN)
    const map = generateMap({ seed: 77, rooms: 9, boss: false, challenge: true })
    for (const spec of [ICEBREAKER_BRUTE, ARC_SPIDER, STORM_HORNET_QUEEN] as MiniBossSpec[]) {
      expect(spec.todo).toBeUndefined()
      const e = createMiniBoss(spec, 8, 30, 30, map.rooms[map.challenge!.room]!)
      expect(e.offstage).toBe(true)
      expect(weakSpotOf(e)).toBe(spec.def.weak)
    }
    for (const x of [SLAM_TELE, BOULDER_TELE, SHIELD_TELE, PYLON_TELE, WEB_TELE, DASH_TELE, SUMMON_TELE, GUST_TELE, DIVE_TELE]) {
      expect(x).toBeGreaterThanOrEqual(0.6)
    }
  })
})

describe('the Icebreaker Brute', () => {
  it('lands nothing during its entrance, and every blow after a wind-up with its lane or ring on the floor', () => {
    // A slow Flux (a quick one walks out of every lane and ring).
    fair(fight(ICEBREAKER_BRUTE as MiniBossSpec, 60, { speed: 0.15 }), BRUTE_INTRO)
    fair(fight(ICEBREAKER_BRUTE as MiniBossSpec, 60, { hurt: 0.45, speed: 0.15, seed: 31337 }), BRUTE_INTRO)
  })

  it('slams up ice spikes, hurls a boulder and raises its shield; from half health the spikes fan out in three lanes', () => {
    const calm = fight(ICEBREAKER_BRUTE as MiniBossSpec, 60, { speed: 0.15 })
    for (const a of ['slam', 'boulder', 'shield']) expect(calm.acts, a).toContain(a)
    // The spikes hit in the slam itself; the boulder lands after its throw.
    expect(calm.hits.some(h => h.attack === 'slam' && h.state === 'act')).toBe(true)
    expect(calm.hits.some(h => h.attack === 'boulder' && h.state !== 'act')).toBe(true)
    expect(calm.hits.every(h => !h.blockable)).toBe(true)
    let lanes = 0
    fight(ICEBREAKER_BRUTE as MiniBossSpec, 40, {
      hurt: 0.45, each: (e) => { if (e.state === 'tele' && e.attack === 'slam') lanes = Math.max(lanes, (e.challenge!.mem as BruteMem).lanes.length) }
    })
    expect(lanes).toBe(3)
  })

  it('turns every shot from the front off its shield, never one from behind; a stun drops it', () => {
    const ai = ICEBREAKER_BRUTE.behaviour
    let checked = 0
    fight(ICEBREAKER_BRUTE as MiniBossSpec, 60, {
      each: (e) => {
        const m = e.challenge!.mem as BruteMem
        if (e.state !== 'act' || e.attack !== 'shield' || e.st > 0.1 || checked) return
        checked++
        const f = (d: number) => [e.x + Math.sin(e.yaw + d) * 6, e.z + Math.cos(e.yaw + d) * 6] as const
        expect(m.shieldUp).toBe(true)
        expect(ai.guarded!(e, m, ...f(0))).toBe(true)
        expect(ai.guarded!(e, m, ...f(0.8))).toBe(true)
        expect(ai.guarded!(e, m, ...f(Math.PI))).toBe(false)
        expect(ai.guarded!(e, m, ...f(Math.PI / 2 + 0.4))).toBe(false)
        // A full charge breaks it (the guard break stuns it): down it comes.
        ai.clear!({} as World, e, m)
        expect(ai.guarded!(e, m, ...f(0))).toBe(false)
      }
    })
    expect(checked).toBe(1)
    // Out of the shield it guards nothing.
    const r = fight(ICEBREAKER_BRUTE as MiniBossSpec, 6)
    expect(ai.guarded!(r.e, r.e.challenge!.mem as BruteMem, r.e.x, r.e.z + 5)).toBe(false)
    expect(SHIELD_T).toBeGreaterThan(2)
  })

  // Playtest: standing 2.5 m off it, a flat hard-edged cyan pane filled a
  // third of the view: a spike bursting up under Flux (the eye at 1.36 m is
  // inside a 1.67 m cone) and the boulder's last metre coming down on him.
  it("never draws a spike or its boulder round Flux's eye; they are drawn again once he is clear", () => {
    expect(SPIKE_TOP).toBeGreaterThan(EYE_H)
    let hidden = 0
    let shown = 0
    let rockCut = 0
    // Flux standing nearly still in its lanes and rings.
    fight(ICEBREAKER_BRUTE as MiniBossSpec, 60, {
      speed: 0.02, orbit: 2.5,
      each: (e, w) => {
        const m = e.challenge!.mem as BruteMem
        const ey = EYE_H
        for (const s of m.spikes) {
          const d = Math.hypot(s.x - w.player.x, s.z - w.player.z)
          if (s.obj.visible) {
            shown++
            // Drawn by him only while still too low to reach his eye (it bursts up next tick).
            if (d < SPIKE_R + EYE_CLEAR) expect(SPIKE_TOP * s.obj.scale.y).toBeLessThan(ey - EYE_CLEAR)
          } else hidden++
        }
        const r = m.rock
        if (r && m.bt >= 0) {
          const p = r.position
          const close = Math.hypot(p.x - w.player.x, p.z - w.player.z) < ROCK_R + EYE_CLEAR && Math.abs(p.y - ey) < ROCK_R + EYE_CLEAR
          if (close) {
            rockCut++
            expect(r.visible).toBe(false)
          }
        }
      }
    })
    expect(hidden).toBeGreaterThan(0)
    expect(shown).toBeGreaterThan(0)
    expect(rockCut).toBeGreaterThan(0)
  })
})

describe("a mini-boss's floor props round the eye (eyeAt)", () => {
  it("counts the eye in a prop's column (with its slack), not one beside or over it", () => {
    const w = { player: { x: 10, z: 10, yaw: 0, pitch: 0 } } as unknown as World
    expect(eyeAt(w, 10.2, 10, 0.34, 0, 1.67)).toBe(true)
    expect(eyeAt(w, 10 + 0.34 + EYE_CLEAR + 0.05, 10, 0.34, 0, 1.67)).toBe(false)
    // A short prop well under the eye; one on a floor below him.
    expect(eyeAt(w, 10, 10, 0.3, 0, 0.8)).toBe(false)
    expect(eyeAt(w, 10, 10, 0.34, -4, -2.33)).toBe(false)
    // Up on a platform, his eye goes with him.
    const up = { player: { x: 10, z: 10, y: 3, yaw: 0, pitch: 0 } } as unknown as World
    expect(eyeAt(up, 10, 10, 0.34, 3, 4.67)).toBe(true)
    expect(eyeAt(up, 10, 10, 0.34, 0, 1.67)).toBe(false)
  })
})

describe('the Arc Spider', () => {
  it('lands nothing during its entrance, and every blow after a wind-up with its lines or rings on the floor', () => {
    fair(fight(ARC_SPIDER as MiniBossSpec, 60), SPIDER_INTRO)
    fair(fight(ARC_SPIDER as MiniBossSpec, 60, { hurt: 0.45, speed: 0.15, seed: 31337 }), SPIDER_INTRO)
  })

  it('drops pylons, spits webs and skitters along the edge; the lightning is live only after its warning', () => {
    const calm = fight(ARC_SPIDER as MiniBossSpec, 60, { speed: 0.15 })
    for (const a of ['pylons', 'web', 'dash']) expect(calm.acts, a).toContain(a)
    for (const a of ['pylons', 'web']) expect(calm.hits.some(h => h.attack === a), a).toBe(true)
    const actAt = calm.teles.filter(x => x.attack === 'pylons').map(x => x.t)
    for (const h of calm.hits.filter(x => x.attack === 'pylons' && x.state === 'act')) {
      const from = Math.max(...actAt.filter(a => a <= h.t))
      expect(h.t - from).toBeGreaterThanOrEqual(ARC_WARN - 1e-6)
    }
    // From half health: three pylons, three lines.
    let lines = 0
    fight(ARC_SPIDER as MiniBossSpec, 40, {
      hurt: 0.45, each: (e) => { if (e.state === 'act' && e.attack === 'pylons') lines = Math.max(lines, (e.challenge!.mem as SpiderMem).lines.length) }
    })
    expect(lines).toBe(3)
  })

  it('leaves webs that slow Flux while he stands in them', () => {
    // Flux all but standing still: the blob lands on him.
    const r = fight(ARC_SPIDER as MiniBossSpec, 60, { speed: 0.05 })
    expect(r.acts).toContain('web')
    expect(r.slows.length).toBeGreaterThan(0)
    for (const s of r.slows) expect(s).toBe(WEB_SLOW)
  })

  it('dashes along the room\'s edge, its legs on the wall side', () => {
    let ends = 0
    fight(ARC_SPIDER as MiniBossSpec, 60, {
      speed: 0.15,
      each: (e) => {
        if (e.state !== 'recover' || e.attack !== 'dash' || e.st > 1 / 60 + 1e-6) return
        ends++
        const [x0, z0, x1, z1] = roomBox(e.challenge!.room, e.def.radius + 0.3)
        expect(Math.min(e.x - x0, x1 - e.x, e.z - z0, z1 - e.z)).toBeLessThan(0.35)
      }
    })
    expect(ends).toBeGreaterThan(0)
  })
})

describe('the Storm Hornet Queen', () => {
  it('lands nothing during its entrance, and every blow after a wind-up with its cone or ring on the floor', () => {
    fair(fight(STORM_HORNET_QUEEN as MiniBossSpec, 60), QUEEN_INTRO)
    fair(fight(STORM_HORNET_QUEEN as MiniBossSpec, 60, { hurt: 0.45, seed: 31337 }), QUEEN_INTRO)
  })

  it('calls drones, gusts Flux back and dives into its ring, stuck low after', () => {
    let low = 99
    const r = fight(STORM_HORNET_QUEEN as MiniBossSpec, 60, {
      speed: 0.15,
      each: (e) => { if (e.state === 'act' && e.attack === 'dive' && (e.challenge!.mem as QueenMem).stuck) low = Math.min(low, e.y) }
    })
    for (const a of ['summon', 'gust', 'dive']) expect(r.acts, a).toContain(a)
    for (const a of ['gust', 'dive']) expect(r.hits.some(h => h.attack === a && h.state === 'act'), a).toBe(true)
    // The gust shoves him away (a pull with a negative speed).
    expect(r.pulls.length).toBeGreaterThan(0)
    for (const p of r.pulls) expect(p.speed).toBeLessThan(0)
    // Stuck by its sting, well under its hover: its weak spot in reach.
    expect(low).toBeLessThan(HOVER - 1)
    expect(r.e.y).toBeGreaterThan(0.5)
  })

  it('never keeps more than its cap of drones, weak ones, and calls more as they fall', () => {
    let most = 0
    const r = fight(STORM_HORNET_QUEEN as MiniBossSpec, 90, {
      hurt: 0.45,
      each: (_e, w, t) => {
        const up = (w.enemies as Enemy[]).filter(d => d.kind === 'hornet' && d.state !== 'dead')
        most = Math.max(most, up.length)
        // Flux swats them now and then.
        if (Math.floor(t * 60) % (60 * 15) === 0) for (const d of up) { d.state = 'dead'; d.hp = 0 }
      }
    })
    expect(r.drones.length).toBeGreaterThan(DRONES_MAX)
    expect(most).toBeLessThanOrEqual(DRONES_MAX)
    for (const d of r.drones) expect(d.maxHp).toBeLessThan(STORM_HORNET_QUEEN.def.hp * 0.2)
  })
})

describe('the Storm Hornet Queen falling', () => {
  it('takes her drones down with her: they drop, then burst, never through a kill that pays', () => {
    let killedAt = -1
    let fell = 0
    const r = fight(STORM_HORNET_QUEEN as MiniBossSpec, 30, {
      each: (e, w, t) => {
        const up = (w.enemies as Enemy[]).filter(d => d.kind === 'hornet' && d.state !== 'dead')
        // The moment two drones are up, she falls (as the combat's kill leaves her).
        if (killedAt < 0 && up.length >= 2 && e.state === 'engage') {
          killedAt = t
          e.hp = 0
          e.state = 'dead'
          e.deathT = 0
        }
        if (killedAt >= 0 && t - killedAt < DRONE_FALL - 0.05) fell = Math.max(fell, up.filter(d => d.state === 'stun').length)
      }
    })
    expect(killedAt).toBeGreaterThan(0)
    expect(r.drones.length).toBeGreaterThanOrEqual(2)
    // Falling first (stunned: a Hornet Rotor sags to the floor), then gone.
    expect(fell).toBe(r.drones.length)
    for (const d of r.drones) {
      expect(d.state).toBe('dead')
      expect(d.hp).toBe(0)
    }
  })
})

describe('the models', () => {
  it('no two parts in one plane', () => {
    for (const b of [icebreakerBruteParts(), arcSpiderParts(), stormHornetQueenParts()]) {
      b.build()
      expect(coplanarOverlaps(b.partGeometries)).toBe(0)
    }
  })
})
