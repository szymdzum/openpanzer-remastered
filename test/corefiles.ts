//What the core starts a game from, read from the game's files as the old engine reads them: the
//scenario files of the list, the equipment of a set's countries (test/core-newgame.test.ts,
//test/core-campaign.test.ts). The reading is cli/files.ts's, which the command-line player shares
export { GAME_DIR, readEquipment, setupOf } from "../cli/files";

//The scenario list's files (a category header has no file)
export const scenarioFiles = () => scenariolist.filter((e) => e.length > 1).map((e) => e[0]);

//Where two texts first differ
export function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "\n    old  " + want.slice(Math.max(0, d - 150), d + 150) + "\n    core " + got.slice(Math.max(0, d - 150), d + 150);
}
