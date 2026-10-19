<template lang="pug">
  div.obj(v-if="hud.objectiveKey && hud.phase !== 'hub'" :class="{ done: hud.objectiveDone }" data-zone="objective")
    div.obj-head
      span.dot
      span.label {{ hud.objectiveDone ? t('objective.complete') : t('objective.title') }}
    div.obj-body
      //- The boss's face beside its name: a name alone let a Guardroid pass
      //- for the boss.
      img.portrait(v-if="portrait && !hud.objectiveDone" :src="portrait" :alt="bossName")
      //- Done: the checkmark badge. Atlas brings it (`state/celebrate.ts`):
      //- the badge stays empty until its checkmark has landed.
      span.check-slot(v-if="hud.objectiveDone" aria-hidden="true")
        svg.check(v-if="!checkPending" viewBox="0 0 40 40")
          use(href="#obj-check")
        span.act(v-if="act" :key="act.id" :class="{ reduced: act.reduced }" :style="{ '--dur': `${actMs}ms` }" data-celebrate="objective")
          //- Atlas: pearl shell, dark visor with two cyan eyes, the blush, cyan
          //- crystal tips, stubby fins and its ring with a gap.
          span.atlas
            svg(viewBox="-60 -60 120 120")
              g.atlas-body
                path(d="M-26 -8 l-24 -10 4 22 z" fill="#b9c7dc" :stroke="INK" stroke-width="3" stroke-linejoin="round")
                path(d="M26 -8 l24 -10 -4 22 z" fill="#b9c7dc" :stroke="INK" stroke-width="3" stroke-linejoin="round")
                path(d="M-7 -33 L0 -52 L7 -33 Z" fill="#6ff2ff" :stroke="INK" stroke-width="2.5" stroke-linejoin="round")
                path(d="M-6 33 L0 48 L6 33 Z" fill="#6ff2ff" :stroke="INK" stroke-width="2.5" stroke-linejoin="round")
                ellipse(cx="0" cy="0" rx="35" ry="33" fill="#eef4ff" :stroke="INK" stroke-width="3")
                path(d="M-34 4 Q0 14 34 4" fill="none" stroke="#b9c7dc" stroke-width="3")
                ellipse(cx="0" cy="-4" rx="25" ry="15" fill="#1d2a4a")
                g.atlas-eyes
                  ellipse(cx="-10" cy="-4" rx="6" ry="7.5" fill="#6ff2ff")
                  ellipse(cx="10" cy="-4" rx="6" ry="7.5" fill="#6ff2ff")
                  circle(cx="-12" cy="-7" r="2" fill="#fff")
                  circle(cx="8" cy="-7" r="2" fill="#fff")
                g.atlas-happy
                  path(d="M-16 -2 Q-10 -11 -4 -2 M4 -2 Q10 -11 16 -2" fill="none" stroke="#6ff2ff" stroke-width="3.4" stroke-linecap="round")
                ellipse(cx="-20" cy="11" rx="5" ry="2.6" fill="#ff9ac8")
                ellipse(cx="20" cy="11" rx="5" ry="2.6" fill="#ff9ac8")
                ellipse.atlas-mouth(cx="0" cy="18" rx="6" ry="4.5" fill="#1d2a4a" :stroke="INK" stroke-width="1.6")
              ellipse.atlas-ring(cx="0" cy="2" rx="50" ry="13" fill="none" stroke="#6ff2ff" stroke-width="3.4" stroke-linecap="round" pathLength="100" stroke-dasharray="80 20")
          //- The checkmark it spits: across in x, an arc in y.
          span.fly-x
            span.fly-y
              svg.check.flying(viewBox="0 0 40 40")
                use(href="#obj-check")
      div.obj-text {{ text }}
    //- The badge drawing, shared by the slot and the flying one.
    svg.defs(v-if="hud.objectiveDone" aria-hidden="true" width="0" height="0")
      defs
        g#obj-check
          circle(cx="20" cy="20" r="17" fill="#2fd25a" stroke="#141a33" stroke-width="3")
          path(d="M11 20.5 L17.5 27 L29.5 13.5" fill="none" stroke="#141a33" stroke-width="8" stroke-linecap="round" stroke-linejoin="round")
          path(d="M11 20.5 L17.5 27 L29.5 13.5" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round")
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import { resolveParams } from '@/game/state/i18nParams'
import { flow } from '@/game/flow'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { BossId } from '@/game/models/bosses'
import { bossPortrait, cachedBossPortrait } from '@/game/models/portrait'
import { celebrationMs, celebrationPending, celebrations } from '@/game/state/celebrate'

/** The mission objective line (Blades' quest tracker), under the energy bars. */
const { t } = useI18n()
const INK = '#141a33'

/** Atlas's checkmark act, while it plays; the slot's own badge waits for it. */
const act = computed(() => (celebrations.current?.kind === 'objective' ? celebrations.current : null))
const actMs = computed(() => (act.value ? celebrationMs(act.value) : 0))
const checkPending = computed(() => celebrationPending('objective'))

/** The objectives that name the sector's boss ("Defeat {boss}"; a climb's
 *  rematch at the foot of the tower and a platform stage's arena too). */
const BOSS_OBJECTIVES = ['objective.boss', 'objective.tutorial', 'objective.climb', 'objective.stage']
/** Whose objective this is: the sector's Core Master (the Scrapper in the
 *  Scrapyard, on the tutorial and its replays alike). */
const bossId = computed<BossId | null>(() => {
  const q = flow.quest
  return q && BOSS_OBJECTIVES.includes(hud.objectiveKey) ? SECTOR_BY_ID[q.sector].boss as BossId : null
})
const bossName = computed(() => (bossId.value ? t(`boss.${bossId.value}`) : ''))
const text = computed(() => {
  if (hud.objectiveDone) return t('objective.beamOutHint')
  const params = resolveParams(t, hud.objectiveParams)
  if (bossName.value) params.boss = bossName.value
  return t(hud.objectiveKey, params)
})

// Rendered once per boss, after the beam-in (the mission is running and its
// shaders are warm), then cached for the session: see `models/portrait.ts`.
const portrait = ref<string | null>(null)
watch([bossId, () => hud.phase], ([id, phase]) => {
  portrait.value = id ? cachedBossPortrait(id) : null
  if (!id || portrait.value || phase !== 'play') return
  void bossPortrait(id).then((url) => {
    if (bossId.value === id) portrait.value = url
  })
}, { immediate: true })
</script>

<style scoped lang="sass">
.obj
  position: absolute
  left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(40px, 9vmin, 60px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px))
  max-width: min(44vw, 280px)
  padding: 6px 10px
  border-radius: 10px
  background: rgba(11, 20, 51, 0.62)
  border: 2px solid rgba(127, 244, 255, 0.35)
  color: #fff
  font-family: var(--font-ui)
  pointer-events: none
  &.done
    border-color: rgba(141, 255, 122, 0.8)
    box-shadow: 0 0 14px rgba(141, 255, 122, 0.35)
