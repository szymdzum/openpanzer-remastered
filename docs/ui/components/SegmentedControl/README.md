A row of mutually exclusive options that apply immediately, such as sort order, difficulty, theme or transport.

- The selected option is inverted, with `ink` fill and `panel-raised` text. The others use `ink-muted` text on `panel-raised`.
- Each option is 42px tall inside the 1px border, so the control as a whole meets the 44px target.
- Unavailable options stay in place, disabled, so the layout does not jump.
- Use `role="group"` with an `aria-label`, and `aria-pressed` on each option.
