//What must hold on every game state, whatever was played: the spotting and zone of control counters
//of every hex equal a recomputation from the units, hexes and units point at each other, every
//unit belongs to its owner's Player. Checked on the engine fixtures as restored and after the AI
//played them for 2 turns on the game's core. The known ways the game broke them are drills below,
//marked test.fails with their issue while they do: fixing a bug flips its test, a new failure is a
//new defect. The counters follow the units since the game plays on the core (D10, #137): the drift
//drills (#73) come out clean.
import { expect, test } from "vitest";
import { fixtures } from "./contracts";
import { cellName, hexName, load, unitName, violations, type Restored as World } from "./invariants";
import { mulberry32 } from "./lifecycle";
import type { Hex } from "../src/map";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";
import type { Command } from "../src/commands";
import type { AttackResult } from "../src/commands";

//The game's flow without the UI, as the engine contract plays it (test/contracts/engine.contract.js):
//the commands, finished at once, with the UI's selection refresh after an attack (#29 guarded)
function refreshSelection(w: World, r: AttackResult) {
	const { m } = w;
	const a = r.attacking.unit, d = r.defending.unit;
	if (m.currentUnit) {
		if (a.destroyed && m.currentUnit.id == a.id) m.delCurrentUnit();
		else m.selectUnit(m.currentUnit);
		if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
	}
}
function attack(w: World, a: Unit, d: Unit) {
	w.Commands.execute(w.scenario, { type: "attack", unit: a.id, target: d.id },
		{ finish: { afterCleanup: (r) => refreshSelection(w, r) } });
}

//game.ts processAction (move): the move range, then the move command
function move(w: World, u: Unit, cell: Cell) {
	w.m.setMoveRange(u);
	w.Commands.execute(w.scenario, { type: "move", unit: u.id, to: { row: cell.row, col: cell.col } },
		{ surprise: { afterCleanup: (r) => refreshSelection(w, r) } });
}

//A part of an AI action, for the step's name
const named = (x: unknown) => x === null || x === undefined ? "no unit" : typeof x === "string" ? "a message"
	: typeof (x as Unit).unitData === "function" ? unitName(x as Unit) : cellName(x as Cell);

//An AI action as game.ts processAction plays it: the units a move put another unit on, "end" when it
//ends the turn. The tutorial's messages name a hex; a unit its script meant that isn't there (#188)
//the game's command refuses, and its stuck attack with no unit (#80) is where the game stops
function playAction(w: World, type: number, p: [Unit, Unit & Cell]): Unit[] | "end" {
	const A = w.actionType;
	if (type === A.endturn || (type === A.attack && !p[0])) return "end";
	const plays: Record<number, () => Unit[]> = {
		[A.move]: () => moved(w, p[0], p[1]),
		[A.attack]: () => attacked(w, p[0], p[1]),
		[A.resupply]: () => supplied(w, "resupply", p[0]),
		[A.reinforce]: () => supplied(w, "reinforce", p[0]),
	};
	return p[0] && plays[type] ? plays[type]() : [];
}

//An attack in range, none beside it
function attacked(w: World, a: Unit, d: Unit): Unit[] {
	if (w.GameRules.isInAttackRange(a, d)) attack(w, a, d);
	return [];
}

//A resupply or a reinforcement
function supplied(w: World, type: "resupply" | "reinforce", u: Unit): Unit[] {
	w.Commands.execute(w.scenario, { type, unit: u.id });
	return [];
}

//A move, and the units that stood on the hex it was ordered to
function moved(w: World, u: Unit, to: Cell): Unit[] {
	const h = w.m.map[to.row][to.col];
	const occupants = [h.unit, h.airunit].filter((x): x is Unit => x !== null && x !== u);
	move(w, u, to);
	return occupants;
}

