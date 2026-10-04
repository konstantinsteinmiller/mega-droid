<template lang="pug">
  Teleport(to="body")
    div.confirm-dialog(role="dialog" aria-modal="true" :aria-label="title" @pointerdown.self="emit('cancel')")
      div.box
        div.title {{ title }}
        p.body
          slot
        div.actions
          FButton(:type="danger ? 'danger' : 'primary'" :label="confirmLabel" @click="emit('confirm')")
          FButton(type="secondary" :label="t('cancel')" @click="emit('cancel')")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from './FButton.vue'

/**
 * A yes-or-no before something that cannot be undone (salvaging an item):
 * the question, what it costs, the action in its own colour, and Cancel.
 * A tap beside the box or Esc cancels; only the button confirms.
 */
defineProps<{ title: string; confirmLabel: string; danger?: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') { e.stopPropagation(); emit('cancel') }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<style scoped lang="sass">
.confirm-dialog
  position: fixed
  inset: 0
  z-index: 60
  display: grid
  place-items: center
  padding: 16px
  background: rgba(4, 6, 14, 0.7)
.box
  width: min(88vw, 420px)
  padding: 18px 20px
  border-radius: 16px
  background: #141a33
  border: 2px solid #9fd6ff
  display: flex
  flex-direction: column
  gap: 12px
  text-align: center
  color: #fff
  font-family: var(--font-ui)
.title
  font-size: clamp(17px, 3.6vmin, 22px)
.body
  margin: 0
  color: #dfe7ff
  font-size: clamp(13px, 2.8vmin, 16px)
  line-height: 1.35
.actions
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 10px
</style>
