<template lang="pug">
  div.cheat-layer
    Transition(name="cheat-toast")
      div.cheat-toast(v-if="cheatUi.toast" :key="cheatUi.toastAt" role="status") {{ t(cheatUi.toast) }}
    CheatModal(v-if="cheatUi.open")
</template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CheatModal from '@/components/modals/CheatModal.vue'
import { cheatUi } from '@/use/useCheats'

/**
 * The cheat UI (#Cheat1): the toast that confirms a typed "cmonc", and the
 * cheat panel on ctrl+shift+alt+F1. Mounted by App.vue only while cheats are
 * on (or the toast says they just went off). The panel is a static import:
 * the obfuscator breaks dynamic imports (tests/meta/lazyImports.test.ts).
 */
const { t } = useI18n()

let timer: ReturnType<typeof setTimeout> | null = null
watch(() => cheatUi.toastAt, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { cheatUi.toast = '' }, 2600)
}, { immediate: true })
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped lang="sass">
.cheat-toast
  position: fixed
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + 0.75rem)
  transform: translateX(-50%)
  z-index: 10000
  padding: 0.5rem 1rem
  border-radius: 0.6rem
  background: rgba(14, 18, 32, 0.92)
  border: 1px solid #ffd447
  color: #ffd447
  font-family: var(--font-ui)
  font-size: 0.95rem
  pointer-events: none
  max-width: calc(100vw - 2rem)
  text-align: center
.cheat-toast-enter-active, .cheat-toast-leave-active
  transition: opacity 0.25s
.cheat-toast-enter-from, .cheat-toast-leave-to
  opacity: 0
</style>
