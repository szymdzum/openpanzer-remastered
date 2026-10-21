//The code style the linter doesn't check: an opening brace goes on the line it belongs to
//(`function f() {`, `} else {`), never on a line of its own
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const root = path.join(__dirname, "..");
const files = ["src", "test", "test/contracts"].flatMap((d) => fs.readdirSync(path.join(root, d))
	.filter((f) => /\.(ts|js)$/.test(f)).map((f) => path.join(d, f)));

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
