The short turn report: `#combatLog` before it is extended (`toggleCombatLog(true, false)`). It replaces the blue header from `buildTurnInfo` and the "Show Turn Summary" button. It holds only what the game computes there today, laid out to be read in a second.

- **Header:** the date and scenario in a label, "Turn 4 of 17" as the title. Briefing (the scenario description, today's "g" button), Dossier in a campaign only (today's "@" button), and close.
- **Objectives:** `sidesVictoryHexes[side].length`, the hexes still to take.
- **Turns to win:** the turns left to each outcome, `victoryTurns[i] − (turn − 1)`, skipping those already gone, as the code does. The best one leads in bold. Below it, a track of the whole scenario: turns played in the side colour, a mark for now, and a tick for each deadline (B, V, T). A passed deadline turns grey and is struck through.
- **Last turn:** when the last open outcome has one turn left, the cell gets a `critical` edge and says it plainly: "Take them this turn for Tactical victory".
- **Prestige:** the amount and `prestigePerTurn[turn + 1]` as "+5 next".
- **Ground:** the ground condition only, since it is what changes movement. Weather stays in the status bar.
- **Enemy turn:** counts taken from `CombatLog.log` for the spotting side: units attacked, strength lost, resupplied, objectives lost. "All quiet on this front" when there is nothing. Turn report opens the full `CombatLog` window.

720px wide, the width of the status bar, directly under it. On tablet portrait it spans the screen width less `space-3` on each side.
