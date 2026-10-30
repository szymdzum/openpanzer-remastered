/**
 * AI - the computer player as a controller: its purchases, its deployment and a plan of its turn
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Command } from "./command";
import { type AIConfig, movMethod, unitClass } from "./tables";
import { nextRandom, type RngStream } from "./random";
import { attackCells, attackableUnit } from "./attack";
import { type AIPlan, attackPotential, attackScore, cellScore, findFreed, objectiveScore, type Scorer, standingOn } from "./aiscore";
import type { Controller, Played } from "./controller";
import { deploymentHexes } from "./deployment";
import { adjacent, distance } from "./geometry";
import type { GameEvent } from "./events";
import { moveRange } from "./movement";
import { check, step } from "./step";
import { canReinforce, canResupply, reinforceValue } from "./supply";
import { costPerStrength, unitCost } from "./costs";
import type { MoveCell, Position, UnitId, UnitState, World } from "./types";
import { canMount, isAir, isGround, isSea, isTransportable, unitUsesFuel } from "./units";
import { groundUnitAt, hexIndex, onMap, sideOf, unitData } from "./world";
import { seesUnit } from "./sight";

export interface AIControllerOptions {
	config?: AIConfig;	//the settings of the rules the game plays by (w.rules.ai) when not given
}

/**
 * At its turn's start the AI buys and deploys, then plans the whole turn at once on the state as it is
 * (#94 kept: before its reinforcements arrive) and plays the plan's commands one by one, whatever
 * happened in between: `step` refuses a move onto a hex the unit that was to leave still holds (#74,
 * the move failed) and an attack whose target is out of range by then (Game skipped it). A mount comes
 * right before a move only its transport makes (#82).
 */
