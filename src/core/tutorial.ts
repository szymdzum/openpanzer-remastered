/**
 * Tutorial - the scripted opponent and guide of the tutorial (tutorial.xml) as a controller
 * (controller.ts): src/aiscripted.ts's script without the UI
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Both sides play a script for turns 1 to 4: messages pointing at hexes, selections, mounts, moves,
 * attacks, a reinforcement and a resupply. A turn's actions are built when the turn starts, the units
 * they name looked up then, by the hex they stand on (or picked by their starting hex when the script
 * joins the game), and played one by one later whatever happened in between, as the old game played
 * them (Game.processAction):
 * - a move or a command of a unit that wasn't there is refused (the old game threw before the move
 *   and went on with the next action);
 * - an attack with no unit or no target is where the old game got stuck for good (#80 kept): the order
 *   says so and the session stops;
 * - a selection, a message, the main menu are view events (the main menu opens when the last turn is
 *   built, not when it is played).
 * The turn-1 actions are built twice for the allies (#81 kept: when the script joins the game, then at
 * their turn's start, still turn 1). From turn 5 on, side 0 goes to a person and the other side to the
 * AI, which plans nothing that turn (#81). Most of the turn-1 moves can't reach their hexes (#188 kept),
 * so a new game stops on turn 2.
 */

import type { Command } from "../commands";
import { playerSide, playerType } from "../prototypes";
import type { Controller, Order, Played, ViewEvent } from "./controller";
import type { Position, UnitId, World } from "./types";
import { hexIndex, unitAt } from "./world";

//The units the tutorial picks by their starting hexes when it joins the game
const NAMED = { recon: [8, 12], legioninf: [4, 2], pz2a: [9, 6], ssinf1: [8, 6], ssinf2: [9, 5], ssinf3: [9, 4], arty: [8, 4],
	inf1: [8, 15] } as const;
type Name = keyof typeof NAMED;
type Named = Record<Name, UnitId | null>;

//A unit an action names: one of the picked ones, or the one on a hex when the turn is built
type Who = Name | readonly [number, number];

//One action of the script; noFuel empties the unit's fuel when the turn is built, so the resupply
//after it has something to do. {prestige} in a message is the prestige icon
type Step =
	| readonly ["message", string, number, number]
	| readonly ["select" | "mount" | "reinforce" | "resupply" | "noFuel", Who]
	| readonly ["move", Who, number, number]
	| readonly ["attack", Who, Who]
	| readonly ["mainMenu"];

//Turn 1: the objectives, the units, the moves into fire range
const AXIS_TURN_1: Step[] = [
	["message", "The objective of the game is to conquer all enemy positions marked by a golden frame and enemy flag. This is one of the positions. Moving one of your units into this position will capture this city and raise your flag over it.", 8, 15],
	["message", "This is the second primary objective since it has your enemy flag (Republican Spain) and a golden frame around. Capturing primary objectives gives you a good amount of points called prestige which can be used to upgrade or buy new troops.", 16, 8],
	["message", "This is an optional objective with your enemy flag. Although capturing these  objectives won't count towards victory is good to do so for extra prestige and troops experience. Also troops are better reinforced or resupplied in a city.", 11, 22],
	["select", "legioninf"],
	["message", "This is one of your units and usually represent a historical battalion, the number below is battalion size, usually named strength. Since you are playing as Axis the number is on a grey box. Your enemies (Allied Side) will have this number box in green.", 4, 2],
	["message", "Units have several stats, click the <span class='smallButtonSubMenu'>i</span> button on the right menu to open a panel with unit stats on the bottom of the screen. Notice the movement range <span class='statsGlyph'>?</span> for this unit is 3. The grey hexes around this unit represent this movement range.", 4, 2],
	["message", "This unit has a transport, shown by the <span class='smallButtonSubMenu'>[</span> button on the bottom of the screen. While on transports moving range is increased but, except infantry, units become vulnerable to enemy fire. I will now mount and move this unit for you toward objective.", 4, 2],
	["mount", "legioninf"],
	["select", "legioninf"],
	["move", "legioninf", 7, 9],
	["select", "recon"],
	["message", "This is a recon unit. Recon units can move multiple times per turn and have bigger spotting range <span class='statsGlyph'>'</span> as the game will only show enemy units in the spotting range of your units. Let's check if there aren't any hidden units near the city.", 8, 12],
	["move", "recon", 10, 14],
	["message", "The objective is lightly defended by just one infantry unit. Let's move the rest of the units into fire range, destroy the defender and capture the city. When units move watch how the strength number color changes indicating that unit has moved.", 8, 15],
	["move", "pz2a", 7, 11],
	["mount", "ssinf1"],
	["move", "ssinf1", 7, 15],
	["mount", "ssinf2"],
	["move", "ssinf2", 8, 14],
	["mount", "ssinf3"],
	["move", "ssinf3", 9, 14],
	["mount", "arty"],
	["move", "arty", 7, 13],
	["message", "As we moved all our units and no the targets are in fire range, we should end turn <span class='smallButtonSubMenu'>t</span>which will start enemy turn. If we don't capture all primary objectives in the maximum number of turns (shown left of the top bar) the scenario will end in defeat.", 7, 13],
];

