<template lang="pug">
  div.scene-root
    div.canvas-host(ref="canvasHost")
    div.input-surface(v-show="flow.screen === 'mission'" ref="surface")
    div.hud-layer(v-if="flow.screen === 'mission'" :class="{ cine: hud.phase === 'beamOut' || hud.introCine || (hud.freezeKind && hud.freezeFrame !== 'fp') }")
      ScreenFx
      TrainingFrame
      DamageMarkers
      FloatingText
      Crosshair
      FluxBubble
      Compass
      ObjectiveLocator
      TargetFrame(v-if="!hud.bossName")
      BossBar
      TitleCard
      LootCard
      ControlHints
      LessonLayer
      DoorPrompt
      HudBars
      ObjectiveTracker
      TopStatus(@pause="openPause")
      Joystick
      ContextButtons
      ActionButtons
      TutorialChecklist
      LessonPointer
      LessonGlyph
    HubScreen(v-else-if="flow.screen === 'hub'" @options="optionsOpen = true")
    CutsceneLayer(v-else-if="flow.screen === 'intro'")
    EndingLayer(v-else-if="flow.screen === 'ending'")
    DebriefLayer(v-else-if="flow.screen === 'debrief'")
    //- After an ad the mouse is free and a browser only re-captures on a
    //- click: the run waits under this veil until the player gives one.
    div.relock(
      v-if="relockVeil"
      role="button"
      tabindex="0"
      :aria-label="t('tips.capture')"
      @pointerdown.prevent.stop="relock"
      @keydown.enter.prevent="relock"
    )
      div.relock-glyph
        InputGlyph(kind="mouse" button="left" :click="true")
    ExitSkip(v-if="flow.screen === 'mission'")
    FreezeOverlay(v-if="flow.screen === 'mission'")
    BigBanner(v-if="flow.screen === 'mission'")
    AtlasBubble(v-if="flow.screen === 'mission'")
    SceneBubble(v-if="flow.screen === 'mission' || flow.screen === 'hub' || flow.screen === 'ending' || flow.screen === 'debrief'")
    ResultsModal
    DefeatModal
    PauseModal(@options="optionsOpen = true")
    ControlsIntroModal
    EnglishVoiceModal
    LevelUpModal
    OptionsModal(
      :is-open="optionsOpen"
      :can-replay-intro="INTRO_ENABLED && flow.screen === 'hub'"
      @close="optionsOpen = false"
      @replay-intro="onReplayIntro"
    )
    MissionLoading
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputGlyph from '@/components/hud/InputGlyph.vue'
import { app } from '@/game/engine/app'
import {
  attachInput, isPointerLocked, releasePointerLock, requestPointerLock, unlockedRecently
} from '@/game/engine/input'
import { loadKeyboardLayout } from '@/game/engine/keyLabels'
import { input, adoptBootMode, currentMission } from '@/game/boot'
import { flow, startMission, storyFor, goHub, replayIntro, INTRO_ENABLED } from '@/game/flow'
import { toggleHelp } from '@/game/help'
import { hud } from '@/game/state/hud'
import { profile } from '@/game/state/profile'
import { chargeHum } from '@/game/audio/synth'
import { CHARGE_L2 } from '@/game/sim/stats'
import { isGamePaused, isAdShowing, isVisibilityHidden, isPlatformPaused, acquireAppPause } from '@/use/useGamePause'
import { isAnyModalOpen } from '@/use/useModalState'
import { isGameplayLive, syncGameplayLifecycle } from '@/use/useGameplayLifecycle'
import { startGameMusic } from '@/use/useSound'
import { toggleGameMute } from '@/use/useGameMute'
import { armNavigationGuard, disarmNavigationGuard } from '@/use/useBrowserGuard'
import { registerGameCheats } from '@/game/cheats'
import Joystick from '@/components/hud/Joystick.vue'
import LootCard from '@/components/hud/LootCard.vue'
import HudBars from '@/components/hud/HudBars.vue'
import Crosshair from '@/components/hud/Crosshair.vue'
import TargetFrame from '@/components/hud/TargetFrame.vue'
import FloatingText from '@/components/hud/FloatingText.vue'
import FluxBubble from '@/components/hud/FluxBubble.vue'
import ScreenFx from '@/components/hud/ScreenFx.vue'
import DamageMarkers from '@/components/hud/DamageMarkers.vue'
import ActionButtons from '@/components/hud/ActionButtons.vue'
import TopStatus from '@/components/hud/TopStatus.vue'
import ObjectiveTracker from '@/components/hud/ObjectiveTracker.vue'
import Compass from '@/components/hud/Compass.vue'
import ObjectiveLocator from '@/components/hud/ObjectiveLocator.vue'
import ContextButtons from '@/components/hud/ContextButtons.vue'
import BossBar from '@/components/hud/BossBar.vue'
import TitleCard from '@/components/hud/TitleCard.vue'
import ControlHints from '@/components/hud/ControlHints.vue'
import LessonLayer from '@/components/hud/LessonLayer.vue'
import DoorPrompt from '@/components/hud/DoorPrompt.vue'
import BigBanner from '@/components/hud/BigBanner.vue'
import AtlasBubble from '@/components/hud/AtlasBubble.vue'
import SceneBubble from '@/components/story/SceneBubble.vue'
import ExitSkip from '@/components/hud/ExitSkip.vue'
import FreezeOverlay from '@/components/hud/FreezeOverlay.vue'
import TrainingFrame from '@/components/hud/TrainingFrame.vue'
import TutorialChecklist from '@/components/hud/TutorialChecklist.vue'
import LessonPointer from '@/components/hud/LessonPointer.vue'
import LessonGlyph from '@/components/hud/LessonGlyph.vue'
import HubScreen from '@/components/hub/HubScreen.vue'
import ResultsModal from '@/components/modals/ResultsModal.vue'
import DefeatModal from '@/components/modals/DefeatModal.vue'
import PauseModal from '@/components/modals/PauseModal.vue'
import EnglishVoiceModal from '@/components/modals/EnglishVoiceModal.vue'
import { englishVoice, hasOwnVoice } from '@/use/useEnglishVoice'
import { currentLocale } from '@/game/audio/voice'
import ControlsIntroModal from '@/components/modals/ControlsIntroModal.vue'
import LevelUpModal from '@/components/modals/LevelUpModal.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import MissionLoading from '@/components/hud/MissionLoading.vue'
import CutsceneLayer from '@/components/story/CutsceneLayer.vue'
import EndingLayer from '@/components/story/EndingLayer.vue'
import DebriefLayer from '@/components/story/DebriefLayer.vue'
import { cine, holdToSkip, openGate, skipCutscene } from '@/game/story/cine'

