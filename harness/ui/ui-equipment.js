// ui: the unit list and the equipment window: classes, equipment and transport selection,
// sorting, buy, deploy, upgrade and sell (deployed and undeployed), change country,
// the units bar, closing on full deployment.
function check(cond, what) { if (!cond) throw new Error("check failed: " + what); }
const M = () => game.scenario.map;
const U = (id) => M().getUnitById(id);
const sel = () => $("eqUserSel");
function boxes(list) { return Array.from($(list).children); }
async function finish() {
	const animating = () => Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop);
	await runClock(() => !animating(), 100000);
	await settle();
}
function deployHex() {
	const m = M();
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			if (h.isDeployment == m.currentPlayer.id && !h.unit && !h.airunit) return { row: r, col: c };
		}
	return null;
}
const steps = [
	["start scenario, human vs AI", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
	}],
	["open the equipment window: units on map, current unit selected", async () => {
		click("#buy");
		check(isVisible("equipment") && isVisible("container-unitlist"), "window open");
		check(boxes("unitlist").length > 0 && boxes("eqUnitList").length > 0, "lists filled");
		check($("unitlist").querySelector("[selectedUnit]"), "a unit is selected in the list");
	}],
	["infantry class button: infantry equipment", async () => {
		click("#eqclass-1");
		check(sel().eqclass == 1 && $("eqInfoText").innerHTML.indexOf(unitClassNames[1]) >= 0, "infantry class");
	}],
	["pick an infantry: transports listed", async () => {
		const b = boxes("eqUnitList").find((d) => GameRules.isTransportable(d.equnitid));
		click(b);
		check(sel().equnit == b.equnitid && boxes("eqTransportList").length > 0, "transports listed");
	}],
	["pick a transport", async () => {
		const t = boxes("eqTransportList")[0];
		click(t);
		check(sel().eqtransport == t.eqtransportid, "transport selected");
		check($("eqTransportList").querySelector("[selectedUnit]"), "transport marked");
	}],
	["pick it again: no transport", async () => {
		click(boxes("eqTransportList")[0]);
		// -2 for no transport, the refresh doesn't find it in the list and sets -1
		check(sel().eqtransport == -1 && !$("eqTransportList").querySelector("[selectedUnit]"), "transport deselected");
	}],
	["buy the infantry: undeployed, deploy mode", async () => {
		const prestige = M().currentPlayer.prestige;
		click("#eqNewBut");
		check(M().currentPlayer.prestige < prestige, "prestige spent");
		check(M().currentPlayer.hasUndeployedUnits() && uiSettings.deployMode, "deploy mode");
		check($("statusmsg").innerHTML.indexOf("Deploy") >= 0, "deploy message");
	}],
	["buy without a selection does nothing", async () => {
		const e = sel().equnit;
		sel().equnit = -1;
		const prestige = M().currentPlayer.prestige;
		click("#eqNewBut");
		check(M().currentPlayer.prestige === prestige, "nothing bought");
		sel().equnit = e;
	}],
	["tank class: buy a tank too", async () => {
		click("#eqclass-2");
		click(boxes("eqUnitList")[0]);
		sel().eqtransport = "";
		click("#eqNewBut");
		check(M().currentPlayer.getCoreUnitList().filter((u) => !u.isDeployed).length === 2, "two to deploy");
	}],
	["pick the infantry in the deploy list", async () => {
		const b = boxes("unitlist").find((d) => d.eqclass == 1);
		click(b);
		check(sel().deployunit == b.unitid && sel().userunit == -1, "deploy unit selected");
	}],
	["upgrade the undeployed infantry", async () => {
		const u = M().currentPlayer.getCoreUnitList()[sel().deployunit];
		const old = u.eqid;
		const b = boxes("eqUnitList").filter((d) => d.equnitid != old).pop();
		click(b);
		click("#eqUpgradeBut");
		check(u.eqid != old, "upgraded");
	}],
	["sell the undeployed infantry", async () => {
		const n = M().currentPlayer.getCoreUnitList().length;
		click("#eqSellBut");
		check(M().currentPlayer.getCoreUnitList().length === n - 1, "sold");
	}],
	["sort by attack, descending", async () => {
		click("#eqSortOptionsBut");
		check(isVisible("eqSortOptions"), "sort options");
		click("#eqsort-hardatk");
		click("#eqSortOrderBut");
		click("#eqSortOptionsBut");
		check(sel().sortproperty === "hardatk" && sel().sortorder == 1, "sorted");
	}],
	["deploy the tank on a deployment hex: list closes", async () => {
		const h = deployHex();
		clickHex(h.row, h.col);
		await finish();
		check(M().map[h.row][h.col].unit && !M().currentPlayer.hasUndeployedUnits(), "deployed");
		check(!uiSettings.deployMode && !isVisible("container-unitlist"), "unit list closed");
	}],
	["units bar: unit list only", async () => {
		click("#statusBarButton");
		check(isVisible("container-unitlist") && !isVisible("equipment") && isVisible("unitsBarButton"), "unit list only");
	}],
	["units bar button: equipment too", async () => {
		click("#unitsBarButton");
		check(isVisible("equipment"), "equipment shown");
	}],
	["close the equipment window", async () => {
		click("#eqCloseBut");
		check(!isVisible("equipment"), "equipment closed");
	}],
	["units bar again closes the unit list", async () => {
		click("#statusBarButton");
		check(!isVisible("container-unitlist"), "closed");
	}],
	["B key: open, click a deployed unit in the list", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyB", key: "b", bubbles: true }));
		const b = boxes("unitlist").find((d) => d.unitid == 32);
		click(b);
		check(M().currentUnit === U(32) && sel().userunit == 32, "map unit selected from the list");
	}],
	["unit list shows moved, fired and low supply units", async () => {
		U(34).hasMoved = true; U(35).hasFired = true; U(40).ammo = 1;
		click("#eqclass-1");
		check(boxes("unitlist").some((d) => d.textContent.indexOf(";") >= 0), "low supply icon");
	}],
	["upgrade the selected map unit", async () => {
		click(boxes("unitlist").find((d) => d.unitid == 32));
		const old = U(32).eqid;
		const b = boxes("eqUnitList").filter((d) => d.equnitid != old && Equipment.equipment[d.equnitid].uclass == 1).pop();
		click(b);
		click("#eqUpgradeBut");
		check(U(32).eqid != old, "upgraded on map");
	}],
	["upgrade a map unit to its own transport only", async () => {
		click(boxes("unitlist").find((d) => d.unitid == 3));
		sel().equnit = -1; sel().eqtransport = "";
		click("#eqUpgradeBut");
	}],
	["disband the selected map unit", async () => {
		click(boxes("unitlist").find((d) => d.unitid == 32));
		click("#eqSellBut");
		check(!U(32), "disbanded");
	}],
	["sell a map unit with no equipment selected", async () => {
		click(boxes("unitlist").find((d) => d.unitid == 34));
		sel().equnit = -1;
		click("#eqSellBut");
		check(!U(34), "disbanded");
	}],
	["flak class unit shows the air defence list", async () => {
		click(boxes("unitlist").find((d) => d.unitid == 17));
		check(sel().eqclass == unitClass.airDefence, "air defence class for flak");
	}],
	["fortification class shows tanks", async () => {
		sel().userunit = -1;
		game.ui.updateEquipmentWindow(unitClass.fortification);
		check(sel().eqclass == unitClass.tank, "tank class");
	}],
	["close with B, buy on an empty selection", async () => {
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyB", key: "b", bubbles: true }));
		check(!isVisible("equipment"), "closed");
	}],
	["support country, end turn: change country", async () => {
		M().currentPlayer.supportCountries = [10];
		endTurn();
		await finish();
		click("#buy");
		click("#eqSelCountry");
		check($("eqSelCountry").country === 1, "second country");
		click("#eqSelCountry");
		check($("eqSelCountry").country === 0, "back to the first");
	}],
	["unit list click of another country unit", async () => {
		click("#eqSelCountry");
		click(boxes("unitlist")[0]);
		check($("eqSelCountry").country === 0, "country of the unit");
	}],
	["the AI turn doesn't show its unit list", async () => {
		game.ui.updateEquipmentWindow(unitClass.tank);
		click("#buy");
		check(!isVisible("equipment"), "closed");
	}],
];
