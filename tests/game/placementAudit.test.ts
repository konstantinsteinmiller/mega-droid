// @vitest-environment jsdom
// The placement audit over every level (`tests/game/placement.ts`): every
// object each level places stands on a floor, hangs on a real wall, hangs
// from something above it or is carried by another object — nothing floats,
// nothing sits inside a wall, nothing is buried in another prop or blocks the
// way. A neon switch hung in the air over a rooftop gap (playtest 2026-10-12):
// it was mounted on the gap's outer edge, which over open sky draws no wall.
//
// The objects are the real ones — the climb's run (`sim/climb.ts`, its stage
// features, secrets), the mission's chests and crates (`sim/objectives.ts`),
// the borrowed-weapon capsules, the boss arena's props, the set dressing
// (`world/decor.ts`), the pads — built at the places the mission puts them.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Group, Mesh, Object3D, Scene, type Material } from 'three'
import { CELL, cellCenter, generateMap, type MapData } from '@/game/world/levelGen'
import { createNav, floorAt } from '@/game/world/nav'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { planDecor } from '@/game/world/decor'
import { THEMES, type SectorId } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { decorParts } from '@/game/models/decorProps'
import { buildTeleporter } from '@/game/models/props'
import { buildWeaponCapsule } from '@/game/models/weaponCapsule'
import { merge, paint, rcyl, xform } from '@/game/models/kit'
import { toonVC } from '@/game/models/toon'
import { ClimbRun, type ClimbHost } from '@/game/sim/climb'
import { MissionObjects, type ObjectiveHost } from '@/game/sim/objectives'
import { BossArena, type ArenaHost } from '@/game/sim/bossArena'
import { planBorrowed } from '@/game/sim/borrowed'
import type { Quest, QuestTemplate } from '@/game/data/quests'
import { auditPlacement, pairKey, type Hover, type Offence, type Placed } from './placement'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const SEEDS = [0, 1, 2, 3, 7, 11]

/** Meant to hover — keep this list short, each with its reason. */
const HOVER: Record<string, Hover> = {
  'climb reward': { reason: 'a pickup spins over its glowing pad (the pad stands on the floor)', over: 1.0 },
  'secret prize': { reason: 'a pickup over the alcove floor, shown once the wall is open', over: 1.2 },
  'data core': { reason: 'a data core is a hovering hologram cube over its blob shadow', over: 1.3 }
}

/** Left out entirely: one mesh along a whole line or basin, with no single
 *  support to derive — each pinned by its own stage's tests. */
const EXEMPT: Record<string, string> = {
  'lift': 'a moving platform: rides its shaft or its guide rails (and the tide), its path pinned by the stage tests',
  'rail track': 'one mesh along the whole ride, standing on its own pylons down to the floor or the pit bottom (`buildRail`)',
  'pool rim': 'one mesh: the coping laid along a whole pool edge, on the floor round it',
  'rail cart': 'waits in its boarding slot, its deck flush with the platform and its underbody below the floor, out of sight; then rides the rail (the Rotor Run quadcopter stands on its skids, its rotors over the floor: `tests/game/rotorRun.test.ts`; then flies its course)',
  'secret beam': 'a mirror puzzle\'s beam of light, through the air from its lamp to a mirror, a wall or the target (its legs pinned by the puzzle audit)'
}

/** Kinds that rest in or on one another by design (sorted pair keys). */
const TOUCHING = new Set<string>([
  // An icicle's root is set into the roof it hangs from.
  pairKey('icicle', 'icicle roof'),
  // An ice column runs on up into an icicle hall's roof, as a column would.
  pairKey('ice pillar', 'icicle roof')
])

/** Floor inlays: a thing may stand on them (a pickup on a magnet rail). */
const INLAYS = new Set(['shock panel', 'magnet rail', 'floor plate'])

// ─── Collecting a level's objects ────────────────────────────────────────────

/** Names every Object3D reachable from `root`'s own fields (`a.b.c`, indices
 *  dropped), so a captured mesh can say what it is. */
