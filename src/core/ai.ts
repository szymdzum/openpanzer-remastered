/**
 * AI - the computer player as a controller (controller.ts) on the core: src/ai.ts's purchases,
 * deployment and plan, answering in commands
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * At its turn's start the AI buys units with the prestige over its reserve and deploys its core
 * units, then plans its whole turn at once on the state as it is (#94 kept: before its
 * reinforcements arrive), unit by unit, each scored hex and attack drawing from its own stream
 * (state.rng.ai, D8) in the old order. Its plan is a queue of the commands it then plays one by one,
 * whatever happened in between: the old AI's actions, as Game played them (processAction):
 * - a move to where the plan said, along its move range then (a hex its own unit didn't leave in the
 *   end is taken over, #74 kept);
 * - an attack, which the step refuses when the target is out of range by then (Game skipped it);
 * - a resupply or a reinforcement.
 * It never mounts (#82 kept). Kept too: the reinforcement budget is the prestige before the purchases
 * (#21), the purchases remove from the equipment lists for good (#22: the lists are in the state, D9),
 * the attack scores count the hidden units' support fire (#17), and the objectives are scored in the
 * order of the side's list (D7, #141's order after an undo included).
 */

import type { Command } from "../commands";
import { type AIConfig, aiDefaultConfig, movMethod, unitClass } from "../prototypes";
import { nextRandom, type RngStream } from "../rng";
import { attackCells, attackableUnit } from "./attack";
import { type AIPlan, attackPotential, attackScore, cellScore, findFreed, objectiveScore, type Scorer, standingOn } from "./aiscore";
import type { Controller, Played } from "./controller";
import { playerAt } from "./draft";
import type { GameEvent } from "./events";
import { moveRange } from "./movement";
import { check, step } from "./step";
import { canReinforce, canResupply, reinforceValue } from "./supply";
import { costPerStrength, unitCost } from "./costs";
import type { GameState, MoveCell, Position, UnitState, World } from "./types";
import { isAir, isGround, isSea, unitUsesFuel } from "./units";
import { hexIndex, unitData } from "./world";

export interface AIOptions {
	config?: AIConfig;	//aiDefaultConfig, the bundle's
}

//The computer player of player id
export function aiController(player: number, options: AIOptions = {}): Controller {
	const config = options.config || aiDefaultConfig;
	let queue: Command[] = [];
	//The prestige left for reinforcements: the player's when the AI was made, then at each turn's start
	let prestigeLeft = 0;
	return {
		player,
		join(w) {
			prestigeLeft = w.state.players[player].prestige;
			return { world: w, commands: [], events: [], view: [] };
		},
		startTurn(w) {
			prestigeLeft = w.state.players[player].prestige;
			return buyAndDeploy(w, player, config);
		},
		plan(w) {
			const planned = planTurn(w, player, config, prestigeLeft);
			queue = planned.queue;
			prestigeLeft = planned.prestigeLeft;
			return planned.world;
		},
		next() {
			const cmd = queue.shift();
			return cmd === undefined ? null : { command: cmd };
		},
	};
}

//The AI's stream where the state has it (null: the state's streams aren't seeded, Math.random)
function aiStream(w: World): RngStream {
	return { state: w.state.rng === null ? null : w.state.rng.ai };
}

//The world with the AI's stream where rng left it
function withAIStream(w: World, rng: RngStream): World {
	const s = w.state;
	if (s.rng === null || s.rng.ai === rng.state) return w;
	return { ...w, state: { ...s, rng: { game: s.rng.game, ai: rng.state } } };
}

//AI.startTurn: the purchases, bought from the last one of each list, air first; then each undeployed
//core unit on the first deployment hex of its side it fits on, hex by hex. The commands are the ones
//the old AI's calls amount to (Player.buyUnit with no transport, Map.deployPlayerUnit where it
//succeeded); the redraw it asked for after (AI.onUnitsDeployed) is the view's, from the events
function buyAndDeploy(w: World, player: number, config: AIConfig): Played {
	const rng = aiStream(w);
	const bought = purchases(w, player, config, rng);
	let world = withAIStream(bought.world, rng);
	const commands: Command[] = [], events: GameEvent[] = [];
	const play = (cmd: Command) => {
		const r = step(world, cmd);
		if (!r.ok) return;
		world = r.world;
		commands.push(cmd);
		events.push(...r.events);
	};
	for (const eqid of bought.units) play({ type: "buy", eqid, transport: -1 });
	const side = world.state.players[player].side;
	for (const to of deployHexes(world, side)) {
		const core = world.state.players[player].core;
		for (let index = 0; index < core.length; index++) {
			const cmd: Command = { type: "deploy", index, to };
			if ("reserve" in world.state.players[player].core[index] && check(world, cmd) === null) play(cmd);
		}
	}
	return { world, commands, events, view: [] };
}

