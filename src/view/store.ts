//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
import { computed, signal } from "@preact/signals";
import type { Command } from "../commands";
import type { Position, UnitId, World } from "../core/types";
import type { GameHost } from "../host";
import { endTurnRefusal, reasonOf, statusOf, unitView } from "./model";

//What the store asks of the game host: the world it plays, the person's commands, the victories they won
export type StoreHost = Pick<GameHost, "world" | "command" | "won">;

//A message window: its title, its text (HTML: the scenarios' briefings and the tutorial's messages are the
//game's own), the hex it points at (the map's, D2) and what its OK does
export interface Note {
	title: string;
	html: string;
	at: Position | null;
	ok: () => void;
}

export function createStore(host: StoreHost) {
	const world = signal<World | null>(null);
	const selected = signal<UnitId | null>(null);
	const notes = signal<Note[]>([]);
	const refused = signal<string | null>(null);
	const lookAt = signal<Position | null>(null);

	const status = computed(() => world.value === null ? null : statusOf(world.value));
	//(each a value of its own: the status bar's cells render again only when theirs changes)
	const side = computed(() => status.value === null ? -1 : status.value.side);
	const sideName = computed(() => status.value === null ? "" : status.value.sideName);
	const turn = computed(() => status.value === null ? "" : status.value.turn + "/" + status.value.maxTurns);
	const prestige = computed(() => status.value === null ? null : status.value.prestige);
	const endTurn = computed(() => world.value === null ? "No game is playing" : endTurnRefusal(world.value));
	const unit = computed(() => world.value === null || selected.value === null ? null : unitView(world.value, selected.value));
	const note = computed(() => notes.value.length === 0 ? null : notes.value[0]);

	//The world as the host plays it now
	const refresh = () => { world.value = host.world(); };

	return {
		world, selected, notes, refused, lookAt, side, sideName, turn, prestige, endTurn, unit, note, refresh,

		//A person's command sent to the host: the screen shows the step at once (the animations are D4's),
		//then its victories are told; refused, the reason, which the status bar shows until the next command
		dispatch(cmd: Command): string | null {
			const r = host.command(cmd);
			refresh();
			if (r.ok) host.won(r.result);
			refused.value = "refusal" in r ? reasonOf(r.refusal) : null;
			return refused.value;
		},

		//A message shown after those already open, one at a time
		show(n: Note) {
			notes.value = [...notes.value, n];
		},

		//The open message's OK: closed, then what it does
		close() {
			const [top, ...rest] = notes.value;
			if (top === undefined) return;
			notes.value = rest;
			top.ok();
		},
	};
}

export type Store = ReturnType<typeof createStore>;
