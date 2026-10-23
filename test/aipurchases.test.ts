//The AI's purchases at its turn's start (src/core/ai.ts, buyAndDeploy), on the small game built by hand:
//the Soviet AI (player 1) buys with the prestige over its reserve
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { createWorld } from "../src/core/create";
import type { GameEvent } from "../src/core/events";
import { costPerStrength, unitCost } from "../src/core/costs";
import { reinforceValue } from "../src/core/supply";
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

//The prestige the purchases spent is gone: the AI plans its reinforcements with what is left after
//them, each as much strength as the prestige still left pays for, up to what the hex gives
test("The AI budgets its reinforcements with the prestige left after its purchases (#21)", () => {
	const saved = smallGameData();
	for (const u of saved.state.units) if (u.owner === 1) u.strength = 2;
	saved.state.players[1].prestige = 600;
	saved.state.turn.currentPlayer = 1;
	const config = { ...aiDefaultConfig, prestigeReserve: 0, airPrestigeRatio: 0 };
	const ai = aiController(1, { config });
	const w = createWorld(saved, Equipment.equipment);
	ai.join(w);
	const started = ai.startTurn(w);
	expect(started.events.some((e) => e.type === "bought")).toBe(true);
	const planned = ai.plan(started.world);
	let budget = planned.state.players[1].prestige;
	for (let o = ai.next(planned); o !== null; o = ai.next(planned)) {
		if (!("command" in o) || o.command.type !== "reinforce") continue;
		const cmd = o.command, u = planned.state.units.find((x) => x.id === cmd.unit);
		const perStrength = costPerStrength(planned, u);
		const strength = Math.min(Math.floor(budget / perStrength), reinforceValue(planned, u));
		expect(strength).toBeGreaterThan(0);
		budget -= strength * perStrength;
	}
});
