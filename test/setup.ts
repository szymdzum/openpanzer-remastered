//Vitest runs the game's modules in jsdom. The game loads its data (equipment, scenarios) with
//XMLHttpRequest from game/: this one reads the files from disk instead
import fs from "node:fs";
import path from "node:path";

const GAME_DIR = path.resolve(__dirname, "../game");

class FileXMLHttpRequest
{
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

	open(method: string, url: string, async?: boolean)
	{
		this.url = new URL(url, document.baseURI).pathname.replace(/^\/game\//, "");
		this.async = async !== false;
	}

	send()
	{
		const done = () => {
			const file = path.join(GAME_DIR, decodeURIComponent(this.url));
			if (fs.existsSync(file))
			{
				this.status = 200;
				this.responseText = fs.readFileSync(file, "utf8");
				if (file.endsWith(".xml"))
					this.responseXML = new DOMParser().parseFromString(this.responseText, "text/xml");
			}
			else
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

//No media in jsdom: the sound sprites load and play nothing
HTMLMediaElement.prototype.load = function() {};
HTMLMediaElement.prototype.play = function() { return Promise.resolve(); };
