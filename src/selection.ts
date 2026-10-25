/**
 * MapSelection - the selected unit and the hexes it can move to and attack
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * What the UI shows: GameMap owns it for now (the UI will). The selected unit stays in
 * GameMap.currentUnit and the highlighted hexes in Hex.isMoveSel and isAttackSel: both are saved
 * with the game and read by the harness. The move cells are also what a move finds its path in
 * when the caller passes them (GameMap.moveUnit's cells).
 *
 * The selection only shows the game: a unit left while it was disembarking goes back aboard by the
 * game's embark (backAboard), as the old selection put it back on its carrier (#376).
 */

import { GameRules, type GameRulesModule } from "./gamerules";
import type { Cell } from "./prototypes";
import type { GameMap } from "./map";
import type { Unit } from "./unit";

export class MapSelection {
	declare map: GameMap;
	//selected hexes for current unit move destinations: extendedCells from the move range, plain
	//Cells for disembark and retreat (no cost, the NaN moveUnit catches)
	declare moveSelected: Cell[];
	declare attackSelected: Cell[]; //selected hexes for current unit attack destinations
	//The game's embark of a unit leaving its carrier, back aboard (src/host.ts runGame sets it: the
	//selection doesn't reach the commands)
	declare static backAboard: (unit: Unit) => void;

	constructor(map: GameMap) {
		this.map = map;
		this.moveSelected = [];
		this.attackSelected = [];
	}

	//Selects unit as the current unit, with its move and attack range. Only units of the current
	//player, returns whether it was selected
	select(unit: Unit): boolean {
		if (unit === null)
			return false;

		//Can't select units from other players
		if (unit.player.id != this.map.currentPlayer.id)
			return false;

		this.clear();
		this.map.currentUnit = unit;

		//Negative carrier: the unit is disembarking, show the hexes it can land on; with none left it
		//goes back aboard
		if (unit.carrier < 0) {
			const cells = GameRules.getLandingPositions(unit);
			if (cells.length > 0) {
				for (const c of cells)
					this.addMoveCell(c, true);
			} else {
				MapSelection.backAboard(unit);
			}
		}

		if (!unit.hasMoved && unit.carrier >= 0)
			this.setMoveRange(unit);
		if (!unit.hasFired)
			this.setAttackRange(unit);

		return true;
	}

	//No unit selected, no hexes highlighted
	clear() {
		//A unit left in the middle of a disembark goes back to its carrier
		if (this.map.currentUnit !== null && this.map.currentUnit.carrier < 0)
			MapSelection.backAboard(this.map.currentUnit);
		this.map.currentUnit = null;
		this.clearMove();
		this.clearAttack();
	}

	clearMove() {
		for (var i = 0; i < this.moveSelected.length; i++) {
			var c = this.moveSelected[i];
			this.map.map[c.row][c.col].isMoveSel = false;
		}
		this.moveSelected = [];
	}

	clearAttack() {
		for (var i = 0; i < this.attackSelected.length; i++) {
			var c = this.attackSelected[i];
			this.map.map[c.row][c.col].isAttackSel = false;
		}
		this.attackSelected = [];
	}

	//Adds a cell to the move cells, highlighted on the map if show
	addMoveCell(cell: Cell, show: boolean) {
		this.moveSelected.push(cell);
		if (show)
			this.map.map[cell.row][cell.col].isMoveSel = true;
	}

	//rules: what answers them, the game's by default
	setMoveRange(unit: Unit, rules: GameRulesModule = GameRules) {
		this.clearMove();
		var c = rules.getMoveRange(this.map, unit);

		//Both canPass and canMove cells for the shortest path, only canMove ones shown on the map
		for (var i = 0; i < c.length; i++)
			this.addMoveCell(c[i], c[i].canMove);
	}

	setAttackRange(unit: Unit, rules: GameRulesModule = GameRules) {
		this.clearAttack();
		var c = rules.getUnitAttackCells(this.map.map, unit, this.map.rows, this.map.cols);

		for (var i = 0; i < c.length; i++) {
			this.attackSelected.push(c[i]);
			this.map.map[c[i].row][c[i].col].isAttackSel = true;
		}
	}
}
