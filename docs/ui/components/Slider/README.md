A native `input[type=range]` restyled. The track is a 6px well with a brass fill up to the value, and the thumb is a 14×26 paper tab.

- Set the fill with the custom property `--val` (a percentage) on input. Firefox uses `::-moz-range-progress` instead.
- The value is always repeated as text to the right, in Courier Prime (`1.0×`, `1366 px`).
- The hit area is 44px tall. The keyboard focus ring is the shared `focus` ring.
