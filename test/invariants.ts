//What must hold on every game state, whatever was played, as test/invariants.test.ts and
//test/properties.test.ts check it: the spotting and zone of control counters of every hex equal a
//recomputation from the units, hexes and units point at each other, every unit belongs to its
//owner's Player
import { readFixture, restoreState } from "./contracts";
import type { Hex } from "../src/map";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";

//The modules of the restored state (restoreState resets them for every fixture)
export async function load(name: string) {
	const fixture = readFixture("engine", name);
	const scenario = await restoreState(fixture.state);
	const { GameRules } = await import("../src/gamerules");
	const { Leaders } = await import("../src/leaders");
	const { CombatLog } = await import("../src/combatlog");
	const { Equipment } = await import("../src/equipment");
	const { AI } = await import("../src/ai");
	const { Commands } = await import("../src/commands");
	const { Rng } = await import("../src/rng");
	const { game } = await import("../src/game");
	const prototypes = await import("../src/prototypes");
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	//The engine calls into the UI in one place: the AI after deploying its purchases
	(game as unknown as { ui: unknown }).ui = { handleReinforcementDeployment() {} };
	const m = scenario.map;
	//Map.endTurn asks an AI player's handler for actions: the driver builds them itself
	m.getPlayers().forEach((p) => { p.handler = { buildActions() {} } as typeof p.handler; });
	return { scenario, m, GameRules, Leaders, CombatLog, Equipment, AI, Commands, Rng, game, ...prototypes };
}
export type World = Awaited<ReturnType<typeof load>>;

export const unitName = (u: Unit) => "unit#" + u.id;
export const cellName = (c: Cell) => c.row + "," + c.col;
export const hexName = (h: Hex | null) => h ? cellName(h.getPos()) : "no hex";

//A hex's counter: the counters are private, a hex only says whether one is above 0. Counted by
//switching it off until it reads 0, then on again as many times
export function counter(isSet: () => boolean, set: (on: boolean) => void): number {
	let n = 0;
	while (isSet() && n < 1000) { set(false); n++; }
	for (let i = 0; i < n; i++) set(true);
	return n;
}

//Every unit's zone of control and spotting put on an empty board with the game's own per-unit
//functions: a board hex counts what the game adds, and claims to be spotted already, so
//setSpotRange marks no unit as newly spotted
export function recompute(w: World) {
	const { m, GameRules } = w;
	const board: { zoc: number[]; spot: number[] }[][] = [];
	const shadow: Hex[][] = [];
	for (let r = 0; r < m.rows; r++) {
		board.push([]);
		shadow.push([]);
		for (let c = 0; c < m.cols; c++) {
			const b = { zoc: [0, 0], spot: [0, 0] };
			board[r].push(b);
			shadow[r].push({
				setZOC: (side: number, on: boolean) => { if (on) b.zoc[side]++; },
				setSpotted: (side: number, on: boolean) => { if (on) b.spot[side]++; },
				isSpotted: () => true,
				getUnit: (): Unit | null => null,
			} as unknown as Hex);
		}
	}
	for (const u of m.getUnits()) {
		if (!u.getPos()) continue;
		GameRules.setZOCRange(shadow, u, true, m.rows, m.cols);
		GameRules.setSpotRange(shadow, u, true, m.rows, m.cols);
	}
	return board;
}

type Add = (kind: string, text: string) => void;

//What doesn't hold, a few of each kind. Units in offMap aren't checked for being on their hex
export function violations(w: World, offMap: Set<Unit> = new Set()): string[] {
	if (w.uiSettings.noFOW) return ["fog of war is off: the spotting counters can't be read"];
	const out: string[] = [];
	const kinds: Record<string, number> = {};
	const add: Add = (kind, text) => {
		kinds[kind] = (kinds[kind] || 0) + 1;
		if (kinds[kind] <= 3) out.push(text);
	};
	unitViolations(w, offMap, add);
	const board = recompute(w);
	for (let r = 0; r < w.m.rows; r++)
		for (let c = 0; c < w.m.cols; c++) {
			hexUnitViolations(w, w.m.map[r][c], add);
			counterViolations(w.m.map[r][c], board[r][c], add);
		}
	for (const [kind, n] of Object.entries(kinds))
		if (n > 3) out.push(`(${n - 3} more ${kind})`);
	return out;
}

//Every unit once in the unit list, with its owner's player, on the hex it says it is on
function unitViolations(w: World, offMap: Set<Unit>, add: Add) {
	const { m } = w;
	const ids = new Set<number>();
	for (const u of m.getUnits()) {
		if (ids.has(u.id)) add("id", unitName(u) + " twice in the unit list");
		ids.add(u.id);
		if (u.player !== m.getPlayer(u.owner))
			add("player", unitName(u) + " has a player that isn't the map's player#" + u.owner);
		const h = u.getHex();
		if (h && h.unit !== u && h.airunit !== u && !offMap.has(u))
			add("unit hex", unitName(u) + " is on " + hexName(h) + ", which holds "
				+ [h.unit, h.airunit].map((x) => x ? unitName(x) : "nothing").join(" and "));
		if (u.destroyed) add("destroyed", unitName(u) + " is destroyed and still in the unit list");
	}
}

//The units a hex holds are on it and in the unit list
function hexUnitViolations(w: World, h: Hex, add: Add) {
	for (const [slot, u] of [["unit", h.unit], ["airunit", h.airunit]] as const) {
		if (!u) continue;
		if (u.getHex() !== h) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", which is on " + hexName(u.getHex()));
		if (!w.m.getUnits().includes(u)) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", not in the unit list");
	}
}

//A hex's counters against the recomputed ones
function counterViolations(h: Hex, want: { zoc: number[]; spot: number[] }, add: Add) {
	const { row: r, col: c } = h.getPos();
	for (const side of [0, 1]) {
		const zoc = counter(() => h.isZOC(side), (on) => h.setZOC(side, on));
		if (zoc !== want.zoc[side])
			add("zoc", `${r},${c} zone of control of side ${side}: ${zoc} instead of ${want.zoc[side]}`);
		const spot = counter(() => h.isSpotted(side), (on) => h.setSpotted(side, on));
		if (spot !== want.spot[side])
			add("spot", `${r},${c} spotting of side ${side}: ${spot} instead of ${want.spot[side]}`);
	}
}
