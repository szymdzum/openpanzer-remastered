// The engine contract: the AI plays every player of a game state for a few turns through Map,
// Unit, GameRules, Leaders, Scenario and Game, with random legal actions of every kind mixed in
// and drills for the rarer paths, and every step records its result and a hash of the whole state
// after it. Then the campaign functions, and hashes of the saved game, the combat log and the
// equipment data. Same recording and testing as the GameRules contract (see
// gamerules.contract.js). Uses contractRecorder, contractUnitState and contractHash from common.js.
//
// The driver plays a turn in the game's order (game.js processTurn, processAIActions,
// processAction and endTurn; ui.js uiUnitMove, uiMoveAnimationFinished, uiUnitAttack and
// uiAttackAnimationFinished, the end turn button) without the UI and the timers:
// - the players are set up as Game.setupPlayers does after a load (scenario mode, the types the
//   save has): an AI player gets a real AI handler, so Map.endTurn plans its turn, before
//   Game.endTurn deploys its reinforcements. A human player is played by the driver's own AI,
//   which plans when the human's turn starts (after the reinforcements and the UI's selection)
// - game.spotSide as Game.setCurrentSide sets it: the local side from the player types
//   (getLocalSide), the current player's side in hotseat; at the start (setupGameState) and at
//   every end of turn, after Scenario.endTurn (unitEndTurn reads the old one)
// - the end of turn: Scenario.endTurn, checkDefeat with the local side, setCurrentSide, then
//   Game.deployReinforcements itself. After a human's end turn the UI resets the combat log and
//   selects the new human player's first ground unit (uiMapRenderAndSelectUnit)
// - processAction: no action or no parameters, endturn and unknown types end the AI's turn;
//   select is uiUnitSelect (deselect, then select); the rest do nothing to the map
// - after a move (and a retreat) what uiMoveAnimationFinished does: the surprise attack, then
//   the capture victory. After an attack what uiAttackAnimationFinished does: the destroyed units
//   removed, the selection refreshed, retreat or surrender, then the elimination victory (a side
//   without units loses). A victory or a defeat ends the game: no more actions and turns
//
// Where the driver still differs from the game, and why:
// - Synchronous. In the game an attack's second half runs when its animation ends. For an AI
//   attack the AI waits for it (waitUIAnimation), the same order as here. A surprise attack's
//   second half runs after uiMoveAnimationFinished cleared waitUIAnimation, so the AI's next
//   action (or its end of turn and the save) can come first; here it comes after the move's
//   capture and victory check, before the next action. A retreat's own move-finished part runs
//   after the elimination check, as in the game
// - The animations' and sounds' Math.random draws (sprite and sound variants, between the
//   support fire shots) aren't made: check() seeds Math.random per step on both sides anyway
// - The selection refresh after an attack reads map.currentUnit after it may have been deleted
//   (#29): the game throws there and skips the retreat and the victory check, the driver guards it
// - A surprise attack picks its target with uiSettings.airMode in the game (the human's last
//   selection, ui.js handleUnitAttack); always ground first (false) here
// - When an attack's animation chain is empty (carrier and naval transport attacks without
//   support fire) the game calls the second half before it read the new strengths, so it treats
//   both units as destroyed: only an extra updateUnitList, which changes nothing; not copied
// - The first turn: the restored players have no handlers, the game's new AI handler would have
//   no actions and end the AI's turn at once. The driver plans it, as Map.endTurn did before
//   the export
// - The human player's actions go through processAction's calls, as the AI's do, not through
//   the clicks (same Map calls; a human's move has no setMoveRange right before it)
// - The game's alerts, renders, saves (state.save, saveCampaign) and the campaign end (the
//   states have no campaign) are left out. The victory is recorded, not shown
//
//   runEngineContract({ GameRules, Equipment, AI, AIScripted, GameState, CombatLog, game,
//     actionType, playerType, terrainType, unitClass, map, scenario, contractTurns })
//     -> [[name, context, serialized result], ...]
//   contractCapture(env) -> what the test has to apply before running (the reference's equipment
//     indexes: the AI's purchases prune them, see ai.ts buyUnits); contractApply(env, captured)

function contractCapture(env) {
	return JSON.stringify(env.Equipment.equipmentIndexes);
}

function contractApply(env, captured) {
	env.Equipment.equipmentIndexes = JSON.parse(captured);
}

