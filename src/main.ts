/**
 * The game's entry module, index.html loads it.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

//The modules in the order of the bundle's script tags. A module runs after the modules it
//imports (in a cycle, after those not already running), so the import graph decides the real
//order. What modules need of each other while loading: prototypes (everything reads it, it
//imports nothing so it runs first), aiscripted's soundData (animation's animationsData) and
//ScenarioLoader (scenario). The game starts on window load.
import * as prototypes from "./prototypes";
import * as gamestate from "./gamestate";
import * as combatlog from "./combatlog";
import * as equipment from "./equipment";
import * as dom from "./dom";
import * as ai from "./ai";
import * as aiscripted from "./aiscripted";
import * as animation from "./animation";
import * as gamerules from "./gamerules";
import * as unit from "./unit";
import * as map from "./map";
import * as scenarioloader from "./scenarioloader";
import * as render from "./render";
import * as scenario from "./scenario";
import * as campaign from "./campaign";
import * as uibuilder from "./uibuilder";
import * as ui from "./ui";
import * as uicombatlog from "./uicombatlog";
import * as game from "./game";
import * as osglue from "./osglue";
import * as leaders from "./leaders";
import * as actions from "./actions";

const modules = [prototypes, gamestate, combatlog, equipment, dom, ai, aiscripted, animation, gamerules, unit,
	map, scenarioloader, render, scenario, campaign, uibuilder, ui, uicombatlog, game, osglue, leaders,
	actions];

//Restores the settings and sets the viewport. The bundle did it while loading dom.js (no module
//reads the settings while loading); here the modules only declare things, so a test can import
//any of them
dom.changeViewPort();

//The combat log's HTML has inline onclick handlers, they run in the global scope
Object.assign(window, { makeHidden: dom.makeHidden, UIBuilder: uibuilder.UIBuilder,
	UICombatLog: uicombatlog.UICombatLog, game: game.game });

//?harness: every module's exports as globals, the way harness/ scripts and harness/lib/hooks.js
//reach into the game. Read live; assigned through the module's __harnessSet, which the dev
//server adds (vite.config.mts)
type HarnessModule = Record<string, unknown> & { __harnessSet?: (name: string, value: unknown) => void };
if (new URLSearchParams(location.search).has("harness"))
	for (const ns of modules as HarnessModule[])
		for (const name of Object.keys(ns).filter((n) => !n.startsWith("__")))
			Object.defineProperty(window, name, { configurable: true,
				get: () => ns[name],
				set: (value) => {
					if (!ns.__harnessSet) throw new Error("harness: " + name + " can't be assigned (dev server only)");
					ns.__harnessSet(name, value);
				} });
