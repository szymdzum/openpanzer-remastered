# Refactoring the engine

Goal: a solid core before the fixes (ROADMAP section 4, the `bug` issues) and the bigger things
(AI arena #46, LLM general #45). A refactor changes how the code is written, never what the game
does. Bugs found on the way become issues (label `bug`), they are not fixed in a refactor.

This plan was reworked after an investigation of the whole engine (2026-10-21, bugs #68-#83).
The rules code (gamerules, unit, ai) is in good shape and well pinned. The cost and the risk sit
in four places, and the roadmap runs into all of them: the game flow lives in the UI's animation
callbacks (and in a copy of it in the contract), the engine reads UI and global state, the fog
and zone of control counters are kept by hand and drift, and save/load and the campaign
transition lose data.

## The safety net

| Check | Time | Catches |
|---|---|---|
| `npm run check` | seconds | types |
| `npm test` | ~8 s | the contracts: 3 × 13 game states recorded on the reference |
| `npm run verify` | 3-4 min | the whole game in Chrome against openpanzer-src: 16 AI vs AI replays, 24 UI scripts, state, DOM and pixels |
| CI (`ci.yml`) | ~30 s | check and test on every push |
| Mutation testing (`mutation.yml`) | hours, on GitHub | whether the tests notice small changes, per module |

The rule: **a refactor re-records nothing.** If a contract or a replay changes, the behavior
changed: stop, find out why, and either restore it or make it a separate, deliberate commit.
The one planned exception is step 0's re-recording on the unchanged reference.

The contracts (README, Verification): `gamerules` (every rule), `unit` (every Unit method),
`engine` (the AI and random player actions playing 2 turns through Map, Unit, GameRules,
Leaders and Scenario, a hash of the whole state after each step, then the campaign functions and
hashes of the saved game, the combat log and the equipment data).

Coverage: 89.6% of statements over the 9 files in `coverage.include`, but 75.2% over all engine
files. Covered only by verify: game.ts (15%), gamestate.ts (27%), scenarioloader.ts (1.4%),
campaign.ts (1.2%), aiscripted.ts (9.4%), the UI. These are the files steps 1 and 3 rewrite.

Rhythm: small steps; `check` and `test` after each, `verify` before each commit.

## The plan

### 0. The safety net first (test/ only, no src/ changes)

- **Align the engine contract with the game.** The driver (`test/contracts/engine.contract.js`)
  plays a different order than the game: the AI plans inside `Map.endTurn` (map.ts:1043),
  before `deployReinforcements` (game.ts:169); the driver plans after (42 reinforcements in 9
  of 13 fixtures). It also has no victory checks and a fixed `spotSide`. Make it follow
  game.ts (a real AI handler, `spotSide` per turn as `setCurrentSide` does, `checkVictory` and
  `hasAliveUnits` after each attack and move), add capture, wipe-out, mud and map-edge drills,
  and add the scenario date, `dayTurn`, the reinforcement count and an equipment hash to
  `stateString`. Re-record `engine` on the unchanged reference, in its own commit. This is the
  only re-recording of the refactor.
- **Self-recording:** `UPDATE_CONTRACTS=1 npm test` writes `actual` back into the fixtures, so
  a deliberate fix can record the remaster's own behavior (`record.sh` can only record the
  reference, which still has the bug). Only in commits that name the issue they fix; the
  refactor never runs it.
- **Invariant tests** over the 13 fixtures: spotting and zone of control counters equal a
  recomputation, hex and unit point at each other, `unit.player === map.getPlayer(owner)`.
  Known bugs (#68, #72, #73, #74, #75) are `test.fails`; a fix flips them. They turn "the hash
  differs" into "a defect was removed or added".
- **Lifecycle and save tests:** a ScenarioLoader contract from the `-t0` fixtures (their state
  is the reference's export right after `newScenario`), a GameState round trip in jsdom
  (`restore(export(restore(s)))`, failing today on the fields of #54, #55, #71 and #83: mark
  those `test.fails`), a campaign state and the tutorial (AIScripted) in `record.sh` STATES
  (`record.js:13` forces `campaign = null` today), every engine file in `coverage.include`.
- **The harness surface:** a static test that the identifiers `harness/` and `test/contracts`
  use exist in the module exports and the listed `game.*` / `game.ui.*` members.

### 1. Engine out of the UI (one after the other)

The combat sequence lives in `src/ui.ts`, in the animation code: `uiUnitAttack` (support fire,
the attack, attack stopped) and `uiAttackAnimationFinished` (destroyed units removed, retreat or
surrender, selection refresh, elimination victory), `uiUnitMove` and `uiMoveAnimationFinished`
(the surprise attack, captures, victory). In `src/game.ts`: `processAction`, `endTurn` and
`deployReinforcements`. Who wins is decided only in the UI.

1. **`moveUnit` off the UI selection.** It finds its path through `moveSelected`
   (map.ts:1166), filled by the caller's `setMoveRange`. Add a pure `pathTo(map, unit, cell)`
   and let the move compute its own range on the same state. Keep the post-move
   `setMoveRange`/`setAttackRange` (`isMoveSel`/`isAttackSel` are hashed and saved). Note:
   `getShortestPath` includes the start cell's cost (#70), keep it.
2. **A new module `src/actions.ts`** (added to main.ts's module list so `?harness` exposes it),
   not methods on GameMap or Scenario: map.ts doesn't change here, so step 2 can start sooner.
   - **The attack in two calls:** `resolveAttack` (today's ui.ts:564-604) and `finishAttack`
     (ui.ts:640-716 without alerts and animations). The UI calls `finishAttack` from the same
     animation callback as now; the contract and a headless AI call both back to back.
   - **Synchronous hooks for the UI** (`onSupportShot`, `onAttack`), fired exactly where
     `R.addAnimation` is called today. The sprite pick (animation.ts:244) and the sound
     variant (aiscripted.ts:510) draw from the same `Math.random` as the dice, between the
     support shots: animating after the whole combat would change the dice and the replays.
   - **Keep the timing.** In the surprise path the AI acts before the attack's finish phase
     (ui.ts:488, 496: `waitUIAnimation` is cleared at once). Keep the `waitUIAnimation` writes
     where they are. Closing that race is a later, deliberate commit.
   - **Result objects:** `AttackResult` (losses, support fire, retreat cell or surrender,
     destroyed units), `MoveResult` (surprise, capture, victory), `deployReinforcements`
     returns the deployed units. The AI's direct call into the UI
     (`game.ui.handleReinforcementDeployment`, ai.ts:150) becomes a hook too.
   - `game.ui.uiUnitAttack` and `uiUnitMove` stay as wrappers with the same return values
     (harness ui-menus.js, ui-context.js).
   - **The contract calls the new functions through a feature check**
     (`env.Actions ? engine : copy`): `record.sh` runs the same driver on openpanzer-src, where
     they don't exist. Identical recordings, now testing the game's code.
   - Keep the bugs: #29 (the selection refresh stays in the UI, the driver guards it), #28 (no
     module-level `map` in actions.ts), #76, #77.
3. **One `checkOutcome()`** for capture, elimination and the turn limit, independent of the
   local side. Game keeps calling the old functions at the same points; checkOutcome is what
   the arena and the contract use. Needs step 0's capture and wipe-out drills.

### 2. After step 1, in parallel (each in its own worktree)

- **RNG seam and a headless engine.** `src/rng.ts` used at the engine's draw sites (dice,
  leaders, AI), defaulting to `Math.random`, every draw at its call site. Move `defined()` out
  of dom.ts; move game.ts's load-time `setInterval` and `addEventListener` into init; an engine
  context instead of the 9 reads of `game.*` (spotSide, campaign, scenario; `unitEndTurn` must
  still see the old `spotSide`); a turn driver instead of `handler.buildActions` inside
  `Map.endTurn`, called at the same point. Locked in by a Vitest test in environment `node`
  that imports the engine.
- **GameMap split behind a facade** (replaces "methods to the prototype, state to `#private`",
  which changes nothing observable and unblocks nothing; `#private` also works against the
  snapshot #36, #46 and #67 need). Extract, each a commit that re-records nothing: a
  Visibility/ZOC component (same calls from the same 16 sites, same counter arithmetic
  including the clamp at 0), a Board API that places, removes and relocates units, the
  Selection (owned by the UI), the undo journal. Moving the remaining `this.m = function`
  methods to the class body can be a mechanical first commit. Keep the data-field key order
  and the class names (`harness.js` maps `GameMap` to `Map`).
- **The lifecycle classes** (#30): Scenario, ScenarioLoader, Campaign, GameState, now with step
  0's tests. Keep the save keys and shapes. #27 goes with Campaign (nothing reads
  `campaign.isLoaded`, so the fix is identical).
- **AI seams** instead of "AI and AIScripted as classes" (that alone removes 4 casts): the
  injected rng and config, no `game` import, `startTurn` split from planning, the evaluator
  exported.

Then **Game** (game.ts) as a class, after the lifecycle classes.

### 3. Cleanup

`var` to `let`/`const`, the write-only `aInitiative`/`dInitiative`, the dead code the
reconstruction documented, the implicit globals (#34). The module objects (`GameRules`,
`Leaders`, `CombatLog`, `Equipment`) **stay** namespace objects: the harness patches them
(`Leaders.generateLeaderWithChance`, harness/ui/ui-attack.js) and about 120 references in 24
harness and contract files use them; ES module bindings can't be patched from outside. A
namespace facade over plain functions is fine.

Also worth doing early: move the unit styles and sounds out of aiscripted.ts (lines 286-521,
45% of the file, imported by render, ui, uibuilder and animation) into style.ts and sound.ts,
same export names, `soundData` still loaded before animation.

### Not worth it now

- Optimizing AI or pathfinding: ~35 ms of engine work per AI turn. The 1 s tick per action
  (game.ts:173) is what makes AI turns slow (#8). A heap-based Dijkstra would change path
  tie-breaks (gamerules.ts:396-401) and the replays.
- `Object.freeze` on equipment in production: #26 writes into it. In tests only.
- Multi-level undo (#36) on the current single slot: it needs step 1's results, stable ids and
  symmetric visibility first.

### In parallel or one after the other

Step 0's three parts (contract, invariants, lifecycle tests) touch only test/ and go in
parallel. Step 1 goes alone. After it, the four threads of step 2 go in parallel, then Game,
then cleanup per module in parallel by file.

At most 3 agents at a time, and **one verify at a time on the machine** (it runs up to 6
Chromes; `JOBS=3`). Each worktree uses its own `PORT`, `REFERENCE_PORT` and `BDG_SESSION`
(docs/TYPES.md, Checks), and an absolute `REFERENCE_DIR` (the default `../openpanzer-src` is
relative). The branches merge back one at a time, each rebased and verified on top of the
previous ones.

## After the refactor: deliberate changes

Each its own commit, naming its issue, re-recorded with `UPDATE_CONTRACTS=1`, checked by the
invariant tests:

1. Undo keeps the real player (#68).
2. AI purchases stop mutating the shared equipment lists (#22).
3. `tempSpotted` by the unit's own side (#75); the AI's fog leaks (#17).
4. The counter drift (#72, #73).
5. A guard on the move's destination, the AI stacking (#74).
6. Close the surprise and input race (#58).
7. Separate seeded RNG streams for rules, AI and cosmetics (a new replay baseline, once, before
   the arena's first measurements).
8. A lossless save: whose turn, `dayTurn`, `expPerSide`, stable ids, the edge hexes (#71, #55,
   #83, #54).
9. The campaign load as a state machine with a load token (#64, #61).
10. A rules context with a classic/remaster flag, so the mechanics gaps (#1-#4, #14, #18) don't
    re-record the classic contracts (#53).
11. Then the arena (#46) and the AI issues measured in it.

## Rules and traps

- docs/TYPES.md, rules 2, 3 and 5 still hold: erasable syntax only; `declare` for fields a
  constructor assigns; a class isn't hoisted, so check the load order (`src/main.ts`) before
  turning a function used at load time into a class.
- Enumerability: the gamestate export walks `emptyHex`, a plain object (gamestate.ts:293), not
  Hex instances; no `for...in` walks a Hex, GameMap or Player today. Still grep for
  `for (` ... `in` before moving methods. The real traps: the **key order of the data fields**
  (part of the saved game: assign them in the same order), `constructor.name` lookups
  (harness.js:183-193, test/contracts/common.js:21-23), and `#private` brand checks on methods
  called with a foreign `this`.
- The harness reaches into the game: `?harness` exposes every module's exports as globals
  (`src/main.ts`), `harness/lib/hooks.js` hooks `Render.prototype.getCursorCanvas`, the dev
  server adds `__harnessSet` to each module (`vite.config.mts`). Renaming exported names breaks
  harness scripts: grep `harness/` before.
- The order of `Math.random` draws is behavior: UI sprite and sound picks share the stream with
  the dice and the AI. Don't move a draw, don't skip one (the leader roll draws even when
  unused).
- Contract tests sit outside `describe` blocks on purpose (Stryker), and the tests' time zone
  is pinned to Europe/Warsaw (the recording's).
- Node: `export PATH="$(nvmrc-bin):$PATH"` before npm in this repo.
- Commits: no Claude attribution in messages.
