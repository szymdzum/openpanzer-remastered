// Page-side helpers for module unit tests (harness/unit.sh prepends this to the test file).
// The page runs the pure bundle; loadSrc() evaluates a reconstructed module in its own scope,
// so both versions live side by side: ORIG holds the bundle globals, SRC the module's.
//
//   const { ORIG, SRC } = await loadSrc("unit", ["Unit", "Transport"]);
//   await loadScenario("drpzop01.xml");
//   check("getMovesLeft", V => new V.Unit(42).getMovesLeft(), "eqid 42");
//
// check() runs f(ORIG) and f(SRC) with the same Math.random seed and compares the results
// serialized with sorted keys; units, players and hexes become ids.

// No prototype: a check named "constructor" or "toString" must get its own entry
const __stats = Object.create(null), __mismatches = [];
let __seed = 1;

function mulberry32(a) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

function serialize(v) {
	const seen = [];
	return JSON.stringify(v, function(k, val) {
		if (typeof val === "function") return undefined;
		if (typeof val === "number" && !isFinite(val)) return String(val);
		if (val === undefined) return "undefined";
		if (val && typeof val === "object") {
			if (typeof Node !== "undefined" && val instanceof Node) return "node";
			const name = val.constructor && val.constructor.name;
			if (k !== "" && (name === "Unit" || name === "Player")) return name + "#" + val.id;
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

async function loadSrc(name, exportNames) {
	const src = await (await fetch("/src/" + name + ".js", { cache: "no-store" })).text();
	const key = "__src_" + name;
	const script = document.createElement("script");
	// Prefix stays on line 1 so coverage maps back to the file's lines
	script.text = "window." + key + " = (function() { " + src + "\nreturn { " +
		exportNames.map((n) => n + ": typeof " + n + " !== 'undefined' ? " + n + " : undefined").join(", ") +
		" }; })();\n//# sourceURL=srctest/" + name + ".js";
	document.head.appendChild(script);
	const ORIG = {};
	for (const n of exportNames) ORIG[n] = window[n];
	return { ORIG, SRC: window[key] };
}

// Runs f(ORIG) and f(SRC) under the same seed, records a mismatch when results differ
function check(name, f, context) {
	const seed = __seed++;
	const out = [];
	const realRandom = Math.random;
	for (const V of [__impls.ORIG, __impls.SRC]) {
		Math.random = mulberry32(seed);
		try { out.push(serialize(f(V))); }
		catch (e) { out.push("THROW " + e.message); }
	}
	Math.random = realRandom;
	const s = __stats[name] || (__stats[name] = { n: 0, bad: 0, bothThrew: 0 });
	s.n++;
	// Both throwing the same error counts as a match, but is reported: it can hide a broken test
	if (out[0] === out[1] && out[0].startsWith("THROW ")) s.bothThrew++;
	if (out[0] !== out[1]) {
		s.bad++;
		if (__mismatches.filter((m) => m.name === name).length < 3)
			__mismatches.push({ name, context: context || "", orig: String(out[0]).slice(0, 400), src: String(out[1]).slice(0, 400) });
	}
}
let __impls = null;
function useImpls(impls) { __impls = impls; }

function loadScenario(file) {
	uiSettings.isAI = uiSettings.isAI.map(() => 0);
	const s = scenariolist.find((x) => x[0] === file);
	const old = game.scenario;
	game.newScenario(file, s ? s[2] : "");
	return new Promise((resolve) => {
		const start = Date.now();
		(function poll() {
			const sc = game.scenario;
			if (sc && sc !== old && sc.isLoaded && sc.map && sc.map.getUnits().length > 0) return resolve(sc);
			if (Date.now() - start > 30000) return resolve(null);
			setTimeout(poll, 50);
		})();
	});
}

function __summary() {
	return {
		calls: Object.values(__stats).reduce((a, s) => a + s.n, 0),
		mismatchedCalls: Object.values(__stats).reduce((a, s) => a + s.bad, 0),
		checks: Object.entries(__stats).map(([k, s]) => k + " " + (s.n - s.bad) + "/" + s.n
			+ (s.bothThrew ? " (" + s.bothThrew + " threw on both sides)" : "")),
		mismatches: __mismatches.slice(0, 15)
	};
}
