// Helpers shared by the contracts (test/contracts/*.contract.js): the recorder pastes this file
// before the contract into the reference's page, the test evaluates both together. Plain script.

function contractRandom(a) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

// JSON with sorted keys; units, players and hexes become ids, functions are left out
function contractSerialize(v) {
	const seen = [];
	return JSON.stringify(v, function(k, val) {
		if (typeof val === "function") return undefined;
		if (typeof val === "number" && !isFinite(val)) return String(val);
		if (val === undefined) return "undefined";
		if (val && typeof val === "object") {
			if (k !== "" && typeof val.unitData === "function") return "unit#" + val.id;
			const name = val.constructor && val.constructor.name;
			if (k !== "" && name === "Player") return "player#" + val.id;
			if (k !== "" && name === "Hex" && typeof val.getPos === "function") { const p = val.getPos(); return "hex#" + p.row + "," + p.col; }
			if (seen.indexOf(val) >= 0) return "[cycle]";
			seen.push(val);
			if (!Array.isArray(val)) {
				const sorted = {};
				for (const key of Object.keys(val).sort()) sorted[key] = val[key];
				return sorted;
			}
		}
		return val;
	});
}

// check(name, context, f): runs f with Math.random seeded per call (seed 1, 2, ...), records
// [name, context, serialized result or "THROW message"] in out
function contractRecorder(out) {
	const realRandom = Math.random;
	let seed = 1;
	return function check(name, context, f) {
		Math.random = contractRandom(seed++);
		let r;
		try { r = contractSerialize(f()); }
		catch (e) { r = "THROW " + e.message; }
		Math.random = realRandom;
		out.push([name, context, r]);
	};
}

// A unit as plain data: own fields, the transport's fields, the player's id and the position
function contractUnitState(u) {
	if (!u) return u;
	const o = {};
	for (const k of Object.keys(u).sort()) {
		const v = u[k];
		if (typeof v === "function") continue;
		if (k === "player") o[k] = v ? v.id : v;
		else if (k === "transport" && v) {
			const t = {};
			for (const tk of Object.keys(v).sort()) if (typeof v[tk] !== "function") t[tk] = v[tk];
			o[k] = t;
		}
		else o[k] = v;
	}
	const p = u.getPos ? u.getPos() : null;
	o.pos = p ? p.row + "," + p.col : null;
	return o;
}

// FNV-1a of a string, as 8 hex digits
function contractHash(s) {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
	return (h >>> 0).toString(16).padStart(8, "0");
}
