The icon set that replaces the old `openpanzer` and `openpanzer-menu` icon fonts. Each icon is a 24px stroked SVG symbol drawn in `currentColor`, with square caps and miter joins.

- `components/bundle.js` injects the sprite once. Reference an icon with `<svg class="i"><use href="#pm-end-turn"/></svg>`. The classes `.i` (20px), `.i.sm` (16px) and `.i.lg` (24px) set the size. The stroke is always 2.
- Icons inherit the text color: `ink` by default, `accent-ink` when active, and `ok`, `low` or `critical` for supply states.
- Nation marks (`flag-de`, `flag-pl`, `flag-su`, `flag-gb`, `flag-us`, `flag-fr`, `flag-it`) are filled and keep their own colors. Use them with `<svg class="mark">`.
- The Axis is shown only by the Balkenkreuz (`flag-de`), as in the original game. Never add the swastika flag or SS runes, even for SS formations in campaign data.
- An icon-only button always has an `aria-label`. On touch layouts the rail shows the labels as text, because there is no hover to reveal a tooltip.
