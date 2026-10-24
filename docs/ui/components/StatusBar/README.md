The status bar is the one always-visible strip of game state. The top row has the side (nation mark, name and a side-color chip), the turn as `3/17`, the date, the weather, the ground, the prestige, a button for the unit list and a button for the turn report. The second row is the status message.

- Values are typed in Courier Prime and uppercase. The status message is Courier Prime 13/18 in `ink-muted`, with the unit name in `ink`.
- Weather (fair, overcast, rain, snow) and ground (dry, mud, frozen) each show an icon plus a word. The other states are shown below the bar.
- The status message replaces `#statusmsg` and `#locmsg`. The weather icon replaces `#weathermsg`. The report button replaces `#combatLogButton`, and the unit list button replaces `#statusBarButton` (it opens the list without the equipment window, as today).
