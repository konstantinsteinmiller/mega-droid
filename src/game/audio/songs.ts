import { mulberry32, type Rng } from '../world/rng'

/**
 * ─── The score ───────────────────────────────────────────────────────────────
 *
 * Every song the game plays, as note data plus the instruments that voice it.
 * Nothing is sampled: a song is a few thousand numbers, voiced on whatever
 * AudioContext it is handed — the shared one in play, an OfflineAudioContext
 * when a tool renders it to measure loudness.
 *
 * Two families live here:
 *
 *   - the CHIPTUNE area themes (hub + one per sector): pulse waves, a composer
 *     that writes each one from a progression, a mode and a seed. ~25-35 s a
 *     pass, so the sequencer plays them twice before rotating on.
 *   - the SCORED songs: `drift` (synthwave), `circuit` (lo-fi) and the `boss`
 *     fight. Detuned saw pads, FM keys, plucks, a real kit and a hall reverb —
 *     written out by hand, about a minute each. They exist because a
 *     25-second pulse-wave loop is the first thing a new player mutes.
 *
 * The sequencer (`music.ts`) rotates area theme → drift → circuit about once a
 * minute, and swaps to `boss` for a Core Master fight.
 */

export type TrackId = 'hub' | 'scrapyard' | 'blaze' | 'cryo' | 'volt' | 'gale' | 'magnet' | 'drill' | 'tide' | 'neon' | 'rotor' | 'fortress' | 'boss' | 'intro'
/** A song: an area theme (by its track id), one of the two rotation songs, or the boss. */
export type SongId = TrackId | 'drift' | 'circuit'

type Inst =
  | 'cLead' | 'cArp' | 'cBass' | 'cKick' | 'cSnare' | 'cHat'
  | 'pad' | 'pluck' | 'bass' | 'sub' | 'lead' | 'keys' | 'bell' | 'brass' | 'choir' | 'str'
  | 'kick' | 'lkick' | 'bkick' | 'snare' | 'lsnare' | 'clap' | 'hat' | 'ohat' | 'crash'
  | 'tom' | 'taiko' | 'hit' | 'riser' | 'crackle'

/** One note. Its step is its index in `Song.steps`; `len` is in 16ths. */
export interface Ev { i: Inst; m: number; len: number; v: number; p?: number }

interface ChanSpec { gain?: number; pan?: number; send?: number; lp?: number; hp?: number }

export interface Song {
  id: SongId
  bpm: number
  bars: number
  /** Bar a repeat restarts from (the boss skips its intro on repeats). */
  loopBar: number
  /** Delay of every odd 16th, as a fraction of a 16th (lo-fi swing). */
  swing: number
  /** Loudness trim — songs are matched to each other (see tools/music-render). */
  gain: number
  reverb: { seconds: number; decay: number }
  chans: Record<string, ChanSpec>
  steps: Ev[][]
}

// ─── Output graph ───────────────────────────────────────────────────────────

export interface Out {
  ctx: BaseAudioContext
  master: GainNode
  ch: (name: string) => AudioNode
  /** A node every note of an instrument can share (a filter bank, an LFO),
   *  built once per song. Sources it returns are started here and stopped on
   *  dispose. */
  shared: <T extends AudioNode>(key: string, make: () => T) => T
  dispose: () => void
}

const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()

/** A hall: stereo decaying noise, darkened, with a short pre-delay. */
const impulse = (ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer => {
  let m = irCache.get(ctx)
  if (!m) irCache.set(ctx, (m = new Map()))
  const key = `${seconds}:${decay}`
  const hit = m.get(key)
  if (hit) return hit
  const len = Math.floor(ctx.sampleRate * seconds)
  const pre = Math.floor(ctx.sampleRate * 0.015)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  const rng = mulberry32(7)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre)
      // The one-pole darkens as the tail goes on, like air absorbing the highs.
      lp += ((rng() * 2 - 1) - lp) * (0.6 - 0.45 * k)
      d[i] = lp * Math.pow(1 - k, decay)
    }
  }
  m.set(key, buf)
  return buf
}

export const makeOut = (ctx: BaseAudioContext, dest: AudioNode, song: Song): Out => {
  const master = ctx.createGain()
  master.gain.value = song.gain
  master.connect(dest)
  const nodes: AudioNode[] = [master]
  let verb: AudioNode | null = null
  const reverbIn = (): AudioNode => {
    if (!verb) {
      const cv = ctx.createConvolver()
      cv.buffer = impulse(ctx, song.reverb.seconds, song.reverb.decay)
      cv.connect(master)
      nodes.push(cv)
      verb = cv
    }
    return verb
  }
  const chans = new Map<string, AudioNode>()
  const ch = (name: string): AudioNode => {
    const hit = chans.get(name)
    if (hit) return hit
    const spec = song.chans[name] ?? {}
    const input = ctx.createGain()
    input.gain.value = spec.gain ?? 1
    nodes.push(input)
    let tail: AudioNode = input
    for (const [type, f] of [['lowpass', spec.lp], ['highpass', spec.hp]] as const) {
      if (!f) continue
      const bq = ctx.createBiquadFilter()
      bq.type = type
      bq.frequency.value = f
      bq.Q.value = 0.5
      tail.connect(bq)
      tail = bq
      nodes.push(bq)
    }
    if (spec.pan && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner()
      p.pan.value = spec.pan
      tail.connect(p).connect(master)
      nodes.push(p)
    } else tail.connect(master)
    if (spec.send) {
      const s = ctx.createGain()
      s.gain.value = spec.send
      tail.connect(s).connect(reverbIn())
      nodes.push(s)
    }
    chans.set(name, input)
    return input
  }
  const sharedNodes = new Map<string, AudioNode>()
  const shared = <T extends AudioNode>(key: string, make: () => T): T => {
    const hit = sharedNodes.get(key)
    if (hit) return hit as T
    const n = make()
    if (n instanceof AudioScheduledSourceNode) n.start()
    sharedNodes.set(key, n)
    nodes.push(n)
    return n
  }
  return {
    ctx,
    master,
    ch,
    shared,
    dispose: () => {
      for (const n of nodes) {
        try { if (n instanceof AudioScheduledSourceNode) n.stop() } catch { /* not started */ }
        try { n.disconnect() } catch { /* gone */ }
      }
    }
  }
}

// ─── Sources shared per context ─────────────────────────────────────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
const noise = (ctx: BaseAudioContext): AudioBuffer => {
  const hit = noiseCache.get(ctx)
  if (hit) return hit
  const len = ctx.sampleRate
  const b = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = b.getChannelData(0)
  const rng = mulberry32(3)
  for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1
  noiseCache.set(ctx, b)
  return b
}

const pulseCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>()
/** Band-limited pulse wave (12.5 / 25 / 50 % duty — the console channel's timbres). */
const pulse = (ctx: BaseAudioContext, duty: number): PeriodicWave => {
  let m = pulseCache.get(ctx)
  if (!m) pulseCache.set(ctx, (m = new Map()))
  const hit = m.get(duty)
  if (hit) return hit
  const N = 48
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let n = 1; n < N; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI)
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI)
  }
  const w = ctx.createPeriodicWave(real, imag)
  m.set(duty, w)
  return w
}

const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

const osc = (ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, detune = 0): OscillatorNode => {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (detune) o.detune.value = detune
  return o
}

/** Attack to `peak`, decay toward `peak * sus`, release from `end`. */
const envGain = (
  ctx: BaseAudioContext, t: number, a: number, peak: number, d: number, sus: number, end: number, rel: number
): GainNode => {
  const g = ctx.createGain()
  const e = Math.max(end, t + a + 0.002)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setTargetAtTime(Math.max(0.0001, peak * sus), t + a, Math.max(0.01, d / 3))
  g.gain.setTargetAtTime(0.0001, e, Math.max(0.005, rel / 4))
  return g
}

const run = (nodes: AudioScheduledSourceNode[], t: number, stop: number): void => {
  for (const n of nodes) { n.start(t); n.stop(stop) }
}

