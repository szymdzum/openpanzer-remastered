# Why the AI attacks weakly

docs/MECHANICS.md used to call the AI a good attacker and a weak defender. The first playtest
(playtests/2026-10-23-ostpreussen.md) showed the opposite in an attacking scenario: the German AI,
with more units, air and armour, took 1 of 5 objectives in 17 turns against a human Poland. The
numbers in how-it-plays.md explain it. Each cause below is an issue; together they make a cautious,
short-sighted attacker.

## 1. Staying beats a small step forward

The objective pull is 4000 / distance. A step from 10 hexes away to 8 is worth 400 → 500, +100. A
unit entrenched three levels scores +150 for staying, and entrenchment grows every turn it doesn't
move. Far from the objective a step forward is worth even less (from 16 to 14: +36). So a unit that
has stood still for a few turns keeps standing, and the further back it is, the more certainly
(#235).

## 2. Everyone is pulled to the same objective

The objective score counts only the nearest objective to take. All the units of a sector pull
toward the same hex; the ones that arrive first take the hexes around it, those hexes then score
-5000 for the rest, and the rest stop where staying beats the leftover hexes. They don't turn to
another objective, because the nearest one still pulls hardest. In the playtest the German northern
group crowded round objective 2,20 for ten turns while objective 4,30, further east, waited (#258).

## 3. No concentration, no order of arms

Each unit is planned on its own. An attack happens when that unit finds a target worth its loss
threshold from a hex it chose for its own score, not because the turn has a target. So the units
reach the front one or two at a time and attack what is in front of them. Artillery and aircraft are
planned first, but only to attack what they can reach that turn, not to open the way for an assault
(#233, #234). At Mława the German infantry arrived piecemeal over turns 6-15, without artillery
fire, and was destroyed piece by piece: six infantry units and a recon car, while the town lost no
defender.

## 4. No sense of time

Nothing in the plan reads the turn limit or the victory turns. On turn 14, with three turns left
and four objectives missing, the AI weighed the same scores as on turn 3 (#232).

## 5. A bug that kept an objective empty

When the AI ordered a fighter over an empty enemy objective, its ground units didn't move onto it:
the plan counted the hex as taken whatever the slot (#237, fixed by #238). In the playtest objective
2,20 stood empty on several turns with German tanks and infantry next to it.

## 6. Its aircraft fly alone

Aircraft score a third of the objective pull and no danger: they don't avoid enemy anti-aircraft or
escort each other. In the playtest the Germans lost three aircraft (He-51, Me-109B, Do-17) to Polish
AA and a fighter, two of them over Mława (#259).

## What it does well

In contact it fights hard: attacks that cost too much are skipped, attacked units are finished
first, and artillery stays next to the units it supports. In the playtest the German northern group
destroyed every Polish unit that stood forward of objective 2,20 and finally took it. As a defender
it has its own gaps (it doesn't garrison objectives or withdraw damaged units, MECHANICS.md); in the
game where a human played Germany, the Polish AI lost its forward units one by one and spent its
aircraft in duels it couldn't win, but its best move was an attacker's: two TKS raiding behind the
German lines.

## Measuring a change

Every change to these scores is measured in the AI arena (arena.md, #46): the same scenarios, the AI against
the AI and the scripted general (#236), many seeds. For an attacker the measures are the turn of the first
objective taken, the victory level reached, and the losses per objective; for a defender, the
objectives held and the attacker's losses.
