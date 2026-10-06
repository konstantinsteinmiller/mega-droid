<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { sfx } from '@/game/audio/sfx'
import { acquireModalOpen } from '@/use/useModalState'

const { t } = useI18n()

interface Props {
  modelValue: boolean | any
  title?: string
  isClosable?: boolean
  /** A click on the backdrop closes it (with `isClosable`); false for a question
   *  that must be answered: only its X or its buttons close it. */
  closeOnBackdrop?: boolean
  tabs?: TabOption[]
  activeTab?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  isClosable: true,
  closeOnBackdrop: true,
  tabs: () => []
})

const emit = defineEmits(['update:modelValue', 'update:activeTab'])

// Root is a <Teleport>, so class/style passed by parents can't auto-inherit and
// Vue warns about extraneous attrs. Opt out and forward $attrs explicitly.
defineOptions({ inheritAttrs: false })



// ─── Header / content overlap ───────────────────────────────────────────────
//
// The ribbon header deliberately overhangs the frame's top edge (that's the
// look). Previously the content slot compensated with a hard-coded
// `pt-6 sm:pt-7 md:pt-9`, which is a guess: it was too small when the title
// wrapped to two lines or the tab row grew, and the first row of content ended
// up UNDER the ribbon.
//
// Now the header's real height is measured with a ResizeObserver and published
// as `--fmodal-header-overlap`. The content slot pads by exactly the amount the
// header actually overhangs, so an overlap is impossible at any viewport, in
// any language, at any font size.
const headerRef = ref<HTMLElement | null>(null)
const headerOverlap = ref(0)
let observer: ResizeObserver | null = null

/** How far the header dips INTO the frame, in px. The header sits above the
 *  frame and is pulled down by this much (see `--fmodal-header-dip`), so the
 *  content must clear exactly that plus a small breathing gap. */
const HEADER_DIP_RATIO = 0.55

const measureHeader = (): void => {
  const el = headerRef.value
  if (!el) { headerOverlap.value = 0; return }
  const h = el.getBoundingClientRect().height
  headerOverlap.value = h > 0 ? Math.round(h * HEADER_DIP_RATIO) : 0
}

const attachObserver = async (): Promise<void> => {
  await nextTick()
  if (!headerRef.value) return
  observer?.disconnect()
  observer = new ResizeObserver(measureHeader)
  observer.observe(headerRef.value)
  measureHeader()
}

// ─── Modal-open signal (CrazyGames gameplayStop/Start) ──────────────────────
// Centralised here so every FModal consumer participates without per-modal
// wiring. Refcounted; held once per open, dropped on close or unmount.
let releaseModalOpen: (() => void) | null = null
const markOpen = (): void => { if (!releaseModalOpen) releaseModalOpen = acquireModalOpen() }
const markClosed = (): void => { releaseModalOpen?.(); releaseModalOpen = null }

watch(() => props.modelValue, (open, prev) => {
  if (open && !prev) sfx('uiOpen')
  else if (!open && prev) sfx('uiClose')
  if (open) { markOpen(); void attachObserver() } else { markClosed(); observer?.disconnect() }
})

// Re-measure when the header's content changes (title text, tab set).
watch(() => [props.title, props.tabs?.length], () => { void nextTick(measureHeader) })

onMounted(() => {
  if (props.modelValue) { markOpen(); void attachObserver() }
})
onUnmounted(() => {
  markClosed()
  observer?.disconnect()
  observer = null
})

const close = (): void => emit('update:modelValue', false)
const handleTabChange = (val: string | number): void => emit('update:activeTab', val)
</script>

