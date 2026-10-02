- [x] Build a story arc with enemy proposition introduction.
Cartoonish expression like Arrrh! and Oof!(choose the best expressions yourself for Mega Droid) when taking damage-
Introduce a "Dr Evil"-like in fancy speech bubbles. 
Make it a story arc with a beginning, middle and end that fits this game and mission design.
the Intro could play in a high tech city with a cyberpunk aesthetic, showing 
Flux navigating through the city streets, encountering various enemies and 
obstacles. The story arc could involve Flux being tasked with stopping a rogue 
AI that has taken control of the city's systems, leading to a series of battles against 
corrupted machines, androids and bosses( just an idea, please make it a cool story understandble with almost no dialogs).
I think I will add english voice overs later, prepare this reflections in the story-voice-over.md(no need to implement anything yet)
The end result should be a story-arc.md file containing explanations for the intro cutscene first, the general
story outline and how it is resolved by Flux, especially how to reach the end boss/bosses.
I want to use this file to create some storyboard game and feel images for the story progress.
after your done, write me a comic.md that includes the story as prompts for each page of a comic, which I will run myself with gemini.
include Flux's KI assistent "Atlas".

I want to try a new working approach with Claude: 
Don't spawn new subagents to change code, only for research or collection task (that should prevent multiple merges and too many resource heavy unit and end2end test runs in my theory and reduce the tokens spent?)
I want you to go through the bullet points in cybercity-story.md and create and feature implementation plan using the planning mode, during which you find 
and try to auto-resolve decision by the following ordering: What would the new-web-game-playbook decide? then -> What would a MegaMan 2-7 game do? then -> What would "Elder Scrolls: Blades" do?. write all important decisions into a 
structured report that you open in the browser once done. The order to implement the features sequentially in is especially important to not forget new features in e.g. new levels like the tutorials, enemy placement and others.
Also I am hoping to increase overall implementation speed and reduce tokens spent this way. Tell me if I am totally wrong here first.
I will answer all decisions before implementing anything in Implementation mode.
If I don't answer, take the default answer derived from the above chain or your best effort thinking for my type of web game development.
Wait for my "go" to start implementation, ask to review the decisions first.

