//The icons of the new UI (docs/ui/components/Icons): one inline sprite, mounted once at the root,
//and a <use> of it wherever an icon is drawn. The icons are stroked in currentColor and take the
//text colour; the nation marks keep their own.
import { ICONS, NATION_MARKS } from "./sprite";

export type IconName = keyof typeof ICONS;
type MarkId<K> = K extends `flag-${infer N}` ? N : never;
export type Nation = MarkId<keyof typeof NATION_MARKS>;

//20px by default; 16px inline in text, 24px on tablet rails (the card's .i, .i.sm and .i.lg)
export function Icon({ name, size }: { name: IconName, size?: "sm" | "lg" }) {
	return <svg class={size ? "i " + size : "i"} aria-hidden="true"><use href={"#pm-" + name} /></svg>;
}

//A nation's flag: the side is always named by its flag and its name, never by a colour alone
export function Mark({ nation, size }: { nation: Nation, size?: "sm" | "lg" }) {
	return <svg class={size ? "mark " + size : "mark"} aria-hidden="true"><use href={"#pm-flag-" + nation} /></svg>;
}

const STROKED = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter"';
const SYMBOLS = Object.entries(ICONS).map(([id, paths]) => `<symbol id="pm-${id}" ${STROKED}>${paths}</symbol>`).join("")
	+ Object.entries(NATION_MARKS).map(([id, paths]) => `<symbol id="pm-${id}" viewBox="0 0 24 24">${paths}</symbol>`).join("");

//The sprite itself, once per page before any icon: every <use> then costs nothing (handoff.md)
export function IconSprite() {
	return <svg id="pm-sprite" class="pm-sprite" width="0" height="0" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SYMBOLS }} />;
}
