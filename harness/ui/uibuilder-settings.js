// UIBuilder settings window: every checkbox, the interface width/scale and map scale sliders
// (with their limits), the retina toggle suggesting a scale, and closing it with the hidden
// scenario message shown again. Then the transform fallback of scaleUI for browsers without
// css zoom, and the small screen layout.
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["open options with the scenario message shown", async () => { click("#mainmenu"); click("#options"); }],
	["open settings (hides the message)", async () => { click("#settings"); }],
	["toggle hex grid terrain", async () => { click("#showGridTerrain"); }],
	["toggle quick animation", async () => { click("#quickAnimation"); }],
	["toggle mute unit sounds", async () => { click("#muteUnitSounds"); }],
	["toggle no fog of war", async () => { click("#noFOW"); }],
	["toggle mark own units", async () => { click("#markOwnUnits"); }],
	["toggle mark enemy units", async () => { click("#markEnemyUnits"); }],
	["toggle optional objectives tooltips", async () => { click("#showDetailInfoToolTips"); }],
	["toggle hidden victory hexes", async () => { click("#showHiddenVictoryHexes"); }],
	["retina on at scale 1 suggests scale 1.6", async () => {
		click("#useRetina");
		// it asks for a page reload on ok, which would end the replay
		$("smSettings").needPageReload = false;
	}],
	["scale + from the suggested 1.6", async () => { click(document.querySelector("#uiscale").parentNode.nextSibling); }],
	["retina off at scale >= 1.5 suggests scale 1", async () => { click("#useRetina"); $("smSettings").needPageReload = false; }],
	["retina on at scale 1.7 suggests nothing", async () => { click("#useRetina"); $("smSettings").needPageReload = false; }],
	["retina off again", async () => { click("#useRetina"); $("smSettings").needPageReload = false; }],
	["scale - down to the 0.5 limit", async () => {
		const minus = document.querySelector("#uiscale").parentNode.previousSibling;
		for (let i = 0; i < 8; i++) click(minus);
	}],
	["scale + up to the 3 limit", async () => {
		const plus = document.querySelector("#uiscale").parentNode.nextSibling;
		for (let i = 0; i < 30; i++) click(plus);
	}],
	["scale back to 1", async () => {
		const minus = document.querySelector("#uiscale").parentNode.previousSibling;
		for (let i = 0; i < 20; i++) click(minus);
	}],
	["width - down to the small size limit", async () => {
		const minus = document.querySelector("#uiresize").parentNode.previousSibling;
		for (let i = 0; i < 40; i++) click(minus);
	}],
	["width + up to the 1920 limit", async () => {
		const plus = document.querySelector("#uiresize").parentNode.nextSibling;
		for (let i = 0; i < 150; i++) click(plus);
	}],
	["width back to 900", async () => {
		const minus = document.querySelector("#uiresize").parentNode.previousSibling;
		for (let i = 0; i < 102; i++) click(minus);
	}],
	["map scale +", async () => { click(document.querySelector("#mapscale").parentNode.nextSibling); }],
	["map scale - twice, limit 1", async () => {
		const minus = document.querySelector("#mapscale").parentNode.previousSibling;
		click(minus); click(minus);
	}],
	["settings ok, message shown again", async () => { click("#smSetOkBut"); }],
	["close the message", async () => { click("#uiokbut"); }],
	["browser without css zoom: settings scale + uses transforms", async () => {
		// scaleUI tests "zoom" in document.body.style, hide it there only
		const real = document.body.style;
		const proxy = new Proxy(real, {
			has: (t, k) => (k === "zoom" ? false : k in t),
			get: (t, k) => { const v = t[k]; return typeof v === "function" ? v.bind(t) : v; },
		});
		Object.defineProperty(document.body, "style", { configurable: true, get: () => proxy });
		try {
			click("#settings");
			click(document.querySelector("#uiscale").parentNode.nextSibling);
			click("#smSetOkBut");
		} finally { delete document.body.style; }
	}],
	["small screen layout, startup sizes switch to the small ones", async () => {
		window.__innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
		Object.defineProperty(window, "innerWidth", { configurable: true, get: () => 700 });
		uiSettings.uiSize = 840; uiSettings.uiScale = 1;
		UIBuilder.setLayoutConstrains(true);
	}],
	["small screen: open the equipment window", async () => { click("#mainmenu"); click("#buy"); }],
	["small screen: pick an equipment unit", async () => { click(document.querySelector("#eqUnitList").lastChild); }],
	["small screen layout, no switch when not at startup sizes", async () => {
		UIBuilder.setLayoutConstrains(true);
		if (window.__innerWidth) Object.defineProperty(window, "innerWidth", window.__innerWidth);
		else delete window.innerWidth;
	}],
];
