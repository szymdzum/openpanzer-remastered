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

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "docs", "ui");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

//One block per theme: the first theme is also :root
function tokensCss() {
	const t = JSON.parse(fs.readFileSync(path.join(dir, "tokens.json"), "utf8"));
	const themes = t.color.themes.map((x) => x.id);
	let css = "/* Generated from tokens.json by scripts/ui-design.mjs. Do not edit. */\n";
	themes.forEach((id, i) => {
		css += (i === 0 ? `:root, [data-theme="${id}"]` : `[data-theme="${id}"]`) + " {\n";
		for (const group of ["color", "shadow"]) {
			for (const k of t[group].tokens) {
				css += `\t--${k.name}: ${typeof k.value === "string" ? k.value : (k.value[id] ?? k.value[themes[0]])};\n`;
			}
		}
		css += "}\n";
	});
	css += ":root {\n";
	for (const group of ["spacing", "radius", "size", "zIndex"]) {
		for (const k of t[group].tokens) css += `\t--${k.name}: ${k.value};\n`;
	}
	for (const [k, v] of Object.entries(t.type.families)) css += `\t--font-${k}: ${v};\n`;
	return css + "}\n";
}

//The @dsCard line of each preview: its group, size and one-line subtitle
function manifest() {
	const list = [];
	for (const name of fs.readdirSync(path.join(dir, "components")).sort()) {
		const file = path.join(dir, "components", name, "preview.html");
		if (!fs.existsSync(file)) continue;
		const head = fs.readFileSync(file, "utf8").split("\n")[0];
		const attr = (k) => {
			const m = head.match(new RegExp(`${k}=(?:"([^"]*)"|(\\d+))`));
			return m ? (m[1] ?? m[2]) : undefined;
		};
		list.push({
			name,
			group: attr("group") || "Other",
			width: Number(attr("width")) || 1000,
			height: Number(attr("height")) || 800,
			subtitle: attr("subtitle") || "",
			readme: fs.existsSync(path.join(dir, "components", name, "README.md")),
		});
	}
	return list;
}

//A preview as a page of its own, written next to index.html so the assets/ paths resolve
function page(name, theme) {
	const css = fs.readFileSync(path.join(dir, "tokens.css"), "utf8") + fs.readFileSync(path.join(dir, "components", "bundle.css"), "utf8");
	const js = fs.readFileSync(path.join(dir, "components", "bundle.js"), "utf8");
	const body = fs.readFileSync(path.join(dir, "components", name, "preview.html"), "utf8");
	return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>body{margin:0}${css}</style><script>${js}</script></head><body>${body}</body></html>`;
}

function render(list, only) {
	fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
	const tmp = path.join(dir, "_render.html");
	const png = path.join(dir, "_render.png");
	try {
		for (const c of list) {
			if (only.length && !only.includes(c.name)) continue;
			fs.writeFileSync(tmp, page(c.name, "paper"));
			//Chrome can exit non-zero on its teardown after it wrote the screenshot: the file decides
			fs.rmSync(png, { force: true });
			spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
				"--virtual-time-budget=4000", `--window-size=${c.width},${c.height}`, `--screenshot=${png}`, `file://${tmp}`], { stdio: "ignore" });
			if (!fs.existsSync(png)) throw new Error(`no screenshot of ${c.name}`);
			execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", path.join(dir, "renders", `${c.name}.webp`)]);
			console.log(c.name);
		}
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
	fs.writeFileSync(file, readme.replace(/<!-- gallery:start[\s\S]*<!-- gallery:end -->/, md));
}

fs.writeFileSync(path.join(dir, "tokens.css"), tokensCss());
const list = manifest();
fs.writeFileSync(path.join(dir, "components.json"), JSON.stringify(list, null, "\t") + "\n");
gallery(list);
const args = process.argv.slice(2);
if (args[0] === "--render") render(list, args.slice(1));