//Map.getDeployHexes: the deployment hexes of the side's players, row by row
function deployHexes(w: World, side: number): Position[] {
	const cells: Position[] = [];
	const { rows, cols } = w.state.map;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const deployment = w.data.hexes[row * cols + col].deployment;
			if (deployment > -1 && playerAt(w, deployment).side === side) cells.push({ row, col });
		}
	return cells;
}

//What the AI buys with the prestige over its reserve, part of it for air units (none under 300), in
//the order it buys them; the world with the equipment lists as the choosing left them (#22)
function purchases(w: World, player: number, config: AIConfig, rng: RngStream): { world: World; units: number[] } {
	let prestige = w.state.players[player].prestige;
	if (prestige <= config.prestigeReserve) return { world: w, units: [] };
	const lists = countryLists(w, w.state.players[player].country + 1);
	prestige -= config.prestigeReserve;
	let airPrestige = prestige * config.airPrestigeRatio;
	if (airPrestige < 300) airPrestige = 0;
	prestige -= airPrestige;
	const year = new Date(w.state.scenario.date).getFullYear();
	const air = buyUnits(w, lists.of, rng, airPrestige, config.airPurchaseClasses, config, year);
	const ground = buyUnits(w, lists.of, rng, prestige, config.groundPurchaseClasses, config, year);
	return { world: lists.written(w), units: [...air.reverse(), ...ground.reverse()] };
}

//The country's equipment lists by unit class, as buyUnits removes from them: a list is copied the first
//time, the state's stays as it was. A class the country has no list of gives an empty one each time
//(#101), as Equipment.getCountryEquipmentByClass did
function countryLists(w: World, country: number) {
	const indexes = w.state.equipment.indexes[country];
	const classes = indexes !== undefined ? indexes.unitclass : undefined;
	const changed = new Map<string, number[]>();
	return {
		of: (uclass: number): number[] => {
			const key = String(uclass);
			let list = changed.get(key);
			if (list !== undefined) return list;
			const original = classes !== undefined ? classes[key] : undefined;
			if (original === undefined) return [];
			list = original.slice();
			changed.set(key, list);
			return list;
		},
		//The world with the lists changed, the keys in their order (the save's)
		written: (world: World): World => {
			if (changed.size === 0) return world;
			const s: GameState = world.state;
			const unitclass = { ...classes };
			for (const [k, list] of changed) unitclass[k] = list;
			const equipment = { indexes: { ...s.equipment.indexes, [country]: { ...indexes, unitclass } } };
			return { ...world, state: { ...s, equipment } };
		},
	};
}

//AI buyUnits: random affordable units of the classes in classList, cycling through the list, until
//the prestige runs out or a whole cycle ends on a class with nothing to buy
function buyUnits(w: World, listOf: (uclass: number) => number[], rng: RngStream, prestige: number, classList: number[],
	config: AIConfig, year: number): number[] {
	const units: number[] = [];
	let classIndex = 0, noneFound = false;
	while (prestige > 0) {
		if (classIndex > classList.length - 1) {
			if (noneFound) break;
			classIndex = 0;
		}
		const list = listOf(classList[classIndex]);
		for (let i = list.length - 1; i >= 0; i--)
			if (!canBuy(w, list[i], prestige, config, year)) list.splice(i, 1);
		noneFound = list.length === 0;
		if (!noneFound) {
			const eqid = list[Math.floor(nextRandom(rng) * list.length)];
			prestige -= unitCost(w, eqid);
			units.push(eqid);
		}
		classIndex++;
	}
	return units;
}

//What the AI can buy now; the rest leaves the list for good (#22): too dear for what is left, outside
//its price range, deep naval, not yet built
function canBuy(w: World, eqid: number, prestige: number, config: AIConfig, year: number): boolean {
	const cost = unitCost(w, eqid), e = w.equipment[eqid];
	return !(cost > prestige || cost > config.maxUnitCost || cost < config.minUnitCost || e.movmethod === movMethod.deepnaval
		|| e.yearavailable > year);
}

