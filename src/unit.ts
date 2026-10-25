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

import type { Cell } from "./prototypes";
import { touched } from "./context";
import { Equipment } from "./equipment";
import { defined } from "./util";
import type { Hex, Player } from "./map";

//An equipment id the equipment list knows, else its first key (a string key, kept)
function knownEqid(eqid: number): number {
	if (typeof Equipment.equipment[eqid] === "undefined")
		return Object.keys(Equipment.equipment)[0] as unknown as number;
	return eqid;
}

//Transport Object Constructor
//A class so other modules can type `new Transport(...)`. Fields are `declare`d (they emit nothing),
//the methods stay assigned to the prototype (enumerable, as the original), typed by the interface below
export class Transport {
	declare eqid: number;
	declare ammo: number;
	declare fuel: number;
	declare icon: string;

	constructor(equipmentID: number) {
		this.eqid = knownEqid(equipmentID);
		this.ammo = Equipment.equipment[this.eqid].ammo;
		this.fuel = Equipment.equipment[this.eqid].fuel;
		this.icon = Equipment.equipment[this.eqid].icon; //This is only used when building image cache list in map.js
	}
}

export interface Transport {
	copy(t: Transport | null): void;
	unitData(): EquipmentEntry;
}

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
		this.eqid = knownEqid(equipmentID);
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
			touched();
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
	getEqid(forceUnit?: boolean): number;
	unitData(forceUnit?: boolean): EquipmentEntry;
	getMovesLeft(): number;
	getAmmo(): number;
	getFuel(): number;
	getIcon(): string;
	cleanup(): void;
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

Unit.prototype.getIcon = function(): string { return this.unitData().icon; }

//frees memory associated with this object if possible
Unit.prototype.cleanup = function() {
	//TODO can't delete units since some of them are linked in coreUnits for campaign players
}
