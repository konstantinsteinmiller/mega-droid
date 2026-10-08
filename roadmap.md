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

- [x] Holograms on repeat to show the tutorial action to perform. On slide tutorial, pause the game mid jump of the enemy and only continue when the player has pressed Space.
  gap tutorial also only hologram. Show that Flux jump automatically. 
  Hologram tutorial in the first room too for the charged shot, remove the text boxes due to the new holograms.
  Done: every lesson room has a see-through Flux doing the move on a loop (charge shot at a drone, the shield against a Trooper's shot, the slide out from under a Stomper, the walk off the ledge that leaps the gap by itself, the Repair Gel), the key or button lit over its head in step; the cards and the one-time demo are gone. In the slide lesson the Stomper's leap freezes overhead until the slide is pressed (the slide button bounces, three yellow arrows at it).
- [x] holograms of the participating characters dont disappear until Flux exited the room. 
  Done: a room's hologram stays up, even once the lesson is learned, and fades when Flux walks out.
- [x] the guard from the Perfect shield block tutorial needs to stay in the room and not move at all and not go out, the door needs to close behind flux in the tutorial areas, so there is only one way forward. One player had a bug where he used the charge shot on the box in the first room, but had to go back to the beam down room to open the next door, this is a bug.
  Done: the Shield Trooper keeps its spot (it turns and fights, never walks or gets pushed); every tutorial door slides shut behind Flux once he is in the next room.
- [x] change order in the intro, first show the dr gauss scene with the reviving of FLux and after that, when the player was sent out, 
  Done: the intro now runs in story order: the valley and Vex's signal, the lab where Gauss revives Flux, safe mode, the wake-up with Pip and Atlas, the beam out — and only then the street. The flash-forward and the tape rewind are gone; the music is re-cut to the new order.
- [x] show the action scene with the show off of the charged shot and the perfect block after all of the gauss and pip scenes. better syncronize Fluxs shots and charged shots with the bullets going off on the enemy, improve the slide animation in the Intro by a lot, currently it looks like lego (should look like a MegaMan X dash).
  Done: the street plays last, opening on Atlas's "Log start.". The charged shot flies at one speed and hits as it arrives (its last metre used to crawl), Flux turns and raises the cannon at the second drone, and both slides are a Mega Man X dash: a crouch, a low lean with the back leg trailing, a stretch, a cyan afterimage, dust where it starts and stops, a settle with a bounce.
- [x] chest are openable with shots or charged shots or any other hit by Flux.
  Done: any shot opens a shut chest (a pellet, a charged shot, a copied weapon's blast); E and tapping still work.
- [x] Missing german VOs Atlas.
  Done: re-voiced with ElevenLabs (337 of 339 lines in English, 336 in German; the 5 left show their bubble until a retry); the 23 Atlas lines that were never on the voice list (lesson intros and nudges, eleven stage hints) are voiced in both languages.
- [x] The tutorial in Flame Master needs a hologram showing the player how to use the Flame Wave weapon, and the lesson should be in the first beam down level of the Frost Master level, where no enemies are and the gate only opens after the tutorial lesson, getting close to the closed door shows "Finish the lesson on Flame Wave" with a blue arrow pointing at the lesson location. Make resources needed for the lesson respawn, enemies spawned for a lesson should only spawn after the player started moving in the beam down level.
  Done: the weapon is now taught right after the boss that gave it (see below); the next stage's first room teaches it only for a player who beamed out before learning it, and then with a hologram doing the shot, the door naming the lesson, drones and energy that come back, and drones that wait for his first step.
- [x] Boss health bar needs to go horizontally below the navigation track, like most rpgs do it
  Done: the boss's bar hangs horizontally right under the compass, its name over the left end (the Grand Master's part marks stay); in portrait it follows the compass under the top row, on a short landscape screen it hangs just under the objective card, which no longer steps aside for it.
- [x] Enemies should always fire back if they see the player in the whole room.
  Done: a machine that sees Flux anywhere in its own room notices him and may shoot from there (Hardhat, Trooper, polar drone, Warden, turret, crate golem); outside its room its own range still rules.
- [x] After each boss room in addition to B to beam out, the player can walk into the next post boss room to beam out automatically when Flux enters the room.
  Done: every Master's stage and the tutorial have a room behind the arena; its pedestal lights once the weapon lesson there is done, and walking onto it calls the quadcopter, as B does.
- [x] Lava model needs to improve, the falling platform needs to rattle before it falls down.
  Done: lava has a moving surface (a slow flow of crust and white-hot veins, its glow breathing) with embers rising off it near Flux; a crumbling slab rattles as Flux comes near and shakes a full second (was 0.6 s) before it drops.
- [x] barrels hitting Flux need to flatten him cartoonishly for 1 seconds instead of the shaking and shock state.
  Done: a rolling barrel flattens him for 1 s: the view slaps down to the floor and springs back up with a boing, no moving meanwhile, no shake; the first time, the trap camera shows him squashed flat with stars circling.
- [x] The crate golem shot over Flux and didnt hit, also he takes quite a while to attack where Flux can dish out damage for free and thats unsatisfying, make his more dangerous, not only dodging, from melee he should have a charge dash forward attack that Flux needs to dodge or block for reduced damage.
  Done: its rock lands (fixed earlier), it attacks more often (cooldown 1.6 s, was 2.3), and up close it rams: a red line on the floor for half a second, then a dash down it. A block takes it at a quarter, a slide dodges it, a perfect block stuns it.
- [x] Atlas still not shown how he lifts Flux out of the spike and lava, this is really unimmersive as right now Flux just levitates up.
  Done: in a rescue the camera looks up from the pit: Atlas, drawn big, comes down over Flux, catches him in a cyan tractor beam and carries him up to the footing.
- [x] Doors should open automatically when the player approaches it closely especially boss doors(not secret doors).
  Done: plain doors already did; the boss shutter now opens by itself within 4 m before the fight. Lesson-held doors and secret walls stay as they are.
- [x] During play testing most of german VOs didnt run, fix it all and also for english, go through all text lines that have VO names or are missing VO lines and do it right.
  Done: the cause was lines that were never on the voice list, not loading. Now every text line in a speaker's section is a voice line by itself, voice-todo.md lists every line's state (a test keeps it current), Flux's fumble lines are voiced and wired; the voice-over skill carries the pattern.
- [x] The player should not be beamed into a room with enemies in Flame Masters level, add another room before the special weapon tutorial where the beam in level is.
  Done: every stage lands Flux in a beam-in room of his own, no machine in it and its door shut until he walks up (a test checks every stage); the lesson drones no longer come there unless a weapon is still owed.
- [x] The Player needs to learn the new weapon copied from a beaten boss directly, move the special weapon lesson from the beginning of the next game to right after the boss room cleared and the player is lead to the open door now where the special weapon less is taught with holograms and non-attacking blue rotary drones or other fitting non-attacking enemies, once the special weapon tutorial is done
 The deactivated beam down pedestal activates and the player can beam out with the quadcopter drone either by pressing B or walking onto the activated beam pedestal(same as at the start of the level, on which Flux lands.)
 After the boss fight the player acquires the special weapon of the beaten boss, so show that, the player is shown the weapon arm with the new weapon design(e.g. red flame weapon arm that Flux has when he equips the weapon of the Flame Master) in front of him as a hologram for 5 seconds, then it disappears of if beamed out immediately disappears, the special weapon is then immediately equipped for the special weapon lesson.
  Done: when a Master falls its weapon is Flux's at once and equipped; his arm in the new weapon's colours turns on a light ring in front of him for 5 s (a beam-out clears it); the door behind the arena opens onto a quiet room with a hologram doing the shot and blue drones that never fire; once it is learned the pedestal lights. Flame Wave drones hover low enough to hit now (at a drone's usual height the wave rolled under them and the lesson could never be finished).
- [x] The debriefing cutscenes need to show all cleared bosses areas as blue (cleared) amd the new target area in a reddish color to see that this is still Vex controlled.
  Done: in the debrief every freed sector glows blue, the next target pulses red through the whole film, the rest stay a dim red.
- [x] Test the whole tutorial level thoroughly, check if all the tutorial lessons make sense with a headed chrome mcp player that is controlled through the game level.
  Done: a visible Chrome (its own profile) played the tutorial room by room through the real controls: charge shot, crate, block, gap, chest, slide, the three fighting rooms, the gel; every lesson passed by play, no page errors. What it found is fixed: holograms stood on top of the real targets (now off to one side, playing away from the player), the slide freeze looked at a wall (now up at the Stomper), the charge ball floated beside the hologram's arm (now on its muzzle).
- [x] Also add more room between the fire trap for the repair gel tutorial and the door to the Boss, right now it can happen that the tutorial triggers too late, while player is walking into the boss door and tries to open it.
  Done: the trap sits in a long corridor with a whole breather room between it and the boss door, and the boss door waits until the gel lesson is done.
- [x] the first level has been shrunk down due to the tutorial rooms and the full guided room arrangement. Add 2 rotary drones for enemy targeting training in one small room, 1 running wheel and a guard robot in the next room after and 1 crate golem in the next small room, after that comes the fire trap for the repair gel tutorial.
  Done: after the slide room: two rotor drones, then a running wheel with a Shield Trooper, then a crate golem, then the gel corridor.
- [x] the tutorial requirements should always have a big fancy yellow arrow over their 3d model to indicate this is the target, especially the crate in the second room that has to be destroyed with a charged shot.
  Done: a big bobbing, turning yellow arrow hangs over each lesson's target (the training drone, the crate, the Trooper, the Stomper, a weapon lesson's drones) until its lesson is done.
- [x] One player pointed out that it is not clear why the player cannot directly equip an item he just upgraded in the garage/forge, so add the equip button below the upgrade button on each item. Also, the salvage button has no safety modal asking if the player really wants to salvage and non returnably destroy this item.
  Done: the Workshop shows an Equip button under Upgrade for any item not worn ("Equipped" for one that is); Salvage asks first — "Salvage this item? … will be destroyed for good. This can't be undone.", in all 39 languages — and only the red button goes through (Esc or a tap beside it cancels).
- [x] In the tutorial level, there is a constant mouse press helper mouse on desktop that is annoying after the charge tutorial as it simply interferes with other tutorials and gives wrong directions and is a bug
  Done: it was the shoot glyph: charged shots never counted toward it, so it stayed after the charge lesson and was called back in the shield and slide lessons whenever Flux had not fired for 7 s, pointing at the wrong button. The charge lesson now retires the shoot and charge glyphs, and while a lesson's hologram shows its own input the coach keeps to moving, looking and the move being taught.
- [x] #105 The guard bot in the Intro is holding his shield weirdly while Flux shoots at him, maybe he should lower the shield and die after the charged shot by falling into multiple block pieces in the green color that he has. All enemies, machines and bosses fall into blocks of their 3d model like broken spare parts and disappear from the level after 10 seconds lying on the ground by sinking into the ground within 2 seconds. The player robot should also sink into the ground after 10 seconds of being dead, so that the player can respawn and continue playing without having to restart the level.
  Done: in the intro the charged shot breaks the Shield Trooper's guard (the shield comes down to its side; the old pose held it like an umbrella), and the point-blank finish, now a full charge, takes it apart into green pieces. In the game every machine and boss falls apart into the parts of its own model (a piece per limb, in its own colours) plus blocks of its plating; they lie 10 s, sink into the floor over 2 s and are gone (at most 160 at once). Flux, down and left alone: the defeat screen counts down ("Back at the checkpoint in 6 s", held while an ad plays); at zero his body sinks into the floor, seen from outside, and he comes back at the last checkpoint at full health — inside the arena's door in a boss fight, the boss keeping its damage — without restarting the level. Gel, the ad reboot and retreat stay as they were.
- [x] #106 In the intros action scene where Flux kills all 3 robots, I dont see a bullet
  coming off from Flux's blasters hand, this is very unimmersive.
  Done: Done: each shot leaves the cannon's muzzle (it started inside the forearm, and a step behind him at the finish), with a muzzle flash and a plasma tracer.
- [x] #107 "Lass uns den Ladeschuss trainieren" is still not VOed in german, please fix it, you said you VOed and wired everything, obviously you did a measly job, this time go over all possible character text line and make sure all is wired up correctly and VOed in both languages except the grunts in just english.
  Done: the file existed; lines said at once (lesson intros, scene beats) played before their recording loaded. Now they wait for it, and the at-once lines load ahead. Audit: all 341 lines have a code path. Still unrecorded (QA rejects every take): DE atlas.story.rotor (heard "Roter Pflüg"), DE atlas.scan.elite and EN pip.debrief.magnet.next (too slow).
- [x] #108 I entered the second room in the tutorial lesson and it's about teaching the        
  player the shield, but the screen show also the shoot button click, why? this     
  makes no sense [Image #1], both the shield hold mouse icon is shown and the       
  attack mouse button. This shield tutorial also has no hologram as asked.
  the third rooms perfect block tutorial hologram does     
  not show the bullet bouncing off and hitting and hurting the guard droid, the     
  hologram guard droid should show the hit animation by flinging visibly due to the  
  damage received. After shooting the chest with my blaster in the chest tutorial (hologram visuals are missing how to shoot a chest to open it), the mouse left button click is still shown on the screen indicating I still have to shoot something even though there are no threats and no closed chests nearby anymore, remove that helper after the chest was opened.
  I asked you to freeze the game when the slide/dodge tutorial enemy jumps and is mid-air, so the player is forced to dodge once and use Spacebar/mobile slide button (the hologram does it right, but should show the same dodge animation as in the intro action scene).
  I got damaged during the slide tutorial and got to the red zone and the healing button shows on screen, I was not sure if that is intended to happen in this room, but I also could not leave the room even though all enemies were dead in the slide tutorial room, so I used the Heal button "H"(I as the developer thought its the heal tutorial but mistaken it for the normal heal).
  But I still could not exit the slide tutorial room after killing the Stomper and after I learnt the slide, the tutorial checklist also shows the slide tutorial lesson is checked off, so why does the door not open? The player should also be able to open a door by shooting at it when nearby and the gate is not locked on purpose.
  The door then finally opened after I went back to the other closed door I came in, this is bullshit and frustrating to the player, the door should open when the slide tutorial is successfully done, if the player kills the Stomper too early, before he could learn the slide, repawn the Stomper, same for the other tutorial lessons helper enemies.
  Done: Done (tutorial playtest fixes): only the shield glyph in the shield room, and its own hologram.
- [x] #109 the hologram that is supposed to show special weapon usage after the first beaten boss does not show pressing the special weapon 1 button ("1" on keyboard and white button on mobile), also the hologram shoots at one rotor drone in the hologram animation and there are no bullets show, the hologram should shoot out 3 scrap bullets like the weapon actually does at three rotor drones simultanously(also the hit rotor drone emits a halo indicting destruction which is good, but there should be a second halo 90deg turned, so it looks more like a 3d effect). Adjust the other special weapons regarding the correctness of weapon usage and enemy and bullet and shield detail usage, so the player is not shown wrong facts.
  Done: Done: the button press, the real fire pattern for every special weapon (3 pellets into 3 drones for Scrap Burst), crossed halos on hits.
- [x] #110 after the player has defeated the first boss, the player is asked by Atlas to beam out and the "[B] Beam out" button appear, but we have the guided special weapon tutorial now after the boss, so start showing the yellow objective chevrons and a new objective marker on the screen leading the player to the beam out room(gate closes behind the player upon entering the beam out room) and the player can only call the beam out quadcopter drone after the special weapon tutorial is completed, so the player is forced to learn the new weapon and cannot skip it by beaming out too early, he can also step on the beam out pedestal, that basically automatically uses the beam out cutscene.
  Done: Done: no beam-out or objective-done until the weapon is learned; objective + chevrons lead to the lesson room, its gate shuts behind Flux, the pedestal beams out.
- [x] #111 after the player has beamed out, the debriefing cutscene is supposed to happen, but it seems to load the cutscene for a while and the camera show unimmersively the last spot the beamout dragged Flux up to, so the camera looks down at a half built city with no ground visible, which looks unimmersive or bugged, lets instead show the FLogoProgress background screen with Atlas flying around while the cutscene has not loaded yet (this distracts the player with Atlas's cuteness, Atlas might even say: "Great Job! Another one down." and then "Let's go to the Lab.", needs new recordings, this now happens before each debrief cutscene).
  Done: Done: Atlas loops over the splash blue with both lines while the debrief loads. Voice still to record (ElevenLabs did not load), bubble only for now.
- [x] #112 The first debrief shows a very low poly city(improve the city models quality level in the intro and in all cutscene the cyber city is shown, so its not that embarrasing to look at, especially the buildings are very ugly, and too low poly, make them look like more believable futuristic technologized buildings ) and the first debrief mentions a scrapyard, but that is barely recognizable in the model, improve it, also Vex is talking in the first debrief, but his head/model is not show like in the intro cutscene (fix these things in all cutscenes and debriefs).
  Done: Done: new tower kinds, avenues, a recognizable Scrapyard; Vex face hologram in the debrief and his face in every scene bubble.
- [x] #113 this model shows Flux with a Blaster Weapon on the left hand[Image #4] (same in the intro cutscene), but in    
  the cover images and the actual gameplay the Blaster is on the right side (right  
  arm), so there is a disconnect and that's very unprofessional, note this down in   
  this project.
  Done: Done: the model is mirrored, blaster on the right arm everywhere; a test pins it.
- [x] #114 The first level is now not only a tutorial level but also the scrapyard boss, which have a crane at the ceiling in the boss room. I'd love that type of decorations also in some(not all) other rooms, some a bit more complex, some less, e.g. the crate golem could be dropped from such a crane and the first box in the charge shot tutorial room too.
  The first debriefing mentions there is a furnace where the Flame Master is smithing stuff. Lets add that furnace either in one of the rooms as decoration or in the boss room in one corner, that makes the world more beliveable, lets also add other details that don't hurt the gameplay and don't block paths from the story texts, after all "Awesomeness lies in the details". Do this for all mission levels, so the player recognizes the models(do high-quality models with beveled edges and high details while keeping it the same art style like the other props), I think the props can also be on the walls (if it makes sense physically) where they dont bother the players navigation. 
  Done: Done: ~33 story props across all 11 mission levels (forge in the Blaze arena corner, coolant tanks, Tesla coils, mine shoring, buoys, Vex screens, assembly bays…) in some rooms, never in the way; gantry cranes over some Scrapyard and Polarity Works rooms; the tutorial's crate-lesson crate and the crate golem drop from cranes. A coplanar-face test guards every prop. Not dressed: the Scrapyard job labyrinths.
- [x] #115 I don't understand why the player receives a legendary chasis item right at the start of the flame master level, the player has not done anything to deserve that and not solved a puzzle or something, lets move that drop to a chest in the freeze masters puzzle room in addtition to the repair gel and put a blue weapon into the chest in the flame masters level.
  Done: Done: the Blaze chest holds a blue blaster; the legendary chassis is in a chest in the Frost level's puzzle alcove beside the Repair Tank (once per save; later runs get a purple chest).
- [x] #116 When Flux is hit by the press in flame masters level he should be visibly pressed together with the camera on him, then cartoonishly expand again with overdraw when growing back to full size in swift animation, also the same animation and camera work should happen when Flux is hit by the barrels.
  Done: Done: every press or barrel hit cuts to a third-person squash: flat in a blink, then an overshooting spring back to size; checked in the browser on both.
- [x] #117 The loading screens are still not on point, they dont have the typical blue blackground with the white squared lines from the FlogoProgress, also show that after the intro finished instead of the white background.
  Done: Done: the mission loader and the debrief loader use the boot loader backdrop (blue gradient, white grid lines); the mission loader is opaque, so the intro's white last frame no longer shows through.
- [x] ✅ #118 Since the rooms and especially the wall colors are the same in the whole first tutorial map, add some landmarks and varying wall decorations per room, so the player can clearly navigate if he gets lost("oh, thats the room with bolts and pipes on the wall? I have been here before, I must have gone back. lets turn around").
  Done: every tutorial room has its own wall colour, accent and a repeated wall prop (rust + fans, purple + neon, slate + Vex skulls…); the compass follows the real path and the objective card names the step.
- [x] #119 One Playtester overlooked the dropped crate that he has to use the charged shot on and wasted 2 minutes running against the door. use the objective brighter chevrons and a screen marker to point the player at the next objective.
  Done: the crate lesson keeps the chevrons in its own room and pins the yellow locator triangle on the crate (plain, no boss skull; on the screen's edge when behind) until it breaks.
- [x] #120 One playtester has not come to the first real mission of the Flame Master as he started 2 supply runs, but I think the supply runs should only become available from after the Flame Master has been defeated otherwise the player never sees the platforming content and gets bored of the supply runs.
  Done: the job board stays empty until the Blaze Master is down (or on New Game+) and says which Master opens it; the secured Scrapyard no longer promises jobs.
- [x] #121 let's do another round of optimizing hot-path loading during start up, postponing non-critical assets to lazy loading after all critical assets were loaded for the current scene based on player progress and level position.  
  That should make the game startup faster and happier players (should not create asset pop-ins, should not drop pixel ratio to below 1, avoid using any other values than 1x and 2x)
  Done: the obfuscated builds were missing nine of ten platform stages (the Flame Master's would not load), fixed and guarded by a test; the mission engine and the intro load on demand (boot chunk 508 → 244 KB gz, the mission fetched in the background once the first scene is up); the intro's loader builds its opening valley instead of its closing street (worst freeze after the loader 4.1 → 1.5 s at 4× CPU); the pixel ratio is 1× or 2× only.
- [x] #122 I think it's best not to play english VOs to players from languages that have no   
  VO, that could be a disconnect, at least we need to ask the player first in a     
  Modal with a question if he/she does want to hear english VOs, before playing     
  them in game, the player needs a toggle to turn them off in the                   
  Settings->Gameplay tab if he wants too. Show the Dialog (not closable by          
  clicking outside only by clicking on "X" or "Okay" or "No english Voice-Over")    
  right after the player has landed in the first tutorial room, before the first tutorial starts
- [x] ✅ #123 add spanish and chinese VOs with chatterbox
  Done: all 341 lines in Castilian Spanish and Mandarin (Chatterbox, Qwen-designed reference per character, Whisper-judged); zh-TW players hear Mandarin.
- [x] ✅ #X1 Create a cinematic trailer using the gameplay-preview-pipeline (but use a separate package.json script called "cinematic-trailer" with the file name called trailer to mega-droid-cinematic-trailer.mp4) which shows off the correct in game behaviour to the watching audience and make it epic with epic fights and win scenarios and epic loot findings, the most actionable scenes with edgy video cuts to make it appeal to a 10-15 year old. Let Atlas speak a few of his cool lines in english(no text bubbles in the video). Show of the coolest features of the game and the coolest enemies (especially the bosses) and locations, all enemies and the player must behave like in the game. The cinematic trailer should be around 60-90 seconds long
  Done: `pnpm cinematic-trailer` → preview-videos/mega-droid-cinematic-trailer.mp4 (63 s, 1080p, real gameplay cut to the boss theme, Atlas in English, no text on screen).
- [x] #124 the "Helmling" / Hardhat should take only 30% of the normal damage from special weapons and charge shots if he is covered by the helm and therefore shielded.
  Done: Done: a charge shot or special weapon on the helmet does 30 % (it still breaks the helmet open); a test pins it.
- [x] #125 Flux needs infinite special weapon power during the special weapon tutorials, otherwise he might run out of ammunition while shooting at the wall and not be able to beam out of the level anymore.
  Done: Done: Weapon Energy stays full while a weapon lesson runs (checked in the browser after the first boss).
- [x] #126 Flux needs infinite special weapon power during the special weapon tutorials, otherwise he might run out of ammunition while shooting at the wall and not be able to beam out of the level anymore.
  Done: Done: same as #125 (duplicate).
- [x] #127 Some players still don't understand that the attacks can be reflected with a perfect block, the Intro only shows the kill of a rotor drone with a block, which does not read as a perfect block. Lets also add 2 shots from the guard droid that the Flux perfectly blocks in-between fighting the rotor drones and defending against the rotor drones. 
  Done: between the drone fights the Shield Trooper fires twice; Flux's shield comes up just before each shot lands (the gold perfect-block flash), and the shot flies back home, bigger, knocking the Trooper back. Fitted into the existing beats: the film keeps its length and its score.
- [x] #128 The guard droid in the perfect block tutorial is too far away from the holograms teaching the perfect block, so that people first turn towards the guard droid and the lesson hologram is out of the visible screen, lets place the guard droid further up the room in from of the hallway that leads to the next door, so the player has to pass by the hologram blocking perfectly(also show the block with and bigger bullet being reflected and the hologram guard droid dying and falling apart into pieces, so the player understands a block can be deadly too.). 
  Done: the Shield Trooper stands at the room's far end, in front of the hallway out, so the walk to it passes the hologram; the hologram's shot is bigger and comes back bigger, and blows the hologram Trooper into tumbling pieces.
- [x] #129 The rotor drones in the block tutorial room have a yellow marker, but nothing tells the player to use the shield to block them perfectly or block them at all. Add an Atlas VOed line that atlas repeats as a hint if the player didnt achieve to block the rotor drone on first try. 
  Done: a shot that gets through in the block lesson has Atlas say "Shield up! Block just as it hits to send it back!" (every miss, at most every 9 s), voiced in en/de/es/zh, in all 39 locales.
- [x] #130 The special weapon tutorials are not obvious to mobile and tablet players, show a yellow arrow pointing on the button that needs to be pressed there. Also add to all hologram tutorials the buttons pressed by the hologram as a key/button that appears over Flux's hologram head and only slightly hovers upwards to give a bit of motion to catch players attention. Give the player a free repair gel after the gel tutorial is done
  Done: the weapon lesson points three yellow arrows at its slot on touch; every hologram wears its input over its head on touch too (the HUD button itself; the stick's ∞ for walking), floating up a little; a free Repair Gel once the gel lesson is learned.
- [x] #131 if the objective is behind the player the yellow chevrons on the ground fail to show that, therefore show also some chevrons in the players view that make a turnaround towards the objective in a small arc.
  Done: with the walk setting off behind the view, four bigger chevrons lie on the floor ahead in a small U-turn arc toward it (closer in front of a wall, drawn over props), gone once he faces the way.
- [x] #132 the jump tutorial is a dead end, if the player kills the jumper before he    
  came close enough to jump on Flux and force the dash, if that happens, show a
  big fat yellow arrow on the dash button (on mobile and tablet) and on Space   
  key pressing on screen on desktop with mouse controls. same for the guard droid in the shield lesson room.