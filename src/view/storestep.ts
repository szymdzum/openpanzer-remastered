//The store's step (src/view/store.ts, review proposal 3): a step's beats played on the map (src/view/player.ts), then
//what it told over the map and in the status bar (CombatResults)
import { type ReadonlySignal, signal } from "@preact/signals";
import type { CommandType, ResultOf } from "../commands";
import type { GameEvent } from "../core/events";
import type { UnitId, World } from "../core/types";
import type { GameHost } from "../host";
import { beatsFor, heldUntil, shownWorld } from "./beats";
import { hexCentre } from "./hexgrid";
import { createPlayer, type Motion, type Stage } from "./player";
import { type News, type Results, resultsOf } from "./results";
import type { Core } from "./storecore";

//What the page gives the step's beats: its sounds, and whether the person asked for reduced motion
export type StepPage = Pick<Stage, "sound" | "still">;

export function createStep(core: Pick<Core, "world">, host: Partial<Pick<GameHost, "cosmetic">>, page: StepPage) {
	const { world } = core;
	//What the last step told (CombatResults): its chips and stamp over the map until they fade, its line in the status bar
	//until the next command
	const results = signal<Results | null>(null);
	const news = signal<News | null>(null);
	//A step's beats while they play (src/view/player.ts): what the map draws over the units, the unit hidden from its hex
	//while it moves; the map takes no click meanwhile
	const motion = signal<Motion | null>(null);
	const moving = signal<UnitId | null>(null);
	//The world the map draws while the beats play (#503): the units a beat still has to move or blow up as they were
	//before the step, until their beat; null between steps, when the map draws the world
	const shown = signal<World | null>(null);
	//A step's beats playing (src/view/player.ts): the map takes no click meanwhile, the screen tells the host it is still
	//showing a step (#459), and the person's commands wait for it, as the old UI's End turn waited (#465, #58, #289)
	const showing = signal(false);
	//(the sprite and sound picks from the cosmetic stream; with no host to draw from, the first of each)
	const cosmetic = host.cosmetic;
	const player = createPlayer({ pick: cosmetic === undefined ? () => 0 : () => cosmetic.call(host), show: (m) => { motion.value = m; },
		hide: (id) => { moving.value = id; }, centre: (p) => hexCentre(p.row, p.col), ...page });

	//What a step told over the map and in the status bar (nothing to tell: the last results stay until they fade)
	const tell = (before: World, events: GameEvent[]) => {
		const told = resultsOf(before, world.value!, events);
		if (told === null) return;
		results.value = told;
		news.value = told.news;
	};

	//A step's beats played, then what it told, then what follows (a person's victories, a program's next action)
	const play = (before: World, events: GameEvent[], then: () => void) => {
		const after = world.value!, beats = beatsFor(before, after, events), until = heldUntil(beats, events);
		showing.value = true;
		player.play(beats, () => {
			shown.value = null;
			showing.value = false;
			tell(before, events);
			then();
		}, (i) => {
			shown.value = shownWorld(before, after, [...until].filter(([, last]) => last >= i).map(([id]) => id));
		});
	};

	return {
		results, news, motion, moving, shown: shown as ReadonlySignal<World | null>, showing: showing as ReadonlySignal<boolean>, play,

		//The chips and the stamp faded (the status bar's line stays)
		faded: () => {
			results.value = null;
		},

		//The beats stopped (a new scenario's start)
		stop() {
			player.stop();
			shown.value = null;
			showing.value = false;
		},
	};
}

//The events of a command's result: a move's and an attack's carry theirs, the others none
export function eventsOf(result: ResultOf<CommandType>): GameEvent[] {
	return result !== null && typeof result === "object" && "events" in result ? result.events : [];
}
