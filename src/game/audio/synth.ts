import { registerOneShotSource } from '@/use/useAssets'
import { audio, canPlay, noise, pulse, midiHz, duckMusic } from './engine'
import { setSfxPlayer, type SfxName } from './sfx'
import { SFX_FILES } from '../assets/overrides'

/**
 * ─── Chiptune SFX ────────────────────────────────────────────────────────────
 *
 * Every sound effect is a tiny recipe on three voices — a pulse wave (12.5 /
 * 25 / 50 % duty), a triangle, and noise through a filter — the palette of the
 * 8-bit era. Recipes are pitched sweeps, arpeggios and bursts; nothing is
 * sampled, so the whole SFX set costs zero bytes of download.
 *
 * Every source is registered with `registerOneShotSource`, so an ad or a
 * platform mute hard-stops in-flight sounds (the suspend gate alone would only
 * freeze them).
 */

type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'saw' | 'sine'

interface ToneOpts {
  wave: Wave
  f0: number
  f1?: number
  dur: number
  vol: number
  at?: number
  attack?: number
  exp?: boolean
  vib?: number
  vibRate?: number
  pan?: number
}

let busOut: GainNode | null = null
const panners: StereoPannerNode[] = []
/** A muffled sound's low-pass (see `play`): while its recipe runs, every
 *  voice routes through it on its way to the sfx bus. */
let route: BiquadFilterNode | null = null
/** The current recipe's pitch factor (see `VARY`): every voice it starts is
 *  tuned by it. 1 outside `play`. */
let pitch = 1

const out = (pan: number): AudioNode | null => {
  const a = audio()
  if (!a) return null
  if (!busOut) busOut = a.sfx
  const bus = route ?? a.sfx
  if (!pan || !('createStereoPanner' in a.ctx)) return bus
  const p = a.ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(bus)
  panners.push(p)
  if (panners.length > 64) panners.shift()?.disconnect()
  return p
}

const tone = (o: ToneOpts): void => {
  const a = audio()
  if (!a) return
  const dest = out(o.pan ?? 0)
  if (!dest) return
  const t = a.ctx.currentTime + (o.at ?? 0)
  const osc = a.ctx.createOscillator()
  if (o.wave === 'tri') osc.type = 'triangle'
  else if (o.wave === 'saw') osc.type = 'sawtooth'
  else if (o.wave === 'sine') osc.type = 'sine'
  else {
    const w = pulse(o.wave === 'p12' ? 0.125 : o.wave === 'p25' ? 0.25 : 0.5)
    if (w) osc.setPeriodicWave(w)
  }
  osc.frequency.setValueAtTime(o.f0 * pitch, t)
  if (o.f1 !== undefined) {
    if (o.exp !== false) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * pitch), t + o.dur)
    else osc.frequency.linearRampToValueAtTime(o.f1 * pitch, t + o.dur)
  }
  if (o.vib) {
    const lfo = a.ctx.createOscillator()
    const lg = a.ctx.createGain()
    lfo.frequency.value = o.vibRate ?? 14
    lg.gain.value = o.vib
    lfo.connect(lg).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + o.dur + 0.05)
  }
  const g = a.ctx.createGain()
  const atk = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  osc.connect(g).connect(dest)
  osc.start(t)
  osc.stop(t + o.dur + 0.02)
  registerOneShotSource(osc)
}

interface NoiseOpts {
  dur: number
  vol: number
  type?: BiquadFilterType
  f0?: number
  f1?: number
  q?: number
  at?: number
  pan?: number
}

const burst = (o: NoiseOpts): void => {
  const a = audio()
  const buf = noise()
  if (!a || !buf) return
  const dest = out(o.pan ?? 0)
  if (!dest) return
  const t = a.ctx.currentTime + (o.at ?? 0)
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = a.ctx.createBiquadFilter()
  f.type = o.type ?? 'lowpass'
  f.Q.value = o.q ?? 0.8
  f.frequency.setValueAtTime((o.f0 ?? 4000) * pitch, t)
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 * pitch), t + o.dur)
  const g = a.ctx.createGain()
  g.gain.setValueAtTime(o.vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g).connect(dest)
  src.start(t, Math.random() * 0.5)
  src.stop(t + o.dur + 0.02)
  registerOneShotSource(src)
}

/** Quick note run (MIDI numbers), e.g. pickups and fanfares. */
const arp = (notes: number[], step: number, wave: Wave, vol: number, len = step * 1.4, at = 0, pan = 0): void => {
  notes.forEach((n, i) => tone({ wave, f0: midiHz(n), dur: len, vol, at: at + i * step, pan }))
}

