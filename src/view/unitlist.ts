//The unit list's view model (UnitList, #348): the person's units on the map as the old unit list showed them
//(updateEquipmentWindow's #unitlist, uiAddUnitBox), a card each: the sprite (a generic one for the larger ships), the
//strength, the name and ordinal, whether it has moved or fired, and a warning for low fuel or ammo; the core units
//first, then by class, name and id (unitListSorter). From the core's World and nothing else
import type { UnitId, UnitState, World } from "../core/types";
import { unitUsesAmmo, unitUsesFuel } from "../core/units";
import { ammoOf, fuelOf, unitData } from "../core/world";
import { unitClass } from "../prototypes";
import type { SupplyState } from "./meter";
import { isYourTurn } from "./model";
import { ordinal } from "./unitcard";
import { supplyState } from "./unitinfo";

//The sprite the old list showed for every ship larger than a submarine (UIBuilder.navalReplacementIcon)
export const NAVAL_ICON = "resources/units/images/le211.png";

//The old list's warning lines: under 5 fuel, under 2 ammo
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
	moved: number;
	low: number; //low on fuel or ammo
}

//The core units first, then by class, name and id (the old list's order)
function byList(w: World) {
	return (a: UnitState, b: UnitState) => {
		if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
		const ea = unitData(w, a, true), eb = unitData(w, b, true);
		if (ea.uclass !== eb.uclass) return ea.uclass - eb.uclass;
		if (ea.name !== eb.name) return ea.name < eb.name ? -1 : 1;
		return a.id - b.id;
	};
}

//The sprite a list shows of an entry: its own, a generic one for the larger ships
export function listSprite(e: EquipmentEntry): string {
	return e.uclass > unitClass.submarine ? NAVAL_ICON : e.icon as unknown as string;
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

//The current player's units on the map, on a person's turn; none on a program's (the old list showed only theirs)
export function unitListOf(w: World, selected: UnitId | null): UnitList {
	const p = w.state.turn.currentPlayer;
	const own = isYourTurn(w) ? w.state.units.filter((u) => u.row >= 0 && u.owner === p).sort(byList(w)) : [];
	const units = own.map((u) => listUnit(w, u, selected));
	return { units, moved: units.filter((u) => u.moved).length, low: units.filter((u) => u.fuel !== null || u.ammo !== null).length };
}
