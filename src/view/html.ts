//Sanitizes the game's HTML texts (descriptions, outcomes, tutorial orders, host messages), which a save from
//someone else can carry (#486): only br, b, span (class, plain style) and the prestige img of the game's own
//stay; any other tag gives only its text, and a script, a style sheet or a frame gives nothing
const KEPT: Record<string, string[]> = { BR: [], B: [], SPAN: ["class", "style"], IMG: ["src"] };
const DROPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TITLE", "TEXTAREA", "SELECT"]);

//An attribute's value the game's texts could have: a style of plain declarations (no url() or expression()), an
//image under the game's resources
const allowed: Record<string, (v: string) => boolean> = {
	class: () => true,
	style: (v) => /^[\w\s:;.%#-]*$/.test(v),
	src: (v) => /^resources\/[\w/.-]+$/.test(v) && !v.includes(".."),
};

const escaped = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
	.replace(/\u00a0/g, "&nbsp;");

//A tag kept, with its allowed attributes; null for an image with no source of the game's, which shows nothing
function opening(e: Element, tag: string): string | null {
	const attrs = KEPT[tag].filter((n) => e.hasAttribute(n) && allowed[n](e.getAttribute(n)!));
	if (tag === "IMG" && attrs.length === 0) return null;
	return "<" + tag.toLowerCase() + attrs.map((n) => " " + n + "=\"" + escaped(e.getAttribute(n)!) + "\"").join("") + ">";
}

function writeElement(e: Element, out: string[]) {
	const tag = e.tagName.toUpperCase();
	if (DROPPED.has(tag)) return;
	if (KEPT[tag] === undefined) {
		writeChildren(e, out);
		return;
	}
	const open = opening(e, tag);
	if (open === null) return;
	out.push(open);
	if (tag === "BR" || tag === "IMG") return;
	writeChildren(e, out);
	out.push("</" + tag.toLowerCase() + ">");
}

function writeChildren(parent: Node, out: string[]) {
	for (const node of parent.childNodes)
		if (node.nodeType === Node.TEXT_NODE) out.push(escaped(node.nodeValue!));
		else if (node.nodeType === Node.ELEMENT_NODE) writeElement(node as Element, out);
}

//The text as HTML that keeps only the allowed tags and attributes. Parsed in a document of its own, which runs no
//script and loads no image
export function safeHtml(html: string): string {
	const body = new DOMParser().parseFromString(html, "text/html").body;
	const out: string[] = [];
	writeChildren(body, out);
	return out.join("");
}
