import { getRenderer } from './engine/renderer'
import { createInput } from './engine/input'
import { afterPaint, createSlicer, yieldToBrowser, type Slice } from './engine/slicer'
import type { Camera, Material, Mesh, Object3D, Scene } from 'three'
import { bakeTextures, loadTextureOverrides } from './world/textures'
import type { Mission } from './sim/mission'
import { HubMode } from './sim/hub'
import { app, type GameMode } from './engine/app'
import { initProfile } from './state/profile'
import { registerModeFactories, createBootMode, ensureJobs } from './flow'
import { installSynth, loadSfxOverrides } from './audio/synth'
import { loadDebriefModule, loadEndingModule, loadIntroModule, loadMissionModule } from './lazy'

/**
 * ─── Boot priming ────────────────────────────────────────────────────────────
 *
 * Called by the LOADER (`useAssets.preloadAssets`) while the splash is up:
 * loads the profile, creates the renderer, bakes the shared canvas textures,
 * builds the FIRST scene (a resumed mission, the tutorial, or the hub — never
 * a menu) and compiles its shaders. By the time the splash clears, the first
 * frame is ready to draw.
 *
 * Three rules, each one a measured failure before it was a rule:
 * - The loader PAINTS FIRST. Nothing heavy starts until the splash has been
 *   on screen for a frame, so the player gets feedback before the work.
 * - The build is time-sliced (`Mission.create`), so the bar keeps moving.
 * - The scene NEVER builds its own copy. `GameScene` waits on `adoptBootMode`
 *   for the prepared mode. It used to fall back to a fresh synchronous build
 *   whenever it mounted before priming finished — which it always did — so
 *   the first sector was built TWICE, the second copy without the shader
 *   precompile, and the loader froze through both.
 */

export const input = createInput()

/**
 * The mission engine, on its own chunk (#121): the biggest part of the game,
 * and a returning player's boot into the lab never needs it. Fetched when a
 * mission is built — the boot's own (a resume, the tutorial), the tutorial
 * behind the intro, a deploy — and in the background once the first scene is
 * up (`prefetchMission`), so the first Deploy does not wait on the network.
 */
let missionMod: typeof import('./sim/mission') | null = null
const loadMission = async (): Promise<typeof import('./sim/mission')> =>
  (missionMod ??= await loadMissionModule())

/** Fetch the mission engine when the browser is idle (the first scene is
 *  live by then), never in the way of it. */
const prefetchMission = (): void => {
  if (missionMod) return
  const go = () => { void loadMission().catch(() => { /* the deploy fetches it again */ }) }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}

/**
 * Compile a scene's shader programs off the critical frame. `compileAsync`
 * waits for the GPU asynchronously, but first derives the parameters and
 * cache key of EVERY material and assembles every new program's source, all
 * synchronously — one ~500-800 ms task on a throttled CPU. So programs are
 * created one material at a time (sliced; the GPU still compiles them in
 * parallel), and readiness is polled directly rather than through a final
 * `compileAsync`, which would re-derive everything in one task again.
 */
const precompile = async (
  mode: GameMode, slice: Slice = createSlicer(12), onProgress: (f01: number) => void = () => {},
  overlay: { scene: Scene; camera: Camera } | null = null
): Promise<void> => {
  try {
    const renderer = getRenderer()
    const seen = new Set<string>()
    const reps: Object3D[] = []
    mode.scene.traverse((o) => {
      const mat = (o as Mesh).material as Material | Material[] | undefined
      if (!mat) return
      const key = (Array.isArray(mat) ? mat : [mat]).map(m => m.uuid).join()
      if (seen.has(key)) return
      seen.add(key)
      reps.push(o)
    })
    const pending = new Set<Material>()
    // `compile` walks only what is visible: a prop hidden until its moment
    // (a lesson's card, the intro's showcase props, a set that streams in
    // later) would compile on its first draw, mid-play. Shown for the call,
    // with its hidden ancestors, then put back.
    const hidden: Object3D[] = []
    for (let i = 0; i < reps.length; i++) {
      hidden.length = 0
      for (let o: Object3D | null = reps[i]!; o; o = o.parent) if (!o.visible) { hidden.push(o); o.visible = true }
      try {
        for (const m of renderer.compile(reps[i]!, mode.camera, mode.scene)) pending.add(m)
      } finally {
        for (const o of hidden) o.visible = false
      }
      onProgress((i + 1) / reps.length * 0.8)
      await slice()
    }
    if (overlay) {
      for (const m of renderer.compile(overlay.scene, overlay.camera)) pending.add(m)
    }
    // KHR_parallel_shader_compile: poll completion without blocking.
    const started = performance.now()
    await new Promise<void>((resolve) => {
      const check = () => {
        for (const m of pending) {
          const prog = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram
          if (!prog || prog.isReady()) pending.delete(m)
        }
        // Capped: a driver that never reports completion must not hold the boot.
        if (pending.size === 0 || performance.now() - started > 8000) resolve()
        else setTimeout(check, 16)
      }
      check()
    })
  } catch (e) {
    console.warn('[boot] shader precompile failed (will compile on first draw)', e)
  }
}

