/**
 * The v2 cut sheet (roadmap #X1, second pass): same 140 BPM boss theme and bar
 * grid as cut.mjs, but a human-style take, a narrator (ElevenLabs "Adam") and
 * Flux himself speaking instead of Atlas, a visit to the 3D lab (Pip and
 * Atlas), a challenge-door fight, and the Grand Master Bot last.
 *
 *   bars  0– 3  intro        → Flux beams in                    (narrator 1)
 *   bars  4–11  A            → the stages, one or two bars a cut (narrator 2)
 *   bars 12–13  the lab      → Pip and Atlas                     (narrator 3)
 *   bars 14–17  B            → loot, a secret, the challenge door
 *   bars 18–22  Masters      → three Core Masters, a Master falls
 *   bars 23–28  C            → the Fortress, Vex, the assembly   (narrator 4, 5)
 *   bars 29–32  A2           → the Grand Master Bot, last
 *   + end card               → the logo (narrator 6)
 *
 * `vo` entries are generated takes (tools/cinematic-trailer/voices-v2.mjs →
 * vo-v2/<id>.mp3), placed `beat` quarter-notes into the shot.
 */
import { BPM, BAR_S, VOICE_DIR } from './cut.mjs'
export { BPM, BAR_S, VOICE_DIR }

const vo = (id, beat = 0, gain = 1) => ({ file: `tools/cinematic-trailer/vo-v2/${id}.mp3`, beat, gain })

export const CUT = {
  shots: [
    // ── intro: the hook, then the order alternates platforming/traversal and
    // fights so a boss is never two cuts away from a stage (#193) ──
    { id: 'hall', bars: 4, vo: [vo('n1', 1)] },
    { id: 'brawl', bars: 2, flash: 0.12, vo: [vo('f1', 2)] },
    { id: 'blaze', bars: 3, flash: 0.08, vo: [vo('n2', 1)] },
    { id: 'rotor', bars: 2 },
    { id: 'forge', bars: 1 },
    { id: 'lab', bars: 2, flash: 0.1, vo: [vo('n3', 1.5)] },
    { id: 'neonboss', bars: 3 },
    { id: 'glacier', bars: 1 },
    { id: 'secret', bars: 1, flash: 0.1 },
    { id: 'challenge', bars: 2, flash: 0.1, vo: [vo('f2', 2)] },
    { id: 'capsule', bars: 1 },
    { id: 'shatter', bars: 2, flash: 0.12 },
    { id: 'golem', bars: 2 },
    // ── C ──
    { id: 'fortress', bars: 2, vo: [vo('n4', 0)] },
    { id: 'vex', bars: 3 },
    { id: 'gmrise', bars: 2, vo: [vo('n5', 3), { line: 'vex_laugh_maniacal', beat: 0, gain: 0.7 }] },
    // ── A2: the Grand Master, last ──
    { id: 'prism', bars: 2, flash: 0.12 },
    { id: 'gmcore', bars: 2, vo: [vo('f3', 1)], whiteOut: 0.35 }
  ],
  endCard: { bars: 3, fadeBars: 2, vo: [vo('n6', 2)] },
  levels: { music: -23, sfx: -16, voice: -15, master: -14, duckDb: 7 }
}
