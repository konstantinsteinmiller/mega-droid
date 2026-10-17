#!/usr/bin/env node
/**
 * ─── Promotion covers: in-engine plate → Gemini → portal cover sizes ─────────
 *
 * The art-generation-pipeline's promotion side step, for a 3D game: the plate
 * is not composited from sprites, it is RENDERED from the game's own rigs.
 * Each plate goes to the Art Desk's Gemini window (same profile, same
 * throttle, same allowance ledger) with the cover prompt, and every
 * deliverable is cut from the master of its own aspect family, then
 * compressed.
 *
 * A cover is a SCENARIO (#120): who is in it, the moment, the shot per
 * aspect. `--scenario <id>` picks one; without it the tool runs for SHIPPED,
 * the cover the game's store pages use.
 *
 *   scrapper   Flux against the Scrapper in the Scrapyard (the first cover;
 *              its plates are staged in a running mission, stage-scene.js)
 *   neon       the face: Flux's helmet and the charging muzzle, close
 *   frost      the duel: Flux in profile, his shot in flight at the Frost Master
 *   vex        the villain: Dr. Vex Mk-I looming over a small, defiant Flux
 *   blaze      the charge: Flux leaping at the lens, the Blaze Master behind
 *   volt       the storm: Flux close, charging up at the Volt Master in the lightning (#176)
 *   magnet     the pull: Flux braced against the Magnet Master's field, firing back
 *   drill      the eruption: the Drill Master bursts from the floor behind a leaping Flux
 *   rotor      the dive: the Rotor Master and its drones swoop out of a dusk sky
 *   (plates of the last four: the composition view, `#/models?m=thumb&v=<id>`)
 *
 *   pnpm art:promotion                           paint missing masters → cut → compress
 *   pnpm art:promotion --scenario neon --plates --url U   (re)stage its plates from a dev server
 *   pnpm art:promotion --scenario neon --only 16x9 --no-cut   one master, no deliverables (comparing)
 *   pnpm art:promotion --dry                     write the prompt document, paint nothing
 *   pnpm art:promotion --no-generate             cut + compress from what is on disk
 *   pnpm art:promotion --only 1x1,16x9           just these families
 *   pnpm art:promotion --force                   repaint these masters (old ones archived)
 *   pnpm art:promotion --keep-window             leave the Gemini window open
 *
 * Deliverables, into src/assets/promotion/: every size as .jpg AND .webp,
 * once bare (`<w>x<h>`) and once with the logo lockup (`<w>x<h>-logo`).
 * Portals differ on text: Poki tests text-free covers better and YouTube
 * Playables forbids branding; CrazyGames and GamePix allow the exact title;
 * Steam requires it. So the painted master carries NO text, and the logo is
 * laid on afterwards from store-art/brand/logo-lockup.svg: in the lower
 * third, off the bottom edge and out of every corner — never top-left, where
 * CrazyGames lays its banners over a tile.
 *
 * Rules kept from the skill (PROMOTION.md): no text, no UI and no logo in a
 * painted cover; a size is cut from a master of its own aspect family (the
 * 16:10 and 3:2 sizes are a trim of the 16:9 master's outer eighth, which
 * the prompt keeps free of anything that matters); a family with no painting
 * still ships, cut from its plate; the prompt documents live in
 * art-sheets/promotion/, out of the Art Desk's scan.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const sharp = require('sharp')
const DIR = join(ROOT, 'art-sheets', 'promotion')
const OUT = join(ROOT, 'src', 'assets', 'promotion')
const LOCKUP = join(ROOT, 'store-art', 'brand', 'logo-lockup.svg')
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/')

const { values: opt } = parseArgs({
  options: {
    scenario: { type: 'string' },
    plates: { type: 'boolean', default: false },
    url: { type: 'string' },
    dry: { type: 'boolean', default: false },
    'no-generate': { type: 'boolean', default: false },
    'no-cut': { type: 'boolean', default: false },
    only: { type: 'string' },
    force: { type: 'boolean', default: false },
    'keep-window': { type: 'boolean', default: false },
    profile: { type: 'string' }
  }
})

/**
 * Aspect families: the plate, and every deliverable cut from its master.
 * `fit` sizes are a centre trim of a neighbouring aspect (see the header).
 */
const FAMILIES = {
  '16x9': { plate: [1920, 1080], shape: 'landscape', out: [[1920, 1080], [800, 450], [400, 225], [1360, 850], [512, 340]] },
  '9x16': { plate: [1080, 1920], shape: 'portrait', out: [[1080, 1920]] },
  '2x3': { plate: [1024, 1536], shape: 'tall', trim: 0.015, out: [[800, 1200]] },
  '1x1': { plate: [1024, 1024], shape: 'square', out: [[800, 800], [628, 628], [512, 512]] },
  '4x3': { plate: [1024, 768], shape: 'classic', out: [[512, 384]] }
}

// ── The cast ────────────────────────────────────────────────────────────────

const FLUX = `- FLUX, the hero: a small, sturdy, chibi-proportioned robot. A big ROUND pearl-white helmet (a smooth dome — no horns, no ears, no fins, no pointed crest) with a wide BLACK visor band across it and two big ROUND glowing AMBER eyes in the visor, a tiny antenna with an amber tip. He is a robot: NO mouth, NO nose, NO teeth, NO eyebrows, no human face anywhere — below the visor the helmet is plain smooth white; all his expression is in the shape of the two amber eyes and the tilt of his head. White rounded armour plates over a black undersuit, an amber hexagon reactor glowing on his chest, chunky white boots. His right arm is a large white ARM CANNON with a glowing amber muzzle.`

