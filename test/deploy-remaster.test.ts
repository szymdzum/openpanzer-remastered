//Where a side deploys in the remaster's rules (#53, #302): a side the scenario gave no deployment hex
//deploys a unit it bought on a city it owns, an aircraft on an airfield, a ship on a port, away from the
//enemy it sees, for a person and the AI alike. The classic rules refuse the purchase (#60, #287). On the
//small game built by hand, the Soviet side (player 1) to play
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { createWorld } from "../src/core/create";
import { classicRules, remasterRules } from "../src/core/rules";
import { check, step } from "../src/core/step";
import type { Ruleset, World } from "../src/core/types";
import { isSpotted } from "../src/core/world";
import { Equipment } from "../src/equipment";
import { aiDefaultConfig, terrainType } from "../src/prototypes";
import { smallGameData } from "./smallgame";

const INFANTRY = 504, FIGHTER = 530, DESTROYER = 510;
const COLS = 12;
const at = (row: number, col: number) => row * COLS + col;

//The small game with towns: Soviet cities at 10,2 and 2,3 (next to the German infantry at 3,3), a Soviet
//airfield at 10,4 and port at 11,6, a German city at 10,6. No deployment hex. deployment: a Soviet one
//at 10,9
function towns(rules: Ruleset, prestige = 5000, deployment = false): World {
	const saved = smallGameData();
	const town = (row: number, col: number, terrain: number, owner: number) => {
		saved.data.hexes[at(row, col)].terrain = terrain;
		saved.state.map.hexes[at(row, col)].owner = owner;
	};
	town(10, 2, terrainType.City, 1);
	town(2, 3, terrainType.City, 1);
	town(10, 4, terrainType.Airfield, 1);
	town(11, 6, terrainType.Port, 1);
	town(10, 6, terrainType.City, 0);
	if (deployment) saved.data.hexes[at(10, 9)].deployment = 1;
	saved.state.players[1].prestige = prestige;
	saved.state.turn.currentPlayer = 1;
	return createWorld(saved, Equipment.equipment, { rules });
}

//w after the Soviet side bought units of eqids, in its reserve from index 0
function bought(w: World, ...eqids: number[]): World {
	for (const eqid of eqids) {
		const r = step(w, { type: "buy", eqid, transport: -1 });
		if (r.ok === false) throw new Error(r.refusal.reason);
		w = r.world;
	}
	return w;
}

const deployTo = (index: number, row: number, col: number) => ({ type: "deploy" as const, index, to: { row, col } });
const reason = (w: World, cmd: Parameters<typeof check>[1]) => check(w, cmd)?.reason ?? null;

test("In the remaster rules a side with no deployment hex deploys a unit it bought on a city it owns (#302)", () => {
	const w = bought(towns(remasterRules), INFANTRY);
	expect(reason(w, deployTo(0, 10, 2))).toBeNull();
	expect(reason(w, deployTo(0, 10, 6))).toBe("not a deployment hex"); //the enemy's city
	expect(reason(w, deployTo(0, 10, 4))).toBe("not a deployment hex"); //an airfield
	expect(reason(w, deployTo(0, 11, 6))).toBe("not a deployment hex"); //a port
	expect(reason(w, deployTo(0, 5, 5))).toBe("not a deployment hex"); //clear
	const r = step(w, deployTo(0, 10, 2));
	expect(r.ok && r.world.state.map.hexes[at(10, 2)].unit).not.toBeNull();
});

test("In the remaster rules an aircraft deploys on an airfield its side owns, a ship on a port (#302)", () => {
	const w = bought(towns(remasterRules), FIGHTER, DESTROYER);
	expect([reason(w, deployTo(0, 10, 4)), reason(w, deployTo(0, 10, 2)), reason(w, deployTo(0, 11, 6))])
		.toEqual([null, "not a deployment hex", "not a deployment hex"]);
	expect([reason(w, deployTo(1, 11, 6)), reason(w, deployTo(1, 10, 2)), reason(w, deployTo(1, 10, 4))])
		.toEqual([null, "not a deployment hex", "not a deployment hex"]);
});

test("In the remaster rules a side doesn't deploy on a town next to an enemy unit it sees (#302)", () => {
	const w = bought(towns(remasterRules), INFANTRY);
	//the German infantry at 3,3 next to the city at 2,3, unseen: the side doesn't know it is there
	expect(isSpotted(w, at(3, 3), 1)).toBe(false);
	expect(reason(w, deployTo(0, 2, 3))).toBeNull();
	const seen = createWorld({ data: w.data, state: { ...w.state, units: w.state.units.map((u) => u.id === 0 ? { ...u, tempSpotted: true } : u) } },
		w.equipment, { rules: remasterRules });
	expect(reason(seen, deployTo(0, 2, 3))).toBe("not a deployment hex");
});

test("In the remaster rules a side with deployment hexes deploys only there (#302)", () => {
	const w = bought(towns(remasterRules, 5000, true), INFANTRY);
	expect([reason(w, deployTo(0, 10, 2)), reason(w, deployTo(0, 10, 9))]).toEqual(["not a deployment hex", null]);
});

test("In the remaster rules a side buys while a town of its own is free for the unit (#302)", () => {
	const w = towns(remasterRules);
	expect([INFANTRY, FIGHTER, DESTROYER].map((eqid) => reason(w, { type: "buy", eqid, transport: -1 }))).toEqual([null, null, null]);
	//the airfield taken: no fighter, the city and the port free
	const taken = { ...w.state, map: { ...w.state.map, hexes: w.state.map.hexes.map((h, i) => i === at(10, 4) ? { ...h, air: 1 } : h) } };
	const full = createWorld({ data: w.data, state: taken }, w.equipment, { rules: remasterRules });
	expect(reason(full, { type: "buy", eqid: FIGHTER, transport: -1 })).toBe("no free deployment hex");
	expect(reason(full, { type: "buy", eqid: INFANTRY, transport: -1 })).toBeNull();
});

test("In the classic rules a side with no deployment hex can't buy, its towns aside (#60, #302)", () => {
	const w = towns(classicRules);
	expect([INFANTRY, FIGHTER, DESTROYER].map((eqid) => reason(w, { type: "buy", eqid, transport: -1 })))
		.toEqual(["no free deployment hex", "no free deployment hex", "no free deployment hex"]);
});

test("In the remaster rules the AI of a side with no deployment hex buys and deploys on its towns; in the classic rules it buys nothing (#287, #302)", () => {
	const prestige = aiDefaultConfig.prestigeReserve + 3000;
	const remaster = aiController(1, {}).startTurn(towns(remasterRules, prestige));
	const deployed = remaster.events.filter((e) => e.type === "deployed").map((e) => e.type === "deployed" ? e.at : null);
	expect(remaster.world.state.players[1].prestige).toBeLessThan(prestige);
	expect(deployed.length).toBeGreaterThan(0);
	const towns_ = [at(10, 2), at(2, 3), at(10, 4), at(11, 6)];
	for (const p of deployed) expect(towns_).toContain(at(p!.row, p!.col));
	const classic = aiController(1, {}).startTurn(towns(classicRules, prestige));
	expect(classic.world.state.players[1].prestige).toBe(prestige);
	expect(classic.world.state.players[1].core).toEqual([]);
});
