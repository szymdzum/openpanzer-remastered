//The rules the screen asks of the running game, answered by the core (src/corerules.ts, #137), against
//the old engine's GameRules: on every engine fixture, as it is and after the units moved and fought a
//little (random commands, test/commandgen.ts), every unit's own rules (air, ground, train, fuel and
//ammo, ranges, costs and upgrade costs, bridges), its move and attack hexes and whether it can mount,
//embark, disembark, resupply and reinforce, and for every pair of units in range the attack's estimate
import fc from "fast-check";
import { expect, test } from "vitest";
import { commandOf, type Sequence, sequences } from "./commandgen";
import { load } from "./invariants";

type World = Awaited<ReturnType<typeof load>>;

const stats: Record<string, number> = {};
const count = (what: string, n = 1) => { stats[what] = (stats[what] || 0) + n; };

//What each side says of a unit, as text, and of the pairs
async function answers(w: World, rules: "old" | "core"): Promise<string[]> {
	const { CoreRules } = await import("../src/corerules");
	const R = rules === "old" ? w.GameRules : CoreRules;
	const m = w.m, out: string[] = [];
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

async function same(seq: Sequence) {
	const w = await load(seq.fixture);
	const { setEngineContext, engineContext } = await import("../src/context");
	setEngineContext({ ...engineContext, host: () => w.game });
	w.Rng.game.state = seq.seed >>> 0;
	for (const pick of seq.steps) {
		const cmd = commandOf(w, pick);
		if (cmd !== null && cmd.type !== "endTurn") w.Commands.execute(w.scenario, cmd);
	}
	const old = await answers(w, "old"), core = await answers(w, "core");
	expect(core).toEqual(old);
}

test("The rules the screen asks answer the same on the core as on the old engine", async () => {
	await fc.assert(fc.asyncProperty(sequences, same), { seed: 4, numRuns: process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 20 });
	expect(stats.pairs).toBeGreaterThan(50);
	if (process.env.FC_STATS) console.log(JSON.stringify(stats));
}, 300_000);