/**
 * What a cover must do, as marks a painter can check (the evidence is in
 * store-art/cover-research.md: Poki's and CrazyGames' cover guides, Netflix's
 * artwork tests, Valve's capsule rules).
 */
const RULES = (accent, ground) => `HIGH-CTR RULES (this image must win a click at 250 px wide, in a grid of forty other games, in under two seconds):
- ONE subject owns the image: Flux. One opponent only, and it is the threat behind him, never a co-star. No crowd, no third character.
- The face is the hook: Flux's black visor and amber eyes are the sharpest, most readable thing in the picture, large enough to read at postage-stamp size, and they carry an emotion (fierce, determined: the eyes narrowed, the head tilted into the action). Never a neutral stare.
- Mid-action on a diagonal: the cannon is in use (charging or just fired), the body leans into it. Never a front-on standing pose.
- The whole silhouette of the WHITE hero separates from the background in greyscale: behind him is ${ground}, never anything pale. No white on white.
- One dominant background hue plus ONE accent: ${accent}. The two brightest, most saturated colours meet at the focal point and nowhere else.
- A SIMPLE background: big soft shapes and a gradient, no clutter of props, no small detail that turns to mush when the image is small.
- Everything points at the focal point: speed lines, sparks, the opponent's reach.
- Nothing that matters within the outer eighth of the image on any side; all four corners and the bottom strip are expendable (a portal may lay a badge or a title bar there).
- The TOP-LEFT (the top fifth of the left half) holds only background: a portal lays its banner over it. Flux's face is never there.`

