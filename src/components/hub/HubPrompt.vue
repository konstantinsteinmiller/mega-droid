<template lang="pug">
  //- What Flux can do where he stands (#173), low in the middle of the view:
  //- at a pedestal its mission's card (Deploy beams him out), at a station
  //- "[E] Open", at a locked place why it is shut.
  Transition(name="prompt")
    div.prompt(v-if="shown" :key="key" :class="kind" role="status")
      //- A pedestal: its mission, and the gel for the road.
      template(v-if="kind === 'pad'")
        div.note(v-if="secured") {{ t('hub.sectorClear') }} · {{ t('hub.replayHint', { boss: bossName }) }}
        QuestCard.card(
          v-if="quest"
          :quest="quest"
          :story="quest.kind === 'story'"
          :key-hint="!touch"
          data-hub="deploy"
          @deploy="deploy"
          @reroll="reroll"
        )
        div.note(v-else) {{ t('hub.jobEmpty') }}
        div.gift(v-if="quest && sup.giftReady.value" data-gift="ready")
          GameIcon.g-ico(name="flask")
          span {{ t('hub.gift.ready') }}
        button.gift.offer(
          v-else-if="quest && sup.giftOffer.value"
          type="button"
          data-gift="offer"
          :disabled="sup.adInFlight.value"
          :aria-label="t('hub.gift.aria')"
          @click="sup.claimGift"
        )
          GameIcon.g-ico(name="flask")
          span.g-name {{ t('hub.gift.name') }}
          RewardAdBadge
          span +1
      //- A locked place: what opens it.
      div.locked(v-else-if="kind === 'locked'")
        GameIcon.l-ico(name="lock")
        span {{ lockedText }}
      //- A station (or the briefing table): its one action.
      button.act(v-else type="button" :data-hub="'act'" @click="act")
        KeyCap.k(v-if="!touch" code="KeyE")
        span.a-verb {{ verb }}
        span.a-place(v-if="poi?.id !== 'table'") {{ placeName }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import RewardAdBadge from '@/components/atoms/RewardAdBadge.vue'
import KeyCap from '@/components/hud/KeyCap.vue'
import QuestCard from './QuestCard.vue'
import { hubUi, hubDialog } from '@/game/state/hubUi'
import { POI_BY_ID, type PoiId } from '@/game/world/hubLayout'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { profile } from '@/game/state/profile'
import { flow, padQuest, rerollJob, briefingToReplay } from '@/game/flow'
import { currentHub, input } from '@/game/boot'
import { hud } from '@/game/state/hud'
import { isAnyModalOpen } from '@/use/useModalState'
import { sfx } from '@/game/audio/sfx'
import { hubTab } from './hubLesson'
import { missionsLeft, unlockCount, type HubMenu } from './hubUnlocks'
import { usePipSupplies } from './pipSupplies'
import { placeStateNow } from './placeView'

const { t } = useI18n()
const sup = usePipSupplies()
const touch = computed(() => hud.device === 'touch' || input.device === 'touch')

/** The place the prompt is about: the one Flux stands at, else a locked one before him. */
const id = computed<PoiId | ''>(() => hubUi.near || hubUi.nearLocked)
const state = computed(() => (id.value ? placeStateNow(id.value) : ''))
const poi = computed(() => (id.value ? POI_BY_ID[id.value] : null))
const kind = computed<'pad' | 'locked' | 'station' | ''>(() => {
  const p = poi.value
  if (!p) return ''
  if (state.value === 'locked') return 'locked'
  if (p.kind === 'station') return p.id === 'table' && !briefingToReplay() ? '' : 'station'
  return 'pad'
})
/** Re-keyed per place, so the card slides in fresh at each. */
const key = computed(() => `${id.value}:${state.value}:${profile.quests.jobs.map(j => j.id).join()}`)
const shown = computed(() => flow.screen === 'hub' && kind.value !== '' && !hubUi.cine && hubTab.value === 'missions' &&
  !hubDialog.open && !hubDialog.board && !isAnyModalOpen.value && !flow.modal && !flow.loading)

// ── A pedestal ──
const quest = computed(() => {
  // Re-read when the board changes (a reroll) or the story moves.
  void profile.quests.jobs.length
  void profile.world.bosses.length
  return id.value ? padQuest(id.value) : null
})
const secured = computed(() => state.value === 'cleared')
const bossName = computed(() => (poi.value?.sector ? t(`boss.${SECTOR_BY_ID[poi.value.sector].boss}`) : ''))
const deploy = (): void => {
  const q = quest.value
  if (!q) return
  sfx('uiOpen')
  currentHub()?.deploy(q)
}
const reroll = (): void => {
  const q = quest.value
  if (!q || q.kind !== 'job') return
  sfx('uiClick')
  rerollJob(q.id)
  currentHub()?.refreshJobs()
}

// ── A locked place ──
const MENU: Partial<Record<PoiId, HubMenu>> = { hero: 'hero', workshop: 'workshop', circuits: 'circuits', records: 'leaderboard' }
const lockedText = computed(() => {
  const p = poi.value
  if (!p) return ''
  const menu = MENU[p.id]
  if (menu) return t('hub.unlock.hint', { n: missionsLeft(menu, unlockCount(profile)) }, missionsLeft(menu, unlockCount(profile)))
  if (p.kind === 'job') return t('hub.jobsLocked', { boss: t('boss.blazeMaster') })
  const s = p.sector ? SECTOR_BY_ID[p.sector] : null
  const prev = s?.after ? SECTOR_BY_ID[s.after].boss : ''
  return t('hub.lockedHint', { boss: prev ? t(`boss.${prev}`) : '' })
})

// ── A station ──
const placeName = computed(() => (poi.value ? t(`hub.place.${poi.value.id}`) : ''))
const verb = computed(() => (poi.value?.id === 'table' ? t('hub.act.brief') : t('hub.act.open')))
const act = (): void => currentHub()?.interact()
</script>

<style scoped lang="sass">
.prompt
  position: absolute
  left: 50%
  bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(14px, 4vh, 34px))
  transform: translateX(-50%)
  zoom: var(--ui-scale, 1)
  display: flex
  flex-direction: column
  align-items: stretch
  gap: 6px
  width: min(560px, calc(100vw / var(--ui-scale, 1) - 32px))
  pointer-events: auto
  color: #fff
  font-family: var(--font-ui)
  &.station, &.locked
    width: auto
    align-items: center
