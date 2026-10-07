<template lang="pug">
  div.missions.sheet
    div.sectors(ref="strip")
      //- The stage select (#103): each Master's portrait on a tile in their
      //- signature colour — beaten ones greyed with a tick, the next one
      //- pulsing, locked ones a silhouette. The story stays linear.
      button.sector(
        v-for="s in SECTORS"
        :key="s.id"
        v-fit
        type="button"
        :class="{ on: sel === s.id, locked: !unlocked(s.id), cleared: cleared(s.id), finale: s.id === 'fortress' }"
        :data-sector="s.id"
        :style="{ '--c1': SECTOR_COLOR[s.id], '--c2': SECTOR_COLOR[s.id] }"
        @click="select(s.id)"
      )
        MasterPortrait.s-face(:id="bossOf(s.id)" :state="faceState(s.id)" :size="40")
        span.s-name {{ t(`sector.${s.id}`) }}
        span.s-lvl {{ t('hub.levels', { a: s.levels[0], b: s.levels[1] }) }}
    div.scroll
      div.section-title {{ t('hub.story') }}
      QuestCard(v-if="story" :quest="story" story @deploy="deploy(story)")
      div.note(v-else-if="!unlocked(sel)") {{ t('hub.lockedHint', { boss: t(`boss.${prevBoss(sel)}`) }) }}
      div.note.ok(v-else) {{ t(boardOpen ? 'hub.sectorSecured' : 'hub.sectorClear') }}
      //- Rewarded: one Repair Gel for the next mission, offered where the
      //- player is about to deploy. Once watched, a badge says it is packed.
      div.gift.ready(v-if="giftReady" data-gift="ready")
        div.gift-ico
          GameIcon(name="flask")
        div.gift-info
          div.gn {{ t('hub.gift.ready') }}
          div.gd {{ t('hub.gift.readyDesc') }}
      div.gift(v-else-if="giftOffer" data-gift="offer")
        div.gift-ico
          GameIcon(name="flask")
        div.gift-info
          div.gn {{ t('hub.gift.name') }}
          div.gd {{ t('hub.gift.desc') }}
        button.gift-btn(
          type="button"
          :disabled="adInFlight"
          :aria-label="t('hub.gift.aria')"
          @click="claimGift"
        )
          //- A video for "+1" and the flask: signed, like every reward.
          GameIcon.bi(name="video")
          span +1
          GameIcon.bi(name="flask")
      div.section-title
        span {{ t('hub.jobs') }}
        span.hint(v-if="boardOpen") {{ t('hub.jobsHint') }}
      //- The board opens after the Flame Master (#120): the story comes first.
      template(v-if="boardOpen")
        QuestCard(v-for="j in profile.quests.jobs" :key="j.id" :quest="j" @deploy="deploy(j)" @reroll="reroll(j.id)")
      div.note(v-else data-jobs="locked") {{ t('hub.jobsLocked', { boss: t('boss.blazeMaster') }) }}
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import QuestCard from './QuestCard.vue'
import MasterPortrait from '@/components/atoms/MasterPortrait.vue'
import type { PortraitState } from '@/components/atoms/portraitState'
import type { BossId } from '@/game/models/bosses'
import { SECTORS, SECTOR_BY_ID } from '@/game/data/regions'
import type { SectorId } from '@/game/world/themes'
import { SECTOR_COLOR } from '@/game/data/signature'
import { profile, saveProfile, computeStats } from '@/game/state/profile'
import { storyFor, startMission, rerollJob, jobsOpen } from '@/game/flow'
import type { Quest } from '@/game/data/quests'
import { sfx } from '@/game/audio/sfx'
import { boardClosed, boardOpened, sectorSelected } from '@/game/story/hubAtlas'
import { hubLesson } from './hubLesson'
import { useDragScroll, revealIn } from '@/use/useDragScroll'
import { claimReward, canOfferReward, adInFlight } from '@/use/useAdGate'
import { resumeMusicAfterAd } from '@/use/useSound'

