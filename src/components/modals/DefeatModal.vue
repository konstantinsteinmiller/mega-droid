<template lang="pug">
  FModal(:model-value="open" :title="t('defeat.title')" :is-closable="false")
    div.defeat
      p.lead {{ t('defeat.body') }}
      p.free(v-if="freeReboot") {{ t('defeat.freeRebootNote') }}
      //- What is kept, as the same signed chips the job board promises.
      div.keep
        span {{ t('defeat.kept') }}
        span.chips
          span.chip.xp {{ t('combat.xp', { n: tally.xp }) }}
          span.chip.bolt
            | +{{ tally.bolts }}
            GameIcon.mini(name="nut")
      //- Nothing chosen: he sinks and comes back at the checkpoint (#105).
      div.respawn(role="timer")
        span {{ t('defeat.respawnIn', { n: Math.ceil(respawnLeft) }) }}
        span.bar(aria-hidden="true")
          span.fill(:style="{ width: (100 * respawnLeft / RESPAWN_WAIT) + '%' }")
    template(#footer)
      div.actions
        //- Down in the first boss fight: one free reboot on the spot, no ad.
        FButton(
          v-if="freeReboot"
          type="primary"
          icon="replay"
          :label="t('defeat.freeReboot')"
          @click="rebootFree"
        )
        //- The Fortress: back to the last checkpoint, free, at full health.
        FButton(
          v-if="canRetry"
          type="success"
          icon="replay"
          :label="t('defeat.retryCheckpoint')"
          @click="retryCheckpoint"
        )
        FButton(
          v-if="hud.tanks > 0"
          type="success"
          icon="flask"
          :label="t('defeat.useTank', { n: hud.tanks })"
          @click="useTank"
        )
        //- Poki (`platformPolicy.freeOptionFirst`): the free Retreat comes before
        //- the rewarded Reboot and is never smaller — an invisible copy of the
        //- offer's label sizes it.
        FButton(v-if="freeFirst" type="danger" icon="back" @click="retreat")
          span.free-label
            span {{ t('defeat.retreat') }}
            span.sizer(v-if="offerReboot" aria-hidden="true") {{ t('defeat.rebootAd') }}
        FButton(
          v-if="offerReboot"
          type="primary"
          icon="video"
          :is-disabled="adInFlight"
          :label="t('defeat.rebootAd')"
          @click="rebootAd"
        )
        FButton(v-if="!freeFirst" type="danger" icon="back" :label="t('defeat.retreat')" @click="retreat")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow } from '@/game/flow'
import { hud } from '@/game/state/hud'
import { currentMission } from '@/game/boot'
import { profile, saveProfile } from '@/game/state/profile'
import { claimReward, canOfferReward, adInFlight } from '@/use/useAdGate'
import { resumeMusicAfterAd } from '@/use/useSound'
import { platformPolicy } from '@/platforms/capabilities'
import { RESPAWN_AFTER, DEFEAT_DELAY } from '@/game/sim/respawn'

/**
 * "System down" — Blades' defeat choice, casual-friendly: reboot on the spot
 * with a Repair Tank, or with a rewarded ad (once per mission), or retreat and
 * keep everything earned so far.
 */
const { t } = useI18n()
const open = computed(() => flow.modal === 'defeat')
const revivedByAd = ref(false)
// Once per MISSION, not per session: this modal lives as long as the scene.
watch(() => flow.quest, () => { revivedByAd.value = false })
const canAd = computed(() => canOfferReward.value)
/** Portal rule (Poki): the free choice before the rewarded one. */
const freeFirst = platformPolicy.freeOptionFirst
/** The first boss's free reboot (read when the modal opens). */
const freeReboot = computed(() => open.value && !!currentMission()?.freeBossReboot)
const offerReboot = computed(() => canAd.value && !revivedByAd.value && !freeReboot.value)
const rebootFree = () => { currentMission()?.rebootFree() }
const tally = computed(() => {
  const m = currentMission()
  return { xp: m?.xp ?? 0, bolts: m?.bolts ?? 0 }
})

// Read when the modal opens (the mission is not reactive).
const canRetry = computed(() => open.value && !!currentMission()?.canRetryCheckpoint)
const retryCheckpoint = () => {
  currentMission()?.retryFromCheckpoint()
}

const useTank = () => {
  if (profile.inv.tanks <= 0) return
  profile.inv.tanks--
  saveProfile()
  currentMission()?.revive()
}
const rebootAd = async () => {
  try {
    await claimReward(() => {
      revivedByAd.value = true
      currentMission()?.revive()
    })
  } finally {
    // The ad hard-stopped the music AND its play intent (so nothing could
    // sound under it). A revive puts the player straight back into the live
    // mission, so bring the track back — on a no-fill or a throw too.
    resumeMusicAfterAd()
  }
}
const retreat = () => {
  flow.modal = ''
  currentMission()?.retreat()
}

// ─── The countdown to the respawn (#105) ─────────────────────────────────────
// RESPAWN_AFTER from the fall; the modal opens DEFEAT_DELAY into it. Real
// time (the world is frozen under the modal), held while an ad plays.
const RESPAWN_WAIT = Math.max(1, RESPAWN_AFTER - DEFEAT_DELAY)
const respawnLeft = ref(RESPAWN_WAIT)
let timer: number | null = null
let last = 0
const stopTimer = () => { if (timer !== null) { clearInterval(timer); timer = null } }
watch(open, (on) => {
  stopTimer()
  if (!on) return
  respawnLeft.value = RESPAWN_WAIT
  last = performance.now()
  timer = window.setInterval(() => {
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    if (adInFlight.value || document.hidden) return
    respawnLeft.value = Math.max(0, respawnLeft.value - dt)
    if (respawnLeft.value <= 0) {
      stopTimer()
      currentMission()?.respawnAtCheckpoint()
    }
  }, 100)
}, { immediate: true })
onUnmounted(stopTimer)
</script>

<style scoped lang="sass">
.respawn
  margin-top: 12px
  display: flex
  flex-direction: column
  align-items: center
  gap: 6px
  font-size: clamp(12px, 2.6vmin, 15px)
  color: #9fd6ff
.bar
  width: min(70%, 260px)
  height: 6px
  border-radius: 3px
  background: rgba(159, 214, 255, 0.2)
  overflow: hidden
.fill
  display: block
  height: 100%
  background: #9fd6ff
  transition: width 0.1s linear
.defeat
  text-align: center
  color: #fff
  font-family: var(--font-ui)
.lead
  font-size: clamp(14px, 3vmin, 18px)
.free
  margin-top: 8px
  color: #ffd84a
  font-weight: 700
  font-size: clamp(13px, 2.8vmin, 16px)
  margin: 0 0 10px
.keep
  display: flex
  flex-direction: column
  align-items: center
  gap: 6px
  font-size: clamp(12px, 2.6vmin, 15px)
  color: #9fe6ff
.chips
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 6px
.chip
  display: inline-flex
  align-items: center
  gap: 3px
  padding: 2px 9px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.3)
  &.xp
    color: #9dff5a
  &.bolt
    color: #ffd84a
  // Nested, so it outranks GameIcon's own 100% sizing on specificity.
  .mini
    width: 1.1em
    height: 1.1em
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
</style>
