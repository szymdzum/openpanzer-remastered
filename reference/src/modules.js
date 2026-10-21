//Reconstructed modules loaded by index.html over the bundle, in the bundle's order: some run
//code at load time that needs the ones before (dom.js restores the settings with GameState)
var srcModules = ["prototypes", "gamestate", "combatlog", "equipment", "dom", "ai", "aiscripted", "animation",
	"gamerules", "unit", "map", "scenarioloader", "render", "scenario", "campaign", "uibuilder", "ui",
	"uicombatlog", "game", "osglue", "leaders"];

//Called before the modules load: the bundle's game.js already created the game and its turn
//loop and registered gameStart for the load event, src/game.js does both again
function srcModulesBefore(list)
{
	if (list.indexOf("game") >= 0)
	{
		clearInterval(game.loop);
		window.removeEventListener("load", gameStart);
	}
}

//Called after the modules load: objects the bundle instantiated at load time
//have to be rebuilt so they use the reconstructed constructors
function srcModulesLoaded()
{
	if (typeof ScenarioLoader === "function" && typeof Scenario === "function")
		Scenario.loader = new ScenarioLoader();
}
