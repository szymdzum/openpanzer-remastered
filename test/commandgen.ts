//Random command sequences on the engine fixtures, for the property tests that play them
//(test/mirror.test.ts on the objects as a mirror): each pick a kind of command, its numbers picking the
//unit and the command among those the game offers the current player (read from its objects), or any
//command at all
import fc from "fast-check";
import { fixtures } from "./contracts";
import type { load } from "./invariants";
import type { Unit } from "../src/unit";
import type { Command } from "../src/core/command";

//The game's modules of a restored fixture (test/invariants.ts load)
type World = Awaited<ReturnType<typeof load>>;

const kinds = { move: 8, capture: 2, attack: 6, resupply: 1, reinforce: 1, overstrength: 1, mount: 1, unmount: 1, embark: 1,
	disembark: 1, upgrade: 1, undo: 3, disband: 1, buy: 1, deploy: 1, upgradeUndeployed: 1, sell: 1, endTurn: 2, any: 4 };
type Kind = keyof typeof kinds;
interface Pick { kind: Kind; unit: number; pick: number; any: number }
export interface Sequence { fixture: string; seed: number; steps: Pick[] }

export const sequences: fc.Arbitrary<Sequence> = fc.record({
	fixture: fc.constantFrom(...fixtures("engine")),
	seed: fc.integer(),
	steps: fc.array(fc.record({
		kind: fc.oneof(...Object.entries(kinds).map(([k, weight]) => ({ arbitrary: fc.constant(k as Kind), weight }))),
		unit: fc.nat(63), pick: fc.nat(1023), any: fc.nat(1 << 20),
	}), { maxLength: 40, size: "max" }),
});

//The commands of a kind the game offers the current player's unit u (none: it has none)
type Offer = (w: World, u: Unit) => Command[];
const one = (rule: (w: World, u: Unit) => boolean, cmd: (u: Unit) => Command): Offer => (w, u) => rule(w, u) ? [cmd(u)] : [];
const moves = (w: World, u: Unit) => w.GameRules.getMoveRange(w.m, u).filter((c) => c.canMove);
const unitOffers: Partial<Record<Kind, Offer>> = {
	move: (w, u) => moves(w, u).map((c) => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } })),
	capture: (w, u) => moves(w, u).filter((c) => enemyHex(w, u, c))
		.map((c) => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } })),
	attack: ({ m, GameRules: GR }, u) => GR.getUnitAttackCells(m.map, u, m.rows, m.cols)
		.flatMap((c) => [false, true].map((air) => m.map[c.row][c.col].getAttackableUnit(u, air)))
		.filter((t, i, all) => t && all.indexOf(t) === i).map((t) => ({ type: "attack", unit: u.id, target: t.id })),
	resupply: one((w, u) => w.GameRules.canResupply(w.m.map, u), (u) => ({ type: "resupply", unit: u.id })),
	reinforce: one((w, u) => w.GameRules.canReinforce(w.m.map, u), (u) => ({ type: "reinforce", unit: u.id })),
	overstrength: one((w, u) => w.GameRules.canReinforce(w.m.map, u, true), (u) => ({ type: "reinforce", unit: u.id, overstrength: true })),
	mount: one((w, u) => w.GameRules.canMount(u), (u) => ({ type: "mount", unit: u.id })),
	unmount: one((w, u) => w.GameRules.canUnmount(u), (u) => ({ type: "unmount", unit: u.id })),
	embark: one((w, u) => w.GameRules.canEmbark(w.m.map, u), (u) => ({ type: "embark", unit: u.id })),
	disembark: one((w, u) => w.GameRules.canDisembark(w.m.map, u), (u) => ({ type: "disembark", unit: u.id })),
	upgrade: (w, u) => sameClass(w, u.eqid).map((eqid) => ({ type: "upgrade", unit: u.id, eqid, transport: -1 })),
	undo: one((w, u) => w.m.canUndoMove(u), (u) => ({ type: "undo", unit: u.id })),
	disband: one(() => true, (u) => ({ type: "disband", unit: u.id })),
};

