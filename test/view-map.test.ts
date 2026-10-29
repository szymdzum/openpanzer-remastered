// @vitest-environment node
//The new UI's map (#345) without the DOM: the hex grid (src/view/map/hexgrid.ts) and the map's view model
//(src/view/map/mapview.ts) on hand-built worlds (test/coreworld.ts, test/smallgame.ts). What each hex shows, the
//move path's tag, what a click does; the path and its numbers are checked against the move itself
import { expect, test } from "vitest";
import { deployWorld, handWorld, type HandUnit } from "./coreworld";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";
import { worldOf } from "../src/legacy/mirror";
import { classicRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { attackCells } from "../src/core/attack";
import { adjacent } from "../src/core/geometry";
import { moveRange } from "../src/core/movement";
import { hexIndex, unitById } from "../src/core/world";
import type { World } from "../src/core/types";
import { roadType, terrainType } from "../src/core/tables";
import { CORNERS, EDGES, cellAt, gridSize, hexCentre } from "../src/view/map/hexgrid";
import { clickOn, mapUnits, outlineOf, pathOf, selectionOf, unitsToAct } from "../src/view/map/mapview";
import { fogOf, mapPlaques, plaquesOf, supportOf } from "../src/view/map/mapinfo";
import { strategicOf } from "../src/view/map/strategic";
import { deploymentOf, ghostOf, placeOn, reserveOf } from "../src/view/map/deploy";

const PZ_IIA = 140, BRUCKE = 111, WZ13 = 262, TP7 = 273, INFANTERIE = 115, PSW_222 = 117, OPEL_BLITZ = 157, ME_109 = 159;
const KAWALERIA = 267, PZL_23 = 281, TRANSPORTSCHIFFE = 546;

//A hand-built map seen by side 0, player 0's turn
const hand = (units: HandUnit[], more: { rows?: number; cols?: number; terrain?: (r: number, c: number) => number;
	road?: (r: number, c: number) => number } = {}) => handWorld({ rows: 10, cols: 10, units, ...more }, undefined, { spotSide: 0 });

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

//MapLayers: on a shared hex the layer shown is on top with its marker, the other under it dimmed with a strength chip
test("An aircraft over a ground unit is drawn under it dimmed with a chip, on top lifted in the air layer", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: ME_109, owner: 0, row: 4, col: 1 }]);
	const look = (air: boolean) => mapUnits(w, air, null).map((u) => [u.id, u.marker !== null, u.dim, u.chip !== null, u.lifted]);
	expect(look(false)).toEqual([[1, false, true, true, false], [0, true, false, false, false]]);
	expect(look(true)).toEqual([[0, false, true, true, false], [1, true, false, false, true]]);
	expect(mapUnits(w, false, null)[0].chip).toBe(w.state.units[1].strength);
	//a click picks the layer's unit
	expect([clickOn(w, null, { row: 4, col: 1 }, false), clickOn(w, null, { row: 4, col: 1 }, true)]).toEqual([{ select: 0 }, { select: 1 }]);
});

test("A unit alone on its hex is drawn whole whatever the layer: marker, full opacity, an aircraft not lifted in the ground layer", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: ME_109, owner: 0, row: 6, col: 1 }]);
	const look = (air: boolean) => mapUnits(w, air, null).map((u) => [u.id, u.marker !== null, u.dim, u.chip, u.lifted]);
	expect(look(false)).toEqual([[0, true, false, null, false], [1, true, false, null, false]]);
	expect(look(true)).toEqual([[0, true, false, null, false], [1, true, false, null, true]]);
	//a click on either still selects it, in both layers, as the old UI's Hex.getUnit did
	for (const air of [false, true])
		expect([clickOn(w, null, { row: 4, col: 1 }, air), clickOn(w, null, { row: 6, col: 1 }, air)]).toEqual([{ select: 0 }, { select: 1 }]);
});

