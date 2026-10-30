/**
 * The core's types: the state's (re-exported from state.ts) and what the queries take and answer. Types only:
 * every core module imports them, they import nothing that runs.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Command, Refusal } from "./command";
import type { AIConfig } from "./tables";
import type { RngStream } from "./random";
import type { GameState, Position, ScenarioData, UnitId, UnitState } from "./state";
import type { GameEvent } from "./events";

export type {
	CoreUnit, GameState, HexState, OffMapUnit, PlayerState, Position, ScenarioData, UndoState, UnitId, UnitState
} from "./state";

/** The outcomes of a scenario, as checkVictory returns them (the campaign outcome keys). */
export type ScenarioOutcome = "briliant" | "victory" | "tactical" | "lose";

/** The equipment by eqid, as loaded: read-only. */
export type EquipmentTable = Readonly<{ [eqid: string]: EquipmentEntry }>;

/** What a query reads (docs/CORE.md): data, state, equipment, rules, other inputs, and what is derived (D2, D10). */
export interface World {
	readonly data: ScenarioData;
	readonly state: GameState;
	readonly equipment: EquipmentTable;
	readonly rules: Ruleset;
	//The fog of war off (uiSettings.noFOW): every hex is spotted
	readonly noFOW: boolean;
	//The side the screen shows (game.spotSide), -1 for none. An input as noFOW is, not state; the rules
	//don't read it: the end of turn hides the units this side didn't see (#75)
	readonly spotSide: number;
	//Units an attack destroyed whose removal hasn't run yet (they stay in the unit list until the cleanup
	//after the attack, as in the original): they can't fire or be fired on. Empty between steps
	readonly destroyed: ReadonlySet<UnitId>;
	//Unit id -> its index in state.units (D2)
	readonly index: ReadonlyMap<UnitId, number>;
	//Spotting and zone of control (D10)
	readonly sight: Sight;
	//The move range's hex -> cell table, reused from one call to the next (movement.ts)
	scratch: Int32Array | null;
}

/** How many units of each side spot a hex and have it in their zone of control, by hex index (row * cols + col). */
export interface Sight {
	spot: [Uint16Array, Uint16Array];
	zoc: [Uint16Array, Uint16Array];
}

export type RulesetName = "classic" | "remaster";

export interface Ruleset {
	name: RulesetName;
	//The movement cost tables by ground condition (dry, frozen, mud): a row per movMethod, a cost
	//per terrainType and the road last. 254 stops the move (the hex can be entered), 255 can't
	//be entered
	movement: number[][][];
	//The leaders each unit class can get (leaderType), by unitClass: the first is the class leader
	leaders: number[][];
	//The class leader of each unit class (a leaderType, -1 for none): every unit with a leader
	//has its class's too
	classLeaders: number[];
	//The steps that make an attack's values, in order (combat.ts)
	combat: CombatStep[];
	//An aircraft of range 1 attacks a ground unit on the next hex too, as in PG2, not only the one below
	//it (attack.ts attackCells, #285): false in the classic rules, as the original's screen
	airAttacksNextHex: boolean;
	//The core's check of an attack takes only a target the attacker's side sees and the unit can start
	//an attack on, as the screen lists them (#285): false in the classic rules, where it asks only the
	//distance, as the original AI's attacks do
	checkTargets: boolean;
	//A side the scenario gave no deployment hex deploys a unit it bought on a city it owns (an aircraft on
	//an airfield, a ship on a port) with no enemy it sees on it or next to it (deployment.ts, #302): false
	//in the classic rules, where it can't buy (#60)
	deployOnOwnTowns: boolean;
	//A side whose units on the map are all gone isn't eliminated while it has units waiting to deploy (its
	//players' reserve) or to arrive (its reinforcements), as in PG2 (#115): false in the classic rules,
	//where only the units on the map count
	waitingUnitsFight: boolean;
	//A unit's new leader can be any of its class's list but the class leader (#78): false in the classic
	//rules, where the roll leaves out the list's last two
	wholeLeaderList: boolean;
	//At the turn limit the attacker, the side that had more objectives to take at the start, loses unless it
	//took them all, and the defender wins by holding out, as in PG2 (turn.ts, #256); the game ends there once
	//both sides have played their last turn. False in the classic rules, where the side that ended its last
	//turn loses whatever it holds, and the game ends at the last turn of a side that plays on the screen
	defenderHoldsOut: boolean;
	//A capture of a side's last objective wins only for a side that had objectives to take at the start
	//(turn.ts winsByCapture, #91), as PG2 gives every side victory hexes of its own to take: false in the
	//classic rules, where a defender that had none wins by retaking the one it lost
	captureNeedsObjectives: boolean;
	//An upgrade to equipment no transport carries takes a mounted unit off its transport (#546): false in the
	//classic rules, where it stays mounted with no transport
	unmountsWithoutTransport: boolean;
	//A mounted anti-tank, flak, artillery or air-defence unit can't capture a hex (#544): false in the classic
	//rules, where the class tested is its transport's, so it can
	mountedGunsDontCapture: boolean;
	//How the computer player plays (ai.ts)
	ai: AIRules;
}

