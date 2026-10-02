// @vitest-environment jsdom
// Borrowed weapons (src/game/sim/borrowed.ts): the capsule that lends a copied
// weapon for one mission. Pinned here: where capsules go (from the map seed,
// on a stream of their own, never in the tutorial), what they lend, the
// grant / top-up / replace rules, charges instead of Weapon Energy, the pop
// at zero, the resume snapshot, and that nothing leaks into the profile.
// Driven with fake hosts, so no GPU; the capsule model is built once per
// weapon to catch a geometry that will not merge.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateMap, CELL, type MapData } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { createNav, floorAt } from '@/game/world/nav'
import { tutorialQuest } from '@/game/data/quests'
import { WEAPONS, WEAPON_IDS, type WeaponId } from '@/game/data/weapons'
import { profile } from '@/game/state/profile'
import { hud } from '@/game/state/hud'
import { flushPersist } from '@/use/useGameState'
import {
  BorrowedRun, BorrowedSlot, planBorrowed, lentWeapon, mainPathRooms, capsulesOnLedges,
  LENT_SHOTS, CAPSULE_CHANCE, TEACH_TIP, type CapsuleSpot, type BorrowedHost
} from '@/game/sim/borrowed'
import { WeaponSystem, type WeaponHost } from '@/game/sim/weapons'
import { buildWeaponCapsule } from '@/game/models/weaponCapsule'
import { mulberry32 } from '@/game/world/rng'
import { baseStats } from '@/game/sim/stats'
import { attachInput, consumeEdges, createInput } from '@/game/engine/input'
import { keyLabel } from '@/game/engine/keyLabels'

const MAPS: MapData[] = []
for (let k = 0; k < 200; k++) MAPS.push(generateMap({ seed: 5000 + k * 7919, rooms: 6 + (k % 6), boss: k % 3 === 0 }))

const makeHost = () => {
  const sounds: string[] = []
  const bursts: string[] = []
  const host: BorrowedHost = {
    fx: {
      orbBurst: (_x, _y, _z, c) => { bursts.push(`orb:${c}`) },
      riseRing: () => {},
      flash: () => {},
      sparks: () => {}
    },
    sfx: (name) => { sounds.push(name) }
  }
  return { host, sounds, bursts }
}

const spot = (over: Partial<CapsuleSpot> = {}): CapsuleSpot => ({ x: 10, z: 10, y: 0, room: 1, weapon: 'iceLance', ...over })

/** Walk Flux onto a capsule and step the run once. */
const walkInto = (run: BorrowedRun, s: CapsuleSpot, y = s.y) => run.update(1 / 60, 1, { x: s.x + 0.3, y, z: s.z }, true)

beforeEach(() => {
  profile.tips = {}
  profile.hero.weapons = []
  profile.hero.slots = ['', '']
  profile.hero.weaponXp = {}
})
afterEach(() => flushPersist())

