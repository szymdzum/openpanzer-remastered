//The game's GameRules (src/legacy/gamerules.ts rulesOn) over the world of a restored state as the gamerules
//contract plays it (test/core-contract.test.ts): toData of the objects as they are at the call, with
//the hexes' counters as its sight. The contract's fuzz changes units under counters that stay, and
//its map snapshot reads the counters setZOCRange and setSpotRange switch: the game's own world
//computes its sight from the units (D10), which equals the counters on the restored states
import type { GameRulesModule, rulesOn } from "../src/legacy/gamerules";
import type { Scenario } from "../src/legacy/scenario";
import type { EquipmentModule } from "../src/legacy/equipment";
import type { Transport, Unit } from "../src/legacy/unit";
import type { RngStream } from "../src/core/random";
import type { toData as ToData } from "../src/legacy/state";
import { createWorld } from "../src/core/create";
import { emptySight, unitById } from "../src/core/world";
import type { Sight, UnitState, World } from "../src/core/types";

//The modules of the restored game (the contracts reset the modules per fixture: the rules read the
//equipment of their own)
export interface RestoredGame {
	rulesOn: typeof rulesOn;
	scenario: Scenario;
	Equipment: EquipmentModule;
	toData: typeof ToData;
	game: RngStream; //Rng.game: the dice draw from the game's own stream
}

//The spotting and zone of control the hexes' counters say (whether each is above 0), for the
//queries: the contract's fuzz changes units under counters that stay
export function oldSight(scenario: Scenario): Sight {
	const m = scenario.map;
	const sight = emptySight(m.rows * m.cols);
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c], i = r * m.cols + c;
			for (const side of [0, 1]) {
				sight.spot[side][i] = +h.isSpotted(side);
				sight.zoc[side][i] = +h.isZOC(side);
			}
		}
	return sight;
}

//The fields of a unit a query reads, besides its hex and transport
const unitFields = ["eqid", "owner", "strength", "leader", "experience", "entrenchment", "hits", "ammo", "fuel", "facing",
	"moveLeft", "carrier", "isSurprised", "hasMoved", "hasFired", "hasResupplied", "hasOverstrength", "tempSpotted", "isMounted"] as const;

//Whether the world's unit is still the object's
function same(u: Unit, s: UnitState, destroyed: boolean): boolean {
	const p = u.getPos() || { row: -1, col: -1 };
	return p.row === s.row && p.col === s.col && !!u.destroyed === destroyed && unitFields.every((k) => u[k] === s[k])
		&& sameTransport(u.transport, s.transport);
}

function sameTransport(t: Transport | null, s: UnitState["transport"]): boolean {
	if (t === null || s === null) return t === s;
	return t.eqid === s.eqid && t.ammo === s.ammo && t.fuel === s.fuel;
}

export function coreGameRules(old: RestoredGame): GameRulesModule {
	const m = old.scenario.map;
	let world: World | null = null, countersChanged = false;

	//The world of the state now: its sight read again after the counters changed (setZOCRange,
	//setSpotRange), all of it taken again when one of the units a call asks about isn't what the
	//world has: the contract changes the units only between its rounds, all of them (its fuzz)
	function w(...asked: Unit[]): World {
		if (world !== null && countersChanged) world = { ...world, sight: oldSight(old.scenario) };
		countersChanged = false;
		if (world !== null && asked.every((u) => {
			const s = unitById(world, u.id);
			return s === null || same(u, s, world.destroyed.has(u.id));
		}))
			return world;
		const destroyed = new Set(m.getUnits().filter((u) => u.destroyed).map((u) => u.id));
		world = createWorld(old.toData(old.scenario), old.Equipment.equipment, { destroyed, sight: oldSight(old.scenario) });
		return world;
	}
	return old.rulesOn({ world: w, game: () => old.game, countersChanged: () => { countersChanged = true; } });
}
