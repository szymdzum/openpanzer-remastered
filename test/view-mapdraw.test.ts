// @vitest-environment node
//The map's canvas (src/view/mapdraw.ts, #345) on a context that records what it is told: the MapOverlays
//card's order, the tokens' colours and widths, and the overlays at screen size at every map scale (ZoomLevels)
import { expect, test } from "vitest";
import { handWorld } from "./coreworld";
import { toScreen, type Viewport } from "../src/view/canvas";
import { BRIDGE, drawMap, type Images, type Scene } from "../src/view/mapdraw";
import { type MapUnit, mapUnits, pathOf, selectionOf } from "../src/view/mapview";
import { fogOf, plaquesOf, supportOf } from "../src/view/mapinfo";
import { hexIndex } from "../src/core/world";
import { TOKENS } from "../src/view/tokens";

const MAP = TOKENS.map;

//A call, with the transform's scale (zoom) and the stroke state at that moment
interface Op {
	op: string;
	args: unknown[];
	zoom: number;
	lineWidth: number;
	strokeStyle: string;
	fillStyle: string;
	dash: number[];
}

function recorder() {
	const ops: Op[] = [];
	const state = { zoom: 1, lineWidth: 1, strokeStyle: "", fillStyle: "", dash: [] as number[] };
	const ctx = new Proxy({} as Record<string | symbol, unknown>, {
		get(target, name) {
			if (name in state) return state[name as keyof typeof state];
			if (name in target) return target[name];
			return (...args: unknown[]) => {
				if (name === "setTransform") state.zoom = args[0] as number;
				if (name === "setLineDash") state.dash = args[0] as number[];
				ops.push({ op: String(name), args, ...state, dash: [...state.dash] });
				return name === "measureText" ? { width: 10 } : undefined;
			};
		},
		set(target, name, value) {
			if (name in state) (state as Record<string, unknown>)[name as string] = value;
			else target[name] = value;
			return true;
		},
	});
	return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const sprite = { width: 720, height: 50 } as unknown as ReturnType<Images>;
const images: Images = (file) => file === "" ? null : sprite;

function scene(w = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 1, entrenchment: 2, hits: 1, experience: 120 },
	{ eqid: 273, owner: 1, row: 4, col: 4 }, { eqid: 273, owner: 1, row: 3, col: 1, facing: 12 }] }, undefined, { spotSide: 0 })): Scene {
	const selection = selectionOf(w, 0);
	return { terrain: sprite as CanvasImageSource, size: { width: 600, height: 600 }, rows: 10, cols: 10, grid: false, units: mapUnits(w, false, 0), selection,
		path: pathOf(w, selection, { row: 4, col: 3 }), fog: null, support: null, plaques: [] };
}

const vp = (scale: number, dpr = 2): Viewport => ({ x: 10, y: 20, width: 600, height: 400, scale, dpr });

test("Lines and markers keep their screen size at every map scale; the terrain and sprites scale (ZoomLevels)", () => {
	for (const scale of [1, 2, 3]) {
		const { ctx, ops } = recorder();
		drawMap(ctx, scene(), vp(scale), images);
		const terrain = ops.find((o) => o.op === "drawImage")!;
		expect(terrain.zoom).toBe(2 * scale);
		const strokes = ops.filter((o) => o.op === "stroke");
		expect(strokes.every((o) => o.zoom === 2)).toBe(true);
		const select = strokes.find((o) => o.strokeStyle === MAP["hex-select"])!;
		expect(select.lineWidth).toBe(TOKENS.px["hex-select-width"]);
		const plate = ops.find((o) => o.op === "fillText" && o.args[0] === "10")!;
		expect(plate.zoom).toBe(2);
	}
});

