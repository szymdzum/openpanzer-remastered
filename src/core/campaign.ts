/**
 * Campaign - a campaign's scenario started and ended: the campaign player's prestige, dossier and
 * core units at the start, sent to HQ at the end and carried into the next scenario (docs/CORE.md)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Kept as the old game plays it (fixed after the switch): the next scenario's players of the
 * campaign's country take the carried player's id, side and country whatever the scenario says
 * (#61, #64), and the units removed from the deployment hexes leave without a trace in the dossier.
 */

import { CURRENCY_MULTIPLIER, PROTOTYPE_MIN_COST, playerType, unitClass } from "../prototypes";
import { nextRandom } from "../rng";
import type { ScenarioOutcome } from "../scenario";
import type { CampaignState } from "../state";
import { newDossier, offMap, playerAt, removeUnit, writePlayer, writeUnit } from "./draft";
import type { CoreUnit, Draft, EquipmentTable, GameState, OffMapUnit, PlayerState, UnitState, World } from "./types";

//A campaign data file's scenario (resources/campaigns/data/*.json): what each outcome gives and
//where it goes (254 and 255 end the campaign)
export interface CampaignScenarioData {
	id: number;
	intro: string;
	scenario: string;
	outcome: { [outcome in ScenarioOutcome]: { goto: number; prestige: number } };
}

//The campaign player: the last player of the campaign's country (Game's setupPlayers), -1 for none
export function campaignPlayer(state: { players: PlayerState[] }, campaign: CampaignState): number {
	let id = -1;
	state.players.forEach((p, i) => { if (p.country === campaign.country) id = i; });
	return id;
}

//Game.setupPlayers and startCampaignScenario on a new scenario's draft: the other countries' players
//are the AI; the campaign's take the carried player (its score added to theirs, its core units); then
//the first scenario's prestige, dossier and core units (its units on its deployment hexes), a later
//one's units on the deployment hexes removed, and the prototype a brilliant victory earned
export function startCampaignScenario(d: Draft, campaign: CampaignState, carried: PlayerState | null) {
	const cp = campaignPlayer(d.state, campaign);
	d.state.players.forEach((p, i) => {
		if (p.country !== campaign.country) writePlayer(d, i).type = playerType.aiLocal;
		else if (carried !== null) carry(writePlayer(d, i), carried);
	});
	if (cp < 0) return;
	const progress = { ...campaign.progress };
	d.state.campaign = { ...d.state.campaign, progress };
	if (progress.isStart) firstScenario(d, cp, campaign.startPrestige);
	if (progress.removeNonCampaignUnits) removeNonCampaignUnits(d, cp);
	if (progress.awardPrototype && awardPrototype(d, cp)) progress.awardPrototype = false;
}

//Whether the unit is the campaign player's (by its player's id, which the carried player may have
//changed) and stands on one of its deployment hexes
function onOwnDeployment(d: Draft, u: UnitState, cp: number): boolean {
	const id = d.state.players[cp].id;
	return playerAt(d, u.owner).id === id && d.data.hexes[u.row * d.state.map.cols + u.col].deployment === id;
}

//Player.copy(carried, true): the id, side, country, prestige, turn played and type are the carried
//player's (#61), its score is added; its core units and dossier when it has them
function carry(p: PlayerState, carried: PlayerState) {
	Object.assign(p, { id: carried.id, side: carried.side, country: carried.country, prestige: carried.prestige,
		playedTurn: carried.playedTurn, type: carried.type });
	p.score += carried.score;
	if (carried.core.length) p.core = carried.core.map((c) => ({ ...c }));
	if (carried.dossier.units) p.dossier = structuredClone(carried.dossier);
}

//The first scenario: the campaign's starting prestige, an empty dossier, and its units on its
//deployment hexes become its core units, in the unit list's order
function firstScenario(d: Draft, cp: number, prestige: number) {
	const p = writePlayer(d, cp);
	p.prestige = prestige;
	p.dossier = newDossier();
	for (const u of d.state.units) {
		if (!onOwnDeployment(d, u, cp)) continue;
		writeUnit(d, u.id).isCore = true;
		p.core.push({ onMap: u.id });
	}
}

