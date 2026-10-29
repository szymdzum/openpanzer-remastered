//The rules the screen asks of the running game (src/legacy/gamerules.ts, #137): on engine fixtures after the
//units moved and fought a little (random commands, test/commandgen.ts, played as the game plays them),
//every unit's own rules (air, ground, train, fuel and ammo, ranges, costs and upgrade costs, bridges),
//its move and attack hexes and whether it can mount, embark, disembark, resupply and reinforce, and for
//every pair of units in range the attack's estimate. Until the old engine went (#137) its GameRules gave
//the same answers on the same states; the hashes of the answers then (test/corerules.json.gz) pin them
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { expect, test } from "vitest";
import { commandOf, sequences } from "./commandgen";
import { load } from "./invariants";

type World = Awaited<ReturnType<typeof load>>;

const stats: Record<string, number> = {};
const count = (what: string, n = 1) => { stats[what] = (stats[what] || 0) + n; };

//What the rules say of every unit, as text, and of the pairs
function answers(w: World): string[] {
	const R = w.GameRules, m = w.m, out: string[] = [];
	const eqids = Object.keys(w.Equipment.equipment).map(Number).slice(0, 40);
	for (const u of m.getUnits()) {
		const hex = u.getHex();
		out.push(`unit#${u.id} ` + JSON.stringify([R.isAir(u), R.isGround(u), R.isTrain(u), R.unitUsesFuel(u), R.unitUsesAmmo(u),
			R.unitLowFuel(u, 5), R.unitLowAmmo(u, 2), R.getUnitMoveRange(u), R.getUnitAttackRange(u), R.calculateUnitCostPerStrength(u),
			R.calculateUnitSellCost(u), eqids.map((e) => R.calculateUpgradeCosts(u, e, -1)), R.isBridgeForSide(hex, 0), R.isBridgeForSide(hex, 1),
			R.canMount(u), R.canEmbark(m.map, u), R.canDisembark(m.map, u), R.canResupply(m.map, u), R.canReinforce(m.map, u),
			R.canReinforce(m.map, u, true), R.getMoveRange(m, u), R.getUnitAttackCells(m.map, u, m.rows, m.cols)]));
		count("units");
	}
	for (const a of m.getUnits())
		for (const d of m.getUnits())
			if (a !== d && a.player.side !== d.player.side && R.isInAttackRange(a, d)) {
				out.push(`unit#${a.id} on unit#${d.id} ` + JSON.stringify(R.calculateCombatResults(a, d, m.getUnits(), false, true)));
				count("pairs");
			}
	out.push(JSON.stringify([R.isAir(null), R.getUnitAttackRange(null), R.calculateUpgradeCosts(null, 1, 1), R.calculateUnitCostPerStrength(null),
		eqids.map((e) => [R.isTransportable(e), R.calculateUnitCosts(e, -1), R.calculateUnitCosts(-1, e)]), R.getDirection(3, 4, 5, 6)]));
	return out;
}

//The hashes recorded, by sample (UPDATE_CONTRACTS=1 writes them again, in a commit that names the issue
//it fixes)
const pinned = path.join(__dirname, "corerules.json.gz");
const recorded = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(pinned)).toString("utf8")) as string[];

test("The rules the screen asks answer as the old engine's did", async () => {
	const want = recorded(), got: string[] = [];
	for (const seq of fc.sample(sequences, { seed: 4, numRuns: want.length })) {
		const w = await load(seq.fixture);
		const { setEngineContext, engineContext } = await import("../src/legacy/context");
		setEngineContext({ ...engineContext, host: () => w.game });
		w.Rng.game.state = seq.seed >>> 0;
		for (const pick of seq.steps) {
			const cmd = commandOf(w, pick);
			if (cmd !== null && cmd.type !== "endTurn") w.Commands.execute(w.scenario, cmd);
		}
		got.push(createHash("sha1").update(JSON.stringify(answers(w))).digest("hex").slice(0, 12));
	}
	if (process.env.UPDATE_CONTRACTS) fs.writeFileSync(pinned, zlib.gzipSync(JSON.stringify(got), { level: 9 }));
	else expect(got).toEqual(want);
	expect(stats.pairs).toBeGreaterThan(50);
}, 300_000);
