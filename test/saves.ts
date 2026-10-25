//Saved games compared across a load, as test/gamestate.test.ts and test/properties.test.ts compare
//them, and the saves of the format before written the way the game wrote them, to import
import type { Game } from "../src/game";
import type { SaveFile, UnknownPart } from "../src/savegame";

export type Save = SaveFile;

//A save without what a load is known to lose: nothing since #128, the whole save survives a load
//(the save property of test/properties.test.ts compares through this)
export function withoutLosses(save: SaveFile): unknown {
	return structuredClone(save);
}

//A save without what an imported save never stored (src/savegame.ts UnknownPart): an imported save
//has placeholders there, a loaded one the game's own
export function withoutUnknown(save: SaveFile, unknown: UnknownPart[]): SaveFile {
	const { version, rules, data, state } = structuredClone(save);
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
	return { version, rules, data, state };
}

//The format before: GameState.exportGameState of the game as it wrote it, the JSON of the
//scenario, its players and the campaign's progress, the units without their player and a hex
//with nothing but the defaults as {}. The selection was on the map and the hexes then (the
//selected unit, the move and attack marks, #377): written where the old game had them
export function oldExport(game: Game): string {
	const emptyHex: Record<string, unknown> = { unit: null, airunit: null, terrain: 0, road: 0, owner: -1, flag: -1,
		isDeployment: -1, victorySide: -1, name: "", isMoveSel: false, isAttackSel: false };
	const selection = game.scenario.map.getSelection();
	const state = { scenario: game.scenario, players: game.scenario.map.getPlayers(), campaign: oldCampaignSave(game) };
	return JSON.stringify(state, function(this: Record<string, unknown>, key, value: Record<string, unknown>) {
		if (key === "player" && hasOwn(this, "eqid"))
			return undefined;
		if (value && hasOwn(value, "isLastRowPartial"))
			return withAfter(value, "turn", { currentUnit: selection.unit });
		if (value && hasOwn(value, "terrain") && typeof value.getPos === "function") {
			const at = (value.getPos as () => { row: number; col: number })();
			const hex = withAfter(value, "name", { isMoveSel: selection.isMove(at.row, at.col), isAttackSel: selection.isAttack(at.row, at.col) });
			return Object.keys(emptyHex).every((p) => hex[p] === emptyHex[p]) ? {} : hex;
		}
		return value;
	});
}

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

//o's own fields with more after the one named
function withAfter(o: Record<string, unknown>, after: string, more: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(o)) {
		out[k] = o[k];
		if (k === after) Object.assign(out, more);
	}
	return out;
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
