import { reactive, watch } from 'vue'
import { app } from './engine/app'
import type { Quest } from './data/quests'
import { rollJob, storyQuest, tutorialQuest, climbJob, climbSectors } from './data/quests'
import { SECTORS, SECTOR_BY_ID } from './data/regions'
import { rollItem, type Item } from './data/items'
import { WEAPONS, type WeaponId } from './data/weapons'
import {
  profile, saveProfile, computeStats, grantXp, readSnapshot, writeSnapshot, type MissionSnapshot, lifetimeXp,
  loadProfile, setSaveSandbox, markStorySeen, noteMissionIncome, startNewGamePlus
} from './state/profile'
import { hud } from './state/hud'
import { flushSaveNow, saveDataVersion } from '@/use/useSaveStatus'
import { setMusicTrack, startGameMusic } from '@/use/useSound'
import { showMidgameAd } from '@/use/useAds'
import { canShowInterstitial, markInterstitialShown } from '@/use/useAdGate'
import { isAdShowing } from '@/use/useGamePause'
import { triggerHappytime } from '@/use/useCrazyGames'
import { playJingle } from './audio/music'
import { afterPaint } from './engine/slicer'
import { reportRun } from '@/use/useLeaderboard'
import { joinPortalBoard, reportPortalBest } from '@/use/usePortalLeaderboard'
import type { SectorId } from './world/themes'
import { debriefFor, debriefSeen, type DebriefPlan } from './story/debriefScript'
import { hubSceneFor } from './story/vexScenes'

/**
 * ─── Game flow ───────────────────────────────────────────────────────────────
 *
 * The director between the two modes: a MISSION (the 3D first-person sector)
 * and the HUB (Gauss's lab — missions, gear, circuits). It owns mission
 * start / resume / finish, reward payout, sector unlocks and the job board.
 *
 * Modes are created lazily through the registered factories so this module
 * does not import the heavy mission/hub code itself.
 */

export type Screen = 'boot' | 'mission' | 'hub' | 'intro' | 'ending' | 'debrief'
export type Modal = '' | 'results' | 'defeat' | 'pause' | 'levelUp' | 'controls'

export interface ResultsData {
  quest: Quest
  success: boolean
  xp: number
  bolts: number
  kills: number
  chests: number
  items: Item[]
  levelBefore: number
  levelAfter: number
  seconds: number
  weapon: WeaponId | null
  unlocked: SectorId | null
}

export const flow = reactive({
  screen: 'boot' as Screen,
  modal: '' as Modal,
  results: null as ResultsData | null,
  quest: null as Quest | null,
  /** Mission-side counters mirrored for the results screen. */
  levelAtStart: 1,
  /** A mission is being built behind the hub → mission beam overlay. */
  loading: false,
  /** The Master a story mission being built ends with (the loading screen's
   *  boss splash), or '' for a job. */
  loadingBoss: '' as string,
  /** 0..1 progress of that build. */
  loadProgress: 0,
  /** The sector being built (the overlay's label). */
  loadingSector: '' as SectorId | '',
  /** A new player's first play, from the intro going live to the first
   *  mission's first moment of control: the portals count it as ONE play
   *  (`use/useGameplayLifecycle.ts`). Never a replay from Options. */
  introPlay: false
})

type MissionFactory = (
  quest: Quest, snapshot: MissionSnapshot | null, onProgress?: (p01: number) => void
) => Promise<import('./engine/app').GameMode>
type HubFactory = () => import('./engine/app').GameMode
/** The intro cutscene (`story/intro.ts`), as far as the flow drives it. */
export interface IntroHandle extends Pick<import('./engine/app').GameMode, 'scene' | 'camera' | 'update' | 'render' | 'dispose' | 'enter'> {
  skip(): void
  /** End it now, without its end callback (a cloud save took over). */
  abort(): void
}
type IntroFactory = (opts: {
  replay: boolean
  onStart: () => void
  onLive: () => void
  onEnd: (skipped: boolean) => void
}) => IntroHandle
/** The ending (`story/ending.ts`), as far as the flow and its layer drive it. */
export interface EndingHandle extends Pick<import('./engine/app').GameMode, 'scene' | 'camera' | 'update' | 'render' | 'dispose' | 'enter'> {
  skip(): void
  advance(): void
  choose(choice: 'ngplus' | 'lab'): void
}
type EndingFactory = (opts: { onEnd: (choice: 'ngplus' | 'lab') => void }) => Promise<EndingHandle>
/** The debrief after a story mission (`story/debrief.ts`, #119), as far as the flow and its layer drive it. */
export interface DebriefHandle extends Pick<import('./engine/app').GameMode, 'scene' | 'camera' | 'update' | 'render' | 'dispose' | 'enter'> {
  skip(): void
  advance(): void
}
type DebriefFactory = (opts: { plan: DebriefPlan; hello: boolean; onEnd: () => void }) => Promise<DebriefHandle>
let missionFactory: MissionFactory | null = null
let hubFactory: HubFactory | null = null
let introFactory: IntroFactory | null = null
let endingFactory: EndingFactory | null = null
let debriefFactory: DebriefFactory | null = null

