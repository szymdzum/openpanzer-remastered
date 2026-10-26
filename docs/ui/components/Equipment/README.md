**In the port (#441):** the class tabs carry no model counts and none is disabled, the toolbar no "N models in service", the detail the picked model's stats with their bars but no difference to the unit's own (the old window showed an entry's stats alone), and the action bar no "prestige after". As the old window had none of them.

Buy new units and upgrade existing ones. From the top: the title, the country selector and the prestige balance; class tabs with counts; the sort control and the unit grid; the detail column comparing the picked model with the unit being upgraded; the transport selector; and the action bar with the prestige left after the action.

- **Grid cards.** Unit cards are index cards with a ruled line above the name. The selected card has a 2px `ink` border, and the model currently in use is tagged "Current".
- **Comparison.** Deltas are typed: `+4` in `ok`, a negative value in `critical`, and `=` when equal.
- **Actions.** Only Buy new is primary. Sell and Upgrade show their cost in Courier Prime.
- Keep `#equipment`, `#eqSelClass`, `#eqUnitList`, `#eqTransportList`, `#eqActionsContainer`, `#eqSelCountryButton`, `#currentPrestige`, `#eqCloseBut`, `#eqSellBut`, `#eqUpgradeBut`, `#eqNewBut` and `#eqSortOrderBut`.
