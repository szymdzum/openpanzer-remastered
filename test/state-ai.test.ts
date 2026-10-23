//toData after every action the AI plays (src/state.ts, test/state.test.ts): on every engine fixture,
//2 turns, it carries what the engine contract's state string carried (test/statedata.ts). Its own file:
//the slowest of the state's tests, played on a worker of its own
import { expect, test } from "vitest";
import { fixtures } from "./contracts";
import { carried, playAI, restored } from "./stateplay";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

//The AI plays every player for 2 turns, Math.random seeded, the state compared after every action
//(through the commands, as the game sends them) and every end of turn
test.each(fixtures("engine"))("toData carries the state string after every AI action of %s", async (name) => {
	const r = await restored(name);
	const differences: string[] = [];
	await playAI(r, 7, (step) => {
		const { want, got } = carried(r);
		if (want !== got && differences.length < 3) differences.push(step + "\n" + firstDifference(want, got));
	});
	expect(differences).toEqual([]);
});

function firstDifference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "  want " + want.slice(Math.max(0, d - 100), d + 100) + "\n  got  " + got.slice(Math.max(0, d - 100), d + 100);
}