//Map.removeNonCampaignUnits: the scenario's own units of the campaign player on its deployment hexes
//make room for its core units (no loss in the dossier)
function removeNonCampaignUnits(d: Draft, cp: number) {
	const gone = d.state.units.filter((u) => !u.isCore && onOwnDeployment(d, u, cp));
	for (const u of gone) removeUnit(d, u.id, false);
}

//Scenario.getRandomPrototype and Player.acquireUnit: a unit of the country's next year's combat
//classes worth at least PROTOTYPE_MIN_COST, drawn from the game stream (drawn even with none), joins
//the core units. Whether one was given
function awardPrototype(d: Draft, cp: number): boolean {
	const p = d.state.players[cp];
	const list = prototypes(d, p.country + 1, new Date(d.state.scenario.date).getFullYear() + 1);
	const eqid = list[(nextRandom(d.rng) * list.length) >> 0];
	if (eqid === undefined || !(eqid > 0)) return false;
	const e = d.equipment[eqid];
	const unit: OffMapUnit = { eqid, owner: p.id, transport: null, carrier: 0, strength: 10, moveLeft: e.movpoints, ammo: e.ammo,
		fuel: e.fuel, hits: 0, experience: 0, entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 2, flag: p.country + 1,
		isCore: true, isMounted: false, hasMoved: false, hasFired: false, hasResupplied: false, hasOverstrength: false,
		isSurprised: false, tempSpotted: false };
	writePlayer(d, cp).core.push({ reserve: unit });
	return true;
}

//The prototype a new campaign scenario's start gave (newGame with the campaign given, which said a
//brilliant victory earned one): its eqid, for the message that tells the player; null when none was
export function awardedPrototype(campaign: CampaignState | null, state: GameState): number | null {
	if (campaign === null || !campaign.progress.awardPrototype || state.campaign === null || state.campaign.progress.awardPrototype)
		return null;
	const core = state.players[campaignPlayer(state, state.campaign)].core, last = core[core.length - 1];
	return "reserve" in last ? last.reserve.eqid : null;
}

//Scenario.getPrototypeUnitsAvailable: the equipment of a country file's country (by its country
//field, as the equipment holds it) available in the year, of the tank to anti-tank and artillery to
//tactical bomber classes, not too cheap
function prototypes(w: World, country: number, year: number): number[] {
	if (w.state.equipment.indexes[country] === undefined) return [];
	const list: number[] = [];
	for (const id of Object.keys(w.equipment)) {
		const e = w.equipment[id];
		//(the file's country field is a number, as the old engine's == compares it)
		if (+e.country === country && e.yearavailable === year && isPrototype(e)) list.push(+id);
	}
	return list;
}

//The tank to anti-tank and artillery to tactical bomber classes, worth at least PROTOTYPE_MIN_COST
function isPrototype(e: EquipmentEntry): boolean {
	const combat = (e.uclass >= unitClass.tank && e.uclass <= unitClass.antiTank)
		|| (e.uclass >= unitClass.artillery && e.uclass <= unitClass.tacticalBomber);
	return combat && e.cost * CURRENCY_MULTIPLIER >= PROTOTYPE_MIN_COST;
}

//What a scenario's end leaves for the next: the campaign player as it goes on, its next scenario
//(null: the campaign ended) and the campaign's progress
export interface CampaignNext {
	player: PlayerState;
	next: CampaignScenarioData | null;
	campaign: CampaignState;
}

//Game.continueCampaign: the outcome's prestige and the scenario in the dossier, the campaign player
//sent to HQ (Player.setPlayerToHQ), then the next scenario the outcome leads to; a brilliant victory
//earns a prototype there (the core units' equipment is loaded: coreCountries, #182). Not reproduced: a player whose core units all fell carries none, where the old engine
//carried the dead units it brought in (#183: the list it brought isn't state)
export function endCampaignScenario(w: World, outcome: ScenarioOutcome, scenarios: CampaignScenarioData[]): CampaignNext {
	const campaign = w.state.campaign, played = scenarios[campaign.scenario];
	const p = playerAtHQ(w, outcome, scenarios);
	p.core = p.core.map((c): CoreUnit => ({ reserve: toHQ(w, c) }));
	const goto = played.outcome[outcome].goto, next = goto < scenarios.length ? scenarios[goto] : null;
	const progress = { isStart: false, removeNonCampaignUnits: true,
		awardPrototype: campaign.progress.awardPrototype || (next !== null && outcome === "briliant") };
	return { player: p, next, campaign: { ...campaign, scenario: next !== null ? goto : campaign.scenario, progress } };
}

