//The attack preview in the page (#347, AttackPreview and CombatOdds), in jsdom, on a store over a hand-built world whose
//host plays the person's commands on the core: the odds card after the pointer rests 400 ms on a target or Shift is
//held, closed by moving off it or Escape; on touch the first tap opens it and the second attacks
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import type { Command } from "../src/commands";
import { terrainType } from "../src/prototypes";
import { hexCentre } from "../src/view/hexgrid";
import { MapView } from "../src/view/map";
import { createStore, type StoreHost } from "../src/view/store";

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(new Proxy({}, { get: (_t, name) =>
		name === "measureText" ? () => ({ width: 10 }) : () => {}, set: () => true }) as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const PZ_IIA = 140, PIECHOTA = 270, WZ97 = 264;

//The rugged defense of the CombatOdds card: the Pz IIA (0) next to the entrenched 38 Piechota (1) in a city, a 75mm (2)
//behind it; the Pz IIA selected
function mapOf() {
	let w: World = handWorld({ rows: 10, cols: 10, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 },
		{ eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4, experience: 200 }, { eqid: WZ97, owner: 1, row: 5, col: 5 }],
	terrain: (r, c) => r === 4 && c === 4 ? terrainType.City : terrainType.Clear }, undefined, { spotSide: 0 });
	const sent: Command[] = [];
	const host: StoreHost = {
		world: () => w,
		command: (cmd) => {
			sent.push(cmd);
			const r = step(w, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			w = r.world;
			return { ok: true, result: null };
		},
		won: () => {},
	};
	const store = createStore(host);
	store.refresh();
	store.selected.value = 0;
	render(<MapView store={store} />);
	return { store, sent };
}

//The pointer on a hex's centre; a pointer event with its pointer type
function pointer(type: string, row: number, col: number, init: PointerEventInit = {}) {
	const c = hexCentre(row, col), s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	const at = { clientX: c.x - s.scrollLeft, clientY: c.y - s.scrollTop, bubbles: true, ...init };
	s.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, at) : new MouseEvent(type, at));
}

const card = () => document.querySelector<HTMLElement>(".pm-odds");

test("The odds card opens once the pointer rests 400 ms on a target, says what the estimate says, and closes off it or with Escape", async () => {
	const { store, sent } = mapOf();
	await act(() => pointer("mousemove", 4, 4));
	expect(store.glance.value).toMatchObject({ yours: { loss: 6 }, theirs: { loss: 0 }, glyph: "rugged" });
	expect(document.querySelector(".pm-mapview")!.classList.contains("aiming")).toBe(true);
	expect(card()).toBeNull();
	await act(() => { vi.advanceTimersByTime(400); });
	const c = card()!;
	expect([c.id, c.className, c.getAttribute("role")]).toEqual(["gameToolTip", "pm-panel pm-odds", "tooltip"]);
	expect(c.querySelector(".head")!.textContent).toBe("Attack 38 Piechota");
	expect([...c.querySelectorAll(".vs .pm-data")].map((d) => d.textContent)).toEqual(["10 → 4", "9 → 9"]);
	expect(c.querySelector(".verdict")!.className).toBe("verdict bad");
	expect(c.querySelector(".why .key")!.textContent).toBe("Your defence drops to 0 and your attack is halved");
	expect(c.querySelector(".pm-strength .sup")).not.toBeNull();
	expect(c.querySelector(".advice")).not.toBeNull();
	expect(c.querySelector(".commit")!.textContent).toBe("Click to attack anyway · Esc to cancel");
	//(the hex tooltip doesn't open over it)
	await act(() => { vi.advanceTimersByTime(400); });
	expect(store.hexTip.value).toBeNull();
	await act(() => store.shortcut({ menu: "escape" }));
	expect([card(), store.selected.value]).toEqual([null, 0]);
	//Shift opens it at once; the pointer moving off the target closes it
	await act(() => { dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" })); });
	expect(card()).not.toBeNull();
	await act(() => pointer("mousemove", 6, 6));
	expect([card(), store.glance.value]).toEqual([null, null]);
	//(on a hex that isn't a target, nothing to open)
	await act(() => store.showOdds({ row: 6, col: 6 }));
	expect(store.odds.value).toBeNull();
	expect(sent).toEqual([]);
});

test("On touch the first tap on a target opens its card and the second attacks; a tap elsewhere closes it (AttackPreview)", async () => {
	const { store, sent } = mapOf();
	const tap = async (row: number, col: number) => {
		await act(() => pointer("pointerdown", row, col, { pointerType: "touch" }));
		await act(() => pointer("click", row, col));
	};
	await tap(4, 4);
	expect(card()!.querySelector(".commit")!.textContent).toBe("Tap again to attack · tap elsewhere to cancel");
	expect(sent).toEqual([]);
	await tap(4, 3);
	expect([card(), store.selected.value, sent]).toEqual([null, 0, []]);
	await tap(4, 4);
	await tap(4, 4);
	expect(sent).toEqual([{ type: "attack", unit: 0, target: 1 }]);
	expect(card()).toBeNull();
});

test("A mouse click on a target attacks at once, as before", async () => {
	const { sent } = mapOf();
	await act(() => pointer("pointerdown", 4, 4, { pointerType: "mouse" }));
	await act(() => pointer("click", 4, 4));
	expect(sent).toEqual([{ type: "attack", unit: 0, target: 1 }]);
});
