One row of a selectable list: campaigns, scenarios, saved games and settings sections.

- A row is at least 52px tall: the nation mark, a `body-strong` title, a `small` meta line in `ink-muted`, and an optional right-aligned value.
- The selected row (`.is-on`) is `panel` with a 4px `accent` bar on its left edge. The hot row (hover or the first tap) is `panel`.
- Group headers inside the list use the `label` style. Campaigns and scenarios are grouped by side.
- Use `role="listbox"` with `role="option"` and `aria-selected` on the rows. Arrow keys move the selection.