//The AI plays every player for 2 turns, Math.random and the streams seeded. check() runs after
//every action and end of turn, with the units a move put another unit on (#74); it returns true to
//stop
function playAI(w: World, check: (step: string, overwritten: Unit[]) => boolean) {
	const { m, actionType: A } = w;
	const realRandom = Math.random, gameState = w.Rng.game.state;
	Math.random = mulberry32(31); //the contracts' seeded random (contractRandom in test/contracts/common.js)
	w.Rng.seed(31); //the game stream draws what Math.random would
	try {
		const steps = 2 * m.getPlayers().length;
		for (let t = 0; t < steps; t++) {
			const player = m.currentPlayer;
			const ctx = "turn " + m.turn + " player#" + player.id;
			const ai = new w.AI(player, m);
			ai.buildActions();
			if (check(ctx + " AI purchases and deployment", [])) return;
			for (let n = 0; n < 500; n++) {
				const a = ai.getAction();
				if (!a) break;
				const p = a.param as [Unit, Unit & Cell];
				const step = ctx + " #" + n + " " + Object.keys(A).find((k) => A[k as keyof typeof A] === a.type)
					+ " " + named(p[0]) + (p[1] ? " " + named(p[1]) : "");
				const occupants = playAction(w, a.type, p);
				if (occupants === "end") break;
				const overwritten = occupants.filter((o) => { const h = o.getHex(); return h && h.unit !== o && h.airunit !== o; });
				if (check(step, overwritten)) return;
			}
			//game.ts endTurn: on the session, with the next player's reinforcements
			w.endTurn();
			if (check(ctx + " end of turn", [])) return;
		}
	} finally {
		Math.random = realRandom;
		w.Rng.game.state = gameState;
	}
}

//The first step after which an invariant doesn't hold, with what
function firstBreak(w: World): string | null {
	let found: string | null = null;
	playAI(w, (step) => {
		const v = violations(w);
		if (v.length) found = "after " + step + ":\n" + v.join("\n");
		return found !== null;
	});
	return found;
}

for (const name of fixtures("engine"))
	test(`Invariants hold on ${name} as restored`, async () => {
		const w = await load(name);
		expect(violations(w)).toEqual([]);
	});

//(ruscam09-t0 and -t2 broke them through #73 on the old engine: a leader won in an attack of unit#7)
for (const name of fixtures("engine"))
	test(`Invariants hold while the AI plays ${name}`, async () => {
		const w = await load(name);
		expect(firstBreak(w)).toBeNull();
	});

//The known bugs, each reproduced on a fixture. A drill returns what kept it from reaching the state
//the bug needs (setup, checked by a plain test so a drill that stops reproducing doesn't pass as
//"still failing") and what the invariants say after it (the bug's test.fails)
interface DrillResult { setup: string[]; broken: string[] }
const drillRuns = new Map<string, Promise<DrillResult>>();
//fixed: the bug is fixed, the drill must come out clean (a plain test instead of test.fails)
function drill(name: string, fixture: string, run: (w: World, setup: string[]) => string[], fixed = false) {
	const result = () => {
		if (!drillRuns.has(name))
			drillRuns.set(name, load(fixture).then(async (w) => {
				//(a drill writes into the objects by hand, as the harness does: no world kept)
				(await import("../src/mirror")).mirrorOptions.cache = false;
				const setup: string[] = [];
				const before = violations(w);
				if (before.length) setup.push("invariants broken before the drill: " + before.join("; "));
				const broken = run(w, setup);
				if (process.env.SHOW_DRILLS) console.log(name, { setup, broken });
				return { setup, broken };
			}));
		return drillRuns.get(name)!;
	};
	test(`Drill sets up on ${fixture}: ${name}`, async () => {
		expect((await result()).setup).toEqual([]);
	});
	(fixed ? test : test.fails)(`${name} (${fixed ? "fixed" : "known bug"}, drill on ${fixture})`, async () => {
		expect((await result()).broken).toEqual([]);
	});
}

