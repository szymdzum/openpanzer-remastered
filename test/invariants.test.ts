//What must hold on every game state, whatever was played: the spotting and zone of control counters
//of every hex equal a recomputation from the units, hexes and units point at each other, every
//unit belongs to its owner's Player. Checked on the 13 engine fixtures as restored and after the AI
//played them for 2 turns. The known ways the engine breaks them are drills below, marked test.fails
//with their issue: fixing a bug flips its test, a new failure is a new defect.
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import type { Hex } from "../src/map";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";

//Mulberry32, the contracts' seeded random (contractRandom in test/contracts/common.js)
function seededRandom(a: number) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

//The modules of the restored state (restoreState resets them for every fixture)
async function load(name: string) {
	const fixture = readFixture("engine", name);
	const scenario = await restoreState(fixture.state);
	const { GameRules } = await import("../src/gamerules");
	const { Leaders } = await import("../src/leaders");
	const { CombatLog } = await import("../src/combatlog");
	const { Equipment } = await import("../src/equipment");
	const { AI } = await import("../src/ai");
	const { game } = await import("../src/game");
	const prototypes = await import("../src/prototypes");
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	//The engine calls into the UI in one place: the AI after deploying its purchases
	(game as unknown as { ui: unknown }).ui = { handleReinforcementDeployment() {} };
	const m = scenario.map;
	//Map.endTurn asks an AI player's handler for actions: the driver builds them itself
	m.getPlayers().forEach((p) => { p.handler = { buildActions() {} } as typeof p.handler; });
	return { scenario, m, GameRules, Leaders, CombatLog, Equipment, AI, game, ...prototypes };
}
type World = Awaited<ReturnType<typeof load>>;

const unitName = (u: Unit) => "unit#" + u.id;
const cellName = (c: Cell) => c.row + "," + c.col;
const hexName = (h: Hex | null) => h ? cellName(h.getPos()) : "no hex";

//A hex's counter: the counters are private, a hex only says whether one is above 0. Counted by
//switching it off until it reads 0, then on again as many times
function counter(isSet: () => boolean, set: (on: boolean) => void): number {
	let n = 0;
	while (isSet() && n < 1000) { set(false); n++; }
	for (let i = 0; i < n; i++) set(true);
	return n;
}

//Every unit's zone of control and spotting put on an empty board with the game's own per-unit
//functions: a board hex counts what the game adds, and claims to be spotted already, so
//setSpotRange marks no unit as newly spotted
function recompute(w: World) {
	const { m, GameRules } = w;
	const board: { zoc: number[]; spot: number[] }[][] = [];
	const shadow: Hex[][] = [];
	for (let r = 0; r < m.rows; r++) {
		board.push([]);
		shadow.push([]);
		for (let c = 0; c < m.cols; c++) {
			const b = { zoc: [0, 0], spot: [0, 0] };
			board[r].push(b);
			shadow[r].push({
				setZOC: (side: number, on: boolean) => { if (on) b.zoc[side]++; },
				setSpotted: (side: number, on: boolean) => { if (on) b.spot[side]++; },
				isSpotted: () => true,
				getUnit: (): Unit | null => null,
			} as unknown as Hex);
		}
	}
	for (const u of m.getUnits()) {
		if (!u.getPos()) continue;
		GameRules.setZOCRange(shadow, u, true, m.rows, m.cols);
		GameRules.setSpotRange(shadow, u, true, m.rows, m.cols);
	}
	return board;
}

