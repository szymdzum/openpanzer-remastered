//The settings window (Settings, #349): the old settings list in its order, the three sliders with their values in type
//beside them, then a switch for each of the old checkboxes, each with its setting's key as its id; OK. It sits over the
//game, as the old #smSettings did, the message under it set aside; Esc is its OK.
import { useLayoutEffect, useRef } from "preact/hooks";
import { Button } from "./button";
import { Slider, Toggle } from "./controls";
import { Scrim, useEscape, Window } from "./panel";
import type { Store } from "./store";

export function SettingsWindow({ store }: { store: Store }) {
	const s = store.settings.value!;
	useEscape(() => store.closeSettings());
	//(the focus on the first setting when it opens: the menus are keyboard-first)
	const list = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => { list.current!.querySelector("input")!.focus(); }, []);
	return (
		<>
			<Scrim />
			<Window id="smSettings" class="pm-settings" title="Settings"
				footer={<><span class="grow" /><Button id="smSetOkBut" variant="primary" onClick={() => store.closeSettings()}>OK</Button></>}>
				<div ref={list} id="smSettingsContainer" class="list">
					{s.sliders.map((r) => (
						<div key={r.key} class="pm-setting">
							<span class="t">{r.title}</span>
							<Slider label={r.title} min={r.min} max={r.max} step={r.step} value={r.value} text={r.text} onInput={(v) => store.slide(r.key, v)} />
						</div>
					))}
					{s.toggles.map((t) => (
						<div key={t.key} class="pm-setting">
							<label class="t" for={t.key}>{t.title}</label>
							<Toggle id={t.key} checked={t.on} onChange={() => store.toggleSetting(t.key)} />
						</div>
					))}
				</div>
			</Window>
		</>
	);
}
