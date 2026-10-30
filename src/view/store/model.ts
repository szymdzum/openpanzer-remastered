//The view model: what the screens show, computed from the core's World and nothing else. Plain functions, tested on
//a hand-built world (test/view-model.test.ts); the signals (store.ts) carry their answers to the components.
//A control the player can't use now shows why: the core's Refusal in plain words, or the screen's own reason.
import type { Command, Refusal } from "../../core/command";
import { check } from "../../core/step";
import type { PlayerState, UnitId, UnitState, World } from "../../core/types";
import { sideOf, unitById } from "../../core/world";
import { spotsUnit } from "../../core/sight";
import { countryNames } from "../../legacy/prototypes";
import { groundCondition, groundConditionNames, playerType, sideNames, unitClass } from "../../core/tables";
import type { IconName, Nation } from "../components/icon";

/** The weather or the ground, as the status bar shows it; note: what it does, its tooltip. */
export interface Condition {
	icon: IconName;
	word: string;
	note: string;
}

export interface Status {
	turn: number;
	maxTurns: number;
	side: number; //the current player's side: 0 Axis, 1 Allies
	sideName: string;
	country: string; //the current player's country, as its equipment set names it
	nation: Nation | null; //its flag, none for a country the icon set has no mark for
	date: string; //"06 Sep 1939"
	weather: Condition;
	ground: Condition;
	rules: string; //the rules the game plays, as the settings name them
	prestige: number | null; //the person's player's, null when no person plays here
	yourTurn: boolean; //a person plays the current player on this screen
}

/** The keys that play a unit's action: M mount or unmount, E embark or disembark, S, R, O, U. */
export type ActionKey = "mount" | "embark" | "resupply" | "reinforce" | "overstrength" | "undo";

const playerOf = (w: World, id: number): PlayerState | null => w.state.players[id] || null;

function currentPlayer(w: World): PlayerState | null {
	return playerOf(w, w.state.turn.currentPlayer);
}

/** A person plays the current player here: their commands are taken. */
export function isYourTurn(w: World): boolean {
	const p = currentPlayer(w);
	return p !== null && p.type === playerType.humanLocal;
}

/** The player whose prestige is shown: the current one if a person plays it, else the first on the side shown. */
export function yourPlayer(w: World): PlayerState | null {
	if (isYourTurn(w)) return currentPlayer(w);
	return w.state.players.find((p) => p.type === playerType.humanLocal && p.side === w.spotSide) || null;
}

//The Axis is the Balkenkreuz alone (docs/ui/principles.md)
const NATIONS: Record<string, Nation> = { "Germany": "de", "Afrika Korps": "de", "Italy": "it", "Poland": "pl", "Russia": "su",
	"United Kingdom": "gb", "USA": "us", "U.S. Army": "us", "U.S. Marines": "us", "France": "fr" };

//Indexed by scenario.atmospheric and scenario.ground
const WEATHER: Pick<Condition, "icon" | "word">[] = [{ icon: "fair", word: "Fair" }, { icon: "overcast", word: "Overcast" },
	{ icon: "rain", word: "Rain" }, { icon: "snow", word: "Snow" }];
const GROUND = (["dry", "frozen", "mud"] as const).map((icon, i) => ({ icon, word: groundConditionNames[i] }));

const STORM = "aircraft and air defence can't fire, ground units fire with half their strength, every unit spots half as"
	+ " far, units out of their side's towns get half the supply and replacements";
//What each weather does in the remaster's rules (src/core/weathereffects.ts)
const WEATHER_NOTES = ["Fair: no effect", "Overcast: aircraft fire with half their strength and spot half as far",
	"Rain: " + STORM, "Snow: " + STORM];

function weatherOf(w: World): Condition {
	const s = w.state.scenario;
	return { ...WEATHER[s.atmospheric], note: w.rules.weatherLimitsCombat ? WEATHER_NOTES[s.atmospheric] : "Weather" };
}

