import { reactive, toRaw, watch } from 'vue'
import { getState, setStates } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import {
  LEVEL_KEY, BOLTS_KEY, STORY_KEY, QUESTS_DONE_KEY, HERO_KEY, INVENTORY_KEY, QUESTS_KEY, WORLD_KEY,
  STATS_KEY, TUTORIAL_KEY, MISSION_KEY
} from '@/keys'
import type { Attr } from '../data/progression'
import { addXp, ATTR_GAIN, xpToNext, xpToReach } from '../data/progression'
import type { WeaponId } from '../data/weapons'
import { WEAPONS } from '../data/weapons'
import {
  starterItems, mainStat, BASE_BY_ID, EQUIP_SLOTS, type Item, type EquipSlot
} from '../data/items'
import type { Quest } from '../data/quests'
import type { SectorId } from '../world/themes'
import { SKILL_BY_ID, chipsSpent, canBuyMod } from '../data/skills'
import { SECTORS } from '../data/regions'
import { baseStats, type PlayerStats } from '../sim/stats'
import { DEFAULT_HERO_COLORS, type HeroColors } from '../models/hero'

/**
 * ─── The player profile ──────────────────────────────────────────────────────
 *
 * One reactive object the hub UI binds to and the mission reads through
 * `computeStats()`. It is persisted into the single `mega_droid_state`
 * blob as a handful of `ma_*` fields (see `src/keys.ts`) at CHECKPOINTS —
 * a kill's XP, a pickup banked, a purchase, a mission end — never per frame.
 *
 * Every field has a default and `load()` fills anything missing, so an older
 * save (or a partial cloud row) always hydrates into a complete profile.
 */

export interface HeroSave {
  xp: number
  attrs: Record<Attr, number>
  skills: Record<string, number>
  /** Level-up attribute picks the player has not chosen yet. */
  pendingAttrs: number
  weapons: WeaponId[]
  slots: [WeaponId | '', WeaponId | '']
  weaponXp: Partial<Record<WeaponId, number>>
}

export interface InventorySave {
  items: Item[]
  equipped: Record<EquipSlot, string | null>
  tanks: number
  /** Item ids the player has not looked at yet (the "NEW" badge). */
  fresh: string[]
  /** A rewarded "+1 Repair Gel" from the lab, waiting for the next mission's
   *  start (`claimGiftTank`). A flag, not a tank: it may go one over the cap,
   *  which only a live mission can carry. */
  giftTank: boolean
}

export interface QuestSave {
  jobs: Quest[]
  jobSeed: number
  storyAttempts: Record<string, number>
}

export interface WorldSave {
  unlocked: SectorId[]
  bosses: string[]
  tutorialDone: boolean
  /** New Game+ cycle: 0 on the first run (`sim/ngPlus.ts`). */
  ngPlus: number
  selected: SectorId
  /** Story beats already shown (`story.md` § What this changes: `intro`, and
   *  later `relay:<sector>`, `vex:<boss>`, `blueprint`, `breach`, `ending`). */
  seen: string[]
}

export interface StatsSave {
  kills: number
  deaths: number
  chests: number
  missions: number
  playSeconds: number
  bestLevel: number
  /** Epoch ms of the last claimed Workshop supply drop (rewarded). */
  lastDropAt: number
  /** Every point of XP ever earned, still counting past the level cap: the
   *  leaderboard's score. Read it through `lifetimeXp()`. */
  xpEarned: number
  /** A running average (EMA) of the bolts a won mission paid, quest reward
   *  and pickups, before any ×3 ad: what "a mission's income" is worth now. */
  boltsAvg: number
}

export interface Profile {
  level: number
  bolts: number
  story: number
  questsDone: number
  hero: HeroSave
  inv: InventorySave
  quests: QuestSave
  world: WorldSave
  stats: StatsSave
  /** One-time flags (true) and the control coach's per-glyph success counts
   *  (`hint:<id>:<touch|mouse>` → n). */
  tips: Record<string, true | number>
}

