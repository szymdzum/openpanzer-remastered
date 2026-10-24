/**
 * The move and the attack (Commands' move and attack, finished at once as a program sends them)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf } from "../../commands";
import { emit } from "../draft";
import { cleanUpAttack, endAttack, resolveAttack, surpriseAttack } from "../fight";
import { isInAttackRange, isTargetFrom } from "../attack";
import { canEndMoveOn, pathTo, shortestPath } from "../movement";
import { moveUnit } from "../moves";
import type { Checkpoint, CommandHandler, Draft, Position } from "../types";
import { playerAt, refuse, unitCheck } from "./common";
import { onMap, unitById } from "../world";

//The cells the path may go through, as the command gives them: a cell without a cost costs NaN (the
//old engine casts the command's cells)
type PathCells = readonly { row: number; col: number; cost: number }[];
const cellsOf = (cells: Position[]) => cells as unknown as PathCells;

//To a hex the unit can reach and stop on (#74): along the cells given (the move range the player was
//shown), or its move range now. Then the surprise attack, the capture's victory, the attack's finish
export const move: CommandHandler<CommandOf<"move">> = {
	check(w, cmd) {
		const u = unitById(w, cmd.unit);
		if (u === null || u.row < 0) return refuse("no such unit");
		if (!onMap(w, cmd.to.row, cmd.to.col)) return refuse("can't get there");
		if (!canEndMoveOn(w, u, cmd.to)) return refuse("the hex is taken");
		const path = cmd.cells !== undefined ? shortestPath(u, cmd.to, cellsOf(cmd.cells)) : pathTo(w, u, cmd.to);
		return path.length === 0 ? refuse("can't get there") : null;
	},
	run(d, cmd) {
		finishFrom(d, moveFirst(d, cmd));
	},
};

//The move itself, up to its checkpoint
export function moveFirst(d: Draft, cmd: CommandOf<"move">): Checkpoint {
	const moved = moveUnit(d, cmd.unit, cmd.to, cmd.cells !== undefined ? cellsOf(cmd.cells) : null);
	return { next: "surprise", unit: cmd.unit, surprise: moved.surprise, win: moved.win };
}

//In range, as the AI checks it, and in the remaster's rules one of the screen's targets (#285). Not
//whether the unit can still fire: the AI attacks after a surprise attack, which already fired
export const attack: CommandHandler<CommandOf<"attack">> = {
	check(w, cmd) {
		const refusal = unitCheck(w, cmd.unit);
		if (refusal !== null) return refusal;
		const u = unitById(w, cmd.unit), target = unitById(w, cmd.target);
		if (target === null) return refuse("no such target");
		if (!isInAttackRange(w, u, target)) return refuse("out of range");
		return !w.rules.checkTargets || isTargetFrom(w, u, target) ? null : refuse("not a target from here");
	},
	run(d, cmd) {
		finishFrom(d, attackFirst(d, cmd));
	},
};

//The shots, up to the attack's checkpoint
export function attackFirst(d: Draft, cmd: CommandOf<"attack">): Checkpoint {
	return { next: "cleanUp", attack: resolveAttack(d, cmd.unit, cmd.target) };
}

//What comes after the checkpoint, up to the next one (null: the command is done)
export function resumeFrom(d: Draft, cp: Checkpoint): Checkpoint | null {
	switch (cp.next) {
		case "surprise": {
			const start = cp.surprise !== null ? surpriseAttack(d, cp.unit, cp.surprise) : null;
			if (cp.win) emit(d, { type: "victory", side: playerAt(d, unitById(d, cp.unit).owner).side, kind: "capture" });
			return start === null ? null : { next: "cleanUp", attack: start };
		}
		case "cleanUp":
			return { next: "end", attack: cp.attack, attacker: cleanUpAttack(d, cp.attack) };
		case "end":
			endAttack(d, cp.attack, cp.attacker);
			return null;
	}
}

//Every checkpoint passed at once, as a program plays
function finishFrom(d: Draft, cp: Checkpoint) {
	for (let next: Checkpoint | null = cp; next !== null;) next = resumeFrom(d, next);
}