describe('placement', () => {
  it('is deterministic from the map seed and leaves the map untouched', () => {
    for (const map of MAPS.slice(0, 60)) {
      const before = JSON.stringify(map)
      const a = planBorrowed(map)
      expect(planBorrowed(map)).toEqual(a)
      expect(JSON.stringify(map)).toBe(before)
    }
  })

  it('puts one capsule on about a third of regular maps, never more', () => {
    const plans = MAPS.map(m => planBorrowed(m))
    for (const p of plans) expect(p.length).toBeLessThanOrEqual(1)
    const share = plans.filter(p => p.length).length / plans.length
    expect(share).toBeGreaterThan(CAPSULE_CHANCE - 0.12)
    expect(share).toBeLessThan(CAPSULE_CHANCE + 0.12)
  })

  it('in a treasure room, else a side room off the main path; on the floor, off the walls', () => {
    for (const map of MAPS) {
      const [c] = planBorrowed(map)
      if (!c) continue
      const room = map.rooms[c.room]!
      const hasTreasure = map.rooms.some(r => r.role === 'treasure')
      if (hasTreasure) expect(room.role).toBe('treasure')
      else {
        expect(room.role).toBe('combat')
        expect(mainPathRooms(map).has(room.id)).toBe(false)
      }
      expect(c.y).toBe(0)
      const i = Math.floor(c.x / CELL)
      const j = Math.floor(c.z / CELL)
      expect(map.room[j * map.w + i]).toBe(room.id)
      // Interior: a chest or crate stands against the wall, never here.
      expect(i).toBeGreaterThan(room.x0)
      expect(i).toBeLessThan(room.x0 + room.w - 1)
      expect(j).toBeGreaterThan(room.z0)
      expect(j).toBeLessThan(room.z0 + room.h - 1)
    }
  })

  it('never in the tutorial (Wake-Up Call)', () => {
    const q = tutorialQuest()
    const map = generateMap({ seed: q.seed, rooms: q.rooms, boss: true })
    expect(planBorrowed(map, { tutorial: true })).toEqual([])
    for (const m of MAPS) expect(planBorrowed(m, { tutorial: true })).toEqual([])
  })

  it("the climb: exactly one, the weapon ledge's prize, at the ledge's height; the other ledge keeps its own", () => {
    for (let k = 0; k < 40; k++) {
      const map = generateClimb(900 + k * 131)
      const ledges = map.terrain!.rewards
      const weaponLedges = ledges.filter(l => l.kind === 'weapon')
      expect(weaponLedges).toHaveLength(1)
      expect(ledges.filter(l => l.kind !== 'weapon').length).toBeGreaterThanOrEqual(1)
      const caps = planBorrowed(map)
      expect(caps).toHaveLength(1)
      const [c] = caps
      const l = weaponLedges[0]!
      expect([c!.x, c!.z, c!.y, c!.room]).toEqual([l.x, l.z, l.y, l.room])
      expect(floorAt(createNav(map), c!.x, c!.z)).toBeCloseTo(c!.y, 5)
      expect(c!.y).toBeGreaterThan(0)
      expect(planBorrowed(map)).toEqual(caps)
    }
  })

  it('ledges with none named for a weapon: one or two beside their prizes (capsulesOnLedges)', () => {
    let twos = 0
    for (let k = 0; k < 40; k++) {
      const map = generateClimb(300 + k * 17)
      const ledges = map.terrain!.rewards.map(r => ({ x: r.x, z: r.z, y: r.y, room: r.room }))
      const nav = createNav(map)
      const a = capsulesOnLedges(map, ledges, mulberry32(k))
      expect(a.length).toBeGreaterThanOrEqual(1)
      expect(a.length).toBeLessThanOrEqual(Math.min(2, ledges.length))
      if (a.length === 2) twos++
      for (const s of a) {
        const l = ledges.find(r => Math.floor(r.x / CELL) === Math.floor(s.x / CELL) && Math.floor(r.z / CELL) === Math.floor(s.z / CELL))
        expect(l, 'in a reward ledge cell').toBeTruthy()
        expect(s.y).toBe(l!.y)
        // Off the ledge's own prize, still on the ledge's floor.
        expect(Math.hypot(s.x - l!.x, s.z - l!.z)).toBeGreaterThan(0.5)
        expect(floorAt(nav, s.x, s.z)).toBeCloseTo(s.y, 5)
      }
    }
    expect(twos).toBeGreaterThan(0)
    expect(capsulesOnLedges(generateClimb(77), [], mulberry32(3))).toEqual([])
  })

  it('positions never depend on what Flux owns; the weapon does', () => {
    for (const map of MAPS.slice(0, 80)) {
      const a = planBorrowed(map, { owned: [] })
      // All but the last weapon owned: the last is the one not won.
      const last = WEAPON_IDS[WEAPON_IDS.length - 1]!
      const b = planBorrowed(map, { owned: WEAPON_IDS.filter(w => w !== last), slots: ['scrapBurst', 'flameWave'] })
      expect(b.map(s => [s.x, s.z, s.room])).toEqual(a.map(s => [s.x, s.z, s.room]))
      for (const s of b) expect(s.weapon).toBe(last)
    }
  })

  it('every capsule of a mission lends the same weapon', () => {
    for (let k = 0; k < 20; k++) {
      const map = generateClimb(4000 + k)
      // Unnamed ledges: two capsules on some towers.
      const bare = { ...map, terrain: { ...map.terrain!, rewards: map.terrain!.rewards.map(r => ({ ...r, kind: 'hp' as const })) } }
      for (const m of [map, bare]) {
        const caps = planBorrowed(m)
        expect(caps.length).toBeGreaterThan(0)
        expect(new Set(caps.map(c => c.weapon)).size).toBe(1)
      }
    }
  })
})

