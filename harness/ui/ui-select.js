// ui: unit selection, the unit info window, mouse (hover, drag, right click), keyboard
// shortcuts, air mode, hex grid, strategic zoom and map scale, viewport centering.
function check(cond, what) { if (!cond) throw new Error("check failed: " + what); }
const M = () => game.scenario.map;
const U = (id) => M().getUnitById(id);
const steps = [
	["start scenario, human vs AI", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
		await settle();
		check(M().currentUnit && M().currentUnit.player.id === 0, "a starting unit is selected");
	}],
	["hover a hex with a unit selected: cursor and location", async () => {
		hoverHex(2, 7);
		check($("locmsg").innerHTML.indexOf("10.5 leFH18") >= 0, "status bar shows the hovered unit");
	}],
	["hover a named hex with a long unit name: unit name shortened", async () => {
		// 37 Obrona Narodowa at 4,30 is visible from turn start? make it visible to the player
		M().map[4][30].unit.tempSpotted = true;
		hoverHex(4, 30);
		check($("locmsg").innerHTML.indexOf("Chorzellen") >= 0, "hex name shown");
		M().map[4][30].unit.tempSpotted = false;
	}],
	["hover a hex with a long name: hex name shortened", async () => {
		M().map[9][2].name = "Soldau and its very long suburbs";
		hoverHex(9, 2);
		check($("locmsg").innerHTML.indexOf("Soldau and... ") >= 0, "long hex name shortened");
		M().map[9][2].name = "Soldau";
	}],
	["hover an airfield and a port with transports", async () => {
		const p = M().currentPlayer;
		p.airTransports = 2; p.navalTransports = 1;
		M().map[5][3].terrain = terrainType.Airfield;
		hoverHex(5, 3);
		check($("locmsg").innerHTML.indexOf("Air Transports: 2") >= 0, "air transports shown");
		M().map[5][3].terrain = terrainType.Port;
		hoverHex(5, 3);
		check($("locmsg").innerHTML.indexOf("Naval Transports: 1") >= 0, "naval transports shown");
	}],
	["hex grid on: small tooltips with transports on airfield and port", async () => {
		M().map[6][3].terrain = terrainType.Airfield;
		M().map[6][3].owner = 0; M().map[6][3].flag = 7;
		M().map[5][3].owner = 0; M().map[5][3].flag = 7;
		uiSettings.showDetailInfoToolTips = true;
		click("#hex");
		check(uiSettings.hexGrid, "hex grid on");
		check(UIBuilder.smallToolTipList.length > 0, "tooltips added");
	}],
	["hex grid off", async () => {
		uiSettings.showDetailInfoToolTips = false;
		click("#hex");
		check(!uiSettings.hexGrid, "hex grid off");
		const p = M().currentPlayer;
		p.airTransports = 0; p.navalTransports = 0;
		M().map[5][3].terrain = terrainType.Clear; M().map[6][3].terrain = terrainType.Clear;
	}],
	["open unit info for the selected unit", async () => {
		click("#inspectunit");
		check(isVisible("unit-info") && uiSettings.unitInfoVisibility, "unit info visible");
		check($("uName").textContent.length > 0, "unit name filled");
	}],
	["select an own unit with a transport", async () => {
		clickHex(1, 12);
		check(M().currentUnit === U(3), "SS Infanterie selected");
		check($("uTransport").className === "smallButtonSubMenu", "transport button shown");
	}],
	["show the transport stats", async () => {
		const before = $("uName").textContent;
		click("#uTransport");
		check($("uName").textContent !== before, "unit info shows the transport");
	}],
	["show the unit stats again", async () => {
		click("#uTransport");
		check($("uName").textContent.indexOf("SS Infanterie") >= 0, "back to the unit");
	}],
	["click an enemy unit: info only", async () => {
		const e = U(14); // Bunker 2,15
		e.tempSpotted = true;
		clickHex(2, 15);
		check(M().currentUnit === U(3), "selection kept");
		check($("uName").textContent.indexOf("Bunker") >= 0, "enemy info shown");
	}],
	["next unit button in unit info (set by the last own unit shown)", async () => {
		const before = M().currentUnit;
		click("#uNext");
		check(M().currentUnit && M().currentUnit !== before, "next unit selected");
	}],
	["give the unit a leader, leader button", async () => {
		const u = M().currentUnit;
		u.leader = 9;
		click("#inspectunit"); click("#inspectunit");
		check($("uLeader").textContent === "z", "leader button shown");
		check($("uName").innerHTML.indexOf("(Leader)") >= 0, "leader in name");
	}],
	["show the leader description", async () => {
		click("#uLeader");
		check($("leaderInfo") !== null, "leader info shown");
	}],
	["hide the leader description", async () => {
		click("#uLeader");
		check($("leaderInfo") === null, "leader info removed");
	}],
	["unit on a carrier: carrier button", async () => {
		const u = M().currentUnit;
		u.carrier = U(20).eqid; // pretend it's carried by the Do-17
		click("#inspectunit"); click("#inspectunit");
		check($("uCarrier").innerHTML === "2", "carrier button shown");
	}],
	["show the carrier stats", async () => {
		click("#uCarrier");
		check($("uName").textContent.indexOf("Do-17") >= 0, "carrier info shown");
		M().currentUnit.carrier = 0;
	}],
	["unit with low ammo and fuel in red", async () => {
		const u = U(53); // Kfz 13
		u.ammo = 1; u.fuel = 2;
		clickHex(12, 3);
		check(M().currentUnit === u, "Kfz 13 selected");
		check($("uAmmo").innerHTML.indexOf("FF6347") >= 0 && $("uFuel").innerHTML.indexOf("FF6347") >= 0, "red ammo and fuel");
	}],
	["click the selected unit: deselect and hide info", async () => {
		clickHex(12, 3);
		check(M().currentUnit === null, "deselected");
		check(!isVisible("unit-info"), "info hidden");
	}],
	["click an own unit with info visibility on: info shown again", async () => {
		clickHex(12, 4);
		check(M().currentUnit === U(54) && isVisible("unit-info"), "selected with info");
	}],
	["click an empty hex out of range: deselect and hide info", async () => {
		clickHex(20, 30);
		check(M().currentUnit === null && !isVisible("unit-info"), "deselected, info hidden");
	}],
	["right click an own unit: info", async () => {
		clickHex(12, 4, 2);
		check(isVisible("unit-info") && $("uName").textContent.indexOf("Infanterie") >= 0, "info shown");
		check(M().currentUnit === null, "not selected by right click");
	}],
	["select, then right click an empty hex: deselect", async () => {
		clickHex(12, 4);
		check(M().currentUnit === U(54), "selected");
		clickHex(20, 30, 2);
		check(M().currentUnit === null, "deselected by right click");
	}],
	["right click empty hex with nothing selected", async () => {
		clickHex(20, 30, 2);
		check(M().currentUnit === null, "still nothing");
	}],
	["hidden enemy unit can't be clicked", async () => {
		clickHex(12, 4);
		M().map[18][32].unit.tempSpotted = false;
		clickHex(18, 32);
		check(M().currentUnit === null, "click on hidden unit = empty hex deselects");
	}],
	["close unit info with the I key", async () => {
		clickHex(12, 4);
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyI", key: "i", bubbles: true }));
		check(!isVisible("unit-info"), "info hidden by I");
	}],
	["I key again: info for the current unit", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyI", key: "i", bubbles: true }));
		check(isVisible("unit-info") && $("uName").textContent.indexOf("Infanterie") >= 0, "info shown");
	}],
	["N key: next unit not moved", async () => {
		const before = M().currentUnit;
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyN", key: "n", bubbles: true }));
		check(M().currentUnit && M().currentUnit !== before, "next unit");
		window.__prev = before;
	}],
	["P key: previous unit", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP", key: "p", bubbles: true }));
		check(M().currentUnit === window.__prev, "back to previous");
	}],
	["N and P keys with nothing selected do nothing", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
		check(M().currentUnit === null, "Escape deselects");
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyN", key: "n", bubbles: true }));
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP", key: "p", bubbles: true }));
		check(M().currentUnit === null, "nothing selected");
	}],
	["Escape with nothing selected: toggles the main menu", async () => {
		const before = isVisible("startmenu");
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
		check(isVisible("startmenu") !== before, "start menu toggled");
	}],
	["Esc toggles it again", async () => {
		const before = isVisible("startmenu");
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "", key: "Esc", bubbles: true }));
		check(isVisible("startmenu") !== before, "start menu toggled");
	}],
	["A key: air mode, select the fighter", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "a", bubbles: true }));
		check(uiSettings.airMode, "air mode");
		clickHex(4, 8);
		check(M().currentUnit === U(22), "fighter selected");
	}],
	["air button: leaving air mode deselects the fighter", async () => {
		click("#air");
		check(!uiSettings.airMode && M().currentUnit === null, "ground mode, fighter deselected");
	}],
	["select the artillery under the fighter, then air mode and back", async () => {
		clickHex(4, 8);
		check(M().currentUnit === U(21), "artillery selected");
		click("#air");
		check(uiSettings.airMode && M().currentUnit === U(21), "air on, still selected");
		click("#air");
		check(!uiSettings.airMode && M().currentUnit === U(21), "air off, ground unit kept");
	}],
	["in air mode click a hex with only a ground unit: selects the ground unit", async () => {
		click("#air");
		clickHex(12, 4);
		check(M().currentUnit === U(54) && !uiSettings.airMode, "ground unit selected, air mode off");
	}],
	["in air mode click an enemy-only hex: nothing selected", async () => {
		click("#air");
		U(56).tempSpotted = true;
		clickHex(12, 13);
		check(M().currentUnit === U(54), "selection kept");
		click("#air");
	}],
	["H and L keys: hex grid and remove tooltips", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyH", key: "h", bubbles: true }));
		check(uiSettings.hexGrid, "grid");
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyL", key: "l", bubbles: true }));
		check(UIBuilder.smallToolTipList.length === 0, "tooltips removed");
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyH", key: "h", bubbles: true }));
	}],
	["Z key: strategic zoom", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyZ", key: "z", bubbles: true }));
		check(uiSettings.strategicZoom, "strategic zoom on");
	}],
	["hover in strategic zoom: no cursor", async () => {
		// the map is scaled by a transform the hex mapping doesn't know, use plain page coordinates
		const cursor = window.__harnessRender.getCursorCanvas();
		cursor.dispatchEvent(new MouseEvent("mousemove", eventCoords(cursor, 300, 250)));
		check(/\(\d+,\d+\)/.test($("locmsg").innerHTML), "location shown");
	}],
	["click the map in strategic zoom: back to normal centered there", async () => {
		const cursor = window.__harnessRender.getCursorCanvas();
		cursor.dispatchEvent(new MouseEvent("mousedown", eventCoords(cursor, 300, 250)));
		window.dispatchEvent(new MouseEvent("mouseup", eventCoords(cursor, 300, 250)));
		check(!uiSettings.strategicZoom, "zoom off");
	}],
	["zoom button twice on iOS", async () => {
		NATIVE_PLATFORM = "ios";
		click("#zoom");
		check(uiSettings.strategicZoom && $("game").style.zoom !== "", "ios zoom on");
		click("#zoom");
		check(!uiSettings.strategicZoom && $("game").style.zoom === "100%", "ios zoom off");
		NATIVE_PLATFORM = "generic";
		$("game").style.zoom = "";
	}],
	["map scale slider to 1.5", async () => {
		game.ui.scaleMap(1.5);
		check(uiSettings.mapZoom && uiSettings.zoomLevel === 1.5, "scaled");
	}],
	["strategic zoom on a scaled map", async () => {
		click("#zoom");
		check(uiSettings.strategicZoom, "zoom on");
		click("#zoom");
	}],
	["map scale back to 1", async () => {
		game.ui.scaleMap(1);
		check(!uiSettings.mapZoom, "not scaled");
	}],
	["drag the map", async () => {
		const g = $("game");
		g.scrollLeft = 300; g.scrollTop = 200;
		const cursor = window.__harnessRender.getCursorCanvas();
		const p = hexPageCoords(8, 8), q = hexPageCoords(9, 10);
		cursor.dispatchEvent(new MouseEvent("mousedown", eventCoords(cursor, p.x, p.y)));
		cursor.dispatchEvent(new MouseEvent("mousemove", eventCoords(cursor, q.x, q.y)));
		window.dispatchEvent(new MouseEvent("mouseup", eventCoords(cursor, q.x, q.y)));
		check(curDown === false, "drag ended");
	}],
	["window resize repositions the layers", async () => {
		window.onresize();
	}],
	["touch device click: status bar location", async () => {
		uiSettings.hasTouch = true;
		clickHex(20, 30);
		check($("locmsg").innerHTML.indexOf("(20,30)") >= 0, "location shown on tap");
		clickHex(12, 4);
		check(M().currentUnit === U(54), "selected by tap");
		uiSettings.hasTouch = false;
	}],
	["unknown key does nothing", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyQ", key: "q", bubbles: true }));
	}],
	["no clicks before the game starts", async () => {
		game.gameStarted = false;
		clickHex(12, 2);
		game.gameStarted = true;
		check(M().currentUnit === U(54), "click ignored");
	}],
	["centering on a missing cell or unit does nothing", async () => {
		check(game.ui.uiSetCellOnViewPort(null) === false, "no cell");
		check(game.ui.uiSetUnitOnViewPort(null) === false, "no unit");
		check(game.ui.uiUnitSelect(null) === false, "no unit to select");
	}],
];
