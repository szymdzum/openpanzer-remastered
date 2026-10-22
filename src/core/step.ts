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
import { attack, attackFirst, move, moveFirst, resumeFrom } from "./commands/move";
import { reinforce, resupply } from "./commands/supply";
import { disembark, embark, mount, unmount } from "./commands/transport";
import { endTurn } from "./commands/turn";
import { undo } from "./commands/undo";
import { buy, deploy, disband, sell, upgrade, upgradeUndeployed } from "./commands/units";
import type { Checkpoint, CheckpointInput, CommandHandler, World } from "./types";

//The handlers by command type, typed by a mapped type: a type without its handler, or a misspelled
//one, doesn't compile
const handlers: { [T in CommandType]: CommandHandler<CommandOf<T>> } = {
	move, attack, resupply, reinforce, mount, unmount, embark, disembark, undo, deploy, buy, upgrade, upgradeUndeployed,
	disband, sell, endTurn,
};

//(the registry's type can't name the handler of a type only known at the call). Undefined for a type
//that isn't a command
const handlerFor = <C extends Command>(cmd: C) => handlers[cmd.type] as unknown as CommandHandler<C> | undefined;

//Whether cmd is allowed in w, or why not, in words a player understands. Changes nothing: the UI
//greys a button with it, the AI lists the legal moves, a remote game checks the other side's command
//(which may not be a command at all)
export function check(w: World, cmd: Command): Refusal | null {
	const handler = handlerFor(cmd);
	if (handler === undefined) return { reason: "no such command" };
	return handler.check(w, cmd);
}

export type Stepped = { ok: true; world: World; events: GameEvent[] } | { ok: false; refusal: Refusal };

//Checks cmd, then plays it: the world after it (w stays as it was) and what happened, in order
export function step(w: World, cmd: Command): Stepped {
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	const d = beginDraft(w);
	handlerFor(cmd)!.run(d, cmd);
	return { ok: true, world: finishDraft(d), events: d.events };
}

//A command played up to its first checkpoint (a move or an attack: the screen animates it there), the
//others whole: the world then, the events so far and the checkpoint, null when the command is done
export type Begun = { ok: true; world: World; events: GameEvent[]; checkpoint: Checkpoint | null } | { ok: false; refusal: Refusal };

export function begin(w: World, cmd: Command): Begun {
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	const d = beginDraft(w);
	let checkpoint: Checkpoint | null = null;
	if (cmd.type === "move") checkpoint = moveFirst(d, cmd);
	else if (cmd.type === "attack") checkpoint = attackFirst(d, cmd);
	else handlerFor(cmd)!.run(d, cmd);
	return { ok: true, world: finishDraft(d), events: d.events, checkpoint };
}

export interface Resumed {
	world: World;
	events: GameEvent[];
	checkpoint: Checkpoint | null;
}

//Goes on from a checkpoint to the next one, with what the screen says there. w is the world at the
//checkpoint, or one made again from the screen's objects (which the screen may have changed meanwhile)
export function resume(w: World, cp: Checkpoint, input: CheckpointInput = {}): Resumed {
	const d = beginDraft(w);
	const checkpoint = resumeFrom(d, cp, input);
	return { world: finishDraft(d), events: d.events, checkpoint };
}
