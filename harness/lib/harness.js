// Page-side harness core shared by replay.js and the contracts' record.js (the shell scripts prepend it).
// Needs index.html?harness: lib/hooks.js holds back the async completions (Image, XMLHttpRequest).
//
// - virtual clock: the game's timers run from a queue the harness advances (runClock)
// - snapshot(): game state, toData's (src/state.ts) or built from plain properties, sorted keys
// - waitImages(): every async completion delivered
// - allShown(), settle(): the game has shown every step; the clock run until it has

// Virtual clock: the game's timers (its 1s turn loop, animations, the attack sequence) run
// from a queue in (time, creation order), advanced by the harness. Real timers would race.
if (!window.__clock) {
	const realSetTimeout = window.setTimeout.bind(window);
	window.clearInterval(game.loop); // the original's turn loop runs on a real timer, stop it before patching (the remaster has none, #375)
	// timers is a plain object, not a Map: the game replaces the global Map with its own class
	const clock = window.__clock = { now: 0, seq: 0, timers: {}, realSetTimeout };
	// Like a browser, an exception in a timer callback is reported and the game goes on
	const runTimer = (t) => {
		try { (typeof t.f === "function" ? t.f : new Function(t.f)).apply(window, t.a); }
		catch (e) {
			window.__replayErrors.push("[timer] Uncaught " + e.name + ": " + e.message
				+ (e.stack ? " @ " + e.stack.split("\n").slice(1, 4).map((l) => l.trim()).join(" < ") : ""));
		}
	};
	const add = (f, d, a, repeat) => {
		const id = ++clock.seq;
		clock.timers[id] = ({ at: clock.now + Math.max(0, +d || 0), f, a, id, repeat: repeat ? Math.max(1, +d || 0) : 0 });
		return id;
	};
	window.setTimeout = (f, d, ...a) => add(f, d, a, false);
	window.setInterval = (f, d, ...a) => add(f, d, a, true);
	window.clearTimeout = window.clearInterval = (id) => { delete clock.timers[id]; };
	// Runs the next due timer, false when none is pending
	clock.step = () => {
		let next = null;
		for (const k in clock.timers) { const t = clock.timers[k];
			if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t; }
		if (!next) return false;
		clock.now = next.at;
		if (next.repeat) next.at += next.repeat; else delete clock.timers[next.id];
		runTimer(next);
		return true;
	};
	// Runs the next timer due without moving time (zero delays), used while loading
	clock.stepDue = () => {
		let next = null;
		for (const k in clock.timers) { const t = clock.timers[k];
			if (t.at <= clock.now && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t; }
		if (!next) return false;
		if (next.repeat) next.at += next.repeat; else delete clock.timers[next.id];
		runTimer(next);
		return true;
	};
	// Pending timers other than the turn loop (clock.loop): one-shot timers and the intervals of
	// running animations (the old UI's on the reference, the UI's beats)
	clock.pendingTimeouts = () => Object.values(clock.timers).filter((t) => t.id !== clock.loop).length;
	// CSS animation ends are real time events (on the reference, the old UI's floating combat
	// numbers remove themselves on animationend, its end turn button re-arms on it): fire them from
	// the virtual clock instead, a fixed 1s after the listener is added. Chrome only fires
	// the unprefixed event when it has a listener, so the webkit one is dropped.
	const ANIMATION_END_MS = 1000;
	const realAdd = EventTarget.prototype.addEventListener, realRemove = EventTarget.prototype.removeEventListener;
	const pendingEnds = [];
	EventTarget.prototype.addEventListener = function(type, fn, opts) {
		if (type === "webkitAnimationEnd") return;
		if (type !== "animationend") return realAdd.call(this, type, fn, opts);
		const el = this;
		const entry = { el, fn, id: setTimeout(() => {
			pendingEnds.splice(pendingEnds.indexOf(entry), 1);
			fn.call(el, { type: "animationend", target: el, currentTarget: el });
		}, ANIMATION_END_MS) };
		pendingEnds.push(entry);
	};
	EventTarget.prototype.removeEventListener = function(type, fn, opts) {
		if (type === "webkitAnimationEnd") return;
		if (type !== "animationend") return realRemove.call(this, type, fn, opts);
		for (const e of pendingEnds.filter((x) => x.el === this && x.fn === fn)) {
			clearTimeout(e.id);
			pendingEnds.splice(pendingEnds.indexOf(e), 1);
		}
	};
	// Async completions (image loads, async XHRs, see lib/hooks.js) are delivered in creation
	// order: an operation only after every one before it. Virtual time doesn't move while any
	// is pending, or how many game ticks pass before they land would depend on the network.
	const ops = () => window.__harnessAsync || [];
	const started = () => true; // operations only exist once their request or src assignment is made
	clock.loading = () => ops().some((op) => !op.delivered && started(op) && !op.done);
	// Delivers the next completed operation in order, false when there is none to deliver
	clock.flushAsync = () => {
		for (const op of ops()) {
			if (op.delivered || !started(op)) continue;
			if (!op.done) return false; // an earlier one is still loading: wait for it
			op.delivered = true;
			const handlers = op.done === "load" ? ["onload", "onloadend"] : ["onerror", "onloadend"];
			let ran = false;
			for (const h of handlers) {
				const f = op.held[h];
				if (typeof f !== "function") continue;
				ran = true;
				try { f.call(op.target, { type: h.slice(2), target: op.target }); }
				catch (e) { window.__replayErrors.push("[timer] Uncaught " + e.name + ": " + e.message + " (" + op.kind + " " + h + ")"); }
			}
			if (ran) return true;
		}
		return false;
	};
	// window.onresize (set by the UI) repositions and redraws the canvases. The harness viewport
	// is fixed, but headless Chrome fires a resize when it applies it, at a moment that depends on
	// timing: a redraw at a random point of a step. Drop it, the UI has positioned the layers.
	window.onresize = null;
	// The turn loop on the virtual clock, ticking every second as the original's did: the game host's
	// processTurn (src/host.ts: the game goes on unless the screen still shows a step), the original's own
	// game.processTurn where there is no host
	clock.loop = setInterval(game.host ? () => game.host.processTurn() : game.processTurn, 1e3);
	uiSettings.quickAnimation = true;
	uiSettings.muteUnitSounds = true;
	uiSettings.hdGraphics = false; // the remaster's @2x images (the harness runs at 1x anyway)
	uiSettings.classicRules = true; // new games play the original's rules, which they're compared with (#53)
	window.__replayErrors = [];
	window.addEventListener("error", (e) => window.__replayErrors.push(String(e.message)
		+ (e.error && e.error.stack ? " @ " + e.error.stack.split("\n").slice(1, 4).map((l) => l.trim()).join(" < ") : "")));
	const realConsoleError = console.error;
	console.error = (...a) => { window.__replayErrors.push(a.map(String).join(" ")); realConsoleError(...a); };
}
const clock = window.__clock;

// Lets real async work (XHR, images) happen; virtual time doesn't move meanwhile
const sleep = (ms) => new Promise((r) => clock.realSetTimeout(r, ms));

// Advances virtual time until cond() or the step budget runs out
async function runClock(cond, maxSteps) {
	for (let n = 0; n < maxSteps; n++) {
		if (cond()) return true;
		game.uiMessageClicked = true;
		// The scripted tutorial waits for its orders' OK button: the reference's tooltip (its old UI). The UI shows them as messages
		// one after the other, behind the briefing: each message clicked away, as uiMessageClicked says
		const tip = document.getElementById("gameToolTip"), ok = document.getElementById("gameToolTipOk");
		if (tip && ok && ok.onclick && tip.getAttribute("type") === "game" && tip.style.display !== "" && tip.style.display !== "none") ok.onclick();
		const message = document.querySelector(".pm-screen #ui-message #uiokbut");
		if (message) message.click();
		if (clock.flushAsync()) continue;
		if (clock.loading()) { for (let k = 0; k < 1000 && clock.stepDue(); k++); await sleep(5); continue; }
		if (!clock.step()) await sleep(5);
		else if (n % 500 === 0) await sleep(0);
	}
	return cond();
}

// Polls in real time, running only zero-delay timers: for real async work like loading
function waitFor(cond, ms) {
	return new Promise((resolve) => {
		const start = Date.now();
		(function poll() {
			let ok = false;
			for (let n = 0; n < 1000 && (clock.flushAsync() || clock.stepDue()); n++);
			try { ok = cond(); } catch (e) { ok = false; }
			if (ok) return resolve(true);
			if (Date.now() - start > ms) return resolve(false);
			clock.realSetTimeout(poll, 20);
		})();
	});
}

function mulberry32(a) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

function cyrb53(str) {
	let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---- Game state

// snapshot() is the game state as src/state.ts's toData reads it (#127), or the walk of the game
// objects' plain properties: window.__stateSnapshot ("toData", "toData-norng" or "walk", the
// default), which replay.sh sets on both pages from what the baseline has
// (harness/lib/reference.sh). The original game (reference/) and a baseline before #127 have no
// toData: both sides walk the objects then, so the two traces compare like with like. A baseline
// before #126 has toData with no random streams (rng null): toData-norng leaves them out on both.
function snapshot() {
	return window.__stateSnapshot === "toData" || window.__stateSnapshot === "toData-norng" ? stateSnapshot() : walkSnapshot();
}

// toData's { data, state }, and per hex what the state leaves out and the game derives from it
// (docs/STATE.md D10): the spotting and the zone of control of each side as the hex tells them. Not
// the selection (the selected unit, the move and attack marks): it is the old UI's, not the game's
// (D6, #377), and the canvas shows it. A scenario still loading has no state yet (its date is the
// clock's)
function stateSnapshot() {
	const s = game.scenario;
	if (!s.isLoaded) return JSON.stringify({ loading: s.file });
	const m = s.map, hexes = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			hexes.push("" + +h.isSpotted(0) + +h.isSpotted(1) + +h.isZOC(0) + +h.isZOC(1));
		}
	const saved = toData(s, game);
	if (window.__stateSnapshot === "toData-norng") saved.state.rng = null;
	return JSON.stringify({ ...saved, hexes: hexes.join(",") });
}

// The walk: built from plain properties so it doesn't depend on the modules under test more than
// necessary. Keys are sorted: a different property assignment order isn't a difference.
const ENTITIES = ["Unit", "Player", "Hex", "Map", "GameMap", "Scenario", "AI", "AIScripted", "Game", "Campaign", "Transport"];
// Classes the remaster renamed, under their original names so traces compare with the reference
const RENAMED = { GameMap: "Map" };
// (the selection is the UI's, #377: the original and a baseline before it keep it on the map and the hexes)
const SKIP_KEYS = { handler: 1, map: 1, currentUnit: 1, isMoveSel: 1, isAttackSel: 1 };

function entityRef(v) {
	const name = v.constructor && (RENAMED[v.constructor.name] || v.constructor.name);
	if (name === "Unit" || name === "Transport") return name + "#" + v.id;
	if (name === "Player") return "player#" + v.id;
	if (name === "Hex" && typeof v.getPos === "function") { const p = v.getPos(); return "hex#" + p.row + "," + p.col; }
	return name;
}

function plain(o, depth) {
	if (o === null || typeof o !== "object") {
		if (typeof o === "number" && !isFinite(o)) return String(o);
		return o;
	}
	if (typeof Node !== "undefined" && o instanceof Node) return "node";
	if (Array.isArray(o)) return depth > 4 ? "[…]" : o.map((x) => plain(x, depth + 1));
	if (depth > 0 && o.constructor && ENTITIES.indexOf(o.constructor.name) >= 0 && o.constructor.name !== "Transport")
		return entityRef(o);
	if (depth > 4) return "{…}";
	const out = {};
	for (const k of Object.keys(o).sort()) {
		if (SKIP_KEYS[k] || typeof o[k] === "function") continue;
		out[k] = plain(o[k], depth + 1);
	}
	return out;
}

function walkSnapshot() {
	const s = game.scenario, m = s.map;
	const hexes = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			hexes.push([plain(h, 1), +h.isSpotted(0), +h.isSpotted(1), +h.isZOC(0), +h.isZOC(1)]);
		}
	return JSON.stringify({
		scenario: plain(s, 0),
		map: plain(m, 0),
		players: m.getPlayers().map((p) => plain(p, 0)),
		units: m.getUnits().map((u) => [plain(u, 0), u.getPos ? plain(u.getPos(), 1) : null]),
		hexes,
		campaign: game.campaign ? plain(game.campaign, 0) : null
	});
}

