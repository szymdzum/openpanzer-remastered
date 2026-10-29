//The engine fixtures restored as the contracts restore them, the state string the engine contract
//carried next to the one toData carries (test/statedata.ts), and the AI playing them for 2 turns on the
//game's session: what test/state.test.ts and test/state-ai.test.ts play
import { readFixture, restoreState } from "./contracts";
import { mulberry32 } from "./lifecycle";
import { coreEngine } from "./coreengine";
import { contractStateString, stateStringFromData, viewOf } from "./statedata";

//The fixture restored as the contracts restore it, with its modules
export async function restored(name: string) {
	const fixture = readFixture("engine", name);
	const scenario = await restoreState(fixture.state);
	const { game } = await import("../src/app/game");
	const { Equipment } = await import("../src/legacy/equipment");
	const { toData } = await import("../src/legacy/state");
	const { Rng } = await import("../src/core/random"); //the restored modules' (restoreState loads them again)
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	return { scenario, game, Equipment, toData, Rng };
}
type Restored = Awaited<ReturnType<typeof restored>>;

//What the old contract string has, and the same string rebuilt from toData
export function carried(r: Restored) {
	const saved = r.toData(r.scenario, r.game);
	return {
		want: contractStateString(r.scenario, r.Equipment, r.game.spotSide),
		got: stateStringFromData(saved, viewOf(r.scenario.map, r.game.spotSide), r.Equipment),
	};
}

//An AI action as the command the game sends for it (src/app/host.ts processAction), null for the UI's
type AIAction = import("../src/legacy/ai").AIAction;
type Command = import("../src/core/command").Command;
async function commandOf(): Promise<(a: AIAction) => Command | null> {
	const { actionType: A } = await import("../src/legacy/prototypes");
	const { Unit } = await import("../src/legacy/unit");
	const make: Record<number, (unit: number, p: AIAction["param"]) => Command> = {
		[A.move]: (unit, p) => ({ type: "move", unit, to: p[1] as { row: number; col: number } }),
		[A.attack]: (unit, p) => ({ type: "attack", unit, target: (p[1] as { id: number }).id }),
		[A.resupply]: (unit) => ({ type: "resupply", unit }),
		[A.reinforce]: (unit) => ({ type: "reinforce", unit }),
		[A.mount]: (unit) => ({ type: "mount", unit }),
		[A.umount]: (unit) => ({ type: "unmount", unit }),
	};
	return (a) => make[a.type] && a.param[0] instanceof Unit ? make[a.type](a.param[0].id, a.param) : null;
}

//The AI plays every player of the restored fixture for 2 turns with Math.random and the streams
//seeded, on the game's session (test/coreengine.ts: each player's AI, the end of turn with its
//reinforcements): after(step) after every action and end of turn
export async function playAI(r: Restored, seed: number, after: (step: string) => void) {
	const { Commands } = await import("../src/legacy/commands");
	const command = await commandOf();
	const m = r.scenario.map;
	const engine = await coreEngine();
	const realRandom = Math.random;
	Math.random = mulberry32(seed);
	r.Rng.seed(seed);
	try {
		for (let t = 0; t < 2 * m.getPlayers().length; t++) {
			const ai = new engine.AI(m.currentPlayer, m);
			ai.buildActions();
			after("turn " + m.turn + " purchases");
			for (let n = 0, a = ai.getAction(); a && n < 500; n++, a = ai.getAction()) {
				const c = command(a);
				if (c) Commands.execute(r.scenario, c);
				after("turn " + m.turn + " action " + n);
			}
			if (engine.Actions.endTurn().defeat) break;
			r.game.spotSide = m.currentPlayer.side;
			after("turn " + m.turn + " end");
		}
	} finally {
		Math.random = realRandom;
	}
}
