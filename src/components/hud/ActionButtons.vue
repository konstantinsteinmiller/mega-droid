<template lang="pug">
  div.actions(ref="actionsEl" v-show="hud.phase === 'play'" :class="{ touch: !desk }")
    //- FIRE (touch): a knob, like a gamepad's right stick. Press to shoot,
    //- hold to charge (the ring round it fills), let go to fire the charge —
    //- at anything, with nothing in sight (a crate, a barrel), where a press
    //- on the view only fires near a machine. Dragging it looks around (one
    //- fixed sensitivity, inside its housing or out) and keeps the charge.
    button.act.fire(
      v-if="!desk"
      ref="fireBtn"
      type="button"
      :class="[{ held: fireDown, cue: chargeCue }, demoClass('fire')]"
      :aria-label="t('combat.fire')"
      @pointerdown.prevent.stop="fireStart"
      @pointermove.prevent.stop="fireDrag"
      @pointerup.prevent.stop="fireEnd"
      @pointercancel.prevent.stop="fireEnd"
    )
      //- Crosshair ticks on the housing: "this one shoots", at a glance.
      span.fire-ticks(aria-hidden="true")
      //- The charge, round the housing: level 1, then the full charge, gold
      //- in the PERFECT window (the crosshair's colours).
      svg.fire-charge(viewBox="0 0 100 100" aria-hidden="true")
        circle.fc-track(cx="50" cy="50" r="46")
        circle.fc-l1(ref="fcL1" cx="50" cy="50" r="46")
        circle.fc-l2(ref="fcL2" cx="50" cy="50" r="46")
      span.fire-knob(ref="fireKnob")
        FireGlyph.fire-glyph
      span.demo-finger(v-if="demoOn('fire')" aria-hidden="true")
        InputGlyph(kind="finger" :mode="hud.holoDown || hud.chargeShow === 'hold' ? 'hold' : 'tap'")
      //- The charge show: the game holds this button for the player (`hud.chargeShow`).
      span.cue-arrows(v-if="chargeCue" aria-hidden="true")
        span.cue-arrow(v-for="i in 3" :key="i" :class="`a${i}`")
    button.act.block(
      type="button"
      :class="[{ held: hud.blockHeld, cue: hud.blockCue }, demoClass('block')]"
      :aria-label="t('combat.block')"
      @pointerdown.prevent.stop="blockDown"
      @pointerup.prevent.stop="blockUp"
      @pointercancel.prevent.stop="blockUp"
      @pointerleave="blockUp"
    )
      GameIcon(name="shield")
      KeyCap.kc(v-if="desk" code="MouseRight")
      span.demo-finger(v-if="demoOn('block')" aria-hidden="true")
        InputGlyph(kind="finger" :mode="hud.holoDown ? 'hold' : 'tap'")
      CoachRing(:hint="touchHint('parry') ?? touchHint('block') ?? urgentBlock" side="rim")
      //- The block lesson's held shot: press it now, once (`hud.blockCue`).
      PressCue.press-over(v-if="hud.blockCue")
    //- The cooldown is a clock wipe that shrinks away with the seconds left in
    //- the middle, and the button pops when it is back — the same on a phone
    //- (under the thumb) and on a desktop. Short of power it says so instead:
    //- the energy bolt on it blinks red. (A plain grey-out read as "broken".)
    button.act.slide(
      ref="slideBtn"
      type="button"
      :class="[{ cooling: slideCooling, low: hud.slidePowerLow, ready: slideFlash, cue: hud.slideCue }, demoClass('slide')]"
      :aria-label="t('combat.slide')"
      @pointerdown.prevent.stop="slide"
    )
      GameIcon(name="dodge")
      span.cd(aria-hidden="true")
      span.cd-num(ref="slideNum" aria-hidden="true")
      span.low-bolt(v-if="hud.slidePowerLow" aria-hidden="true")
        GameIcon(name="bolt")
      KeyCap.kc(v-if="desk" code="Space")
      CoachRing(:hint="touchHint('slide')")
      span.demo-finger(v-if="demoOn('slide')" aria-hidden="true")
        InputGlyph(kind="finger" mode="tap")
      //- The slide lesson holds the Stomper's leap: three yellow arrows point
      //- here until the slide is pressed.
      span.cue-arrows(v-if="hud.slideCue" aria-hidden="true")
        span.cue-arrow(v-for="i in 3" :key="i" :class="`a${i}`")
    //- The Repair Gel: always on screen, as the resource it is. The gel in
    //- the flask and a pip per gel carried (hollow pips: room for more);
    //- dimmed while there is nothing to repair, glowing once there is.
    //- On touch it docks under the health bar (`HudBars`' slot): beside the
    //- fire knob it sat where the thumb drags to look and charge.
    Teleport(to="#hud-gel-slot" :disabled="!docked" defer)
      button.act.tank(
        ref="gelBtn"
        type="button"
        data-lesson="gel"
        :class="[gelClass, demoClass('tank'), { docked }]"
        :aria-label="t('combat.tankCount', { n: hud.tanks, max: gelCap })"
        @pointerdown.prevent.stop="tank"
      )
        span.gel-fill
        span.gel-ring(v-if="gelLesson")
        GameIcon(name="flask")
        span.gel-pips(v-show="!touchHint('tank')" aria-hidden="true")
          span.gel-pip(v-for="i in gelCap" :key="i" :class="{ on: i <= hud.tanks }")
        KeyCap.kc(v-if="desk" code="KeyH")
        CoachRing(:hint="touchHint('tank')")
    //- A gel found flies from the middle of the view into its button.
    span.gel-fly(ref="gelFly" aria-hidden="true")
      GameIcon(name="flask")
    template(v-for="(w, i) in hud.weapons" :key="i")
      button.act.weapon(
        v-if="w.id"
        type="button"
        :class="[`w${i}`, { off: !w.ready, lesson: hud.lesson?.id === 'weapon' && !hud.lesson.done && hud.lesson.slot === i + 1 }, i === 0 ? demoClass('weapon') : {}]"
        :style="{ '--wc': w.color }"
        :data-lesson="`weapon-${i + 1}`"
        :aria-label="t(`weapon.${w.id}.name`)"
        @pointerdown.prevent.stop="fire(i)"
      )
        span.w-orb
          GameIcon.w-mark(v-if="w.id" :name="weaponIcon(w.id)")
        span.w-cost {{ w.cost }}
        KeyCap.kc(v-if="desk" :code="`Digit${i + 1}`")
        CoachRing(v-if="i === 0" :hint="touchHint('weapon')")
        //- The weapon hologram presses this one (#109): a finger on it, in step.
        span.demo-finger(v-if="i === 0 && demoOn('weapon')" aria-hidden="true")
          InputGlyph(kind="finger" mode="tap")
        //- The weapon lesson on a phone or tablet (#130): three yellow arrows
        //- at the button to press, as the slide lesson's held leap does.
        span.cue-arrows(v-if="!desk && weaponCue(i)" aria-hidden="true")
          span.cue-arrow(v-for="k in 3" :key="k" :class="`a${k}`")
    //- The borrowed weapon (a capsule's, this mission only): its colour, a
    //- horseshoe of pips for the charges left, no energy cost. It pops in on
    //- the grant and pops out when its last charge is spent.
    Transition(name="borrow")
      button.act.weapon.w2(
        v-if="hud.borrowed.id || borrowPop"
        type="button"
        data-lesson="weapon-3"
        :class="borrowClass"
        :style="{ '--wc': hud.borrowed.color }"
        :aria-label="borrowLabel"
        @pointerdown.prevent.stop="fire(2)"
      )
        span.w-orb
          GameIcon.w-mark(v-if="hud.borrowed.id" :name="weaponIcon(hud.borrowed.id)")
        span.b-pips(aria-hidden="true")
          span.b-arm(v-for="i in hud.borrowed.max" :key="i" :style="{ transform: pipTurn(i) }")
            span.b-pip(:class="{ on: i <= hud.borrowed.shots }")
        KeyCap.kc(v-if="desk" code="Digit3")
        //- The first take in a profile: the coach's ring (a check once fired),
        //- and over the button its key or a tapping finger — that card stays
        //- off a fight; the ring on the button hides nothing.
        CoachRing(:hint="borrowHint")
        span.b-teach(v-if="borrowTeach && !hud.combat" aria-hidden="true")
          InputGlyph(v-if="desk" kind="key" code="Digit3")
          InputGlyph(v-else kind="finger" mode="tap")
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatTenths } from '@/utils/localeNumber'
import { addHudTicker, hud, hudLive } from '@/game/state/hud'
import { profile } from '@/game/state/profile'
import { currentMission, input } from '@/game/boot'
import { chargeInfo } from '@/game/sim/stats'
import GameIcon from '@/components/icons/GameIcon.vue'
import FireGlyph from './FireGlyph.vue'
import CoachRing from './CoachRing.vue'
import KeyCap from './KeyCap.vue'
import InputGlyph from './InputGlyph.vue'
import PressCue from './PressCue.vue'
import type { HintId, HintView } from '@/game/sim/coach'
import { WEAPON_ICON, type WeaponId } from '@/game/data/weapons'
import { TEACH_TIP } from '@/game/sim/borrowed'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

