// Helpers shared by the trace diffs (diff-traces.js, ui-diff.js)

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

// First differing line of two DOM snapshots, with the element path above it
function domDiff(a, b) {
	const la = (a || "").split("\n"), lb = (b || "").split("\n");
	for (let i = 0; i < Math.max(la.length, lb.length); i++)
		if (la[i] !== lb[i]) {
			const ctx = [];
			let depth = parseInt(la[i] || lb[i]);
			for (let j = i - 1; j >= 0 && ctx.length < 3; j--) {
				const d = parseInt(la[j]);
				if (d < depth) { ctx.unshift(la[j].slice(0, 120)); depth = d; }
			}
			return `line ${i + 1} under [${ctx.join(" > ")}]: baseline ${short(la[i])}, variant ${short(lb[i])}`;
		}
	return "same";
}

const short = (v) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + "…" : s; };

module.exports = { firstDiff, domDiff, short };