/**
 * The one game view. Hosts the canvas, the gesture surface and whichever UI
 * the flow is in — the mission HUD or the hub — plus every modal. Modals
 * acquire the pause gate (FModal → useModalState), and the loop is suspended
 * while any pause reason holds (ads, modals, platform pause, hidden tab).
 */
registerGameCheats()

const canvasHost = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
const optionsOpen = ref(false)
let detachInput: (() => void) | null = null
/** How long back / close stay guarded after the capture is LOST (ms). */
const LOCK_LOSS_GRACE_MS = 2500

/** Options → Replay intro: close the sheet, then play it (it ends in the hub). */
const onReplayIntro = () => {
  optionsOpen.value = false
  replayIntro()
}

const openPause = () => {
  if (flow.screen === 'mission' && hud.phase === 'play' && !flow.modal) flow.modal = 'pause'
}

/** A key typed into a form field is text, not a game key. */
const typing = (e: KeyboardEvent): boolean => {
  const tag = (e.target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const onKey = (e: KeyboardEvent) => {
  // F1 and "?" are the HUD's "?" button (the controls legend): a captured
  // mouse has no cursor to click it with. `e.key` so "?" is found on every
  // layout. Both keys are the game's here: F1 never opens the browser's help.
  if (e.code === 'F1' || (e.key === '?' && !typing(e))) {
    e.preventDefault()
    if (!e.repeat) toggleHelp()
    return
  }
  // F2 is the HUD's speaker button, on every screen (the lab and the menus
  // too): muting is never a thing to hunt for a cursor to do. Not under an
  // ad — the ad's audio gate owns the sound then, and a toggle underneath it
  // would come back as a surprise when the ad ends.
  if (e.code === 'F2') {
    e.preventDefault()
    if (!e.repeat && !typing(e) && !isAdShowing.value) toggleGameMute()
    return
  }
  // F4 during a kill-cam: kill-cams off (Options → Gameplay turns them back
  // on). Only then: F4 is nothing else of the game's.
  if (e.code === 'F4' && hud.freezeKind === 'kill') {
    e.preventDefault()
    if (!e.repeat) currentMission()?.killCamsOff()
    return
  }
  // The intro: Esc skips it at once (the skip button's key); Space held for
  // 3 s skips it too, without reaching for the mouse (`story/holdSkip.ts`).
  // Space never scrolls or presses a focused button here: it is only the
  // hold. There is no pause menu over a cutscene, and no captured mouse.
  if (flow.screen === 'intro') {
    // The start gate: any key that the browser counts as a press starts the film.
    if (cine.gate) {
      if (!e.repeat) openGate()
      return
    }
    if (e.code === 'Escape' && !e.repeat) skipCutscene()
    if (e.code === 'Space' && !typing(e)) {
      e.preventDefault()
      if (!e.repeat) holdToSkip(true)
    }
    return
  }
  // While the mouse is captured, Esc belongs to the browser: it releases the
  // capture, and the lost capture opens the pause menu (`onLockLost`). The
  // same Esc must not then toggle the menu shut again.
  if (e.code === 'Escape' && (isPointerLocked() || unlockedRecently())) return
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (flow.modal === 'pause') flow.modal = ''
    else openPause()
  }
}

/** Space let go (or the window lost it, so its keyup never comes): the
 *  hold-to-skip ring empties. Harmless outside a cutscene. */
const onKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') holdToSkip(false)
}
const onWindowBlur = () => holdToSkip(false)

