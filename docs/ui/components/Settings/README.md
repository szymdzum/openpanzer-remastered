The settings window: appearance, sound, and map and gameplay switches, in two columns.

- Theme is the new switch between Paper and Blackout. System follows `prefers-color-scheme`. It sets `data-theme` on the game root and is stored with the other `uiSettings`.
- The three sliders (interface width, interface scale, map scale) show their value in type next to the track.
- Every boolean in `uiSettings` is a toggle row. A one-line hint appears where the effect isn't obvious, such as `noFOW` or the `useRetina` reload.
- Keep `#smSettings`, `#smSettingsContainer` and `#smSetOkBut`, and the setting keys as button ids.
