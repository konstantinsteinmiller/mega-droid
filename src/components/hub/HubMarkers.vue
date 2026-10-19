<template lang="pug">
  //- Labels over the places of the hall (#173): what stands there, in its
  //- state (the story's next mission chipped "Next", a new station "New", a
  //- locked one with its lock). A tap walks Flux there and uses it. The next
  //- mission's label stays on screen, pinned to the edge, wherever the camera
  //- looks. Placed per frame from `hubMarks` (direct style writes).
  div.marks(v-show="shown")
    button.mark(
      v-for="v in views"
      :key="v.id"
      :ref="(el) => bind(v.id, el)"
      type="button"
      :class="[v.kind, v.state, { fresh: v.fresh, near: hubUi.near === v.id || hubUi.nearLocked === v.id }]"
      :data-place="v.id"
      :data-lesson="v.lesson"
      :aria-label="v.aria"
      :aria-disabled="v.state === 'locked' || undefined"
      @click="tap(v, $event)"
      @pointerenter="emit('hover', v.menu, v.state, $event)"
      @pointerleave="emit('leave', v.menu, $event)"
    )
      span.m-body
        MasterPortrait.m-face(v-if="v.boss" :id="v.boss" :state="v.face" :size="30")
        span.m-ico(v-else)
          GameIcon(:name="v.icon")
        span.m-text
          span.m-name {{ v.name }}
          span.m-sub(v-if="v.sub") {{ v.sub }}
        span.m-chip.next(v-if="v.state === 'next'") {{ t('hub.next') }}
        span.m-chip.new(v-else-if="v.fresh") {{ t('gear.new') }}
        span.m-badge(v-if="v.badge") {{ v.badge }}
        span.m-lock(v-if="v.state === 'locked'")
          GameIcon(name="lock")
      span.m-stem(aria-hidden="true")
      //- Pinned to the edge: a bold arrow outside the label, pointing where
      //- the place is (an inked shaft and head, nudging that way).
      span.m-arrow(aria-hidden="true")
        svg(viewBox="0 0 40 28" width="46" height="32")
          path.a-body(d="M3 10.5 H19 V3.5 L37 14 L19 24.5 V17.5 H3 Z")
          path.a-shine(d="M6 12.5 H21 V8 L31 14")
    //- Pip with supplies: a "!" over him, a tap opens his dialog.
    button.pip-mark(
      ref="pipEl"
      v-show="hubUi.pipReady"
      type="button"
      :aria-label="t('hub.pip.aria')"
      @click="openPip"
    ) !
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import MasterPortrait from '@/components/atoms/MasterPortrait.vue'
import type { PortraitState } from '@/components/atoms/portraitState'
import type { BossId } from '@/game/models/bosses'
import { addHudTicker } from '@/game/state/hud'
import { hubUi, hubMarks, hubDialog } from '@/game/state/hubUi'
import { POI_BY_ID, type PoiId } from '@/game/world/hubLayout'
import type { PlaceState } from '@/game/sim/hubPlaces'
import { jobIndex } from '@/game/sim/hubPlaces'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { profile, chipsAvailable } from '@/game/state/profile'
import { currentHub } from '@/game/boot'
import { flow } from '@/game/flow'
import { isAnyModalOpen } from '@/use/useModalState'
import { sfx } from '@/game/audio/sfx'
import { hubTab, hubLesson } from './hubLesson'
import { missionsLeft, unlockCount, type HubMenu } from './hubUnlocks'
import { QUEST_ICON, questTitle } from './questFormat'
import { STATION_MENU, placeFreshNow, placeStateNow } from './placeView'

const { t } = useI18n()
const emit = defineEmits<{
  /** A locked station's label was pressed / hovered / left (the lock hint). */
  locked: [menu: HubMenu, el: HTMLElement, e: MouseEvent]
  hover: [menu: HubMenu | null, state: PlaceState, e: PointerEvent]
  leave: [menu: HubMenu | null, e: PointerEvent]
}>()

