<template lang="pug">
  span.keycap(:class="{ wide: bound === 'Space', mouse: bound === 'MouseRight' || bound === 'MouseLeft' }" aria-hidden="true")
    //- The space bar is a bar, the mouse buttons a mouse: shapes, never words.
    span.bar(v-if="bound === 'Space'")
    svg.mouse-ico(v-else-if="bound === 'MouseRight' || bound === 'MouseLeft'" viewBox="0 0 20 28")
      rect(x="1.5" y="1.5" width="17" height="25" rx="8.5" class="m-body")
      path(:d="bound === 'MouseLeft' ? 'M10 1.5 A8.5 8.5 0 0 0 1.5 10 L1.5 12 L10 12 Z' : 'M10 1.5 A8.5 8.5 0 0 1 18.5 10 L18.5 12 L10 12 Z'" class="m-hot")
      line(x1="10" y1="1.5" x2="10" y2="12" class="m-seam")
      line(x1="1.5" y1="12" x2="18.5" y2="12" class="m-seam")
    //- A taught alternate shares the cap: "1/Q" (#174).
    template(v-else)
      | {{ keyLabel(bound) }}
      template(v-if="alt")
        span.or /
        | {{ keyLabel(alt) }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { keyLabel } from '@/game/engine/keyLabels'
import { boundCode, shownAltCode } from '@/game/engine/keyBindings'

/**
 * A small inline keycap — "[E] Open" on a desktop prompt, "1" on a weapon
 * button. Sized in `em`, so it follows the text it sits in. The letter comes
 * from the player's keyboard layout (`keyLabels.ts`). Decorative for screen
 * readers: the button it sits in carries the sentence.
 */
const props = defineProps<{ code: string }>()
/** The key as bound now: the prompt was written with the DEFAULT key
 *  (`keyBindings.ts`), the player may have moved the action. */
const bound = computed(() => boundCode(props.code))
/** The action's taught alternate key, if any (`shownAltCode`). */
const alt = computed(() => shownAltCode(props.code))
</script>

<style scoped lang="sass">
.keycap
  display: inline-grid
  place-items: center
  min-width: 1.55em
  height: 1.55em
  padding: 0 0.3em
  border-radius: 0.34em
  background: #f4f7ff
  border: 2px solid #141a33
  box-shadow: 0 0.16em 0 #141a33
  color: #141a33
  font-family: var(--font-pixel)
  font-size: 0.72em
  line-height: 1
  text-shadow: none
  vertical-align: 0.12em
  flex: 0 0 auto
  &.wide
    min-width: 3.4em
  &.mouse
    min-width: 1.3em
    padding: 0.12em
.or
  margin: 0 0.1em
  opacity: 0.55
.bar
  width: 1.9em
  height: 0.28em
  border-radius: 0.14em
  background: #9aa6c8
.mouse-ico
  width: 0.9em
  height: 1.2em
.m-body
  fill: #f4f7ff
  stroke: #141a33
  stroke-width: 2.5
.m-hot
  fill: #ffd84a
.m-seam
  stroke: #141a33
  stroke-width: 2
</style>
