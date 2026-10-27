// Helpers of the trace diff (diff-traces.js)

// First differing path between two JSON values
function firstDiff(a, b, path) {
	if (JSON.stringify(a) === JSON.stringify(b)) return null;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b))
		return { path, baseline: a, variant: b };
	const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
	for (const k of keys) {
		const d = firstDiff(a[k], b[k], path + (Array.isArray(a) ? "[" + k + "]" : "." + k));
		if (d) return d;
	}
	return null;
}

const short = (v) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + "…" : s; };

module.exports = { firstDiff, short };
