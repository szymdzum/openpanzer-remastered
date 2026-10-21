/**
 * AIScripted - Scripted opponent and guide for the tutorial scenario
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, no 2.9 counterpart: names come
 * from the code and its callers. The style and sound parts that follow it in the bundle
 * carry their names and comments over from the openpanzer 2.9 style.js and sound.js.
 */

import { actionType, playerSide, playerType, uiSettings } from "./prototypes";
import { AI, type AIAction, type AIActionParam } from "./ai";
import type { Unit } from "./unit";
import type { GameMap, Player } from "./map";
import { UIBuilder } from "./uibuilder";
import { game } from "./game";

//Undeclared in the bundle (implicit globals): module variables here, same lifetime (the tutorial turns, buildActions)
var u: any, e: any, firstTurn: any;

//The tutorial units AIScripted picks from their starting positions
export interface TutorialUnits
{
	axis: { recon?: Unit; legioninf?: Unit; pz2a?: Unit; ssinf1?: Unit; ssinf2?: Unit; ssinf3?: Unit; arty?: Unit };
	allies: { inf1?: Unit };
}

//Plays the tutorial (tutorial.xml) for both sides: each turn builds a list of actions
//(messages, selections, moves, attacks) that game.js executes one by one with getAction().
//After turn 4 the players are handed over to the human and the normal AI.
//player is the scripted player, map the scenario map with the tutorial units on it.
//The constructor's body keeps the state in its closure and sets up the methods, as AI's does
export class AIScripted
{
	declare buildActions: () => void;
	declare getAction: () => AIAction;

