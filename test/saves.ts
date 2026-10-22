//Saved games compared across a load, as test/gamestate.test.ts and test/properties.test.ts compare
//them, and the saves of the format before written the way the game wrote them, to import
import type { Game } from "../src/game";
import type { SaveFile, UnknownPart } from "../src/savegame";

export type Save = SaveFile;

//A save without what a load is known to lose or rebuild, the rest must survive a load: whose turn
//it is (#71), the partial map edges (#54), dayTurn (#55), the units' experience and cost per side
//(#83), tempSpotted (set again by the spotting a load replays, #84), the unit ids and the units'
//order (numbered again in hex order, #85: the units sorted, the hexes' and the core lists'
//references to them dropped), the core lists (rebuilt for the campaign player only, in hex order
//and without the destroyed units, with the AI's core units: #142, #149, #150), the undo, the
//random streams, the equipment lists, the campaign's progress and the scenario's description (#128)
export function withoutLosses(save: SaveFile): unknown {
	const { data, state } = structuredClone(save);
	delete state.turn.currentPlayer;
	delete state.turn.undoable;
	delete state.map.lastRowPartial;
	delete state.map.lastColPartial;
	delete state.scenario.dayTurn;
	delete state.scenario.expPerSide;
	delete state.scenario.unitsCostPerSide;
	delete state.nextUnitId;
	delete state.rng;
	delete state.equipment;
	delete data.description;
	if (state.campaign) delete state.campaign.progress;
	for (const h of state.map.hexes) {
		h.unit = h.unit === null ? null : 0;
		h.air = h.air === null ? null : 0;
	}
	for (const p of state.players) delete p.core;
	const units = state.units.map((u) => {
		delete u.id;
		delete u.tempSpotted;
		return JSON.stringify(u);
	}).sort();
	return { data, state: { ...state, units } };
}

//A save without what an imported save never stored (src/savegame.ts UnknownPart): an imported save
//has placeholders there, a loaded one the game's own
export function withoutUnknown(save: SaveFile, unknown: UnknownPart[]): SaveFile {
	const { version, data, state } = structuredClone(save);
	const drop: Record<UnknownPart, () => void> = {
		description: () => { delete data.description; },
		equipment: () => { delete state.equipment; },
		rng: () => { delete state.rng; },
		campaignProgress: () => { if (state.campaign) delete state.campaign.progress; },
		startPrestige: () => { if (state.campaign) delete state.campaign.startPrestige; },
		undo: () => { delete state.turn.undoable; },
		reserves: () => {
			for (const p of state.players)
				if (!state.campaign || p.country !== state.campaign.country) delete p.core;
		},
		nextUnitId: () => { delete state.nextUnitId; },
	};
	for (const part of unknown) drop[part]();
	return { version, data, state };
}

//The format before: GameState.exportGameState of the game as it wrote it, the JSON of the
//scenario, its players and the campaign's progress, the units without their player and a hex
//with nothing but the defaults as {}
export function oldExport(game: Game): string {
	const emptyHex: Record<string, unknown> = { unit: null, airunit: null, terrain: 0, road: 0, owner: -1, flag: -1,
		isDeployment: -1, victorySide: -1, name: "", isMoveSel: false, isAttackSel: false };
	const state = { scenario: game.scenario, players: game.scenario.map.getPlayers(), campaign: oldCampaignSave(game) };
	return JSON.stringify(state, function(this: Record<string, unknown>, key, value: Record<string, unknown>) {
		if (key === "player" && Object.prototype.hasOwnProperty.call(this, "eqid"))
			return undefined;
		if (value && Object.prototype.hasOwnProperty.call(value, "terrain")
			&& Object.keys(emptyHex).every((p) => Object.prototype.hasOwnProperty.call(value, p) && value[p] === emptyHex[p]))
			return {};
		return value;
	});
}

//And a local save of the format before: three items, the JSON of the scenario, of its players and
//of the campaign's progress (none without a campaign)
export function oldLocalItems(game: Game): Record<string, string | null> {
	const campaign = oldCampaignSave(game);
	return { scenario: JSON.stringify(game.scenario), players: JSON.stringify(game.scenario.map.getPlayers()),
		campaign: campaign && JSON.stringify(campaign) };
}

function oldCampaignSave(game: Game) {
	if (game.campaign === null)
		return null;
	return { id: game.campaign.id, file: game.campaign.file, scenario: game.campaign.getCurrentScenario().id,
		country: game.campaign.country, difficulty: game.campaign.difficulty, coreUnits: game.getCampaignPlayer().getCoreUnitList() };
}