//An aircraft is stopped only by an enemy aircraft (canPassInto), which its side can't see coming whatever the hex:
//no hatching for it, the fog says it all; a ground unit keeps the hatching on the hexes it can't see
test("An aircraft's move area has no unseen hexes to hatch; a ground unit's has", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: ME_109, owner: 0, row: 8, col: 1 }]);
	expect(selectionOf(w, 0)!.unseen.length).toBeGreaterThan(0);
	const air = selectionOf(w, 1)!;
	expect(air.area.some((c) => !w.sight.spot[0][hexIndex(w, c.row, c.col)])).toBe(true);
	expect(air.unseen).toEqual([]);
});

//AirLayer: the Me-109E-3 over a hex with the PZL.23B above the 39 Kawaleria hits the cavalry in the ground layer, the
//bomber in the air layer (Hex.getAttackableUnit(…, airMode))
test("An attack hits the unit of the layer shown: the cavalry in the ground layer, the bomber over it in the air layer", () => {
	const w = hand([{ eqid: ME_109, owner: 0, row: 4, col: 1 }, { eqid: KAWALERIA, owner: 1, row: 4, col: 2 }, { eqid: PZL_23, owner: 1, row: 4, col: 2 }]);
	const sel = selectionOf(w, 0)!;
	expect(sel.targets).toEqual([{ row: 4, col: 2 }]);
	expect(clickOn(w, sel, { row: 4, col: 2 }, false)).toEqual({ command: { type: "attack", unit: 0, target: 1 } });
	expect(clickOn(w, sel, { row: 4, col: 2 }, true)).toEqual({ command: { type: "attack", unit: 0, target: 2 } });
	expect(mapUnits(w, true, 0).filter((u) => u.row === 4 && u.col === 2).map((u) => [u.id, u.dim])).toEqual([[1, true], [2, false]]);
});

test("A ground unit on a bridge of its side is drawn as the bridge, but when it is selected", () => {
	const w = hand([{ eqid: BRUCKE, owner: 0, row: 4, col: 1 }], { terrain: (r, c) => r === 4 && c === 1 ? terrainType.River : 0 });
	expect(mapUnits(w, false, null)[0].bridge).toBe(true);
	expect(mapUnits(w, false, 0)[0].bridge).toBe(false);
});

test("The move area is the core's move range: tinted and outlined where the unit can stop, friends passed but left out, targets once each", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 4, col: 2 }, { eqid: TP7, owner: 1, row: 3, col: 1 }]);
	const sel = selectionOf(w, 0)!;
	const range = moveRange(w, unitById(w, 0));
	expect(sel.range).toEqual(range);
	expect(sel.area).toEqual(range.filter((c) => c.canMove).map((c) => ({ row: c.row, col: c.col })));
	expect(sel.area).not.toContainEqual({ row: 4, col: 2 });
	expect(range.find((c) => c.row === 4 && c.col === 2)).toMatchObject({ canPass: true, canMove: false });
	expect(sel.targets).toEqual([{ row: 3, col: 1 }]);
	expect(attackCells(w, unitById(w, 0))).toEqual(sel.targets);
	//the outline goes round the hexes it can stop on and its own: no edge between two of them; the friend's hex it only
	//passes is left out, as the old map left it untinted
	const inside = new Set([sel.at, ...sel.area].map((c) => hexIndex(w, c.row, c.col)));
	for (const e of sel.outline) {
		const n = adjacent(e.row, e.col)[e.side];
		expect(inside.has(hexIndex(w, n.row, n.col)) && n.row >= 0 && n.col >= 0).toBe(false);
	}
	const friend = hexIndex(w, 4, 2);
	expect(sel.outline.some((e) => { const n = adjacent(e.row, e.col)[e.side]; return hexIndex(w, n.row, n.col) === friend; })).toBe(true);
	//the enemy selected: its hex, no area; not the person's turn: no area either
	expect(selectionOf(w, 2)).toEqual({ unit: 2, at: { row: 3, col: 1 }, range: [], area: [], unseen: [], outline: [], zones: [], targets: [] });
	const theirs = { ...w, state: { ...w.state, turn: { ...w.state.turn, currentPlayer: 1 } } };
	expect(selectionOf(theirs, 0)!.area).toEqual([]);
	expect([selectionOf(w, null), selectionOf(w, 99)]).toEqual([null, null]);
});

