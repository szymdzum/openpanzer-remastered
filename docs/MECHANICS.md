# Game mechanics

How the game plays, as the code does it (src/, 3.2.14 behavior), with the player's view first
and the numbers after. The [manual](https://nicupavel.github.io/openpanzer-manual/) describes
some rules the code doesn't have, see the end.

## Combat

An attack is one exchange: the attacker fires, the defender fires back at the same time
(`GameRules.calculateAttackResults`, gamerules.ts).

**Every strength point fires on its own.** A unit at strength 10 rolls a d20 ten times
(`getCombatKills`). Each roll at or above the hit threshold kills one strength point of the
other unit. A weak unit hits weakly: strength 4 deals about 40% of what strength 10 deals.

- Kill fraction `kF = attack value - defense value`. Above 4 it grows slower:
  `kF = 4 + (2kF - 8) / 5` (the PG2 formula).
- Each roll other than a 1 or a 20 adds kF. 1 always misses, 20 always hits.
- Hit threshold 15. It's 19 for artillery, level bombers, fortifications and ships firing at
  land: they hit less often, but nothing fires back at them from range.
- The estimate (the AI's, the attack cursor's and a future odds preview) uses no dice:
  `kills = (5 * clamp(kF + 21 - threshold, 1, 19) * strength + 50) / 100`, an integer division:
  the expected kills of the dice, rounded (#90).

**Which values fight.** Every unit has a target type: soft (infantry, trucks), hard (tanks),
air or naval. The attacker uses its attack against the defender's target type (soft, hard, air
or naval attack). Each side defends with ground defense (air defense against aircraft).

**Modifiers**, added to the attack (av) and defense (dv) values:

| Situation | Effect |
|-----------|--------|
| Close combat: infantry attacks into a city, forest, mountain or fortification hex, or attacks a fortification (`isCloseCombatTerrain`) | defender uses close defense; infantry defender makes the attacker use its close defense too, other defenders give the attacker +4 av |
| Defender in a city | defender +4 dv |
| A side standing in a river or stream without a road | the other side +4 av and +4 dv |
| Defender is artillery | attacker +3 dv |
| A ship and a submarine fight | the side that isn't the submarine uses its close defense (#88: the original only did it when the submarine attacked) |
| Entrenchment | + its level to dv (see below) |
| Infantry defending in close terrain, attacked by tanks, recon, anti-tank... (not infantry, artillery, air or naval) | entrenchment counts twice |
| Experience | +1 av and dv per 100 experience |
| Earlier attacks this turn on the defender | defender -2 dv per hit taken (not when attacked by artillery, fortifications or ships) |
| Ground vs ground, not close combat | range defense modifier: full at range, half when adjacent; anti-tank that moved loses it |
| Initiative (see below) | the higher side +4 dv and up to +4 av |
| Surprised attacker or rugged defense | attacker dv = 0, av halved |
| Leaders | see Leaders |

**Initiative** compares the two units' equipment initiative. The higher side (attacker on a
tie) gets +4 defense and +min(4, difference) attack. In practice: it takes fewer losses. The
remaster's rules (#14) cap both units' initiative with the defender's terrain
(`terrainInitiative`: city 1, forest 3, hill 5, clear none...) before comparing, as the manual
says ("the terrain of the defending unit"): in a city or forest a fast tank loses its edge, and
the attacker, winning ties, keeps +4 defense. The classic rules use the equipment's alone.

**Who can attack whom.** A unit fires on an enemy it sees within its gun range (range 0 is the
next hex), if it can start an attack on it: only a unit with an air attack fires on an aircraft
(`canInitiateAttack`). On the screen an aircraft of range 1 hits a ground unit only on the hex below
it, an aircraft on the next hex; the original's AI checks only the distance, so its aircraft hit a
ground unit on the next hex when an aircraft shares that hex. The remaster's rules (#285): as in PG2
("attacking from above", or from the next hex) an aircraft hits a ground unit below it or on the next
hex, for a person and the AI alike, and the core refuses an attack the screen doesn't list.

**The defender fires back** only when attacked from an adjacent hex (ships in gun range also
fire back at ships), and only if it can attack that target type and has ammo.

