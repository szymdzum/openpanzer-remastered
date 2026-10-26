//The start of a turn's view model (TurnStart, TurnBanner, the AI indicator of Tooltips, #346): the short turn report
//as the old UI computed it (UICombatLog.buildTurnInfo: the objectives left, the turns left to each outcome, the
//prestige and the next turn's, the ground), what the enemy's turn did to the side shown, the unit the turn starts on,
//and the program's turn in progress counted in units. From the core's World and the steps' events, nothing else
import type { GameEvent } from "../core/events";
import type { UnitId, World } from "../core/types";
import { sideOf, unitById, unitData } from "../core/world";
import { outcomeNames, unitClass } from "../prototypes";
import type { Nation } from "./icon";
import { lost } from "./results";
import { type Condition, countryName, dateOf, isYourTurn, nationOf, prestigeText, statusOf, yourPlayer } from "./model";

//What the enemy's turn did to the side shown, gathered from its steps' events
export interface EnemyTurn {
	attacked: UnitId[]; //the side's units an attack hit, each once
	lost: number; //the strength they lost
	objectives: number; //the objectives the enemy took
}

export const quietTurn = (): EnemyTurn => ({ attacked: [], lost: 0, objectives: 0 });

//A fight: the side's fighters' losses (an attack on them, or the support fire their guns gave), and the defender
//attacked when it was the side's
function fought(turn: EnemyTurn, e: Extract<GameEvent, { type: "fight" }>, side: number): EnemyTurn {
	const loss = [e.attacker, e.defender].reduce((n, f) => f.side === side ? n + lost(f) : n, 0);
	const hit = !e.support && e.defender.side === side && !turn.attacked.includes(e.defender.unit);
	return { ...turn, attacked: hit ? [...turn.attacked, e.defender.unit] : turn.attacked, lost: turn.lost + loss };
}

//A capture: an objective the enemy took (who took it: the world after the step)
function captured(turn: EnemyTurn, w: World, e: Extract<GameEvent, { type: "captured" }>): EnemyTurn {
	const u = e.objective ? unitById(w, e.unit) : null;
	return u !== null && sideOf(w, u) !== w.spotSide ? { ...turn, objectives: turn.objectives + 1 } : turn;
}

//The events of a program's step added to what its turn did to the side shown
export function noteEnemy(turn: EnemyTurn, w: World, events: GameEvent[]): EnemyTurn {
	return events.reduce((t, e) => e.type === "fight" ? fought(t, e, w.spotSide) : e.type === "captured" ? captured(t, w, e) : t, turn);
}

//An outcome's deadline on the scenario's track: its initial, where it is, whether it has passed
export interface Tier {
	label: string;
	at: number;
	gone: boolean;
}

//An event of the enemy's turn as the report's foot says it: its icon's tone, a number or icon, the words
export interface EnemyLine {
	tone: "critical" | "muted";
	text: string;
}

export interface TurnReport {
	label: string; //"06 Sep 1939 · Ciechanow"
	title: string; //"Turn 4 of 17"
	objectives: number; //still to take
	lead: { left: number; name: string } | null; //the best outcome still open
	others: string; //"12 Victory · 14 Tactical"
	last: string | null; //"Take them this turn for Tactical victory": one turn left for the last open outcome
	past: number; //how much of the scenario has been played, 0 to 1
	tiers: Tier[];
	prestige: string;
	next: number; //the prestige the next turn gives
	ground: Condition;
	enemy: EnemyLine[]; //"All quiet on this front" when nothing happened
	campaign: boolean; //a campaign's scenario: its dossier
	briefing: { title: string; html: string };
}

const OUTCOMES = [outcomeNames.briliant, outcomeNames.victory, outcomeNames.tactical];
//(the outcome's own word: "Brilliant Victory" is written Brilliant in the report)
const shortName = (name: string) => name.replace(/ Victory$/, "");

//"for Tactical victory", "for Victory"
const forOutcome = (name: string) => name === "Victory" ? "Victory" : name + " victory";

function enemyLines(enemy: EnemyTurn): EnemyLine[] {
	const lines: EnemyLine[] = [];
	const n = enemy.attacked.length;
	if (n > 0) lines.push({ tone: "critical", text: (n === 1 ? "1 of your units" : n + " of your units") + " attacked" });
	if (enemy.lost > 0) lines.push({ tone: "critical", text: "−" + enemy.lost + " strength lost" });
	if (enemy.objectives > 0) lines.push({ tone: "critical", text: (enemy.objectives === 1 ? "1 objective" : enemy.objectives + " objectives") + " lost" });
	return lines.length > 0 ? lines : [{ tone: "muted", text: "All quiet on this front" }];
}

//The turns left to each outcome, victoryTurns[i] - (turn - 1), those already gone left out, as the old report did
function outcomes(w: World) {
	const turn = w.state.turn.turn, max = w.state.scenario.maxTurns;
	const all = w.state.scenario.victoryTurns.slice(0, 3).map((at, i) => ({ name: shortName(OUTCOMES[i]), left: at - (turn - 1), at }));
	const open = all.filter((o) => o.left > 0);
	const tiers = all.map((o) => ({ label: o.name.charAt(0), at: o.at / max, gone: o.left <= 0 }));
	return { open, tiers };
}

//The short turn report of the person's player, null when no person plays here
export function turnReportOf(w: World, enemy: EnemyTurn): TurnReport | null {
	const you = yourPlayer(w);
	if (you === null) return null;
	const s = w.state.scenario, turn = w.state.turn.turn, { open, tiers } = outcomes(w);
	const lead = open.length === 0 ? null : { left: open[0].left, name: open[0].name };
	const lastOne = open.length > 0 ? open[open.length - 1] : null;
	return {
		label: dateOf(s.date) + " · " + w.data.name, title: `Turn ${turn} of ${s.maxTurns}`, objectives: w.state.objectives[you.side].length,
		lead, others: open.slice(1).map((o) => o.left + " " + o.name).join(" · "),
		last: lastOne !== null && lastOne.left === 1 ? "Take them this turn for " + forOutcome(lastOne.name) : null,
		past: Math.min(1, (turn - 0.5) / s.maxTurns), tiers, prestige: prestigeText(you.prestige), next: you.prestigePerTurn[turn + 1] || 0,
		ground: statusOf(w).ground, enemy: enemyLines(enemy), campaign: w.state.campaign !== null,
		briefing: { title: w.data.name, html: w.data.description },
	};
}

//The unit a person's turn starts on: their first ground unit, not a fighter or a bomber (uiMapRenderAndSelectUnit)
export function firstUnitOf(w: World): UnitId | null {
	if (!isYourTurn(w)) return null;
	const air = [unitClass.fighter, unitClass.levelBomber, unitClass.tacticalBomber];
	const u = w.state.units.find((x) => x.row >= 0 && x.owner === w.state.turn.currentPlayer && !air.includes(unitData(w, x).uclass));
	return u === undefined ? null : u.id;
}

//A program's turn in progress (the AI indicator): its country and flag, and how many of its units on the map have
//moved or fired; null on a person's turn
export interface AiStatus {
	country: string;
	nation: Nation | null;
	side: number;
	acted: number;
	units: number;
}

export function aiStatusOf(w: World): AiStatus | null {
	const p = w.state.players[w.state.turn.currentPlayer];
	if (p === undefined || isYourTurn(w)) return null;
	const own = w.state.units.filter((u) => u.row >= 0 && u.owner === p.id);
	const country = countryName(w, p.country);
	return { country, nation: nationOf(country), side: p.side, acted: own.filter((u) => u.hasMoved || u.hasFired).length, units: own.length };
}
