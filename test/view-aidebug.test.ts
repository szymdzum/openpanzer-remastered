//The AI's debug overlay (src/view/map/aidebug.ts, aidebugdraw.ts, #611): what each layer gives a hex, the legend, the
//knowledge without memory when no remastered AI plays the side, computed once a world, the keys behind ?aidebug, and
//the drawing that only touches the hexes in view
import { expect, test } from "vitest";
import { analyse } from "../src/core/remastered/analysis";
import { type Knowledge, knowledgeOf } from "../src/core/remastered/controller";
import { perceive } from "../src/core/remastered/perception";
import { playerType, terrainType } from "../src/core/tables";
import type { World } from "../src/core/types";
import { hexIndex } from "../src/core/world";
import { AI_LAYERS, type AILayer, aiOverlay, aiSide, knownBy, nextLayer } from "../src/view/map/aidebug";
import { drawAIOverlay } from "../src/view/map/aidebugdraw";
import { createStore } from "../src/view/store/store";
import { TOKENS } from "../src/view/tokens";
import { handWorld } from "./coreworld";

const PZ_IIA = 140, PSW_222 = 117, TP7 = 273;

//A Pz IIA and a Psw 222 of the Axis facing a 7TP of the Allies, the Allies the AI; the objective to take 2,8 the Axis's,
//its city 4,0
function world(): World {
	const w = handWorld({ rows: 10, cols: 12, terrain: (r, c) => r === 4 && c === 0 ? terrainType.City : terrainType.Clear, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: PSW_222, owner: 0, row: 6, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 7 }] }, undefined, { noFOW: true });
	w.state.players[1].type = playerType.aiLocal;
	w.state.objectives[0].push({ row: 2, col: 8 });
	w.state.map.hexes[hexIndex(w, 4, 0)].owner = 0;
	return w;
}

const none = (): null => null;
const layer = (w: World, l: AILayer, side: number | null = 0, selected: number | null = null) => aiOverlay(w, { layer: l, side }, selected, none)!;

test("The overlay cycles its layers and is off after the last; off, or with no game, it shows nothing (#611)", () => {
	const seen: (AILayer | null)[] = [];
	for (let l = nextLayer(null); l !== null; l = nextLayer(l)) seen.push(l);
	expect(seen).toEqual([...AI_LAYERS]);
	expect(aiOverlay(world(), { layer: null, side: 0 }, null, none)).toBeNull();
	expect(aiOverlay(null, { layer: "front", side: 0 }, null, none)).toBeNull();
	expect(aiOverlay(world(), null, null, none)).toBeNull();
});

test("The overlay shows the AI's side by default, and says it has no memory when no remastered AI plays it (#611)", () => {
	const w = world();
	expect(aiSide(w)).toBe(1);
	const o = aiOverlay(w, { layer: "influence", side: null }, null, none)!;
	expect(o.legend).toEqual(["AI debug: Influence, Allies", "own (blue) less enemy (red) strength in reach next turn",
		"no memory: what the side sees now", "V next layer, X other side"]);
});

test("The influence layer tints own ground blue and the enemy's red, strongest at the units (#611)", () => {
	const w = world(), o = layer(w, "influence");
	const at = (row: number, col: number) => o.cells.find((c) => c.hex === hexIndex(w, row, col))!;
	expect(at(4, 1)).toMatchObject({ tint: TOKENS.map["map-axis"], alpha: 0.6 });
	expect(at(4, 7).tint).toBe(TOKENS.map["map-allied"]);
	expect(o.cells.every((c) => c.alpha > 0 && c.alpha <= 0.6)).toBe(true);
});

test("The threat layers write the enemy strength that can strike a hex, ground and air apart (#611)", () => {
	const w = world(), ground = layer(w, "groundThreat");
	expect(ground.cells.find((c) => c.hex === hexIndex(w, 4, 6))).toMatchObject({ text: "10", tint: TOKENS.map["hex-target"] });
	expect(ground.cells.find((c) => c.hex === hexIndex(w, 4, 0))).toBeUndefined();
	expect(layer(w, "airThreat").cells).toEqual([]);
});

test("The distance layer writes the points to an objective for the selected unit's movement method (#611)", () => {
	const w = world(), start = hexIndex(w, 4, 2);
	const tracked = layer(w, "distance", 0, 0), wheeled = layer(w, "distance", 0, 1);
	expect(tracked.legend[0]).toBe("AI debug: Distance, Axis, Tracked");
	expect(wheeled.legend[0]).toBe("AI debug: Distance, Axis, Wheeled");
	expect(tracked.cells.find((c) => c.hex === hexIndex(w, 2, 8))!.text).toBe("0");
	expect(Number(wheeled.cells.find((c) => c.hex === start)!.text)).toBe(2 * Number(tracked.cells.find((c) => c.hex === start)!.text));
	//(an enemy selected: the side's first unit's)
	expect(layer(w, "distance", 0, 2).legend[0]).toBe("AI debug: Distance, Axis, Tracked");
});

