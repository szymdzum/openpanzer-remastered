/**
 * MapSelection - the selected unit and the hexes it can move to and attack: the old UI's view, not the game's.
 * The old UI went in #351; the contracts (test/contracts/engine.contract.js) and the harness still read it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The selection is what the old UI shows (docs/STATE.md D6): the game's state, the save, the contracts and
 * the harness don't have it (#377). It lives here, not on the hexes and the map: GameMap carries it for the
 * old UI and the harness's scripts (GameMap.currentUnit, selectUnit...). The
 * move cells are also what a move finds its path in when the caller passes them (the move command's
 * cells). The hexes are asked of the game's rules, the core's queries (src/legacy/gamerules.ts).
 *
 * The commands don't touch it: after a command the old UI asks it to show what the old engine's command
 * left selected (after): a move shows the unit's move and attack hexes, an attack clears the attack hexes
 * and selects the unit again, a retreat shows the retreated unit's hexes, a resupply or a reinforcement
 * clears the hexes, a mount, an unmount, an embark and an undo select the unit again, a disembark shows
 * the hexes it can land on, a disband deselects first.
 *
 * The selection only shows the game: a unit left while it was disembarking goes back aboard by the game's
 * embark (backAboard), as the old selection put it back on its carrier (#376).
 */

import { type Cell, type extendedCell } from "./prototypes";
import { unitClass } from "../core/tables";
import { GameRules, type GameRulesModule, rulesOver } from "./gamerules";
import { engineContext } from "./context";
import { createWorld } from "../core/create";
import { unitById } from "../core/world";
import type { AttackResult, Executed, MoveResult } from "./commands";
import type { Command, CommandType } from "../core/command";
import type { GameMap, ReinforceResults } from "./map";
import type { Unit } from "./unit";

export class MapSelection {
	declare map: GameMap;
	declare unit: Unit | null; //the selected unit
	//selected hexes for current unit move destinations: extendedCells from the move range, plain
	//Cells for disembark and retreat (no cost, the NaN moveUnit catches)
	declare moveSelected: Cell[];
	declare attackSelected: Cell[]; //selected hexes for current unit attack destinations
	//The hexes shown, by index (row * cols + col): the move hexes it can move to, the hexes it can attack
	declare moveShown: Set<number>;
	declare attackShown: Set<number>;
	//The game's embark of a unit leaving its carrier, back aboard (src/app/host.ts runGame sets it: the
	//selection doesn't reach the commands). counters: the hexes' counters counted again (src/legacy/commands.ts)
	declare static backAboard: (unit: Unit, counters?: boolean) => void;

	constructor(map: GameMap) {
		this.map = map;
		this.unit = null;
		this.moveSelected = [];
		this.attackSelected = [];
		this.moveShown = new Set();
		this.attackShown = new Set();
	}

	//Whether the hex shows that the selected unit can move there, attack there
	isMove(row: number, col: number): boolean { return this.moveShown.has(row * this.map.cols + col); }
	isAttack(row: number, col: number): boolean { return this.attackShown.has(row * this.map.cols + col); }

	//Selects unit as the current unit, with its move and attack range. Only units of the current
	//player, returns whether it was selected. rules: what answers them, the game's by default
	select(unit: Unit, rules: GameRulesModule = GameRules): boolean {
		if (unit === null)
			return false;

		//Can't select units from other players
		if (unit.player.id != this.map.currentPlayer.id)
			return false;

		this.clear();
		this.unit = unit;

		//Negative carrier: the unit is disembarking, show the hexes it can land on; with none left it
		//goes back aboard
		if (unit.carrier < 0) {
			const cells = rules.getLandingPositions(unit);
			if (cells.length > 0) {
				for (const c of cells)
					this.addMoveCell(c, true);
			} else {
				MapSelection.backAboard(unit);
			}
		}

		if (!unit.hasMoved && unit.carrier >= 0)
			this.setMoveRange(unit, rules);
		if (!unit.hasFired)
			this.setAttackRange(unit, rules);

		return true;
	}

	//No unit selected, no hexes highlighted
	clear() {
		//A unit left in the middle of a disembark goes back to its carrier
		if (this.unit !== null && this.unit.carrier < 0)
			MapSelection.backAboard(this.unit);
		this.unit = null;
		this.clearMove();
		this.clearAttack();
	}

	clearMove() {
		this.moveSelected = [];
		this.moveShown.clear();
	}

	clearAttack() {
		this.attackSelected = [];
		this.attackShown.clear();
	}

	//Adds a cell to the move cells, highlighted on the map if show
	addMoveCell(cell: Cell, show: boolean) {
		this.moveSelected.push(cell);
		if (show)
			this.moveShown.add(cell.row * this.map.cols + cell.col);
	}

	//The move cells given (a program's move range, where its move goes), the ones it can move to shown
	showMoveCells(cells: extendedCell[]) {
		this.clearMove();
		for (const c of cells)
			this.addMoveCell(c, c.canMove);
	}

	//rules: what answers them, the game's by default
	setMoveRange(unit: Unit, rules: GameRulesModule = GameRules) {
		//Both canPass and canMove cells for the shortest path, only canMove ones shown on the map
		this.showMoveCells(rules.getMoveRange(this.map, unit));
	}