//Moves u onto hex the way moveUnit does, zone of control and spotting with it
function place(w: World, u: Unit, hex: Hex) {
	const { m, GameRules: GR } = w;
	GR.setZOCRange(m.map, u, false, m.rows, m.cols);
	GR.setSpotRange(m.map, u, false, m.rows, m.cols);
	u.getHex()!.delUnit(u);
	hex.setUnit(u);
	GR.setZOCRange(m.map, u, true, m.rows, m.cols);
	GR.setSpotRange(m.map, u, true, m.rows, m.cols);
}

//Units of the player whose turn it is that can move
function movers(w: World): Unit[] {
	const { m, GameRules: GR } = w;
	return m.getUnits().filter((u) => u.player.id == m.currentPlayer.id && u.getPos() && GR.getMoveRange(m, u).length > 0);
}

//A command played as the game sends it; false when refused
function play(w: World, cmd: Command): boolean {
	return w.Commands.execute(w.scenario, cmd).ok;
}

drill("#68 undo keeps the unit attached to its player", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, playerType } = w;
	m.currentPlayer.type = playerType.humanLocal;
	//The first move that spots nothing new, so it can be undone: each unit's first cell
	for (const u of movers(w)) {
		const from = u.getHex()!, cell = GR.getMoveRange(m, u)[0];
		m.selectUnit(u);
		move(w, u, cell);
		if (m.canUndoMove(u)) {
			play(w, { type: "undo", unit: u.id });
			if (u.getHex() !== from) setup.push("the undo didn't move " + unitName(u) + " back");
			return violations(w);
		}
	}
	setup.push("no move could be undone");
	return [];
}, true);

//(#72, removeNonCampaignUnits leaving the removed units' zone of control and spotting: the game starts
//a campaign's scenario on the core now, test/state.test.ts)

//The current player's first ground unit that can embark on an air transport, put on a free airfield
//(its player given a transport), then run on it; null when none can
function onAirfield(w: World, run: (u: Unit) => string[]): string[] | null {
	const { m, GameRules: GR, terrainType, unitClass } = w;
	const airfields = m.map.flat().filter((h) => h.terrain == terrainType.Airfield && !h.unit && !h.airunit);
	for (const u of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && !x.hasMoved && !GR.isAir(x))) {
		const from = u.getHex()!;
		for (const h of airfields) {
			place(w, u, h);
			u.player.airTransports = Math.max(u.player.airTransports, 1);
			if (GR.getEmbarkType(m.map, u) == unitClass.airTransport && GR.canEmbark(m.map, u)) return run(u);
			place(w, u, from);
		}
	}
	return null;
}

//A ground unit put on a free airfield, then embarked on an air transport
drill("#73 air embark leaves the ground zone of control and spotting", "ruscam09-t2.json.gz", (w, setup) => {
	const broken = onAirfield(w, (u) => {
		const v = violations(w);
		if (v.length) setup.push("invariants broken before embarking: " + v.join("; "));
		if (!play(w, { type: "embark", unit: u.id })) setup.push(unitName(u) + " didn't embark");
		return violations(w);
	});
	if (broken === null) setup.push("no unit could embark on an air transport");
	return broken || [];
}, true);

//The same on a port: a naval transport spots less than the unit it carries
drill("#73 naval embark doesn't redo the spotting counters", "dr9fr03-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, terrainType, unitClass } = w;
	const ports = m.map.flat().filter((h) => h.terrain == terrainType.Port && !h.unit && !h.airunit);
	for (const u of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && !x.hasMoved && GR.isGround(x))) {
		const from = u.getHex()!;
		for (const h of ports) {
			place(w, u, h);
			u.player.navalTransports = Math.max(u.player.navalTransports, 1);
			const range = GR.getUnitSpotRange(u);
			if (GR.getEmbarkType(m.map, u) == unitClass.navalTransport) {
				const v = violations(w);
				if (v.length) setup.push("invariants broken before embarking: " + v.join("; "));
				if (!play(w, { type: "embark", unit: u.id })) setup.push(unitName(u) + " didn't embark");
				if (GR.getUnitSpotRange(u) === range) { place(w, u, from); continue; }
				return violations(w);
			}
			place(w, u, from);
		}
	}
	setup.push("no unit could embark on a naval transport with another spotting range");
	return [];
}, true);

