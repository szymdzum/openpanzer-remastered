/**
 * Style - basic styles support for rendering on canvas
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, where it followed AIScripted (aiscripted.ts
 * re-exports it); names and comments carried over from the openpanzer 2.9 style.js.
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