	setAttackRange(unit: Unit, rules: GameRulesModule = GameRules) {
		this.clearAttack();
		for (const c of rules.getUnitAttackCells(this.map.map, unit, this.map.rows, this.map.cols)) {
			this.attackSelected.push(c);
			this.attackShown.add(c.row * this.map.cols + c.col);
		}
	}

	//---- What a command leaves selected, as the old engine's commands left it

	//After a command played (a refused one changes nothing). Before a disband the old UI deselects (clear)
	after(cmd: Command, done: Executed<CommandType>) {
		const shown = afterCommand[cmd.type];
		if (done.ok && shown !== undefined)
			shown(this, this.map.getUnitById((cmd as { unit: number }).unit), done.result);
	}

	clearHexes() {
		this.clearMove();
		this.clearAttack();
	}

	//The unit selected again for its new move and attack hexes (a mount, an unmount, an embark)
	reselect(unit: Unit) {
		this.clearHexes();
		this.select(unit);
	}

	//A disembark: the hexes the unit can land on are its move hexes (the selected unit stays)
	landing(unit: Unit) {
		this.clearHexes();
		for (const c of GameRules.getLandingPositions(unit))
			this.addMoveCell(c, true);
	}

	//The moved unit's move and attack hexes where it stopped, before its surprise attack, then the surprise
	//attack's
	afterMove(unit: Unit, r: MoveResult) {
		const rules = rulesOver(r.moved);
		this.setMoveRange(unit, rules);
		this.setAttackRange(unit, rules);
		if (r.surprise !== null && r.surprise.attack !== null)
			this.afterAttack(r.surprise.attack);
	}

	//The attack itself (not the support fire alone) clears the attack hexes, then the old UI's selection after
	//the attack's cleanup, then the retreat's
	afterAttack(r: AttackResult) {
		if (r.events.some((e) => e.type === "fight" && !e.support))
			this.clearAttack();
		if (this.unit !== null)
			this.reselectAfterAttack(this.unit, r);
		if (r.retreat !== null) {
			const before = this.unit;
			this.retreatRanges(r.defending.unit);
			if (before !== null) this.select(before);
		}
	}

	//The old UI's uiReselectAfterAttack, after the destroyed units left the map and before the retreat or the
	//surrender, on the world then (a defender that surrenders still stands there, #89): the selection cleared
	//when its unit was destroyed, else selected again, with its move hexes made again when it destroyed the
	//defender (the old game read the cleared selection when both units were destroyed: it threw, #326, #29).
	//A unit selected while disembarking goes back aboard there, as it did before the attack's end, which
	//counted the hexes' counters again: then on the game's world
	reselectAfterAttack(u: Unit, r: AttackResult) {
		if (r.destroyed.includes(r.attacking.unit) && u.id === r.attacking.unit.id) {
			this.clear();
			return;
		}
		let rules = rulesOver(r.cleanedUp);
		if (u.carrier < 0 && u.player.id == this.map.currentPlayer.id) {
			MapSelection.backAboard(u, true);
			rules = GameRules;
		}
		this.select(u, rules);
		if (r.destroyed.includes(r.defending.unit) && !u.hasMoved) this.setMoveRange(u, rules);
	}

	//The retreated unit's move and attack hexes as the old retreat's move showed them: with the move's
	//points spent (Unit.move: a mounted unit's all of them; done unless a recon unit with points left),
	//which the retreat gave back after. Asked of the game's world with the unit so, made for them alone (the
	//old engine wrote the points into the unit and back)
	retreatRanges(u: Unit) {
		const w = engineContext.world(), s = unitById(w, u.id), spent = { ...s };
		if (spent.isMounted && spent.transport !== null) spent.moveLeft = 0;
		if (u.unitData().uclass !== unitClass.recon || spent.moveLeft <= 0) spent.hasMoved = spent.hasOverstrength = true;
		const state = { ...w.state, units: w.state.units.map((x) => x === s ? spent : x) };
		const moved = createWorld({ data: w.data, state }, w.equipment, { spotSide: w.spotSide, noFOW: w.noFOW, rules: w.rules,
			destroyed: w.destroyed });
		const rules = rulesOver(moved);
		this.setMoveRange(u, rules);
		this.setAttackRange(u, rules);
	}
}

//What a command played leaves selected, by its type: the selection, the command's unit and its result (the
//others leave it as it is; an embark and a disembark the command allows always take place)
type Shown = (s: MapSelection, unit: Unit | null, result: unknown) => void;
const afterCommand: { [T in CommandType]?: Shown } = {
	move: (s, unit, r) => s.afterMove(unit, r as MoveResult),
	attack: (s, _u, r) => s.afterAttack(r as AttackResult),
	resupply: (s) => s.clearHexes(),
	reinforce: (s, _u, r) => { if ((r as ReinforceResults).strength > 0) s.clearHexes(); },
	mount: (s, unit) => s.reselect(unit),
	unmount: (s, unit) => s.reselect(unit),
	embark: (s, unit) => s.reselect(unit),
	disembark: (s, unit) => s.landing(unit),
	undo: (s, unit) => { s.select(unit); },
};