const noiseSrc = (ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode => {
  const s = ctx.createBufferSource()
  s.buffer = noise(ctx)
  s.start(t, (t * 7.31) % 0.5)
  s.stop(t + dur)
  return s
}

const filter = (ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode => {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

// ─── Instruments ────────────────────────────────────────────────────────────
// Each takes (out, start time, note, seconds per 16th). Levels are relative;
// a song's `gain` sets where it sits against the others.

type Voice = (o: Out, t: number, e: Ev, spb: number) => void

// Chiptune — the original voices, unchanged in character.
const chipVoice = (o: Out, t: number, dur: number, midi: number, kind: 'lead' | 'arp' | 'bass', duty: number): void => {
  const c = o.ctx
  const s = c.createOscillator()
  if (kind === 'bass') s.type = 'triangle'
  else s.setPeriodicWave(pulse(c, duty))
  s.frequency.setValueAtTime(hz(midi), t)
  if (kind === 'lead') {
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lfo.frequency.value = 6
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(hz(midi) * 0.012, t + Math.min(dur, 0.25))
    lfo.connect(lg).connect(s.frequency)
    run([lfo], t, t + dur + 0.05)
  }
  const g = c.createGain()
  const vol = kind === 'lead' ? 0.1 : kind === 'arp' ? 0.04 : 0.3
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
  g.gain.setValueAtTime(vol * (kind === 'arp' ? 0.6 : 0.85), t + dur * 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(g).connect(o.ch(kind === 'bass' ? 'chipBass' : 'chip'))
  run([s], t, t + dur + 0.02)
}

const chipDrum = (o: Out, t: number, kind: 'kick' | 'snare' | 'hat'): void => {
  const c = o.ctx
  const dest = o.ch('chipDrums')
  if (kind === 'kick') {
    const s = osc(c, 'triangle', 150, t)
    s.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = c.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    s.connect(g).connect(dest)
    run([s], t, t + 0.18)
    return
  }
  const len = kind === 'hat' ? 0.04 : 0.14
  const n = noiseSrc(c, t, len + 0.02)
  const f = filter(c, kind === 'hat' ? 'highpass' : 'bandpass', kind === 'hat' ? 7000 : 1800, kind === 'hat' ? 0.7 : 0.9)
  const g = c.createGain()
  g.gain.setValueAtTime(kind === 'hat' ? 0.06 : 0.2, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  n.connect(f).connect(g).connect(dest)
}

/** Detuned three-saw pad, filtered warm, slow in and out. */
const pad: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb
  // The warmth is the channel's low-pass (`chans.pad.lp`), shared by every note.
  const g = envGain(c, t, 0.4, 0.05 * e.v, 1, 0.85, end, 1.1)
  const oscs = [-11, 0, 10].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) s.connect(g)
  g.connect(o.ch('pad'))
  run(oscs, t, end + 1.4)
}

/** Plucked saw/square with a snapping filter — the synthwave arpeggio. `p` = brightness. */
const pluck: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const b = e.p ?? 0.6
  const f = filter(c, 'lowpass', 300, 3)
  f.frequency.setValueAtTime(350 + 4200 * b * e.v, t)
  f.frequency.exponentialRampToValueAtTime(260, t + 0.24)
  const end = t + Math.min(e.len * spb, 0.3)
  // ONE oscillator, stopped as soon as the release is inaudible: this plays
  // every 16th, so its voice count is most of the song's audio-thread cost.
  const g = envGain(c, t, 0.003, 0.26 * e.v, 0.18, 0.3, end, 0.16)
  const s = osc(c, 'sawtooth', hz(e.m), t)
  s.connect(f).connect(g).connect(o.ch('pluck'))
  run([s], t, end + 0.18)
}

/** Saw bass with a sine under it, filter punched on each note. */
const bass: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.9
  const f = filter(c, 'lowpass', 200, 1.5)
  f.frequency.setValueAtTime(180 + 900 * e.v, t)
  f.frequency.exponentialRampToValueAtTime(260, t + 0.16)
  const g = envGain(c, t, 0.005, 0.09 * e.v, 0.25, 0.7, end, 0.06)
  const saw = osc(c, 'sawtooth', hz(e.m), t)
  const sine = osc(c, 'sine', hz(e.m), t)
  const sg = c.createGain()
  sg.gain.value = 1
  saw.connect(f).connect(g)
  sine.connect(sg).connect(g)
  g.connect(o.ch('bass'))
  run([saw, sine], t, end + 0.1)
}

/** Round lo-fi bass: sine plus a quiet triangle an octave up for small speakers. */
const sub: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.92
  const g = envGain(c, t, 0.012, 0.16 * e.v, 0.6, 0.65, end, 0.12)
  const f = filter(c, 'lowpass', 650, 0.7)
  const s1 = osc(c, 'sine', hz(e.m), t)
  const s2 = osc(c, 'triangle', hz(e.m + 12), t)
  const g2 = c.createGain()
  g2.gain.value = 0.3
  s1.connect(f)
  s2.connect(g2).connect(f)
  f.connect(g).connect(o.ch('sub'))
  run([s1, s2], t, end + 0.2)
}

/** Soft saw lead with a delayed vibrato. */
const lead: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const dur = e.len * spb
  const end = t + dur * 0.95
  // Tone filter on the channel (`chans.lead.lp`); one shared LFO for vibrato,
  // faded in per note so short notes stay straight.
  const g = envGain(c, t, 0.02, 0.16 * e.v, 0.35, 0.75, end, 0.3)
  const oscs = [osc(c, 'sawtooth', hz(e.m), t), osc(c, 'sawtooth', hz(e.m), t, 12), osc(c, 'triangle', hz(e.m - 12), t)]
  if (dur > 0.3) {
    const lfo = o.shared('lead:lfo', () => osc(c, 'sine', 5.2, 0))
    const lg = c.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(10, t + 0.4) // cents
    lfo.connect(lg)
    for (const s of oscs) lg.connect(s.detune)
    setTimeout(() => { try { lfo.disconnect(lg) } catch { /* disposed */ } }, (end + 0.5 - c.currentTime) * 1000)
  }
  for (const s of oscs) s.connect(g)
  g.connect(o.ch('lead'))
  run(oscs, t, end + 0.4)
}

/** Electric piano: two-operator FM with a short tine "bark". `p` = strum offset (s). */
const keys: Voice = (o, t0, e, spb) => {
  const c = o.ctx
  const t = t0 + (e.p ?? 0)
  const f0 = hz(e.m)
  const end = t + e.len * spb
  const car = osc(c, 'sine', f0, t)
  const mod = osc(c, 'sine', f0, t)
  const mg = c.createGain()
  mg.gain.setValueAtTime(f0 * 2 * e.v, t)
  mg.gain.exponentialRampToValueAtTime(f0 * 0.2, t + 1.2)
  const tine = osc(c, 'sine', f0 * 14, t)
  const tg = c.createGain()
  tg.gain.setValueAtTime(f0 * 0.5 * e.v, t)
  tg.gain.exponentialRampToValueAtTime(1, t + 0.06)
  mod.connect(mg).connect(car.frequency)
  tine.connect(tg).connect(car.frequency)
  const g = envGain(c, t, 0.004, 0.11 * e.v, 1.4, 0.35, end, 0.35)
  car.connect(g).connect(o.ch('keys'))
  run([car, mod, tine], t, end + 0.5)
}

/** Glassy FM bell. */
const bell: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const f0 = hz(e.m)
  const ring = Math.max(e.len * spb, 1.6)
  const car = osc(c, 'sine', f0, t)
  const mod = osc(c, 'sine', f0 * 3.5, t)
  const mg = c.createGain()
  mg.gain.setValueAtTime(f0 * 2.2 * e.v, t)
  mg.gain.exponentialRampToValueAtTime(f0 * 0.1, t + 0.9)
  mod.connect(mg).connect(car.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.26 * e.v, t + 0.003)
  g.gain.setTargetAtTime(0.0001, t + 0.003, ring / 4)
  car.connect(g).connect(o.ch('bell'))
  run([car, mod], t, t + ring + 0.2)
}

/** Brass section: detuned saws, the filter swelling open on the attack. */
const brass: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + e.len * spb * 0.95
  const f = filter(c, 'lowpass', 300, 1.2)
  f.frequency.setValueAtTime(300, t)
  f.frequency.exponentialRampToValueAtTime(400 + 2600 * e.v, t + 0.09)
  f.frequency.setTargetAtTime(1100 + 700 * e.v, t + 0.09, 0.25)
  const g = envGain(c, t, 0.045, 0.16 * e.v, 0.4, 0.8, end, 0.18)
  const oscs = [-7, 6].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) s.connect(f)
  f.connect(g).connect(o.ch('brass'))
  run(oscs, t, end + 0.3)
}

/** "Aah" choir: saws through vowel formants, slow swell, a little vibrato. */
const choir: Voice = (o, t, e, spb) => {
  const c = o.ctx
  // The vowel and the vibrato are the same for every note, so every note
  // shares them: a note is just two saws and an envelope. (Built per note, the
  // formant bank was the boss song's single biggest audio-thread cost.)
  const vowel = o.shared('choir:vowel', () => {
    const input = c.createGain()
    input.gain.value = 0.5
    for (const [ff, q, lvl] of [[800, 5, 1], [1150, 6, 0.6], [2900, 8, 0.25]] as const) {
      const lv = c.createGain()
      lv.gain.value = lvl
      input.connect(filter(c, 'bandpass', ff, q)).connect(lv).connect(o.ch('choir'))
    }
    return input
  })
  const vibrato = o.shared('choir:vibrato', () => {
    const depth = c.createGain()
    depth.gain.value = 7 // cents
    o.shared('choir:lfo', () => osc(c, 'sine', 4.8, 0)).connect(depth)
    return depth
  })
  const end = t + e.len * spb
  const g = envGain(c, t, 0.6, 0.4 * e.v, 1, 0.9, end, 0.9)
  const oscs = [-8, 8].map(d => osc(c, 'sawtooth', hz(e.m), t, d))
  for (const s of oscs) { vibrato.connect(s.detune); s.connect(g) }
  g.connect(vowel)
  run(oscs, t, end + 1.2)
}

/** Short bowed strings — the boss ostinato. */
const str: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const end = t + Math.min(e.len * spb, 0.16)
  const f = filter(c, 'lowpass', 1200 + 1600 * e.v, 0.8)
  // One oscillator per note for the same reason as `pluck` (16ths throughout).
  const g = envGain(c, t, 0.004, 0.3 * e.v, 0.12, 0.4, end, 0.08)
  const s = osc(c, 'sawtooth', hz(e.m), t)
  s.connect(f).connect(g).connect(o.ch('str'))
  run([s], t, end + 0.1)
}

const kickVoice = (o: Out, t: number, v: number, f0: number, f1: number, dec: number, click: number, chan: string): void => {
  const c = o.ctx
  const dest = o.ch(chan)
  const s = osc(c, 'sine', f0, t)
  s.frequency.exponentialRampToValueAtTime(f1, t + 0.09)
  const g = c.createGain()
  g.gain.setValueAtTime(0.7 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  s.connect(g).connect(dest)
  run([s], t, t + dec + 0.02)
  if (click > 0) {
    const n = noiseSrc(c, t, 0.02)
    const cg = c.createGain()
    cg.gain.setValueAtTime(click * v, t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012)
    n.connect(filter(c, 'highpass', 3000, 0.7)).connect(cg).connect(dest)
  }
}

const snareVoice = (o: Out, t: number, v: number, band: number, dec: number, toneHz: number, chan: string): void => {
  const c = o.ctx
  const dest = o.ch(chan)
  const n = noiseSrc(c, t, dec + 0.02)
  const g = c.createGain()
  g.gain.setValueAtTime(1 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  n.connect(filter(c, 'bandpass', band, 0.7)).connect(g).connect(dest)
  const s = osc(c, 'triangle', toneHz, t)
  s.frequency.exponentialRampToValueAtTime(toneHz * 0.8, t + 0.08)
  const tg = c.createGain()
  tg.gain.setValueAtTime(0.6 * v, t)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  s.connect(tg).connect(dest)
  run([s], t, t + 0.1)
}

const clap: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.25)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  for (const k of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(1.5 * e.v, t + k)
    g.gain.exponentialRampToValueAtTime(0.15 * e.v, t + k + 0.009)
  }
  g.gain.setValueAtTime(1.1 * e.v, t + 0.033)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  n.connect(filter(c, 'bandpass', 1100, 1.4)).connect(g).connect(o.ch('clap'))
}