function groundOf(w: World): Condition {
	const s = w.state.scenario, frozen = s.ground === groundCondition.frozen && w.rules.snowDoublesFuel;
	return { ...GROUND[s.ground], note: frozen ? "Frozen: ground units burn two fuel a movement point" : "Ground" };
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

/** "06 Sep 1939": the scenario's date is the local midnight the game started from. */
export function dateOf(iso: string): string {
	const d = new Date(iso);
	return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}

function countryOf(w: World, p: PlayerState | null): string {
	return p === null ? "" : countryName(w, p.country);
}

/** "" for a country the scenario's equipment set doesn't name. */
export function countryName(w: World, country: number): string {
	const names = countryNames[w.data.equipment] || [];
	return names[country] || "";
}

const CLASS_ICONS: Partial<Record<number, IconName>> = {
	[unitClass.infantry]: "infantry", [unitClass.tank]: "tank", [unitClass.recon]: "recon", [unitClass.antiTank]: "antitank",
	[unitClass.flak]: "antiair", [unitClass.artillery]: "artillery", [unitClass.airDefence]: "antiair", [unitClass.fighter]: "fighter",
	[unitClass.tacticalBomber]: "bomber", [unitClass.levelBomber]: "bomber", [unitClass.submarine]: "naval", [unitClass.destroyer]: "naval",
	[unitClass.battleship]: "naval", [unitClass.carrier]: "naval", [unitClass.battleCruiser]: "naval", [unitClass.cruiser]: "naval",
	[unitClass.lightCruiser]: "naval",
};

/** Null for a class the icon set has none for (a fortification, a transport). */
export function classIcon(uclass: number): IconName | null {
	return CLASS_ICONS[uclass] || null;
}

export function nationOf(country: string): Nation | null {
	return NATIONS[country] || null;
}

export function statusOf(w: World): Status {
	const p = currentPlayer(w), you = yourPlayer(w), s = w.state.scenario;
	const side = p === null ? -1 : p.side, country = countryOf(w, p);
	return { turn: w.state.turn.turn, maxTurns: s.maxTurns, side, sideName: side < 0 ? "" : sideNames[side], country,
		nation: nationOf(country), date: dateOf(s.date), weather: weatherOf(w), ground: groundOf(w),
		rules: w.rules.name === "classic" ? "Classic" : "Remaster", prestige: you === null ? null : you.prestige, yourTurn: isYourTurn(w) };
}

/** With a thousands separator: 3,056. */
export function prestigeText(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

/** The core's reasons are lower case phrases; a control shows them capitalised. */
export function reasonOf(r: Refusal): string {
	if (r.reason === "no such unit") return "The unit is gone";
	return r.reason.charAt(0).toUpperCase() + r.reason.slice(1);
}

/** The unit is theirs and it is their turn: the map then shows its move area and targets. */
export function canOrder(w: World, u: UnitState): boolean {
	return turnRefusal(w, u) === null;
}

//Why the person can't send a command now (the screen's reason, before the core's), null when they can
function turnRefusal(w: World, u: UnitState | null): string | null {
	if (!isYourTurn(w)) return "Not your turn";
	if (u !== null && u.owner !== w.state.turn.currentPlayer) return "Not your unit";
	return null;
}

/** Null when the command can be sent: not the person's turn or unit, else the core's check. */
export function refusalOf(w: World, cmd: Command): string | null {
	const u = "unit" in cmd ? unitById(w, cmd.unit) : null;
	const mine = turnRefusal(w, u);
	if (mine !== null) return mine;
	const r = check(w, cmd);
	return r === null ? null : reasonOf(r);
}

/** Only on the person's turn: the core never refuses an end of turn. */
export function endTurnRefusal(w: World): string | null {
	return refusalOf(w, { type: "endTurn" });
}

/** End turn's question: how many of the person's units can still move or fire, and the first six by name. */
export function stillToAct(names: string[]): string {
	const n = names.length, shown = names.slice(0, 6).join(", ");
	return plural(n, "1 unit", n + " units") + " can still move or fire: " + shown + (n > 6 ? " and " + (n - 6) + " more" : "") + ". End the turn?";
}

/** One rule for the map and the unit info (#483): its own, on a hex it spots, or fired from hiding; none if no side. */
export function isShown(w: World, u: UnitState): boolean {
	return sideOf(w, u) === w.spotSide || u.tempSpotted || (w.spotSide >= 0 && spotsUnit(w, u, w.spotSide));
}

export function shownUnit(w: World, id: UnitId): UnitState | null {
	const u = unitById(w, id);
	return u === null || u.row < 0 || !isShown(w, u) ? null : u;
}

/** The next (N) or previous (P) unit of its player that hasn't moved, round the list (Map.getUnitNeighbor). */
export function neighbourUnit(w: World, id: UnitId, direction: 1 | -1): UnitId {
	const u = unitById(w, id);
	if (u === null) return id;
	const list = w.state.units.filter((x) => x.owner === u.owner && x.row >= 0 && (x.id === id || !x.hasMoved));
	const at = list.findIndex((x) => x.id === id);
	return at < 0 ? id : list[(at + direction + list.length) % list.length].id;
}
