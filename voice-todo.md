# Voice-over to-do

Generated from the voice catalogue (src/game/audio/voiceCatalog.ts), the
locales and vo-src/shipped.json by `pnpm voice:script`; every `pnpm
voice:gen` run rewrites it, and a test fails when it is stale. Do not edit by
hand. Every text line in a speaker's section of the locales is a voice line by
itself, so a new line shows up here as missing until it is voiced.

- **Files:** `public/audio/voice/<en|de>/<file>.ogg`. German players hear
  the German file, everyone else the English one; a German line without a file
  falls back to the English recording. A line with no file just shows its
  bubble.
- **Make the missing ones:** `pnpm voice:collect`, then
  `node tools/voice/generate.mjs --engine <engine> --takes 1` (it voices
  only lines without a take), then `--retry 2` for the ones that fail QA.

| Who | Lines | EN voiced | DE voiced |
| --- | --- | --- | --- |
| Atlas | 209 | 209 | 207 |
| Vex | 33 | 33 | 33 |
| Flux | 45 | 45 | 45 |
| Gauss | 2 | 2 | 2 |
| Pip | 52 | 51 | 52 |
| **All** | **341** | **340** | **339** |

## Missing (3)

| File | Who | Plays when | English | German | EN | DE |
| --- | --- | --- | --- | --- | --- | --- |
| `atlas_story_rotor` | Atlas | Story mission start: Rotor Run | Rotor Run. Wind in my antenna! | Rotorflug. Wind in meiner Antenne! | elevenlabs | **missing** |
| `atlas_scan_elite` | Atlas | The first sighting of this machine | Gold ring. Elite. Careful. | Goldring. Elite. Vorsicht. | elevenlabs | **missing** |
| `pip_debrief_magnet_next` | Pip | Debrief after Polarity Works: the camera travels to Deep Mine | Next: Deep Mine, deep underground. Seriously strong machines. | Als Nächstes: Tiefenmine, tief unter der Erde. Richtig starke Maschinen. | **missing** | elevenlabs |

## Every line (341)