const hatVoice = (o: Out, t: number, v: number, dec: number, chan: string): void => {
  const c = o.ctx
  const n = noiseSrc(c, t, dec + 0.02)
  const g = c.createGain()
  g.gain.setValueAtTime(0.45 * v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  n.connect(filter(c, 'highpass', 7500, 0.7)).connect(g).connect(o.ch(chan))
}

const crash: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.99)
  const g = c.createGain()
  g.gain.setValueAtTime(0.3 * e.v, t)
  g.gain.setTargetAtTime(0.0001, t, 0.35)
  n.connect(filter(c, 'highpass', 5000, 0.5)).connect(g).connect(o.ch('crash'))
}

const tom: Voice = (o, t, e) => {
  const c = o.ctx
  const s = osc(c, 'sine', hz(e.m) * 1.6, t)
  s.frequency.exponentialRampToValueAtTime(hz(e.m), t + 0.12)
  const g = c.createGain()
  g.gain.setValueAtTime(0.5 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
  s.connect(g).connect(o.ch('tom'))
  run([s], t, t + 0.4)
}

/** Big drum: a pitched thump with a skin slap on top. */
const taiko: Voice = (o, t, e) => {
  const c = o.ctx
  const dest = o.ch('taiko')
  const f0 = hz(e.m)
  const s = osc(c, 'sine', f0 * 1.8, t)
  s.frequency.exponentialRampToValueAtTime(f0, t + 0.06)
  const g = c.createGain()
  g.gain.setValueAtTime(0.35 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
  s.connect(g).connect(dest)
  run([s], t, t + 0.85)
  const n = noiseSrc(c, t, 0.12)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.25 * e.v, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  n.connect(filter(c, 'lowpass', 1200, 0.8)).connect(ng).connect(dest)
}

/** Cinematic impact: a sub drop under a darkening noise burst. */
const hit: Voice = (o, t, e) => {
  const c = o.ctx
  const dest = o.ch('hit')
  const s = osc(c, 'sine', 62, t)
  s.frequency.exponentialRampToValueAtTime(28, t + 1.5)
  const g = c.createGain()
  g.gain.setValueAtTime(0.4 * e.v, t)
  g.gain.setTargetAtTime(0.0001, t + 0.05, 0.5)
  s.connect(g).connect(dest)
  run([s], t, t + 2.2)
  const n = noiseSrc(c, t, 1.8)
  const f = filter(c, 'lowpass', 5000, 0.7)
  f.frequency.setValueAtTime(5000, t)
  f.frequency.exponentialRampToValueAtTime(150, t + 1.6)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.22 * e.v, t)
  ng.gain.setTargetAtTime(0.0001, t + 0.02, 0.4)
  n.connect(f).connect(ng).connect(dest)
}

/** Noise swell into the next section. */
const riser: Voice = (o, t, e, spb) => {
  const c = o.ctx
  const d = e.len * spb
  const n = c.createBufferSource()
  n.buffer = noise(c)
  n.loop = true
  const f = filter(c, 'bandpass', 250, 2)
  f.frequency.setValueAtTime(250, t)
  f.frequency.exponentialRampToValueAtTime(5000, t + d)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.42 * e.v, t + d)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06)
  n.connect(f).connect(g).connect(o.ch('riser'))
  run([n], t, t + d + 0.08)
}

/** Vinyl dust. */
const crackle: Voice = (o, t, e) => {
  const c = o.ctx
  const n = noiseSrc(c, t, 0.01)
  const g = c.createGain()
  g.gain.setValueAtTime(0.06 * e.v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006)
  n.connect(filter(c, 'highpass', 2500, 0.7)).connect(g).connect(o.ch('crackle'))
}

const INST: Record<Inst, Voice> = {
  cLead: (o, t, e, spb) => chipVoice(o, t, e.len * spb * 0.92, e.m, 'lead', e.p ?? 0.25),
  cArp: (o, t, e, spb) => chipVoice(o, t, spb * 0.9, e.m, 'arp', e.p ?? 0.125),
  cBass: (o, t, e, spb) => chipVoice(o, t, e.len * spb * 0.8, e.m, 'bass', 0.5),
  cKick: (o, t) => chipDrum(o, t, 'kick'),
  cSnare: (o, t) => chipDrum(o, t, 'snare'),
  cHat: (o, t) => chipDrum(o, t, 'hat'),
  pad, pluck, bass, sub, lead, keys, bell, brass, choir, str,
  kick: (o, t, e) => kickVoice(o, t, e.v, 140, 45, 0.45, 0.12, 'kick'),
  lkick: (o, t, e) => kickVoice(o, t, e.v, 105, 48, 0.32, 0, 'kick'),
  bkick: (o, t, e) => kickVoice(o, t, e.v * 0.65, 150, 36, 0.6, 0.15, 'kick'),
  snare: (o, t, e) => snareVoice(o, t, e.v, 1900, 0.2, 185, 'snare'),
  lsnare: (o, t, e) => snareVoice(o, t, e.v * 0.8, 1500, 0.12, 200, 'snare'),
  clap,
  hat: (o, t, e) => hatVoice(o, t, e.v, 0.04, 'hat'),
  ohat: (o, t, e) => hatVoice(o, t, e.v, 0.26, 'ohat'),
  crash, tom, taiko, hit, riser, crackle
}

/** Voice every note on one 16th. Called by the sequencer ahead of time. */
export const playStep = (o: Out, song: Song, step: number, t: number, spb: number): void => {
  const evs = song.steps[step]
  if (!evs || evs.length === 0) return
  const tt = t + (step % 2 === 1 ? song.swing * spb : 0)
  for (const e of evs) INST[e.i](o, tt, e, spb)
}

// ─── Writing helpers ────────────────────────────────────────────────────────

const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
/** 'C4' → 60. */
export const note = (s: string): number => {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(s)
  if (!m) throw new Error(`bad note ${s}`)
  return 12 * (Number(m[2]) + 1) + PC[m[1]!]!
}

class Score {
  readonly steps: Ev[][]
  constructor (readonly bars: number) {
    this.steps = Array.from({ length: bars * 16 }, () => [])
  }

  add (bar: number, step: number, i: Inst, m: number, len: number, v: number, p?: number): void {
    const s = bar * 16 + step
    if (s < 0 || s >= this.steps.length) return
    this.steps[s]!.push(p === undefined ? { i, m, len, v } : { i, m, len, v, p })
  }

  /** A melody bar written as "E5:0:6 D5:6:2" (note:step:length). */
  line (bar: number, i: Inst, text: string, v: number, octave = 0): void {
    for (const tok of text.trim().split(/\s+/)) {
      if (!tok) continue
      const [n, s, l] = tok.split(':')
      this.add(bar, Number(s), i, note(n!) + 12 * octave, Number(l), v)
    }
  }
}

const jitter = (rng: Rng, v: number, amt = 0.08): number => Math.max(0.05, Math.min(1, v * (1 - amt + rng() * amt * 2)))

// ─── Chiptune area themes ───────────────────────────────────────────────────

interface ChipSpec {
  bpm: number
  root: number
  mode: number[]
  progA: number[]
  progB: number[]
  seed: number
  leadDuty: number
  arpDuty: number
  drums: 'drive' | 'half' | 'march'
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]
const PHRYG = [0, 1, 3, 5, 7, 8, 10]

type ChipId = Exclude<TrackId, 'boss' | 'intro'>

const CHIP: Record<ChipId, ChipSpec> = {
  hub: { bpm: 112, root: 48, mode: MAJOR, progA: [0, 5, 3, 4], progB: [5, 3, 0, 4], seed: 11, leadDuty: 0.25, arpDuty: 0.125, drums: 'half' },
  scrapyard: { bpm: 150, root: 40, mode: MINOR, progA: [0, 5, 2, 6], progB: [3, 4, 0, 6], seed: 21, leadDuty: 0.25, arpDuty: 0.125, drums: 'drive' },
  blaze: { bpm: 160, root: 45, mode: MINOR, progA: [0, 6, 5, 6], progB: [3, 4, 5, 4], seed: 32, leadDuty: 0.5, arpDuty: 0.25, drums: 'drive' },
  cryo: { bpm: 144, root: 38, mode: DORIAN, progA: [0, 3, 0, 4], progB: [5, 3, 1, 4], seed: 43, leadDuty: 0.125, arpDuty: 0.25, drums: 'march' },
  volt: { bpm: 168, root: 42, mode: MINOR, progA: [0, 2, 5, 4], progB: [3, 5, 6, 4], seed: 54, leadDuty: 0.25, arpDuty: 0.125, drums: 'drive' },
  gale: { bpm: 150, root: 43, mode: LYDIAN, progA: [0, 1, 0, 4], progB: [5, 3, 1, 4], seed: 65, leadDuty: 0.25, arpDuty: 0.125, drums: 'march' },
  // The Polarity Works: a driving minor groove that swings between two
  // poles (the progression rocks i ↔ ♭VI), square lead.
  magnet: { bpm: 156, root: 41, mode: MINOR, progA: [0, 5, 0, 5], progB: [3, 6, 4, 4], seed: 87, leadDuty: 0.5, arpDuty: 0.125, drums: 'drive' },
  // The Deep Mine: a marching phrygian dig, low and steady, the arp in
  // wide duty for a hollow, tunnel-ish ring.
  drill: { bpm: 146, root: 38, mode: PHRYG, progA: [0, 1, 0, 4], progB: [3, 4, 1, 0], seed: 98, leadDuty: 0.25, arpDuty: 0.5, drums: 'march' },
  // The Tidewater Locks: a rolling dorian swell in half time, a thin
  // lead over a mid arp, like light on water.
  tide: { bpm: 138, root: 43, mode: DORIAN, progA: [0, 3, 4, 3], progB: [5, 4, 1, 4], seed: 109, leadDuty: 0.125, arpDuty: 0.25, drums: 'half' },
  // Blackout Boulevard: a fast synth-wave drive in minor, a wide square
  // lead and a fizzing narrow arp.
  neon: { bpm: 164, root: 45, mode: MINOR, progA: [0, 5, 3, 6], progB: [0, 5, 6, 4], seed: 120, leadDuty: 0.5, arpDuty: 0.125, drums: 'drive' },
  // The Rotor Run: the fastest of them, a bright lydian chase, the lead
  // pushing up a fourth.
  rotor: { bpm: 168, root: 40, mode: LYDIAN, progA: [0, 1, 4, 1], progB: [5, 4, 1, 0], seed: 131, leadDuty: 0.25, arpDuty: 0.125, drums: 'drive' },
  fortress: { bpm: 162, root: 36, mode: PHRYG, progA: [0, 1, 0, 6], progB: [5, 3, 1, 0], seed: 76, leadDuty: 0.5, arpDuty: 0.25, drums: 'drive' }
}