// Voice limiting: the same sound can only retrigger every `gap` seconds.
const lastAt = new Map<string, number>()
const GAP: Partial<Record<SfxName, number>> = {
  shoot: 0.04, hit: 0.035, bolt: 0.05, tink: 0.05, enemyShot: 0.06, explode: 0.06, alert: 0.12, uiClick: 0.03,
  // Two traps in earshot must not stack into one loud chord.
  bladeWhoosh: 0.2, trapHiss: 0.3, flameJet: 0.3, gust: 1,
  // The exit drone's rotor pulses overlap on purpose, never faster than this.
  droneHum: 0.2, droneHumHi: 0.15,
  // Hits from several sides at once: one hurt, not a stutter of them.
  hurt: 0.13,
  // The incoming-shot warning: a volley whizzes once.
  whizz: 0.5,
  // Heavy hits: a stampede is one thud per beat, not a drum roll.
  stomp: 0.09, hitHeavy: 0.06, crit: 0.06, punch: 0.07, dash: 0.1, lob: 0.08
}

/**
 * The sounds heard dozens of times a minute get a small random pitch (±4 %)
 * and level (±10 %) each time, so a fight is not one sample on repeat.
 */
const VARY: ReadonlySet<SfxName> = new Set<SfxName>([
  'shoot', 'hit', 'hitHeavy', 'bolt', 'tink', 'explode', 'stomp', 'enemyShot', 'punch', 'crit'
])

/** The big stings: the music steps back under them (seconds). */
const DUCK_FOR: Partial<Record<SfxName, number>> = { bossIntro: 1.6, levelUp: 1.4, challenge: 1.3 }

/** The loudest hits, trimmed 2–3 dB under the frequent ones (#114 mix pass). */
const TRIM: Partial<Record<SfxName, number>> = { explode: 0.75, stomp: 0.8, chargeShotBig: 0.85 }

/**
 * At most this many sounds start in any `CAP_WINDOW` seconds. A big fight can
 * fire hits, shots, sparks and stomps at once; past the cap the frequent small
 * sounds are dropped, never the rare important ones (`NEVER_DROP`).
 */
const CAP = 24
const CAP_WINDOW = 0.25
const recent: number[] = []
const NEVER_DROP: ReadonlySet<SfxName> = new Set<SfxName>([
  'hurt', 'bossIntro', 'challenge', 'levelUp', 'charge1', 'charge2', 'charge3', 'chargeShot', 'chargeShotBig', 'parry', 'denied', 'uiClick', 'uiOpen', 'uiClose', 'objective', 'heartbeat'
])

/** Open (a muffle of 0 has no filter at all) and fully muffled cutoffs (Hz). */
const OPEN_HZ = 16000
const MUFFLED_HZ = 850
/** The low-pass cutoff for a muffle of 0..1, on an exponential (pitch) scale. */
export const muffleHz = (muffle: number): number =>
  OPEN_HZ * Math.pow(MUFFLED_HZ / OPEN_HZ, Math.max(0, Math.min(1, muffle)))

