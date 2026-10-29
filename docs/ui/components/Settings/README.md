The settings window: appearance, sound, and map and gameplay switches, in two columns.

- Theme is the new switch between Paper and Blackout. System follows `prefers-color-scheme`. It sets `data-theme` on the game root and is stored with the other `uiSettings`.
- The three sliders (interface width, interface scale, map scale) show their value in type next to the track.
- **Rules** for new games, Remaster or Classic, as a segmented control (`#classicRules`): today's toggle "New games play the classic rules" (`uiSettings.classicRules`, `newGameRules` in `src/app/settings.ts`, #53). Remaster is the default. A game plays the rules it started with to its end, and the save keeps them (`rules` in `src/app/save.ts`), so the switch never changes a running game. Which rules the running game plays is shown with the scenario, not here (#317).
- Every other boolean in `uiSettings` is a toggle row. A one-line hint appears where the effect isn't obvious, such as `noFOW` or the `useRetina` reload.
- Keep `#smSettings`, `#smSettingsContainer` and `#smSetOkBut`, and the setting keys as button ids.
