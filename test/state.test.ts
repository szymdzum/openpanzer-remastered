//toData and fromData (src/state.ts): the game as plain data in docs/STATE.md's shape, on every
//engine fixture as restored and after the AI played it. toData carries what the engine contract's
//state string carried (test/statedata.ts), but for what isn't state (the selection, the counters,
//the side shown) and the known losses. fromData builds the objects again: toData of them is the same
//state, and they play on as the ones it was read from
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

//fromData's scenario: its toData is the state it was built from
test.each(fixtures("engine"))("toData(fromData(toData(x))) is toData(x) for %s, restored and after every AI turn", async (name) => {
	const r = await restored(name);
	const { fromData } = await import("../src/state");
	const roundTrip = () => {
		const saved = r.toData(r.scenario, r.game);
		expect(r.toData(fromData(saved, r.game), r.game)).toEqual(saved);
	};
	roundTrip();
	await playAI(r, 11, (step) => { if (step.endsWith(" end")) roundTrip(); });
});

//The AI plays the same 2 turns (the same seed) on the fixture and on fromData of its state: the
//same states after every step
test.each(fixtures("engine"))("fromData's scenario of %s plays as the one it was read from", async (name) => {
	const r = await restored(name);
	const { fromData } = await import("../src/state");
	const start = r.toData(r.scenario, r.game), spotSide = r.game.spotSide;
	const trace = async () => {
		const states: string[] = [];
		await playAI(r, 5, (step) => states.push(step + " " + JSON.stringify(r.toData(r.scenario, r.game).state)));
		return states;
	};
	const played = await trace();
	r.scenario = r.game.scenario = fromData(start, r.game);
	r.game.spotSide = spotSide;
	const again = await trace();
	expect(again.length).toBe(played.length);
	expect(again.findIndex((s, i) => s !== played[i]), "the first step that differs").toBe(-1);
});

//The undo slot: a human player's move undone on fromData's scenario as on the original
test("fromData keeps the last move undoable, and the undo puts back what it did", async () => {
	const r = await restored("ruscam09-t2.json.gz");
	const { fromData } = await import("../src/state");
	const { GameRules } = await import("../src/gamerules");
	const { playerType } = await import("../src/prototypes");
	const m = r.scenario.map;
	m.currentPlayer.type = playerType.humanLocal;
	const u = m.getUnits().find((x) => x.player === m.currentPlayer && x.getPos() && GameRules.getMoveRange(m, x).length > 0
		&& (() => { const c = GameRules.getMoveRange(m, x)[0]; m.moveUnit(x, c.row, c.col); return m.canUndoMove(x); })());
	expect(u, "a unit whose move can be undone").toBeTruthy();
	const moved = r.toData(r.scenario, r.game);
	expect(moved.state.turn.undoable).toMatchObject({ unit: u.id });
	m.undoLastMove();
	const undone = r.toData(r.scenario, r.game);
	r.scenario = r.game.scenario = fromData(moved, r.game);
	const v = r.scenario.map.getUnitById(u.id);
	expect(r.scenario.map.canUndoMove(v)).toBe(true);
	r.scenario.map.undoLastMove();
	expect(r.toData(r.scenario, r.game)).toEqual(undone);
});

//The campaign's progress in Game's closure goes back to the game, and the campaign player is the
//new scenario's
test("fromData gives the game its campaign progress and campaign player", async () => {
	const r = await restored("campaign-3-1-t0.json.gz");
	const { fromData } = await import("../src/state");
	const saved = r.toData(r.scenario, r.game);
	expect(saved.state.campaign).not.toBeNull();
	const progress = { isStart: !saved.state.campaign.progress.isStart, removeNonCampaignUnits: true, awardPrototype: true };
	const scenario = fromData({ data: saved.data, state: { ...saved.state, campaign: { ...saved.state.campaign, progress } } }, r.game);
	expect(r.game.getCampaignProgress()).toEqual(progress);
	expect(r.game.getCampaignPlayer().country).toBe(r.game.campaign.country);
	expect(scenario.map.getPlayers()).toContain(r.game.getCampaignPlayer());
	expect(() => fromData({ data: saved.data, state: { ...saved.state, campaign: null } }, r.game)).toThrow(/without a campaign/);
	expect(() => fromData({ data: saved.data, state: { ...saved.state, campaign: { ...saved.state.campaign, id: -1 } } }, r.game))
		.toThrow(/load campaign -1/);
});

//#72: removeNonCampaignUnits takes units off without their zone of control and spotting. fromData
//counts the counters again from the units (D10), so the phantom ones are gone: the old engine's
//counters aren't reproduced. A fix of #72 flips this
test.fails("fromData keeps the counters a removal left behind (fails: #72)", async () => {
	const r = await restored("wdmillazzo-t0.json.gz");
	const { fromData } = await import("../src/state");
	const m = r.scenario.map;
	const before = m.getUnits().length;
	for (const p of m.getPlayers()) m.removeNonCampaignUnits(p);
	expect(m.getUnits().length, "no unit stood on a deployment hex").toBeLessThan(before);
	const view = viewOf(m, r.game.spotSide);
	const restoredScenario = fromData(r.toData(r.scenario, r.game), r.game);
	expect(viewOf(restoredScenario.map, r.game.spotSide)).toEqual(view);
});

function firstDifference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "  want " + want.slice(Math.max(0, d - 100), d + 100) + "\n  got  " + got.slice(Math.max(0, d - 100), d + 100);
}
