/**
 * Settings - the settings and constants the running game reads
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

export interface CloudSave {
	name: string;
	id: string;
}

export interface UISettings {
	zoomLevel: number;
	uiScale: number;
	uiSize: number;
	uiSmallSize: number;
	muteUnitSounds: boolean;
	markOwnUnits: boolean;
	markEnemyUnits: boolean;
	noFOW: boolean;
	quickAnimation: boolean;
	useRetina: boolean;
	hdGraphics: boolean;
	isAI: number[];
	lastCloudSave: CloudSave[];
	showDetailInfoToolTips: boolean;
	classicRules: boolean;
}

export let uiSettings: UISettings = {
	zoomLevel: 1,			//The map's scale
	uiScale: 1.0,			//The scale at which UI elements are zoomed
	uiSize: 840,			//The width of UI windows
	uiSmallSize: 470,		//The width of the small UI windows
	muteUnitSounds: false,	//Mute the units' combat sounds
	markOwnUnits: false,	//Mark own units on the map
	markEnemyUnits: false,	//Mark enemy units on the map
	noFOW: false,			//Play without the fog of war
	quickAnimation: false,	//Faster unit animations
	useRetina: false,		//don't scale on retina displays devicePixelRatio > 1
	hdGraphics: true,		//@2x map and unit images on high density screens (from public/hd/, needs a reload)
	isAI: [0, 0, 0, 0],		//which players the AI plays
	lastCloudSave: [],
	showDetailInfoToolTips: false,
	classicRules: false		//new games play the classic rules of Panzer Marshal 3.2.14, not the remaster's (#53)
};

export const newGameRules = (): "classic" | "remaster" => uiSettings.classicRules ? "classic" : "remaster";

//"3.2.14" -> "3.2"
export function major_version(version: string): string {
	return version.split(".").slice(0, 2).join(".");
}

//The prestige icon in the game's texts: the windows' costs, the tutorial's messages ({prestige})
export const CURRENCY_ICON = "<img src='resources/ui/dialogs/equipment/images/currency.png'/>";
export let DEBUG_AI_MOVES = false; //show the AI's moves: the host then treats every side as local
export let VERSION = "3.2.14";
export let MAJOR_VERSION = major_version(VERSION);
//The scenario a first start plays: Game.defaultScenario
export const DEFAULT_SCENARIO = "tutorial.xml";