/**
 * Right-thumb cluster: FIRE (touch only — shoot / hold to charge, drag to
 * look), BLOCK (hold; tap it as a ring closes to parry) and SLIDE. These sit above the input surface, so their presses never reach the
 * fire/look gesture layer underneath.
 *
 * The Repair Gel button is inventory first. A playtester never understood why
 * a heal "appeared out of nowhere" at low health, or how many he had: it now
 * stays on screen with a pip per gel carried (and hollow ones for the room
 * left), the gel visible in the flask. At full health it is dimmed, not gone;
 * hurt, it glows; under half, it breathes. A gel found flies into it; one used
 * drains out of it (and pours into the health bar, `HudBars`).
 *
 * A borrowed weapon (`sim/borrowed.ts`) gets a third weapon button left of
 * the first slot, over the second, in its colour, with no energy cost on it:
 * a horseshoe of pips counts the charges left (numbers never needed), it
 * bounces on a refill and pops out with its last charge. The first one a
 * profile takes is taught the coach's way: a pulsing ring on the button, its
 * key or a tapping finger over it (not during a fight), a check once fired.
 */
/** A lesson hologram presses this button on its loop (`fx/lessonHologram.ts`):
 *  on a phone it lights in step, a finger on it — where the player's thumb
 *  will go (a desktop shows the key over the hologram, `LessonGlyph`). */
const demoNow = (act: string): boolean =>
  !desk.value && ((hud.holoAct === act && hud.holoDown) || (act === 'fire' && hud.chargeShow === 'hold'))
/** The charge show (`sim/chargeShow.ts`): the fire button bounces under
 *  yellow arrows while the game turns onto the drone and holds it down. */
const chargeCue = computed(() => hud.chargeShow === 'aim' || hud.chargeShow === 'hold')
/** The player's turn (the lesson's try): the button the lesson is about
 *  breathes until they have done it. The gel has its own ring. */
const TRY_ACT: Record<string, string> = { charge: 'fire', block: 'block', slide: 'slide' }
const tryNow = (act: string): boolean => (hud.trainPhase === 'try' || hud.trainPhase === 'intro') && TRY_ACT[hud.trainId] === act
/** The weapon lesson wants this slot pressed (#130). */
const weaponCue = (i: number): boolean => hud.lesson?.id === 'weapon' && !hud.lesson.done && hud.lesson.slot === i + 1
// The block lesson's held shot shows its own press glyph: no finger on the
// shield button then (a hologram's held finger read as "hold it").
const demoOn = (act: string): boolean => !(act === 'block' && hud.blockCue) && (demoNow(act) || (tryNow(act) && !desk.value))
const demoClass = (act: string) => (demoNow(act) ? { demo: true, 'demo-down': true } : tryNow(act) ? { demo: true, 'demo-try': true } : {})
/** A weapon's mark inside its orb (the same glyph as the results screen). */
const weaponIcon = (id: string) => WEAPON_ICON[id as WeaponId] ?? 'buster'
const { t, locale } = useI18n()
/** The coach glyph for a button, when it is teaching a touch player. */
const touchHint = (id: HintId) => hud.hints.find(h => h.id === id && h.family === 'touch')
/** The shield lesson rings the block button on desktop too, beside the card. */
const urgentBlock = computed(() => hud.hints.find(h => h.id === 'block' && h.urgent))
/** Mouse + keys: every button wears its key (the captured mouse has no cursor). */
const desk = computed(() => hud.device === 'mouse')

