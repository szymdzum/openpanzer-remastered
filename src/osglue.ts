/**
 * OSGlue - platform specific glue: loading/saving games to disk, score reporting
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle (no 2.9 source exists for this module).
 */

import { NATIVE_PLATFORM } from "./prototypes";
import { $ } from "./dom";
import { game } from "./game";

//The platform glue instance the module returns
export interface OSGlue {
	diskloadHTML: string;
	diskloadEvent(element: HTMLElement, handler: (e: Event) => void): void;
	diskload(onDone?: () => void, onFail?: () => void): void;
	disksave(saveName: string): void;
	reportScore(score: number): void;
	reportAchievement(campaignFile: string): void;
	canvasErrorMsg: string;
}

//The namespace object the module function fills
export interface OSGlueModule {
	ios: new () => OSGlue;
	generic: new () => OSGlue;
}

//The namespace object only holds the two constructors, the module returns an instance of one.
//(Loaded over the bundle, OSGlue is the bundle's instance and gets the constructors added)
export var OSGlue: OSGlue = (function(OSGlue: OSGlueModule): OSGlue { //Module start

//Native iOS/Android wrapper: disk operations go through the openpanzer:// url scheme
//which the native application intercepts
OSGlue.ios = class implements OSGlue {
	declare diskloadHTML: string;
	declare diskloadEvent: (element: HTMLElement, handler: (e: Event) => void) => void;
	declare diskload: (onDone?: () => void, onFail?: () => void) => void;
	declare disksave: (saveName: string) => void;
	declare reportScore: (score: number) => void;
	declare reportAchievement: (campaignFile: string) => void;
	declare canvasErrorMsg: string;

	constructor() {
		this.diskloadHTML = "Load from Disk";

		this.diskloadEvent = function(element: HTMLElement, handler: (e: Event) => void) {
			element.addEventListener("click", handler, false);
		}

		this.diskload = function() {
			window.location = "openpanzer://loadfromdisk" as string & Location;
		}

		this.disksave = function(saveName: string) {
			window.location = "openpanzer://savetodisk/" + saveName as string & Location;
		}

		this.reportScore = function(score: number) {}
		this.reportAchievement = function(campaignFile: string) {}

		this.canvasErrorMsg = "<b>Couldn't create game surface.</b> <br/>This usually means that your device doesn't allow game surface to be created with dimensions over a certain limit (iPhone 3GS/iPod Touch 4).<br/><br/>You can play smaller scenarios like Huertgen Forest or Bizerte from New Scenario in Main Menu.";
	}
}

//Browser: load from a file input, save by downloading a data: url
OSGlue.generic = class implements OSGlue {
	declare diskloadHTML: string;
	declare diskloadEvent: (element: HTMLElement, handler: (e: Event) => void) => void;
	declare diskload: (onDone?: () => void, onFail?: () => void) => void;
	declare disksave: (saveName: string) => void;
	declare reportScore: (score: number) => void;
	declare reportAchievement: (campaignFile: string) => void;
	declare canvasErrorMsg: string;

	constructor() {
		this.diskloadHTML = "Load from Disk <input id='diskloadfile' type='file'/>";

		this.diskloadEvent = function(element: HTMLElement, handler: (e: Event) => void) {
			element.addEventListener("change", handler, false);
		}

		this.diskload = function(onDone?: () => void, onFail?: () => void) {
			game.state.restoreFromFile(($("diskloadfile") as HTMLInputElement).files[0], onDone, onFail);
			($("diskloadfile") as HTMLInputElement).value = "";
		}

		this.disksave = function(saveName: string) {
			($("savedata") as HTMLAnchorElement).download = saveName;
			($("savedata") as HTMLAnchorElement).href = "data:application/force-download," + encodeURIComponent(game.state.exportGameState());
			$("savedata").click();
			$("disksaveupdate").innerHTML = saveName;
		}

		this.reportScore = function(score: number) {}
		this.reportAchievement = function(campaignFile: string) {}

		this.canvasErrorMsg = "Couldn't load map image !";
	}
}

if (NATIVE_PLATFORM == "ios" || NATIVE_PLATFORM == "android")
	return new OSGlue.ios();

return new OSGlue.generic();
//------------------------ MODULE END ----------------------
}(OSGlue as unknown as OSGlueModule || {} as OSGlueModule)); //Module end giberish
