/**
 * ─── The voice catalog: every voice-over line, in one place ──────────────────
 *
 * The TEXT decides what gets a voice. Every text line in a speaker's section
 * of the locales (`SPEECH`: `atlas.*`, `vex.*`, `pip.*`, `flux.*`, a
 * speaker's lines in `story.*` and `ending.*`) is a voice line by itself:
 * `deriveVoiceLines(en)` lists them all, so a line added to the game can never
 * be missed by the voice work again (the lesson rooms, eleven stage hints and
 * Flux's fumble lines once were, for months). `VOICE_DETAIL` below only adds
 * what a line needs beyond its section's defaults (when it plays, how to read
 * it, how long it may run) and declares the lines with no text (grunts,
 * laughs) and the planned ones. The full list is `VOICE_LINES` in
 * `voiceLines.ts` (the game, the tests) and in `tools/voice/lib.mjs`.
 * Everything else is generated from it:
 *
 *   pnpm voice:report   status per language (done / recorded / to record) in
 *                       the console, and the recording scripts
 *                       src/assets/voice-lines-list_en.pdf / _de.pdf
 *   pnpm voice:script   voice-todo.md: every line with its state (voiced by
 *                       which engine, or missing); a test fails when it is
 *                       stale, and every voice run rewrites it
 *
 * A line's file name is its key with the dots as underscores (`fileName`):
 * `atlas.bossAhead` ships as `public/audio/voice/<lang>/atlas_bossAhead.ogg`
 * (`audio/voice.ts` plays it). Raw takes from the speaker go to
 * `vo-src/raw/<lang>/<speaker>/atlas_bossAhead_<take>.ogg`. How each voice is
 * processed lives in `story-voice-over.md` (the Audacity chains). Keys never
 * hold an underscore (a test checks), so a file name maps back to one key.
 *
 * Two kinds of line:
 * - `live`: in the game now. Its text is the locale's (`en.ts` / `de.ts`,
 *   same key), so a line changed there changes here.
 * - `planned`: from `story-voice-over.md`, not spoken in the game yet. Its
 *   text is the draft below (English, and a German draft to be reviewed);
 *   a planned line whose key is already in the locales (the ending's
 *   captions, shown but not voiced) has no draft and reads the locale.
 *   Wiring a line in makes it live (`ship` for a planned one).
 *
 * `{name}` in a draft is filled from `params` (i18n keys: weapon, boss and
 * sector names), so a variant reads with the name as the game spells it;
 * `{NAME}` in capitals fills it in capitals (Vex shouting a boss's name).
 *
 * Pure data and pure functions, no runtime imports: `tools/` read it with
 * Node's type stripping and hand `deriveVoiceLines` the locale they load.
 */

export type Speaker = 'atlas' | 'vex' | 'flux' | 'gauss' | 'pip'
export type Lang = 'en' | 'de'
/** [English, German]. */
export type Both = readonly [string, string]

export interface VoiceLine {
  /** The i18n key, and the file name: `<key>.ogg`. */
  key: string
  speaker: Speaker
  /** Where in the game (see SCENES), for grouping. */
  scene: SceneId
  status: 'live' | 'planned'
  /** When it plays. */
  when: Both
  /** How to read it. */
  direction: Both
  /** The longest the delivered line may run (s). */
  max: number
  /** Planned lines: the draft text. Live lines read the locale. */
  draft?: Both
  /** `{name}` → i18n key of the value. */
  params?: Readonly<Record<string, string>>
  /** Recorded once, in English, for every language (barks, laughs). */
  neutral?: boolean
  /** A sound more than words ("Hoppla-hopp!", "Bzzt! Ups!"): QA only fails a
   *  take that adds speech, since a read-back cannot spell an interjection. */
  loose?: boolean
  /** The delivery knob (voiceCards' TONES has the detailed lines' tones;
   *  a derived line takes its section's). */
  tone?: string
}

export interface SpeakerInfo {
  name: string
  role: Both
  voice: Both
  avoid?: Both
}

export const SPEAKERS: Readonly<Record<Speaker, SpeakerInfo>> = {
  atlas: {
    name: 'Atlas',
    role: ['Flux\'s field AI', 'Fluxs Feld-KI'],
    voice: [
      'Gender-neutral to slightly low; calm, precise, warm underneath. A mission-control navigator who is also your friend. Dry humour by understatement. Never shouts: at critical moments it gets tighter and faster, not louder.',
      'Geschlechtsneutral bis leicht tief; ruhig, präzise, darunter warm. Ein Navigator aus der Missionskontrolle, der zugleich dein Freund ist. Trockener Humor durch Untertreibung. Schreit nie: in kritischen Momenten wird die Stimme knapper und schneller, nicht lauter.'
    ]
  },
  vex: {
    name: 'Dr. Vex',
    role: ['The showman doctor, the villain', 'Der Showman-Doktor, der Schurke'],
    voice: [
      'Big, theatrical, pompous: a game-show host crossed with a vain surgeon. Relishes the words and stretches the big ones ("Maaag-nificent"). Over the top but never scary: the audience is all ages.',
      'Groß, theatralisch, aufgeblasen: ein Showmaster gekreuzt mit einem eitlen Chirurgen. Genießt jedes Wort und dehnt die großen ("Grooo-ßartig"). Völlig übertrieben, aber nie gruselig: das Publikum ist jedes Alters.'
    ],
    avoid: [
      'Imitating any specific film villain\'s voice or catchphrases: the archetype, not an impression.',
      'Die Stimme oder Sprüche eines bestimmten Filmschurken nachzumachen: der Archetyp, keine Imitation.'
    ]
  },
  flux: {
    name: 'Flux',
    role: ['The hero: barks only', 'Der Held: nur Ausrufe'],
    voice: [
      'Youthful, bright, bouncy. A plucky little robot, never pained or gory: every yelp should be funny. Cartoon timing.',
      'Jung, hell, federnd. Ein mutiger kleiner Roboter, nie leidend: jeder Aufschrei soll lustig sein. Cartoon-Timing.'
    ]
  },
  gauss: {
    name: 'Prof. Gauss',
    role: ['The inventor (the ending)', 'Die Erfinderin (das Ende)'],
    voice: [
      'Elderly, gentle, clever and a little amused. A grandmother who built half the city.',
      'Älter, sanft, klug und ein wenig amüsiert. Eine Großmutter, die die halbe Stadt gebaut hat.'
    ]
  },
  pip: {
    name: 'Pip',
    role: ['The lab\'s helper bot: the debriefs', 'Der Helfer-Bot des Labors: die Nachbesprechungen'],
    voice: [
      'A light, clear, brisk tenor with a smile in it. A cheerful young lab technician pointing at a map: short plain sentences, eager, proud of every relay. Never a soldier, never a child.',
      'Ein heller, klarer, zügiger Tenor mit einem Lächeln. Ein fröhlicher junger Labortechniker, der auf eine Karte zeigt: kurze, einfache Sätze, eifrig, stolz auf jedes Relais. Nie ein Soldat, nie ein Kind.'
    ]
  }
}

export type SceneId =
  | 'intro' | 'mission' | 'missionStory' | 'missionWarn' | 'missionIdle'
  | 'prologue' | 'act1' | 'midpoint' | 'act2' | 'shift' | 'act3' | 'ending'
  | 'fieldWarn' | 'scan' | 'barks' | 'laughs' | 'debrief'

/** In playing order. */
export const SCENES: ReadonlyArray<{ id: SceneId; title: Both }> = [
  { id: 'intro', title: ['Intro cutscene', 'Intro-Zwischensequenz'] },
  { id: 'mission', title: ['Every mission', 'Jede Mission'] },
  { id: 'missionStory', title: ['Story mission starts', 'Start der Story-Missionen'] },
  { id: 'missionWarn', title: ['In-mission warnings', 'Warnungen in der Mission'] },
  { id: 'missionIdle', title: ['Small talk', 'Smalltalk'] },
  { id: 'prologue', title: ['Prologue: Scrapyard', 'Prolog: Schrottplatz'] },
  { id: 'act1', title: ['Act I: Heat and Ice', 'Akt I: Hitze und Eis'] },
  { id: 'midpoint', title: ['Midpoint: the Blueprint', 'Wendepunkt: der Bauplan'] },
  { id: 'act2', title: ['Act II: Storm Front', 'Akt II: Sturmfront'] },
  { id: 'shift', title: ['Act IIb: The Second Shift', 'Akt IIb: Die zweite Schicht'] },
  { id: 'act3', title: ['Act III: The Fortress', 'Akt III: Die Festung'] },
  { id: 'ending', title: ['Ending', 'Ende'] },
  { id: 'fieldWarn', title: ['Field warnings and hints', 'Feldwarnungen und Hinweise'] },
  { id: 'scan', title: ['Machine scans (first sighting)', 'Maschinen-Scans (erste Sichtung)'] },
  { id: 'barks', title: ['Damage barks', 'Schadens-Ausrufe'] },
  { id: 'laughs', title: ['Laughs', 'Lacher'] },
  { id: 'debrief', title: ['Debriefs between missions', 'Nachbesprechungen zwischen den Missionen'] }
]

type Opts = Omit<VoiceLine, 'key' | 'speaker' | 'scene' | 'status' | 'max'> & { max?: number }

const live = (key: string, speaker: Speaker, scene: SceneId, o: Opts): VoiceLine =>
  ({ key, speaker, scene, status: 'live', max: 3, ...o })
const plan = (key: string, speaker: Speaker, scene: SceneId, max: number, o: Opts): VoiceLine =>
  ({ key, speaker, scene, status: 'planned', ...o, max: o.max ?? max })
/** A planned line that reached the game: live, its text the locale's (the
 *  draft it was written from is dropped, so the two cannot drift). */
const ship = (key: string, speaker: Speaker, scene: SceneId, max: number, { draft: _draft, ...o }: Opts): VoiceLine =>
  ({ key, speaker, scene, status: 'live', ...o, max: o.max ?? max })

const WEAPONS = ['scrapBurst', 'flameWave', 'iceLance', 'thunderArc', 'galeGuard', 'magnetPull', 'drillBomb', 'bubbleLance', 'neonBlade', 'droneSwarm'] as const
/** Each Master's weakness (checked against `data/bosses.ts` by a test). */
export const WEAK_TO: ReadonlyArray<readonly [boss: string, weapon: string]> = [
  ['blazeMaster', 'galeGuard'], ['frostMaster', 'flameWave'], ['voltMaster', 'iceLance'], ['galeMaster', 'thunderArc'], ['magnetMaster', 'droneSwarm'], ['drillMaster', 'magnetPull'], ['tideMaster', 'drillBomb'], ['neonMaster', 'bubbleLance'], ['rotorMaster', 'neonBlade']
]
/** Each sector's floor level after the first (checked against `data/regions.ts`). */
export const SECTOR_FLOOR: ReadonlyArray<readonly [sector: string, level: number]> = [
  ['blaze', 3], ['cryo', 6], ['volt', 9], ['gale', 13], ['magnet', 16], ['drill', 19], ['tide', 22], ['neon', 25], ['rotor', 28], ['fortress', 31]
]

