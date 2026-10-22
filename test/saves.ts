//Saved games (GameState.exportGameState, parsed) compared across a load, as test/gamestate.test.ts
//and test/properties.test.ts compare them

//The parts of a save the comparisons read or drop
interface SavedUnit { id?: number; tempSpotted?: boolean; hasRessuplied?: boolean; destroyed?: boolean }
interface SavedHex { unit?: SavedUnit | null; airunit?: SavedUnit | null; isMoveSel?: boolean; isAttackSel?: boolean }
interface SavedPlayer { handler?: unknown }
interface SavedReinforcement { turn: number | string; id?: number; unit: SavedUnit }
export interface Save {
	players: SavedPlayer[];
	campaign?: { coreUnits?: SavedUnit[] } | null;
	scenario: {
		dayTurn?: number;
		expPerSide?: unknown;
		unitsCostPerSide?: unknown;
		reinforcements: Record<string, SavedReinforcement[]>;
		map: {
			rows: number;
			cols: number;
			map: SavedHex[][];
			isLastRowPartial?: boolean;
			isLastColPartial?: boolean;
			currentPlayer?: SavedPlayer | null;
		};
	};
}

//Every unit of a save: on the hexes (ground and air) and in the reinforcements
export function* units(save: Save): Generator<[string, SavedUnit]> {
	const map = save.scenario.map;
	for (let r = 0; r < map.rows; r++)
		for (let c = 0; c < map.cols; c++)
			for (const k of ["unit", "airunit"] as const) {
				const u = map.map[r][c][k];
				if (u) yield [r + "," + c + " " + k, u];
			}
	for (const t of Object.keys(save.scenario.reinforcements))
		for (const [i, x] of save.scenario.reinforcements[t].entries())
			yield ["reinforcement " + t + "/" + i, x.unit];
}

//A save without what a load is known to lose or rebuild, the rest must survive a load:
//dayTurn and the reinforcement list's turn keys and ids (#55), the partial map edges (#54),
//the units' experience and cost per side (#83), unit ids (renumbered in hex order, #85, the
//campaign's core units with them) and tempSpotted (set again by the spotting a load replays,
//#84), the AI handlers (built again by setupPlayers), the typo field hasRessuplied (only ever
//written), the move and attack selection (GameState's export writes a hex with nothing else
//as {}) and the order of the campaign's core units and the destroyed ones among them (#142)
export function withoutLosses(save: Save): unknown {
	const s = structuredClone(save);
	const scenario = s.scenario, map = scenario.map;
	const coreUnits = s.campaign && s.campaign.coreUnits || [];
	for (const u of [...[...units(s)].map(([, x]) => x), ...coreUnits]) {
		delete u.id;
		delete u.tempSpotted;
		delete u.hasRessuplied;
	}
	delete scenario.dayTurn;
	delete scenario.expPerSide;
	delete scenario.unitsCostPerSide;
	delete map.isLastRowPartial;
	delete map.isLastColPartial;
	withoutSelection(map.map);
	for (const p of [...s.players, map.currentPlayer])
		if (p) delete p.handler;
	//#142: a load rebuilds the campaign's core unit list, in hex order and without the destroyed units
	if (s.campaign && s.campaign.coreUnits)
		s.campaign.coreUnits = coreUnits.filter((u) => !u.destroyed).map((u) => JSON.stringify(u)).sort()
			.map((u) => JSON.parse(u) as SavedUnit);
	return { ...s, scenario: { ...scenario, reinforcements: reinforcementList(scenario.reinforcements) } };
}

//The reinforcements in one list by turn, the turn a number and without ids (#55)
function reinforcementList(reinforcements: Record<string, SavedReinforcement[]>): SavedReinforcement[] {
	return Object.keys(reinforcements).sort((a, b) => +a - +b)
		.flatMap((t) => reinforcements[t].map((x): SavedReinforcement => ({ ...x, turn: +x.turn, id: undefined })));
}

//The hexes without their selection marks: a hex the export wrote out only for them is {}, as the
//export writes a hex with nothing else
function withoutSelection(hexes: SavedHex[][]) {
	const empty = JSON.stringify({ unit: null, airunit: null, terrain: 0, road: 0, owner: -1, flag: -1, isDeployment: -1, victorySide: -1, name: "" });
	for (const row of hexes)
		for (const [i, hex] of row.entries()) {
			delete hex.isMoveSel;
			delete hex.isAttackSel;
			if (JSON.stringify(hex) === empty) row[i] = {};
		}
}