/** Sector strip (the valley map), the sector's story mission, and the job board. */
const { t } = useI18n()
const unlocked = (id: SectorId) => profile.world.unlocked.includes(id)
const boardOpen = computed(jobsOpen)
const cleared = (id: SectorId) => profile.world.bosses.includes(SECTOR_BY_ID[id].boss)
const firstOpenStory = SECTORS.find(s => unlocked(s.id) && !cleared(s.id))?.id ?? profile.world.selected
const sel = ref<SectorId>(firstOpenStory)
const story = computed(() => storyFor(sel.value))
/** The sector to play next (the first open one not cleared). */
const nextUp = computed(() => SECTORS.find(s => unlocked(s.id) && !cleared(s.id))?.id ?? null)
const bossOf = (id: SectorId): BossId => SECTOR_BY_ID[id].boss as BossId
const faceState = (id: SectorId): PortraitState =>
  !unlocked(id) ? 'locked' : cleared(id) ? 'beaten' : id === nextUp.value ? 'next' : 'plain'
const prevBoss = (id: SectorId) => {
  const s = SECTOR_BY_ID[id]
  return s.after ? SECTOR_BY_ID[s.after].boss : ''
}
// The strip drags with a mouse (a wheel scrolls it too), and the selected
// sector always scrolls fully into view: on opening, and on every pick.
const strip = ref<HTMLElement | null>(null)
useDragScroll(strip)
const reveal = (smooth: boolean) => {
  const el = strip.value
  const card = el?.querySelector<HTMLElement>(`[data-sector="${sel.value}"]`)
  if (el && card) revealIn(el, card, smooth)
}
/**
 * A sector's texts fit its tile. Names of several words wrap; one long word
 * cannot ("Gezeitenschleusen", "Polaritätswerk"), and ran out over the
 * tile's edges. It shrinks until it fits, down to FIT_MIN of its size; a
 * word still too long at that size (a phone's narrow tiles) widens its own
 * tile instead of going unreadable. The level range stays on one line, and
 * widens the tile the same way.
 */
const FIT_MIN = 0.8
const fitTile = (tile: HTMLElement): void => {
  const name = tile.querySelector<HTMLElement>('.s-name')
  const lvl = tile.querySelector<HTMLElement>('.s-lvl')
  tile.style.width = ''
  if (name) {
    name.style.fontSize = ''
    let size = parseFloat(getComputedStyle(name).fontSize)
    const min = size * FIT_MIN
    while (size > min && name.scrollWidth > name.clientWidth + 0.5) {
      size -= 0.5
      name.style.fontSize = `${size}px`
    }
  }
  const over = Math.max(name ? name.scrollWidth - name.clientWidth : 0, lvl ? lvl.scrollWidth - lvl.clientWidth : 0)
  if (over > 0.5) tile.style.width = `${Math.ceil(tile.getBoundingClientRect().width + over)}px`
}
const vFit = { mounted: fitTile, updated: fitTile }
const fitNames = (): void => { strip.value?.querySelectorAll<HTMLElement>('.sector').forEach(fitTile) }
// Again whenever the strip changes size (the tab shown, the window resized)
// and once the UI font has loaded: the fallback font's widths are not its own.
let fitWatch: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && strip.value) {
    fitWatch = new ResizeObserver(fitNames)
    fitWatch.observe(strip.value)
  }
  void document.fonts?.ready.then(fitNames)
})
onUnmounted(() => fitWatch?.disconnect())
onMounted(() => {
  void nextTick(() => reveal(false))
  // Atlas on the board (#117): the preselected sector's floor level, or a warning that it is too high.
  boardOpened()
  if (!hubLesson.step) sectorSelected(sel.value)
})
onUnmounted(boardClosed)
const select = (id: SectorId) => {
  sel.value = id
  profile.world.selected = id
  sfx('uiClick')
  sectorSelected(id)
  void nextTick(() => reveal(true))
}
const deploy = (q: Quest) => {
  sfx('uiOpen')
  saveProfile()
  startMission(q)
}
const reroll = (id: string) => {
  sfx('uiClick')
  rerollJob(id)
}