//Turn 1 of the allies: the infantry in the city fires on the mounted SS infantry
const ALLIES_TURN_1: Step[] = [["attack", "inf1", "ssinf1"]];

//Turn 2: artillery first, the city taken, the gamble on the last objective
const AXIS_TURN_2: Step[] = [
	["message", "Notice how this infantry unit jumped out of transport when attacked, instead of staying in the vulnerable transport. Only infantry units will do this others will not dismount when attached. All units are dismounted at the start of your turn.", 7, 15],
	["message", "This is an artillery unit, depending on it's fire range <span class='statsGlyph'>&gt;</span> it can fire on enemy positions from afar without suffering losses. Also each attack will soften enemy positions reducing their <span class='statsGlyph'>&quot;</span> entrenchment.", 7, 13],
	["attack", "arty", "inf1"],
	["message", "We inflicted losses to at least 1 company from the enemy battalion and reduced their entrenchment. Both attacker and defender received combat experience <span class='statsGlyph'>@</span> the later only a small amount since it hasn't inflicted any casualties.", 8, 15],
	["message", "Entrenchment <span class='statsGlyph'>&quot;</span> of a unit is important as it can avoid loses completely. It's a good idea to always check and reduce entrenchment with artillery or bombers before attacking in close combat. Entrenchment is automatically increased depending on terrain each turn when a unit doesn't move.", 8, 15],
	["message", "Notice the small circle on the left of the unit strength box. The presence of this circle signifies that the unit hasn't fired yet and can do so. Some units like mounted artillery and mobile air defense can't move and fire in the same turn.", 8, 14],
	["attack", [8, 14], "inf1"],
	["message", "Infantry units are usually good at defending cities, as they force attacker in close combat <span class='statsGlyph'>6</span> instead of normal ground combat defense <span class='statsGlyph'>5</span>. Other terrain types (shown right of the top bar) influence combat differently for each unit type.", 8, 15],
	["attack", [9, 14], "inf1"],
	["attack", [7, 15], "inf1"],
	["message", "Since the unit defending the city was destroyed or retreated because of heavy casualties we can now move one of our units to capture this objective and get our prestige reward.", 8, 15],
	["move", [7, 11], 8, 15],
	["message", "The city is now ours, and it's flag changed to your flag. This objective capture also increased your prestige by 150&nbsp;{prestige}. You can check prestige, score, remaining turns  and objectives by clicking anywhere on the top bar.", 8, 15],
	["attack", [7, 11], "inf1"],
	["message", "This is the last remaining primary objective. Let's gamble and try capturing it without trying to spot enemy. Capturing objectives in early turns gives a better score.", 16, 8],
	["select", [10, 14]],
	["move", [10, 14], 16, 8],
	["message", "Our unit was surprised by an enemy unit. This happens when you move a unit into an unspotted hex that's occupied by an enemy unit. Surprise attack reduces unit defense and attack values resulting in heavy casualties. Let move to the next turn.", 15, 10],
	["select", [10, 14]],
];