const posNames = new Map<string, string>()
const posKey = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`
const nameFields = (root: object, name: string, out: Map<Object3D, string>, depth = 0, seen = new Set<object>()): void => {
  if (depth > 4 || seen.has(root)) return
  seen.add(root)
  // A plain record with a place (a roof's {x, y, z, w, d}): an unnamed mesh there is it.
  const r = root as { x?: unknown; y?: unknown; z?: unknown }
  if (depth > 0 && typeof r.x === 'number' && typeof r.z === 'number') {
    const key = typeof r.y === 'number' ? `${posKey(r.x, r.z)},${r.y.toFixed(2)}` : posKey(r.x, r.z)
    if (!posNames.has(key)) posNames.set(key, name)
  }
  for (const [k, v] of Object.entries(root)) {
    if (!v || typeof v !== 'object' || k === 'host' || k === 'run' || k === 'features' || k === 'map' || k === 't' || k === 'def' || k === 'spec') continue
    const at = `${name}.${k}`
    if (v instanceof Object3D) { if (!out.has(v)) out.set(v, at); continue }
    if (Array.isArray(v)) {
      for (const e of v) {
        if (e instanceof Object3D) { if (!out.has(e)) out.set(e, at) } else if (e && typeof e === 'object') nameFields(e, at, out, depth + 1, seen)
      }
    } else if (Object.getPrototypeOf(v) === Object.prototype || depth === 0) nameFields(v, at, out, depth + 1, seen)
  }
}

/** A short kind from a field path. */
const KIND: Array<[RegExp, string]> = [
  [/^ClimbRun\.rewards/, 'climb reward'],
  [/^ClimbRun\.lifts/, 'lift'],
  [/^ClimbRun\.crushers/, 'crusher'],
  [/^ClimbRun\.balls/, 'rolling ball'],
  [/^SecretsFeature\.list\.buttons/, 'secret button'],
  [/^SecretsFeature\.list\.panel/, 'hint panel'],
  [/^SecretsFeature\.list\.prize/, 'secret prize'],
  [/^SecretsFeature\.list\.shaft/, 'light shaft'],
  [/^SecretsFeature\.list\.legs/, 'secret beam'],
  [/^SecretsFeature\.list\.lamp/, 'beam lamp'],
  [/^SecretsFeature\.list\.mirrors/, 'beam mirror'],
  [/^SecretsFeature\.list\.plates/, 'floor plate'],
  [/^NeonFeature\.switches/, 'neon switch'],
  [/^NeonFeature\.bridges/, 'light bridge'],
  [/^MagnetFeature\.rails\.panel/, 'polarity panel'],
  [/^MagnetFeature\.rails/, 'magnet rail'],
  [/^WaterFeature\.zones\.valve/, 'valve'],
  [/^WaterFeature\.zones\.rim/, 'pool rim'],
  [/^WaterFeature\.zones\.flood\.inlets/, 'flood inlet'],
  [/^WaterFeature\.zones\.flood\.drain/, 'drain'],
  [/^RailFeature\.rail/, 'rail track'],
  [/^RailFeature\.cart/, 'rail cart'],
  [/^Icicles\.icicles/, 'icicle'],
  [/^Icicles\.roofs/, 'icicle roof'],
  [/^IcePillars\.pillars/, 'ice pillar'],
  [/^WindFeature\.zones\.turbine/, 'turbine'],
  [/^VentFeature\.vents/, 'fire vent'],
  [/^FrostThrowers\.nozzles/, 'frost nozzle'],
  [/^ShockFeature\.panels/, 'shock panel'],
  [/^CrumbleFeature\.slabs/, 'crumble slab']
]
const kindOf = (path: string): string => {
  for (const [re, k] of KIND) if (re.test(path)) return k
  // Feature.field (the rest of the path is the mesh's own parts).
  const m = /^(\w+?)(Feature)?\.(\w+)/.exec(path)
  return m ? path.replace(/Feature./, ".") : path
}

const noop = () => {}

const scaffold = (map: MapData, sector: SectorId) => {
  const theme = THEMES[sector]
  const cap = new Group()
  const scene = new Scene()
  const nav = createNav(map)
  return { theme, cap, scene, nav }
}

/** A level's objects, built where the mission builds them. */
const levelObjects = (map: MapData, sector: SectorId, template: QuestTemplate): { placed: Placed[]; ceilings: NonNullable<Parameters<typeof auditPlacement>[2]>['ceilings'] } => {
  const { theme, cap, scene, nav } = scaffold(map, sector)
  posNames.clear()
  const names = new Map<Object3D, string>()
  const t = map.terrain
  if (t) {
    const host = {
      nav, map, theme,
      combat: { maxHp: 100 } as ClimbHost['combat'],
      fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
      markers: { spawn: noop } as unknown as ClimbHost['markers'],
      shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
      hitPlayer: () => 'hit' as const, sfx: noop, shake: noop, onPickup: noop, propParent: () => cap,
      scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
      enemyLevel: 1, encounters: SECTOR_BY_ID[sector]?.encounters ?? SECTOR_BY_ID.blaze.encounters, addEnemy: noop,
      say: noop
    } as unknown as ClimbHost
    const run = new ClimbRun(host, 1)
    for (const f of run.features) nameFields(f, f.constructor.name.replace(/\d+$/, ''), names)
    nameFields(run, 'ClimbRun', names)
  }
  // The mission's objects (chests, crates, cores, the worker-bot).
  const quest: Quest = {
    id: 'audit', kind: 'job', template, sector, seed: map.seed, level: 5, target: null, count: 3, rooms: map.rooms.length,
    reward: { xp: 0, bolts: 0, rarityBias: 0 }
  }
  const ohost = {
    scene, map, nav, theme, propParent: () => cap,
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop,
    onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
  }
  const objs = new MissionObjects(ohost as unknown as ObjectiveHost, quest)
  const placed: Placed[] = []
  const counts = new Map<string, number>()
  const add = (root: Object3D, kind: string, o: Partial<Placed> = {}) => {
    const n = counts.get(kind) ?? 0
    counts.set(kind, n + 1)
    placed.push({ id: `${kind} #${n}`, kind, root, solid: false, interact: false, ...o })
  }
  for (const c of objs.chests) add(c.mesh.root, c.supply ? 'supply chest' : 'chest', { solid: true, interact: true, front: [Math.sin(c.yaw), Math.cos(c.yaw)] })
  for (const c of objs.crates) add(c.mesh.root, c.kind, { solid: true })
  for (const c of objs.cores) add(c.mesh.root, 'data core', { interact: true })
  if (objs.npc) add(objs.npc.root, 'worker-bot', { solid: true, interact: true })
  // The boss arena's cover and props.
  const boss = map.rooms.find(r => r.role === 'boss')
  if (boss) {
    const ahost = {
      nav, map: { ...map, pillars: [...map.pillars], navBlock: map.navBlock.slice() }, theme, player: { x: 0, z: 0 }, propParent: () => cap,
      addArenaCrate: (x: number, z: number, yaw: number, kind: 'crate' | 'barrel', y: number) => objs.addCrate(x, z, yaw, kind, y),
      fx: { sparks: noop, emit: noop }, lobShell: noop, sfx: noop, shake: noop
    }
    const before = objs.crates.length
    const arena = new BossArena(ahost as unknown as ArenaHost, boss, (quest.seed ?? 1) ^ 0x51ab)
    for (const c of objs.crates.slice(before)) add(c.mesh.root, `arena ${c.kind}`, { solid: true })
    for (const p of arena.pillars) names.set(p.mesh, 'arena pillar')
  }
  // Whatever the run and the arena hung in the level: named by their fields.
  for (const o of cap.children) {
    if (placed.some(p => p.root === o)) continue
    let path = names.get(o)
    o.traverse(c => { path ??= names.get(c) })
    path ??= posNames.get(`${posKey(o.position.x, o.position.z)},${o.position.y.toFixed(2)}`) ?? posNames.get(posKey(o.position.x, o.position.z))
    const kind = path ? kindOf(path) : 'unnamed'
    if (!o.visible && kind !== 'secret prize') continue
    // (An ice pillar is the level's own obstacle, blocked for paths: `navBlock`.)
    // (A beam mirror's post is a body: `nav.props`.)
    const solid = kind === 'arena pillar' || kind === 'turbine' || kind === 'beam mirror'
    const interact = ['secret button', 'hint panel', 'beam lamp', 'neon switch', 'polarity panel', 'valve'].includes(kind)
    add(o, kind, { solid, interact })
  }
  for (const o of scene.children) {
    // (The mission objects' own group holds the worker-bot: counted above.)
    if (o === objs.root || placed.some(p => p.root === o) || !o.visible) continue
    add(o, names.get(o) ? kindOf(names.get(o)!) : 'scene object')
  }
  // The borrowed-weapon capsules.
  for (const s of planBorrowed(map)) {
    const v = buildWeaponCapsule(s.weapon)
    v.root.position.set(s.x, s.y, s.z)
    add(v.root, 'weapon capsule', { interact: true })
  }
  // The pads: the beam-in pad and the exit room's pedestal.
  const pad = (x: number, z: number, kind: string) => {
    const p = buildTeleporter(theme)
    const y = floorAt(nav, x, z)
    p.root.position.set(x, Number.isFinite(y) ? y : 0, z)
    add(p.root, kind, { interact: true })
  }
  pad(map.start.x, map.start.z, 'beam-in pad')
  if (map.exit) pad(cellCenter(map.exit.pad[0]), cellCenter(map.exit.pad[1]), 'exit pad')
  // The level mesh's own things: the set dressing, the reward pads, the
  // labyrinth's pillars (as `climbMesh.ts` / `levelMesh.ts` draw them).
  const mat = toonVC()
  const meshOf = (geos: ReturnType<typeof decorParts>['toon'], x: number, y: number, z: number, yaw: number): Mesh => {
    const m = new Mesh(merge(geos.map(g => g.clone())), mat as Material)
    m.position.set(x, y, z)
    m.rotation.y = yaw
    return m
  }
  for (const p of planDecor(map, sector).props) {
    const parts = decorParts(p.kind)
    add(meshOf(parts.toon, p.x, p.y, p.z, p.yaw), `decor ${p.kind}`, { solid: p.r > 0 })
  }
  for (const r of t?.rewards ?? []) {
    if (r.kind === 'weapon') continue
    add(meshOf([paint(rcyl(0.7, 0.14, 0.06, 20), '#888')], r.x, r.y + 0.07, r.z, 0), 'reward pad')
  }
  // (A labyrinth's stand on y = 0; a stage's cover pillars on their cell's floor, `climbMesh.ts`.)
  for (const p of map.pillars) {
    const y = t ? t.floor[Math.floor(p.z / CELL) * map.w + Math.floor(p.x / CELL)]! : 0
    add(meshOf([xform(paint(rcyl(p.r, t ? 3.2 : 2.6, 0.2, 16), '#888'), [0, t ? 1.6 : 1.3, 0])], p.x, y, p.z, 0), 'pillar', { solid: true })
  }
  // The lane gantries' beams: their lamps hang under them (`climbMesh.ts`).
  const ceilings: Array<{ x0: number; z0: number; x1: number; z1: number; y: number }> = []
  if (t) {
    const groups = new Map<string, typeof t.lanes>()
    for (const ln of t.lanes) {
      const key = `${ln.room}:${t.floor[Math.floor(ln.z / CELL) * map.w + Math.floor(ln.x / CELL)]}`
      groups.set(key, [...(groups.get(key) ?? []), ln])
    }
    for (const lanes of groups.values()) {
      const f = lanes[0]!
      const topY = t.floor[Math.floor(f.z / CELL) * map.w + Math.floor(f.x / CELL)]!
      let lo = Infinity
      let hi = -Infinity
      for (const ln of lanes) { lo = Math.min(lo, f.dx ? ln.z : ln.x); hi = Math.max(hi, f.dx ? ln.z : ln.x) }
      lo -= CELL / 2
      hi += CELL / 2
      const gx = f.x + f.dx * 0.2
      const gz = f.z + f.dz * 0.2
      const y = topY + 3 - 0.4
      ceilings.push(f.dx ? { x0: gx - 0.45, x1: gx + 0.45, z0: lo, z1: hi, y } : { x0: lo, x1: hi, z0: gz - 0.45, z1: gz + 0.45, y })
    }
  }
  return { placed, ceilings }
}

