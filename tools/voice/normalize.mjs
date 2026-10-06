// Text a TTS model reads the way a person would: numbers as words, capitals
// that mean "say it LOUD" turned back into words (a model reads "ME" or "ON"
// as letters), and one kind of ellipsis. German needs this more than the
// choice of model: a model that sees "13" may say it in English.
//
// The capitalised words are returned as `emphasis`, so an engine that takes a
// written direction can be told to stress them.

const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const DE_ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']
const ES_ONES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const ES_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** Chinese 0–999: 十一 (not 一十一), 二十, 一百零五, 三百二十. */
const zhNumber = (n) => {
  if (n < 10) return ZH_DIGITS[n]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const o = n % 10
    return `${t === 1 ? '' : ZH_DIGITS[t]}十${o ? ZH_DIGITS[o] : ''}`
  }
  const h = Math.floor(n / 100)
  const r = n % 100
  if (!r) return `${ZH_DIGITS[h]}百`
  return `${ZH_DIGITS[h]}百${r < 10 ? '零' : ''}${r < 10 ? ZH_DIGITS[r] : (r < 20 ? '一' : '') + zhNumber(r)}`
}

/** 0–999 as words; anything larger stays digits (no line needs it). */
export const numberWords = (n, lang) => {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
  if (lang === 'zh') return zhNumber(n)
  if (lang === 'es') {
    if (n < 30) return ES_ONES[n]
    if (n < 100) {
      const o = n % 10
      return ES_TENS[Math.floor(n / 10)] + (o ? ` y ${ES_ONES[o]}` : '')
    }
    if (n === 100) return 'cien'
    const r = n % 100
    return ES_HUNDREDS[Math.floor(n / 100)] + (r ? ` ${numberWords(r, lang)}` : '')
  }
  if (lang === 'de') {
    if (n < 20) return DE_ONES[n]
    if (n < 100) {
      const o = n % 10
      const t = DE_TENS[Math.floor(n / 10)]
      return o ? `${o === 1 ? 'ein' : DE_ONES[o]}und${t}` : t
    }
    const h = Math.floor(n / 100)
    const r = n % 100
    return `${h === 1 ? 'ein' : DE_ONES[h]}hundert${r ? numberWords(r, lang) : ''}`
  }
  if (n < 20) return EN_ONES[n]
  if (n < 100) {
    const o = n % 10
    return EN_TENS[Math.floor(n / 10)] + (o ? `-${EN_ONES[o]}` : '')
  }
  const r = n % 100
  return `${EN_ONES[Math.floor(n / 100)]} hundred${r ? ` and ${numberWords(r, lang)}` : ''}`
}

const PERCENT = { en: 'percent', de: 'Prozent', es: 'por ciento' }
/** Vex's first body, "Dr. Vex Mk-I": said as a word, not spelled. */
const MARK_ONE = { en: 'Mark One', de: 'Mark Eins', es: 'Mark Uno', zh: 'Mark 一号' }

/** "25 %" as said: Chinese puts the per-cent first (百分之二十五). */
const percent = (n, lang) => (lang === 'zh' ? `百分之${numberWords(n, lang)}` : `${numberWords(n, lang)} ${PERCENT[lang] ?? PERCENT.en}`)

/** A word in capitals (two letters or more, any script with case), maybe hyphenated: "SICK", "Im-POSSIBLE". */
const CAPS = /\p{Lu}{2,}(?:-\p{Lu}{2,})*/gu

/** "SCHROTTBRECHER" → "Schrottbrecher": a capital first letter keeps names
 *  ("Blaze Master") and German nouns right, and costs nothing in speech. */
const unshout = (w) => w[0] + w.slice(1).toLowerCase()

/** The text as the model should read it, and the words it should stress. */
export const normalize = (text, lang) => {
  const emphasis = []
  let t = text
    .replace(/…|\.{3}/g, '...')
    .replace(/\bMk-I\b/g, MARK_ONE[lang] ?? MARK_ONE.en)
    .replace(/(\d+)\s*%/g, (_, n) => percent(+n, lang))
    .replace(/\d+/g, (n) => numberWords(+n, lang))
  t = t.replace(CAPS, (w, offset) => {
    emphasis.push(w.toLowerCase())
    // The tail of a word ("Im-POSSIBLE", "Un-MÖGLICH") stays lower case.
    if (t[offset - 1] === '-') return w.toLowerCase()
    return w.split('-').map(unshout).join('-')
  })
  return { text: t.replace(/\s+/g, ' ').trim(), emphasis }
}