export const registerModeFactories = (m: MissionFactory, h: HubFactory, i?: IntroFactory, e?: EndingFactory, d?: DebriefFactory): void => {
  missionFactory = m
  hubFactory = h
  introFactory = i ?? null
  endingFactory = e ?? null
  debriefFactory = d ?? null
}

/** The debrief playing now (its layer's buttons and the skip keys drive it). */
export let debriefLive: DebriefHandle | null = null

/**
 * The debrief the save still owes (#119): the last Core Master beaten whose
 * return to the Lab was never told. Read from the SAVE: it used to be a
 * note in memory between the result screen and Continue, and anything that
 * dropped the page in between (a reload, a tab the browser put away) lost
 * the film for good.
 */
export const dueDebrief = (): DebriefPlan | null => {
  const { bosses, seen } = profile.world
  const last = bosses[bosses.length - 1]
  if (!last || seen.includes(debriefSeen(last))) return null
  return debriefFor(last)
}

/** A game that boots into the Lab with a debrief still owed plays it on the
 *  first press there: the browser gives no sound before one, and the film is
 *  voiced. The press itself is spent on it (it opens no menu under the film). */
const oweDebriefAtBoot = (): void => {
  if (typeof window === 'undefined' || !debriefFactory || !dueDebrief()) return
  const go = (e: Event): void => {
    if (flow.screen !== 'hub') { stop(); return }
    if (flow.modal) return
    const plan = dueDebrief()
    stop()
    if (!plan) return
    e.stopPropagation()
    e.preventDefault()
    void startDebrief(plan)
  }
  const stop = (): void => {
    window.removeEventListener('click', go, true)
    window.removeEventListener('keydown', go, true)
  }
  window.addEventListener('click', go, true)
  window.addEventListener('keydown', go, true)
}

/**
 * The debrief (#119): after a story mission's results (and the interstitial,
 * if one was due — never during it), the city from above and Pip's briefing
 * on what comes next; then the Lab. Once per Master and run (New Game+ tells it again), like every story
 * beat; the Vex scene that Master had in the Lab plays inside it and counts
 * as seen. Without the film (a build or a test with no factory), the Lab.
 */
export const startDebrief = async (plan: DebriefPlan): Promise<void> => {
  if (!debriefFactory) { goHub(); return }
  flow.modal = ''
  flow.screen = 'debrief'
  hud.phase = 'done'
  hud.combat = false
  hud.bossName = ''
  // Seen at the start: a quit mid-film never replays it. Pip's welcome is for the very first one.
  const hello = !profile.world.seen.some(s => s.startsWith('debrief:'))
  markStorySeen(debriefSeen(plan.boss))
  void flushSaveNow()
  const vex = hubSceneFor(plan.boss)
  if (vex) markStorySeen(vex.seen)
  try {
    const m = await debriefFactory({
      plan,
      hello,
      onEnd: () => {
        debriefLive = null
        goHub()
      }
    })
    debriefLive = m
    app.setMode(m)
    app.setWanted(true)
  } catch (e) {
    // The film's chunk did not load: the story is not worth a dead end.
    console.warn('[flow] debrief failed to load', e)
    debriefLive = null
    goHub()
  }
}

/** The ending playing now (its layer's buttons drive it). */
export let endingLive: EndingHandle | null = null
/** The Fortress was just won: the ending follows its results (#102). */
let pendingEnding = false

