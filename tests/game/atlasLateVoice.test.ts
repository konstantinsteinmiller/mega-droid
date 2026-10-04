// A line Atlas says at once (a lesson's intro, a scene's line) whose
// recording is still loading: the voice follows when it arrives, a moment
// late, instead of the line staying silent (#107: the first "Let's train the
// Charge Shot!" had a German file and was never heard).

import { describe, expect, it } from 'vitest'
import { AtlasDirector, VOICE_LATE, type AtlasTick } from '@/game/sim/atlas'

const tick: AtlasTick = { playing: true, combat: false, hp01: 1, tanks: 1, we01: -1, level: 3, objectiveDone: false, trapNear: -1, plateNear: false }

const setup = (loadsAfter: number) => {
  let t = 0
  const spoken: Array<[string, number]> = []
  const ready = (): boolean => t >= loadsAfter
  const a = new AtlasDirector(
    { tutorial: true, kind: 'story', template: 'boss', sector: 'blaze', freed: 0 },
    (key) => { if (!ready()) return null; spoken.push([key, t]); return 2 },
    () => (ready() ? 'ready' : 'loading')
  )
  const step = (sec: number): void => { for (let s = 0; s < sec; s += 1 / 60) { t += 1 / 60; a.update(1 / 60, tick) } }
  return { a, spoken, step }
}

describe("Atlas's late voice", () => {
  it('a line said before its file loaded is voiced once the file is in, and stays up for it', () => {
    const { a, spoken, step } = setup(0.4)
    a.sayNow('train.charge')
    expect(spoken).toEqual([])
    step(0.6)
    expect(spoken.map(s => s[0])).toEqual(['atlas.train.charge'])
    expect(a.line!.hold).toBeGreaterThanOrEqual(0.4 + 2)
  })

  it('too late, the bubble goes on without it; another line cancels the wait', () => {
    const slow = setup(VOICE_LATE + 0.5)
    slow.a.sayNow('train.charge')
    slow.step(VOICE_LATE + 1)
    expect(slow.spoken).toEqual([])

    const cut = setup(0.5)
    cut.a.sayNow('train.charge')
    cut.step(0.2)
    cut.a.sayNow('train.slide')
    cut.step(0.6)
    expect(cut.spoken.map(s => s[0])).toEqual(['atlas.train.slide'])
  })
})