const RHYTHMS = [
  'x..x..x.x.x.x...',
  'x.x.x..xx.x.x...',
  'x...x.x.x..xx.x.',
  'x.xx..x.x.x..x..',
  'x..xx.x...x.x.x.'
]

const scaleNote = (spec: ChipSpec, degree: number, octave: number): number => {
  const n = spec.mode.length
  const oct = Math.floor(degree / n)
  const d = ((degree % n) + n) % n
  return spec.root + 12 * (octave + oct) + spec.mode[d]!
}

/** One 4-bar section of an area theme, written into `S` from `bar0`. */
const composeChip = (S: Score, bar0: number, spec: ChipSpec, prog: number[], rng: Rng, variant: number): void => {
  const rhythm = RHYTHMS[Math.floor(rng() * RHYTHMS.length)]!
  // A 2-bar motif, then its answer (repeat with a sequence up / cadence)
  let deg = prog[0]! + 7 * 2
  const motif: Array<{ step: number; deg: number; len: number }> = []
  for (let s = 0; s < 32; s++) {
    if (rhythm[s % 16] !== 'x') continue
    const chordRoot = prog[Math.floor(s / 16)]!
    if (s % 4 === 0) {
      // snap to the nearest chord tone
      const tones = [chordRoot, chordRoot + 2, chordRoot + 4].map(t => t + 14)
      deg = tones.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a))
    } else {
      deg += Math.round((rng() - 0.5) * 4)
    }
    let len = 1
    for (let k = s + 1; k < 32 && rhythm[k % 16] !== 'x'; k++) len++
    motif.push({ step: s, deg, len: Math.min(len, 4) })
  }
  const at = (step: number, i: Inst, m: number, len: number, p?: number): void =>
    S.add(bar0 + Math.floor(step / 16), step % 16, i, m, len, 1, p)
  // Lead sits an octave above the arpeggio so the two never mask each other.
  for (const m of motif) at(m.step, 'cLead', scaleNote(spec, m.deg, 1), m.len, spec.leadDuty)
  const lift = variant === 1 ? 1 : variant === 2 ? -1 : 2
  for (const m of motif) {
    const d = m.step >= 24 && m === motif[motif.length - 1] ? prog[3]! + 14 : m.deg + lift
    at(m.step + 32, 'cLead', scaleNote(spec, d, 1), m.len, spec.leadDuty)
  }
  for (let bar = 0; bar < 4; bar++) {
    const r = prog[bar]!
    for (let e = 0; e < 8; e++) {
      const walk = e === 7 && rng() < 0.5 ? scaleNote(spec, r + 4, 0) : scaleNote(spec, r, e % 2)
      at(bar * 16 + e * 2, 'cBass', walk, 2)
    }
    const chord = [r, r + 2, r + 4, r + 7]
    const order = variant === 2 ? [3, 2, 1, 0, 2, 1] : [0, 1, 2, 3, 2, 1]
    for (let k = 0; k < 16; k++) at(bar * 16 + k, 'cArp', scaleNote(spec, chord[order[k % order.length]!]!, 2), 1, spec.arpDuty)
    for (let k = 0; k < 16; k++) {
      const s = bar * 16 + k
      let kick = false
      let snare = false
      let hat = false
      if (spec.drums === 'drive') {
        kick = k === 0 || k === 8 || (k === 10 && rng() < 0.4) || (k === 6 && bar % 2 === 1)
        snare = k === 4 || k === 12
        hat = k % 2 === 0
      } else if (spec.drums === 'march') {
        kick = k === 0 || k === 6 || k === 8
        snare = k === 4 || k === 12 || (k === 14 && bar === 3)
        hat = k % 2 === 0 || k === 15
      } else {
        kick = k === 0
        snare = k === 8
        hat = k % 4 === 2
      }
      if (kick) at(s, 'cKick', 0, 1)
      if (snare) at(s, 'cSnare', 0, 1)
      if (hat) at(s, 'cHat', 0, 1)
    }
  }
}

const chipSong = (id: ChipId): Song => {
  const spec = CHIP[id]
  const S = new Score(16)
  const rng = mulberry32(spec.seed)
  composeChip(S, 0, spec, spec.progA, rng, 0)
  composeChip(S, 4, spec, spec.progA, mulberry32(spec.seed), 1)
  composeChip(S, 8, spec, spec.progB, rng, 2)
  composeChip(S, 12, spec, spec.progA, mulberry32(spec.seed), 1)
  return {
    id,
    bpm: spec.bpm,
    bars: 16,
    loopBar: 0,
    swing: 0,
    gain: 0.7,
    reverb: { seconds: 1.2, decay: 3 },
    // The pulse lead is what grates after a minute: take the fizz off the top
    // and give it a little room, without changing the notes.
    chans: {
      chip: { lp: 4200, send: 0.12 },
      chipBass: { lp: 2500 },
      chipDrums: { lp: 7000, send: 0.05 }
    },
    steps: S.steps
  }
}

// ─── "Neon Drift" — synthwave, 100 BPM, A minor ─────────────────────────────
// intro 4 · A 8 · B (chorus) 8 · outro 4 = 24 bars, 57.6 s.

const drift = (): Song => {
  const S = new Score(24)
  const rng = mulberry32(501)
  const CH: Record<string, [string[], string]> = {
    Am: [['A3', 'C4', 'E4'], 'A2'],
    F: [['F3', 'A3', 'C4'], 'F2'],
    C: [['G3', 'C4', 'E4'], 'C3'],
    G: [['G3', 'B3', 'D4'], 'G2'],
    Dm: [['F3', 'A3', 'D4'], 'D3'],
    E: [['G#3', 'B3', 'E4'], 'E2'],
    Em: [['G3', 'B3', 'E4'], 'E2']
  }
  const prog = 'Am F C G  Am F C G Am F Dm E  F G Em Am F G E E  Am F C G'.split(/\s+/)
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3]
  const melA = [
    'E5:0:6 D5:6:2 C5:8:4 D5:12:4',
    'C5:0:6 A4:6:2 E5:8:8',
    'E5:0:4 G5:4:4 E5:8:4 D5:12:4',
    'D5:0:12 B4:12:4',
    'E5:0:6 D5:6:2 C5:8:4 D5:12:4',
    'C5:0:6 A4:6:2 C5:8:2 D5:10:2 E5:12:4',
    'F5:0:6 E5:6:2 D5:8:4 A4:12:4',
    'G#4:0:8 B4:8:4 E5:12:4'
  ]
  const melB = [
    'A5:0:8 G5:8:4 F5:12:4',
    'G5:0:8 D5:8:4 B4:12:4',
    'E5:0:6 G5:6:2 B5:8:8',
    'A5:0:12 E5:12:4',
    'A5:0:8 G5:8:4 F5:12:4',
    'G5:0:6 A5:6:2 B5:8:4 D6:12:4',
    'B5:0:8 G#5:8:8',
    'E5:0:12'
  ]
  for (let bar = 0; bar < 24; bar++) {
    const [tones, rootName] = CH[prog[bar]!]!
    const t = tones.map(note)
    const root = note(rootName)
    const sec = bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'B' : 'outro'
    const k = sec === 'A' ? bar - 4 : sec === 'B' ? bar - 12 : sec === 'outro' ? bar - 20 : bar

    for (const m of t) S.add(bar, 0, 'pad', m, 16, sec === 'B' ? 0.95 : 0.75)

    // Arpeggio: the filter opens through the intro and closes through the outro.
    const bright = sec === 'intro' ? 0.2 + 0.12 * k : sec === 'outro' ? 0.5 - 0.1 * k : sec === 'B' ? 0.75 : 0.6
    const arpTones = [t[0]! + 12, t[1]! + 12, t[2]! + 12, t[0]! + 24]
    for (let s = 0; s < 16; s++) {
      S.add(bar, s, 'pluck', arpTones[ARP[s % 8]!]!, 1, jitter(rng, s % 4 === 0 ? 0.85 : 0.55), bright)
    }

    if (sec === 'A' || sec === 'B' || (sec === 'outro' && k < 2)) {
      for (let e = 0; e < 8; e++) S.add(bar, e * 2, 'bass', root + (e === 3 || e === 7 ? 12 : 0), 2, e % 2 === 0 ? 0.95 : 0.75)
    }

    if (sec === 'intro') {
      if (k >= 2) for (const s of [2, 6, 10, 14]) S.add(bar, s, 'hat', 0, 1, 0.3 + 0.1 * (k - 2))
      if (k === 3) S.add(bar, 0, 'riser', 0, 16, 0.8)
    } else if (sec === 'A' || sec === 'B') {
      S.add(bar, 0, 'kick', 0, 1, 1)
      S.add(bar, 8, 'kick', 0, 1, 0.95)
      if (bar % 2 === 1) S.add(bar, 10, 'kick', 0, 1, 0.7)
      S.add(bar, 4, 'snare', 0, 1, 0.9)
      S.add(bar, 12, 'snare', 0, 1, 0.9)
      if (sec === 'B') {
        S.add(bar, 4, 'clap', 0, 1, 0.8)
        S.add(bar, 12, 'clap', 0, 1, 0.8)
        for (const s of [2, 6, 10, 14]) S.add(bar, s, 'ohat', 0, 1, 0.4)
      } else {
        for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, s % 4 === 2 ? 0.55 : 0.3))
      }
      if (k === 0) S.add(bar, 0, 'crash', 0, 1, 0.8)
      // Fills into the chorus and out of it.
      if (bar === 11 || bar === 19) {
        S.add(bar, 0, 'riser', 0, 16, 0.6)
        ;[57, 55, 52, 50].forEach((m, j) => S.add(bar, 12 + j, 'tom', m, 1, 0.7 + 0.08 * j))
      }
      S.line(bar, 'lead', sec === 'A' ? melA[k]! : melB[k]!, sec === 'B' ? 0.95 : 0.8)
    } else {
      // Outro: the kit thins out, the lead leaves an echo of the hook.
      if (k < 2) S.add(bar, 0, 'kick', 0, 1, 0.8)
      if (k < 3) for (const s of [2, 6, 10, 14]) S.add(bar, s, 'hat', 0, 1, 0.35 - 0.08 * k)
      if (k === 0) { S.add(bar, 0, 'crash', 0, 1, 0.6); S.line(bar, 'lead', 'E5:0:6 D5:6:2 C5:8:8', 0.6) }
      if (k === 1) S.line(bar, 'lead', 'C5:0:6 A4:6:2 E5:8:8', 0.45)
    }
  }
  return {
    id: 'drift',
    bpm: 100,
    bars: 24,
    loopBar: 0,
    swing: 0,
    gain: 0.64,
    reverb: { seconds: 2.6, decay: 2.5 },
    chans: {
      pad: { send: 0.35, lp: 1900 },
      pluck: { send: 0.3, pan: 0.2 },
      bass: {},
      lead: { send: 0.4, pan: -0.1, lp: 2400 },
      kick: { send: 0.04 },
      snare: { send: 0.5 },
      clap: { send: 0.35, pan: -0.1 },
      hat: { pan: 0.3, send: 0.08 },
      ohat: { pan: -0.3, send: 0.1 },
      crash: { send: 0.25 },
      tom: { send: 0.3 },
      riser: { send: 0.4 }
    },
    steps: S.steps
  }
}

