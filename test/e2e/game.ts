//The UI's end-to-end test (#351): one short campaign game played in headless Chrome on the dev server, through the
//UI's element ids and keys, as a person plays it. The start menu, a new campaign (Arctic Storms: its first scenario
//goes on to the second whatever its outcome), a unit bought in the equipment window and deployed, one upgraded through
//its unit list, a move, the unit list and the unit card, End turn with the AI's turn played out, the turn report and the
//dossier, an attack and its result, a save to a file and its load back (the same game after it, by toData:
//src/legacy/state.ts), then the turns ended until the scenario's end, its message, and the campaign's next scenario starting.
//
//It fails on a console error, an uncaught error or an unhandled rejection in the page, or a step that doesn't show what
//it should. Every random stream is seeded (src/core/random.ts), so it plays the same game every time. The page knows nothing of
//the test: the test reads the page's own modules (the dev server serves each once) to know where the units are on the
//canvas, which hexes a click can take, and to compare the saved game.
//
//	npm run e2e                    Chrome from CHROME (a path to its executable), else the installed Google Chrome; a
//	                               failed step leaves the page's screenshot in harness/out/e2e-failure.png
//	E2E_QUERY=theme=paper npm run e2e   the page's query, none by default
import { type Browser, chromium, type Locator, type Page } from "playwright-core";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Position, World } from "../../src/core/types";

const QUERY = process.env.E2E_QUERY ?? "";
const SEED = 351;
//The campaign played, by its title in the list, its two first scenarios, and the most turns the first may last
const CAMPAIGN = "Arctic Storms";
const FIRST = "The Shots of Mainila", SECOND = "Tolvajarvi";
const MAX_TURNS = 20;
//How long a step may take to show what it should, an AI's turn longer
const SHOWN_MS = 15_000, AI_TURN_MS = 120_000;
const FAILURE = "harness/out/e2e-failure.png";

//What the test reads in the page: the page's own modules, put on window.e2e once the game has loaded
type Probe = {
	game: typeof import("../../src/app/running").game;
	toData: typeof import("../../src/legacy/state").toData;
	Rng: typeof import("../../src/core/random").Rng;
	uiSettings: typeof import("../../src/app/settings").uiSettings;
	hexCentre: typeof import("../../src/view/map/hexgrid").hexCentre;
	selectionOf: typeof import("../../src/view/map/mapview").selectionOf;
	deploymentOf: typeof import("../../src/view/map/deploy").deploymentOf;
	reserveOf: typeof import("../../src/view/map/deploy").reserveOf;
	unitData: typeof import("../../src/core/world").unitData;
	isAir: typeof import("../../src/core/units").isAir;
};
type Probed = { e2e: Probe };
const MODULES = ["/src/app/running.ts", "/src/legacy/state.ts", "/src/core/random.ts", "/src/app/settings.ts", "/src/view/map/hexgrid.ts", "/src/view/map/mapview.ts",
	"/src/view/map/deploy.ts", "/src/core/world.ts", "/src/core/units.ts"];

const errors: string[] = [];
let page: Page;
let downloads = "";

//An element of the UI (its root holds every window of it)
const ui = (selector: string, options?: { hasText?: string | RegExp }) => page.locator(".pm-screen " + selector, options);

async function shown(what: Locator, timeout = SHOWN_MS) {
	await what.first().waitFor({ state: "visible", timeout });
}

async function gone(what: Locator, timeout = SHOWN_MS) {
	await what.first().waitFor({ state: "hidden", timeout });
}

function check(ok: boolean, what: string) {
	if (!ok) throw new Error(what);
}

//A step of the game: its name and time logged, the page's errors checked after it
async function step(name: string, run: () => Promise<void>) {
	const t = Date.now();
	try {
		await run();
	} catch (e) {
		throw new Error(`step "${name}": ${e instanceof Error ? e.message : JSON.stringify(e)}`);
	}
	if (errors.length > 0) throw new Error(`step "${name}": the page logged errors:\n${errors.join("\n")}`);
	console.log(`ok ${((Date.now() - t) / 1000).toFixed(1).padStart(5)}s  ${name}`);
}