const blockDown = (e: PointerEvent) => {
  input.touched = true
  input.blockHeld = true
  input.blockPressed = true
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
}
const blockUp = () => {
  input.blockHeld = false
}
// ── Fire (touch): the knob ──
// Writes the same fire edges as a press on the view does in combat, so the
// sim cannot tell them apart: a shot on press, the charge while held, the
// charged shot on release. Free aim goes where the crosshair is.
//
// It is a stick as well (mobile playtests, 2026-10-08: a round button that
// also looked around read as neither): the knob follows the thumb inside its
// housing, and the view follows every move of the thumb at ONE fixed rate,
// the touch look's own, on both axes. (A thumb held past the rim used to
// keep turning the view, faster the further out: two speeds under one thumb,
// and the playtest called it uncontrollable.)
const fireDown = ref(false)
const fireBtn = ref<HTMLElement | null>(null)
const fireKnob = ref<HTMLElement | null>(null)
const fcL1 = ref<SVGCircleElement | null>(null)
const fcL2 = ref<SVGCircleElement | null>(null)
let fireId: number | null = null
let fireLastX = 0
let fireLastY = 0
/** The housing's centre and radius at the press (viewport px). */
let fireCX = 0
let fireCY = 0
let fireR = 1
/** How far the knob travels, as a share of the housing's radius. */
const KNOB_TRAVEL = 0.42
const fireStart = (e: PointerEvent) => {
  if (fireId !== null) return
  fireId = e.pointerId
  fireLastX = e.clientX
  fireLastY = e.clientY
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  fireCX = r.left + r.width / 2
  fireCY = r.top + r.height / 2
  fireR = Math.max(1, r.width / 2)
  input.touched = true
  input.anyPressed = true
  input.fireHeld = true
  input.firePressed = true
  fireDown.value = true
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
}
const fireDrag = (e: PointerEvent) => {
  if (e.pointerId !== fireId) return
  input.lookDX += e.clientX - fireLastX
  input.lookDY += e.clientY - fireLastY
  fireLastX = e.clientX
  fireLastY = e.clientY
}
const fireEnd = (e: PointerEvent) => {
  if (e.pointerId !== fireId) return
  fireId = null
  fireDown.value = false
  if (fireKnob.value) fireKnob.value.style.transform = ''
  if (input.fireHeld) {
    input.fireHeld = false
    input.fireReleased = true
  }
}

// ── The slide's cooldown ──
// Painted from the HUD ticker (`hudLive`, not reactive): the wipe's angle and
// the seconds change every frame, the classes only on their edges.
const slideBtn = ref<HTMLElement | null>(null)
const slideNum = ref<HTMLElement | null>(null)
const slideCooling = ref(false)
const slideFlash = ref(false)
let slideText = ''
let offSlideCd: (() => void) | null = null
const C_RING = 2 * Math.PI * 46
onMounted(() => {
  offSlideCd = addHudTicker(() => {
    knobStep()
    chargeStep()
    const cd = hudLive.slideCd
    const cooling = cd > 0.001
    if (cooling !== slideCooling.value) slideCooling.value = cooling
    if (!cooling) return
    slideBtn.value?.style.setProperty('--cd', String(Math.min(1, cd / Math.max(0.01, hudLive.slideCdMax))))
    const txt = cd >= 1 ? String(Math.ceil(cd)) : formatTenths(cd, locale.value)
    if (txt !== slideText && slideNum.value) {
      slideNum.value.textContent = txt
      slideText = txt
    }
  })
})
onUnmounted(() => offSlideCd?.())
/** The knob under the thumb (the view itself only follows the drag). */
const knobStep = (): void => {
  const k = fireKnob.value
  if (!k || fireId === null) return
  const dx = fireLastX - fireCX
  const dy = fireLastY - fireCY
  const d = Math.hypot(dx, dy)
  const ux = d > 0 ? dx / d : 0
  const uy = d > 0 ? dy / d : 0
  const travel = Math.min(d, fireR * KNOB_TRAVEL)
  k.style.transform = `translate(${(ux * travel).toFixed(1)}px, ${(uy * travel).toFixed(1)}px)`
}

/** The charge ring round the housing (`Crosshair`'s numbers). */
let fcState = ''
const chargeStep = (): void => {
  const a = fcL1.value
  const b = fcL2.value
  const btn = fireBtn.value
  if (!a || !b || !btn) return
  const m = currentMission()
  const c = m?.combat
  const info = m && c?.charging ? chargeInfo(c.charge, m.stats) : null
  const on = !!info && info.toL1 > 0.05
  a.style.strokeDashoffset = `${C_RING * (1 - (on ? info!.toL1 : 0))}`
  b.style.strokeDashoffset = `${C_RING * (1 - (on ? info!.toL2 : 0))}`
  const st = !on ? '' : info!.perfect ? 'perfect' : info!.level >= 2 ? 'full' : info!.level === 1 ? 'l1' : 'build'
  if (st !== fcState) {
    fcState = st
    btn.dataset.charge = st
  }
}

// Back in hand — off cooldown with the power for it: the button pops.
watch(() => hud.slideReady, (ready, was) => {
  if (ready && was === false) flash(slideFlash, 450)
})

