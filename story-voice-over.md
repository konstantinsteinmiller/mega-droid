# Mega Droid — voice-over prep

The direction, the casting and the processing chains for the voice-over. The
story and every beat are in [`story-arc.md`](./story-arc.md), and this file
uses the same lines. The lines are voiced by a TTS pipeline (below); this
file is still the reference for how each character should sound.

**The line list lives in the voice catalog**
(`src/game/audio/voiceCatalog.ts`): every line, its key and file name,
speaker, scene, direction, max length, and English and German text. `pnpm
voice:report` prints what is done, recorded or still to record per language,
and writes the recording scripts for the voice actors
(`src/assets/voice-lines-list_en.pdf` / `_de.pdf`). The script tables below
are where the planned lines came from; a line changed here must be changed in
the catalog too. This file keeps the direction and the processing chains.

## Principles

- **VO adds to the picture and never carries it.** Every line also has a
  glyph and an i18n subtitle, so the game plays the same with sound off,
  which is the default at first launch before the first tap.
- **Short lines.** Atlas: ≤ 7 words, about 2 s. Vex: ≤ 8 words, about 3 s.
  Barks: under 0.6 s.
- **Robots, not humans.** Every voice gets a processing chain (below). A
  clean human read breaks the cast rule "No humans, everyone is an android".
- **Drop-in, like the rest of the audio.** It follows `sound-todo.md`: a file
  with the right name replaces the fallback. If no VO file exists, the line
  plays silent with its subtitle; Flux's barks fall back to a synth chirp.

## Open decisions

1. **Which locales get English VO?** Options:
   - **(a) All locales, with localized subtitles.** This is the
     recommendation. The processed robot voices read as character sound,
     and most web-portal players are used to English VO.
   - **(b) The English locale only;** other locales get subtitles and the
     synth chirps.

   Barks are fine in English everywhere (they're onomatopoeia), but see
   `story-arc.md` §9 for localizing their subtitles.
2. **Does Gauss speak?** The built ending gives her two spoken captions
   (`ending.gauss`, `ending.spark`), so a Gauss session now covers two
   lines. It is recommended: it's the emotional payoff, and it costs one
   actor session. Without it, her captions play silent like any line.
3. **The folder.** *Resolved:* the voice loader exists
   (`src/game/audio/voice.ts`, list in `voice-todo.md`). It reads
   `public/audio/voice/<lang>/<file>.ogg`, where `<file>` is the line's
   **Key** with its dots as underscores (`atlas_story_relayOne.ogg`), not its
   VO id. Raw takes are named the same way plus the take
   (`atlas_story_relayOne_1.ogg`, the catalog's `rawPath`); the VO ids below
   are only labels.

## File specs

Specs follow `sound-todo.md`, plus a few rules just for voice:

- mono, 44.1 kHz, `.ogg` (`.mp3` / `.m4a` also load; `.ogg` wins);
- peak −3 dBFS, loudness per character (see *Post-production* below; Atlas
  sits at −16 LUFS like `voice-todo.md` and the music);
- no leading silence, and a 50 ms tail at most;
- file name = the line's **Key** with its dots as underscores + `.ogg`, in
  `public/audio/voice/en/` (e.g. `atlas_intro_online.ogg`). Raw takes are named by the key and take
  (`vo-src/raw/en/atlas/story_atlas_goodMorning_1.ogg`); the recording
  scripts show every file name.

While a VO file plays, the game ducks the music by 7 dB (`engine.ts`
`DUCK_DB`; never during an ad, the global audio gates handle that). Lines
play on their own voice bus. The chains below still get a line heard through
**presence and density, not level**.

## The pipeline: `pnpm voice:*`

The lines are voiced by text-to-speech, end to end, with no hand editing
(#117). Each step is a script in `tools/voice/`:

1. `pnpm voice:cards` prints the voice cards (`src/game/audio/voiceCards.ts`)
   as `voice-cards.md`. A card describes a voice the way a voice-design model
   takes it: a clean human voice (age, gender, pitch, pace, attitude), never a
   robot one. It also gives every line one tone word.
2. `pnpm voice:collect` (`--all`, `--samples`) writes every line as a job in
   `vo-src/jobs/`, with its English and German text, the direction, the
   situation, the tone and the max length. Numbers become words and shouted
   capitals become stressed words.
3. `pnpm voice:gen --engine <name>` designs each voice once and freezes it as
   a reference clip in `vo-src/refs/`. It speaks every line twice, runs each
   take through the character's chain (`tools/voice/fx.mjs`, ported from the
   Audacity blocks below) and levels it. It then reads each take back with
   Whisper and checks the words, the length, the loudness and clipping. It
   ships the better passing take to `public/audio/voice/<lang>/` as Opus
   24 kbps in an `.ogg` file. A line with no passing take is listed, never
   shipped; `--retry` gives only those lines more takes with new seeds.
   QA forgives what is Whisper's habit rather than the take's fault: digits
   for number words, the cast's names ("Wechs" for Vex), a joined compound,
   one added word. A take may run 1.5× its budget, which is the line's max
   or the time its words need at a natural pace, whichever is longer. A word
   the model keeps getting wrong in one line gets a respelling (`SAY` in
   `collect.mjs`), and QA still checks against the real text.
4. `pnpm voice:compare` is the blind listening page that picks an engine and
   an encoding. `pnpm voice:setup <engine>` builds the local engines' Python
   environments.

The engines are VoxCPM2, Qwen3-TTS and Chatterbox Multilingual V3 (local, on
the GPU) and Gemini 3.8 Flash / Flash-Lite TTS through the API. The AI Studio
browser route is written but blocked: Google refuses its access token to a
Chrome with an automation port.

**Chosen on 2026-10-02:** the blind test ranked Gemini Flash-Lite 4.5,
Gemini Flash and Chatterbox 4.0, and VoxCPM2 and Qwen3 3.3. A second round
with ElevenLabs (Eleven v4, driven through its web app) rated it 5.0 on
every clip, ahead of Gemini Flash-Lite (4.7). ElevenLabs' free plan forbids
commercial use and gives 10,000 credits a month; the whole game is about
25,000 (one take a line), so shipping it means a paid month. Production runs
on **Chatterbox**, which clones Qwen3's designed references. It's free and
has no quota, whereas the Gemini API's free tier is 10 requests a day.
**For later:** re-voice with Gemini Flash-Lite once billing is on for the AI
Studio project: `pnpm voice:gen --engine gemini-lite --force`. Its voices are
already designed (`vo-src/refs/voices.json`, valid until Oct 2027).

**In the game (#117):** every live catalogue line has a moment. Atlas speaks
in missions and the story scenes, Flux barks when hit (`audio/barks.ts`), the
ending's captions speak, and Dr. Vex has his scenes (`story/vexScene.ts`,
`story/vexScenes.ts`): the Master presentations, the Mk-I, the Volt Tower
hack, the Fortress welcome, the hub broadcasts with the blueprint, reserve
and breach scenes, and the New Game+ sting. Each scene plays once ever.
Atlas's story lines are wired too (`sim/atlas.ts`, `sim/mission.ts`,
`story/hubAtlas.ts`): each sector's beam-in line on the first story landing
there, the machine scans (the first time ever a kind, an elite or an element
coat is in view), the warnings and hints. Where a story line and a generic
one describe the same moment, the rule is one line per event and both stay
in use:

| Moment | First time ever | In a mission, first | After that |
| --- | --- | --- | --- |
| Health under 50 %, a gel carried | `warn.gelFirst` | `lowHpGel` | `warn.gel` |
| Health under 25 %, a gel carried | `warn.criticalFirst` | `warn.critical` | `warn.critical` |
| Health under 25 %, no gel | | `warn.noGel` | `lowHp` |
| Weapon energy under 20 % | | `warn.weLow` | `lowWe` |
| A corridor trap ahead | `warn.flame` / `warn.blade` | `trap` | `trap` |
| The boss door | `boss.signalFirst` (Scrapyard) | `warn.boss` when a weakness tip follows, else `bossAhead` | |
| A level-up | | `hint.levelUp` and `levelUp` by turns | |

One hit through both health steps says only the critical line. "Done! Now
find the exit." (`atlas.objective`) is retired: `hint.done` replaces it
(the drone is called from anywhere). `atlas.fortress.bays` plays at the
Fortress landing, before Vex's welcome (the bays themselves aren't built).
The sector floor lines and "Train first." play on the mission board.

**Where `fx.mjs` departs from the blocks below:**

- Vex's sub octave is not crushed, and his consonant buzz is half as loud.
  The user heard the crush as crisping on the Blaze Master line.
- His broadcast grit is milder: 8 bits at 8 %.
- The label-driven glitches (stutter, wobble, tear, crush on one word) and
  Flux's synth tails are not ported.
- ffmpeg has no Audacity Reverb, so rooms are short echo clusters.

---

## Post-production: the Audacity chains

Every line goes through the same three stages: **shared prep → the
character's chain → shared leveling**. A script drives Audacity through
`mod-script-pipe` (the voice skill, run by a `package.json` script), or a
person runs the same steps by hand from the menus. Each stage is written out
below as a fenced `audacity-chain` block with one scripting command per line,
so the skill can parse the blocks straight out of this file:

- `# …` lines are comments.
- `# skill: …` lines are steps the script does itself, such as measuring,
  looping over labels or picking a branch.
- `{name}` is a value the script fills in: a path, a measured time, or a
  value from the character's table.

