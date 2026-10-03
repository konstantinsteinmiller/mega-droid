// The voiced story scenes (story/vexScene.ts + vexScenes.ts, #117): beats in
// order on the caller's clock, Vex's motif before his first line, a line held
// for its recording, a laugh closing a line, skip, and which scene a freed
// Master brings — once ever, with old saves past their beats.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const said: string[] = []
const sounds: string[] = []
const VOICE_LEN = 1
vi.mock('@/game/audio/voice', () => ({
  playVoice: (id: string) => { said.push(id); return VOICE_LEN },
  prefetchVoice: () => 'ready',
  stopVoice: () => { said.push('<stop>') }
}))
vi.mock('@/game/audio/sfx', () => ({ sfx: (n: string) => { sounds.push(n) } }))

const { Scene, sceneUi, MOTIF_LEAD, LINE_TAIL } = await import('@/game/story/vexScene')
const { hubSceneFor, presentBeats, freedBeats, voltHackBeats } = await import('@/game/story/vexScenes')
const { voBeatsBehind } = await import('@/game/state/profile')
const { VOICE_LINES } = await import('@/game/audio/voiceLines')

const run = (s: InstanceType<typeof Scene>, secs: number, dt = 0.05): void => {
  for (let t = 0; t < secs; t += dt) s.update(dt)
}

beforeEach(() => { said.length = 0; sounds.length = 0 })

describe('a voiced story scene', () => {
  it('plays Vex\'s motif, then his line, and holds the bubble for the recording', () => {
    const s = new Scene([{ vex: 'vex.hub.blaze' }], 'top')
    s.update(0.01)
    expect(sounds).toEqual(['vexGlitch'])
    expect(said).toEqual([])
    run(s, MOTIF_LEAD)
    expect(said).toEqual(['vex.hub.blaze'])
    expect(sceneUi).toMatchObject({ speaker: 'vex', key: 'vex.hub.blaze', place: 'top' })
    run(s, VOICE_LEN + LINE_TAIL + 0.1)
    expect(s.finished).toBe(true)
    expect(sceneUi.key).toBe('')
  })

  it('closes a line with its laugh and waits for it', () => {
    const s = new Scene([{ vex: 'vex.fortress.welcome', laugh: 'maniacal' }, { atlas: 'atlas.story.fortress' }], 'top')
    run(s, MOTIF_LEAD + VOICE_LEN + 0.3)
    expect(said).toEqual(['vex.fortress.welcome', 'vex.laugh.maniacal'])
    run(s, VOICE_LEN + 0.6)
    expect(said.at(-1)).toBe('atlas.story.fortress')
  })

  it('hands Atlas\'s lines to the mission\'s own bubble when it has one', () => {
    const atlas = vi.fn(() => 0.5)
    const s = new Scene([{ atlas: 'atlas.mk1.free' }], 'title', { atlas })
    run(s, 0.6)
    expect(atlas).toHaveBeenCalledWith('atlas.mk1.free')
    expect(s.finished).toBe(true)
  })

  it('a tap cuts the line being said and moves on to the next (Pip, low on the screen)', () => {
    const onEnd = vi.fn()
    const s = new Scene([{ pip: 'pip.debrief.hello' }, { pip: 'pip.debrief.go' }], 'low', { onEnd })
    s.update(0.05)
    expect(said).toEqual(['pip.debrief.hello'])
    expect(sceneUi).toMatchObject({ speaker: 'pip', key: 'pip.debrief.hello', place: 'low' })
    s.next()
    s.update(0.05)
    expect(said).toEqual(['pip.debrief.hello', '<stop>', 'pip.debrief.go'])
    expect(sceneUi.key).toBe('pip.debrief.go')
    // The last line tapped away: the scene ends, once.
    s.next()
    s.update(0.05)
    expect(s.finished).toBe(true)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('stops the voice and ends on skip', () => {
    const onEnd = vi.fn()
    const s = new Scene([{ vex: 'vex.hub.volt' }, { vex: 'vex.hub.gale' }], 'top', { onEnd })
    run(s, MOTIF_LEAD + 0.1)
    s.skip()
    expect(said.at(-1)).toBe('<stop>')
    expect(onEnd).toHaveBeenCalledOnce()
    expect(s.update(1)).toBe(false)
  })
})

describe('the scene contents', () => {
  it('only names lines the voice catalog has, and every one is live', () => {
    const live = new Set(VOICE_LINES.filter(l => l.status === 'live').map(l => l.key))
    const beats = [
      ...presentBeats('blazeMaster'), ...freedBeats('frostMaster'), ...voltHackBeats(3, () => {}, () => {}),
      ...(['scrapper', 'frostMaster', 'galeMaster', 'rotorMaster', 'neonMaster'].flatMap(b => hubSceneFor(b)!.beats))
    ]
    for (const b of beats) {
      const key = 'vex' in b ? b.vex : 'atlas' in b ? b.atlas : null
      if (key) expect(live.has(key), key).toBe(true)
    }
  })

  it('picks the hub scene a freed Master brings', () => {
    expect(hubSceneFor('frostMaster')?.id).toBe('blueprint')
    expect(hubSceneFor('galeMaster')?.id).toBe('reserve')
    expect(hubSceneFor('rotorMaster')?.id).toBe('breach')
    expect(hubSceneFor('tideMaster')).toMatchObject({ id: 'broadcast', seen: 'vex:tideMaster' })
    expect(hubSceneFor('vexMk1')).toBeNull()
  })

  it('counts an old save\'s scenes as seen for the Masters it already beat', () => {
    const beats = voBeatsBehind({ bosses: ['scrapper', 'blazeMaster', 'frostMaster'], unlocked: [] })
    expect(beats).toEqual(expect.arrayContaining(['present:scrapper', 'vex:blazeMaster', 'blueprint']))
    expect(beats).not.toContain('reserve')
  })
})

describe('Atlas on the mission board', () => {
  it('names a sector\'s floor level the first time it is selected, and warns when Flux is under it', async () => {
    const { boardLines } = await import('@/game/story/hubAtlas')
    const keys = (b: ReturnType<typeof boardLines>) => b.map(x => ('atlas' in x ? x.atlas : ''))
    // Volt Tower runs level 9 and up.
    expect(keys(boardLines('volt', 4, {}, new Set()))).toEqual(['atlas.hint.floor.volt', 'atlas.hint.underLevel'])
    expect(keys(boardLines('volt', 12, {}, new Set()))).toEqual(['atlas.hint.floor.volt'])
    // Seen before, and already warned this visit: nothing.
    expect(boardLines('volt', 4, { 'atlas:floor:volt': true }, new Set(['volt']))).toEqual([])
    // The Scrapyard has no floor line.
    expect(boardLines('scrapyard', 1, {}, new Set())).toEqual([])
  })
})