	constructor(player: Player, map: GameMap)
	{
		var actionList: AIAction[] = [];
		var units: TutorialUnits = { axis: {}, allies: {} };

		//Queues an action for game.js, param is the array of action parameters
		function addAction(type: number, param: AIActionParam[])
		{
			actionList.push({ type: type, param: param });
		}

		//Queues the actions of the current turn for this player
		function buildTurnActions(): void
		{
			switch (map.turn)
			{
				case 1:
				{
					if (player.side == playerSide.axis)
					{
						addAction(actionType.message, ["The objective of the game is to conquer all enemy positions marked by a golden frame and enemy flag. This is one of the positions. Moving one of your units into this position will capture this city and raise your flag over it.",
							{ row: 8, col: 15 }]);
						addAction(actionType.message, ["This is the second primary objective since it has your enemy flag (Republican Spain) and a golden frame around. Capturing primary objectives gives you a good amount of points called prestige which can be used to upgrade or buy new troops.",
							{ row: 16, col: 8 }]);
						addAction(actionType.message, ["This is an optional objective with your enemy flag. Although capturing these  objectives won't count towards victory is good to do so for extra prestige and troops experience. Also troops are better reinforced or resupplied in a city.",
							{ row: 11, col: 22 }]);
						let unit = units.axis.legioninf;
						addAction(actionType.select, [unit]);
						addAction(actionType.message, ["This is one of your units and usually represent a historical battalion, the number below is battalion size, usually named strength. Since you are playing as Axis the number is on a grey box. Your enemies (Allied Side) will have this number box in green.",
							{ row: 4, col: 2 }]);
						addAction(actionType.message, ["Units have several stats, click the <span class='smallButtonSubMenu'>i</span> button on the right menu to open a panel with unit stats on the bottom of the screen. Notice the movement range <span class='statsGlyph'>?</span> for this unit is 3. The grey hexes around this unit represent this movement range.",
							{ row: 4, col: 2 }]);
						addAction(actionType.message, ["This unit has a transport, shown by the <span class='smallButtonSubMenu'>[</span> button on the bottom of the screen. While on transports moving range is increased but, except infantry, units become vulnerable to enemy fire. I will now mount and move this unit for you toward objective.",
							{ row: 4, col: 2 }]);
						addAction(actionType.mount, [unit]);
						addAction(actionType.select, [unit]);
						addAction(actionType.move, [unit, { row: 7, col: 9 }]);

						unit = units.axis.recon;
						addAction(actionType.select, [unit]);
						addAction(actionType.message, ["This is a recon unit. Recon units can move multiple times per turn and have bigger spotting range <span class='statsGlyph'>'</span> as the game will only show enemy units in the spotting range of your units. Let's check if there aren't any hidden units near the city.",
							{ row: 8, col: 12 }]);
						addAction(actionType.move, [unit, { row: 10, col: 14 }]);
						addAction(actionType.message, ["The objective is lightly defended by just one infantry unit. Let's move the rest of the units into fire range, destroy the defender and capture the city. When units move watch how the strength number color changes indicating that unit has moved.",
							{ row: 8, col: 15 }]);

						unit = units.axis.pz2a;
						addAction(actionType.move, [unit, { row: 7, col: 11 }]);
						unit = units.axis.ssinf1;
						addAction(actionType.mount, [unit]);
						addAction(actionType.move, [unit, { row: 7, col: 15 }]);
						unit = units.axis.ssinf2;
						addAction(actionType.mount, [unit]);
						addAction(actionType.move, [unit, { row: 8, col: 14 }]);
						unit = units.axis.ssinf3;
						addAction(actionType.mount, [unit]);
						addAction(actionType.move, [unit, { row: 9, col: 14 }]);
						unit = units.axis.arty;
						addAction(actionType.mount, [unit]);
						addAction(actionType.move, [unit, { row: 7, col: 13 }]);
						addAction(actionType.message, ["As we moved all our units and no the targets are in fire range, we should end turn <span class='smallButtonSubMenu'>t</span>which will start enemy turn. If we don't capture all primary objectives in the maximum number of turns (shown left of the top bar) the scenario will end in defeat.",
							{ row: 7, col: 13 }]);
					}
					else
					{
						//The allied infantry in the city attacks the mounted SS infantry
						addAction(actionType.attack, [units.allies.inf1, units.axis.ssinf1]);
					}
					break;
				}
				case 2:
				{
					if (player.side == playerSide.axis)
					{
						addAction(actionType.message, ["Notice how this infantry unit jumped out of transport when attacked, instead of staying in the vulnerable transport. Only infantry units will do this others will not dismount when attached. All units are dismounted at the start of your turn.",
							{ row: 7, col: 15 }]);
						addAction(actionType.message, ["This is an artillery unit, depending on it's fire range <span class='statsGlyph'>&gt;</span> it can fire on enemy positions from afar without suffering losses. Also each attack will soften enemy positions reducing their <span class='statsGlyph'>&quot;</span> entrenchment.",
							{ row: 7, col: 13 }]);
						let attacker = units.axis.arty;
						const defender = units.allies.inf1;
						addAction(actionType.attack, [attacker, defender]);
						addAction(actionType.message, ["We inflicted losses to at least 1 company from the enemy battalion and reduced their entrenchment. Both attacker and defender received combat experience <span class='statsGlyph'>@</span> the later only a small amount since it hasn't inflicted any casualties.",
							{ row: 8, col: 15 }]);
						addAction(actionType.message, ["Entrenchment <span class='statsGlyph'>&quot;</span> of a unit is important as it can avoid loses completely. It's a good idea to always check and reduce entrenchment with artillery or bombers before attacking in close combat. Entrenchment is automatically increased depending on terrain each turn when a unit doesn't move.",
							{ row: 8, col: 15 }]);
						//The units are looked up where turn 1 moved them, at the time the actions are built
						attacker = map.map[8][14].getUnit(false);
						addAction(actionType.message, ["Notice the small circle on the left of the unit strength box. The presence of this circle signifies that the unit hasn't fired yet and can do so. Some units like mounted artillery and mobile air defense can't move and fire in the same turn.",
							{ row: 8, col: 14 }]);
						addAction(actionType.attack, [attacker, defender]);
						addAction(actionType.message, ["Infantry units are usually good at defending cities, as they force attacker in close combat <span class='statsGlyph'>6</span> instead of normal ground combat defense <span class='statsGlyph'>5</span>. Other terrain types (shown right of the top bar) influence combat differently for each unit type.",
							{ row: 8, col: 15 }]);
						attacker = map.map[9][14].getUnit(false);
						addAction(actionType.attack, [attacker, defender]);
						attacker = map.map[7][15].getUnit(false);
						addAction(actionType.attack, [attacker, defender]);
						addAction(actionType.message, ["Since the unit defending the city was destroyed or retreated because of heavy casualties we can now move one of our units to capture this objective and get our prestige reward.",
							{ row: 8, col: 15 }]);
						attacker = map.map[7][11].getUnit(false);
						addAction(actionType.move, [attacker, { row: 8, col: 15 }]);
						addAction(actionType.message, ["The city is now ours, and it's flag changed to your flag. This objective capture also increased your prestige by 150&nbsp;" + UIBuilder.currencyIcon
							+ ". You can check prestige, score, remaining turns  and objectives by clicking anywhere on the top bar.",
							{ row: 8, col: 15 }]);
						addAction(actionType.attack, [attacker, defender]);
						addAction(actionType.message, ["This is the last remaining primary objective. Let's gamble and try capturing it without trying to spot enemy. Capturing objectives in early turns gives a better score.",
							{ row: 16, col: 8 }]);
						attacker = map.map[10][14].getUnit(false);
						addAction(actionType.select, [attacker]);
						addAction(actionType.move, [attacker, { row: 16, col: 8 }]);
						addAction(actionType.message, ["Our unit was surprised by an enemy unit. This happens when you move a unit into an unspotted hex that's occupied by an enemy unit. Surprise attack reduces unit defense and attack values resulting in heavy casualties. Let move to the next turn.",
							{ row: 15, col: 10 }]);
						addAction(actionType.select, [attacker]);
					}
					break;
				}
				//Turns 3 and 4 use the undeclared u and e: implicit globals, kept as in the bundle
				case 3:
				{
					if (player.side == playerSide.axis)
					{
						u = map.map[15][10].getUnit(false);
						addAction(actionType.select, [u]);
						addAction(actionType.message, ["You can reinforce this unit casualties by clicking on the <span class='smallButtonSubMenu'>#</span> button at the bottom of the screen. Reinforcements costs prestige and the amount is reduced by enemy units adjacent to your unit. After reinforce unit can no longer attack or move.",
							{ row: 15, col: 10 }]);
						addAction(actionType.reinforce, [u]);
						u = map.map[7][15].getUnit(false);
						addAction(actionType.select, [u]);
						addAction(actionType.message, ["Let's move the rest of the units towards the objective, note how terrain influence movement range. The longest move range is on road or clear terrain but it also depends on unit movement type shown with symbol <span class='statsGlyph' style='float:none;'>~</span>",
							{ row: 7, col: 15 }]);
						addAction(actionType.mount, [u]);
						addAction(actionType.move, [u, { row: 14, col: 11 }]);
						u = map.map[8][14].getUnit(false);
						addAction(actionType.mount, [u]);
						addAction(actionType.select, [u]);
						addAction(actionType.move, [u, { row: 14, col: 9 }]);
						u = map.map[9][14].getUnit(false);
						addAction(actionType.mount, [u]);
						addAction(actionType.select, [u]);
						addAction(actionType.move, [u, { row: 14, col: 8 }]);
						u = map.map[7][9].getUnit(false);
						addAction(actionType.mount, [u]);
						addAction(actionType.select, [u]);
						addAction(actionType.move, [u, { row: 11, col: 9 }]);
						u = map.map[7][13].getUnit(false);
						addAction(actionType.mount, [u]);
						addAction(actionType.select, [u]);
						addAction(actionType.move, [u, { row: 13, col: 13 }]);
						u = map.map[8][15].getUnit(false);
						addAction(actionType.select, [u]);
						addAction(actionType.move, [u, { row: 12, col: 12 }]);
					}
					break;
				}
				case 4:
				{
					if (player.side == playerSide.axis)
					{
						u = map.map[14][9].getUnit(false);
						addAction(actionType.select, [u]);
						addAction(actionType.message, ["Let's attack the weakest enemy unit on the front line. The attack cursor gives an estimate of your casualties on the left and enemy casualties on the right below the flags of the units involved in combat.",
							{ row: 15, col: 9 }]);
						e = map.map[15][9].getUnit(false);
						addAction(actionType.attack, [u, e]);
						addAction(actionType.message, ["This artillery unit has automatically fired when we attacked. That's because artillery provides support fire to friendly units in their range if attacked. Other units with combat support include air defense and fighter planes when attacked by an enemy plane.",
							{ row: 16, col: 7 }]);
						addAction(actionType.message, ["Luckily our artillery unit has a bigger range than enemy artillery so we can safely move it into fire range without making us vulnerable to enemy fire while in transport.",
							{ row: 13, col: 13 }]);
						u = map.map[13][13].getUnit(false);
						addAction(actionType.mount, [u]);
						addAction(actionType.move, [u, { row: 14, col: 12 }]);
						addAction(actionType.message, ["Armored units are considered hard targets <span class='statsGlyph'>`</span> and will take less casualties from artillery fire than a soft target like infantry or artillery. In some cases armored units are used to deplete the ammo of the defending artillery.",
							{ row: 12, col: 12 }]);
						u = map.map[12][12].getUnit(false);
						addAction(actionType.move, [u, { row: 14, col: 7 }]);
						e = map.map[15][8].getUnit(false);
						addAction(actionType.attack, [u, e]);
						//Empties the fuel right away, so the resupply below has something to do
						u = map.map[15][10].getUnit(false);
						if (u)
							u.fuel = 0;
						addAction(actionType.select, [u]);
						addAction(actionType.message, ["This unit it's out of fuel and it can no longer move.You can always supply ammo <span class='statsGlyph'></span> and fuel to your units by clicking on the <span class='smallButtonSubMenu'>!</span>   button on the bottom of the screen",
							{ row: 15, col: 10 }]);
						addAction(actionType.resupply, [u]);
						//Called now, while building the actions, not when they are executed
						if (game.ui)
							game.ui.mainMenuButton("mainmenu");
						addAction(actionType.message, ["This concludes the tutorial and gives you the control of the army to capture the last objective. Remember to use your prestige to upgrade or buy new units by clicking on the <span class='smallButtonSubMenu'>w</span>  button from the menu on the right side of the screen.",
							{ row: 16, col: 8 }]);
						addAction(actionType.message, ["You should attack enemy artillery with your own artillery and move your tanks and attack the enemy artillery. There is a possibility that your armor attack will result in an OverRun which completely destroys an unit and allows your armor to continue move and attack.",
							{ row: 16, col: 8 }]);
						addAction(actionType.message, ["Remember to tap or click the <span class='smallButtonSubMenu'>t</span> end turn button twice to end your turns. Depending on scenario you or the enemy might also receive reinforcements. On this tutorial you will receive reinforcements next turn.",
							{ row: 16, col: 8 }]);
					}
					break;
				}
				default:
				{
					//Tutorial over: side 0 goes to the human player, the other side to the normal AI
					if (player.side == 0)
					{
						player.handler = null;
						player.type = playerType.humanLocal;
					}
					else
					{
						player.handler = new AI(player, game.scenario.map);
						player.type = playerType.aiLocal;
					}
				}
			}
		}

		//The tutorial units, picked from their starting positions
		units.axis.recon = map.map[8][12].getUnit(false);
		units.axis.legioninf = map.map[4][2].getUnit(false);
		units.axis.pz2a = map.map[9][6].getUnit(false);
		units.axis.ssinf1 = map.map[8][6].getUnit(false);
		units.axis.ssinf2 = map.map[9][5].getUnit(false);
		units.axis.ssinf3 = map.map[9][4].getUnit(false);
		units.axis.arty = map.map[8][4].getUnit(false);
		units.allies.inf1 = map.map[8][15].getUnit(false);

		buildTurnActions();

		//Called by Map at the start of this player's turn
		this.buildActions = function()
		{
			buildTurnActions();
			firstTurn = false; //implicit global, nothing else uses it
		}

		//Returns the next queued action and removes it from the list, null when there are none left
		this.getAction = function()
		{
			if (actionList.length == 0) return null;
			const action = actionList[0];
			actionList.splice(0, 1);
			return action;
		}
	}
}

