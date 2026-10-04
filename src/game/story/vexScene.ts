import { reactive } from 'vue'
import { playVoice, prefetchVoice, stopVoice } from '../audio/voice'
import { sfx } from '../audio/sfx'
import { lineSeconds } from '../sim/atlas'
import { profile, markStorySeen } from '../state/profile'

/**
 * ─── Voiced story scenes: Dr. Vex on the screens (#117) ──────────────────────
 *
 * A scene is a short run of beats — a Vex line, an Atlas line, a sound, a
 * wait, a callback — on the caller's clock (the mission's or the hub's), so
 * a pause or an ad freezes it with the game. A line holds for its recording
 * (+0.4 s) or, with no file, for as long as its text takes to read; the next
 * beat waits for it. Vex's first line in a scene comes after his three-note
 * motif (`vexGlitch`), never baked into the files. A laugh (`vex.laugh.*`) can
 * close a line: its bubble stays up until the laugh ends.
 *
 * `sceneUi` is what `SceneBubble.vue` draws: who speaks, the i18n key and its
 * params (each param an i18n key, e.g. `{ boss: 'boss.blazeMaster' }`), and
 * where on screen.
 *
 * Every scene plays once ever (`profile.world.seen`, `vexSeen`): story beats
 * already seen never replay, New Game+ included (`startNewGamePlus`).
 */

export type Laugh = 'short' | 'medium' | 'maniacal'
export type ScenePlace = 'title' | 'top' | 'center' | 'low'
export type Speaker = 'vex' | 'atlas' | 'pip'

export type Beat =
  | { vex: string; params?: Record<string, string>; laugh?: Laugh; gap?: number }
  | { atlas: string; params?: Record<string, string>; gap?: number }
  /** Pip, the lab's helper bot (the debrief after a story mission, #119). */
  | { pip: string; params?: Record<string, string>; gap?: number }
  | { sfx: Parameters<typeof sfx>[0]; gap?: number }
  | { wait: number }
  | { call: () => void; gap?: number }

export const sceneUi = reactive({
  speaker: '' as Speaker | '',
  key: '',
  params: {} as Record<string, string>,
  place: 'top' as ScenePlace,
  seq: 0
})

/** The bubble's text, for the hold of a line with no recording (the UI registers it). */
let textOf: ((key: string, params: Record<string, string>) => string) | null = null
export const setSceneTextLookup = (fn: typeof textOf): void => { textOf = fn }
const readFor = (key: string, params: Record<string, string>): number =>
  // Half Atlas's reading time: a scene's line sits in a big bubble mid-screen, and the next beat waits on it.
  Math.min(4, lineSeconds((textOf?.(key, params) ?? key).length) / 2 + 0.6)

/** Vex's motif, then his line: the gap between them (s). */
/** How long a line's bubble waits for its recording to load (s). */
export const SCENE_VOICE_WAIT = 1.2
export const MOTIF_LEAD = 0.4
/** After a line's recording, before the next beat (s). */
export const LINE_TAIL = 0.4

export interface SceneHooks {
  /** Speak an Atlas line through the mission's own bubble; returns its hold (s).
   *  Without it, Atlas speaks in the scene bubble (the hub). */
  atlas?: (key: string) => number
  onEnd?: () => void
}

/** The voice ids a scene can say (prefetch them when its trigger arms). */
export const sceneVoices = (beats: readonly Beat[]): string[] => beats.flatMap(b =>
  'vex' in b ? [b.vex, ...(b.laugh ? [`vex.laugh.${b.laugh}`] : [])] : 'atlas' in b ? [b.atlas] : 'pip' in b ? [b.pip] : [])

export const prefetchScene = (beats: readonly Beat[]): void => {
  for (const id of sceneVoices(beats)) prefetchVoice(id)
}

export class Scene {
  private i = 0
  private t = 0
  /** The clock time the current beat ends at. */
  private until = 0
  private laughAt = -1
  private laugh: Laugh | null = null
  private motif = false
  private done = false
  /** Since when this beat waits for its recording (-1: not waiting). */
  private waitSince = -1

