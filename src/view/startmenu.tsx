//The start menu (StartMenu, NewGame, #349): the old start menu's main window over its six photographs, which fade one
//into the next as the old slideshow did (still with reduced motion). Its buttons, in the old order: New Game, which
//opens the panel of Campaigns, Scenarios and Tutorial above them, Settings, Save / Load and Continue Game; the old
//logo's version and links, and its credits. What each button does is the store's (src/view/menus.ts); Esc closes the
//start menu, as the old Options did. It opens with the first scenario and from the game menu's Options. The campaign's
//and the scenario's windows take the main window's place over the photographs.
import { useLayoutEffect, useRef } from "preact/hooks";
import { VERSION } from "../prototypes";
import { Button } from "./button";
import { Icon } from "./icon";
import { MAIN_BUTTONS, MENU_LINKS, type MenuEntry, NEW_GAME_BUTTONS, NOT_YET } from "./menus";
import { useEscape } from "./panel";
import { CampaignWindow, ScenarioWindow } from "./newgamewindows";
import type { Store } from "./store";

const PHOTOS = [1, 2, 3, 4, 5, 6];

function photoOf(n: number) {
	return { backgroundImage: `url(resources/ui/dialogs/startmenu/images/startmenu-${n}.jpg)`, "--i": n - 1 };
}

function Entries({ store, entries }: { store: Store, entries: MenuEntry[] }) {
	return entries.map((b) => (
		<Button key={b.id} id={b.id} large icon={b.icon} title={b.hint} disabled={NOT_YET[b.id]} onClick={() => store.startMenu(b.id)}>{b.title}</Button>
	));
}

//The main window: the focus on its first button on whenever it opens or its New Game panel does, the menu being keyboard-first
function MainWindow({ store, newGame }: { store: Store, newGame: boolean }) {
	const ref = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => { ref.current!.querySelector<HTMLButtonElement>("button:enabled")!.focus(); }, [newGame]);
	return (
		<dialog ref={ref} open id="smMain" class="pm-window pm-startmain" aria-modal="true" aria-labelledby="smLogo">
			<div class="logo">
				<h1 id="smLogo" class="pm-wordmark">Panzer{" "}<br />Marshal</h1>
				<div id="smLogoText" class="pm-muted">version {VERSION}</div>
				<div id="smMiscButs" class="links">
					{MENU_LINKS.map((l) => (
						<a key={l.href} class="pm-btn icon ghost" href={l.href} target="_blank" rel="noopener" aria-label={l.label} title={l.label}><Icon name={l.icon} /></a>
					))}
				</div>
			</div>
			{newGame && <nav id="smNewGame" class="pm-menu" aria-label="New Game"><Entries store={store} entries={NEW_GAME_BUTTONS} /></nav>}
			<nav id="smButtons" class="pm-menu" aria-label="Start menu"><Entries store={store} entries={MAIN_BUTTONS} /></nav>
			<span class="grow" />
			<div id="smCredits" class="credits pm-muted">Copyright Nicu Pavel</div>
		</dialog>
	);
}

export function StartMenu({ store }: { store: Store }) {
	const m = store.menu.value;
	const shown = m.window !== null && m.window !== "settings";
	useEscape(shown ? () => store.shortcut({ menu: "options" }) : undefined);
	if (!shown) return null;
	return (
		<div id="startmenu" class="pm-start">
			{PHOTOS.map((n) => <div key={n} class="pm-photo" style={photoOf(n)} />)}
			<div class="pm-photo-tint" />
			{m.window === "main" && <MainWindow store={store} newGame={m.newGame} />}
			{m.window === "campaign" && <CampaignWindow store={store} />}
			{m.window === "scenario" && <ScenarioWindow store={store} />}
		</div>
	);
}
