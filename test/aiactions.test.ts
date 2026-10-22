//The AI's actions as Game plays them (game.ts processAIActions and processAction): each one becomes
//the player's command, the move and the attack through the UI's uiUnitMove and uiUnitAttack, and
//an action that ends the turn ends it through the end turn command. On a recorded game state, with
//a stand-in UI that records what the game asks of it
import { expect, test } from "vitest";
import { readFixture, restoreState } from "./contracts";
import type { AIAction } from "../src/ai";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";

async function load() {
	const scenario = await restoreState(readFixture("engine", "winter-t2.json.gz").state);
	const { game } = await import("../src/game");
	const { GameRules } = await import("../src/gamerules");
	const { GameState } = await import("../src/gamestate");
	const { actionType } = await import("../src/prototypes");
	const m = scenario.map;
	const calls: string[] = [];
	let animated = true; //what the stand-in uiUnitMove and uiUnitAttack answer
	game.state = new GameState(game);
	game.ui = {
		uiUnitMove(u: Unit, row: number, col: number, cells?: Cell[]) {
			calls.push("move unit#" + u.id + " to " + row + "," + col + (cells === m.getCurrentMoveRange() ? " in the shown range" : ""));
			return animated;
		},
		uiUnitAttack(a: Unit, d: Unit) { calls.push("attack unit#" + a.id + " on unit#" + d.id); return animated; },
		uiSetUnitOnViewPort(u: Unit) { calls.push("viewport unit#" + u.id); },
		uiSetCellOnViewPort(c: Cell) { calls.push("viewport " + c.row + "," + c.col); },
		uiUnitSelect(u: Unit) { calls.push("select unit#" + u.id); },
		showGameToolTip(text: string) { calls.push("tooltip " + text); },
		showAlert() {},
		handleReinforcementDeployment() {},
		uiEndTurnInfo() {},
	} as unknown as typeof game.ui;
	const queue: AIAction[] = [];
	const player = m.currentPlayer;
	//Every player's turn plays the queue (Map.endTurn asks the next AI player to plan)
	for (const p of m.getPlayers())
		p.handler = { getAction: () => queue.shift() || null, buildActions() {} } as unknown as typeof p.handler;
	const own = m.getUnits().filter((u) => u.player === player && u.getPos());
	const enemy = m.getUnits().find((u) => u.player.side !== player.side && u.getPos())!;
	//Plays one action as the game loop does
	const play = (type: number, param: unknown[]) => {
		queue.push({ type: type, param: param });
		game.processAIActions();
	};
	return { game, m, GameRules, A: actionType, calls, play, own, enemy, player, setAnimated: (on: boolean) => { animated = on; } };
}

test("The AI's resupply, reinforce and mount go through the commands, a missing unit is refused", async () => {
	const { game, m, GameRules, A, play, own } = await load();
	const u = own.find((x) => x.unitData(true).ammo > 1 && !x.hasMoved && !x.hasFired)!;
	u.ammo = 0;
	play(A.resupply, [u]);
	expect([u.ammo > 0, u.hasResupplied]).toEqual([true, true]);
	//Again: nothing to add, played anyway as the engine plays it (#147)
	const ammo = u.ammo;
	play(A.resupply, [u]);
	expect(u.ammo).toBe(ammo);

	const r = own.find((x) => x !== u && !x.hasMoved && x.strength >= 10)!;
	r.strength = 4;
	r.player.prestige = 10000;
	expect(GameRules.canReinforce(m.map, r)).toBe(true);
	play(A.reinforce, [r]);
	expect(r.strength).toBeGreaterThan(4);

	//The scripted tutorial can queue no unit (#80): refused, the game goes on
	for (const type of [A.resupply, A.reinforce, A.mount, A.umount])
		expect(() => play(type, [null])).not.toThrow();
	expect(game.waitUIAnimation).toBe(false);
});

test("The AI's move and attack go through the UI, waiting for their animation", async () => {
	const { game, m, GameRules, A, calls, play, own, enemy, setAnimated } = await load();
	const u = own.find((x) => GameRules.getMoveRange(m, x).some((c) => c.canMove))!;
	const to = GameRules.getMoveRange(m, u).find((c) => c.canMove)!;
	play(A.move, [u, to]);
	expect(calls).toEqual(["move unit#" + u.id + " to " + to.row + "," + to.col + " in the shown range", "viewport unit#" + u.id]);
	expect(game.waitUIAnimation).toBe(true); //until the animation ends
	game.waitUIAnimation = false;

	//Out of range: no attack, the AI goes on
	calls.length = 0;
	const far = own.find((x) => !GameRules.isInAttackRange(x, enemy))!;
	play(A.attack, [far, enemy]);
	expect([calls, game.waitUIAnimation]).toEqual([[], false]);

	//Not animated (the player doesn't see it): no waiting
	const attacker = own.find((x) => x !== u)!;
	setAnimated(false);
	const pos = attacker.getPos();
	enemy.getHex()!.delUnit(enemy); //an enemy next to the attacker, in range
	const next = GameRules.getAdjacent(pos.row, pos.col).find((c) => m.map[c.row] && m.map[c.row][c.col]
		&& !m.map[c.row][c.col].unit && !m.map[c.row][c.col].airunit)!;
	m.map[next.row][next.col].setUnit(enemy);
	play(A.attack, [attacker, enemy]);
	expect([calls, game.waitUIAnimation]).toEqual([["attack unit#" + attacker.id + " on unit#" + enemy.id], false]);
});

test("The AI's selections, messages and views are the UI's; an end turn action ends the turn", async () => {
	const { game, m, A, calls, play, own, player } = await load();
	const u = own[0];
	play(A.select, [u]);
	play(A.message, ["Hello", { row: 1, col: 2 }]);
	game.waitUIAnimation = false;
	play(A.viewport, [{ row: 3, col: 4 }]);
	play(A.upgrade, [u]);
	play(A.buy, [u]);
	play(A.deploy, [u]);
	expect(calls).toEqual(["viewport unit#" + u.id, "select unit#" + u.id, "tooltip Hello", "viewport 1,2", "viewport 3,4"]);

	document.body.insertAdjacentHTML("beforeend", "<div id='statusbar-extension'></div>");
	const turn = m.turn;
	play(A.endturn, [u]);
	expect(m.currentPlayer).not.toBe(player);
	expect(m.turn === turn || m.turn === turn + 1).toBe(true);
	expect(game.waitUIAnimation).toBe(false);
});