// ── Atlas: in the game now ──
const ATLAS_LIVE: VoiceLine[] = [
  live('story.atlas.logStart', 'atlas', 'intro', {
    when: ['Intro: the cold open freezes and rewinds; Atlas starts its log', 'Intro: der Kaltstart friert ein und spult zurück; Atlas startet sein Protokoll'],
    direction: ['Flat, clinical. It starts the rewind.', 'Flach, klinisch. Damit beginnt der Rücklauf.'], max: 1
  }),
  live('story.atlas.goodMorning', 'atlas', 'intro', {
    when: ['Intro: Flux wakes up; the first words of the game', 'Intro: Flux erwacht; die ersten Worte des Spiels'],
    direction: ['Soft: the first words he ever hears. Warm on "Flux".', 'Sanft: die ersten Worte, die er je hört. Warm auf "Flux".'], max: 2.2
  }),
  live('story.atlas.scrapyardFirst', 'atlas', 'intro', {
    when: ['Intro, the hologram: the Scrapyard relay blinks', 'Intro, das Hologramm: das Schrottplatz-Relais blinkt'],
    direction: ['Matter-of-fact. The whole mission in one breath.', 'Sachlich. Die ganze Mission in einem Atemzug.'], max: 2.2
  }),
  live('atlas.landed', 'atlas', 'mission', {
    when: ['Every mission: Flux lands on the pad', 'Jede Mission: Flux landet auf der Plattform'],
    direction: ['Upbeat, a quick kick-off.', 'Munter, ein schneller Startschuss.']
  }),
  live('atlas.brief.tutorial', 'atlas', 'mission', {
    when: ['The tutorial starts', 'Das Tutorial beginnt'],
    direction: ['Encouraging, a friendly coach.', 'Ermutigend, ein freundlicher Coach.']
  }),
  live('atlas.brief.job', 'atlas', 'mission', {
    when: ['A job mission starts', 'Ein Job beginnt'],
    direction: ['Brisk and casual.', 'Zügig und locker.']
  }),
  live('atlas.brief.climb', 'atlas', 'mission', {
    when: ['A Tower Run starts', 'Ein Turmlauf beginnt'],
    direction: ['Excited, rising on each "up".', 'Aufgeregt, jedes "hoch" steigt an.']
  }),
  live('atlas.brief.story', 'atlas', 'mission', {
    when: ['A story mission starts (fallback line)', 'Eine Story-Mission beginnt (Ersatzzeile)'],
    direction: ['Determined, a small rally.', 'Entschlossen, ein kleiner Aufruf.']
  }),
  ...(['scrapyard', 'blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const).map(s => live(`atlas.story.${s}`, 'atlas', 'missionStory', {
    when: [`Story mission start: {sector}`, `Start der Story-Mission: {sector}`],
    params: { sector: `sector.${s}` },
    direction: s === 'fortress'
      ? ['Quiet resolve. This is the end of it.', 'Ruhige Entschlossenheit. Jetzt wird es beendet.']
      : s === 'volt'
        ? ['Playful unease: the tower is already getting to it.', 'Verspieltes Unbehagen: der Turm macht sich schon bemerkbar.']
        : ['A briefing with a grin.', 'Eine Einweisung mit einem Grinsen.']
  })),
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map(n => live(`atlas.arc.${n}`, 'atlas', 'missionStory', {
    when: [`Story mission start, ${n} of 10 Masters freed`, `Start einer Story-Mission, ${n} von 10 Meistern befreit`],
    direction: n === 10
      ? ['Steady and ready: the last door is open.', 'Ruhig und bereit: die letzte Tür ist offen.']
      : ['The score so far, with a hint of pride.', 'Der Zwischenstand, mit einem Hauch Stolz.']
  })),
  live('atlas.bossAhead', 'atlas', 'missionWarn', {
    when: ['The boss door comes into view', 'Die Boss-Tür kommt in Sicht'],
    direction: ['Alert, then a calming breath.', 'Wachsam, dann ein beruhigender Atemzug.']
  }),
  // Right after `bossAhead`: the weapon this Master is weak to, when Flux
  // carries it; a Master without a weakness (the Scrapper, Vex) gets
  // `noWeak`. One line per weapon, so each can have its own recording.
  ...WEAK_TO.map(([b, w]) => live(`atlas.weak.${w}`, 'atlas', 'missionWarn', {
    when: [`The boss door comes into view, Flux carries its weakness (${b})`, `Die Boss-Tür kommt in Sicht, Flux trägt seine Schwäche (${b})`],
    direction: ['Tactical, a quick tip with a grin.', 'Taktisch, ein schneller Tipp mit einem Grinsen.']
  })),
  live('atlas.noWeak', 'atlas', 'missionWarn', {
    when: ['The boss door of a Master without a weakness (the Scrapper, Vex)', 'Die Boss-Tür eines Meisters ohne Schwäche (Schrotter, Vex)'],
    direction: ['Focused.', 'Konzentriert.']
  }),
  live('atlas.bossDown', 'atlas', 'missionWarn', {
    when: ['A Core Master is beaten (freed)', 'Ein Kernmeister ist besiegt (befreit)'],
    direction: ['Relieved and proud.', 'Erleichtert und stolz.']
  }),
  live('atlas.vexDown', 'atlas', 'missionWarn', {
    when: ['Vex\'s Mk-I is beaten', 'Vex\' Mk-I ist besiegt'],
    direction: ['Triumph, still not shouting.', 'Triumph, trotzdem nicht geschrien.']
  }),
  live('atlas.guardDown', 'atlas', 'missionWarn', {
    when: ['A Fortress guard hall is cleared (its door opens)', 'Eine Wachhalle der Festung ist frei (ihre Tür öffnet sich)'],
    direction: ['A quick breath, then onward.', 'Kurz durchatmen, dann weiter.']
  }),
  live('atlas.lowHp', 'atlas', 'missionWarn', {
    when: ['Health under 30 %, no Repair Gel left', 'Gesundheit unter 30 %, kein Reparaturgel mehr'],
    direction: ['Worried, quick, not loud.', 'Besorgt, schnell, nicht laut.']
  }),
  live('atlas.lowHpGel', 'atlas', 'missionWarn', {
    when: ['Health under 30 %, a Repair Gel in the pack', 'Gesundheit unter 30 %, ein Reparaturgel im Gepäck'],
    direction: ['A clear instruction.', 'Eine klare Anweisung.']
  }),
  live('atlas.lowWe', 'atlas', 'missionWarn', {
    when: ['Special weapon energy under 20 %', 'Spezialwaffen-Energie unter 20 %'],
    direction: ['A practical heads-up.', 'Ein sachlicher Hinweis.']
  }),
  live('atlas.trap', 'atlas', 'missionWarn', {
    when: ['A corridor trap ahead (flame jet, blade)', 'Eine Falle im Gang voraus (Flammendüse, Klinge)'],
    direction: ['Coaching.', 'Wie ein Trainer.']
  }),
  live('atlas.plate', 'atlas', 'missionWarn', {
    when: ['A pressure plate ahead', 'Eine Druckplatte voraus'],
    direction: ['Playful, almost whispered on the last word.', 'Verspielt, das letzte Wort fast geflüstert.']
  }),
  live('atlas.exit', 'atlas', 'missionWarn', {
    when: ['The exit drone arrives', 'Die Abholdrohne kommt an'],
    direction: ['Cheerful.', 'Fröhlich.']
  }),
  live('atlas.levelUp', 'atlas', 'missionWarn', {
    when: ['Flux levels up mid-mission', 'Flux steigt in der Mission eine Stufe auf'],
    direction: ['Proud.', 'Stolz.']
  }),
  ...([1, 2, 3, 4] as const).map(n => live(`atlas.idle.${n}`, 'atlas', 'missionIdle', {
    when: ['Small talk in a quiet stretch', 'Smalltalk in einer ruhigen Phase'],
    direction: ['Warm, unhurried.', 'Warm, ohne Eile.']
  }))
]

