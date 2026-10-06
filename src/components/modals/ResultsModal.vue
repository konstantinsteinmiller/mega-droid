<template lang="pug">
  FModal(:model-value="open" :title="r ? (r.success ? t('results.success') : t('results.failed')) : ''" :is-closable="false")
    div.results(v-if="r" :class="{ split: hasExtras }")
      div.col
        div.quest
          div.q-name {{ t(`quest.${r.quest.template}`) }}
          div.q-sector {{ t(`sector.${r.quest.sector}`) }}
        //- Where this lifetime XP places the player among everyone. Renders
        //- nothing at all when there is no honest number to show.
        //- Not after a failed run: "#19 of 19 players" read as a punishment
        //- on top of the defeat (playtest 2026-10-06).
        div.rank(v-if="leaderboardEnabled && r.success")
          RankBadge(:score="lifetime")
        div.rows
          div.row
            span.k {{ t('results.xp') }}
            span.v.xp +{{ fmt(r.xp) }}
          div.row
            span.k {{ t('results.bolts') }}
            span.v.bolts
              | +{{ fmt(boltsShown) }}
              GameIcon.nut(name="nut")
          div.row
            span.k {{ t('results.kills') }}
            span.v {{ r.kills }}
          div.row(v-if="r.chests")
            span.k {{ t('results.chests') }}
            span.v {{ r.chests }}
          div.row
            span.k {{ t('results.time') }}
            span.v {{ mmss(r.seconds) }}
      div.col(v-if="hasExtras")
        div.levelup(v-if="r.levelAfter > r.levelBefore")
          | {{ t('results.levelUp', { n: r.levelAfter }) }}
        div.unlock(v-if="r.weapon")
          span.w-badge(:style="{ '--wc': WEAPONS[r.weapon].color }")
            GameIcon.w-icon(:name="WEAPON_ICON[r.weapon]")
          | {{ t('results.newWeapon', { weapon: t(`weapon.${r.weapon}.name`) }) }}
        div.unlock(v-if="r.unlocked")
          | {{ t('results.newSector', { sector: t(`sector.${r.unlocked}`) }) }}
        div.items(v-if="r.items.length")
          div.i-title {{ t('results.items') }}
          //- Each find with its icon and what it changes against the equipped
          //- piece — a boss's reward is the one to know is an upgrade.
          LootCompare.item(v-for="it in r.items" :key="it.id" :item="it" compact)
    template(#footer)
      div.actions
        //- Poki (`platformPolicy.freeOptionFirst`): the free Continue leads and is
        //- never smaller than the rewarded offer — an invisible copy of the
        //- offer's label sizes it, in every language.
        FButton(v-if="freeFirst" type="primary" icon="forward" :size="pairSize" @click="done")
          span.free-label
            span {{ t('continue') }}
            span.sizer(v-if="offerTriple" aria-hidden="true")
              TripleOffer(:amount="tripleAmount")
        //- The rewarded offer: ×3 bolts. Orange into magenta with a gold
        //- sticker — special, never the green of a plain confirm — and a big
        //- camera badge so "watch a video" reads without the words.
        FButton.offer(
          v-if="offerTriple"
          type="warning"
          color-from="#ff9a2e"
          color-to="#e8327f"
          shadow-color="#5a0f36"
          :size="pairSize"
          :emphasis="freeFirst ? 1 : 1.12"
          :attention="!freeFirst"
          :is-disabled="adInFlight"
          :aria-label="tripleAria"
          @click="triple"
        )
          TripleOffer(:amount="tripleAmount")
        FButton(v-if="!freeFirst" type="primary" icon="forward" :label="t('continue')" @click="done")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, leaveResults } from '@/game/flow'
import { profile, saveProfile, lifetimeXp } from '@/game/state/profile'
import { WEAPONS, WEAPON_ICON } from '@/game/data/weapons'
import { claimReward, canOfferReward, adInFlight } from '@/use/useAdGate'
import { formatCount } from '@/utils/localeNumber'
import RankBadge from '@/components/molecules/RankBadge.vue'
import LootCompare from '@/components/molecules/LootCompare.vue'
import TripleOffer from '@/components/molecules/TripleOffer.vue'
import { leaderboardEnabled } from '@/use/useLeaderboard'
import { platformPolicy } from '@/platforms/capabilities'
import { isShortViewport, windowWidth } from '@/use/useUser'

/** Mission results: what the run earned, what unlocked, then home. */
const { t, locale } = useI18n()
const open = computed(() => flow.modal === 'results')
const r = computed(() => flow.results)
/** The rewarded offer was taken: the run's bolts paid three times over. */
const tripled = ref(false)
const canAd = computed(() => canOfferReward.value)
/** Portal rule (Poki): the free choice before the rewarded one. */
const freeFirst = platformPolicy.freeOptionFirst
/** The ad pays this many times the run's bolts in all (the run's own share
 *  included). Three, not two: a doubling was skipped too often to be worth
 *  the button. */
const OFFER_MUL = 3
const offerTriple = computed(() => !!(r.value && r.value.success && canAd.value && !tripled.value && r.value.bolts > 0))
/** What the offer brings in total, as the button shows it. */
const tripleAmount = computed(() => (r.value ? fmt(r.value.bolts * OFFER_MUL) : ''))
const tripleAria = computed(() => t('results.tripleAria', { n: tripleAmount.value }))
/** Two equal-width buttons need more room than the old pair did. In a tight
 *  landscape (Poki's 640×360 test size) they take the small size so they stay
 *  on one row instead of wrapping and pushing the stats into a scroll. */
