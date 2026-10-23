# Playtest: Panzer-Verbaende Ostpreussen, 23 October 2026

Two games of the first scenario of the Das Reich campaign (September 1939, East Prussia into
Poland), played in Chrome on the dev server by Claude, with the owner watching. The game ran on the
new core (docs/CORE.md). Claude drove the old UI's own actions (`game.ui.uiUnitSelect`,
`uiUnitMove`, `uiUnitAttack`, `Commands.execute` for buy, deploy, mount, resupply, reinforce),
chose every move by hand, and read the combat estimate (`GameRules.calculateCombatResults`) before
every attack. No console error appeared in either game.

**The scenario:** Germany attacks and must take five objectives (2,20; 4,30; Mława 15,12; 18,32;
28,23). A brilliant victory needs all of them by turn 10, a victory by 13, a tactical victory by
17, which is also the turn limit (the scenario's `turns="10, 13, 17"`, read by `victoryRating`,
src/core/turn.ts). Under PG2's rule Poland wins by holding at least one; the game now decides
the turn limit by the victory hexes held (#231), an open question in #256. At the start Germany has 32 units and
air (Me-109, Do-17, Ju-87); Poland has 46, mostly infantry, bunkers, artillery, two TKS tankettes,
a P.11c fighter and a PZL.23 Karaś bomber, and 2000 prestige. Both sides get reinforcements during
the game; Poland gets no prestige per turn.

## Game 1: Claude plays Germany, the AI plays Poland (turns 1-4)

- **Turns 1-2:** a naive script (each unit toward the nearest objective, attack anything in range).
  It confirmed #70's fix (a move costs what the range shows) and that the AI turns run.
- **Turns 3-4:** played as a general: air superiority first (both Me-109s on the PZL.23 Karaś,
  then the P.11c: destroyed), the rear cleared with the Do-17s (two TKS behind the river), the
  howitzer guarding 2,20 destroyed by both Pz IA, the objective's infantry finished by two SS
  attacks. **Objective 2,20 taken on turn 4.** The southern infantry, with artillery and a Stuka
  per target, destroyed three Polish infantry units, a fortification and a bunker. No German unit
  was lost.
- **The Polish AI as defender:** held its bunkers and towns, counterattacked with two TKS behind the
  German lines (the best move it made), and spent both of its aircraft in duels it couldn't win.

## Game 2: Claude plays Poland, the AI plays Germany (17 turns)

**The plan:** don't hold everything. Make Mława a fortress, hold the deep objectives, entrench and
stay, put artillery behind every defender and AA beside it, keep the aircraft for interception,
counterattack only where the estimate says the target dies, and keep prestige in reserve for
reinforcements and a counterattack.

| Turns | What happened |
|---|---|
| 1 | Bought two 37mm wz.36 AT guns and a 40mm wz.36 Bofors (312), deployed north of Mława. 1688 kept. Reserves marched from the rear to Mława |
| 2 | German He-51 shot down over Mława (Bofors, AA, P.11c). German infantry that had taken the western fortification destroyed by a Karaś strike and two infantry attacks; the Polish infantry that went forward was lost the next turn |
| 3 | A 7TP bought (276) and deployed behind the northern objective as a reserve |
| 4-5 | Four Pz IA, a Pz 35(t), two SS, a recon car, an AT gun and artillery ring objective 2,20. Its defender held, reinforced with the prestige reserve. The 7TP destroyed the Pz 35(t) |
| 6 | The German attack on Mława began: an infantry unit destroyed by two Polish infantry and a third chasing its retreat. A Do-17 damaged by AA |
| 7 | Polish scenario reinforcements arrived in the west, behind the Germans at Mława: two cavalry squadrons, infantry, a TKS with a 20mm gun, a 75mm gun. A Do-17 and two more German infantry destroyed at Mława |
| 8-11 | 2,20 left empty several times by retreats and re-occupied each Polish turn (by an AA gun, then the battered infantry). Cavalry charges destroyed infantry at Mława. The 7TP drove into the German lines and hit their artillery (10 → 6) and two Pz IA |
| 12 | 2,20 fell to a Pz IA, after twelve turns. Its defence moved to 4,30 |
| 13-15 | The last German infantry at Mława destroyed by a cavalry charge. The 7TP, surrounded and out of ammo, survived until the German turn 16 |
| 16-17 | Passed without moves, the result being certain: a mistake, see below |

**Result:** Poland held 4 of 5 objectives to the end; Germany reached no victory level. 11 German
units destroyed (six infantry, a Kfz 13 recon car, a Pz 35(t), and three aircraft: He-51, Me-109B,
Do-17); Mława lost no defender. The prestige reserve paid for the guns, the 7TP and about 460 of
reinforcements; about 950 was left. The game's end screen told the Polish player "DEFEAT" (#231).

## What the German AI did

- Pulled its northern group onto the nearest objective, 2,20, and kept it there for ten turns,
  while 4,30 further east waited (weak-attacker.md, 2).
- Sent its Mława group in one or two units at a time, without artillery fire, so each was
  destroyed before the next arrived (3).
- Left many units standing for turns, entrenched and away from the fighting (1).
- Didn't move onto 2,20 on the turns it stood empty, with its fighter overhead (#237).
- Didn't finish the 7TP for five turns, at strength 1-6 and at times without ammo (#6).
- Lost three aircraft flying alone over Polish AA (6).
- Played turns 13-16 like turn 3 (4).
- Destroyed every Polish unit that stood forward of 2,20, and finally took it.

## Claude's mistakes, and what a scripted or LLM general must handle

- **Ammo.** The Karaś and the 7TP ran dry; twice that read as "out of range" until the ammo was
  checked. The tools must say why an attack is impossible, as the core's `check` does.
- **Hex adjacency.** Two hexes side by side in row and column aren't always neighbours on this
  grid; the rules decide, not the coordinates.
- **Bombers attack the hex they are over,** not a neighbouring one.
- **Zones of control** stopped units two hexes from a target or an objective.
- **The counterattack on turn 2** cost the infantry that went forward.
- **A single defender on 2,20.** Two would probably have held it to the end.
- **Turns 16 and 17 passed without moves,** without saying so. The 7TP died in the German turn 16
  with no attempt to save it.
- **The end turn needs two clicks within the button's animation;** a script that clicks once, or
  twice too slowly, waits forever.

## Found during the playtest

- #231: the end screen tells a human defender who held the objectives "DEFEAT".
- #237: AI ground units don't take an empty enemy objective their fighter was ordered over.
- #232-#236: the design issues behind the weak attack, and the scripted general as a tool.
- The game behaved correctly through 17 turns on the new core, purchases, deployment,
  reinforcements, resupply, retreats and saves included.
