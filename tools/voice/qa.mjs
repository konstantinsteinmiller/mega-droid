// Automatic QA for a finished take, so no line needs a listen by hand: the
// words came out (a Whisper read-back against the text the model was given),
// the take fits the line's max, the level is on target, nothing clips.
// `pickBest` chooses between the takes of one line.

import { pinyin } from 'pinyin-pro'
import { normalize } from './normalize.mjs'

// A Chinese character is a word of its own: the script has no spaces, so the
// word and letter rates below become character rates there ("Flux" stays one word).
const words = (s) => s.toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '') // ä → a: Whisper and the text may differ in accents only
  .replace(/ß/g, 'ss')
  .replace(/\p{Script=Han}/gu, ' $& ')
  .replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/[-']/g, ' ')
  .split(/\s+/).filter(Boolean)

const distance = (r, h) => {
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i]
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[h.length]
}

/** Word error rate of `hyp` against `ref` (edit distance over words / reference words). */
export const wer = (ref, hyp) => {
  const r = words(ref)
  const h = words(hyp)
  if (!r.length) return h.length ? 1 : 0
  return distance(r, h) / r.length
}

/** Letter error rate, spaces ignored: "Blaze Master" heard as "BLAZEMASTER" is right. */
export const cer = (ref, hyp) => {
  const r = [...words(ref).join('')]
  const h = [...words(hyp).join('')]
  if (!r.length) return h.length ? 1 : 0
  return distance(r, h) / r.length
}

/** How many letters differ, spaces ignored: one letter is a spelling ("Galegard"), two is another word ("Clubmeister"). */
export const letterEdits = (ref, hyp) => distance([...words(ref).join('')], [...words(hyp).join('')])

/** `overMax`: a take may run this far past its length budget before it fails;
 *  past the budget itself it passes with a warning. The budget is the line's
 *  max (a guide written for actors; the game's bubble waits for the file) or
 *  what its words need at a natural pace, whichever is longer. */
export const LIMITS = { wer: 0.1, cer: 0.06, lufs: 1.5, peak: -1, overMax: 1.5, wordsPerSecond: 2.6, charsPerSecondZh: 4.5, sentencePause: 0.3 }

/** How long a line may take: its max, or its words at a natural pace (+0.5 s)
 *  plus a breath at every sentence break ("Goldring. Elite. Vorsicht." is three
 *  words and two pauses); Chinese counts characters, about 4.5 a second. */
export const budgetFor = (text, max, lang = 'en') => {
  const breaks = Math.max(0, (text.trim().match(/[.!?…。！？]+(?=\s*\S)/gu) ?? []).length)
  return Math.max(max ?? 0, words(text).length / (lang === 'zh' ? LIMITS.charsPerSecondZh : LIMITS.wordsPerSecond) + 0.5 + LIMITS.sentencePause * breaks)
}

/** Whisper's spellings a TTS read cannot help: the cast's names, and homophones it picks the other way. */
const NAMES = [[/^(flucks|flocks|phlox|flax|flix|vlogs?|flugs)$/, 'flux'], [/^(w|v)(e|ä|a)(ch|k)?(x|chs|ks|cks|x)$/, 'vex'], [/^(atlass?|atlis)$/, 'atlas'],
  [/^weights$/, 'waits'], [/^vault$/, 'volt']]
const named = (w) => NAMES.reduce((x, [re, to]) => (re.test(x) ? to : x), w)

/** The cast's names as Whisper writes them in Chinese (the zh text keeps them in Latin letters). */
const ZH_NAMES = [[/弗[拉勒]?克斯|福克斯|弗洛克斯/g, ' flux '], [/[维韦薇]克斯/g, ' vex '], [/阿特拉斯/g, ' atlas '], [/高斯/g, ' gauss '], [/皮普/g, ' pip '], [/马克/g, ' mark ']]
const zhNamed = (s, lang) => (lang !== 'zh' ? s : ZH_NAMES.reduce((x, [re, to]) => x.replace(re, to), s))

/** Chinese as it sounds: each character its toneless pinyin syllable. Whisper
 *  writes homophones the other way all the time (它/他 tā, 再/在 zài, 滑/划 huá,
 *  旋/悬 xuán); the voice said the line right, so compare the sounds. */
const zhSounded = (s, lang) => (lang !== 'zh' ? s
  : s.replace(ZH_SOUNDS, ' ').replace(/\p{Script=Han}+/gu, (run) => ` ${pinyin(run, { toneType: 'none', type: 'array' }).join(' ')} `))

/** Chinese sound words (a hiss 嘶, a beep 哔, a huff 哼): a sound, not a word, which
 *  Whisper drops or writes as any syllable. Left out on both sides; one stray
 *  syllable in their place still passes (`oneWordAdded`). */
const ZH_SOUNDS = /[嘶哔哼呼哇哎哟嘿咦嗯呃噗嘀嘟]/gu

