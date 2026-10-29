**In the port (#441):** the reserve tray's header has no "N of M placed" count and no note: the old deployment list had neither.

Deploy mode: what the player sees when a campaign scenario starts with core units in reserve, or a later turn still has some (`uiShowDeploymentWindow`). Today it is grey hexes with a "Z" glyph and the unit list at the top. Nothing about the rules changes here.

**The zone.** Every hex whose `isDeployment` is the current player, including the supply cities that have no `deploy` attribute (`scenarioloader.ts` reads `supply` into `isDeployment`). In Ciechanow that is 13 hexes in three groups plus Neidenburg and Soldau.

- A free hex gets a brass tint with a light inner line. The whole group gets one brass outline over a dark under-stroke, so it reads on fields, forest and town alike.
- A hex that already holds a unit keeps the outline but loses the tint.
- Move and attack hexes are not drawn in deploy mode, as the old UI drew none (`render.ts` skipped them while `deployMode` was on, before #351).

**Placing.** The selected reserve unit is drawn at 55% on the hex under the pointer, with a white hex outline and a tag: "Place Pz IIIE · can't go back to the reserve". A click places it (`deployPlayerUnit`). There is no way to take a unit back to the reserve, so the tag says so. After a placement the next unit in the list is selected, as `updateEquipmentWindow` does today.

- An air unit takes the hex's air slot; a ground unit on an ocean deploy hex starts embarked (`deployPlayerUnit`). The tag then reads "Place Bf 109E · air" or "Place Infanterie · embarked".
- On touch: the first tap shows the ghost and the tag, the second tap on the same hex places it.

**The reserve tray.** In deploy mode `#container-unitlist` docks at the bottom, where unit info sits when a unit is selected (nothing is selected while deploying). The header counts "5 of 9 placed", says that units left in reserve can be placed next turn, and has Upgrade, which opens `#equipment` on the selected reserve unit. The tray closes by itself when the last unit is placed, as today.

With units left in reserve and the tray closed (Done), a Deploy button waits over End turn, as wide: the panel with a brass edge, not brass, and the count on a brass plate ("Deploy 2", its tooltip "2 units in reserve"). A click picks the first of them again. It stays clear of the unit line in the middle, and goes when the reserve is empty.

The status line says what a click will do: "Deploy · Pz IIIE, 7th Panzer · click a brass hex to place it · 4 in reserve". It replaces "Deploy (on map grey hexes) or upgrade your core units".

Keep `#container-unitlist`, `#hscroll-unitlist`, `#unitlist`, `#eqUserSel` and `deployunit`. The zone, the ghost and the outline are drawn on the canvas (`hexstyle.deploy`); the tag is a DOM element placed like `#gameToolTip`.
