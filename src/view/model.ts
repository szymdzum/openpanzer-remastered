//The new UI's view model (#380): what the screens show, computed from the core's World and nothing
//else. Plain functions, no Preact and no DOM, so they are tested on a hand-built world in Node
//(test/view-model.test.ts); the signals (src/view/store.ts) carry their answers to the components.
//A control the player can't use now shows why: the core's Refusal (src/core/step.ts check) in plain
//words, or the screen's own reason (not your turn, not your unit) where the core doesn't ask.
import type { Command, Refusal } from "../commands";
import { check } from "../core/step";
import type { PlayerState, UnitId, UnitState, World } from "../core/types";
import { hexIndex, isSpotted, unitById } from "../core/world";
import { countryNames, groundConditionNames, playerType, sideNames, unitClass } from "../prototypes";
import type { IconName, Nation } from "./icon";

//A state the status bar shows as an icon and a word: the weather, the ground
export interface Condition {
	icon: IconName;
	word: string;
}

//The status bar's game state (StatusBar): whose turn it is, how far the scenario is, the conditions and the
//rules it plays
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
	rules: string; //the rules the game plays, as the settings name them (#317)
	prestige: number | null; //the person's player's, null when no person plays here
	yourTurn: boolean; //a person plays the current player on this screen
}

//The keys that play a unit's action (GameMenu): M mount or unmount, E embark or disembark, S, R, O, U; each is an
//action of the unit context menu (src/view/context.ts)
export type ActionKey = "mount" | "embark" | "resupply" | "reinforce" | "overstrength" | "undo";

//(the state's player of an id; a world without players has none)
const playerOf = (w: World, id: number): PlayerState | null => w.state.players[id] || null;

function currentPlayer(w: World): PlayerState | null {
	return playerOf(w, w.state.turn.currentPlayer);
}

//A person plays the current player here: their commands are taken
export function isYourTurn(w: World): boolean {
	const p = currentPlayer(w);
	return p !== null && p.type === playerType.humanLocal;
}

//The player whose prestige the screen shows: the current one when a person plays it (hotseat too), else
//the first player a person plays on the side shown
export function yourPlayer(w: World): PlayerState | null {
	if (isYourTurn(w)) return currentPlayer(w);
	return w.state.players.find((p) => p.type === playerType.humanLocal && p.side === w.spotSide) || null;
}

//The flags the icon set has, by the country names that fly them; the Axis is the Balkenkreuz alone (principles.md)
const NATIONS: Record<string, Nation> = { "Germany": "de", "Afrika Korps": "de", "Italy": "it", "Poland": "pl", "Russia": "su",
	"United Kingdom": "gb", "USA": "us", "U.S. Army": "us", "U.S. Marines": "us", "France": "fr" };

//The weather by scenario.atmospheric, the ground by scenario.ground (groundCondition), as the card words them
const WEATHER: Condition[] = [{ icon: "fair", word: "Fair" }, { icon: "overcast", word: "Overcast" }, { icon: "rain", word: "Rain" },
	{ icon: "snow", word: "Snow" }];
const GROUND: Condition[] = (["dry", "frozen", "mud"] as const).map((icon, i) => ({ icon, word: groundConditionNames[i] }));

//The months as a date written in full says them ("1 September 1939")
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

//A date as the HUD writes it, "06 Sep 1939": the scenario's date is the local midnight the game started from
export function dateOf(iso: string): string {
	const d = new Date(iso);
	return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}

//A country's name in the scenario's equipment set, "" for none
function countryOf(w: World, p: PlayerState | null): string {
	return p === null ? "" : countryName(w, p.country);
}

//A country's name by its index in the scenario's equipment set, "" for one it doesn't name
export function countryName(w: World, country: number): string {
	const names = countryNames[w.data.equipment] || [];
	return names[country] || "";
}

//The icon of a unit class (the equipment window's class tabs, the unit card's tag), null for a class the icon set has
//none for (a fortification, a transport)
const CLASS_ICONS: Partial<Record<number, IconName>> = {
	[unitClass.infantry]: "infantry", [unitClass.tank]: "tank", [unitClass.recon]: "recon", [unitClass.antiTank]: "antitank",
	[unitClass.flak]: "antiair", [unitClass.artillery]: "artillery", [unitClass.airDefence]: "antiair", [unitClass.fighter]: "fighter",
	[unitClass.tacticalBomber]: "bomber", [unitClass.levelBomber]: "bomber", [unitClass.submarine]: "naval", [unitClass.destroyer]: "naval",
	[unitClass.battleship]: "naval", [unitClass.carrier]: "naval", [unitClass.battleCruiser]: "naval", [unitClass.cruiser]: "naval",
	[unitClass.lightCruiser]: "naval",
};

