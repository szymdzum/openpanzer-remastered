# The AI arena

Games played headless on the core's session, every player a program: the AI (src/core/ai.ts) or the
scripted general (test/arena/general.ts), many seeds per scenario, and what each side achieved. A
change to the AI is measured by running the arena before and after it: the same scenarios and seeds
give the same games, so a difference in the numbers is the change's (#46).

```sh
npm run arena                                        # Panzer-Verbaende Ostpreussen, 10 seeds a matchup
ARENA_SUITE=1 npm run arena                          # the suite (below), 40 seeds a matchup
ARENA_SEEDS=20 ARENA_FILES=drpzop01.xml,dr9fr03.xml npm run arena
ARENA_SUITE=1 ARENA_SEED_FROM=101 npm run arena      # seeds 101-140, where changes are tuned (Comparing two runs)
ARENA_MATCHUPS=ai-ai,general-general npm run arena   # axis-allies; ai-ai,general-ai,ai-general by default
ARENA_MATCHUPS=general1-ai,general-ai npm run arena  # the first general (#236) beside the general (#605)
ARENA_MATCHUPS=remastered-general npm run arena      # the remastered AI (#409) against the general, whatever the rules
JOBS=2 npm run arena                                 # the processes playing the games, 3 by default
ARENA_OUT=/tmp/arena.json npm run arena              # every game's result as JSON
ARENA_DEBUG=1 npm run arena                          # prints any order of the general's the core refused
ARENA_RULES=classic npm run arena                    # the classic rules; the remaster's by default (#53)
npm run arena:compare -- before.json after.json      # two ARENA_OUT files compared, game by game
```