describe('which weapon', () => {
  it('prefers one Flux has not won, then an owned one not slotted, then any', () => {
    for (let r = 0; r < 1; r += 0.05) {
      const owned = ['scrapBurst', 'flameWave', 'thunderArc'] as const
      expect(WEAPON_IDS.filter(w => !owned.includes(w as never))).toContain(lentWeapon(r, [...owned], ['scrapBurst', '']))
      expect(WEAPON_IDS.filter(w => w !== 'scrapBurst' && w !== 'flameWave')).toContain(lentWeapon(r, [...WEAPON_IDS], ['scrapBurst', 'flameWave']))
      expect(WEAPON_IDS).toContain(lentWeapon(r, [...WEAPON_IDS], [...WEAPON_IDS]))
    }
    expect(lentWeapon(0.999999, [], [])).toBe(WEAPON_IDS[WEAPON_IDS.length - 1])
  })
})

describe('the slot: grant, top-up, replace', () => {
  it('a first capsule grants the weapon at its full charge', () => {
    const s = new BorrowedSlot()
    expect(s.grant('thunderArc')).toBe('new')
    expect(s.id).toBe('thunderArc')
    expect(s.shots).toBe(LENT_SHOTS.thunderArc)
    expect(s.max).toBe(LENT_SHOTS.thunderArc)
  })

  it('the same weapon tops up to full; a full slot does not want it', () => {
    const s = new BorrowedSlot()
    s.grant('iceLance')
    expect(s.wants('iceLance')).toBe(false)
    s.spend()
    s.spend()
    expect(s.wants('iceLance')).toBe(true)
    expect(s.grant('iceLance')).toBe('topup')
    expect(s.shots).toBe(LENT_SHOTS.iceLance)
  })

  it('another weapon replaces it, at its own charge', () => {
    const s = new BorrowedSlot()
    s.grant('scrapBurst')
    s.spend()
    expect(s.wants('flameWave')).toBe(true)
    expect(s.grant('flameWave')).toBe('replace')
    expect(s.id).toBe('flameWave')
    expect(s.shots).toBe(LENT_SHOTS.flameWave)
  })

  it('charges are 6–10 per weapon', () => {
    for (const id of WEAPON_IDS) {
      expect(LENT_SHOTS[id]).toBeGreaterThanOrEqual(6)
      expect(LENT_SHOTS[id]).toBeLessThanOrEqual(10)
    }
  })
})

describe('the run: taking, firing, running dry', () => {
  it('walking into a capsule takes it once: burst, jingle, the HUD button', () => {
    const { host, sounds, bursts } = makeHost()
    const s = spot()
    const run = new BorrowedRun(host, [s])
    expect(hud.borrowed.id).toBe('')
    expect(run.update(1 / 60, 0, { x: 0, y: 0, z: 0 }, true)).toBeNull()
    expect(walkInto(run, s)).toBe(run.capsules[0])
    expect(run.capsules[0]!.taken).toBe(true)
    expect(walkInto(run, s)).toBeNull()
    expect(sounds.filter(n => n === 'borrowGet')).toHaveLength(1)
    expect(bursts).toEqual([`orb:${WEAPONS.iceLance.color}`])
    run.writeHud(true, false)
    expect(hud.borrowed).toMatchObject({ id: 'iceLance', shots: LENT_SHOTS.iceLance, max: LENT_SHOTS.iceLance, color: WEAPONS.iceLance.color, ready: true })
  })

  it('not while the mission is not playing, nor from another floor', () => {
    const { host } = makeHost()
    const s = spot({ y: 6 })
    const run = new BorrowedRun(host, [s])
    expect(run.update(1 / 60, 0, { x: s.x, y: 6, z: s.z }, false)).toBeNull()
    expect(walkInto(run, s, 0)).toBeNull()
    expect(walkInto(run, s, 6)).not.toBeNull()
  })

  it('every shot spends one charge; at 0 it pops and is gone', () => {
    const { host, sounds } = makeHost()
    const s = spot({ weapon: 'thunderArc' })
    const run = new BorrowedRun(host, [s])
    walkInto(run, s)
    for (let k = 0; k < LENT_SHOTS.thunderArc - 1; k++) {
      run.fired()
      expect(run.checkSpent(false)).toBe(false)
    }
    expect(run.slot.shots).toBe(1)
    run.fired()
    expect(run.slot.shots).toBe(0)
    expect(run.checkSpent(false)).toBe(true)
    expect(run.slot.id).toBe('')
    expect(run.spent).toBe(1)
    expect(run.lastColor).toBe(WEAPONS.thunderArc.color)
    expect(sounds).toContain('borrowSpent')
    run.writeHud(true, false)
    expect(hud.borrowed.id).toBe('')
    expect(hud.borrowed.spent).toBe(1)
    expect(hud.borrowed.color).toBe(WEAPONS.thunderArc.color)
  })

  it("Gale Guard's last cast waits for its leaves; the throw spends nothing", () => {
    const { host } = makeHost()
    const s = spot({ weapon: 'galeGuard' })
    const run = new BorrowedRun(host, [s])
    walkInto(run, s)
    for (let k = 0; k < LENT_SHOTS.galeGuard; k++) run.fired()
    expect(run.checkSpent(true)).toBe(false)
    expect(run.slot.id).toBe('galeGuard')
    run.fired(true)
    expect(run.slot.shots).toBe(0)
    expect(run.checkSpent(false)).toBe(true)
  })

  it('a full slot leaves a same-weapon capsule standing for later', () => {
    const { host } = makeHost()
    const a = spot({ x: 5, z: 5 })
    const b = spot({ x: 20, z: 20 })
    const run = new BorrowedRun(host, [a, b])
    walkInto(run, a)
    expect(walkInto(run, b)).toBeNull()
    expect(run.capsules[1]!.taken).toBe(false)
    run.fired()
    expect(walkInto(run, b)).toBe(run.capsules[1])
    expect(run.slot.shots).toBe(LENT_SHOTS.iceLance)
  })
})

