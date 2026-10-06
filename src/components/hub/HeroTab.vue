<template lang="pug">
  div.hero.sheet
    div.scroll
      //- The name plate: whose panel this is. His name is also a plain word
      //- ("flux"), so it wears his face and says what he is under it.
      div.plate
        span.p-face
          GameIcon.fi(name="android")
        div.p-id
          div.p-name {{ t('hub.tab.hero') }}
          div.p-role {{ t('hero.role') }}
      button.attr-cta(v-if="profile.hero.pendingAttrs > 0" type="button" @click="flow.modal = 'levelUp'")
        | {{ t('hero.attrPending', { n: profile.hero.pendingAttrs }) }}
      div.section-title {{ t('hero.weapons') }}
      div.wslots
        button.wslot(
          v-for="i in [0, 1]"
          :key="i"
          type="button"
          :class="{ on: wSlot === i }"
          :style="profile.hero.slots[i] ? { '--wc': WEAPONS[profile.hero.slots[i]].color } : {}"
          @click="wSlot = i"
        )
          span.ws-orb
          span.ws-name {{ profile.hero.slots[i] ? t(`weapon.${profile.hero.slots[i]}.name`) : t('hero.weaponSlot', { n: i + 1 }) }}
      div.wlist(v-if="profile.hero.weapons.length")
        button.wrow(
          v-for="w in profile.hero.weapons"
          :key="w"
          type="button"
          :style="{ '--wc': WEAPONS[w].color }"
          :class="{ eq: profile.hero.slots.includes(w) }"
          @click="assign(w)"
        )
          span.ws-orb
          span.wr-name {{ t(`weapon.${w}.name`) }}
          span.wr-rank {{ t('hero.weaponRank', { n: weaponRank(profile.hero.weaponXp[w] ?? 0, WEAPONS[w]) }) }}
          span.wr-desc {{ t(`weapon.${w}.desc`) }}
      div.empty-note(v-else) {{ t('hero.noWeapons') }}
      div.slots
        button.slot(
          v-for="s in EQUIP_SLOTS"
          :key="s"
          type="button"
          :class="{ on: slot === s, empty: !equipped(s) }"
          :style="equipped(s) ? { '--rc': RARITY_COLOR[equipped(s)?.rarity ?? 'standard'] } : {}"
          @click="pickSlot(s)"
        )
          span.s-ico
            GameIcon(:name="SLOT_ICON[s]")
          span.s-lvl(v-if="equipped(s)") {{ equipped(s)?.ilvl }}
          span.s-new(v-if="freshIn(s)") !
      div.cols
        div.list
          div.section-title {{ t(`slot.${slotKind(slot)}`) }}
          button.row(
            v-for="it in items"
            :key="it.id"
            type="button"
            :class="{ sel: selId === it.id, eq: isEquipped(it.id) }"
            :style="{ '--rc': RARITY_COLOR[it.rarity] }"
            @click="select(it.id)"
          )
            span.r-name {{ t(`item.${it.base}`) }}
              span.r-upg(v-if="it.upg") &nbsp;+{{ it.upg }}
            span.r-meta {{ t('enemy.level', { n: it.ilvl }) }}
            //- Better than the piece worn: two "Scout Helmet Lv. 1" rows looked
            //- the same until one was opened (playtest 2026-10-06).
            span.r-better(v-if="!isEquipped(it.id) && better(it)" :title="t('loot.upgrade')")
              GameIcon(name="up")
            span.r-tag(v-if="isEquipped(it.id)") {{ t('gear.equipped') }}
            span.r-new(v-else-if="profile.inv.fresh.includes(it.id)") {{ t('gear.new') }}
          div.empty-note(v-if="!items.length") {{ t('gear.emptySlot') }}
        div.detail-col(v-if="selected")
          ItemDetail(:item="selected" :compare="compareTo")
            div.actions
              button.btn.equip(v-if="!isEquipped(selected.id)" type="button" @click="equip") {{ t('gear.equip') }}
              button.btn.unequip(v-else-if="selected.slot === 'chip'" type="button" @click="unequip") {{ t('gear.unequip') }}
              //- What salvaging pays, signed and wearing the nut like every
              //- Bolts reward.
              button.btn.salvage(v-if="!isEquipped(selected.id)" type="button" @click="salvaging = true")
                span {{ t('gear.salvage') }}
                span.gain
                  | +{{ salvageValue(selected) }}
                  GameIcon.bi(name="nut")
      div.section-title {{ t('hero.stats') }}
      div.stats
        div.stat(v-for="s in statRows" :key="s.k")
          span.k {{ t(s.k) }}
          span.v {{ s.v }}
      div.section-title {{ t('hero.attributes') }}
      div.attrs
        div.attr(v-for="a in ATTRS" :key="a" :class="a")
          GameIcon.ai(:name="ATTR_ICON[a]")
          span.an {{ t(`attr.${a}.name`) }}
          span.av {{ profile.hero.attrs[a] }}
    ConfirmDialog(
      v-if="salvaging && selected"
      :title="t('gear.salvageAsk')"
      :confirm-label="t('gear.salvage')"
      danger
      @confirm="salvage"
      @cancel="salvaging = false"
    ) {{ t('gear.salvageBody', { item: t(`item.${selected.base}`), n: salvageValue(selected) }) }}
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import ItemDetail from './ItemDetail.vue'
import { SLOT_ICON } from './gearFormat'
import { compareItems, rivalFor } from '@/game/data/itemCompare'
import type { Item } from '@/game/data/items'
import {
  profile, computeStats, armorTotal, equipped, isEquipped, equipItem, unequipChip, salvageItem, markSeen, itemById
} from '@/game/state/profile'
import { ATTR_ICON, type Attr } from '@/game/data/progression'
import { EQUIP_SLOTS, itemPower, salvageValue, type EquipSlot, type Slot } from '@/game/data/items'
import ConfirmDialog from '@/components/atoms/ConfirmDialog.vue'
import { RARITY_COLOR } from '@/game/models/palette'
import { flow } from '@/game/flow'
import { currentHub } from '@/game/boot'
import { sfx } from '@/game/audio/sfx'
import { saveProfile } from '@/game/state/profile'
import { WEAPONS, weaponRank, type WeaponId } from '@/game/data/weapons'