test("The front, sectors and supply layers mark their hexes (#611)", () => {
	const w = world();
	expect(layer(w, "front").cells.length).toBeGreaterThan(0);
	expect(layer(w, "front").cells.every((c) => c.outline && !c.dashed)).toBe(true);
	expect(layer(w, "sectors").cells).toMatchObject([{ hex: hexIndex(w, 2, 8), outline: true, tint: TOKENS.map["map-critical"],
		text: expect.stringMatching(/^\d+$/) as unknown }]);
	const supply = layer(w, "supply").cells;
	expect(supply).toHaveLength(10 * 12);
	expect([supply[hexIndex(w, 4, 0)].text, supply[hexIndex(w, 4, 3)].text]).toEqual(["0", "3"]);
});

test("The enemies layer shows the AI's memory: a remembered enemy dashed with its confidence (#611)", () => {
	const w = world(), view = perceive(w, 0, []);
	const remembered = { ...view, enemies: [...view.enemies, { ...view.enemies[0], id: 9, row: 8, col: 10, turn: 0, confidence: 0.5 }] };
	const own: Knowledge = { view: remembered, analysis: analyse(w, remembered) };
	const o = aiOverlay(w, { layer: "enemies", side: 0 }, null, (side) => side === 0 ? own : null)!;
	expect(o.cells.map((c) => [c.text, c.dashed])).toEqual([["#2 100%", false], ["#9 50%", true]]);
	expect(o.legend[2]).toBe("the AI's own knowledge, its turn 1");
});

test("The knowledge without memory is computed once a world and side, again for a new world (#611)", () => {
	const w = world(), first = knownBy(w, 0, null).knowledge;
	expect(knownBy(w, 0, null).knowledge).toBe(first);
	expect(knownBy(w, 1, null).knowledge).not.toBe(first);
	expect(knownBy({ ...w }, 0, null).knowledge).not.toBe(first);
	const own = { view: first.view, analysis: first.analysis };
	expect(knownBy(w, 0, own)).toEqual({ knowledge: own, memory: true });
});

test("The remastered controller's knowledge is found for its side only (#611)", () => {
	const w = world(), view = perceive(w, 1, []), k = { view, analysis: analyse(w, view) };
	const c = { player: 1, view: k.view, analysis: k.analysis, join: none, startTurn: none, plan: none, next: none } as never;
	expect(knowledgeOf([null, c], 1)).toEqual(k);
	expect(knowledgeOf([null, c], 0)).toBeNull();
});

test("Behind ?aidebug the store shows the first layer and V and X cycle the layer and the side; without it the keys do nothing (#611)", () => {
	const w = world();
	const host = { world: () => w, command: () => ({ ok: true, result: null as null }), won: () => {} };
	const store = createStore(host as never, { sound: () => {}, still: () => true, aiDebug: true });
	//(no game yet: the keys change nothing)
	store.shortcut({ menu: "aiLayer" });
	store.refresh();
	expect(store.aiLayers.value!.legend[0]).toBe("AI debug: Influence, Allies");
	store.shortcut({ menu: "aiLayer" });
	expect(store.aiLayers.value!.legend[0]).toBe("AI debug: Front, Allies");
	store.shortcut({ menu: "aiSide" });
	expect(store.aiLayers.value!.legend[0]).toBe("AI debug: Front, Axis");
	store.shortcut({ menu: "aiSide" });
	expect(store.aiLayers.value!.legend[0]).toBe("AI debug: Front, Allies");
	for (let i = 0; i < AI_LAYERS.length - 1; i++) store.shortcut({ menu: "aiLayer" });
	expect(store.aiLayers.value).toBeNull();
	const plain = createStore(host as never);
	plain.refresh();
	plain.shortcut({ menu: "aiLayer" });
	plain.shortcut({ menu: "aiSide" });
	expect(plain.aiLayers.value).toBeNull();
});

test("The overlay draws only the hexes in view: their tints, outlines and numbers (#611)", () => {
	const w = world(), o = layer(w, "groundThreat");
	const calls: string[] = [];
	const c = new Proxy({} as Record<string | symbol, unknown>, {
		get: (target, prop) => prop in target ? target[prop] : (...args: unknown[]) => {
			calls.push(String(prop) + (prop === "fillText" ? " " + (args[0] as string) : ""));
			return prop === "measureText" ? { width: 10 } : undefined;
		},
		set: (target, prop, value) => { target[prop] = value; return true; },
	}) as unknown as CanvasRenderingContext2D;
	const all = { x: 0, y: 0, width: 2000, height: 2000, scale: 1, dpr: 1 };
	drawAIOverlay(c, all, o, 10, 12);
	expect(calls.filter((x) => x.startsWith("fillText")).length).toBe(o.cells.length);
	calls.length = 0;
	//(only the top left corner in view: the 7TP's threat starts at column 2, two hexes from the view)
	drawAIOverlay(c, { ...all, width: 10, height: 10 }, o, 10, 12);
	expect(calls.filter((x) => x.startsWith("fillText")).length).toBeLessThan(o.cells.length);
	//The outlines: one stroke for the front, solid; the remembered enemies dashed
	calls.length = 0;
	drawAIOverlay(c, all, layer(w, "front"), 10, 12);
	expect(calls.filter((x) => x === "stroke")).toHaveLength(2);
	expect(calls.filter((x) => x === "fillText")).toEqual([]);
});
