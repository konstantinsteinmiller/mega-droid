<template lang="pug">
  div.hub(ref="root" :class="{ cine: hubUi.cine }")
    div.topbar
      //- The level and its pending pick. On a short landscape screen they move
      //- to the bottom-right corner, under Flux, and the panel takes the top.
      div.who
        div.lvl
          span.lv-num {{ profile.level }}
          div.lv-col
            span.lv-label {{ t('hud.level', { n: profile.level }) }}
            div.xp
              div.xp-fill(:style="{ width: Math.min(100, xp01() * 100) + '%' }")
        button.pill.attr(v-if="profile.hero.pendingAttrs > 0" type="button" @click="flow.modal = 'levelUp'")
          GameIcon.pi(name="star")
          span {{ t('hub.levelUpReady') }}
      div.spacer
      //- Pip has supplies (a rewarded video is ready): his dialog, one tap
      //- away — or one key: "[F] Open" on a keyboard (the hall's captured
      //- mouse cannot reach the pill).
      button.pill.pip(v-if="hubUi.pipReady" type="button" :aria-label="t('hub.pip.aria')" @click="openPip")
        GameIcon.pi(name="gift")
        span.pip-bang !
        template(v-if="keyHint")
          KeyCap.pip-key(code="KeyF")
          span.pip-open {{ t('hub.act.open') }}
      div.pill.bolts(data-lesson="bolts" @pointerdown="registerQaAdTap()")
        GameIcon.pi(name="nut")
        span {{ fmt(profile.bolts) }}
      //- The top-100 list, on builds with a live board only (a baked board's
      //- rows would be invented players; there the results screen shows the
      //- rank badge alone). It opens after four finished missions; until then
      //- it is a dimmed pill with a lock. The Hall of Fame terminal in the
      //- hall opens the same board.
      button.pill.ranks(
        v-if="boardModalEnabled"
        type="button"
        :class="menuClass('leaderboard')"
        :aria-label="locked('leaderboard') ? lockedAria('leaderboard', t('leaderboard.title')) : t('leaderboard.title')"
        :aria-disabled="locked('leaderboard') || undefined"
        @pointerenter="hoverLocked('leaderboard', $event)"
        @pointerleave="leaveLocked('leaderboard', $event)"
        @click="openBoard"
      )
        GameIcon.pi(name="leaderboard")
        span.lock(v-if="locked('leaderboard')")
          GameIcon(name="lock")
        span.new-chip(v-if="fresh('leaderboard')") {{ t('gear.new') }}
      button.pill.cog(type="button" :aria-label="t('options.title')" @click="$emit('options')")
        GameIcon.pi(name="settings")
    LeaderboardModal(v-if="boardModalEnabled" v-model="showBoard" :score="lifetimeXp()")
    //- The walk: labels over the places, the stick, and what Flux can do here.
    HubMarkers(@locked="onLockedMark" @hover="onHoverMark" @leave="onLeaveMark")
    div.joy-wrap(v-show="walking")
      Joystick
    HubPrompt
    //- A station's panel (#173): opened at the weapon rack, the forge, the chip
    //- lab. The camera frames Flux beside it, as the old lab did.
    Transition(name="panel")
      div.panel(v-if="tab !== 'missions'" :class="`tab-${tab}`")
        div.panel-head
          span.ph-ico
            GameIcon(:name="STATION_ICON[tab]")
          span.ph-text
            span.ph-title {{ t(`hub.place.${tab}`) }}
            span.ph-sub {{ t(`hub.tab.${tab}`) }}
          button.ph-close(type="button" data-lesson="tab-missions" :aria-label="t('hub.back')" @click="closePanel")
            GameIcon(name="close")
        Transition(name="tab-fade" mode="out-in")
          HeroTab(v-if="tab === 'hero'" key="h")
          CircuitsTab(v-else-if="tab === 'circuits'" key="c")
          WorkshopTab(v-else key="w")
    PipDialog
    //- The lock hint: one at a time, while the mouse is over a locked place's
    //- label, or for 3 s after a tap on one (the next tap takes it away
    //- sooner). Placed inside the safe area once it has a size (`placeTip`).
    div.lock-tip(
      v-if="hint"
      ref="tipEl"
      role="tooltip"
      :class="{ below: hintAt.below, placed: hintAt.placed }"
      :style="hintStyle"
    )
      GameIcon.lt-ico(name="lock")
      span.lt-text {{ t('hub.unlock.hint', left(hint.id)) }}
    HubLesson
    PipNotice
    HubSceneLayer
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import HeroTab from './HeroTab.vue'
import CircuitsTab from './CircuitsTab.vue'
import WorkshopTab from './WorkshopTab.vue'
import HubLesson from './HubLesson.vue'
import PipNotice from './PipNotice.vue'
import HubMarkers from './HubMarkers.vue'
import HubPrompt from './HubPrompt.vue'
import PipDialog from './PipDialog.vue'
import Joystick from '@/components/hud/Joystick.vue'
import KeyCap from '@/components/hud/KeyCap.vue'
import HubSceneLayer from '@/components/story/HubSceneLayer.vue'
import { hubTab } from './hubLesson'
import {
  HUB_UNLOCKS, FLOOR_TIP, isFresh, isUnlocked, missionsLeft, needFor, openedTip, placeTip, toAnnounce,
  unlockCount, unlockFloor, unlockedTip, type HubMenu
} from './hubUnlocks'
import { usePipSupplies } from './pipSupplies'
import { profile, xp01, lifetimeXp, saveProfile, markTip } from '@/game/state/profile'
import LeaderboardModal from '@/components/organisms/LeaderboardModal.vue'
import { boardModalEnabled } from '@/use/useLeaderboard'
import { isAnyModalOpen } from '@/use/useModalState'
import { flow } from '@/game/flow'
import { currentHub, input } from '@/game/boot'
import { hud } from '@/game/state/hud'
import { hubUi, hubDialog } from '@/game/state/hubUi'
import type { PlaceState } from '@/game/sim/hubPlaces'
import { formatCount } from '@/utils/localeNumber'
import { sfx } from '@/game/audio/sfx'
import { registerQaAdTap } from '@/use/useQaAdTrigger'

