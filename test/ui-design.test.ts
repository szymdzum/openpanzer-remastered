//scripts/ui-design.mjs, which builds docs/ui's generated files: run on a copy of the script and of a small
//docs/ui in a temporary checkout, or for its check on the repo itself
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

test("The design CSS and the cards take their colours and font sizes from the tokens, and the generated tokens are up to date", () => {
	const run = spawnSync(process.execPath, [path.join(__dirname, "../scripts/ui-design.mjs"), "--check"], { encoding: "utf8" });
	expect(run.stderr).toBe("");
	expect(run.status).toBe(0);
});

test("The check finds a colour and a font size written in, and a map colour drawn in a card without its token", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-"));
	fs.cpSync(path.join(__dirname, "../scripts/ui-design.mjs"), path.join(root, "scripts", "ui-design.mjs"));
	fs.cpSync(path.join(__dirname, "../docs/ui/tokens.json"), path.join(root, "docs", "ui", "tokens.json"));
	fs.mkdirSync(path.join(root, "docs", "ui", "components", "Card"), { recursive: true });
	fs.writeFileSync(path.join(root, "docs", "ui", "README.md"), "<!-- gallery:start -->\n<!-- gallery:end -->\n");
	fs.writeFileSync(path.join(root, "docs", "ui", "components", "Card", "preview.html"), '<!-- @dsCard group="Test" -->\n<svg><path stroke="#F0B44A" fill="#123456"/></svg>\n');
	fs.writeFileSync(path.join(root, "docs", "ui", "components", "bundle.css"), ".a { color: #123456; box-shadow: 0 1px 0 rgba(0, 0, 0, .3); }\n.b { font: 700 12px/16px var(--font-ui); }\n.c { font-size: var(--type-note-size); }\n");
	fs.mkdirSync(path.join(root, "src", "view"), { recursive: true });
	fs.writeFileSync(path.join(root, "src", "view", "x.css"), ".d { font-size: 9px; }\n");
	const script = path.join(root, "scripts", "ui-design.mjs");
	expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(0);
	const run = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
	expect(run.status).toBe(1);
	expect(run.stderr.trim().split("\n")).toEqual([
		"docs/ui/components/bundle.css:1: colour #123456 written in, not a var(--…) of tokens.css",
		"docs/ui/components/bundle.css:2: font size 12px written in, not a var(--type-…-size) of tokens.css",
		"src/view/x.css:1: font size 9px written in, not a var(--type-…-size) of tokens.css",
		"docs/ui/components/Card/preview.html:2: stroke #F0B44A written in, not var(--hex-select)",
	]);
	fs.writeFileSync(path.join(root, "docs", "ui", "tokens.css"), "");
	expect(spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" }).stderr).toContain("docs/ui/tokens.css: older than tokens.json");
});
