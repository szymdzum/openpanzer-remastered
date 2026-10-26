//The new UI's status bar (src/view/statusbar.tsx, StatusBar, #346) in jsdom, on the small game built by hand: the
//cells the card has, the rules the game plays (#317), the two window buttons off until their windows, the status line
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { smallGame, smallGameData } from "./smallgame";
import { worldOf } from "../src/mirror";
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

test("The unit list button is off until its window comes; the turn report button opens and closes the short report (#346)", async () => {
	const store = await shown(smallWorld(0));
	const list = document.getElementById("statusBarButton")!, report = document.getElementById("combatLogButton") as HTMLButtonElement;
	expect([list.getAttribute("aria-label"), list.hasAttribute("disabled"), list.title]).toEqual(["Unit list", true, "Not in the new UI yet"]);
	expect([report.getAttribute("aria-label"), report.disabled]).toEqual(["Turn report", false]);
	await act(() => { fireEvent.click(report); });
	expect(store.banner.value).toBe(true);
	await act(() => { fireEvent.click(report); });
	expect(store.banner.value).toBe(false);
	//on the AI's turn the person's report still opens (the person plays the side shown)
	cleanup();
	await shown(smallWorld(0, 1));
	expect((document.getElementById("combatLogButton") as HTMLButtonElement).disabled).toBe(false);
});

test("The status line names the selected unit, its moves of its turn's and its hex with the place's name", async () => {
	const store = await shown(smallWorld(0));
	const w = store.world.value!;
	await act(() => { store.selected.value = 1; });
	const e = w.equipment[142];
	expect(document.querySelector("#statusbar .msg")!.textContent)
		.toBe(`${e.name} Tank · ${e.movpoints} of ${e.movpoints} moves left · hex 4,4 · Ciechanow`);
	//A refusal instead of the unit, until the next command
	await act(() => { store.refused.value = "Not enough prestige"; });
	expect(document.querySelector("#statusbar .msg")!.textContent).toBe("Not enough prestige");
	await act(() => { store.refused.value = null; });
	//(a hex without a name: none)
	await act(() => { store.selected.value = 0; });
	expect(document.querySelector("#statusbar .msg")!.textContent).toMatch(/ · hex 3,3$/);
	//No game: an empty bar
	const empty = createStore({ world: () => null, command: () => ({ ok: true, result: null }), won: () => {} });
	cleanup();
	render(<StatusBar store={empty} />);
	expect([cells(), document.querySelector("#statusbar .pm-side")!.textContent]).toEqual([["Turn", "", "Rules"], " · "]);
});
