<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser, { isMobileLandscape } from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { LANGUAGES, LANGUAGE_AUTONYMS, DIFFICULTY } from '@/utils/enums'
import { bcp47For } from '@/i18n/localeTag'
import { hapticsAvailable, hapticsEnabled, setHapticsEnabled } from '@/use/useHaptics'
import { killCamsEnabled, setKillCamsEnabled } from '@/use/useKillCam'
import { englishVoice, hasOwnVoice, setEnglishVoice } from '@/use/useEnglishVoice'
import { touchFirst } from '@/game/engine/input'
import { ACTIONS, bindKey, bindingsChanged, isBindable, primaryCode, resetBindings, type Action } from '@/game/engine/keyBindings'
import { keyboard, keyLabel, LAYOUTS, LAYOUT_NAMES, setAutoLayout, setManualLayout, type Layout } from '@/game/engine/keyLabels'

defineProps<{
  isOpen: boolean
  /** Offer "Replay intro" (the hub only, on builds that ship the intro). */
  canReplayIntro?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'replayIntro'): void
}>()

// Global scope so the Options UI strings resolve from the shared locale
// bundles (src/i18n/locales/*) — same source as the rest of the game.
const { t, locale }: any = useI18n({ useScope: 'global' })
const appI18n: any = (window as any).__i18n

const {
  setSettingValue,
  userLanguage,
  userDifficulty,
  userSoundVolume,
  userMusicVolume,
  userMusicTrack
} = useUser()

const currentTab = ref('general')

// The dropdown shows the language ON SCREEN, not the stored setting: a
// first-time player on a German portal saw German text with "English"
// selected, and picking English then changed nothing (#115). A pick is always
// the player's choice and always applied, even when it equals the stored one.
const chooseLanguage = (code: string): void => {
  setSettingValue('language', code)
  if (appI18n) void setI18nLocale(appI18n, code)
  else locale.value = code
}

watch(userLanguage, async (newValue: string) => {
  if (appI18n) {
    await setI18nLocale(appI18n, newValue)
  } else {
    locale.value = newValue
  }
})

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const tabs = computed(() => {
  const list = [
    { value: 'general', label: t('options.general') },
    // Gameplay: how the game plays (difficulty, kill-cams, vibration), apart
    // from language and sound.
    { value: 'gameplay', label: t('options.gameplay') }
  ]
  if (isMobile.value) return list
  const desk = list.concat({ label: t('options.audio'), value: 'audio' })
  // Keyboard layout and rebinding: a keyboard player's tab, never a phone's.
  return touchFirst() ? desk : desk.concat({ label: t('pause.controls'), value: 'controls' })
})

// Native-name dropdown — every option legible regardless of the active locale.
const languagesList = computed(() =>
  LANGUAGES.map(loc => ({
    value: loc,
    label: LANGUAGE_AUTONYMS[loc] ?? loc,
    lang: bcp47For(loc)
  }))
)

const difficultyList = computed(() => [
  { value: DIFFICULTY.EASY, label: t('options.difficulties.easy') },
  { value: DIFFICULTY.MEDIUM, label: t('options.difficulties.medium') },
  { value: DIFFICULTY.HARD, label: t('options.difficulties.hard') }
])

const difficultyHint = computed(() => t('options.difficultyHints.' + userDifficulty.value))

// Background-music track picker — "Overdrive" (default) vs "Calm Circuits".
const musicTrackList = computed(() => [
  { value: 'trance', label: t('options.musicTracks.trance') },
  { value: 'cozy', label: t('options.musicTracks.cozy') }
])

// ─── Vibration ──────────────────────────────────────────────────────────────
//
// `hapticsAvailable` is resolved once at module load and is false on every
// desktop and on every iPhone — `navigator.vibrate` is absent on iOS Safari
// entirely, and desktop Chrome ships it as a silent no-op. The row is therefore
// hidden rather than disabled: a settings control that provably cannot do
// anything on this device teaches the player that the settings lie.
//
// An `FSelect` rather than a bespoke switch, because every other control on
// this tab is one and the modal has no toggle atom — a one-off switch here
// would be the only control in the game that looks like that.
const hapticsList = computed(() => [
  { value: 'on', label: t('options.on') },
  { value: 'off', label: t('options.off') }
])