/**
 * The ending (#102), after the Fortress's results (and the interstitial, if
 * one was due — never during it). Its card offers a New Game+ run or the lab.
 */
export const startEnding = async (): Promise<void> => {
  if (!endingFactory) { goHub(); return }
  flow.modal = ''
  flow.screen = 'ending'
  hud.phase = 'done'
  hud.combat = false
  hud.bossName = ''
  const m = await endingFactory({
    onEnd: (choice) => {
      endingLive = null
      if (!profile.world.seen.includes('ending')) profile.world.seen.push('ending')
      if (choice === 'ngplus') startNewGamePlus()
      saveProfile()
      goHub()
    }
  })
  endingLive = m
  app.setMode(m)
  app.setWanted(true)
}

/**
 * The intro cutscene ships on every build unless the build switches it off
 * (`VITE_APP_INTRO=false`, `story.md` § Decisions), wherever a portal's
 * conversion-to-play drops. A const, so a build without it folds the check.
 */
export const INTRO_ENABLED = import.meta.env.VITE_APP_INTRO !== 'false'

export type BootTarget =
  | { kind: 'mission'; quest: Quest; snapshot: MissionSnapshot | null }
  | { kind: 'hub' }
  | { kind: 'intro' }

/** What the game should boot into (no main menu — straight into a scene). */
export const bootTarget = (introOn: boolean = INTRO_ENABLED): BootTarget => {
  const snap = readSnapshot()
  // A tutorial left before the guided walkthrough existed has no walkthrough
  // progress to resume (and another map): it starts over. Its XP and bolts
  // were banked live.
  const stale = snap?.quest.template === 'tutorial' && !snap.walk
  if (snap && !snap.done && !stale) return { kind: 'mission', quest: snap.quest, snapshot: snap }
  if (!profile.world.tutorialDone) {
    // A first-timer sees the intro once; the tutorial builds behind it. The
    // save is hydrated before the scene boots (main.ts awaits it), so a
    // returning player on a new device reads as returning here.
    // Any snapshot at all (even a stale one) means they have played before.
    if (introOn && !snap && !profile.world.seen.includes('intro')) return { kind: 'intro' }
    return { kind: 'mission', quest: tutorialQuest(), snapshot: null }
  }
  return { kind: 'hub' }
}

// ─── Level-lab test runs (DEV ONLY) ──────────────────────────────────────────

/**
 * The running mission is a test run from the level lab (`views/LevelLab.vue`,
 * whose Play loads `#/?level=…`). It plays on the save sandbox
 * (`setSaveSandbox`): nothing it does is written, so no XP, loot, boss, sector
 * or story step reaches the save, the real resume point stays as it was, and
 * no leaderboard hears of it. It ends back in the lab with the profile re-read
 * from that untouched save. Every use sits behind `import.meta.env.DEV`, so
 * none of this ships.
 */
let testRun = false

export const isTestRun = (): boolean => import.meta.env.DEV && testRun

/** End a test run, if one is on: throw away what it changed in memory. */
export const endTestRun = (): void => {
  if (!import.meta.env.DEV || !testRun) return
  testRun = false
  loadProfile()
  setSaveSandbox(false)
}

/** The level a `#/?level=…` address asks for, as the boot target (ahead of a
 *  resume or the tutorial), with the sandbox on. Null: an ordinary boot. */
const testBootTarget = async (): Promise<{ kind: 'mission'; quest: Quest; snapshot: null } | null> => {
  endTestRun()
  const { levelFromHash } = await import('./data/levelCatalog')
  const quest = levelFromHash(location.hash)
  if (!quest) return null
  testRun = true
  setSaveSandbox(true)
  return { kind: 'mission', quest, snapshot: null }
}

/** Continue after a test run: no break, straight back to the lab, with the
 *  level still selected (the game route's `?level=…` is the lab's query). */
const leaveTestRun = async (): Promise<void> => {
  flow.modal = ''
  endTestRun()
  const { default: router } = await import('@/router')
  await router.push({ name: 'levels', query: router.currentRoute.value.query })
}

/** Build the first scene (a resumed mission, the tutorial or the hub). Async:
 *  a mission build is time-sliced so the boot loader keeps moving. */
