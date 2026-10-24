# Attack preview: a UX study

The moment a player holds a selected unit over an enemy is the most repeated real decision in the game. A turn has 10 to 40 units, most of them attack, and the order of attacks matters (every hit lowers the next attacker's odds). This study defines what that moment is for, what it must show, what the engine can and can't promise, and how the information is staged so a veteran isn't slowed down and a new player isn't left guessing. The components that carry it out are `AttackPreview` (the stages), `CombatOdds` (the card) and `CombatResults` (the aftermath).

## 1. The jobs of the moment

In order of how often the player needs them:

1. **Can this unit attack that one?** Range, ammo, already fired, target type (a tank can't hit an aircraft), spotted.
2. **Is it worth it?** What each side will lose, in one look.
3. **Is there a trap?** The rules that turn a fight upside down: rugged defense, support fire from guns the player may not have noticed, no return fire, a sure overrun.
4. **What happens after?** Destroyed, retreats, surrenders, entrenchment and defence knocked down for the next attacker.
5. **Why?** Which modifiers decide it, so the player learns the game instead of memorising outcomes.
6. **Commit or back out,** without a misclick costing a unit.

Jobs 1 and 2 happen dozens of times a turn and must cost nothing. Job 5 matters once per situation and can cost a moment.

## 2. Who is looking

| Player | Wants | Hurts them |
| --- | --- | --- |
| PG2 veteran, playing fast | the two numbers at a glance, instantly | any delay, a card covering the map |
| New player | why the numbers are what they are | numbers without labels, surprises after the click |
| Planner (end of a long turn) | to compare several targets for one unit | having to re-open details for each target |
| Touch player (tablet) | the same as the others without hover | an attack on the first tap, numbers drawn on every hex at once |

## 3. Today's cursor

`generateAttackCursor` (`src/render.ts`) draws a 54×54 image and sets it as the mouse cursor over an attackable hex: a crosshair, the attacker's flag top left, the target's flag top right, and two 8px yellow numbers: the attacker's estimated losses under its flag, the target's under its. On touch screens the same image is drawn on every attackable hex.

What it does well: it is instant, it sits where the eye already is, and it has the PG2 feel players remember.

What it fails:

- **No labels.** "6" and "1" with two flags: the player has to know that the left number is their own loss.
- **No context.** Strength before and after isn't shown: losing 3 of 10 and 3 of 4 look the same.
- **No traps.** Rugged defense, overrun and support fire are known before the attack (section 5) and never shown. A rugged defense reads as a bad roll.
- **Wrong numbers.** An overrun shows a loss the attacker will never take (no return fire in an overrun). The target's number includes hits on support units (#87). Every number reads up to half a point high (#90).
- **False certainty.** A single number where the dice give a spread: a "1" that is a 0 six times in ten.
- **Touch clutter.** On a tablet every target gets its own cursor image at once.

## 4. What the engine can promise

The preview may only claim what the engine knows. Three kinds of fact:

| Certain before the attack | Estimated (the dice decide) | Unknown |
| --- | --- | --- |
| rugged defense (`isRuggedDefense` is a formula) | losses on both sides | hidden support units (they will fire, the preview can't know them) |
| overrun (decided by the estimate, then forced) | whether the defender retreats (from the losses) | an ambush on a move (no preview exists) |
| no return fire (`defcanfire`: range, ammo, target type) | experience gained | |
| which visible guns give support fire (`getSupportFireUnits`) | | |
| the modifiers: terrain, entrenchment, initiative, close combat, hits taken | | |

How wide the estimate is, measured with the engine's own dice (2000 rolls each):

| Attack | Estimate today | Dice: most common | Dice: 8 in 10 rolls |
| --- | --- | --- | --- |
| Infanterie on 38 Piechota in a forest, kills | 6 | 5 | 4–7 |
| same, losses | 4 | 3 | 2–5 |
| Pz IIA on entrenched infantry (rugged), losses | 5 | 5 | 3–6 |
| same, kills | 1 | 0 (60%) | 0–1 |
| 10.5 leFH18 on a 7TP from range, kills | 1 | 0 (61%) | 0–1 |

Each strength point rolls on its own, so losses follow a binomial: `strength` rolls with the hit chance `clamp(kF + 21 − threshold, 1, 19) / 20`. The preview can compute the range from the same two inputs the estimate uses; the engine only has to expose the hit chance (or kF) next to the estimate.

**Rule:** say certain things as certain ("Rugged defense"), estimated things as estimates ("about 5", "3–6"), and say nothing about the unknown.

## 5. What to show, ranked

| Rank | Information | Why at this rank |
| --- | --- | --- |
| P0 | this hex can be attacked; this one can't, and why | job 1, needed before any thought |
| P1 | each side's loss, as strength before → after | job 2, the core trade |
| P2 | one verdict word, or the one trap that decides it | job 3; a trap outranks a good trade |
| P3 | what happens after: destroyed, retreat, surrender, no return fire, overrun's +1 move | job 4 |
| P4 | the reasons, ranked, with their effect | job 5 |
| P5 | the full arithmetic: attack and defence values, kF, hit chance per point, the spread | for testers, theory-crafters, bug reports |

## 6. The ladder

Four stages. Each answers more, costs more attention and takes more room; each is a strict superset of the one before, so a player can stop at any rung.

| Stage | When | Shows | Budget |
| --- | --- | --- | --- |
| **0 · Targets** | as soon as a unit is selected | which hexes can be attacked: dashed red outline and a small crosshair badge (`MapOverlays`); a hex in range that can't be attacked gets a grey badge with the reason on hover (no ammo, can't hit aircraft, already fired) | no numbers, no text |
| **1 · Glance** | hover a target, at once (0 ms) | the cursor becomes a brass crosshair with two loss chips beside it: yours in your side colour, theirs in theirs (`−1` `−3`); one glyph if a certain trap or bonus applies: rugged defense, overrun, no return fire, support fire; `0–1` instead of `1` when nothing is the most likely result | 2 numbers + at most 1 glyph |
| **2 · Card** | the pointer rests 400 ms, or Shift is held, or one tap on touch | `CombatOdds`: both strengths before → after, the verdict, up to 4 reasons, what happens next, advice for a bad fight | one card, beside the target, never over the attacker or the target |
| **3 · Breakdown** | "Why?" on the card, or Alt, or a long press on the card | both directions as a table: attack value and each modifier, defence value and each modifier, kF, hit chance per point, and the spread as a small bar chart (most common result, 8-in-10 range) | a larger card; it's a reference, read once |

The ladder is the same for a ranged attack, an air attack and a naval one; only the reasons change.

Stage 1 is what replaces today's cursor: the same instant numbers in the same place, but with side colours that say whose loss is whose, the trap glyph, and honest zeros.

## 7. Inputs

| | Mouse and keyboard | Touch |
| --- | --- | --- |
| Stage 0 | select a unit | tap a unit |
| Stage 1 | hover a target | (none: touch has no hover; stage 2 on the first tap) |
| Stage 2 | rest 400 ms | tap a target once |
| Stage 3 | Alt, or "Why?" on the card | long-press the card, or "Why?" |
| Attack | click the target | tap the same target again while its card is open |
| Cancel | move off the target, Esc, right-click | tap anywhere else; the card closes |

A setting, **Combat preview: Glance / Card / Detailed**, chooses the stage that opens on hover (1, 2 or 3). Glance is the default for desktop, Card for touch. Veterans who want the old speed lose nothing: stage 1 is as fast as today's cursor.

Comparing targets: the player moves the pointer from target to target; each shows its glance at once.

## 8. Writing the numbers

- Losses always as strength before → after (`10 → 6`), never a bare loss.
- An estimate that is most likely 0: "0–1", never "1".
- The range only on the card and below ("about 5 · 3–6"); the glance shows one number.
- Certain outcomes in plain words, no hedging: "Rugged defense", "Overrun", "No return fire".
- Uncertain outcomes say so: "likely retreats".
- Support fire is counted in your losses and named: "5 + 1 support".

## 9. Placement and motion

- The card opens beside the target, on the side away from the attacker; it flips at the screen edges and never covers the attacker, the target or the support fire arcs.
- Stages appear without animation; the card does not slide or fade in, so moving the pointer across targets doesn't flicker.
- Stage 1's chips sit to the lower right of the cursor's hotspot at a fixed offset, so the eye learns where to look.

## 10. Edge cases

| Case | What the preview does |
| --- | --- |
| no ammo, or already fired | stage 0 shows a grey badge; hover says why; no attack |
| target type it can't attack (tank on an aircraft, anything but destroyers and tactical bombers on a submarine) | grey badge: "can't attack aircraft" |
| a mounted unit that moved this turn | grey badge: "moved in its transport: can't fire" |
| hidden enemy guns in range | nothing: the preview can't know them; the turn report says what fired |
| a hex with an aircraft over a ground unit | the air layer toggle decides the target; the card names it |
| artillery or a ranged attack | verb "Bombard"; "No return fire" is certain; the card notes that hits take entrenchment |
| an overrun | the attacker's loss is shown as none, since an overrun takes no return fire |
| the AI's turn | no preview; `CombatResults` and the turn report tell what happened |

## 11. How to know it works

Run with five to eight players across the three settings, on the same saved turn.

- **Tasks:** pick the best target for this tank among three; find which attack is a trap; attack a target on a tablet without a misclick.
- **Measure:** time to decision per attack; attacks made into a rugged defense; misreads of whose loss is whose (ask after each attack); accidental attacks on touch; how often stage 3 is opened, and by whom.
- **Pass:** stage 1 no slower than today's cursor for veterans; no misread of the loss chips; rugged defense attacks drop clearly for new players; zero accidental attacks on touch.

## 12. Decisions and open questions

Decided here: the four stages, the default per device, the honest zero, support fire named inside the losses, a certain trap outranking a good trade.

Open:

- Whether stage 1 shows the most common result or the rounded mean. This needs #90 fixed first.
- Whether to warn about hidden guns at all ("artillery may be hiding in range"). It would be a guess the engine can't back.
- A view comparing all targets of a unit is out of scope for now: it would be a new feature, not a clearer view of what the game already does.
