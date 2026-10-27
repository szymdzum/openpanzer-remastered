//The attack cursor in the page (#441), in jsdom, on a store over a hand-built world whose host plays the person's
//commands on the core: the crosshair and the two losses over a target and nothing else, however long the pointer rests;
//a click or a tap attacks at once, as the old UI did. And the step's beats after a command: the map takes no click while
//they play, a moving unit glides off its hex
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/preact";
import { render as renderInto } from "preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import type { Command, Executed } from "../src/commands";
import { terrainType } from "../src/prototypes";
import { hexCentre } from "../src/view/hexgrid";
import { MapView } from "../src/view/map";
import { createStore, type StoreHost } from "../src/view/store";
import { newScreen } from "../src/view/screen";
import type { GameHost } from "../src/host";

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
			return { ok: true, result: { events: r.events } } as ReturnType<StoreHost["command"]>;
		},
		won: () => {},
	};
	const store = createStore(host);
	store.refresh();
	store.pickUnit(0);
	render(<MapView store={store} />);
	return { store, sent };
}

//The pointer on a hex's centre; a pointer event with its pointer type
function pointer(type: string, row: number, col: number, init: PointerEventInit = {}) {
	const c = hexCentre(row, col), s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	const at = { clientX: c.x - s.scrollLeft, clientY: c.y - s.scrollTop, bubbles: true, ...init };
	s.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, at) : new MouseEvent(type, at));
}

test("Over a target the crosshair shows the two losses and no odds card opens, however long the pointer rests or Shift is held (#441)", async () => {
	const { store, sent } = mapOf();
	await act(() => pointer("mousemove", 4, 4));
	expect(store.glance.value).toMatchObject({ at: { row: 4, col: 4 }, yours: { side: 0 }, theirs: { side: 1 } });
	expect(document.querySelector(".pm-mapview")!.classList.contains("aiming")).toBe(true);
	await act(() => { dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" })); });
	await act(() => { vi.advanceTimersByTime(2000); });
	expect(document.querySelector(".pm-odds")).toBeNull();
	await act(() => pointer("mousemove", 6, 6));
	expect(store.glance.value).toBeNull();
	expect(sent).toEqual([]);
});

test("A finger's tap on a target attacks at once, as the old UI did (#441)", async () => {
	const { sent } = mapOf();
	await act(() => pointer("pointerdown", 4, 4, { pointerType: "touch" }));
	await act(() => pointer("click", 4, 4));
	expect(sent).toEqual([{ type: "attack", unit: 0, target: 1 }]);
});

test("A mouse click on a target attacks at once, as before", async () => {
	const { store, sent } = mapOf();
	await act(() => pointer("pointerdown", 4, 4, { pointerType: "mouse" }));
	await act(() => pointer("click", 4, 4));
	expect(sent).toEqual([{ type: "attack", unit: 0, target: 1 }]);
	//(its shots play, the strips and sounds picked without a host's cosmetic stream; the map takes no click meanwhile)
	await act(() => { vi.advanceTimersByTime(1); });
	expect(store.motion.value).not.toBeNull();
	await act(() => pointer("click", 4, 2));
	expect(sent).toHaveLength(1);
	await act(() => { vi.advanceTimersByTime(10000); });
	expect(store.motion.value).toBeNull();
});

test("A move glides its unit along the path: the unit off its hex and its context menu gone until it arrives (#347)", async () => {
	const { store, sent } = mapOf();
	expect(store.context.value).not.toBeNull();
	await act(() => pointer("pointerdown", 6, 3, { pointerType: "mouse" }));
	await act(() => pointer("click", 6, 3));
	expect(sent).toEqual([{ type: "move", unit: 0, to: { row: 6, col: 3 } }]);
	await act(() => { vi.advanceTimersByTime(1); });
	expect([store.context.value, store.units.value.some((u) => u.id === 0), store.motion.value!.sprite !== null]).toEqual([null, false, true]);
	await act(() => { vi.advanceTimersByTime(5000); });
	expect([store.context.value !== null, store.units.value.some((u) => u.id === 0), store.motion.value]).toEqual([true, true, null]);
});

test("The screen says it is still showing a step while its beats play, and no longer once they end (#459)", async () => {
	let w: World = handWorld({ rows: 10, cols: 10, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 },
		{ eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9 }] }, undefined, { spotSide: 0 });
	const play = (cmd: Command) => {
		const r = step(w, cmd);
		if ("refusal" in r) return { ok: false, refusal: r.refusal };
		w = r.world;
		return { ok: true, result: { events: r.events } };
	};
	const host = { world: () => w, command: play, play, won: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	const root = document.createElement("div");
	document.body.append(root);
	let s: ReturnType<typeof newScreen>;
	//(the world read: units placed on the map, as at a turn's start)
	await act(() => { s = newScreen(host as unknown as GameHost, root); s.unitsPlaced(); });
	expect(s!.showingStep!()).toBe(false);
	//(a program's attack, played whole, then its shots shown: the harness and the command-line player wait on it)
	const shown = vi.fn();
	const attack = { type: "attack", unit: 0, target: 1 } as const;
	await act(() => { s.step(attack, play(attack) as Executed<"attack">, shown); });
	await act(() => { vi.advanceTimersByTime(1); });
	expect([s!.showingStep!(), shown.mock.calls.length]).toEqual([true, 0]);
	await act(() => { vi.advanceTimersByTime(10000); });
	expect([s!.showingStep!(), shown.mock.calls.length]).toEqual([false, 1]);
	//(the screen's root rendered outside the testing library's: unmounted here)
	renderInto(null, root);
	root.remove();
});

test("End turn, a unit key or a context menu button sent while the person's step is shown does nothing, as the old UI's End turn (#465)", async () => {
	const { store, sent } = mapOf();
	await act(() => pointer("pointerdown", 4, 4, { pointerType: "mouse" }));
	await act(() => pointer("click", 4, 4));
	await act(() => { vi.advanceTimersByTime(1); });
	expect(store.motion.value).not.toBeNull();
	//(the attacker's own keys and End turn, while its shots play: none reaches the host)
	await act(() => { store.dispatch({ type: "endTurn" }); });
	await act(() => { store.askEndTurn(); });
	await act(() => { store.shortcut({ unit: "resupply" }); });
	expect([sent.map((c) => c.type), store.asking.value]).toEqual([["attack"], null]);
	await act(() => { vi.advanceTimersByTime(10000); });
	expect(store.motion.value).toBeNull();
	//(once shown, the person plays on)
	await act(() => { store.dispatch({ type: "endTurn" }); });
	expect(sent.map((c) => c.type)).toEqual(["attack", "endTurn"]);
});