export const createBootMode = async (onProgress?: (p01: number) => void): Promise<import('./engine/app').GameMode> => {
  // The portal's OWN leaderboard (Playgama's SaaS board, when the build carries
  // one): a player with no row yet joins it on arrival — a first-timer as its
  // last row, a returning player at their lifetime XP. Once per player, never
  // awaited, a no-op on every build without a portal board. The save is
  // hydrated by now (main.ts awaits it before the App mounts).
  void joinPortalBoard(lifetimeXp())
  const t = (import.meta.env.DEV && await testBootTarget()) || bootTarget(INTRO_ENABLED && !!introFactory)
  if (t.kind === 'intro') {
    const m = beginIntro(false)
    onProgress?.(1)
    return m
  }
  if (t.kind === 'mission') {
    flow.quest = t.quest
    flow.screen = 'mission'
    flow.levelAtStart = profile.level
    setMusicTrack(t.quest.sector)
    return missionFactory!(t.quest, t.snapshot, onProgress)
  }
  flow.screen = 'hub'
  hud.phase = 'hub'
  setMusicTrack('hub')
  const h = hubFactory!()
  onProgress?.(1)
  oweDebriefAtBoot()
  return h
}

// ─── The intro cutscene ──────────────────────────────────────────────────────
//
// It is the loader (`story.md` § Intro): the cutscene's set is the boot scene
// (the splash leaves as it starts, so a portal's first-load ad lands before
// shot 1 and the cutscene waits frozen under it), and the tutorial builds
// BEHIND it while it plays. At the flash the tutorial takes over with its own
// beam-in; if the build is not done yet — or the player skipped early — the
// mission beam overlay (`MissionLoading`) holds until it is. Skipping never
// costs time, and nobody who watches sees a frozen frame.

interface Behind {
  quest: Quest
  build: Promise<import('./engine/app').GameMode>
  mode: import('./engine/app').GameMode | null
}
/** The tutorial building behind the intro. */
let behind: Behind | null = null
let introLive: IntroHandle | null = null
let stopCloudWatch: (() => void) | null = null

/** Make the intro the scene (the boot, or a replay from Options). */
const beginIntro = (replay: boolean): IntroHandle => {
  flow.screen = 'intro'
  flow.modal = ''
  hud.phase = 'boot'
  // The intro's own score starts when the cutscene goes live (`IntroMode.enter`).
  const m = introFactory!({
    replay,
    onStart: () => {
      performance.mark('boot:intro-start')
      if (!replay) buildBehindIntro()
    },
    // The film runs (the start gate, if there was one, has been pressed).
    onLive: () => { flow.introPlay = !replay },
    onEnd: (skipped) => { void finishIntro(replay, skipped) }
  })
  introLive = m
  return m
}

const buildBehindIntro = (): void => {
  if (behind || !missionFactory) return
  const quest = tutorialQuest()
  flow.loadProgress = 0
  const b: Behind = { quest, mode: null, build: null as unknown as Behind['build'] }
  b.build = missionFactory(quest, null, (p) => { flow.loadProgress = p }).then((m) => {
    b.mode = m
    performance.mark('boot:tutorial-built')
    return m
  })
  behind = b
  watchCloudDuringIntro()
}

/**
 * A cloud save that arrives mid-intro with progress on it ends the intro: the
 * player has been here before (on another device). Whatever the save says to
 * boot into takes over, and the tutorial built behind is thrown away.
 */
const watchCloudDuringIntro = (): void => {
  stopCloudWatch?.()
  stopCloudWatch = watch(saveDataVersion, () => {
    if (flow.screen !== 'intro' || !introLive) return
    const t = bootTarget(false)
    if (t.kind === 'mission' && t.quest.template === 'tutorial' && !t.snapshot) return
    stopCloudWatch?.()
    stopCloudWatch = null
    void abandonIntro(t)
  })
}

const dropBehind = (): void => {
  const b = behind
  behind = null
  if (b) void b.build.then(m => m.dispose(), () => {})
}

const abandonIntro = async (t: BootTarget): Promise<void> => {
  introLive?.abort()
  introLive = null
  flow.introPlay = false
  dropBehind()
  markStorySeen('intro')
  performance.mark('boot:intro-end')
  if (t.kind === 'mission') await startMission(t.quest, t.snapshot)
  else goHub()
}

