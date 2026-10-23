# The new engine core

Stage C of docs/REFACTOR.md step 4 (#129): a core with the same gameplay, built beside the old
engine and proven against it, layer by layer. This page says how it is laid out; the state it
works on is docs/STATE.md's.

    state = plain data (GameState, docs/STATE.md)
    queries(world, ...) -> answers		layer 1, #133
    step(world, command) -> { world', events }	layer 2, #134 (world'.state is state')
    the end of turn, the reinforcements, the outcome	layer 3, #135
    controllers: the AI, the tutorial; a session	layer 4, #136

Nothing in the running game uses the core until the switch (#137): verify stays identical.

## The world a query reads

A query is a plain function of a `World` (src/core/world.ts):

| Part | What | Where it comes from |
|---|---|---|
| `data` | the scenario's static data, `ScenarioData` (D3) | `toData`, later the save |
| `state` | the game, `GameState` | `toData`, later the steps |
| `equipment` | the equipment table by eqid (`EquipmentEntry`) | loaded once, read-only |
| `rules` | the `Ruleset` | `classicRules`: today's game |
| `noFOW` | the fog of war off: every hex is spotted | an option, not state (D6) |
| `spotSide` | the side the screen shows (-1 none): the end of turn hides the units it doesn't see (kept #75) | an input, not state (D6) |
| `destroyed` | units an attack destroyed whose removal hasn't run yet | empty: only the contract's adapter sets it (the step removes a unit where the old engine did) |
| `index` | unit id -> its index in `state.units` (D2) | derived, built with the world |
| `sight` | spotting and zone of control counts per hex and side (D10) | derived, `computeSight` |

The types are src/state.ts's (one source of truth): the core imports them with `import type`.
The derived parts are a cache beside the state, never saved; a step rebuilds them.

## Modules (src/core/)

| Module | Has |
|---|---|
| `world.ts` | `World`, `createWorld`, the unit index, hex access, the unit's current equipment, moves, ammo and fuel |
| `rules.ts` | `Ruleset` and `classicRules`: the movement tables by ground condition (no global `movTable`, #116), the class leaders, the combat steps |
| `geometry.ts` | distance, adjacency, cells in range, directions, the partial edge hexes |
| `equipment.ts` | the equipment's attribute bits: bridge, ignores entrenchment, which targets a unit can start an attack on |
| `units.ts` | the predicates: air, sea, ground, train, leaders, enemies, fuel and ammo, mount, entrench, capture |
| `sight.ts` | spotting and zone of control computed from the units (D10), and who a unit spots |
| `movement.ts` | move range and shortest path, retreat, deploy and disembark positions, embark |
| `attack.ts` | attack range and cells, who can fire on whom, support fire |
| `combat.ts` | the attack and combat results as named steps with a record of what each contributed (#118) |
| `supply.ts` | resupply and reinforcement: whether, and how much |
| `costs.ts` | unit, upgrade and sell costs |
| `newgame.ts` | a game's data and state from a scenario file, as the old loader and Game start it |
| `campaign.ts` | a campaign's scenario started (its player carried, prestige, core units, the prototype) and ended (HQ, the next scenario) |
| `scenariofile.ts` | a scenario XML document read as plain data, for `newGame` |
| `turn.ts` | a unit's end of turn (entrenchment, #75's hiding), the reinforcements arriving, the turn limit, the victory rating and the outcome |
| `step.ts` | `step` and `check`, the handlers' registry |
| `draft.ts` | the state a step changes, copied on write, and its primitives: place, relocate, remove a unit with its sight, the score, the dossier |
| `events.ts` | the events a step emits (types) |
| `fight.ts` | an attack: each shot resolved then applied, the attack's finish (destroyed, retreat, surrender, elimination), the surprise attack |
| `moves.ts` | a move: the path walked, the surprise, the capture, the fuel and points, the undo it leaves |
| `controller.ts` | `Controller`, the orders it gives (a command, or something to show) (types) |
| `ai.ts` | the AI as a controller: its purchases and deployment, its plan of the turn, its queue of commands |
| `aiscore.ts` | the AI's scores: of a hex for a unit, of an attack, of the attacks from a hex, of the nearest objective |
| `tutorial.ts` | the scripted tutorial as a controller: its script of turns 1 to 4 as data, the hand-over after them |
| `session.ts` | a game played headless: the controllers, the turns in the old game's order, the end of the game |
| `commands/` | the handlers, `check` and `run` of each command type (`move.ts`: move and attack, `supply.ts`, `transport.ts`, `undo.ts`, `units.ts`: deploy, buy, upgrade, disband, sell; `turn.ts`: the end of turn) |

The core imports only `src/prototypes.ts` (the enums and tables), `nextRandom` of `src/rng.ts`
and types: no UI module, no mutable object of the old engine (the linter checks it).

**Kept bugs are kept.** The classic ruleset reproduces the old engine exactly, every kept bug
included (#87, #88, #90, #95, #19, #23...): they are fixed after the switch, in the core.

**Hot paths.** The AI calls the move range and the combat result many times a turn: they allocate
only their answer, the move range finds a cell's neighbours through a reused hex-to-cell table
(the old engine compares every pair of cells). `BENCH=1 npx vitest run test/core-bench.test.ts`
measured them against the old engine on the 15 engine fixtures (2026-10-22, on a loaded laptop; it
measures the core alone since #137):

| Per call | Old engine | Core |
|---|---|---|
| Move range of a unit that can move | 26-64 µs | 16-35 µs (1.1-2.3x faster) |
| Combat estimate with the hidden units (the AI's) | 3-9 µs | 2-11 µs (about even) |
| A world from `toData` (toData included) | | 0.06-0.28 ms |

The step (`BENCH=1`, 2026-10-22, on a loaded laptop): each of the current player's units moving to
the first hex of its range, or attacking the first unit it can, in a row, against `Commands.execute`
(which also builds the UI's move and attack hexes):

| Per command | Old engine | Core |
|---|---|---|
| Move | 300-2500 µs | 80-475 µs (3-7x faster) |
| Attack | 40-220 µs | 18-127 µs (2-3x faster) |

The path search was the cost of a move (the old engine's compares every open hex at each turn,
O(n²) over an air unit's 700 hexes): the core's takes the next hex from a heap ordered by distance
then by place in the list (the later first, the old engine's tie-break), and finds the neighbours
through a table by hex. A property checks it against the old engine's on small maps full of equal
paths.

## Combat as steps (#118)

`attackResult(world, attacker, defender, rng, record?)` runs `rules.combat`, an ordered list of
named steps that each change the four values (the attacker's attack and defense, the defender's),
in today's order. With a `record` array, each change is recorded as `{ name, side, field, before,
after }`: the attack preview (#7) and the combat tooltips (#35) can say why the numbers are what
they are. The record is extra output: the numbers and the draws are the same with or without it.

`rng` null is the estimate: it draws nothing. Otherwise the dice come from the stream given (the
game's, `state.rng.game`, D8) in today's order: support fire first, each unit's dice one by one.

## Commands (#134)

`step(world, command)` checks the command, then plays it: `{ ok: true, world, events }` or
`{ ok: false, refusal }`. The commands are src/commands.ts's `Command` values, the old engine's
(ids and cells, plain data); `check(world, command)` alone says whether one is allowed, or why not,
and changes nothing. Each type has a handler in `commands/` (`check` and `run`), in a registry
typed by a mapped type: every command of the old engine, the end of turn included (#135). A type
that isn't a command is refused ("no such command"): a remote game checks what it is sent.

**The world given stays as it was.** `run` plays on a draft (`draft.ts`): the step copies the
state's lists when it starts (a few thousand pointers, and the sight's four counts) and an object of
the state (a unit, a hex, a player, an objective list) the first time it writes to it. The world
returned shares the rest with the one given: a step costs what it changes, not the size of the state,
and the caller keeps every state it had (the undo's, the preview's, the AI's look ahead). The
differential tests freeze the state given to every step.

**Sight.** The draft keeps the sight up to date where the old engine switched its counters: a unit's
off before it leaves or changes, on after, marking the enemy units its side didn't see as seen
(`tempSpotted`) where `setSpotRange` did. Where the old engine forgot to switch them (#73: an embark,
a disembark, an upgrade, a leader that sees farther) the draft switches them without marking: the
core's sight always equals `computeSight` of its state (D10).

**Events.** Plain data in the order things happened, enough for the combat log and for a view to
animate after the step: `moved` (the path, each hex seen by the enemy or not, the cost), `surprised`,
`spotted`, `captured` (flag, objective, prestige, score, win), `victory` (capture, elimination),
`fight` (a support shot or the attack: both units before and after, the dice's result and the
combat steps' record, #118), `attackStopped`, `dismounted`, `leader`, `destroyed`, `retreated`,
`surrendered`, `resupplied`, `reinforced`, `mounted`, `unmounted`, `embarked`, `disembarked`,
`undone`, `deployed`, `bought`, `upgraded`, `disbanded`, `sold`; the turn's `turnEnded`,
`turnStarted`, `turnLimit` and `arrived` (below).

**The attack** (`fight.ts`) is the old engine's sequence: the estimate (no draw) decides an overrun,
the support fire shots one by one unless the attacker is surprised or overruns, the attack unless
the attacker is destroyed or its losses stopped it, then the finish (the destroyed units off the map,
the attacker first; retreat or surrender; a side with no unit left loses, both when both, #92).
Each shot is `resolveFight`, which reads the state and draws from the game stream (the attacker's
dice, the defender's, then the attacker's leader roll and the defender's: `generateLeaderWithChance`
draws even when no level was gained), then `applyFight`, which changes it. The preview (#7) can
resolve on a copy of the stream.

**Checkpoints (#137).** The old UI animated a move and an attack and finished them from the
animation's end, showing the state in between (the animation-combat script hashes every frame of
it). `begin(world, command)` plays a command up to its first checkpoint, `resume(world, checkpoint,
input)` from one to the next: a move stops once moved (`surprise` next: the surprise attack and the
capture's victory), an attack once its shots are fired (`cleanUp` next: the destroyed units leave the
map) and once they are gone (`end` next: the retreat or the surrender, the elimination victory). The
world resumed from can be one made again from the screen's objects. What the screen says there is an
input, not state: the air mode the surprise attack picks its target with (#77: the person's toggle;
a program plays with it off), and `retreat: false` when the old UI's finish skipped the retreat (an
attack with nothing to animate read both strengths as 0, kept). `step` passes every checkpoint at
once on one draft; test/core-steps.test.ts played each of its commands both ways until #137.

**Undo (D5).** The state keeps `turn.undoable` exactly as the old engine's slot decides it: a human
player's move that spotted nothing new and wasn't surprised, cleared by an attack, a resupply, a
reinforcement, an upgrade or a disband, set by a retreat of a human player's unit too (#171). The undo
plays the old single slot back, #140 and #141 included; the states before are the caller's.

**What the old engine does and the core does too:** a retreat is a move (fuel, capture, undo), a
command doesn't check whose unit it moves (#147), a mount, unmount or undo selects the unit (a unit
leaving its carrier gets back on it unless it can land), a campaign's losses count in the campaign
player's dossier (the last player of its country) and its difficulty scales the score.

**Not reproduced: the selection (D6).** Selecting another unit puts a unit in the middle of a
disembark back on its carrier (`MapSelection.clear`): the core has no selection, so a program's
command plays as with nothing selected.

## The turn (#135)

`step(world, { type: "endTurn" })` is Actions.endTurn without the AI: the time of day (a day later
after the day's last turn, the date counted in local time as the old engine counts it), the player's
end of turn (the turn played, the prestige the scenario gives for the next turn, the score), the
undo gone, the next player by id. When the first player is next, a new round: the turn counter, and
each unit in the list's order gets off its transport (spotting again, marking what it sees), takes
the turn start's resupply (in a city with no enemy around; #95 kept) and ends its turn
(`unitEndTurn`: entrenchment, its points and flags back, and hidden again unless the side the screen
shows sees it, #75 kept). Events: `turnEnded` (the prestige), `unmounted`, `resupplied`,
`turnStarted` (turn, date, time of day), and `turnLimit` when the side that ended has played its
last turn. The game ends there only for a side that plays on this screen (Game's local side): that
is the session's to decide, as the side shown is. The ground and the weather don't change during a
scenario; the move costs follow `state.scenario.ground` through the ruleset's tables.

**The reinforcements are a step of their own:** `arriveReinforcements(world)` (turn.ts) places the
current player's reinforcements due by this turn, by turn then as listed, each on its hex or the
first neighbour it can stand on (`arrived`, then what it spots); those with no room wait. The old
game plays, in order: the end of turn, the next AI player's turn start and plan (inside
Map.endTurn), the save, the side shown, then the reinforcements. Kept: the AI plans before its
reinforcements arrive (#94), the save is written before them (#93). The session (C4, C5) plays the
two with the controller's turn start in between. No command stands for the arrival: no player
sends it.

`outcome(world, last?)` is Actions.checkOutcome: a capture that took the side's last objective
(`last.victorySide`, the move's `victory` event), a side with no unit on the map (#115 kept: units
waiting to deploy don't count; axis first), the ended side's turn limit (`last.endedSide`). The
rating is Scenario.checkVictory's, by the turn.

`BENCH=1` (test/core-bench.test.ts), two rounds of turns ended on each engine fixture, each with its
reinforcements, per end of turn (2026-10-22, a loaded laptop): old engine 27-116 µs, core 12-97 µs
(1.1-2.3x faster; every unit is copied once in a new round).

## A new game (#135)

`newGame(setup)` (newgame.ts) is ScenarioLoader and Game.newScenario together: `{ data, state }` from
a scenario file read as plain data (`ScenarioFile`, by scenariofile.ts's `readScenarioFile` from the
parsed XML document), the map image's size, the equipment of the countries `equipmentCountries`
names with their lists by unit class as their files have them (keyed by file, the country + 1),
the AI asked for (`uiSettings.isAI`), the random streams and the campaign. The files are read by
the caller: the core turns what they hold into the state, in the old loader's order:
- the map's size from the image, cut to the file's; the victory turns (a campaign's difficulty adds
  to the last), the date, the turns a day (twice the file's);
- the players: a campaign gives each turn at least a share of its starting prestige;
- the reinforcements, then the hexes in the file's order. Each unit with a leader draws it from the
  game stream as it comes (#78 kept); a ground or air unit counts in its side's cost and experience.
  A hex's units go to their slots (a later one over an earlier, #74), the hex becomes an objective of
  the side that has to take it, and its units enter the map on a draft: ids as they come, the ground
  unit first, and a unit marks the enemy units its side is the first to see (`tempSpotted`, as
  MapBoard.add does);
- the scores (the objectives worth per turn, less the units), the AI's players, and outside a
  campaign each side's starting prestige: what its units are short of the other's, at least 2000
  (not the tutorial).

## A campaign (#135)

`newGame` with `setup.campaign` (the campaign's `CampaignState`, its `progress` saying which start)
and `setup.carried` (the campaign player from the previous scenario) starts a campaign's scenario
as Game's setupPlayers and startCampaignScenario do (campaign.ts):
- the other countries' players are the AI; each player of the campaign's country takes the carried
  player's id, side, country, prestige and type, adds its score, takes its core units and dossier.
  Kept: a scenario whose player of that country has another id or side gets the carried one's
  anyway (#61, #64);
- the first scenario: the campaign's starting prestige, an empty dossier, and the player's units on
  its deployment hexes become its core units;
- a later one: the scenario's own units of the player on its deployment hexes leave the map, to
  make room for the core units (no loss in the dossier; the old engine left their zone of control
  and spotting behind, #72, which the derived sight doesn't);
- after a brilliant victory, a prototype: a unit of the next year's combat classes drawn from the
  game stream (drawn even when there is none), a core unit waiting to deploy.

`endCampaignScenario(world, outcome, scenarios)` is Game.continueCampaign: the outcome's prestige,
the scenario in the dossier, the player sent to HQ (transports and support gone, the lost units
dropped, the others off their transports at full strength, ammo and fuel), and the next scenario
the outcome leads to with the campaign's progress, or null when the campaign ended. The UI's wait
for a click between the two isn't state. Kept: a core unit of a country whose equipment the
scenario didn't load stops the campaign (#182; the old engine throws in setPlayerToHQ, the core
too). Not reproduced: a player whose core units all fell carries none, where the old engine brought
back the dead units it had carried in (#183): which list a player brought in isn't state.

## The controllers (#136)

A `Controller` (controller.ts) plays a player: the AI (ai.ts), the scripted tutorial (tutorial.ts),
later a remote player or an LLM (#121). It answers in the core's `Command` values, the ones a person sends, so the
session checks and plays them the same way; what it keeps between its calls (the AI's plan, the
tutorial's script) is its memory, not state (D6). The session calls it in the old game's order:

| Call | When (the old game) | The AI | The tutorial |
|---|---|---|---|
| `join(w)` | the players are set up (Game.setupPlayers) | the prestige for reinforcements | picks its units by their starting hexes, builds the turn's script |
| `startTurn(w)` | its turn starts (Map.endTurn's turn driver) | purchases and deployment, as `buy` and `deploy` commands it steps itself; `Played` gives the world after, the commands and their events | builds the turn's script; past turn 4 hands the player over |
| `plan(w)` | right after, before the reinforcements (#94); a game loaded on its turn plans again (#71) | the whole turn, unit by unit: the world with its stream moved on | nothing |
| `next(w)` | until it answers null, which ends the turn | the next command of its plan | the next action of its script |

**A plan, then a queue.** The old AI plans its whole turn at the turn's start, on the state as it is,
then plays the plan whatever happens in between (Game.processAction): a move to where the plan said
along the move range then (a hex its own unit didn't leave is taken over, #74), an attack that
the old game skipped when the target was out of range or gone (the step refuses it: nothing
changes either way), a resupply, a reinforcement. A `next` that decided from the state of each
moment would decide differently: the plan's random draws, the hexes it took and freed, the kills it
expected come from that one moment. So the AI's `plan` is the old planTurn and `next` hands its
queue out.

**The AI's draws** come from its own stream, `state.rng.ai` (D8), in the old order: each hex and
attack score draws one `randomFactor[random(0, 7)]` unless it returns early (a hex taken, a target
expected killed, an attack with too many losses), the purchases one per unit picked. A unit that did
nothing in its first pass gets a second one, its moves scored again with new draws. Its scores see
a unit on another hex as a copy of it standing there, the state unchanged (the old AI's Unit.setHex).
Kept: #17 (the attacks count the hidden units' support fire), #21 (the reinforcement budget is the
prestige before the purchases), #22 (the purchases cut the equipment lists, which are in the state,
D9 revised), #74, #82 (it never mounts), the objectives in their list's order (D7, so #141's order
after an undo), the attack estimate's #87 and #90. Its settings are `aiDefaultConfig`
(src/prototypes.ts, the old AI's too).

**The tutorial** (tutorial.ts) is src/aiscripted.ts's script without the UI, both sides of
tutorial.xml, each turn's actions in the old order as data. A turn's script is built when the turn
starts (and when the player joins): the units it names are looked up then, the seven it picked by
their starting hexes or the one on a hex, and its actions are played one by one later whatever
happened in between, as Game.processAction played them: a message pointing at a hex and a selection
are view events, a mount, a move, a reinforcement or a resupply a command (of unit -1, which the step
refuses, where the hex was empty), an attack with no unit or no target says the old game got stuck
there (#80). On turn 4 it empties a unit's fuel while building the script (a change of the world it
returns, so the resupply has something to do) and opens the main menu (a view event of the turn
start, not of an order). Past turn 4 it hands its player over (`Played.handOver`): side 0 to a person,
the other to the AI, which ends that turn having planned nothing. Kept: #80; #81 (the allies'
turn-1 attack is queued twice, at the join and at their turn start, and the AI they are handed to
skips a turn); #188 (five of its seven turn-1 moves can't reach their hexes, so every new game
freezes on turn 2). `{prestige}` in a message stands for the prestige icon, which is the view's.

**What isn't state.** The old AI asked the screen to redraw after deploying (AI.onUnitsDeployed): the
view has the `deployed` events. A controller can also ask the screen for something (`ViewEvent`:
select a unit, show a message, look at a hex, open the main menu) or say that the old game got stuck
there (#80): an `Order` is a command or a view event; a turn start's and a join's view events come
with them (`StartedTurn.view`, `Session.joined`). The surprise attack at the end of an AI move
picks its target with the air mode off (#77: the old game read the human's toggle), as the engine
contract plays it.

## A game headless (#136)

`startSession(w, controllerFor, options)` and `advance(s)` (session.ts) play a game as Game's turn loop
does, without the screen, the clock and the save: the controllers made by the players' types (a
person's player has none: its turns end at once), each advance an order of the current player's
controller or, when it has none left, the end of turn:

    endTurn step -> the next player's controller: startTurn, plan -> the turn limit's defeat
    -> [the save point: Session.saved] -> the side the screen shows -> arriveReinforcements

The game ends at a victory (the step's `victory`, or a retreat that took its side's last objective:
the old game finished the retreat's move after the attack), at the turn limit of a side that plays on
this screen (Game's getLocalSide, computed once when the game starts, or given), or where a
controller says the old game got stuck. A controller that hands its player over at its turn start
is replaced at once by the one the player's new type gets (none for a person); at the join it stays,
as Game.setupPlayers set the scripted handler after its constructor had handed the player over (it
hands it over again at its next turn start). Kept: in a new game the first player's AI doesn't start its turn
(the old game made it without planning: it ends its first turn at once); a game loaded on an AI's
turn has it plan again (#71). `playTurn(s)` plays a turn to its end.

A screen plays the same session one piece at a time (#137): `nextOrder(s)` asks the current player's
controller for its order without playing it (the replay hashes the state there), `play(s, command)`
plays a person's command or an order up to its first checkpoint and `playOn(s, checkpoint, input)`
from there, and `endTurn(s, saved)` ends the turn, calling `saved(started)` at the save point (the
screen shows the units the AI deployed at its turn start, then saves) before the side shown and the
reinforcements. `StartedTurn.type` is the player's type when its turn started (the tutorial may hand
it over then). A campaign scenario's prototype, for its message, is `awardedPrototype(campaign, state)`
(campaign.ts).

`BENCH=1` (test/core-bench.test.ts, 2026-10-22, a loaded laptop), every player the AI, the fixture
loaded on its current player's turn: its plan alone, then its turn played to the end (its orders, the
end of turn, the next player's turn start and plan, the reinforcements), the old game as Game plays
it against the session:

| Per turn | Old engine | Core |
|---|---|---|
| The plan | 7-35 ms | 3-30 ms (1.1-3x faster) |
| The turn | 15-71 ms | 6-31 ms (1.3-3.2x faster) |

## The proof

Until the switch (#137) the core was proven against the old engine, which the tests ran beside it.
The game plays on the core since, and the old engine is gone. Where a test compared the two, the
core's side of it was recorded on the last commit that had both, where they agreed, as hashes: the
game's turns (test/gameturn.test.ts), the AI and the tutorial (test/core-ai.test.ts), the game's
commands with the UI's hooks (test/coreplay.test.ts) and the screen's rules (test/corerules.test.ts)
must still give them, so they still say "as the old engine did". The differential tests of the
commands and of the queries against the old engine (test/core-steps.test.ts,
test/core-differential.test.ts) and the engine contract's AI turns (test/core-aicontract.test.ts)
went with it, their results as measured below; the engine contract runs on the game's commands and
session now (test/coreengine.ts), the gamerules contract on the game's GameRules.

- **The gamerules contract** (test/core-contract.test.ts): the recorded calls of every fixture run
  against the game's `GameRules` (src/gamerules.ts `rulesOn`, test/coreadapter.ts): each call takes
  `toData` of the same restored state and the core's answer, in the old API's shapes. Every rule,
  every unit pair, every result must equal the recording.
  - The spotting and zone of control the queries read are the hexes' counters there: the
    contract's fuzz changes the units under counters that stay. `computeSight` is checked against
    the counters separately, on the restored states.
- **Differential property tests** (until #137: test/core-differential.test.ts, fast-check): random legal
  commands played on the engine fixtures through `Commands.execute`, then on the state reached:
  - the core's sight equals the old engine's recomputation from its units, hex by hex, counts
    included. Where the old counters drift from it (#72, #73), the state is masked by name: its
    queries read the counters;
  - the contract's whole battery (every unit, every unit pair, the dice) answers the same on both
    engines, the core reading only `toData` and its own sight where nothing drifts;
  - attacks from a seeded game stream: the same results, the stream left at the same place.

  CI plays 12 sequences (about 100,000 compared answers); `FC_RUNS=120` played 120 (over a million,
  12 states with drift) with no difference.
- **The commands against the old engine** (until #137: test/core-steps.test.ts, fast-check): random command
  sequences on the engine fixtures, the legal ones the old engine offers and any command at all
  (one in eight), each played through `Commands.execute` and through `step`, the core playing on
  from its own state. After every command: the same answer (and `check`'s), the same toData as JSON
  (the save's key order, the random streams' positions), the core's sight equal to `computeSight`
  and to the old counters, the old engine's hooks and the core's events telling the same story, and
  the state given to the step unchanged (frozen). The end of turn plays on both as the game plays
  it, hotseat: the command, the side shown, then the reinforcements, with `outcome` against
  checkOutcome after every command; no player plans (the AI is #136). Where the old counters drift (#73) with the same state after, they are made
  again from the units and the sequence goes on; drift that changed the command's result stops the
  sequence. CI plays 20 sequences (about 220 commands); `FC_RUNS=1000` played 11,948 commands, 921
  of them ends of turn (388 reinforcements arrived), with no difference, 333 resyncs and no state
  masked.
  - the engine contract's own commands (the AI's and the random actions of the 15 fixtures, about
    3,000), each also stepped on the core from toData of the state before it: no difference; 7
    masked where a selected unit left its disembark (D6). Its 60 ends of turn too, compared where the
    next player's turn starts (`GameMap.onPlayerTurn`, before an AI player buys and plans), whichever
    side the fixture shows, and the reinforcements Game deploys after them (42 arrive) on their own.
  - every fixture's turns ended past a turn limit set to the next turn, the screen showing side 0,
    side 1 or none (#75): the new rounds, the reinforcements, the defeat of the side shown.
  - scripted: buy, deploy, upgrade off and on the map, sell and disband on every fixture that can
    deploy; a campaign's kills and losses in the dossier.
- **A new game against the old loader** (test/core-newgame.test.ts; against the game's own path,
  src/coreload.ts, since #137): a scenario file started by Game.newScenario and by `newGame` from the
  same file and the equipment's own files, the streams seeded: the same toData as JSON. CI starts every eighth file of the scenario list (51 of its 403 entries) and some
  against the AI and the scripted tutorial; `CORE_ALL_SCENARIOS=1` starts them all (17 s): no difference.
- **A campaign against the old engine** (test/core-campaign.test.ts; against the game's own path
  since #137): every campaign of the list
  (17), at each difficulty in turn, started by Game.newCampaign and by `newGame`, then up to three
  scenarios ended with an outcome by Game.continueCampaign and by `endCampaignScenario` (a core unit
  hurt, one destroyed and one bought in between), the next started by both: the same toData after
  every start. 17 starts, 35 transitions, 7 prototypes awarded, 6 campaign ends, one stop (#182), no
  difference.
- **The AI against the old AI** (test/core-ai.test.ts, pinned by hashes since #137): the old game played headless as Game plays it
  (test/aigames.ts: processAction, the UI's move and attack finished at once, Game.endTurn) and the
  core's session, in lockstep from toData of the same state, the streams seeded. After every advance:
  the same order (the old AI's action as the command it amounts to), the same answer (the old game's
  skipped attack is the step's refusal), the same purchases and deployment as commands at a turn's
  start, the same state after the plan (the save point), the same toData, the core's sight equal to
  computeSight and to the old counters, and the game ending at the same advance, the same way. The
  games: the 15 engine fixtures loaded on their current player's turn and harness/replay.sh's 16
  items, new games AI against AI. The tutorial is played by the core's tutorial against the old
  AIScripted: from its start (stuck on turn 2 as the old game, #80), the engine fixture on its turn
  2, and from turns 3 and 4 with its units where its script meant them to be (a new game never gets
  there, #188) and from turn 5 (the hand-over), as a game loaded on that turn: the same orders
  (messages, selections, commands, the stuck attack), the same view events at the join and at each
  turn start (the main menu of turn 4), the same toData after each, the same end. Masked: the old
  counters' drift (#72, #73), made again from the units before the next advance. CI plays 2 rounds, 7
  for the tutorial (34 games, 3,700 orders, 3,842 states, 142 turns, 951 turn start commands; the
  tutorial's 5 games 131 orders, 3 stuck); `CORE_AI_ROUNDS=10` played 15,881 orders, 16,438 states,
  557 turns, 1,047 turn start commands, 7 victories, a turn limit and 3 stops at #80: no difference.
- **The engine contract's AI turns** (until #137: test/core-aicontract.test.ts): each AI of the contract (the AI
  players' and the human players' stand-ins) has the core's AI beside it, and each scripted player
  (scripted-tutorial-t2) the core's tutorial, from toData of the state before each call: the same
  turn start commands, the same view events when it is made and at its turn start, the same state
  after the plan, the same order at each action the contract takes. 68 plans, 336 turn start
  commands, 2,486 orders: no difference.
- **Hand-built games** (test/core-session.test.ts): the turn's order (#94, #93), the turn limit for
  the side on the screen, a stuck controller, a player handed over, the view events of the joins.
- **Hand-built situations** (test/core.test.ts): the rules as they read, such as the combat record
  of a Pz IIA against a 7TP in a forest, the draws of an attack, a flag taken and given back by the
  undo, a new round, #75's hiding, the turn limit, the reinforcements arriving, and the path search against the old engine's on maps full of equal paths.