const RECIPES: Record<SfxName, (pan: number, g: number) => void> = {
  // ── Buster ──
  shoot: (p, g) => {
    tone({ wave: 'p25', f0: 1500, f1: 520, dur: 0.07, vol: 0.28 * g, pan: p })
    tone({ wave: 'p12', f0: 2200, f1: 900, dur: 0.05, vol: 0.12 * g, pan: p })
  },
  charge1: (p, g) => arp([79, 84], 0.045, 'p12', 0.16 * g, 0.06, 0, p),
  charge2: (p, g) => arp([84, 88, 91, 96], 0.035, 'p12', 0.18 * g, 0.05, 0, p),
  // The Overload locks in: a lower, wider run on a rounder wave than charge2.
  charge3: (p, g) => arp([72, 79, 84, 88, 91], 0.04, 'p25', 0.2 * g, 0.08, 0, p),
  chargeShot: (p, g) => {
    tone({ wave: 'p50', f0: 900, f1: 180, dur: 0.18, vol: 0.32 * g, pan: p })
    burst({ dur: 0.12, vol: 0.18 * g, f0: 5000, f1: 800, pan: p })
  },
  chargeShotBig: (p, g) => {
    tone({ wave: 'p50', f0: 1100, f1: 110, dur: 0.32, vol: 0.4 * g, pan: p })
    tone({ wave: 'p25', f0: 1650, f1: 220, dur: 0.26, vol: 0.18 * g, pan: p })
    burst({ dur: 0.25, vol: 0.26 * g, f0: 6000, f1: 300, pan: p })
  },
  // ── Impacts ──
  hit: (p, g) => {
    burst({ dur: 0.06, vol: 0.22 * g, type: 'bandpass', f0: 2400, q: 1.2, pan: p })
    tone({ wave: 'p50', f0: 320, f1: 140, dur: 0.06, vol: 0.14 * g, pan: p })
  },
  hitHeavy: (p, g) => {
    burst({ dur: 0.14, vol: 0.32 * g, f0: 3000, f1: 400, pan: p })
    tone({ wave: 'p50', f0: 220, f1: 70, dur: 0.14, vol: 0.28 * g, pan: p })
  },
  crit: (p, g) => {
    arp([96, 91, 100], 0.03, 'p12', 0.16 * g, 0.05, 0, p)
    burst({ dur: 0.16, vol: 0.28 * g, f0: 7000, f1: 900, pan: p })
  },
  tink: (p, g) => {
    tone({ wave: 'tri', f0: 2600, f1: 2300, dur: 0.12, vol: 0.28 * g, pan: p })
    tone({ wave: 'p12', f0: 3900, dur: 0.04, vol: 0.1 * g, pan: p })
  },
  guardBreak: (p, g) => {
    burst({ dur: 0.28, vol: 0.34 * g, f0: 5000, f1: 500, pan: p })
    arp([72, 67, 60], 0.05, 'p50', 0.2 * g, 0.07, 0, p)
  },
  explode: (p, g) => {
    burst({ dur: 0.45, vol: 0.42 * g, f0: 3200, f1: 120, pan: p })
    tone({ wave: 'p50', f0: 160, f1: 40, dur: 0.35, vol: 0.3 * g, pan: p })
  },
  // ── Enemy actions ──
  enemyShot: (p, g) => tone({ wave: 'p25', f0: 520, f1: 900, dur: 0.08, vol: 0.14 * g, pan: p }),
  // A shot about to land from off-screen: a quick falling air-rip from its
  // side (a Doppler drop), quiet — a warning, not an alarm.
  whizz: (p, g) => {
    burst({ dur: 0.2, vol: 0.13 * g, type: 'bandpass', f0: 5200, f1: 1300, q: 2.6, pan: p })
    tone({ wave: 'tri', f0: 1900, f1: 720, dur: 0.17, vol: 0.05 * g, pan: p })
  },
  lob: (p, g) => tone({ wave: 'p12', f0: 1400, f1: 300, dur: 0.45, vol: 0.12 * g, exp: false, pan: p }),
  jump: (p, g) => tone({ wave: 'p25', f0: 180, f1: 700, dur: 0.18, vol: 0.18 * g, pan: p }),
  stomp: (p, g) => {
    burst({ dur: 0.35, vol: 0.4 * g, f0: 900, f1: 80, pan: p })
    tone({ wave: 'tri', f0: 110, f1: 38, dur: 0.35, vol: 0.4 * g, pan: p })
  },
  dash: (p, g) => burst({ dur: 0.3, vol: 0.2 * g, type: 'bandpass', f0: 600, f1: 3000, q: 2, pan: p }),
  bonk: (p, g) => {
    tone({ wave: 'p50', f0: 260, f1: 90, dur: 0.18, vol: 0.28 * g, pan: p })
    arp([88, 91], 0.07, 'tri', 0.12 * g, 0.08, 0.1, p)
  },
  punch: (p, g) => {
    burst({ dur: 0.1, vol: 0.28 * g, f0: 1400, f1: 200, pan: p })
    tone({ wave: 'p50', f0: 150, f1: 60, dur: 0.1, vol: 0.2 * g, pan: p })
  },
  alert: (p, g) => arp([81, 88], 0.07, 'p25', 0.14 * g, 0.07, 0, p),
  // ── Player state ──
  // From the side the hit came from (`state/damageFeed.ts`): the impact's
  // crack at the full pan, Flux's own falling blip only half way, so it
  // still reads as him.
  hurt: (p, g) => {
    arp([76, 72, 69, 64], 0.028, 'p50', 0.24 * g, 0.04, 0, p * 0.55)
    burst({ dur: 0.1, vol: 0.18 * g, f0: 2000, f1: 400, pan: p })
  },
  block: (p, g) => {
    tone({ wave: 'tri', f0: 1500, f1: 1100, dur: 0.1, vol: 0.2 * g, pan: p })
    burst({ dur: 0.07, vol: 0.18 * g, type: 'highpass', f0: 3000, pan: p })
  },
  parry: (_p, g) => {
    arp([88, 95, 100, 107], 0.028, 'p12', 0.22 * g, 0.09)
    tone({ wave: 'tri', f0: 2640, dur: 0.3, vol: 0.2 * g })
  },
  guardCrack: (_p, g) => {
    burst({ dur: 0.3, vol: 0.3 * g, f0: 2500, f1: 200 })
    arp([67, 63, 58], 0.06, 'p50', 0.2 * g, 0.08)
  },
  slide: (_p, g) => burst({ dur: 0.22, vol: 0.18 * g, f0: 3000, f1: 500 }),
  // A hard hit shook the charge loose: a sputtering buzz, two crackles and a
  // silly "boing" up (sim/fumble.ts).
  fumble: (_p, g) => {
    tone({ wave: 'p50', f0: 240, f1: 90, dur: 0.24, vol: 0.2 * g, vib: 70, vibRate: 38 })
    burst({ dur: 0.06, vol: 0.16 * g, type: 'bandpass', f0: 3200, q: 3 })
    burst({ dur: 0.05, vol: 0.14 * g, type: 'bandpass', f0: 2300, q: 3, at: 0.1 })
    tone({ wave: 'p12', f0: 700, f1: 1900, dur: 0.1, vol: 0.1 * g, at: 0.2 })
  },
  // ── Pickups & rewards ──
  bolt: (p, g) => arp([88, 95], 0.04, 'p25', 0.13 * g, 0.06, 0, p),
  heal: (_p, g) => arp([72, 76, 79, 84, 88], 0.04, 'p25', 0.16 * g, 0.06),
  energy: (_p, g) => arp([74, 79, 83, 86, 91], 0.04, 'p12', 0.16 * g, 0.06),
  tank: (_p, g) => {
    for (let k = 0; k < 10; k++) tone({ wave: 'p25', f0: midiHz(72 + k), dur: 0.06, vol: 0.13 * g, at: k * 0.045 })
  },
  chestOpen: (_p, g) => {
    burst({ dur: 0.15, vol: 0.14 * g, type: 'bandpass', f0: 1200, f1: 2400 })
    arp([79, 83, 86, 91, 95], 0.05, 'p12', 0.15 * g, 0.1, 0.08)
  },
  loot: (_p, g) => arp([84, 88, 91, 96], 0.06, 'p25', 0.16 * g, 0.12),
  levelUp: (_p, g) => {
    arp([72, 76, 79, 84, 79, 84, 88], 0.07, 'p25', 0.2 * g, 0.12)
    arp([60, 64, 67, 72], 0.14, 'tri', 0.2 * g, 0.2)
  },
  // One level-up pick spent while more are waiting: a bright two-step "ting"
  // with a sparkle on top — the fanfare's opening interval, so it reads as
  // part of the same event, and short enough that three in a row never pile
  // up. The LAST pick plays the full `levelUp` fanfare instead.
  attrPick: (_p, g) => {
    arp([79, 86], 0.05, 'p25', 0.17 * g, 0.09)
    tone({ wave: 'tri', f0: midiHz(98), f1: midiHz(103), dur: 0.16, vol: 0.1 * g, at: 0.09 })
  },
  objective: (_p, g) => arp([79, 84, 88, 91, 96], 0.06, 'p50', 0.17 * g, 0.12),
  weapon: (_p, g) => arp([76, 83, 88], 0.04, 'p12', 0.15 * g, 0.07),
  // A borrowed weapon taken: the classic "weapon get" shape — a rising
  // arpeggio that climbs past the octave, a held top note with vibrato and a
  // triangle bass under it. Longer and grander than any pickup blip, so it
  // is never mistaken for health or energy.
  borrowGet: (p, g) => {
    arp([67, 71, 74, 79, 83, 86], 0.055, 'p25', 0.16 * g, 0.08, 0, p)
    tone({ wave: 'p12', f0: midiHz(91), dur: 0.42, vol: 0.14 * g, at: 0.33, vib: 9, vibRate: 11, pan: p })
    arp([55, 62, 67], 0.11, 'tri', 0.18 * g, 0.16, 0, p)
  },
  // Its last charge spent: a short falling blip and a puff — gone, not broken.
  borrowSpent: (_p, g) => {
    tone({ wave: 'p50', f0: midiHz(84), f1: midiHz(60), dur: 0.2, vol: 0.14 * g })
    burst({ dur: 0.16, vol: 0.1 * g, type: 'bandpass', f0: 2600, f1: 700, q: 1.2, at: 0.05 })
  },
  // ── World ──
  door: (p, g) => {
    burst({ dur: 0.35, vol: 0.14 * g, type: 'bandpass', f0: 400, f1: 1600, q: 1.5, pan: p })
    tone({ wave: 'tri', f0: 90, f1: 140, dur: 0.3, vol: 0.12 * g, pan: p })
  },
  beamIn: (_p, g) => {
    tone({ wave: 'p25', f0: 2400, f1: 300, dur: 0.5, vol: 0.2 * g, vib: 60, vibRate: 30 })
    arp([72, 84, 96], 0.06, 'p12', 0.14 * g, 0.1, 0.45)
  },
  beamOut: (_p, g) => {
    arp([96, 84, 72], 0.05, 'p12', 0.14 * g, 0.08)
    tone({ wave: 'p25', f0: 300, f1: 2800, dur: 0.6, vol: 0.2 * g, vib: 60, vibRate: 30, at: 0.12 })
  },
  // ── The exit drone (`sim/exitRun.ts`) ──
  // Coming in over the walls: a falling whoosh with a low motor under it.
  droneArrive: (_p, g) => {
    burst({ dur: 1.5, vol: 0.14 * g, type: 'bandpass', f0: 2400, f1: 420, q: 1.3 })
    tone({ wave: 'tri', f0: 220, f1: 96, dur: 1.4, vol: 0.14 * g, attack: 0.3, vib: 6, vibRate: 17 })
  },
  // The rotors: one swelling pulse of a low buzz with the blades' chop in
  // it. Re-triggered while the drone flies (overlapping, so it reads as one
  // hum), each pulse a one-shot: a mute or an ad silences it like any sound.
  droneHum: (p, g) => {
    tone({ wave: 'p50', f0: 94, f1: 90, dur: 0.62, vol: 0.06 * g, attack: 0.2, vib: 7, vibRate: 19, pan: p })
    tone({ wave: 'tri', f0: 188, dur: 0.6, vol: 0.05 * g, attack: 0.22, pan: p })
    burst({ dur: 0.6, vol: 0.035 * g, type: 'bandpass', f0: 760, f1: 620, q: 1.6, pan: p })
  },
  // …spun up for the climb out.
  droneHumHi: (p, g) => {
    tone({ wave: 'p50', f0: 132, f1: 140, dur: 0.5, vol: 0.06 * g, attack: 0.15, vib: 9, vibRate: 26, pan: p })
    tone({ wave: 'tri', f0: 264, dur: 0.48, vol: 0.05 * g, attack: 0.16, pan: p })
    burst({ dur: 0.48, vol: 0.04 * g, type: 'bandpass', f0: 1100, f1: 1300, q: 1.6, pan: p })
  },
  // Flux lands on the deck: a hollow metal clunk.
  deckLand: (_p, g) => {
    tone({ wave: 'tri', f0: 330, f1: 120, dur: 0.16, vol: 0.28 * g })
    burst({ dur: 0.09, vol: 0.16 * g, type: 'bandpass', f0: 1800, q: 1.4 })
    tone({ wave: 'p12', f0: 1250, f1: 1100, dur: 0.12, vol: 0.06 * g, at: 0.02 })
  },
  // Lift-off: a rising rush and a climbing arpeggio — the level's done.
  liftOff: (_p, g) => {
    burst({ dur: 1.3, vol: 0.2 * g, type: 'bandpass', f0: 300, f1: 2600, q: 1.1 })
    tone({ wave: 'p25', f0: 110, f1: 440, dur: 1.1, vol: 0.14 * g, vib: 10, vibRate: 22 })
    arp([67, 72, 76, 79, 84], 0.07, 'p12', 0.12 * g, 0.12, 0.15)
  },
  bossIntro: (_p, g) => {
    arp([45, 48, 51, 54, 57], 0.12, 'p50', 0.2 * g, 0.2)
    tone({ wave: 'tri', f0: 55, dur: 0.9, vol: 0.35 * g, vib: 3, vibRate: 7 })
  },
  // A challenge's name card: a bright brass call (a rising major fanfare and
  // a held fifth over a drum hit) — a dare, not the boss's dread.
  challenge: (_p, g) => {
    burst({ dur: 0.18, vol: 0.22 * g, type: 'lowpass', f0: 900, f1: 120 })
    arp([60, 64, 67, 72], 0.08, 'p25', 0.18 * g, 0.12)
    tone({ wave: 'p50', f0: midiHz(79), dur: 0.55, vol: 0.14 * g, at: 0.34, vib: 6, vibRate: 9 })
    tone({ wave: 'tri', f0: midiHz(48), dur: 0.7, vol: 0.3 * g, at: 0.32 })
  },
  // The Cinder Hound's howl: a rising, wavering wail through a roar of fire.
  howl: (p, g) => {
    tone({ wave: 'saw', f0: 220, f1: 520, dur: 0.9, vol: 0.12 * g, vib: 14, vibRate: 7, pan: p })
    tone({ wave: 'p25', f0: 330, f1: 740, dur: 0.85, vol: 0.07 * g, at: 0.05, vib: 18, vibRate: 6, pan: p })
    burst({ dur: 1.0, vol: 0.18 * g, type: 'bandpass', f0: 500, f1: 1400, q: 0.9, pan: p })
  },
  // The objective locator's triangle appearing: a soft rising sonar blip, a
  // hint rather than an alarm, so it never reads as danger mid-fight.
  locate: (_p, g) => {
    tone({ wave: 'tri', f0: midiHz(84), f1: midiHz(91), dur: 0.16, vol: 0.14 * g })
    tone({ wave: 'tri', f0: midiHz(91), dur: 0.22, vol: 0.08 * g, at: 0.14 })
  },
  // First sight of the boss shutter: a low klaxon pair over a rumble — the
  // door says "a Core Master is behind this" before the name card does.
  // The Fortress roof's lightning (#109): a crack, then the rumble rolling off.
  thunder: (p, g) => {
    burst({ dur: 0.12, vol: 0.32 * g, type: 'highpass', f0: 2200, f1: 900, pan: p })
    burst({ dur: 1.3, vol: 0.4 * g, type: 'lowpass', f0: 700, f1: 60, at: 0.05, pan: p })
  },
  bossWarn: (p, g) => {
    tone({ wave: 'p50', f0: 196, f1: 185, dur: 0.28, vol: 0.16 * g, pan: p })
    tone({ wave: 'p50', f0: 165, f1: 156, dur: 0.34, vol: 0.16 * g, at: 0.32, pan: p })
    tone({ wave: 'tri', f0: 49, dur: 0.9, vol: 0.3 * g, vib: 2, vibRate: 6, pan: p })
  },
  // ── Corridor traps (`sim/traps.ts`) ──
  // A flame jet's warning: gas hissing up through a thin rising whine — the
  // beat to stop, or to run.
  trapHiss: (p, g) => {
    burst({ dur: 0.7, vol: 0.12 * g, type: 'highpass', f0: 3500, f1: 6500, q: 0.7, pan: p })
    tone({ wave: 'p12', f0: 700, f1: 1500, dur: 0.7, vol: 0.05 * g, pan: p })
  },
  // …and its burst: a low roar that dies away with the sheet.
  flameJet: (p, g) => {
    burst({ dur: 0.95, vol: 0.34 * g, f0: 1800, f1: 260, pan: p })
    burst({ dur: 0.35, vol: 0.2 * g, type: 'bandpass', f0: 900, f1: 2400, q: 1.1, pan: p })
    tone({ wave: 'tri', f0: 82, f1: 55, dur: 0.8, vol: 0.22 * g, pan: p })
  },
  // A blade coming down through the air: a swell that peaks as it passes.
  bladeWhoosh: (p, g) => {
    burst({ dur: 0.14, vol: 0.06 * g, type: 'bandpass', f0: 500, f1: 1200, q: 2.2, pan: p })
    burst({ dur: 0.3, vol: 0.2 * g, type: 'bandpass', f0: 1300, f1: 450, q: 2.4, at: 0.1, pan: p })
  },
  // A gust coming (the wind tunnel's telegraph): a rising whistle over a
  // swelling rush of air.
  gust: (p, g) => {
    tone({ wave: 'sine', f0: 900, f1: 1700, dur: 0.75, vol: 0.07 * g, vib: 18, vibRate: 7, pan: p })
    burst({ dur: 1.1, vol: 0.16 * g, type: 'bandpass', f0: 500, f1: 1600, q: 1.4, pan: p })
  },
  // A pressure plate giving under a foot: a click and a clunk.
  trapClick: (p, g) => {
    tone({ wave: 'p12', f0: 1900, f1: 1500, dur: 0.035, vol: 0.2 * g, pan: p })
    tone({ wave: 'tri', f0: 320, f1: 110, dur: 0.12, vol: 0.26 * g, at: 0.03, pan: p })
  },
  death: (_p, g) => {
    for (let k = 0; k < 6; k++) tone({ wave: 'p50', f0: midiHz(84 - k * 5), f1: midiHz(78 - k * 5), dur: 0.1, vol: 0.2 * g, at: k * 0.09 })
    burst({ dur: 0.7, vol: 0.3 * g, f0: 2500, f1: 100, at: 0.1 })
  },
  // ── The intro cutscene (`story/introScript.ts`) ──
  // The cold open's rain: a hiss under the score (its bass is the music's).
  synthPulse: (_p, g) => {
    burst({ dur: 2.8, vol: 0.06 * g, type: 'highpass', f0: 5200, f1: 4200, q: 0.5 })
  },
  // A tape stopping, then spooling back: the rewind into Atlas's log.
  tapeRewind: (_p, g) => {
    tone({ wave: 'saw', f0: 220, f1: 40, dur: 0.35, vol: 0.16 * g })
    tone({ wave: 'p25', f0: 300, f1: 2400, dur: 0.5, vol: 0.08 * g, at: 0.3, vib: 90, vibRate: 40 })
    burst({ dur: 0.55, vol: 0.1 * g, type: 'bandpass', f0: 800, f1: 4200, q: 1.5, at: 0.3 })
  },
  // A beam hopping relay to relay: a soft bell.
  relayChime: (_p, g) => {
    tone({ wave: 'tri', f0: midiHz(88), dur: 0.5, vol: 0.12 * g })
    tone({ wave: 'sine', f0: midiHz(95), dur: 0.35, vol: 0.05 * g, at: 0.02 })
  },
  // Dr. Vex on the air: three falling square notes over a crushed noise sweep.
  vexGlitch: (_p, g) => {
    arp([64, 61, 57], 0.13, 'p50', 0.16 * g, 0.16)
    burst({ dur: 0.5, vol: 0.14 * g, type: 'bandpass', f0: 3000, f1: 300, q: 3 })
    tone({ wave: 'p12', f0: 90, f1: 60, dur: 0.45, vol: 0.12 * g, vib: 40, vibRate: 50 })
  },
  // A relay going red: a falling blip.
  relayOut: (_p, g) => tone({ wave: 'p25', f0: midiHz(84), f1: midiHz(60), dur: 0.2, vol: 0.1 * g }),
  // The lab's two-tone alarm.
  alarm: (_p, g) => {
    for (let k = 0; k < 2; k++) {
      tone({ wave: 'p50', f0: 880, dur: 0.2, vol: 0.1 * g, at: k * 0.44 })
      tone({ wave: 'p50', f0: 660, dur: 0.2, vol: 0.1 * g, at: k * 0.44 + 0.22 })
    }
  },
  // The capsule's lever: a heavy clunk, then the steam's hiss.
  capsule: (_p, g) => {
    tone({ wave: 'tri', f0: 150, f1: 55, dur: 0.22, vol: 0.32 * g })
    burst({ dur: 0.1, vol: 0.2 * g, type: 'bandpass', f0: 1200, q: 1.2 })
    burst({ dur: 0.9, vol: 0.16 * g, type: 'highpass', f0: 2500, f1: 6000, q: 0.6, at: 0.1 })
  },
  // Frost racing over the glass: an icy crackle falling in pitch.
  freeze: (_p, g) => {
    burst({ dur: 0.6, vol: 0.14 * g, type: 'bandpass', f0: 7000, f1: 1800, q: 4 })
    for (let k = 0; k < 6; k++) tone({ wave: 'p12', f0: midiHz(100 - k * 3), dur: 0.05, vol: 0.06 * g, at: k * 0.07 })
    tone({ wave: 'sine', f0: midiHz(96), f1: midiHz(84), dur: 0.7, vol: 0.05 * g })
  },
  // A soft, low heartbeat: lub-dub.
  heartbeat: (_p, g) => {
    tone({ wave: 'sine', f0: 70, f1: 45, dur: 0.14, vol: 0.4 * g })
    tone({ wave: 'sine', f0: 62, f1: 40, dur: 0.16, vol: 0.3 * g, at: 0.2 })
  },
  // Pip's two-note chirp.
  pipChirp: (_p, g) => arp([91, 96], 0.07, 'p12', 0.13 * g, 0.08),
  // Flux's systems coming up: a rising boot chime, then the bar's tick-fill.
  bootUp: (_p, g) => {
    tone({ wave: 'tri', f0: midiHz(60), f1: midiHz(84), dur: 0.35, vol: 0.14 * g })
    arp([72, 79, 84], 0.08, 'p25', 0.12 * g, 0.1, 0.3)
    for (let k = 0; k < 14; k++) tone({ wave: 'p12', f0: midiHz(72 + k), dur: 0.03, vol: 0.06 * g, at: 0.12 + k * 0.045 })
  },
  // ── UI ──
  denied: (_p, g) => tone({ wave: 'p50', f0: 140, f1: 110, dur: 0.14, vol: 0.18 * g }),
  uiClick: (_p, g) => tone({ wave: 'p12', f0: 1800, dur: 0.035, vol: 0.1 * g }),
  uiOpen: (_p, g) => arp([79, 86], 0.045, 'p12', 0.12 * g, 0.06),
  // The mirror of uiOpen: down, softer (#114).
  uiClose: (_p, g) => arp([84, 77], 0.04, 'p25', 0.08 * g, 0.05)
}