/**
 * Style - basic styles support for rendering on canvas
 */
//How Render draws a hex outline and fill
export interface HexStyle
{
	fillColor: string; //null for no fill
	lineColor: string;
	lineWidth: number;
	lineJoin: CanvasLineJoin;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	shadowColor?: string;
}
export type HexStyleName = "move" | "movespotted" | "attack" | "current" | "currentstroke" | "generic" | "deploy"
	| "ownunit" | "airunit" | "combat";

export var hexstyle: { [name in HexStyleName]: HexStyle } =
{
	"move": //Move selected hexes
	{
		"fillColor": "rgba(120,100,100,0.5)",
		"lineColor": "rgba(0,0,0,0.4)",
		"lineWidth":  1,
		"lineJoin":  "miter"
	},
	"movespotted": //Move selected hexes that are spotted
	{
		"fillColor": "rgba(128,128,128,0.5)",
		"lineColor": "rgba(0,0,0,0.4)",
		"lineWidth":  1,
		"lineJoin":  "miter"
	},
	"attack":  //Attack selected hexes
	{
		"fillColor": null,
		"lineColor": "rgba(239, 0, 0,0.8)",
		"lineWidth":  3,
		"lineJoin":  "miter"
	},
	"current": //Current selected hex
	{
		"fillColor": null,
		"lineColor": "rgba(255, 240, 0, 0.8)",
		"lineWidth": 3,
		"lineJoin": "round"
	},
	"currentstroke": //Outline of the current selected hex
	{
		"fillColor": null,
		"lineColor": "rgba(0, 0, 0, 0.9)",
		"lineWidth": 2,
		"shadowOffsetX": 1,
		"shadowOffsetY": 2,
		"shadowColor": "black",
		"lineJoin": "round"
	},
	"generic": //Generic hex grid
	{
		"fillColor": null,
		"lineColor": "rgba(39,44,47,0.9)",
		"lineWidth": 0.4,
		"lineJoin": "miter"
	},
	"deploy": //Deployment hexes
	{
		"fillColor": "rgba(128,128,128,0.8)",
		"lineColor": "rgba(0,0,0,0.4)",
		"lineWidth":  1,
		"lineJoin":  "miter"
	},
	"ownunit": //Hex that has a current player unit on it
	{
		"fillColor": "rgba(30,144,255,0.3)",
		"lineColor": "rgba(0,0,0,0.4)",
		"lineWidth":  0,
		"lineJoin":  "miter"
	},
	"airunit": //Hex that has a current player air unit on it
	{
		"fillColor": "rgba(30,144,255,0.3)",
		"lineColor": "rgba(50, 110, 240,0.6)",
		"lineWidth":  2,
		"lineJoin":  "miter"
	},
	"combat": //Hexes of the units in combat
	{
		"fillColor": "rgba(255, 255, 255,0.15)",
		"lineColor": "rgba(239,0,0,0.7)",
		"lineWidth":  2,
		"lineJoin":  "miter"
	}
};

