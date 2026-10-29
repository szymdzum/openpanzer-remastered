//The game the host plays, without the DOM: Game's fields (test/host.test.ts, the new UI's screen in
//test/view-screen.test.tsx)
import { GameHost, runGame } from "../src/app/host";
import type { Game } from "../src/app/game";
import type { Screen } from "../src/app/screen";

//The game the host plays: Game's fields, and the members the engine and the core's glue call on it
//(src/app/driver.ts, src/app/start.ts, src/mirror.ts), handed on to the host as Game hands them
export function headlessGame(screen: (g: Game) => Screen): Game {
	let saves = 0, settings = 0;
	const g = { state: { save() { saves++; }, clear() {}, saves: () => saves, saveSettings() { settings++; },
		settingsSaves: () => settings }, campaign: null, scenario: null,
		gameStarted: false, gameEnded: false, spotSide: -1, rules: "classic", uiMessageClicked: false,
		session: null } as unknown as Game;
	const host = new GameHost(g, screen(g));
	Object.assign(g, { host,
		getCampaignPlayer: () => host.getCampaignPlayer(),
		getCampaignProgress: () => host.getCampaignProgress(),
		setCampaignProgress: (...args: Parameters<GameHost["setCampaignProgress"]>) => host.setCampaignProgress(...args),
		setCurrentSide: () => host.setCurrentSide() });
	runGame(g);
	return g;
}
