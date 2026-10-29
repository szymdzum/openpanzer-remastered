//The code style the linter doesn't check: an opening brace goes on the line it belongs to
//(`function f() {`, `} else {`), never on a line of its own
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const root = path.join(__dirname, "..");
//(every folder under src/ and test/: the UI's src/view, the core, the contracts, the end-to-end test)
const files = ["src", "test"].flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true, encoding: "utf8" })
	.filter((f) => /\.(tsx?|js)$/.test(f)).map((f) => path.join(d, f)));

test("No opening brace on a line of its own", () => {
	const found: string[] = [];
	for (const f of files) {
		fs.readFileSync(path.join(root, f), "utf8").split("\n").forEach((line, i) => {
			if (/^\s*\{\s*(\/\/.*)?$/.test(line))
				found.push(f + ":" + (i + 1));
		});
	}
	expect(found).toEqual([]);
});

//The comment lines of the engine and the UI: the history that `git log` keeps and the lines too long to read.
//src/legacy/ is exempt (it goes away) and so is a generated file that says so in its first line.
const srcFiles = fs.readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" })
	.filter((f) => /\.tsx?$/.test(f) && !f.startsWith("legacy" + path.sep)).map((f) => path.join("src", f));
const history = /old UI|old engine|went in #|since #/i;
const maxComment = 120;

//A comment line: starts with a comment marker, or ends with a `// ...` that isn't inside a string or a URL.
function commentOf(line: string): string | null {
	if (/^\s*(\/\/|\/\*|\*)/.test(line))
		return line;
	const m = /^[^"'`]*?\s\/\/(.*)$/.exec(line);
	return m ? "//" + m[1] : null;
}

function commentLines(): { at: string; text: string }[] {
	const out: { at: string; text: string }[] = [];
	for (const f of srcFiles) {
		const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n");
		if (/generated/i.test(lines[0]))
			continue;
		lines.forEach((line, i) => {
			const text = commentOf(line);
			if (text !== null)
				out.push({ at: f + ":" + (i + 1), text });
		});
	}
	return out;
}

test("No history in a comment in src/ (the old UI, the old engine, \"went in #n\", \"since #n\")", () => {
	expect(commentLines().filter((c) => history.test(c.text)).map((c) => c.at)).toEqual([]);
});

test("No comment line in src/ is longer than 120 characters", () => {
	expect(commentLines().filter((c) => c.text.length > maxComment).map((c) => c.at)).toEqual([]);
});
