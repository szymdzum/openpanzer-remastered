//The view's derived objects kept while their content is the same (src/view/stable.ts, review A6): a step gives a new world,
//and a card, a context menu or a report built from it the same as before doesn't render again
import { afterEach, expect, test } from "vitest";
import { options, type VNode } from "preact";
import { act, cleanup, render } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { App } from "../src/view/app";
import { createStore } from "../src/view/store/store";
import { UnitInfoPanel } from "../src/view/hud/infopanel";
import { UnitContextMenu } from "../src/view/components/contextmenu";
import { TurnBanner } from "../src/view/hud/turnbanner";
import { sameData, stableComputed } from "../src/view/stable";
import { signal } from "@preact/signals";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

test("Data is the same when its primitives, arrays and plain objects are; a class's object only when it is the same one", () => {
	expect(sameData({ a: [1, { b: "x" }], c: null }, { a: [1, { b: "x" }], c: null })).toBe(true);
	expect(sameData({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false);
	expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
	expect(sameData({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(false);
	expect(sameData([1], { 0: 1, length: 1 })).toBe(false);
	expect(sameData({ 0: 1, length: 1 }, [1])).toBe(false);
	expect(sameData(NaN, NaN)).toBe(true);
	expect(sameData(new Date(1), new Date(1))).toBe(false);
	const f = () => 1;
	expect([sameData(f, f), sameData(f, () => 1), sameData(1, "1")]).toEqual([true, false, false]);
	const n = signal(1), view = stableComputed(() => ({ odd: n.value % 2 === 1 }));
	const first = view.value;
	n.value = 3;
	expect(view.value).toBe(first);
	n.value = 2;
	expect(view.value).toEqual({ odd: false });
});

//Counts the renders of the components given while it runs
function renders<T>(components: ((...a: never[]) => unknown)[], run: () => Promise<T>): Promise<Map<unknown, number>> {
	const counts = new Map<unknown, number>(components.map((c) => [c, 0]));
	//(Preact's hook after each component rendered, chained to the one before)
	const before = Reflect.get(options, "diffed") as ((v: VNode) => void) | undefined;
	options.diffed = (v: VNode) => {
		if (counts.has(v.type)) counts.set(v.type, counts.get(v.type)! + 1);
		if (before) before(v);
	};
	return run().then(() => counts, () => counts).finally(() => { options.diffed = before; });
}

test("A step that doesn't touch the selected unit renders neither its card nor its context menu again; a world the same as data leaves the turn report (A6)", async () => {
	//Two German tanks, the first selected, the second moved by the step
	let w: World = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 4, strength: 6, ammo: 2 },
		{ eqid: 140, owner: 0, row: 7, col: 7 }, { eqid: 140, owner: 1, row: 1, col: 9 }] }, undefined, { spotSide: 0 });
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	store.pickUnit(0);
	store.showReport(true);
	render(<App store={store} />);
	expect(document.getElementById("unit-info")).not.toBeNull();
	expect(document.getElementById("unit-context")).not.toBeNull();
	const card = store.card.value, context = store.context.value;
	expect([card, context, store.report.value].includes(null)).toBe(false);
	const moved = step(w, { type: "move", unit: 1, to: { row: 7, col: 8 } });
	if (!moved.ok) throw new Error("the move refused");
	const counted = await renders([UnitInfoPanel, UnitContextMenu, TurnBanner], async () => {
		await act(() => {
			w = moved.world;
			store.refresh();
		});
	});
	expect([store.card.value, store.context.value]).toEqual([card, context]);
	expect([store.card.value === card, store.context.value === context]).toEqual([true, true]);
	expect([counted.get(UnitInfoPanel), counted.get(UnitContextMenu)]).toEqual([0, 0]);
	//(a world the same as data, as a step that changed nothing the side sees: the report stays too)
	const shown = store.report.value;
	const again = await renders([UnitInfoPanel, UnitContextMenu, TurnBanner], async () => {
		await act(() => {
			w = { ...w };
			store.refresh();
		});
	});
	expect(store.report.value).toBe(shown);
	expect([again.get(UnitInfoPanel), again.get(UnitContextMenu), again.get(TurnBanner)]).toEqual([0, 0, 0]);
	//A step that changes the selected unit renders its card again
	const supplied = step(w, { type: "resupply", unit: 0 });
	if (!supplied.ok) throw new Error("the supply refused");
	const changed = await renders([UnitInfoPanel], async () => {
		await act(() => {
			w = supplied.world;
			store.refresh();
		});
	});
	expect(store.card.value === card).toBe(false);
	expect(changed.get(UnitInfoPanel)).toBeGreaterThan(0);
});
