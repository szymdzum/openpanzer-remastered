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

import { type Cell, type Supply, terrainEntrenchment, unitClass, unitEntrenchRate } from "./prototypes";
import { Equipment } from "./equipment";
import { defined } from "./util";
import { GameRules } from "./gamerules";
import { type Hex, Player } from "./map";
import { engineContext } from "./context";

//Transport Object Constructor
//A class so other modules can type `new Transport(...)`. Fields are `declare`d (they emit nothing),
//the methods stay assigned to the prototype (enumerable, as the original), typed by the interface below
export class Transport {
	declare eqid: number;
	declare ammo: number;
	declare fuel: number;
	declare icon: string;

	constructor(equipmentID: number) {
		if (typeof Equipment.equipment[equipmentID] === "undefined")
			this.eqid = Object.keys(Equipment.equipment)[0] as unknown as number; //a string key, kept
		else
			this.eqid = equipmentID;
		this.ammo = Equipment.equipment[this.eqid].ammo;
		this.fuel = Equipment.equipment[this.eqid].fuel;
		this.icon = Equipment.equipment[this.eqid].icon; //This is only used when building image cache list in map.js
	}
}

export interface Transport {
	copy(t: Transport | null): void;
	unitData(): EquipmentEntry;
}

//Transport Object Public Methods
Transport.prototype.copy = function(t: Transport | null) {
	if (t === null) return;
	this.eqid = t.eqid;
	this.ammo = t.ammo;
	this.fuel = t.fuel;
}
Transport.prototype.unitData = function(): EquipmentEntry { return Equipment.equipment[this.eqid]; }

//Unit Object Constructor
//A class so other modules can type `new Unit(...)`: the constructor body is the original one
//(hex stays private to its closures), fields and privileged methods are `declare`d (they emit
//nothing), the public methods stay assigned to the prototype, typed by the interface below
export class Unit {
	declare eqid: number;
	declare id: number;
	declare owner: number;
	declare hasMoved: boolean;
	declare hasFired: boolean;
	declare hasResupplied: boolean;
	declare hasRessuplied?: boolean; //only set by reinforce(), a typo kept from the original
	declare hasOverstrength: boolean;
	declare isMounted: boolean;
	declare isSurprised: boolean;
	declare isDeployed: boolean;
	declare isCore: boolean;
	declare tempSpotted: boolean;
	declare strength: number;
	declare facing: number;
	declare flag: number;
	declare destroyed: boolean;
	declare player: Player | null;
	declare transport: Transport | null;
	declare carrier: number;
	declare moveLeft: number;
	declare ammo: number;
	declare fuel: number;
	declare hasAnimation: boolean;
	declare hits: number;
	declare experience: number;
	declare entrenchment: number;
	declare entrenchTicks: number;
	declare leader: number;

	declare getHex: () => Hex | null;
	declare setHex: (h: Hex | null) => void;
	declare getPos: () => Cell | null;

	constructor(equipmentID: number) {
		//Public Properties
		if (typeof Equipment.equipment[equipmentID] === "undefined")
			this.eqid = Object.keys(Equipment.equipment)[0] as unknown as number; //a string key, kept
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
		this.setHex = function(h: Hex | null) {
			hex = h;
			if (h !== null) // set unit as deployed (might be called from map.deployUnit)
				this.isDeployed = true;
			//We don't set isDeployed to false here only in setPlayerToHQ() when units are sent to HQ pool
		}

		this.getPos = function() {
			if (hex === null)
				return null;
			return hex.getPos();
		};

		//Private Methods and Properties
		var hex: Hex | null = null; //The hex that this unit is on
	}
};

export interface Unit {
	nodossier: boolean; //set by map.js: disbanded or removed, not a loss for the dossier
	copy(u: Unit | null): void;
	getEqid(forceUnit?: boolean): number;
	unitData(forceUnit?: boolean): EquipmentEntry;
	getMovesLeft(): number;
	getAmmo(): number;
	getFuel(): number;
	hit(losses: number): void;
	fire(isAttacking: boolean): void;
	move(cost: number): void;
	upgrade(upgradeid: number, transportid: number): boolean;
	resupply(supply: Supply): void;
	reinforce(str: number, isOverstrength: boolean): void;
	setTransport(id: number): void;
	mount(): void;
	unmount(): void;
	embark(type: number): boolean;
	entrench(): boolean;
	toggleEmbark(): void;
	getIcon(): string;
	refillAmmoFuel(): void;
	unitEndTurn(): void;
	cleanup(): void;
}

