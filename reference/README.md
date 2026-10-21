# The reference

The original Panzer Marshal 3.2.14 that the harness compares this remaster with: its source
reconstructed from the shipped bundle as plain scripts (`src/`, readable names the harness hooks
into, where the minified `game/js/openpanzer.js` has none), the page that loads them
(`index.html`, `?harness&standalone`) and the harness hooks for it (`harness/lib/hooks.js`).
`game` links to this repo's `game/`: the assets are the same.

Copied from openpanzer-src at commit a2040d6 ("Reconstruct Panzer Marshal 3.2.14 source from its
bundle"). Don't change it: it is the measure. `harness/replay.sh`, `harness/ui-replay.sh` and
`test/contracts/record.sh` serve it on REFERENCE_PORT.
