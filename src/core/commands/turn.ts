/**
 * End the turn: the next player's turn starts. The reinforcements arrive after it, in a step of
 * their own (turn.ts arriveReinforcements): an AI player plans its turn in between (#94 kept)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf } from "../../commands";
import { scoreGains } from "../../prototypes";
import { addScore, emit, writePlayer } from "../draft";
import { resupplyValue } from "../supply";
import type { CommandHandler, Draft } from "../types";
import { reachedTurnLimit, unitEndTurn } from "../turn";
import { unitById } from "../world";
import { refill } from "./supply";
import { setMounted } from "./transport";

//Player.endTurn: the turn played, the prestige the scenario gives for the next turn (turn 1's at the
//start), the score for the turn
function playerEndTurn(d: Draft, id: number) {
	const turn = d.state.turn.turn, p = writePlayer(d, id);
	p.playedTurn = turn;
	const prestige = turn < p.prestigePerTurn.length ? p.prestigePerTurn[turn] : 0;
	if (turn < p.prestigePerTurn.length) p.prestige += prestige;
	addScore(d, id, scoreGains.endTurn);
	emit(d, { type: "turnEnded", player: id, prestige });
}

//Scenario.endTurn: the time of day, a day later after the day's last turn (in local time, as the old
//engine counts it)
function nextTimeOfDay(d: Draft) {
	const s = d.state.scenario = { ...d.state.scenario };
	s.dayTurn++;
	if (s.dayTurn < s.turnsPerDay) return;
	s.dayTurn = 0;
	const date = new Date(s.date);
	date.setDate(date.getDate() + 1);
	s.date = date.toISOString();
}

//Map.endTurn's new round, once every player has played: each unit in the list's order gets off its
//transport, takes the turn start's resupply (in a city with no enemy around) and ends its
//turn
function newRound(d: Draft) {
	for (const id of d.state.units.map((u) => u.id)) {
		if (unitById(d, id).isMounted) {
			setMounted(d, id, false);
			emit(d, { type: "unmounted", unit: id });
		}
		const s = resupplyValue(d, unitById(d, id), true);
		if (s.ammo > 0 || s.fuel > 0 || s.transportAmmo > 0 || s.transportFuel > 0) {
			refill(d, id, s);
			emit(d, { type: "resupplied", unit: id, supply: s });
		}
		unitEndTurn(d, id);
	}
}

//Actions.endTurn: the time of day, then the player's end of turn, the undo gone, the next player (by
//id, the first after the last); a new round when it is the first. turnLimit: the side that ended
//played its last turn. Never refused
export const endTurn: CommandHandler<CommandOf<"endTurn">> = {
	check() {
		return null;
	},
	run(d) {
		const t = d.state.turn, ended = t.currentPlayer, side = d.state.players[ended].side;
		nextTimeOfDay(d);
		playerEndTurn(d, ended);
		t.undoable = null;
		t.currentPlayer = ended + 1 < d.state.players.length ? ended + 1 : 0;
		if (t.currentPlayer === 0) {
			t.turn++;
			newRound(d);
		}
		const s = d.state.scenario;
		emit(d, { type: "turnStarted", player: t.currentPlayer, turn: t.turn, date: s.date, dayTurn: s.dayTurn });
		if (reachedTurnLimit(d, side)) emit(d, { type: "turnLimit", side });
	},
};