registerModeFactories(
  async (quest, snapshot, onProgress) => {
    const { Mission, setupFromQuest } = await loadMission()
    const m = await Mission.create(setupFromQuest(quest, snapshot), input, (p) => onProgress?.(p * 0.82))
    await precompile(m, createSlicer(12), (f) => onProgress?.(0.82 + f * 0.1), { scene: m.vmScene, camera: m.vmCamera })
    // GPU uploads now, behind the loader, not on the first live frame.
    try {
      await m.warmUp(createSlicer(12), (f) => onProgress?.(0.92 + f * 0.08))
    } catch (e) { console.warn('[boot] warm-up render failed', e) }
    onProgress?.(1)
    return m
  },
  () => new HubMode(),
  // The intro on its own chunk (#121): only a first-timer (or a replay from
  // Options) ever plays it, so a returning player never downloads or parses it.
  async (opts) => new (await loadIntroModule()).IntroMode(opts),
  // The ending's own chunk, fetched when the Fortress is won.
  async (opts) => new (await loadEndingModule()).EndingMode(opts),
  // The debrief after a story mission, on its own chunk too.
  async (opts) => new (await loadDebriefModule()).DebriefMode(opts)
)

let prepared: GameMode | null = null
let primed: Promise<void> | null = null

export const primeGame = (onProgress: (p01: number) => void): Promise<void> => {
  if (primed) return primed
  primed = (async () => {
    // The loader is on screen before any of the work below starts.
    await afterPaint()
    // Boot milestones as User Timing marks: free, and they line up in the
    // DevTools Performance panel (and `scripts/boot-timeline.mjs`).
    performance.mark('boot:prime-start')
    initProfile()
    ensureJobs()
    installSynth()
    // Drop-in files (only those that exist; see game/assets/overrides.ts).
    // SFX decode in the background; the detail maps must land before the
    // atlas bakes, and cost nothing when there are none.
    loadSfxOverrides()
    onProgress(0.03)
    await yieldToBrowser()
    getRenderer()
    onProgress(0.07)
    await loadTextureOverrides()
    bakeTextures()
    onProgress(0.1)
    await yieldToBrowser()
    performance.mark('boot:build-start')
    const mode = await createBootMode((p) => onProgress(0.1 + p * 0.88))
    performance.mark('boot:built')
    // A mission was precompiled by its factory; the hub is compiled here.
    if (!isMission(mode)) await precompile(mode)
    onProgress(1)
    prepared = mode
    performance.mark('boot:primed')
    prefetchMission()
  })()
  return primed
}

/** Hand the pre-built first mode to the scene (once). */
export const takePreparedMode = (): GameMode | null => {
  const m = prepared
  prepared = null
  return m
}

/** Longest the scene waits on priming before building its own scene. */
const ADOPT_CAP_MS = 20000

/**
 * The first scene for `GameScene`: the loader's prepared mode, once priming
 * has finished (starting it if nothing has). Capped, so a prime that hangs
 * ends in a direct build rather than a black screen forever.
 */
export const adoptBootMode = async (): Promise<GameMode> => {
  const p = primed ?? primeGame(() => {})
  await Promise.race([
    p.catch((e) => console.error('[boot] priming failed', e)),
    new Promise((resolve) => setTimeout(resolve, ADOPT_CAP_MS))
  ])
  const m = takePreparedMode()
  performance.mark(m ? 'boot:adopted' : 'boot:fallback-build')
  if (m) return m
  initProfile()
  ensureJobs()
  return createBootMode()
}

/** A mode is a mission (no mission exists before its chunk has loaded). */
const isMission = (mode: GameMode | null): mode is Mission => !!missionMod && mode instanceof missionMod.Mission

/** The live mission, if the active mode is one (HUD components read it). */
export const currentMission = (): Mission | null => (isMission(app.mode) ? app.mode : null)
export const currentHub = (): HubMode | null => (app.mode instanceof HubMode ? app.mode : null)