/**
 * Flux's gear and stats, under his name plate. Six sockets across the top
 * (buster, helmet, chest, boots, two chips); tap one to list what fits it, tap
 * an item to compare it with what is equipped, then Equip or Salvage.
 * Equipping repaints Flux in the lab behind the menu.
 */
const { t } = useI18n()
const ATTRS: Attr[] = ['hp', 'we', 'power']
const slot = ref<EquipSlot>('buster')
const selId = ref<string | null>(profile.inv.equipped.buster)
const slotKind = (s: EquipSlot): Slot => (s === 'chip1' || s === 'chip2' ? 'chip' : s)
const items = computed(() => profile.inv.items
  .filter(i => i.slot === slotKind(slot.value))
  .sort((a, b) => Number(!!isEquipped(b.id)) - Number(!!isEquipped(a.id)) || itemPower(b) - itemPower(a)))
const selected = computed(() => itemById(selId.value))
const compareTo = computed(() => {
  const s = selected.value
  if (!s || isEquipped(s.id)) return null
  return equipped(s.slot === 'chip' ? 'chip1' : s.slot as EquipSlot)
})
const freshIn = (s: EquipSlot) => profile.inv.items.some(i => i.slot === slotKind(s) && profile.inv.fresh.includes(i.id))

const pickSlot = (s: EquipSlot) => {
  slot.value = s
  selId.value = profile.inv.equipped[s] ?? items.value[0]?.id ?? null
  sfx('uiClick')
}
/** Better overall than the piece it would replace (the loot card's own test). */
const better = (it: Item): boolean => compareItems(it, rivalFor(it, equipped)).upgrade

