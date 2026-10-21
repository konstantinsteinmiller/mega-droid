<template lang="pug">
  //- A Master's baked portrait (`scripts/render-portraits.mjs`): framed in
  //- their signature colour, greyed out once beaten, a silhouette and "?"
  //- while locked (the face is kept for the reveal).
  span.portrait(
    :class="state"
    :style="{ '--ring': color, '--ring-soft': color + '59', '--ring-glow': color + 'b3', '--ring-off': color + '00', width: size + 'px', height: size + 'px' }"
    role="img"
    :aria-label="state === 'locked' ? t('hud.bossUnknown') : t(`boss.${id}`)"
  )
    //- Eager: lazy let the loading beam's boss splash (mounted mid-build, its
    //- portrait striking in from off-frame) show an empty ring.
    img(:src="src" alt="" draggable="false")
    span.q(v-if="state === 'locked'" aria-hidden="true") ?
    span.tick(v-if="state === 'beaten'" aria-hidden="true")
      GameIcon(name="check")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { MASTER_COLOR } from '@/game/data/signature'
import type { BossId } from '@/game/models/bosses'
import type { PortraitState } from './portraitState'


/** Every Master's portrait, fetched once when the browser is idle (eleven
 *  ~3 KB files): the boss splash on the mission loader mounts while the
 *  sector builds and the main thread is busy, too late to fetch its face. */
let preloaded = false
const preloadPortraits = (): void => {
  if (preloaded || typeof window === 'undefined') return
  preloaded = true
  const go = (): void => {
    for (const id of Object.keys(MASTER_COLOR)) new Image().src = `${import.meta.env.BASE_URL}images/masters/${id}.webp`
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 3000 })
  else setTimeout(go, 1500)
}
preloadPortraits()

const props = withDefaults(defineProps<{ id: BossId; state?: PortraitState; size?: number }>(), {
  state: 'plain',
  size: 56
})

const { t } = useI18n()
const src = computed(() => `${import.meta.env.BASE_URL}images/masters/${props.id}.webp`)
/** Hidden while locked: the colour is part of the reveal too. */
const color = computed(() => (props.state === 'locked' ? '#5b6380' : MASTER_COLOR[props.id] ?? '#ffffff'))
</script>

<style scoped lang="sass">
.portrait
  position: relative
  display: inline-grid
  place-items: center
  flex: none
  border-radius: 50%
  border: 3px solid var(--ring)
  background: radial-gradient(circle at 50% 35%, var(--ring-soft), #0d1124 75%)
  overflow: hidden
  img
    width: 100%
    height: 100%
    object-fit: cover
    pointer-events: none
  &.beaten img
    filter: grayscale(0.85) brightness(0.8)
  &.locked img
    filter: brightness(0) opacity(0.55)
  &.next
    animation: ring-pulse 1.2s ease-in-out infinite
.q
  position: absolute
  inset: 0
  display: grid
  place-items: center
  color: #cfd6ff
  font-family: var(--font-display, var(--font-ui))
  font-size: 1.4em
.tick
  position: absolute
  right: 4%
  bottom: 4%
  width: 34%
  height: 34%
  display: grid
  place-items: center
  border-radius: 50%
  background: #4fd19a
  color: #0d1124
  border: 2px solid #0d1124
@keyframes ring-pulse
  0%, 100%
    box-shadow: 0 0 0 0 var(--ring-glow)
  50%
    box-shadow: 0 0 0 6px var(--ring-off)
@media (prefers-reduced-motion: reduce)
  .portrait.next
    animation: none
    box-shadow: 0 0 0 3px var(--ring)
</style>
