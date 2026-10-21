// UIBuilder save/load window: save to disk, load from disk (bad file, good file), cloud saves
// (new, overwrite, failed, the last 3 list with its rotation and clicks), cloud load, ok button.
// The GitHub gists API is faked in the page, the disk save date is fixed (it's in the DOM).
const gists = {};
let nextGist = 1001;
const realOpen = XMLHttpRequest.prototype.open, realSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url) {
	this.__gist = /api\.github\.com/.test(url) ? { method, url } : null;
	return realOpen.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function(body) {
	if (!this.__gist) return realSend.apply(this, arguments);
	const g = this.__gist, xhr = this;
	let id = g.url.split("/gists")[1].replace("/", ""), status = 200, reply = null;
	if (id === "fail") status = 500;
	else if (g.method === "GET") reply = { files: { "openpanzer-save.json": { content: gists[id] } } };
	else {
		if (g.method === "POST") id = String(nextGist++);
		gists[id] = JSON.parse(body).files["openpanzer-save.json"].content;
		reply = { id };
	}
	Object.defineProperty(xhr, "readyState", { value: 4 });
	Object.defineProperty(xhr, "status", { value: status });
	Object.defineProperty(xhr, "responseText", { value: JSON.stringify(reply) });
	// the load event too: lib/hooks.js waits for it, and the harness delivers the requests in
	// order, so an unfinished one would hold back every later request until each step timed out
	Promise.resolve().then(() => { xhr.onreadystatechange(); xhr.dispatchEvent(new ProgressEvent("load")); });
};

function loadFile(text) {
	const input = $("diskloadfile");
	const dt = new DataTransfer();
	dt.items.add(new File([text], "save.json", { type: "application/json" }));
	input.files = dt.files;
	input.dispatchEvent(new Event("change", { bubbles: true }));
}
const cloudEntry = (i) => $("cloudid_lastsaves").children[i];
const cloudId = (v) => { $("cloudid").value = v; };

const steps = [
	["save the tutorial for later, start scenario human vs AI", async () => {
		window.__tutorialSave = game.state.exportGameState();
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
	}],
	["open save / load", async () => { click("#saveload"); }],
	["save to disk", async () => {
		const RealDate = Date;
		window.Date = function() { return new RealDate(2020, 0, 2, 3, 4, 5); };
		const realClick = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function() {}; // no real download
		try { click("#disksave"); } finally { window.Date = RealDate; HTMLAnchorElement.prototype.click = realClick; }
	}],
	["load a broken file from disk", async () => {
		loadFile("not a save");
		await waitFor(() => $("diskloaderror").textContent !== "", 10000);
	}],
	["load the tutorial file from disk", async () => {
		const old = game.scenario;
		loadFile(window.__tutorialSave);
		await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["open options, save / load", async () => { click("#options"); click("#saveload"); }],
	["new cloud save of the tutorial", async () => { cloudId(""); click("#cloudsave"); }],
	["pick the empty 3rd cloud save entry", async () => { click(cloudEntry(2)); }],
	["pick the 1st cloud save entry", async () => { click(cloudEntry(0)); }],
	["failed cloud save", async () => { cloudId("fail"); click("#cloudsave"); }],
	["start another scenario", async () => { await startScenario("drstu02.xml", [0, 1, 1, 1]); }],
	["open save / load again", async () => { click("#saveload"); }],
	["second new cloud save", async () => { cloudId(""); click("#cloudsave"); }],
	["third new cloud save", async () => { cloudId(""); click("#cloudsave"); }],
	["fourth new cloud save drops the tutorial one", async () => { cloudId(""); click("#cloudsave"); }],
	["pick the 2nd cloud save entry", async () => { click(cloudEntry(1)); }],
	["overwrite it, no new entry", async () => { click("#cloudsave"); }],
	["load the tutorial cloud save by its id", async () => {
		cloudId("1001");
		const old = game.scenario;
		click("#cloudload");
		await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["open options, save / load, broken file", async () => {
		click("#options"); click("#saveload");
		loadFile("{}");
		await waitFor(() => $("diskloaderror").textContent !== "", 10000);
	}],
	["save / load ok clears the error", async () => { click("#smStOkBut"); }],
	["start Fall Weiss campaign", async () => { await startCampaign(1, 0); }],
	["open save / load in the campaign", async () => { click("#saveload"); }],
	["cloud save of the campaign", async () => { cloudId(""); click("#cloudsave"); }],
	["save the campaign to disk", async () => {
		const RealDate = Date;
		window.Date = function() { return new RealDate(2020, 0, 2, 3, 4, 5); };
		const realClick = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function() {};
		try { click("#disksave"); } finally { window.Date = RealDate; HTMLAnchorElement.prototype.click = realClick; }
	}],
	["load an old campaign save (no equipment set, no dossier) from disk", async () => {
		const old = JSON.parse(game.state.exportGameState(), (k, v) => (k === "dossier" ? undefined : v));
		delete old.scenario.eqp;
		const before = game.scenario;
		loadFile(JSON.stringify(old));
		await waitFor(() => game.scenario !== before && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["open the dossier: it gets initialised", async () => {
		click("#statusbar");
		click(document.querySelector("#combatLog .combatLogInfoButton"));
	}],
];