const slide = () => {
  input.touched = true
  input.slideQueued = true
}
const tank = () => {
  input.touched = true
  input.tankQueued = true
  // Nothing to repair, or none carried: a shake — "not now", never "gone".
  if (hud.tanks <= 0 || hud.hp >= hud.maxHp) flash(gelDenied, 420)
}

// ── The Repair Gel as a resource ──
/** Pips: the capacity (Gel Capacity skill), or more if more are carried. */
const gelCap = computed(() => Math.max(1, hud.tanksMax, hud.tanks))
/** The gel lesson points at this button (`LessonLayer` draws its card). */
const gelLesson = computed(() => hud.lesson?.id === 'gel' && !hud.lesson.done)
const gelPop = ref(false)
const gelDenied = ref(false)
const gelDrain = ref<'' | 'drain' | 'drain-last'>('')
const gelClass = computed(() => [gelDrain.value, {
  empty: hud.tanks <= 0 && !gelDrain.value,
  stocked: hud.tanks > 0 && hud.hp >= hud.maxHp,
  want: hud.tanks > 0 && hud.hp > 0 && hud.hp < hud.maxHp * 0.5,
  lesson: gelLesson.value,
  pop: gelPop.value,
  denied: gelDenied.value
}])
const timers = new Set<number>()
const flash = (flag: { value: boolean }, ms: number): void => {
  flag.value = false
  requestAnimationFrame(() => {
    flag.value = true
    const id = window.setTimeout(() => { flag.value = false; timers.delete(id) }, ms)
    timers.add(id)
  })
}

const actionsEl = ref<HTMLElement | null>(null)
/** The health bar's gel slot is on the page (`HudBars`, before this in the
 *  HUD): on touch the gel docks there; without it, it stays in the cluster. */
