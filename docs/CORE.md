# The new engine core

Stage C of docs/REFACTOR.md step 4 (#129): a core with the same gameplay, built beside the old
engine and proven against it, layer by layer. This page says how it is laid out; the state it
works on is docs/STATE.md's.

    state = plain data (GameState, docs/STATE.md)
    queries(world, ...) -> answers		layer 1, #133: this page
    step(state, command) -> { state', events }	layer 2, #134

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
| `destroyed` | units an attack destroyed whose removal hasn't run yet | empty between steps |
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

The path search was a move's main cost (the old engine's compares every open hex at each turn,
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
- **Hand-built situations** (test/core.test.ts): the rules as they read, such as the combat record
  of a Pz IIA against a 7TP in a forest, and the path search against the old engine's on maps full
  of equal paths.
