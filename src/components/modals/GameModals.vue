<template lang="pug">
  ResultsModal
  DefeatModal
  PauseModal(@options="emit('options')")
  ControlsIntroModal
  EnglishVoiceModal
  LevelUpModal
  OptionsModal(
    :is-open="optionsOpen"
    :can-replay-intro="canReplayIntro"
    @close="emit('closeOptions')"
    @replay-intro="emit('replayIntro')"
  )
</template>

<script setup lang="ts">
import ResultsModal from '@/components/modals/ResultsModal.vue'
import DefeatModal from '@/components/modals/DefeatModal.vue'
import PauseModal from '@/components/modals/PauseModal.vue'
import ControlsIntroModal from '@/components/modals/ControlsIntroModal.vue'
import EnglishVoiceModal from '@/components/modals/EnglishVoiceModal.vue'
import LevelUpModal from '@/components/modals/LevelUpModal.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'

defineProps<{ optionsOpen: boolean; canReplayIntro: boolean }>()
const emit = defineEmits<{ options: []; closeOptions: []; replayIntro: [] }>()
</script>
