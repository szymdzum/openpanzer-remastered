# The AI arena

Games played headless on the core's session, every player a program: the AI (src/core/ai.ts) or the
scripted general (test/arena/general.ts), many seeds per scenario, and what each side achieved. A
change to the AI is measured by running the arena before and after it: the same scenarios and seeds
give the same games, so a difference in the numbers is the change's (#46).

```sh
npm run arena                                        # Panzer-Verbaende Ostpreussen, 10 seeds a matchup
ARENA_SEEDS=20 ARENA_FILES=drpzop01.xml,dr9fr03.xml npm run arena
ARENA_OUT=/tmp/arena.json npm run arena              # every game's result as JSON
ARENA_DEBUG=1 npm run arena                          # prints any order of the general's the core refused
ARENA_RULES=classic npm run arena                    # the classic rules; the remaster's by default (#53)
```

The AI's changes go into the remaster's rules (#53, src/core/rules.ts): a change is measured by the
arena on the remaster's rules before and after it, and `ARENA_RULES=classic` gives the classic AI the
contracts pin, for a comparison.

It is a Vitest test (test/arena.test.ts) that runs only with `ARENA=1`, which the script sets. A
game takes a second or two; the default run, 4 matchups of 10 games, about two minutes. One short
game of the general against the AI always runs in `npm test`, so the general keeps working as the
core changes.

## The games

Each game is a new scenario started as the game starts it (newGame, src/core/newgame.ts), seeded
with the seed (the game stream) and the seed + 7919 (the AI's stream), every player made a program
and played on the core's session (src/core/session.ts) to the turn limit or a victory. The first player
plays its first turn, its turn start (purchases, deployment) included, as on the screen (#292). One
thing differs from a game on the screen:

- No side plays on the screen, so the turn limit ends no one's game early: every player plays its
  last turn, then the side holding more objectives wins, as the end screen has it since #231. A
  tie is a draw.

## The measures, per side

| Measure | What it says |
|---|---|
| wins | games won: a capture of every objective, the enemy wiped out, or more objectives held at the turn limit ("held") |
| first objective, turn (games) | the mean turn of the side's first capture of an objective, over the games where it took one |
| objectives taken | captures of objectives per game, retaking included |
| held at the end | objectives the side holds after the last turn |
| units lost, destroyed | per game |
| lost per objective | units lost per objective taken: the price of its gains |
| orders refused | orders the core refused: the AI plans its whole turn at its start, and some orders no longer fit the map when their turn comes (a hex taken, a target out of range) |

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
ever refused: the arena checks that. It has no plan beyond the order at hand: no sense of time, no
withdrawal, no reserve.

## Baseline, 24 October 2026

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
harder bar for the AI changes of milestone "3. Promises kept" (#232-#236, #5, #6).

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
