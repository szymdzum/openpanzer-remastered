//The store's core: the world the host plays, the selected unit, the layer shown, the hex the map looks at, and the
//person's commands sent to the host. What a command does to the other parts beside the world they give as hooks.
import { type ReadonlySignal, signal } from "@preact/signals";
import type { ResultOf } from "../../legacy/commands";
import type { Command, CommandType } from "../../core/command";
import type { Position, UnitId, World } from "../../core/types";
import { isAir } from "../../core/units";
import { unitById } from "../../core/world";
import type { GameHost } from "../../app/host";
import { reasonOf } from "./model";

export type CoreHost = Pick<GameHost, "world" | "command">;

export interface CoreHooks {
	busy: () => boolean; //a step is still shown: nothing is sent then (#465)
	endingTurn: () => void; //the person's turn ending, before the command, which may play the program's whole turn
	answered: () => void; //the command answered, before the world is read again
	played: (before: World, result: ResultOf<CommandType>) => void; //a command played, with the world before it
}

export function createCore(host: CoreHost, hooks: CoreHooks) {
	const world = signal<World | null>(null);
	const selected = signal<UnitId | null>(null);
	const refused = signal<string | null>(null);
	const lookAt = signal<Position | null>(null);
	//The layer shown: the air layer when true
	const airMode = signal(false);

	//A unit that left the world (destroyed, sold, disbanded) is no longer selected
	const refresh = () => {
		const w = host.world();
		world.value = w;
		const id = selected.peek();
		if (w !== null && id !== null && unitById(w, id) === null) selected.value = null;
	};

	//A person's command sent to the host. A played one shows its step, then its victories are told; refused, the reason
	//comes back, which the status bar shows until the next command
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
		//(a command played had a world to start from: with none, no game is playing and the host refuses it. The end of turn
		//has no step of its own: the program's turn it started may be showing its first one)
		if (r.ok && cmd.type !== "endTurn") hooks.played(before!, r.result);
		refused.value = "refusal" in r ? reasonOf(r.refusal) : null;
		return refused.value;
	};

	//A unit selected, or none: a unit shows its layer (an aircraft switches the air layer on), as in the original game
	//(reference/src/ui.js)
	const select = (id: UnitId | null) => {
		const w = world.value, u = w === null || id === null ? null : unitById(w, id);
		selected.value = id;
		if (u !== null) airMode.value = isAir(w!, u);
		refused.value = null;
	};

	//A unit picked without what select does beside it (the air layer, the refusal cleared), and unchecked: for deploying,
	//leaving the air layer and a program's pick (the tutorial's)
	const pickUnit = (id: UnitId | null) => { selected.value = id; };

	const look = (at: Position | null) => { lookAt.value = at; };

	return {
		world, refused, airMode, refresh, dispatch, select,
		//(read-only outside the core)
		selected: selected as ReadonlySignal<UnitId | null>, lookAt: lookAt as ReadonlySignal<Position | null>,

		pickUnit, look,

		//A new scenario's start: nothing looked at, no refusal shown
		reset() {
			lookAt.value = null;
			refused.value = null;
		},
	};
}

export type Core = ReturnType<typeof createCore>;
