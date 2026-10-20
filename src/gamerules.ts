/**
 * GameRules - Provides basic rules for HTML5 PG2
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

//The GameRules module API. map is the hex grid of a GameMap (GameMap.map), rows/cols its size
interface GameRulesModule
{
	getMoveRange(mapObj: GameMap, unit: Unit): extendedCell[];
	getUnitMoveRange(unit: Unit): number;
	getUnitAttackCells(map: Hex[][], unit: Unit, rows: number, cols: number): Cell[];
	getUnitAttackRange(unit: Unit): number;
	setZOCRange(map: Hex[][], unit: Unit, on: boolean, mrows: number, mcols: number): void;
	setSpotRange(map: Hex[][], unit: Unit, on: boolean, mrows: number, mcols: number): number;
	getUnitSpotRange(unit: Unit): number;
	getShortestPath(startCell: Cell, endCell: Cell, cellList: extendedCell[]): pathCell[];
	calculateCombatResults(atkunit: Unit, defunit: Unit, unitlist: Unit[], withHiddenUnits: boolean,
		estimate: boolean): combatResults;
	calculateAttackResults(atkunit: Unit, defunit: Unit, estimate: boolean): combatResults;
	isLossOverRetreatThreshold(strength: number, oldStrength: number): boolean;
	shouldDefenderRetreat(atkunit: Unit, defunit: Unit, oldStrength: number): boolean;
	getRetreatPosition(map: Hex[][], unit: Unit, rows: number, cols: number): Cell | null;
	isRuggedDefense(atkunit: Unit, defunit: Unit): boolean;
	isEntrenchmentIntact(atkunit: Unit, defunit: Unit, terrain: number): boolean;
	getResupplyValue(map: Hex[][], unit: Unit, isTurnStart?: boolean): Supply;
	getReinforceValue(map: Hex[][], unit: Unit, overstrength?: boolean): number;
	canInitiateAttack(unit: Unit | null, targetUnit: Unit | null): boolean;
	canFire(unit: Unit | null, targetUnit: Unit | null): boolean;
	canPassInto(map: Hex[][], unit: Unit, cell: Cell): boolean;
	isBridgeForSide(hex: Hex | null, side: number): boolean;
	canResupply(map: Hex[][], unit: Unit): boolean;
	canReinforce(map: Hex[][], unit: Unit, overstrength?: boolean): boolean;
	canCapture(unit: Unit): boolean;
	canEntrench(unit: Unit | null): boolean;
	isEnemy(unit: Unit | null, targetUnit: Unit | null): boolean;
	getSupportFireUnits(unitList: Unit[], atkunit: Unit, defunit: Unit): Unit[];
	isInAttackRange(unit: Unit, targetUnit: Unit): boolean;
	getEmbarkType(map: Hex[][], unit: Unit): number; //a unitClass
	getDisembarkPositions(map: Hex[][], unit: Unit): Cell[];
	getReinforcementDeployPositions(map: Hex[][], unit: Unit, row: number, col: number): Cell | null;
	canEmbark(map: Hex[][], unit: Unit): boolean;
	canDisembark(map: Hex[][], unit: Unit): boolean;
	canMount(unit: Unit): boolean;
	canUnmount(unit: Unit): boolean;
	isTransportable(unitID: number): boolean;
	isAir(unit: Unit | null): boolean;
	isSea(unit: Unit | null): boolean;
	isGround(unit: Unit | null): boolean;
	isTrain(unit: Unit | null): boolean;
	isCloseCombatTerrain(t: number): boolean; //a terrainType
	unitUsesFuel(unit: Unit | Transport): boolean; //Unit.move checks its transport too
	unitLowFuel(unit: Unit, threshold: number): boolean;
	unitUsesAmmo(unit: Unit): boolean;
	unitLowAmmo(unit: Unit, threshold: number): boolean;
	calculateUnitCosts(unitid: number, transportid?: number): number;
	calculateUpgradeCosts(unit: Unit | null, upgradeid: number, transportid: number): number;
	calculateUnitCostPerStrength(unit: Unit | null): number;
	calculateUnitSellCost(unit: Unit): number;
	getDirection(x1: number, y1: number, x2: number, y2: number): number; //a direction
	distance(x1: number, y1: number, x2: number, y2: number): number;
	getAdjacent(row: number, col: number): Cell[];
	facingToAdjacentIndex(facing: number): number;
	rollDice(min: number, max: number): number;
}

//var GameRules = GameRules || {}; //Namespace emulation
var GameRules: GameRulesModule = (function(GameRules: GameRulesModule) { //Module start

//returns a cell list with hexes that a unit can move to
//Works by computing cost of ajacent hexes by range expanding from 0 to unit movpoints
//cin is the cost of entering the current hex which is equal to  the cost of exiting from
//the hex with a range smaller by 1 than the current hex
//cout cost of exiting a hex which is cin + terrain movement cost
//each time a hex with cout smaller that adjacent hexes cout the adjacent hexes are updated
//with the new cost
GameRules.getMoveRange = function(mapObj, unit)
{
	var r = 0;
	var map = mapObj.map;
	var rows = mapObj.rows;
	var cols = mapObj.cols;
	var hex = null;
	var allowedCells = [];

	if (unit === null || unit.hasMoved) return [];

	var p = unit.getPos();
	var ud = unit.unitData();
	var range = GameRules.getUnitMoveRange(unit);
	var moveCost = movTable[ud.movmethod];
	var side = unit.player.side;
	var enemySide = ~side & 1;
	var isTrain = GameRules.isTrain(unit);

	var c = getCellsInRange(p.row, p.col, range, rows, cols, true);

	//Remove the partial hexes on the map edges
	for (var i = c.length - 1; i >= 0; i--)
	{
		var isPartial = false;
		if (c[i].row == 0 && c[i].col % 2 == 0)
			isPartial = true;
		if (mapObj.isLastColPartial && c[i].col == cols - 1)
			isPartial = true;
		if (mapObj.isLastRowPartial && c[i].row == rows - 1 && c[i].col % 2 == 1)
			isPartial = true;
		if (isPartial)
			c.splice(i, 1);
	}

	//Don't calculate costs for air units
	if (isAir(unit))
	{
		for (i = 0; i < c.length; i++)
		{
			hex = map[c[i].row][c[i].col];
			if ((hex.isSpotted(side) || (hex.airunit !== null && hex.airunit.tempSpotted))
				&& !canMoveInto(map, unit, c[i]))
				continue;
			c[i].canMove = true;
			c[i].cost = 1; //No Terrain cost for air
			allowedCells.push(c[i]);
		}
		return allowedCells;
	}

	//Add current unit cell as starting point for cost calculations
	c.push(new extendedCell(p.row, p.col));

	while (r <= range)
	{
		for (i = 0; i < c.length; i++)
		{
			if (c[i].range == r)
			{
				for (var j = 0; j < c.length; j++) //Look up adjacent cells for c[i]
				{
					if (c[j].range < r) continue; //Not always true, there might be a path to reach a hex by turning back
					if (isAdjacent(c[i].row, c[i].col, c[j].row, c[j].col))
					{
						hex = map[c[j].row][c[j].col];

						//Trains can't use roads, bridges are roads for the side that owns them
						if ((!isTrain && hex.road > roadType.none) || GameRules.isBridgeForSide(hex, side))
							c[j].cost = moveCost[17]; //Road entry in movement table
						else
							c[j].cost = moveCost[hex.terrain];

						//enemy unit zone of control ? no ZOC for air units
						if ((hex.isSpotted(side) || (hex.unit !== null && hex.unit.tempSpotted))
							&& hex.isZOC(enemySide) && c[j].cost < 254)
							c[j].cost = 254; //stop movement

						if (c[j].cin == 0) c[j].cin = c[i].cout;
						if (c[j].cout == 0) c[j].cout = c[j].cin + c[j].cost;
						if (c[j].cin > c[i].cout && c[j].cost <= 254) //Is reachable from another path
						{
							c[j].cin = c[i].cout;
							c[j].cout = c[j].cin + c[j].cost;
						}
						if ((c[j].cout <= range) || ((c[j].cost <= 254) && (c[j].cin <= range)))
						{
							if (canPassInto(map, unit, c[j]))
								c[j].canPass = true; //To allow friendly units pass thru this hex
							if ((hex.isSpotted(side) || (hex.unit !== null && hex.unit.tempSpotted))
								&& !canMoveInto(map, unit, c[j]))
								continue;
							c[j].canMove = true; //To allow unit to move in this hex
						}
					}
				}
			}
		}
		r++;
	}

	for (i = 0; i < c.length; i++)
		if (c[i].canPass || c[i].canMove)
			allowedCells.push(c[i]);

	return allowedCells;
}

//Return a unit maximum move range without considering terrain
GameRules.getUnitMoveRange = function(unit)
{
	var range = unit.getMovesLeft();
	var ud = unit.unitData();

	if (GameRules.unitUsesFuel(unit) && (unit.getFuel() < range))
		range = unit.getFuel();

	if (Leaders.unitHasLeader(unit, leaderType.aggressiveTankManeuver))
		range += 1;
	if (Leaders.unitHasLeader(unit, leaderType.aggressiveManeuver))
		range += 1;

	//Towed units with no transport should be able to move at 1 range(looks like forts are towed too)
	if ((ud.movmethod == movMethod.towed) && (unit.transport === null)
		&& (range == 0) && (ud.uclass != unitClass.fortification))
	{
		range = 1;
	}

	return range;
}

//Returns the map cells with units that can be attacked by a unit
GameRules.getUnitAttackCells = function(map, unit, rows, cols)
{
	var allowedCells = [];
	var target = null;

	if (unit === null || unit.hasFired || unit.getAmmo() <= 0) return [];
	var p = unit.getPos();

	//TODO weather ?
	var range = GameRules.getUnitAttackRange(unit);

	var cellList = getCellsInRange(p.row, p.col, range, rows, cols, false);

	//can attack the target under/above for airdefense/airplane
	cellList.push(new Cell(p.row, p.col));

	for (var i = 0; i < cellList.length; i++)
	{
		var cell = cellList[i];
		var hex = map[cell.row][cell.col];

		if (hex.getAttackableUnit(unit, 0) !== null) //Can attack the ground unit on this hex?
		{
			if (GameRules.isAir(unit) && range <= 1) //Air can only attack non Air unit below
			{
				if (p.row == cell.row && p.col == cell.col)
					allowedCells.push(cell);
			}
			else
			{
				allowedCells.push(cell);
				continue; //don't push same cell twice below
			}
		}

		if ((target = hex.getAttackableUnit(unit, 1)) !== null) //Can attack the air unit on this hex ?
		{
			if (GameRules.isAir(unit)) //Air can attack air units on adjacent hexes
			{
				if (GameRules.isAir(target))
					allowedCells.push(cell);
			}
			else
			{
				allowedCells.push(cell);
			}
		}
	}
	return allowedCells;
}

GameRules.getUnitAttackRange = function(unit)
{
	if (!unit) return 0;

	var range = unit.unitData().gunrange;
	if (range == 0) range = 1;

	if (Leaders.unitHasLeader(unit, leaderType.marksman))
		range += 1;

	return range;
}

//set zone of control on unit adjacent hexes
GameRules.setZOCRange = function(map, unit, on, mrows, mcols)
{
	if (!unit || isAir(unit)) return;

	var p = unit.getPos();

	if (!p) return;

	var side = unit.player.side;
	var r, c;
	var adj = getAdjacent(p.row, p.col);

	for (var i in adj)
	{
		r = adj[i].row;
		c = adj[i].col;
		if (r >= mrows || r < 0) continue;
		if (c >= mcols || c < 0) continue;

		map[r][c].setZOC(side, on);
	}
}

//Sets spotting range for a unit returns number of new units spotted
GameRules.setSpotRange = function(map, unit, on, mrows, mcols)
{
	if (!unit) return 0;

	var p = unit.getPos();

	if (!p) return;

	var side = unit.player.side;
	var range = GameRules.getUnitSpotRange(unit);
	var r, c;
	var newlySpottedUnits = 0;
	var cells = getCellsInRange(p.row, p.col, range, mrows, mcols, false);
	//Add current unit cell too as spotted
	cells.push(new Cell(p.row, p.col));

	for (var i = 0; i < cells.length; i++)
	{
		r = cells[i].row;
		c = cells[i].col;
		//Check for a previously hidden unit
		if (on && !map[r][c].isSpotted(side))
		{
			var sUnit = map[r][c].getUnit(false);
			if (sUnit && sUnit.player.side != side)
			{
				newlySpottedUnits++;
				sUnit.tempSpotted = true;
			}
		}
		map[r][c].setSpotted(side, on);
	}

	return newlySpottedUnits;
}

GameRules.getUnitSpotRange = function(unit)
{
	if (!unit) return 0;

	var range = unit.unitData().spotrange;

	if (Leaders.unitHasLeader(unit, leaderType.eliteReconVeteran))
		range += 2;
	if (Leaders.unitHasLeader(unit, leaderType.skilledReconnaissance))
		range += 1;

	return range;
}

GameRules.getShortestPath = function(startCell, endCell, cellList)
{
	var pCells = [];
	var visitedCells = [];
	var shortestPath = [];
	var minDistCell = null;
	var idx = 0;

	//add starting cell
	var psCell = new pathCell(startCell);
	psCell.dist = 0;
	psCell.prev = psCell;
	pCells.push(psCell);

	//add the rest of cells as pathCells into list
	for (var i = 0; i < cellList.length; i++)
	{
		var pc = new pathCell(cellList[i]);
		pc.cost = cellList[i].cost;
		pCells.push(pc);
	}

	while (pCells.length > 0)
	{
		idx = 0;
		minDistCell = pCells[0];
		for (i = 1; i < pCells.length; i++)
		{
			if (pCells[i].dist != Infinity && pCells[i].dist <= minDistCell.dist)
			{
				minDistCell = pCells[i];
				idx = i;
			}
		}
		if (minDistCell.dist == Infinity)
			return []; //No path

		for (i = 0; i < pCells.length; i++)
		{
			if (isAdjacent(minDistCell.row, minDistCell.col, pCells[i].row, pCells[i].col))
			{
				//Add terrain cost to calculations (can use +1 instead for direct but incorect paths)
				if (pCells[i].dist == Infinity || (minDistCell.dist + minDistCell.cost) < pCells[i].dist)
				{
					pCells[i].dist = minDistCell.dist + minDistCell.cost;
					pCells[i].prev = minDistCell;
				}
			}
		}

		if (minDistCell.row == endCell.row && minDistCell.col == endCell.col)
		{
			var t = minDistCell;
			while(true)
			{
				shortestPath.unshift(t); //add on top
				if ((t.row == startCell.row) && (t.col == startCell.col))
					break;

				if (t.prev !== null || typeof t !== "undefined")
					t = t.prev;
				else
					break;
			}
			return shortestPath;
		}

		visitedCells.push(pCells[idx]); //Just to keep reference going //TODO better way
		pCells.splice(idx, 1);
	}

	return [];
}

//This function calculates the kill/losses for all units involved in combat
//withHiddenUnits: also count support fire from units the attacker can't see
//estimate: compute the expected result instead of rolling dice
GameRules.calculateCombatResults = function(atkunit, defunit, unitlist, withHiddenUnits, estimate)
{
	var supportUnits: Unit[] = [];
	var realLosses = 0;
	var realKills = 0;
	var evalLosses = 0;
	var evalKills = 0;
	var side = atkunit.player.side;
	var cr;

	if (!atkunit.isSurprised)
		supportUnits = GameRules.getSupportFireUnits(unitlist, atkunit, defunit);

	for (var u in supportUnits)
	{
		var hex = supportUnits[u].getHex();
		cr = GameRules.calculateAttackResults(supportUnits[u], atkunit, estimate);
		if (hex.isSpotted(side) || supportUnits[u].tempSpotted)
		{
			evalLosses += cr.kills; //Losses of atkunit are kills of the support fire
			evalKills += cr.losses; //Kills of the atkunit are losses of the support fire
		}
		realLosses += cr.kills;
		realKills += cr.losses;
	}

	cr = GameRules.calculateAttackResults(atkunit, defunit, estimate);

	evalLosses += cr.losses;
	evalKills += cr.kills;
	realLosses += cr.losses;
	realKills += cr.kills;

	if (withHiddenUnits)
	{
		cr.losses = realLosses;
		cr.kills = realKills;
	}
	else
	{
		cr.losses = Math.min(evalLosses, atkunit.strength);
		cr.kills = Math.min(evalKills, defunit.strength);
	}

	return cr;
}

GameRules.calculateAttackResults = function(atkunit, defunit, estimate)
{
	var aPos = atkunit.getPos();
	var dPos = defunit.getPos();

	var aData = atkunit.unitData();
	var dData = defunit.unitData();

	var aType = aData.target;
	var dType = dData.target;

	var aHex = atkunit.getHex();
	var dHex = defunit.getHex();

	var aExpBars = (atkunit.experience / 100) >> 0;
	var dExpBars = (defunit.experience / 100) >> 0;

	var aav = 0; //Attacker attack value
	var adv = 0; //Attacker defense value
	var dav = 0; //Defender attack value
	var ddv = 0; //Defender defense value

	var cr = new combatResults();
	var d = GameRules.distance(aPos.row, aPos.col, dPos.row, dPos.col); //distance between units

	var aTerrain = aHex.terrain;
	var dTerrain = dHex.terrain;

	if (isAir(atkunit)) aTerrain = terrainType.Clear;
	if (isAir(defunit)) dTerrain = terrainType.Clear;

	//Infantry always dismounts when attacked
	if (defunit.isMounted && !defunit.isSurprised && defunit.unitData(true).uclass == unitClass.infantry)
		dData = Equipment.equipment[defunit.eqid];

	var dEntrenchIntact = GameRules.isEntrenchmentIntact(atkunit, defunit, dTerrain);
	var aEntrenchIntact = GameRules.isEntrenchmentIntact(defunit, atkunit, aTerrain);

	//Attacking unit type
	switch(aType)
	{
		case unitType.air:
		{
			dav = dData.airatk;
			ddv = dData.airdef;
			break;
		}
		case unitType.soft:
		{
			dav = dData.softatk;
			ddv = dData.grounddef;
			break;
		}
		case unitType.hard:
		{
			dav = dData.hardatk;
			ddv = dData.grounddef;
			break;
		}
		case unitType.sea:
		{
			dav = dData.navalatk;
			ddv = dData.grounddef;
			if (dData.uclass == unitClass.submarine)
				adv = aData.closedef;
			break;
		}
	}
	//Defending unit type
	switch(dType)
	{
		case unitType.air:
		{
			aav = aData.airatk;
			adv = aData.airdef;
			break;
		}
		case unitType.soft:
		{
			aav = aData.softatk;
			adv = aData.grounddef;
			break;
		}
		case unitType.hard:
		{
			aav = aData.hardatk;
			adv = aData.grounddef;
			break;
		}
		case unitType.sea:
		{
			aav = aData.navalatk;
			adv = aData.grounddef;
			if (aData.uclass == unitClass.submarine)
				ddv = dData.closedef;
			break;
		}
	}

	//Close Combat: infantry attacking in close terrain or a fortification, defender uses Close Defense
	//except when it's infantry which makes attacker use CD
	var isCloseCombat = (GameRules.isCloseCombatTerrain(dTerrain) || dData.uclass == unitClass.fortification)
		&& aData.uclass == unitClass.infantry;

	if (isCloseCombat)
	{
		ddv = dData.closedef;
		if (dData.uclass == unitClass.infantry)
			adv = aData.closedef;
		else
			aav += 4;
	}

	//Leaders
	if (Leaders.unitHasLeader(atkunit, leaderType.aggressiveAttack))
	{
		aav += 4;
		adv += 2;
	}
	if (Leaders.unitHasLeader(defunit, leaderType.aggressiveAttack))
	{
		dav += 2;
		ddv += 2;
	}
	if (Leaders.unitHasLeader(atkunit, leaderType.determinedDefense))
		adv += 2;
	if (Leaders.unitHasLeader(defunit, leaderType.determinedDefense))
	{
		dav += 2;
		ddv += 4;
	}
	if (Leaders.unitHasLeader(atkunit, leaderType.tenaciousDefense) && dType != unitType.air)
		adv += 4;
	if (Leaders.unitHasLeader(defunit, leaderType.tenaciousDefense) && aType != unitType.air)
		ddv += 4;
	if (isAir(atkunit) && Leaders.unitHasLeader(atkunit, leaderType.skilledGroundAttack) && isGround(defunit))
		aav += 4;

	//TODO Unit types
	if (dData.uclass == unitClass.artillery)
		adv += 3;

	//TODO Weather

	//Terrain checks
	if (dTerrain == terrainType.City)
		ddv += 4;
	if ((dTerrain == terrainType.River || dTerrain == terrainType.Stream) && dHex.road == roadType.none)
	{
		aav += 4;
		adv += 4;
	}
	if ((aTerrain == terrainType.River || aTerrain == terrainType.Stream) && aHex.road == roadType.none)
	{
		dav += 4;
		ddv += 4;
	}

	//Entrenchment
	var aEntrenchment = 0;
	var dEntrenchment = 0;

	if (aEntrenchIntact && !isCloseCombat)
		aEntrenchment = atkunit.entrenchment;
	if (dEntrenchIntact)
		dEntrenchment = defunit.entrenchment;

	if (Leaders.unitHasLeader(atkunit, leaderType.infiltrationTactics)
		&& !Leaders.unitHasLeader(defunit, leaderType.ferociousDefense))
		dEntrenchment = 0;
	if (Leaders.unitHasLeader(defunit, leaderType.infiltrationTactics)
		&& !Leaders.unitHasLeader(atkunit, leaderType.ferociousDefense))
		aEntrenchment = 0;

	adv += aEntrenchment;
	ddv += dEntrenchment;
	//Add entrechment twice for infantry in city, forest, mountain if not attacked by infantry/arty/air/naval
	if (dData.uclass == unitClass.infantry && GameRules.isCloseCombatTerrain(dTerrain) && !isCloseCombat
		&& aData.uclass > unitClass.infantry && aData.uclass < unitClass.groundTransport)
		ddv += dEntrenchment;

	//Experience
	aav += aExpBars;
	adv += aExpBars;
	dav += dExpBars;
	ddv += dExpBars;

	//Received attacks this turn, not for artillery, fortifications and naval attackers
	if (aData.uclass != unitClass.artillery && aData.uclass != unitClass.fortification
		&& (aData.uclass < unitClass.submarine || aData.uclass > unitClass.lightCruiser))
	{
		var hitsPenalty = defunit.hits * 2;
		if (ddv <= hitsPenalty)
			ddv = 0;
		else
			ddv -= hitsPenalty;
	}

	//Range defense modifier, AntiTank doesn't get it after moving
	var noRangeDefMod = aData.uclass == unitClass.antiTank && atkunit.hasMoved
		&& !Leaders.unitHasLeader(atkunit, leaderType.tankKiller);

	if (isGround(atkunit) && isGround(defunit) && !isCloseCombat)
	{
		if (d <= 1 || GameRules.getUnitAttackRange(defunit) < d)
		{
			if (!noRangeDefMod) adv += aData.rangedefmod >> 1;
			ddv += dData.rangedefmod >> 1;
		}
		else
		{
			if (!noRangeDefMod) adv += aData.rangedefmod;
			ddv += dData.rangedefmod;
		}
	}

	//TODO Initiative (evaluate initiative based on class, terrain initiative)
	//The 3.2.14 bundle assigns these two as implicit globals, kept as is
	aInitiative = aData.initiative;
	dInitiative = dData.initiative;
	var initiativeDiff = aData.initiative - dData.initiative;

	if (Leaders.unitHasLeader(atkunit, leaderType.firstStrike))
		initiativeDiff = Math.abs(initiativeDiff);
	if (Leaders.unitHasLeader(defunit, leaderType.firstStrike))
		initiativeDiff = -Math.abs(initiativeDiff);

	if (initiativeDiff >= 0)
	{
		adv += 4;
		aav += Math.min(4, initiativeDiff);
	}
	else
	{
		ddv += 4;
		dav += Math.min(4, -(initiativeDiff));
	}

	if (d == 1 && dEntrenchIntact && GameRules.isRuggedDefense(atkunit, defunit))
		cr.isRugged = true;

	if (atkunit.isSurprised || cr.isRugged)
	{
		adv = 0;
		aav = aav/2;
	}
	//We consider that attacking unit can fire because otherwise won't have targets selected in UI
	//Check if defending unit can fire back
	//Can't fire back when attacked from range except naval units combat within gun range
	if (d > 1 && !(isSea(atkunit) && isSea(defunit) && dData.gunrange >= d))
		cr.defcanfire = false;

	if (!canAttack(defunit, atkunit))
		cr.defcanfire = false;

	cr.kills = getCombatKills(aav, ddv, atkunit, defunit, estimate);

	if (cr.defcanfire)
		cr.losses = getCombatKills(dav, adv, defunit, atkunit, estimate);

	//Tanks overrun a destroyed adjacent defender
	if (aData.uclass == unitClass.tank && cr.losses <= 1 && cr.kills >= defunit.strength
		&& d == 1 && !atkunit.isSurprised)
		cr.isOverrun = true;

	//Experience
	var bonusAD = (dav + 6 - adv);
	if (bonusAD < 1) bonusAD = 1;

	var bonusDA = (aav + 6 - ddv);
	if (bonusDA < 1) bonusDA = 1;

	var bonusDD = (ddv + 6 - aav);
	if (bonusDD < 1) bonusDD = 1;

	var bonusAA = (adv + 6 - dav);
	if (bonusAA < 1) bonusAA = 1;

	cr.atkExpGained = ((bonusAD * (defunit.strength / 10) + bonusDD) * cr.kills) >> 0;
	cr.defExpGained = (2 * cr.kills) >> 0;

	if (cr.defcanfire)
	{
		cr.atkExpGained += +(2 * cr.losses);
		cr.defExpGained += +((bonusDA * (atkunit.strength / 10) + bonusAA) * cr.losses);
	}

	if (atkunit.experience + cr.atkExpGained > UNIT_MAX_EXPERIENCE)
		cr.atkExpGained = UNIT_MAX_EXPERIENCE - atkunit.experience;
	if (defunit.experience + cr.defExpGained > UNIT_MAX_EXPERIENCE)
		cr.defExpGained = UNIT_MAX_EXPERIENCE - defunit.experience;

	return cr;
}

//Strength loss that triggers a retreat, units with less starting strength retreat sooner
GameRules.isLossOverRetreatThreshold = function(strength, oldStrength)
{
	if ((oldStrength - strength) / oldStrength >= UNIT_RETREAT_THRESHOLD - (10 - oldStrength) / 2 / 10)
		return true;

	return false;
}

GameRules.shouldDefenderRetreat = function(atkunit, defunit, oldStrength)
{
	var uc = atkunit.unitData().uclass;

	if (!isGround(atkunit) || !isGround(defunit))
		return false;

	if (uc == unitClass.artillery || uc == unitClass.tacticalBomber || uc == unitClass.fortification)
		return false;

	return GameRules.isLossOverRetreatThreshold(defunit.strength, oldStrength);
}

//Returns a free hex behind the unit (opposite to its facing) or any other free adjacent hex
GameRules.getRetreatPosition = function(map, unit, rows, cols)
{
	if (!unit) return null;

	var ud = unit.unitData();
	var moveCost = movTable[ud.movmethod];

	if (ud.movpoints == 0) return null;

	var p = unit.getPos();
	var facing = Math.abs(unit.facing - 8);
	var idx = GameRules.facingToAdjacentIndex(facing);
	var adj = getAdjacent(p.row, p.col);

	adj.unshift(adj[idx]); //Check the hex behind first

	for (var h in adj)
	{
		var r = adj[h].row;
		var c = adj[h].col;

		if (r == 0 && c % 2 == 0) continue; //partial hex
		if (r == rows - 1 && c % 2 == 1) continue; //partial hex
		if (typeof map[r] === "undefined" || typeof map[r][c] === "undefined") continue;

		if (map[r][c].unit === null && moveCost[map[r][c].terrain] < 255)
			return new Cell(r, c);
	}

	return null;
}

GameRules.isRuggedDefense = function(atkunit, defunit)
{
	var aRugged = ((atkunit.experience / 100) >> 0) + 2;
	var dRugged = ((defunit.experience / 100) >> 0) + 2;

	if (Leaders.unitHasLeader(atkunit, leaderType.tenaciousDefense))
		aRugged += 2;
	if (Leaders.unitHasLeader(defunit, leaderType.tenaciousDefense))
		dRugged += 2;

	var aEntrenchRate = unitEntrenchRate[atkunit.unitData().uclass] + 1;
	var dEntrenchRate = unitEntrenchRate[defunit.unitData().uclass] + 1;

	return ((5 * ((50 * dRugged) / aRugged) * dEntrenchRate * defunit.entrenchment) / (50 * aEntrenchRate)) > 50;
}

//Checks if defunit keeps its entrenchment when attacked by atkunit on terrain
GameRules.isEntrenchmentIntact = function(atkunit, defunit, terrain)
{
	if (Leaders.unitHasLeader(defunit, leaderType.ferociousDefense))
		return true;

	if (Equipment.ignoresEntrenchment(atkunit.eqid))
		return false;

	if ((Leaders.unitHasLeader(atkunit, leaderType.infiltrationTactics)
		|| Leaders.unitHasLeader(atkunit, leaderType.streetFighter))
		&& (terrain == terrainType.City || terrain == terrainType.Rough || terrain == terrainType.Port))
		return false;

	return true;
}

function getCombatKills(atkval: number, defval: number, atkunit: Unit, defunit: Unit, estimate: boolean): number
{
	var atkclass = atkunit.unitData().uclass;
	var kF = atkval - defval; //Kill fractions
	var hitThreshold = 15; //minimum dice roll that kills a strength point
	var kills = 0;

	if (kF > 4) kF = 4 + (2 * kF - 8) / 5; //PG2 formula

	if (Leaders.unitHasLeader(atkunit, leaderType.overwhelmingAttack))
		kF += 2;
	if (Leaders.unitHasLeader(defunit, leaderType.resilience))
		kF -= 2;

	if (atkclass == unitClass.artillery || atkclass == unitClass.levelBomber || atkclass == unitClass.fortification
		|| (isSea(atkunit) && !isSea(defunit)))
		hitThreshold = 19;

	if (estimate)
	{
		kills = kF + 21 - hitThreshold;
		if (kills < 1) kills = 1;
		if (kills > 19) kills = 19;
		kills = (5 * kills * atkunit.strength + 50) / 100;
	}
	else
	{
		for (var i = 0; i < atkunit.strength; i++)
		{
			var roll = GameRules.rollDice(1, 20);
			if (roll > 1 && roll < 20) //1 always misses, 20 always hits
				roll += kF;
			if (roll >= hitThreshold)
				kills++;
		}
	}

	if (Leaders.unitHasLeader(atkunit, leaderType.overwhelmingAttack))
		kills += 1;

	return Math.round(kills);
}

//TODO Unit type
//isTurnStart: the automatic resupply at turn start, only in cities without enemies around
GameRules.getResupplyValue = function(map, unit, isTurnStart)
{
	if (typeof isTurnStart === "undefined") isTurnStart = false;

	if (!GameRules.canResupply(map, unit)) return new Supply(0, 0);
	//get maximum resupply values
	var ammo = unit.unitData(true).ammo - unit.ammo;
	var fuel = unit.unitData(true).fuel - unit.fuel;
	var terrain = unit.getHex().terrain;

	//Air and naval units get full resupply even if other units are adjacent
	if (isAir(unit) || isSea(unit))
		return new Supply(ammo, fuel);

	var tAmmo = 0;
	var tFuel = 0;

	if (unit.transport !== null)
	{
		tAmmo = unit.transport.unitData().ammo - unit.transport.ammo;
		tFuel = unit.transport.unitData().fuel - unit.transport.fuel;
	}

	var p = unit.getPos();
	var adj = getAdjacent(p.row, p.col);
	var enemy = 0;
	for (var h in adj)
	{
		var r = adj[h].row;
		var c = adj[h].col;
		if (typeof map[r] === "undefined" || typeof map[r][c] === "undefined")
			continue;
		//Enemy around ? Check only for ground units
		if ((map[r][c].unit != null) && (map[r][c].unit.player.side != unit.player.side))
			enemy++;
	}

	if (isTurnStart && (enemy > 0 || terrain != terrainType.City))
		return new Supply(0, 0);

	if (terrain != terrainType.City)
	{
		ammo = ammo / 1.3;
		fuel = fuel / 1.3;
		tAmmo = tAmmo / 1.3;
		tFuel = tFuel / 1.3;
	}

	if (enemy > 0 && enemy <= 2)
	{
		ammo = ammo / 1.5;
		fuel = fuel / 1.5;
		tAmmo = tAmmo / 1.5;
		tFuel = tFuel / 1.5;
	}

	if (enemy > 2)
	{
		ammo = ammo / 3;
		fuel = fuel / 3;
		tAmmo = tAmmo / 3;
		tFuel = tFuel / 3;
	}

	if (ammo < 1) ammo = 1;
	if (fuel < 1) fuel = 1;

	return new Supply(Math.round(ammo), Math.round(fuel), Math.round(tAmmo), Math.round(tFuel));
}

//TODO Unit type
//overstrength: reinforce over 10 strength, one extra point for each experience bar
GameRules.getReinforceValue = function(map, unit, overstrength)
{
	if (!defined(overstrength)) overstrength = false;

	if (!GameRules.canReinforce(map, unit, overstrength)) return 0;
	var strength = 10 - unit.strength;

	if (overstrength)
		strength = 10 + Math.round(unit.experience / 100) - unit.strength;

	//Air units get full reinforcement even if other units are adjacent
	if (isAir(unit))
		return strength;

	var p = unit.getPos();
	var adj = getAdjacent(p.row, p.col);
	var enemy = 0;
	for (var h in adj)
	{
		var r = adj[h].row;
		var c = adj[h].col;
		if (typeof map[r] === "undefined" || typeof map[r][c] === "undefined")
			continue;
		//Enemy around ? Check only for ground units
		if ((map[r][c].unit !== null) && (map[r][c].unit.player.side != unit.player.side))
			enemy++;
	}

	if (unit.getHex().terrain != terrainType.City)
		strength = strength / 1.3;

	if (enemy > 0 && enemy <= 2)
		strength = strength / 1.5;

	if (enemy > 2)
		strength = strength / 3;

	return Math.round(strength);
}

//Checks if a unit can attack another unit without considering range
function canAttack(unit: Unit | null, targetUnit: Unit | null): boolean
{
	if (unit === null || unit.destroyed)
		return false;

	if (unit.getAmmo() <= 0)
		return false;

	if (targetUnit === null || targetUnit.destroyed)
		return false;

	if (!GameRules.isEnemy(unit, targetUnit))
		return false;

	if (isAir(targetUnit) && unit.unitData().airatk <= 0 ) //TODO There is a special bit for this in pg2 equipment.
		return false;

	return true;
}

//Checks if a unit can start an attack (some units can only defend against certain targets)
GameRules.canInitiateAttack = function(unit, targetUnit)
{
	if (unit === null || unit.destroyed || targetUnit === null || targetUnit.destroyed)
		return false;

	var eqid = unit.getEqid();
	var targetEqid = targetUnit.getEqid();

	if (GameRules.isEnemy(unit, targetUnit) && !Equipment.canInitiateAttackOnUnitType(eqid, targetEqid))
		return false;

	return canAttack(unit, targetUnit);
}

GameRules.canFire = function(unit, targetUnit) { return canAttack(unit, targetUnit); }

//Checks if a given unit can move into a hex
function canMoveInto(map: Hex[][], unit: Unit, cell: Cell): boolean
{
	var hex = map[cell.row][cell.col];

	if (isGround(unit) || isSea(unit))
	{
		if (hex.unit === null)
			return true;
	}
	if (isAir(unit))
	{
		if (hex.airunit === null)
			return true;
	}

	return false;
}

//Checks if a unit can pass thru a hex ocupied by a friendly unit
function canPassInto(map: Hex[][], unit: Unit, cell: Cell): boolean
{
	var hex = map[cell.row][cell.col];

	if (isGround(unit) || isSea(unit))
	{
		if (hex.unit === null) 	return true;
		if (hex.unit.player.side == unit.player.side) 	return true;
	}
	if (isAir(unit))
	{
		if (hex.airunit === null) return true;
		if (hex.airunit.player.side == unit.player.side) return true;
	}

	return false;
}
GameRules.canPassInto = function(map, unit, cell) { return canPassInto(map, unit, cell); } //TODO remove this wrappers

//A bridge unit on a river/stream hex acts as a road for its own side
GameRules.isBridgeForSide = function(hex, side)
{
	if (!hex || !hex.unit)
		return false;

	if (hex.terrain != terrainType.River && hex.terrain != terrainType.Stream)
		return false;

	if (hex.unit.isMounted || hex.unit.player.side != side)
		return false;

	return Equipment.isBridge(hex.unit.eqid);
}

GameRules.canResupply = function(map, unit)
{
	if (unit.hasMoved)
		return false;
	if (unit.hasFired)
		return false;
	if (unit.hasResupplied)
		return false;

	var needAmmo = unit.ammo < unit.unitData(true).ammo;
	var needFuel = unit.fuel < unit.unitData(true).fuel;

	if (unit.transport !== null)
	{
		needAmmo = needAmmo || (unit.transport.ammo < unit.transport.unitData().ammo);
		needFuel = needFuel || (unit.transport.fuel < unit.transport.unitData().fuel);
	}

	if (!needAmmo && !needFuel)
		return false;

	if (isGround(unit))
		return true;
	//Air Unit
	if (isAir(unit) && isAirfieldAroundUnit(map, unit))
		return true;
	//Naval Unit, the 3.2.14 bundle checks for NOT being in a port
	if (isSea(unit) && unit.getHex().terrain != terrainType.Port)
		return true;

	return false;
}

GameRules.canReinforce = function(map, unit, overstrength)
{
	if (!defined(overstrength)) overstrength = false;

	if (unit.hasOverstrength)
		return false;

	if (overstrength)
	{
		if (unit.strength < 10 || unit.experience < 100)
			return false;
		if (unit.strength >= 10 + Math.round(unit.experience / 100))
			return false;
	}
	else
	{
		if (unit.hasResupplied)
			return false;
		if (unit.strength >= 10)
			return false;
	}

	var ud = unit.unitData(true); //unused, kept from the bundle

	if (isGround(unit))
		return true;
	//Air Unit
	if (isAir(unit) && isAirfieldAroundUnit(map, unit))
		return true;
	//Naval Unit, the 3.2.14 bundle checks for NOT being in a port
	if (isSea(unit) && unit.getHex().terrain != terrainType.Port)
		return true;

	return false;
}

//Air units and mounted artillery can't capture cities
GameRules.canCapture = function(unit)
{
	var uc = unit.unitData().uclass;

	if (isAir(unit))
		return false;

	if (unit.isMounted && (uc == unitClass.antiTank || uc == unitClass.flak
		|| uc == unitClass.artillery || uc == unitClass.airDefence))
		return false;

	return true;
}

//Which unit class can gain entrenchments
GameRules.canEntrench = function(unit)
{
	if (unit === null || unit.carrier != 0)
		return false;

	var uc = unit.unitData().uclass;

	if (unitEntrenchRate[uc] > 0)
		return true;

	return false;
}

GameRules.isEnemy = function(unit, targetUnit)
{
	if (unit === null || targetUnit === null)
		return false;
	if (unit.player.side != targetUnit.player.side)
		return true;

	return false;
}
//Returns a list of units that can fire support when defunit is attacked by atkunit
GameRules.getSupportFireUnits = function(unitList, atkunit, defunit)
{
	var pa = atkunit.getPos();
	var pd = defunit.getPos();

	//No support fire if attack is from range
	if (GameRules.distance(pa.row, pa.col, pd.row, pd.col) > 1)
		return [];

	var supportUnits = [];
	var u = null;

	for (var i in unitList)
	{
		u = unitList[i];
		if (u.player.side != defunit.player.side)
			continue;

		if (u.id == defunit.id)
			continue;

		var up = u.getPos();
		var ud = u.unitData();
		var range = ud.gunrange;
		if (range == 0)	range = 1;

		if (GameRules.distance(up.row, up.col, pa.row, pa.col) > range)
			continue;

		if (!isAir(atkunit)) //Ground attack
		{
			if (ud.uclass == unitClass.artillery && canAttack(u, atkunit)) //TODO special bit for support fire in pg2 equipment
				supportUnits.push(u);
		}
		else //Air Attack
		{
			if ((ud.uclass == unitClass.flak || ud.uclass == unitClass.airDefence ||
			     ud.uclass == unitClass.fighter) && canAttack(u, atkunit))
				supportUnits.push(u);
		}
	}

	return supportUnits;
}

GameRules.isInAttackRange = function(unit, targetUnit)
{
	var p = unit.getPos();
	var tp = targetUnit.getPos();
	var range = GameRules.getUnitAttackRange(unit);

	if (!defined(p) || !defined(tp))
		return false;

	if (GameRules.distance(p.row, p.col, tp.row, tp.col) <= range)
		return true;

	return false;
}

function isAirfieldAroundUnit(map: Hex[][], unit: Unit): boolean
{
	var p = unit.getPos();
	var hex = map[p.row][p.col];

	if (hex === null)
		return false;

	//Check if hex under unit is airfield (also for small 1 hex airfields) or an own aircraft carrier
	if ((hex.terrain == terrainType.Airfield && hex.flag == unit.player.country)
		|| (hex.unit !== null && hex.unit.unitData().uclass == unitClass.carrier && hex.unit.owner == unit.player.id))
		return true;

	//If not Check adjacent hexes
	var adj = getAdjacent(p.row, p.col);

	for (var h in adj)
	{
		var r = adj[h].row;
		var c = adj[h].col;

		if (r < 0 || !defined(map[r]) || c < 0 || !defined(map[r][c]))
			continue;
		//Air units can resupply if adjacent to an Airfield hex with flag
		if ((map[r][c].terrain == terrainType.Airfield) && (map[r][c].flag == unit.player.country))
			return true;
	}

	return false;
}

//Returns unitClass.none if it's NOT possible, unitClass.airTransport or unitClass.navalTransport
GameRules.getEmbarkType = function(map, unit)
{
	var pos = unit.getPos();
	var hex = map[pos.row][pos.col];
	var ud = unit.unitData();

	if (hex.terrain == terrainType.Airfield && unit.player.airTransports > 0
		&& ud.embark > embarkType.naval && hex.airunit === null)
		return unitClass.airTransport;

	if (hex.terrain == terrainType.Port && unit.player.navalTransports > 0
		&& ud.embark > embarkType.none)
		return unitClass.navalTransport;

	return unitClass.none;
}

//Returns a list of position for disembark
GameRules.getDisembarkPositions = function(map, unit)
{
	var cellList = [];
	var ud = unit.unitData();

	//Can't disembark after move
	if (!unit.hasMoved && (ud.uclass == unitClass.airTransport || ud.uclass == unitClass.navalTransport))
	{
		var p = unit.getPos();
		var realMovMethod = Equipment.equipment[unit.eqid].movmethod;
		var moveCost = movTable[realMovMethod];
		var adj = getAdjacent(p.row, p.col);

		for (var h in adj)
		{
			var r = adj[h].row;
			var c = adj[h].col;

			if (typeof map[r] === "undefined" || typeof map[r][c] === "undefined")
				continue;

			var hex = map[r][c];
			//Only ground units can be transported
			if (hex.unit === null && moveCost[hex.terrain] < 255)
				cellList.push(adj[h]);
		}
	}

	return cellList;
}

//Returns the first hex (row, col first, then adjacent) where a bought unit can be deployed
GameRules.getReinforcementDeployPositions = function(map, unit, row, col)
{
	var ud = unit.unitData(); //unused, kept from the bundle
	var moveCost = movTable[Equipment.equipment[unit.eqid].movmethod];
	var cells = getAdjacent(row, col);

	cells.unshift(new Cell(row, col));

	for (var i in cells)
	{
		var r = cells[i].row;
		var c = cells[i].col;

		if (!defined(map[r]) || !defined(map[r][c]))
			continue;
		if (r < 0 || c < 0)
			continue;

		var hex = map[r][c];
		if (canMoveInto(map, unit, cells[i]) && moveCost[hex.terrain] < 255)
			return cells[i];
	}

	return null;
}

GameRules.canEmbark = function(map, unit)
{
	if (GameRules.getEmbarkType(map, unit) > 0 || unit.carrier < 0)
		return true;
	return false;
}

GameRules.canDisembark = function(map, unit)
{
	var l = GameRules.getDisembarkPositions(map, unit);
	if (l.length > 0)
		return true;
	return false;
}

GameRules.canMount = function(unit)
{
	if (!unit.hasMoved && isGround(unit) && unit.transport !== null)
		return true;

	return false;
}

GameRules.canUnmount = function(unit)
{
	if (!unit.hasMoved && unit.isMounted)
		return true;

	return false;
}

GameRules.isTransportable = function(unitID)
{
	if ((unitID < 1) || (typeof unitID === "undefined")) return false;

	if (Equipment.equipment[unitID].groundweight == 0)
		return false;

	return true;
}

function isAir(unit: Unit | null): boolean
{
	if (unit === null)
		return false;

	var ud = unit.unitData();
	if (ud.movmethod == movMethod.air)
		return true;

	return false;
}
GameRules.isAir = function(unit) { return isAir(unit); }

function isSea(unit: Unit | null): boolean
{
	if (unit === null)
		return false;

	var ud = unit.unitData();
	if (ud.uclass >= unitClass.submarine && ud.uclass <= unitClass.lightCruiser)
		return true;

	return false;
}
GameRules.isSea = function(unit) { return isSea(unit); }

function isGround(unit: Unit | null): boolean
{
	if (unit === null)
		return false;

	var ud = unit.unitData();
	if (ud.uclass <= unitClass.airDefence)
		return true;

	return false;
}
GameRules.isGround = function(unit) { return isGround(unit); }

//Trains are ground units using the deep naval movement table
GameRules.isTrain = function(unit)
{
	if (unit === null)
		return false;

	var ud = unit.unitData();
	if (isGround(unit) && ud.movmethod == movMethod.deepnaval)
		return true;

	return false;
}

GameRules.isCloseCombatTerrain = function(t)
{
	if (t == terrainType.City || t == terrainType.Forest || t == terrainType.Mountain
		|| t == terrainType.Fortification)
		return true;

	return false;
}

GameRules.unitUsesFuel = function(unit)
{
	if (unit.unitData().fuel == 0)
		return false;

	var m = unit.unitData().movmethod;
	if ((m == movMethod.leg) ||
		(m == movMethod.towed) ||
		(m == movMethod.allTerrainLeg))
			return false;
	return true;
}

GameRules.unitLowFuel = function(unit, threshold)
{
	if (!GameRules.unitUsesFuel(unit))
		return false;

	if (!unit.isMounted)
	{
		if (unit.fuel < threshold)
			return true;
	}
	else
	{
		if (unit.transport.fuel < threshold)
			return true;
	}

	return false;
}

GameRules.unitUsesAmmo = function(unit)
{
	if (unit.unitData().ammo == 0)
		return false;

	return true;
}

GameRules.unitLowAmmo = function(unit, threshold)
{
	if (!GameRules.unitUsesAmmo(unit))
		return false;

	if (!unit.isMounted)
	{
		if (unit.ammo < threshold)
			return true;
	}
	else
	{
		if (unit.transport.ammo < threshold)
			return true;
	}

	return false;
}

GameRules.calculateUnitCosts = function(unitid, transportid)
{
	var cost = 0;

	if (unitid > 0 && typeof unitid !== "undefined")
		cost += Equipment.equipment[unitid].cost * CURRENCY_MULTIPLIER;

	if (transportid > 0 && typeof transportid !== "undefined")
		cost += Equipment.equipment[transportid].cost * CURRENCY_MULTIPLIER;

	return cost;
}

//Upgrading to a different unit or transport costs UPGRADE_PENALTY times its price
//transportid -1 removes the transport
GameRules.calculateUpgradeCosts = function(unit, upgradeid, transportid)
{
	if (unit === null)
		return 0;

	var ocost = 0;
	var ncost = 0;
	var tcost = 0;

	if (typeof upgradeid !== "undefined" && upgradeid > 0)
	{
		if (unit.eqid == upgradeid)
			ncost = GameRules.calculateUnitCosts(unit.eqid, -1);
		else
			ncost = GameRules.calculateUnitCosts(upgradeid, -1) * UPGRADE_PENALTY;
	}
	else
	{
		ncost = GameRules.calculateUnitCosts(unit.eqid, -1);
	}

	if (typeof transportid !== "undefined" && transportid > 0)
	{
		if (unit.transport !== null && unit.transport.eqid == transportid)
			tcost = GameRules.calculateUnitCosts(-1, transportid);
		else
			tcost = GameRules.calculateUnitCosts(-1, transportid) * UPGRADE_PENALTY;
	}

	if (unit.transport !== null)
	{
		if (transportid == -1)
			ocost = GameRules.calculateUnitCosts(unit.eqid, -1);
		else
			ocost = GameRules.calculateUnitCosts(unit.eqid, unit.transport.eqid);
	}
	else
	{
		ocost = GameRules.calculateUnitCosts(unit.eqid, -1);
	}

	return (ncost + tcost - ocost) >> 0;
}

GameRules.calculateUnitCostPerStrength = function(unit)
{
	if (unit === null)
		return -1;

	return ((unit.unitData().cost * CURRENCY_MULTIPLIER) / 10) >> 0;
}

GameRules.calculateUnitSellCost = function(unit)
{
	if (!defined(unit))
		return -1;

	var transportid = -1;
	if (defined(unit.transport))
		transportid = unit.transport.eqid;

	return ((GameRules.calculateUnitCosts(unit.eqid, transportid) / UPGRADE_PENALTY / 10) * unit.strength) >> 0;
}

//Returns aproximate cardinal directions x row, y col
GameRules.getDirection = function(x1, y1, x2, y2)
{
	if (y1 & 1 && x1 == x2) x1++;
	if (y2 & 1 && x1 == x2) x2++;

	var dx = x1 - x2;
	var dy = y1 - y2;
	var delta = 0; //Gets added or substracted from a ordinal direction to get subdivisions
	var r = 1;

	//Aproximate the 8 sub-ordinal directions
	if (dx != 0)
		 r = Math.abs(dy / dx);

	if (r > 3)
		delta = 1;
	if (r < 0)
		delta = -1;

	if (dx > 0)
	{
		if (dy > 0)
			return direction.NW + delta; //+ 1 WNW, -1 NNW
		if (dy < 0)
			return direction.NE + delta;//+1 ENE, -1 NNE
		if (dy == 0)
			return direction.N;
	}
	if (dx < 0)
	{
		if (dy > 0)
			return direction.SW + delta; //+1 WSW, -1 SSW
		if (dy < 0)
			return direction.SE + delta; //+1 ESE, -1 SSE
		if (dy == 0)
			return direction.S;
	}
	if (dx == 0)
	{
		if (dy >= 0)
			return direction.W;
		if (dy < 0)
			return direction.E;
	}
}

//Returns the distance between 2 hexes x row, y col
GameRules.distance = function(x1, y1, x2, y2)
{
	var d = 0;
	//shift the entire hexgrid coords to be arranged diagonally
	if (y1 % 2)	{ x1 = x1 * 2 + 1;	}
	else { 	x1 = x1 * 2; }

	if (y2 % 2) { x2 = x2 * 2 + 1;	}
	else { x2 = x2 * 2; }

	var dx = Math.abs(x2-x1);
	var dy = Math.abs(y2-y1);

	if (dx > dy) { d = (((dx - dy)/2) + dy) >> 0; }
	else { d = dy }

	return d;
}

GameRules.getAdjacent = function(row, col) { return getAdjacent(row, col); }

//Maps a unit facing to the index of the adjacent hex in getAdjacent() list
GameRules.facingToAdjacentIndex = function(facing)
{
	if (facing == direction.N)
		return 0;
	if (facing == direction.NW || facing == direction.NNW || facing == direction.WNW || facing == direction.W)
		return 1;
	if (facing == direction.SW || facing == direction.WSW || facing == direction.SSW)
		return 2;
	if (facing == direction.S)
		return 3;
	if (facing == direction.SE || facing == direction.SSE || facing == direction.ESE)
		return 4;
	if (facing == direction.NE || facing == direction.E || facing == direction.ENE || facing == direction.NNE)
		return 5;

	return 0;
}

//Returns a random integer between min and max inclusive
GameRules.rollDice = function(min, max)
{
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Checks if 2 coordonates are adjacent x row, y col
function isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean
{
	if ((x1 - 1 + (y1 % 2) == x2) && (y1 - 1 == y2)) return true;
	if ((x1 + (y1 % 2) == x2) && (y1 - 1 == y2)) return true;
	if ((x1 - 1 == x2) && (y1 == y2)) return true;
	if ((x1 + 1 == x2) && (y1 == y2)) return true;
	if ((x1 - 1 + (y1 % 2) == x2) && (y1 + 1 == y2)) return true;
	if ((x1 + (y1 % 2) == x2) && (y1 + 1 == y2)) return true;

	return false;
}
//returns a list of adjacent cells of a row,col clockwise from N
function getAdjacent(x1: number, y1: number): Cell[]
{
	var cellList: Cell[]=[];

	cellList.push(new Cell(1 * x1 - 1, y1));
	cellList.push(new Cell(x1 - 1 + (y1 % 2), y1 - 1));
	cellList.push(new Cell(1 * x1 + (y1 % 2), y1 - 1));
	cellList.push(new Cell(1 * x1 + 1, y1));
	cellList.push(new Cell(1 * x1 + (y1 % 2), 1 * y1 + 1));
	cellList.push(new Cell(1 * x1 - 1 + (y1 % 2), 1 * y1 + 1));

	return cellList;
}

//Returns a list of cells that are in a certain range to another cell
//extended: return extendedCell objects with range set instead of plain Cells
function getCellsInRange(row: number, col: number, range: number, mrows: number, mcols: number, extended: true): extendedCell[];
function getCellsInRange(row: number, col: number, range: number, mrows: number, mcols: number, extended: false): Cell[];
function getCellsInRange(row: number, col: number, range: number, mrows: number, mcols: number, extended: boolean): Cell[]
{
	var cellList: Cell[] = [];
	var cell = null;

	if ( range <= 0) return cellList;

	var minRow = row - range;
	var maxRow = row + range;

	//the column
	for (var i = minRow; i <= maxRow; i++)
	{
		if (i < 0 || i >= mrows || i == row) continue;
		if (extended)
		{
			cell = new extendedCell(i, col);
			cell.range = Math.abs(row - i);
		}
		else
		{
			cell = new Cell(i, col);
		}
		cellList.push(cell);
	}
	//the rows around
	for (var colOff = 1; colOff <= range; colOff++)
	{
		//rows have a ripple effect
		if ((col + colOff) % 2 == 1)
		{
			if (maxRow > 0) { maxRow--; }
		}
		else
		{
			if (minRow < mrows) { minRow++; }
		}
		for (i = minRow; i <= maxRow; i++)
		{
			if (i < 0 || i >= mrows) continue;
			if ((col + colOff) < mcols)
			{
				if (extended)
				{
					cell = new extendedCell(i, col + colOff);
					cell.range = GameRules.distance(row, col, i, col + colOff);
				}
				else
				{
					cell = new Cell(i, col + colOff);
				}
				cellList.push(cell);
			}
			if ((col - colOff) > 0)
			{
				if (extended)
				{
					cell = new extendedCell(i, col - colOff);
					cell.range = GameRules.distance(row, col, i, col - colOff);
				}
				else
				{
					cell = new Cell(i, col - colOff);
				}
				cellList.push(cell);
			}
		}
	}
	return cellList;
}
//------------------------ MODULE END ----------------------
return GameRules; }(GameRules || {} as GameRulesModule)); //Module end giberish
