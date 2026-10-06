<template lang="pug">
  FModal.english-voice(
    :model-value="open"
    :title="t('voiceOffer.title')"
    :close-on-backdrop="false"
    @update:model-value="(v) => !v && answer(false)"
  )
    p.body {{ t('voiceOffer.body') }}
    template(#footer)
      div.actions
        FButton(type="secondary" :label="t('voiceOffer.no')" @click="answer(false)")
        FButton(type="primary" :label="t('ok')" @click="answer(true)")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import { flow } from '@/game/flow'
import { setEnglishVoice } from '@/use/useEnglishVoice'

/**
 * Once, right after the first landing (the tutorial's first room for a new
 * player, the next mission for one who finished it before this was asked),
 * for a player whose language has no voice-over: hear the characters in
 * English, or only read them. The game is frozen under it like under any
 * modal, so the first lesson and Atlas's briefing wait for the answer.
 * Only the X ("no") and the two buttons close it: a stray tap beside it must
 * not decide for the player. Options → Gameplay changes it later.
 */
const { t } = useI18n()
const open = computed(() => flow.modal === 'englishVoice')
const answer = (yes: boolean) => {
  setEnglishVoice(yes)
  if (flow.modal === 'englishVoice') flow.modal = ''
}
</script>

<style scoped lang="sass">
.body
  color: #fff
  font-family: var(--font-ui)
  line-height: 1.45
  margin: 0
  max-width: 34em
.actions
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 0.75rem
</style>
