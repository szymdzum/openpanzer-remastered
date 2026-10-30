//The remastered AI's maps of a side (src/core/remastered/, #610) as the command-line player shows them: the front, the
//weak sectors, the threatened units, the enemies remembered, the objectives and the garrisons its staff would set
//(#616). A call has no controller's memory, so the side knows only the enemies it sees now
import { analyse, type Analysis } from "../src/core/remastered/analysis";
import { UNREACHED } from "../src/core/remastered/fields";
import { perceive, type SideView } from "../src/core/remastered/perception";
import { type Operation, threatenedObjectives, withGarrisons } from "../src/core/remastered/staff";
import type { Position, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { cell, label, positionOf, SIDES } from "./known";

//How many of a list a line shows
const SHOWN = 8;

const listed = (items: string[], what: string) => items.length === 0 ? `${what}: none`
	: `${what} (${items.length}): ${items.slice(0, SHOWN).join("; ")}${items.length > SHOWN ? "; ..." : ""}`;
const round = (x: number) => Math.round(x * 10) / 10;
const points = (x: number) => x === UNREACHED ? "no way" : `${x}`;

function frontLine(w: World, a: Analysis): string {
	if (a.front.length === 0) return "front: none (the two sides' reach doesn't meet)";
	const at = a.front.map((h) => positionOf(w, h)), rows = at.map((p) => p.row), cols = at.map((p) => p.col);
	return `front: ${at.length} hexes, rows ${Math.min(...rows)}-${Math.max(...rows)}, columns ${Math.min(...cols)}-${Math.max(...cols)}: `
		+ at.slice(0, 2 * SHOWN).map(cell).join(" ") + (at.length > 2 * SHOWN ? " ..." : "");
}

const sectorLines = (a: Analysis) => listed(a.sectors.map((s) => `${cell(s.at)}${s.weak ? " weak" : ""} (enemy ${round(s.enemy)}, own ${round(s.own)})`),
	"objectives to take, the weakest held first");

function threatenedLines(w: World, a: Analysis): string {
	const units = [...a.units].filter((u) => u.threat > 0).sort((x, y) => y.threat - x.threat);
	return listed(units.map((u) => `${label(w, unitById(w, u.id))}: threat ${round(u.threat)}, supply ${points(u.supply)} hexes away, `
		+ `${points(u.take)} points to an objective to take`), "own units under threat, most first");
}

function enemyLines(w: World, view: SideView): string {
	const remembered = view.enemies.filter((e) => e.confidence < 1);
	return `enemies: ${view.seen.length} seen now, ${remembered.length} remembered` + (remembered.length === 0 ? "" : ": "
		+ remembered.map((e) => `#${e.id} ${w.equipment[e.eqid].name} @${cell(e)} seen turn ${e.turn}, confidence ${e.confidence}`).join("; "));
}

function objectiveLine(a: Analysis, what: string, list: readonly Position[], w: World): string {
	return listed(list.map((p) => {
		const h = p.row * w.state.map.cols + p.col;
		return `${cell(p)} (enemy ${round(a.influence.enemy[h])}, threat ${round(a.threat.ground[h])}, supply ${points(a.supply.ground[h])} hexes away)`;
	}), what);
}

//The garrisons the staff of each of the side's players would set now on the objectives in the enemy's reach
function garrisonsOf(w: World, view: SideView, a: Analysis): Operation[] {
	const threats = threatenedObjectives(w, view, a.objectives.hold);
	let ops: Operation[] = [];
	for (const p of w.state.players) if (p.side === view.side) ops = withGarrisons(w, p.id, ops, threats);
	return ops;
}

const garrisonLine = (w: World, ops: readonly Operation[]) => listed(ops.map((op) =>
	`${label(w, unitById(w, op.units[0]))} (${op.reason})`), "garrisons the staff would set now");

//Typed arrays as lists, for JSON
const plain = (a: Analysis): unknown => JSON.parse(JSON.stringify(a, (_k, v: unknown) =>
	ArrayBuffer.isView(v) ? Array.from(v as Float32Array, (x) => round(x)) : v));

/** The analysis of side's maps in w, as lines and as data. */
export function analysisOf(w: World, side: number): { lines: string[]; data: unknown } {
	const view = perceive(w, side, []), a = analyse(w, view), garrisons = garrisonsOf(w, view, a);
	const lines = [`the analysis of the ${SIDES[side]}, turn ${a.turn} (no memory: the enemies it sees now, none remembered)`,
		frontLine(w, a), sectorLines(a), threatenedLines(w, a), enemyLines(w, view),
		objectiveLine(a, "objectives to take", a.objectives.take, w), objectiveLine(a, "objectives to hold", a.objectives.hold, w),
		garrisonLine(w, garrisons)];
	return { lines, data: { ...plain(a) as object, garrisons } };
}
