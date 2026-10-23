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
| `npm test` | ~2 min | the contracts: 2 × 15 game states recorded on the reference; the invariant, loader, save and harness-surface tests |
| `npm run verify` | 3-4 min | the whole game in Chrome against the original (`reference/`, or main with `BASELINE_REF`): 16 AI vs AI replays, 24 UI scripts, state, DOM and pixels |
| CI (`ci.yml`) | ~30 s | check and test on every push |
| Mutation testing (`mutation.yml`) | hours, on GitHub | whether the tests notice small changes, per module |

The rule: **a refactor re-records nothing.** If a contract or a replay changes, the behavior
changed: stop, find out why, and either restore it or make it a separate, deliberate commit.
The one planned exception is step 0's re-recording on the unchanged reference.

The contracts (README, Verification): `gamerules` (every rule), `engine` (the AI and random player
actions playing 2 turns, a hash of the whole state after each step, then hashes of the saved game,
the combat log and the equipment data; through Map, Unit, GameRules, Leaders and Scenario until
#137, through the game's commands and session on the core since). The `unit` contract (every Unit
method) went with the old engine's Unit in #137.

Coverage after step 0: 85.8% of statements over the 14 engine files (all but the UI modules),
up from 75.2%. Still thin: campaign.ts (49%), game.ts (48%), gamestate.ts (47%), aiscripted.ts
(35%), and the UI, covered only by verify.

Rhythm: small steps; `check` and `test` after each, `verify` before each commit.

## The plan

### 0. The safety net first (test/ only, no src/ changes) — done

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