// ─── Gel for the road (rewarded) ─────────────────────────────────────────────
// A video buys one Repair Gel, packed as a flag and handed over when the next
// mission begins (`claimGiftTank`), one over the cap if need be. Only after
// the tutorial (its gel lesson scripts the gels), never while a gift is
// already packed, and never when he already carries more than the cap (a
// gift left over from last time): "one over" stays one. Hidden whenever no
// rewarded ad is ready, like the Workshop's supply drop.
const tanksMax = computed(() => { void profile.hero.skills; return computeStats().tanksMax })
const giftReady = computed(() => profile.world.tutorialDone && profile.inv.giftTank)
const giftOffer = computed(() =>
  profile.world.tutorialDone && canOfferReward.value && profile.inv.tanks <= tanksMax.value)
const claimGift = async () => {
  if (profile.inv.giftTank) return
  try {
    await claimReward(() => {
      profile.inv.giftTank = true
      saveProfile()
      sfx('tank')
    })
  } finally {
    // The ad hard-stopped the lab music and its play intent; nothing else
    // restarts it until the next mission, so bring it back here.
    resumeMusicAfterAd()
  }
}
</script>

<style scoped lang="sass">
@use './sheet'
.sectors
  display: flex
  gap: 8px
  overflow-x: auto
  padding: 4px 2px 10px
  scrollbar-width: none
  overscroll-behavior-x: contain
  &::-webkit-scrollbar
    display: none
  @media (pointer: fine)
    cursor: grab
  &.dragging
    cursor: grabbing
    user-select: none
    .sector
      pointer-events: none
.sector
  flex: 0 0 auto
  display: flex
  flex-direction: column
  align-items: center
  gap: 3px
  width: clamp(76px, 17vmin, 100px)
  padding: 8px 4px
  border-radius: 14px
  border: 3px solid #141a33
  background: linear-gradient(color-mix(in srgb, var(--c1) 62%, #0b1433), color-mix(in srgb, var(--c1) 30%, #0b1433))
  color: #fff
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &.on
    outline: 3px solid #ffd84a
    transform: translateY(-2px)
  &.locked
    filter: grayscale(0.85) brightness(0.6)
.sector
  // The tile's rim is the Master's colour too.
  border-color: var(--c1)
  &.locked
    border-color: #141a33
  // The Fortress (Vex): the wide final tile.
  &.finale
    width: clamp(96px, 22vmin, 128px)
.locked .s-face
  filter: none
.s-name
  // The tile's inner width, never more: `v-fit` shrinks what does not fit.
  max-width: 100%
  font-size: clamp(10px, 2.3vmin, 13px)
  text-align: center
  line-height: 1.1
  text-shadow: 0 2px 0 #141a33
.s-lvl
  max-width: 100%
  white-space: nowrap
  font-family: var(--font-pixel)
  font-size: 7px
  color: #dfe7ff
.note
  padding: 12px
  border-radius: 12px
  background: rgba(0, 0, 0, 0.25)
  color: #cfe0ff
  font-size: clamp(12px, 2.6vmin, 15px)
  text-align: center
  &.ok
    color: #8dff7a
.gift
  display: flex
  align-items: center
  gap: 10px
  margin-top: 8px
  padding: 10px
  border-radius: 14px
  background: rgba(0, 0, 0, 0.25)
  &.ready
    outline: 2px solid #8dff7a
.gift-ico
  flex: 0 0 auto
  width: 44px
  height: 44px
  padding: 8px
  border-radius: 12px
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
.gift-info
  flex: 1
  min-width: 0
.gn
  font-size: clamp(14px, 3vmin, 17px)
.ready .gn
  color: #8dff7a
.gd
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #cfe0ff
.gift-btn
  display: flex
  align-items: center
  gap: 4px
  padding: 8px 12px
  border-radius: 12px
  border: 3px solid #141a33
  background: linear-gradient(#9fe6ff, #3c8cff)
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 11px
  &:disabled
    filter: grayscale(0.8) brightness(0.7)
.bi
  display: inline-block
  width: 16px
  height: 16px
  vertical-align: -3px
.hint
  font-family: var(--font-ui)
  font-size: 0.8em
  color: #9fb8e6
  text-transform: none
  letter-spacing: 0
</style>
