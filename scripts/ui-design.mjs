// Builds what docs/ui needs from its sources: tokens.css from tokens.json, components.json (the
// list the viewer and the README read, from each preview's @dsCard line) and, with --render, a
// WebP render of every preview in renders/ (headless Chrome, then cwebp). The previews are HTML
// fragments: tokens.css, the components' CSS (src/view/library.css), components/bundle.css and
// components/bundle.js turn them into pages.
//
// It also writes src/view/tokens.ts, the same tokens for the canvas, which can't read CSS custom
// properties, and checks that the CSS and the cards take their colours and font sizes from the tokens.
//
//   node scripts/ui-design.mjs            tokens.css, tokens.ts and components.json
//   node scripts/ui-design.mjs --render   the same, then renders/<Name>.webp (one Chrome at a time)
//   node scripts/ui-design.mjs --render HudDesktop TurnStart   only those
//   node scripts/ui-design.mjs --check    writes nothing: fails on a value written outside the tokens,
//                                         or on a tokens.css or tokens.ts older than tokens.json
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "ui");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");
const view = path.join(dir, "..", "..", "src", "view");

//The components' CSS: src/view/library.css with its @imports written in, in their order
function libraryCss() {
	return fs.readFileSync(path.join(view, "library.css"), "utf8")
		.replace(/@import url\("\.\/([\w-]+\.css)"\);/g, (_, file) => fs.readFileSync(path.join(view, file), "utf8"));
}

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
	const fixed = FIXED.flatMap((g) => t[g].tokens).map((k) => `\t--${k.name}: ${k.value};\n`);
	const fonts = Object.entries(t.type.families).map(([k, v]) => `\t--font-${k}: ${v};\n`);
	//the type scale: each style's size and line height
	const type = styles(t).map((st) => `\t--type-${st.name}-size: ${st.fontSize};\n\t--type-${st.name}-line: ${st.lineHeight};\n`);
	//in the tokens layer, the layers' order declared first (docs/ui/handoff.md, CSS)
	const body = blocks.join("") + `:root {\n${fixed.join("")}${fonts.join("")}${type.join("")}}\n`;
	return "/* Generated from tokens.json by scripts/ui-design.mjs. Do not edit. */\n" + `${LAYERS}\n@layer tokens {\n${body}}\n`;
}

const LAYERS = "@layer reset, tokens, base, components, utilities;";

//The groups of tokens with one value in every theme
const FIXED = ["spacing", "radius", "size", "stroke", "zIndex", "motion"];

const styles = (t) => t.type.groups.flatMap((g) => g.styles);

const pixels = (length) => parseFloat(length) * (length.endsWith("rem") ? 16 : 1);
const quote = (key) => /^[a-z]+$/.test(key) ? key : JSON.stringify(key);
const entries = (pairs, indent) => pairs.map(([k, v]) => `${indent}${quote(k)}: ${JSON.stringify(v)},\n`).join("");

//The same tokens for the canvas: colours by theme and the map's own, which are the same in both;
//lengths in pixels (a rem is 16 of them at the default font size) and durations in milliseconds as numbers
function tokensTs() {
	const t = JSON.parse(read("tokens.json"));
	const colors = t.color.tokens;
	const themes = t.color.themes.map((th) => `\t\t${quote(th.id)}: {\n${entries(colors.filter((k) => typeof k.value !== "string").map((k) => [k.name, k.value[th.id]]), "\t\t\t")}\t\t},\n`);
	const lengths = ["spacing", "size", "stroke"].flatMap((g) => t[g].tokens).map((k) => [k.name, pixels(k.value)]);
	const sizes = styles(t).map((st) => [st.name, pixels(st.fontSize)]);
	const durations = t.motion.tokens.map((k) => [k.name, parseFloat(k.value) * (k.value.endsWith("ms") ? 1 : 1000)]);
	return "// Generated from docs/ui/tokens.json by scripts/ui-design.mjs. Do not edit.\n"
		+ "//The design tokens for what can't read CSS custom properties: the map's canvas draws its overlays\n"
		+ "//with these colours and line widths, at the same values as the CSS.\n"
		+ "export const TOKENS = {\n"
		+ `\tthemes: {\n${themes.join("")}\t},\n`
		+ `\tmap: {\n${entries(colors.filter((k) => typeof k.value === "string").map((k) => [k.name, k.value]), "\t\t")}\t},\n`
		+ `\tpx: {\n${entries(lengths, "\t\t")}\t},\n`
		+ `\tfontPx: {\n${entries(sizes, "\t\t")}\t},\n`
		+ `\tfonts: {\n${entries(Object.entries(t.type.families), "\t\t")}\t},\n`
		+ `\tms: {\n${entries(durations, "\t\t")}\t},\n`
		+ "} as const;\n";
}