//The scenario as the old game leaves it once it is over, until the next one loads (Game.continueCampaign
//worked on the campaign player in place, and the screen shows it meanwhile): the outcome's prestige and
//the scenario in its dossier, its transports, support and prestige by turn gone, its lost units out of
//its list and the others as at HQ, the ones on the map off their hexes but still in the unit list (the
//hexes still name them). The campaign's progress is the next scenario's
export function scenarioEnded(w: World, outcome: ScenarioOutcome, scenarios: CampaignScenarioData[], next: CampaignState): GameState {
	const s = w.state, cp = campaignPlayer(s, s.campaign);
	const p = playerAtHQ(w, outcome, scenarios);
	p.core = p.core.map((c): CoreUnit => "onMap" in c ? c : { reserve: toHQ(w, c) });
	const home = new Set(p.core.map((c) => "onMap" in c ? c.onMap : -1));
	const units = s.units.map((u) => home.has(u.id) ? { id: u.id, eqid: u.eqid, owner: u.owner, row: -1, col: -1, ...toHQ(w, { onMap: u.id }) } : u);
	return { ...s, units, players: s.players.map((x, i) => i === cp ? p : x), campaign: next };
}

//The campaign player at its scenario's end (Game.continueCampaign, Player.setPlayerToHQ): the outcome's
//prestige, the scenario in its dossier, no transports, support or prestige by turn, its lost units out
//of its core list (the others as they are, for the caller to send to HQ)
function playerAtHQ(w: World, outcome: ScenarioOutcome, scenarios: CampaignScenarioData[]): PlayerState {
	const s = w.state, played = scenarios[s.campaign.scenario];
	const p = structuredClone(s.players[campaignPlayer(s, s.campaign)]);
	p.prestige += played.outcome[outcome].prestige;
	if (!p.dossier.outcomes) p.dossier = newDossier();
	p.dossier.outcomes[outcome].push(w.data.name);
	Object.assign(p, { supportCountries: [], prestigePerTurn: [], airTransports: 0, navalTransports: 0 });
	p.core = p.core.filter((c) => !("lost" in c));
	return p;
}

//The countries whose equipment a player's core units need, by country index as the players have
//theirs (Equipment.addPlayersEquipment): a unit's and its transport's, by the equipment's file when the
//table knows the unit, else by the unit's flag (a scenario's own units don't always fly their
//equipment's country). A scenario loads them beside its players' (#182): a supporting country's unit
//made a core unit plays on in scenarios that country isn't in
export function coreCountries(p: PlayerState, units: readonly UnitState[], equipment: EquipmentTable): number[] {
	const countries = new Set<number>();
	const add = (eqid: number, flag: number) => {
		const c = equipment[eqid] !== undefined ? +equipment[eqid].country - 1 : flag - 1;
		if (c >= 0) countries.add(c);
	};
	for (const c of p.core) {
		const u = "onMap" in c ? units.find((x) => x.id === c.onMap) : "reserve" in c ? c.reserve : c.lost;
		if (u === undefined) continue;
		add(u.eqid, u.flag);
		if (u.transport !== null) add(u.transport.eqid, u.flag);
	}
	return [...countries];
}

//A core unit at HQ: off its transport and carrier, its turn's flags clear, back to full strength (an
//overstrength one keeps it), ammo, fuel and points, no entrenchment
function toHQ(w: World, c: CoreUnit): OffMapUnit {
	const u = "onMap" in c ? offMap(w.state.units[w.index.get(c.onMap)]) : structuredClone((c as { reserve: OffMapUnit }).reserve);
	const e = w.equipment[u.eqid];
	Object.assign(u, { isMounted: false, carrier: 0, hasMoved: false, hasFired: false, hasResupplied: false,
		strength: Math.max(u.strength, 10), ammo: e.ammo, fuel: e.fuel, moveLeft: e.movpoints, entrenchment: 0, hits: 0 });
	if (u.transport !== null && w.equipment[u.transport.eqid] !== undefined)
		Object.assign(u.transport, { ammo: w.equipment[u.transport.eqid].ammo, fuel: w.equipment[u.transport.eqid].fuel });
	return u;
}
