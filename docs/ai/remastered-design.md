# A remastered AI, designed from scratch

A proposal: how the remaster's own computer opponent could be built if it were designed today,
next to the classic one rather than instead of it. foundations.md has the theory behind it,
how-it-plays.md and weak-attacker.md the AI it would sit beside. Nothing here is built yet.

## What the core already gives

- **`step(world, command)` is pure** (src/core/step.ts): it returns the world after the command
  and leaves the one given as it was, sharing what didn't change. An AI can branch the world and
  try "what if" cheaply, without touching the game. That is what makes search possible.
- **`Controller` is the socket** (src/core/controller.ts), and its comment already names "a remote
  player or an LLM". The remastered AI is a second controller answering in the same commands,
  chosen by the remaster ruleset (#53), so the classic games keep the classic AI.
- **Combat can be predicted** (src/core/combat.ts), the same numbers the HUD shows before an
  attack.

## The layers

```
            ┌───────────────────────────┐
  per turn  │ 3. COMMANDER (strategy)   │  rules OR a language model, one contract:
            │   posture, axis of        │  Directive[] (JSON)
            │   attack, turn clock      │
            └────────────┬──────────────┘
                         ▼
            ┌───────────────────────────┐
            │ 4. STAFF (operations)     │  battle groups + doctrine
            │   groups → tasks →        │  (HTN: assault = recon → artillery →
            │   sequences of actions    │   air → attack → occupy)
            └────────────┬──────────────┘
                         ▼
            ┌───────────────────────────┐
 per order  │ 5. TACTICS (execution)    │  small search on branched worlds,
            │   attack order, hexes     │  replanning after every result
            └────────────┬──────────────┘
                         ▼
                    Command → step()

  underneath:  1. PERCEPTION (fog)   2. ANALYSIS (maps)
```

### 1. Perception: `SideView`

The AI sees what its side sees, and remembers enemies last seen, with a confidence that fades
over the turns. #17 (scoring the player's hidden units) goes away by construction, not by a fix.

### 2. Analysis

Computed once per turn and cached:

- influence maps (own, enemy, the difference): the front line and the weak sectors;
- a threat map: where artillery and aircraft can be hit;
- distance fields to the objectives for each movement method (foot, tracked, wheeled).

Every layer above reads them. A debug overlay draws them over the game's map (a heatmap, the
front, the planned axes), to see what the AI is thinking.

### 3. Commander: strategy

Sets a posture per objective (attack, hold, delay), picks the main effort (the weakest sector on
the way to an objective: going around Mława, as the Germans did in 1939, instead of into it) and
keeps a clock: how many turns are left for how many objectives (#232). It answers a typed
`Directive[]`, for example `{ group: "north", task: "assault", target: <hex>, priority: 1 }`.
The rule-based commander and the language-model one share that contract, so the model is a
module that can be swapped, not a separate architecture.

### 4. Staff: operations

Groups the units into battle groups (by position and role) and breaks their tasks down with a
**doctrine**, HTN style: "assault a hex" is reconnaissance, then artillery fire, then air
strikes, then the armoured attack, then infantry occupies. One place answers #233
(concentration), #234 (artillery), #6 (finishing weak units, withdrawing damaged ones) and #235
(the entrenchment bonus no longer decides whether an attacker moves). Defending an objective
(#5) is one more operation, "garrison".

The doctrine is a growing library of small tactics, each a situation it recognises and a
response with a score (Wesnoth's candidate actions, Unity of Command's tactics), each with its
puzzle test. Unity of Command found that the number of tactics is what turns a predictable AI
into an adaptive one (industry-research.md).

Operations outlive a turn: an offensive is a plan over several turns, which a stateless AI can't
carry out. They are the controller's memory (docs/STATE.md D6), rebuilt deterministically when a
game is loaded. Each has a deadline from the turn clock, after which it attacks with what it has
instead of waiting for every unit (Hearts of Iron IV's slow battle plans).

### 5. Tactics: execution

Within one operation there are few actions, so search pays off there: the AI tries orders of
attack on branched worlds, scored by the predicted combat, and takes the best expected one. The
other difference from the classic AI: **it replans after every order**. The classic one plans
its turn once and keeps to it after an attack went badly.

### Scenario hints

A scenario may carry a few hints for the AI, as Unity of Command's do: the supply lines that
matter, the weak areas and second lines, historical behaviour ("the 3rd Army goes around Mława
through Przasnysz"). The analysis reads them as extra weight on the maps; the commander as
candidate axes. A few per scenario, optional: without hints the AI plays from the maps alone.

### Purchases

A module of its own: buy what the army lacks (towed guns with transport, #224), against what the
commander plans for the next turns, rather than a fixed rotation.

## Across the layers

- **Determinism.** It draws only from the AI's stream (`Rng.aiRandom`, src/rng.ts, CLAUDE.md's
  rule on streams); a branched world's dice move only in the branch, since the stream's position
  is part of the state. A search budget counted in nodes, not milliseconds. The harness, the replays and the contracts work as
  they do today.
- **Personality, not bonuses.** A doctrine profile (aggression, risk, preferred arms); the
  difficulty makes it play better, not richer (#16). Named generals: a fast, daring "Guderian", a
  cautious, frontal "Küchler". Staff reports between turns as the `message` view event that
  already exists.
- **Explanations.** Every decision carries a short reason ("assault on 2,20: the weakest sector,
  3 turns left"): for debugging, for the language-model commander, and for the player.
- **A Web Worker.** Planning off the UI thread, so the game doesn't stall.

## The language-model commander

- **In:** a short situation report from the analysis layer (sectors, objectives, forces, turns
  left, recent losses), not the raw map. The model doesn't count hexes; the analysis does.
- **Out:** `Directive[]`, validated against a schema.
- One call per turn, asynchronous. Without an API key, or when the call fails, the rule-based
  commander takes over: the game never waits on the model.
- The model never moves single units. It does what it is good at; the staff and the tactics do
  the rest. The first playtests had a model play through the UI with bdg, one tool call per
  action: a good playtester, too slow for an opponent.

This is #45, the LLM general, with one change of level: #45 has the model answer in commands,
checked by `check` (#119) and validated with Effect's `Schema` at the engine's edge. Here it
answers in directives, and the staff turns them into commands. The edge #45 describes stays the
same: HTTP, timeouts and retries outside the synchronous core, a schema before anything reaches
the game, and a refusal's reason sent back to the model. A model playing in commands remains
useful as a playtester and as the first, simplest version.

## Tests

- **Tactical puzzles** on a small hand-built map (`smallGame()` in test/headless.test.ts):
  "artillery fires before the assault", "the objective has a garrison", "the AI goes around a
  strong point when a weaker sector is in reach". Each weakness in README.md's table becomes a
  test that fails first.
- **The arena** (arena.md, #46): the remastered AI against the classic one and the scripted general (#236),
  both sides, many seeds, Elo. CI watches that the win rate doesn't drop.

## Order of work

Each step is useful on its own:

1. **Perception and analysis**, with the debug overlay. Changes nothing in play; everything else
   stands on it.
2. **The staff, with the assault and garrison doctrines**, called from the old logic. The biggest
   gain.
3. **The rule-based commander**: the axis of attack and the turn clock.
4. **Tactical search** for the order of attacks.
5. **The language-model commander.**
6. **Tuning the weights and profiles** in the arena.