<template lang="pug">
  //- Teleport to body so `position: fixed` isn't trapped by an ancestor
  //- transform, which would promote that ancestor to a containing block.
  Teleport(to="body")
    Transition(
      name="pop"
      appear
      enter-active-class="transition-all duration-[380ms] ease-[cubic-bezier(0.18,0.89,0.32,1.28)]"
      leave-active-class="transition-all duration-[180ms] ease-[cubic-bezier(0.6,-0.28,0.735,0.045)]"
      enter-from-class="opacity-0 scale-90 translate-y-6"
      leave-to-class="opacity-0 scale-90 translate-y-6"
    )
      div.f-modal(
        v-if="modelValue"
        v-bind="$attrs"
        :style="{ '--fmodal-header-overlap': headerOverlap + 'px' }"
        role="dialog"
        aria-modal="true"
      )
        //- Backdrop
        div.f-modal__backdrop(@click="isClosable && closeOnBackdrop && close()")

        div.f-modal__container(:class="{ 'f-modal__container--tabbed': tabs && tabs.length > 0 }")
          //- Header (title ribbon or tab bar). Lives IN the layout flow so it
          //- can never be pushed above the viewport's top edge.
          div.f-modal__header(
            v-if="(tabs && tabs.length > 0) || title"
            ref="headerRef"
          )
            FTabs(
              v-if="tabs && tabs.length > 0"
              :model-value="activeTab"
              :options="tabs"
              @update:model-value="handleTabChange"
            )
            div.f-modal__ribbon(v-else-if="title")
              span.f-modal__ribbon-shadow(aria-hidden="true")
              span.f-modal__ribbon-body
                span.f-modal__ribbon-text {{ title }}

          //- Frame
          div.f-modal__frame-wrap
            span.f-modal__frame-shadow(aria-hidden="true")
            div.f-modal__frame
              button.f-modal__close(
                v-if="isClosable"
                type="button"
                :aria-label="t('close')"
                @click="close"
              )
                span.f-modal__close-shadow(aria-hidden="true")
                span.f-modal__close-body
                  GameIcon.f-modal__close-icon(name="close")

              //- Scrollable content. Top padding is the MEASURED header
              //- overhang plus a gap — never a guess.
              div.f-modal__content
                slot

              //- Footer — pinned, collapses out of layout when empty.
              div.f-modal__footer
                slot(name="footer")
</template>

<style scoped lang="sass">
.f-modal
  position: fixed
  inset: 0
  // Above the result overlay (`FReward`, z-100) and below the ad-blocker
  // explainer (z-150) and the splash (z-200). The shop is opened FROM the
  // result screen — at z-50 it rendered behind it and the player got a blurred
  // rectangle with the result buttons floating on top.
  z-index: 110
  display: flex
  align-items: center
  justify-content: center
  padding: calc(clamp(0.4rem, 2vw, 1rem) + env(safe-area-inset-top, 0px)) calc(clamp(0.4rem, 2vw, 1rem) + env(safe-area-inset-right, 0px)) calc(clamp(0.4rem, 2vw, 1rem) + env(safe-area-inset-bottom, 0px)) calc(clamp(0.4rem, 2vw, 1rem) + env(safe-area-inset-left, 0px))

.f-modal__backdrop
  position: absolute
  inset: 0
  background-color: rgba(0, 0, 0, 0.7)
  backdrop-filter: blur(4px)

.f-modal__container
  position: relative
  // Smaller on a small screen, the whole modal at once (`use/useUiScale.ts`).
  zoom: var(--ui-scale, 1)
  display: flex
  flex-direction: column
  width: 100%
  max-width: min(42rem, 96vw)
  max-height: 100%

// A tabbed modal keeps one height for every tab, so its tab bar stays put
// instead of jumping as a short tab re-centres it (playtest 2026-10-06).
.f-modal__container--tabbed
  height: min(36rem, 100%)

.f-modal__header
  position: relative
  z-index: 20
  display: flex
  flex-shrink: 0
  justify-content: center
  // The ribbon dips into the frame by HEADER_DIP_RATIO of its own height; the
  // negative margin removes that dip from the layout flow so the frame starts
  // underneath it.
  margin-bottom: calc(var(--fmodal-header-overlap, 0px) * -1)

.f-modal__ribbon
  position: relative
  max-width: 100%

.f-modal__ribbon-shadow
  position: absolute
  inset: 0
  transform: translateY(4px)
  border-radius: clamp(0.6rem, 2.6vw, 1rem)
  background-color: #1a2b4b