export var unitstyle =
{
	axisBox				: "#383838", //grey
	alliedBox			: "#808000", //green
	axisBorder			: "rgba(211, 211, 211, 1)",
	alliedBorder		: "rgba(127, 255, 0, 1)",
	enemyBoxMarked		: "#FF0000", //red
	playerText			: "white",
	alliedPlayerText	: "#696969", //light brown
	movedUnitText		: "#BDBDBD", //dark grey
	axisPlate			: "#4f6b80", //the unit marker plates, from the design system's axis and allied
	alliedPlate			: "#9c3b22",
	plateText			: "#ffffff",
	plateEdge			: "rgba(0, 0, 0, 0.75)",
	coreEdge			: "#d9a441", //brass: core units' plate edge, experience bars and leader star
	readyBack			: "rgba(20, 22, 15, 0.75)",
	readyMark			: "#ffffff",
	supplyLow			: "#f2c84b",
	supplyCritical		: "#ff7a66",
	supplyText			: "#1d170b",
	terrainText			: "#333333",
	terrainTextStroke	: "#f8e064"
};

export var tooltipColor = { player: 0, enemy: 1 };
export var tooltipStyle = { text: 0, pin: 1 };

export var terrainencoding = ["A", "B", "C", "D", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "Q"];

/**
 * Sound sound interface for OpenPanzer
 */
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
