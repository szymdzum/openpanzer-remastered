//The settings window (Settings, #349): the old settings list (src/uibuilder.ts buildStartMenu before #351), its three
//sliders and its switches, the same keys in uiSettings, so the settings saved by the old UI still hold. Plain TypeScript
//on the settings it is given.
import type { UISettings } from "../prototypes";

//A slider: its setting, its title, its step and range (the interface width's least is the small UI's width)
export interface SliderSetting {
	key: "uiSize" | "uiScale" | "zoomLevel";
	title: string;
	step: number;
	min: (s: UISettings) => number;
	max: number;
}

export const SLIDERS: SliderSetting[] = [
	{ key: "uiSize", title: "Interface width (px)", step: 10, min: (s) => s.uiSmallSize, max: 1920 },
	{ key: "uiScale", title: "Interface scale", step: 0.1, min: () => 0.5, max: 3 },
	{ key: "zoomLevel", title: "Game Map scale", step: 0.1, min: () => 1, max: 3 },
];

export type ToggleKey = "showGridTerrain" | "quickAnimation" | "muteUnitSounds" | "noFOW" | "useRetina" | "hdGraphics" | "markOwnUnits"
	| "markEnemyUnits" | "showDetailInfoToolTips" | "showHiddenVictoryHexes" | "classicRules";

//The switches in the old order with their titles. The last is the rules of a new game (#53, #317): the classic rules will
//be retired, and their switch goes with this one line
export const TOGGLES: { key: ToggleKey, title: string }[] = [
	{ key: "showGridTerrain", title: "Show terrain with Hex Grid" }, { key: "quickAnimation", title: "Quick combat and move animations" },
	{ key: "muteUnitSounds", title: "Mute unit combat sounds" }, { key: "noFOW", title: "Disable Fog of War" },
	{ key: "useRetina", title: "Zoom to full device resolution" }, { key: "hdGraphics", title: "High resolution map and units" },
	{ key: "markOwnUnits", title: "Mark own units on map" }, { key: "markEnemyUnits", title: "Mark enemy strength in red" },
	{ key: "showDetailInfoToolTips", title: "Show optional objectives tooltips" },
	{ key: "showHiddenVictoryHexes", title: "Show hidden victory hexes" }, { key: "classicRules", title: "New games play the classic rules" },
];

//A slider's value as its field showed it: a whole number, else one decimal
export function sliderText(v: number): string {
	return v % 1 === 0 ? String(v) : v.toFixed(1);
}

//What a switch changed beyond its setting: the page to reload when the window closes (the renderer picks its images and
//the device's resolution once), and the interface scale the old window suggested for the device's resolution, applied
//when the window closes
export interface Toggled {
	reload: boolean;
	scale: number | null;
}

export function toggleSetting(s: UISettings, key: ToggleKey, pixelRatio: number): Toggled {
	s[key] = !s[key];
	if (key === "hdGraphics") return { reload: true, scale: null };
	if (key !== "useRetina") return { reload: false, scale: null };
	let scale: number | null = null;
	if (pixelRatio >= 1) {
		if (s.useRetina && s.uiScale <= 1) scale = 1.6;
		if (!s.useRetina && s.uiScale >= 1.5) scale = 1;
	}
	return { reload: true, scale };
}
