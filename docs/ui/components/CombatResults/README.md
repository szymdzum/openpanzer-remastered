What the player sees right after a combat: each unit's losses over its hex, one stamp for what happened, and the same news as a typed line in the status bar. It replaces the bouncing `textBounceRed` / `textBounceGreen` labels of `uiShowAlert` (`ui.ts`).

- **Loss chip** (`.pm-hit`): the strength lost, typed, starting right of the unit's strength plate so the sprite and the plate stay visible. `−6` on `critical`; `0` on paper (`.none`) when a unit took nothing. A short note in small caps when it explains the number: "1 by support", "entrenched 2 → 1".
- **Event stamp** (`.pm-event`): one per combat at most, rotated −3° like a rubber stamp, the colour of its meaning:
  - `good`: Overrun +1 move
  - `bad`: Rugged defense, Destroyed, Surrendered, Attack stopped
  - `warn`: Retreat, Surprised
  - `brass`: New leader, Captured +150 (objective), Captured +50 (town)
  Put it above the unit it concerns: Overrun and Surprised on the attacker; Rugged defense, Retreat and Destroyed on the defender (Retreat on the hex it fell back to, with a dashed line from where it stood).
- **Status bar line**: the same event as a sentence, unit name in bold: "Pz IIA hit a rugged defense at the city · −6, 75mm A wz.97 −1 of it". It stays until the next action, and the turn report keeps it.

**Timing:** chips and stamp appear when the combat animation ends and stay 2.5 s (1 s with quick animations), then fade over 300 ms. Nothing moves. Under `prefers-reduced-motion` they appear and disappear without the fade.

**Where each event comes from** (today's `uiShowAlert` calls in `ui.ts`): Surprised (move end), Captured (move end, `captureHex`, +50 or +150), Overrun and Rugged defense (`calculateAttackResults`: `isOverrun`, `isRugged`), losses for both sides, Attack stopped (support fire losses over the retreat line), New leader (`atkLeaderGain`, `defLeaderGain`), Retreat and Surrender (`getRetreatPosition`). Destroyed is new: today a destroyed unit only gets an explosion.

The four examples are the engine's results for the same four attacks as `CombatOdds`.