### 1. Engine out of the UI (one after the other) — done

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
     variant (aiscripted.ts:510) drew from the same `Math.random` as the dice, between the
     support shots: animating after the whole combat would have changed the dice and the
     replays (until #126 gave them the cosmetic stream).
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

**How it was done, and where it differs from the plan above.** Every sub-step re-recorded
nothing: the contracts kept their fixtures, and verify gave the same result as before step 1
(12 of 16 replays and the 24 UI scripts differ from the reference only in canvas pixels, the
unit markers of fb58437, with the same hashes; nothing in game state or DOM).

- **1a, `moveUnit`.** `pathTo` lives in `GameRules` (`GameRules.pathTo(map, unit, cell)`, next to
  `getShortestPath` and `getMoveRange`), not in actions.ts: actions.ts calls into the map, and
  the map must not import it. `moveUnit(unit, drow, dcol, cells?)` uses `pathTo` without
  `cells`. The player's click passes the range the UI shows (`map.getCurrentMoveRange()`): it
  can be the disembark hexes, or older than the state after a surrender (#89), so the UI owns
  its selection and passes it. `processAction` keeps its `setMoveRange` (the flags are hashed
  and saved), `retreatUnit` passes its one cell.
- **1b, actions.ts.** `resolveAttack`, `finishAttack`, `finishMove`, `deployReinforcements` and
  `endTurn`. Besides `onSupportShot` and `onAttack`, `finishAttack` takes hooks for the UI's
  alerts and animations (`onLosses`, `onDestroyed`, `afterCleanup`, `onRetreat`,
  `onSurrender`, `onVictory`); the selection refresh (#29) is the UI's `afterCleanup`. A move
  isn't an action yet: the map moves the unit, `finishMove` does what followed the animation
  (the surprise attack through the caller's `attack` hook, the capture, the capture victory).
  The empty animation chain of carrier and naval transport attacks still calls back before the
  new strengths are set; the UI keeps that. `endTurn(scenario, localSide)` returns the defeat at
  the turn limit, still only for a local side. The AI's call into the UI after deploying its
  purchases became `AI.onUnitsDeployed`, set by `Game.init`, not a hook. The contract still
  goes through `game.deployReinforcements` (its alerts are recorded).
- **1c, `checkOutcome(scenario, last?)`** returns `{kind: capture | elimination | turnLimit,
  winner, loser, rating}` or null, for any side. A capture can't be read from the state (a side
  without objectives has an empty list from the start, campaign-3-1; one that took back what it
  lost has the same list as before), so it needs the move's result: `last.move`. The turn limit
  needs the side that just ended its turn: `last.endedSide` (nobody wins it, `winner` is -1).
  Elimination is the state's, so at a campaign's start, before the player deployed the core
  units (ruscam09-t0), it already reports one. Game and the UI don't call it: they keep the
  victory hooks and `endTurn`'s local-side defeat (#76 stays). The contract ends its game with
  it when `env.Actions` is there (the recorded victories still come from the hooks),
  test/engine.test.ts checks it against every recorded capture and wipe-out drill (on the contract's
  own run) and test/outcome.test.ts against `checkDefeat` at the turn limit.

Left for later, as deliberate commits: closing the surprise race (#58, the UI calling
`finishAttack` right after `resolveAttack`, which re-records the replays), the surprise target
by the air mode (#77), a surrender drill (forcing the surrendered unit back to life fails no
test today).

### 2. After step 1, in parallel (each in its own worktree) — done

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

  **Done**, one commit each, nothing re-recorded: `MapVisibility` (src/visibility.ts: the
  hexes' counters, made by `allocMap` and handed to each Hex, the arithmetic, `setUnit` and
  `setSpotting` for the 16 sites), `MapBoard` (src/board.ts: the unit list, ids and icons;
  `add`, `place`, `relocate`, `remove`), `MapSelection` (src/selection.ts: the move and attack
  cells, `select`, `clear`; `currentUnit` stays a GameMap field, `isMoveSel`/`isAttackSel` stay
  on Hex) and `UndoSlot` (src/undo.ts). GameMap's methods keep their names and delegate. The
  parts are closure variables of GameMap, not fields: a field would be saved and snapshot by
  the harness (test/mapparts.test.ts pins the data fields). For the same reason the methods
  stayed `this.m = function` closures: in the class body they couldn't reach that state. The
  new files are in the coverage and mutated with `map`. #68, #72, #73, #74 stay.
- **The lifecycle classes** (#30): Scenario, ScenarioLoader, Campaign, GameState, now with step
  0's tests. Keep the save keys and shapes. **Done**, one commit each, nothing re-recorded.
  #27 stays: nothing in the game reads `campaign.isLoaded`, but the harness snapshot compares
  the campaign object at every step, so setting it would change the campaign replays. It needs
  a deliberate commit (or a harness exclusion).
- **AI seams** instead of "AI and AIScripted as classes" (that alone removes 4 casts): the
  injected rng and config, no `game` import, `startTurn` split from planning, the evaluator
  exported.

**How the RNG seam, the headless engine and the AI seams were done** (one thread, a commit each;
nothing re-recorded, verify as before step 2):

- **`src/rng.ts`**: `Rng.random()` is `Rng.source()` when set, otherwise `Math.random()` read at
  the call, so the harness's and record.js's seeded `Math.random` still seeds the engine.
  `GameRules.rollDice`, both leader rolls, `getRandomPrototype` and the AI draw through it, one
  call per former `Math.random()`. The UI's sprite, sound and menu picks kept `Math.random` (#126
  moved them to the cosmetic stream).
- **`defined()`** is in `src/util.ts`; dom.ts imports and re-exports it for the UI. `isChromeApp`
  stays in dom.ts (only gamestate.ts uses it).
- **game.ts loads without side effects**: `main.ts` starts `game.loop` and adds the load listener;
  the constructor sets `loop = 0`, so the harness's `clearInterval(game.loop)` still works.
- **`src/context.ts`**: `engineContext` has `scenario()`, `campaign()`, `campaignPlayer()` and
  `spotSide()`; game.ts sets one that reads `game.*` at the call. Map, Player, Unit, the AI and the
  scenario loader use it; none imports game.ts. Without a game: nothing loaded, side -1. Unit.copy
  still takes the player from the scenario's map (#68), unitEndTurn still the old side.
- **The turn driver**: `Map.endTurn` calls `GameMap.onPlayerTurn(map, player)` where it called
  `handler.buildActions()`; the default does the same for AI and scripted players (#94 stays).
- **The AI**: `new AI(player, map, {rng, config}?)`, `aiDefaultConfig` the bundle's constants;
  `buildActions` is `startTurn` (the reinforcement budget, purchases, deployment,
  `onUnitsDeployed`) then `planTurn`; the scores come from the exported `createAIEvaluator` over an
  `AIPlan` (`getEvaluator()` gives the AI's own). Only function properties were added to the AI:
  a player's handler would otherwise show up in the save.
- **test/headless.test.ts**, in Vitest's `node` environment, locks these in. The module evaluation
  order changed (equipment before dom; unit and map before the scenario loader): all of them only
  declare things while loading, and the scenario loader still runs before scenario.

Then **Game** (game.ts) as a class, after the lifecycle classes. **Done** (#30), nothing
re-recorded, verify as before: `Game`, `AI` and `AIScripted` are classes whose constructor is the
old function's body (the campaign progress, the AI's plan and the tutorial's action list stay in
the closure, the methods are `declare` fields, `AI.onUnitsDeployed` and `Game.defaultScenario` stay
assigned after the class). A class isn't hoisted, so `game` is made after the class, then the
engine context is set, as before; the instances have the same own properties in the same order.
The `new (X as unknown as XConstructor)` casts for them are gone; `UI` is still a constructor
function (`UIConstructor`), and so are the sprites in animation.ts and aiscripted.ts.

### 3. Cleanup — done (engine files)

`var` to `let`/`const`, the write-only `aInitiative`/`dInitiative`, the dead code the
reconstruction documented, the implicit globals (#34). The module objects (`GameRules`,
`Leaders`, `CombatLog`, `Equipment`) **stay** namespace objects: the harness patches them
(`Leaders.generateLeaderWithChance`, harness/ui/ui-attack.js) and about 120 references in 24
harness and contract files use them; ES module bindings can't be patched from outside. A
namespace facade over plain functions is fine.

Also worth doing early: move the unit styles and sounds out of aiscripted.ts (lines 286-521,
45% of the file, imported by render, ui, uibuilder and animation) into style.ts and sound.ts,
same export names, `soundData` still loaded before animation.

**Done** for the engine files, three threads by file, nothing re-recorded, verify as before:

- `var` became `let`/`const` only where it is provably the same (no use before the
  declaration, no closure in a loop, no use outside the new block). Left as `var`: the
  exported module objects (`GameRules`, `Leaders`, `CombatLog`, `Equipment`, `Rng`,
  `engineContext`: the harness reassigns them through `__harnessSet`, and the
  `X = (function(X){...})(X || {})` pattern reads X before it is set), a few closure variables
  used before their declaration, and loop counters reused by a later loop. Module-level names
  are `let`, not `const`, for the same `__harnessSet` reason.
- Dead code the reconstruction marked as never taken is gone (`GameMap.dumpMap`, the second
  `NATIVE_PLATFORM`/`DEBUG_CAMPAIGN` assignments, unreachable branches and unused locals in
  gamerules, equipment, ai, scenario, the loader). Kept: calls marked unused that still run
  code (`u.unitData(true)` in the loader, the AI's `isOwned` lookup, which can throw, the
  `chrome.storage` call), and `combatlog`'s always-undefined `isSupport`, which creates an own
  property.
- The implicit globals of #34 in the engine files are local now (ai, aiscripted, scenario, the
  loader, gamerules' write-only `aInitiative`/`dInitiative`, combatlog). The UI's (uibuilder)
  are left.
- src/style.ts and src/sound.ts hold the styles and sounds; aiscripted.ts re-exports them, so
  render, ui, uibuilder and animation still import from there. Pointing them at the new files
  and dropping the re-export is a later UI change.
- The UI modules (ui, uibuilder, uicombatlog, render, animation, dom) were not cleaned.

After the cleanup, `src/` and `test/` were reformatted to put opening braces on the same line
(and `} else`): one formatting-only commit, listed in `.git-blame-ignore-revs`, every file's
syntax tree checked identical before and after. New code uses that style.

### 4. The core for extension — next

**What must stay the same is the gameplay, not the code** ("better without being different" is
about the game). The rules' results, the dice and the AI's decisions stay; field order,
closures, class names, the harness's snapshot shape and the draw order shared with the UI are
how parity is verified today, not what parity is. So the goal is the best core, with the
gameplay kept provably the same.

Where it leads, the core a turn-based game wants:

    state = plain data: map, hexes, units, players, turn, scenario, random streams
    step(state, command) -> { state', events }

Undo (#36) keeps the previous states, the attack preview (#7) is `step` on a copy, the arena
(#46) runs many independent states, play by link (#67) sends commands and both sides compute
the same, the save is the state itself. Steps 0-3 left the opposite: mutable classes with
state in closures, the UI drawing from the dice's stream in the middle of combat, a save that
loses data, and verification tied to all of it.

**Stages.** Each an issue with its evidence:

| Stage | Step | Issue | After |
|---|---|---|---|
| A | One command entry, `execute(game, command)`, for every player action | #119 | |
| A | Property-based tests (fast-check): invariants over random command sequences | #125 | |
| B | Design the state as data: the shape of `toData`, the new core and the save | #132 | |
| B | `toData` and `fromData` on the old engine, for the harness and the contracts | #127 | #132 |
| B | A versioned, lossless save format on `toData` | #128 | #127 |
| B | Separate random streams: cosmetics, then the AI, off the dice's stream | #126 | |
| C | The new core beside the old engine (tracking issue) | #129 | A, B |
| C1 | State and pure queries; the ruleset (#116) and the combat steps (#118) born here | #133 | |
| C2 | Command handlers, checked by differential tests | #134 | C1 |
| C3 | The turn and the scenario and campaign lifecycle | #135 | C2 |
| C4 | The AI and the scripted opponent as controllers (#121) | #136 | C3 |
| C5 | The switch; the old engine removed | #137 | C4 |
| D | The new UI (the war room mockups) on the core's events; the old UI removed | #130 | C5 |

- **A, refactors on the current engine** (contracts and verify unchanged). Only what stage C
  needs: the commands are the API through which the tests drive the old engine as the oracle,
  and fast-check generates the sequences.
- **B, the verification switch.** Deliberate, each with one new baseline. Then the internals of
  the objects stop counting as behavior:
  - The state's shape first (#132). It becomes the new core's state and the save format, so it
    is designed on purpose: units in a table by stable id, references by id, which counters
    are stored and which derived, the random streams' state, versioning.
  - `toData` and `fromData` instead of walking own properties.
  - A lossless save, which fixes #71, #54, #55, #83, #85 and #84 in their own commits.
  - Cosmetics off the dice's stream: the contracts stay, and verify compares against main from
    then on, not against the original. The recorded contracts keep the link to the original.
  - The AI on its own stream: re-records the engine contract once.
- **C, the new core, beside the old engine, not inside it.** The two hold their state
  differently, so a module can't be swapped at a time. The new core takes over in layers, each
  proven against the old engine:
  - queries, where the `gamerules` contract runs on both engines;
  - commands, through differential tests that compare `toData` and the events after every step;
  - the turn and the lifecycle;
  - the AI, which keeps its order of draws.

  The game switches only when the core has everything. #53's remaster ruleset sits next to the
  classic one; the classic contracts stay the gameplay reference.
- **D, the new UI, not a port of the old one.** The new interface is designed already
  (docs/design/), and porting about 4300 lines of UI and then replacing them would be work done
  twice.
  - Until the switch, the old UI reads the new state through a thin adapter.
  - The new UI draws a read-only view, plays its animations from the events after the step, and
    sends commands.
  - `waitUIAnimation`, the 1 s tick and the surprise race (#58) go with the old UI.

**The gameplay is frozen during stage C.** No rule fixes and no new mechanics go into the old
engine: each would be done twice, and the oracle would keep moving. The exceptions:
- the save (#128, stage B);
- the crashes that stop a game (#100, #101), fixed before C4 so the oracle has them.

Kept bugs are reproduced in the new core, then fixed after the switch, each its own commit. This
delays the rule fixes of milestone 1 (ROADMAP.md) until after the switch.

**The freeze ended with C5** (#137, 2026-10-23): the game plays on the core and the old engine is
gone. The rule fixes and new mechanics go into the core now, each its own commit with its test.

Closed as superseded: splitting gamerules.ts behind its facade (#117) and a GameSession over the
old model (#120). The ruleset (#116) and the controllers (#121) moved into the new core for the
same reason: doing them on the old engine first would be work done twice.

**The layers and the commands.** Five layers, each with one job:

| Layer | Does | Doesn't |
|---|---|---|
| State | plain data and its primitives: place, remove, relocate a unit, count visibility | decide rules |
| Rules | pure queries over the state and the ruleset: cost, range, combat result, "is it allowed" | change state |
| Commands | `check` (pure, asks the rules) and `run` (changes the state through its primitives, emits events) | know the UI |
| Session | the command queue, the turn, the players' `nextCommand`, the journal | compute rules |
| View | draws a read-only view, plays the events, sends commands | change the state |

A command is plain data with ids, not objects, so it can be logged, saved and sent. Each type has
a handler in its own file (`commands/move.ts`...); a registry typed by a mapped type replaces a
`switch`: a missing or misspelled handler doesn't compile.

    type Command =
    	| { type: "move"; unit: number; to: Cell }
    	| { type: "attack"; unit: number; target: number }
    	| { type: "resupply"; unit: number }
    	| { type: "endTurn" };
    type CommandOf<T extends Command["type"]> = Extract<Command, { type: T }>;

    interface Handler<C extends Command> {
    	check(game: GameView, cmd: C): Refusal | null;	//pure: allowed, or why not
    	run(game: Game, cmd: C, events: Events): Result;	//changes the state, emits events
    }

    const handlers: { [T in Command["type"]]: Handler<CommandOf<T>> } = { move: moveHandler, ... };

`check` has three callers:
- the UI greys a button and says why ("no fuel");
- the AI and the LLM list the legal moves;
- the remote game (#67) validates the other player's command.

`execute` always calls `check` before `run`, and a property test checks that `run` never fails
once `check` has passed, so the two can't drift apart. The view sees the state through
`GameView`, a read-only type, so a write from the UI doesn't compile.

In stage A the commands sit on the current engine, so two things still hold there:
- The attack's `run` fires its hooks where they fire today: until stage B (#126) the UI's picks
  shared the dice's stream.
- New state goes in closures, not fields.

After B, the attack splits into a pure `resolve` and an `apply`, and the state is free to take
its final shape. Keep the session thin: the core is state, rules and commands.

**How #119 was done (stage A).** `src/commands.ts`, `Commands.execute(scenario, command, hooks)`;
contracts and verify unchanged.
- The types are what the game does: move (with the cells the player was shown, when given),
  attack, resupply, reinforce (overstrength), mount, unmount, embark, disembark, undo, deploy,
  buy, upgrade and upgradeUndeployed, disband and sell, endTurn. Undeployed core units go by
  their index in the current player's core list. The AI's select, message and viewport stay UI
  actions in `processAction`; the AI's own purchases and deployment at its turn start stay in
  `AI.startTurn`.
- One module, not a file per handler: on the old engine each handler is a few lines over GameMap,
  Player and Actions. `GameView` and the events wait for the new core: `check` takes the
  scenario, `run` takes hooks.
- `check` refuses what the engine wouldn't do anyway (a move with no path, an upgrade the player
  can't afford, an embark with no transport). It doesn't check what the game does without a
  rule: an attack by a unit that has fired (the AI attacks after its surprise attack), a unit
  of another player, a resupply, reinforcement or mount GameRules refuses (#147: verify caught
  the UI's context button acting on a unit that changed since it was shown).
- The move and the attack hand their finish to an `animate` hook; the UI calls it when the
  animation ends, a headless caller at once. The surprise attack runs as an attack command from
  the move's finish.
- The engine contract and the invariants test play through the commands (`env.Commands`, the
  copy stays for the reference); with a handler broken, 14 of the 15 engine contracts fail.

**How #127 was done (stage B).** `src/state.ts`: the types of docs/STATE.md, `toData(scenario,
game)` and `fromData({ data, state }, game)` on the old engine.
- toData only reads; GameMap gives its board and undo slot (`getBoard`, `getUndoSlot`), Game its
  campaign progress (`getCampaignProgress`, `setCampaignProgress`). fromData places the units through
  the map's own placing with their ids, so their players, zone of control and spotting follow, and
  counts the counters again (D10): the drift of #72 is the one thing it can't reproduce, a
  `test.fails`. On every engine fixture `toData(fromData(toData(x)))` is `toData(x)`, and the AI
  plays the same turns on fromData's scenario as on the original.
- The engine contract hashes toData's state plus the view the state leaves out (the selection, the
  counters, the side shown), re-recorded once: the old and the new hashes map one to one over the
  4248 hashed states, and the fixtures changed only in their hashes. A drill now puts back the undo
  slot too.
- The harness snapshot takes toData when the baseline has it (`STATE_SNAPSHOT`, set by
  harness/lib/reference.sh for both pages), else the walk of the objects: the original (reference/)
  has no toData, so against it both sides still walk.
- The save is toData's state since #128 (docs/STATE.md, "The save"): the objects' fields and their
  order are no longer part of it.

**How #128 was done (stage B).** `src/savegame.ts`: the save is `{ version: 1, data, state }`,
written by every save path (one local item instead of three, the file export, the cloud) and read
back through fromData; the scenario file isn't read on load. The saves of the format before (the
JSON of the objects, and the three local items) are imported: what they had is kept, what they
never stored is listed as unknown and keeps the game's own (docs/STATE.md, "The save").
- First the format alone (#164): the load did what the old one did, so the contracts changed only
  in the saved game's text, and verify only in the save link's data. Then each loss in its own
  commit, a `test.fails` flipped and a mask taken off `withoutLosses` each: #71, #54, #55, #83
  (#170), #84, #85 (#174), #150, #142, #149 (#178), and the rest of the state #128 itself named
  (the description, the undo, the random streams, the equipment lists, the campaign's progress).
  Now the save property of test/properties.test.ts compares the whole save.
- The engine contract was re-recorded by #54, #55, #83, #84 and #85 (the reference's saves had
  those fields, the old load dropped them), the gamerules contract by #54, #84 and #85, the unit
  contract by #85. Verify's differences were the fields each fix keeps, in uibuilder-saveload and
  the replays' save/restore round trip.
- A game loaded on an AI's turn has the AI plan the turn again (#71: its plan isn't state), and a
  game started from a save doesn't apply the campaign's progress to the loaded scenario again.

**How #133 goes (stage C1).** docs/CORE.md has the layout: `src/core/`, plain functions of a
`World` (the data, the state, the equipment, the `Ruleset`, and the unit index and the sight
derived beside the state). The ruleset (#116) holds the movement tables by ground condition and the
combat steps (#118). The gamerules contract runs on the core too (test/core-contract.test.ts,
through test/coreadapter.ts): every recorded call of the 15 fixtures agrees.

**How #134 goes (stage C2).** docs/CORE.md, "Commands": `step(world, command)` and `check` on the
core, a handler per command type in `src/core/commands/`, the same `Command` values as the old
engine's. The step plays on a draft copied on write, so the world given stays as it was; it returns
the world after and the events. The attack is resolve and apply per shot, the draws in today's
order. Differential tests play random command sequences on both engines and compare toData, the
sight and the events after every command; the engine contract's own commands are stepped on the
core too. The end of turn is the next layer's (#135).

**How #136 goes (stage C4).** docs/CORE.md, "The controllers" and "A game headless": a `Controller`
(join, startTurn, plan, next) answering in the same `Command` values; the AI on the core plans its
whole turn at its start as the old one did, its draws from its own stream in the old order, and hands
its queue out; `startSession` and `advance` play a game in Game's order. The old game played headless
(test/aigames.ts) and the core's session play the engine fixtures and the replay's items in lockstep,
compared after every order and turn; the engine contract's AI turns run on the core's AI beside the
old one. The AI's settings moved to src/prototypes.ts, which the core may read. The scripted tutorial
is a controller too (src/core/tutorial.ts): AIScripted's script as data, its UI calls as view events
(a message, a selection, the main menu), #80 and #81 kept, played in lockstep with the old one from
its start, from its later turns and in the engine contract.

**How #137 goes (stage C5).** The design is on the issue: the old objects (GameMap, Hex, Unit,
Player) stay as a two-way mirror of the core's world while the old UI and the harness read and write
them, and the game runs on the session.
- The core's checkpoints (#190): `begin` and `resume` play a move up to the end of its animation and an
  attack up to the end of its shots and its cleanup, as the old UI showed them; the surprise attack's
  air mode (#77) and the finish that skips the retreat (an attack with nothing to animate) are inputs.
  The session's `nextOrder`, `play`, `playOn` and `endTurn` with its save point are a screen's entries.
- The mirror (src/mirror.ts): `applyData` updates the objects in place to the world's state, by unit id
  (a deployed core unit keeps its object); `worldOf` makes the world again from toData of the objects,
  so what the harness and the UI write into them keeps its effect; `mirrorDifference` compares the two.
  test/mirror.test.ts plays every engine fixture's round as the AI and random commands a person sends,
  checkpoint by checkpoint, and checks after each piece: the same toData, the same counters, every unit
  the object it was, the world made again the same. Until the last step the world's sight was the old
  counters with their arithmetic (`keepDrift`: the drift of #72 and #73 shows in verify's UI scripts,
  so the game kept it until then; 900 drifted states in 300 sequences played that way, always the old
  counters). The last step computes the sight from the units and writes it into the counters.
- The game's commands on the core (src/coreplay.ts, `CorePlay.execute`, the entry and hooks of
  `Commands.execute`): every command the person and the AI send is stepped on the world made from the
  objects, checkpoint by checkpoint, and mirrored after each piece; what the old commands did beside the
  state is done on the objects where they did it (the selection's hexes, the combat log, the image
  cache, the hooks with the shapes the UI reads, the strengths an attack's hooks saw). The surprise
  attack is animated by the attack's hooks (`attackHooks`), its target the screen's air mode (#77).
  test/coreplay.test.ts plays random command sequences on both entries with the UI's hooks (the
  selection refreshed after the cleanup, units clicked between the commands): the same hooks, with the
  same arguments, in the same order, and the same state, selection, counters, combat log and images
  (2,000 sequences). It found the undo's order on the drifting counters (the unit copied back, then
  its sight off, as the old engine).
- The game's turns on the session (src/coresession.ts): Game.init sets the drivers of `AI` and
  `AIScripted`, so a player's handler hands out the session's next order as the old action (the
  replay still wraps `handler.getAction` and hashes the state there) and a handler made while the game
  runs (the replay's `new AI`) joins the session with its controller; Game.processAction plays the
  action as before. The session starts when the players are set up (their controllers join, a loaded
  game's AI plans again, #71); Game.endTurn clears the selection, ends the turn on the session and, at
  its save point, mirrors the objects, logs the turn start's resupplies, shows what the AI deployed
  (the old `AI.onUnitsDeployed`), opens the tutorial's main menu, saves and shows the next side; then
  the reinforcements arrive with their alerts and combat log. A Game nobody inits (the tests of the old
  engine) still plays the old AI and end of turn. test/gameturn.test.ts plays Game itself both ways,
  every player the AI as the replay makes them, 3 turns, a save in the middle of an AI's turn and the
  load: the same actions, states, combat log, images and screen calls on harness/replay.sh's 16 items.
- The screen's rules on the core (src/corerules.ts, `CoreRules`): the GameRules entries the UI, the
  render loop and the selection call (`MapSelection.rules`, set by Game.init), with their shapes. What a
  unit is by itself (the render loop asks it of every unit it draws) reads the unit object as the
  core's unit state on a world of the equipment alone; what the map decides is asked of the world made
  from the objects at the call, so the harness's and the UI's writes are in it. test/corerules.test.ts
  compares every rule with the old one on the fixtures after random commands. `BENCH=1` (2026-10-23, a
  loaded laptop), per call:

  | | Old engine | Core |
  |---|---|---|
  | Render loop, per unit drawn (move range, ammo, fuel, ground, bridge) | 0.24-0.47 µs | 0.29-0.54 µs |
  | A click's move and attack hexes | 4-458 µs | 237-489 µs |
  | The estimate under the attack cursor | 3-16 µs | 132-214 µs |
  | The context buttons (5 rules) | 1-2 µs | 430-805 µs |

  The map's rules pay for the world made from the objects (about 150 µs): under a millisecond a click.
- The scenarios started on the core (src/coreload.ts, `ScenarioLoader.build`, set by Game.init): the
  loader reads the file, the map image and the equipment as before (the page's requests in the same
  order), then the core's `newGame` makes the game (the AI asked for, the single scenario's prestige,
  a campaign's start: its player carried, its units on the deployment hexes removed, the prototype)
  and `fromData` fills the scenario's objects; the image cache keeps the icons of the units the start
  removed, as the old loader left it. The end of a campaign's scenario is `endCampaignScenario` (the
  player carried) and `scenarioEnded` (the scenario as the old game left it until the next loads: its
  player sent to HQ in place); the saved player a load during the campaign copies is kept (#196).
  test/gameturn.test.ts plays the campaigns on to their next scenario both ways. The differences:
  the next scenario's counters have no phantom zone of control or spotting from the removed units
  (#72), and a player whose core units all fell carries none (#183).
- The sight computed from the units (D10): `worldOf` no longer takes the counters, `keepDrift` is gone,
  and applyData writes the world's sight into them for the screen. The harness's teleports still switch
  the counters (GameRules.setZOCRange and setSpotRange) so the screen shows them until the next command.
  Expected verify differences: the counters' drift where the old engine forgot to switch them (#73: an
  embark, a disembark, an upgrade, a leader that sees farther) and what followed from it (a unit marked
  seen, a move range).
- The old engine removed: src/actions.ts; the old command handlers (src/commands.ts is the game's
  entry on the core, coreplay.ts merged into it); the old AI and AIScripted (now handlers that hand
  out the session's orders, src/coresession.ts drives them); GameRules' own rules (src/gamerules.ts is
  corerules.ts's mapping over a world, `rulesOn`; setZOCRange and setSpotRange still switch the
  counters the harness moves units with); the counters' arithmetic (MapVisibility only holds them);
  and what of GameMap, Unit, Scenario, Leaders, ScenarioLoader, MapBoard and UndoSlot only the old
  engine used. The names the harness uses stay (test/harness-surface.test.ts). Where a test compared
  the core with the old engine, the core's side was recorded where they agreed, as hashes the game
  must still give (test/gameturn, core-ai, coreplay, corerules); the differential tests of the
  commands and queries went with the old engine (test/core-differential, core-steps, core-aicontract;
  their results are in docs/CORE.md). The tests that drove the old engine play the game's commands and
  session now: the engine contract (test/coreengine.ts gives
  it the session's players and end of turn; re-recorded, the differences being #72's and #73's drift,
  the empty move the AI ordered where no path was, the shape of the cells), the invariants (the #73
  drills are plain tests now), the properties, the state, save, undo and outcome tests. The unit
  contract went with Unit's methods. Verify: identical to the step before.
- The world kept (after #137): the world was made again from toData of the objects at every rule the
  screen asked and every step, and the objects compared with the world after every update, which made
  `npm test` take twice as long and a click's rules hundreds of µs. The mirror keeps the world of the
  objects now. The screen's rules read it until something says it wrote into the objects (`touched()`,
  src/context.ts: the selection's carrier flips through `Unit.toggleEmbark`, the animation's facing,
  a unit put on a hex, the retreat's ranges, a load, the players set up; the UI's sorts of the unit and
  equipment lists did until they sorted copies, #186); a step starts from it while toData of the objects is its state (`savedAs`, src/state.ts,
  the parts toData reads compared where they are, about 50 µs against 150-250 to make the world again),
  so a write nobody announced is never lost under a step. Under ?harness, whose scripts write anywhere,
  the rules read it the same way, compared with the objects. The checks (`mirrorOptions.checks`: the tests
  and the dev server, off in the build) throw where a world trusted isn't the objects' (a write without
  `touched()`), compare `savedAs` with toData at one step in 16 and the objects with the world after one
  update in 8 (test/mirror.test.ts after every piece). `BENCH=1` (2026-10-23, the page's mirror, no
  checks), per call:

  | | Old engine | Core, world made at each rule | Core, world kept |
  |---|---|---|---|
  | Render loop, per unit drawn | 0.24-0.47 µs | 0.38-0.77 µs | 0.36-0.65 µs |
  | A click's move and attack hexes | 4-458 µs | 277-667 µs | 6-194 µs |
  | The estimate under the attack cursor | 3-16 µs | 175-284 µs | 4-17 µs |
  | The context buttons (5 rules) | 1-2 µs | 456-1096 µs | 1-2 µs |
  | A move played by the game (`Commands.execute`) | | 2.3-4.1 ms | 0.7-1.9 ms |
  | An AI turn played by the game | | 50-289 ms | 28-120 ms |

  `npm test` on the same laptop: 80 s before (41 s before #137's switch), 40 s after; the property tests
  are back to the default timeout. Two test files were run once where they ran twice or on one worker:
  the engine contract's run gives its outcome test too (test/engine.test.ts), and the state's slowest
  test has a file of its own (test/state-ai.test.ts).

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
(docs/TYPES.md, Checks). Since then verify runs on GitHub for every pull request, against its
base branch. The branches merge back one at a time, each rebased and verified on top of the
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
7. Separate seeded RNG streams for rules, AI and cosmetics: step 4, stage B (#126).
8. A lossless save (#71, #55, #83, #54, #85, #84): step 4, stage B (#128). Done, with #142, #149
   and #150.
9. The campaign load as a state machine with a load token (#64, #61).
10. A remaster ruleset next to the classic one (step 4, #133), so the mechanics gaps
    (#1-#4, #14, #18) don't re-record the classic contracts (#53).
11. Then the arena (#46) and the AI issues measured in it.

## Rules and traps

- docs/TYPES.md, rules 2, 3 and 5 still hold: erasable syntax only; `declare` for fields a
  constructor assigns; a class isn't hoisted, so check the load order (`src/main.ts`) before
  turning a function used at load time into a class.
- Enumerability: the gamestate export walks `emptyHex`, a plain object (gamestate.ts:293), not
  Hex instances; no `for...in` walks a Hex, GameMap or Player today. Still grep for
  `for (` ... `in` before moving methods. The real traps: the **key order of the data fields**
  (part of the saved game: assign them in the same order), `constructor.name` lookups
  (harness.js:220-230, the walk the harness takes against the original; test/contracts/common.js:
  21-23), and `#private` brand checks on methods called with a foreign `this`.
- The harness reaches into the game: `?harness` exposes every module's exports as globals
  (`src/main.ts`), `harness/lib/hooks.js` hooks `Render.prototype.getCursorCanvas`, the dev
  server adds `__harnessSet` to each module (`vite.config.mts`). Renaming exported names breaks
  harness scripts: grep `harness/` before.
- The order of the draws within a stream is behavior: the game stream (`Rng.random`, the dice
  and the leaders, read from `Math.random` until it is seeded: the game seeds it in main.ts, a
  test seeds `Math.random`), the AI's (`Rng.aiRandom`) and the cosmetic stream
  (`Rng.cosmeticRandom`, the UI's sprite and sound picks), #126. Don't move a draw, don't skip
  one (the leader roll draws even when unused), don't draw from another stream's. Since the AI's
  own stream the engine contract's fixtures hold this repo's results (UPDATE_CONTRACTS), not the
  reference's: record.sh records the old, shared stream.
- Contract tests sit outside `describe` blocks on purpose (Stryker), and the tests' time zone
  is pinned to Europe/Warsaw (the recording's).
- Node: `export PATH="$(nvmrc-bin):$PATH"` before npm in this repo.
- Commits: no Claude attribution in messages.
