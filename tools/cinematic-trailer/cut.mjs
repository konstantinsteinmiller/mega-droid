/**
 * The cut sheet: shots in order, each a whole number of bars of the boss
 * theme ("Overload", 140 BPM — `src/game/audio/songs.ts`), so every cut lands
 * on a downbeat and the song's own sections carry the arc:
 *
 *   bars  0– 3  intro: choir hit, taiko, riser    → Flux wakes, beams in
 *   bars  4–11  A: full kit                       → the stages, one bar a cut
 *   bars 12–19  B: the brass theme                → loot, then the Masters
 *   bars 20–27  C: breakdown, then the build      → a Master falls, the Fortress, Vex
 *   bars 28–31  A2                                → the Grand Master Bot
 *   bars 32–34  A again (the song's loop)         → the ride out
 *   + end card                                    → the logo, the score fades
 *
 * `vo` lines are the game's own shipped English takes
 * (public/audio/voice/en/<line>.ogg), placed `beat` quarter-notes into the
 * shot. `flash`: seconds of white the shot opens out of; `whiteOut`: seconds
 * it burns to white at its end.
 */
export const BPM = 140
export const BAR_S = (60 / BPM) * 4
export const VOICE_DIR = 'public/audio/voice/en'

export const CUT = {
  shots: [
    // ── intro ──
    { id: 'beamin', bars: 4, vo: [{ line: 'story_atlas_goodMorning', beat: 9 }] },
    // ── A ──
    { id: 'brawl', bars: 2, flash: 0.12 },
    { id: 'rotor', bars: 2 },
    { id: 'forge', bars: 1 },
    { id: 'glacier', bars: 1 },
    { id: 'golem', bars: 2 },
    // ── B ──
    { id: 'secret', bars: 2, flash: 0.1 },
    { id: 'capsule', bars: 1 },
    { id: 'bossdoor', bars: 2, vo: [{ line: 'atlas_bossAhead', beat: 0.5 }] },
    { id: 'blaze', bars: 1, flash: 0.08 },
    { id: 'volt', bars: 1 },
    { id: 'neonboss', bars: 1 },
    // ── C ──
    { id: 'shatter', bars: 2, flash: 0.12, vo: [{ line: 'atlas_bossDown', beat: 3.5 }] },
    { id: 'fortress', bars: 2, vo: [{ line: 'atlas_story_fortress', beat: 1 }] },
    { id: 'vex', bars: 2 },
    { id: 'gmrise', bars: 2, vo: [{ line: 'vex_laugh_maniacal', beat: 0, gain: 0.8 }, { line: 'atlas_boss_signalFirst', beat: 4 }] },
    // ── A2 ──
    { id: 'prism', bars: 2, flash: 0.12, vo: [{ line: 'atlas_hint_gm_prism', beat: 0.5 }] },
    { id: 'gmcore', bars: 2, vo: [{ line: 'atlas_hint_gm_body', beat: 0 }], whiteOut: 0.35 },
    // ── the loop's A ──
    { id: 'exit', bars: 2, flash: 0.25 }
  ],
  endCard: { bars: 3, fadeBars: 2 },
  // Loudness targets (LUFS) per stem before the master, and the master.
  levels: { music: -20, sfx: -19, voice: -15, master: -14, duckDb: 7 }
}