const pairSize = computed(() =>
  (freeFirst && offerTriple.value && isShortViewport.value && windowWidth.value < 800 ? 'sm' : undefined))
const boltsShown = computed(() => (r.value ? r.value.bolts * (tripled.value ? OFFER_MUL : 1) : 0))
const hasExtras = computed(() => {
  const x = r.value
  return !!x && (x.levelAfter > x.levelBefore || !!x.weapon || !!x.unlocked || x.items.length > 0)
})
const fmt = (n: number) => formatCount(Math.round(n), locale.value)
/** The leaderboard's score: the same number `finishMission` reported. */
const lifetime = computed(() => (r.value ? lifetimeXp() : 0))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

watch(open, (o) => { if (o) tripled.value = false })
// Enter or Space continues, as a keyboard player expects (nothing focused the
// button, and Space is the slide key whose handler takes the press).
const onKey = (e: KeyboardEvent) => {
  if (!open.value || e.repeat || adInFlight.value) return
  if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return
  e.preventDefault()
  e.stopPropagation()
  done()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))

const triple = async () => {
  const res = r.value
  if (!res) return
  await claimReward(() => {
    // The run already paid its bolts once: the ad adds the other two shares.
    profile.bolts += res.bolts * (OFFER_MUL - 1)
    tripled.value = true
    saveProfile()
  })
}
/** Continue: the interstitial (when one is due), then home. */
const done = () => {
  void leaveResults()
}
</script>

<style scoped lang="sass">
.results
  color: #fff
  font-family: var(--font-ui)
  display: flex
  flex-direction: column
  gap: 10px
  min-width: min(78vw, 360px)
.col
  display: flex
  flex-direction: column
  gap: 10px
// Short landscape (phones on their side, ~764×385 portal embeds): the stats
// and the rewards sit side by side so nothing hides below the fold.
@media (max-height: 520px) and (min-aspect-ratio: 4/3)
  .results.split
    display: grid
    grid-template-columns: 1fr 1fr
    align-items: center
    gap: 16px
    min-width: min(86vw, 640px)
.quest
  text-align: center
.q-name
  font-size: clamp(17px, 3.6vmin, 22px)
.q-sector
  font-size: clamp(11px, 2.4vmin, 14px)
  color: #9fe6ff
.rank
  display: flex
  justify-content: center
  &:empty
    display: none
.rows
  display: flex
  flex-direction: column
  gap: 4px
  padding: 8px 12px
  border-radius: 10px
  background: rgba(0, 0, 0, 0.25)
.row
  display: flex
  justify-content: space-between
  font-size: clamp(13px, 2.8vmin, 16px)
.k
  color: #cfe0ff
.v
  font-family: var(--font-pixel)
  font-size: 0.8em
  &.xp
    color: #9dff5a
  &.bolts
    display: inline-flex
    align-items: center
    gap: 4px
    color: #ffd84a
// The value's pixel font runs at 0.8em: the glyph matches the label's size.
// Nested, so it outranks GameIcon's own 100% sizing on specificity.
.bolts .nut
  width: 1.4em
  height: 1.4em
.levelup
  text-align: center
  color: #ffd84a
  font-size: clamp(15px, 3.2vmin, 19px)
  animation: lvl-pulse 0.9s ease-in-out infinite
.unlock
  display: flex
  align-items: center
  justify-content: center
  gap: 8px
  color: #7ff4ff
  font-size: clamp(13px, 2.8vmin, 16px)
// The won weapon's own mark in its colour, popping in: the player sees
// WHAT they got (a flame, a snowflake) before reading its name.
.w-badge
  --wc: #fff
  flex: none
  display: grid
  place-items: center
  width: clamp(34px, 7vmin, 46px)
  height: clamp(34px, 7vmin, 46px)
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 35% 30%, #ffffff 0%, var(--wc) 45%, color-mix(in srgb, var(--wc) 55%, #141a33) 100%)
  box-shadow: 0 0 14px color-mix(in srgb, var(--wc) 70%, transparent), inset 0 -3px 0 rgba(0, 0, 0, 0.25)
  animation: w-pop 0.55s cubic-bezier(0.3, 1.6, 0.5, 1) 0.2s both, w-glow 1.6s ease-in-out 0.8s infinite
.w-badge .w-icon
  width: 62%
  height: 62%
  color: #141a33
@keyframes w-pop
  0%
    transform: scale(0) rotate(-40deg)
  100%
    transform: scale(1) rotate(0)
@keyframes w-glow
  0%, 100%
    box-shadow: 0 0 10px color-mix(in srgb, var(--wc) 60%, transparent), inset 0 -3px 0 rgba(0, 0, 0, 0.25)
  50%
    box-shadow: 0 0 22px var(--wc), inset 0 -3px 0 rgba(0, 0, 0, 0.25)
@media (prefers-reduced-motion: reduce)
  .w-badge
    animation: none
.items .item
  margin-top: 8px
.items
  display: flex
  flex-direction: column
  gap: 4px
.i-title
  font-size: clamp(11px, 2.4vmin, 14px)
  color: #ffd84a
  text-transform: uppercase
.actions
  display: flex
  flex-wrap: wrap
  gap: 10px
  justify-content: center
// Poki: the free button's label shares one grid cell with an invisible copy of
// the rewarded label, so the free button is at least as wide as the offer.
.free-label
  display: inline-grid
  justify-items: center
  > *
    grid-area: 1 / 1
.sizer
  visibility: hidden
@keyframes lvl-pulse
  50%
    transform: scale(1.06)
</style>
