//The turn report's view model (CombatLog, #348): the old combat log (src/legacy/combatlog.ts, src/uicombatlog.ts) kept from the
//steps' events instead of the game's objects. From the person's end of turn to their next one, it gathers what the
//side shown's units did in each fight (their totals, as CombatLog.addCombatEnd added them up), the leaders they won,
//the objectives taken or lost, the automatic resupplies and the reinforcements of a turn's start; then it writes them
//as the window's five reports, under the turn's summary. Plain functions, tested on hand-built worlds
import type { EventOf, GameEvent } from "../../core/events";
import { sideOf, unitById } from "../../core/world";
import type { Position, UnitId, World } from "../../core/types";
import { leaderDescriptions } from "../../legacy/prototypes";
import { terrainNames, terrainType, unitClass } from "../../core/tables";
import type { IconName } from "../components/icon";
import { dateOf, plural, statusOf, yourPlayer } from "../store/model";
import { at } from "../hud/results";
import { type EnemyTurn, turnReportOf } from "../turn";
import { ordinal } from "../hud/unitcard";
import { NAVAL_ICON } from "../hud/unitlist";

//A unit's fights this turn, added up
interface Fought {
	id: UnitId;
	eqid: number;
	isCore: boolean;
	at: Position; //where it stood at its last fight
	strength: number; //after its last fight
	losses: number;
	kills: number;
	xp: number;
	entrenchLost: number;
	entrench: number;
	ammo: number;
	assaults: number;
	defends: number;
	supports: number;
}

interface Logged {
	id: UnitId;
	eqid: number;
	isCore: boolean;
	at: Position;
}

export interface TurnLog {
	combat: Fought[];
	resupply: (Logged & { ammo: number, fuel: number })[];
	reinforce: Logged[];
	leaders: (Logged & { leader: number, classLeader: number })[];
	objectives: { at: Position, ours: boolean, prestige: number }[];
}

export const emptyLog = (): TurnLog => ({ combat: [], resupply: [], reinforce: [], leaders: [], objectives: [] });

type Fighter = EventOf<"fight">["attacker"];

//(the dice can kill more than a unit has: it loses what it had, #428)
const lost = (f: Fighter) => Math.max(0, f.before.strength - Math.max(0, f.after.strength));

//A unit as the log keeps it, from the world where it is (null: gone, or not the side shown's)
function loggedOf(w: World, id: UnitId): Logged | null {
	const u = unitById(w, id);
	return u === null || sideOf(w, u) !== w.spotSide ? null : { id, eqid: u.eqid, isCore: u.isCore, at: at(u) };
}

//One side of a fight added to its unit's totals: what it lost, what the other lost to it, its experience and its
//entrenchment; an assault, a defence or a support fire
function addFighter(log: Fought[], f: Fighter, other: Fighter, role: "assaults" | "defends" | "supports", core: boolean): Fought[] {
	const old = log.find((u) => u.id === f.unit);
	const base: Fought = old ?? { id: f.unit, eqid: f.eqid, isCore: core, at: at(f), strength: 0, losses: 0, kills: 0, xp: 0, entrenchLost: 0,
		entrench: 0, ammo: 0, assaults: 0, defends: 0, supports: 0 };
	const next: Fought = { ...base, at: at(f), strength: Math.max(0, f.after.strength), losses: base.losses + lost(f), kills: base.kills + lost(other),
		xp: base.xp + f.after.experience - f.before.experience, entrenchLost: base.entrenchLost + f.before.entrenchment - f.after.entrenchment,
		entrench: f.after.entrenchment, ammo: f.after.ammo, [role]: base[role] + 1 };
	return old === undefined ? [...log, next] : log.map((u) => u === old ? next : u);
}

function fought(log: TurnLog, before: World, e: EventOf<"fight">): TurnLog {
	let combat = log.combat;
	const core = (id: UnitId) => { const u = unitById(before, id); return u !== null && u.isCore; };
	if (e.attacker.side === before.spotSide) combat = addFighter(combat, e.attacker, e.defender, e.support ? "supports" : "assaults", core(e.attacker.unit));
	if (e.defender.side === before.spotSide) combat = addFighter(combat, e.defender, e.attacker, "defends", core(e.defender.unit));
	return { ...log, combat };
}

