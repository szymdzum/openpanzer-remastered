The first screen. The menu sits on a paper panel at the left, over the game's historical photographs, which are greyscale, slowly panned and tinted with `photo-tint`.

- The wordmark is set in `wordmark` (Zilla Slab 88/84) instead of the old raster logo, so it is sharp at any DPI.
- Continue is the primary action whenever a save exists, with the scenario and turn shown in the button. Otherwise New game › Campaign becomes primary (see `NewGame`).
- New game lists Campaign, Scenario and Tutorial directly, so the separate New Game panel (`#smNewGame`) is no longer a step of its own. Tutorial loads `tutorial.xml` (Battle of Minorca, 1939) with both sides scripted.
- The photographs cross-fade every 20s and pan over 60s, as in the original slideshow. With `prefers-reduced-motion` they are shown still.
- Keep `#startmenu`, `#smMain`, `#smLogo` and `#smCredits`. The Help and Issues links (`#smHelp`, `#smIssues`) become ghost icon buttons in the footer.
