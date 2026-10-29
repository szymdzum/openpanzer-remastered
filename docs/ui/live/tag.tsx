//A state in words for lists and tooltips: "Low fuel", "No ammo" (the Meter card). Only the gallery shows it as a
//component: the unit card writes its tags' class itself (src/view/hud/infopanel.tsx), styled by src/view/components/meter.css
import type { ComponentChildren } from "preact";
import { Icon, type IconName } from "../../../src/view/components/icon";
import type { SupplyState } from "../../../src/view/components/meter";

export function Tag({ tone, icon, children }: { tone?: SupplyState, icon?: IconName, children: ComponentChildren }) {
	return <span class={tone ? "pm-tag pm-" + tone : "pm-tag"}>{icon && <Icon name={icon} size="sm" />}{children}</span>;
}
