// Lines of a source file that V8 precise coverage dumps never executed.
// coverageFiles: one dump or a list, a line counts as covered when any dump executed it.
// servedFile: the code the browser ran (the coverage offsets refer to it), line for line the
// source file: Vite serves src/ with the types blanked out and the import paths rewritten.
const fs = require("fs");

// Per line of the served code: "hit", "zero" or undefined (no code, or the script isn't in the dump)
function lineStates(coverageFile, urlSuffix, src) {
	const cov = JSON.parse(fs.readFileSync(coverageFile)).data.result.result;
	const script = cov.find((s) => s.url.split("?")[0].endsWith(urlSuffix)); // Vite adds ?t= to changed modules
	if (!script) return null;
	const text = src;
	// Innermost range wins: V8 lists nested ranges after the ones containing them
	const counts = new Int32Array(text.length).fill(-1);
	for (const fn of script.functions)
		for (const r of fn.ranges)
			for (let i = r.startOffset; i < Math.min(r.endOffset, text.length); i++) counts[i] = r.count;
	const states = [];
	let off = 0;
	for (const line of src.split("\n")) {
		let hit = false, zero = false;
		for (let c = 0; c < line.length; c++) {
			if (/\s/.test(line[c])) continue;
			if (counts[off + c] === 0) zero = true; else if (counts[off + c] > 0) hit = true;
		}
		states.push(hit ? "hit" : zero ? "zero" : undefined);
		off += line.length + 1;
	}
	return states;
}

function uncoveredLines(coverageFiles, urlSuffix, file, servedFile) {
	const src = fs.readFileSync(file, "utf8");
	const served = servedFile && fs.existsSync(servedFile) ? fs.readFileSync(servedFile, "utf8") : src;
	const all = [].concat(coverageFiles).filter((f) => fs.existsSync(f))
		.map((f) => lineStates(f, urlSuffix, served)).filter(Boolean);
	if (!all.length) return null;
	const lines = src.split("\n");
	const out = [];
	lines.forEach((line, i) => {
		const t = line.trim();
		const hit = all.some((s) => s[i] === "hit"), zero = all.some((s) => s[i] === "zero");
		if (zero && !hit && t && t !== "{" && t !== "}" && !t.startsWith("//")) out.push(`${String(i + 1).padStart(5)}: ${t}`);
	});
	return out;
}

function printUncovered(label, lines, max) {
	if (lines === null) { console.log(`\n== Coverage ${label}: not loaded`); return; }
	console.log(`\n== Coverage ${label}: ${lines.length} code lines never executed`);
	lines.slice(0, max || 80).forEach((l) => console.log(l));
	if (lines.length > (max || 80)) console.log(`   … ${lines.length - (max || 80)} more`);
}

module.exports = { uncoveredLines, printUncovered };
