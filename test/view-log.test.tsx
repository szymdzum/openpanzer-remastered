//The turn report and the message dialog on the new UI (src/view/log.ts, src/view/logwindow.tsx, src/view/message.tsx;
//CombatLog, MessageDialog, #348) on hand-built worlds: the old combat log's totals kept from the steps' events, the
//resupplies and reinforcements of a turn's start, the five reports as the window writes them, and the briefing and
//the notices in jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import type { GameEvent } from "../src/core/events";
import type { World } from "../src/core/types";
import { leaderDescriptions, leaderType, terrainType } from "../src/prototypes";
import { combatLogOf, emptyLog, type LogEntry, logStep, logTurnStart, type TurnLog } from "../src/view/log";
import { LogWindow } from "../src/view/logwindow";
import { MessageDialog } from "../src/view/message";
import { createStore } from "../src/view/store";
import { quietTurn } from "../src/view/turn";
import { TurnBanner } from "../src/view/turnbanner";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, TP7 = 273;

//A core Pz IIA (0) in Mława, a city, and an auxiliary Infanterie (1) of Germany's; two Polish 7TPs (2, 3)
function world(): World {
	const w = handWorld({ rows: 8, cols: 8, terrain: (r, c) => r === 2 && c === 2 ? terrainType.City : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, isCore: true, flag: 8 }, { eqid: INFANTERIE, owner: 0, row: 4, col: 4, flag: 8 },
		{ eqid: TP7, owner: 1, row: 2, col: 3, flag: 16 }, { eqid: TP7, owner: 1, row: 5, col: 5, flag: 16 },
	] }, undefined, { spotSide: 0 });
	w.data.hexes[2 * 8 + 2].name = "Mława";
	w.data.name = "Ciechanow";
	Object.assign(w.state.scenario, { maxTurns: 17, victoryTurns: [13, 15, 17] });
	Object.assign(w.state.players[0], { prestige: 3056, prestigePerTurn: Array(20).fill(50), score: 412 });
	return w;
}

//A fight between two units: their side, hex, and strength, experience, entrenchment and ammo before and after
type Side = { unit: number, eqid: number, side: number, at: [number, number], before: number[], after: number[] };
function fight(a: Side, d: Side, support = false): GameEvent {
	const f = (s: Side) => ({ unit: s.unit, eqid: s.eqid, side: s.side, row: s.at[0], col: s.at[1], isMounted: false, isSurprised: false,
		before: { strength: s.before[0], experience: s.before[1], entrenchment: s.before[2], ammo: s.before[3] },
		after: { strength: s.after[0], experience: s.after[1], entrenchment: s.after[2], ammo: s.after[3] } });
	return { type: "fight", support, attacker: f(a), defender: f(d), result: null as never, record: [] };
}

const pz = (before: number[], after: number[]): Side => ({ unit: 0, eqid: PZ_IIA, side: 0, at: [2, 2], before, after });
const tp = (unit: number, before: number[], after: number[]): Side => ({ unit, eqid: TP7, side: 1, at: [2, 3], before, after });
const text = (e: LogEntry) => e.words.map((x) => typeof x === "string" ? x : x.b).join("");

//The Pz IIA attacks one 7TP and is attacked by the other; the Infanterie gives support fire; a 7TP hits a 7TP (not the side's)
function fought(w: World): TurnLog {
	let log = logStep(emptyLog(), w, w, [fight(pz([10, 0, 2, 8], [9, 12, 1, 7]), tp(2, [10, 0, 0, 6], [7, 0, 0, 6]))]);
	log = logStep(log, w, w, [fight(tp(3, [10, 0, 0, 6], [10, 3, 0, 5]), pz([9, 12, 1, 7], [6, 15, 0, 7])),
		fight({ unit: 1, eqid: INFANTERIE, side: 0, at: [4, 4], before: [10, 0, 0, 5], after: [10, 1, 0, 1] }, tp(3, [10, 3, 0, 5], [8, 3, 0, 5]), true),
		fight(tp(2, [7, 0, 0, 6], [7, 0, 0, 5]), tp(3, [8, 3, 0, 5], [8, 3, 0, 5]))]);
	return log;
}

test("A unit's fights add up as the old log added them: losses, what it inflicted, experience, entrenchment; only the side shown's (#348)", () => {
	const log = fought(world());
	expect(log.combat.map((u) => [u.id, u.isCore, u.losses, u.kills, u.xp, u.entrenchLost, u.entrench, u.ammo, u.strength, u.assaults, u.defends,
		u.supports])).toEqual([[0, true, 4, 3, 15, 2, 0, 7, 6, 1, 1, 0], [1, false, 0, 2, 1, 0, 0, 1, 10, 0, 0, 1]]);
	//the dice killing more than a unit had count what it had (#428)
	const w = world();
	const dead = logStep(emptyLog(), w, w, [fight(tp(2, [10, 0, 0, 6], [10, 0, 0, 5]), pz([1, 0, 0, 8], [-1, 0, 0, 8]))]);
	expect([dead.combat[0].losses, dead.combat[0].strength]).toEqual([1, 0]);
});

