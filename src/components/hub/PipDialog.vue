<template lang="pug">
  //- Pip's supplies (#173): the lab's rewarded offers, handed out by Pip in
  //- his own dialog — a video for bolts, a video for a Repair Gel on the next
  //- mission (`pipSupplies.ts` for the rules). Opened from the "!" over him.
  FModal(:model-value="hubDialog.open" :title="t('hub.pip.title')" @update:model-value="(v) => !v && close()")
    div.pip
      div.say {{ t('hub.pip.hello') }}
      //- Bolts: the upgrade top-up, or the supply drop (never both).
      div.row(v-if="sup.adOffer.value === 'upgrade'" data-pip="bolts")
        div.ico.drop
          GameIcon(name="anvil")
        div.info
          div.n {{ t('workshop.upgradeAdName') }}
          div.d {{ t('workshop.upgradeAdDesc') }}
        button.claim(
          type="button"
          :disabled="sup.adInFlight.value"
          :aria-label="t('workshop.dropAria', { n: sup.upgradeAdAmount.value })"
          @click="sup.claimUpgradeAd"
        )
          RewardAdBadge
          span +{{ sup.upgradeAdAmount.value }}
          GameIcon.bi(name="nut")
      div.row(v-else-if="sup.adOffer.value === 'drop'" data-pip="bolts")
        div.ico.drop
          GameIcon(name="gift")
        div.info
          div.n {{ t('workshop.dropName') }}
          div.d {{ t('workshop.dropDesc') }}
          div.c(v-if="sup.dropLeft.value > 0") {{ t('workshop.dropCooldown', { t: mmss(sup.dropLeft.value) }) }}
        button.claim(
          type="button"
          :disabled="sup.dropLeft.value > 0 || sup.adInFlight.value"
          :aria-label="t('workshop.dropAria', { n: sup.dropAmount.value })"
          @click="sup.claimDrop"
        )
          RewardAdBadge
          span +{{ sup.dropAmount.value }}
          GameIcon.bi(name="nut")
      //- Gel for the road.
      div.row.ready(v-if="sup.giftReady.value" data-pip="gel-ready")
        div.ico.gel
          GameIcon(name="flask")
        div.info
          div.n.ok {{ t('hub.gift.ready') }}
          div.d {{ t('hub.gift.readyDesc') }}
      div.row(v-else-if="sup.giftOffer.value" data-pip="gel")
        div.ico.gel
          GameIcon(name="flask")
        div.info
          div.n {{ t('hub.gift.name') }}
          div.d {{ t('hub.gift.desc') }}
        button.claim(
          type="button"
          :disabled="sup.adInFlight.value"
          :aria-label="t('hub.gift.aria')"
          @click="sup.claimGift"
        )
          RewardAdBadge
          span +1
          GameIcon.bi(name="flask")
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import RewardAdBadge from '@/components/atoms/RewardAdBadge.vue'
import { hubDialog } from '@/game/state/hubUi'
import { sfx } from '@/game/audio/sfx'
import { usePipSupplies, mmss } from './pipSupplies'

const { t } = useI18n()
const sup = usePipSupplies()
const close = (): void => {
  if (!hubDialog.open) return
  hubDialog.open = false
  sfx('uiClose')
}
</script>

<style scoped lang="sass">
.pip
  display: flex
  flex-direction: column
  gap: 10px
  min-width: min(440px, 80vw)
  color: #fff
  font-family: var(--font-ui)
.say
  padding: 0.55em 0.9em
  border-radius: 1em
  border: 3px solid #4a1f86
  background: #ffffff
  color: #141a33
  font-size: clamp(13px, 2.8vmin, 16px)
  box-shadow: 0 0 0 3px #b46cff
.row
  display: flex
  align-items: center
  gap: 10px
  padding: 10px
  border-radius: 14px
  background: rgba(0, 0, 0, 0.25)
  &.ready
    outline: 2px solid #8dff7a
.ico
  flex: none
  width: 44px
  height: 44px
  padding: 8px
  border-radius: 12px
  border: 2px solid #141a33
  &.gel
    background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
  &.drop
    background: radial-gradient(circle at 40% 30%, #fff3c8, #ffb84a 45%, #d06a10)
.info
  flex: 1
  min-width: 0
.n
  font-size: clamp(14px, 3vmin, 17px)
  &.ok
    color: #8dff7a
.d
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #cfe0ff
.c
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #9fe6ff
.claim
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
  cursor: pointer
  &:disabled
    filter: grayscale(0.8) brightness(0.7)
.bi
  display: inline-block
  width: 16px
  height: 16px
  vertical-align: -3px
</style>
