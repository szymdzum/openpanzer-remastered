// Builds dist/*.js from src/*.ts by blanking out the types (ts-blank-space): same lines and
// columns as the source, nothing added. node scripts/build.mjs [--watch]
import fs from "node:fs";
import path from "node:path";
import tsBlankSpace from "ts-blank-space";

const SRC = "src", DIST = "dist";

function build(file) {
	const out = path.join(DIST, file.replace(/\.ts$/, ".js"));
	fs.writeFileSync(out, tsBlankSpace(fs.readFileSync(path.join(SRC, file), "utf8")));
	return out;
}

fs.mkdirSync(DIST, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".ts"));
files.forEach(build);
console.log(`built ${files.length} files into ${DIST}/`);

if (process.argv.includes("--watch")) {
	console.log("watching src/");
	fs.watch(SRC, (event, file) => {
		if (!file || !file.endsWith(".ts") || !fs.existsSync(path.join(SRC, file))) return;
		try { console.log("built " + build(file)); } catch (e) { console.error(e.message); }
	});
}
