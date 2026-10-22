//toData (src/state.ts): the game as plain data in docs/STATE.md's shape, on every engine fixture as
//restored and after the AI played it. It carries what the engine contract's state string carried
//(test/statedata.ts), but for what isn't state (the selection, the counters, the side shown) and the
//known losses
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import { mulberry32 } from "./lifecycle";
import { contractStateString, stateStringFromData, viewOf } from "./statedata";

//The fixture restored as the contracts restore it, with its modules
async function restored(name: string) {
	const fixture = readFixture("engine", name);
	const scenario = await restoreState(fixture.state);
	const { game } = await import("../src/game");
	const { Equipment } = await import("../src/equipment");
	const { toData } = await import("../src/state");
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	return { scenario, game, Equipment, toData };
}
type Restored = Awaited<ReturnType<typeof restored>>;

//What the old contract string has, and the same string rebuilt from toData
function carried(r: Restored) {
	const saved = r.toData(r.scenario, r.game);
	return {
		want: contractStateString(r.scenario, r.Equipment, r.game.spotSide),
		got: stateStringFromData(saved, viewOf(r.scenario.map, r.game.spotSide), r.Equipment),
	};
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

test.each(fixtures("engine"))("toData of %s is plain data", async (name) => {
	const r = await restored(name);
	const saved = r.toData(r.scenario, r.game);
	expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
	expect(structuredClone(saved)).toEqual(saved);
	const { state, data } = saved;
	expect(state.version).toBe(1);
	expect(state.map.hexes).toHaveLength(state.map.rows * state.map.cols);
	expect(data.hexes).toHaveLength(state.map.rows * state.map.cols);
	expect(state.players.map((p) => p.id), "a player's id is its index (D4)").toEqual(state.players.map((_, i) => i));
	expect(state.units.map((u) => u.id), "the ids grow with the placement order (D1, D2)").toEqual(state.units.map((u) => u.id).sort((a, b) => a - b));
	expect(Math.max(-1, ...state.units.map((u) => u.id))).toBeLessThan(state.nextUnitId);
	expect(state.campaign === null).toBe(r.game.campaign === null);
	expect(state.rng, "#126 fills it").toBeNull();
});

test.each(fixtures("engine"))("toData of %s carries what the engine contract's state string carried", async (name) => {
	const { want, got } = carried(await restored(name));
	expect(got).toBe(want);
});

//The AI plays every player for 2 turns, Math.random seeded, the state compared after every action
//(through the commands, as the game sends them) and every end of turn
test.each(fixtures("engine"))("toData carries the state string after every AI action of %s", async (name) => {
	const r = await restored(name);
	const differences: string[] = [];
	await playAI(r, 7, (step) => {
		const { want, got } = carried(r);
		if (want !== got && differences.length < 3) differences.push(step + "\n" + firstDifference(want, got));
	});
	expect(differences).toEqual([]);
});

//An AI action as the command the game sends for it (game.ts processAction), null for the UI's
type AIAction = import("../src/ai").AIAction;
type Command = import("../src/commands").Command;
async function commandOf(): Promise<(a: AIAction) => Command | null> {
	const { actionType: A } = await import("../src/prototypes");
	const { Unit } = await import("../src/unit");
	const make: Record<number, (unit: number, p: AIAction["param"]) => Command> = {
		[A.move]: (unit, p) => ({ type: "move", unit, to: p[1] as { row: number; col: number } }),
		[A.attack]: (unit, p) => ({ type: "attack", unit, target: (p[1] as { id: number }).id }),
		[A.resupply]: (unit) => ({ type: "resupply", unit }),
		[A.reinforce]: (unit) => ({ type: "reinforce", unit }),
		[A.mount]: (unit) => ({ type: "mount", unit }),
		[A.umount]: (unit) => ({ type: "unmount", unit }),
	};
	return (a) => make[a.type] && a.param[0] instanceof Unit ? make[a.type](a.param[0].id, a.param) : null;
}

//The AI plays every player of the restored fixture for 2 turns with Math.random seeded, the
//players' handlers stubbed (the driver plans): after(step) after every action and end of turn
async function playAI(r: Restored, seed: number, after: (step: string) => void) {
	const { AI } = await import("../src/ai");
	const { Commands } = await import("../src/commands");
	const command = await commandOf();
	const m = r.scenario.map;
	(r.game as unknown as { ui: unknown }).ui = { handleReinforcementDeployment() {} };
	m.getPlayers().forEach((p) => { p.handler = { buildActions() {} } as typeof p.handler; });
	const realRandom = Math.random;
	Math.random = mulberry32(seed);
	try {
		for (let t = 0; t < 2 * m.getPlayers().length; t++) {
			const ai = new AI(m.currentPlayer, m);
			ai.buildActions();
			after("turn " + m.turn + " purchases");
			for (let n = 0, a = ai.getAction(); a && n < 500; n++, a = ai.getAction()) {
				const c = command(a);
				if (c) Commands.execute(r.scenario, c);
				after("turn " + m.turn + " action " + n);
			}
			const ended = Commands.execute(r.scenario, { type: "endTurn" }, { localSide: 2 });
			if (ended.ok && ended.result) break;
			r.game.spotSide = m.currentPlayer.side;
			after("turn " + m.turn + " end");
		}
	} finally {
		Math.random = realRandom;
	}
}

function firstDifference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "  want " + want.slice(Math.max(0, d - 100), d + 100) + "\n  got  " + got.slice(Math.max(0, d - 100), d + 100);
}