/**
 * The hub (#173): Gauss's lab and its Deployment Hall, on foot. The scene is
 * the hub mode (`sim/hub.ts`); this is its UI — the status bar (level, Bolts,
 * the board, Options), the labels over the places, the prompt for the place
 * Flux stands at, a station's panel (Flux's gear at the weapon rack, the
 * Workshop at the forge, Circuits at the chip lab) and Pip's supplies.
 *
 * The stations open one at a time as missions are finished
 * (`hubUnlocks.ts`): a locked one stands dark behind a lock, its label
 * dimmed, and a press on it gives the "no" sound and a hint saying how many
 * missions are left; one that has just opened wears a "new" chip until it is
 * first used.
 */
defineEmits<{ options: [] }>()
const { t, locale } = useI18n()
const STATION_ICON: Record<string, GameIconName> = { hero: 'android', circuits: 'chart', workshop: 'anvil' }
// Shared with the upgrade tour (it watches which station is open): 'missions'
// is the walk, no panel. Every visit opens on the walk.
const tab = hubTab
tab.value = 'missions'
const fmt = (n: number) => formatCount(Math.round(n), locale.value)

/** The leaderboard modal (the pill, or the Hall of Fame terminal). It
 *  fetches the board when it opens, not before. */
const showBoard = computed({
  get: () => hubDialog.board,
  set: (v: boolean) => { hubDialog.board = v }
})

/** Walking (the stick shows): no panel, dialog or film. */
const walking = computed(() => tab.value === 'missions' && !hubDialog.open && !hubUi.cine && !flow.modal)

const closePanel = (): void => {
  if (tab.value === 'missions') return
  tab.value = 'missions'
  sfx('uiClose')
}

// ── Pip's supplies ──
const sup = usePipSupplies()
watchEffect(() => { hubUi.pipReady = sup.anyOffer.value })
/** A keyboard is in play: the pill names Pip's key. */
const keyHint = computed(() => hud.device !== 'touch' && input.device !== 'touch')
const openPip = (): void => {
  sfx('pipChirp')
  hubDialog.open = true
}