- [x] perfect block tutorial needs text explanations to be understandable and a time freeze, before the text bubble appears with a lighbox dim.
 with a tick off after the tutorial is done. show a small tutorials finished/unfinished list somewhere in the top-right corner(fitting on all viewport sizes and not overlapping anything) 
 on the first starter mission/level, so the player knows about features he has not learnt yet, even if he skipped them unintentionally.
 give the repair kit item that Flux can find a very unique MegaMan 2-3 like style model, that differentiates well from energy pills and screw.
 can be a reward from puzzle secret rooms.
 Release Pointer Lock while ads are playing and set it back in after the ads, add to the ads skill if not yet present in the ads skill in the web-game-playbook.
 The first door is locked, but not showing that you need to finish the tutorial first, that trips up most people, so show a blue arrow pointing at the tutorial in the player view and a "Finish the Tutorial first" and a small reddish shake on the door.
 It seems the mobile tutorials (most desktop players also pass by the testing dummy, improve that too) need improvements as not all people understand them, put more emphasis on them this time (maybe with animated finger placement and animated button presses, or automatedly controlled tutorial run with highlighted button presses/holds, before the player can try it out).
 additionally add text bubble helpers to the tutorials if the player doesnt finish a tutorial within 30 seconds.
 On the first charged shot tutorial people don't understand that a normal shot doesn't kill the test dummy, nothing helps them find the charged shot (demonstrate the charged shot first with an animated auto-controlled charged shot on a second target dummy before letting the player finish the tutorial with a own charged shot killing a testing dummy), the same goes for the other tutorials, but especially for the shield tutorial as its mendatory.
 The mobile player is also never thought how to move in 3d with a charged shot( show the player with an animation that you can move with the left joystick and charging while moving the camera around with the right cannon button).
 There is no Slide/dodge tutorial yet, add one wordless with the new animated + automated dry run showing the Space bar pressing down (no player has found the dash yet, hard to kill a boss that way), add the tutorial in a new room right before the boss room, before the heal tutorial.
 Maybe a small goldish/yellowish glow vinette would help to tell the player he is in a tutorial room with a black label at a free viewport edge saying e.g. "Shield Tutorial" or "Charged Shot Tutorial" etc. that disappears upon leaving the tutorial area.
 Whenever Flux enters a tutorial room, Atlas flies into view with a message in a goldishly bordered and slightly glowing speech bubble(different from normal messages) saying "Let's train the Charge Shot" or "Let's train the perfect block" or "Let's train the Slide/Dodge" or "Let's train the Heal Gel usage" etc. and then Atlas flies out of view again, so the player knows he is in a tutorial room.
 Is there no button to open the boss gate door? I watched a player struggle to open it, additionally add the shoot and guard button as door opening triggers.
 The yellow chevrons that lead to the objective seems to be overlooked by most players, lets add a significantly stronger glow and pulse for a 3 seconds duration (20 seconds loop, only pulse when the chevrons are in the viewport, no need to pulse beyond mission 2).
 if the player is not able to block mortar shots with the shield, add it.
 Add the learnings from the new tutorial lessons design to a user level skill called fpv-tutorial, as it is for FirstPersonView games showing how to implement best-practice
 wordless tutorials that are easily understood by show and train, don't tell.
 Additionally, the best way to peak and show what Flux is able to do is to show it in action in the intro cutscene. 
 Extend the intro cutscene by the showing a charged shot, a perfect block(knocking out a rotor drone, block shield shown of against ranged shooters to protect from projectiles) and the slide/dodge mechanic and the heal gel usage (2seconds is enough or can be shown after the perfect block), so the player is clear there is a charged shot etc. each of this show offs add another 3-4 seconds to the intro and come early after or during the shield droid fight.
 The shoot button needs to be further lefts, so there is space to move the camera around, right now there is no space to the right and the mobile player slides of the phone edge, rearrange mobile buttons due to this shift and make the shoot button a bit bigger and show a better recognizable icon indicating it being the primary weapon.
 None of the players found the settingsMenu with the controls shortcut explanations. Start the game with the modal containing the controls explanations on mobile.
 Fan out subagents.
 For some reason everybody walks past the test dummy in the first starter room for some ready, so lets change it to a rotor drone that is not firing and is blueish, Flux's autoaim activate on that rotor drone, also dont show the door in the first level, but instead open it like the secret door after the successful charge shot at the dummy target.
 The bug with the right click opening new tabs or navigating the window history is super annoying and needs to be fixed somehow.
 Also add and alternative button with the mouse wheel click to activate block.

- [x] The second mission still shows the special weapon tutorials (showing "1" button key, when there are no enemies nearby to shoot at, this must be a bugged tutorial after the level layouts has changed for the 2nd mission, update the tutorials position).
 The current mission 2 level spawns Flux into a room with 2 enemies around him, with no breathing room and no time to 
 react and prepare for a fight. Better build another beam in room that lead through a door to the current starting room in the 
 Blaze Master level. The guarddroid is not taking damage from the flame traps in the Blaze Master mission level from the fire traps and flame pillars.
 Atlas's speech bubble currently disappears too fast, double the time for non-voice-overed speech bubbles for all characters.
 In the Blaze Master level(but applies to all levels) if Flux falls down into a platform pit, there is a sound effect and he spawns back on top, which is fine, but there should be some kind of visual feedback why that hurt, e.g. put dangerous spikes at the bottom of the pits/valley that currently count as 
 "death/fall", 
 Flux impacts on the spikes and some sparks are emitted from his body (2s animation), while camera 
 turns on Atlas who comes to the rescue and Flux grabs onto Atlas, who pulls him back up on to the closes platform that belongs to a valid level path.
 Improve the Flame pillar cone effect quality emitted from the wall traps and traps in Blaze Masters level and everywhere else. 
 The spikes make no sense in areas where Flux falls of the levels like in the starting room of Gale Masters level, where Atlas just instantly rescues Flux with the camera showing a cutscene on Flux and Atlas until Flux is save on the ground again.
 The game could be balanced around the player who clicks the 3x screws rewarded ad every round, plays comfortably with all screws spent directly, the difficulty stays equal if the play clicks every second 3x screws ad or resorts to supply missions instead.