onMounted(async () => {
  if (!canvasHost.value || !surface.value) return
  app.attach(canvasHost.value)
  detachInput = attachInput(surface.value, input, {
    fireMode: () => currentMission()?.wantsFire() ?? false,
    // Capture the mouse only over live play: never under a modal or an ad.
    canLock: () => flow.screen === 'mission' && (hud.phase === 'play' || hud.phase === 'beamIn') &&
      !flow.modal && !isGamePaused.value,
    // Esc, alt-tab or a system dialog took the mouse back: pause, like
    // every desktop shooter.
    onLockLost: () => openPause(),
    // Browser gestures (Opera's rocker, gesture extensions) must not take
    // the player off the page while captured; a lost capture keeps the
    // guard a moment longer, since the stroke that broke it may still end.
    onLockChange: (locked, asked) => {
      if (locked) armNavigationGuard()
      else if (playLive.value) armNavigationGuard(false)
      else disarmNavigationGuard(asked ? 0 : LOCK_LOSS_GRACE_MS)
    }
  })
  void loadKeyboardLayout()
  app.setSuspended(isGamePaused.value)
  app.setWanted(true)
  // Music intent from the first frame; the context itself unlocks on the
  // first gesture (autoplay policy), and the gates keep it silent under ads.
  startGameMusic()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>
    w.__game = { app, input, flow, startMission, storyFor, goHub, mission: currentMission }
    // The cinematic trailer's staging and autopilot seam (tools/cinematic-trailer).
    void import('@/game/trailer').then(t => t.installTrailerSeam())
    // A fumble on demand (QA, screenshots): the charge as held, else a full
    // one (`sim/fumble.ts`). Folds away in production.
    w.__fumble = () => {
      const m = currentMission()
      if (!m || hud.phase !== 'play') return
      if (!m.combat.charging) {
        m.combat.charging = true
        m.combat.charge = CHARGE_L2 * m.stats.chargeTimeMul
      }
      m.fumbleCharge()
    }
  }
  // The loader's prepared first scene. The scene never builds its own copy
  // while the loader is still priming (see `adoptBootMode`).
  app.setMode(await adoptBootMode())
})

// The mouse is handed back whenever play stops for something else: a modal,
// an ad, the hub. Resuming from the pause menu takes it again (the Resume
// click is the gesture a capture needs; Esc is not one, so after an Esc the
// click glyph asks for a click on the scene).
watch(() => [isGamePaused.value, flow.screen] as const, ([paused, screen]) => {
  if (paused || screen !== 'mission') releasePointerLock()
})
watch(() => flow.modal, (m, prev) => {
  if (!m && prev && flow.screen === 'mission' && input.device === 'mouse' && hud.phase === 'play') requestPointerLock(input)
})

// Live play without a capture (the lock refused or lost, a portal iframe
// without `allow-pointer-lock`) still blocks on the right button, so a rocker
// gesture can still go back: keep the history entry, without the close prompt.
const playLive = computed(() => flow.screen === 'mission' && hud.phase === 'play' &&
  !flow.modal && !isGamePaused.value)
watch(playLive, (v) => {
  if (v) {
    if (!isPointerLocked()) armNavigationGuard(false)
  } else if (!isPointerLocked()) disarmNavigationGuard()
})

// ── Pointer lock around ads ──
// An ad takes the mouse back (the pause gate releases the lock). A browser
// only captures again on a user gesture, and the ad's own close click happens
// in the SDK's frame, not ours — so a mouse player comes back to a paused run
// under a "click to continue" veil, never to machines shooting at a camera
// that no longer turns.
const { t } = useI18n()
const relockVeil = ref(false)
/** An ad ended during this mission: the veil is owed once play is back (a
 *  revive ad ends while Flux is still down, under the defeat modal). */
