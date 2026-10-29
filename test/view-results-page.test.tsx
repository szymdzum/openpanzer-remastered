//A combat's results in the page (#347, CombatResults), in jsdom, on a store over a hand-built world whose host plays the
//person's commands on the core: the chips and the stamp over the map after an attack, faded after 2.5 s (1 s with quick
//animations), the same news in the status line until the next command; a program's step tells its own. And the
//page's sounds the step's beats play (src/view/player.ts)
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { uiSettings } from "../src/app/settings";
import { terrainType } from "../src/core/tables";
import { MapView } from "../src/view/map/map";
import { pageSounds } from "../src/view/player";
import { StatusBar } from "../src/view/hud/statusbar";
import { createStore, type StoreHost } from "../src/view/store/store";

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(new Proxy({}, { get: (_t, name) =>
		name === "measureText" ? () => ({ width: 10 }) : () => {}, set: () => true }) as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
	uiSettings.quickAnimation = false;
});

const PZ_IIA = 140, PIECHOTA = 270, WZ97 = 264;

//The CombatOdds card's rugged defense, the Pz IIA (0) selected; the game's dice at seed 1
function pageOf() {
	let w: World = handWorld({ rows: 10, cols: 10, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 },
		{ eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4, experience: 200 }, { eqid: WZ97, owner: 1, row: 5, col: 5 }],
	terrain: (r, c) => r === 4 && c === 4 ? terrainType.City : terrainType.Clear }, undefined, { spotSide: 0 });
	w = { ...w, state: { ...w.state, rng: { game: 1, ai: 7 } } };
	const host: StoreHost = {
		world: () => w,
		command: (cmd) => {
			const r = step(w, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			w = r.world;
			return { ok: true, result: { events: r.events } } as ReturnType<StoreHost["command"]>;
		},
		won: () => {},
		cosmetic: () => 0.5,
	};
	const store = createStore(host);
	store.refresh();
	store.pickUnit(0);
	render(<><MapView store={store} /><StatusBar store={store} /></>);
	return store;
}

const line = () => document.querySelector(".msg")!.textContent;

//The step's beats played to their end (src/view/player.ts): the map takes no click meanwhile, the results come after
async function beatsPlayed(store: ReturnType<typeof pageOf>) {
	for (let i = 0; i < 400 && store.results.value === null; i++) await act(() => { vi.advanceTimersByTime(50); });
}

test("After an attack its chips and stamp stand over the map, fade after 2.5 s and go; the status line keeps the news", async () => {
	const store = pageOf();
	await act(() => { store.clickHex({ row: 4, col: 4 }); });
	expect(document.querySelector(".pm-results")).toBeNull();
	await beatsPlayed(store);
	const marks = document.querySelector(".pm-results")!;
	expect(marks.querySelector(".pm-event")!.textContent).toBe("Rugged defense");
	expect(marks.querySelector(".pm-event")!.className).toBe("pm-event bad");
	expect(marks.querySelectorAll(".pm-hit")).toHaveLength(2);
	expect(line()).toMatch(/^Pz IIA hit a rugged defense in the city · −\d+/);
	await act(() => { vi.advanceTimersByTime(2500); });
	expect(document.querySelector(".pm-results")!.className).toBe("pm-results fading");
	await act(() => { vi.advanceTimersByTime(300); });
	expect(document.querySelector(".pm-results")).toBeNull();
	expect(line()).toMatch(/^Pz IIA hit a rugged defense/);
	//the next command clears the line
	await act(() => { store.dispatch({ type: "move", unit: 0, to: { row: 3, col: 2 } }); });
	expect(line()).not.toMatch(/rugged/);
});

test("With quick animations the results stay 1 s; a program's step shown tells its results after its beats, then goes on", async () => {
	uiSettings.quickAnimation = true;
	const store = pageOf();
	const before = store.world.value;
	await act(() => { store.clickHex({ row: 4, col: 4 }); });
	await beatsPlayed(store);
	await act(() => { vi.advanceTimersByTime(1000); });
	expect(document.querySelector(".pm-results")!.className).toBe("pm-results fading");
	await act(() => { vi.advanceTimersByTime(300); });
	expect(document.querySelector(".pm-results")).toBeNull();
	//(told again from the same step's events, as a program's step is told after it was played)
	const events = step({ ...before!, state: { ...before!.state, rng: { game: 1, ai: 7 } } }, { type: "attack", unit: 0, target: 1 });
	let next = 0;
	await act(() => store.showStep(before, "events" in events ? events.events : [], () => next++));
	expect(next).toBe(0);
	await beatsPlayed(store);
	expect([document.querySelector(".pm-results .pm-event")!.textContent, next]).toEqual(["Rugged defense", 1]);
	//(nothing to play without the world before: what follows at once)
	await act(() => store.showStep(null, [], () => next++));
	expect(next).toBe(2);
});

test("The page's sounds: each file loaded once and played from its start; none while the unit sounds are muted", () => {
	const played: string[] = [];
	vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function(this: HTMLMediaElement) {
		played.push(this.src);
		return Promise.reject(new Error("not allowed before the person touched the page"));
	});
	const sound = pageSounds();
	sound("resources/sounds/fire/gun.wav");
	sound("resources/sounds/fire/gun.wav");
	expect(played).toHaveLength(2);
	expect(played[0]).toMatch(/resources\/sounds\/fire\/gun\.wav$/);
	uiSettings.muteUnitSounds = true;
	sound("resources/sounds/fire/gun.wav");
	uiSettings.muteUnitSounds = false;
	expect(played).toHaveLength(2);
});
