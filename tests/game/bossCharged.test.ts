// @vitest-environment jsdom
// #188 Every Core Master played the same three attacks. Now each also has two
// charged ones on a count: about every 5th attack a CHARGED BLAST (it stops in
// a shield bubble — untouchable — while the ring of its reach fills on the
// floor, then bursts: only running out of the ring saves Flux, no shield or
// slide does), and, rarer than any of its own patterns, a HOMING SALVO
// (missiles that turn after him: a block takes one whole, a perfect block
// sends it back, a slide through it breaks its lock and it flies on into a
// wall; it burns out after a few seconds). The tutorial's Master keeps both
// for phase 2.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/fx/markers', async (orig) => {
  const { Mesh, Group } = await import('three')
  return { ...(await orig<object>()), makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import { createBoss, startBossIntro, updateBoss, bossSpecial, blastCommitR, BLAST_CHARGE, BLAST_ONBOARD } from '@/game/sim/bosses'
import { CombatSystem, MISSILE_LIFE, type CombatHost } from '@/game/sim/combat'
import { Mission, type MissionSetup } from '@/game/sim/mission'
import { baseStats } from '@/game/sim/stats'
import { createInput, consumeEdges } from '@/game/engine/input'
import { BOSSES } from '@/game/data/bosses'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { PLAYER_R } from '@/game/sim/constants'
import type { BossId } from '@/game/models/bosses'
import type { Enemy, Shot, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}
const IDS = Object.keys(BOSSES) as BossId[]

describe('the cadence', () => {
  it('a charged blast about every 5th attack, from the first count on', () => {
    for (const id of IDS) {
      const def = BOSSES[id]
      expect(def.blast.every, id).toBeGreaterThanOrEqual(4)
      expect(def.blast.every, id).toBeLessThanOrEqual(6)
      const at: number[] = []
      for (let n = 1; n <= 30; n++) if (bossSpecial(def, n, false, false) === 'chargedBlast') at.push(n)
      expect(at[0], id).toBe(def.blast.every)
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!, id).toBe(def.blast.every)
    }
  })

  it('the homing salvo comes rarer than any one of the Master\'s own patterns (the cone volley stays common)', () => {
    for (const id of IDS) {
      const def = BOSSES[id]
      for (const phase2 of [false, true]) {
        const own = phase2 ? def.patterns.length + def.patterns2.length : def.patterns.length
        let homing = 0
        let plain = 0
        const N = 840
        for (let n = 1; n <= N; n++) {
          const sp = bossSpecial(def, n, phase2, false)
          if (sp === 'homingSalvo') homing++
          else if (!sp) plain++
        }
        expect(homing, `${id} phase ${phase2 ? 2 : 1}: some salvos`).toBeGreaterThan(0)
        expect(homing, `${id} phase ${phase2 ? 2 : 1}`).toBeLessThan(plain / own)
      }
    }
  })

  it('the Masters do not all play the same: the blast reach and the salvo differ', () => {
    expect(new Set(IDS.map(id => BOSSES[id].blast.r)).size).toBeGreaterThan(3)
    expect(new Set(IDS.map(id => `${BOSSES[id].homing.n}/${BOSSES[id].homing.turn}`)).size).toBeGreaterThan(4)
  })

  it('the tutorial\'s Master keeps both for phase 2', () => {
    const def = BOSSES.scrapper
    for (let n = 1; n <= 40; n++) expect(bossSpecial(def, n, false, true)).toBeNull()
    expect(bossSpecial(def, def.blast.every, true, true)).toBe('chargedBlast')
  })
})

// ─── The blast on the real AI ────────────────────────────────────────────────

