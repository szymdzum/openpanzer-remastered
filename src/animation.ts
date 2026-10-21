/**
 * Animation animates a series of sprites
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

import { uiSettings } from "./prototypes";
import { soundData, type soundSprite } from "./aiscripted";

//What runAnimation is given: called back with itself when the chain ends. A method so callers
//can pass their own data type (method parameters are bivariant)
export interface AnimationCBData
{
	cbfunc(animationCBData: AnimationCBData): void;
}

//One sprite of an animation: the image holds the frames side by side, frames is the last frame index
export interface AnimationSpriteFrame
{
	image: HTMLImageElement;
	width: number;
	frames: number;
	sound: soundSprite;
}

//What SpriteAnimation animates (see Render.addAnimation)
export interface SpriteAnimationOptions
{
	ctx: CanvasRenderingContext2D;
	x: number;
	y: number;
	rotate: number;
	sprite: AnimationSpriteFrame;
}

//Runs a series of animations in order
//A class with its closure body as the constructor: the methods are own properties, as the original
export class AnimationChain
{
	declare add: (o: SpriteAnimationOptions) => void;
	declare clear: () => void;
	declare start: (animationCBData: AnimationCBData | null) => void;

	constructor()
	{
		var animationTasks: SpriteAnimation[] = [];
		var i = 0;

		this.add = function(o)
		{
			animationTasks.push(new SpriteAnimation(o));
		}

		this.clear = function()
		{
			animationTasks = [];
			i = 0;
		}

		this.start = function(animationCBData)
		{
			var obj = this; //save this pointer as it gets overwritten by window. context

			if (i < animationTasks.length)
			{
				animationTasks[i].start();
				setTimeout(function() { obj.start(animationCBData); }, animationTasks[i].getDuration() + 500); //chain delay
				i++;
			}
			else
			{
				if (animationCBData !== null && typeof animationCBData !== "undefined")
					animationCBData.cbfunc(animationCBData);
				setTimeout(function() {	obj.clear(); }, 100);
			}
		}
	}
}


//o = {ctx, x, y, rotate, sprite}
//Animates a series of frames from image on ctx context at x,y position
export class SpriteAnimation //Animation in the original, renamed: it replaced the DOM Animation
{
	declare delay: number;
	declare start: () => void;
	declare getDuration: () => number;

	constructor(o: SpriteAnimationOptions)
	{
		//Erases the previous frame by drawing it again with destination-out instead of clearing
		//its rectangle, so whatever else is on the canvas there survives
		function animate()
		{
			if (useClearRect)
				o.ctx.clearRect(o.x, o.y, o.sprite.width, o.sprite.image.height);
			else
				drawFrame(o, count - 1, "destination-out");
			//Do one more loop to clear last frame rendered
			if (count > o.sprite.frames) clearInterval(timer);
			if (count <= o.sprite.frames)
				drawFrame(o, count, "source-over");
			count++;
		}

		function drawFrame(o: SpriteAnimationOptions, frame: number, compositeOperation: GlobalCompositeOperation): void
		{
			if (frame < 0 || !o)
				return;

			o.ctx.save();
			o.ctx.globalCompositeOperation = compositeOperation;
			o.ctx.translate(o.x + o.sprite.width/2, o.y + o.sprite.image.height/2);
			o.ctx.rotate(o.rotate);
			o.ctx.drawImage(o.sprite.image, o.sprite.width * frame, 0, o.sprite.width,
				o.sprite.image.height, -o.sprite.width/2, -o.sprite.image.height/2,
				o.sprite.width, o.sprite.image.height);
			o.ctx.restore();
		}

		var useClearRect = false; //never set, the clearRect path is dead
		var timer: ReturnType<typeof setInterval>;
		var count = 0;

		this.delay = uiSettings.quickAnimation ? 50 : 150;

		this.start = function()
		{
			o.sprite.sound.play(); //Play the associated sound
			timer = setInterval(animate, this.delay);
		}

		this.getDuration = function()
		{
			return this.delay * o.sprite.frames;
		}
	}
}

//A sprite sheet of an animation, frames side by side, each width pixels wide
export interface AnimationFile
{
	path: string;
	frames: number;
	width: number;
}

//Sprite sheets of each animation, one is picked at random each time it plays
export var animationFiles: { [name: string]: AnimationFile[] } =
{
	"explosion": [
		{ path: "resources/animations/explosions.png", frames: 12, width: 120 },
		{ path: "resources/animations/explosions2.png", frames: 12, width: 120 },
		{ path: "resources/animations/explosions3.png", frames: 12, width: 120 },
	],
	"gun": [ { path: "resources/animations/fire-gun.png", frames: 5, width: 150 } ],
	"smallgun": [ { path: "resources/animations/fire-smallgun.png", frames: 7, width: 80 } ],
};

//List of all existing animations
export var animationsData: { [name: string]: AnimationSpritePicker } =
{
	//AnimationName: new animationSprite(spriteFiles, soundSpriteName)
	"explosion": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.explosion, "explosion"),
	"gun": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "gun"),
	"artillery": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "artillery"),
	"tank": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "tank"),
	"recon": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "recon"),
	"antiTank": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "antiTank"),
	"airDefence": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "airDefence"),
	"smallgun": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.smallgun, "smallgun"),
	"infantry": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.smallgun, "infantry"),
	"fighter": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.smallgun, "fighter"),
	"bomber": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.smallgun, "bomber"),
	"submarine": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "submarine"),
	"smallShip": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "smallShip"),
	"bigShip": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.gun, "bigShip"),
	"fortification": new (animationSprite as unknown as AnimationSpriteConstructor)(animationFiles.smallgun, "fortification"),
};

//Which attack animations belong to each unit class
export var attackAnimationByClass: string[] =
[
"none", //None
"infantry", //infantry
"tank", //tank
"recon", //recon
"antiTank", //antiTank
"airDefence", //flak
"fortification", //fortification
"smallgun", //groundTransport
"artillery", //artillery
"airDefence", //airDefence
"fighter", //fighter
"bomber", //tacticalBomber
"bomber", //levelBomber
"none", //airTransport
"submarine", //submarine
"smallShip", //destroyer
"bigShip", //battleship
"none", //carrier
"none", //navalTransport
"bigShip", //battleCruiser
"bigShip", //cruiser
"smallShip", //lightCruiser
];

//animationSprite(...) returns this, each call a random sprite of the animation
export type AnimationSpritePicker = () => AnimationSpriteFrame;
//animationSprite stays a function: animationsData above uses it before a class would exist
export interface AnimationSpriteConstructor { new (spriteFiles: AnimationFile[], soundSpriteName: string): AnimationSpritePicker; }

//TODO preloading
//Called with new but returns a function: each call of it returns one of the sprites
//{image, width, frames, sound} at random
export function animationSprite(spriteFiles: AnimationFile[], soundSpriteName: string): AnimationSpritePicker
{
	var sprites: AnimationSpriteFrame[] = [];

	for (var i = 0; i < spriteFiles.length; i++)
	{
		var sprite = {} as AnimationSpriteFrame;
		sprite.image = new Image();
		sprite.image.src = spriteFiles[i].path;
		sprite.width = spriteFiles[i].width;
		sprite.frames = spriteFiles[i].frames - 1; //index from 0
		if (soundSpriteName && typeof soundSpriteName !== "undefined")
			sprite.sound = soundData[soundSpriteName];
		else
			sprite.sound = soundData["dummy"];
		sprites.push(sprite);
	}

	return function()
	{
		var r = Math.floor(Math.random() * sprites.length);
		return sprites[r];
	}
}
