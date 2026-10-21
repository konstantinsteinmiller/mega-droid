// @vitest-environment jsdom
// The voice-over review: voice-over-approvals.md (tools/voice/approvals.mjs),
// the review page's server (tools/voice/reviewServer.mjs), `voice:gen
// --rejected`'s list, and the content-hashed voice URLs (tools/voice/hash.mjs)
// that keep a re-voiced line from playing an old cached take.

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { parseApprovals, reconcile, rejectedJobs, rejectedLines, renderApprovals, setVerdict } from '../../tools/voice/approvals.mjs'
import { createReviewServer } from '../../tools/voice/reviewServer.mjs'
import { scanVoiceFiles } from '../../tools/voice/hash.mjs'
import { voiceFiles } from '@/game/assets/overrides'
import { voiceUrl } from '@/game/audio/voice'
import { VOICE_LINES } from '@/game/audio/voiceLines'
import { fileName } from '@/game/audio/voiceCatalog'

const ROOT = resolve(__dirname, '../..')
const dirs: string[] = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'voice-review-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const files = (...rows: Array<[string, string, string]>) => rows.map(([lang, key, hash]) => ({ lang, key, hash }))

describe('voice-over-approvals.md', () => {
  it('reads back what it writes, a note with a pipe in it too, and takes hand-edited status words', () => {
    const e = reconcile(new Map(), files(['en', 'atlas.lowHp', 'aaaa'], ['de', 'atlas.lowHp', 'bbbb'], ['de', 'pip.debrief.go', 'cccc']))
    setVerdict(e, { lang: 'de', key: 'pip.debrief.go', hash: 'cccc', status: 'rejected', note: 'says "LAY-bor" | English' })
    setVerdict(e, { lang: 'en', key: 'atlas.lowHp', hash: 'aaaa', status: 'approved' })
    const md = renderApprovals(e, ['en', 'de'])
    expect(parseApprovals(md)).toEqual(e)
    expect(md).toContain('| `pip.debrief.go` | rejected | cccc | says "LAY-bor" \\| English |')
    // By hand: "Approved" with a capital, any spacing.
    const edited = parseApprovals(md.replace('| `atlas.lowHp` | not yet approved | bbbb |', '|`atlas.lowHp`|  Approved |bbbb|'))
    expect(edited.get('de/atlas.lowHp')?.status).toBe('approved')
  })

  it('a re-recorded file goes back to not yet approved, the old verdict kept as history; a gone file loses its row', () => {
    const e = reconcile(new Map(), files(['de', 'pip.debrief.go', 'old1'], ['de', 'atlas.trap', 'tttt']))
    setVerdict(e, { lang: 'de', key: 'pip.debrief.go', hash: 'old1', status: 'rejected', note: 'wrong stress' })
    const next = reconcile(e, files(['de', 'pip.debrief.go', 'new2']))
    expect(next.get('de/pip.debrief.go')).toEqual({ lang: 'de', key: 'pip.debrief.go', status: 'not yet approved', hash: 'new2', note: '', history: 'rejected old1: wrong stress' })
    expect(next.has('de/atlas.trap')).toBe(false)
    // A verdict for the old recording (a stale page) is refused.
    expect(() => setVerdict(next, { lang: 'de', key: 'pip.debrief.go', hash: 'old1', status: 'approved' })).toThrow(/re-recorded/)
  })

  it('voice:gen --rejected picks the rejected lines still shipped, the note added to the direction', () => {
    const e = reconcile(new Map(), files(['de', 'a.one', 'h1'], ['de', 'a.two', 'h2'], ['en', 'a.one', 'h3']))
    setVerdict(e, { lang: 'de', key: 'a.one', hash: 'h1', status: 'rejected', note: 'too slow' })
    setVerdict(e, { lang: 'de', key: 'a.two', hash: 'h2', status: 'rejected', note: 'old' })
    // a.two was re-recorded since: its rejection was for the old take.
    const rejected = rejectedLines(e, files(['de', 'a.one', 'h1'], ['de', 'a.two', 'h9'], ['en', 'a.one', 'h3']))
    expect(rejected).toEqual([{ lang: 'de', key: 'a.one', note: 'too slow' }])
    const jobs = [
      { id: 'de/a_one', key: 'a.one', lang: 'de', direction: 'Calm.', directionEn: 'Calm.' },
      { id: 'en/a_one', key: 'a.one', lang: 'en', direction: 'Calm.', directionEn: 'Calm.' },
      { id: 'de/a_two', key: 'a.two', lang: 'de', direction: 'Calm.', directionEn: 'Calm.' }
    ]
    const out = rejectedJobs(jobs, rejected)
    expect(out.map(j => j.id)).toEqual(['de/a_one'])
    expect(out[0]!.direction).toBe('Calm. Listener\'s note on the last take: too slow')
    expect(out[0]!.directionEn).toContain('too slow')
  })
})