The AI's changes go into the remaster's rules (#53, src/core/rules.ts): a change is measured by the
arena on the remaster's rules before and after it, and `ARENA_RULES=classic` gives the classic AI the
contracts pin, for a comparison.

It is a Vitest test (test/arena.test.ts) that runs only with `ARENA=1`, which the script sets. The
games are played on `JOBS` node processes at once (test/arena/pool.ts, each a test/arena/worker.ts):
a game depends only on its match (scenario, sides, seed, rules), so it comes out the same in any
process and in any order, and the results are reported in the matches' order. A game takes a
fraction of a second to a second and a half; the suite, 3 matchups of 40 games on 8 scenarios,
about 3.5 minutes with `JOBS=3` (960 games in 211 s on the owner's laptop; `general-general` adds a
fourth matchup). Two short games always run in `npm test`: the general against the AI, so the general
keeps working as the core changes, and a game played both in a worker process and in Vitest's,
which must come out the same but for the time.

## The suite (#604)

Eight scenarios, four with the axis attacking and four with the allies attacking (the side with more
objectives to take at the start, #256), on small and large maps, from 1939 to 1944:

| Scenario | Attacker | Map, units | Why |
|---|---|---|---|
| Panzer-Verbaende Ostpreussen (drpzop01.xml) | axis, 5 to take against 2 | 32×37, 78 | the reference since #46: the AI as a slow attacker |
| Bzura Counterattack (fw82.xml) | allies, 6 against 3 | 34×41, 34 | scenario reinforcements (21 German units on turns 9 and 11), the Polish counterattack, 28 turns |
| Liberation of Indo China (pc1long.xml) | axis, 3 against 2 | 25×41, 37 | sea and ports, and a side with no deployment hexes (France, #302) |
| Zitadelle (cm3kursk.xml) | axis, 5 against 1 | 39×44, 159 | the largest map (39×44) with 159 units, and the slowest game: the time budget's reference (remastered-design.md, "Time budget") |
| Uman Encirclement (lah_it_08.xml) | axis, 4 against 1 | 32×37, 178 | the most units at the start, 1941 in the east, and a defender without deployment hexes |
| Operation Battleaxe (it12baxe.xml) | allies, 5 against 1 | 33×43, 59 | the desert: who wins changes from game to game in every matchup |
| Taman Bridgehead: Krymskaya (dragrom06.xml) | allies, 2 against 1 | 18×19, 90 | the smallest map: a crowded front, where either side wins (19 to 21 in AI vs AI) |
| Operation Luttich (drlutt26.xml) | allies, 4 against 1 | 39×44, 76 | the west in 1944, a short game (12 turns) on a large map: the attack takes objectives in nearly every game and almost never wins |

Each was picked after 6 seeds of every matchup, among scenarios whose games don't all end the same
way or in a couple of turns. In some the same side wins nearly every game (the defender, as the remaster's
rules make it); the other measures still move from game to game.

## The games

Each game is a new scenario started as the game starts it (newGame, src/core/newgame.ts), seeded
with the seed (the game stream) and the seed + 7919 (the AI's stream), every player made a program
and played on the core's session (src/core/session.ts) to the turn limit or a victory. The first player
plays its first turn, its turn start (purchases, deployment) included, as on the screen (#292). One
thing differs from a game on the screen:

- No side plays on the screen, so the turn limit ends no one's game early: every player plays its
  last turn, then the core's outcome decides, as the end screen does (src/core/turn.ts). In the
  remaster rules (#256) the attacker, the side that had more objectives to take at the start, loses
  unless it took them all, and the defender wins by holding out; with as many objectives each at the
  start, the side holding more wins (#231) and a tie is a draw. In the classic rules nobody wins at the
  turn limit. The tables before 25 October counted the side holding more objectives as the winner in
  every game.

## The measures, per side

| Measure | What it says |
|---|---|
| wins | games won: a capture of every objective, the enemy wiped out, or the turn limit's outcome (the defender that held out, #256) |
| victory levels | the victory level of each game the side won (src/core/turn.ts victoryRating) |
| took an objective | the games where the side took at least one objective |
| first objective, turn | the mean turn of the side's first capture of an objective, over the games where it took one |
| objectives taken | captures of objectives per game, retaking included |
| held at the end | objectives the side holds after the last turn |
| units lost, destroyed | per game |
| aircraft lost | of the units lost, the aircraft (the unit's class at its loss: an air unit), per game (#619) |
| lost per objective | units lost per objective taken: the price of its gains |
| orders refused | orders the core refused: the AI plans its whole turn at its start, and some orders no longer fit the map when their turn comes (a hex taken, a target out of range) |

The table has the measures of the side's player in a matchup, over its games, each with its 95%
interval (test/arena/stats.ts), so a number reads as real or as noise:

- **A share of games** (wins, "took an objective": the games where it took one): `k/n (lo-hi%)`,
  Wilson's score interval, which stays inside 0-100% and holds for 0 or n of n.
- **A mean** (first objective, the objectives taken and held, units and aircraft lost, destroyed, orders
  refused): `m ±h`, h = t·s/√n, Student's t with n − 1 degrees of freedom (a table up to 30, the
  Cornish-Fisher expansion above). The first objective's mean is over the games where the side took one.
- **Lost per objective**, a ratio of sums R = Σ lost / Σ taken over the games: the delta method,
  SE = √(Σ(lostᵢ − R·takenᵢ)² / (n(n − 1))) / mean(taken), h = t·SE.

The intervals are closed formulas: no draw of any kind, so a run says the same every time.

## The planning time (#604)

The time each side's controller spends in its calls (join, startTurn, plan, next) in each of its
turns, measured around them in the arena (test/arena/arena.ts, `timed`): for the AI its purchases,
deployment, plan and orders, for the general its orders. A table per scenario gives, per matchup and
side, the turns timed, the mean ms a turn, the 95th percentile (nearest rank) and the worst turn;
ARENA_OUT keeps every turn's ms per side (`turnMs`). The ms are the machine's, never part of a
game's result: the determinism test and the comparison leave them out of every judgement. The
design's budget is 2 seconds of planning a turn on the suite's largest scenario, Zitadelle
(remastered-design.md, "Time budget").

## Comparing two runs (#604)

`npm run arena:compare -- before.json after.json` (test/arena/compare.ts) reads two ARENA_OUT files
and pairs their games by scenario, matchup, seed and last turn; it refuses two runs that didn't play
the same matches (the rules may differ: the classic against the remaster's). For each scenario,
matchup and side it prints each measure before and after, and the paired difference, after less
before, with its 95% interval: mean ± t·s/√n of the games' differences (for wins and "took an
objective", the differences of the 0/1 indicators, in points). The first objective's difference is
over the games where the side took one in both runs. Lost per objective, a ratio of sums each run,
gets the delta method again: each game's linearised term (lostᵢ − R·takenᵢ) / mean(taken), after
less before, gives the standard error. A difference whose interval contains 0 is **noise**, one that
doesn't **differs**; the last line counts those, the line before it the games that came out the same in
both runs but for the time. `--as remastered=ai` names a player as another in both runs before they are
paired: the remastered AI's games against the classic AI's (#610). The planning time is printed, not judged. Pairing
the games takes most of the noise out: the same seed gives both runs the same weather and dice
until the change moves them apart.

**Tune on one set of seeds, accept on another.** A change's weights and choices are tuned on seeds
101-140 (`ARENA_SEED_FROM=101`), and it is accepted on the suite's seeds 1-40, which it has never
been tuned on: the acceptance isn't measured on the games it was fitted to.

**The bar is the general and the AI before the change** (since #618). A change to the remastered AI is accepted when
no scenario and side does worse than before beyond the noise on its main measure against the scripted general
(remastered-design.md, "What done looks like"). Its games against the classic AI are reported, and winning more than
half of them stays the whole AI's target, but they don't block a change. The classic AI stays as an opponent and as the
classic rules' AI; the remastered AI stops borrowing its planner in #627.


## The scripted general (#236)

A reference player, written as a person plays: a Controller like the AI's, so the session plays it
the same way. It buys and deploys as the AI does (the AI's own turn start), so the armies are the
same and only the play differs. Then, one order at a time, on the world as the last order left it:

1. Resupply what is short of ammo or fuel (a third left, half for aircraft), reinforce what is
   worn down to 5, both only away from the enemy.
2. Pick the target its units can hurt most for the least loss, by the core's combat estimate
   (kills less 0.7 × losses, summed over every unit that can reach it, more for a target on an
   objective), and fire on it in order: artillery, aircraft, then the assault, each from the hex
   that gives it the best estimate, until the target is destroyed or no unit can hurt it cheaply.
   Then the next target.
3. Move: onto an empty objective in reach; an attacker toward its nearest objective to take
   (cover preferred, worn-down units and artillery held back from the front, infantry mounted
   while no enemy is within 3 hexes); a defender onto its own objectives left empty. Aircraft short
   of fuel fly back to an airfield. A ground unit on an objective its side holds never leaves it.

It sees what its side sees, and asks the core (`check`) before every order, so no order of its is
ever refused: the arena checks that. Its moves are deterministic: no draw of its own.

### Its doctrine (#605)

The first version (player `general1`, `FIRST_GENERAL` in general.ts, for a comparison) had no plan
beyond the order at hand. Player `general` adds four parts on top (`Doctrine`, test/arena/doctrine.ts
for what it reads of the map), each a hand-built test in test/arena-general.test.ts. It was tuned on seeds 1-16 of the suite,
which the rule in "Comparing two runs" now keeps for acceptance:

- **One sector at a time.** An attacker picks the objective to take where its own strength within
  10 hexes, less half the enemy's strength within 4 of it and twice its force's mean distance, is
  best, and keeps it until it falls. A unit within two turns' move of another objective to take still
  goes for that one; the others go for the sector, and a target near the sector is worth more.
- **A reserve.** At its first turn an attacker holds back a fifth of its mobile units (ground, not
  artillery, 4 moves or more), the furthest from the enemy. They wait out of the enemy's reach near
  the sector and fire only from where they stand. They go where an objective is threatened first,
  and all of them join the attack once no enemy is left within 4 hexes of the sector or in the last
  turns. A defender keeps no reserve: in the suite holding a fifth of its units back lost it objectives.
- **Defence from depth.** An objective of its side's that the enemy can reach within two turns gets
  a garrison: the nearest unit that can go there, a reserve's or a stronger one first. Once the enemy
  is a move away, more units go beside it (two, more while the enemy around it is stronger). An
  attacker's units beside such an objective hold their hexes: the attacker's few objectives are
  its rear. A unit worn down to 4 that holds nothing doesn't fire. It falls back out of the enemy's
  reach, to a town of its side if it can, and is reinforced there. A defender attacks only when the
  estimate gives more kills than losses (losses weigh 1, the attacker's 0.7), and an enemy beside
  one of its objectives is worth more to strike.
- **A sense of time.** The side that had more objectives to take at the start attacks to the end: the
  remaster's outcome makes it lose unless it takes them all (#256). The first general took the role
  from the objectives left, and an attacker that had taken a few turned defender. In the last third
  of the turns the attacker drops the sector for the nearest objective and commits the reserve. It
  also pays more for them: losses weigh 0.4.

Measured on the suite against the classic AI, both sides, the same 40 seeds a scenario, with
`general1` and `general` (`npm run arena:compare`). Only the differences beyond the noise are named:

| Scenario | The general attacking | The general defending |
|---|---|---|
| Ostpreussen | fewer units lost (8.0 to 4.4), lost per objective 4.2 to 2.2 | no difference |
| Bzura | allies: 7.2 objectives taken against 4.7, lost per objective 2.1 to 1.4, fewer held at the end (4.9 to 3.7) | no difference |
| Indochina | took one in 22 games against 8 (the first later, turn 10.4 against 8.2, over more games), held 1.3 against 0.5, lost per objective 38 to 7.4 | fewer taken back, fewer units lost |
| Zitadelle | took one in 22 games against 1, held 1.3 against 0.03, more units lost (29 against 21): Germany's one objective fell in 39 of 40 games, now in 20 | fewer units lost |
| Uman | wins 30 of 40 against 13, first objective earlier, 4.2 taken against 3.4, lost per objective 3.0 to 1.6 | more units lost |
| Battleaxe | allies: 6.4 taken against 5.3, fewer held at the end (3.3 to 2.3) | fewer taken back, fewer units lost |
| Taman | took one in 27 games against 34, fewer units lost; wins and objectives taken the same | fewer units lost |
| Luttich | fewer units lost, lost per objective 14.7 to 12.2 | fewer taken back, more units lost |

As an attacker it is stronger in most scenarios: it takes more objectives or the same for fewer
units. In Bzura and Battleaxe it takes more and holds fewer at the end: the objectives change
hands more often. In Taman it takes its first objective in fewer games, as the sector holds back
units the first general sent to the nearest one. As a defender it wins as often as the first
general (in most scenarios the defender already wins every game) and holds as many objectives.
Its counterattacks are rarer, so it takes fewer back and loses fewer units.

## Baseline of step 0, 30 October 2026 (#606)

The classic AI on the whole suite (#604), the remaster's rules after milestone 3's mechanics, on
main at c3193de (#608, with the stronger general). 40 seeds (1-40) a matchup, 960 games in 211 s.
Run again, it gives the same games: `arena:compare` of two runs showed 0 differences beyond the noise.

```sh
ARENA_SUITE=1 JOBS=3 ARENA_OUT=/tmp/arena-606-baseline.json npm run arena
```

The side with more objectives to take at the start is the attacker (#256): axis in Ostpreussen,
Indochina, Zitadelle and Uman, allies in Bzura, Battleaxe, Taman and Luttich. The tables as
printed, one per scenario, with the planning time after each:

#### drpzop01.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 32/40 (65-90%) | 9.4 ±1.2 | 1.2 ±0.3 | 2.9 ±0.3 | 15.7 ±1.7 | 19.0 ±1.4 | 13.3 ±3.5 | 28.4 ±3.4 |
| allies (ai) | 40/40 (91-100%) | 40 tactical | 9/40 (12-38%) | 13.1 ±2.8 | 0.3 ±0.2 | 4.1 ±0.3 | 19.0 ±1.4 | 15.7 ±1.7 | 69.0 ±45.9 | 14.3 ±1.8 |
| ends: 40× limit; 303 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 0/40 (0-9%) | - | 39/40 (87-100%) | 7.5 ±0.9 | 2.0 ±0.4 | 3.2 ±0.2 | 4.4 ±0.8 | 28.9 ±2.1 | 2.2 ±0.5 | 0.0 ±0.0 |
| allies (ai) | 40/40 (91-100%) | 40 tactical | 20/40 (35-65%) | 11.7 ±1.3 | 0.8 ±0.3 | 3.8 ±0.2 | 28.9 ±2.1 | 4.4 ±0.8 | 36.2 ±13.8 | 8.4 ±1.3 |
| ends: 40× limit; 526 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 26/40 (50-78%) | 10.6 ±1.4 | 0.9 ±0.3 | 2.8 ±0.3 | 11.3 ±1.3 | 15.7 ±1.2 | 12.2 ±3.9 | 35.4 ±3.5 |
| allies (general) | 40/40 (91-100%) | 40 tactical | 7/40 (9-32%) | 14.1 ±2.5 | 0.2 ±0.1 | 4.3 ±0.3 | 15.7 ±1.2 | 11.3 ±1.3 | 89.7 ±62.6 | 0.0 ±0.0 |
| ends: 40× limit; 380 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, drpzop01.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 680 | 8.2 | 12.6 | 44.9 |
| allies (ai) | 680 | 4.0 | 6.1 | 22.6 |
| **general vs ai** |  |  |  |  |
| axis (general) | 680 | 24.9 | 49.9 | 86.6 |
| allies (ai) | 680 | 2.5 | 3.9 | 5.0 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 680 | 7.6 | 10.9 | 13.1 |
| allies (general) | 680 | 10.6 | 18.5 | 63.5 |

#### fw82.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 40/40 (91-100%) | 40 tactical | 40/40 (91-100%) | 8.3 ±1.4 | 4.8 ±0.5 | 4.3 ±0.5 | 14.9 ±1.3 | 5.6 ±0.9 | 3.1 ±0.4 | 9.8 ±1.5 |
| allies (ai) | 0/40 (0-9%) | - | 40/40 (91-100%) | 1.0 ±0.0 | 6.5 ±0.5 | 4.7 ±0.5 | 5.6 ±0.9 | 14.9 ±1.3 | 0.9 ±0.2 | 16.2 ±2.2 |
| ends: 40× limit; 231 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 40/40 (91-100%) | 40 tactical | 40/40 (91-100%) | 8.3 ±0.9 | 4.5 ±0.4 | 4.1 ±0.4 | 8.1 ±1.0 | 5.2 ±0.8 | 1.8 ±0.2 | 0.0 ±0.0 |
| allies (ai) | 0/40 (0-9%) | - | 40/40 (91-100%) | 1.0 ±0.0 | 6.3 ±0.5 | 4.9 ±0.4 | 5.2 ±0.8 | 8.1 ±1.0 | 0.8 ±0.2 | 16.0 ±2.3 |
| ends: 40× limit; 260 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 40/40 (91-100%) | 40 tactical | 40/40 (91-100%) | 8.9 ±1.4 | 6.5 ±0.6 | 5.3 ±0.5 | 13.4 ±1.3 | 9.8 ±1.1 | 2.1 ±0.3 | 18.3 ±2.3 |
| allies (general) | 0/40 (0-9%) | - | 40/40 (91-100%) | 1.0 ±0.0 | 7.2 ±0.6 | 3.7 ±0.5 | 9.8 ±1.1 | 13.4 ±1.3 | 1.3 ±0.2 | 0.0 ±0.0 |
| ends: 40× limit; 215 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, fw82.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 1120 | 1.9 | 3.7 | 6.6 |
| allies (ai) | 1120 | 4.0 | 5.4 | 15.2 |
| **general vs ai** |  |  |  |  |
| axis (general) | 1120 | 2.7 | 8.7 | 19.5 |
| allies (ai) | 1120 | 4.5 | 6.1 | 20.9 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 1120 | 1.8 | 3.5 | 5.0 |
| allies (general) | 1120 | 4.4 | 11.9 | 23.3 |

#### pc1long.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 21/40 (37-67%) | 8.7 ±1.2 | 0.7 ±0.2 | 0.9 ±0.3 | 14.6 ±1.4 | 5.7 ±1.2 | 20.9 ±6.3 | 6.7 ±1.0 |
| allies (ai) | 40/40 (91-100%) | 29 tactical, 9 victory, 2 briliant | 39/40 (87-100%) | 6.8 ±0.8 | 1.8 ±0.2 | 4.1 ±0.3 | 5.7 ±1.2 | 14.6 ±1.4 | 3.1 ±0.8 | 15.8 ±2.2 |
| ends: 1× capture t15, 23× limit, 1× capture t10, 4× capture t9, 1× capture t5, 3× capture t12, 1× capture t7, 2× capture t13, 3× capture t11, 1× capture t8; 129 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 0/40 (0-9%) | - | 22/40 (40-69%) | 10.0 ±1.4 | 0.8 ±0.2 | 1.3 ±0.3 | 5.5 ±0.9 | 14.5 ±1.4 | 7.4 ±2.4 | 0.0 ±0.0 |
| allies (ai) | 40/40 (91-100%) | 33 tactical, 4 briliant, 3 victory | 35/40 (74-95%) | 8.1 ±1.2 | 1.5 ±0.3 | 3.7 ±0.3 | 14.5 ±1.4 | 5.5 ±0.9 | 9.8 ±2.4 | 4.7 ±1.0 |
| ends: 27× limit, 2× capture t7, 3× capture t15, 1× capture t8, 2× capture t6, 1× capture t9, 2× capture t12, 1× capture t17, 1× capture t11; 183 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 6/40 (7-29%) | 12.5 ±2.0 | 0.1 ±0.1 | 1.9 ±0.1 | 15.3 ±0.8 | 4.3 ±0.7 | 102.0 ±80.2 | 6.5 ±1.2 |
| allies (general) | 40/40 (91-100%) | 40 tactical | 6/40 (7-29%) | 13.5 ±4.2 | 0.2 ±0.2 | 3.0 ±0.1 | 4.3 ±0.7 | 15.3 ±0.8 | 21.3 ±16.5 | 0.0 ±0.0 |
| ends: 40× limit; 165 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, pc1long.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 567 | 3.5 | 6.7 | 12.8 |
| allies (ai) | 567 | 2.8 | 4.2 | 8.0 |
| **general vs ai** |  |  |  |  |
| axis (general) | 599 | 8.3 | 17.8 | 30.1 |
| allies (ai) | 595 | 2.0 | 3.9 | 5.2 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 680 | 3.0 | 6.3 | 11.5 |
| allies (general) | 680 | 4.7 | 10.6 | 20.0 |

#### cm3kursk.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 34/40 (71-93%) | 16.8 ±0.8 | 0.9 ±0.1 | 1.8 ±0.1 | 47.8 ±2.0 | 48.1 ±1.6 | 54.6 ±8.5 | 76.3 ±5.7 |
| allies (ai) | 40/40 (91-100%) | 40 tactical | 3/40 (3-20%) | 17.7 ±6.3 | 0.1 ±0.1 | 4.2 ±0.1 | 48.1 ±1.6 | 47.8 ±2.0 | 641.7 ±728.7 | 29.3 ±1.8 |
| ends: 40× limit; 833 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 0/40 (0-9%) | - | 22/40 (40-69%) | 10.8 ±1.4 | 1.5 ±0.5 | 1.3 ±0.5 | 29.2 ±2.1 | 56.1 ±4.6 | 19.1 ±6.1 | 0.0 ±0.0 |
| allies (ai) | 40/40 (91-100%) | 17 briliant, 21 tactical, 2 victory | 33/40 (68-91%) | 10.3 ±1.3 | 1.2 ±0.3 | 4.7 ±0.5 | 56.1 ±4.6 | 29.2 ±2.1 | 46.7 ±11.7 | 26.2 ±2.2 |
| ends: 3× capture t8, 20× limit, 3× capture t5, 1× capture t17, 2× capture t9, 1× capture t15, 1× capture t4, 1× capture t12, 2× capture t10, 2× capture t7, 1× capture t11, 1× capture t13, 2× capture t6; 1823 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 0/40 (0-9%) | - | 36/40 (77-96%) | 14.3 ±0.6 | 1.0 ±0.1 | 1.9 ±0.2 | 47.7 ±1.7 | 41.1 ±1.4 | 48.9 ±6.8 | 98.2 ±6.1 |
| allies (general) | 40/40 (91-100%) | 40 tactical | 3/40 (3-20%) | 18.3 ±7.2 | 0.1 ±0.1 | 4.1 ±0.2 | 41.1 ±1.4 | 47.7 ±1.7 | 548.7 ±628.2 | 0.0 ±0.0 |
| ends: 40× limit; 1609 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, cm3kursk.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 800 | 15.6 | 34.9 | 43.4 |
| allies (ai) | 800 | 15.2 | 36.2 | 48.1 |
| **general vs ai** |  |  |  |  |
| axis (general) | 575 | 99.9 | 250.7 | 729.1 |
| allies (ai) | 574 | 16.3 | 40.1 | 121.2 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 800 | 15.4 | 29.5 | 33.3 |
| allies (general) | 800 | 57.0 | 142.1 | 185.9 |

#### lah_it_08.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 1/40 (0-13%) | 1 tactical | 20/40 (35-65%) | 8.1 ±1.5 | 0.9 ±0.4 | 1.5 ±0.4 | 13.9 ±3.4 | 50.3 ±9.4 | 15.0 ±6.4 | 67.9 ±10.9 |
| allies (ai) | 39/40 (87-100%) | 26 tactical, 13 briliant | 18/40 (31-60%) | 4.3 ±1.7 | 0.5 ±0.2 | 3.5 ±0.4 | 50.3 ±9.4 | 13.9 ±3.4 | 111.8 ±57.7 | 17.2 ±3.1 |
| ends: 26× limit, 11× capture t2, 1× capture t4, 1× capture t3, 1× capture t11; 407 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 30/40 (60-86%) | 14 victory, 16 tactical | 40/40 (91-100%) | 1.4 ±0.2 | 4.2 ±0.2 | 4.7 ±0.2 | 6.8 ±0.7 | 75.1 ±3.2 | 1.6 ±0.2 | 0.0 ±0.0 |
| allies (ai) | 10/40 (14-40%) | 10 tactical | 15/40 (24-53%) | 8.1 ±1.1 | 0.5 ±0.3 | 0.3 ±0.2 | 75.1 ±3.2 | 6.8 ±0.7 | 143.1 ±66.9 | 17.8 ±2.3 |
| ends: 3× capture t8, 8× capture t9, 3× capture t12, 3× capture t10, 10× limit, 5× capture t11, 4× capture t13, 4× capture t14; 1446 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 1/40 (0-13%) | 1 tactical | 27/40 (52-80%) | 10.3 ±0.7 | 1.1 ±0.3 | 2.0 ±0.3 | 18.4 ±1.4 | 60.5 ±2.8 | 16.4 ±5.2 | 95.3 ±4.6 |
| allies (general) | 39/40 (87-100%) | 39 tactical | 3/40 (3-20%) | 12.0 ±2.5 | 0.1 ±0.1 | 3.0 ±0.3 | 60.5 ±2.8 | 18.4 ±1.4 | 807.3 ±925.9 | 0.0 ±0.0 |
| ends: 39× limit, 1× capture t14; 1021 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, lah_it_08.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 404 | 21.4 | 27.9 | 34.2 |
| allies (ai) | 403 | 10.6 | 23.0 | 27.9 |
| **general vs ai** |  |  |  |  |
| axis (general) | 465 | 108.9 | 205.0 | 249.9 |
| allies (ai) | 435 | 9.7 | 21.3 | 29.7 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 560 | 22.4 | 29.9 | 34.4 |
| allies (general) | 559 | 42.5 | 98.9 | 128.0 |

#### it12baxe.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 28/40 (55-82%) | 28 tactical | 39/40 (87-100%) | 5.6 ±0.3 | 4.0 ±0.7 | 2.1 ±0.5 | 27.1 ±1.8 | 21.6 ±2.6 | 6.8 ±1.1 | 21.6 ±3.0 |
| allies (ai) | 12/40 (18-45%) | 5 victory, 2 tactical, 5 briliant | 40/40 (91-100%) | 3.0 ±0.1 | 6.9 ±0.5 | 3.9 ±0.5 | 21.6 ±2.6 | 27.1 ±1.8 | 3.1 ±0.5 | 27.6 ±2.2 |
| ends: 28× limit, 4× capture t16, 1× capture t23, 3× capture t12, 1× capture t20, 1× capture t22, 1× capture t14, 1× capture t13; 387 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 13/40 (20-48%) | 13 tactical | 20/40 (35-65%) | 14.7 ±2.2 | 1.0 ±0.4 | 0.7 ±0.4 | 19.4 ±0.9 | 14.3 ±1.5 | 19.4 ±8.1 | 0.0 ±0.0 |
| allies (ai) | 27/40 (52-80%) | 15 briliant, 9 victory, 3 tactical | 40/40 (91-100%) | 6.1 ±0.5 | 5.3 ±0.3 | 5.3 ±0.4 | 14.3 ±1.5 | 19.4 ±0.9 | 2.7 ±0.3 | 26.1 ±2.3 |
| ends: 13× limit, 3× capture t12, 2× capture t17, 4× capture t11, 1× capture t23, 1× capture t15, 2× capture t16, 1× capture t24, 1× capture t18, 3× capture t20, 1× capture t19, 2× capture t13, 2× capture t14, 3× capture t10, 1× capture t25; 375 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 40/40 (91-100%) | 39 tactical, 1 victory | 40/40 (91-100%) | 8.4 ±1.1 | 5.1 ±0.6 | 3.7 ±0.5 | 28.5 ±1.9 | 14.5 ±1.5 | 5.6 ±0.7 | 26.8 ±3.8 |
| allies (general) | 0/40 (0-9%) | - | 40/40 (91-100%) | 3.0 ±0.4 | 6.4 ±0.8 | 2.3 ±0.5 | 14.5 ±1.5 | 28.5 ±1.9 | 2.3 ±0.4 | 0.0 ±0.0 |
| ends: 37× limit, 2× capture t24, 1× capture t19; 579 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, it12baxe.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 892 | 6.3 | 10.9 | 14.6 |
| allies (ai) | 892 | 5.1 | 9.8 | 12.8 |
| **general vs ai** |  |  |  |  |
| axis (general) | 739 | 10.9 | 23.5 | 51.7 |
| allies (ai) | 738 | 5.1 | 8.8 | 10.6 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 992 | 4.5 | 8.0 | 12.5 |
| allies (general) | 989 | 15.0 | 35.4 | 56.2 |

#### dragrom06.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 19/40 (33-63%) | 19 tactical | 5/40 (5-26%) | 12.8 ±4.1 | 0.1 ±0.1 | 0.7 ±0.3 | 29.0 ±2.0 | 21.9 ±2.1 | 232.2 ±200.2 | 17.9 ±2.5 |
| allies (ai) | 21/40 (37-67%) | 7 tactical, 11 victory, 3 briliant | 31/40 (62-88%) | 12.1 ±0.9 | 1.4 ±0.3 | 2.3 ±0.3 | 21.9 ±2.1 | 29.0 ±2.0 | 15.6 ±3.9 | 28.0 ±2.8 |
| ends: 18× limit, 4× capture t16, 7× capture t13, 4× capture t14, 4× capture t15, 1× capture t11, 2× capture t12; 325 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 40/40 (91-100%) | 40 tactical | 0/40 (0-9%) | never | 0.0 ±0.0 | 1.9 ±0.1 | 12.8 ±1.6 | 26.9 ±2.4 | - | 0.0 ±0.0 |
| allies (ai) | 0/40 (0-9%) | - | 2/40 (1-17%) | 15.5 ±6.4 | 0.1 ±0.1 | 1.1 ±0.1 | 26.9 ±2.4 | 12.8 ±1.6 | 539.0 ±763.1 | 17.4 ±2.5 |
| ends: 40× limit; 486 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 21/40 (37-67%) | 21 tactical | 8/40 (10-35%) | 11.0 ±2.4 | 0.3 ±0.2 | 0.9 ±0.3 | 26.7 ±2.1 | 12.4 ±1.6 | 106.9 ±73.3 | 18.3 ±2.3 |
| allies (general) | 19/40 (33-63%) | 5 tactical, 8 briliant, 6 victory | 27/40 (52-80%) | 10.4 ±1.1 | 1.4 ±0.4 | 2.1 ±0.3 | 12.4 ±1.6 | 26.7 ±2.1 | 9.0 ±2.8 | 0.0 ±0.0 |
| ends: 3× capture t15, 21× limit, 3× capture t9, 1× capture t11, 2× capture t16, 5× capture t13, 1× capture t14, 2× capture t12, 2× capture t10; 650 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, dragrom06.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 594 | 11.2 | 21.3 | 29.6 |
| allies (ai) | 593 | 6.9 | 10.1 | 14.0 |
| **general vs ai** |  |  |  |  |
| axis (general) | 640 | 20.4 | 43.5 | 53.3 |
| allies (ai) | 640 | 6.9 | 10.6 | 14.3 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 574 | 11.2 | 21.1 | 29.2 |
| allies (general) | 574 | 31.0 | 53.6 | 81.8 |

#### drlutt26.xml, 40 seeds, remaster rules

| side (player) | wins | victory levels | took an objective | first objective, turn | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 39/40 (87-100%) | 39 tactical | 27/40 (52-80%) | 10.1 ±0.8 | 0.8 ±0.2 | 3.0 ±0.3 | 32.5 ±1.6 | 52.2 ±2.7 | 39.4 ±10.3 | 65.2 ±3.9 |
| allies (ai) | 1/40 (0-13%) | 1 victory | 39/40 (87-100%) | 5.7 ±0.7 | 1.9 ±0.3 | 2.0 ±0.3 | 52.2 ±2.7 | 32.5 ±1.6 | 27.9 ±5.5 | 25.6 ±2.3 |
| ends: 37× limit, 1× capture t12, 1× capture t10, 1× capture t11; 681 ms a game |  |  |  |  |  |  |  |  |  |  |
| **general vs ai** |  |  |  |  |  |  |  |  |  |  |
| axis (general) | 40/40 (91-100%) | 40 tactical | 2/40 (1-17%) | 9.5 ±19.1 | 0.1 ±0.1 | 3.9 ±0.1 | 18.4 ±1.3 | 48.1 ±2.3 | 369.0 ±517.8 | 0.0 ±0.0 |
| allies (ai) | 0/40 (0-9%) | - | 7/40 (9-32%) | 8.0 ±3.2 | 0.2 ±0.1 | 1.1 ±0.1 | 48.1 ±2.3 | 18.4 ±1.3 | 240.8 ±183.1 | 19.9 ±2.2 |
| ends: 40× limit; 1214 ms a game |  |  |  |  |  |  |  |  |  |  |
| **ai vs general** |  |  |  |  |  |  |  |  |  |  |
| axis (ai) | 40/40 (91-100%) | 39 tactical, 1 victory | 38/40 (83-99%) | 7.0 ±0.7 | 2.2 ±0.4 | 2.8 ±0.3 | 34.0 ±1.8 | 41.7 ±2.0 | 15.4 ±2.4 | 61.0 ±4.3 |
| allies (general) | 0/40 (0-9%) | - | 40/40 (91-100%) | 2.0 ±0.1 | 3.4 ±0.4 | 2.2 ±0.3 | 41.7 ±2.0 | 34.0 ±1.8 | 12.2 ±1.6 | 0.0 ±0.0 |
| ends: 39× limit, 1× capture t10; 1487 ms a game |  |  |  |  |  |  |  |  |  |  |

Planning time, drlutt26.xml: the ms each side's controller took a turn

| side (player) | turns | ms a turn | 95th percentile | worst |
| --- | --- | --- | --- | --- |
| **ai vs ai** |  |  |  |  |
| axis (ai) | 477 | 27.5 | 39.0 | 50.2 |
| allies (ai) | 475 | 13.7 | 25.4 | 32.8 |
| **general vs ai** |  |  |  |  |
| axis (general) | 480 | 80.7 | 162.8 | 300.2 |
| allies (ai) | 480 | 12.1 | 20.6 | 76.6 |
| **ai vs general** |  |  |  |  |
| axis (ai) | 478 | 27.0 | 39.1 | 56.8 |
| allies (general) | 477 | 81.6 | 213.3 | 266.2 |

960 games on 3 processes in 211 s


What it says:

- **As an attacker the AI is weakest in the scenarios where it must cross a front.** Against the
  general's defence it takes 0.1 to 1.1 objectives a game in Ostpreussen, Indochina, Zitadelle, Uman,
  Taman and Luttich, where the general attacking takes 0.8 to 4.2 (Luttich 3.4 against 0.2, Uman 4.2
  against 1.1), and it loses far more units for each objective (Ostpreussen 12.2 against 2.2). It
  attacks better than the general in two: Battleaxe (it wins 27 of 40 as the allies, the general none)
  and Bzura (it loses fewer units per objective, 0.8 against 1.3; it takes fewer, 6.3 against 7.2).
- **As a defender it holds out but loses more units, and falls apart in two scenarios.** It holds
  out in every game against the general's attack in Ostpreussen, Bzura, Indochina, Zitadelle, Battleaxe
  and Luttich. It holds as many objectives at the end as the general defending, or more, except in
  Ostpreussen (3.8 against 4.3) and Luttich (2.8 against 3.9), but it loses more units in every
  scenario (Luttich 34.0 against 18.4, Bzura 13.4 against 8.1). Against the general attacking, its Uman defence wins 10 of 40 (the general's wins 39 of 40
  against the AI's attack) and holds 0.3 objectives at the end; in Taman it wins 21 of 40 (the
  general's 40).
- **The win rate carries no signal in five scenarios.** The remaster's rule (#256) makes an attacker
  that hasn't taken every objective lose at the turn limit, so the defender wins every game of the
  AI against the general in Ostpreussen, Bzura, Indochina, Zitadelle and Luttich, and the attacker
  wins none (0/40 in each). Read the objectives taken and the lost per objective for the attacker, the
  objectives held at the end and the units lost for the defender. Uman (attacker) is the same:
  1 win in 40. The win rate does carry signal in Uman as the defender, in Taman and in Battleaxe.
  Where a side took objectives in few games (the AI attacking in Taman, Luttich and Indochina),
  "lost per objective" has an interval wider than its value: read the objectives taken.
- **The AI wastes orders:** 17 to 98 a game (Zitadelle 98.2 as the axis against the general, Uman
  95.3, Luttich 61 to 65), the general none. The AI plans its turn at its start (#94).
- **The time budget is far off.** The classic AI plans a turn on Zitadelle, the largest scenario, in
  15.6 ms on average (the axis; 15.2 the allies), 95th percentile 36 ms, worst 121 ms. A game of
  Zitadelle takes 0.8 s of AI against AI (the general makes it 1.6 to 1.8 s with its own
  planning, 57 to 100 ms a turn). The budget of 2 s a turn and 10 s a game leaves about 100 times the
  classic AI's turn.
- **The numbers move with the opponent:** the AI's value on a side is its play against the general,
  the general's against the AI, so a gap includes the other side's play (the general defends better
  than the AI, and attacks better in most scenarios).

## The remastered AI, the staff's first part (#616), 30 October 2026

The remastered AI with its staff (remastered-design.md, "Built: the staff"): the garrisons of the objectives in the
enemy's reach (#5), the occupation of an objective its attack emptied (#312), and the classic plan of the other units
made again after every attack, so none of its orders is refused. Remaster rules, the suite, 40 seeds a scenario and
side. Tuned on seeds 101-140 (the first version was kept: nothing was changed after it), accepted on seeds 1-40,
against the classic AI on main at 2fdf5c2 in the same seats:

```sh
ARENA_SUITE=1 JOBS=3 ARENA_OUT=before.json npm run arena    # ai-ai, general-ai, ai-general
ARENA_SUITE=1 JOBS=3 ARENA_MATCHUPS=remastered-ai,general-remastered,remastered-general ARENA_OUT=after-a.json npm run arena
ARENA_SUITE=1 JOBS=3 ARENA_MATCHUPS=ai-remastered ARENA_OUT=after-b.json npm run arena
npm run arena:compare -- before.json after-a.json --as remastered=ai
jq '[.[] | select(.match.sides == ["ai","ai"])]' before.json > before-ai-ai.json
npm run arena:compare -- before-ai-ai.json after-b.json --as remastered=ai
```

`--as remastered=ai` renames the remastered AI in both seats, so remastered-ai and ai-remastered both pair with
ai-ai: they go in two runs (a run can't hold the same match twice). The measures of the remastered AI's side, the
classic AI's value before, after the arrow, where the paired difference is beyond the noise ("same": noise). Orders
refused fell to 0 in every scenario and seat:

| Scenario | Side | against the classic AI | against the general |
|---|---|---|---|
| Ostpreussen | axis attacks | taken 1.2 → 2.6, lost per objective 13.3 → 6.8, held 2.9 → 3.3 | taken 0.9 → 5.1, lost per objective 12.2 → 3.7, held 2.8 → 4.1, units lost 11.3 → 18.6 |
| | allies defend | held 4.1 → 4.6, taken 0.3 → 0.6 | same (held 3.8 → 4.2, units lost 29.0 → 29.7) |
| Bzura | allies attack | held 4.7 → 6.7, taken 6.5 → 5.8 | taken 6.3 → 8.2, held 4.9 → 6.8, units lost 5.2 → 6.6 |
| | axis defend | held 4.3 → 5.1 | held 5.3 → 6.3, retaken 6.5 → 7.7, units lost 13.4 → 15.7 |
| Indochina | axis attack | taken 0.7 → 1.0, held 0.9 → 1.5, units lost 14.6 → 18.0 | taken 0.15 → 1.65, lost per objective 102 → 9.9 |
| | allies defend | held 4.1 → 4.7, units lost 5.7 → 4.4 | held 3.7 → 4.5, units lost 14.5 → 11.0 |
| Zitadelle | axis attack | taken 0.9 → 3.3, held 1.8 → 3.4, lost per objective 55 → 15 | wins 0 → 5 of 40, taken 1.0 → 4.4, lost per objective 48.9 → 12.0, units lost 47.7 → 52.3 |
| | allies defend | held 4.2 → 5.2, units lost 48.1 → 34.8 | held 4.7 → 5.9, units lost 56.1 → 32.5 |
| Uman | axis attack | wins 1 → 36 of 40, taken 0.9 → 3.9, units lost 13.9 → 9.2 | wins 1 → 40 of 40, taken 1.1 → 4.2, lost per objective 16.4 → 3.2 |
| | allies defend | held 3.5 → 4.2, taken 0.45 → 0.75 | wins 10 → 28 of 40, held 0.35 → 1.2 |
| Battleaxe | allies attack | wins 12 → 29 of 40, units lost 21.6 → 11.6, taken 6.9 → 5.9 | wins 27 → 38 of 40, units lost 14.3 → 10.1 |
| | axis defend | wins 28 → 39 of 40, held 2.1 → 3.6 | held 3.7 → 5.4, units lost 28.5 → 20.0, retaken 5.1 → 1.9 |
| Taman | allies attack | wins 21 → 39 of 40, taken 1.4 → 2.1, units lost 21.9 → 13.3 | wins 0 → 18 of 40, taken 0.05 → 1.8, held 1.05 → 2.4 |
| | axis defend | held 0.7 → 1.2, units lost 29.0 → 32.1 | **wins 21 → 12 of 40**, units lost 26.7 → 30.6 |
| Luttich | allies attack | wins 1 → 21 of 40, taken 1.9 → 4.6, lost per objective 27.9 → 8.5 | wins 0 → 5 of 40, taken 0.2 → 5.4, held 1.15 → 3.25 |
| | axis defend | held 3.0 → 5.0, units lost 32.5 → 19.7 | held 2.8 → 4.2, units lost 34.0 → 30.0, taken 2.2 → 3.2 |

Against the classic AI, both sides, the remastered AI wins 432 of the 640 games (67.5%; the classic AI in the
same seats won 320 of 640 by construction), the classic AI 208. Per side and scenario, its wins: Ostpreussen 0 and
40 of 40 (the axis can't win there, #256), Bzura 40 and 1, Indochina 0 and 40, Zitadelle 2 and 40, Uman 36 and 39,
Battleaxe 39 and 29, Taman 26 and 39, Luttich 40 and 21 (axis first).

The targets of remastered-design.md ("What done looks like", against the general): met in 24 of 29. The attacker's
objectives taken and lost per objective are met in every scenario, the defender's held at the end in every one.
Not met: the defender's units lost in Ostpreussen (29.7, target 22.3), Bzura (15.7, worse than the classic 13.4:
it holds and retakes more, 6.3 held and 7.7 retaken against 5.3 and 6.5, and loses units doing it), Indochina (11.0,
target 9.4, from 14.5) and Luttich (30.0, target 26.2, from 34.0); and Taman's defence, 12 wins of 40 against the
classic AI's 21 (target 31). That one is at the noise's edge (−22.5 points, −44.8 to −0.2) and didn't show on the
tuning seeds (19 and 19 of 40), but the remastered defender loses more units there in both sets (+3.9, +4.2): on
the smallest, most crowded map the plan made again after every attack throws more units into the fight. Without the
garrisons it does the same (14 of 40): it is the replanning, not the garrison.

The planning time of the remastered AI, all its turns on the suite (both seats against the classic AI and the
general), seeds 1-40, on the machine that ran them:

| Scenario | ms a turn | 95th percentile | worst | a game, mean | a game, worst |
| --- | --- | --- | --- | --- | --- |
| Ostpreussen | 33 | 72 | 138 | 0.9 s | 1.5 s |
| Bzura | 12 | 25 | 88 | 0.5 s | 0.9 s |
| Indochina | 12 | 27 | 56 | 0.3 s | 0.6 s |
| Zitadelle | 154 | 404 | 525 | 3.1 s | 5.2 s |
| Uman | 170 | 416 | 659 | 2.1 s | 3.8 s |
| Battleaxe | 30 | 62 | 97 | 0.8 s | 1.5 s |
| Taman | 57 | 145 | 240 | 1.0 s | 1.9 s |
| Luttich | 210 | 576 | 809 | 2.8 s | 5.1 s |

Within the budget (2 s a turn, 10 s a game): the plan made again after every attack is about ten times the classic
AI's planning (Zitadelle 15.6 ms a turn), and its worst turn, 0.8 s in Luttich, leaves room for the search of step 4.
The games, both sides played, take 0.3 to 5.2 s.

What it says:

- **Most of the gain is the attacker's.** With every order on the world as it is, the units the classic plan sent
  against a target already destroyed attack the next one, and a unit beside an objective just emptied walks in: the
  remastered attacker takes 2 to 4 times the objectives against the general in Ostpreussen, Zitadelle, Uman and
  Luttich, for a quarter to a third of the units lost per objective, and wins Uman every time.
- **The defender holds more objectives at the end in every scenario** and loses fewer units in five of eight; it
  wins Uman's defence 28 of 40 (10 before). Its garrisons stay on the objectives, so it counterattacks less: in
  Battleaxe it takes back 1.9 against 5.1.
- **No order refused** (17 to 98 a game before).

## The remastered AI, the staff's second part (#617), 31 October 2026

The staff's resupply before contact and its rides out of the enemy's reach (#315) (remastered-design.md, "Built:
the staff"). Before: the staff's first part (#616, main at 365ca1d); after: this, in the same seats, the suite,
remaster rules, seeds 1-40, both runs `remastered` (no `--as`):

```sh
ARENA_SUITE=1 JOBS=3 ARENA_MATCHUPS=remastered-ai,general-remastered,remastered-general ARENA_OUT=after-a.json npm run arena
ARENA_SUITE=1 JOBS=3 ARENA_MATCHUPS=ai-remastered ARENA_OUT=after-b.json npm run arena
npm run arena:compare -- before-a.json after-a.json
```

Tried and left out, each switched off in turn (seeds 101-140 to tune, 1-40 to find the cause of what the first
acceptance showed):

- **Withdrawing a worn-down unit to reinforce** (#6). It saved units, but a defender held fewer objectives at the end
  and won fewer games: Battleaxe's axis held 4.7 against the general instead of 5.2 without it and won 28 of 40
  against the classic AI instead of 34, Luttich's 3.6 instead of 4.05, Uman's allies won 16 to 24 of 40 instead of
  28. For an attacker it cost the objectives it went for (Battleaxe's allies: 9 of 40 wins instead of 35, in the first
  version). Neither sparing the units within 4 hexes of an objective nor those on the front made it neutral.
- **Finishing off a weak enemy first** (#6). Luttich's attacking allies won 11 of 40 against the classic AI with it,
  22 without; Taman's 7 of 40 against the general, 14 without; a defender that did it lost more units (Zitadelle's
  allies 44 instead of 38).
- **Rides kept strictly out of reach** cost Taman's attacking allies their wins against the general (7 of 40, 24
  without the rule) and Uman's defence (16, 22 without): on a crowded map nearly every hex near the fight is in reach,
  and the units came too late. A ride may now end in reach within 2 hexes of an objective. The rule is what saves the
  attacker's units: without it Ostpreussen's axis lost 17 units against the general instead of 12, Zitadelle's 54
  instead of 46.

The remastered AI's side, before (#616) and after, where the paired difference is beyond the noise ("same": noise
on every measure):

| Scenario | Side | against the classic AI | against the general |
|---|---|---|---|
| Ostpreussen | axis attacks | units lost 17.4 → 14.1 | units lost 18.6 → 13.3, lost per objective 3.7 → 2.7, held 4.1 → 3.7 |
| | allies defend | same | same |
| Bzura | allies attack | same | same |
| | axis defend | held 5.1 → 5.9, units lost 14.1 → 12.1 | units lost 15.7 → 13.3 |
| Indochina | axis attack | taken 1.0 → 1.3, lost per objective 17.5 → 13.7 | units lost 16.3 → 14.8 |
| | allies defend | same | same |
| Zitadelle | axis attack | same | units lost 52.3 → 42.7, lost per objective 12.0 → 9.1 |
| | allies defend | same | same |
| Uman | axis attack | same | units lost 13.7 → 11.3, lost per objective 3.2 → 2.6 |
| | allies defend | **units lost 40.6 → 51.2** | same (wins 28 and 28 of 40) |
| Battleaxe | allies attack | same | same |
| | axis defend | same | same |
| Taman | allies attack | **lost per objective 6.3 → 7.8** (units lost 13.3 → 15.7) | same |
| | axis defend | wins 26 → 35 of 40, held 1.2 → 2.05, units lost 32.1 → 22.4 | wins 12 → 27 of 40 (#623), units lost 30.6 → 24.9 |
| Luttich | allies attack | same | same |
| | axis defend | same | units lost 30.0 → 25.8 |

Against the general no scenario and side is worse on its main measure (remastered-design.md, "What done looks
like"). Against the classic AI two are, both on the units lost: Uman's defence (held at the end 4.2 → 3.65, in the
noise) and Taman's attack (it takes as many, 2.1 → 2.0): the rides that end near an objective, in the enemy's reach, on the two most
crowded maps.

Against the classic AI, both sides: 437 of 640 games (432 after #616). Its wins by scenario, axis then allies:
Ostpreussen 0 and 40, Bzura 40 and 0, Indochina 0 and 40, Zitadelle 2 and 40, Uman 38 and 40, Battleaxe 34 and 31,
Taman 35 and 39, Luttich 40 and 18.

The targets of remastered-design.md against the general: 24 of 29, as after #616. Now met: Luttich's defender loses
25.8 units (target 26.2). Not met: Ostpreussen's defender (held 3.95, target 4.1, within the noise of 4.15 before;
units lost 29.2, target 22.3), the defender's units lost in Bzura (13.3, target 10.8, from 15.7) and Indochina (12.4,
target 9.4), and Taman's defence, 27 wins of 40 (target 31; 12 after #616 and 21 for the classic AI, #623).

The planning time of the remastered AI, all its turns, seeds 1-40: Zitadelle 169 ms a turn (95th percentile 407,
worst 570), the worst turn of the suite 820 ms (Luttich), the slowest game 6.0 s: within the budget.

What it says:

- **The attacker keeps its guns and infantry off their trucks where the enemy overruns them** (#315) and loses fewer
  units for as many objectives: a quarter fewer in Ostpreussen, Zitadelle and Uman against the general.
- **Taman's defence wins again** (27 of 40 against the general, 12 after #616): the defender's guns and infantry
  aren't caught on their transports by the attack on the smallest map (#623).
- The withdrawal and the finishing off need the commander's postures (#411): which units are the line, which the
  reserve, when an attack is worth a unit.

## The remastered AI, the assault doctrine (#618), 31 October 2026

The staff's assault (remastered-design.md, "Built: the assault doctrine"): one sector at a time, the ground units sent
to it, and on it the recon, the artillery's fire (on the guns covering the target first), the armour's attack, the
guns moved into range for the next turn, and no attack the estimate says loses more than it kills. Before: the staff's
second part (#617, main at cf15dd0); after: this, the same seats, remaster rules, both runs `remastered`:

```sh
ARENA_SUITE=1 JOBS=3 ARENA_MATCHUPS=remastered-general,general-remastered,remastered-ai,ai-remastered ARENA_OUT=after.json npm run arena
npm run arena:compare -- before.json after.json
```

Tuned on seeds 101-140, switching parts off (the pull to the sector, the steps one by one, the attack rule, the
defender's assault):

- **The pull to the sector for every ground unit** cost the attacker its objectives: Ostpreussen's axis took 2.2
  against the general instead of 4.3, Bzura's allies 6.0 instead of 7.5, Luttich's 4.0 instead of 5.2. The units
  marched past objectives the classic pull to the nearest would have taken. Now a unit within three turns of another
  objective keeps that pull, all of them do in the last third of the turns (as the general drops its sector then), and
  the scenario's defender never pulls its army to the objective it retakes: on seeds 1-40 its pull cost Bzura's
  defending axis a held objective (5.70 at the end instead of 6.75), within the noise without it (6.42).
- **The armour going for every enemy around the sector**, not only the objective's defender, cost Luttich's attacker
  objectives (its tanks spent on the units around the hex didn't take it).
- **Tried and left out**: an attack worth its losses when the estimate has the objective's defender retreat or
  destroyed (no difference); infantry and recon kept out of the attack's waves (no difference).

The remastered AI's side, before (#617) and after, where the paired difference is beyond the noise ("same": noise on
every measure). Orders refused stayed 0:

| Scenario | Side | against the classic AI | against the general |
|---|---|---|---|
| Ostpreussen | axis attacks | same | **lost per objective 2.74 → 3.29**, first objective turn 3.3 → 4.0 (taken 4.85 → 4.65, same) |
| | allies defend | units lost 18.1 → 15.9 | same |
| Bzura | allies attack | same | same (wins 2 → 7 of 40, taken 7.6 → 7.9) |
| | axis defend | units lost 12.1 → 9.0, lost per objective 2.6 → 2.0 | first retaking turn 8.5 → 10.3 (held 6.75 → 6.42, same) |
| Indochina | axis attack | held 1.75 → 2.38, units lost 18.1 → 13.2, lost per objective 13.7 → 8.8 | units lost 14.8 → 13.2 |
| | allies defend | same | units lost 12.4 → 11.1 |
| Zitadelle | axis attack | taken 2.9 → 3.5, held 3.0 → 3.7, lost per objective 16.2 → 11.4 | wins 6 → 15 of 40, taken 4.67 → 5.58, held 3.88 → 4.58 |
| | allies defend | same | lost per objective 35 → 30 |
| Uman | axis attack | **lost per objective 2.05 → 2.49** (units lost 8.4 → 10.1) | first objective turn 2.9 → 2.3 |
| | allies defend | same | same (wins 28 → 29 of 40) |
| Battleaxe | allies attack | taken 5.9 → 7.0, **units lost 10.7 → 15.4** (wins 31 → 24, same) | same (wins 36 → 38 of 40) |
| | axis defend | taken back 3.7 → 4.6, lost per objective 7.3 → 5.7 | same |
| Taman | allies attack | lost per objective 7.8 → 5.6, first objective turn 8.8 → 7.6 | held 2.27 → 2.60, units lost 32.5 → 27.0, lost per objective 17.5 → 13.3 (wins 15 → 24, same) |
| | axis defend | same | same (wins 27 → 28 of 40) |
| Luttich | allies attack | **taken 4.25 → 3.83**, first objective turn 1.85 → 1.40 | **taken 5.35 → 4.67**, units lost 51.3 → 43.9 (wins 6 → 5 of 40, lost per objective 9.6 → 9.4, same) |
| | axis defend | taken back 1.1 → 1.3, lost per objective 17.2 → 13.4 | same |

Against the general two attacker's measures are worse beyond the noise. Ostpreussen's lost per objective is at the
noise's edge (+0.55, 0.06 to 1.04): on the tuning seeds it fell (3.2 → 2.9), and on seeds 41-80, played to check, it
is within the noise (+0.33, -0.27 to 0.92) with 2.4 more units lost; no single part switched off brings it back (all
the steps off: 2.72, but 0.6 fewer objectives taken). Luttich's objectives taken fall in all three seed sets (-0.38,
-0.68, -0.42), with fewer units lost for the same price per objective: on the shortest game of the suite (12 turns)
the attacker that doesn't throw losing attacks takes less. Its main measure by the rule of remastered-design.md (wins,
6 of 40) is within the noise. Both are the owner's call.

Against the classic AI, both sides: 441 of 640 games (437 after #617). Its wins by scenario, axis then allies:
Ostpreussen 0 and 40, Bzura 40 and 2, Indochina 0 and 40, Zitadelle 7 and 40, Uman 38 and 40, Battleaxe 35 and 24,
Taman 38 and 40, Luttich 40 and 17.

The targets of remastered-design.md against the general: 24 of 29, as after #617, the same five not met: Ostpreussen's
defender (held 4.00, target 4.1; units lost 30.6, target 22.3), the defender's units lost in Bzura (12.3, target 10.8)
and Indochina (11.1, target 9.4), and Taman's defence (28 wins of 40, target 31).

The planning time of the remastered AI, all its turns, seeds 1-40: Zitadelle 160 ms a turn (95th percentile 387, worst
500; 171, 408 and 586 before), the worst turn of the suite 784 ms, the slowest game 5.3 s: within the budget.

What it says:

- **Zitadelle's attack wins** 15 of 40 against the general (6 before) and takes 5.6 objectives (4.7): the guns
  brought into range of the sector and its armour on the objective's defender. Taman's attack wins 24 of 40 (15, in
  the noise) and loses 5 units fewer.
- **The attacker loses fewer units** for each objective in Taman, Indochina and Zitadelle (against the classic AI): the
  attacks the estimate says lose more than they kill are no longer made. Against the classic AI, which the protocol
  reports but doesn't judge, Uman's attack pays a little more per objective and Battleaxe's takes more objectives for
  more units.
- **The concentration on one sector (#233, #258) pays only for the units far from it**: a sector pull for every unit
  took objectives from the attacker.

## Baseline, 24 October 2026

Baseline from 24 October, before the suite: Ostpreussen alone, 20 seeds, the old outcome and the
first general. History: the numbers to read are the 30 October baseline above.

Panzer-Verbaende Ostpreussen (drpzop01.xml): Germany (axis) attacks, Poland (allies) defends. Of
the 7 objectives Germany holds 2 at the start and has 5 to take; Poland has Germany's 2 to take.
20 seeds a matchup, on main after #281 with the first player's turn start (#279's review).

| side (player) | wins | first objective, turn (games) | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
|---|---|---|---|---|---|---|---|---|
| **AI vs AI** | | | | | | | | |
| Germany (AI) | 12/20 | 9.3 (20/20) | 2.1 | 3.6 | 13.4 | 23.9 | 6.4 | 33.1 |
| Poland (AI) | 8/20 | 15.1 (8/20) | 0.5 | 3.4 | 23.9 | 13.4 | 53.2 | 12.0 |
| **general vs AI** | | | | | | | | |
| Germany (general) | 12/20 | 4.5 (19/20) | 2.0 | 3.5 | 7.2 | 34.6 | 3.5 | 0 |
| Poland (AI) | 8/20 | 10.9 (8/20) | 0.6 | 3.5 | 34.6 | 7.2 | 57.8 | 8.5 |
| **AI vs general** | | | | | | | | |
| Germany (AI) | 15/20 | 8.7 (20/20) | 3.0 | 4.2 | 18.8 | 22.1 | 6.1 | 34.5 |
| Poland (general) | 5/20 | 14.7 (14/20) | 0.9 | 2.9 | 22.1 | 18.8 | 24.5 | 0 |
| **general vs general** | | | | | | | | |
| Germany (general) | 8/20 | 5.1 (17/20) | 1.9 | 3.2 | 8.5 | 27.6 | 4.6 | 0 |
| Poland (general) | 12/20 | 12.5 (11/20) | 0.7 | 3.8 | 27.6 | 8.5 | 42.5 | 0 |

Every game went to the turn limit; no side took every objective or wiped the other out. Germany
wins at the turn limit by holding 4 of the 7 objectives: its own 2 and 2 of Poland's 5 (#256).

Against the 23 October baseline (main at fa3d3ff, 20 seeds), Germany wins far more often: the AI's
Germany 12 of 20 against the AI's Poland (6 before), the general's 12 (7 before), losing fewer units
for each objective (6.4 against 11.3 for the AI). Two things changed together and these runs don't
separate them: Germany's AI now spends its 3056 starting prestige on its first turn (above its reserve
of 1000) instead of starting its second with it, and the fixes merged since (#87: the estimate no
longer counts the return fire on support units as kills, which the AI's attack scores read; #21: its
reinforcements are budgeted after its purchases).

What it says:

- **The AI is still a slow attacker,** as the playtest found (weak-attacker.md): with Germany it
  takes its first objective on turn 9 of 17. The general, with the same army and the same purchases,
  takes its first on turn 4.5 and destroys 35 Polish units for 7 of its own, but it doesn't take or
  hold more at the end (2.0 against 2.1 taken): it has no reserve and doesn't concentrate. A better AI
  attacker should bring the first objective forward and cut the losses per objective.
- **The AI defends better than the general does:** the general's Poland wins 5 of 20 against the AI's
  Germany and loses 22 units; the AI's Poland holds out in 8 of 20 against either German player. The
  general moves its units out to attack and doesn't fall back; the AI keeps its units entrenched.
- **The AI wastes orders:** about 33 a game as Germany and 12 as Poland are refused: a turn planned
  at its start that the turn's own fighting has overtaken (#94).

The general is a first version: a measuring stick for tempo and losses, not yet a strong player.
Making it hold back a reserve, concentrate on one sector and defend from depth would make it a
harder bar for the remastered AI (milestone "4. Remastered AI": #232-#236, #5, #6).

## The remaster's AI: an attacker leaves its holes (#235), 24 October 2026

The remaster's rules (#53) take the bonus for staying entrenched (50 a level) from a side that
attacks, for each of its units with no enemy it sees within 3 hexes; in contact it keeps the bonus,
to hold the line it reached. A side attacks while it has more objectives still to take than the
enemy (`state.objectives`): it can't win at the turn limit by holding what it has. The roles follow
the game: in Panzer-Verbaende Ostpreussen Germany attacks (5 to take against 2) until it has taken
two; then Poland, behind, attacks to take them back, and Germany holds.

Panzer-Verbaende Ostpreussen, the remaster's rules before (the same as the classic, the baseline
above) and after, the same 20 seeds:

| side (player) | wins | first objective, turn (games) | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
|---|---|---|---|---|---|---|---|---|
| **AI vs AI, before** | | | | | | | | |
| Germany (AI) | 12/20 | 9.3 (20/20) | 2.1 | 3.6 | 13.4 | 23.9 | 6.4 | 33.1 |
| Poland (AI) | 8/20 | 15.1 (8/20) | 0.5 | 3.4 | 23.9 | 13.4 | 53.2 | 12.0 |
| **AI vs AI, after** | | | | | | | | |
| Germany (AI) | 13/20 | 8.9 (20/20) | 2.0 | 3.8 | 12.6 | 25.5 | 6.1 | 33.8 |
| Poland (AI) | 7/20 | 15.3 (6/20) | 0.3 | 3.3 | 25.5 | 12.6 | 85.0 | 13.1 |
| **general vs AI, before** | | | | | | | | |
| Germany (general) | 12/20 | 4.5 (19/20) | 2.0 | 3.5 | 7.2 | 34.6 | 3.5 | 0 |
| Poland (AI) | 8/20 | 10.9 (8/20) | 0.6 | 3.5 | 34.6 | 7.2 | 57.8 | 8.5 |
| **general vs AI, after** | | | | | | | | |
| Germany (general) | 8/20 | 4.5 (19/20) | 2.0 | 3.2 | 8.0 | 35.5 | 3.9 | 0 |
| Poland (AI) | 12/20 | 11.7 (10/20) | 0.8 | 3.8 | 35.5 | 8.0 | 41.7 | 8.9 |
| **AI vs general, before** | | | | | | | | |
| Germany (AI) | 15/20 | 8.7 (20/20) | 3.0 | 4.2 | 18.8 | 22.1 | 6.1 | 34.5 |
| Poland (general) | 5/20 | 14.7 (14/20) | 0.9 | 2.9 | 22.1 | 18.8 | 24.5 | 0 |
| **AI vs general, after** | | | | | | | | |
| Germany (AI) | 13/20 | 8.5 (20/20) | 2.9 | 3.9 | 18.9 | 22.3 | 6.6 | 30.7 |
| Poland (general) | 7/20 | 14.6 (11/20) | 0.9 | 3.1 | 22.3 | 18.9 | 23.5 | 0 |

Over 40 seeds (1-40), before and after:

| | Germany (AI) vs AI: wins, first objective, lost per objective | Poland (AI) vs the general: wins | Germany (AI) vs the general: wins, first objective, lost per objective |
|---|---|---|---|
| before | 21/40, 9.0, 6.4 | 14/40 | 30/40, 8.5, 6.2 |
| after | 24/40, 8.9, 6.9 | 20/40 | 29/40, 8.3, 6.6 |

What it says:

- **The defender gains most.** Poland's AI holds against the general in 12 of 20 games (8 before),
  20 of 40 over the longer run (14): once Germany has taken two objectives, Poland's units away from
  the front leave their holes and come back for them.
- **The German attacker is barely faster.** Its first objective comes 0.1 to 0.4 turns earlier, in
  the noise of 20 seeds; its losses per objective rise a little over 40 seeds (6.4 to 6.9 against
  the AI). The holes weren't what held it back far from the front: the weak pull of a distant
  objective and the crowding round the nearest one (weak-attacker.md, 1 and 2) still do. Against
  the general it wins 13 of 20 (15 before), 29 of 40 over the longer run (30): no real change.
- A first version took the bonus from every unit of an attacker, in contact too: over 40 seeds
  Germany's AI won 19 of 40 against the AI (21 before) and lost 6.9 units per objective in both
  matchups. Units in contact left their line one at a time and were destroyed.

## The remaster: a side without deployment hexes deploys on its towns (#302), 24 October 2026

Pacific, Indochina (pc1long.xml): Japan (axis) attacks with its deployment hexes, France (allies)
has none, so before #302 it bought nothing the whole game (#60, #287). 40 seeds a matchup, remaster
rules, on main after #285 part 2, before and after.

| France (allies) | wins | first objective, turn (games) | objectives taken | held at the end | units lost | destroyed |
|---|---|---|---|---|---|---|
| AI vs AI, before | 38/40 | 8.1 (38/40) | 2.0 | 4.3 | 5.0 | 14.1 |
| AI vs AI, after | 37/40 | 7.0 (38/40) | 1.9 | 4.1 | 7.7 | 13.7 |
| AI vs the general, before | 35/40 | 8.5 (37/40) | 1.4 | 3.8 | 14.8 | 6.5 |
| AI vs the general, after | 39/40 | 7.1 (38/40) | 1.6 | 3.9 | 16.6 | 6.1 |
| the general vs the AI, before | 31/40 | 14.1 (21/40) | 0.7 | 2.8 | 7.2 | 14.0 |
| the general vs the AI, after | 37/40 | 13.0 (18/40) | 0.6 | 3.0 | 6.8 | 14.3 |

What it says: the French side now spends its prestige on units it deploys on its cities and
airfields, and with them takes its first objective a turn earlier against either Japanese player;
with the general it wins 37 of 40 against Japan's AI (31 before). It loses more units (7.7 against
5.0 in AI vs AI): more of them are on the map. The scenario was already France's: Japan's AI wins 2
to 9 of 40 before and 3 after.
