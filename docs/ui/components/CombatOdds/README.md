**Left out of the port (#441):** the game doesn't open this card until after the switch (D8). Over a target, the cursor shows the old UI's two losses only (AttackPreview, stage 1). The card below is the design for when it comes back, one addition at a time.

The combat odds preview: before an attack, what each side will lose, the one word that sums it up, why, and what happens next. Hover an enemy hex with a unit selected, or tap it once on touch; a second tap or a click attacks.

Everything on the card comes from the engine's estimate, `GameRules.calculateCombatResults(attacker, defender, units, false, true)`, which uses no dice. The four examples are that estimate for these exact units, run in the game (Ciechanów, Polish 1939 equipment).

**Parts, top to bottom** (`.pm-odds.v2` in `#gameToolTip`, 300px):

- **Head:** the verb (Attack, or Bombard for a ranged attack), the target and its flag. Under it, `.where`: terrain, distance or range, entrenchment and experience of the target.
- **Bars:** both sides' strength as 10 segments in the side colour, typed `10 → 4`. Losses are dashed in `critical`. Losses caused by support fire are hatched (`.sup`), so the player sees how much of the cost is the guns behind the target.
- **Verdict:** one word with an icon. `good` (`ok`): Overrun, Favourable, No return fire. `warn` (`low`): Costly win, Even. `bad` (`critical`): Unfavourable, Rugged defense.
- **Why** (`.why`): the one to four modifiers that decide it, each with its effect typed on the right (`+8 def`, `+1 atk`, `−1`). A rule that changes the whole fight is a `.key` line in `critical` instead. Pick them in this order: rugged defense, support fire, close combat, entrenchment (doubled for infantry in close terrain against tanks), city, river, initiative, experience, hits taken this turn.
- **Next** (`.next`): what follows, as tags: Destroyed, Retreats one hex, Surrenders (no free hex behind), No return fire, +1 move and Can attack again (overrun), Entrenchment 2 → 1, −2 defence for the next attack this turn.
- **Advice** (`.advice`): only for a fight the player shouldn't take as it is, one sentence on what to do first.
- **Commit:** the input that attacks and the one that cancels.

**Engine facts the card relies on** (see "What the map has to show" in the README):

- Rugged defense is a formula (`isRuggedDefense`), not a roll: the card can say it for certain.
- Overrun is decided by the estimate: when `isOverrun` is true there is no return fire, so the attacker's bar shows no loss even if the estimate's `losses` is 1.
- `kills` mixes hits on adjacent support units with the target's losses (#87): take the target's losses from the main attack and the support units' separately.
- Retreat and surrender aren't in the estimate: compute them with `isLossOverRetreatThreshold` on the estimated losses and `getRetreatPosition`.
- The estimate only counts support units the attacker's side can see. Hidden guns still fire: the card can't warn about them, and shouldn't pretend to.

Replaces the attack cursor (`generateAttackCursor`) and the touch-screen numbers drawn on attack hexes. The targeted hex keeps its dashed `hex-target` outline and the support fire arcs from `MapOverlays`.