// ── Unlocks ──
const count = computed(() => unlockCount(profile))
const locked = (id: HubMenu) => !isUnlocked(id, count.value)
const left = (id: HubMenu) => missionsLeft(id, count.value)
const fresh = (id: HubMenu) => isFresh(profile, id)
const menuClass = (id: HubMenu) => ({ locked: locked(id), fresh: fresh(id) })
/** Menus this build shows that open later (the pill only with a live board). */
const LATER = HUB_UNLOCKS
  .map(m => m.id)
  .filter(id => needFor(id) > 0 && (id !== 'leaderboard' || boardModalEnabled.value))

const lockedAria = (id: HubMenu, name: string) => t('hub.unlock.aria', { name, n: left(id) }, left(id))

/**
 * The first lab visit under the unlock rules decides the floor, once. A save
 * that has used the old lab (every menu open from the start) keeps every
 * menu, and none of them is "new" to it; everyone else counts from their
 * finished missions.
 */
const settleFloor = () => {
  if (typeof profile.tips[FLOOR_TIP] === 'number') return
  const floor = unlockFloor(profile)
  profile.tips[FLOOR_TIP] = floor
  for (const m of HUB_UNLOCKS) {
    if (m.need > 0 && isUnlocked(m.id, floor)) {
      profile.tips[unlockedTip(m.id)] = true
      profile.tips[openedTip(m.id)] = true
    }
  }
  saveProfile()
}

/** A station that opened since the last visit: up goes its "new" chip (until
 *  it is used), with a short fanfare. It waits for anything on top of the
 *  lab (the level-up pick), so the moment is seen. */
const announce = () => {
  if (flow.modal) return
  const ids = toAnnounce(profile, LATER)
  if (!ids.length) return
  for (const id of ids) profile.tips[unlockedTip(id)] = true
  saveProfile()
  if (ids.some(id => !profile.tips[openedTip(id)])) sfx('objective')
}
/** Used once: the chip is gone for good. */
const seen = (id: HubMenu) => {
  if (needFor(id) > 0 && !profile.tips[openedTip(id)]) markTip(openedTip(id))
}
// A station's panel opened (or the board): it has been used.
watch(tab, (id) => { if (id !== 'missions') seen(id) })
watch(() => hubDialog.board, (on) => { if (on) seen('leaderboard') })

const openBoard = (e: MouseEvent) => {
  if (locked('leaderboard')) { denyLocked('leaderboard', e.currentTarget as HTMLElement, e); return }
  showBoard.value = true
  seen('leaderboard')
}

// ── The lock hint ──
const TIP_TOUCH_MS = 3000
const root = ref<HTMLElement | null>(null)
const tipEl = ref<HTMLElement | null>(null)
const hint = ref<{ id: HubMenu; touch: boolean } | null>(null)
const hintAt = ref({ x: 0, y: 0, arrow: 0, below: false, placed: false })
let hintAnchor: HTMLElement | null = null
let hintTimer: number | null = null
/** The pointer of the last press: a tap (touch, pen) keeps its hint 3 s. */
let pressedWith = 'mouse'

const clearHintTimer = () => {
  if (hintTimer !== null) clearTimeout(hintTimer)
  hintTimer = null
}
const hideHint = () => {
  clearHintTimer()
  hint.value = null
  hintAnchor = null
}
const px = (v: string | undefined) => parseFloat(v ?? '') || 0
/** Measured once it is on screen: its size decides where it fits. The lab's
 *  own padding is the safe area (`env(safe-area-inset-*)`). */