const field = (): MapData => {
  const W = 40
  return { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
}

const arena = (e: Enemy, dist: number) => {
  const map = field()
  const hits: Array<{ dmg: number; o: { blockable: boolean; kind: string; blast?: boolean } }> = []
  const missiles: number[] = []
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 60, z: 30 + dist, yaw: Math.PI, pitch: 0, y: 0 },
    combat: { iframes: 0, charging: false, charge: 0, hp: 100, maxHp: 100 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: vi.fn() }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { chargeTimeMul: 1 },
    hitStop: 0, shake: noop, sfx: noop, pull: noop, addEnemy: noop, skyFlash: noop,
    fireEnemyShot: noop, fireOrb: noop, lobShell: noop, spawnWave: noop, spawnRing: noop,
    fireMissile: (_e: Enemy, _x: number, _y: number, _z: number, _dx: number, _dz: number, _sp: number, turn: number) => { missiles.push(turn) },
    hitPlayer: (_s: Enemy | null, dmg: number, o: { blockable: boolean; kind: string; blast?: boolean }) => { hits.push({ dmg, o }); return 'hit' }
  } as unknown as World
  return { w, hits, missiles }
}

/** A Master one attack short of its blast (or salvo), engaged and ready. */
const due = (id: BossId, dist: number, which: 'chargedBlast' | 'homingSalvo') => {
  const e = createBoss(id, 3, 60, 30, 0)
  const a = arena(e, dist)
  startBossIntro(e)
  e.state = 'engage'
  e.st = 0
  e.cd = 0
  e.bossN = which === 'chargedBlast' ? BOSSES[id].blast.every - 1 : 2
  return { e, ...a }
}

const run = (w: World, e: Enemy, s: number, each?: () => void): void => {
  for (let i = 0; i < s / DT; i++) {
    w.time += DT
    updateBoss(w, e, DT, null)
    each?.()
  }
}

