import en from '@/i18n/locales/en'
import { deriveVoiceLines, type VoiceLine } from './voiceCatalog'

/**
 * Every voice line the game has: the catalogue's detailed lines plus every
 * other text line of a speaker's section in the English locale
 * (`deriveVoiceLines`). The voice tools build the same list from the locale
 * they load (`tools/voice/lib.mjs`).
 */
export const VOICE_LINES: readonly VoiceLine[] = deriveVoiceLines(en)