const slotHere = ref(false)
onMounted(() => { slotHere.value = !!document.getElementById('hud-gel-slot') })
const docked = computed(() => !desk.value && slotHere.value)
const gelBtn = ref<HTMLElement | null>(null)
const gelFly = ref<HTMLElement | null>(null)
/** A gel gained in play flies in from the middle of the view, on an arc. */
const flyIn = (): void => {
  const fly = gelFly.value
  const btn = gelBtn.value
  const box = actionsEl.value
  if (!fly || !btn || !box || typeof fly.animate !== 'function') { flash(gelPop, 450); return }
  const a = box.getBoundingClientRect()
  const b = btn.getBoundingClientRect()
  const sx = window.innerWidth / 2 - a.left
  const sy = window.innerHeight * 0.45 - a.top
  const ex = b.left + b.width / 2 - a.left
  const ey = b.top + b.height / 2 - a.top
  const mx = (sx + ex) / 2
  const my = Math.min(sy, ey) - Math.min(90, window.innerHeight * 0.12)
  const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`
  const anim = fly.animate([
    { transform: at(sx, sy, 0.3), opacity: 0 },
    { transform: at(sx, sy, 1.6), opacity: 1, offset: 0.2 },
    { transform: at(sx, sy, 1.4), opacity: 1, offset: 0.34 },
    { transform: at(mx, my, 1.1), opacity: 1, offset: 0.68 },
    { transform: at(ex, ey, 0.6), opacity: 1 }
  ], { duration: 1000, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' })
  anim.onfinish = () => flash(gelPop, 450)
}
watch(() => hud.tanks, (n, prev) => {
  if (prev !== undefined && n > prev && hud.phase === 'play') flyIn()
})
// A gel used: it drains out of the flask (the last one leaves it empty).
watch(() => hud.gelUse, (n, prev) => {
  if (prev === undefined || n <= prev) return
  gelDrain.value = ''
  requestAnimationFrame(() => {
    gelDrain.value = profile.inv.tanks <= 0 ? 'drain-last' : 'drain'
    const id = window.setTimeout(() => { gelDrain.value = ''; timers.delete(id) }, 820)
    timers.add(id)
  })
})
onUnmounted(() => {
  for (const id of timers) clearTimeout(id)
  timers.clear()
})
const fire = (i: number) => {
  input.touched = true
  input.weaponQueued = (i + 1) as 1 | 2 | 3
}

// ── The borrowed weapon (`sim/borrowed.ts`) ──
/** Pips on a horseshoe round the button, open at the bottom where its key
 *  sits: the first at −150°, the last at +150°. */
const pipTurn = (i: number): string => {
  const n = hud.borrowed.max
  return `rotate(${n > 1 ? -150 + ((i - 1) * 300) / (n - 1) : 0}deg)`
}
const borrowLabel = computed(() => {
  const b = hud.borrowed
  return b.id ? t('combat.borrowed', { weapon: t(`weapon.${b.id}.name`), n: b.shots, max: b.max }) : ''
})
/** The last charge spent: the button stays a beat to pop out. */
const borrowPop = ref(false)
/** Charges back (a grant, a refill): the button bounces. */
const borrowGot = ref(false)
/** The first-take teach just learned: the coach's check, briefly. */
const borrowTaught = ref(false)
const borrowTeach = computed(() => hud.borrowed.teach && !!hud.borrowed.id)
const borrowHint = computed<HintView | undefined>(() => {
  if (!borrowTeach.value && !borrowTaught.value) return undefined
  // No pip row (goal 0): the card with the key stands where it would be;
  // the one use flashes the ring green and pops the check.
  const done = borrowTaught.value
  return { id: 'weapon', family: hud.device, count: 0, goal: 0, flash: done ? 1 : 0, done }
})
const borrowClass = computed(() => ({
  off: !hud.borrowed.ready && !borrowPop.value,
  lesson: borrowTeach.value,
  got: borrowGot.value,
  spent: borrowPop.value
}))
// Set before the render that drops the weapon (a pre-flush watcher), so the
// button never unmounts for a frame between its last charge and its pop.
watch(() => hud.borrowed.spent, (n, prev) => {
  if (prev === undefined || n <= prev) return
  borrowPop.value = true
  const id = window.setTimeout(() => { borrowPop.value = false; timers.delete(id) }, 460)
  timers.add(id)
})
watch(() => hud.borrowed.shots, (n, prev) => {
  if (prev !== undefined && n > prev && prev > 0) flash(borrowGot, 450)
})
watch(() => hud.borrowed.teach, (on, was) => {
  if (was && !on && profile.tips[TEACH_TIP]) flash(borrowTaught, 1100)
})
</script>

<style scoped lang="sass">
.actions
  position: absolute
  right: calc(env(safe-area-inset-right, 0px) + clamp(12px, 3.5vmin, 28px))
  bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(14px, 4vmin, 32px))
  width: clamp(130px, 32vmin, 210px)
  height: clamp(110px, 26vmin, 170px)
  pointer-events: none
.act
  position: absolute
  pointer-events: auto
  border-radius: 50%
  border: 3px solid #141a33
  color: #fff
  display: grid
  place-items: center
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), inset 0 -5px 0 rgba(0, 0, 0, 0.18), inset 0 4px 0 rgba(255, 255, 255, 0.35)
  touch-action: none
  -webkit-tap-highlight-color: transparent
  transition: transform 0.06s
  :deep(.game-icon)
    width: 52%
    height: 52%
    filter: drop-shadow(0 2px 0 rgba(20, 26, 51, 0.6))
.fire
  right: 0
  // Above the block button, on the edge the right thumb rests on.
  bottom: calc(clamp(76px, 17.5vmin, 110px) + clamp(44px, 10vmin, 60px) + 26px)
  width: clamp(64px, 14vmin, 88px)
  height: clamp(64px, 14vmin, 88px)
  background: radial-gradient(circle at 40% 30%, #ffe7a8, #ffb13c 45%, #e0621f)
  &.held
    transform: scale(0.92)
    background: radial-gradient(circle at 40% 30%, #ffffff, #ffe07a 50%, #ffb13c)
    box-shadow: 0 0 18px rgba(255, 216, 74, 0.85), inset 0 -3px 0 rgba(0, 0, 0, 0.15)
.block
  right: 0
  bottom: 0
  width: clamp(66px, 15vmin, 96px)
  height: clamp(66px, 15vmin, 96px)
  background: radial-gradient(circle at 40% 30%, #9fe6ff, #3cc8ff 45%, #1f7fd0)
  &.held
    transform: scale(0.92)
    background: radial-gradient(circle at 40% 30%, #ffffff, #7ff4ff 50%, #3cc8ff)
    box-shadow: 0 0 18px rgba(127, 244, 255, 0.8), inset 0 -3px 0 rgba(0, 0, 0, 0.15)
.slide
  right: clamp(72px, 17vmin, 108px)
  bottom: clamp(8px, 2vmin, 14px)
  width: clamp(48px, 11vmin, 68px)
  height: clamp(48px, 11vmin, 68px)
  background: radial-gradient(circle at 40% 30%, #c0d4ff, #6f8cff 45%, #3a4fc0)
  &:active
    transform: scale(0.9)
  // The clock wipe: the dark sector is the cooldown still to run, from 12
  // o'clock clockwise, shrinking to nothing.
  .cd
    position: absolute
    inset: 0
    border-radius: 50%
    background: conic-gradient(rgba(8, 12, 34, 0.74) calc(var(--cd, 0) * 1turn), transparent 0)
    display: none
    pointer-events: none
  .cd-num
    position: absolute
    inset: 0
    display: none
    place-items: center
    color: #ffffff
    font-family: var(--font-pixel)
    font-size: clamp(12px, 2.8vmin, 16px)
    text-shadow: 0 2px 0 #141a33, 0 0 6px #141a33
    pointer-events: none
  &.cooling
    .cd
      display: block
    .cd-num
      display: grid
    :deep(.game-icon)
      opacity: 0.35
  // Off cooldown, short of power: the bolt says what is missing.
  &.low
    filter: saturate(0.45) brightness(0.85)
  .low-bolt
    position: absolute
    right: -4px
    top: -4px
    width: 46%
    height: 46%
    padding: 4px
    box-sizing: border-box
    border-radius: 50%
    border: 2px solid #141a33
    background: #ff4d5e
    color: #ffffff
    animation: low-bolt 0.9s ease-in-out infinite
    :deep(.game-icon)
      width: 100%
      height: 100%
      opacity: 1
  &.ready
    animation: slide-ready 0.45s cubic-bezier(0.2, 1.8, 0.4, 1)
@keyframes slide-ready
  0%
    box-shadow: 0 0 0 0 rgba(160, 190, 255, 0.9)
  40%
    transform: scale(1.22)
    box-shadow: 0 0 0 10px rgba(160, 190, 255, 0)
@keyframes low-bolt
  50%
    transform: scale(1.15)
    filter: brightness(1.3)
// The Repair Gel: dark glass, the gel inside it (clipped from the top as it
// drains), the flask glyph over both, pips above for the gels carried.
.tank
  right: clamp(4px, 1vmin, 8px)
  bottom: clamp(76px, 17.5vmin, 110px)
  width: clamp(44px, 10vmin, 60px)
  height: clamp(44px, 10vmin, 60px)
  background: radial-gradient(circle at 40% 30%, #4a6663, #22333d 60%, #141c26)
  transition: transform 0.06s, box-shadow 0.3s, filter 0.3s
  &:active
    transform: scale(0.9)
  .gel-fill
    position: absolute
    inset: 0
    border-radius: 50%
    background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
    clip-path: inset(0 0 0 0)
    transition: clip-path 0.35s ease-out
  :deep(.game-icon)
    position: relative
  // None carried: the empty flask, faint.
  &.empty
    filter: grayscale(0.6) brightness(0.8)
    .gel-fill
      clip-path: inset(100% 0 0 0)
    :deep(.game-icon)
      opacity: 0.55
  // Carried, nothing to repair: in stock, not lit.
  &.stocked
    filter: saturate(0.6) brightness(0.9)
  // Hurt with a gel carried: it glows; under half it breathes.
  &:not(.empty):not(.stocked)
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 14px rgba(141, 255, 122, 0.6), inset 0 -5px 0 rgba(0, 0, 0, 0.18), inset 0 4px 0 rgba(255, 255, 255, 0.35)
  &.want:not(.lesson)
    animation: gel-want 1.1s ease-in-out infinite
  &.drain .gel-fill
    animation: gel-drain 0.8s ease-in-out
  &.drain-last .gel-fill
    animation: gel-drain-last 0.6s ease-in forwards
  &.pop
    animation: gel-pop 0.45s cubic-bezier(0.2, 1.8, 0.4, 1)
  &.denied
    animation: gel-denied 0.4s ease-in-out
  // The gel lesson: a white ring and a pulse, the flask breathing.
  &.lesson
    box-shadow: 0 0 0 4px #ffffff, 0 0 22px #8dff7a
    :deep(.game-icon)
      animation: lesson-breathe 0.9s ease-in-out infinite
.gel-ring
  position: absolute
  inset: -14%
  border-radius: 50%
  border: 4px solid #ffffff
  box-shadow: 0 0 14px rgba(141, 255, 122, 0.9)
  animation: gel-ring 1.1s ease-out infinite
  pointer-events: none
.gel-pips
  position: absolute
  left: 50%
  bottom: calc(100% + 5px)
  transform: translateX(-50%)
  display: flex
  gap: 3px
  pointer-events: none
.gel-pip
  width: clamp(7px, 1.5vmin, 9px)
  height: clamp(10px, 2.2vmin, 13px)
  border-radius: 4px
  border: 2px solid #141a33
  background: rgba(20, 26, 51, 0.55)
  transition: background 0.3s, box-shadow 0.3s, transform 0.3s
  &.on
    background: linear-gradient(#e6ffdc, #5fe07a 55%, #1f9a4a)
    box-shadow: 0 0 6px rgba(141, 255, 122, 0.75)
// The fly-in: starts at the middle of the view, lands on the button.
.gel-fly
  position: absolute
  left: 0
  top: 0
  width: clamp(40px, 9vmin, 56px)
  height: clamp(40px, 9vmin, 56px)
  padding: 18%
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
  box-shadow: 0 0 22px rgba(141, 255, 122, 0.9)
  color: #fff
  display: grid
  place-items: center
  opacity: 0
  pointer-events: none
  will-change: transform, opacity
  :deep(.game-icon)
    width: 100%
    height: 100%
    filter: drop-shadow(0 2px 0 rgba(20, 26, 51, 0.6))
.weapon
  width: clamp(46px, 10.5vmin, 62px)
  height: clamp(46px, 10.5vmin, 62px)
  background: radial-gradient(circle at 40% 30%, #ffffff, var(--wc) 50%, color-mix(in srgb, var(--wc) 55%, #141a33))
  &.w0
    right: clamp(64px, 15vmin, 96px)
    bottom: clamp(70px, 16vmin, 100px)
  &.w1
    right: clamp(120px, 27vmin, 170px)
    bottom: clamp(30px, 7vmin, 46px)
  &:active
    transform: scale(0.9)
  &.off
    filter: grayscale(0.75) brightness(0.7)
  .w-orb
    display: grid
    place-items: center
    width: 44%
    height: 44%
    border-radius: 50%
    background: radial-gradient(circle, #ffffff 0%, var(--wc) 70%)
    box-shadow: 0 0 10px var(--wc)
  .w-mark
    width: 78%
    height: 78%
    color: #141a33
    opacity: 0.85
  .w-cost
    position: absolute
    left: -4px
    top: -6px
    min-width: 20px
    height: 20px
    padding: 0 4px
    border-radius: 10px
    background: #141a33
    color: #fff
    font-family: var(--font-pixel)
    font-size: 8px
    line-height: 20px
    text-align: center
// The key that works this button on a keyboard, tucked on its rim.
.kc
  position: absolute
  left: 50%
  bottom: -0.55em
  transform: translateX(-50%)
  font-size: clamp(11px, 2.3vmin, 14px)
  pointer-events: none
// The weapon lesson: the button to press breathes (on a child, so no
// class churn on the button can clobber the animation).
.weapon.lesson .w-orb
  animation: lesson-breathe 0.9s ease-in-out infinite
.weapon.lesson
  box-shadow: 0 0 0 4px #ffffff, 0 0 22px var(--wc)
// The borrowed weapon: left of the first slot, over the second — the three
// weapon buttons make one block — low enough to stay out of the coach's
// look and fire glyphs on a landscape phone; a glow in its colour so it
// reads as "extra", pips round it for the charges left.
.weapon.w2
  right: clamp(120px, 27vmin, 170px)
  bottom: clamp(88px, 20vmin, 126px)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 14px var(--wc), inset 0 -5px 0 rgba(0, 0, 0, 0.18), inset 0 4px 0 rgba(255, 255, 255, 0.35)
  &.lesson
    box-shadow: 0 0 0 4px #ffffff, 0 0 22px var(--wc)
  &.got
    animation: gel-pop 0.45s cubic-bezier(0.2, 1.8, 0.4, 1)
  &.spent
    animation: borrow-spent 0.45s ease-out forwards
    pointer-events: none
.b-pips
  position: absolute
  inset: calc(-1 * clamp(7px, 1.6vmin, 10px))
  pointer-events: none
.b-arm
  position: absolute
  inset: 0
.b-pip
  position: absolute
  left: 50%
  top: 0
  width: clamp(7px, 1.5vmin, 9px)
  height: clamp(7px, 1.5vmin, 9px)
  transform: translate(-50%, -50%)
  border-radius: 50%
  border: 2px solid #141a33
  background: rgba(20, 26, 51, 0.6)
  transition: background 0.2s, box-shadow 0.2s
  &.on
    background: radial-gradient(circle, #ffffff 25%, var(--wc) 75%)
    box-shadow: 0 0 5px var(--wc)
// The teach card: the key (3) or a tapping finger, over the button in
// portrait (clear of its pips), bobbing toward it.
.b-teach
  position: absolute
  left: 50%
  bottom: calc(100% + clamp(12px, 2.8vmin, 18px))
  width: clamp(38px, 8.5vmin, 52px)
  padding: 4px
  border-radius: 10px
  border: 2px solid #ffd84a
  background: rgba(20, 26, 51, 0.72)
  box-shadow: 0 0 12px rgba(255, 216, 74, 0.55)
  transform: translateX(-50%)
  animation: borrow-nudge 1.1s ease-in-out infinite
  pointer-events: none
  :deep(.glyph)
    display: block
    width: 100%
    height: auto
.borrow-enter-active
  animation: borrow-in 0.5s cubic-bezier(0.2, 1.8, 0.4, 1)
.borrow-leave-active
  transition: opacity 0.15s
.borrow-leave-to
  opacity: 0
@keyframes borrow-in
  from
    transform: scale(0)
  60%
    transform: scale(1.3)
@keyframes borrow-spent
  0%
    transform: scale(1)
    filter: brightness(1)
    opacity: 1
  30%
    transform: scale(1.3)
    filter: brightness(2.2)
    opacity: 1
  100%
    transform: scale(0.2)
    filter: brightness(2.2)
    opacity: 0
// ── Touch layout ─────────────────────────────────────────────────────────
// Phone playtests: the fire button sat on the screen's right edge, and a
// thumb holding it to charge and dragging right to look slid off the glass.
// Fire is now the big knob (the primary action), moved in by about one
// button, with nothing to its right but air above the shield. The slide is
// as big as the shield (a small dodge was missed under the thumb, 2026-10-08)
// and sits beside it on the bottom row; the gel docks under the health bar,
// and the weapon slots stand left of the knob, clear of its drag.
.actions.touch
  width: clamp(230px, 60vmin, 360px)
  height: clamp(170px, 42vmin, 250px)
  .fire
    right: clamp(58px, 15vmin, 96px)
    bottom: clamp(72px, 17vmin, 106px)
    width: clamp(96px, 23vmin, 136px)
    height: clamp(96px, 23vmin, 136px)
  .slide
    right: clamp(76px, 17.5vmin, 110px)
    bottom: 0
    width: clamp(66px, 15vmin, 96px)
    height: clamp(66px, 15vmin, 96px)
  .weapon.w0
    right: clamp(150px, 36vmin, 222px)
    bottom: clamp(4px, 1.5vmin, 12px)
  .weapon.w1
    right: clamp(162px, 41vmin, 248px)
    bottom: clamp(64px, 16vmin, 100px)
  .weapon.w2
    right: clamp(162px, 41vmin, 248px)
    bottom: clamp(118px, 29.5vmin, 170px)
// Portrait: the screen is narrow, the left 45 % is the stick's, so the
// weapon slots stack ABOVE the fire button instead of reaching left.
@media (max-aspect-ratio: 1/1)
  .actions.touch
    width: clamp(200px, 60vmin, 300px)
    height: clamp(250px, 62vmin, 360px)
    .weapon.w0
      right: clamp(80px, 21vmin, 124px)
      bottom: clamp(176px, 43vmin, 252px)
    .weapon.w1
      right: clamp(158px, 41vmin, 240px)
      bottom: clamp(140px, 36vmin, 210px)
    .weapon.w2
      right: clamp(14px, 4vmin, 24px)
      bottom: clamp(176px, 43vmin, 252px)
.act.demo
  box-shadow: 0 0 0 4px #ffd84a, 0 0 22px rgba(255, 216, 74, 0.9), inset 0 -5px 0 rgba(0, 0, 0, 0.18)
.act.demo-down
  transform: scale(0.9)
  filter: brightness(1.25)
// The player's turn: the ring breathes until they press it.
.act.demo-try
  animation: demo-try 1.1s ease-in-out infinite
@keyframes demo-try
  50%
    box-shadow: 0 0 0 7px #ffd84a, 0 0 34px rgba(255, 216, 74, 1), inset 0 -5px 0 rgba(0, 0, 0, 0.18)
@media (prefers-reduced-motion: reduce)
  .act.demo-try
    animation: none
// The slide lesson's held leap: the button bounces, three arrows at it.
.act.slide.cue, .act.block.cue, .act.fire.cue
  animation: cue-bounce 0.6s ease-in-out infinite
  z-index: 3
.act.weapon:has(.cue-arrows)
  z-index: 3
// The block lesson's held shot: the screen dims round the shield button, a
// lightbox with the button as its one lit hole (a playtester froze there,
// not seeing what to press).
.act.block.cue::before
  content: ''
  position: absolute
  inset: -10px
  z-index: -1
  border-radius: 50%
  box-shadow: 0 0 0 200vmax rgba(5, 7, 15, 0.62), 0 0 24px 6px rgba(255, 216, 74, 0.85)
  pointer-events: none
  animation: block-lightbox-in 0.35s ease-out both
@keyframes block-lightbox-in
  from
    opacity: 0
// The press glyph over a button (the block lesson's held shot).
.press-over
  position: absolute
  left: 50%
  bottom: calc(100% + 8px)
  width: 46px
  transform: translateX(-50%)
  pointer-events: none
@keyframes cue-bounce
  50%
    transform: translateY(-8px) scale(1.08)
.cue-arrows
  position: absolute
  inset: 0
  pointer-events: none
.cue-arrow
  position: absolute
  left: 50%
  top: 50%
  width: 0
  height: 0
  border-left: 17px solid transparent
  border-right: 17px solid transparent
  border-top: 30px solid #ffd84a
  filter: drop-shadow(0 0 6px rgba(255, 216, 74, 0.95)) drop-shadow(0 2px 0 rgba(20, 26, 51, 0.7))
  // Each arrow stands off the button on its own side, tip toward it.
  --r: rotate(0deg)
  transform: translate(-50%, -50%) var(--r) translateY(-70px)
  animation: cue-point 0.6s ease-in-out infinite
  &.a1
    --r: rotate(-50deg)
  &.a2
    --r: rotate(0deg)
  &.a3
    --r: rotate(50deg)
@keyframes cue-point
  50%
    transform: translate(-50%, -50%) var(--r) translateY(-56px)
@media (prefers-reduced-motion: reduce)
  .act.slide.cue, .act.block.cue, .act.fire.cue, .cue-arrow
    animation: none
.demo-finger
  position: absolute
  left: 55%
  top: 55%
  width: 70%
  pointer-events: none
  filter: drop-shadow(0 2px 0 rgba(20, 26, 51, 0.6))
// ── The fire knob ──
// The housing: dark glass with an orange rim (the fire colour), the sight's
// ticks on it, the charge ring round it; the knob: the orange cap the thumb
// rests on, the charged shot drawn on it.
.actions.touch .fire
  background: radial-gradient(circle, rgba(20, 26, 51, 0.5) 0%, rgba(20, 26, 51, 0.72) 70%)
  border: 3px solid #ffb13c
  box-shadow: 0 0 14px rgba(255, 177, 60, 0.45), inset 0 0 14px rgba(255, 177, 60, 0.25)
  &.held
    transform: none
    background: radial-gradient(circle, rgba(20, 26, 51, 0.55) 0%, rgba(20, 26, 51, 0.8) 70%)
    box-shadow: 0 0 22px rgba(255, 216, 74, 0.8), inset 0 0 14px rgba(255, 216, 74, 0.35)
.fire-knob
  position: absolute
  left: 50%
  top: 50%
  width: 66%
  height: 66%
  margin: -33% 0 0 -33%
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #ffe7a8, #ffb13c 45%, #e0621f)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), inset 0 -4px 0 rgba(0, 0, 0, 0.18), inset 0 3px 0 rgba(255, 255, 255, 0.4)
  display: grid
  place-items: center
  pointer-events: none
  will-change: transform
  .held &
    background: radial-gradient(circle at 40% 30%, #ffffff, #ffe07a 50%, #ffb13c)
.fire-glyph
  width: 86%
  height: 86%
.fire-charge
  position: absolute
  inset: -7%
  width: 114%
  height: 114%
  pointer-events: none
  overflow: visible
  circle
    fill: none
    transform: rotate(-90deg)
    transform-origin: 50% 50%
    stroke-linecap: round
    stroke-dasharray: 289.03
    stroke-dashoffset: 289.03
  .fc-track
    stroke: transparent
    stroke-dashoffset: 0
  .fc-l1
    stroke: #c8ff7a
    stroke-width: 5
  .fc-l2
    stroke: #7ff4ff
    stroke-width: 5
.fire[data-charge='full'] .fc-l2
  filter: drop-shadow(0 0 4px #7ff4ff)
.fire[data-charge='perfect'] .fc-l2, .fire[data-charge='perfect'] .fc-l1
  stroke: #ffd84a
  filter: drop-shadow(0 0 6px #ffd84a)
.fire[data-charge='full'] .fire-knob, .fire[data-charge='perfect'] .fire-knob
  box-shadow: 0 0 16px #7ff4ff, inset 0 -4px 0 rgba(0, 0, 0, 0.18), inset 0 3px 0 rgba(255, 255, 255, 0.4)
// Docked under the health bar (touch): in the bar column's flow.
.act.tank.docked
  position: relative
  right: auto
  bottom: auto
  width: clamp(44px, 10vmin, 58px)
  height: clamp(44px, 10vmin, 58px)
.fire-ticks
  position: absolute
  inset: 3%
  border-radius: 50%
  pointer-events: none
  // Four short ticks at 12, 3, 6 and 9 o'clock: a sight, drawn as gradients.
  background: linear-gradient(#ffb13c, #ffb13c) top center / 3px 12% no-repeat, linear-gradient(#ffb13c, #ffb13c) bottom center / 3px 12% no-repeat, linear-gradient(#ffb13c, #ffb13c) left center / 12% 3px no-repeat, linear-gradient(#ffb13c, #ffb13c) right center / 12% 3px no-repeat
  opacity: 0.9
// Landscape: the card beside the button, toward the middle — above it, it
// would meet the coach's look glyph on a short screen (in portrait, beside
// it, the move glyph's ∞).
@media (min-aspect-ratio: 1/1)
  .b-teach
    left: auto
    right: calc(100% + clamp(10px, 2.4vmin, 16px))
    bottom: auto
    top: 50%
    transform: translateY(-50%)
    animation-name: borrow-nudge-side
@keyframes borrow-nudge
  50%
    transform: translate(-50%, 4px)
@keyframes borrow-nudge-side
  50%
    transform: translate(4px, -50%)
@keyframes lesson-breathe
  50%
    transform: scale(1.35)
@keyframes gel-want
  50%
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 26px rgba(141, 255, 122, 0.95), inset 0 -5px 0 rgba(0, 0, 0, 0.18), inset 0 4px 0 rgba(255, 255, 255, 0.35)
// Drains from the top, then the next gel slides up into the flask.
@keyframes gel-drain
  0%
    clip-path: inset(0 0 0 0)
  45%, 60%
    clip-path: inset(100% 0 0 0)
  100%
    clip-path: inset(0 0 0 0)
@keyframes gel-drain-last
  from
    clip-path: inset(0 0 0 0)
  to
    clip-path: inset(100% 0 0 0)
@keyframes gel-pop
  40%
    transform: scale(1.25)
@keyframes gel-denied
  20%
    transform: translateX(-5px)
  40%
    transform: translateX(4px)
  60%
    transform: translateX(-3px)
  80%
    transform: translateX(2px)
@keyframes gel-ring
  from
    transform: scale(0.95)
    opacity: 1
  to
    transform: scale(1.4)
    opacity: 0
@media (prefers-reduced-motion: reduce)
  .tank.want:not(.lesson), .tank.pop, .tank.denied, .gel-ring, .tank.lesson :deep(.game-icon)
    animation: none
  .weapon.w2.got, .b-teach, .borrow-enter-active
    animation: none
</style>