//A leader won (its class's comes with it, Leaders.getUnitClassLeader)
function led(log: TurnLog, after: World, e: EventOf<"leader">): TurnLog {
	const u = loggedOf(after, e.unit);
	if (u === null) return log;
	const uclass = after.equipment[u.eqid].uclass;
	return { ...log, leaders: [...log.leaders, { ...u, leader: e.leader, classLeader: after.rules.classLeaders[uclass] }] };
}

//An objective taken: by the side shown, or from it (Map.captureHex logs every objective)
function captured(log: TurnLog, after: World, e: EventOf<"captured">): TurnLog {
	if (!e.objective) return log;
	const u = unitById(after, e.unit);
	const ours = u !== null && sideOf(after, u) === after.spotSide;
	return { ...log, objectives: [...log.objectives, { at: at(e.at), ours, prestige: e.prestige }] };
}

//A step's events added to the log: before and after, the worlds around the step
export function logStep(log: TurnLog, before: World, after: World, events: GameEvent[]): TurnLog {
	return events.reduce((l, e) => e.type === "fight" ? fought(l, before, e) : e.type === "leader" ? led(l, after, e)
		: e.type === "captured" ? captured(l, after, e) : l, log);
}

//A turn's start (the screen's turnEvents): the side shown's automatic resupplies, with the ammo and fuel they left,
//and its reinforcements that arrived
export function logTurnStart(log: TurnLog, w: World, events: GameEvent[]): TurnLog {
	let next = log;
	for (const e of events) {
		if (e.type !== "resupplied" && e.type !== "arrived") continue;
		const u = loggedOf(w, e.unit);
		if (u === null) continue;
		const s = unitById(w, e.unit)!;
		if (e.type === "resupplied") next = { ...next, resupply: [...next.resupply.filter((r) => r.id !== u.id), { ...u, ammo: s.ammo, fuel: s.fuel }] };
		else next = { ...next, reinforce: [...next.reinforce, u] };
	}
	return next;
}

//---- The window

//A sentence of an entry: its words, the numbers in bold
export type Words = (string | { b: string })[];

export interface LogEntry {
	sprite: string | null;
	icon: IconName | null; //an objective's flag in place of a sprite
	words: Words;
	destroyed: boolean; //a unit of the side lost: its line in critical, as the old log wrote it in red
	at: Position;
}

export interface LogSection {
	title: string;
	icon: IconName;
	entries: LogEntry[];
}

export interface CombatLogView {
	title: string; //"Turn 3 report"
	label: string; //"Ciechanow · 06 Sep 1939 · Fair · Dry"
	objectives: number;
	lead: { left: number, name: string } | null;
	others: string;
	score: number;
	prestige: string;
	next: number;
	sections: LogSection[];
	campaign: boolean;
}

//The sprite a log line shows: a ship's generic one past the air transports (the old log's line)
const spriteOf = (w: World, eqid: number) => w.equipment[eqid].uclass > unitClass.airTransport ? NAVAL_ICON : w.equipment[eqid].icon;
const unitWords = (w: World, u: { id: UnitId, eqid: number, isCore: boolean }): Words =>
	[u.isCore ? "Core " : "Auxiliary ", { b: ordinal(u.id) + " " + w.equipment[u.eqid].name }];

//Where a unit fought from: the hex's name and its terrain when it isn't clear, and the hex
function placeOf(w: World, p: Position): string {
	const h = w.data.hexes[p.row * w.state.map.cols + p.col];
	const parts = [h.name, h.terrain !== terrainType.Clear ? terrainNames[h.terrain] : ""].filter((s) => s !== "");
	return (parts.length > 0 ? parts.join(" ") + " " : "") + `(${p.row},${p.col})`;
}

//What it did most: supported, assaulted or defended (UICombatLog.buildCombatSummary)
function actionOf(u: Fought): string {
	if (u.assaults >= u.defends || u.supports >= u.defends) return u.supports >= u.assaults ? "gave fire support from" : "assaulted from";
	return "defended";
}

function lossWords(u: Fought): Words {
	if (u.losses === 0) return [];
	return [u.kills > 0 ? ", " : ": ", "lost ", { b: String(u.losses) }, " strength", ...(u.strength > 0 ? [", ", { b: String(u.strength) }, " surviving"] : [", destroyed"])];
}

function fightWords(u: Fought): Words {
	const counts = [u.assaults > 0 && plural(u.assaults, "1 assault", u.assaults + " assaults"), u.defends > 0
		&& plural(u.defends, "1 attack defended", u.defends + " attacks defended")].filter(Boolean).join(", ");
	return [...(u.kills > 0 ? [": inflicted ", { b: String(u.kills) }, plural(u.kills, " casualty", " casualties")] : []), ...lossWords(u),
		...(counts !== "" ? [" in " + counts] : []), "."];
}

