// The engine contract: the AI plays every player of a game state for a few turns through Map,
// Unit, GameRules, Leaders and Scenario, with random legal actions of every kind mixed in, and
// every step records its result and a hash of the whole state after it. Then the campaign
// functions, and hashes of the saved game, the combat log and the equipment data. Same recording and testing as the
// GameRules contract (see gamerules.contract.js). Uses contractRecorder, contractUnitState and
// contractHash from common.js.
//
// The driver below plays the actions the way the game does (game.js processAction, ui.js
// uiUnitMove, uiUnitAttack and uiAttackAnimationFinished) without the UI: the same calls on Map
// in the same order, so it tests the engine and stays the same on both sides.
//
//   runEngineContract({ GameRules, Equipment, AI, GameState, CombatLog, game, actionType,
//     playerType, terrainType, map, scenario, contractTurns })
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
	const GR = env.GameRules, m = env.map, A = env.actionType, CL = env.CombatLog;
	const out = [];
	const check = contractRecorder(out);
	// The combat log holds what was played before the export: start empty on both sides
	CL.reset();

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
	function randomActions(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		for (let i = 0; i < 20; i++) {
			const kind = kindNames[pick(kindNames.length)];
			const units = m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed && u.getPos() && kinds[kind].can(u));
			const u = units.length ? units[pick(units.length)] : null;
			check("player " + kind, ctx + " #" + i + (u ? " unit#" + u.id : " no unit"), () => [u ? kinds[kind].run(u, pick, rng) : null, hash()]);
		}
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
			const ps = m.getPlayers();
			return {
				alive: [m.hasAliveUnits(0), m.hasAliveUnits(1)],
				countries: [m.getCountriesBySide(0), m.getCountriesBySide(1)],
				byCountry: ps.map((p) => m.getPlayersByCountry(p.country).map((x) => x.id)),
				players: ps.map((p) => [p.getCountryName(), p.getSideName(), p.hasUndeployedUnits()]),
				deploy: [m.getDeployHexes(0), m.getDeployHexes(1)],
				images: m.getUnitImagesList(),
			};
		});
		const sc = env.scenario;
		check("scenario queries", ctx, () => m.getPlayers().map((p) => [sc.getPrototypeUnitsAvailable(p.country),
			sc.getRandomPrototype(p.country), sc.getBalancedPrestige(p.side)]));
		// The defeat and victory checks at the turn limit
		check("turn limit", ctx, () => {
			const turn = m.turn;
			m.turn = m.maxTurns;
			try { return [sc.checkDefeat(0, 2), sc.checkDefeat(1, 2), sc.checkDefeat(0, 0), sc.checkDefeat(1, 1), sc.checkVictory()]; }
			finally { m.turn = turn; }
		});
	}

	// game.js deployReinforcements, without the alerts
	function deployReinforcements(turn, playerId) {
		const deployed = [];
		for (const r of env.scenario.getReinforcements(turn, playerId)) {
			const cell = m.deployReinforcement(r.unit, r.row, r.col);
			if (cell === null) continue;
			CL.addReinforcement(r.unit);
			env.scenario.removeReinforcement(r.turn, r.id);
			deployed.push([r.id, cell]);
		}
		return deployed;
	}
	const logHash = () => contractHash(contractSerialize(CL.log));

	// The campaign side of Map and Player, each step on every player in turn as a campaign does
	function campaign() {
		const ps = m.getPlayers();
		for (const p of ps) check("buildCoreUnitList", "player#" + p.id, () => [m.buildCoreUnitList(p), hash()]);
		for (const p of ps) check("dossier", "player#" + p.id, () => {
			p.initDossier();
			const u = m.getUnits().find((x) => x.player.id == p.id);
			if (u) p.addDestroyedUnitToDossier(u);
			p.addOutcomeToDossier("victory", "contract");
			const other = ps.find((x) => x.id != p.id);
			if (other) other.copyDossier(p);
			return [p.dossier, other ? other.dossier : null];
		});
		// (a copy of the list, as the saved list the game passes: the function adds to the player's)
		for (const p of ps) check("restoreCoreUnitList", "player#" + p.id, () => [m.restoreCoreUnitList(p, p.getCoreUnitList().slice()), hash()]);
		for (const p of ps) check("removeNonCampaignUnits", "player#" + p.id, () => [m.removeNonCampaignUnits(p), hash()]);
		for (const p of ps) check("setPlayerToHQ", "player#" + p.id, () => [p.setPlayerToHQ(), hash()]);
		for (const p of ps) check("removeUndeployedCoreUnit", "player#" + p.id, () => [p.removeUndeployedCoreUnit(0), hash()]);
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

	// Embarking needs a unit on a port or an airfield with transports left, which the recorded
	// states rarely have: a ground unit of the player is put on a free one, then embarks
	function transportDrill(player, ctx, rng) {
		const pick = (n) => Math.floor(rng() * n);
		for (const [terrain, field] of [[env.terrainType.Airfield, "airTransports"], [env.terrainType.Port, "navalTransports"]]) {
			const hexes = [];
			for (let r = 0; r < m.rows; r++)
				for (let c = 0; c < m.cols; c++)
					if (m.map[r][c].terrain == terrain && !m.map[r][c].unit && !m.map[r][c].airunit) hexes.push(m.map[r][c]);
			const units = m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed && u.getPos() && GR.isGround(u) && !u.hasMoved);
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
		const units = m.getUnits().filter((u) => u.player.id == player.id && !u.destroyed && u.getPos() && GR.getMoveRange(m, u).length);
		if (!units.length) return;
		const u = units[pick(units.length)];
		const type = player.type;
		player.type = env.playerType.humanLocal;
		try {
			check("undo drill", ctx + " unit#" + u.id, () => {
				m.selectUnit(u);
				const cells = GR.getMoveRange(m, u);
				const mv = move(u, cells[pick(cells.length)]);
				const can = m.canUndoMove(u);
				return [mv, can, can ? m.undoLastMove() : "can't", contractUnitState(u), hash()];
			});
		} finally { player.type = type; }
	}

	try {
		check("start", "", hash);
		// The state was restored from a save (record.js, runFixture): saving it again shows what the
		// load kept and what it lost
		check("saved game after loading", "", () => new env.GameState(env.game).exportGameState());
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
			transportDrill(player, ctx, rng);
			undoDrill(player, ctx, rng);
			queries(ctx);
			// game.js endTurn without the UI and the saving: Scenario.endTurn, the defeat check for
			// both sides, then the next player's reinforcements
			check("endTurn", ctx, () => {
				const lastSide = player.side;
				env.scenario.endTurn();
				const r = [env.scenario.checkDefeat(lastSide, 2), env.scenario.checkVictory(),
					deployReinforcements(m.turn, m.currentPlayer.id), env.scenario.dayTurn,
					[env.scenario.date.getFullYear(), env.scenario.date.getMonth(), env.scenario.date.getDate()]];
				return [r, hash(), logHash()];
			});
		}
		check("end", "", stateString);
		check("saved game", "", () => contractHash(new env.GameState(env.game).exportGameState()));
		check("combat log", "", () => contractSerialize(CL.log));
		check("equipment data", "", () => contractHash(contractSerialize(eqids.map((id) => env.Equipment.equipment[id]))));
		campaign();
		check("removeAllSideUnits", "", () => [m.removeAllSideUnits(0), m.removeAllSideUnits(1), hash()]);
	} finally {
		env.game.ui = realUI;
	}
	return out;
}
