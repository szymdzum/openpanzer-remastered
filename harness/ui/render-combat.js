// Render: unit selection (current hex, move and attack ranges), the attack cursor built on the
// backbuffer, attack (combat hexes, explosion animations), air mode, the css move animation
// (2D and 3D transforms), then an AI turn whose moves are only partly visible (fog of war).
const myUnits = () => { const m = game.scenario.map; return m.getUnits().filter((u) => u.player.id === m.currentPlayer.id); };
const attackCells = (u) => { const m = game.scenario.map; return GameRules.getUnitAttackCells(m.map, u, m.rows, m.cols); };
// harness key() sends no KeyboardEvent.code, which the UI's shortcuts switch on
const keyCode = (code, k) => window.dispatchEvent(new KeyboardEvent("keyup", { code, key: k, bubbles: true }));
// settle() doesn't wait for the move animation (an interval), run the clock until it ends
const moveTo = async (u, c) => { clickHex(c.row, c.col); await runClock(() => !u.hasAnimation, 20000); };
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["select a unit with an enemy in range", async () => {
		window.__atk = myUnits().find((u) => attackCells(u).length > 0 && u !== game.scenario.map.currentUnit);
		const p = __atk.getPos();
		clickHex(p.row, p.col);
	}],
	["hover the target: attack cursor generated", async () => {
		window.__tgt = attackCells(__atk)[0];
		hoverHex(__tgt.row, __tgt.col);
	}],
	["hover the target again: cursor kept", async () => { hoverHex(__tgt.row, __tgt.col); }],
	["hover a plain hex: default cursor", async () => { const p = __atk.getPos(); hoverHex(p.row, p.col); }],
	["hover the target once more: cursor reassigned", async () => { hoverHex(__tgt.row, __tgt.col); }],
	["attack the target", async () => { clickHex(__tgt.row, __tgt.col); }],
	["hover the target after firing: default cursor", async () => { hoverHex(__tgt.row, __tgt.col); }],
	["air mode on (A key)", async () => { keyCode("KeyA", "a"); }],
	["select the air unit stacked over a ground unit", async () => {
		window.__air = myUnits().find((u) => GameRules.isAir(u) && game.scenario.map.map[u.getPos().row][u.getPos().col].unit !== null);
		const p = __air.getPos();
		clickHex(p.row, p.col);
	}],
	["air mode off (A key) while the air unit is selected: deselects", async () => { keyCode("KeyA", "a"); }],
	["air mode on again (A key)", async () => { keyCode("KeyA", "a"); }],
	["select the air unit again", async () => { const p = __air.getPos(); clickHex(p.row, p.col); }],
	["move the air unit far (css 2D move animation)", async () => {
		const cells = GameRules.getMoveRange(game.scenario.map, __air).filter((c) => c.canMove);
		await moveTo(__air, cells[cells.length - 1]);
	}],
	["select a ground unit", async () => {
		const m = game.scenario.map;
		window.__gnd = myUnits().find((u) => !GameRules.isAir(u) && !u.hasMoved && u !== m.currentUnit
			&& GameRules.getMoveRange(m, u).filter((c) => c.canMove).length > 3);
		const p = __gnd.getPos();
		clickHex(p.row, p.col);
	}],
	["enable 3D css transforms for moves", async () => { uiSettings.use3D = true; }],
	["move the ground unit (css 3D move animation)", async () => {
		const cells = GameRules.getMoveRange(game.scenario.map, __gnd).filter((c) => c.canMove);
		await moveTo(__gnd, cells[cells.length - 1]);
	}],
	["select another ground unit", async () => {
		const m = game.scenario.map;
		window.__gnd2 = myUnits().find((u) => !GameRules.isAir(u) && !u.hasMoved && u !== m.currentUnit
			&& GameRules.getMoveRange(m, u).filter((c) => c.canMove).length > 3);
		const p = __gnd2.getPos();
		clickHex(p.row, p.col);
	}],
	["move it again with 3D transforms (transition already set)", async () => {
		const cells = GameRules.getMoveRange(game.scenario.map, __gnd2).filter((c) => c.canMove);
		await moveTo(__gnd2, cells[cells.length - 1]);
	}],
	["disable 3D css transforms, slow animations", async () => { uiSettings.use3D = false; uiSettings.quickAnimation = false; }],
	["deselect with escape", async () => { key("Escape", 27); }],
	["end turn, AI plays", async () => { endTurn(); }],
	["quick animations back", async () => { uiSettings.quickAnimation = true; }],
	["end turn again, AI plays", async () => { endTurn(); }],
];
