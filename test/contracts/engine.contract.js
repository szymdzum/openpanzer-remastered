// The engine contract: the AI plays every player of a game state for a few turns through Map,
// Unit, GameRules and Leaders, with random legal actions of every kind mixed in, and every step
// records its result and a hash of the whole state after it. Same recording and testing as the
// GameRules contract (see gamerules.contract.js). Uses contractRecorder, contractUnitState and
// contractHash from common.js.
//
// The driver below plays the actions the way the game does (game.js processAction, ui.js
// uiUnitMove, uiUnitAttack and uiAttackAnimationFinished) without the UI: the same calls on Map
// in the same order, so it tests the engine and stays the same on both sides.
//
//   runEngineContract({ GameRules, Equipment, AI, game, actionType, map, contractTurns })
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
	const GR = env.GameRules, m = env.map, A = env.actionType;
	const out = [];
	const check = contractRecorder(out);

	// The engine calls into the UI in one place: the AI after deploying its purchases
	const realUI = env.game.ui;
	env.game.ui = { handleReinforcementDeployment() {} };
	// Map.endTurn asks an AI player's handler for actions: the contract builds them itself
	m.getPlayers().forEach((p) => { p.handler = { buildActions() {} }; });

	function stateString() {
		const units = m.getUnits().map((u) => JSON.stringify(contractUnitState(u)));
		const players = m.getPlayers().map((p) => {
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
			JSON.stringify(m.sidesVictoryHexes)].join("|") + "\n" + units.join("\n") + "\n" + players.join("\n") + "\n" + hexes;
	}
	const hash = () => contractHash(stateString());

	function action(a) {
		return { type: a.type, param: (a.param || []).map((p) => p && typeof p.unitData === "function" ? "unit#" + p.id : p) };
	}

	// ui.js uiUnitAttack and uiAttackAnimationFinished, without animations and alerts
	function attack(a, d) {
		if (!a.getPos() || !d.getPos()) return "no position";
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
		const aState = contractUnitState(a), dState = contractUnitState(d);
		const aDestroyed = aOld - a.strength >= aOld, dDestroyed = dOld - d.strength >= dOld;
		if (aDestroyed || dDestroyed) m.updateUnitList();
		if (m.currentUnit) {
			if (a.destroyed && m.currentUnit.id == a.id) m.delCurrentUnit();
			else m.selectUnit(m.currentUnit);
			// (the UI reads currentUnit here even after deleting it: the driver checks it)
			if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
		}
		let retreat = null;
		if (!dDestroyed && GR.shouldDefenderRetreat(a, d, dOld)) {
			const r = GR.getRetreatPosition(m.map, d, m.rows, m.cols);
			if (r) retreat = m.retreatUnit(d, r);
			else { d.destroyed = true; m.updateUnitList(); retreat = "surrender"; }
		}
		return { cr, support, stopped, attacker: aState, defender: dState, retreat };
	}

	// game.js processAction (move) and ui.js uiUnitMove and uiMoveAnimationFinished
	function move(u, cell) {
		m.setMoveRange(u);
		const mr = m.moveUnit(u, cell.row, cell.col);
		let surprise = null;
		if (u.isSurprised && mr.surpriseCell) {
			const e = m.map[mr.surpriseCell.row][mr.surpriseCell.col].getAttackableUnit(u, false);
			surprise = e ? attack(u, e) : "nothing to attack";
			u.isSurprised = false;
		}
		return { mr, surprise, unit: contractUnitState(u) };
	}

	// game.js processAction: false ends the AI's turn
	function play(a) {
		const p = a.param;
		switch (a.type) {
			case A.move: return move(p[0], p[1]);
			case A.attack: return GR.isInAttackRange(p[0], p[1]) ? attack(p[0], p[1]) : "out of range";
			case A.resupply: return m.resupplyUnit(p[0]);
			case A.reinforce: return m.reinforceUnit(p[0], false);
			case A.mount: return m.mountUnit(p[0]);
			case A.umount: return m.unmountUnit(p[0]);
			case A.select: return m.selectUnit(p[0]);
			case A.endturn: return false;
			default: return null; // message, viewport, buy, deploy, upgrade: nothing on the map
		}
	}

	// Equipment the players can buy, for upgrades
	const countries = {};
	m.getPlayers().forEach((p) => [p.country].concat(p.supportCountries || []).forEach((c) => countries[c] = true));
	const allEqids = Object.keys(env.Equipment.equipment).map(Number).sort((a, b) => a - b);
	let eqids = allEqids.filter((id) => countries[env.Equipment.equipment[id].country]);
	if (!eqids.length) eqids = allEqids; // (no player country in the equipment's in some scenarios)
	const transports = eqids.filter((id) => env.Equipment.equipment[id].uclass == 7); // ground transport

	// What the AI never does: player actions of every kind on random units of the player
	function randomActions(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		const own = () => m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed && u.getPos());
		const kinds = ["move", "attack", "move", "attack", "resupply", "reinforce", "reinforce over", "mount",
			"unmount", "embark", "disembark", "upgrade", "undo", "select", "disband"];
		for (let i = 0; i < 12; i++) {
			const units = own();
			if (!units.length) return;
			const u = units[pick(units.length)];
			let kind = kinds[pick(kinds.length)];
			if (kind === "disband" && rng() < 0.8) kind = "select";
			const c = ctx + " #" + i + " unit#" + u.id;
			check("player " + kind, c, () => {
				let r;
				switch (kind) {
					case "move": {
						m.selectUnit(u);
						const cells = GR.getMoveRange(m, u);
						r = cells.length ? move(u, cells[pick(cells.length)]) : "can't move";
						break;
					}
					case "attack": {
						const cells = GR.getUnitAttackCells(m.map, u, m.rows, m.cols);
						const targets = cells.map((cell) => m.map[cell.row][cell.col].getAttackableUnit(u, false)).filter(Boolean);
						r = targets.length ? attack(u, targets[pick(targets.length)]) : "no target";
						break;
					}
					case "resupply": r = GR.canResupply(m.map, u) ? m.resupplyUnit(u) : "can't"; break;
					case "reinforce": r = GR.canReinforce(m.map, u) ? m.reinforceUnit(u, false) : "can't"; break;
					case "reinforce over": r = GR.canReinforce(m.map, u, true) ? m.reinforceUnit(u, true) : "can't"; break;
					case "mount": r = GR.canMount(u) ? m.mountUnit(u) : "can't"; break;
					case "unmount": r = GR.canUnmount(u) ? m.unmountUnit(u) : "can't"; break;
					case "embark": r = GR.canEmbark(m.map, u) ? m.embarkUnit(u) : "can't"; break;
					case "disembark": r = GR.canDisembark(m.map, u) ? m.disembarkUnit(u) : "can't"; break;
					case "upgrade": {
						const up = eqids[pick(eqids.length)];
						r = m.upgradeUnit(u.id, up, rng() < 0.5 || !transports.length ? -1 : transports[pick(transports.length)]);
						break;
					}
					case "undo": r = m.canUndoMove(u) ? m.undoLastMove() : "can't"; break;
					case "select": r = m.selectUnit(u); break;
					case "disband": r = m.disbandUnit(u.id); break;
				}
				return [r, hash()];
			});
		}
	}

	try {
		check("start", "", hash);
		const rng = contractRandom(31);
		const steps = (env.contractTurns || 2) * m.getPlayers().length;
		for (let t = 0; t < steps; t++) {
			const player = m.currentPlayer;
			const ctx = "turn " + m.turn + " player#" + player.id;
			const ai = new env.AI(player, m);
			check("ai buildActions", ctx, () => { ai.buildActions(); return hash(); });
			for (let n = 0; n < 500; n++) {
				let a = null, more = false;
				check("ai action", ctx + " #" + n, () => {
					a = ai.getAction();
					if (!a) return null;
					const r = play(a);
					more = r !== false;
					return [action(a), r, hash()];
				});
				if (!a || !more) break;
			}
			randomActions(player, ctx, rng);
			check("endTurn", ctx, () => { m.endTurn(); return hash(); });
		}
		check("end", "", stateString);
	} finally {
		env.game.ui = realUI;
	}
	return out;
}
