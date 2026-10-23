/**
 * Resupply and reinforce, refused where the rules refuse them: a unit that can't resupply, or would
 * get no strength (#147: the old engine played them on any unit and changed it, the score too)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf } from "../../commands";
import { OVERSTRENGTH_PENALTY, scoreGains } from "../../prototypes";
import { costPerStrength } from "../costs";
import { addScore, emit, writePlayer, writeUnit } from "../draft";
import { canResupply, reinforceValue, resupplyValue } from "../supply";
import type { Draft, CommandHandler, Supply, UnitId } from "../types";
import { unitById } from "../world";
import { playerAt, unitCheck } from "./common";

//Player.resupplyUnit and Unit.resupply: the score, the ammo and fuel (its transport's too), and the
//unit is done for the turn. Resupply costs no prestige
function resupplyUnit(d: Draft, id: UnitId, s: Supply) {
	addScore(d, playerAt(d, d.state.units[d.index.get(id)].owner).id, scoreGains.resupply);
	refill(d, id, s);
}

//Unit.resupply: the ammo and fuel (its transport's too), and the unit is done for the turn
export function refill(d: Draft, id: UnitId, s: Supply) {
	const u = writeUnit(d, id);
	u.ammo += s.ammo;
	u.fuel += s.fuel;
	if (u.transport !== null) {
		u.transport.ammo += s.transportAmmo;
		u.transport.fuel += s.transportFuel;
	}
	u.hasMoved = u.hasFired = u.hasResupplied = true;
}

export const resupply: CommandHandler<CommandOf<"resupply">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, (u) => canResupply(w, u), "can't resupply");
	},
	run(d, cmd) {
		d.state.turn.undoable = null;
		const s = resupplyValue(d, unitById(d, cmd.unit));
		resupplyUnit(d, cmd.unit, s);
		emit(d, { type: "resupplied", unit: cmd.unit, supply: s });
	},
};

//Map.reinforceUnit and Player.reinforceUnit: the strength the player can afford, up to what the unit
//can get (overstrength costs more), then a resupply. Kept: the score counts the strength asked for,
//not what was paid for; a unit nobody can pay for stays as it was
export const reinforce: CommandHandler<CommandOf<"reinforce">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, (u) => reinforceValue(w, u, cmd.overstrength === true) > 0, "can't reinforce");
	},
	run(d, cmd) {
		d.state.turn.undoable = null;
		const over = cmd.overstrength === true;
		const u = unitById(d, cmd.unit);
		const wanted = reinforceValue(d, u, over), s = resupplyValue(d, u);
		const p = writePlayer(d, playerAt(d, u.owner).id);
		const perStrength = Math.round(costPerStrength(d, u) * (over ? OVERSTRENGTH_PENALTY : 1));
		let strength = (p.prestige / perStrength) >> 0;
		if (strength < 1) return;
		if (strength > wanted) strength = wanted;
		p.prestige -= strength * perStrength;
		addScore(d, p.id, scoreGains.reinforce, wanted);
		const w = writeUnit(d, cmd.unit);
		w.strength += strength;
		w.hasMoved = w.hasFired = true;
		if (over) w.hasOverstrength = true;
		resupplyUnit(d, cmd.unit, s);
		emit(d, { type: "reinforced", unit: cmd.unit, strength, supply: s });
	},
};