// ─── "Deep Circuit" — lo-fi, 84 BPM, swung, C major / D dorian ──────────────
// intro 4 · A 8 · B 8 = 20 bars, 57.1 s.

const circuit = (): Song => {
  const S = new Score(20)
  const rng = mulberry32(777)
  const V: Record<string, [number[], number]> = {
    Dm9: [[53, 57, 60, 64], note('D3')],
    G13: [[53, 59, 64, 69], note('G2')],
    Cmaj9: [[52, 55, 59, 62], note('C3')],
    Am9: [[55, 59, 60, 64], note('A2')],
    Fmaj9: [[57, 60, 64, 67], note('F2')],
    Em7: [[55, 59, 62, 64], note('E2')],
    Fm9: [[56, 60, 63, 67], note('F2')],
    A7: [[55, 61, 64, 69], note('A2')],
    G7sus: [[53, 60, 62, 67], note('G2')]
  }
  const prog = ('Dm9 G13 Cmaj9 Am9  Dm9 G13 Cmaj9 Am9 Fmaj9 Em7 Dm9 G7sus  ' +
    'Fmaj9 Fm9 Em7 A7 Dm9 G13 Cmaj9 Cmaj9').split(/\s+/)
  const bellA = ['E5:0:4 G5:4:12', 'D5:0:4 G5:4:12', 'C5:0:4 F5:4:8 E5:12:4', 'D5:0:16']
  const bellB = [
    'E5:0:4 G5:4:4 A5:8:8',
    'G5:0:4 Ab5:4:4 G5:8:4 Eb5:12:4',
    'D5:0:6 E5:6:2 G5:8:8',
    'E5:0:4 C#5:4:4 A4:8:8',
    'F5:0:4 E5:4:2 D5:6:2 C5:8:4 A4:12:4',
    'B4:0:6 D5:6:2 E5:8:8',
    'D5:0:4 E5:4:4 G5:8:4 B5:12:4',
    'D6:0:12'
  ]
  for (let bar = 0; bar < 20; bar++) {
    const [voicing, root] = V[prog[bar]!]!
    const next = V[prog[(bar + 1) % 20]!]![1]
    const sec = bar < 4 ? 'intro' : bar < 12 ? 'A' : 'B'
    const k = sec === 'A' ? bar - 4 : sec === 'B' ? bar - 12 : bar
    const last = bar === 19

    // Keys, strummed a hair: a held chord, then a lighter push on the "and" of 3.
    voicing.forEach((m, j) => {
      const strum = j * 0.014
      if (sec === 'intro' || last) S.add(bar, 0, 'keys', m, 16, jitter(rng, 0.6), strum)
      else {
        S.add(bar, 0, 'keys', m, 10, jitter(rng, 0.75), strum)
        S.add(bar, 10, 'keys', m, 5, jitter(rng, 0.5), strum)
      }
    })

    // Dust under everything.
    for (let s = 0; s < 16; s++) if (rng() < 0.2) S.add(bar, s, 'crackle', 0, 1, 0.4 + rng() * 0.6)

    if (sec === 'intro') {
      if (k >= 2) for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, s % 4 === 0 ? 0.28 : 0.18))
      continue
    }

    // Bass: root, a fifth on the "and" of 3, a chromatic step into the next chord.
    S.add(bar, 0, 'sub', root, 6, 0.95)
    if (!last) {
      S.add(bar, 10, 'sub', root + 7, 3, 0.6)
      S.add(bar, 14, 'sub', next - 1, 2, 0.5)
    }

    // Boom-bap kit; the last bar of A drops out for a breath, the song's last bar just lands.
    const breakBar = bar === 11
    S.add(bar, 0, 'lkick', 0, 1, 1)
    if (!last) {
      if (!breakBar) S.add(bar, 7, 'lkick', 0, 1, 0.55)
      if (!breakBar) S.add(bar, 10, 'lkick', 0, 1, 0.8)
      S.add(bar, 4, 'lsnare', 0, 1, 0.85)
      if (!breakBar) S.add(bar, 12, 'lsnare', 0, 1, 0.9)
      for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, s % 4 === 0 ? 0.4 : 0.26))
      for (let s = 1; s < 16; s += 2) if (rng() < 0.25) S.add(bar, s, 'hat', 0, 1, 0.12)
    }

    if (sec === 'A' && k >= 4) S.line(bar, 'bell', bellA[k - 4]!, 0.6)
    if (sec === 'B') S.line(bar, 'bell', bellB[k]!, 0.75)
  }
  return {
    id: 'circuit',
    bpm: 84,
    bars: 20,
    loopBar: 0,
    swing: 0.2,
    gain: 0.89,
    reverb: { seconds: 1.8, decay: 3 },
    chans: {
      keys: { lp: 3200, send: 0.25 },
      bell: { send: 0.45, pan: 0.2 },
      sub: {},
      kick: { lp: 3000 },
      snare: { lp: 4500, send: 0.2 },
      hat: { lp: 8000, pan: -0.25 },
      crackle: { pan: 0.15 }
    },
    steps: S.steps
  }
}

// ─── "Overload" — the Core Master fight, 140 BPM, D minor ───────────────────
// intro 4 (once) · A 8 · B 8 · C (breakdown + build) 8 · A' 4 = 32 bars, 55 s;
// repeats from A, so a long fight never hears the intro twice.

