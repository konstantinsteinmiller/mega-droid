# The bot ("cmpnc")

A player that plays Mega Droid for you: tutorial → the Scrapper → the lab →
the Blaze Master's stage → the lab → the Frost Master's stage, then it stops.
Typed `cmpnc` anywhere, or 30 taps on the mute button inside 30 seconds
(`use/devCheats.ts`; absent from the Poki and Playgama builds). The same again
turns it off. It marks the save as cheated (no leaderboard score).

It is **closed loop**: it reads the mission's state every frame and presses what
a player presses. It never teleports and never damages anything for Flux. It
works from wherever the player is (a resume, a checkpoint, a retry): a route is
written from the CURRENT state, never from "the start of the level".

## Pieces

| | |
|---|---|
| `hook.ts` | the one seam: `Mission.update` calls `botHook.driver.drive()` before it reads input |
| `autopilot.ts` | the driver: clears holds, skips freeze-frames, runs `reflex`, gives the route one turn; a thrown `BotStuck` restarts the route from the current state |
| `ctx.ts` | the bot's hands (`Ctx`): `goto`, `kill`, `chargeShot`, `clearRoom`, `face`, `steer`, `slide`, `press`, `wait`, `until`, `foes`, `sees` |
| `reflex.ts` | block a telegraphed hit, slide out of a red ring, drink a tank |
| `routes/` | one generator per level. `tutorial.ts` is the worked example; `boss.ts` has a generic Master fight (`fightBoss`) and the exit run (`afterBoss`) |
| `index.ts` | the director: cutscenes, results, defeat, the lab, the next stage (`startMission(storyFor(...))`) |
| `view.ts` | what the bot reads of a `Mission` (the private fields it looks at anyway) |

A route is a generator: `export function* blazeRoute(c: Ctx): Task { … yield* c.goto(x, z) … }`.
Every `yield` ends the bot's turn for this frame. Holds (stick, fire, block) are
cleared each turn: a helper that returns lets go of everything it held. Edges
(`firePressed`, `slideQueued`, `interactQueued`…) last one step.

## The controls (what the bot can press)

- stick: `input.moveX` (strafe right) / `moveY` (forward), relative to where Flux
  faces; look = write `player.yaw` / `player.pitch` (`c.face`, `c.aimAt`). A shot
  flies where the CAMERA points — `c.face` syncs it (a headless run never renders).
- fire: press = a quick shot; HOLD then release = a charged shot (level 1 at
  0.55 s, level 2 at 1.2 s). Charged shots break crates and shield-guards and
  pop training drones; quick shots TINK off guards.
- block (`blockHeld`, `blockPressed`): stops a blockable hit; a press right
  before the hit is a parry. Red-ring attacks (`enemy.teleRed`) cannot be blocked.
- slide (`slideQueued`): a dash with i-frames (15 m/s for 0.28 s) in the stick's
  direction. On a stage it is also the **dash leap** over a one-cell gap (equal
  floors), and the wall kick on a wall-kick shaft.
- interact (`interactQueued`): chests, a sealed boss shutter (or shoot/block it
  facing it), a stranded bot. Ladders: walk into the wall under them.
  Lifts: stand on the platform and it carries you. Stairs/ramps walk by themselves.
- weapons: `weaponQueued = 1 | 2` fires a special weapon slot (copied from a
  fallen Master); `tankQueued` drinks a repair tank.
- Flux has no jump. Falling off a ledge into lava/a pit costs health and puts
  him back on the ledge (a checkpoint after the first).

## How the levels are built

- `world/stages/<sector>.ts` — each file's header comment lists its sections
  (a roof, catwalks over lava, vents on a rhythm, rolling barrels, hammers, a
  drop shaft, a lift, a checkpoint, a secret, the boss shutter, the arena).
  Deterministic from the seed: the layout is mirrored, the vents' beat and the
  barrels' rhythm vary — the ROUTE does not.
- `world/nav.ts` — `findPath` (walk-only A*), `walkStep`, `floorAt`; a terrain
  map has floors at different heights (`map.terrain`: floor, ramp, pit, ladders,
  lifts, crushers, lanes, checkpoints).
- `sim/climb.ts` — the stage's own body: ladders, lifts, the dash leap, the
  wall kick, vents, hammers, barrels (read `ClimbRun`).
- The mission: `sim/mission.ts` (private fields are read through `view.ts`).
  After the Master falls: a weapon lesson room, then the lit pedestal beams Flux
  out (`afterBoss` in `routes/boss.ts`; see `tests/game/exitPedestal.test.ts`).
- The tutorial's goal comes from `walk.goal()`; a stage has no such helper — the
  yellow trail uses `findPath(..., links = true)` (ladder/lift hops).

## The harness (headless, virtual time, deterministic)

```
BOT_LEVEL=blaze BOT_SECONDS=900 BOT_TRACE=1 \
  node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- \
  npx vitest run tests/bot/playthrough.test.ts
```

`BOT_LEVEL` tutorial | a sector id (its story stage), `BOT_SECONDS` game
seconds (default 600; a run takes ~1 real second per 10 game seconds),
`BOT_LEVELUP` the hero's level (default: tutorial 1, a stage 6), `BOT_TRACE=1`
prints the bot's lines and a position/hp/boss sample every 5 s, `BOT_SEED` seeds
`Math.random` (a run is repeatable), `BOT_ROUTE=<file>` tries a route module that
exports `route`. The verdict is `boss.state === 'dead'`. A passing run prints
nothing: add `--reporter=verbose` or read the failure's lines.

**Rules for a route**

1. Closed loop and state-based: pick the next segment from where Flux IS (his
   position / floor / room), so it works from a checkpoint after a death.
2. Only press things; no teleport, no god mode, no editing `player` position.
3. `BotStuck` is for "I made no progress": throw it, the autopilot restarts
   the route from the current state.
4. Make it robust to the seed's mirrored layout (read positions from the map /
   the enemies / `climb.t`, never hard-code coordinates of one seed) — the live
   game plays whatever seed the quest rolled.
5. The same inputs from the same state give the same result: no `Math.random`
   in a route.
