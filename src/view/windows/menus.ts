//The start menu's windows: which one shows. Its buttons switch them; the game menu's Options (also Esc with no unit
//selected, and the main menu at a game's end) toggles the start menu. Plain TypeScript: the store keeps the state,
//the components show it.
import type { IconName } from "../components/icon";

//All but the settings lie over the start menu's photographs; the settings lie over the game
export type MenuWindow = "main" | "campaign" | "scenario" | "saveload" | "settings";

//The window shown, none when the game shows; and whether the New Game panel of the main window is open, which
//stays as it was when the start menu closes and opens again
export interface MenuState {
	window: MenuWindow | null;
	newGame: boolean;
}

export type MenuButton = "newgame" | "newcampaign" | "newscenario" | "tutorial" | "continuegame" | "saveload" | "settings";

export const MENU_CLOSED: MenuState = { window: null, newGame: false };

//New Game opens its panel; Campaigns, Scenarios, Save / Load and Settings their window, the panel closed; the
//tutorial and Continue Game close the start menu
export function menuAfter(m: MenuState, button: MenuButton): MenuState {
	switch (button) {
		case "newgame": return { window: "main", newGame: true };
		case "newcampaign": return { window: "campaign", newGame: false };
		case "newscenario": return { window: "scenario", newGame: false };
		case "saveload": return { window: "saveload", newGame: false };
		case "settings": return { window: "settings", newGame: false };
		default: return { window: null, newGame: m.newGame };
	}
}

//Options: closes the start menu whatever window it shows, or opens it on its main window
export function menuToggled(m: MenuState): MenuState {
	return { window: m.window === null ? "main" : null, newGame: m.newGame };
}

//Back: the main window, its New Game panel closed
export function menuBack(): MenuState {
	return { window: "main", newGame: false };
}

//The New Game panel's hints are the original game's button hints (reference/src/uibuilder.js buildStartMenu)
export interface MenuEntry {
	id: MenuButton;
	title: string;
	icon: IconName;
	hint?: string;
}

export const MAIN_BUTTONS: MenuEntry[] = [
	{ id: "newgame", title: "New Game", icon: "plus" },
	{ id: "settings", title: "Settings", icon: "settings" },
	{ id: "saveload", title: "Save / Load", icon: "save" },
	{ id: "continuegame", title: "Continue Game", icon: "play" },
];

export const NEW_GAME_BUTTONS: MenuEntry[] = [
	{ id: "newcampaign", title: "Campaigns", icon: "campaign", hint: "Lead your troops to victory over multiple scenarios. Troops gain experience and leaders which will carry over next scenarios. Campaign flow depends on how quickly player conquers all objectives. " },
	{ id: "newscenario", title: "Scenarios", icon: "scenario", hint: "Play a single scenario. Most scenarios are designed  for campaign mode, this mode is recommended for players that want to learn the specifics of scenarios or try different things. " },
	{ id: "tutorial", title: "Tutorial", icon: "help", hint: "Learn the basic mechanics of the game. First turns are automatically played by the computer but later the control is given to the player." },
];

//Beside the logo: the manual, the game's page, its Facebook page and its issues
export const MENU_LINKS: { href: string, label: string, icon: IconName }[] = [
	{ href: "https://nicupavel.github.io/openpanzer-manual/", label: "Manual", icon: "help" },
	{ href: "https://openpanzer.itch.io/panzermarshal", label: "Panzer Marshal on itch.io", icon: "play" },
	{ href: "https://www.facebook.com/panzermarshal/", label: "Panzer Marshal on Facebook", icon: "radio" },
	{ href: "https://github.com/nicupavel/openpanzer/issues", label: "Issues on GitHub", icon: "document" },
];
