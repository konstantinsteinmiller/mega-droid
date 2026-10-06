<template lang="pug">
  Transition(name="loot")
    div.loot-card(
      v-if="current && hud.phase === 'play'"
      :key="current.id"
      :class="{ up: upgrade }"
      :style="{ '--rc': RARITY_COLOR[current.rarity] }"
      role="status"
      :aria-label="t('loot.found', { rarity: t(`rarity.${current.rarity}`), item: t(`item.${current.base}`) })"
      @pointerdown.stop="next"
    )
      span.lc-new {{ t('gear.new') }}
      LootCompare(:item="current")
      //- An upgrade goes on as the card leaves: "Upgrade!" and then nothing
      //- happened, playtesters found the old piece still worn (2026-10-06).
      span.lc-equip(v-if="upgrade") {{ t('loot.autoEquip') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, hud } from '@/game/state/hud'
import { lootQueue } from '@/game/state/screenFx'
import { equipped, equipItem, saveProfile } from '@/game/state/profile'
import { compareItems, rivalFor } from '@/game/data/itemCompare'
import { RARITY_COLOR } from '@/game/models/palette'
import LootCompare from '@/components/molecules/LootCompare.vue'

/**
 * An item found in a mission, where it cannot be missed: a card high in the
 * middle of the view with the item's icon, name and what it changes against
 * the equipped piece, for `SHOW_S` seconds of play (a tap sends it off
 * early). It used to be one line in the toast stack, gone in under three
 * seconds — mid-fight, nobody read it.
 *
 * One card at a time from `lootQueue`; the clock is the HUD ticker's, so a
 * pause, a modal or an ad holds the card rather than spending it unseen.
 */
const SHOW_S = 4.5

const { t } = useI18n()
const current = computed(() => lootQueue[0] ?? null)
const upgrade = computed(() => (current.value ? compareItems(current.value, rivalFor(current.value, equipped)).upgrade : false))
let left = SHOW_S
const next = (): void => {
  const it = lootQueue[0]
  if (it && upgrade.value) {
    equipItem(it.id)
    saveProfile()
  }
  lootQueue.shift()
  left = SHOW_S
}
let off: (() => void) | null = null
onMounted(() => {
  off = addHudTicker((dt) => {
    if (!lootQueue.length || hud.phase !== 'play') return
    left -= dt
    if (left <= 0) next()
  })
})
onUnmounted(() => {
  off?.()
  // Nothing carries over into the next mission: the results list them all.
  lootQueue.splice(0)
})
</script>

<style scoped lang="sass">
.loot-card
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(52px, 12vh, 96px))
  transform: translateX(-50%)
  max-width: min(92vw, 380px)
  padding: clamp(10px, 2.2vmin, 14px) clamp(12px, 2.8vmin, 18px)
  border-radius: 18px
  border: 3px solid var(--rc)
  background: linear-gradient(rgba(20, 30, 70, 0.92), rgba(11, 20, 51, 0.92))
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.35), 0 0 24px color-mix(in srgb, var(--rc) 60%, transparent)
  pointer-events: auto
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  &.up
    animation: lc-glow 1.2s ease-in-out infinite
.lc-equip
  display: block
  margin-top: 4px
  text-align: right
  font-family: var(--font-ui)
  font-size: clamp(11px, 2.2vmin, 13px)
  color: #8dff7a
.lc-new
  position: absolute
  top: -11px
  left: 14px
  padding: 1px 8px
  border-radius: 8px
  border: 2px solid #141a33
  background: #ffd84a
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 9px
  line-height: 16px
.loot-enter-active
  animation: lc-in 0.45s cubic-bezier(0.2, 1.6, 0.4, 1)
.loot-leave-active
  transition: opacity 0.25s, transform 0.25s
.loot-leave-to
  opacity: 0
  transform: translate(-50%, -16px)
@keyframes lc-in
  from
    opacity: 0
    transform: translate(-50%, -24px) scale(0.7)
  to
    opacity: 1
    transform: translate(-50%, 0) scale(1)
@keyframes lc-glow
  50%
    box-shadow: 0 6px 0 rgba(0, 0, 0, 0.35), 0 0 36px var(--rc)
@media (prefers-reduced-motion: reduce)
  .loot-card.up, .loot-enter-active
    animation: none
</style>