// ── Atlas: planned (story-voice-over.md) ──
const ATLAS_PLAN: VoiceLine[] = [
  ship('atlas.boss.signalFirst', 'atlas', 'prologue', 2.2, {
    when: ['Scrapyard: the first Core Master signal', 'Schrottplatz: das erste Kernmeister-Signal'],
    draft: ['Core Master signal. It\'s… big.', 'Kernmeister-Signal. Er ist… groß.'],
    direction: ['Deadpan understatement, a pause before "big".', 'Trockene Untertreibung, Pause vor "groß".']
  }),
  ship('atlas.story.relayOne', 'atlas', 'prologue', 2, {
    when: ['The first relay is lit', 'Das erste Relais leuchtet'],
    draft: ['Relay one lit. Nine to go.', 'Relais eins leuchtet. Noch neun.'],
    direction: ['The first small win. A hint of a smile.', 'Der erste kleine Sieg. Ein Hauch von Lächeln.']
  }),
  ship('atlas.sector.blaze', 'atlas', 'act1', 2.4, {
    when: ['Beam-in: Blaze Refinery', 'Ankunft: Glutraffinerie'],
    draft: ['Refinery. It runs hot. Mind the vents.', 'Raffinerie. Hier wird\'s heiß. Achte auf die Düsen.'],
    direction: ['Brisk briefing.', 'Zügige Einweisung.']
  }),
  ...WEAPONS.map(w => ship(`atlas.story.copied.${w}`, 'atlas', 'act1', 1.6, {
    when: ['A Master is freed: its weapon is copied', 'Ein Meister ist befreit: seine Waffe wird kopiert'],
    draft: ['{weapon} copied.', '{weapon} kopiert.'], params: { weapon: `weapon.${w}.name` },
    direction: ['Crisp.', 'Knackig.']
  })),
  ship('atlas.sector.cryo', 'atlas', 'act1', 2.4, {
    when: ['Beam-in: Cryo Plant', 'Ankunft: Kryowerk'],
    draft: ['Coolant\'s flowing uphill. To the Fortress.', 'Das Kühlmittel fließt bergauf. Zur Festung.'],
    direction: ['Noticing something; suspicious.', 'Bemerkt etwas; misstrauisch.']
  }),
  ship('atlas.story.dataCore', 'atlas', 'act1', 1.6, {
    when: ['The Frost Master leaves a data core behind', 'Der Frostmeister hinterlässt einen Datenkern'],
    draft: ['It left us something.', 'Er hat uns etwas dagelassen.'],
    direction: ['Curious, quiet.', 'Neugierig, leise.']
  }),
  ship('atlas.story.firstDraft', 'atlas', 'midpoint', 2.6, {
    when: ['The blueprint: Atlas recognises its own code', 'Der Bauplan: Atlas erkennt seinen eigenen Code'],
    draft: ['…I was written from its first draft.', '…Ich wurde aus seinem ersten Entwurf geschrieben.'],
    direction: ['The quietest line in the game. Unsettled.', 'Die leiseste Zeile des Spiels. Verunsichert.']
  }),
  ship('atlas.story.body', 'atlas', 'midpoint', 2.6, {
    when: ['The blueprint: what Vex is building', 'Der Bauplan: was Vex baut'],
    draft: ['It\'s building a body. Out of our valley.', 'Er baut sich einen Körper. Aus unserem Tal.'],
    direction: ['Recovering; resolve coming back.', 'Fängt sich; die Entschlossenheit kehrt zurück.']
  }),
  ship('atlas.volt.hack', 'atlas', 'act2', 2, {
    when: ['Volt Tower: Vex hacks Atlas mid-sentence', 'Voltturm: Vex hackt Atlas mitten im Satz'],
    draft: ['Flux… something\'s in the—', 'Flux… da ist etwas in mei—'],
    direction: ['Cut off mid-word, clean. The glitch is added in post.', 'Mitten im Wort abbrechen, sauber. Der Glitch kommt in der Nachbearbeitung.']
  }),
  ship('atlas.volt.thanks', 'atlas', 'act2', 2.4, {
    when: ['Volt Tower: the hack fails', 'Voltturm: der Hack scheitert'],
    draft: ['…You kept it out. Thank you.', '…Du hast es draußen gehalten. Danke.'],
    direction: ['Shaken, then sincere. Their bond line.', 'Erschüttert, dann aufrichtig. Die Zeile ihrer Freundschaft.']
  }),
  ship('atlas.story.voltFreed', 'atlas', 'act2', 2.2, {
    when: ['The Volt Master is freed', 'Der Voltmeister ist befreit'],
    draft: ['The signal\'s lost its power station.', 'Das Signal hat sein Kraftwerk verloren.'],
    direction: ['Satisfied.', 'Zufrieden.']
  }),
  ship('atlas.sector.gale', 'atlas', 'act2', 2.4, {
    when: ['Beam-in: Sky Docks', 'Ankunft: Himmelsdocks'],
    draft: ['Every part for its body goes through here.', 'Jedes Teil für seinen Körper kommt hier durch.'],
    direction: ['A briefing with purpose.', 'Eine Einweisung mit Ziel.']
  }),
  ship('atlas.story.galeFreed', 'atlas', 'act2', 2.2, {
    when: ['The Gale Master is freed', 'Der Sturmmeister ist befreit'],
    draft: ['No more parts reach the Fortress.', 'Keine Teile erreichen mehr die Festung.'],
    direction: ['Quiet triumph.', 'Leiser Triumph.']
  }),
  ship('atlas.story.breach', 'atlas', 'shift', 2.2, {
    when: ['The Fortress shield falls', 'Der Schild der Festung fällt'],
    draft: ['Shield\'s down. The Fortress is open.', 'Der Schild ist unten. Die Festung ist offen.'],
    direction: ['Steady: this is it.', 'Ruhig: jetzt gilt es.']
  }),
  ship('atlas.fortress.bays', 'atlas', 'act3', 1.8, {
    when: ['Fortress: the half-built assembly bays', 'Festung: die halb gebauten Montagehallen'],
    draft: ['Half-built. You did that.', 'Halb gebaut. Das warst du.'],
    direction: ['Proud, understated.', 'Stolz, zurückhaltend.']
  }),
  ship('atlas.mk1.intro', 'atlas', 'act3', 1.8, {
    when: ['Mk-I intro: Vex steps into his body', 'Mk-I-Auftritt: Vex steigt in seinen Körper'],
    draft: ['That\'s Vex. The real one.', 'Das ist Vex. Der echte.'],
    direction: ['Low and focused.', 'Tief und konzentriert.']
  }),
  ...([['fire', 'Fire!', 'Feuer!'], ['ice', 'Ice!', 'Eis!'], ['volt', 'Volt!', 'Volt!'], ['wind', 'Wind!', 'Wind!'], ['scrap', 'Scrap!', 'Schrott!']] as const)
    .map(([id, en, de]) => ship(`atlas.mk1.${id}`, 'atlas', 'act3', 0.6, {
      when: ['Mk-I fight: calling the element of its next attack', 'Mk-I-Kampf: ruft das Element des nächsten Angriffs'],
      draft: [en, de], direction: ['A sharp call-out, on the beat.', 'Ein scharfer Zuruf, auf den Punkt.']
    })),
  ship('atlas.mk1.free', 'atlas', 'act3', 1.8, {
    when: ['Mk-I phase 2: answering Vex ("Why won\'t they listen?")', 'Mk-I Phase 2: Antwort an Vex ("Warum hören sie nicht?")'],
    draft: ['Because they\'re free.', 'Weil sie frei sind.'],
    direction: ['Calm, almost gentle. The thesis of the game.', 'Ruhig, fast sanft. Die Kernaussage des Spiels.']
  }),
  // Field warnings and hints
  ship('atlas.warn.boss', 'atlas', 'fieldWarn', 1.4, {
    when: ['A Core Master ahead', 'Ein Kernmeister voraus'], draft: ['Core Master ahead.', 'Kernmeister voraus.'],
    direction: ['Alert.', 'Wachsam.']
  }),
  ship('atlas.warn.gelFirst', 'atlas', 'fieldWarn', 2, {
    when: ['Low health the first time, a gel in the pack', 'Zum ersten Mal wenig Gesundheit, ein Gel im Gepäck'],
    draft: ['Plating\'s cracking. Use a gel.', 'Die Panzerung bricht. Nimm ein Gel.'],
    direction: ['Concerned; a clear instruction.', 'Besorgt; eine klare Anweisung.']
  }),
  ship('atlas.warn.gel', 'atlas', 'fieldWarn', 0.6, {
    when: ['Low health again, a gel in the pack', 'Wieder wenig Gesundheit, ein Gel im Gepäck'],
    draft: ['Gel.', 'Gel.'], direction: ['A quick nudge.', 'Ein kurzer Stups.']
  }),
  ship('atlas.warn.criticalFirst', 'atlas', 'fieldWarn', 1.2, {
    when: ['Critical health, the first time', 'Kritische Gesundheit, zum ersten Mal'],
    draft: ['Critical! Back off!', 'Kritisch! Zieh dich zurück!'],
    direction: ['Tight and fast, NOT loud.', 'Knapp und schnell, NICHT laut.']
  }),
  ship('atlas.warn.critical', 'atlas', 'fieldWarn', 0.7, {
    when: ['Critical health again', 'Wieder kritische Gesundheit'], draft: ['Critical!', 'Kritisch!'],
    direction: ['Tight.', 'Knapp.']
  }),
  ship('atlas.warn.noGel', 'atlas', 'fieldWarn', 1.8, {
    when: ['Low health, no gel left', 'Wenig Gesundheit, kein Gel mehr'],
    draft: ['No gel left. Play it safe.', 'Kein Gel mehr. Geh auf Nummer sicher.'],
    direction: ['Worried and calm.', 'Besorgt und ruhig.']
  }),
  ship('atlas.warn.weLow', 'atlas', 'fieldWarn', 2, {
    when: ['Weapon energy low', 'Waffenenergie niedrig'],
    draft: ['Weapon energy low. Buster\'s free.', 'Waffenenergie niedrig. Der Buster kostet nichts.'],
    direction: ['Practical.', 'Praktisch.']
  }),
  ship('atlas.warn.weEmpty', 'atlas', 'fieldWarn', 0.9, {
    when: ['Weapon energy empty', 'Waffenenergie leer'], draft: ['Tank\'s dry.', 'Tank ist leer.'],
    direction: ['Dry (pun intended).', 'Trocken (Wortspiel beabsichtigt).']
  }),
  ...WEAPONS.map(w => ship(`atlas.warn.borrowedLast.${w}`, 'atlas', 'fieldWarn', 1.6, {
    when: ['A borrowed weapon\'s last shot', 'Der letzte Schuss einer geliehenen Waffe'],
    draft: ['Last shot of {weapon}.', 'Letzter Schuss {weapon}.'], params: { weapon: `weapon.${w}.name` },
    direction: ['A heads-up.', 'Ein Hinweis.']
  })),
  ship('atlas.warn.flame', 'atlas', 'fieldWarn', 2.2, {
    when: ['A flame-jet trap ahead', 'Eine Flammendüsen-Falle voraus'],
    draft: ['Vents. Wait for it… or slide.', 'Düsen. Warte ab… oder rutsch durch.'],
    direction: ['Coaching, a pause on "wait for it".', 'Wie ein Trainer, Pause bei "warte ab".']
  }),
  ship('atlas.warn.blade', 'atlas', 'fieldWarn', 1.8, {
    when: ['A blade trap ahead', 'Eine Klingenfalle voraus'],
    draft: ['Blade. Go right after it.', 'Klinge. Lauf direkt hinter ihr durch.'], direction: ['Coaching.', 'Wie ein Trainer.']
  }),
  ship('atlas.warn.crusher', 'atlas', 'fieldWarn', 1.6, {
    when: ['A crusher ahead', 'Eine Presse voraus'],
    draft: ['Crusher. Watch the lamp.', 'Presse. Achte auf die Lampe.'], direction: ['Coaching.', 'Wie ein Trainer.']
  }),
  ship('atlas.warn.ladder', 'atlas', 'fieldWarn', 1.8, {
    when: ['The first ladder', 'Die erste Leiter'],
    draft: ['Ladder. Push toward the wall.', 'Leiter. Drück dich zur Wand.'], direction: ['Coaching.', 'Wie ein Trainer.']
  }),
  ship('atlas.warn.pit', 'atlas', 'fieldWarn', 1.6, {
    when: ['A pit with a lift', 'Ein Abgrund mit Aufzug'],
    draft: ['Long drop. Time the lift.', 'Tiefer Fall. Pass den Aufzug ab.'], direction: ['Coaching.', 'Wie ein Trainer.']
  }),
  ship('atlas.hint.locator', 'atlas', 'fieldWarn', 1.4, {
    when: ['The objective locator appears', 'Der Zielanzeiger erscheint'],
    draft: ['Objective\'s that way.', 'Das Ziel liegt da lang.'], direction: ['Casual.', 'Beiläufig.']
  }),
  ship('atlas.hint.rescue', 'atlas', 'fieldWarn', 2, {
    when: ['A worker-bot to rescue is near', 'Ein Arbeiterbot zum Retten ist in der Nähe'],
    draft: ['Worker-bot signal. Faint. Close.', 'Arbeiterbot-Signal. Schwach. Ganz nah.'], direction: ['Hopeful.', 'Hoffnungsvoll.']
  }),
  ship('atlas.hint.upgrade', 'atlas', 'fieldWarn', 1.2, {
    when: ['Loot better than what Flux wears', 'Beute, besser als Fluxs Ausrüstung'],
    draft: ['That\'s an upgrade.', 'Das ist ein Upgrade.'], direction: ['Pleased.', 'Erfreut.']
  }),
  ship('atlas.hint.levelUp', 'atlas', 'fieldWarn', 1.4, {
    when: ['A level-up', 'Ein Stufenaufstieg'], draft: ['New chip compiled.', 'Neuer Chip kompiliert.'],
    direction: ['Proud.', 'Stolz.']
  }),
  ship('atlas.hint.done', 'atlas', 'fieldWarn', 2, {
    when: ['The objective is done', 'Das Ziel ist erledigt'],
    draft: ['Done. Call the drone when ready.', 'Erledigt. Ruf die Drohne, wenn du so weit bist.'], direction: ['Relaxed.', 'Entspannt.']
  }),
  ship('atlas.hint.underLevel', 'atlas', 'fieldWarn', 1.8, {
    when: ['Flux is under the sector\'s floor level', 'Flux liegt unter der Mindeststufe des Sektors'],
    draft: ['They\'ll outclass you. Train first.', 'Die sind dir überlegen. Trainier erst.'], direction: ['An honest warning.', 'Eine ehrliche Warnung.']
  }),
  ...SECTOR_FLOOR.map(([s, n]) => ship(`atlas.hint.floor.${s}`, 'atlas', 'fieldWarn', 2, {
    when: ['The mission card: the sector\'s floor level', 'Die Missionskarte: die Mindeststufe des Sektors'],
    draft: [`{sector} runs level ${n} and up.`, `{sector} beginnt ab Stufe ${n}.`], params: { sector: `sector.${s}` },
    direction: ['A briefing.', 'Eine Einweisung.']
  })),
  ship('atlas.warn.down', 'atlas', 'fieldWarn', 1.8, {
    when: ['Flux goes down', 'Flux geht zu Boden'],
    draft: ['Rebooting… Pip\'s got you.', 'Neustart… Pip hat dich.'], direction: ['Reassuring.', 'Beruhigend.']
  }),
  // Machine scans
  ...([
    ['hardhat', '{enemy}. Shoot when it peeks.', '{enemy}. Schieß, wenn er rauslugt.', 1.8],
    ['trooper', 'Shield. Charge through it.', 'Schild. Mit einer Ladung durchbrechen.', 1.6],
    ['heli', '{enemy}. Look up.', '{enemy}. Schau nach oben.', 1.4],
    ['hopper', '{enemy}. Move off the ring.', '{enemy}. Runter vom Ring.', 1.6],
    ['roller', '{enemy}. Sidestep it.', '{enemy}. Weich seitlich aus.', 1.6],
    ['brute', '{enemy}. Parry, then punish.', '{enemy}. Parieren, dann zuschlagen.', 1.8],
    ['turret', '{enemy}. Keep moving.', '{enemy}. Bleib in Bewegung.', 1.6],
    ['golem', 'That crate\'s breathing. Get close.', 'Die Kiste atmet. Geh nah ran.', 2],
    ['polar', '{enemy}. Shoot it when it opens red.', '{enemy}. Schieß, wenn es rot aufgeht.', 1.8],
    ['warden', '{enemy}. Hit the core when it opens.', '{enemy}. Triff den Kern, wenn er aufgeht.', 1.8],
    ['hornet', '{enemy}. It dives straight: sidestep!', '{enemy}. Er stürzt geradeaus: zur Seite!', 1.6],
    ['stalker', '{enemy}. Parry the lunge.', '{enemy}. Pariere den Sprung.', 1.8],
    ['puffer', '{enemy}. Pop it before it swells.', '{enemy}. Platz ihn, bevor er anschwillt.', 1.6],
    ['mole', '{enemy}. Hit it when it pops up.', '{enemy}. Triff ihn beim Auftauchen.', 1.8],
    ['elite', 'Gold ring. Elite. Careful.', 'Goldring. Elite. Vorsicht.', 1.6]
  ] as const).map(([e, en, de, max]) => ship(`atlas.scan.${e}`, 'atlas', 'scan', max, {
    when: ['The first sighting of this machine', 'Die erste Sichtung dieser Maschine'],
    draft: [en, de], params: { enemy: `enemy.${e}` }, direction: ['A quick tactical read.', 'Eine schnelle taktische Einschätzung.']
  })),
  ...([['fire', 'Fire', 'Feuer'], ['ice', 'Ice', 'Eis'], ['volt', 'Volt', 'Volt'], ['wind', 'Wind', 'Wind']] as const)
    .map(([id, en, de]) => ship(`atlas.scan.${id}`, 'atlas', 'scan', 2, {
      when: [`The first ${id}-coated machine`, `Die erste Maschine mit ${de}-Beschichtung`],
      draft: [`${en}-coated. It shrugs off ${en.toLowerCase()}.`, `${de}beschichtet. ${de} prallt ab.`],
      direction: ['A quick tactical read.', 'Eine schnelle taktische Einschätzung.']
    }))
]

// ── Atlas: stage helper lines and secret hints (planned) ──
// One list per stage, filled by that stage's module; the secrets' own.
const ATLAS_HINT_BLAZE: VoiceLine[] = ([
  ['lava', 'Meltdown Descent: the first catwalks over lava', 'Kernschmelze: die ersten Laufstege über Lava',
    'That\'s lava down there. Stay on the metal.', 'Da unten ist Lava. Bleib auf dem Metall.', 2.4, 'A calm warning, eyes down.', 'Eine ruhige Warnung, Blick nach unten.'],
  ['leap', 'Meltdown Descent: the first dash-leap gap', 'Kernschmelze: die erste Rutschsprung-Lücke',
    'Too wide to walk. Slide off the edge, you\'ll carry.', 'Zu weit zum Gehen. Rutsch über die Kante, du fliegst rüber.', 2.8, 'A coach\'s tip, confident.', 'Ein Trainer-Tipp, zuversichtlich.'],
  ['vents', 'Meltdown Descent: the flame-vent walkway', 'Kernschmelze: der Laufsteg mit Flammendüsen',
    'Hiss, then fire. Let the roar pass, then go.', 'Erst Zischen, dann Feuer. Warte das Fauchen ab, dann los.', 2.6, 'Rhythmic, counting it out.', 'Rhythmisch, zählt mit.'],
  ['barrels', 'Meltdown Descent: the ember barrels cross the stairs', 'Kernschmelze: Glutfässer rollen über die Treppe',
    'Barrels! Watch the lamps, cross between them.', 'Fässer! Achte auf die Lampen, geh zwischen ihnen durch.', 2.4, 'Quick, a little alarmed.', 'Schnell, leicht alarmiert.'],
  ['hammers', 'Meltdown Descent: the forge hammers over the walkway', 'Kernschmelze: die Schmiedehämmer über dem Steg',
    'Forge hammers. Count the beat, then run.', 'Schmiedehämmer. Zähl den Takt, dann lauf.', 2.2, 'Steady, like a metronome.', 'Gleichmäßig, wie ein Metronom.']
] as const).map(([id, when, whenDe, en, de, max, dir, dirDe]) => ship(`atlas.hint.blaze.${id}`, 'atlas', 'act1', max, {
  when: [when, whenDe], draft: [en, de], direction: [dir, dirDe]
}))

const ATLAS_HINT_CRYO: VoiceLine[] = [
  ship('atlas.hint.cryo.ice', 'atlas', 'fieldWarn', 2.2, {
    when: ['Glacier Run: the first ice patch, in the lobby', 'Gletscherlauf: die erste Eisfläche, in der Halle'],
    draft: ['Ice! Let go of the stick and you\'ll keep sliding.', 'Eis! Lass den Stick los, und du rutschst weiter.'],
    direction: ['Delighted, a little mischievous.', 'Begeistert, ein bisschen verschmitzt.']
  }),
  ship('atlas.hint.cryo.spikes', 'atlas', 'fieldWarn', 2.4, {
    when: ['Glacier Run: the ice bridge over the spike pit', 'Gletscherlauf: die Eisbrücke über der Stachelgrube'],
    draft: ['Spikes under that ice. Walk it straight, no sharp turns.', 'Stacheln unter dem Eis. Geh geradeaus, keine scharfen Kurven.'],
    direction: ['Careful, steady.', 'Vorsichtig, ruhig.']
  }),
  ship('atlas.hint.cryo.frost', 'atlas', 'fieldWarn', 2.6, {
    when: ['Glacier Run: the first frost thrower', 'Gletscherlauf: der erste Frostwerfer'],
    draft: ['Frost thrower. It glows and hisses first. Cross when it\'s quiet.', 'Frostwerfer. Erst glüht und zischt er. Geh, wenn er still ist.'],
    direction: ['Tactical, quick.', 'Taktisch, zügig.']
  }),
  ship('atlas.hint.cryo.icicles', 'atlas', 'fieldWarn', 2, {
    when: ['Glacier Run: the icicle hall', 'Gletscherlauf: die Eiszapfenhalle'],
    draft: ['Shadows on the floor? Icicles. Step out of the ring!', 'Schatten am Boden? Eiszapfen. Raus aus dem Ring!'],
    direction: ['A quick look up, then urgent.', 'Ein schneller Blick nach oben, dann dringend.']
  }),
  ship('atlas.hint.cryo.pillar', 'atlas', 'fieldWarn', 2.4, {
    when: ['Glacier Run: a cracked ice pillar in sight', 'Gletscherlauf: eine rissige Eissäule in Sicht'],
    draft: ['That pillar\'s cracked. Shoot it, and there\'s your shortcut.', 'Die Säule hat Risse. Schieß drauf – schon hast du eine Abkürzung.'],
    direction: ['Sly, pointing out a trick.', 'Schlau, verrät einen Trick.']
  })
]

