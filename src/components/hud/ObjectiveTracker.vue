<template lang="pug">
  div.obj(v-if="hud.objectiveKey && hud.phase !== 'hub'" :class="{ done: hud.objectiveDone }" data-zone="objective")
    div.obj-head
      span.dot
      span.label {{ hud.objectiveDone ? t('objective.complete') : t('objective.title') }}
    div.obj-body
      //- The boss's face beside its name: a name alone let a Guardroid pass
      //- for the boss.
      img.portrait(v-if="portrait && !hud.objectiveDone" :src="portrait" :alt="bossName")
      div.obj-text {{ text }}
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import { resolveParams } from '@/game/state/i18nParams'
import { flow } from '@/game/flow'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { BossId } from '@/game/models/bosses'
import { bossPortrait, cachedBossPortrait } from '@/game/models/portrait'

/** The mission objective line (Blades' quest tracker), under the energy bars. */
const { t } = useI18n()

/** The objectives that name the sector's boss ("Defeat {boss}"; a climb's
 *  rematch at the foot of the tower and a platform stage's arena too). */
const BOSS_OBJECTIVES = ['objective.boss', 'objective.tutorial', 'objective.climb', 'objective.stage']
/** Whose objective this is: the sector's Core Master (the Scrapper in the
 *  Scrapyard, on the tutorial and its replays alike). */
const bossId = computed<BossId | null>(() => {
  const q = flow.quest
  return q && BOSS_OBJECTIVES.includes(hud.objectiveKey) ? SECTOR_BY_ID[q.sector].boss as BossId : null
})
const bossName = computed(() => (bossId.value ? t(`boss.${bossId.value}`) : ''))
const text = computed(() => {
  if (hud.objectiveDone) return t('objective.beamOutHint')
  const params = resolveParams(t, hud.objectiveParams)
  if (bossName.value) params.boss = bossName.value
  return t(hud.objectiveKey, params)
})

// Rendered once per boss, after the beam-in (the mission is running and its
// shaders are warm), then cached for the session: see `models/portrait.ts`.
const portrait = ref<string | null>(null)
watch([bossId, () => hud.phase], ([id, phase]) => {
  portrait.value = id ? cachedBossPortrait(id) : null
  if (!id || portrait.value || phase !== 'play') return
  void bossPortrait(id).then((url) => {
    if (bossId.value === id) portrait.value = url
  })
}, { immediate: true })
</script>

<style scoped lang="sass">
.obj
  position: absolute
  left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(40px, 9vmin, 60px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px))
  max-width: min(44vw, 280px)
  padding: 6px 10px
  border-radius: 10px
  background: rgba(11, 20, 51, 0.62)
  border: 2px solid rgba(127, 244, 255, 0.35)
  color: #fff
  font-family: var(--font-ui)
  pointer-events: none
  &.done
    border-color: rgba(141, 255, 122, 0.8)
    box-shadow: 0 0 14px rgba(141, 255, 122, 0.35)
.obj-head
  display: flex
  align-items: center
  gap: 6px
  font-size: clamp(9px, 1.9vmin, 12px)
  color: #9fe6ff
  letter-spacing: 0.06em
  text-transform: uppercase
.done .obj-head
  color: #8dff7a
.dot
  width: 7px
  height: 7px
  border-radius: 50%
  background: currentColor
  box-shadow: 0 0 6px currentColor
.obj-body
  display: flex
  align-items: center
  gap: 8px
  margin-top: 2px
// A round badge on a dark disc, ringed in the boss red (the story card's
// colour); the portrait's background is transparent.
.portrait
  flex: 0 0 auto
  width: clamp(34px, 7.5vmin, 46px)
  height: clamp(34px, 7.5vmin, 46px)
  border-radius: 50%
  border: 2px solid #ff6a78
  background: radial-gradient(circle at 50% 35%, #3a4a86, #141a33 72%)
  box-shadow: 0 0 8px rgba(255, 74, 90, 0.45)
  object-fit: cover
  animation: portrait-in 0.35s ease-out
.obj-text
  font-size: clamp(11px, 2.4vmin, 15px)
  line-height: 1.25
  text-shadow: 0 2px 0 #141a33
@keyframes portrait-in
  from
    opacity: 0
    transform: scale(0.6)
// Portrait: too narrow to share the top row with the status pills, so the
// tracker sits under the bars instead.
// A narrow landscape screen: the compass sits under the top row from 30vw to
// 70vw (Compass.vue), so the card ends before 30vw and wraps instead.
@media (min-aspect-ratio: 1/1) and (max-width: 1100px)
  .obj
    max-width: calc(30vw - 8px - env(safe-area-inset-left, 0px) - clamp(8px, 2.2vmin, 18px) - clamp(40px, 9vmin, 60px))
@media (max-aspect-ratio: 1/1)
  .obj
    left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2.2vmin, 18px))
    top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(110px, 28vmin, 200px) + 24px)
    max-width: min(70vw, 320px)
</style>
