/**
 * The game's entry module, index.html loads it.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

//The modules in the order of the bundle's script tags. A module runs after the modules it
//imports (in a cycle, after those not already running), so the import graph decides the real
//order. What modules need of each other while loading: prototypes and core/tables (everything
//reads them, tables imports nothing so it runs first) and ScenarioLoader (scenario). The game starts on window load.
import * as prototypes from "./prototypes";
import * as storage from "./app/storage";
import * as combatlog from "./combatlog";
import * as equipment from "./equipment";
import * as page from "./app/page";
import * as ai from "./ai";
import * as gamerules from "./gamerules";
import * as unit from "./unit";
import * as map from "./map";
import * as loader from "./app/loader";
import * as scenario from "./scenario";
import * as campaign from "./campaign";
import * as game from "./app/game";
import * as leaders from "./leaders";
import * as tables from "./core/tables";
import * as rng from "./core/random";
import * as context from "./context";
import * as board from "./board";
import * as visibility from "./visibility";
import * as selection from "./selection";
import * as undo from "./undo";
import * as util from "./util";
import * as running from "./app/running";
import * as commands from "./commands";
import * as state from "./state";
import * as save from "./app/save";
import * as mirror from "./mirror";
import * as driver from "./app/driver";
import * as start from "./app/start";
import * as host from "./app/host";
import * as screen from "./app/screen";
import * as nullscreen from "./app/nullscreen";
//(the UI's entry, not one of the modules above, which the harness reaches into)
import { startNewUI } from "./view/screen";

const modules = [prototypes, storage, combatlog, equipment, page, ai, gamerules, unit,
	map, loader, scenario, campaign, game, leaders,
	tables, rng, context, board, visibility, selection, undo, util, running, commands, state,
	save, mirror, driver, start, host, screen, nullscreen];

//Restores the settings and sets the viewport. The bundle did it while loading dom.js (no module
//reads the settings while loading); here the modules only declare things, so a test can import
//any of them
new storage.GameState(null).restoreSettings(); //To restore only settings
page.changeViewPort();

//The random streams seeded once, here and not while core/random.ts loads: until then the game stream reads
//Math.random, which the tests seed. Seeded, the dice have a position the state keeps (src/state.ts)
rng.Rng.seed(rng.randomSeed());

//The UI shows the game (src/view/, #351): its screen goes to the host before the game starts
startNewUI(game.game.host);

//The start on window load. game.ts did it while loading; here, so that importing it starts nothing. No turn
//loop ticks: a program's turn goes on when the screen has shown its last action (src/host.ts, #375)
window.addEventListener("load", game.gameStart);

//The mirror's world kept for the screen's rules (src/mirror.ts), but under ?harness, whose scripts write
//into the game's objects anywhere; its checks on the dev server only (its modules have __harnessSet,
//vite.config.mts), where a write into the objects that didn't say so throws
const harness = new URLSearchParams(location.search).has("harness");
mirror.mirrorOptions.cache = !harness;
mirror.mirrorOptions.checks = "__harnessSet" in mirror;

//?harness: every module's exports as globals, the way harness/ scripts and harness/lib/hooks.js
//reach into the game. Read live; assigned through the module's __harnessSet, which the dev
//server adds (vite.config.mts)
type HarnessModule = Record<string, unknown> & { __harnessSet?: (name: string, value: unknown) => void };
if (harness)
	for (const ns of modules as HarnessModule[])
		for (const name of Object.keys(ns).filter((n) => !n.startsWith("__")))
			Object.defineProperty(window, name, { configurable: true,
				get: () => ns[name],
				set: (value) => {
					if (!ns.__harnessSet) throw new Error("harness: " + name + " can't be assigned (dev server only)");
					ns.__harnessSet(name, value);
				} });
