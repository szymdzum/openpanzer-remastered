// @vitest-environment node
//The new UI's map (#345) without the DOM: the hex grid (src/view/hexgrid.ts) and the map's view model
//(src/view/mapview.ts) on hand-built worlds (test/coreworld.ts, test/smallgame.ts). What each hex shows, the
//move path's tag, what a click does; the path and its numbers are checked against the move itself
import { expect, test } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";
import { worldOf } from "../src/mirror";
import { classicRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { attackCells } from "../src/core/attack";
import { adjacent } from "../src/core/geometry";
import { moveRange } from "../src/core/movement";
import { hexIndex, unitById } from "../src/core/world";
import type { World } from "../src/core/types";
import { leaderType, roadType, terrainType } from "../src/prototypes";
import { CORNERS, EDGES, cellAt, gridSize, hexCentre } from "../src/view/hexgrid";
import { clickOn, mapUnits, outlineOf, pathOf, selectionOf } from "../src/view/mapview";

const PZ_IIA = 140, BRUCKE = 111, TP7 = 273, INFANTERIE = 115, PSW_222 = 117, OPEL_BLITZ = 157, ME_109 = 159;

//A hand-built map seen by side 0, player 0's turn
const hand = (units: HandUnit[], more: { rows?: number; cols?: number; terrain?: (r: number, c: number) => number;
	road?: (r: number, c: number) => number } = {}) => handWorld({ rows: 10, cols: 10, units, ...more }, undefined, { spotSide: 0 });

const textOf = (w: World, sel: ReturnType<typeof selectionOf>, row: number, col: number) =>
	pathOf(w, sel, { row, col })!.lines.map((l) => l.text);

test("A hex's centre is in the hex, the map's points are in the hex they are drawn in, off the map in none", () => {
	expect([hexCentre(0, 0), hexCentre(0, 1), hexCentre(2, 3)]).toEqual([{ x: -15, y: 0 }, { x: 30, y: 25 }, { x: 120, y: 125 }]);
	for (let row = 0; row < 6; row++)
		for (let col = 0; col < 6; col++) {
			const c = hexCentre(row, col);
			expect(cellAt(c, 6, 6)).toEqual({ row, col });
			//just inside each corner
			for (const k of CORNERS) expect(cellAt({ x: c.x + k.x * 0.9, y: c.y + k.y * 0.9 }, 6, 6)).toEqual({ row, col });
		}
	expect([cellAt({ x: -100, y: 10 }, 6, 6), cellAt({ x: 100, y: 1000 }, 6, 6), cellAt({ x: 10, y: -30 }, 6, 6)]).toEqual([null, null, null]);
	expect(gridSize(10, 12)).toEqual({ width: 510, height: 500 });
});

test("The edge towards a neighbour is the neighbour's edge back: the move area's outline is one line", () => {
	for (const at of [{ row: 3, col: 3 }, { row: 3, col: 4 }])
		adjacent(at.row, at.col).forEach((n, k) => {
			const back = adjacent(n.row, n.col).findIndex((m) => m.row === at.row && m.col === at.col);
			const ends = (p: { row: number; col: number }, e: readonly [number, number]) => e.map((i) => {
				const c = hexCentre(p.row, p.col);
				return { x: c.x + CORNERS[i].x, y: c.y + CORNERS[i].y };
			});
			expect(ends(at, EDGES[k])).toEqual(ends(n, EDGES[back]).reverse());
		});
	//two hexes side by side: ten edges outside, the shared one not drawn
	const w = hand([]);
	expect(outlineOf(w, [{ row: 3, col: 3 }, { row: 4, col: 3 }])).toHaveLength(10);
});

test("The map shows the side's units and the enemies it sees, each with its marker and what it can still do", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, experience: 250, entrenchment: 2 }, { eqid: INFANTERIE, owner: 0, row: 4, col: 3,
		hasMoved: true, hasFired: true }, { eqid: PZ_IIA, owner: 0, row: 6, col: 1, ammo: 0 }, { eqid: TP7, owner: 1, row: 5, col: 2, hits: 1 },
	{ eqid: TP7, owner: 1, row: 9, col: 9 }]);
	const units = mapUnits(w, false, null);
	expect(units.map((u) => u.id)).toEqual([0, 1, 3, 2]); //row by row; the far enemy in the fog isn't shown
	const [tank, done, enemy, dry] = units;
	expect(tank).toMatchObject({ icon: w.equipment[PZ_IIA].icon, side: 0, bridge: false,
		marker: { strength: 10, own: true, canMove: true, canFire: true, noAmmo: false, done: false, bars: 2, entrenchment: 2, hits: 0 } });
	expect(done.marker).toMatchObject({ canMove: false, canFire: false, done: true });
	expect(dry.marker).toMatchObject({ canFire: false, noAmmo: true, done: false });
	expect(enemy).toMatchObject({ side: 1, marker: { own: false, canMove: false, canFire: false, done: false, hits: 1 } });
});

