// Builds what docs/ui needs from its sources: tokens.css from tokens.json, components.json (the
// list the viewer and the README read, from each preview's @dsCard line) and, with --render, a
// WebP render of every preview in renders/ (headless Chrome, then cwebp). The previews are HTML
// fragments: tokens.css, components/bundle.css and components/bundle.js turn them into pages.
//
//   node scripts/ui-design.mjs            tokens.css and components.json
//   node scripts/ui-design.mjs --render   the same, then renders/<Name>.webp (one Chrome at a time)
//   node scripts/ui-design.mjs --render HudDesktop TurnStart   only those
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "ui");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");

//A token's value in a theme; a token with one value has it in every theme
function tokenValue(k, id, fallback) {
	return typeof k.value === "string" ? k.value : (k.value[id] ?? k.value[fallback]);
}

function themeBlock(t, id, selector) {
	const rows = ["color", "shadow"].flatMap((g) => t[g].tokens).map((k) => `\t--${k.name}: ${tokenValue(k, id, t.color.themes[0].id)};\n`);
	return `${selector} {\n${rows.join("")}}\n`;
}

//One block per theme: the first theme is also :root
function tokensCss() {
	const t = JSON.parse(read("tokens.json"));
	const [first, ...rest] = t.color.themes.map((x) => x.id);
	const blocks = [themeBlock(t, first, `:root, [data-theme="${first}"]`), ...rest.map((id) => themeBlock(t, id, `[data-theme="${id}"]`))];
	const fixed = ["spacing", "radius", "size", "zIndex"].flatMap((g) => t[g].tokens).map((k) => `\t--${k.name}: ${k.value};\n`);
	const fonts = Object.entries(t.type.families).map(([k, v]) => `\t--font-${k}: ${v};\n`);
	return "/* Generated from tokens.json by scripts/ui-design.mjs. Do not edit. */\n" + blocks.join("") + `:root {\n${fixed.join("")}${fonts.join("")}}\n`;
}

const CARD_DEFAULTS = { group: "Other", width: "1000", height: "800", subtitle: "" };

//The attributes of a preview's @dsCard line: its group, size and one-line subtitle
function cardAttrs(head) {
	const attrs = { ...CARD_DEFAULTS };
	for (const m of head.matchAll(/(\w+)=(?:"([^"]*)"|(\d+))/g)) attrs[m[1]] = m[2] ?? m[3];
	return attrs;
}

function card(name) {
	const a = cardAttrs(read(`components/${name}/preview.html`).split("\n")[0]);
	return { name, group: a.group, width: Number(a.width), height: Number(a.height), subtitle: a.subtitle,
		readme: fs.existsSync(path.join(dir, "components", name, "README.md")) };
}

function manifest() {
	return fs.readdirSync(path.join(dir, "components")).sort()
		.filter((name) => fs.existsSync(path.join(dir, "components", name, "preview.html"))).map(card);
}

//A preview as a page of its own, written next to index.html so the assets/ paths resolve
function page(name, theme) {
	const css = read("tokens.css") + read("components/bundle.css");
	return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>body{margin:0}${css}</style><script>${read("components/bundle.js")}</script></head><body>${read(`components/${name}/preview.html`)}</body></html>`;
}

function shoot(c, tmp, png) {
	fs.writeFileSync(tmp, page(c.name, "paper"));
	//Chrome can exit non-zero on its teardown after it wrote the screenshot: the file decides
	fs.rmSync(png, { force: true });
	spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
		"--virtual-time-budget=4000", `--window-size=${c.width},${c.height}`, `--screenshot=${png}`, `file://${tmp}`], { stdio: "ignore" });
	if (!fs.existsSync(png)) throw new Error(`no screenshot of ${c.name}`);
	execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", path.join(dir, "renders", `${c.name}.webp`)]);
	console.log(c.name);
}

function render(list, only) {
	const picked = only.length ? list.filter((c) => only.includes(c.name)) : list;
	const tmp = path.join(dir, "_render.html");
	const png = path.join(dir, "_render.png");
	fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
	try {
		for (const c of picked) shoot(c, tmp, png);
	} finally {
		fs.rmSync(tmp, { force: true });
		fs.rmSync(png, { force: true });
	}
}

//README.md's gallery, between its two markers: every card by group, its render and its README
function gallery(list) {
	const file = path.join(dir, "README.md");
	const readme = fs.readFileSync(file, "utf8");
	let md = "<!-- gallery:start (written by scripts/ui-design.mjs) -->\n";
	for (const [group, items] of Map.groupBy(list, (c) => c.group)) {
		md += `\n### ${group}\n\n| Card | What it shows |\n|---|---|\n`;
		for (const c of items) {
			const name = c.readme ? `[${c.name}](components/${c.name}/README.md)` : c.name;
			md += `| ${name}<br>[render](renders/${c.name}.webp) | ${c.subtitle.replaceAll("|", "\\|")} |\n`;
		}
	}
	md += "\n<!-- gallery:end -->";
	fs.writeFileSync(file, readme.replace(/<!-- gallery:start[\s\S]*<!-- gallery:end -->/, () => md));
}

fs.writeFileSync(path.join(dir, "tokens.css"), tokensCss());
const list = manifest();
fs.writeFileSync(path.join(dir, "components.json"), JSON.stringify(list, null, "\t") + "\n");
gallery(list);
const args = process.argv.slice(2);
if (args[0] === "--render") render(list, args.slice(1));
