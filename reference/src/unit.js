/**
 * Unit - Provides Unit and Transport objects
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

//Transport Object Constructor
function Transport(equipmentID)
{
	if (typeof Equipment.equipment[equipmentID] === "undefined")
		this.eqid = Object.keys(Equipment.equipment)[0];
	else
		this.eqid = equipmentID;
	this.ammo = Equipment.equipment[this.eqid].ammo;
	this.fuel = Equipment.equipment[this.eqid].fuel;
	this.icon = Equipment.equipment[this.eqid].icon; //This is only used when building image cache list in map.js
}

//Transport Object Public Methods
Transport.prototype.copy = function(t)
{
	if (t === null) return;
	this.eqid = t.eqid;
	this.ammo = t.ammo;
	this.fuel = t.fuel;
}
Transport.prototype.unitData = function() { return Equipment.equipment[this.eqid]; }

//Unit Object Constructor
function Unit(equipmentID)
{
	//Public Properties
	if (typeof Equipment.equipment[equipmentID] === "undefined")
		this.eqid = Object.keys(Equipment.equipment)[0];
	else
		this.eqid = equipmentID;
	this.id = -1;
	this.owner = -1;
	this.hasMoved = false;
	this.hasFired = false;
	this.hasResupplied = false;
	this.hasOverstrength = false; //Unit can't be reinforced over strength after moving or firing
	this.isMounted = false;
	this.isSurprised = false; //Unit has been surprised during move
	this.isDeployed = false; //Unit is deployed on map or it's on equipment window
	this.isCore = false; //Unit is a core unit for the campaign player
	this.tempSpotted = false;
	this.strength = 10;
	this.facing = 2; //default unit facing
	this.flag = this.owner; //default flag
	this.destroyed = false; //flag to check if a unit is destroyed
	this.player = null; //TODO remove use owner ID
	this.transport = null; //transport class pointer
	this.carrier = 0; //air/naval carrier which is not a unit assigned transport, negative when temporarily disembarked
	this.moveLeft = Equipment.equipment[this.eqid].movpoints; //for phased/recon movement
	this.ammo = Equipment.equipment[this.eqid].ammo; //holds the ammo of the unit but it's getter is getAmmo()
	this.fuel = Equipment.equipment[this.eqid].fuel; //holds the fuel of the unit but it's getter is getFuel()
	this.hasAnimation = false; //flag if the unit has a move animation
	this.hits = 0; //the number of hits unit received this turn
	this.experience = 0; //combat experience
	this.entrenchment = 0; //level of entrenchment this unit has
	this.entrenchTicks = 0; //how many tick to gain another entrenchment
	this.leader = -1; //leader id, -1 for none

	//Privileged Methods that access private properties/methods
	this.getHex = function() { return hex; }
	this.setHex = function(h)
	{
		hex = h;
		if (h !== null) // set unit as deployed (might be called from map.deployUnit)
			this.isDeployed = true;
		//We don't set isDeployed to false here only in setPlayerToHQ() when units are sent to HQ pool
	}

	this.getPos = function()
	{
		if (hex === null)
			return null;
		return hex.getPos();
	};

	//Private Methods and Properties
	var hex = null; //The hex that this unit is on
};

//Unit Object Public Methods
Unit.prototype.copy = function(u)
{
	if (u === null) return;
	if (typeof Equipment.equipment[u.eqid] === "undefined")
		this.eqid = Object.keys(Equipment.equipment)[0];
	else
		this.eqid = u.eqid;
	this.id = u.id;
	this.owner = u.owner;
	this.hasMoved = u.hasMoved;
	this.hasFired = u.hasFired;
	this.hasOverstrength = u.hasOverstrength;
	this.hasResupplied = u.hasResupplied;
	this.isMounted = u.isMounted;
	this.isSurprised = u.isSurprised;
	this.isDeployed = u.isDeployed;
	this.isCore = u.isCore;
	this.carrier = u.carrier;
	this.moveLeft = u.moveLeft;
	this.ammo = u.ammo;
	this.fuel = u.fuel;
	this.strength = u.strength;
	this.facing = u.facing;
	this.flag = u.flag;
	this.destroyed = u.destroyed;
	this.hits = u.hits;
	this.experience = u.experience;
	this.entrenchment = u.entrenchment;
	this.entrenchTicks = u.entrenchTicks;
	this.leader = u.leader;
	//The player is taken from the current map by owner id, not from u.player
	this.player = new Player();
	this.player.copy(game.scenario.map.getPlayer(this.owner));
	if (u.transport !== null)
	{
		this.transport = new Transport(u.transport.eqid);
		this.transport.copy(u.transport);
	}
}

//Returns the equipment id of what the unit currently is: carrier, transport or the unit itself
Unit.prototype.getEqid = function(forceUnit)
{
	if (this.carrier > 0 && !forceUnit) //Unit on carrier
		return this.carrier;
	if (this.isMounted && this.transport !== null && !forceUnit) //Unit on transport
		return this.transport.eqid;
	return this.eqid; //Real Unit
}

Unit.prototype.unitData = function(forceUnit)
{
	if (!defined(forceUnit)) forceUnit = false;
	return Equipment.equipment[this.getEqid(forceUnit)];
}

Unit.prototype.getMovesLeft = function()
{
	//On carrier always has movement of the carrier
	if (this.carrier > 0)
		return Equipment.equipment[this.carrier].movpoints;

	//There is no point saving moveLeft in transport object since they consume all points when moving
	if (this.isMounted && this.transport !== null)
		return Equipment.equipment[this.transport.eqid].movpoints;
	if (this.hasMoved)
		return 0;
	return this.moveLeft;
}

Unit.prototype.getAmmo = function()
{
	if (this.isMounted && this.transport !== null)
		return this.transport.ammo;
	else
		return this.ammo;
}

Unit.prototype.getFuel = function()
{
	if (this.isMounted && this.transport !== null)
		return this.transport.fuel;
	else
		return this.fuel;
}

Unit.prototype.hit = function(losses)
{
	this.strength -= losses;
	this.hits++;
	if (this.entrenchment > 0) this.entrenchment--;
	if (this.strength <= 0) this.destroyed = true;
}

Unit.prototype.fire = function(isAttacking)
{
	//Unit is shown on map when fires even if it's on a non spotted hex (support fire)
	this.tempSpotted = true;
	this.ammo--; //TODO some transports can attack ?
	if (isAttacking) //Support and Defence fire don't block this unit for attacking
	{
		this.hasFired = true;
		this.hasOverstrength = true;
	}
}

Unit.prototype.move = function(cost)
{
	this.entrenchment = 0; //loses all entrenchment
	var fuelUsed = 0;
	if (cost >= 254) //Remove stopmov or noenter costs
		fuelUsed = (cost / 254 + cost % 254) >> 0; //TODO: fix in GameRules unit shouldn't be allowed to move if cost > 254
	else
		fuelUsed = cost;

	if (this.isMounted && this.transport !== null)
	{
		this.hasFired = true; //can't fire after being moved in transport
		if (GameRules.unitUsesFuel(this.transport))
			this.transport.fuel -= fuelUsed;
		this.moveLeft = 0;
	}
	else
	{
		if (GameRules.unitUsesFuel(this) && this.carrier == 0)
			this.fuel -= fuelUsed;
		this.moveLeft -= fuelUsed;
	}
	//Recon units can move multiple times
	if (this.unitData().uclass != unitClass.recon || this.moveLeft <= 0)
	{
		this.hasMoved = true;
		this.hasOverstrength = true;
	}
	//A temporarily disembarked unit (see toggleEmbark) loses its carrier after moving
	if (this.carrier < 0) this.carrier = 0;
}

Unit.prototype.upgrade = function(upgradeid, transportid)
{
	// 0 or -1 means keep the current unit and upgrade the transport eventually
	if (upgradeid <= 0)
		upgradeid = this.eqid;

	var oldClass = Equipment.equipment[this.eqid].uclass;
	var newClass = Equipment.equipment[upgradeid].uclass;
	//Flak can be upgraded to air defence
	if (oldClass == unitClass.flak && newClass == unitClass.airDefence)
		oldClass = unitClass.airDefence;

	if (oldClass != newClass)
		return false;

	this.eqid = upgradeid;

	if (GameRules.isTransportable(this.eqid))
	{
		//Replace or create a new transport
		if (transportid > 0) this.setTransport(transportid);
	}
	else
	{
		//Remove the tranport if the new unit is no longer transportable
		if (this.transport !== null) this.transport = null;
	}

	this.refillAmmoFuel();
	this.entrenchment = 0;

	if (this.isDeployed) //Allow undeployed units to move/attack after upgrade (HQ upgrade)
		this.hasMoved = this.hasFired = this.hasOverstrength = this.hasResupplied = true;

	return true;
}

//supply is a Supply object (see GameRules.getResupplyValue)
Unit.prototype.resupply = function(supply)
{
	this.ammo += supply.ammo;
	this.fuel += supply.fuel;
	if (this.transport !== null)
	{
		this.transport.ammo += supply.transportAmmo;
		this.transport.fuel += supply.transportFuel;
	}
	this.hasMoved = this.hasFired = this.hasResupplied = true;
}

Unit.prototype.reinforce = function(str, isOverstrength)
{
	this.strength += str;
	//hasRessuplied is a typo kept from the original, it sets a new property and not hasResupplied
	this.hasMoved = this.hasFired = this.hasRessuplied = true;
	if (isOverstrength) this.hasOverstrength = true;
}

Unit.prototype.setTransport = function(id)
{
	delete this.transport;
	this.transport = new Transport(id);
}

Unit.prototype.mount = function() { this.isMounted = true; }
Unit.prototype.unmount = function() { this.isMounted = false; }

Unit.prototype.embark = function(type)
{
	var id = Equipment.getCountryEquipmentByClass(type, this.player.country + 1)[0]; //TODO Already found in map.addPlayer

	if (!id || typeof id === "undefined")
		return false;

	this.carrier = id;

	return true;
}

Unit.prototype.entrench = function()
{
	var hex = null;
	var uc = this.unitData().uclass;
	var terrainEntrench = 0;

	if (!GameRules.canEntrench(this))
		return false;

	hex = this.getHex();

	if (!hex) return false;

	terrainEntrench = terrainEntrenchment[hex.terrain];

	if (this.entrenchment >= terrainEntrenchment[hex.terrain])
	{
		var entrenchLevel = this.entrenchment - terrainEntrench;
		var nextEntrenchLevel = 9 * entrenchLevel + 4;
		this.entrenchTicks += +(this.experience/100) + (terrainEntrench + 1) * unitEntrenchRate[uc];
		while(this.entrenchTicks >= nextEntrenchLevel && this.entrenchment < (terrainEntrench + 5))
		{
			this.entrenchTicks -= nextEntrenchLevel;
			this.entrenchment++;
			entrenchLevel++;
			nextEntrenchLevel = 9 * entrenchLevel + 4;
		}
	}
	else
	{
		this.entrenchment = terrainEntrench;
		this.entrenchTicks = 0;
	}

	return true;
}

//Switches between embarked (carrier > 0) and disembarked keeping the carrier (carrier < 0)
Unit.prototype.toggleEmbark = function() { this.carrier = -this.carrier; }
Unit.prototype.getIcon = function() { return this.unitData().icon; }

Unit.prototype.refillAmmoFuel = function()
{
	this.ammo = Equipment.equipment[this.eqid].ammo;
	this.fuel = Equipment.equipment[this.eqid].fuel;
	if (this.transport !== null && defined(Equipment.equipment[this.transport.eqid]))
	{
		this.transport.ammo = Equipment.equipment[this.transport.eqid].ammo;
		this.transport.fuel = Equipment.equipment[this.transport.eqid].fuel;
	}
}

Unit.prototype.unitEndTurn = function()
{
	this.entrench();
	this.moveLeft = Equipment.equipment[this.eqid].movpoints; //reset movement points don't use unitData() since it could be mounted
	this.hasMoved = this.hasFired = this.hasResupplied = this.isSurprised = this.hasOverstrength = false;
	this.hits = 0;
	//Fortifications stay visible once seen, other units hide when their hex is no longer spotted
	if (this.unitData().uclass !== unitClass.fortification)
	{
		var hex = this.getHex();
		if (hex !== null && !hex.isSpotted(game.spotSide))
			this.tempSpotted = false;
	}
}

//frees memory asociated with this object if possible
Unit.prototype.cleanup = function()
{
	//TODO can't delete units since some of them are linked in coreUnits for campaign players
}
