// Start menu, through the DOM helpers (makeVisible/makeHidden/isVisible, setSelectOption,
// toggleCheckbox, toggleButton): new game submenu, the scenario dialog (pick a scenario,
// toggle the AI checkboxes), the campaign dialog (setSelectOption on the campaign list, the
// difficulty help), the settings (toggle checkboxes), the save/load dialog, back to the game.
function __select(id, index) {
	const s = document.querySelector("#" + id + " select");
	s.selectedIndex = index;
	s.dispatchEvent(new Event("change"));
}

const steps = [
	// the start menu is open over the tutorial when the game starts
	["close the start menu", async () => { click("#options"); }],
	["open the start menu", async () => { click("#options"); }],
	["new game submenu", async () => { click("#newgame"); }],
	["new scenario dialog", async () => { click("#newscenario"); }],
	["pick the 5th scenario", async () => { __select("smScenSel", 4); }],
	["toggle the first player's AI checkbox", async () => { click("#ai0"); }],
	["toggle the second player's AI checkbox", async () => { click("#ai1"); }],
	["toggle the first player's AI checkbox back", async () => { click("#ai0"); }],
	["back to the main menu", async () => { click("#smSBackBut"); }],
	["new game submenu again", async () => { click("#newgame"); }],
	["new campaign dialog", async () => { click("#newcampaign"); }],
	["pick the 3rd campaign", async () => { __select("smCampSel", 2); }],
	["pick the hardest difficulty", async () => { __select("smCampDif", 0); }],
	["difficulty help", async () => { click("#smCampDifHelp"); }],
	["back from the campaign dialog", async () => { click("#smCBackBut"); }],
	["settings", async () => { click("#settings"); }],
	["toggle quick animations", async () => { click("#quickAnimation"); }],
	["toggle mark own units", async () => { click("#markOwnUnits"); }],
	["toggle mark own units back", async () => { click("#markOwnUnits"); }],
	["settings ok", async () => { click("#smSetOkBut"); }],
	["save/load dialog", async () => { click("#saveload"); }],
	["close save/load", async () => { click("#smStOkBut"); }],
	["new game, scenario dialog shows the current scenario", async () => { click("#newgame"); click("#newscenario"); }],
	["play the selected scenario", async () => { click("#smSPlayBut"); await waitFor(() => game.scenario.isLoaded && game.gameStarted, 30000); }],
	["open the start menu in game", async () => { click("#options"); }],
	["continue game", async () => { click("#continuegame"); }],
];
