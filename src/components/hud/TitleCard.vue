<template lang="pug">
  Transition(name="tc")
    div.title-card(v-if="visible" aria-live="polite" :class="{ challenge }")
      div.stripe
      //- A challenge room's mini-boss: the CHALLENGE label over its name.
      div.tc-label(v-if="challenge")
        span.trophy
          GameIcon(name="trophy")
        span {{ t('challenge.label') }}
      div.tc-name {{ t(hud.titleKey) }}
      div.tc-sub(v-if="hud.titleSub") {{ t(hud.titleSub) }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import GameIcon from '@/components/icons/GameIcon.vue'

/** The boss name card: a diagonal stripe sweeps in, the master's name slams
 *  down, then it all slides away as the bar finishes filling. */
const { t } = useI18n()
const visible = ref(false)
/** A challenge (`sim/challenge.ts`): gold, not a Core Master's red. */
const challenge = computed(() => hud.titleStyle === 'challenge')
let timer: number | null = null
const show = () => {
  if (!hud.titleKey) return
  visible.value = true
  if (timer !== null) clearTimeout(timer)
  timer = window.setTimeout(() => { visible.value = false }, 2200)
}
watch(() => hud.titleShownAt, show)
onMounted(() => { if (hud.titleShownAt && performance.now() - hud.titleShownAt < 2000) show() })
onUnmounted(() => { if (timer !== null) clearTimeout(timer) })
</script>

<style scoped lang="sass">
.title-card
  position: absolute
  left: 0
  right: 0
  top: 38%
  display: flex
  flex-direction: column
  align-items: center
  pointer-events: none
  z-index: 3
.stripe
  position: absolute
  left: -10%
  right: -10%
  top: -18%
  bottom: -18%
  background: linear-gradient(90deg, transparent, rgba(20, 26, 51, 0.85) 15%, rgba(20, 26, 51, 0.85) 85%, transparent)
  transform: skewY(-3deg)
  border-top: 3px solid #ff4a5a
  border-bottom: 3px solid #ff4a5a
.tc-name
  position: relative
  font-family: var(--font-ui)
  font-size: clamp(28px, 8vmin, 58px)
  color: #fff
  letter-spacing: 0.06em
  text-transform: uppercase
  text-shadow: 0 4px 0 #141a33, 0 0 18px rgba(255, 74, 90, 0.6)
  animation: tc-slam 0.45s cubic-bezier(0.2, 1.6, 0.4, 1)
.tc-sub
  position: relative
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.8vmin, 17px)
  color: #ffd84a
  letter-spacing: 0.12em
  text-transform: uppercase
.tc-label
  position: relative
  display: flex
  align-items: center
  gap: 0.35em
  margin-bottom: 0.15em
  font-family: var(--font-ui)
  font-size: clamp(13px, 3vmin, 19px)
  color: #ffd84a
  letter-spacing: 0.22em
  text-transform: uppercase
  text-shadow: 0 2px 0 #141a33
  animation: tc-slam 0.45s cubic-bezier(0.2, 1.6, 0.4, 1)
.trophy
  display: block
  width: 1.2em
  height: 1.2em
  filter: drop-shadow(0 2px 0 #141a33)
// The challenge card: gold rules, a gold glow on the name.
.challenge
  .stripe
    border-top-color: #ffc23a
    border-bottom-color: #ffc23a
  .tc-name
    text-shadow: 0 4px 0 #141a33, 0 0 18px rgba(255, 194, 58, 0.65)
@keyframes tc-slam
  from
    transform: scale(2.2)
    opacity: 0
.tc-enter-active
  transition: opacity 0.2s, transform 0.3s
.tc-leave-active
  transition: opacity 0.35s, transform 0.35s
.tc-enter-from
  opacity: 0
  transform: translateX(-30px)
.tc-leave-to
  opacity: 0
  transform: translateX(40px)
</style>
