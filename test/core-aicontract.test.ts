//The engine contract's AI turns (test/contracts/engine.contract.js) on the core's AI too (src/core/ai.ts),
//beside test/core-ai.test.ts's whole games
import fs from "node:fs";
import { expect, test } from "vitest";
import type { Command } from "../src/commands";
import { aiController } from "../src/core/ai";
import { createWorld } from "../src/core/create";
import { difference, type OldGame, orderOf, recordStart } from "./aigames";
import { type ContractEnv, fixtures, runFixture } from "./contracts";
import { drifted, resync } from "./invariants";

//The engine contract's AI turns (test/contracts/engine.contract.js: the AI players' and the human players'
//stand-ins), each also played by the core's AI from toData of the state before it: its turn start
//(purchases, deployment) as commands, the state after its plan, and every action the contract takes
//from it as the core's order. The contract seeds the streams per call: the core's AI starts where the
//state says. The old engine's counters are made again from its units where they drifted (#72, #73)
test("The engine contract's AI turns play the same on the core's AI", async () => {
	const seen = { plans: 0, starts: 0, orders: 0 }, problems: string[] = [];
	const { UIBuilder } = await import("../src/uibuilder");
	for (const name of fixtures("engine"))
		await runFixture("engine", "runEngineContract", name, (env) => ({ AI: shadowAI({ ...env, UIBuilder }, seen,
			(p) => problems.push(name + ": " + p)) }));
	if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(seen) + "\n");
	expect(problems).toEqual([]);
	expect(seen.plans).toBeGreaterThan(40);
	expect(seen.orders).toBeGreaterThan(1000);
}, 300_000);

type OldAI = InstanceType<OldGame["AI"]>;

//The contract's AI: the old one, with the core's AI for the same player beside it, compared at each call
function shadowAI(env: ContractEnv, seen: { plans: number; starts: number; orders: number }, tell: (problem: string) => void) {
	const Real = env.AI as OldGame["AI"], game = env.game as OldGame["game"], toData = env.toData as OldGame["toData"];
	const old = { m: env.map as OldGame["m"], GameRules: env.GameRules as OldGame["GameRules"] };
	const names = { actionType: env.actionType as OldGame["actionType"], UIBuilder: env.UIBuilder as OldGame["UIBuilder"] };
	const world = () => {
		if (drifted(old)) resync(old);
		return createWorld(toData(game.scenario, game), (env.Equipment as OldGame["Equipment"]).equipment, { spotSide: game.spotSide });
	};
	return function(this: unknown, player: OldGame["m"]["currentPlayer"], map: OldGame["m"]): OldAI {
		const real = new Real(player, map), core = aiController(player.id);
		core.join(world());
		//The old AI's turn start and plan beside the core's, from the same state
		const turn = (start: boolean) => {
			const w = world(), started: Command[] = [], undo = recordStart(old.m, started);
			try {
				if (start) real.buildActions();
				else real.planTurn();
			} finally {
				undo();
			}
			const s = start ? core.startTurn(w) : { world: w, commands: [] as Command[] };
			const planned = core.plan(s.world);
			seen.plans++;
			seen.starts += started.length;
			if (JSON.stringify(s.commands) !== JSON.stringify(started))
				tell(`player#${player.id} turn start: old ${JSON.stringify(started)}, core ${JSON.stringify(s.commands)}`);
			const want = JSON.stringify(toData(game.scenario, game).state), got = JSON.stringify(planned.state);
			if (want !== got) tell(`player#${player.id} plan:` + difference(want, got));
		};
		return {
			buildActions: () => turn(true),
			planTurn: () => turn(false),
			startTurn: () => { throw new Error("the contract starts a turn with buildActions"); },
			getEvaluator: () => real.getEvaluator(),
			getAction() {
				const a = real.getAction(), o = core.next(world());
				seen.orders++;
				const want = JSON.stringify(orderOf(names, a)), got = JSON.stringify(o);
				if (want !== got) tell(`player#${player.id} action: old ${want}, core ${got}`);
				return a;
			},
		} as OldAI;
	};
}
