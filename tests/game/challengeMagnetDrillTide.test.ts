// @vitest-environment jsdom
// The Magnet, Drill and Tide challenge mini-bosses (the Lodestone Golem, the
// Burrow Wyrm, the Puffer Matriarch): nothing lands during the entrance,
// every blow only after a wind-up of over half a second with its area drawn
// on the floor first, every move turns up in a fight, each one's own rule
// (the pull you can walk out of, the wyrm out of reach underground and its
// body on the head's path, the mines' cap), and their models' faces (no
// z-fighting).

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
  LODESTONE_GOLEM, INTRO_T as GOLEM_INTRO, PULL_TELE, PULL_T, PULL_S, SLAM_TELE, FLING_TELE, FLING_FLIGHT, SCRAP_R, type LodeMem
} from '@/game/sim/miniBoss/lodestoneGolem'
import {
  BURROW_WYRM, BURROW_WYRM_AI, INTRO_T as WYRM_INTRO, DIVE_TELE, ERUPT_TELE, ERUPT_R, SPIT_TELE, SPIT_N, type WyrmMem
} from '@/game/sim/miniBoss/burrowWyrm'
import {
  PUFFER_MATRIARCH, PUFFER_MATRIARCH_AI, INTRO_T as PUFFER_INTRO, BOUNCE_TELE, MINE_TELE, MINE_CAP, MINE_ARM, MINE_R, JET_TELE, type PufferMem
} from '@/game/sim/miniBoss/pufferMatriarch'
import { lodestoneGolemParts, LODE_SCRAP } from '@/game/models/miniBoss/lodestoneGolem'
import { burrowWyrmParts, WYRM_SEGS, WYRM_GAP, WYRM_NECK } from '@/game/models/miniBoss/burrowWyrm'
import { pufferMatriarchParts } from '@/game/models/miniBoss/pufferMatriarch'
import { weakSpotOf } from '@/game/data/weakspots'
import { WALK_SPEED, PLAYER_R } from '@/game/sim/constants'
import type { Enemy, Shot, World } from '@/game/sim/world'
import { mulberry32 } from '@/game/world/rng'
import { coplanarOverlaps } from './coplanar'

/** Each fight is played on several seeds of its dice. */
const SEEDS = [1, 2, 3]

interface Hit { t: number; state: string; attack: string; blockable: boolean; x: number; z: number; ex: number; ez: number }
/** A player's shot at (x, y, z), for the modules' own shot test. */
const shotAt = (x: number, y: number, z: number): Shot => ({ x, y, z, radius: 0.12, kind: 'pellet' }) as unknown as Shot

interface Mark { t: number; x: number; z: number; r: number }

/**
 * Fight `spec` for `secs` in a supply run's challenge room, Flux circling
 * its middle 3 m out; `hurt` < 1 sets it to that share of its health once
 * the fight is on (its second phase). Logs every hit, wind-up (and whether
 * its area was on the floor during it: a marker, or the module's own floor
 * mesh by `drawn`), floor marker, shot, ring and pull.
 */