export function classIcon(uclass: number): IconName | null {
	return CLASS_ICONS[uclass] || null;
}

//The flag of a country by its name, null for one the icon set has no mark for
export function nationOf(country: string): Nation | null {
	return NATIONS[country] || null;
}

export function statusOf(w: World): Status {
	const p = currentPlayer(w), you = yourPlayer(w), s = w.state.scenario;
	const side = p === null ? -1 : p.side, country = countryOf(w, p);
	return { turn: w.state.turn.turn, maxTurns: s.maxTurns, side, sideName: side < 0 ? "" : sideNames[side], country,
		nation: nationOf(country), date: dateOf(s.date), weather: WEATHER[s.atmospheric], ground: GROUND[s.ground],
		rules: w.rules.name === "classic" ? "Classic" : "Remaster", prestige: you === null ? null : you.prestige, yourTurn: isYourTurn(w) };
}

//Prestige as the HUD writes it, with a thousands separator: 3,056
export function prestigeText(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

//One word or the other by a count: "1 unit", "3 units"
export const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

//A refusal in plain words, as a control shows it: the core's reasons are lower case phrases
export function reasonOf(r: Refusal): string {
	if (r.reason === "no such unit") return "The unit is gone";
	return r.reason.charAt(0).toUpperCase() + r.reason.slice(1);
}

//Whether the person can order a unit now: it is theirs, on their turn (the map shows its move area and targets)
export function canOrder(w: World, u: UnitState): boolean {
	return turnRefusal(w, u) === null;
}

//Why the person can't send a command now (the screen's reason, before the core's), null when they can
function turnRefusal(w: World, u: UnitState | null): string | null {
	if (!isYourTurn(w)) return "Not your turn";
	if (u !== null && u.owner !== w.state.turn.currentPlayer) return "Not your unit";
	return null;
}

//Why a command can't be sent now, null when it can: not the person's turn or unit, else the core's check
export function refusalOf(w: World, cmd: Command): string | null {
	const u = "unit" in cmd ? unitById(w, cmd.unit) : null;
	const mine = turnRefusal(w, u);
	if (mine !== null) return mine;
	const r = check(w, cmd);
	return r === null ? null : reasonOf(r);
}

//The End turn button's refusal: only on the person's turn (the core's end of turn is never refused)
export function endTurnRefusal(w: World): string | null {
	return refusalOf(w, { type: "endTurn" });
}

//End turn's question (#8): how many of the person's units can still move or fire, and the first of them by name
export function stillToAct(names: string[]): string {
	const n = names.length, shown = names.slice(0, 6).join(", ");
	return plural(n, "1 unit", n + " units") + " can still move or fire: " + shown + (n > 6 ? " and " + (n - 6) + " more" : "") + ". End the turn?";
}

//The unit when it is on the map and the side shown sees it: its own, or an enemy on a hex it spots (no side shown:
//no game is on the screen, nothing is seen)
export function shownUnit(w: World, id: UnitId): UnitState | null {
	const u = unitById(w, id);
	if (u === null || u.row < 0) return null;
	const side = w.state.players[u.owner].side;
	return side === w.spotSide || (w.spotSide >= 0 && isSpotted(w, hexIndex(w, u.row, u.col), w.spotSide)) ? u : null;
}

//The next (N) or previous (P) unit of the unit's player that hasn't moved, in the order of the units, round the
//list; the unit itself when it is the only one (Map.getUnitNeighbor with onlyNotMoved)
export function neighbourUnit(w: World, id: UnitId, direction: 1 | -1): UnitId {
	const u = unitById(w, id);
	if (u === null) return id;
	const list = w.state.units.filter((x) => x.owner === u.owner && x.row >= 0 && (x.id === id || !x.hasMoved));
	const at = list.findIndex((x) => x.id === id);
	return at < 0 ? id : list[(at + direction + list.length) % list.length].id;
}