//A colour as one string to compare: lower case, no spaces, alphas without their leading zero
const normal = (c) => c.toLowerCase().replace(/\s+/g, "").replace(/([(,])0\./g, "$1.");

//Black or white at any alpha is shading (a pressed bevel, a shadow), the same in both themes: no colour of the design's
const SHADING = /^(#000|#000000|#fff|#ffffff|rgba?\((0,0,0|255,255,255)(,[\d.]+)?\))$/;
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

//The size in a font shorthand: after the style and weight, before the line height and the family
const FONT_SIZE = /font-size\s*:\s*([^;}"]+)|font\s*:\s*(?:(?:italic|normal|bold|\d{3})\s+)*([^\s/;}"]+)/g;

//The colours of a line of CSS written in, but shading
const colours = (code) => [...code.matchAll(COLOUR)].map((m) => m[0]).filter((c) => !SHADING.test(normal(c)));

//The font sizes of a line of CSS written as a length, not a var(--…) (a share of the root's is fine: the Interface scale)
const sizes = (code) => [...code.matchAll(FONT_SIZE)].map((m) => (m[1] ?? m[2]).trim()).filter((size) => /\d(px|pt|r?em)\b/.test(size) && !size.startsWith("var("));

//The components' CSS and the screens' (bundle.css): every colour and font size from the tokens
function checkCss(file, text, problems) {
	text.split("\n").forEach((line, i) => {
		const code = line.replace(/\/\*.*?\*\//g, "");
		for (const c of colours(code)) problems.push(`${file}:${i + 1}: colour ${c} written in, not a var(--…) of tokens.css`);
		for (const size of sizes(code)) problems.push(`${file}:${i + 1}: font size ${size} written in, not a var(--type-…-size) of tokens.css`);
	});
}

//The cards: a map colour (one value in both themes, the hex-* and map-* tokens) drawn as a fill or a stroke is its token
function checkPreview(file, text, mapColours, problems) {
	const paint = /\b(fill|stroke)\s*(?:=\s*"|:\s*)(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi;
	text.split("\n").forEach((line, i) => {
		for (const m of line.matchAll(paint)) {
			const token = mapColours.get(normal(m[2]));
			if (token) problems.push(`${file}:${i + 1}: ${m[1]} ${m[2]} written in, not var(--${token})`);
		}
	});
}

//The generated files, against what tokens.json makes now
function stale() {
	const ts = path.join(view, "tokens.ts");
	const problems = [];
	if (read("tokens.css") !== tokensCss()) problems.push("docs/ui/tokens.css: older than tokens.json, run node scripts/ui-design.mjs");
	if (!fs.existsSync(ts) || fs.readFileSync(ts, "utf8") !== tokensTs()) problems.push("src/view/tokens.ts: older than tokens.json, run node scripts/ui-design.mjs");
	return problems;
}

function check() {
	const problems = stale();
	checkCss("docs/ui/components/bundle.css", read("components/bundle.css"), problems);
	for (const file of fs.readdirSync(view).filter((f) => f.endsWith(".css")).sort())
		checkCss(`src/view/${file}`, fs.readFileSync(path.join(view, file), "utf8"), problems);
	const t = JSON.parse(read("tokens.json"));
	const mapColours = new Map(t.color.tokens.filter((k) => typeof k.value === "string").map((k) => [normal(k.value), k.name]));
	for (const c of manifest()) checkPreview(`docs/ui/components/${c.name}/preview.html`, read(`components/${c.name}/preview.html`), mapColours, problems);
	return problems;
}

const CARD_DEFAULTS = { group: "Other", width: "1000", height: "800", subtitle: "", status: "" };

//The attributes of a preview's @dsCard line: its group, size, one-line subtitle and whether it is ready to build
function cardAttrs(head) {
	const attrs = { ...CARD_DEFAULTS };
	for (const m of head.matchAll(/(\w+)=(?:"([^"]*)"|(\d+))/g)) attrs[m[1]] = m[2] ?? m[3];
	return attrs;
}

function card(name) {
	const a = cardAttrs(read(`components/${name}/preview.html`).split("\n")[0]);
	return { name, group: a.group, width: Number(a.width), height: Number(a.height), subtitle: a.subtitle, status: a.status,
		readme: fs.existsSync(path.join(dir, "components", name, "README.md")) };
}

function manifest() {
	return fs.readdirSync(path.join(dir, "components")).sort()
		.filter((name) => fs.existsSync(path.join(dir, "components", name, "preview.html"))).map(card);
}

//A preview as a page of its own, written next to index.html so the assets/ paths resolve
function page(name, theme) {
	const css = read("tokens.css") + libraryCss() + read("components/bundle.css");
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

//README.md's gallery, between its two markers: every card by group, its render, its README and its status
function gallery(list) {
	const file = path.join(dir, "README.md");
	const readme = fs.readFileSync(file, "utf8");
	let md = "<!-- gallery:start (written by scripts/ui-design.mjs) -->\n";
	for (const [group, items] of Map.groupBy(list, (c) => c.group)) {
		md += `\n### ${group}\n\n| Card | What it shows | Status |\n|---|---|---|\n`;
		for (const c of items) {
			const name = c.readme ? `[${c.name}](components/${c.name}/README.md)` : c.name;
			md += `| ${name}<br>[render](renders/${c.name}.webp) | ${c.subtitle.replaceAll("|", "\\|")} | ${c.status} |\n`;
		}
	}
	md += "\n<!-- gallery:end -->";
	fs.writeFileSync(file, readme.replace(/<!-- gallery:start[\s\S]*<!-- gallery:end -->/, () => md));
}

const args = process.argv.slice(2);
if (args[0] === "--check") {
	const problems = check();
	for (const p of problems) console.error(p);
	process.exit(problems.length ? 1 : 0);
}
fs.writeFileSync(path.join(dir, "tokens.css"), tokensCss());
fs.mkdirSync(view, { recursive: true });
fs.writeFileSync(path.join(view, "tokens.ts"), tokensTs());
const list = manifest();
fs.writeFileSync(path.join(dir, "components.json"), JSON.stringify(list, null, "\t") + "\n");
gallery(list);
if (args[0] === "--render") render(list, args.slice(1));
