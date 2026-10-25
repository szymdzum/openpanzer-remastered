//Vitest runs the game's modules in jsdom. The game loads its data (equipment, scenarios) with
//XMLHttpRequest from game/: this one reads the files from disk instead
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

//The game keeps the scenario date as a local Date: the day after midnight UTC depends on the
//time zone. The contracts were recorded in Europe/Warsaw, CI runs in UTC. This works in a forked
//worker (Vitest's default); in worker threads (Stryker's) only TZ set on the process does, so
//npm run test:mutation and the workflows set it too
process.env.TZ = "Europe/Warsaw";

//OPENPANZER_GAME_DIR: Stryker runs the tests in a copy of the repo without game/ (300 MB)
const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.resolve(__dirname, "../game");

//The page's address and XML parser; a test in environment "node" has neither: the page's address as jsdom has it
//(vite.config.mts) and jsdom's parser alone, as the command-line player reads the scenarios (cli/files.ts)
const PAGE = "http://127.0.0.1/game/index.html";
let nodeParser: DOMParser | null = null;
const xmlParser = (): DOMParser => typeof DOMParser !== "undefined" ? new DOMParser()
	: nodeParser ??= new new JSDOM().window.DOMParser();

class FileXMLHttpRequest {
	readyState = 0;
	status = 0;
	responseText = "";
	responseXML: Document | null = null;
	onload: ((e: unknown) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	onloadend: ((e: unknown) => void) | null = null;
	onreadystatechange: ((e: unknown) => void) | null = null;
	private url = "";
	private async = true;

	open(method: string, url: string, async?: boolean) {
		if (method !== "GET") throw new Error("the test XMLHttpRequest serves GET only, not " + method);
		this.url = new URL(url, typeof document !== "undefined" ? document.baseURI : PAGE).pathname.replace(/^\/game\//, "");
		this.async = async !== false;
	}

	send() {
		const done = () => {
			const file = path.join(GAME_DIR, decodeURIComponent(this.url));
			if (fs.existsSync(file)) {
				this.status = 200;
				this.responseText = fs.readFileSync(file, "utf8");
				if (file.endsWith(".xml"))
					this.responseXML = xmlParser().parseFromString(this.responseText, "text/xml");
			} else
				this.status = 404;
			this.readyState = 4;
			this.onreadystatechange?.({ target: this });
			(this.status === 200 ? this.onload : this.onerror)?.({ target: this });
			this.onloadend?.({ target: this });
		};
		if (this.async) queueMicrotask(done); else done();
	}

	setRequestHeader() {}
	overrideMimeType() {}
	abort() {}
}

(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FileXMLHttpRequest;

//The scenario and campaign lists, classic scripts of index.html that declare globals
for (const list of ["resources/scenarios/scenariolist.js", "resources/campaigns/campaignlist.js"])
	(0, eval)(fs.readFileSync(path.join(GAME_DIR, list), "utf8"));

//The rest is for jsdom: a test in environment "node" (test/headless.test.ts) has no DOM
if (typeof window !== "undefined") {
	//No media in jsdom: the sound sprites load and play nothing
	HTMLMediaElement.prototype.load = function() {};
	HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
}