//What read says of the world the game plays now (as the screen reads it, src/app/host.ts) and of the page's modules, with
//arg. read runs in the page: it sees nothing of this file
async function world<T, A = null>(read: (on: [World, Probe], arg: A) => T, arg: A = null as A): Promise<T> {
	const on = await page.evaluateHandle(() => {
		const p = (window as unknown as Probed).e2e, w = p.game.host.world();
		if (w === null) throw new Error("no game is playing");
		return [w, p] as [World, Probe];
	});
	try {
		return await on.evaluate(read as (on: [World, Probe], arg: unknown) => T, arg as unknown);
	} finally {
		await on.dispose();
	}
}

//The game as a saved game keeps it
const saved = () => page.evaluate(() => {
	const p = (window as unknown as Probed).e2e;
	return JSON.stringify(p.toData(p.game.scenario, p.game));
});

//A click on a hex of the map: the map scrolled to put it in the middle, as a person scrolls, then the click where the map
//draws it, which must be the map's and not a window's over it
async function clickHex(at: Position) {
	const point = await page.evaluate(({ row, col }) => {
		const p = (window as unknown as Probed).e2e, scale = p.uiSettings.zoomLevel;
		const s = document.querySelector<HTMLElement>(".pm-screen .pm-mapview-scroll")!;
		const area = s.querySelector<HTMLElement>(".pm-mapview-area")!, dock = document.querySelector<HTMLElement>(".pm-screen .pm-dock")!;
		const c = p.hexCentre(row, col);
		s.scrollLeft = c.x * scale - s.clientWidth / 2;
		s.scrollTop = c.y * scale - s.clientHeight / 2;
		//(the map's size; one smaller than the screen is centred in it: src/view/map/map.tsx origin)
		const width = area.offsetWidth, height = area.offsetHeight - (dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 0));
		const box = s.getBoundingClientRect();
		const x = box.left + c.x * scale - (s.scrollLeft - Math.max(0, (s.clientWidth - width) / 2));
		const y = box.top + c.y * scale - (s.scrollTop - Math.max(0, (s.clientHeight - height) / 2));
		const top = document.elementFromPoint(x, y);
		return { x, y, map: top !== null && s.contains(top), over: top === null ? "nothing" : top.outerHTML.slice(0, 80) };
	}, at);
	check(point.map, `hex ${at.row},${at.col} is under ${point.over}, not the map`);
	await page.mouse.move(point.x, point.y);
	await page.mouse.click(point.x, point.y);
}

//The screen has shown the last step: the map takes no click while its beats still play (the screen's showingStep, #459)
async function stepShown() {
	await page.waitForFunction(() => !(window as unknown as Probed).e2e.game.host.showingStep(), null, { timeout: SHOWN_MS, polling: 100 });
}

//One click on a hex once the last step is shown, which must then do what it should (done): a click the map drops fails
//here, it isn't clicked again
async function clickHexOnce(at: Position, done: () => Promise<boolean>, what: string) {
	await stepShown();
	await clickHex(at);
	for (const end = Date.now() + SHOWN_MS; !(await done()); await page.waitForTimeout(100))
		check(Date.now() < end, what);
}

