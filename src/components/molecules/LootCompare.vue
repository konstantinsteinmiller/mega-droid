<template lang="pug">
  div.loot(:class="{ compact, up: cmp.upgrade }" :style="{ '--rc': RARITY_COLOR[item.rarity] }")
    span.l-ico
      GameIcon(:name="SLOT_ICON[item.slot]")
    div.l-body
      div.l-head
        span.l-name {{ t(`item.${item.base}`) }}
        span.l-badge(v-if="cmp.upgrade")
          GameIcon(name="up")
          | {{ t('loot.upgrade') }}
      div.l-sub
        span.l-rar {{ t(`rarity.${item.rarity}`) }}
        span.l-lvl {{ t('enemy.level', { n: item.ilvl }) }}
      ul.l-deltas(v-if="shown.length")
        li(v-for="l in shown" :key="l.key" :class="l.delta > 0 ? 'plus' : 'minus'") {{ formatStatDelta(t, l.key, l.delta, locale) }}
        li.more(v-if="hidden > 0") +{{ hidden }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { RARITY_COLOR } from '@/game/models/palette'
import { equipped } from '@/game/state/profile'
import { compareItems, rivalFor } from '@/game/data/itemCompare'
import type { Item } from '@/game/data/items'
import { SLOT_ICON, formatStatDelta } from '@/components/hub/gearFormat'

/**
 * A found item at a glance: its slot's icon in its rarity's colour, its name,
 * and what it would change against the piece it would replace (`itemCompare`)
 * — green for more, red for less — with an "Upgrade!" badge when it is better
 * overall. The in-mission loot card and the results screen both show it.
 */
const props = defineProps<{ item: Item; compact?: boolean }>()
const { t, locale } = useI18n()
const cmp = computed(() => compareItems(props.item, rivalFor(props.item, equipped)))
/** Lines shown; the rest count as "+n" (the workshop has them all). */
const cap = computed(() => (props.compact ? 3 : 4))
const shown = computed(() => cmp.value.lines.slice(0, cap.value))
const hidden = computed(() => Math.max(0, cmp.value.lines.length - cap.value))
</script>

<style scoped lang="sass">
.loot
  display: flex
  align-items: flex-start
  gap: clamp(8px, 2vmin, 12px)
  min-width: 0
.l-ico
  flex: none
  width: clamp(48px, 11vmin, 64px)
  height: clamp(48px, 11vmin, 64px)
  padding: 10px
  box-sizing: border-box
  border-radius: 14px
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #ffffff, var(--rc) 70%)
  box-shadow: 0 0 16px var(--rc)
  color: #141a33
  :deep(.game-icon)
    width: 100%
    height: 100%
.compact .l-ico
  width: clamp(36px, 8vmin, 46px)
  height: clamp(36px, 8vmin, 46px)
  padding: 7px
  border-radius: 11px
  box-shadow: none
.l-body
  display: flex
  flex-direction: column
  gap: 2px
  min-width: 0
.l-head
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 6px
.l-name
  font-size: clamp(15px, 3.4vmin, 20px)
  color: var(--rc)
  text-shadow: 0 2px 0 #141a33
  line-height: 1.1
.compact .l-name
  font-size: clamp(13px, 2.8vmin, 16px)
.l-badge
  display: inline-flex
  align-items: center
  gap: 3px
  padding: 2px 8px 2px 4px
  border-radius: 999px
  border: 2px solid #141a33
  background: linear-gradient(#b8ff9a, #3fcf5a)
  color: #0e2a14
  font-size: clamp(11px, 2.3vmin, 13px)
  font-weight: 700
  white-space: nowrap
  :deep(.game-icon)
    width: 1.1em
    height: 1.1em
.l-sub
  display: flex
  gap: 8px
  font-size: clamp(11px, 2.3vmin, 13px)
  color: #cfe0ff
.l-rar
  color: var(--rc)
.l-deltas
  display: flex
  flex-wrap: wrap
  gap: 4px
  margin: 4px 0 0
  padding: 0
  list-style: none
  li
    padding: 1px 7px
    border-radius: 8px
    font-size: clamp(11px, 2.3vmin, 13px)
    line-height: 1.5
    background: rgba(0, 0, 0, 0.35)
    white-space: nowrap
  .plus
    color: #8dff7a
  .minus
    color: #ff8a8a
  .more
    color: #cfe0ff
</style>
