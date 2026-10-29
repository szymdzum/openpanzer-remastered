/**
 * ScenarioFile - a scenario XML file (resources/scenarios/data/) as plain data, read as ScenarioLoader reads it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Only the reading, from a parsed document (the caller parses: DOMParser in the page and in the tests): what the
 * numbers mean, and what a value missing or out of range does, is newGame's. A number attribute reads as
 * ScenarioLoader's +attribute does (missing: 0); an optional one is null when missing, where the loader keeps its
 * default.

 */

import type { FileHex, FilePlayer, FileReinforcement, FileUnit, ScenarioFile } from "./newgame";

function num
(e: Element, name: string): number {
	return +e.getAttribute(name);
}

function optional(e: Element, name: string): number | null {
	const v = e.getAttribute(name);
	return v === null ? null : +v;
}

//"1, 2, 3": the numbers of a list attribute
function list(e: Element, name: string): number[] {
	return e.getAttribute(name).split(", ").map((v) => +v);
}

const children = (e: Element, name: string) => Array.from(e.childNodes).filter((n) => n.nodeName === name) as Element[];

function unit(e: Element): FileUnit {
	return { eqid: num(e, "id"), owner: num(e, "owner"), facing: optional(e, "face"), flag: optional(e, "flag"),
		transport: optional(e, "transport"), carrier: optional(e, "carrier"), experience: optional(e, "exp"),
		entrenchment: optional(e, "ent"), strength: optional(e, "str"), leader: e.getAttribute("ldr") !== null };
}

function player(e: Element): FilePlayer {
	return { id: num(e, "id"), side: num(e, "side"), country: num(e, "country"), airTransports: num(e, "airtrans"),
		navalTransports: num(e, "navaltrans"), prestigePerTurn: list(e, "turnprestige"), support: list(e, "support") };
}

//The reinforcements in the file's order: each turn's places, each place's units
function reinforcements(doc: Document): FileReinforcement[] {
	const found: FileReinforcement[] = [];
	for (const r of Array.from(doc.getElementsByTagName("reinforce")))
		for (const at of children(r, "at"))
			for (const u of children(at, "unit"))
				found.push({ turn: num(r, "turn"), row: num(at, "row"), col: num(at, "col"), unit: unit(u) });
	return found;
}

function hex(e: Element): FileHex {
	return { row: num(e, "row"), col: num(e, "col"), terrain: optional(e, "terrain"), road: optional(e, "road"),
		name: e.getAttribute("name"), flag: optional(e, "flag"), owner: optional(e, "owner"), victory: optional(e, "victory"),
		deploy: optional(e, "deploy"), supply: optional(e, "supply"), units: children(e, "unit").map(unit) };
}

//The scenario of an XML document, null when it has no map header (the loader fails then)
export function readScenarioFile(doc: Document): ScenarioFile | null {
	const map = doc.getElementsByTagName("map")[0];
	if (!map) return null;
	return {
		rows: num(map, "rows"), cols: num(map, "cols"), equipment: map.getAttribute("eqp"), turns: list(map, "turns"),
		date: map.getAttribute("date"), atmospheric: num(map, "atmosferic"), latitude: num(map, "latitude"),
		ground: num(map, "ground"), dayTurns: num(map, "dayturns"), image: map.getAttribute("image"),
		players: Array.from(doc.getElementsByTagName("player")).map(player),
		reinforcements: reinforcements(doc),
		hexes: Array.from(doc.getElementsByTagName("hex")).map(hex),
	};
}
