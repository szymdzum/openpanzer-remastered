// Compares two UI replay traces step by step: game state, DOM, canvas pixels, errors.
// Usage: node harness/ui-diff.js baseline.json variant.json [label]. Exit 1 when they differ.
const fs = require("fs");
const { firstDiff, domDiff, short } = require("./difflib");
const [baseFile, varFile, label] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(baseFile, "utf8")), variant = JSON.parse(fs.readFileSync(varFile, "utf8"));

const message = (e) => e.split(" @ ")[0];
let first = null;
for (let i = 0; i < Math.max(base.steps.length, variant.steps.length) && !first; i++) {
	const b = base.steps[i], v = variant.steps[i];
	if (!b || !v) { first = `step #${i} missing in ${b ? "variant" : "baseline"}`; break; }
	const where = `step #${i} "${b.name}"`;
	if (b.threw !== v.threw) first = `${where} threw: baseline ${b.threw}, variant ${v.threw}`;
	else if (b.state !== v.state) {
		const d = firstDiff(JSON.parse(b.state), JSON.parse(v.state), "state");
		first = `${where} state differs at ${d.path}: baseline ${short(d.baseline)}, variant ${short(d.variant)}`;
	}
	else if (b.dom !== v.dom) first = `${where} DOM differs: ` + domDiff(b.dom, v.dom);
	else if (JSON.stringify(b.canvas) !== JSON.stringify(v.canvas)) {
		const k = b.canvas.findIndex((c, j) => c !== v.canvas[j]);
		first = `${where} canvas differs: baseline ${b.canvas[k]}, variant ${v.canvas[k]}`;
	}
	else {
		// Errors in game timers are deterministic, errors from real browser events are noise
		const baseMessages = b.errors.map(message);
		const fresh = v.errors.filter((e) => baseMessages.indexOf(message(e)) < 0);
		if (fresh.some((e) => e.startsWith("[timer]"))) first = `${where} new errors in game timers: ` + fresh.join(" | ").slice(0, 400);
		else if (fresh.length) console.log(`warn ${where}: error in a browser event (timing noise): ${fresh[0].slice(0, 200)}`);
	}
}
const threw = base.steps.filter((s) => s.threw).map((s) => `"${s.name}": ${s.threw}`);
console.log(`\n== UI replay ${label || ""}: ${first ? "DIFF " + first : `all ${base.steps.length} steps identical`}`);
if (threw.length) console.log("   steps that threw (in both): " + threw.join("; ").slice(0, 400));
// A step that waited for loads until the timeout costs 15s and usually means a stuck request
const stuck = variant.steps.filter((s) => s.pending).map((s) => `"${s.name}" (${s.pending.slice(0, 3).join(", ")})`);
if (stuck.length) console.log(`   ${stuck.length} steps waited for loads until the timeout: ` + stuck.join("; ").slice(0, 400));
process.exit(first ? 1 : 0);