const defaultHero = (): HeroSave => ({
  xp: 0, attrs: { hp: 0, we: 0, power: 0 }, skills: {}, pendingAttrs: 0, weapons: [], slots: ['', ''], weaponXp: {}
})

const defaultInv = (): InventorySave => {
  const items = starterItems()
  return {
    items,
    equipped: { buster: 'start_buster', helmet: 'start_helm', chest: 'start_body', boots: 'start_boots', chip1: null, chip2: null },
    tanks: 1,
    fresh: [],
    giftTank: false
  }
}

const defaults = (): Profile => ({
  level: 1,
  bolts: 0,
  story: 0,
  questsDone: 0,
  hero: defaultHero(),
  inv: defaultInv(),
  quests: { jobs: [], jobSeed: Math.floor(Math.random() * 1e9), storyAttempts: {} },
  world: { unlocked: ['scrapyard'], bosses: [], tutorialDone: false, ngPlus: 0, selected: 'scrapyard', seen: [] },
  stats: { kills: 0, deaths: 0, chests: 0, missions: 0, playSeconds: 0, bestLevel: 1, lastDropAt: 0, xpEarned: 0, boltsAvg: 0 },
  tips: {}
})

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : d)
const obj = <T extends object>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? { ...d, ...(v as T) } : d)

/** A deep copy of plain data. JSON, like the blob's own trip to storage: it
 *  sees through Vue proxies (`structuredClone` throws on them), runs in every
 *  WebView a portal serves, and gives exactly what a reload would read back. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v))) as T

/** A stored field as the profile may keep it: a copy, never the blob's own. */
const stored = (key: string): unknown => {
  const v = getState(key)
  return v !== null && typeof v === 'object' ? plain(v) : v
}

export const profile: Profile = reactive(defaults())

/**
 * Read the persisted fields into the reactive profile (fills defaults).
 *
 * The profile gets COPIES. Holding the blob's own nested arrays and objects
 * (`world.bosses`, `inv.items`…) would make every in-memory change an edit of
 * the save, written out by the next unrelated write (a volume change, a
 * leaderboard mark) before any checkpoint took it. The profile reaches the
 * blob through `saveProfile` and nothing else.
 */
export const loadProfile = (): void => {
  const d = defaults()
  profile.level = Math.max(1, Math.round(num(getState(LEVEL_KEY), 1)))
  profile.bolts = Math.max(0, Math.round(num(getState(BOLTS_KEY), 0)))
  profile.story = Math.max(0, Math.round(num(getState(STORY_KEY), 0)))
  profile.questsDone = Math.max(0, Math.round(num(getState(QUESTS_DONE_KEY), 0)))
  const hero = obj(stored(HERO_KEY), d.hero)
  hero.attrs = obj(hero.attrs, d.hero.attrs)
  hero.skills = obj(hero.skills, {})
  hero.weaponXp = obj(hero.weaponXp, {})
  if (!Array.isArray(hero.weapons)) hero.weapons = []
  if (!Array.isArray(hero.slots) || hero.slots.length !== 2) hero.slots = ['', '']
  profile.hero = hero
  const inv = obj(stored(INVENTORY_KEY), d.inv)
  if (!Array.isArray(inv.items) || inv.items.length === 0) {
    inv.items = d.inv.items
    inv.equipped = d.inv.equipped
  }
  inv.equipped = obj(inv.equipped, d.inv.equipped)
  if (!Array.isArray(inv.fresh)) inv.fresh = []
  // Saves from before the gift have no flag; anything but `true` is none.
  inv.giftTank = inv.giftTank === true
  inv.items = inv.items.filter(it => it && BASE_BY_ID[it.base])
  profile.inv = inv
  const quests = obj(stored(QUESTS_KEY), d.quests)
  if (!Array.isArray(quests.jobs)) quests.jobs = []
  quests.storyAttempts = obj(quests.storyAttempts, {})
  profile.quests = quests
  const world = obj(stored(WORLD_KEY), d.world)
  if (!Array.isArray(world.unlocked) || !world.unlocked.length) world.unlocked = ['scrapyard']
  if (!Array.isArray(world.bosses)) world.bosses = []
  if (!Array.isArray(world.seen)) world.seen = []
  world.ngPlus = Math.max(0, Math.round(num(world.ngPlus, 0)))
  migrateSeen(world)
  migrateUnlocks(world)
  profile.world = world
  profile.stats = obj(stored(STATS_KEY), d.stats)
  profile.tips = obj(stored(TUTORIAL_KEY), {})
}

