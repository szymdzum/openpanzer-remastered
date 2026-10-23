# Playtest: Panzer-Verbaende Ostpreussen as Germany, 23 October 2026

The second game of the day in the first scenario of the Das Reich campaign, this time a full 17-turn
game with Claude as Germany against the Polish AI, played in Chrome on the dev server with the owner
watching and a running commentary in chat. The goal set was a brilliant victory (all five objectives
by turn 10), at least a victory (by turn 13). Moves went through the old UI's own actions
(`uiUnitMove`, `uiUnitAttack`, `Commands.execute` for buy, deploy, mount, resupply, reinforce), and
the combat estimate (`GameRules.calculateCombatResults(..., estimate)`) was read before nearly every
attack. The first game of the day is in [2026-10-23-ostpreussen.md](2026-10-23-ostpreussen.md).

**Result: a tactical victory at the turn limit, with 2 of the 5 objectives taken** (2,20 on turn 3,
4,30 on turn 13). Mława, 18,32 and 28,23 stayed Polish. The game called it a win because at the
turn limit the side holding more victory hexes wins (#231), and the scenario has seven: the five
Germany must take plus Germany's own Neidenburg (1,10) and Soldau (9,2), which Poland never
threatened. Germany held 4, Poland 3. Under PG2's rule (the attacker must take everything) it would
have been a defeat; this is exactly the case #256 asks about.

About 31 of Poland's 65 units were destroyed (all of its aircraft, all of its artillery north of
Mława, four bunkers and fortifications, two TKS, two cavalry squadrons) for 9 German units
(four leFH 18, two Do-17Z, and points off most of the rest). Poland's prestige went from 2000 to 2;
Germany's from 3056 to 195.

A caveat on fairness: the initial Polish positions were read from the unit list before the fog of
war was considered, and played from as "pre-war intelligence". After turn 1 only spotted units were
used.

## Turn by turn

| Turn | What happened |
|---|---|
| 1 | Bought a Pz IVD, a Psw 231(8), two SS on SdKfz 10 and two He-111H-3 (2568 of 3056). Both He-111 deployed on the deployment hexes' air slots and bombed at once: the 100 mm howitzer by 2,20 10→3, the AA MG 5→3, the objective's defender 10→7. The Pz IVD hit the infantry at 1,18 (10→5). South group crossed the 10,3 bridge and closed on the fortification at 13,6 |
| 2 | Poland had reinforced everything hit on turn 1 back to 8-10. Destroyed: a TKS raiding the 1,11 bridge, the infantry at 1,18 and 1,19, the bunker at 2,15 (Sturmpioniere), the infantry at 12,6 (four guns and a Ju-87) and the fortification at 13,6 (one infantry assault). Scenario reinforcements: Ju-87B, Do-17Z, Me-109B |
| 3 | **2,20 taken.** Artillery took the defender's entrenchment from 4 to 1, a He-111 and an SS assault made it retreat, a Psw 231 drove in. Also destroyed: two infantry in the south, a second TKS raid on the bridge, the old defender of 2,20. Karas hit to 7 by the Me-109B |
| 4 | Poland counterattacked 2,20 with cavalry, infantry, a TKS FK and a new 100 mm howitzer. Destroyed the howitzer at 0,21, the cavalry (Pz IVD overrun) and the infantry at 14,6. Eight infantry and a sFH arrived as German reinforcements |
| 5 | Air superiority: the P.11c and the Karas worn down. The heavy artillery bunker at 13,9, which closed the road to Mława, destroyed by two infantry assaults. Air reconnaissance showed Mława held by one Pionierzy unit, its other defenders drawn out onto the German lines |
| 6 | Destroyed the infantry at 3,20 and the P.11c. A He-111 flew into the AA MG at 5,20 and lost 3 of 5 points before releasing (0 kills). Three more leFH arrived |
| 7 | The best turn: the 120 mm and 100 mm howitzers, the infantry at 3,20 (again), the AT bunker at 3,21 and the last Polish aircraft (Karas) destroyed. The way east of 2,20 open |
| 8 | The 155 mm howitzer, the AA MG at 3,21, the infantry at 2,21 and the TKS FK destroyed: Poland's northern group gone. The eastern column reached 3,28, two hexes from 4,30. The leFH pushed forward to 15,8 destroyed by Polish infantry. Brilliant victory now out of reach: 18,32 and 28,23 still 20 hexes from any German ground unit |
| 9 | Polish reinforcements arrived in the west behind the southern group (two cavalry at strength 12, infantry, a TKS FK, a 75 mm gun), as in the first game's turn 7. The 105 mm gun covering Mława destroyed. A Do-17 attack on Mława ignored an estimate that showed rugged defense: 6→2, no kills |
| 10 | Reinforcing a He-111 from 2 to 8 cost about 370 prestige, leaving 5. The page reloaded mid-turn (another session was rebasing in the main checkout under the dev server): the game came back from the turn-start autosave, on the main menu, and the turn was replayed. The 75 mm gun in the west destroyed |
| 11 | Destroyed the ON at 4,29 and the 75 mm gun beside 4,30 (Pz IVD overrun), and a strength-12 cavalry squadron in the west. 4,30's defender left without support. Two leFH lost to the western cavalry |
| 12 | 4,30's defender (out of ammo) worn from 9 to 5 by five attacks whose estimates added up to 13 kills |
| 13 | **4,30 taken**: an SS assault made the defender retreat, a Pz IA with no ammo drove in. A detachment sent south toward 18,32 |
| 14-15 | Mława: the Pionierzy in the city (entrenchment 2-4) cost 3-6 losses per infantry assault for 1 kill; both bombers' last attacks scored nothing. No assault made |
| 16-17 | The Pz IVD reached 17,32, next to 18,32: its defender had entrenchment 8, Pionierzy beside it and artillery behind. No attack on the objective; turn 17's only attack hit a cavalry squadron. Turn limit: tactical victory |

