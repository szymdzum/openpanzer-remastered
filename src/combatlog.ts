/**
 * CombatLog - Logs combats, resupplies, reinforcements, leaders and objective captures
 * during a turn, read by UICombatLog to show the turn summary
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle. There is no 2.9 counterpart,
 * names come from the property names and the callers (Map.attackUnit, UICombatLog).
 */

//A unit's state saved by addCombatStart
interface CombatUnitState
{
	id: number;
	eqid: number;
	side: number;
	str: number;
	xp: number;
	entrench: number;
	pos: Cell;
	isMounted: boolean;
	isSurprised?: boolean; //attacker only
	isSupport?: boolean; //never saved, read by addCombatEnd
}

//A combat started and not yet ended
interface CombatRound
{
	attacker: CombatUnitState;
	defender: CombatUnitState;
	turn: number;
}

//A unit's combat totals for the turn
interface CombatUnitInfo
{
	id: number;
	eqid: number;
	side: number;
	str: number;
	losses: number;
	kills: number;
	xp: number;
	entrenchLost: number;
	entrench: number;
	ammo: number;
	pos: Cell;
	assaults: number;
	defends: number;
	supports: number;
	isMounted: boolean;
	isSurprised: boolean;
	isCore: boolean;
	isSupport?: boolean; //set by addCombatEnd, always undefined
	unitCombatList: number[];
}

//A unit's state after a resupply
interface UnitEndTurnInfo
{
	eqid: number;
	side: number;
	ammo: number;
	fuel: number;
	isCore: boolean;
}

interface CombatLogReinforcement { eqid: number; pos: Cell; side: number }
interface CombatLogLeader { id: number; eqid: number; isCore: boolean; pos: Cell; leader: number; classLeader: number; side: number }
interface CombatLogObjective { pos: Cell; side: number }

interface CombatLogEntries
{
	combat: { [unitId: number]: CombatUnitInfo };
	reinforce: CombatLogReinforcement[];
	leaders: CombatLogLeader[];
	resupply: { [unitId: number]: UnitEndTurnInfo };
	objectives: CombatLogObjective[];
}

interface CombatLogModule
{
	log: CombatLogEntries;
	combatRound: { [combatId: number]: CombatRound | {} };
	uniqueID: number;
	reset(): void;
	addCombatStart(atkunit: Unit, defunit: Unit, turn: number): number;
	addCombatEnd(atkunit: Unit, defunit: Unit, combatId: number, supportFire: boolean): boolean;
	addReinforcement(unit: Unit): void;
	addLeader(unit: Unit): void;
	addResupply(unit: Unit): void;
	addObjectiveCapture(pos: Cell, side: number): void;
	combatUnitInfo: new () => CombatUnitInfo;
	unitEndTurnInfo: new () => UnitEndTurnInfo;
}

