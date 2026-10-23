# How game AI opponents are built

The theory behind computer opponents in turn-based wargames, from hand-written scorers to search,
learning and language models, and where this repo's AI sits on that map. how-it-plays.md says what
the AI does, weak-attacker.md why it attacks weakly; this file is the background for deciding what
to build next.

## Where the AI sits

`aiController` (src/core/ai.ts, scores in src/core/aiscore.ts, weights in `aiDefaultConfig`) is a
greedy utility planner: at its turn's start it plans the whole turn, one unit at a time, each unit
taking the hex or attack with the best score. It plugs into the session as a `Controller`
(src/core/controller.ts), so another opponent can slot in beside it on the same commands.

The known weaknesses (weak-attacker.md: piecemeal attacks #233, no artillery doctrine #234, no
sense of time #232, every unit pulled to the same nearest objective, weak valuable units not
sought out and damaged ones not withdrawn #6) follow from that design, not from a bad weight:
every unit decides alone. Nothing decides "artillery first, then three infantry on the same hex", or "go
around Mława". That missing layer is the ceiling, more than the scores.

## 1. Hand-built architectures

What nearly every commercial game ships:

- **Scripts, state machines, behavior trees**: "if X, do Y". Predictable and easy to debug,
  shallow.
- **Utility AI**, this repo's: every possible action gets a weighted score and the best one wins.
  Simple; but the units act independently.
- **A command hierarchy**, the usual fix in wargames: a strategic layer picks the objectives and
  the axis of attack, an operational layer gives groups their tasks, a tactical layer (the
  existing scorer) carries them out. The AI not outflanking Mława is a missing strategic layer.
- **Planners (GOAP, HTN)**: a goal broken into a sequence of actions (bombard the town, assault
  it, occupy it). HTN fits coordinated attacks.

## 2. Influence maps

The best value for effort in wargame AI. Each unit spreads its strength over the hexes around it;
the enemy's map subtracted from one's own gives:

- the front line;
- the weak sectors, which is how the Germans took Mława in 1939: they went around it through
  Przasnysz instead of breaking it;
- the danger zones for artillery and aircraft.

Cheap to compute, and it gives every unit's score a sense of the whole map.

## 3. Search

Minimax won chess but can't work here: a turn is the moves of every unit, so the number of
possible turns is astronomical. What works instead:

- **MCTS** (Monte Carlo Tree Search): random playouts from a state, statistics on which moves
  win. Without action abstraction it chokes on turns with many units.
- **Online Evolutionary Planning** (Justesen et al.): a whole turn as a genome, evolved and scored
  by an evaluation function. Made for games with many actions per turn.
- **Portfolio search** (Churchill and Buro, StarCraft): each group picks one of a few ready
  tactics (attack, hold, retreat) and the search runs only over combinations of tactics. The
  existing scorer can be one of them.
- **Fog of war** makes it a game of imperfect information; the answer in the literature is
  Information Set MCTS, which samples worlds consistent with what the side can see. The AI here
  counts the player's hidden units when it scores attacks (#17): an honest AI sees what its side
  sees.

## 4. Learning

- **Tuning the weights by evolution or self-play**: the cheapest real gain. The engine is
  deterministic, headless and seeded (src/rng.ts), and the weights are data (`AIConfig`): play a
  tournament of AIs with different weights in the arena (#46) and keep the winners. No neural
  networks.
- **Reinforcement learning**: AlphaZero (board games), AlphaStar (StarCraft II), OpenAI Five
  (Dota). It works, but needs millions of games and real engineering (state encoding, action
  masking, rewards). Realistic here only on small scenarios.
- **Imitation learning**: learning from recorded games. Needs data; logged playtests
  (playtests/) could become some.

## 5. Language models as players

Newer, less settled ground.

- Good at: understanding objectives, a plan at a high level, explaining a decision, personality.
- Weak at: spatial reasoning, counting, staying consistent over many turns, time and cost per
  turn.
- The pattern that works: the model as the strategic layer of section 1, with search or the
  scorer carrying out its orders. The strongest example in research is Meta's CICERO
  (Diplomacy), a language model paired with a planner rather than a model alone.

In the first playtests (playtests/2026-10-23-ostpreussen.md) a model played in Chrome through
DevTools (bdg), calling the old UI's own actions and reading the combat estimate before every
attack. That makes it a good playtester (it found #231), but too slow for an opponent, one tool
call per action. An opponent needs the commands (src/commands.ts) plus queries the engine
already answers: the visible units, a unit's move range, the predicted losses of an attack, ammo
and fuel. That is #45, the LLM general.

## 6. Measuring

- **The arena** (arena.md, #46, against the scripted general #236): every AI against every other, both
  sides, many seeds; a win rate, or Elo/TrueSkill.
- **Strong is not fun.** Players want an opponent that looks sensible (concentrates, outflanks,
  withdraws), not a ruthless one. PG2 covered a weak AI with prestige; the difficulty here still
  changes resources, not play (#16). A better, honest AI is the remaster's to offer.

## A path for this repo

remastered-design.md turns this into a design and an order of work: perception and analysis
(the influence maps), then the staff's doctrine, the commander, tactical search, the language
model, and tuning in the arena. Each step is measured in the arena (arena.md, #46), before and
after. Behavior changes go in the remaster ruleset (#53), so the classic games play as the
original did.

## Reading

- Georgios Yannakakis and Julian Togelius, *Artificial Intelligence and Games* (free online): the
  whole field.
- *Game AI Pro* (free chapters online): utility AI (Dave Mark), influence maps, practice from
  shipped games.
- Ian Millington, *AI for Games*.
- Browne et al., *A Survey of Monte Carlo Tree Search Methods* (2012).
- Justesen et al., *Playing Multi-Action Adversarial Games: Online Evolutionary Planning versus
  Tree Search*.
- Churchill and Buro, Portfolio Greedy Search (StarCraft combat).
- Cowling, Powley and Whitehouse, Information Set MCTS (2012).
- DeepMind, AlphaZero (2018) and AlphaStar (2019); OpenAI Five; Meta, CICERO (2022).
