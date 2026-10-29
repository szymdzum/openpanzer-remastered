//The unit context menu's view model: the actions the selected unit can take now, by the rules and in the order of the
//original game's menu (updateUnitContextWindow, reference/src/ui.js). What each gives, computed with the functions the
//command runs, is its tooltip. Plain TypeScript tested on hand-built worlds (test/view-context.test.tsx)
import type { Command } from "../../core/command";
import { costPerStrength } from "../../core/costs";
import { canDisembark, canEmbark, embarkTypeOf } from "../../core/movement";
import { canReinforce, canResupply, reinforcement, resupplyValue } from "../../core/supply";
import type { Supply, UnitId, UnitState, World } from "../../core/types";
import { canMount } from "../../core/units";
import { playerOf, unitById } from "../../core/world";
import { unitClass } from "../../core/tables";
import type { IconName } from "../components/icon";
import { type ActionKey, canOrder, prestigeText } from "./model";

export interface ContextAction {
	key: ActionKey;
	label: string;
	icon: IconName;
	command: Command;
	tip: string; //its tooltip and accessible name: the label, then what it gives, "Supply: +5 ammo, +14 fuel"
}

export interface UnitContext {
	unit: UnitId;
	actions: ContextAction[];
}

//A mounted unit's transport's share is added in
function supplyText(s: Supply): string {
	const ammo = s.ammo + s.transportAmmo, fuel = s.fuel + s.transportFuel;
	return [ammo > 0 && "+" + ammo + " ammo", fuel > 0 && "+" + fuel + " fuel"].filter(Boolean).join(", ");
}

//The tip is the label alone when the action gives nothing to tell
const action = (key: ActionKey, label: string, icon: IconName, command: Command, gives = ""): ContextAction =>
	({ key, label, icon, command, tip: gives === "" ? label : label + ": " + gives });

function mountAction(w: World, u: UnitState): ContextAction {
	const transport = w.equipment[u.transport!.eqid].name;
	return u.isMounted ? action("mount", "Unmount", "mount", { type: "unmount", unit: u.id }, "from " + transport)
		: action("mount", "Mount", "mount", { type: "mount", unit: u.id }, "on " + transport);
}

function carrierKind(w: World, u: UnitState): "air" | "naval" {
	const uclass = u.carrier !== 0 ? w.equipment[Math.abs(u.carrier)].uclass : embarkTypeOf(w, u);
	return uclass === unitClass.airTransport ? "air" : "naval";
}

function embarkAction(w: World, u: UnitState): ContextAction {
	const kind = carrierKind(w, u) + " transport";
	return u.carrier > 0 ? action("embark", "Disembark", "embark", { type: "disembark", unit: u.id }, kind)
		: action("embark", "Embark", "embark", { type: "embark", unit: u.id }, kind);
}

//The tip tells "+1 of 2" when the prestige pays for part of the points
function reinforceAction(w: World, u: UnitState, over: boolean): ContextAction {
	const command: Command = over ? { type: "reinforce", unit: u.id, overstrength: true } : { type: "reinforce", unit: u.id };
	const plan = reinforcement(w, u, over);
	const points = plan.bought < plan.wanted ? `+${plan.bought} of ${plan.wanted}` : `+${plan.wanted}`;
	const gives = plan.bought < 1 ? "" : `${points} for ${prestigeText(plan.bought * plan.perPoint)} prestige`;
	return over ? action("overstrength", "Overstrength", "overstrength", command, gives) : action("reinforce", "Reinforce", "reinforce", command, gives);
}

function undoAction(w: World, u: UnitState): ContextAction {
	const before = w.state.turn.undoable!.before;
	return action("undo", "Undo move", "undo", { type: "undo", unit: u.id }, `back to ${before.row},${before.col}`);
}

/** The person's unit's menu on their turn, null otherwise; Reinforce and Overstrength need the prestige for a point. */
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
