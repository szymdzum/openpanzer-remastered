//What the unit card (UnitInfo, src/view/unitcard.ts) words a unit's supply and leaders with: a gauge's state, the
//leaders as the game describes them. From the core's World and nothing else
import type { World } from "../core/types";
import { leaderDescriptions } from "../prototypes";
import type { SupplyState } from "./meter";

//A leader as the tooltip words it (Leaders.description); classLeader: the one every unit of its class with a leader has
export interface LeaderLine {
	name: string;
	description: string;
	classLeader: boolean;
}

//The Meter card's states: below half low, below a quarter critical
export function supplyState(value: number, max: number): SupplyState {
	const share = max > 0 ? value / max : 1;
	return share < 0.25 ? "critical" : share < 0.5 ? "low" : "ok";
}

//The unit's leaders, its own and its class's (hasLeader, src/core/units.ts), as the game words them
export function leadersOf(w: World, leader: number, uclass: number): LeaderLine[] {
	if (leader === -1) return [];
	const line = (l: number, classLeader: boolean) => ({ name: leaderDescriptions[l][0], description: leaderDescriptions[l][1], classLeader });
	const cls = w.rules.classLeaders[uclass];
	return cls === -1 || cls === leader ? [line(leader, cls === leader)] : [line(leader, false), line(cls, true)];
}