// ─── The levels ──────────────────────────────────────────────────────────────

interface Level { name: string; sector: SectorId; map: MapData; template: QuestTemplate }

const levels = (): Level[] => {
  const out: Level[] = []
  for (const sector of STAGES) for (const seed of SEEDS) out.push({ name: `${sector} #${seed}`, sector, map: generateStage(sector, seed), template: 'stage' })
  for (const seed of SEEDS) out.push({ name: `tower #${seed}`, sector: 'blaze', map: generateClimb(seed), template: 'climb' })
  out.push({ name: 'tutorial', sector: 'scrapyard', map: generateWakeUpCall(1), template: 'tutorial' })
  const jobs: QuestTemplate[] = ['supply', 'collect', 'rescue', 'kill']
  for (const seed of SEEDS) {
    for (const [n, sector] of (['scrapyard', 'cryo', 'neon', 'tide'] as SectorId[]).entries()) {
      out.push({ name: `labyrinth ${sector} #${seed}`, sector, map: generateMap({ seed: seed * 7 + n, rooms: 8, boss: true, challenge: seed % 2 === 1 }), template: jobs[n]! })
    }
  }
  return out
}

const audit = (l: Level): Offence[] => {
  const { placed, ceilings } = levelObjects(l.map, l.sector, l.template)
  return auditPlacement(l.map, placed, { hover: HOVER, touching: TOUCHING, exempt: EXEMPT, inlays: INLAYS, ceilings })
}

