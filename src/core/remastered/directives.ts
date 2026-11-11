/**
 * The directives a commander gives the remastered AI's staff (#638): plain data any source can answer in (the rules of
 * commander.ts, a language model later, #45), and the check every list of them passes before the staff reads it.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Position, World } from "../types";
import { onMap } from "../world";
import { hexOf, samePosition } from "./march";

/**
 * What a directive asks of the staff: take an objective (the main effort), a posture for one the side holds (hold it,
 * or delay in front of it), strike a hex back, or keep a reserve waiting near one.
 */
export type Task = "assault" | "hold" | "delay" | "counterattack" | "reserve";

/**
 * One thing the commander tells the staff: the task, the hex it is about, its rank among the directives (1 first), the
 * last turn it stands, and why. Plain data: it goes through JSON unchanged.
 */
export interface Directive {
	task: Task;
	target: Position;
	priority: number;
	until: number;
	reason: string;
}

const TASKS: readonly Task[] = ["assault", "hold", "delay", "counterattack", "reserve"];

/** A hex as the reasons name it: "row,col". */
export const at = (p: Position) => `${p.row},${p.col}`;

/** A directive left out of a list, by its place in it (-1: the list itself), and why. */
export interface Dropped {
	index: number;
	reason: string;
}

/** A list of directives after the check: those the staff may read, the first in priority first, and those dropped. */
export interface Validated {
	directives: Directive[];
	dropped: Dropped[];
}

/**
 * Checks a list of directives from any source for the side: each a known task on a hex of the map (an objective the
 * side holds for a hold or a delay, one to take for an assault), with a priority from 1, a last turn not passed and a
 * reason; one directive a task and hex, one posture an objective, one assault, one reserve. The rest are dropped with
 * the reason.
 */
export function validateDirectives(input: unknown, w: World, side: number): Validated {
	if (!Array.isArray(input)) return { directives: [], dropped: [{ index: -1, reason: "not a list of directives" }] };
	const dropped: Dropped[] = [], read: { d: Directive; index: number }[] = [];
	input.forEach((item: unknown, index) => {
		const d = directiveOf(item, w, side);
		if (typeof d === "string") dropped.push({ index, reason: d });
		else read.push({ d, index });
	});
	read.sort((x, y) => x.d.priority - y.d.priority || x.index - y.index);
	const directives: Directive[] = [];
	for (const { d, index } of read) {
		const clash = clashOf(d, directives);
		if (clash === null) directives.push(d);
		else dropped.push({ index, reason: clash });
	}
	return { directives, dropped: dropped.sort((x, y) => x.index - y.index) };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isTask = (x: unknown): x is Task => TASKS.includes(x as Task);
const isWhole = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isPriority = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 1;
const isReason = (x: unknown): x is string => typeof x === "string" && x !== "";

//The hex an item names, when it is one of the map
function hexNamed(w: World, x: unknown): Position | null {
	return isRecord(x) && isWhole(x.row) && isWhole(x.col) && onMap(w, x.row, x.col) ? { row: x.row, col: x.col } : null;
}

//The directive an item of the list says, or why it says none
function directiveOf(item: unknown, w: World, side: number): Directive | string {
	if (!isRecord(item)) return "not a directive";
	const task = item.task, target = hexNamed(w, item.target);
	if (!isTask(task)) return `unknown task ${JSON.stringify(task)}`;
	if (target === null) return "target off the map";
	const rest = rankOf(w, item);
	if (typeof rest === "string") return rest;
	return wrongTarget(w, side, task, target) ?? (isPlain(item) ? item as unknown as Directive : { task, target, ...rest });
}

//An item's priority, last turn and reason, or which of them is wrong
function rankOf(w: World, item: Record<string, unknown>): Pick<Directive, "priority" | "until" | "reason"> | string {
	const { priority, until, reason } = item;
	if (!isPriority(priority)) return "priority not a number from 1";
	if (!isWhole(until) || until < w.state.turn.turn) return "its last turn has passed";
	return isReason(reason) ? { priority, until, reason } : "no reason given";
}

//Whether the item is a directive and nothing more: it is passed on as it is, the same object, which is how the staff
//knows a directive the commander keeps from one it gives anew
const isPlain = (item: Record<string, unknown>) => Object.keys(item).length === FIELDS && isRecord(item.target)
	&& Object.keys(item.target).length === 2;
const FIELDS = 5;

//Why the hex can't be the task's target: a posture needs an objective the side holds, an assault one it has to take
function wrongTarget(w: World, side: number, task: Task, hex: Position): string | null {
	if (task === "assault") return w.state.objectives[side].some((o) => samePosition(o, hex)) ? null : `${at(hex)} is not an objective to take`;
	if (!isPosture(task)) return null;
	const h = w.state.map.hexes[hexOf(w, hex)];
	return h.victorySide !== -1 && h.owner >= 0 && w.state.players[h.owner].side === side ? null : `${at(hex)} is not an objective the side holds`;
}

const isPosture = (task: Task) => task === "hold" || task === "delay";

//The tasks the staff carries out once: where the first of them is, and what a second one is told
const ONCE: Partial<Record<Task, string>> = { assault: "the main effort is on", reserve: "one waits behind" };

//Why the directive can't stand beside one already read, a higher priority
function clashWith(d: Directive, r: Readonly<Directive>): string | null {
	const once = r.task === d.task ? ONCE[d.task] : undefined;
	if (once !== undefined) return `a second ${d.task}: ${once} ${at(r.target)}`;
	if (!samePosition(r.target, d.target)) return null;
	if (r.task === d.task) return `a second ${d.task} on ${at(d.target)}`;
	return isPosture(r.task) && isPosture(d.task) ? `${at(d.target)} already has a posture, ${r.task}` : null;
}

function clashOf(d: Directive, read: readonly Directive[]): string | null {
	for (const r of read) {
		const clash = clashWith(d, r);
		if (clash !== null) return clash;
	}
	return null;
}