/**
 * Story beats never replay history: every beat whose trigger is already behind
 * the player is marked seen, so an update never queues old cutscenes. The
 * intro's trigger is the first launch, so any save past the tutorial has
 * seen it (or never needs to).
 */
export const migrateSeen = (world: WorldSave): void => {
  if (world.tutorialDone && !world.seen.includes('intro')) world.seen.push('intro')
  // The voiced Vex scenes (#117) arrived with this save already past some
  // Masters: theirs count as seen, once (a Master beaten after this point
  // plays its scenes even if the game was closed before the hub).
  if (!world.seen.includes('vo:migrated')) {
    world.seen.push('vo:migrated')
    for (const beat of voBeatsBehind(world)) if (!world.seen.includes(beat)) world.seen.push(beat)
  }
  // The sectors' own beam-in lines came later: a sector whose Master is beaten was landed in long ago.
  if (!world.seen.includes('vo:migrated:2')) {
    world.seen.push('vo:migrated:2')
    for (const s of SECTORS) {
      if (world.bosses.includes(s.boss) && !world.seen.includes(`sector:${s.id}`)) world.seen.push(`sector:${s.id}`)
    }
  }
  // The debriefs (#119) too: a Master beaten before they existed has had its return to the Lab.
  if (!world.seen.includes('vo:migrated:3')) {
    world.seen.push('vo:migrated:3')
    for (const b of world.bosses) if (!world.seen.includes(`debrief:${b}`)) world.seen.push(`debrief:${b}`)
  }
}

/** The voiced scenes whose trigger a save is already past (`story/vexScene.ts`). */
export const voBeatsBehind = (world: Pick<WorldSave, 'bosses' | 'unlocked'>): string[] => {
  const out: string[] = []
  for (const b of world.bosses) out.push(`present:${b}`, `vex:${b}`)
  if (world.bosses.includes('frostMaster')) out.push('blueprint')
  if (world.bosses.includes('galeMaster')) out.push('reserve')
  if (world.bosses.includes('rotorMaster')) out.push('breach')
  if (world.bosses.includes('voltMaster')) out.push('voltHack')
  if (world.bosses.includes('vexMk1')) out.push('fortress', 'mk1:intro', 'mk1:signal')
  return out
}

/**
 * New sectors join the chain between old ones (the five Masters after the
 * Sky Docks): a save whose Master before a sector is already beaten opens
 * that sector now — the unlock it would have got at the time.
 */
export const migrateUnlocks = (world: WorldSave): void => {
  for (const s of SECTORS) {
    if (!s.after || world.unlocked.includes(s.id)) continue
    const before = SECTORS.find(o => o.id === s.after)
    if (before && world.bosses.includes(before.boss)) world.unlocked.push(s.id)
  }
}

/** Mark a story beat as shown, and save. */
export const markStorySeen = (beat: string): void => {
  if (profile.world.seen.includes(beat)) return
  profile.world.seen.push(beat)
  saveProfile()
}

/**
 * DEV ONLY: a level-lab test run (`/levels`, `flow.createBootMode`) plays on a
 * sandbox. While it is on, neither the profile nor the mission snapshot is
 * written, so nothing the run does (XP, loot, a boss marked beaten, a sector
 * unlocked, a resume point) reaches the save, and the run ends with a
 * `loadProfile()` that throws its changes away. Folds out of every build.
 * Nothing needs copying for it: the profile never holds one of the blob's
 * objects (`loadProfile` and `saveProfile` copy), so a run's changes cannot
 * ride out with an unrelated write (a volume change, a leaderboard mark).
 */