//Unit Object Public Methods
Unit.prototype.copy = function(u: Unit | null) {
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
	this.player.copy(engineContext.scenario().map.getPlayer(this.owner));
	if (u.transport !== null) {
		this.transport = new Transport(u.transport.eqid);
		this.transport.copy(u.transport);
	}
}

//Returns the equipment id of what the unit currently is: carrier, transport or the unit itself
Unit.prototype.getEqid = function(forceUnit?: boolean): number {
	if (this.carrier > 0 && !forceUnit) //Unit on carrier
		return this.carrier;
	if (this.isMounted && this.transport !== null && !forceUnit) //Unit on transport
		return this.transport.eqid;
	return this.eqid; //Real Unit
}

Unit.prototype.unitData = function(forceUnit?: boolean): EquipmentEntry {
	if (!defined(forceUnit)) forceUnit = false;
	return Equipment.equipment[this.getEqid(forceUnit)];
}

Unit.prototype.getMovesLeft = function(): number {
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

Unit.prototype.getAmmo = function(): number {
	if (this.isMounted && this.transport !== null)
		return this.transport.ammo;
	else
		return this.ammo;
}

Unit.prototype.getFuel = function(): number {
	if (this.isMounted && this.transport !== null)
		return this.transport.fuel;
	else
		return this.fuel;
}

Unit.prototype.hit = function(losses: number) {
	this.strength -= losses;
	this.hits++;
	if (this.entrenchment > 0) this.entrenchment--;
	if (this.strength <= 0) this.destroyed = true;
}

Unit.prototype.fire = function(isAttacking: boolean) {
	//Unit is shown on map when fires even if it's on a non spotted hex (support fire)
	this.tempSpotted = true;
	this.ammo--; //TODO some transports can attack ?
	if (isAttacking) { //Support and Defence fire don't block this unit for attacking
		this.hasFired = true;
		this.hasOverstrength = true;
	}
}

Unit.prototype.move = function(cost: number) {
	this.entrenchment = 0; //loses all entrenchment
	let fuelUsed = 0;
	if (cost >= 254) //Remove stopmov or noenter costs
		fuelUsed = (cost / 254 + cost % 254) >> 0; //TODO: fix in GameRules unit shouldn't be allowed to move if cost > 254
	else
		fuelUsed = cost;

	if (this.isMounted && this.transport !== null) {
		this.hasFired = true; //can't fire after being moved in transport
		if (GameRules.unitUsesFuel(this.transport))
			this.transport.fuel -= fuelUsed;
		this.moveLeft = 0;
	} else {
		if (GameRules.unitUsesFuel(this) && this.carrier == 0)
			this.fuel -= fuelUsed;
		this.moveLeft -= fuelUsed;
	}
	//Recon units can move multiple times
	if (this.unitData().uclass != unitClass.recon || this.moveLeft <= 0) {
		this.hasMoved = true;
		this.hasOverstrength = true;
	}
	//A temporarily disembarked unit (see toggleEmbark) loses its carrier after moving
	if (this.carrier < 0) this.carrier = 0;
}

Unit.prototype.upgrade = function(upgradeid: number, transportid: number): boolean {
	// 0 or -1 means keep the current unit and upgrade the transport eventually
	if (upgradeid <= 0)
		upgradeid = this.eqid;

	let oldClass = Equipment.equipment[this.eqid].uclass;
	const newClass = Equipment.equipment[upgradeid].uclass;
	//Flak can be upgraded to air defence
	if (oldClass == unitClass.flak && newClass == unitClass.airDefence)
		oldClass = unitClass.airDefence;

	if (oldClass != newClass)
		return false;

	this.eqid = upgradeid;

	if (GameRules.isTransportable(this.eqid)) {
		//Replace or create a new transport
		if (transportid > 0) this.setTransport(transportid);
	} else {
		//Remove the transport if the new unit is no longer transportable
		if (this.transport !== null) this.transport = null;
	}

	this.refillAmmoFuel();
	this.entrenchment = 0;

	if (this.isDeployed) //Allow undeployed units to move/attack after upgrade (HQ upgrade)
		this.hasMoved = this.hasFired = this.hasOverstrength = this.hasResupplied = true;

	return true;
}

//supply is a Supply object (see GameRules.getResupplyValue)
Unit.prototype.resupply = function(supply: Supply) {
	this.ammo += supply.ammo;
	this.fuel += supply.fuel;
	if (this.transport !== null) {
		this.transport.ammo += supply.transportAmmo;
		this.transport.fuel += supply.transportFuel;
	}
	this.hasMoved = this.hasFired = this.hasResupplied = true;
}

Unit.prototype.reinforce = function(str: number, isOverstrength: boolean) {
	this.strength += str;
	//hasRessuplied is a typo kept from the original, it sets a new property and not hasResupplied
	this.hasMoved = this.hasFired = this.hasRessuplied = true;
	if (isOverstrength) this.hasOverstrength = true;
}

Unit.prototype.setTransport = function(id: number) {
	delete this.transport;
	this.transport = new Transport(id);
}

Unit.prototype.mount = function() { this.isMounted = true; }
Unit.prototype.unmount = function() { this.isMounted = false; }

Unit.prototype.embark = function(type: number): boolean {
	const id = Equipment.getCountryEquipmentByClass(type, this.player.country + 1)[0]; //TODO Already found in map.addPlayer

	if (!id || typeof id === "undefined")
		return false;

	this.carrier = id;

	return true;
}

Unit.prototype.entrench = function(): boolean {
	let hex: Hex | null = null;
	const uc = this.unitData().uclass;
	let terrainEntrench = 0;

	if (!GameRules.canEntrench(this))
		return false;

	hex = this.getHex();

	if (!hex) return false;

	terrainEntrench = terrainEntrenchment[hex.terrain];

	if (this.entrenchment >= terrainEntrenchment[hex.terrain]) {
		let entrenchLevel = this.entrenchment - terrainEntrench;
		let nextEntrenchLevel = 9 * entrenchLevel + 4;
		this.entrenchTicks += +(this.experience/100) + (terrainEntrench + 1) * unitEntrenchRate[uc];
		while(this.entrenchTicks >= nextEntrenchLevel && this.entrenchment < (terrainEntrench + 5)) {
			this.entrenchTicks -= nextEntrenchLevel;
			this.entrenchment++;
			entrenchLevel++;
			nextEntrenchLevel = 9 * entrenchLevel + 4;
		}
	} else {
		this.entrenchment = terrainEntrench;
		this.entrenchTicks = 0;
	}

	return true;
}

//Switches between embarked (carrier > 0) and disembarked keeping the carrier (carrier < 0)
Unit.prototype.toggleEmbark = function() { this.carrier = -this.carrier; }
Unit.prototype.getIcon = function(): string { return this.unitData().icon; }

Unit.prototype.refillAmmoFuel = function() {
	this.ammo = Equipment.equipment[this.eqid].ammo;
	this.fuel = Equipment.equipment[this.eqid].fuel;
	if (this.transport !== null && defined(Equipment.equipment[this.transport.eqid])) {
		this.transport.ammo = Equipment.equipment[this.transport.eqid].ammo;
		this.transport.fuel = Equipment.equipment[this.transport.eqid].fuel;
	}
}

Unit.prototype.unitEndTurn = function() {
	this.entrench();
	this.moveLeft = Equipment.equipment[this.eqid].movpoints; //reset movement points don't use unitData() since it could be mounted
	this.hasMoved = this.hasFired = this.hasResupplied = this.isSurprised = this.hasOverstrength = false;
	this.hits = 0;
	//Fortifications stay visible once seen, other units hide when their hex is no longer spotted
	if (this.unitData().uclass !== unitClass.fortification) {
		const hex = this.getHex();
		if (hex !== null && !hex.isSpotted(engineContext.spotSide()))
			this.tempSpotted = false;
	}
}

//frees memory associated with this object if possible
Unit.prototype.cleanup = function() {
	//TODO can't delete units since some of them are linked in coreUnits for campaign players
}
