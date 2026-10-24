A switch for one boolean setting, such as fog of war, quick animations or muting sounds.

- The track is 56×28 inside a 44px hit area, with a near-square knob. Off is `panel-sunken` with the word OFF. On is `accent` with the word ON in `on-accent`.
- Use a `button` with `role="switch"` and `aria-checked`. Clicking the row label also toggles it.
- It replaces the old `openpanzer-menu` C/c checkbox glyphs (`.settingValue`).