function runEngineContract(env) {
	const GR = env.GameRules, m = env.map, A = env.actionType, CL = env.CombatLog, PT = env.playerType;
	const sc = env.scenario, game = env.game, UC = env.unitClass;
	const out = [];
	const check = contractRecorder(out);
	// The combat log holds what was played before the export: start empty on both sides
	CL.reset();

	// The UI as the engine and Game call it: the AI after deploying its purchases,
	// Game.deployReinforcements (its alerts are recorded) and the tutorial's scripted AI, which
	// opens the main menu while it plans its last turn
	const realUI = game.ui, realSpotSide = game.spotSide;
	let alerts = [];
	game.ui = {
		handleReinforcementDeployment() {},
		mainMenuButton() {},
		showAlert(row, col, text, positive) { alerts.push([row, col, text, positive]); },
	};

	// Game.setupPlayers in scenario mode, with the types the save has
	const players = m.getPlayers();
	const realHandlers = players.map((p) => p.handler);
	const standIns = {}; // the driver's AI playing a human player
	for (const p of players) {
		if (p.type == PT.aiLocal) p.handler = new env.AI(p, m);
		else if (p.type == PT.aiScripted) p.handler = new env.AIScripted(p, m); // (the tutorial)
		else standIns[p.id] = new env.AI(p, m);
	}
	const isAI = (p) => p.type == PT.aiLocal || p.type == PT.aiScripted;
	// Game's getLocalSide: -1 no local side, 0 or 1, 2 both (hotseat). Scripted AI counts as local
	const localSide = (() => {
		let sides = 1, side = -1;
		for (const p of players)
			if (p.type == PT.humanLocal || p.type == PT.aiScripted) {
				if (side != -1 && side != p.side) sides++;
				side = p.side;
			}
		return sides > 1 ? 2 : side;
	})();
	function setCurrentSide() {
		game.spotSide = localSide == 2 ? m.currentPlayer.side : localSide;
	}

	const reinforcementCount = () => Object.keys(sc.reinforcements)
		.reduce((n, t) => n + (sc.reinforcements[t] ? sc.reinforcements[t].length : 0), 0);
	function stateString() {
		const units = m.getUnits().map((u) => JSON.stringify(contractUnitState(u)));
		const ps = m.getPlayers().map((p) => {
			const o = {};
			for (const k of Object.keys(p).sort()) if (typeof p[k] !== "function" && k !== "handler") o[k] = p[k];
			o.core = p.getCoreUnitList().map((u) => u.id + (u.isDeployed ? "d" : "u"));
			return JSON.stringify(o);
		});
		let hexes = "";
		for (let r = 0; r < m.rows; r++)
			for (let c = 0; c < m.cols; c++) {
				const h = m.map[r][c];
				hexes += [h.owner, h.flag, h.victorySide, h.isMoveSel ? 1 : 0, h.isAttackSel ? 1 : 0,
					h.unit ? h.unit.id : "", h.airunit ? h.airunit.id : "",
					+h.isZOC(0), +h.isZOC(1), +h.isSpotted(0), +h.isSpotted(1)].join(",") + ";";
			}
		return [m.turn, m.currentPlayer ? m.currentPlayer.id : null, m.currentUnit ? m.currentUnit.id : null,
			JSON.stringify(m.sidesVictoryHexes), sc.date.getTime(), sc.dayTurn, reinforcementCount(),
			contractHash(contractSerialize(env.Equipment.equipmentIndexes)), game.spotSide].join("|")
			+ "\n" + units.join("\n") + "\n" + ps.join("\n") + "\n" + hexes;
	}
	const hash = () => contractHash(stateString());
	const logHash = () => contractHash(contractSerialize(CL.log));

	function action(a) {
		return { type: a.type, param: (a.param || []).map((p) => p && typeof p.unitData === "function" ? "unit#" + p.id : p) };
	}

	// The end of the game: ui.js uiMoveVictory (single scenario: gameEnded), Game.endTurn's defeat
	let ended = null;
	function win(side, kind) {
		const outcome = sc.checkVictory();
		if (!ended) ended = { side, kind, outcome };
		return [side, kind, outcome];
	}
	// The victory checks after an action
	const outcome = () => ({ victory: sc.checkVictory(), alive: [m.hasAliveUnits(0), m.hasAliveUnits(1)], ended });

	// ui.js uiUnitAttack without animations and alerts: support fire, the attack or attack stopped
	function resolveAttack(a, d) {
		if (!a.getPos() || !d.getPos()) return null;
		const aOld = a.strength, dOld = d.strength;
		let cr = GR.calculateAttackResults(a, d, true);
		const support = [];
		if (!a.isSurprised && !cr.isOverrun) {
			for (const s of GR.getSupportFireUnits(m.getUnits(), a, d)) {
				if (a.destroyed) break;
				support.push(s.id);
				m.attackUnit(s, a, true);
			}
		}
		const stopped = GR.isLossOverRetreatThreshold(a.strength, aOld);
		if (!a.destroyed && !stopped) cr = m.attackUnit(a, d, false, cr.isOverrun);
		if (stopped) a.hasFired = true;
		return { a, d, aOld, dOld, aNew: a.strength, dNew: d.strength, cr, support, stopped,
			attacker: contractUnitState(a), defender: contractUnitState(d) };
	}

	// ui.js uiAttackAnimationFinished without animations and alerts
	function finishAttack(r) {
		const a = r.a, d = r.d;
		const aDestroyed = r.aOld - r.aNew >= r.aOld, dDestroyed = r.dOld - r.dNew >= r.dOld;
		if (aDestroyed || dDestroyed) m.updateUnitList();
		if (m.currentUnit) {
			if (a.destroyed && m.currentUnit.id == a.id) m.delCurrentUnit();
			else m.selectUnit(m.currentUnit);
			// (the UI reads currentUnit here even after deleting it, #29: the driver checks it)
			if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
		}
		let retreat = null, retreatMove = null;
		if (!dDestroyed && GR.shouldDefenderRetreat(a, d, r.dOld)) {
			const c = GR.getRetreatPosition(m.map, d, m.rows, m.cols);
			if (c) retreat = { mr: retreatMove = m.retreatUnit(d, c) };
			else { d.destroyed = true; m.updateUnitList(); retreat = "surrender"; }
		}
		const victory = [];
		if (!m.hasAliveUnits(0)) victory.push(win(1, "elimination"));
		if (!m.hasAliveUnits(1)) victory.push(win(0, "elimination"));
		// The retreat's move animation ends after this
		if (retreatMove) Object.assign(retreat, moveFinished(d, retreatMove), { unit: contractUnitState(d) });
		return { cr: r.cr, support: r.support, stopped: r.stopped, attacker: r.attacker, defender: r.defender,
			retreat, victory, outcome: outcome() };
	}

	function attack(a, d) {
		const r = resolveAttack(a, d);
		return r ? finishAttack(r) : "no position";
	}

	// ui.js uiMoveAnimationFinished: the surprise attack (its second half after the rest), the
	// capture victory
	function moveFinished(u, mr) {
		let surprise = null, pending = null, victory = null;
		if (u.isSurprised && mr.surpriseCell) {
			const e = m.map[mr.surpriseCell.row][mr.surpriseCell.col].getAttackableUnit(u, false);
			pending = e ? resolveAttack(u, e) : null;
			surprise = e ? (pending ? null : "no position") : "nothing to attack";
			u.isSurprised = false;
		}
		if (mr.isVictorySide >= 0) victory = win(mr.isVictorySide, "capture");
		if (pending) surprise = finishAttack(pending);
		return { surprise, victory };
	}

	// game.js processAction (move): the move range, then ui.js uiUnitMove
	function move(u, cell) {
		m.setMoveRange(u);
		const mr = m.moveUnit(u, cell.row, cell.col);
		const after = moveFinished(u, mr);
		return { mr, surprise: after.surprise, victory: after.victory, unit: contractUnitState(u), outcome: outcome() };
	}

	// ui.js uiUnitSelect
	function select(u) {
		if (u === null) return false;
		if (m.currentUnit !== null) m.delCurrentUnit();
		return m.selectUnit(u);
	}

	// game.js processAction: false ends the AI's turn
	function play(a) {
		if (!a) return false;
		const p = a.param;
		if (!p) return false;
		switch (a.type) {
			case A.move: return move(p[0], p[1]);
			case A.attack: return GR.isInAttackRange(p[0], p[1]) ? attack(p[0], p[1]) : "out of range";
			case A.resupply: return m.resupplyUnit(p[0]);
			case A.reinforce: return m.reinforceUnit(p[0], false);
			case A.mount: return m.mountUnit(p[0]);
			case A.umount: return m.unmountUnit(p[0]);
			case A.select: return select(p[0]);
			case A.upgrade: case A.buy: case A.deploy: case A.message: case A.viewport: return null; // nothing on the map
			default: return false; // endturn and unknown types
		}
	}

	// ui.js uiMapRenderAndSelectUnit: a human player's first ground unit is selected
	// (handleUnitSelect with uiSettings.airMode false)
	function selectFirstUnit() {
		const cp = m.currentPlayer;
		if (cp.type != PT.humanLocal) return null;
		for (const u of m.getUnits()) {
			const uc = u.unitData().uclass;
			if (u.player.id != cp.id || uc == UC.fighter || uc == UC.levelBomber || uc == UC.tacticalBomber) continue;
			const p = u.getPos();
			if (!p) return "no position";
			const hex = m.map[p.row][p.col];
			let s = hex.getUnit(false);
			if (s === null || s.player.id != cp.id) {
				s = hex.getUnit(true);
				if (s === null || s.player.id != cp.id) return false;
			}
			return [s.id, select(s)];
		}
		return null;
	}

	// Equipment the players can buy, for upgrades
	const countries = {};
	players.forEach((p) => [p.country].concat(p.supportCountries || []).forEach((c) => countries[c] = true));
	const allEqids = Object.keys(env.Equipment.equipment).map(Number).sort((a, b) => a - b);
	let eqids = allEqids.filter((id) => countries[env.Equipment.equipment[id].country]);
	if (!eqids.length) eqids = allEqids; // (no player country in the equipment's in some scenarios)
	const transports = eqids.filter((id) => env.Equipment.equipment[id].uclass == UC.groundTransport);

	// Player actions of every kind, the AI's and those it never does: a random kind, then a random
	// unit of the player that can do it
	function attackTargets(u) {
		return GR.getUnitAttackCells(m.map, u, m.rows, m.cols)
			.map((cell) => m.map[cell.row][cell.col].getAttackableUnit(u, false)).filter(Boolean);
	}
	const kinds = {
		"move": { can: (u) => GR.getMoveRange(m, u).length > 0,
			run: (u, pick) => { m.selectUnit(u); const cells = GR.getMoveRange(m, u); return move(u, cells[pick(cells.length)]); } },
		"attack": { can: (u) => attackTargets(u).length > 0,
			run: (u, pick) => { const t = attackTargets(u); return attack(u, t[pick(t.length)]); } },
		"resupply": { can: (u) => GR.canResupply(m.map, u), run: (u) => m.resupplyUnit(u) },
		"reinforce": { can: (u) => GR.canReinforce(m.map, u), run: (u) => m.reinforceUnit(u, false) },
		"reinforce over": { can: (u) => GR.canReinforce(m.map, u, true), run: (u) => m.reinforceUnit(u, true) },
		"mount": { can: (u) => GR.canMount(u), run: (u) => m.mountUnit(u) },
		"unmount": { can: (u) => GR.canUnmount(u), run: (u) => m.unmountUnit(u) },
		"embark": { can: (u) => GR.canEmbark(m.map, u), run: (u) => m.embarkUnit(u) },
		"disembark": { can: (u) => GR.canDisembark(m.map, u), run: (u) => m.disembarkUnit(u) },
		"upgrade": { can: () => true, run: (u, pick, rng) => m.upgradeUnit(u.id, eqids[pick(eqids.length)],
			rng() < 0.5 || !transports.length ? -1 : transports[pick(transports.length)]) },
		"undo": { can: (u) => m.canUndoMove(u), run: () => m.undoLastMove() },
		"select": { can: () => true, run: (u) => m.selectUnit(u) },
		"neighbor": { can: () => true, run: (u, pick, rng) => {
			const n = m.getUnitNeighbor(u, rng() < 0.5 ? 1 : -1, rng() < 0.5);
			return n ? n.id : n;
		} },
	};
	const kindNames = Object.keys(kinds);
	const ownUnits = (player) => m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed && u.getPos());
	function randomActions(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		for (let i = 0; i < 20 && !ended; i++) {
			const kind = kindNames[pick(kindNames.length)];
			const units = ownUnits(player).filter((u) => kinds[kind].can(u));
			const u = units.length ? units[pick(units.length)] : null;
			check("player " + kind, ctx + " #" + i + (u ? " unit#" + u.id : " no unit"), () => [u ? kinds[kind].run(u, pick, rng) : null, hash()]);
		}
		if (ended) return;
		// Rarer: disband a unit, deploy a new one on a free hex
		const units = m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed);
		if (units.length > 1 && rng() < 0.3) {
			const u = units[pick(units.length)];
			check("player disband", ctx + " unit#" + u.id, () => [m.disbandUnit(u.id), hash()]);
		}
		const row = pick(m.rows), col = pick(m.cols), eqid = eqids[pick(eqids.length)];
		if (!m.map[row][col].unit && !m.map[row][col].airunit)
			check("deployNewUnitByEqId", ctx + " " + eqid + " at " + row + "," + col, () => [m.deployNewUnitByEqId(eqid, row, col, player.id), hash()]);
	}

	function queries(ctx) {
		check("queries", ctx, () => {
			return {
				alive: [m.hasAliveUnits(0), m.hasAliveUnits(1)],
				countries: [m.getCountriesBySide(0), m.getCountriesBySide(1)],
				byCountry: players.map((p) => m.getPlayersByCountry(p.country).map((x) => x.id)),
				players: players.map((p) => [p.getCountryName(), p.getSideName(), p.hasUndeployedUnits()]),
				deploy: [m.getDeployHexes(0), m.getDeployHexes(1)],
				images: m.getUnitImagesList(),
			};
		});
		check("scenario queries", ctx, () => players.map((p) => [sc.getPrototypeUnitsAvailable(p.country),
			sc.getRandomPrototype(p.country), sc.getBalancedPrestige(p.side)]));
		// The defeat and victory checks at the turn limit
		check("turn limit", ctx, () => {
			const turn = m.turn;
			m.turn = m.maxTurns;
			try { return [sc.checkDefeat(0, 2), sc.checkDefeat(1, 2), sc.checkDefeat(0, 0), sc.checkDefeat(1, 1), sc.checkVictory()]; }
			finally { m.turn = turn; }
		});
	}

	// The campaign side of Map and Player, each step on every player in turn as a campaign does
	function campaign() {
		for (const p of players) check("buildCoreUnitList", "player#" + p.id, () => [m.buildCoreUnitList(p), hash()]);
		for (const p of players) check("dossier", "player#" + p.id, () => {
			p.initDossier();
			const u = m.getUnits().find((x) => x.player.id == p.id);
			if (u) p.addDestroyedUnitToDossier(u);
			p.addOutcomeToDossier("victory", "contract");
			const other = players.find((x) => x.id != p.id);
			if (other) other.copyDossier(p);
			return [p.dossier, other ? other.dossier : null];
		});
		// (a copy of the list, as the saved list the game passes: the function adds to the player's)
		for (const p of players) check("restoreCoreUnitList", "player#" + p.id, () => [m.restoreCoreUnitList(p, p.getCoreUnitList().slice()), hash()]);
		for (const p of players) check("removeNonCampaignUnits", "player#" + p.id, () => [m.removeNonCampaignUnits(p), hash()]);
		for (const p of players) check("setPlayerToHQ", "player#" + p.id, () => [p.setPlayerToHQ(), hash()]);
		for (const p of players) check("removeUndeployedCoreUnit", "player#" + p.id, () => [p.removeUndeployedCoreUnit(0), hash()]);
	}

	// Moves u onto hex the way moveUnit leaves a unit: ZOC and spotting go with it
	function place(u, hex) {
		const p = u.getPos();
		GR.setZOCRange(m.map, u, false, m.rows, m.cols);
		GR.setSpotRange(m.map, u, false, m.rows, m.cols);
		m.map[p.row][p.col].delUnit(u);
		hex.setUnit(u);
		GR.setZOCRange(m.map, u, true, m.rows, m.cols);
		GR.setSpotRange(m.map, u, true, m.rows, m.cols);
	}

	// What a drill changes, put back: the units (fields, hexes, the unit list), the players, the
	// hexes (owners, flags, objectives, selection marks, units, the ZOC and spotting counters), the
	// victory hexes, the current unit, the combat log and the end of the game. Not the Map's move
	// and attack ranges and undo slot (closure state): the end of turn clears them, and nothing
	// after the drills uses them before it
	const isEntity = (v) => typeof v.unitData === "function" || typeof v.getPos === "function"
		|| (v.constructor && v.constructor.name === "Player");
	function keep(o, skip) {
		const own = {}, inner = {};
		for (const k of Object.keys(o)) {
			const v = o[k];
			if (typeof v === "function" || skip.indexOf(k) >= 0) continue;
			own[k] = v;
			if (v && typeof v === "object" && !isEntity(v)) inner[k] = Array.isArray(v) ? v.slice() : Object.assign({}, v);
		}
		return () => {
			for (const k of Object.keys(o)) if (!(k in own) && typeof o[k] !== "function" && skip.indexOf(k) < 0) delete o[k];
			for (const k of Object.keys(own)) {
				o[k] = own[k];
				if (!(k in inner)) continue;
				if (Array.isArray(own[k])) { own[k].length = 0; for (const x of inner[k]) own[k].push(x); }
				else {
					for (const ik of Object.keys(own[k])) if (!(ik in inner[k])) delete own[k][ik];
					Object.assign(own[k], inner[k]);
				}
			}
		};
	}
	// A hex's ZOC or spotting counter (private, the hex only tells whether it is set): counted
	// down to 0, then back up
	function drain(isSet, set, side) {
		let n = 0;
		while (isSet(side) && n < 1000) { set(side, false); n++; }
		return n;
	}
	function counters(h) {
		const isZOC = (s) => h.isZOC(s), setZOC = (s, on) => h.setZOC(s, on);
		const isSpotted = (s) => h.isSpotted(s), setSpotted = (s, on) => h.setSpotted(s, on);
		const n = [drain(isZOC, setZOC, 0), drain(isZOC, setZOC, 1), drain(isSpotted, setSpotted, 0), drain(isSpotted, setSpotted, 1)];
		const fill = () => {
			for (let i = 0; i < n[0]; i++) h.setZOC(0, true);
			for (let i = 0; i < n[1]; i++) h.setZOC(1, true);
			for (let i = 0; i < n[2]; i++) h.setSpotted(0, true);
			for (let i = 0; i < n[3]; i++) h.setSpotted(1, true);
		};
		fill();
		return () => {
			drain(isZOC, setZOC, 0); drain(isZOC, setZOC, 1); drain(isSpotted, setSpotted, 0); drain(isSpotted, setSpotted, 1);
			fill();
		};
	}
	function snapshot() {
		const unitList = m.getUnits(), list = unitList.slice();
		const units = list.map((u) => ({ u, hex: u.getHex(), restore: keep(u, []) }));
		const ps = players.map((p) => keep(p, ["handler"]));
		const hexes = [];
		for (let r = 0; r < m.rows; r++)
			for (let c = 0; c < m.cols; c++) hexes.push([keep(m.map[r][c], []), counters(m.map[r][c])]);
		const victoryHexes = m.sidesVictoryHexes.map((s) => [s, s.slice()]);
		const currentUnit = m.currentUnit, log = structuredClone(CL.log), wasEnded = ended;
		return () => {
			for (const s of units) {
				if (s.u.getHex() !== s.hex) s.u.setHex(s.hex);
				s.restore();
			}
			unitList.length = 0;
			for (const u of list) unitList.push(u);
			ps.forEach((restore) => restore());
			for (const [fields, count] of hexes) { fields(); count(); }
			for (const [s, saved] of victoryHexes) { s.length = 0; for (const c of saved) s.push(c); }
			m.currentUnit = currentUnit;
			CL.log = log;
			ended = wasEnded;
		};
	}
	// A drill step: f's result, then whether the state was put back
	function drill(name, ctx, f) {
		check(name, ctx, () => {
			const before = hash(), restore = snapshot();
			let r;
			try { r = f(); }
			finally { restore(); }
			const after = hash();
			return [r, before === after ? "restored" : "not restored " + after];
		});
	}

	// Embarking needs a unit on a port or an airfield with transports left, which the recorded
	// states rarely have: a ground unit of the player is put on a free one, then embarks
	function transportDrill(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		for (const [terrain, field] of [[env.terrainType.Airfield, "airTransports"], [env.terrainType.Port, "navalTransports"]]) {
			const hexes = [];
			for (let r = 0; r < m.rows; r++)
				for (let c = 0; c < m.cols; c++)
					if (m.map[r][c].terrain == terrain && !m.map[r][c].unit && !m.map[r][c].airunit) hexes.push(m.map[r][c]);
			const units = ownUnits(player).filter((u) => GR.isGround(u) && !u.hasMoved);
			if (!hexes.length || !units.length) continue;
			const hex = hexes[pick(hexes.length)], u = units[pick(units.length)];
			const p = hex.getPos();
			check("embark drill", ctx + " " + field + " unit#" + u.id + " at " + p.row + "," + p.col, () => {
				place(u, hex);
				if (!(player[field] > 0)) player[field] = 1;
				const can = GR.canEmbark(m.map, u);
				const r = can ? m.embarkUnit(u) : "can't";
				const back = GR.canDisembark(m.map, u) ? m.disembarkUnit(u) : "can't";
				return [can, r, back, contractUnitState(u), hash()];
			});
		}
	}

	// Undo is for a human player's last move: a move, then the undo, as a human player
	function undoDrill(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		const units = ownUnits(player).filter((u) => GR.getMoveRange(m, u).length);
		if (!units.length) return;
		const u = units[pick(units.length)];
		const type = player.type, wasEnded = ended;
		player.type = PT.humanLocal;
		try {
			check("undo drill", ctx + " unit#" + u.id, () => {
				m.selectUnit(u);
				const cells = GR.getMoveRange(m, u);
				const mv = move(u, cells[pick(cells.length)]);
				const can = m.canUndoMove(u);
				return [mv, can, can ? m.undoLastMove() : "can't", contractUnitState(u), hash()];
			});
		} finally { player.type = type; ended = wasEnded; }
	}

	// Capturing the last objective wins: a unit of the player that can capture is put next to a
	// free victory hex its side has to take, the side's other ones are counted as taken, and it
	// moves there as the game moves it
	function captureDrill(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		const side = player.side;
		const targets = m.sidesVictoryHexes[side].filter((c) => !m.map[c.row][c.col].unit);
		const units = ownUnits(player).filter((u) => GR.isGround(u) && GR.canCapture(u) && !u.hasMoved);
		if (!targets.length || !units.length) return;
		const t = targets[pick(targets.length)], first = pick(units.length);
		drill("capture drill", ctx + " to " + t.row + "," + t.col, () => {
			// The first unit, from a random one on, and free neighbor it can move to the objective from
			let u = null, from = null;
			for (let i = 0; i < units.length && !from; i++) {
				u = units[(first + i) % units.length];
				for (const c of GR.getAdjacent(t.row, t.col)) {
					if (c.row < 0 || c.col < 0 || c.row >= m.rows || c.col >= m.cols) continue;
					const hex = m.map[c.row][c.col];
					if (hex.unit && hex.unit !== u) continue;
					if (u.getHex() !== hex) place(u, hex);
					if (GR.getMoveRange(m, u).some((x) => x.row == t.row && x.col == t.col && x.canMove)) { from = c; break; }
				}
			}
			if (!from) return "no way in";
			const own = m.sidesVictoryHexes[side];
			own.length = 0;
			own.push(t);
			const mv = move(u, t);
			return [u.id, from, mv, m.sidesVictoryHexes, player.prestige, logHash(), hash()];
		});
	}

	// A side losing its last unit loses: the other units of the enemy side are taken off, the last
	// one, down to 1 strength point, is attacked by a unit of the player
	function wipeOutDrill(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		const pairs = [];
		for (const u of ownUnits(player))
			for (const t of attackTargets(u)) pairs.push([u, t]);
		if (!pairs.length) return;
		const [a, d] = pairs[pick(pairs.length)];
		drill("wipe-out drill", ctx + " unit#" + a.id + " on unit#" + d.id, () => {
			for (const u of m.getUnits()) if (u.player.side == d.player.side && u !== d) u.destroyed = true;
			m.updateUnitList();
			d.strength = 1;
			const before = [m.hasAliveUnits(0), m.hasAliveUnits(1)];
			return [before, attack(a, d), logHash(), hash()];
		});
	}

	// The move costs on frozen and muddy ground (Scenario.setMoveTable), the towed units first
	function groundDrill(player, ctx) {
		const units = ownUnits(player).filter((u) => GR.isGround(u));
		const towed = units.filter((u) => u.unitData().movmethod == 4); // movMethod.towed
		const sample = towed.concat(units.filter((u) => towed.indexOf(u) < 0).slice(0, 3));
		if (!sample.length) return;
		const ground = sc.ground;
		try {
			for (const g of [0, 1, 2]) { // dry, frozen, mud
				sc.ground = g;
				sc.setMoveTable();
				check("ground drill", ctx + " ground " + g, () => sample.map((u) => [u.id, GR.getMoveRange(m, u),
					GR.getRetreatPosition(m.map, u, m.rows, m.cols)]));
			}
		} finally {
			sc.ground = ground;
			sc.setMoveTable();
		}
		check("ground drill", ctx + " back", hash);
	}

	// The partial hexes on the last row and column, as the loader sets them from the map image
	// (a restored save loses them, #54): the move ranges of the units near the edges
	function edgeDrill(player, ctx) {
		const units = ownUnits(player).filter((u) => {
			const p = u.getPos(), r = GR.getUnitMoveRange(u) + 1;
			return p.row >= m.rows - 1 - r || p.col >= m.cols - 1 - r;
		}).slice(0, 4);
		if (!units.length) return;
		const row = m.isLastRowPartial, col = m.isLastColPartial;
		try {
			for (const [r, c] of [[true, false], [false, true], [true, true]]) {
				m.isLastRowPartial = r;
				m.isLastColPartial = c;
				check("edge drill", ctx + " row " + r + " col " + c, () => units.map((u) => [u.id, GR.getMoveRange(m, u)]));
			}
		} finally {
			m.isLastRowPartial = row;
			m.isLastColPartial = col;
		}
	}

	// game.js endTurn (without the saves) and, for a human player, the rest of the UI's end turn
	function endTurn(player, ctx) {
		check("endTurn", ctx, () => {
			const lastSide = player.side, human = player.type == PT.humanLocal;
			sc.endTurn(); // Map.endTurn: the next AI player plans its turn here
			const defeat = sc.checkDefeat(lastSide, localSide);
			let deployed = null, log = logHash(), selected = null;
			if (defeat) {
				if (!ended) ended = { side: lastSide, kind: "turn limit", outcome: "lose" };
			} else {
				setCurrentSide();
				const turn = m.turn, id = m.currentPlayer.id;
				const waiting = sc.getReinforcements(turn, id).map((r) => r.id);
				alerts = [];
				const r = game.deployReinforcements(turn, id);
				const left = sc.getReinforcements(turn, id).map((x) => x.id);
				deployed = [r, waiting.filter((x) => left.indexOf(x) < 0), alerts];
				log = logHash();
				if (human) {
					CL.reset();
					selected = selectFirstUnit();
				}
			}
			return [defeat, sc.checkVictory(), deployed, selected, sc.dayTurn,
				[sc.date.getFullYear(), sc.date.getMonth(), sc.date.getDate()], ended, hash(), log];
		});
	}

	try {
		// Game.setupGameState after the load: the visible side; the UI selects a human's unit
		setCurrentSide();
		check("start", "", () => [localSide, game.spotSide, selectFirstUnit(), hash()]);
		// The state was restored from a save (record.js, runFixture): saving it again shows what the
		// load kept and what it lost
		check("saved game after loading", "", () => new env.GameState(game).exportGameState());
		const rng = contractRandom(31);
		const steps = (env.contractTurns || 2) * players.length;
		for (let t = 0; t < steps && !ended; t++) {
			const player = m.currentPlayer;
			const ctx = "turn " + m.turn + " player#" + player.id;
			const ai = isAI(player) ? player.handler : standIns[player.id];
			// An AI player planned in the previous end of turn; the first one as Map.endTurn did
			// before the export. A human player's turn starts now
			if (t == 0 || !isAI(player)) check("ai buildActions", ctx, () => { ai.buildActions(); return hash(); });
			for (let n = 0; n < 500 && !ended; n++) {
				let a = null, more = false;
				check("ai action", ctx + " #" + n, () => {
					a = ai.getAction();
					const r = play(a);
					more = r !== false;
					return a ? [action(a), r, hash()] : null;
				});
				if (!more) break;
			}
			if (ended) break;
			randomActions(player, ctx, rng);
			if (ended) break;
			transportDrill(player, ctx, rng);
			undoDrill(player, ctx, rng);
			captureDrill(player, ctx, rng);
			wipeOutDrill(player, ctx, rng);
			groundDrill(player, ctx);
			edgeDrill(player, ctx);
			queries(ctx);
			endTurn(player, ctx);
		}
		check("end", "", () => [ended, stateString()]);
		check("saved game", "", () => contractHash(new env.GameState(game).exportGameState()));
		check("combat log", "", () => contractSerialize(CL.log));
		check("equipment data", "", () => contractHash(contractSerialize(eqids.map((id) => env.Equipment.equipment[id]))));
		campaign();
		check("removeAllSideUnits", "", () => [m.removeAllSideUnits(0), m.removeAllSideUnits(1), hash()]);
	} finally {
		game.ui = realUI;
		game.spotSide = realSpotSide;
		players.forEach((p, i) => { p.handler = realHandlers[i]; });
	}
	return out;
}