| File | Who | Plays when | English | German | EN | DE |
| --- | --- | --- | --- | --- | --- | --- |
| `story_atlas_logStart` | Atlas | Intro: the cold open freezes and rewinds; Atlas starts its log | Log start. | Protokoll gestartet. | elevenlabs | elevenlabs |
| `story_atlas_goodMorning` | Atlas | Intro: Flux wakes up; the first words of the game | Core online. Good morning, Flux. | Kern online. Guten Morgen, Flux. | elevenlabs | elevenlabs |
| `story_atlas_scrapyardFirst` | Atlas | Intro, the hologram: the Scrapyard relay blinks | Scrapyard first. One relay at a time. | Erst der Schrottplatz. Ein Relais nach dem anderen. | elevenlabs | elevenlabs |
| `atlas_landed` | Atlas | Every mission: Flux lands on the pad | Touchdown! Let's go. | Gelandet! Los geht's. | elevenlabs | elevenlabs |
| `atlas_brief_tutorial` | Atlas | The tutorial starts | Training time. I'll guide you! | Training! Ich helf dir. | elevenlabs | elevenlabs |
| `atlas_brief_job` | Atlas | A job mission starts | Quick job. In and out! | Kurzer Job. Rein und raus! | elevenlabs | elevenlabs |
| `atlas_brief_climb` | Atlas | A Tower Run starts | Tower run! Up, up, up! | Turmlauf! Hoch, hoch, hoch! | elevenlabs | elevenlabs |
| `atlas_brief_story` | Atlas | A story mission starts (fallback line) | A Core Master waits. Let's free it! | Ein Kernmeister wartet. Holen wir ihn raus! | elevenlabs | elevenlabs |
| `atlas_story_scrapyard` | Atlas | Story mission start: Scrapyard | Scrapyard relay. Light it up! | Schrottplatz-Relais. Bring's zum Leuchten! | elevenlabs | elevenlabs |
| `atlas_story_blaze` | Atlas | Story mission start: Blaze Refinery | The Refinery. Hot, hot, hot! | Die Raffinerie. Heiß, heiß, heiß! | elevenlabs | elevenlabs |
| `atlas_story_cryo` | Atlas | Story mission start: Cryo Plant | Cryo Plant. Brr! Keep moving. | Kryowerk. Brr! Bleib in Bewegung. | elevenlabs | elevenlabs |
| `atlas_story_volt` | Atlas | Story mission start: Volt Tower | Volt Tower. My circuits tingle! | Voltturm. Meine Schaltkreise kribbeln! | elevenlabs | elevenlabs |
| `atlas_story_gale` | Atlas | Story mission start: Sky Docks | Sky Docks. Don't look down! | Himmelsdocks. Nicht runterschauen! | elevenlabs | elevenlabs |
| `atlas_story_magnet` | Atlas | Story mission start: Polarity Works | Polarity Works. My compass spins! | Polaritätswerk. Mein Kompass dreht durch! | elevenlabs | elevenlabs |
| `atlas_story_drill` | Atlas | Story mission start: Deep Mine | Deep Mine. Mind your head! | Tiefenmine. Kopf einziehen! | elevenlabs | elevenlabs |
| `atlas_story_tide` | Atlas | Story mission start: Tidewater Locks | Tidewater Locks. Splash time! | Gezeitenschleusen. Platsch-Zeit! | elevenlabs | elevenlabs |
| `atlas_story_neon` | Atlas | Story mission start: Blackout Boulevard | Blackout Boulevard. Lights, please! | Blackout-Boulevard. Licht an, bitte! | elevenlabs | elevenlabs |
| `atlas_story_rotor` | Atlas | Story mission start: Rotor Run | Rotor Run. Wind in my antenna! | Rotorflug. Wind in meiner Antenne! | elevenlabs | **missing** |
| `atlas_story_fortress` | Atlas | Story mission start: Vex Fortress | The Fortress. We end this. | Die Festung. Zeit, das zu beenden. | elevenlabs | elevenlabs |
| `atlas_arc_1` | Atlas | Story mission start, 1 of 10 Masters freed | One relay lit. Nine to go! | Ein Relais leuchtet. Noch neun! | elevenlabs | elevenlabs |
| `atlas_arc_2` | Atlas | Story mission start, 2 of 10 Masters freed | Two relays! Vex is sulking. | Zwei Relais! Vex schmollt. | elevenlabs | elevenlabs |
| `atlas_arc_3` | Atlas | Story mission start, 3 of 10 Masters freed | Three lit. Keep glowing! | Drei leuchten. Leucht weiter! | elevenlabs | elevenlabs |
| `atlas_arc_4` | Atlas | Story mission start, 4 of 10 Masters freed | Four down. The grid hums again. | Vier geschafft. Das Netz summt wieder. | elevenlabs | elevenlabs |
| `atlas_arc_5` | Atlas | Story mission start, 5 of 10 Masters freed | Halfway there! Vex is sweating. | Halbzeit! Vex kommt ins Schwitzen. | elevenlabs | elevenlabs |
| `atlas_arc_6` | Atlas | Story mission start, 6 of 10 Masters freed | Six relays! The city wakes up. | Sechs Relais! Die Stadt erwacht. | elevenlabs | elevenlabs |
| `atlas_arc_7` | Atlas | Story mission start, 7 of 10 Masters freed | Seven lit. Keep it up! | Sieben leuchten. Weiter so! | elevenlabs | elevenlabs |
| `atlas_arc_8` | Atlas | Story mission start, 8 of 10 Masters freed | Eight! Only two Masters left. | Acht! Nur noch zwei Meister. | elevenlabs | elevenlabs |
| `atlas_arc_9` | Atlas | Story mission start, 9 of 10 Masters freed | One Master left. Almost! | Nur noch ein Meister. Fast geschafft! | elevenlabs | elevenlabs |
| `atlas_arc_10` | Atlas | Story mission start, 10 of 10 Masters freed | Shield's down. Vex is next! | Schild ist weg. Jetzt ist Vex dran! | elevenlabs | elevenlabs |
| `atlas_bossAhead` | Atlas | The boss door comes into view | Boss ahead. Deep breath! | Boss voraus. Tief durchatmen! | elevenlabs | elevenlabs |
| `atlas_weak_galeGuard` | Atlas | The boss door comes into view, Flux carries its weakness (blazeMaster) | Gale Guard hurts this one! | Sturmschild tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_flameWave` | Atlas | The boss door comes into view, Flux carries its weakness (frostMaster) | Flame Wave hurts this one! | Flammenwelle tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_iceLance` | Atlas | The boss door comes into view, Flux carries its weakness (voltMaster) | Ice Lance hurts this one! | Eislanze tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_thunderArc` | Atlas | The boss door comes into view, Flux carries its weakness (galeMaster) | Thunder Arc hurts this one! | Donnerbogen tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_droneSwarm` | Atlas | The boss door comes into view, Flux carries its weakness (magnetMaster) | Drone Swarm hurts this one! | Drohnenschwarm tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_magnetPull` | Atlas | The boss door comes into view, Flux carries its weakness (drillMaster) | Magnet Pull hurts this one! | Magnetzug tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_drillBomb` | Atlas | The boss door comes into view, Flux carries its weakness (tideMaster) | Drill Bomb hurts this one! | Bohrbombe tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_bubbleLance` | Atlas | The boss door comes into view, Flux carries its weakness (neonMaster) | Bubble Lance hurts this one! | Blasenlanze tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_weak_neonBlade` | Atlas | The boss door comes into view, Flux carries its weakness (rotorMaster) | Neon Blade hurts this one! | Neonklinge tut ihm weh! | elevenlabs | elevenlabs |
| `atlas_noWeak` | Atlas | The boss door of a Master without a weakness (the Scrapper, Vex) | No weak spot visible. Move! | Kein Schwachpunkt. Bleib in Bewegung! | elevenlabs | elevenlabs |
| `atlas_bossDown` | Atlas | A Core Master is beaten (freed) | Master freed! Great job! | Meister befreit! Super gemacht! | elevenlabs | elevenlabs |
| `atlas_vexDown` | Atlas | Vex's Mk-I is beaten | Vex is down. We did it! | Vex ist erledigt. Wir haben es geschafft! | elevenlabs | elevenlabs |
| `atlas_guardDown` | Atlas | A Fortress guard hall is cleared (its door opens) | Guard down! The way's open. | Wache erledigt! Der Weg ist frei. | elevenlabs | elevenlabs |
| `atlas_lowHp` | Atlas | Health under 30 %, no Repair Gel left | Ouch! Careful, Flux! | Autsch! Vorsicht, Flux! | elevenlabs | elevenlabs |
| `atlas_lowHpGel` | Atlas | Health under 30 %, a Repair Gel in the pack | Low health! Try a Repair Gel. | Du bist angeschlagen! Nimm ein Reparaturgel. | elevenlabs | elevenlabs |
| `atlas_lowWe` | Atlas | Special weapon energy under 20 % | Weapon energy's low! | Waffenenergie wird knapp! | elevenlabs | elevenlabs |
| `atlas_trap` | Atlas | A corridor trap ahead (flame jet, blade) | Trap ahead. Watch the timing! | Falle voraus. Achte aufs Timing! | elevenlabs | elevenlabs |
| `atlas_plate` | Atlas | A pressure plate ahead | Pressure plate. Tiptoe! | Druckplatte. Auf Zehenspitzen! | elevenlabs | elevenlabs |
| `atlas_exit` | Atlas | The exit drone arrives | Our ride's here! | Unser Taxi ist da! | elevenlabs | elevenlabs |
| `atlas_levelUp` | Atlas | Flux levels up mid-mission | Level up! You're shining. | Level-Up! Du strahlst ja richtig. | elevenlabs | elevenlabs |
| `atlas_idle_1` | Atlas | Small talk in a quiet stretch | Beep. Just checking in. | Piep. Alles klar bei dir? | elevenlabs | elevenlabs |
| `atlas_idle_2` | Atlas | Small talk in a quiet stretch | You're doing great. | Du machst das super. | elevenlabs | elevenlabs |
| `atlas_idle_3` | Atlas | Small talk in a quiet stretch | Gauss would be proud. | Gauss wäre stolz. | elevenlabs | elevenlabs |
| `atlas_idle_4` | Atlas | Small talk in a quiet stretch | I like our team. | Ich mag unser Team. | elevenlabs | elevenlabs |
| `atlas_boss_signalFirst` | Atlas | Scrapyard: the first Core Master signal | Core Master signal. It's… big. | Kernmeister-Signal. Er ist… groß. | elevenlabs | elevenlabs |
| `atlas_story_relayOne` | Atlas | The first relay is lit | Relay one lit. Nine to go. | Relais eins leuchtet. Noch neun. | elevenlabs | elevenlabs |
| `atlas_sector_blaze` | Atlas | Beam-in: Blaze Refinery | Refinery. It runs hot. Mind the vents. | Raffinerie. Hier wird's heiß. Achte auf die Düsen. | elevenlabs | elevenlabs |
| `atlas_story_copied_scrapBurst` | Atlas | A Master is freed: its weapon is copied | Scrap Burst copied. | Schrottsalve kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_flameWave` | Atlas | A Master is freed: its weapon is copied | Flame Wave copied. | Flammenwelle kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_iceLance` | Atlas | A Master is freed: its weapon is copied | Ice Lance copied. | Eislanze kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_thunderArc` | Atlas | A Master is freed: its weapon is copied | Thunder Arc copied. | Donnerbogen kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_galeGuard` | Atlas | A Master is freed: its weapon is copied | Gale Guard copied. | Sturmschild kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_magnetPull` | Atlas | A Master is freed: its weapon is copied | Magnet Pull copied. | Magnetzug kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_drillBomb` | Atlas | A Master is freed: its weapon is copied | Drill Bomb copied. | Bohrbombe kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_bubbleLance` | Atlas | A Master is freed: its weapon is copied | Bubble Lance copied. | Blasenlanze kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_neonBlade` | Atlas | A Master is freed: its weapon is copied | Neon Blade copied. | Neonklinge kopiert. | elevenlabs | elevenlabs |
| `atlas_story_copied_droneSwarm` | Atlas | A Master is freed: its weapon is copied | Drone Swarm copied. | Drohnenschwarm kopiert. | elevenlabs | elevenlabs |
| `atlas_sector_cryo` | Atlas | Beam-in: Cryo Plant | Coolant's flowing uphill. To the Fortress. | Das Kühlmittel fließt bergauf. Zur Festung. | elevenlabs | elevenlabs |
| `atlas_story_dataCore` | Atlas | The Frost Master leaves a data core behind | It left us something. | Er hat uns etwas dagelassen. | elevenlabs | elevenlabs |
| `atlas_story_firstDraft` | Atlas | The blueprint: Atlas recognises its own code | …I was written from its first draft. | …Ich wurde aus seinem ersten Entwurf geschrieben. | elevenlabs | elevenlabs |
| `atlas_story_body` | Atlas | The blueprint: what Vex is building | It's building a body. Out of our valley. | Er baut sich einen Körper. Aus unserem Tal. | elevenlabs | elevenlabs |
| `atlas_volt_hack` | Atlas | Volt Tower: Vex hacks Atlas mid-sentence | Flux… something's in the— | Flux… da ist etwas in mei— | elevenlabs | elevenlabs |
| `atlas_volt_thanks` | Atlas | Volt Tower: the hack fails | …You kept it out. Thank you. | …Du hast es draußen gehalten. Danke. | elevenlabs | elevenlabs |
| `atlas_story_voltFreed` | Atlas | The Volt Master is freed | The signal's lost its power station. | Das Signal hat sein Kraftwerk verloren. | elevenlabs | elevenlabs |
| `atlas_sector_gale` | Atlas | Beam-in: Sky Docks | Every part for its body goes through here. | Jedes Teil für seinen Körper kommt hier durch. | elevenlabs | elevenlabs |
| `atlas_story_galeFreed` | Atlas | The Gale Master is freed | No more parts reach the Fortress. | Keine Teile erreichen mehr die Festung. | elevenlabs | elevenlabs |
| `atlas_story_breach` | Atlas | The Fortress shield falls | Shield's down. The Fortress is open. | Der Schild ist unten. Die Festung ist offen. | elevenlabs | elevenlabs |
| `atlas_fortress_bays` | Atlas | Fortress: the half-built assembly bays | Half-built. You did that. | Halb gebaut. Das warst du. | elevenlabs | elevenlabs |
| `atlas_mk1_intro` | Atlas | Mk-I intro: Vex steps into his body | That's Vex. The real one. | Das ist Vex. Der echte. | elevenlabs | elevenlabs |
| `atlas_mk1_fire` | Atlas | Mk-I fight: calling the element of its next attack | Fire! | Feuer! | elevenlabs | elevenlabs |
| `atlas_mk1_ice` | Atlas | Mk-I fight: calling the element of its next attack | Ice! | Eis! | elevenlabs | elevenlabs |
| `atlas_mk1_volt` | Atlas | Mk-I fight: calling the element of its next attack | Volt! | Volt! | elevenlabs | elevenlabs |
| `atlas_mk1_wind` | Atlas | Mk-I fight: calling the element of its next attack | Wind! | Wind! | elevenlabs | elevenlabs |
| `atlas_mk1_scrap` | Atlas | Mk-I fight: calling the element of its next attack | Scrap! | Schrott! | elevenlabs | elevenlabs |
| `atlas_mk1_free` | Atlas | Mk-I phase 2: answering Vex ("Why won't they listen?") | Because they're free. | Weil sie frei sind. | elevenlabs | elevenlabs |
| `atlas_warn_boss` | Atlas | A Core Master ahead | Core Master ahead. | Kernmeister voraus. | elevenlabs | elevenlabs |
| `atlas_warn_gelFirst` | Atlas | Low health the first time, a gel in the pack | Plating's cracking. Use a gel. | Die Panzerung bricht. Nimm ein Gel. | elevenlabs | elevenlabs |
| `atlas_warn_gel` | Atlas | Low health again, a gel in the pack | Gel. | Gel. | elevenlabs | elevenlabs |
| `atlas_warn_criticalFirst` | Atlas | Critical health, the first time | Critical! Back off! | Kritisch! Zieh dich zurück! | elevenlabs | elevenlabs |
| `atlas_warn_critical` | Atlas | Critical health again | Critical! | Kritisch! | elevenlabs | elevenlabs |
| `atlas_warn_noGel` | Atlas | Low health, no gel left | No gel left. Play it safe. | Kein Gel mehr. Geh auf Nummer sicher. | elevenlabs | elevenlabs |
| `atlas_warn_weLow` | Atlas | Weapon energy low | Weapon energy low. The cannon's free. | Waffenenergie niedrig. Die Kanone kostet nichts. | elevenlabs | elevenlabs |
| `atlas_warn_weEmpty` | Atlas | Weapon energy empty | Tank's dry. | Tank ist leer. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_scrapBurst` | Atlas | A borrowed weapon's last shot | Last shot of Scrap Burst. | Letzter Schuss Schrottsalve. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_flameWave` | Atlas | A borrowed weapon's last shot | Last shot of Flame Wave. | Letzter Schuss Flammenwelle. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_iceLance` | Atlas | A borrowed weapon's last shot | Last shot of Ice Lance. | Letzter Schuss Eislanze. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_thunderArc` | Atlas | A borrowed weapon's last shot | Last shot of Thunder Arc. | Letzter Schuss Donnerbogen. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_galeGuard` | Atlas | A borrowed weapon's last shot | Last shot of Gale Guard. | Letzter Schuss Sturmschild. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_magnetPull` | Atlas | A borrowed weapon's last shot | Last shot of Magnet Pull. | Letzter Schuss Magnetzug. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_drillBomb` | Atlas | A borrowed weapon's last shot | Last shot of Drill Bomb. | Letzter Schuss Bohrbombe. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_bubbleLance` | Atlas | A borrowed weapon's last shot | Last shot of Bubble Lance. | Letzter Schuss Blasenlanze. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_neonBlade` | Atlas | A borrowed weapon's last shot | Last shot of Neon Blade. | Letzter Schuss Neonklinge. | elevenlabs | elevenlabs |
| `atlas_warn_borrowedLast_droneSwarm` | Atlas | A borrowed weapon's last shot | Last shot of Drone Swarm. | Letzter Schuss Drohnenschwarm. | elevenlabs | elevenlabs |
| `atlas_warn_flame` | Atlas | A flame-jet trap ahead | Vents. Wait for it… or slide. | Düsen. Warte ab… oder rutsch durch. | elevenlabs | elevenlabs |
| `atlas_warn_blade` | Atlas | A blade trap ahead | Blade. Go right after it. | Klinge. Lauf direkt hinter ihr durch. | elevenlabs | elevenlabs |
| `atlas_warn_crusher` | Atlas | A crusher ahead | Crusher. Watch the lamp. | Presse. Achte auf die Lampe. | elevenlabs | elevenlabs |
| `atlas_warn_ladder` | Atlas | The first ladder | Ladder. Push toward the wall. | Leiter. Drück dich zur Wand. | elevenlabs | elevenlabs |
| `atlas_warn_pit` | Atlas | A pit with a lift | Long drop. Time the lift. | Tiefer Fall. Pass den Aufzug ab. | elevenlabs | elevenlabs |
| `atlas_hint_locator` | Atlas | The objective locator appears | Objective's that way. | Das Ziel liegt da lang. | elevenlabs | elevenlabs |
| `atlas_hint_rescue` | Atlas | A worker-bot to rescue is near | Worker-bot signal. Faint. Close. | Arbeiterbot-Signal. Schwach. Ganz nah. | elevenlabs | elevenlabs |
| `atlas_hint_upgrade` | Atlas | Loot better than what Flux wears | That's an upgrade. | Das ist ein Upgrade. | elevenlabs | elevenlabs |
| `atlas_hint_levelUp` | Atlas | A level-up | New chip compiled. | Neuer Chip kompiliert. | elevenlabs | elevenlabs |
| `atlas_hint_done` | Atlas | The objective is done | Done. Call the drone when ready. | Erledigt. Ruf die Drohne, wenn du so weit bist. | elevenlabs | elevenlabs |
| `atlas_hint_underLevel` | Atlas | Flux is under the sector's floor level | They'll outclass you. Train first. | Die sind dir überlegen. Trainier erst. | elevenlabs | elevenlabs |
| `atlas_hint_floor_blaze` | Atlas | The mission card: the sector's floor level | Blaze Refinery runs level 3 and up. | Glutraffinerie beginnt ab Stufe 3. | elevenlabs | elevenlabs |
| `atlas_hint_floor_cryo` | Atlas | The mission card: the sector's floor level | Cryo Plant runs level 6 and up. | Kryowerk beginnt ab Stufe 6. | elevenlabs | elevenlabs |
| `atlas_hint_floor_volt` | Atlas | The mission card: the sector's floor level | Volt Tower runs level 9 and up. | Voltturm beginnt ab Stufe 9. | elevenlabs | elevenlabs |
| `atlas_hint_floor_gale` | Atlas | The mission card: the sector's floor level | Sky Docks runs level 13 and up. | Himmelsdocks beginnt ab Stufe 13. | elevenlabs | elevenlabs |
| `atlas_hint_floor_magnet` | Atlas | The mission card: the sector's floor level | Polarity Works runs level 16 and up. | Polaritätswerk beginnt ab Stufe 16. | elevenlabs | elevenlabs |
| `atlas_hint_floor_drill` | Atlas | The mission card: the sector's floor level | Deep Mine runs level 19 and up. | Tiefenmine beginnt ab Stufe 19. | elevenlabs | elevenlabs |
| `atlas_hint_floor_tide` | Atlas | The mission card: the sector's floor level | Tidewater Locks runs level 22 and up. | Gezeitenschleusen beginnt ab Stufe 22. | elevenlabs | elevenlabs |
| `atlas_hint_floor_neon` | Atlas | The mission card: the sector's floor level | Blackout Boulevard runs level 25 and up. | Blackout-Boulevard beginnt ab Stufe 25. | elevenlabs | elevenlabs |
| `atlas_hint_floor_rotor` | Atlas | The mission card: the sector's floor level | Rotor Run runs level 28 and up. | Rotorflug beginnt ab Stufe 28. | elevenlabs | elevenlabs |
| `atlas_hint_floor_fortress` | Atlas | The mission card: the sector's floor level | Vex Fortress runs level 31 and up. | Festung Vex beginnt ab Stufe 31. | elevenlabs | elevenlabs |
| `atlas_warn_down` | Atlas | Flux goes down | Rebooting… Pip's got you. | Neustart… Pip hat dich. | elevenlabs | elevenlabs |
| `atlas_scan_hardhat` | Atlas | The first sighting of this machine | Hardhat. Shoot when it peeks. | Helmling. Schieß, wenn er rauslugt. | elevenlabs | elevenlabs |
| `atlas_scan_trooper` | Atlas | The first sighting of this machine | Shield. Charge through it. | Schild. Mit einer Ladung durchbrechen. | elevenlabs | elevenlabs |
| `atlas_scan_heli` | Atlas | The first sighting of this machine | Rotor Drone. Look up. | Rotordrohne. Schau nach oben. | elevenlabs | elevenlabs |
| `atlas_scan_hopper` | Atlas | The first sighting of this machine | Stomper. Move off the ring. | Stampfer. Runter vom Ring. | elevenlabs | elevenlabs |
| `atlas_scan_roller` | Atlas | The first sighting of this machine | Gear Roller. Sidestep it. | Zahnradroller. Weich seitlich aus. | elevenlabs | elevenlabs |
| `atlas_scan_brute` | Atlas | The first sighting of this machine | Guardroid. Parry, then punish. | Wachdroide. Parieren, dann zuschlagen. | elevenlabs | elevenlabs |
| `atlas_scan_turret` | Atlas | The first sighting of this machine | Wall Cannon. Keep moving. | Wandkanone. Bleib in Bewegung. | elevenlabs | elevenlabs |
| `atlas_scan_golem` | Atlas | The first sighting of this machine | That crate's breathing. Get close. | Die Kiste atmet. Geh nah ran. | elevenlabs | elevenlabs |
| `atlas_scan_polar` | Atlas | The first sighting of this machine | Polar Pup. Shoot it when it opens red. | Polwelpe. Schieß, wenn es rot aufgeht. | elevenlabs | elevenlabs |
| `atlas_scan_warden` | Atlas | The first sighting of this machine | Warden. Hit the core when it opens. | Wächter. Triff den Kern, wenn er aufgeht. | elevenlabs | elevenlabs |
| `atlas_scan_hornet` | Atlas | The first sighting of this machine | Hornet Rotor. It dives straight: sidestep! | Hornissenrotor. Er stürzt geradeaus: zur Seite! | elevenlabs | elevenlabs |
| `atlas_scan_stalker` | Atlas | The first sighting of this machine | Glow Stalker. Parry the lunge. | Leuchtpirscher. Pariere den Sprung. | elevenlabs | elevenlabs |
| `atlas_scan_puffer` | Atlas | The first sighting of this machine | Puffer Mine. Pop it before it swells. | Kugelfischmine. Platz ihn, bevor er anschwillt. | elevenlabs | elevenlabs |
| `atlas_scan_mole` | Atlas | The first sighting of this machine | Mole Driller. Hit it when it pops up. | Maulwurfbohrer. Triff ihn beim Auftauchen. | elevenlabs | elevenlabs |
| `atlas_scan_elite` | Atlas | The first sighting of this machine | Gold ring. Elite. Careful. | Goldring. Elite. Vorsicht. | elevenlabs | **missing** |
| `atlas_scan_fire` | Atlas | The first fire-coated machine | Fire-coated. It shrugs off fire. | Feuerbeschichtet. Feuer prallt ab. | elevenlabs | elevenlabs |
| `atlas_scan_ice` | Atlas | The first ice-coated machine | Ice-coated. It shrugs off ice. | Eisbeschichtet. Eis prallt ab. | elevenlabs | elevenlabs |
| `atlas_scan_volt` | Atlas | The first volt-coated machine | Volt-coated. It shrugs off volt. | Voltbeschichtet. Volt prallt ab. | elevenlabs | elevenlabs |
| `atlas_scan_wind` | Atlas | The first wind-coated machine | Wind-coated. It shrugs off wind. | Windbeschichtet. Wind prallt ab. | elevenlabs | elevenlabs |
| `atlas_hint_blaze_lava` | Atlas | Meltdown Descent: the first catwalks over lava | That's lava down there. Stay on the metal. | Da unten ist Lava. Bleib auf dem Metall. | elevenlabs | elevenlabs |
| `atlas_hint_blaze_leap` | Atlas | Meltdown Descent: the first dash-leap gap | Too wide to walk. Slide off the edge, you'll carry. | Zu weit zum Gehen. Rutsch über die Kante, du fliegst rüber. | elevenlabs | elevenlabs |
| `atlas_hint_blaze_vents` | Atlas | Meltdown Descent: the flame-vent walkway | Hiss, then fire. Let the roar pass, then go. | Erst Zischen, dann Feuer. Warte das Fauchen ab, dann los. | elevenlabs | elevenlabs |
| `atlas_hint_blaze_barrels` | Atlas | Meltdown Descent: the ember barrels cross the stairs | Barrels! Watch the lamps, cross between them. | Fässer! Achte auf die Lampen, geh zwischen ihnen durch. | elevenlabs | elevenlabs |
| `atlas_hint_blaze_hammers` | Atlas | Meltdown Descent: the forge hammers over the walkway | Forge hammers. Count the beat, then run. | Schmiedehämmer. Zähl den Takt, dann lauf. | elevenlabs | elevenlabs |
| `atlas_hint_cryo_ice` | Atlas | Glacier Run: the first ice patch, in the lobby | Ice! Let go of the stick and you'll keep sliding. | Eis! Lass den Stick los, und du rutschst weiter. | elevenlabs | elevenlabs |
| `atlas_hint_cryo_spikes` | Atlas | Glacier Run: the ice bridge over the spike pit | Spikes under that ice. Walk it straight, no sharp turns. | Stacheln unter dem Eis. Geh geradeaus, keine scharfen Kurven. | elevenlabs | elevenlabs |
| `atlas_hint_cryo_frost` | Atlas | Glacier Run: the first frost thrower | Frost thrower. It glows and hisses first. Cross when it's quiet. | Frostwerfer. Erst glüht und zischt er. Geh, wenn er still ist. | elevenlabs | elevenlabs |
| `atlas_hint_cryo_icicles` | Atlas | Glacier Run: the icicle hall | Shadows on the floor? Icicles. Step out of the ring! | Schatten am Boden? Eiszapfen. Raus aus dem Ring! | elevenlabs | elevenlabs |
| `atlas_hint_cryo_pillar` | Atlas | Glacier Run: a cracked ice pillar in sight | That pillar's cracked. Shoot it, and there's your shortcut. | Die Säule hat Risse. Schieß drauf – schon hast du eine Abkürzung. | elevenlabs | elevenlabs |
| `atlas_hint_volt_panels` | Atlas | Rail Rush: first coming up to the electrified floor panels | Those panels pulse. Wait on a dark row, then step. | Die Platten pulsieren. Warte auf einer dunklen Reihe, dann los. | elevenlabs | elevenlabs |
| `atlas_hint_volt_board` | Atlas | Rail Rush: the maglev cart sets off with Flux on it | Hands off the controls — I'll drive, you shoot. | Hände weg vom Steuer — ich fahre, du schießt. | elevenlabs | elevenlabs |
| `atlas_hint_gale_leap` | Atlas | Sky Docks: the first one-cell gap between islands | Gap's too wide to walk. Slide off the edge — you'll carry. | Zu breit zum Gehen. Rutsch über die Kante – du fliegst mit. | elevenlabs | elevenlabs |
| `atlas_hint_gale_wind` | Atlas | Sky Docks: the mouth of the wind tunnel | Wait for the gust to die, then move. Or hide behind a pillar. | Warte, bis die Böe abflaut, dann los. Oder duck dich hinter eine Säule. | elevenlabs | elevenlabs |
| `atlas_secret_lights` | Atlas | First time near a lamp puzzle (copy the panel's on/off pattern) | That panel shows a pattern. The lamps on the wall don't. Yet. | Das Schild zeigt ein Muster. Die Lampen an der Wand noch nicht. | elevenlabs | elevenlabs |
| `atlas_secret_color` | Atlas | First time near a colour puzzle (only the frame's colour lit) | That frame has a favourite colour. Only its lamps should shine. | Der Rahmen hat eine Lieblingsfarbe. Nur ihre Lampen sollen leuchten. | elevenlabs | elevenlabs |
| `atlas_secret_cycle` | Atlas | First time near a colour-cycle puzzle (each hit steps the colour) | Every hit changes a lamp's mind. The panel knows what it wants. | Jeder Treffer ändert die Meinung einer Lampe. Das Schild weiß, was es will. | elevenlabs | elevenlabs |
| `atlas_secret_solved` | Atlas | A secret wall opens (puzzle solved) | Well, well. Someone likes puzzles. | Sieh an. Da mag jemand Rätsel. | elevenlabs | elevenlabs |
| `story_vex_diagnosis` | Vex | Intro: Vex takes over the screens | Diagnosis: this valley is SICK. The cure… is ME! | Diagnose: Dieses Tal ist KRANK. Die Heilung… bin ICH! | elevenlabs | elevenlabs |
| `vex_present_scrapper` | Vex | Presents the Scrapper | Warm up act! The Scrapper! | Die Vorband! Der Schrottbrecher! | elevenlabs | elevenlabs |
| `vex_hub_scrapper` | Vex | The hub, after the Scrapper | A junk crane? How… adorable. | Ein Schrottkran? Wie… entzückend. | elevenlabs | elevenlabs |
| `vex_present_blaze` | Vex | Presents the Blaze Master | The oldest! The hottest! Blaze Master! | Der Älteste! Der Heißeste! Glutmeister! | elevenlabs | elevenlabs |
| `vex_hub_blaze` | Vex | The hub, after the Blaze Master | Side effect noted. Increasing the dose. | Nebenwirkung notiert. Ich erhöhe die Dosis. | elevenlabs | elevenlabs |
| `vex_present_frost` | Vex | Presents the Frost Master | Chill, little droid. Frost Master! | Bleib cool, kleiner Droide. Frostmeister! | elevenlabs | elevenlabs |
| `vex_hub_blueprint` | Vex | The hub: Flux found his blueprint | My sketches! Magnificent, aren't I? | Meine Skizzen! Großartig, nicht wahr? | elevenlabs | elevenlabs |
| `vex_volt_hack` | Vex | Volt Tower: he hacks Atlas | Let's see what's in that empty head… | Mal sehen, was in dem leeren Kopf steckt… | elevenlabs | elevenlabs |
| `vex_volt_fail` | Vex | Volt Tower: the hack fails | Unwritable?! How RUDE. | Nicht beschreibbar?! Wie UNVERSCHÄMT. | elevenlabs | elevenlabs |
| `vex_present_volt` | Vex | Presents the Volt Master | Blink and you'll miss it! Volt Master! | Einmal blinzeln und er ist weg! Voltmeister! | elevenlabs | elevenlabs |
| `vex_hub_volt` | Vex | The hub, after the Volt Master | I am… per-fect-ly… FINE. | Mir geht es… ab-so-lut… BESTENS. | elevenlabs | elevenlabs |
| `vex_present_gale` | Vex | Presents the Gale Master | Next, please! Gale Master, blow him away! | Der Nächste, bitte! Sturmmeister, puste ihn weg! | elevenlabs | elevenlabs |
| `vex_hub_gale` | Vex | The hub, after the Gale Master: the shield holds, he calls up his reserve | Fine! I have MORE Masters. | Schön! Ich habe noch MEHR Meister. | elevenlabs | elevenlabs |
| `atlas_sector_magnet` | Atlas | Beam-in: Polarity Works | A foundry. It's casting claws. | Eine Gießerei. Hier entstehen Klauen. | elevenlabs | elevenlabs |
| `vex_present_magnet` | Vex | Presents the Magnet Master | Attractive, isn't it? Magnet Master! | Anziehend, nicht wahr? Magnetmeister! | elevenlabs | elevenlabs |
| `atlas_story_magnetFreed` | Atlas | The Magnet Master is freed | The foundry's cold. No more claws. | Die Gießerei ist kalt. Keine Klauen mehr. | elevenlabs | elevenlabs |
| `vex_hub_magnet` | Vex | The hub, after the Magnet Master | Repelled? Me? Im-POSSIBLE! | Abgestoßen? Ich? Un-MÖGLICH! | elevenlabs | elevenlabs |
| `atlas_sector_drill` | Atlas | Beam-in: Deep Mine | Ore for its armor. Dug right here. | Erz für seine Panzerung. Von hier unten. | elevenlabs | elevenlabs |
| `vex_present_drill` | Vex | Presents the Drill Master | Time for a deep check-up! Drill Master! | Zeit für eine Tiefenuntersuchung! Bohrmeister! | elevenlabs | elevenlabs |
| `atlas_story_drillFreed` | Atlas | The Drill Master is freed | The mine's quiet. No more ore. | Die Mine ist still. Kein Erz mehr. | elevenlabs | elevenlabs |
| `vex_hub_drill` | Vex | The hub, after the Drill Master | Hmph. A new low. Literally. | Pah. Ein neuer Tiefpunkt. Wörtlich. | elevenlabs | elevenlabs |
| `atlas_sector_tide` | Atlas | Beam-in: Tidewater Locks | Barges now. Vex found another way. | Jetzt Lastkähne. Vex hat einen neuen Weg. | elevenlabs | elevenlabs |
| `vex_present_tide` | Vex | Presents the Tide Master | Wave goodbye, droid! Tide Master! | Hier kommt die große Welle! Gezeitenmeister! | elevenlabs | elevenlabs |
| `atlas_story_tideFreed` | Atlas | The Tide Master is freed | Locks shut. The barges stay home. | Schleusen zu. Die Kähne bleiben daheim. | elevenlabs | elevenlabs |
| `vex_hub_tide` | Vex | The hub, after the Tide Master | The tide will turn! …Won't it? | Die Flut kommt wieder! …Oder? | elevenlabs | elevenlabs |
| `atlas_sector_neon` | Atlas | Beam-in: Blackout Boulevard | Lights out. Except Vex's face. | Licht aus. Nur Vex' Gesicht nicht. | elevenlabs | elevenlabs |
| `vex_present_neon` | Vex | Presents the Neon Master | Lights! Camera! Neon Master! | Licht! Kamera! Neonmeister! | elevenlabs | elevenlabs |
| `atlas_story_neonFreed` | Atlas | The Neon Master is freed | Lights on. Vex lost its screens. | Licht an. Vex hat keine Bildschirme mehr. | elevenlabs | elevenlabs |
| `vex_hub_neon` | Vex | The hub, after the Neon Master | Who turned the lights ON?! | Wer hat das Licht ANGEMACHT?! | elevenlabs | elevenlabs |
| `atlas_sector_rotor` | Atlas | Beam-in: Rotor Run | Drones. Its last supply line. | Drohnen. Seine letzte Versorgungslinie. | elevenlabs | elevenlabs |
| `vex_present_rotor` | Vex | Presents the Rotor Master, the last of his reserve | The grand finale! Rotor Master! | Das große Finale! Rotormeister! | elevenlabs | elevenlabs |
| `atlas_story_rotorFreed` | Atlas | The Rotor Master is freed: the tenth relay | Every line's cut. Vex is alone. | Alle Linien gekappt. Vex ist allein. | elevenlabs | elevenlabs |
| `vex_hub_rotor` | Vex | The hub, after the Rotor Master: the Breach begins (just before vex.hub.breach) | Ten relays?! Nurse! NURSE! | Zehn Relais?! Schwester! SCHWESTER! | elevenlabs | elevenlabs |
| `vex_hub_breach` | Vex | The hub: his shield has fallen | No, no, NO! That shield was PATENTED! | Nein, nein, NEIN! Der Schild war PATENTIERT! | elevenlabs | elevenlabs |
| `vex_fortress_welcome` | Vex | Entering the Fortress | Welcome to my clinic! Take a seat… FOREVER! | Willkommen in meiner Klinik! Nimm Platz… für IMMER! | elevenlabs | elevenlabs |
| `vex_mk1_intro` | Vex | Mk-I intro | Behold! My new body! Mark ONE! | Seht her! Mein neuer Körper! Mark EINS! | elevenlabs | elevenlabs |
| `vex_mk1_obey` | Vex | Mk-I fight: he calls the Masters | Masters! OBEY your doctor! | Meister! GEHORCHT eurem Doktor! | elevenlabs | elevenlabs |
| `vex_mk1_listen` | Vex | Mk-I phase 2: the Masters refuse | Why won't they LISTEN?! | Warum HÖREN sie nicht?! | elevenlabs | elevenlabs |
| `vex_mk1_defeat` | Vex | Mk-I defeated | I'll get… a second opinion… | Ich hole mir… eine zweite Meinung… | elevenlabs | elevenlabs |
| `vex_sting_doctorIn` | Vex | New Game+ only: the sting after the credits | The doctor… is IN. | Der Doktor… ist DA. | elevenlabs | elevenlabs |
| `vex_laugh_short` | Vex | A bubble that ends in a laugh | Mwa-ha-HA! | (English for all) | elevenlabs | en file |
| `vex_laugh_medium` | Vex | A bubble that ends in a laugh | Mwa-ha-HA! | (English for all) | elevenlabs | en file |
| `vex_laugh_maniacal` | Vex | A bubble that ends in a laugh | Mwa-ha-HA! | (English for all) | elevenlabs | en file |
| `flux_hurt_light_1` | Flux | Flux takes a hit: light (the game picks one of 3 at random; synth tail in post: a short tick) | Oof! | (English for all) | elevenlabs | en file |
| `flux_hurt_light_2` | Flux | Flux takes a hit: light (the game picks one of 3 at random; synth tail in post: a short tick) | Ow! | (English for all) | elevenlabs | en file |
| `flux_hurt_light_3` | Flux | Flux takes a hit: light (the game picks one of 3 at random; synth tail in post: a short tick) | Hey! | (English for all) | elevenlabs | en file |
| `flux_hurt_heavy_1` | Flux | Flux takes a hit: heavy (the game picks one of 3 at random; synth tail in post: a metal clang) | KLONK! | (English for all) | elevenlabs | en file |
| `flux_hurt_heavy_2` | Flux | Flux takes a hit: heavy (the game picks one of 3 at random; synth tail in post: a metal clang) | Arrgh! | (English for all) | elevenlabs | en file |
| `flux_hurt_heavy_3` | Flux | Flux takes a hit: heavy (the game picks one of 3 at random; synth tail in post: a metal clang) | Whoa-oa! | (English for all) | elevenlabs | en file |
| `flux_hurt_fire_1` | Flux | Flux takes a hit: fire (the game picks one of 3 at random; synth tail in post: a sizzle) | Yeowch! | (English for all) | elevenlabs | en file |
| `flux_hurt_fire_2` | Flux | Flux takes a hit: fire (the game picks one of 3 at random; synth tail in post: a sizzle) | Hot-hot-hot! | (English for all) | elevenlabs | en file |
| `flux_hurt_fire_3` | Flux | Flux takes a hit: fire (the game picks one of 3 at random; synth tail in post: a sizzle) | Yeowch! | (English for all) | elevenlabs | en file |
| `flux_hurt_ice_1` | Flux | Flux takes a hit: ice (the game picks one of 3 at random; synth tail in post: a crystal tinkle) | Brrr-zzt! | (English for all) | elevenlabs | en file |
| `flux_hurt_ice_2` | Flux | Flux takes a hit: ice (the game picks one of 3 at random; synth tail in post: a crystal tinkle) | Ch-chilly! | (English for all) | elevenlabs | en file |
| `flux_hurt_ice_3` | Flux | Flux takes a hit: ice (the game picks one of 3 at random; synth tail in post: a crystal tinkle) | Brrr-zzt! | (English for all) | elevenlabs | en file |
| `flux_hurt_volt_1` | Flux | Flux takes a hit: volt (the game picks one of 3 at random; synth tail in post: a static crackle) | Bzzzt! | (English for all) | elevenlabs | en file |
| `flux_hurt_volt_2` | Flux | Flux takes a hit: volt (the game picks one of 3 at random; synth tail in post: a static crackle) | Zzap! | (English for all) | elevenlabs | en file |
| `flux_hurt_volt_3` | Flux | Flux takes a hit: volt (the game picks one of 3 at random; synth tail in post: a static crackle) | Bzzzt! | (English for all) | elevenlabs | en file |
| `flux_hurt_wind_1` | Flux | Flux takes a hit: wind (the game picks one of 3 at random; synth tail in post: a whoosh) | Whoa-oa-oa! | (English for all) | elevenlabs | en file |
| `flux_hurt_wind_2` | Flux | Flux takes a hit: wind (the game picks one of 3 at random; synth tail in post: a whoosh) | Whoa-oa-oa! | (English for all) | elevenlabs | en file |
| `flux_hurt_wind_3` | Flux | Flux takes a hit: wind (the game picks one of 3 at random; synth tail in post: a whoosh) | Whoa-oa-oa! | (English for all) | elevenlabs | en file |
| `flux_hurt_trap_1` | Flux | Flux takes a hit: trap (the game picks one of 3 at random; synth tail in post: none) | Yikes! | (English for all) | elevenlabs | en file |
| `flux_hurt_trap_2` | Flux | Flux takes a hit: trap (the game picks one of 3 at random; synth tail in post: none) | Not cool! | (English for all) | elevenlabs | en file |
| `flux_hurt_trap_3` | Flux | Flux takes a hit: trap (the game picks one of 3 at random; synth tail in post: none) | Yikes! | (English for all) | elevenlabs | en file |
| `flux_hurt_crusher_1` | Flux | Flux takes a hit: crusher (the game picks one of 3 at random; synth tail in post: a squeaky-toy squash) | Squonk! | (English for all) | elevenlabs | en file |
| `flux_hurt_crusher_2` | Flux | Flux takes a hit: crusher (the game picks one of 3 at random; synth tail in post: a squeaky-toy squash) | Squonk! | (English for all) | elevenlabs | en file |
| `flux_hurt_crusher_3` | Flux | Flux takes a hit: crusher (the game picks one of 3 at random; synth tail in post: a squeaky-toy squash) | Squonk! | (English for all) | elevenlabs | en file |
| `flux_hurt_pit_1` | Flux | Flux takes a hit: pit (the game picks one of 3 at random; synth tail in post: a Doppler fall) | Wha— aaaa! | (English for all) | elevenlabs | en file |
| `flux_hurt_pit_2` | Flux | Flux takes a hit: pit (the game picks one of 3 at random; synth tail in post: a Doppler fall) | Wha— aaaa! | (English for all) | elevenlabs | en file |
| `flux_hurt_pit_3` | Flux | Flux takes a hit: pit (the game picks one of 3 at random; synth tail in post: a Doppler fall) | Wha— aaaa! | (English for all) | elevenlabs | en file |
| `flux_hurt_lowHp_1` | Flux | Flux takes a hit: lowHp (the game picks one of 3 at random; synth tail in post: a low servo whine) | Nnngh! | (English for all) | elevenlabs | en file |
| `flux_hurt_lowHp_2` | Flux | Flux takes a hit: lowHp (the game picks one of 3 at random; synth tail in post: a low servo whine) | Nnngh! | (English for all) | elevenlabs | en file |
| `flux_hurt_lowHp_3` | Flux | Flux takes a hit: lowHp (the game picks one of 3 at random; synth tail in post: a low servo whine) | Nnngh! | (English for all) | elevenlabs | en file |
| `flux_hurt_down_1` | Flux | Flux takes a hit: down (the game picks one of 3 at random; synth tail in post: a power-down sweep) | Uh-oh… | (English for all) | elevenlabs | en file |
| `flux_hurt_down_2` | Flux | Flux takes a hit: down (the game picks one of 3 at random; synth tail in post: a power-down sweep) | Uh-oh… | (English for all) | elevenlabs | en file |
| `flux_hurt_down_3` | Flux | Flux takes a hit: down (the game picks one of 3 at random; synth tail in post: a power-down sweep) | Uh-oh… | (English for all) | elevenlabs | en file |
| `flux_hurt_parry_1` | Flux | Flux takes a hit: parry (the game picks one of 3 at random; synth tail in post: a bright ping) | Ha! | (English for all) | elevenlabs | en file |
| `flux_hurt_parry_2` | Flux | Flux takes a hit: parry (the game picks one of 3 at random; synth tail in post: a bright ping) | Ha! | (English for all) | elevenlabs | en file |
| `flux_hurt_parry_3` | Flux | Flux takes a hit: parry (the game picks one of 3 at random; synth tail in post: a bright ping) | Ha! | (English for all) | elevenlabs | en file |
| `flux_hurt_gel_1` | Flux | Flux takes a hit: gel (the game picks one of 3 at random; synth tail in post: a rising refill shimmer) | Aaah~ | (English for all) | elevenlabs | en file |
| `flux_hurt_gel_2` | Flux | Flux takes a hit: gel (the game picks one of 3 at random; synth tail in post: a rising refill shimmer) | Aaah~ | (English for all) | elevenlabs | en file |
| `flux_hurt_gel_3` | Flux | Flux takes a hit: gel (the game picks one of 3 at random; synth tail in post: a rising refill shimmer) | Aaah~ | (English for all) | elevenlabs | en file |
| `atlas_hint_vex_roof` | Atlas | Vex Fortress: the roof fight begins, the first lightning ring | Lightning! Move when the ring lights up! | Blitze! Weg, wenn der Ring aufleuchtet! | elevenlabs | elevenlabs |
| `atlas_hint_vex_fall` | Atlas | Vex Fortress: the roof collapses at 65 % | The roof's giving way! | Das Dach bricht ein! | elevenlabs | elevenlabs |
| `atlas_hint_vex_core` | Atlas | Vex Fortress: the drop to the Core ring at 30 % | Down to the Core! Don't fall in! | Runter zum Kern! Nicht reinfallen! | elevenlabs | elevenlabs |
| `atlas_hint_gm_button` | Atlas | Vex Fortress: Vex falls and presses his red button | Vex is pressing something... Brace yourself! | Vex drückt irgendwas... Mach dich bereit! | elevenlabs | elevenlabs |
| `atlas_hint_gm_arms` | Atlas | Grand Master: the fight starts, the arms are the target | Its arms first! The cannon and the lance! | Erst die Arme! Kanone und Lanze! | elevenlabs | elevenlabs |
| `atlas_hint_gm_feet` | Atlas | Grand Master: both arms down, the feet next | Now the feet! Block the shockwaves! | Jetzt die Füße! Blocke die Schockwellen! | elevenlabs | elevenlabs |
| `atlas_hint_gm_head` | Atlas | Grand Master: it sinks, the head comes in reach | It's down low. The head is in reach! | Er ist unten. Der Kopf ist in Reichweite! | elevenlabs | elevenlabs |
| `atlas_hint_gm_body` | Atlas | Grand Master: the last part, the core | The core is open! Finish it! | Der Kern liegt frei! Mach ihn fertig! | elevenlabs | elevenlabs |
| `atlas_hint_gm_prism` | Atlas | Grand Master: the Prism Cannon charges | Prism Cannon! Shield up! | Prismakanone! Schild hoch! | elevenlabs | elevenlabs |
| `atlas_hint_neon_blackout` | Atlas | Blackout Boulevard: at the first pulse bridge | Power's failing! Cross when the lights come back. | Der Strom fällt aus! Rüber, wenn das Licht wieder angeht. | elevenlabs | elevenlabs |
| `atlas_hint_drill_board` | Atlas | Deep Mine: boarding the ore cart | Ore cart's rolling! I steer, you shoot the moles. | Die Lore rollt! Ich lenke, du schießt auf die Maulwürfe. | elevenlabs | elevenlabs |
| `ending_gauss` | Gauss | The ending: Gauss steps out of her capsule | Flux... you did it. You brought them all back. | Flux... du hast es geschafft. Du hast sie alle zurückgebracht. | elevenlabs | elevenlabs |
| `ending_atlas` | Atlas | The ending: Atlas and the empty Spire | The Spire is empty. I could run this city now. I won't. It's theirs. | Der Turm ist leer. Ich könnte diese Stadt jetzt lenken. Tu ich nicht. Sie gehört ihnen. | elevenlabs | elevenlabs |
| `ending_spark` | Gauss | The ending: the sunrise, the last line | Flux... did you see that spark? | Flux... hast du den Funken gesehen? | elevenlabs | elevenlabs |
| `pip_debrief_hello` | Pip | The first debrief: Pip greets Flux over the valley | Welcome back, Flux! Look at the valley. | Willkommen zurück, Flux! Schau dir das Tal an. | elevenlabs | elevenlabs |
| `pip_debrief_scrapyard_won` | Pip | Debrief after Scrapyard: what the win changed | The old crane is sorting scrap again. | Der alte Kran sortiert wieder Schrott. | elevenlabs | elevenlabs |
| `pip_debrief_scrapyard_weapon` | Pip | Debrief after Scrapyard: the copied weapon's card | You copied Scrap Burst. It sprays three ways. | Du hast die Schrottsalve kopiert. Sie streut in drei Richtungen. | elevenlabs | elevenlabs |
| `pip_debrief_scrapyard_next` | Pip | Debrief after Scrapyard: the camera travels to Blaze Refinery | Next stop: Blaze Refinery. Just a little tougher. | Nächster Halt: Glutraffinerie. Nur ein bisschen härter. | elevenlabs | elevenlabs |
| `pip_debrief_scrapyard_boss` | Pip | Debrief after Scrapyard: what the Master of Blaze Refinery has done | Blaze Master is forging armor for Vex's machines. | Der Glutmeister schmiedet dort Panzerplatten für Vex' Maschinen. | elevenlabs | elevenlabs |
| `pip_debrief_scrapyard_tip` | Pip | Debrief after Scrapyard: how to beat the next Master | Block its fireballs. Slide past the fire waves. | Blocke seine Feuerbälle. Rutsch an den Feuerwellen vorbei. | elevenlabs | elevenlabs |
| `pip_debrief_blaze_won` | Pip | Debrief after Blaze Refinery: what the win changed | The chimneys burn clean again. Nice work! | Die Schornsteine brennen wieder sauber. Gut gemacht! | elevenlabs | elevenlabs |
| `pip_debrief_blaze_weapon` | Pip | Debrief after Blaze Refinery: the copied weapon's card | You've got Flame Wave now. Fire melts ice! | Du hast jetzt die Flammenwelle. Feuer schmilzt Eis! | elevenlabs | elevenlabs |
| `pip_debrief_blaze_next` | Pip | Debrief after Blaze Refinery: the camera travels to Cryo Plant | Cryo Plant is next. The machines hit harder there. | Als Nächstes: Kryowerk. Die Maschinen dort schlagen härter zu. | elevenlabs | elevenlabs |
| `pip_debrief_blaze_boss` | Pip | Debrief after Blaze Refinery: what the Master of Cryo Plant has done | Frost Master keeps all the coolant. The city's overheating. | Der Frostmeister behält das ganze Kühlmittel. Die Stadt überhitzt. | elevenlabs | elevenlabs |
| `pip_debrief_blaze_tip` | Pip | Debrief after Blaze Refinery: how to beat the next Master | Block its ice shots, then fire back! | Blocke seine Eisschüsse, dann heiz ihm ein! | elevenlabs | elevenlabs |
| `pip_debrief_cryo_won` | Pip | Debrief after Cryo Plant: what the win changed | Coolant's flowing home. The city can cool down. | Das Kühlmittel fließt heim. Die Stadt kühlt ab. | elevenlabs | elevenlabs |
| `pip_debrief_cryo_weapon` | Pip | Debrief after Cryo Plant: the copied weapon's card | Ice Lance is yours. Ice beats lightning! | Die Eislanze gehört dir. Eis schlägt Blitz! | elevenlabs | elevenlabs |
| `pip_debrief_cryo_next` | Pip | Debrief after Cryo Plant: the camera travels to Volt Tower | Next: Volt Tower, downtown. A real step up. | Weiter zum Voltturm in der Innenstadt. Deutlich härter. | elevenlabs | elevenlabs |
| `pip_debrief_cryo_boss` | Pip | Debrief after Cryo Plant: what the Master of Volt Tower has done | Volt Master pours our power into the Red Signal. | Der Voltmeister pumpt unseren Strom ins Rote Signal. | elevenlabs | elevenlabs |
| `pip_debrief_cryo_tip` | Pip | Debrief after Cryo Plant: how to beat the next Master | It teleports a lot. Shoot down its orbs. | Er teleportiert ständig. Schieß seine Blitzkugeln ab. | elevenlabs | elevenlabs |
| `pip_debrief_volt_won` | Pip | Debrief after Volt Tower: what the win changed | Vex's face keeps flickering now. Did you see? | Vex' Gesicht flackert jetzt ständig. Hast du's gesehen? | elevenlabs | elevenlabs |
| `pip_debrief_volt_weapon` | Pip | Debrief after Volt Tower: the copied weapon's card | Thunder Arc is yours. Lightning beats wind! | Der Donnerbogen gehört dir. Blitz schlägt Wind! | elevenlabs | elevenlabs |
| `pip_debrief_volt_next` | Pip | Debrief after Volt Tower: the camera travels to Sky Docks | Next: Sky Docks, way up high. Tough machines. | Als Nächstes: Himmelsdocks, ganz weit oben. Harte Maschinen. | elevenlabs | elevenlabs |
| `pip_debrief_volt_boss` | Pip | Debrief after Volt Tower: what the Master of Sky Docks has done | Gale Master runs Vex's airships, day and night. | Der Sturmmeister steuert Vex' Luftschiffe, Tag und Nacht. | elevenlabs | elevenlabs |
| `pip_debrief_volt_tip` | Pip | Debrief after Volt Tower: how to beat the next Master | Block the feathers. Parry when it dives! | Blocke die Federn. Pariere, wenn er herabstößt! | elevenlabs | elevenlabs |
| `pip_debrief_gale_won` | Pip | Debrief after Sky Docks: what the win changed | The airships turned around. Clear skies again! | Die Luftschiffe sind umgekehrt. Der Himmel ist frei! | elevenlabs | elevenlabs |
| `pip_debrief_gale_weapon` | Pip | Debrief after Sky Docks: the copied weapon's card | Gale Guard is yours. Its leaves block shots. | Der Sturmschild gehört dir. Seine Blätter blocken Schüsse. | elevenlabs | elevenlabs |
| `pip_debrief_gale_next` | Pip | Debrief after Sky Docks: the camera travels to Polarity Works | Now the city's edge: Polarity Works. Much tougher. | Jetzt an den Stadtrand: Polaritätswerk. Viel härter. | elevenlabs | elevenlabs |
| `pip_debrief_gale_boss` | Pip | Debrief after Sky Docks: what the Master of Polarity Works has done | Magnet Master took the tram rails for Vex's freight. | Der Magnetmeister nutzt die Tramschienen für Vex' Fracht. | elevenlabs | elevenlabs |
| `pip_debrief_gale_tip` | Pip | Debrief after Sky Docks: how to beat the next Master | It pulls you in. Block the clamp! | Er zieht dich heran. Blocke, wenn er zupackt! | elevenlabs | elevenlabs |
| `pip_debrief_magnet_won` | Pip | Debrief after Polarity Works: what the win changed | The trams are rolling again. Ding ding! | Die Trams rollen wieder. Bim, bim! | elevenlabs | elevenlabs |
| `pip_debrief_magnet_weapon` | Pip | Debrief after Polarity Works: the copied weapon's card | Magnet Pull cracks shields. Perfect for the next Master. | Der Magnetzug knackt Schilde. Genau richtig für den nächsten Meister. | elevenlabs | elevenlabs |
| `pip_debrief_magnet_next` | Pip | Debrief after Polarity Works: the camera travels to Deep Mine | Next: Deep Mine, deep underground. Seriously strong machines. | Als Nächstes: Tiefenmine, tief unter der Erde. Richtig starke Maschinen. | **missing** | elevenlabs |
| `pip_debrief_magnet_boss` | Pip | Debrief after Polarity Works: what the Master of Deep Mine has done | Drill Master trapped the worker-bots down the shaft. | Der Bohrmeister hält die Arbeiterbots im Schacht fest. | elevenlabs | elevenlabs |
| `pip_debrief_magnet_tip` | Pip | Debrief after Polarity Works: how to beat the next Master | It digs under you. Step off the mark! | Er gräbt sich unter dich. Runter von der Markierung! | elevenlabs | elevenlabs |
| `pip_debrief_drill_won` | Pip | Debrief after Deep Mine: what the win changed | The worker-bots are back up in daylight. | Die Arbeiterbots sind wieder oben im Tageslicht. | elevenlabs | elevenlabs |
| `pip_debrief_drill_weapon` | Pip | Debrief after Deep Mine: the copied weapon's card | Drill Bomb goes boom. Save some for the boss! | Die Bohrbombe macht Bumm. Heb dir welche für den Boss auf! | elevenlabs | elevenlabs |
| `pip_debrief_drill_next` | Pip | Debrief after Deep Mine: the camera travels to Tidewater Locks | Next: Tidewater Locks, down by the water. Very tough. | Als Nächstes: Gezeitenschleusen, unten am Wasser. Sehr hart. | elevenlabs | elevenlabs |
| `pip_debrief_drill_boss` | Pip | Debrief after Deep Mine: what the Master of Tidewater Locks has done | Tide Master is flooding the canals for Vex's barges. | Der Gezeitenmeister flutet die Kanäle für Vex' Lastkähne. | elevenlabs | elevenlabs |
| `pip_debrief_drill_tip` | Pip | Debrief after Deep Mine: how to beat the next Master | Slide under its waves. Pop the bubbles! | Rutsch unter seinen Wellen durch. Lass die Blasen platzen! | elevenlabs | elevenlabs |
| `pip_debrief_tide_won` | Pip | Debrief after Tidewater Locks: what the win changed | Clean water's flowing into the valley again. | Sauberes Wasser fließt wieder ins Tal. | elevenlabs | elevenlabs |
| `pip_debrief_tide_weapon` | Pip | Debrief after Tidewater Locks: the copied weapon's card | Bubble Lance rolls through crowds. The boss hates bubbles! | Die Blasenlanze rollt durch ganze Gruppen. Der Boss hasst Blasen! | elevenlabs | elevenlabs |
| `pip_debrief_tide_next` | Pip | Debrief after Tidewater Locks: the camera travels to Blackout Boulevard | Next: Blackout Boulevard, the dark rooftops. Really dangerous. | Als Nächstes: Blackout-Boulevard, die dunklen Dächer. Richtig gefährlich. | elevenlabs | elevenlabs |
| `pip_debrief_tide_boss` | Pip | Debrief after Tidewater Locks: what the Master of Blackout Boulevard has done | Neon Master switched off every window downtown. | Der Neonmeister hat jedes Fenster der Innenstadt ausgeknipst. | elevenlabs | elevenlabs |
| `pip_debrief_tide_tip` | Pip | Debrief after Tidewater Locks: how to beat the next Master | Its blade flies out and back. Dodge twice! | Seine Klinge fliegt hin und zurück. Weich zweimal aus! | elevenlabs | elevenlabs |
| `pip_debrief_neon_won` | Pip | Debrief after Blackout Boulevard: what the win changed | Downtown's glowing pink tonight. So pretty! | Die Innenstadt leuchtet heute pink. So schön! | elevenlabs | elevenlabs |
| `pip_debrief_neon_weapon` | Pip | Debrief after Blackout Boulevard: the copied weapon's card | Neon Blade cuts twice. The next Master fears it! | Die Neonklinge schneidet zweimal. Der nächste Meister fürchtet sie! | elevenlabs | elevenlabs |
| `pip_debrief_neon_next` | Pip | Debrief after Blackout Boulevard: the camera travels to Rotor Run | Next: Rotor Run, the sky airfield. Almost the toughest. | Als Nächstes: Rotorflug, der Flugplatz am Himmel. Fast das Härteste. | elevenlabs | elevenlabs |
| `pip_debrief_neon_boss` | Pip | Debrief after Blackout Boulevard: what the Master of Rotor Run has done | Rotor Master fills the sky with cargo drones. | Der Rotormeister füllt den Himmel mit Frachtdrohnen. | elevenlabs | elevenlabs |
| `pip_debrief_neon_tip` | Pip | Debrief after Blackout Boulevard: how to beat the next Master | It blows you back. Slide under the gusts! | Er bläst dich zurück. Rutsch unter den Böen durch! | elevenlabs | elevenlabs |
| `pip_debrief_rotor_won` | Pip | Debrief after Rotor Run: what the win changed | The drones deliver to the worker-bots now. | Die Drohnen liefern jetzt an die Arbeiterbots. | elevenlabs | elevenlabs |
| `pip_debrief_rotor_weapon` | Pip | Debrief after Rotor Run: the copied weapon's card | Drone Swarm is yours. Three drones find their targets. | Der Drohnenschwarm gehört dir. Drei Drohnen finden ihr Ziel. | elevenlabs | elevenlabs |
| `pip_debrief_rotor_next` | Pip | Debrief after Rotor Run: the camera travels to Vex Fortress | Last stop: Vex Fortress. The toughest place there is. | Letzter Halt: Festung Vex. Härter wird's nirgends. | elevenlabs | elevenlabs |
| `pip_debrief_rotor_boss` | Pip | Debrief after Rotor Run: what the Master of Vex Fortress has done | Dr. Vex Mk-I can't hide behind a shield now. | Dr. Vex Mk-I kann sich hinter keinem Schild mehr verstecken. | elevenlabs | elevenlabs |
| `pip_debrief_rotor_tip` | Pip | Debrief after Rotor Run: how to beat the next Master | It borrows the Masters' attacks. Pack Repair Gel! | Er nutzt die Angriffe der Meister. Pack Reparaturgel ein! | elevenlabs | elevenlabs |
| `pip_debrief_go` | Pip | Every debrief: the last line, then the Lab | Gear up, then go! I'll mind the lab. | Rüste dich aus, dann los! Ich hüte das Labor. | elevenlabs | elevenlabs |
| `atlas_train_charge` | Atlas | A lesson room: the Charge Shot (the first room of the tutorial) | Let's train the Charge Shot! | Lass uns den Ladeschuss trainieren! | elevenlabs | elevenlabs |
| `atlas_train_block` | Atlas | A lesson room: the Perfect Block | Let's train the Perfect Block! | Lass uns das Perfekte Blocken trainieren! | elevenlabs | elevenlabs |
| `atlas_train_slide` | Atlas | A lesson room: the Slide | Let's train the Slide! | Lass uns das Rutschen trainieren! | elevenlabs | elevenlabs |
| `atlas_train_gel` | Atlas | A lesson room: the Repair Gel | Let's train the Repair Gel! | Lass uns das Reparaturgel trainieren! | elevenlabs | elevenlabs |
| `atlas_train_gap` | Atlas | A lesson room: leaping a gap | Let's train jumping over gaps! | Lass uns das Springen über Lücken trainieren! | elevenlabs | elevenlabs |
| `atlas_train_weapon` | Atlas | A lesson room: the special weapon just copied from a Master | Let's train your new weapon! | Lass uns deine neue Waffe trainieren! | elevenlabs | elevenlabs |
| `atlas_help_charge` | Atlas | A lesson: the player has not managed a Charge Shot for a while | Hold fire until the cannon glows, then let go! | Halte Feuer gedrückt, bis die Kanone glüht, dann lass los! | elevenlabs | elevenlabs |
| `atlas_help_block` | Atlas | A lesson: the player has not managed a Perfect Block for a while | Hold block when it fires. Just as it hits is perfect! | Halte Blocken gedrückt, wenn er feuert. Genau beim Einschlag ist perfekt! | elevenlabs | elevenlabs |
| `atlas_help_slide` | Atlas | A lesson: the player keeps getting caught by the ring | Slide away just before the red ring reaches you! | Rutsch weg, kurz bevor der rote Ring dich erreicht! | elevenlabs | elevenlabs |
| `atlas_help_gel` | Atlas | A lesson: the player has not used the Repair Gel yet | Use a Repair Gel to heal up! | Nutze ein Reparaturgel, um dich zu heilen! | elevenlabs | elevenlabs |
| `atlas_help_gap` | Atlas | A lesson: the player has not leapt the gap yet | Walk straight at the edge and you'll leap across! | Lauf geradeaus auf die Kante zu, dann springst du automatisch rüber! | elevenlabs | elevenlabs |
| `atlas_help_weapon` | Atlas | A lesson: the player has not fired the new weapon at the drones | Pick your new weapon and fire at the drones! | Wähl deine neue Waffe und feure auf die Drohnen! | elevenlabs | elevenlabs |
| `atlas_hint_rotor_board` | Atlas | Rotor Run: the quadcopter lifts off with Flux on it | All aboard! I fly, you shoot. | Alle einsteigen! Ich fliege, du schießt. | elevenlabs | elevenlabs |
| `atlas_hint_neon_kick` | Atlas | Blackout Boulevard: the first wall-kick shaft | Face the wall and slide. Again! Wall-kick up! | Zur Wand drehen und rutschen. Nochmal! Wandsprung nach oben! | elevenlabs | elevenlabs |
| `atlas_hint_neon_switch` | Atlas | Blackout Boulevard: the first light switch | A light switch! Shoot it to swap the bridges. | Ein Lichtschalter! Schieß drauf, um die Brücken zu tauschen. | elevenlabs | elevenlabs |
| `atlas_hint_neon_blink` | Atlas | Blackout Boulevard: the first blinking light bridge | Light bridges blink! Cross while they glow. | Lichtbrücken blinken! Rüber, solange sie leuchten. | elevenlabs | elevenlabs |
| `atlas_hint_tide_deep` | Atlas | Tidewater Locks: Flux wades into deep water | Too deep! Get out of the water! | Zu tief! Raus aus dem Wasser! | elevenlabs | elevenlabs |
| `atlas_hint_tide_valve` | Atlas | Tidewater Locks: the first flooded lock with a valve | Flooded lock! Shoot the valve to drain it. | Geflutete Schleuse! Schieß aufs Ventil, um sie zu leeren. | elevenlabs | elevenlabs |
| `atlas_hint_tide_rise` | Atlas | Tidewater Locks: the tide starts to rise | The tide's coming in. Up the steps! | Die Flut kommt. Rauf auf die Stufen! | elevenlabs | elevenlabs |
| `atlas_hint_drill_drop` | Atlas | Deep Mine: the first falling rocks | Rocks falling! Step out of the shadows. | Steinschlag! Raus aus den Schatten. | elevenlabs | elevenlabs |
| `atlas_hint_drill_rock` | Atlas | Deep Mine: the first cracked rock in the way | Cracked rock! A full charge will break it. | Rissiger Fels! Ein voller Ladeschuss knackt ihn. | elevenlabs | elevenlabs |
| `atlas_hint_magnet_panel` | Atlas | Polarity Works: the first polarity plate | See that red-blue plate? Shoot it to flip the rail. | Siehst du die rot-blaue Platte? Schieß drauf, um die Schiene umzupolen. | elevenlabs | elevenlabs |
| `atlas_hint_magnet_rail` | Atlas | Polarity Works: the first magnet rail | Magnet rail! The arrows show the pull. Push through, or ride it. | Magnetschiene! Die Pfeile zeigen den Sog. Kämpf dagegen an oder lass dich tragen. | elevenlabs | elevenlabs |
| `flux_fumble_1` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | Whoa-oh! | Hoppla-hopp! | elevenlabs | elevenlabs |
| `flux_fumble_2` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | Bzzt! Oops! | Bzzt! Ups! | elevenlabs | elevenlabs |
| `flux_fumble_3` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | My arm's got hiccups! | Mein Arm hat Schluckauf! | elevenlabs | elevenlabs |
| `flux_fumble_4` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | Error… wheee! | Fehler… juhuu! | elevenlabs | elevenlabs |
| `flux_fumble_5` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | Butter circuits! | Butter im Schaltkreis! | elevenlabs | elevenlabs |
| `flux_fumble_6` | Flux | A hard hit shook his charge loose: a wild shot, a flailing arm | Wobble mode ON! | Wackelmodus AN! | elevenlabs | elevenlabs |
| `atlas_debrief_greatJob` | Atlas | A Atlas line with no notes yet (atlas.debrief.greatJob) | Great job! Another one down. | Gute Arbeit! Wieder einer erledigt. | elevenlabs | elevenlabs |
| `atlas_debrief_toLab` | Atlas | A Atlas line with no notes yet (atlas.debrief.toLab) | Let's go to the lab. | Ab ins Labor. | elevenlabs | elevenlabs |
