//toData and fromData (src/legacy/state.ts): the game as plain data in docs/STATE.md's shape, on every
//engine fixture as restored and after the AI played it. toData carries what the engine contract's
//state string carried (test/statedata.ts), but for what isn't state (the selection, the counters,
//the side shown) and the known losses. fromData builds the objects again: toData of them is the same
//state, and they play on as the ones it was read from
import { expect, test } from "vitest";
import { fixtures } from "./contracts";
import { freshGame, startState, until } from "./lifecycle";
import { viewOf } from "./statedata";
import { carried, playAI, restored } from "./stateplay";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

test.each(fixtures("engine"))("toData of %s is plain data", async (name) => {
	const r = await restored(name);
	r.Rng.seed(7);
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
	expect(state.rng, "the game's and the AI's streams, not the cosmetic one (D8)").toEqual({ game: r.Rng.game.state, ai: r.Rng.ai.state });
});

//D8: a loaded game rolls the dice and plays the AI the saved one would have
test("fromData puts the game's and the AI's streams back where toData read them", async () => {
	const r = await restored("drpzop01-t0.json.gz");
	const { fromData } = await import("../src/legacy/state");
	r.Rng.seed(3);
	const saved = r.toData(r.scenario, r.game);
	const draw = () => [r.Rng.random(), r.Rng.random(), r.Rng.aiRandom(), r.Rng.aiRandom()];
	const first = draw(), cosmetic = r.Rng.cosmetic.state;
	expect(r.toData(r.scenario, r.game).state.rng).not.toEqual(saved.state.rng);
	fromData(saved, r.game);
	expect(draw()).toEqual(first);
	expect(r.Rng.cosmetic.state, "the cosmetic stream isn't state").toBe(cosmetic);
	//Unseeded, the game stream reads Math.random: nothing to save, and nothing set back
	r.Rng.game.state = null;
	const unseeded = r.toData(r.scenario, r.game);
	expect(unseeded.state.rng).toBeNull();
	r.Rng.ai.state = 9;
	fromData(unseeded, r.game);
	expect([r.Rng.game.state, r.Rng.ai.state]).toEqual([null, 9]);
});

test.each(fixtures("engine"))("toData of %s carries what the engine contract's state string carried", async (name) => {
	const { want, got } = carried(await restored(name));
	expect(got).toBe(want);
});

//fromData's scenario: its toData is the state it was built from
test.each(fixtures("engine"))("toData(fromData(toData(x))) is toData(x) for %s, restored and after every AI turn", async (name) => {
	const r = await restored(name);
	const { fromData } = await import("../src/legacy/state");
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
	const { fromData } = await import("../src/legacy/state");
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
	const { fromData } = await import("../src/legacy/state");
	const { GameRules } = await import("../src/legacy/gamerules");
	const { playerType } = await import("../src/core/tables");
	const { Commands } = await import("../src/legacy/commands");
	const m = r.scenario.map;
	m.currentPlayer.type = playerType.humanLocal;
	const move = (x: import("../src/legacy/unit").Unit, c: { row: number; col: number }) =>
		Commands.execute(r.scenario, { type: "move", unit: x.id, to: { row: c.row, col: c.col } });
	const u = m.getUnits().find((x) => x.player === m.currentPlayer && x.getPos() && GameRules.getMoveRange(m, x).some((c) => c.canMove)
		&& (() => { move(x, GameRules.getMoveRange(m, x).find((c) => c.canMove)); return m.canUndoMove(x); })());
	expect(u, "a unit whose move can be undone").toBeTruthy();
	const moved = r.toData(r.scenario, r.game);
	expect(moved.state.turn.undoable).toMatchObject({ unit: u.id });
	Commands.execute(r.scenario, { type: "undo", unit: u.id });
	const undone = r.toData(r.scenario, r.game);
	r.scenario = r.game.scenario = fromData(moved, r.game);
	const v = r.scenario.map.getUnitById(u.id);
	expect(r.scenario.map.canUndoMove(v)).toBe(true);
	Commands.execute(r.scenario, { type: "undo", unit: v.id });
	expect(r.toData(r.scenario, r.game)).toEqual(undone);
});