## What the Polish AI did

- **Reinforced everything it could.** Every unit hit but not destroyed came back at 8-10 the next
  turn while its prestige lasted (2000 at the start, gone by turn 15). Wounding was wasted; only
  destroying counted.
- **Raided the bridges.** A TKS reached the 1,11 pontoon bridge on turns 1 and 2, the best move it
  had, as in the first game. Later its western reinforcements destroyed two leFH that had moved
  ahead of the infantry.
- **Counterattacked the captured objective** (2,20) with everything in the north, in the open, and
  lost it all over turns 4-8: two infantry, cavalry, three howitzers, a TKS FK, AA and an AT bunker.
  The objective score pulls its units to a lost victory hex (`updateVictorySides`), whatever the
  cost.
- **Emptied Mława** to do it: by turn 5 the town had one unit left. It never came back, but the
  one unit was enough, dug in in a city (see below).
- **Spent its aircraft** in duels with the Me-109s, as in the first game: P.11c and Karas gone by
  turn 7.
- **Defended the far objectives well without moving**: 18,32's infantry reached entrenchment 8 and
  got Pionierzy and artillery next to it.

## What decided the game

- **The eastern column was committed to the fight around 2,20 for five turns** (3-8) instead of
  going east on turn 3. That cost the brilliant and the normal victory: 18,32 and 28,23 are 20+
  hexes from the start and needed a column on the move from turn 3.
- **One bomber per hex per turn.** A hex has one air slot, so a city can be bombed once a turn;
  the plan assumed three bombers on one target.
- **Bombers ran dry fast** (3-4 attacks) and the airfields are at the map's west edge: a resupply
  costs two turns of flying and one on the ground, and from turn 12 on 4,30 was beyond their range.
- **A dug-in infantry or Pionierzy unit in a city is nearly immune** without engineers: entrenchment
  counts and close combat favours the defender. The Sturmpioniere, the one unit that ignores
  entrenchment, stayed in the north all game.

## Claude's mistakes

- **The plan's split.** Three groups (north, south, east) with too little in each; the east group
  joined the north fight instead of driving east.
- **Moved infantry on its transport next to the target** (turn 2): a mounted move takes the attack
  for the turn.
- **Attacked before reading the estimate** once (turn 9: Do-17 into rugged defense).
- **Reinforced an aircraft without checking the cost** (turn 10: about 370 of 378 prestige).
- **Artillery pushed ahead of the infantry,** three times: four leFH lost.
- **Estimates read as promises.** Across the game the dice came in well under the estimates in a
  long streak. The estimate is the exact expectation of the same dice (`combatKills` and
  `rolledKills`, src/core/combat.ts:320-337); support fire, which weakens the attacker before it
  fires, explains part of the rest. Plan with a margin.

## For the AI and the game

- The turn-limit rule (#256): an attacker that took 2 of 5 objectives won because its own rear
  towns count. The end screen told it "You held the objectives to the end", which fits a defender.
- Reloading the page in the middle of a turn restores the turn-start autosave and shows the main
  menu over a running game; "Continue Game" only hides the menu. Expected for the dev server, but
  worth knowing for a long playtest: keep the dev server's checkout still.
- A move to a hex in the air range was refused ("can't get there", turn 2, a Ju-87 at exactly its
  move points): the air-range path issue #217, fixed during this game.
- After a reload the AI dice repeat exactly from the autosave (same seed): replaying a turn gives
  the same results for the same moves.