//What the plan knows of one of the AI's units during the turn: what it did and what it can't do
interface AIUnit {
	u: UnitState;
	noAttack: boolean;
	noMove: boolean;
	noReinforce: boolean;
	noResupply: boolean;
	didAttack: boolean;
	didMove: boolean;
	didResupplyReinforce: boolean;
	newPosition: Position | null;
}

interface Planning {
	s: Scorer;
	queue: Command[];
	prestigeLeft: number;
}

//AI.planTurn: the AI's units, artillery, fortifications, air and naval combat units first, each given
//another pass until it can do nothing more. A pass reinforces, resupplies, moves and attacks; a unit
//that did nothing in its first pass scores its moves again in the next (new draws: it may move then)
function planTurn(w: World, player: number, config: AIConfig, prestigeLeft: number) {
	const rng = aiStream(w), side = w.state.players[player].side;
	const plan: AIPlan = { enemyUnits: new Map(), takenPositions: [], freedPositions: [], objectives: w.state.objectives[side] };
	const t: Planning = { s: { w, player, config, plan, rng }, queue: [], prestigeLeft };
	const units: AIUnit[] = [];
	for (const u of w.state.units) {
		if (u.owner !== player) continue;
		const a: AIUnit = { u, noAttack: false, noMove: false, noReinforce: false, noResupply: false, didAttack: false, didMove: false,
			didResupplyReinforce: false, newPosition: null };
		if (actsFirst(w, u)) units.unshift(a);
		else units.push(a);
	}
	while (units.length > 0) {
		const a = units[0];
		reinforceUnit(t, a);
		resupplyUnit(t, a);
		moveUnit(t, a);
		attackUnit(t, a);
		if (a.noReinforce && a.noResupply && a.noAttack && a.noMove) units.shift();
	}
	return { world: withAIStream(w, rng), queue: t.queue, prestigeLeft: t.prestigeLeft };
}

function actsFirst(w: World, u: UnitState): boolean {
	const uclass = unitData(w, u).uclass;
	return uclass === unitClass.artillery || uclass === unitClass.fortification
		|| (isAir(w, u) && uclass !== unitClass.airTransport) || (isSea(w, u) && uclass !== unitClass.navalTransport);
}

//A weak unit, or one that can't move or attack anymore, reinforced while there is prestige left
function reinforceUnit(t: Planning, a: AIUnit) {
	if (!mayReinforce(t, a)) {
		a.noReinforce = true;
		return;
	}
	const idle = a.noAttack && a.noMove;
	if ((idle || a.u.strength < t.s.config.minReinforceStrength) && reinforce(t, a)) return;
	if (idle) a.noReinforce = true;
}

function mayReinforce(t: Planning, a: AIUnit): boolean {
	const w = t.s.w;
	return !(!canReinforce(w, a.u) || a.didResupplyReinforce || a.didAttack || a.didMove
		|| unitData(w, a.u).uclass === unitClass.fortification || t.prestigeLeft <= 0);
}

//As much strength as the prestige left pays for, up to what the hex gives
function reinforce(t: Planning, a: AIUnit): boolean {
	const w = t.s.w, u = a.u;
	const perStrength = costPerStrength(w, u), value = reinforceValue(w, u);
	let strength = (t.prestigeLeft / perStrength) >> 0;
	if (strength > value) strength = value;
	if (!(value > 0 && strength > 0)) return false;
	t.queue.push({ type: "reinforce", unit: u.id });
	t.prestigeLeft -= strength * perStrength;
	return (a.didResupplyReinforce = true);
}

//A unit low on ammo or fuel, or one that can't move or attack anymore, resupplied
function resupplyUnit(t: Planning, a: AIUnit) {
	const w = t.s.w, u = a.u;
	if (!canResupply(w, u) || a.didResupplyReinforce || a.didAttack || a.didMove) {
		a.noResupply = true;
	} else if ((a.noAttack && a.noMove) || isLow(t.s.config, w, u)) {
		t.queue.push({ type: "resupply", unit: u.id });
		a.didResupplyReinforce = true;
	}
}

