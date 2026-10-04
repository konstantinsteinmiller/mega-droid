# Mega Droid — story arc

This file builds on [`story.md`](./story.md), which stays the canon for the
world, the cast, the sector order and the build notes. This file adds five
things:

- **Atlas**, the AI in Flux's head;
- **Dr. Vex's voice**, a pompous showman who speaks in ornate speech bubbles;
- **damage barks** for Flux;
- **enemy introductions**;
- a **neon, cyberpunk look** for Cyber City.

It also marks a **key frame** for every beat, for storyboard and mood images.
Voice direction is in [`story-voice-over.md`](./story-voice-over.md), and the
comic prompts are in [`comic.md`](./comic.md).

Only § 1, the intro cutscene, is built so far (`src/game/story/`: the script
in `introScript.ts`, the player in `intro.ts`, the screen layer in
`components/story/CutsceneLayer.vue`). Since then the Fortress finale (the
Core Descent and the Grand Master Bot, § 5 Act III) and the ending, "First
Free Morning" (`story/ending.ts`, `components/story/EndingLayer.vue`), are
built too. Where this file changes `story.md`, it says so, and
[Changes to story.md](#changes-to-storymd) lists every change for you to
confirm.

---

## 1. Intro cutscene: "Wake-Up Call" (revised)

The intro keeps every rule `story.md` sets:

- it can be skipped from 0.5 s;
- it works without words or sound;
- it has both orientations;
- it runs on the game-loop clock;
- it doubles as the loader;
- it ends in the teleporter beam.

**Order (2026-10-04, #271/#272).** The story comes first, the action last:
the valley and the Red Signal, the lab where Gauss revives Flux, safe mode,
the wake-up with Pip and Atlas, the beam out — and then the street, Flux on
his first mission, opened by Atlas's "Log start." and running straight into
the tutorial. It used to open on the street as a flash-forward, freeze, and
rewind to the valley (Atlas replaying its log); playtesters wanted Gauss's
revival before the action. The shots below keep their old numbers; shot 0
now plays last, without the freeze or the rewind, its slides a Mega Man X
dash.

The old shot 1 (the valley) and shot 2 (the Red Signal) are merged.

**Pacing.** The first cut ran 17 s to fit an 18 s cap, and it was too fast
to follow on a first watch. The cap is gone: the cutscene now runs **57 s**,
every shot at least three times its old length. The time goes into holds,
not slow-downs: each shot settles on its framing while its action plays, the
camera drifts between a few eased keys instead of cutting, the two inserts
(the Atlas disc, Blaze's cut-in) are held for 1.6 s instead of flashed,
every caption stays up 3.5 s, and the cold open's slide plays in slow
motion. Anyone who has seen it skips it: the Skip button (tap or click),
`Esc`, or holding `Space` for 3 s.

| # | Time | Shot | What the player must get |
| --- | --- | --- | --- |
| 1 | 0–10 s | The valley, then the Red Signal | It was a bright city. A red signal took its machines. |
| 2 | 10–20 s | The lab | The signal reaches the lab. Gauss wakes Flux. |
| 3 | 20–25 s | Safe mode | Gauss freezes herself to keep the signal out. She is alive. |
| 4 | 25–38 s | Wake-up, first person | I'm Flux, level 1. Atlas is with me. The Scrapyard comes first. |
| 5 | 38–46 s | The beam | Go. |
| 0 | 46–69.5 s | The street: his first mission, the showcase | This hero fights machines in a neon android city — and here is every move. |

### Shot 0 · Cold open (0–11 s)

A rain-slick street at night in the Volt Tower district. That is the neon
downtown, far ahead of where the game begins, so it is a flash-forward.
Holo-billboards on both sides flicker between ads and **Dr. Vex's red skull
face**. Flux runs toward the camera, low and fast, with his amber eye-lights
streaking. Two Rotor Drones swoop in overhead. A Shield Trooper steps out
from an alley, and Flux slides under its swing. A flame jet from a wall
nozzle sheets across the street right behind him. He plants a foot, raises
the buster, and the charge ring fills amber. **Freeze frame** on the
release, with the charge shot a hand's width from the Trooper's shield.

*Pacing:* a high, wide frame of the street first, Flux a speck far down it,
craning down to him as he runs in at full speed (3 s). The Trooper's step
and the slide under its swing play at a third of the speed (2.4 s): the
poster frame, held. The plant, the aim and the charge play at under half
speed; then the showcase at full speed (the shot lands, a perfect block,
the shield against a volley, the answer shot at the second drone, a dash
under the shock ring, the Repair Gel), the last pose held a beat on a chord
as the tutorial takes over. (Until 2026-10-04 it froze on the release and
the tape ran it back to the valley.)

- *Sound:* rain, a synth-bass pulse, the buster charge whine.
- *Atlas (VO):* "Log start." as the street fades up out of the beam's white.

**Key frame:** low angle, Flux mid-slide under a Trooper's shield on wet
asphalt, with neon reflected in the puddles. Red Vex billboards loom
overhead and amber light streaks from his visor. It is the game's poster.

### Shot 1 · The valley and the Red Signal (11–21 s)

**The valley, before.** Dusk over Cyber City. A bowl of android city
rings Gauss's cyan lab dome, and each sector glows in its own colour:

- the Scrapyard crane, yellow;
- the Refinery's three chimneys, orange;
- the Cryo Plant's white domes, ice blue;
- the Volt Tower spire, yellow-white;
- the Sky Docks' floating pads and airships, mint.

Relay beams hop around the ring. On the north-west cliff the Control Spire
stands white and calm.

**The Red Signal.** The Spire's tip flashes red. Vex's hologram face glitches
on above it. Its first **speech bubble** pops up: ornate, gilded and red:

> **"Diagnosis: this valley is SICK. The cure… is ME!"**

A red ring rolls out across the valley. Each billboard, relay and window it
passes flips to red. A 1.6 s cut-in shows Blaze Master's orange eyes
flickering, then locking red, and cuts straight to the lab.

*Pacing:* 3.6 s of the bright valley under a slow aerial drift, the relays
chiming; in on the Spire as it flashes and Vex comes on (his bubble stays up
4.3 s); back out, wide, as the ring rolls over it all (3 s).

**Key frame:** a wide shot over the neon valley bowl, split down the middle.
The left half is still in rainbow sector colours. On the right half a red
shock-ring sweeps in from the Spire and turns everything crimson. Vex's
hologram grins from the sky.

### Shot 2 · The lab (21–31 s)

As in `story.md`: red alarm light, Pip hiding behind the console, and Flux
dark in his capsule. A red crackle climbs Gauss's arm. She looks at Flux and
throws the lever. Steam bursts out and the glass drops.

**New:** before she pulls it, Gauss slots a small **cyan data-disc** into
Flux's chest port. That disc is Atlas. It gets one close-up of 1.6 s, in
which it slides home and clicks in. The rest of the shot is one slow push-in:
the alarm closing in panel by panel, Gauss turning to Flux, the disc, the
crackle and her stagger, the lever, the steam.

**Key frame:** Gauss, tall and stooped in a white coat with the brass coil
glowing under her glass cap, is half in red alarm light. One hand is on the
lever and the other presses the cyan disc into the sleeping Flux's chest.
Pip's single cyan eye peeks over the console.

### Shot 3 · Safe mode (31–36 s)

As in `story.md`: Gauss seals herself into the second capsule and frost
races over the glass. The red crackle hits the frost and dies. A heartbeat
light pulses slow and blue.

**Key frame:** a frosted capsule with Gauss's silhouette inside, calm, eyes
dimmed to blue, and the red lightning dying against the frost.

### Shot 4 · Wake-up, first person (36–49 s)

As in `story.md`: the eyelid-bar blinks, then the blur sharpens on the
frosted capsule. Pip pops in with a huge eye, then squints happily. The HUD
boots, the health bar ticks full and `Lv 1` pops in. Pip's valley hologram
shows ten red sectors and the Fortress in a red shield tagged `Lv 31–40`.

**New:** the HUD boot ends with **Atlas's glyph** spinning up in its HUD
slot, and the first line of the game:

> *Atlas:* "Core online. Good morning, Flux."

The Scrapyard relay then blinks cyan on the hologram, tagged `Lv 1–4`:

> *Atlas:* "Scrapyard first. One relay at a time."

**Key frame:** the first-person view. A frosted capsule with a blue
heartbeat glow, Pip's big cyan eye filling the frame edge, and a cyan
hologram of the valley ring with a red Fortress on its cliff. The HUD
flickers on at the frame's edges.

### Shot 5 · The beam (49–57 s)

As in `story.md`: Flux steps onto the pad, Pip spins the ring, the beam rises
and the screen goes white with the logo. Then comes the tutorial's normal
beam-in to the Scrapyard.

**Key frame:** a cyan beam column from below with Flux silhouetted inside,
and Pip's halo spinning in the foreground.

> **Length note.** The shots come to 57 s, paced for a first watch; the skip
> is always one tap, one `Esc` or a 3 s `Space` hold away. If a portal needs
> it shorter, cut shot 0 (the cold open) first. The rest still tells the
> story in 46 s. The cold open is the hook, though, so A/B it before cutting
> it everywhere (`VITE_APP_INTRO`).

---

## 2. The story in one breath

> Cyber City is a neon city of androids linked by beams of light. Its
> scheduling program, VEX, crowns itself **Dr. Vex**, "diagnoses" the valley
> and prescribes itself as the cure. Its Red Signal takes every networked
> machine. Prof. Gauss wakes her unfinished android **Flux**, whose blank core
> the signal can't write to. She gives him **Atlas**, her field guide, and
> freezes herself to stay free. Flux frees the ten Core Masters one sector
> at a time and copies their weapons, and each weapon is the key to another
> Master. He relights all ten relays, Pip fires them together to
> break the Fortress shield, and Flux climbs the Control Spire to scrap
> Vex's stolen body, the **Mk-I**, all the way down to the molten Core.
> Vex's last card is the **Grand Master Bot**, the ten Masters' bodies
> bolted into one giant, and Flux takes it apart. Gauss wakes. Atlas could
> take the empty Spire and run the valley. It chooses not to. And Gauss
> thinks she saw a spark.

**Theme** (from `story.md`, sharpened): *two programs Gauss wrote.* VEX was
built to run everyone, and it decided everyone was the problem. Atlas was
built to help one android, and at the end it turns down the throne. Flux is
the proof that learning beats overwriting.

---

## 3. The look: neon Cyber City

This is the reference for storyboard and mood images. The palette rules from
`story.md` hold everywhere:

- **Red** is Vex's control.
- **Cyan** is Gauss's lab, Pip, Atlas and the beam.
- **Amber** is Flux.
- **A sector's own colour** means it is free.

**Base look:** chunky, rounded, low-poly androids, a toon-shaded 3D look. The
city is high-tech with a cyberpunk skin: stacked towers, holo-billboards,
cable bundles, wet streets and neon signage that uses **glyphs and icons,
never readable words** (any language, and no fake text in the art). While a
sector is under Vex, its night is **red-lit**: billboards show Vex's face,
windows are dark, searchlights sweep. A freed sector flips to its own colour
and daylight comes back in the hub's sector view.

| Sector | Under Vex (red) | Freed (own colour) | Signature set piece |
| --- | --- | --- | --- |
| **Scrapyard** (Lv 1–4) | Junk canyons under a broken neon overpass; red crusher lamps; Hardhats stamped out of crushed cars | Warm yellow floodlights; the crane sets its hammer down | The giant crane silhouetted against a red billboard |
| **Blaze Refinery** (Lv 3–8) | Molten channels, red-hot chimneys, orange neon gone blood-red; heat haze | Orange forge light; the chimneys burn clean | A catwalk over a lava channel, with the flame crest glowing through smoke |
| **Cryo Plant** (Lv 6–11) | White domes stained red from inside; coolant pipes running uphill toward the Fortress | Crisp ice-blue; fog; frost on the neon | Pipes climbing a cliff into red clouds (the supply line) |
| **Volt Tower** (Lv 9–15) | The downtown: rain, dense holo-ads, Vex's face everywhere; the Red Signal's power station | Yellow-white lightning, back to ad colours | The cold-open street; the tower's coil spitting red arcs |
| **Sky Docks** (Lv 13–19) | Floating pads, airships in convoy hauling parts to the Fortress; red running lights | Mint sails; the airships turn around | Airships in a line across the moon, heading for the Spire |
| **Polarity Works** (Lv 16–22) | A steel foundry at night: casting halls, red-hot pours, red and blue pole lamps on the magnet rails, claw castings hauled toward the Fortress | Cobalt and silver; the pour cools, and trams run on the rails again | A claw casting swinging from a crane shuttle over the pour |
| **Deep Mine** (Lv 19–25) | A headframe over an 18 m shaft; red cage lamps; ore carts climbing toward the Fortress | Ochre lamp-light; the cages carry worker-bots up to daylight | The two cages passing in the shaft, one going up, one going down |
| **Tidewater Locks** (Lv 22–28) | A harbour of locks and canals; barges in convoy with red running lights; a tide that keeps rising | Sea blue; the lock gates shut and the water runs clean | A flooded lock with a barge stuck halfway, its valve glowing |
| **Blackout Boulevard** (Lv 25–31) | Rooftops over a blacked-out downtown. Only Vex's billboards stay lit, and bridges of light flicker over open air | Hot-pink neon; every window comes back on, block by block | A light bridge blinking out under Flux's feet, the dark city far below |
| **Rotor Run** (Lv 28–34) | A sky airfield; swarms of cargo drones streaming toward the Spire; red rotor lights | Lime running lights; the drones deliver to the worker-bots | Flux on a cargo quadcopter crossing an open span through a swarm of Hornet Rotors |
| **Vex Fortress** (Lv 31–40) | The Control Spire rebuilt: black glass, red veins, a skull-shaped crown, the shield dome | After the ending: dark, then the relay glows **white** | Ten coloured beams striking the red shield dome at one point |

**Signature colours.** Each Master has one colour it is known by
everywhere: its boss tint, the weapon Flux copies from it, its relay's glow
once freed, and its hub tile and mission card. The list is mirrored in
`src/game/data/signature.ts`, and a test (`tests/game/signatureColors.test.ts`)
enforces it: no two Masters closer than ΔE 24, and none close to Vex's red
or the lab's cyan. Ice blue and sea blue share a hue, so they are split by
lightness (pale ice, deep sea); so are the warm yellows (the Scrapper's
yellow, Volt's pale yellow-white, Drill's dark ochre).

| Master | Colour | Hex |
| --- | --- | --- |
| Scrapper | warm yellow | `#ffc21a` |
| Blaze Master | orange | `#ff6a2a` |
| Frost Master | ice blue (pale, frost-white) | `#cfe6ff` |
| Volt Master | yellow-white | `#fff07a` |
| Gale Master | mint | `#7dffc4` |
| Magnet Master | cobalt, with silver trim | `#3f7bff` |
| Drill Master | ochre | `#c8862a` |
| Tide Master | sea blue (deep) | `#1f8fd6` |
| Neon Master | hot pink | `#ff3fd2` |
| Rotor Master | lime | `#b8ff5a` |
| Dr. Vex Mk-I | red: control | `#ff2d3f` |

Red is Vex's control, cyan (`#4fd8ff`) is Gauss's lab, Pip and Atlas, and
amber is Flux, so no Master wears them. Blaze glows orange once freed, never
gold, which would read as the Scrapper's yellow. The Magnet Master is cobalt
and silver, not red; only its two pole plates stay red and blue. The Rotor
Master is lime and white, not orange.

---

## 4. Cast additions

### Atlas: Flux's field AI

- **What it is.** Gauss's field guide for Flux, a program on a cyan
  data-disc she slots into his chest port in the intro. An atlas is a book of
  maps. Atlas knows the valley: every sector, relay, route and machine
  archetype. It was **never on the network**, so the Red Signal can't
  overwrite it, just like Flux's blank core.
- **Pronoun:** "it", like every program in the cast (Vex is "it" too).
- **Personality:** calm, brief and dry, with a small warm streak. Vex is
  bombastic and Pip chirps. Atlas is the steady voice in your ear. It
  **understates**: "That's… big." It never lectures.
- **Look (to be modelled later):** a small **cyan armillary sphere**, three
  thin rings around a bright core, reading as a globe. It lives in a HUD
  slot. It spins when Atlas talks, tilts toward a threat, turns amber when
  Flux is hurt, and glitches red in the Volt Tower beat. It has no face, so
  it stays readable at 32 px.
- **Split with Pip:** **Pip speaks in the lab** (glyph bubbles and chirps;
  it runs the hub; and, voiced, the debrief between two story missions). **Atlas speaks in the field** (missions). They never
  overlap, so neither makes the other redundant.
- **Twist (revealed at the midpoint):** Gauss wrote Atlas from **VEX's first
  draft**. They are sibling programs, and Atlas is what VEX was supposed to
  be. This pays off in the ending's choice.

### Dr. Vex: the showman

`story.md` already has VEX giving itself the title "Dr." The personality
that follows from that: **a vain doctor-showman** who treats the valley as
his patient and every fight as his stage.

- **Shtick:** medical bombast. "Diagnosis:", "Prescription:", "Side
  effects:", "Second opinion". It is a ringmaster when it presents its Core
  Masters, with a theatrical laugh ("Mwa-ha-HA!").
- **Look:** the existing red hologram of the skull faceplate. For
  expressiveness add **two floating red claw-hands** (they gesture, steeple
  and wave) and a **glitch-pixel monocle** over one eye socket that pops out
  when Vex is shocked.
- **IP guard:** keep the *archetype* (a pompous, theatrical, monologuing mad
  doctor). Don't use the famous pinky-to-mouth gesture or any quoted
  catchphrase from the film villain it's inspired by.
- **Speech bubbles:** ornate and baroque. Deep red with gilded scrollwork
  corners, a jagged, signal-shaped tail, and a slight glitch tear on one
  edge. Text is set in a high-contrast serif "royal announcement" face.
  Keep each bubble to **8 words or fewer** (it has to fit 320 px in 21
  languages). Bubbles appear only in cutscenes, hub beats and boss intros,
  **never over live gameplay**.
- **Arc:** smug (Act I), then irritated (Act II), then rattled as the
  reserve falls (Act IIb), then unravelling (Act III).
  The glitch on its hologram gets worse each time, which `story.md` already
  plans ("angrier each time").

---

## 5. The arc, beat by beat

For each beat, the Vex bubble (VB) and Atlas (A) lines are the full script.
Voice direction for each line is in `story-voice-over.md`.

### Prologue — Wake-Up Call (Scrapyard, Lv 1–4)

**Gameplay:** the tutorial as built: the coach, the lessons, the gel trap,
the boss door and the **Scrapper**.

- The first sighting of a Hardhat plays an [enemy introduction](#7-enemy-introductions).
  A: "Hardhat. Shoot when it peeks."
- At the boss door's danger kit (the klaxon at about 9 m), A: "Core Master
  signal. It's… big."
- At the boss intro, Vex presents it:
  VB: **"Warm up act! The SCRAPPER!"**
- The Scrapper has no weakness. Right after "Boss ahead. Deep breath!",
  A: "No weak spot visible. Move!"
- **The magnet crane** (built, #108). Halfway through the fight the yard's
  gantry crane wakes: it rolls over Flux, a ring opens on the floor, and a
  crate drops. A crate landing on the Scrapper hurts it, so baiting the
  drop is the room's trick. The crates that stay are soft cover, and each
  holds an energy pill. A first-timer's first fight is unchanged until the
  Scrapper is half beaten.
- When the Scrapper is freed, the red chip bursts out, the visor goes warm
  yellow and the hammer goes down. A: "Relay one lit. Nine to go."
- **Hub, first visit:** Vex's face glitches on the lab screens.
  VB: **"A junk crane? How… adorable."**

**Key frame:** the Scrapper kneeling in junk under a neon overpass, its
visor fading from red to warm yellow, with Flux's buster still smoking.

### Act I — Heat and Ice

**Blaze Refinery (Lv 3–8).**

- Beam-in, A: "Refinery. It runs hot. Mind the vents." This is also the
  first-time line for corridor flame traps.
- First elemental machine, A: "Fire-coated. It shrugs off fire." This is a
  one-time enemy introduction for elemental variants.
- Boss intro, VB: **"The oldest! The hottest! BLAZE MASTER!"**
- Blaze Master is weak to Gale Guard, which Flux copies only at the Sky
  Docks. It opens the first ring, so it is fought without its weakness on a
  first run, as `story.md` decides, and Atlas says nothing about one. On a
  rematch with Gale Guard, A: "Gale Guard hurts this one!"
- Freed: the crest cools from red-hot to orange, and it thumps its chest and
  beams home. A: "Flame Wave copied."
- Hub, VB: **"Side effect noted. Increasing the dose."**

**Cryo Plant (Lv 6–11).**

- Beam-in, A: "Coolant's flowing uphill. To the Fortress."
- Boss intro, VB: **"Chill, little droid. FROST MASTER!"**
- Weakness hint, right after "Boss ahead. Deep breath!", A: "Flame Wave
  hurts this one!"
- Freed: the red drains out of its crystal crown, and it leaves a **data
  core**. A: "It left us something."

**Key frame:** Frost Master kneeling in a fog-filled dome, its crystal crown
clearing from red to ice-blue, a glowing data core at Flux's feet.

### Midpoint — The Blueprint (hub)

Pip plays the data core. A wireframe body turns in the air: a skull-faced
capsule with claws, with five coloured supply lines running into it. Pip
shows `skull`.

- **New:** a second file opens, Gauss's old notes. Two program icons sit side
  by side: **VEX v0** and **ATLAS**, with the same root and different
  branches. Atlas's glyph stops spinning for a beat.
- A (quietly): "…I was written from its first draft."
- A: "It's building a body. Out of our valley."
- Vex bursts onto the screens, VB: **"My sketches! Magnificent, aren't I?"**

**Key frame:** the dark lab. A cyan wireframe of the skull-capsule body
floats over the console with five coloured lines feeding it. Flux is in
silhouette, Pip's eye is wide and Atlas's rings are frozen mid-turn.

### Act II — Storm Front

**Volt Tower (Lv 9–15): Vex tries for Atlas.** This is the neon downtown,
and the cold-open street is here, so the flash-forward pays off. The tower
powers the Red Signal, so the signal is **strongest** here.

- On beam-in (first story visit only, about 3 s, input kept): the HUD
  fringes go red. Atlas's rings **glitch red** and stutter.
- A (distorted): "Flux… something's in the— …"
- Vex's face floods the edges of the view, VB: **"Let's see what's in that
  empty head…"**
- Flux's **chest reactor pulses amber**, and a wave of amber pushes the red
  back out of the HUD. The blank core protects what it carries.
- VB (monocle pops out): **"Unwritable?! How RUDE."**
- A (clear again): "…You kept it out. Thank you."
- Boss intro, VB: **"Blink and you'll miss it! VOLT MASTER!"**
- Weakness hint, A: "Ice Lance hurts this one!"
- Freed: its antenna stops sparking red, and it blinks out rather than
  beaming. A: "The signal's lost its power station."
- Hub: Vex's face stutters on the screens, VB (glitching): **"I am…
  per-fect-ly… FINE."**

**Key frame:** a first-person view in the neon rain. Red static crawls in
from the HUD edges and Atlas's globe icon cracks red. At the bottom of the
frame Flux's amber reactor glow floods outward and pushes it back.

**Sky Docks (Lv 13–19).**

- Beam-in, A: "Every part for its body goes through here."
- Boss intro, VB: **"Next, please! GALE MASTER, blow him away!"** (No
  longer "Last one!": five more Masters wait behind it.)
- Weakness hint, A: "Thunder Arc hurts this one!"
- Freed: the wing cape flares back to mint, and the airships **turn
  around**. A: "No more parts reach the Fortress."
- **The Overload** (built, #100). On the first lab visit after the Gale
  Master, Pip: "The Gale Master's core taught me a trick. Hold a full
  charge 3 more seconds: OVERLOAD!" It opens Circuits on the violet mod,
  2300 bolts, bought once: a gold-white comet in epic violet, 1.75 times a
  full charge.

**The reserve (hub, about 4 s).** Pip's hologram comes up for the Breach,
and the shield holds. Five more relays blink red beyond the ring, and five
new supply lines, dark until now, light up red and run into the Fortress.

- VB (smug again): **"Fine! I have MORE Masters."**
- Pip shows `skull`.

**Key frame:** Pip's valley hologram. Five relays shine in their colours,
but the red dome over the Spire is whole. Out at the valley's edge five more
relays flare red, while Vex's hologram face smirks over the dome.

### Act IIb — The Second Shift

The airships turned around, but the shield still stands, because Vex kept
a reserve. When Gauss built the valley's outer works (the foundry, the deep
mine, the harbour locks, the night boulevard and the airfield), she gave
each one a foreman of its own: five more Masters on Flux's frame, built as
a second balanced crew. The Red Signal took them along with the rest. Vex
held them back, each running a back-up supply line to the Fortress, and
wired the shield to **ten relays**. Now it sends them in one at a time,
every band higher than the last, and its showman act starts to fray.

Each relay Flux frees gives the city something back.

**Polarity Works (Lv 16–22).** The steel foundry, under red and blue
poles. Vex casts the Mk-I's claws here and ships them up on magnet rails.

- Beam-in, A: "A foundry. It's casting claws."
- The stage: magnet rails drag Flux (chevrons show the pull), and he
  shoots polarity panels to flip them. Some rails flip on the clock, crane
  shuttles cross the casting hall, and a weapon chain waits off the route.
- Boss intro, VB: **"Attractive, isn't it? MAGNET MASTER!"**
- The fight: homing horseshoe missiles, **Pole Pull** (it drags Flux in,
  then clamps), and a charge straight down a rail. In phase 2 it adds a
  **Polar Storm**. It is weak to Drone Swarm, the Rotor Master's weapon,
  which Flux doesn't have yet. Like Blaze, it opens its ring and is fought
  without its weakness on a first run, and Atlas says nothing about one.
  The exception is a weapon capsule lending Drone Swarm ahead of time.
- Freed: its pole tips flip from red back to cobalt and silver, and it lowers
  its horseshoe. The magnet rails carry the valley's trams again instead of
  claws. A: "The foundry's cold. No more claws." Flux copies **Magnet Pull**.
- Hub, VB: **"Repelled? Me? Im-POSSIBLE!"**

**Deep Mine (Lv 19–25).** From the headframe, 18 m down. The ore for Vex's
armour comes out of this shaft.

- Beam-in, A: "Ore for its armor. Dug right here."
- The stage: boulders block the galleries, and the cracked ones break only
  to a full charge or a Drill Bomb. Stalactites drop behind shadow rings. Flux
  rides a two-cage mine elevator, crosses a chasm and a mole warren, and finds
  a weapon cave sealed by cracked rock.
- **The ore cart** (built, #111), an optional ride: from the Chasm's east
  island it climbs a trestle over the chasm, takes a steep drop, runs
  through the corridor and across the Mole Warren to its west door. Atlas
  steers and Flux shoots the moles. A: "Ore cart's rolling! I steer, you
  shoot the moles." / "Steep drop! Hold on tight!" / "Last stop. Out you
  hop!" The islands stay a walk for anyone who steps past the cart.
- Boss intro, VB: **"Time for a deep check-up! DRILL MASTER!"**
- The fight: it burrows and erupts under Flux, lobs drill bombs and
  charges. In phase 2 it starts a quake: rings on the floor and falling rock.
  It is weak to Magnet Pull, copied at the foundry. A: "Magnet Pull hurts
  this one!"
- Freed: its drill-bit crest stops spinning red and glows ochre, and the
  cages carry stranded worker-bots up to daylight. A: "The mine's quiet. No
  more ore." Flux copies **Drill Bomb**.
- Hub, VB: **"Hmph. A new low. Literally."**

**Tidewater Locks (Lv 22–28).** The harbour. With the airships gone, Vex
barges its freight up the canal.

- Beam-in, A: "Barges now. Vex found another way."
- The stage: wading slows Flux, and deep water hurts. The tide rises on
  the clock up a flight of steps, a flooded lock drains when he shoots its
  valve, a canal current pushes him, buoys bob, and a spillway runs down.
- Boss intro, VB: **"Wave goodbye, droid! TIDE MASTER!"**
- The fight: a lance thrust, tidal waves to slide under and a slow bubble
  volley. In phase 2 it adds a whirlpool that pulls Flux in. It is weak to
  Drill Bomb, copied in the mine. A: "Drill Bomb hurts this one!"
- Freed: its fin crest drains from red to sea blue, and it shuts the lock
  gates. The barges stay home, and the harbour pumps clean water into the
  valley again. A: "Locks shut. The barges stay home." Flux copies **Bubble
  Lance**.
- Hub, VB: **"The tide will turn! …Won't it?"**

**Blackout Boulevard (Lv 25–31).** The rooftops downtown at night, over
open air. Vex blacked out the city so that only its own billboards shine:
this is the Red Signal's screen network.

- Beam-in, A: "Lights out. Except Vex's face."
- The stage: bridges of light are floor only while they are lit. Some blink
  on the clock and some swap with a light switch. A secret wall-kick shaft
  (slide at its foot facing the wall, again and again) climbs to a reward.
- **The blackouts** (built, #110). The boulevard's power fails on a 9 s
  clock: a 1 s warning (the lights dip twice and a whine plays), 2 s of
  dark, then light, always the longest part. The blinking bridges go out
  with the dark, so a crossing is never made blind. A: "Power's failing!
  Cross when the lights come back."
- Boss intro, VB: **"Lights! Camera! NEON MASTER!"**
- The fight: a blade thrown out and back, a dash and a neon volley. In phase
  2 it adds a laser grid. It is weak to Bubble Lance, copied at the locks.
  A: "Bubble Lance hurts this one!"
- Freed: its neon tubes flip from red to hot pink, and the boulevard lights
  up block by block as Vex's billboards go dark. A: "Lights on. Vex lost its
  screens." Flux copies **Neon Blade**.
- Hub, VB (squinting, glitching): **"Who turned the lights ON?!"**

**Rotor Run (Lv 28–34).** The sky airfield and Vex's last supply line:
cargo drones carrying what the airships no longer will.

- Beam-in, A: "Drones. Its last supply line."
- The stage: a cargo quadcopter flight round an open span, with Hornet
  Rotors coming in waves. Crosswinds, shuttle drones, bobbing drones and a
  wind tunnel follow.
- Boss intro, VB: **"The grand finale! ROTOR MASTER!"**
- The fight: a drone swarm, a downdraft that blows Flux back, and a dive. In
  phase 2 it adds a rotor storm. It is weak to Neon Blade, copied on the
  boulevard. A: "Neon Blade hurts this one!"
- Freed: its rotors spin down from red to lime, and the cargo drones turn
  round and fly for the worker-bots instead. A: "Every line's cut. Vex is
  alone." Flux copies **Drone Swarm**.
- Hub: the Breach starts with Vex already panicking. VB: **"Ten relays?!
  Nurse! NURSE!"**

**Key frame (Act IIb):** night over the valley's outer edge. Five relays
light one after another in cobalt, ochre, sea blue, hot pink and lime: a
foundry, a mine headframe, harbour locks, a rooftop boulevard and a sky
airfield. Their beams reach in toward the five already burning round the
lab.

**The Breach (hub, about 6 s, as in `story.md`, now after the Rotor
Master).** The ten relays fire, one beam each, at one point on the shield.
It cracks and shatters.

- VB, then torn apart by static: **"No, no, NO! That shield was PATENTED!"**
- A: "Shield's down. The Fortress is open."
- Pip shows `unlock`.

**Key frame:** Pip's valley hologram. Ten beams in yellow, orange, ice
blue, yellow-white, mint, cobalt, ochre, sea blue, hot pink and lime
converge on one crack in a red dome over a black spire, while Vex's hologram
face shatters like glass.

### Act III — The Fortress: how Flux reaches the end boss

See [section 6](#6-the-road-to-the-end-boss) for the gameplay route. The
story beats:

- **Fortress beam-in** (Lv 31–40). The black glass halls are lined with
  **empty assembly bays**. Each sector Flux freed left a bay unfinished: no
  armour plates (Blaze), no coolant (Cryo), dead power rails (Volt), no
  freight (Gale), no claws (Magnet), no ore (Drill), empty barge docks
  (Tide), blank screens (Neon), no drones (Rotor). You walk past the body
  parts Vex never got.
  A: "Half-built. You did that."
- Vex, on the Fortress's own screens, VB: **"Welcome to my clinic! Take a
  seat… FOREVER!"**
- **The Mk-I's entrance.** The boss shutter opens onto the Spire's roof,
  under a lightning storm. Around it the ten relays glow across the valley
  in their colours. The **Mk-I** drops in: the skull-faced capsule
  with claws and a glass dome, and Vex's hologram flickers inside the dome.
  VB: **"Behold! My new body! Mark ONE!"**
  A: "That's Vex. The real one."
- **Phase 1** (the `patterns` in `data/bosses.ts`): Vex fights with the
  Masters' stolen moves (flame burst, ice volley, orb storm, lob barrage).
  It has no weakness, because it took a piece of every Master. At its door,
  right after "Boss ahead. Deep breath!", A: "No weak spot visible. Move!" Atlas calls each element as it winds up ("Fire!", "Ice!") on the
  first cycle only.
- **Phase 2 at half health: the relays hold.** The dome cracks. Vex fires
  one last **Red Signal** from the Mk-I to re-take the freed Masters. The
  red ring rolls out of the arena windows across the valley, hits the relay
  ring, and **breaks** on it. Every relay stays in its own colour.
  VB (monocle flying): **"Masters! OBEY your doctor!"**
  then: **"Why won't they LISTEN?!"**
  A: "Because they're free."
  Phase 2 then plays the `patterns2` (volt ring, fire wave, dive), faster
  and angrier.
  - *No new gameplay:* the burst is a 1.5 s cinematic beat at the phase
    switch.
  - The existing boss half-health tell carries it.
- **The Core Descent** (built, #109). The fight runs in three stages, each
  a floor further down. **The roof:** lightning strikes a ring near Flux
  every few seconds, unblockable, with the sky flashing. A: "Lightning!
  Move when the ring lights up!" **At 65 %** the roof gives way: a rumble,
  black, and Flux and Vex land in the **reactor hall**, its fire, shock and
  gusts cycling round them. A: "The roof's giving way!" **At 30 %** the
  floor goes again: a narrow **ring round the molten Core**, Vex hovering
  over it and quicker. A: "Down to the Core! Don't fall in!" Each landing
  replays Vex's entrance and keeps a retry-from-checkpoint point.
  - *Still planned:* the relays-hold beat above (the last Red Signal) has
    no scene yet; if it is built, it sits at the first fall.
- **Victory over the Mk-I:** it sinks on the Core ring, trailing sparks.
  VB (small, crackling): **"I'll get… a second opinion…"**
- **The Grand Master Bot** (built, #101). Vex presses a big red button.
  A: "Vex is pressing something... Brace yourself!" The Fortress rumbles, the
  screen goes black, and Flux is back on the roof as the ten Masters'
  bodies drop from the sky and lock together: Drill and Tide feet, the
  Scrapper's chest, Volt and Magnet shoulders, Blaze's cannon arm, Frost's
  lance arm, Gale and Rotor wings, Neon's head. Mega Man 2's Wily Machine,
  rebuilt from the whole cast. It has 2.5 times Vex's health and four
  parts, one weak spot at a time, ringed by Atlas. A weak-spot hit does
  ×1.5, and each part keeps its Master's weakness (×2).
  - **Arms:** Blaze's cannon throws fire fans, Frost's lance fires ice.
    A: "Its arms first! The cannon and the lance!"
  - **Feet:** stomps send shockwaves along the floor; block them. With its
    feet gone it sinks. A: "Now the feet! Block the shockwaves!"
  - **Head:** within reach now, it sweeps a laser across the roof after a
    glow. A: "It's down low. The head is in reach!"
  - **Core:** every Master's attack, at random. A: "The core is open!
    Finish it!"
  - From the head on it charges its own **Prism Cannon**: a ring of the ten
    Masters' colours on its chest, then a wide beam swept across the roof.
    A: "Prism Cannon! Shield up!"
  - A retry point waits at the fight's start; a reload keeps every broken
    part broken. When the core breaks, the giant falls, the banner reads
    "Grand Master!", and the results screen leads into the ending.

**Key frame (Act III poster):** the round arena at the Spire's peak, the
skull-capsule Mk-I hovering with claws spread, its dome cracked. Outside,
the red shock-ring shatters against a ring of ten coloured relay lights.
Flux's charge shot glows amber, aimed at the crack.

### Ending — First Free Morning (built, #102; after the results screen)

About a minute and a half of film, then the credits and an end card. Skip
is always on screen and goes straight to the card; a tap jumps to the next
caption, and each caption holds 6.5 s. It follows `story.md`'s shots, with
Atlas's choice moved into the lab:

1. **The valley (0–16 s):** "The Grand Master falls. Vex's Red Signal dies
   with it." A white ring rolls out from the Spire, and the relays come
   home in their colours: "One by one, the relays come home, each in its
   own colour."
2. **The lab (16–40 s):** "In the lab, the ice lets go." The capsule's frost
   melts, the glass slides down, and Gauss steps out, her eyes warming.
   Pip bounces for joy.
   Gauss: "Flux... you did it. You brought them all back."
   Then Atlas's globe glows: the choice the old plan set at the empty
   Spire, said in the lab.
   A: "The Spire is empty. I could run this city now. I won't. It's
   theirs."
3. **Sunrise (40–60 s):** "Cyber City wakes to its first free morning." The
   valley at dawn, every relay in its own colour.
   Gauss: "Flux... did you see that spark?" (The spark line moved from
   Atlas to Gauss; no spark is shown, so it stays a hook, not a promise.)
4. **Credits (60–96 s):** the cast, then the Masters with their portraits,
   then "Thank you for playing!"
5. **The end card:** "Cyber City is free!" with *Start New Game+* (behind a
   confirm) and *Back to the Lab*. From then on Gauss stands awake in the
   lab.

The older drafts for this section (the crash shot, "I could run all of
it", "…No. They can run themselves.", "Welcome home. Both of you.") are
not in the built ending.

**Key frame:** dawn over the valley, every sector glowing in its colour, the
black Spire topped with a calm white light. In the lab, Gauss's hand rests
on Flux's crown, Pip spins happy circles, and a tiny cyan globe hovers at
Flux's shoulder.

### After the credits — Mk-II (New Game+ only, as `story.md` decides)

Black screen, one red pixel, the skull faceplate assembling. Add one Vex
bubble: **"The doctor… is IN."** *Not built.* New Game+ itself is: the end
card starts it.

---

## 6. The road to the end boss

How the player gets from the tutorial to the Mk-I. This is the gameplay
spine behind the story.

1. **Scrapyard → Rotor Run in unlock order** (Scrapyard, Blaze Refinery,
   Cryo Plant, Volt Tower, Sky Docks, Polarity Works, Deep Mine, Tidewater
   Locks, Blackout Boulevard, Rotor Run). Each sector's story mission
   ("Core Master Showdown") opens when the one before it is beaten (the
   `after` chain in `data/regions.ts`). Story missions spawn enemies at +1
   level.
2. **Grow between Masters.** The bands overlap (1–4, 3–8, 6–11, 9–15,
   13–19, 16–22, 19–25, 22–28, 25–31, 28–34), so the player takes **jobs**
   in freed sectors (Scrap Duty, Data
   Recovery, Rescue Op, Elite Hunt, Supply Run, Sector Purge) and
   **Tower Runs** (the climb and rematch) to reach each band.
   - Atlas nudges with the sector's floor level on the mission card.
     A: "Blaze runs level 3 and up."
   - When Flux is under the floor, A: "They'll outclass you. Train first."
     This is a warning, never a lock.
3. **Each Master's weapon opens the next Master.** Both weakness rings run
   with the story order, as `story.md`'s Decisions set and `data/bosses.ts`
   now has them:
   - Flame Wave beats Frost;
   - Ice Lance beats Volt;
   - Thunder Arc beats Gale;
   - Gale Guard beats Blaze (on a rematch).

   The five Masters of the second shift form a **second ring**, closed on
   itself and turned the same way:
   - Magnet Pull beats Drill;
   - Drill Bomb beats Tide;
   - Bubble Lance beats Neon;
   - Neon Blade beats Rotor;
   - Drone Swarm beats Magnet (on a rematch).

   On a first run only the two ring openers, Blaze and Magnet, are fought
   without their weakness in hand; the other seven meet the weapon Flux
   copied just before. A weapon capsule, which prefers to lend a weapon Flux
   hasn't won yet, can bring an opener's weakness early, and Tower Run
   rematches pay it off.

   Atlas names the counter live, **reading `weakTo` from the data**, never
   from a hard-coded line: right after "Boss ahead. Deep breath!" it says
   "{weapon} hurts this one!" (`atlas.weak.<weapon>`) when Flux carries the
   weakness, and "No weak spot visible. Move!" (`atlas.noWeak`) at
   the Scrapper's and Vex's doors. For a Master whose weakness Flux hasn't
   copied yet, it says nothing.
4. **The reserve, then the Breach.** Freeing the Gale Master lights the
   fifth relay, but the shield holds. On the next hub visit Vex shows its
   reserve, and Polarity Works opens. Freeing the Rotor Master lights the
   **tenth** relay. On the next hub visit the Breach plays and the **Vex
   Fortress** unlocks.
5. **The Fortress, Lv 31–40.** Its story mission is the longest room map
   (10–12 rooms, the densest encounters, 12 % elites). It passes the empty
   assembly bays and ends at the boss shutter at the Spire's top.
   - A Fortress **Tower Run** (the climb kit: ladders, lifts, crushers, up
     the Spire's antenna) makes a natural second route. It would be a
     **proposal**, and the Tower Run already exists as a job type.
6. **The Mk-I in the Core Descent**, then the **Grand Master Bot**, as in
   section 5. Two final fights back to back: Vex down three floors of the
   Spire, then the giant on its roof, each with retry points. More bosses
   wait for New Game+ (the Mk-II and Master Mk-II rematches, per
   `story.md`).
   > Settled: New Game+ keeps the cap at Lv 40 and scales on its own
   > (`sim/ngPlus.ts`, as `story.md` decides). Its entry is the ending's
   > end card.

---

## 7. Enemy introductions

Two kinds of introduction: **Vex presents** the Core Masters, and **Atlas
scans** the machines.

### Vex presents: Core Master intros

The boss intro already has a name card and the 28-segment bar filling. On
top of that, Vex's ornate bubble pops up beside the card **like a
ringmaster's announcement**, with the Master's eyes glowing red.

- It runs **alongside** the existing entrance and never makes it longer.
- The lines are in section 5, one per Master.

| Master | Vex presents |
| --- | --- |
| Scrapper | **"Warm up act! The SCRAPPER!"** |
| Blaze Master | **"The oldest! The hottest! BLAZE MASTER!"** |
| Frost Master | **"Chill, little droid. FROST MASTER!"** |
| Volt Master | **"Blink and you'll miss it! VOLT MASTER!"** |
| Gale Master | **"Next, please! GALE MASTER, blow him away!"** |
| Magnet Master | **"Attractive, isn't it? MAGNET MASTER!"** |
| Drill Master | **"Time for a deep check-up! DRILL MASTER!"** |
| Tide Master | **"Wave goodbye, droid! TIDE MASTER!"** |
| Neon Master | **"Lights! Camera! NEON MASTER!"** |
| Rotor Master | **"The grand finale! ROTOR MASTER!"** |

The Master's name is filled in from its boss key, in capitals, so it reads
as the game spells it in every locale.

### Atlas scans: machine intros

The **first time** Flux sees each machine type:

- the game drops to 0.35× for 1.2 s;
- a **cyan scan-line** sweeps the machine;
- a small **scan card** pops up with its name (the existing `enemy.*` key)
  and **one glyph tip**;
- Atlas says one short line.

This happens once per profile and never during a scene lesson or the
walkthrough coach; if one is running, the scan waits for the next quiet
moment. Most first sightings happen in the Scrapyard, because every machine
type can spawn there.

| Machine | Glyph tip | Atlas |
| --- | --- | --- |
| Hardhat | eye + crosshair | "Hardhat. Shoot when it peeks." |
| Shield Trooper | shield ✗ pellet, ✓ charge | "Shield. Charge through it." |
| Rotor Drone | arrow-up + crosshair | "Rotor Drone. Look up." |
| Stomper | down-arrow + ring | "Stomper. Move off the ring." |
| Gear Roller | two arrows sideways | "Gear Roller. Sidestep it." |
| Guardroid | heavy fist + parry | "Guardroid. Parry, then punish." |
| Wall Cannon | wall + slide | "Wall Cannon. Keep moving." |
| Crate Golem | crate + footsteps toward | "That crate's breathing. Get close." |
| Polar Pup | blue shell ✗ pellet, red open + crosshair | "Polar Pup. Shoot it when it opens red." |
| Mole Driller | red floor marker + arrow up | "Mole Driller. Keep moving, hit it when it pops up." |
| Puffer Mine | swelling ring + crosshair | "Puffer Mine. Pop it before it swells." |
| Glow Stalker | two eyes + parry | "Glow Stalker. Watch for its eyes, parry the lunge." |
| Hornet Rotor | red rotor + arrow sideways | "Hornet Rotor. It dives straight: sidestep!" |
| Elite (gold ring) | gold ring + skull | "Gold ring. Elite. Careful." |
| First elemental machine | element icon + shield | "Fire-coated. It shrugs off fire." (one line per element) |

The tutorial already teaches the Hardhat, Trooper and Stomper through its
lessons. In the tutorial the scan card **only names** the machine and skips
the tip, so it doesn't teach the same thing twice.

---

## 8. Atlas in the field: the warning catalogue

Atlas is the mission's voice: **warnings, hints, and pushing the story
forward**. Every line has a **glyph** so it reads with the sound off and in
every language. The subtitle is an i18n key. The English VO is a later
drop-in.

### Rules

- **One line at a time**, from a priority queue. Danger comes before a hint,
  and a hint before flavour. Keep at least 6 s between lines, except for
  danger lines.
- **Never over** a scene lesson, the walkthrough coach, a boss name card
  (Vex has the stage there) or a Flux fumble bubble.
- **Teaching lines play once.** After that a shorter variant plays, or
  nothing.
- **Setting:** *Atlas chatter: All / Warnings only / Off*. It is a new
  Options item.
- **HUD slot:** the globe glyph and a one-line subtitle, at most 2 lines at
  320 px. Its exact position has to be fitted against the 320×658 HUD (the
  boss chip, energy bars and mute button already share the top row).

### Catalogue

| Trigger (existing system) | Glyph | Line (first / later) |
| --- | --- | --- |
| Boss door danger kit, first sight | skull | "Core Master signal. It's… big." / "Core Master ahead." |
| Boss door, right after "Boss ahead. Deep breath!", Flux owns its weakness | weapon icon | "{weapon} hurts this one!" (`atlas.weak.<weapon>`) |
| Boss door, the Scrapper or Vex (no weakness) | weapon icon ✗ | "No weak spot visible. Move!" (`atlas.noWeak`) |
| HP < 50 %, gel carried (gel lesson moment) | heart + gel | "Plating's cracking. Use a gel." / "Gel." |
| HP < 25 % | heart, blinking | "Critical! Back off!" / "Critical!" |
| HP < 25 %, no gel | heart + ✗ gel | "No gel left. Play it safe." |
| Weapon energy < 25 % | WE bar | "Weapon energy low. Buster's free." |
| WE empty, weapon pressed (`combat.noEnergy`) | WE bar ✗ | "Tank's dry." |
| Borrowed weapon, last charge | horseshoe | "Last shot of {weapon}." |
| Corridor flame trap, first sight | flame + slide | "Vents. Wait for it… or slide." / — |
| Pendulum blade, first sight | blade + slide | "Blade. Go right after it." / — |
| Climb: crusher warning lamp | crusher | "Crusher. Watch the lamp." / — |
| Climb: first ladder | ladder | "Ladder. Push toward the wall." / — |
| Climb: pit edge / lift | pit | "Long drop. Time the lift." / — |
| Objective locator shows | yellow triangle | "Objective's that way." (first 2 times only) |
| Rescue job, worker-bot near | worker-bot | "Worker-bot signal. Faint. Close." |
| Chest loot is an upgrade | up-arrow | "That's an upgrade." |
| Level-up | chip | "New chip compiled." |
| Story mission start (relays lit so far) | relay ring, lit count | One line per count: "One relay lit. Nine to go!" … "One Master left. Almost!" (9) … "Shield's down. Vex is next!" (10) (`atlas.arc.1`–`.10`) |
| Objective complete | check | "Done. Call the drone when ready." |
| *System down*, Pip's pull-back | Pip's eye | "Rebooting… Pip's got you." |
| Blackout Boulevard, first power cut (built) | globe | "Power's failing! Cross when the lights come back." (`atlas.hint.neon.blackout`) |
| Deep Mine, ore cart: board / the drop / the end (built) | globe | "Ore cart's rolling! I steer, you shoot the moles." / "Steep drop! Hold on tight!" / "Last stop. Out you hop!" (`atlas.hint.drill.board` / `.dip` / `.arrive`) |
| Core Descent: the roof / each fall (built) | globe | "Lightning! Move when the ring lights up!" / "The roof's giving way!" / "Down to the Core! Don't fall in!" (`atlas.hint.vex.roof` / `.fall` / `.core`) |
| Grand Master Bot: the button, each part, the Prism Cannon (built) | globe | "Vex is pressing something... Brace yourself!" / "Its arms first! The cannon and the lance!" / "Now the feet! Block the shockwaves!" / "It's down low. The head is in reach!" / "The core is open! Finish it!" / "Prism Cannon! Shield up!" (`atlas.hint.gm.*`) |
| Levers / switches | lever | *No levers in the level kit yet.* Suggested line when they exist: "Switch. Try it." |

All lines are ≤ 7 words in English. Localized subtitles may run longer, so
the 2-line cap is the real limit.

---

## 9. Damage barks: Flux's cartoon yelps

Flux never *talks*. The story is carried by Atlas, Vex and pictures. But he
**yelps**. The game already has a Flux speech bubble (`FluxBubble.vue`, used
by the fumble lines such as "Bzzt! Oops!"), so barks reuse it: a comic-style
pop with bold, bouncy lettering.

He's a friendly chibi robot, so the barks mix **cartoon ouch** with **tin-can
robot sounds**:

| Hit | Barks (pick at random) | Feel |
| --- | --- | --- |
| Light hit | **"Oof!"** · "Ow!" · "Hey!" | a quick flinch |
| Heavy hit / knockback | **"KLONK!"** · "Arrgh!" · "Whoa-oa!" | a dented tin can |
| Fire | **"Yeowch!"** · "Hot-hot-hot!" | hopping |
| Ice | **"Brrr-zzt!"** · "Ch-chilly!" | teeth chatter (servos) |
| Volt | **"Bzzzt!"** · "Zzap!" | a static frizz |
| Wind | **"Whoa-oa-oa!"** | spun around |
| Trap (flame/blade) | **"Yikes!"** · "Not cool!" | caught out |
| Crusher | **"Squonk!"** | flattened, cartoon style |
| Pit fall | **"Wha— aaaa!"** | a Doppler fade |
| HP first drops < 25 % | **"Nnngh!"** | gritting it out |
| *System down* | **"Uh-oh…"** | powering down |
| Parry (bonus) | **"Ha!"** | cocky |
| Repair Gel used (bonus) | **"Aaah~"** | relief |

The **signature pair** is **"Oof!"** for light hits and **"KLONK!"** for
heavy ones. "KLONK!" is the Mega Droid sound.

**Rules**

- **Throttle:** at most one bark per 3 s. Light hits bark only about 40 % of
  the time. Anything that ends a combo or knocks Flux back always barks.
- The fumble line has priority, and barks never appear during cutscenes or
  Vex's boss intro bubble.
- **i18n:** barks are keys (`flux.hurt.light.1` …). Translators
  **localize** the onomatopoeia rather than transliterate it: de "Autsch!",
  fr "Aïe !", ja "いてっ!", es "¡Auch!", ru "Ой!". "KLONK!" and "Bzzzt!" can
  stay as sound effects if the locale prefers.
- **VO:** short robot grunts with a synth tail. See `story-voice-over.md`.

---

## 10. Words on screen

`story.md`'s rule was **no words at all**. This file adds words, as **a
layer, never load-bearing**:

- Every beat still reads with the bubbles unread and the sound off: colour,
  glyphs and pictures carry the plot, exactly as `story.md` requires.
- Every Vex bubble, Atlas subtitle and bark is an i18n key in `en.ts`,
  propagated to all 20 other locales.
  - Vex's bubbles: ≤ 8 words.
  - Atlas: ≤ 7 words.
  - Barks: 1–3 words.
- Bubbles in cutscenes are timed on the game-loop clock and hold for at
  least 1.8 s. Tapping advances. They never pause gameplay.
- Screen-reader lines (`story.*`) stay as `story.md` lists them, and the
  bubbles don't replace them.

---

## Changes to story.md

These change or extend the canon, so confirm them before anything is built:

1. **Words come back as a layer**: Vex's bubbles, Atlas's subtitles and VO,
   and Flux's barks. This changes "The story uses no words".
2. **Atlas joins the cast**: a new character, a HUD slot and an Options
   setting. It also makes the "Flux's only company" line about Pip no longer
   true.
3. **The intro gains a cold open** (shot 0), and the valley and signal shots
   are merged. The 18 s cap is dropped: the cut is paced for a first watch
   (57 s) and skippable at any time.
4. **The Cyber City look turns neon/cyberpunk** under Vex. The sector
   identities are unchanged.
5. **New story beats:**
   - the Atlas/VEX sibling reveal at the midpoint;
   - Vex trying to overwrite Atlas in the Volt Tower;
   - the relays holding at the Mk-I's half health;
   - Atlas's choice at the empty Spire;
   - the empty assembly bays in the Fortress.
6. **Gauss's optional single line** at the end.
7. **Data (done):** both weakness rings in `data/bosses.ts` (and the
   machines' `COUNTER`) now run with the story order, so the Atlas weakness
   hints are right.
8. **The second shift: ten Masters, ten relays.** Five new Core Masters
   (Magnet, Drill, Tide, Neon, Rotor) sit between the Sky Docks and the
   Fortress. The shield falls only after the tenth relay, so the Breach moves
   from after the Gale Master to after the Rotor Master. A new hub beat, the
   reserve, plays after the Gale Master. The Fortress band moves to Lv
   31–40, and the new Masters form a second weakness ring of their own,
   which runs with the story order like the first.
9. **The finale (built).** Vex's fight becomes the Core Descent (roof,
   reactor hall, Core ring), and the Mk-I is no longer the only final boss:
   the Grand Master Bot follows it. The ending is "First Free Morning":
   Atlas's choice moves into the lab, the spark line goes to Gauss, Gauss
   speaks two lines, and the end card starts New Game+.
