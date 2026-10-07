// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Mega Droid',
  'cancel': 'Cancel',
  'close': 'Close',
  'ok': 'Ok',
  'continue': 'Continue',
  'tapToContinue': 'Tap to continue',
  'clickToContinue': 'Click to continue',
  'rewards': 'REWARDS',
  'tip': 'Tip',
  'onlyAvailableOn': 'This game is only available on',

  // Accessible names for icon-only controls (read aloud, not seen).
  'ui': {
    'killcamCount': 'Kill-cams this mission: {n}',
    'killcamOff': 'Turn kill-cams off',
    'next': 'Next',
    'replay': 'Replay',
    'back': 'Back',
    'play': 'Play',
    'pause': 'Pause',
    'menu': 'Menu',
    'home': 'Home',
    'info': 'Info',
    'clickToStart': 'Click to Start',
    'tapToStart': 'Tap to Start',
    'skip': 'Skip',
    // Beside the skip button: {key} is the space bar's name (pause.keys.space).
    'holdToSkip': 'Hold {key} to skip'
  },

  // ─── Combat call-outs (floating text in the 3D view) ─────────────────────
  // Short: they pop over enemies for under a second.
  'combat': {
    'tink': 'TINK!',
    'perfect': 'PERFECT!',
    'parry': 'PARRY!',
    'guardBreak': 'GUARD BREAK!',
    'guardCracked': 'Guard cracked!',
    'xp': '+{n} XP',
    'lastStand': 'Last Stand! Systems rebooted.',
    'weak': 'WEAK!',
    // A shot on a weak spot (a head, a back, a tail): a sound word, not
    // translated.
    'kranck': 'KRANCK!',
    'dizzy': 'DIZZY!',
    'dodge': 'DODGE!',
    'block': 'Block',
    'slide': 'Slide',
    'fire': 'Fire',
    'tank': 'Repair Gel',
    'noEnergy': 'Not enough weapon energy',
    'noGel': 'No Repair Gel left',
    'beamNotYet': 'Beam out once the objective is done',
    'beamFight': 'Win the fight first, then beam out',
    // The gel button's accessible name: how many are carried, and the room.
    'tankCount': 'Repair Gel: {n} of {max}',
    // The borrowed weapon's button (accessible name) and the pickup toast.
    'borrowed': 'Borrowed {weapon}: {n} of {max} shots',
    'borrowedGet': '{weapon} ×{n}'
  },

  // ─── Flux's speech bubble (FluxBubble.vue) ────────────────────────────────
  // A hard hit made him lose control of his charge (sim/fumble.ts): one
  // short, silly line from a friendly robot. Two lines at most on a phone.
  'flux': {
    'fumble': {
      '1': 'Whoa-oh!',
      '2': 'Bzzt! Oops!',
      '3': "My arm's got hiccups!",
      '4': 'Error… wheee!',
      '5': 'Butter circuits!',
      '6': 'Wobble mode ON!'
    }
  },

  // Enemy display names (target frame, bestiary, job board).
  'enemy': {
    'echo': 'Master Echo',
    'gatekeeper': 'Gatekeeper',
    'warden': 'Warden',
    'hornet': 'Hornet Rotor',
    'stalker': 'Glow Stalker',
    'puffer': 'Puffer Mine',
    'mole': 'Mole Driller',
    'polar': 'Polar Pup',
    'hardhat': 'Hardhat',
    'trooper': 'Shield Trooper',
    'heli': 'Rotor Drone',
    'hopper': 'Stomper',
    'roller': 'Gear Roller',
    'brute': 'Guardroid',
    'turret': 'Wall Cannon',
    'golem': 'Crate Golem',
    'elite': 'Elite',
    'level': 'Lv {n}'
  },

  // Plural forms for counts ("Destroy 7 Gear Rollers"): singular | plural.
  'enemyPlural': {
    'echo': 'Master Echo | Master Echoes',
    'gatekeeper': 'Gatekeeper | Gatekeepers',
    'warden': 'Warden | Wardens',
    'hornet': 'Hornet Rotor | Hornet Rotors',
    'stalker': 'Glow Stalker | Glow Stalkers',
    'puffer': 'Puffer Mine | Puffer Mines',
    'mole': 'Mole Driller | Mole Drillers',
    'polar': 'Polar Pup | Polar Pups',
    'hardhat': 'Hardhat | Hardhats',
    'trooper': 'Shield Trooper | Shield Troopers',
    'heli': 'Rotor Drone | Rotor Drones',
    'hopper': 'Stomper | Stompers',
    'roller': 'Gear Roller | Gear Rollers',
    'brute': 'Guardroid | Guardroids',
    'turret': 'Wall Cannon | Wall Cannons',
    'golem': 'Crate Golem | Crate Golems'
  },

  'hud': {
    'help': 'Show controls',
    'mute': 'Mute sound',
    'unmute': 'Unmute sound',
    'bossUnknown': 'Unknown boss',
    'hp': 'Health',
    'we': 'Weapon energy',
    'power': 'Power',
    'bolts': 'Bolts',
    'level': 'Lv {n}',
    'beamOut': 'Beam out'
  },

  'boss': {
    'rotorMaster': 'Rotor Master',
    'neonMaster': 'Neon Master',
    'tideMaster': 'Tide Master',
    'drillMaster': 'Drill Master',
    'magnetMaster': 'Magnet Master',
    'stand': 'Scrapper',
    'scrapper': 'Scrapper',
    'blazeMaster': 'Blaze Master',
    'frostMaster': 'Frost Master',
    'voltMaster': 'Volt Master',
    'galeMaster': 'Gale Master',
    'vexMk1': 'Dr. Vex Mk-I',
    // The ten Masters in one body (#101).
    'grandMaster': 'Grand Master Bot'
  },

  'sector': {
    'rotor': 'Rotor Run',
    'neon': 'Blackout Boulevard',
    'tide': 'Tidewater Locks',
    'drill': 'Deep Mine',
    'magnet': 'Polarity Works',
    'scrapyard': 'Scrapyard',
    'blaze': 'Blaze Refinery',
    'cryo': 'Cryo Plant',
    'volt': 'Volt Tower',
    'gale': 'Sky Docks',
    'fortress': 'Vex Fortress'
  },

  // ─── Missions ─────────────────────────────────────────────────────────────
  'quest': {
    'tutorial': 'Wake-Up Call',
    'boss': 'Core Master Showdown',
    'bossTitle': 'Showdown: {boss}',
    'kill': 'Scrap Duty',
    'collect': 'Data Recovery',
    'rescue': 'Rescue Op',
    'elite': 'Elite Hunt',
    'supply': 'Supply Run',
    'purge': 'Sector Purge',
    'climb': 'Tower Run',
    'stage': 'Platform Stage',
    'stageName': { 'blaze': 'Meltdown Descent', 'cryo': 'Glacier Run', 'volt': 'Rail Rush', 'gale': 'Sky Docks', 'magnet': 'Polarity Works', 'drill': 'Deep Mine', 'tide': 'Tidewater Locks', 'neon': 'Blackout Boulevard', 'rotor': 'Rotor Run', 'fortress': 'Vex Fortress' },
    'rematch': 'Rematch: {boss}',
    'desc': {
      'tutorial': 'Fight through the Scrapyard and take down the Scrapper.',
      'boss': 'Break into the core of {sector} and defeat {boss}.',
      'kill': 'Destroy {n} {target} in {sector}.',
      'collect': 'Recover {n} data cores scattered through {sector}.',
      'rescue': 'A worker-bot is stranded in {sector}. Find it and beam it out.',
      'elite': 'An elite {target} is terrorising {sector}. Hunt it down.',
      'supply': 'Crack open {n} supply chests in {sector}.',
      'purge': 'Destroy every machine in {sector}.',
      'climb': 'Climb the tower of {sector} — stairs, ladders, lifts and pits — then drop into the arena for a rematch with {boss}.',
      'stage': 'Run, slide and ride through {sector} — ledges, pits and machines — to the arena, then defeat {boss}.'
    }
  },
  'objective': {
    'title': 'Objective',
    'complete': 'Objective complete',
    'beamOutHint': 'Beam out when you are ready.',
    'learnWeapon': 'Learn your new {weapon}',
    'tutorial': 'Defeat {boss}',
    // The tutorial's step of the moment (the walkthrough, `WalkObjective`).
    'walk': {
      'charge': 'Charge-shoot the drone',
      'crate': 'Break the crate',
      'block': 'Block a shot with your shield',
      'gap': 'Walk off the edge to leap the gap',
      'chest': 'Open the chest',
      'slide': 'Slide out of the Stomper’s ring',
      'clear': 'Defeat the machines in this room',
      'gel': 'Use a Repair Gel',
      'go': 'Go through the open door'
    },
    'boss': 'Defeat {boss}',
    'kill': 'Destroy {target}: {n}/{total}',
    'collect': 'Data cores: {n}/{total}',
    'rescue': 'Find the stranded worker-bot',
    'elite': 'Hunt down the elite {target}',
    'supply': 'Supply chests: {n}/{total}',
    'purge': 'Machines destroyed: {n}/{total}',
    'climb': 'Climb the tower, defeat {boss}',
    'stage': 'Reach the arena, defeat {boss}'
  },
  'mission': {
    'bossDown': '{boss} destroyed!',
    'objectiveDone': 'Objective complete!',
    'rescued': 'Worker-bot beamed to safety!',
    'bossDoor': 'The shutter grinds open…'
  },
  'interact': {
    'chest': 'Open',
    'rescue': 'Rescue',
    'bossDoor': 'Enter'
  },
  'progress': {
    'levelUp': 'Level {n}! Systems fully repaired.'
  },
  // Screen-reader sentences behind the control coach's wordless glyphs
  // (ControlHints, ControlsPanel). Never drawn on screen.
  'tips': {
    'moveTouch': 'Drag the left side to move, the right side to look. Tap the floor to walk there!',
    'moveKeys': '{keys} to move around.',
    'lookMouse': 'Move the mouse to look around.',
    'capture': 'Click the scene to take control of the camera.',
    'fireTouch': 'Machines ahead! Tap to shoot — hold, then release for a charge shot.',
    'fireKeys': 'Machines ahead! Left click to shoot — hold, then release for a charge shot.',
    'charge': 'Shields block pellets. A FULL charge shot breaks right through.',
    'blockTouch': 'Orange ring: hold the shield to block — press it as the ring closes to PARRY!',
    'blockKeys': 'Orange ring: hold the right mouse button to block — press it as the ring closes to PARRY!',
    'red': 'Red ring means unblockable — slide out of the way!',
    'dodgeKeys': 'Red ring means unblockable — press {slide} to slide out of the way!',
    // The slide key as the sentence above speaks it (inflected where the
    // language needs it); a rebound key is spoken by its letter instead.
    'spaceKey': 'Space',
    'chest': 'A supply chest! Tap it to open.',
    'tank': 'Running low? Repair Gel fixes you up completely.',
    'weapon': 'Use your copied weapon from the colored button!'
  },
  // Screen-reader sentences behind the wordless scene lessons (LessonLayer).
  'lesson': {
    'charge': "Hold to charge your cannon, then let go: only a charged shot breaks the training drone's shield.",
    'crate': 'Supply crates only break to a charged shot. Hold, then let go at the glowing crate.',
    'weaponKeys': 'Press {n} to fire your copied weapon: one shot takes all three drones.',
    'weaponTouch': 'Tap the glowing weapon button: one shot takes all three drones.',
    'gelKeys': 'Press {key} to use a Repair Gel: it repairs you completely.',
    'gelTouch': 'Tap the green Repair Gel button: it repairs you completely.'
  },
  // The one line of the tutorial walk: shown at a door held shut until
  // its room's lesson is done (DoorPrompt).
  'walk': {
    'finishLessonOn': 'Finish the lesson on {weapon}',
    'finishTutorial': 'Finish the Tutorial first',
    'finishLesson': 'Finish the lesson',
    'finishLessonNamed': 'Finish first: {lesson}'
  },
  // Screen-reader sentences behind the first-visit upgrade tour (HubLesson).
  'hubLesson': {
    'earnBolts': 'Not enough bolts? Watch a short video for a top-up.',
    'catchUp': "Pip: Your cannon is falling behind the machines out there. Let's upgrade it!",
    // After the Gale Master: the Overload mod is ready to buy (#100).
    'overload': "Pip: The Gale Master's core taught me a trick. Hold a full charge 3 more seconds: OVERLOAD!",
    'workshop': 'Open the Workshop.',
    'upgradeBuster': 'Spend bolts to upgrade your cannon: more damage.',
    'pickArmor': 'Now select your chest armor.',
    'upgradeArmor': 'Upgrade it too: more defense.',
    'deploy': 'All set — back to the missions!'
  },
  'loot': {
    // The loot card's badge when a find beats what is equipped.
    'upgrade': 'Upgrade!',
    // Under the loot card's Upgrade badge: it goes on by itself as the card leaves.
    'autoEquip': 'Equipped!',
    'found': '{rarity} {item} found!',
    'tank': 'Repair Gel found!',
    'giftTank': 'Gift: +1 Repair Gel!'
  },

  // ─── Results / defeat / pause ─────────────────────────────────────────────
  'results': {
    'success': 'MISSION COMPLETE',
    'failed': 'MISSION FAILED',
    'xp': 'Experience',
    'bolts': 'Bolts',
    'kills': 'Machines destroyed',
    'chests': 'Chests opened',
    'time': 'Time',
    'levelUp': 'Level up! Now level {n}',
    'newWeapon': 'New weapon: {weapon}!',
    'newSector': 'New sector unlocked: {sector}',
    'items': 'Gear found',
    'triple': 'Triple bolts',
    'tripleAria': 'Watch a short video: triple your bolts to +{n}'
  },
  'defeat': {
    'title': 'SYSTEM DOWN',
    'body': 'Flux took too much damage.',
    'kept': 'You keep what you earned so far:',
    'useTank': 'Reboot with Repair Gel ({n})',
    'rebootAd': 'Reboot now',
    'retreat': 'Retreat to the lab',
    'respawnIn': 'Back at the checkpoint in {n} s',
    // The Fortress: back to the last checkpoint, free, at full health.
    'retryCheckpoint': 'Retry from checkpoint',
    // Down in the first boss fight (the tutorial's Core Master): once, no ad.
    'freeReboot': 'Free reboot',
    'freeRebootNote': 'Your first Core Master fight: one free reboot, right here.'
  },
  // ─── The big moment banners (`BigBanner.vue`) ─────────────────────────────
  // One line across the screen, uppercased by CSS in cased scripts, sized to
  // fit: short and loud, like an "ENEMY FELLED".
  // ─── The ending, "First Free Morning" (#102) ───────────────────────────────
  'ending': {
    'fall': "The Grand Master falls. Vex's Red Signal dies with it.",
    'relays': 'One by one, the relays come home, each in its own colour.',
    'thaw': 'In the lab, the ice lets go.',
    'gauss': 'Flux... you did it. You brought them all back.',
    'atlas': "The Spire is empty. I could run this city now. I won't. It's theirs.",
    'morning': 'Cyber City wakes to its first free morning.',
    'spark': 'Flux... did you see that spark?',
    'speaker': { 'atlas': 'Atlas', 'gauss': 'Prof. Gauss', 'pip': 'Pip' },
    'cast': { 'flux': 'Flux', 'atlas': 'Atlas', 'pip': 'Pip', 'gauss': 'Prof. Gauss' },
    'credits': {
      'by': 'A game by {studio}',
      'cast': 'Starring',
      'masters': 'The Masters',
      'thanks': 'Thank you for playing!'
    },
    'card': {
      'title': 'Cyber City is free!',
      'promise': 'New Game+: the Masters have 25 % more health and strike faster. Your level, gear and weapons stay.',
      'ngplus': 'Start New Game+',
      'lab': 'Back to the Lab',
      'confirm': 'Start New Game+?',
      'confirmBody': 'The story starts over with tougher Masters. You keep your level, gear, weapons and upgrades.'
    }
  },
  'banner': {
    'cleared': 'Level cleared',
    'bossDown': 'Enemy defeated!',
    'gameOver': 'Game Over!',
    'grandMaster': 'Grand Master!'
  },
  'pause': {
    'title': 'PAUSED',
    'resume': 'Resume',
    'abandon': 'Abandon mission',
    'abandonAsk': 'Leave the mission? It counts as failed.',
    // The boss is down, only its weapon lesson is left: leaving keeps the win.
    'abandonWon': 'Leave now? Your boss win still counts.',
    // The controls legend's leap row, read aloud: there is no jump button.
    'leapHint': 'No jump button: walk off an edge to leap across the gap.',
    'controls': 'Controls',
    // The controls legend's visible verbs (ControlsPanel), one per row beside
    // the action's icon; the other rows reuse `combat.*`, `hud.*`, `hero.*`.
    // Short: a row shares a 320 px wide phone with two glyphs, and wraps to
    // two lines at most.
    'label': {
      'move': 'Move',
      'look': 'Look',
      'parry': 'Parry',
      'turn': 'Turn (← →)',
      'leap': 'Leap gaps',
      'target': 'Next target',
      'interact': 'Interact'
    },
    'touch': {
      'move': 'Left side: drag to move. Tap the floor to walk there.',
      'fire': 'In combat: tap to shoot, hold to charge, release to fire.',
      'block': 'Hold the shield to block — just as a ring closes to parry.',
      'use': 'Near a chest, a stranded bot or a door: tap it, or the button that pops up.'
    },
    'keys': {
      'move': '{keys} / arrows: move.',
      'look': 'Move the mouse to look. Click the scene to take control of the camera.',
      'fire': 'Left click: shoot — hold to charge, release to fire.',
      'block': 'Right click: block — just as a ring closes to parry.',
      'slide': '{slide}: slide · {tank}: Repair Gel · {use}: interact · {beam}: beam out',
      'more': '{w1} / {w2}: special weapons · {target}: switch target · Esc: pause',
      // The space bar's name, spoken where the slide key is still Space.
      'space': 'Space',
      // A one-key row, read aloud: "H: Repair Gel". `{key}` is the key's
      // letter on this keyboard, `{action}` the row's visible label.
      'press': '{key}: {action}'
    }
  },
  'levelUp': {
    'title': 'LEVEL UP!',
    'pick': 'Choose a system upgrade',
    'chip': '+1 Skill Chip for your circuits',
    'granted': '{stat} raised from {from} to {to}'
  },
  'attr': {
    'hp': { 'name': 'Frame', 'desc': 'Max health' },
    'we': { 'name': 'Reactor', 'desc': 'Weapon energy' },
    'power': { 'name': 'Servos', 'desc': 'Block & slide power' }
  },

  // ─── Hub ──────────────────────────────────────────────────────────────────
  'hub': {
    'tab': {
      'missions': 'Missions',
      'hero': 'Flux',
      'circuits': 'Circuits',
      'workshop': 'Workshop'
    },
    // The hero tab's spoken name. Its visible label is the name alone, and
    // "flux" is also a word, so the label says who he is.
    'heroTabAria': 'Flux, your combat android',
    'levelUpReady': 'Level up!',
    'levels': 'Lv {a}–{b}',
    'story': 'Story mission',
    'jobs': 'Jobs',
    'jobsHint': 'Repeatable — new ones arrive as you finish them',
    'jobsLocked': 'Jobs open once you have beaten {boss}.',
    'lockedHint': 'Defeat {boss} to open this sector.',
    'sectorSecured': 'Sector secured. Its jobs are still on the board.',
    'sectorClear': 'Sector secured.',
    'deploy': 'Deploy',
    'reroll': 'New job',
    // The rewarded "+1 Repair Gel next mission" card on the Missions tab.
    'gift': {
      'name': 'Gel for the road',
      'desc': 'Watch a short video: +1 Repair Gel for your next mission, even over your limit.',
      'aria': 'Watch a short video for one extra Repair Gel on your next mission',
      'ready': 'Gift packed!',
      'readyDesc': '+1 Repair Gel for your next mission.'
    },
    // A locked lab menu (`hubUnlocks.ts`). `{n}` is how many more missions
    // it waits for; the plural forms follow the language (`i18n/plural.ts`:
    // three for ru/uk/pl, six for ar, one where the noun never changes).
    'unlock': {
      'hint': 'Complete {n} more mission to unlock | Complete {n} more missions to unlock',
      // The locked menu's spoken name; `{name}` is its visible label.
      'aria': '{name}, locked: complete {n} more mission | {name}, locked: complete {n} more missions'
    }
  },
  'hero': {
    // Under the name on the hero panel's name plate (the name itself is
    // `hub.tab.hero`): what he is, so the name reads as a name.
    'role': 'Your combat android',
    'weapons': 'Special weapons',
    'weaponSlot': 'Slot {n}',
    'weaponRank': 'Rank {n}',
    'noWeapons': 'Defeat Core Masters to copy their weapons.',
    'attrPending': 'Choose {n} system upgrade(s)!',
    'stats': 'Systems',
    'attributes': 'Upgrades',
    'stat': {
      'hp': 'Max health',
      'we': 'Weapon energy',
      'power': 'Power',
      'damage': 'Pellet damage',
      'charge': 'Charge shot',
      'armor': 'Armor',
      'crit': 'Critical chance',
      'tanks': 'Repair Gels'
    }
  },
  'workshop': {
    'upgradeAdDesc': 'Enough bolts for two upgrades of your best cannon.',
    'upgradeAdName': 'Upgrade Boost',
    'tanks': 'Supplies',
    'tankName': 'Repair Gel',
    'tankDesc': 'Fully restores health and power mid-mission.',
    'owned': 'Carried: {n}/{max}',
    'upgrade': 'Upgrade gear',
    'next': 'Next level',
    'upgradeBtn': 'Upgrade',
    'maxed': 'Fully upgraded',
    'dropName': 'Supply Drop',
    'dropDesc': 'A crate of spare bolts, beamed in from the lab.',
    'dropAria': 'Watch a short video for {n} bolts',
    'dropCooldown': 'Next drop in {t}'
  },

  // ─── Circuits (skills) ────────────────────────────────────────────────────
  'board': {
    'buster': 'Cannon',
    'armor': 'Armor',
    'core': 'Core'
  },
  'circuits': {
    'chips': 'Skill Chips: {n}',
    'rank': 'Rank {n}/{max}',
    'requires': 'Requires {name} rank {n}',
    'requiresBoss': 'Defeat the {name} first',
    'unlock': 'Unlock',
    'install': 'Install chip',
    'maxed': 'Fully powered',
    'respec': 'Reset circuits'
  },
  'skill': {
    'rapid': { 'name': 'Rapid Pellets', 'desc': 'Quick-shot damage +10% per chip.' },
    'quickCharge': { 'name': 'Quick Charge', 'desc': 'Charge time −10% per chip.' },
    'megaCharge': { 'name': 'Mega Charge', 'desc': 'Charged shot damage +12% per chip.' },
    'perfectTiming': { 'name': 'Perfect Timing', 'desc': 'Wider perfect-release window and stronger criticals.' },
    'piercing': { 'name': 'Piercing Core', 'desc': 'Half-charged shots break shields and helmets too.' },
    'giga': { 'name': 'Overload', 'desc': 'Hold a full charge 3 more seconds: the shot hits 1.75× harder.' },
    'frame': { 'name': 'Reinforced Frame', 'desc': 'Max health +8% per chip.' },
    'barrier': { 'name': 'Barrier Tuning', 'desc': 'Blocking costs less power and lets less damage through.' },
    'autoRepair': { 'name': 'Auto-Repair', 'desc': 'Regenerate 1% health per second out of combat, per chip.' },
    'parry': { 'name': 'Parry Protocol', 'desc': 'Wider parry window; parried machines stay stunned longer.' },
    'spikes': { 'name': 'Spike Plating', 'desc': 'Reflect 15% of blocked damage per chip.' },
    'lastStand': { 'name': 'Last Stand', 'desc': 'Once per mission, survive a fatal hit with 1 health.' },
    'cells': { 'name': 'Energy Cells', 'desc': 'Weapon energy +3 per chip.' },
    'mastery': { 'name': 'Weapon Mastery', 'desc': 'Special weapon damage +10% per chip.' },
    'boosters': { 'name': 'Slide Boosters', 'desc': 'Faster slide cooldown, cheaper slides.' },
    'efficient': { 'name': 'Efficient Cores', 'desc': 'Special weapons cost 10% less energy per chip.' },
    'magnet': { 'name': 'Bolt Magnet', 'desc': 'More bolts and a longer pickup reach.' },
    'tankCap': { 'name': 'Gel Capacity', 'desc': 'Carry one more Repair Gel per chip.' }
  },

  // ─── Gear ─────────────────────────────────────────────────────────────────
  'rarity': {
    'standard': 'Standard',
    'tuned': 'Tuned',
    'prototype': 'Prototype',
    'legendary': 'Legendary'
  },
  'item': {
    'arm_standard': 'Standard Cannon',
    'arm_rapid': 'Rapid Cannon',
    'arm_heavy': 'Heavy Cannon',
    'arm_quick': 'Quick-Charge Cannon',
    'arm_nova': 'Nova Cannon',
    'helm_scout': 'Scout Helmet',
    'helm_guard': 'Guard Helmet',
    'helm_ace': 'Ace Helmet',
    'helm_royal': 'Royal Helmet',
    'body_light': 'Light Frame',
    'body_plated': 'Plated Frame',
    'body_reactor': 'Reactor Frame',
    'body_aegis': 'Aegis Frame',
    'boots_basic': 'Basic Boots',
    'boots_dash': 'Dash Boots',
    'boots_magnet': 'Magnet Boots',
    'boots_titan': 'Titan Boots',
    'chip_logic': 'Logic Chip',
    'chip_quantum': 'Quantum Chip'
  },
  'slot': {
    'buster': 'Cannon',
    'helmet': 'Helmet',
    'chest': 'Frame',
    'boots': 'Boots',
    'chip': 'Chip'
  },
  'gear': {
    'damage': 'Damage',
    'armor': 'Armor',
    'equip': 'Equip',
    'unequip': 'Remove',
    'equipped': 'Equipped',
    'new': 'NEW',
    'salvage': 'Salvage',
    'salvageAsk': 'Salvage this item?',
    'salvageBody': "{item} will be destroyed for good. This can't be undone.",
    'noAffixes': 'No bonus modules',
    'emptySlot': 'Nothing for this socket yet — open chests and finish jobs.'
  },
  // `{v}` arrives already signed and formatted ("+12", "+4.5%").
  'affix': {
    // The main stat of an arm cannon, as a signed change (the loot card).
    'damage': '{v} damage',
    'crit': '{v} critical chance',
    'critDmg': '{v} critical damage',
    'hp': '{v} max health',
    'armor': '{v} armor',
    'we': '{v} weapon energy',
    'power': '{v} power',
    'bolts': '{v} bolts found',
    'chargeSpeed': '{v} charge speed',
    'pelletDmg': '{v} pellet damage',
    'chargeDmg': '{v} charge shot damage',
    'moveSpeed': '{v} move speed',
    'special': '{v} special weapon damage',
    'regen': '{v} health regen / s (out of combat)',
    'magnet': '{v} pickup reach'
  },
  'weapon': {
    'rankUp': '{weapon} upgraded to rank {n}!',
    'scrapBurst': { 'name': 'Scrap Burst', 'desc': 'A three-way spray of scrap. Great against crowds.' },
    'flameWave': { 'name': 'Flame Wave', 'desc': 'A fireball rolls along the floor through every machine in its path and sets them burning.' },
    'iceLance': { 'name': 'Ice Lance', 'desc': 'A piercing lance that chills what it hits and slows it down.' },
    'thunderArc': { 'name': 'Thunder Arc', 'desc': 'Instant lightning that chains to nearby machines.' },
    'galeGuard': { 'name': 'Gale Guard', 'desc': 'Leaves orbit you, blocking shots and slicing machines. Use again to hurl them.' },
    'magnetPull': { 'name': 'Magnet Pull', 'desc': 'A homing horseshoe that cracks shields and shells and yanks flyers out of the air.' },
    'drillBomb': { 'name': 'Drill Bomb', 'desc': 'A boring bomb that bursts where it stops, hitting every machine around. Breaks cracked rock.' },
    'bubbleLance': { 'name': 'Bubble Lance', 'desc': 'A big bubble rolls along the floor and bursts through every machine in its way.' },
    'neonBlade': { 'name': 'Neon Blade', 'desc': 'A blade of light thrown like a boomerang: it cuts on the way out and on the way back.' },
    'droneSwarm': { 'name': 'Drone Swarm', 'desc': 'Three little drones seek out three machines, round any cover.' }
  },

  // Asked once, after the first landing, of players whose language has no
  // voice-over: hear the English one, or only read the lines.
  'voiceOffer': {
    'title': 'Hear the voices in English?',
    'body': 'No voices in your language yet. Hear them in English? Their words always show on screen. Change it any time in Options → Gameplay.',
    'no': 'No English voice-over'
  },

  'options': {
    'killCams': 'Kill-cam',
    'englishVoice': 'English voice-over',
    'gameplay': 'Gameplay',
    'title': 'Options',
    'general': 'General',
    'audio': 'Audio',
    'language': 'Language',
    'difficulty': 'Difficulty',
    'soundEffects': 'Sound Effects',
    'music': 'Music',
    'musicTrack': 'Music Track',
    'musicTracks': {
      'cozy': 'Calm Circuits',
      'trance': 'Overdrive'
    },
    'haptics': 'Vibration',
    'on': 'On',
    'off': 'Off',
    'close': 'Close',
    'replayIntro': 'Replay intro',
    // Options → Controls (desktop): keyboard layout and key rebinding.
    'keyboard': {
      'auto': 'Detect keyboard layout',
      'layout': 'Keyboard layout',
      'detected': 'Detected: {layout}',
      'bindings': 'Key bindings',
      'press': 'Press a key… (Esc to cancel)',
      'reset': 'Reset keys'
    },
    'actions': {
      'forward': 'Move forward',
      'back': 'Move back',
      'left': 'Strafe left',
      'right': 'Strafe right',
      'turnLeft': 'Turn left',
      'turnRight': 'Turn right',
      'slide': 'Slide',
      'block': 'Block',
      'interact': 'Interact',
      'beam': 'Beam out',
      'tank': 'Repair Gel',
      'weapon1': 'Special weapon 1',
      'weapon2': 'Special weapon 2',
      'weapon3': 'Borrowed weapon',
      'target': 'Switch target',
      'map': 'Map'
    },
    'lookSensitivity': 'Look Sensitivity',
    'difficulties': {
      'easy': 'Easy',
      'medium': 'Medium',
      'hard': 'Hard'
    },
    'difficultyHints': {
      'easy': 'Machines hit softer and go down faster.',
      'medium': 'The intended challenge.',
      'hard': 'Tougher machines that hit harder.'
    }
  },
  'adsBlocked': {
    'title': "Couldn't show ad",
    'body': 'We tried to show you a video so you could earn your reward, but something on your browser is blocking ads.',
    'allowPrefix': 'Please allow ads on',
    'allowSuffix': '(or pause your ad-blocker for this game) and try again.',
    'gotIt': 'Got it'
  },
  'saveStatus': {
    'restoredTitle': 'Cloud save restored',
    'restoredBody': '+{n} bonus bolts for the recovery',
    'tap': 'tap',
    'pausedTitle': 'Cloud sync paused',
    'pausedBody': 'Playing offline. Your progress is saved here.',
    'retry': 'Retry',
    'dismiss': 'dismiss'
  },
  'loading': {
    'tooLong': 'Loading taking too long? Try disabling your ad blocker and refresh.'
  },
  'license': {
    'denied': 'Access Denied: Please purchase a license.'
  },
  // ─── Leaderboard ──────────────────────────────────────────────────────────
  // `score` is LIFETIME XP, `flair` the hero level. `{n}` and `{total}` arrive
  // PRE-FORMATTED (grouped for the locale): plain named interpolation, never
  // plural forms. `yourRank` keeps both numbers in one sentence so a locale
  // can order them; `of` is only the rank badge's tail after "#1,130".
  'leaderboard': {
    'title': 'Leaderboard',
    'rank': '#',
    'player': 'Player',
    'score': 'Experience',
    'flair': 'Level',
    'empty': 'No one is on the board yet. Be the first!',
    'failed': "Couldn't reach the leaderboard.",
    'loading': 'Loading…',
    'you': 'You',
    'yourRank': 'You are #{n} of {total}',
    'of': 'of {n} players',
    'tabGlobal': 'Global'
  },
  // ─── Story (the intro cutscene, story-arc.md § 1) ─────────────────────────
  // `intro.*` are screen-reader lines, one per shot: read aloud, never drawn.
  // `vex.*` is Dr. Vex's speech bubble: a pompous showman, CAPS for the
  // shouted word. `atlas.*` are Atlas's lines: calm, dry, short.
  'story': {
    'intro': {
      'coldOpen': 'Flux fights rogue machines on the neon streets of Cyber City.',
      'valley': 'Cyber City: a bright android city, linked by beams of light. Dr. Vex takes over its machines with a red signal.',
      'lab': "The signal reaches Prof. Gauss's lab. Gauss gives Flux the Atlas disc and wakes him.",
      'safeMode': 'Gauss freezes herself in a capsule to keep the signal out. She is still alive.',
      'wakeUp': 'Flux wakes at level 1, with Atlas online. The Vex Fortress is far stronger, so the Scrapyard comes first.',
      'beam': 'Flux beams out to the Scrapyard.'
    },
    'vex': {
      'diagnosis': 'Diagnosis: this valley is SICK. The cure… is ME!'
    },
    'atlas': {
      'logStart': 'Log start.',
      'goodMorning': 'Core online. Good morning, Flux.',
      'scrapyardFirst': 'Scrapyard first. One relay at a time.'
    }
  },
  // ─── Atlas, in the missions (sim/atlas.ts) ─────────────────────────────────
  // Flux's AI companion talking to him: tiny, warm, a little cheeky. One
  // short line each (they sit in a small speech bubble for 2–3 s). Each key is
  // also the name of its optional voice file (voice-todo.md).
  'atlas': {
    // Before a debrief, while it loads (#111).
    'debrief': {
      'greatJob': 'Great job! Another one down.',
      'toLab': "Let's go to the lab.",
    },
    'boss': {
      'signalFirst': "Core Master signal. It's… big.",
    },
    'sector': {
      'blaze': 'Refinery. It runs hot. Mind the vents.',
      'cryo': "Coolant's flowing uphill. To the Fortress.",
      'gale': 'Every part for its body goes through here.',
      'magnet': "A foundry. It's casting claws.",
      'drill': 'Ore for its armor. Dug right here.',
      'tide': 'Barges now. Vex found another way.',
      'neon': "Lights out. Except Vex's face.",
      'rotor': 'Drones. Its last supply line.',
    },
    'fortress': {
      'bays': 'Half-built. You did that.',
    },
    'warn': {
      'boss': 'Core Master ahead.',
      'gelFirst': "Plating's cracking. Use a gel.",
      'gel': 'Gel.',
      'criticalFirst': 'Critical! Back off!',
      'critical': 'Critical!',
      'noGel': 'No gel left. Play it safe.',
      'weLow': "Weapon energy low. The cannon's free.",
      'weEmpty': "Tank's dry.",
      'borrowedLast': {
        'scrapBurst': 'Last shot of {weapon}.',
        'flameWave': 'Last shot of {weapon}.',
        'iceLance': 'Last shot of {weapon}.',
        'thunderArc': 'Last shot of {weapon}.',
        'galeGuard': 'Last shot of {weapon}.',
        'magnetPull': 'Last shot of {weapon}.',
        'drillBomb': 'Last shot of {weapon}.',
        'bubbleLance': 'Last shot of {weapon}.',
        'neonBlade': 'Last shot of {weapon}.',
        'droneSwarm': 'Last shot of {weapon}.',
      },
      'flame': 'Vents. Wait for it… or slide.',
      'blade': 'Blade. Go right after it.',
      'crusher': 'Crusher. Watch the lamp.',
      'ladder': 'Ladder. Push toward the wall.',
      'pit': 'Long drop. Time the lift.',
      'down': "Rebooting… Pip's got you.",
    },
    'scan': {
      'hardhat': '{enemy}. Shoot when it peeks.',
      'trooper': 'Shield. Charge through it.',
      'heli': '{enemy}. Look up.',
      'hopper': '{enemy}. Move off the ring.',
      'roller': '{enemy}. Sidestep it.',
      'brute': '{enemy}. Parry, then punish.',
      'turret': '{enemy}. Keep moving.',
      'golem': "That crate's breathing. Get close.",
      'polar': '{enemy}. Shoot it when it opens red.',
      'warden': '{enemy}. Hit the core when it opens.',
      'hornet': '{enemy}. It dives straight: sidestep!',
      'stalker': '{enemy}. Parry the lunge.',
      'puffer': '{enemy}. Pop it before it swells.',
      'mole': '{enemy}. Hit it when it pops up.',
      'elite': 'Gold ring. Elite. Careful.',
      'fire': 'Fire-coated. It shrugs off fire.',
      'ice': 'Ice-coated. It shrugs off ice.',
      'volt': 'Volt-coated. It shrugs off volt.',
      'wind': 'Wind-coated. It shrugs off wind.',
    },
    'volt': {
      'hack': "Flux… something's in the—",
      'thanks': '…You kept it out. Thank you.',
    },
    'mk1': {
      'intro': "That's Vex. The real one.",
      'fire': 'Fire!',
      'ice': 'Ice!',
      'volt': 'Volt!',
      'wind': 'Wind!',
      'scrap': 'Scrap!',
      'free': "Because they're free.",
    },
    'guardDown': "Guard down! The way's open.",
    'help': {
      'weapon': 'Pick your new weapon and fire at the drones!',
      'gap': "Walk straight at the edge and you'll leap across!",
      'gel': 'Use a Repair Gel to heal up!',
      'slide': 'Slide away just before the red ring reaches you!',
      'block': 'Hold block when it fires. Just as it hits is perfect!',
      'charge': 'Hold fire until the cannon glows, then let go!',
    },
    'train': {
      'weapon': "Let's train your new weapon!",
      'gap': "Let's train jumping over gaps!",
      'gel': "Let's train the Repair Gel!",
      'slide': "Let's train the Slide!",
      'block': "Let's train the Perfect Block!",
      'charge': "Let's train the Charge Shot!",
    },
    'hint': {
      'locator': "Objective's that way.",
      'rescue': 'Worker-bot signal. Faint. Close.',
      'upgrade': "That's an upgrade.",
      'levelUp': 'New chip compiled.',
      'done': 'Done. Call the drone when ready.',
      'underLevel': "They'll outclass you. Train first.",
      'floor': {
        'blaze': '{sector} runs level 3 and up.',
        'cryo': '{sector} runs level 6 and up.',
        'volt': '{sector} runs level 9 and up.',
        'gale': '{sector} runs level 13 and up.',
        'magnet': '{sector} runs level 16 and up.',
        'drill': '{sector} runs level 19 and up.',
        'tide': '{sector} runs level 22 and up.',
        'neon': '{sector} runs level 25 and up.',
        'rotor': '{sector} runs level 28 and up.',
        'fortress': '{sector} runs level 31 and up.',
      },
      'rotor': {
        'board': 'All aboard! I fly, you shoot.',
      },
      'neon': {
        'kick': 'Face the wall and slide. Again! Wall-kick up!',
        'switch': 'A light switch! Shoot it to swap the bridges.',
        'blink': 'Light bridges blink! Cross while they glow.',
        // #110: the whole boulevard goes dark on a clock, these bridges with it.
        'blackout': "Power's failing! Cross when the lights come back.",
      },
      'tide': {
        'deep': 'Too deep! Get out of the water!',
        'valve': 'Flooded lock! Shoot the valve to drain it.',
        'rise': "The tide's coming in. Up the steps!",
      },
      // The Grand Master Bot (#101): Atlas through the fight, part by part.
      'gm': {
        'button': "Vex is pressing something... Brace yourself!",
        'arms': 'Its arms first! The cannon and the lance!',
        'feet': 'Now the feet! Block the shockwaves!',
        'head': "It's down low. The head is in reach!",
        'body': 'The core is open! Finish it!',
        'prism': 'Prism Cannon! Shield up!',
      },
      // The Core Descent (#109): Vex's three stages.
      'vex': {
        'roof': 'Lightning! Move when the ring lights up!',
        'fall': "The roof's giving way!",
        'core': "Down to the Core! Don't fall in!",
      },
      'drill': {
        'drop': 'Rocks falling! Step out of the shadows.',
        'rock': 'Cracked rock! A full charge will break it.',
        // The mine cart (#111).
        'board': "Ore cart's rolling! I steer, you shoot the moles.",
      },
      'magnet': {
        'panel': 'See that red-blue plate? Shoot it to flip the rail.',
        'rail': 'Magnet rail! The arrows show the pull. Push through, or ride it.',
      },
      'blaze': {
        // Meltdown Descent (blaze stage)
        'lava': "That's lava down there. Stay on the metal.",
        'leap': "Too wide to walk. Slide off the edge, you'll carry.",
        'vents': 'Hiss, then fire. Let the roar pass, then go.',
        'barrels': 'Barrels! Watch the lamps, cross between them.',
        'hammers': 'Forge hammers. Count the beat, then run.',
      },
      'cryo': {
        // Glacier Run (cryo stage)
        'ice': "Ice! Let go of the stick and you'll keep sliding.",
        'spikes': 'Spikes under that ice. Walk it straight, no sharp turns.',
        'frost': "Frost thrower. It glows and hisses first. Cross when it's quiet.",
        'icicles': 'Shadows on the floor? Icicles. Step out of the ring!',
        'pillar': "That pillar's cracked. Shoot it, and there's your shortcut.",
      },
      'volt': {
        // Rail Rush (volt stage)
        'panels': 'Those panels pulse. Wait on a dark row, then step.',
        'board': "Hands off the controls — I'll drive, you shoot.",
      },
      'gale': {
        // Sky Docks (gale stage)
        'leap': "Gap's too wide to walk. Slide off the edge — you'll carry.",
        'wind': 'Wait for the gust to die, then move. Or hide behind a pillar.',
      }
    },
    'secret': {
      // secret-room puzzles
      'lights': "That panel shows a pattern. The lamps on the wall don't. Yet.",
      'color': 'That frame has a favourite colour. Only its lamps should shine.',
      'cycle': "Every hit changes a lamp's mind. The panel knows what it wants.",
      'solved': 'Well, well. Someone likes puzzles.'
    },
    'landed': "Touchdown! Let's go.",
    'brief': {
      'tutorial': "Training time. I'll guide you!",
      'job': 'Quick job. In and out!',
      'climb': 'Tower run! Up, up, up!',
      'story': "A Core Master waits. Let's free it!"
    },
    'story': {
      'relayOne': 'Relay one lit. Nine to go.',
      'copied': {
        'scrapBurst': '{weapon} copied.',
        'flameWave': '{weapon} copied.',
        'iceLance': '{weapon} copied.',
        'thunderArc': '{weapon} copied.',
        'galeGuard': '{weapon} copied.',
        'magnetPull': '{weapon} copied.',
        'drillBomb': '{weapon} copied.',
        'bubbleLance': '{weapon} copied.',
        'neonBlade': '{weapon} copied.',
        'droneSwarm': '{weapon} copied.',
      },
      'dataCore': 'It left us something.',
      'firstDraft': '…I was written from its first draft.',
      'body': "It's building a body. Out of our valley.",
      'voltFreed': "The signal's lost its power station.",
      'galeFreed': 'No more parts reach the Fortress.',
      'breach': "Shield's down. The Fortress is open.",
      'magnetFreed': "The foundry's cold. No more claws.",
      'drillFreed': "The mine's quiet. No more ore.",
      'tideFreed': 'Locks shut. The barges stay home.',
      'neonFreed': 'Lights on. Vex lost its screens.',
      'rotorFreed': "Every line's cut. Vex is alone.",
      'rotor': 'Rotor Run. Wind in my antenna!',
      'neon': 'Blackout Boulevard. Lights, please!',
      'tide': 'Tidewater Locks. Splash time!',
      'drill': 'Deep Mine. Mind your head!',
      'magnet': 'Polarity Works. My compass spins!',
      'scrapyard': 'Scrapyard relay. Light it up!',
      'blaze': 'The Refinery. Hot, hot, hot!',
      'cryo': 'Cryo Plant. Brr! Keep moving.',
      'volt': 'Volt Tower. My circuits tingle!',
      'gale': "Sky Docks. Don't look down!",
      'fortress': 'The Fortress. We end this.'
    },
    'arc': {
      '10': "Shield's down. Vex is next!",
      '9': 'One Master left. Almost!',
      '8': 'Eight! Only two Masters left.',
      '7': 'Seven lit. Keep it up!',
      '6': 'Six relays! The city wakes up.',
      '1': 'One relay lit. Nine to go!',
      '2': 'Two relays! Vex is sulking.',
      '3': 'Three lit. Keep glowing!',
      '4': 'Four down. The grid hums again.',
      '5': 'Halfway there! Vex is sweating.',
    },
    'bossAhead': 'Boss ahead. Deep breath!',
    'noWeak': 'No weak spot visible. Move!',
    'weak': {
      'flameWave': 'Flame Wave hurts this one!',
      'iceLance': 'Ice Lance hurts this one!',
      'thunderArc': 'Thunder Arc hurts this one!',
      'galeGuard': 'Gale Guard hurts this one!',
      'magnetPull': 'Magnet Pull hurts this one!',
      'drillBomb': 'Drill Bomb hurts this one!',
      'bubbleLance': 'Bubble Lance hurts this one!',
      'neonBlade': 'Neon Blade hurts this one!',
      'droneSwarm': 'Drone Swarm hurts this one!'
    },
    'bossDown': 'Master freed! Great job!',
    'vexDown': 'Vex is down. We did it!',
    'lowHp': 'Ouch! Careful, Flux!',
    'lowHpGel': 'Low health! Try a Repair Gel.',
    'lowWe': "Weapon energy's low!",
    'trap': 'Trap ahead. Watch the timing!',
    'plate': 'Pressure plate. Tiptoe!',
    'objective': 'Done! Now find the exit.',
    'exit': "Our ride's here!",
    'levelUp': "Level up! You're shining.",
    'idle': {
      '1': 'Beep. Just checking in.',
      '2': "You're doing great.",
      '3': 'Gauss would be proud.',
      '4': 'I like our team.'
    }
  },
  'train': {
    'todo': 'not done yet',
    'done': 'done',
    'checklist': 'Tutorials',
    'name': {
      'weapon': 'Weapon Lesson',
      'gap': 'Gap Leap Tutorial',
      'gel': 'Repair Gel Tutorial',
      'slide': 'Slide Tutorial',
      'block': 'Shield Tutorial',
      'charge': 'Charge Shot Tutorial',
    },
  },
  // ─── Dr. Vex's lines (#117: his bubble and voice in the missions and the hub) ───
  'vex': {
    'present': {
      'scrapper': 'Warm up act! The {boss}!',
      'blaze': 'The oldest! The hottest! {boss}!',
      'frost': 'Chill, little droid. {boss}!',
      'volt': "Blink and you'll miss it! {boss}!",
      'gale': 'Next, please! {boss}, blow him away!',
      'magnet': "Attractive, isn't it? {boss}!",
      'drill': 'Time for a deep check-up! {boss}!',
      'tide': 'Wave goodbye, droid! {boss}!',
      'neon': 'Lights! Camera! {boss}!',
      'rotor': 'The grand finale! {boss}!',
    },
    'hub': {
      'scrapper': 'A junk crane? How… adorable.',
      'blaze': 'Side effect noted. Increasing the dose.',
      'blueprint': "My sketches! Magnificent, aren't I?",
      'volt': 'I am… per-fect-ly… FINE.',
      'gale': 'Fine! I have MORE Masters.',
      'magnet': 'Repelled? Me? Im-POSSIBLE!',
      'drill': 'Hmph. A new low. Literally.',
      'tide': "The tide will turn! …Won't it?",
      'neon': 'Who turned the lights ON?!',
      'rotor': 'Ten relays?! Nurse! NURSE!',
      'breach': 'No, no, NO! That shield was PATENTED!',
    },
    'volt': {
      'hack': "Let's see what's in that empty head…",
      'fail': 'Unwritable?! How RUDE.',
    },
    'fortress': {
      'welcome': 'Welcome to my clinic! Take a seat… FOREVER!',
    },
    'mk1': {
      'intro': 'Behold! My new body! Mark ONE!',
      'obey': 'Masters! OBEY your doctor!',
      'listen': "Why won't they LISTEN?!",
      'defeat': "I'll get… a second opinion…",
    },
    'sting': {
      'doctorIn': 'The doctor… is IN.',
    },
  },
  'pip': {
    'debrief': {
      'hello': 'Welcome back, Flux! Look at the valley.',
      'go': "Gear up, then go! I'll mind the lab.",
      'scrapyard': {
        'won': 'The old crane is sorting scrap again.',
        'weapon': 'You copied {weapon}. It sprays three ways.',
        'next': 'Next stop: {sector}. Just a little tougher.',
        'boss': "{boss} is forging armor for Vex's machines.",
        'tip': 'Block its fireballs. Slide past the fire waves.',
      },
      'blaze': {
        'won': 'The chimneys burn clean again. Nice work!',
        'weapon': "You've got {weapon} now. Fire melts ice!",
        'next': '{sector} is next. The machines hit harder there.',
        'boss': "{boss} keeps all the coolant. The city's overheating.",
        'tip': 'Block its ice shots, then fire back!',
      },
      'cryo': {
        'won': "Coolant's flowing home. The city can cool down.",
        'weapon': '{weapon} is yours. Ice beats lightning!',
        'next': 'Next: {sector}, downtown. A real step up.',
        'boss': '{boss} pours our power into the Red Signal.',
        'tip': 'It teleports a lot. Shoot down its orbs.',
      },
      'volt': {
        'won': "Vex's face keeps flickering now. Did you see?",
        'weapon': '{weapon} is yours. Lightning beats wind!',
        'next': 'Next: {sector}, way up high. Tough machines.',
        'boss': "{boss} runs Vex's airships, day and night.",
        'tip': 'Block the feathers. Parry when it dives!',
      },
      'gale': {
        'won': 'The airships turned around. Clear skies again!',
        'weapon': '{weapon} is yours. Its leaves block shots.',
        'next': "Now the city's edge: {sector}. Much tougher.",
        'boss': "{boss} took the tram rails for Vex's freight.",
        'tip': 'It pulls you in. Block the clamp!',
      },
      'magnet': {
        'won': 'The trams are rolling again. Ding ding!',
        'weapon': '{weapon} cracks shields. Perfect for the next Master.',
        'next': 'Next: {sector}, deep underground. Seriously strong machines.',
        'boss': '{boss} trapped the worker-bots down the shaft.',
        'tip': 'It digs under you. Step off the mark!',
      },
      'drill': {
        'won': 'The worker-bots are back up in daylight.',
        'weapon': '{weapon} goes boom. Save some for the boss!',
        'next': 'Next: {sector}, down by the water. Very tough.',
        'boss': "{boss} is flooding the canals for Vex's barges.",
        'tip': 'Slide under its waves. Pop the bubbles!',
      },
      'tide': {
        'won': "Clean water's flowing into the valley again.",
        'weapon': '{weapon} rolls through crowds. The boss hates bubbles!',
        'next': 'Next: {sector}, the dark rooftops. Really dangerous.',
        'boss': '{boss} switched off every window downtown.',
        'tip': 'Its blade flies out and back. Dodge twice!',
      },
      'neon': {
        'won': "Downtown's glowing pink tonight. So pretty!",
        'weapon': '{weapon} cuts twice. The next Master fears it!',
        'next': 'Next: {sector}, the sky airfield. Almost the toughest.',
        'boss': '{boss} fills the sky with cargo drones.',
        'tip': 'It blows you back. Slide under the gusts!',
      },
      'rotor': {
        'won': 'The drones deliver to the worker-bots now.',
        'weapon': '{weapon} is yours. Three drones find their targets.',
        'next': 'Last stop: {sector}. The toughest place there is.',
        'boss': "{boss} can't hide behind a shield now.",
        'tip': "It borrows the Masters' attacks. Pack Repair Gel!",
      },
    },
  }
}