### Why the chains sound the way they do

What a voice competes with in the mix:

- **The music** is chiptune pulse leads, arps and a triangle bass, 140–170 BPM,
  with its energy at 150 Hz–4 kHz. A dropped-in song plays at −16 LUFS through
  `FILE_GAIN` 0.35 on the music bus, so a −16 LUFS voice already sits about
  14 dB over it at default volumes. Voices don't need to be louder than the
  music. They need to stay out of its way: they are thin in the lows (the
  triangle bass and kick live there, and phone speakers drop them anyway), and
  they carry a 2.5–4 kHz presence lift that the square leads don't cover.
- **The SFX** share the voice bus. Shots, hits and alarms are short 8/16-bit
  bursts peaking at −3 dBFS. Compression keeps a line dense enough to survive
  a burst without being peak-louder than it.
- **The phone.** Most players hear the game on a phone speaker. Nothing
  important goes below about 150 Hz. The low layers (Vex's octave) are
  "felt on headphones, harmless on phones".

The characters' sonic egos, and how they separate from each other:

| Who | Band | Space | Texture | Level |
| --- | --- | --- | --- | --- |
| **Atlas** | narrow: 280 Hz–6.2 kHz, "in your helmet" | dry, a 14 ms doubler | a clean digital sheen (a 6 % ring-mod) | −16 LUFS, very even (3:1) |
| **Vex** | wide and heavy: 110 Hz–8 kHz, low-mid body | where he is: a broadcast, the arena PA, the clinic | a sub-octave crushed layer and a consonant buzz, glitching more as the story goes on | −15 LUFS, theatrical (4:1, slow release) |
| **Flux** | bright: 150 Hz–9 kHz, +3 st | dry | a metallic ring-mod edge and a synth tail | peak −3 dBFS (barks are too short to measure in LUFS) |
| **Gauss** | full, warm: 90 Hz–10 kHz | the lab: a soft small room | a faint shimmer (a 9 ms comb) | −17 LUFS, gentle (2:1) |

### Audacity setup (once)

1. **Use Audacity 3.6 or newer.** It has the new Compressor and Limiter,
   whose times are in ms. The legacy compressor's release can't go below
   1 s, which pumps on short lines.
2. **Enable the pipe:** *Edit → Preferences → Modules → mod-script-pipe →
   Enabled*, then restart Audacity. The pipes are
   `/tmp/audacity_script_pipe.to.<uid>` and `.from.<uid>` on macOS and Linux,
   and `\\.\pipe\ToSrvPipe` / `\\.\pipe\FromSrvPipe` on Windows. Each command
   is one line; Audacity answers with lines ending in `BatchCommand finished:
   OK` (or `Failed!`).
3. **Check the parameter names once:** `GetInfo: Type=Commands Format=JSON`.
   Effect keys change between Audacity versions: the 3.6 Compressor and
   Limiter keys below are the ones to check first, and `SBSMS`, `Version` and
   the Sliding Stretch keys after them. On a mismatch, the skill should stop
   and name the key rather than run the chain without that step.
4. **Folders:** raw takes go in `vo-src/raw/<lang>/<character>/<file>_<take>.ogg`
   (OGG Vorbis, mono, 48 kHz, quality 8 or more, dry and close). Optional hand-placed markers
   go in `vo-src/labels/<file>_<take>.txt`: an Audacity label export
   (*File → Export → Labels*) with the names `stutter`, `wobble`, `tear`,
   `cut` or `crush`, which the glitch steps read. Synth tails go in
   `vo-src/tails/<type>.ogg`. Outputs go to `public/audio/voice/en/<file>.ogg`.
   `<file>` is the line's key with its dots as underscores (`atlas.bossAhead`
   → `atlas_bossAhead`), as the recording scripts list it.
5. **Raw files are never changed.** Every run starts from the raw take, so any
   chain can be re-tuned and re-run.

### Stage 1: shared prep (every line)

```audacity-chain prep
SelectAll:
RemoveTracks:
Import2: Filename="{raw}"
SelectAll:
# skill: GetInfo: Type=Tracks — only if the take is stereo:
StereoToMono:
# Rumble, handling noise, DC; a steady level into the character chain.
High-passFilter: frequency=70 rolloff=dB24
Normalize: PeakLevel=-1 ApplyGain=1 RemoveDcOffset=1 StereoIndependent=0
```

Noise: record clean. Noise Reduction needs a profile picked by hand, so it
can't be scripted. If a take has room hiss, run *Effect → Noise Reduction*
by hand on the raw take first, and save the result as the new raw file.

### Stage 3: shared leveling (every line)

Dynamics use the character's values from its table (`{thr}`, `{ratio}`,
`{atk}`, `{rel}`, `{lufs}`).

```audacity-chain level
SelectAll:
Compressor: thresholdDb={thr} makeupGainDb=0 kneeWidthDb=6 compressionRatio={ratio} lookaheadMs=1 attackMs={atk} releaseMs={rel}
# skill: a line longer than 1.0 s gets loudness; a shorter one (barks, call-outs) gets peak (LUFS needs 400 ms blocks)
LoudnessNormalization: StereoIndependent=0 LUFSLevel={lufs} RMSLevel=-20 DualMono=1 NormalizeTo=0
# …or, for the short ones:
Normalize: PeakLevel={peak} ApplyGain=1 RemoveDcOffset=0 StereoIndependent=0
# -3.3 leaves room for the .ogg encoder's overshoot (spec: peak -3 dBFS).
Limiter: thresholdDb=-3.3 makeupTargetDb=-3.3 kneeWidthDb=0 lookaheadMs=2 releaseMs=30
# Trim: the skill exports a scratch file and measures it.
Export2: Filename="{tmp}.ogg" NumChannels=1
# skill: lead = first sample over -45 dBFS, minus 5 ms (never < 0)
# skill: end  = last sample over -50 dBFS, plus 50 ms (Vex's laughs: plus 250 ms); len = the track length
Select: Start={end} End={len} Track=0 TrackCount=1 Mode=Set
Delete:
Select: Start=0 End={lead} Track=0 TrackCount=1 Mode=Set
Delete:
Select: Start=0 End=0.004 Track=0 TrackCount=1 Mode=Set
FadeIn:
# skill: newLen = the length now
Select: Start={newLen-0.03} End={newLen} Track=0 TrackCount=1 Mode=Set
FadeOut:
# skill: over the Max column by <= 8 %? tighten it; more than that: report it and export anyway (a retake is the fix)
SelectAll:
ChangeTempo: Percentage={tempo} SBSMS=1
Export2: Filename="{out}" NumChannels=1
```

Delete the tail before the lead, so the tail's times are still right. A line
with a `cut` label (Atlas cut off mid-word) skips the tail fade: it gets a
2 ms fade, and the stop stays abrupt.

The skill should also report each line's loudness, peak and length against
its Max, so a whole batch can be checked at a glance.

---

## Cast and direction

### Atlas: Flux's field AI

- **Voice:** gender-neutral to slightly low, calm, precise and warm
  underneath. Think a mission-control navigator who's also your friend.
  Dry humour by *understatement* ("It's… big."). Never shouts, not even at
  critical HP, where it goes **tighter and faster**, not louder.
- **Processing:** a light band-pass (300 Hz–6 kHz) and a subtle short
  chorus/doubler, so it reads as "in your helmet". A soft digital
  **pre-chirp** (a 60 ms cyan blip) on each line, so players learn that the
  blip means Atlas.
- **Glitch variant** (Volt Tower): the same lines, with bit-crush, stutter
  edits and a pitch wobble. Record them clean; the glitch is post-processing.
- **Range across the story:** helpful and neutral (Prologue), then a quiet
  identity wobble at the midpoint ("…I was written from its first draft."),
  then shaken but grateful after the Volt Tower, then steady, a little proud,
  at the finale. Its choice at the Spire should sound like a decision, not a
  sacrifice.

#### Atlas: the chain

The goal: the voice in your helmet. It is narrow, close and dry, with a faint
digital sheen, and so even that it's never the loudest thing on screen, yet
it's always intelligible over a fight. The warmth comes from the read; the
chain only frames it.

| Dynamics | `{thr}` | `{ratio}` | `{atk}` | `{rel}` | `{lufs}` / `{peak}` |
| --- | --- | --- | --- | --- | --- |
| standard | −22 dB | 3 | 5 ms | 120 ms | −16 LUFS / −4 dBFS |
| `atlas.warn.critical*` ("tighter, not louder") | −26 dB | 5 | 2 ms | 80 ms | −16 LUFS / −4 dBFS |

```audacity-chain atlas
SelectAll:
# 1. The helmet band. Presence at 3 kHz carries it over the square leads; a small dip at 700 Hz removes the "boxy" read.
High-passFilter: frequency=280 rolloff=dB12
Low-passFilter: frequency=6200 rolloff=dB12
FilterCurve: FilterLength=8191 InterpolateLin=0 InterpolationMethod=B-spline f0=400 f1=700 f2=1800 f3=3000 f4=4500 v0=0 v1=-2 v2=0 v3=3 v4=0
# 2. The doubler: one short tap at 14 ms, reading as a speaker inside a shell (Audacity has no chorus).
Echo: Delay=0.014 Decay=0.2
# 3. The digital sheen: 6 % of the voice ring-modulated at 1.2 kHz. Below 4 % nobody hears it; over 10 % it turns into a Dalek.
NyquistPrompt: Command="(sim (mult 0.94 *track*) (mult 0.06 *track* (hzosc 1200)))" Version=4
```

