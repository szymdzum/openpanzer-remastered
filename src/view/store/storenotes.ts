//The store's messages: the message windows open, one shown at a time, each OK doing what the message asked
import { computed, signal } from "@preact/signals";
import type { Position } from "../../core/types";

/** The text is HTML: the scenarios' briefings and the tutorial's messages are the game's own. */
export interface Note {
	title: string;
	html: string;
	at: Position | null;
	ok: () => void;
	//a scenario's briefing: the full window with its stamp; else a short notice
	briefing?: boolean;
}

export function createNotes() {
	const notes = signal<Note[]>([]);
	const note = computed(() => notes.value.length === 0 ? null : notes.value[0]);
	return {
		notes, note,

		//Shown after those already open
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
