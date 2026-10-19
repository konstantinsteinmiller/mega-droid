import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * ─── The Playgama adapter ───────────────────────────────────────────────────
 *
 * `bridge.leaderboards` → `PortalBoardAdapter`. It exists mostly because
 * Bridge's SaaS client RESOLVES HTTP errors as data (it never checks
 * `response.ok` — v1.32 and v2.2.0 alike), so the documented
 * `setScore(...).then(success)` calls a board that was never created on the
 * dashboard a success. Goes to `tests/platforms/`.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

const loadAdapter = async () => {
  vi.resetModules()
  return await import('@/utils/playgamaLeaderboard')
}

const fakeBridge = (lb: Record<string, unknown> | null, playerId: string | null = 'p-2') => ({
  leaderboards: lb,
  player: { id: playerId }
})

describe('the Playgama adapter', () => {
  it('reads an unknown board (404 resolved as data) as a failure, and latches off', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setScore = vi.fn(async () => ({ statusCode: 404, message: 'Leaderboard not found' }))
    const adapter = createPlaygamaBoardAdapter(fakeBridge({ type: 'in_game', setScore }), 'my_game_board')

    expect(adapter.mode()).toBe('in_game')
    expect(await adapter.submit(12)).toBe(false)
    expect(adapter.mode(), 'a board that does not exist must not be retried all session').toBe('not_available')
    expect(await adapter.submit(13)).toBe(false)
    expect(setScore).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('Playgama developer dashboard')
  })

  it('latches off on a missing token, but NOT on any other 400 — the stage-0 join may be one', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tokenless = createPlaygamaBoardAdapter(fakeBridge({
      type: 'in_game', setScore: async () => ({ statusCode: 400, message: 'public token is not set' })
    }), 'b')
    expect(await tokenless.submit(1)).toBe(false)
    expect(tokenless.mode()).toBe('not_available')

    const refused = createPlaygamaBoardAdapter(fakeBridge({
      type: 'in_game', setScore: async () => ({ statusCode: 400, message: 'score must be positive' })
    }), 'b')
    expect(await refused.submit(0)).toBe(false)
    expect(refused.mode()).toBe('in_game')
  })

  it('does not latch off on a server error — that is worth another try', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const setScore = vi.fn(async () => ({ statusCode: 503, message: 'busy' }))
    const adapter = createPlaygamaBoardAdapter(fakeBridge({ type: 'in_game', setScore }), 'b')
    expect(await adapter.submit(1)).toBe(false)
    expect(adapter.mode()).toBe('in_game')
  })

  it('treats a non-array getEntries answer as no board', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lb = { type: 'in_game', getEntries: async () => ({ statusCode: 404, message: 'Application not found' }) }
    expect(await createPlaygamaBoardAdapter(fakeBridge(lb), 'b').entries()).toBeNull()
    const odd = { type: 'in_game', getEntries: async () => 'not a board' }
    expect(await createPlaygamaBoardAdapter(fakeBridge(odd), 'b').entries()).toBeNull()
  })

  it('maps the rows, marks the player by portal id, and drops junk', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const lb = {
      type: 'in_game',
      getEntries: async () => [
        { id: 'p-2', name: ' Bex ', score: '30', rank: 2, photo: '' },
        null,
        { id: 'p-1', name: 'Ace', score: 41, rank: 1 },
        { id: 'p-3', score: 7 }
      ]
    }
    const rows = await createPlaygamaBoardAdapter(fakeBridge(lb), 'b').entries()
    expect(rows).toEqual([
      { rank: 1, name: 'Ace', score: 41, isYou: false },
      { rank: 2, name: 'Bex', score: 30, isYou: true },
      { rank: 3, name: '', score: 7, isYou: false }
    ])
  })

  it('never marks a row as yours when the portal has no player id', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const lb = { type: 'in_game', getEntries: async () => [{ id: '', name: 'Ace', score: 1, rank: 1 }] }
    const rows = await createPlaygamaBoardAdapter(fakeBridge(lb, ''), 'b').entries()
    expect(rows![0]!.isYou).toBe(false)
  })

  it('counts a native (YouTube) setScore that resolves nothing as a success', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const setScore = vi.fn(async () => undefined)
    const adapter = createPlaygamaBoardAdapter(fakeBridge({ type: 'native', setScore }), 'my_game_board')
    expect(adapter.mode()).toBe('native')
    expect(await adapter.submit(5)).toBe(true)
    expect(setScore).toHaveBeenCalledWith('my_game_board', 5)
  })

  it('reports no board at all when the bridge has no leaderboards module', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    const adapter = createPlaygamaBoardAdapter(fakeBridge(null), 'b')
    expect(adapter.mode()).toBe('not_available')
    expect(await adapter.submit(5)).toBe(false)
    expect(await adapter.entries()).toBeNull()
  })

  it('reads an unexpected type as not_available', async () => {
    const { createPlaygamaBoardAdapter } = await loadAdapter()
    expect(createPlaygamaBoardAdapter(fakeBridge({ type: 'something_new' }), 'b').mode()).toBe('not_available')
  })
})
