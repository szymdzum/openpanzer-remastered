//The scenario as the command-line player shows it (#279): the turn and the victory hexes, the map as
//text, one hex in detail, what can be bought and deployed
import { unitCost } from "../src/core/costs";
import { deploymentHexes } from "../src/core/deployment";
import type { HexState, Position, UnitState, World } from "../src/core/types";
import type { HexData } from "../src/state";
import { isTransportable } from "../src/core/units";
import { hexIndex, isSpotted, isZOC, sideOf, unitById } from "../src/core/world";
import { groundConditionNames, terrainNames, terrainType, unitClass, unitClassNames, weatherConditionNames } from "../src/prototypes";
import { attackerLine, attackers } from "./combat";
import { cell, knownWorld, label, own, playerOfSide, positionOf, seen, SIDES, sideOfPlayer } from "./known";
import { unitLine } from "./units";

const victoryHexes = (w: World) => w.state.map.hexes.map((h, i) => ({ h, i })).filter(({ h }) => h.victorySide >= 0);
const holder = (w: World, h: HexState) => h.owner < 0 ? -1 : sideOfPlayer(w, h.owner);

//The side that still has to take a hex: the one whose objective list has it
const takerOf = (w: World, p: Position) =>
	w.state.objectives.findIndex((list) => list.some((o) => o.row === p.row && o.col === p.col));

function objectiveLine(w: World, side: number, h: HexState, i: number): string {
	const p = positionOf(w, i), owner = holder(w, h), taker = takerOf(w, p), g = h.unit === null ? null : unitById(w, h.unit);
	return `  ${cell(p)} ${w.data.hexes[i].name || "?"}: held by ${owner < 0 ? "nobody" : SIDES[owner]}`
		+ (taker < 0 ? "" : `, ${SIDES[taker]} to take`) + (g && seen(w, side, g) ? ` (${label(w, g)})` : "");
}

//What the turn limit would decide now (src/core/turn.ts turnLimitOutcome, #256): the side holding more
//victory hexes wins
function verdict(w: World): string {
	const held = [0, 1].map((s) => victoryHexes(w).filter(({ h }) => holder(w, h) === s).length);
	const who = held[0] === held[1] ? "a tie: the side that ended its turn loses" : `${SIDES[held[0] > held[1] ? 0 : 1]} wins`;
	return `at the turn limit now: ${SIDES[0]} holds ${held[0]}, ${SIDES[1]} ${held[1]} -> ${who}`;
}

//The scenario's state for side: the turn, the limits, the prestige, every victory hex and the verdict
export function status(w: World, side: number): string[] {
	const s = w.state, sc = s.scenario, left = s.objectives.map((o) => o.length);
	return [
		`${w.data.name}: turn ${s.turn.turn}/${sc.maxTurns}, ${SIDES[sideOfPlayer(w, s.turn.currentPlayer)]} to play (you: ${SIDES[side]}), `
			+ `${new Date(sc.date).toDateString()}, ${groundConditionNames[sc.ground]} ground, ${weatherConditionNames[sc.atmospheric]}`,
		`victory turns: brilliant by ${sc.victoryTurns[0]}, victory by ${sc.victoryTurns[1]}, tactical by ${sc.victoryTurns[2]}`,
		`prestige ${playerOfSide(w, side).prestige}`,
		"victory hexes (who holds it, who still has to take it):",
		...victoryHexes(w).map(({ h, i }) => objectiveLine(w, side, h, i)),
		`objectives left to take: ${SIDES[0]} ${left[0]}, ${SIDES[1]} ${left[1]}`,
		verdict(w),
	];
}

const LETTERS: { [uclass: number]: string } = {
	[unitClass.infantry]: "i", [unitClass.tank]: "t", [unitClass.recon]: "r", [unitClass.antiTank]: "p",
	[unitClass.flak]: "a", [unitClass.airDefence]: "a", [unitClass.fortification]: "b", [unitClass.groundTransport]: "v",
	[unitClass.artillery]: "g", [unitClass.fighter]: "j", [unitClass.tacticalBomber]: "s", [unitClass.levelBomber]: "l",
	[unitClass.airTransport]: "q",
};
const TERRAIN = ".cafbhmsw~rxp-e=o";