const relockOwed = ref(false)
let relockRelease: (() => void) | null = null
watch(isAdShowing, (v, prev) => {
  if (!v && prev && flow.screen === 'mission') relockOwed.value = true
})
watch(() => [relockOwed.value, hud.phase, flow.modal, isAdShowing.value] as const, ([owed, ph, modal, ad]) => {
  if (!owed || ph !== 'play' || modal || ad) return
  relockOwed.value = false
  if (input.device !== 'mouse' || input.lockRefused || isPointerLocked()) return
  relockVeil.value = true
  relockRelease = acquireAppPause()
})
const relock = () => {
  relockVeil.value = false
  relockRelease?.()
  relockRelease = null
  requestPointerLock(input)
}
watch(() => flow.screen, (sc) => {
  if (sc === 'mission') return
  relockOwed.value = false
  if (relockVeil.value) relock()
})

// A touch player's first mission: the controls legend once, right after the
// beam-in (phone testers never found it in the pause menu).
// The first play that began with the intro is an ordinary one from the
// moment the mission hands over control: its bracket follows the usual rule.
watch(() => hud.phase, (ph) => {
  if (ph === 'play') flow.introPlay = false
})

// After a landing: first the English voice-over question (a language with no
// voice-over of its own, not answered yet — the tutorial's first room for a new
// player), then a touch player's controls legend. One at a time, in that order.
const afterLanding = () => {
  if (hud.phase !== 'play' || flow.screen !== 'mission' || flow.modal) return
  if (englishVoice.value === null && !hasOwnVoice(currentLocale())) flow.modal = 'englishVoice'
  else if (input.device === 'touch' && !profile.tips['controlsIntro:touch']) flow.modal = 'controls'
}
watch(() => hud.phase, afterLanding)
watch(() => flow.modal, (now, before) => { if (before === 'englishVoice' && !now) afterLanding() })

watch(isGamePaused, (p) => {
  app.setSuspended(p)
  // The sim is frozen, so nothing re-pitches the buster's charge hum: silence
  // it (audio itself keeps running under a modal — see `isAudioPaused`).
  if (p) chargeHum(null)
})

// The portals' gameplay bracket (CrazyGames / Poki / Playgama). The rule is in
// `isGameplayLive`; the Poki arm defers a start inside its 50 ms bad-event
// window, so a modal closing in the same breath as an ad opening is safe.
const live = computed(() => isGameplayLive({
  introPlay: flow.introPlay,
  screen: flow.screen,
  phase: hud.phase,
  flowModal: flow.modal !== '',
  anyModalOpen: isAnyModalOpen.value,
  adShowing: isAdShowing.value,
  visibilityHidden: isVisibilityHidden.value,
  platformPaused: isPlatformPaused.value
}))
watch(live, (v) => syncGameplayLifecycle(v), { immediate: true })

onUnmounted(() => {
  syncGameplayLifecycle(false)
  detachInput?.()
  disarmNavigationGuard()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  app.setWanted(false)
  app.detach()
})
</script>

<style scoped lang="sass">
.scene-root
  position: fixed
  inset: 0
  overflow: hidden
  background: #0a1224
.relock
  position: absolute
  inset: 0
  z-index: 40
  display: grid
  place-items: center
  background: rgba(6, 10, 26, 0.45)
  cursor: pointer
.relock-glyph
  width: clamp(96px, 16vmin, 132px)
  aspect-ratio: 140 / 112
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
  animation: relock-bob 1.1s ease-in-out infinite
@keyframes relock-bob
  50%
    transform: translateY(-6px)
@media (prefers-reduced-motion: reduce)
  .relock-glyph
    animation: none
.canvas-host
  position: absolute
  inset: 0
  :deep(canvas)
    display: block
    width: 100%
    height: 100%
    touch-action: none
.input-surface
  position: absolute
  inset: 0
  touch-action: none
  -webkit-user-select: none
  user-select: none
.hud-layer
  position: absolute
  inset: 0
  pointer-events: none
  // The resting joystick's centre, from the lower-left corner (inside the
  // safe area). Shared by the stick and the coach's move glyph drawn over it.
  // ~2 stick radii in from each edge: a full push, thumb and all, stays on
  // the glass instead of slipping off it.
  --joy-home-x: 104px
  --joy-home-y: max(104px, 13vh)
  transition: opacity 0.35s, visibility 0s linear 0s
  // The exit cutscene (phase `beamOut`) and the beam-in's opening shot of
  // Flux (`hud.introCine`) are film: the whole HUD fades away,
  // and hidden it takes no taps either, so any press reaches the scene (the
  // skip). The banner and the skip glyph live outside this layer.
  &.cine
    opacity: 0
    visibility: hidden
    transition: opacity 0.35s, visibility 0s linear 0.35s
</style>