/** German as it sounds, for comparing: a final d/b/g is spoken t/p/k and a doubled consonant is one
 *  ("schmollt" and Whisper's "Schmold" are the same sound). */
const sounded = (w, lang) => (lang !== 'de' ? w
  : w.replace(/([b-df-hj-np-tv-xz])/g, '$1').replace(/d$/, 't').replace(/b$/, 'p').replace(/g$/, 'k').replace(/dt$/, 't'))

/** The read only ADDS one word to the text (an article, an "Ah"): every word of the line is there, in order. */
const oneWordAdded = (ref, hyp) => {
  const r = words(ref)
  const h = words(hyp)
  return h.length === r.length + 1 && h.some((_, i) => h.filter((__, j) => j !== i).join(' ') === r.join(' '))
}

/** Chinese: every word of the line is there, in order, and the only extra
 *  syllables are no more than the sound words left out (先嘶嘶响 heard as 先吸吸响). */
const soundsHeardAsWords = (raw, ref, hyp, lang) => {
  if (lang !== 'zh') return false
  const k = (raw.match(ZH_SOUNDS) ?? []).length
  const r = words(ref)
  const h = words(hyp)
  if (!k || h.length > r.length + k) return false
  let i = 0
  for (const w of h) if (w === r[i]) i++
  return i === r.length
}

/** Only the opening interjection differs ("Hmph." heard as "Mmm", "Pah." as "Ha"): the line itself is right. */
const onlyOpenerDiffers = (ref, hyp) => {
  const r = words(ref)
  const h = words(hyp)
  return r.length >= 3 && r.length === h.length && r.slice(1).join(' ') === h.slice(1).join(' ')
}

/**
 * Pass or fail, with the reasons. `take` = post.mjs's numbers plus `heard`
 * (the read-back) and `text` (what the model was given); `max` = the line's.
 * Short lines (≤ 3 words) allow one wrong word (Whisper mishears "Ouch!");
 * a wrong opening interjection is forgiven ("Mmm" for "Hmph"). `take.loose`
 * (barks, laughs) skips the word check.
 */
export const judge = (take, max) => {
  const reasons = []
  // What Whisper heard, as the model was told to say it: numbers as words, the names as written.
  const lang = take.lang ?? 'en'
  let heard = take.heard == null ? null : words(zhSounded(zhNamed(normalize(take.heard, lang).text, lang), lang)).map(named).map(w => sounded(w, lang)).join(' ')
  let text = words(zhSounded(zhNamed(take.text, lang), lang)).map(w => sounded(w, lang)).join(' ')
  // A line cut off mid-word on purpose ("something's in the—"): its last word is whatever was left of it.
  if (heard != null && /[—-]\s*$/.test(text)) {
    text = words(text).slice(0, -1).join(' ')
    heard = words(heard).slice(0, words(text).length).join(' ')
  }
  const e = heard == null ? null : wer(text, heard)
  const n = words(text).length
  if (take.loose) {
    // A bark or a laugh is a sound, not words: Whisper cannot read "Nnngh!" back. Only added speech fails it.
    if (heard != null && words(heard).length > n + 1) reasons.push(`words: heard "${take.heard}" (more than the sound)`)
  } else if (e != null && e > Math.max(LIMITS.wer, n <= 3 ? 1 / n : 0) && cer(text, heard) > LIMITS.cer && letterEdits(text, heard) > 1 && !oneWordAdded(text, heard) && !onlyOpenerDiffers(text, heard) && !soundsHeardAsWords(take.text, text, heard, lang)) {
    reasons.push(`words: heard "${take.heard}" (${Math.round(e * 100)} % off)`)
  }
  const budget = budgetFor(take.text, max, lang)
  if (max && take.seconds > budget * LIMITS.overMax + 0.001) reasons.push(`length ${take.seconds.toFixed(2)} s > ${LIMITS.overMax}× ${budget.toFixed(1)} s`)
  if (take.target?.lufs != null && take.lufs != null && Math.abs(take.lufs - take.target.lufs) > LIMITS.lufs) reasons.push(`loudness ${take.lufs} LUFS (target ${take.target.lufs})`)
  if (take.peak > LIMITS.peak) reasons.push(`peak ${take.peak} dBFS`)
  if (!(take.seconds > 0.15)) reasons.push('empty take')
  const warnings = max && take.seconds > budget + 0.001 && !reasons.some(r => r.startsWith('length')) ? [`long: ${take.seconds.toFixed(2)} s (budget ${budget.toFixed(1)} s)`] : []
  return { ok: reasons.length === 0, wer: e, reasons, warnings }
}

/** The take to ship: a passing one with the fewest wrong words, then the shortest; null when none passes. */
export const pickBest = (takes) => takes
  .filter(t => t.qa?.ok)
  .sort((a, b) => (a.qa.wer ?? 0) - (b.qa.wer ?? 0) || a.seconds - b.seconds)[0] ?? null
