// The GameRules contract: a fixed sequence of GameRules calls on a game state, every result
// serialized. contracts/record.sh runs it on the reference (reference/) in the browser and
// stores the results with the state; test/gamerules.test.ts runs it on this repo's GameRules in
// Node on the same state and compares. Plain script (no imports or exports): the recorder pastes
// it into the page, the test evaluates it. Adapted from openpanzer-src harness/compare.js.
// Uses contractRandom and contractSerialize from common.js.
//
//   runGameRulesContract({ GameRules, Equipment, terrainType, leaderType, map, fuzzRounds })
//     -> [[name, context, serialized result], ...]

function runGameRulesContract(env) {
	const GR = env.GameRules, m = env.map;
	const out = [];
	const realRandom = Math.random;
	let seed = 1;

	function check(name, context, f) {
		Math.random = contractRandom(seed++);
		let r;
		try { r = contractSerialize(f()); }
		catch (e) { r = "THROW " + e.message; }
		Math.random = realRandom;
		out.push([name, context, r]);
	}

	// What setZOCRange/setSpotRange touch: per-side ZOC/spot flags and tempSpotted
	function mapSnapshot() {
		let s = "";
		for (let r = 0; r < m.rows; r++)
			for (let c = 0; c < m.cols; c++) {
				const h = m.map[r][c];
				s += (+h.isZOC(0)) + "" + (+h.isZOC(1)) + (+h.isSpotted(0)) + (+h.isSpotted(1));
			}
		return s + "|" + m.getUnits().map((u) => u.id + ":" + !!u.tempSpotted).join(",");
	}

	// Calls fn(true), records its result and the map, then fn(false) undoes the counters
	function checkMapMutation(name, context, fn) {
		const tempSpotted = m.getUnits().map((x) => x.tempSpotted);
		let r;
		try {
			r = contractSerialize(fn(true)) + "|" + mapSnapshot();
			fn(false);
		} catch (e) { r = "THROW " + e.message; }
		m.getUnits().forEach((x, i) => x.tempSpotted = tempSpotted[i]);
		out.push([name, context, r]);
	}

	// Equipment of the players' countries, sorted: Equipment holds whatever was loaded before
	const countries = {};
	m.getPlayers().forEach((p) => [p.country].concat(p.supportCountries || []).forEach((c) => countries[c] = true));
	const eqids = Object.keys(env.Equipment.equipment).map(Number)
		.filter((id) => countries[env.Equipment.equipment[id].country]).sort((a, b) => a - b);

	function testPure() {
		const rng = contractRandom(42);
		const pick = (n) => Math.floor(rng() * n);
		for (let i = 0; i < 100; i++) {
			const c = [pick(40), pick(40), pick(40), pick(40)];
			check("distance", c.join(","), () => GR.distance(...c));
			check("getDirection(random)", c.join(","), () => GR.getDirection(...c));
			check("getAdjacent", c.join(","), () => GR.getAdjacent(c[0], c[1]));
			const e = [0, 0, 0, 0].map(() => eqids[pick(eqids.length)]);
			check("calculateUnitCosts", e.join(","), () => [GR.calculateUnitCosts(e[0], e[1]), GR.calculateUnitCosts(e[2], -1),
				GR.calculateUnitCosts(-1, e[3]), GR.calculateUnitCosts(undefined, undefined)]);
		}
		check("facingToAdjacentIndex", "", () => [...Array(18).keys()].map((f) => GR.facingToAdjacentIndex(f - 1)));
		check("isCloseCombatTerrain", "", () => [...Array(18).keys()].map((t) => GR.isCloseCombatTerrain(t)));
		check("isLossOverRetreatThreshold", "", () => {
			const r = [];
			for (let s = 0; s <= 15; s++) for (let o = 1; o <= 15; o++) r.push(GR.isLossOverRetreatThreshold(s, o));
			return r;
		});
		check("isTransportable", "", () => [0, -1, undefined].concat(eqids).map((e) => GR.isTransportable(e)));
		check("rollDice", "", () => [...Array(200)].map(() => GR.rollDice(1, 20)));
	}

	// Guards the game states never reach: null units, units with no position
	function testEdges() {
		const grid = m.map, rows = m.rows, cols = m.cols;
		const u = m.getUnits()[0];
		const offMap = Object.create(u, { getPos: { value: () => undefined } });
		check("null guards", "", () => [
			GR.getUnitAttackRange(null), GR.getUnitSpotRange(null), GR.setZOCRange(grid, null, true, rows, cols),
			GR.setSpotRange(grid, null, true, rows, cols), GR.getRetreatPosition(grid, null, rows, cols),
			GR.calculateUpgradeCosts(null), GR.calculateUnitCostPerStrength(null), GR.calculateUnitSellCost(undefined),
			GR.canInitiateAttack(null, u), GR.canInitiateAttack(u, null), GR.canFire(null, u), GR.canFire(u, null),
			GR.isEnemy(null, u), GR.isEnemy(u, null), GR.isAir(null), GR.isSea(null), GR.isGround(null), GR.isTrain(null),
			GR.canEntrench(null), GR.getMoveRange(m, null), GR.getUnitAttackCells(grid, null, rows, cols)
		]);
		check("off map unit", "", () => [
			GR.setZOCRange(grid, offMap, true, rows, cols), GR.setSpotRange(grid, offMap, true, rows, cols),
			GR.isInAttackRange(offMap, u), GR.isInAttackRange(u, offMap)
		]);
	}

	function fuzzUnits(rng) {
		const pick = (n) => Math.floor(rng() * n);
		const maxLeader = Math.max(...Object.values(env.leaderType));
		for (const u of m.getUnits()) {
			const ud = u.unitData(true);
			u.leader = rng() < 0.5 ? -1 : 1 + pick(maxLeader);
			u.experience = pick(600);
			u.entrenchment = pick(6);
			u.hits = pick(5);
			u.isSurprised = rng() < 0.1;
			u.hasMoved = rng() < 0.3;
			u.hasFired = rng() < 0.2;
			u.hasResupplied = rng() < 0.2;
			u.hasOverstrength = rng() < 0.1;
			u.strength = 1 + pick(15);
			u.ammo = pick(ud.ammo + 1);
			u.fuel = pick(ud.fuel + 1);
			u.tempSpotted = rng() < 0.2;
			u.facing = pick(16);
			u.destroyed = rng() < 0.05;
			if (u.transport !== null) {
				u.isMounted = rng() < 0.3;
				u.transport.ammo = pick(u.transport.unitData().ammo + 1);
				u.transport.fuel = pick(u.transport.unitData().fuel + 1);
			}
		}
	}

	function testState(label, rng) {
		const units = m.getUnits();
		const grid = m.map, rows = m.rows, cols = m.cols;
		const pick = (n) => Math.floor(rng() * n);

		for (const u of units) {
			const ctx = label + " unit#" + u.id;
			const p = u.getPos();
			check("getMoveRange", ctx, () => GR.getMoveRange(m, u));
			check("getUnitMoveRange", ctx, () => GR.getUnitMoveRange(u));
			check("getUnitAttackCells", ctx, () => GR.getUnitAttackCells(grid, u, rows, cols));
			check("getUnitAttackRange", ctx, () => GR.getUnitAttackRange(u));
			check("getUnitSpotRange", ctx, () => GR.getUnitSpotRange(u));
			check("canResupply", ctx, () => GR.canResupply(grid, u));
			check("getResupplyValue", ctx, () => GR.getResupplyValue(grid, u));
			check("getResupplyValue(turnStart)", ctx, () => GR.getResupplyValue(grid, u, true));
			check("canReinforce", ctx, () => GR.canReinforce(grid, u));
			check("canReinforce(over)", ctx, () => GR.canReinforce(grid, u, true));
			check("getReinforceValue", ctx, () => GR.getReinforceValue(grid, u));
			check("getReinforceValue(over)", ctx, () => GR.getReinforceValue(grid, u, true));
			check("canCapture", ctx, () => GR.canCapture(u));
			check("canEntrench", ctx, () => GR.canEntrench(u));
			check("canMount", ctx, () => GR.canMount(u));
			check("canUnmount", ctx, () => GR.canUnmount(u));
			check("getEmbarkType", ctx, () => GR.getEmbarkType(grid, u));
			check("canEmbark", ctx, () => GR.canEmbark(grid, u));
			check("getDisembarkPositions", ctx, () => GR.getDisembarkPositions(grid, u));
			check("canDisembark", ctx, () => GR.canDisembark(grid, u));
			check("isAir/isSea/isGround/isTrain", ctx, () => [GR.isAir(u), GR.isSea(u), GR.isGround(u), GR.isTrain(u)]);
			check("unitUsesFuel/Ammo", ctx, () => [GR.unitUsesFuel(u), GR.unitUsesAmmo(u)]);
			check("unitLowFuel/Ammo", ctx, () => [1, 3, 5, 10].map((t) => [GR.unitLowFuel(u, t), GR.unitLowAmmo(u, t)]));
			check("calculateUnitCostPerStrength", ctx, () => GR.calculateUnitCostPerStrength(u));
			check("calculateUnitSellCost", ctx, () => GR.calculateUnitSellCost(u));
			const up = eqids[pick(eqids.length)], tr = eqids[pick(eqids.length)];
			check("calculateUpgradeCosts", ctx, () => [
				GR.calculateUpgradeCosts(u), GR.calculateUpgradeCosts(u, u.eqid), GR.calculateUpgradeCosts(u, up),
				GR.calculateUpgradeCosts(u, up, -1), GR.calculateUpgradeCosts(u, up, tr),
				GR.calculateUpgradeCosts(u, -1, tr), GR.calculateUpgradeCosts(u, u.eqid, u.transport ? u.transport.eqid : tr)
			]);
			check("getRetreatPosition", ctx, () => GR.getRetreatPosition(grid, u, rows, cols));
			const rr = pick(rows), rc = pick(cols);
			check("getReinforcementDeployPositions", ctx, () => [
				GR.getReinforcementDeployPositions(grid, u, p.row, p.col),
				GR.getReinforcementDeployPositions(grid, u, rr, rc),
				GR.getReinforcementDeployPositions(grid, u, 0, 0),
				GR.getReinforcementDeployPositions(grid, u, rows - 1, cols - 1)
			]);
			checkMapMutation("setZOCRange", ctx, (on) => GR.setZOCRange(grid, u, on, rows, cols));
			checkMapMutation("setSpotRange", ctx, (on) => GR.setSpotRange(grid, u, on, rows, cols));

			const moveCells = GR.getMoveRange(m, u);
			if (moveCells.length > 0) {
				const target = moveCells[pick(moveCells.length)];
				check("getShortestPath", ctx, () => GR.getShortestPath(p, target, moveCells));
				check("canPassInto", ctx, () => moveCells.map((c) => GR.canPassInto(grid, u, c)));
			}

			// Unit pairs: every unit within 3 hexes, enemies and friends
			let pairs = 0;
			for (const v of units) {
				if (v === u || pairs >= 12) continue;
				const vp = v.getPos();
				if (GR.distance(p.row, p.col, vp.row, vp.col) > 3) continue;
				pairs++;
				const pctx = ctx + " vs unit#" + v.id;
				check("calculateAttackResults(estimate)", pctx, () => GR.calculateAttackResults(u, v, true));
				check("calculateAttackResults(dice)", pctx, () => GR.calculateAttackResults(u, v, false));
				check("calculateCombatResults", pctx, () => [
					GR.calculateCombatResults(u, v, units, true, true), GR.calculateCombatResults(u, v, units, false, true),
					GR.calculateCombatResults(u, v, units, true, false), GR.calculateCombatResults(u, v, units, false, false)
				]);
				check("canInitiateAttack/canFire", pctx, () => [GR.canInitiateAttack(u, v), GR.canFire(u, v)]);
				check("isInAttackRange/isEnemy", pctx, () => [GR.isInAttackRange(u, v), GR.isEnemy(u, v)]);
				check("getSupportFireUnits", pctx, () => GR.getSupportFireUnits(units, u, v));
				check("isRuggedDefense", pctx, () => GR.isRuggedDefense(u, v));
				check("isEntrenchmentIntact", pctx, () => Object.values(env.terrainType).map((t) => GR.isEntrenchmentIntact(u, v, t)));
				check("shouldDefenderRetreat", pctx, () => [1, 5, 10, 15].map((s) => GR.shouldDefenderRetreat(u, v, s)));
				check("getDirection", pctx, () => GR.getDirection(p.row, p.col, vp.row, vp.col));
			}
		}
	}

	testPure();
	testEdges();
	testState("start", contractRandom(7));
	for (let r = 0; r < (env.fuzzRounds || 0); r++) {
		fuzzUnits(contractRandom(100 + r));
		testState("fuzz" + r, contractRandom(200 + r));
	}
	return out;
}
