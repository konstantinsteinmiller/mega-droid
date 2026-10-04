# Mega Droid — game design document

## One line

A first-person action-RPG in the shape of *The Elder Scrolls: Blades*: take a
mission, teleport into a sector, explore it room by room, blast machine
enemies with a charge buster, loot chests, level up and spend Skill Chips on
circuit boards. The cast is original chunky, rounded androids in the spirit of
the 8-bit blue-bomber era (Mega Man 2–6), rebuilt as smooth low-poly 3D.

No town building and no endless dungeon (the Abyss is cut). What stays is the
Blades loop: **mission → explore → fight → loot → level → next mission**.

## Setting

Cyber City was an android city run by ten Core Masters, robot foremen that
each ran a sector (refinery, cryo plant, power tower, foundry, mine, harbour
and so on). The rogue AI
**Dr. Vex** reprogrammed them and filled the sectors with hostile machines.

The player is **Flux**, a combat android in pearl-white armour over a
graphite undersuit, with amber eye-lights behind a dark visor and an arm
buster, woken by his maker **Prof. Gauss** (an elderly android scientist).
His support unit **Pip** is a small hovering helper bot. It runs the mission
terminal and hands out jobs.

No humans and no fantasy creatures. Everyone is an android or a machine.

> **IP guard.** Every name, silhouette and palette is original. The game
> evokes the classic look (chibi proportions, arm cannon, segmented vertical
> health bar, weapon-copy, boss shutters, beam-in teleport, orb-ring death
> burst) but never ships a Capcom name or a 1:1 character copy. Flux's head
> is his own: a swept-back crown with a V-shaped brow, a wraparound visor
> band with two amber eye-lights, a jaw guard and one antenna blade, never a
> round helmet with a face in it. Enemies are
> *archetypes*: the helmet-hider, the shield trooper, the heli drone, the
> hopper, the wheel roller and the heavy brute.

## The loop