const ATLAS_HINT_VOLT: VoiceLine[] = [
  ship('atlas.hint.volt.panels', 'atlas', 'fieldWarn', 2.4, {
    when: ['Rail Rush: first coming up to the electrified floor panels', 'Rail Rush: zum ersten Mal vor den Strom-Bodenplatten'],
    draft: ['Those panels pulse. Wait on a dark row, then step.', 'Die Platten pulsieren. Warte auf einer dunklen Reihe, dann los.'],
    direction: ['A calm tip: timing, not speed.', 'Ein ruhiger Tipp: Timing, nicht Tempo.']
  }),
  ship('atlas.hint.volt.board', 'atlas', 'fieldWarn', 2.4, {
    when: ['Rail Rush: the maglev cart sets off with Flux on it', 'Rail Rush: der Magnetschwebewagen fährt mit Flux los'],
    draft: ['Hands off the controls — I\'ll drive, you shoot.', 'Hände weg vom Steuer — ich fahre, du schießt.'],
    direction: ['Gleeful, taking the wheel.', 'Vergnügt, übernimmt das Steuer.']
  })
]

const ATLAS_HINT_GALE: VoiceLine[] = [
  ship('atlas.hint.gale.leap', 'atlas', 'fieldWarn', 3, {
    when: ['Sky Docks: the first one-cell gap between islands', 'Himmelsdocks: die erste Ein-Feld-Lücke zwischen Inseln'],
    draft: ['Gap\'s too wide to walk. Slide off the edge — you\'ll carry.', 'Zu breit zum Gehen. Rutsch über die Kante – du fliegst mit.'],
    direction: ['Coaching, quick and sure.', 'Wie ein Trainer, schnell und sicher.']
  }),
  ship('atlas.hint.gale.wind', 'atlas', 'fieldWarn', 3, {
    when: ['Sky Docks: the mouth of the wind tunnel', 'Himmelsdocks: der Eingang des Windkanals'],
    draft: ['Wait for the gust to die, then move. Or hide behind a pillar.', 'Warte, bis die Böe abflaut, dann los. Oder duck dich hinter eine Säule.'],
    direction: ['Calm over the roar of the wind.', 'Ruhig über das Heulen des Windes hinweg.']
  })
]

const ATLAS_SECRET: VoiceLine[] = [
  ship('atlas.secret.lights', 'atlas', 'fieldWarn', 3, {
    when: ['First time near a lamp puzzle (copy the panel\'s on/off pattern)', 'Zum ersten Mal an einem Lampenrätsel (das An/Aus-Muster des Schilds nachmachen)'],
    draft: ['That panel shows a pattern. The lamps on the wall don\'t. Yet.', 'Das Schild zeigt ein Muster. Die Lampen an der Wand noch nicht.'],
    direction: ['Dry, a raised eyebrow; a tiny pause before "Yet."', 'Trocken, eine hochgezogene Augenbraue; kleine Pause vor "noch nicht".']
  }),
  ship('atlas.secret.color', 'atlas', 'fieldWarn', 3, {
    when: ['First time near a colour puzzle (only the frame\'s colour lit)', 'Zum ersten Mal an einem Farbrätsel (nur die Farbe des Rahmens an)'],
    draft: ['That frame has a favourite colour. Only its lamps should shine.', 'Der Rahmen hat eine Lieblingsfarbe. Nur ihre Lampen sollen leuchten.'],
    direction: ['Conspiratorial, half a whisper.', 'Verschwörerisch, halb geflüstert.']
  }),
  ship('atlas.secret.cycle', 'atlas', 'fieldWarn', 3, {
    when: ['First time near a colour-cycle puzzle (each hit steps the colour)', 'Zum ersten Mal an einem Farbwechselrätsel (jeder Treffer wechselt die Farbe)'],
    draft: ['Every hit changes a lamp\'s mind. The panel knows what it wants.', 'Jeder Treffer ändert die Meinung einer Lampe. Das Schild weiß, was es will.'],
    direction: ['Amused, like describing a fussy pet.', 'Amüsiert, als beschriebe man ein wählerisches Haustier.']
  }),
  ship('atlas.secret.solved', 'atlas', 'fieldWarn', 2, {
    when: ['A secret wall opens (puzzle solved)', 'Eine geheime Wand öffnet sich (Rätsel gelöst)'],
    draft: ['Well, well. Someone likes puzzles.', 'Sieh an. Da mag jemand Rätsel.'],
    direction: ['Impressed, pretending not to be.', 'Beeindruckt, tut aber so, als wäre es nicht so.']
  })
]

