// @vitest-environment node
//The remastered AI's purchases and deployment at its turn's start (src/core/remastered/purchases.ts, deployment.ts,
//#640): what its army lacks for the plan, and where each unit deploys for it; on hand-built maps
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import type { GameEvent } from "../src/core/events";
import { unitCost } from "../src/core/costs";
import { distance } from "../src/core/geometry";
import { analyse } from "../src/core/remastered/analysis";
import { remasteredController } from "../src/core/remastered/controller";
import { perceive } from "../src/core/remastered/perception";
import { movMethod, terrainType, unitClass } from "../src/core/tables";
import type { Position, World } from "../src/core/types";
import { hexIndex } from "../src/core/world";
import { germanyPoland, type HandUnit, reserveUnit } from "./coreworld";
import { scenarioWorld, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, LEFH18 = 92, PAK36 = 66, PIECHOTA = 270, TP7 = 273, P11C = 280, KARAS = 281;
const GERMANY = 8;

//Germany's equipment window: its models of the default set by class, as a scenario's lists are
function withShop(w: World): World {
	const unitclass: { [uclass: string]: number[] } = {};
	for (const [eqid, e] of Object.entries(germanyPoland))
		if (+e.country === GERMANY) (unitclass[String(e.uclass)] ??= []).push(+eqid);
	w.state.equipment.indexes[String(GERMANY)] = { unitclass };
	return w;
}

//Germany's deployment hexes and prestige
function deploying(w: World, hexes: Position[], prestige: number): World {
	for (const h of hexes) w.data.hexes[hexIndex(w, h.row, h.col)].deployment = 0;
	w.state.players[0].prestige = prestige;
	return withShop(w);
}

const column = (col: number, rows: number[]) => rows.map((row) => ({ row, col }));
const bought = (events: readonly GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "bought" }> => e.type === "bought");
const deployed = (events: readonly GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "deployed" }> => e.type === "deployed");
const startOf = (w: World) => remasteredController(0).startTurn(w);

//Germany attacks Poland's objective in the south-east, its infantry and tanks on the western edge, a Polish infantry on it
const SOUTH_EAST = { row: 10, col: 13 };
const attackers: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 2, col: 3 }, { eqid: INFANTERIE, owner: 0, row: 3, col: 3 },
	{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 3 }, { eqid: PZ_IVD, owner: 0, row: 6, col: 3 },
	{ eqid: PIECHOTA, owner: 1, row: 10, col: 13 }];

test("the remastered AI's turn start doesn't call the classic purchases (#640)", () => {
	//The classic purchases draw their picks from the AI's stream; the remastered AI's draw nothing
	const w = deploying(world(attackers, [], [SOUTH_EAST]), column(1, [0, 1, 2, 3, 4, 5]), 3000);
	const started = startOf(w);
	expect(bought(started.events).length).toBeGreaterThan(0);
	expect(started.world.state.rng?.ai).toBe(w.state.rng?.ai);
	const classic = aiController(0).startTurn(w);
	expect(classic.world.state.rng?.ai).not.toBe(w.state.rng?.ai);
});

test("it buys a transport with a towed gun (#640, #224)", () => {
	//An assault with no artillery: the gun it lacks, with a transport that carries it, or it would never leave its hex
	const w = deploying(world(attackers, [], [SOUTH_EAST]), [{ row: 3, col: 1 }], 1450);
	const started = startOf(w);
	const guns = bought(started.events).filter((b) => w.equipment[b.eqid].uclass === unitClass.artillery);
	expect(guns.length).toBe(1);
	const gun = w.equipment[guns[0].eqid];
	expect(gun.movmethod).toBe(movMethod.towed);
	expect(guns[0].transport).toBeGreaterThan(0);
	expect(w.equipment[guns[0].transport].groundweight & gun.groundweight).not.toBe(0);
});

test("it buys capturing units first when it has too few for its objectives to take (#640)", () => {
	//No artillery, but three objectives to take and five units that capture: infantry or tanks before the gun
	const objectives = [SOUTH_EAST, { row: 1, col: 13 }, { row: 6, col: 14 }];
	const w = deploying(world(attackers, [], objectives), [{ row: 3, col: 1 }], 1450);
	const classes = bought(startOf(w).events).map((b) => w.equipment[b.eqid].uclass);
	expect(classes.length).toBeGreaterThan(0);
	expect([unitClass.infantry, unitClass.tank]).toContain(classes[0]);
});

test("it buys air defence when the enemy has aircraft it knows of (#640)", () => {
	//Every arm but air defence, and a Polish bomber and fighter in sight
	const army: HandUnit[] = [...attackers, { eqid: PAK36, owner: 0, row: 7, col: 3 }, { eqid: LEFH18, owner: 0, row: 8, col: 2 },
		{ eqid: KARAS, owner: 1, row: 5, col: 9 }, { eqid: P11C, owner: 1, row: 6, col: 10 }, { eqid: PIECHOTA, owner: 1, row: 9, col: 13 }];
	const w = deploying(world(army, [], [SOUTH_EAST]), [{ row: 3, col: 1 }], 1400);
	const classes = bought(startOf(w).events).map((b) => w.equipment[b.eqid].uclass);
	expect(classes.some((c) => c === unitClass.airDefence || c === unitClass.flak)).toBe(true);
	//Without the aircraft it buys none
	const blind = deploying(world(army.filter((u) => u.eqid !== KARAS && u.eqid !== P11C), [], [SOUTH_EAST]), [{ row: 3, col: 1 }], 1400);
	expect(bought(startOf(blind).events).map((b) => w.equipment[b.eqid].uclass)).not.toContain(unitClass.airDefence);
});