interface View {
  id: PoiId
  kind: string
  state: PlaceState
  fresh: boolean
  name: string
  sub: string
  aria: string
  icon: GameIconName
  boss: BossId | null
  face: PortraitState
  badge: string
  lesson: string | undefined
  /** The menu behind a station (its lock rules). */
  menu: HubMenu | null
}

const STATION_ICON: Record<string, GameIconName> = {
  hero: 'android', workshop: 'anvil', circuits: 'chart', records: 'leaderboard', table: 'book'
}
const views = computed<View[]>(() => hubUi.places.map((pl) => {
  const p = POI_BY_ID[pl.id]
  const state = placeStateNow(pl.id)
  const base = {
    id: pl.id, kind: p.kind, state, fresh: placeFreshNow(pl.id), badge: '', lesson: undefined as string | undefined,
    menu: STATION_MENU[pl.id] ?? null
  }
  if (p.sector) {
    const s = SECTOR_BY_ID[p.sector]
    const name = t(`sector.${s.id}`)
    return {
      ...base, name, sub: t('hub.levels', { a: s.levels[0], b: s.levels[1] }), aria: t('hub.walkTo', { place: name }),
      icon: 'skull' as GameIconName, boss: s.boss as BossId,
      face: (state === 'locked' ? 'locked' : state === 'cleared' ? 'beaten' : state === 'next' ? 'next' : 'plain') as PortraitState
    }
  }
  if (p.kind === 'job') {
    const q = profile.quests.jobs[jobIndex(pl.id)]
    const name = q && state === 'open' ? questTitle(t, q) : t('hub.jobs')
    return {
      ...base, name, sub: q && state === 'open' ? `${t(`sector.${q.sector}`)} · ${t('enemy.level', { n: q.level })}` : '',
      aria: t('hub.walkTo', { place: name }), icon: q && state === 'open' ? QUEST_ICON[q.template] : 'chest', boss: null, face: 'plain' as PortraitState
    }
  }
  const name = t(`hub.place.${pl.id}`)
  const sub = pl.id === 'records' ? t('leaderboard.title') : pl.id === 'table' ? '' : t(`hub.tab.${pl.id}`)
  let badge = ''
  if (state !== 'locked') {
    if (pl.id === 'hero' && (profile.inv.fresh.length > 0 || profile.hero.pendingAttrs > 0)) badge = '!'
    if (pl.id === 'circuits' && !base.fresh && chipsAvailable() > 0) badge = String(chipsAvailable())
  }
  // A locked station is spoken as locked, with what it waits for.
  const n = base.menu ? missionsLeft(base.menu, unlockCount(profile)) : 0
  const aria = state === 'locked' && base.menu ? t('hub.unlock.aria', { name, n }, n) : t('hub.walkTo', { place: name })
  return {
    ...base, name, sub, aria, icon: STATION_ICON[pl.id] ?? 'info', boss: null, face: 'plain' as PortraitState, badge,
    // The upgrade tour points at the stations by their old tab anchors.
    lesson: pl.id === 'hero' || pl.id === 'workshop' || pl.id === 'circuits' ? `tab-${pl.id}` : undefined
  }
}))

/** Over the walk only: not under a station's panel, a dialog, a modal or a film. */
const shown = computed(() => flow.screen === 'hub' && !hubUi.cine && hubTab.value === 'missions' && !hubDialog.open &&
  !hubDialog.board && !isAnyModalOpen.value && !flow.modal && !flow.loading)

const els = new Map<string, HTMLElement>()
const bind = (id: string, el: unknown): void => {
  if (el instanceof HTMLElement) els.set(id, el)
  else els.delete(id)
}
const pipEl = ref<HTMLElement | null>(null)

const tap = (v: View, e: MouseEvent): void => {
  if (v.state === 'locked' && v.menu) {
    emit('locked', v.menu, e.currentTarget as HTMLElement, e)
    // Still walk over, so the place and its hint are in front of him.
  }
  currentHub()?.goTo(v.id, v.state !== 'locked')
}

