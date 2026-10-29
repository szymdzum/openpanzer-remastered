//The reserve tray on the new UI (src/view/deploy.ts trayOf, src/view/tray.tsx; Deployment, #348) on the Deployment
//card's hand-built world (deployWorld: a Pz IIA on the map, an Infanterie and a Me-109E-3 in the reserve): the tray
//docked while deploying with the placed count, the unit picked, Upgrade on it, Done, and the unit list giving way to it
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { deployWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { trayOf } from "../src/view/deploy";
import { createStore } from "../src/view/store";
import { DeployButton, ReserveTray } from "../src/view/tray";
import { ShopWindow } from "../src/view/shopwindow";
import { UnitStrip } from "../src/view/unitstrip";

afterEach(cleanup);

test("The tray has the reserve's units with their sprites and the one picked, no count the old list didn't have (#348, #441)", () => {
	const w = deployWorld();
	expect(trayOf(w, 2)).toEqual({ units: [
		{ index: 1, name: "Infanterie", strength: 10, sprite: w.equipment[115].icon, picked: false },
		{ index: 2, name: "Me-109E-3", strength: 10, sprite: w.equipment[159].icon, picked: true }] });
});

function trayStore(w: World) {
	let now = w;
	const store = createStore({
		world: () => now,
		command: (cmd) => {
			const r = step(now, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			now = r.world;
			return { ok: true, result: null };
		},
		won: () => {},
	});
	store.refresh();
	render(<><UnitStrip store={store} /><ReserveTray store={store} /><DeployButton store={store} /><ShopWindow store={store} /></>);
	return store;
}

test("Deploying docks the tray with the card's ids; a card picks its unit; Upgrade opens the window on it; Done leaves the rest (#348)", async () => {
	const store = trayStore(deployWorld());
	await act(() => { store.toggleList(); store.startDeployment(); });
	const tray = screen.getByRole("region", { name: "Reserve" });
	expect([tray.id, tray.className]).toEqual(["container-unitlist", "pm-panel pm-unitlist pm-deploy"]);
	expect(["hscroll-unitlist", "unitlist"].map((id) => tray.querySelector("#" + id) !== null)).toEqual([true, true]);
	expect(tray.textContent).not.toContain("placed");
	//the unit list gives way to the tray while deploying
	expect(screen.queryByRole("region", { name: "Your units" })).toBeNull();
	await act(() => { fireEvent.click(within(tray).getByRole("button", { name: "Me-109E-3, strength 10" })); });
	expect(store.deploying.value).toBe(2);
	await act(() => { fireEvent.click(within(tray).getByRole("button", { name: "Upgrade" })); });
	expect(store.shop.value!.target).toBe("Me-109E-3");
	expect(store.shop.value!.sell!.command).toEqual({ type: "sell", index: 2 });
	//(closing the window closes the unit list with it, #512: opened again)
	await act(() => { store.closeShop(); store.toggleList(); });
	await act(() => { fireEvent.click(within(tray).getByRole("button", { name: "Done" })); });
	expect([store.deploying.value, screen.queryByRole("region", { name: "Reserve" })]).toEqual([null, null]);
	expect(screen.getByRole("region", { name: "Your units" })).toBeTruthy();
	//Deploy waits over End turn with the count on its plate; a click picks the first unit again
	const deploy = screen.getByRole("button", { name: "Deploy · 2 in reserve" });
	expect([deploy.textContent, deploy.title]).toEqual(["Deploy2", "2 units in reserve"]);
	await act(() => { fireEvent.click(deploy); });
	expect([store.deploying.value, screen.queryByRole("button", { name: "Deploy · 2 in reserve" })]).toEqual([1, null]);
});

test("While deploying the window lists the reserve; a unit picked there is the one to upgrade and to deploy (#512)", async () => {
	const store = trayStore(deployWorld());
	await act(() => store.startDeployment());
	await act(() => { fireEvent.click(within(screen.getByRole("region", { name: "Reserve" })).getByRole("button", { name: "Upgrade" })); });
	const win = document.getElementById("equipment")!, list = within(win).getByRole("region", { name: "Your reserve" });
	expect(store.shop.value!.target).toBe("Infanterie");
	expect(within(list).getByRole("button", { name: "Infanterie, strength 10" }).getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.click(within(list).getByRole("button", { name: "Me-109E-3, strength 10" })); });
	expect([store.shop.value!.target, store.shop.value!.upgrade!.refusal, store.deploying.value]).toEqual(["Me-109E-3", "Nothing to upgrade", 2]);
	expect(win.querySelector("#eqActionsContainer")!.textContent).toContain("Upgrading Me-109E-3");
	expect(within(win).getByRole("tab", { name: "Fighter" }).getAttribute("aria-selected")).toBe("true");
});