describe('the charged blast', () => {
  it('is untouchable in its bubble through the charge, and only then', () => {
    const { e, w } = due('blazeMaster', 3, 'chargedBlast')
    run(w, e, 0.05)
    expect(e.attack).toBe('chargedBlast')
    let shielded = 0
    run(w, e, 0.4 + BLAST_CHARGE + 0.3, () => { if ((e.bossShield ?? 0) > 0) shielded += DT })
    expect(shielded).toBeGreaterThan(BLAST_CHARGE - 0.1)
    expect(shielded).toBeLessThan(BLAST_CHARGE + 0.1)
    expect(e.bossShield ?? 0).toBe(0)
    // The ring of its whole reach on the floor, for the whole charge, in its colour
    const spawn = (w.markers.spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.find(c => c[2] === BOSSES.blazeMaster.blast.r)
    expect(spawn?.[3]).toBeCloseTo(BLAST_CHARGE, 5)
  })

  it('shots TINK off the bubble: no damage while it holds', () => {
    const { e, w } = due('frostMaster', 3, 'chargedBlast')
    const c = new CombatSystem({ ...w, stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 }, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, lessonShield: () => false } as unknown as World & CombatHost)
    run(w, e, 1)
    expect(e.bossShield ?? 0).toBeGreaterThan(0)
    const hp = e.hp
    c.damageEnemy(e, 50, { crit: false, charge: 0, fromX: 60, fromZ: 33, x: e.x, y: 1, z: e.z, color: '#fff' })
    expect(e.hp).toBe(hp)
    run(w, e, BLAST_CHARGE + 1)
    c.damageEnemy(e, 50, { crit: false, charge: 0, fromX: 60, fromZ: 33, x: e.x, y: 1, z: e.z, color: '#fff' })
    expect(e.hp).toBeLessThan(hp)
  })

  it('hurts only inside its radius, as a blast neither shield nor slide takes', () => {
    for (const id of ['blazeMaster', 'tideMaster', 'drillMaster'] as BossId[]) {
      const r = BOSSES[id].blast.r
      const inside = due(id, blastCommitR(BOSSES[id]) * 0.7, 'chargedBlast')
      // Held in place (the AI's own strafe is not the point here)
      run(inside.w, inside.e, BLAST_CHARGE + 1.2, () => { inside.w.player.x = 60; inside.w.player.z = inside.e.z + blastCommitR(BOSSES[id]) * 0.7 })
      const blasts = inside.hits.filter(h => h.o.blast)
      expect(blasts, id).toHaveLength(1)
      expect(blasts[0]!.o.blockable).toBe(false)
      // Committed with him inside, then he runs clear of the ring
      const outside = due(id, 2, 'chargedBlast')
      run(outside.w, outside.e, 0.05)
      expect(outside.e.attack).toBe('chargedBlast')
      run(outside.w, outside.e, BLAST_CHARGE + 1.2, () => { outside.w.player.x = 60; outside.w.player.z = outside.e.z + r + PLAYER_R + 0.6 })
      expect(outside.hits.filter(h => h.o.blast), id).toHaveLength(0)
    }
  })

  it('is never started with Flux out of its ring: it stays due, the boss closes in, and it fires once he is inside', () => {
    for (const id of ['blazeMaster', 'frostMaster', 'voltMaster'] as BossId[]) {
      const def = BOSSES[id]
      const far = blastCommitR(def) + 3
      const { e, w } = due(id, far, 'chargedBlast')
      const n = e.bossN!
      const seen: string[] = []
      // He backs off to keep `far` away as it comes on: never inside
      for (let i = 0; i < 6 / DT; i++) {
        const was = e.state
        w.time += DT
        updateBoss(w, e, DT, null)
        w.player.x = e.x
        w.player.z = e.z + far
        if (was === 'engage' && e.state === 'tele') seen.push(e.attack)
        if (e.state === 'engage') e.cd = Math.min(e.cd, 0)
      }
      expect(seen.length, id).toBeGreaterThan(0) // it still fights meanwhile
      expect(seen, id).not.toContain('chargedBlast')
      expect(e.bossN, `${id}: the count waits`).toBe(n)
      // He steps in: the next attack is the blast
      const start = e.attack
      let blast = false
      for (let i = 0; i < 6 / DT && !blast; i++) {
        w.time += DT
        updateBoss(w, e, DT, null)
        w.player.x = e.x
        w.player.z = e.z + blastCommitR(def) * 0.6
        if (e.state === 'engage') e.cd = Math.min(e.cd, 0)
        if (e.attack === 'chargedBlast') blast = true
      }
      expect(blast, `${id} (after ${start})`).toBe(true)
    }
  })

  it('while its blast waits, it walks in toward him', () => {
    const def = BOSSES.blazeMaster
    const { e, w } = due('blazeMaster', 9, 'chargedBlast')
    e.cd = 99 // no attack: just its footwork
    w.player.x = 60
    run(w, e, 3, () => { e.cd = 99 })
    expect(Math.hypot(w.player.x - e.x, w.player.z - e.z)).toBeLessThan(blastCommitR(def))
  })

  it('the tutorial\'s Master charges longer', () => {
    const { e, w } = due('scrapper', 3, 'chargedBlast')
    e.onboard = true
    e.phase2 = true
    let shielded = 0
    run(w, e, 0.4 + BLAST_CHARGE * BLAST_ONBOARD + 0.3, () => { if ((e.bossShield ?? 0) > 0) shielded += DT })
    expect(shielded).toBeGreaterThan(BLAST_CHARGE * BLAST_ONBOARD - 0.1)
  })

  it('every Master fires its own salvo when its count comes', () => {
    for (const id of IDS) {
      const { e, w, missiles } = due(id, 8, 'homingSalvo')
      run(w, e, 3)
      expect(missiles, id).toHaveLength(BOSSES[id].homing.n)
      expect(missiles.every(t => t === BOSSES[id].homing.turn), id).toBe(true)
    }
  })
})

// ─── The homing missile in flight ────────────────────────────────────────────