test("Leaders won, objectives taken and lost; a turn's start adds the side's resupplies and reinforcements (#348)", () => {
	const w = world();
	w.state.units[0].leader = leaderType.battlefieldIntelligence;
	let log = logStep(emptyLog(), w, w, [{ type: "leader", unit: 0, leader: leaderType.battlefieldIntelligence },
		{ type: "leader", unit: 2, leader: leaderType.firstStrike },
		{ type: "captured", unit: 0, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 150, score: 0, win: false },
		{ type: "captured", unit: 2, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 150, score: 0, win: false },
		{ type: "captured", unit: 0, at: { row: 3, col: 3 }, flag: true, objective: false, prestige: 50, score: 0, win: false }]);
	expect(log.leaders).toEqual([{ id: 0, eqid: PZ_IIA, isCore: true, at: { row: 2, col: 2 }, leader: leaderType.battlefieldIntelligence,
		classLeader: leaderType.aggressiveTankManeuver }]);
	expect(log.objectives).toEqual([{ at: { row: 2, col: 2 }, ours: true, prestige: 150 }, { at: { row: 2, col: 2 }, ours: false, prestige: 150 }]);
	w.state.units[1].ammo = 3;
	log = logTurnStart(log, w, [{ type: "turnStarted", player: 0, turn: 2, date: "", dayTurn: 0 },
		{ type: "resupplied", unit: 1, supply: { ammo: 2, fuel: 0, transportAmmo: 0, transportFuel: 0 } },
		{ type: "resupplied", unit: 2, supply: { ammo: 2, fuel: 0, transportAmmo: 0, transportFuel: 0 } },
		{ type: "arrived", unit: 0, at: { row: 2, col: 2 } }, { type: "arrived", unit: 99, at: { row: 1, col: 1 } }]);
	expect(log.resupply).toEqual([{ id: 1, eqid: INFANTERIE, isCore: false, at: { row: 4, col: 4 }, ammo: 3, fuel: w.state.units[1].fuel }]);
	expect(log.reinforce.map((r) => r.id)).toEqual([0]);
});

test("The window writes the summary and the five reports, the numbers in bold, the result on the right (#348)", () => {
	const w = world(), e = w.equipment;
	w.state.units[0].leader = leaderType.battlefieldIntelligence;
	let log = fought(w);
	log = logStep(log, w, w, [{ type: "leader", unit: 0, leader: leaderType.battlefieldIntelligence },
		{ type: "captured", unit: 0, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 150, score: 0, win: false }]);
	log = logTurnStart(log, w, [{ type: "resupplied", unit: 1, supply: { ammo: 0, fuel: 0, transportAmmo: 0, transportFuel: 0 } },
		{ type: "arrived", unit: 0, at: { row: 2, col: 2 } }]);
	const v = combatLogOf(w, log, quietTurn())!;
	expect(v).toMatchObject({ title: "Turn 1 report", label: "Ciechanow · 01 Sep 1939 · Fair · Dry", objectives: 0, lead: { left: 13, name: "Brilliant" },
		others: "15 Victory · 17 Tactical", score: 412, prestige: "3,056", next: 50, campaign: false });
	expect(v.sections.map((s) => [s.title, s.entries.length])).toEqual([["Unit combat report", 2], ["Resupply report", 1],
		["Reinforcements report", 1], ["Unit leaders report", 1], ["Objectives report", 1]]);
	const [tank, inf] = v.sections[0].entries;
	expect(text(tank)).toBe(`Core 101st Pz IIA assaulted from Mława City (2,2): inflicted 3 casualties, lost 4 strength, 6 surviving in 1 assault, `
		+ `1 attack defended. Gained +15 experience. 2 entrenchment lost, 0 left.`);
	expect([tank.destroyed, tank.sprite, tank.at]).toEqual([false, e[PZ_IIA].icon, { row: 2, col: 2 }]);
	expect(text(inf)).toBe(`Auxiliary 1st Infanterie gave fire support from (4,4): inflicted 2 casualties. Gained +1 experience. Low on ammo, 1/${e[INFANTERIE].ammo} remaining.`);
	expect(text(v.sections[1].entries[0])).toBe(`Auxiliary 1st Infanterie resupplied automatically: ammo ${w.state.units[1].ammo}/${e[INFANTERIE].ammo}.`);
	expect(text(v.sections[2].entries[0])).toBe("Pz IIA arrived as a reinforcement at (2,2).");
	const lead = v.sections[3].entries[0];
	expect(text(lead)).toBe(`Core 101st Pz IIA won a leader: Aggressive Tank Maneuver, `
		+ `${leaderDescriptions[leaderType.aggressiveTankManeuver][1].replace(/\.$/, "").toLowerCase()}; Battlefield Intelligence, `
		+ `${leaderDescriptions[leaderType.battlefieldIntelligence][1].replace(/\.$/, "").toLowerCase()}.`);
	expect([text(v.sections[4].entries[0]), v.sections[4].entries[0].icon]).toEqual(["Captured objective Mława at (2,2).", "objective"]);
	//a unit destroyed, its line in critical as the old log's red one; an objective lost
	const lostIt = logStep(emptyLog(), w, w, [fight(tp(2, [10, 0, 0, 6], [10, 0, 0, 5]), pz([3, 0, 0, 8], [0, 0, 0, 8])),
		{ type: "captured", unit: 2, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 150, score: 0, win: false }]);
	const after = combatLogOf(w, lostIt, quietTurn())!;
	expect(text(after.sections[0].entries[0])).toBe("Core 101st Pz IIA defended Mława City (2,2): lost 3 strength, destroyed in 1 attack defended.");
	expect(after.sections[0].entries[0].destroyed).toBe(true);
	expect(text(after.sections[4].entries[0])).toBe("Lost objective Mława at (2,2).");
	expect(combatLogOf({ ...w, state: { ...w.state, players: w.state.players.map((p) => ({ ...p, type: 1 })) } }, log, quietTurn())).toBeNull();
});

