/**
 * Events - what a step did, as plain data, in the order it happened: enough for the combat log and
 * for a view to animate after the step (docs/CORE.md). Types only
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CombatResult, Contribution, Position, Supply, UnitId } from "./types";

//A hex of a move's path and whether the other side saw the unit pass it
export interface PathStep {
	row: number;
	col: number;
	visible: boolean;
}

//A unit in a fight, before and after it (the combat log's entries)
export interface Fighter {
	unit: UnitId;
	eqid: number;
	side: number;
	row: number;
	col: number;
	isMounted: boolean;
	isSurprised: boolean;
	before: FighterState;
	after: FighterState;
}

export interface FighterState {
	strength: number;
	experience: number;
	entrenchment: number;
	ammo: number;
}

export type GameEvent =
	//The unit moved along path (its hex first), paying cost; visible: the other side saw some of it
	| { type: "moved"; unit: UnitId; path: PathStep[]; cost: number; visible: boolean }
	//The unit ran into a hidden enemy at the hex and stopped before it
	| { type: "surprised"; unit: UnitId; at: Position }
	//The unit, arriving or seeing farther, spotted enemy units its side didn't see: they stay seen
	//(tempSpotted) until their side's turn ends
	| { type: "spotted"; unit: UnitId; units: UnitId[] }
	//The unit took a flag or an objective; win: its side has no objective left to take
	| { type: "captured"; unit: UnitId; at: Position; flag: boolean; objective: boolean; prestige: number; score: number; win: boolean }
	//A side won: it took its last objective, or the other side has no unit left
	| { type: "victory"; side: number; kind: "capture" | "elimination" }
	//One unit fired on another: a support fire shot on an attacker, or the attack itself with the
	//defender's return fire. result: the dice's (overrun: the defender destroyed without a shot back),
	//record: what each combat step contributed (#118)
	| { type: "fight"; support: boolean; attacker: Fighter; defender: Fighter; result: CombatResult; record: Contribution[] }
	//The support fire's losses stopped the attack
	| { type: "attackStopped"; unit: UnitId }
	//Mounted infantry attacked got off its transport
	| { type: "dismounted"; unit: UnitId }
	| { type: "leader"; unit: UnitId; leader: number }
	| { type: "destroyed"; unit: UnitId; at: Position }
	//The defender fell back after the attack: a move without its cost (path and visible as moved's)
	| { type: "retreated"; unit: UnitId; from: Position; to: Position; path: PathStep[]; visible: boolean }
	//The defender had nowhere to retreat to
	| { type: "surrendered"; unit: UnitId; at: Position }
	| { type: "resupplied"; unit: UnitId; supply: Supply }
	| { type: "reinforced"; unit: UnitId; strength: number; supply: Supply }
	| { type: "mounted"; unit: UnitId }
	| { type: "unmounted"; unit: UnitId }
	//carrier: the air or naval transport (an eqid)
	| { type: "embarked"; unit: UnitId; carrier: number }
	//The unit can land on the hexes given, its next move
	| { type: "disembarked"; unit: UnitId; cells: Position[] }
	| { type: "undone"; unit: UnitId; from: Position; to: Position }
	//A core unit (index: in the player's core list) put on the map
	| { type: "deployed"; unit: UnitId; index: number; at: Position }
	| { type: "bought"; player: number; eqid: number; transport: number; cost: number }
	//unit: on the map, or index: a core unit of the player off it
	| { type: "upgraded"; unit: UnitId | null; index: number | null; eqid: number; transport: number; cost: number }
	| { type: "disbanded"; unit: UnitId; prestige: number }
	| { type: "sold"; index: number; prestige: number }
	//The player ended its turn: the prestige the scenario gives it for the next one
	| { type: "turnEnded"; player: number; prestige: number }
	//The player's turn starts: the turn, the date and the time of day (the turn in the day)
	| { type: "turnStarted"; player: number; turn: number; date: string; dayTurn: number }
	//The side that ended its turn has played its last: it lost (the game ends it for a side that
	//plays on this screen)
	| { type: "turnLimit"; side: number }
	//A scenario's reinforcement arrived on the map
	| { type: "arrived"; unit: UnitId; at: Position };

//The event of one type: EventOf<"fight">
export type EventOf<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;