//The path's ring says what the move leaves: for every hex of the area, on roads, rivers and next to an enemy,
//the moves it shows are the unit's after the move, and the route is the one it takes
test("The move path is the move's: its hexes and the moves left are the unit's after the move (#32)", () => {
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
				expect(path.cells.some((c) => !c.seen)).toBe(true);
				continue;
			}
			const after = unitById(moved.world, 0);
			const event = moved.events.find((e) => e.type === "moved");
			expect(path.cells.map((c) => ({ row: c.row, col: c.col }))).toEqual(event!.type === "moved" && event!.path.map((c) => ({ row: c.row, col: c.col })));
			expect(path.left).toBe(Math.max(after.moveLeft, 0));
			expect(path.again).toBe(!after.hasMoved);
		}
	}
});

test("A path into an enemy zone stops there: the stop square and the moves it leaves unused", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	const sel = selectionOf(w, 0)!;
	const path = pathOf(w, sel, { row: 4, col: 3 })!;
	expect([path.stop, path.left, path.again]).toEqual([true, 0, false]);
	expect(pathOf(w, sel, { row: 4, col: 2 })).toMatchObject({ stop: false, left: 4 });
	//a hex outside the area: no path, the area's edge is the answer
	expect([pathOf(w, sel, { row: 8, col: 8 }), pathOf(w, sel, { row: 9, col: 9 }), pathOf(w, sel, { row: 4, col: 1 }), pathOf(w, null, { row: 4, col: 2 })])
		.toEqual([null, null, null, null]);
});

test("A path past what the side sees is unseen; a mounted unit has no moves left after; recon can move again", () => {
	//the infantry sees 1 hex: the truck's path beyond it is unseen
	const w = hand([{ eqid: INFANTERIE, owner: 0, row: 1, col: 1, isMounted: true, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 20 } }],
		{ rows: 14, cols: 14 });
	const sel = selectionOf(w, 0)!;
	const far = sel.area.reduce((a, c) => c.row + c.col > a.row + a.col ? c : a);
	const path = pathOf(w, sel, far)!;
	expect(path.cells.some((c) => !c.seen)).toBe(true);
	expect(path.left).toBe(0);
	const recon = hand([{ eqid: PSW_222, owner: 0, row: 4, col: 1 }]);
	const rsel = selectionOf(recon, 0)!;
	//(wheels: a clear hex costs 2)
	expect(pathOf(recon, rsel, { row: 4, col: 2 })).toMatchObject({ left: 7, again: true });
	const plane = hand([{ eqid: ME_109, owner: 0, row: 4, col: 1 }]);
	expect(pathOf(plane, selectionOf(plane, 0), { row: 4, col: 2 })!.left).toBe(14);
	const one = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, moveLeft: 2 }]);
	expect(pathOf(one, selectionOf(one, 0), { row: 4, col: 2 })!.left).toBe(1);
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