//A hex with a flag or an owner, not of u's side
function enemyHex(w: World, u: Unit, c: { row: number; col: number }): boolean {
	const h = w.m.map[c.row][c.col];
	if (h.owner === -1) return h.flag !== -1;
	return w.m.getPlayer(h.owner).side !== u.player.side;
}

//Other equipment of the class of eqid
export function sameClass(w: World, eqid: number): number[] {
	const all = w.Equipment.equipment, uclass = all[eqid].uclass;
	return Object.keys(all).map(Number).filter((id) => id !== eqid && all[id].uclass === uclass);
}

//The current player's commands on its core list and purchases
const playerOffers: Partial<Record<Kind, (w: World) => Command[]>> = {
	buy: (w) => Object.keys(w.Equipment.equipment).map(Number)
		.filter((eqid) => w.Equipment.equipment[eqid].country === w.m.currentPlayer.country)
		.map((eqid) => ({ type: "buy", eqid, transport: -1 })),
	deploy: (w) => {
		const list = w.m.currentPlayer.getCoreUnitList(), hexes = freeDeployHexes(w);
		return list.flatMap((u, index) => u.isDeployed ? [] : hexes.map((to) => ({ type: "deploy", index, to: { row: to.row, col: to.col } })));
	},
	upgradeUndeployed: (w) => w.m.currentPlayer.getCoreUnitList()
		.flatMap((u, index) => sameClass(w, u.eqid).map((eqid) => ({ type: "upgradeUndeployed", index, eqid, transport: 0 }))),
	sell: (w) => w.m.currentPlayer.getCoreUnitList().map((_u, index) => ({ type: "sell", index })),
};

//The current player's side's deployment hexes with no unit, row by row
export function freeDeployHexes(w: World) {
	const m = w.m, side = m.currentPlayer.side;
	return m.map.flat().filter((h) => h.isDeployment > -1 && m.getPlayer(h.isDeployment).side === side && !h.unit && !h.airunit)
		.map((h) => h.getPos());
}

//Any command at all from the pick's numbers, its ids and cells near the fixture's: most are refused,
//some allowed where the rules have no say
function anyCommand(w: World, n: number): Command {
	const ids = w.m.getUnits().map((u) => u.id);
	const unit = [...ids, -1, w.m.getBoard().uniqueID][n % (ids.length + 2)];
	const to = { row: (n >> 3) % (w.m.rows + 2) - 1, col: (n >> 7) % (w.m.cols + 2) - 1 };
	const eqids = Object.keys(w.Equipment.equipment).map(Number);
	const eqid = [...eqids, 0, -1, 99999][(n >> 5) % (eqids.length + 3)];
	const index = (n >> 9) % 4;
	const types: Command[] = [{ type: "move", unit, to }, { type: "attack", unit, target: ids[(n >> 4) % ids.length] },
		{ type: "resupply", unit }, { type: "reinforce", unit, overstrength: (n & 8) > 0 }, { type: "mount", unit },
		{ type: "unmount", unit }, { type: "embark", unit }, { type: "disembark", unit }, { type: "undo", unit },
		{ type: "deploy", index, to }, { type: "buy", eqid, transport: n & 16 ? -1 : eqid }, { type: "upgrade", unit, eqid, transport: -1 },
		{ type: "upgradeUndeployed", index, eqid, transport: 0 }, { type: "disband", unit }, { type: "sell", index }];
	return types[(n >> 11) % types.length];
}

//The command a pick stands for, null when the player has none of its kind
export function commandOf(w: World, s: Pick): Command | null {
	if (s.kind === "endTurn") return { type: "endTurn" };
	if (s.kind === "any") return anyCommand(w, s.any);
	const own = playerOffers[s.kind];
	if (own) {
		const list = own(w);
		return list.length ? list[s.pick % list.length] : null;
	}
	const offer = unitOffers[s.kind], m = w.m;
	const units = m.getUnits().filter((u) => u.player.id === m.currentPlayer.id && u.getPos() && offer(w, u).length);
	if (!units.length) return null;
	const list = offer(w, units[s.unit % units.length]);
	return list[s.pick % list.length];
}