test("The overlays come in the card's order: area, outline, targets, selection, path, sprites, markers", () => {
	const { ctx, ops } = recorder();
	drawMap(ctx, scene(), vp(1), images);
	const at = (pred: (o: Op) => boolean) => ops.findIndex(pred);
	const order = [
		at((o) => o.op === "fill" && o.fillStyle === MAP["hex-move"]), //the area's tint
		at((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-move"] && o.lineWidth === TOKENS.px["hex-move-width"]),
		at((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-target"] && o.lineWidth === TOKENS.px["hex-target-width"]),
		at((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-select"]),
		at((o) => o.op === "fillRect" && o.fillStyle === MAP["hex-target"]), //the path's stop square
		at((o) => o.op === "drawImage" && o.args[1] !== 0 || (o.op === "drawImage" && o.args.length === 9)), //a sprite
		at((o) => o.op === "fillText"),
	];
	expect(order.every((i) => i >= 0)).toBe(true);
	expect([...order].sort((a, b) => a - b)).toEqual(order);
	//the target's outline is dashed, the path's end is a stop square in the enemy zone
	expect(ops.find((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-target"] && o.lineWidth === TOKENS.px["hex-target-width"])!.dash)
		.toEqual([5, 3]);
});

test("A marker: the plate's strength, the hits tag, a sandbag per level; the enemy's sprite mirrored to its facing", () => {
	const { ctx, ops } = recorder();
	drawMap(ctx, scene(), vp(1, 1), images);
	const texts = ops.filter((o) => o.op === "fillText").map((o) => o.args[0]);
	expect(texts).toEqual(["10", "10", "−2"]); //the enemy at 3,1, then the tank at 4,1 (the enemy at 4,4 in the fog)
	expect(ops.filter((o) => o.op === "roundRect")).toHaveLength(2);
	expect(ops.filter((o) => o.op === "fillRect" && o.fillStyle === MAP["map-critical"])).toHaveLength(1);
	//facing 12 (W) is the strip's frame 4 (E) mirrored
	const mirrored = ops.findIndex((o) => o.op === "scale" && o.args[0] === -1);
	expect(mirrored).toBeGreaterThan(0);
	const frame = ops.slice(mirrored).find((o) => o.op === "drawImage")!;
	expect(frame.args[1]).toBe(4 * 80);
});

test("A ring with the moves left; a light ring when the unit can move again; dashed past what the side sees; the grid", () => {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: 117, owner: 0, row: 4, col: 1 }] }, undefined, { spotSide: 0 });
	const selection = selectionOf(w, 0);
	const far = selection!.area.reduce((a, c) => c.col > a.col ? c : a);
	const path = pathOf(w, selection, far)!;
	expect(path.cells.some((c) => !c.seen) && path.again).toBe(true);
	const { ctx, ops } = recorder();
	drawMap(ctx, { terrain: null, size: { width: 600, height: 600 }, rows: 10, cols: 10, grid: true, units: [], selection, path, fog: null, support: null, plaques: [] }, vp(1), images);
	expect(ops.some((o) => o.op === "stroke" && o.lineWidth === 1)).toBe(true); //the grid
	expect(ops.some((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-move"] && o.dash.join() === "6,4")).toBe(true);
	expect(ops.some((o) => o.op === "fill" && o.fillStyle === MAP["hex-move"] && o.zoom === 2)).toBe(true); //the light ring
	expect(ops.find((o) => o.op === "fillText")!.args[0]).toBe(String(path.left));
	expect(ops.some((o) => o.op === "drawImage")).toBe(false);
});

test("A unit on a bridge of its side is drawn as the bridge; an image not loaded isn't drawn", () => {
	const drawn: string[] = [];
	const { ctx } = recorder();
	const unit: MapUnit = { id: 0, row: 1, col: 1, icon: "a.png", facing: 0, side: 0, bridge: true, marker: null };
	drawMap(ctx, { terrain: null, size: { width: 600, height: 600 }, rows: 3, cols: 3, grid: false, units: [unit, { ...unit, bridge: false, icon: "" }], selection: null, path: null,
		fog: null, support: null, plaques: [] },
		vp(1), (file) => {
			drawn.push(file);
			return file === "" ? null : sprite;
		});
	expect(drawn).toEqual([BRIDGE, ""]);
	expect(toScreen({ x: 100, y: 50 }, vp(2))).toEqual({ x: 190, y: 80 });
});

//The overlays beside the move area: the fog, the hatched unseen hexes, the zone bars, the support fire and the
//plaques, at screen size (the scale 2 here), in the card's order
test("Fog, hatching, zone bars, support fire and plaques are drawn in the card's order at screen size", () => {
	const w = handWorld({ rows: 12, cols: 12, units: [{ eqid: 140, owner: 0, row: 4, col: 3 }, { eqid: 273, owner: 1, row: 4, col: 4 },
		{ eqid: 262, owner: 1, row: 5, col: 5 }, { eqid: 273, owner: 1, row: 9, col: 9, tempSpotted: true }] }, undefined, { spotSide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 2, 2)], { owner: 1, flag: 15, victorySide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 6, 1)], { owner: 0, flag: 7 });
	w.data.hexes[hexIndex(w, 2, 2)].name = "Mława";
	const selection = selectionOf(w, 0)!;
	const support = supportOf(w, selection, { row: 4, col: 4 }, false);
	expect(support).not.toBeNull();
	expect(selection.zones.length + selection.unseen.length).toBeGreaterThan(0);
	const { ctx, ops } = recorder();
	drawMap(ctx, { terrain: null, size: { width: 600, height: 600 }, rows: 12, cols: 12, grid: false, units: mapUnits(w, false, 0), selection, path: null, fog: fogOf(w), support,
		plaques: plaquesOf(w) }, vp(2), images);
	const at = (pred: (o: Op) => boolean) => ops.findIndex(pred);
	const fog = at((o) => o.op === "fill" && o.fillStyle === MAP["hex-fog"]);
	const hatch = ops.findIndex((o, i) => o.op === "clip" && i > fog); //(the first clip is the map's edge)
	const zone = at((o) => o.op === "stroke" && o.lineWidth === TOKENS.px["hex-zone-width"] && o.strokeStyle === MAP["hex-target"]);
	const arc = at((o) => o.op === "stroke" && o.lineWidth === TOKENS.px["hex-support-width"]);
	const select = at((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-select"]);
	const plaque = at((o) => o.op === "fillText" && o.args[0] === "MŁAWA  +150");
	const tag = at((o) => o.op === "fillText" && o.args[0] === "support fire");
	const order = [fog, hatch, zone, arc, select, plaque, tag];
	expect(order.every((i) => i >= 0)).toBe(true);
	expect([...order].sort((a, b) => a - b)).toEqual(order);
	expect([ops[zone].zoom, ops[arc].zoom, ops[arc].dash]).toEqual([2, 2, [5, 3]]);
	expect(ops.some((o) => o.op === "fillText" && o.args[0] === "TOWN  +50")).toBe(true);
	//the town's owner bar in the axis colour, the objective's in the allied; the revealed enemy's plate dotted
	expect(ops.filter((o) => o.op === "fillRect" && (o.fillStyle === MAP["map-axis"] || o.fillStyle === MAP["map-allied"])).map((o) => o.fillStyle))
		.toEqual([MAP["map-allied"], MAP["map-axis"]]);
	expect(ops.some((o) => o.op === "stroke" && o.dash.join() === "1.5,1.5" && o.strokeStyle === MAP.glint)).toBe(true);
});