//An enemy zone (MapOverlays): a bar on each edge of the area where the zone ends the move, facing the enemy the
//side sees. A hidden enemy's zone ends the move too (#282, the original's rule) but has no bar: no enemy to face
test("Enemy zone bars sit on the area's edges facing a seen enemy whose zone ends the move there", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 3 }]);
	const sel = selectionOf(w, 0)!;
	expect(sel.zones.length).toBeGreaterThan(0);
	for (const e of sel.zones) {
		expect(adjacent(e.row, e.col)[e.side]).toEqual({ row: 4, col: 3 });
		expect(pathOf(w, sel, e)!.stop).toBe(true);
	}
	//every hex of the area next to the enemy that the side sees has its bar (on a hex it doesn't see, the zone
	//doesn't end the move)
	const next = sel.area.filter((c) => isSeen(w, c.row, c.col) && adjacent(c.row, c.col).some((n) => n.row === 4 && n.col === 3));
	expect(sel.zones.map((e) => ({ row: e.row, col: e.col }))).toEqual(next);
	//an aircraft is in no zone
	const plane = hand([{ eqid: ME_109, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 3 }]);
	expect(selectionOf(plane, 0)!.zones).toEqual([]);
	//a hidden enemy: the 7TP three hexes from the infantry is in the fog. Its zone still ends the move on the seen
	//hex next to it, with no bar
	const hidden = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	const hsel = selectionOf(hidden, 0)!;
	expect(mapUnits(hidden, false, null).map((u) => u.id)).toEqual([0]);
	expect(isSeen(hidden, 4, 3)).toBe(true);
	expect(pathOf(hidden, hsel, { row: 4, col: 3 })!.stop).toBe(true);
	expect(hsel.zones).toEqual([]);
});

test("The area's hexes the side doesn't see are hatched, not tinted: the move may run into an ambush", () => {
	const w = hand([{ eqid: PSW_222, owner: 0, row: 1, col: 1 }], { rows: 14, cols: 14 });
	const sel = selectionOf(w, 0)!;
	expect(sel.unseen.length).toBeGreaterThan(0);
	expect(sel.unseen.length).toBeLessThan(sel.area.length);
	for (const c of sel.area) expect(sel.unseen.some((u) => u.row === c.row && u.col === c.col)).toBe(!w.sight.spot[0][hexIndex(w, c.row, c.col)]);
});

test("The fog of war covers the hexes the side shown doesn't see; a unit that fired from there shows, its plate dotted", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 9, col: 9, tempSpotted: true }]);
	const fog = fogOf(w)!;
	expect([fog[hexIndex(w, 4, 1)], fog[hexIndex(w, 4, 2)], fog[hexIndex(w, 9, 9)]]).toEqual([0, 0, 1]);
	expect(Array.from(fog).filter((f) => f === 0).length).toBe(Array.from(w.sight.spot[0]).filter((n) => n > 0).length);
	const units = mapUnits(w, false, null);
	expect(units.map((u) => [u.id, u.marker!.revealed])).toEqual([[0, false], [1, true]]);
	expect(fogOf({ ...w, noFOW: true })).toBeNull();
	expect(fogOf({ ...w, spotSide: -1 })).toBeNull();
});

test("Hovering a target draws the guns the side sees that will fire in support, as the estimate counts them", () => {
	//the tank attacks the 7TP next to it; one Polish gun in range is seen, the other is in the fog
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 },
		{ eqid: WZ13, owner: 1, row: 5, col: 5 }, { eqid: WZ13, owner: 1, row: 7, col: 5 }], { rows: 12, cols: 12 });
	const sel = selectionOf(w, 0)!;
	expect(isSeen(w, 5, 5) && !isSeen(w, 7, 5)).toBe(true);
	expect(supportOf(w, sel, { row: 4, col: 4 }, false)).toEqual({ attacker: { row: 4, col: 3 }, target: { row: 4, col: 4 }, guns: [{ row: 5, col: 5 }] });
	//not a target, nothing hovered, nothing selected
	expect([supportOf(w, sel, { row: 5, col: 4 }, false), supportOf(w, sel, null, false), supportOf(w, null, { row: 4, col: 4 }, false)])
		.toEqual([null, null, null]);
	//a surprised attacker draws no support fire, as the estimate counts none
	const surprised = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, isSurprised: true }, { eqid: TP7, owner: 1, row: 4, col: 4 },
		{ eqid: WZ13, owner: 1, row: 5, col: 5 }], { rows: 12, cols: 12 });
	expect(supportOf(surprised, selectionOf(surprised, 0), { row: 4, col: 4 }, false)).toBeNull();
	//no gun in reach: none
	const alone = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	expect(supportOf(alone, selectionOf(alone, 0), { row: 4, col: 4 }, false)).toBeNull();
});