const flight = (reply: 'hit' | 'block' | 'parry' | 'miss', wallAt = 40) => {
  const W = 40
  const cell = new Uint8Array(W * W).fill(1)
  // A wall across the far side (row `wallAt`), a clear field otherwise
  if (wallAt < W) for (let i = 0; i < W; i++) cell[wallAt * W + i] = 0
  const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], doors: [] } as unknown as MapData
  const e = createBoss('magnetMaster', 3, 30, 20, 0)
  const replies: string[] = []
  const opts: Array<{ noChip?: boolean }> = []
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 30, z: 40, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 0, charging: false, charge: 0, slideT: 0 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0, onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop, spawnWave: noop, spawnRing: noop,
    hitPlayer: (_e: Enemy | null, _d: number, o: { noChip?: boolean }) => { replies.push(reply); opts.push(o); return reply },
    shake: noop, sfx: noop, lessonShield: () => false
  } as unknown as World & CombatHost
  const c = new CombatSystem(w)
  return { c, w, e, replies, opts }
}

const missileOf = (c: CombatSystem): Shot | undefined => c.shots.find(s => s.active && s.missile)

describe('the homing missile', () => {
  it('turns after Flux at no more than its turn rate', () => {
    const { c, w, e } = flight('hit')
    w.player.x = 40 // off to the side: it must turn
    c.fireMissile(e, e.x, 1.6, e.z, 0, 1, 9, 2, 10, '#5a8cff')
    const s = missileOf(c)!
    let prev = Math.atan2(s.vx, s.vz)
    let turned = 0
    for (let i = 0; i < 30; i++) {
      c.update(DT)
      const a = Math.atan2(s.vx, s.vz)
      expect(Math.abs(a - prev)).toBeLessThanOrEqual(2 * DT + 1e-6)
      turned += a - prev
      prev = a
    }
    expect(turned).toBeGreaterThan(0.3) // it does turn toward him (he is ~0.46 rad off its nose)
  })

  it('a block takes it whole — destroyed, with no chip damage asked for', () => {
    const { c, e, opts } = flight('block')
    c.fireMissile(e, e.x, 1.6, e.z, 0, 1, 9, 2, 10, '#5a8cff')
    for (let i = 0; i < 400 && !opts.length; i++) c.update(DT)
    expect(opts[0]?.noChip).toBe(true)
    c.update(DT)
    expect(missileOf(c)).toBeUndefined()
  })

  it('a perfect block sends it back (no longer a missile after Flux)', () => {
    const { c, e, replies } = flight('parry')
    c.fireMissile(e, e.x, 1.6, e.z, 0, 1, 9, 2, 10, '#5a8cff')
    for (let i = 0; i < 400 && !replies.length; i++) c.update(DT)
    expect(replies).toEqual(['parry'])
    expect(missileOf(c)).toBeUndefined()
    expect(c.shots.some(s => s.active && s.owner === 'player')).toBe(true)
  })

  it('slid through, it loses its lock, flies straight on and dies on the wall', () => {
    const { c, w, e, replies } = flight('miss', 15)
    // Flux in the way, then side-stepping out of its line as he slides
    w.player.z = 26
    ;(w.combat as { slideT: number }).slideT = 0.28
    c.fireMissile(e, e.x, 1.6, e.z, 0, 1, 9, 2, 10, '#5a8cff')
    const s = missileOf(c)!
    for (let i = 0; i < 200 && !s.lost; i++) c.update(DT)
    expect(replies.length).toBeGreaterThan(0)
    expect(s.lost).toBe(true)
    expect(s.homePlayer).toBe(false)
    const dir = Math.atan2(s.vx, s.vz)
    ;(w.combat as { slideT: number }).slideT = 0
    w.player.x = 10 // it no longer follows him
    const n = replies.length
    for (let i = 0; i < 20 && s.active; i++) {
      c.update(DT)
      if (s.active) expect(Math.atan2(s.vx, s.vz)).toBeCloseTo(dir, 6)
    }
    for (let i = 0; i < 200 && s.active; i++) c.update(DT)
    expect(s.active).toBe(false) // the wall at row 15 (z = 45 m) stopped it
    expect(replies.length).toBe(n) // and it never touched him again
  })

  it('burns out after a few seconds', () => {
    const { c, w, e } = flight('miss')
    w.player.x = 30
    w.player.z = 21.5 // circling him forever is not an option
    ;(w.combat as { slideT: number }).slideT = 0
    c.fireMissile(e, e.x, 1.6, e.z + 2, 1, 0, 6, 0.5, 10, '#5a8cff')
    const s = missileOf(c)!
    let t = 0
    while (s.active && t < 10) { c.update(DT); t += DT }
    expect(s.active).toBe(false)
    expect(t).toBeLessThanOrEqual(MISSILE_LIFE + DT)
  })
})

