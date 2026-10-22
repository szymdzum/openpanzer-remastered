# The game state as data

**Status: proposal (#132), to be agreed before #127.** This shape becomes `toData`'s output on the
old engine (#127), the save format (#128) and the state of the new core (#129). The decisions
below are numbered so a review can answer them one by one.

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
	file: string;			//the scenario's file: the static data (terrain, names) is read from it (D3)
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

The campaign part (`CampaignState`: id, file, scenario index, difficulty, starting prestige and
the flags Game keeps in its closure between scenarios: whether to award a prototype, whether
non-campaign units are removed, whether it's the campaign start) and `Dossier`,
`EquipmentState`, `UndoState`, `RngState` are spelled out in #127.

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

**D3. Static map data stays in the scenario file.** Terrain, roads, names, deployment hexes and
the map image don't change during a game. The state keeps `scenario.file` and the five fields
that do change per hex. A save is smaller and can't disagree with the scenario.
The cost: a save needs its scenario file. It always has (the loader reads it today), and a hash
of the file in the save can catch a changed scenario.

**D4. References by id; players by index.** A unit has `owner: PlayerId`, a hex `unit: UnitId`.
`getPlayer` already looks up by index (map.ts:708); the state makes `players[id].id === id` an
invariant. No object graph, so a state can be copied with `structuredClone` and compared with a
deep equal.

**D5. Undo: the state keeps whether the last move can be undone; the previous state is the
session's.** Today's single slot (`UndoSlot`: the saved unit, the old owner, flag, objective,
prestige and score) exists because objects can't be copied cheaply. In the new core the session
keeps the state before each move; `turn.undoable` holds what the rules need to decide (the move,
whether it spotted a unit or was surprised). Multi-level undo (#36) is then a list of states.
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
state.

**D9. The AI's removals from the equipment lists are state, while #22 is kept.** The AI's
purchases splice the shared lists (#22), which changes what it can buy later in the session. To
reproduce it, the state lists what was removed per country; after #22 is fixed, this goes.

**D10. Spotting and zone of control are derived, not stored.** They are computed from the units
(at most about 180 units on 1716 hexes, about 35 ms of engine work per AI turn today). Stored
counters drift today (#72, #73), so the differential tests mask those two issues until the
switch. `tempSpotted` is stored: it records an event (a unit fired from hiding), not a sight
line.

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

## Size

For the 376 scenarios: 150 to 1716 hexes (median 1443), 1 to 178 units at the start (median
68), up to 143 reinforcements, 2 players. Five numbers per hex and about 25 fields per unit give
a state of a few tens of kilobytes.