// ── Vex (planned) ──
const VEX: VoiceLine[] = [
  ship('story.vex.diagnosis', 'vex', 'intro', 3.5, {
    when: ['Intro: Vex takes over the screens', 'Intro: Vex übernimmt die Bildschirme'],
    draft: ['Diagnosis: this valley is SICK. The cure… is ME!', 'Diagnose: Dieses Tal ist KRANK. Die Heilung… bin ICH!'],
    direction: ['A grand reveal. A pause before "is ME", which is huge.', 'Eine große Enthüllung. Pause vor "bin ICH", das riesig kommt.']
  }),
  ship('vex.present.scrapper', 'vex', 'prologue', 2.5, {
    when: ['Presents the Scrapper', 'Kündigt den Schrottbrecher an'],
    draft: ['Warm up act! The {BOSS}!', 'Die Vorband! Der {BOSS}!'], params: { boss: 'boss.scrapper' },
    direction: ['A ringmaster, a bit dismissive.', 'Ein Zirkusdirektor, etwas herablassend.']
  }),
  ship('vex.hub.scrapper', 'vex', 'prologue', 2.5, {
    when: ['The hub, after the Scrapper', 'Die Basis, nach dem Schrottbrecher'],
    draft: ['A junk crane? How… adorable.', 'Ein Schrottkran? Wie… entzückend.'], direction: ['Mock-sweet, patronising.', 'Gespielt süß, herablassend.']
  }),
  ship('vex.present.blaze', 'vex', 'act1', 3, {
    when: ['Presents the Blaze Master', 'Kündigt den Glutmeister an'],
    draft: ['The oldest! The hottest! {BOSS}!', 'Der Älteste! Der Heißeste! {BOSS}!'], params: { boss: 'boss.blazeMaster' },
    direction: ['A full boxing-announcer build.', 'Ein Boxkampf-Ansager mit voller Steigerung.']
  }),
  ship('vex.hub.blaze', 'vex', 'act1', 2.8, {
    when: ['The hub, after the Blaze Master', 'Die Basis, nach dem Glutmeister'],
    draft: ['Side effect noted. Increasing the dose.', 'Nebenwirkung notiert. Ich erhöhe die Dosis.'],
    direction: ['Clinical and irritated, a doctor annoyed at a chart.', 'Klinisch und gereizt, ein Arzt, der sich über ein Krankenblatt ärgert.']
  }),
  ship('vex.present.frost', 'vex', 'act1', 2.8, {
    when: ['Presents the Frost Master', 'Kündigt den Frostmeister an'],
    draft: ['Chill, little droid. {BOSS}!', 'Bleib cool, kleiner Droide. {BOSS}!'], params: { boss: 'boss.frostMaster' },
    direction: ['Smug about the pun.', 'Selbstgefällig über das Wortspiel.']
  }),
  ship('vex.hub.blueprint', 'vex', 'midpoint', 2.8, {
    when: ['The hub: Flux found his blueprint', 'Die Basis: Flux hat seinen Bauplan gefunden'],
    draft: ['My sketches! Magnificent, aren\'t I?', 'Meine Skizzen! Großartig, nicht wahr?'],
    direction: ['Preening, delighted to be noticed.', 'Eitel, entzückt, bemerkt zu werden.']
  }),
  ship('vex.volt.hack', 'vex', 'act2', 2.8, {
    when: ['Volt Tower: he hacks Atlas', 'Voltturm: er hackt Atlas'],
    draft: ['Let\'s see what\'s in that empty head…', 'Mal sehen, was in dem leeren Kopf steckt…'],
    direction: ['Creepy-playful, a burglar humming.', 'Gruselig-verspielt, ein summender Einbrecher.']
  }),
  ship('vex.volt.fail', 'vex', 'act2', 2.2, {
    when: ['Volt Tower: the hack fails', 'Voltturm: der Hack scheitert'],
    draft: ['Unwritable?! How RUDE.', 'Nicht beschreibbar?! Wie UNVERSCHÄMT.'], direction: ['Scandalised. The monocle pops.', 'Empört. Das Monokel springt heraus.']
  }),
  ship('vex.present.volt', 'vex', 'act2', 2.8, {
    when: ['Presents the Volt Master', 'Kündigt den Voltmeister an'],
    draft: ['Blink and you\'ll miss it! {BOSS}!', 'Einmal blinzeln und er ist weg! {BOSS}!'], params: { boss: 'boss.voltMaster' },
    direction: ['Fast and zappy.', 'Schnell und zackig.']
  }),
  ship('vex.hub.volt', 'vex', 'act2', 2.8, {
    when: ['The hub, after the Volt Master', 'Die Basis, nach dem Voltmeister'],
    draft: ['I am… per-fect-ly… FINE.', 'Mir geht es… ab-so-lut… BESTENS.'],
    direction: ['Forced calm that cracks on the last word. The stutter is added in post.', 'Erzwungene Ruhe, die beim letzten Wort bricht. Das Stottern kommt in der Nachbearbeitung.']
  }),
  ship('vex.present.gale', 'vex', 'act2', 3, {
    when: ['Presents the Gale Master', 'Kündigt den Sturmmeister an'],
    draft: ['Next, please! {BOSS}, blow him away!', 'Der Nächste, bitte! {BOSS}, puste ihn weg!'], params: { boss: 'boss.galeMaster' },
    direction: ['Brisk showmanship, a doctor calling the next patient. Not desperate yet: he still has a reserve.', 'Zackige Showeinlage, ein Arzt ruft den nächsten Patienten auf. Noch nicht verzweifelt: er hat noch eine Reserve.']
  }),
  ship('vex.hub.gale', 'vex', 'act2', 2.4, {
    when: ['The hub, after the Gale Master: the shield holds, he calls up his reserve', 'Die Basis, nach dem Sturmmeister: der Schild hält, er ruft seine Reserve'],
    draft: ['Fine! I have MORE Masters.', 'Schön! Ich habe noch MEHR Meister.'],
    direction: ['Huffy, then smug again: he has a trick left.', 'Eingeschnappt, dann wieder selbstgefällig: er hat noch einen Trick.']
  }),
  ship('atlas.sector.magnet', 'atlas', 'shift', 2.2, {
    when: ['Beam-in: Polarity Works', 'Ankunft: Polaritätswerk'],
    draft: ['A foundry. It\'s casting claws.', 'Eine Gießerei. Hier entstehen Klauen.'],
    direction: ['Noticing something; a little grim.', 'Bemerkt etwas; ein wenig grimmig.']
  }),
  ship('vex.present.magnet', 'vex', 'shift', 2.8, {
    when: ['Presents the Magnet Master', 'Kündigt den Magnetmeister an'],
    draft: ['Attractive, isn\'t it? {BOSS}!', 'Anziehend, nicht wahr? {BOSS}!'], params: { boss: 'boss.magnetMaster' },
    direction: ['Silky, pleased with the pun: a ringmaster leaning on "attractive".', 'Seidig, zufrieden mit dem Wortspiel: ein Zirkusdirektor, der "anziehend" auskostet.']
  }),
  ship('atlas.story.magnetFreed', 'atlas', 'shift', 2.2, {
    when: ['The Magnet Master is freed', 'Der Magnetmeister ist befreit'],
    draft: ['The foundry\'s cold. No more claws.', 'Die Gießerei ist kalt. Keine Klauen mehr.'],
    direction: ['Satisfied.', 'Zufrieden.']
  }),
  ship('vex.hub.magnet', 'vex', 'shift', 2.4, {
    when: ['The hub, after the Magnet Master', 'Die Basis, nach dem Magnetmeister'],
    draft: ['Repelled? Me? Im-POSSIBLE!', 'Abgestoßen? Ich? Un-MÖGLICH!'],
    direction: ['Offended vanity; breaks the last word in two.', 'Gekränkte Eitelkeit; bricht das letzte Wort in zwei Teile.']
  }),
  ship('atlas.sector.drill', 'atlas', 'shift', 2.2, {
    when: ['Beam-in: Deep Mine', 'Ankunft: Tiefenmine'],
    draft: ['Ore for its armor. Dug right here.', 'Erz für seine Panzerung. Von hier unten.'],
    direction: ['Low and close, like a voice down a shaft.', 'Tief und nah, wie eine Stimme in einem Schacht.']
  }),
  ship('vex.present.drill', 'vex', 'shift', 3, {
    when: ['Presents the Drill Master', 'Kündigt den Bohrmeister an'],
    draft: ['Time for a deep check-up! {BOSS}!', 'Zeit für eine Tiefenuntersuchung! {BOSS}!'], params: { boss: 'boss.drillMaster' },
    direction: ['A doctor\'s bedside manner gone theatrical; leans into "deep".', 'Ärztlicher Plauderton, ins Theatralische gekippt; legt sich in "Tiefen".']
  }),
  ship('atlas.story.drillFreed', 'atlas', 'shift', 2.2, {
    when: ['The Drill Master is freed', 'Der Bohrmeister ist befreit'],
    draft: ['The mine\'s quiet. No more ore.', 'Die Mine ist still. Kein Erz mehr.'],
    direction: ['Quiet, a breath out.', 'Leise, ein Ausatmen.']
  }),
  ship('vex.hub.drill', 'vex', 'shift', 2.4, {
    when: ['The hub, after the Drill Master', 'Die Basis, nach dem Bohrmeister'],
    draft: ['Hmph. A new low. Literally.', 'Pah. Ein neuer Tiefpunkt. Wörtlich.'],
    direction: ['Sulky and deadpan, then pleased with his own pun on the last word.', 'Schmollend und trocken, dann zufrieden mit dem eigenen Wortspiel beim letzten Wort.']
  }),
  ship('atlas.sector.tide', 'atlas', 'shift', 2.2, {
    when: ['Beam-in: Tidewater Locks', 'Ankunft: Gezeitenschleusen'],
    draft: ['Barges now. Vex found another way.', 'Jetzt Lastkähne. Vex hat einen neuen Weg.'],
    direction: ['Wry: Vex is resourceful.', 'Trocken: Vex ist einfallsreich.']
  }),
  ship('vex.present.tide', 'vex', 'shift', 2.8, {
    when: ['Presents the Tide Master', 'Kündigt den Gezeitenmeister an'],
    draft: ['Wave goodbye, droid! {BOSS}!', 'Hier kommt die große Welle! {BOSS}!'], params: { boss: 'boss.tideMaster' },
    direction: ['Grand and splashy, a game-show host swinging his arm.', 'Groß und spritzig, ein Showmaster, der den Arm schwingt.']
  }),
  ship('atlas.story.tideFreed', 'atlas', 'shift', 2.2, {
    when: ['The Tide Master is freed', 'Der Gezeitenmeister ist befreit'],
    draft: ['Locks shut. The barges stay home.', 'Schleusen zu. Die Kähne bleiben daheim.'],
    direction: ['Pleased, a small smile.', 'Erfreut, ein kleines Lächeln.']
  }),
  ship('vex.hub.tide', 'vex', 'shift', 2.6, {
    when: ['The hub, after the Tide Master', 'Die Basis, nach dem Gezeitenmeister'],
    draft: ['The tide will turn! …Won\'t it?', 'Die Flut kommt wieder! …Oder?'],
    direction: ['Defiant, then a small doubtful pause before the question.', 'Trotzig, dann eine kleine zweifelnde Pause vor der Frage.']
  }),
  ship('atlas.sector.neon', 'atlas', 'shift', 2, {
    when: ['Beam-in: Blackout Boulevard', 'Ankunft: Blackout-Boulevard'],
    draft: ['Lights out. Except Vex\'s face.', 'Licht aus. Nur Vex\' Gesicht nicht.'],
    direction: ['Dry, almost a joke.', 'Trocken, fast ein Witz.']
  }),
  ship('vex.present.neon', 'vex', 'shift', 2.6, {
    when: ['Presents the Neon Master', 'Kündigt den Neonmeister an'],
    draft: ['Lights! Camera! {BOSS}!', 'Licht! Kamera! {BOSS}!'], params: { boss: 'boss.neonMaster' },
    direction: ['Pure showbiz: a director calling the shot, then the name in lights.', 'Reines Showbusiness: ein Regisseur ruft die Szene aus, dann der Name in Leuchtschrift.']
  }),
  ship('atlas.story.neonFreed', 'atlas', 'shift', 2.2, {
    when: ['The Neon Master is freed', 'Der Neonmeister ist befreit'],
    draft: ['Lights on. Vex lost its screens.', 'Licht an. Vex hat keine Bildschirme mehr.'],
    direction: ['Delighted, warm.', 'Begeistert, warm.']
  }),
  ship('vex.hub.neon', 'vex', 'shift', 2.2, {
    when: ['The hub, after the Neon Master', 'Die Basis, nach dem Neonmeister'],
    draft: ['Who turned the lights ON?!', 'Wer hat das Licht ANGEMACHT?!'],
    direction: ['Shrieking, squinting at the light. The glitch is added in post.', 'Kreischend, blinzelt ins Licht. Der Glitch kommt in der Nachbearbeitung.']
  }),
  ship('atlas.sector.rotor', 'atlas', 'shift', 2, {
    when: ['Beam-in: Rotor Run', 'Ankunft: Rotorflug'],
    draft: ['Drones. Its last supply line.', 'Drohnen. Seine letzte Versorgungslinie.'],
    direction: ['Focused: the end is in sight.', 'Konzentriert: das Ende ist in Sicht.']
  }),
  ship('vex.present.rotor', 'vex', 'shift', 2.8, {
    when: ['Presents the Rotor Master, the last of his reserve', 'Kündigt den Rotormeister an, den Letzten seiner Reserve'],
    draft: ['The grand finale! {BOSS}!', 'Das große Finale! {BOSS}!'], params: { boss: 'boss.rotorMaster' },
    direction: ['The last card: still the showman, the voice straining at the top.', 'Die letzte Karte: immer noch der Showman, die Stimme oben angespannt.']
  }),
  ship('atlas.story.rotorFreed', 'atlas', 'shift', 2.2, {
    when: ['The Rotor Master is freed: the tenth relay', 'Der Rotormeister ist befreit: das zehnte Relais'],
    draft: ['Every line\'s cut. Vex is alone.', 'Alle Linien gekappt. Vex ist allein.'],
    direction: ['Quiet triumph, with weight to it.', 'Leiser Triumph, mit Gewicht.']
  }),
  ship('vex.hub.rotor', 'vex', 'shift', 2.4, {
    when: ['The hub, after the Rotor Master: the Breach begins (just before vex.hub.breach)', 'Die Basis, nach dem Rotormeister: der Durchbruch beginnt (direkt vor vex.hub.breach)'],
    draft: ['Ten relays?! Nurse! NURSE!', 'Zehn Relais?! Schwester! SCHWESTER!'],
    direction: ['Panic: calling for a nurse who never comes. The tantrum builds into the Breach; the static tear is added in post.', 'Panik: ruft nach einer Schwester, die nie kommt. Der Wutanfall steigert sich in den Durchbruch; der Störeffekt kommt in der Nachbearbeitung.']
  }),
  ship('vex.hub.breach', 'vex', 'shift', 3, {
    when: ['The hub: his shield has fallen', 'Die Basis: sein Schild ist gefallen'],
    draft: ['No, no, NO! That shield was PATENTED!', 'Nein, nein, NEIN! Der Schild war PATENTIERT!'],
    direction: ['A full tantrum. The static tear is added in post.', 'Ein ausgewachsener Wutanfall. Der Störeffekt kommt in der Nachbearbeitung.']
  }),
  ship('vex.fortress.welcome', 'vex', 'act3', 3.2, {
    when: ['Entering the Fortress', 'Betreten der Festung'],
    draft: ['Welcome to my clinic! Take a seat… FOREVER!', 'Willkommen in meiner Klinik! Nimm Platz… für IMMER!'],
    direction: ['A villain host, relishing it.', 'Ein Schurken-Gastgeber, der es genießt.']
  }),
  ship('vex.mk1.intro', 'vex', 'act3', 2.8, {
    when: ['Mk-I intro', 'Mk-I-Auftritt'],
    draft: ['Behold! My new body! Mark ONE!', 'Seht her! Mein neuer Körper! Mark EINS!'], direction: ['The peak of vanity.', 'Der Gipfel der Eitelkeit.']
  }),
  ship('vex.mk1.obey', 'vex', 'act3', 2.4, {
    when: ['Mk-I fight: he calls the Masters', 'Mk-I-Kampf: er ruft die Meister'],
    draft: ['Masters! OBEY your doctor!', 'Meister! GEHORCHT eurem Doktor!'], direction: ['Commanding, strained.', 'Befehlend, angespannt.']
  }),
  ship('vex.mk1.listen', 'vex', 'act3', 2.2, {
    when: ['Mk-I phase 2: the Masters refuse', 'Mk-I Phase 2: die Meister verweigern sich'],
    draft: ['Why won\'t they LISTEN?!', 'Warum HÖREN sie nicht?!'], direction: ['Cracking; genuine confusion under the rage.', 'Brüchig; echte Verwirrung unter der Wut.']
  }),
  ship('vex.mk1.defeat', 'vex', 'act3', 2.6, {
    when: ['Mk-I defeated', 'Mk-I besiegt'],
    draft: ['I\'ll get… a second opinion…', 'Ich hole mir… eine zweite Meinung…'], direction: ['Small, fading, still smug under it.', 'Klein, verblassend, darunter immer noch selbstgefällig.']
  }),
  ship('vex.sting.doctorIn', 'vex', 'ending', 2.2, {
    when: ['New Game+ only: the sting after the credits', 'Nur New Game+: der Nachklapp nach dem Abspann'],
    draft: ['The doctor… is IN.', 'Der Doktor… ist DA.'], direction: ['Whispered, then a slow grin.', 'Geflüstert, dann ein langsames Grinsen.']
  }),
  // Live: the story scenes close a line with one (`story/vexScene.ts`). No bubble of their own.
  ...([['short', 1.2], ['medium', 1.8], ['maniacal', 2.6]] as const).map(([k, max]) => ({ ...plan(`vex.laugh.${k}`, 'vex', 'laughs', max, {
    when: ['A bubble that ends in a laugh', 'Eine Sprechblase, die mit einem Lachen endet'],
    draft: ['Mwa-ha-HA!', 'Mwa-ha-HA!'], neutral: true,
    direction: [`The ${k} laugh.`, `Das ${k === 'short' ? 'kurze' : k === 'medium' ? 'mittlere' : 'wahnsinnige'} Lachen.`]
  }), status: 'live' as const }))
]

// ── Flux (planned): barks, English everywhere ──
const BARKS: ReadonlyArray<readonly [type: string, max: number, takes: readonly string[], tail: string]> = [
  ['light', 0.4, ['Oof!', 'Ow!', 'Hey!'], 'a short tick'],
  ['heavy', 0.6, ['KLONK!', 'Arrgh!', 'Whoa-oa!'], 'a metal clang'],
  ['fire', 0.6, ['Yeowch!', 'Hot-hot-hot!', 'Yeowch!'], 'a sizzle'],
  ['ice', 0.6, ['Brrr-zzt!', 'Ch-chilly!', 'Brrr-zzt!'], 'a crystal tinkle'],
  ['volt', 0.5, ['Bzzzt!', 'Zzap!', 'Bzzzt!'], 'a static crackle'],
  ['wind', 0.7, ['Whoa-oa-oa!', 'Whoa-oa-oa!', 'Whoa-oa-oa!'], 'a whoosh'],
  ['trap', 0.5, ['Yikes!', 'Not cool!', 'Yikes!'], 'none'],
  ['crusher', 0.5, ['Squonk!', 'Squonk!', 'Squonk!'], 'a squeaky-toy squash'],
  ['pit', 1, ['Wha— aaaa!', 'Wha— aaaa!', 'Wha— aaaa!'], 'a Doppler fall'],
  ['lowHp', 0.6, ['Nnngh!', 'Nnngh!', 'Nnngh!'], 'a low servo whine'],
  ['down', 0.9, ['Uh-oh…', 'Uh-oh…', 'Uh-oh…'], 'a power-down sweep'],
  ['parry', 0.3, ['Ha!', 'Ha!', 'Ha!'], 'a bright ping'],
  ['gel', 0.7, ['Aaah~', 'Aaah~', 'Aaah~'], 'a rising refill shimmer']
]
/** Live: `audio/barks.ts` plays them. A bark has no bubble, so its text is its draft (never a locale key). */
const FLUX: VoiceLine[] = BARKS.flatMap(([type, max, takes, tail]) => takes.map((t, i) => ({ ...plan(`flux.hurt.${type}.${i + 1}`, 'flux', 'barks', max, {
  when: [`Flux takes a hit: ${type} (the game picks one of 3 at random; synth tail in post: ${tail})`,
    `Flux wird getroffen: ${type} (das Spiel wählt zufällig einen von 3)`],
  draft: [t, t], neutral: true,
  direction: takes.indexOf(t) !== i
    ? ['Another take of the same word: vary the pitch and energy.', 'Eine weitere Aufnahme desselben Worts: Tonhöhe und Energie variieren.']
    : ['Comedy first: a cartoon robot getting bonked, never a real injury.', 'Komik zuerst: ein Cartoon-Roboter kriegt eins ab, nie eine echte Verletzung.']
}), status: 'live' as const })))

/** Every line, speakers in cast order, scenes in playing order. */

