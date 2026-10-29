//The unit list's view model: the person's units on the map, a card each, as the original game's list shows them
//(updateEquipmentWindow, uiAddUnitBox in reference/src/ui.js): the sprite, the strength, the name and ordinal, whether
//it has moved or fired, and a warning for low fuel or ammo. From the core's World and nothing else
import type { UnitId, UnitState, World } from "../../core/types";
import { unitUsesAmmo, unitUsesFuel } from "../../core/units";
import { ammoOf, fuelOf, unitData } from "../../core/world";
import { unitClass } from "../../core/tables";
import type { SupplyState } from "../components/meter";
import { isYourTurn } from "../store/model";
import { ordinal } from "./unitcard";
import { supplyState } from "./unitinfo";

//The sprite for every ship larger than a submarine (UIBuilder.navalReplacementIcon, reference/src/uibuilder.js)
export const NAVAL_ICON = "resources/units/images/le211.png";

//The warning lines, as in uiAddUnitBox: under 5 fuel, under 2 ammo
const LOW_FUEL = 5, LOW_AMMO = 2;

export interface ListUnit {
	id: UnitId;
	name: string;
	sub: string; //"1st · moved"
	strength: number;
	sprite: string;
	fuel: SupplyState | null; //low on fuel: how low; null: enough, or none used
	ammo: SupplyState | null;
	moved: boolean;
	selected: boolean;
}

export interface UnitList {
	units: ListUnit[];
}

//The core units first, then by class, name and id (unitListSorter in reference/src/ui.js)
function byList(w: World) {
	return (a: UnitState, b: UnitState) => {
		if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
		const ea = unitData(w, a, true), eb = unitData(w, b, true);
		if (ea.uclass !== eb.uclass) return ea.uclass - eb.uclass;
		if (ea.name !== eb.name) return ea.name < eb.name ? -1 : 1;
		return a.id - b.id;
	};
}

export function listSprite(e: EquipmentEntry): string {
	return e.uclass > unitClass.submarine ? NAVAL_ICON : e.icon;
}

const warning = (low: boolean, value: number, max: number): SupplyState | null => low ? supplyState(value, max) : null;

function listUnit(w: World, u: UnitState, selected: UnitId | null): ListUnit {
	const own = unitData(w, u, true), now = unitData(w, u);
	const done = [u.hasMoved && "moved", u.hasFired && "fired"].filter(Boolean).join(" · ");
	const order = own.uclass === unitClass.fortification ? "" : ordinal(u.id);
	return {
		id: u.id, name: own.name, sub: [order, done].filter(Boolean).join(" · "), strength: u.strength,
		sprite: listSprite(own),
		fuel: warning(unitUsesFuel(w, u) && fuelOf(u) < LOW_FUEL, fuelOf(u), now.fuel),
		ammo: warning(unitUsesAmmo(w, u) && ammoOf(u) < LOW_AMMO, ammoOf(u), now.ammo),
		moved: u.hasMoved, selected: u.id === selected,
	};
}

/** The current player's units on the map, on a person's turn; none on a program's. */
export function unitListOf(w: World, selected: UnitId | null): UnitList {
	const p = w.state.turn.currentPlayer;
	const own = isYourTurn(w) ? w.state.units.filter((u) => u.row >= 0 && u.owner === p).sort(byList(w)) : [];
	const units = own.map((u) => listUnit(w, u, selected));
	return { units };
}