//A unit of the person's that the click picks and where to: the first by id whose hexes, its own and where, sit away from
//the map's edges (the map can't scroll an edge to the middle, where nothing covers it), a unit on the deployment zone
//first, which leaves its hex to the reserve. where: its move area or its targets, from the view model (src/view/map/mapview.ts
//selectionOf)
type Order = { unit: number, name: string, air: boolean, from: Position, to: Position };
const orderOf = (kind: "area" | "targets") => world(([w, p], k) => {
	const inside = (h: Position) => h.row >= 3 && h.row < w.state.map.rows - 3 && h.col >= 3 && h.col < w.state.map.cols - 3;
	const zone = p.reserveOf(w).slice(0, 1).flatMap((r) => p.deploymentOf(w, r.index)!.zone);
	const onZone = (h: Position) => zone.some((z) => z.row === h.row && z.col === h.col);
	const units = w.state.units.filter((u) => u.row >= 0 && u.owner === w.state.turn.currentPlayer && inside(u));
	const orders = [...units.filter(onZone), ...units.filter((x) => !onZone(x))].map((u) => ({ u, to: p.selectionOf(w, u.id)?.[k].find(inside) }));
	const o = orders.find((x) => x.to !== undefined);
	return o === undefined ? null
		: { unit: o.u.id, name: p.unitData(w, o.u).name, air: p.isAir(w, o.u), from: { row: o.u.row, col: o.u.col }, to: o.to! };
}, kind);

//The unit at a hex
const unitAt = (at: Position) => world(([w], h) => {
	const u = w.state.units.find((x) => x.row === h.row && x.col === h.col);
	return u === undefined ? null : u.id;
}, at);

//A unit selected by a click on its hex, on its layer (A switches the air layer on and off): the unit card shows its name,
//and the map keeps its width as the dock grows under it (#500)
async function select(o: Order) {
	if (await ui("#air").getAttribute("aria-pressed") !== String(o.air)) await page.keyboard.press("KeyA");
	const card = ui("#unit-info #uName", { hasText: o.name });
	const mapWidth = () => ui(".pm-mapview-scroll").evaluate((s) => s.clientWidth);
	const before = await mapWidth();
	await clickHexOnce(o.from, () => card.isVisible(), `the unit card doesn't show ${o.name}`);
	const after = await mapWidth();
	check(after === before, `selecting ${o.name} narrowed the map from ${before} to ${after} px`);
}

//A move of the first unit that can make one, played out
async function move() {
	const o = await orderOf("area");
	check(o !== null, "no unit of the person's can move");
	await select(o!);
	await clickHexOnce(o!.to, async () => await unitAt(o!.to) === o!.unit, `${o!.name} didn't move to ${o!.to.row},${o!.to.col}`);
}

//The turn number and the person's turn on the status bar
const turnOf = () => world(([w]) => w.state.turn.turn);

//Ends the person's turn as a person does: End turn, and End turn again when it asks about the units that can still act;
//then waits for the AI's turn to be played out, or for the message that ends the scenario
async function endTurn() {
	await stepShown();
	const before = await world(([w]) => w.state.turn.turn * 4 + w.state.turn.currentPlayer);
	await ui("#endturn button:not([aria-disabled=true])").click();
	//(the question about the units that can still act, or the turn gone on without it, or the scenario's end)
	await page.waitForFunction((at) => {
		const w = (window as unknown as Probed).e2e.game.host.world();
		return document.querySelector(".pm-screen #endturn-question") !== null || document.querySelector(".pm-screen #ui-message") !== null
			|| w === null || w.state.turn.turn * 4 + w.state.turn.currentPlayer !== at;
	}, before, { timeout: AI_TURN_MS, polling: 100 });
	const question = ui("#endturn-question");
	if (await question.isVisible()) await question.locator("button", { hasText: "End turn" }).click();
	await page.waitForFunction(() => document.querySelector(".pm-screen #endturn button:not([aria-disabled=true])") !== null
		|| document.querySelector(".pm-screen #ui-message") !== null, null, { timeout: AI_TURN_MS, polling: 100 });
}

//The focused element's id, or its tag when it has none
const focused = () => page.evaluate(() => document.activeElement === null ? "none" : document.activeElement.id || document.activeElement.tagName);