/** The finale and the new stage lines (#101, #102, #109, #110, #111): planned. */
const FINALE: VoiceLine[] = [
  ship('atlas.hint.vex.roof', 'atlas', 'act3', 2.4, {
    when: ["Vex Fortress: the roof fight begins, the first lightning ring", "Vex-Festung: der Kampf auf dem Dach beginnt, der erste Blitzring"],
    draft: ["Lightning! Move when the ring lights up!", "Blitze! Weg, wenn der Ring aufleuchtet!"],
    direction: ["Sharp, watching the sky.", "Scharf, den Himmel im Blick."]
  }),
  ship('atlas.hint.vex.fall', 'atlas', 'act3', 2.4, {
    when: ["Vex Fortress: the roof collapses at 65 %", "Vex-Festung: das Dach bricht bei 65 % ein"],
    draft: ["The roof's giving way!", "Das Dach bricht ein!"],
    direction: ["Alarmed, quick.", "Alarmiert, schnell."]
  }),
  ship('atlas.hint.vex.core', 'atlas', 'act3', 2.4, {
    when: ["Vex Fortress: the drop to the Core ring at 30 %", "Vex-Festung: der Sturz zum Kernring bei 30 %"],
    draft: ["Down to the Core! Don't fall in!", "Runter zum Kern! Nicht reinfallen!"],
    direction: ["Urgent, careful.", "Dringend, vorsichtig."]
  }),
  ship('atlas.hint.gm.button', 'atlas', 'act3', 2.4, {
    when: ["Vex Fortress: Vex falls and presses his red button", "Vex-Festung: Vex fällt und drückt seinen roten Knopf"],
    draft: ["Vex is pressing something... Brace yourself!", "Vex drückt irgendwas... Mach dich bereit!"],
    direction: ["Uneasy, bracing.", "Unruhig, angespannt."]
  }),
  ship('atlas.hint.gm.arms', 'atlas', 'act3', 2.4, {
    when: ["Grand Master: the fight starts, the arms are the target", "Großmeister: der Kampf beginnt, die Arme sind das Ziel"],
    draft: ["Its arms first! The cannon and the lance!", "Erst die Arme! Kanone und Lanze!"],
    direction: ["Commanding.", "Befehlend."]
  }),
  ship('atlas.hint.gm.feet', 'atlas', 'act3', 2.4, {
    when: ["Grand Master: both arms down, the feet next", "Großmeister: beide Arme ab, jetzt die Füße"],
    draft: ["Now the feet! Block the shockwaves!", "Jetzt die Füße! Blocke die Schockwellen!"],
    direction: ["Driving on.", "Treibend."]
  }),
  ship('atlas.hint.gm.head', 'atlas', 'act3', 2.4, {
    when: ["Grand Master: it sinks, the head comes in reach", "Großmeister: er sinkt, der Kopf ist erreichbar"],
    draft: ["It's down low. The head is in reach!", "Er ist unten. Der Kopf ist in Reichweite!"],
    direction: ["Spotting the chance.", "Erkennt die Chance."]
  }),
  ship('atlas.hint.gm.body', 'atlas', 'act3', 2.4, {
    when: ["Grand Master: the last part, the core", "Großmeister: das letzte Teil, der Kern"],
    draft: ["The core is open! Finish it!", "Der Kern liegt frei! Mach ihn fertig!"],
    direction: ["All in.", "Alles geben."]
  }),
  ship('atlas.hint.gm.prism', 'atlas', 'act3', 2.4, {
    when: ["Grand Master: the Prism Cannon charges", "Großmeister: die Prismakanone lädt"],
    draft: ["Prism Cannon! Shield up!", "Prismakanone! Schild hoch!"],
    direction: ["Warning, fast.", "Warnung, schnell."]
  }),
  ship('atlas.hint.neon.blackout', 'atlas', 'act3', 2.4, {
    when: ["Blackout Boulevard: at the first pulse bridge", "Blackout Boulevard: an der ersten Pulsbrücke"],
    draft: ["Power's failing! Cross when the lights come back.", "Der Strom fällt aus! Rüber, wenn das Licht wieder angeht."],
    direction: ["Tense, then reassuring.", "Angespannt, dann beruhigend."]
  }),
  ship('atlas.hint.drill.board', 'atlas', 'act3', 2.4, {
    when: ["Deep Mine: boarding the ore cart", "Tiefe Mine: Einstieg in die Lore"],
    draft: ["Ore cart's rolling! I steer, you shoot the moles.", "Die Lore rollt! Ich lenke, du schießt auf die Maulwürfe."],
    direction: ["Excited.", "Begeistert."]
  }),
  ship('ending.gauss', 'gauss', 'ending', 3.5, {
    when: ["The ending: Gauss steps out of her capsule", "Das Ende: Gauss steigt aus ihrer Kapsel"],
    direction: ["Warm, tired, proud.", "Warm, müde, stolz."]
  }),
  ship('ending.atlas', 'atlas', 'ending', 3.5, {
    when: ["The ending: Atlas and the empty Spire", "Das Ende: Atlas und der leere Turm"],
    direction: ["Quiet, certain, a smile in it.", "Leise, sicher, mit einem Lächeln."]
  }),
  ship('ending.spark', 'gauss', 'ending', 3.5, {
    when: ["The ending: the sunrise, the last line", "Das Ende: der Sonnenaufgang, die letzte Zeile"],
    direction: ["Soft wonder.", "Sanftes Staunen."]
  })
]

