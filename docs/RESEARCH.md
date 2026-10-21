# Game design research

What Panzer General 2 is, why it worked, what its players love and hate, and what other WW2
turn-based games teach. The base for deciding which mechanics to change and which to leave
alone. How the remaster plays today is in [MECHANICS.md](MECHANICS.md).

Research from October 2026. Some primary sources (GOG, Rock Paper Shotgun, Wargamer) were not
reachable, so a few quotes are second-hand. Opinions are marked as such.

## Panzer General 2

- SSI, October 1997, made by SSI's Special Projects Group. The sequel to Panzer General (1994),
  SSI's best-selling game ever and, according to Retro Gamer, "the greatest-selling true wargame
  of all time". PG1 started as a take on Sega's *Advanced Daisenryaku*.
- The first 100,000 copies sold out in about a week. CGW gave it 5/5 ("a clinic in how to
  properly develop a sequel"), PC Gamer US gave it 93% and Best Wargame 1997, and PC Gamer put
  it at #15 among the best games ever in 1998 ("the perfect introduction to wargaming").
- New in PG2: painted maps, campaigns for four nations, multiplayer, defensive artillery fire,
  leaders.

Sources: [Wikipedia PG2](https://en.wikipedia.org/wiki/Panzer_General_II),
[Wikipedia PG](https://en.wikipedia.org/wiki/Panzer_General),
[filfre.net](https://www.filfre.net/2020/11/06/)

### Why it worked

Wargames before it were complex and intimidating. PG was a deliberately light "beer and
pretzels" wargame. SSI marketing: "It took all the ugly stuff out of playing a military strategy
game and left the fun and the gameplay." Jimmy Maher (filfre.net) credits three things:

1. Units grow like RPG characters and carry over between scenarios, so players get attached.
2. A branching campaign, borrowed from Wing Commander.
3. It shows only the exciting parts of war: no logistics, no chain of command.

### The spirit: what not to break

What players and reviewers keep coming back to (opinion):

1. **Attachment to core units.** The most cited hook. The veteran Tiger unit from Poland still
   fights at Berlin, and losing it hurts.
2. **The campaign as a story**, from 1939 to Moscow, London or Washington, with alternate history
   as the reward for playing well.
3. **Scenarios as puzzles.** The tight turn limits make you plan what to bomb first and where to
   break through.
4. **Simple and readable**: one unit per hex, quick turns, rules learned in an hour.
5. **The emotional rhythm of combat.** The joy of an overrun and the dread of a rugged defense.
   When Panzer Corps 1 removed overrun, some players quit because grinding units down got
   tedious ([forum](https://forum.slitherine.com/viewtopic.php?p=243347)).
6. **Painted maps and readable unit icons.**

### Weaknesses players have named since 1997

- **No combat preview.** A 1997 review: you have to "do some calculations in your head", and
  moving adjacent to see the prediction already commits you. Strength 1-10 hides the effective
  strength, and ammo and fuel aren't visible at a glance
  ([review](https://people.well.com/user/derb/reviews/pgii.htm)). The remaster has the same gap.
- **Snowballing.** A good player ends the campaign with an army of overstrength veterans the AI
  no longer attacks. A weak player gets the opposite, a death spiral: losses eat the prestige,
  so there's none left for replacements, which brings more losses. The consensus in the Panzer
  Corps thread is that it can be softened, not removed
  ([forum](https://forum.slitherine.com/viewtopic.php?p=392340)).
- **Weak AI.** It turtles in towns, rarely softens targets before attacking and doesn't finish
  off crippled units. Difficulty comes from AI prestige and experience bonuses, not smarter play
  ([forum](https://forum.slitherine.com/viewtopic.php?p=239800)). For the remaster's AI see
  MECHANICS.md: no defense of its own objectives, no withdrawal, no look at the next turn.
- **Randomness that feels unfair.** A rugged defense turns an attack predicted at 0/-8 into -5/-5
  with no warning ([forum](https://forum.slitherine.com/viewtopic.php?p=789669)).
- **Rudimentary logistics.** Supply depends only on weather and adjacent enemies. An encircled
  unit suffers nothing until it surrenders on a retreat.
- **Missing quality of life**: no undo, combat animations that can't be skipped.
- **Turn limits divide players.** Some love the pressure, others call it artificial. Panzer Corps
  2 lets you switch them off
  ([dev diary](https://www6.slitherine.com/news/panzer-corps-2-dev-diary-427-09-18)).

### What its successors changed

**Panzer Corps (2011)** was designed by Alex Shargin, the author of the PG2 fan remake Panzer
General Forever. It shows combat predictions, with a "chess dice" option. Moving and firing can
be split, and recon gets staggered moves. It added heroes and cheaper upgrades within a unit
family, capped anti-tank range at 1, and had no overrun.

Fans complained that the predictions "lie"
([forum](https://forum.slitherine.com/viewtopic.php?p=250893)).

**Panzer Corps 2 (2020)**: "We are not trying to fix things which are not broken."

- **Undo.** Overrun is back.
- **Encirclement.** Encircled units take a combat penalty that grows every turn, instead of
  supply points. Kotaku called this "kinda broken".
- **Heroes.** Fewer, but stronger: about 50 abilities, up to 3 per unit, and they can be
  wounded.
  - Panzer Corps 1 had so many that "getting a new hero was not so exciting any more".
  - In PC2, three strong heroes on one unit get too strong.
- **Turn limits** can be switched off.

Critics were split: Metacritic 86, but RPS found it "a tough military puzzle game" more than a
simulation, and PC Gamer said it "truly excels in no particular category". Being faithful wins
fans, but it doesn't stand out ([Wikipedia PC2](https://en.wikipedia.org/wiki/Panzer_Corps_2)).

## What makes a good WW2 turn-based game

| Game | Praised for | Lesson |
|------|-------------|--------|
| Unity of Command 1/2 (its author started from PG) | Supply is the core mechanic: a unit out of supply weakens every turn and is gone after 3 | Encirclement as the decisive move, with no bookkeeping |
| Unity of Command 2 | Shows likely combat results, several ways to each objective | A scenario must not have a single solution |
| Panzer Corps 1/2 | Preview, undo, fewer but more interesting heroes | See above |
| Order of Battle: WW2 | Command points cap the units deployed; specialisation choices in the campaign; lost core units can be reformed (with little experience) | Brakes on snowballing |
| Into the Breach | Enemies telegraph their attacks; every loss is the player's own fault | Randomness must stay understandable |
| Advance Wars | A fixed matchup table, numbers in plain view | Readability over realism |
| Wargroove | Deterministic crits tied to position | Unit identity through position, not only stats |
| Battle Academy | Difficulty from scenario design (ambushes, spotting traps) | Scripting can carry a mediocre AI |
| Hearts of Iron IV, War in the East | Contrast: 500-page manuals, unreliable automation | Bad automation is worse than none |
| Memoir '44, Combat Commander | You can't order everything, you choose | Command limits as a decision engine |
| Columbia block games | The enemy's strength is hidden, not only their position | Recon has real value |
| OCS | Trace supply vs spendable offensive supply | Strong lever, but shows the bookkeeping ceiling |
| PanzerBlitz | Without reaction fire, players learned to hop from cover to cover | Keep PG's support fire |

Sources: [Unity of Command, Engadget](https://www.engadget.com/2011-12-24-the-joystiq-indie-pitch-unity-of-command.html),
[Uzelac interview](https://blog.kowatek.com/?p=61251),
[UoC2 review, Vice](https://www.vice.com/en/article/unity-of-command-2-review/),
[Order of Battle forum](https://forum.slitherine.com/viewtopic.php?p=546147),
[Into the Breach, Game Developer](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-),
[Advance Wars damage formula](https://advancewars.fandom.com/wiki/Damage_Formula),
[OCS](https://bigboardgaming.com/the-gamers-ocs-intro-and-review/)

Principles designers repeat:

- **"A game is a series of interesting decisions"** (Sid Meier). An obvious move, like
  refuelling every unit each turn, is a chore, not a decision.
- **Luck is "the alcohol of gaming"** (Soren Johnson). A little adds tension, too much ruins
  understanding. Many small rolls are fine; big outliers that contradict the forecast feel unfair
  ([Game Developer](https://www.gamedeveloper.com/game-platforms/analysis-soren-johnson-on-playing-the-odds)).
- **About 12-20 units and 6-12 turns per scenario** is the sweet spot (Tomislav Uzelac). With 50+
  units "it becomes really difficult to manage".
- **The AI should create problems, not always win** (Uzelac). Difficulty without cheating.
- **Tedium comes from**: too many units, long AI turns, no undo, no "who can still act" marker,
  hidden numbers, swingy outliers, death spirals in the campaign, rules creep.

## Directions for the remaster

From the safest to the most invasive to the spirit:

1. **Attack preview**: expected losses on both sides, the modifiers, and a "rugged defense
   possible" warning. The estimate exists already (`calculateCombatResults`, used by the AI).
   Changes readability, not rules.
2. **Quality of life**: cycle the units that can still act, warn on end turn with units left,
   faster AI turns, undo for a move with no combat or spotting.
3. **Better AI**: defend its objectives, withdraw damaged units, finish off weak ones. No
   cheating.
4. **Against snowballing and death spirals**: rising overstrength cost, reforming a lost unit
   with part of its experience, a gentler campaign branch after a defeat.
5. **Weather as the manual describes it**: rain and snow weaken ground attacks, ground the
   aircraft and cut spotting. Today only the ground condition matters.
6. **Encirclement as a mechanic**, Unity of Command style. The biggest change and the furthest
   from PG2; Panzer Corps 2 tried it and was criticised for it.

Every rule change shows in the harness comparison with the original (`reference/`), so each should be a
deliberate, separate step, possibly behind a classic/remaster rules switch.