const placeHint = () => {
  const el = tipEl.value
  if (!el || !hintAnchor) return
  const cs = root.value ? getComputedStyle(root.value) : null
  const safe = { top: px(cs?.paddingTop), right: px(cs?.paddingRight), bottom: px(cs?.paddingBottom), left: px(cs?.paddingLeft) }
  const at = placeTip(
    hintAnchor.getBoundingClientRect(),
    { width: el.offsetWidth, height: el.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    safe
  )
  hintAt.value = { ...at, placed: true }
}
const showHint = (id: HubMenu, el: HTMLElement, touch: boolean) => {
  clearHintTimer()
  hint.value = { id, touch }
  hintAnchor = el
  hintAt.value = { ...hintAt.value, placed: false }
  if (touch) hintTimer = window.setTimeout(hideHint, TIP_TOUCH_MS)
  void nextTick(placeHint)
}
const hintStyle = computed(() => ({
  left: `${hintAt.value.x}px`, top: `${hintAt.value.y}px`, '--arrow': `${hintAt.value.arrow}px`
}))

/** The mouse over a locked menu: its hint, for as long as it stays. */
const hoverLocked = (id: HubMenu, e: PointerEvent) => {
  if (e.pointerType === 'mouse' && locked(id)) showHint(id, e.currentTarget as HTMLElement, false)
}
const leaveLocked = (id: HubMenu, e: PointerEvent) => {
  if (e.pointerType === 'mouse' && hint.value?.id === id && !hint.value.touch) hideHint()
}
/** A press on a locked menu: the "no" sound and its hint. A tap's (or a
 *  key's: `detail` 0) hint leaves by itself. */
const denyLocked = (id: HubMenu, el: HTMLElement, e: MouseEvent) => {
  sfx('denied')
  showHint(id, el, e.detail === 0 || pressedWith !== 'mouse')
}
// The labels over the places speak for their stations.
const onLockedMark = (menu: HubMenu, el: HTMLElement, e: MouseEvent) => denyLocked(menu, el, e)
const onHoverMark = (menu: HubMenu | null, state: PlaceState, e: PointerEvent) => {
  if (menu && state === 'locked') hoverLocked(menu, e)
}
const onLeaveMark = (menu: HubMenu | null, e: PointerEvent) => { if (menu) leaveLocked(menu, e) }
/** Every press, before its target sees it: note the pointer, and take a
 *  tap's hint away (a press on a locked menu then shows its own). */
const onAnyPress = (e: PointerEvent) => {
  pressedWith = e.pointerType || 'mouse'
  if (hint.value?.touch) hideHint()
}
const onResize = () => { if (hint.value) placeHint() }

// ── Keys: Esc leaves a station's panel, Enter uses the place Flux stands at ──
const typing = (e: KeyboardEvent): boolean => {
  const tag = (e.target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
const onKey = (e: KeyboardEvent) => {
  if (flow.screen !== 'hub' || e.repeat || typing(e) || isAnyModalOpen.value || flow.modal) return
  if (e.code === 'Escape' && tab.value !== 'missions') {
    e.preventDefault()
    closePanel()
  } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && tab.value === 'missions' && !hubDialog.open) {
    // A focused button takes its own Enter.
    if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return
    e.preventDefault()
    currentHub()?.interact()
  }
}

// A cloud save loaded on top brings its own tips (and maybe a new count).
watch(() => profile.tips, () => { settleFloor(); announce() })
watch(() => flow.modal, announce)

onMounted(() => {
  // Pending attribute picks are offered as soon as the hub opens.
  if (profile.hero.pendingAttrs > 0 && !flow.modal) flow.modal = 'levelUp'
  settleFloor()
  announce()
  window.addEventListener('pointerdown', onAnyPress, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  clearHintTimer()
  window.removeEventListener('pointerdown', onAnyPress, true)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped lang="sass">
.hub
  position: absolute
  inset: 0
  pointer-events: none
  color: #fff
  font-family: var(--font-ui)
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)
  // The resting joystick's centre (`Joystick.vue`), as on the mission HUD.
  --joy-home-x: 104px
  --joy-home-y: max(104px, 13vh)
// A film moment (the landing, the turn from the briefing): the status bar
// steps back with everything else.
.hub.cine .topbar
  opacity: 0
  pointer-events: none
.topbar
  position: relative
  z-index: 5
  pointer-events: auto
  // A small screen draws the Lab's blocks at a share of their size
  // (`use/useUiScale.ts`); the tour's overlay stays unscaled and measures them.
  zoom: var(--ui-scale, 1)
  display: flex
  align-items: center
  gap: clamp(6px, 1.4vmin, 10px)
  padding: clamp(8px, 2vmin, 14px)
  transition: opacity 0.3s
.spacer
  flex: 1
// Its children sit in the top bar's row as if it were not there.
.who
  display: contents
.lvl
  display: flex
  align-items: center
  gap: 8px
  padding: 4px 12px 4px 4px
  border-radius: 999px
  background: rgba(11, 20, 51, 0.78)
  border: 2px solid #141a33
// The level wears the mission HUD's rank badge (`TopStatus`): a teal shield
// with a pointed foot, never the gold disc that read as a coin beside the
// Bolts. Its rim is the badge's own background, its face an inset copy of the
// same shape, since a CSS border would be cut off by the clip-path.
.lv-num
  position: relative
  z-index: 1
  flex: 0 0 auto
  display: grid
  place-items: center
  width: clamp(27px, 6.1vmin, 35px)
  aspect-ratio: 7 / 8
  padding-bottom: 0.35em
  background: #141a33
  clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)
  color: #0b2a33
  font-family: var(--font-pixel)
  font-size: clamp(10px, 2.4vmin, 14px)
  &::before
    content: ''
    position: absolute
    inset: 3px
    z-index: -1
    clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)
    background: linear-gradient(#c8fff4, #3fe6c6 55%, #129c8a)
.lv-col
  display: flex
  flex-direction: column
  gap: 3px
.lv-label
  font-size: clamp(11px, 2.4vmin, 14px)
.xp
  width: clamp(70px, 18vmin, 130px)
  height: 7px
  border-radius: 4px
  background: #0b1433
  overflow: hidden
// Starts in the badge's teal, as on the mission HUD.
.xp-fill
  height: 100%
  background: linear-gradient(90deg, #3fe6c6, #9dff5a)
.pill
  display: flex
  align-items: center
  gap: 6px
  padding: 5px 12px
  border-radius: 999px
  background: rgba(11, 20, 51, 0.78)
  border: 2px solid #141a33
  color: #fff
  font-size: clamp(12px, 2.6vmin, 15px)
  .pi
    width: clamp(16px, 3.6vmin, 22px)
    height: clamp(16px, 3.6vmin, 22px)
.bolts .pi
  color: #ffd84a
.attr
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
  animation: pill-pulse 1.2s ease-in-out infinite
.cog, .ranks
  padding: 6px
.ranks
  position: relative
  .pi
    color: #ffd84a
// Pip's supplies: his purple, a "!" that pulses.
.pip
  position: relative
  padding: 6px 10px
  border-color: #4a1f86
  background: linear-gradient(#ffffff, #e6d6ff)
  color: #4a1f86
  box-shadow: 0 0 0 2px #b46cff
  animation: pill-pulse 1.2s ease-in-out infinite
.pip-bang
  font-family: var(--font-pixel)
  font-size: 12px
.pip-key
  margin-left: 2px
  font-size: 0.85em
.pip-open
  font-family: var(--font-ui)
  font-size: clamp(11px, 2.4vmin, 14px)
@keyframes pill-pulse
  50%
    transform: scale(1.06)
.joy-wrap
  position: absolute
  inset: 0
  pointer-events: none

// ── A station's panel ──
.panel
  position: absolute
  z-index: 4
  pointer-events: auto
  zoom: var(--ui-scale, 1)
  display: flex
  flex-direction: column
  min-height: 0
.panel-head
  display: flex
  align-items: center
  gap: 8px
  padding: 6px 8px 6px 6px
  margin-bottom: 6px
  border-radius: 14px
  border: 3px solid #141a33
  background: linear-gradient(#2f4580, #1c2a50)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35)
.ph-ico
  width: clamp(28px, 6vmin, 36px)
  height: clamp(28px, 6vmin, 36px)
  padding: 5px
  border-radius: 50%
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #fff, #7ff4ff 45%, #1f7fd0)
  color: #141a33
.ph-text
  flex: 1
  display: flex
  flex-direction: column
  line-height: 1.1
.ph-title
  font-size: clamp(14px, 3vmin, 18px)
  text-shadow: 0 2px 0 #141a33
.ph-sub
  font-size: clamp(10px, 2.2vmin, 12px)
  color: #9fb8e6
.ph-close
  width: clamp(32px, 7vmin, 40px)
  height: clamp(32px, 7vmin, 40px)
  padding: 7px
  border-radius: 50%
  border: 3px solid #141a33
  background: linear-gradient(#ffd23a, #e08a00)
  color: #141a33
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  cursor: pointer
  &:active
    transform: translateY(2px)
.panel-enter-active, .panel-leave-active
  transition: opacity 0.2s, transform 0.2s
.panel-enter-from, .panel-leave-to
  opacity: 0
  transform: translateY(14px)
.tab-fade-enter-active, .tab-fade-leave-active
  transition: opacity 0.15s, transform 0.15s
.tab-fade-enter-from, .tab-fade-leave-to
  opacity: 0
  transform: translateY(8px)
// Landscape: the panel is a left column, Flux stands on the right. The
// blocks are zoomed by --ui-scale and a zoomed vw is a zoomed one too: divide
// it back out, so the column keeps its share of the screen.
@media (orientation: landscape)
  .panel
    left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2vmin, 14px))
    top: calc((env(safe-area-inset-top, 0px) + clamp(56px, 11vmin, 76px)) / var(--ui-scale, 1))
    bottom: calc((env(safe-area-inset-bottom, 0px) + clamp(8px, 2vmin, 14px)) / var(--ui-scale, 1))
    width: min(calc(56vw / var(--ui-scale, 1)), 620px)
// A phone on its side: the column takes a little more of a short screen.
@media (orientation: landscape) and (max-height: 540px)
  .panel
    width: min(calc(62vw / var(--ui-scale, 1)), 620px)
// Portrait: the panel is a bottom sheet under Flux.
@media (orientation: portrait)
  .panel
    left: clamp(8px, 2vmin, 14px)
    right: clamp(8px, 2vmin, 14px)
    bottom: calc((env(safe-area-inset-bottom, 0px) + clamp(8px, 2vmin, 14px)) / var(--ui-scale, 1))
    max-height: 66vh
    justify-content: flex-end

// ── Locked menus: in place, dimmed, with a lock ──
.pill.locked .pi
  color: #8b98ba
  opacity: 0.45
.lock
  position: absolute
  right: -8px
  bottom: -5px
  width: 17px
  height: 17px
  padding: 2px
  border-radius: 50%
  background: #141a33
  color: #dfe7ff
.ranks .lock
  right: -6px
  bottom: -7px
  width: 16px
  height: 16px

// ── Just opened: a glow and a "new" chip until the first visit ──
.new-chip
  position: absolute
  left: 50%
  bottom: -12px
  transform: translateX(-50%)
  padding: 1px 5px
  border-radius: 6px
  border: 2px solid #141a33
  background: linear-gradient(#fff3a0, #ffd23a)
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 8px
  line-height: 12px
  white-space: nowrap
  pointer-events: none
.pill.fresh
  animation: fresh-glow 1.3s ease-in-out infinite
@keyframes fresh-glow
  0%, 100%
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(255, 216, 74, 0)
  50%
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 0 3px #ffd84a, 0 0 18px 6px rgba(255, 216, 74, 0.6)

// ── The lock hint ──
.lock-tip
  position: fixed
  z-index: 20
  display: flex
  align-items: center
  gap: 6px
  max-width: min(280px, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 16px))
  padding: 7px 11px
  border-radius: 12px
  border: 2px solid #141a33
  background: #f4f7ff
  color: #141a33
  font-size: clamp(12px, 2.6vmin, 14px)
  line-height: 1.25
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35)
  pointer-events: none
  // Measured before it is shown, so it never flashes in the wrong spot.
  visibility: hidden
  &.placed
    visibility: visible
    animation: tip-in 0.14s ease-out
  // The pointer, at the control's centre (`--arrow`).
  &::after
    content: ''
    position: absolute
    left: var(--arrow)
    top: 100%
    width: 9px
    height: 9px
    background: inherit
    border: solid #141a33
    border-width: 0 2px 2px 0
    transform: translate(-50%, -50%) rotate(45deg)
  &.below::after
    top: 0
    transform: translate(-50%, -50%) rotate(225deg)
.lt-ico
  flex: none
  width: 14px
  height: 14px
@keyframes tip-in
  from
    opacity: 0
    transform: translateY(4px)

@media (prefers-reduced-motion: reduce)
  .pill.fresh, .pip, .attr
    animation: none
  .pill.fresh
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 0 3px #ffd84a
  .lock-tip.placed
    animation: none

// A phone on its side: the level goes to the bottom-right corner, out of the
// panel's way.
@media (orientation: landscape) and (max-height: 540px)
  .who
    position: fixed
    right: calc(env(safe-area-inset-right, 0px) + clamp(8px, 2vmin, 14px))
    bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(8px, 2vmin, 14px))
    display: flex
    flex-direction: row-reverse
    align-items: center
    gap: clamp(6px, 1.4vmin, 10px)
</style>