const isSeen = (w: World, row: number, col: number) => w.sight.spot[0][hexIndex(w, row, col)] > 0;

//StrategicMap: the layer's units as chips, the side shown's and the enemy's it sees, the objectives only, the flags
test("The strategic map: a chip per unit of the layer the side sees, dimmed when it moved, and the objectives' plaques", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, hasMoved: true }, { eqid: ME_109, owner: 0, row: 4, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 2 }, { eqid: PZL_23, owner: 1, row: 5, col: 1 }, { eqid: TP7, owner: 1, row: 9, col: 9 }]);
	Object.assign(w.state.map.hexes[hexIndex(w, 2, 2)], { owner: 1, flag: 15, victorySide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 5)], { owner: 0, flag: 7 });
	w.data.hexes[hexIndex(w, 2, 2)].name = "Mława";
	const ground = strategicOf(w, false);
	//the tank and the 7TP next to it; the 7TP in the fog isn't drawn, nor the aircraft
	expect(ground.chips).toEqual([
		{ row: 4, col: 1, side: 0, own: true, flag: 7, moved: true },
		{ row: 4, col: 2, side: 1, own: false, flag: 15, moved: false },
	]);
	expect(strategicOf(w, true).chips.map((c) => [c.row, c.col, c.own])).toEqual([[4, 1, true], [5, 1, false]]);
	//the town is left out; the objective keeps its name as written and its flag
	expect(ground.plaques).toEqual([{ row: 2, col: 2, name: "Mława", objective: true, side: 1, flag: 15, named: true }]);
	expect(ground.flags).toBe("resources/ui/flags/eqp-adlerkorps/flags_med.png");
	expect(strategicOf({ ...w, data: { ...w.data, equipment: "eqp-pacific" } }, false).flags).toBe("resources/ui/flags/eqp-pacific/flags_med.png");
	expect(strategicOf({ ...w, data: { ...w.data, equipment: "" } }, false).flags).toBe(ground.flags);
});

//Deployment: the zone is the core's deployment hexes, a free hex tinted and a taken one not; the picked unit's ghost
//and tag where the deploy command takes it, landing as the core places it
test("Deploying: the person's reserve, the zone with its free hexes, and the picked unit where a click would place it", () => {
	const w = deployWorld();
	expect(reserveOf(w)).toEqual([{ index: 1, name: "Infanterie", strength: 10 }, { index: 2, name: "Me-109E-3", strength: 10 }]);
	expect(reserveOf({ ...w, state: { ...w.state, turn: { ...w.state.turn, currentPlayer: 1 } } })).toEqual([]);
	const d = deploymentOf(w, 1)!;
	expect(d.zone).toEqual([{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 6, col: 6 }]);
	expect(d.free).toEqual([{ row: 1, col: 1 }, { row: 2, col: 1 }, { row: 6, col: 6 }]);
	expect(d.outline).toEqual(outlineOf(w, d.zone));
	expect([d.unit.name, d.waiting]).toEqual(["Infanterie", 2]);
	//the tank on the map, a unit not in the list, none picked: no zone
	expect([deploymentOf(w, 0), deploymentOf(w, 7), deploymentOf(w, null)]).toEqual([null, null, null]);
	//on a free hex of the zone: the infantry's ghost and tag; on the taken one or off the zone, nothing
	expect(ghostOf(w, d, { row: 1, col: 1 })).toEqual({ row: 1, col: 1, icon: w.equipment[INFANTERIE].icon, facing: 2, title: "Place Infanterie",
		note: "can't go back to the reserve" });
	expect([ghostOf(w, d, { row: 1, col: 2 }), ghostOf(w, d, { row: 5, col: 5 }), ghostOf(w, d, null), ghostOf(w, null, { row: 1, col: 1 })])
		.toEqual([null, null, null, null]);
	//on the ocean it embarks on the transport; the fighter takes the air slot over the tank
	expect(ghostOf(w, d, { row: 6, col: 6 })).toMatchObject({ icon: w.equipment[TRANSPORTSCHIFFE].icon, note: "embarked · can't go back to the reserve" });
	expect(ghostOf(w, deploymentOf(w, 2), { row: 1, col: 2 })).toMatchObject({ title: "Place Me-109E-3", note: "air · can't go back to the reserve" });
	//a click places it with the deploy command, which the core takes
	const cmd = placeOn(w, d, { row: 6, col: 6 })!;
	expect(cmd).toEqual({ type: "deploy", index: 1, to: { row: 6, col: 6 } });
	const r = step(w, cmd);
	if (r.ok === false) throw new Error(r.refusal.reason);
	expect(unitById(r.world, r.world.state.map.hexes[hexIndex(w, 6, 6)].unit!)!.carrier).toBe(TRANSPORTSCHIFFE);
	expect(placeOn(w, d, { row: 1, col: 2 })).toBeNull();
});