test("it buys no more than the prestige allows and keeps the reserve (#640)", () => {
	//3000 prestige, the rules' reserve of 1000, and one deployment hex: what it can deploy now, the rest kept
	const w = deploying(world(attackers, [], [SOUTH_EAST]), [{ row: 3, col: 1 }], 3000);
	const started = startOf(w), reserve = w.rules.ai.config.prestigeReserve;
	const spent = bought(started.events).reduce((n, b) => n + b.cost, 0);
	expect(spent).toBeGreaterThan(0);
	expect(spent).toBeLessThanOrEqual(3000 - reserve);
	expect(started.world.state.players[0].prestige).toBe(3000 - spent);
	for (const b of bought(started.events)) expect(b.cost).toBe(unitCost(w, b.eqid, b.transport));
	//Each unit bought deployed this turn: none waits in the reserve
	expect(started.world.state.players[0].core.filter((c) => "reserve" in c)).toEqual([]);
});

test("it deploys the main effort's units nearest the assault's axis (#640)", () => {
	//A tank waiting to deploy, the deployment hexes all down the western edge: it takes the one nearest the south-east
	const hexes = column(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), w = deploying(world(attackers, [], [SOUTH_EAST]), hexes, 0);
	w.state.players[0].core = [{ reserve: reserveUnit(PZ_IVD) }];
	const [d] = deployed(startOf(w).events), apart = (p: Position) => distance(p.row, p.col, SOUTH_EAST.row, SOUTH_EAST.col);
	expect(apart(d.at)).toBe(Math.min(...hexes.map(apart)));
	expect(apart(d.at)).toBeLessThan(apart(hexes[0]));
});

test("it deploys artillery behind the front, in range of it (#640)", () => {
	//Polish infantry facing Germany's line in the middle; a gun to deploy, a hex in the enemy's reach first in the list,
	//one behind the line in range of the front, and one too far back
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 6 }, { eqid: INFANTERIE, owner: 0, row: 6, col: 6 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 9 }, { eqid: PIECHOTA, owner: 1, row: 6, col: 9 }];
	const w = deploying(world(units, [], [{ row: 5, col: 13 }]), [{ row: 4, col: 7 }, { row: 5, col: 3 }, { row: 6, col: 0 }], 0);
	w.state.players[0].core = [{ reserve: reserveUnit(LEFH18) }];
	const [d] = deployed(startOf(w).events);
	const a = analyse(w, perceive(w, 0, [])), cols = w.state.map.cols, hex = hexIndex(w, d.at.row, d.at.col);
	expect(a.influence.enemy[hex]).toBe(0);
	const range = w.equipment[LEFH18].gunrange;
	expect(a.front.some((f) => distance(d.at.row, d.at.col, Math.floor(f / cols), f % cols) <= range)).toBe(true);
	expect(d.at).toEqual({ row: 5, col: 3 });
});

test("a defender deploys infantry nearest a threatened held objective (#640, #645)", () => {
	//Germany defends two objectives, Poland's tanks two hexes from the southern one; an infantry to deploy down the edge
	const threatened = { row: 10, col: 4 }, quiet = { row: 1, col: 4 };
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 10, col: 4 }, { eqid: INFANTERIE, owner: 0, row: 1, col: 4 },
		{ eqid: TP7, owner: 1, row: 10, col: 7 }, { eqid: TP7, owner: 1, row: 9, col: 8 }];
	const w = deploying(world(units, [threatened, quiet], [], 3, false, [0, 2]), column(2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 0);
	w.state.players[0].core = [{ reserve: reserveUnit(INFANTERIE) }];
	const [d] = deployed(startOf(w).events);
	expect(distance(d.at.row, d.at.col, threatened.row, threatened.col)).toBeLessThanOrEqual(2);
});

test("a side without deployment hexes deploys on its towns (#640, #302)", () => {
	//No deployment hex: two towns of Germany's, the one nearer the assault's objective taken first
	const w = withShop(world(attackers, [], [SOUTH_EAST]));
	for (const t of [{ row: 1, col: 1 }, { row: 9, col: 3 }]) {
		w.data.hexes[hexIndex(w, t.row, t.col)].terrain = terrainType.City;
		w.state.map.hexes[hexIndex(w, t.row, t.col)].owner = 0;
	}
	w.state.players[0].core = [{ reserve: reserveUnit(PZ_IVD) }];
	const started = startOf(w);
	expect(deployed(started.events).map((d) => d.at)).toEqual([{ row: 9, col: 3 }]);
});

test("the purchases are the same played twice (#640)", () => {
	//Whatever the AI's stream holds
	const w = deploying(world(attackers, [], [SOUTH_EAST]), column(1, [0, 1, 2, 3, 4, 5]), 4000);
	const other: World = { ...w, state: { ...w.state, rng: { game: 3, ai: 123456 } } };
	const picks = (x: World) => bought(startOf(x).events).map((b) => [b.eqid, b.transport]);
	expect(picks(w).length).toBeGreaterThan(1);
	expect(picks(other)).toEqual(picks(w));
});

test("the classic AI's purchases are unchanged (#640)", () => {
	//Germany's first turn of Panzer-Verbaende Ostpreussen, the classic AI: what it bought before the remastered AI had
	//purchases of its own
	const w = scenarioWorld("drpzop01.xml");
	const started = aiController(0).startTurn(w);
	expect(bought(started.events).map((b) => [b.eqid, b.transport])).toEqual([[555, -1], [1234, 157], [3167, 2399], [114, 157]]);
	expect(deployed(started.events).map((d) => d.at)).toEqual([{ row: 1, col: 10 }, { row: 3, col: 6 }, { row: 4, col: 6 }]);
});
