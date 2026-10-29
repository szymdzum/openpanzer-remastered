//The unit context menu's view model (UnitContext, #437): the actions the person's selected unit can take now, as the old
//UI's #unit-context listed them (updateUnitContextWindow, src/ui.ts:742): by the same rules, in its order, an action it
//can't take left out. What each gives, computed with the functions the command runs (src/core/supply.ts,
//src/core/costs.ts), is its tooltip. Plain TypeScript tested on hand-built worlds (test/view-context.test.tsx)
import type { Command } from "../core/command";
import { costPerStrength } from "../core/costs";
import { canDisembark, canEmbark, embarkTypeOf } from "../core/movement";
import { canReinforce, canResupply, reinforcement, resupplyValue } from "../core/supply";
import type { Supply, UnitId, UnitState, World } from "../core/types";
import { canMount } from "../core/units";
import { playerOf, unitById } from "../core/world";
import { unitClass } from "../core/tables";
import type { IconName } from "./icon";
import { type ActionKey, canOrder, prestigeText } from "./model";

export interface ContextAction {
	key: ActionKey;
	label: string;
	icon: IconName;
	command: Command;
	tip: string; //its tooltip and accessible name: what it is, then what it gives, "Supply: +5 ammo, +14 fuel"
}

export interface UnitContext {
	unit: UnitId;
	actions: ContextAction[];
}

//"+5 ammo, +14 fuel": a mounted unit's transport's share added in
function supplyText(s: Supply): string {
	const ammo = s.ammo + s.transportAmmo, fuel = s.fuel + s.transportFuel;
	return [ammo > 0 && "+" + ammo + " ammo", fuel > 0 && "+" + fuel + " fuel"].filter(Boolean).join(", ");
}

//An action with what it gives after its name, or its name alone when it gives nothing to tell
const action = (key: ActionKey, label: string, icon: IconName, command: Command, gives = ""): ContextAction =>
	({ key, label, icon, command, tip: gives === "" ? label : label + ": " + gives });

//Mount or Unmount, naming the transport
function mountAction(w: World, u: UnitState): ContextAction {
	const transport = w.equipment[u.transport!.eqid].name;
	return u.isMounted ? action("mount", "Unmount", "mount", { type: "unmount", unit: u.id }, "from " + transport)
		: action("mount", "Mount", "mount", { type: "mount", unit: u.id }, "on " + transport);
}

//The kind of transport a unit is aboard or would embark on: "air" or "naval"
function carrierKind(w: World, u: UnitState): "air" | "naval" {
	const uclass = u.carrier !== 0 ? w.equipment[Math.abs(u.carrier)].uclass : embarkTypeOf(w, u);
	return uclass === unitClass.airTransport ? "air" : "naval";
}

//Embark or Disembark, naming the kind of transport
function embarkAction(w: World, u: UnitState): ContextAction {
	const kind = carrierKind(w, u) + " transport";
	return u.carrier > 0 ? action("embark", "Disembark", "embark", { type: "disembark", unit: u.id }, kind)
		: action("embark", "Embark", "embark", { type: "embark", unit: u.id }, kind);
}

//Reinforce or Overstrength: the points the prestige buys and their price, "+1 of 2" when it pays for part of them
function reinforceAction(w: World, u: UnitState, over: boolean): ContextAction {
	const command: Command = over ? { type: "reinforce", unit: u.id, overstrength: true } : { type: "reinforce", unit: u.id };
	const plan = reinforcement(w, u, over);
	const points = plan.bought < plan.wanted ? `+${plan.bought} of ${plan.wanted}` : `+${plan.wanted}`;
	const gives = plan.bought < 1 ? "" : `${points} for ${prestigeText(plan.bought * plan.perPoint)} prestige`;
	return over ? action("overstrength", "Overstrength", "overstrength", command, gives) : action("reinforce", "Reinforce", "reinforce", command, gives);
}

//The undo, naming the hex the unit goes back to
function undoAction(w: World, u: UnitState): ContextAction {
	const before = w.state.turn.undoable!.before;
	return action("undo", "Undo move", "undo", { type: "undo", unit: u.id }, `back to ${before.row},${before.col}`);
}

//The menu of the person's unit on their turn, null for any other: Mount, Embark, Supply, Reinforce, Overstrength and
//Undo, each where the old menu showed it. Reinforce and Overstrength need the prestige for one point at the unit's
//price, as the old menu asked
export function contextOf(w: World, id: UnitId): UnitContext | null {
	const u = unitById(w, id);
	if (u === null || u.row < 0 || !canOrder(w, u)) return null;
	const affords = playerOf(w, u).prestige >= costPerStrength(w, u);
	const slot = w.state.turn.undoable;
	const actions: ContextAction[] = [];
	if (canMount(w, u)) actions.push(mountAction(w, u));
	if (canEmbark(w, u) || canDisembark(w, u)) actions.push(embarkAction(w, u));
	if (canResupply(w, u)) actions.push(action("resupply", "Supply", "resupply", { type: "resupply", unit: u.id }, supplyText(resupplyValue(w, u))));
	if (affords && canReinforce(w, u, false)) actions.push(reinforceAction(w, u, false));
	if (affords && canReinforce(w, u, true)) actions.push(reinforceAction(w, u, true));
	if (slot !== null && slot.unit === u.id) actions.push(undoAction(w, u));
	return { unit: id, actions };
}
