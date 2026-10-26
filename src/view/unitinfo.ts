//The unit info panel's view model (UnitInfo, #346): the selected unit's identity, its supply meters and its stat
//sheet, from the core's World and nothing else. The unit is always read by its id from the world, never copied, so
//what the panel shows and what the commands name is the same unit (#404: the old UI's transport view showed a copy)
import { unitAttackRange } from "../core/attack";
import { leaderMoves } from "../core/movement";
import { unitSpotRange } from "../core/sight";
import type { UnitId, World } from "../core/types";
import { unitUsesAmmo, unitUsesFuel } from "../core/units";
import { ammoOf, fuelOf, hexIndex, unitData } from "../core/world";
import { leaderDescriptions, terrainEntrenchment, unitClassNames } from "../prototypes";
import type { IconName, Nation } from "./icon";
import type { SupplyState } from "./meter";
import { countryName, nationOf, shownUnit } from "./model";

//A supply meter: what it measures, "18/50", how full, and its state (none for entrenchment, or a unit that has none)
export interface Gauge {
	icon: IconName;
	label: string;
	value: string;
	fill: number;
	state?: SupplyState;
}

//A leader as the tooltip words it (Leaders.description); classLeader: the one every unit of its class with a leader has
export interface LeaderLine {
	name: string;
	description: string;
	classLeader: boolean;
}

export interface UnitInfo {
	id: UnitId;
	name: string; //the unit's own, also while it rides its transport
	nation: Nation | null;
	line: string; //"Tank · Core", and what carries it
	side: number;
	stars: number; //one per 100 XP, five at most
	leaders: LeaderLine[]; //its own first, then its class's; none: "No leader yet"
	meters: Gauge[];
	stats: { name: string; value: number }[];
}

//The Meter card's states: below half low, below a quarter critical
export function supplyState(value: number, max: number): SupplyState {
	const share = max > 0 ? value / max : 1;
	return share < 0.25 ? "critical" : share < 0.5 ? "low" : "ok";
}

//A meter of something the unit has (value of max), or a dash for what it doesn't use
function gauge(icon: IconName, label: string, value: number, max: number, used: boolean): Gauge {
	if (!used) return { icon, label, value: "–", fill: 0 };
	return { icon, label, value: value + "/" + max, fill: Math.min(1, value / max), state: supplyState(value, max) };
}

//The unit's leaders, its own and its class's (hasLeader, src/core/units.ts), as the game words them
export function leadersOf(w: World, leader: number, uclass: number): LeaderLine[] {
	if (leader === -1) return [];
	const line = (l: number, classLeader: boolean) => ({ name: leaderDescriptions[l][0], description: leaderDescriptions[l][1], classLeader });
	const cls = w.rules.classLeaders[uclass];
	return cls === -1 || cls === leader ? [line(leader, cls === leader)] : [line(leader, false), line(cls, true)];
}

export function unitInfoOf(w: World, id: UnitId): UnitInfo | null {
	const u = shownUnit(w, id);
	if (u === null) return null;
	const e = unitData(w, u), own = unitData(w, u, true);
	const carried = e !== own ? " · in " + e.name : "";
	const dug = terrainEntrenchment[w.data.hexes[hexIndex(w, u.row, u.col)].terrain] + 5;
	return {
		id, name: own.name, nation: nationOf(countryName(w, u.flag - 1)), side: w.state.players[u.owner].side,
		line: unitClassNames[own.uclass] + " · " + (u.isCore ? "Core" : "Auxiliary") + carried,
		stars: Math.min(5, Math.floor(u.experience / 100)), leaders: leadersOf(w, u.leader, e.uclass),
		meters: [
			gauge("strength", "Strength", u.strength, 10, true),
			gauge("fuel", "Fuel", fuelOf(u), e.fuel, unitUsesFuel(w, u)),
			gauge("ammo", "Ammo", ammoOf(u), e.ammo, unitUsesAmmo(w, u)),
			{ icon: "entrench", label: "Entrench", value: String(u.entrenchment), fill: Math.min(1, u.entrenchment / dug) },
		],
		stats: [
			{ name: "Soft atk", value: e.softatk }, { name: "Hard atk", value: e.hardatk }, { name: "Air atk", value: e.airatk },
			{ name: "Naval atk", value: e.navalatk }, { name: "Gnd def", value: e.grounddef }, { name: "Air def", value: e.airdef },
			{ name: "Close def", value: e.closedef }, { name: "Initiative", value: e.initiative }, { name: "Range", value: unitAttackRange(w, u) },
			{ name: "Spotting", value: unitSpotRange(w, u) }, { name: "Move", value: e.movpoints + leaderMoves(w, u) },
			{ name: "Exp", value: u.experience },
		],
	};
}
