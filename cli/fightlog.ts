//The fights the game's page plays, as its combat log sees them (#307): the page's front (page.ts) doesn't
//see the core's events, but every fire, support fire too, goes through the combat log's start and end
//(src/legacy/commands.ts fired), with the attacker and the defender before and after
import type { CombatLogModule, CombatRound, CombatUnitState } from "../src/legacy/combatlog";
import type { Unit } from "../src/legacy/unit";
import type { FightView } from "./report";

const fighterOf = (s: CombatUnitState, after: Unit) =>
	({ unit: s.id, eqid: s.eqid, side: s.side, row: s.pos.row, col: s.pos.col, before: { strength: s.str }, after: { strength: after.strength } });

//Records the fights the log ends from now on; take: those since the last take
export function fightRecorder(log: CombatLogModule): { take(): FightView[] } {
	const fights: FightView[] = [];
	const end = log.addCombatEnd.bind(log);
	log.addCombatEnd = function(atk: Unit, def: Unit, id: number, support: boolean) {
		const round = log.combatRound[id] as CombatRound | undefined;
		if (round !== undefined && "attacker" in round)
			fights.push({ support, attacker: fighterOf(round.attacker, atk), defender: fighterOf(round.defender, def) });
		return end(atk, def, id, support);
	};
	return { take: () => fights.splice(0) };
}
