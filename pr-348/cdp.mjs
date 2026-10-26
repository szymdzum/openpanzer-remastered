//Screenshots of the new UI's windows in headless Chrome over the DevTools protocol: each scene staged in the page
//(clicks on the new UI's own controls; the campaign ones through the game's module, as a dev-console script would), in Paper and Blackout at
//1366x768 and 1920x1080. Usage: node cdp.mjs <out dir> [scene...]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333, BASE = "http://localhost:8646/?ui=new&theme=";
const out = process.argv[2], only = process.argv.slice(3);
const profile = fs.mkdtempSync(path.join(path.dirname(out), "chrome-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run",
	"--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let version = null;
for (let i = 0; i < 50 && version === null; i++) {
	try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); }
}
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let next = 0;
const pending = new Map(), waiters = [];
ws.addEventListener("message", (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
	else for (const w of waiters.splice(0)) w(msg);
});
const send = (method, params = {}) => new Promise((r) => { const id = ++next; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const loaded = () => new Promise((r) => { const on = (msg) => msg.method === "Page.loadEventFired" ? r() : waiters.push(on); waiters.push(on); });
await send("Page.enable");
await send("Runtime.enable");

//The page's helpers, then the scene's staging, run in the page
const HELPERS = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, t = 20000) => { const s = Date.now(); while (!f()) { if (Date.now() - s > t) throw new Error("timeout: " + f); await sleep(100); } };
const scr = () => document.querySelector(".pm-screen");
const btn = (name, within = scr()) => [...within.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim().startsWith(name));
const click = async (name, within) => { await until(() => btn(name, within)); btn(name, within).click(); await sleep(400); };
const ack = async () => { await sleep(500); while (scr().querySelector("#ui-message")) { scr().querySelector("#uiokbut").click(); await sleep(500); } };
const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.replace("Key", "").toLowerCase(), bubbles: true }));
//(the running game, from the dev server's own module: the same one the page plays)
const { game } = await import("/src/session.ts");
const ready = () => until(() => scr() && scr().querySelector("#ui-message"));
//(a dossier staged in the session's state, the game's one source of truth, then the screen told to read it again)
const stageDossier = (d) => { const st = game.session.world.state; const id = st.players.findIndex((p) => p.country === st.campaign.country);
	st.players[id].dossier = d; game.host.screen.unitsPlaced(); };
const campaign = async () => { await ready(); await ack(); game.host.newCampaign(0, 1); await sleep(4000); await until(() => scr().querySelector("#ui-message")); };
`;

const SCENES = {
	briefing: `await ready(); await sleep(800);`,
	unitcard: `await ready(); await ack(); await click("Unit list"); scr().querySelectorAll(".pm-unitlist .pm-ucard")[4].click(); await sleep(300);
		await click("Close", scr().querySelector(".pm-unitlist")); await click("Unit card");`,
	unitlist: `await ready(); await ack(); await click("Unit list"); scr().querySelectorAll(".pm-unitlist .pm-ucard")[4].click(); await sleep(600);`,
	equipment: `await ready(); await ack(); await click("Unit list"); scr().querySelectorAll(".pm-unitlist .pm-ucard")[4].click(); await sleep(300);
		await click("Close", scr().querySelector(".pm-unitlist")); key("KeyB"); await sleep(500); await click("Pz IVC,");`,
	deploy: `await campaign(); await ack(); key("KeyB"); await sleep(500);
		for (const m of ["Pz IA,", "Pz IB,", "Pz IIA,"]) { await click(m); await click("Buy new"); }
		key("KeyB"); await sleep(400); await click("Deploy ·"); await until(() => scr().querySelector(".pm-deploy")); await sleep(800);`,
	campaignbriefing: `await campaign(); await sleep(800);`,
	log: `await campaign(); await ack(); await click("End turn"); await sleep(600);
		const end = [...scr().querySelectorAll("dialog button")].find((b) => b.textContent.trim() === "End turn"); if (end) end.click();
		await sleep(3000); await until(() => scr().querySelector(".pm-turn"), 180000); await sleep(1500); await click("Turn report", scr().querySelector(".pm-turn")); await sleep(600);`,
	dossier: `await campaign(); await ack();
		stageDossier({ units: { killed: { 1: 14, 2: 6, 3: 3, 4: 4, 8: 5, 10: 1, 11: 1 }, lostcore: { 2: 1 }, lostaux: { 1: 2 } },
			outcomes: { briliant: ["Lodz - Warta River"], victory: [], tactical: [], lose: [] } });
		await sleep(300); scr().querySelector("#combatLogButton").click(); await sleep(400); await click("Dossier"); await sleep(600);`,
	campaignend: `await campaign(); await ack();
		stageDossier({ units: { killed: { 1: 31, 2: 12, 3: 5, 4: 6, 8: 9, 10: 3, 11: 2 }, lostcore: { 2: 2, 1: 1 }, lostaux: { 1: 4 } },
			outcomes: { briliant: ["Lodz - Warta River", "Bzura", "Warsaw"], victory: ["Modlin"], tactical: [], lose: [] } });
		await sleep(300);
		game.host.screen.campaignEnd("victory", game.campaign.getOutcomeText("briliant"), () => {}); await sleep(800);`,
	campaigndefeat: `await campaign(); await ack();
		stageDossier({ units: { killed: { 1: 9, 2: 2 }, lostcore: { 2: 4, 1: 3 }, lostaux: { 1: 5 } },
			outcomes: { briliant: [], victory: ["Lodz - Warta River"], tactical: [], lose: ["Bzura"] } }); await sleep(300);
		game.host.screen.campaignEnd("lose", game.campaign.getOutcomeText("lose"), () => {}); await sleep(800);`,
};

const SIZES = [[1366, 768], [1920, 1080]];
const run = only.length > 0 ? only : Object.keys(SCENES);
fs.mkdirSync(out, { recursive: true });
for (const scene of run)
	for (const theme of ["paper", "blackout"])
		for (const [width, height] of SIZES) {
			await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
			await send("Storage.clearDataForOrigin", { origin: "http://localhost:8646", storageTypes: "all" });
			const load = loaded();
			await send("Page.navigate", { url: BASE + theme });
			await load;
			const r = await send("Runtime.evaluate", { expression: `(async () => { ${HELPERS} ${SCENES[scene]} return "ok"; })()`, awaitPromise: true,
				timeout: 120000 });
			const ok = r.result && r.result.result && r.result.result.value === "ok";
			const shot = await send("Page.captureScreenshot", { format: "webp", quality: 82 });
			const file = path.join(out, `${scene}-${theme}-${width}.webp`);
			fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
			console.log(file, ok ? "" : JSON.stringify(r.result.exceptionDetails ? r.result.exceptionDetails.exception.description : r).slice(0, 300));
		}
ws.close();
chrome.kill();
await sleep(1000);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* chrome still closing */ }