describe('no Weapon Energy', () => {
  const makeWeaponHost = (we: number) => {
    const shot = () => ({
      vx: 1, vy: 0, vz: 1, pierce: 0, freeze: 0, burn: 0, life: 1, kind: '', weapon: '', element: '', color: '',
      sprite: { material: { color: { set: () => {} } } }, core: { material: { color: { set: () => {} } } }
    })
    const host = {
      nav: {} as WeaponHost['nav'],
      fx: { emit: () => {}, flash: () => {}, sparks: () => {} } as unknown as WeaponHost['fx'],
      system: { spawnPlayerShot: shot, shots: [], damageEnemy: () => {} } as unknown as WeaponHost['system'],
      enemies: [],
      stats: baseStats(),
      player: { x: 0, z: 0, yaw: 0 },
      combat: { we, target: null },
      time: 0,
      sfx: () => {},
      shake: () => {}
    } satisfies WeaponHost
    return host
  }
  const muzzle: [number, number, number] = [0, 1.4, 0]
  const aim: [number, number, number, null] = [0, 0, 1, null]

  it('a borrowed shot costs nothing, even on an empty bar; a slotted one still does', () => {
    const h = makeWeaponHost(0)
    const w = new WeaponSystem(h, {})
    expect(w.use(0, 'iceLance', muzzle, aim)).toBe('energy')
    expect(w.use(2, 'iceLance', muzzle, aim, true)).toBe('ok')
    expect(h.combat.we).toBe(0)
    expect(w.cooldown[2]).toBeCloseTo(WEAPONS.iceLance.cooldown)
    expect(w.cooldown[0]).toBe(0)
    h.combat.we = 20
    expect(w.use(2, 'galeGuard', muzzle, aim, true)).toBe('cooldown')
    w.update(2)
    expect(w.use(2, 'galeGuard', muzzle, aim, true)).toBe('ok')
    expect(h.combat.we).toBe(20)
    expect(w.use(1, 'flameWave', muzzle, aim)).toBe('ok')
    expect(h.combat.we).toBe(20 - w.cost('flameWave'))
  })

  // Playtest: "the flame attack does nothing, just a blop". It started at
  // height 0.45 of the MAP, under every raised floor, and died on the spot.
  it('the Flame Wave rolls along the floor Flux stands on, in flames and with a fire sound', () => {
    const h = makeWeaponHost(20)
    const spawned: number[] = []
    const flames: number[] = []
    const sounds: string[] = []
    const base = h.system.spawnPlayerShot as unknown as () => Record<string, unknown>
    ;(h.system as unknown as { spawnPlayerShot: unknown }).spawnPlayerShot = (_k: string, _x: number, y: number) => { spawned.push(y); return base() }
    ;(h.fx as unknown as { emit: unknown }).emit = (p: { y: number }) => { flames.push(p.y) }
    ;(h as unknown as { sfx: unknown }).sfx = (n: string) => { sounds.push(n) }
    ;(h.player as unknown as { y: number }).y = 9
    const w = new WeaponSystem(h, {})
    expect(w.use(0, 'flameWave', [0, 10.4, 0], aim)).toBe('ok')
    expect(spawned).toEqual([9.45])
    expect(flames.length).toBeGreaterThanOrEqual(10)
    for (const y of flames) expect(y).toBeGreaterThan(9.5)
    expect(sounds).toEqual(['flameJet'])
  })

  it('Thunder Arc with nothing to hit fires nothing (so no charge is spent)', () => {
    const h = makeWeaponHost(0)
    const w = new WeaponSystem(h, {})
    expect(w.use(2, 'thunderArc', muzzle, aim, true)).toBe('none')
    expect(h.combat.we).toBe(0)
    expect(w.cooldown[2]).toBe(0)
  })
})