.obj-head
  display: flex
  align-items: center
  gap: 6px
  font-size: clamp(9px, 1.9vmin, 12px)
  color: #9fe6ff
  letter-spacing: 0.06em
  text-transform: uppercase
.done .obj-head
  color: #8dff7a
.dot
  width: 7px
  height: 7px
  border-radius: 50%
  background: currentColor
  box-shadow: 0 0 6px currentColor
.obj-body
  display: flex
  align-items: center
  gap: 8px
  margin-top: 2px
// A round badge on a dark disc, ringed in the boss red (the story card's
// colour); the portrait's background is transparent.
.portrait
  flex: 0 0 auto
  width: clamp(34px, 7.5vmin, 46px)
  height: clamp(34px, 7.5vmin, 46px)
  border-radius: 50%
  border: 2px solid #ff6a78
  background: radial-gradient(circle at 50% 35%, #3a4a86, #141a33 72%)
  box-shadow: 0 0 8px rgba(255, 74, 90, 0.45)
  object-fit: cover
  animation: portrait-in 0.35s ease-out
.obj-text
  font-size: clamp(11px, 2.4vmin, 15px)
  line-height: 1.25
  text-shadow: 0 2px 0 #141a33
@keyframes portrait-in
  from
    opacity: 0
    transform: scale(0.6)
// ─── The checkmark badge and Atlas's act ────────────────────────────────────
.defs
  position: absolute
  width: 0
  height: 0
.check-slot
  --s: clamp(18px, 3.6vmin, 24px)
  position: relative
  flex: 0 0 auto
  width: var(--s)
  height: var(--s)
.check
  display: block
  width: var(--s)
  height: var(--s)
  overflow: visible
.act
  position: absolute
  left: 0
  top: 0
  width: var(--s)
  height: var(--s)
  svg
    overflow: visible
  g, ellipse
    transform-box: fill-box
// Atlas hovers under and right of the card, its mouth about (3.6s, 3.5s)
// from the slot's corner.
.atlas
  position: absolute
  left: calc(var(--s) * 2)
  top: calc(var(--s) * 1.4)
  width: calc(var(--s) * 3.2)
  height: calc(var(--s) * 3.2)
  animation: atl-fly var(--dur) ease-in-out both
  svg
    display: block
    width: 100%
    height: 100%
    filter: drop-shadow(0 2px 0 rgba(20, 26, 51, 0.45))
.atlas-body
  transform-origin: 50% 50%
  animation: atl-lean var(--dur) ease-in-out both
.atlas-mouth
  transform-origin: 50% 30%
  animation: atl-mouth var(--dur) ease-out both
.atlas-eyes
  animation: atl-eyes var(--dur) step-end both
.atlas-happy
  opacity: 0
  animation: atl-happy var(--dur) step-end both
.atlas-ring
  animation: atl-ring var(--dur) linear both
// The flying checkmark: x and y on separate layers, one ease each makes the
// arc. Starts in Atlas's mouth and lands on the slot.
.fly-x
  position: absolute
  left: 0
  top: 0
  animation: chk-x var(--dur) both
.fly-y
  display: block
  animation: chk-y var(--dur) both
.flying
  transform-origin: 50% 100%
  animation: chk-pop var(--dur) both

// 0–22 % Atlas swoops in; 22–32 % the mouth opens, out pops the check;
// 30–58 % it arcs to the badge; 58–72 % it lands and bounces; Atlas squints
// happily and spins its ring; 80–100 % off it goes.
@keyframes atl-fly
  0%
    transform: translate(calc(var(--s) * 7), calc(var(--s) * -2.5)) rotate(-25deg) scale(0.6)
    opacity: 0
  6%
    opacity: 1
  18%
    transform: translate(calc(var(--s) * -0.3), calc(var(--s) * 0.3)) rotate(10deg) scale(1.05)
  24%, 76%
    transform: translate(0, 0) rotate(0deg) scale(1)
    opacity: 1
  82%
    transform: translate(calc(var(--s) * -0.3), calc(var(--s) * 0.4)) rotate(-8deg) scale(1)
    opacity: 1
  100%
    transform: translate(calc(var(--s) * 8), calc(var(--s) * -4)) rotate(30deg) scale(0.6)
    opacity: 0
@keyframes atl-lean
  0%, 24%
    transform: translateY(0) rotate(0deg) scale(1, 1)
  28%
    transform: translateY(4%) rotate(0deg) scale(1.1, 0.88)
  33%
    transform: translateY(-6%) rotate(8deg) scale(0.94, 1.08)
  40%
    transform: translateY(0) rotate(4deg) scale(1, 1)
  60%
    transform: translateY(0) rotate(0deg)
  64%
    transform: translateY(-8%) rotate(-10deg)
  68%
    transform: translateY(0) rotate(10deg)
  72%, 100%
    transform: translateY(0) rotate(0deg)
@keyframes atl-mouth
  0%, 24%
    transform: scale(0.6, 0.35)
  30%
    transform: scale(1.5, 1.8)
  38%
    transform: scale(0.7, 0.5)
  60%, 100%
    transform: scale(1.1, 0.9)
@keyframes atl-eyes
  0%
    opacity: 1
  38%
    opacity: 0
  80%
    opacity: 1
@keyframes atl-happy
  0%
    opacity: 0
  38%
    opacity: 1
  80%
    opacity: 0
@keyframes atl-ring
  0%
    stroke-dashoffset: 0
  100%
    stroke-dashoffset: -300
@keyframes chk-x
  0%, 30%
    transform: translateX(calc(var(--s) * 3.1))
    animation-timing-function: cubic-bezier(0.3, 0.1, 0.6, 1)
  58%, 100%
    transform: translateX(0)
@keyframes chk-y
  0%, 30%
    transform: translateY(calc(var(--s) * 3.0))
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.5, 1)
  44%
    transform: translateY(calc(var(--s) * -1.6))
    animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.4)
  58%, 100%
    transform: translateY(0)