const boss = (): Song => {
  const S = new Score(32)
  const rng = mulberry32(1313)
  const CH: Record<string, [string[], string]> = {
    Dm: [['D4', 'F4', 'A4'], 'D3'],
    Bb: [['D4', 'F4', 'Bb4'], 'Bb2'],
    C: [['E4', 'G4', 'C5'], 'C3'],
    Gm: [['D4', 'G4', 'Bb4'], 'G2'],
    Eb: [['Eb4', 'G4', 'Bb4'], 'Eb3'],
    A: [['C#4', 'E4', 'A4'], 'A2']
  }
  const prog = ('Dm Dm Dm A  Dm Dm Bb C Dm Dm Bb A  Gm Eb Dm A Gm Eb Dm A  ' +
    'Dm Bb Gm A Dm Bb Gm A  Dm Eb Dm A').split(/\s+/)
  // Low-string gallop: octaves and fifths only, so it sits under every chord.
  const OST = [0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 7, 0, 12, 7]
  const ACC = new Set([0, 6, 8, 12])
  const theme = [
    'D4:0:4 G4:4:8 A4:12:2 Bb4:14:2',
    'G4:0:12 F4:12:2 Eb4:14:2',
    'F4:0:4 D4:4:8 A3:12:4',
    'C#4:0:8 E4:8:8',
    'D4:0:4 G4:4:8 A4:12:2 Bb4:14:2',
    'C5:0:8 Bb4:8:4 G4:12:4',
    'A4:0:8 F4:8:4 D4:12:4',
    'E4:0:8 A4:8:8'
  ]
  const ostinato = (bar: number, v: number, root: number): void => {
    OST.forEach((o, s) => S.add(bar, s, 'str', root + o, 1, jitter(rng, ACC.has(s) ? v : v * 0.6, 0.05)))
  }
  const fullKit = (bar: number, k: number): void => {
    S.add(bar, 0, 'bkick', 0, 1, 1)
    S.add(bar, 8, 'bkick', 0, 1, 0.9)
    if (k % 2 === 1) S.add(bar, 10, 'bkick', 0, 1, 0.7)
    for (const [s, v] of [[0, 1], [3, 0.55], [6, 0.7], [8, 0.9], [11, 0.55], [14, 0.7]] as const) S.add(bar, s, 'taiko', 40, 1, v)
    S.add(bar, 4, 'snare', 0, 1, 0.8)
    S.add(bar, 12, 'snare', 0, 1, 0.85)
    for (let s = 0; s < 16; s += 2) S.add(bar, s, 'hat', 0, 1, jitter(rng, 0.22))
  }
  const tomFill = (bar: number): void => {
    ;[62, 60, 57, 55, 52, 50, 47, 45].forEach((m, j) => S.add(bar, 8 + j, 'tom', m, 1, 0.6 + 0.05 * j))
  }
  const stabs = (bar: number, chord: number[]): void => {
    for (const [s, l] of [[0, 3], [3, 3], [6, 2]] as const) for (const m of chord) S.add(bar, s, 'brass', m - 12, l, 0.85)
  }

  for (let bar = 0; bar < 32; bar++) {
    const [tones, rootName] = CH[prog[bar]!]!
    const chord = tones.map(note)
    const root = note(rootName)
    const sec = bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'B' : bar < 28 ? 'C' : 'A2'
    const k = sec === 'intro' ? bar : bar - (sec === 'A' ? 4 : sec === 'B' ? 12 : sec === 'C' ? 20 : 28)

    if (sec === 'intro') {
      if (k === 0) { S.add(bar, 0, 'hit', 0, 1, 1); for (const m of chord) S.add(bar, 0, 'choir', m, 32, 0.7) }
      if (k === 1) { S.add(bar, 0, 'taiko', 40, 1, 0.9); S.add(bar, 8, 'taiko', 40, 1, 0.8) }
      if (k >= 2) ostinato(bar, 0.55 + 0.2 * (k - 2), root)
      if (k === 2) for (const s of [0, 6, 8, 14]) S.add(bar, s, 'taiko', 40, 1, 0.75)
      if (k === 3) {
        for (let s = 0; s < 16; s += s < 8 ? 2 : 1) S.add(bar, s, 'taiko', 40, 1, 0.45 + s * 0.035)
        S.add(bar, 0, 'riser', 0, 16, 0.9)
        for (let s = 12; s < 16; s++) S.add(bar, s, 'snare', 0, 1, 0.5 + 0.1 * (s - 12))
      }
      continue
    }

    if (sec === 'A' || sec === 'A2') {
      if (k === 0) { S.add(bar, 0, 'hit', 0, 1, 0.9); S.add(bar, 0, 'crash', 0, 1, 0.9) }
      ostinato(bar, 1, root)
      fullKit(bar, k)
      if (k % 2 === 1 || sec === 'A2') stabs(bar, chord)
      if (sec === 'A' && k >= 4) for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.6)
      if ((sec === 'A' && k === 7) || (sec === 'A2' && k === 3)) tomFill(bar)
      continue
    }

    if (sec === 'B') {
      if (k === 0 || k === 4) S.add(bar, 0, 'crash', 0, 1, 0.9)
      ostinato(bar, 0.9, root)
      fullKit(bar, k)
      for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.75)
      S.line(bar, 'brass', theme[k]!, 0.95)
      S.line(bar, 'brass', theme[k]!, 0.8, -1)
      continue
    }

    // C — breakdown, then the build back into A.
    if (k === 0) S.add(bar, 0, 'hit', 0, 1, 1)
    for (const m of chord) S.add(bar, 0, 'choir', m, 16, 0.8)
    S.add(bar, 0, 'brass', root, 16, 0.5)
    S.add(bar, 0, 'brass', root + 7, 16, 0.45)
    if (k < 4) {
      S.add(bar, 0, 'taiko', 40, 1, 0.9)
      S.add(bar, 8, 'taiko', 40, 1, 0.75)
      S.add(bar, 0, 'bkick', 0, 1, 0.8)
    } else {
      ostinato(bar, 0.5 + 0.12 * (k - 4), root)
      const step = k < 6 ? 2 : 1
      for (let s = 0; s < 16; s += step) S.add(bar, s, 'taiko', 40, 1, 0.4 + 0.06 * (k - 4) + s * 0.012)
      if (k === 6) S.add(bar, 0, 'riser', 0, 32, 1)
      if (k === 7) for (let s = 0; s < 16; s++) S.add(bar, s, 'snare', 0, 1, 0.35 + s * 0.04)
    }
  }
  return {
    id: 'boss',
    bpm: 140,
    bars: 32,
    loopBar: 4,
    swing: 0,
    gain: 0.67,
    reverb: { seconds: 2.8, decay: 2.2 },
    chans: {
      str: { pan: -0.2, send: 0.2 },
      brass: { pan: 0.12, send: 0.3 },
      choir: { send: 0.55 },
      taiko: { send: 0.28 },
      kick: { send: 0.08 },
      snare: { send: 0.35, pan: 0.05 },
      hat: { pan: 0.35, send: 0.1 },
      tom: { send: 0.3 },
      hit: { send: 0.5 },
      crash: { send: 0.3 },
      riser: { send: 0.4 }
    },
    steps: S.steps
  }
}

// ─── "Wake-Up Call" — the intro cutscene's score ────────────────────────────
//
// 150 BPM, so one 16th is exactly 0.1 s and every beat of the cutscene
// (`story/introScript.ts`) has a step: step = seconds × 10. It is scored to
// the picture, not looped as a theme. Each shot is a section of its own,
// written to the shot's length — the sections breathe with the picture
// rather than being stretched — and the hits sit on the cutscene's beats.
//
// The intro plays in story order (#271): the valley, the lab, safe mode, the
// wake-up and the beam first, the street's action last. Each block is
// written at its first cut's steps and placed with an offset: the valley to
// the beam 110 steps EARLIER than written (the valley opens at 0), the street
// STREET_STEP (460, its 46 s) later.
//
// The street (written from 0):
//
//   0–32     the run: full band in E minor, the chip hero riff
//   32–56    the slide in slow motion: the band drops to half time, the riff
//            at half speed over a choir
//   56–80    the charge: a riser, a 16th bass pedal, a snare roll; the
//            release (a hit, 80)
//   80–225   the showcase: the band plays on at full tilt, a hit on each
//            move (the shot lands 82, the parry 100, the volley's blocks
//            134/140/146, drone 2 down 154, the ring 162 and the slide under
//            it 170, the finish 182, the gel's bell burst 196), the hero riff
//            on top — then the closing chord as the last pose holds (225), and
//            a groove bar to loop on, should anything hold (244–260)
//
// The valley to the beam (written from 110; it plays from 0):
//
//   110–146  the valley: G major, then C, a bright pad and a plucked
//            arpeggio; a bell on each relay chime (118, 127, 136)
//   146–194  the Red Signal: a hit on the Spire's flash (146), Vex's motif
//            (three falling square notes, low brass under them) as his face
//            comes on (150) and again as the ring rolls (174); an E-phrygian
//            choir and string ostinato, taiko, a snare roll into…
//   194–210  Blaze's cut-in: a hit (194), a tritone brass stab, a second hit
//            as his eyes lock red (203)
//   210–310  the lab: a pulsing bass under the alarm; it thins for the Atlas
//            disc's close-up (244–260, bells, the disc clicks home on 255);
//            a riser and a snare roll into the lever (284): hit, crash;
//            brass on the way down
//   310–360  safe mode: it all drops away to a cold pad and icy bells; the
//            frost glitters (327–342); a low heartbeat from 344, every 1.3 s
//            like the capsule's light
//   360–490  the wake-up: the dark pad, keys as the view sharpens (390);
//            the HUD boots (412) and the arpeggio climbs, a half-time kick;
//            the hologram (444); the hero riff returns softly (460), a riser
//   490–548  the beam: the full band, the riff at its top; the column rises
//            (522) on a D chord, a snare roll and toms
//   548      the flash: the whole band on one E-major chord, ringing out
//            into the street
//
// Its `gain` is matched to the other songs with tools/music-render.mjs.

/** Where the street's block starts (16ths): its 46 s in the script. */
const STREET_STEP = 460

