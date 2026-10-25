//The engine contract's driver on the game's core (#137): what test/contracts/engine.contract.js asks
//of the game that isn't a function of its own any more. The game plays on its session
//(src/coresession.ts), started here as Game.setupGameState starts it after a load; the players are
//its controllers, a human player's stand-in is the core's AI outside it; the end of turn is the game's
//and the outcome the core's. Built after restoreState, from the fresh modules
import { vi } from "vitest";

export async function coreEngine() {
	const { game } = await import("../src/game");
	const { startGameSession, endGameTurn } = await import("../src/coresession");
	const { applyData, gameInputs, mirrorDifference, unitObject, stepWorld } = await import("../src/mirror");
	const { begin, resume } = await import("../src/core/step");
	const { unitById } = await import("../src/core/world");
	const { setUnitFields } = await import("../src/state");
	const { aiController } = await import("../src/core/ai");
	const { outcome, reachedTurnLimit } = await import("../src/core/turn");
	const { AI } = await import("../src/ai");
	const { AIScripted } = await import("../src/aiscripted");
	const { CombatLog } = await import("../src/combatlog");
	const { GameRules } = await import("../src/gamerules");
	const { Unit } = await import("../src/unit");
	const { Cell, actionType, playerType } = await import("../src/prototypes");
	type Player = import("../src/map").Player;
	type GameMap = import("../src/map").GameMap;
	type Order = import("../src/core/controller").Order;
	type Controller = import("../src/core/controller").Controller;
	type World = import("../src/core/types").World;
	type AIAction = import("../src/ai").AIAction;
	type Command = import("../src/commands").Command;
	type UnitState = import("../src/core/types").UnitState;
	type Unit = import("../src/unit").Unit;

	const worldNow = () => stepWorld(game.scenario, game, gameInputs(game));
	const mirror = (w: World) => {
		applyData(game.scenario, w, game);
		const difference = mirrorDifference(game.scenario, w, game);
		if (difference !== "") throw new Error("coreEngine: " + difference);
	};
	const players = game.scenario.map.getPlayers();
	//Game's getLocalSide: the side of the human and scripted players, 2 when both sides have some
	const sides = new Set(players.filter((p) => p.type === playerType.humanLocal || p.type === playerType.aiScripted).map((p) => p.side));
	const localSide = sides.size > 1 ? 2 : sides.size === 1 ? [...sides][0] : -1;
	startGameSession(game, false, localSide);
	//(the contract leaves the saves out: a restored scenario has no GameState, a campaign record.js's)
	if (game.state === null) game.state = { save() {} } as unknown as typeof game.state;

	//A stand-in's order as the old action (the AI's commands only)
	const unit = (id: number) => unitObject(game.scenario.map, id);
	function actionOf(order: Order | null): AIAction | null {
		if (order === null || !("command" in order)) return null;
		const c = order.command;
		switch (c.type) {
			case "move": return { type: actionType.move, param: [unit(c.unit), { row: c.to.row, col: c.to.col }] };
			case "attack": return { type: actionType.attack, param: [unit(c.unit), unit(c.target)] };
			case "resupply": return { type: actionType.resupply, param: [unit(c.unit)] };
			case "reinforce": return { type: actionType.reinforce, param: [unit(c.unit)] };
			case "mount": return { type: actionType.mount, param: [unit(c.unit)] };
			case "unmount": return { type: actionType.umount, param: [unit(c.unit)] };
			default: throw new Error("coreEngine: no action for " + c.type);
		}
	}

	//AI.buildActions: the turn's start (the AI's purchases and deployment, the tutorial's script), then
	//the plan. The tutorial hands its players over only after the turns the fixtures play
	function startAndPlan(c: Controller): World {
		const played = c.startTurn(worldNow());
		if (played.handOver) throw new Error("coreEngine: the tutorial handed its player over");
		return c.plan(played.world);
	}

	//A player's handler, as the contract makes one: the AI's and the tutorial's join the session (their
	//buildActions plans the turn there, as Map.endTurn did), a human player's stand-in is the core's AI
	//playing outside it, planning when the contract asks
	class ContractAI {
		declare getAction: () => AIAction | null;
		declare buildActions: () => void;

		constructor(p: Player, m: GameMap) {
			if (p.type === playerType.aiLocal || p.type === playerType.aiScripted) {
				const handler = p.type === playerType.aiLocal ? new AI(p, m) : new AIScripted(p, m);
				this.getAction = () => handler.getAction();
				this.buildActions = () => {
					const s = game.session;
					s.world = startAndPlan(s.controllers[p.id]);
					mirror(s.world);
				};
				return;
			}
			const c = aiController(p.id);
			c.join(worldNow());
			this.buildActions = () => { mirror(startAndPlan(c)); };
			this.getAction = () => actionOf(c.next(worldNow()));
		}
	}

	//A unit's object as it was in the world given: a copy with the world's fields (its transport's too) and
	//position
	function asIn(u: Unit, s: UnitState): Unit {
		const c = Object.assign(Object.create(Object.getPrototypeOf(u)), u) as Unit;
		if (u.transport !== null) c.transport = Object.assign(Object.create(Object.getPrototypeOf(u.transport)), u.transport);
		setUnitFields(c, s);
		c.destroyed = s.strength <= 0;
		c.getPos = () => s.row >= 0 ? new Cell(s.row, s.col) : null;
		return c;
	}

	const Actions = {
		worldNow,
		//The units of an attack, or of a move's surprise attack, as they were once its shots were fired:
		//the old UI's animation showed the objects there and the contract recorded them. The game plays the
		//step whole since #375: played again on the core from the world before, to the shots
		shotUnits(before: World, cmd: Command, ids: number[]): Unit[] {
			const b = begin(before, cmd);
			if (!b.ok || b.checkpoint === null) throw new Error("coreEngine: no shots");
			const w = cmd.type === "move" ? resume(b.world, b.checkpoint).world : b.world;
			return ids.map((id) => asIn(unit(id), unitById(w, id)));
		},
		//Map.deployNewUnitByEqId: a new unit of the owner on the hex, its zone of control and spotting on
		deployNewUnitByEqId(eqid: number, row: number, col: number, owner: number) {
			const m = game.scenario.map, u = new Unit(eqid);
			u.owner = owner;
			m.getBoard().place(u, m.map[row][col]);
			GameRules.setZOCRange(m.map, u, true, m.rows, m.cols);
			GameRules.setSpotRange(m.map, u, true, m.rows, m.cols);
		},
		//Actions.checkOutcome: the core's outcome, with the capture a move's finish reported
		checkOutcome(_sc: unknown, last?: { move?: { victorySide: number } | null; endedSide?: number }) {
			const l = last || {};
			return outcome(worldNow(), { victorySide: l.move ? l.move.victorySide : undefined, endedSide: l.endedSide });
		},
		//Scenario.checkDefeat: the side played its last turn, for a side on this screen
		checkDefeat(side: number, local: number) {
			return (local === 2 || local === side) && reachedTurnLimit(worldNow(), side);
		},
		//Game.endTurn on the session: the defeat at the turn limit, the reinforcements that arrived (as
		//the combat log gets them)
		endTurn() {
			const logged = vi.spyOn(CombatLog, "addReinforcement");
			try {
				const defeat = endGameTurn(game);
				return { defeat, arrived: logged.mock.calls.map(([u]) => u.id) };
			} finally {
				logged.mockRestore();
			}
		},
	};
	return { AI: ContractAI, AIScripted: ContractAI, Actions };
}
