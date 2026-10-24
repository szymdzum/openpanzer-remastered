The single button style for every action in the game, from End turn to the close cross.

- `.pm-btn` is the secondary button: a `panel-raised` fill with a `line-strong` border and an uppercase `label`-style caption. It is at least `hit-target` (44px) in both directions.
- `.primary` is brass (`accent` with `on-accent` text). Use it for exactly one action per view: End turn, Buy new, Play, OK.
- `.icon` is square, for an icon-only button, and always has an `aria-label`. `.ghost` drops the fill and border, for toolbars inside panels. `.danger` sets the text in `critical`, for Disband and Sell.
- `.lg` is 52px tall, used for End turn and the start-menu items.
- A cost goes in `<span class="cost">`, typed in Courier Prime.
- **States.** Hot (hover, or the first tap on touch) uses `panel-sunken`. Pressed moves down 1px. Disabled is 50% opacity. Keyboard focus is a 2px `focus` ring with a 2px offset.
- The consumer provides the label, an optional icon from the sprite, and the click handler.
