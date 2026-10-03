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

/** 0–999 as words; anything larger stays digits (no line needs it). */
export const numberWords = (n, lang) => {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
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

const PERCENT = { en: 'percent', de: 'Prozent' }
/** Vex's first body, "Dr. Vex Mk-I": said as a word, not spelled. */
const MARK_ONE = { en: 'Mark One', de: 'Mark Eins' }

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
    .replace(/(\d+)\s*%/g, (_, n) => `${numberWords(+n, lang)} ${PERCENT[lang]}`)
    .replace(/\d+/g, (n) => numberWords(+n, lang))
  t = t.replace(CAPS, (w, offset) => {
    emphasis.push(w.toLowerCase())
    // The tail of a word ("Im-POSSIBLE", "Un-MÖGLICH") stays lower case.
    if (t[offset - 1] === '-') return w.toLowerCase()
    return w.split('-').map(unshout).join('-')
  })
  return { text: t.replace(/\s+/g, ' ').trim(), emphasis }
}