let saveSandbox = false
export const setSaveSandbox = (on: boolean): void => {
  saveSandbox = on
}

/** Persist the whole profile (a checkpoint). Cheap: one debounced blob write.
 *  The blob gets copies, so play after a checkpoint waits for the next one. */
export const saveProfile = (): void => {
  if (import.meta.env.DEV && saveSandbox) return
  setStates({
    [LEVEL_KEY]: profile.level,
    [BOLTS_KEY]: profile.bolts,
    [STORY_KEY]: profile.story,
    [QUESTS_DONE_KEY]: profile.questsDone,
    [HERO_KEY]: plain(profile.hero),
    [INVENTORY_KEY]: plain(profile.inv),
    [QUESTS_KEY]: plain(profile.quests),
    [WORLD_KEY]: plain(profile.world),
    [STATS_KEY]: plain(profile.stats),
    [TUTORIAL_KEY]: plain(profile.tips)
  })
}

/**
 * A new mission has begun (not a resume: that mission already had its turn):
 * a pending rewarded gift becomes one more Repair Gel, over the cap if need
 * be, and the flag clears so it is paid exactly once. Saved at once, so the
 * blob never holds the flag and the gel it became side by side.
 */
/**
 * Start New Game+ (`sim/ngPlus.ts`): the story from the Scrapyard again, one
 * cycle harder. Flux keeps everything he is — level, gear, chips, skills,
 * copied weapons, bolts, stats — and the tutorial stays done; the sectors
 * lock again and every Master waits to be beaten anew. Story beats already
 * seen do not replay, except the debriefs (#119): they are the story between
 * the missions, so each run tells it again, like the intro and the ending.
 */
export const startNewGamePlus = (): void => {
  const w = profile.world
  w.ngPlus = (w.ngPlus ?? 0) + 1
  w.unlocked = ['scrapyard']
  w.bosses = []
  w.selected = 'scrapyard'
  w.tutorialDone = true
  w.seen = w.seen.filter(s => !s.startsWith('debrief:'))
  profile.quests.storyAttempts = {}
  profile.quests.jobs = []
  saveProfile()
}

export const claimGiftTank = (): boolean => {
  if (!profile.inv.giftTank) return false
  profile.inv.giftTank = false
  profile.inv.tanks++
  saveProfile()
  return true
}

let loaded = false
/** Load once, and re-load whenever a cloud hydrate lands new data. */
export const initProfile = (): void => {
  if (loaded) return
  loaded = true
  loadProfile()
  watch(saveDataVersion, () => loadProfile())
}

// ─── Progression ─────────────────────────────────────────────────────────────

export const chipsAvailable = (): number => {
  // Mods are bought with bolts: a save that installed the old Overcharge with
  // a chip gets that chip back.
  return Math.max(0, profile.level - 1 - chipsSpent(profile.hero.skills))
}

export const xp01 = (): number => profile.hero.xp / Math.max(1, xpToNext(profile.level))

/** Grant XP; returns levels gained (each adds a chip and a pending attribute). */
/**
 * Lifetime XP: the leaderboard's score. A save from before the stat existed
 * (or any path that set the level without granting XP) is floored at what its
 * level and bar already prove, so the number can only ever grow.
 */
export const lifetimeXp = (): number =>
  Math.max(Math.round(profile.stats.xpEarned || 0), xpToReach(profile.level) + Math.round(profile.hero.xp))

export const grantXp = (amount: number): number => {
  // Counted in full, even past the level cap where the bar stops filling.
  profile.stats.xpEarned = lifetimeXp() + Math.max(0, Math.round(amount))
  const r = addXp(profile.level, profile.hero.xp, amount)
  profile.level = r.level
  profile.hero.xp = r.xp
  if (r.gained > 0) {
    profile.hero.pendingAttrs += r.gained
    profile.stats.bestLevel = Math.max(profile.stats.bestLevel, r.level)
  }
  return r.gained
}

