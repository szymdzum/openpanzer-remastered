// Compares two replay traces (baseline vs variant) and reports coverage of the tested modules.
// Usage: node harness/diff-traces.js baseline.json variant.json [coverage.json[,...] modules]
// Exit code 1 when the traces differ.
const fs = require("fs");
const [baseFile, varFile, coverageFile, modules] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const variant = JSON.parse(fs.readFileSync(varFile, "utf8"));

const { firstDiff, domDiff, short } = require("./difflib");

// coverageFile: one dump or a comma separated list (one per item)
const coverageFiles = coverageFile ? coverageFile.split(",").filter((f) => fs.existsSync(f)) : [];
if (coverageFiles.length && modules) {
	const { uncoveredLines, printUncovered } = require("./coverage");
	for (const mod of modules.split(",").filter(Boolean)) {
		const file = "src/" + mod + ".ts";
		printUncovered(file + " (replay)", fs.existsSync(file)
			? uncoveredLines(coverageFiles, "/src/" + mod + ".ts", file, process.env.SERVED + "/" + mod + ".js") : null);
	}
}

let different = 0;
console.log("\n== Replay diff");
for (let i = 0; i < base.length; i++) {
	const b = base[i], v = variant[i] || {};
	const problems = [];
	if (b.loaded !== v.loaded) problems.push(`loaded: baseline ${b.loaded}, variant ${v.loaded}`);
	// Errors raised in game timers run on the virtual clock, deterministic: a new one is a
	// difference. Errors from real browser events (image loads during scenario switches,
	// rendering) come and go with timing, so they are only a warning.
	// Compared by message: the same error raised through a src/ function has another stack.
	const message = (e) => e.split(" @ ")[0];
	const baseMessages = (b.errors || []).map(message);
	const newErrors = (v.errors || []).filter((e) => baseMessages.indexOf(message(e)) < 0);
	const timerErrors = newErrors.filter((e) => e.startsWith("[timer]"));
	if (timerErrors.length) problems.push("new errors in game timers: " + timerErrors.slice(0, 3).join(" | "));
	else if (newErrors.length) console.log(`warn ${b.item}: error in a browser event (timing noise): ${newErrors[0].slice(0, 200)}`);

	const n = Math.max(b.actions.length, (v.actions || []).length);
	for (let a = 0; a < n; a++) {
		const ba = b.actions[a], va = (v.actions || [])[a];
		if (!ba || !va || ba.hash !== va.hash || ba.domHash !== va.domHash || JSON.stringify(ba.action) !== JSON.stringify(va.action)) {
			const what = ba && va && ba.hash === va.hash && JSON.stringify(ba.action) === JSON.stringify(va.action) ? "DOM" : "state/action";
			problems.push(`first different action #${a} (turn ${ba ? ba.turn : va.turn}, ${what}): ` +
				`baseline ${short(ba && ba.action)} hash ${ba && ba.hash}, variant ${short(va && va.action)} hash ${va && va.hash}`);
			if (ba && va && ba.state && va.state) {
				const d = firstDiff(JSON.parse(ba.state), JSON.parse(va.state), "state");
				if (d) problems.push(`  state before it differs at ${d.path}: baseline ${short(d.baseline)}, variant ${short(d.variant)}`);
				if (ba.dom !== va.dom) problems.push("  DOM before it: " + domDiff(ba.dom, va.dom));
			} else {
				problems.push(`  rerun with FULL_FROM=${Math.max(0, a - 1)} to see the state that differs`);
			}
			break;
		}
	}
	for (let t = 0; t < Math.max(b.turns.length, (v.turns || []).length); t++) {
		const bt = b.turns[t], vt = (v.turns || [])[t];
		if (!bt || !vt) { problems.push(`turn snapshot #${t} missing in ${bt ? "variant" : "baseline"}`); break; }
		if (bt.state !== vt.state) {
			const d = firstDiff(JSON.parse(bt.state), JSON.parse(vt.state), "state");
			problems.push(`turn ${bt.turn} state differs at ${d.path}: baseline ${short(d.baseline)}, variant ${short(d.variant)}`);
			break;
		}
		if (bt.dom !== vt.dom) { problems.push(`turn ${bt.turn} DOM differs: ` + domDiff(bt.dom, vt.dom)); break; }
		if (JSON.stringify(bt.canvas) !== JSON.stringify(vt.canvas)) {
			const i = (bt.canvas || []).findIndex((c, k) => c !== (vt.canvas || [])[k]);
			problems.push(`turn ${bt.turn} canvas differs: baseline ${bt.canvas && bt.canvas[i]}, variant ${vt.canvas && vt.canvas[i]}`);
			break;
		}
	}
	if (b.restore || v.restore) {
		const br = b.restore || {}, vr = v.restore || {};
		if (br.ok !== vr.ok) problems.push(`save/restore ok: baseline ${br.ok}, variant ${vr.ok}`);
		else if (br.state !== vr.state) {
			const d = firstDiff(JSON.parse(br.state), JSON.parse(vr.state), "state");
			problems.push(`state after save/restore differs at ${d.path}: baseline ${short(d.baseline)}, variant ${short(d.variant)}`);
		}
	}
	const label = `${b.item} (${b.actions.length} actions, ${b.turns.length} turns${b.timedOut ? ", TIMED OUT" : ""})`;
	if (problems.length) { different++; console.log("DIFF " + label); problems.forEach((p) => console.log("     " + p)); }
	else console.log("same " + label);
}
console.log(different ? `\n${different} of ${base.length} items differ` : `\nall ${base.length} items identical`);
process.exit(different ? 1 : 0);
