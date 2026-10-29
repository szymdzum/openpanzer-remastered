**Proposal (2026-10-29), built (#37): the hidden line and the open card.** The owner asked for the card in two sizes, hidden and open, saying what matters about the unit and what each number does. The game still has the port's card (#441): three sizes, the old window's content and nothing more. Where this card goes further than the old window, it says so below.

Everything about the selected unit, docked at the bottom in the middle. Every number says what it does for the player: not "Ammo 1/8" alone but "1 shot left". The map stays quiet (#441): the card opens hidden, as one line, and the open card only on More.

**Every phrase comes from the core, never from an estimate in the UI.** Each phrase the card computes reads one core function, with its unit test. Where the function doesn't exist yet, the phrase waits for it: no approximation in the view.

| Phrase | Means | Function | Exists |
|---|---|---|---|
| "6 moves left" | the hexes it can still move this turn, fuel and leaders counted; none once it has moved | `movesLeftThisTurn`, src/core/movement.ts (on `unitMoveRange`) | yes |
| "3 full moves" | its fuel (the transport's when riding) over a whole turn's points and the leaders' hexes, rounded down; `null`, no count, for legs, towed guns, horse-drawn transports, aircraft (fuel alone) and a unit on a carrier | `fullMoves`, src/core/movement.ts | yes |
| "1 shot left" | the rounds left: every shot uses one, return and support fire too | `fire`, src/core/fight.ts; `ammoOf`, src/core/world.ts | yes |
| "Can fire", "Can't fire" | it has its shot: not fired (a move riding uses it too), uses ammo and has some; the map's marker says the same (#436). Whether a target is in range is another question, not the card's | `canFireThisTurn`, src/core/attack.ts | yes |
| "+4 defence" and its tooltip | the level, whether it holds, whether street fighters cancel it here, whether it counts twice | `entrenchmentFacts`, src/core/combat.ts (`entrenchmentAgainst` for one attacker) | yes |
| entrenchment segments | the hex's limit, the terrain's base + 5; the base drawn lighter | `entrenchLimit`, `entrenchBase`, src/core/turn.ts | yes |
| "+1 veteran" | one per 100 XP, added to attack and defence in every fight | `experienceBonus`, src/core/combat.ts | yes |
| Resupply stamp | ammo or fuel critical, and it can resupply here now | `canResupply`, src/core/supply.ts | yes |
| riding band | the transport, its fuel; "can't fire the turn it rides" (`isRiding`, used by `burn`); "attacked, it gets off and fights on foot" (`dismounts`); for a unit that doesn't get off (a towed gun riding), in `critical`, "attacked or ambushed, it defends 2" (`defendsWith`: that equipment's ground defence; mounted infantry's surprise is cleared in its own move, so its band never says it) | `riding`, src/core/combat.ts; `isRiding`, src/core/world.ts | yes |
| the weak defence in `critical` | the lowest of ground, air and close defence, when it is at most half the highest of the three | `weakDefences`, src/core/equipment.ts | yes |
| Initiative's tooltip | the side with more, the attacker on a tie, gets +4 defence and its lead in attack, up to +4 | `initiativeEdge`, src/core/combat.ts | yes |
| From range's tooltip | all of the modifier further than the next hex and within its own gun range, half next to it or from beyond its range (so half always for a unit that fires only at its neighbours); ground units only, not in close combat | `rangeDefence`, src/core/combat.ts | yes |
| Close assault's tooltip | infantry attacking it in a city, forest, mountain or fortification hex, or a fortification anywhere | `isCloseCombat`, src/core/combat.ts | yes |
| "attacking, it adds to its defence too" (entrenchment) | its own entrenchment counts for its defence when it attacks, not in close combat | `entrenchmentAttacking`, src/core/combat.ts | yes |
| Aircraft "can't" | only a unit with an air attack fires on aircraft | `firesOnAircraft`, src/core/attack.ts | yes |

**Hidden, the default: one line.** The sprite (with its transport's when riding), nation mark, name, stars and ordinal; the four gauges, each with its label and, in the label, what it means; what the unit can still do this turn, as compact chips (an icon and a number, the words in their tooltip and for screen readers: the gauges already say the rest); More and Next unit. Every icon has its tooltip and a name for screen readers ("6 moves left", "Can fire", "More", "Next unit"). It replaces the strip that had only the name and three numbers.

**Open, on More: the one other size.** The unfolded band is gone: what it had that matters moved here, the rest went. Less, Esc or a click on the map folds it back to the line. It never opens by itself: it takes about 40% of the map's height.

- **Identity:** sprite, nation mark, name, ordinal, class and country; its target type, movement and Core in one line ("Hard target · Tracked · Core"); the stars with the XP and a bar to the next star; the leader with what it gives in a line. No prose about its role: the numbers below say it.
- **Condition:** strength, fuel, ammo and entrenchment as gauges, each with its value and its meaning. A `pm-stamp` ("Resupply") when ammo or fuel is critical.
- **This turn:** chips for what it can still do, in `ok`, and what it can't, dashed and muted.
- **Against the enemy:** what it hits and what it holds against each kind of enemy, with a bar on the 0–15 scale, then initiative, gun range and spotting, and the bonuses in force (veteran, entrenched). Its value in prestige in the corner, labelled "Value".
- **Buttons:** Less and Next unit, small icons in a column (Next only on the side's own units).

**What each gauge says** (the game's rules, docs/MECHANICS.md):

- **Strength:** ten segments, one per strength point; in `ok`, `low` (6 or less) or `critical` (3 or less). Every point fires on its own. Over strength (11 to 15, one per 100 XP) the segments past ten are drawn in `accent-ink`. No words beside it: the segments and the number say what it lost.
- **Fuel:** a bar, and the full moves it is enough for (`fullMoves`). A unit that uses none shows "–"; a unit with a transport shows the transport's fuel. Aircraft show the fuel alone, "18/50", with no moves: they have to get back to an airfield, which a count of moves would hide.
- **Ammo:** one segment per round, and the number with no words beside it: every shot uses one round, return and support fire too (`fire`, src/core/fight.ts).
- **Entrenchment:** one segment per level, as many as the hex allows: the terrain's base + 5: 5 in the open, 6 on a hill or port, 7 in a forest, bocage, mountain or rough ground, 8 in a city, 9 in a fortification. The terrain's own levels (it gets them at once) are drawn lighter than those it dug. Moving loses all of it, every hit one level. "Entrenched" in the strip and the card alike.

**Against the enemy.** The game splits targets by armour, not weight: every unit is a soft (unarmoured), hard (armoured), air or naval target. Soft: all infantry, most towed guns, trucks and wagons, most bunkers. Hard: every tank, armoured cars, halftracks, self-propelled guns. A light tank is hard; a heavy towed gun isn't.

- **It hits:** Soft, Hard, Aircraft, Ships: the soft, hard, air and naval attack, the game's own words as the equipment window and the odds card say them. What soft and hard mean is said once, in their tooltip. Renaming them Unarmoured and Armoured is for the whole UI at once, or not at all. An attack of 0 against aircraft is "can't": only a unit with an air attack fires on aircraft.
- **It holds:** Ground fire (ground defence), Air attack (air defence), Close assault (close defence: infantry attacking it in a city, forest, mountain or fortification), From range (the range defence modifier, added in full at range, half adjacent). The weak one is in `critical` by the rule in the table: the lowest of the three, at most half the highest.
- **Initiative:** just "Initiative 7"; its tooltip says the side with more gets +4 defence and up to +4 attack.

**Riding.** A unit on its transport shows its own values, the ones it fights with: mounted infantry attacked gets off and fights on foot (src/core/combat.ts). A band over the card says what riding does: the transport's moves and fuel, no fire the turn it rides, and, for a unit that can't get off, the transport's ground defence. A towed gun riding defends with the transport's values: its band says so in `critical`. The old window's Unit / Transport / Carrier views are gone; the carrier gets the same band.

**Beyond the old window:** the meanings of the gauges, the This turn chips, the XP bar to the next star, the riding band and the Resupply stamp. All of it is the core's data (the unit's flags, its equipment, its transport's), no new rule.

- Keep `#unit-info`, `#uName` and `#uSmallFlag`. The stars, the leader tooltip and the icons as before.

The view model would be `src/view/unitcard.ts` (`unitCardOf`), the card `src/view/infopanel.tsx` with `src/view/unitinfo.css`; the card reads the unit by its id, never a copy (#404).
