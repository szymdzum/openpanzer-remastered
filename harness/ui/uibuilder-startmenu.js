// UIBuilder start menu: new game panel, campaign list (description, difficulty help, campaign
// flow, back, play), scenario list (description, players, AI toggles, back, play).
// The game starts with the tutorial loaded and the start menu open.
function pick(selector, index) {
	const sel = document.querySelector(selector);
	sel.selectedIndex = index;
	sel.dispatchEvent(new Event("change"));
}
function optionIndex(selector, value) {
	return Array.from(document.querySelector(selector).options).findIndex((o) => o.value === String(value));
}
const scen = (file) => scenariolist.findIndex((s) => s[0] === file);

const steps = [
	["open new game panel", async () => { click("#newgame"); }],
	["open campaigns (first campaign described)", async () => { click("#newcampaign"); }],
	["pick Fall Weiss campaign", async () => { pick("#smCampSel select", 1); }],
	["pick the US Army Pacific campaign (pacific flags)", async () => { pick("#smCampSel select", 13); }],
	["difficulty help", async () => { click("#smCampDifHelp"); }],
	["show campaign flow", async () => {
		const before = $("smCampDesc").innerHTML;
		click("#smCFlowBut");
		await waitFor(() => $("smCampDesc").innerHTML !== before, 20000);
	}],
	["pick operational difficulty", async () => { pick("#smCampDifSel", 2); }],
	["campaigns back to main", async () => { click("#smCBackBut"); }],
	["open scenarios", async () => { click("#newgame"); click("#newscenario"); }],
	["play the preselected scenario: restarts the tutorial", async () => { click("#smSPlayBut"); }],
	["back to the start menu", async () => { click("#options"); }],
	["open scenarios", async () => { click("#newgame"); click("#newscenario"); }],
	["pick Student scenario", async () => { pick("#smScenSel select", optionIndex("#smScenSel select", scen("drstu02.xml"))); }],
	["toggle player 0 to AI", async () => { click("#ai0"); }],
	["toggle player 1 to human", async () => { click("#ai1"); }],
	["pick a pacific scenario, AI choices kept", async () => { pick("#smScenSel select", optionIndex("#smScenSel select", scen("sb6caga.xml"))); }],
	["scenarios back to main, flags reset", async () => { click("#smSBackBut"); }],
	["open scenarios again", async () => { click("#newgame"); click("#newscenario"); }],
	["pick Panzer-Verbaende Ostpreussen", async () => { pick("#smScenSel select", optionIndex("#smScenSel select", scen("drpzop01.xml"))); }],
	["player 0 human", async () => { if (uiSettings.isAI[0]) click("#ai0"); }],
	["player 1 AI", async () => { if (!uiSettings.isAI[1]) click("#ai1"); }],
	["play the scenario", async () => {
		const old = game.scenario;
		click("#smSPlayBut");
		await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["close scenario description", async () => { click("#uiokbut"); }],
	["open main menu", async () => { click("#mainmenu"); }],
	["open options (start menu)", async () => { click("#options"); }],
	["continue game closes start menu", async () => { click("#continuegame"); }],
	["open options again", async () => { click("#options"); }],
	["new game, campaigns", async () => { click("#newgame"); click("#newcampaign"); }],
	["pick Fall Weiss, tactical", async () => { pick("#smCampSel select", 1); pick("#smCampDifSel", 1); }],
	["play the campaign", async () => {
		const old = game.scenario;
		click("#smCPlayBut");
		await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["close campaign scenario description", async () => { click("#uiokbut"); }],
];