function terrainChar(d: HexData, h: HexState): string {
	if (h.victorySide >= 0) return "$";
	return d.road && d.terrain === 0 ? "+" : TERRAIN[d.terrain] ?? "?";
}

function letter(kw: World, side: number, u: UnitState): string {
	const l = LETTERS[own(kw, u).uclass] ?? "n";
	return sideOf(kw, u) === side ? l.toUpperCase() : l;
}

const unitOn = (kw: World, id: number | null) => id === null ? null : unitById(kw, id);
const zocMark = (kw: World, side: number, i: number, zoc: boolean) => zoc && isZOC(kw, i, 1 - side) ? ":" : " ";

//A hex in two characters: the terrain, then the unit on it
function hexChars(kw: World, side: number, i: number, zoc: boolean): string {
	const h = kw.state.map.hexes[i], g = unitOn(kw, h.unit), a = unitOn(kw, h.air);
	if (g) return terrainChar(kw.data.hexes[i], h) + letter(kw, side, g);
	if (a) return "*" + letter(kw, side, a);
	return terrainChar(kw.data.hexes[i], h) + zocMark(kw, side, i, zoc);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

const MAP_LEGEND = [
	"terrain: . clear  + road  c city  a airfield  f forest  h hill  m mountain  w swamp  r river  = impassable river",
	"         - stream  x fortification  o rough  $ objective  * an aircraft alone on the hex",
	"units (yours CAPITAL, enemy small): i infantry t tank r recon p anti-tank a flak/AA b bunker v transport g artillery",
	"         j fighter s tactical bomber l level bomber;  : a seen enemy's zone of control (--zoc)",
	"odd columns sit half a hex lower: a hex's side neighbours are rows r-1 and r on even columns, r and r+1 on odd ones",
];

//The map as text, two characters a hex: the terrain (a road on clear ground "+", an objective "$"),
//then the unit (yours in capitals, the enemy's in small letters, an aircraft alone "*" before its
//letter), or ":" on an empty hex in a seen enemy's zone of control with zoc
export function map(w: World, side: number, rows: [number, number], cols: [number, number], zoc: boolean): string[] {
	const kw = knownWorld(w, side), c = range(cols[0], cols[1]);
	return [
		"    " + c.map((x) => (x >= 10 ? String(Math.floor(x / 10)) : " ") + " ").join(""),
		"    " + c.map((x) => String(x % 10) + " ").join(""),
		...range(rows[0], rows[1]).map((r) => String(r).padStart(3) + " " + c.map((x) => hexChars(kw, side, r * kw.state.map.cols + x, zoc)).join("")),
		...MAP_LEGEND,
	];
}

//The facts of a hex, those that apply
const HEX_NOTES: ((kw: World, side: number, i: number) => string)[] = [
	(kw, _s, i) => kw.data.hexes[i].road ? "road" : "",
	(kw, _s, i) => `owner ${kw.state.map.hexes[i].owner < 0 ? "none" : SIDES[sideOfPlayer(kw, kw.state.map.hexes[i].owner)]}`,
	(kw, _s, i) => kw.state.map.hexes[i].victorySide >= 0 ? "victory hex" : "",
	(kw, _s, i) => kw.data.hexes[i].deployment >= 0 ? `deployment hex of player ${kw.data.hexes[i].deployment}` : "",
	(kw, s, i) => isSpotted(kw, i, s) ? "spotted by you" : "not spotted by you",
	(kw, s, i) => isZOC(kw, i, 1 - s) ? "in a seen enemy's zone of control" : "",
];

function unitLines(w: World, kw: World, side: number, u: UnitState, air: boolean): string[] {
	const head = (air ? "air: " : "ground: ") + unitLine(kw, u, sideOf(kw, u) === side);
	if (sideOf(kw, u) === side) return [head];
	const a = attackers(w, side, u.id);
	return [head, a.estimates.length ? "  your attackers:" : "  " + a.note, ...a.estimates.map((e) => "    " + attackerLine(kw, e))];
}

//A hex: terrain, road, owner, objective, the units there, and who of side's can attack the enemy on it
export function hex(w: World, side: number, p: Position): string[] {
	const kw = knownWorld(w, side), i = hexIndex(kw, p.row, p.col), h = kw.state.map.hexes[i];
	const head = `${[cell(p), kw.data.hexes[i].name].filter(Boolean).join(" ")}: ${terrainNames[kw.data.hexes[i].terrain]}, `
		+ HEX_NOTES.map((n) => n(kw, side, i)).filter(Boolean).join(", ");
	const ground = unitOn(kw, h.unit), air = unitOn(kw, h.air);
	return [head, ...(ground ? unitLines(w, kw, side, ground, false) : []), ...(air ? unitLines(w, kw, side, air, true) : [])];
}

function shopLine(w: World, id: string, e: EquipmentEntry, transports: [string, EquipmentEntry][]): string {
	const line = `${id} ${e.name} [${unitClassNames[e.uclass]}] cost ${unitCost(w, +id)}: soft ${e.softatk} hard ${e.hardatk} air ${e.airatk}`
		+ ` def ${e.grounddef}/${e.airdef}/${e.closedef} ini ${e.initiative} range ${e.gunrange} moves ${e.movpoints} ammo ${e.ammo} fuel ${e.fuel} spot ${e.spotrange}`;
	const fit = isTransportable(w, +id) ? transports.filter(([, t]) => (e.groundweight & t.groundweight) !== 0) : [];
	return fit.length ? line + `\n    transports: ${fit.map(([tid, t]) => `${tid} ${t.name} (moves ${t.movpoints}, +${unitCost(w, 0, +tid)})`).join(", ")}` : line;
}

//What side can buy: its country's equipment in service this year (the purchase screen's list), by
//class and cost, with the transports a transportable unit can take; uclass: one class only
export function shop(w: World, side: number, uclass?: number): string[] {
	const p = playerOfSide(w, side), year = +w.state.scenario.date.slice(0, 4);
	const inService = ([, e]: [string, EquipmentEntry]) => +e.country === p.country + 1 && e.yearavailable <= year && e.yearexpired >= year;
	const all = Object.entries(w.equipment).filter(inService);
	const transports = all.filter(([, e]) => e.uclass === unitClass.groundTransport);
	const units = all.filter(([, e]) => e.uclass !== unitClass.groundTransport && (uclass === undefined || e.uclass === uclass))
		.sort((a, b) => a[1].uclass - b[1].uclass || unitCost(w, +a[0]) - unitCost(w, +b[0]));
	return [`prestige ${p.prestige}`, ...units.map(([id, e]) => shopLine(w, id, e, transports))];
}

function deploymentHex(w: World, i: number): string {
	const h = w.state.map.hexes[i];
	if (h.unit === null) return cell(positionOf(w, i));
	return h.air === null ? cell(positionOf(w, i)) + " (aircraft only)" : "";
}

//A town a side without deployment hexes deploys on in the remaster's rules (#302), free for what it takes
function townHex(w: World, i: number): string {
	const h = w.state.map.hexes[i], terrain = w.data.hexes[i].terrain;
	const what = terrain === terrainType.Airfield ? "airfield: aircraft" : terrain === terrainType.Port ? "port: ships" : "city";
	return (terrain === terrainType.Airfield ? h.air : h.unit) === null ? `${cell(positionOf(w, i))} (${what})` : "";
}

//Side's core units waiting to deploy (their index for "deploy"), and its free deployment hexes (in the
//remaster's rules a side with none, its towns)
export function reserve(w: World, side: number): string[] {
	const p = playerOfSide(w, side);
	const waiting = p.core.map((c, i) => "reserve" in c ? `${i} ${w.equipment[c.reserve.eqid].name}`
		+ (c.reserve.transport ? ` (${w.equipment[c.reserve.transport.eqid].name})` : "") : "").filter(Boolean);
	const ownHex = (i: number) => w.data.hexes[i].deployment >= 0 && sideOfPlayer(w, w.data.hexes[i].deployment) === side;
	const free = deploymentHexes(w, side).map((i) => ownHex(i) ? deploymentHex(w, i) : townHex(w, i)).filter(Boolean);
	return [waiting.length ? "to deploy (index name):" : "nothing to deploy", ...waiting, "free deployment hexes: " + free.join(", ")];
}
