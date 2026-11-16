<template lang="pug">
  div.detail(:style="{ '--rc': RARITY_COLOR[item.rarity] }")
    div.d-head
      span.d-ico
        GameIcon(:name="SLOT_ICON[item.slot]")
      div.d-title
        div.d-name {{ t(`item.${item.base}`) }}
          span.upg(v-if="item.upg > 0") &nbsp;+{{ item.upg }}
        div.d-sub
          span.rar {{ t(`rarity.${item.rarity}`) }}
          span · {{ t(`slot.${item.slot}`) }} · {{ t('enemy.level', { n: item.ilvl }) }}
    div.d-main(v-if="item.slot !== 'chip'")
      span.k {{ item.slot === 'buster' ? t('gear.damage') : t('gear.armor') }}
      span.v {{ mainStat(item) }}
      span.delta(v-if="compare && delta !== 0" :class="delta > 0 ? 'up' : 'down'") {{ delta > 0 ? '▲' : '▼' }}{{ Math.abs(delta) }}
    ul.affixes
      li.implicit(v-if="base?.implicit") {{ affixText(base.implicit) }}
      li(v-for="(a, i) in item.affixes" :key="i") {{ affixText(a) }}
      li.none(v-if="!base?.implicit && !item.affixes.length") {{ t('gear.noAffixes') }}
    //- What switching to this piece would change, every stat, gains first (#197).
    div.vs(v-if="chips.length") {{ t('loot.vsEquipped') }}
    ul.deltas(v-if="chips.length")
      li(v-for="l in chips" :key="l.key")
        span.chip(:class="l.delta > 0 ? 'plus' : 'minus'") {{ formatStatDelta(t, l.key, l.delta, locale) }}
    slot
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { BASE_BY_ID, mainStat, type Item, type Affix } from '@/game/data/items'
import { RARITY_COLOR } from '@/game/models/palette'
import { compareItems } from '@/game/data/itemCompare'
import { SLOT_ICON, formatAffix, formatStatDelta } from './gearFormat'

/** An item card: name in rarity colour, main stat (with ▲/▼ vs. the equipped
 *  piece), implicit + rolled affixes, and a slot for action buttons. */
const props = defineProps<{ item: Item; compare?: Item | null }>()
const { t, locale } = useI18n()
const base = computed(() => BASE_BY_ID[props.item.base])
const delta = computed(() => (props.compare ? mainStat(props.item) - mainStat(props.compare) : 0))
/** Every stat the swap changes: the gains first, then the losses. */
const chips = computed(() => {
  if (!props.compare) return []
  const lines = compareItems(props.item, props.compare).lines
  return [...lines.filter(l => l.delta > 0), ...lines.filter(l => l.delta < 0)]
})
const affixText = (a: Affix) => formatAffix(t, a, locale.value)
</script>

<style scoped lang="sass">
.detail
  display: flex
  flex-direction: column
  gap: 8px
  padding: 10px
  border-radius: 14px
  border: 2px solid var(--rc)
  background: rgba(0, 0, 0, 0.28)
.d-head
  display: flex
  gap: 10px
  align-items: center
// A one-word name too long for its line ("Standardkanone") breaks itself, and
// never squeezes the icon.
.d-ico
  flex: none
  width: 44px
  height: 44px
  padding: 8px
  border-radius: 12px
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #fff, var(--rc) 70%)
  color: #141a33
.d-title
  min-width: 0
.d-name
  hyphens: auto
  overflow-wrap: anywhere
  font-size: clamp(15px, 3.2vmin, 19px)
  color: var(--rc)
  text-shadow: 0 2px 0 #141a33
.upg
  color: #ffd84a
.d-sub
  font-size: clamp(11px, 2.4vmin, 13px)
  color: #cfe0ff
.rar
  color: var(--rc)
.d-main
  display: flex
  align-items: baseline
  gap: 8px
  font-size: clamp(13px, 2.8vmin, 16px)
  .v
    font-family: var(--font-pixel)
    font-size: 0.85em
  .delta
    font-family: var(--font-pixel)
    font-size: 0.7em
    &.up
      color: #8dff7a
    &.down
      color: #ff7a7a
.vs
  font-size: clamp(10px, 2.1vmin, 12px)
  color: #9fb3d8
  text-transform: uppercase
  letter-spacing: 0.04em
.deltas
  display: flex
  flex-wrap: wrap
  gap: 4px
  margin: 0
  padding: 0
  list-style: none
  .chip
    display: inline-block
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
.affixes
  margin: 0
  padding-left: 16px
  font-size: clamp(12px, 2.6vmin, 14px)
  color: #9fe6ff
  line-height: 1.4
  .implicit
    color: #ffd84a
  .none
    color: #7f8ba3
    list-style: none
    margin-left: -16px
// A phone on its side: the card shares half a narrow column. Its icon goes
// (the selected slot or row beside it wears the same glyph) and the name has
// the whole line.
@media (orientation: landscape) and (max-height: 540px)
  .detail
    gap: 6px
    padding: 8px
  .d-ico
    display: none
</style>