//Turn 3: a reinforcement, the units moved towards the last objective
const AXIS_TURN_3: Step[] = [
	["select", [15, 10]],
	["message", "You can reinforce this unit casualties by clicking on the <span class='smallButtonSubMenu'>#</span> button at the bottom of the screen. Reinforcements costs prestige and the amount is reduced by enemy units adjacent to your unit. After reinforce unit can no longer attack or move.", 15, 10],
	["reinforce", [15, 10]],
	["select", [7, 15]],
	["message", "Let's move the rest of the units towards the objective, note how terrain influence movement range. The longest move range is on road or clear terrain but it also depends on unit movement type shown with symbol <span class='statsGlyph' style='float:none;'>~</span>", 7, 15],
	["mount", [7, 15]],
	["move", [7, 15], 14, 11],
	["mount", [8, 14]],
	["select", [8, 14]],
	["move", [8, 14], 14, 9],
	["mount", [9, 14]],
	["select", [9, 14]],
	["move", [9, 14], 14, 8],
	["mount", [7, 9]],
	["select", [7, 9]],
	["move", [7, 9], 11, 9],
	["mount", [7, 13]],
	["select", [7, 13]],
	["move", [7, 13], 13, 13],
	["select", [8, 15]],
	["move", [8, 15], 12, 12],
];

//Turn 4: the attacks on the front line, the resupply, the end of the tutorial
const AXIS_TURN_4: Step[] = [
	["select", [14, 9]],
	["message", "Let's attack the weakest enemy unit on the front line. The attack cursor gives an estimate of your casualties on the left and enemy casualties on the right below the flags of the units involved in combat.", 15, 9],
	["attack", [14, 9], [15, 9]],
	["message", "This artillery unit has automatically fired when we attacked. That's because artillery provides support fire to friendly units in their range if attacked. Other units with combat support include air defense and fighter planes when attacked by an enemy plane.", 16, 7],
	["message", "Luckily our artillery unit has a bigger range than enemy artillery so we can safely move it into fire range without making us vulnerable to enemy fire while in transport.", 13, 13],
	["mount", [13, 13]],
	["move", [13, 13], 14, 12],
	["message", "Armored units are considered hard targets <span class='statsGlyph'>`</span> and will take less casualties from artillery fire than a soft target like infantry or artillery. In some cases armored units are used to deplete the ammo of the defending artillery.", 12, 12],
	["move", [12, 12], 14, 7],
	["attack", [12, 12], [15, 8]],
	["noFuel", [15, 10]],
	["select", [15, 10]],
	["message", "This unit it's out of fuel and it can no longer move.You can always supply ammo <span class='statsGlyph'></span> and fuel to your units by clicking on the <span class='smallButtonSubMenu'>!</span>   button on the bottom of the screen", 15, 10],
	["resupply", [15, 10]],
	["mainMenu"],
	["message", "This concludes the tutorial and gives you the control of the army to capture the last objective. Remember to use your prestige to upgrade or buy new units by clicking on the <span class='smallButtonSubMenu'>w</span>  button from the menu on the right side of the screen.", 16, 8],
	["message", "You should attack enemy artillery with your own artillery and move your tanks and attack the enemy artillery. There is a possibility that your armor attack will result in an OverRun which completely destroys an unit and allows your armor to continue move and attack.", 16, 8],
	["message", "Remember to tap or click the <span class='smallButtonSubMenu'>t</span> end turn button twice to end your turns. Depending on scenario you or the enemy might also receive reinforcements. On this tutorial you will receive reinforcements next turn.", 16, 8],
];

//An action with its units looked up: ids, null where there was none
interface Queued {
	step: Step[0];
	unit: UnitId | null;
	target: UnitId | null;
	at: Position | null;
	text: string;
}