test("An aircraft over a ground unit is drawn under it without a marker, on top in the air layer", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: ME_109, owner: 0, row: 4, col: 1 }]);
	expect(mapUnits(w, false, null).map((u) => [u.id, u.marker !== null])).toEqual([[1, false], [0, true]]);
	expect(mapUnits(w, true, null).map((u) => [u.id, u.marker !== null])).toEqual([[0, false], [1, true]]);
	//a click picks the layer's unit
	expect([clickOn(w, null, { row: 4, col: 1 }, false), clickOn(w, null, { row: 4, col: 1 }, true)]).toEqual([{ select: 0 }, { select: 1 }]);
});

test("A ground unit on a bridge of its side is drawn as the bridge, but when it is selected", () => {
	const w = hand([{ eqid: BRUCKE, owner: 0, row: 4, col: 1 }], { terrain: (r, c) => r === 4 && c === 1 ? terrainType.River : 0 });
	expect(mapUnits(w, false, null)[0].bridge).toBe(true);
	expect(mapUnits(w, false, 0)[0].bridge).toBe(false);
});

test("The move area is the core's move range: tinted where the unit can stop, friends passed but not tinted, targets once each", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 4, col: 2 }, { eqid: TP7, owner: 1, row: 3, col: 1 }]);
	const sel = selectionOf(w, 0)!;
	const range = moveRange(w, unitById(w, 0));
	expect(sel.range).toEqual(range);
	expect(sel.area).toEqual(range.filter((c) => c.canMove).map((c) => ({ row: c.row, col: c.col })));
	expect(sel.area).not.toContainEqual({ row: 4, col: 2 });
	expect(range.find((c) => c.row === 4 && c.col === 2)).toMatchObject({ canPass: true, canMove: false });
	expect(sel.targets).toEqual([{ row: 3, col: 1 }]);
	expect(attackCells(w, unitById(w, 0))).toEqual(sel.targets);
	//the outline goes round the area with the unit's and the friend's hexes: no edge between two of them
	const inside = new Set([sel.at, ...range].map((c) => hexIndex(w, c.row, c.col)));
	for (const e of sel.outline) {
		const n = adjacent(e.row, e.col)[e.side];
		expect(inside.has(hexIndex(w, n.row, n.col)) && n.row >= 0 && n.col >= 0).toBe(false);
	}
	//the enemy selected: its hex, no area; not the person's turn: no area either
	expect(selectionOf(w, 2)).toEqual({ unit: 2, at: { row: 3, col: 1 }, range: [], area: [], outline: [], targets: [] });
	const theirs = { ...w, state: { ...w.state, turn: { ...w.state.turn, currentPlayer: 1 } } };
	expect(selectionOf(theirs, 0)!.area).toEqual([]);
	expect([selectionOf(w, null), selectionOf(w, 99)]).toEqual([null, null]);
});

