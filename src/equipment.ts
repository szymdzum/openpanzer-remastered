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


//The index lists of a country file: equipment ids by unit class
export interface EquipmentIndexes {
	unitclass?: { [uclass: string]: number[] };
}

//A country equipment file as loaded, the units are value arrays in the parsehints order
export interface EquipmentCountryFile {
	indexes: EquipmentIndexes;
	parsehints: (keyof EquipmentEntry)[];
	units: { [eqid: string]: (number | string)[] };
}

//What addPlayersEquipment reads of a player (a Player, or the player data of a saved game)
export interface EquipmentPlayerCountries {
	country: number;
	supportCountries: number[];
}

export interface EquipmentModule {
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
	addUnitsEquipment(eqids: number[], callback: () => void): void;
	parseCountryEquipment(country: number, e: EquipmentCountryFile, lists?: boolean): boolean;
	getCountryEquipmentByClass(uclass: number, country: number, sortkey?: keyof EquipmentEntry, reverse?: boolean): number[];
	isPurchasable(eqid: number): boolean;
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

//The bit masks of the attr field, only the ones used here (see the 2.9 source for the full list)
const PURCHASABLE_MASK		= 1 << 18;

Equipment.getCountryName = function(country: number) {
	return Equipment.countryNames[Equipment.name][country];
}

Equipment.getCountryNameByEqp = function(country: number, eqpName: string) {
	return Equipment.countryNames[eqpName][country];
}

Equipment.resetEquipment = function() {
	Equipment.equipment = {};
	Equipment.equipmentIndexes = {};
	Equipment.equipmentToLoadSet = {};
	Equipment.equipmentToLoad = 0;
}

//Loads the equipment of the players countries and of their supporting countries
//callback is called after each country file finished loading (see Equipment.equipmentToLoad)
Equipment.addPlayersEquipment = function(players: EquipmentPlayerCountries[], callback: () => void) {
	Equipment.resetEquipment();
	Equipment.equipmentToLoadSet[-1] = true; //country file 0, the generic equipment
	for (let i = 0; i < players.length; i++) {
		const p = players[i];
		Equipment.equipmentToLoadSet[p.country] = true;
		for (let j = 0; j < p.supportCountries.length; j++) {
			const c = p.supportCountries[j];
			if (c > 0)
				Equipment.equipmentToLoadSet[c - 1] = true; //For supporting countries number is correctly saved in scenario
		}
	}
	Equipment.equipmentToLoad = Object.keys(Equipment.equipmentToLoadSet).length;
	for (const country in Equipment.equipmentToLoadSet)
		Equipment.addCountryEquipment(+country, callback);
}

Equipment.addCountryEquipment = function(country: number, callback: () => void) {
	loadEquipment(country + 1, callback); //TODO fix indexes
}

//Loads the country files of the set that have the equipment ids given not loaded yet, for the units alone
//(#286): a scenario's units aren't all of its players' countries', and a unit whose equipment wasn't
//loaded became the first one loaded (a Light Cruiser in eqp-pacific). Their lists by unit class aren't
//the game's: what can be bought stays the players' countries'. The other files load and are dropped.
//callback is called once, after the last file; at once when every id is loaded
Equipment.addUnitsEquipment = function(eqids: number[], callback: () => void) {
	const missing = eqids.filter((id) => typeof Equipment.equipment[id] === "undefined");
	const files: number[] = [];
	for (let file = 0; file <= Equipment.countryNames[Equipment.name].length; file++)
		if (typeof Equipment.equipmentIndexes[file] === "undefined") files.push(file);
	if (!missing.length || !files.length)
		return callback();
	let toLoad = files.length;
	for (const file of files)
		requestEquipment(file, function(e: EquipmentCountryFile | null) {
			if (e !== null && missing.some((id) => e.units.hasOwnProperty(id)))
				Equipment.parseCountryEquipment(file, e, false);
			if (--toLoad === 0)
				callback();
		});
}

//lists: false for a file loaded for its units alone (addUnitsEquipment)
Equipment.parseCountryEquipment = function(country: number, e: EquipmentCountryFile, lists = true) {
	if (lists)
		Equipment.equipmentIndexes[country] = e.indexes;
	for (const u in e.units) {
		//TODO Without this defined the retained size of each object is much bigger
		//See: https://code.google.com/p/v8/issues/detail?id=2547
		//A placeholder of zeros (also for the string fields, and without embark), filled below
		Equipment.equipment[u] = { gunrange:0, icon:0, yearexpired:0, cost:0, initiative:0, spotrange:0,
			hardatk:0, softatk:0, uclass:0, airdef:0, fuel:0, airseaweight:0, rangedefmod:0,
			airatk:0, groundweight:0, movmethod:0, navalatk:0, movpoints:0, grounddef:0, target:0,
			yearavailable:0, name:0, country:0, closedef:0, ammo:0, attr:0 } as unknown as EquipmentEntry;

		(Equipment.equipment[u] as { __proto__?: object | null }).__proto__ = null;

		for(let h = 0; h < e.parsehints.length; h++)
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
//the unitclass key leaves the empty list, a class missing from it leaves undefined and sorting it throws)
//Sorted, it is a copy: the index lists' order is the game's (what the AI buys, a unit's first
//transport, #186). Unsorted, the index list itself
Equipment.getCountryEquipmentByClass = function(uclass: number, country: number, sortkey?: keyof EquipmentEntry, reverse?: boolean) {
	let eqList: number[] = [];

	if (typeof Equipment.equipmentIndexes[country] !== "undefined") {
		if (Equipment.equipmentIndexes[country].hasOwnProperty("unitclass"))
			eqList = Equipment.equipmentIndexes[country]["unitclass"][uclass];

		if (sortkey)
			eqList = eqList.slice().sort(keySort(sortkey, reverse));
	}

	return eqList;
}

//Whether the equipment eqid has an attribute bit, false for an unknown eqid
function hasAttr(eqid: number, mask: number): boolean {
	return typeof Equipment.equipment[eqid] !== "undefined" && (Equipment.equipment[eqid].attr & mask) != 0;
}

Equipment.isPurchasable = function(eqid: number) {
	return hasAttr(eqid, PURCHASABLE_MASK);
}


//Loads a country equipment file from the current equipment set, callback is called after
//the request finished, also when it failed
function loadEquipment(country: number, callback: () => void): void {
	requestEquipment(country, function(e: EquipmentCountryFile | null) {
		if (e !== null)
			Equipment.parseCountryEquipment(country, e);
		callback();
	});
}

//Requests a country equipment file of the current equipment set: onDone gets it, null when it failed
function requestEquipment(country: number, onDone: (e: EquipmentCountryFile | null) => void): void {
	const jsonFile = Equipment.equipmentPath + Equipment.name + "/" + (Equipment.filePrefix + country + ".json");
	const req = new XMLHttpRequest();

	req.onload = function() {
		if (req.readyState === 4)
			onDone(req.status === 200 || req.status === 0 ? JSON.parse(req.responseText) as EquipmentCountryFile : null);
	}
	req.open("GET", jsonFile, true);
	req.send(null);
}

function keySort(key: keyof EquipmentEntry, reverse: boolean) {
	let order = 1; //ascending
	if (reverse) order = -1; //descending

	return function(a: number, b: number) {
		if (Equipment.equipment[a][key] < Equipment.equipment[b][key]) return -1 * order;
		if (Equipment.equipment[a][key] > Equipment.equipment[b][key]) return +1 * order;

		return (a - b) * order; //if equal sort by id to have a stable sort
	}
}
//------------------------ MODULE END ----------------------
return Equipment; }(Equipment || {} as EquipmentModule)); //Module end
