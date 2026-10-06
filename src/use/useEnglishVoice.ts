import { ref, watch } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { ENGLISH_VOICE_KEY } from '@/keys'

/**
 * English voice-over for players whose language has no voice-over of its own
 * (`game/audio/voice.ts` VOICED). Hearing a language you did not choose is a
 * disconnect, so it is never assumed: until the player answers the question
 * after their first landing (`EnglishVoiceModal.vue`), the characters only
 * speak in their bubbles. `null` = not asked yet; Options → Gameplay changes
 * it later.
 */
const readPersisted = (): boolean | null => {
  const v = getState<boolean | null>(ENGLISH_VOICE_KEY, null)
  return typeof v === 'boolean' ? v : null
}

export const englishVoice = ref<boolean | null>(readPersisted())

/** The UI locale has a voice-over of its own: English, German, Spanish,
 *  Chinese (zh-TW hears the Mandarin one). Keep in step with `VoiceLang`. */
export const hasOwnVoice = (locale: string | null | undefined): boolean =>
  /^(|en|de|es|zh)([-_].*)?$/i.test(locale ?? '')

// A cloud save that lands after boot carries the player's answer too.
watch(saveDataVersion, () => {
  const v = readPersisted()
  if (v !== englishVoice.value) englishVoice.value = v
})

export const setEnglishVoice = (next: boolean): void => {
  englishVoice.value = next
  setState(ENGLISH_VOICE_KEY, next)
}