const SCENARIOS = {
  scrapper: {
    legacy: true,
    families: ['16x9', '9x16', '2x3', '1x1'],
    world: 'the Scrapyard arena: olive-green riveted steel walls with yellow capped posts and rails, rusty orange pipes, a pale steel-tile floor, open blue sky',
    cast: [
      `${FLUX} Determined, fearless: his amber eyes narrowed into a fierce squint.`,
      '- THE SCRAPPER, the boss: a hulking scrap mech three times Flux\'s height. A round dome body in hazard yellow with dark grey shoulder spheres, a glowing RED visor slit and a red warning light on top, rusty orange joints. One arm ends in a red crane hook claw, the other in a massive black hydraulic hammer fist with yellow rims.',
      '- Two small machines, the supporting cast: a green SHIELD TROOPER hiding behind a big round grey shield with a green glowing core, and a yellow HARD-HAT dome robot. Keep them small and behind.'
    ],
    moment: 'THE MOMENT — the second BEFORE the hit. Flux\'s cannon is charging a blazing amber-white energy ball at the muzzle, crackling, about to fire; the Scrapper\'s hammer fist is raised to smash down. Nothing has landed yet: all tension.',
    rules: `HIGH-CTR RULES (this image must win a click at 250 px wide, in a grid of forty other games, in a fifth of a second):
- One subject, enormous: Flux and the threat fill most of the frame. No busy crowd.
- The face is the hook: Flux's visor and amber eyes are large, crisp and readable.
- Maximum contrast where the eye lands: the amber-white glow of the charging shot against the Scrapper's red eye and the deep shadow behind — the two brightest, most saturated colours meet at the focal point and nowhere else.
- Everything points at it: speed lines, flung sparks and scrap, the Scrapper's arm, dust — every line leads to the cannon's glow.
- Three planes of depth: something large, sharp and cropped by the frame in front (a flying bolt, a spark burst, a scrap chunk); the subjects crisp in the middle; a softer, hazier background.
- Quiet edge, bright centre: the arena darkens and desaturates toward the corners; warm rim light on Flux from the charge, a cool blue sky behind.
- Nothing important within the outer eighth of the image on any side.`,
    shots: {
      landscape: 'THE SHOT — WIDE 16:9. Flux stands left of centre, big: from boots to antenna he fills at least 70% of the frame\'s height, his arm cannon thrust toward the right third where the Scrapper looms. The Scrapper fills the right half, towering, cropped by the top edge, its hammer fist raised overhead and its crane claw reaching toward Flux. The two machines scatter behind on the left, smaller and softer. Use the width: speed lines and flung scrap sweep from the edges toward Flux\'s glowing cannon.',
      portrait: 'THE SHOT — TALL 9:16, read top to bottom as ONE vertical gesture, NOT a landscape laid on its side. Top: the Scrapper\'s red eye and raised hammer fist, cropped by the top edge, coming DOWN. Middle: the blazing amber charge at the muzzle of Flux\'s cannon, aimed UP at it — the brightest point of the whole image, in the upper-middle. Bottom half: Flux, huge, low heroic angle, boots planted, filling the full width. The machines are small, at the side edges, half cropped.',
      tall: 'THE SHOT — TALL 2:3, a poster. Flux fills the lower two thirds, big and centred a little left, low heroic angle, cannon raised toward the upper right. The Scrapper looms over him from behind in the upper half, hammer fist raised, red eye glowing, cropped by the top edge. The machines at the side edges, smaller.',
      square: 'THE SHOT — SQUARE 1:1, a store tile read at 250 px. Fewer things, each bigger: Flux\'s head, visor and arm cannon fill the lower-left two thirds, the cannon\'s charging muzzle near the centre; the Scrapper\'s head and raised hammer fist fill the upper right, cropped by the frame. One machine at most, small, behind.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes, white arm cannon · the yellow Scrapper with red eye, hook claw and hammer fist',
    // Camera and cast placement per family (metres / radians, see stage-scene.js).
    stage: {
      '16x9': { fwd: 1.7, dist: 2.6, camY: 0.5, side: -1.0, bossBack: 5.2, bossSide: 2.0, lookY: 1.7, fov: 60, turn: 0.5, lookMix: 0.45, bossScale: 2.2, extras: [[-3.2, 3.4], [4.4, 2.6]] },
      '9x16': { fwd: 1.7, dist: 3.0, camY: 0.4, side: -0.3, bossBack: 5.4, bossSide: 0.9, lookY: 2.5, fov: 68, turn: 0.35, lookMix: 0.25, bossScale: 2.5, extras: [[-2.0, 3.0], [2.3, 2.2]] },
      '1x1': { fwd: 1.7, dist: 2.8, camY: 0.45, side: -0.6, bossBack: 5.2, bossSide: 1.4, lookY: 2.0, fov: 62, turn: 0.45, lookMix: 0.35, bossScale: 2.3, extras: [[-2.6, 3.2], [3.2, 2.4]] },
      '2x3': { fwd: 1.7, dist: 2.9, camY: 0.42, side: -0.4, bossBack: 5.3, bossSide: 1.1, lookY: 2.3, fov: 64, turn: 0.4, lookMix: 0.3, bossScale: 2.4, extras: [[-2.2, 3.0], [2.6, 2.3]] }
    },
    logo: { landscape: [0.5, 0.8, 0.26], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.82, 0.44], classic: [0.5, 0.8, 0.36] }
  },

  neon: {
    variant: 'neon',
    families: ['16x9', '9x16', '2x3', '1x1', '4x3'],
    world: 'a night street of Blackout Boulevard: deep violet and near-black walls, the only light the neon of the machine behind him and the amber of his own cannon',
    cast: [
      `${FLUX} Fierce and thrilled: his amber eyes narrowed, a spark of a grin in the tilt of his head.`,
      '- THE NEON MASTER, the one opponent, a BIG robot boss: a jet-black humanoid robot twice Flux\'s height, broad-shouldered, trimmed in hot-pink and violet neon: a floating pink neon HALO ring over its head, pink disc ears, a violet visor band with two round glowing violet eyes, a pink-and-violet core on its chest, and long glowing neon BLADES for forearms. It looms BEHIND Flux: its halo, eyes and one raised blade glow bright enough to read even when the image is tiny, but it stays a step darker than Flux — the threat, not a co-star.'
    ],
    moment: 'THE MOMENT — the charge at its peak. Flux thrusts his arm cannon past the lens; a blazing amber-white energy ball crackles on the muzzle, an instant from firing. Behind him the Neon Master raises a blade to strike. Nothing has landed yet.',
    rules: RULES('deep violet with a hot-pink edge, and the amber-white of the charge', 'deep violet and black'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, a CLOSE-UP. Flux\'s helmet is huge: it fills the centre-left of the frame, from just under the top fifth to below the middle, turned three-quarter to the viewer, his amber eyes looking straight OUT of the picture at whoever is looking at it. His arm cannon comes toward the lower right, foreshortened; the blazing charge on its muzzle is the brightest point of the image and sits a full eighth in from the right edge, whole, never cut by the frame. The Neon Master towers in the upper left behind his helmet. The lower left is dark street and haze. The amber glow rim-lights the white helmet; the rest falls into violet dark.',
      portrait: 'THE SHOT — TALL 9:16, read top to bottom as ONE vertical gesture, NOT a landscape laid on its side. Top third: the Neon Master looming, halo, violet eyes and a raised neon blade, cropped by the top edge. Middle: Flux\'s helmet, huge, nearly the full width, his amber eyes looking straight out at the viewer. Below it his arm cannon comes down and toward the lens, the blazing charge the brightest point of the image, right of centre and whole. The lowest fifth is dark street and haze, nothing else.',
      tall: 'THE SHOT — TALL 2:3, a poster. Upper third: the Neon Master looming behind, halo, violet eyes and a raised neon blade, cropped by the top edge. Centre: Flux\'s helmet, huge, his amber eyes looking straight out at the viewer. Lower right of centre: his arm cannon toward the lens with the blazing charge, the brightest point, whole and an eighth in from the edges. The lowest fifth is dark street and haze, nothing else.',
      square: 'THE SHOT — SQUARE 1:1, a store tile read at 250 px. Fewer things, each bigger: Flux\'s helmet fills the upper-centre two thirds, his amber eyes looking straight out at the viewer; his arm cannon and the blazing charge sit lower right, whole, an eighth in from the edges. The Neon Master is a big dark shape with a pink halo and two violet eyes over his shoulder at the top. The lowest fifth is dark, nothing else.',
      classic: 'THE SHOT — 4:3, a CLOSE-UP for a small tile. Flux\'s helmet fills the centre-left from under the top fifth to below the middle, his amber eyes looking straight out at the viewer; his arm cannon comes toward the lower right with the blazing charge, the brightest point, whole and an eighth in from the right edge. The Neon Master towers in the upper left behind his helmet. The lowest fifth is dark street and haze.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge whole inside the frame · ONE big black-and-pink Neon Master behind him',
    // The plate re-framed per aspect (`__lab.thumb`): the Master moved in behind him where the frame is narrow.
    frames: {
      '9x16': { cam: [0.25, 0.9, -0.2], look: [-0.1, 1.4, -2.6], fov: 58, bosses: [{ id: 'neonMaster', at: [-0.75, 0, -4.3], yaw: 0.3, scale: 2.3, act: 'tele', k: 0.6 }] },
      '2x3': { cam: [0.22, 0.95, -0.45], look: [-0.08, 1.35, -2.6], fov: 54, bosses: [{ id: 'neonMaster', at: [-0.85, 0, -4.3], yaw: 0.3, scale: 2.2, act: 'tele', k: 0.6 }] },
      '1x1': { cam: [0.2, 1.08, -0.95], look: [0.02, 1.2, -2.6], fov: 46, bosses: [{ id: 'neonMaster', at: [-1.3, 0, -4.4], yaw: 0.4, scale: 1.9, act: 'tele', k: 0.6 }] },
      '4x3': { cam: [0.18, 1.1, -1.1], look: [0.0, 1.2, -2.6], fov: 44 }
    },
    // Where the lockup sits on each painted master ([centre x, centre y, width], shares of the image):
    // over dark street or the Master's legs, clear of Flux's visor and the charge, never top-left.
    logo: { landscape: [0.2, 0.8, 0.2], portrait: [0.7, 0.2, 0.4], tall: [0.7, 0.84, 0.36], square: [0.26, 0.86, 0.28], classic: [0.26, 0.8, 0.26] }
  },

  frost: {
    variant: 'frost',
    families: ['16x9'],
    world: 'the Cryo Plant: a hall of deep, saturated blue steel and ice (deep blue, never pale), frost haze low on the floor',
    cast: [
      `${FLUX} Locked on his target: his amber eyes narrowed, teeth-gritted determination in the set of his head.`,
      '- THE FROST MASTER, the one opponent: a humanoid robot a head and a half taller than Flux, in ice-blue and white armour: a crown of ICE SPIKES on a dome helmet, a pale visor with two glowing CYAN eyes, a white oval core on its chest, rounded shoulders with ice-crystal fins, forearms ending in long pointed ice claws, chunky blue boots with white cuffs.'
    ],
    moment: 'THE MOMENT — the shot in flight. Flux has just fired: a blazing amber-white charged shot streaks across the middle of the frame toward the Frost Master, a comet with a trail of sparks; the Frost Master swings an ice claw to meet it, shards of ice flying. An instant before the impact.',
    rules: RULES('deep saturated blue, and the amber-white of the shot', 'deep saturated blue (the pale ice stays on the opponent and at the far edge)'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, a DUEL in profile on a rising diagonal. Flux fills the left third, big, seen three-quarter from the front: braced low, leaning into the shot, cannon arm straight out to the right, his visor and amber eyes turned so the viewer reads them clearly. The amber comet crosses the centre, rising slightly to the right. The Frost Master fills the right third, taller, cropped by the top edge, leaning in from above. Low camera, the floor a simple dark band.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes, white arm cannon, the amber shot in flight · ONE ice-blue Frost Master with a spike crown',
    logo: { landscape: [0.5, 0.82, 0.26], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.5, 0.82, 0.34] }
  },

  vex: {
    variant: 'vex',
    families: ['16x9'],
    world: 'the Vex Fortress: near-black gunmetal walls under a dark crimson sky, red warning light',
    cast: [
      `${FLUX} Small and utterly unafraid: his amber eyes narrowed, chin up at the thing above him.`,
      '- DR. VEX MK-I, the one opponent, the villain: a huge hovering skull-shaped war pod, four times Flux\'s size. A dark gunmetal dome body with a pale blue glass cap on top, two round black eye sockets with a red glow deep inside, a thick glowing RED band around its middle, a white grille of teeth under it, and white cone claws jutting from both sides. Menacing but cartoon: a pompous villain, not a horror.'
    ],
    moment: 'THE MOMENT — defiance. Dr. Vex Mk-I tilts down over Flux, filling the sky, claws spread; Flux, tiny beneath it, has his cannon up and a blazing amber-white charged shot already on its way up at the red band. An instant before it hits.',
    rules: RULES('dark crimson and gunmetal, and the amber-white of the shot', 'dark gunmetal and crimson'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, DAVID AND GOLIATH on a diagonal from lower left to upper right. Flux stands in the lower-left third, full body, seen three-quarter from the front so his visor and amber eyes read clearly, cannon arm raised toward the upper right. The amber shot climbs the diagonal. Dr. Vex Mk-I fills the whole upper right, enormous, cropped by the top and right edges, leaning down at him, its red band and eye sockets glowing. Very low camera. The amber glow rim-lights Flux against the dark.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes, white arm cannon, the amber shot rising · ONE huge dark skull pod with a red band, white teeth and white claws',
    logo: { landscape: [0.6, 0.84, 0.26], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.58, 0.84, 0.34] }
  },

  blaze: {
    variant: 'blaze',
    families: ['16x9'],
    world: 'the Blaze Refinery: a furnace hall in deep red-orange and dark rust, a glow of fire behind, heat haze',
    cast: [
      `${FLUX} Mid-leap and loving it: his amber eyes narrowed and bright, head tilted into the jump.`,
      '- THE BLAZE MASTER, the one opponent: a humanoid robot a head and a half taller than Flux, in red and orange armour with gold trim: a crown of FLAME-shaped crests on its helmet, a visor with two glowing YELLOW eyes, a glowing yellow core on its chest, and both forearms wide furnace CANNONS with glowing orange bores. It stays behind Flux, in the fire, a darker shape against the glow.'
    ],
    moment: 'THE MOMENT — the leap. Flux jumps straight at the viewer out of a wall of fire, one knee up, his arm cannon thrust forward with a blazing amber-white charge on the muzzle; behind him the Blaze Master fires both furnace cannons and the flames curl around the frame. An instant before he shoots.',
    rules: RULES('deep red-orange, and a COOL blue-white rim light on Flux so the white hero pops off the warm fire', 'deep red-orange and dark rust (the bright yellow of the fire stays behind the opponent, never behind Flux\'s helmet)'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, Flux coming AT the viewer. He fills the centre-left, full body in a dynamic leap on a diagonal, the cannon and its blazing charge nearest the lens at centre-right, his visor and amber eyes looking straight out at the viewer. The Blaze Master stands in the right third behind him, darker, wreathed in fire, cropped by the top edge. Flames sweep in a curve from the right and behind toward the charge.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge · ONE red-and-orange Blaze Master with a flame crest',
    logo: { landscape: [0.5, 0.84, 0.26], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.5, 0.84, 0.34] }
  },

  // ── #176: four more, on the pattern that scored best in #120 (neon, blaze,
  // frost): one big face, a charge at the lens, one Master behind. ──

  volt: {
    variant: 'volt',
    families: ['16x9'],
    world: 'the top of the Volt Tower in a thunderstorm: a deep electric-violet night sky torn by yellow lightning, dark navy steel below',
    cast: [
      `${FLUX} Fierce and electrified: his amber eyes narrowed, head tilted up at the storm.`,
      '- THE VOLT MASTER, the one opponent, a BIG robot boss: a humanoid robot twice Flux\'s height in YELLOW and VIOLET armour: a violet dome helmet with a jagged yellow LIGHTNING-BOLT crest on top, a dark visor with two round glowing white-cyan eyes, a violet ring core with a cyan centre on its chest, round violet shoulder pads, and both fists balls of crackling cyan-white electricity. It hovers above and behind Flux in the lightning, a step darker than him: the threat, not a co-star.'
    ],
    moment: 'THE MOMENT — the storm breaks. The Volt Master hurls a forked lightning bolt down from above; Flux, low and close, thrusts his arm cannon up past the lens with a blazing amber-white charge on the muzzle, an instant from firing into it.',
    rules: RULES('deep electric violet, and the amber-white of the charge against a thin yellow lightning fork', 'deep violet and navy night'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, a LOW CLOSE-UP. Flux\'s helmet is huge in the centre-left, from under the top fifth to below the middle, three-quarter to the viewer, his amber eyes looking straight OUT at whoever is looking at the picture. His arm cannon angles up toward the upper right, foreshortened; the blazing charge on its muzzle is the brightest point of the image and sits an eighth in from the edges, whole. The Volt Master hangs in the upper right behind, big, cropped by the top edge, a lightning fork from its fist toward Flux. The lower strip is dark steel and haze.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge whole inside the frame · ONE big yellow-and-violet Volt Master with a lightning crest',
    logo: { landscape: [0.2, 0.82, 0.22], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.26, 0.82, 0.3] }
  },

  magnet: {
    variant: 'magnet',
    families: ['16x9'],
    world: 'the Polarity Works: a dark steel foundry, deep navy blue walls, giant red and blue induction coils glowing in the dark behind',
    cast: [
      `${FLUX} Straining and defiant: his amber eyes narrowed hard, leaning against the pull.`,
      '- THE MAGNET MASTER, the one opponent, a BIG robot boss: a broad humanoid robot twice Flux\'s height in cobalt-BLUE armour: two upright horseshoe-magnet horns on its dome helmet, one tipped RED and one tipped BLUE, a dark visor with two round glowing white eyes, a grey round core on its chest, heavy blue shoulders, and forearms ending in big magnet clamps, one glowing red and one glowing blue. Behind Flux and to the right: the threat, a step darker than him.'
    ],
    moment: 'THE MOMENT — the pull. The Magnet Master drags Flux toward itself: bolts, nuts and scrap fly past him in a stream toward its red and blue clamps, curved magnetic field lines glowing in the air; Flux digs his boots in, sparks spraying off the floor, his arm cannon swung round past the lens with a blazing amber-white charge, an instant from firing back point-blank.',
    rules: RULES('deep navy blue with ONE red pole and ONE blue pole glow, and the amber-white of the charge', 'deep navy and dark steel'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, a CLOSE three-quarter shot. Flux fills the centre-left from the top fifth to the bottom, leaning hard to the left against the pull, three-quarter to the viewer so his visor and amber eyes read clearly and look out of the picture. His arm cannon comes toward the lens at lower centre-right with the blazing charge, the brightest point, whole and an eighth in from the edges. The Magnet Master looms in the right third behind, big, cropped by the top edge, its red and blue clamps reaching; a stream of flying bolts and scrap curves from behind Flux toward it.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge · ONE big cobalt-blue Magnet Master with red and blue horseshoe horns',
    logo: { landscape: [0.2, 0.84, 0.22], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.24, 0.84, 0.3] }
  },

  drill: {
    variant: 'drill',
    families: ['16x9'],
    world: 'the Deep Mine: a dark rock cavern in deep brown and charcoal, warm amber work lamps far off, a burst of dust and boulders',
    cast: [
      `${FLUX} Mid-jump and startled into fury: his amber eyes wide then narrowing, head snapped round toward the viewer.`,
      '- THE DRILL MASTER, the one opponent, a BIG robot boss: a heavy humanoid robot twice Flux\'s height in ORANGE and BLACK armour with hazard-yellow trim: a huge grey spinning DRILL BIT spike on top of its helmet, a dark visor with two round glowing yellow eyes, a yellow round core on its chest, black shoulder plates, and both forearms giant grey cone DRILLS. It is bursting UP out of the cracked floor behind Flux, rock and dust exploding around it.'
    ],
    moment: 'THE MOMENT — the eruption. The floor cracks open and the Drill Master bursts up behind Flux, boulders flying; Flux has leapt clear and spins in mid-air toward the viewer, arm cannon thrust past the lens with a blazing amber-white charge on the muzzle, an instant from firing.',
    rules: RULES('deep brown and charcoal with an orange accent on the boss, and a COOL blue-white rim light on Flux so the white hero pops off the warm rock', 'deep brown rock and charcoal dust (never pale dust behind Flux\'s helmet)'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, Flux coming AT the viewer. He fills the centre-left, full body in a dynamic mid-air leap on a diagonal, the cannon and its blazing charge nearest the lens at centre-right, an eighth in from the edges, his visor and amber eyes looking straight out at the viewer. The Drill Master erupts from the floor in the right third behind him, big, its drill crest cropped by the top edge, boulders and dust flying outward from it in a burst that frames Flux.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge · ONE big orange-and-black Drill Master with a drill-bit crest and drill arms, bursting from the ground',
    logo: { landscape: [0.2, 0.84, 0.22], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.24, 0.84, 0.3] }
  },

  rotor: {
    variant: 'rotor',
    families: ['16x9'],
    world: 'Rotor Run at dusk: a high rooftop helipad, a deep teal-to-indigo dusk sky with a last orange glow at the horizon, city lights far below',
    cast: [
      `${FLUX} Grinning in his eyes, fearless: his amber eyes narrowed and bright, head tilted up and back at the attackers.`,
      '- THE ROTOR MASTER, the one opponent, a BIG robot boss: a humanoid robot twice Flux\'s height in LIME-GREEN and BLACK armour: a spinning lime-green ROTOR disc over its dome helmet like a halo, a dark visor with two round glowing white eyes, a pale-green round core on its chest, and long white rotor BLADES held like swords in both hands. It dives from the sky above and behind Flux, three small lime-green rotor drones diving with it.'
    ],
    moment: 'THE MOMENT — the dive. The Rotor Master swoops down out of the dusk sky with its drone swarm; Flux, low and close, swings his arm cannon up past the lens with a blazing amber-white charge on the muzzle, an instant from firing at them.',
    rules: RULES('deep teal and indigo dusk with a lime-green accent on the boss, and the amber-white of the charge', 'deep teal-indigo dusk sky (the orange horizon glow stays low and far, never behind Flux\'s helmet)'),
    shots: {
      landscape: 'THE SHOT — WIDE 16:9, a LOW CLOSE-UP. Flux\'s helmet is huge in the centre-left, from under the top fifth to below the middle, three-quarter to the viewer, his amber eyes looking straight OUT of the picture. His arm cannon angles up to the right, foreshortened, with the blazing charge, the brightest point, whole and an eighth in from the edges. The Rotor Master dives in the upper right behind, big, cropped by the top edge, its blades swept back; the three small drones trail it. The lower strip is dark rooftop and haze.'
    },
    check: 'Flux with a ROUND white helmet, black visor, round amber eyes looking at the viewer, white arm cannon with the charge · ONE big lime-green-and-black Rotor Master with a rotor halo, plus three small drones',
    logo: { landscape: [0.2, 0.84, 0.22], portrait: [0.5, 0.86, 0.6], tall: [0.5, 0.85, 0.56], square: [0.5, 0.84, 0.44], classic: [0.24, 0.84, 0.3] }
  }
}

// ── Which scenario ──────────────────────────────────────────────────────────

/** The family painted first; the others are painted to match its master. */
const LEAD = '16x9'
/** The cover the store pages use (the comparison's winner, store-art/cover-research.md). */
const SHIPPED = 'neon'
const ID = opt.scenario ?? SHIPPED
const SC = SCENARIOS[ID]
if (!SC) throw new Error(`--scenario ${ID}: no such scenario (${Object.keys(SCENARIOS).join(', ')})`)
// The first cover keeps its files where they were; every other scenario has its own folder.
const SDIR = SC.legacy ? DIR : join(DIR, ID)
const PAINTED = SC.legacy ? join(DIR, 'painted') : join(DIR, 'painted', ID)
const families = (opt.only ? opt.only.split(',') : SC.families).filter((f) => FAMILIES[f] && SC.families.includes(f))
if (!families.length) throw new Error(`scenario ${ID} has none of these families (it has ${SC.families.join(', ')})`)
const plateOf = (f) => join(SDIR, `cover-${f}.png`)
const masterOf = (f) => join(PAINTED, `cover-${f}.jpg`)

// ── The prompt ──────────────────────────────────────────────────────────────

const promptFor = (f) => {
  const fam = FAMILIES[f]
  const [w, h] = fam.plate
  const shot = SC.shots[fam.shape]
  if (!shot) throw new Error(`scenario ${ID} has no shot for ${fam.shape} (${f})`)
  return `Create a brand-NEW image (do not edit the attached picture — it is only a reference for who is in the scene): ONE finished key-art cover illustration for a video game — a single full-bleed illustration, ${w}×${h} px (${f.replace('x', ':')}), PNG, edge to edge, with NO text, NO letters, NO title, NO logo, NO numbers, NO UI, NO buttons, NO borders or frames.

WHAT IT IS NOT: not a comic page, not a screenshot, not a collage of panels, not a character sheet, not the attached plate with filters on it. Nothing written anywhere: the store page sets the game's name over the cover itself.

READ THE ATTACHED PLATE. It is a render from the game itself. TAKE from it: who is in the scene, what each one looks like (shapes, colours, proportions, outlines), roughly where each stands, and the world (${SC.world}). CHANGE everything else: the plate is stiff, evenly lit and posed like a toy on a shelf — the job is to turn it into an explosive, dramatic poster.

WHO IS IN IT — keep these designs exactly, they are the game's characters:
${SC.cast.join('\n')}

${SC.moment}

${SC.rules}

${shot}

STYLE: the game's own look pushed to premium key art — bright, glossy, toy-like 3D cartoon rendering with clean thick dark-navy outlines, smooth soft shading, saturated primaries, crisp specular highlights, cinematic lighting and atmosphere (glow, sparks, motion blur on flying debris). This image is NOT composited over anything: it IS the floor, the light and the shadows, out to all four edges — cast shadows, contact shadows and a vignette are welcome.

CHECK BEFORE YOU ANSWER: exactly ONE image · ${w}×${h}, ${f.replace('x', ':')} · ${SC.check} · Flux has NO mouth, no nose, no teeth: a black visor with two amber eyes, nothing else · no text, no letters, no numbers, no logo, no UI, no frame anywhere.

OUTPUT: one PNG image, ${w}×${h} px, aspect ${f.replace('x', ':')}, full bleed.`
}

const writeDoc = () => {
  const doc = [`# Promotion covers — prompts (${ID})`, '', 'Written by `pnpm art:promotion`. Attach `cover-<aspect>.png` with each prompt.', '']
  for (const f of SC.families) doc.push(`## cover-${f}`, '', '```text', promptFor(f), '```', '')
  // The first cover's document keeps its old name; the others sit in their scenario's folder.
  writeFileSync(join(SDIR, SC.legacy ? 'PROMPTS-promotion.md' : `PROMPTS-${ID}.md`), doc.join('\n'))
}

// ── Plates (optional re-stage from a running dev server) ───────────────────

mkdirSync(SDIR, { recursive: true })
mkdirSync(PAINTED, { recursive: true })
if (opt.plates) {
  if (!opt.url) throw new Error('--plates needs --url <dev server>, e.g. --url http://localhost:5173/')
  for (const f of families) {
    const [w, h] = FAMILIES[f].plate
    const r = SC.legacy
      ? spawnSync(process.execPath, [join(ROOT, 'tools', 'promotion', 'stage.mjs'), opt.url, String(w), String(h), plateOf(f), join(ROOT, 'tools', 'promotion', 'stage-scene.js')], {
        stdio: 'inherit', env: { ...process.env, PLATE: JSON.stringify(SC.stage[f]) }
      })
      // The composition view, re-framed for this aspect where the scenario says how.
      : spawnSync(process.execPath, [join(ROOT, 'tools', 'promotion', 'plate.mjs'), opt.url, SC.variant, String(w), String(h), plateOf(f), ...(SC.frames?.[f] ? [JSON.stringify(SC.frames[f])] : [])], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`staging ${ID} ${f} failed`)
  }
}

writeDoc()
for (const f of families) if (!existsSync(plateOf(f))) throw new Error(`no plate ${rel(plateOf(f))} — run with --plates --url <dev server>`)

if (opt.dry) {
  console.log(`prompt document for ${ID}: ${rel(SDIR)}`)
  process.exit(0)
}

// ── Paint ───────────────────────────────────────────────────────────────────

const todo = families.filter((f) => opt.force || !existsSync(masterOf(f))).sort((a, b) => Number(b === LEAD) - Number(a === LEAD))
let stopped = null
if (!opt['no-generate'] && todo.length) {
  const { loadConfig } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'config.mjs')).href)
  const { Gemini } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'gemini.mjs')).href)
  const { ledger } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'usage.mjs')).href)
  const cfg = loadConfig(ROOT)
  let g = cfg.gemini
  if (opt.profile) {
    const { homedir } = await import('node:os')
    const profileDir = join(homedir(), '.art-desk', 'profiles', opt.profile)
    g = { ...g, profileDir, usageFile: join(profileDir, 'art-desk-usage.json') }
  }
  const { countGeneration, usedToday } = ledger(g.usageFile)
  const painter = new Gemini({
    root: ROOT, profileDir: g.profileDir, url: g.url, chrome: g.chrome, chromeArgs: g.chromeArgs,
    log: (line, level) => console.log(`    ${level === 'err' ? '! ' : ''}${line}`)
  })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  console.log(`painting ${todo.length} cover master(s) of ${ID}  (${usedToday()} generations today, cap ${g.dailyCap})`)
  for (const [i, f] of todo.entries()) {
    if (usedToday() >= g.dailyCap) { stopped = 'daily cap reached'; break }
    if (i > 0) await sleep(Math.round(g.gapSeconds + Math.random() * g.jitterSeconds) * 1000)
    console.log(`  → ${ID} cover-${f}`)
    let attempt = 0
    for (;;) {
      let last = ''
      try {
        // A JPEG copy as a character REFERENCE: a big PNG attached as the
        // main image reads as an edit request and Gemini refuses or errors.
        const ref = join(SDIR, `ref-${f}.jpg`)
        await sharp(plateOf(f)).resize({ width: 1280, height: 1280, fit: 'inside' }).jpeg({ quality: 88 }).toFile(ref)
        // One image in every format: once the landscape master exists, the
        // other aspects are painted with it attached as the look to match
        // (portals ask for covers that are recognisably the same picture).
        const lead = f !== LEAD && existsSync(masterOf(LEAD)) ? join(SDIR, `look-${LEAD}.jpg`) : null
        if (lead) await sharp(masterOf(LEAD)).resize({ width: 1280, height: 1280, fit: 'inside' }).jpeg({ quality: 90 }).toFile(lead)
        const prompt = lead
          ? `${promptFor(f)}

TWO IMAGES ARE ATTACHED. The first is the plate (who and where). The second is the FINISHED landscape cover of this same scene: match it exactly in painting style, palette, lighting and in how Flux and his opponent look — it must read as the same artwork — but RECOMPOSE it for this aspect as THE SHOT says. Do not crop or stretch it.`
          : promptFor(f)
        const { bytes } = await painter.paint({
          refFile: null, styleFiles: lead ? [ref, lead] : [ref], prompt, timeoutMs: g.timeoutSeconds * 1000,
          onPhase: (phase, quiet) => { if (!(quiet && phase === last)) { last = phase; console.log(`    ${phase}`) } }
        })
        const dest = masterOf(f)
        if (existsSync(dest)) {
          const to = join(PAINTED, 'replaced', `cover-${f}.${Date.now()}.jpg`)
          mkdirSync(dirname(to), { recursive: true })
          renameSync(dest, to)
        }
        // Stored as JPEG whatever came back (the free web app returns JPEG anyway).
        await sharp(bytes).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(dest)
        countGeneration()
        console.log(`    ✓ ${rel(dest)}`)
        break
      } catch (e) {
        if (e.counted) countGeneration()
        console.log(`    ! cover-${f} failed: ${e.code ?? ''} ${e.message}`)
        if (['QUOTA', 'SIGNED_OUT', 'CONSENT', 'BROWSER'].includes(e.code)) { stopped = `${e.code}: ${e.message}`; break }
        if (++attempt <= g.retries && ['NO_IMAGE', 'TIMEOUT'].includes(e.code)) { console.log('    re-rolling once'); continue }
        break
      }
    }
    if (stopped) break
  }
  if (!opt['keep-window']) await painter.closeWindow().catch(() => {})
}

