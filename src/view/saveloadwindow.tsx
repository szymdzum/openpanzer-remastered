//The save and load window over the start menu (SaveLoad, #349), with what the old #smState had, in its order: Save to Disk
//and Load from Disk with the last file saved; Cloud Save and Cloud Load, the cloud save's id, the last three cloud saves
//(a click puts a save's id in the field, an empty row clears it) and the error of a file that didn't load; OK. Esc
//closes the start menu, as the old Options did.
import { useLayoutEffect, useRef } from "preact/hooks";
import { Button } from "./button";
import { Input } from "./controls";
import { Icon } from "./icon";
import { Window } from "./panel";
import type { Store } from "./store";

export function SaveLoadWindow({ store }: { store: Store }) {
	const v = store.saveLoad.value!;
	const file = useRef<HTMLInputElement>(null), body = useRef<HTMLDivElement>(null);
	//(the focus on its first button when it opens: the menus are keyboard-first)
	useLayoutEffect(() => { body.current!.querySelector("button")!.focus(); }, []);
	return (
		<Window id="smState" class="pm-save" title="Save / Load"
			footer={<><span class="grow" /><Button id="smStOkBut" variant="primary" onClick={() => store.closeSaveLoad()}>OK</Button></>}>
			<div ref={body} class="sec">
				<div class="acts">
					<Button id="disksave" icon="save" onClick={() => store.saveToFile()}>Save to Disk</Button>
					<Button id="diskload" icon="load" onClick={() => file.current!.click()}>Load from Disk</Button>
					<input ref={file} id="diskloadfile" class="pm-sr" type="file" tabIndex={-1} aria-hidden="true"
						onChange={(e) => {
							const picked = e.currentTarget.files![0];
							e.currentTarget.value = "";
							if (picked) store.loadFile(picked);
						}} />
				</div>
				<div class="last"><span class="pm-label">Last saved to disk</span><span id="disksaveupdate">{v.lastFile}</span></div>
			</div>
			<div class="sec">
				<div class="acts">
					<Button id="cloudsave" icon="save" onClick={() => store.saveToCloud()}>Cloud Save</Button>
					<Button id="cloudload" icon="load" onClick={() => store.loadFromCloud()}>Cloud Load</Button>
				</div>
				<Input id="cloudid" label="Cloud save ID" value={v.cloudId} placeholder={v.placeholder} onInput={(id) => store.setCloudId(id)} />
				<div class="pm-label">Last known cloud saves</div>
				<div id="cloudid_lastsaves" class="pm-list">
					{v.recent.map((r, i) => (
						<button key={i} type="button" class="pm-row" aria-label={r.name === "" ? "Clear the ID" : undefined}
							onClick={() => store.setCloudId(r.id)}>{r.name}</button>
					))}
				</div>
				{v.error !== "" && <div id="diskloaderror" class="msg" role="alert"><Icon name="critical" size="sm" />{v.error}</div>}
			</div>
		</Window>
	);
}
