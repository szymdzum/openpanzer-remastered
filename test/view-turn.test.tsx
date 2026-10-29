//The start of a turn on the new UI (src/view/turn.ts, src/view/turnbanner.tsx; TurnStart, TurnBanner, the AI indicator
//of Tooltips, #346) on the small game built by hand: the short report as the old UI computed it, what the enemy's turn
//did from its steps' events, the first unit, the program's turn counted in units; the report and the indicator in jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";
import { deployWorld } from "./coreworld";
import { worldOf } from "../src/legacy/mirror";
import { classicRules } from "../src/core/rules";
import type { GameEvent } from "../src/core/events";
import type { World } from "../src/core/types";
import { playerType } from "../src/core/tables";
import { aiStatusOf, firstUnitOf, noteEnemy, quietTurn, turnReportOf } from "../src/view/turn";
import { AiIndicator, TurnBanner } from "../src/view/turnbanner";
import { createStore } from "../src/view/store";

afterEach(cleanup);

//The small game at a turn, the current player given, the person's prestige 3056 and +5 the turn after; units as given
function world(turn = 4, current = 0, units = smallGameUnits, change: (s: ReturnType<typeof smallGameData>) => void = () => {}): World {
	const saved = smallGameData(units);
	Object.assign(saved.state.turn, { turn, currentPlayer: current });
	Object.assign(saved.state.scenario, { maxTurns: 17, victoryTurns: [13, 15, 17] });
	Object.assign(saved.state.players[0], { prestige: 3056, prestigePerTurn: Array(20).fill(5) });
	saved.data.name = "Ciechanow";
	change(saved);
	return worldOf(smallGame(units, saved).scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
}

test("The short report: date and scenario, the turn, objectives left, turns to each outcome with its track, prestige and ground (#346)", () => {
	const r = turnReportOf(world(), quietTurn())!;
	expect(r).toMatchObject({ label: "22 Jun 1941 · Ciechanow", title: "Turn 4 of 17", objectives: 1, lead: { left: 10, name: "Brilliant" },
		others: "12 Victory · 14 Tactical", last: null, prestige: "3,056", next: 5, ground: { icon: "dry", word: "Dry" }, campaign: false,
		enemy: [{ tone: "muted", text: "All quiet on this front" }], briefing: { title: "Ciechanow", html: "" } });
	expect(r.past).toBeCloseTo(3.5 / 17);
	expect(r.tiers).toEqual([{ label: "B", at: 13 / 17, gone: false }, { label: "V", at: 15 / 17, gone: false }, { label: "T", at: 1, gone: false }]);
	//late: brilliant gone, struck off the track and out of the words
	const late = turnReportOf(world(14), quietTurn())!;
	expect([late.lead, late.others, late.tiers[0].gone]).toEqual([{ left: 2, name: "Victory" }, "4 Tactical", true]);
	//the last turn of the last outcome: what is at stake, plainly
	expect(turnReportOf(world(17), quietTurn())!.last).toBe("Take them this turn for Tactical victory");
	expect(turnReportOf(world(15, 0, smallGameUnits, (s) => { s.state.scenario.victoryTurns = [13, 15]; }), quietTurn())!.last)
		.toBe("Take them this turn for Victory");
	//past every deadline: none left
	expect(turnReportOf(world(18), quietTurn())).toMatchObject({ lead: null, others: "", last: null, past: 1 });
	//no person plays here: no report
	expect(turnReportOf(world(4, 0, smallGameUnits, (s) => { s.state.players[0].type = playerType.aiLocal; }), quietTurn())).toBeNull();
	expect(turnReportOf(world(4, 0, smallGameUnits, (s) => { s.state.players[0].prestigePerTurn = []; }), quietTurn())!.next).toBe(0);
});

//A fight event between two units, their strength before and after
function fight(atk: [number, number, number, number], def: [number, number, number, number], support = false): GameEvent {
	const f = ([unit, side, before, after]: [number, number, number, number]) => ({ unit, eqid: 0, side, row: 0, col: 0, isMounted: false, isSurprised: false,
		before: { strength: before, experience: 0, entrenchment: 0, ammo: 0 }, after: { strength: after, experience: 0, entrenchment: 0, ammo: 0 } });
	return { type: "fight", support, attacker: f(atk), defender: f(def), result: null as never, record: [] };
}

test("What the enemy's turn did, from its steps' events: the side's units attacked, the strength they lost, objectives taken (#346)", () => {
	const w = world();
	let e = noteEnemy(quietTurn(), w, [fight([4, 1, 10, 9], [0, 0, 10, 7])]);
	e = noteEnemy(e, w, [fight([5, 1, 10, 10], [0, 0, 7, 6]), fight([1, 0, 10, 10], [5, 1, 10, 8], true), fight([3, 0, 10, 9], [6, 1, 10, 10], true)]);
	e = noteEnemy(e, w, [{ type: "captured", unit: 4, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 0, score: 0, win: false },
		{ type: "captured", unit: 4, at: { row: 3, col: 3 }, flag: true, objective: false, prestige: 0, score: 0, win: false },
		{ type: "captured", unit: 1, at: { row: 9, col: 9 }, flag: true, objective: true, prestige: 0, score: 0, win: false },
		{ type: "captured", unit: 99, at: { row: 9, col: 9 }, flag: true, objective: true, prestige: 0, score: 0, win: false }]);
	expect(e).toEqual({ attacked: [0], lost: 5, objectives: 1 });
	expect(turnReportOf(w, e)!.enemy).toEqual([{ tone: "critical", text: "1 of your units attacked" }, { tone: "critical", text: "−5 strength lost" },
		{ tone: "critical", text: "1 objective lost" }]);
	expect(turnReportOf(w, { attacked: [0, 2], lost: 0, objectives: 2 })!.enemy.map((l) => l.text)).toEqual(["2 of your units attacked", "2 objectives lost"]);
});

test("A destroyed unit counts as lost only the strength it had, though the dice killed more (#428)", () => {
	const e = noteEnemy(quietTurn(), world(), [fight([4, 1, 10, 10], [0, 0, 1, -1])]);
	expect(e.lost).toBe(1);
});

test("A person's turn starts on their first ground unit, never an aircraft; a program's on none (#346)", () => {
	expect(firstUnitOf(world())).toBe(0);
	//(the Me-109 first in the list: the infantry after it)
	expect(firstUnitOf(world(4, 0, [[159, 0, 1, 1], [115, 0, 3, 3], [504, 1, 7, 7]]))).toBe(1);
	expect(firstUnitOf(world(4, 0, [[159, 0, 1, 1], [504, 1, 7, 7]]))).toBeNull();
	expect(firstUnitOf(world(4, 1))).toBeNull();
});

test("The AI indicator counts the program's units that have moved or fired, on its turn only (#346)", () => {
	const w = world(4, 1, smallGameUnits, (s) => { s.state.units[4].hasMoved = true; s.state.units[6].hasFired = true; });
	expect(aiStatusOf(w)).toEqual({ country: "Russia", nation: "su", side: 1, acted: 2, units: 4 });
	expect(aiStatusOf(world())).toBeNull();
	expect(aiStatusOf(world(4, 9))).toBeNull();
});

//A store on the world, the report or the indicator rendered
function storeOf(w: World) {
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	render(<><TurnBanner store={store} /><AiIndicator store={store} /></>);
	return store;
}

test("The report opens at the turn's start on its first unit, closes on ×, Esc or a click on the map; Briefing shows the scenario (#346)", async () => {
	const store = storeOf(world(17));
	expect(document.getElementById("combatLog")).toBeNull();
	await act(() => store.startTurn());
	const report = screen.getByRole("region", { name: "Turn 17 of 17" });
	expect([report.id, report.className, store.selected.value, store.lookAt.value]).toEqual(["combatLog", "pm-panel pm-turn last", 0, { row: 3, col: 3 }]);
	expect(report.querySelector(".cell.vic.crit .w")!.textContent).toBe("Take them this turn for Tactical victory");
	expect([...report.querySelectorAll(".tier")].map((t) => t.className)).toEqual(["tier gone", "tier gone", "tier"]);
	expect(report.querySelector(".ft")!.textContent).toBe("Enemy turnAll quiet on this frontTurn report");
	//(no dossier outside a campaign)
	expect(screen.queryByRole("button", { name: "Dossier" })).toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Briefing" })); });
	expect(store.note.value).toMatchObject({ title: "Ciechanow", html: "" });
	store.note.value!.ok();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Close" })); });
	expect(document.getElementById("combatLog")).toBeNull();
	await act(() => store.showReport(true));
	await act(() => store.shortcut({ menu: "escape" }));
	expect([store.banner.value, store.selected.value]).toEqual([false, 0]);
	await act(() => store.showReport(true));
	await act(() => store.clickHex({ row: 9, col: 9 }));
	expect(store.banner.value).toBe(false);
});

test("A turn start while the reserve is being deployed opens the report and selects nothing; a program's opens nothing (#346)", async () => {
	const store = createStore({ world: () => deployWorld(), command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	store.startDeployment();
	await act(() => store.startTurn());
	expect([store.banner.value, store.selected.value, store.deploying.value]).toEqual([true, null, 1]);
	const theirs = storeOf(world(4, 1));
	await act(() => theirs.startTurn());
	expect(theirs.banner.value).toBe(false);
	//(Briefing with no report open: nothing)
	theirs.briefing();
	expect(theirs.note.value).toBeNull();
	cleanup();
	//past every deadline: said plainly
	const late = storeOf(world(18));
	await act(() => late.showReport(true));
	expect(document.querySelector("#combatLog .cell.vic .w")!.textContent).toBe("No outcome left to win");
});

test("In a campaign the report has the dossier (#348); the end of the person's turn closes the report (#346)", async () => {
	//(a campaign's state, as the world of a campaign's scenario has it)
	const w = world();
	const store = storeOf({ ...w, state: { ...w.state, campaign: {} as never } });
	await act(() => store.showReport(true));
	const dossier = screen.getByRole("button", { name: "Dossier" }) as HTMLButtonElement;
	expect(dossier.disabled).toBe(false);
	expect(screen.getByRole("region", { name: "Turn 4 of 17" }).querySelector(".cell.vic .w")!.textContent).toBe("10 for Brilliant · 12 Victory · 14 Tactical");
	await act(() => { store.noteEnemy([fight([4, 1, 10, 9], [0, 0, 10, 7])]); });
	expect(store.enemy.value.lost).toBe(3);
	await act(() => { store.dispatch({ type: "endTurn" }); });
	expect([store.banner.value, store.enemy.value, store.selected.value]).toEqual([false, quietTurn(), null]);
});

test("The AI indicator shows while a program plays: its flag, a dot in its side's colour, the units that have acted (#346)", () => {
	storeOf(world(4, 1, smallGameUnits, (s) => { s.state.units[5].hasMoved = true; }));
	const ai = document.getElementById("aiStatus")!;
	expect([ai.tagName, ai.className, ai.textContent, ai.querySelector("use")!.getAttribute("href")])
		.toEqual(["OUTPUT", "pm-ai", "Russia is moving · 1 of 4 units", "#pm-flag-su"]);
	cleanup();
	storeOf(world(4, 0, smallGameUnits, (s) => { s.state.players[0].type = playerType.aiLocal; s.state.players[0].country = 2; }));
	expect([document.getElementById("aiStatus")!.className, document.querySelector("#aiStatus use")]).toEqual(["pm-ai axis", null]);
});

test("A new scenario or a loaded game starts with a quiet enemy turn: the last game's attacks aren't reported (#466)", () => {
	const w = world();
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	store.noteEnemy([fight([4, 1, 10, 9], [0, 0, 10, 7])]);
	expect(turnReportOf(w, store.enemy.value)!.enemy.map((l) => l.text)).toEqual(["1 of your units attacked", "−3 strength lost"]);
	//(the screen clears the store when a scenario starts, a loaded game's too: the old UI's setNewScenario reset the log)
	store.clear();
	expect(store.enemy.value).toEqual(quietTurn());
	expect(turnReportOf(w, store.enemy.value)!.enemy.map((l) => l.text)).toEqual(["All quiet on this front"]);
});
