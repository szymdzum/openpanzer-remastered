//The scripted general's doctrine (#605, test/arena/general.ts): garrisons, a reserve, the withdrawal of a
//worn-down unit and one sector at a time, each on a small map built by hand where it decides what a unit does
import { expect, test } from "vitest";
import type { Command } from "../src/core/command";
import { distance } from "../src/core/geometry";
import { step } from "../src/core/step";
import type { Position, UnitState, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { generalController } from "./arena/general";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";

const PZ2 = 140, INFANTERIE = 115, TP7 = 273;

//Germany (player 0) to play, everything seen; the objectives Germany has to take, held by Poland, and
//those it holds, which Poland has to take
function world(units: HandUnit[], toTake: Position[], held: Position[] = [], rows = 16): World {
	const w = handWorld({ rows, cols: 16, units }, germanyPoland, { noFOW: true });
	w.state.rng = { game: 1, ai: 1 };
	const mark = (o: Position, side: number, owner: number) => {
		w.state.map.hexes[o.row * 16 + o.col] = { ...w.state.map.hexes[o.row * 16 + o.col], victorySide: side, owner };
		w.state.objectives[side].push(o);
	};
	for (const o of toTake) mark(o, 0, 1);
	for (const o of held) mark(o, 1, 0);
	return w;
}

//Germany's turn played by the general: every order allowed, the world at its end
function played(w: World): { world: World; commands: Command[] } {
	const general = generalController(0);
	w = general.plan(general.join(w).world);
	const commands: Command[] = [];
	for (let o = general.next(w); o !== null; o = general.next(w)) {
		if (!("command" in o)) continue;
		const r = step(w, o.command);
		if ("refusal" in r) throw new Error(`refused: ${JSON.stringify(o.command)}, ${r.refusal.reason}`);
		w = r.world;
		commands.push(o.command);
	}
	return { world: w, commands };
}

const at = (w: World, id: number): UnitState => unitById(w, id) as UnitState;
const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);

test("The general keeps a garrison on an objective in the enemy's reach (#605)", () => {
	//An empty German objective a 7TP can reach in two turns, an infantry three hexes from it
	const w = world([{ eqid: INFANTERIE, owner: 0, row: 8, col: 5 }, { eqid: TP7, owner: 1, row: 8, col: 10 }],
		[{ row: 1, col: 14 }, { row: 14, col: 14 }], [{ row: 8, col: 2 }]);
	const after = at(played(w).world, 0);
	expect([after.row, after.col]).toEqual([8, 2]);
});

test("The general holds a reserve out of the enemy's reach (#605)", () => {
	//Five tanks a turn's move from a 7TP's reach, which stands before the objective
	const tanks = [6, 7, 8, 9, 10].map((row): HandUnit => ({ eqid: PZ2, owner: 0, row, col: 3 }));
	const tp = { row: 8, col: 12 };
	const w = world([...tanks, { eqid: TP7, owner: 1, ...tp }], [{ row: 8, col: 14 }]);
	const after = played(w).world;
	const reach = germanyPoland[TP7].movpoints + 1;
	const outOfReach = [0, 1, 2, 3, 4].filter((id) => apart(at(after, id), tp) > reach);
	const advanced = [0, 1, 2, 3, 4].filter((id) => at(after, id).col > 3);
	expect(outOfReach.length).toBeGreaterThanOrEqual(1);
	expect(advanced.length).toBeGreaterThanOrEqual(3);
});

test("A worn-down general's unit that holds nothing withdraws (#605)", () => {
	const w = world([{ eqid: PZ2, owner: 0, row: 8, col: 8, strength: 3 }, { eqid: TP7, owner: 1, row: 8, col: 9 }],
		[{ row: 1, col: 14 }]);
	const after = at(played(w).world, 0);
	expect(apart(after, { row: 8, col: 9 })).toBeGreaterThan(1);
});

test("The attacking general sends its units to one sector (#605)", () => {
	//Two objectives, the northern one behind three 7TPs, the southern one open; two tanks nearer each
	const a = { row: 1, col: 14 }, b = { row: 18, col: 14 };
	const w = world([7, 8, 11, 12].map((row): HandUnit => ({ eqid: PZ2, owner: 0, row, col: 1 })).concat(
		[{ row: 1, col: 12 }, { row: 2, col: 13 }, { row: 0, col: 13 }].map((p): HandUnit => ({ eqid: TP7, owner: 1, ...p }))), [a, b], [], 20);
	const after = played(w).world;
	for (const id of [0, 1, 2, 3])
		expect(apart(at(after, id), b), "tank " + id).toBeLessThan(apart(at(after, id), a));
});
