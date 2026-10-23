//The AI's purchases at its turn's start (src/core/ai.ts, buyAndDeploy), on the small game built by hand:
//the Soviet AI (player 1) buys with the prestige over its reserve
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { createWorld } from "../src/core/create";
import type { GameEvent } from "../src/core/events";
import { unitCost } from "../src/core/costs";
import { isTransportable } from "../src/core/units";
import { Equipment } from "../src/equipment";
import { aiDefaultConfig, unitClass } from "../src/prototypes";
import { smallGameData } from "./smallgame";

//The AI's purchases on its turn with prestige, under config
function boughtWith(prestige: number, config = aiDefaultConfig) {
	const saved = smallGameData();
	saved.state.players[1].prestige = prestige;
	saved.state.turn.currentPlayer = 1;
	const w = createWorld(saved, Equipment.equipment);
	const played = aiController(1, { config }).startTurn(w);
	const bought = played.events.filter((e): e is Extract<GameEvent, { type: "bought" }> => e.type === "bought");
	return { w, bought };
}

//A towed gun without a transport moves one hex a turn and infantry always walks, while a person buys
//the same units with a truck. The AI picks one of its country's ground transports that carries the
//unit, is built by the scenario's year and fits what is left of the budget
test("The AI buys its towed guns and infantry with a transport that carries them (#224)", () => {
	const config = { ...aiDefaultConfig, airPrestigeRatio: 0, groundPurchaseClasses: [unitClass.infantry, unitClass.antiTank] };
	const { w, bought } = boughtWith(config.prestigeReserve + 3000, config);
	const transports = w.state.equipment.indexes[20].unitclass[String(unitClass.groundTransport)];
	const carries = (t: number, eqid: number) => {
		const e = w.equipment[t];
		return e.yearavailable <= 1941 && e.yearexpired >= 1941 && (e.groundweight & w.equipment[eqid].groundweight) !== 0;
	};
	//In the order chosen (they are bought from the last chosen), each with what was left of the budget
	let budget = 3000, riding = 0;
	for (const b of [...bought].reverse()) {
		const unit = unitCost(w, b.eqid);
		if (b.transport > 0) {
			expect(transports).toContain(b.transport);
			expect(carries(b.transport, b.eqid)).toBe(true);
			riding++;
		} else if (isTransportable(w, b.eqid)) {
			//Walking only when no transport that carries it fits the budget
			expect(transports.filter((t) => carries(t, b.eqid) && unit + unitCost(w, -1, t) <= budget)).toEqual([]);
		}
		expect(b.cost).toBeLessThanOrEqual(budget);
		budget -= b.cost;
	}
	expect(riding).toBeGreaterThan(0);
});

test("The AI buys a tank without a transport (#224)", () => {
	const config = { ...aiDefaultConfig, airPrestigeRatio: 0, groundPurchaseClasses: [unitClass.tank] };
	const { bought } = boughtWith(config.prestigeReserve + 2000, config);
	expect(bought.length).toBeGreaterThan(0);
	for (const b of bought) expect(b.transport).toBe(-1);
});

//The AI's choosing drops from its candidates what it can't buy now (too dear for what is left, outside
//its price range, not yet built), but only for this purchase: the country's lists stay whole, for its
//later turns and for the player's equipment window
test("The AI's purchases leave the country's equipment lists as they were (#22)", () => {
	const saved = smallGameData();
	const before = structuredClone(saved.state.equipment.indexes);
	saved.state.players[1].prestige = aiDefaultConfig.prestigeReserve + 3000;
	saved.state.turn.currentPlayer = 1;
	const played = aiController(1, {}).startTurn(createWorld(saved, Equipment.equipment));
	expect(played.events.some((e) => e.type === "bought")).toBe(true);
	expect(played.world.state.equipment.indexes).toEqual(before);
});
