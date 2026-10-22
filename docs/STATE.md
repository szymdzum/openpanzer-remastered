# The game state as data

**Status: agreed (#132), 2026-10-22: the recommended option of each decision.** This shape becomes
`toData`'s output on the old engine (#127), the save format (#128) and the state of the new core
(#129). The decisions are numbered so later changes can name the one they revise.

## Why

Today the state is spread over objects that point at each other: a hex holds its unit, the unit
holds its hex in a closure and its player as an object, the core lists, the undo slot, the
visibility counters and the selection live in closures, the random stream lives outside the
game. The save is `JSON.stringify` of whatever the objects hold, so it loses what sits in
closures and renumbers what it rebuilds (#54, #55, #71, #83, #84, #85, #142, #149, #150). The
harness and the contracts each walk the objects their own way.

One plain-data state gives one answer to "what is the game": what a step reads and writes, what
the save stores, what the tests compare.

## The shape

```ts
interface GameState {
	version: 1;
	scenario: ScenarioState;
	map: MapState;
	units: UnitState[];		//the units on the map, in the order they were placed (D2)
	nextUnitId: UnitId;		//lost today (#85)
	players: PlayerState[];		//index == player id (D4)
	turn: TurnState;
	objectives: [Cell[], Cell[]];	//each side's victory hexes still to take, in their order (D7)
	reinforcements: Reinforcement[];
	rng: { game: RngState; ai: RngState };	//the cosmetic stream isn't game state (D8)
	campaign: CampaignState | null;
	equipment: EquipmentState;	//what the AI's purchases removed (D9)
}

interface ScenarioState {
	file: string;			//the scenario it was loaded from, for the record (D3)
	date: string;			//ISO date of the current turn
	turnsPerDay: number;
	dayTurn: number;		//lost today (#55)
	atmospheric: number;
	ground: number;			//dry, frozen, mud: picks the movement table of the ruleset
	latitude: number;
	maxTurns: number;
	victoryTurns: [number, number, number];
	expPerSide: [number, number];	//lost today (#83)
	unitsCostPerSide: [number, number];
}

interface MapState {
	rows: number;
	cols: number;
	lastRowPartial: boolean;	//lost today (#54)
	lastColPartial: boolean;
	hexes: HexState[];		//flat, index row * cols + col
}

interface HexState {			//only what changes during a game (D3)
	unit: UnitId | null;
	air: UnitId | null;
	owner: PlayerId | -1;
	flag: number;			//a country, -1 for none
	victorySide: number;		//-1 when not an objective
}

type UnitId = number;
type PlayerId = number;

interface UnitState {
	id: UnitId;			//given when the unit enters the map, never changed (D1)
	eqid: number;
	owner: PlayerId;		//no player object (D4)
	row: number;
	col: number;
	transport: { eqid: number; ammo: number; fuel: number } | null;
	carrier: number;		//an eqid, 0 for none; negative while disembarking (kept)
	strength: number;
	moveLeft: number;
	ammo: number;
	fuel: number;
	hits: number;
	experience: number;
	entrenchment: number;
	entrenchTicks: number;
	leader: number;			//-1 for none
	facing: number;
	flag: number;
	isCore: boolean;
	isMounted: boolean;
	hasMoved: boolean;
	hasFired: boolean;
	hasResupplied: boolean;
	hasOverstrength: boolean;
	isSurprised: boolean;
	tempSpotted: boolean;		//lost today (#84)
}

type OffMapUnit = Omit<UnitState, "id" | "row" | "col">;	//a unit not on the map has no id (D1)

interface PlayerState {
	id: PlayerId;
	side: number;
	country: number;
	type: number;			//human, AI, scripted, remote: the controller is not state (D6)
	prestige: number;
	prestigePerTurn: number[];
	score: number;
	playedTurn: number;
	airTransports: number;
	navalTransports: number;
	supportCountries: number[];
	dossier: Dossier;
	core: CoreUnit[];		//the player's core units in their order (#142)
}

type CoreUnit = { onMap: UnitId } | { reserve: OffMapUnit };	//deployed, or bought and waiting (#149)

interface TurnState {
	turn: number;
	currentPlayer: PlayerId;	//lost today (#71)
	undoable: UndoState | null;	//the last move, while it can be taken back (D5)
}

interface Reinforcement {
	turn: number;			//a number, not a string (#55)
	row: number;
	col: number;
	unit: OffMapUnit;
}
```

The campaign part, `Dossier`, `EquipmentState`, `UndoState` and `RngState` are spelled out in
#127, below.

## On the old engine (#127)

`src/state.ts` has the types, `toData(scenario, game)` and `fromData({ data, state }, game)`, which
builds the old engine's objects again (the equipment and the campaign loaded already). What
#127 spelled out, and where the old engine made the sketch above more precise:

- **`ScenarioData`**: the scenario's name and description, the equipment set, the map image, and
  per hex the terrain, the roads, the name and the deployment player.
- **`CampaignState`**: the campaign's index in the campaign list and its data file, the index of
  the scenario played, the campaign player's country, the difficulty, the starting prestige, and
  `progress`, the three flags Game keeps in its closure between scenarios (`isStart`,
  `removeNonCampaignUnits`, `awardPrototype`). Game's other closure variables aren't state: the
  local side follows from the player types, the saved campaign player is overwritten before it is
  read, and the scenario load waiting for the player's click happens between scenarios.
- **`Dossier`** is the player's dossier as it is: the units lost (core, auxiliary) and killed by
  unit class, the scenario names by outcome; empty until the first campaign scenario sets it up.
- **`UndoState`**: the unit, the unit as it was before the move (`UnitState`, where it stood), and
  what the capture changed (old owner, flag and objective side, `null` when unchanged, the prestige
  and score gained). `UndoSlot` with no unit is `null`: the rest of the slot is never read then.
- **`RngState`** is a number, the position of the game's and the AI's streams (`src/rng.ts`):
  fromData sets both back. `rng` is `null` while the game stream isn't seeded and reads
  `Math.random` (a test that seeds `Math.random`, as the contracts were recorded): its position
  can't be read then. The game seeds its streams when it starts (`src/main.ts`), the harness
  with `Rng.seed`.
- **`expPerSide`** keeps the experience total and the unit count of each side: the average a
  bought unit gets divides them.
- **`victoryTurns`** is the scenario's list as loaded (`number[]`).
- **A unit in the list on no hex** has row and col -1: `Player.setPlayerToHQ` leaves its units in
  the map's list.
- **`CoreUnit`** has a third case, `{ lost: OffMapUnit }`: a core unit destroyed on the map stays
  in the list until the player goes to HQ.
- **D9, revised:** `EquipmentState` holds the lists by country and unit class, not only what the
  AI removed. The purchase window sorts them in place, and the order decides what the AI buys and
  which transport a unit embarks on.
- **Left out on purpose:** the selection and the handlers (D6), the spotting and zone of control
  counters (D10: fromData counts them again, the drift of #72 and #73 is lost), the unit icons, an
  off-map unit's stale id (D1), a destroyed unit still in the list (only between an attack and the
  `updateUnitList` after it), and the fields only ever written (`hasRessuplied`, `nodossier`,
  `hasAnimation`).

## The save (#128)

`src/savegame.ts` writes and reads the save: `{ version: 1, data: ScenarioData, state: GameState }`,
toData's output with the format's version first (D3, D11). Every save path writes it: the local
save (one item, `openpanzer-game-<major version>`, where the format before had three: the scenario,
its players and the campaign's progress), which the game writes at the end of a turn and when a
scenario starts or is loaded, the file export and the cloud save. The settings stay an item of
their own. A load reads the save, loads the equipment of the players' countries and the campaign,
and builds the game with fromData.

- **Self-contained.** The load reads no scenario file: the scenario's name and description, the map
  image and the per-hex terrain, roads, names and deployment players are `ScenarioData`; the date,
  weather, turns and victory turns are `ScenarioState`; the reinforcements, the units and the core
  lists are the state. The equipment isn't embedded: like the map image it is the game's, picked by
  the set's name (`ScenarioData.equipment`) and the players' countries. The data of the units a
  save uses would be needed only if an equipment file changed under a save; the remaster's fixes so
  far are to scenario files.
- **The format before** (the `GameStateExport` of gamestate.ts: the JSON of the scenario, the
  players and the campaign's progress, or the three local items) is imported: `importSave` keeps
  what that save had (the units with their ids, in the order of their ids, which is the order they
  were placed; whose turn, the time of day, the partial edges, the experience per side,
  tempSpotted, the campaign player's core list as it was, its destroyed units included) and lists
  what it never stored as unknown (`UnknownPart`). The load keeps the game's own there, as loading
  such a save always did: the description from the scenario list, the equipment lists as loaded,
  the random streams where they are, Game's campaign progress, the campaign's starting prestige;
  no undo, no core units for the players who don't play the campaign. The next unit id is the one
  after the highest. A save whose unit ids aren't unique (stale ids, #64) has them numbered again
  in hex order, as its load always did. A save without an equipment set (older than 3.x) keeps the
  game's set, as before.
- **Lost on load until fixed.** The load first did what the old load did, so the format changed
  nothing else; each loss is fixed in its own commit, naming its issue. Still lost: whose turn
  (#71), the partial edges (#54), the time of day (#55), the experience and cost per side (#83),
  tempSpotted (#84), the unit ids and order (#85), the campaign player's core list (rebuilt from
  the map with the AI's core units, #142, #150), the other players' core lists (#149), and of #128
  itself the undo, the random streams, the equipment lists, the campaign's progress and the
  scenario's description. The reinforcement part of #55 is no loss in this format: the list has
  numeric turns and no ids.

## Decisions

**D1. Unit ids: given when a unit enters the map, never changed.** Today `MapBoard.add` numbers
units as they are placed (board.ts:37-38) and the save renumbers them (#85). The AI walks the
units in placement order (ai.ts:208-216), so ids and order are behavior. Keeping today's
assignment, and keeping the ids across a save, makes the new core's ids equal the old engine's,
so the differential tests compare states directly. Units off the map (reinforcements, a core
unit waiting to be deployed) have no id; they get one when they're placed. This also ends stale
ids carried between scenarios (#64). `nextUnitId` is stored: a destroyed unit's id isn't
reused, so it can't be read from the units left.

**D2. `units` is an array in placement order, not a map by id.** Ids grow with placement and a
removal keeps the order (`splice`), so placement order and id order are the same list. An
index by id (`Map<UnitId, number>`) is built on load and kept by the core, not stored.

**D3. The static map data is separate from the state, and the save carries both.** Terrain,
roads, names, deployment hexes and the map image don't change during a game, so they are a
`ScenarioData` object of their own: read-only, shared, never copied by a step or an undo. The
state's hexes hold only the five fields that change. The save is self-contained: `{ data, state }`,
the scenario data embedded, not read back from the scenario file. The remaster will fix scenario
files (#61, #65); a save that read the file again would then load a different map under its
units. Unciv and Wesnoth saves carry their map the same way. The data adds about 1716 hexes
of a few small fields, tens of kilobytes, well inside localStorage.

**D4. References by id; players by index.** A unit has `owner: PlayerId`, a hex `unit: UnitId`.
`getPlayer` already looks up by index (map.ts:708); the state makes `players[id].id === id` an
invariant. No object graph, so a state can be copied with `structuredClone` and compared with a
deep equal.

**D5. Undo: the state keeps whether the last move can be undone; the previous state is the
session's.** Today's single slot (`UndoSlot`: the saved unit, the old owner, flag, objective,
prestige and score) exists because objects can't be copied cheaply. In the new core the session
keeps the state before each move; `turn.undoable` holds what the rules need to decide (the move,
whether it spotted a unit or was surprised). Multi-level undo (#36) is then a list of states: with the static data out (D3), a state is
small enough to keep one per move.
On the old engine (#127) `undoable` is filled from `UndoSlot`.

**D6. Not state: the selection, the controllers, the UI settings, the combat log.**
- `currentUnit`, `isMoveSel`/`isAttackSel` and the move and attack cells are the UI's (they're
  saved today and never read back).
- A player's `handler` is a controller chosen from `type`; the AI's plan and queue are its
  memory during its turn (saves happen at turn start).
- `noFOW` and `airMode` are inputs to a query or a command, not state; `isAI` picks the
  controllers.
- The combat log is built from the core's events.

**D7. Objectives keep their order.** The AI takes the first of equally near objectives
(ai.ts:653-665), so the order of each side's list is behavior (#141).

**D8. The random streams are state; the cosmetic one isn't.** After #126 the game and the AI
draw from seeded streams whose position is saved, so a loaded game rolls the same dice as the
one that was saved. The UI's sprite and sound picks draw from their own stream, outside the
state. The generator is a few lines of our own, mulberry32 (the harness already seeds the game
with it, harness/lib/harness.js:158): its whole state is one 32-bit number, so `RngState` is a
number and a step can draw from a copy. pure-rand, which fast-check uses, doesn't document a way
to save and restore a generator's state, and the game needs nothing more than uniform draws.

**D9. The AI's removals from the equipment lists are state, while #22 is kept.** The AI's
purchases splice the shared lists (#22), which changes what it can buy later in the session. To
reproduce it, the state lists what was removed per country; after #22 is fixed, this goes.

**D10. Spotting and zone of control are derived: recomputed after each step, kept beside the
state, never saved.** They follow from the units: at most about 180 units on 1716 hexes, a few
thousand operations per recompute, against about 35 ms of engine work per AI turn today. A
full recompute at the end of every step can't drift, unlike today's hand-kept counters (#72,
#73); the differential tests mask those two issues until the switch. The result is a cache
next to the state (rebuilt on load), so queries read it without recomputing. `tempSpotted` is
stored: it records an event (a unit fired from hiding), not a sight line.

**D11. Dates as ISO strings, a version number, today's saves imported.** `version: 1` starts
the format; a loader for the current format (the `GameStateExport` of gamestate.ts) converts
old saves, with what they lost marked as unknown.

## What it changes

- **#127:** `toData(game)` and `fromData(state)` on the old engine produce and read this shape.
  The harness snapshot and the engine contract hash compare it.
- **#128:** the save is this state, versioned.
- **#133:** the new core's types are these.
- **Lost today and kept by this shape:** #54, #55, #71, #83, #84, #85, #142, #149, and the units
  of #150 (they stay the AI's). Each is fixed in its own commit when the save moves to it.
- **#149:** a save outside a campaign keeps the bought units (`core` with `reserve`).

## What the decisions rest on

- The state inventory of #132 (fields, closures, what the save loses), with the bugs it found:
  #149, #150 and the stale ids noted on #64.
- How other turn-based games keep their state: Unciv's JSON saves embed the whole tile map
  ([a community guide to the save format](https://app.notion.com/p/WIP-Savefile-Editing-3a9c1098d3bf8050ba46c00747d5359c));
  Wesnoth unified its save format and removed data stored twice
  ([GSoC 2009 savegame project](https://wiki.wesnoth.org/SummerOfCodeProposal_Euschn));
  boardgame.io keeps the game as plain data with a seeded random generator in it, so earlier
  states can be replayed.
- pure-rand's documentation ([github.com/dubzzz/pure-rand](https://github.com/dubzzz/pure-rand)):
  four generators, stateful or pure, no documented way to save a generator's state.

## Size

For the 376 scenarios: 150 to 1716 hexes (median 1443), 1 to 178 units at the start (median
68), up to 143 reinforcements, 2 players. Five numbers per hex and about 25 fields per unit give
a state of a few tens of kilobytes.