The **pre-chirp** (the 60 ms cyan blip) is **not** baked in. The game plays
it as a synth SFX just before the line, so the file starts on the word
(no leading silence), and the blip stays the same on every line and in
every language.

**Per-line changes** (applied after the chain, before Stage 3):

| Lines | Change | Why |
| --- | --- | --- |
| `atlas_log_start` | narrower band: `High-passFilter: frequency=400`, `Low-passFilter: frequency=4000`, crush at level 1 (below) | a log played back, clinical |
| `atlas_first_draft` | `{lufs}` −19 | the quietest line in the game; normalizing it to −16 would erase that |
| `atlas_kept_it_out` | glitch level 1 on a `crush` label over "…You" | shaken, then sincere: the glitch clears as the bond line lands |
| `atlas_run_themselves`, `atlas_spark` | the doubler at `Decay=0.12` | the finale is steadier and closer |
| `atlas.mk1.*` call-outs, `atlas.warn.gel`, `atlas.warn.critical` | the short path (peak −4 dBFS) | under 1 s: too short for LUFS |

#### Atlas: the glitch variant (Volt Tower)

This is for `atlas_something_in`, `atlas.story.volt` ("My circuits
tingle!", level 1) and any Volt Tower line marked glitched. Run it **after**
the Atlas chain. It adds bit-crush, stutters and pitch wobble, keyed to the
labels, or to the whole line when a take has no labels.

| Level | Crush mix (dry / crushed) | Sample rate | Steps | Stutters | Wobble |
| --- | --- | --- | --- | --- | --- |
| 1 | 70 / 30 | 16 kHz | 128 | 0 | ±25 cents |
| 2 | 50 / 50 | 11 kHz | 32 | up to 2 | ±40 cents |
| 3 | 30 / 70 | 8 kHz | 12 | up to 3 | ±60 cents |

```audacity-chain atlas-glitch
# Bit-crush: each {crush-label} region, or SelectAll: when there are none. Level 2 shown.
Select: Start={t0} End={t1} Track=0 TrackCount=1 Mode=Set
NyquistPrompt: Command="(sim (mult 0.5 *track*) (mult 0.5 (quantize (force-srate 44100 (force-srate 11025 *track*)) 32)))" Version=4
# Stutter: each `stutter` label (no labels: the skill picks word onsets from the silence map). 60 ms, repeated once.
Select: Start={onset} End={onset+0.06} Track=0 TrackCount=1 Mode=Set
Repeat: Count=1
# skill: wobble: over each `wobble` label (no labels: the second half of the line), step through 100 ms windows, alternating up and down
Select: Start={w} End={w+0.1} Track=0 TrackCount=1 Mode=Set
ChangePitch: Percentage={+2.34 | -2.34} SBSMS=0
# `cut` label (atlas_something_in): delete everything after it, then a 2 ms fade, no tail.
Select: Start={cut} End={len} Track=0 TrackCount=1 Mode=Set
Delete:
```

`SBSMS=0` on the wobble is on purpose. The faster engine leaves small
seams at the window edges, and those seams are part of the glitch.

### Dr. Vex: the showman doctor

- **Voice:** big, theatrical and pompous. A game-show host crossed with a
  vain surgeon. It relishes its words and stretches the big ones ("Maaag-
  nificent"). The comedy villain energy should be over the top but never
  scary: the audience is all ages.
- **Avoid:** imitating any specific film villain's voice or catchphrases. We
  want the archetype, not an impression.
- **Processing:** two layers. The main read is pitched down about 2
  semitones, and under it sits the same read bit-crushed and pitched down an
  octave at −12 dB. On top go a gated square-wave buzz under the consonants
  and the Vex motif sting (the three falling square notes from the synth) on
  the first bubble of each scene.
- **Range across the story:** smug and amused (Prologue and Act I), then
  irritated (Volt Tower and hub glitches), then panicking (the Breach), then
  unravelling (Mk-I phase 2), then small and crackling (the defeat line).
  The glitch amount is post-processing, so record every line clean and
  theatrical.
- **The laugh:** record 3 takes of "Mwa-ha-HA!" (short, medium, and
  maniacal) for bubbles that end in a laugh.

#### Vex: the chain

The goal: bigger than the room he's in. He's pitched down and heavy, with an
octave of crushed menace under him and a square-wave buzz on every hard
consonant. That buzz is the synth villain's own voice leaking through the
actor's. His sound is also *placed*: Vex is almost never in the room with
Flux. He is on a hacked screen, on the arena PA, and then, in the Fortress,
finally in person. And as his plan falls apart, so does his signal.

| Dynamics | `{thr}` | `{ratio}` | `{atk}` | `{rel}` | `{lufs}` / `{peak}` |
| --- | --- | --- | --- | --- | --- |
| standard | −24 dB | 4 | 8 ms | 250 ms (the slow release keeps his swells theatrical) | −15 LUFS / −3 dBFS |
| `vex_second_opinion` | −24 dB | 4 | 8 ms | 250 ms | −19 LUFS |
| `vex_doctor_in` (a whisper) | −30 dB | 3 | 5 ms | 150 ms | −18 LUFS |

```audacity-chain vex
SelectAll:
# 1. The layers: the sub layer is copied from the RAW read, then each is pitched on its own.
Duplicate:
SelectTracks: Track=0 TrackCount=1 Mode=Set
ChangePitch: Percentage=-10.91 SBSMS=1
SelectTracks: Track=1 TrackCount=1 Mode=Set
ChangePitch: Percentage=-50 SBSMS=1
# The sub layer: an octave down, crushed, dark, at -12 dB.
NyquistPrompt: Command="(quantize (force-srate 44100 (force-srate 8000 *track*)) 24)" Version=4
Low-passFilter: frequency=2500 rolloff=dB24
High-passFilter: frequency=60 rolloff=dB24
Amplify: Ratio=0.2512
# 2. The consonant buzz on the main layer: a 98 Hz square (G2) gated by the voice's own energy over 3 kHz, so it only sounds under S, T, K and P.
SelectTracks: Track=0 TrackCount=1 Mode=Set
NyquistPrompt: Command="(let* ((env (force-srate *sound-srate* (snd-avg (s-abs (hp *track* 3000)) 441 441 op-peak))) (gate (s-max 0 (diff (mult 3 env) 0.06)))) (sim *track* (mult {buzz} gate (osc-pulse 98 0))))" Version=4
# {buzz} starts at 0.25. Audition the S's: too high reads as distortion; too low and nobody hears it.
# 3. One voice.
SelectTracks: Track=0 TrackCount=2 Mode=Set
MixAndRender:
# 4. Tone: a showman's chest (180 Hz), the bite of a sneer (3.5 kHz), less mud (800 Hz).
High-passFilter: frequency=110 rolloff=dB12
Low-passFilter: frequency=8000 rolloff=dB12
FilterCurve: FilterLength=8191 InterpolateLin=0 InterpolationMethod=B-spline f0=180 f1=450 f2=800 f3=2000 f4=3500 f5=6000 v0=2 v1=0 v2=-2 v3=0 v4=3 v5=0
# 5. The place: one of the three spaces below.
# 6. The glitch level of this line (below).
```

**Step 5, the place.** Pick one per line:

```audacity-chain vex-broadcast
# A hacked screen or a hub transmission: a narrow band, grit, no room.
High-passFilter: frequency=250 rolloff=dB24
Low-passFilter: frequency=4500 rolloff=dB24
NyquistPrompt: Command="(sim (mult 0.85 *track*) (mult 0.15 (quantize *track* 64)))" Version=4
```

```audacity-chain vex-pa
# The arena announcer: a PA in a big space. One slap and a short hall.
Echo: Delay=0.11 Decay=0.15
Reverb: RoomSize=85 Delay=20 Reverberance=35 HfDamping=70 ToneLow=60 ToneHigh=80 WetGain=-12 DryGain=0 StereoWidth=0 WetOnly=0
```

```audacity-chain vex-clinic
# In person, in the Fortress: a small hard room close up. His real voice, with nothing between him and Flux.
Reverb: RoomSize=35 Delay=5 Reverberance=25 HfDamping=40 ToneLow=100 ToneHigh=100 WetGain=-16 DryGain=0 StereoWidth=0 WetOnly=0
```

**Step 6, the glitch.** This follows his arc: smug, then irritated, then
panicking, then unravelling, then small. It uses the same crush, stutter and
wobble steps as Atlas's glitch variant (`atlas-glitch`), at the level below,
plus `tear` for the static rip.

| Line | Place | Glitch | Extra |
| --- | --- | --- | --- |
| `vex_diagnosis` | broadcast | 0 | a 0.4 s silence before "is ME" is part of the read. Don't let Stage 3 trim internal pauses (it only trims the ends). |
| `vex_present_scrapper`, `vex_present_blaze`, `vex_present_frost` | PA | 0 | |
| `vex_hub_scrapper`, `vex_hub_blaze`, `vex_sketches` | broadcast | 0 | |
| `vex_empty_head` | broadcast | 1 | a `wobble` label on "empty head…": the creepy hum |
| `vex_unwritable` | broadcast | 1 | a `stutter` label on "RUDE" |
| `vex_present_volt` | PA | 1 | |
| `vex_perfectly_fine` | broadcast | 2 | `stutter` labels on "per-", "-fect-" and "-ly"; the crush at level 3 on "FINE" (`crush` label) |
| `vex_present_gale` | PA | 1 | |
| `vex_more_masters` | broadcast | 1 | |
| `vex_present_magnet`, `vex_present_drill`, `vex_present_tide` | PA | 1 | |
| `vex_impossible` | broadcast | 1 | a `stutter` label on "Im-" |
| `vex_new_low` | broadcast | 1 | |
| `vex_tide_turn` | broadcast | 1 | a `wobble` label on "…Won't it?": the doubt |
| `vex_present_neon`, `vex_present_rotor` | PA | 2 | |
| `vex_lights_on` | broadcast | 2 | the crush at level 3 on "ON" (`crush` label) |
| `vex_nurse` | broadcast | 2 | a `tear` label over the second "NURSE!" (below), leading into `vex_patented` |
| `vex_patented` | broadcast | 2 | a `tear` label over "PATENTED" (below) |
| `vex_clinic`, `vex_behold` | clinic | 0 | the laugh file, if any, gets the same chain and a 250 ms tail |
| `vex_obey` | clinic | 1 | |
| `vex_listen` | clinic | 3 | wobble over the whole line: phase 2 is breaking him |
| `vex_second_opinion` | clinic | 3 | then `Low-passFilter: frequency=3000 rolloff=dB12` and a fade-out over the last 40 %: small and crackling |
| `vex_doctor_in` | clinic, `WetGain=-20` | 0 | no sub layer (skip step 1's duplicate): a whisper, close, and the slow grin carries it |
| laugh takes | as their bubble's line | as their bubble's line | a 250 ms tail |

```audacity-chain vex-tear
# The static rip over a `tear` label: the voice dips, and band-passed noise tears through it.
Select: Start={t0} End={t1} Track=0 TrackCount=1 Mode=Set
NyquistPrompt: Command="(sim (mult 0.55 *track*) (mult 0.22 (lp (hp (noise) 1800) 7000)))" Version=4
```

The **Vex motif** (E4 → C♯4 → A3, three 130 ms square notes; the `vexGlitch`
SFX in `synth.ts`) is **not** baked in either. The game plays it on the
first bubble of each scene, so it stays in time with the score and plays
exactly once.

### Flux: barks only

- **Voice:** youthful, bright and bouncy. A plucky little robot, never pained
  or gory, and every yelp should be funny. Cartoon timing.
- **Processing:** a light ring-mod or formant shift for a metallic edge, and
  a tiny synth **tail** that matches the hit type (see the bark table).
- **Record** 3 takes of each bark, and let the game pick at random.

#### Flux: the chain

The goal: a toy robot yelping, bright and small. It pokes out of a fight in
under half a second and makes you smile rather than wince. His barks land on
top of the hit SFX (same moment, same bus), so they're pitched up and
brightened into a band the hit sounds don't fill (the 4 kHz "sparkle"). Then
they're hard-compressed and peak-normalized; they're too short for LUFS.

| Dynamics | `{thr}` | `{ratio}` | `{atk}` | `{rel}` | `{peak}` |
| --- | --- | --- | --- | --- | --- |
| all barks | −28 dB | 6 | 1 ms | 60 ms | −3 dBFS (the tail included) |

```audacity-chain flux
SelectAll:
# 1. Youthful and bouncy: +3 semitones. The formants rise too (Audacity's pitch shift doesn't keep them), and that's the point: small body, big energy.
ChangePitch: Percentage=18.92 SBSMS=1
# 2. The metallic edge: 20 % of the voice ring-modulated at 330 Hz.
NyquistPrompt: Command="(sim (mult 0.8 *track*) (mult 0.2 *track* (hzosc 330)))" Version=4
# 3. Bright and clear of the thumps.
High-passFilter: frequency=150 rolloff=dB12
Low-passFilter: frequency=9000 rolloff=dB12
FilterCurve: FilterLength=8191 InterpolateLin=0 InterpolationMethod=B-spline f0=300 f1=1000 f2=4000 f3=7000 v0=-1 v1=0 v2=3 v3=0
# 4. The synth tail (see the table): import, place it 30 ms before the voice ends, 8 dB under, mix.
# skill: voiceEnd = the end of the bark's clip (GetInfo: Type=Clips)
Import2: Filename="vo-src/tails/{tail}.ogg"
SelectTracks: Track=1 TrackCount=1 Mode=Set
SetClip: At=0 Start={voiceEnd-0.03}
Amplify: Ratio=0.398
SelectTracks: Track=0 TrackCount=2 Mode=Set
MixAndRender:
```

**Per-bark changes:**

| Type | Tail (`vo-src/tails/`) | Extra step (before the tail) |
| --- | --- | --- |
| `light` | `tick` | none |
| `heavy` | `clang` | none |
| `fire` | `sizzle` | none |
| `ice` | `tinkle` | `Echo: Delay=0.03 Decay=0.25` (a glassy flutter) |
| `volt` | `crackle` | the crush at level 1 (the `atlas-glitch` crush) |
| `wind` | `whoosh` | none |
| `trap` | none | none |
| `crusher` | `squeak` | `ChangePitch: Percentage=12.25` again on the last 40 % (squashed higher) |
| `pit` | `fall` | `SlidingStretch: RatePercentChangeStart=0 RatePercentChangeEnd=0 PitchHalfStepsStart=0 PitchHalfStepsEnd=-7 PitchPercentChangeStart=0 PitchPercentChangeEnd=-33.26` on the "aaaa", then `Low-passFilter: frequency=3000` and a fade-out over the last 50 %: the Doppler fall |
| `lowHp` | `whine` | none |
| `down` | `powerdown` | `SlidingStretch` over the last 60 % with `PitchHalfStepsEnd=-4` and `PitchPercentChangeEnd=-20.63`: droopy, not dying |
| `parry` | `ping` | none |
| `gel` | `shimmer` | `Echo: Delay=0.04 Decay=0.2` (relief, a little airy) |

The tails are short synth sounds made in the same style as the game's SFX
(pulse and noise, from `synth.ts`), mono and peaking at −6 dBFS. They are
made once and reused by every take of that type.

### Prof. Gauss: the ending (optional)

- **Voice:** elderly, gentle, clever and a little amused. A grandmother who
  built half the city.
- **Processing:** a very light metallic shimmer, softer than Atlas.

#### Gauss: the chain

The goal: the only voice at the end that isn't fighting anything. She's full
range and warm, in the lab's small room, with just enough shimmer to be an
android. Her lines play over the ending, with no fight SFX under them, so
she can sit a little lower and breathe. Both use this one chain, the lab's
room included: `ending.spark` plays over the sunrise, but one preset per
character keeps her the same voice across the cut.

| Dynamics | `{thr}` | `{ratio}` | `{atk}` | `{rel}` | `{lufs}` |
| --- | --- | --- | --- | --- | --- |
| her lines | −20 dB | 2 | 15 ms | 300 ms | −17 LUFS |

```audacity-chain gauss
SelectAll:
# 1. Warm and full; a little air on top instead of Atlas's presence push.
High-passFilter: frequency=90 rolloff=dB12
Low-passFilter: frequency=10000 rolloff=dB12
FilterCurve: FilterLength=8191 InterpolateLin=0 InterpolationMethod=B-spline f0=200 f1=500 f2=3000 f3=9000 v0=1 v1=0 v2=0 v3=2
# 2. The shimmer: a 9 ms comb, fainter than Atlas's doubler, and a trace of ring-mod up high.
Echo: Delay=0.009 Decay=0.12
NyquistPrompt: Command="(sim (mult 0.97 *track*) (mult 0.03 *track* (hzosc 2400)))" Version=4
# 3. The lab: a soft small room with the highs damped.
Reverb: RoomSize=30 Delay=8 Reverberance=30 HfDamping=70 ToneLow=100 ToneHigh=70 WetGain=-17 DryGain=0 StereoWidth=0 WetOnly=0
```

### Pip: the debriefs

Pip was synth chirps and glyphs only; since #119 he has a voice, for one
job: the **debrief** after each story mission (`story/debrief.ts`). In the
Lab itself he still speaks in glyphs and chirps, as `story.md` has it, and
his two-note chirp stays a synth sound (`sound-todo.md`), never baked into
a line.

- **Voice:** a light, clear, brisk tenor with a smile in it; a man in his
  late twenties. A cheerful young lab technician pointing at a map: short
  plain sentences, eager, proud of every relay. Never a soldier, never a
  child.
- **Apart from the others:** from Flux (late-teen, yelps only) by age, full
  sentences and neat diction; from Atlas (a low alto, field warnings) by
  gender, pitch and pace. Pip briefs in the safe Lab and never warns in the
  field: that is Atlas's job.
- **Tones:** warm, excited, cheeky, neutral, calm. Never urgent.
- **Chain** (`tools/voice/fx.mjs`, ffmpeg): a tiny bot with a tiny speaker.
  +2 semitones (formants rise with it; +3 turns full sentences chipmunk), a
  bell-like 10 % ring-mod at 880 Hz, the highest high-pass in the cast
  (380 Hz to 7.8 kHz, so he reads smaller than Atlas and Flux), -2 dB at
  500 Hz, +3 dB at 2.5 kHz, a 7 ms comb as the tin body. No room: he talks
  over the hologram, close. Dynamics -24 dB, 3.5:1, 3 ms / 100 ms; -16 LUFS.

---

## Script

The i18n keys are proposals; they get added to `en.ts` and all 20 other
locales when this is implemented. "Max" is the cap on the delivered length.

### Intro cutscene

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_log_start` | `atlas.intro.log` | Atlas | "Log start." | Flat, clinical. Starts the rewind. | 1.0 s |
| `vex_diagnosis` | `story.vex.diagnosis` | Vex | "Diagnosis: this valley is SICK. The cure… is ME!" | A grand reveal. A pause before "is ME", which is huge. | 3.5 s |
| `atlas_core_online` | `atlas.intro.online` | Atlas | "Core online. Good morning, Flux." | Soft, the first words he ever hears. Warm on "Flux". | 2.2 s |
| `atlas_scrapyard_first` | `atlas.intro.plan` | Atlas | "Scrapyard first. One relay at a time." | Matter-of-fact. The mission in one breath. | 2.2 s |

### Prologue: Scrapyard

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_boss_signal_first` | `atlas.boss.signalFirst` | Atlas | "Core Master signal. It's… big." | Deadpan understatement, with a pause before "big". | 2.2 s |
| `vex_present_scrapper` | `vex.present.scrapper` | Vex | "Warm up act! The SCRAPPER!" | A ringmaster, a bit dismissive. | 2.5 s |
| `atlas_relay_one` | `atlas.story.relayOne` | Atlas | "Relay one lit. Nine to go." | The first small win, and a long road ahead. A hint of a smile. | 2.0 s |
| `vex_hub_scrapper` | `vex.hub.scrapper` | Vex | "A junk crane? How… adorable." | Mock-sweet, patronizing. | 2.5 s |

### Act I: Heat and Ice

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_blaze_beamin` | `atlas.sector.blaze` | Atlas | "Refinery. It runs hot. Mind the vents." | Brisk briefing. | 2.4 s |
| `vex_present_blaze` | `vex.present.blaze` | Vex | "The oldest! The hottest! BLAZE MASTER!" | A full boxing-announcer build. | 3.0 s |
| `atlas_weapon_copied` | `atlas.story.copied` | Atlas | "{weapon} copied." | Crisp. *Record one per weapon:* Scrap Burst, Flame Wave, Ice Lance, Thunder Arc, Gale Guard, Magnet Pull, Drill Bomb, Bubble Lance, Neon Blade, Drone Swarm. | 1.6 s |
| `vex_hub_blaze` | `vex.hub.blaze` | Vex | "Side effect noted. Increasing the dose." | Clinical and irritated, like a doctor annoyed at a chart. | 2.8 s |
| `atlas_cryo_beamin` | `atlas.sector.cryo` | Atlas | "Coolant's flowing uphill. To the Fortress." | Noticing something, suspicious. | 2.4 s |
| `vex_present_frost` | `vex.present.frost` | Vex | "Chill, little droid. FROST MASTER!" | Smug about the pun. | 2.8 s |
| `atlas_left_something` | `atlas.story.dataCore` | Atlas | "It left us something." | Curious, quiet. | 1.6 s |

### Midpoint: the Blueprint

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_first_draft` | `atlas.story.firstDraft` | Atlas | "…I was written from its first draft." | The quietest line in the game. Unsettled. | 2.6 s |
| `atlas_building_body` | `atlas.story.body` | Atlas | "It's building a body. Out of our valley." | Recovering, resolve coming back. | 2.6 s |
| `vex_sketches` | `vex.hub.blueprint` | Vex | "My sketches! Magnificent, aren't I?" | Preening, delighted to be noticed. | 2.8 s |

### Act II: Storm Front

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_something_in` | `atlas.volt.hack` | Atlas | "Flux… something's in the—" | Record clean and cut off mid-word. The glitch is post. | 2.0 s |
| `vex_empty_head` | `vex.volt.hack` | Vex | "Let's see what's in that empty head…" | Creepy-playful, a burglar humming. | 2.8 s |
| `vex_unwritable` | `vex.volt.fail` | Vex | "Unwritable?! How RUDE." | Scandalized. The monocle pops. | 2.2 s |
| `atlas_kept_it_out` | `atlas.volt.thanks` | Atlas | "…You kept it out. Thank you." | Shaken, then sincere. Their bond line. | 2.4 s |
| `vex_present_volt` | `vex.present.volt` | Vex | "Blink and you'll miss it! VOLT MASTER!" | Fast and zappy. | 2.8 s |
| `atlas_power_station` | `atlas.story.voltFreed` | Atlas | "The signal's lost its power station." | Satisfied. | 2.2 s |
| `vex_perfectly_fine` | `vex.hub.volt` | Vex | "I am… per-fect-ly… FINE." | Forced calm that cracks on "FINE". Post adds stutter. | 2.8 s |
| `atlas_docks_beamin` | `atlas.sector.gale` | Atlas | "Every part for its body goes through here." | A briefing with purpose. | 2.4 s |
| `vex_present_gale` | `vex.present.gale` | Vex | "Next, please! GALE MASTER, blow him away!" | Brisk showmanship: a doctor calling the next patient. Not desperate yet, because he still has a reserve. | 3.0 s |
| `atlas_no_more_parts` | `atlas.story.galeFreed` | Atlas | "No more parts reach the Fortress." | Quiet triumph. | 2.2 s |
| `vex_more_masters` | `vex.hub.gale` | Vex | "Fine! I have MORE Masters." | Huffy, then smug again: he has a trick left. Sets up the second shift. | 2.4 s |

### Act IIb: The Second Shift

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_works_beamin` | `atlas.sector.magnet` | Atlas | "A foundry. It's casting claws." | Noticing something; a little grim. | 2.2 s |
| `vex_present_magnet` | `vex.present.magnet` | Vex | "Attractive, isn't it? MAGNET MASTER!" | Silky, pleased with the pun. A ringmaster leaning on "attractive". | 2.8 s |
| `atlas_no_more_claws` | `atlas.story.magnetFreed` | Atlas | "The foundry's cold. No more claws." | Satisfied. | 2.2 s |
| `vex_impossible` | `vex.hub.magnet` | Vex | "Repelled? Me? Im-POSSIBLE!" | Offended vanity; breaks "Im-POSSIBLE" in two. | 2.4 s |
| `atlas_mine_beamin` | `atlas.sector.drill` | Atlas | "Ore for its armor. Dug right here." | Low and close, like a voice down a shaft. | 2.2 s |
| `vex_present_drill` | `vex.present.drill` | Vex | "Time for a deep check-up! DRILL MASTER!" | Bedside manner gone theatrical; leans into "deep". | 3.0 s |
| `atlas_no_more_ore` | `atlas.story.drillFreed` | Atlas | "The mine's quiet. No more ore." | Quiet, a breath out. | 2.2 s |
| `vex_new_low` | `vex.hub.drill` | Vex | "Hmph. A new low. Literally." | Sulky and deadpan, then pleased with his own pun on "Literally." | 2.4 s |
| `atlas_locks_beamin` | `atlas.sector.tide` | Atlas | "Barges now. Vex found another way." | Wry: Vex is resourceful. | 2.2 s |
| `vex_present_tide` | `vex.present.tide` | Vex | "Wave goodbye, droid! TIDE MASTER!" | Grand and splashy, a game-show host swinging his arm. | 2.8 s |
| `atlas_barges_home` | `atlas.story.tideFreed` | Atlas | "Locks shut. The barges stay home." | Pleased, a small smile. | 2.2 s |
| `vex_tide_turn` | `vex.hub.tide` | Vex | "The tide will turn! …Won't it?" | Defiant, then a small, doubtful pause before "…Won't it?" | 2.6 s |
| `atlas_boulevard_beamin` | `atlas.sector.neon` | Atlas | "Lights out. Except Vex's face." | Dry, almost a joke. | 2.0 s |
| `vex_present_neon` | `vex.present.neon` | Vex | "Lights! Camera! NEON MASTER!" | Pure showbiz: a director calling the shot, then the name in lights. | 2.6 s |
| `atlas_lights_on` | `atlas.story.neonFreed` | Atlas | "Lights on. Vex lost its screens." | Delighted, warm. | 2.2 s |
| `vex_lights_on` | `vex.hub.neon` | Vex | "Who turned the lights ON?!" | Shrieking, squinting at the light. Post adds the glitch. | 2.2 s |
| `atlas_airfield_beamin` | `atlas.sector.rotor` | Atlas | "Drones. Its last supply line." | Focused: the end is in sight. | 2.0 s |
| `vex_present_rotor` | `vex.present.rotor` | Vex | "The grand finale! ROTOR MASTER!" | The last card. Still the showman, but the voice strains at the top. | 2.8 s |
| `atlas_vex_alone` | `atlas.story.rotorFreed` | Atlas | "Every line's cut. Vex is alone." | Quiet triumph, with weight to it. | 2.2 s |
| `vex_nurse` | `vex.hub.rotor` | Vex | "Ten relays?! Nurse! NURSE!" | Panic: calling for a nurse who never comes. The tantrum builds into the Breach. Post adds the static tear. | 2.4 s |
| `vex_patented` | `vex.hub.breach` | Vex | "No, no, NO! That shield was PATENTED!" | Full tantrum. Post adds the static tear. | 3.0 s |
| `atlas_shield_down` | `atlas.story.breach` | Atlas | "Shield's down. The Fortress is open." | Steady; this is it. | 2.2 s |

### Atlas: the relay count (live)

At each story mission's start, Atlas counts the relays lit so far. These
lines are already in the game (`atlas.arc.<n>`, the locale's text), and the
count now runs to ten:

| Key | Line | Direction | Max |
| --- | --- | --- | --- |
| `atlas.arc.1` | "One relay lit. Nine to go!" | The score so far, with a hint of pride. | 3.0 s |
| `atlas.arc.2` | "Two relays! Vex is sulking." | The same. | 3.0 s |
| `atlas.arc.3` | "Three lit. Keep glowing!" | The same. | 3.0 s |
| `atlas.arc.4` | "Four down. The grid hums again." | The same. | 3.0 s |
| `atlas.arc.5` | "Halfway there! Vex is sweating." | The same. | 3.0 s |
| `atlas.arc.6` | "Six relays! The city wakes up." | The same. | 3.0 s |
| `atlas.arc.7` | "Seven lit. Keep it up!" | The same. | 3.0 s |
| `atlas.arc.8` | "Eight! Only two Masters left." | The same. | 3.0 s |
| `atlas.arc.9` | "One Master left. Almost!" | The same. | 3.0 s |
| `atlas.arc.10` | "Shield's down. Vex is next!" | Steady and ready: the last door is open. | 3.0 s |

### Act III: The Fortress

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_half_built` | `atlas.fortress.bays` | Atlas | "Half-built. You did that." | Proud, understated. | 1.8 s |
| `vex_clinic` | `vex.fortress.welcome` | Vex | "Welcome to my clinic! Take a seat… FOREVER!" | A villain host, relishing it. Laugh optional. | 3.2 s |
| `vex_behold` | `vex.mk1.intro` | Vex | "Behold! My new body! Mark ONE!" | The peak of vanity. | 2.8 s |
| `atlas_the_real_one` | `atlas.mk1.intro` | Atlas | "That's Vex. The real one." | Low and focused. | 1.8 s |
| `atlas_call_fire` … | `atlas.mk1.fire` / `.ice` / `.volt` / `.wind` / `.scrap` | Atlas | "Fire!" "Ice!" "Volt!" "Wind!" "Scrap!" | Sharp call-outs, on the beat of the telegraph. | 0.6 s |
| `vex_obey` | `vex.mk1.obey` | Vex | "Masters! OBEY your doctor!" | Commanding, strained. | 2.4 s |
| `vex_listen` | `vex.mk1.listen` | Vex | "Why won't they LISTEN?!" | Cracking, genuine confusion under the rage. | 2.2 s |
| `atlas_because_free` | `atlas.mk1.free` | Atlas | "Because they're free." | Calm, almost gentle. The thesis of the game. | 1.8 s |
| `vex_second_opinion` | `vex.mk1.defeat` | Vex | "I'll get… a second opinion…" | Small, fading, still smug under it. | 2.6 s |

### Act III: the Core Descent and the Grand Master Bot

These lines are in the game now (the locale's text under `atlas.hint.vex`
and `atlas.hint.gm`) and still need adding to `voiceCatalog.ts`. All are
Atlas, on **the Atlas chain** with the *standard* dynamics row: no glitch
variant (that stays the Volt Tower's), and none of them takes the
`atlas.warn.critical*` row. The urgency is in the read, tighter and
faster, never louder, as the cast notes ask. They play over a boss fight,
so the presence push of the chain is what carries them.

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_vex_roof` | `atlas.hint.vex.roof` | Atlas | "Lightning! Move when the ring lights up!" | Quick coaching under a storm. Clear on "ring". | 2.4 s |
| `atlas_vex_fall` | `atlas.hint.vex.fall` | Atlas | "The roof's giving way!" | Sudden, tight. Plays as the floor rumbles. | 1.4 s |
| `atlas_vex_core` | `atlas.hint.vex.core` | Atlas | "Down to the Core! Don't fall in!" | Tense, focused: the last stage. | 2.0 s |
| `atlas_gm_button` | `atlas.hint.gm.button` | Atlas | "Vex is pressing something... Brace yourself!" | Wary on the first half, a beat, then firm. Atlas calls Vex "he" here, as the locale does. | 2.6 s |
| `atlas_gm_arms` | `atlas.hint.gm.arms` | Atlas | "Its arms first! The cannon and the lance!" | Tactical, quick, pointing out targets. | 2.4 s |
| `atlas_gm_feet` | `atlas.hint.gm.feet` | Atlas | "Now the feet! Block the shockwaves!" | The same, a notch more urgent. | 2.2 s |
| `atlas_gm_head` | `atlas.hint.gm.head` | Atlas | "It's down low. The head is in reach!" | Spotting an opening; a hint of a grin. | 2.4 s |
| `atlas_gm_body` | `atlas.hint.gm.body` | Atlas | "The core is open! Finish it!" | The push to the end. Resolve, not a shout. | 1.8 s |
| `atlas_gm_prism` | `atlas.hint.gm.prism` | Atlas | "Prism Cannon! Shield up!" | A sharp call-out on the charge, like the Mk-I's element calls. | 1.4 s |

### Ending

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `atlas_could_run_it` | `atlas.ending.spire` | Atlas | "The Spire's empty. I could run all of it." | Tempted. A slow realization, not greed. | 2.8 s |
| `atlas_run_themselves` | `atlas.ending.choice` | Atlas | "…No. They can run themselves." | A decision; peace. | 2.2 s |
| `gauss_welcome_home` | `gauss.ending.home` | Gauss | "Welcome home. Both of you." | Warm, tired and proud. *Optional.* | 2.4 s |
| `atlas_spark` | `atlas.ending.spark` | Atlas | "Flux… did you see that spark?" | Light and curious; a hook, not dread. | 2.2 s |
| `vex_doctor_in` | `vex.sting.doctorIn` | Vex | "The doctor… is IN." | Whispered, then a slow grin. *NG+ only.* | 2.2 s |

### Ending: First Free Morning (built)

The built ending (#102) has its own captions (`ending.*` in `en.ts`). Three
are spoken; the other four (`ending.fall`, `.relays`, `.thaw`, `.morning`)
are narration and stay subtitle-only. Each caption holds 6.5 s, so the Max
column leaves the read room to land. The planned ending lines above
(`atlas.ending.spire`, `.choice`, `.spark`, `gauss.ending.home`) are not
in the built ending; *proposed:* retire them from the catalog when these
three are added, and keep `vex.sting.doctorIn` for the Mk-II sting.

| VO id | Key | Who | Line | Direction | Max |
| --- | --- | --- | --- | --- | --- |
| `gauss_you_did_it` | `ending.gauss` | Gauss | "Flux... you did it. You brought them all back." | Just out of the ice: a breath first, warm, tired and proud. The pause after "Flux" is her waking up. **The Gauss chain.** | 3.6 s |
| `atlas_its_theirs` | `ending.atlas` | Atlas | "The Spire is empty. I could run this city now. I won't. It's theirs." | Tempted for one sentence, then a decision, and peace. It should sound like a choice, not a sacrifice. The game's one long Atlas line: over the 7-word rule on purpose, so a brisk read to fit the catalogue's 3.5 s cap. **The Atlas chain**, standard row, no glitch. | 3.5 s |
| `gauss_that_spark` | `ending.spark` | Gauss | "Flux... did you see that spark?" | Light and curious, over the sunrise; a hook, not dread. **The Gauss chain.** | 2.4 s |

### The debriefs between missions (Pip, built)

After a Core Master's first fall and its result screen, before the Lab: the
valley from above, the freed sectors in their own colours, the rest in Vex's
red. Pip says what the win changed, the camera goes to the weapon Flux copied
(its card), Vex reacts (the scene that Master had in the Lab: his broadcast,
or the blueprint, the reserve, the breach), then the camera travels to the
next sector, where its Master stands as a hologram: where to go, what that
Master has done there, how to beat it. Six Pip lines at most, about 25 s; a
tap moves on a line, Skip ends it. Once per Master and run (`debrief:<boss>`;
New Game+ clears the flags, so the story is told again).
The Fortress has none: its win has the ending.

`{weapon}`, `{sector}` and `{boss}` are filled with the game's own names.

| VO id | Key | Line | Direction | Max |
| --- | --- | --- | --- | --- |
| `pip_debrief_hello` | `pip.debrief.hello` | "Welcome back, Flux! Look at the valley." | Bright and glad to see him; a quick breath, then pointing at the hologram. | 2.6 s |
| | | **After Scrapyard → Blaze Refinery** | | |
| `pip_debrief_scrapyard_won` | `pip.debrief.scrapyard.won` | "The old crane is sorting scrap again." | Pleased and a little amazed: the first thing that went back to normal. | 2.6 s |
| `pip_debrief_scrapyard_weapon` | `pip.debrief.scrapyard.weapon` | "You copied {weapon}. It sprays three ways." | Proud of him, then a handy tip, said plainly. | 2.8 s |
| `pip_debrief_scrapyard_next` | `pip.debrief.scrapyard.next` | "Next stop: {sector}. Just a little tougher." | Like a tour guide; reassuring on 'just a little'. | 2.8 s |
| `pip_debrief_scrapyard_boss` | `pip.debrief.scrapyard.boss` | "{boss} is forging armor for Vex's machines." | Worried, a touch indignant: that forge used to work for the city. | 3 s |
| `pip_debrief_scrapyard_tip` | `pip.debrief.scrapyard.tip` | "Block its fireballs. Slide past the fire waves." | Two clear instructions, a small beat between them. | 3 s |
| | | **After Blaze Refinery → Cryo Plant** | | |
| `pip_debrief_blaze_won` | `pip.debrief.blaze.won` | "The chimneys burn clean again. Nice work!" | Relieved, then a quick, honest compliment. | 2.8 s |
| `pip_debrief_blaze_weapon` | `pip.debrief.blaze.weapon` | "You've got {weapon} now. Fire melts ice!" | Delighted; 'Fire melts ice' like a rule he just remembered. | 2.8 s |
| `pip_debrief_blaze_next` | `pip.debrief.blaze.next` | "{sector} is next. The machines hit harder there." | A friendly heads-up, not a scare. | 3 s |
| `pip_debrief_blaze_boss` | `pip.debrief.blaze.boss` | "{boss} keeps all the coolant. The city's overheating." | Concerned; the second sentence is the reason to go. | 3 s |
| `pip_debrief_blaze_tip` | `pip.debrief.blaze.tip` | "Block its ice shots, then fire back!" | Cheeky on 'fire back': he knows it is a pun. | 2.6 s |
| | | **After Cryo Plant → Volt Tower** | | |
| `pip_debrief_cryo_won` | `pip.debrief.cryo.won` | "Coolant's flowing home. The city can cool down." | A happy sigh of relief. | 2.8 s |
| `pip_debrief_cryo_weapon` | `pip.debrief.cryo.weapon` | "{weapon} is yours. Ice beats lightning!" | Eager; the rule lands crisp and bright. | 2.6 s |
| `pip_debrief_cryo_next` | `pip.debrief.cryo.next` | "Next: {sector}, downtown. A real step up." | Honest about the jump, still upbeat. | 2.8 s |
| `pip_debrief_cryo_boss` | `pip.debrief.cryo.boss` | "{boss} pours our power into the Red Signal." | Serious for a moment; stress 'our power'. | 3 s |
| `pip_debrief_cryo_tip` | `pip.debrief.cryo.tip` | "It teleports a lot. Shoot down its orbs." | Quick and practical, like reading from his notes. | 2.8 s |
| | | **After Volt Tower → Sky Docks** | | |
| `pip_debrief_volt_won` | `pip.debrief.volt.won` | "Vex's face keeps flickering now. Did you see?" | Giggling at the villain; the question is gleeful. | 2.8 s |
| `pip_debrief_volt_weapon` | `pip.debrief.volt.weapon` | "{weapon} is yours. Lightning beats wind!" | Bright and quick; the rule again, pleased with the pattern. | 2.6 s |
| `pip_debrief_volt_next` | `pip.debrief.volt.next` | "Next: {sector}, way up high. Tough machines." | Looking up as he says it; a small gulp on 'way up high'. | 2.8 s |
| `pip_debrief_volt_boss` | `pip.debrief.volt.boss` | "{boss} runs Vex's airships, day and night." | A little sorry for the Master: it never gets to rest. | 2.8 s |
| `pip_debrief_volt_tip` | `pip.debrief.volt.tip` | "Block the feathers. Parry when it dives!" | Coaching; lift on 'Parry'. | 2.8 s |
| | | **After Sky Docks → Polarity Works** | | |
| `pip_debrief_gale_won` | `pip.debrief.gale.won` | "The airships turned around. Clear skies again!" | Cheering, arms up. | 2.8 s |
| `pip_debrief_gale_weapon` | `pip.debrief.gale.weapon` | "{weapon} is yours. Its leaves block shots." | Pleased, explaining a clever gadget. | 2.8 s |
| `pip_debrief_gale_next` | `pip.debrief.gale.next` | "Now the city's edge: {sector}. Much tougher." | The mood drops a step: five more relays just woke up. Plain on 'Much tougher'. | 3 s |
| `pip_debrief_gale_boss` | `pip.debrief.gale.boss` | "{boss} took the tram rails for Vex's freight." | Indignant in a small way: those are the city's trams. | 3 s |
| `pip_debrief_gale_tip` | `pip.debrief.gale.tip` | "It pulls you in. Block the clamp!" | A warning with a wince, then the fix, firm. | 2.6 s |
| | | **After Polarity Works → Deep Mine** | | |
| `pip_debrief_magnet_won` | `pip.debrief.magnet.won` | "The trams are rolling again. Ding ding!" | Playful; 'Ding ding' is a tram bell, two bright notes. | 2.6 s |
| `pip_debrief_magnet_weapon` | `pip.debrief.magnet.weapon` | "{weapon} cracks shields. Perfect for the next Master." | A tip passed on with a wink. | 3 s |
| `pip_debrief_magnet_next` | `pip.debrief.magnet.next` | "Next: {sector}, deep underground. Seriously strong machines." | Voice goes a little lower on 'deep underground'. | 3 s |
| `pip_debrief_magnet_boss` | `pip.debrief.magnet.boss` | "{boss} trapped the worker-bots down the shaft." | Worried for them; this is a rescue. | 2.8 s |
| `pip_debrief_magnet_tip` | `pip.debrief.magnet.tip` | "It digs under you. Step off the mark!" | Quick; the second sentence is the thing to remember. | 2.8 s |
| | | **After Deep Mine → Tidewater Locks** | | |
| `pip_debrief_drill_won` | `pip.debrief.drill.won` | "The worker-bots are back up in daylight." | Soft and happy: they are safe. | 2.8 s |
| `pip_debrief_drill_weapon` | `pip.debrief.drill.weapon` | "{weapon} goes boom. Save some for the boss!" | Gleeful on 'boom', then a conspirator's tip. | 3 s |
| `pip_debrief_drill_next` | `pip.debrief.drill.next` | "Next: {sector}, down by the water. Very tough." | Matter-of-fact; no drama on 'Very tough'. | 3 s |
| `pip_debrief_drill_boss` | `pip.debrief.drill.boss` | "{boss} is flooding the canals for Vex's barges." | Concerned; the water keeps rising as he says it. | 3 s |
| `pip_debrief_drill_tip` | `pip.debrief.drill.tip` | "Slide under its waves. Pop the bubbles!" | Light and bouncy; 'Pop' pops. | 2.8 s |
| | | **After Tidewater Locks → Blackout Boulevard** | | |
| `pip_debrief_tide_won` | `pip.debrief.tide.won` | "Clean water's flowing into the valley again." | Content, like watching a tap run clear. | 2.8 s |
| `pip_debrief_tide_weapon` | `pip.debrief.tide.weapon` | "{weapon} rolls through crowds. The boss hates bubbles!" | Amused by the idea; a small laugh in 'hates bubbles'. | 3 s |
| `pip_debrief_tide_next` | `pip.debrief.tide.next` | "Next: {sector}, the dark rooftops. Really dangerous." | Hushed on 'dark rooftops'; he does not like the dark. | 3.2 s |
| `pip_debrief_tide_boss` | `pip.debrief.tide.boss` | "{boss} switched off every window downtown." | A little sad: the city has gone dark. | 2.8 s |
| `pip_debrief_tide_tip` | `pip.debrief.tide.tip` | "Its blade flies out and back. Dodge twice!" | Draw the blade's path with the voice: out, and back. | 3 s |
| | | **After Blackout Boulevard → Rotor Run** | | |
| `pip_debrief_neon_won` | `pip.debrief.neon.won` | "Downtown's glowing pink tonight. So pretty!" | Dreamy for a second; he loves the lights. | 2.6 s |
| `pip_debrief_neon_weapon` | `pip.debrief.neon.weapon` | "{weapon} cuts twice. The next Master fears it!" | Confident; he is handing over the right tool. | 3 s |
| `pip_debrief_neon_next` | `pip.debrief.neon.next` | "Next: {sector}, the sky airfield. Almost the toughest." | Building up: one Master left. | 3 s |
| `pip_debrief_neon_boss` | `pip.debrief.neon.boss` | "{boss} fills the sky with cargo drones." | Looking up, a bit overwhelmed by how many. | 2.8 s |
| `pip_debrief_neon_tip` | `pip.debrief.neon.tip` | "It blows you back. Slide under the gusts!" | Brisk coaching; lean on 'Slide'. | 2.8 s |
| | | **After Rotor Run → Vex Fortress** | | |
| `pip_debrief_rotor_won` | `pip.debrief.rotor.won` | "The drones deliver to the worker-bots now." | Proud: the last supply line works for the city. | 2.8 s |
| `pip_debrief_rotor_weapon` | `pip.debrief.rotor.weapon` | "{weapon} is yours. Three drones find their targets." | Fond of the little drones; they are a bit like him. | 3 s |
| `pip_debrief_rotor_next` | `pip.debrief.rotor.next` | "Last stop: {sector}. The toughest place there is." | Slower and steadier than usual; a breath before 'The toughest'. | 3 s |
| `pip_debrief_rotor_boss` | `pip.debrief.rotor.boss` | "{boss} can't hide behind a shield now." | Brave for a small bot; a little triumphant. | 3 s |
| `pip_debrief_rotor_tip` | `pip.debrief.rotor.tip` | "It borrows the Masters' attacks. Pack Repair Gel!" | Caring and practical: the last piece of advice before the big one. | 3 s |
| `pip_debrief_go` | `pip.debrief.go` | "Gear up, then go! I'll mind the lab." | A cheerful send-off; practical on 'gear up', cosy on 'I'll mind the lab'. | 2.8 s |

### Atlas: field warnings

| VO id | Key | Line | Direction | Max |
| --- | --- | --- | --- | --- |
| `atlas_boss_ahead` | `atlas.warn.boss` | "Core Master ahead." | Alert. | 1.4 s |
| `atlas_weak_<weapon>` | `atlas.weak.<weapon>` | "{weapon} hurts this one!" | Tactical, a quick tip with a grin. **Live:** said right after "Boss ahead" when Flux carries the Master's weakness. *Record one per weapon* (Gale Guard, Flame Wave, Ice Lance, Thunder Arc, Drone Swarm, Magnet Pull, Drill Bomb, Bubble Lance, Neon Blade). | 2.2 s |
| `atlas_noWeak` | `atlas.noWeak` | "No weak spot visible. Move!" | Focused. **Live:** the Scrapper's and Vex's boss doors. | 2.2 s |
| `atlas_use_gel_first` | `atlas.warn.gelFirst` | "Plating's cracking. Use a gel." | Concerned, a clear instruction. | 2.0 s |
| `atlas_use_gel` | `atlas.warn.gel` | "Gel." | A quick nudge. | 0.6 s |
| `atlas_critical_first` | `atlas.warn.criticalFirst` | "Critical! Back off!" | Tight and fast, **not** loud. | 1.2 s |
| `atlas_critical` | `atlas.warn.critical` | "Critical!" | Tight. | 0.7 s |
| `atlas_no_gel` | `atlas.warn.noGel` | "No gel left. Play it safe." | Worried and calm. | 1.8 s |
| `atlas_we_low` | `atlas.warn.weLow` | "Weapon energy low. Buster's free." | Practical. | 2.0 s |
| `atlas_we_empty` | `atlas.warn.weEmpty` | "Tank's dry." | Dry (pun intended). | 0.9 s |
| `atlas_borrowed_last` | `atlas.warn.borrowedLast` | "Last shot of {weapon}." | A heads-up. *Record per weapon.* | 1.6 s |
| `atlas_trap_flame` | `atlas.warn.flame` | "Vents. Wait for it… or slide." | Coaching, with a pause for "wait for it". | 2.2 s |
| `atlas_trap_blade` | `atlas.warn.blade` | "Blade. Go right after it." | Coaching. | 1.8 s |
| `atlas_crusher` | `atlas.warn.crusher` | "Crusher. Watch the lamp." | Coaching. | 1.6 s |
| `atlas_ladder` | `atlas.warn.ladder` | "Ladder. Push toward the wall." | Coaching. | 1.8 s |
| `atlas_pit` | `atlas.warn.pit` | "Long drop. Time the lift." | Coaching. | 1.6 s |
| `atlas_locator` | `atlas.hint.locator` | "Objective's that way." | Casual. | 1.4 s |
| `atlas_rescue_near` | `atlas.hint.rescue` | "Worker-bot signal. Faint. Close." | Hopeful. | 2.0 s |
| `atlas_upgrade` | `atlas.hint.upgrade` | "That's an upgrade." | Pleased. | 1.2 s |
| `atlas_level_up` | `atlas.hint.levelUp` | "New chip compiled." | Proud. | 1.4 s |
| `atlas_objective_done` | `atlas.hint.done` | "Done. Call the drone when ready." | Relaxed. | 2.0 s |
| `atlas_under_level` | `atlas.hint.underLevel` | "They'll outclass you. Train first." | An honest warning. | 1.8 s |
| `atlas_sector_floor` | `atlas.hint.floor` | "{sector} runs level {n} and up." | A briefing. *Record per sector.* | 2.0 s |
| `atlas_system_down` | `atlas.warn.down` | "Rebooting… Pip's got you." | Reassuring. | 1.8 s |
| `atlas_switch` | `atlas.hint.switch` | "Switch. Try it." | *Reserved until the level kit has levers.* | 1.0 s |
| `atlas_neon_blackout` | `atlas.hint.neon.blackout` | "Power's failing! Cross when the lights come back." | Calm warning as the lights dip; the second half is the instruction. **Live** (Blackout Boulevard, #110). | 2.6 s |
| `atlas_drill_board` | `atlas.hint.drill.board` | "Ore cart's rolling! I steer, you shoot the moles." | Cheerful, a little proud to drive. **Live** (Deep Mine cart, #111), like `atlas.hint.volt.board`. | 2.8 s |
| `atlas_drill_dip` | `atlas.hint.drill.dip` | "Steep drop! Hold on tight!" | A rollercoaster grin, quick. **Live.** | 1.6 s |
| `atlas_drill_arrive` | `atlas.hint.drill.arrive` | "Last stop. Out you hop!" | Light, a conductor's sign-off. **Live.** | 1.6 s |

These four ride the Atlas chain with the standard dynamics row, like the
other stage hints (`atlas.hint.cryo.*`, `atlas.hint.volt.*`), and still
need adding to `voiceCatalog.ts`.

### Atlas: machine scans (first sighting)

| VO id | Key | Line | Max |
| --- | --- | --- | --- |
| `atlas_scan_hardhat` | `atlas.scan.hardhat` | "Hardhat. Shoot when it peeks." | 1.8 s |
| `atlas_scan_trooper` | `atlas.scan.trooper` | "Shield. Charge through it." | 1.6 s |
| `atlas_scan_heli` | `atlas.scan.heli` | "Rotor Drone. Look up." | 1.4 s |
| `atlas_scan_hopper` | `atlas.scan.hopper` | "Stomper. Move off the ring." | 1.6 s |
| `atlas_scan_roller` | `atlas.scan.roller` | "Gear Roller. Sidestep it." | 1.6 s |
| `atlas_scan_brute` | `atlas.scan.brute` | "Guardroid. Parry, then punish." | 1.8 s |
| `atlas_scan_turret` | `atlas.scan.turret` | "Wall Cannon. Keep moving." | 1.6 s |
| `atlas_scan_golem` | `atlas.scan.golem` | "That crate's breathing. Get close." | 2.0 s |
| `atlas_scan_polar` | `atlas.scan.polar` | "Polar Pup. Shoot it when it opens red." | 1.8 s |
| `atlas_scan_mole` | `atlas.scan.mole` | "Mole Driller. Keep moving, hit it when it pops up." | 1.8 s |
| `atlas_scan_puffer` | `atlas.scan.puffer` | "Puffer Mine. Pop it before it swells." | 1.6 s |
| `atlas_scan_stalker` | `atlas.scan.stalker` | "Glow Stalker. Watch for its eyes, parry the lunge." | 1.8 s |
| `atlas_scan_hornet` | `atlas.scan.hornet` | "Hornet Rotor. It dives straight: sidestep!" | 1.6 s |
| `atlas_scan_elite` | `atlas.scan.elite` | "Gold ring. Elite. Careful." | 1.6 s |
| `atlas_scan_fire` / `_ice` / `_volt` / `_wind` | `atlas.scan.fire` … | "Fire-coated. It shrugs off fire." (and the same for each element) | 2.0 s |

### Flux: damage barks

Record 3 takes each. Each file is `flux_<type>_<n>.mp3` (e.g.
`flux_light_1.mp3`), and the keys are `flux.hurt.<type>.<n>`. The synth
tail is added in post.

| Type | Takes to record | Synth tail | Max |
| --- | --- | --- | --- |
| `light` | "Oof!" · "Ow!" · "Hey!" | a short tick | 0.4 s |
| `heavy` | "KLONK!" · "Arrgh!" · "Whoa-oa!" | a metal clang | 0.6 s |
| `fire` | "Yeowch!" · "Hot-hot-hot!" | a sizzle | 0.6 s |
| `ice` | "Brrr-zzt!" · "Ch-chilly!" | a crystal tinkle | 0.6 s |
| `volt` | "Bzzzt!" · "Zzap!" | a static crackle | 0.5 s |
| `wind` | "Whoa-oa-oa!" | a whoosh | 0.7 s |
| `trap` | "Yikes!" · "Not cool!" | none | 0.5 s |
| `crusher` | "Squonk!" | a squeaky-toy squash | 0.5 s |
| `pit` | "Wha— aaaa!" | a Doppler fall | 1.0 s |
| `lowHp` | "Nnngh!" | a low servo whine | 0.6 s |
| `down` | "Uh-oh…" | a power-down sweep | 0.9 s |
| `parry` | "Ha!" | a bright ping | 0.3 s |
| `gel` | "Aaah~" | a rising refill shimmer | 0.7 s |

**Direction for all barks:** comedy first. Think of a cartoon robot getting
bonked, never a real injury. Keep the energy up even on "Uh-oh…", which
should sound like "oops, I'll be back", not dying.

---

## Recording checklist

- [x] Decide the VO locale policy (open decision 1): (a), every other
      locale hears English with its own subtitles.
- [ ] Decide on Gauss's line (open decision 2).
- [ ] Cast 3 voices (Atlas, Vex, Flux), plus Gauss if yes. Flux's barks can
      be one short session.
- [ ] Record clean, dry reads, at least 3 takes each, and keep the raw
      files. Glitch and robot processing are done in post, so they can be
      re-tuned.
- [ ] Build one processing preset per character, so a line recorded later
      matches. The `audacity-chain` blocks above are those presets; the voice
      skill runs them (Post-production).
- [ ] Make the Flux tails (`vo-src/tails/`) and confirm the effect
      parameter names against `GetInfo: Type=Commands` for the Audacity
      version in use.
- [x] Deliver to `public/audio/voice/<lang>/<key with dots as
      underscores>.ogg` (open decision 3; `pnpm voice:gen` does it).
- [ ] Check the durations against the "Max" column. Bubbles and subtitles
      hold for the line's length, and never less than 1.8 s.
