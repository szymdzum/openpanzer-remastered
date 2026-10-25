//scripts/ui-design.mjs, which builds docs/ui's generated files: run on a copy of the script and of a small
//docs/ui in a temporary checkout
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("The design script runs from a checkout path with spaces and non-ASCII characters, and writes a card's subtitle as it is (#370)", () => {
	const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-")), "a checkout ż");
	const ui = path.join(root, "docs", "ui");
	fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
	fs.mkdirSync(path.join(ui, "components", "Card"), { recursive: true });
	fs.copyFileSync(path.join(__dirname, "../scripts/ui-design.mjs"), path.join(root, "scripts", "ui-design.mjs"));
	fs.copyFileSync(path.join(__dirname, "../docs/ui/tokens.json"), path.join(ui, "tokens.json"));
	//$& and $' are what String.replace expands in a replacement string
	const subtitle = "costs $& and $' and $1";
	fs.writeFileSync(path.join(ui, "components", "Card", "preview.html"), `<!-- @dsCard group="Test" subtitle="${subtitle}" -->\n<div></div>\n`);
	fs.writeFileSync(path.join(ui, "README.md"), "# UI\n\n<!-- gallery:start -->\n<!-- gallery:end -->\n");
	const run = spawnSync(process.execPath, [path.join(root, "scripts", "ui-design.mjs")], { encoding: "utf8" });
	expect(run.stderr).toBe("");
	expect(run.status).toBe(0);
	expect(fs.readFileSync(path.join(ui, "README.md"), "utf8")).toContain(`| Card<br>[render](renders/Card.webp) | ${subtitle} |`);
});