//What doesn't hold, a few of each kind. Units in offMap aren't checked for being on their hex
function violations(w: World, offMap: Set<Unit> = new Set()): string[] {
	const { m, uiSettings } = w;
	if (uiSettings.noFOW) return ["fog of war is off: the spotting counters can't be read"];
	const out: string[] = [];
	const kinds: Record<string, number> = {};
	const add = (kind: string, text: string) => {
		kinds[kind] = (kinds[kind] || 0) + 1;
		if (kinds[kind] <= 3) out.push(text);
	};
	const units = m.getUnits();
	const ids = new Set<number>();
	for (const u of units) {
		if (ids.has(u.id)) add("id", unitName(u) + " twice in the unit list");
		ids.add(u.id);
		if (u.player !== m.getPlayer(u.owner))
			add("player", unitName(u) + " has a player that isn't the map's player#" + u.owner);
		const h = u.getHex();
		if (h && h.unit !== u && h.airunit !== u && !offMap.has(u))
			add("unit hex", unitName(u) + " is on " + hexName(h) + ", which holds "
				+ [h.unit, h.airunit].map((x) => x ? unitName(x) : "nothing").join(" and "));
		if (u.destroyed) add("destroyed", unitName(u) + " is destroyed and still in the unit list");
	}
	const board = recompute(w);
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			for (const [slot, u] of [["unit", h.unit], ["airunit", h.airunit]] as const) {
				if (!u) continue;
				if (u.getHex() !== h) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", which is on " + hexName(u.getHex()));
				if (!units.includes(u)) add("hex unit", cellName(h.getPos()) + "." + slot + " is " + unitName(u) + ", not in the unit list");
			}
			for (const side of [0, 1]) {
				const zoc = counter(() => h.isZOC(side), (on) => h.setZOC(side, on));
				if (zoc !== board[r][c].zoc[side])
					add("zoc", `${r},${c} zone of control of side ${side}: ${zoc} instead of ${board[r][c].zoc[side]}`);
				const spot = counter(() => h.isSpotted(side), (on) => h.setSpotted(side, on));
				if (spot !== board[r][c].spot[side])
					add("spot", `${r},${c} spotting of side ${side}: ${spot} instead of ${board[r][c].spot[side]}`);
			}
		}
	for (const [kind, n] of Object.entries(kinds))
		if (n > 3) out.push(`(${n - 3} more ${kind})`);
	return out;
}

//The game's flow without the UI, as the engine contract plays it (test/contracts/engine.contract.js):
//ui.ts uiUnitAttack and uiAttackAnimationFinished, without animations and alerts
function attack(w: World, a: Unit, d: Unit) {
	const { m, GameRules: GR } = w;
	if (!a.getPos() || !d.getPos()) return;
	const aOld = a.strength, dOld = d.strength;
	const cr = GR.calculateAttackResults(a, d, true);
	if (!a.isSurprised && !cr.isOverrun)
		for (const s of GR.getSupportFireUnits(m.getUnits(), a, d)) {
			if (a.destroyed) break;
			m.attackUnit(s, a, true);
		}
	const stopped = GR.isLossOverRetreatThreshold(a.strength, aOld);
	if (!a.destroyed && !stopped) m.attackUnit(a, d, false, cr.isOverrun);
	if (stopped) a.hasFired = true;
	const dDestroyed = dOld - d.strength >= dOld;
	if (aOld - a.strength >= aOld || dDestroyed) m.updateUnitList();
	if (m.currentUnit) {
		if (a.destroyed && m.currentUnit.id == a.id) m.delCurrentUnit();
		else m.selectUnit(m.currentUnit);
		if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
	}
	if (!dDestroyed && GR.shouldDefenderRetreat(a, d, dOld)) {
		const r = GR.getRetreatPosition(m.map, d, m.rows);
		if (r) m.retreatUnit(d, r);
		else { d.destroyed = true; m.updateUnitList(); }
	}
}

//game.ts processAction (move) and ui.ts uiUnitMove and uiMoveAnimationFinished
function move(w: World, u: Unit, cell: Cell) {
	const { m } = w;
	m.setMoveRange(u);
	const mr = m.moveUnit(u, cell.row, cell.col);
	if (u.isSurprised && mr.surpriseCell) {
		const e = m.map[mr.surpriseCell.row][mr.surpriseCell.col].getAttackableUnit(u, false);
		if (e) attack(w, u, e);
		u.isSurprised = false;
	}
}

//The AI plays every player for 2 turns, Math.random seeded. check() runs after every action and end
//of turn, with the units a move put another unit on (#74); it returns true to stop
function playAI(w: World, check: (step: string, overwritten: Unit[]) => boolean) {
	const { m, scenario, CombatLog, actionType: A } = w;
	const realRandom = Math.random;
	Math.random = seededRandom(31);
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
					+ " " + unitName(p[0]) + (p[1] ? " " + (typeof p[1].unitData === "function" ? unitName(p[1]) : cellName(p[1])) : "");
				let occupants: Unit[] = [];
				if (a.type === A.move) {
					const h = m.map[p[1].row][p[1].col];
					occupants = [h.unit, h.airunit].filter((x): x is Unit => x !== null && x !== p[0]);
					move(w, p[0], p[1]);
				} else if (a.type === A.attack) { if (w.GameRules.isInAttackRange(p[0], p[1])) attack(w, p[0], p[1]); }
				else if (a.type === A.resupply) m.resupplyUnit(p[0]);
				else if (a.type === A.reinforce) m.reinforceUnit(p[0], false);
				else if (a.type === A.endturn) break;
				const overwritten = occupants.filter((o) => { const h = o.getHex(); return h && h.unit !== o && h.airunit !== o; });
				if (check(step, overwritten)) return;
			}
			//game.ts endTurn: Scenario.endTurn, then the next player's reinforcements
			scenario.endTurn();
			for (const r of scenario.getReinforcements(m.turn, m.currentPlayer.id)) {
				if (m.deployReinforcement(r.unit, r.row, r.col) === null) continue;
				CombatLog.addReinforcement(r.unit);
				scenario.removeReinforcement(r.turn, r.id);
			}
			if (check(ctx + " end of turn", [])) return;
		}
	} finally { Math.random = realRandom; }
}

