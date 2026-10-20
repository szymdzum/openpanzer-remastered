// UIBuilder equipment window: class buttons, sort order and sort options, country change,
// unit and equipment selection with the buy/upgrade/sell costs (affordable, too expensive,
// none), buying, upgrading, selling, closing and reopening from the status bar buttons,
// the deploy mode status bar.
const eqCost = (el) => Equipment.equipment[el.equnitid].cost;
function eqByCost(max) {
	const list = Array.from($("eqUnitList").children);
	return list.reduce((a, b) => ((max ? eqCost(b) > eqCost(a) : eqCost(b) < eqCost(a)) ? b : a));
}
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["close start menu and message", async () => { click("#continuegame"); click("#uiokbut"); }],
	["open main menu, buy units", async () => { click("#mainmenu"); click("#buy"); }],
	["class air defence", async () => { click("#eqclass-9"); }],
	["class anti-tank", async () => { click("#eqclass-4"); }],
	["class artillery", async () => { click("#eqclass-8"); }],
	["class infantry", async () => { click("#eqclass-1"); }],
	["class recon", async () => { click("#eqclass-3"); }],
	["class air fighter", async () => { click("#eqclass-10"); }],
	["class air bomber", async () => { click("#eqclass-11"); }],
	["class tank", async () => { click("#eqclass-2"); }],
	["sort order descending", async () => { click("#eqSortOrderBut"); }],
	["sort order ascending", async () => { click("#eqSortOrderBut"); }],
	["open sort options", async () => { click("#eqSortOptionsBut"); }],
	["sort by hard attack", async () => { click("#eqsort-hardatk"); }],
	["sort by every other key", async () => {
		for (const el of Array.from($("eqSortOptionsContainer").children)) if (el.id !== "eqsort-hardatk" && el.id !== "eqsort-movpoints") click(el);
	}],
	["sort by movement", async () => { click("#eqsort-movpoints"); }],
	["close sort options", async () => { click("#eqSortCloseBut"); }],
	["open sort options again", async () => { click("#eqSortOptionsBut"); }],
	["close them with the same button", async () => { click("#eqSortOptionsBut"); }],
	["sort by cost again", async () => { click("#eqSortOptionsBut"); click("#eqsort-cost"); click("#eqSortCloseBut"); }],
	["select a deployed tank", async () => {
		const el = Array.from($("unitlist").children).find((e) => e.eqclass == unitClass.tank);
		click(el);
	}],
	["pick the most expensive tank", async () => {
		game.scenario.map.currentPlayer.prestige = 150; // not enough for it
		click(eqByCost(true));
	}],
	["pick the cheapest tank, enough prestige", async () => {
		game.scenario.map.currentPlayer.prestige = 2000;
		click(eqByCost(false));
	}],
	["upgrade to it", async () => { click("#eqUpgradeBut"); }],
	["pick an infantry with transports", async () => {
		click("#eqclass-1");
		game.scenario.map.currentPlayer.prestige = 2000;
		click(eqByCost(false));
	}],
	["pick a transport", async () => { click($("eqTransportList").firstChild); }],
	["buy it as a new unit (deploy mode)", async () => { click("#eqNewBut"); }],
	["weather message opens the combat log in deploy mode", async () => { click("#weathermsg"); }],
	["close the combat log", async () => { click("#weathermsg"); }],
	["close equipment, units bar button shows", async () => { click("#eqCloseBut"); }],
	["units bar button reopens equipment", async () => { click("#unitsBarButton"); }],
	["status bar button closes everything", async () => { click("#statusBarButton"); }],
	["status bar button opens the unit list only", async () => { click("#statusBarButton"); }],
	["buy button opens equipment", async () => { click("#buy"); }],
	["select the bought unit", async () => { click($("unitlist").firstChild); }],
	["sell it, deploy mode ends", async () => { click("#eqSellBut"); }],
	["status bar opens the combat log", async () => { click("#statusbar"); }],
	["combat log button closes it", async () => { click("#combatLogButton"); }],
	["close button with nothing open", async () => { click("#eqCloseBut"); }],
	["start a scenario with a supporting country", async () => { await startScenario("dragrom01.xml", [0, 1, 1, 1]); }],
	["close start menu and message, open buy units", async () => { click("#continuegame"); click("#uiokbut"); click("#buy"); }],
	["change country", async () => { click("#eqSelCountry"); }],
	["change country back", async () => { click("#eqSelCountry"); }],
];
