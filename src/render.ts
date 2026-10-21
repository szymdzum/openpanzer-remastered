/**
 * Render - draws the graphic elements on canvases
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

import {
	Cell, direction, directionToRadians, type movementResults, type pathCell, screenPos, terrainType,
	uiSettings
} from "./prototypes";
import { Equipment } from "./equipment";
import { $, addTag, type VendorStyled } from "./dom";
import { type HexStyle, hexstyle, terrainencoding, unitstyle } from "./aiscripted";
import { type AnimationCBData, AnimationChain, animationsData } from "./animation";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import type { GameMap, Hex, UnitImagesList } from "./map";
import { UIBuilder } from "./uibuilder";
import { game } from "./game";
import { OSGlue } from "./osglue";

//What Render.moveAnimation is given (see UI moveUnit): called back with itself when the move ends
export interface MoveAnimationCBData
{
	unit: Unit;
	moveResults: movementResults;
	cbfunc(moveAnimationCBData: MoveAnimationCBData): void;
}

//The canvas 2d context with the vendor prefixed smoothing flags the game still sets. The
//canvas converts the text to draw to a string, Render draws numbers (unit strength, losses)
export type RenderContext = CanvasRenderingContext2D & {
	webkitImageSmoothingEnabled?: boolean;
	mozImageSmoothingEnabled?: boolean;
	fillText(text: number, x: number, y: number): void;
	strokeText(text: number, x: number, y: number): void;
};

//The map rows and cols of a zone, end excluded
export interface ZoneRangeLimits
{
	srow: number;
	scol: number;
	erow: number;
	ecol: number;
}

//Device pixels per CSS pixel the renderer draws at: 2 on high density screens when the
//@2x images are on, 1 otherwise (and with useRetina, where the page already runs at device pixels)
function hdScale(): number
{
	if (!uiSettings.hdGraphics || uiSettings.useRetina)
		return 1;
	return (window.devicePixelRatio || 1) >= 1.5 ? 2 : 1;
}

//The @2x file of a map or unit image, generated into public/hd/ by scripts/upscale-assets.sh:
//resources/maps/images/map_12.png -> /hd/maps/images/map_12.webp,
//resources/units/images/pa909.png -> /hd/units/images/pa909.webp. null for any other image
function hdPath(path: string): string | null
{
	if (path.indexOf("resources/maps/images/") == 0 || path.indexOf("resources/units/images/") == 0)
		return "/hd/" + path.slice("resources/".length).replace(/\.png$/, ".webp");
	return null;
}

//The biggest canvas Safari on iOS allows, in pixels
var maxCanvasPixels = 16777216;

//A class with its closure body as the constructor: the methods are own properties, as the original
export class Render
{
	declare render: (orow?: number, ocol?: number, range?: number) => void;
	declare drawCursor: (cell: Cell) => void;
	declare drawHexByCell: (cell: Cell, style: HexStyle) => void;
	declare runAnimation: (animationCBData: AnimationCBData | null) => void;
	declare addAnimation: (row: number, col: number, animationName: string, facing?: number) => boolean;
	declare moveAnimation: (moveAnimationCBData: MoveAnimationCBData) => void;
	declare screenToCell: (x: number, y: number) => Cell;
	declare cellToScreen: (row: number, col: number, absolute?: boolean) => screenPos;
	declare cacheImages: (func: () => void) => void;
	declare getHexesCanvas: () => HTMLCanvasElement;
	declare getMapCanvas: () => HTMLCanvasElement;
	declare getCursorCanvas: () => HTMLCanvasElement;
	declare setNewMap: (mapObj: GameMap) => void;
	declare positionLayers: () => void;
	declare getMapSize: () => { width: number; height: number };

	constructor(mapObj: GameMap)
	{
		var map = mapObj;

		var imgUnits: { [file: string]: HTMLImageElement } = {};
		var imgAttackCursor: HTMLImageElement = null;
		var imgFlags: HTMLImageElement = null;
		var imgMapBackground: HTMLImageElement = null;
		var imgUnitFire: HTMLImageElement = null;
		var imgUnitNoAmmo: HTMLImageElement = null;
		var imgBridge: HTMLImageElement = null; //Drawn instead of a ground unit sitting on a bridge of its side
		var imgLeaderAxis: HTMLImageElement = null;
		var imgLeaderAllied: HTMLImageElement = null;

		var dpr = hdScale(); //Canvas pixels per CSS pixel, all drawing stays in CSS pixels
		var imgScale = new WeakMap<HTMLImageElement, number>(); //2 for an image loaded from its @2x file
		var mapW = 0; //Map image size in CSS pixels, whichever file it was loaded from
		var mapH = 0;

		var drawnHexGrid = false; //Force first time rendering of hex grid but prevent redraw if no changes
		var lastCursorCell: Cell = null; //Last cell for which the cursor was built
		var lastCursorImage: string = null;//last cursor image
		var lastCursorUnit: Unit = null; //last unit for which a cursor was generated

		var ch: HTMLCanvasElement; // The hexes canvas element
		var cm: HTMLCanvasElement; // The map canvas element
		var ca: HTMLCanvasElement; // The animation canvas element.Also used as cursor coords but c canvas can be used as well
		var cbb: HTMLCanvasElement; //A backbuffer canvas for dynamically creating images (as in cursor image)
		var cubb: VendorStyled<HTMLCanvasElement>; //A backbuffer canvas for dynamically creating unit images //TODO: merge the 2 backbuffers into one
		var c: RenderContext = null; //This is the context where the main drawing takes place (units, move and attack selection)
		var cb: RenderContext = null;//This is the context where the map image and hex grid is drawn.
		var a: RenderContext = null; //This is where the animations(explosions/fire/etc) are drawn. Also used as cursor coords but c canvas can be used as well
		var bb: RenderContext = null; //Backbuffer context
		var ubb: RenderContext = null; //Backbuffer for unit rendering

		//Hex sizes compatible with PG2 sizes
		var s = 30;  //hexagon segment size                    |\
		var h = s/2; //hexagon height h = sin(30)*s           r| \ s
		var r = 25;  //hexagon radius r = cos(30)*s ~ s*0.833  -h-

		//Medium flag sizes used to mark objectives on map
		var flw = 21; //Flag width
		var flh = 14; //Flag height

		// Canvas offset from the browser window (leaves space for top menu)
		var canvasOffsetX = 0;
		var canvasOffsetY = 30;
		// Where to start rendering respective to the canvas
		// Since PG2 maps define even the half and "quarter" hexes that form at the edges we need to offset those
		var renderOffsetX = - (s + h);
		var renderOffsetY = - r;

		//we slice the screen in columns of s + h size
		var colSlice = s + h;
		//add an offset for better rounding of mouse position in a column
		var mousePrecisionOffset = s/100;
		//Unit strength text size (px)
		var unitTextHeight = 8;
		//Animation Chain
		var animationChain = new AnimationChain();

		//Check if the canvases already exists in the curent document to prevent
		//overlaying multiple rendering instances
		//Map image as background
		if ((cm = $('map')) === null) cm = addTag('game', 'canvas');
		cm.id = "map";
		// Hexes/units/flags
		if ((ch = $('hexes')) === null) ch = addTag('game', 'canvas');
		ch.id = "hexes";
		// Animation and cursors
		if ((ca = $('cursor')) === null) ca = addTag('game', 'canvas');
		ca.id = "cursor";
		// Backbuffer (not added as child to DOM)
		cbb = addTag(null, 'canvas');
		cbb.id = "backbuffer";

		// Unit Backbuffer used for moving units as css sprites
		if ((cubb = $('unitbackbuffer')) === null) cubb = addTag('game', 'canvas');
		cubb.id = "unitbackbuffer";

		cb = cm.getContext('2d') as RenderContext;
		c = ch.getContext('2d') as RenderContext;
		a = ca.getContext('2d') as RenderContext;
		bb = cbb.getContext('2d') as RenderContext;
		ubb = cubb.getContext('2d') as RenderContext;

		cbb.width = cbb.height = 54; //Currently the size of the attack cursor
		cubb.width = cubb.height = 120 * dpr; //Currently the max size of a unit sprite //TODO compute this
		if (dpr > 1)
			cubb.style.width = cubb.style.height = "120px"; //at 1x the canvas stays as the original (no css size)
		ubb.setTransform(dpr, 0, 0, dpr, 0, 0);

		//Renders the units/decals/hexgrid if orow,ocol and range are defined then it will
		//only partially render the canvas around orow,ocol with range around this location
		//Called without parameters it renders the whole map (range + 1 is NaN)
		this.render = function(orow, ocol, range)
		{
			var x0: number, y0: number;

			//Since cellToScreen returns top left corner of a hex in range we need to increase the range with at least 1 hex
			//but since the clearing rectangle can half clear staggered hexes we render by 2 more hexes in each direction but
			//we only clear a 1 hex smaller area in each direction
			var clearZone = getZoneRangeLimits(orow, ocol, range + 1); //the map (cell) coords that will be cleared by clearRect
			var renderZone = getZoneRangeLimits(orow, ocol, range + 2); //the map (cell) coords that will be rendered hex by hex

			var hex: Hex;
			var current: Cell = null;
			var unit: Unit = null;
			var drawHexGrid = false;

			if (uiSettings.hexGrid != drawnHexGrid)
			{
				drawnHexGrid = drawHexGrid = uiSettings.hexGrid;
				cb.clearRect(0, 0, mapW, mapH + 65);
			}

			if (map.currentUnit !== null)
				current = map.currentUnit.getPos();

			var spos = cellToScreen(clearZone.srow, clearZone.scol, false);
			var epos = cellToScreen(clearZone.erow, clearZone.ecol, false);

			c.clearRect(spos.x, spos.y, epos.x - spos.x, epos.y - spos.y);

			for (var row = renderZone.srow; row < renderZone.erow; row++)
			{
				//we space the hexagons on each line next column being on the row below
				for (var col = renderZone.scol; col < renderZone.ecol; col++)
				{
					hex = map.map[row][col];

					//flat-out hex layout //inline for performance gain
					if (col & 1) // odd column
						y0 = row * 2 * r + r + renderOffsetY;
					else
						y0 = row * 2 * r + renderOffsetY;
					x0 = col * (s + h) + h + renderOffsetX;

					if ((current !== null) && (typeof current !== "undefined")
						&& (row == current.row) && (col == current.col))
					{
						drawHex(c, x0, y0, hexstyle.currentstroke);
						drawHex(c, x0, y0, hexstyle.current);
					}

					//Show deployment hexes of the current player side on deploy mode
					if (uiSettings.deployMode && hex.isDeployment > -1
						&& map.getPlayer(hex.isDeployment).side == map.currentPlayer.side)
						drawHex(c, x0, y0, hexstyle.deploy);

					//Strategic map: only flags, of the units and of the victory hexes
					if (uiSettings.strategicZoom)
					{
						var tx = (x0 + (s - h)/2 - flw/2) >> 0;
						var ty = (y0 + r - flh - 2) >> 0;
						var flag = -1;
						var scale = 0;
						var flagUnit: Unit = null;

						c.save();
						//Only renders flag for air or ground units not both if they are spotted
						if (hex.isSpotted(map.currentPlayer.side))
						{
							if (uiSettings.airMode)
								flagUnit = hex.airunit;
							else
								flagUnit = hex.unit;

							if (flagUnit !== null)
							{
								flag = flagUnit.player.country;
								scale = 1.4;
								if (flagUnit.hasMoved)
									c.globalAlpha = 0.6;
							}
						}
						if (hex.flag != -1 && hex.victorySide != -1)
						{
							flag = hex.flag;
							scale = 3;
						}
						//The context is only restored when a flag is drawn, the saved states pile up otherwise
						if (flag != -1)
						{
							c.drawImage(imgFlags, flw * flag, 0, flw, flh, tx, ty, scale * s, scale * s/(flw/flh));
							c.restore();
						}
						continue;
					}

					if (uiSettings.showHiddenVictoryHexes)
					{
						//Victory hexes without a flag get the flag of their owner and a thicker box
						var vtx = (x0 + s/2 - flw/2) >> 0;
						var vty = (y0 + 2 * r - flh - 2) >> 0;
						var boxWidth = 2;
						var vflag = hex.flag;

						if (hex.victorySide != -1)
						{
							if (vflag == -1 && hex.owner != -1)
							{
								vflag = map.getPlayer(hex.owner).country;
								boxWidth = 6;
							}
							c.beginPath();
							c.lineWidth = boxWidth;
							c.strokeStyle = "rgba(139,0,0,1)";
							c.strokeRect(vtx - 1, vty - 1, flw + 2, flh + 2);
							c.strokeStyle = "rgba(127,255,0,1)";
							c.strokeRect(vtx - 3, vty - 3, flw + 6, flh + 6);
							c.strokeStyle = "rgba(0,0,0,1)";
							c.lineWidth = 1;
							c.strokeRect(vtx - 4, vty - 4, flw + 8, flh + 8);
							c.closePath();
						}
						if (vflag != -1)
							c.drawImage(imgFlags, flw * vflag, 0, flw, flh, vtx, vty, flw, flh);
					}
					else
					{
						//Hex decals
						if (hex.flag != -1)
						{
							var dtx = (x0 + s/2 - flw/2) >> 0;
							var dty = (y0 + 2 * r - flh - 2) >> 0;

							c.drawImage(imgFlags, flw * hex.flag, 0, flw, flh, dtx, dty, flw, flh);

							if (hex.victorySide != -1)
							{
								c.beginPath();
								c.lineWidth = 2;
								c.strokeStyle = "rgba(139,0,0,1)";
								c.strokeRect(dtx - 1, dty - 1, flw + 2, flh + 2);
								c.strokeStyle = "rgba(127,255,0,1)";
								c.strokeRect(dtx - 3, dty - 3, flw + 6, flh + 6);
								c.strokeStyle = "rgba(0,0,0,1)";
								c.lineWidth = 1;
								c.strokeRect(dtx - 4, dty - 4, flw + 8, flh + 8);
								c.closePath();
							}
						}
					}

					if (drawHexGrid)
						drawHex(cb, x0, y0, hexstyle.generic, hex.terrain);

					//Don't render unit if it has a move animation or it's not spotted by
					//the local playing player side
					unit = hex.getUnit(!uiSettings.airMode);
					if (unit !== null && !unit.hasAnimation
							&& (hex.isSpotted(game.spotSide) || unit.tempSpotted
									|| unit.player.side == game.spotSide))
					{
						if (uiSettings.markOwnUnits && unit.player.id == map.currentPlayer.id)
							drawHex(c, x0, y0, hexstyle.ownunit);
						drawHexUnit(c, x0, y0, unit, false); //Unit below depending on airMode without strength box
					}

					unit = hex.getUnit(uiSettings.airMode);
					if (unit !== null && !unit.hasAnimation
							&& (hex.isSpotted(game.spotSide) || unit.tempSpotted
									|| unit.player.side == game.spotSide))
					{
						if (uiSettings.airMode && hex.airunit !== null)
							drawHex(c, x0, y0, hexstyle.airunit);
						drawHexUnit(c, x0, y0, unit, true); //Unit above with strength box drawn
					}

					//Only show deployment hexes not move/attack hexes on deploy mode
					//Don't show move/attack hexes for non local players
					if (!uiSettings.deployMode && map.currentPlayer.side == game.spotSide)
					{
						if (hex.isMoveSel)
						{
							if (hex.isSpotted(map.currentPlayer.side))
								drawHex(c, x0, y0, hexstyle.movespotted);
							else
								drawHex(c, x0, y0, hexstyle.move);
						}

						if (hex.isAttackSel)
							drawHex(c, x0, y0, hexstyle.attack);
					}

					if (uiSettings.hasTouch && hex.isAttackSel && map.currentUnit) //For touchScreens where we can't have mousecursors
					{
						var localx = x0 - s/2;
						var atkunit = map.currentUnit;
						var defunit = hex.getAttackableUnit(atkunit, uiSettings.airMode);
						//generateAttackCursor returns null without a defending unit and drawImage throws
						c.drawImage(generateAttackCursor(atkunit, defunit, false), localx, y0);
					}
				}
			}
		}

		//Renders attack or transport move cursor
		this.drawCursor = function(cell)
		{
			var row = cell.row;
			var col = cell.col;
			var hex = map.map[row][col];
			var curw = bb.canvas.width; //cursor width
			var curh = bb.canvas.height; //cursor height
			var redraw = false;

			if (lastCursorUnit !== map.currentUnit)
				redraw = true; //Redraw because a new unit has been selected

			//Check if we should generate an ATTACK cursor
			if (hex.isAttackSel && map.currentUnit !== null && !map.currentUnit.hasFired)
			{
				//check cell if a cursor should be generated again
				if ((redraw == true) || (lastCursorCell === null) || (lastCursorImage === null) ||
					(lastCursorCell.row != row) || (lastCursorCell.col != col))
				{
					redraw = true; //Force css cursor assignment
					var atkunit = map.currentUnit;
					var defunit = hex.getAttackableUnit(atkunit, uiSettings.airMode);
					lastCursorUnit = atkunit;
					lastCursorCell = cell;
					lastCursorImage = generateAttackCursor(atkunit, defunit, true);
				}
				//only assign a new css cursor if needed (to reduce html element load)
				if ((ca.style.cursor == 'default') || (ca.style.cursor == 'pointer')
					|| (ca.style.cursor == 'auto') || (redraw == true))
				{
					//cursor data, hotspot x, hotspot y, fallback cursor image
					ca.style.cursor = "url('" + lastCursorImage + "') " + curw/2 + " " + curh/2 +", auto";
				}
			}
			else
			{
				//TODO PG2 default cursor
				ca.style.cursor = 'default';
			}
		}

		//Draws a hex with a style on the units canvas (used to mark the hexes in combat)
		this.drawHexByCell = function(cell, style)
		{
			var pos = cellToScreen(cell.row, cell.col, false);
			drawHex(c, pos.x, pos.y, style);
		}

		//Runs all animations in order that they were added and then delete all animations
		this.runAnimation = function(animationCBData)
		{
			animationChain.start(animationCBData);
		}

		//Adds an animation to the list
		this.addAnimation = function(row, col, animationName, facing)
		{
			if (! (animationName in animationsData))
				return false;

			if (typeof facing === "undefined")
				facing = direction.N;
			var anim = animationsData[animationName](); //a new sprite each time
			var pos = cellToScreen(row, col);

			animationChain.add({
				ctx: a,
				x: (pos.x - anim.width/2 + s/2) >> 0,
				y: (pos.y - anim.image.height/2 + r) >> 0,
				rotate: directionToRadians[facing],
				sprite: anim
			});

			return true;
		}

		//TODO stop another running animation
		this.moveAnimation = function(moveAnimationCBData)
		{
			if (moveAnimationCBData.unit === null) return;
			var ma = new MoveAnimation(moveAnimationCBData);
			ma.movTimer = setInterval( function() { ma.start();}, ma.delay);
		}

		//Animates the unit moving thru a list of cells
		//A class with its closure body as the constructor, as Render
		class MoveAnimation
		{
			declare movTimer: ReturnType<typeof setInterval>;
			declare delay: number;
			declare directDraw: (cPos: screenPos, unit: Unit) => void;
			declare cssDraw: (cPos: screenPos, unit: Unit, needRedraw: boolean) => void;
			declare start: () => void;

			constructor(moveAnimationCBData: MoveAnimationCBData)
			{
				var animSteps = 5;
				var movIndex = 0;
				var movStep = 0;
				var unit = moveAnimationCBData.unit;
				var cellList = moveAnimationCBData.moveResults.passedCells as pathCell[]; //moveUnit fills it with pathCells
				var cPos: screenPos, dPos: screenPos;
				var cCell: pathCell, dCell: pathCell;
				var xstep: number, ystep: number;
				var actualFacing: number;
				var needRedraw = true;

				this.movTimer = null;
				this.delay = uiSettings.quickAnimation ? 5 : 30;

				//Directly blits the unit to the animation canvas (slow on Android) //unused
				this.directDraw = function(cPos, unit)
				{
					a.clearRect(cPos.x - 20, cPos.y - 20, 80, 70); //hex size + 20
					cPos.x += xstep;
					cPos.y += ystep;
					drawHexUnit(a, cPos.x, cPos.y, unit, false);
				}
				//Blits unit image to a separate canvas and animates using css properties
				this.cssDraw = function(cPos, unit, needRedraw)
				{
					if (needRedraw)
					{
						ubb.clearRect(0, 0, ubb.canvas.width, ubb.canvas.height);
						//Offset the sprite drawing on canvas otherwise it will be clipped
						drawUnitSprite(ubb, -renderOffsetX, -renderOffsetY, unit);
						if (cubb.style.display == "none")
							cubb.style.display = "inline";
					}
					cPos.x += xstep;
					cPos.y += ystep;
					if (!uiSettings.use3D)
					{
						cubb.style.top = cPos.y + renderOffsetY + "px";
						cubb.style.left = cPos.x + renderOffsetX + "px";
					}
					else
					{
						var transform = "translate3d(" + 1*(cPos.x + renderOffsetX) + "px, " + 1*(cPos.y + renderOffsetY) + "px, 0)";

						if (cubb.style.transition != "linear")
						{
							cubb.style.MozTransition = "linear";
							cubb.style.webkitTransition = "linear";
							cubb.style.transition = "linear";
						}

						cubb.style.MozTransform = transform;
						cubb.style.webkitTransform = transform;
						cubb.style.transform = transform;
					}
				}

				this.start = function()
				{
					if (movIndex >= cellList.length - 1)
					{
						movStep = 0;
						movIndex = 0;
						clearInterval(this.movTimer);
						unit.hasAnimation = false;
						cubb.style.display = "none";
						moveAnimationCBData.cbfunc(moveAnimationCBData);
						return;
					}

					if (movStep == 0)
					{
						cCell = cellList[movIndex];
						dCell = cellList[movIndex + 1];

						cPos = cellToScreen(cCell.row, cCell.col);
						dPos = cellToScreen(dCell.row, dCell.col);

						xstep = ((dPos.x - cPos.x)/animSteps) >> 0;
						ystep = ((dPos.y - cPos.y)/animSteps) >> 0;

						actualFacing = GameRules.getDirection(cCell.row, cCell.col, dCell.row, dCell.col);

						if (Math.abs(actualFacing - unit.facing) > 1)
						{
							unit.facing = actualFacing;
							needRedraw = true;
						}
					}

					//Only the cells the local player sees show the moving unit
					if (cellList[movIndex].isVisible)
						this.cssDraw(cPos, unit, needRedraw);

					needRedraw = false;
					movStep++;

					if (movStep >= animSteps)
					{
						movIndex++;
						movStep = 0;
					}
				}
			}
		}

		//Converts from screen x,y to row,col in map array
		this.screenToCell = function(x, y)
		{
			var vrow: number; //virtual graphical rows
			var trow: number, tcol: number; //true map rows/cols

			//If we're in tactical map scale the values coresponding to zoom level
			if (uiSettings.mapZoom)
			{
				x = x / uiSettings.zoomLevel;
				y = y / uiSettings.zoomLevel;
			}
			//Strategic map is scaled down by css
			if (uiSettings.strategicZoom)
			{
				x = x * uiSettings.strategicZoomLevel;
				y = y * uiSettings.strategicZoomLevel;
			}

			tcol = Math.round((x - renderOffsetX) / colSlice + mousePrecisionOffset) - 1;
			//a graphical row (half hex) not the array row
			vrow = (y - renderOffsetY * (~tcol & 1)) / r; //Half hexes add r if col is odd
			//shift to correct row index
			trow = Math.round(vrow/2 - 1 * (vrow & 1));
			if (trow < 0) { trow = 0; }
			if (trow > map.rows - 1) trow = map.rows - 1;
			if (tcol > map.cols - 1) tcol = map.cols - 1;
			return new Cell(trow, tcol);
		}

		//Returns the top corner position of a hex in screen coordinates relative to canvas
		//if absolute is set canvas offsets are added to positions and the result is scaled by zoom level
		function cellToScreen(row: number, col: number, absolute?: boolean): screenPos
		{
			var x0: number, y0: number;

			if (col & 1) // odd column
				y0 = row * 2 * r + r + renderOffsetY;
			else
				y0 = row * 2 * r + renderOffsetY;
			x0 = col * (s + h) + h + renderOffsetX;

			if (absolute)
			{
				var vp = $('game');
				x0 += canvasOffsetX - vp.clientLeft - vp.offsetLeft;
				y0 += canvasOffsetY - vp.clientTop - vp.offsetTop;
				x0 *= uiSettings.zoomLevel;
				y0 *= uiSettings.zoomLevel;
			}

			return new screenPos(x0, y0);
		}
		this.cellToScreen = function(row, col, absolute) { return cellToScreen(row, col, absolute); }

		//Caches images, func a function to call upon cache completion
		this.cacheImages = function(func)
		{
			if (!imgAttackCursor)
			{
				imgAttackCursor = new Image();
				imgAttackCursor.src = "resources/ui/cursors/attack.png";
			}
			if (!imgFlags)
			{
				imgFlags = new Image();
				imgFlags.src = "resources/ui/flags/" + Equipment.name + "/flags_med.png";
			}
			if (!imgUnitFire)
			{
				imgUnitFire = new Image();
				imgUnitFire.src = "resources/ui/indicators/unit-fire.png";
			}
			if (!imgUnitNoAmmo)
			{
				imgUnitNoAmmo = new Image();
				imgUnitNoAmmo.src = "resources/ui/indicators/unit-fire-no-ammo.png";
			}
			if (!imgLeaderAxis)
			{
				imgLeaderAxis = new Image();
				imgLeaderAxis.src = "resources/ui/indicators/unit-leader-axis.png";
			}
			if (!imgLeaderAllied)
			{
				imgLeaderAllied = new Image();
				imgLeaderAllied.src = "resources/ui/indicators/unit-leader-allied.png";
			}
			if (!imgBridge)
			{
				imgBridge = new Image();
				loadImage(imgBridge, "resources/units/images/bridg.png");
			}
			if (!imgMapBackground)
			{
				imgMapBackground = new Image();
				imgMapBackground.onload = function()
				{
					var k = imgScale.get(imgMapBackground) || 1;
					mapW = imgMapBackground.width / k;
					mapH = imgMapBackground.height / k;
					//A map too big for a canvas at 2x (iOS) is drawn at 1x, the map image stays sharp as css background
					if (mapW * dpr * (mapH + 65) * dpr > maxCanvasPixels)
						dpr = 1;
					//Size the canvases to the map image, with 65px more height, at dpr canvas pixels per css pixel
					cm.width = ch.width = ca.width = mapW * dpr;
					cm.height = ch.height = ca.height = (mapH + 65) * dpr;
					cm.style.cssText = ch.style.cssText = ca.style.cssText = "";
					cm.style.width = ch.style.width = ca.style.width = mapW + "px";
					cm.style.height = ch.style.height = ca.style.height = mapH + 65 + "px";
					//Resizing reset the contexts, drawing coordinates stay in css pixels
					cb.setTransform(dpr, 0, 0, dpr, 0, 0);
					c.setTransform(dpr, 0, 0, dpr, 0, 0);
					a.setTransform(dpr, 0, 0, dpr, 0, 0);

					cb.imageSmoothingEnabled = false;
					cb.webkitImageSmoothingEnabled = false;
					cb.mozImageSmoothingEnabled = false;
					c.imageSmoothingEnabled = false;
					c.webkitImageSmoothingEnabled = false;
					c.mozImageSmoothingEnabled = false;
					a.imageSmoothingEnabled = false;
					a.webkitImageSmoothingEnabled = false;
					a.mozImageSmoothingEnabled = false;
					ubb.imageSmoothingEnabled = false;
					ubb.webkitImageSmoothingEnabled = false;
					ubb.mozImageSmoothingEnabled = false;

					setupLayers();
					func();
				}
				loadImage(imgMapBackground, map.terrainImage, function()
				{
					UIBuilder.message("Error", OSGlue.canvasErrorMsg);
				});
			}

			cacheUnitImages(map.getUnitImagesList(), func);
		}

		//Returns canvases
		this.getHexesCanvas = function() { return ch; }
		this.getMapCanvas = function() { return cm; }
		this.getCursorCanvas = function() { return ca; }
		//The size of the canvases in css pixels (their width/height are in canvas pixels)
		this.getMapSize = function() { return { width: mapW, height: mapH + 65 }; }

		//Sets a new map for rendering. Only used to dinamically change the map being rendered
		this.setNewMap = function(mapObj)
		{
			map = mapObj;
			drawnHexGrid = false;
			//Force reload of background image and flags
			imgFlags = imgMapBackground = null;
			//Cleanup no longer user unit images
			var imgList = map.getUnitImagesList();
			for (var i in imgUnits)
			{
				//Looks up the Image object instead of its file name: always undefined, so the whole cache is cleared
				if (typeof imgList[imgUnits[i] as unknown as number] === "undefined")
				{
					imgUnits[i] = null;
					delete(imgUnits[i]);
				}
			}
		}

		//Positions the canvases (after the map image is loaded, on zoom and window resize)
		this.positionLayers = function() { return setupLayers(); }

		// "Private"
		//Sets canvases position on screen and the size of the game area
		function setupLayers(): void
		{
			var fitsWidth = false;
			var fitsHeight = false;
			var hScrollHeight = 0; //Room for the horizontal scrollbar when the map is wider than the window
			var vScrollWidth = 0; //Room for the vertical scrollbar when the map is higher than the window

			canvasOffsetX = window.innerWidth/2 - mapW/2;
			if (canvasOffsetX < 0) { canvasOffsetX = 0;}

			cm.style.cssText += "z-index: 0; position:absolute; left: 0px; top: 0px;";
			ch.style.cssText += "z-index: 1; position:absolute; left: 0px; top: 0px;";
			ca.style.cssText += "z-index: 2; position:absolute; left: 0px; top: 0px;";
			cubb.style.cssText += "z-index: 3; position:absolute; left: 0px; top: 0px;";
			cubb.style.display = "none";
			//Add map image as background
			cm.style.cssText += "background-color: none; background-image:url('" + imgMapBackground.src + "');"
					+ "background-size:" + mapW + "px " + mapH + "px;"
					+ "background-repeat: no-repeat;"
					+ "background-attachment: scroll;";

			if (window.innerWidth >= mapW)
				fitsWidth = true;
			else
				hScrollHeight = 10;

			if (window.innerHeight >= mapH + canvasOffsetY)
				fitsHeight = true;
			else
				vScrollWidth = 30;

			//Size the container div to the map or to the browser window when the map is bigger
			//The user will scroll the div instead of window
			if (fitsWidth)
				$('game').style.width = mapW + vScrollWidth + "px";
			else
				$('game').style.width = window.innerWidth + "px";

			if (fitsHeight)
				$('game').style.height = mapH + canvasOffsetY + hScrollHeight + "px";
			else
				$('game').style.height = window.innerHeight - canvasOffsetY + "px";

			// Center the game area
			$('game').style.cssText += "position:absolute;left:" + canvasOffsetX + "px;top:" + canvasOffsetY + "px;";
			$('game').tabIndex = 1; //For focusing the game area
			$('game').focus();
		}

		//Generates an attack cursor on backbuffer canvas
		function generateAttackCursor(atkunit: Unit, defunit: Unit, asDataURL: true): string;
		function generateAttackCursor(atkunit: Unit, defunit: Unit, asDataURL: false): HTMLCanvasElement;
		function generateAttackCursor(atkunit: Unit, defunit: Unit, asDataURL: boolean): string | HTMLCanvasElement
		{
			var bbw = bb.canvas.width;
			var bbh = bb.canvas.height;

			if (!atkunit || !defunit)
				return null;

			var atkflag = atkunit.flag - 1; //flags from 1-25, array from 0-24
			var defflag = defunit.flag - 1;
			var cr = GameRules.calculateCombatResults(atkunit, defunit, map.getUnits(), false, true);

			bb.clearRect(0, 0, bbw, bbh);
			bb.drawImage(imgAttackCursor, bbw/2 - imgAttackCursor.width/2, bbh/2 - imgAttackCursor.height/2);
			bb.drawImage(imgFlags, flw*atkflag, 0, flw, flh, 0, 0, flw, flh);
			bb.drawImage(imgFlags, flw*defflag, 0, flw, flh, bbw - flw, 0, flw, flh);

			//estimated losses and kills
			bb.font = unitTextHeight + "px coreUnitFont, sans-serif";
			bb.fillStyle = "yellow";
			bb.textBaseline = "top";

			var tx = flw/2 - 4;
			var ty = flh;
			bb.strokeText(cr.losses, tx+1, ty+1);
			bb.fillText(cr.losses, tx, ty);
			tx = bbw - flw/2 - 4;
			bb.strokeText(cr.kills, tx+1, ty+1);
			bb.fillText(cr.kills, tx, ty);

			if (asDataURL)
				return cbb.toDataURL(); //return canvas pixels encoded to base64

			//return a copy of the canvas, the backbuffer is reused for the next cursor
			var copy = document.createElement("canvas");
			copy.width = cbb.width;
			copy.height = cbb.height;
			copy.getContext("2d").drawImage(cbb, 0, 0);
			return copy;
		}

		//Loads a game image, from its @2x file first when drawing at 2x. Without one (or when it fails to load)
		//it falls back to the original file, so the hd folder can be missing or partly generated
		function loadImage(img: HTMLImageElement, path: string, onerror?: () => void): void
		{
			var hd = dpr > 1 ? hdPath(path) : null;
			if (hd === null)
			{
				if (onerror) img.onerror = onerror;
				img.src = path;
				return;
			}
			imgScale.set(img, 2);
			img.onerror = function()
			{
				imgScale.set(img, 1);
				img.onerror = onerror || null;
				img.src = path;
			};
			img.src = hd;
		}

		//imgList a list of image file names, func a function to call upon cache completion
		//Units are saved from Luiz Guzman SHPTool to a 1x9 sprites bmp and
		//converted to transparent png by convert.py
		function cacheUnitImages(imgList: UnitImagesList, func: () => void): void
		{
			var loaded = 0;
			var toLoad = Object.keys(imgList).length; //Size of the "hash"
			var hasNewImages = false;

			for (var i in imgList)
			{
				if (typeof imgUnits[imgList[i]] !== "undefined")
				{
					loaded++;
					continue;
				}
				hasNewImages = true;
				imgUnits[imgList[i]] = new Image();
				imgUnits[imgList[i]].onload = function()
				{
					loaded++;
					if (loaded == toLoad)
						if (func) func();
				}
				loadImage(imgUnits[imgList[i]], imgList[i]);
			}
			//All already cached
			if (!hasNewImages)
				if (func) func();
		}

		//TODO performance render unit to a backbuffer and on main render function render
		// units in order of their image id so we can save some translate/rotate operations
		function drawUnitSprite(c: CanvasRenderingContext2D, x0: number, y0: number, unit: Unit): boolean
		{
			if (unit === null)
				return false;

			var image: HTMLImageElement = null;
			//A ground unit on a bridge of its side is drawn as the bridge, unless it's selected or moving
			if (unit.hasAnimation || (map.currentUnit && map.currentUnit.id == unit.id)
				|| !GameRules.isGround(unit) || !GameRules.isBridgeForSide(unit.getHex(), unit.player.side))
				image = imgUnits[unit.getIcon()];
			else
				image = imgBridge;

			if (!image)
				return false;

			// Units have 15 possible orientations there are 9 sprites each ~80x50 in 1 row
			// to get the rest of the orientations the sprite must be mirrored
			var mirror = false;
			var k = imgScale.get(image) || 1; //A @2x image is drawn at half its pixel size
			var srcw = image.width/9; //Some images have bigger width
			var imagew = srcw/k;
			var imageh = image.height/k;
			//Offset the transparent regions of the unit sprite
			var ix0 = (x0 - imagew/2 + s/2) >> 0;
			var iy0 = (y0 - imageh/2 + r - unitTextHeight) >> 0;
			var facing = unit.facing;
			if (facing > 8)
			{
				facing = 16 - facing;
				mirror = true;
			}
			var imgidx = srcw * facing;
			if (mirror)
			{
				var flip = ix0 + imagew/2;
				c.save();
				c.translate(flip, 0);
				c.scale(-1,1);
				c.translate(-flip,0);
			}
			c.drawImage(image, imgidx , 0, srcw, image.height, ix0, iy0, imagew, imageh);

			if (mirror) c.restore();

			return true;
		}

		function drawHexUnit(c: RenderContext, x0: number, y0: number, unit: Unit, drawIndicators: boolean): void
		{
			if (!drawUnitSprite(c, x0, y0, unit)) return;
			if (!drawIndicators || unit.strength < 1) return;
			//TODO performance, consider caching glyphs digits and use drawImage/putImageData
			//Currently fillText and fillRect doubles the rendering time

			//Write unit strength in a box below unit
			//Core units (and all units in scenario mode) use a different font and a bordered box
			var isCore = true;
			if (game.campaign !== null && !unit.isCore)
				isCore = false;

			if (isCore)
				c.font = unitTextHeight + "px coreUnitFont, sans-serif";
			else
				c.font = unitTextHeight + "px unitInfo, sans-serif"; //normal units

			var text = "" + unit.strength;
			var tx = (x0 + h/2) >> 0;
			var ty = y0 + 2 * r - (unitTextHeight + 4); //text size + spacing
			var textOffset = 1;
			var side = unit.player.side;
			var boxWidth = 19;  // c.measureText(text).width + 2 too slow
			if (unit.strength < 10)
			{
				boxWidth = 12;
				textOffset = 2;
			}

			if (side == 1)
				c.fillStyle = unitstyle.alliedBox;
			else
				c.fillStyle = unitstyle.axisBox;
			if (uiSettings.markEnemyUnits && side != game.spotSide)
				c.fillStyle = unitstyle.enemyBoxMarked;

			if (isCore)
			{
				if (side == 1)
					c.strokeStyle = unitstyle.alliedBorder;
				else
					c.strokeStyle = unitstyle.axisBorder;
				c.lineWidth = 2;
				c.strokeRect(tx, ty - 1, boxWidth, unitTextHeight + 4);
			}
			c.fillRect(tx, ty - 1, boxWidth, unitTextHeight + 4); //Add pixels above and below unit strength

			if (unit.player.id != map.currentPlayer.id && unit.player.side == map.currentPlayer.side)
				c.fillStyle = unitstyle.alliedPlayerText;
			else
				c.fillStyle = unitstyle.playerText;

			if (unit.hasMoved && unit.player.id == map.currentPlayer.id)
				c.fillStyle = unitstyle.movedUnitText;

			c.fillText(text, tx + textOffset, ty + 9);

			//draw indicator for unit.hasFired, the no ammo indicator when it can't fire anymore
			if (!unit.hasFired && GameRules.unitUsesAmmo(unit) && side == map.currentPlayer.side)
			{
				if (unit.getAmmo() > 0)
					c.drawImage(imgUnitFire, x0 - 4, y0 + 2 * r - 12);
				else
					c.drawImage(imgUnitNoAmmo, x0 - 4, y0 + 2 * r - 12);
			}

			//draw leader indicator after the strength box
			if (unit.leader != -1)
			{
				if (side == 1)
					c.drawImage(imgLeaderAllied, tx + boxWidth + 1, y0 + 2 * r - 13);
				else
					c.drawImage(imgLeaderAxis, tx + boxWidth + 1, y0 + 2 * r - 13);
			}
		}

		function drawHex(ctx: CanvasRenderingContext2D, x0: number, y0: number, style: HexStyle, terrain?: number): void
		{
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x0 + s, y0);
			ctx.lineTo(x0 + s + h, y0 + r);
			ctx.lineTo(x0 + s, y0 + 2 * r);
			ctx.lineTo(x0, y0 + 2 * r);
			ctx.lineTo(x0 - h, y0 + r);
			if (style.fillColor !== null)
			{
				ctx.fillStyle = style.fillColor;
				ctx.fill();
			}

			ctx.closePath();

			if (style.lineWidth > 0)
			{
				ctx.lineWidth = style.lineWidth;
				ctx.lineJoin = style.lineJoin;
				ctx.strokeStyle = style.lineColor;
				if (style.hasOwnProperty("shadowColor"))
				{
					ctx.shadowOffsetX = style.shadowOffsetX;
					ctx.shadowOffsetY = style.shadowOffsetY;
					ctx.shadowColor = style.shadowColor;
				}
				else
				{
					ctx.shadowOffsetX = null;
					ctx.shadowOffsetY = null;
					ctx.shadowColor = null;
				}
				ctx.stroke();
			}
			var tx: number, ty: number;
			if ((uiSettings.showGridTerrain && typeof terrain !== "undefined") && terrain != terrainType.Clear)
			{
				tx = (x0 + h + h/2 -2) >> 0;
				ty = y0 + 2*r -24/2; //text size + spacing
				ctx.font = "24px openpanzer, sans-serif"; //TODO use vm vh instead of px when mobile support it

				ctx.strokeStyle = unitstyle.terrainTextStroke;
				ctx.lineWidth = 1;
				ctx.strokeText(terrainencoding[terrain], tx - 1, ty - 1);
				ctx.fillStyle = unitstyle.terrainText;
				ctx.fillText(terrainencoding[terrain], tx, ty);
			}
			//Deployment hexes are marked with a Z glyph
			if (style === hexstyle.deploy)
			{
				tx = (x0 + 4) >> 0;
				ty = y0 + 2*r -24/2;
				ctx.font = "24px openpanzer, sans-serif";
				ctx.strokeStyle = unitstyle.terrainTextStroke;
				ctx.lineWidth = 1;
				ctx.strokeText("Z", tx - 1, ty - 1);
				ctx.fillStyle = unitstyle.terrainText;
				ctx.fillText("Z", tx, ty);
			}
			//Move hexes get a ' glyph with the terrain grid
			if (uiSettings.showGridTerrain && style === hexstyle.move)
			{
				ty = y0 + 2*r -24/2;
				ctx.font = "26px openpanzer-menu, sans-serif";
				ctx.strokeStyle = unitstyle.terrainText;
				ctx.lineWidth = 1;
				ctx.strokeText("'", ((x0 + 4) >> 0) - 1, ty - 1);
			}
		}

		//Returns min and max row,col for a range around a cell(row,col)
		function getZoneRangeLimits(row: number, col: number, range: number): ZoneRangeLimits
		{
			var z = { srow: 0, scol: 0, erow: map.rows, ecol: map.cols };

			if (row === null || col === null)
				row = col = 0;

			if (range !== null && range >= 0)
			{
				z.srow = row - range;
				z.scol = col - range;
				z.erow = row + range;
				z.ecol = col + range;

				if (z.srow < 0) z.srow = 0;
				if (z.scol < 0) z.scol = 0;
				if (z.erow > map.rows) z.erow = map.rows;
				if (z.ecol > map.cols) z.ecol = map.cols;
			}
			return z;
		}
	}
}
