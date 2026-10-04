// A scene line whose recording is still loading (the hub's once-only floor
// tip starts at once): its bubble waits a moment for the file, so it is shown
// with its voice, not silent (#107). Past SCENE_VOICE_WAIT it goes without.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const said: string[] = []
let readyAt = 0
let clock = 0
vi.mock('@/game/audio/voice', () => ({
  playVoice: (id: string) => (clock >= readyAt ? (said.push(id), 1) : null),
  prefetchVoice: () => (clock >= readyAt ? 'ready' : 'loading'),
  stopVoice: () => {}
}))
vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))

const { Scene, sceneUi, SCENE_VOICE_WAIT } = await import('@/game/story/vexScene')

const run = (s: InstanceType<typeof Scene>, secs: number, dt = 0.05): void => {
  for (let t = 0; t < secs; t += dt) { clock += dt; s.update(dt) }
}

beforeEach(() => { said.length = 0; clock = 0 })

describe("a scene line's voice", () => {
  it('the bubble waits for a recording still loading, then comes up with it', () => {
    readyAt = 0.5
    const s = new Scene([{ atlas: 'atlas.hint.floor.blaze' }], 'top')
    run(s, 0.3)
    expect(sceneUi.key).toBe('')
    run(s, 0.4)
    expect(said).toEqual(['atlas.hint.floor.blaze'])
    expect(sceneUi.key).toBe('atlas.hint.floor.blaze')
  })

  it('a file that takes too long: the bubble goes up without it', () => {
    readyAt = 99
    const s = new Scene([{ atlas: 'atlas.hint.floor.blaze' }], 'top')
    run(s, SCENE_VOICE_WAIT + 0.2)
    expect(sceneUi.key).toBe('atlas.hint.floor.blaze')
    expect(said).toEqual([])
  })
})
