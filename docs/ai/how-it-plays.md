# How the AI plays

The AI is a controller on the new core (docs/CORE.md, "The AI"): `aiController` in src/core/ai.ts,
scores in src/core/aiscore.ts, settings in `aiDefaultConfig` (src/prototypes.ts). It reproduces the
bundle's AI exactly, draw for draw on the AI's own random stream (src/rng.ts), apart from the bugs
fixed since (#74, #75, #77, #82, #100, #101, #207, #224, #21).

## The turn

The session (src/core/session.ts) calls the controller in Game's order:

1. **`startTurn`, buy and deploy** (`buyAndDeploy`): with the prestige over a reserve of 1000, 30%
   of it for aircraft (fighters, tactical bombers), the rest for ground units in a fixed rotation
   (infantry, infantry, artillery, anti-tank, tank, infantry, tank), units costing 120 to 900. A unit
   a transport carries gets a random one of its country's ground transports that carries it, is in
   service in the scenario's year and fits the budget left (#224), as a person buys it. Then
   it deploys the undeployed core units on the deployment hexes.
2. **`plan`, the whole turn at once** (`planTurn`), on the state at the turn's start. The
   reinforcements arrive after the plan (#94, kept).
3. **`next`, one order at a time** from the queue the plan built, played by the session as
   commands. The plan doesn't change during the turn: a unit ordered to a hex that has become
   taken is refused and stays.

## The plan

Units are planned one at a time. Artillery, fortifications, combat aircraft and warships go first
(`actsFirst`), the rest in unit-list order. For each unit, until it has nothing left to do:

1. **Reinforce** if its strength is under 4, or if it can neither move nor attack, while prestige
   is left after the turn's purchases (`reinforceUnit`, #21).
2. **Resupply** if ammo is under 2 or fuel under 5, or if it is idle (`resupplyUnit`).
3. **Move** to the best scored hex of its move range, if it beats staying (`moveUnit`,
   `bestMove`). Towed and foot units may mount their transport to go further (#82).
4. **Attack** the best scored target from where it stands or was ordered to (`attackUnit`,
   `bestTarget`).

Each planned move marks its hex taken and the hex it leaves freed, for units of its kind (ground
or air, #74, #207). Each planned attack adds its expected kills to the target, and a target
expected to die isn't attacked again.

## Scoring a hex

`cellScore` plus, for ground units, the objective score, plus the attacks possible from there:

| Part | Value |
|---|---|
| Taken by another planned unit of its kind | -5000 (never chosen) |
| Not seen by the enemy / not seen by its own side | -40 / +30 |
| Own deployment hex, not an objective | -100 |
| Can entrench deeper there | +50 |
| Better initiative terrain than where it stands | +20 |
| River or stream without a road | -70 |
| Close terrain: infantry / artillery, anti-tank, AA / others | +120 / +10 / -50 |
| An enemy flag | +50 |
| An objective it can occupy: infantry / tank / others / artillery | +600 / +350 / +300 / +50 |
| Each neighbour: friendly unit staying (artillery +100) / enemy or a friend leaving | +20 / +40 (artillery -100) |
| Each objective next to it: infantry / others, less when the side holds it | +100 or +70 / +70 or +50 |
| Objective pull: the nearest objective to take | 4000 / distance (4100 standing on it) |
| Attack potential: the scores of every attack possible from there | sum |

Air units score only the first three rows and a third of the objective pull. Staying scores the
same hex parts plus **+50 per entrenchment level**. Every score is multiplied by a random factor
from 0.8 to 1.2, drawn from the AI's stream.

## Scoring an attack

`targetScore` and `bestTarget`, from the combat estimate (the same as the player's preview):

- **score** = expected kills x the target class's kill value - expected losses x the attacker
  class's loss cost. Kill values: infantry 50, tank 25, recon 30, artillery 150, bombers 100,
  fighters 50, AT and AA 10, fortifications 5. Loss costs: infantry and tanks 5, recon and AT 10,
  artillery 20, bombers 30.
- **+100** for a target already attacked this turn, **+350** for a target on an objective, x0.3
  for a target on a hex its side doesn't see.
- **Skipped** if the expected losses reach its strength or its strength is under 2.5 x the
  expected losses, or if the target is already expected to die.
- **Attacked** only if the score beats -4 x the attacker's loss cost (-20 for infantry and tanks,
  -80 for artillery); the bar is 50 lower for a unit standing on an objective.

## What it doesn't do

- Look at the turn limit or the victory turns (#232).
- Pick a target for the turn and attack it in order, artillery then air then assault (#233).
- Move artillery to support the next attack (#234).
- Distinguish attacking from defending: the entrenchment bonus applies to both (#235).
- Withdraw damaged units, or seek out weak valuable ones (#6).
- Garrison its own objectives before the player takes them (#5).
- Think about the player's next turn.
