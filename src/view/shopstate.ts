//The unit list's and the equipment window's signals (UnitList, Equipment, #348), apart from the rest of the store
//(src/view/store.ts), which gives them the world, the selection and the person's commands. What they show is the view
//model's (src/view/unitlist.ts, src/view/shop.ts); here is only what the person has open and picked
import { computed, type ReadonlySignal, signal } from "@preact/signals";
import type { Command } from "../commands";
import type { Position, UnitId, World } from "../core/types";
import { unitById } from "../core/world";
import { choiceFor, type ShopChoice, shopOf, shopUnitsOf, sideCountries, type SortKey, type Target } from "./shop";
import { unitListOf } from "./unitlist";
import { isYourTurn } from "./model";

interface Needs {
	world: ReadonlySignal<World | null>;
	//while deploying the reserve tray takes the unit list's place, as the old list showed the reserve then
	deploying: ReadonlySignal<unknown>;
	selected: ReadonlySignal<UnitId | null>;
	select: (id: UnitId | null) => void;
	//a reserve unit picked to deploy, by its core list place
	pickReserve: (index: number) => void;
	look: (at: Position) => void;
	dispatch: (cmd: Command) => string | null;
}

export type ShopAct = "buy" | "upgrade" | "sell";

export function createShopState({ world, deploying, selected, select, pickReserve, look, dispatch }: Needs) {
	//the unit list open (the status bar's button), and the equipment window's picks while it is open
	const listOpen = signal(false);
	const choice = signal<ShopChoice | null>(null);

	//(while the window is open its own list takes this one's place, as the old window opened with the list)
	const unitList = computed(() => world.value === null || !listOpen.value || deploying.value !== null || choice.value !== null ? null
		: unitListOf(world.value, selected.value));
	const shop = computed(() => world.value === null || choice.value === null ? null : shopOf(world.value, choice.value));
	const shopUnits = computed(() => world.value === null || choice.value === null ? null
		: shopUnitsOf(world.value, deploying.value !== null, choice.value.target));
	//why the unit list and the window can't open: the old ones opened on a person's turn only (undefined: they can)
	const shopRefusal = computed(() => world.value === null ? "No game is playing" : isYourTurn(world.value) ? undefined : "Not your turn");

	const pick = (change: Partial<ShopChoice>) => {
		if (choice.value !== null) choice.value = { ...choice.value, ...change };
	};

	//The window opened on a unit: the one selected when it is the player's, or a reserve unit by its core list place
	const openShop = (target?: Target) => {
		const w = world.value;
		if (w === null || !isYourTurn(w)) return;
		const id = selected.value, u = id === null ? null : unitById(w, id);
		const on = target ?? (u !== null && u.owner === w.state.turn.currentPlayer ? { unit: u.id } : null);
		choice.value = choiceFor(w, on);
	};

	//A unit on the map selected and in the middle of the map; false when there is none
	const lookAt = (id: UnitId) => {
		const w = world.value, u = w === null ? null : unitById(w, id);
		if (u === null) return false;
		select(id);
		look({ row: u.row, col: u.col });
		return true;
	};

	//Closed with the unit list, as the old window closed both
	const closeShop = () => {
		choice.value = null;
		listOpen.value = false;
	};

	return {
		unitList, shop, shopUnits, listOpen, shopRefusal,

		toggleList: () => {
			listOpen.value = !listOpen.value;
		},

		//A unit of the list pressed: selected, and in the middle of the map
		listPick: (id: UnitId) => {
			lookAt(id);
		},

		//B and the rail's Buy and upgrade: the window opened, or closed when it is open
		toggleShop: () => {
			if (choice.value === null) openShop();
			else closeShop();
		},

		openShop, closeShop,

		//A unit of the window's list pressed: the one to upgrade, on its class, country, model and transport, the sort kept
		//(the old list's click); one on the map also selected and in the middle of the map, one in the reserve picked to deploy
		shopUnit: (id: number) => {
			const w = world.value, c = choice.value;
			if (w === null || c === null) return;
			const target: Target = deploying.value !== null ? { index: id } : { unit: id };
			if ("index" in target) pickReserve(id);
			else if (!lookAt(id)) return;
			choice.value = { ...choiceFor(w, target), sort: c.sort, reverse: c.reverse };
		},

		//A class tab: its models, nothing picked, no unit to upgrade (the old window cleared it)
		shopClass: (uclass: number) => {
			pick({ uclass, eqid: -1, transport: -1, target: null });
		},

		//The country button: the side's next country, as the old window's flag cycled them
		shopCountry: () => {
			const w = world.value, c = choice.value;
			if (w === null || c === null) return;
			const n = sideCountries(w, w.state.players[w.state.turn.currentPlayer].side).length;
			pick({ country: (c.country + 1) % Math.max(1, n), eqid: -1, target: null });
		},

		shopModel: (eqid: number) => {
			pick({ eqid, transport: -1 });
		},

		//A transport pressed: picked; pressed again, or None, none on purpose
		shopTransport: (eqid: number) => {
			const c = choice.value;
			if (c !== null) pick({ transport: eqid === c.transport ? -2 : eqid });
		},

		shopSort: (sort: SortKey) => {
			pick({ sort });
		},

		shopReverse: () => {
			const c = choice.value;
			if (c !== null) pick({ reverse: !c.reverse });
		},

		//Buy new, Upgrade, Sell sent as the old window sent them; a sold unit leaves nothing to work on
		shopAct: (act: ShopAct) => {
			const s = shop.value;
			const action = s === null ? null : act === "buy" ? s.buy : act === "upgrade" ? s.upgrade : s.sell;
			if (action === null || action.command === null || action.refusal !== null) return;
			if (dispatch(action.command) === null && act === "sell") pick({ target: null, eqid: -1, transport: -1 });
		},
	};
}
