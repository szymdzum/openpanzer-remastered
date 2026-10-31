//The remastered AI's maps of a side (src/core/remastered/, #610) as the command-line player shows them: the front, the
//weak sectors, the threatened units, the enemies remembered, the objectives, the garrisons its staff would set (#616)
//, its assault (#618) and its air plan (#619). A call has no controller's memory, so the side knows only the enemies it
//sees now
import { analyse, type Analysis, type AnalysisCache } from "../src/core/remastered/analysis";
import { airState, airStrikeOrder, type Sky } from "../src/core/remastered/air";
import { assaultOrder, battleGroup, withAssault } from "../src/core/remastered/assault";
import { unitClassNames } from "../src/core/tables";
import { UNREACHED } from "../src/core/remastered/fields";
import { perceive, type SideView } from "../src/core/remastered/perception";
import { type Operation, threatenedObjectives, withGarrisons } from "../src/core/remastered/staff";
import type { Command } from "../src/core/command";
import type { Position, UnitState, World } from "../src/core/types";
import { unitById, unitData } from "../src/core/world";
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

//The assault the staff of the side's first player would set now, its battle group by class and its next order
interface AssaultView {
	op: Operation;
	group: UnitState[];
	next: { step: string; commands: Command[] } | null;
}

function assaultOf(w: World, a: Analysis, garrisons: readonly Operation[]): AssaultView | null {
	const player = w.state.players.find((p) => p.side === a.side), cache: AnalysisCache = new Map();
	const op = player === undefined ? undefined : withAssault(w, a, cache, player.id, []).find((o) => o.kind === "assault");
	if (player === undefined || op === undefined) return null;
	const held = new Set(garrisons.flatMap((g) => g.units));
	return { op, group: battleGroup(w, cache, op.at, player.id, held), next: assaultOrder(w, a, cache, op, player.id, held, new Set()) };
}

function commandLine(w: World, cmd: Command): string {
	const u = "unit" in cmd ? unitById(w, cmd.unit) : null, who = u === null ? "" : label(w, u);
	if (cmd.type === "attack") return `${who} attacks ${label(w, unitById(w, cmd.target) as UnitState)}`;
	return cmd.type === "move" ? `${who} moves to ${cell(cmd.to)}` : `${who} ${cmd.type}s`;
}

function assaultLine(w: World, view: AssaultView | null): string {
	if (view === null) return "assault: none (no objective to take, or the side defends)";
	const classes = new Map<string, number>();
	for (const u of view.group) {
		const name = unitClassNames[unitData(w, u, true).uclass];
		classes.set(name, (classes.get(name) ?? 0) + 1);
	}
	const group = [...classes].map(([name, n]) => `${n} ${name}`).join(", ") || "none";
	const next = view.next === null ? "none" : `${view.next.step}: ${view.next.commands.map((c) => commandLine(w, c)).join(", then ")}`;
	return `assault the staff would set now: ${cell(view.op.at)} (${view.op.reason}); group of ${view.group.length} (${group}); next order ${next}`;
}

//The air plan of the staff of the side's first player now: its fighters and bombers, the spent ones, its next order
interface AirView {
	aircraft: ReturnType<typeof airState>;
	next: Command[] | null;
}

function airOf(w: World, view: SideView, a: Analysis, garrisons: readonly Operation[], assault: AssaultView | null): AirView | null {
	const player = w.state.players.find((p) => p.side === a.side);
	if (player === undefined) return null;
	const sky: Sky = { w, a, view, cache: new Map(), player: player.id, assault: assault?.op, held: new Set(garrisons.flatMap((g) => g.units)) };
	const aircraft = airState(sky);
	return aircraft.length === 0 ? null : { aircraft, next: airStrikeOrder(sky) };
}

function airLine(w: World, view: AirView | null): string {
	if (view === null) return "air: no fighters or bombers";
	const aircraft = view.aircraft.map((x) => `${label(w, unitById(w, x.unit))}${x.spent ? " spent" : ""}`
		+ `${x.exposed ? " in the air defence's reach" : ""}`).join("; ");
	const next = view.next === null ? "none (the classic plan flies the rest)" : view.next.map((c) => commandLine(w, c)).join(", then ");
	return `air the staff would fly now: ${aircraft}; next order ${next}`;
}

//Typed arrays as lists, for JSON
const plain = (a: Analysis): unknown => JSON.parse(JSON.stringify(a, (_k, v: unknown) =>
	ArrayBuffer.isView(v) ? Array.from(v as Float32Array, (x) => round(x)) : v));

/** The analysis of side's maps in w, as lines and as data. */
export function analysisOf(w: World, side: number): { lines: string[]; data: unknown } {
	const view = perceive(w, side, []), a = analyse(w, view), garrisons = garrisonsOf(w, view, a), assault = assaultOf(w, a, garrisons);
	const air = airOf(w, view, a, garrisons, assault);
	const lines = [`the analysis of the ${SIDES[side]}, turn ${a.turn} (no memory: the enemies it sees now, none remembered)`,
		frontLine(w, a), sectorLines(a), threatenedLines(w, a), enemyLines(w, view),
		objectiveLine(a, "objectives to take", a.objectives.take, w), objectiveLine(a, "objectives to hold", a.objectives.hold, w),
		garrisonLine(w, garrisons), assaultLine(w, assault), airLine(w, air)];
	const assaultData = assault === null ? null : { ...assault.op, group: assault.group.map((u) => u.id), next: assault.next };
	const airData = air === null ? null : { aircraft: air.aircraft, next: air.next };
	return { lines, data: { ...plain(a) as object, garrisons, assault: assaultData, air: airData } };
}
