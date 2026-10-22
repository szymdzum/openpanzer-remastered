//What must hold on every game state, whatever was played: the spotting and zone of control counters
//of every hex equal a recomputation from the units, hexes and units point at each other, every
//unit belongs to its owner's Player. Checked on the 13 engine fixtures as restored and after the AI
//played them for 2 turns. The known ways the engine breaks them are drills below, marked test.fails
//with their issue: fixing a bug flips its test, a new failure is a new defect.
import { expect, test } from "vitest";
import { fixtures } from "./contracts";
import { cellName, hexName, load, unitName, violations, type World } from "./invariants";
import { mulberry32 } from "./lifecycle";
import type { Hex } from "../src/map";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";
import type { AttackResult } from "../src/actions";

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

//The AI plays every player for 2 turns, Math.random seeded. check() runs after every action and end
//of turn, with the units a move put another unit on (#74); it returns true to stop
function playAI(w: World, check: (step: string, overwritten: Unit[]) => boolean) {
	const { m, scenario, CombatLog, actionType: A } = w;
	const realRandom = Math.random;
	Math.random = mulberry32(31); //the contracts' seeded random (contractRandom in test/contracts/common.js)
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
				else if (a.type === A.resupply) w.Commands.execute(scenario, { type: "resupply", unit: p[0].id });
				else if (a.type === A.reinforce) w.Commands.execute(scenario, { type: "reinforce", unit: p[0].id });
				else if (a.type === A.endturn) break;
				const overwritten = occupants.filter((o) => { const h = o.getHex(); return h && h.unit !== o && h.airunit !== o; });
				if (check(step, overwritten)) return;
			}
			//game.ts endTurn: the end turn command, then the next player's reinforcements
			w.Commands.execute(scenario, { type: "endTurn" });
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
//fixed: the bug is fixed, the drill must come out clean (a plain test instead of test.fails)
function drill(name: string, fixture: string, run: (w: World, setup: string[]) => string[], fixed = false) {
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

drill("#68 undo keeps the unit attached to its player", "ruscam09-t2.json.gz", (w, setup) => {
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
}, true);

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
