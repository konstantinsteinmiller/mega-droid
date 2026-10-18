<template lang="pug">
  //- Pip announces the Overload (#100) on the first Lab visit after the Gale
  //- Master, then opens the Circuits page on it. Tap to go at once.
  button.pip-notice(v-if="visible" type="button" role="status" @click="go")
    span.line {{ t('hubLesson.overload') }}
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { profile, markTip } from '@/game/state/profile'
import { flow } from '@/game/flow'
import { isAnyModalOpen } from '@/use/useModalState'
import { sfx } from '@/game/audio/sfx'
import { hubLesson, hubTab, tabOpen, circuitsFocus } from './hubLesson'
import { hubSceneUi } from '@/game/story/hubSceneUi'
import { hubUi } from '@/game/state/hubUi'
import { currentHub } from '@/game/boot'

/** `profile.tips` key: Pip has announced the Overload. */
const OVERLOAD_TIP = 'pip:overload'
/** How long Pip's line stays before the page opens by itself. */
const READ_MS = 2600

const { t } = useI18n()
const due = computed(() =>
  profile.hero.weapons.includes('galeGuard') &&
  !((profile.hero.skills.giga ?? 0) > 0) &&
  !profile.tips[OVERLOAD_TIP] &&
  tabOpen('circuits')
)
/** Anything else on top (a modal, the upgrade tour, a load, Vex's scene) goes first. */
const visible = computed(() => due.value && flow.screen === 'hub' && !flow.modal &&
  !isAnyModalOpen.value && !flow.loading && !hubLesson.step && !hubSceneUi.active && !hubUi.cine)

let timer: ReturnType<typeof setTimeout> | null = null
const go = (): void => {
  if (timer) { clearTimeout(timer); timer = null }
  if (!due.value) return
  markTip(OVERLOAD_TIP)
  circuitsFocus.value = 'giga'
  // Over to the chip lab, where the Circuits panel opens on it (#173).
  const hub = currentHub()
  if (hub) hub.goTo('circuits')
  else hubTab.value = 'circuits'
  sfx('uiOpen')
}
watch(visible, (v) => {
  if (timer) { clearTimeout(timer); timer = null }
  if (!v) return
  sfx('objective')
  timer = setTimeout(go, READ_MS)
}, { immediate: true })
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped lang="sass">
.pip-notice
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(60px, 14vh, 110px))
  transform: translateX(-50%)
  z-index: 30
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: 2px
  max-width: min(84vw, 420px)
  padding: 0.5em 0.9em
  border-radius: 1em
  border: 3px solid #4a1f86
  background: #ffffff
  color: #141a33
  font-family: var(--font-ui)
  font-size: clamp(13px, 2.8vmin, 17px)
  text-align: start
  pointer-events: auto
  cursor: pointer
  box-shadow: 0 0 0 3px #b46cff, 0 4px 0 rgba(0, 0, 0, 0.35)
  animation: pip-in 0.25s ease-out
@keyframes pip-in
  from
    opacity: 0
    transform: translate(-50%, -8px)
@media (prefers-reduced-motion: reduce)
  .pip-notice
    animation: none
</style>