//var CombatLog = CombatLog || {}; //Namespace emulation
var CombatLog: CombatLogModule = (function(CombatLog: CombatLogModule) { //Module start

CombatLog.log = {} as CombatLogEntries;
CombatLog.log.combat = {}; //combatUnitInfo by unit id
CombatLog.log.reinforce = [];
CombatLog.log.leaders = [];
CombatLog.log.resupply = {}; //unitEndTurnInfo by unit id
CombatLog.log.objectives = [];
CombatLog.combatRound = {}; //combats started and not yet ended, by combat id
CombatLog.uniqueID = 0;

CombatLog.reset = function()
{
	CombatLog.log = {} as CombatLogEntries;
	CombatLog.log.combat = {};
	CombatLog.log.reinforce = [];
	CombatLog.log.leaders = [];
	CombatLog.log.resupply = {};
	CombatLog.log.objectives = [];
	CombatLog.combatRound = {};
	CombatLog.uniqueID = 0;
}

//Saves the state of both units before the combat, returns the combat id to pass to addCombatEnd
CombatLog.addCombatStart = function(atkunit: Unit, defunit: Unit, turn: number): number
{
	CombatLog.uniqueID++;
	CombatLog.combatRound[CombatLog.uniqueID] = {
		attacker: {
			id: atkunit.id,
			eqid: atkunit.eqid,
			side: atkunit.player.side,
			str: atkunit.strength,
			xp: atkunit.experience,
			entrench: atkunit.entrenchment,
			pos: atkunit.getPos(),
			isMounted: atkunit.isMounted,
			isSurprised: atkunit.isSurprised
		},
		defender: {
			id: defunit.id,
			eqid: defunit.eqid,
			side: defunit.player.side,
			str: defunit.strength,
			xp: defunit.experience,
			entrench: defunit.entrenchment,
			pos: defunit.getPos(),
			isMounted: defunit.isMounted
		},
		turn: turn
	};
	return CombatLog.uniqueID;
}

//Adds the result of a started combat to the attacker and defender totals
CombatLog.addCombatEnd = function(atkunit: Unit, defunit: Unit, combatId: number, supportFire: boolean): boolean
{
	//Implicit global "c" in the bundle, kept
	c = CombatLog.combatRound[combatId] as CombatRound;
	if (typeof c === "undefined")
		return false;

	var atkId = c.attacker.id;
	var defId = c.defender.id;
	var atkInfo = CombatLog.log.combat[atkId];
	var defInfo = CombatLog.log.combat[defId];

	if (!atkInfo || typeof atkInfo === "undefined")
	{
		CombatLog.log.combat[atkId] = new CombatLog.combatUnitInfo();
		atkInfo = CombatLog.log.combat[atkId];
	}
	if (!defInfo || typeof defInfo === "undefined")
	{
		CombatLog.log.combat[defId] = new CombatLog.combatUnitInfo();
		defInfo = CombatLog.log.combat[defId];
	}

	atkInfo.id = atkId;
	atkInfo.eqid = +c.attacker.eqid;
	atkInfo.side = +c.attacker.side;
	atkInfo.losses += +c.attacker.str - atkunit.strength;
	atkInfo.str = +atkunit.strength;
	atkInfo.xp += +atkunit.experience - c.attacker.xp;
	atkInfo.ammo = +atkunit.ammo;
	atkInfo.entrenchLost += +c.attacker.entrench - atkunit.entrenchment;
	atkInfo.entrench = +atkunit.entrenchment;
	atkInfo.pos = c.attacker.pos;
	atkInfo.isSurprised = c.attacker.isSurprised;
	atkInfo.isCore = atkunit.isCore;
	atkInfo.isSupport = c.attacker.isSupport; //never saved by addCombatStart, always undefined
	if (supportFire)
		atkInfo.supports++;
	else
		atkInfo.assaults++;
	atkInfo.unitCombatList.push(defId);

	defInfo.id = defId;
	defInfo.eqid = +c.defender.eqid;
	defInfo.side = +c.defender.side;
	defInfo.losses += +c.defender.str - defunit.strength;
	defInfo.str = +defunit.strength;
	defInfo.xp += +defunit.experience - c.defender.xp;
	defInfo.ammo = +defunit.ammo;
	//Bundle subtracts the attacker entrenchment here, kept
	defInfo.entrenchLost += +c.defender.entrench - atkunit.entrenchment;
	defInfo.entrench = +defunit.entrenchment;
	defInfo.pos = c.defender.pos;
	defInfo.isCore = defunit.isCore;
	defInfo.defends++;
	defInfo.unitCombatList.push(atkId);

	atkInfo.kills = defInfo.losses;
	defInfo.kills = atkInfo.losses;
	defInfo.unitCombatList.push(atkId); //pushed a second time in the bundle, kept

	CombatLog.combatRound[combatId] = {};
	delete CombatLog.combatRound[combatId];
	return true;
}

CombatLog.addReinforcement = function(unit: Unit): void
{
	if (typeof unit.player === "undefined" || unit.player === null)
		return;

	var r = {} as CombatLogReinforcement;
	r.eqid = unit.eqid;
	r.pos = unit.getPos();
	r.side = unit.player.side;
	CombatLog.log.reinforce.push(r);
}

CombatLog.addLeader = function(unit: Unit): void
{
	if (typeof unit.player === "undefined" || unit.player === null)
		return;

	var l = {} as CombatLogLeader;
	l.id = unit.id;
	l.eqid = unit.eqid;
	l.isCore = unit.isCore;
	l.pos = unit.getPos();
	l.leader = unit.leader;
	l.classLeader = Leaders.getUnitClassLeader(unit);
	l.side = unit.player.side;
	CombatLog.log.leaders.push(l);
}

CombatLog.addResupply = function(unit: Unit): void
{
	var id = unit.id;
	if (!id || typeof id === "undefined" || typeof unit.player === "undefined" || unit.player === null)
		return;

	var info = CombatLog.log.resupply[id];
	if (!info || typeof info === "undefined")
	{
		CombatLog.log.resupply[id] = new CombatLog.unitEndTurnInfo();
		info = CombatLog.log.resupply[id];
	}
	info.eqid = unit.eqid;
	info.ammo = unit.ammo;
	info.fuel = unit.fuel;
	info.isCore = unit.isCore;
	info.side = unit.player.side;
}

CombatLog.addObjectiveCapture = function(pos: Cell, side: number): void
{
	var o = {} as CombatLogObjective;
	o.pos = new Cell(pos.row, pos.col);
	o.side = side;
	CombatLog.log.objectives.push(o);
}

//A unit's combat totals for the turn
CombatLog.combatUnitInfo = class implements CombatUnitInfo
{
	declare id: number;
	declare eqid: number;
	declare side: number;
	declare str: number;
	declare losses: number;
	declare kills: number;
	declare xp: number;
	declare entrenchLost: number;
	declare entrench: number;
	declare ammo: number;
	declare pos: Cell;
	declare assaults: number;
	declare defends: number;
	declare supports: number;
	declare isMounted: boolean;
	declare isSurprised: boolean;
	declare isCore: boolean;
	declare isSupport?: boolean;
	declare unitCombatList: number[];

	constructor()
	{
		this.id = 0;
		this.eqid = 0;
		this.side = -1;
		this.str = 0;
		this.losses = 0;
		this.kills = 0;
		this.xp = 0;
		this.entrenchLost = 0;
		this.entrench = 0;
		this.ammo = 0;
		this.pos = new Cell(0, 0);
		this.assaults = 0;
		this.defends = 0;
		this.supports = 0;
		this.isMounted = false;
		this.isSurprised = false;
		this.isCore = false;
		this.unitCombatList = []; //ids of the units fought
	}
}

//A unit's state after a resupply
CombatLog.unitEndTurnInfo = class implements UnitEndTurnInfo
{
	declare eqid: number;
	declare side: number;
	declare ammo: number;
	declare fuel: number;
	declare isCore: boolean;

	constructor()
	{
		this.eqid = 0;
		this.side = -1;
		this.ammo = -1;
		this.fuel = -1;
		this.isCore = false;
	}
}

//------------------------ MODULE END ----------------------
return CombatLog; }(CombatLog || {} as CombatLogModule)); //Module end giberish