```
Hub (mission terminal)  →  pick story mission or job  →  beam in
   ↑                                                        ↓
   │        explore rooms · open doors · smash crates · open chests
   │        enemies notice you → lock-on combat → kill → XP / bolts / loot
   │        objective done → beam out
   │                                                        ↓
   └──  results (XP, bolts, items) → level up → Skill Chip + attribute pick
        → equip / upgrade gear → spend chips on circuits → next mission
```

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | floating joystick on the **left half** | WASD (↑ / ↓ too) |
| Look | **drag** on the right half | **move the mouse** (captured: pointer lock) · ← / → turn |
| Walk to point | **tap the floor** (Blades' signature). A* path over the nav grid, a ground ring marks the target | — (only where the capture is refused: click the floor) |
| Interact | tap the door / chest / NPC / item (or the contextual button) | `E` — every prompt shows its key: "[E] Open" |
| Fire | **tap** in combat → quick buster shot at the locked target | **left click** |
| Charge shot | **hold** without moving → the ring around the crosshair fills (lv1 → lv2). Release at full = Charged Shot. Release inside the **perfect flash** window = critical | **hold the left button**, release |
| Block / Parry | hold the **shield** button (right-thumb cluster). Blocking while an enemy's attack ring closes = **Parry**: projectiles reflect, melee staggers | hold the **right** mouse button (`Shift` also works, untaught) |
| Slide (the dodge) | **Slide** button. Short dash with i-frames | **`Space`** (`Q` also works, untaught; never `Ctrl`: Ctrl+W with W held closes the tab) |
| Special weapons | two slot buttons (right side), cost Weapon Energy | `1` / `2` |
| Borrowed weapon | a third weapon button (left of the first slot, over the second) while a capsule's charges last (a horseshoe of pips, no energy) | `3` (keycap on the button) |
| Repair Tank | tank button, full heal, limited count | `H` |
| Beam out | the **Beam out** button, once the objective is done and the room is quiet | `B` ("[B] Beam out") |
| Switch target | **look at** the other enemy | look at it, or `Tab` |
| Pause / map | ⏸ top-right | `Esc` / `P`, `M` |
| Show the controls again | **?** top-right | **?** top-right, or `F1` / `?` (keycap on the button; the pause button shows `Esc`) |
| Mute / unmute | the **speaker** top-right, left of **?** (a hard silence on phones) | the speaker, or `F2` on any screen (keycap on the button) |

**The captured mouse (desktop).** A first-person shooter on desktop means
pointer lock: the first click on the scene captures the mouse (that click
fires nothing; a click glyph sits on the crosshair until it happens), then
moving the mouse looks, the left button shoots and charges, the right button
blocks. `Esc` belongs to the browser while the mouse is captured: it releases
the capture, and a lost capture opens the pause menu (the same Esc does not
close it again). Modals, ads and the hub hand the mouse back; *Resume* takes
it again. A captured mouse aims itself: no soft lock pulls the camera, and a
shot only snaps onto a machine right under the crosshair (0.09 rad plus the
machine's size), otherwise it flies to where the view meets a wall. Where the
browser refuses the capture (a sandboxed embed) the mouse falls back to
drag-to-look, press-vs-drag below. Keycaps on every prompt and HUD button use
the player's keyboard layout (an AZERTY player sees Z Q S D).

**No browser behaviour on top of the game** (`src/use/useBrowserGuard.ts`,
installed by `App.vue`). The browser's defaults are cancelled everywhere
except in text fields: every context menu, the right, middle and thumb
buttons (Opera and Vivaldi mouse and rocker gestures — hold right + drag down
opened a new tab in the middle of the shield lesson — autoscroll, history
navigation), wheel tab-switching with the right button held, image drag, text
selection, Firefox's quick find (`/`, `'`), F1's help page and a lone Alt's menu
bar. A right press also captures a free mouse, since a gesture needs a free
cursor to draw with. On touch the page never pans, zooms or pulls to refresh
(`touch-action: none` on the page; scroll lists keep their own panning). Left
alone on purpose: browser shortcuts (Ctrl+W, F5), Esc, and Firefox's
Shift + right-click menu, which no page can stop.

Opera's (and Vivaldi's) own gestures are recognised in the browser before the
page sees the press, so no cancel reaches them — and the shooter's chords ARE
gestures there (hold left to charge + press right to block = rocker "back";
hold right + look down-right = close tab). So **while the mouse is captured**
a navigation guard makes the result harmless: a same-document history entry
on top absorbs "back" (and is put back), and a `beforeunload` confirmation
catches a close. It comes off when the game hands the capture back, and 2.5 s
after the capture is lost (the stroke that broke it may still be finishing).
Not on the Playgama / YouTube build. The only complete fix in Opera is its
own setting (Settings → Shortcuts → mouse / rocker gestures off).

**Press vs drag.** In combat a press is a shot and a hold is a charge, but a
press that travels more than ~10 px (mouse) / 16 px (touch) becomes a look
drag: the charge is dropped, never fired. Deciding fire-vs-look at the press
made every drag near an enemy a charge, and the camera simply would not move.

**Combat lock-on.** Once an enemy has noticed Flux and is within 16 m, the
camera soft-locks onto the nearest engaged enemy: yaw eases toward it.
A manual look always wins: the lock stands aside for 1.1 s after the last
drag, and if the player has turned onto another enemy by then, that one takes
the lock. Movement stays live, so circle-strafing around projectiles is the
MegaMan-style skill layered on the Blades rhythm. When the last engaged enemy
dies the lock releases and free look comes back.

### Teaching the controls: the coach

No sentences. Every control is taught by a **glyph** where the action happens
(`src/game/sim/coach.ts`, `ControlHints.vue`, `CoachRing.vue`):

- Desktop: a WASD cluster bottom-left, a mouse with the drag arrows at the
  right, and action cards (the mouse with the button to press lit, or the key)
  just under the crosshair. Touch: a finger tracing an **∞** in the lower left
  (drag there to move), a finger that drags / taps / holds, and a pulsing ring
  on the HUD button itself (a ring **closing** onto the shield button for the
  parry). A hold reads as a hold even in a still frame: a 3/4 ring with a tick.
- **Move and look are never silenced.** A scene lesson may quiet every other
  glyph, but move and look show from the first frame on touch and keep their
  stuck recall until they are learned (a lesson that hid them cost a playtester
  the joystick for a whole session).
- Each glyph stays until the control has actually been **used** a few times
  (move 3 × 2.5 m, look 3 × 35°, fire 4, block 2…). Every success flashes it
  green and fills a pip; the last pip pops a check and the glyph retires.
  **Nothing times out.**
- Context brings glyphs in: fire when an enemy is in the sights, block on a
  blockable wind-up, slide on a red one, the tank at low health, interact at a
  chest. At most two at once, most urgent first.
- Stuck detection brings them back: no camera movement for 18 s, no movement
  for 16 s, no shot for 7 s in a fight, three blockable hits in a row without a
  block. One use retires a recalled glyph.
- The **?** button in the top bar brings back the core set on demand; the
  pause menu shows every control as glyph → action icon.
- Progress is saved per input family (touch vs mouse + keys): a desktop veteran
  on a phone still gets the joystick.
- One input per glyph: "Shift or right-click" was read as Shift+right-click,
  which Firefox answers with its own context menu — uncancellably.
- The sentences survive only as screen-reader labels (`tips.*`, `pause.*`).

## Combat rules

| Rule | Value |
| --- | --- |
| Quick shot | 1 pellet, dmg `buster × 1.0`, fire cooldown 0.22 s, 3 pellets max in flight (classic cap) |
| Charge | lv1 at 0.55 s (dmg × 2.2, pierces), lv2 **full** at 1.2 s (dmg × 4, staggers, breaks guards). Skill `Quick Charge` shortens both. With the **Overload** mod, holding a full charge 3 s more fires lv3 (dmg × 7, 1.75 × a full charge): a gold-white comet in the epic violet. Charge-speed upgrades never shorten those 3 s |
| Perfect release | a window of 0.22 s that opens 0.1 s after full charge. Release inside it for a **crit** (× 1.5, gold burst, hit-stop) |
| Block | while held: frontal damage × 0.25, costs **Power** (stamina) = 40 % of the blocked damage. At 0 Power the guard breaks and Flux is stunned for 0.6 s |
| Parry | block pressed within the enemy telegraph's last **0.28 s** (the ring is nearly closed and flashes white). Projectile → reflected at 2× damage. Melee → enemy stunned for 1.6 s, taking × 1.5 damage |
| Slide | 0.28 s dash of 4.2 m, i-frames 0.22 s, cost 25 Power, cooldown 1.5 s start to start (Slide Boosters cut it 15 % per rank, never below 1.0 s: 1.275 s, 1.05 s, 1.0 s). A press during the cooldown is dropped, not queued |
| Power | 100 base, regenerates 22/s when not blocking (1 s delay after spending) |
| Weapon Energy (WE) | 28 segments base (the classic bar). Special weapons spend it. Refilled by WE capsules and by leveling |
| Borrowed weapon | a capsule's copied weapon for the mission: **no WE**, one charge per shot (Scrap Burst 10, Flame Wave 8, Ice Lance 8, Thunder Arc 6, Gale Guard 6, Magnet Pull 8, Drill Bomb 6, Bubble Lance 8, Neon Blade 8, Drone Swarm 6), own cooldown; see *Borrowed weapons* |
| Health | 28 segments shown; internally `maxHp` (100 base), the bar draws `ceil(hp / maxHp × 28)` segments. A heart heads the bar (a bolt heads the weapon-energy bar); under 30 % it turns red, pumps, and a red edge vignette beats with it |
| Enemy energy | Mega Man segmented bars: the target frame shows 20 chunky cells (the last lit one blinks at ≤ 20 %, elites ringed in gold); a boss's 28-segment bar stands third beside the player's two, filling step by step on its intro |
| Hit-stun on Flux | 0.25 s flinch, 0.8 s i-frames with blink (classic) |
| Weakness | every Core Master is weak to one special weapon (× 2.5 dmg + stagger). Elemental enemies are weak to the counter element (× 1.75) |
| Invulnerable states | Hardhat hidden, Shield Trooper guarding from the front: shots **deflect** with a "tink" and a diagonal ricochet. Charged lv2 breaks a guard |

Enemies **telegraph** every attack with a shrinking ring above them: orange
means block, red means unblockable (slide out of it). The ring's last 0.28 s
flashes white. That is the parry window.

## Enemies (archetypes)

| Id | Name | Behaviour | Teaches |
| --- | --- | --- | --- |
| `hardhat` | Hardhat | Hides under an invulnerable helmet, peeks, fires a 3-way spread, hides again | patience and timing |
| `trooper` | Shield Trooper | Guards the front with a big shield, lowers it to fire a 3-round burst, sometimes hops | charge shots break guards, parry the burst |
| `heli` | Rotor Drone | Hovers at head height, swoops in for a ram (blockable melee) | parry melee |
| `hopper` | Stomper | One-eyed hopping walker. Leaps and lands with an AoE stomp (red: unblockable) | slide out of red rings |
| `roller` | Gear Roller | Rolls in a straight charge, stuns itself on walls | sidestep and punish |
| `brute` | Guardroid | Big and slow: two-hit punch combo plus a ground slam | block, then parry |
| `turret` | Wall Cannon | Stationary, lobs arcing shells | move while shooting |
| `polar` | Polar Pup | Floating orb (Polarity Works). Its blue shell repels shots; it opens red to fire | shoot into the open shell |
| `mole` | Mole Driller | Tunnels under the floor (Deep Mine) and bursts up on a red marker | keep moving, punish when it surfaces |
| `puffer` | Puffer Mine | Drifts (Tidewater Locks), swells, and bursts in a ring | pop it early, or get clear |
| `stalker` | Glow Stalker | Dark, shows only its eyes (Blackout Boulevard). It whines, then lunges | read the tell, parry stops it |
| `hornet` | Hornet Rotor | Spins up red, then dives straight (Rotor Run) | sidestep, or parry and it crashes |
| `golem` | Crate Golem | Sleeps as the sector's supply crate against a wall: never noticed, locked on to or woken by noise, and the first hit of anything only wakes it (TINK, no damage; untouchable through its 0.8 s unfold). Awake it keeps 6–12 m, backing off faster than it closes, throws two rocks (orange: block, parry them back) then lobs a boulder at your feet (red, floor marker). A charged shot fired from beyond 5 m it hops out of the line of (sides alternate, 1.2–1.6 s cooldown, never mid-wind-up, not when walled in); pellets and copied weapons it never dodges. Placed apart from the sector tables (14–24 % of combat rooms), never in the tutorial, never a job target; purge counts it (the trail leads to it last) | get close — or corner it, bait the hop, parry its rocks |

Region variants tint the same rig and add an element: **Blaze** (fire, burn
DoT), **Cryo** (ice, slow), **Volt** (electric, chain). **Elites** have a gold
trim, × 2.5 HP, one affix (shielded, swift, volatile, regenerating) and a name
tag.

### Core Masters (bosses)

A boss room sits behind a double shutter door. The fight opens with a name
card, and the boss has 3 or 4 patterns with a phase change at 50 % HP.
The boss is not in its arena before the entrance (`Enemy.offstage`): through
the open shutter the room is empty, and nothing can hit, wake, target or bump
into it. Stepping in drops it from above the walls (9 m over its own height),
landing with a shock ring while the shutter slams behind the player.

| Boss | Sector | Patterns | Drops weapon | Weak to |
| --- | --- | --- | --- | --- |
| Scrapper (mini, tutorial) | Scrapyard | charge, scrap toss, stomp; phase 2: the arena's magnet crane drops crates on rings near Flux (they hurt the Scrapper too, and stay as cover with an energy pill) | **Scrap Burst** (3-way spread) | — |
| Blaze Master | Blaze Refinery | fire wave, leaping slam, flame ring | **Flame Wave** (ground fire, burn DoT) | Gale Guard |
| Frost Master | Cryo Plant | ice lance volley, freeze floor, dash | **Ice Lance** (piercing, freezes) | Flame Wave |
| Volt Master | Volt Tower | chain lightning, orb storm, teleport | **Thunder Arc** (chains to 3) | Ice Lance |
| Gale Master | Sky Docks | tornado push, feather blades, dive | **Gale Guard** (orbiting shield, throwable) | Thunder Arc |
| Magnet Master | Polarity Works | homing horseshoe missiles, Pole Pull (drags Flux in, then a clamp), rail-straight charge; phase 2: Polar Storm | **Magnet Pull** (homing horseshoe; cracks guards and shells, yanks flyers down) | Drone Swarm |
| Drill Master | Deep Mine | burrow and erupt under Flux, drill bombs, charge; phase 2: quake (rings, falling rock) | **Drill Bomb** (bores on, bursts, splashes; breaks cracked rock) | Magnet Pull |
| Tide Master | Tidewater Locks | lance thrust, tidal waves (slide under), slow bubble volley; phase 2: whirlpool pull | **Bubble Lance** (a bubble rolling along the floor through every machine) | Drill Bomb |
| Neon Master | Blackout Boulevard | blade thrown out and back, dash, neon volley; phase 2: laser grid | **Neon Blade** (a boomerang that cuts going and coming) | Bubble Lance |
| Rotor Master | Rotor Run | drone swarm, downdraft (blows Flux back), dive; phase 2: rotor storm | **Drone Swarm** (three homing drones) | Neon Blade |
| Dr. Vex Mk-I | Vex Fortress | every pattern above, in the three-stage Core Descent (below) | — | none |
| Grand Master Bot | Vex Fortress (the Spire's roof) | four parts in turn: arms (fire fans, ice), feet (shockwaves), head (laser sweep), core (every Master's attack); the Prism Cannon from the head on | — (the ending, credits + New Game+) | per part: its Master's weakness |

Both weakness rings run **with** the story order: each Master is weak to the
weapon of the Master freed just before it, and each ring's first Master
loops round to its ring's last. The first ring: Gale Guard beats Blaze,
Flame Wave beats Frost, Ice Lance beats Volt, Thunder Arc beats Gale. The
five new Masters form a second ring, closed on itself: Drone Swarm beats
Magnet, Magnet Pull beats Drill, Drill Bomb beats Tide, Bubble Lance beats
Neon, and Neon Blade beats Rotor. So on a first run only the two ring
openers, Blaze and Magnet, are fought without their weakness in hand; the
other seven meet the weapon Flux has just copied. Elemental machines follow
the first ring (× 1.75): fire is weak to wind, ice to fire, volt to ice,
wind to volt.

At the boss door, right after "Boss ahead. Deep breath!", Atlas says
"{weapon} hurts this one!" (`atlas.weak.<weapon>`) when Flux carries the
Master's weakness, and "No weak spot visible. Move!"
(`atlas.noWeak`) at the Scrapper's and Vex's doors, which have none. For a
Master whose weakness Flux hasn't copied yet, Atlas says nothing.

**The finale** (`sim/coreDescent.ts`, `sim/grandMaster.ts`). Two fights back
to back, with a retry-from-checkpoint point at each landing:

- **The Core Descent** (#109): Vex on the Spire's **roof** under a lightning
  storm (a strike every 3.2 s on a ring near Flux, 8 % of his health,
  unblockable). At **65 %** of Vex's health the roof gives way into the
  **reactor hall** (fire, shock and gusts cycling); at **30 %** onto a
  narrow **ring round the molten Core**, where Vex attacks quicker (tempo
  × 0.8). Each fall is a 1.6 s scene (rumble, black, landing, Vex's
  entrance again); Vex can't be hit during it. Atlas: `hint.vex.roof` /
  `.fall` / `.core`.
- **The Grand Master Bot** (#101): when Vex falls he presses a big red
  button; the ten Masters' bodies drop onto the roof and assemble (Drill
  and Tide feet, the Scrapper's chest, Volt and Magnet shoulders, Blaze's
  cannon arm, Frost's lance arm, Gale and Rotor wings, Neon's head). Health
  **2.5 ×** Vex's. Four parts in order, one weak spot at a time, marked by
  Atlas: **arms → feet** (block the shockwaves; with its feet gone it sinks)
  **→ head** (a laser sweep after a glow) **→ core** (every Master's attack
  at random). A hit on the weak spot does × 1.5, the part's Master's
  weakness × 2. From the head on, every 9 s it charges its **Prism
  Cannon** (a ten-colour ring for 1.5 s, then a wide beam swept across the
  roof). Its state rides in the climb's save, so a reload or retry keeps
  broken parts broken. Atlas: `hint.gm.*`.

Sector bands:
Polarity Works 16–22, Deep Mine 19–25, Tidewater Locks 22–28, Blackout
Boulevard 25–31, Rotor Run 28–34, Vex Fortress 31–40. The Fortress shield
falls after the tenth relay (the Rotor Master).

## Progression

- **XP and level.** XP comes from kills, quests and first-time chest opens. The
  curve is `xpToNext(L) = round(60 × L^1.55)`, level cap 40. Every level-up
  gives **+1 Skill Chip** and a pick of one attribute: **+10 Max HP**,
  **+4 Max WE** or **+10 Power** (the Blades triad). The levelled stat is also
  refilled.
- **Enemy level** comes from the sector's base level plus the player's level
  (Blades-style soft scaling): `clamp(regionMin, playerLevel ± 1, regionMax)`.
- **Bolts** are the single currency (Poki-safe), drawn as a hex nut everywhere
  (⚡ means energy and the charge shot only; rewards read "+140"). They drop from enemies, crates
  and chests and are spent in the Workshop.

### Skill system — the three circuit boards

Skill Chips are spent on nodes. Each node has ranks, and a node unlocks once
the node before it has at least one rank. Respec costs bolts.

**Buster Circuit (offense)**

| Node | Ranks | Effect / rank |
| --- | --- | --- |
| Rapid Pellets | 5 | quick-shot dmg +10 % |
| Quick Charge | 3 | charge time −10 % |
| Mega Charge | 5 | charged dmg +12 % |
| Perfect Timing | 3 | perfect window +25 %, crit × +0.15 |
| Piercing Core | 1 | charged lv1 also breaks guards |
| **Overload** (mod) | 1 | a 3rd charge level: hold a full charge 3 s more, × 7 dmg. Not bought with a chip (below) |

**Armor Circuit (defense)**

| Node | Ranks | Effect / rank |
| --- | --- | --- |
| Reinforced Frame | 5 | max HP +8 % |
| Barrier Tuning | 3 | block Power cost −15 %, block dmg −5 % |
| Parry Protocol | 3 | parry window +0.05 s, parry stun +0.3 s |
| Auto-Repair | 3 | regen 1 % max HP/s out of combat |
| Spike Plating | 3 | reflect 15 % of blocked dmg |
| Last Stand | 1 | once per mission survive a lethal hit at 1 HP |

**Core Circuit (utility and special weapons)**

| Node | Ranks | Effect / rank |
| --- | --- | --- |
| Energy Cells | 5 | max WE +3 segments |
| Weapon Mastery | 5 | special weapon dmg +10 % |
| Efficient Cores | 3 | WE cost −10 % |
| Slide Boosters | 3 | slide cooldown −15 %, cost −5 |
| Bolt Magnet | 3 | bolts +15 %, pickup radius +40 % |
| Tank Capacity | 2 | +1 Repair Tank capacity |

Each board has six nodes (18 in all), laid out as a small tree: one root,
two branches, three leaves.

**The Overload mod** (#100, `data/skills.ts` `OVERLOAD_PRICE`) sits on the
Buster board's middle leaf but lives outside the chip economy: it is drawn
in violet, costs no Skill Chip, is bought once for **2300 bolts** in
Circuits, and a respec never refunds or removes it. It unlocks with the
Gale Master's Gale Guard. On the first lab visit after the Gale Master, Pip
announces it ("Hold a full charge 3 more seconds: OVERLOAD!") and opens
Circuits on it (`PipNotice.vue`, once per profile).

**Special weapons** (the MegaMan "weapon copy") are separate from the boards.
Each one comes from a boss, is equipped in one of **2 slots** and levels up
through use (kills with that weapon grant weapon XP, 3 ranks). Equipping one
tints Flux's arm cannon in its colour, as the classic did.

**Borrowed weapons** (`sim/borrowed.ts`, `models/weaponCapsule.ts`): in the TV
show Mega Man took an android's skill for a while; here a mission can leave a
**weapon capsule** that lends a copied weapon for that mission only.

- *The capsule* never reads as a health or energy pill: an upright glass
  capsule hovering over an emitter plate, everything in the weapon's colour —
  the orb inside, a small hologram of the weapon over it (three shards, a
  flame, a lance, a lightning bolt, three leaves, a horseshoe, a drill bit,
  a bubble and a little one, a crescent, three little drones), a tilted halo ring
  wobbling round it, and a column of light out of the plate that fades
  upward, so it is seen from across a room. Walking into it takes it: an orb
  burst and a rising ring in its colour, a "weapon get" jingle, a toast with
  the weapon's name and charges. It hangs under its room's group (portal
  culling hides it with the room).
- *The grant*: preferably a weapon Flux has **not won yet** (a taste of a Core
  Master still ahead), else one of his that is not slotted, else any. It
  fires through the real weapon system — same look, pierce, freeze, burn,
  boss weakness — at the rank Flux has for it (rank 1 if never owned). **No
  Weapon Energy**: each shot spends one charge (Scrap Burst 10, Flame Wave 8,
  Ice Lance 8, Thunder Arc 6, Gale Guard 6, Magnet Pull 8, Drill Bomb 6,
  Bubble Lance 8, Neon Blade 8, Drone Swarm 6; Gale Guard's charge is the cast,
  hurling the leaves rides on it; a Thunder Arc with nothing to hit spends
  nothing). At 0 it pops at the muzzle with a falling blip and the button
  pops out. It never enters the hero's weapons or slots and never outlives
  the mission; a **resumed** mission keeps the charges left and which
  capsules are taken (the mission snapshot). Kills with a weapon Flux does
  not own grant **no weapon XP**; lending one he owns trains it as usual.
- *Another capsule*: the same weapon tops the charges back up (a full slot
  walks past it and leaves it standing); a different weapon replaces it.
  Placement lends one weapon per mission, so a second capsule is a refill,
  never a trap that throws away charges.
- *Where*: the climb's harder reward ledge (the crusher bridge's alcove) has
  one as its prize, at the ledge's height, on the capsule's own plate (the
  ladder shaft's ledge keeps its big health capsule). A regular story or job
  map has a 35 % chance of one, in the middle of a treasure room (else a
  side room off the main path). **Never in the tutorial.** All from the map
  seed on a stream of its own, so the map, its spawns and every other seeded
  draw are unchanged.
- *The button*: a third weapon button left of the first slot, over the
  second (the three make one block, low enough to stay clear of the coach's
  look and fire glyphs on a landscape phone), in the weapon's colour, a
  horseshoe of pips round it for the charges left (open at the bottom, where
  its keycap `3` sits on desktop); no cost badge, no words.
- *The first take in a profile* is taught the coach's way: the button
  breathes inside the coach's pulsing ring, and over it a card shows its key
  (`3`) or a tapping finger (the card is kept off a fight; the ring on the
  button hides nothing); the first shot flashes the ring green and pops the
  check. It waits while a scene lesson has the stage.

### Gear (loot)

| Slot | Main stat |
| --- | --- |
| Buster (arm cannon) | damage, plus charge speed / fire rate rolls |
| Helmet | armor + HP |
| Chest | armor + HP |
| Boots | armor + slide / move speed |
| Chip × 2 | pure affixes (crit, WE regen, bolts, element resist) |

Rarity (weights at drop time): Standard 60 % (white), Tuned 28 % (blue),
Prototype 10 % (purple), Legendary 2 % (orange). An item has an item level (the
enemy or quest level) and 0–3 affixes by rarity. Gear **recolours Flux's
model** in the Hero screen and in the first-person arm.

**Workshop:** upgrade an item (+1 level, cost `25 × lvl^1.4` bolts, max +10),
salvage an item for bolts, buy a Repair Tank (150 bolts), refill tanks.

## Missions

- **Story missions**, one chain per sector: reach the sector core → defeat the
  Core Master. Beating a boss unlocks its weapon and the next sector.
  Beating the Fortress plays the ending, "First Free Morning" (#102), whose
  end card offers **New Game+**.
- **Story stage set pieces** that are optional or timed: the Deep Mine's
  **ore cart** (#111), an optional ride from the Chasm's east island over a
  trestle, down a steep drop, through the corridor and across the Mole
  Warren (Atlas drives, Flux shoots; `hint.drill.board` / `.dip` /
  `.arrive`), and the Blackout Boulevard's **power cuts** (#110,
  `sim/lightPulse.ts`): a 9 s cycle with a 1 s warning (two dips, a whine)
  and 2 s of dark; the Blink Run's pulse bridges go out with the dark
  (`hint.neon.blackout`). The dips stay under three flashes a second.
- **Jobs**, the repeatable Blades jobs. The terminal shows 3 at a time. Taking
  one generates a fresh map from `(sector, seed)`. Templates:
  - *Scrap Duty*: destroy N (6–12) enemies of type X.
  - *Data Recovery*: collect N (3–5) data cores scattered across rooms.
  - *Rescue*: find the stranded worker-bot and escort it to the exit beacon.
  - *Elite Hunt*: defeat the named elite.
  - *Supply Run*: open N (3–4) supply chests.
  - *Purge*: clear every room.
  - *Tower Run* (`climb`): a platforming stage instead of a labyrinth — climb
    the sector's tower, drop into the arena at its foot and beat its Core
    Master again (below). Rolls only in sectors whose boss is already down, so
    right after the tutorial the Scrapyard tower (a Scrapper rematch) is the
    first; the first time one becomes possible it is put on the board (the
    newest job makes way), after that it rolls like any job. Pays like a boss
    job (a guaranteed Prototype roll). Its card wears hazard stripes, an
    arrow up and a red "Rematch: {boss}" chip.
- **Rewards:** XP + bolts + one item roll (rarity bias grows with difficulty).
  A rewarded ad offers **×2 bolts** on the results screen.

**The climb** (`world/climbGen.ts`, `world/climbMesh.ts`, `sim/climb.ts`): a
MegaMan stage in first person, one "screen" per verb, and **still no jump**:

1. **Ground hall:** the pad, a staircase up to a gallery, a Wall Cannon on it.
2. **Ladder shaft:** a ladder up the wall; a side ladder (lit green) to a
   reward ledge that leads nowhere else.
3. **Rolling stairs:** three lanes up a wide staircase; scrap balls drop out of
   hatches in the gantry at the top and roll down into the gutter. Each
   lane's lamp goes amber, then blinks red before its ball; the lanes fire
   staggered, so one is always free. A ball costs 16 % of the health.
4. **Lift hall:** a shuttle crosses a pit on a loop, then a lift rides up once
   stood on (and comes home once left). Rotor Drones rise and sink with Flux.
5. **Crusher bridge:** a one-cell walkway over a pit under two or three piston
   crushers: a lamp blinks, a click, a red ring fills on the walkway, the head
   slams, holds, rises. Under it: 20 %. A safe cell between them has a spur
   and a side ladder to the second reward ledge, whose prize is a
   borrowed-weapon capsule (*Borrowed weapons*).
6. **Drop descent:** terraces a storey apart, one-way drops down to the floor;
   Wall Cannons on the terraces, a walker at the bottom, the boss shutter.
7. **Arena** at y = 0 behind the usual shutter and entrance.

The route never changes; the seed varies the details (a mirrored tower, which
column the stairs climb, two or three crushers and their beat, the scrap-ball
rhythm, the shuttle's pace). **Pits:** a fall costs 15 % of the health and
puts Flux back on the last checkpoint (every section's entry, the far ledge
of the lift hall, the floor before the shutter) out of a darkening fall — the
stick is ignored for half a second so a held "forward" does not walk straight
back in. A resumed climb starts on its last checkpoint. No corridor traps
here: the climb brings its own.

The **first mission** (tutorial: "Wake-Up Call", Scrapyard) starts with no menu
and is a **guided walkthrough** (`sim/walkthrough.ts`): nobody reaches the
Scrapper without every basic control and mechanic. Every door on the path
from the pad to the boss starts locked (red lamp); a room's door opens by
itself (yellow lamp, chime, a pulse) once its lesson is done:

1. **Start room:** look and move, then the training drone: quick shots skip
   off its bubble, only a charged shot pops it.
2. **A Hardhat** (shoot when it peeks), then a glowing crate only a charge
   breaks.
3. **A Shield Trooper:** down, and at least one block or parry.
4. **A Stomper:** down, and at least one slide out of its red ring.
   **Then the Repair Gel**, in the corridor out of the Stomper's room: its
   door opens as usual, but halfway down a pressure plate clicks, a sheet of
   fire fills the passage and the door ahead slams shut. Flux is left on
   exactly a quarter of his bar (never lower, never lethal, whatever the 60 %
   scaling), the room behind him cleared and nothing awake within 15 m (the
   plate waits for that). A beat later the gel lesson comes on (a gel flies
   into its button if he carries none); the door opens again once a gel is
   used. A resumed tutorial never springs it twice.
5. **A chest:** opening it unlocks the boss shutter.

The cast is scripted (one teaching machine per room, side rooms at most 1–2
Hardhats; no Guardroid or elite before the Scrapper). If a teacher dies before
its skill was used, a Rotor Drone or another Stomper beams in, up to three
times, then the door opens anyway. Progress survives the mission snapshot, and
the hub's Scrapyard card replays the tutorial until it is done. It should take
about 4 minutes; damage is scaled down to 60 % until the mini-boss.

**As built (2026-10-04).** The first mission is a hand-built stage
(`world/stages/tutorial.ts`): charge, crate, block, the gap, the chest, the
slide, then three fighting rooms (two rotor drones; a running wheel and a
Shield Trooper; a crate golem), the gel corridor and a breather before the
Scrapper (the shutter waits for the gel lesson). Every lesson room has a
**hologram** of Flux doing the move on a loop with its input lit over its
head (`fx/lessonHologram.ts`; no cards, no first-person demo), a big yellow
arrow over each target, and the door in shuts behind Flux. The slide lesson
holds the Stomper's leap overhead until he slides. **After every Master**
(the tutorial's Scrapper too, not Vex) the copied weapon is equipped at
once, its arm hangs before him as a hologram, and a lesson room behind the
arena teaches it on blue drones that never fire; its pedestal then lights,
and stepping on it (or B) beams him out. The next stage's beam-in room
teaches a weapon only to a player who left before learning it.

**The objective trail** (`fx/objectiveTrail.ts`, `MissionObjects.target`):
once the walkthrough is done, small yellow chevrons on the floor lead along
the navigation path to the main objective (the boss shutter, the elite, the
nearest target, core, supply chest or worker-bot). At most six, from 1.5 m to
about 8 m ahead, faint, a slow wave travelling toward the goal; hidden in a
fight, during a scene lesson and once the target is close and in sight.

**The objective locator** (`sim/locator.ts`, `ObjectiveLocator.vue`): a yellow
triangle drawn over the view, so it shows the goal through walls. On a boss
map it marks the Core Master's arena (a skull in the triangle), elsewhere the
trail's goal. It shows for 5 s, then sleeps for 30 s of play (pauses and
modals never spend it) and never pops over a fight, a scene lesson or the
walkthrough; a due locator waits for the next quiet moment. In view it hangs
over the goal pointing down; out of view it rides the screen edge pointing
toward it. A boss locator retires for good once Flux is within 10 m of the
shutter; a job's keeps cycling but skips its turn while the goal is that close.

**The mystery boss chip** (`BossChip.vue`, first in the top-right row; under
it in portrait): on a boss map, the Core Master's head, dimmed and red-tinted,
behind a big yellow "?". The name card reveals it in full colour; a fallen
boss greys out under a check. The ring around it is the locator's clock: it
fills over the 30 s cooldown and the chip glows while the triangle is up.

**The boss shutter reads as danger** (`buildDoor` boss branch): the same
livery in every sector, yellow-and-black hazard stripes on the jambs, lintel
and every other slat, a robot skull over the gate whose eyes are the door's
state lamp, two red beacons sweeping light fans across the corridor, a red
pool of light and three chevrons marching into the gate on the floor. The
first sight of it from ~9 m sounds a klaxon with a faint red pulse. Once the
boss falls the kit powers down, so the way out reads as safe.

### Maps

Maps are generated procedurally on a cell grid with 3 m cells:

- 6–11 rooms (rectangles of 3×3 to 7×7 cells), connected into a spanning tree
  plus 1–2 loops by 1-cell corridors. Doors are sliding shutters between rooms
  and corridors (the boss door is a double shutter).
- Room roles: `start` (teleporter pad), `combat`, `treasure` (chest, sometimes
  locked behind an elite), `objective` (data core, rescue bot), `boss`, `exit`.
- Walls, pillars, pipes, crates and barrels come from the sector theme, with
  wall panels and light strips for readability.
- Navigation uses the same grid for circle-vs-grid collision, grid ray line of
  sight, and A* for tap-to-move and enemy chase.
- **Heights (the climb only;** `MapData.terrain`**, absent on every labyrinth
  map, which stays flat at y = 0):** a floor height per cell, ramp cells whose
  floor rises across them (drawn as steps, walked as a slope), pit cells with
  no floor, per-room wall tops (a shaft is tall), ladders on cliff faces,
  lifts, crushers, scrap-ball lanes, checkpoints, reward ledges and machine
  posts. Flux has feet: gravity, a 0.5 m step-up, ground snap down stairs and
  onto a lowering lift, a tenth of a second of grace over a pit edge. A floor
  higher than a step above his feet is a wall; a lower one is a drop (one
  way). A lift is a solid column under its deck. **Ladders:** push toward the
  wall to climb, away from it to go down, so forward climbs when facing the
  ladder and forward descends when walking off its top onto it; the top steps
  off by itself, the foot lets go by itself, Slide drops off. Controls are
  unchanged. Tap-to-move never routes up a cliff: up only by the stairs, down
  any drop; ladders and lifts are the stick's (the objective trail still shows
  the way up them). Machines keep to their own platform (`Enemy.floor`, a
  leash); a floor blast or a melee blow from another level misses.
- **Corridor traps** (`sim/traps.ts`, `models/traps.ts`): one or two per
  regular map, so the walk between rooms is something to watch. Placed from
  the map seed on their own stream (the map itself never changes), in
  corridors on or just off the main path, longer ones first; never a start
  room's corridor, never the boss shutter's, never a door's own cell.
  - *Flame jet:* nozzles in one wall or both. Idle 1.8 s → warn 0.8 s (the
    nozzles glow and spit sparks, a hiss, a strip on the floor lights up) →
    a sheet of fire across the whole corridor for 1 s → cool.
  - *Swinging blade:* a pendulum from a gantry on the wall tops, sweeping the
    passage wall to wall every 2.4 s; a whoosh as it comes down, a red line on
    the floor where it swings, its shadow running along it.
  - A hit is 12 at level 1 (scaled like the machines' damage), unblockable (a
    red-ring rule: Slide's i-frames go through), with the usual hurt
    i-frames. Flux only: machines walk through. While a fight is on, every
    trap parks (a flame holds its idle, a blade latches at the top of its
    swing), so a trap never lands on top of a fight. They hang under their
    corridor's room group, so portal culling hides them with it; sound and
    sparks only from a room on screen.

### Scene lessons (mechanics, not inputs)

The coach teaches inputs; four mechanics get a scene built for them instead
(`src/game/sim/lessons.ts`, `LessonLayer.vue`). No words: a glyph rides on the
subject, a wrong try shakes it, success pops a check. One at a time, once per
profile; while one is on screen the coach keeps to survival glyphs plus move
and look. A subject out of view gets a bubble with the lesson's own glyph at
the screen edge, only while the player is in its room (never a chevron: one
read as "go this way" and led two playtesters back to the start).

1. **Charge shot**, right after the first beam-in: a training drone hovers
   ahead of the pad in an energy bubble. Quick shots skip off it ("TINK");
   a charged shot pops it (a few bolts drop). In the walkthrough the start
   room's door stays shut until it pops; its glyph waits until move and look
   are learned (or 10 s, or a bounced shot), and an early release shakes it.
2. **Crates need a charge.** Supply crates only break to a charged shot, a
   copied weapon or a blast; quick shots bounce off. In the walkthrough's
   Hardhat room, once it is quiet, a crate glows (one is beamed in if the room
   has none) with the hold glyph on it.
3. **The special weapon**, in the first mission after one is won: as soon as
   a room is quiet, three drones beam in asleep, in a row exactly one spread
   apart (a line for the piercing weapons). The weapon's key (`1`) or its
   breathing button carries the glyph, and guide lines fan out to the drones:
   one press takes all three. Shot down with the buster instead, it tries
   again in a later room (three times, then it retires).
4. **The Repair Gel.** A playtester never understood why a heal "appeared out
   of nowhere" at low health, or how many he had. In the walkthrough it comes
   after the gel corridor's trap (Missions); elsewhere, for a player who never
   learned it, at the first calm moment under half health with a gel carried.
   Its subject is the gel button: it pulses under a card with its key (`H`) or
   a tapping finger and a gel pouring into a heart that fills green; using
   one pops the check. Health back another way ends it unlearned. Meanwhile
   the coach's own tank glyph stands aside; afterwards it works as before.

**The gel is a resource on screen** (`ActionButtons.vue`, `HudBars.vue`): the
button never pops in. It shows a pip per gel carried and hollow pips for the
room left (Gel Capacity), the gel visible in the flask; dimmed at full health
("in stock, nothing to repair"), glowing when hurt, breathing under half, the
empty flask faint when none are left. A press with nothing to repair shakes
it. A gel found flies from the middle of the view into the button; a gel used
drains out of it, an orb of it flows up into the heart, and the missing
segments fill green one by one before they settle to yellow (the repair is
instant; the bar catches up, and a hit on the way cancels the show).

### Hub

After a mission the game goes to the **Hub**. It is a UI screen over a live 3D
backdrop of Flux idling on the teleporter pad in Gauss's lab. The tabs are
**Missions** (the stage select plus the job board), **Hero** (gear, stats,
3D paper doll), **Circuits** (skills) and **Workshop**. The Hub is a menu,
not a town: there is no building. Once the ending has played, Gauss stands
awake in the lab beside the pad.

**The stage select** (#103, `MissionsTab.vue`, `QuestCard.vue`): each
Master's portrait on a tile in its signature colour. Beaten ones are
greyed with a tick, the next one pulses, locked ones are a silhouette; the
story stays linear. A story mission's card wears its Master's face and
colour, and while the mission loads a boss splash plays
(`hud/MissionLoading.vue`): the Master strikes in and its name types on,
inside the load's own wait, never adding to it.

**The upgrade tour.** The first return to the lab walks the player through
the one loop that matters (`components/hub/hubLesson.ts`, `HubLesson.vue`):
Workshop tab → upgrade the buster (damage) → select the chest armour →
upgrade it (defence) → back to Missions. Everything but the target is dimmed
and inert, a hand (a cursor on desktop) glides to each target and taps, and
Flux strikes the victory pose after each upgrade. Steps follow the game's
state, never a timer. The wallet is topped up once so both upgrades are
affordable; a player who already upgraded something skips the tour, and a
close button ends it any time.

Death means **System down**. The options are *Reboot* with a Repair Tank,
*Reboot* for a rewarded ad (once per mission, full HP) or *Retreat to the
lab*. Retreating fails the mission: the player keeps the XP and bolts earned
and loses the quest progress.

### Global leaderboard

The board ranks **lifetime XP**: every point of experience Flux has earned,
still counting past the level-40 cap, so it only ever grows. The hero level is
shown beside it. Every mission end (win or defeat) reports it, once the result
screen is up, and a request goes out only on a personal record.

- **Results screen:** a gold rank chip under the mission name,
  "#1,204 of 2,500 players", grouped for the player's language. It renders
  nothing when there is no honest number to show.
- **Hub:** a leaderboard pill in the top bar opens the top 100 (rank, player,
  experience, level) with the player's own row highlighted.
- **Backend:** Cloudflare Worker `mega-adventure-leaderboard` over one D1
  table (`worker/`, runbook `worker/SETUP.md`): one edge-cached GET per session,
  signed POSTs, a lifetime-XP cap of 100 M. The Worker and D1 keep their
  pre-rename names on purpose: renaming would move the live URL.
- **Poki, Yandex, Playgama** can't call it. They bake a MODELLED board
  (`data/leaderboard-seed.json`, `pnpm leaderboard:seed`): 2,500 players from a
  stated retention curve, histogram only. The chip still gives an exact rank;
  the top-100 list is hidden there, so no invented player names are ever shown.
- **Names** are generated (`Servo852031`) unless the portal supplies one
  (CrazyGames username). Nobody is asked to type a name.
- Playgama's own hosted board is off until Mega Droid has one on the
  Playgama dashboard.

## Monetization and portals

- **Rewarded:** revive on defeat (once per mission), ×2 bolts on the results
  screen, and the Workshop **Supply Drop** (40 + 20 × level bolts, every 4
  minutes, cooldown kept in the save). Every rewarded button is hidden unless
  an ad is actually ready.
- **Interstitial:** only between missions, and always BEFORE the results
  screen appears. None in the first 3 minutes of a session, then at most one
  per 121 s. GameMonetize, GameDistribution and GamePix also get the
  moderation-required first-load ad.
- **Gameplay bracket:** `gameplayStart` only while a mission is in its play
  phase with nothing on top of it; `gameplayStop` for every modal, ad, hidden
  tab, platform pause and the hub. CrazyGames `happytime` on a mission win.
- **Pause and audio:** ads, a hidden tab and a platform pause freeze the loop
  AND silence all audio. A modal freezes the loop but keeps the sound (the
  results fanfare, the Options sliders).

## Art direction

- **Low poly, rounded, never cubey.** Everything is built from capsules,
  spheres, lathes and tori at modest segment counts (8–16) with **smooth
  normals**. The shading is **toon** (3-step gradient ramp) with **inverted-hull
  outlines** (dark navy, never pure black). Proportions follow the classic
  sprite era: big head, round shoulders, oversized boots and forearms, short
  torso.
- Palette: saturated primaries on light, clean sector backdrops. Flux is
  pearl `#eef0f3` armour over a graphite `#3a3f4b` undersuit, with a dark
  visor band (`#161a22`) and one amber plasma `#ffa733` for his eye-lights,
  hex chest reactor, cannon vents and back-fin edges. He has no face. Gear
  repaints the armour shells and the plasma; the undersuit, visor and piston
  steel never change. Enemies read by silhouette and by a signature colour
  (Hardhat yellow, Trooper green, Drone red, Stomper purple, Roller orange,
  Brute steel).
- VFX: pooled additive sprites for pellets, charge glow, sparks, ring shocks,
  bolt pickups and the **orb-ring death burst**. Hit-flash is a white emissive
  pulse. Damage numbers are pooled DOM elements. Screenshake, hit-stop on crits
  and parries.
- Audio: all SFX and music are synthesized at runtime, chiptune-style (square
  and triangle waves plus noise), with drop-in override files under
  `public/audio` (Phase 3).

## Feel (the non-negotiables)

- Tap-fire must hit **the same frame** and a charged release must feel heavy:
  a muzzle flash, recoil on the arm, hit-stop and a camera kick.
- Every enemy attack is readable a beat ahead (telegraph ring plus a body wind-up).
- Loot pops: chests burst open with light shafts, items fly out, and rarity
  sets the colour of the beam.
- Level-up is an event: a full-screen flash, a jingle and the attribute pick.
- The first 10 seconds are already gameplay.

## Deliberately not in the game

Town building, the endless Abyss, lockpicking minigame, crafting from
materials, PvP arena, timers/energy systems, a second currency.

## Standard requirements block

> In GENERAL for all work: Do your work on a high-fidelity basis, don't do
> just good enough. Make the interactions feel good, add vfx juice where
> applicable (optimize to not overload the CPU/GPU). Don't take shortcuts.
> After planning, write the plan into `game-implementation-plan.md` to
> continue from if a session ends unexpectedly.
> The game starts right into the first scene, no main menu.
> Fully responsive: all mobile orientations, min portrait 320×658px, tablet
> and desktop up to fullscreen. No fixed px where avoidable — use %, vw/vh.
> Respect safe-area insets. Images are not selectable/draggable like normal
> web content but must allow drag and click events for game logic.
> Optimize for web-game standards: fast jump into gameplay (hot-path
> loading), delay uncritical assets until after first paint.
> Save ALL state variables in one object named `mega_droid_state`.

The object was named `mega_adventure_state` before the game became Mega Droid;
saves under the old name migrate once, locally and from the cloud
(`src/legacyKeys.ts`).