/** The intro ended (watched or skipped): record it, then hand over. */
const finishIntro = async (replay: boolean, _skipped: boolean): Promise<void> => {
  introLive = null
  stopCloudWatch?.()
  stopCloudWatch = null
  performance.mark('boot:intro-end')
  markStorySeen('intro')
  void flushSaveNow()
  if (replay) {
    goHub()
    return
  }
  if (!behind) buildBehindIntro()
  const b = behind!
  // The sector's music now, even if the build still holds the beam overlay.
  setMusicTrack(b.quest.sector)
  if (!b.mode) {
    // Still building: the mission beam overlay holds until it is ready.
    flow.loadingSector = b.quest.sector
    flow.loading = true
  }
  try {
    const m = await b.build
    if (behind !== b) return
    behind = null
    flow.quest = b.quest
    flow.modal = ''
    flow.results = null
    flow.levelAtStart = profile.level
    flow.screen = 'mission'
    setMusicTrack(b.quest.sector)
    startGameMusic()
    app.setMode(m)
    app.setWanted(true)
  } catch (e) {
    console.error('[intro] tutorial build failed', e)
    behind = null
    flow.loading = false
    await startMission(b.quest)
  } finally {
    flow.loading = false
  }
}

/** Options → Replay intro (the hub only). It ends back in the hub. */
export const replayIntro = (): void => {
  if (!introFactory || flow.screen !== 'hub' || flow.loading) return
  const m = beginIntro(true)
  app.setMode(m)
  app.setWanted(true)
}

/** For tests: forget the intro's state between cases. */
export const __resetIntro = (): void => {
  stopCloudWatch?.()
  stopCloudWatch = null
  behind = null
  introLive = null
}

/**
 * Hub → mission. The sector is built BEHIND the beam overlay (`flow.loading`),
 * time-sliced so the lab keeps animating and the bar keeps filling, and the
 * mission only takes over once it is complete, shaders included. A Deploy tap
 * therefore answers at once instead of freezing the hub for the whole build.
 */
export const startMission = async (quest: Quest, snapshot: MissionSnapshot | null = null): Promise<void> => {
  if (!missionFactory || flow.loading) return
  flow.loading = true
  flow.loadProgress = 0
  flow.loadingSector = quest.sector
  flow.loadingBoss = quest.template === 'stage' || quest.template === 'boss' ? SECTOR_BY_ID[quest.sector].boss : ''
  try {
    // The beam is on screen before the build starts, and the lab stops
    // drawing behind it: the build gets the whole CPU (the overlay covers
    // the last frame, which simply stays put).
    await afterPaint()
    app.setWanted(false)
    const m = await missionFactory(quest, snapshot, (p) => { flow.loadProgress = p })
    flow.quest = quest
    flow.modal = ''
    flow.results = null
    flow.levelAtStart = profile.level
    flow.screen = 'mission'
    setMusicTrack(quest.sector)
    startGameMusic()
    app.setMode(m)
  } finally {
    app.setWanted(true)
    flow.loading = false
  }
}

/** "Retry from checkpoint": the mission again, from that snapshot. */
export const retryFromSnapshot = async (s: MissionSnapshot): Promise<void> => {
  flow.modal = ''
  await startMission(s.quest, s)
}

export const goHub = (): void => {
  if (!hubFactory) return
  flow.modal = ''
  flow.introPlay = false
  flow.screen = 'hub'
  hud.phase = 'hub'
  hud.combat = false
  hud.targetName = ''
  hud.bossName = ''
  setMusicTrack('hub')
  startGameMusic()
  const h = hubFactory()
  app.setMode(h)
  app.setWanted(true)
  ensureJobs()
}

// ─── Rewards ─────────────────────────────────────────────────────────────────

export interface MissionTally {
  xp: number
  bolts: number
  kills: number
  chests: number
  items: Item[]
  seconds: number
}

/** Mission over (success = objective done and beamed out). XP and bolts from
 *  kills were already granted live; this pays the QUEST reward on top, saves,
 *  and reveals the results. The interstitial comes AFTER them, on Continue
 *  (`leaveResults`). */
