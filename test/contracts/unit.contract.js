// The Unit contract: every Unit method on a copy of every unit of a game state, the result and
// the unit's state after each call. Same recording and testing as the GameRules contract
// (see gamerules.contract.js). Uses contractRecorder and contractUnitState from common.js.
//
//   runUnitContract({ GameRules, Equipment, Unit, map }) -> [[name, context, serialized result], ...]

function runUnitContract(env) {
	const GR = env.GameRules, m = env.map;
	const out = [];
	const check = contractRecorder(out);

	// Equipment of the players' countries, sorted (as in the GameRules contract)
	const countries = {};
	m.getPlayers().forEach((p) => [p.country].concat(p.supportCountries || []).forEach((c) => countries[c] = true));
	const allEqids = Object.keys(env.Equipment.equipment).map(Number).sort((a, b) => a - b);
	let eqids = allEqids.filter((id) => countries[env.Equipment.equipment[id].country]);
	if (!eqids.length) eqids = allEqids; // (no player country in the equipment's in some scenarios)
	const transports = eqids.filter((id) => env.Equipment.equipment[id].uclass == 7); // ground transport

	// A fresh copy of u on u's hex: what the calls change stays off the map
	function copyOf(u) {
		const c = new env.Unit(u.eqid);
		c.copy(u);
		c.setHex(u.getHex());
		return c;
	}

	// Calls f on a copy and records its result with the copy's state after it
	function op(name, u, ctx, f) {
		const c = copyOf(u);
		check(name, ctx, () => [f(c), contractUnitState(c)]);
	}

	const rng = contractRandom(11);
	const pick = (n) => Math.floor(rng() * n);
	for (const u of m.getUnits()) {
		const ctx = "unit#" + u.id;
		check("state", ctx, () => contractUnitState(copyOf(u)));
		check("getters", ctx, () => {
			const c = copyOf(u);
			const ud = c.unitData(), udu = c.unitData(true);
			return [c.getEqid(), c.getEqid(true), c.getMovesLeft(), c.getAmmo(), c.getFuel(), c.getIcon(),
				ud ? ud.id : ud, udu ? udu.id : udu];
		});
		for (const losses of [0, 1, 3, 15]) op("hit(" + losses + ")", u, ctx, (c) => c.hit(losses));
		op("fire(attacking)", u, ctx, (c) => c.fire(true));
		op("fire(defending)", u, ctx, (c) => c.fire(false));
		const cost = pick(12);
		op("move", u, ctx + " cost " + cost, (c) => c.move(cost));
		op("entrench", u, ctx, (c) => c.entrench());
		op("mount", u, ctx, (c) => c.mount());
		op("mount/unmount", u, ctx, (c) => { c.mount(); return c.unmount(); });
		for (const t of [1, 2]) op("embark(" + t + ")", u, ctx, (c) => c.embark(t));
		op("toggleEmbark", u, ctx, (c) => c.toggleEmbark());
		op("toggleEmbark twice", u, ctx, (c) => { c.toggleEmbark(); return c.toggleEmbark(); });
		op("resupply(rules)", u, ctx, (c) => c.resupply(GR.getResupplyValue(m.map, u)));
		op("resupply(turn start)", u, ctx, (c) => c.resupply(GR.getResupplyValue(m.map, u, true)));
		const str = 1 + pick(6), over = rng() < 0.5;
		op("reinforce", u, ctx + " " + str + (over ? " over" : ""), (c) => c.reinforce(str, over));
		op("refillAmmoFuel", u, ctx, (c) => c.refillAmmoFuel());
		op("unitEndTurn", u, ctx, (c) => c.unitEndTurn());
		op("unitEndTurn after a move and a fight", u, ctx, (c) => { c.move(1); c.fire(true); c.hit(1); return c.unitEndTurn(); });
		const up = eqids[pick(eqids.length)];
		const tr = transports.length ? transports[pick(transports.length)] : -1;
		op("upgrade", u, ctx + " to " + up, (c) => c.upgrade(up, -1));
		op("upgrade with transport", u, ctx + " to " + up + "/" + tr, (c) => c.upgrade(up, tr));
		op("upgrade the transport only", u, ctx + " to " + tr, (c) => c.upgrade(-1, tr));
		op("setTransport", u, ctx + " " + tr, (c) => [c.setTransport(tr), c.setTransport(-1)]);
	}
	return out;
}
