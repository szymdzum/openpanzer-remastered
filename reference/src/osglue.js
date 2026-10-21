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

//The namespace object only holds the two constructors, the module returns an instance of one.
//(Loaded over the bundle, OSGlue is the bundle's instance and gets the constructors added)
var OSGlue = (function(OSGlue) { //Module start

//Native iOS/Android wrapper: disk operations go through the openpanzer:// url scheme
//which the native application intercepts
OSGlue.ios = function()
{
	this.diskloadHTML = "Load from Disk";

	this.diskloadEvent = function(element, handler)
	{
		element.addEventListener("click", handler, false);
	}

	this.diskload = function()
	{
		window.location = "openpanzer://loadfromdisk";
	}

	this.disksave = function(saveName)
	{
		window.location = "openpanzer://savetodisk/" + saveName;
	}

	this.reportScore = function(score) {}
	this.reportAchievement = function(campaignFile) {}

	this.canvasErrorMsg = "<b>Couldn't create game surface.</b> <br/>This usually means that your device doesn't allow game surface to be created with dimensions over a certain limit (iPhone 3GS/iPod Touch 4).<br/><br/>You can play smaller scenarios like Huertgen Forest or Bizerte from New Scenario in Main Menu.";
}

//Browser: load from a file input, save by downloading a data: url
OSGlue.generic = function()
{
	this.diskloadHTML = "Load from Disk <input id='diskloadfile' type='file'/>";

	this.diskloadEvent = function(element, handler)
	{
		element.addEventListener("change", handler, false);
	}

	this.diskload = function(onDone, onFail)
	{
		game.state.restoreFromFile($("diskloadfile").files[0], onDone, onFail);
		$("diskloadfile").value = "";
	}

	this.disksave = function(saveName)
	{
		$("savedata").download = saveName;
		$("savedata").href = "data:application/force-download," + encodeURIComponent(game.state.exportGameState());
		$("savedata").click();
		$("disksaveupdate").innerHTML = saveName;
	}

	this.reportScore = function(score) {}
	this.reportAchievement = function(campaignFile) {}

	this.canvasErrorMsg = "Couldn't load map image !";
}

if (NATIVE_PLATFORM == "ios" || NATIVE_PLATFORM == "android")
	return new OSGlue.ios();

return new OSGlue.generic();
//------------------------ MODULE END ----------------------
}(OSGlue || {})); //Module end giberish
