/**
 * The player's units: deploy a core unit, buy, upgrade (on the map or off it), disband and sell
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf, Refusal } from "../../commands";
import { movMethod, terrainType, unitClass } from "../../prototypes";
import { sellCost, unitCost, upgradeCost } from "../costs";
import { changeUnit, emit, place, removeUnit, writePlayer } from "../draft";
import type { CoreUnit, Draft, CommandHandler, OffMapUnit, World } from "../types";
import { isAir, isTransportable } from "../units";
import { hexIndex, onMap, unitById } from "../world";
import { asUnit, coreAt, coreUnitOf, currentPlayer, playerAt, refuse, unitCheck } from "./common";
import { firstOfClass } from "./transport";

//An equipment id the equipment knows (0 or less: none)
function known(w: World, eqid: number): boolean {
	return !(eqid > 0) || w.equipment[eqid] !== undefined;
}

//Unit.upgrade's own test: the same class (flak may become air defence); eqid 0 or less keeps the unit
function sameClass(w: World, u: OffMapUnit, eqid: number): boolean {
	const newClass = w.equipment[eqid > 0 ? eqid : u.eqid].uclass;
	let oldClass = w.equipment[u.eqid].uclass;
	if (oldClass === unitClass.flak && newClass === unitClass.airDefence) oldClass = unitClass.airDefence;
	return oldClass === newClass;
}

//Player.upgradeUnit's tests
function upgradeCheck(w: World, u: OffMapUnit, prestige: number, cmd: { eqid: number; transport: number }): Refusal | null {
	if (!known(w, cmd.eqid) || !known(w, cmd.transport)) return refuse("no such equipment");
	if (upgradeCost(w, asUnit(u), cmd.eqid, cmd.transport) > prestige) return refuse("not enough prestige");
	return sameClass(w, u, cmd.eqid) ? null : refuse("not the same class");
}

//A transport fresh from the equipment
function newTransport(w: World, eqid: number): OffMapUnit["transport"] {
	return { eqid, ammo: w.equipment[eqid].ammo, fuel: w.equipment[eqid].fuel };
}

//Unit.upgrade on u: the new equipment (eqid 0 or less: the same), a new transport (0 or less: the one
//it has; none for a unit no transport carries), full ammo and fuel, no entrenchment. A unit on the
//map (or lost on it) is done for the turn
function upgradeUnit(w: World, u: OffMapUnit, eqid: number, transport: number, deployed: boolean) {
	u.eqid = eqid > 0 ? eqid : u.eqid;
	if (isTransportable(w, u.eqid)) {
		if (transport > 0) u.transport = newTransport(w, transport);
	} else {
		u.transport = null;
	}
	u.ammo = w.equipment[u.eqid].ammo;
	u.fuel = w.equipment[u.eqid].fuel;
	if (u.transport !== null && w.equipment[u.transport.eqid] !== undefined) {
		u.transport.ammo = w.equipment[u.transport.eqid].ammo;
		u.transport.fuel = w.equipment[u.transport.eqid].fuel;
	}
	u.entrenchment = 0;
	if (deployed) u.hasMoved = u.hasFired = u.hasOverstrength = u.hasResupplied = true;
}

//A core list entry's unit upgraded and paid for by player: on the map (its counters stayed as they
//were, #73), or off it
function upgradeEntry(d: Draft, player: number, c: CoreUnit, index: number | null, eqid: number, transport: number) {
	const cost = upgradeCost(d, asUnit(coreUnitOf(d, c)), eqid, transport);
	if ("onMap" in c) {
		changeUnit(d, c.onMap, (u) => upgradeUnit(d, u, eqid, transport, true));
	} else {
		const off = coreUnitOf(d, c);
		const u = { ...off, transport: off.transport === null ? null : { ...off.transport } };
		upgradeUnit(d, u, eqid, transport, "lost" in c);
		writePlayer(d, player).core[index] = "lost" in c ? { lost: u } : { reserve: u };
	}
	writePlayer(d, player).prestige -= cost;
	emit(d, { type: "upgraded", unit: "onMap" in c ? c.onMap : null, index, eqid, transport, cost });
}

//A deployment hex of the current player's side
function ownDeployment(w: World, hex: number): boolean {
	const deployment = w.data.hexes[hex].deployment;
	return deployment >= 0 && playerAt(w, deployment).side === currentPlayer(w).side;
}

//The hex's air slot free for an air unit, its ground slot for any other
function freeFor(w: World, hex: number, air: boolean): boolean {
	const h = w.state.map.hexes[hex];
	return air ? h.air === null : h.unit === null;
}

//On a free deployment hex of the player's side (the UI's click, Map.deployPlayerUnit): a ground
//unit on the ocean embarks on its country's naval transport
export const deploy: CommandHandler<CommandOf<"deploy">> = {
	check(w, cmd) {
		const c = coreAt(w, cmd.index);
		if (c === null) return refuse("no such unit");
		if (!("reserve" in c)) return refuse("already deployed");
		if (!onMap(w, cmd.to.row, cmd.to.col)) return refuse("off the map");
		const hex = hexIndex(w, cmd.to.row, cmd.to.col);
		if (!ownDeployment(w, hex)) return refuse("not a deployment hex");
		return freeFor(w, hex, isAir(w, asUnit(c.reserve))) ? null : refuse("the hex is taken");
	},
	run(d, cmd) {
		const p = currentPlayer(d);
		let unit = (p.core[cmd.index] as { reserve: OffMapUnit }).reserve;
		const hex = hexIndex(d, cmd.to.row, cmd.to.col);
		if (!isAir(d, asUnit(unit)) && d.data.hexes[hex].terrain === terrainType.Ocean) {
			const carrier = firstOfClass(d, unitClass.navalTransport, playerAt(d, unit.owner).country + 1);
			if (carrier) unit = { ...unit, carrier };
		}
		const u = place(d, unit, cmd.to);
		writePlayer(d, p.id).core[cmd.index] = { onMap: u.id };
		emit(d, { type: "deployed", unit: u.id, index: cmd.index, at: { row: cmd.to.row, col: cmd.to.col } });
	},
};

//A new core unit, off the map until deployed (Player.buyUnit): outside a campaign it gets the other
//side's average experience. Only while the side has a deployment hex free for it (#60): the original
//sold units to a side with none, which waited in its reserve for the whole game. The units already in
//the reserve don't hold a hex, as deploy lets any of them take any free one
export const buy: CommandHandler<CommandOf<"buy">> = {
	check(w, cmd) {
		if (!(cmd.eqid > 0) || !known(w, cmd.eqid) || !known(w, cmd.transport)) return refuse("no such equipment");
		if (unitCost(w, cmd.eqid, cmd.transport) > currentPlayer(w).prestige) return refuse("not enough prestige");
		const air = w.equipment[cmd.eqid].movmethod === movMethod.air;
		return w.data.hexes.some((_h, hex) => ownDeployment(w, hex) && freeFor(w, hex, air)) ? null : refuse("no free deployment hex");
	},
	run(d, cmd) {
		const p = writePlayer(d, d.state.turn.currentPlayer), e = d.equipment[cmd.eqid];
		const cost = unitCost(d, cmd.eqid, cmd.transport);
		const side = d.state.scenario.expPerSide[+!p.side];
		const unit: OffMapUnit = {
			eqid: cmd.eqid, owner: p.id, transport: cmd.transport > 0 ? newTransport(d, cmd.transport) : null, carrier: 0,
			strength: 10, moveLeft: e.movpoints, ammo: e.ammo, fuel: e.fuel, hits: 0,
			experience: d.state.campaign === null ? Math.round(side.exp / +side.count || 0) : 0, entrenchment: 0, entrenchTicks: 0,
			leader: -1, facing: 2, flag: p.country + 1, isCore: true, isMounted: false, hasMoved: false, hasFired: false,
			hasResupplied: false, hasOverstrength: false, isSurprised: false, tempSpotted: false,
		};
		p.core.push({ reserve: unit });
		p.prestige -= cost;
		emit(d, { type: "bought", player: p.id, eqid: cmd.eqid, transport: cmd.transport, cost });
	},
};

//A unit on the map, paid by its player; its undo is gone
export const upgrade: CommandHandler<CommandOf<"upgrade">> = {
	check(w, cmd) {
		const u = unitById(w, cmd.unit);
		return u === null ? refuse("no such unit") : upgradeCheck(w, u, playerAt(w, u.owner).prestige, cmd);
	},
	run(d, cmd) {
		const player = playerAt(d, unitById(d, cmd.unit).owner).id;
		upgradeEntry(d, player, { onMap: cmd.unit }, null, cmd.eqid, cmd.transport);
		d.state.turn.undoable = null;
	},
};

//A core unit of the current player by its place in the list: one off the map, but the list's units
//on the map too (they are done for the turn, their undo stays)
export const upgradeUndeployed: CommandHandler<CommandOf<"upgradeUndeployed">> = {
	check(w, cmd) {
		const c = coreAt(w, cmd.index);
		return c === null ? refuse("no such unit") : upgradeCheck(w, coreUnitOf(w, c), currentPlayer(w).prestige, cmd);
	},
	run(d, cmd) {
		upgradeEntry(d, d.state.turn.currentPlayer, coreAt(d, cmd.index), cmd.index, cmd.eqid, cmd.transport);
	},
};

//Off the map and sold (Map.disbandUnit): not a loss in the dossier; a core unit stays in its list
export const disband: CommandHandler<CommandOf<"disband">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit);
	},
	run(d, cmd) {
		const u = unitById(d, cmd.unit), prestige = sellCost(d, u);
		d.state.turn.undoable = null;
		writePlayer(d, playerAt(d, u.owner).id).prestige += prestige;
		removeUnit(d, cmd.unit, false);
		emit(d, { type: "disbanded", unit: cmd.unit, prestige });
	},
};

//A core unit of the current player out of the list, sold: kept, one on the map stays there
export const sell: CommandHandler<CommandOf<"sell">> = {
	check(w, cmd) {
		return coreAt(w, cmd.index) === null ? refuse("no such unit") : null;
	},
	run(d, cmd) {
		const p = writePlayer(d, d.state.turn.currentPlayer);
		const prestige = sellCost(d, asUnit(coreUnitOf(d, p.core[cmd.index])));
		p.prestige += prestige;
		p.core.splice(cmd.index, 1);
		emit(d, { type: "sold", index: cmd.index, prestige });
	},
};
