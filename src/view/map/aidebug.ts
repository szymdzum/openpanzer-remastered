//The AI's debug overlay (#611, the page opened with ?aidebug): what the remastered AI knows and makes of the map
//(src/core/remastered/) as cells over the hexes and a legend. A developer's tool: it shows what the AI's side knows,
//which may be more than the person's side sees
import { analyse } from "../../core/remastered/analysis";
import type { Knowledge } from "../../core/remastered/controller";
import { UNREACHED } from "../../core/remastered/fields";
import { perceive } from "../../core/remastered/perception";
import { movMethodNames, playerType, sideNames } from "../../core/tables";
import type { UnitId, World } from "../../core/types";
import { currentEqid, hexIndex, sideOf, unitById } from "../../core/world";
import { TOKENS } from "../tokens";

const MAP = TOKENS.map;

/** The layers the overlay cycles through, in order. */
export const AI_LAYERS = ["influence", "front", "sectors", "groundThreat", "airThreat", "distance", "supply", "enemies"] as const;
export type AILayer = (typeof AI_LAYERS)[number];

/** The overlay's choice: the layer shown (null: off) and the side whose knowledge (null: the AI's side). */
export interface AIDebug {
	layer: AILayer | null;
	side: number | null;
}

/** What the overlay draws on a hex: a tint, an outline (dashed for a guess), a number or a word. */
export interface DebugCell {
	hex: number;
	tint: string | null;
	alpha: number;
	outline: boolean;
	dashed: boolean;
	text: string | null;
}

export interface Overlay {
	cells: DebugCell[];
	legend: string[];
}

/** A side's knowledge and whether it is the AI's own, with its memory of the enemies, or computed for the overlay. */
export interface Known {
	knowledge: Knowledge;
	memory: boolean;
}

const TITLES: Record<AILayer, [string, string]> = {
	influence: ["Influence", "own (blue) less enemy (red) strength in reach next turn"],
	front: ["Front", "where both sides reach and neither holds sway"],
	sectors: ["Sectors", "the objectives to take: green weak, red held, the enemy's influence"],
	groundThreat: ["Ground threat", "the enemy strength that can hit a ground unit here next turn"],
	airThreat: ["Air threat", "the enemy strength that can hit an aircraft here next turn"],
	distance: ["Distance", "movement points to the nearest objective to take"],
	supply: ["Supply", "hexes to the nearest own city"],
	enemies: ["Enemies", "the enemies known: seen now solid, remembered dashed with the confidence"],
};

//The strongest tint, and the steps a tint's share of the layer's largest value is rounded up to (fewer fills a frame)
const TINT = 0.6;
const STEPS = 5;
const tintOf = (share: number) => Math.ceil(Math.min(1, share) * STEPS) / STEPS * TINT;

/** The next layer: the first after off, off after the last. */
export function nextLayer(layer: AILayer | null): AILayer | null {
	if (layer === null) return AI_LAYERS[0];
	const i = AI_LAYERS.indexOf(layer);
	return i + 1 < AI_LAYERS.length ? AI_LAYERS[i + 1] : null;
}

/** The side the AI plays (its first player's), else the side the screen doesn't show. */
export function aiSide(w: World): number {
	const p = w.state.players.find((x) => x.type === playerType.aiLocal);
	return p !== undefined ? p.side : w.spotSide === 0 ? 1 : 0;
}

//The knowledge computed without a controller, once a world and side: the store hands a new world after every step
const computed = new WeakMap<World, Map<number, Knowledge>>();

/** The AI's knowledge of the side when it plays it, else perceived and analysed on w without memory, once a world. */
export function knownBy(w: World, side: number, own: Knowledge | null): Known {
	if (own !== null) return { knowledge: own, memory: true };
	let bySide = computed.get(w);
	if (bySide === undefined) computed.set(w, bySide = new Map());
	let k = bySide.get(side);
	if (k === undefined) {
		const view = perceive(w, side, []);
		bySide.set(side, k = { view, analysis: analyse(w, view) });
	}
	return { knowledge: k, memory: false };
}