describe('never in the profile, kept by the mission snapshot', () => {
  it('taking and firing never touches the hero', () => {
    const { host } = makeHost()
    const s = spot({ weapon: 'flameWave' })
    const run = new BorrowedRun(host, [s])
    walkInto(run, s)
    run.fired()
    expect(profile.hero.weapons).toEqual([])
    expect(profile.hero.slots).toEqual(['', ''])
    expect(profile.hero.weaponXp).toEqual({})
    expect(Object.keys(profile)).not.toContain('borrowed')
  })

  it('a resumed mission keeps the charges left and the capsules taken, quietly', () => {
    const a = makeHost()
    const spots = [spot({ x: 4, z: 4 }), spot({ x: 30, z: 30 })]
    const run = new BorrowedRun(a.host, spots)
    walkInto(run, spots[0]!)
    run.fired()
    run.fired()
    const save = JSON.parse(JSON.stringify(run.save()))
    expect(save).toEqual({ w: 'iceLance', shots: LENT_SHOTS.iceLance - 2, got: [0] })

    const b = makeHost()
    const again = new BorrowedRun(b.host, spots)
    again.restore(save)
    expect(again.slot.id).toBe('iceLance')
    expect(again.slot.shots).toBe(LENT_SHOTS.iceLance - 2)
    expect(again.slot.max).toBe(LENT_SHOTS.iceLance)
    expect(again.capsules.map(c => c.taken)).toEqual([true, false])
    expect(walkInto(again, spots[0]!)).toBeNull()
    expect(b.sounds).toEqual([])
    expect(again.teach).toBe(false)
  })

  it('a snapshot from before borrowing, or a bogus one, restores nothing', () => {
    const { host } = makeHost()
    const run = new BorrowedRun(host, [spot()])
    run.restore(undefined)
    run.restore({ w: 'laserSword', shots: 5, got: [7] })
    expect(run.slot.id).toBe('')
    run.restore({ w: 'iceLance', shots: 99, got: [] })
    expect(run.slot.shots).toBe(LENT_SHOTS.iceLance)
  })
})

describe('the first-take teach', () => {
  it('comes on with the first capsule a profile takes and goes once it is fired', () => {
    const { host } = makeHost()
    const s = spot()
    const run = new BorrowedRun(host, [s])
    walkInto(run, s)
    expect(run.teach).toBe(true)
    run.writeHud(true, false)
    expect(hud.borrowed.teach).toBe(true)
    // A scene lesson has the stage: the teach waits.
    run.writeHud(true, true)
    expect(hud.borrowed.teach).toBe(false)
    run.fired()
    expect(run.teach).toBe(false)
    expect(profile.tips[TEACH_TIP]).toBe(true)
  })

  it('never again once learned', () => {
    profile.tips = { [TEACH_TIP]: true }
    const { host } = makeHost()
    const s = spot()
    const run = new BorrowedRun(host, [s])
    walkInto(run, s)
    expect(run.teach).toBe(false)
  })
})

describe('key 3', () => {
  it('queues the borrowed weapon (the number row and the keypad), and its keycap is drawn', () => {
    const surface = document.createElement('div')
    document.body.appendChild(surface)
    const input = createInput()
    const detach = attachInput(surface, input, { fireMode: () => false, canLock: () => true })
    try {
      for (const code of ['Digit3', 'Numpad3']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
        expect(input.weaponQueued).toBe(3)
        window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
        consumeEdges(input)
        expect(input.weaponQueued).toBe(0)
      }
    } finally {
      detach()
      surface.remove()
    }
    expect(keyLabel('Digit3')).toBe('3')
  })
})

describe('the capsule model', () => {
  it('builds for every weapon, in its colour', () => {
    for (const id of WEAPON_IDS as WeaponId[]) {
      const m = buildWeaponCapsule(id)
      expect(m.root.children.length).toBeGreaterThan(3)
      expect(m.holo.geometry.attributes.position!.count).toBeGreaterThan(0)
      expect(`#${m.columnMat.color.getHexString()}`).toBe(WEAPONS[id].color)
      expect(m.haloMat.color.getHexString()).toBe(m.holoMat.color.getHexString())
    }
  })
})
