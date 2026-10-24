/**
 * The core's types: the state's (src/state.ts, one source of truth) and what the queries take and
 * answer. Types only: every core module imports them, they import nothing that runs
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Command, Refusal } from "../commands";
import type { AIConfig } from "../prototypes";
import type { RngStream } from "../rng";
import type { GameState, Position, ScenarioData, UnitId, UnitState } from "../state";
import type { GameEvent } from "./events";

export type {
	CoreUnit, GameState, HexState, OffMapUnit, PlayerState, Position, ScenarioData, UndoState, UnitId, UnitState
} from "../state";

//The equipment by eqid, as loaded (Equipment.equipment): read-only
export type EquipmentTable = Readonly<{ [eqid: string]: EquipmentEntry }>;

//What a query reads (docs/CORE.md): the data, the state, the equipment and the rules, the inputs
//that aren't state, and what is derived from the state, kept beside it (D2, D10)
export interface World {
	readonly data: ScenarioData;
	readonly state: GameState;
	readonly equipment: EquipmentTable;
	readonly rules: Ruleset;
	//The fog of war off (uiSettings.noFOW): every hex is spotted
	readonly noFOW: boolean;
	//The side the screen shows (game.spotSide), -1 for none. An input as noFOW is, not state; the rules
	//no longer read it (the end of turn hid the units this side didn't see, #75)
	readonly spotSide: number;
	//Units an attack destroyed whose removal hasn't run yet (the old engine keeps them in its unit
	//list until the cleanup after the attack): they can't fire or be fired on. Empty between steps
	readonly destroyed: ReadonlySet<UnitId>;
	//Unit id -> its index in state.units (D2)
	readonly index: ReadonlyMap<UnitId, number>;
	//Spotting and zone of control (D10)
	readonly sight: Sight;
	//The move range's hex -> cell table, reused from one call to the next (movement.ts)
	scratch: Int32Array | null;
}

//How many units of side 0 and 1 spot each hex and have it in their zone of control, by hex index
//(row * cols + col)
export interface Sight {
	spot: [Uint16Array, Uint16Array];
	zoc: [Uint16Array, Uint16Array];
}

//The rulesets a game can play by (src/core/rules.ts)
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
	//How the computer player plays (ai.ts)
	ai: AIRules;
}

//The computer player's rules: its settings (aiDefaultConfig, the bundle's, in the classic rules) and
//the switches of the remaster's changes to its play, each off in the classic rules
export interface AIRules {
	config: AIConfig;
	//The share of the bonus for staying entrenched that a side attacking keeps (#235): 1 in the classic
	//rules, where a unit that has dug in stays whether its side attacks or defends
	attackerEntrenchment: number;
}

//A hex of a move range (extendedCell): its distance from the unit, the cost to enter it (cin) and
//to leave it (cout), its terrain cost, and whether the unit can stop there or pass through
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

//A hex of a path: the cost of entering it and the cost of the path up to it (pathCell)
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

//An attack's result (combatResults): the strength the defender loses (kills) and the attacker
//loses (losses), the experience each gains, and what happened
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

//The four values an attack compares: the attacker's attack (aav) and defense (adv), the
//defender's attack (dav) and defense (ddv)
export interface CombatValues {
	aav: number;
	adv: number;
	dav: number;
	ddv: number;
}

export type Side = "attacker" | "defender";

//What a step changed: { name: "rugged defense", side: "defender", field: "aav", before: 9, after: 4.5 }
export interface Contribution {
	name: string;
	side: Side;
	field: keyof CombatValues | "kills" | "losses";
	before: number;
	after: number;
}

//An attack while its steps run: the two units, what they fight as, where, and the values the
//steps change (combat.ts change() sets one and records it when record isn't null)
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

//A step's world (draft.ts): the state as the step changes it, copied on write so the state the step
//was given stays as it was, with the unit index and the sight kept up to date as it goes, the game's
//random stream and the events so far
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

//A command's handler (docs/REFACTOR.md, step 4): check says whether it is allowed, or why not,
//without changing anything; run plays it on a draft, once check has allowed it
export interface CommandHandler<C extends Command> {
	check(w: World, cmd: C): Refusal | null;
	run(d: Draft, cmd: C): void;
}

//The strengths before an attack, for its finish
export interface AttackStart {
	attacker: UnitId;
	defender: UnitId;
	atkStrength: number;
	defStrength: number;
}

//Where a move or an attack waits for the screen, which animated it and finished it when the animation
//ended (the old UI), showing the state in between; a program goes on at once
export type Checkpoint =
	//The unit moved: next, the surprise attack on the hidden enemy it ran into and the capture's victory
	| { next: "surprise"; unit: UnitId; surprise: Position | null; win: boolean }
	//The shots were fired: next, the destroyed units leave the map
	| { next: "cleanUp"; attack: AttackStart }
	//The destroyed units are gone: next, the retreat or the surrender, and the elimination victory
	| { next: "end"; attack: AttackStart; attacker: UnitState | null };

