<template lang="pug">
  div.workshop.sheet
    div.scroll
      div.section-title {{ t('workshop.tanks') }}
      div.tank-row
        div.tank-ico
          GameIcon(name="flask")
        div.tank-info
          div.tn {{ t('workshop.tankName') }}
          div.td {{ t('workshop.tankDesc') }}
          div.tc {{ t('workshop.owned', { n: profile.inv.tanks, max: stats.tanksMax }) }}
        button.buy(
          type="button"
          :disabled="profile.bolts < TANK_PRICE || profile.inv.tanks >= stats.tanksMax"
          @click="buyTank"
        )
          GameIcon.bi(name="nut")
          span {{ TANK_PRICE }}
      //- Out of bolts for the next upgrade of the best buster: a rewarded
      //- top-up worth two of its upgrades (Pip's catch-up points here).
      div.tank-row.drop(v-if="canOfferReward && shortForUpgrade" data-lesson="bolts-ad")
        div.tank-ico.drop-ico
          GameIcon(name="anvil")
        div.tank-info
          div.tn {{ t('workshop.upgradeAdName') }}
          div.td {{ t('workshop.upgradeAdDesc') }}
        button.buy.ad(
          type="button"
          :disabled="adInFlight"
          :aria-label="t('workshop.dropAria', { n: upgradeAdAmount })"
          @click="claimUpgradeAd"
        )
          span.ad-chip
            RewardAdIcon.ad-mark
          span +{{ upgradeAdAmount }}
          GameIcon.bi(name="nut")
      div.tank-row.drop(v-if="canOfferReward")
        div.tank-ico.drop-ico
          GameIcon(name="gift")
        div.tank-info
          div.tn {{ t('workshop.dropName') }}
          div.td {{ t('workshop.dropDesc') }}
          div.tc(v-if="dropLeft > 0") {{ t('workshop.dropCooldown', { t: mmss(dropLeft) }) }}
        button.buy.ad(
          type="button"
          :disabled="dropLeft > 0 || adInFlight"
          :aria-label="t('workshop.dropAria', { n: dropAmount })"
          @click="claimDrop"
        )
          //- A film clapper for "+60" and the nut: signed, like every reward.
          //- White on a dark chip, so the mark reads at a glance on the gold.
          span.ad-chip
            RewardAdIcon.ad-mark
          span +{{ dropAmount }}
          GameIcon.bi(name="nut")
      div.section-title {{ t('workshop.upgrade') }}
      div.cols
        div.list
          button.row(
            v-for="it in items"
            :key="it.id"
            type="button"
            :class="{ sel: selId === it.id }"
            :style="{ '--rc': RARITY_COLOR[it.rarity] }"
            :data-lesson="it.id === profile.inv.equipped.chest ? 'armor' : undefined"
            @click="selId = it.id"
          )
            span.r-ico
              GameIcon(:name="SLOT_ICON[it.slot]")
            span.r-name {{ t(`item.${it.base}`) }}
              span.r-upg(v-if="it.upg") &nbsp;+{{ it.upg }}
            span.r-eq(v-if="isEquipped(it.id)") ●
        div.detail-col(v-if="selected")
          ItemDetail(:item="selected")
            //- One block: what the upgrade buys, and the button that buys it
            //- (the upgrade tour lights both).
            div.upg-block(data-lesson="upgrade")
              div.upg-line(v-if="selected.slot !== 'chip'")
                span {{ t('workshop.next') }}
                span.v {{ mainStat(selected) }} → {{ nextMain }}
              button.btn.upgrade(
                type="button"
                :disabled="selected.upg >= MAX_UPG || profile.bolts < upgradeCost(selected)"
                @click="upgrade"
              )
                template(v-if="selected.upg >= MAX_UPG") {{ t('workshop.maxed') }}
                template(v-else)
                  | {{ t('workshop.upgradeBtn') }}
                  GameIcon.bi(name="nut")
                  | {{ upgradeCost(selected) }}
              //- Upgraded something not worn: put it on right here (a playtester
              //- looked for this button and had to go to the Hero tab).
              button.btn.equip(v-if="!isEquipped(selected.id)" type="button" @click="equip") {{ t('gear.equip') }}
              div.eq-tag(v-else) {{ t('gear.equipped') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RewardAdIcon from '@/components/atoms/RewardAdIcon.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import ItemDetail from './ItemDetail.vue'
import { SLOT_ICON } from './gearFormat'
import { profile, saveProfile, computeStats, isEquipped, upgradeItem, itemById, supplyDropBolts, equipItem } from '@/game/state/profile'
import { currentHub } from '@/game/boot'
import { itemPower, mainStat, upgradeCost, MAX_UPG } from '@/game/data/items'
import { RARITY_COLOR } from '@/game/models/palette'
import { sfx } from '@/game/audio/sfx'
import { claimReward, canOfferReward, adInFlight } from '@/use/useAdGate'
import { resumeMusicAfterAd } from '@/use/useSound'
import { workshopSel } from './hubLesson'

/** The Workshop: Repair Tanks, and upgrading gear with bolts (+1 … +10,
 *  +8 % main stat per level). Equipped gear is listed first. */
const { t } = useI18n()
const TANK_PRICE = 150

// ─── Supply drop (rewarded) ──────────────────────────────────────────────────
// Free bolts for a video, scaled by level and paced by a cooldown that lives
// in the save (so a reload does not reset it). Hidden whenever no rewarded ad
// is ready — an offer that then fails reads as a broken game.
const DROP_COOLDOWN_MS = 4 * 60_000
const dropAmount = computed(() => supplyDropBolts())
const now = ref(Date.now())
let clock: number | null = null
onMounted(() => { clock = window.setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (clock !== null) clearInterval(clock) })
const dropLeft = computed(() => Math.max(0, Math.ceil((profile.stats.lastDropAt + DROP_COOLDOWN_MS - now.value) / 1000)))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const claimDrop = async () => {
  if (dropLeft.value > 0) return
  const n = dropAmount.value
  try {
    await claimReward(() => {
      profile.bolts += n
      profile.stats.lastDropAt = Date.now()
      now.value = Date.now()
      saveProfile()
      sfx('loot')
    })
  } finally {
    // The ad hard-stopped the lab music and its play intent; nothing else
    // restarts it until the next mission, so bring it back here.
    resumeMusicAfterAd()
  }
}
/** The best buster the player owns (by power), and what its next upgrade
 *  costs: short of that, the rewarded top-up pays two such upgrades. */
const bestBuster = computed(() => profile.inv.items.filter(it => it.slot === 'buster' && it.upg < MAX_UPG)
  .sort((a, b) => itemPower(b) - itemPower(a))[0] ?? null)
const shortForUpgrade = computed(() => !!bestBuster.value && profile.bolts < upgradeCost(bestBuster.value))
const upgradeAdAmount = computed(() => (bestBuster.value ? upgradeCost(bestBuster.value) * 2 : 0))
const claimUpgradeAd = async () => {
  const n = upgradeAdAmount.value
  if (!n) return
  try {
    await claimReward(() => {
      profile.bolts += n
      saveProfile()
      sfx('loot')
    })
  } finally {
    resumeMusicAfterAd()
  }
}
const stats = computed(() => { void profile.hero.skills; return computeStats() })
const items = computed(() => [...profile.inv.items]
  .sort((a, b) => Number(!!isEquipped(b.id)) - Number(!!isEquipped(a.id)) || itemPower(b) - itemPower(a)))
// Shared with the upgrade tour, which points at rows by what is selected.
// Opening the Workshop selects the buster, as it always has.
const selId = workshopSel
selId.value = profile.inv.equipped.buster
const selected = computed(() => itemById(selId.value))
const nextMain = computed(() => {
  const s = selected.value
  if (!s) return 0
  return mainStat({ ...s, upg: Math.min(MAX_UPG, s.upg + 1) })
})
const equip = () => {
  if (!selected.value) return
  equipItem(selected.value.id)
  currentHub()?.refreshHero()
  sfx('weapon')
}
const buyTank = () => {
  if (profile.bolts < TANK_PRICE || profile.inv.tanks >= stats.value.tanksMax) { sfx('denied'); return }
  profile.bolts -= TANK_PRICE
  profile.inv.tanks++
  saveProfile()
  sfx('tank')
}
const upgrade = () => {
  const s = selected.value
  if (s && upgradeItem(s.id, upgradeCost(s), MAX_UPG)) sfx('levelUp')
  else sfx('denied')
}
</script>

<style scoped lang="sass">
@use './sheet'
.tank-row
  display: flex
  align-items: center
  gap: 10px
  padding: 10px
  border-radius: 14px
  background: rgba(0, 0, 0, 0.25)
.tank-ico
  width: 44px
  height: 44px
  padding: 8px
  border-radius: 12px
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
.drop
  margin-top: 8px
.drop-ico
  background: radial-gradient(circle at 40% 30%, #fff3c8, #ffb84a 45%, #d06a10)
.tank-info
  flex: 1
.tn
  font-size: clamp(14px, 3vmin, 17px)
.td
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #cfe0ff
.tc
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #9fe6ff
.ad-chip
  display: grid
  place-items: center
  padding: 3px 5px
  border-radius: 7px
  background: #141a33
  color: #ffffff
.ad-mark
  width: 1.7em
  height: 1.3em
.buy
  display: flex
  align-items: center
  gap: 4px
  padding: 8px 12px
  border-radius: 12px
  border: 3px solid #141a33
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 11px
  &:disabled
    filter: grayscale(0.8) brightness(0.7)
  &.ad
    background: linear-gradient(#9fe6ff, #3c8cff)
.bi
  display: inline-block
  width: 16px
  height: 16px
  vertical-align: -3px
.cols
  display: flex
  gap: 10px
.list
  flex: 1
  min-width: 0
  display: flex
  flex-direction: column
  gap: 4px
  max-height: 40vh
  overflow-y: auto
.row
  display: flex
  align-items: center
  gap: 8px
  padding: 6px 10px
  border-radius: 10px
  border-left: 4px solid var(--rc)
  background: rgba(0, 0, 0, 0.25)
  color: #fff
  text-align: left
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 14px)
  &.sel
    background: rgba(79, 216, 255, 0.22)
.r-ico
  width: 18px
  height: 18px
  color: var(--rc)
.r-name
  flex: 1
  color: var(--rc)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
.r-upg
  color: #ffd84a
.r-eq
  color: #8dff7a
.detail-col
  flex: 1
  min-width: 0
.upg-block
  display: flex
  flex-direction: column
  gap: 8px
.upg-line
  display: flex
  justify-content: space-between
  font-size: clamp(12px, 2.6vmin, 14px)
  .v
    font-family: var(--font-pixel)
    font-size: 0.75em
    color: #8dff7a
.btn
  padding: 9px 10px
  border-radius: 12px
  border: 3px solid #141a33
  color: #fff
  font-family: var(--font-ui)
  font-size: clamp(13px, 2.8vmin, 16px)
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &:disabled
    filter: grayscale(0.8) brightness(0.7)
.upgrade
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
// The Hero tab's equip button, under the upgrade.
.equip
  background: linear-gradient(#7ff4ff, #1f7fd0)
.eq-tag
  text-align: center
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 14px)
  color: #8dff7a
@media (orientation: portrait)
  .cols
    flex-direction: column
</style>