//The path's ring says what the move leaves: for every hex of the area, on roads, rivers and next to an enemy,
//the moves and the fuel the tag shows are the unit's after the move, and the route is the one it takes
test("The move path is the move's: its hexes, the moves left and the fuel are the unit's after the move (#32)", () => {
	const terrain = (r: number, c: number) => (r + 2 * c) % 7 === 0 ? terrainType.Forest : (r * c) % 11 === 5 ? terrainType.River : 0;
	const road = (r: number) => r === 5 ? roadType.north | roadType.south : 0;
	for (const eqid of [PZ_IIA, PSW_222]) {
		const w = hand([{ eqid, owner: 0, row: 5, col: 1 }, { eqid: TP7, owner: 1, row: 2, col: 4 }], { terrain, road });
		const sel = selectionOf(w, 0)!;
		expect(sel.area.length).toBeGreaterThan(10);
		for (const to of sel.area) {
			const path = pathOf(w, sel, to)!;
			const moved = step(w, { type: "move", unit: 0, to });
			if (!moved.ok) throw new Error("refused");
			//(into the hidden enemy: the move stops before it, as the path's unseen hexes warn)
			if (moved.events.some((e) => e.type === "surprised")) {
				expect(path.lines).toContainEqual({ text: "unseen: ambush possible", tone: "warn" });
				continue;
			}
			const after = unitById(moved.world, 0);
			const event = moved.events.find((e) => e.type === "moved");
			expect(path.cells.map((c) => ({ row: c.row, col: c.col }))).toEqual(event!.type === "moved" && event!.path.map((c) => ({ row: c.row, col: c.col })));
			expect(path.left).toBe(Math.max(after.moveLeft, 0));
			expect(path.again).toBe(!after.hasMoved);
			expect(path.lines[path.lines.length - 1].text).toMatch(new RegExp("^fuel 5\\d → " + after.fuel + " of 5\\d"));
		}
	}
});

test("A path into an enemy zone stops there: the stop square and the moves it leaves unused", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	const sel = selectionOf(w, 0)!;
	const path = pathOf(w, sel, { row: 4, col: 3 })!;
	expect([path.stop, path.left, path.again]).toEqual([true, 0, false]);
	expect(path.lines.map((l) => l.text)).toEqual(["stops: enemy zone", "3 moves unused", "fuel 50 → 48 of 50"]);
	expect(textOf(w, sel, 4, 2)).toEqual(["4 moves left", "fuel 50 → 49 of 50"]);
	//a hex outside the area: no path, the area's edge is the answer
	expect([pathOf(w, sel, { row: 8, col: 8 }), pathOf(w, sel, { row: 9, col: 9 }), pathOf(w, sel, { row: 4, col: 1 }), pathOf(w, null, { row: 4, col: 2 })])
		.toEqual([null, null, null, null]);
});

test("A path ending on a flag or an objective says what it takes and what is left to win", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }]);
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 1)], { owner: 1, flag: 15 });
	Object.assign(w.state.map.hexes[hexIndex(w, 3, 1)], { owner: 1, flag: 15, victorySide: 0 });
	w.data.hexes[hexIndex(w, 5, 1)].name = "Wieczfnia";
	w.data.hexes[hexIndex(w, 3, 1)].name = "Mlawa";
	w.state.objectives[0].push({ row: 3, col: 1 }, { row: 9, col: 9 });
	const sel = selectionOf(w, 0)!;
	expect(textOf(w, sel, 5, 1)).toEqual(["takes Wieczfnia", "+50 prestige", "fuel 50 → 49 of 50"]);
	expect(pathOf(w, sel, { row: 3, col: 1 })!.lines.slice(0, 2)).toEqual([{ text: "takes Mlawa · objective", tone: "" },
		{ text: "+150 prestige · 1 left to win", tone: "gain" }]);
	w.state.objectives[0].pop();
	expect(textOf(w, sel, 3, 1)[1]).toBe("+150 prestige · the last objective");
	//a liberator's prestige is twice
	const lib = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, leader: leaderType.liberator }]);
	Object.assign(lib.state.map.hexes[hexIndex(lib, 5, 1)], { owner: 1, flag: 15 });
	expect(textOf(lib, selectionOf(lib, 0), 5, 1)[1]).toBe("+100 prestige");
});

