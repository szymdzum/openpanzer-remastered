//What must hold on every game state, whatever was played, as test/invariants.test.ts and
//test/properties.test.ts check it: the spotting and zone of control counters of every hex equal a
//recomputation from the units (the core's sight of the game's state), hexes and units point at each
//other, every unit belongs to its owner's Player
import { readFixture, restoreState } from "./contracts";
import { coreEngine } from "./coreengine";
import { createWorld } from "../src/core/create";
import type { Hex } from "../src/map";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";

//The modules of the restored state (restoreState resets them for every fixture), with the game's
//session the engine contract plays on (test/coreengine.ts): its players and end of turn
export async function load(name: string) {
	const fixture = readFixture("engine", name);
	const scenario = await restoreState(fixture.state);
	const { GameRules } = await import("../src/gamerules");
	const { CombatLog } = await import("../src/combatlog");
	const { Equipment } = await import("../src/equipment");
	const { Commands } = await import("../src/commands");
	const { Rng } = await import("../src/rng");
	const { game } = await import("../src/game");
	const { toData } = await import("../src/state");
	const prototypes = await import("../src/prototypes");
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	//What the session asks of the screen
	(game as unknown as { ui: unknown }).ui = { handleReinforcementDeployment() {}, showAlert() {}, mainMenuButton() {} };
	const engine = await coreEngine();
	const m = scenario.map;
	return { scenario, m, GameRules, CombatLog, Equipment, Commands, Rng, game, toData, AI: engine.AI, endTurn: () => engine.Actions.endTurn(),
		...prototypes };
}
//The game's modules of a restored fixture (the core's World is src/core/types.ts's)
export type Restored = Awaited<ReturnType<typeof load>>;

export const unitName = (u: Unit) => "unit#" + u.id;
export const cellName = (c: Cell) => c.row + "," + c.col;
export const hexName = (h: Hex | null) => h ? cellName(h.getPos()) : "no hex";

//Every unit's zone of control and spotting, counted per hex from the units: the core's sight of the
//game's state now (toData), as the screen should show it
export function recompute(w: Board) {
	const { m } = w;
	const sight = createWorld(w.toData(w.scenario, w.game), w.Equipment.equipment).sight;
	const board: { zoc: number[]; spot: number[] }[][] = [];
	for (let r = 0; r < m.rows; r++) {
		board.push([]);
		for (let c = 0; c < m.cols; c++) {
			const i = r * m.cols + c;
			board[r].push({ zoc: [sight.zoc[0][i], sight.zoc[1][i]], spot: [sight.spot[0][i], sight.spot[1][i]] });
		}
	}
	return board;
}

//What the counters' checks read of the game: its map, its state and its equipment
export type Board = Pick<Restored, "m" | "scenario" | "game" | "toData" | "Equipment">;

type Add = (kind: string, text: string) => void;

//What doesn't hold, a few of each kind. Units in offMap aren't checked for being on their hex
export function violations(w: Restored, offMap: Set<Unit> = new Set()): string[] {
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
			counterViolations(w.m.map[r][c], w.m.getVisibility().counters[r][c], board[r][c], add);
		}
	for (const [kind, n] of Object.entries(kinds))
		if (n > 3) out.push(`(${n - 3} more ${kind})`);
	return out;
}

//Every unit once in the unit list, with its owner's player, on the hex it says it is on
function unitViolations(w: Restored, offMap: Set<Unit>, add: Add) {
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
function hexUnitViolations(w: Restored, h: Hex, add: Add) {
	for (const [slot, u] of [["unit", h.unit], ["airunit", h.airunit]] as const) {
		if (!u) continue;
		if (u.getHex() !== h) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", which is on " + hexName(u.getHex()));
		if (!w.m.getUnits().includes(u)) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", not in the unit list");
	}
}

//A hex's counters (the ones its isZOC and isSpotted read) against the recomputed ones
type Counts = { zoc: number[]; spot: number[] };
function counterViolations(h: Hex, has: Counts, want: Counts, add: Add) {
	const { row: r, col: c } = h.getPos();
	for (const side of [0, 1]) {
		const zoc = has.zoc[side];
		if (zoc !== want.zoc[side])
			add("zoc", `${r},${c} zone of control of side ${side}: ${zoc} instead of ${want.zoc[side]}`);
		const spot = has.spot[side];
		if (spot !== want.spot[side])
			add("spot", `${r},${c} spotting of side ${side}: ${spot} instead of ${want.spot[side]}`);
	}
}
