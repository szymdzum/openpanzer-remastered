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

## What done looks like

The remastered AI replaces the classic one in the remaster's rules once it meets these, measured
in the arena (arena.md) on the scenario suite of step 0, 40 seeds a scenario and side. The numbers
are first targets, set from the 24 October baseline on Panzer-Verbaende Ostpreussen (arena.md),
and are set again for each scenario once step 0 has measured the classic AI on the whole suite.

| Measure | Classic AI today (Ostpreussen, Germany attacking) | Target |
|---|---|---|
| First objective, as the attacker | turn 9.3 of 17 (the scripted general: 4.5) | turn 6 or earlier |
| Units lost per objective taken, as the attacker | 6.4 (the general: 3.5) | 5 or fewer |
| Objectives taken, as the attacker | 2.1 of 5 | 3 or more |
| Holding out against the general, as the defender | Poland 12 of 20 | no worse |
| Orders the core refused | 33 a game | none: it replans after every order |
| Wins against the classic AI, both sides | | more than half, on the suite as a whole, and no scenario worse beyond its noise |

Strength isn't the only aim (industry-research.md, "Fun, cheating and difficulty"): the AI has to
look like a general of the time. Each of these is a puzzle test on a hand-built map (Tests below)
before it counts as done: it concentrates on one sector, its artillery fires before the assault,
it garrisons the objectives in reach of the enemy, it withdraws a worn-down unit that holds
nothing, it doesn't send bombers alone into fighters or flak, it uses its reinforcements on the
turn they arrive, and it plays the last turns for the objectives still in reach. And it plays
honestly: it sees only what its side sees (#17).

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

### Deployment and reinforcements

- **Deployment** places the army for the commander's plan: the units of the main effort on the
  deployment hexes nearest its axis, artillery behind them and in range of the front, anti-aircraft
  beside what the enemy's aircraft can reach, the reserve back. The classic AI fills the hexes row by
  row (`buyAndDeploy`, src/core/ai.ts).
- **Reinforcements** join the plan on the turn they arrive: the AI plans after they are on the
  map, not before (#94, kept in the classic rules). A group that arrives together gets an operation
  of its own, often the one it was written into the scenario for (a counterattack on a flank, a
  relief), which the scenario hints can name.

### Defence

The classic AI defends only by holding its entrenchments and counterattacking an objective it has
lost (MECHANICS.md, "A cautious attacker, a weak defender"). The remastered one has three postures
for an objective it holds, which the commander picks from the threat map and the turn clock:

- **Hold**: a garrison on the objective, entrenched, with artillery and anti-aircraft in support
  range behind it. A garrison doesn't leave its hex to attack (#5).
- **Delay**: trade space for turns where the enemy is stronger: fall back hex by hex onto a
  second line, so the attacker runs out of turns before it reaches the objective.
- **Counterattack**: a reserve held out of the enemy's reach strikes when the expected losses
  favour it: an enemy unit worn down or out in the open, or an objective just lost. Not a unit at a
  time into a fortified line (#5, the Mława counterattack in playtests/2026-10-23-ostpreussen-germany.md).

A worn-down unit that holds nothing withdraws to a city or out of reach to reinforce (#6),
attacker or defender.

### Air

- **Air superiority first**: the fighters go after the enemy's fighters, and the bombers wait
  until those that can reach their target are gone or busy.
- **No bomber alone into the defence**: the staff scores an air strike with the support fire it
  will meet (the enemy's flak, air defence and fighters, MECHANICS.md "Support fire"); artillery
  and fighters clear them first, or the strike goes elsewhere (#259).
- **Range and fuel**: aircraft plan the way back to an airfield into every mission, and refuel
  before they run short, as the scripted general's do.
- Bombers serve the operations like the artillery does: they fire before the assault, on the
  hex the doctrine names.

### Supply

The analysis adds a supply map: the cities, airfields and ports where the side resupplies and
reinforces, and how far each unit is from one. The staff reads it:

- an operation's units have the fuel and ammunition for it, or resupply first, before they reach
  the enemy rather than in contact;
- mounted infantry and towed guns are kept off their transports when the enemy can reach them
  (#315);
- reinforcing a unit costs prestige that purchases also want: the staff weighs a worn-down
  veteran against a new unit.

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

## Time budget

A budget in nodes keeps the AI deterministic; the time it takes is checked against these:

- **A turn on a laptop**, in the Web Worker, on the suite's largest scenario: within 2 seconds of
  planning, the animations aside. The classic AI's planning time is measured in step 0 as the
  reference.
- **A whole game in the arena** within 10 seconds, so a run of the suite (step 0) fits in a few
  minutes, as `npm run arena` does today with the classic AI (a game in 1-2 seconds).
- The search (step 4) gets a node budget fixed per difficulty, chosen so the turn stays within
  the first bound; the arena reports the planning time per turn beside the other measures.

## Difficulty

The difficulty makes the AI play better, not richer (#16): the scenario's resources stay as the
scenario gives them (#15). Each level is a doctrine profile:

| Level | How it plays |
|---|---|
| Operational (easiest) | The rule-based commander without the turn clock's pressure, a few tactics of the doctrine, no tactical search: it attacks, but slowly and predictably |
| Tactical | The whole doctrine, the turn clock, a small search budget |
| Historical (hardest) | Everything, the full search budget, and the scenario's hints |

Today only campaigns have a difficulty (MECHANICS.md, "Difficulty"). A choice of the AI's level
for a single scenario is a settings question for later, not part of this design. The personality
(a daring or a cautious general) is separate from the level: it changes how the AI plays, not how
well.

## From the classic AI to the remastered one

The remastered AI grows inside the classic one, so every step plays a whole game and can be
measured:

- **One controller.** The remastered AI is a `Controller` (src/core/controller.ts) the remaster's
  rules choose (`rules.ai`, #53), and the arena can set either. It starts as a wrapper that passes
  every call to the classic `aiController` and plays exactly as it does: the arena shows the same
  numbers on the same seeds.
- **Each unit has one owner.** Once the new layers hold units, at each order they take the units
  their operations hold and the classic logic plans the rest. The classic AI plans its turn once,
  at its start, so the wrapper asks it again for the units left each time the new layers have no
  order (a plan on the world as it is, as the scripted general does). Nothing is ordered by both.
- **What goes over first**: the analysis (step 1, nothing changes in play), then the units the
  assault and garrison operations take (step 2), then the commander's choice of where (step 3).
  The purchases and the deployment stay the classic ones until their own modules replace them.
  When the classic logic has no units left to plan, the wrapper is gone.
- **Memory.** The operations live in the controller between its calls, not in the state
  (docs/STATE.md D6). A loaded game rebuilds them by planning again at the start of the turn it was
  saved on, as the classic AI does today (#71): a loaded game may play differently from one played
  through, never differently between two loads of the same save.
- **The classic rules don't change.** The classic AI, its order and its bugs stay as they are for
  `ARENA_RULES=classic`, the contracts and verify.

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

Each step is useful on its own, and each is an issue:

0. **The measuring stick** (#408): the arena's scenario suite, 40 seeds, confidence intervals,
   the planning time, a stronger scripted general, and the classic AI's baseline on all of it.
   Nothing in the game changes; without it a better AI can't be told from noise.
1. **Perception and analysis** (#409), with the debug overlay and the remastered controller as a
   wrapper of the classic one. Changes nothing in play; everything else stands on it.
2. **The staff, with the assault and garrison doctrines** (#410), the air and supply in the plan,
   called from the old logic. The biggest gain.
3. **The rule-based commander** (#411): the postures, the axis of attack, the turn clock, the
   reserve, the reinforcements, purchases and deployment for the plan.
4. **Tactical search** for the order of attacks (#412).
5. **The language-model commander** (#45).
6. **Tuning the weights and profiles** in the arena, the difficulty, and the switch to the
   remastered AI in the remaster's rules (#413).
