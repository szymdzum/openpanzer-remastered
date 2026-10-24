# Playtest: Bzura Counterattack as Poland, 24 October 2026

A full game of Bzura Counterattack (`fw82.xml`, 28 turns, remaster rules) with Claude as Poland
against the German AI, played entirely through the command-line player on the page
(`npm run play:live`, cli/page.ts) with the owner watching the screen. Claude had read only the
scenario list's briefing before the game, not the scenario file: everything below was learned through
the player's own view (`status`, `map`, `enemies`, `hex`, `attackers`, `targets`, `check`), with
the fog of war as the screen shows it. The point was to play an attacking side, since defending
against the AI had been dull in the earlier games.

**Result: all nine objectives held on turn 25, a capture victory with a tactical rating** (the
victory turns are 20, 23 and 28; a capture rates by the turn it happens, src/core/turn.ts:73).
Holding a majority at turn 28 would also have been tactical: under the remaster rules only taking
everything by turn 20 or 23 rates higher. The capture move broke the page (#311).

Poland held 3 of 9 objectives at the start (Piątek, the Polish Bridgehead, Tum), 8 by turn 5, 7
after the German counteroffensive, and all 9 on turn 25. Prestige went from 2408 to 357; about 2600
was spent on 3× 9TP, a 7TP, four 120 mm howitzers (two lost), two Pionierzy and a Krakusi squadron,
and the rest on reinforcing.

## Turn by turn

| Turn | What happened |
|---|---|
| 1 | Biała (20,34) seen empty and taken by cavalry. Bryski (11,25): the limbered, ammo-less 10.5 cm battery beside it bombed by the Karaś and finished; the 120 mm suppressed the veteran infantry on the objective, the P.11c strafed it, an infantry assault broke it and two pursuits destroyed it; Bryski taken. A German column (Stosstruppen on half-tracks, bridge engineers on wagons) toward Tum: the Stosstruppen destroyed by artillery, then three infantry. Bought a 7TP and a Krakusi squadron. Strzegocin and Leśmierz scouted empty |
| 2 | Strzegocin (15,29) and Leśmierz (21,15) taken: the Krakusi took Leśmierz and hit a truck-mounted PaK from it in one move. A Psw 221 behind the Polish line destroyed (7TP, then the P.11c) |
| 3 | The units outside Łęczyca destroyed: fresh bridge engineers (120 mm, P.11c, militia) and the Schützen (Karaś, infantry). The Bridgehead garrisoned |
| 4 | The bridge engineers by Tum, with their leader, destroyed (Karaś, then a 7TP overrun). Łęczyca dug in to 5 with rugged defence: no assault |
| 5 | **Łęczyca (13,2) taken.** A 75 mm and the P.11c took entrenchment 5 → 3; Pionierzy from 13,3 broke the garrison (10 → 4) out of the town; an infantry attack pushed it away to clear its zone of control; infantry walked in. 8 of 9. The eastern group set off for Łódź |
| 6-7 | The Łęczyca remnant earned a Determined Defense leader (+2 defence) and became unattackable (0-kill estimates): contained, destroyed on turn 8 when worn to 4. Łódź scouted: a Landwehr at entrenchment 8, roadblocks, infantry, a Pz 38(t) |
| 8-10 | **German counteroffensive**: about fifteen scenario reinforcements, three veteran battalions beside Łęczyca and a group by Biała. Piechota #14 in Łęczyca (entrenchment 5) destroyed by three attacks in a row; a 10.5 cm leFH18 walked into the empty town. A Pz 38(t), two PaKs and a 15 cm sFH18 came at the Polish column in the south |
| 11 | On the owner's prompt ("remember that you can reinforce too"), 1488 prestige spent: 3× 9TP and 2× 120 mm, deployed south of Tum |
| 12 | The best turn: PaK #31 (the veteran that had shelled Leśmierz since turn 3) destroyed by the Krakusi after two 120 mm shots suppressed it; the 15 cm sFH18 (7TP, then a 9TP overrun) and PaK #40 (9TP overrun) destroyed, all caught limbered on their trucks; infantry on wagons cut 10 → 5. Losses: 1 point |
| 13-14 | The German southern group finished: two infantry, the bridge engineers, the Pz 38(t) and its leader (artillery, a 9TP, the 7TP, two infantry). West: the second leFH18, caught on its wagons outside Łęczyca, destroyed |
| 15-17 | Siege positions round Łódź. Turn 16's barrage (entrenchment 8 → 6) regenerated overnight; turn 17 lost to the guns' empty ammo (support fire). Biała's cavalry squadron destroyed on turn 17, but no German unit moved in |
| 18-19 | **Łódź (33,20) taken on turn 19**: two days of barrage (8 → 5, then 7 → 4), Pionierzy and cavalry destroyed the Landwehr, the pioneers walked in. Biała had fallen on turn 18 (7 of 9) |
| 19-21 | **Łęczyca retaken on turn 21.** The two veteran battalions left the town to hunt Polish guns (a new 120 mm destroyed on turn 19, the old one on turn 20); the town's bridge engineers destroyed by Pionierzy and by fresh Pionierzy deployed beside the town on turn 20; Polish zones of control kept the Germans out overnight; walked in. Strzegocin's squadron destroyed on turn 21; on turn 22 a Psw 221 walked in |
| 22-24 | The Biała group (leFH18, pioneers, infantry) destroyed or broken around Strzegocin; the Psw left Strzegocin and a TKS retook it on turn 24 (8 of 9). A 120 mm bought and deployed at 17,35, three hexes from Biała |
| 25 | **Biała taken: 9 of 9.** Two 120 mm shots took its infantry to entrenchment 0, a TK3 drove it out, the Krakusi walked in |

## What the German AI did

- **Attacked garrisons in towns, whatever it cost.** Łęczyca on turns 9 and 22-24, Bryski on turn 24,
  Biała and Strzegocin on turns 14-21. It took Łęczyca by destroying a garrison entrenched to 5
  with three attacks in a row, but most attacks on a town cost it more than the defender: at Bryski a
  battalion went 8 → 1 in one turn.
- **Hunted exposed artillery.** The two veteran battalions by Łęczyca came out of the town twice to
  destroy a 120 mm two hexes away. It was the AI's best play of the game, and it left the town to
  the engineers that lost it.
- **Moved on its transports right up to the front.** Guns on trucks and infantry on wagons stood next
  to Polish units at the end of its turns, and that is where it lost most of its army: two PaKs, two
  leFH18, the sFH18, the bridge engineers twice. A mounted unit takes kill 4-6 for no loss.
- **Left objectives it had just emptied.** Twice (Biała turn 17, Strzegocin turn 21) it destroyed the
  only unit on an objective and moved nothing onto it, with units next to it (#312). The third time
  (Strzegocin, turn 22) it walked in the turn after.
- **Refitted everything while prestige lasted**, as in the Ostpreussen games: a unit left at strength
  1-3 was back at 6-9 the next turn (#16 at Łęczyca 2 → 6, the Landwehr in Łódź 6 → 9). Only a unit
  destroyed was gone.
- **Defended Łódź as a fortress.** One second-line Landwehr at entrenchment 8 behind three roadblocks;
  its entrenchment came back by 2-3 a night, so every barrage had to be followed by the assault the
  same turn.
- **Its scenario reinforcements decided the middle of the game**, not its play: about fifteen units
  on turns 8-10 on its deployment hexes, next to Łęczyca and Biała.

## What decided the game

- **Artillery before every assault, and the assault in the same turn.** Three 120 mm shots took a
  defender's entrenchment down by 3-4 levels, whether they killed or not. The barrage, the assault
  and the move into the town had to happen in one turn, or the entrenchment came back.
- **Hunting what was mounted.** The 9TPs' overruns (kill 4-5, no loss, then more moves) on guns and
  infantry on transports did more than any assault.
- **Buying to the fight.** The 1488 spent on turn 11 turned the southern front in one turn. Units
  deployed on a deployment hex can move and attack that turn, artillery included (a 120 mm fired the
  turn it arrived), so a purchase is an attack, not just a reserve.
- **Taking a town: the unit that forces the defender out, or one with moves left, walks in.** In
  Łódź only the pioneers that had attacked could still reach the city.

## Claude's mistakes

- **Guns too close to the enemy.** Two 120 mm lost to veteran infantry 2 hexes away (turns 19-20).
  The waypoint helper moved units by distance alone, without the enemy's reach.
- **Ammo not checked before a barrage.** Support fire in the German turns emptied three guns
  (0/6, 1/6); turn 17's barrage was lost. While mounted the CLI showed only the truck's ammo (#306).
- **One-unit garrisons.** A cavalry squadron alone held Biała and Strzegocin; both were destroyed by
  massed attacks and the towns lost for turns.
- **Moving infantry mounted without checking.** On turn 3 a unit ended its turn on its wagons: a
  move on the transport can't be undone (`undo` refused) and `unmount` after it is refused too.
- **Trusting `attackers` for approaches.** At Łęczyca it listed one hex for six units; four
  approaches were open (#308).
- **The 75 mm guns** fired some fifteen times at kill-1 estimates for almost nothing. Used only to
  suppress before an assault, they earned their place.
- **Marching through forest.** Routing by straight-line distance sent the eastern column and two guns
  into forest dead ends; the road net, read off `map`, was the way.

## The command-line player

It was enough to command a whole game with: every decision came from `status`, `map`, `enemies`,
`hex`, `attackers`, `targets`, `moves`, `check` and `supply`, and the estimates matched the screen's.
The gaps, filed:

- #306: a mounted unit shows its transport's ammo (`ammo 0/0`) as its own.
- #307: on the page, the AI turn's report misses attacks that cost the attacker only, support fire,
  and the first AI turn.
- #308: `attackers` gives one hex per unit.
- #309: `hex` off the map throws.
- #310: bocage drawn as `b`, missing from the legend and also the bunker letter.
- #311: capturing the last objective broke the page; the CLI didn't report the game over.

Not filed: `check mount` doesn't warn that a mounted move can't be undone; in the classic game that is
the rule, but a line in `check` would have saved a turn-3 mistake.