const intro = (): Song => {
  const S = new Score(45)
  const rng = mulberry32(1700)
  /** Where the block being written lands: the street STREET_STEP later,
   *  the valley to the beam 110 earlier. */
  let off = STREET_STEP
  /** Add at an absolute 16th (0.1 s each). */
  const at = (step: number, i: Inst, m: number | string, len: number, v: number, p?: number): void =>
    S.add(0, step + off, i, typeof m === 'string' ? note(m) : m, len, v, p)
  /** A melody written as "E5:0:6 D5:6:2" (note:step:length), from `from`. */
  const line = (from: number, i: Inst, text: string, v: number, octave = 0): void => {
    for (const tok of text.trim().split(/\s+/)) {
      const [n, st, l] = tok.split(':')
      at(from + Number(st), i, note(n!) + 12 * octave, Number(l), v)
    }
  }
  const kit = (from: number, to: number, o: { kick?: number; snare?: 8 | 16; hats?: 8 | 16; v?: number } = {}): void => {
    const v = o.v ?? 1
    for (let s = from; s < to; s++) {
      const b = s - from
      if (o.kick && b % o.kick === 0) at(s, 'kick', 0, 1, 0.95 * v)
      // Backbeat every 8 16ths; half time (the slow motion) every 16.
      if (o.snare && b % o.snare === o.snare / 2) { at(s, 'snare', 0, 1, 0.85 * v); at(s, 'clap', 0, 1, 0.4 * v) }
      if (o.hats === 16) at(s, 'hat', 0, 1, jitter(rng, (b % 2 ? 0.22 : 0.34) * v))
      if (o.hats === 8 && b % 2 === 0) at(s, 'hat', 0, 1, jitter(rng, 0.3 * v))
    }
  }
  const bassLine = (from: number, notes: string[], step = 2, v = 0.9): void => {
    notes.forEach((n, j) => at(from + j * step, 'bass', n, step, jitter(rng, j % 4 === 0 ? v : v * 0.8, 0.05)))
  }
  const chord = (step: number, i: Inst, notes: string[], len: number, v: number): void => {
    for (const n of notes) at(step, i, n, len, v)
  }
  /** A snare roll that tightens from 8ths to 16ths and swells. */
  const roll = (from: number, to: number, v0: number, v1: number): void => {
    const half = from + Math.floor((to - from) / 2)
    for (let s = from; s < to; s += s < half ? 2 : 1) at(s, 'snare', 0, 1, v0 + ((v1 - v0) * (s - from)) / (to - from))
  }

  // ── 0–32 · Cold open: the run ──
  at(0, 'hit', 0, 1, 0.85)
  at(0, 'crash', 0, 1, 0.8)
  kit(0, 32, { kick: 4, snare: 8, hats: 16 })
  bassLine(0, ['E2', 'E2', 'E3', 'E2', 'G2', 'E2', 'A2', 'B2', 'C3', 'C3', 'C4', 'C3', 'D3', 'D3', 'D4', 'D3'])
  const riff = 'E5:0:2 G5:2:2 A5:4:2 B5:6:3 A5:9:1 G5:10:2 E5:12:4 D5:16:2 E5:18:2 G5:20:2 A5:22:3 B5:25:1 G5:26:2 E5:28:4'
  line(0, 'cLead', riff, 0.75)
  line(0, 'lead', riff, 0.45, -1)

  // ── 32–56 · The slide, in slow motion: half time ──
  at(32, 'crash', 0, 1, 0.55)
  at(32, 'bkick', 0, 1, 0.8)
  kit(32, 56, { kick: 16, snare: 16, hats: 8, v: 0.8 })
  at(32, 'bass', 'E2', 8, 0.85)
  at(40, 'bass', 'C3', 8, 0.8)
  at(48, 'bass', 'D3', 8, 0.8)
  chord(32, 'choir', ['E3', 'G3', 'B3'], 24, 0.4)
  const slow = 'E5:32:4 G5:36:4 A5:40:4 B5:44:6 A5:50:2 G5:52:4'
  line(0, 'cLead', slow, 0.7)
  line(0, 'lead', slow, 0.45, -1)

  // ── 56–80 · The charge, and the release (80); the freeze cuts it all at 81 ──
  kit(56, 80, { kick: 4, hats: 16, v: 0.85 })
  for (let s = 56; s < 80; s++) at(s, 'bass', 'E2', 1, jitter(rng, 0.5 + 0.018 * (s - 56), 0.05))
  chord(56, 'choir', ['E3', 'B3', 'E4'], 24, 0.4)
  at(56, 'riser', 0, 24, 0.8)
  roll(60, 80, 0.3, 0.75)
  at(80, 'hit', 0, 1, 1)
  at(80, 'crash', 0, 1, 0.7)
  at(80, 'bkick', 0, 1, 1)

  // ── 80–225 · The showcase: the band plays on, a hit on every move ──
  kit(88, 224, { kick: 4, snare: 8, hats: 16, v: 0.9 })
  for (const from of [88, 120, 152, 184]) {
    bassLine(from, ['E2', 'E2', 'E3', 'E2', 'G2', 'E2', 'A2', 'B2', 'C3', 'C3', 'C4', 'C3', 'D3', 'D3', 'D4', 'D3'], 2, 0.85)
  }
  for (let s = 216; s < 225; s++) at(s, 'bass', 'E2', 1, jitter(rng, 0.7, 0.05))
  // The shot lands: the Trooper staggers.
  at(82, 'hit', 0, 1, 0.8)
  at(82, 'bkick', 0, 1, 0.9)
  chord(82, 'choir', ['E3', 'B3', 'E4'], 18, 0.35)
  // The dive and the parry.
  at(90, 'riser', 0, 10, 0.5)
  at(100, 'hit', 0, 1, 0.9)
  at(100, 'crash', 0, 1, 0.75)
  line(88, 'cLead', riff, 0.6)
  line(88, 'lead', riff, 0.4, -1)
  // The volley: a taiko under each block, the answer's hit.
  for (const s of [134, 140, 146]) { at(s, 'taiko', 40, 1, 0.85); at(s, 'bkick', 0, 1, 0.7) }
  chord(126, 'brass', ['E3', 'G3', 'B3'], 6, 0.5)
  at(154, 'hit', 0, 1, 0.75)
  at(154, 'crash', 0, 1, 0.6)
  // The ring rolls out; the slide under it; the finish.
  at(152, 'riser', 0, 18, 0.7)
  at(162, 'taiko', 40, 1, 0.9)
  roll(162, 170, 0.35, 0.8)
  at(170, 'hit', 0, 1, 0.85)
  chord(170, 'brass', ['C3', 'E3', 'G3'], 8, 0.6)
  at(182, 'hit', 0, 1, 1)
  at(182, 'crash', 0, 1, 0.85)
  at(182, 'bkick', 0, 1, 1)
  // The gel: a bell burst climbing, the choir in E major; the hero riff at
  // the top into the freeze.
  for (const [s, n] of [[190, 'B5'], [192, 'E6'], [194, 'G#6'], [196, 'B6']] as const) at(s, 'bell', n, 4, 0.42)
  chord(196, 'choir', ['E3', 'G#3', 'B3', 'E4'], 28, 0.5)
  line(200, 'cLead', 'E5:0:2 G5:2:2 A5:4:2 B5:6:3 D6:9:1 E6:10:6 D6:16:2 B5:18:2 E6:20:4', 0.75)
  line(200, 'lead', 'E5:0:2 G5:2:2 A5:4:2 B5:6:3 D6:9:1 E6:10:6 D6:16:2 B5:18:2 E6:20:4', 0.45, -1)
  // The last pose: one E-major chord ringing out as the tutorial takes over.
  at(225, 'hit', 0, 1, 0.9)
  at(225, 'crash', 0, 1, 0.8)
  chord(225, 'choir', ['E3', 'G#3', 'B3', 'E4'], 16, 0.55)
  chord(225, 'brass', ['E2', 'B2', 'E3'], 12, 0.6)
  // ── 244–260 · A groove to hold on (the loop) ──
  kit(244, 260, { kick: 4, hats: 8, v: 0.8 })
  bassLine(244, ['E2', 'E2', 'E3', 'E2', 'G2', 'E2', 'A2', 'B2'], 2, 0.75)
  chord(244, 'pad', ['E3', 'G3', 'B3'], 16, 0.35)

  // The valley to the beam: it opens the intro, 110 steps earlier than written.
  off = -110

  // ── 110–146 · The valley, before ──
  chord(110, 'pad', ['G3', 'B3', 'D4', 'G4'], 18, 0.5)
  chord(128, 'pad', ['C4', 'E4', 'G4', 'D5'], 18, 0.48)
  at(110, 'sub', 'G1', 18, 0.6)
  at(128, 'sub', 'C2', 18, 0.55)
  const arp = ['G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D5']
  const arpC = ['C5', 'E5', 'G5', 'D6', 'G5', 'E5', 'C5', 'G5']
  for (let s = 110; s < 146; s += 2) {
    const j = (s - 110) / 2
    at(s, 'pluck', (s < 128 ? arp : arpC)[j % 8]!, 2, jitter(rng, 0.38 + j * 0.004, 0.06))
  }
  at(118, 'bell', 'G5', 4, 0.4)
  at(127, 'bell', 'D6', 4, 0.3)
  at(136, 'bell', 'B5', 4, 0.3)

  // ── 146–194 · The Red Signal ──
  at(146, 'hit', 0, 1, 0.9)
  at(146, 'bkick', 0, 1, 0.9)
  at(146, 'sub', 'E1', 48, 0.75)
  // Vex's motif: three falling square notes, low brass under them — as his
  // face comes on, and again as his ring rolls over the valley.
  for (const [s0, v] of [[150, 0.9], [174, 0.8]] as const) {
    at(s0, 'cLead', 'E5', 3, v, 0.5)
    at(s0 + 3, 'cLead', 'C5', 3, v, 0.5)
    at(s0 + 6, 'cLead', 'A#4', 8, v, 0.5)
    at(s0, 'brass', 'E3', 3, v * 0.78)
    at(s0 + 3, 'brass', 'C3', 3, v * 0.78)
    at(s0 + 6, 'brass', 'A#2', 8, v * 0.83)
  }
  chord(158, 'choir', ['E3', 'G3', 'B3', 'F4'], 36, 0.5)
  for (let s = 158; s < 194; s += 2) at(s, 'str', (s / 2) % 4 === 3 ? 'F2' : 'E2', 2, 0.5 + (s - 158) * 0.007)
  for (const s of [158, 166, 174, 178, 182, 186, 188, 190, 192]) at(s, 'taiko', 40, 1, 0.8)
  for (const s of [158, 166, 174, 182, 190]) at(s, 'lkick', 0, 1, 0.8)
  roll(186, 194, 0.35, 0.7)
  // ── 194–210 · Blaze Master's cut-in ──
  at(194, 'hit', 0, 1, 0.8)
  at(194, 'taiko', 40, 1, 0.9)
  chord(194, 'brass', ['A#2', 'E3'], 6, 0.7)
  for (let s = 194; s < 210; s += 2) at(s, 'bass', 'E2', 2, jitter(rng, 0.7, 0.05))
  at(203, 'hit', 0, 1, 0.7)
  at(203, 'lkick', 0, 1, 0.85)
  chord(203, 'brass', ['E2', 'A#2'], 7, 0.75)
  for (const s of [198, 206]) at(s, 'taiko', 40, 1, 0.7)

  // ── 210–310 · The lab ──
  chord(210, 'choir', ['E3', 'G3', 'B3'], 34, 0.45)
  chord(244, 'choir', ['C3', 'E3', 'G3', 'B3'], 16, 0.4)
  chord(260, 'choir', ['E3', 'G3', 'B3'], 24, 0.45)
  for (let s = 210; s < 284; s++) {
    // Under the disc's close-up it thins to 8ths.
    if (s >= 244 && s < 260 && s % 2) continue
    at(s, 'bass', Math.floor((s - 210) / 8) % 2 ? 'F2' : 'E2', 1, jitter(rng, s % 4 === 1 ? 0.85 : 0.55, 0.05))
  }
  kit(210, 244, { kick: 4, hats: 8, v: 0.85 })
  kit(244, 260, { hats: 8, v: 0.5 })
  kit(260, 284, { kick: 4, hats: 8, v: 0.85 })
  for (let s = 214; s < 268; s += 8) if (s < 244 || s >= 260) at(s, 'snare', 0, 1, 0.7)
  // The Atlas disc: bells climbing to it clicking home (255).
  for (const [s, n] of [[246, 'B5'], [249, 'E6'], [252, 'F#6'], [255, 'B6']] as const) at(s, 'bell', n, 4, 0.4)
  chord(255, 'pluck', ['E5', 'B5', 'E6'], 3, 0.4)
  at(268, 'riser', 0, 16, 0.85)
  roll(276, 284, 0.4, 0.9)
  // The lever: hit, crash, and the weight coming down.
  at(284, 'hit', 0, 1, 1)
  at(284, 'crash', 0, 1, 0.85)
  at(284, 'bkick', 0, 1, 1)
  at(284, 'taiko', 40, 1, 0.9)
  chord(284, 'brass', ['C3', 'E3', 'G3'], 8, 0.7)
  chord(292, 'brass', ['B2', 'D#3', 'F#3'], 8, 0.7)
  at(284, 'sub', 'C2', 8, 0.6)
  at(292, 'sub', 'B1', 8, 0.6)
  for (const [s, v] of [[290, 0.75], [298, 0.6], [306, 0.45]] as const) at(s, 'lkick', 0, 1, v)

  // ── 310–360 · Safe mode: it all drops away ──
  chord(310, 'pad', ['E3', 'B3', 'F#4', 'G4'], 50, 0.42)
  for (const [s, n] of [[314, 'B5'], [320, 'G5'], [326, 'F#5'], [338, 'E5'], [348, 'D5'], [354, 'B4']] as const) at(s, 'bell', n, 4, 0.4)
  // The frost: icy glitter up the glass.
  const ice = ['E6', 'F#6', 'B6', 'G6', 'E7']
  for (let s = 327; s < 342; s += 3) at(s, 'bell', ice[((s - 327) / 3) % ice.length]!, 2, jitter(rng, 0.22))
  // The capsule's heartbeat, every 1.3 s from 34.4 s, on into the dark.
  for (let s = 344; s < 412; s += 13) at(s, 'lkick', 0, 1, 0.35)

  // ── 360–490 · The wake-up ──
  chord(360, 'pad', ['E3', 'G3', 'B3', 'D4'], 52, 0.36)
  chord(412, 'pad', ['C3', 'E3', 'G3', 'B3'], 32, 0.34)
  chord(444, 'pad', ['E3', 'G3', 'B3', 'F#4'], 46, 0.34)
  at(360, 'sub', 'E1', 52, 0.4)
  at(390, 'keys', 'B4', 4, 0.35)
  at(394, 'keys', 'G4', 6, 0.3)
  // The HUD boots: the arpeggio climbs, in 8ths, then 16ths once the
  // hologram is up, an octave higher for the riff.
  const rise = ['E4', 'G4', 'B4', 'E5']
  for (let s = 412; s < 490; s += s < 444 ? 2 : 1) {
    const oct = s >= 464 ? 12 : 0
    at(s, 'pluck', note(rise[Math.floor((s - 412) / (s < 444 ? 2 : 1)) % 4]!) + oct, 1, Math.min(0.55, 0.25 + (s - 412) * 0.004))
  }
  for (let s = 422; s < 490; s += 8) at(s, 'kick', 0, 1, 0.7)
  for (let s = 422; s < 490; s += 4) at(s, 'bass', s % 8 === 6 ? 'E2' : 'E3', 3, 0.65)
  for (let s = 444; s < 490; s += 2) at(s, 'hat', 0, 1, 0.24)
  for (const s of [474, 478, 482, 486]) at(s, 'snare', 0, 1, 0.5)
  line(0, 'cLead', 'E5:460:2 G5:462:2 A5:464:4 B5:468:2 A5:470:2 G5:472:4 D5:476:2 E5:478:2 G5:480:2 A5:482:4 B5:486:4', 0.5)
  at(466, 'riser', 0, 24, 0.9)

  // ── 490–548 · The beam ──
  kit(490, 522, { kick: 4, snare: 8, hats: 16 })
  bassLine(490, ['C3', 'C3', 'C4', 'C3', 'D3', 'D3', 'D4', 'D3', 'C3', 'C3', 'C4', 'C3', 'D3', 'D3', 'D4', 'D3'])
  const top = 'E5:490:2 G5:492:2 A5:494:2 B5:496:2 D6:498:3 B5:501:1 E6:502:4 D6:506:2 B5:508:2 A5:510:2 B5:512:2 D6:514:3 E6:517:5'
  line(0, 'cLead', top, 0.85)
  line(0, 'lead', top, 0.5, -1)
  chord(490, 'choir', ['C4', 'E4', 'G4'], 16, 0.45)
  chord(506, 'choir', ['D4', 'F#4', 'A4'], 16, 0.5)
  // The column rises: a D chord swelling under a riser, the roll, the toms.
  kit(522, 540, { kick: 4, hats: 16, v: 0.9 })
  for (let s = 522; s < 548; s += 2) at(s, 'bass', s % 4 ? 'D3' : 'D2', 2, 0.75)
  chord(522, 'choir', ['D4', 'F#4', 'A4', 'D5'], 26, 0.5)
  at(522, 'riser', 0, 26, 0.9)
  roll(532, 548, 0.45, 0.95)
  ;[57, 55, 52, 50].forEach((m, j) => at(544 + j, 'tom', m, 1, 0.7 + 0.07 * j))
  for (const s of [540, 542, 544, 546]) at(s, 'kick', 0, 1, 0.9)

  // ── 548 · The flash: one E-major chord, the whole band ──
  at(548, 'hit', 0, 1, 1)
  at(548, 'crash', 0, 1, 1)
  at(548, 'bkick', 0, 1, 1)
  chord(548, 'choir', ['E3', 'G#3', 'B3', 'E4'], 22, 0.75)
  chord(548, 'brass', ['E2', 'B2', 'E3'], 22, 0.8)
  at(548, 'sub', 'E1', 22, 0.8)
  at(548, 'cLead', 'E6', 12, 0.6)

  return {
    id: 'intro',
    bpm: 150,
    bars: 45,
    loopBar: 44,
    swing: 0,
    // Its loud sections (cold open, beam) sit at the boss fight's level; the
    // whole pass, quiet shots included, at the Scrapyard's it hands over to.
    gain: 0.5,
    reverb: { seconds: 2.4, decay: 2.3 },
    chans: {
      chip: { send: 0.25, pan: 0.05 },
      lead: { send: 0.35, pan: -0.1, lp: 2600 },
      bass: {},
      sub: {},
      pad: { send: 0.4, lp: 2000 },
      pluck: { send: 0.3, pan: 0.2 },
      bell: { send: 0.5, pan: -0.15 },
      brass: { pan: 0.1, send: 0.3 },
      choir: { send: 0.5 },
      str: { pan: -0.2, send: 0.2 },
      kick: { send: 0.05 },
      lkick: { send: 0.1 },
      snare: { send: 0.35, pan: 0.05 },
      clap: { send: 0.3, pan: -0.1 },
      hat: { pan: 0.3, send: 0.08 },
      taiko: { send: 0.28 },
      tom: { send: 0.3 },
      hit: { send: 0.5 },
      crash: { send: 0.3 },
      riser: { send: 0.4 },
      crackle: { send: 0.2 }
    },
    steps: S.steps
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

const cache = new Map<SongId, Song>()

/** The song, composed on first use (a few ms) and kept. */
export const getSong = (id: SongId): Song => {
  const hit = cache.get(id)
  if (hit) return hit
  const s = id === 'drift' ? drift() : id === 'circuit' ? circuit() : id === 'boss' ? boss() : id === 'intro' ? intro() : chipSong(id)
  cache.set(id, s)
  return s
}

/** Length of one pass through a song, in seconds. */
export const songSeconds = (s: Song): number => (s.bars * 16 * 60) / s.bpm / 4

/** Result-screen fanfares, on the chiptune voices. */
export const playJingleNotes = (ctx: BaseAudioContext, dest: AudioNode, kind: 'victory' | 'defeat'): Out => {
  const o = makeOut(ctx, dest, { ...getSong('hub'), gain: 1 })
  const t0 = ctx.currentTime + 0.05
  const notes = kind === 'victory'
    ? [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.6], [84, 0.72], [88, 0.84]]
    : [[67, 0], [63, 0.2], [60, 0.4], [55, 0.7]]
  const d = kind === 'victory' ? 0.22 : 0.35
  for (const [m, dt] of notes) chipVoice(o, t0 + dt!, d, m!, 'lead', 0.25)
  for (const [m, dt] of notes) chipVoice(o, t0 + dt!, d, m! - 24, 'bass', 0.5)
  return o
}