// ─── Drop-in SFX files ───────────────────────────────────────────────────────
// A file in public/audio/sfx/ named after a recipe replaces it (see
// `game/assets/overrides.ts`). Decoded on an OfflineAudioContext, which needs
// no user gesture, so the buffers are ready before the first shot and the
// autoplay policy never sees a context it would refuse.

/** Drop-ins are mastered hotter than the synth voices; this evens them out. */
const FILE_GAIN = 0.55
const fileBuffers = new Map<string, AudioBuffer>()
let filesRequested = false

/** Fetch and decode every drop-in SFX file (from the boot loader). */
export const loadSfxOverrides = (): void => {
  if (filesRequested || SFX_FILES.size === 0) return
  filesRequested = true
  const Offline = window.OfflineAudioContext
    ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Offline) return
  const decoder = new Offline(2, 1, 44100)
  for (const [name, url] of SFX_FILES) {
    fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(buf => decoder.decodeAudioData(buf))
      .then(ab => { fileBuffers.set(name, ab) })
      .catch(e => console.warn(`[sfx] drop-in "${name}" could not be loaded — keeping the synth`, e))
  }
}

const playFile = (buf: AudioBuffer, pan: number, gain: number): void => {
  const a = audio()
  if (!a) return
  const dest = out(pan)
  if (!dest) return
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = pitch
  const g = a.ctx.createGain()
  g.gain.value = FILE_GAIN * gain
  src.connect(g).connect(dest)
  src.start()
  registerOneShotSource(src)
}