// ─── Controls: keyboard layout + key rebinding ──────────────────────────────
//
// Keys are PHYSICAL (`engine/keyBindings.ts`); the layout only decides what
// they are called (`engine/keyLabels.ts`). Auto-detect on: the detected
// layout names them; off: the one picked here does.
const layoutList = LAYOUTS.map(l => ({ value: l, label: LAYOUT_NAMES[l] }))
const detectedName = computed(() => LAYOUT_NAMES[keyboard.detected ?? 'qwerty'])
const pickLayout = (v: string): void => { if ((LAYOUTS as string[]).includes(v)) setManualLayout(v as Layout) }

/** The action waiting for its new key, if any. */
const capturing = ref<Action | null>(null)
const onCapture = (e: KeyboardEvent): void => {
  const a = capturing.value
  if (!a) return
  // Ours alone: the game's own key handler must not also act on this press.
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.code === 'Escape') { stopCapture(); return }
  if (!isBindable(e.code)) return
  bindKey(a, e.code)
  stopCapture()
}
const stopCapture = (): void => {
  capturing.value = null
  window.removeEventListener('keydown', onCapture, true)
}
const startCapture = (a: Action): void => {
  if (capturing.value === a) { stopCapture(); return }
  capturing.value = a
  window.addEventListener('keydown', onCapture, true)
}
watch(currentTab, stopCapture)
onUnmounted(stopCapture)
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t('options.title')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    div(v-if="currentTab === 'general'")
      //- Landscape mobile lays the controls out in 2 columns so all of them
      //- (language, difficulty + hint, the two sliders, music track) fit the
      //- short viewport without the SAVE & CLOSE footer overlapping them.
      div(:class="isMobileLandscape ? 'grid grid-cols-2 gap-x-4 gap-y-1 p-1 items-start' : 'flex flex-col gap-2 p-2'")
        div(class="z-[20] flex flex-col gap-2")
          FSelect(
            :label="t('options.language')"
            :options="languagesList"
            :model-value="locale"
            @update:model-value="chooseLanguage($event)"
          )
        hr(v-if="!isMobileLandscape" class="border-slate-600 my-1 md:my-2 pt-0")
        FSlider.px-4(class="!py-1 !pb-3 w-full max-w-[min(20rem,90%)]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('options.soundEffects')" :min="0" :max="1" :step="0.01")
        FSlider.px-4(class="!py-1 !pb-2 w-full max-w-[min(20rem,90%)]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('options.music')" :min="0" :max="1" :step="0.01")
        div(class="z-[5] flex flex-col gap-1")
          FSelect(
            :label="t('options.musicTrack')"
            :options="musicTrackList"
            :model-value="userMusicTrack"
            @update:model-value="setSettingValue('musicTrack', $event)"
          )

    //- A short landscape phone: two columns, every setting on screen at once
    //- (a third dropdown sat half under the footer, playtest 2026-10-06).
    div(v-else-if="currentTab === 'gameplay'").gameplay-grid.p-2
      div(class="z-[20] flex flex-col gap-1")
        FSelect(
          :label="t('options.difficulty')"
          :options="difficultyList"
          :model-value="userDifficulty"
          @update:model-value="setSettingValue('difficulty', $event)"
        )
        p.text-white.game-text.opacity-70.leading-tight.px-1(class="text-[10px] md:text-xs") {{ difficultyHint }}
      //- The kill-cam (a freeze-frame on a machine's end): on by default; a
      //- player who switched it off from inside one turns it back on here.
      div(class="z-[10] flex flex-col gap-1")
        FSelect(
          :label="t('options.killCams')"
          :options="hapticsList"
          :model-value="killCamsEnabled ? 'on' : 'off'"
          @update:model-value="setKillCamsEnabled($event === 'on')"
        )
      //- English voice-over: only for a language with no voice-over of its own
      //- (asked once after the first landing; off until the player says yes).
      div(v-if="!hasOwnVoice(locale)" class="z-[5] flex flex-col gap-1")
        FSelect(
          :label="t('options.englishVoice')"
          :options="hapticsList"
          :model-value="englishVoice ? 'on' : 'off'"
          @update:model-value="setEnglishVoice($event === 'on')"
        )
      //- Vibration: phones only (hidden where there is no motor).
      div(v-if="hapticsAvailable" class="z-[1] flex flex-col gap-1")
        FSelect(
          :label="t('options.haptics')"
          :options="hapticsList"
          :model-value="hapticsEnabled ? 'on' : 'off'"
          @update:model-value="setHapticsEnabled($event === 'on')"
        )

    div(v-else-if="currentTab === 'audio'").flex.flex-col.justify-between.items-center
      FSlider.px-4(class="!py-1 !pb-3 w-full max-w-[min(20rem,90%)]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('options.soundEffects')" :min="0" :max="1" :step="0.01")
      FSlider.px-4(class="!py-1 !pb-2 w-full max-w-[min(20rem,90%)]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('options.music')" :min="0" :max="1" :step="0.01")
      div(class="z-[5] flex flex-col gap-1 w-full max-w-[min(20rem,100%)]")
        FSelect(
          :label="t('options.musicTrack')"
          :options="musicTrackList"
          :model-value="userMusicTrack"
          @update:model-value="setSettingValue('musicTrack', $event)"
        )
      hr(class="border-slate-600 my-1 md:my-2 pt-0")

    div(v-else-if="currentTab === 'controls'").flex.flex-col.gap-2.p-2
      div(class="z-[20] flex flex-col gap-1")
        FSelect(
          :label="t('options.keyboard.auto')"
          :options="hapticsList"
          :model-value="keyboard.auto ? 'on' : 'off'"
          @update:model-value="setAutoLayout($event === 'on')"
        )
        p.text-white.game-text.opacity-70.leading-tight.px-1(v-if="keyboard.auto" class="text-[10px] md:text-xs") {{ t('options.keyboard.detected', { layout: detectedName }) }}
      div(v-if="!keyboard.auto" class="z-[10] flex flex-col gap-1")
        FSelect(
          :label="t('options.keyboard.layout')"
          :options="layoutList"
          :model-value="keyboard.manual"
          @update:model-value="pickLayout"
        )
      hr(class="border-slate-600 my-1 pt-0")
      div.flex.items-center.justify-between.px-1
        span.text-white.game-text(class="text-xs md:text-sm") {{ t('options.keyboard.bindings') }}
        button.reset-keys(type="button" :disabled="!bindingsChanged()" @click="resetBindings()") {{ t('options.keyboard.reset') }}
      p.text-white.game-text.px-1(v-if="capturing" class="text-[10px] md:text-xs") {{ t('options.keyboard.press') }}
      ul.bindings
        li.bind-row(v-for="a in ACTIONS" :key="a")
          span.bind-name {{ t(`options.actions.${a}`) }}
          button.bind-key(type="button" :class="{ waiting: capturing === a }" @click="startCapture(a)") {{ capturing === a ? '…' : keyLabel(primaryCode(a)) }}

    template(#footer)
      div.flex.flex-wrap.items-center.justify-center.gap-2
        FButton(v-if="canReplayIntro" class="px-4 sm:px-6" type="secondary" @click="emit('replayIntro')") {{ t('options.replayIntro') }}
        FButton(class="px-6 sm:px-8" @click="emit('close')") {{ t('options.close') }}
</template>

<style lang="sass" scoped>
.gameplay-grid
  display: grid
  grid-template-columns: 1fr
  gap: 0.5rem
  align-items: start
@media (orientation: landscape) and (max-height: 540px)
  .gameplay-grid
    grid-template-columns: 1fr 1fr
    column-gap: 1rem
span
  text-shadow: 2px 2px 0 #000
.bindings
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr))
  gap: 4px 12px
  max-height: min(46vh, 22rem)
  overflow-y: auto
  margin: 0
  padding: 0 4px
  list-style: none
.bind-row
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px
  padding: 3px 4px
  border-radius: 8px
  background: rgba(0, 0, 0, 0.22)
.bind-name
  color: #fff
  font-size: clamp(11px, 2.4vmin, 13px)
  line-height: 1.2
.bind-key
  min-width: 2.4em
  height: 1.9em
  padding: 0 0.45em
  border-radius: 0.4em
  background: #f4f7ff
  border: 2px solid #141a33
  box-shadow: 0 0.18em 0 #141a33
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 11px
  cursor: pointer
  &.waiting
    background: #ffd84a
    animation: key-wait 0.9s ease-in-out infinite
.reset-keys
  padding: 2px 10px
  border-radius: 8px
  border: 2px solid #141a33
  background: #6f8cff
  color: #fff
  font-size: 11px
  cursor: pointer
  &:disabled
    opacity: 0.45
    cursor: default
@keyframes key-wait
  50%
    transform: scale(1.08)
</style>
