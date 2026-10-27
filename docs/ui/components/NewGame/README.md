The start menu when there is nothing to continue: the first run, or after a game has ended. It replaces today's New Game panel (`#smNewGame`), the three buttons Campaigns, Scenarios and Tutorial whose descriptions are only in their `title`.

- Continue is not shown, so Campaign is the primary action.
- Each choice says what it is in one or two lines, taken from the descriptions in `buildStartMenu` and shortened. On a later visit, with a save to continue, the same choices shrink to one-line buttons (`StartMenu`).
- Tutorial says what it loads: `tutorial.xml`, the Battle of Minorca, 1939. The computer plays the first turns, then hands over.
- Load game opens `SaveLoad`.

Keep `#smMain`, `#smNewGame` and the button ids `newcampaign`, `newscenario`, `tutorial`, `saveload` and `settings`, which the old `startMenuButton` switched on and the end-to-end test clicks (`#smNewGameContent` went with the old UI in #351).