//The report, the short one and the messages on a store whose host plays nothing
function logStore(w: World) {
	let now = w;
	const store = createStore({ world: () => now, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	render(<><TurnBanner store={store} /><LogWindow store={store} /><MessageDialog store={store} /></>);
	return { store, set: (x: World) => { now = x; } };
}

test("Turn report in the short report opens the window over a scrim; an entry looks at its hex; Briefing, Continue and Esc; End turn starts it again (#348)", async () => {
	const w = world(), { store } = logStore(w);
	await act(() => { store.startTurn(); });
	store.logTurn([{ type: "arrived", unit: 0, at: { row: 2, col: 2 } }]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Turn report" })); });
	const win = document.getElementById("combatLog")!;
	expect([win.tagName, win.className, win.previousElementSibling!.className]).toEqual(["DIALOG", "pm-window pm-log", "pm-scrim"]);
	expect(within(win).getByRole("heading", { name: "Turn 1 report" })).toBeTruthy();
	expect([...win.querySelectorAll(".quiet")].length).toBe(4);
	await act(() => { fireEvent.click(win.querySelector(".pm-entry")!); });
	expect(store.lookAt.value).toEqual({ row: 2, col: 2 });
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: "Briefing" })); });
	const msg = document.getElementById("ui-message")!;
	expect([msg.className, msg.querySelector(".pm-stamp")!.textContent, msg.querySelector("#uiokbut")!.textContent]).toEqual(["pm-window pm-message", "Secret", "Understood"]);
	//(no country and day at its foot: the old message had none)
	expect(msg.querySelector(".ft")!.textContent).toBe("Understood");
	expect(document.querySelector("#ui-message .pm-label")!.textContent).toBe("Briefing · Turn 1");
	await act(() => { fireEvent.click(msg.querySelector("#uiokbut")!); });
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(document.getElementById("combatLog")).toBeNull();
	await act(() => { store.openLog(); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); });
	expect(store.combatLog.value).toBeNull();
	//the person's end of turn starts the log again; a turn's start adds to it
	await act(() => { store.dispatch({ type: "endTurn" }); store.openLog(); });
	expect(store.combatLog.value!.sections[0].entries).toEqual([]);
	await act(() => { store.logTurn([{ type: "arrived", unit: 1, at: { row: 4, col: 4 } }]); });
	expect(store.combatLog.value!.sections[2].entries.length).toBe(1);
	//a step shown is logged as it starts to play (a move: no fight)
	store.showStep(w, [{ type: "captured", unit: 0, at: { row: 2, col: 2 }, flag: true, objective: true, prestige: 150, score: 0, win: false }], () => {});
	expect(store.combatLog.value!.sections[4].entries.length).toBe(1);
});

test("A notice is the short window without the stamp, its button Continue; the game's ids are kept (#348)", async () => {
	const { store } = logStore(world());
	let oked = 0;
	await act(() => { store.show({ title: "Prototype", html: "You receive <b>Pz IIIE</b>.", at: null, ok: () => { oked++; } }); });
	const msg = document.getElementById("ui-message")!;
	expect([msg.className, msg.querySelector(".pm-stamp"), msg.querySelector("#title")!.textContent, msg.querySelector("#message")!.innerHTML])
		.toEqual(["pm-window pm-message notice", null, "Prototype", "You receive <b>Pz IIIE</b>."]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); });
	expect([oked, document.getElementById("ui-message")]).toEqual([1, null]);
});
