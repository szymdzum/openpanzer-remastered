Tabs switch a view inside one window: the unit class in the equipment window, or the list in the new-game window.

- Icon tabs (`.pm-tab` with an icon, caption and `.n` count) are 88×56. Text tabs (`.pm-tabs.text`) are 44px tall.
- The selected tab is raised to `panel-raised`, set in `ink`, and marked by a 3px `accent` bar on the bottom edge. Unselected tabs use `ink-muted`.
- A class with no models (count 0) is `disabled` but still shown, so the order of the classes never shifts.
- Use `role="tablist"`, `role="tab"` and `aria-selected` on the tabs.