const select = (id: string) => {
  selId.value = id
  markSeen(id)
  sfx('uiClick')
  // Its card and the Equip button into view: on a small phone they sat below
  // the fold, and the tap seemed to do nothing (playtest 2026-10-06).
  void nextTick(() => document.querySelector('.detail-col .actions')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
const equip = () => {
  if (!selected.value) return
  const socket = slot.value === 'chip1' || slot.value === 'chip2' ? slot.value : undefined
  equipItem(selected.value.id, socket)
  currentHub()?.refreshHero()
  sfx('weapon')
}
const unequip = () => {
  const s = selected.value ? isEquipped(selected.value.id) : null
  if (s === 'chip1' || s === 'chip2') unequipChip(s)
  sfx('uiClick')
}
/** Salvage asks first: the item is gone for good (a playtest note). */
const salvaging = ref(false)
const salvage = () => {
  salvaging.value = false
  const s = selected.value
  if (!s) return
  if (salvageItem(s.id, salvageValue(s))) {
    sfx('bolt')
    selId.value = items.value[0]?.id ?? null
  }
}

// ── Special weapon loadout ──
const wSlot = ref<0 | 1>(0)
const assign = (w: WeaponId) => {
  const slots = profile.hero.slots
  const other = wSlot.value === 0 ? 1 : 0
  if (slots[other] === w) slots[other] = slots[wSlot.value]
  slots[wSlot.value] = w
  saveProfile()
  currentHub()?.refreshHero()
  sfx('weapon')
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const statRows = computed(() => {
  void profile.level
  void profile.inv.equipped
  const s = computeStats()
  return [
    { k: 'hero.stat.hp', v: s.maxHp },
    { k: 'hero.stat.we', v: s.maxWe },
    { k: 'hero.stat.power', v: s.maxPower },
    { k: 'hero.stat.damage', v: Math.round(s.busterDmg * s.pelletMul) },
    { k: 'hero.stat.charge', v: Math.round(s.busterDmg * 4 * s.chargeDmgMul) },
    { k: 'hero.stat.armor', v: armorTotal() },
    { k: 'hero.stat.crit', v: pct(s.critChance) },
    { k: 'hero.stat.tanks', v: `${profile.inv.tanks}/${s.tanksMax}` }
  ]
})
</script>

<style scoped lang="sass">
@use './sheet'
// The name plate: a pearl portrait disc with his face glyph (the hub tab's
// glyph), the name in the display face and what he is under it. It scrolls
// away with the panel, so it costs short landscape nothing once read.
.plate
  flex: 0 0 auto
  display: flex
  align-items: center
  gap: clamp(8px, 1.8vmin, 12px)
  padding: clamp(3px, 0.8vmin, 5px) 12px clamp(3px, 0.8vmin, 5px) clamp(3px, 0.8vmin, 5px)
  border-radius: 999px
  background: linear-gradient(90deg, rgba(79, 216, 255, 0.24), rgba(79, 216, 255, 0) 85%)
  box-shadow: inset 0 0 0 2px rgba(127, 244, 255, 0.25)
.p-face
  flex: 0 0 auto
  display: grid
  place-items: center
  width: clamp(30px, 7.4vmin, 46px)
  height: clamp(30px, 7.4vmin, 46px)
  border-radius: 50%
  border: 3px solid #141a33
  // His pearl shell, his dark visor, the warm glow of his eye-lights.
  background: radial-gradient(circle at 40% 30%, #ffffff, #e3e8ef 55%, #aab4c4)
  color: #161a22
  box-shadow: 0 0 10px rgba(255, 167, 51, 0.5)
  // Nested, so it outranks GameIcon's own 100% sizing on specificity.
  .fi
    width: 68%
    height: 68%
.p-id
  display: flex
  flex-direction: column
  // Each line as wide as its text: a right-to-left descriptor stays next
  // to the name instead of flying to the far edge.
  align-items: flex-start
  min-width: 0
.p-name
  font-family: var(--font-ui)
  font-size: clamp(18px, 4.4vmin, 28px)
  line-height: 1
  letter-spacing: 0.08em
  text-transform: uppercase
  color: #fff
  text-shadow: 0 3px 0 #141a33, 0 0 12px rgba(127, 244, 255, 0.55)
.p-role
  margin-top: 3px
  font-family: var(--font-ui)
  font-size: clamp(10px, 2.3vmin, 13px)
  line-height: 1.15
  color: #9fe6ff
.attr-cta
  padding: 10px
  border-radius: 12px
  border: 3px solid #141a33
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
  font-family: var(--font-ui)
  font-size: clamp(13px, 2.8vmin, 16px)
  animation: cta 1.2s ease-in-out infinite
.wslots
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px
.wslot
  display: flex
  align-items: center
  gap: 8px
  padding: 8px 10px
  border-radius: 12px
  border: 3px solid var(--wc, #3a5a9a)
  background: rgba(0, 0, 0, 0.3)
  color: #fff
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 15px)
  &.on
    outline: 2px solid #ffd84a
.ws-orb
  flex: 0 0 auto
  width: 20px
  height: 20px
  border-radius: 50%
  border: 2px solid #141a33
  background: radial-gradient(circle, #fff 0%, var(--wc, #3a5a9a) 70%)
  box-shadow: 0 0 8px var(--wc, transparent)
.wlist
  display: flex
  flex-direction: column
  gap: 4px
.wrow
  display: grid
  grid-template-columns: auto 1fr auto
  align-items: center
  gap: 2px 8px
  padding: 6px 10px
  border-radius: 10px
  border-left: 4px solid var(--wc)
  background: rgba(0, 0, 0, 0.25)
  color: #fff
  text-align: left
  font-family: var(--font-ui)
  &.eq
    background: rgba(255, 255, 255, 0.08)
.wr-name
  font-size: clamp(12px, 2.6vmin, 15px)
.wr-rank
  font-family: var(--font-pixel)
  font-size: clamp(7px, 1.6vmin, 9px)
  color: #ffd84a
.wr-desc
  grid-column: 2 / 4
  font-size: clamp(10px, 2.2vmin, 12px)
  color: #9fb8e6
.slots
  display: grid
  grid-template-columns: repeat(6, 1fr)
  gap: 6px
.slot
  position: relative
  aspect-ratio: 1
  border-radius: 12px
  border: 3px solid var(--rc, #3a5a9a)
  background: rgba(0, 0, 0, 0.3)
  color: #fff
  padding: 18%
  &.on
    background: rgba(79, 216, 255, 0.25)
    outline: 2px solid #fff
  &.empty
    color: #5d6a82
.s-ico
  display: block
  width: 100%
  height: 100%
.s-lvl
  position: absolute
  right: 2px
  bottom: 1px
  font-family: var(--font-pixel)
  font-size: 7px
.s-new
  position: absolute
  right: -5px
  top: -6px
  width: 16px
  height: 16px
  border-radius: 50%
  background: #ff4a5a
  border: 2px solid #141a33
  font-size: 9px
  line-height: 12px
.cols
  display: flex
  gap: 10px
.list
  flex: 1
  min-width: 0
  display: flex
  flex-direction: column
  gap: 4px
.row
  display: flex
  align-items: center
  gap: 8px
  padding: 7px 10px
  border-radius: 10px
  border-left: 4px solid var(--rc)
  background: rgba(0, 0, 0, 0.25)
  color: #fff
  text-align: left
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 14px)
  &.sel
    background: rgba(79, 216, 255, 0.22)
.r-name
  color: var(--rc)
  flex: 1
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
.r-upg
  color: #ffd84a
.r-meta
  font-family: var(--font-pixel)
  font-size: 0.6em
  color: #9fe6ff
.r-tag
  font-size: 0.75em
  color: #8dff7a
.r-better
  display: inline-flex
  width: 1.1em
  height: 1.1em
  color: #8dff7a
.r-new
  font-size: 0.7em
  padding: 1px 5px
  border-radius: 6px
  background: #ff4a5a
.empty-note
  color: #7f8ba3
  font-size: clamp(12px, 2.6vmin, 14px)
.detail-col
  flex: 1
  min-width: 0
.actions
  display: flex
  gap: 8px
  flex-wrap: wrap
.btn
  flex: 1
  padding: 8px 10px
  border-radius: 12px
  border: 3px solid #141a33
  color: #fff
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 15px)
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &:active
    transform: translateY(2px)
.equip
  background: linear-gradient(#7ff4ff, #1f7fd0)
.unequip
  background: linear-gradient(#5d6a82, #3b4458)
.salvage
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 6px
  background: linear-gradient(#ffb04a, #c25a00)
.gain
  display: inline-flex
  align-items: center
  gap: 2px
  // Nested, so it outranks GameIcon's own 100% sizing on specificity.
  .bi
    width: 1.05em
    height: 1.05em
.stats
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 4px 12px
  padding: 8px 12px
  border-radius: 12px
  background: rgba(0, 0, 0, 0.25)
.stat
  display: flex
  justify-content: space-between
  font-size: clamp(12px, 2.6vmin, 15px)
.k
  color: #cfe0ff
.v
  font-family: var(--font-pixel)
  font-size: 0.75em
.attrs
  display: grid
  grid-template-columns: repeat(3, 1fr)
  gap: 8px
.attr
  display: flex
  align-items: center
  gap: 6px
  padding: 8px
  border-radius: 12px
  border: 2px solid #141a33
  font-size: clamp(12px, 2.6vmin, 14px)
  &.hp
    background: linear-gradient(#d0303f, #7a1420)
  &.we
    background: linear-gradient(#1f7fd0, #123c6e)
  &.power
    background: linear-gradient(#2f9a3f, #145a22)
.ai
  width: 20px
  height: 20px
.av
  margin-left: auto
  font-family: var(--font-pixel)
  font-size: 0.75em
@media (orientation: portrait)
  .cols
    flex-direction: column
// A phone on its side: the plate is one slim line, the gear tiles stop at a
// thumb's width, so the list and the item card come up into view.
@media (orientation: landscape) and (max-height: 540px)
  .plate
    padding: 2px 10px 2px 2px
  .p-face
    width: 28px
    height: 28px
    border-width: 2px
  .p-id
    flex-direction: row
    align-items: baseline
    gap: 8px
  .p-name
    font-size: 18px
  .p-role
    margin-top: 0
    font-size: 11px
  .slots
    grid-template-columns: repeat(6, minmax(0, 46px))
  .slot
    border-radius: 10px
  // Half a narrow column: the name gets the row's whole first line (the
  // level and the equipped tag beside it squeezed it to "Stan…"), the level
  // and the tag go under it.
  .row
    flex-wrap: wrap
    row-gap: 2px
  .r-name
    flex-basis: 100%
    white-space: normal
    line-height: 1.15
    hyphens: auto
@keyframes cta
  50%
    transform: scale(1.03)
</style>