test("Every flag and objective has its plaque (#62): an objective and a town with their owner's side", () => {
	const w = hand([]);
	Object.assign(w.state.map.hexes[hexIndex(w, 2, 2)], { owner: 1, flag: 15, victorySide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 5)], { owner: 0, flag: 7 });
	Object.assign(w.state.map.hexes[hexIndex(w, 7, 1)], { victorySide: 1 });
	w.data.hexes[hexIndex(w, 2, 2)].name = "Mława";
	w.data.hexes[hexIndex(w, 5, 5)].name = "Grudusk";
	expect(plaquesOf(w)).toEqual([
		{ row: 2, col: 2, name: "Mława", objective: true, side: 1, flag: 15, named: true },
		{ row: 5, col: 5, name: "Grudusk", objective: false, side: 0, flag: 7, named: true },
		{ row: 7, col: 1, name: "", objective: true, side: -1, flag: -1, named: true },
	]);
	//an objective without a flag of its own shows its holder's, as the old map did (#504)
	Object.assign(w.state.map.hexes[hexIndex(w, 7, 1)], { owner: 0 });
	expect(plaquesOf(w)[2]).toMatchObject({ side: 0, flag: w.state.players[0].country });
});

test("The map shows every flag (#504), the objectives' names, and the other towns' only with the old detail tooltips setting; L clears the names", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [] });
	Object.assign(w.state.map.hexes[hexIndex(w, 2, 2)], { owner: 1, flag: 15, victorySide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 5)], { owner: 0, flag: 7 });
	const shown = (towns: boolean, labels: boolean) => mapPlaques(w, towns, labels).map((p) => [p.row, p.col, p.named]);
	expect(shown(false, true)).toEqual([[2, 2, true], [5, 5, false]]);
	expect(shown(true, true)).toEqual([[2, 2, true], [5, 5, true]]);
	expect(shown(true, false)).toEqual([[2, 2, false], [5, 5, false]]);
});

test("End turn warns only of the units that can still move or fire at a target in range, not of a shot with nothing to hit (#436)", () => {
	//both tanks have moved and kept their shot: the one next to the Polish tank can fire, the other has nothing in range
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, hasMoved: true }, { eqid: PZ_IIA, owner: 0, row: 8, col: 8, hasMoved: true },
		{ eqid: TP7, owner: 1, row: 4, col: 4 }]);
	expect(unitsToAct(w).map((u) => u.id)).toEqual([0]);
	//(a unit that hasn't moved is counted whether or not it has a target)
	expect(unitsToAct(hand([{ eqid: PZ_IIA, owner: 0, row: 8, col: 8 }])).map((u) => u.id)).toEqual([0]);
	//its marker still shows the shot it has
	expect(mapUnits(w, false, null).find((u) => u.id === 1)!.marker).toMatchObject({ canMove: false, canFire: true });
});
