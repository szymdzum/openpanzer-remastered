// Builds dist/*.js from src/*.ts by blanking out the types (ts-blank-space): same lines and
// columns as the source, nothing added.
//   node scripts/build.mjs [--watch] [--out <dir>] [--mine <module,module>]
// --mine builds only those modules from the working tree and every other one from the last
// commit (git HEAD): parallel work on different modules doesn't test each other's half edits.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import tsBlankSpace from "ts-blank-space";

const SRC = "src";
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const DIST = arg("--out") || "dist";
const mine = arg("--mine") ? arg("--mine").split(",").filter(Boolean) : null;

function source(file) {
	const module = file.replace(/\.ts$/, "");
	if (!mine || mine.includes(module) || module === "modules")
		return fs.readFileSync(path.join(SRC, file), "utf8");
	return execFileSync("git", ["show", "HEAD:" + SRC + "/" + file], { encoding: "utf8", maxBuffer: 1 << 26 });
}

function build(file) {
	const out = path.join(DIST, file.replace(/\.ts$/, ".js"));
	fs.writeFileSync(out, tsBlankSpace(source(file)));
	return out;
}

fs.mkdirSync(DIST, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".ts"));
files.forEach(build);
console.log(`built ${files.length} files into ${DIST}/` + (mine ? ` (working tree: ${mine.join(", ")}, others from HEAD)` : ""));

if (process.argv.includes("--watch")) {
	console.log("watching src/");
	fs.watch(SRC, (event, file) => {
		if (!file || !file.endsWith(".ts") || !fs.existsSync(path.join(SRC, file))) return;
		try { console.log("built " + build(file)); } catch (e) { console.error(e.message); }
	});
}