export const finishMission = async (success: boolean, tally: MissionTally): Promise<void> => {
  const quest = flow.quest
  if (!quest) return
  const levelBefore = flow.levelAtStart
  let xp = tally.xp
  let bolts = tally.bolts
  const items = [...tally.items]
  let weapon: WeaponId | null = null
  let unlocked: SectorId | null = null
  profile.stats.missions++
  if (success) {
    xp += quest.reward.xp
    bolts += quest.reward.bolts
    grantXp(quest.reward.xp)
    profile.bolts += quest.reward.bolts
    noteMissionIncome(bolts)
    profile.questsDone++
    const it = rollItem((quest.seed ^ 0xa11) >>> 0, quest.level, { bias: quest.reward.rarityBias, rarity: quest.reward.guaranteed })
    profile.inv.items.push(it)
    profile.inv.fresh.push(it.id)
    items.push(it)
    if (quest.template === 'tutorial') {
      profile.world.tutorialDone = true
    }
    // The tutorial IS the Scrapyard's story mission: its mini-boss (the
    // Scrapper) counts as that sector's Core Master.
    if (quest.kind === 'story') {
      // The Fortress (Vex and the Grand Master) won: the ending follows.
      if (quest.sector === 'fortress') pendingEnding = true
      const sector = SECTOR_BY_ID[quest.sector]
      if (!profile.world.bosses.includes(sector.boss)) {
        profile.world.bosses.push(sector.boss)
        profile.story++
        // The story moves on: its debrief follows the results, once per run
        // (`dueDebrief` reads it off the save). A Master's FIRST fall in a
        // run owes it whatever the flags say: a "seen" left over from an
        // earlier run (a New Game+ begun before its flags were cleared, a
        // migration) used to swallow every debrief of the run.
        const stale = debriefSeen(sector.boss)
        if (profile.world.seen.includes(stale)) profile.world.seen = profile.world.seen.filter(s => s !== stale)
        const w = (Object.values(WEAPONS).find(d => d.from === sector.boss))
        if (w) weapon = grantWeapon(w.id)
        const next = SECTORS.find(s => s.after === sector.id)
        if (next && !profile.world.unlocked.includes(next.id)) {
          profile.world.unlocked.push(next.id)
          unlocked = next.id
        }
      }
    }
    if (quest.kind === 'job') {
      profile.quests.jobs = profile.quests.jobs.filter(j => j.id !== quest.id)
    }
  } else {
    profile.stats.deaths++
    if (quest.kind === 'story') profile.quests.storyAttempts[quest.id] = (profile.quests.storyAttempts[quest.id] ?? 0) + 1
  }
  profile.stats.playSeconds += Math.round(tally.seconds)
  writeSnapshot(null)
  ensureJobs()
  saveProfile()
  void flushSaveNow()
  const results: ResultsData = {
    quest, success, xp, bolts, kills: tally.kills, chests: tally.chests, items, levelBefore,
    levelAfter: profile.level, seconds: tally.seconds, weapon, unlocked
  }
  // No ad of our own here (it plays after Continue), but an ad another
  // placement started may still be up, and the results must not open under it.
  await waitForAdGate()
  flow.results = results
  if (success) triggerHappytime()
  playJingle(success ? 'victory' : 'defeat')
  flow.modal = 'results'
  // A level-lab test run posts nowhere: its XP is thrown away on the way out.
  if (import.meta.env.DEV && testRun) return
  // The leaderboard, AFTER the result screen is up and never awaited: it is a
  // decoration on a game that works without it, and a captive-portal wifi
  // login must not stand between the player and their rewards. Lifetime XP
  // also grew on a defeat (kills pay live), so both outcomes report; `force`
  // makes the number a mission ended on always land.
  void reportRun(lifetimeXp(), profile.level, { force: true })
  // …and to the portal's own board. The score is lifetime XP, which only ever
  // grows and grows on a defeat too, so every mission end is a moment a new
  // best can exist; `reportPortalBest` posts only when it beats what the portal
  // already accepted. On YouTube Playables (same archive) Bridge forwards it as
  // `ytgame.engagement.sendScore` — the same number the save holds.
  void reportPortalBest(lifetimeXp())
}

/** Longest we hold a screen for an ad that another placement left on screen.
 *  The provider caps its own waits; this only guards the gate. */
const AD_GATE_WAIT_MS = 8000

/**
 * Wait until no ad is up. An ad started by another placement (the QA trigger,
 * the first-load ad) may still be showing, and opening a screen under it would
 * put the ad on top of that screen.
 */
