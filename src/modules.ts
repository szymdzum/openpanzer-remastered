//The game's modules, loaded by index.html in this order: some run code at load time that needs
//the ones before (dom.js restores the settings with GameState)
var srcModules = ["prototypes", "gamestate", "combatlog", "equipment", "dom", "ai", "aiscripted", "animation",
	"gamerules", "unit", "map", "scenarioloader", "render", "scenario", "campaign", "uibuilder", "ui",
	"uicombatlog", "game", "osglue", "leaders"];