// ── Cut + logo + compress ───────────────────────────────────────────────────

/** The logo lockup `width` px wide, and a soft navy shadow for it (as scripts/render-thumbnail.mjs lays it on). */
const lockup = async (width) => {
  // The lockup's viewBox is 300 wide: rasterise at twice the size, then scale down.
  const logo = await sharp(readFileSync(LOCKUP), { density: Math.ceil((72 * width * 2) / 300) }).resize(width).png().toBuffer()
  const { height } = await sharp(logo).metadata()
  const blur = Math.max(2, Math.round(width * 0.02))
  const pad = blur * 3
  const a0 = await sharp(logo).extractChannel(3).png().toBuffer()
  const alpha = await sharp(a0)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .blur(blur).linear(0.75, 0).toColourspace('b-w').png().toBuffer()
  const shadow = await sharp({ create: { width: width + 2 * pad, height: height + 2 * pad, channels: 3, background: '#0b0e24' } })
    .joinChannel(alpha).png().toBuffer()
  return { logo, shadow, height, pad, drop: Math.round(width * 0.014) }
}

/**
 * `png` (w × h) with the lockup laid on: centred at (cx, cy) of the image,
 * `wk` of its width, kept a tenth of the short side off every edge — so it
 * is never in a corner, and never hard against the bottom.
 */