const play = (name: SfxName, pan: number, gain: number, muffle = 0): void => {
  if (!canPlay()) return
  const a = audio()
  if (!a || a.ctx.state !== 'running') return
  const gap = GAP[name] ?? 0.02
  const now = a.ctx.currentTime
  const last = lastAt.get(name) ?? -1
  if (now - last < gap) return
  while (recent.length && now - recent[0]! > CAP_WINDOW) recent.shift()
  if (recent.length >= CAP && !NEVER_DROP.has(name)) return
  recent.push(now)
  lastAt.set(name, now)
  const vary = VARY.has(name)
  const g = Math.max(0.05, Math.min(1.4, gain * (TRIM[name] ?? 1) * (vary ? 0.9 + Math.random() * 0.2 : 1)))
  pitch = vary ? 0.96 + Math.random() * 0.08 : 1
  const duckFor = DUCK_FOR[name]
  if (duckFor) duckMusic(duckFor)
  // Muffled: one low-pass in front of the SAME sfx bus, so the mute, the
  // volume and the ad gates hold for it like for any other sound.
  if (muffle > 0.01) {
    try {
      route = a.ctx.createBiquadFilter()
      route.type = 'lowpass'
      route.frequency.value = muffleHz(muffle)
      route.Q.value = 0.7
      route.connect(a.sfx)
      // Every voice of a recipe ends within ~2 s; then the filter goes too.
      const r = route
      setTimeout(() => { try { r.disconnect() } catch { /* gone */ } }, 2500)
    } catch { route = null }
  }
  try {
    const file = fileBuffers.get(name)
    if (file) playFile(file, pan, g)
    else RECIPES[name]?.(pan, g)
  } catch { /* a voice failed to start — never fatal */ } finally {
    route = null
    pitch = 1
  }
}