const fight = <M>(spec: MiniBossSpec<M>, secs: number, o: { hurt?: number; rng?: number; drawn?: (m: M) => boolean; each?: (e: Enemy, m: M, t: number, w: World) => void } = {}) => {
  // Its dice, seeded: a failure replays.
  const roll = vi.spyOn(Math, 'random').mockImplementation(mulberry32(o.rng ?? 1))
  const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(spec as MiniBossSpec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const hits: Hit[] = []
  const marks: Mark[] = []
  const shots: Array<{ t: number; state: string; attack: string }> = []
  const rings: Array<{ t: number; state: string; attack: string; r: number }> = []
  const pulls: Array<{ t: number; speed: number; dur: number }> = []
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const stub = () => {}
  let t = 0
  const w = {
    map, nav: createNav(map), time: 0,
    player: { x: cx + 3, z: cz, yaw: 0, pitch: 0 },
    combat: {}, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: (x: number, z: number, r: number) => marks.push({ t, x, z, r }) },
    shocks: { spawn: stub, spawnLinear: stub },
    hitPlayer: (_s: Enemy | null, _d: number, h: { blockable: boolean; fromX: number; fromZ: number }) => {
      hits.push({ t, state: e.state, attack: e.attack, blockable: h.blockable, x: h.fromX, z: h.fromZ, ex: e.x, ez: e.z })
      return 'hit'
    },
    pull: (_x: number, _z: number, speed: number, dur: number) => pulls.push({ t, speed, dur }),
    fireEnemyShot: () => shots.push({ t, state: e.state, attack: e.attack }),
    spawnRing: (_e: Enemy, _x: number, _z: number, _sp: number, r: number) => rings.push({ t, state: e.state, attack: e.attack, r }),
    shake: stub, sfx: stub, lobShell: stub, spawnWave: stub, fireOrb: stub
  } as unknown as World
  startMiniBoss(e)
  const teles: Array<{ attack: string; dur: number; floor: boolean; t: number }> = []
  const acts: string[] = []
  let teleFor = 0
  let floor = false
  const dt = 1 / 60
  for (let k = 0; k < secs / dt; k++) {
    t = k * dt
    w.player.x = cx + Math.cos(t * 0.6) * 3
    w.player.z = cz + Math.sin(t * 0.6) * 3
    const was = e.state
    const marked = marks.length
    updateMiniBoss(w, e, dt)
    syncMiniBoss(e, 1, t)
    const mem = e.challenge!.mem as M
    if (e.state === 'engage' && o.hurt && o.hurt < 1 && e.hp === e.maxHp) e.hp = Math.round(e.maxHp * o.hurt)
    if (was === 'tele') teleFor += dt
    if (e.state === 'tele' && (marks.length > marked || o.drawn?.(mem))) floor = true
    if (was !== 'act' && e.state === 'act') {
      teles.push({ attack: e.attack, dur: teleFor, floor, t })
      acts.push(e.attack)
    }
    if (e.state !== 'tele') { teleFor = 0; floor = false }
    o.each?.(e, mem, t, w)
  }
  roll.mockRestore()
  return { e, hits, marks, shots, rings, pulls, teles, acts, room }
}

/** The rules every mini-boss keeps: a harmless entrance, wind-ups of over
 *  half a second, direct blows only in 'act', each blow's area on the floor
 *  for its wind-up. */
const fair = (r: ReturnType<typeof fight>, intro: number, harmless: readonly string[] = []) => {
  for (const h of r.hits) expect(h.t).toBeGreaterThan(intro)
  for (const x of r.teles) {
    expect(x.dur, x.attack).toBeGreaterThanOrEqual(0.6)
    if (!harmless.includes(x.attack)) expect(x.floor, `${x.attack} at ${x.t.toFixed(2)}`).toBe(true)
  }
  for (const s of r.shots) expect(s.state).toBe('act')
  for (const g of r.rings) expect(g.state).toBe('act')
}