// ── Pip: the debrief after each story mission (#119) ──
const PIP: VoiceLine[] = [
  live("pip.debrief.hello", 'pip', 'debrief', {
    when: ["The first debrief: Pip greets Flux over the valley", "Die erste Nachbesprechung: Pip begrüßt Flux über dem Tal"],
    direction: ["Bright and glad to see him; a quick breath, then pointing at the hologram.", "Hell und froh, ihn zu sehen; kurz Luft holen, dann auf das Hologramm zeigen."],
    max: 2.6
  }),
  live("pip.debrief.scrapyard.won", 'pip', 'debrief', {
    when: ["Debrief after Scrapyard: what the win changed", "Nachbesprechung nach Schrottplatz: was der Sieg verändert hat"],
    direction: ["Pleased and a little amazed: the first thing that went back to normal.", "Zufrieden und ein wenig erstaunt: das Erste, was wieder normal läuft."],
    max: 2.6
  }),
  live("pip.debrief.scrapyard.weapon", 'pip', 'debrief', {
    when: ["Debrief after Scrapyard: the copied weapon's card", "Nachbesprechung nach Schrottplatz: die Karte der kopierten Waffe"],
    direction: ["Proud of him, then a handy tip, said plainly.", "Stolz auf ihn, dann ein praktischer Tipp, ganz schlicht."],
    params: { weapon: "weapon.scrapBurst.name" },
    max: 2.8
  }),
  live("pip.debrief.scrapyard.next", 'pip', 'debrief', {
    when: ["Debrief after Scrapyard: the camera travels to Blaze Refinery", "Nachbesprechung nach Schrottplatz: die Kamera fährt zu Glutraffinerie"],
    direction: ["Like a tour guide; reassuring on 'just a little'.", "Wie ein Reiseleiter; beruhigend bei 'nur ein bisschen'."],
    params: { sector: "sector.blaze" },
    max: 2.8
  }),
  live("pip.debrief.scrapyard.boss", 'pip', 'debrief', {
    when: ["Debrief after Scrapyard: what the Master of Blaze Refinery has done", "Nachbesprechung nach Schrottplatz: was der Meister von Glutraffinerie angerichtet hat"],
    direction: ["Worried, a touch indignant: that forge used to work for the city.", "Besorgt, leicht empört: die Schmiede hat mal für die Stadt gearbeitet."],
    params: { boss: "boss.blazeMaster" },
    max: 3
  }),
  live("pip.debrief.scrapyard.tip", 'pip', 'debrief', {
    when: ["Debrief after Scrapyard: how to beat the next Master", "Nachbesprechung nach Schrottplatz: wie der nächste Meister zu schlagen ist"],
    direction: ["Two clear instructions, a small beat between them.", "Zwei klare Anweisungen, dazwischen eine kleine Pause."],
    max: 3
  }),
  live("pip.debrief.blaze.won", 'pip', 'debrief', {
    when: ["Debrief after Blaze Refinery: what the win changed", "Nachbesprechung nach Glutraffinerie: was der Sieg verändert hat"],
    direction: ["Relieved, then a quick, honest compliment.", "Erleichtert, dann ein kurzes, ehrliches Lob."],
    max: 2.8
  }),
  live("pip.debrief.blaze.weapon", 'pip', 'debrief', {
    when: ["Debrief after Blaze Refinery: the copied weapon's card", "Nachbesprechung nach Glutraffinerie: die Karte der kopierten Waffe"],
    direction: ["Delighted; 'Fire melts ice' like a rule he just remembered.", "Begeistert; 'Feuer schmilzt Eis' wie eine Regel, die ihm gerade einfällt."],
    params: { weapon: "weapon.flameWave.name" },
    max: 2.8
  }),
  live("pip.debrief.blaze.next", 'pip', 'debrief', {
    when: ["Debrief after Blaze Refinery: the camera travels to Cryo Plant", "Nachbesprechung nach Glutraffinerie: die Kamera fährt zu Kryowerk"],
    direction: ["A friendly heads-up, not a scare.", "Ein freundlicher Hinweis, keine Panikmache."],
    params: { sector: "sector.cryo" },
    max: 3
  }),
  live("pip.debrief.blaze.boss", 'pip', 'debrief', {
    when: ["Debrief after Blaze Refinery: what the Master of Cryo Plant has done", "Nachbesprechung nach Glutraffinerie: was der Meister von Kryowerk angerichtet hat"],
    direction: ["Concerned; the second sentence is the reason to go.", "Besorgt; der zweite Satz ist der Grund, loszuziehen."],
    params: { boss: "boss.frostMaster" },
    max: 3
  }),
  live("pip.debrief.blaze.tip", 'pip', 'debrief', {
    when: ["Debrief after Blaze Refinery: how to beat the next Master", "Nachbesprechung nach Glutraffinerie: wie der nächste Meister zu schlagen ist"],
    direction: ["Cheeky on 'fire back': he knows it is a pun.", "Verschmitzt bei 'heiz ihm ein': er weiß, dass es ein Wortspiel ist."],
    max: 2.6
  }),
  live("pip.debrief.cryo.won", 'pip', 'debrief', {
    when: ["Debrief after Cryo Plant: what the win changed", "Nachbesprechung nach Kryowerk: was der Sieg verändert hat"],
    direction: ["A happy sigh of relief.", "Ein fröhliches Aufatmen."],
    max: 2.8
  }),
  live("pip.debrief.cryo.weapon", 'pip', 'debrief', {
    when: ["Debrief after Cryo Plant: the copied weapon's card", "Nachbesprechung nach Kryowerk: die Karte der kopierten Waffe"],
    direction: ["Eager; the rule lands crisp and bright.", "Eifrig; die Regel kommt knackig und hell."],
    params: { weapon: "weapon.iceLance.name" },
    max: 2.6
  }),
  live("pip.debrief.cryo.next", 'pip', 'debrief', {
    when: ["Debrief after Cryo Plant: the camera travels to Volt Tower", "Nachbesprechung nach Kryowerk: die Kamera fährt zu Voltturm"],
    direction: ["Honest about the jump, still upbeat.", "Ehrlich, was den Sprung angeht, trotzdem munter."],
    params: { sector: "sector.volt" },
    max: 2.8
  }),
  live("pip.debrief.cryo.boss", 'pip', 'debrief', {
    when: ["Debrief after Cryo Plant: what the Master of Volt Tower has done", "Nachbesprechung nach Kryowerk: was der Meister von Voltturm angerichtet hat"],
    direction: ["Serious for a moment; stress 'our power'.", "Einen Moment ernst; Betonung auf 'unseren Strom'."],
    params: { boss: "boss.voltMaster" },
    max: 3
  }),
  live("pip.debrief.cryo.tip", 'pip', 'debrief', {
    when: ["Debrief after Cryo Plant: how to beat the next Master", "Nachbesprechung nach Kryowerk: wie der nächste Meister zu schlagen ist"],
    direction: ["Quick and practical, like reading from his notes.", "Schnell und praktisch, wie aus seinen Notizen vorgelesen."],
    max: 2.8
  }),
  live("pip.debrief.volt.won", 'pip', 'debrief', {
    when: ["Debrief after Volt Tower: what the win changed", "Nachbesprechung nach Voltturm: was der Sieg verändert hat"],
    direction: ["Giggling at the villain; the question is gleeful.", "Kichert über den Schurken; die Frage ist schadenfroh."],
    max: 2.8
  }),
  live("pip.debrief.volt.weapon", 'pip', 'debrief', {
    when: ["Debrief after Volt Tower: the copied weapon's card", "Nachbesprechung nach Voltturm: die Karte der kopierten Waffe"],
    direction: ["Bright and quick; the rule again, pleased with the pattern.", "Hell und schnell; wieder die Regel, stolz auf das Muster."],
    params: { weapon: "weapon.thunderArc.name" },
    max: 2.6
  }),
  live("pip.debrief.volt.next", 'pip', 'debrief', {
    when: ["Debrief after Volt Tower: the camera travels to Sky Docks", "Nachbesprechung nach Voltturm: die Kamera fährt zu Himmelsdocks"],
    direction: ["Looking up as he says it; a small gulp on 'way up high'.", "Schaut dabei nach oben; ein kleines Schlucken bei 'ganz weit oben'."],
    params: { sector: "sector.gale" },
    max: 2.8
  }),
  live("pip.debrief.volt.boss", 'pip', 'debrief', {
    when: ["Debrief after Volt Tower: what the Master of Sky Docks has done", "Nachbesprechung nach Voltturm: was der Meister von Himmelsdocks angerichtet hat"],
    direction: ["A little sorry for the Master: it never gets to rest.", "Ein wenig Mitleid mit dem Meister: er kommt nie zur Ruhe."],
    params: { boss: "boss.galeMaster" },
    max: 2.8
  }),
  live("pip.debrief.volt.tip", 'pip', 'debrief', {
    when: ["Debrief after Volt Tower: how to beat the next Master", "Nachbesprechung nach Voltturm: wie der nächste Meister zu schlagen ist"],
    direction: ["Coaching; lift on 'Parry'.", "Wie ein Trainer; Hebung auf 'Pariere'."],
    max: 2.8
  }),
  live("pip.debrief.gale.won", 'pip', 'debrief', {
    when: ["Debrief after Sky Docks: what the win changed", "Nachbesprechung nach Himmelsdocks: was der Sieg verändert hat"],
    direction: ["Cheering, arms up.", "Jubelnd, Arme hoch."],
    max: 2.8
  }),
  live("pip.debrief.gale.weapon", 'pip', 'debrief', {
    when: ["Debrief after Sky Docks: the copied weapon's card", "Nachbesprechung nach Himmelsdocks: die Karte der kopierten Waffe"],
    direction: ["Pleased, explaining a clever gadget.", "Zufrieden, erklärt ein schlaues Gerät."],
    params: { weapon: "weapon.galeGuard.name" },
    max: 2.8
  }),
  live("pip.debrief.gale.next", 'pip', 'debrief', {
    when: ["Debrief after Sky Docks: the camera travels to Polarity Works", "Nachbesprechung nach Himmelsdocks: die Kamera fährt zu Polaritätswerk"],
    direction: ["The mood drops a step: five more relays just woke up. Plain on 'Much tougher'.", "Die Stimmung sinkt eine Stufe: fünf weitere Relais sind erwacht. Schlicht bei 'Viel härter'."],
    params: { sector: "sector.magnet" },
    max: 3
  }),
  live("pip.debrief.gale.boss", 'pip', 'debrief', {
    when: ["Debrief after Sky Docks: what the Master of Polarity Works has done", "Nachbesprechung nach Himmelsdocks: was der Meister von Polaritätswerk angerichtet hat"],
    direction: ["Indignant in a small way: those are the city's trams.", "Im Kleinen empört: das sind die Trams der Stadt."],
    params: { boss: "boss.magnetMaster" },
    max: 3
  }),
  live("pip.debrief.gale.tip", 'pip', 'debrief', {
    when: ["Debrief after Sky Docks: how to beat the next Master", "Nachbesprechung nach Himmelsdocks: wie der nächste Meister zu schlagen ist"],
    direction: ["A warning with a wince, then the fix, firm.", "Eine Warnung mit Zusammenzucken, dann die Lösung, bestimmt."],
    max: 2.6
  }),
  live("pip.debrief.magnet.won", 'pip', 'debrief', {
    when: ["Debrief after Polarity Works: what the win changed", "Nachbesprechung nach Polaritätswerk: was der Sieg verändert hat"],
    direction: ["Playful; 'Ding ding' is a tram bell, two bright notes.", "Verspielt; 'Bim, bim' ist eine Tramglocke, zwei helle Töne."],
    max: 2.6
  }),
  live("pip.debrief.magnet.weapon", 'pip', 'debrief', {
    when: ["Debrief after Polarity Works: the copied weapon's card", "Nachbesprechung nach Polaritätswerk: die Karte der kopierten Waffe"],
    direction: ["A tip passed on with a wink.", "Ein Tipp, mit einem Augenzwinkern weitergegeben."],
    params: { weapon: "weapon.magnetPull.name" },
    max: 3
  }),
  live("pip.debrief.magnet.next", 'pip', 'debrief', {
    when: ["Debrief after Polarity Works: the camera travels to Deep Mine", "Nachbesprechung nach Polaritätswerk: die Kamera fährt zu Tiefenmine"],
    direction: ["Voice goes a little lower on 'deep underground'.", "Die Stimme wird bei 'tief unter der Erde' etwas tiefer."],
    params: { sector: "sector.drill" },
    max: 3
  }),
  live("pip.debrief.magnet.boss", 'pip', 'debrief', {
    when: ["Debrief after Polarity Works: what the Master of Deep Mine has done", "Nachbesprechung nach Polaritätswerk: was der Meister von Tiefenmine angerichtet hat"],
    direction: ["Worried for them; this is a rescue.", "In Sorge um sie; das ist eine Rettung."],
    params: { boss: "boss.drillMaster" },
    max: 2.8
  }),
  live("pip.debrief.magnet.tip", 'pip', 'debrief', {
    when: ["Debrief after Polarity Works: how to beat the next Master", "Nachbesprechung nach Polaritätswerk: wie der nächste Meister zu schlagen ist"],
    direction: ["Quick; the second sentence is the thing to remember.", "Schnell; der zweite Satz ist das, was man sich merken soll."],
    max: 2.8
  }),
  live("pip.debrief.drill.won", 'pip', 'debrief', {
    when: ["Debrief after Deep Mine: what the win changed", "Nachbesprechung nach Tiefenmine: was der Sieg verändert hat"],
    direction: ["Soft and happy: they are safe.", "Sanft und glücklich: sie sind in Sicherheit."],
    max: 2.8
  }),
  live("pip.debrief.drill.weapon", 'pip', 'debrief', {
    when: ["Debrief after Deep Mine: the copied weapon's card", "Nachbesprechung nach Tiefenmine: die Karte der kopierten Waffe"],
    direction: ["Gleeful on 'boom', then a conspirator's tip.", "Vergnügt bei 'Bumm', dann ein verschwörerischer Tipp."],
    params: { weapon: "weapon.drillBomb.name" },
    max: 3
  }),
  live("pip.debrief.drill.next", 'pip', 'debrief', {
    when: ["Debrief after Deep Mine: the camera travels to Tidewater Locks", "Nachbesprechung nach Tiefenmine: die Kamera fährt zu Gezeitenschleusen"],
    direction: ["Matter-of-fact; no drama on 'Very tough'.", "Sachlich; kein Drama bei 'Sehr hart'."],
    params: { sector: "sector.tide" },
    max: 3
  }),
  live("pip.debrief.drill.boss", 'pip', 'debrief', {
    when: ["Debrief after Deep Mine: what the Master of Tidewater Locks has done", "Nachbesprechung nach Tiefenmine: was der Meister von Gezeitenschleusen angerichtet hat"],
    direction: ["Concerned; the water keeps rising as he says it.", "Besorgt; das Wasser steigt, während er es sagt."],
    params: { boss: "boss.tideMaster" },
    max: 3
  }),
  live("pip.debrief.drill.tip", 'pip', 'debrief', {
    when: ["Debrief after Deep Mine: how to beat the next Master", "Nachbesprechung nach Tiefenmine: wie der nächste Meister zu schlagen ist"],
    direction: ["Light and bouncy; 'Pop' pops.", "Leicht und federnd; 'platzen' platzt."],
    max: 2.8
  }),
  live("pip.debrief.tide.won", 'pip', 'debrief', {
    when: ["Debrief after Tidewater Locks: what the win changed", "Nachbesprechung nach Gezeitenschleusen: was der Sieg verändert hat"],
    direction: ["Content, like watching a tap run clear.", "Zufrieden, wie wenn ein Hahn wieder klar läuft."],
    max: 2.8
  }),
  live("pip.debrief.tide.weapon", 'pip', 'debrief', {
    when: ["Debrief after Tidewater Locks: the copied weapon's card", "Nachbesprechung nach Gezeitenschleusen: die Karte der kopierten Waffe"],
    direction: ["Amused by the idea; a small laugh in 'hates bubbles'.", "Amüsiert von der Idee; ein kleines Lachen in 'hasst Blasen'."],
    params: { weapon: "weapon.bubbleLance.name" },
    max: 3
  }),
  live("pip.debrief.tide.next", 'pip', 'debrief', {
    when: ["Debrief after Tidewater Locks: the camera travels to Blackout Boulevard", "Nachbesprechung nach Gezeitenschleusen: die Kamera fährt zu Blackout-Boulevard"],
    direction: ["Hushed on 'dark rooftops'; he does not like the dark.", "Gedämpft bei 'die dunklen Dächer'; er mag die Dunkelheit nicht."],
    params: { sector: "sector.neon" },
    max: 3.2
  }),
  live("pip.debrief.tide.boss", 'pip', 'debrief', {
    when: ["Debrief after Tidewater Locks: what the Master of Blackout Boulevard has done", "Nachbesprechung nach Gezeitenschleusen: was der Meister von Blackout-Boulevard angerichtet hat"],
    direction: ["A little sad: the city has gone dark.", "Ein wenig traurig: die Stadt ist dunkel geworden."],
    params: { boss: "boss.neonMaster" },
    max: 2.8
  }),
  live("pip.debrief.tide.tip", 'pip', 'debrief', {
    when: ["Debrief after Tidewater Locks: how to beat the next Master", "Nachbesprechung nach Gezeitenschleusen: wie der nächste Meister zu schlagen ist"],
    direction: ["Draw the blade's path with the voice: out, and back.", "Die Bahn der Klinge mit der Stimme zeichnen: hin, und zurück."],
    max: 3
  }),
  live("pip.debrief.neon.won", 'pip', 'debrief', {
    when: ["Debrief after Blackout Boulevard: what the win changed", "Nachbesprechung nach Blackout-Boulevard: was der Sieg verändert hat"],
    direction: ["Dreamy for a second; he loves the lights.", "Einen Moment verträumt; er liebt die Lichter."],
    max: 2.6
  }),
  live("pip.debrief.neon.weapon", 'pip', 'debrief', {
    when: ["Debrief after Blackout Boulevard: the copied weapon's card", "Nachbesprechung nach Blackout-Boulevard: die Karte der kopierten Waffe"],
    direction: ["Confident; he is handing over the right tool.", "Selbstsicher; er reicht das richtige Werkzeug."],
    params: { weapon: "weapon.neonBlade.name" },
    max: 3
  }),
  live("pip.debrief.neon.next", 'pip', 'debrief', {
    when: ["Debrief after Blackout Boulevard: the camera travels to Rotor Run", "Nachbesprechung nach Blackout-Boulevard: die Kamera fährt zu Rotorflug"],
    direction: ["Building up: one Master left.", "Steigernd: nur noch ein Meister."],
    params: { sector: "sector.rotor" },
    max: 3
  }),
  live("pip.debrief.neon.boss", 'pip', 'debrief', {
    when: ["Debrief after Blackout Boulevard: what the Master of Rotor Run has done", "Nachbesprechung nach Blackout-Boulevard: was der Meister von Rotorflug angerichtet hat"],
    direction: ["Looking up, a bit overwhelmed by how many.", "Schaut nach oben, etwas überwältigt von der Menge."],
    params: { boss: "boss.rotorMaster" },
    max: 2.8
  }),
  live("pip.debrief.neon.tip", 'pip', 'debrief', {
    when: ["Debrief after Blackout Boulevard: how to beat the next Master", "Nachbesprechung nach Blackout-Boulevard: wie der nächste Meister zu schlagen ist"],
    direction: ["Brisk coaching; lean on 'Slide'.", "Zügiges Coaching; Betonung auf 'Rutsch'."],
    max: 2.8
  }),
  live("pip.debrief.rotor.won", 'pip', 'debrief', {
    when: ["Debrief after Rotor Run: what the win changed", "Nachbesprechung nach Rotorflug: was der Sieg verändert hat"],
    direction: ["Proud: the last supply line works for the city.", "Stolz: die letzte Versorgungslinie arbeitet für die Stadt."],
    max: 2.8
  }),
  live("pip.debrief.rotor.weapon", 'pip', 'debrief', {
    when: ["Debrief after Rotor Run: the copied weapon's card", "Nachbesprechung nach Rotorflug: die Karte der kopierten Waffe"],
    direction: ["Fond of the little drones; they are a bit like him.", "Mag die kleinen Drohnen; sie sind ein bisschen wie er."],
    params: { weapon: "weapon.droneSwarm.name" },
    max: 3
  }),
  live("pip.debrief.rotor.next", 'pip', 'debrief', {
    when: ["Debrief after Rotor Run: the camera travels to Vex Fortress", "Nachbesprechung nach Rotorflug: die Kamera fährt zu Festung Vex"],
    direction: ["Slower and steadier than usual; a breath before 'The toughest'.", "Langsamer und ruhiger als sonst; ein Atemzug vor 'Härter'."],
    params: { sector: "sector.fortress" },
    max: 3
  }),
  live("pip.debrief.rotor.boss", 'pip', 'debrief', {
    when: ["Debrief after Rotor Run: what the Master of Vex Fortress has done", "Nachbesprechung nach Rotorflug: was der Meister von Festung Vex angerichtet hat"],
    direction: ["Brave for a small bot; a little triumphant.", "Mutig für einen kleinen Bot; ein wenig triumphierend."],
    params: { boss: "boss.vexMk1" },
    max: 3
  }),
  live("pip.debrief.rotor.tip", 'pip', 'debrief', {
    when: ["Debrief after Rotor Run: how to beat the next Master", "Nachbesprechung nach Rotorflug: wie der nächste Meister zu schlagen ist"],
    direction: ["Caring and practical: the last piece of advice before the big one.", "Fürsorglich und praktisch: der letzte Rat vor dem großen Kampf."],
    max: 3
  }),
  live("pip.debrief.go", 'pip', 'debrief', {
    when: ["Every debrief: the last line, then the Lab", "Jede Nachbesprechung: die letzte Zeile, dann das Labor"],
    direction: ["A cheerful send-off; practical on 'gear up', cosy on 'I'll mind the lab'.", "Ein fröhlicher Abschied; praktisch bei 'Rüste dich aus', gemütlich bei 'Ich hüte das Labor'."],
    max: 2.8
  })
]

