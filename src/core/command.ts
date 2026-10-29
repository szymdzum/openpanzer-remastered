/**
 * Command types: every player action as plain data, which step (step.ts) checks and plays.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Position } from "./state";

/**
 * A player's action. `unit` is a unit on the map, by id; `index` a core unit not on the map, by its place in
 * the current player's core unit list (the deployment list); `eqid` and `transport` are equipment ids, a
 * transport of -1 or 0 meaning none. Buying, deploying and the undeployed units are the current player's.
 */
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

/** The `type` tag of a command. */
export type CommandType = Command["type"];
/** The command of one type: `CommandOf<"move">`. */
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

/** Why a command isn't allowed, in words a player understands. */
export interface Refusal {
	reason: string;
}
