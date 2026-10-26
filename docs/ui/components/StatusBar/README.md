**In the port (#441):** the second row says what the old `#locmsg` said: the hex under the pointer (the unit there, the place, the transports, the terrain and road, "(row,col)"), not the selected unit; a refusal, the last combat's news, the strategic map's and deployment's lines come first.

The status bar is the one always-visible strip of game state. The top row has the side (nation mark, name and a side-color chip), the turn as `3/17`, the date, the weather, the ground, the rules the game plays (Remaster or Classic, #317: the save keeps them, so they never change in a running game), the prestige, a button for the unit list and a button for the turn report. The second row is the status message.

- Values are typed in Courier Prime and uppercase. The status message is Courier Prime 13/18 in `ink-muted`, with the unit name in `ink`.
- Weather (fair, overcast, rain, snow) and ground (dry, mud, frozen) each show an icon plus a word. The other states are shown below the bar.
- The bar is 720px wide, wider when its cells need it (the rules, a long country name), and never wider than the screen.
- The status message replaces `#statusmsg` and `#locmsg`. The weather icon replaces `#weathermsg`. The report button replaces `#combatLogButton`, and the unit list button replaces `#statusBarButton` (it opens the list without the equipment window, as today).