// ── Atlas: the lesson rooms and the stage hints the catalogue missed ──
// Live in the game (their text is in the locales) but never voiced: the gold
// "Let's train..." intros, the nudges for a stuck player, and eleven stage tips.
const ATLAS_LESSONS: VoiceLine[] = [
  live('atlas.train.charge', 'atlas', 'fieldWarn', {
    when: ['A lesson room: the Charge Shot (the first room of the tutorial)', 'Ein Übungsraum: der Ladeschuss (der erste Raum des Tutorials)'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.4
  }),
  live('atlas.train.block', 'atlas', 'fieldWarn', {
    when: ['A lesson room: the Perfect Block', 'Ein Übungsraum: das Perfekte Blocken'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.4
  }),
  live('atlas.train.slide', 'atlas', 'fieldWarn', {
    when: ['A lesson room: the Slide', 'Ein Übungsraum: das Rutschen'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.2
  }),
  live('atlas.train.gel', 'atlas', 'fieldWarn', {
    when: ['A lesson room: the Repair Gel', 'Ein Übungsraum: das Reparaturgel'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.4
  }),
  live('atlas.train.gap', 'atlas', 'fieldWarn', {
    when: ['A lesson room: leaping a gap', 'Ein Übungsraum: über eine Lücke springen'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.6
  }),
  live('atlas.train.weapon', 'atlas', 'fieldWarn', {
    when: ['A lesson room: the special weapon just copied from a Master', 'Ein Übungsraum: die gerade kopierte Spezialwaffe eines Meisters'],
    direction: ['Bright, a coach starting practice.', 'Fröhlich, ein Trainer, der das Training beginnt.'],
    max: 2.4
  }),
  live('atlas.help.charge', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player has not managed a Charge Shot for a while', 'Eine Übung: dem Spieler gelingt seit einer Weile kein Ladeschuss'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 3.2
  }),
  live('atlas.help.block', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player has not managed a Perfect Block for a while', 'Eine Übung: dem Spieler gelingt seit einer Weile kein Perfektes Blocken'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 3.5
  }),
  live('atlas.help.blockMiss', 'atlas', 'fieldWarn', {
    when: ['The block lesson: a shot just hit the player, who did not raise the shield (again after each miss)', 'Die Blocken-Übung: ein Schuss hat den Spieler getroffen, der den Schild nicht gehoben hat (nach jedem Fehlversuch wieder)'],
    direction: ['Urgent but encouraging, a coach calling it out mid-drill.', 'Eindringlich, aber ermutigend, ein Trainer, der mitten in der Übung ruft.'],
    max: 3.4
  }),
  live('atlas.help.slide', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player keeps getting caught by the ring', 'Eine Übung: der Ring erwischt den Spieler immer wieder'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 3.2
  }),
  live('atlas.help.gel', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player has not used the Repair Gel yet', 'Eine Übung: der Spieler hat das Reparaturgel noch nicht benutzt'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 2.4
  }),
  live('atlas.help.gap', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player has not leapt the gap yet', 'Eine Übung: der Spieler ist noch nicht über die Lücke gesprungen'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 3.2
  }),
  live('atlas.help.weapon', 'atlas', 'fieldWarn', {
    when: ['A lesson: the player has not fired the new weapon at the drones', 'Eine Übung: der Spieler hat die neue Waffe noch nicht auf die Drohnen gefeuert'],
    direction: ['Patient coaching, never impatient.', 'Geduldig, wie ein Trainer, nie ungeduldig.'],
    max: 3
  }),
  live('atlas.hint.rotor.board', 'atlas', 'fieldWarn', {
    when: ['Rotor Run: the quadcopter lifts off with Flux on it', 'Rotorflug: der Quadrokopter hebt mit Flux ab'],
    direction: ['Gleeful, taking the controls.', 'Vergnügt, übernimmt die Steuerung.'],
    max: 2.4
  }),
  live('atlas.hint.neon.kick', 'atlas', 'fieldWarn', {
    when: ['Blackout Boulevard: the first wall-kick shaft', 'Blackout Boulevard: der erste Wandsprung-Schacht'],
    direction: ['Coaching, picking up speed on "Again!".', 'Wie ein Trainer, bei "Nochmal!" schneller.'],
    max: 3.5
  }),
  live('atlas.hint.neon.switch', 'atlas', 'fieldWarn', {
    when: ['Blackout Boulevard: the first light switch', 'Blackout Boulevard: der erste Lichtschalter'],
    direction: ['A quick tip, pointing.', 'Ein schneller Tipp, zeigt hin.'],
    max: 2.8
  }),
  live('atlas.hint.neon.blink', 'atlas', 'fieldWarn', {
    when: ['Blackout Boulevard: the first blinking light bridge', 'Blackout Boulevard: die erste blinkende Lichtbrücke'],
    direction: ['Quick, timing is everything.', 'Schnell, es kommt aufs Timing an.'],
    max: 2.6
  }),
  live('atlas.hint.tide.deep', 'atlas', 'fieldWarn', {
    when: ['Tidewater Locks: Flux wades into deep water', 'Gezeitenschleusen: Flux watet in tiefes Wasser'],
    direction: ['Alarmed, quick.', 'Alarmiert, schnell.'],
    max: 2
  }),
  live('atlas.hint.tide.valve', 'atlas', 'fieldWarn', {
    when: ['Tidewater Locks: the first flooded lock with a valve', 'Gezeitenschleusen: die erste geflutete Schleuse mit Ventil'],
    direction: ['A tactical tip.', 'Ein taktischer Tipp.'],
    max: 2.8
  }),
  live('atlas.hint.tide.rise', 'atlas', 'fieldWarn', {
    when: ['Tidewater Locks: the tide starts to rise', 'Gezeitenschleusen: die Flut beginnt zu steigen'],
    direction: ['Urgent, pointing up.', 'Dringend, zeigt nach oben.'],
    max: 2.4
  }),
  live('atlas.hint.drill.drop', 'atlas', 'fieldWarn', {
    when: ['Deep Mine: the first falling rocks', 'Tiefenmine: der erste Steinschlag'],
    direction: ['Quick warning, eyes up.', 'Schnelle Warnung, Blick nach oben.'],
    max: 2.4
  }),
  live('atlas.hint.drill.rock', 'atlas', 'fieldWarn', {
    when: ['Deep Mine: the first cracked rock in the way', 'Tiefenmine: der erste rissige Fels im Weg'],
    direction: ['A tactical tip.', 'Ein taktischer Tipp.'],
    max: 2.6
  }),
  live('atlas.hint.magnet.panel', 'atlas', 'fieldWarn', {
    when: ['Polarity Works: the first polarity plate', 'Polaritätswerk: die erste Polaritätsplatte'],
    direction: ['Sly, pointing out a trick.', 'Schlau, verrät einen Trick.'],
    max: 3
  }),
  live('atlas.hint.magnet.rail', 'atlas', 'fieldWarn', {
    when: ['Polarity Works: the first magnet rail', 'Polaritätswerk: die erste Magnetschiene'],
    direction: ['Calm, explaining.', 'Ruhig, erklärend.'],
    max: 3.5
  })
]

// ── Flux: the lines he blurts when a hard hit shakes his charge loose ──
const FLUX_FUMBLE: VoiceLine[] = ['1', '2', '3', '4', '5', '6'].map(n => live(`flux.fumble.${n}`, 'flux', 'barks', {
  when: ['A hard hit shook his charge loose: a wild shot, a flailing arm', 'Ein harter Treffer hat ihm die Ladung entrissen: ein wilder Schuss, ein zappelnder Arm'],
  direction: ['A friendly robot caught off guard: surprised, silly, never hurt.', 'Ein freundlicher Roboter, überrumpelt: überrascht, albern, nie verletzt.'],
  max: 1.6,
  loose: true
}))

/** The lines that need more than their section's defaults, and the ones with
 *  no text (barks, laughs, planned lines). */
export const VOICE_DETAIL: readonly VoiceLine[] = [
  ...ATLAS_LIVE, ...ATLAS_PLAN,
  ...ATLAS_HINT_BLAZE, ...ATLAS_HINT_CRYO, ...ATLAS_HINT_VOLT, ...ATLAS_HINT_GALE, ...ATLAS_SECRET,
  ...VEX, ...FLUX, ...FINALE, ...PIP, ...ATLAS_LESSONS, ...FLUX_FUMBLE
]

/** Who speaks a text line, by where it sits in the locales, and the defaults
 *  a line takes when `VOICE_DETAIL` says nothing more. The first match wins:
 *  `at` ending in "." is a section, otherwise a key (or a key's section). */
export interface SpeechRule {
  at: string
  speaker: Speaker
  scene: SceneId
  direction: Both
  tone: string
  max: number
}
export const SPEECH: readonly SpeechRule[] = [
  { at: 'story.atlas.', speaker: 'atlas', scene: 'intro', direction: ['Calm, warm, a first word to Flux.', 'Ruhig, warm, ein erstes Wort an Flux.'], tone: 'warm', max: 3 },
  { at: 'story.vex.', speaker: 'vex', scene: 'intro', direction: ['Theatrical, smug, enjoying himself.', 'Theatralisch, selbstgefällig, genießt es.'], tone: 'menacing', max: 3.5 },
  { at: 'story.gauss.', speaker: 'gauss', scene: 'intro', direction: ['Warm, tired, proud.', 'Warm, müde, stolz.'], tone: 'warm', max: 3.5 },
  { at: 'story.pip.', speaker: 'pip', scene: 'intro', direction: ['Chirpy and helpful.', 'Fröhlich und hilfsbereit.'], tone: 'warm', max: 3 },
  { at: 'story.flux.', speaker: 'flux', scene: 'intro', direction: ['A friendly robot, bright and eager.', 'Ein freundlicher Roboter, hell und eifrig.'], tone: 'cheeky', max: 2.5 },
  { at: 'ending.gauss', speaker: 'gauss', scene: 'ending', direction: ['Warm, tired, proud.', 'Warm, müde, stolz.'], tone: 'warm', max: 3.5 },
  { at: 'ending.spark', speaker: 'gauss', scene: 'ending', direction: ['Warm, tired, proud.', 'Warm, müde, stolz.'], tone: 'warm', max: 3.5 },
  { at: 'ending.atlas', speaker: 'atlas', scene: 'ending', direction: ['Calm, warm.', 'Ruhig, warm.'], tone: 'calm', max: 3.5 },
  { at: 'atlas.', speaker: 'atlas', scene: 'fieldWarn', direction: ['Warm and quick: a navigator who is also a friend.', 'Warm und flott: ein Navigator, der zugleich ein Freund ist.'], tone: 'neutral', max: 3 },
  { at: 'vex.', speaker: 'vex', scene: 'shift', direction: ['Theatrical, smug, enjoying himself.', 'Theatralisch, selbstgefällig, genießt es.'], tone: 'menacing', max: 3 },
  { at: 'pip.', speaker: 'pip', scene: 'debrief', direction: ['Chirpy and helpful, short plain sentences.', 'Fröhlich und hilfsbereit, kurze einfache Sätze.'], tone: 'warm', max: 3 },
  { at: 'flux.', speaker: 'flux', scene: 'barks', direction: ['A friendly robot, surprised and silly.', 'Ein freundlicher Roboter, überrascht und albern.'], tone: 'cheeky', max: 2 },
  { at: 'gauss.', speaker: 'gauss', scene: 'ending', direction: ['Warm, tired, proud.', 'Warm, müde, stolz.'], tone: 'warm', max: 3.5 }
]
/** Keys in a speaker's section that no code says any more. */
export const RETIRED: ReadonlySet<string> = new Set(['atlas.objective'])

const inRule = (key: string, at: string): boolean =>
  at.endsWith('.') ? key.startsWith(at) : key === at || key.startsWith(`${at}.`)
/** The rule a text line falls under, or undefined when nobody speaks it. */
export const speechRuleOf = (key: string): SpeechRule | undefined => SPEECH.find(r => inRule(key, r.at))

const leaves = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>)
  .flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : typeof v === 'string' ? [`${p}${k}`] : []))

/**
 * Every voice line: the detailed ones as written, then every other text line
 * of a speaker's section (in the source locale, English) with its section's
 * defaults. The result is the one list the game, the tests and the tools use.
 */
export const deriveVoiceLines = (source: unknown): VoiceLine[] => {
  const known = new Set(VOICE_DETAIL.map(l => l.key))
  const derived: VoiceLine[] = []
  for (const key of leaves(source)) {
    if (known.has(key) || RETIRED.has(key)) continue
    const r = speechRuleOf(key)
    if (!r) continue
    derived.push({
      key, speaker: r.speaker, scene: r.scene, status: 'live', max: r.max, tone: r.tone,
      when: [`A ${SPEAKERS[r.speaker].name} line with no notes yet (${key})`, `Eine Zeile von ${SPEAKERS[r.speaker].name} ohne Notizen (${key})`],
      direction: r.direction
    })
  }
  return [...VOICE_DETAIL, ...derived]
}

/** A key's file name, without the extension: `atlas.bossAhead` → `atlas_bossAhead`. */
export const fileName = (key: string): string => key.replace(/\./g, '_')

/** Where a line's finished file goes, and where its raw takes go. */
export const voicePath = (l: VoiceLine, lang: Lang): string =>
  `public/audio/voice/${l.neutral ? 'en' : lang}/${fileName(l.key)}.ogg`
export const rawPath = (l: VoiceLine, lang: Lang, take = 1): string =>
  `vo-src/raw/${l.neutral ? 'en' : lang}/${l.speaker}/${fileName(l.key)}_${take}.ogg`