// ─── The mission's shield and slide against them ─────────────────────────────

const mission = () => {
  const sector = SECTORS[0]!
  const setup: MissionSetup = { sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters, stats: baseStats() }
  const input = createInput()
  const m = new (Mission as unknown as new (s: MissionSetup, i: typeof input) => Mission)(setup, input)
  const W = 24
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const mid = (W / 2) * CELL
  m.map = map
  m.nav = createNav(map)
  m.player = {
    x: mid, z: mid, px: mid, pz: mid, vx: 0, vz: 0, yaw: 0, pitch: 0, path: null, bob: 0, bobAmp: 0,
    y: 0, py: 0, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: 0, mantle: 0, mx: 0, mz: 0
  }
  m.fx = { emit: noop, sparks: noop } as unknown as Mission['fx']
  ;(m as unknown as { vm: unknown }).vm = { barrier: { impact: noop } }
  ;(m as unknown as { firePellet: () => void }).firePellet = noop
  ;(m as unknown as { activePellets: () => number }).activePellets = () => 0
  hud.phase = 'play'
  const step = () => {
    ;(m as unknown as { updatePlayer(dt: number, first: boolean): void }).updatePlayer(DT, true)
    consumeEdges(input)
    m.time += DT
    m.player.x = m.player.z = mid
  }
  const block = (held: number) => {
    input.blockHeld = true
    input.blockPressed = true
    step()
    for (let i = 0; i < Math.round(held / DT); i++) step()
  }
  const src = { x: mid, z: mid - 6, state: 'act', st: 0, stunT: 0, ring: { visible: true }, flash: 0 } as unknown as Enemy
  return { m, block, src }
}

describe('the mission', () => {
  it('a held block takes a homing missile whole: no damage', () => {
    const { m, block, src } = mission()
    block(1)
    const hp = m.combat.hp
    expect(m.hitPlayer(src, 40, { blockable: true, kind: 'shot', fromX: src.x, fromZ: src.z, noChip: true })).toBe('block')
    expect(m.combat.hp).toBe(hp)
  })

  it('the charged blast goes through a held block and through a slide\'s i-frames', () => {
    const blocked = mission()
    blocked.block(1)
    const hp = blocked.m.combat.hp
    expect(blocked.m.hitPlayer(blocked.src, 40, { blockable: false, kind: 'aoe', fromX: blocked.src.x, fromZ: blocked.src.z, blast: true })).toBe('hit')
    expect(hp - blocked.m.combat.hp).toBeGreaterThan(0)
    const slid = mission()
    slid.m.combat.slideT = 0.2
    slid.m.combat.iframes = 0.2
    expect(slid.m.hitPlayer(slid.src, 40, { blockable: false, kind: 'aoe', fromX: slid.src.x, fromZ: slid.src.z, blast: true })).toBe('hit')
    // An ordinary blast is still slid through
    const plain = mission()
    plain.m.combat.slideT = 0.2
    plain.m.combat.iframes = 0.2
    expect(plain.m.hitPlayer(plain.src, 40, { blockable: false, kind: 'aoe', fromX: plain.src.x, fromZ: plain.src.z })).toBe('miss')
  })
})