.f-modal__ribbon-body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  min-height: 2.25rem
  padding: clamp(0.3rem, 1.4vw, 0.6rem) clamp(1.1rem, 6vw, 2.75rem)
  border: 4px solid #0f1a30
  border-radius: clamp(0.6rem, 2.6vw, 1rem)
  background-image: linear-gradient(to bottom, #ffcd00, #f7a000)

.f-modal__ribbon-text
  color: #fff
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.05em
  text-align: center
  font-size: clamp(0.95rem, 4.4vw, 1.85rem)
  line-height: 1.15
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.f-modal__frame-wrap
  position: relative
  display: flex
  flex: 1 1 auto
  flex-direction: column
  // `min-height: 0` lets the inner scroll container actually scroll instead of
  // stretching the frame to fit its content.
  min-height: 0

.f-modal__frame-shadow
  position: absolute
  inset: 0
  transform: translateY(8px)
  border-radius: clamp(1rem, 5vw, 2.5rem)
  background-color: #0c1626

.f-modal__frame
  position: relative
  display: flex
  flex: 1 1 auto
  flex-direction: column
  min-height: 0
  border: 5px solid #0f1a30
  border-radius: clamp(0.9rem, 4.4vw, 2rem)
  background-color: #1a2b4b

.f-modal__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  overscroll-behavior: contain
  color: #fff
  text-align: center
  // The measured header overhang plus a breathing gap. This is the fix for the
  // "header overlaps the content" bug — it is derived, not guessed.
  padding-top: calc(var(--fmodal-header-overlap, 0px) + clamp(0.6rem, 2.4vw, 1.1rem))
  padding-bottom: clamp(0.4rem, 1.6vw, 0.75rem)
  padding-inline: clamp(0.5rem, 3vw, 1.5rem)

.f-modal__footer
  flex-shrink: 0
  display: flex
  justify-content: center
  gap: clamp(0.4rem, 2.4vw, 1rem)
  padding-bottom: clamp(0.4rem, 1.6vw, 0.75rem)
  padding-inline: clamp(0.5rem, 3vw, 1.5rem)

  &:empty
    display: none

.f-modal__close
  position: absolute
  top: 0
  right: 0
  z-index: 30
  // Overhang the frame corner, scaled with the viewport so it never collides
  // with the content on a small screen.
  translate: 28% -34%
  width: clamp(2.1rem, 8.5vw, 2.75rem)
  height: clamp(2.1rem, 8.5vw, 2.75rem)
  min-width: 2.1rem
  min-height: 2.1rem
  padding: 0
  border: 0
  background: none
  cursor: pointer
  -webkit-tap-highlight-color: transparent
  transition: transform 90ms ease-out

  &:active
    translate: 28% -30%
    scale: 0.92

.f-modal__close-shadow
  position: absolute
  inset: 0
  transform: translateY(3px)
  border-radius: clamp(0.4rem, 1.8vw, 0.65rem)
  background-color: #6b1212

.f-modal__close-body
  position: relative
  display: flex
  align-items: center
  justify-content: center
  width: 100%
  height: 100%
  border: 2px solid #0f1a30
  border-radius: clamp(0.4rem, 1.8vw, 0.65rem)
  background-color: #ff3e3e
  color: #fff

  // Nested to outrank `GameIcon`'s own `.game-icon` rule, which has the same
  // specificity a flat class selector would.
  .f-modal__close-icon
    width: 45%
    height: 45%

// ─── Short viewports (landscape phone, embedded iframe) ─────────────────────
// Claim the full short axis so the header is never pushed off-screen and the
// dead space above the modal collapses.
@media (max-height: 520px)
  .f-modal
    align-items: stretch
    padding-block: calc(0.3rem + env(safe-area-inset-top, 0px)) calc(0.3rem + env(safe-area-inset-bottom, 0px))

  .f-modal__container
    max-width: min(46rem, 98vw)
    max-height: 100%

  .f-modal__frame
    border-width: 3px

  .f-modal__ribbon-text
    font-size: clamp(0.85rem, 3.4vh, 1.2rem)
</style>