export const installSynth = (): void => {
  setSfxPlayer(play)
}

// ─── The charge hum ──────────────────────────────────────────────────────────
// The buster's signature: a thin pulse that climbs while the button is held
// and, at full charge, settles into a fast warble. One persistent voice,
// re-pitched every frame — never a new oscillator per frame.

let humOsc: OscillatorNode | null = null
let humGain: GainNode | null = null
let humLfo: OscillatorNode | null = null
let humLfoGain: GainNode | null = null

/** `k01` 0..1 toward full charge; `full` once fully charged; null stops it. */
/** DEV only: hears every charge-hum update (the trailer's sound log, `game/trailer.ts`). */
let humTap: ((k01: number | null, full: boolean, over: boolean) => void) | null = null
export const setChargeHumTap = (t: typeof humTap): void => { if (import.meta.env.DEV) humTap = t }

export const chargeHum = (k01: number | null, full = false, over = false): void => {
  if (import.meta.env.DEV) humTap?.(k01, full, over)
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime
  if (k01 === null || !canPlay()) {
    if (humGain) {
      humGain.gain.setTargetAtTime(0, t, 0.02)
      const o = humOsc
      const l = humLfo
      setTimeout(() => { try { o?.stop(); l?.stop() } catch { /* stopped */ } }, 120)
    }
    humOsc = null
    humGain = null
    humLfo = null
    humLfoGain = null
    return
  }
  if (!humOsc) {
    humOsc = a.ctx.createOscillator()
    const w = pulse(0.125)
    if (w) humOsc.setPeriodicWave(w)
    humGain = a.ctx.createGain()
    humGain.gain.value = 0
    humLfo = a.ctx.createOscillator()
    humLfo.frequency.value = 22
    humLfoGain = a.ctx.createGain()
    humLfoGain.gain.value = 0
    humLfo.connect(humLfoGain).connect(humOsc.frequency)
    humOsc.connect(humGain).connect(a.sfx)
    humOsc.start(t)
    humLfo.start(t)
    registerOneShotSource(humOsc)
  }
  // Overloaded: an octave down from the full-charge whine, with a wide, slow
  // wobble — heavier, not shriller.
  const f = over ? 660 : full ? 1320 : 180 + k01 * 900
  humOsc.frequency.setTargetAtTime(f, t, 0.03)
  humLfoGain!.gain.setTargetAtTime(over ? 140 : full ? 90 : 8, t, 0.05)
  humGain!.gain.setTargetAtTime(over ? 0.08 : full ? 0.07 : 0.03 + k01 * 0.03, t, 0.03)
}
