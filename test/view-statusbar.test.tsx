//The new UI's status bar (src/view/statusbar.tsx, StatusBar, #346) in jsdom, on the small game built by hand: the
//cells the card has, the rules the game plays (#317), the two window buttons off until their windows, the status line
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { smallGame, smallGameData } from "./smallgame";
import { worldOf } from "../src/legacy/mirror";
import { remasterRules } from "../src/core/rules";
import type { World } from "../src/core/types";
import { StatusBar } from "../src/view/statusbar";
import { createStore } from "../src/view/store";

afterEach(cleanup);

//The small game with the person's prestige, on the remaster rules, the side shown 0
function smallWorld(prestige: number, current = 0): World {
	const saved = smallGameData();
	saved.state.players[0].prestige = prestige;
	saved.state.turn.currentPlayer = current;
	saved.data.hexes[4 * 12 + 4].name = "Ciechanow";
	return worldOf(smallGame(undefined, saved).scenario, null, { spotSide: 0, noFOW: false, rules: remasterRules });
}

async function shown(w: World) {
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	await act(() => { store.refresh(); });
	render(<StatusBar store={store} />);
	return store;
}

const cells = () => [...document.querySelectorAll("#statusbar .row > .cell")].map((c) => c.textContent);

test("The status bar shows the side's flag and country, the turn, date, weather, ground, rules and prestige (#346, #317)", async () => {
	await shown(smallWorld(3056));
	const side = document.querySelector("#statusbar .pm-side")!;
	expect([side.textContent, side.className, side.querySelector("use")!.getAttribute("href")]).toEqual(["Germany · Axis", "pm-side", "#pm-flag-de"]);
	expect(cells()).toEqual(["Turn1/10", "22 Jun 1941", "Fair", "Dry", "RulesRemaster", "3,056"]);
	expect([...document.querySelectorAll("#statusbar .cell use")].map((u) => u.getAttribute("href"))).toEqual(["#pm-fair", "#pm-dry", "#pm-prestige"]);
});

test("On the AI's turn the bar shows its side in the Allies' colour, and the person's prestige", async () => {
	await shown(smallWorld(80, 1));
	const side = document.querySelector("#statusbar .pm-side")!;
	expect([side.textContent, side.className]).toEqual(["Russia · Allies", "pm-side allied"]);
	expect(cells().pop()).toBe("80");
});

test("The unit list button opens the unit list on the person's turn (#348); the turn report button opens and closes the short report (#346)", async () => {
	const store = await shown(smallWorld(0));
	const list = document.getElementById("statusBarButton")!, report = document.getElementById("combatLogButton") as HTMLButtonElement;
	expect([list.getAttribute("aria-label"), list.hasAttribute("disabled")]).toEqual(["Unit list", false]);
	await act(() => { fireEvent.click(list); });
	expect(store.listOpen.value).toBe(true);
	expect([report.getAttribute("aria-label"), report.disabled]).toEqual(["Turn report", false]);
	await act(() => { fireEvent.click(report); });
	expect(store.banner.value).toBe(true);
	await act(() => { fireEvent.click(report); });
	expect(store.banner.value).toBe(false);
	//on the AI's turn the person's report still opens (the person plays the side shown)
	cleanup();
	await shown(smallWorld(0, 1));
	expect((document.getElementById("combatLogButton") as HTMLButtonElement).disabled).toBe(false);
	expect(document.getElementById("statusBarButton")!.title).toBe("Not your turn");
});

test("The status line tells the hex under the pointer, as the old #locmsg: the unit there and the place, not the selected unit (#441)", async () => {
	const store = await shown(smallWorld(0));
	const w = store.world.value!;
	await act(() => { store.pickUnit(1); });
	expect(document.querySelector("#statusbar .msg")!.textContent).toBe("");
	await act(() => store.hoverHex({ row: 4, col: 4 }));
	const said = document.querySelector("#statusbar .msg")!.textContent!;
	expect([said.startsWith(w.equipment[142].name + " · Ciechanow · "), said.endsWith(" (4,4)")]).toEqual([true, true]);
	//A refusal instead, until the next command
	await act(() => { store.refused.value = "Not enough prestige"; });
	expect(document.querySelector("#statusbar .msg")!.textContent).toBe("Not enough prestige");
	await act(() => { store.refused.value = null; });
	//No game: an empty bar
	const empty = createStore({ world: () => null, command: () => ({ ok: true, result: null }), won: () => {} });
	cleanup();
	render(<StatusBar store={empty} />);
	expect([cells(), document.querySelector("#statusbar .pm-side")!.textContent]).toEqual([["Turn", "", "Rules"], " · "]);
});