  constructor (private readonly beats: readonly Beat[], private readonly place: ScenePlace, private readonly hooks: SceneHooks = {}) {
    prefetchScene(beats)
  }

  get finished (): boolean { return this.done }

  /** Advance by dt; true while the scene runs. */
  update (dt: number): boolean {
    if (this.done) return false
    this.t += dt
    if (this.laugh && this.t >= this.laughAt) {
      const d = playVoice(`vex.laugh.${this.laugh}`)
      if (d != null) this.until = Math.max(this.until, this.t + d + 0.2)
      this.laugh = null
    }
    while (this.t >= this.until) {
      if (this.i >= this.beats.length) { this.end(); return false }
      this.start(this.beats[this.i++]!)
    }
    return true
  }

  /** A tap: cut the line being said and go on to the next beat. */
  next (): void {
    if (this.done) return
    stopVoice()
    this.laugh = null
    this.until = this.t
  }

  /** Skip: stop the voice and end now (the scene counts as seen). */
  skip (): void {
    if (this.done) return
    stopVoice()
    this.end()
  }

  private start (b: Beat): void {
    const gap = 'gap' in b && b.gap ? b.gap : 0
    if ('wait' in b) { this.until = this.t + b.wait; return }
    if ('sfx' in b) { sfx(b.sfx); this.until = this.t + gap; return }
    if ('call' in b) { b.call(); this.until = this.t + gap; return }
    if ('vex' in b && !this.motif) {
      // The motif first; the line itself on the next pass.
      this.motif = true
      sfx('vexGlitch')
      this.i--
      this.until = this.t + MOTIF_LEAD
      return
    }
    const params = b.params ?? {}
    if ('atlas' in b && this.hooks.atlas) {
      // Atlas answers in his own bubble: Vex's comes down.
      if (sceneUi.key) Object.assign(sceneUi, { speaker: '', key: '', params: {} })
      this.until = this.t + this.hooks.atlas(b.atlas) + gap
      return
    }
    const key = 'vex' in b ? b.vex : 'atlas' in b ? b.atlas : b.pip
    // Its recording still loading (a scene that starts at once, like the
    // hub's floor tip): the bubble waits a moment for it, so the line is not
    // shown silent and never heard again (#107).
    if (prefetchVoice(key) === 'loading') {
      if (this.waitSince < 0) this.waitSince = this.t
      if (this.t - this.waitSince < SCENE_VOICE_WAIT) {
        this.i--
        this.until = this.t + 0.05
        return
      }
    }
    this.waitSince = -1
    Object.assign(sceneUi, { speaker: 'vex' in b ? 'vex' : 'atlas' in b ? 'atlas' : 'pip', key, params, place: this.place })
    sceneUi.seq++
    const voice = playVoice(key)
    const hold = voice != null ? voice + LINE_TAIL : readFor(key, params)
    this.until = this.t + hold + gap
    if ('vex' in b && b.laugh) {
      this.laugh = b.laugh
      this.laughAt = this.t + (voice != null ? voice + 0.15 : hold)
      // Wait for the laugh to start; it extends the beat by its own length.
      this.until = Math.max(this.until, this.laughAt + 0.05)
    }
  }

  private end (): void {
    this.done = true
    if (sceneUi.key) Object.assign(sceneUi, { speaker: '', key: '', params: {} })
    this.hooks.onEnd?.()
  }
}

/** A scene's seen flag (`profile.world.seen`). */
export const vexSeen = (beat: string): boolean => profile.world.seen.includes(beat)
/** Mark it the moment it starts: a quit mid-scene never replays it. */
export const markVexSeen = (beat: string): void => markStorySeen(beat)

/** The Master a sector's story mission ends with, for the scene keys (`vex.present.blaze`…). */
export const VEX_BOSS_KEY: Readonly<Record<string, string>> = {
  scrapper: 'scrapper', blazeMaster: 'blaze', frostMaster: 'frost', voltMaster: 'volt', galeMaster: 'gale',
  magnetMaster: 'magnet', drillMaster: 'drill', tideMaster: 'tide', neonMaster: 'neon', rotorMaster: 'rotor'
}
