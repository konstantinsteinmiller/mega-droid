# Mega Droid

A casual first-person **action-exploration** game for the web. You play
Flux, a pearl-white combat android with amber eye-lights behind a dark
visor and a cannon for a forearm. You beam into machine-infested sectors,
explore rooms and corridors, blast rogue robots with a charge buster, open
supply chests, finish missions, level up and wire your skill circuits.
Beating a sector's Core Master copies its special weapon.

It follows the Blades-style exploration loop (maps, enemies, quests,
leveling, skills) without the town building and the endless dungeon, with
the chibi proportions of late-80s / early-90s console action games, rebuilt
as rounded low-poly models.

Built with Vue 3 + TypeScript + three.js. It ships to CrazyGames, Playgama
(and YouTube Playables through it), Poki, GamePix, GameMonetize,
GameDistribution, Yandex, Glitch, itch.io and Wavedash from one codebase.

---

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:2194 (check the tab title says "Mega Droid")
pnpm test         # 458 unit, integration and simulation tests
pnpm type-check   # vue-tsc
pnpm build        # type-check + production build
pnpm build:crazy-web | build:playgama | build:poki | build:gamepix | …
pnpm playgama:audit # YouTube Playables fit audit of the Playgama archive
```

`build:playgama` writes its own folder, never `dist/`:
`dist-playgama/mega-droid-playgama.zip` (a real PKZIP of
`dist-playgama/game/`), which is also the YouTube Playables submission. Its
release gates (`tools/playgama-release/`) fail the build if another portal, dev
tooling or an external host ships in it.

The game starts right in the first mission. There is no menu.

### Playtests and the level lab

```bash
pnpm dev:playtest                  # http://127.0.0.1:2195, no HMR, no reloads
pnpm dev:playtest -- --port 44123
```

`pnpm dev` pushes every file edit into the open page, and a full reload in the
middle of a fight loses the run. For playtests (by hand or by a bot, while
someone else edits the tree) use `dev:playtest`: the same Vite config with HMR
and the file watcher off, and the live leaderboard blanked
(`VITE_LEADERBOARD_URL` / `VITE_LEADERBOARD_SECRET` are in `.env`, so a
finished test mission would otherwise post a real score). Modules already
loaded stay as they were; restart the server and reload to pick up edits.

`#/levels` is the dev-only level lab. Its Play button, or an address typed by
hand, `#/?level=stage&sector=magnet&seed=0&plevel=19`, boots straight into
that level, ahead of a resume point and ahead of the first-run intro and
tutorial, also on a fresh browser profile. It plays on a save sandbox: nothing
it does is written. Changing the address to another level in the same tab
reloads the page.

## Highlights

- **No art payload.** Flux, 7 machine archetypes, 6 Core Masters, NPCs and
  props are rounded low-poly rigs built in code, with toon shading and
  inverted-hull outlines. Levels are procedural sector maps. The only bitmaps
  are the app icons.
- **Synthesized audio.** Around 40 chiptune SFX recipes and a procedural
  composer, one original track per sector. All of it runs on one shared
  AudioContext, so the ad, pause and mute gates cover everything.
- **Drop-in overrides.** A file named after a sound, a music track or a level
  texture replaces the procedural version at build time, with no code change.
  See [`sound-todo.md`](./sound-todo.md) and [`art-todo.md`](./art-todo.md).
- **Combat:** shoot on press, charge while held (with a perfect-release
  window), shield block and a timed parry, slide with i-frames, soft lock-on.
  Telegraph rings: orange = block, white = parry window, red = dodge.
- **Progression:** XP levels with a stat pick, three skill circuit boards
  (18 nodes), gear in 6 sockets with rarities and affixes, Workshop
  upgrades, special weapons that rank up with use.
- **One save blob** (`mega_droid_state`) behind a SaveManager with
  per-portal cloud strategies, including a resumable mid-mission snapshot.
  Saves from before the rename (`mega_adventure_*` keys) move onto the new
  keys once, on boot and on the first cloud read (`src/legacyKeys.ts`).
- **39 languages** (the Playgama + Wavedash portal set), including RTL Arabic, Greek and Simplified + Traditional Chinese, with a parity test.

## Where things are

| Path | What |
| --- | --- |
| `src/game/engine` | renderer, the single fixed-step loop, input |
| `src/game/models` | the procedural rigs and the rounded-shape kit |
| `src/game/world` | map generator, navigation (A*, line of sight), level meshes, textures |
| `src/game/sim` | the mission (player, AI, bosses, weapons, objectives) and the hub |
| `src/game/data` | enemies, skills, items, weapons, sectors, quests, progression |
| `src/game/audio` | synth SFX and the music sequencer |
| `src/game/flow.ts` | mission start / finish, rewards, the ad break before results |
| `src/components/hud`, `hub`, `modals` | the Vue UI |
| `src/platforms`, `src/utils/save`, `src/use/useAds*` | portal SDKs, saves, ads |

## Docs

- [`GDD.md`](./GDD.md): the design.
- [`game-implementation-plan.md`](./game-implementation-plan.md): build order
  and resume notes.
- [`PERF-LEDGER.md`](./PERF-LEDGER.md): measured perf changes and the
  procedure (`scripts/perf-mission.mjs`).
- `scripts/portal-qa.mjs`: portal-signal checks on a BUILT bundle (mute at
  boot, unmute, tab-away freeze, menu entry) with a stubbed SDK.
- [`description.md`](./description.md): store copy.
- [`store-art/poki/`](./store-art/poki/README.md): the Poki thumbnail,
  rendered from the rig (`node scripts/render-thumbnail.mjs`).

## Originality

Every character, enemy, level, name, tune and sound is original. The look is
a homage to an era, not a copy of any game.
