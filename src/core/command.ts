/**
 * Command types - every player action as plain data (what src/commands.ts plays, and the core's step checks)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Position } from "./state";

//The player's actions. unit: a unit on the map by its id; index: a core unit not on the map, by
//its place in the current player's core unit list (the deployment list); eqid and transport:
//equipment ids, a transport of -1 or 0 for none. Buying, deploying and the undeployed units are
//the current player's
export type Command =
	| { type: "move"; unit: number; to: Position; cells?: Position[] } //cells: where the path may go (the move hexes shown)
	| { type: "attack"; unit: number; target: number }
	| { type: "resupply"; unit: number }
	| { type: "reinforce"; unit: number; overstrength?: boolean }
	| { type: "mount"; unit: number }
	| { type: "unmount"; unit: number }
	| { type: "embark"; unit: number }
	| { type: "disembark"; unit: number }
	| { type: "undo"; unit: number } //the unit's last move
	| { type: "deploy"; index: number; to: Position }
	| { type: "buy"; eqid: number; transport: number }
	| { type: "upgrade"; unit: number; eqid: number; transport: number } //eqid 0 or -1 keeps the unit, for a new transport
	| { type: "upgradeUndeployed"; index: number; eqid: number; transport: number }
	| { type: "disband"; unit: number } //a unit on the map, sold
	| { type: "sell"; index: number } //a core unit not on the map
	| { type: "endTurn" };

export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

//Why a command isn't allowed, in words a player understands
export interface Refusal {
	reason: string;
}