//The scripted player
export function tutorialController(player: number): Controller {
	let named: Named = null;
	const queue: Queued[] = [];
	//AIScripted.buildActions: the turn's actions queued after any left, the world changed where the
	//script changes it
	const build = (w: World): Played => {
		const built = buildTurn(w, player, named);
		queue.push(...built.queue);
		return { world: built.world, commands: [], events: [], view: built.view, handOver: built.handOver };
	};
	return {
		player,
		join(w) {
			named = pick(w);
			return build(w);
		},
		startTurn: build,
		plan: (w) => w,
		next() {
			const q = queue.shift();
			return q === undefined ? null : orderOf(q);
		},
	};
}

function unitOn(w: World, row: number, col: number): UnitId | null {
	const u = unitAt(w, hexIndex(w, row, col), false);
	return u === null ? null : u.id;
}

function pick(w: World): Named {
	const named = {} as Named;
	for (const name of Object.keys(NAMED) as Name[]) named[name] = unitOn(w, NAMED[name][0], NAMED[name][1]);
	return named;
}

//The script of the turn for the side: its actions queued, the world with the fuel it empties, the main
//menu it opens. Past turn 4, the hand-over: side 0 to a person, the other to the AI
function buildTurn(w: World, player: number, named: Named): { world: World; queue: Queued[]; view: ViewEvent[]; handOver: boolean } {
	const turn = w.state.turn.turn, side = w.state.players[player].side;
	if (turn < 1 || turn > 4) return { world: handOver(w, player), queue: [], view: [], handOver: true };
	const steps = side === playerSide.axis ? [AXIS_TURN_1, AXIS_TURN_2, AXIS_TURN_3, AXIS_TURN_4][turn - 1] : turn === 1 ? ALLIES_TURN_1 : [];
	const queue: Queued[] = [], view: ViewEvent[] = [];
	const who = (x: Who) => typeof x === "string" ? named[x] : unitOn(w, x[0], x[1]);
	for (const s of steps) {
		if (s[0] === "mainMenu") view.push({ type: "mainMenu" });
		else if (s[0] === "noFuel") w = noFuel(w, who(s[1]));
		else queue.push(queued(s, who));
	}
	return { world: w, queue, view, handOver: false };
}

function queued(s: Exclude<Step, readonly ["mainMenu"]>, who: (x: Who) => UnitId | null): Queued {
	const q: Queued = { step: s[0], unit: null, target: null, at: null, text: "" };
	if (s[0] === "message") return { ...q, text: s[1], at: { row: s[2], col: s[3] } };
	q.unit = who(s[1]);
	if (s[0] === "move") q.at = { row: s[2], col: s[3] };
	if (s[0] === "attack") q.target = who(s[2]);
	return q;
}

//The unit's own fuel emptied (whoever it is)
function noFuel(w: World, id: UnitId | null): World {
	if (id === null) return w;
	return { ...w, state: { ...w.state, units: w.state.units.map((u) => u.id === id ? { ...u, fuel: 0 } : u) } };
}

function handOver(w: World, player: number): World {
	const type = w.state.players[player].side === 0 ? playerType.humanLocal : playerType.aiLocal;
	return { ...w, state: { ...w.state, players: w.state.players.map((p) => p.id === player ? { ...p, type } : p) } };
}

//What the old game did with the action (Game.processAction)
function orderOf(q: Queued): Order {
	switch (q.step) {
		case "message": return { view: { type: "message", text: q.text, at: q.at } };
		case "select": return { view: { type: "select", unit: q.unit } };
		case "attack":
			if (q.unit === null || q.target === null) return { view: { type: "stuck", reason: "an attack without its unit (#80)" } };
			return { command: { type: "attack", unit: q.unit, target: q.target } };
		default: return { command: unitCommand(q) };
	}
}

//A command of a unit: one that wasn't there is -1, which the step refuses
function unitCommand(q: Queued): Command {
	const unit = q.unit === null ? -1 : q.unit;
	if (q.step === "move") return { type: "move", unit, to: q.at };
	return { type: q.step === "mount" ? "mount" : q.step === "reinforce" ? "reinforce" : "resupply", unit };
}