//An air transported unit disembarks: it turns into a ground unit with its own spotting
drill("#73 disembarking doesn't redo the zone of control and spotting counters", "ruscam09-t2.json.gz", (w, setup) => {
	const broken = onAirfield(w, (u) => {
		if (!play(w, { type: "embark", unit: u.id })) setup.push(unitName(u) + " didn't embark");
		const v = violations(w);
		if (v.length) setup.push("invariants broken after embarking: " + v.join("; "));
		if (!w.GameRules.isAir(u)) setup.push(unitName(u) + " isn't air on its transport");
		if (!play(w, { type: "disembark", unit: u.id })) setup.push(unitName(u) + " can't disembark");
		return violations(w);
	});
	if (broken === null) setup.push("no unit could embark on an air transport");
	return broken || [];
}, true);

//An attack that gives a recon unit a leader: any leader is its class's, +2 spotting. A unit at the
//experience cap gets one from its next fight
drill("#73 a recon leader from an attack doesn't widen the spotting counters", "drpzop01-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, unitClass, UNIT_MAX_EXPERIENCE } = w;
	for (const a of m.getUnits().filter((x) => x.getPos() && x.leader == -1 && !x.hasFired && x.unitData().uclass == unitClass.recon))
		for (const cell of GR.getUnitAttackCells(m.map, a, m.rows, m.cols)) {
			const d = m.map[cell.row][cell.col].getAttackableUnit(a, false);
			if (!d) continue;
			const range = GR.getUnitSpotRange(a);
			m.currentPlayer = a.player; //(its player's turn)
			a.experience = UNIT_MAX_EXPERIENCE;
			attack(w, a, d);
			if (a.destroyed || !a.getPos()) { setup.push(unitName(a) + " was destroyed attacking"); return []; }
			if (GR.getUnitSpotRange(a) === range) setup.push("the leader didn't change the spotting range of " + unitName(a));
			return violations(w);
		}
	setup.push("no recon unit without a leader could attack");
	return [];
}, true);

//An upgrade to equipment of the same class with another spotting range
drill("#73 an upgrade doesn't redo the spotting counters", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, Equipment } = w;
	for (const u of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && !x.isMounted && x.carrier == 0)) {
		const data = u.unitData();
		const to = Object.keys(Equipment.equipment).map(Number).find((id) => {
			const e = Equipment.equipment[id];
			return e.uclass == data.uclass && e.spotrange != data.spotrange && e.movmethod == data.movmethod;
		});
		if (to === undefined) continue;
		u.player.prestige = Math.max(u.player.prestige, 1e6);
		if (!play(w, { type: "upgrade", unit: u.id, eqid: to, transport: -1 })) { setup.push("the upgrade of " + unitName(u) + " failed"); return []; }
		if (GR.getUnitSpotRange(u) === data.spotrange) setup.push("the upgrade didn't change the spotting range");
		return violations(w);
	}
	setup.push("no unit had an upgrade with another spotting range");
	return [];
}, true);

//The AI's 2 turns: after each move, the units that stood on the hexes it ordered still have to be there
drill("#74 the AI moves units onto hexes its own units hold", "dr9fr03-t2.json.gz", (w, setup) => {
	const broken: string[] = [];
	let moves = 0;
	playAI(w, (step, overwritten) => {
		if (step.includes(" move ")) moves++;
		for (const o of overwritten) broken.push(step + ": " + unitName(o) + " is no longer on its hex " + hexName(o.getHex()));
		return false;
	});
	if (!moves) setup.push("the AI made no move");
	return broken;
}, true);

//(#75, tempSpotted cleared against the side on display: pinned on the core, test/core.test.ts)