describe('placement audit: every object stands, hangs or is carried', () => {
  it('reports by level', () => {
    const all: string[] = []
    // (PLACEMENT_ONLY=<level name prefix> audits one level, for a fix.)
    for (const l of levels().filter(l => !process.env.PLACEMENT_ONLY || l.name.startsWith(process.env.PLACEMENT_ONLY))) {
      for (const o of audit(l)) all.push(`${l.name}: ${o.id} ${o.rule} — ${o.detail}`)
    }
    if (all.length) {
      // A count by level and kind first: the list itself runs long.
      const tally = new Map<string, number>()
      for (const a of all) {
        const m = /^(\S+) [^:]*: (.+?) #\d+ (\S+)/.exec(a)
        const k = m ? `${m[1]} ${m[2]} / ${m[3]}` : a
        tally.set(k, (tally.get(k) ?? 0) + 1)
      }
      // eslint-disable-next-line no-console
      console.log([...tally].map(([k, n]) => `${n} ${k}`).join('\n'))
    }
    expect(all).toEqual([])
  }, 300_000)

  it('catches a switch over open sky (the playtest one, put back)', () => {
    const map = generateStage('neon', 1)
    const sw = map.terrain!.neonSwitches![0]!
    // Its old cell: over the chasm, where the gap's outer edge has no wall.
    map.terrain!.neonSwitches![0] = { ...sw, j: 11 }
    const found = audit({ name: 'neon', sector: 'neon', map, template: 'stage' })
    expect(found.some(o => o.kind === 'neon switch' && o.rule === 'floating')).toBe(true)
  })

  it('the whitelist stays short, every entry with its reason', () => {
    expect(Object.keys(HOVER).length + Object.keys(EXEMPT).length + TOUCHING.size).toBeLessThanOrEqual(10)
    for (const h of Object.values(HOVER)) expect(h.reason.length).toBeGreaterThan(10)
    for (const r of Object.values(EXEMPT)) expect(r.length).toBeGreaterThan(10)
  })
})