const waitForAdGate = async (): Promise<void> => {
  const t0 = Date.now()
  while (isAdShowing.value && Date.now() - t0 < AD_GATE_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** True from Continue until the hub is up, so a double tap asks for one ad. */
let leavingResults = false

/**
 * Continue on the result screen: close it, play the interstitial if one is
 * due, and only then go home. Every mission end offers this break, won or
 * failed; the shared pacing clock (`canShowInterstitial`) decides whether an
 * ad actually runs.
 *
 * The screen closes FIRST, so the ad never opens on top of it (portal QA). The
 * mission stays frozen behind the ad: `showMidgameAd` flips `isAdShowing`
 * before its first await, which suspends the loop and the audio. Going home
 * AFTER the ad also brings the music back: the ad hard-stops it and clears the
 * play intent, and `goHub` starts the hub track.
 */
export const leaveResults = async (): Promise<void> => {
  if (import.meta.env.DEV && testRun) return leaveTestRun()
  if (leavingResults) return
  leavingResults = true
  flow.modal = ''
  try {
    if (canShowInterstitial()) {
      markInterstitialShown()
      await showMidgameAd()
    }
    await waitForAdGate()
  } finally {
    leavingResults = false
    const debrief = dueDebrief()
    if (pendingEnding) {
      pendingEnding = false
      void startEnding()
    } else if (debrief) void startDebrief(debrief)
    else goHub()
  }
}

const grantWeapon = (id: WeaponId): WeaponId | null => {
  if (profile.hero.weapons.includes(id)) return null
  profile.hero.weapons.push(id)
  if (!profile.hero.slots[0]) profile.hero.slots[0] = id
  else if (!profile.hero.slots[1]) profile.hero.slots[1] = id
  return id
}

// ─── Job board ───────────────────────────────────────────────────────────────

/** The one-time flag (in `profile.tips`) that the first climb was put on the
 *  board. A flag rather than a save field: old saves load as they are. */
const CLIMB_OFFERED = 'climbOffered'

/** Sectors a Tower Run may roll in right now: their boss is down. */
const climbsNow = () => climbSectors(profile.world.unlocked, profile.world.bosses)

/**
 * Keep three jobs on the board, drawn from the unlocked sectors. The first
 * time a climb becomes possible (the Scrapper is down: straight after the
 * tutorial) one is put on the board — the newest job makes way for it — so
 * nobody has to reroll to find out the tower exists. After that it rolls like
 * any other job.
 */
export const ensureJobs = (): void => {
  const q = profile.quests
  const sectors = profile.world.unlocked
  const climbs = climbsNow()
  while (q.jobs.length < 3) {
    q.jobSeed = (q.jobSeed * 1103515245 + 12345) >>> 0
    q.jobs.push(rollJob(q.jobSeed, sectors, profile.level, climbs, profile.world.ngPlus))
  }
  if (climbs.length && !profile.tips[CLIMB_OFFERED]) {
    profile.tips[CLIMB_OFFERED] = true
    if (!q.jobs.some(j => j.template === 'climb')) {
      q.jobSeed = (q.jobSeed * 1103515245 + 12345) >>> 0
      q.jobs[q.jobs.length - 1] = climbJob(q.jobSeed, climbs, profile.level, profile.world.ngPlus)
    }
  }
}

export const rerollJob = (id: string): void => {
  const q = profile.quests
  const i = q.jobs.findIndex(j => j.id === id)
  if (i < 0) return
  q.jobSeed = (q.jobSeed * 1103515245 + 12345) >>> 0
  q.jobs[i] = rollJob(q.jobSeed, profile.world.unlocked, profile.level, climbsNow(), profile.world.ngPlus)
  saveProfile()
}

export const storyFor = (sector: SectorId): Quest | null => {
  const s = SECTOR_BY_ID[sector]
  if (!profile.world.unlocked.includes(sector)) return null
  // The Scrapyard's story mission IS the tutorial: until it is finished the
  // card replays it, so abandoning it never skips the walkthrough.
  const tutorial = tutorialQuest()
  if (sector === tutorial.sector && !profile.world.tutorialDone) return tutorial
  if (profile.world.bosses.includes(s.boss)) return null
  return storyQuest(s, profile.level, profile.quests.storyAttempts[`story_${sector}`] ?? 0, profile.world.ngPlus)
}

export const statsNow = () => computeStats()
