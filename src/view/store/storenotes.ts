//The store's messages (src/view/store/store.ts, review proposal 3): the message windows open, one shown at a time
//(MessageDialog), each OK doing what the message asked
import { computed, signal } from "@preact/signals";
import type { Position } from "../../core/types";

//A message window: its title, its text (HTML: the scenarios' briefings and the tutorial's messages are the
//game's own), the hex it points at (the map's, D2) and what its OK does
export interface Note {
	title: string;
	html: string;
	at: Position | null;
	ok: () => void;
	//a scenario's briefing (MessageDialog): the full window with its stamp; else a short notice
	briefing?: boolean;
}

export function createNotes() {
	const notes = signal<Note[]>([]);
	const note = computed(() => notes.value.length === 0 ? null : notes.value[0]);
	return {
		notes, note,

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

export type Notes = ReturnType<typeof createNotes>;