export function aiController(player: number, options: AIControllerOptions = {}): Controller {
	const configOf = (w: World): AIConfig => options.config || w.rules.ai.config;
	let queue: Command[] = [];
	//Reinforcements get the prestige left after the purchases (#21: the original took it before them and
	//spent the same prestige twice)
	let prestigeLeft = 0;
	return {
		player,
		join(w) {
			prestigeLeft = w.state.players[player].prestige;
			return { world: w, commands: [], events: [], view: [] };
		},
		startTurn(w) {
			const played = buyAndDeploy(w, player, configOf(w));
			prestigeLeft = played.world.state.players[player].prestige;
			return played;
		},
		plan(w) {
			const planned = planTurn(w, player, configOf(w), prestigeLeft);
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

//The side attacks while it has more objectives still to take than the enemy: the side holding more wins
//at the turn limit, so holding what it has isn't enough (#231). An attacker that has taken enough to
//lead defends what it holds; the defender that lost the lead attacks to win it back.
function isAttacker(w: World, side: number): boolean {
	return w.state.objectives[side].length > w.state.objectives[~side & 1].length;
}

//The share of the entrenchment bonus its units keep away from the enemy: the rules' for a side that
//attacks, all of it for one that defends (#235).
const stayShareOf = (w: World, side: number): number => isAttacker(w, side) ? w.rules.ai.attackerEntrenchment : 1;

//The AI's stream (its state is null when the state's streams aren't seeded: Math.random). The purchases
//and the scores draw from it, and the order of the draws is behavior.
function aiStream(w: World): RngStream {
	return { state: w.state.rng === null ? null : w.state.rng.ai };
}

function withAIStream(w: World, rng: RngStream): World {
	const s = w.state;
	if (s.rng === null || s.rng.ai === rng.state) return w;
	return { ...w, state: { ...s, rng: { game: s.rng.game, ai: rng.state } } };
}

//Plays the purchases from the last of each list, air first, a unit with the transport it was bought
//with (#224); then deploys each undeployed core unit on the first deployment hex of its side it fits
//on, hex by hex. The redraw after is the view's, from the events.
function buyAndDeploy(w: World, player: number, config: AIConfig): Played {
	const rng = aiStream(w);
	const bought = purchases(w, player, config, rng);
	let world = withAIStream(w, rng);
	const commands: Command[] = [], events: GameEvent[] = [];
	const play = (cmd: Command) => {
		const r = step(world, cmd);
		if (!r.ok) return;
		world = r.world;
		commands.push(cmd);
		events.push(...r.events);
	};
	for (const b of bought) play({ type: "buy", eqid: b.eqid, transport: b.transport });
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

//The deployment hexes of the side's players, row by row (in the remaster's rules a side with none
//deploys on its own towns, #302).
function deployHexes(w: World, side: number): Position[] {
	const cols = w.state.map.cols;
	return deploymentHexes(w, side).map((hex) => ({ row: Math.floor(hex / cols), col: hex % cols }));
}

//What it buys with the prestige over its reserve, a share of it for air units (none under 300), in
//the order it buys.
function purchases(w: World, player: number, config: AIConfig, rng: RngStream): Purchase[] {
	let prestige = w.state.players[player].prestige;
	if (prestige <= config.prestigeReserve) return [];
	const lists = countryLists(w, w.state.players[player].country + 1);
	prestige -= config.prestigeReserve;
	let airPrestige = prestige * config.airPrestigeRatio;
	if (airPrestige < 300) airPrestige = 0;
	prestige -= airPrestige;
	const year = new Date(w.state.scenario.date).getFullYear();
	const buying: Buying = { w, listOf: lists, transports: groundTransports(w, w.state.players[player].country + 1), rng, config, year };
	const air = buyUnits(buying, airPrestige, config.airPurchaseClasses);
	const ground = buyUnits(buying, prestige, config.groundPurchaseClasses);
	return [...air.reverse(), ...ground.reverse()];
}

//The country's equipment lists by unit class, copied for one purchase: buyUnits drops what it can't
//buy from a copy, the state's lists stay whole (#22: the original cut them for the rest of the
//session). A class the country has no list of gives an empty one each time (#101), as the original.
function countryLists(w: World, country: number): (uclass: number) => number[] {
	const indexes = w.state.equipment.indexes[country];
	const classes = indexes !== undefined ? indexes.unitclass : undefined;
	const copies = new Map<number, number[]>();
	return (uclass) => {
		let list = copies.get(uclass);
		if (list !== undefined) return list;
		const original = classes !== undefined ? classes[String(uclass)] : undefined;
		if (original === undefined) return [];
		list = original.slice();
		copies.set(uclass, list);
		return list;
	};
}

interface Purchase {
	eqid: number;
	transport: number;	//-1: none
}

interface Buying {
	w: World;
	listOf: (uclass: number) => number[];
	transports: readonly number[];	//the country's ground transports
	rng: RngStream;
	config: AIConfig;
	year: number;
}

//The state's own list, not a copy: the AI only reads it.
function groundTransports(w: World, country: number): readonly number[] {
	const indexes = w.state.equipment.indexes[country];
	const list = indexes !== undefined ? indexes.unitclass[String(unitClass.groundTransport)] : undefined;
	return list !== undefined ? list : [];
}

//Random affordable units of the classes in classList, cycling through the list, until the prestige
//runs out or a whole cycle ends on a class with nothing to buy. A unit a transport can carry gets
//one, as a person buys it (#224).
function buyUnits(b: Buying, prestige: number, classList: number[]): Purchase[] {
	const units: Purchase[] = [];
	let classIndex = 0, noneFound = false;
	while (prestige > 0) {
		if (classIndex > classList.length - 1) {
			if (noneFound) break;
			classIndex = 0;
		}
		const list = b.listOf(classList[classIndex]);
		for (let i = list.length - 1; i >= 0; i--)
			if (!canBuy(b.w, list[i], prestige, b.config, b.year)) list.splice(i, 1);
		noneFound = list.length === 0;
		if (!noneFound) {
			const eqid = list[Math.floor(nextRandom(b.rng) * list.length)];
			prestige -= unitCost(b.w, eqid);
			const transport = pickTransport(b, eqid, prestige);
			prestige -= unitCost(b.w, -1, transport);
			units.push({ eqid, transport });
		}
		classIndex++;
	}
	return units;
}

//A random ground transport that carries the unit, is in production (yearavailable to yearexpired) and
//fits the prestige left; -1 when no transport carries the unit or none fits.
function pickTransport(b: Buying, eqid: number, prestige: number): number {
	if (!isTransportable(b.w, eqid)) return -1;
	const weight = b.w.equipment[eqid].groundweight;
	const fitting = b.transports.filter((t) => {
		const e = b.w.equipment[t];
		return e !== undefined && (e.groundweight & weight) !== 0 && e.yearavailable <= b.year && e.yearexpired >= b.year
			&& unitCost(b.w, -1, t) <= prestige;
	});
	return fitting.length === 0 ? -1 : fitting[Math.floor(nextRandom(b.rng) * fitting.length)];
}

//Whether it buys it now; if not, buyUnits drops it from this purchase's list: too dear for what is
//left, outside its price range, deep naval, not yet built (out of service too, where the shop is checked).
function canBuy(w: World, eqid: number, prestige: number, config: AIConfig, year: number): boolean {
	const cost = unitCost(w, eqid), e = w.equipment[eqid];
	return !(cost > prestige || cost > config.maxUnitCost || cost < config.minUnitCost || e.movmethod === movMethod.deepnaval
		|| e.yearavailable > year || (w.rules.checksTheShop && e.yearexpired < year));
}

interface AIUnit {
	u: UnitState;
	noAttack: boolean;
	noMove: boolean;
	noReinforce: boolean;
	noResupply: boolean;
	didAttack: boolean;
	didMove: boolean;
	didResupplyReinforce: boolean;
	didMount: boolean;
	newPosition: Position | null;
}

interface Planning {
	s: Scorer;
	queue: Command[];
	prestigeLeft: number;
	stayShare: number;
}

/** A turn's classic plan: its commands in order, the world with the AI stream after its draws, the prestige left. */
export interface ClassicPlan {
	world: World;
	queue: Command[];
	prestigeLeft: number;
}

const NO_UNITS: ReadonlySet<UnitId> = new Set();

/**
 * The classic plan of the player's turn, `held` left out: the units another planner orders (the remastered AI's
 * staff). Artillery, fortifications, air and naval combat units go first, each given another pass (reinforce,
 * resupply, move, attack) until it can do nothing more. A unit that did nothing in its first pass scores its moves
 * again in the next (new draws: it may move then).
 */
export function planTurn(w: World, player: number, config: AIConfig, prestigeLeft: number, held = NO_UNITS): ClassicPlan {
	const rng = aiStream(w), side = w.state.players[player].side;
	const plan: AIPlan = { enemyUnits: new Map(), takenPositions: [], freedPositions: [], objectives: w.state.objectives[side] };
	const t: Planning = { s: { w, player, config, plan, rng }, queue: [], prestigeLeft, stayShare: stayShareOf(w, side) };
	const units: AIUnit[] = [];
	for (const u of w.state.units) {
		if (u.owner !== player || held.has(u.id)) continue;
		const a: AIUnit = { u, noAttack: false, noMove: false, noReinforce: false, noResupply: false, didAttack: false, didMove: false,
			didResupplyReinforce: false, didMount: false, newPosition: null };
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

function resupplyUnit(t: Planning, a: AIUnit) {
	const w = t.s.w, u = a.u;
	if (!canResupply(w, u) || a.didResupplyReinforce || a.didAttack || a.didMove) {
		a.noResupply = true;
	} else if ((a.noAttack && a.noMove) || isLow(t.s.config, w, u)) {
		t.queue.push({ type: "resupply", unit: u.id });
		a.didResupplyReinforce = true;
	}
}

//Its own ammo and fuel, not its transport's.
function isLow(config: AIConfig, w: World, u: UnitState): boolean {
	return u.ammo < config.minAmmo || (unitUsesFuel(w, u) && u.fuel < config.minFuel);
}

//The hex it takes and the one it leaves count for the units of its kind only, air or ground (#74,
//#225). A unit moved in its transport can't fire that turn (#82).
function moveUnit(t: Planning, a: AIUnit) {
	const s = t.s, u = a.u;
	const moving = !(a.didMove || a.didResupplyReinforce);
	const cells = moving ? moveRange(s.w, u) : [];
	const mounted = moving ? mountedCells(s.w, u, cells) : [];
	const to = cells.length + mounted.length === 0 ? null : bestMove(s, u, cells, mounted, t.stayShare);
	if (to === null) {
		a.noMove = true;
		return;
	}
	const plan = s.plan, air = isAir(s.w, u);
	plan.takenPositions.push({ ...to.cell, air });
	const freed = findFreed(plan, to.cell, air);
	if (freed >= 0) plan.freedPositions.splice(freed, 1);
	plan.freedPositions.push({ row: u.row, col: u.col, air });
	if (to.mounted) t.queue.push({ type: "mount", unit: u.id });
	t.queue.push({ type: "move", unit: u.id, to: to.cell });
	a.didMove = true;
	a.didMount = to.mounted;
	a.newPosition = to.cell;
}

//The hexes a ground unit reaches only in its transport (a towed gun's whole range): the AI drives its
//guns and infantry up in their trucks (#82). None for a unit without one or already mounted, and none
//next to an enemy ground unit the side sees: it would stand there in its truck until the round ends.
function mountedCells(w: World, u: UnitState, cells: MoveCell[]): MoveCell[] {
	if (u.isMounted || !canMount(w, u)) return [];
	return moveRange(w, { ...u, isMounted: true }).filter((m) => !cells.some((c) => c.row === m.row && c.col === m.col)
		&& !nextToSeenEnemy(w, u, m));
}

//Within this distance of a seen enemy a unit is in contact: what one move of the enemy reaches.
const CONTACT = 3;

function nearSeenEnemy(w: World, u: UnitState, range: number): boolean {
	const side = sideOf(w, u);
	return w.state.units.some((other) => sideOf(w, other) !== side && distance(u.row, u.col, other.row, other.col) <= range
		&& seesUnit(w, other, side));
}

function nextToSeenEnemy(w: World, u: UnitState, cell: Position): boolean {
	const side = sideOf(w, u);
	return adjacent(cell.row, cell.col).some((c) => {
		if (!onMap(w, c.row, c.col)) return false;
		const hex = hexIndex(w, c.row, c.col), other = groundUnitAt(w, hex);
		return other !== null && sideOf(w, other) !== side && seesUnit(w, other, side);
	});
}

//The best scored hex of the move range, then of the hexes only its transport reaches (mounted); null
//when none beats staying. The objective it nears counts less for an air unit (0.3) and not for a ship.
//A hex under -2000 (taken) skips attackPotential, so its draws too. A hex is scored for the unit
//standing there, not its transport: it gets off it at the round's end.
function bestMove(s: Scorer, u: UnitState, cells: MoveCell[], mounted: MoveCell[], stayShare: number)
	: { cell: Position; mounted: boolean } | null {
	let best = stayScore(s, u, stayShare);
	const nearing = isSea(s.w, u) ? 0 : isAir(s.w, u) ? 0.3 : 1;
	let bestCell: MoveCell | null = null;
	for (const c of [...cells, ...mounted]) {
		const objective = nearing === 0 ? 0 : nearing === 1 ? objectiveScore(s, c).score : objectiveScore(s, c).score * nearing;
		let score = cellScore(s, u, c, c.canMove) + objective;
		if (score < -2000) continue;
		score += attackPotential(s, u, c);
		if (score > best) {
			bestCell = c;
			best = score;
		}
	}
	return bestCell === null ? null : { cell: { row: bestCell.row, col: bestCell.col }, mounted: mounted.includes(bestCell) };
}

//Away from the enemy an attacker's unit keeps only a share of its entrenchment's worth: the holes it
//dug far from the front don't hold it back (#235); in contact it keeps them all, to hold the line it
//reached.
function stayScore(s: Scorer, u: UnitState, stayShare: number): number {
	const pos = { row: u.row, col: u.col };
	let score = cellScore(s, u, pos, true);
	if (isGround(s.w, u)) score += objectiveScore(s, pos).score;
	const share = stayShare === 1 || nearSeenEnemy(s.w, u, CONTACT) ? 1 : stayShare;
	score += u.entrenchment * s.config.entrenchmentScore * share;
	return score + attackPotential(s, u, pos);
}

function attackUnit(t: Planning, a: AIUnit) {
	const s = t.s, u = a.u;
	if (!mayAttack(a)) {
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

function mayAttack(a: AIUnit): boolean {
	return !(a.u.hasFired || a.didAttack || a.didResupplyReinforce || a.didMount);
}

function expectKills(plan: AIPlan, target: UnitState, kills: number) {
	let enemy = plan.enemyUnits.get(target.id);
	if (enemy === undefined) plan.enemyUnits.set(target.id, enemy = { isAttacked: false, losses: 0, isKilled: false });
	enemy.isAttacked = true;
	enemy.losses += kills;
	if (enemy.losses > target.strength) enemy.isKilled = true;
}

//The best scored target, if the attack beats the losses its class accepts; from an objective it accepts
//50 more. Its expected kills count for the next attackers (expectKills).
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
