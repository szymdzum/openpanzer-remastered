// Render: display options. Hex grid (with and without terrain glyphs), own units marking,
// enemy strength marking, flags of hidden victory hexes on and off, the map zoom slider, the
// strategic map (flags only, ground and air, moved units faded) and its click to zoom back.
const myUnits = () => { const m = game.scenario.map; return m.getUnits().filter((u) => u.player.id === m.currentPlayer.id); };
// harness key() sends no KeyboardEvent.code, which the UI's shortcuts switch on
const keyCode = (code, k) => window.dispatchEvent(new KeyboardEvent("keyup", { code, key: k, bubbles: true }));
// Mouse events at page coordinates: hexPageCoords() can't map hexes once the map is zoomed
const mouseAt = (type, x, y) => window.__harnessRender.getCursorCanvas().dispatchEvent(new MouseEvent(type,
	{ bubbles: true, cancelable: true, view: window, button: 0, which: 1, clientX: x - window.scrollX, clientY: y - window.scrollY }));
const setting = (id) => click("#" + id); // the settings window toggles, a render shows them
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["hex grid on (H key)", async () => { keyCode("KeyH", "h"); }],
	["hex grid off (H key)", async () => { keyCode("KeyH", "h"); }],
	["setting: show terrain with hex grid", async () => { setting("showGridTerrain"); }],
	["hex grid on with terrain glyphs", async () => { keyCode("KeyH", "h"); }],
	["select a unit: move hexes get a glyph with terrain grid", async () => {
		window.__u = myUnits().find((u) => u !== game.scenario.map.currentUnit && GameRules.getMoveRange(game.scenario.map, u).length > 0);
		const p = __u.getPos();
		clickHex(p.row, p.col);
	}],
	["deselect (escape)", async () => { key("Escape", 27); }],
	["setting: mark own units, mark enemy strength", async () => { setting("markOwnUnits"); setting("markEnemyUnits"); }],
	["hex grid off: own units and enemy strength marked", async () => { keyCode("KeyH", "h"); }],
	["setting: no hidden victory hexes", async () => { setting("showHiddenVictoryHexes"); }],
	["air mode (A key): flags drawn as plain decals", async () => { keyCode("KeyA", "a"); }],
	["air mode off (A key)", async () => { keyCode("KeyA", "a"); }],
	["setting: hidden victory hexes again, marks off", async () => {
		setting("showHiddenVictoryHexes"); setting("markOwnUnits"); setting("markEnemyUnits"); setting("showGridTerrain");
	}],
	["zoom the map in with the slider (+ x5)", async () => {
		const plus = $("mapscale").parentNode.nextSibling;
		for (let i = 0; i < 5; i++) click(plus);
	}],
	["hover the zoomed map", async () => { mouseAt("mousemove", 400, 300); }],
	["click the zoomed map", async () => { mouseAt("mousedown", 400, 300); mouseAt("click", 400, 300); }],
	["zoom back out with the slider (- x5)", async () => {
		const minus = $("mapscale").parentNode.previousSibling;
		for (let i = 0; i < 5; i++) click(minus);
	}],
	["move a unit (moved units are faded on the strategic map)", async () => {
		const m = game.scenario.map;
		window.__u = myUnits().find((u) => !GameRules.isAir(u) && u !== m.currentUnit && GameRules.getMoveRange(m, u).filter((c) => c.canMove).length > 0);
		const p = __u.getPos();
		clickHex(p.row, p.col);
		await settle();
		const cells = GameRules.getMoveRange(m, __u).filter((c) => c.canMove);
		const c = cells[cells.length - 1];
		clickHex(c.row, c.col);
		await runClock(() => !__u.hasAnimation, 20000);
	}],
	["strategic map (Z key)", async () => { keyCode("KeyZ", "z"); }],
	["air mode on the strategic map", async () => { keyCode("KeyA", "a"); }],
	["air mode off on the strategic map", async () => { keyCode("KeyA", "a"); }],
	["hover the strategic map", async () => { mouseAt("mousemove", 300, 200); }],
	["click the strategic map: back to the tactical map there", async () => { mouseAt("mousedown", 300, 200); mouseAt("click", 300, 200); }],
	["strategic map with the strategic map button", async () => { click("#zoom"); }],
	["strategic map off with the button", async () => { click("#zoom"); }],
];