//Tab, then Shift+Tab, round a window's controls with the browser's own keys (#497: jsdom's fake Tab passed a trap the
//real one walked out of): the focus stays in the window and comes back to where it started
async function tabsRound(dialog: string) {
	for (const key of ["Tab", "Shift+Tab"]) {
		const start = await page.evaluateHandle(() => document.activeElement!);
		check(await start.evaluate((e, w) => document.querySelector(".pm-screen " + w)!.contains(e), dialog), `${dialog} hasn't the focus`);
		for (let n = 0; ; n++) {
			check(n < 200, `${key} doesn't come back round ${dialog}`);
			await page.keyboard.press(key);
			const at = await start.evaluate((e, w) => ({ inside: document.querySelector(".pm-screen " + w)!.contains(document.activeElement),
				back: document.activeElement === e }), dialog);
			check(at.inside, `${key} left ${dialog} for ${await focused()}`);
			if (at.back) break;
		}
		await start.dispose();
	}
}

async function play() {
	await step("the start menu", async () => {
		await page.goto("/index.html" + (QUERY === "" ? "" : "?" + QUERY));
		await shown(ui("#smMain"));
		check(await ui("#smButtons button").count() === 4, "the start menu hasn't its four buttons");
		await page.evaluate(async (files) => {
			const [session, state, rng, settings, hexgrid, mapview, deploy, coreWorld, units] =
				await Promise.all(files.map((f) => import(f) as Promise<Record<string, unknown>>));
			(window as unknown as Probed).e2e = { game: session.game, toData: state.toData, Rng: rng.Rng, uiSettings: settings.uiSettings,
				hexCentre: hexgrid.hexCentre, selectionOf: mapview.selectionOf, deploymentOf: deploy.deploymentOf, reserveOf: deploy.reserveOf,
				unitData: coreWorld.unitData, isAir: units.isAir } as Probe;
		}, MODULES);
	});

	await step("a new campaign, its briefing", async () => {
		await ui("#newgame").click();
		await shown(ui("#smNewGame"));
		await ui("#newcampaign").click();
		await shown(ui("#smCamp"));
		await ui("#smCampSel label", { hasText: CAMPAIGN }).click();
		await shown(ui("#smCamp h2", { hasText: CAMPAIGN }));
		//(every stream seeded: the dice, the AI's, the sprites' and the sounds')
		await tabsRound("#smCamp");
		await page.evaluate((seed) => { (window as unknown as Probed).e2e.Rng.seed(seed); }, SEED);
		await ui("#smCPlayBut").click();
		await shown(ui("#ui-message #title", { hasText: new RegExp(FIRST, "i") }));
		await gone(ui("#startmenu"));
		//(the briefing takes the focus, though its window stayed open under the start menu: #497)
		check(await focused() === "uiokbut", `the briefing hasn't the focus, ${await focused()} has`);
		await ui("#uiokbut").click();
		await gone(ui("#ui-message"));
		check(await world(([w]) => w.data.name) === FIRST, "another scenario started");
		check((await ui("#statusbar").textContent())!.includes("1/"), "the status bar shows no first turn");
	});

	const reserve = () => world(([w, p]) => p.reserveOf(w).length);
	const prestige = () => world(([w]) => w.state.players[w.state.turn.currentPlayer].prestige);

	await step("a unit bought in the equipment window", async () => {
		const before = { reserve: await reserve(), prestige: await prestige() };
		await page.keyboard.press("KeyB");
		await shown(ui("#equipment"));
		await tabsRound("#equipment");
		await ui("#eqUnitList button").first().click();
		await ui("#eqNewBut:not([aria-disabled=true])").click();
		check(await reserve() === before.reserve + 1, "no unit came into the reserve");
		const left = await prestige();
		check(left < before.prestige, "the prestige didn't go down");
		await shown(ui("#currentPrestige", { hasText: String(left) }));
		await ui("#eqCloseBut").click();
		await gone(ui("#equipment"));
	});

	await step("a unit upgraded through the equipment window's unit list", async () => {
		await page.keyboard.press("KeyB");
		await shown(ui("#equipment"));
		await ui("#equipment section[aria-label='Your units'] button").first().click();
		await shown(ui("#eqActionsContainer", { hasText: "Upgrading" }));
		//(the first model it can be upgraded to)
		const upgrade = ui("#eqUpgradeBut:not([aria-disabled=true])"), models = ui("#eqUnitList button");
		for (let i = 0, n = await models.count(); i < n && !await upgrade.isVisible(); i++) await models.nth(i).click();
		const before = await prestige();
		await upgrade.click();
		check(await prestige() < before, "the prestige didn't go down");
		await ui("#eqCloseBut").click();
		await gone(ui("#equipment"));
	});

	await step("a move off the deployment zone", move);

	await step("the bought unit deployed", async () => {
		await ui(".pm-corner .pm-deploynow").click();
		await shown(ui("section.pm-deploy[aria-label=Reserve]"));
		const at = await world(([w, p]) => {
			const r = p.reserveOf(w)[0], d = p.deploymentOf(w, r.index)!;
			return d.free.find((h) => h.row >= 3 && h.row < w.state.map.rows - 3 && h.col >= 3 && h.col < w.state.map.cols - 3) ?? d.free[0];
		});
		await clickHexOnce(at, async () => await unitAt(at) !== null, `no unit came onto ${at.row},${at.col}`);
		check(await reserve() === 0, "the reserve isn't empty");
		await gone(ui("section.pm-deploy"));
	});

	await step("the unit list", async () => {
		await ui("#statusBarButton").click();
		const list = ui("section[aria-label='Your units']");
		await shown(list);
		const card = list.locator("#unitlist button").last();
		const name = (await card.locator(".nm").textContent())!;
		await card.click();
		await shown(ui("#unit-info #uName", { hasText: name }));
		await list.getByRole("button", { name: "Close" }).click();
		await gone(list);
	});

	await step("the unit card's line, open and folded", async () => {
		//hidden, the default: one line of its four gauges
		await shown(ui("#unit-info.line .ui-g", { hasText: "Strength" }));
		check(await ui("#unit-info.line .ui-g").count() === 4, "the unit card's line doesn't show four gauges");
		await ui("#unit-info").getByRole("button", { name: "More", exact: true }).click();
		//open: its four gauges with what they mean, what it hits and what it holds
		check(await ui("#unit-info.open .ui-c").count() === 4, "the open unit card doesn't show four gauges");
		await shown(ui("#unit-info.open section[aria-label='It hits']"));
		await shown(ui("#unit-info.open section[aria-label='It holds']"));
		await ui("#unit-info").getByRole("button", { name: "Less", exact: true }).click();
		await gone(ui("#unit-info.open"));
		await shown(ui("#unit-info.line"));
	});

	await step("End turn, the AI's turn played out", async () => {
		await endTurn();
		check(await turnOf() === 2, "the second turn didn't start");
		await shown(ui("#statusbar", { hasText: "2/" }));
		await shown(ui("section#combatLog"));
	});

	await step("the turn report's dossier", async () => {
		await ui("section#combatLog").getByRole("button", { name: "Dossier" }).click();
		await shown(ui("#dossier #dossierCasualties"));
		await ui("#dossierCloseBut").click();
		await gone(ui("#dossier"));
	});

	await step("an attack and its result", async () => {
		//(the enemy comes into reach after a turn or two)
		let o = await orderOf("targets");
		for (let turns = 0; o === null && turns < 4; turns++) {
			await endTurn();
			o = await orderOf("targets");
		}
		check(o !== null, "no unit of the person's has a target");
		const before = await world(([w], ids) => ids.map((id) => w.state.units[w.index.get(id)!].strength), [o!.unit]);
		await select(o!);
		await clickHexOnce(o!.to, () => world(([w], id) => w.state.units[w.index.get(id)!].hasFired, o!.unit), `${o!.name} didn't fire`);
		//(the combat's news on the status line, under the attacker's name, until the next command)
		await shown(ui("#statusbar .msg b", { hasText: o!.name }));
		const after = await world(([w], id) => { const i = w.index.get(id); return i === undefined ? 0 : w.state.units[i].strength; }, o!.unit);
		console.log(`   ${o!.name} attacked from ${o!.from.row},${o!.from.col} to ${o!.to.row},${o!.to.col}: strength ${before[0]} -> ${after}; `
			+ await ui("#statusbar .msg").innerText());
	});

	await step("a save to a file and its load back", async () => {
		await ui("#options").click();
		await shown(ui("#smMain"));
		await ui("#saveload").click();
		await shown(ui("#smState"));
		const game = await saved();
		const [download] = await Promise.all([page.waitForEvent("download"), ui("#disksave").click()]);
		const file = path.join(downloads, download.suggestedFilename());
		await download.saveAs(file);
		//(the browser writes the time's colons otherwise in the file's name)
		await shown(ui("#disksaveupdate", { hasText: FIRST }));
		await ui("#smStOkBut").click();
		await shown(ui("#smMain"));
		await page.keyboard.press("Escape");
		await gone(ui("#startmenu"));
		//(the game goes on, then the file takes it back)
		await move();
		check(await saved() !== game, "the move changed nothing of the game");
		await ui("#options").click();
		await ui("#saveload").click();
		await shown(ui("#smState"));
		await ui("#diskloadfile").setInputFiles(file);
		await gone(ui("#startmenu"));
		//(a game loaded opens on its briefing, as a scenario starts)
		await shown(ui("#ui-message #title", { hasText: new RegExp(FIRST, "i") }));
		check(await saved() === game, "the game loaded isn't the game saved");
		await ui("#uiokbut").click();
		await gone(ui("#ui-message"));
	});

	await step("the turns played to the scenario's end, its message", async () => {
		//(from here the map moves nothing: the AI's turns go faster, the sounds keep the pace)
		await page.emulateMedia({ reducedMotion: "reduce" });
		for (let turns = 0; !await ui("#ui-message").isVisible(); turns++) {
			check(turns < MAX_TURNS, `the scenario didn't end in ${MAX_TURNS} turns`);
			await endTurn();
		}
		const title = (await ui("#ui-message #title").textContent())!;
		check(/victory|defeat/i.test(title), `the message isn't the scenario's outcome: ${title}`);
		check((await ui("#ui-message #message").textContent())!.length > 0, "the outcome's message is empty");
		console.log(`   ${title} on turn ${await turnOf()}`);
	});

	await step("the campaign's next scenario", async () => {
		await ui("#uiokbut").click();
		await shown(ui("#ui-message #title", { hasText: new RegExp(SECOND, "i") }), AI_TURN_MS);
		check(await world(([w]) => w.data.name) === SECOND, "the next scenario isn't the campaign's");
		check(await turnOf() === 1, "the next scenario doesn't start on its first turn");
		await ui("#uiokbut").click();
		await gone(ui("#ui-message"));
		await shown(ui("#endturn button:not([aria-disabled=true])"));
		//(the same every time: the streams are seeded)
		console.log("   the game's fingerprint: " + createHash("sha256").update(await saved()).digest("hex").slice(0, 16));
	});
}

//The game played on the page; a step that fails leaves its screenshot
async function playOn(baseURL: string, browser: Browser) {
	const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, acceptDownloads: true });
	page = await context.newPage();
	page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
	page.on("pageerror", (e) => errors.push("uncaught: " + (e.stack || e.message)));
	try {
		await play();
	} catch (e) {
		fs.mkdirSync(path.dirname(FAILURE), { recursive: true });
		await page.screenshot({ path: FAILURE });
		throw e;
	}
}

async function main() {
	const started = Date.now();
	const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
	await server.listen();
	const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" });
	downloads = fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-e2e-"));
	try {
		await playOn(server.resolvedUrls!.local[0], browser);
		console.log(`The game played through in ${((Date.now() - started) / 1000).toFixed(0)}s`);
	} finally {
		await browser.close();
		await server.close();
		fs.rmSync(downloads, { recursive: true, force: true });
	}
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : e);
	process.exitCode = 1;
});