export const chooseAttr = (a: Attr): boolean => {
  if (profile.hero.pendingAttrs <= 0) return false
  profile.hero.pendingAttrs--
  profile.hero.attrs[a]++
  saveProfile()
  return true
}

export const rankUpSkill = (id: string): boolean => {
  const node = SKILL_BY_ID[id]
  if (!node) return false
  const ranks = profile.hero.skills
  const cur = ranks[id] ?? 0
  if (node.mod) {
    if (!canBuyMod(node, ranks, profile.bolts, profile.hero.weapons)) return false
    profile.bolts -= node.mod.bolts
    ranks[id] = cur + 1
    saveProfile()
    return true
  }
  if (cur >= node.ranks || chipsAvailable() <= 0) return false
  if (node.req && (ranks[node.req.id] ?? 0) < node.req.rank) return false
  ranks[id] = cur + 1
  saveProfile()
  return true
}

export const respecSkills = (cost: number): boolean => {
  if (profile.bolts < cost) return false
  profile.bolts -= cost
  // Mods were bought with bolts and stay; only chips come back.
  profile.hero.skills = Object.fromEntries(Object.entries(profile.hero.skills).filter(([id]) => SKILL_BY_ID[id]?.mod))
  saveProfile()
  return true
}

// ─── Gear ────────────────────────────────────────────────────────────────────

export const itemById = (id: string | null): Item | null =>
  id ? profile.inv.items.find(i => i.id === id) ?? null : null

export const equipped = (slot: EquipSlot): Item | null => itemById(profile.inv.equipped[slot])

export const heroColors = (): HeroColors => {
  const c: HeroColors = { ...DEFAULT_HERO_COLORS }
  for (const s of ['helmet', 'chest', 'boots', 'buster'] as const) {
    const it = equipped(s)
    const tint = it ? BASE_BY_ID[it.base]?.tint : undefined
    if (tint) Object.assign(c, Object.fromEntries(Object.entries(tint).filter(([, v]) => v)))
  }
  const w = profile.hero.slots[0]
  if (w) {
    c.buster = WEAPONS[w].shell
    c.core = WEAPONS[w].color
  }
  return c
}

// ─── Derived combat stats ────────────────────────────────────────────────────

/** `attrs` is the profile's own unless given: the level-up pick passes a copy
 *  with one more point to show what a card would give BEFORE it is chosen
 *  (the Frame's percentage node makes "+10" not always +10 max HP). */
