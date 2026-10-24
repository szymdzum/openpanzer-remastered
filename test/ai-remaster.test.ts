//The remaster's AI (#53): the changes to its play the remaster's rules make (src/core/rules.ts, ai), each
//against the classic AI on a small map built by hand, where the change decides what a unit does
import { expect, test } from "vitest";
import type { Command } from "../src/commands";
import { aiController } from "../src/core/ai";
import { classicRules, remasterRules } from "../src/core/rules";
import type { Ruleset, World } from "../src/core/types";
import { germanyPoland, handWorld } from "./coreworld";

const INFANTERIE = 115, TP7 = 273;

//The commands the AI of player plans on its turn of w
function planned(w: World, player: number): Command[] {
	const ai = aiController(player);
	ai.join(w);
	const after = ai.plan(w);
	const commands: Command[] = [];
	for (let o = ai.next(after); o !== null; o = ai.next(after)) if ("command" in o) commands.push(o.command);
	return commands;
}

//A German infantry dug in five levels deep, ten hexes north of a German objective Poland holds, a 7TP
//far off on the other side (or where given), and Poland's own objectives to take: none (Germany attacks) or three
//(Poland attacks, Germany defends)
function entrenchedInfantry(rules: Ruleset, polishObjectives: number, ai: number, tank = { row: 14, col: 14 }): World {
	const w = handWorld({ rows: 16, cols: 16, units: [
		{ eqid: INFANTERIE, owner: 0, row: 2, col: 2, entrenchment: 5 },
		{ eqid: TP7, owner: 1, ...tank },
	] }, germanyPoland, { rules, noFOW: true });
	w.state.rng = { game: 1, ai };
	const objective = w.state.map.hexes[12 * 16 + 2];
	objective.victorySide = 0;
	objective.owner = 1;
	w.state.objectives[0].push({ row: 12, col: 2 });
	for (let i = 0; i < polishObjectives; i++) {
		w.state.map.hexes[i * 16 + 8] = { ...w.state.map.hexes[i * 16 + 8], victorySide: 1, owner: 0 };
		w.state.objectives[1].push({ row: i, col: 8 });
	}
	return w;
}

const moves = (commands: Command[]) => commands.some((c) => c.type === "move" && c.unit === 0);

test("An attacker's entrenched unit moves on toward its objective in the remaster, stays dug in in the classic rules (#235)", () => {
	for (const ai of [1, 2, 3, 4, 5]) {
		expect(moves(planned(entrenchedInfantry(classicRules, 0, ai), 0)), "classic, ai " + ai).toBe(false);
		expect(moves(planned(entrenchedInfantry(remasterRules, 0, ai), 0)), "remaster, ai " + ai).toBe(true);
	}
});

test("A defender's entrenched unit stays dug in, in the remaster as in the classic rules (#235)", () => {
	for (const ai of [1, 2, 3, 4, 5]) {
		expect(moves(planned(entrenchedInfantry(classicRules, 3, ai), 0)), "classic, ai " + ai).toBe(false);
		expect(moves(planned(entrenchedInfantry(remasterRules, 3, ai), 0)), "remaster, ai " + ai).toBe(false);
	}
});

test("An attacker's entrenched unit in contact with the enemy stays dug in, in the remaster as in the classic rules (#235)", () => {
	//The 7TP three hexes off, to the side away from the objective
	for (const ai of [1, 2, 3, 4, 5])
		for (const rules of [classicRules, remasterRules])
			expect(moves(planned(entrenchedInfantry(rules, 0, ai, { row: 0, col: 5 }), 0)), rules.name + ", ai " + ai).toBe(false);
});
