**Proposal (2026-10-29), not built.** The owner asked for the card in two sizes, hidden and open, saying what matters about the unit and what each number does. The game still has the port's card (#441): three sizes, the old window's content and nothing more. Where this card goes further than the old window, it says so below.

Everything about the selected unit, docked at the bottom in the middle. Every number says what it does for the player: not "Ammo 1/8" alone but "1 shot left". The map stays quiet (#441): the card opens hidden, as one line, and the open card only on More.

**Every phrase comes from the core, never from an estimate in the UI.** Each one the card computes is a core function with its unit test, built before the card uses it:

| Phrase | Is | Core |
|---|---|---|
| "3 full moves" | fuel ÷ (move points + the leaders' moves), rounded down: a move burns as much fuel as the points it uses | a new `fullMoves(w, u)` beside `movesLeft`, src/core/world.ts; the transport's when riding |
| "1 shot left" | the ammo: every shot uses one round, return and support fire too | `fire`, src/core/fight.ts |
| "+4 defence" | the entrenchment level, added 1:1 to the defence | the "entrenchment" step, src/core/combat.ts (not against infiltration tactics; twice for infantry in close terrain attacked by vehicles: the attack preview shows the fight's own) |
| entrenchment segments | the hex's limit: the terrain's base + 5; the base drawn lighter | `entrench`, src/core/turn.ts |
| "6 moves left", "Can fire", "Moved", "Can't fire" | the unit's moves left and whether it may still fire | `movesLeft`; a new `canFireNow(w, u)` from `hasFired`, the ammo and riding (src/core/units.ts) |
| the weak defence in `critical` | close defence under half the ground defence | a pure rule on the equipment, tested |

**Hidden, the default: one line.** The sprite (with its transport's when riding), nation mark, name, stars and ordinal; the four gauges, each with its label and, in the label, what it means; what the unit can still do this turn, as compact chips (an icon and a number, the words in their tooltip and for screen readers: the gauges already say the rest); More and Next unit. It replaces the strip that had only the name and three numbers.

**Open, on More: the one other size.** The unfolded band is gone: what it had that matters moved here, the rest went. Less, or Esc, folds it back to the line.

- **Identity:** sprite, nation mark, name, ordinal, class and country; its target type, movement and Core in one line ("Hard target · Tracked · Core"); the stars with the XP and a bar to the next star; the leader with what it gives in a line. No prose about its role: the numbers below say it.
- **Condition:** strength, fuel, ammo and entrenchment as gauges, each with its value and its meaning. A `pm-stamp` ("Resupply") when ammo or fuel is critical.
- **This turn:** chips for what it can still do, in `ok`, and what it can't, dashed and muted.
- **Against the enemy:** what it hits and what it holds against each kind of enemy, with a bar on the 0–15 scale, then initiative, gun range and spotting, and the bonuses in force (veteran, entrenched). The unit's value in prestige in the corner.
- **Buttons:** Less and Next unit, small icons in a column (Next only on the side's own units).

**What each gauge says** (the game's rules, docs/MECHANICS.md):

- **Strength:** ten segments, one per strength point; in `ok`, `low` (6 or less) or `critical` (3 or less). Every point fires on its own.
- **Fuel:** a bar, and the full moves it is enough for: fuel ÷ move points, rounded down. A full move never costs more fuel than its points (#70, #214), so the count is a floor. A unit that uses none shows "–"; a unit with a transport shows the transport's fuel.
- **Ammo:** one segment per round, and "N shots left": every shot uses one round, return and support fire too (`fire`, src/core/fight.ts).
- **Entrenchment:** one segment per level, as many as the hex allows: the terrain's base + 5 (`entrench`, src/core/turn.ts): 5 in the open, 6 on a hill or port, 7 in a forest, bocage, mountain or rough ground, 8 in a city, 9 in a fortification. The terrain's own levels (it gets them at once) are drawn lighter than those it dug. It adds its level to the defence; moving loses all of it, every hit one level. The strip says "Entrenched", the card "Entrench." with "Entrenchment" in its tooltip.

**Against the enemy.** The game splits targets by armour, not weight: every unit is a soft (unarmoured), hard (armoured), air or naval target. Soft: all infantry, most towed guns, trucks and wagons, most bunkers. Hard: every tank, armoured cars, halftracks, self-propelled guns. A light tank is hard; a heavy towed gun isn't.

- **It hits:** Soft, Hard, Aircraft, Ships: the soft, hard, air and naval attack, the game's own words as the equipment window and the odds card say them, each with "unarmoured" or "armoured" beside it. Renaming them Unarmoured and Armoured is for the whole UI at once, or not at all. An attack of 0 against aircraft is "can't": only a unit with an air attack fires on aircraft.
- **It holds:** Ground fire (ground defence), Air attack (air defence), Close assault (close defence: infantry attacking it in a city, forest, mountain or fortification), From range (the range defence modifier, added in full at range, half adjacent). The weakest, when under half the ground defence, is in `critical`.
- **Initiative:** just "Initiative 7"; its tooltip says the side with more gets +4 defence and up to +4 attack.

**Riding.** A unit on its transport shows its own values, the ones it fights with: mounted infantry attacked gets off and fights on foot (src/core/combat.ts). A band over the card says what riding does: the transport's moves and fuel, no fire the turn it rides, and the transport's ground defence if it was ambushed. A towed gun riding defends with the transport's values: its band says so in `critical`. The old window's Unit / Transport / Carrier views are gone; the carrier gets the same band.

**Beyond the old window:** the meanings of the gauges, the This turn chips, the XP bar to the next star, the riding band and the Resupply stamp. All of it is the core's data (the unit's flags, its equipment, its transport's), no new rule.

- Keep `#unit-info`, `#uName` and `#uSmallFlag`. The stars, the leader tooltip and the icons as before.

The view model would be `src/view/unitcard.ts` (`unitCardOf`), the card `src/view/infopanel.tsx` with `src/view/unitinfo.css`; the card reads the unit by its id, never a copy (#404).
