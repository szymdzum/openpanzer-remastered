/**
 * Equipment - handles unit equipment
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2013 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import { unitClass, unitType } from "./prototypes";
import { defined } from "./util";

//The index lists of a country file: equipment ids by unit class
export interface EquipmentIndexes
{
	unitclass?: { [uclass: string]: number[] };
}

//A country equipment file as loaded, the units are value arrays in the parsehints order
export interface EquipmentCountryFile
{
	indexes: EquipmentIndexes;
	parsehints: (keyof EquipmentEntry)[];
	units: { [eqid: string]: (number | string)[] };
}

//What addPlayersEquipment reads of a player (a Player, or the player data of a saved game)
export interface EquipmentPlayerCountries
{
	country: number;
	supportCountries: number[];
}

export interface EquipmentModule
{
	equipment: { [eqid: string]: EquipmentEntry };
	equipmentIndexes: { [country: string]: EquipmentIndexes };
	equipmentPath: string;
	filePrefix: string;
	defaultName: string;
	name: string;
	equipmentToLoadSet: { [country: string]: boolean };
	equipmentToLoad: number;
	countryNames: { [eqpName: string]: string[] };
	getCountryName(country: number): string;
	getCountryNameByEqp(country: number, eqpName: string): string;
	resetEquipment(): void;
	addPlayersEquipment(players: EquipmentPlayerCountries[], callback: () => void): void;
	addCountryEquipment(country: number, callback: () => void): void;
	parseCountryEquipment(country: number, e: EquipmentCountryFile): boolean;
	getCountryEquipmentByClass(uclass: number, country: number, sortkey?: keyof EquipmentEntry, reverse?: boolean): number[];
	getCountryEquipmentByYearRange(startYear: number, endYear: number, country: number): number[];
	addUnitsToEquipment(countryUnitHash: unknown): void;
	isBridge(eqid: number): boolean;
	ignoresEntrenchment(eqid: number): boolean;
	isPurchasable(eqid: number): boolean;
	canInitiateAttackOnUnitType(eqid: number, targetEqid: number): boolean;
}

export var Equipment: EquipmentModule = (function(Equipment: EquipmentModule) { //Module start

Equipment.equipment = {};
Equipment.equipmentIndexes = {};
Equipment.equipmentPath = "resources/equipment/";
Equipment.filePrefix = "equipment-country-";
Equipment.defaultName = "eqp-adlerkorps"; //equipment set, a folder under equipmentPath
Equipment.name = Equipment.defaultName;
Equipment.equipmentToLoadSet = {}; //country file indexes still to load, as keys
Equipment.equipmentToLoad = 0; //number of country files not yet loaded
Equipment.countryNames = {
	"eqp-adlerkorps": ["Slovakia", "Belgium", "Bulgaria", "Czechoslovakia", "Denmark", "Finland",
		"France", "Germany", "Greece", "USA", "Hungary", "Turkey", "Italy", "Netherlands", "Norway",
		"Poland", "Portugal", "Romania", "Croatia", "Russia", "Sweden", "Allied Yugoslavia",
		"United Kingdom", "Yugoslavia", "Nationalist Spain", "Republican Spain", "Australia", "Canada",
		"Ethiopia", "New Zealand", "South Africa"],
	"eqp-pacific": ["New Zealand", "Panzerzug", "India", "Australia", "Hungary", "Japan", "France",
		"Germany", "Bulgaria", "U.S. Army", "Canada", "Turkey", "Italy", "Romania", "Thailand",
		"Nationalist Chinese", "Philippines", "Netherlands", "Afrika Korps", "Russia", "Poland",
		"Communist Chinese", "United Kingdom", "Mongolia", "Manchukuo", "U.S. Marines", "Republican",
		"Allied Forces", "Captured Equipment", "Axis Forces", "Arab Countries"]
};

//The equipment files are always loaded asynchronously, the synchronous path in loadEquipment is dead code
var asyncLoad = true;

//The bit masks of the attr field, only the ones used here (see the 2.9 source for the full list)
var IGNORE_ENTRENCH_MASK 	= 1 << 2; //bit 3 (skip 2 is unknown)
var BRIDGE_MASK				= 1 << 3; //bit 4
var START_SOFT_ATTACK_MASK	= 1 << 4;
var START_HARD_ATTACK_MASK	= 1 << 5;
var START_AIR_ATTACK_MASK	= 1 << 6;
var ATTACK_AIR_MASK			= 1 << 15;
var PURCHASABLE_MASK		= 1 << 18;

Equipment.getCountryName = function(country: number)
{
	return Equipment.countryNames[Equipment.name][country];
}

Equipment.getCountryNameByEqp = function(country: number, eqpName: string)
{
	return Equipment.countryNames[eqpName][country];
}

Equipment.resetEquipment = function()
{
	Equipment.equipment = {};
	Equipment.equipmentIndexes = {};
	Equipment.equipmentToLoadSet = {};
	Equipment.equipmentToLoad = 0;
}

//Loads the equipment of the players countries and of their supporting countries
//callback is called after each country file finished loading (see Equipment.equipmentToLoad)
Equipment.addPlayersEquipment = function(players: EquipmentPlayerCountries[], callback: () => void)
{
	Equipment.resetEquipment();
	Equipment.equipmentToLoadSet[-1] = true; //country file 0, the generic equipment
	for (var i = 0; i < players.length; i++)
	{
		var p = players[i];
		Equipment.equipmentToLoadSet[p.country] = true;
		for (var j = 0; j < p.supportCountries.length; j++)
		{
			var c = p.supportCountries[j];
			if (c > 0)
				Equipment.equipmentToLoadSet[c - 1] = true; //For supporting countries number is correctly saved in scenario
		}
	}
	Equipment.equipmentToLoad = Object.keys(Equipment.equipmentToLoadSet).length;
	for (var country in Equipment.equipmentToLoadSet)
		Equipment.addCountryEquipment(+country, callback);
}

Equipment.addCountryEquipment = function(country: number, callback: () => void)
{
	loadEquipment(country + 1, callback); //TODO fix indexes
}

Equipment.parseCountryEquipment = function(country: number, e: EquipmentCountryFile)
{
	Equipment.equipmentIndexes[country] = e.indexes;
	for (var u in e.units)
	{
		//TODO Without this defined the retained size of each object is much bigger
		//See: https://code.google.com/p/v8/issues/detail?id=2547
		//A placeholder of zeros (also for the string fields, and without embark), filled below
		Equipment.equipment[u] = { gunrange:0, icon:0, yearexpired:0, cost:0, initiative:0, spotrange:0,
			hardatk:0, softatk:0, uclass:0, airdef:0, fuel:0, airseaweight:0, rangedefmod:0,
			airatk:0, groundweight:0, movmethod:0, navalatk:0, movpoints:0, grounddef:0, target:0,
			yearavailable:0, name:0, country:0, closedef:0, ammo:0, attr:0 } as unknown as EquipmentEntry;

		(Equipment.equipment[u] as { __proto__?: object | null }).__proto__ = null;

		for(var h = 0; h < e.parsehints.length; h++)
			(Equipment.equipment[u] as unknown as { [field: string]: number | string })[e.parsehints[h]] = e.units[u][h];

		//TODO freeze object foreach Object.freeze(Equipment.equipment[u]) to prevent modifications
	}

	delete e.parsehints;
	delete e.indexes;
	delete e.units;

	return true;
}

//Selects equipment by unitclass and country sorting it by sortkey
//(getCountryEquipmentByKey of 2.9 inlined, without the early return: an index without
//the unitclass key leaves the empty list, a class missing from it leaves undefined and sort throws)
//The sort is done in place on the index list
Equipment.getCountryEquipmentByClass = function(uclass: number, country: number, sortkey?: keyof EquipmentEntry, reverse?: boolean)
{
	var eqList: number[] = [];

	if (typeof Equipment.equipmentIndexes[country] !== "undefined")
	{
		if (Equipment.equipmentIndexes[country].hasOwnProperty("unitclass"))
			eqList = Equipment.equipmentIndexes[country]["unitclass"][uclass];

		if (sortkey)
			eqList.sort(keySort(sortkey, reverse));
	}

	return eqList;
}

Equipment.getCountryEquipmentByYearRange = function(startYear: number, endYear: number, country: number)
{
	var eqList: number[] = [];
	var u: EquipmentEntry, id: any = 0; //id is the for...in key, a string

	if (typeof Equipment.equipmentIndexes[country] === "undefined") //TODO send load request ?
		return eqList;

	for (id in Equipment.equipment)
	{
		u = Equipment.equipment[id];
		if (u.country == country && u.yearavailable >= startYear && u.yearavailable <= endYear)
		{
			eqList.push(+id); //make it integer
		}
	}

	return eqList;
}

//TODO for the case where a campaign player buys units from a supporting country in a scenario
Equipment.addUnitsToEquipment = function(countryUnitHash: unknown)
{

}

Equipment.isBridge = function(eqid: number)
{
	if (typeof Equipment.equipment[eqid] === "undefined")
		return false;

	if ((Equipment.equipment[eqid].attr & BRIDGE_MASK) != 0)
		return true;

	return false;
}

Equipment.ignoresEntrenchment = function(eqid: number)
{
	if (typeof Equipment.equipment[eqid] === "undefined")
		return false;

	if ((Equipment.equipment[eqid].attr & IGNORE_ENTRENCH_MASK) != 0)
		return true;

	return false;
}

Equipment.isPurchasable = function(eqid: number)
{
	if (typeof Equipment.equipment[eqid] === "undefined")
		return false;

	if ((Equipment.equipment[eqid].attr & PURCHASABLE_MASK) != 0)
		return true;

	return false;
}

//Can a unit of type eqid start an attack on a unit of type targetEqid
Equipment.canInitiateAttackOnUnitType = function(eqid: number, targetEqid: number)
{
	if (!defined(Equipment.equipment[eqid]) || !defined(Equipment.equipment[targetEqid]))
		return false;

	var uclass = Equipment.equipment[eqid].uclass;
	var targetType = Equipment.equipment[targetEqid].target;

	//Only destroyers and tactical bombers can attack submarines
	if (Equipment.equipment[targetEqid].uclass == unitClass.submarine
		&& uclass != unitClass.destroyer && uclass != unitClass.tacticalBomber)
		return false;

	if ((targetType == unitType.soft) && (Equipment.equipment[eqid].attr & START_SOFT_ATTACK_MASK) != 0)
		return false;

	if ((targetType == unitType.hard) && (Equipment.equipment[eqid].attr & START_HARD_ATTACK_MASK) != 0)
		return false;

	//Air targets: units with the start air attack flag can't, and neither can the classes not
	//listed here unless they have the attack air flag
	if ((targetType == unitType.air)
		&& ((Equipment.equipment[eqid].attr & START_AIR_ATTACK_MASK) != 0
			|| (uclass != unitClass.airDefence && uclass != unitClass.fighter
				&& uclass != unitClass.levelBomber && uclass != unitClass.tacticalBomber
				&& uclass != unitClass.battleship && uclass != unitClass.battleCruiser
				&& uclass != unitClass.lightCruiser && uclass != unitClass.airTransport
				&& (Equipment.equipment[eqid].attr & ATTACK_AIR_MASK) == 0)))
		return false;

	//Return true if can initiate attack or targetType is unitType.sea
	return true;
}

//Loads a country equipment file from the current equipment set, callback is called after
//the request finished, also when it failed
function loadEquipment(country: number, callback: () => void): boolean
{
	var jsonFile = Equipment.equipmentPath + Equipment.name + "/" + (Equipment.filePrefix + country + ".json");
	var req = new XMLHttpRequest();

	if (asyncLoad)
	{
		req.onload = function()
		{
			if (req.readyState === 4)
			{
				if (req.status === 200 || req.status === 0)
					Equipment.parseCountryEquipment(country, JSON.parse(req.responseText));
				callback();
			}
		}
	}
	req.open("GET", jsonFile, asyncLoad);
	req.send(null);
	if (!asyncLoad && req.responseText !== null)
		return Equipment.parseCountryEquipment(country, JSON.parse(req.responseText));
}

function keySort(key: keyof EquipmentEntry, reverse: boolean)
{
	var order = 1; //ascending
	if (reverse) order = -1; //descending

	return function(a: number, b: number) {
		if (Equipment.equipment[a][key] < Equipment.equipment[b][key]) return -1 * order;
		if (Equipment.equipment[a][key] > Equipment.equipment[b][key]) return +1 * order;

		return (a - b) * order; //if equal sort by id to have a stable sort
	}
}
//------------------------ MODULE END ----------------------
return Equipment; }(Equipment || {} as EquipmentModule)); //Module end