function combatEntry(w: World, u: Fought): LogEntry {
	const e = w.equipment[u.eqid];
	const words: Words = [...unitWords(w, u), " " + actionOf(u) + " " + placeOf(w, u.at), ...fightWords(u)];
	if (u.xp !== 0 && u.strength > 0) words.push(" Gained ", { b: "+" + u.xp }, " experience.");
	if (u.ammo < e.ammo / 4) words.push(" Low on ammo, ", { b: u.ammo + "/" + e.ammo }, " remaining.");
	if (u.entrenchLost > 0) words.push(" ", { b: String(u.entrenchLost) }, " entrenchment lost, ", { b: String(u.entrench) }, " left.");
	else if (u.entrench > 0) words.push(" Entrenchment ", { b: String(u.entrench) }, ".");
	return { sprite: spriteOf(w, u.eqid), icon: null, words, destroyed: u.losses > 0 && u.strength <= 0, at: u.at };
}

function resupplyEntry(w: World, r: TurnLog["resupply"][number]): LogEntry {
	const e = w.equipment[r.eqid], uses = e.fuel > 0;
	const words: Words = [...unitWords(w, r), " resupplied automatically: ammo ", { b: r.ammo + "/" + e.ammo },
		...(uses ? [", fuel ", { b: r.fuel + "/" + e.fuel }] : []), "."];
	return { sprite: spriteOf(w, r.eqid), icon: null, words, destroyed: false, at: r.at };
}

function reinforceEntry(w: World, r: Logged): LogEntry {
	return { sprite: spriteOf(w, r.eqid), icon: null, destroyed: false, at: r.at,
		words: [{ b: w.equipment[r.eqid].name }, ` arrived as a reinforcement at (${r.at.row},${r.at.col}).`] };
}

function leaderEntry(w: World, l: TurnLog["leaders"][number]): LogEntry {
	const named = (i: number): Words => [{ b: leaderDescriptions[i][0] }, ", " + leaderDescriptions[i][1].replace(/\.$/, "").toLowerCase()];
	const leaders = l.classLeader === -1 || l.classLeader === l.leader ? named(l.leader) : [...named(l.classLeader), "; ", ...named(l.leader)];
	return { sprite: w.equipment[l.eqid].icon, icon: null, words: [...unitWords(w, l), " won a leader: ", ...leaders, "."],
		destroyed: false, at: l.at };
}

function objectiveEntry(w: World, o: TurnLog["objectives"][number]): LogEntry {
	const name = w.data.hexes[o.at.row * w.state.map.cols + o.at.col].name;
	return { sprite: null, icon: "objective", destroyed: false, at: o.at,
		words: [o.ours ? "Captured objective " : "Lost objective ", { b: name }, ` at (${o.at.row},${o.at.col}).`] };
}

const byCore = (a: Fought, b: Fought) => a.isCore === b.isCore ? a.id - b.id : a.isCore ? -1 : 1;

//The window of the person's player, null when no person plays here
export function combatLogOf(w: World, log: TurnLog, enemy: EnemyTurn): CombatLogView | null {
	const r = turnReportOf(w, enemy), you = yourPlayer(w);
	if (r === null || you === null) return null;
	const s = statusOf(w);
	return {
		title: `Turn ${w.state.turn.turn} report`,
		label: [w.data.name, dateOf(w.state.scenario.date), s.weather.word, s.ground.word].join(" · "),
		objectives: r.objectives, lead: r.lead, others: r.others, score: you.score, prestige: r.prestige, next: r.next, campaign: r.campaign,
		sections: [
			{ title: "Unit combat report", icon: "attack", entries: log.combat.slice().sort(byCore).map((u) => combatEntry(w, u)) },
			{ title: "Resupply report", icon: "resupply", entries: log.resupply.slice().sort((a, b) => a.id - b.id).map((x) => resupplyEntry(w, x)) },
			{ title: "Reinforcements report", icon: "reinforce", entries: log.reinforce.map((x) => reinforceEntry(w, x)) },
			{ title: "Unit leaders report", icon: "leader", entries: log.leaders.map((x) => leaderEntry(w, x)) },
			{ title: "Objectives report", icon: "objective", entries: log.objectives.map((x) => objectiveEntry(w, x)) },
		],
	};
}