.note
  align-self: center
  max-width: 100%
  padding: 6px 12px
  border-radius: 12px
  background: rgba(11, 20, 51, 0.82)
  border: 2px solid #141a33
  color: #8dff7a
  font-size: clamp(12px, 2.4vmin, 14px)
  text-align: center
.card
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.35), 0 0 24px rgba(0, 0, 0, 0.35)
.gift
  align-self: center
  display: flex
  align-items: center
  gap: 6px
  padding: 5px 12px
  border-radius: 999px
  border: 2px solid #141a33
  background: rgba(11, 20, 51, 0.85)
  color: #8dff7a
  font-size: clamp(12px, 2.4vmin, 14px)
  &.offer
    color: #141a33
    background: linear-gradient(#9fe6ff, #3c8cff)
    font-family: var(--font-pixel)
    font-size: 11px
    cursor: pointer
    &:disabled
      filter: grayscale(0.8) brightness(0.7)
  .g-name
    font-family: var(--font-ui)
    font-size: clamp(12px, 2.4vmin, 14px)
.g-ico
  width: 18px
  height: 18px
.locked
  display: flex
  align-items: center
  gap: 8px
  padding: 8px 14px
  border-radius: 999px
  border: 2px solid #ff4a5a
  background: rgba(30, 10, 20, 0.86)
  font-size: clamp(13px, 2.6vmin, 16px)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35)
.l-ico
  width: 18px
  height: 18px
.act
  display: flex
  align-items: center
  gap: 8px
  padding: 9px 18px
  border-radius: 999px
  border: 3px solid #141a33
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
  font-family: var(--font-ui)
  font-size: clamp(14px, 2.8vmin, 18px)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35)
  cursor: pointer
  &:active
    transform: translateY(2px)
.k
  font-size: 0.9em
.a-place
  opacity: 0.85
.prompt-enter-active, .prompt-leave-active
  transition: opacity 0.18s, transform 0.18s
.prompt-enter-from, .prompt-leave-to
  opacity: 0
  transform: translate(-50%, 12px)
@media (prefers-reduced-motion: reduce)
  .prompt-enter-active, .prompt-leave-active
    transition: opacity 0.18s
</style>
