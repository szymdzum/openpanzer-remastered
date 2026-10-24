//jsdom has no types of its own here: the one class the command-line player uses, for its DOMParser
declare module "jsdom" {
	export class JSDOM {
		window: { DOMParser: typeof DOMParser };
	}
}