test("A path past what the side sees warns of an ambush; a mounted unit can't fire after; recon can move again; low fuel", () => {
	//the infantry sees 1 hex: the truck's path beyond it is unseen
	const w = hand([{ eqid: INFANTERIE, owner: 0, row: 1, col: 1, isMounted: true, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 20 } }],
		{ rows: 14, cols: 14 });
	const sel = selectionOf(w, 0)!;
	const far = sel.area.reduce((a, c) => c.row + c.col > a.row + a.col ? c : a);
	const path = pathOf(w, sel, far)!;
	expect(path.cells.some((c) => !c.seen)).toBe(true);
	expect(path.left).toBe(0);
	expect(path.lines[0].text).toBe("can't fire after this move");
	expect(path.lines).toContainEqual({ text: "unseen: ambush possible", tone: "warn" });
	expect(path.lines[path.lines.length - 1].text).toMatch(/^transport fuel 20 → \d+ of 55 · low$/);
	expect(path.lines[path.lines.length - 1].tone).toBe("low");
	const recon = hand([{ eqid: PSW_222, owner: 0, row: 4, col: 1 }]);
	const rsel = selectionOf(recon, 0)!;
	//(wheels: a clear hex costs 2)
	expect(pathOf(recon, rsel, { row: 4, col: 2 })).toMatchObject({ left: 7, again: true });
	expect(textOf(recon, rsel, 4, 2)).toEqual(["7 moves left", "can move again", "fuel 55 → 53 of 55"]);
	const plane = hand([{ eqid: ME_109, owner: 0, row: 4, col: 1 }]);
	expect(textOf(plane, selectionOf(plane, 0), 4, 2)[0]).toBe("14 moves left");
	const one = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, moveLeft: 2 }]);
	expect(textOf(one, selectionOf(one, 0), 4, 2)[0]).toBe("1 move left");
});

test("A click attacks a target, moves to a hex of the area, else selects the unit there or none", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 3, col: 1 }, { eqid: TP7, owner: 1, row: 9, col: 9 }]);
	const sel = selectionOf(w, 0);
	expect(clickOn(w, sel, { row: 3, col: 1 }, false)).toEqual({ command: { type: "attack", unit: 0, target: 1 } });
	expect(clickOn(w, sel, { row: 5, col: 1 }, false)).toEqual({ command: { type: "move", unit: 0, to: { row: 5, col: 1 } } });
	expect(clickOn(w, sel, { row: 4, col: 1 }, false)).toEqual({ select: 0 });
	expect(clickOn(w, sel, { row: 8, col: 8 }, false)).toEqual({ select: null });
	//an enemy in the fog isn't selected; with nothing selected, a click on the enemy selects it
	expect(clickOn(w, sel, { row: 9, col: 9 }, false)).toEqual({ select: null });
	expect(clickOn(w, null, { row: 3, col: 1 }, false)).toEqual({ select: 1 });
});

test("The small game's map: the person's units with their move areas, the enemy's in the fog not shown", () => {
	const saved = smallGameData(smallGameUnits);
	const { scenario } = smallGame(smallGameUnits, saved);
	const w = worldOf(scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
	const shown = mapUnits(w, false, null);
	expect(shown.filter((u) => u.side === 0)).toHaveLength(4);
	expect(shown.length).toBeLessThan(smallGameUnits.length);
	const sel = selectionOf(w, 1)!;
	expect(sel.area.length).toBeGreaterThan(0);
	const to = sel.area[0];
	expect(clickOn(w, sel, to, false)).toEqual({ command: { type: "move", unit: 1, to } });
});