export const computeStats = (attrs: Record<Attr, number> = profile.hero.attrs): PlayerStats => {
  const s = baseStats()
  const sk = (id: string) => profile.hero.skills[id] ?? 0
  const aff: Record<string, number> = {}
  let armor = 0
  let busterMain = 10
  for (const slot of EQUIP_SLOTS) {
    const it = equipped(slot)
    if (!it) continue
    const base = BASE_BY_ID[it.base]
    if (!base) continue
    if (it.slot === 'buster') busterMain = mainStat(it)
    else if (it.slot !== 'chip') armor += mainStat(it)
    const all = [...it.affixes, ...(base.implicit ? [base.implicit] : [])]
    for (const a of all) aff[a.id] = (aff[a.id] ?? 0) + a.v
  }
  armor += aff.armor ?? 0
  const lvl = profile.level
  s.level = lvl
  s.maxHp = Math.round((100 + attrs.hp * ATTR_GAIN.hp + (aff.hp ?? 0)) * (1 + 0.08 * sk('frame')))
  s.maxWe = 28 + attrs.we * ATTR_GAIN.we + sk('cells') * 3 + Math.round(aff.we ?? 0)
  s.maxPower = 100 + attrs.power * ATTR_GAIN.power + Math.round(aff.power ?? 0)
  s.busterDmg = Math.round(busterMain * (1 + 0.03 * (lvl - 1)))
  s.pelletMul = 1 + 0.1 * sk('rapid') + (aff.pelletDmg ?? 0)
  s.chargeDmgMul = 1 + 0.12 * sk('megaCharge') + (aff.chargeDmg ?? 0)
  s.chargeTimeMul = Math.max(0.45, (1 - 0.1 * sk('quickCharge')) * (1 - (aff.chargeSpeed ?? 0)))
  s.perfectMul = 1 + 0.25 * sk('perfectTiming')
  s.critMul = 1.5 + 0.15 * sk('perfectTiming') + (aff.critDmg ?? 0)
  s.critChance = Math.min(0.5, aff.crit ?? 0)
  s.damageTakenMul = 100 / (100 + armor)
  s.blockCostMul = 1 - 0.15 * sk('barrier')
  s.blockDmgMul = 1 - 0.2 * sk('barrier')
  s.parryBonus = 0.05 * sk('parry')
  s.parryStunBonus = 0.3 * sk('parry')
  s.regen = 0.01 * sk('autoRepair') + (aff.regen ?? 0)
  s.reflectPct = 0.15 * sk('spikes')
  s.lastStand = sk('lastStand') > 0
  s.specialMul = 1 + 0.1 * sk('mastery') + (aff.special ?? 0)
  s.weCostMul = 1 - 0.1 * sk('efficient')
  s.slideCdMul = 1 - 0.15 * sk('boosters')
  s.slideCost = 25 - 5 * sk('boosters')
  s.boltMul = 1 + 0.15 * sk('magnet') + (aff.bolts ?? 0)
  s.magnetMul = 1 + 0.4 * sk('magnet') + (aff.magnet ?? 0)
  s.tanksMax = 2 + sk('tankCap')
  s.piercing = sk('piercing') > 0
  s.giga = sk('giga') > 0
  s.moveMul = 1 + (aff.moveSpeed ?? 0)
  return s
}

export const isEquipped = (id: string): EquipSlot | null => {
  for (const s of EQUIP_SLOTS) if (profile.inv.equipped[s] === id) return s
  return null
}

/** Equip an item into its slot (chips: the free chip socket, else socket 1). */
export const equipItem = (id: string, socket?: EquipSlot): EquipSlot | null => {
  const it = itemById(id)
  if (!it) return null
  let slot: EquipSlot
  if (it.slot === 'chip') {
    const cur = isEquipped(id)
    if (cur) return cur
    slot = socket && (socket === 'chip1' || socket === 'chip2') ? socket
      : !profile.inv.equipped.chip1 ? 'chip1' : !profile.inv.equipped.chip2 ? 'chip2' : 'chip1'
  } else {
    slot = it.slot
  }
  profile.inv.equipped[slot] = id
  markSeen(id)
  saveProfile()
  return slot
}

export const unequipChip = (slot: 'chip1' | 'chip2'): void => {
  profile.inv.equipped[slot] = null
  saveProfile()
}

export const markSeen = (id: string): void => {
  const i = profile.inv.fresh.indexOf(id)
  if (i >= 0) profile.inv.fresh.splice(i, 1)
}

/** Break an item down for bolts. Equipped items cannot be salvaged. */
export const salvageItem = (id: string, value: number): boolean => {
  if (isEquipped(id)) return false
  const i = profile.inv.items.findIndex(x => x.id === id)
  if (i < 0) return false
  profile.inv.items.splice(i, 1)
  markSeen(id)
  profile.bolts += value
  saveProfile()
  return true
}

export const upgradeItem = (id: string, cost: number, max: number): boolean => {
  const it = itemById(id)
  if (!it || it.upg >= max || profile.bolts < cost) return false
  profile.bolts -= cost
  it.upg++
  saveProfile()
  return true
}

/** The equipped armor total (for the Hero screen). */
export const armorTotal = (): number => {
  let armor = 0
  for (const slot of EQUIP_SLOTS) {
    const it = equipped(slot)
    if (!it || it.slot === 'buster' || it.slot === 'chip') continue
    armor += mainStat(it)
    for (const a of it.affixes) if (a.id === 'armor') armor += a.v
    const imp = BASE_BY_ID[it.base]?.implicit
    if (imp?.id === 'armor') armor += imp.v
  }
  return Math.round(armor)
}

