# A remastered AI, designed from scratch

A proposal: how the remaster's own computer opponent could be built if it were designed today,
next to the classic one rather than instead of it. foundations.md has the theory behind it,
how-it-plays.md and weak-attacker.md the AI it would sit beside. Built so far: the perception and the
analysis ("Built: perception and analysis" below), and the staff's first part: operations, one owner per unit, the
plan made again after every attack, the garrisons and the occupation of an emptied objective, the resupply before
contact and the rides out of reach ("Built: the staff"), and the assault doctrine ("Built: the assault doctrine").

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
in the arena (arena.md) on the scenario suite of step 0, 40 seeds a scenario and side, accepted on
seeds 1-40 after being tuned on 101-140. The targets are set from the 30 October baseline
(arena.md, #606) by one rule, for the AI on a side facing the general:

- The **main measure** is wins when the AI's win rate on that side is 10% to 90%. Otherwise it is,
  for the attacker (the side with more objectives to take at the start), the objectives taken and
  the units lost per objective; for the defender, the objectives held at the end and the units lost.
  (An attacker that hasn't taken every objective loses at the turn limit, #256, so the win rate says
  nothing in most scenarios.)
- The **target** is at least halfway from the classic AI's value to the general's, where the general
  is better, and no worse than the classic AI beyond the noise where the classic AI is better.
- The classic AI's value is the AI on that side against the general, the general's the general on
  that side against the AI (a different opponent, so a rough bar).

| Scenario | Side | Measure | Classic AI | General | Target |
|---|---|---|---|---|---|
| Ostpreussen | axis attacks | objectives taken | 0.9 | 2.0 | 1.5 or more |
| | | lost per objective | 12.2 | 2.2 | 7.2 or fewer |
| | allies defend | held at the end | 3.8 | 4.3 | 4.1 or more |
| | | units lost | 28.9 | 15.7 | 22.3 or fewer |
| Bzura | allies attack | objectives taken | 6.3 | 7.2 | 6.8 or more |
| | | lost per objective | 0.8 | 1.3 | no worse than 0.8 |
| | axis defend | held at the end | 5.3 | 4.1 | no worse than 5.3 |
| | | units lost | 13.4 | 8.1 | 10.8 or fewer |
| Indochina | axis attack | objectives taken | 0.1 | 0.8 | 0.5 or more |
| | | lost per objective | 102 | 7.4 | 55 or fewer (too noisy: 6 games) |
| | allies defend | held at the end | 3.7 | 3.0 | no worse than 3.7 |
| | | units lost | 14.5 | 4.3 | 9.4 or fewer |
| Zitadelle | axis attack | objectives taken | 1.0 | 1.5 | 1.3 or more |
| | | lost per objective | 48.9 | 19.1 | 34 or fewer |
| | allies defend | held at the end | 4.7 | 4.1 | no worse than 4.7 |
| | | units lost | 56.1 | 41.1 | 48.6 or fewer |
| Uman | axis attack | objectives taken | 1.1 | 4.2 | 2.7 or more |
| | | lost per objective | 16.4 | 1.6 | 9.0 or fewer |
| | allies defend | wins (of 40) | 10 | 39 | 25 or more |
| Battleaxe | allies attack | wins (of 40) | 27 | 0 | no worse than 27 |
| | axis defend | held at the end | 3.7 | 0.7 | no worse than 3.7 |
| | | units lost | 28.5 | 19.4 | 24.0 or fewer |
| Taman | allies attack | objectives taken | 0.1 | 1.4 | 0.8 or more |
| | | lost per objective | 539 | 9.0 | too noisy: 2 games; read the objectives taken |
| | axis defend | wins (of 40) | 21 | 40 | 31 or more |
| Luttich | allies attack | objectives taken | 0.2 | 3.4 | 1.8 or more |
| | | lost per objective | 241 | 12.2 | 127 or fewer (wide: 7 games) |
| | axis defend | held at the end | 2.8 | 3.9 | 3.4 or more |
| | | units lost | 34.0 | 18.4 | 26.2 or fewer |

"No worse beyond the noise" is read with `arena:compare`: the paired difference's interval must not
lie on the worse side of 0. The suite-wide targets stay:

- Wins against the classic AI, on both sides: more than half of the games on the suite as a whole,
  and no scenario worse beyond its noise.
- Orders the core refused: none (the classic AI: 17 to 98 a game, #606).
- Planning time within the time budget below: the classic AI plans a turn on Zitadelle in 15.6 ms
  (95th percentile 36 ms, worst 121 ms).

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

### Built: perception and analysis (#610)

In src/core/remastered/. The remaster's rules choose the remastered AI (`Ruleset.remasteredAI`,
`aiControllerFor`; the classic rules the classic `aiController`, with nothing computed). In each of its
turns' `plan` it perceives and analyses, without changing the world or drawing from any stream; its staff
reads them ("Built: the staff" below). The arena's player `remastered` plays it; `npm run -s play -- analysis`
prints a side's maps and the garrisons its staff would set (docs/CLI.md).

- **`perceive`** (perception.ts): the side's units, the enemies it sees now (`seesUnit`), and every enemy
  it knows of as a `Sighting` (where, what, its strength, the turn last seen, a confidence). Seen: 1; out of
  sight, halved each of the side's turns (`FADE`: it may have made a whole move since) and forgotten below
  0.1 (`FORGET_BELOW`, after three turns), or at once when its last hex is in sight without it or the
  side's attack destroyed it. The list is the next turn's memory, the controller's (docs/STATE.md D6): a
  loaded game starts with none. The maps read the enemy only through it (#17 by construction).
- **`analyse`** (analysis.ts, fields.ts), by hex index, once a turn; the terrain's costs and the distance
  fields cached while the ground and the objectives stay:

| Map | What |
|---|---|
| a unit's strike | the hexes it reaches next turn with a whole move, on the terrain's cost alone (units, zones of control and bridges aside; a hex that stops the move entered with any point left), and its gun's range beyond them. Artillery fires from where it stands; a unit riding its transport doesn't fire after a move |
| `influence` | `own` and `enemy`: each ground unit with an attack spreads its strength (an enemy's × its confidence) over its strike, falling off linearly with the distance to 1/(radius + 1) at the edge (aircraft and ships draw no front); `balance`, own less enemy |
| `front` | the hexes both sides reach where the balance is within 10% of their sum (`FRONT_BAND`) or changes sign to a neighbour |
| `sectors` | each objective to take with both sides' mean influence within 2 hexes (`SECTOR_RADIUS`), the weakest held first; weak at half the mean enemy influence over them or less (`WEAK_SHARE`) |
| `threat` | `ground` and `air`: the enemy strength that can strike a ground unit (a soft or hard attack) or an aircraft (an air attack) on the hex next turn |
| `distance` | per movement method of the side's units, the movement points to the nearest objective to take and to hold; a hex that stops the move counts 6 (`STOP_COST`, about a turn's march) |
| `supply` | `ground`, `air`, `sea`: the hexes to the nearest city, airfield and port of the side's, where it resupplies and reinforces in full (src/core/supply.ts) |
| `units` | per own unit, the threat on its hex, its distance to supply, its points to the objectives |

- **The debug overlay** (src/view/map/aidebug.ts and aidebugdraw.ts, #611): the page opened with `?aidebug` draws
  the maps over the map. V cycles the layers (influence, front, sectors, ground and air threat, the distance for
  the selected unit's movement method, supply, the enemies known with their confidence, off), X the side, the AI's
  by default. It reads the remastered AI's own knowledge when it plays the side (its memory: the host's
  `aiKnowledge`), else perceives and analyses the world without memory, once a world; the legend says which.
  It may show what the person's side doesn't see.

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

### Built: the staff (#616)

In src/core/remastered/staff.ts, called by the controller (controller.ts); the remaster's rules only, the classic
AI and its rules untouched (the contracts and verify play them).

- **Operations** (`Operation`): a kind, a target hex, the units held, a deadline turn and a reason, the design's
  explanation ("garrison 15,12: enemy 2 hexes away"). They are the controller's memory (docs/STATE.md D6), kept
  between its turns and reviewed at each order: one ends when its deadline passes, a unit of it is gone, or (a
  garrison) its objective is lost or no longer threatened. A loaded game starts with none and plans them again.
- **One owner per unit.** The units the operations hold are left out of the classic plan (`planTurn`'s `held`,
  src/core/ai.ts): no move, attack, resupply or reinforcement of theirs comes from it. The purchases and the
  deployment stay the classic ones.
- **Replanning.** The classic plan of the free units is made again on the world as it is after every attack (its
  result can't be foreseen), after every order of the staff's, and when its next command fails `check`; a command
  that fails on a plan just made is dropped. No order the core refuses is given. The first plan of a turn keeps its
  AI-stream draws in the world as the classic AI's does; the plans made again during the turn draw from where it left
  the stream (`next` returns no world), the same numbers each time. The staff draws nothing.
- **Garrison** (#5): an objective of the side's that a ground enemy the side knows of (seen or remembered, #17)
  can reach within two of its moves (hex distance, `GARRISON_TURNS`) gets one: the player's ground unit on it, else
  the best of its infantry, anti-tank, tanks and recon that can get there within two moves: strength, +3 for
  infantry and anti-tank, -3 a hex. It marches there first in the turn (in its transport when that goes nearer), never
  leaves the hex while the operation lasts (three turns, then weighed again), fires from it when the estimate
  (estimate.ts) gives more kills than losses and the support fire doesn't stop it, and is resupplied or reinforced
  there once the classic plan is done. A garrison destroyed or gone is replaced at the next order.
- **Occupy** (#312): after an attack of the side's, if the target's hex is an objective to take and now empty, the
  player's ground unit that reaches it this turn and can capture (infantry first, then the strongest) moves in before
  anything else, and is held to the turn's end.

The second part (#617), in rear.ts, ahead of the classic plan after the garrisons' marches: an unmount, a resupply.

- **Resupply before contact**: a unit with a third of its ammunition or fuel or less (half the fuel for aircraft)
  where no ground enemy reaches next turn (aircraft: no air threat) resupplies instead of advancing.
- **Rides out of reach** (#315): `planTurn`'s `ridesTo` keeps the classic plan's moves on a transport (a mount, or a
  unit already mounted) off the hexes a ground enemy the side knows of reaches next turn (its influence, analysis.ts;
  aircraft aside, they reach nearly everywhere), but for those within 2 hexes of an objective (`RIDE_TO_OBJECTIVE`:
  arriving in time decides it); the garrisons' rides too. A unit that starts its turn on its transport within reach
  gets off it first. Without `ridesTo` the classic plan rides as before.
- **Tried and left out** (#6, measured in arena.md): withdrawing a worn-down unit to reinforce saved units but lost
  objectives and games for a defender (Battleaxe, Luttich, Uman) and its attacks for an attacker, whatever spared the
  units near the objectives or on the front; finishing off a weak enemy first cost an attacker its wins (Luttich,
  Taman) and a defender its units. Both wait for the commander's postures (#411).

The staff draws nothing in either part. The planning and the measures: arena.md, "The remastered AI, the staff's
first part (#616)" and "the staff's second part (#617)".

### Built: the assault doctrine (#618)

In src/core/remastered/assault.ts, the staff's third part: the controller asks it for an order after the garrisons'
marches and the resupplies, before the classic plan.

- **Who assaults**: the side attacking (`attackerSide`, #256), or a side with more objectives to take than the enemy
  (a defender that lost some, #231).
- **One sector** (#233): an `assault` operation on the objective to take the side strikes best: each free ground
  unit's strength over 1 + the turns of its march there (on the distance fields, in its transport when that goes
  further), less the enemy's mean influence around it (`Sector`, `ENEMY_WEIGHT`). It holds no unit. It is kept until
  the objective is taken, its deadline passes (the turns left shared among the objectives left, `MIN_ASSAULT_TURNS`
  at least, #232), or it is hopeless: the enemy around it outweighs what the side brings while another sector doesn't.
  Then the staff weighs the sectors again.
- **The battle group**: the free ground units within two turns' march of the sector (`GROUP_TURNS`), and the guns
  that reach it from where they stand. The rest go to the sector too: the classic plan's objective pull is the
  sector's for a ground unit (`planTurn`'s `pullTo`, #258), but for one within three turns of another objective to
  take (`LOCAL_TURNS`), for all in the last third of the turns (`LATE_SHARE`), as the scripted general drops its
  sector then, and for the side defending (#256): its units hold the line while it retakes an objective. Aircraft and ships keep the classic plan (#619).
- **The order of arms**, one order at a time on the world as it is, each step only with units for it:
  1. a recon unit of the group moves where it sees most of the hexes within 4 of the sector it doesn't see yet, once a
     turn, never beside an enemy; its move is phased, the classic plan may move it again;
  2. the group's artillery fires on the enemy artillery and air defence that would cover the main target, then on the
     target, then on any enemy within 2 hexes of the sector (#234); a towed gun may take its step on foot first (the
     core lets a unit fire after a move on foot, moves.ts; only a ride uses its shot);
  3. the armour attacks the objective's defender, the main target: tanks, the anti-tank guns as the second line, then
     infantry and recon, each from the hex its estimate is best from;
  4. the occupation of the objective emptied is the staff's (#312): infantry first.

  Then the guns that couldn't fire on the sector move toward a hex in range of it for the next turn, out of the
  enemy's ground reach (on their trucks strictly), the least threatened and nearest the sector of those (#234).
- **No attack that loses more than it kills**: the estimate counts the support fire the attacker meets in its losses
  and gives no kills to an attack the support fire stops (estimate.ts, as the screen's preview). A strike is worth
  ordering when it kills at least 1 and loses no more than it kills (`MIN_KILLS`); in the last third of the turns
  (`LATE_SHARE`) an attack on an objective may cost more. The classic plan's attacks are held to the same rule.

The staff draws nothing here either; the classic rules don't call it. The measures: arena.md, "The remastered AI, the
assault doctrine (#618)".

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

- **Determinism.** It draws only from the AI's stream (`Rng.aiRandom`, src/core/random.ts, CLAUDE.md's
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
  planning, the animations aside. The classic AI's planning time on Zitadelle, measured in step 0
  (arena.md, #606): 15.6 ms a turn, 95th percentile 36 ms, worst 121 ms.
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
