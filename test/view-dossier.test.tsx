//The dossier and the campaign's end on the new UI (src/view/windows/dossier.ts, src/view/windows/dossierwindow.tsx; Dossier,
//CampaignEnd, #348) on a hand-built campaign world: only what the game keeps, the counts by class, their sums and the
//medal record; the window from the reports' Dossier button and at the campaign's end, in jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import type { World } from "../src/core/types";
import { unitClass } from "../src/core/tables";
import { campaignEndOf, dossierOf } from "../src/view/windows/dossier";
import { DossierWindow } from "../src/view/windows/dossierwindow";
import { LogWindow } from "../src/view/windows/logwindow";
import { MessageDialog } from "../src/view/hud/message";
import { createStore } from "../src/view/store/store";
import { TurnBanner } from "../src/view/hud/turnbanner";

afterEach(cleanup);

//Germany's campaign, its player with 940 prestige, 14 infantry and 6 tanks destroyed, a core tank and two auxiliary
//infantry lost, a brilliant victory and a defeat
function world(dossier: World["state"]["players"][number]["dossier"] = {
	units: { killed: { [unitClass.infantry]: 14, [unitClass.tank]: 6 }, lostcore: { [unitClass.tank]: 1 }, lostaux: { [unitClass.infantry]: 2 } },
	outcomes: { briliant: ["Lodz - Warta River"], victory: [], tactical: [], lose: ["Bzura"] },
}): World {
	const w = handWorld({ rows: 4, cols: 4, units: [{ eqid: 140, owner: 0, row: 1, col: 1 }] }, undefined, { spotSide: 0 });
	w.state.campaign = { id: 0, file: "fallweiss.xml", scenario: 1, country: 7, difficulty: 0, startPrestige: 0,
		progress: { isStart: false, removeNonCampaignUnits: false, awardPrototype: false } };
	Object.assign(w.state.players[0], { prestige: 940, dossier, prestigePerTurn: [0, 0, 0] });
	return w;
}

test("The dossier counts by class, their sums and the medal record, as the game keeps them; none outside a campaign (#348)", () => {
	const d = dossierOf(world())!;
	expect(d).toMatchObject({ title: "Germany campaign", destroyed: 20, lost: 3, played: 2, prestige: "940", defeats: ["Bzura"] });
	expect(d.table.columns.map((c) => c.label)).toEqual(["Infantry", "Tank", "Recon", "Anti-tank", "Artillery", "Air defence", "Fighter", "Bomber"]);
	expect(d.table.rows.map((r) => [r.id, r.cells.slice(0, 3)])).toEqual([
		["dossierDestroyed", [{ value: 14 }, { value: 6 }, { value: 0, tone: "muted" }]],
		["dossierLostCore", [{ value: 0, tone: "muted" }, { value: 1, tone: "critical" }, { value: 0, tone: "muted" }]],
		["dossierLostAux", [{ value: 2, tone: "critical" }, { value: 0, tone: "muted" }, { value: 0, tone: "muted" }]]]);
	expect(d.medals).toEqual([{ outcome: "briliant", label: "Brilliant", count: 1, names: ["Lodz - Warta River"] },
		{ outcome: "victory", label: "Victory", count: 0, names: [] }, { outcome: "tactical", label: "Tactical", count: 0, names: [] }]);
	//one not set up yet: empty, as the old window showed it (#403)
	expect(dossierOf(world({}))).toMatchObject({ destroyed: 0, lost: 0, played: 0, defeats: [] });
	const plain = world();
	plain.state.campaign = null;
	expect(dossierOf(plain)).toBeNull();
	expect([campaignEndOf("victory", "x"), campaignEndOf("lose", "y")]).toEqual([
		{ title: "Campaign victory", stamp: "Mission accomplished", won: true, html: "x" },
		{ title: "Campaign defeat", stamp: "Relieved of command", won: false, html: "y" }]);
});

function dossierStore(w: World | null) {
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	render(<><TurnBanner store={store} /><LogWindow store={store} /><DossierWindow store={store} /><MessageDialog store={store} /></>);
	return store;
}

test("The report's Dossier opens the window with the old dossier's ids; the close button and Esc close it (#348)", async () => {
	const store = dossierStore(world());
	await act(() => store.showReport(true));
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Dossier" })); });
	const win = document.getElementById("dossier")!;
	expect(["dossierTitle", "dossierCampaign", "dossierCasualties", "dossierClasses", "dossierDestroyed", "dossierLostCore", "dossierLostAux",
		"dossierMedals", "dossierCloseBut"].filter((id) => win.querySelector("#" + id) === null)).toEqual([]);
	expect([win.querySelector("#dossierTitle")!.textContent, win.querySelector("#dossierInfo"), win.querySelectorAll(".medal.none").length])
		.toEqual(["Dossier", null, 2]);
	expect(win.querySelector("#dossierLostCore td.critical")!.textContent).toBe("1");
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(document.getElementById("dossier")).toBeNull();
	//the full report's Dossier too
	await act(() => store.openLog());
	await act(() => { fireEvent.click(within(document.getElementById("combatLog")!).getByRole("button", { name: "Dossier" })); });
	await act(() => { fireEvent.click(within(document.getElementById("dossier")!).getByRole("button", { name: "Close" })); });
	expect(store.dossier.value).toBeNull();
});

//(#486: test/view-html.test.tsx has the others)
test("The campaign's end shows its closing words without a script they carry (#486)", async () => {
	const store = dossierStore(world());
	await act(() => store.endCampaign("victory", "Poland has <b onclick=\"alert(1)\">capitulated</b>.<img src=x onerror=\"alert(2)\"><script>alert(3)</script>", () => {}));
	expect(document.querySelector("#dossierInfo")!.innerHTML).toBe("Poland has <b>capitulated</b>.");
});

test("The campaign's end is the dossier under the outcome's stamp and the closing words; Main menu does what the game asked (#348)", async () => {
	const store = dossierStore(world()), then = vi.fn();
	await act(() => store.endCampaign("victory", "Poland has <b>capitulated</b>.", then));
	const win = document.getElementById("dossier")!;
	expect([win.querySelector("#dossierTitle")!.textContent, win.querySelector(".pm-stamp")!.className, win.querySelector(".pm-stamp")!.textContent,
		win.querySelector("#dossierInfo")!.innerHTML]).toEqual(["Campaign victory", "pm-stamp lg ok", "Mission accomplished", "Poland has <b>capitulated</b>."]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Main menu" })); });
	expect([then.mock.calls.length, document.getElementById("dossier")]).toEqual([1, null]);
	await act(() => store.endCampaign("lose", "Relieved.", then));
	expect(document.querySelector("#dossier .pm-stamp")!.className).toBe("pm-stamp lg");
	cleanup();
	//no campaign player to show: the outcome as a message, as before
	const none = dossierStore(null);
	await act(() => none.endCampaign("briliant", "the end", then));
	expect(document.querySelector("#ui-message #title")!.textContent).toBe("Brilliant Victory");
});
