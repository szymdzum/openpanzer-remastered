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
```

It is a Vitest test (test/arena.test.ts) that runs only with `ARENA=1`, which the script sets. A
game takes a second or two; the default run, 4 matchups of 10 games, about two minutes. One short
game of the general against the AI always runs in `npm test`, so the general keeps working as the
core changes.

## The games

Each game is a new scenario started as the game starts it (newGame, src/core/newgame.ts), seeded
with the seed (the game stream) and the seed + 7919 (the AI's stream), every player made a program
and played on the core's session (src/core/session.ts) to the turn limit or a victory. Two things
differ from a game on the screen:

- The first player plays its first turn. In a new game the old game's AI ended its first turn at
  once (session.ts), which costs an attacker a turn the arena doesn't want to measure.
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

## Baseline, 23 October 2026

Panzer-Verbaende Ostpreussen (drpzop01.xml): Germany (axis) attacks, Poland (allies) defends. Of
the 7 objectives Germany holds 2 at the start and has 5 to take; Poland has Germany's 2 to take.
20 seeds a matchup, main at fa3d3ff (with #237's and #214's fixes).

| side (player) | wins | first objective, turn (games) | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |
|---|---|---|---|---|---|---|---|---|
| **AI vs AI** | | | | | | | | |
| Germany (AI) | 6/20 | 9.4 (17/20) | 1.4 | 3.0 | 15.2 | 19.9 | 11.3 | 26.6 |
| Poland (AI) | 14/20 | 14.5 (8/20) | 0.4 | 4.0 | 19.9 | 15.2 | 49.6 | 11.4 |
| **general vs AI** | | | | | | | | |
| Germany (general) | 7/20 | 4.8 (20/20) | 1.9 | 2.9 | 10.6 | 24.1 | 5.6 | 0 |
| Poland (AI) | 13/20 | 10.1 (13/20) | 1.0 | 4.1 | 24.1 | 10.6 | 24.1 | 7.5 |
| **AI vs general** | | | | | | | | |
| Germany (AI) | 14/20 | 8.6 (20/20) | 2.8 | 4.0 | 14.2 | 20.8 | 5.1 | 25.7 |
| Poland (general) | 6/20 | 14.9 (11/20) | 0.8 | 3.0 | 20.8 | 14.2 | 26.0 | 0 |
| **general vs general** | | | | | | | | |
| Germany (general) | 7/20 | 7.4 (19/20) | 2.1 | 3.2 | 10.8 | 23.1 | 5.0 | 0 |
| Poland (general) | 13/20 | 12.8 (13/20) | 0.9 | 3.8 | 23.1 | 10.8 | 24.4 | 0 |

Every game went to the turn limit; no side took every objective or wiped the other out. Germany
wins at the turn limit by holding 4 of the 7 objectives: its own 2 and 2 of Poland's 5.

What it says:

- **The AI is a slow attacker,** as the playtest found (weak-attacker.md): with Germany it takes its
  first objective on turn 9 of 17 and 1.4 objectives a game, losing 11 units for each. Against the
  AI's Poland it wins 6 of 20. The general, with the same army and the same purchases, takes its
  first objective on turn 5, takes more (1.9), destroys more (24 against 20) and loses fewer (11
  against 15), and wins 7 of 20: it gets there faster and cheaper, but it doesn't hold more at the
  end, because it has no reserve and doesn't concentrate, so Poland retakes what it can't garrison.
  A better AI attacker should bring the first objective forward and cut the losses per objective.
- **The AI defends better than the general does.** As Poland the AI wins 14 of 20 against the AI's
  Germany and 13 of 20 against the general's; the general's Poland wins only 6 of 20 against the
  AI's Germany and loses 21 units. The general moves its units out to attack and doesn't fall back;
  the AI keeps its units entrenched in place, which is what a defender needs.
- **The AI wastes orders:** about 26 a game as Germany and 11 as Poland are refused: a turn planned
  at its start that the turn's own fighting has overtaken (#94).

The general is a first version: a measuring stick for tempo and losses, not yet a strong player.
Making it hold back a reserve, concentrate on one sector and defend from depth would make it a
harder bar for the AI changes of milestone "3. Promises kept" (#232-#236, #5, #6).
