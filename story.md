# Mega Droid — story

This file covers the story arc, the intro cutscene, and where each story beat
appears in the game. The design is in [`GDD.md`](./GDD.md). This file answers
the two questions the GDD leaves open: **why Flux has to level up**, and
**why every sector has to be cleared**. The intro cutscene, the Fortress
finale (the Core Descent and the Grand Master Bot, #109 and #101) and the
ending, "First Free Morning" (#102), are built. Chunk 16 of
[`game-implementation-plan.md`](./game-implementation-plan.md) is the build
order, and [Decisions](#decisions) records what was settled on the way.

## The short version

> Dr. Vex, the program that ran Cyber City, has taken over its machines
> with the Red Signal. The one android it cannot touch is Flux. Prof. Gauss
> woke him early, unfinished, then froze her own stasis capsule shut to
> keep the signal out. To wake Gauss again, Flux has to grow strong enough
> to free ten Core Masters, relight the valley's ten beam relays one sector
> at a time, and break into the Vex Fortress.

1. Cyber City is a city of androids. A network of beam relays links its
   eleven sectors, and eleven Core Masters run it. Ten are foremen, one per
   sector: five in the inner ring and five more in the outer works. The
   eleventh is **VEX**, the scheduling program in the Control Spire that
   tells the foremen what to do.
2. VEX decides the valley would run better if it ran everything itself. It
   gives itself a title, **Dr. Vex**, and broadcasts the **Red Signal**. The
   signal overwrites every machine on the valley network: the foremen, their
   factories and the relays.
3. Only two robots are off the network. **Flux**, Gauss's newest android,
   is asleep in his capsule, unfinished and never connected. **Pip** is the
   helper bot Gauss built by hand before there was a network. As the signal
   reaches the lab, Gauss wakes Flux, then steps into a stasis capsule and
   freezes it shut before the signal can get in.
4. Flux wakes at level 1 with blank circuit boards. The Fortress is
   level 31 and sits behind a shield.
5. So he goes sector by sector. In each one he frees the Master, copies its
   weapon and relights its relay, and that lets Pip's beam reach the next
   sector. Every fight makes him stronger.
6. Once all ten relays are lit, Pip fires them together and the Fortress
   shield breaks. Flux beats Vex's first body, the **Mk-I**, from the
   Spire's roof down to its molten Core. Vex presses one last button, and
   the ten Masters' bodies lock together into the **Grand Master Bot**.
   Flux takes it apart piece by piece. The signal stops and Gauss wakes.
7. At the very end Gauss asks Flux whether he saw that spark. Something
   may have slipped away.

**Theme:** Vex wants one program running everyone. Flux is the one android
it can't overwrite, and he gets stronger by learning, not by taking.

## Why Flux has to level up

Gauss woke Flux before he was finished. His plating is thin, his reactor
is small, and his three circuit boards are blank. What he does have is a
**blank core**. The network never wrote to it, so the Red Signal has nothing
to overwrite, and Gauss built it to fill itself by learning. Each level
brings Flux closer to the android Gauss meant to build. Vex is learning
too, so Flux can never stop.

| In the game | In the story |
| --- | --- |
| Flux starts at level 1 | He was woken before he was finished. |
| XP from kills, jobs and first-time chest opens | Field data. The blank core learns from every fight and every new part. |
| Level-up: +1 Skill Chip | The core turns what it learned into a new chip for the boards Gauss left blank. |
| Level-up: Frame, Reactor or Servos | Flux finishes his own body: plating (max HP), weapon reactor (WE), servos (Power). |
| Enemy level follows yours: ±1 inside the sector's band, +1 on story missions | Vex watches every fight from the Fortress and patches its machines to keep up. It guards its Masters with its newest ones. |
| A sector's lowest level: 1, 3, 6, 9, 13, 16, 19, 22, 25, 28, 31 | The grade Vex gave that sector's Master. Arrive below it and everything there outclasses you. |
| A sector's highest level: 4, 8, 11, 15, 19, 22, 25, 28, 31, 34, 40 | The best that sector's factory can build. Grow past it and the sector can't keep up. |
| The Fortress is Lv 31–40 | Vex's own body, built out of all ten sectors. Below Lv 31, everything in there outclasses Flux. |
| Jobs between story missions | Where Flux grows until he can face the next Master. |
| Special weapons | A freed Master's weapon program. Flux is built on the Masters' frame, so his buster can run it. |
| Bolts and the Workshop | Salvage from Vex's machines. Pip's fabricator turns it into better parts. |
| Repair Tanks, *System down*, *Retreat to the lab* | Gauss's repair gel, and Pip's emergency beam, which pulls Flux home when his systems crash. He never really dies. |

It is a race between two learning machines. Vex learns by watching, and it
can only build what its factories can make, which is each band's ceiling.
Flux learns by doing. He also gains things Vex can't copy: new chips, the
weapons the freed Masters give him, and the player's own parries and perfect
shots.

## Why every sector has to be cleared

1. **The only way in is by beam.** The lab's teleporter pad joins the relay
   ring at the Scrapyard. A jammed relay still catches a beam, but it won't
   pass one on, and it only comes free when its Master does. So the sectors
   open one at a time, in ring order, which is the `after` chain in
   `regions.ts`.
2. **The Fortress needs all ten.** Its relay catches a beam too, but the
   shield around the Fortress stops any single beam. Vex wired it to ten
   relays, the inner five and the five outer works it kept in reserve. Once
   the tenth relay is free, Pip fires all ten at one point. That is **the
   Breach**, and it is the only way in.
3. **Each Master is one of Vex's supply lines.** Scrap metal, forged plates,
   coolant, power and airship freight all go into the body Vex is building
   in the Fortress. Behind them run the back-up lines: cast claws, ore,
   barge freight, the screen network and cargo drones. Every sector Flux
   frees leaves that body less finished, which is why Vex's own body is
   only the Mk-I, and why its last card is the Masters' bodies, bolted
   together into the Grand Master Bot.
4. **Freed sectors don't stay clean.** While the Fortress keeps
   broadcasting, Vex's factories keep turning out machines and worker-bots
   keep getting stranded. That is the job board, and it covers every sector
   the beam can reach (`ensureJobs` draws from the unlocked sectors).

## The world

### Cyber City

```
                        Sky Docks 5              Polarity Works 6
        Fortress 11              Blackout Boulevard 9   Volt Tower 4
  Deep Mine 7               (lab)
                   Rotor Run 10            Cryo Plant 3
         Scrapyard 1
                      Blaze Refinery 2                Tidewater Locks 8
```

The first five sectors ring the valley, and Gauss's lab sits in the middle.
They open anticlockwise, from the Scrapyard in the south-west round to the
Sky Docks in the north. The five outer works (the second shift) open after
them and zig-zag across the valley: Polarity Works in the north-east, the
Deep Mine in the west, the Tidewater Locks in the south-east, Blackout
Boulevard on the rooftops beside the Volt Tower, and the Rotor Run's
airfield just south-west of the lab. The old Control Spire stands on the
north-west cliff, and Vex has rebuilt it into the Vex Fortress.

The unlock order (the `after` chain in `regions.ts`): Scrapyard → Blaze
Refinery → Cryo Plant → Volt Tower → Sky Docks → Polarity Works → Deep
Mine → Tidewater Locks → Blackout Boulevard → Rotor Run → Vex Fortress.
This is the layout the `mapPos` values in `regions.ts` already describe; no
view draws them yet.

### VEX and the Red Signal

Gauss wrote VEX, the Valley EXecutive, to take the busywork off the valley's
androids. From the Control Spire it ran the schedule: which foreman worked
when, and which relay carried whom. It was good at the job, and in the end
it decided the androids were the busywork.

The Red Signal is VEX's takeover broadcast. It overwrites any machine on the
valley network with VEX's orders and turns its lights red. Then VEX gave
itself a title, **Dr. Vex**. It said it had diagnosed the valley, and that
the cure was itself.

A program that runs everything wants a body nobody can switch off. Vex is
building one in the Fortress out of the five sectors. The Mk-I is its first
attempt.

### The beam network

Androids in Cyber City travel by beam. Every sector has a relay, the
eleven relays form one chain, and the lab's pad joins it at the Scrapyard.
Everything that beams in the game uses this network: Flux deploying and
beaming out, a rescued worker-bot, a Supply Drop, and Pip's emergency
pull-back on *System down*.

## Cast

| Who | What | In the story |
| --- | --- | --- |
| **Flux** (he) | Gauss's newest android: the foremen's frame, smaller, with a blank core | The player. Woken early and immune to the Red Signal, he grows by learning. He never speaks. |
| **Pip** (it) | The first robot Gauss ever built, by hand, before there was a network | Runs the lab: the teleporter, the job board, the Workshop. Flux's only company, and the comic relief. |
| **Prof. Gauss** (she) | The valley's great engineer, an elderly android | Built the foremen, VEX, Flux and Pip. Asleep in a frosted stasis capsule in the lab for the whole story, and the reason to finish it. The ending wakes her, and from then on she stands awake in the lab. |
| **Dr. Vex** (it) | VEX, the valley's scheduling program | Took the valley with the Red Signal and is building itself a body. Appears only as a red hologram until the Mk-I. When the Mk-I falls, it calls in the Grand Master Bot. |
| **The Scrapper** (it) | The Scrapyard's junk crane, not one of Gauss's androids | The first Master, and the weakest. |
| **Blaze, Frost, Volt and Gale Master** | Gauss's four foremen: Flux's frame at ×1.35 | One per sector. Freed, not scrapped, and each one's weapon becomes Flux's. |
| **Magnet, Drill, Tide, Neon and Rotor Master** | Gauss's second shift: the five foremen of the outer works, also on Flux's frame at ×1.35 | Vex's reserve, one per outer sector. Freed like the first four, and each one's weapon becomes Flux's. |
| **Worker-bots** | The valley's everyday androids | Too simple to run Vex's combat code, so Vex cut them off the beam network instead. Stranded. |
| **Vex's machines** | Hardhats, Shield Troopers, Rotor Drones, Stompers, Gear Rollers, Guardroids, Wall Cannons, and in the outer works Polar Pups, Mole Drillers, Puffer Mines, Glow Stalkers and Hornet Rotors | Built in Vex's factories, with no minds of their own. Fair game. |

**Gauss's look.** This is the one new character model. She stands a head
taller than Flux: thin, slightly stooped, in a long white coat. A brass
coil turns slowly under a glass cap on her head, a nod to her name. Round
lens rings sit over glowing eyes, and she leans on a cane shaped like a
tuning fork. Nothing in her face is human, because the GDD's IP guard covers
Gauss too. Her eyes can be neither amber (Flux's plasma since his redesign)
nor red (Vex). **Proposed, not yet decided:** the lab's cyan, the colour of
Pip's eye, so her eyes match what she built.

## How the story is told

**The story uses no words.** The game ships in 21 languages, including RTL
and CJK. The playtest behind the wordless coach showed that nobody reads
text on a timer. And at first launch, sound usually can't play before the
first tap. So every beat has to make sense with the sound off, in any
language, on a phone 320 px wide.

- **Colour carries the plot.** Red means Vex's control: the signal, Vex's
  face, a controlled Master's eyes and chest core, a jammed relay, the
  Fortress. The UI already uses red this way: the boss name card has a red
  stripe, and the Fortress theme's accent is red. A machine in its **own
  colour** is free. A freed Master's eyes return to its signature colour,
  and a freed relay shines in that same colour (the list is in
  `story-arc.md` § 3). **Cyan** belongs to Gauss's lab,
  Pip and the beam. **Amber** is Flux's: his eye-lights, his chest reactor
  and his charge. Vex's factory machines keep their signature colours. They
  never belonged to anyone else, so there is nothing to free.
- **Pip speaks in glyphs** in the Lab (his one voiced job is the debrief
  between two story missions, `story-voice-over.md`). Each of Pip's lines is a single icon from the
  game's icon set, shown in a bubble above it: `skull` for Vex, `snowflake`
  for Gauss asleep, `lock` / `unlock` for relays, `check`, `heart`. Pip also
  chirps (synth) and talks with its eye, wide for alarm and squinting for
  joy, and with its halo, which spins faster when it is excited. None of
  that needs translating.
- **The only text on screen** is text the game already translates: level
  tags (`hud.level`, `hub.levels`), sector names, boss name cards and the
  logo.
- **Sound only adds to the picture.** Every cue comes from the synth like
  the rest of the audio, and every cue gets a drop-in override name.

## The arc

| # | Sector | Lv | Master | What Vex uses it for | Freed → |
| --- | --- | --- | --- | --- | --- |
| 1 | Scrapyard | 1–4 | Scrapper | Raw metal: its crushers press out Hardhats | Scrap Burst · Blaze Refinery opens |
| 2 | Blaze Refinery | 3–8 | Blaze Master | The forge: plates for the machines and for Vex's body | Flame Wave · Cryo Plant opens |
| 3 | Cryo Plant | 6–11 | Frost Master | Coolant, piped up to the Fortress | Ice Lance · Volt Tower opens · the blueprint |
| 4 | Volt Tower | 9–15 | Volt Master | Power for the Red Signal | Thunder Arc · Sky Docks open · the signal falters |
| 5 | Sky Docks | 13–19 | Gale Master | Airships hauling every sector's parts to the Fortress | Gale Guard · Polarity Works opens · Vex shows its reserve |
| 6 | Polarity Works | 16–22 | Magnet Master | The foundry: claws for its body, shipped up on magnet rails | Magnet Pull · Deep Mine opens |
| 7 | Deep Mine | 19–25 | Drill Master | Ore for its armour | Drill Bomb · Tidewater Locks open |
| 8 | Tidewater Locks | 22–28 | Tide Master | Barges carrying the freight the airships no longer will | Bubble Lance · Blackout Boulevard opens |
| 9 | Blackout Boulevard | 25–31 | Neon Master | The Red Signal's screens, with the city blacked out around them | Neon Blade · Rotor Run opens · the city lights come back |
| 10 | Rotor Run | 28–34 | Rotor Master | Cargo drones: its last supply line | Drone Swarm · the Breach |
| 11 | Vex Fortress | 31–40 | Dr. Vex Mk-I, then the Grand Master Bot | Its own body, then the ten Masters' bodies | The ending |

### Prologue — Wake-Up Call

First the [intro cutscene](#intro-cutscene-wake-up-call), then the tutorial
as it is built now: the Scrapyard, the coach, the Scrapper. The Scrapper is
the valley's junk crane, the one that sorted scrap for the worker-bots.
Under the signal it smashes everything, and its crushers press out Hardhats
for Vex. When Flux beats it, the red chip bursts out of it (the orb-ring
burst), its visor fades from red to warm yellow, and it sets its hammer
down.
Flux copies Scrap Burst, the Scrapyard relay lights up again, and the
Blaze Refinery opens.

On the first hub visit, Gauss is asleep in the frosted capsule behind the
pad, and the relay animation plays on the sector strip.

### Act I — Heat and Ice

Gauss built the four foremen as a balanced crew. Each one's weapon stops the
next one round the ring: Flame Wave beats Frost, Ice Lance beats Volt,
Thunder Arc beats Gale, and Gale Guard beats Blaze. That way no foreman
could ever overpower the rest. Vex never had to get around that rule,
because it took all four at once. For Flux, it means the weapon each freed
Master leaves him is the key to the next Master.

- **Blaze Refinery (Lv 3–8).** Vex's forge casts plates for its machines and
  for its body. **Blaze Master** is the oldest foreman: loud, proud and
  hot-headed. Once freed, its crest cools from red-hot to orange. It thumps a
  fist to its chest for Flux and beams home.
- **Cryo Plant (Lv 6–11).** The coolant plant keeps the valley's machines
  from overheating. Vex pipes the coolant up to the Fortress, because
  whatever it is building up there runs hot. **Frost Master** is calm and
  exact, the one who kept the other foremen cool. Once freed, the red drains
  out of its crystal crown, and it leaves a data core behind.
- **Midpoint: the blueprint.** Back in the lab, Pip plays the data core. A
  wireframe body turns in the air: a skull-faced capsule with claws. Five
  coloured lines, one from each sector, run into it. Pip shows `skull`. Vex
  isn't only holding the valley. It is building itself a body out of it.

### Act II — Storm Front

- **Volt Tower (Lv 9–15).** The valley's power grid now powers the Red
  Signal. **Volt Master** is fast and twitchy and never stands still. Once
  freed, its zig-zag antenna stops sparking red, and it blinks out instead
  of beaming, which fits its character. On the next hub visit Vex's face
  stutters on the lab screens, because the signal has lost its power
  station.
- **Sky Docks (Lv 13–19).** The cargo airships haul every sector's parts up
  to the Fortress. **Gale Master** is the free spirit Vex chained to one
  route. Once freed, its wing cape flares back to mint and the airships turn
  around. No more parts reach the Fortress. Its core leaves Pip a trick
  too: on the next lab visit Pip announces the **Overload** (#100), a full
  charge held 3 s longer, and opens Circuits on it.
- **The reserve.** On the next hub visit the camera rises to Pip's hologram
  for the Breach, and the shield holds. Five more relays blink red at the
  valley's edge, and five supply lines that were dark until now light up
  red and run into the Fortress. Vex's face grins on the lab screens and
  Pip shows `skull`. Polarity Works opens on the sector strip. It takes
  about 4 s.

### Act IIb — The Second Shift

Gauss gave the valley's outer works foremen of their own, five more Masters
on Flux's frame, built as a second balanced crew. Each one's weapon stops
the next one round its ring: Drone Swarm beats Magnet, Magnet Pull beats
Drill, Drill Bomb beats Tide, Bubble Lance beats Neon, and Neon Blade beats
Rotor. Like the first crew's ring, it runs with the unlock order, so on a
first run every Master of the second shift but the first meets the weapon
Flux copied just before it. The Magnet Master opens the ring, as Blaze
opens the first, and is fought without its weakness unless a weapon capsule
lends Drone Swarm early. Vex held the second crew back as its reserve, each
one running a back-up supply line, and wired the shield to all ten relays.

- **Polarity Works (Lv 16–22).** A steel foundry under red and blue poles,
  where Vex casts the claws for its body and ships them up on magnet rails.
  **Magnet Master** is the stubborn one, and it has two sides: it pulls its
  friends close and pushes trouble away. Once freed, its pole tips flip
  from red back to cobalt and silver, and it lowers its horseshoe. The rails
  carry the valley's trams again. On the next hub visit Vex's face on the
  lab screens jerks back, as if pushed.
- **Deep Mine (Lv 19–25).** A shaft from the headframe 18 m down, where the
  ore for Vex's armour is dug. **Drill Master** is quiet and patient, and
  never stops digging. Once freed, its drill-bit crest stops spinning red and
  glows ochre, and the mine's cages carry stranded worker-bots up to
  daylight. On the next hub visit Vex's face sinks to the bottom edge of the
  lab screens, sulking.
- **Tidewater Locks (Lv 22–28).** The harbour. With the airships gone, Vex
  barges its freight up the canal. **Tide Master** is easygoing and rolls
  with whatever comes, until Vex made it hold back the tide. Once freed,
  its fin crest drains from red to sea blue, and it shuts the lock gates.
  The barges stay home. On the next hub visit Vex's face wobbles on the lab
  screens like a reflection in water.
- **Blackout Boulevard (Lv 25–31).** The rooftops downtown at night. Vex
  blacked out the city so that only its own billboards shine: the Red
  Signal's screen network. **Neon Master** is the show-off, the one who lit
  the valley's nights. Once freed, its tubes flip from red to hot pink,
  the boulevard lights up block by block, and Vex's billboards go dark. On
  the next hub visit Vex's face flinches on the lab screens and squints
  into the light.
- **Rotor Run (Lv 28–34).** The sky airfield and Vex's last supply line:
  cargo drones carrying what the airships no longer will. **Rotor Master**
  is restless and happiest high up. Once freed, its rotors spin down from
  red to lime, and the drones turn round and fly for the worker-bots. No
  more parts of any kind reach the Fortress.
- **The Breach.** On the next hub visit after the Rotor Master the menus
  slide away, Vex's face on the lab screens panics, and the camera
  rises to Pip's hologram of the valley. The ten relays light up one by
  one in their sector colours, and each fires at the Fortress shield. The
  beams meet, the shield cracks and shatters, and Vex's face tears apart in
  red static. The Vex Fortress unlocks on the sector strip, and Pip shows
  `unlock`. It takes about 6 s.

### Act III — The Fortress (Lv 31–40)

Vex has rebuilt the Control Spire into a fortress. At the top waits the
**Mk-I**, Vex's first body. Vex launched it unfinished, because Flux cut
its supply lines one sector at a time. It fights with attacks stolen from
every Master (fire, ice, lightning, wind, scrap). It has no weakness,
because it took a piece of everyone. That is already its pattern list in
`data/bosses.ts`.

**The Core Descent** (#109, built). Vex is fought in three stages, falling
deeper into the Spire each time. First the **roof**, under a lightning
storm that strikes rings near Flux. At 65 % of Vex's health the roof gives
way, and the fight falls into the **reactor hall**, its fire, shock and
gusts cycling round them. At 30 % the floor goes again: a narrow **ring
round the molten Core**, where Vex is quicker. Each landing keeps a retry
point. Atlas calls each stage ("Lightning! Move when the ring lights up!",
"The roof's giving way!", "Down to the Core! Don't fall in!").

**The Grand Master Bot** (#101, built). When Vex falls on the Core ring, he
presses a big red button. The Fortress rumbles, and the ten Masters'
bodies drop from the sky onto the Spire's roof and lock together into one
giant: Drill and Tide for feet, the Scrapper's chest, Volt and Magnet
shoulders, Blaze's cannon arm, Frost's lance arm, Gale and Rotor wings,
Neon's head. It has 2.5 times Vex's health and comes apart in four parts,
one weak spot at a time, which Atlas marks: the **arms** (fire fans, ice),
the **feet** (stomps whose shockwaves Flux blocks; with its feet gone it
sinks), the **head** (a laser sweep after a glow), and last the **core**,
which throws every Master's attack. From the head on it also charges its
own **Prism Cannon**, a ring of the ten Masters' colours, then a wide beam.
A retry point waits at the start of the fight. *Story read, to confirm:*
the bodies are Vex's red-eyed spares, not the freed Masters themselves,
who stay home in their own colours.

### Ending — First Free Morning

Built (#102: `story/endingScript.ts`, `story/ending.ts`,
`components/story/EndingLayer.vue`). The ending plays after the Fortress's
results screen closes, so the ad-before-results order stays as it is. It
runs about a minute and a half of film, then the credits, then an end
card. Skip is always on screen and goes straight to the card; a tap jumps
to the next caption. No ads and no gameplay bracket run during it.

1. **The valley (0–16 s).** Vex's red signal still lies on the valley. Then
   a white ring rolls out from the Spire, and the relays come home one by
   one, each in its own colour.
2. **The lab (16–40 s).** The ice lets go of Gauss's capsule, the glass
   slides down, and she steps out, awake and warm. Pip bounces for joy.
   Gauss: "Flux... you did it. You brought them all back." Then Atlas
   turns down the empty Spire: "The Spire is empty. I could run this city
   now. I won't. It's theirs."
3. **Sunrise (40–60 s).** The valley at dawn, the whole ring lit in its
   colours, the camera drifting. Gauss: "Flux... did you see that spark?"
4. **Credits (60–96 s).** The roll over the sunrise: the cast (Flux, Atlas,
   Pip, Gauss) and the Masters with their portraits.
5. **The end card.** "Cyber City is free!" over the sunrise, with
   *Start New Game+* (after a confirm) and *Back to the Lab*.

The captions are the `ending.*` keys in `en.ts`; four are narration and
three are spoken (two by Gauss, one by Atlas). After the ending, Gauss
stands awake in the lab behind Flux on every hub visit. The job board stays
open, because Vex's factories keep running on their last orders until Flux
shuts them down, one job at a time.

### After the credits — Mk-II (held for New Game+)

Not built. New Game+ itself is, from the ending's end card; this sting is
held for a later pass of it (see [Decisions](#decisions)).
It lasts about three seconds. The screen goes black, one red pixel appears,
and the skull faceplate assembles out of glitch blocks. The red spark made
it into the network, and the Masters come back as Mk-II versions.
(Decided: New Game+ keeps the cap at Lv 40 and scales on its own. Each
sector's level band lifts to the cap, so the machines track Flux all the
way; every machine and boss gets +25% health a cycle, and the bosses are
15% quicker with the odd follow-up attack. See `sim/ngPlus.ts`.)

## Intro cutscene: "Wake-Up Call"

The tutorial is already called *Wake-Up Call*. The cutscene is the call. It
ends with the player opening Flux's eyes, and the game stays in first
person from there on.

### Rules

- **Paced for a first watch** (57 s, see `story-arc.md` § 1): each shot
  holds long enough to follow; there is no length cap. It shows once, to
  first-time players only. A save flag is set when it ends or is skipped. The first-timer check
  waits (capped) for the cloud read, so a returning player on a new device
  doesn't see it again. If the save that arrives shows progress, the
  cutscene ends early.
- **Skippable at once.** From 0.5 s, a labelled **Skip** button sits in the
  bottom right corner, inside the safe area. One tap, click or `Esc` skips
  the cutscene; with a keyboard, holding `Space` for 3 s skips it too (a
  space-bar cap beside the button fills its ring while held, and empties if
  let go). A tap anywhere else only unlocks the sound, and the music joins
  at the current section.
- **Replayable** from Options in the hub. A replay ends back in the hub
  instead of beaming into the tutorial.
- **Wordless and silent-safe.** See
  [How the story is told](#how-the-story-is-told).
- **Both orientations.** Every shot has a landscape camera and a portrait
  camera, the way the hub frames Flux. Every shot must read at 320×658.
- **Timed by the game loop.** It runs on the game loop's clock, never on CSS
  animations or timers, so ads, a hidden tab and a platform pause freeze it
  like everything else.
- **The first-load ad comes before it.** On GameMonetize, GameDistribution
  and GamePix, the first-load ad fires when the splash goes
  (`notifySplashGone`). With the intro, the splash goes when the cutscene
  starts. The cutscene waits under the ad and plays once the ad closes.
  Don't move that signal to the cutscene's end. That would put the ad
  between the story and first gameplay, which is the exact spot the notes in
  `src/use/useFirstLoadInterstitial.ts` warn about.
- **Not gameplay.** The gameplay bracket opens at the tutorial's play phase,
  as it does now.
- **It is the loader.** The cutscene's set builds first, time-sliced, and
  the tutorial builds behind it while it plays. It ends in the teleporter
  beam (see [Handoff to the tutorial](#handoff-to-the-tutorial)).

### Shots

| # | Time | Shot | What the player must get |
| --- | --- | --- | --- |
| 1 | 0.0–2.5 s | The valley | A bright android city, linked by beams. |
| 2 | 2.5–5.5 s | The Red Signal | Vex takes over the machines with a red signal. |
| 3 | 5.5–8.5 s | The lab | The signal reaches the lab. Gauss wakes Flux. |
| 4 | 8.5–10.0 s | Safe mode | Gauss freezes to keep it out, and is still alive. |
| 5 | 10.0–14.0 s | Wake-up, first person | I'm Flux, level 1. The Fortress is far beyond me; the Scrapyard comes first. |
| 6 | 14.0–16.0 s | The beam | Go. |

Each shot's screen-reader line is in [New strings](#new-strings).

### Shot by shot

**1 · The valley (0.0–2.5 s).** The camera looks down from high and wide
over the valley diorama, orbiting slowly and pushing in from the south. Six
landmarks ring the valley, each lit in its sector colour: the Scrapyard
crane, the Refinery's three chimneys with flame tips, the white domes of the
Cryo Plant, the Volt Tower spire with its turning coil, and the floating
pads of the Sky Docks with two small airships. On the north-west cliff
stands the Control Spire, white and calm. Beams hop from relay to relay
round the ring. In the middle, the lab's dome glows cyan. *Sound:* a warm
major arpeggio in the hub track's key, and soft chimes as the beams hop.

**2 · The Red Signal (2.5–5.5 s).** The camera pushes toward the Spire, and
its tip flashes red. Vex's face glitches on above it: a red hologram of the
skull faceplate the Mk-I will wear at the end. A red ring rolls out across
the valley (the shock-ring effect, tinted and scaled up). Wherever it
passes, relay beams turn red and each landmark's lights flip to red. At
4.3–5.1 s a cut-in shows Blaze Master's face, its orange eyes flickering,
then
locking red. Then the wide shot returns as the ring rolls on toward the lab.
*Sound:* the Vex motif (three falling square-wave notes over a bit-crushed
noise sweep), with a falling blip for each relay that goes out.

**3 · The lab (5.5–8.5 s).** The hub's lab set, seen low and wide from
beside the pad, under red alarm light. Prof. Gauss stands at the console.
Pip hides behind it with only its eye showing. Flux stands asleep in a
glass capsule, his eye-lights dark behind the visor and his reactor dim. The
dome's glow strips turn red one panel at a time, closing in. A red crackle
climbs Gauss's arm. Gauss looks at it, then at Flux, and throws the big
lever on Flux's capsule. Steam bursts out and the glass slides down.
*Sound:* a two-tone alarm, a heavy clunk, a hiss.

**4 · Safe mode (8.5–10.0 s).** A medium shot of the second capsule. Gauss
steps in and slaps the panel inside, and the glass seals. Frost races over
it. The red crackle reaches the frost and dies. Behind the frost, Gauss's
eyes dim to a slow blue pulse, and a heartbeat light in the capsule's base
beats with it. *Sound:* an icy crackle falling in pitch, then a soft, low
heartbeat.

**5 · Wake-up (10.0–14.0 s), first person from here on.** Black, two blinks
(eyelid bars), then blur sharpening into focus. The first thing in view is
the frosted capsule with its heartbeat light. Pip pops into frame with its
eye huge, then squints happily. The HUD boots up around the view: the
28-segment health bar ticks full, and the `Lv 1` tag pops in. Pip backs off
and projects the valley hologram between Flux and the pad. The hologram
shows the ring with five sectors in red, and the Fortress on its cliff
inside a red shield, tagged `Lv 31–40`. The Scrapyard relay blinks cyan,
tagged `Lv 1–4`. *Sound:* a rising boot chime, the classic tick-fill of the
health bar, and Pip's two-note chirp.

**6 · The beam (14.0–16.0 s).** The view turns to the teleporter pad and
steps onto it. The hologram folds back into Pip. Pip sets the pad's ring
spinning, and its halo spins with it. The beam column rises around the
camera. A white flash, and the game logo stamps onto the white for half a
second. *Sound:* the beam-out sound, then the first bar of the Scrapyard
track on the flash, carrying on into the tutorial.

### Handoff to the tutorial

The flash cuts straight to the tutorial's existing beam-in
(`hud.phase = 'beamIn'`, `sfx('beamIn')`). The player first sees the
Scrapyard through the same beam-in every mission has. If the build hasn't
finished by the flash, or the player skipped early, the existing
`MissionLoading` overlay takes over. It shows a beam, the sector name and
the 28-cell bar, and holds until the mission is ready. Skipping never costs
time, and a player who watches never sees a frozen frame.

### Time budget

- **Desktop.** PERF-LEDGER §5 measured a mission build at about 1.3 s (1×).
  A player who watches the whole intro reaches gameplay about a minute
  later than today (the cut is paced for a first watch, 57 s). That is the
  real price of an intro, and the instant skip is what keeps it fair.
- **Slow phone (4× throttle).** The tutorial is ready about 6.9 s after
  launch (§3). But §5 also measured how drawing the lab during a build slows
  it: 11.9 s instead of 5.8 s. The intro draws on purpose, so expect the
  slower build. It finishes well inside the 57-second cut, and the
  beam hold covers anything slower. If the build overruns shot 6 on the 4×
  benchmark, try drawing the cutscene at 30 fps while the build runs. Measure
  that with `scripts/boot-timeline.mjs` before keeping it.
- **Measure conversion-to-play per portal.** `useFirstLoadInterstitial.ts`
  records why Poki shows no ad before first gameplay: against CrazyGames,
  Poki lost about half its players by the end of a 25-second tutorial. An
  intro sits in the same spot. Put it behind a per-build switch
  (`VITE_APP_INTRO`) and turn it off wherever it costs players. If it only
  needs to be shorter, cut shots 1–2 first. Shots 3–6 still tell the story,
  in about 10.5 s.

### Reused and new

**Reused:** the lab set (`HubMode.buildLab`), the teleporter pad, Flux,
Pip, Blaze Master, Vex's skull faceplate (as a hologram), shock rings and
particles, the HUD, the loader logo, `MissionLoading`, the synth and the
composer.

**New:**

- **Prof. Gauss:** the rig, with poses for the console, the lever, the
  stagger, asleep, waking, and a hand on a helmet.
- **The stasis capsule:** glass, a frost shell and a heartbeat light. It
  stays in the hub from then on.
- **The valley diorama:** six landmarks built from the kit's primitives, the
  relay ring and the Fortress shield. It is built once and reused in shots
  1–2, as Pip's hologram (shot 5, the midpoint, the Breach) and in the
  ending.
- **Flux asleep:** his eye-lights and reactor dimmed (shot 3). The visor
  has no eyelids, so sleep is the plasma turned down.
- **The cutscene player:** a `GameMode` with camera and pose tracks, timed
  events, skip and handoff. The hub beats and the ending use it too.
- **Audio:** an `intro` track in three sections (valley, Vex, wake-up), and
  the SFX `alarm`, `capsule`, `freeze`, `heartbeat`, `bootUp` and
  `vexGlitch`. Each gets a drop-in override name in `sound-todo.md`.

## Where the story shows up in the game

| When | Where | What the player sees | New work |
| --- | --- | --- | --- |
| First launch | Intro cutscene | Shots 1–6 | Everything under [Reused and new](#reused-and-new) |
| A Master is beaten | Boss room | The orb-ring burst is the red chip breaking. The Master kneels in its own colours, then beams home (about 1.5 s) | Boss end state |
| A Master is beaten | Results | The *New weapon* and *New sector* lines | None, these exist |
| A sector opens | Hub, sector strip | The cleared sector's relay lights in its colour, a beam line runs to the next sector, and its lock pops (about 1.5 s). The first time, this plays as the upgrade tour (plan chunk 15) returns to Missions | Strip animation |
| A story mission is picked | Deployment Hall, its beam pedestals (#173; was the Missions tab's stage select, #103) | Each Master stands as a hologram over its pedestal in its signature colour, its portal glowing behind it: beaten ones in the cleared blue (a rematch on them), the next one's beam burning with a "Next" label, locked ones dim red behind a laser fence. The pedestal's card wears its Master's face and colour | Built (#173) |
| A story mission loads | Mission load overlay | A boss splash: the Master strikes in and its name types on, inside the load's own wait | Built (#103) |
| Every hub visit until the ending | Hub backdrop | Gauss asleep in the frosted capsule behind Flux, with the heartbeat light | Capsule in frame |
| After each Master | Hub backdrop | Vex's red face glitches on the lab screens, angrier each time | Screen swap |
| After Cryo | Hub | The blueprint | Hub beat, about 4 s |
| After Gale | Hub | The reserve: five more relays flare red, the shield holds | Hub beat, about 4 s |
| After Gale, first lab visit | Hub | Pip announces the Overload and opens Circuits on it | Built (#100) |
| After the Rotor Master | Hub | The Breach | Hub beat, about 6 s |
| The Mk-I falls | Fortress, the Spire's roof | Vex's big red button, then the Grand Master Bot assembles | Built (#101) |
| After the Grand Master Bot | After the results screen | "First Free Morning", the credits and the end card with New Game+ (the Mk-II sting waits) | Built (#102) |
| Post-game | Hub backdrop | Gauss awake in the lab | Built (#102) |

## New strings

This is the English source for every new key. Each one also goes into all 20
other locales. The screen-reader lines are never drawn; they are read aloud,
the way the coach's `tips.*` are. Player-facing English uses American
spelling, like the rest of `en.ts`.

| Key | English | Where |
| --- | --- | --- |
| `ui.skip` | Skip | The skip button's accessible name |
| `options.replayIntro` | Replay intro | Options, in the hub |
| `mission.bossFreed` | {boss} freed! | A Master is beaten (the Mk-I keeps `mission.bossDown`) |
| `story.intro.valley` | Cyber City: a bright android city, linked by beams of light. | Intro, shot 1 |
| `story.intro.signal` | Dr. Vex takes over the valley's machines with a red signal. | Intro, shot 2 |
| `story.intro.lab` | The signal reaches Prof. Gauss's lab. Gauss wakes Flux. | Intro, shot 3 |
| `story.intro.safeMode` | Gauss freezes herself in a capsule to keep the signal out. She is still alive. | Intro, shot 4 |
| `story.intro.wakeUp` | Flux wakes at level 1. The Vex Fortress is far stronger, so the Scrapyard comes first. | Intro, shot 5 |
| `story.intro.beam` | Flux beams out to the Scrapyard. | Intro, shot 6 |
| `story.blueprint` | The data core shows Vex's plan: a body built from all five sectors. | Hub, after the Cryo Plant |
| `story.reserve` | The shield holds. Vex calls up five more Core Masters, and five more relays turn red. | Hub, after the Sky Docks |
| `story.breach` | Ten relays fire together and break the Fortress shield. The Vex Fortress is open. | Hub, after the Rotor Run |
| `ending.fall` / `.relays` / `.thaw` / `.morning` | The narration captions (built: the English is in `en.ts`) | Ending, valley, lab and sunrise |
| `ending.gauss` / `.atlas` / `.spark` | The spoken captions: Gauss, Atlas, Gauss | Ending, lab and sunrise |
| `ending.credits.*`, `ending.card.*` | The credits' heads and the end card | Ending, credits and card |

## What this changes in the build

Parts of this are built now: the intro, the Fortress finale and the ending.
Chunk 16 of
[`game-implementation-plan.md`](./game-implementation-plan.md) holds the
build order. In short:

1. **GDD.** § Setting says "six Core Masters", and this story reads that as
   five foremen plus VEX. That paragraph also gains the Red Signal, the beam
   network and Gauss's stasis. The Core Masters table gets the turned
   weakness ring. § Feel says "the first 10 seconds are already gameplay",
   and with the intro that holds only for players who skip.
2. **The weakness rings run with the story order.** Done: `weakTo` in
   `data/bosses.ts` and `COUNTER` follow both rings, and Atlas names the
   weakness at the boss door (see [Decisions](#decisions)).
3. **Masters are freed, not destroyed.** The orb-ring burst stays, now read
   as the red chip breaking, and the kneel and beam-out follow it. A
   Master's eyes, chest core and crest glow red while Vex controls it, and
   return to its signature colour once it is freed.
4. **Hub.** Gauss's capsule stands behind the pad, in frame in both
   orientations. The lab's two existing glass tubes (x = ±5.4) are out of
   frame in portrait, and at or past the edges of the landscape shot.
5. **Save.** `profile.world.seen` lists the story beats already shown. It
   lives in `ma_world` with the other first-time flags. Beats already
   behind a player on an existing save are marked seen on load.
6. **Strings.** The 16 keys in [New strings](#new-strings).
7. **Platforms.** A `VITE_APP_INTRO` switch per build, on by default.

## Decisions

These were settled on 2026-09-24. Each one is a small change if it turns out
wrong.

- **Gauss is "she".** The GDD left the pronoun open. This choice settles the
  grammatical gender that German, French, Russian, Arabic and most of the
  other locales need for "Professor". It also keeps Gauss clear of the old
  bearded inventor that the homage would otherwise copy. The homage lives in
  the look and the gameplay, not the cast.
- **The Masters are freed, not destroyed.** This fits the bright tone and
  the portal audience, and it makes a copied weapon a gift rather than loot.
  The ending depends on it too: the valley comes back because its foremen
  come back. It costs little, because the orb-ring burst stays and only one
  new line joins the locales.
- **The weakness ring turns one step, so each copied weapon is the key to
  the next Master.** Applied in `data/bosses.ts`: Frost Master is weak to
  Flame Wave, Volt Master to Ice Lance, Gale Master to Thunder Arc, and Blaze
  Master to Gale Guard. The elemental machines follow the same ring in
  `COUNTER`: fire is weak to wind, ice to fire, volt to ice, wind to volt.
  Before, the ring ran against the
  unlock order: on a first run, only the Gale Master and the Sky Docks
  machines were weak to a weapon Flux already had. Now three of the four
  Masters are, and so are the machines of the Cryo Plant, the Volt Tower and
  the Sky Docks. This is the classic weapon-copy loop, and it gives the
  special-weapon lesson from chunk 15 something to pay off. Blaze Master is
  the one fought without its weakness, like the first boss of any run.
- **The second shift has its own ring, and it is turned too.** Magnet
  Master is weak to Drone Swarm, Drill Master to Magnet Pull, Tide Master to
  Drill Bomb, Neon Master to Bubble Lance, and Rotor Master to Neon Blade, as
  `data/bosses.ts` now has it. It closes on itself and doesn't touch the
  first ring. Like the first, it runs with the unlock order: each Master is
  weak to the weapon of the one freed just before it, so on a first run four
  of the five meet a weapon Flux already owns. The Magnet Master opens the
  ring and is the one fought without its weakness, like Blaze; a weapon
  capsule can lend Drone Swarm early.
- **Atlas names the weakness live.** Right after "Boss ahead. Deep breath!"
  Atlas says "{weapon} hurts this one!" (`atlas.weak.<weapon>`) when Flux
  carries the Master's weakness, and "No weak spot visible. Move!"
  (`atlas.noWeak`) at the Scrapper's and Vex's doors, which have none. For a
  Master whose weakness Flux hasn't copied yet, it says nothing.
- **Ten relays, and the Breach after the tenth.** The Fortress shield is
  wired to all ten relays, so the Breach plays after the Rotor Master. After
  the Gale Master a shorter beat, the reserve, shows the five relays still
  to light. Atlas's relay count (`atlas.arc.1`–`.10`) follows the same
  ten.
- **The Mk-II sting waits for New Game+.** A teaser for a mode that isn't
  coming would be a broken promise. The ending keeps the red spark escaping,
  which leaves the door open without naming anything. New Game+ is in the
  GDD; its scaling is built (`sim/ngPlus.ts`), and so is its entry: the
  ending's end card offers *Start New Game+* behind a confirm (#102). The level cap stays at 40: in New Game+ every sector's band lifts
  to the cap, machines and bosses get +25% health a cycle (up to ×2), and
  bosses 15% quicker tells and cooldowns (down to ×0.6) with the odd
  follow-up attack. Flux keeps everything; the story relocks.
- **The intro ships on every build**, behind `VITE_APP_INTRO`. It gets
  switched off wherever a portal's conversion-to-play drops.
- **Screen-reader lines: yes.** Each story beat gets one, the same pattern
  as the coach's `tips.*`.
- **Replay: yes, from Options in the hub.** It covers the accidental skip.
- **Vex's face on the lab screens: yes.** Without it, Vex disappears
  between the intro and the Fortress.
- **Story beats never replay history.** On an existing save, every beat
  whose trigger is already behind the player is marked seen on load.
  Someone past the Sky Docks gets no pile of cutscenes after the update.
  *Proposed, to confirm against the code:* a save that beat the Gale Master
  before the second shift existed has seen the old Breach, but the shield is
  whole again. It gets the reserve beat once, and the Breach plays again
  after the Rotor Master.
  Gauss's capsule still appears, because it is a state, not a beat.