//The campaign's progress in Game's closure goes back to the game, and the campaign player is the
//new scenario's
test("fromData gives the game its campaign progress and campaign player", async () => {
	const r = await restored("campaign-3-1-t0.json.gz");
	const { fromData } = await import("../src/legacy/state");
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

//The harness reads the state at any moment: a campaign just started still loads its data
test("toData of a game whose campaign is still loading has no campaign scenario yet", async () => {
	const r = await restored("drpzop01-t0.json.gz");
	const { Campaign } = await import("../src/legacy/campaign");
	const campaign = new Campaign(0, 0, () => {});
	const saved = r.toData(r.scenario, { campaign, getCampaignProgress: () => r.game.getCampaignProgress(), setCampaignProgress() {} });
	expect(saved.state.campaign).toMatchObject({ id: 0, scenario: -1 });
});

//#72: the old engine took a campaign's removed units off without their zone of control and spotting,
//which stayed until a reload. The game starts a campaign's scenario on the core now (src/app/start.ts):
//its counters are its units' sight, the units it took off have none left
test("A campaign's next scenario starts with no zone of control or spotting of the units it took off (#72)", async () => {
	const game = await freshGame();
	await startState(game, "campaign:0:1");
	const before = game.scenario;
	game.continueCampaign("victory");
	const next = game.campaign.getCurrentScenario(); //(the campaign's screen asks for it)
	game.newScenario(next.scenario, next.intro);
	await until(() => game.scenario !== before && game.scenario.isLoaded && game.gameStarted, "the next scenario");
	const { toData } = await import("../src/legacy/state");
	const { createWorld } = await import("../src/core/create");
	const { Equipment } = await import("../src/legacy/equipment");
	const m = game.scenario.map, w = createWorld(toData(game.scenario, game), Equipment.equipment);
	expect(game.scenario.file, "the campaign's next scenario").not.toBe(before.file);
	const counters = viewOf(m, game.spotSide).hexes;
	const sight = counters.map((_h, i) => [w.sight.zoc[0][i], w.sight.zoc[1][i], w.sight.spot[0][i], w.sight.spot[1][i]].map((n) => +(n > 0)).join(","));
	expect(counters).toEqual(sight);
	expect(m.getUnits().length, "the scenario's own units on the player's deployment hexes taken off").toBeGreaterThan(0);
});

//savedAs (what the mirror asks of the world it keeps, src/legacy/mirror.ts) sees every write toData would:
//each field of a unit's state and of a hex changed on the objects, and a write into each other part
//of the state, makes it say no, and putting it back yes
test("savedAs sees what toData would of every field it reads", async () => {
	const r = await restored("campaign-3-1-t0.json.gz");
	const { savedAs } = await import("../src/legacy/state");
	r.Rng.seed(5);
	const m = r.scenario.map, saved = r.toData(r.scenario, r.game);
	const sees = (what: string, write: () => () => void) => {
		expect(savedAs(r.scenario, r.game, saved), "before " + what).toBe(true);
		const undo = write();
		expect(savedAs(r.scenario, r.game, saved), what).toBe(false);
		undo();
	};
	const change = (o: object, k: string) => () => {
		const x = o as Record<string, unknown>, was = x[k];
		x[k] = typeof was === "boolean" ? !was : typeof was === "number" ? was + 1 : typeof was === "string" ? was + "!" : 1;
		return () => { x[k] = was; };
	};
	const u = m.getUnits()[0], mounted = m.getUnits().find((x) => x.transport !== null)!;
	for (const k of Object.keys(saved.state.units[0]).filter((x) => !["id", "row", "col", "transport"].includes(x)))
		sees("the unit's " + k, change(u, k));
	sees("the unit's id", change(u, "id"));
	sees("the unit's hex", () => { const h = u.getHex(); u.setHex(m.map[0][0]); return () => u.setHex(h); });
	sees("the unit's transport", change(mounted.transport, "fuel"));
	sees("a transport", () => { const t = mounted.transport; mounted.transport = null; return () => { mounted.transport = t; }; });
	const h = m.map[1][1];
	for (const k of ["terrain", "road", "name", "isDeployment", "owner", "flag", "victorySide"]) sees("the hex's " + k, change(h, k));
	sees("the hex's unit", () => { h.unit = u; return () => { h.unit = null; }; });
	sees("the hex's air unit", () => { h.airunit = u; return () => { h.airunit = null; }; });
	const p = m.getPlayers()[0], core = p.getCoreUnitList();
	for (const k of ["prestige", "score", "airTransports", "type"]) sees("the player's " + k, change(p, k));
	sees("the player's prestige per turn", () => { p.prestigePerTurn.push(1); return () => p.prestigePerTurn.pop(); });
	sees("the player's dossier", () => { const d = p.dossier; p.dossier = { ...d, units: {} }; return () => { p.dossier = d; }; });
	sees("the player's core list", () => { core.reverse(); return () => core.reverse(); });
	for (const k of ["ground", "atmosferic", "dayTurn", "name", "eqp"]) sees("the scenario's " + k, change(r.scenario, k));
	for (const k of ["turn", "maxTurns", "isLastRowPartial", "terrainImage"]) sees("the map's " + k, change(m, k));
	sees("the current player", () => { const c = m.currentPlayer; m.currentPlayer = m.getPlayers()[1]; return () => { m.currentPlayer = c; }; });
	const objectives = m.sidesVictoryHexes.find((l) => l.length > 0)!;
	sees("the objectives", () => { const o = objectives.pop()!; return () => objectives.push(o); });
	sees("the next unit id", change(m.getBoard(), "uniqueID"));
	const turn = Object.keys(r.scenario.reinforcements).find((t) => r.scenario.reinforcements[t].length > 0)!;
	sees("a reinforcement", change(r.scenario.reinforcements[turn][0].unit, "strength"));
	sees("the undo slot", () => { const slot = m.getUndoSlot(); slot.unit = u; slot.savedUnit = u; return () => slot.clear(); });
	sees("the dice", () => { r.Rng.random(); return () => { r.Rng.game.state = saved.state.rng!.game; }; });
	sees("the campaign's progress", () => {
		const was = r.game.getCampaignProgress();
		r.game.setCampaignProgress({ ...was, awardPrototype: !was.awardPrototype }, r.scenario);
		return () => r.game.setCampaignProgress(was, r.scenario);
	});
	const list = Object.values(Object.values(r.Equipment.equipmentIndexes)[0].unitclass!).find((l) => l.length > 1)!;
	sees("the equipment lists' order", () => { list.reverse(); return () => list.reverse(); });
	expect(savedAs(r.scenario, r.game, saved)).toBe(true);
});
