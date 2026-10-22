# The new engine core

Stage C of docs/REFACTOR.md step 4 (#129): a core with the same gameplay, built beside the old
engine and proven against it, layer by layer. This page says how it is laid out; the state it
works on is docs/STATE.md's.

    state = plain data (GameState, docs/STATE.md)
    queries(world, ...) -> answers		layer 1, #133
    step(world, command) -> { world', events }	layer 2, #134 (world'.state is state')
    the end of turn, the reinforcements, the outcome	layer 3, #135

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
| `geometry.ts` | distance, adjacency, cells in range (with #69), directions, the partial edge hexes |
| `equipment.ts` | the equipment's attribute bits: bridge, ignores entrenchment, which targets a unit can start an attack on |
| `units.ts` | the predicates: air, sea, ground, train, leaders, enemies, fuel and ammo, mount, entrench, capture |
| `sight.ts` | spotting and zone of control computed from the units (D10), and who a unit spots |
| `movement.ts` | move range and shortest path (with #70), retreat, deploy and disembark positions, embark |
| `attack.ts` | attack range and cells, who can fire on whom, support fire |
| `combat.ts` | the attack and combat results as named steps with a record of what each contributed (#118) |
| `supply.ts` | resupply and reinforcement: whether, and how much |
| `costs.ts` | unit, upgrade and sell costs |
| `turn.ts` | a unit's end of turn (entrenchment, #75's hiding), the reinforcements arriving, the turn limit, the victory rating and the outcome |
| `step.ts` | `step` and `check`, the handlers' registry |
| `draft.ts` | the state a step changes, copied on write, and its primitives: place, relocate, remove a unit with its sight, the score, the dossier |
| `events.ts` | the events a step emits (types) |
| `fight.ts` | an attack: each shot resolved then applied, the attack's finish (destroyed, retreat, surrender, elimination), the surprise attack |
| `moves.ts` | a move: the path walked, the surprise, the capture, the fuel and points, the undo it leaves |
| `commands/` | the handlers, `check` and `run` of each command type (`move.ts`: move and attack, `supply.ts`, `transport.ts`, `undo.ts`, `units.ts`: deploy, buy, upgrade, disband, sell; `turn.ts`: the end of turn) |

The core imports only `src/prototypes.ts` (the enums and tables), `nextRandom` of `src/rng.ts`
and types: no UI module, no mutable object of the old engine (the linter checks it).

**Kept bugs are kept.** The classic ruleset reproduces the old engine exactly, every kept bug
included (#69, #70, #167, #87, #88, #90, #95, #19, #23...): they are fixed after the switch, in the core.

**Hot paths.** The AI calls the move range and the combat result many times a turn: they allocate
only their answer, the move range finds a cell's neighbours through a reused hex-to-cell table
(the old engine compares every pair of cells). `BENCH=1 npx vitest run test/core-bench.test.ts`
measures them against the old engine on the 15 engine fixtures (2026-10-22, on a loaded laptop):

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

## The proof

- **The gamerules contract on both engines** (test/core-contract.test.ts): the recorded calls of
  every fixture run against `test/coreadapter.ts`, the old `GameRules` API on the core: each call
  takes `toData` of the same restored state and the core's answer, turned back into the old
  shapes. Every rule, every unit pair, every result must equal the recording.
  - The spotting and zone of control the queries read are the old engine's own counters there: the
    contract's fuzz changes the units under counters that stay (as #73 does). `computeSight` is
    checked against the counters separately, on the states where they don't drift.
- **Differential property tests** (test/core-differential.test.ts, fast-check): random legal
  commands played on the engine fixtures through `Commands.execute`, then on the state reached:
  - the core's sight equals the old engine's recomputation from its units, hex by hex, counts
    included. Where the old counters drift from it (#72, #73), the state is masked by name: its
    queries read the counters;
  - the contract's whole battery (every unit, every unit pair, the dice) answers the same on both
    engines, the core reading only `toData` and its own sight where nothing drifts;
  - attacks from a seeded game stream: the same results, the stream left at the same place.

  CI plays 12 sequences (about 100,000 compared answers); `FC_RUNS=120` played 120 (over a million,
  12 states with drift) with no difference.
- **The commands against the old engine** (test/core-steps.test.ts, fast-check): random command
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
- **Hand-built situations** (test/core.test.ts): the rules as they read, such as the combat record
  of a Pz IIA against a 7TP in a forest, the draws of an attack, a flag taken and given back by the
  undo, a new round, #75's hiding, the turn limit, the reinforcements arriving, and the path search against the old engine's on maps full of equal paths.
