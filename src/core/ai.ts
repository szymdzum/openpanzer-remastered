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
 * - a move to where the plan said, along its move range then, which the step refuses when the unit
 *   that was to leave the hex is still there (#74: its move failed);
 * - an attack, which the step refuses when the target is out of range by then (Game skipped it);
 * - a resupply or a reinforcement;
 * - a mount, right before a move only its transport makes (#82).
 * The reinforcement budget is the prestige left after the purchases (#21). Kept: the attack scores
 * count the hidden units' support fire (#17), and the objectives are scored in the order of the side's
 * list (D7, #141's order after an undo included).
 */

import type { Command } from "../commands";
import { type AIConfig, movMethod, unitClass } from "../prototypes";
import { nextRandom, type RngStream } from "../rng";
import { attackCells, attackableUnit } from "./attack";
import { type AIPlan, attackPotential, attackScore, cellScore, findFreed, objectiveScore, type Scorer, standingOn } from "./aiscore";
import type { Controller, Played } from "./controller";
import { playerAt } from "./draft";
import { adjacent, distance } from "./geometry";
import type { GameEvent } from "./events";
import { moveRange } from "./movement";
import { check, step } from "./step";
import { canReinforce, canResupply, reinforceValue } from "./supply";
import { costPerStrength, unitCost } from "./costs";
import type { MoveCell, Position, UnitState, World } from "./types";
import { canMount, isAir, isGround, isSea, isTransportable, unitUsesFuel } from "./units";
import { groundUnitAt, hexIndex, isSpotted, onMap, sideOf, unitData } from "./world";

export interface AIControllerOptions {
	config?: AIConfig;	//the settings of the rules the game plays by (w.rules.ai) when not given
}

//The computer player of player id
export function aiController(player: number, options: AIControllerOptions = {}): Controller {
	const configOf = (w: World): AIConfig => options.config || w.rules.ai.config;
	let queue: Command[] = [];
	//The prestige left for reinforcements: the player's when the AI was made, then after each turn's
	//purchases (#21: the old AI took it before them, and spent the same prestige twice)
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

//The side attacks while it has more objectives still to take than the enemy: it can't win at the turn
//limit by holding what it has (the side holding more objectives wins there, #231), so it must move. The
//roles follow the game: an attacker that has taken enough to lead defends what it holds, and the
//defender that has lost the lead attacks to win it back
export function isAttacker(w: World, side: number): boolean {
	return w.state.objectives[side].length > w.state.objectives[~side & 1].length;
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
//the old AI's calls amount to (Player.buyUnit, Map.deployPlayerUnit where it succeeded), a unit with
//the transport it was bought with (#224); the redraw it asked for after (AI.onUnitsDeployed) is the
//view's, from the events
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
//the order it buys them
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

//The country's equipment lists by unit class, copied for one purchase: buyUnits drops from a copy
//what it can't buy now, the state's lists stay whole (#22: the old AI cut them for the rest of the
//session). A class the country has no list of gives an empty one each time (#101), as
//Equipment.getCountryEquipmentByClass did
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

//A unit the AI buys and its transport (-1: none)
interface Purchase {
	eqid: number;
	transport: number;
}

interface Buying {
	w: World;
	listOf: (uclass: number) => number[];
	transports: readonly number[];	//the country's ground transports
	rng: RngStream;
	config: AIConfig;
	year: number;
}

//The country's ground transports, as the state has them (the AI reads the list, it doesn't change it)
function groundTransports(w: World, country: number): readonly number[] {
	const indexes = w.state.equipment.indexes[country];
	const list = indexes !== undefined ? indexes.unitclass[String(unitClass.groundTransport)] : undefined;
	return list !== undefined ? list : [];
}

//AI buyUnits: random affordable units of the classes in classList, cycling through the list, until
//the prestige runs out or a whole cycle ends on a class with nothing to buy. A unit a transport can
//carry gets one, as a person buys it (#224)
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

//A random one of the country's ground transports that carries the unit, is built and not yet retired
//(the equipment window's), and fits the prestige left; -1 for a unit no transport carries, or none fits
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

//What the AI can buy now; the rest leaves this purchase's list: too dear for what is left, outside its
//price range, deep naval, not yet built
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
	didMount: boolean;
	newPosition: Position | null;
}

interface Planning {
	s: Scorer;
	queue: Command[];
	prestigeLeft: number;
	//The share of the bonus for staying entrenched its units keep away from the enemy: the rules' for a side
	//that attacks, all of it for one that defends (#235)
	stayShare: number;
}

//AI.planTurn: the AI's units, artillery, fortifications, air and naval combat units first, each given
//another pass until it can do nothing more. A pass reinforces, resupplies, moves and attacks; a unit
//that did nothing in its first pass scores its moves again in the next (new draws: it may move then)
function planTurn(w: World, player: number, config: AIConfig, prestigeLeft: number) {
	const rng = aiStream(w), side = w.state.players[player].side;
	const plan: AIPlan = { enemyUnits: new Map(), takenPositions: [], freedPositions: [], objectives: w.state.objectives[side] };
	const stayShare = isAttacker(w, side) ? w.rules.ai.attackerEntrenchment : 1;
	const t: Planning = { s: { w, player, config, plan, rng }, queue: [], prestigeLeft, stayShare };
	const units: AIUnit[] = [];
	for (const u of w.state.units) {
		if (u.owner !== player) continue;
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

//The unit to the best scored hex of its move range or, mounted, of its transport's, if it beats where it
//stands: the hex taken, the one it leaves freed, for the units of its kind (#74, #225). A unit moved in
//its transport can't fire that turn (#82)
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

//The hexes a ground unit reaches only in its transport (a towed gun's whole range): the PG2 AI drives
//its guns and infantry up in their trucks (#82). None for a unit without one or already moved, and not
//next to an enemy ground unit the side sees: it would stand there in its truck until the round ends
function mountedCells(w: World, u: UnitState, cells: MoveCell[]): MoveCell[] {
	if (u.isMounted || !canMount(w, u)) return [];
	return moveRange(w, { ...u, isMounted: true }).filter((m) => !cells.some((c) => c.row === m.row && c.col === m.col)
		&& !nextToSeenEnemy(w, u, m));
}

//How near a seen enemy unit an attacker's unit counts as in contact: what one move of the enemy reaches
const CONTACT = 3;

//An enemy unit the side sees within range hexes of the unit
function nearSeenEnemy(w: World, u: UnitState, range: number): boolean {
	const side = sideOf(w, u);
	return w.state.units.some((other) => sideOf(w, other) !== side && distance(u.row, u.col, other.row, other.col) <= range
		&& (isSpotted(w, hexIndex(w, other.row, other.col), side) || other.tempSpotted));
}

function nextToSeenEnemy(w: World, u: UnitState, cell: Position): boolean {
	const side = sideOf(w, u);
	return adjacent(cell.row, cell.col).some((c) => {
		if (!onMap(w, c.row, c.col)) return false;
		const hex = hexIndex(w, c.row, c.col), other = groundUnitAt(w, hex);
		return other !== null && sideOf(w, other) !== side && (isSpotted(w, hex, side) || other.tempSpotted);
	});
}

//The best scored hex of the move range, then of the hexes only its transport reaches (mounted), null
//when none beats staying: where it stands scores with its entrenchment and, for a ground unit, its
//objective; a hex with the objective it nears (less for an air unit, none for a ship), the cell's own
//score first: a taken hex isn't scored further. A hex is scored for the unit standing there, not its
//transport: it gets off it at the round's end
function bestMove(s: Scorer, u: UnitState, cells: MoveCell[], mounted: MoveCell[], stayShare: number): { cell: Position; mounted: boolean } | null {
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

//Staying where it stands: the hex, for a ground unit its objective, its entrenchment, its attacks. Away
//from the enemy an attacker's unit keeps only a share of its entrenchment's worth: the holes it dug far
//from the front don't hold it back (#235); in contact it keeps them all, to hold the line it reached
function stayScore(s: Scorer, u: UnitState, stayShare: number): number {
	const pos = { row: u.row, col: u.col };
	let score = cellScore(s, u, pos, true);
	if (isGround(s.w, u)) score += objectiveScore(s, pos).score;
	const share = stayShare === 1 || nearSeenEnemy(s.w, u, CONTACT) ? 1 : stayShare;
	score += u.entrenchment * s.config.entrenchmentScore * share;
	return score + attackPotential(s, u, pos);
}

//The best scored target from where the unit stands or was ordered to move to, if the attack beats its
//class's losses (less eager from an objective). Its expected kills count for the next attackers
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

//Not fired, attacked, resupplied or reinforced yet, nor moved in its transport (it can't fire after)
function mayAttack(a: AIUnit): boolean {
	return !(a.u.hasFired || a.didAttack || a.didResupplyReinforce || a.didMount);
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
