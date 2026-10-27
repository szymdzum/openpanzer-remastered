//The store's core (src/view/store.ts, review proposal 3): the world the host plays, the unit selected and the layer shown,
//the hex the map is asked to look at, and the person's commands sent to the host. The other parts of the store read it;
//what a command does to them beside the world (the step shown, the turn's report reset) they give as hooks.
import { signal } from "@preact/signals";
import type { Command, CommandType, ResultOf } from "../commands";
import type { Position, UnitId, World } from "../core/types";
import { isAir } from "../core/units";
import { unitById } from "../core/world";
import type { GameHost } from "../host";
import { reasonOf } from "./model";

export type CoreHost = Pick<GameHost, "world" | "command">;

//What the other parts do around a command: whether a step is still shown (nothing is sent then, #465), the person's
//turn ending (before the command, which may play the program's whole turn), the command answered (before the world is
//read again), and a command played, with the world before it
export interface CoreHooks {
	busy: () => boolean;
	endingTurn: () => void;
	answered: () => void;
	played: (before: World, result: ResultOf<CommandType>) => void;
}

export function createCore(host: CoreHost, hooks: CoreHooks) {
	const world = signal<World | null>(null);
	const selected = signal<UnitId | null>(null);
	const refused = signal<string | null>(null);
	const lookAt = signal<Position | null>(null);
	//The map's (D2): the layer shown (the air layer when true)
	const airMode = signal(false);

	//The world as the host plays it now
	const refresh = () => { world.value = host.world(); };

	//A person's command sent to the host: the screen shows the step at once (the animations are D4's),
	//then its victories are told; refused, the reason, which the status bar shows until the next command
	const dispatch = (cmd: Command): string | null => {
		//(nothing while a step is shown: its End turn would start the next player's turn under it, #465)
		if (hooks.busy()) return null;
		const before = world.value;
		//(the person's turn ending: nothing stays selected under it; before the command, which may play the program's whole
		//turn and start the person's next)
		if (cmd.type === "endTurn") {
			hooks.endingTurn();
			selected.value = null;
		}
		const r = host.command(cmd);
		hooks.answered();
		refresh();
		//(a command played had a world to start from: with none, no game is playing and the host refuses it)
		if (r.ok) hooks.played(before!, r.result);
		refused.value = "refusal" in r ? reasonOf(r.refusal) : null;
		return refused.value;
	};

	//A unit selected, or none: a unit shows its layer, as the old UI did (an aircraft switches the air layer on)
	const select = (id: UnitId | null) => {
		const w = world.value, u = w === null || id === null ? null : unitById(w, id);
		selected.value = id;
		if (u !== null) airMode.value = isAir(w!, u);
		refused.value = null;
	};

	return { world, selected, refused, lookAt, airMode, refresh, dispatch, select };
}

export type Core = ReturnType<typeof createCore>;