@keyframes chk-pop
  0%, 26%
    transform: scale(0.1) rotate(0deg)
    opacity: 0
  32%
    transform: scale(0.9) rotate(-60deg)
    opacity: 1
  50%
    transform: scale(1.15) rotate(-300deg)
  57%
    transform: scale(1.1) rotate(-360deg)
  60%
    transform: scale(1.4, 0.65) rotate(-360deg)
  64%
    transform: scale(0.85, 1.25) rotate(-360deg) translateY(-14%)
  68%
    transform: scale(1.12, 0.9) rotate(-360deg)
  72%, 100%
    transform: scale(1) rotate(-360deg)
    opacity: 1
// The card answers the landing with a green flash.
.done:has(.act:not(.reduced))
  animation: obj-glow 2s ease-out both
@keyframes obj-glow
  0%, 58%
    box-shadow: 0 0 14px rgba(141, 255, 122, 0.35)
  62%
    box-shadow: 0 0 26px rgba(141, 255, 122, 0.9)
  100%
    box-shadow: 0 0 14px rgba(141, 255, 122, 0.35)

// Reduced motion: Atlas fades in where it hovers, the check fades in on the
// badge, Atlas fades away. Nothing travels.
.reduced
  .atlas
    animation: atl-fade var(--dur) ease-in-out both
  .atlas-body, .atlas-mouth, .atlas-eyes, .atlas-happy, .atlas-ring, .fly-x, .fly-y
    animation: none
  .flying
    animation: chk-fade var(--dur) ease-out both
@keyframes atl-fade
  0%, 100%
    opacity: 0
  20%, 75%
    opacity: 1
@keyframes chk-fade
  0%, 30%
    opacity: 0
  60%, 100%
    opacity: 1
// Portrait: too narrow to share the top row with the status pills, so the
// tracker sits under the bars instead.
// A narrow landscape screen: the compass sits under the top row from 30vw to
// 70vw (Compass.vue), so the card ends before 30vw and wraps instead.
@media (min-aspect-ratio: 1/1) and (max-width: 1100px)
  .obj
    max-width: calc(30vw - 8px - env(safe-area-inset-left, 0px) - clamp(8px, 2.2vmin, 18px) - clamp(40px, 9vmin, 60px))
@media (max-aspect-ratio: 1/1)
  .obj
    left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2.2vmin, 18px))
    top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(110px, 28vmin, 200px) + 24px)
    max-width: min(70vw, 320px)
</style>
