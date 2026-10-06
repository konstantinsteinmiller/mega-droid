<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mobileCheck } from '@/utils/function'
import { useMusic } from '@/use/useSound'
import { useExtensionGuard } from '@/use/useExtensionGuard'
import { windowWidth, windowHeight } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import useAssets from '@/use/useAssets'
import FLogoProgress from '@/components/atoms/FLogoProgress.vue'
import FPerfMeter from '@/components/atoms/FPerfMeter.vue'
import SaveStatusBanner from '@/components/atoms/SaveStatusBanner.vue'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import VConsoleHideButton from '@/components/atoms/VConsoleHideButton.vue'
import GlLostVeil from '@/components/atoms/GlLostVeil.vue'
import { useCrazyMuteSync } from '@/use/useCrazyMuteSync'
import useCheats, { installDebugUnlock } from '@/use/useCheats'
import { orientation } from '@/use/useUser'
import { installUiScale } from '@/use/useUiScale'
import { useRenderGate } from '@/platforms/renderGate'
import { installBrowserGuard } from '@/use/useBrowserGuard'

const { t } = useI18n()
// The menus' scale on small screens (`--ui-scale`, read by the Lab and FModal).
installUiScale()
const { initMusic, pauseMusic, continueMusic } = useMusic()
useExtensionGuard()
const { resourceCache } = useAssets()
useCrazyMuteSync()
// Attach the "cmarc" debug-unlock key listener at app boot (App.vue is eager),
// so typing it anywhere flips debug mode — the lazy game scene used to be the
// only importer, which tree-shook the listener out of production builds.
installDebugUnlock()
// Mount the cheat keyboard shortcuts (stage jumps, +coins, item-box spawn) for
// the whole app lifetime. The factory self-gates on `localStorage.cheat` and
// returns inert when cheats are off, so this is a no-op for normal players —
// but without CALLING it the keydown listeners were never attached at all
// (it was previously only imported for `installDebugUnlock`, never invoked).
useCheats()

initMusic()

const portraitQuery = window.matchMedia('(orientation: portrait)')
const onOrientationChange = (event: any) => {
  if (event.matches) {
    orientation.value = 'portrait'
  } else {
    orientation.value = 'landscape'
  }
}


const handleVisibilityChange = async () => {
  try {
    if (document.hidden) {
      pauseMusic()
      // console.log('App moved to background - Pausing Music')
    } else {
      continueMusic()
      // console.log('App back in focus - Resuming Music')
    }
  } catch (error) {
    // console.log('error: ', error)
  }
}

const updateGlobalDimensions = () => {
  windowWidth.value = window.innerWidth
  windowHeight.value = window.innerHeight
  orientation.value = mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait'
}

const dimensionsInterval = ref<any | null>(null)
// Ensure listeners are active
const delayedUpdateGlobalDimensions = () => setTimeout(updateGlobalDimensions, 300)
onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateGlobalDimensions)

    dimensionsInterval.value = setInterval(() => {
      windowWidth.value = window.innerWidth
      windowHeight.value = window.innerHeight
    }, 400)
    window.addEventListener('orientationchange', delayedUpdateGlobalDimensions)
    // Not on Playgama: that archive is the YouTube Playables submission, and
    // Playables forbids the Page Visibility API outright — only the SDK's
    // `onPause` may halt the game. The Bridge's `PAUSE_STATE_CHANGED` already
    // drives `pauseGame()`, and `useGamePauseAudio` suspends audio off the
    // aggregate `isGamePaused`, so the music this handler manages is covered
    // there without a second, forbidden driver.
    // `import.meta.env` literal rather than the imported `isPlaygama`: the
    // constant crosses a module boundary, and this file is in the obfuscator's
    // path, so the raw literal is the form esbuild is most likely to fold
    // before the string-array pass runs. Same reasoning as the note in
    // `pokiPlugin.stub.ts`.
    if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', updateGlobalDimensions)
  window.removeEventListener('orientationchange', delayedUpdateGlobalDimensions)
  // Guarded to MATCH the add above rather than left unconditional. A bare
  // `removeEventListener(..., handleVisibilityChange)` keeps a live reference
  // to the handler, so the function — and the `document.hidden` branch inside
  // it — survives into the Playgama bundle even though nothing can ever call
  // it, and reads there as a Page Visibility usage. Same literal on both sides
  // so the whole pair folds away together.
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  clearInterval(dimensionsInterval.value)
})

// Context menus, mouse and rocker gestures, autoscroll, the history buttons,
// drag, selection, pinch and quick find: see `useBrowserGuard`.
let removeBrowserGuard: (() => void) | null = null
// Inside a portal's iframe, keys go to the portal page until the frame has
// focus: F1 then opened the BROWSER's help instead of ours (#114). Take focus
// at boot and on every press inside the game.
const focusFrame = (): void => { try { window.focus() } catch { /* cross-origin quirks */ } }
const embedded = (() => { try { return window.top !== window.self } catch { return true } })()
onMounted(() => {
  removeBrowserGuard = installBrowserGuard()
  portraitQuery.addEventListener('change', onOrientationChange)
  if (embedded) {
    focusFrame()
    window.addEventListener('pointerdown', focusFrame, { capture: true, passive: true })
  }
})
onUnmounted(() => {
  removeBrowserGuard?.()
  portraitQuery.removeEventListener('change', onOrientationChange)
})

// The per-platform render fork in the template below — whether this build may
// show the game here, a refused licence, the "only available on …" copy. See
// `@/platforms/renderGate` (Playgama folds it to "always render" at build time).
const { isGameShowAllowed, isLicenseDenied, showOnlyAvailableText, plattformText } = useRenderGate()

// The vConsole "Hide" button exists only where vConsole can be mounted at all —
// `main.ts` wires it on native builds or with `VITE_APP_INCLUDE_VCONSOLE`. On
// every other build it could never appear. Chosen HERE, by a build-time
// constant, rather than with a `v-if` on a flag: the template compiler reads
// any non-literal const as a possible ref (`unref(flag)`), which no bundler can
// fold, so the component and its hard-coded dev label would ship regardless. A
// ternary on the env literals IS folded, and the import then drops out.
const VConsoleHide = import.meta.env.VITE_APP_NATIVE === 'true' || import.meta.env.VITE_APP_INCLUDE_VCONSOLE === 'true'
  ? VConsoleHideButton
  : null
</script>

<template lang="pug">
  div(v-if="isGameShowAllowed" id="app-root" class="h-screen h-dvh w-screen app-container root-protection game-ui-immune")
    FLogoProgress
    FPerfMeter(v-if="isDebug" :offset-y="52")
    SaveStatusBanner
    AdsBlockedModal
    GlLostVeil
    component(v-if="VConsoleHide" :is="VConsoleHide")
    RouterView

  div.relative.w-full.h-full(v-else-if="isLicenseDenied")
    h1.absolute.text-red-500(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('license.denied') }}


  div.relative.w-full.h-full(v-else-if="showOnlyAvailableText")
    h1.absolute(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('onlyAvailableOn') }}
      span.ml-2.text-amber-500 {{ plattformText }}
</template>

<style lang="sass">
*
  font-family: var(--font-ui)
  user-select: none
  outline: none
  // Standard
  -webkit-user-select: none
  // Safari
  -moz-user-select: none
  // Firefox
  -ms-user-select: none
  // IE10+

  // Optional: prevent the "tap highlight" color on mobile
  -webkit-tap-highlight-color: transparent

img
  pointer-events: none
</style>