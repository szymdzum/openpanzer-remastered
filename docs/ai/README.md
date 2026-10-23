# The AI

The computer opponent: how it plays, why it plays that way, what playtests showed and what is
planned. docs/MECHANICS.md ("AI") has the short version for players; this folder has the detail
for whoever changes the AI.

| File | What it holds |
|---|---|
| [how-it-plays.md](how-it-plays.md) | The turn, the scores, the settings: the AI as the code runs it (src/core/ai.ts, src/core/aiscore.ts) |
| [weak-attacker.md](weak-attacker.md) | Why it attacks weakly, with the numbers that cause it |
| [playtests/2026-10-23-ostpreussen.md](playtests/2026-10-23-ostpreussen.md) | Games played against it, turn by turn, with what they found |
| [playtests/2026-10-23-ostpreussen-germany.md](playtests/2026-10-23-ostpreussen-germany.md) | A full game as Germany against the Polish AI: a tactical victory at the turn limit with 2 of 5 objectives |
| [arena.md](arena.md) | The AI arena: games played headless against the AI and a scripted general, the measures, the baseline |
| [foundations.md](foundations.md) | How game AI opponents are built (utility, influence maps, search, learning, language models) and a path for this one |
| [remastered-design.md](remastered-design.md) | A proposal for the remaster's own AI, designed from scratch: layers, the language-model commander, tests, order of work |
| [industry-research.md](industry-research.md) | How shipped strategy games build their AI (Unity of Command, Wesnoth, Civilization, Total War, Killzone, HOI4) and what it changes in the design |

## In short

The AI plans its whole turn once, at the start, one unit at a time, by scoring hexes and attacks.
In contact it fights hard: it finishes units it has attacked and destroys what stands forward of
its line. But it doesn't garrison its objectives or withdraw damaged units (MECHANICS.md, "A
cautious attacker, a weak defender"), and it is a weak attacker: every unit is pulled toward the one nearest objective and stops when nothing scores
better than staying entrenched. Its units come in piecemeal, its artillery doesn't prepare the
assault, and it plays the last turns like the first. In the first playtest (Panzer-Verbaende
Ostpreussen, 2026-10-23) the German AI took 1 of 5 objectives in 17 turns. A human-style player
took the first one on turn 4 with the same army.

## Known weaknesses and what is planned

Each is an issue; each change is measured in the AI arena (arena.md, `npm run arena`) against
the AI and a scripted general, before and after.

| Weakness | Issue | Status |
|---|---|---|
| Ground units don't take an empty objective their own fighter is over | #237 | fixed (#238) |
| No sense of time: the same play on turn 3 and turn 14 | #232 | design |
| No concentration: units come in one at a time, no artillery, air, assault order | #233 | design |
| No artillery doctrine: guns don't follow the front or fire before the assault | #234 | design |
| Every unit is pulled to the one nearest objective: a sector crowds one hex while others wait | #258 | design |
| Its aircraft fly alone: no sense of enemy AA or fighters, no escort | #259 | design |
| Buys towed guns and infantry without transports | #224 | bug |
| The bonus for staying entrenched glues an attacker to its hexes | #235 | design |
| Doesn't finish weak, valuable units or withdraw its own damaged ones | #6 | design |
| Doesn't defend its own objectives | #5 | design |
| The difficulty changes resources, not the AI | #16 | design |
| Counts the player's hidden units when scoring attacks | #17 | bug |
| Plans before its reinforcements arrive | #94 | bug, kept |

Changes that make the classic AI play differently go in the remaster ruleset (#53), so the classic
games stay as the original plays them.
