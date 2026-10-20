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

//Runs a series of animations in order
function AnimationChain()
{
	var animationTasks = [];
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


//o = {ctx, x, y, rotate, sprite}
//Animates a series of frames from image on ctx context at x,y position
function SpriteAnimation(o) //Animation in the original, renamed: it replaced the DOM Animation
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

	function drawFrame(o, frame, compositeOperation)
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
	var timer;
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

//Sprite sheets of each animation, one is picked at random each time it plays
var animationFiles =
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
var animationsData =
{
	//AnimationName: new animationSprite(spriteFiles, soundSpriteName)
	"explosion": new animationSprite(animationFiles.explosion, "explosion"),
	"gun": new animationSprite(animationFiles.gun, "gun"),
	"artillery": new animationSprite(animationFiles.gun, "artillery"),
	"tank": new animationSprite(animationFiles.gun, "tank"),
	"recon": new animationSprite(animationFiles.gun, "recon"),
	"antiTank": new animationSprite(animationFiles.gun, "antiTank"),
	"airDefence": new animationSprite(animationFiles.gun, "airDefence"),
	"smallgun": new animationSprite(animationFiles.smallgun, "smallgun"),
	"infantry": new animationSprite(animationFiles.smallgun, "infantry"),
	"fighter": new animationSprite(animationFiles.smallgun, "fighter"),
	"bomber": new animationSprite(animationFiles.smallgun, "bomber"),
	"submarine": new animationSprite(animationFiles.gun, "submarine"),
	"smallShip": new animationSprite(animationFiles.gun, "smallShip"),
	"bigShip": new animationSprite(animationFiles.gun, "bigShip"),
	"fortification": new animationSprite(animationFiles.smallgun, "fortification"),
};

//Which attack animations belong to each unit class
var attackAnimationByClass =
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

//TODO preloading
//Called with new but returns a function: each call of it returns one of the sprites
//{image, width, frames, sound} at random
function animationSprite(spriteFiles, soundSpriteName)
{
	var sprites = [];

	for (var i = 0; i < spriteFiles.length; i++)
	{
		var sprite = {};
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
