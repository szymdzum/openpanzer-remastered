**Proposal: not built.** It would replace the stage 1 glance of AttackPreview (today's ring and two chips, `src/view/attackdraw.ts`), which dropped the flags of the old cursor.

The attack cursor: the old cursor's flags and losses, with each side's strength, kept off both units. On the target only a thin sight; the numbers in a header beside the target hex.

- **Sight.** On the target hex's centre, the reticle of a German tank sight (TZF) in the ring of its field of view: thin lines and three small chevrons in `hex-select` over a `hex-shadow` edge, the point of the middle chevron on the hex's centre. The unit shows through it.
- **Header.** One row clear of the target hex, on the side away from the attacker: under the target when it attacks from above (from the north, north-east or north-west), over it when it attacks from below. Neither unit is covered.
- **Flags.** Your flag, then theirs, from the equipment's flag strip (`flags_med.png`), as the map draws the towns' flags, but without the dark pixel of shadow each flag has at its right and bottom edge: 20 by 13 of its 21 by 14, at the map's scale.
- **Losses.** Beside each flag, that side's loss on a plate in `hex-select` (PG2's yellow) with `map-ink` type in Courier Prime: `−5`, or `0`. From `combatResult` (src/core/combat.ts), the numbers the cursor shows now: `losses` beside yours, `kills` beside theirs.
- **Strength.** Under each flag and plate, a strip of ten slots (more when the unit is overstrength): the points the side keeps in `map-paper-raised`, the points it loses in `hex-target`, the slots it doesn't have dim `hex-shadow`. A loss of 3 of 10 and 3 of 4 no longer look alike. From the unit's `strength` and the loss beside it.
- **Grabbing the target.** On reaching a target the sight closes on it: from 1.6 times its size and faint to its size in 0.15 s, ease-out. Nothing moves with reduced motion.
- **Size.** The header 82 by 18 at 100%, the sight 22 across, both growing with the Interface scale setting.