**Support fire.** Before an attack from an adjacent hex, the defender's artillery that has the
attacker within its gun range fires at the attacker (`getSupportFireUnits`). Against aircraft,
flak, air defense and fighters do it. Ranged attacks get no support fire. Your own artillery
protects your units the same way.

**After the combat:**

- Losses come off strength. Every hit also takes 1 entrenchment level and counts toward the -2
  dv per hit (`Unit.hit`).
- Retreat: a ground defender attacked by a ground unit (not artillery, tactical bombers or
  fortifications) that lost `0.6 - (10 - strength) / 20` of its strength or more retreats to a
  free hex behind it. Weaker units retreat sooner. With no free hex it surrenders.
- Overrun: a tank that destroys an adjacent defender with at most 1 loss and wasn't surprised
  takes no return fire and gets an extra move (map.ts). It is decided by the estimate before the
  dice (`calculateAttackResults(..., true)` in `uiUnitAttack`), so it can be predicted. The extra
  move is +1 to the moves left: it only lets the tank move again if it had some left. The attack
  doesn't count as the tank's fire, so it can attack again.
- Experience: both sides gain it, more for kills against stronger or better-defended enemies.
  The cap is 500 (`UNIT_MAX_EXPERIENCE`).

## Entrenchment

- A unit that doesn't move entrenches over the turns (`Unit` entrench, unit.ts), up to the
  terrain's base + 5. Experience and the unit class's entrench rate make it faster.
- Terrain base (`terrainEntrenchment`, core/tables.ts): fortification 4, city 3; forest,
  bocage, mountain and rough 2; hill and port 1; everything else 0.
- Moving out of the hex loses all of it. Every hit taken loses 1 level.
- Some equipment ignores entrenchment (engineers). The infiltration tactics and street fighter
  leaders ignore it in cities, rough terrain and ports.
- **Rugged defense** (`isRuggedDefense`): an adjacent attack on a defender whose entrenchment is
  intact turns into a rugged defense when its entrenchment, experience and class entrench rate
  are high enough against the attacker's experience and class rate. It is a formula, not a roll:
  `5 × (50 × dR / aR) × dRate × entrenchment / (50 × aRate) > 50`, with R = experience / 100 + 2
  (+2 with tenacious defense) and rate = the class entrench rate + 1. So it can be predicted
  before the attack. The attacker then has no defense and half its attack. This is where "why
  did I lose 6 points?" comes from.

So: bomb and shell first (no return fire, entrenchment and defense go down with every hit),
then assault, then overrun with tanks.

## Movement and zone of control

