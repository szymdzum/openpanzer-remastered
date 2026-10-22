/**
 * Step - a command on the state: step(world, command) -> the world after it and the events
 * (docs/CORE.md). The commands are src/commands.ts's, plain data with ids
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Each command type has a handler (src/core/commands/): check, pure, says whether the command is
 * allowed or why not; run plays it on a draft of the state. step checks first, so run only plays
 * what check allowed. The world given is left as it was: the draft copies what it changes
 * (draft.ts), and the world returned shares the rest with it.
 */

import type { Command, CommandOf, CommandType, Refusal } from "../commands";
import { beginDraft, finishDraft } from "./draft";
import type { GameEvent } from "./events";
import { reinforce, resupply } from "./commands/supply";
import { disembark, embark, mount, unmount } from "./commands/transport";
import { buy, deploy, disband, sell, upgrade, upgradeUndeployed } from "./commands/units";
import type { CommandHandler, World } from "./types";

//A command the core doesn't play yet: refused, with the layer it comes with
function later<C extends Command>(reason: string): CommandHandler<C> {
	return { check: () => ({ reason }), run() {} };
}
const move = later<CommandOf<"move">>("the move isn't in the core yet (#134)");
const attack = later<CommandOf<"attack">>("the attack isn't in the core yet (#134)");
const undo = later<CommandOf<"undo">>("the undo isn't in the core yet (#134)");
const endTurn = later<CommandOf<"endTurn">>("the end of turn isn't in the core yet (#135)");

//The handlers by command type, typed by a mapped type: a type without its handler, or a misspelled
//one, doesn't compile
const handlers: { [T in CommandType]: CommandHandler<CommandOf<T>> } = {
	move, attack, resupply, reinforce, mount, unmount, embark, disembark, undo, deploy, buy, upgrade, upgradeUndeployed,
	disband, sell, endTurn,
};

//(the registry's type can't name the handler of a type only known at the call)
const handlerFor = <C extends Command>(cmd: C) => handlers[cmd.type] as unknown as CommandHandler<C>;

//Whether cmd is allowed in w, or why not, in words a player understands. Changes nothing: the UI
//greys a button with it, the AI lists the legal moves, a remote game checks the other side's command
export function check(w: World, cmd: Command): Refusal | null {
	return handlerFor(cmd).check(w, cmd);
}

export type Stepped = { ok: true; world: World; events: GameEvent[] } | { ok: false; refusal: Refusal };

//Checks cmd, then plays it: the world after it (w stays as it was) and what happened, in order
export function step(w: World, cmd: Command): Stepped {
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	const d = beginDraft(w);
	handlerFor(cmd).run(d, cmd);
	return { ok: true, world: finishDraft(d), events: d.events };
}