- [x] On platform levels the Guarddroid can be stunlocked (stunlock forever is not fun on any character, feels like a cheat to the player) by shooting at him from a distance with a charged shot(not fun to play and watch),
 let's make everyone have a fallback ranged attack (not stunlockable forever) in case other attacks would not reach Flux or the robot or android or machine is on the edge of a platform and sees no way to the player android.
 if Flux is close to an edge and moves towards an edge or beyond he should first slide till the edge and then jump forward instead of sliding down, which should make platforming a lot more fun to the player and more actionable.
 The starting spaceship flying up does not look right, its tilted instead of facing up and is missing a flame thrust cone and the after effect trail is too solid and too long, which makes it look bad, fix it to make it look realistic(while keeping it very low performance impact, dont show the trail on low-end devices at all).
 The new Weapon: Flame Wave label on the result screen of a mission is too boring, lets add a colored icon that shows what type of weapon is gained, so the player is actually intrigued to see what kind of weapon he got, instead of just reading the text. The icon should be a small colored icon that shows the type of weapon gained, e.g. a flame icon for Flame Wave, a snowflake for Ice Beam, etc.
 Improve the vfx quality of all special weapons, add a small room for a lesson on the newly gained weapon to the next mission(Flame weapon gained is explained on the next mission in the Frost Master level, right in the first beam down level, where no enemies are and the gate only opens after the tutorial lesson, getting close to the closed door shows "Finish the lesson on XXXXXX" with an blue arrow pointing at the lesson location. Make resources needed for the lesson respawn, enemies spawned for a lesson should only spawn after the player started moving in the beam down level.).
 