//The first step after which an invariant doesn't hold, with what. A unit another one was moved onto
//(#74, its own drill below) is off the map without knowing it: that it isn't on its hex is let
//through, the rest is still checked
function firstBreak(w: World): string | null {
	let found: string | null = null;
	const orphans = new Set<Unit>();
	playAI(w, (step, overwritten) => {
		overwritten.forEach((u) => orphans.add(u));
		const v = violations(w, orphans);
		if (v.length) found = "after " + step + ":\n" + v.join("\n");
		return found !== null;
	});
	return found;
}

//Fixtures where the AI's 2 turns break an invariant through a known bug
const knownBreaks: Record<string, string> = {
	//turn 4, unit#50's support fire on unit#26 gives unit#26 a recon leader: spotting 3 -> 5
	"ruscam09-t2.json.gz": "#73, a recon leader from support fire",
};

for (const name of fixtures("engine"))
	test(`Invariants hold on ${name} as restored`, async () => {
		const w = await load(name);
		expect(violations(w)).toEqual([]);
	});

for (const name of fixtures("engine")) {
	const known = knownBreaks[name];
	(known ? test.fails : test)(`Invariants hold while the AI plays ${name}` + (known ? ` (fails: ${known})` : ""), async () => {
		const w = await load(name);
		expect(firstBreak(w)).toBeNull();
	});
}

//The known bugs, each reproduced on a fixture. A drill returns what kept it from reaching the state
//the bug needs (setup, checked by a plain test so a drill that stops reproducing doesn't pass as
//"still failing") and what the invariants say after it (the bug's test.fails)
interface DrillResult { setup: string[]; broken: string[] }
const drillRuns = new Map<string, Promise<DrillResult>>();
function drill(name: string, fixture: string, run: (w: World, setup: string[]) => string[]) {
	const result = () => {
		if (!drillRuns.has(name))
			drillRuns.set(name, load(fixture).then((w) => {
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
	test.fails(`${name} (known bug, drill on ${fixture})`, async () => {
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

drill("#68 undo detaches the unit from its player", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, playerType } = w;
	m.currentPlayer.type = playerType.humanLocal;
	//The first move that spots nothing new, so it can be undone
	for (const u of movers(w))
		for (const cell of GR.getMoveRange(m, u)) {
			const from = u.getHex()!;
			m.selectUnit(u);
			m.moveUnit(u, cell.row, cell.col);
			if (m.canUndoMove(u)) {
				m.undoLastMove();
				if (u.getHex() !== from) setup.push("the undo didn't move " + unitName(u) + " back");
				return violations(w);
			}
			setup.push("the first move of " + unitName(u) + " can't be undone");
			return [];
		}
	setup.push("no unit could move");
	return [];
});

drill("#72 removeNonCampaignUnits leaves phantom zone of control and spotting", "wdmillazzo-t0.json.gz", (w, setup) => {
	const { m } = w;
	const before = m.getUnits().length;
	for (const p of m.getPlayers()) m.removeNonCampaignUnits(p);
	if (m.getUnits().length === before) setup.push("no unit stood on a deployment hex");
	return violations(w);
});

//A ground unit put on a free airfield, then embarked on an air transport
drill("#73 air embark leaves the ground zone of control and spotting", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, terrainType, unitClass } = w;
	const airfields = m.map.flat().filter((h) => h.terrain == terrainType.Airfield && !h.unit && !h.airunit);
	for (const u of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && !x.hasMoved && !GR.isAir(x))) {
		const from = u.getHex()!;
		for (const h of airfields) {
			place(w, u, h);
			u.player.airTransports = Math.max(u.player.airTransports, 1);
			if (GR.getEmbarkType(m.map, u) == unitClass.airTransport && GR.canEmbark(m.map, u)) {
				const v = violations(w);
				if (v.length) setup.push("invariants broken before embarking: " + v.join("; "));
				if (!m.embarkUnit(u)) setup.push(unitName(u) + " didn't embark");
				return violations(w);
			}
			place(w, u, from);
		}
	}
	setup.push("no unit could embark on an air transport");
	return [];
});

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
				if (!m.embarkUnit(u)) setup.push(unitName(u) + " didn't embark");
				if (GR.getUnitSpotRange(u) === range) { place(w, u, from); continue; }
				return violations(w);
			}
			place(w, u, from);
		}
	}
	setup.push("no unit could embark on a naval transport with another spotting range");
	return [];
});

