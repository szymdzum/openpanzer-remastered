//The bottom sheet of the tablet layouts (docs/ui/components/TabletUnitInfo): a window that rises
//over the map from the bottom edge, over a scrim. Drag its grip down or tap the scrim to close it;
//the keyboard has the close button and Esc. Styled by sheet.css beside it.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Scrim, Window } from "../../../src/view/components/panel";

//How far the grip is dragged down before letting go closes the sheet
const CLOSE_AT = 96;

type BottomSheetProps = {
	title: ComponentChildren,
	lead?: ComponentChildren,
	sub?: ComponentChildren,
	tools?: ComponentChildren,
	children?: ComponentChildren,
	onClose: () => void,
	//the sheet's height in pixels; without it, its content's
	height?: number,
	id?: string,
};

export function BottomSheet({ title, lead, sub, tools, children, onClose, height, id }: BottomSheetProps) {
	//where the drag started, and how far down it is now
	const [from, setFrom] = useState<number | null>(null);
	const [down, setDown] = useState(0);
	const onPointerDown = (e: PointerEvent) => {
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		setFrom(e.clientY);
	};
	const onPointerMove = (e: PointerEvent) => {
		if (from !== null) setDown(Math.max(0, e.clientY - from));
	};
	const onPointerUp = () => {
		if (from === null) return;
		setFrom(null);
		setDown(0);
		if (down >= CLOSE_AT) onClose();
	};
	const grip = (
		<div class="grip" aria-hidden="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
			<span />
		</div>
	);
	const style = { height: height === undefined ? undefined : height + "px", transform: down ? `translateY(${down}px)` : undefined };
	return (
		<>
			<Scrim onClick={onClose} />
			<Window id={id} class="pm-sheet" style={style} heading="title" title={title} lead={lead} sub={sub} tools={tools} onClose={onClose} grip={grip}>
				{children}
			</Window>
		</>
	);
}