- [x] the supply drop rewarded add button needs to have a better readable MovieIcon and the screw reward should adjusted to the players progress, one reward should be around half of a mission or supply run income, otherwise this rewarded ad will become unattractive over time.
 Add a 10% kill-cam, that shows how the enemies android/machine crumbles into pieces and falls to the ground (max 3 seconds for the kill-cam cutscene), while the camera is over Fluxes shoulder showing the Flux model and the killed target (prevent camera clipping into walls with springsarms) (the game is frozen for this moment, meaning: Vfx play, 
 but no character/android/enemy/Flux moves or takes damage or falls or anything, the player can just watch the kill-cam cutscene). 
 The kill-cam should be triggered by a random chance of 10% on every enemy killed, but not on bosses or mini-bosses. The kill-cam should be skippable
 by pressing any button or key 2 times (show a skip button where the shoot and guard button would be during normal play), and should not be triggered if the player is in a hurry, e.g. sliding or jumping or near a trap or hurtful obstacle or has already seen this enemy type getting killed once in the current active mission. 
 The kill-cam should also have a small icon in the top-right corner that shows how many times the player has seen it in the current mission, so they can decide to skip it if they want to.
 I think there should be better feedback on walking on a volt trap, like a short cutscene showing Flux shaking and lightning bolts flowing around his body(like a kill-cam, the surrounding is not moving/progressing/falling etc until the camera is back to FirstPerson Mode at Flux's vision).
 running into other traps like flame traps, spikes, falling platforms, etc. should 
 also have a short cutscene showing the effect on Flux and the surrounding environment, like sparks flying, flames burning, platforms falling, Flux freezing etc. This will give the player a 
 better sense of the danger and make the game more immersive. 
 There are no barrels, crates or crate golems in the new platforming levels, which is unfortunate, 
 add room for that features too here and there, not too excessively.
 Some machines from the first level are not reused at all in the platforming levels of mission 2-5 like the wheel dude or the guarding bot or the hard hat. 
 
 
- [x] the upgrades are not well balanced right now, I picked up a purple blaster and upgraded it to level 6 in one go, now I do 357 damage with one charged shot, which is 6x my previous damage, but I also installed some chips I dont remember,
  this is not fun long term. Upgrade should be feelable progress, but not making the player op instantly, maybe I just got lucky, so instead lets add an dynamic adaptive boss difficulty that adjust the bosses hp if the player gets too op early, a good refrence fight is the Flame Master without any upgrades or chips and standard gear on Flux.
  Also enemies hp should scale slowly with mission progress, so the upgrades will be needed to compensate the difficulty increase.
  If a player falls back on relative damage power, Pip should tell him in the lab with a short text and a tutorial lesson how to upgrade his gear and weapon.
  if the player has no screws left to do the upgrades, off a rewarded ad to get screws as a reward( enough to pay for 2 weapon upgrades on the best weapon he has).
  A chest has no collision after it was opened, that's unimmersive. Flux can shoot through the chest, but any shot should collide with the chest geometry consuming the shot visual and damage.
  Flux can shoot through the platform that drives him in the Volt Master level, which is unimmersive and should be fixed.
  The freeze special weapon should not stun-lock(or stun at all as its just elemental) the enemy, but only slow down his attack charge up and movement by 30% (not effecting jump speed and length).
  using the beam up cutscene in a corridor can produce potential wall and camera clipping, close the boss room door after the player entered the room and dont let him out after the boss was killed, so Flux can only exit the level in the boss room.
  
- [x] there should be a wordless lesson on jumping over gaps and pitfalls, so the 
 player can learn to jump over gaps and pitfalls without having to read a text or 
 listen to a voice-over. The lesson should be in the first mission/level, 
 where the player has to jump over a gap to reach the next platform ( and again on Gale Masters level). 
 The lesson should be triggered by the player approaching the gap, and should show a visual cue (e.g. a glowing arrow) indicating where to jump. 
 The lesson should also show a visual cue (e.g. a glowing arrow) indicating where to 
 land after the jump. The lesson should be skippable by pressing any button or key 2 times (show a skip button where the shoot and guard button would 
 be during normal play).

- [x] The wind is coming out of nowhere in the Gale Masters level, add a wind turbine prop rotating while the wind is coming and stoping when no wind is visible.
  The Rotor drone can clip into level geometry when moving back(seen on Gale Masters level).
  On Gale Masters level, there is a secret room puzzle with non-readable puzzle hint, also the blue button is hovered by a pipe in the wall, check all puzzles if they are correct and solvable and not obstructed, save this as a rule for future puzzle builds and locations.
  Improve the boss door face over the boss door to look more like the vex face we have in the intro cutscene.

- [x] The shoot button (is it the tutorial lessons icon or is this intended) is shown to me even on the Gale Masters mission.
  Check why it's still show and at what point it best should stop to show.


- [x] All boss rooms look the same right now, add 1-3 random barrels or normal crate to each boss room to allow finding energy pills and very rarely a recovery gel( ~5% chance to drop from boss barrels and crates, never more than one recovery gel per boss room dropped), also 
  build in (1 or 2 pillars / a platform with a ladder or staircase to get to a higher position (this should not be glitchable to protect from incoming damage forever, if the bosses attack hit an obstacle 2 times in a row, even though it should have hit the player on the trajectory, the boss enrages with fuming smoke and a slightly red head and start op ranged attacks from the sky until the player is targetable with normal attacks again. Prevent other edge cases resulting of this and handle them after consultation in chat))
  What would be other not-AI-breaking additions to make each boss room unique and interesting to walk through? Make 5 suggestions and write a structured report that I can look at in the browser with example images that you can sketch with gemini or with quick and dirty 3d scenes built and screenshotted.
  The end bosses Vex level layout must be outstandingly fun and exciting and unique as it's the peak of the game. Make 3 unique suggestions for it too (taking all the edge cases into account like preventing AI exploits etc.).
  The Gale Master boss room could have wind tunnels moving only the player from time to time(less often then in the normal level).
  Freeze Master should have some freeze traps/pillar(not affecting the boss) and some ground sliding ice tiles like in the level.
  Flame Master could have some fire pillars and traps in the boss room, but not affecting the boss, but only the player, no hit cutscenes on Flux during the boss fight.

- [x] I will build an audacity voice-over file modulation and sound leveling skill and package json script that executes it with Audacity remote control. Prepare each voice modulations and Audacity Effects that the skill or I need to execute in succession on each vo, so it fits in the sound design of the story, the other background music and sounds and the voice egos of each characters. Write the modulations and step-by-step instructions into the story-voice-over.md  below each of the character descriptions there.

- [x] Extend the game with 5 more levels in the same pattern as the current Masters (also reuse the machines and robots while introducing potentially new machines with new mechanics and fight AI for diversity and changing challenges), adjust the story files accordingly with the new 5 Masters and their special weapon arts.
  One level could be about using the Quadrocopter drone from the exit cutscene(maybe like the lore ride or something else or both).
  Build the new levels with new platforming aspect while reusing some of the existing platforming features and designs here and there, but every level should bring something new and fresh to the players experience.
  Take inspiration from MegaMan 2-7 levels, do a web-search on MegaMan level designs and transfer that knowledge for the new mission levels.
  Maybe build one level where the player has to use wall jumps to climb up to a secret room (needs a specific lesson until the player climbed out, could be tricky with the FPV camera, but you could make it fluently), this mechanic might be too hard for most players, so lets reward the curious ones with a temporary specials weapon a full heal capsule and a recovery gel.
  
- [x] Do a full rebalancing pass of all machines and robots and bosses and Flux compared to average player progression over the story mission(assuming none do supply runs and use the 3x screws button every 3rd mission and Flux only upgrading some weapons here and there but not always spending all his screws for gear and chip upgrades, but always using his after mission upgrades).    

- [x] 'Vex Fortress' should be a special level (3-4 times as big as climb towers map and game duration) map with ranged robots on the fortress walls, the whole map is looking like Flux is entering a futuristing castle/fortress and there are not only the usual rooms with puzzles and secret rooms and enemies, but also 2 mini-bossos waiting, that need to be beaten, after that there is a passage platforming and another puzzle with secret rooms before the player can enter the final boss vex. Vex fortress also introduces another android or machine type not seen before with a unique weakpoint. Here there are also new platforming obstacles and platforming challenges to master, before reaching the first mini-boss. This level checkpoints for revival in case Flux dies at one of the mini-bosses or at the final boss Vex.

- [x] let's do another round of optimizing hot-path loading during start up, postponing non-critical assets to lazy loading after all critical assets were loaded for the current scene based on player progress and level position.  
  That should make the game startup faster and happier players (should not create asset pop-ins)

- [x] #100 Lets add an extended charge shot, after the charge shot is fully loaded, another 3 seconds of charge will make it an overloaded charge shot with an even cooler and more epic
 Bullet design and charge hold animation, this new overload charge does 1.75x more damage than the normal charge shot.
 The overload charge shot becomes available after beating Gale Master, The player will be notified by Pip in the Lab that the overloaded charge shot is now available and needs to be unlocked with a special chip modification that is highlighted in an epic violet color(like the color of epic equipment) and a small pulse.
 Pip opens the page for you to see the new upgrade costing (balance the upgrade appropriately)
  Done (Phase 2): the Overcharge node re-timed to full charge + 3 s at 7x (1.75x a full charge), gold-white comet in epic violet; unlocked by the Gale Guard, bought once for 2300 bolts as a violet mod in Circuits; Pip announces it and opens the page.

- [x] #101 Lets add an epic Transformer like battle like in Power Rangers, where the 10 Masters merge together and transform into a huge Transformer Robot that Flux has to fight right after Vex has been defeated(A checkpoint lets him restart from after Vex defeat to keep frustration low even on repeated death).
 This fight against the "Grand Master Bot" is especially epic as the Grand Master Bot can use all Special Weapon shots and is kind of a random action game.
 Flux has to hit weak spots highlighted by Atlas on the Grand Master Bot to slowly disessable the Grand Master Bot and first shoot of his robot arms, then his feet, then his head and finally the body.
 A cutscene is played after Vex has been defeated: (wait for the boss defeated label to disappear)
 The Grand Master Bot is Vex's final effort to beat Flux after Vex has been beaten and falls to the ground, he pull out a device with one big red button and presses the button in the cutscene, which causes a small earthquake and some rumbling in the distance 
 and some mechanical robot sounds, after ~5 seconds the Grand Master Bot is introduced who drops in from the sky with the iconic assembling from all the Master bodies like a Power Rangers Transformer robot.
 Give the Grand Master Bot a unique attack pattern and Special attack which only he does.
 This is the final challenge and can be a bit harder as this is the end of the game.
  Done (Phase 7): the red button, the rumble, the ten Masters assembling on the roof (skippable); arms, feet, head, core with Atlas marking the weak spot; its own Prism Cannon; ~106 s for the reference player; retry point at the fight's start.
 
- [x] #102 After defeating Vex and the Grand Master Bot, cybercity is saved and Vex's plan destroyed.
 Run an epic and ~2 minute long outro cutscene showing the implications for the new freed city the gauss revival scene and the
 remaining story-arc scenes that were planned. I think it makes sense to end the outro on the city skyline showing a button "Start Next Game +",
 which will let the player replay the whole story and mission on a ~25% harder challenge (mostly 25% more hp and the bosses have ~15% faster reaction times beetween attacks and try to catch the player off guard more often).
  Done (Phase 8): "First Free Morning", ~100 s, skippable: the relays freed, Gauss waking, sunrise, credits with the Masters' portraits, end card with Start New Game+ (confirmed) or Back to the Lab; Gauss stays awake in the Lab. New Game+ = +25 % health, bosses ~15 % quicker.

- [x] #103 I would like to improve the mission selection screen(the actual story progression) to something more like in the MegaMan 2 till X games, where They had a screen
 with all the Android portraits to choose the next level/mission, make a web-search please to understand what I mean.
 keep the linear story progress, but show the Masters Portrait on the mission card please along with the mission name and colored card border fitting the Masters powers.
  Done (Phase 5): portrait tiles in each Master's colour (beaten / next / locked), the story card in the Master's colour, a boss splash during the mission load; the story stays linear.
 

- [x] #104 Master colours: some of the new Masters' colours in the story docs clash with the colours that were freed up when the roster grew to 10 Masters.
 Every Master needs one distinct signature colour that is the same everywhere (stage theme, boss tint, weapon, icon, card border, docs), and no two Masters should be easy to confuse.

- [x] #105 New Game+ has no level room left above 40 (the Vex Fortress band ends at 40).
 Decide how a New Game+ run scales (see #102: ~25% more HP, bosses ~15% faster) without needing new levels above 40, and make sure nothing breaks if a player goes past level 40.

- [x] #106 The new boss weakness ring mostly pays off on rematches, because the story order is linear and Flux rarely owns the weapon a Master is weak to on the first fight.
 Make the weakness matter on the first playthrough too.

- [x] #107 Crumbling slabs in the old stages (Blaze, Frost, Volt, Gale and the Tower): 1–2 spots each, deferred from the stage retrofit.

- [x] #108 The Scrapper's magnet crane: a crane over the Scrapper boss arena that picks up and drops breakable crates (energy pills inside; a hazard where they land), deferred from the boss-room ideas.
  Done (Phase 4.1): works in the Scrapper's second half only (first fight unchanged); a crate every 8 s on a ring near Flux, 6 % of the Scrapper's health if it lands on him, soft cover with an energy pill.

- [x] #109 Core Descent for Vex: the roof fight in lightning, then a fall into the reactor hall that cycles the Master hazards, then a small ring around the Core. The fortress currently has a single arena.
  Done (Phase 6): roof in lightning, reactor hall at 65 %, Core ring at 30 %, a fall scene between them and a retry point at each.

- [x] #110 Neon's blackout pulses: the Blackout Boulevard should go dark in timed pulses (lights and light bridges off), so the player has to time the crossings.
  Done (Phase 4.2): 9 s cycle (1 s warning, 2 s dark), max 3 flashes a second; the Blink Run's bridges go out with the dark; the boss arena keeps its lights.

- [x] #111 Drill's mine cart: a mine cart ride section in the Deep Mine.
  Done (Phase 4.3): an optional ~15 s ore-cart ride from the Chasm over a trestle, a steep drop and across the Mole Warren (the stage had no room for a longer one).

- [x] #112 IOS playtime is significantly lower than the Androids playtime, Android 28min vs 5 min on IOS, or another day: Android 16min, IOS 1 min. Is there maybe some issue with layout or buttons not working on ios?
  Done (Phase 1): recovery from a lost WebGL context, audio unlock that survives calls and ads, iPad = mobile layout, checklist taps fixed, a lighter iOS default (unmeasured: revert with ?perf=ios-legacy if it isn't needed).

- [x] #113 cleanup old unit tests that belong to the /world and /characters and /water routes and have no usage anymore, both end2end and unit tests, that should
  drastically lower the time for test runs. Also check every unit test and e2e test for its validity and use for the current project and remove if its absolutely unrelated.
  Done (Phase 0): no /world, /characters or /water routes in this repo (they are in 3d-world and runic-journey); one dead test removed, old-game fixtures renamed, tests run without jsdom where possible: ~43 s -> ~30 s.

- [x] #114 'F1' for help does nothing when clicked and/or pressed.
  There is an abnormal number of [platform] Get language (Playgama build, but should be fixed on all). Do not call get language more than once after starting the game as it will negatively impact the game's performance.
  Consider refining sound design for a better player experience.
  Done (Phases 1b, 3.1, 10b): F1 / help opens the controls legend everywhere; the platform language is read once; the mix (voice bus, ducking, variation, caps), a low-health heartbeat, button and close sounds.

- [x] #115 Use the new-game-playbook to apply best practices for platform builds and platform fit to this project, especially language selection and progress saving and loading.
  Done (Phase 1b): the portal language is never stored as the player's choice (explicit-choice flag), Options shows the live language, GamePix language used, Yandex cloud load retries and merges by progress. Open: an Arabic RTL check in the Playgama QA Tool.

- [x] #116 add the remaining language locales from the new-web-game-playbook to the game, so the game can be played in all languages that are supported by the new-web-game-playbook.

- [x] #117 Let's start on creating an voice-over pipeline. In general this is a very task to voice over NPCs and the player with manually voiced 
 sound files, especially if you have to pitch and change the sound style of the spoken VO in audacity, which I did for another project. 
 Therefore, I would like to automate it if possible. Elevenlabs offers the best models for this as far as I know but has low rate limits.
 Creating a Gemini-like voice-over pipeline with free accounts of elevenlabs is only the very last possibility for me as it would be quite cumbersome and the paid license is ways to expensive for me now.
 Therefore, let's first do a web-search to find other ways (python based LLMs or Node.js/Npm based LLMs to do voice over in a real fast pipeline).
 The web research should also include if its possible to change the voice pronounciation and tone and speed based on a characters description design,
 so we can have very differently speaking voices for each character according to his age, gender, character attributes etc.. If so, you would need to create the descriptions from our story files.
 The optimal approach would be to have a npm package that can take a character description or file (and Stage direction on how to say the sentence: "shout"/"calm"/"lovely"/etc. + current situation) that helps the voice model 
 to perfectly say the sentence in questions and that needs no further editing after the file was produced.
 compare multiple model and generators and test them in a vo-test-install branch with 3 sample texts (and above mentioned stage directions etc.) before choosing the best fitting that created the best voice output.
 Let me judge on the quality and which is better in a structured browser report.
 In any case the resulting file needs to be saved in .ogg format (quality level 2 in audacity was good enough for me in  the past for a minimal sound file and a minimal footprint on the game bundle), this files then will be compressed again with a audio compressor
 (I judge the quality loss versus the uncompressed version in a structured browser report).
 for this voice over task to work well, we need a package.json script that collects
 all voice-lines in english and german and with their potential stage directions and their character descriptions(or generates some character description cards).
 The package.json script also needs to have a -samples run with 3 samples for each language.
 After the pipeline is fully built and runs, we can create a skill from the learnings to recreate this pipeline in other projects, not only games.
  Done (branch vo-test-install): `pnpm voice:cards / collect / gen / compare / setup`; five engines compared blind (Gemini Flash-Lite 4.5 stars, Gemini Flash and Chatterbox 4.0, VoxCPM2 and Qwen3 3.3); all 358 live lines voiced by Chatterbox (free, local) with the robot chains and automatic QA, shipped as Opus 24k .ogg (3.3 MB); Vex, Flux and Gauss wired into the game with their scenes.
  Also done: Atlas's remaining 69 lines wired and voiced (beam-ins, scans, warnings, hints, the mission board); the ElevenLabs route through its web app (`--engine elevenlabs`, rated 5.0, listening tests only on the free plan); merged into main; the skill `voice-over-pipeline`.
  Later: re-voice with Gemini 3.8 Flash-Lite once billing is on (`pnpm voice:gen --engine gemini-lite --force`, voices already designed); a format old iPhones decode.

- [x] #118 The player now has the current mission boss 2 times on the HUD, once with a question mark and once in the objective/Ziel badge with a clear portrait of the boss, so the mystery boss doesnt make sense.
  Done: the "?" chip is gone; that spot is only the objective locator's cooldown now, and the boss shows once, in the objective card.

- [x] #119 now that we have VOs, we should add cutscenes similar to the Intro, where the cybercity is shown with the level 1 area and the Vexs fortress level 18-26 area, but this time it plays after the player has come back from the last story mission (skippable), the cutscene introduces the next boss enemy with a similar view, but now the next area is e.g. level 4 and the boss e.g. Flame Master is shown in that area as a hologram.
 Pip (probably male voice) then explains the next mission with the new boss and his specialty in the usually short type of sentences that also Atlas uses.
 Pip is wired in to the VOs. This type of Cutscene now plays after each finished story mission and story progress.
 Derive the order and text needed from the story-arc.md and story-voice-over.md files, so the cutscene is consistent with the story and the next mission.
 give a bit of situational context to the next mission (e.g. Flame Master burned something or Frost Master has been freezing Machines in his vaccinity, therefore he must be stopped).
 The Cutscenes are the main story telling in the game, but they should not get excessive, so the player gets bored being stuck in the Cutscene.
  Done: a debrief plays after each story mission's result screen (once per Master and run, so New Game+ plays them again; skippable, a tap moves on a line): the city from above with the freed sectors in their colours, the copied weapon's card, Vex's reaction, then the next sector with its Master as a hologram and its level band. Pip is voiced (a fifth voice, 52 lines, EN + DE; subtitles in all 39 languages): what the win changed, the weapon, where next, what that Master has done there, how to beat it. About 25 s.
 Also show the new special weapon gained from the last boss in the cutscene, so the player knows what he has gained and can use it in the next mission.
 Leave enough time for the player to read the voice line of Pip and Atlas, just like in the Intro, also make the city hologram scenematic, so its a joy to watch then, not just still images/viewpoints.
 Make each Cutscene a breathing experience.
 Do the first Cutscene about the Flame Master and only after I approved the quality, you can do the remaining Cutscenes after each mission.

- [x] #120 The game needs better ULTRA-HIGH-CTR(20%+) cover images painted with 
  Gemini for all the platforms (800x800, 1920x1080, 1080x1920(only jpg), 800x1200(only webp), 1360x850(only with logo, only jpg), 800x450(only with logo, only webp), 400x225(only with logo, only jpg), 
  512x512(only with logo, only jpg), 628x628(only with logo, only jpg), 512x384(only with logo, only jpg), 512x340(only with logo, only jpg) in jpg, and webp, once without a logo, once with a logo somewhere that is not in the top left corner as CG banners are placed in top left corner up to the middle of the image horizontally).
  Create 4 different new cover image scenarios (like the current non-painted ones), paint them once in Gemini and compare them with the old cover images(not painted) for the CTR value. Go with the best results that would potentially and based on web-search evidence yield the best CTR results on web game platforms and Steam.
  Done: four new scenarios painted and compared blind at tile size with the old covers (scores out of 100: neon "the face" 79, blaze 78, vex 72, the first painted cover 67, frost 63, the old unpainted renders 54 and 47); neon ships in all eleven sizes, jpg and webp, with and without the logo (logo never top-left). The record and which file goes to which portal: store-art/cover-comparison.md. Note: no source supports 20 % CTR for a grid tile (stated levels are low single digits); a live A/B test (Poki takes three thumbnails; blaze is the second candidate) is the real judge.

- [x] #121 the charge tutorial should activate as soon as the player gets 1 step closer to the shoot dummy rotor drones. The next room is not rendered right now until the charge tutorial is done, but that looks weird, I actually intended that the first room with the charged tutorial is completely isolated and upon
 tutorial completion, a secret door to the next room opens up, so the player does not see the entrance to the next room before finishing the tutorial.
  Done: the lesson starts with the first step toward the drones (or a shot at one); the start room is closed all round, and the wall in front of the way on sinks when the lesson is done.
 The repair gel hint from Atlas come late. Also I noticed that the automatic repair gel consumed the only charge and I could not do it myself pressing H, so the Atlas says "Now lets train repair gel", but Flux is fully healed and has no charges left to train it.
  Done too: the lesson's demo no longer spends the gel (Flux is hurt again when it ends, with his gel, for his own try); the lesson's line comes at once (no health warnings ahead of it in the tutorial).

- [x] #122 Atlas speaks too much, its not neccessary to state all obvious hints, especially not 3 hints back to back, it feels like a handholding then, only warn the player with hints on dangerous things like traps or weak points of bosses. Occasionally drop the other machine hints, but only once per gameplay, not on repeat whenever meeting a enemy.
  try to space out hints queuing up. The level up hint is also a bit overused, maybe just say and print it every 2nd level up.
  In general the hints should be lower frequency to not annoy the player with constant chatting and focus on the important hints and warnings.
 Chest golem hint for example is very important as he is not obvious to kill, but the "jump down the platforms" is obvious for the player if he has nowhere else to go.
  Done: warnings (health, traps, bosses and weak points, stage dangers, lessons) come at once; scans, the relay count, level-ups and tips wait for 12 s of quiet, one at a time, and are said once per save; 13 plain-to-see stage hints are never said; one line on the way in; a level-up line every 2nd level; the crate golem's scan stays prompt.
 
- [x] #123 the first puzzle in the Flame Masters level is not solvable, as it shows yellow and there is no yellow in the room. Check all puzzles for solvability.
  Done: the hint panel showed all four colours (the yellow lamp too, in a room with no yellow button) and stood half behind a wall post; it shows only the room's colours now, the asked one lit, and hangs in the middle of its wall. All puzzles checked across seeds: one Volt Tower story seed started already solved, fixed; the audit test now pins solvability. 