// Real image loads are async: every completion held back delivered, in order, before a turn's end is
// recorded. Returns null, or on a timeout what was still pending
async function waitImages(ms) {
	const pending = () => [].concat(clock.loading() ? ["clock loading"] : [],
		(window.__harnessAsync || []).filter((op) => op.done && !op.delivered).map((op) => "undelivered " + op.kind),
		Array.from(document.images).filter((i) => !i.complete && i.src).map((i) => "image " + i.src.replace(/^https?:\/\/[^/]+/, "")));
	return await waitFor(() => pending().length === 0, ms || 15000) ? null : pending();
}

// The game has shown every step: the screen animates no move or attack, as the game host says (src/host.ts
// showingStep, #378). The original game and a baseline before #378 don't say it: there game.waitUIAnimation,
// which the game sets while the UI shows a step. A program's pick or look at a hex shown a moment (#8) is a
// pending timer, which the waits count beside it
const hostShows = () => !!(game.host && game.host.showingStep);
function allShown() {
	return hostShows() ? !game.host.showingStep() : !game.waitUIAnimation;
}

// Runs the virtual clock until animations and one-shot timers are done and, when a human
// plays, until it's a human's turn again (the game's turn loop lets the AI players act)
async function settle(maxSteps) {
	const humanTurn = () => {
		const m = game.scenario && game.scenario.map;
		if (!m || !m.currentPlayer || game.gameEnded) return true;
		const humans = m.getPlayers().filter((p) => p.type === playerType.humanLocal);
		return humans.length === 0 || m.currentPlayer.type === playerType.humanLocal;
	};
	return runClock(() => allShown() && clock.pendingTimeouts() === 0 && humanTurn(), maxSteps || 100000);
}