/** The AI's rules: its settings and the remaster's switches to its play, each off in the classic rules. */
export interface AIRules {
	config: AIConfig;
	//The share of the bonus for staying entrenched that a side attacking keeps for a unit away from the
	//enemy (#235): 1 in the classic rules, where a unit that has dug in stays whether its side attacks
	//or defends
	attackerEntrenchment: number;
}

/** A hex of a move range (the original's extendedCell): its distance, cost to enter (cin) and leave (cout) it. */
export interface MoveCell {
	row: number;
	col: number;
	range: number;
	cin: number;
	cout: number;
	cost: number;
	canMove: boolean;
	canPass: boolean;
}

/** A hex of a path (the original's pathCell): the cost of entering it and the cost of the path up to it. */
export interface PathCell {
	row: number;
	col: number;
	cost: number;
	dist: number;
}

export interface Supply {
	ammo: number;
	fuel: number;
	transportAmmo: number;
	transportFuel: number;
}

/** An attack's result: the strength the defender (kills) and the attacker (losses) lose, the experience gained. */
export interface CombatResult {
	kills: number;
	losses: number;
	atkSuppress: number;
	defSuppress: number;
	atkExpGained: number;
	defExpGained: number;
	defcanfire: boolean;
	atkLeaderGain: boolean;
	defLeaderGain: boolean;
	isOverrun: boolean;
	isRugged: boolean;
}

/** The four values an attack compares: attacker's attack (aav) and defense (adv), defender's (dav, ddv). */
export interface CombatValues {
	aav: number;
	adv: number;
	dav: number;
	ddv: number;
}

export type Side = "attacker" | "defender";

/** What a combat step changed: `{ name: "rugged defense", side: "defender", field: "aav", before: 9, after: 4.5 }`. */
export interface Contribution {
	name: string;
	side: Side;
	field: keyof CombatValues | "kills" | "losses";
	before: number;
	after: number;
}

/** An attack while its steps run: the units, what they fight as, and the values the steps change and record. */
export interface Fight {
	readonly world: World;
	readonly atk: UnitState;
	readonly def: UnitState;
	readonly aData: EquipmentEntry;
	dData: EquipmentEntry;		//a mounted infantry defender fights on foot
	readonly aType: number;		//the unitType each counts as, read before the defender dismounts
	readonly dType: number;
	readonly aTerrain: number;	//Clear for an air unit
	readonly dTerrain: number;
	readonly aRoad: number;
	readonly dRoad: number;
	readonly distance: number;
	readonly aEntrenchIntact: boolean;
	readonly dEntrenchIntact: boolean;
	isCloseCombat: boolean;
	readonly values: CombatValues;
	readonly result: CombatResult;
	readonly record: Contribution[] | null;
}

export interface CombatStep {
	name: string;
	run(fight: Fight): void;
}

/** A step's world (draft.ts): the state copied on write, with the index, sight, game stream and events. */
export interface Draft extends World {
	readonly state: GameState;
	index: ReadonlyMap<UnitId, number>;
	readonly sight: Sight;
	//The objects of the state this step copied already: it changes them in place
	readonly copied: Set<object>;
	//The game's stream (D8): the dice and the leaders draw from it
	readonly rng: RngStream;
	readonly events: GameEvent[];
}

/** A command's handler: `check` says whether it is allowed, or why not; `run` plays it on a draft once allowed. */
export interface CommandHandler<C extends Command> {
	check(w: World, cmd: C): Refusal | null;
	run(d: Draft, cmd: C): void;
}

export interface AttackStart {
	attacker: UnitId;
	defender: UnitId;
	atkStrength: number;
	defStrength: number;
}

/** Where a move or an attack waits for the screen to animate it; a program goes on at once. */
export type Checkpoint =
	//The unit moved: next, the surprise attack on the hidden enemy it ran into and the capture's victory
	| { next: "surprise"; unit: UnitId; surprise: Position | null; win: boolean }
	//The shots were fired: next, the destroyed units leave the map
	| { next: "cleanUp"; attack: AttackStart }
	//The destroyed units are gone: next, the retreat or the surrender, and the elimination victory
	| { next: "end"; attack: AttackStart; attacker: UnitState | null };