const cell = (hex: number, over: Partial<DebugCell>): DebugCell => ({ hex, tint: null, alpha: 0, outline: false, dashed: false, text: null, ...over });

//A field's hexes tinted by their share of its largest value, with the value written when `written`
function heat(field: ArrayLike<number>, colourOf: (v: number) => string, written: boolean): DebugCell[] {
	let max = 0;
	for (let h = 0; h < field.length; h++) max = Math.max(max, Math.abs(field[h]));
	const out: DebugCell[] = [];
	for (let h = 0; h < field.length; h++)
		if (field[h] !== 0) out.push(cell(h, { tint: colourOf(field[h]), alpha: tintOf(Math.abs(field[h]) / max), text: written ? String(Math.round(field[h])) : null }));
	return out;
}

//A field's reachable values written on their hexes
function numbers(field: ArrayLike<number>): DebugCell[] {
	const out: DebugCell[] = [];
	for (let h = 0; h < field.length; h++) if (field[h] !== UNREACHED) out.push(cell(h, { text: String(field[h]) }));
	return out;
}

//The distance field of the selected unit's movement method when it is the side's, else of the side's first unit's
function distanceOf(w: World, k: Knowledge, selected: UnitId | null): { cells: DebugCell[]; method: string } {
	const u = selected === null ? null : unitById(w, selected);
	const method = u !== null && sideOf(w, u) === k.view.side ? w.equipment[currentEqid(u)].movmethod : null;
	const field = k.analysis.distance.find((d) => d.movmethod === method) ?? k.analysis.distance[0];
	return field === undefined ? { cells: [], method: "no unit" } : { cells: numbers(field.take), method: movMethodNames[field.movmethod] };
}

function enemyCells(w: World, k: Knowledge): DebugCell[] {
	return k.view.enemies.map((e) => cell(hexIndex(w, e.row, e.col), { outline: true, dashed: e.confidence < 1, tint: MAP["map-allied"],
		alpha: e.confidence * TINT / 2, text: `#${e.id} ${Math.round(e.confidence * 100)}%` }));
}

function cellsOf(w: World, k: Knowledge, layer: AILayer, selected: UnitId | null): DebugCell[] {
	const a = k.analysis;
	switch (layer) {
		case "influence": return heat(a.influence.balance, (v) => v > 0 ? MAP["map-axis"] : MAP["map-allied"], false);
		case "front": return a.front.map((h) => cell(h, { outline: true, tint: MAP["hex-select"], alpha: TINT / 3 }));
		case "sectors": return a.sectors.map((s) => cell(hexIndex(w, s.at.row, s.at.col), { outline: true, tint: s.weak ? MAP["map-ok"] : MAP["map-critical"],
			alpha: TINT, text: s.weak ? "weak" : String(Math.round(s.enemy)) }));
		case "groundThreat": return heat(a.threat.ground, () => MAP["hex-target"], true);
		case "airThreat": return heat(a.threat.air, () => MAP["hex-target"], true);
		case "distance": return distanceOf(w, k, selected).cells;
		case "supply": return numbers(a.supply.ground);
		default: return enemyCells(w, k);
	}
}

function legendOf(w: World, known: Known, layer: AILayer, selected: UnitId | null): string[] {
	const [title, what] = TITLES[layer], k = known.knowledge;
	const method = layer === "distance" ? `, ${distanceOf(w, k, selected).method}` : "";
	return [`AI debug: ${title}, ${sideNames[k.view.side]}${method}`, what,
		known.memory ? `the AI's own knowledge, its turn ${k.view.turn}` : "no memory: what the side sees now", "V next layer, X other side"];
}

/**
 * The overlay of the layer chosen, for the side chosen: the AI's knowledge from `own` when it plays that side, else
 * computed on w. Null while it is off or no game plays.
 */
export function aiOverlay(w: World | null, d: AIDebug | null, selected: UnitId | null, own: (side: number) => Knowledge | null): Overlay | null {
	if (w === null || d === null || d.layer === null) return null;
	const side = d.side ?? aiSide(w), known = knownBy(w, side, own(side));
	return { cells: cellsOf(w, known.knowledge, d.layer, selected), legend: legendOf(w, known, d.layer, selected) };
}