describe('the review server', () => {
  it('lists the files with their verdicts, and a verdict rewrites the md (a hand edit is read anew)', async () => {
    const d = tmp()
    mkdirSync(join(d, 'voice', 'de'), { recursive: true })
    writeFileSync(join(d, 'voice', 'de', 'pip_debrief_go.ogg'), 'take one')
    const mdPath = join(d, 'approvals.md')
    const lines = { 'pip.debrief.go': { key: 'pip.debrief.go', speaker: 'pip', scene: 'debrief', text: { de: 'Ich hüte das Labor.', en: 'I\'ll mind the Lab.' }, direction: {}, situation: {} } }
    const { server, token, sync } = createReviewServer({ mdPath, voiceDir: join(d, 'voice'), langs: ['en', 'de', 'ru'], lines, html: '<title>Voice-over review</title>', keyOf: (f: string) => (f === 'pip_debrief_go' ? 'pip.debrief.go' : null) })
    sync()
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      expect(await (await fetch(`${url}/api/hello`)).json()).toEqual({ app: 'voice-review', token })
      const { rows } = await (await fetch(`${url}/api/lines`)).json()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ lang: 'de', key: 'pip.debrief.go', status: 'not yet approved', text: 'Ich hüte das Labor.', en: 'I\'ll mind the Lab.' })
      expect((await fetch(`${url}${rows[0].audio}`)).status).toBe(200)

      const res = await fetch(`${url}/api/verdict`, { method: 'POST', body: JSON.stringify({ lang: 'de', key: 'pip.debrief.go', hash: rows[0].hash, status: 'rejected', note: 'LAY-bor' }) })
      expect(res.status).toBe(200)
      expect(parseApprovals(readFileSync(mdPath, 'utf8')).get('de/pip.debrief.go')).toMatchObject({ status: 'rejected', note: 'LAY-bor' })

      // A hand edit counts at once.
      writeFileSync(mdPath, readFileSync(mdPath, 'utf8').replace('| rejected |', '| approved |'))
      expect((await (await fetch(`${url}/api/lines`)).json()).rows[0].status).toBe('approved')

      // Re-recorded: back to not yet approved, the old verdict as history.
      writeFileSync(join(d, 'voice', 'de', 'pip_debrief_go.ogg'), 'take two')
      expect((await (await fetch(`${url}/api/lines`)).json()).rows[0]).toMatchObject({ status: 'not yet approved', history: expect.stringContaining('approved') })
      // A verdict for the old take is refused.
      expect((await fetch(`${url}/api/verdict`, { method: 'POST', body: JSON.stringify({ lang: 'de', key: 'pip.debrief.go', hash: rows[0].hash, status: 'approved' }) })).status).toBe(409)
    } finally {
      server.close()
    }
  })
})

describe('content-hashed voice URLs', () => {
  it('a file\'s URL changes when its bytes change', () => {
    const d = tmp()
    mkdirSync(join(d, 'de'))
    writeFileSync(join(d, 'de', 'pip_debrief_go.ogg'), 'take one')
    const one = voiceFiles(scanVoiceFiles(d)).get('de')?.get('pip.debrief.go')
    writeFileSync(join(d, 'de', 'pip_debrief_go.ogg'), 'take two')
    const two = voiceFiles(scanVoiceFiles(d)).get('de')?.get('pip.debrief.go')
    expect(one).toMatch(/audio\/voice\/de\/pip_debrief_go\.ogg\?v=[0-9a-f]{10}$/)
    expect(two).toMatch(/\?v=[0-9a-f]{10}$/)
    expect(two).not.toBe(one)
  })

  it('every voiced line resolves to a hashed URL', () => {
    const list = scanVoiceFiles(resolve(ROOT, 'public/audio/voice'))
    const all = voiceFiles(list)
    let n = 0
    for (const lang of ['en', 'de', 'es', 'zh', 'fr'] as const) {
      const have = new Set(list.filter(e => e.startsWith(`${lang}/`)).map(e => e.slice(lang.length + 1).replace(/\.\w+\?.*$/, '')))
      for (const l of VOICE_LINES) {
        if (!have.has(fileName(l.key))) continue
        expect(voiceUrl(l.key, lang, all), `${lang} ${l.key}`).toMatch(new RegExp(`/${lang}/${fileName(l.key)}\\.ogg\\?v=[0-9a-f]{10}$`))
        n++
      }
    }
    expect(n).toBeGreaterThan(1000)
  })
})