describe('the Lodestone Golem (Magnet)', () => {
  const drawn = (m: LodeMem) => m.fieldOn

  it('lands nothing during its entrance, and every blow only after a wind-up drawn on the floor', () => {
    for (const rng of SEEDS) {
      const r = fight(LODESTONE_GOLEM, 50, { rng, drawn })
      expect(r.acts.length).toBeGreaterThan(4)
      // Its blows: the scrap it throws, the shockwave it sends out.
      expect(r.hits.length + r.rings.length).toBeGreaterThan(0)
      fair(r, GOLEM_INTRO)
      for (const h of r.hits) expect(h.state).toBe('act')
      for (const c of [PULL_TELE, SLAM_TELE, FLING_TELE]) expect(c).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('pulls (walkable out of) and slams a shockwave after every pull; flings scrap only into marked rings', () => {
    for (const rng of SEEDS) {
      const r = fight(LODESTONE_GOLEM, 60, { rng, drawn })
      expect(r.acts).toContain('pull')
      expect(r.acts).toContain('slam')
      expect(r.acts).toContain('fling')
      // Every pull drags for PULL_T under Flux's walk; the slam follows each.
      expect(r.pulls.length).toBe(r.acts.filter(a => a === 'pull').length)
      for (const p of r.pulls) {
        expect(p.speed).toBeLessThan(WALK_SPEED)
        expect(p.dur).toBe(PULL_T)
      }
      r.acts.forEach((a, i) => { if (a === 'pull' && i + 1 < r.acts.length) expect(r.acts[i + 1]).toBe('slam') })
      expect(r.rings.length).toBe(r.acts.filter(a => a === 'slam').length)
      expect(PULL_S).toBeLessThan(WALK_SPEED)
      // A piece of scrap lands only in a ring marked a whole wind-up before.
      for (const h of r.hits.filter(x => x.attack === 'fling')) {
        expect(r.marks.some(m => Math.hypot(m.x - h.x, m.z - h.z) < 0.01 && m.r === SCRAP_R && h.t - m.t >= FLING_TELE + FLING_FLIGHT - 0.05)).toBe(true)
      }
    }
  })

  it('flings five under half health, and its scrap grows back', () => {
    let most = 0
    let gone = 0
    const r = fight(LODESTONE_GOLEM, 60, {
      hurt: 0.45, drawn,
      each: (e, m) => {
        if (e.state === 'tele' && e.attack === 'fling') most = Math.max(most, m.spots.length)
        gone = Math.max(gone, m.chunks.filter(c => c.st === 'gone').length)
      }
    })
    expect(r.acts).toContain('fling')
    expect(most).toBe(5)
    expect(gone).toBeGreaterThan(0)
    const m = r.e.challenge!.mem as LodeMem
    expect(m.chunks.length).toBe(LODE_SCRAP)
  })
})

describe('the Burrow Wyrm (Drill)', () => {
  const drawn = (m: WyrmMem) => m.fanOn

  it('lands nothing during its entrance, and every blow only after a wind-up drawn on the floor', () => {
    for (const rng of SEEDS) {
      const r = fight(BURROW_WYRM, 50, { rng, drawn })
      expect(r.acts.length).toBeGreaterThan(4)
      expect(r.hits.length + r.shots.length).toBeGreaterThan(0)
      // The dive hurts no one (it is the way down); the eruption is its blow.
      fair(r, WYRM_INTRO, ['dive'])
      for (const h of r.hits) expect(h.state).toBe('act')
      for (const c of [DIVE_TELE, ERUPT_TELE, SPIT_TELE]) expect(c).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('dives out of reach, erupts in a ring marked first, spits a fan of rocks', () => {
    let reachableUnder = false
    let buriedInTravel = true
    const r = fight(BURROW_WYRM, 60, {
      drawn,
      each: (e) => {
        if (e.state === 'act' && e.attack === 'dive' && !e.buried) buriedInTravel = false
        if (e.state === 'engage' && e.buried) reachableUnder = true
      }
    })
    expect(r.acts).toContain('dive')
    expect(r.acts).toContain('erupt')
    expect(r.acts).toContain('spit')
    expect(buriedInTravel).toBe(true)
    expect(reachableUnder).toBe(false)
    // Every dive comes up as an eruption.
    r.acts.forEach((a, i) => { if (a === 'dive' && i + 1 < r.acts.length) expect(r.acts[i + 1]).toBe('erupt') })
    // It erupts only out of a ring marked a whole wind-up before.
    for (const h of r.hits.filter(x => x.attack === 'erupt')) {
      expect(r.marks.some(m => Math.hypot(m.x - h.x, m.z - h.z) < 0.01 && m.r === ERUPT_R && h.t - m.t >= ERUPT_TELE - 0.05)).toBe(true)
    }
    // A fan is SPIT_N rocks.
    const spits = r.acts.filter(a => a === 'spit').length
    expect(r.shots.length).toBe(spits * SPIT_N)
  })

  it('drags its body along the path its head took: into the floor and out again', () => {
    let worst = 0
    let checked = 0
    let underAtTravelEnd = true
    let sawUp = false
    let surfaced = 0
    for (const rng of [1, 2, 3, 4, 5, 6]) fight(BURROW_WYRM, 40, {
      rng, drawn,
      each: (e, m) => {
        const segs = m.pose.segs
        if (e.state === 'engage') {
          // Surfaced and slithering: each segment a gap behind the one ahead.
          for (let i = 1; i < WYRM_SEGS; i++) {
            const a = segs[i - 1]!
            const b = segs[i]!
            worst = Math.max(worst, Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - WYRM_GAP))
            checked++
          }
          const s0 = segs[0]!
          expect(Math.hypot(s0.x, s0.z)).toBeLessThanOrEqual(WYRM_NECK + 0.05)
          // Out of the hole it came up from, all of it lies on the floor.
          if (segs.every(s => s.y > 0.1)) surfaced++
        }
        // At the end of the tunnelling, every segment is under the floor.
        if (e.state === 'tele' && e.attack === 'erupt' && e.st < 0.02) {
          for (const s of segs) if (s.y + 0.5 > 0) underAtTravelEnd = false
        }
        if (e.state === 'act' && e.attack === 'erupt' && m.pose.head.y > 2.5) sawUp = true
      }
    })
    expect(checked).toBeGreaterThan(100)
    expect(worst).toBeLessThan(0.2)
    expect(underAtTravelEnd).toBe(true)
    expect(sawUp).toBe(true)
    expect(surfaced).toBeGreaterThan(60)
  })

  it('takes damage only in its head: its armoured segments catch shots with a TINK', () => {
    let tried = 0
    fight(BURROW_WYRM, 30, {
      drawn,
      each: (e, m, _t, w) => {
        if (tried >= 20 || e.state !== 'engage' || !m.pose.segs.every(q => q.y > 0.1)) return
        tried++
        const hp = e.hp
        const cy = Math.cos(e.yaw)
        const sy = Math.sin(e.yaw)
        for (const k of [2, 5, WYRM_SEGS - 1]) {
          const q = m.pose.segs[k]!
          const x = e.root.position.x + q.x * cy + q.z * sy
          const z = e.root.position.z - q.x * sy + q.z * cy
          expect(BURROW_WYRM_AI.shot!(w, e, m, shotAt(x, q.y, z)), `segment ${k}`).toBe('catch')
        }
        expect(e.hp).toBe(hp)
        // A shot at its head goes on to its body (its hit and its weak spot).
        expect(BURROW_WYRM_AI.shot!(w, e, m, shotAt(e.x, m.pose.head.y, e.z))).toBeUndefined()
        // One in the air beside it is no business of its armour.
        expect(BURROW_WYRM_AI.shot!(w, e, m, shotAt(e.x + 9, 1, e.z + 9))).toBeUndefined()
      }
    })
    expect(tried).toBeGreaterThan(5)
  })
})

describe('the Puffer Matriarch (Tide)', () => {
  const drawn = (m: PufferMem) => m.arcOn

  /** A hit from one of her mines (not from her body or her jet). */
  const mineHit = (h: Hit) => Math.hypot(h.x - h.ex, h.z - h.ez) > 0.3

  it('lands nothing during her entrance, and every blow only after a wind-up drawn on the floor', () => {
    for (const rng of SEEDS) {
      const r = fight(PUFFER_MATRIARCH, 50, { rng, drawn })
      expect(r.acts.length).toBeGreaterThan(4)
      expect(r.hits.length).toBeGreaterThan(0)
      // The mines' cough hurts no one (the mines do, later, over their own ring).
      fair(r, PUFFER_INTRO, ['mines'])
      for (const h of r.hits) if (!mineHit(h)) expect(h.state).toBe('act')
      for (const c of [BOUNCE_TELE, MINE_TELE, JET_TELE]) expect(c).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('bounces her drawn route, hoses her drawn arc, and never has more than three mines out', () => {
    let most = 0
    let routeMarks = 0
    const r = fight(PUFFER_MATRIARCH, 70, {
      drawn,
      each: (e, m) => {
        most = Math.max(most, m.mines.length)
        if (e.state === 'tele' && e.attack === 'bounce') routeMarks = Math.max(routeMarks, m.route.length / 2 - 1)
      }
    })
    expect(r.acts).toContain('bounce')
    expect(r.acts).toContain('mines')
    expect(r.acts).toContain('jet')
    expect(most).toBeGreaterThan(0)
    expect(most).toBeLessThanOrEqual(MINE_CAP)
    expect(routeMarks).toBeGreaterThanOrEqual(2)
    // A mine bursts only over the ring it drew as it stopped, MINE_ARM before.
    for (const h of r.hits.filter(mineHit)) {
      expect(r.marks.some(m => Math.hypot(m.x - h.x, m.z - h.z) < 0.01 && m.r === MINE_R && Math.abs(h.t - m.t - MINE_ARM) < 0.05)).toBe(true)
    }
  })

  it('lets Flux pop a mine early with a shot: a harmless puff, no reward, and its puffer hatches again', () => {
    let popped = -1
    let poppedAt = 0
    let back = false
    let hpBefore = 0
    let machines = 0
    fight(PUFFER_MATRIARCH, 60, {
      drawn,
      each: (e, m, t, w) => {
        machines = Math.max(machines, w.enemies.length)
        if (popped < 0 && m.mines.length > 0) {
          const b = m.mines[0]!
          const n = m.mines.length
          hpBefore = e.hp
          // A shot well wide of it flies on.
          expect(PUFFER_MATRIARCH_AI.shot!(w, e, m, shotAt(b.x + 3, 1.1, b.z + 3))).toBeUndefined()
          expect(PUFFER_MATRIARCH_AI.shot!(w, e, m, shotAt(b.x, 1.1, b.z))).toBe('catch')
          expect(m.mines.length).toBe(n - 1)
          expect(e.hp).toBe(hpBefore)
          popped = b.slot
          poppedAt = t
          expect(m.escorts[popped]!.st).toBe('gone')
        }
        if (popped >= 0 && !back && m.escorts[popped]!.st === 'swim') {
          back = true
          expect(t - poppedAt).toBeGreaterThan(4)
        }
      }
    })
    expect(popped).toBeGreaterThanOrEqual(0)
    expect(back).toBe(true)
    // Her mines are hers, never machines of their own: nothing to farm.
    expect(machines).toBe(1)
  })

  it('stays inside her room as she bounces, and is solid to Flux', () => {
    // The room the fight runs in (the same seed).
    const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
    const r0 = map.rooms[map.challenge!.room]!
    let out = 0
    const r = fight(PUFFER_MATRIARCH, 40, {
      drawn,
      each: (e) => {
        const [x0, z0, x1, z1] = [r0.x0 * CELL, r0.z0 * CELL, (r0.x0 + r0.w) * CELL, (r0.z0 + r0.h) * CELL]
        if (e.x < x0 || e.x > x1 || e.z < z0 || e.z > z1) out++
      }
    })
    expect(out).toBe(0)
    expect(r.e.def.fly).toBe(0)
    expect(r.e.def.radius).toBeGreaterThan(PLAYER_R)
  })
})

describe('their registry lines, weak spots and models', () => {
  it('stand in the registry under their own sectors, built for real', () => {
    expect(MINI_BOSSES.magnet).toBe(LODESTONE_GOLEM)
    expect(MINI_BOSSES.drill).toBe(BURROW_WYRM)
    expect(MINI_BOSSES.tide).toBe(PUFFER_MATRIARCH)
    for (const s of [LODESTONE_GOLEM, BURROW_WYRM, PUFFER_MATRIARCH] as MiniBossSpec[]) {
      expect(s.todo).toBeUndefined()
      const map = generateMap({ seed: 77, rooms: 9, boss: false, challenge: true })
      const e = createMiniBoss(s, 8, 30, 30, map.rooms[map.challenge!.room]!)
      expect(weakSpotOf(e)).toBe(s.def.weak)
      expect(e.maxHp).toBeGreaterThan(s.def.hp)
    }
  })

  it('no two parts of any of them in one plane', () => {
    for (const parts of [lodestoneGolemParts(), burrowWyrmParts(), pufferMatriarchParts()]) {
      parts.build()
      expect(coplanarOverlaps(parts.partGeometries)).toBe(0)
    }
  })
})