export const markTip = (id: string): void => {
  if (profile.tips[id]) return
  profile.tips[id] = true
  saveProfile()
}

// ─── Mission snapshot (resume) ───────────────────────────────────────────────

/** The tutorial walkthrough's progress (`sim/walkthrough.ts`). */
export interface WalkthroughSave {
  /** Gates passed: that many doors along the path are open. */
  gate: number
  /** The crate lesson's crate is broken. */
  crate: boolean
  /** The player has blocked (or parried) at least once this mission. */
  block: boolean
  /** …and slid at least once. */
  slide: boolean
  /** …and crossed a gap with an edge-leap (the built tutorial's gap room). */
  leap?: boolean
}

export interface MissionSnapshot {
  quest: Quest
  killed: number[]
  opened: number[]
  doors: number[]
  collected: number[]
  progress: number
  x: number
  z: number
  yaw: number
  hp: number
  we: number
  bolts: number
  xp: number
  kills: number
  t: number
  done: boolean
  /** Tutorial only; a tutorial snapshot without it predates the walkthrough. */
  walk?: WalkthroughSave
  /** Climb and platform stages only: the last checkpoint reached (−1 = the
   *  pad; a resume starts there), the reward ledges already emptied, the
   *  secrets opened and each stage feature's own save (`sim/climb.ts`). */
  climb?: { cp: number; got: number[]; open?: number[]; feat?: unknown[] }
  /** The borrowed weapon (`sim/borrowed.ts`): the weapon carried and its
   *  charges left, and the capsules already taken. Never in the profile. */
  borrowed?: { w: string; shots: number; got: number[] }
  /** The Fortress's last checkpoint as a snapshot of its own (full health,
   *  everything as it stood there): "Retry from checkpoint" restarts the
   *  mission from it. Kept in the resume snapshot so it survives a reload. */
  checkpoint?: MissionSnapshot
  /** This snapshot IS a checkpoint (a retry started from it). */
  atCheckpoint?: boolean
  /** The Core Descent (#109): the stage Vex is fought in and his health. */
  vex?: { stage: number; hp: number }
}

/** The retry point a mission built from `s` keeps: `s` itself when it is a
 *  checkpoint (a retry), else the one it carried (a reload), else none. Never
 *  nested: a checkpoint does not carry another. */
export const retryPointOf = (s: MissionSnapshot): MissionSnapshot | null =>
  s.atCheckpoint ? { ...s, checkpoint: undefined } : s.checkpoint ?? null

/** The resume point, as a copy (the mission it seeds is not a checkpoint). */
export const readSnapshot = (): MissionSnapshot | null => {
  const s = getState<MissionSnapshot | null>(MISSION_KEY, null)
  return s && typeof s === 'object' && s.quest ? plain(s) : null
}

export const writeSnapshot = (s: MissionSnapshot | null): void => {
  if (import.meta.env.DEV && saveSandbox) return
  setStates({ [MISSION_KEY]: s ? plain(s) : null })
}

// ─── Income-scaled rewards ─────────────────────────────────────────────────

/** Fold a won mission's bolts into the running income average. */
export const noteMissionIncome = (bolts: number): void => {
  const a = profile.stats.boltsAvg || 0
  profile.stats.boltsAvg = a <= 0 ? bolts : a + (bolts - a) * 0.35
}

/** The Workshop's rewarded supply drop: about half a mission's income, so the
 *  ad stays worth a look however far the player is (the flat level formula
 *  fell far behind real mission pay). Never under the old flat amount. */
export const supplyDropBolts = (): number => {
  const flat = 40 + 20 * profile.level
  const half = 0.5 * (profile.stats.boltsAvg || 0)
  return Math.round(Math.max(flat, half) / 5) * 5
}