const withLogo = async (png, w, h, [cx, cy, wk]) => {
  const margin = Math.round(Math.min(w, h) * 0.1)
  const width = Math.max(48, Math.min(Math.round(w * wk), w - 2 * margin))
  const L = await lockup(width)
  const left = Math.max(margin, Math.min(w - margin - width, Math.round(w * cx - width / 2)))
  const top = Math.max(margin, Math.min(h - margin - L.height, Math.round(h * cy - L.height / 2)))
  return sharp(png).composite([
    { input: L.shadow, left: left - L.pad, top: top - L.pad + L.drop },
    { input: L.logo, left, top }
  ]).png().toBuffer()
}

if (opt['no-cut']) {
  if (stopped) { console.log(`stopped: ${stopped}`); process.exit(1) }
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const written = []
for (const f of families) {
  const fam = FAMILIES[f]
  const painted = existsSync(masterOf(f))
  const src = painted ? masterOf(f) : plateOf(f)
  // `trim`: a painted master that came back with a drawn frame loses its
  // outer edge (a share of each side) before the cut — no frames on a cover.
  const meta = await sharp(src).metadata()
  const t = painted ? (fam.trim ?? 0) : 0
  const box = { left: Math.round(meta.width * t), top: Math.round(meta.height * t), width: Math.round(meta.width * (1 - 2 * t)), height: Math.round(meta.height * (1 - 2 * t)) }
  for (const [w, h] of fam.out) {
    const bare = await sharp(src).extract(box).resize(w, h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).png().toBuffer()
    const logo = await withLogo(bare, w, h, SC.logo[fam.shape])
    for (const [name, buf] of [[`${w}x${h}`, bare], [`${w}x${h}-logo`, logo]]) {
      const jpg = join(OUT, `${name}.jpg`)
      const webp = join(OUT, `${name}.webp`)
      await sharp(buf).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(jpg)
      await sharp(buf).webp({ quality: 92, smartSubsample: true }).toFile(webp)
      written.push(jpg, webp)
    }
    console.log(`  ${painted ? 'painted' : 'PLATE (not painted yet)'} ${ID} ${f} → ${w}x${h} (.jpg .webp, bare and -logo)`)
  }
}
if (written.length) {
  // Absolute: the compressor resolves --only from its own working directory.
  const only = written.flatMap((p) => ['--only', p])
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'compress-images.mjs'), OUT, '--backup-dir', 'promotion-backup', '--fresh', ...only], { stdio: 'inherit', cwd: ROOT })
  if (r.status !== 0) console.log('! compression failed — the deliverables stand uncompressed')
}
if (stopped) { console.log(`stopped: ${stopped}`); process.exit(1) }
