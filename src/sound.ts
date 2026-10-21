/**
 * Sound - sound interface for OpenPanzer
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, where it followed the styles (aiscripted.ts
 * re-exports it); names and comments carried over from the openpanzer 2.9 sound.js.
 */

import { uiSettings } from "./prototypes";

/* Looks like PCM Wav is supported on Chrome, Firefox, Safari, Opera */

//Each sound has several variants, play() picks one at random
export var soundData: { [name: string]: soundSprite } =
{
	//move sounds
	"track": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/move/track.wav", "resources/sounds/move/track2.mp3",
		"resources/sounds/move/track3.mp3"]),
	"htrack": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/move/htrack.wav", "resources/sounds/move/htrack2.mp3",
		"resources/sounds/move/htrack3.mp3"]),
	"leg": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/move/leg.wav", "resources/sounds/move/leg2.mp3",
		"resources/sounds/move/leg3.mp3", "resources/sounds/move/leg4.mp3"]),
	"air": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/move/air.wav", "resources/sounds/move/air2.mp3",
		"resources/sounds/move/air3.mp3", "resources/sounds/move/air4.mp3"]),
	"naval": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/move/naval.wav", "resources/sounds/move/naval2.mp3",
		"resources/sounds/move/naval3.mp3"]),
	//attack sounds
	"gun": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/gun.wav"]),
	"artillery": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/gun.wav", "resources/sounds/fire/artillery.mp3",
		"resources/sounds/fire/artillery2.mp3", "resources/sounds/fire/artillery3.mp3",
		"resources/sounds/fire/artillery4.mp3"]),
	"tank": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/gun.wav", "resources/sounds/fire/tank.mp3",
		"resources/sounds/fire/tank2.mp3", "resources/sounds/fire/tank3.mp3", "resources/sounds/fire/tank4.mp3"]),
	"recon": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/recon.mp3", "resources/sounds/fire/recon2.mp3",
		"resources/sounds/fire/recon3.mp3"]),
	"airDefence": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/aa.mp3", "resources/sounds/fire/aa2.mp3",
		"resources/sounds/fire/aa3.mp3", "resources/sounds/fire/aa4.mp3", "resources/sounds/fire/aa5.mp3"]),
	"antiTank": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/antitank.mp3", "resources/sounds/fire/antitank2.mp3",
		"resources/sounds/fire/antitank3.mp3", "resources/sounds/fire/antitank4.mp3"]),
	"smallShip": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/smallship.mp3", "resources/sounds/fire/smallship2.mp3",
		"resources/sounds/fire/smallship3.mp3"]),
	"bigShip": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/bigship.mp3", "resources/sounds/fire/bigship2.mp3",
		"resources/sounds/fire/bigship3.mp3", "resources/sounds/fire/bigship4.mp3"]),
	"submarine": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/submarine.mp3", "resources/sounds/fire/submarine2.mp3"]),
	"infantry": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/smallgun.wav", "resources/sounds/fire/infantry.mp3",
		"resources/sounds/fire/infantry2.mp3", "resources/sounds/fire/infantry3.mp3",
		"resources/sounds/fire/infantry4.mp3", "resources/sounds/fire/infantry5.mp3"]),
	"fighter": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/smallgun.wav", "resources/sounds/fire/fighter.mp3",
		"resources/sounds/fire/fighter2.mp3", "resources/sounds/fire/fighter3.mp3"]),
	"bomber": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/smallgun.wav", "resources/sounds/fire/bomber.mp3",
		"resources/sounds/fire/bomber2.mp3", "resources/sounds/fire/bomber3.mp3",
		"resources/sounds/fire/bomber4.mp3"]),
	"fortification": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/fortification.mp3",
		"resources/sounds/fire/fortification2.mp3"]),
	"smallgun": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/smallgun.wav"]),
	//explosion sounds
	"explosion": new (soundSprite as unknown as soundSpriteConstructor)(["resources/sounds/fire/explosion.wav", "resources/sounds/fire/explosion2.mp3",
		"resources/sounds/fire/explosion3.mp3", "resources/sounds/fire/explosion4.mp3",
		"resources/sounds/fire/explosion5.mp3"]),
	//dummy sound
	"dummy": new (soundSprite as unknown as soundSpriteConstructor)([""])
};

export var moveSoundByMoveMethod =
[
	"track",	//tracked 0
	"htrack",	//halfTracked
	"htrack",	//wheeled
	"leg", 		//leg
	"leg",		//towed
	"air",		//air
	"naval",	//deepnaval
	"naval",	//costal
	"leg",		//allTerrainTracked, track in 2.9
	"track",	//amphibious
	"naval",	//naval
	"leg"		//allTerrainLeg
];

//A sound with its variants, play() returns the play() promise or nothing when muted or missing
export interface soundSprite
{
	play(): Promise<void>;
}
//soundSprite is a constructor function (soundData above uses it before a class would exist)
export interface soundSpriteConstructor { new (paths: string[]): soundSprite; }

//paths is a list of variants of the same sound
export function soundSprite(this: soundSprite, paths: string[])
{
	var sounds: HTMLAudioElement[] = [];

	//Loads one variant, browsers without Audio() support just get no sound
	function addSound(path: string): void
	{
		try
		{
			const sound = new Audio(path);
			sound.load();
			sounds.push(sound);
		} catch (e) {}
	}

	for (let i = 0; i < paths.length; i++)
		addSound(paths[i]);

	this.play = function(): Promise<void>
	{
		let sound;
		//The variant is picked (Math.random called) even when sounds are muted
		sound = Math.floor(Math.random() * sounds.length);
		sound = sounds[sound];
		if (sound && !uiSettings.muteUnitSounds)
		{
			//requires audio to be preloaded
			try { sound.currentTime = 0; } catch(e) {}; //restart if already playing
			return sound.play();
		}
	}
}
