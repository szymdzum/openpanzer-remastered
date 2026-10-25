//The new UI's view model (#380): what the screens show, computed from the core's World and nothing
//else. Plain functions, no Preact and no DOM, so they are tested on a hand-built world in Node
//(test/view-model.test.ts); the signals (src/view/store.ts) carry their answers to the components.
//A control the player can't use now shows why: the core's Refusal (src/core/step.ts check) in plain
//words, or the screen's own reason (not your turn, not your unit) where the core doesn't ask.
import type { Command, Refusal } from "../commands";
import { check } from "../core/step";
import type { PlayerState, Position, UnitId, UnitState, World } from "../core/types";
import { ammoOf, fuelOf, hexIndex, isSpotted, movesLeft, unitById, unitData } from "../core/world";
import { playerType, sideNames, unitClassNames } from "../prototypes";

//The status bar's game state: whose turn it is and how far the scenario is
export interface Status {
	turn: number;
	maxTurns: number;
	side: number; //the current player's side: 0 Axis, 1 Allies
	sideName: string;
	prestige: number | null; //the person's player's, null when no person plays here
	yourTurn: boolean; //a person plays the current player on this screen
}

//An action on the selected unit: the command it sends and why it can't now (null: it can)
export interface Action {
	label: string;
	command: Command;
	refusal: string | null;
}

//The selected unit as the unit info shows it
export interface UnitView {
	id: UnitId;
	name: string;
	className: string;
	side: number;
	own: boolean; //the current person's unit: its actions can be sent
	at: Position;
	strength: number;
	moves: number;
	fuel: number;
	ammo: number;
	experience: number;
	entrenchment: number;
	moved: boolean;
	fired: boolean;
	actions: Action[];
}

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

export function statusOf(w: World): Status {
	const p = currentPlayer(w), you = yourPlayer(w);
	const side = p === null ? -1 : p.side;
	return { turn: w.state.turn.turn, maxTurns: w.state.scenario.maxTurns, side, sideName: side < 0 ? "" : sideNames[side],
		prestige: you === null ? null : you.prestige, yourTurn: isYourTurn(w) };
}

//A refusal in plain words, as a control shows it: the core's reasons are lower case phrases
export function reasonOf(r: Refusal): string {
	if (r.reason === "no such unit") return "The unit is gone";
	return r.reason.charAt(0).toUpperCase() + r.reason.slice(1);
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

//What a unit on the map can be told to do in place, in the unit context's order. The move and the attack
//are the map's (D2), the purchases and the disband the windows' (D5), with their confirmations
const ACTIONS: [string, (id: UnitId) => Command][] = [
	["Resupply", (unit) => ({ type: "resupply", unit })],
	["Reinforce", (unit) => ({ type: "reinforce", unit })],
	["Mount", (unit) => ({ type: "mount", unit })],
	["Dismount", (unit) => ({ type: "unmount", unit })],
	["Embark", (unit) => ({ type: "embark", unit })],
	["Disembark", (unit) => ({ type: "disembark", unit })],
	["Undo move", (unit) => ({ type: "undo", unit })],
];

//A unit as the side shown sees it, null when it isn't on the map or is an enemy hidden in the fog
export function unitView(w: World, id: UnitId): UnitView | null {
	const u = unitById(w, id);
	if (u === null || u.row < 0) return null;
	const side = w.state.players[u.owner].side;
	//(no side shown: no game is on the screen, nothing is seen)
	if (side !== w.spotSide && !(w.spotSide >= 0 && isSpotted(w, hexIndex(w, u.row, u.col), w.spotSide))) return null;
	const e = unitData(w, u);
	return { id, name: e.name, className: unitClassNames[e.uclass], side, own: turnRefusal(w, u) === null,
		at: { row: u.row, col: u.col }, strength: u.strength, moves: movesLeft(w, u), fuel: fuelOf(u), ammo: ammoOf(u),
		experience: u.experience, entrenchment: u.entrenchment, moved: u.hasMoved, fired: u.hasFired,
		actions: ACTIONS.map(([label, command]) => ({ label, command: command(id), refusal: refusalOf(w, command(id)) })) };
}