- Move cost per hex comes from the movement table of the unit's move method (tracked, wheeled,
  leg, towed, air, naval...) and the ground condition: dry, frozen or mud (`movTableDry`,
  `movTableFrozen`, `movTableMud`). Roads, and bridges for their owner's side, use the road cost.
  A move pays the hexes it enters, in movement points and fuel; the hex it leaves costs nothing
  (#70). A unit enters a hex only when its points and fuel left pay for it; a hex that uses all
  the points (254 in the tables: mountains, rivers...) takes any left, at least one, and ends the
  move (#205): it uses all of them, in points and fuel (#214).
- **Zone of control**: every unit except aircraft controls its 6 adjacent hexes, ships and
  fortifications included (`setZOCRange`). Entering a hex the mover's side spots that is in the
  enemy's ZOC stops the move (`getMoveRange`), whether or not the side sees the unit casting the
  zone: a hidden enemy's zone stops it too, as in the original (#282), so the move range can end
  next to a unit the player doesn't see. A hex the side doesn't spot doesn't stop it. The hex costs
  its terrain, and the unit has no points left (#214). Air units ignore ZOC. In the remaster's rules
  a recon unit ignores it, as the manual says (#4): it pays the hex's terrain cost and goes on (its
  split movement stays), and a hidden enemy still surprises it. The AI's moves, the path and the
  preview all read the same move range.
- Moving into a hidden enemy is a surprise: the combat goes badly and the move ends. The mover
  attacks the hidden unit of its own kind that stopped it (an aircraft the aircraft, a tank the
  ground unit), whatever the screen's air mode shows.
- Recon can split its movement over several moves in a turn, until a hex stops it.
- Fuel limits the range of units that use it. Towed units without a transport move 1 hex.
- A unit moved in its transport (mounted) can't fire that turn: towed artillery, anti-tank
  and air defense have to stay in place to fire (`Unit.move`).

## Spotting

Each unit spots its equipment's spot range around it (+2 elite recon veteran leader, +1
skilled reconnaissance). The spotting moves with the unit: the hexes it leaves are no longer
spotted by it (`setSpotRange`, in `moveUnit`), so an enemy seen on the way can disappear again.
Units newly spotted or that fire stay visible until the end of the round (`tempSpotted`), even
on hexes no one spots.

## Supply and reinforcement

Both need a unit that hasn't moved, attacked or already been supplied this turn
(`getResupplyValue`, `getReinforceValue`, `canReinforce`). Reinforcement checks it through
`hasOverstrength`, which moving and attacking set: a recon unit between two of its moves can
still reinforce.

- Full amount in a city with no adjacent enemy. Outside a city /1.3, with 1-2 adjacent enemies
  /1.5, with 3 or more /3. Resupply: air and naval units always get the full amount.
  Reinforcement: only air units do, naval units are divided like ground units. Air units
  resupply and reinforce next to an airfield, naval units in a port (#19: the original had it
  backwards, its ships took supplies anywhere at sea and never in port).
- At turn start, units in a city with no adjacent enemy are resupplied automatically, and so are
  ships in a port and aircraft at an airfield that didn't act.
- Reinforcing costs prestige, by the unit's cost per strength point.
- **Overstrength**: a unit at strength 10 with 100+ experience can reinforce over 10, one point
  per 100 experience.

## Experience and leaders

- One experience level per 100 (the stars). It adds to attack, defense and, through
  overstrength, to strength.
- A unit that goes up a level rolls for a leader: a roll from its level to 10 has to be above
  8, so higher levels get one more easily. At the experience cap it always gets one
  (`generateLeaderWithChance`).
- A leader gives two abilities: the class leader (the first in `unitClassLeaders` for the unit
  class) and a random one from that class's list (leaders.ts). They change the combat values,
  move range, spotting, entrenchment and kill rolls, e.g. aggressive attack +4 av +2 dv, first
  strike makes initiative always favor the unit, overwhelming attack +2 kF and +1 kill,
  resilience -2 kF for the enemy, aggressive maneuver +1 move.
- The original's roll never picks the last two leaders of a class's list (infiltration tactics and
  liberator for the ground classes, fire discipline for the guns, first strike for the fighters): only
  a scenario gives them. The remaster's rules (#78): any of the list can come up.

## Prestige and victory

- Prestige buys and upgrades units and pays for reinforcements. It comes from captured flags
  (50), objectives (150), the scenario's turn gains and the scenario outcome.
- Unit cost is the PG2 equipment cost x 12 (`CURRENCY_MULTIPLIER`), plus its transport.
- A bought unit waits in the reserve and deploys on a free deployment hex of its side's, which the
  scenario sets. A purchase is refused while the side has no free one for it (#60): 185 sides of the
  376 scenarios have none. The remaster's rules (#302): a side with no deployment hex deploys a ground
  unit on a city it owns, an aircraft on an airfield, a ship on a port, with no enemy unit it sees on
  it or next to it, for a person and the AI alike; it can buy while one is free for the unit.
- Victory: hold all the side's victory hexes (gold flags) before the turn limit. The sooner,
  the better: brilliant, victory or tactical, set per scenario. A campaign branches on the
  outcome and a brilliant victory can give a prototype unit (at least 200 prestige worth).
  Each victory hex is on the list of the side that has to take it, so a side whose list is empty
  holds them all and wins. In the original (the classic rules) that includes a defender that had
  none to take at the start (21 of the 376 scenarios have such a side) and retakes the one it lost.
  The remaster's rules (#91): only a side that had objectives to take at the start wins by capture,
  as PG2 gives each side victory hexes of its own in the enemy's hands; a defender that had none wins
  by holding out (#256).
- A side with no unit left on the map loses (elimination). The remaster's rules (#115): as in PG2, not
  while it has units waiting to deploy (bought, or a campaign's core units) or reinforcements to come.
- The turn limit, when neither side took all its objectives. In the original (the classic rules)
  the side that ended its last turn loses, whatever it holds, and the game ends at the last turn of a
  side that plays on the screen; in a campaign that is a defeat, which can end the campaign. The
  remaster's rules play PG2's (#256): the attacker, the side that had more objectives to take at the
  scenario's start, loses unless it took them all, and the defender wins by holding out, a tactical
  victory (the rating of the last turn), in a campaign too. The game ends once both sides have played
  their last turn, so the attacker plays all its turns. With as many objectives each at the start
  (50 of the 376 scenarios), or a save from before the start was kept, the side holding more
  objectives wins (#231); with as many each, nobody does.

## Weather

Only the ground condition has an effect: mud and frozen ground change the movement costs
(`Scenario` sets the movement table, scenario.ts). The atmospheric weather (fair, overcast,
rain, snow) is shown in the status bar and the turn summary but changes nothing in combat,
movement or spotting (`//TODO Weather` in `calculateAttackResults`).

## Tactics

What the rules above mean for playing a turn.

**Not everything moves first.** A unit moved in its transport can't fire that turn, so towed
artillery, anti-tank and air defense fire from where they stood since the last turn. Firing
doesn't stop a unit from moving afterwards (`getMoveRange` only checks `hasMoved`): fire
first, then reposition.

**A turn, in order:**

1. **Recon.** Reveal the ground before moving into it: a hidden enemy means a surprise combat
   and the end of the move. It also shows where the enemy artillery and air defense are.
2. **Artillery, from where it stands.** A ranged attack takes no return fire and no support
   fire, and every hit takes an entrenchment level. Shell the enemy artillery and air defense
   next to the target first, or they'll support it.
3. **Aircraft.** Bombers on the targets the artillery softened. Enemy flak, air defense and
   fighters in range fire at every air attack, so take them out or stay away from them.
4. **Ground assault, weakest attacker first.** Every attack on a unit, even one that kills
   nothing, lowers its defense by 2 and its entrenchment by 1 for the next non-artillery
   attackers. The strongest unit attacks last, into the lowest defense.
   - Infantry for cities, forests and mountains: close combat, where tanks are weak.
   - Tanks in the open, and to finish: destroying an adjacent unit with at most 1 loss is an
     overrun, with no return fire and an extra move.
5. **Occupy.** Move into the freed hexes and objectives. Put the artillery where it can fire
   next turn.
6. **Units that didn't move.** Reinforce and resupply them, best in a city with no enemy
   adjacent (outside a city or next to enemies they get 1.3 to 3 times less). The others stay
   put and entrench.

**Rules of thumb:**

- Don't assault a freshly entrenched unit unprepared: that's where rugged defense happens
  (attacker loses its defense and half its attack). Bring its entrenchment down first.
- Your artillery defends during the enemy's turn: it fires at anyone attacking a friendly unit
  from an adjacent hex within its gun range. Keep it behind the line, in range of your units.
- Concentrate on one target instead of spreading damage: heavy losses make a unit retreat, and
  a surrounded unit with nowhere to go surrenders.
- Keep the veterans: experience adds to every combat value, allows overstrength and brings
  leaders. Pull a damaged veteran back to a city and reinforce it rather than lose it.
- The gold flags win the battle, other towns only give prestige. Faster captures give a better
  victory.

## AI

The detail, the scores and the playtests are in docs/ai/; the code is src/core/ai.ts and
src/core/aiscore.ts.

`AI` (ai.ts) plans the whole turn once, at its start, by scoring options. It doesn't search
moves ahead and doesn't react to combat results during the turn.

1. Buys units with the prestige over a reserve of 1000, 30% of it for aircraft; infantry and
   towed guns with a ground transport when the budget left pays for one.
2. Deploys undeployed core units.
3. Orders its units: artillery, fortifications, combat aircraft and warships first. They attack
   what they can reach that turn, not to open the way for an assault (#233, #234).
4. For each unit, until it has nothing left to do: reinforce if weak (strength under 4) or
   idle, resupply if low (ammo under 2, fuel under 5) or idle, move, attack.
5. Move: scores every reachable hex (`getCellScore`) and goes to the best one if it beats
   staying. The score adds up, for example: free victory hex +600 for infantry (+350 tanks),
   infantry in close terrain +120, next to own artillery +100, river without road -70, hex not
   spotted by the enemy -40, distance to the nearest objective (4000 / distance), and the
   attacks possible from there.
6. Attack: the target with the best expected kills x target class value minus losses x own
   class cost, from `calculateCombatResults` as an estimate. +100 to finish a unit already
   attacked, +350 for a target on a victory hex. It skips attacks where it would lose more
   than strength / 2.5, and targets it already expects to be destroyed.
7. Every score is multiplied by a random 0.8-1.2, so it doesn't play the same twice.

What it doesn't do: defend its own objectives (`getObjectiveScore` has the option, no caller
uses it), withdraw damaged units, or think about the enemy's next turn. Known bugs are in
ROADMAP, Stable campaigns.

It also cheats a little: it scores attacks with `calculateCombatResults(..., withHiddenUnits =
true, ...)` (ai.ts), so it counts the support fire of the player's units hidden in the fog of
war.

The original's `AIScripted` is only the tutorial's scripted opponent.

### A cautious attacker, a weak defender

Every victory hex belongs to the side that has to capture it (`sidesVictoryHexes`, map.ts). In a
scenario where the player defends, the AI's side has the victory hexes to take. Its heuristics fit an
attack on paper (artillery and aircraft plan first, units stay next to their artillery, losing
attacks are skipped, attacked units get finished), but in play it attacks cautiously and
piecemeal. Every unit is pulled toward the one nearest objective by 4000 / distance, which loses to
the +50 per entrenchment level for staying; units arrive one or two at a time; nothing reads the
turn limit. In the first playtest the German AI took 1 of 5 objectives in 17 turns
(docs/ai/weak-attacker.md, docs/ai/playtests/).

When the player attacks, the AI's side usually has no victory hexes to capture, so the
objective score is 0 and only the terrain and the attack potential are left. Its units then
leave cities and entrenchments to attack whatever is in range (+50 per entrenchment level for
staying loses to the attacks possible elsewhere), and nothing reinforces a threatened city.
It defends only by counterattacking: a victory hex the player captures moves to the AI's list
of objectives (`updateVictorySides`, map.ts), and the AI goes to take it back. It never
garrisons one beforehand.

Where to improve it first, then: a score for holding a victory hex and an entrenchment, a
threat map of where the player can attack next turn, and withdrawing damaged units to cities.

## Difficulty

The difficulty doesn't change the AI: it plays the same at every level. Only campaigns have a
difficulty, single scenarios don't (`difficultyModifiers`, core/tables.ts):

| Level | Start prestige | Minimum prestige per turn | Turn limit | Score |
|-------|----------------|---------------------------|------------|-------|
| Historical (hardest) | as set | none | x1 | x1 |
| Tactical | +20% | 10% of the start prestige | x1.2 | x0.8 |
| Operational (easiest) | +50% | 25% of the start prestige | x1.5 | x0.5 |

The minimum prestige per turn is the campaign player's only (`newPlayer`, src/core/newgame.ts):
the AI's players get what the scenario gives them at every level (#15: the original gave the
minimum to every player, so an easier level made the AI richer).

The real difficulty is in the scenario files: the enemy's units, their entrenchment, its
prestige per turn and the turn limit.

## Manual vs code

The manual describes rules the code doesn't have (or a different version of them):

| Manual | Code |
|--------|------|
| Rain and snow halve ground attacks; no air attacks in overcast, rain or snow | No effect of the atmospheric weather at all |
| Bad weather reduces spotting | Spot range only from equipment and leaders |
| Recon ignores zone of control | Classic rules: ZOC stops every ground unit; recon only has split movement. The remaster's rules follow the manual (#4) |
| An attack preview shows the expected losses | The attack cursor shows the estimated losses under each side's flag (`drawGlance`, src/view/map/attackdraw.ts; the old renderer's `generateAttackCursor` until #351, which drew it on the hex on touch screens), without support fire, rugged defense or overrun |
| Initiative comes from equipment, terrain and experience | Equipment only in the classic rules; the remaster caps it with the defender's terrain (#14). Experience still doesn't change it (it gives +1 av and dv per level instead) |
| Maximum experience 600 | `UNIT_MAX_EXPERIENCE` is 500 |
| Units over 1000 experience always get a leader | Always at the cap (500) |
| Retreat above 60% losses | 60% at strength 10, less for weaker units |
