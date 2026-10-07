<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import GameIcon from '@/components/icons/GameIcon.vue'

interface Option {
  value: string | number
  label: string
  /** The label's own language (a language picker's autonyms): its font
   *  fallback and its uppercasing follow it, not the UI's language. */
  lang?: string
}

interface Props {
  modelValue: string | number
  options: Option[]
  placeholder?: string
  label?: string
  maxHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'SELECT...',
  maxHeight: '200px'
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const option = props.options.find(opt => opt.value === props.modelValue)
  return option ? option.label : props.placeholder
})
const selectedLang = computed(() => props.options.find(opt => opt.value === props.modelValue)?.lang)

/** The list opens upward when there is more room above, and never runs past
 *  the viewport: on a 640×360 phone the difficulty list ran under the
 *  Options footer and cut "SCHWER" off (playtest 2026-10-07). */
const openUp = ref(false)
const listMax = ref(props.maxHeight)
const compact = ref(false)
const fitList = (): void => {
  const el = dropdownRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // The box that clips it: the nearest scrolling ancestor (a modal's body),
  // else the viewport.
  let top = 0
  let bottom = window.innerHeight
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll' || o === 'hidden') {
      const b = p.getBoundingClientRect()
      top = Math.max(top, b.top)
      bottom = Math.min(bottom, b.bottom)
      break
    }
  }
  const below = bottom - r.bottom - 16
  const above = r.top - top - 16
  const want = parseFloat(props.maxHeight) || 200
  openUp.value = below < Math.min(want, 160) && above > below
  const room = Math.max(96, openUp.value ? above : below)
  listMax.value = `${Math.min(want, room)}px`
  // Short of room: tighter rows, so a short list still fits whole.
  compact.value = room < want
}
const toggle = () => {
  if (!isOpen.value) fitList()
  isOpen.value = !isOpen.value
}

const selectOption = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

// Close when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template lang="pug">
  div(class="relative w-full font-black" ref="dropdownRef")
    //- Label (Optional)
    div(v-if="label" class="label-text mb-1 ml-1 text-white uppercase italic tracking-wider") {{ label }}

    //- The Trigger (Styled like FButton)
    button(
      type="button"
      @click="toggle"
      class="group relative w-full inline-block cursor-pointer select-none transition-all duration-75 active:scale-[0.98] hover:scale-[1.02] touch-manipulation focus:outline-none"
    )
      //- 3D Shadow
      span(class="absolute inset-0 translate-y-[4px] rounded-2xl bg-[#1a2b4b]")

      //- Main Button Body
      span.f-select__body(class="relative flex items-center justify-between rounded-2xl border-[3px] border-[#0f1a30] bg-gradient-to-b from-[#ffcd00] to-[#f7a000]")
        //- Inner Top Shine
        span(class="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-white/25")

        //- Selected Text
        span.f-select__value(class="text relative block tracking-wide text-white uppercase truncate mr-2" :lang="selectedLang") {{ selectedLabel }}

        //- Arrow Icon
        span.f-select__caret-wrap(
          class="relative transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        )
          GameIcon.f-select__caret(name="down")

    //- The Dropdown Menu
    transition(name="pop")
      div(
        v-if="isOpen"
        class="absolute z-1 left-0 right-0 rounded-2xl border-[3px] border-[#0f1a30] bg-[#1a2b4b] shadow-2xl overflow-hidden"
        :class="openUp ? 'bottom-full mb-3' : 'mt-3'"
      )
        //- Scrollable Area
        div(
          class="custom-scrollbar overflow-y-auto p-2"
          :style="{ maxHeight: listMax }"
        )
          div(
            v-for="option in options"
            :key="option.value"
            @click="selectOption(option.value)"
            class="group/item relative mb-1 last:mb-0 cursor-pointer rounded-xl transition-all duration-75 active:scale-[0.97]"
            :class="[modelValue === option.value ? 'bg-[#50aaff]' : 'hover:bg-[#2266ff]', compact ? 'px-3 py-1.5' : 'p-3']"
          )
            //- Option Shine (only for selected/hover)
            span(class="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-white/10")

            span.f-select__option(class="text relative block text-white uppercase tracking-wide" :lang="option.lang") {{ option.label }}
</template>

<style scoped lang="sass">
// Fluid metrics replace the old fixed `text-sm md:text-lg` / `px-4 py-3` pairs
// so the control reads the same on a 320px phone and a 4K desktop, and the
// `min-height` floor guarantees a legal touch target in every layout.
.f-select__body
  min-height: 2.75rem
  min-width: clamp(6rem, 40vw, 9rem)
  padding: clamp(0.4rem, 1.8vw, 0.75rem) clamp(0.6rem, 3vw, 1.1rem)

// The caret is the shared `down` chevron now — solid like the rest of the set,
// rather than the last stroked glyph left in the UI. Sized here because
// `GameIcon` deliberately fills whatever box the caller gives it.
// Nested to outrank `GameIcon`'s own `.game-icon` rule, which carries the same
// specificity a flat class selector would — on a tie the winner is whichever
// stylesheet the bundler emitted last.
.f-select__caret-wrap
  flex: 0 0 auto
  color: #fff

  .f-select__caret
    width: 1.25rem
    height: 1.25rem
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 1))

.f-select__value
  font-size: clamp(0.7rem, 3vw, 1.05rem)

.f-select__option
  font-size: clamp(0.7rem, 3vw, 1rem)

.label-text
  font-size: clamp(0.75rem, 3.2vw, 1.1rem)

.text, .label-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

/* Custom Scrollbar for that game feel */
.custom-scrollbar
  &::-webkit-scrollbar
    width: 12px

  &::-webkit-scrollbar-track
    background: #0a1425
    border-radius: 10px
    margin: 8px

  &::-webkit-scrollbar-thumb
    background: #50aaff
    border: 3px solid #0f1a30
    border-radius: 10px

    &:hover
      background: #2266ff

/* Transition Animations */
.pop-enter-active, .pop-leave-active
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.1s

.pop-enter-from, .pop-leave-to
  opacity: 0
  transform: translateY(-10px) scale(0.95)
</style>