const openPip = (): void => {
  sfx('pipChirp')
  hubDialog.open = true
}

/** The edge arrow's angle for a label pinned to the screen's border. */
const EDGE_PAD = 46
/** The edge arrow's middle, this far out from the label's rim (px). */
const ARROW_GAP = 26
let off: (() => void) | null = null
const place = (): void => {
  if (!shown.value) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tour = hubLesson.step === 'workshop' ? 'workshop' : ''
  for (const [id, el] of els) {
    const m = hubMarks.get(id)
    const pinned = id === hubUi.walkingTo || id === tour || (hubUi.places.find(p => p.id === id)?.state === 'next')
    if (!m || (!m.onScreen && !pinned) || m.alpha < 0.02) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      continue
    }
    let x = m.x
    let y = m.y
    const edge = !m.onScreen
    if (edge) {
      // Its whole width inside the screen (the label is centred on x), and
      // room for its arrow beyond it.
      const half = Math.max(EDGE_PAD, el.offsetWidth * 0.45 + ARROW_GAP + 24)
      x = Math.min(vw - half, Math.max(half, x))
      y = Math.min(vh - EDGE_PAD - 40, Math.max(EDGE_PAD + 40, y))
    } else {
      // Over its place, but never cut by the screen's side (a narrow phone).
      const half = el.offsetWidth * 0.5 + 6
      x = Math.min(vw - half, Math.max(half, x))
    }
    el.style.visibility = 'visible'
    el.style.opacity = (edge ? 0.92 : Math.min(1, m.alpha)).toFixed(3)
    // Nearer is bigger, a little: the hall reads as deep.
    const k = edge ? 0.9 : Math.max(0.72, Math.min(1.06, 1.2 - m.dist / 40))
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${edge ? '-50%' : '-100%'}) scale(${k.toFixed(3)})`
    el.classList.toggle('edge', edge)
    if (edge) {
      // Outside the label's rim, on the side the place lies: never over its
      // text or its chip.
      const a = Math.atan2(m.y - vh / 2, m.x - vw / 2)
      const hw = el.offsetWidth / 2
      const hh = el.offsetHeight / 2
      const c = Math.abs(Math.cos(a))
      const s = Math.abs(Math.sin(a))
      const r = Math.min(c > 1e-3 ? hw / c : Infinity, s > 1e-3 ? hh / s : Infinity) + ARROW_GAP
      el.style.setProperty('--arrow', `${a.toFixed(3)}rad`)
      el.style.setProperty('--ax', `${(Math.cos(a) * r).toFixed(1)}px`)
      el.style.setProperty('--ay', `${(Math.sin(a) * r).toFixed(1)}px`)
    }
    el.style.pointerEvents = m.alpha > 0.35 || edge ? 'auto' : 'none'
  }
  const pm = hubMarks.get('pip')
  const pe = pipEl.value
  if (pe && pm) pe.style.transform = `translate3d(${pm.x.toFixed(1)}px, ${pm.y.toFixed(1)}px, 0) translate(-50%, -100%)`
}

onMounted(() => { off = addHudTicker(place) })
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.marks
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.mark
  position: absolute
  left: 0
  top: 0
  display: flex
  flex-direction: column
  align-items: center
  padding: 0
  border: 0
  background: none
  color: #fff
  font-family: var(--font-ui)
  pointer-events: auto
  visibility: hidden
  cursor: pointer
  transform-origin: 50% 100%
  will-change: transform, opacity
.m-body
  position: relative
  display: flex
  align-items: center
  gap: 6px
  padding: 4px 10px 4px 4px
  border-radius: 999px
  border: 2px solid #141a33
  background: rgba(11, 20, 51, 0.82)
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(127, 244, 255, 0.18)
  white-space: nowrap
.m-ico
  display: grid
  place-items: center
  width: 30px
  height: 30px
  padding: 5px
  border-radius: 50%
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #fff, #7ff4ff 45%, #1f7fd0)
  color: #141a33
.m-text
  display: flex
  flex-direction: column
  align-items: flex-start
  line-height: 1.1
.m-name
  font-size: clamp(12px, 2.4vmin, 15px)
  text-shadow: 0 2px 0 #141a33
.m-sub
  font-size: clamp(9px, 1.9vmin, 11px)
  color: #9fb8e6
.m-chip
  margin-left: 2px
  padding: 1px 6px
  border-radius: 6px
  border: 2px solid #141a33
  font-family: var(--font-pixel)
  font-size: 8px
  line-height: 12px
  &.next
    background: linear-gradient(#fff3a0, #ffd23a)
    color: #141a33
  &.new
    background: linear-gradient(#fff3a0, #ffd23a)
    color: #141a33
.m-badge
  position: absolute
  right: -6px
  top: -8px
  min-width: 18px
  height: 18px
  padding: 0 4px
  border-radius: 9px
  background: #ff4a5a
  border: 2px solid #141a33
  font-family: var(--font-pixel)
  font-size: 8px
  line-height: 14px
  text-align: center
.m-lock
  width: 18px
  height: 18px
  padding: 2px
  border-radius: 50%
  background: #141a33
  color: #dfe7ff
.m-stem
  width: 2px
  height: 14px
  background: linear-gradient(rgba(127, 244, 255, 0.7), rgba(127, 244, 255, 0))
.m-arrow
  display: none
// States: the next mission burns gold; a secured one is calm blue; a locked one dim.
.next .m-body
  border-color: #ffd23a
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 14px rgba(255, 210, 58, 0.55)
  animation: next-glow 1.4s ease-in-out infinite
.cleared .m-body
  border-color: #3aa8ff
.locked .m-body
  background: rgba(20, 24, 44, 0.8)
  .m-name, .m-ico
    opacity: 0.6
.empty .m-body
  opacity: 0.65
.fresh .m-body
  animation: fresh-glow 1.3s ease-in-out infinite
.near .m-body
  outline: 3px solid #7ff4ff
  outline-offset: 1px
// Pinned to the screen's edge: the label, and an arrow toward its place.
.mark.edge
  .m-stem
    display: none
  .m-arrow
    display: block
    position: absolute
    left: 50%
    top: 50%
    width: 46px
    height: 32px
    transform: translate(calc(var(--ax, 0px) - 50%), calc(var(--ay, 0px) - 50%)) rotate(var(--arrow))
    svg
      display: block
      overflow: visible
      filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45))
      animation: arrow-nudge 0.9s ease-in-out infinite
    .a-body
      fill: #ffd23a
      stroke: #141a33
      stroke-width: 3
      stroke-linejoin: round
    .a-shine
      fill: none
      stroke: #fff6c4
      stroke-width: 2
      stroke-linecap: round
      stroke-linejoin: round
      opacity: 0.85
.pip-mark
  position: absolute
  left: 0
  top: 0
  width: 34px
  height: 34px
  border-radius: 50%
  border: 3px solid #4a1f86
  background: #ffffff
  color: #4a1f86
  font-family: var(--font-pixel)
  font-size: 16px
  line-height: 26px
  text-align: center
  pointer-events: auto
  cursor: pointer
  box-shadow: 0 0 0 3px #b46cff, 0 4px 0 rgba(0, 0, 0, 0.35)
  animation: pip-bob 1s ease-in-out infinite
@keyframes next-glow
  50%
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 22px rgba(255, 210, 58, 0.9)
@keyframes fresh-glow
  50%
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 0 3px #ffd84a, 0 0 18px 6px rgba(255, 216, 74, 0.6)
@keyframes arrow-nudge
  50%
    transform: translateX(5px)
@keyframes pip-bob
  50%
    margin-top: -6px
@media (prefers-reduced-motion: reduce)
  .next .m-body, .fresh .m-body, .pip-mark, .m-arrow svg
    animation: none
</style>
