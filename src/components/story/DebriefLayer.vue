<template lang="pug">
  //- While the film loads (#111): the logo, and Atlas's line in its bubble
  //- (Atlas itself flies in the 3D loader, `story/debriefLoader.ts`).
  div.loader-veil(v-if="loaderUi.on" aria-live="polite")
    SplashBackdrop(:solid="false")
    img.logo(src="/images/logo/logo_256x256.webp" :alt="t('gameName')")
    Transition(name="card" mode="out-in")
      div.say(v-if="loaderUi.line" :key="loaderUi.line") {{ t(loaderUi.line) }}
  //- The debrief after a story mission (#119), over the film
  //- (`story/debrief.ts`): Skip, the copied weapon's card, the next sector's
  //- card with its Master. The words are in the scene bubble (SceneBubble.vue).
  //- A tap on the film jumps to the next line.
  div.debrief(v-if="debriefUi.on" @pointerdown="debriefLive?.advance()")
    HubHologram(v-if="holo" :id="holo" :stage="hubSceneUi.stage")
    button.skip(
      type="button"
      :aria-label="t('ui.skip')"
      aria-keyshortcuts="Escape"
      @pointerdown.stop
      @click="debriefLive?.skip()"
    )
      span {{ t('ui.skip') }}
      GameIcon.si(name="skip-forward")
    Transition(name="card" mode="out-in")
      div.card.weapon(v-if="debriefUi.stage === 'weapon' && weapon" key="weapon")
        span.w-icon
          GameIcon(:name="WEAPON_ICON[weapon]")
        span.c-title {{ t('results.newWeapon', { weapon: t(`weapon.${weapon}.name`) }) }}
      div.card.next(v-else-if="debriefUi.stage === 'next' && next" key="next")
        MasterPortrait(:id="next.boss" state="next" :size="64")
        span.c-text
          span.c-title {{ t(`sector.${next.id}`) }}
          span.c-sub {{ t(`boss.${next.boss}`) }} · {{ t('hub.levels', { a: next.levels[0], b: next.levels[1] }) }}
</template>

<script setup lang="ts">
import SplashBackdrop from '@/components/atoms/SplashBackdrop.vue'
import { loaderUi } from '@/game/story/debriefLoader'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import MasterPortrait from '@/components/atoms/MasterPortrait.vue'
import HubHologram from './HubHologram.vue'
import { debriefUi } from '@/game/story/debriefUi'
import { hubSceneUi } from '@/game/story/hubSceneUi'
import { debriefLive } from '@/game/flow'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { WEAPON_ICON, type WeaponId } from '@/game/data/weapons'
import type { BossId } from '@/game/models/bosses'
import type { SectorId } from '@/game/world/themes'

const { t } = useI18n()

const weapon = computed(() => (debriefUi.weapon in WEAPON_ICON ? debriefUi.weapon as WeaponId : null))
const next = computed(() => {
  const s = SECTOR_BY_ID[debriefUi.to as SectorId]
  return s ? { id: s.id, boss: s.boss as BossId, levels: s.levels } : null
})
/** Vex's part, where it is a hologram scene (the blueprint, the reserve, the breach). */
const holo = computed(() => (debriefUi.stage === 'vex' && hubSceneUi.id && hubSceneUi.id !== 'broadcast' ? hubSceneUi.id : null))

// Esc skips (the button's key); Space or Enter is a tap. Space never scrolls here.
const onKey = (e: KeyboardEvent): void => {
  if (!debriefUi.on || e.repeat) return
  if (e.key === 'Escape') debriefLive?.skip()
  else if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault()
    debriefLive?.advance()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped lang="sass">
.loader-veil
  position: absolute
  inset: 0
  display: flex
  flex-direction: column
  align-items: center
  justify-content: space-between
  padding: calc(env(safe-area-inset-top, 0px) + 6vh) 16px calc(env(safe-area-inset-bottom, 0px) + 10vh)
  pointer-events: none
  .logo, .say
    position: relative
  .logo
    width: clamp(110px, 22vmin, 190px)
    height: auto
    filter: drop-shadow(0 4px 0 rgba(0, 0, 0, 0.35))
  .say
    max-width: min(86vw, 520px)
    padding: 10px 16px
    border-radius: 16px
    background: #fff8e6
    border: 3px solid #141a33
    color: #141a33
    font-family: var(--font-ui)
    font-size: clamp(15px, 3.2vmin, 20px)
    text-align: center
    box-shadow: 0 0 0 2px #7ff4ff
.debrief
  position: absolute
  inset: 0
  z-index: 20
  color: #fff
  font-family: var(--font-ui)
  pointer-events: auto
.skip
  position: absolute
  top: calc(env(safe-area-inset-top, 0px) + 12px)
  right: calc(env(safe-area-inset-right, 0px) + 12px)
  display: flex
  align-items: center
  gap: 6px
  padding: 8px 14px
  border-radius: 999px
  border: 2px solid rgba(255, 255, 255, 0.6)
  background: rgba(20, 26, 51, 0.6)
  color: #fff
  font-size: clamp(13px, 2.6vmin, 16px)
  cursor: pointer
  .si
    width: 18px
    height: 18px
.card
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(56px, 13vh, 120px))
  transform: translateX(-50%)
  display: flex
  align-items: center
  gap: 0.7em
  max-width: min(86vw, 460px)
  padding: 0.6em 1.1em
  border-radius: 16px
  border: 2px solid rgba(255, 255, 255, 0.55)
  background: rgba(12, 18, 44, 0.82)
  box-shadow: 0 4px 0 rgba(8, 10, 24, 0.5)
  font-size: clamp(14px, 3vmin, 21px)
  line-height: 1.2
  pointer-events: none
  &.weapon
    border-color: #ffd35a
.w-icon
  flex: none
  width: 2.2em
  height: 2.2em
  padding: 0.3em
  border-radius: 50%
  background: #ffd35a
  color: #1a1430
.c-text
  display: flex
  flex-direction: column
  gap: 0.15em
  min-width: 0
.c-title
  font-weight: 700
.c-sub
  font-size: 0.8em
  opacity: 0.85
.card-enter-active, .card-leave-active
  transition: opacity 0.3s, transform 0.3s
.card-enter-from, .card-leave-to
  opacity: 0
  transform: translateX(-50%) translateY(-10px)
@media (prefers-reduced-motion: reduce)
  .card-enter-active, .card-leave-active
    transition: opacity 0.3s
</style>