//An air transported unit with correct counters (its ranges taken off, embarked, put back on)
//disembarks: it turns into a ground unit with its own spotting, the counters stay the transport's
drill("#73 disembarking doesn't redo the zone of control and spotting counters", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, terrainType, unitClass } = w;
	const airfields = m.map.flat().filter((h) => h.terrain == terrainType.Airfield && !h.unit && !h.airunit);
	for (const u of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && !x.hasMoved && !GR.isAir(x))) {
		const from = u.getHex()!;
		for (const h of airfields) {
			place(w, u, h);
			u.player.airTransports = Math.max(u.player.airTransports, 1);
			if (GR.getEmbarkType(m.map, u) == unitClass.airTransport) {
				GR.setZOCRange(m.map, u, false, m.rows, m.cols);
				GR.setSpotRange(m.map, u, false, m.rows, m.cols);
				u.embark(unitClass.airTransport);
				GR.setZOCRange(m.map, u, true, m.rows, m.cols);
				GR.setSpotRange(m.map, u, true, m.rows, m.cols);
				const v = violations(w);
				if (v.length) setup.push("invariants broken after embarking: " + v.join("; "));
				if (!GR.isAir(u)) setup.push(unitName(u) + " isn't air on its transport");
				if (!m.disembarkUnit(u)) setup.push(unitName(u) + " can't disembark");
				return violations(w);
			}
			place(w, u, from);
		}
	}
	setup.push("no unit could embark on an air transport");
	return [];
});

//An attack that gives the attacker a recon leader (+2 spotting)
drill("#73 a recon leader from an attack doesn't widen the spotting counters", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, GameRules: GR, Leaders, leaderType } = w;
	const real = Leaders.generateLeaderWithChance;
	for (const a of m.getUnits().filter((x) => x.player.id == m.currentPlayer.id && x.getPos() && x.leader == -1))
		for (const cell of GR.getUnitAttackCells(m.map, a, m.rows, m.cols)) {
			const d = m.map[cell.row][cell.col].getAttackableUnit(a, false);
			if (!d) continue;
			const range = GR.getUnitSpotRange(a);
			Leaders.generateLeaderWithChance = (u) => u === a ? leaderType.eliteReconVeteran : -1;
			try { m.attackUnit(a, d, false); }
			finally { Leaders.generateLeaderWithChance = real; }
			m.updateUnitList();
			if (a.destroyed) { setup.push(unitName(a) + " was destroyed attacking"); return []; }
			if (GR.getUnitSpotRange(a) === range) setup.push("the leader didn't change the spotting range of " + unitName(a));
			return violations(w);
		}
	setup.push("no unit without a leader could attack");
	return [];
});

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
		if (!m.upgradeUnit(u.id, to, -1)) { setup.push("the upgrade of " + unitName(u) + " failed"); return []; }
		if (GR.getUnitSpotRange(u) === data.spotrange) setup.push("the upgrade didn't change the spotting range");
		return violations(w);
	}
	setup.push("no unit had an upgrade with another spotting range");
	return [];
});

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
});

//A unit of the side on display fires where the enemy doesn't see it: at the end of the round its
//tempSpotted should go, as it does for the other side's units
drill("#75 tempSpotted is cleared against the side on display, not the enemy's view", "ruscam09-t2.json.gz", (w, setup) => {
	const { m, game, unitClass } = w;
	game.spotSide = 0; //a human player's side against the AI (the fixture was played AI against AI)
	const u = m.getUnits().find((x) => x.getPos() && x.player.side == game.spotSide
		&& x.unitData().uclass != unitClass.fortification && !x.getHex()!.isSpotted(~x.player.side & 1));
	if (!u) { setup.push("no unit of side " + game.spotSide + " outside the enemy's view"); return []; }
	u.fire(true);
	if (!u.tempSpotted) setup.push("firing didn't set tempSpotted");
	u.unitEndTurn();
	return u.tempSpotted ? [unitName(u) + " is still tempSpotted on " + hexName(u.getHex()) + ", which side "
		+ (~u.player.side & 1) + " doesn't spot"] : [];
});
