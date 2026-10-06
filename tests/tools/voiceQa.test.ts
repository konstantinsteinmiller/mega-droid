// The judge of a take (tools/voice/qa.mjs) in the languages without spaces:
// a Chinese line is compared character by character, the cast's names as
// Whisper writes them in Chinese are the names, and the length budget counts
// characters. Each rule from a real failure mode, so it cannot pass anything.
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs tool module, no types
import { budgetFor, judge, wer } from '../../tools/voice/qa.mjs'

const take = (lang: string, text: string, heard: string, seconds = 2) => ({ lang, text, heard, seconds, peak: -3 })

describe('voice QA in Chinese and Spanish', () => {
  it('compares Chinese by character', () => {
    expect(wer('早上好，Flux。', '早上好 Flux')).toBe(0)
    expect(wer('核心上线。', '核心下线')).toBeCloseTo(0.25)
  })

  it('takes the cast\'s names in Chinese script as the names', () => {
    expect(judge(take('zh', '核心上线。早上好，Flux。', '核心上线,早上好,弗拉克斯。'), 3).ok).toBe(true)
    expect(judge(take('zh', '那是Vex。真正的那个。', '那是维克斯,真正的那个。'), 3).ok).toBe(true)
  })

  it('still fails a Chinese take that says something else', () => {
    expect(judge(take('zh', '核心上线。早上好，Flux。', '核心下线,晚上好'), 3).ok).toBe(false)
    // A misread word sounds different: 霓虹刃 (ní hóng rèn) is not 柴虹症.
    expect(judge(take('zh', '已复制霓虹刃。', '已复制柴虹症。'), 3).ok).toBe(false)
  })

  it('leaves Chinese sound words out: a hiss or a beep is not a word', () => {
    expect(judge(take('zh', '冷冻工厂，嘶！别停下。', '冷冻工厂,后,别停下。'), 3).ok).toBe(true)
    expect(judge(take('zh', '哔。来看看你。', '来看看你。'), 3).ok).toBe(true)
    expect(judge(take('zh', '先嘶嘶响，再喷火。等火焰停了再走。', '先吸吸响,再喷火,等火焰停了再走。'), 4).ok).toBe(true)
    // …but no more stray syllables than there were sounds.
    expect(judge(take('zh', '先嘶嘶响，再喷火。', '先吸吸吸吸响,再喷火'), 4).ok).toBe(false)
    // …and the names written in Chinese in the TEXT are the names too.
    expect(judge(take('zh', '看哪！我的新身体！马克一号！', '看哪,我的新身体,马克一号。'), 3).ok).toBe(true)
  })

  it('takes a Chinese homophone Whisper wrote the other way as the same sound', () => {
    // 它/他 tā, 滑/划 huá, 部/不 bù: the voice said the line right (real failures from the zh run).
    expect(judge(take('zh', '从它的浪下面滑铲过去。把泡泡戳破！', '从他的浪下面划铲过去,把泡泡戳破。'), 4).ok).toBe(true)
    expect(judge(take('zh', '它压低了。头部够得着了！', '她压低了,头不够得着了。'), 3).ok).toBe(true)
  })

  it('budgets Chinese by character, about 4.5 a second', () => {
    expect(budgetFor('核心上线。早上好，Flux。', 1, 'zh')).toBeCloseTo(8 / 4.5 + 0.5 + 0.3)
    expect(budgetFor('Core online. Good morning, Flux.', 1, 'en')).toBeCloseTo(5 / 2.6 + 0.5 + 0.3)
  })

  it('allows a breath at each sentence break', () => {
    // Three one-word sentences: two pauses, a real German take ran 2.7 s.
    expect(budgetFor('Goldring. Elite. Vorsicht.', 1.7, 'de')).toBeCloseTo(3 / 2.6 + 0.5 + 0.6)
    expect(judge(take('de', 'Goldring. Elite. Vorsicht.', 'Goldring, Elite, Vorsicht.', 2.7), 1.7).ok).toBe(true)
    // …but a take twice that long still fails.
    expect(judge(take('de', 'Goldring. Elite. Vorsicht.', 'Goldring, Elite, Vorsicht.', 4.2), 1.7).ok).toBe(false)
  })

  it('reads Spanish past its accents and opening marks', () => {
    expect(judge(take('es', '¡Respira hondo!', 'respira hondo'), 3).ok).toBe(true)
    expect(judge(take('es', 'Núcleo en línea. Buenos días, Flux.', 'Nucleo en linea. Buenos dias, Flux.'), 3).ok).toBe(true)
  })
})