//The unit's own ammo and fuel (not its transport's) under the AI's thresholds
function isLow(config: AIConfig, w: World, u: UnitState): boolean {
	return u.ammo < config.minAmmo || (unitUsesFuel(w, u) && u.fuel < config.minFuel);
}

//The unit to the best scored hex of its move range, if it beats where it stands: the hex taken, the
//one it leaves freed
function moveUnit(t: Planning, a: AIUnit) {
	const s = t.s, u = a.u;
	const cells = a.didMove || a.didResupplyReinforce ? [] : moveRange(s.w, u);
	const to = cells.length === 0 ? null : bestMove(s, u, cells);
	if (to === null) {
		a.noMove = true;
		return;
	}
	const plan = s.plan;
	plan.takenPositions.push(to);
	const freed = findFreed(plan, to);
	if (freed >= 0) plan.freedPositions.splice(freed, 1);
	plan.freedPositions.push({ row: u.row, col: u.col });
	t.queue.push({ type: "move", unit: u.id, to });
	a.didMove = true;
	a.newPosition = to;
}

//The best scored hex of the move range, null when none beats staying: where it stands scores with its
//entrenchment and, for a ground unit, its objective; a hex of the range with the objective it nears
//(less for an air unit, none for a ship), the cell's own score first: a taken hex isn't scored further
function bestMove(s: Scorer, u: UnitState, cells: MoveCell[]): Position | null {
	let best = stayScore(s, u);
	const nearing = isSea(s.w, u) ? 0 : isAir(s.w, u) ? 0.3 : 1;
	let bestCell: MoveCell | null = null;
	for (const c of cells) {
		const objective = nearing === 0 ? 0 : nearing === 1 ? objectiveScore(s, c).score : objectiveScore(s, c).score * nearing;
		let score = cellScore(s, u, c, c.canMove) + objective;
		if (score < -2000) continue;
		score += attackPotential(s, u, c);
		if (score > best) {
			bestCell = c;
			best = score;
		}
	}
	return bestCell === null ? null : { row: bestCell.row, col: bestCell.col };
}

//Staying where it stands: the hex, for a ground unit its objective, its entrenchment, its attacks
function stayScore(s: Scorer, u: UnitState): number {
	const pos = { row: u.row, col: u.col };
	let score = cellScore(s, u, pos, true);
	if (isGround(s.w, u)) score += objectiveScore(s, pos).score;
	score += u.entrenchment * s.config.entrenchmentScore;
	return score + attackPotential(s, u, pos);
}

//The best scored target from where the unit stands or was ordered to move to, if the attack beats its
//class's losses (less eager from an objective). Its expected kills count for the next attackers
function attackUnit(t: Planning, a: AIUnit) {
	const s = t.s, u = a.u;
	if (u.hasFired || a.didAttack || a.didResupplyReinforce) {
		a.noAttack = true;
		return;
	}
	const target = bestTarget(s, a.didMove && a.newPosition !== null ? standingOn(u, a.newPosition) : u);
	if (target === null) {
		if (a.noMove || a.didMove) a.noAttack = true;
		return;
	}
	expectKills(s.plan, target.unit, target.kills);
	t.queue.push({ type: "attack", unit: u.id, target: target.unit.id });
	a.didAttack = true;
}

//The target attacked, with the kills expected so far: past its strength, it counts as killed
function expectKills(plan: AIPlan, target: UnitState, kills: number) {
	let enemy = plan.enemyUnits.get(target.id);
	if (enemy === undefined) plan.enemyUnits.set(target.id, enemy = { isAttacked: false, losses: 0, isKilled: false });
	enemy.isAttacked = true;
	enemy.losses += kills;
	if (enemy.losses > target.strength) enemy.isKilled = true;
}

function bestTarget(s: Scorer, from: UnitState): { unit: UnitState; kills: number } | null {
	const w = s.w;
	let best = -(s.config.attackLossesThreshold * s.config.unitClassLossCost[unitData(w, from).uclass]);
	if (w.state.map.hexes[hexIndex(w, from.row, from.col)].victorySide !== -1) best -= 50;
	let target: { unit: UnitState; kills: number } | null = null;
	for (const c of attackCells(w, from)) {
		const r = attackScore(s, from, c, false);
		if (r.score > best) {
			best = r.score;
			target = { unit: attackableUnit(w, from, hexIndex(w, c.row, c.col), false), kills: r.kills };
		}
	}
	return target;
}
